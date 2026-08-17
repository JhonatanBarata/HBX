#!/usr/bin/env node
/**
 * PROVA DO IR E VIR — a troca de câmera entre o mapa 2D e o 3D, medida na fita.
 *
 *     node scripts/prova-ir-e-vir.js
 *
 * 🔴 POR QUE ELA EXISTE (dono, 16/08: *"corrija o efeito de ir e vir entre os 2,
 * não quero essa travação nojenta, quero efeito subindo e descendo, reverso bem
 * feito sem travação alguma, e ao assentar o efeito das ruas acendendo nos 2"* —
 * seguido de *"não remonte efeito, tudo isso já existe! só realinhe"*).
 *
 * A medição de 16/08 achou UM defeito servindo os dois sentidos: a coreografia
 * era comandada por RELÓGIOS DE DESISTÊNCIA em vez dos sinais que as peças já
 * emitiam, e a volta era um `clearTimeout` onde a ida tinha um gesto. O que esta
 * prova vigia, e que nenhuma outra pegava:
 *
 *   A) A CURVA DA SAÍDA É A DE QUEM SAI. As duas camadas que deixam a tela cheia
 *      usavam `--cv-entra` — a curva de quem CHEGA. Medido: 95% do movimento
 *      gasto nos primeiros ~250 ms e a camada viva até ~585 ms, ou seja 230 a
 *      330 ms de tela parada com duas camadas no ar, toda vez, nos dois sentidos.
 *      É a "travação" literal, e é a única regra da folha em que a Lei 2 dela
 *      mesma não valia.
 *   B) A CENA DAS RUAS ACENDE NOS DOIS. Na ida ela já acendia (palco 'gps'); na
 *      volta, não — não por guarda, por CHAMADOR FALTANDO. O motivo 'rota' já
 *      existia, já apontava pro palco 'geral' e já tinha ritmo próprio.
 *   C) A VOLTA TEM SUBIDA. `pararDescida` era quatro linhas de cancelamento. A
 *      subida não precisou nascer: é o `vistaGeral` — que já calculava a pose de
 *      cima com o mesmo recuo do puck — ganhando um argumento de duração.
 *   D) NADA DISSO REENCENA O QUE JÁ ESTAVA NA TELA (a lei de 15/08: voltar da
 *      folha da venda não é entrar na rota).
 *
 * A régua é a FITA, não o estado final — mesma escolha do `prova-navegar`.
 *
 * 🔴 17/08 — ELA PASSOU A COBRAR A COREOGRAFIA NOVA (itens 4 e 5 do contrato
 * § `docs/PLANEJAMENTOS/PR17082026-2D-3D-UMA-TELA-SO.md`). O dono, com as 8
 * fotos na mão: *"a tela não tem mais motivo para piscar tudo, ambos os estados
 * têm q ser idênticos"*. Duas frentes, e as duas nascem VERMELHAS aqui de
 * propósito — a casca ainda não mudou:
 *
 *   E) A TROCA 2D⇄3D NÃO ANIMA CAMADA, ANIMA PEÇA (D5). A camada que entra e a
 *      que sai param de rodar `mvCheio*`, o `.mapa-palco` para de escalar, e
 *      quem se move são as peças: a manobra (foto 4) entrando por cima, o
 *      `.plano-topo` (foto 5) recolhendo pra cima, a bússola (foto 6) existindo
 *      só no 3D. A régua do "cumpre o show" (A, acima) mudou de DONO junto —
 *      ver o teto do `T95_DA_PECA_QUE_SAI` pro porquê inteiro.
 *   F) A CENA DE MONTAR VALE NOS DOIS POUSOS (item 5). Entrando na tela do mapa
 *      com rota nova, a camada nasce `cena cheio` e o véu escurece — no 3D e
 *      TAMBÉM no 2D, que hoje não é nem tela cheia (`TELA_CHEIA=['mapa']`).
 *
 * O que continua de pé, palavra por palavra, porque é memória de dois bugs
 * pagos em 16/08: o mapa é o MESMO OBJETO dos dois lados (1.2/2.2) e a camada
 * que sai NÃO COBRE o mapa vivo (1.1b/2.1b).
 *
 * 🔴 E O VERDE DESTAS RÉGUAS FOI PROVADO POR MUTAÇÃO, não por sorte. Elas
 * nasceram pra ser vermelhas (a casca não tinha `.plano-topo` nem `troca-desce`),
 * mas a casca foi entregue por outra sessão no meio deste lote e o primeiro
 * `node scripts/prova-ir-e-vir.js` já saiu 24/24 — e verde que nasce verde não
 * prova nada (§ `scripts/_regenerar.js`: "red-first sobre gerado velho CERTIFICA
 * o contrário do que aconteceu"). Então a régua foi conferida ao contrário, com
 * a pele MUTADA fora do repo (`mvCheioEntra`/`mvCheioSai` de volta na camada,
 * `mvMapaFoco` de volta no palco, `animation:none` nas peças e no véu):
 * reprovaram exatamente as dez linhas novas — 1.1, 1.6, 1.7, 1.8, 2.1, 2.6, 2.7,
 * 2.8, 4.2 e 4.4 —, placar 14/24, e as catorze antigas ficaram de pé. 4.1/4.3
 * seguiram verdes na mutação porque marca de JS não se desfaz por CSS: é
 * justamente por isso que elas nunca vêm sozinhas (ver o comentário do par).
 *
 * (bancada igual à do `prova-navegar`: servidor estático, pele do mock-fonte,
 *  dublê do `window.HBX` DEPOIS do boot, armadilha do basemap.)
 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');
const { regenerarGerados } = require('./_regenerar');

const RAIZ = path.join(__dirname, '..', 'EntregaShell', 'app', 'src', 'logistica');
const MOCK = path.join(__dirname, '..', 'docs', 'mockups', 'logistica2.0', 'logistica-2.0.html');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

/* 🔴 COMO SE MEDE "TRAVAÇÃO", E POR QUE NÃO É POR SCREENSHOT. A primeira versão
   desta prova comparava hashes de print a cada 50 ms e reprovava com 505 ms de
   "tela parada" — MAS a bancada é swiftshader: cada print custa mais que o
   intervalo, e o mapa em software não redesenha entre eles. A régua media a
   BANCADA, não o app. Prova que reprova por ruído é prova que se aprende a
   ignorar (a própria casa escreve isso no teto do `prova-navegar`).
   O que se mede aqui é DETERMINÍSTICO e é código, não GPU: quanto do próprio
   show a camada que sai conseguiu cumprir antes de deixar a tela. Saída
   arrancada no quadro zero, ou cortada na metade, é defeito de fluxo — e foi
   exatamente o que a medição de 16/08 achou na volta (um `clearTimeout` onde a
   ida tinha um gesto).
   ⚠️ O ENGASGO QUE SOBRA NÃO É ESTA RÉGUA. Medido na ida: o relógio da animação
   de saída congela em 433 de 520 ms por ~266 ms, enquanto a thread monta o
   maplibre. Isso é trabalho de quadro, não curva nem fluxo, e a bancada mede com
   GPU emulada (swiftshader) — o número do aparelho é outro. Cobrar ausência de
   jank AQUI seria a prova reprovando a bancada. */
