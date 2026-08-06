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
// 🔴 O QUE ESTE GERADOR **NÃO** FAZ MAIS: extrair as telas.
// ---------------------------------------------------------------------------
// Ele emitia também um `pele20.js` com as 33 `T.*` do mock, e o app renderizava
// aquelas telas no lugar das dele. Custou caro e foi revertido (06/08):
//
//   · a tela do mock traz o DADO DE EXEMPLO do mock, então a Rota do motorista
//     passou a mostrar "João da Silva" por cima do dia real — casca não pode
//     custar o dado;
//   · tela sem tradução caía na marcação velha → duas peles no mesmo app.
//
// A raiz foi extrair a SAÍDA do mock (as telas) em vez da ENTRADA (o
// vocabulário: tokens, componentes, tipografia, movimento). A saída dá
// fidelidade uma vez e trava tudo; a entrada dá fidelidade E deixa a próxima
// casca barata — que é o objetivo do dono ("trocar a casca inteira, fácil").
//
// Então a casca é UMA FOLHA DE ESTILO. As 33 telas do mock continuam no mock,
// como RÉGUA DE CONFERÊNCIA. Plano: docs/PLANEJAMENTOS/cascalogistica.md

const cabecalho = `/* ==========================================================================
   CASCA LOGÍSTICA — EXTRAÍDA DO MOCK, NÃO REESCRITA.  ⚠️ ARQUIVO GERADO.

   Fonte: docs/mockups/logistica2.0/logistica-2.0.html
   Gerador: scripts/pele20-gerar.js   (rode ele; não edite este arquivo)
   Conferência: node scripts/pele20-conferir.js

   Esta folha é a CASCA: tokens, componentes, tipografia e as 7 leis de
   movimento do mock. É ela que o app veste — a marcação das telas do app é
   reescrita pra usar este vocabulário, leva a leva, SEM tocar em comportamento.

   🔴 As 33 telas do mock NÃO viram código: são régua de conferência. Já foram
   copiadas pra cá uma vez e custaram caro (a tela do mock trouxe o dado de
   exemplo dele por cima do dia real do motorista). Ver o plano.

   O gerador NÃO conserta cor: ele confere e reprova. Aparência se corrige no
   MOCK — é ele que manda.

   Plano e leis: docs/PLANEJAMENTOS/cascalogistica.md
   ========================================================================== */
`;

fs.writeFileSync(path.join(DESTINO, 'pele20.css'), cabecalho + cssAdaptado);

// Portão de higiene: se alguém reintroduzir o arquivo de telas, o gerador avisa.
const telasNoApp = path.join(DESTINO, 'pele20.js');
if (fs.existsSync(telasNoApp)) {
  throw new Error(
    '[casca] existe um pele20.js em produção. As telas do mock são RÉGUA, não código.\n' +
    '  → apague o arquivo e vista a tela do app com as classes da casca.\n' +
    '  → docs/PLANEJAMENTOS/cascalogistica.md',
  );
}

const telas = [...fonte.matchAll(/^T\.([a-z0-9]+)=\{nome:'([^']+)'/gm)];
console.log(`[casca] pele20.css: ${cssAdaptado.split('\n').length} linhas`);
console.log(`[casca] telas de referência no mock: ${telas.length} (ficam no mock, não viram código)`);
console.log('[casca] portões estruturais: caixa do app, .notch, data-cta, modo claro — OK');
console.log('[casca] fidelidade se prova MEDINDO: node scripts/pele20-conferir.js');
