#!/usr/bin/env node
/**
 * PROVA da CHEGADA AUTOMÁTICA (PR10082026) — os 3 fios que a fusão de 07/08
 * cortou e o app nunca mais teve.
 *
 *     node scripts/prova-chegada.js
 *     node scripts/prova-chegada.js --antes    (só MEDE, não reprova)
 *
 * Mesma receita do `prova-fluxo-rota.js`: dirige o `ponte.js` DE VERDADE contra
 * um servidor dublado. Duas diferenças que este assunto exige:
 *
 * 🔴 O GPS É DO PLAYWRIGHT, NÃO UM DUBLÊ MEU. `permissions:['geolocation']` +
 *    `geolocation:{accuracy}` fazem o `watchPosition` da ponte receber fix de
 *    verdade, COM precisão. Dublar o `navigator.geolocation` na mão provaria o
 *    meu dublê: o campo que este arquivo existe pra defender (`accuracy`) é
 *    justamente o que um stub caseiro entregaria de graça.
 *
 * 🔴 O `window.HBX` CONTA AS CHAMADAS NATIVAS. `activateRoute`/`stopRoute` não
 *    devolvem nada e não pintam nada — a única prova de que o geofence foi
 *    armado é o registro do que foi entregue ao Kotlin, com o corpo dentro.
 */
const path = require('path');
const { chromium } = require('playwright');
const { regenerarGerados } = require('./_regenerar');

const APP = 'file:///' + path
  .join(__dirname, '..', 'EntregaShell/app/src/logistica/assets/app/index.html')
  .replace(/\\/g, '/');

const HOJE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

/* A PORTA DA PARADA 1 — é onde o Playwright vai pôr o motorista. O raio do
   geofence é do Kotlin (não roda aqui): esta prova mede o que o app ENTREGA
   pro nativo e o que ele faz quando o nativo responde, que é a parte que a
   fusão quebrou. */
const PORTA1 = { lat: -22.4000, lng: -47.5500 };

