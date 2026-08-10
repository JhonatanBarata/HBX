#!/usr/bin/env node
/**
 * FISCAL DA MATRIZ (PR05082026-MATRIZ-DA-TELA, GO 05/08) — roda junto do
 * check-pele no lint. As 5 Leis do design system cobrem a PELE; este fiscal
 * cobre o VOCABULÁRIO ("lei sem fiscal é decoração").
 *
 * RENASCIDO 10/08: o alvo era o app.js do app velho, que morreu na fusão de
 * 07/08 — o fiscal ficou dias estourando ENOENT sem fiscalizar nada. A fonte
 * viva agora é ponte-src/*.js + o mock (que É o front do APK, ver
 * scripts/casca-injetar.js). As catracas do app velho (is-hold-arming
 * artesanal, ${icon()} sem span, data-day+data-action) foram APOSENTADAS:
 * policiavam idiomas que o app novo nunca teve — 0 ocorrências, e as próprias
 * funções/classes (icon(), HBXMatriz, data-day) não existem na fonte nova.
 *
 * O que grita:
 *  1. 🔴 Palavra banida em STRING DE TELA (Fiado/Devendo/Ficou Pendente/Un/Total:)
 *     — comentário não conta; o dado do banco ('fiado', `devedores`) não é tela.
 *  2. 🔴 Paridade APK×web: todo botão `data-forma` do mock e o PAGAMENTOS do
 *     balcão web usam a MESMA palavra por forma — inclusive entre telas do
 *     próprio mock (pegou "Marcou"≠"Marcar" no acerto em 10/08). É assim que
 *     "varra o sistema" nunca mais acontece.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ler = rel => readFileSync(join(raiz, rel), "utf8");

const PONTE_SRC_DIR = "EntregaShell/app/src/logistica/ponte-src";
const MOCK = "docs/mockups/logistica2.0/logistica-2.0.html";
const BALCAO = "frontend/src/app/(app)/balcao/page.client.tsx";
const PONTE_SRC = readdirSync(join(raiz, PONTE_SRC_DIR))
  .filter(f => f.endsWith(".js"))
  .map(f => `${PONTE_SRC_DIR}/${f}`);

let erros = 0;
const erro = msg => { erros += 1; console.error(`🔴 check-matriz: ${msg}`); };

// ---- 1. palavra banida em string de tela -----------------------------------
// Tira comentários (//, /* */ e <!-- -->) e olha o que sobra — string de
// template é tela. `\bDevedor` deixa passar identificador camelCase
// (linhasDevedor é dado, não tela); "Devedor" escrito na tela continua preso.
const semComentario = codigo => codigo
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "")
  .replace(/([^:"'`])\/\/[^\n"'`]*$/gm, "$1");
const BANIDAS = [
  [/Ficou Pendente|Ficou devendo/, "'Ficou Pendente/devendo' morreu — o desfecho é 'Marcou'"],
  [/[Dd]evendo\b/, "'devendo' é proibido em tela — vocabulário é Marcar/Marcou/Total Marcado"],
  [/\bDevedor/, "'Devedor' é proibido em tela"],
  [/>Fiado</, "'Fiado' é dado de banco, nunca rótulo de tela"],
  [/Un R\$|Total: R\$/, "telegrama (Lei 8): 'Un'/'Total:' morreram — 'Nome N×U,UU = R$T,TT'"],
];
for (const arquivo of [...PONTE_SRC, MOCK, BALCAO]) {
  const limpo = semComentario(ler(arquivo));
  for (const [padrao, msg] of BANIDAS) {
    const hit = limpo.match(padrao);
    if (hit) erro(`${arquivo}: "${hit[0]}" — ${msg}`);
  }
}

// ---- 2. paridade APK×web dos rótulos de dinheiro ---------------------------
// APK: todo botão `data-forma="X" ... <b>Rótulo</b>` do mock (a fonte do
// front do celular). Web: PAGAMENTOS do balcão. A palavra por forma é UMA —
// entre telas do mock e entre APK e web.
const rotuloPorForma = new Map();
for (const m of ler(MOCK).matchAll(/data-forma="(\w+)"[^]*?<b>([^<]+)<\/b>/g)) {
  const [, forma, rotulo] = m;
  if (!rotuloPorForma.has(forma)) rotuloPorForma.set(forma, new Set());
  rotuloPorForma.get(forma).add(rotulo);
}
for (const [forma, rotulos] of rotuloPorForma) {
  if (rotulos.size > 1) erro(`mock: a forma "${forma}" aparece com ${rotulos.size} palavras (${[...rotulos].join(" / ")}) — a palavra de dinheiro é UMA em todas as telas.`);
}
const mapaBalcao = {};
for (const par of ler(BALCAO).matchAll(/id:\s*"(\w+)",\s*rotulo:\s*"([^"]+)"/g)) mapaBalcao[par[1]] = par[2];
const paridade = [["dinheiro", "DINHEIRO"], ["pix", "PIX"], ["cartao", "CARTAO"], ["fiado", "FIADO"]];
for (const [chaveApk, chaveWeb] of paridade) {
  const apk = rotuloPorForma.get(chaveApk) && [...rotuloPorForma.get(chaveApk)][0];
  const web = mapaBalcao[chaveWeb];
  if (!apk || !web) { erro(`paridade: não achei o rótulo ${chaveApk}/${chaveWeb} (mock ou balcão mudou de forma — ajuste o fiscal JUNTO).`); continue; }
  if (apk !== web) erro(`paridade APK×web: "${apk}" (mock) ≠ "${web}" (balcão). A palavra de dinheiro é UMA — mude os dois juntos.`);
}

if (erros) {
  console.error(`\ncheck-matriz: ${erros} violação(ões). O padrão mora em docs/PLANEJAMENTOS/PR05082026-MATRIZ-DA-TELA.md §2b.`);
  process.exit(1);
}
console.log(`✅ check-matriz: vocabulário cravado em ${PONTE_SRC.length + 2} arquivos da fonte viva, paridade APK×web ok (${paridade.length} formas).`);