const PISO_SHOW = 0.6;

/* 🔴 AS DUAS PEÇAS DA TROCA (17/08, item 4 do contrato §
   `docs/PLANEJAMENTOS/PR17082026-2D-3D-UMA-TELA-SO.md`, e são as fotos 4 e 5 do
   dono). O item 4 inteiro é uma frase: *"a tela não tem mais motivo para piscar
   tudo, ambos os estados têm q ser idênticos"*. Quem se move na troca 2D⇄3D
   deixou de ser a CAMADA e passou a ser a PEÇA (D5): na ida (2D→3D) a manobra
   ENTRA por cima e o topo do 2D RECOLHE pra cima; na volta é o inverso, item por
   item. Os dois nomes moram aqui uma vez só porque a prova faz as MESMAS
   perguntas nos dois sentidos com os papéis trocados — papel trocado à mão nas
   duas pontas é a receita de as duas pontas discordarem amanhã. */
const MANOBRA = '.gps-manobra';   // a foto 4: o cartão da manobra, peça do 3D
const TOPO_2D = '.plano-topo';    // a foto 5: cabeçalho flutuante + barra de paradas (D2)

/* A família de animação que é da CAMADA INTEIRA — `mvCheioEntra`, `mvCheioSai`,
   `mvCheioVolta`, `mvCheioVoltaSai` e a variante clara `mvCheioSaiClaro`. Um
   prefixo em vez de cinco nomes: a lei do item 4 é da FAMÍLIA (nada que escale
   e apague a tela inteira roda numa troca de modo), não de um nome que amanhã
   pode virar outro. */
const CAMADA_CHEIO = /^mvCheio/;

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

const BASE = { lat: -22.4126, lng: -47.5763 };
const aoNorte = (m) => BASE.lat + (m / 110540);

const paradaFalsa = (i) => ({
  id: `e${i}`, status: 'pendente', rotaOrdem: i, quantidade: 1,
  cliente: {
    id: `c${i}`, nome: `Cliente ${i + 1}`,
    enderecoLinha: `Rua ${i + 1}, 100`, bairro: 'Centro',
    lat: aoNorte(700 * (i + 1)), lng: BASE.lng,
  },
});

/* o dublê do basemap: sem tile no disco, `querySourceFeatures` devolve vazio e a
   cena das ruas encerra em 'sem-rua' — o desfecho honesto do app, que mediria
   esta prova contra o nada. Mesma armadilha do `prova-navegar`/`prova-cena-ruas`. */
const RUAS_FALSAS = (eu) => {
  const N = 8;
  const passo = 0.0035;
  const meio = ((N - 1) * passo) / 2;
  const f = [];
  for (let i = 0; i < N; i += 1) {
    const lat = eu.lat - meio + (i * passo);
    const c = [];
    for (let k = 0; k <= 4; k += 1) c.push([eu.lng - meio + ((k * (N - 1) * passo) / 4), lat]);
    f.push({ type: 'Feature', properties: { name: `Rua ${i}`, kind: i === 3 ? 'major_road' : 'minor_road' }, geometry: { type: 'LineString', coordinates: c } });
  }
  for (let i = 0; i < N; i += 1) {
    const lng = eu.lng - meio + (i * passo);
    const c = [];
    for (let k = 0; k <= 4; k += 1) c.push([lng, eu.lat - meio + ((k * (N - 1) * passo) / 4)]);
    f.push({ type: 'Feature', properties: { name: `Avenida ${i}`, kind: i === 4 ? 'highway' : 'minor_road' }, geometry: { type: 'LineString', coordinates: c } });
  }
  return f;
};

const ARMADILHA = (ruas) => {
  window.__ruas = ruas;
  let real;
  Object.defineProperty(window, 'maplibregl', {
    configurable: true,
    get() { return real; },
    set(v) {
      real = v;
      try {
        const P = v.Map.prototype;
        const antigo = P.querySourceFeatures;
        P.querySourceFeatures = function (id, o) {
          if (id === 'protomaps' && o && o.sourceLayer === 'roads') return window.__ruas || [];
          return antigo.call(this, id, o);
        };
      } catch (_) { /* versão sem Map: a prova reprova sozinha */ }
    },
  });
};

const PONTE = ({ itens, geo }) => {
  window.HBX = {
    api(caminho) {
      if (caminho.indexOf('/logistica/rota?') === 0) {
        return Promise.resolve({
          items: itens, routeStatus: 'ACTIVE', routeId: 'r1', moduloFinanceiroAtivo: false,
        });
      }
      if (caminho.indexOf('/logistica/osrm/route') === 0) {
        return Promise.resolve({
          code: 'Ok',
          routes: [{
            distance: 4200, duration: 640,
            geometry: { type: 'LineString', coordinates: geo },
            legs: [{ steps: [{ maneuver: { type: 'turn', modifier: 'right', location: geo[3] }, name: 'Rua Sete' }] }],
          }],
        });
      }
      if (caminho.indexOf('/logistica/agenda') === 0) return Promise.resolve({ dias: [] });
      if (caminho.indexOf('/logistica/dia-preview') === 0) return Promise.resolve({ clientes: [] });
      return Promise.resolve({});
    },
    requestLocationPermission() {}, manterTelaAcesa() {}, modoNavegacao() {}, speak() {},
  };
  window.HBXApp = window.HBXApp || {};
};

