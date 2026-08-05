#!/usr/bin/env node
/**
 * FISCAL DA MATRIZ (PR05082026-MATRIZ-DA-TELA, GO 05/08) — roda junto do
 * check-pele no lint. As 5 Leis do design system cobrem a PELE; este fiscal
 * cobre o COMPORTAMENTO e o VOCABULÁRIO ("lei sem fiscal é decoração").
 *
 * O que grita:
 *  1. 🔴 Palavra banida em STRING DE TELA (Fiado/Devendo/Ficou Pendente/Un/Total:)
 *     — comentário não conta; o dado do banco ('fiado') não é tela.
 *  2. 🔴 Catraca do hold artesanal: `is-hold-arming` fora do matriz.js SÓ DESCE.
 *     Cada tela migrada pra HBXMatriz.gestos apaga a sua cópia.
 *  3. 🔴 Catraca do rótulo sem <span>: `${icon(...)} Texto` congela no
 *     reconciliador (caso Finalizar/Reabrir). SÓ DESCE.
 *  4. 🔴 Paridade APK×web: os rótulos de dinheiro do matriz.js e do balcão web
 *     têm de ser IDÊNTICOS — mudou um sem o outro, vermelho. É assim que
 *     "varra o sistema" nunca mais acontece.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ler = rel => readFileSync(join(raiz, rel), "utf8");

// Catracas — medidas em 05/08/2026 (M0). Regra: SÓ DESCE. Subiu = reprovado;
// desceu = atualizar o teto no mesmo commit.
const TETO_HOLD_ARTESANAL = 55; // ocorrências; era 60 antes do M0 — caderneta já migrou
const TETO_ROTULO_SEM_SPAN = 33;

const APP = "EntregaShell/app/src/logistica/assets/app/app.js";
const MATRIZ = "EntregaShell/app/src/logistica/assets/app/matriz.js";
const BALCAO = "frontend/src/app/(app)/balcao/page.client.tsx";

let erros = 0;
const erro = msg => { erros += 1; console.error(`🔴 check-matriz: ${msg}`); };

// ---- 1. palavra banida em string de tela -----------------------------------
// Tira comentários (// e /* */) e olha o que sobra — string de template é tela.
const semComentario = codigo => codigo
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "")
  .replace(/([^:"'`])\/\/[^\n"'`]*$/gm, "$1");
const BANIDAS = [
  [/Ficou Pendente|Ficou devendo/, "'Ficou Pendente/devendo' morreu — o desfecho é 'Marcou'"],
  [/[Dd]evendo\b/, "'devendo' é proibido em tela — vocabulário é Marcar/Marcou/Total Marcado"],
  [/Devedor/, "'Devedor' é proibido em tela"],
  [/>Fiado</, "'Fiado' é dado de banco, nunca rótulo de tela"],
  [/Un R\$|Total: R\$/, "telegrama (Lei 8): 'Un'/'Total:' morreram — 'Nome N×U,UU = R$T,TT'"],
];
for (const arquivo of [APP, MATRIZ, BALCAO]) {
  const limpo = semComentario(ler(arquivo));
  for (const [padrao, msg] of BANIDAS) {
    const hit = limpo.match(padrao);
    if (hit) erro(`${arquivo}: "${hit[0]}" — ${msg}`);
  }
}

// ---- 2. catraca do hold artesanal ------------------------------------------
const holds = (ler(APP).match(/is-hold-arming/g) || []).length;
if (holds > TETO_HOLD_ARTESANAL) {
  erro(`hold artesanal SUBIU: ${holds} ocorrências de is-hold-arming no app.js (teto ${TETO_HOLD_ARTESANAL}). Gesto novo se declara na HBXMatriz.gestos, não se copia.`);
} else if (holds < TETO_HOLD_ARTESANAL) {
  console.log(`✅ check-matriz: hold artesanal desceu (${holds} < teto ${TETO_HOLD_ARTESANAL}) — baixe o teto no mesmo commit.`);
}

// ---- 3. catraca do rótulo sem span -----------------------------------------
const semSpan = (ler(APP).match(/\$\{icon\([^)]*\)\}\s*[A-ZÀ-Ú]/g) || []).length;
if (semSpan > TETO_ROTULO_SEM_SPAN) {
  erro(`rótulo sem <span> SUBIU: ${semSpan} botões com icon()+texto solto (teto ${TETO_ROTULO_SEM_SPAN}). O reconciliador só troca texto em nó folha — embrulhe no <span>.`);
} else if (semSpan < TETO_ROTULO_SEM_SPAN) {
  console.log(`✅ check-matriz: rótulo sem span desceu (${semSpan} < teto ${TETO_ROTULO_SEM_SPAN}) — baixe o teto no mesmo commit.`);
}

// ---- 3b. atributo de gesto tem UM dono (defeito medido 05/08) --------------
// `data-day` é do Gerenciador de Rota. Um botão que traz `data-day` E
// `data-action` é sequestrado pelo despacho (que testa data-day primeiro) e o
// seu handler vira código morto — foi o filtro de Clientes "abrindo rota".
for (const linha of ler(APP).split("\n")) {
  if (/data-day=/.test(linha) && /data-action=/.test(linha)) {
    erro(`${APP}: botão com data-day E data-action na mesma linha — o despacho testa data-day ANTES do data-action e sequestra o toque. Filtro usa data-filtro (HBXMatriz.chips).`);
  }
}

// ---- 4. paridade APK×web dos rótulos de dinheiro ---------------------------
// APK: mapa `botoes` do matriz.js. Web: FORMAS do balcão. Mesmas 4 palavras.
const mapaMatriz = {};
const mBotoes = ler(MATRIZ).match(/botoes:\s*\{([^}]*)\}/);
if (mBotoes) {
  for (const par of mBotoes[1].matchAll(/(\w+):\s*"([^"]+)"/g)) mapaMatriz[par[1]] = par[2];
}
const mapaBalcao = {};
for (const par of ler(BALCAO).matchAll(/id:\s*"(\w+)",\s*rotulo:\s*"([^"]+)"/g)) mapaBalcao[par[1]] = par[2];
const paridade = [["dinheiro", "DINHEIRO"], ["pix", "PIX"], ["cartao", "CARTAO"], ["marcar", "FIADO"]];
for (const [chaveApk, chaveWeb] of paridade) {
  const apk = mapaMatriz[chaveApk];
  const web = mapaBalcao[chaveWeb];
  if (!apk || !web) { erro(`paridade: não achei o rótulo ${chaveApk}/${chaveWeb} (matriz.js ou balcão mudou de forma — ajuste o fiscal JUNTO).`); continue; }
  if (apk !== web) erro(`paridade APK×web: "${apk}" (matriz.js) ≠ "${web}" (balcão). A palavra de dinheiro é UMA — mude os dois juntos.`);
}

if (erros) {
  console.error(`\ncheck-matriz: ${erros} violação(ões). O padrão mora em docs/PLANEJAMENTOS/PR05082026-MATRIZ-DA-TELA.md §2b.`);
  process.exit(1);
}
console.log(`✅ check-matriz: vocabulário cravado, catracas respeitadas (hold ${holds}/${TETO_HOLD_ARTESANAL}, span ${semSpan}/${TETO_ROTULO_SEM_SPAN}), paridade APK×web ok.`);
