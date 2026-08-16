#!/usr/bin/env node
/**
 * O LOOP DE 60 SEGUNDOS — a bancada da REGRESSÃO QUE FOI PRO APARELHO
 * (LOTE 1.3, 15/08).
 *
 *     node scripts/prova-loop-posse.js
 *     node scripts/prova-loop-posse.js --antes    (só MEDE, não reprova)
 *
 * 🔴 O QUE ESTA PROVA MEDE, e por que ela existe. Desde o lote 1.2 a ref
 * `route:` nasce pra QUALQUER rota não-ENCERRADA — inclusive as que não
 * seguram parada aberta nenhuma (a PLANNED que sobra de um Iniciar que falhou;
 * a COMPLETED com parada nova lançada por cima). Do outro lado, o servidor
 * NUNCA publica em `ownedRefs` uma rota sem parada aberta: o `listar` da
 * continuidade filtra por `stops: { some: { delivery: status IN abertos } }`.
 * Junte os dois e o bloco de "posse revogada" (`atualizarContinuidades`, em
 * `10-geofence-montagem.js`) conclui, a cada foco/tique de 60s, que o
 * aparelho perdeu a rota: `HBX.stopRoute()` + `carregarRota()` PRA SEMPRE —
 * com o motorista na rua, a tela dele recarregando sozinha 1×/min e o serviço
 * de GPS sendo desarmado e rearmado sem ninguém pedir.
 *
 * A régua deste portão é CONTAGEM AO LONGO DE N TIQUES, nunca o primeiro:
 * o defeito é justamente a REPETIÇÃO. Um tique só passaria verde num app
 * quebrado (o 1º desarme podia até ser legítimo) — por isso `TIQUES = 3` e as
 * asserções olham o DELTA acumulado. Cada tique dispara os DOIS atalhos que o
 * relógio de 60s replica (`focus` + `visibilitychange`), então 3 tiques = 6
 * passagens por `atualizarContinuidades`.
 *
 * VERMELHO MEDIDO CONTRA O CÓDIGO PUBLICADO (antes da cura, 15/08):
 *   PLANNED-fantasma ......... stopRoute=12 · getRota=6  (esperado 0 · 0)
 *   COMPLETED sem aberta ..... stopRoute=12 · getRota=6  (esperado 0 · 0)
 *   ENCERRADA / sem routeId .. 0 · 0   (já certos: a ref cai em `draft:`)
 *   ACTIVE posse revogada .... 6 · 6   (certo, e TEM que continuar assim)
 *   ACTIVE posse na mão ...... 0 · 0   (controle limpo)
 *
 * 🔴 O QUE O LOTE 1.4 ACRESCENTOU (16/08) — a cura do 1.3 (`estadoRota ===
 * 'rodando'`) SÓ encolheu o loop: ela desliga o bloco pra rota que não está na
 * rua, mas "rodando" não diz nada sobre a rota ainda SEGURAR parada aberta. O
 * fiscal adversarial mediu no HEAD do 1.3 a cena que faltava — rota ACTIVE (dia
 * não encerrado) com todos os stops JÁ fechados e uma entrega nova por cima:
 * 8 `stopRoute` + 8 `GET /logistica/rota` em 4 tiques, para sempre. É o estado
 * em que o motorista passa a tarde inteira. Cena 5 abaixo.
 *
 * As 7 cenas (as 5 pedidas + a do 1.4 + o controle limpo):
 *   1. PLANNED-fantasma  — rota viva sem stop, dia com abertas   → 0 desarme
 *   2. COMPLETED s/ aberta na rota — parada nova por cima         → 0 desarme
 *   3. ENCERRADA         — ref cai em `draft:`, que é do ator     → 0 desarme
 *   4. sem routeId       — idem                                   → 0 desarme
 *   5. ACTIVE com stops fechados + entrega nova (LOTE 1.4)        → 0 desarme
 *   6. CONTROLE ACTIVE + POSSE REVOGADA DE VERDADE  → TEM que continuar
 *      desarmando (é o caso que o bloco existe pra atender: outro aparelho
 *      puxou a rota deste motorista). Se este ficar verde por acidente da
 *      cura, a cura matou o produto. Ele é o PAR da cena 5: mesmo estado,
 *      mesmo `ownedRefs` vazio — só muda o que a rota ainda segura.
 *   7. CONTROLE LIMPO: ACTIVE com a posse na mão                  → 0 desarme
 *
 * Bancada: mesma receita do `prova-chegada-igual`/`prova-navegar` — servidor
 * estático dos GERADOS (regenerados aqui no começo, senão a prova mede código
 * velho) e dublê do `window.HBX` DEPOIS do boot (o `native.js` cria o HBX de
 * verdade no load e engoliria um `addInitScript`).
 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');
const { regenerarGerados } = require('./_regenerar');

const RAIZ = path.join(__dirname, '..');
const RAIZ_APP = path.join(RAIZ, 'EntregaShell', 'app', 'src', 'logistica');
const MOCK = path.join(RAIZ, 'docs', 'mockups', 'logistica2.0', 'logistica-2.0.html');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const SO_MEDIR = process.argv.includes('--antes');

/** quantos tiques de foco/visibilidade cada cena leva. NUNCA 1: o defeito é a
 *  repetição, e uma prova de um tique só não distingue um desarme legítimo de
 *  um loop eterno. */
