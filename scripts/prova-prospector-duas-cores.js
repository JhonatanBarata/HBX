#!/usr/bin/env node
/**
 * PROVA DAS DUAS CORES DO PROSPECTOR (12/08) — a decisão do dono virou portão.
 *
 *     node scripts/prova-prospector-duas-cores.js
 *     node scripts/prova-prospector-duas-cores.js --antes    (só MEDE, não reprova)
 *
 * A DECISÃO: o prospector fica DESLIGADO pra todos até a PESSOA acionar e escolher
 * o TIPO de empresa que interessa a ela na SEMANA. Os prédios do corredor passam a
 * ter DUAS cores — AZUL é o padrão (ambiente, e é MUDO); VERDE são as do tipo
 * escolhido, e só elas acendem rótulo. Mesmo desenho, mesma cena de nascer e
 * crescer: muda só a tinta.
 *
 * ⚠️ ESTA PROVA RODA CONTRA A CASCA DE VERDADE (`assets/app/index.html` + o
 * `ponte.js` costurado), com um servidor DUBLADO na frente — igual à prova da
 * manobra fantasma. É de propósito: metade das travas desta frente mora na PONTE
 * (`aplicarProspector` e `vestirFase`), e prova que só olha o mock não veria
 * nenhuma delas. A outra metade (o template e os tokens) o mock responde, e
 * `casca-conferir` já garante mock ≡ casca byte a byte.
 *
 * O QUE ESTÁ TRANCADO AQUI:
 *   1. ESCOLHIDA é VERDE e NÃO-ESCOLHIDA é AZUL — medido no `fill` RESOLVIDO do
 *      telhado, não na classe. Classe é intenção; cor é o que a pessoa vê.
 *   2. AZUL NUNCA ACENDE, nem quando o SERVIDOR ERRA. O dublê manda `aceso:true`
 *      numa empresa `escolhida:false` — o caso que nunca deveria existir. Se o
 *      prédio azul ganhar `on`, rótulo e halo, a prova reprova.
 *   3. AZUL NÃO ACENDE NEM NO DEDO. Encostar num prédio de ambiente não pode
 *      acender — senão o gesto abre pela lateral o que a escolha da semana fecha.
 *   4. AUSENTE ≠ VAZIO continua valendo: payload SEM a chave `prospector` não
 *      desenha nada e não APAGA o que já estava (a lei de 08/08).
 *   5. O RAIO-X (`window.__hbxProspector`) conta o que chegou e o que está no ar —
 *      é a pendência da "dirigida instrumentada" (servidor verde, tela muda).
 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');
const { regenerarGerados } = require('./_regenerar');

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

/* Rio Claro, a mesma quadra das outras provas. A parada fica 200 m ao norte e as
   empresas nascem em volta dela — perto o bastante pra régua de viagem deixar
   todas nascerem, que é o que faz a cor ser medível. */
const BASE = { lat: -22.4126, lng: -47.5763 };
const M_LAT = 1 / 110540;
const M_LNG = 1 / (111320 * Math.cos((BASE.lat * Math.PI) / 180));
const pt = (n, o) => [BASE.lng - (o * M_LNG), BASE.lat + (n * M_LAT)];
const FIM = pt(200, 0);

/* AS QUATRO EMPRESAS DA RUA. Duas do tipo escolhido (verdes) e duas de ambiente
   (azuis) — e a última é a ARMADILHA: `escolhida:false` com `aceso:true`, que é o
   servidor errando. Nenhuma trava pode depender de esse caso não acontecer. */
const EMPRESAS = [
  { id: '11111111000191', cnpj: '11111111000191', nome: 'Padaria Aurora', ramo: 'Padaria', distM: 30, escolhida: true, aceso: true },
  { id: '22222222000192', cnpj: '22222222000192', nome: 'Mercado Central', ramo: 'Mercado', distM: 45, escolhida: false, aceso: false },
  { id: '33333333000193', cnpj: '33333333000193', nome: 'Panificadora Sol', ramo: 'Padaria', distM: 60, escolhida: true, aceso: false },
  { id: '44444444000194', cnpj: '44444444000194', nome: 'Bar do Ze', ramo: 'Bar', distM: 75, escolhida: false, aceso: true },
];

