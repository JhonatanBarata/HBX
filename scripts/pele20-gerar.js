#!/usr/bin/env node
/**
 * GERADOR DA PELE 2.0 — o mock é a fonte, o app é o destino.
 *
 * Regra de aprovação do dono (06/08): "ficar idêntico o html gerado". Por isso
 * a pele NÃO é escrita à mão aqui: ela é EXTRAÍDA do mock, verbatim. Mudou a
 * aparência? Mexe em docs/mockups/logistica2.0/logistica-2.0.html e roda:
 *
 *     node scripts/pele20-gerar.js
 *
 * Os limites são achados por CONTEÚDO, nunca por número de linha — o mock muda
 * de tamanho a cada rodada do dono (3079 → 3113 → 3375) e corte por linha fixa
 * quebraria calado, entregando arquivo pela metade que ainda compila.
 *
 * 🔴 O QUE MUDOU NESTA RODADA (06/08, mock com modo claro DESENHADO):
 *   1. O corte agora é por REGRA, nunca por linha. Tirar `.notch` linha a linha
 *      deixava a segunda metade de `.notch::after` órfã dentro da folha — uma
 *      declaração solta com `}` de sobra, que o navegador engole calado. Estava
 *      na pele publicada, linha 46. Regra tem começo e fim; corte tem que ter
 *      os dois também.
 *   2. Acabaram as adaptações de COR. O mock já nasce com tinta escura no lima
 *      (o interruptor `data-cta` morreu lá) e o modo claro é DESENHADO à mão,
 *      com valor próprio (#16260a). O gerador que "consertava" a cor passou a
 *      ESTRAGAR: reescrevia a escolha do claro por cima. Onde havia conserto,
 *      agora há PORTÃO — o gerador confere e reprova, não corrige.
 *   3. Regra do aparelho que nasce ACIMA da casca não se perde mais. O dono
 *      colocou `.app button{...}` lá no topo, antes do cromo do visualizador;
 *      o corte antigo começava no `.app{` e deixava as três pra trás. Agora
 *      elas entram por fatia própria — e um portão varre o que foi DESCARTADO
 *      atrás de qualquer coisa com `.app`, pra nunca mais sumir em silêncio.
 */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const MOCK = path.join(raiz, 'docs/mockups/logistica2.0/logistica-2.0.html');
const DESTINO = path.join(raiz, 'EntregaShell/app/src/logistica2/assets/app');

const fonte = fs.readFileSync(MOCK, 'utf8');

/** Falha ALTA e cedo: pele pela metade compila e engana. */
function achar(texto, de, ate, nome) {
  const i = texto.indexOf(de);
  if (i < 0) throw new Error(`[pele20] não achei o INÍCIO de "${nome}": ${de}`);
  const j = texto.indexOf(ate, i + de.length);
  if (j < 0) throw new Error(`[pele20] não achei o FIM de "${nome}": ${ate}`);
  return { i, j, texto: texto.slice(i, j) };
}
const fatiar = (texto, de, ate, nome) => achar(texto, de, ate, nome).texto;

/**
 * Tira REGRAS INTEIRAS cujo seletor cite `alvo`, em qualquer posição do
 * seletor e por quantas linhas a regra tiver. É a correção da armadilha nº1:
 * o corte por linha decapitava regras de duas linhas e deixava o corpo solto.
 */
function tirarRegras(css, alvo, nome) {
  const re = new RegExp(String.raw`(?:^|\n)[^\n{}]*${alvo}[^\n{}]*\{[^{}]*\}`, 'g');
  const saida = css.replace(re, '');
  if (new RegExp(alvo).test(saida)) {
    const sobrou = saida.split('\n').filter((l) => new RegExp(alvo).test(l));
    throw new Error(`[pele20] sobrou "${nome}" na casca depois do corte:\n  ${sobrou.join('\n  ')}`);
  }
  return saida;
}

// ---------------------------------------------------------------------------
// CASCA (CSS) — duas fatias, porque o cromo do visualizador fica NO MEIO
// ---------------------------------------------------------------------------
const CROMO = '/* ---------- cromo do documento ---------- */';

// Fatia 1: regras do APARELHO que nascem antes do cromo (foco, realce de toque).
const preCasca = achar(fonte, '.app button{', CROMO, 'regras do app no topo do mock');

