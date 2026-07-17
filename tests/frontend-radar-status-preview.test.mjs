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
const vendasMobileSource = readFileSync(
  new URL("../frontend/src/components/casca/screens/vendas.tsx", import.meta.url),
  "utf8",
);
const vendasLiveSource = readFileSync(
  new URL("../frontend/src/app/hbx-theme/vendas-live.css", import.meta.url),
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
  assert.match(previewSource, /data-preview-state=\{state\}/);
  assert.match(previewSource, /data-enrichment-source=\{state\}/);
  assert.match(previewSource, /aria-pressed=\{active\}/);
  assert.match(previewSource, /createPortal\(/);
  assert.match(previewSource, /Radar de enriquecimento/);
});

test("fluxo observa os badges existentes, usa um único cano e preserva as ações dos leads", () => {
  assert.equal(
    (previewSource.match(/document\.createElementNS\(svgNamespace, "svg"\)/g) || []).length,
    1,
    "a tela deve montar um único SVG de encanamento",
  );
  assert.match(previewSource, /const pipe = document\.createElementNS\(svgNamespace, "svg"\)/);
  assert.match(previewSource, /const pathFor = \(source: HTMLElement, target: HTMLElement\)/);
  assert.match(previewSource, /\.radar-ai-badge\[data-local-enrichment-state\]/);
  assert.match(previewSource, /target\.dataset\.enrichmentState = status/);
  assert.match(previewSource, /target\.classList\.add\("vnd-enrichment-target"\)/);
  assert.match(previewSource, /target\.dispatchEvent\(new MouseEvent\("click", \{ bubbles: true \}\)\)/);
  assert.match(previewSource, /tr\[id\^='vnd-row-'\]/);
  assert.match(previewSource, /\.row-dense/);
  assert.match(previewSource, /\.be-card/);
  assert.match(previewSource, /prefers-reduced-motion/);

  assert.doesNotMatch(previewSource, /\bapiFetch\b|\bfetch\s*\(|\bXMLHttpRequest\b|\baxios\b/);
  assert.doesNotMatch(previewSource, /send-to-vendas|pull-to-vendas|method:\s*["'](?:POST|PATCH|PUT|DELETE)["']/i);
});

test("acabamento do Vendas cobre topo, cano, cockpit, Detalhes e Buscar sem cor literal", () => {
  assert.match(vendasLiveSource, /\.vnd-enrichment-rail-slot__states\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,/);
  assert.match(vendasLiveSource, /\.vnd-live-pipe\s*\{/);
  assert.match(vendasLiveSource, /\.vnd-live-token--released\s*\{\s*--flow-color:\s*var\(--hbx-success\)/);
  assert.match(vendasLiveSource, /\.vnd-enrichment-target\.is-enrichment-arrival/);
  assert.match(vendasLiveSource, /\.hbx-modal\.lead-cockpit\s*\{/);
  assert.match(vendasLiveSource, /\.lead-cockpit__body\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(vendasLiveSource, /\.ctx\.ctx--vendas-detail\s*>\s*\.ctx-body\s*\{[\s\S]*?overflow-y:\s*auto\s*!important/);
  assert.match(vendasLiveSource, /\.dn-root--vendas \.dn-typed\s*\{/);
  assert.match(vendasLiveSource, /\.vnd-layer--buscar \.row-dense/);
  assert.match(globalsSource, /@import "\.\/hbx-theme\/vendas-live\.css";\s*$/);
  assert.doesNotMatch(vendasLiveSource, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
});

test("desktop disponibiliza Enriquecimento em produção e preserva o gate comercial do Radar", () => {
  assert.doesNotMatch(vendasPageSource, /headers\(\)|hostname|localhost|127\.0\.0\.1|::1|statusPreviewAvailable/);
  assert.match(vendasPageSource, /<VendasClient \/>/);
  assert.match(vendasPageSource, /<LeadPullProgressOverlay \/>/);

  assert.doesNotMatch(vendasClientSource, /statusPreviewAvailable|localhost|127\.0\.0\.1|::1/);
  assert.match(vendasClientSource, /useState<"funil" \| "buscar" \| "enriquecimento">\("funil"\)/);
  assert.match(vendasClientSource, /<span>Meu funil<\/span>/);
  assert.match(vendasClientSource, /<span>Buscar empresas<\/span>/);
  assert.match(
    vendasClientSource,
    /\{podeBuscarLeads && \(\s*<button[\s\S]{0,240}?id="vendas-tab-enriquecimento"[\s\S]{0,420}?<span>Enriquecimento<\/span>/,
    "a terceira guia deve permanecer disponível em produção apenas para quem pode acessar o Radar",
  );
  assert.match(vendasClientSource, /vnd-modehost--enrichment-status-enabled/);
  assert.match(vendasClientSource, /id="vendas-panel-funil"/);
  assert.match(vendasClientSource, /id="vendas-panel-buscar"/);
  assert.match(
    vendasClientSource,
    /\{podeBuscarLeads && \(\s*<div id="vendas-panel-enriquecimento"[\s\S]*?<RadarStatusPreview/,
  );
});

test("mobile disponibiliza Status em produção sem furar o gate comercial do Radar", () => {
  assert.match(vendasMobileSource, /import \{ RadarStatusPreview \} from "@\/app\/\(app\)\/leads\/radar-status-preview"/);
  assert.match(vendasMobileSource, /export type Modo = "funil" \| "buscar" \| "enriquecimento"/);
  assert.doesNotMatch(vendasMobileSource, /useStatusPreviewAvailable|hostname|localhost|127\.0\.0\.1|::1|statusPreviewAvailable/);
  assert.match(vendasMobileSource, /return isModuleVisible\("leads", entitlements, user, modules\)/);
  assert.match(vendasMobileSource, /\{canSearchLeads && \([\s\S]*?onChange\("buscar"\)[\s\S]*?onChange\("enriquecimento"\)[\s\S]*?\)\}/);
  assert.match(vendasMobileSource, /const visibleModo: Modo = canSearchLeads \? modo : "funil"/);

  assert.match(vendasMobileSource, /onClick=\{\(\) => onChange\("funil"\)\}[\s\S]*?>\s*Funil\s*<\/button>/);
  assert.match(vendasMobileSource, /onClick=\{\(\) => onChange\("buscar"\)\}[\s\S]*?>\s*Buscar\s*<\/button>/);
  assert.match(
    vendasMobileSource,
    /onClick=\{\(\) => onChange\("enriquecimento"\)\}[\s\S]*?>\s*Status\s*<\/button>/,
    "o botão Status deve permanecer disponível também em produção",
  );
  assert.match(vendasMobileSource, /visibleModo === "enriquecimento"[\s\S]*?<RadarStatusPreview/);
  assert.match(vendasMobileSource, /<VendasFunilMobile modo=\{visibleModo\}/);
  assert.match(vendasMobileSource, /<VendasBuscarMobile modo=\{visibleModo\}/);
});