/* A FITA. Ela olha as DUAS camadas, não só a de cima: metade do defeito da
   troca mora na camada que está SAINDO (o mapa dela continua vivo e visível).
   Os seletores das peças chegam por ARGUMENTO porque esta função é serializada
   pra dentro da página: constante de Node não existe do outro lado do vidro. */
const AMOSTRAR = (sel) => {
  window.__fita = [];
  window.__t0 = performance.now();
  /* 🔴 UM PALCO SÓ (16/08). A fita pedia o mapa por NOME ('gps' / 'geral') —
     e não existe mais nome: existe UM mapa que muda de camada. A régua passou
     a ser a identidade do OBJETO (um carimbo no próprio maplibre), que é o que
     prova a promessa nova: quem troca de estado não troca de mapa. */
  let seq = 0;
  const mapaVivo = () => {
    const palco = document.querySelector('#app .tela [data-mapa]');
    const m = (palco && palco.__hbxMapaObj) || null;
    if (m && !m.__hbxMarca) { seq += 1; m.__hbxMarca = `m${seq}`; }
    return m;
  };
  const mapaDe = () => mapaVivo();
  const ruasDe = (mapa) => {
    try { return mapa && mapa.getStyle ? (mapa.getStyle().layers || []).filter((l) => /^hbx-cena-ruas-/.test(l.id)).length : 0; }
    catch (_) { return 0; }
  };
  /* 🔴 QUEM ESTÁ SE MOVENDO, PERGUNTADO AO PRÓPRIO NÓ (17/08, item 4).
     `getAnimations({subtree:false})` devolve as animações vivas NAQUELE nó — é
     resultado, não marca: uma classe `troca-desce` que não anima nada sai zerada
     aqui, e é exatamente isso que a régua tem que enxergar. `subtree:false` é de
     propósito nas peças também: o gesto é da PEÇA (§ D2, "os dois viajam juntos
     numa peça só"); filho piscando por dentro não é o topo recolhendo.
     `running` inclui a fase de ESPERA (o véu tem 220 ms de atraso) — peça
     esperando a vez está coreografada; peça `finished` já cumpriu o gesto. */
  const vivas = (el) => {
    if (!el || !el.getAnimations) return [];
    try {
      return el.getAnimations({ subtree: false })
        .filter((a) => a.playState === 'running' && a.effect
          && Number(a.effect.getTiming().duration) > 0);
    } catch (_) { return []; }
  };
  const nomes = (el) => vivas(el).map((a) => a.animationName || '?');
  /* "ANIMAÇÃO DE ESCALA" SE LÊ NOS KEYFRAMES COMPUTADOS, nunca no nome dela: é
     o que continua verdadeiro se o `mvMapaFoco` mudar de nome ou vier outro por
     cima. O segundo teste (o transform COMPUTADO fora da identidade) é a mesma
     pergunta pelo outro lado — se o mapa está deformado na tela, alguém o
     deformou, com animação ou sem. */
  const mexeTransform = (a) => {
    try {
      return (a.effect.getKeyframes() || [])
        .some((k) => typeof k.transform === 'string' && k.transform && k.transform !== 'none');
    } catch (_) { return false; }
  };
  const IDENTIDADE = /^(none|matrix\(1, 0, 0, 1, 0, 0\)|matrix3d\(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1\))$/;
  const transformado = (el) => {
    try { return !IDENTIDADE.test(getComputedStyle(el).transform || 'none'); }
    catch (_) { return false; }
  };
  const PECAS = [sel.manobra, sel.topo];
  const tira = () => {
    const t = Math.round(performance.now() - window.__t0);
    const camadas = [...document.querySelectorAll('#app .tela')];
    const m = mapaDe();
    /* 🔴 A CAMADA QUE SAI NÃO PODE COBRIR O MAPA (16/08). Com um palco só, o
       mapa já é da camada que ENTRA — a que sai fica com o palco vazio, e palco
       vazio pinta `--map-fundo`: um retângulo escuro por cima do mapa vivo
       durante o show inteiro. A marca `so-cromo` tira o fundo das três peças
       (camada, tela e palco); aqui se mede o RESULTADO, não a marca. */
    const sai = camadas.find((c) => c.classList.contains('sai'));
    const opaco = (el) => {
      if (!el) return false;
      const c = getComputedStyle(el).backgroundColor || '';
      const m2 = c.match(/[\d.]+/g);
      return !(c === 'transparent' || (m2 && m2.length > 3 && Number(m2[3]) === 0));
    };
    const palcoSai = sai ? sai.querySelector('.mapa-palco') : null;
    /* OS PALCOS DAS DUAS CAMADAS. Na troca só um deles tem o mapa dentro (é UM
       nó, ele muda de pai), mas os dois estão na tela — e escala no palco vazio
       aparece igual, porque o que o olho vê é o retângulo se mexendo. */
    const palcos = [...document.querySelectorAll('#app .tela .mapa-palco')];
    const pecas = {};
    PECAS.forEach((s) => {
      const nos = [...document.querySelectorAll(`#app .tela ${s}`)];
      pecas[s] = { n: nos.length, vivas: nos.reduce((soma, el) => soma + vivas(el).length, 0) };
    });
    window.__fita.push({
      t,
      saiCobre: !!sai && (opaco(sai) || opaco(sai.querySelector('.gps, .plano')) || opaco(palcoSai)),
      camadas: camadas.length,
      // o ESTADO lido do desenho (a casca não expõe  no window):
      //  é a tela de dirigir,  é o 2D.
      modo: document.querySelector('#app .tela .gps') ? '3d'
        : (document.querySelector('#app .tela .plano') ? '2d' : ''),
      marca: m ? m.__hbxMarca : null,
      pitch: m ? Math.round(m.getPitch()) : null,
      ruas: ruasDe(m),
      // ---- item 4: quem se move, e quem NÃO pode se mover ----
      animCamada: camadas.reduce((fora, c) => fora.concat(nomes(c)), []),
      animPalco: palcos.reduce((fora, el) => fora.concat(nomes(el)), []),
      palcoEscala: palcos.some((el) => vivas(el).some(mexeTransform) || transformado(el)),
      pecas,
      // a foto 6: a bússola existe no 3D e some no 2D
      bussola: !!document.querySelector('#app .tela .gps-bussola'),
      // as marcas de cada camada, DIAGNÓSTICO e não régua (ver `coreografia`)
      marcas: camadas.map((c) => [...c.classList].filter((k) => k !== 'tela').join('.') || '(nua)'),
      // o rumo do seam, só pra separar "não tem bússola" de "não tem rumo"
      rumo: (typeof DADOS !== 'undefined' && DADOS.gps) ? (DADOS.gps.rumo || '') : '?',
    });
  };
  window.__amostra = setInterval(tira, 50);
  tira();
};

