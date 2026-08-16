#!/usr/bin/env node
/**
 * PROVA DO RECADO COM ROTA/PARADA EMBUTIDA (12/08).
 *
 *     node scripts/prova-recado-anexo.js
 *     node scripts/prova-recado-anexo.js --antes    (só MEDE, não reprova)
 *
 * A cena do dono: a Central manda "passa no Mercado Estrela antes das 11h" com
 * a parada GRUDADA. Com rota ativa o card oferece três saídas — Encaixar na
 * rota, Analisar, Negar; sem rota ativa, duas. Negar pergunta se quer mandar
 * motivo e, respondendo o que responder, **a rota recebida é LIMPA: não fica
 * presa em limbo nenhum** — mas fica no histórico do chat.
 *
 * Mesma receita do `prova-fluxo-rota`: dirige o `ponte.js` do APK DE VERDADE
 * (sem dublê na frente da tela) contra um servidor dublado com ESTADO. Sem
 * estado não dá pra medir "negar não cria nada": a pergunta é justamente o que
 * o servidor recebeu.
 *
 * 🔴 O QUE ESTA PROVA EXISTE PRA PEGAR:
 *   1. "Encaixar na rota" oferecido a quem NÃO tem rota — botão que não pode
 *      existir, porque não há para onde encaixar.
 *   2. Negar deixando o card pendente (o LIMBO) — ou, pior, negar criando a
 *      parada assim mesmo.
 *   3. Toque repetido virando duas paradas: encaixar é rede em 4 etapas, e
 *      segundos sem resposta é onde o dedo toca de novo.
 *   4. O card antigo (recado só de texto) mudando um byte por causa disto.
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

const ok = [];
const falhou = [];
const notas = [];
const eh = (nome, cond, det) => (cond ? ok : falhou).push(nome + (cond ? '' : `  [${det}]`));
const nota = (t) => notas.push(t);
const SO_MEDIR = process.argv.includes('--antes');

/* ── O DUBLÊ ──────────────────────────────────────────────────────────────
   Estado mínimo: o fio de recados, as entregas do dia e o routeStatus. É o
   suficiente pra `estadoDaRota` responder 'pronta' (rota ativa) ou 'vazia'. */