/* 🔴 A ROTA PRECISA EXISTIR PRA O PRÉDIO NASCER, e isso é uma DESCOBERTA desta
   prova, não um detalhe de bancada. A régua de viagem (`reguaDaViagem`) precisa
   de RUMO; o rumo vem do aparelho quando o carro anda, e quando não vem, da
   ROTA (`rumoDaRota`). Sem nenhum dos dois a régua é NULA — e régua nula deixa
   TODA empresa na fase 0: elas existem no DOM, com a cor certa, e simplesmente
   não aparecem. É a cara exata do "servidor verde, tela muda" medido no g15 em
   12/08 (24 empresas embarcadas, ZERO prédios).
   Por isso o dublê serve uma rota reta subindo pro norte: é o que o motorista
   real tem quando está navegando, e é a condição em que a cor É visível. O
   `window.__hbxProspector.reguaNula` continua medido nos dois casos — quem
   investigar o defeito no aparelho olha exatamente esse campo. */
const ROTA_RETA = {
  code: 'Ok',
  routes: [{
    distance: 200,
    duration: 40,
    geometry: { type: 'LineString', coordinates: [pt(0, 0), pt(200, 0)] },
    legs: [{
      steps: [
        { name: 'Rua Trinta', maneuver: { type: 'depart', modifier: 'straight', location: pt(0, 0) }, geometry: { type: 'LineString', coordinates: [pt(0, 0), pt(200, 0)] } },
        { name: '', maneuver: { type: 'arrive', modifier: 'straight', location: pt(200, 0) }, geometry: { type: 'LineString', coordinates: [pt(200, 0), pt(200, 0)] } },
      ],
    }],
  }],
};

const PONTE = ({ itens, empresas, alvo, rota }) => {
  window.__hbxPediu = [];
  window.HBX = {
    api(caminho) {
      window.__hbxPediu.push(caminho);
      if (caminho.indexOf('/logistica/osrm/route') === 0) {
        return Promise.resolve(JSON.parse(JSON.stringify(rota)));
      }
      if (caminho.indexOf('/logistica/rota?') === 0) {
        return Promise.resolve({
          items: itens, routeStatus: 'ACTIVE', routeId: 'r1', moduloFinanceiroAtivo: false,
          // AUSENTE ≠ VAZIO: `empresas === null` significa "o servidor não mandou a
          // chave" (prospector desligado / sem escolha), NÃO "hoje não tem empresa".
          ...(empresas ? {
            prospector: {
              rotaDia: '2026-08-12', raioM: 150, acendeNoDia: 4, persistido: true,
              tipo: 'padaria', tipoRotulo: 'Padarias e confeitarias',
              empresas: empresas.map((e) => ({
                ...e,
                lat: alvo[1] + (e.distM * (1 / 110540)),
                lng: alvo[0],
              })),
            },
          } : {}),
        });
      }
      if (caminho.indexOf('/logistica/agenda') === 0) return Promise.resolve({ dias: [] });
      if (caminho.indexOf('/logistica/dia-preview') === 0) return Promise.resolve({ clientes: [] });
      if (caminho.indexOf('/logistica/prospector/semana') === 0) {
        return Promise.resolve({
          semana: '2026-W33', tipo: 'padaria', rotulo: 'Padarias e confeitarias',
          tipos: [{ slug: 'padaria', rotulo: 'Padarias e confeitarias' }, { slug: 'bar', rotulo: 'Bares' }],
        });
      }
      if (caminho.indexOf('/logistica/config') === 0) {
        return Promise.resolve({ prospectorAtivo: true, prospectorDisponivel: true, prospectorEquipe: true });
      }
      return Promise.resolve({});
    },
    requestLocationPermission() {}, manterTelaAcesa() {}, modoNavegacao() {}, speak() {},
    soundPrefs: { get: () => ({}), set: () => {} },
  };
  window.HBXApp = window.HBXApp || {};
};

/* A RÉGUA É A COR RESOLVIDA, não a classe. Classe é o que o código quis dizer;
   `fill` computado é o que a pessoa vê — e é onde um seletor com especificidade
   errada apareceria. Também lê o rótulo (opacidade do `.emp-rotulo`), que é o
   "só elas falam" da decisão do dono. */