// Fatia 2: do `.app{` (a caixa do app) até o fim da folha. O que vem entre as
// duas fatias é cromo do visualizador (.doc-top, .rail, .stage, .phone).
const casca = achar(fonte, '.app{\n  position:relative;width:412px', '</style>', 'CSS da pele');

// 🔴 PORTÃO DO DESCARTE: nada com `.app` pode ficar pra trás. Foi assim que as
// três regras de foco quase sumiram — e sumir calado é o defeito, não o corte.
const iStyle = fonte.indexOf('<style>');
const descartado = fonte.slice(iStyle, preCasca.i) + fonte.slice(preCasca.j, casca.i);
const esquecidas = descartado.split('\n').filter((l) => /(^|[\s,])\.app\b/.test(l));
if (esquecidas.length) {
  throw new Error(
    `[pele20] regra do APARELHO ficou fora do corte (o mock cresceu por cima do limite):\n  ` +
    esquecidas.join('\n  ') +
    `\n  → mova a regra pra dentro de uma das fatias, ou ensine o gerador a pegá-la.`,
  );
}

let cssAdaptado = preCasca.texto + casca.texto;

// No mock o .app é maquete de 412x940 dentro de um celular desenhado; no
// aparelho ele É a tela. Só a caixa muda — tokens, fonte e pesos ficam.
const CAIXA_MOCK = 'position:relative;width:412px;height:940px;border-radius:38px;overflow:hidden;';
if (!cssAdaptado.includes(CAIXA_MOCK)) throw new Error('[pele20] não achei a caixa 412x940 do mock');
cssAdaptado = cssAdaptado.replace(CAIXA_MOCK, 'position:relative;width:100%;height:100dvh;border-radius:0;overflow:hidden;');

// O recorte da câmera é do celular DESENHADO, não do app — e o modo claro tem
// cópia dele com o seletor prefixado, que o corte por início de linha deixava.
cssAdaptado = tirarRegras(cssAdaptado, '\\.notch', '.notch');
// O interruptor branco/escuro do lima morreu no mock; se voltar, morre aqui.
cssAdaptado = tirarRegras(cssAdaptado, '\\[data-cta', 'data-cta');

// ---------------------------------------------------------------------------
// PORTÕES DA CASCA — o gerador CONFERE, não conserta
// ---------------------------------------------------------------------------
// Conserto silencioso é pior que defeito: some com a intenção do dono. Se o
// mock regredir, o gerador para e diz o quê — quem corrige é o mock.
//
// 🔴 E AQUI SÓ ENTRA O QUE É VERDADE SEM CASCATA. A primeira versão deste
// portão lia regra por regra atrás de "lima com tinta branca" e reprovou três
// inocentes: duas eram do botão AZUL (`[data-estado="montar"]`) e a outra era
// um `color:#fff` que uma regra POSTERIOR sobrescreve. Cor final é pergunta de
// CASCATA, e cascata não se lê em texto — se MEDE no navegador. A lei do lima
// mudou de casa: virou medição em scripts/pele20-conferir.js, nos dois modos.
if (/width:412px|height:940px/.test(cssAdaptado)) {
  throw new Error('[pele20] sobrou a caixa do celular DESENHADO na casca — o app não tem 412x940');
}
if (!/\[data-luz="claro"\]/.test(cssAdaptado)) {
  throw new Error('[pele20] a casca saiu SEM modo claro — o mock perdeu o bloco [data-luz="claro"]');
}

// ---------------------------------------------------------------------------
// VIEW (JS)
// ---------------------------------------------------------------------------
// Do dicionário de ícones até os listeners do VISUALIZADOR (que não vão).
const js = fatiar(fonte, 'const I = {', "document.addEventListener('click',e=>{", 'view da pele');

// O bloco traz declarações que o visualizador usa pra trocar de tela. Aqui quem
// manda na navegação é o app, então elas viram inertes — mas `pintar`/`numerarItens`
// FICAM: são as leis de movimento que o mock mandou copiar daqui.
let jsAdaptado = js
  .replace(/^const ORDEM=\[[\s\S]*?\];$/m, 'const ORDEM=[];')
  .replace(/^const GRUPOS=\[[^\]]*\];$/m, 'const GRUPOS=[];')
  .replace(/^let atual='[a-z]+';$/m, "let atual='rota';")
  .replace(/^function pintarRail\(\)\{[\s\S]*?\n\}$/m, 'function pintarRail(){}')
  .replace(/^function ir\(k\)\{[\s\S]*?\n\}$/m, 'function ir(){}');