const TIQUES = 3;

function peleDoMock() {
  const txt = fs.readFileSync(MOCK, 'utf8');
  const i = txt.indexOf('<style>'); const f = txt.indexOf('</style>');
  if (i < 0 || f < 0) throw new Error('mock sem bloco <style>');
  return txt.slice(i + 7, f);
}

function servir() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const p = path.join(RAIZ_APP, decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(p, (e, b) => {
        if (e) { res.writeHead(404); res.end(''); return; }
        res.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' });
        res.end(b);
      });
    });
    s.listen(0, '127.0.0.1', () => resolve([s, s.address().port]));
  });
}

const HOJE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

/** o MOTORISTA desta bancada — o mesmo id que a ref `draft:` carrega. */
const DONO = 9;

/* O dublê do `window.HBX`. Ele CONTA duas coisas e nada mais:
   · `stopRoute` — o desarme do serviço nativo de rota (bateria do motorista);
   · `GET /logistica/rota` — a recarga da tela do dia (dado + repinte).
   O `ownedRefs` é PARÂMETRO da cena, porque é exatamente ele que o servidor
   de verdade calcula com o filtro `stops: { some: { delivery: aberta } }`. */
const PONTE = ({ hoje, routeId, routeStatus, ownedRefs, dono, itens }) => {
  window.__erros = [];
  window.__conta = { stopRoute: 0, getRota: 0, getContinuidade: 0, activateRoute: 0 };
  window.addEventListener('unhandledrejection', (e) => {
    window.__erros.push(String((e.reason && (e.reason.stack || e.reason.message)) || e.reason));
  });
  const CLI = (n, lat, lng) => ({
    id: `c${n}`, nome: `Cliente ${n}`, endereco: `Rua ${n}, ${n}0`, cidade: 'Rio Claro', lat, lng,
  });
  /* AS ABERTAS DO DIA — com `rotaOrdem` gravado (dia JÁ montado) e com
     `entregador.id`, que é o que a ref `draft:` precisa pra existir. */
  const DO_DIA = [
    { id: 'e1', status: 'agendada', rotaOrdem: 0, origem: 'recorrente', entregador: { id: dono, nome: 'André' }, cliente: CLI(1, -22.4000, -47.5500) },
    { id: 'e2', status: 'agendada', rotaOrdem: 1, origem: 'recorrente', entregador: { id: dono, nome: 'André' }, cliente: CLI(2, -22.4100, -47.5600) },
  ];
  /* 🔴 A ROTA CUMPRIDA COM UMA ENTREGA NOVA POR CIMA — o dia inteiro do
     motorista (LOTE 1.4). As duas paradas DA ROTA estão ENTREGUES (no servidor:
     stops todos fechados ⇒ a rota NUNCA aparece em `ownedRefs`), e chegou uma
     entrega nova solta: `rotaOrdem: null` e sem stop nenhum — ela também não
     forma rascunho no servidor (o `listar` só agrupa em `draft:` quem tem
     `rotaOrdem` OU `startedAt`), então o ator não possui ref NENHUMA. A rota
     segue ACTIVE porque o dia não foi encerrado, que é o normal: o motorista
     só toca "Encerrar" no fim do turno. */
  const ROTA_CUMPRIDA_COM_NOVA = [
    { id: 'e1', status: 'entregue', rotaOrdem: 0, origem: 'recorrente', entregador: { id: dono, nome: 'André' }, cliente: CLI(1, -22.4000, -47.5500) },
    { id: 'e2', status: 'entregue', rotaOrdem: 1, origem: 'recorrente', entregador: { id: dono, nome: 'André' }, cliente: CLI(2, -22.4100, -47.5600) },
    { id: 'e3', status: 'agendada', rotaOrdem: null, origem: 'avulsa', entregador: { id: dono, nome: 'André' }, cliente: CLI(3, -22.4200, -47.5700) },
  ];
  const ITENS = itens === 'rota-cumprida-com-nova' ? ROTA_CUMPRIDA_COM_NOVA : DO_DIA;
  const antigo = window.HBX || {};
  window.HBX = Object.assign({}, antigo, {
    /* 🔴 SEM `sessionScope` A PROVA MEDIRIA A SI MESMA. `vestirPendencias`
       (00-nucleo.js) SAI CEDO quando o escopo local está vazio — e o
       `native.js` em modo preview devolve `{mode:'preview'}` pelado. Sem esta
       linha, `refsDoAtor` fica `[]` PARA SEMPRE e TODAS as cenas "desarmam",
       inclusive as que o app trata certo hoje: a prova acusaria um defeito que
       é da bancada. No aparelho de verdade quem preenche isto é o
       `appInfo()` do Kotlin (`localSessionScope()`). */
    info() { return Object.assign({ mode: 'preview' }, { sessionScope: `7:${dono}` }); },
    activateRoute() { window.__conta.activateRoute += 1; },
    stopRoute() { window.__conta.stopRoute += 1; },
    requestLocationPermission() {}, manterTelaAcesa() {}, modoNavegacao() {}, speak() {},
    api(caminho, opcoes) {
      const metodo = (opcoes && opcoes.method) || 'GET';
      const nu = String(caminho).split('?')[0];
      const R = (v) => Promise.resolve(JSON.parse(JSON.stringify(v)));
      if (nu === '/logistica/rota/continuidade' && metodo === 'GET') {
        window.__conta.getContinuidade += 1;
        return R({
          today: hoje,
          scopeKey: `7:${dono}`,
          /* 'draft'  = o servidor publica o RASCUNHO do dia (as abertas não
             estão presas em stop nenhum — é o que ele faz pra rota sem stop);
             'route'  = a rota operacional é do ator (posse na mão);
             'nenhuma'= posse REVOGADA de verdade (outro aparelho puxou). */
          ownedRefs: ownedRefs === 'draft' ? [`draft:${dono}:${hoje}`]
            : ownedRefs === 'route' ? [`route:${routeId}`] : [],
          items: [], primary: null, hiddenCount: 0, hasMore: false,
        });
      }
      if (nu === '/logistica/rota' && metodo === 'GET') {
        window.__conta.getRota += 1;
        return R({
          date: hoje, total: ITENS.length,
          routeStatus: routeStatus || '',
          routeId: routeId || null,
          trackingRequired: false, trackingSessionId: null, moduloFinanceiroAtivo: false,
          avisoChegandoAtivo: false, avisoChegandoDistanciaM: 500,
          items: ITENS,
        });
      }
      if (nu.indexOf('/logistica/config') === 0) {
        return R({ appModulosDesativados: '', raioChegadaM: 60, moduloFinanceiroAtivo: false, cobrancaSimples: true });
      }
      if (nu.indexOf('/logistica/rota/custo-preview') === 0) return R({ creditosAIniciar: 1 });
      if (nu.indexOf('/logistica/fechamento/resumo') === 0) return R({ fechamento: { totalCents: 0, formas: [] } });
      if (nu.indexOf('/credits/me') === 0) return R({ balance: 100 });
      if (nu.indexOf('/nucleo/clientes') === 0) return R({ items: [] });
      return R({});
    },
  });
};

