import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const modal = read("frontend/src/components/hbx/lead-cockpit-modal.tsx");
const css = read("frontend/src/app/hbx-theme/vendas-details2.css");
const page = read("frontend/src/app/(app)/vendas/page.tsx");
const bridge = read("frontend/src/app/(app)/vendas/vendas-fullscreen-bridge.tsx");
const globals = read("frontend/src/app/globals.css");

test("Detalhes 2 mantém o modal compacto aprovado", () => {
  assert.match(css, /width:\s*min\(1180px,\s*calc\(100vw - 44px\)\)/);
  assert.match(css, /height:\s*min\(650px,\s*calc\(100dvh - 42px\)\)/);
  assert.match(css, /\.lead-cockpit__approved-body[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /\.lead-cockpit__approved-grid--service[\s\S]*?grid-template-columns:/);
  assert.match(css, /\.lead-cockpit__approved-grid--registration[\s\S]*?grid-template-columns:/);
  assert.match(css, /\.lead-cockpit__approved-grid--finance[\s\S]*?grid-template-columns:/);
  assert.doesNotMatch(css, /min-width:\s*(?:12|13|14|15)00px/);
});

test("guias, dados e ações reais permanecem no componente", () => {
  for (const guide of ["atendimento", "cadastro", "financeiro"]) {
    assert.match(modal, new RegExp(`key: "${guide}"`));
  }
  assert.match(modal, /<ConversationPanel/);
  assert.match(modal, /<AgendaLeadPanel/);
  assert.match(modal, /<CopilotoPanel/);
  assert.match(modal, /\/email\/presentation\/preview/);
  assert.match(modal, /\/email\/presentation\/send/);
  assert.match(modal, /\/gerar-cobranca/);
  assert.match(modal, /\/financeiro-tenant\/charges\//);
  assert.match(modal, /<RadarAiBadge status=\{aiStatus\}/);
});

test("efeito escrevendo e score progressivo são nativos do modal", () => {
  assert.match(modal, /function TypewriterText/);
  assert.match(modal, /text\.slice\(0, index\)/);
  assert.match(modal, /function AnimatedScore/);
  assert.match(modal, /const duration = 1350/);
  assert.match(css, /\.lead-cockpit__typed:not\(\.is-done\)::after/);
  assert.match(css, /conic-gradient\([\s\S]*?--lead-cockpit-score/);
  assert.doesNotMatch(page, /VendasDetails2Transitions/);
});

test("pipeline continua em tela cheia e abre o cockpit com um clique", () => {
  assert.match(page, /<VendasFullscreenBridge \/>/);
  assert.match(bridge, /dataset\.cockpitOpen = "single-click"/);
  assert.match(bridge, /dispatchEvent\(new MouseEvent\("dblclick"/);
  assert.match(css, /#vendas-panel-funil \.content > \.ctx\.ctx--vendas-detail[\s\S]*?display:\s*none/);
  assert.match(globals, /@import "\.\/hbx-theme\/vendas-details2\.css";/);
});