/* 🔴 TOCAR NA CASCA SEM MORRER COM ELA (17/08, e custou uma rodada desta prova).
   `window.ir` e `window.usarDados` chamam `pintar`, e um erro DENTRO do desenho
   sobe como exceção do `evaluate` e mata o processo sem imprimir placar nenhum
   ("ReferenceError: remontarChat is not defined" — casca meio-editada por outra
   sessão, uma peça chamada antes de existir). Prova sem placar não diz nada;
   prova vermelha com o erro na medida diz tudo — e as asserções 3.1/4.5 existem
   exatamente pra cobrar isso. Nada de `new Function` aqui: a página roda com CSP
   estrita e a fábrica de função é barrada (o `evaluate` do Playwright passa pelo
   protocolo, não pela folha, e por isso funciona). */
const IR = (destino) => {
  try { window.ir(destino); }
  catch (e) {
    window.__erroCasca = window.__erroCasca || [];
    window.__erroCasca.push(`ir('${destino}'): ${(e && e.message) || e}`);
  }
};
const SEAM = (par) => {
  try { window.usarDados(par.secao, par.dado); }
  catch (e) {
    window.__erroCasca = window.__erroCasca || [];
    window.__erroCasca.push(`usarDados('${par.secao}'): ${(e && e.message) || e}`);
  }
};
/** o que a casca gritou por dentro e o `pageerror` não viu (porque foi pego) */
const gritos = (p) => p.evaluate(() => {
  const fora = window.__erroCasca || [];
  window.__erroCasca = [];
  return fora;
});

const ok = [];
const falhou = [];
const notas = [];
const nota = (s) => notas.push(s);
const eh = (nome, cond, medida) => {
  const linha = nome + (medida ? `  [${medida}]` : '');
  (cond ? ok : falhou).push(linha);
};

/* Onde o movimento da SAÍDA acontece dentro da janela dela. Lê a animação pela
   API do próprio navegador (`getAnimations`), então não depende de print nem de
   GPU: pergunta a quem sai onde ele está em cada instante do próprio show, e
   devolve a fração da janela em que o movimento já foi.

   🔴 MESMA RÉGUA, OUTRO DONO: A PEÇA (17/08, item 4 do contrato). Até 16/08 ela
   media a animação da CAMADA que sai (`mvCheioSai`/`mvCheioVoltaSai`) — e o item
   4 PROÍBE essa animação na troca 2D⇄3D (D5: *"a troca 2D⇄3D não anima CAMADA —
   anima PEÇA"*; o dono: *"a tela não tem mais motivo para piscar tudo"*). Deixar
   a régua apontada pra camada seria cobrar exatamente o que o item 4 manda
   apagar: a asserção viraria impossível de satisfazer, que é o pior tipo de
   prova — a que obriga o código a estar errado pra ficar verde.
   O QUE ELA NÃO PERDEU FOI A PERGUNTA, e ela é a memória de um bug pago: *quanto
   do próprio show quem sai conseguiu cumprir antes de ser arrancado da tela*.
   Mesmo piso (60%), mesmo relógio da própria animação — nunca a opacidade
   computada, porque nó desconectado devolve vazio e o `Number()` leria
   "movimento instantâneo" onde alguém arrancou a peça antes do gesto. O defeito
   A de 16/08 (curva de quem ENTRA numa saída ⇒ 230-330 ms de tela parada)
   continua sendo pego igual: peça com a curva errada, ou cortada no meio,
   derruba a fração do mesmo jeito. Só o corpo que se move é outro:
   `.plano-topo` subindo na ida, `.gps-manobra` recolhendo na volta. */
const T95_DA_PECA_QUE_SAI = (peca) => new Promise((pronto) => {
  // A camada que sai só nasce DEPOIS do toque — esta promessa é armada antes
  // dele de propósito, pra não perder o primeiro quadro do show. Então ela
  // primeiro ESPERA a peça aparecer (teto de 2 s pra não pendurar a prova).
  const achar = () => document.querySelector(`#app .tela.sai ${peca}`);
  const desistirEm = performance.now() + 2000;
  const esperar = () => {
    const el = achar();
    if (el) { medir(el); return; }
    if (performance.now() > desistirEm) { pronto(null); return; }
    requestAnimationFrame(esperar);
  };
  requestAnimationFrame(esperar);
  function medir(alvo) {
  let anim = null;
  try { anim = alvo.getAnimations().filter((a) => a.effect && a.effect.getTiming().duration > 0)[0] || null; } catch (_) { anim = null; }
  if (!anim) { pronto(null); return; }
  const nome = anim.animationName || '?';
  const dur = Number(anim.effect.getTiming().duration) || 520;
  /* 🔴 O QUE SE MEDE É QUANTO DO SHOW A PEÇA CONSEGUIU CUMPRIR ANTES DE SAIR DA
     TELA — e a régua é o relógio da PRÓPRIA animação, nunca a opacidade
     computada. Motivo, medido: nó desconectado devolve opacidade vazia, que o
     `Number()` transforma em 0, e a prova leria "movimento instantâneo" onde na
     verdade alguém arrancou a peça antes do gesto acontecer.
     A PRIMEIRA animação com duração é a do gesto: quem recolhe recolhe de um
     jeito só. Se um dia a peça sair com duas, esta linha passa a medir a mais
     antiga — e o número na medida (o nome dela) diz qual foi. */
  let ultimo = 0;
  const passo = () => {
    const agora = Number(anim.currentTime) || 0;
    if (alvo.isConnected) ultimo = agora;
    if (agora < dur && alvo.isConnected) { requestAnimationFrame(passo); return; }
    pronto({ nome, dur, cumprido: Math.round(ultimo), fracao: ultimo / dur, arrancada: !alvo.isConnected });
  };
  requestAnimationFrame(passo);
  }
});