const ok = [];
const falhou = [];
const notas = [];
const eh = (nome, cond, detalhe) => (cond ? ok : falhou).push(nome + (cond || !detalhe ? '' : `  [${detalhe}]`));
const nota = (t) => notas.push(t);

/* ==========================================================================
   AS CENAS. `desarme` é o CONTRATO: false = o aparelho não pode mexer em
   nada (nem GPS, nem recarga); true = tem que continuar desarmando (é o caso
   real de posse revogada, que a cura NÃO pode matar).
   ========================================================================== */
const CENAS = [
  {
    nome: 'PLANNED-fantasma (rota viva sem stop, dia com abertas)',
    routeId: 'route-planned-fantasma', routeStatus: 'PLANNED', ownedRefs: 'draft', desarme: false,
  },
  {
    nome: 'COMPLETED sem aberta na rota (parada nova lançada por cima)',
    routeId: 'route-completed-1', routeStatus: 'COMPLETED', ownedRefs: 'draft', desarme: false,
  },
  {
    nome: 'ENCERRADA (a lápide — ref cai em draft:, que é do ator)',
    routeId: 'route-encerrada-1', routeStatus: 'ENCERRADA', ownedRefs: 'draft', desarme: false,
  },
  {
    nome: 'sem routeId (dia montado, rota nunca iniciada)',
    routeId: null, routeStatus: '', ownedRefs: 'draft', desarme: false,
  },
  {
    /* 🔴 O FURO DO LOTE 1.3 (medido pelo fiscal adversarial no `734fb9d1`, com
       sonda própria: 8 stopRoute + 8 GET /logistica/rota em 4 tiques). A cura do
       1.3 (`estadoRota === 'rodando'`) não alcança este caso: a rota ESTÁ
       rodando (ACTIVE — o dia não foi encerrado), o dia TEM aberta na tela (a
       entrega nova), e mesmo assim o servidor não publica ref nenhuma pro ator
       (a rota não tem stop aberto; a entrega nova não tem `rotaOrdem` nem
       `startedAt` pra virar rascunho). É o estado em que o motorista passa a
       TARDE INTEIRA depois de cumprir as paradas da manhã.
       Esta cena é a irmã EXATA do controle logo abaixo — mesmo `routeStatus`,
       mesmo `ownedRefs` vazio: o que muda é SÓ o que a rota ainda segura. Se as
       duas ficarem iguais, a régua nova não está medindo nada. */
    nome: 'ACTIVE com stops fechados + entrega nova por cima (o dia inteiro do motorista)',
    routeId: 'route-active-cumprida', routeStatus: 'ACTIVE', ownedRefs: 'nenhuma',
    itens: 'rota-cumprida-com-nova', desarme: false,
  },
  {
    nome: 'CONTROLE · ACTIVE com POSSE REVOGADA de verdade (outro aparelho puxou)',
    routeId: 'route-active-revogada', routeStatus: 'ACTIVE', ownedRefs: 'nenhuma', desarme: true,
  },
  {
    nome: 'CONTROLE LIMPO · ACTIVE com a posse na mão',
    routeId: 'route-active-minha', routeStatus: 'ACTIVE', ownedRefs: 'route', desarme: false,
  },
];