const PONTE = ({ hoje, recados, routeStatus, entregas }) => {
  window.__chamadas = [];
  window.__erros = [];
  window.addEventListener('unhandledrejection', (e) => {
    window.__erros.push(String((e.reason && (e.reason.stack || e.reason.message)) || e.reason));
  });

  const S = {
    hoje,
    routeStatus: routeStatus || '',
    recados: (recados || []).map((r) => JSON.parse(JSON.stringify(r))),
    entregas: (entregas || []).map((e) => Object.assign({}, e)),
    seq: 500,
  };
  window.__estado = S;

  window.HBX = {
    cache: {
      get(key, fallback) {
        try { const raw = localStorage.getItem(`hbx:${key}`); return raw ? JSON.parse(raw) : fallback; }
        catch (_) { return fallback; }
      },
      set(key, value) { try { localStorage.setItem(`hbx:${key}`, JSON.stringify(value)); } catch (_) {} },
      remove(key) { try { localStorage.removeItem(`hbx:${key}`); } catch (_) {} },
    },
    uuid() { window.__uuidSeq = (window.__uuidSeq || 0) + 1; return `prova-${window.__uuidSeq}`; },
    speak() {}, vibrate() {}, sound() {}, missaoAlarme() { return false; }, missaoAlarmeCancelar() {},
    recadoRespostaPendente() { return ''; }, recadoRespostaConcluir() {},
    api(caminho, opcoes) {
      const metodo = (opcoes && opcoes.method) || 'GET';
      const corpo = (opcoes && opcoes.body) || null;
      window.__chamadas.push([metodo, String(caminho).split('?')[0], corpo]);
      const R = (v) => Promise.resolve(JSON.parse(JSON.stringify(v)));

      if (caminho.indexOf('/logistica/config') === 0) {
        return R({ modoRotaPadrao: 'essencial', appModulosDesativados: '' });
      }
      if (caminho.indexOf('/logistica/recados/me') === 0) return R(S.recados);
      if (caminho.indexOf('/logistica/recados/portao') === 0) return R([]);
      if (caminho.indexOf('/logistica/recados/pendentes') === 0) return R([]);
      if (caminho.indexOf('/logistica/recados/responder') === 0) {
        S.recados.push({
          id: `resp_${++S.seq}`, origem: 'motorista', autorNome: 'Eu',
          texto: String((corpo && corpo.texto) || ''), nivel: 'normal',
          criadoEm: new Date().toISOString(), entregueEm: null, vistoEm: null, ackEm: null,
          estado: 'enviado', anexo: null,
        });
        return R(S.recados[S.recados.length - 1]);
      }
      /* O DESFECHO. Espelha o servidor de verdade: idempotente (estado já final
         responde sem mudar) e SEM criar nada — negar não escreve trabalho. */
      const anexoM = /^\/logistica\/recados\/([^/]+)\/anexo/.exec(caminho);
      if (anexoM && metodo === 'POST') {
        const alvo = S.recados.find((r) => String(r.id) === decodeURIComponent(anexoM[1]));
        if (!alvo || !alvo.anexo) return Promise.reject(new Error('Recado não encontrado.'));
        if (alvo.anexo.estado === 'pendente') {
          alvo.anexo.estado = (corpo && corpo.acao) === 'encaixar' ? 'encaixada' : 'negada';
        }
        return R({ ok: true, estado: alvo.anexo.estado });
      }
      if (caminho.indexOf('/logistica/entregas') === 0 && metodo === 'POST') {
        const id = `e${++S.seq}`;
        S.entregas.push({
          id, status: 'agendada', rotaOrdem: null,
          cliente: { id: String((corpo && corpo.customerProfileId) || ''), nome: 'Mercado Estrela', lat: -22.4, lng: -47.55 },
        });
        return R({ id });
      }
      const gerarM = /^\/logistica\/rota-modelos\/([^/]+)\/gerar/.exec(caminho);
      if (gerarM && metodo === 'POST') {
        const id = `e${++S.seq}`;
        S.entregas.push({ id, status: 'agendada', rotaOrdem: null, cliente: { id: 'c9', nome: 'Da rota salva' } });
        return R({ deliveryIds: [id], avisos: [] });
      }
      if (caminho.indexOf('/logistica/rota-modelos') === 0 && metodo === 'GET') {
        return R([{ id: 'rm1', nome: 'Quarta Centro', diaSemana: 3, criadoEm: null, paradas: [{ customerProfileId: 'c1' }] }]);
      }
      if (caminho.indexOf('/logistica/rota/planejar') === 0 && metodo === 'POST') {
        S.entregas.filter((e) => e.status !== 'entregue' && e.status !== 'cancelada')
          .forEach((e, i) => { e.rotaOrdem = i; });
        S.routeStatus = 'PLANNED';
        return R({ ok: true });
      }
      if (caminho.indexOf('/logistica/osrm/table') === 0) return Promise.reject(new Error('sem osrm na prova'));
      if (caminho.indexOf('/logistica/rota') === 0 && metodo === 'GET') {
        return R({
          routeStatus: S.routeStatus,
          items: S.entregas.map((e) => ({
            id: e.id, status: e.status, rotaOrdem: e.rotaOrdem, cliente: e.cliente, quantidade: 1,
          })),
          moduloFinanceiroAtivo: false, avisoChegandoAtivo: false,
        });
      }
      // Tudo o mais que o boot pede: lista vazia. A prova é do chat.
      return metodo === 'GET' ? R([]) : R({ ok: true });
    },
  };
};

/** um recado do escritório com anexo — o material da cena */
const recadoDe = (anexo, extra) => Object.assign({
  id: 'r_anexo', origem: 'escritorio', autorNome: 'Central',
  texto: 'Passa no Mercado Estrela antes das 11h',
  nivel: 'normal', criadoEm: new Date().toISOString(),
  entregueEm: new Date().toISOString(), vistoEm: null, ackEm: null, estado: 'no_aparelho',
  anexo,
}, extra || {});

const ANEXO_PARADA = {
  tipo: 'parada', contaId: 'c1', rotaModeloId: null,
  nome: 'Mercado Estrela', detalhe: 'R. das Orquídeas, 55', paradas: null, estado: 'pendente',
};
const ANEXO_ROTA = {
  tipo: 'rota', contaId: null, rotaModeloId: 'rm1',
  nome: 'Quarta Centro', detalhe: '6 paradas', paradas: 6, estado: 'pendente',
};
/** o recado de SEMPRE — é ele que não pode mudar um byte */
const RECADO_SO_TEXTO = {
  id: 'r_texto', origem: 'escritorio', autorNome: 'Central', texto: 'Bom dia!',
  nivel: 'normal', criadoEm: new Date().toISOString(),
  entregueEm: new Date().toISOString(), vistoEm: new Date().toISOString(), ackEm: null,
  estado: 'visto', anexo: null,
};

