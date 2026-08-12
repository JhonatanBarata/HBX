#!/usr/bin/env node
/**
 * PROVA DO FANTASMA — a manobra que o cartão manda fazer, medida contra a rua.
 *
 *     node scripts/prova-manobra-fantasma.js
 *
 * 🔴 POR QUE ELA EXISTE (dono, 12/08, print do g15 parado a 0 km/h): no topo
 * *"60 m · Vire à esquerda"*, embaixo *"Rua 23 · depois, vire à direita"*, e o
 * traço verde desenhando a DIREITA. *"isso é grave, a voz acompanha o q está
 * errado"*.
 *
 * A curva que ele JÁ TINHA FEITO voltava pro cartão 25 m depois da esquina.
 * `manobraDaVez` varria os passos do zero e devolvia o primeiro a mais de 25 m —
 * e `metrosEntre` é MÓDULO, então "a menos de 25 m" era o único jeito de um
 * passo contar como passado. Duas metades:
 *
 *   · DEPOIS da curva ela ressuscitava e ficava, porque recalcular a rota exige
 *     120 m andados (parado, nunca: é o print);
 *   · ANTES da curva, nos últimos 25 m, ela era pulada e o cartão já mostrava a
 *     SEGUINTE — a três segundos de virar, e com a voz junto (`VOZ_AGORA_M`=60).
 *
 * E as duas se somam numa terceira, que é a que chegou no ouvido do dono: com um
 * fantasma na vaga, a curva certa nunca chega em `vozDaManobra`, a chave dela
 * fica POR ANUNCIAR, e quando o recálculo mata o fantasma velho quem fala é a
 * curva já feita — cada curva anunciada uma curva atrasada.
 *
 * O conserto é a catraca: o passo carrega o índice do vértice da fita (`vi`) e o
 * cursor da vez só ANDA PRA FRENTE. Quem sabe o que ficou pra trás é a fita, e
 * ela já sabia — `tracoDaVez` apara o traço no mesmo índice desde 08/08.
 *
 * 🔴 A RÉGUA É A TELA CONTRA A RUA, NÃO O ESTADO INTERNO. A prova desenha um L
 * conhecido (norte, VIRA À ESQUERDA, oeste, VIRA À DIREITA, norte), põe o carro
 * a andar nele e cobra, em CADA posição, a manobra que um motorista naquele
 * ponto teria que ouvir. Nenhum assert olha variável da ponte: se alguém
 * reescrever o miolo com outro mecanismo e a tela ficar certa, a prova passa.
 *
 * Medido no código de ANTES do conserto, esta prova reprovava em 6 asserts e
 * reproduzia o print do dono na letra: *"60 m Vire à esquerda"* no ponto em que
 * a curva certa era a direita.
 *
 * O caso 2 guarda a TABELA (12/08, aprovada pelo dono): `end of road` — a rua
 * que morre noutra, pão de cada dia na grade de Rio Claro — caía no `return
 * null` e o cartão anunciava a curva DEPOIS do T; e `continue`+`uturn` dizia
 * "continue na Rua X" com o roteador mandando dar meia-volta.
 *
 * (bancada igual à do `prova-navegar`: servidor estático, pele do mock-fonte,
 *  dublê do `window.HBX` DEPOIS do boot — o `native.js` engoliria addInitScript.)
 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const MOCK = path.join(RAIZ, 'docs', 'mockups', 'logistica2.0', 'logistica-2.0.html');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function peleDoMock() {
  const txt = fs.readFileSync(MOCK, 'utf8');
  const i = txt.indexOf('<style>'); const f = txt.indexOf('</style>');
  if (i < 0 || f < 0) throw new Error('mock sem bloco <style>');
  return txt.slice(i + 7, f);
}

function servir() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const p = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(p, (e, b) => {
        if (e) { res.writeHead(404); res.end(''); return; }
        res.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' });
        res.end(b);
      });
    });
    s.listen(0, '127.0.0.1', () => ok([s, s.address().port]));
  });
}

/* ---- O L, EM METROS -------------------------------------------------------
   Rio Claro, quadra de verdade. O carro sobe 200 m, dobra à ESQUERDA, anda
   120 m e dobra à DIREITA. É a forma exata do print: esquerda primeiro, direita
   depois, e o motorista parado entre as duas. */