(async () => {
  regenerarGerados();
  const [srv, porta] = await servir();
  const pele = peleDoMock();
  const navegador = await chromium.launch();

  for (const cena of CENAS) {
    const ctx = await navegador.newContext({ viewport: { width: 412, height: 940 } });
    const p = await ctx.newPage();
    const erros = [];
    p.on('pageerror', (e) => erros.push(e.message));
    await p.goto(`http://127.0.0.1:${porta}/assets/app/index.html`);
    await p.waitForTimeout(500);
    await p.addStyleTag({ content: pele });
    await p.evaluate(PONTE, {
      hoje: HOJE, routeId: cena.routeId, routeStatus: cena.routeStatus,
      ownedRefs: cena.ownedRefs, dono: DONO, itens: cena.itens || 'do-dia',
    });
    // a carga que ENSINA a tela: é ela que grava `rotaRefAtual`/`estadoRota`.
    await p.evaluate(() => window.HBXRota && window.HBXRota.carregar());
    await p.waitForTimeout(1200);
    await p.evaluate(() => window.ir('rota'));
    await p.waitForTimeout(600);

    /* `rotaRefAtual` mora DENTRO do IIFE da ponte — de fora só dá pra ler o
       que a tela expõe. `estadoRota` e `paradasAbertasNaTela` são do mock
       (globais), e são justamente as duas grandezas da régua nova. */
    const antes = await p.evaluate(() => ({
      estadoRota: (() => { try { return estadoRota; } catch (e) { return null; } })(),
      abertas: (() => { try { return paradasAbertasNaTela(); } catch (e) { return null; } })(),
      escopo: (() => { try { return window.HBX.info().sessionScope; } catch (e) { return null; } })(),
      conta: JSON.parse(JSON.stringify(window.__conta)),
    }));
    // ZERA depois da carga inicial: o que se mede é o que os TIQUES fazem.
    await p.evaluate(() => { window.__conta = { stopRoute: 0, getRota: 0, getContinuidade: 0, activateRoute: 0 }; });

    /* OS TIQUES. `focus` e `visibilitychange` são os dois atalhos que o
       relógio de 60s replica — dispará-los é medir exatamente o que o
       motorista sente ao voltar pro app (e o que o `setInterval` faz sozinho
       com o app aberto no apoio do carro). */
    for (let i = 0; i < TIQUES; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await p.evaluate(() => {
        window.dispatchEvent(new Event('focus'));
        document.dispatchEvent(new Event('visibilitychange'));
      });
      // eslint-disable-next-line no-await-in-loop
      await p.waitForTimeout(900);
    }

    const conta = await p.evaluate(() => JSON.parse(JSON.stringify(window.__conta)));
    nota(`[${cena.nome}] estadoRota=${antes.estadoRota} escopo=${antes.escopo} abertas=${antes.abertas}`
      + ` · em ${TIQUES} tiques: stopRoute=${conta.stopRoute} getRota=${conta.getRota}`
      + ` getContinuidade=${conta.getContinuidade} activateRoute=${conta.activateRoute}`);

    /* 🔴 O ANTI-FALSO-VERDE DESTA PRÓPRIA PROVA: sem esta linha, uma bancada
       que não TIQUE (ouvinte não registrado, dublê fora do ar) passaria verde
       em todas as cenas de "0 desarme" sem ter medido nada. Cada tique tem
       que ter ido ao servidor perguntar de quem é a rota — 2 eventos por
       tique, e os dois caem no MESMO `atualizarContinuidades`. */
    eh(`os ${TIQUES} tiques ACONTECERAM · ${cena.nome}`,
      conta.getContinuidade >= TIQUES,
      `getContinuidade=${conta.getContinuidade} (esperado >= ${TIQUES})`);
    eh(`zero pageerror · ${cena.nome}`, erros.length === 0, erros[0] || '');
    /* 🔴 O SEGUNDO ANTI-FALSO-VERDE (LOTE 1.4): TODA cena tem que chegar aqui
       com parada aberta NA TELA. O bloco de posse já era guardado por
       `paradasAbertasNaTela() > 0` desde antes — uma cena sem aberta ficaria
       verde por aquele guarda velho, sem encostar na régua nova. Zero aberta
       aqui = cena que não mede o que diz medir. */
    eh(`o dia TEM parada aberta na tela · ${cena.nome}`,
      Number(antes.abertas) > 0, `abertas=${antes.abertas}`);

    if (cena.desarme) {
      eh(`POSSE REVOGADA continua desarmando o serviço · ${cena.nome}`,
        conta.stopRoute >= TIQUES, `stopRoute=${conta.stopRoute} (esperado >= ${TIQUES})`);
      eh(`POSSE REVOGADA continua ressincronizando a tela · ${cena.nome}`,
        conta.getRota >= TIQUES, `getRota=${conta.getRota} (esperado >= ${TIQUES})`);
    } else {
      eh(`o serviço de rota NÃO é desarmado nos tiques · ${cena.nome}`,
        conta.stopRoute === 0, `stopRoute=${conta.stopRoute} em ${TIQUES} tiques`);
      eh(`a tela do dia NÃO recarrega sozinha nos tiques · ${cena.nome}`,
        conta.getRota === 0, `getRota=${conta.getRota} em ${TIQUES} tiques`);
    }

    await ctx.close();
  }

  await navegador.close();
  srv.close();

  console.log('\n=== MEDIDAS ===');
  notas.forEach((n) => console.log('  · ' + n));
  console.log('\n=== PROVA: o loop de 60s (posse revogada) ===');
  ok.forEach((n) => console.log('  ok  ' + n));
  falhou.forEach((n) => console.log('  XX  ' + n));
  console.log(`\n${ok.length}/${ok.length + falhou.length}`);
  process.exit(SO_MEDIR ? 0 : (falhou.length ? 1 : 0));
})().catch((e) => {
  console.error('\n❌ prova-loop-posse explodiu:', e && (e.stack || e.message || e));
  process.exit(1);
});
