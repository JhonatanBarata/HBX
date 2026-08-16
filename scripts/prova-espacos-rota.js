#!/usr/bin/env node
/**
 * PROVA FUNCIONAL dos 4 pedidos do dono de 10/08 na MONTAGEM DE ROTA:
 *
 *   1  clicar no dia carrega SEMPRE na ordem de distância do GPS;
 *   2  mexeu na ordem e mandou montar ⇒ BARRA e pede pra salvar (1 tela só),
 *      com o nome preenchido; com os espaços cheios, pergunta se apaga o mais
 *      antigo;
 *   2b a última escolha do dia fica LEMBRADA (memória por dia da semana);
 *   3  são 3 espaços (1, 2 e 3), iguais entre si;
 *   4  o Voltar, com dia aceso, SOLTA o dia — sem dia, sai como sempre.
 *
 *     node scripts/prova-espacos-rota.js
 *
 * Mesma receita do `prova-fluxo-rota.js`: dirige o `ponte.js` do APK DE VERDADE
 * (sem dublê na frente da tela) contra um servidor dublado COM ESTADO — sem
 * estado não dá pra medir "salvou no espaço", que é uma pergunta sobre o que
 * ficou gravado. O GPS é o do navegador (Playwright), com uma posição CRAVADA:
 * a ordem por distância só é mensurável se a origem for conhecida.
 *
 * 🔴 A ORDEM DO SERVIDOR É DE PROPÓSITO A ERRADA. O `dia-preview` devolve os
 * quatro clientes na ordem do banco (Ana, Bruno, Carla, Dario), que NÃO é a
 * ordem de quem sai do ponto do GPS (Dario, Bruno, Carla, Ana). Dublê que já
 * devolvesse ordenado deixaria a prova verde com o app quebrado.
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
const DOW = (() => {
  const [a, m, d] = HOJE.split('-').map(Number);
  const js = new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay();
  return js === 0 ? 7 : js;
})();
/** dois dias da agenda que NUNCA são hoje — os chips precisam existir de verdade */
const DIA_A = (DOW % 7) + 1;
const DIA_B = ((DOW + 2) % 7) + 1;
const ROTULO = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/* A ORIGEM do GPS e as quatro portas. Tudo no mesmo meridiano pra conta ser
   legível: a distância é só a diferença de latitude. */
const ORIGEM = { latitude: -22.400, longitude: -47.550 };
const GENTE = [
  { id: 'c1', nome: 'Ana', lat: -22.430, lng: -47.550 },   // 3,3 km da origem
  { id: 'c2', nome: 'Bruno', lat: -22.410, lng: -47.550 }, // 1,1 km
  { id: 'c3', nome: 'Carla', lat: -22.420, lng: -47.550 }, // 2,2 km
  { id: 'c4', nome: 'Dario', lat: -22.402, lng: -47.550 }, // 0,2 km
];
const ORDEM_GPS = ['Dario', 'Bruno', 'Carla', 'Ana'];
const ORDEM_BANCO = ['Ana', 'Bruno', 'Carla', 'Dario'];

