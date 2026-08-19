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
 *  2. 🔴 Paridade APK×web: todo botão `data-forma` dos mocks e o PAGAMENTOS do
 *     balcão web usam a MESMA palavra por forma — inclusive entre telas do
 *     próprio mock (pegou "Marcou"≠"Marcar" no acerto em 10/08). É assim que
 *     "varra o sistema" nunca mais acontece.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ler = rel => readFileSync(join(raiz, rel), "utf8");

/* 🔴 O FISCAL VARRE TODOS OS APPS DA ESTEIRA (LOTE 1 dos dois apps). Estava
   cravado no `logistica/ponte-src` + no mock dele; com um segundo app na MESMA
   casca, um fiscal de vocabulário que só olha o primeiro sai VERDE enquanto a
   palavra proibida entra pelo outro — e "varra o sistema" acontece de novo.
   Quem diz quais são os alvos é `scripts/lib/apps.js`, o mesmo mapa que os
   geradores usam: fiscal e gerador olhando listas diferentes é como um alvo
   nasce sem fiscal.
   O que AINDA NÃO EXISTE é pulado sem drama (o `vendas` não tem `ponte-src/`
   até o lote que a criar) — mas some da contagem final, então o número diz a
   verdade sobre o que foi realmente medido. */
const { APPS } = createRequire(import.meta.url)(join(raiz, "scripts", "lib", "apps.js"));
const BALCAO = "frontend/src/app/(app)/balcao/page.client.tsx";

const ALVOS = Object.values(APPS).map(app => {
  const temPonte = existsSync(app.ponteSrc);
  return {
    nome: app.nome,
    ponteSrcRel: app.ponteSrcRel,
    mock: existsSync(app.mock) ? app.mockRel : null,
    temPonte,
    ponteSrc: temPonte
      ? readdirSync(app.ponteSrc).filter(f => f.endsWith(".js")).map(f => `${app.ponteSrcRel}/${f}`)
      : [],
  };
});
const MOCKS = ALVOS.map(a => a.mock).filter(Boolean);
const PONTE_SRC = ALVOS.flatMap(a => a.ponteSrc);
if (!MOCKS.length) {
  console.error("🔴 check-matriz: nenhum mock encontrado — a esteira não tem fonte viva pra fiscalizar.");
  process.exit(1);
}
/* 🔴 "PULAR O QUE NÃO EXISTE" NÃO PODE VIRAR "NÃO MEDIR NADA". O `existsSync`
   acima tolera o `vendas`, que ainda não tem ponte — legítimo, e por isso sai
   com RECADO, nunca calado (alvo pulado em silêncio é como um alvo nasce sem
   fiscal). Mas o MESMO `existsSync` deixava o fiscal sair VERDE se a pasta do
   `logistica` sumisse — renomeada, apagada, movida num refactor: zero arquivo
   medido, zero reclamação, portão verde. Verde que mede a coisa errada é pior
   que vermelho. Então: alvo sem ponte é recado; TODOS sem ponte é impossível
   nesta esteira e reprova alto. E pasta que EXISTE e está VAZIA não é "ainda
   não nasceu" — é a ponte apagada por dentro, que é o mesmo cego com outra cara. */
const semPonte = ALVOS.filter(a => !a.temPonte);
for (const a of semPonte) {
  console.log(`  · ${a.nome}: ainda sem ${a.ponteSrcRel}/ — a ponte dele nasce noutro lote, nada a fiscalizar aqui.`);
}
if (semPonte.length === ALVOS.length) {
  console.error(`🔴 check-matriz: NENHUM dos ${ALVOS.length} alvos tem ponte-src/ — isso não acontece com a esteira de pé.`);
  console.error("   Ou a pasta sumiu/foi renomeada, ou o mapa (scripts/lib/apps.js) aponta pra um caminho que não existe mais.");
  process.exit(1);
}
for (const a of ALVOS.filter(x => x.temPonte && !x.ponteSrc.length)) {
  console.error(`🔴 check-matriz: ${a.ponteSrcRel}/ existe e não tem UM .js — ponte esvaziada por dentro fiscaliza zero arquivo em silêncio.`);
  process.exit(1);
}

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
for (const arquivo of [...PONTE_SRC, ...MOCKS, BALCAO]) {
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
// A palavra por forma é UMA entre as telas de CADA mock e entre TODOS os mocks:
// dois apps da casa cobrando com palavras diferentes é o mesmo defeito de
// vocabulário que esta seção existe pra pegar, só que pior (o cliente vê os dois).
const rotuloPorForma = new Map();
for (const mock of MOCKS) {
  for (const m of ler(mock).matchAll(/data-forma="(\w+)"[^]*?<b>([^<]+)<\/b>/g)) {
    const [, forma, rotulo] = m;
    if (!rotuloPorForma.has(forma)) rotuloPorForma.set(forma, new Set());
    rotuloPorForma.get(forma).add(rotulo);
  }
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
const alvosMedidos = ALVOS.map(a => `${a.nome}(${a.ponteSrc.length} ponte-src${a.mock ? " + mock" : ", sem mock"})`).join(" · ");
console.log(`✅ check-matriz: vocabulário cravado em ${PONTE_SRC.length + MOCKS.length + 1} arquivos da fonte viva — ${alvosMedidos} — paridade APK×web ok (${paridade.length} formas).`);