const BASE = { lat: -22.4126, lng: -47.5763 };
const M_LAT = 1 / 110540;
const M_LNG = 1 / (111320 * Math.cos((BASE.lat * Math.PI) / 180));
const pt = (n, o) => [BASE.lng - (o * M_LNG), BASE.lat + (n * M_LAT)];

const SUBIDA_M = 200;     // até a esquina da esquerda
const TRAVESSA_M = 120;   // da esquerda até a direita
const SAIDA_M = 300;      // depois da direita, até a parada

const serie = (de, ate, passo, fn) => {
  const v = [];
  for (let x = de; x <= ate + 0.001; x += passo) v.push(fn(x));
  return v;
};
const TRECHO_A = serie(0, SUBIDA_M, 25, (n) => pt(n, 0));
const TRECHO_B = serie(0, TRAVESSA_M, 24, (o) => pt(SUBIDA_M, o));
const TRECHO_C = serie(0, SAIDA_M, 25, (n) => pt(SUBIDA_M + n, TRAVESSA_M));
const FIM = TRECHO_C[TRECHO_C.length - 1];

/* A geometria da rota é a costura dos trechos — é assim que o OSRM devolve, e é
   disso que sai o `vi` de cada manobra (soma dos vértices dos passos anteriores). */
const GEO = TRECHO_A.concat(TRECHO_B.slice(1), TRECHO_C.slice(1));

/** a mesma rota, trocando só COMO o roteador nomeia as duas manobras */
const rotaCom = (m1, m2) => ({
  code: 'Ok',
  routes: [{
    distance: SUBIDA_M + TRAVESSA_M + SAIDA_M,
    duration: 96,
    geometry: { type: 'LineString', coordinates: GEO },
    legs: [{
      steps: [
        {
          name: 'Avenida Nove',
          maneuver: { type: 'depart', modifier: 'straight', location: TRECHO_A[0] },
          geometry: { type: 'LineString', coordinates: TRECHO_A },
        },
        {
          name: 'Rua 23',
          maneuver: Object.assign({ location: TRECHO_B[0] }, m1),
          geometry: { type: 'LineString', coordinates: TRECHO_B },
        },
        {
          name: 'Rua Trinta',
          maneuver: Object.assign({ location: TRECHO_C[0] }, m2),
          geometry: { type: 'LineString', coordinates: TRECHO_C },
        },
        {
          name: '',
          maneuver: { type: 'arrive', modifier: 'straight', location: FIM },
          geometry: { type: 'LineString', coordinates: [FIM, FIM] },
        },
      ],
    }],
  }],
});

/* ---- ONDE O CARRO PASSA, E O QUE ELE TEM QUE OUVIR ALI ---------------------
   `espera` é a manobra que um motorista NAQUELE ponto teria que estar vendo.
   `null` = a tolerância da esquina (±10 m), onde as duas respostas servem e a
   prova não cobra — quem cobra esquina no metro exato reprova por ruído. */