// 🔴 A LUZ é do mock, o REPINTE é do app. `trocarLuz` resolve escuro/claro/
// sistema (isso é lei e fica), mas as duas últimas linhas dele falavam com o
// visualizador: acendiam o botão do topo e chamavam `pintar`, que redesenha a
// tela do MOCK por cima. No aparelho isso apagaria a tela de verdade do app.
// Quem repinta lá é o `render()` do app.js, avisado por este gancho.
const ACENDE_BOTAO = /^ {2}document\.querySelectorAll\('#luz button'\)[^\n]*\n/m;
const REPINTA_MOCK = /^ {2}const chave=document\.querySelector\('#app \.chave'\);\n {2}if\(chave\) pintar\(false\);\n/m;
if (!ACENDE_BOTAO.test(jsAdaptado)) throw new Error('[pele20] trocarLuz mudou: não achei o acender do botão do visualizador');
if (!REPINTA_MOCK.test(jsAdaptado)) throw new Error('[pele20] trocarLuz mudou: não achei a chamada de pintar() do visualizador');
jsAdaptado = jsAdaptado
  .replace(ACENDE_BOTAO, '')
  .replace(REPINTA_MOCK, '  if(typeof window.HBX20_REPINTAR==="function") window.HBX20_REPINTAR();\n');

if (/#luz\b/.test(jsAdaptado)) throw new Error('[pele20] sobrou cromo do visualizador (#luz) na view');

const cabecalho = `/* ==========================================================================
   PELE 2.0 — EXTRAÍDA DO MOCK, NÃO REESCRITA.  ⚠️ ARQUIVO GERADO.

   Fonte: docs/mockups/logistica2.0/logistica-2.0.html
   Gerador: scripts/pele20-gerar.js   (rode ele; não edite este arquivo)
   Conferência: node scripts/pele20-conferir.js  (33/33, nos DOIS modos)

   Os templates são os MESMOS do mock, palavra por palavra — é isso que faz o
   HTML sair idêntico por CONSTRUÇÃO, e não por semelhança. Editar aqui à mão
   quebra a única regra de aprovação que o dono cravou, e some na próxima
   regeração.

   O gerador NÃO conserta cor: ele confere e reprova. Aparência se corrige no
   MOCK — é ele que manda.
   ========================================================================== */
`;

fs.writeFileSync(path.join(DESTINO, 'pele20.css'), cabecalho + cssAdaptado);
fs.writeFileSync(path.join(DESTINO, 'pele20.js'),
  cabecalho + '(function(){\n"use strict";\n' + jsAdaptado +
  `
window.HBX20 = { T: T, ic: ic, hdr: hdr, nav: nav, status: status, logo: logo,
  stop: stop, transmux: transmux, mapa: mapa, mapaGps: mapaGps, telaGps: telaGps,
  folhaCompleta: folhaCompleta, shellRota: shellRota, listaParadas: listaParadas,
  AVISOS: AVISOS, PORTOES: PORTOES, avisar: avisar, portao: portao, erro: erro,
  fechar: fechar, confirmar: confirmar, ligarGestos: ligarGestos,
  numerarItens: numerarItens, DUR: DUR, ROTA_ESTADOS: ROTA_ESTADOS,
  DADOS_MOCK: DADOS_MOCK, usarDados: usarDados, dadosDoMock: dadosDoMock, secoesDeMock: secoesDeMock,
  trocarLuz: trocarLuz };
})();
`);

const telas = [...fonte.matchAll(/^T\.([a-z0-9]+)=\{nome:'([^']+)'/gm)];
console.log(`[pele20] css: ${cssAdaptado.split('\n').length} linhas`);
console.log(`[pele20] js : ${jsAdaptado.split('\n').length} linhas`);
console.log(`[pele20] telas no mock: ${telas.length}`);
console.log('[pele20] portões estruturais: caixa do app, .notch, data-cta, modo claro, #luz — OK');
console.log('[pele20] cor e HTML idêntico se provam MEDINDO: node scripts/pele20-conferir.js');
