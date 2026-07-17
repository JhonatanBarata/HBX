import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const statusSource = read("frontend/src/lib/radar-ai-status.ts");
const badgeSource = read("frontend/src/components/hbx/radar-ai-badge.tsx");
const vendasSource = read("frontend/src/app/(app)/vendas/page.client.tsx");
const vendasBackendSource = read("backend/src/vendas/vendas.service.ts");
const vendasControllerSource = read("backend/src/vendas/vendas.controller.ts");
const radarDesktopSource = read("frontend/src/app/(app)/leads/page.client.tsx");
const vendasMobileSource = read("frontend/src/components/casca/screens/vendas-funil.tsx");
const radarMobileSource = read("frontend/src/components/casca/screens/vendas-buscar.tsx");
const kitSource = read("frontend/src/app/hbx-theme/kit.css");

test("cliente recebe somente os quatro estados aprovados", () => {
  assert.match(statusSource, /type RadarAiPublicState = "none" \| "queued" \| "processing" \| "released" \| "invalidated"/);
  for (const label of ["Aguardando liberação", "Em processo de liberação", "Liberado", "Invalidado"]) {
    assert.equal((statusSource.match(new RegExp(label, "g")) || []).length, 1, `${label} deve ter uma única fonte`);
  }
  assert.doesNotMatch(statusSource, /posição \$\{|fora do horário de pico|telefones? ·|e-mails? ·|Enriquecido por IA/);
  assert.doesNotMatch(badgeSource, /summary|description|reasonCode|stage/);
});

test("fases internas convergem para as quatro cores públicas", () => {
  assert.match(statusSource, /PROCESSING_STATES[\s\S]*?"crawling"[\s\S]*?"inference_30b"[\s\S]*?"committing"/);
  assert.match(statusSource, /QUEUED_STATES[\s\S]*?"retry"[\s\S]*?"offline"/);
  assert.match(statusSource, /RELEASED_STATES[\s\S]*?"completed"[\s\S]*?"no_new_data"/);
  assert.match(statusSource, /INVALIDATED_STATES[\s\S]*?"dead"[\s\S]*?"invalidated"/);
  for (const state of ["queued", "processing", "released", "invalidated"]) {
    assert.match(kitSource, new RegExp(`\\.radar-ai-badge--${state}`));
  }
  assert.match(kitSource, /queued[^\n]*--hbx-warning/);
  assert.match(kitSource, /processing[^\n]*--hbx-info/);
  assert.match(kitSource, /released[^\n]*--hbx-success/);
  assert.match(kitSource, /invalidated[^\n]*--hbx-danger/);
});

test("polling não encerra em none ou resposta vazia", () => {
  assert.match(statusSource, /previous\[id\] \|\| \{ state: "none" \}/);
  assert.match(statusSource, /const allTerminal = ids\.every\(\(id\) => isRadarAiTerminal\(next\[id\]\)\)/);
  assert.doesNotMatch(statusSource, /stillActive|!Object\.keys\(rawItems\)\.length/);
  assert.match(statusSource, /before && !isRadarAiTerminal\(before\)/);
  assert.match(statusSource, /onTerminalRef\.current\?\.\(id, current\)/);
});

test("Vendas consulta a missão pelo radarLeadId real", () => {
  assert.match(vendasBackendSource, /radarLeadId: this\.extractRadarLeadId\(row\?\.sourceHistoryId\)/);
  assert.match(vendasSource, /radarLeadId\?: string \| null/);
  assert.match(vendasSource, /useRadarAiStatusPoll\(flatLeads\.map\(card => card\.radarLeadId \|\| ""\)/);
  assert.doesNotMatch(vendasSource, /useRadarAiStatusPoll\(flatLeads\.map\(card => card\.id\)/);
  assert.match(vendasSource, /aiStatusMap\[card\.radarLeadId \|\| ""\]/);
});

test("Radar e Vendas mobile reutilizam o mesmo badge e atualizam ao concluir", () => {
  for (const source of [vendasMobileSource, radarMobileSource]) {
    assert.match(source, /import \{ RadarAiBadge \}/);
    assert.match(source, /useRadarAiStatusPoll/);
    assert.match(source, /onTerminal:/);
    assert.match(source, /<RadarAiBadge/);
  }
  assert.match(vendasMobileSource, /card\.radarLeadId \|\| ""/);
  assert.match(radarMobileSource, /items\.map\(item => item\.id\)/);
});

test("conclusão recarrega somente o card afetado", () => {
  assert.match(vendasControllerSource, /@Get\('lead\/:leadId\/card'\)/);
  assert.match(vendasBackendSource, /async getLeadCardForUser/);
  assert.match(vendasSource, /refreshBoardLead/);
  assert.match(vendasSource, /\/vendas\/lead\/\$\{encodeURIComponent\(current\.id\)\}\/card/);
  assert.match(vendasMobileSource, /\/vendas\/lead\/\$\{encodeURIComponent\(current\.id\)\}\/card/);
  assert.match(radarDesktopSource, /\/webscraping\/radar\/leads\/\$\{encodeURIComponent\(radarLeadId\)\}/);
  assert.match(radarMobileSource, /\/webscraping\/radar\/leads\/\$\{encodeURIComponent\(radarLeadId\)\}/);
});
