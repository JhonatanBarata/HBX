import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const previewSource = readFileSync(
  new URL("../frontend/src/app/(app)/leads/radar-status-preview.tsx", import.meta.url),
  "utf8",
);
const vendasClientSource = readFileSync(
  new URL("../frontend/src/app/(app)/vendas/page.client.tsx", import.meta.url),
  "utf8",
);
const vendasPageSource = readFileSync(
  new URL("../frontend/src/app/(app)/vendas/page.tsx", import.meta.url),
  "utf8",
);
const fullscreenBridgeSource = readFileSync(
  new URL("../frontend/src/app/(app)/vendas/vendas-fullscreen-bridge.tsx", import.meta.url),
  "utf8",
);
const vendasMobileSource = readFileSync(
  new URL("../frontend/src/components/casca/screens/vendas.tsx", import.meta.url),
  "utf8",
);
const vendasLiveSource = readFileSync(
  new URL("../frontend/src/app/hbx-theme/vendas-live.css", import.meta.url),
  "utf8",
);
const vendasPolishSource = readFileSync(
  new URL("../frontend/src/app/hbx-theme/vendas-live-polish.css", import.meta.url),
  "utf8",
);
const details2Source = readFileSync(
  new URL("../frontend/src/app/hbx-theme/vendas-details2.css", import.meta.url),
  "utf8",
);
const globalsSource = readFileSync(
  new URL("../frontend/src/app/globals.css", import.meta.url),
  "utf8",
);

const EXPECTED_STATES = ["queued", "processing", "released", "invalidated"];
const EXPECTED_LABELS = [
  "Aguardando liberação",
  "Em processo de liberação",
  "Liberado",
  "Invalidado",
];
const EXPECTED_TONES = ["waiting", "working", "success", "danger"];

function propertyValues(source, property) {
  const pattern = new RegExp(`\\b${property}:\\s*["']([^"']+)["']`, "g");
  return Array.from(source.matchAll(pattern), (match) => match[1]);
}

function quotedValues(source) {
  return Array.from(source.matchAll(/["']([^"']+)["']/g), (match) => match[1]);
}

