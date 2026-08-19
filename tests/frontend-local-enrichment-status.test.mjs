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
const radarDetailSource = read("frontend/src/app/(app)/leads/[id]/page.client.tsx");
// 🪦 `vendasMobileSource` (casca/screens/vendas-funil.tsx) e `radarMobileSource`
// (casca/screens/vendas-buscar.tsx) moravam aqui. Foram apagados junto com a
// pasta `components/casca/` inteira no commit 694abdc5 ("o HBX do navegador é de
// COMPUTADOR — a view mobile morreu inteira"): no celular o app virou parede +
// "baixe o .app", não existe mais tela de telefone pra ler. Custo que este
// bilhete evita: sem ele o próximo que topar com o teste reapontado abaixo
// tenta "consertar" recriando a leitura de um arquivo que não volta mais.
const centralDoLeadSource = read("frontend/src/components/hbx/central-do-lead.tsx");
const kitSource = read("frontend/src/app/hbx-theme/kit.css");

function statusToken(state, theme, token) {
  const prefix = theme === "dark" ? String.raw`\[data-theme-mode="dark"\]\s+` : "";
  const block = kitSource.match(new RegExp(`${prefix}\\.radar-ai-badge--${state}\\s*\\{([^}]+)\\}`));
  assert.ok(block, `bloco ${theme} de ${state} deve existir`);
  const value = block[1].match(new RegExp(`--radar-ai-status-${token}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(value, `token ${token} de ${state}/${theme} deve existir`);
  return value[1].toLowerCase();
}

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map(part => Number.parseInt(part, 16) / 255);
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

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
});

test("quatro estados, quatro tokens distintos — cor local morreu com a reforma das peles", () => {
  // Este teste guardava hex locais por estado/tema e PROIBIA usar os tokens
  // semânticos do app. A reforma das peles (03/08) inverteu a lei: hex solto
  // em kit.css é o que o check-pele REPROVA, e o contraste dos 4 semânticos
  // passou a ser garantido NA FONTE (paleta OKLCH central, medida nos 2 modos
  // — L 0,50 = zero reprovações WCAG). O teste ficou guardando a lei revogada.
  // O que segue valendo — e é o que se pina agora:
  // 1 · cada estado aponta pra um token semântico DIFERENTE (4 estados, 4 cores);
  const mapa = {
    queued: "warning",
    processing: "info",
    released: "success",
    invalidated: "danger",
  };
  for (const [state, token] of Object.entries(mapa)) {
    assert.match(
      kitSource,
      new RegExp(`\\.radar-ai-badge--${state}[^}]*--radar-ai-status:\\s*var\\(--hbx-${token}\\)`, "s"),
      `${state} deve apontar pra --hbx-${token}`,
    );
  }
  // 2 · a pintura inteira do badge deriva de UM custom property — trocar a
  //     paleta troca o badge junto, sem cor órfã;
  assert.match(kitSource, /\.radar-ai-badge\s*\{[^}]*color:\s*var\(--radar-ai-status\)/s);
  assert.match(kitSource, /\.radar-ai-badge\s*\{[^}]*color-mix\(in srgb, var\(--radar-ai-status\)/s);
  // 3 · nenhum hex cru voltou pros blocos dos 4 estados (a lei nova).
  assert.doesNotMatch(kitSource, /radar-ai-badge--(?:queued|processing|released|invalidated)[^{]*\{[^}]*#[0-9a-fA-F]{3,8}\b/s);
});

test("polling não encerra em none ou resposta vazia", () => {
  assert.match(statusSource, /previous\[id\] \|\| \{ state: "none" \}/);
  assert.match(statusSource, /const allTerminal = ids\.every\(\(id\) => isRadarAiTerminal\(next\[id\]\)\)/);
  assert.doesNotMatch(statusSource, /stillActive|!Object\.keys\(rawItems\)\.length/);
  assert.match(statusSource, /before && !isRadarAiTerminal\(before\)/);
  assert.match(statusSource, /onTerminalRef\.current\?\.\(id, current\)/);
});

test("polling divide listas grandes em lotes de no máximo 200 e preserva o último estado", () => {
  assert.match(statusSource, /RADAR_AI_STATUS_BATCH_SIZE = 200/);
  assert.match(statusSource, /ids\.slice\(index, index \+ RADAR_AI_STATUS_BATCH_SIZE\)/);
  assert.match(statusSource, /Promise\.allSettled/);
  assert.match(statusSource, /JSON\.stringify\(\{ leadIds: batch \}\)/);
  assert.match(statusSource, /Object\.assign\(rawItems, response\.value\.items\)/);
  assert.match(statusSource, /previous\[id\] \|\| \{ state: "none" \}/);
});

test("lista densa do Radar mostra o badge sem aumentar a altura da linha", () => {
  assert.match(radarDesktopSource, /<span>Status<\/span>/);
  assert.match(radarDesktopSource, /className="row-dense__owner"[\s\S]*?<RadarAiBadge status=\{aiStatusMap\[row\.id\]\}/);
  assert.match(kitSource, /\.row-dense\s*\{[^}]*height:\s*var\(--row-height\)/s);
});

test("status local substitui a quinta mensagem legada enquanto estiver visível", () => {
  assert.match(radarDesktopSource, /hasLocalEnrichmentStatus = Boolean\(localEnrichmentStatus && localEnrichmentStatus\.state !== "none"\)/);
  assert.match(radarDesktopSource, /enriching=\{hasLocalEnrichmentStatus \? false : enriching\}/);
  assert.match(radarDesktopSource, /crownSlot=\{<RadarAiBadge status=\{localEnrichmentStatus\}/);
});

test("Vendas consulta a missão pelo radarLeadId real", () => {
  assert.match(vendasBackendSource, /radarLeadId: this\.extractRadarLeadId\(row\?\.sourceHistoryId\)/);
  assert.match(vendasSource, /radarLeadId\?: string \| null/);
  assert.match(vendasSource, /useRadarAiStatusPoll\(flatLeads\.map\(card => card\.radarLeadId \|\| ""\)/);
  assert.doesNotMatch(vendasSource, /useRadarAiStatusPoll\(flatLeads\.map\(card => card\.id\)/);
  assert.match(vendasSource, /aiStatusMap\[card\.radarLeadId \|\| ""\]/);
});

// 06/08 (694abdc5): este teste lia as DUAS telas mobile da casca. Elas morreram,
// mas a garantia NÃO: o que ele pinava era "Radar e Vendas mostram o MESMO selo,
// vindo do MESMO poll, e a tela se atualiza sozinha quando a missão termina" — e
// quem a mobile copiava (as telas de COMPUTADOR /vendas e /leads) segue vivo com
// exatamente esse desenho. Então a leitura foi REAPONTADA pras telas vivas, em vez
// de o teste ser apagado. Único pedaço que se perdeu de propósito: a palavra
// "mobile" — não há segunda superfície pra cobrar reuso hoje.
test("Radar e Vendas usam o mesmo selo, o mesmo poll e se atualizam ao concluir", () => {
  for (const [tela, source] of [["Vendas", vendasSource], ["Radar", radarDesktopSource]]) {
    // O selo é IMPORTADO do módulo central: se alguém forkar um badge próprio na
    // tela, os estados divergem e o vendedor vê duas verdades pro mesmo lead.
    assert.match(
      source,
      /import \{ RadarAiBadge \} from "@\/components\/hbx\/radar-ai-badge"/,
      `${tela} deve importar o selo central, não forkar o seu`,
    );
    // `onTerminal` é o que faz a tela reagir SOZINHA ao fim da missão — sem ele o
    // selo fica verde mas os dados enriquecidos só aparecem no próximo F5.
    assert.match(
      source,
      /useRadarAiStatusPoll\([^;]*onTerminal:\s*\(radarLeadId\) =>/s,
      `${tela} deve assinar o poll com onTerminal`,
    );
    assert.match(source, /<RadarAiBadge status=\{aiStatusMap\[/, `${tela} deve pintar o selo do mapa do poll`);
  }
  // Cada tela chaveia pelo id CERTO: Vendas pelo radarLeadId do card (o id
  // comercial não é radarLeadId), o Radar pelo id do próprio lead. Os nomes dos
  // parâmetros da lambda ficam soltos de propósito — renomear `row`/`item` não é
  // regressão, trocar o CAMPO é.
  assert.match(vendasSource, /useRadarAiStatusPoll\(flatLeads\.map\(\w+ => \w+\.radarLeadId \|\| ""\)/);
  assert.match(radarDesktopSource, /useRadarAiStatusPoll\(items\.map\(\w+ => \w+\.id\)/);
});

// 28/07: o Detalhes do /vendas foi reescrito no desenho aprovado ("Central do
// Lead"), e a linha de identidade dele é fechada — nome, segmento, cidade, RFB
// e "sem site", nada mais. O selo de status da IA continua VISÍVEL pro
// vendedor, no card do quadro, que é onde ele decide qual lead abrir; o que
// mudou é que a ficha não repete o selo nem abre um segundo polling.
test("status da IA aparece uma vez por tela, sem polling duplicado", () => {
  assert.match(radarDetailSource, /useRadarAiStatusPoll\(\[leadId\]/);
  assert.equal(
    (radarDetailSource.match(/crownSlot=\{<RadarAiBadge status=\{aiStatusMap\[lead\.id\]\} \/>\}/g) || []).length,
    2,
    "os dois DetalhesNegocio devem mostrar o status",
  );
  // O quadro do Vendas é o dono do selo e do polling.
  assert.match(vendasSource, /<RadarAiBadge status=\{aiStatusMap\[/);
  assert.match(vendasSource, /useRadarAiStatusPoll/);
  // A Central do Lead não repete nem re-consulta.
  assert.doesNotMatch(centralDoLeadSource, /useRadarAiStatusPoll|RadarAiBadge/);
});

// Este teste tinha DUAS metades: a de computador (endpoint do card + as duas
// telas que o chamam) e a mobile, que repetia a mesma cobrança nas telas da
// casca. A metade mobile saiu com os arquivos dela em 694abdc5; a de computador
// — que é onde o recarregamento cirúrgico de fato acontece hoje — ficou INTEIRA.
test("conclusão recarrega somente o card afetado", () => {
  assert.match(vendasControllerSource, /@Get\('lead\/:leadId\/card'\)/);
  assert.match(vendasBackendSource, /async getLeadCardForUser/);
  assert.match(vendasSource, /refreshBoardLead/);
  // Recarrega UM card pelo endpoint de card — nunca a lista inteira.
  assert.match(vendasSource, /\/vendas\/lead\/\$\{encodeURIComponent\(current\.id\)\}\/card/);
  assert.match(radarDesktopSource, /\/webscraping\/radar\/leads\/\$\{encodeURIComponent\(radarLeadId\)\}/);
});
