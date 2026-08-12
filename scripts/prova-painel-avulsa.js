#!/usr/bin/env node
/**
 * PROVA DO PAINEL DA BUSCA DA PARADA AVULSA — F2 do PR12082026.
 *
 *     node scripts/prova-painel-avulsa.js
 *     node scripts/prova-painel-avulsa.js --antes    (roda contra o HEAD: o RED)
 *
 * Mesma receita do `prova-fluxo-rota.js`: dirige a TELA DE VERDADE (o `ponte.js`
 * que vai dentro do APK, sem dublê nenhum na frente) contra um servidor dublado
 * que fala o dialeto REAL da F1 — `GET /logistica/busca` com os três grupos e
 * `GET /logistica/busca/porta` com o pino da porta e o CEP.
 *
 * 🔴 O RED-FIRST É HONESTO E NÃO MEXE NA ÁRVORE. `--antes` materializa o front
 * do commit `HEAD` num diretório temporário (`git show`, como o
 * `casca-antes-e-depois` faz) e roda EXATAMENTE as mesmas cenas contra ele.
 * Nada de `git stash`: há outra sessão trabalhando nesta árvore.
 *
 * O que ele mede, um por um:
 *   A · debounce: um pedido por PAUSA, não um por tecla
 *   B · resposta ATRASADA não sobrescreve a nova
 *   C · os três grupos pintam com cabeçalho, contador e badge da fonte
 *   D · o grifo do trecho casado (e o fuzzy: "Mracia" acha Márcia)
 *   E · o fluxo do NÚMERO, com S/N travando o campo
 *   F · a escolha arma o pé com o CEP certo
 *   G · o cliente REUSA a conta (nada de `POST /nucleo/contas`)
 *   H · o comércio vira parada e o `encaixarAvulsa` recebe a ordem certa —
 *       e o recibo mostra posição e desvio REAIS
 *   I · os estados vazios ("Pra onde vai a parada?" / "Nada por aqui…")
 *   J · os recentes gravam e reaparecem
 *   K · ZERO animação viva na camada que renasce de repinte (a lei do `.entra`)
 *   L · zero ida ao Nominatim/Google no caminho por tecla
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const raiz = path.join(__dirname, '..');
const APP_DIR = path.join(raiz, 'EntregaShell/app/src/logistica/assets/app');
const SO_ANTES = process.argv.includes('--antes');

/** o front do HEAD, materializado fora da árvore (o RED do red-first) */
function frontDoHead() {
  const rel = 'EntregaShell/app/src/logistica/assets/app';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prova-painel-antes-'));
  ['index.html', 'mock.css', 'mock.js', 'ponte.js', 'native.js'].forEach((f) => {
    const conteudo = execFileSync('git', ['show', `HEAD:${rel}/${f}`], {
      cwd: raiz, maxBuffer: 64 * 1024 * 1024,
    });
    fs.writeFileSync(path.join(tmp, f), conteudo);
  });
  return tmp;
}

const DIR = SO_ANTES ? frontDoHead() : APP_DIR;
const APP = 'file:///' + path.join(DIR, 'index.html').split(path.sep).join('/');

/* ---------------------------------------------------------------------------
   O DUBLÊ. Fala o dialeto da F1 e guarda ESTADO — sem estado não dá pra medir
   "a parada entrou na rota" nem "a ordem que saiu no planejar".
   --------------------------------------------------------------------------- */