const O_L = [
  { n: 0, o: 0, espera: 'Vire à esquerda', rotulo: 'saindo (200 m da esquerda)' },
  { n: 100, o: 0, espera: 'Vire à esquerda', rotulo: '100 m antes da esquerda' },
  { n: 175, o: 0, espera: 'Vire à esquerda', rotulo: '25 m antes da esquerda' },
  { n: 180, o: 0, espera: 'Vire à esquerda', rotulo: '20 m antes ⟵ metade ENGOLIDA' },
  { n: 195, o: 0, espera: 'Vire à esquerda', rotulo: '5 m antes da esquerda' },
  { n: 200, o: 0, espera: null, rotulo: 'em cima da esquina (tolerância)' },
  { n: 200, o: 10, espera: null, rotulo: 'saindo da esquina (tolerância)' },
  { n: 200, o: 30, espera: 'Vire à direita', rotulo: '30 m depois da esquerda' },
  { n: 200, o: 60, espera: 'Vire à direita', rotulo: '60 m depois ⟵ O PRINT DO DONO' },
  { n: 200, o: 90, espera: 'Vire à direita', rotulo: '90 m depois da esquerda' },
  { n: 200, o: 110, espera: 'Vire à direita', rotulo: '10 m antes da direita' },
  { n: 200, o: 120, espera: null, rotulo: 'em cima da 2ª esquina (tolerância)' },
  { n: 240, o: 120, espera: '', rotulo: '40 m depois da direita — sem manobra' },
  { n: 300, o: 120, espera: '', rotulo: 'reta final — sem manobra' },
];

/* O caso 2 não testa geometria, testa PALAVRA: a mesma rua, nomeada com os dois
   tipos que o app engolia. Duas paradas bastam — uma de cada lado da esquina. */
const A_TABELA = [
  { n: 100, o: 0, espera: 'Vire à esquerda', rotulo: 'antes do T (end of road + left)' },
  { n: 200, o: 60, espera: 'Faça o retorno', rotulo: 'depois do T (continue + uturn)' },
];

const PONTE = ({ itens, rota }) => {
  window.__osrm = 0;
  window.__falas = [];
  window.HBX = {
    api(caminho) {
      if (caminho.indexOf('/logistica/rota?') === 0) {
        return Promise.resolve({
          items: itens, routeStatus: 'ACTIVE', routeId: 'r1',
          moduloFinanceiroAtivo: false, prospector: { empresas: [] },
        });
      }
      if (caminho.indexOf('/logistica/osrm/route') === 0) {
        window.__osrm += 1;
        return Promise.resolve(JSON.parse(JSON.stringify(rota)));
      }
      if (caminho.indexOf('/logistica/agenda') === 0) return Promise.resolve({ dias: [] });
      if (caminho.indexOf('/logistica/dia-preview') === 0) return Promise.resolve({ clientes: [] });
      if (caminho.indexOf('/logistica/config') === 0) {
        return Promise.resolve({ prospectorAtivo: false, prospectorDisponivel: false, prospectorEquipe: false });
      }
      return Promise.resolve({});
    },
    requestLocationPermission() {}, manterTelaAcesa() {}, modoNavegacao() {},
    /* a voz vira FITA: é o outro consumidor de `manobraDaVez`, e o defeito
       chegou no dono pelo ouvido antes de chegar pelo olho. */
    speak(t) { window.__falas.push(String(t)); },
  };
  window.HBXApp = window.HBXApp || {};
};

/** o que a tela do motorista está dizendo, agora */
const LER_CARTAO = () => {
  const t = (sel) => {
    const el = document.querySelector(sel);
    return el ? el.textContent.trim() : '';
  };
  return {
    existe: !!document.querySelector('.gps-manobra'),
    verbo: t('[data-vivo="manobraVerbo"]'),
    dist: t('[data-vivo="manobraDist"]'),
    baixo: t('.gps-manobra .baixo'),
    osrm: window.__osrm,
    falas: (window.__falas || []).slice(),
  };
};

const ok = [];
const falhou = [];
const eh = (nome, cond, medida) => {
  (cond ? ok : falhou).push(nome + (medida ? `  [${medida}]` : ''));
};

