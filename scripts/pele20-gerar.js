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
 * de tamanho a cada rodada do dono (3079 → 3113 numa madrugada só) e corte por
 * linha fixa quebraria calado, entregando arquivo pela metade que ainda compila.
 *
 * ÚNICA adaptação de conteúdo, ordem do dono: onde tem verde limão forte o
 * texto é ESCURO LEGÍVEL (#12200a), nunca branco. No mock isso é um
 * interruptor (data-cta); aqui o interruptor morre e a variante escura vira lei.
 */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const MOCK = path.join(raiz, 'docs/mockups/logistica2.0/logistica-2.0.html');
const DESTINO = path.join(raiz, 'EntregaShell/app/src/logistica2/assets/app');

const fonte = fs.readFileSync(MOCK, 'utf8');

/** Falha ALTA e cedo: pele pela metade compila e engana. */
function fatiar(texto, de, ate, nome) {
  const i = texto.indexOf(de);
  if (i < 0) throw new Error(`[pele20] não achei o INÍCIO de "${nome}": ${de}`);
  const j = texto.indexOf(ate, i + de.length);
  if (j < 0) throw new Error(`[pele20] não achei o FIM de "${nome}": ${ate}`);
  return texto.slice(i, j);
}

// ---------------------------------------------------------------------------
// CASCA (CSS)
// ---------------------------------------------------------------------------
// Do `.app{` (a caixa do app) até o fim da folha. O que vem ANTES é cromo do
// visualizador (.doc-top, .rail, .stage, .phone) e não existe no aparelho.
const css = fatiar(fonte, '.app{\n  position:relative;width:412px', '</style>', 'CSS da pele');

const cssAdaptado = css
  // No mock o .app é maquete de 412x940 dentro de um celular desenhado; no
  // aparelho ele É a tela. Só a caixa muda — tokens, fonte e pesos ficam.
  .replace('position:relative;width:412px;height:940px;border-radius:38px;overflow:hidden;',
           'position:relative;width:100%;height:100dvh;border-radius:0;overflow:hidden;')
  // O recorte da câmera é do celular DESENHADO, não do app.
  .replace(/^\.notch[^\n]*\n/gm, '')
  // REGRA DO DONO: verde limão forte = texto escuro legível.
  .replace('.act.go{background:linear-gradient(180deg,#8fd626,#68b019);border:0;color:#fff;',
           '.act.go{background:linear-gradient(180deg,#8fd626,#68b019);border:0;color:#12200a;')
  .replace('.act.go b,.act.go small{color:#fff}', '.act.go b,.act.go small{color:#12200a}')
  .replace('.act.go small{opacity:.9}', '.act.go small{opacity:.72}')
  // O interruptor branco/escuro morre: no app não existe variante branca.
  .replace(/^\[data-cta="escuro"\][^\n]*\n/gm, '');

// ---------------------------------------------------------------------------
// VIEW (JS)
// ---------------------------------------------------------------------------
// Do dicionário de ícones até os listeners do VISUALIZADOR (que não vão).
const js = fatiar(fonte, 'const I = {', "document.addEventListener('click',e=>{", 'view da pele');

// O bloco traz declarações que o visualizador usa pra trocar de tela. Aqui quem
// manda na navegação é o app, então elas viram inertes — mas `pintar`/`numerarItens`
// FICAM: são as leis de movimento que o mock mandou copiar daqui.
const jsAdaptado = js
  .replace(/^const ORDEM=\[[\s\S]*?\];$/m, 'const ORDEM=[];')
  .replace(/^const GRUPOS=\[[^\]]*\];$/m, 'const GRUPOS=[];')
  .replace(/^let atual='[a-z]+';$/m, "let atual='rota';")
  .replace(/^function pintarRail\(\)\{[\s\S]*?\n\}$/m, 'function pintarRail(){}')
  .replace(/^function ir\(k\)\{[\s\S]*?\n\}$/m, 'function ir(){}');

const cabecalho = `/* ==========================================================================
   PELE 2.0 — EXTRAÍDA DO MOCK, NÃO REESCRITA.  ⚠️ ARQUIVO GERADO.

   Fonte: docs/mockups/logistica2.0/logistica-2.0.html
   Gerador: scripts/pele20-gerar.js   (rode ele; não edite este arquivo)

   Os templates são os MESMOS do mock, palavra por palavra — é isso que faz o
   HTML sair idêntico por CONSTRUÇÃO, e não por semelhança. Editar aqui à mão
   quebra a única regra de aprovação que o dono cravou, e some na próxima
   regeração.

   Única adaptação: o verde limão forte leva texto escuro legível (#12200a),
   nunca branco — ordem do dono. No mock era interruptor; aqui é lei.
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
  numerarItens: numerarItens, DUR: DUR, ROTA_ESTADOS: ROTA_ESTADOS, PARADAS: PARADAS };
})();
`);

const telas = [...fonte.matchAll(/^T\.([a-z0-9]+)=\{nome:'([^']+)'/gm)];
console.log(`[pele20] css: ${cssAdaptado.split('\n').length} linhas`);
console.log(`[pele20] js : ${jsAdaptado.split('\n').length} linhas`);
console.log(`[pele20] telas no mock: ${telas.length}`);
if (/data-cta/.test(cssAdaptado)) throw new Error('[pele20] sobrou data-cta na casca');
if (/\.act\.go[^\n]*#fff/.test(cssAdaptado)) throw new Error('[pele20] sobrou botão limão com texto BRANCO');
console.log('[pele20] regra do verde limão: OK (texto #12200a, sem interruptor)');