/* ============================================================================
   ITEM 5 — O EFEITO DE MONTAR, MEDIDO NO POUSO.

   O pedido: *"recuperar e melhorar o efeito de montar rota: terminou o
   carregamento → escurece a tela na cor original do mapa → entra em tela cheia →
   roda a cena que já existe → desce até o 3D"*, e o pouso obedece o último modo
   (D6). Duas mudanças em relação a hoje: **a cena passa a valer no 2D também** e
   **o véu escurece nos dois** — hoje `.gps-veu` só existe dentro do desenho do
   3D e `TELA_CHEIA` só tem `'mapa'` (§ mock, `const TELA_CHEIA=['mapa']`), então
   pousar no 2D não veste `cheio` nem `cena` e não há véu pra acender.

   🔴 POR QUE PELO `window.ir` E NÃO PELO MONTAR DE VERDADE. O caminho do dono é
   Montar → `pousarNaRota()` → a tela do mapa; a ÚLTIMA perna desse caminho é
   `ir(modo)`, e é ela que veste a camada. Entrar por aqui mede a mesma perna sem
   arrastar cobrança, materialização e 409 de continuidade pra dentro de uma prova
   de tela (isso é `prova-fluxo-rota`). Sai de uma tela que NÃO é mapa de
   propósito: pousar é ENTRAR na tela do mapa, e trocar de modo (2D⇄3D) é outro
   evento — é o CASO 1, e o item 4 manda justamente que ele NÃO tenha cena.

   🔴 O QUE ESTA PROVA NÃO CONSEGUE PROVAR, e está em 'pendente': a DESCIDA da
   câmera até o 3D. Ela é `easeTo` no maplibre, mora na ponte
   (§ `descerDoPlano`/`entrarNaDescida`) e nesta bancada não há tile no disco —
   o mapa existe, mas a pose dele vem do dublê. Quem mede isso é a sonda
   `HBXTroca.pose()` numa prova com mapa, não a marca da camada.
   ============================================================================ */
const POUSO = (destino) => new Promise((pronto) => {
  // mesmo cuidado do `IR`: casca que grita no `pintar` não pode levar a prova
  try { window.ir(destino); }
  catch (e) {
    window.__erroCasca = window.__erroCasca || [];
    window.__erroCasca.push(`ir('${destino}'): ${(e && e.message) || e}`);
  }
  const camada = [...document.querySelectorAll('#app .tela')].pop() || null;
  /* DOIS QUADROS antes de perguntar. A animação de CSS nasce na resolução de
     estilo, não no `classList.add`: perguntar no mesmo tique devolveria lista
     vazia e a prova leria "o véu não escurece" onde ninguém tinha pintado ainda.
     Dois quadros são ~32 ms — dentro dos 220 ms de espera do próprio véu, então
     ele é pego na fase de ESPERA, que é `running` e é o que se quer. */
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const veus = camada ? [...camada.querySelectorAll('.gps-veu')] : [];
    const vivas = veus.reduce((fora, el) => {
      let as = [];
      try {
        as = el.getAnimations({ subtree: false })
          .filter((a) => a.playState === 'running' && a.effect
            && Number(a.effect.getTiming().duration) > 0);
      } catch (_) { as = []; }
      return fora.concat(as.map((a) => a.animationName || '?'));
    }, []);
    pronto({
      destino,
      classes: camada ? camada.className : '(sem camada)',
      cena: !!camada && camada.classList.contains('cena'),
      cheio: !!camada && camada.classList.contains('cheio'),
      modo: camada && camada.querySelector('.gps') ? '3d'
        : ((camada && camada.querySelector('.plano')) ? '2d' : ''),
      veus: veus.length,
      veuVivo: vivas,
    });
  }));
});

/* ============================================================================
   A LEITURA DA COREOGRAFIA — uma passada na fita por sentido (item 4).

   A JANELA é "há DUAS camadas no ar", que é a definição de *durante a troca*
   nesta casa: a camada que sai é removida aos 580 ms pelo `limpezaTimer`, e é
   nesse vão que o pisca sempre morou.
   🔴 JANELA VAZIA NÃO É APROVAÇÃO, É A OUTRA METADE DO PAR. Troca seca (uma
   camada só) deixa `camadaMove` vazio e a asserção da camada passaria de graça —
   por isso ela nunca vem sozinha: as asserções das PEÇAS reprovam na mesma
   medida, do mesmo jeito que 1.1 e 1.1b se impedem um ao outro desde 16/08 (o
   erro de trocar o show por uma troca seca já foi cometido AQUI, e o dono viu na
   hora: *"vc removeu o efeito ao montar a rota"*).
   🔴 E AS MARCAS (`troca-sobe`/`troca-desce`) SAEM COMO MEDIDA, NÃO COMO RÉGUA.
   Cobrar a existência da classe seria cobrar a marca — e marca que não anima
   nada passaria verde. O que a marca PROMETE já é cobrado pelo resultado: peça
   se movendo nas duas camadas (a que entra em `.8`, a que sai em `.1`). A lista
   fica impressa porque, quando reprovar, é ela que diz onde a marca não chegou.
   ============================================================================ */
function coreografia(fita) {
  const janela = fita.filter((f) => f.camadas >= 2);
  const unicos = (xs) => [...new Set(xs)];
  const todasDaCamada = unicos(janela.reduce((fora, f) => fora.concat(f.animCamada), []));
  const daPeca = (s) => ({
    existe: janela.some((f) => f.pecas[s] && f.pecas[s].n > 0),
    vivas: Math.max(0, ...janela.map((f) => (f.pecas[s] ? f.pecas[s].vivas : 0))),
  });
  return {
    quadros: janela.length,
    camadaMove: todasDaCamada.filter((n) => CAMADA_CHEIO.test(n)),
    // animação de camada FORA da família nomeada no item 4: vai pra medida, e
    // quem a introduzir decide com o dono se ela é o pisca voltando por dentro.
    camadaOutras: todasDaCamada.filter((n) => !CAMADA_CHEIO.test(n)),
    animPalco: unicos(janela.reduce((fora, f) => fora.concat(f.animPalco), [])),
    escalaNoMapa: janela.filter((f) => f.palcoEscala).length,
    peca: daPeca,
    marcas: unicos(janela.map((f) => f.marcas.join(' + '))).slice(0, 4),
  };
}