const PONTE = ({ hoje, hojeDow, diaA, diaB, modelos, agendaHoje }) => {
  window.__chamadas = [];
  window.__erros = [];
  window.addEventListener('unhandledrejection', (e) => {
    window.__erros.push(String((e.reason && (e.reason.stack || e.reason.message)) || e.reason));
  });
  const G = [
    { customerProfileId: 'c1', nome: 'Ana', enderecoLinha: 'Rua A, 10', bairro: 'Centro', lat: -22.430, lng: -47.550, itens: [] },
    { customerProfileId: 'c2', nome: 'Bruno', enderecoLinha: 'Rua B, 20', bairro: 'Centro', lat: -22.410, lng: -47.550, itens: [] },
    { customerProfileId: 'c3', nome: 'Carla', enderecoLinha: 'Rua C, 30', bairro: 'Centro', lat: -22.420, lng: -47.550, itens: [] },
    { customerProfileId: 'c4', nome: 'Dario', enderecoLinha: 'Rua D, 40', bairro: 'Centro', lat: -22.402, lng: -47.550, itens: [] },
  ];
  const S = {
    hoje,
    hojeDow,
    routeStatus: '',
    entregas: [],
    seq: 100,
    agenda: { [diaA]: G, [diaB]: G.slice(0, 2) },
    agendaHoje: agendaHoje ? G : null,
    modelos: (modelos || []).map((m) => Object.assign({}, m)),
    custo: { blocosTotais: 3, blocosJaDebitados: 0, creditosAIniciar: 1.2, saldoAtual: 9340, saldoCobre: true },
  };
  window.__S = S;
  const diaDe = (ymd) => {
    const [a, m, d] = String(ymd).split('-').map(Number);
    const js = new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay();
    return js === 0 ? 7 : js;
  };
  const abertas = () => S.entregas.filter((e) => e.status !== 'entregue' && e.status !== 'cancelada');

  window.HBX = {
    /* O cache É o do native (localStorage com prefixo `hbx:`) — a memória do
       espaço mora nele, e um dublê sem cache mediria uma memória que só existe
       dentro desta corrida. */
    cache: {
      get(key, fallback) {
        try { const raw = localStorage.getItem(`hbx:${key}`); return raw ? JSON.parse(raw) : fallback; }
        catch (_) { return fallback; }
      },
      set(key, value) { try { localStorage.setItem(`hbx:${key}`, JSON.stringify(value)); } catch (_) {} },
      remove(key) { try { localStorage.removeItem(`hbx:${key}`); } catch (_) {} },
    },
    api(caminho, opcoes) {
      const metodo = (opcoes && opcoes.method) || 'GET';
      const corpo = (opcoes && opcoes.body) || null;
      window.__chamadas.push([metodo, String(caminho).split('?')[0], corpo]);
      const q = (nome) => {
        const m = new RegExp(`[?&]${nome}=([^&]*)`).exec(caminho);
        return m ? decodeURIComponent(m[1]) : '';
      };
      const R = (v) => Promise.resolve(JSON.parse(JSON.stringify(v)));

      if (caminho.indexOf('/logistica/config') === 0) {
        return R({ modoRotaPadrao: 'essencial', appModulosDesativados: '' });
      }
      if (caminho.indexOf('/logistica/rota/custo-preview') === 0) return R(S.custo);
      if (caminho.indexOf('/logistica/rota/historico') === 0) return R({ dias: [] });
      if (caminho.indexOf('/logistica/rota/planejar') === 0 && metodo === 'POST') {
        const manual = corpo && Array.isArray(corpo.ordemManual) ? corpo.ordemManual.map(String) : null;
        const fila = abertas();
        const ordem = manual
          ? manual.filter((id) => fila.some((e) => e.id === id))
            .concat(fila.map((e) => e.id).filter((id) => manual.indexOf(id) < 0))
          : fila.map((e) => e.id);
        ordem.forEach((id, i) => {
          const e = S.entregas.find((x) => x.id === id);
          if (e) e.rotaOrdem = i;
        });
        return R({ stops: ordem.map((id) => ({ id })) });
      }
      if (caminho.indexOf('/logistica/rota/conferir') === 0) return R({ items: [] });
      if (caminho.indexOf('/logistica/rota/iniciar') === 0 && metodo === 'POST') {
        if (!abertas().length) return Promise.reject(new Error('Não há entregas abertas para iniciar.'));
        S.routeStatus = 'ACTIVE';
        return R({ ok: true });
      }
      if (caminho.indexOf('/logistica/mobile/materialize') === 0 && metodo === 'POST') {
        (S.agendaHoje || []).forEach((c) => {
          const ja = S.entregas.some((e) => e.status !== 'cancelada' && e.cliente
            && String(e.cliente.id) === String(c.customerProfileId));
          if (ja) return;
          S.seq += 1;
          S.entregas.push({
            id: `g${S.seq}`, status: 'agendada', rotaOrdem: null, origem: 'recorrente',
            cliente: {
              id: String(c.customerProfileId), nome: c.nome, enderecoLinha: c.enderecoLinha,
              lat: c.lat, lng: c.lng,
            },
          });
        });
        return R({ criadas: 0 });
      }
      /* rota-modelos: as 4 portas de VERDADE (lista, cria, regrava, apaga). É a
         tabela que os 3 espaços da tela leem e escrevem. */
      if (caminho.indexOf('/logistica/rota-modelos') === 0) {
        const id = (/rota-modelos\/([^/?]+)/.exec(caminho) || [])[1];
        if (metodo === 'POST' && !id) {
          S.seq += 1;
          const novo = {
            id: `m${S.seq}`, nome: corpo.nome, diaSemana: Number(corpo.diaSemana),
            paradas: corpo.paradas || [], criadoEm: new Date(2026, 0, 1 + S.seq).toISOString(),
          };
          S.modelos.push(novo);
          return R(novo);
        }
        if (metodo === 'PATCH' && id) {
          const m = S.modelos.find((x) => x.id === id);
          if (!m) return Promise.reject(new Error('Modelo não existe'));
          if (corpo.nome) m.nome = corpo.nome;
          if (corpo.paradas) m.paradas = corpo.paradas;
          return R(m);
        }
        if (metodo === 'DELETE' && id) {
          S.modelos = S.modelos.filter((x) => x.id !== id);
          return R({ ok: true });
        }
        return R(S.modelos);
      }
      if (caminho.indexOf('/logistica/rota') === 0 && metodo === 'GET') {
        return R({
          routeStatus: S.routeStatus,
          items: S.entregas.map((e) => ({
            id: e.id, status: e.status, rotaOrdem: e.rotaOrdem, origem: e.origem,
            cliente: e.cliente, quantidade: 1,
          })),
          moduloFinanceiroAtivo: false, avisoChegandoAtivo: false,
        });
      }
      if (caminho.indexOf('/logistica/dia-preview') === 0) {
        const d = q('date') || S.hoje;
        if (d === S.hoje && S.agendaHoje) return R({ clientes: S.agendaHoje });
        return R({ clientes: (S.agenda[diaDe(d)] || []) });
      }
      if (caminho.indexOf('/logistica/agenda') === 0) {
        return R({
          dias: [1, 2, 3, 4, 5, 6, 7].map((n) => ({
            diaSemana: n,
            totalClientesDia: (n === S.hojeDow && S.agendaHoje)
              ? S.agendaHoje.length : (S.agenda[n] || []).length,
          })),
        });
      }
      if (caminho.indexOf('/credits/me') === 0) return R({ saldo: S.custo.saldoAtual });
      return R({});
    },
    requestLocationPermission() {}, manterTelaAcesa() {}, modoNavegacao() {}, speak() {},
    soundPrefs: { get: () => ({}), set: () => {} },
  };
  window.HBXApp = window.HBXApp || {};
};