const LER_PREDIOS = () => {
  const rgb = (t) => {
    const m = String(t || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const n = m[1].split(',').map((x) => Math.round(Number(x)));
    return { r: n[0], g: n[1], b: n[2] };
  };
  return [...document.querySelectorAll('.emp[data-empresa]')].map((el) => {
    const topo = el.querySelector('.emp-topo');
    const rot = el.querySelector('.emp-rotulo');
    return {
      id: el.dataset.empresa,
      nome: (el.querySelector('.emp-nome') || {}).textContent || '',
      escolhida: el.classList.contains('escolhida'),
      on: el.classList.contains('on'),
      noAr: el.classList.contains('no-ar'),
      cor: topo ? rgb(getComputedStyle(topo).fill) : null,
      rotuloOp: rot ? Number(getComputedStyle(rot).opacity) : null,
      visivel: el.style.visibility !== 'hidden',
    };
  });
};

/** azul = o canal B manda com folga · verde = o canal G manda com folga */
const ehAzul = (c) => !!c && c.b > c.r + 20 && c.b > c.g + 20;
const ehVerde = (c) => !!c && c.g > c.b + 20 && c.g > c.r;

const ok = [];
const falhou = [];
const notas = [];
const eh = (nome, cond, medida) => (cond ? ok : falhou).push(nome + (cond ? '' : `  [${medida}]`));
const nota = (t) => notas.push(t);
const SO_MEDIR = process.argv.includes('--antes');

async function dirigir(navegador, pele, porta, empresas) {
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

  const itens = [{
    id: 'e0', status: 'pendente', rotaOrdem: 0, quantidade: 1,
    cliente: { id: 'c0', nome: 'Casa', enderecoLinha: 'Rua Trinta, 100', bairro: 'Centro', lat: FIM[1], lng: FIM[0] },
  }];
  await p.evaluate(PONTE, { itens, empresas, alvo: FIM, rota: ROTA_RETA });
  await p.evaluate(() => window.HBXRota.carregar());
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.ir('mapa'));
  await p.waitForFunction(
    () => !document.querySelector('#app .tela.sai') && !!document.querySelector('#app .tela .gps'),
    null, { timeout: 15000 },
  );
  // a câmera precisa TERMINAR de entrar: com o mundo em pé nenhum prédio existe
  // (a trava `cameraEntrando`), e medir ali seria medir a tela errada.
  await p.waitForTimeout(6000);
  // anda até quase a parada: é o que faz a régua de viagem deixar todas nascerem.
  const perto = pt(170, 0);
  await ctx.setGeolocation({ latitude: perto[1], longitude: perto[0], accuracy: 12 });
  await p.waitForTimeout(1500);

  return { p, ctx, erros };
}