/* A RÉGUA: o que a PESSOA vê no card, lido da camada VIVA (a última — mesma lei
   do `pintar`). Botões pelo `data-acao`, nunca pelo texto: rótulo muda, verbo
   não. */
const MEDIR = `(() => {
  const c = [...document.querySelectorAll('#app .tela')].pop();
  const anexo = c && c.querySelector('.msg .anexo');
  const bolhas = c ? [...c.querySelectorAll('.msg')] : [];
  return {
    tela: (function () { try { return atual; } catch (e) { return null; } })(),
    temAnexo: !!anexo,
    classes: anexo ? anexo.className : '',
    botoes: anexo ? [...anexo.querySelectorAll('button')].map((b) => b.dataset.acao || '') : [],
    rotulos: anexo ? [...anexo.querySelectorAll('button')].map((b) => b.textContent.trim()) : [],
    selo: anexo && anexo.querySelector('.selo') ? anexo.querySelector('.selo').textContent.trim() : '',
    nome: anexo && anexo.querySelector('strong') ? anexo.querySelector('strong').textContent.trim() : '',
    soTexto: (bolhas.find((b) => !b.querySelector('.anexo')) || {}).outerHTML || '',
    focado: document.activeElement ? (document.activeElement.dataset || {}).campo || '' : '',
  };
})()`;