const PONTE = ({ hoje, atrasoPorTermo }) => {
  window.__chamadas = [];
  window.__erros = [];
  window.addEventListener('unhandledrejection', (e) => {
    window.__erros.push(String((e.reason && (e.reason.stack || e.reason.message)) || e.reason));
  });

  /* Rio Claro: uma cliente com acento (o fuzzy), uma rua do Censo e três
     comércios da RFB — dois na cidade e um em Piracicaba, que é o ranking por
     distância em pessoa. */
  const CLIENTES = [
    {
      id: 'c1', nome: 'Márcia', endereco: 'Rua 5', numero: '1181', bairro: 'Centro',
      cidade: 'Rio Claro', uf: 'SP', cep: '13500100', lat: -22.4110, lng: -47.5610,
      /* 🔴 SEM PORTA MARCADA. O servidor devolve `distM: 0` pra quem nao tem
         pino (medido contra PRODUCAO no g15, 12/08) — e a tela nao pode ler isso
         como "esta na sua frente". Zero nao e pino. */
      distM: 0, ultimaEntregaEm: null, score: 0.92,
    },
    {
      id: 'c2', nome: 'Santa Cruz Bebidas', endereco: 'Rua Santa Cruz', numero: '77', bairro: 'Centro',
      cidade: 'Rio Claro', uf: 'SP', cep: '13500900', lat: -22.4120, lng: -47.5620,
      distM: 900, ultimaEntregaEm: null, score: 0.80,
    },
  ];
  const VIAS = [
    {
      via: 'rua 8', codMunicipio: '3543907', lat: -22.4101, lng: -47.5601,
      cep: '13500100', portas: 214, spreadM: 380, distM: 400, exata: true,
    },
    {
      via: 'rua santa cruz', codMunicipio: '3543907', lat: -22.4121, lng: -47.5621,
      cep: '13500900', portas: 88, spreadM: 210, distM: 950, exata: true,
    },
  ];
  const LOJAS = [
    {
      cnpj: '11111111000111', nome: 'Bar do Zé', endereco: 'Av. 8, 415', cidade: 'Rio Claro',
      uf: 'SP', cnae: '5611201', cnaeDescricao: 'Bares', lat: -22.4105, lng: -47.5605,
      nivelGeo: 1, cep: '13500200', distM: 350, score: 0.97,
    },
    {
      cnpj: '22222222000122', nome: 'Bar do Zé Bebidas', endereco: 'Rua 21, 780', cidade: 'Rio Claro',
      uf: 'SP', cnae: '4723700', cnaeDescricao: 'Bebidas', lat: -22.4200, lng: -47.5700,
      nivelGeo: 2, cep: '13500300', distM: 2100, score: 0.71,
    },
    {
      cnpj: '33333333000133', nome: 'Bar do Zé', endereco: 'Rua do Porto', cidade: 'Piracicaba',
      uf: 'SP', cnae: '5611201', cnaeDescricao: 'Bares', lat: -22.7200, lng: -47.6490,
      nivelGeo: 3, cep: '13400000', distM: 34000, score: 0.30,
    },
    {
      cnpj: '44444444000144', nome: 'Mercado Santa Cruz', endereco: 'Rua Santa Cruz, 120', cidade: 'Rio Claro',
      uf: 'SP', cnae: '4711302', cnaeDescricao: 'Mercado', lat: -22.4122, lng: -47.5622,
      nivelGeo: 1, cep: '13500900', distM: 980, score: 0.88,
    },
  ];

  const S = {
    hoje,
    // duas paradas abertas já de pé: é nelas que a avulsa vai se encaixar
    entregas: [
      {
        id: 'e1', status: 'agendada', rotaOrdem: 0,
        cliente: { id: 'a1', nome: 'Ana', endereco: 'Rua A, 10', enderecoLinha: 'Rua A, 10', cidade: 'Rio Claro', lat: -22.4000, lng: -47.5500 },
      },
      {
        id: 'e2', status: 'agendada', rotaOrdem: 1,
        cliente: { id: 'a2', nome: 'Bruno', endereco: 'Rua B, 20', enderecoLinha: 'Rua B, 20', cidade: 'Rio Claro', lat: -22.4300, lng: -47.5800 },
      },
    ],
    seq: 100,
    contasCriadas: [],
  };
  window.__S = S;
  const abertas = () => S.entregas.filter((e) => e.status !== 'entregue' && e.status !== 'cancelada');

  window.HBX = {
    cache: {
      get(key, fallback) { try { const raw = localStorage.getItem(`hbx:${key}`); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } },
      set(key, value) { try { localStorage.setItem(`hbx:${key}`, JSON.stringify(value)); } catch (_) {} },
      remove(key) { try { localStorage.removeItem(`hbx:${key}`); } catch (_) {} },
    },
    uuid() { window.__uuidSeq = (window.__uuidSeq || 0) + 1; return `prova-${window.__uuidSeq}`; },
    api(caminho, opcoes) {
      const metodo = (opcoes && opcoes.method) || 'GET';
      const corpo = (opcoes && opcoes.body) || null;
      window.__chamadas.push([metodo, String(caminho).split('?')[0], corpo, String(caminho), Date.now()]);
      const q = (nome) => {
        const m = new RegExp(`[?&]${nome}=([^&]*)`).exec(caminho);
        return m ? decodeURIComponent(m[1]) : '';
      };
      const R = (v) => Promise.resolve(JSON.parse(JSON.stringify(v)));
      const dobra = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

      if (caminho.indexOf('/logistica/config') === 0) return R({ modoRotaPadrao: 'essencial', appModulosDesativados: '' });

      /* ---- A PORTA DA F1: os três grupos ---------------------------------
         `atrasoPorTermo` é o que faz a cena B existir: o termo curto responde
         DEPOIS do termo longo, que é o que a rede faz de verdade quando a
         pessoa digita rápido. */
      if (caminho.indexOf('/logistica/busca/porta') === 0) {
        const numero = Number(String(q('numero')).replace(/\D+/g, ''));
        if (!numero) {
          return R({ fonte: 'cnefe', precisao: 'via', via: q('via'), numero: null, lat: -22.4101, lng: -47.5601, cep: '13500100' });
        }
        if (numero === 9999) return R({ fonte: 'nenhum', precisao: null, via: q('via'), numero: null, lat: null, lng: null, cep: null });
        return R({ fonte: 'cnefe', precisao: 'porta', via: q('via'), numero, lat: -22.4102, lng: -47.5602, cep: '13500123' });
      }
      if (caminho.indexOf('/logistica/busca') === 0) {
        const alvo = dobra(q('q'));
        const casa = (nome) => dobra(nome).indexOf(alvo) >= 0;
        // o fuzzy do servidor, dublado no mínimo: "mracia" acha "marcia"
        const fuzzy = (nome) => {
          const a = dobra(nome); const b = alvo;
          if (a.indexOf(b) >= 0) return true;
          if (b.length < 4) return false;
          const trocas = [...b].filter((c, i) => a[i] !== c).length;
          return a.length === b.length && trocas <= 2;
        };
        const payload = {
          q: q('q'),
          grupos: {
            clientes: CLIENTES.filter((c) => fuzzy(c.nome)),
            enderecos: VIAS.filter((v) => casa(v.via)),
            comercios: LOJAS.filter((l) => casa(l.nome)).sort((a, b) => a.distM - b.distM),
          },
          fontes: { clientes: 'ok', enderecos: 'ok', comercios: 'ok' },
          escopo: { comGps: true, codMunicipio: '3543907', cidade: 'rio claro', uf: 'SP' },
        };
        const espera = (atrasoPorTermo || {})[q('q')] || 0;
        if (!espera) return R(payload);
        return new Promise((ok) => setTimeout(() => ok(JSON.parse(JSON.stringify(payload))), espera));
      }

      if (caminho.indexOf('/logistica/rota/planejar') === 0 && metodo === 'POST') {
        const ordem = (corpo && corpo.ordemManual) || (corpo && corpo.deliveryIds) || [];
        ordem.forEach((id, i) => { const e = S.entregas.find((x) => String(x.id) === String(id)); if (e) e.rotaOrdem = i; });
        return R({ ok: true });
      }
      if (caminho.indexOf('/logistica/osrm/table') === 0) {
        const n = String(q('coords')).split(';').length;
        // matriz plana: o encaixe cai no fim, e o desvio sai em SEGUNDOS
        const m = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : 120)));
        return R({ code: 'Ok', durations: m });
      }
      if (caminho.indexOf('/logistica/rota') === 0 && metodo === 'GET') {
        return R({ routeStatus: 'planejada', items: S.entregas.map((e) => JSON.parse(JSON.stringify(e))) });
      }
      if (caminho.indexOf('/logistica/entregas') === 0 && metodo === 'POST') {
        const id = `e${++S.seq}`;
        const conta = S.contasCriadas.find((c) => String(c.id) === String(corpo.customerProfileId));
        S.entregas.push({
          id, status: 'agendada', rotaOrdem: null,
          cliente: {
            id: String(corpo.customerProfileId), nome: (conta && conta.nome) || 'Cliente',
            endereco: (conta && conta.endereco) || 'Rua 5', enderecoLinha: (conta && conta.endereco) || 'Rua 5',
            cidade: 'Rio Claro', lat: (conta && conta.lat) || -22.4105, lng: (conta && conta.lng) || -47.5605,
          },
        });
        return R({ id });
      }
      if (caminho.indexOf('/nucleo/contas/por-endereco') === 0) return R({ contas: [] });
      if (caminho.indexOf('/nucleo/contas') === 0 && metodo === 'POST') {
        const id = `nova${++S.seq}`;
        S.contasCriadas.push(Object.assign({ id }, corpo));
        return R({ contaId: id });
      }
      if (caminho.indexOf('/nucleo/clientes') === 0) return R({ items: [], total: 0 });
      if (caminho.indexOf('/credits/me') === 0) return R({ saldo: 9000 });
      return R({});
    },
    requestLocationPermission() {}, manterTelaAcesa() {}, modoNavegacao() {}, speak() {},
    soundPrefs: { get: () => ({}), set: () => {} },
  };
  window.HBXApp = window.HBXApp || {};
  // o GPS do motorista: sem posição o servidor não ranqueia e a cena mede outra coisa
  if (window.HBXApp) window.HBXApp.onLocation = null;
};

