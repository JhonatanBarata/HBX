// ============================================================
// RADAR — filtro de canal, ranking e explicação.
//
// REESCRITO em 28/07/2026. O arquivo lia
// `frontend/src/app/radar-digital/page.client.tsx`, que não existe: a tela
// virou `/leads` (Radar unificada) e depois passou pela REFUNDAÇÃO, que
// moveu a busca pra SESSÃO no servidor. `RadarChannelFilterControls`,
// `leadExplanation` e `RadarLeadChannelIcons` não existem mais em lugar
// nenhum — o teste estourava na leitura do arquivo, antes de conferir
// qualquer coisa. Estava vermelho e não protegia nada.
//
// AS TRÊS GARANTIAS continuam as mesmas, agora medidas onde o código
// realmente está:
//   1. o filtro de canal escolhido vai pro backend, não é enfeite;
//   2. a ordem comercial NÃO é calculada no front;
//   3. "por que este lead apareceu" e os canais vêm do backend.
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const radar = read("frontend/src/app/(app)/leads/page.client.tsx");

test("o filtro de canal escolhido vai pro backend", () => {
  // Vai no corpo da sessão de busca — só quando o usuário escolheu algum.
  assert.match(radar, /if \(requiredChannels\.length > 0\) \{\s*\n\s*body\.requiredChannels = requiredChannels;\s*\n\s*body\.channelMatchMode = channelMatchMode;/);
  assert.match(radar, /apiFetch<SessionResponse>\("\/webscraping\/radar\/sessions", \{/);
  // E fica gravado no filtro salvo, com o modo (todos × algum).
  assert.match(radar, /f\.requiredChannels = input\.requiredChannels;/);
  assert.match(radar, /f\.channelMatchMode = input\.channelMatchMode;/);
  assert.match(radar, /channelMatchMode: "any_required" \| "all_required"/);
});

test("a ordem comercial não é calculada no front", () => {
  assert.doesNotMatch(radar, /function radarCommercialRank/);
  assert.doesNotMatch(radar, /sortRadarLeadsForSales/);
  // O front é espectador da sessão do servidor: ele adota o que vem.
  assert.match(radar, /adoptSession\(res\)/);
});

test("o motivo da inclusão e os canais vêm do backend", () => {
  // "Por que entrou" é o texto do backend traduzido, nunca inventado aqui.
  assert.match(radar, /inclusionReasons\?: string\[\] \| null/);
  assert.match(radar, /Por que entrou: \$\{inclusionReasons\.map\(inclusionReasonLabel\)/);
  assert.match(radar, /function inclusionReasonLabel\(code: string\): string \{\s*\n\s*return INCLUSION_REASON_LABELS\[code\] \|\| code;/);
  // Canais do card do Radar: mesma presença central da tela de Vendas.
  assert.match(radar, /const channelPresence = resolveRadarChannelPresence\(row\);/);
  assert.match(radar, /aria-label="Canais encontrados"/);
});