/** o último quadro em que a tela já é UMA camada: a troca acabou, isto é o pouso */
const assentado = (fita) => [...fita].reverse().find((f) => f.camadas === 1) || null;

/* AS TRÊS PERGUNTAS DO ITEM 4, idênticas nos dois sentidos — só os papéis das
   peças trocam de lado. Elas ganham os números .6/.7/.8 nos dois: .4 e .5 são o
   par do PITCH, que só a volta mede (é a subida da câmera), e furo na numeração
   é mais honesto do que dois números querendo dizer coisas diferentes em cada
   sentido. */
function cobrarTroca(pre, rotulo, co, entra, sai) {
  eh(`${pre}.6 ${rotulo}: a CAMADA nao se move na troca (quem se move e a PECA)`,
    co.camadaMove.length === 0,
    co.camadaMove.length
      ? `camada rodando ${co.camadaMove.join(',')} em ${co.quadros} quadros`
      : `${co.quadros} quadros de troca, zero animacao de camada${co.camadaOutras.length ? ` (fora da familia: ${co.camadaOutras.join(',')})` : ''}`);
  eh(`${pre}.7 ${rotulo}: o MAPA nao escala na troca (mapa parado, cromo trocando)`,
    co.escalaNoMapa === 0,
    `quadros com escala no palco=${co.escalaNoMapa}/${co.quadros}${co.animPalco.length ? ` · palco rodando ${co.animPalco.join(',')}` : ''}`);
  const pe = co.peca(entra);
  eh(`${pre}.8 ${rotulo}: a peca que ENTRA se move (${entra})`,
    pe.existe && pe.vivas > 0,
    pe.existe ? `animacoes vivas no pico=${pe.vivas}` : 'a peca nem existe na tela');
  const ps = co.peca(sai);
  nota(`[${rotulo.toLowerCase()}] marcas das camadas: ${co.marcas.join('  /  ') || '-'}`);
  nota(`[${rotulo.toLowerCase()}] peca que entra ${entra}: existe=${pe.existe} vivas=${pe.vivas} · peca que sai ${sai}: existe=${ps.existe} vivas=${ps.vivas}`);
}