(async () => {
  regenerarGerados();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 940 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => falhou.push('ERRO DE PAGINA: ' + e.message));

  /** uma CENA: página nova, dublê novo, estado novo — e o Chat aberto */
  const cena = async (estado) => {
    await p.goto(APP);
    await p.waitForTimeout(400);
    await p.evaluate(PONTE, Object.assign({ hoje: HOJE }, estado || {}));
    await p.waitForTimeout(3200);
    await p.evaluate(() => window.dispatchEvent(new Event('focus')));
    await p.evaluate(() => window.HBXRota && window.HBXRota.carregar());
    await p.waitForTimeout(500);
    await p.evaluate(() => window.ir('chat'));
    await p.waitForTimeout(700);
  };
  const medir = () => p.evaluate(MEDIR);
  const chamadas = (metodo, prefixo) => p.evaluate(([m, pre]) => window.__chamadas
    .filter((c) => c[0] === m && c[1].indexOf(pre) === 0).length, [metodo, prefixo]);
  /* 🔴 CONTAR O DESFECHO POR PREFIXO É CONTAR O POLL JUNTO. `/logistica/recados/`
     casa também com `pendentes` (POST de 5 em 5 s) — a primeira versão desta
     prova reprovou o código dizendo "3 desfechos" quando o app tinha mandado
     um só. Régua que mede a coisa errada reprova inocente, e portão que reprova
     inocente é portão que se aprende a ignorar. */
  const desfechos = () => p.evaluate(() => window.__chamadas
    .filter((c) => c[0] === 'POST' && /\/logistica\/recados\/[^/]+\/anexo$/.test(c[1])).length);
  const tocar = async (acao) => {
    await p.evaluate((a) => {
      const c = [...document.querySelectorAll('#app .tela')].pop();
      const alvo = c && c.querySelector(`.msg .anexo [data-acao="${a}"]`);
      if (alvo) alvo.click();
    }, acao);
    await p.waitForTimeout(500);
  };
  /** o botão do portão aberto: 'principal' (Sim) ou 'escape' (Não) */
  const tocarPortao = async (qual) => {
    await p.evaluate((q) => {
      const c = [...document.querySelectorAll('#app .tela')].pop();
      const sel = q === 'principal' ? '.portao-wrap .principal' : '.portao-wrap .acoes button:not(.principal)';
      const alvo = c && c.querySelector(sel);
      if (alvo) alvo.click();
    }, qual);
    await p.waitForTimeout(700);
  };

  /* ── F1 — COM ROTA ATIVA: as TRÊS saídas ──────────────────────────────── */
  await cena({
    recados: [RECADO_SO_TEXTO, recadoDe(ANEXO_PARADA)],
    routeStatus: 'PLANNED',
    entregas: [{ id: 'e1', status: 'agendada', rotaOrdem: 0, cliente: { id: 'c9', nome: 'Já na rota', lat: -22.4, lng: -47.55 } }],
  });
  let m = await medir();
  nota(`[F1] rota ATIVA · botões=${JSON.stringify(m.botoes)} · rótulos=${JSON.stringify(m.rotulos)}`);
  eh('F1 · com rota ativa o card oferece as TRÊS saídas, nesta ordem',
    JSON.stringify(m.botoes) === JSON.stringify(['anexo-encaixar', 'anexo-analisar', 'anexo-negar']),
    JSON.stringify(m.botoes));
  eh('F1b · e o card diz QUEM é a parada (é pelo endereço que ele decide)',
    m.nome === 'Mercado Estrela', m.nome);

  /* ── F2 — SEM ROTA ATIVA: o botão que não tem para onde encaixar não nasce ─ */
  await cena({ recados: [recadoDe(ANEXO_PARADA)], routeStatus: '', entregas: [] });
  m = await medir();
  nota(`[F2] SEM rota · botões=${JSON.stringify(m.botoes)}`);
  eh('F2 · sem rota ativa sobram Analisar e Negar',
    JSON.stringify(m.botoes) === JSON.stringify(['anexo-analisar', 'anexo-negar']), JSON.stringify(m.botoes));
  eh('F2b · e "Encaixar na rota" NAO existe na tela',
    m.botoes.indexOf('anexo-encaixar') < 0, JSON.stringify(m.botoes));

  /* ── F3 — NEGAR SEM MOTIVO: limpa, e não cria nada ────────────────────── */
  await cena({
    recados: [recadoDe(ANEXO_PARADA)], routeStatus: 'PLANNED',
    entregas: [{ id: 'e1', status: 'agendada', rotaOrdem: 0, cliente: { id: 'c9', nome: 'Já na rota', lat: -22.4, lng: -47.55 } }],
  });
  await tocar('anexo-negar');
  const perguntou = await p.evaluate(() => {
    const c = [...document.querySelectorAll('#app .tela')].pop();
    const t = c && c.querySelector('.portao h3');
    return t ? t.textContent.trim() : '';
  });
  eh('F3 · negar PERGUNTA se quer mandar motivo', perguntou === 'Enviar motivo?', perguntou);
  await tocarPortao('escape');                       // "Não"
  m = await medir();
  nota(`[F3] depois do "Não": classes=${m.classes} · selo=${JSON.stringify(m.selo)} · botões=${JSON.stringify(m.botoes)}`);
  eh('F3b · o card vira NEGADA e as opções somem (o limbo não existe)',
    m.classes.indexOf('negada') >= 0 && m.botoes.length === 0, `${m.classes} ${JSON.stringify(m.botoes)}`);
  eh('F3c · e o recado CONTINUA no fio, com o desfecho escrito', m.temAnexo && /Negada/.test(m.selo), m.selo);
  eh('F3d · negar não criou entrega nenhuma', (await chamadas('POST', '/logistica/entregas')) === 0, 'POST /logistica/entregas saiu');
  const desfechosF3 = await desfechos();
  nota(`[F3] desfechos gravados=${desfechosF3}`);
  eh('F3e · e gravou o desfecho UMA vez', desfechosF3 === 1, String(desfechosF3));

  /* ── F4 — NEGAR COM MOTIVO: o texto responde ESTE recado ──────────────── */
  await cena({ recados: [recadoDe(ANEXO_PARADA)], routeStatus: 'PLANNED', entregas: [] });
  await tocar('anexo-negar');
  await tocarPortao('principal');                    // "Sim"
  m = await medir();
  nota(`[F4] depois do "Sim": foco=${JSON.stringify(m.focado)} · classes=${m.classes}`);
  eh('F4 · "Sim" leva o dedo pro campo de escrever', m.focado === 'recado-texto', m.focado);
  eh('F4b · e o card JÁ está negado antes de qualquer texto (sem limbo)',
    m.classes.indexOf('negada') >= 0, m.classes);
  await p.evaluate(() => {
    const c = [...document.querySelectorAll('#app .tela')].pop();
    const el = c && c.querySelector('[data-campo="recado-texto"]');
    if (el) el.value = 'Não dá, o cliente fecha 11h';
    const bt = c && c.querySelector('[data-acao="enviar-recado"]');
    if (bt) bt.click();
  });
  await p.waitForTimeout(700);
  const respondeu = await p.evaluate(() => (window.__chamadas
    .find((c) => c[0] === 'POST' && c[1] === '/logistica/recados/responder') || [])[2] || null);
  nota(`[F4] corpo do responder: ${JSON.stringify(respondeu)}`);
  eh('F4c · o motivo sai LIGADO ao recado que ele negou',
    !!respondeu && String(respondeu.recadoId) === 'r_anexo', JSON.stringify(respondeu));

  /* ── F5 — ENCAIXAR PARADA: cria UMA vez e o card fecha ────────────────── */
  await cena({
    recados: [recadoDe(ANEXO_PARADA)], routeStatus: 'PLANNED',
    entregas: [{ id: 'e1', status: 'agendada', rotaOrdem: 0, cliente: { id: 'c9', nome: 'Já na rota', lat: -22.4, lng: -47.55 } }],
  });
  await tocar('anexo-encaixar');
  await p.waitForTimeout(900);
  m = await medir();
  const criou = await chamadas('POST', '/logistica/entregas');
  nota(`[F5] POST entregas=${criou} · classes=${m.classes} · selo=${JSON.stringify(m.selo)}`);
  eh('F5 · encaixar cria a parada UMA vez', criou === 1, String(criou));
  eh('F5b · e planeja a ordem depois de criar',
    (await chamadas('POST', '/logistica/rota/planejar')) >= 1, 'planejar não saiu');
  eh('F5c · o card vira ENCAIXADA e perde os botões',
    m.classes.indexOf('encaixada') >= 0 && m.botoes.length === 0, `${m.classes} ${JSON.stringify(m.botoes)}`);

  /* ── F6 — TOQUE REPETIDO não vira duas paradas ────────────────────────── */
  await cena({
    recados: [recadoDe(ANEXO_PARADA)], routeStatus: 'PLANNED',
    entregas: [{ id: 'e1', status: 'agendada', rotaOrdem: 0, cliente: { id: 'c9', nome: 'Já na rota', lat: -22.4, lng: -47.55 } }],
  });
  await p.evaluate(() => {
    const c = [...document.querySelectorAll('#app .tela')].pop();
    const alvo = c && c.querySelector('.msg .anexo [data-acao="anexo-encaixar"]');
    if (alvo) { alvo.click(); alvo.click(); alvo.click(); }
  });
  await p.waitForTimeout(1600);
  const criouDobrado = await chamadas('POST', '/logistica/entregas');
  nota(`[F6] 3 toques → POST entregas=${criouDobrado}`);
  eh('F6 · três toques em "Encaixar" continuam sendo UMA parada', criouDobrado === 1, String(criouDobrado));

  /* ── F7 — O CARD ANTIGO NÃO MUDA UM BYTE ──────────────────────────────── */
  await cena({ recados: [RECADO_SO_TEXTO], routeStatus: '', entregas: [] });
  m = await medir();
  const ESPERADO = '<div class="msg deles">Bom dia!<small>';
  nota(`[F7] bolha sem anexo: ${m.soTexto}`);
  eh('F7 · recado só de texto continua a bolha de sempre (sem classe, sem anexo)',
    m.soTexto.indexOf(ESPERADO) === 0 && m.soTexto.indexOf('anexo') < 0 && m.soTexto.indexOf('tem-anexo') < 0,
    m.soTexto);

  /* ── F8 — ANEXO DE ROTA usa o verbo da ROTA SALVA, não o da parada ────── */
  await cena({
    recados: [recadoDe(ANEXO_ROTA, { id: 'r_rota' })], routeStatus: 'PLANNED',
    entregas: [{ id: 'e1', status: 'agendada', rotaOrdem: 0, cliente: { id: 'c9', nome: 'Já na rota', lat: -22.4, lng: -47.55 } }],
  });
  m = await medir();
  eh('F8 · o card da rota diz o tamanho dela', m.nome === 'Quarta Centro', m.nome);
  await tocar('anexo-encaixar');
  await p.waitForTimeout(900);
  const gerou = await chamadas('POST', '/logistica/rota-modelos');
  const criouPelaParada = await chamadas('POST', '/logistica/entregas');
  nota(`[F8] gerar=${gerou} · POST entregas=${criouPelaParada}`);
  eh('F8b · encaixar ROTA chama o gerar da rota salva', gerou === 1, String(gerou));
  eh('F8c · e NAO passa pela porta da parada avulsa', criouPelaParada === 0, String(criouPelaParada));

  const erros = await p.evaluate(() => window.__erros || []);
  if (erros.length) falhou.push(`PROMESSA MORTA NA PONTE: ${erros[0]}`);

  await b.close();

  console.log('\n── PROVA · RECADO COM ROTA/PARADA EMBUTIDA ──');
  notas.forEach((t) => console.log('  · ' + t));
  console.log('');
  ok.forEach((t) => console.log('  ✓ ' + t));
  falhou.forEach((t) => console.log('  ✗ ' + t));
  console.log(`\n${ok.length}/${ok.length + falhou.length} cenas passaram.`);
  if (falhou.length && !SO_MEDIR) process.exit(1);
})();