const PONTE = ({ hoje, entregas, routeStatus, raioChegadaM, financeiro }) => {
  window.__chamadas = [];
  window.__nativas = [];
  window.__erros = [];
  window.addEventListener('unhandledrejection', (e) => {
    window.__erros.push(String((e.reason && (e.reason.stack || e.reason.message)) || e.reason));
  });

  const S = {
    hoje,
    routeStatus: routeStatus || '',
    entregas: (entregas || []).map((e) => JSON.parse(JSON.stringify(e))),
    raioChegadaM: raioChegadaM || 60,
    financeiro: !!financeiro,
  };
  window.__S = S;

  const abertas = () => S.entregas.filter((e) => e.status !== 'entregue' && e.status !== 'cancelada');

  /* O HBX REAL (native.js) já existe aqui; trocamos o objeto inteiro DEPOIS do
     boot, como manda a receita. O que este dublê acrescenta ao de sempre são as
     duas portas nativas da rota — e elas guardam o CORPO, porque "chamou
     activateRoute" não prova nada quando o defeito é a parada errada dentro. */
  const antigo = window.HBX || {};
  window.HBX = Object.assign({}, antigo, {
    activateRoute(payload) { window.__nativas.push(['activateRoute', payload]); },
    stopRoute() { window.__nativas.push(['stopRoute', null]); },
    requestLocationPermission() { window.__nativas.push(['requestLocationPermission', null]); },
    api(caminho, opcoes) {
      const metodo = (opcoes && opcoes.method) || 'GET';
      const corpo = (opcoes && opcoes.body) || null;
      window.__chamadas.push([metodo, String(caminho).split('?')[0], corpo]);
      const R = (v) => Promise.resolve(JSON.parse(JSON.stringify(v)));

      if (caminho.indexOf('/logistica/config') === 0) {
        return R({
          modoRotaPadrao: 'essencial',
          appModulosDesativados: '',
          raioChegadaM: S.raioChegadaM,
          moduloFinanceiroAtivo: S.financeiro,
        });
      }
      if (caminho.indexOf('/logistica/rota/custo-preview') === 0) {
        return R({ creditosAIniciar: 1.2, saldoAtual: 9340, saldoCobre: true });
      }
      if (caminho.indexOf('/logistica/fechamento/resumo') === 0) {
        return R({ fechamento: { totalCents: 0, formas: [] } });
      }
      if (caminho.indexOf('/credits/me') === 0) return R({ saldo: 9340 });
      if (caminho.indexOf('/logistica/agenda') === 0) return R({ dias: [] });
      /* A ficha do cliente: o `abrirCliente` pede o detalhe por id. Dublê que
         responde vazio deixaria a tela abrir em branco e a prova mediria o
         MEU buraco em vez do app. */
      const mCli = /^\/nucleo\/clientes\/([^/?]+)/.exec(caminho);
      if (mCli) {
        const dono = S.entregas.map((e) => e.cliente).find((c) => c && c.id === mCli[1]);
        return R(dono ? {
          id: dono.id, name: dono.nome, isCliente: true,
          endereco: dono.endereco, cidade: dono.cidade, lat: dono.lat, lng: dono.lng,
        } : {});
      }
      if (caminho.indexOf('/nucleo/clientes') === 0) return R({ items: [] });
      if (caminho.indexOf('/logistica/cliente-produtos') === 0) return R({ items: [] });

      // o desfecho: fecha a entrega no servidor dublado (o corpo já foi guardado)
      const mConf = /^\/logistica\/entregas\/([^/]+)\/confirmar/.exec(caminho);
      if (mConf) {
        const alvo = S.entregas.find((e) => e.id === mConf[1]);
        if (alvo) { alvo.status = 'entregue'; }
        return R({ ok: true });
      }
      const mCanc = /^\/logistica\/entregas\/([^/]+)\/cancelar/.exec(caminho);
      if (mCanc) {
        const alvo = S.entregas.find((e) => e.id === mCanc[1]);
        if (alvo) { alvo.status = 'cancelada'; }
        return R({ ok: true });
      }
      if (caminho.indexOf('/logistica/entregas/') === 0 && /\/chegando/.test(caminho)) {
        return R({ ok: true });
      }

      if (caminho.indexOf('/logistica/rota') === 0) {
        return R({
          date: S.hoje,
          total: abertas().length,
          routeStatus: S.routeStatus,
          // a bagagem do rastreamento que o activateRoute tem que repassar
          routeId: S.routeStatus === 'ACTIVE' ? 'rota-op-1' : null,
          trackingRequired: false,
          trackingSessionId: null,
          moduloFinanceiroAtivo: S.financeiro,
          avisoChegandoAtivo: false,
          avisoChegandoDistanciaM: 500,
          items: S.entregas.map((e) => JSON.parse(JSON.stringify(e))),
        });
      }
      return R({});
    },
  });
};

/* ── as paradas: 1 e 2 com pino, 3 SEM pino (nunca pode virar alvo) ───────── */
const P1 = {
  id: 'e1', status: 'agendada', rotaOrdem: 1, origem: 'recorrente', valorHoje: 12,
  itens: [{ id: 'i1', qtdPrevista: 2, valorUnit: 6, produto: { id: 'p1', nome: 'Galao 20L' } }],
  cliente: { id: 'c1', nome: 'Gislaine', endereco: 'Rua 3a, 1354', cidade: 'Rio Claro', lat: PORTA1.lat, lng: PORTA1.lng },
};
const P2 = {
  id: 'e2', status: 'agendada', rotaOrdem: 2, origem: 'recorrente', valorHoje: 18,
  itens: [{ id: 'i2', qtdPrevista: 3, valorUnit: 6, produto: { id: 'p1', nome: 'Galao 20L' } }],
  cliente: { id: 'c2', nome: 'Ademir', endereco: 'Av. 28a, 507', cidade: 'Rio Claro', lat: -22.4100, lng: -47.5600 },
};
const P3_SEM_PINO = {
  id: 'e3', status: 'agendada', rotaOrdem: 3, origem: 'recorrente', valorHoje: 6,
  itens: [{ id: 'i3', qtdPrevista: 1, valorUnit: 6, produto: { id: 'p1', nome: 'Galao 20L' } }],
  cliente: { id: 'c3', nome: 'Zeca sem porta', endereco: 'Rua 19, 880', cidade: 'Rio Claro', lat: null, lng: null },
};