async function abrir(navegador, pele, porta) {
  const ctx = await navegador.newContext({
    viewport: { width: 412, height: 940 },
    geolocation: { latitude: BASE.lat, longitude: BASE.lng, accuracy: 18 },
    permissions: ['geolocation'],
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.addInitScript(ARMADILHA, RUAS_FALSAS(BASE));
  await p.goto(`http://127.0.0.1:${porta}/assets/app/index.html`);
  await p.waitForTimeout(600);
  await p.addStyleTag({ content: pele });
  const itens = [0, 1, 2, 3, 4].map(paradaFalsa);
  const geo = Array.from({ length: 14 }, (_, i) => [BASE.lng, aoNorte(i * 260)]);
  await p.evaluate(PONTE, { itens, geo });
  await p.evaluate(() => window.HBXRota.carregar());
  await p.waitForTimeout(1200);
  await p.evaluate(IR, 'rota');
  // a cena de ENTRADA da Rota tem que ter acabado: é UMA cena por vez.
  await p.waitForTimeout(5600);
  return { ctx, p, erros };
}

(async () => {
  // o GERADO primeiro: esta prova abre `assets/app/**`, que é SAÍDA da costura.
  regenerarGerados();
  const pele = peleDoMock();
  const [srv, porta] = await servir();
  const navegador = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  /* ======================================================================
     CASO 1 — IDA (2D -> 3D) e VOLTA (3D -> 2D), na mesma sessão.
     ====================================================================== */
  {
    const { ctx, p, erros } = await abrir(navegador, pele, porta);

    /* 🔴 A BANCADA PRECISA TER AS PEÇAS PRA A RÉGUA FALAR DO APP (17/08). O
       cartão da manobra só existe com manobra no seam e a bússola só existe com
       rumo (`${g.rumo?…}` no desenho) — e aqui o `geolocation` do Playwright
       entrega posição sem heading e sem velocidade, então quem escreve o seam da
       navegação manda rumo VAZIO (§ `pintarNavegacao` → `cardeal(null)`, e o
       `rumoDaRota` também depende de fix andando). Sem este arranjo, "a peça não
       se move" e "a bússola não aparece" seriam "a peça não existe" e "esta
       bancada não tem GPS de verdade": a prova mediria a BANCADA, que é o erro
       que o teto deste arquivo já documenta na régua de screenshot.
       O arranjo entra pelo MESMO caminho do aparelho — o seam (`usarDados`),
       nunca escrevendo no DOM. Se a ponte reescrever por cima, o campo `rumo`
       da fita mostra isso na medida em vez de a prova mentir. */
    await p.evaluate(SEAM, {
      secao: 'gps',
      dado: { manobraDist: '200 m', manobraVerbo: 'Vire à direita', manobraRua: 'Rua Sete', rumo: 'N' },
    });
    await p.waitForTimeout(700);

    // ---- IDA ----------------------------------------------------------
    await p.evaluate(AMOSTRAR, { manobra: MANOBRA, topo: TOPO_2D });
    // na IDA quem sai é o 2D: a peça que recolhe é o topo dele (a foto 5)
    const t95Ida = p.evaluate(T95_DA_PECA_QUE_SAI, TOPO_2D);
    await p.evaluate(IR, 'mapa');
    const distIda = await t95Ida;
    await p.waitForTimeout(2400);
    const fitaIda = await p.evaluate(() => {
      clearInterval(window.__amostra);
      return window.__fita;
    });
    const ruasNaIda = Math.max(0, ...fitaIda.map((f) => f.ruas));
    const marcasIda = [...new Set(fitaIda.map((f) => f.marca).filter(Boolean))];
    const pilhaIda = Math.max(0, ...fitaIda.map((f) => f.camadas));
    nota(`[ida] camadas no pico=${pilhaIda} · mapas vistos=${marcasIda.join(',') || '-'} · ruas=${ruasNaIda}`);

    /* 🔴 AS DUAS PERGUNTAS JUNTAS, E A SEGUNDA NASCEU DE UM ERRO MEU (16/08).
       Eu tinha trocado o show por uma troca SECA pra camada velha não cobrir o
       mapa — e o dono viu na hora: *"vc removeu o efeito ao montar a rota"*. O
       show de entrar na tela cheia é de DUAS camadas; sem camada saindo não há
       efeito nenhum. Então cobram-se as duas coisas ao mesmo tempo: quem sai
       CUMPRE o show inteiro E não pinta fundo por cima do mapa vivo.
       (Quem é "quem sai" mudou em 17/08: era a camada, agora é a PEÇA — o porquê
       está inteiro no teto do `T95_DA_PECA_QUE_SAI`.) */
    eh(`1.1 IDA: a peca que SAI cumpre o show (${TOPO_2D}, nao e arrancada no meio)`,
      !!distIda && distIda.fracao >= PISO_SHOW,
      distIda ? `${distIda.nome} ${(distIda.fracao * 100).toFixed(0)}% de ${distIda.dur}ms (piso ${PISO_SHOW * 100}%)` : `${TOPO_2D} saindo: nada pra amostrar`);
    eh('1.1b IDA: a camada que sai NAO cobre o mapa (so cromo)',
      !fitaIda.some((f) => f.saiCobre), `quadros cobrindo=${fitaIda.filter((f) => f.saiCobre).length}`);
    eh('1.2 IDA: o mapa e o MESMO objeto antes e depois (nao renasce)',
      marcasIda.length === 1, `mapas vistos=${marcasIda.join(',') || 'nenhum'}`);
    eh('1.3 IDA: a cena das ruas acende dirigindo',
      ruasNaIda > 0, `camadas de cena=${ruasNaIda}`);
    // item 4: a camada parada, o mapa parado, e a MANOBRA entrando por cima
    cobrarTroca('1', 'IDA', coreografia(fitaIda), MANOBRA, TOPO_2D);
    /* 🔴 A FOTO 6 — A BÚSSOLA É PEÇA DO 3D. Medida no ASSENTADO (uma camada só):
       durante a troca as duas estão na tela e a bússola da que sai ainda conta
       como "está na tela", o que não diz nada sobre o modo. O par desta asserção
       é a 2.9, e as duas juntas são a frase do dono: *"a foto 6 aparece no 3D e
       some no 2D"* — uma sozinha aprovaria uma bússola eterna. */
    const pousoIda = assentado(fitaIda);
    eh('1.9 IDA: a bussola EXISTE no 3D assentado (foto 6)',
      !!pousoIda && pousoIda.modo === '3d' && pousoIda.bussola,
      pousoIda ? `modo=${pousoIda.modo} bussola=${pousoIda.bussola} rumo="${pousoIda.rumo}"` : 'a fita nao pegou quadro assentado');

    // deixa a ida assentar por inteiro antes de medir a volta
    await p.waitForTimeout(4200);

    // ---- VOLTA --------------------------------------------------------
    await p.evaluate(AMOSTRAR, { manobra: MANOBRA, topo: TOPO_2D });
    // na VOLTA quem sai é o 3D: a peça que recolhe é a manobra (a foto 4)
    const t95Volta = p.evaluate(T95_DA_PECA_QUE_SAI, MANOBRA);
    await p.evaluate(IR, 'rota');
    const distVolta = await t95Volta;
    await p.waitForTimeout(2400);
    const fitaVolta = await p.evaluate(() => {
      clearInterval(window.__amostra);
      return window.__fita;
    });
    const ruasNaVolta = Math.max(0, ...fitaVolta.map((f) => f.ruas));
    const marcasVolta = [...new Set(fitaVolta.map((f) => f.marca).filter(Boolean))];
    const pilhaVolta = Math.max(0, ...fitaVolta.map((f) => f.camadas));
    /* o MESMO mapa desce a inclinação: ele começa deitado no 3D e vai a zero.
       Não existe mais "o mapa que entra" — existe um mapa e um movimento. */
    const pitches = fitaVolta.map((f) => f.pitch).filter((v) => v != null);
    const pitchMax = pitches.length ? Math.max(...pitches) : null;
    const pitchMin = pitches.length ? Math.min(...pitches) : null;
    const degraus = new Set(pitches);
    // a emenda: o pitch do 1º quadro depois da troca × o do último antes dela
    const iTroca = fitaVolta.findIndex((f) => f.modo === '2d');
    const antes = iTroca > 0 ? fitaVolta[iTroca - 1].pitch : null;
    const depois = iTroca >= 0 ? fitaVolta[iTroca].pitch : null;
    const emenda = (antes != null && depois != null) ? Math.abs(antes - depois) : null;
    nota(`[volta] camadas no pico=${pilhaVolta} · mapas vistos=${marcasVolta.join(',') || '-'} · ruas=${ruasNaVolta} · pitch ${pitchMax}->${pitchMin} em ${degraus.size} degraus · emenda ${antes}->${depois}`);

    eh(`2.1 VOLTA: a peca que SAI cumpre o show (${MANOBRA}, nao e arrancada no meio)`,
      !!distVolta && distVolta.fracao >= PISO_SHOW,
      distVolta ? `${distVolta.nome} ${(distVolta.fracao * 100).toFixed(0)}% de ${distVolta.dur}ms (piso ${PISO_SHOW * 100}%)` : `${MANOBRA} saindo: nada pra amostrar`);
    eh('2.1b VOLTA: a camada que sai NAO cobre o mapa (so cromo)',
      !fitaVolta.some((f) => f.saiCobre), `quadros cobrindo=${fitaVolta.filter((f) => f.saiCobre).length}`);
    eh('2.2 VOLTA: o mapa e o MESMO objeto antes e depois (nao renasce)',
      marcasVolta.length === 1, `mapas vistos=${marcasVolta.join(',') || 'nenhum'}`);
    /* 🔴 O PEDIDO LITERAL: "as ruas acendendo nos 2" — na ida (dirigindo) e na
       volta (2D). Sem o chamador do pouso este numero e ZERO. */
    eh('2.3 VOLTA: a cena das ruas acende TAMBEM no 2D',
      ruasNaVolta > 0, `camadas de cena=${ruasNaVolta}`);
    /* 🔴 A SUBIDA EXISTE E ELA ANDA (16/08, depois de VER a troca gravada no g15
       a 20 quadros/s: 3 quadros de tela igual, 1 de mistura, tela nova — corte
       seco, zero movimento). O pitch tem que sair de deitado e ir a zero, em
       mais de um degrau. Um degrau só é o corte que o dono chamou de travação. */
    eh('2.4 VOLTA: o mapa SOBE (pitch anda, nao corta)',
      pitchMax != null && pitchMax >= 40 && pitchMin != null && pitchMin < pitchMax && degraus.size >= 3,
      `${pitchMax}->${pitchMin} em ${degraus.size} degraus`);
    /* 🔴 E O MOVIMENTO COMEÇA DE ONDE A TELA ESTAVA. No quadro da troca o mapa
       não pode pular: ele é o mesmo, então o primeiro quadro do estado novo tem
       que mostrar a MESMA inclinação do último quadro do estado velho. */
    eh('2.5 VOLTA: o mapa nao PULA no quadro da troca',
      emenda != null && emenda <= 3, `pitch ${antes} -> ${depois} (delta ${emenda})`);
    // item 4 ao contrário: agora quem entra por cima é o topo do 2D (a foto 5)
    cobrarTroca('2', 'VOLTA', coreografia(fitaVolta), TOPO_2D, MANOBRA);
    // o par da 1.9: a mesma bússola, agora tendo que NÃO estar na tela
    const pousoVolta = assentado(fitaVolta);
    eh('2.9 VOLTA: a bussola SOME no 2D assentado (foto 6)',
      !!pousoVolta && pousoVolta.modo === '2d' && !pousoVolta.bussola,
      pousoVolta ? `modo=${pousoVolta.modo} bussola=${pousoVolta.bussola} rumo="${pousoVolta.rumo}"` : 'a fita nao pegou quadro assentado');

    /* os DOIS baldes: o que subiu solto (`pageerror`) e o que a casca gritou por
       dentro do `pintar` e o `IR`/`SEAM` pegaram na mão. Um erro escondido num
       `catch` da prova seria a prova encobrindo o app. */
    const gritouIda = await gritos(p);
    eh('3.1 nenhum erro de pagina no ida-e-volta',
      erros.length === 0 && gritouIda.length === 0,
      erros[0] || gritouIda[0] || 'limpo');
    await ctx.close();
  }

  /* ======================================================================
     CASO 2 — ITEM 5: O EFEITO DE MONTAR, NOS DOIS POUSOS.
     Sessão nova de propósito: pouso é ENTRAR na tela, e entrar numa tela que
     acabou de ser deixada não é a mesma coisa (é a lei de 15/08 — voltar da
     folha da venda não é entrar na rota). Aqui a rota é NOVA pra tela.
     ====================================================================== */
  {
    const { ctx, p, erros } = await abrir(navegador, pele, porta);

    /* A escada de cada pouso: sai pra uma tela sem mapa, volta pra tela do mapa.
       `rotalista` é a lista do mesmo dia — o toque "Lista" da barra de cima —,
       então nada de dado muda entre uma coisa e outra: o que muda é só o evento
       de ENTRAR. */
    const pousarEm = async (destino) => {
      await p.evaluate(IR, 'rotalista');
      await p.waitForTimeout(1500);
      const medida = await p.evaluate(POUSO, destino);
      // a cena tem teto de 1,2 s (`CENA_CHEIA`) e a saída morre aos 580 ms:
      // esperar aqui deixa a próxima medição começar com a tela parada.
      await p.waitForTimeout(2600);
      return medida;
    };

    const p2d = await pousarEm('rota');
    const p3d = await pousarEm('mapa');
    nota(`[pouso 2D] modo=${p2d.modo} cena=${p2d.cena} cheio=${p2d.cheio} veus=${p2d.veus} veu=${p2d.veuVivo.join(',') || '-'} · classes="${p2d.classes}"`);
    nota(`[pouso 3D] modo=${p3d.modo} cena=${p3d.cena} cheio=${p3d.cheio} veus=${p3d.veus} veu=${p3d.veuVivo.join(',') || '-'} · classes="${p3d.classes}"`);

    /* 🔴 AS DUAS PERGUNTAS DE CADA POUSO SÃO UM PAR, e é de propósito. A primeira
       lê as MARCAS (`cena` + `cheio`), que é o mecanismo escrito no contrato
       (D6: *"a cena é a cena que já existe: `pedirCena` + `entrarNaDescida` e a
       marca `cena` na camada"*). Marca sozinha, porém, é exatamente o que esta
       casa não aceita como prova — então a segunda cobra o RESULTADO no mesmo
       lugar: o véu com animação VIVA. Vestir `cena cheio` sem o véu acender
       reprova; acender o véu por outro caminho que não a cena reprova também. */
    eh('4.1 POUSO 2D: a camada nasce com cena E cheio (a rota nova entra em cena)',
      p2d.modo === '2d' && p2d.cena && p2d.cheio,
      `modo=${p2d.modo} cena=${p2d.cena} cheio=${p2d.cheio}`);
    eh('4.2 POUSO 2D: o veu escurece a tela (animacao viva no .gps-veu)',
      p2d.veus > 0 && p2d.veuVivo.length > 0,
      p2d.veus ? `veu rodando ${p2d.veuVivo.join(',') || 'nada'}` : 'nao existe .gps-veu no 2D');
    eh('4.3 POUSO 3D: a camada nasce com cena E cheio',
      p3d.modo === '3d' && p3d.cena && p3d.cheio,
      `modo=${p3d.modo} cena=${p3d.cena} cheio=${p3d.cheio}`);
    eh('4.4 POUSO 3D: o veu escurece a tela (animacao viva no .gps-veu)',
      p3d.veus > 0 && p3d.veuVivo.length > 0,
      p3d.veus ? `veu rodando ${p3d.veuVivo.join(',') || 'nada'}` : 'nao existe .gps-veu no 3D');
    const gritouPouso = await gritos(p);
    eh('4.5 nenhum erro de pagina nos dois pousos',
      erros.length === 0 && gritouPouso.length === 0,
      erros[0] || gritouPouso[0] || 'limpo');
    await ctx.close();
  }

  await navegador.close();
  srv.close();

  console.log('\n=== MEDIDAS ===');
  notas.forEach((n) => console.log('  · ' + n));
  console.log('\n== PROVA DO IR E VIR ==\n');
  ok.forEach((n) => console.log('  ok   ' + n));
  falhou.forEach((n) => console.log('  XX   ' + n));
  console.log(`\n${ok.length}/${ok.length + falhou.length}\n`);
  process.exit(falhou.length ? 1 : 0);
})();