const HOJE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const ok = [];
const falhou = [];
const notas = [];
const eh = (nome, cond, extra) => (cond ? ok : falhou).push(nome + (cond || !extra ? '' : ` — ${extra}`));
const nota = (t) => notas.push(t);

(async () => {
  const b = await chromium.launch();
  /* 🔴 O GPS É QUEM RANQUEIA — sem posição a prova mediria outra tela. A ponte
     lê a posição pelo `navigator.geolocation.watchPosition` (§80-gps), então
     quem finge de aparelho aqui é o próprio navegador. */
  const ctx = await b.newContext({
    viewport: { width: 412, height: 940 },
    permissions: ['geolocation'],
    geolocation: { latitude: -22.4108, longitude: -47.5608, accuracy: 8 },
  });
  const p = await ctx.newPage();
  const errosDePagina = [];
  p.on('pageerror', (e) => errosDePagina.push(e.message));

  /** uma CENA: página nova, dublê novo, estado de servidor novo */
  const cena = async (atrasoPorTermo) => {
    await p.goto(APP);
    await p.waitForTimeout(400);
    await p.evaluate(PONTE, { hoje: HOJE, atrasoPorTermo: atrasoPorTermo || {} });
    await p.waitForTimeout(200);
    await p.evaluate(() => { try { window.ir('rapida'); } catch (_) {} });
    await p.waitForTimeout(500);
    await p.evaluate(() => {
      const b2 = document.querySelector('[data-acao="rapida-porta"][data-porta="endereco"]');
      if (b2) b2.click();
    });
    await p.waitForTimeout(300);
    await p.evaluate(() => { window.__chamadas = []; });
  };

  /** digita LETRA POR LETRA, como o dedo faz */
  const digitar = async (texto, msPorTecla = 40) => {
    for (let i = 1; i <= texto.length; i++) {
      await p.evaluate((v) => {
        const el = document.querySelector('[data-campo="rapida-busca"]');
        if (!el) throw new Error('sem campo [data-campo="rapida-busca"] na tela');
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, texto.slice(0, i));
      await p.waitForTimeout(msPorTecla);
    }
  };
  const buscas = () => p.evaluate(() => window.__chamadas
    .filter((c) => c[0] === 'GET' && c[1] === '/logistica/busca').map((c) => c[3]));
  const posts = () => p.evaluate(() => window.__chamadas.filter((c) => c[0] === 'POST').map((c) => c[1]));
  const postsDe = (rota) => p.evaluate((r) => window.__chamadas
    .filter((c) => c[0] === 'POST' && c[1] === r).map((c) => c[2]), rota);
  const espiar = () => p.evaluate(() => ({
    grupos: [...document.querySelectorAll('.avb-grupo')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
    contadores: [...document.querySelectorAll('.avb-grupo em')].map((e) => e.textContent.trim()),
    titulos: [...document.querySelectorAll('.avb-item strong')].map((e) => e.textContent.trim()),
    grifos: [...document.querySelectorAll('.avb-item mark')].map((e) => e.textContent.trim()),
    badges: [...document.querySelectorAll('.avb-item .rgt small')].map((e) => e.textContent.trim()),
    dists: [...document.querySelectorAll('.avb-item .rgt b')].map((e) => e.textContent.trim()),
    vazio: (document.querySelector('.avb-rolo .vazio strong') || {}).textContent || '',
    recentes: [...document.querySelectorAll('[data-acao="busca-recente"]')].map((e) => e.textContent.trim()),
    numAberto: document.querySelectorAll('.avb-num').length,
    numValor: (document.querySelector('[data-campo="busca-numero"]') || {}).value || '',
    numTravado: !!(document.querySelector('[data-campo="busca-numero"]') || {}).disabled,
    snLigado: !!(document.querySelector('[data-acao="busca-sn"]') || { classList: { contains: () => false } }).classList.contains('on'),
    peResumo: (document.querySelector('.avb-pe-resumo') || {}).textContent || '',
    peCep: (document.querySelector('.avb-pe-resumo .pill') || {}).textContent || '',
    peBotao: (document.querySelector('.tmx-dock .act.go b') || {}).textContent || '',
    campo: (document.querySelector('[data-campo="rapida-busca"]') || {}).value || '',
    /* o × existe SEMPRE no HTML; quem o esconde e a folha (:placeholder-shown).
       `offsetParent` null = escondido de verdade, nao so "sem classe". */
    xVisivel: !!(document.querySelector('[data-acao="busca-limpar"]') || {}).offsetParent,
    portao: (document.querySelector('.portao h3') || {}).textContent || '',
    portaoSub: (document.querySelector('.portao .sub') || {}).textContent || '',
  }));
  const tocar = async (sel, ms = 350) => {
    await p.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) throw new Error(`sem ${s} na tela`);
      el.click();
    }, sel);
    await p.waitForTimeout(ms);
  };

  // =========================================================================
  // A · DEBOUNCE — um pedido por PAUSA, não um por tecla
  // =========================================================================
  try {
    await cena();
    await digitar('bar do ze', 40);          // 9 teclas, 40 ms entre elas
    await p.waitForTimeout(600);             // a pausa
    const idas = await buscas();
    nota(`[A] teclas=9 · idas ao /logistica/busca=${idas.length} · ${JSON.stringify(idas)}`);
    eh('A1 · uma digitada = UM pedido (debounce), não um por tecla', idas.length === 1, `saíram ${idas.length}`);
    eh('A2 · o pedido leva o termo INTEIRO', idas.length === 1 && /q=bar%20do%20ze|q=bar\+do\+ze/.test(idas[0]), idas.join(','));
    eh('A3 · o pedido leva o GPS (é ele que ranqueia)', idas.length === 1 && /lat=/.test(idas[0]) && /lng=/.test(idas[0]), idas.join(','));

    // =======================================================================
    // C · OS TRÊS GRUPOS · D · O GRIFO · L · zero rede externa
    // =======================================================================
    const t = await espiar();
    nota(`[C] 'bar do ze' → grupos=${JSON.stringify(t.grupos)} · badges=${JSON.stringify(t.badges)}`);
    eh('C3 · cada cartão tem o badge da FONTE', t.badges.join(',') === 'rfb,rfb,rfb', t.badges.join(','));
    eh('C4 · cada cartão tem a DISTÂNCIA', t.dists.length === 3 && t.dists.every((d) => /m$|km$/.test(d)), t.dists.join(','));
    /* 🔴 O RANKING É A PROMESSA DA TELA ("o mais perto de você vem primeiro"):
       o Bar do Zé DA CIDADE em 1º, o de Piracicaba lá embaixo. É a cena de
       aceite do dono, medida aqui antes de ir pro aparelho. */
    eh('C5 · o mais PERTO vem primeiro dentro do grupo',
      t.titulos[0] === 'Bar do Zé' && /350 m/.test(t.dists[0]) && /34,0 km/.test(t.dists[2]),
      `${t.titulos.join('|')} · ${t.dists.join('|')}`);
    eh('D1 · o trecho casado vem GRIFADO', t.grifos.length >= 3 && t.grifos.every((g) => /bar do z/i.test(g)), t.grifos.join(','));

    /* AS TRÊS FONTES NA MESMA DIGITADA. Nome que existe nas três é o caso real
       de rua com nome de lugar: um cliente, uma rua do Censo e um comércio. */
    await digitar('santa', 40);
    await p.waitForTimeout(600);
    const t3 = await espiar();
    nota(`[C] 'santa' → grupos=${JSON.stringify(t3.grupos)} · badges=${JSON.stringify(t3.badges)}`);
    eh('C1 · os três grupos pintam com cabeçalho, na ordem do desenho', t3.grupos.length === 3
      && /Meus clientes/i.test(t3.grupos[0]) && /Endere/i.test(t3.grupos[1]) && /Com[ée]rcios/i.test(t3.grupos[2]),
    JSON.stringify(t3.grupos));
    eh('C2 · cada cabeçalho tem o CONTADOR', t3.contadores.join(',') === '1,1,1', t3.contadores.join(','));
    eh('C6 · e cada grupo carimba a FONTE dele', t3.badges.join(',') === 'cliente,censo,rfb', t3.badges.join(','));
    const externas = await p.evaluate(() => window.__chamadas
      .filter((c) => /nominatim|google|openstreetmap/i.test(String(c[3]))).map((c) => c[3]));
    eh('L1 · ZERO Nominatim/Google no caminho por tecla', externas.length === 0, externas.join(','));

    // =======================================================================
    // I · ESTADO VAZIO "não achei" (respondeu e não tem nada)
    // =======================================================================
    await digitar('zzzzzz', 30);
    await p.waitForTimeout(600);
    const tv = await espiar();
    eh('I1 · respondeu vazio ⇒ "Nada por aqui com esse nome."', /Nada por aqui/i.test(tv.vazio), tv.vazio);
    eh('I2 · e nenhum grupo sobra na tela', tv.grupos.length === 0, tv.grupos.join(','));
  } catch (e) { falhou.push(`CENA A/C/D/I explodiu: ${e.message}`); }

  // =========================================================================
  // B · A RESPOSTA ATRASADA NÃO SOBRESCREVE A NOVA
  // =========================================================================
  try {
    await cena({ bar: 900 });               // "bar" volta 900 ms depois
    await digitar('bar', 40);
    await p.waitForTimeout(400);            // dispara o pedido lento
    await digitar('bar do ze', 40);
    await p.waitForTimeout(500);            // o rápido já voltou e pintou
    const antes = await espiar();
    await p.waitForTimeout(900);            // agora chega o ATRASADO
    const depois = await espiar();
    nota(`[B] antes=${antes.titulos.length} cartões · depois=${depois.titulos.length}`);
    eh('B1 · o termo novo pintou', antes.titulos.length === 3, `${antes.titulos.length} cartões`);
    eh('B2 · a resposta ATRASADA não sobrescreveu a nova',
      depois.titulos.join('|') === antes.titulos.join('|'), `${antes.titulos.join('|')} → ${depois.titulos.join('|')}`);
    eh('B3 · e o campo continua com o que o dedo escreveu', depois.campo === 'bar do ze', depois.campo);
  } catch (e) { falhou.push(`CENA B explodiu: ${e.message}`); }

  // =========================================================================
  // E · O FLUXO DO NÚMERO (com S/N) · F · o pé com o CEP certo
  // =========================================================================
  try {
    await cena();
    await digitar('rua 8', 40);
    await p.waitForTimeout(600);
    await tocar('[data-acao="busca-escolher"][data-tipo="rua"]');
    const t1 = await espiar();
    eh('E1 · tocar na RUA abre o degrau do número (e não arma o pé)',
      t1.numAberto === 1 && !t1.peResumo, `numAberto=${t1.numAberto} pe="${t1.peResumo}"`);
    await tocar('[data-acao="busca-sn"]', 250);
    const t2 = await espiar();
    eh('E2 · S/N escreve "S/N" e TRAVA o campo', t2.numValor === 'S/N' && t2.numTravado && t2.snLigado,
      `valor=${t2.numValor} travado=${t2.numTravado} on=${t2.snLigado}`);
    await tocar('[data-acao="busca-sn"]', 250);
    const t3 = await espiar();
    eh('E3 · desmarcar S/N destrava o campo', !t3.numTravado && !t3.snLigado, `travado=${t3.numTravado}`);
    await p.evaluate(() => {
      const el = document.querySelector('[data-campo="busca-numero"]');
      el.value = '1181'; el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await tocar('[data-acao="busca-usar-rua"]', 500);
    const t4 = await espiar();
    const chamouPorta = await p.evaluate(() => window.__chamadas
      .filter((c) => c[1] === '/logistica/busca/porta').map((c) => c[3]));
    nota(`[E] busca/porta: ${JSON.stringify(chamouPorta)}`);
    eh('E4 · "Usar" pergunta a PORTA ao Censo, com município+via+número',
      chamouPorta.length === 1 && /municipio=3543907/.test(chamouPorta[0]) && /via=rua/.test(chamouPorta[0]) && /numero=1181/.test(chamouPorta[0]),
      chamouPorta.join(','));
    eh('F1 · o pé nasce com o resumo da escolha', /Rua 8, 1181/.test(t4.peResumo), t4.peResumo);
    eh('F2 · e com o CEP QUE VEIO DA PORTA (13500-123), não o da rua',
      /13500-?123/.test(t4.peCep), t4.peCep);
    eh('F3 · o botão do pé diz o verbo inteiro', /Adicionar à rota/i.test(t4.peBotao), t4.peBotao);
  } catch (e) { falhou.push(`CENA E/F explodiu: ${e.message}`); }

  // =========================================================================
  // D2 · O FUZZY ("Mracia" acha Márcia) · G · cliente REUSA a conta
  // =========================================================================
  try {
    await cena();
    await digitar('mracia', 40);
    await p.waitForTimeout(600);
    const t = await espiar();
    eh('D2 · erro de digitação acha o cliente ("mracia" → Márcia)',
      t.titulos.join(',') === 'Márcia', t.titulos.join(','));
    /* 🔴 ZERO NAO E PINO. Sem porta marcada o servidor manda `distM: 0`; escrever
       "0 m" num painel que promete "o mais perto de voce vem primeiro" e a pior
       mentira que esta tela pode contar. */
    eh('D3 · distância que não existe NÃO vira "0 m"', t.dists.length === 0, t.dists.join(','));
    eh('D4 · e o × aparece com texto no campo, SEM repinte nenhum', t.xVisivel === true);
    await tocar('[data-acao="busca-escolher"][data-tipo="cli"]');
    const t2 = await espiar();
    eh('F4 · escolher cliente arma o pé com o CEP dele', /13500-?100/.test(t2.peCep), t2.peCep);
    await tocar('[data-acao="rapida-confirmar"]', 1400);
    const ps = await posts();
    const corpoEntrega = (await postsDe('/logistica/entregas'))[0] || {};
    nota(`[G] POSTs=${ps.join(',')} · entrega=${JSON.stringify(corpoEntrega)}`);
    eh('G1 · cliente NÃO abre conta nova (reusa a que existe)', ps.indexOf('/nucleo/contas') < 0, ps.join(','));
    eh('G2 · a entrega nasce na conta DELE e com motorista (`paraMinhaRota`)',
      String(corpoEntrega.customerProfileId) === 'c1' && corpoEntrega.paraMinhaRota === true, JSON.stringify(corpoEntrega));
  } catch (e) { falhou.push(`CENA D2/G explodiu: ${e.message}`); }

  // =========================================================================
  // H · COMÉRCIO → parada → `encaixarAvulsa` → recibo REAL
  // =========================================================================
  try {
    await cena();
    await digitar('bar do ze', 40);
    await p.waitForTimeout(600);
    await tocar('[data-acao="busca-escolher"][data-tipo="loja"]');
    const t1 = await espiar();
    eh('F6 · o CEP do pé sai COM máscara (13500-200), não cru do banco',
      /nasce com CEP 13500-200/.test(t1.peResumo), t1.peResumo);
    eh('F5 · escolher comércio arma o pé com nome e distância',
      /Bar do Zé/.test(t1.peResumo) && /350 m/.test(t1.peResumo), t1.peResumo);
    await tocar('[data-acao="rapida-confirmar"]', 1800);
    const corpoConta = (await postsDe('/nucleo/contas'))[0] || {};
    const corpoPlanejar = (await postsDe('/logistica/rota/planejar'))[0] || {};
    const t2 = await espiar();
    nota(`[H] conta=${JSON.stringify(corpoConta)}`);
    nota(`[H] planejar=${JSON.stringify(corpoPlanejar)} · portão="${t2.portao}: ${t2.portaoSub}"`);
    eh('H1 · a conta do comércio nasce com nome, cidade e CEP',
      corpoConta.nome === 'Bar do Zé' && corpoConta.cidade === 'Rio Claro' && String(corpoConta.cep) === '13500200',
      JSON.stringify(corpoConta));
    eh('H2 · e com o PINO do CnpjGeo (o pino é a intenção)',
      Number(corpoConta.lat) === -22.4105 && Number(corpoConta.lng) === -47.5605, JSON.stringify(corpoConta));
    eh('H3 · o `encaixarAvulsa` mandou a ordem COM a parada nova dentro',
      Array.isArray(corpoPlanejar.ordemManual) && corpoPlanejar.ordemManual.length === 3
      && corpoPlanejar.ordemManual.some((id) => id !== 'e1' && id !== 'e2'), JSON.stringify(corpoPlanejar.ordemManual));
    eh('H4 · o recibo mostra a POSIÇÃO real', /Parada \d+ de 3/.test(t2.portaoSub), t2.portaoSub);
    eh('H5 · o recibo mostra o DESVIO medido (nada de enfeite)',
      /menor desvio: \+\d/.test(t2.portaoSub), t2.portaoSub);
  } catch (e) { falhou.push(`CENA H explodiu: ${e.message}`); }

  // =========================================================================
  // J · OS RECENTES gravam e reaparecem · I3 · o vazio de abertura
  // =========================================================================
  try {
    await cena();
    const t0 = await espiar();
    eh('I3 · sem nada escrito ⇒ "Pra onde vai a parada?"', /Pra onde vai a parada/i.test(t0.vazio), t0.vazio);
    eh('I4 · e sem texto no campo o × fica escondido', t0.xVisivel === false);
    eh('J1 · e os recentes são os DESTE aparelho (dois já gravados nas cenas acima)',
      t0.recentes.length >= 2 && t0.recentes.some((r) => /Bar do Zé/.test(r)) && t0.recentes.some((r) => /Rua 8, 1181/.test(r)),
      JSON.stringify(t0.recentes));
    await tocar('[data-acao="busca-recente"]', 600);
    const t1 = await espiar();
    nota(`[J] recentes=${JSON.stringify(t0.recentes)} · após tocar: campo="${t1.campo}"`);
    eh('J2 · tocar num recente já procura por ele', t1.campo && (await buscas()).length === 1,
      `campo=${t1.campo}`);
    // e o × limpa tudo
    await tocar('[data-acao="busca-limpar"]', 350);
    const t2 = await espiar();
    eh('J3 · o × devolve a tela ao começo', /Pra onde vai a parada/i.test(t2.vazio) && !t2.campo,
      `vazio="${t2.vazio}" campo="${t2.campo}"`);
  } catch (e) { falhou.push(`CENA J explodiu: ${e.message}`); }

  // =========================================================================
  // K · ZERO ANIMAÇÃO VIVA na camada que renasce de repinte
  // =========================================================================
  try {
    await cena();
    await digitar('bar do ze', 40);
    await p.waitForTimeout(600);
    for (const modo of ['escuro', 'claro']) {
      const animadas = await p.evaluate((m) => {
        document.documentElement.dataset.luz = m;
        const nomes = [];
        document.querySelectorAll('.avb-rolo, .avb-rolo *, .avb-dica, .search.grande, .search.grande *').forEach((el) => {
          const a = getComputedStyle(el);
          if (a.animationName && a.animationName !== 'none') nomes.push(`${el.className || el.tagName}:${a.animationName}`);
        });
        return nomes;
      }, modo);
      eh(`K1 · nenhuma animação viva no painel (modo ${modo})`, animadas.length === 0, animadas.join(','));
    }
    /* E a régua da FONTE: regra que anima peça do painel só pode existir citando
       `.entra`. Medir só o computed pega o que está na tela AGORA; ler a folha
       pega a regra que alguém escrever amanhã pra um estado que hoje não abre. */
    const folha = fs.readFileSync(path.join(DIR, 'mock.css'), 'utf8');
    const suspeitas = folha.split('\n')
      .filter((l) => /\.avb-|\.search\.grande/.test(l) && /animation\s*:/.test(l) && !/\.entra/.test(l));
    eh('K2 · a FOLHA não tem regra de animação em peça do painel fora do `.entra`',
      suspeitas.length === 0, suspeitas.join(' | '));
  } catch (e) { falhou.push(`CENA K explodiu: ${e.message}`); }

  const erros = await p.evaluate(() => window.__erros || []);
  await b.close();

  console.log(`\n=== PROVA DO PAINEL DA BUSCA AVULSA ${SO_ANTES ? '(ANTES · contra o HEAD)' : '(DEPOIS · árvore)'} ===`);
  notas.forEach((n) => console.log('  · ' + n));
  console.log(`\n  passou: ${ok.length}`);
  ok.forEach((o) => console.log('    ✓ ' + o));
  if (falhou.length) {
    console.log(`\n  REPROVOU: ${falhou.length}`);
    falhou.forEach((f) => console.log('    ✗ ' + f));
  }
  if (errosDePagina.length) {
    console.log('\n  erros de página:');
    errosDePagina.slice(0, 8).forEach((e) => console.log('    ! ' + e));
  }
  if (erros.length) {
    console.log('\n  promessas mortas sozinhas:');
    erros.slice(0, 5).forEach((e) => console.log('    ! ' + String(e).split('\n')[0]));
  }
  console.log(`\n  ${ok.length}/${ok.length + falhou.length}`);
  // no modo ANTES o vermelho é o ESPERADO: ele só MEDE.
  process.exit(SO_ANTES ? 0 : (falhou.length ? 1 : 0));
})().catch((e) => { console.error(e); process.exit(1); });