async function dirigir(navegador, pele, porta, rota, paradas) {
  const ctx = await navegador.newContext({
    viewport: { width: 412, height: 940 },
    geolocation: { latitude: BASE.lat, longitude: BASE.lng, accuracy: 12 },
    permissions: ['geolocation'],
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));

  await p.goto(`http://127.0.0.1:${porta}/EntregaShell/app/src/logistica/assets/app/index.html`);
  await p.waitForTimeout(700);
  await p.addStyleTag({ content: pele });

  /* uma parada só, no fim do L: é o "Parada 1 de 1" do print, e é ela que faz
     `coordenadasDaNavegacao` ter o que pedir. */
  const itens = [{
    id: 'e0', status: 'pendente', rotaOrdem: 0, quantidade: 1,
    cliente: {
      id: 'c0', nome: 'Casa', enderecoLinha: 'Rua Trinta, 100', bairro: 'Centro',
      lat: FIM[1], lng: FIM[0],
    },
  }];
  await p.evaluate(PONTE, { itens, rota });
  await p.evaluate(() => window.HBXRota.carregar());
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.ir('mapa'));
  await p.waitForFunction(
    () => !document.querySelector('#app .tela.sai') && !!document.querySelector('#app .tela .gps'),
    null, { timeout: 12000 },
  );
  await p.waitForTimeout(1500);

  const fita = [];
  for (const q of paradas) {
    const alvo = pt(q.n, q.o);
    await ctx.setGeolocation({ latitude: alvo[1], longitude: alvo[0], accuracy: 12 });
    await p.waitForTimeout(700);
    const c = await p.evaluate(LER_CARTAO);
    fita.push({ ...q, ...c });
    console.log(`  ${String(q.rotulo).padEnd(42)} → ${c.existe ? `"${c.dist} ${c.verbo}" · ${c.baixo || '—'}` : '(sem cartão)'}`);
  }
  await ctx.close();
  return { fita, erros };
}

/** o assert que vale nos dois casos: cada ponto diz a verdade daquele ponto */
function cobrarPontos(prefixo, fita) {
  const cobrados = fita.filter((f) => f.espera !== null);
  const errados = cobrados.filter((f) => f.verbo !== f.espera);
  eh(`${prefixo} em CADA ponto o cartão manda a manobra que aquele ponto pede`,
    errados.length === 0,
    errados.length
      ? errados.map((f) => `${f.rotulo}: esperava "${f.espera || '(nenhuma)'}", veio "${f.verbo || '(nenhuma)'}"`).join(' · ')
      : `${cobrados.length} pontos conferidos`);
}