(async () => {
  regenerarGerados();
  const [servidor, porta] = await servir();
  const pele = peleDoMock();
  const b = await chromium.launch();

  // ═══ CENA 1 — a rua com as duas cores ═══════════════════════════════════════
  const cena1 = await dirigir(b, pele, porta, EMPRESAS);
  const predios = await cena1.p.evaluate(LER_PREDIOS);
  const raio = await cena1.p.evaluate(() => window.__hbxProspector);
  predios.forEach((e) => nota(
    `${e.nome.padEnd(20)} escolhida=${e.escolhida ? 1 : 0} on=${e.on ? 1 : 0} `
    + `cor=${e.cor ? `${e.cor.r},${e.cor.g},${e.cor.b}` : '-'} rotulo=${e.rotuloOp}`,
  ));
  nota(`raio-x: ${JSON.stringify(raio)}`);

  eh('C1 · as 4 empresas do servidor viraram prédio na tela', predios.length === 4, `desenhou ${predios.length}`);

  const verdes = predios.filter((e) => e.escolhida);
  const azuis = predios.filter((e) => !e.escolhida);
  eh('C2 · o servidor mandou 2 escolhidas e a tela vestiu 2', verdes.length === 2, `vestiu ${verdes.length}`);

  eh('C3 · ESCOLHIDA pinta VERDE (o telhado, cor resolvida)',
    verdes.length > 0 && verdes.every((e) => ehVerde(e.cor)),
    JSON.stringify(verdes.map((e) => e.cor)));
  eh('C4 · NAO-ESCOLHIDA pinta AZUL (ambiente)',
    azuis.length > 0 && azuis.every((e) => ehAzul(e.cor)),
    JSON.stringify(azuis.map((e) => e.cor)));

  /* 🔴 A TRAVA QUE MAIS IMPORTA. "Bar do Ze" chegou `escolhida:false, aceso:true`
     — o servidor errando. Prédio azul com `on` seria rótulo, halo e convite pra
     parar o carro por uma empresa que a pessoa não escolheu. */
  eh('C5 · AZUL nunca ganha `on`, NEM COM `aceso:true` do servidor',
    azuis.every((e) => !e.on), JSON.stringify(azuis.map((e) => [e.nome, e.on])));
  eh('C6 · AZUL nunca mostra rótulo (ambiente é MUDO)',
    azuis.every((e) => !e.rotuloOp), JSON.stringify(azuis.map((e) => [e.nome, e.rotuloOp])));

  eh('C7 · a rua toda NASCEU (mesma cena pros dois: a cor não muda o desenho)',
    predios.every((e) => e.noAr), JSON.stringify(predios.map((e) => [e.nome, e.noAr])));

  eh('C8 · o raio-x conta o que chegou e o que é do tipo',
    raio && raio.recebidas === 4 && raio.escolhidas === 2 && raio.tipo === 'padaria',
    JSON.stringify(raio));
  eh('C9 · o raio-x sabe quantas estão NO AR (dirigida instrumentada)',
    raio && raio.noAr > 0 && raio.reguaNula === false, JSON.stringify(raio));

  /* 🔴 O DEDO TAMBÉM RESPEITA A ESCOLHA. Encostar num azul não pode acender: o
     gesto adianta o que o prospector faria sozinho, e ele não faria isso. */
  const azulTocado = azuis[0];
  const depoisDoDedo = await cena1.p.evaluate((id) => {
    const el = document.querySelector(`.emp[data-empresa="${id}"]`);
    if (el) el.click();
    return new Promise((fim) => setTimeout(() => {
      const alvo = document.querySelector(`.emp[data-empresa="${id}"]`);
      fim({ on: !!alvo && alvo.classList.contains('on'), existe: !!alvo });
    }, 400));
  }, azulTocado.id);
  nota(`dedo no AZUL (${azulTocado.nome}): on=${depoisDoDedo.on ? 1 : 0}`);
  eh('C10 · encostar num prédio AZUL não o acende', !depoisDoDedo.on, JSON.stringify(depoisDoDedo));

  const verdeApagado = predios.find((e) => e.escolhida && !e.on);
  if (verdeApagado) {
    const depois = await cena1.p.evaluate((id) => {
      const el = document.querySelector(`.emp[data-empresa="${id}"]`);
      if (el) el.click();
      return new Promise((fim) => setTimeout(() => {
        const alvo = document.querySelector(`.emp[data-empresa="${id}"]`);
        fim({ on: !!alvo && alvo.classList.contains('on') });
      }, 400));
    }, verdeApagado.id);
    nota(`dedo no VERDE apagado (${verdeApagado.nome}): on=${depois.on ? 1 : 0}`);
    eh('C11 · encostar num prédio VERDE apagado ACENDE (o dedo continua mandando)',
      depois.on, JSON.stringify(depois));
  } else {
    nota('C11 pulada: nenhuma verde apagada nesta cena');
  }

  eh('C12 · nenhum erro de página na cena das duas cores', cena1.erros.length === 0, cena1.erros.join(' | '));
  await cena1.ctx.close();

  // ═══ CENA 2 — AUSENTE ≠ VAZIO: sem a chave, a rua não tem prédio ════════════
  const cena2 = await dirigir(b, pele, porta, null);
  const semChave = await cena2.p.evaluate(LER_PREDIOS);
  const raio2 = await cena2.p.evaluate(() => window.__hbxProspector);
  nota(`sem a chave prospector: ${semChave.length} prédio(s) · raio-x recebidas=${raio2 && raio2.recebidas}`);
  eh('C13 · payload SEM a chave `prospector` não desenha prédio nenhum',
    semChave.length === 0, `desenhou ${semChave.length}`);
  eh('C14 · e não mexe no raio-x (ausente é "não sei", não "zero")',
    raio2 && raio2.recebidas === 0, JSON.stringify(raio2));
  eh('C15 · nenhum erro de página com o prospector desligado',
    cena2.erros.length === 0, cena2.erros.join(' | '));
  await cena2.ctx.close();

  await b.close();
  servidor.close();

  console.log('\n=== MEDIDAS ===');
  notas.forEach((n) => console.log('  · ' + n));
  console.log('\n=== PROVA: as duas cores do prospector ===');
  ok.forEach((n) => console.log('  ok  ' + n));
  falhou.forEach((n) => console.log('  XX  ' + n));
  console.log('\n' + ok.length + '/' + (ok.length + falhou.length));
  process.exit(SO_MEDIR ? 0 : (falhou.length ? 1 : 0));
})();