test("fluxo vivo congela somente os quatro estados e tons aprovados", () => {
  const orderBlock = previewSource.match(/PREVIEW_STATE_ORDER[^=]*=\s*\[([^\]]+)\]/s);
  const statesBlock = previewSource.match(/const PREVIEW_STATES[^=]*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(orderBlock, "PREVIEW_STATE_ORDER precisa permanecer explícita e auditável");
  assert.ok(statesBlock, "PREVIEW_STATES precisa permanecer explícito e auditável");
  assert.deepEqual(quotedValues(orderBlock[1]), EXPECTED_STATES);
  assert.deepEqual(propertyValues(statesBlock[1], "label"), EXPECTED_LABELS);
  assert.deepEqual(propertyValues(statesBlock[1], "tone"), EXPECTED_TONES);

  assert.match(previewSource, /type PreviewState = "queued" \| "processing" \| "released" \| "invalidated"/);
  assert.match(previewSource, /type PreviewTone = "waiting" \| "working" \| "success" \| "danger"/);
  assert.match(previewSource, /PREVIEW_STATE_ORDER\.map/);
  assert.match(previewSource, /data-enrichment-source=\{state\}/);
  assert.match(previewSource, /createPortal\(/);
  assert.match(previewSource, /Radar de enriquecimento/);
});

test("fluxo observa os badges existentes, usa um único cano e preserva as ações dos leads", () => {
  assert.equal(
    (previewSource.match(/document\.createElementNS\(svgNamespace, "svg"\)/g) || []).length,
    1,
    "a tela deve montar um único SVG de encanamento",
  );
  assert.match(previewSource, /const pathFor = \(source: HTMLElement, target: HTMLElement\)/);
  assert.match(previewSource, /\.radar-ai-badge\[data-local-enrichment-state\]/);
  assert.match(previewSource, /target\.dataset\.enrichmentState = status/);
  assert.match(previewSource, /target\.classList\.add\("vnd-enrichment-target"\)/);
  assert.match(previewSource, /tr\[id\^='vnd-row-'\]/);
  assert.match(previewSource, /\.vnd-card/);
  assert.match(previewSource, /prefers-reduced-motion/);

  assert.doesNotMatch(previewSource, /\bapiFetch\b|\bfetch\s*\(|\bXMLHttpRequest\b|\baxios\b/);
  assert.doesNotMatch(previewSource, /send-to-vendas|pull-to-vendas|method:\s*["'](?:POST|PATCH|PUT|DELETE)["']/i);
});

test("pipeline usa toda a largura e o detalhe lateral não ocupa mais a tela", () => {
  assert.match(details2Source, /#vendas-panel-funil \.content[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)\s*!important/);
  assert.match(details2Source, /\.ctx\.ctx--vendas-detail\s*\{[\s\S]*?display:\s*none\s*!important/);
  assert.match(details2Source, /\.hbx-modal\.lead-cockpit\s*\{[\s\S]*?height:\s*calc\(100dvh - 14px\)/);
  assert.match(details2Source, /\.lead-cockpit__body\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(details2Source, /\.lead-cockpit__grid:has\(\.dn-convo\)/);
  assert.match(details2Source, /\.lead-cockpit__body \.tbl-wrap\s*\{[\s\S]*?max-height:\s*310px/);
  assert.doesNotMatch(details2Source, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
});

test("um clique no lead abre o cockpit real sem duplicar regra comercial", () => {
  assert.match(vendasPageSource, /import \{ VendasFullscreenBridge \}/);
  assert.match(vendasPageSource, /<VendasClient \/>[\s\S]*?<VendasFullscreenBridge \/>/);
  assert.match(fullscreenBridgeSource, /#vendas-panel-funil\.vnd-layer\.is-on/);
  assert.match(fullscreenBridgeSource, /INTERACTIVE_SELECTOR/);
  assert.match(fullscreenBridgeSource, /event\.target\.closest\(INTERACTIVE_SELECTOR\)/);
  assert.match(fullscreenBridgeSource, /requestAnimationFrame\(\(\) => openCockpit\(lead\)\)/);
  assert.match(fullscreenBridgeSource, /new MouseEvent\("dblclick"/);
  assert.match(fullscreenBridgeSource, /detail:\s*2/);
  assert.match(fullscreenBridgeSource, /data\.cockpitOpen|dataset\.cockpitOpen/);
  assert.doesNotMatch(fullscreenBridgeSource, /\bapiFetch\b|\bfetch\s*\(|method:\s*["'](?:POST|PATCH|PUT|DELETE)["']/i);

  assert.match(vendasClientSource, /onDoubleClick=\{\(\) => \{ setSel\(card\); setCockpitOpen\(true\); \}\}/);
});

test("gráfico fica no topo e a guia de enriquecimento duplicada permanece escondida", () => {
  assert.match(vendasLiveSource, /\.vnd-enrichment-rail-slot__states\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,/);
  assert.match(vendasLiveSource, /\.vnd-live-pipe\s*\{/);
  assert.match(vendasPolishSource, /#vendas-tab-enriquecimento,[\s\S]*?#vendas-panel-enriquecimento,[\s\S]*?display:\s*none\s*!important/);
  assert.match(vendasPolishSource, /left:\s*-18px/);
  assert.match(globalsSource, /@import "\.\/hbx-theme\/vendas-live\.css";[\s\S]*?@import "\.\/hbx-theme\/vendas-live-polish\.css";[\s\S]*?@import "\.\/hbx-theme\/vendas-details2\.css";\s*$/);
});

test("mobile mantém somente Funil e Buscar, sem tela redundante de status", () => {
  assert.match(vendasMobileSource, /export type Modo = "funil" \| "buscar"/);
  assert.doesNotMatch(vendasMobileSource, /RadarStatusPreview|"enriquecimento"|>\s*Status\s*</);
  assert.match(vendasMobileSource, /return isModuleVisible\("leads", entitlements, user, modules\)/);
  assert.match(vendasMobileSource, /onClick=\{\(\) => onChange\("funil"\)\}/);
  assert.match(vendasMobileSource, /onClick=\{\(\) => onChange\("buscar"\)\}/);
  assert.match(vendasMobileSource, /<VendasFunilMobile modo=\{visibleModo\}/);
  assert.match(vendasMobileSource, /<VendasBuscarMobile modo=\{visibleModo\}/);
});