(async () => {
  const pele = peleDoMock();
  const [srv, porta] = await servir();
  const navegador = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  console.log(`\nO L: sobe ${SUBIDA_M} m · dobra à ESQUERDA · ${TRAVESSA_M} m · dobra à DIREITA · ${SAIDA_M} m`);
  console.log(`fita com ${GEO.length} vértices · 4 passos (depart, esquerda, direita, arrive)`);

  /* ======================================================================
     CASO 1 — A CATRACA: o carro anda o L inteiro com UMA rota na memória.
     ====================================================================== */
  console.log('\n=== CASO 1 · o fantasma (turn left → turn right) ===');
  const c1 = await dirigir(navegador, pele, porta,
    rotaCom({ type: 'turn', modifier: 'left' }, { type: 'turn', modifier: 'right' }), O_L);
  const fita = c1.fita;
  const final = fita[fita.length - 1];

  if (c1.erros.length) eh('0. a página não quebrou', false, c1.erros[0]);

  cobrarPontos('A.', fita);

  const oPrint = fita.find((f) => f.n === 200 && f.o === 60);
  eh('A1. 60 m DEPOIS da esquerda o cartão não ressuscita a curva já feita',
    oPrint && oPrint.verbo === 'Vire à direita',
    oPrint ? `veio "${oPrint.dist} ${oPrint.verbo}"` : 'ponto não medido');

  const engolida = fita.find((f) => f.n === 180 && f.o === 0);
  eh('A2. 20 m ANTES da esquerda o cartão ainda manda virar à esquerda',
    engolida && engolida.verbo === 'Vire à esquerda',
    engolida ? `veio "${engolida.dist} ${engolida.verbo}"` : 'ponto não medido');

  const ordem = [];
  fita.forEach((f) => { if (!ordem.length || ordem[ordem.length - 1] !== f.verbo) ordem.push(f.verbo); });
  const voltou = ordem.filter((v, i) => v && ordem.indexOf(v) !== i);
  eh('B. manobra que saiu do cartão NUNCA volta (a catraca)',
    voltou.length === 0,
    `sequência: ${ordem.map((v) => v || '(vazio)').join(' → ')}`);

  const perto = fita.filter((f) => /^\d+ m$/.test(f.dist)).map((f) => parseInt(f.dist, 10));
  const menor = perto.length ? Math.min(...perto) : null;
  eh('C. o cartão consegue contar os últimos metros (< 30 m)',
    menor != null && menor < 30, `menor distância mostrada: ${menor == null ? '—' : `${menor} m`}`);

  const semManobra = fita.filter((f) => f.espera === '');
  eh('D. passada a última curva o cartão CALA (arrive não é manobra)',
    semManobra.every((f) => !f.verbo),
    semManobra.map((f) => `${f.rotulo}: "${f.verbo || '(vazio)'}"`).join(' · '));

  /* 🔴 A VOZ É O OUTRO CONSUMIDOR, e é por onde o defeito chegou. Sem a catraca,
     a fita saía com a esquerda anunciada duas vezes e a direita SEM o "agora" —
     o fantasma roubando o aviso da curva certa. */
  const falas = final.falas || [];
  const iDireita = falas.findIndex((f) => /direita/i.test(f));
  const ultimaEsquerda = falas.map((f, i) => (/esquerda/i.test(f) ? i : -1)).filter((i) => i >= 0).pop();
  eh('E. a voz anuncia a direita, e sempre DEPOIS da esquerda',
    iDireita >= 0 && (ultimaEsquerda == null || iDireita > ultimaEsquerda),
    falas.length ? falas.join(' | ') : 'a voz não falou nada');
  eh('E1. a voz dá a ordem da HORA nas DUAS curvas, não só na primeira',
    falas.filter((f) => !/^Em \d/.test(f)).length >= 2,
    `${falas.filter((f) => !/^Em \d/.test(f)).length} ordem(ns) de "agora"`);

  eh('F. uma rota só foi pedida — quem seguiu o carro foi o APP, não o roteador',
    final.osrm === 1, `${final.osrm} pedido(s) ao OSRM`);

  /* ======================================================================
     CASO 2 — A TABELA: os dois tipos que o app engolia ou traduzia errado.
     ====================================================================== */
  console.log('\n=== CASO 2 · a tabela (end of road → continue+uturn) ===');
  const c2 = await dirigir(navegador, pele, porta,
    rotaCom({ type: 'end of road', modifier: 'left' }, { type: 'continue', modifier: 'uturn' }), A_TABELA);

  if (c2.erros.length) eh('0b. a página não quebrou no caso 2', false, c2.erros[0]);
  cobrarPontos('G.', c2.fita);

  const noT = c2.fita.find((f) => f.n === 100);
  eh('G1. `end of road` é uma CURVA, não um passo que some da lista',
    noT && noT.verbo === 'Vire à esquerda',
    noT ? `veio "${noT.verbo || '(nenhuma)'}"` : 'ponto não medido');

  const retorno = c2.fita.find((f) => f.n === 200 && f.o === 60);
  eh('H. `uturn` manda VOLTAR — nunca "continue na rua"',
    retorno && retorno.verbo === 'Faça o retorno',
    retorno ? `veio "${retorno.verbo || '(nenhuma)'}"` : 'ponto não medido');

  await navegador.close();
  srv.close();

  console.log('');
  ok.forEach((l) => console.log(`  ok   ${l}`));
  falhou.forEach((l) => console.log(` FALHA ${l}`));
  console.log(falhou.length
    ? `\n❌ ${falhou.length} falha(s) — o fantasma está vivo`
    : `\n✅ ${ok.length} provas: a manobra do cartão é a da rua, em todo ponto do L`);
  process.exit(falhou.length ? 1 : 0);
})();
