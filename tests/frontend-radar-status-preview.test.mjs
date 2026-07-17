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

test("preview congela somente os quatro estados e tons aprovados", () => {
  const orderBlock = previewSource.match(/PREVIEW_STATE_ORDER[^=]*=\s*\[([^\]]+)\]/s);
  const statesBlock = previewSource.match(/const PREVIEW_STATES[^=]*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(orderBlock, "PREVIEW_STATE_ORDER precisa permanecer explícita e auditável");
  assert.ok(statesBlock, "PREVIEW_STATES precisa permanecer explícito e auditável");
  assert.deepEqual(quotedValues(orderBlock[1]), EXPECTED_STATES);
  assert.deepEqual(propertyValues(statesBlock[1], "label"), EXPECTED_LABELS);
  assert.deepEqual(propertyValues(statesBlock[1], "tone"), EXPECTED_TONES);

  assert.match(previewSource, /tone: "waiting" \| "working" \| "success" \| "danger"/);
  assert.match(previewSource, /radar-status-preview--\$\{status\.tone\}/);
  assert.match(previewSource, /radar-status-preview__step--\$\{itemMeta\.tone\}/);
  assert.match(previewSource, /data-preview-state=\{state\}/);
  assert.match(previewSource, /role="status"/);
  assert.match(previewSource, /aria-live="polite"/);
});

test("preview não reintroduz descrição, clarity, autoplay, API ou ação comercial", () => {
  assert.doesNotMatch(previewSource, /\bdescription\s*:|\bclarity\b|lifecycleLabel/i);
  assert.doesNotMatch(previewSource, /\bautoplay\b|\bplaying\b|setInterval|setTimeout|Simular|Pausar simulação/i);
  assert.doesNotMatch(previewSource, /\bapiFetch\b|\bfetch\s*\(|\bXMLHttpRequest\b|\baxios\b/);
  assert.doesNotMatch(previewSource, /send-to-vendas|pull-to-vendas|method:\s*["'](?:POST|PATCH|PUT|DELETE)["']/i);

  assert.match(previewSource, /PREVIEW_STATE_ORDER\.map/);
  assert.match(previewSource, /aria-pressed=\{isActive\}/);
  assert.match(previewSource, /onClick=\{\(\) => setState\(item\)\}/);
  assert.match(previewSource, /Empresa Aurora/);
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