const ok = [];
const falhou = [];
const notas = [];
const eh = (nome, cond) => (cond ? ok : falhou).push(nome);
const nota = (t) => notas.push(t);
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  regenerarGerados();
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width: 412, height: 940 },
    geolocation: ORIGEM,
    permissions: ['geolocation'],
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => falhou.push('ERRO DE PAGINA: ' + e.message));

  /** uma CENA: página nova, dublê novo, memória do aparelho zerada */
  const cena = async (estado) => {
    await p.goto(APP);
    await p.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
    await p.waitForTimeout(400);
    await p.evaluate(PONTE, Object.assign({ hoje: HOJE, hojeDow: DOW, diaA: DIA_A, diaB: DIA_B }, estado || {}));
    await p.waitForTimeout(3200);
    await p.evaluate(() => window.dispatchEvent(new Event('focus')));
    await p.evaluate(() => window.HBXRota && window.HBXRota.carregar());
    await p.waitForTimeout(700);
  };

  const irMontagem = async () => {
    await p.evaluate(() => window.ir('montagem'));
    await p.waitForTimeout(900);
  };
  /** toca o chip do dia (0 = hoje) e espera a lista + os espaços */
  const tocarDia = async (n) => {
    await p.evaluate((d) => {
      const b2 = [...document.querySelectorAll('[data-acao="montar-dia"]')]
        .find((e) => String(e.dataset.dia) === String(d));
      if (b2) b2.click();
    }, n);
    await p.waitForTimeout(900);
  };
  const espiar = () => p.evaluate(() => ({
    tela: (function () { try { return atual; } catch (e) { return null; } })(),
    linhas: [...document.querySelectorAll('.stops .stop .who strong')].map((e) => e.textContent.trim()),
    modos: [...document.querySelectorAll('.modos .modo')].map((e) => [
      (e.querySelector('b') || {}).textContent || '',
      e.classList.contains('on') ? 1 : 0,
      e.querySelector('.ponto') ? 1 : 0,
    ]),
    chips: [...document.querySelectorAll('[data-acao="montar-dia"]')]
      .map((e) => [e.textContent.trim(), e.classList.contains('on') ? 1 : 0]),
    portoes: document.querySelectorAll('.portao-wrap').length,
    portao: (document.querySelector('.portao h3') || {}).textContent || '',
    portaoSub: (document.querySelector('.portao .sub') || {}).textContent || '',
    campo: (document.querySelector('.portao [data-campo="nome-espaco"]') || {}).value || '',
    principal: (document.querySelector('.portao-wrap .principal') || {}).textContent || '',
    vazio: (document.querySelector('.vazio strong') || {}).textContent || '',
    pe: (document.querySelector('.pe-montagem .go b') || {}).textContent || '',
    modelos: window.__S.modelos.map((m) => [m.nome, m.diaSemana, m.paradas.map((x) => x.customerProfileId).join('>')]),
    routeStatus: window.__S.routeStatus,
    memoria: (function () { try { return JSON.parse(localStorage.getItem('hbx:montagem-espaco-do-dia') || '{}'); } catch (e) { return {}; } })(),
  }));
  const tocarModo = async (chave) => {
    await p.evaluate((c) => {
      const el = document.querySelector(`.modos [data-modo="${c}"]`);
      if (el) el.click();
    }, chave);
    await p.waitForTimeout(700);
  };
  const arrastar = async (idx) => {
    await p.evaluate((ordem) => {
      document.dispatchEvent(new CustomEvent('hbx:ordem', { detail: { previa: ordem }, cancelable: true }));
    }, idx);
    await p.waitForTimeout(500);
  };
  const tocarPe = async () => {
    await p.evaluate(() => {
      const el = document.querySelector('.pe-montagem .go');
      if (el) el.click();
    });
    await p.waitForTimeout(900);
  };
  const tocarPrincipal = async () => {
    await p.evaluate(() => {
      const el = document.querySelector('.portao-wrap .principal');
      if (el) el.click();
    });
    await p.waitForTimeout(1400);
  };
  const modelo = (id, nome, dia, ids, n) => ({
    id, nome, diaSemana: dia, criadoEm: new Date(2026, 0, n).toISOString(),
    paradas: ids.map((x) => ({ customerProfileId: x })),
  });

  // ======================================================================
  // CENA 1 — a ordem do GPS manda, e a fileira tem 4 fatias
  // ======================================================================
  await cena({});
  await irMontagem();
  await tocarDia(DIA_A);
  const t1 = await espiar();
  nota(`[1] lista=${t1.linhas.join(' > ')} · modos=${t1.modos.map((m) => m[0] + (m[1] ? '*' : '')).join(' | ')}`);
  eh('1.1 · a fileira tem 4 fatias (Distância + 3 espaços)', t1.modos.length === 4);
  eh('1.2 · espaço vazio se apresenta pelo número', igual(t1.modos.map((m) => m[0]), ['Distância', 'Espaço 1', 'Espaço 2', 'Espaço 3']));
  eh('1.3 · sem histórico, quem nasce aceso é a Distância', t1.modos[0][1] === 1);
  eh('1.4 · a lista NÃO veio na ordem do banco', !igual(t1.linhas, ORDEM_BANCO));
  eh('1.5 · a lista veio na ordem de distância do GPS', igual(t1.linhas, ORDEM_GPS));

  // ======================================================================
  // CENA 2 — o espaço reordena, e o dia LEMBRA a última escolha
  // ======================================================================
  await cena({
    modelos: [
      modelo('m1', 'Manhã', DIA_A, ['c2', 'c1', 'c4', 'c3'], 1),
      modelo('m2', 'Tarde', DIA_A, ['c1', 'c3', 'c2', 'c4'], 2),
    ],
  });
  await irMontagem();
  await tocarDia(DIA_A);
  const t2 = await espiar();
  nota(`[2] 1ª vez no dia: aceso=${(t2.modos.find((m) => m[1]) || [''])[0]} · lista=${t2.linhas.join(' > ')}`);
  eh('2.1 · o dia com histórico abre no Espaço 1 (e não na Distância)', t2.modos[1][1] === 1);
  eh('2.2 · a lista veio na ordem GRAVADA do Espaço 1', igual(t2.linhas, ['Bruno', 'Ana', 'Dario', 'Carla']));

  await tocarModo('s2');
  const t3 = await espiar();
  eh('2.3 · tocar o Espaço 2 acende ELE', t3.modos[2][1] === 1 && t3.modos[1][1] === 0);
  eh('2.4 · e a lista vira a ordem gravada nele', igual(t3.linhas, ['Ana', 'Carla', 'Bruno', 'Dario']));
  eh('2.5 · a escolha ficou lembrada NO DIA', String(t3.memoria[String(DIA_A)] || '') === 's2');

  await tocarDia(DIA_B);
  const t4 = await espiar();
  eh('2.6 · dia SEM histórico cai na Distância', t4.modos[0][1] === 1);
  eh('2.7 · e a lista dele é a do GPS', igual(t4.linhas, ['Bruno', 'Ana']));

  await tocarDia(DIA_A);
  const t5 = await espiar();
  nota(`[2] de volta no dia A: aceso=${(t5.modos.find((m) => m[1]) || [''])[0]} · lista=${t5.linhas.join(' > ')}`);
  eh('2.8 · voltar pro dia devolve o Espaço 2 aceso', t5.modos[2][1] === 1);
  eh('2.9 · com a ordem dele na lista', igual(t5.linhas, ['Ana', 'Carla', 'Bruno', 'Dario']));

  /* Sair da tela e voltar: a memória é do APARELHO, não da visita.
     🔴 O dia CONTINUA aceso ao reentrar (a Montagem guarda a escolha), então a
     volta passa pelo dia B — tocar o chip A de novo seria o 2º toque, que o
     solta. Prova que mede o próprio atalho mede a si mesma. */
  await p.evaluate(() => window.ir('rota'));
  await p.waitForTimeout(500);
  await irMontagem();
  await tocarDia(DIA_B);
  await tocarDia(DIA_A);
  const t6 = await espiar();
  eh('2.10 · reabrir a tela mantém a memória do dia', t6.modos[2][1] === 1 && igual(t6.linhas, ['Ana', 'Carla', 'Bruno', 'Dario']));

  // ======================================================================
  // CENA 3 — o 3º espaço salva igual aos outros
  // ======================================================================
  await cena({ modelos: [modelo('m1', 'Manhã', DIA_A, ['c2', 'c1', 'c4', 'c3'], 1)] });
  await irMontagem();
  await tocarDia(DIA_A);
  await tocarModo('s3');
  const t7 = await espiar();
  eh('3.1 · o Espaço 3 vazio ENSINA (não grava no 1º toque)', /Espaço 3 — ainda vazio/.test(t7.portao));
  eh('3.2 · o tutorial fala em 3 rotas por dia', /guarda 3 rotas/.test(t7.portaoSub));
  await tocarPrincipal();                       // "Salvar aqui" → pede o nome
  await p.evaluate(() => {
    const c = document.querySelector('.portao [data-campo="nome-espaco"]');
    if (c) c.value = 'Bairro';
  });
  await tocarPrincipal();
  const t8 = await espiar();
  nota(`[3] modelos no servidor: ${t8.modelos.map((m) => m[0]).join(', ')}`);
  eh('3.3 · gravou um modelo NOVO no dia certo', t8.modelos.some((m) => m[0] === 'Bairro' && m[1] === DIA_A));
  /* 🔴 A POSIÇÃO É DE NASCIMENTO, e a prova mede isso de propósito: salvar pelo
     "Espaço 3" com o 2 vago cria o SEGUNDO modelo do dia, e a fileira — que
     ordena por `criadoEm` desde 08/08 — o mostra na posição 2. O que não pode
     acontecer (e acontecia até esta prova) é o botão 3 ficar aceso e VAZIO com
     a rota desenhada no 2 ao lado. Quem acende é onde a rota FICOU. */
  eh('3.4 · o espaço salvo acende ONDE ele ficou, com o nome digitado',
    t8.modos[2][0] === 'Bairro' && t8.modos[2][1] === 1 && t8.modos[3][1] === 0);

  // ======================================================================
  // CENA 4 — a TRAVA: mexeu na ordem e mandou montar
  // ======================================================================
  await cena({ agendaHoje: 1, modelos: [modelo('m1', 'Manhã', DOW, ['c1', 'c2', 'c3', 'c4'], 1)] });
  await irMontagem();
  await tocarDia(0);
  const t9 = await espiar();
  eh('4.1 · o dia de hoje abre no Espaço 1 lembrado', t9.modos[1][1] === 1);
  eh('4.2 · e o pé é o Iniciar', /Iniciar/.test(t9.pe));
  await arrastar([3, 2, 1, 0]);
  const t10 = await espiar();
  nota(`[4] depois do arrasto: ${t10.linhas.join(' > ')}`);
  eh('4.3 · o arrasto mandou na lista', igual(t10.linhas, ['Dario', 'Carla', 'Bruno', 'Ana']));
  eh('4.4 · e o espaço aceso ganhou o ponto de "editado"', t10.modos[1][2] === 1);
  await tocarPe();
  const t11 = await espiar();
  nota(`[4] portão da trava: "${t11.portao}" / "${t11.portaoSub}" · campo="${t11.campo}"`);
  eh('4.5 · o Iniciar foi BARRADO com a fala do dono', /Foi alterado a ordem/.test(t11.portao)
    && /Necessário salvar para montar rota/.test(t11.portaoSub));
  eh('4.6 · UMA tela só', t11.portoes === 1);
  eh('4.7 · com o nome já preenchido', t11.campo === 'Manhã');
  eh('4.8 · o botão diz o que vai acontecer', /Salvar e montar/.test(t11.principal));
  eh('4.9 · barrou de verdade: a rota NÃO iniciou', t11.routeStatus !== 'ACTIVE');
  await tocarPrincipal();
  await p.waitForTimeout(1200);
  const t12 = await espiar();
  nota(`[4] depois de salvar: modelos=${JSON.stringify(t12.modelos)} · rota=${t12.routeStatus} · tela=${t12.tela}`);
  eh('4.10 · o espaço ficou com a ordem do DEDO', t12.modelos.some((m) => m[0] === 'Manhã' && m[2] === 'c4>c3>c2>c1'));
  eh('4.11 · e a rota seguiu o toque: iniciou', t12.routeStatus === 'ACTIVE');
  eh('4.12 · caindo na navegação, como sempre', t12.tela === 'mapa');

  // ======================================================================
  // CENA 5 — os 3 espaços CHEIOS: pergunta se apaga o mais antigo
  // ======================================================================
  await cena({
    agendaHoje: 1,
    modelos: [
      modelo('m1', 'Velha', DOW, ['c1', 'c2', 'c3', 'c4'], 1),
      modelo('m2', 'Meia', DOW, ['c2', 'c1', 'c3', 'c4'], 2),
      modelo('m3', 'Nova', DOW, ['c3', 'c1', 'c2', 'c4'], 3),
    ],
  });
  await irMontagem();
  await tocarDia(0);
  await tocarModo('dist');                       // sem espaço aceso: não há alvo
  await arrastar([3, 2, 1, 0]);
  /* A ordem que o dedo deixou na TELA é a régua do que tem que ser gravado —
     cravar a string na prova mediria a lista de onde ela partiu, não o gesto. */
  const naTela5 = (await espiar()).linhas;
  const ID_DE = { Ana: 'c1', Bruno: 'c2', Carla: 'c3', Dario: 'c4' };
  const esperado5 = naTela5.map((n) => ID_DE[n]).join('>');
  await tocarPe();
  const t13 = await espiar();
  nota(`[5] portão do cheio: "${t13.portao}" / "${t13.portaoSub}"`);
  eh('5.1 · barrou igual', /Foi alterado a ordem/.test(t13.portao));
  eh('5.2 · e avisa que os 3 estão cheios, oferecendo o MAIS ANTIGO', /3 espaços/.test(t13.portaoSub) && /Velha/.test(t13.portaoSub));
  eh('5.3 · a rota continua parada', t13.routeStatus !== 'ACTIVE');
  await tocarPrincipal();                        // "Apagar e salvar"
  const t14 = await espiar();
  nota(`[5] depois de apagar: modelos=${t14.modelos.map((m) => m[0]).join(', ')} · campo="${t14.campo}"`);
  eh('5.4 · o mais antigo foi apagado', !t14.modelos.some((m) => m[0] === 'Velha'));
  eh('5.5 · e a tela de salvar abriu com nome preenchido', t14.campo === `${ROTULO[DOW]} 3`);
  await tocarPrincipal();
  await p.waitForTimeout(1200);
  const t15 = await espiar();
  nota(`[5] ordem do dedo=${esperado5} · gravado=${t15.modelos.map((m) => m[2]).join(' | ')}`);
  eh('5.6 · gravou a ordem do dedo no espaço liberado', t15.modelos.some((m) => m[2] === esperado5));
  eh('5.7 · e a rota iniciou depois de salvar', t15.routeStatus === 'ACTIVE');

  // ======================================================================
  // CENA 6 — o Voltar solta o dia
  // ======================================================================
  await cena({});
  await irMontagem();
  await tocarDia(DIA_A);
  const t16 = await espiar();
  eh('6.1 · o chip do dia está aceso', t16.chips.some((c) => c[1] === 1) && t16.linhas.length === 4);
  const back1 = await p.evaluate(() => window.HBXApp.handleBack());
  await p.waitForTimeout(800);
  const t17 = await espiar();
  eh('6.2 · o 1º Voltar foi TRATADO (não saiu do app)', back1 === true);
  eh('6.3 · e ele soltou o dia: nenhum chip aceso', !t17.chips.some((c) => c[1] === 1));
  eh('6.4 · a tela continua a Montagem, agora avulsa', t17.tela === 'montagem' && /Rota avulsa/.test(t17.vazio));
  const back2 = await p.evaluate(() => window.HBXApp.handleBack());
  await p.waitForTimeout(800);
  const t18 = await espiar();
  eh('6.5 · sem dia aceso, o Voltar volta pra Rota (o caminho de sempre)', back2 === true && t18.tela === 'rota');

  await irMontagem();
  await tocarDia(DIA_A);
  await p.evaluate(() => {
    const el = document.querySelector('.hdr [data-voltar][data-ir]');
    if (el) el.click();
  });
  await p.waitForTimeout(800);
  const t19 = await espiar();
  eh('6.6 · a SETA do cabeçalho obedece a mesma regra', t19.tela === 'montagem' && !t19.chips.some((c) => c[1] === 1));
  await p.evaluate(() => {
    const el = document.querySelector('.hdr [data-voltar][data-ir]');
    if (el) el.click();
  });
  await p.waitForTimeout(800);
  const t20 = await espiar();
  eh('6.7 · e sem dia ela volta a ser a seta de sempre', t20.tela === 'rota');

  const erros = await p.evaluate(() => window.__erros || []);
  erros.forEach((e) => falhou.push('PROMESSA MORTA: ' + e.split('\n')[0]));

  await b.close();

  console.log('');
  notas.forEach((t) => console.log('  · ' + t));
  console.log('');
  ok.forEach((t) => console.log('  ok  ' + t));
  falhou.forEach((t) => console.log('  XX  ' + t));
  console.log(`\n${ok.length}/${ok.length + falhou.length}`);
  process.exit(falhou.length ? 1 : 0);
})();