const ok = [];
const falhou = [];
const notas = [];
const eh = (nome, cond, detalhe) => (cond ? ok : falhou).push(nome + (cond || !detalhe ? '' : `  [${detalhe}]`));
const nota = (t) => notas.push(t);
const SO_MEDIR = process.argv.includes('--antes');

(async () => {
  /* 🔴 O GERADO PRIMEIRO (LOTE 1.4): esta prova abre `assets/app/**`, que é
     SAÍDA de `ponte-costurar`/`casca-injetar`. Sem regenerar, ela mede o
     gerado que estiver no disco — e um red-first feito na FONTE sai VERDE
     sobre código velho. Ver `scripts/_regenerar.js`. */
  regenerarGerados();
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width: 412, height: 940 },
    // 🔴 O GPS DE VERDADE, com a PRECISÃO dentro. É o campo que a F1 defende.
    permissions: ['geolocation'],
    geolocation: { latitude: PORTA1.lat, longitude: PORTA1.lng, accuracy: 12 },
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => falhou.push('ERRO DE PAGINA: ' + e.message));

  const cena = async (estado) => {
    await p.goto(APP);
    await p.waitForTimeout(400);
    await p.evaluate(PONTE, Object.assign({ hoje: HOJE }, estado || {}));
    await p.waitForTimeout(3200);
    await p.evaluate(() => window.dispatchEvent(new Event('focus')));
    await p.evaluate(() => window.HBXRota && window.HBXRota.carregar());
    await p.waitForTimeout(900);
    // o boot para na ABERTURA; a tela que esta prova mede é a Rota
    // o boot para na ABERTURA. A tela Rota e o MAPA; a lista de paradas (onde
    // se toca no cartao) e a 'rotalista' — um toque no botao Lista da barra.
    await p.evaluate(() => window.ir('rota'));
    await p.waitForTimeout(500);
    await p.evaluate(() => window.ir('rotalista'));
    await p.waitForTimeout(700);
  };

  const irPara = async (tela, ms) => {
    await p.evaluate((t) => window.ir(t), tela);
    await p.waitForTimeout(ms || 900);
  };

  const espiar = () => p.evaluate(() => ({
    tela: (function () { try { return atual; } catch (e) { return null; } })(),
    nStops: document.querySelectorAll('.stops .stop').length,
    tituloVenda: (document.querySelector('.stop-top strong, .body strong') || {}).textContent || '',
    corpo: (document.querySelector('.body') || {}).textContent || '',
    statusNoServidor: window.__S.entregas.map((e) => `${e.id}:${e.status}`).join(','),
  }));
  const nativas = () => p.evaluate(() => window.__nativas.map((n) => [n[0], n[1]]));
  const postsDe = (rota) => p.evaluate((r) => window.__chamadas
    .filter((c) => c[0] === 'POST' && c[1] === r).map((c) => c[2]), rota);
  const zerarNativas = () => p.evaluate(() => { window.__nativas = []; });
  const chegar = (id) => p.evaluate((d) => {
    document.dispatchEvent(new CustomEvent('hbx:arrival', { detail: { deliveryId: d } }));
  }, id);

  /* ===================================================================
     F1 — A PRECISÃO VIAJA NO CONFIRMAR
     Sem `accuracy` o servidor (`gpsDeOuro`, teto de 60 m) descarta a
     coordenada CALADO e o pino do cliente nunca converge. Era o estado
     do app desde 07/08.
     =================================================================== */
  await cena({ entregas: [P1, P2], routeStatus: 'ACTIVE' });
  const t0 = await espiar();
  nota(`[F1] rota carregada: tela=${t0.tela} · paradas=${t0.nStops}`);
  await p.evaluate(() => document.querySelector('[data-acao="abrir-parada"]').click());
  await p.waitForTimeout(700);
  const t1 = await espiar();
  nota(`[F1] folha aberta no toque: tela=${t1.tela} · titulo="${t1.tituloVenda.trim().slice(0, 40)}"`);
  // o desfecho: o botão de confirmar da folha simples
  await p.evaluate(() => {
    const alvo = [...document.querySelectorAll('[data-acao]')]
      .find((e) => /^(confirmar-venda|entregue-pagou)$/.test(e.dataset.acao || ''));
    if (!alvo) throw new Error('sem botao de confirmar na folha: ' + [...document.querySelectorAll('[data-acao]')].map((e) => e.dataset.acao).join(','));
    alvo.click();
  });
  await p.waitForTimeout(1200);
  const corpoConf = (await postsDe('/logistica/entregas/e1/confirmar'))[0] || {};
  nota(`[F1] corpo do confirmar: ${JSON.stringify(corpoConf)}`);
  eh('F1.1 · o confirmar leva a COORDENADA', Number.isFinite(corpoConf.lat) && Number.isFinite(corpoConf.lng),
    `lat=${corpoConf.lat} lng=${corpoConf.lng}`);
  eh('F1.2 · o confirmar leva a PRECISAO (sem ela o pino nunca se corrige)',
    Number.isFinite(corpoConf.accuracy), `accuracy=${corpoConf.accuracy}`);
  eh('F1.3 · a precisao passa no crivo do servidor (gpsDeOuro: <= 60 m)',
    Number.isFinite(corpoConf.accuracy) && corpoConf.accuracy <= 60, `accuracy=${corpoConf.accuracy}`);
  eh('F1.4 · a chegada continua carimbada no desfecho', typeof corpoConf.arrivedAt === 'string' && corpoConf.arrivedAt.length > 0,
    `arrivedAt=${corpoConf.arrivedAt}`);

  /* ===================================================================
     F2 — O GEOFENCE É ARMADO (e desarmado)
     O motor nativo está inteiro desde sempre; ninguém o chamava.
     =================================================================== */
  await cena({ entregas: [P1, P2, P3_SEM_PINO], routeStatus: 'ACTIVE', raioChegadaM: 60 });
  const nat = await nativas();
  const armar = nat.filter((n) => n[0] === 'activateRoute');
  const ult = armar.length ? armar[armar.length - 1][1] : null;
  nota(`[F2] nativas na rota rodando: ${nat.map((n) => n[0]).join(',') || '(nenhuma)'}`);
  nota(`[F2] payload do activateRoute: ${JSON.stringify(ult)}`);
  eh('F2.1 · rota RODANDO arma o geofence nativo', armar.length > 0, `chamadas=${nat.map((n) => n[0]).join(',')}`);
  eh('F2.2 · o raio entregue e o da config da empresa', !!ult && Number(ult.raioM) === 60, `raioM=${ult && ult.raioM}`);
  eh('F2.3 · so parada com PINO vira alvo (a sem pino fica fora)',
    !!ult && Array.isArray(ult.paradas) && ult.paradas.length === 2 && !ult.paradas.some((x) => x.id === 'e3'),
    `paradas=${ult && JSON.stringify((ult.paradas || []).map((x) => x.id))}`);
  eh('F2.4 · o alvo leva id, nome e a coordenada da porta',
    !!ult && (ult.paradas || []).every((x) => x.id && x.nome && Number.isFinite(x.lat) && Number.isFinite(x.lng)),
    `primeiro=${ult && JSON.stringify((ult.paradas || [])[0])}`);
  eh('F2.5 · a rota operacional viaja junto (o modo TRACKED depende dela)',
    !!ult && ult.routeId === 'rota-op-1', `routeId=${ult && ult.routeId}`);

  // o desfecho ENCOLHE os alvos: parada fechada não pode seguir apitando
  await zerarNativas();
  await p.evaluate(() => document.querySelector('[data-acao="abrir-parada"]').click());
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    const alvo = [...document.querySelectorAll('[data-acao]')]
      .find((e) => /^(confirmar-venda|entregue-pagou)$/.test(e.dataset.acao || ''));
    if (alvo) alvo.click();
  });
  await p.waitForTimeout(1400);
  const natDepois = await nativas();
  const armarDepois = natDepois.filter((n) => n[0] === 'activateRoute');
  const ultDepois = armarDepois.length ? armarDepois[armarDepois.length - 1][1] : null;
  nota(`[F2] apos o desfecho: ${JSON.stringify(ultDepois && (ultDepois.paradas || []).map((x) => x.id))}`);
  eh('F2.6 · parada entregue SAI dos alvos (sem re-apitar na porta fechada)',
    !!ultDepois && !(ultDepois.paradas || []).some((x) => x.id === 'e1'),
    `paradas=${ultDepois && JSON.stringify((ultDepois.paradas || []).map((x) => x.id))}`);

  // rota que NÃO está na rua não pode deixar GPS ligado no bolso
  await cena({ entregas: [P1, P2], routeStatus: '' });
  const natParada = await nativas();
  nota(`[F2] nativas com a rota parada: ${natParada.map((n) => n[0]).join(',') || '(nenhuma)'}`);
  eh('F2.7 · rota fora da rua NAO arma o geofence',
    !natParada.some((n) => n[0] === 'activateRoute'), natParada.map((n) => n[0]).join(','));
  eh('F2.8 · rota fora da rua DESARMA o servico (stopRoute)',
    natParada.some((n) => n[0] === 'stopRoute'), natParada.map((n) => n[0]).join(','));

  /* ===================================================================
     F3 — O `hbx:arrival` ABRE O CARTÃO SOZINHO (F3.1/F3.2 mudaram de
     CONTRATO no LOTE 3, 15/08: a chegada não abre mais a folha direto — abre
     a peça `.chegou-wrap`, por cima do palco onde o motorista já está, SEM
     trocar de tela. "Registrar entrega" é quem leva pra folha, e é o MESMO
     roteador de sempre — zero código novo ali). O Kotlin dispara o evento
     desde sempre (MainActivity.entregarChegada); o app novo nunca teve
     ouvinte.
     =================================================================== */
  await cena({ entregas: [P1, P2], routeStatus: 'ACTIVE' });
  // o cartão só monta com o motorista num dos 2 palcos (rota=2D · mapa=3D);
  // `cena()` termina na lista (`rotalista`), então entra na rota antes.
  await irPara('rota', 600);
  await chegar('e2');
  await p.waitForTimeout(800);
  const t3 = await espiar();
  const cartao3 = await p.evaluate(() => {
    const b = document.querySelector('.chegou-wrap [data-acao="abrir-parada"]');
    return {
      existe: !!document.querySelector('.chegou-wrap'),
      parada: b ? b.dataset.parada : null,
      texto: (document.querySelector('.chegou-cartao') || {}).textContent || '',
    };
  });
  nota(`[F3] chegou na e2: tela=${t3.tela} · cartao=${cartao3.existe} · parada=${cartao3.parada}`);
  eh('F3.1 · a chegada ABRE O CARTÃO sozinho (sem toque), sem trocar de tela',
    cartao3.existe && t3.tela === 'rota', `tela=${t3.tela} cartao=${cartao3.existe}`);
  eh('F3.2 · o cartão é do cliente CERTO',
    cartao3.parada === 'e2' && /Ademir/.test(cartao3.texto), `parada=${cartao3.parada} texto="${cartao3.texto}"`);

  // "Registrar entrega" do cartão é quem abre a folha — a MESMA porta de sempre.
  await p.evaluate(() => document.querySelector('.chegou-wrap [data-acao="abrir-parada"]').click());
  await p.waitForTimeout(700);
  const t3b = await espiar();

  // chegada com folha JÁ aberta não pode roubar a tela no meio de outra venda
  const telaAntes = t3b.tela;
  await chegar('e1');
  await p.waitForTimeout(700);
  const t4 = await espiar();
  nota(`[F3] chegada com folha aberta: tela=${t4.tela} · ainda "Ademir"=${/Ademir/.test(t4.corpo)}`);
  eh('F3.3 · chegada NAO troca a folha que ja esta aberta',
    (t4.tela === 'venda' || t4.tela === 'folha') && t4.tela === telaAntes && /Ademir/.test(t4.corpo),
    `tela=${t4.tela}`);

  // chegada de parada já fechada é ruído: ignora calado
  await cena({ entregas: [Object.assign({}, P1, { status: 'entregue' }), P2], routeStatus: 'ACTIVE' });
  const t5a = await espiar();
  await chegar('e1');
  await p.waitForTimeout(700);
  const t5 = await espiar();
  nota(`[F3] chegada em parada ENTREGUE: tela ${t5a.tela} -> ${t5.tela}`);
  eh('F3.4 · chegada em parada ja fechada nao abre nada', t5.tela === t5a.tela, `tela=${t5.tela}`);

  // chegada com a rota fora da rua (o serviço pode sobreviver a um restart)
  await cena({ entregas: [P1, P2], routeStatus: '' });
  const t6a = await espiar();
  await chegar('e1');
  await p.waitForTimeout(700);
  const t6 = await espiar();
  nota(`[F3] chegada com rota parada: tela ${t6a.tela} -> ${t6.tela}`);
  eh('F3.5 · chegada sem rota na rua nao abre nada', t6.tela === t6a.tela, `tela=${t6.tela}`);

  // id que não existe na rota do dia: nunca pode explodir
  await cena({ entregas: [P1, P2], routeStatus: 'ACTIVE' });
  await chegar('fantasma-999');
  await p.waitForTimeout(500);
  const erros = await p.evaluate(() => window.__erros);
  eh('F3.6 · chegada de parada fantasma nao quebra o app', erros.length === 0, erros.join(' | '));

  /* ===================================================================
     F4 - A BARRA DA NAVEGACAO: numeros em cima, acoes embaixo
     Ordem do dono (10/08). O "Registrar" e a porta da RUA: os tres casos
     que o geofence nao alcanca - cliente fora do dia, cliente que nao
     existe no cadastro, e a porta com PINO ERRADO (essa o raio nunca
     acha, porque ele e medido a partir do pino torto).
     =================================================================== */
  await cena({ entregas: [P1, P2], routeStatus: 'ACTIVE' });
  await irPara('mapa', 1200);
  /* Os numeros da viagem saem do OSRM, que aqui nao existe - e pela Lei do IF
     slot sem fonte SOME da tela. Injetar pelo seam e o unico jeito honesto de
     medir ONDE eles ficam: sem isto a assercao passaria verde numa barra que
     nao tem numero nenhum. */
  await p.evaluate(() => window.usarDados('gps', {
    chegada: '05:08', chegadaRotulo: 'chegada',
    restante: '2 h 10', restanteRotulo: 'restante',
    distancia: '73,5 km', distanciaRotulo: 'distancia',
  }));
  await p.waitForTimeout(500);
  const barra = await p.evaluate(() => ({
    atalhos: [...document.querySelectorAll('.gps-encerrar button')].map((e) => (e.textContent || '').trim()),
    principal: document.querySelectorAll('.gps-encerrar-main[data-ir="fechamento"]').length,
    extras: document.querySelectorAll('.gps-acoes-extra button').length,
    numerosForaDasAcoes: document.querySelectorAll('.gps-rodape .linha:not(.acoes) .n').length,
    numerosDentroDasAcoes: document.querySelectorAll('.gps-encerrar .n').length,
    sairNaDireita: (() => {
      return !!document.querySelector('.gps-encerrar .gps-sair[data-ir="rota"]');
    })(),
    mortos: [...document.querySelectorAll('.gps-encerrar button')]
      .filter((e) => !e.dataset.acao && !e.dataset.ir).length,
  }));
  nota(`[F4] barra: ${JSON.stringify(barra.atalhos)} - numeros fora das acoes=${barra.numerosForaDasAcoes}`);
  eh('F4.1 . o cartao tem as TRES opcoes expostas (encerrar + Registrar + Sair)',
    barra.atalhos.length === 3 && barra.principal === 1 && barra.extras === 0,
    JSON.stringify(barra.atalhos));
  eh('F4.2 . os numeros ficam na linha de CIMA (numero se le, botao se aperta)',
    barra.numerosForaDasAcoes === 3 && barra.numerosDentroDasAcoes === 0,
    `fora=${barra.numerosForaDasAcoes} dentro=${barra.numerosDentroDasAcoes}`);
  eh('F4.3 . o Sair continua no canto direito', barra.sairNaDireita);
  // A LEI DO ARQUIVO: botao desenhado sem gancho e pior que botao ausente.
  eh('F4.4 . nenhum dos tres e botao MORTO', barra.mortos === 0, `mortos=${barra.mortos}`);

  await p.evaluate(() => document.querySelector('[data-acao="registrar-local"]').click());
  await p.waitForTimeout(700);
  const port = await p.evaluate(() => ({
    titulo: (document.querySelector('.portao h3') || {}).textContent || '',
    sub: (document.querySelector('.portao .sub, .portao p') || {}).textContent || '',
    botoes: [...document.querySelectorAll('.portao .acoes button')].map((e) => [(e.textContent || '').trim(), e.dataset.acao || '']),
  }));
  nota(`[F4] portao: "${port.titulo}" - sub="${port.sub}" - ${JSON.stringify(port.botoes)}`);
  eh('F4.5 . o Registrar abre a escolha', /Registrar este local/i.test(port.titulo), port.titulo);
  eh('F4.6 . a precisao do GPS aparece (registro sem local nao promete nada)',
    /GPS/i.test(port.sub), port.sub);
  eh('F4.7 . a escolha oferece as tres saidas com acao PROPRIA',
    port.botoes.filter((b) => b[1]).length === 3, JSON.stringify(port.botoes));
  eh('F4.8 . a saida de corrigir diz o NOME da porta da vez',
    port.botoes.some((b) => /Gislaine/.test(b[0])), JSON.stringify(port.botoes.map((b) => b[0])));

  await p.evaluate(() => document.querySelector('[data-acao="registrar-cadastrar"]').click());
  await p.waitForTimeout(1400);
  const t7 = await espiar();
  nota(`[F4] cadastrar -> tela=${t7.tela}`);
  eh('F4.9 . "Cadastrar cliente novo" cai no cadastro de verdade', t7.tela === 'novocliente', `tela=${t7.tela}`);

  await cena({ entregas: [P1, P2], routeStatus: 'ACTIVE' });
  await irPara('mapa', 1200);
  await p.evaluate(() => document.querySelector('[data-acao="registrar-local"]').click());
  await p.waitForTimeout(600);
  await p.evaluate(() => document.querySelector('[data-acao="registrar-corrigir"]').click());
  await p.waitForTimeout(1600);
  const t8 = await espiar();
  /* O nome mora no CAMPO do formulario, nao no texto solto da tela: a ficha e
     um editor, e e o valor do input que prova que abriu no cliente certo. */
  const nomeNaFicha = await p.evaluate(() => {
    const c = document.querySelector('[data-campo="nome"]');
    return c ? String(c.value || '') : '';
  });
  nota(`[F4] corrigir -> tela=${t8.tela} - nome no campo="${nomeNaFicha}"`);
  eh('F4.10 . "Corrigir" abre a FICHA do cliente da porta',
    t8.tela === 'ficha' && /Gislaine/.test(nomeNaFicha), `tela=${t8.tela} nome=${nomeNaFicha}`);

  await cena({ entregas: [P1, P2], routeStatus: 'ACTIVE' });
  /* O acesso ao Fechamento mora hoje na Rota, não dentro do GPS 3D. */
  await irPara('rota', 1200);
  /* "Finalizar" deixou o rodapé do GPS e hoje é o satélite direito da Rota.
     Ele só ABRE o Fechamento; fechar o dia continua sendo outro gesto. */
  await p.evaluate(() => document.querySelector('.tmx-sat [data-acao="ir-fechamento"]').click());
  await p.waitForTimeout(1000);
  const t9 = await espiar();
  nota(`[F4] fechamento -> tela=${t9.tela}`);
  eh('F4.11 . o botao do meio abre o Fechamento que ja existe', t9.tela === 'fechamento', `tela=${t9.tela}`);

  await b.close();
  console.log('\n=== MEDIDAS ===');
  notas.forEach((n) => console.log('  · ' + n));
  console.log('\n=== PROVA: chegada automatica ===');
  ok.forEach((n) => console.log('  ok  ' + n));
  falhou.forEach((n) => console.log('  XX  ' + n));
  console.log('\n' + ok.length + '/' + (ok.length + falhou.length));
  process.exit(SO_MEDIR ? 0 : (falhou.length ? 1 : 0));
})();
