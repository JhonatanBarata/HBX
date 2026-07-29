// ============================================================
// CANAIS DO LEAD — a fileira de ícones que diz por onde dá pra falar.
//
// REESCRITO em 28/07/2026. O arquivo lia
// `frontend/src/app/vendas/page.client.tsx` (sem o grupo de rota `(app)`) e
// travava uma implementação que não existe mais em lugar nenhum do
// repositório — `buildLeadChannelAssets` e `MobileChannelIconAsset` sumiram
// numa refatoração anterior e levaram o teste junto: ele estourava na
// LEITURA do arquivo, antes de conferir coisa alguma. Estava vermelho e
// não protegia nada.
//
// A GARANTIA continua a mesma, e é o que este arquivo protege agora: os
// ícones de canal saem do dado REAL do lead (telefone, WhatsApp, e-mail,
// Instagram, Facebook, site) — nunca de enfeite fixo — e Vendas e Radar
// usam a MESMA fileira, pela mesma função central.
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const vendas = read("frontend/src/app/(app)/vendas/page.client.tsx");
const radar = read("frontend/src/app/(app)/leads/page.client.tsx");
const presenca = read("frontend/src/lib/radar-channel-presence.ts");

test("os canais do card de Vendas nascem do dado real do lead", () => {
  assert.match(vendas, /function vendasCanais\(c: VendasLead\): RadarChannel\[\]/);
  // Cada canal tem de vir de um campo do lead — a lista abaixo é o contrato.
  assert.match(vendas, /hasWhatsapp: temZap/);
  assert.match(vendas, /hasPhone: Boolean\(c\.phone\)/);
  assert.match(vendas, /hasEmail: Boolean\(c\.email\)/);
  assert.match(vendas, /instagramUrl: li\?\.instagramUrl \|\| c\.ownerInstagram/);
  assert.match(vendas, /facebookUrl: li\?\.facebookUrl \|\| c\.ownerFacebook/);
  assert.match(vendas, /website: c\.website/);
  // Só entra na tela o canal que a presença confirmou.
  assert.match(vendas, /RADAR_CHANNEL_ORDER\.filter\(canal => presence\[canal\]\)/);
  assert.match(vendas, /aria-label="Canais encontrados"/);
  assert.match(vendas, /<CanalIcon key=\{canal\} canal=\{canal\} size="sm" \/>/);
});

test("Radar e Vendas usam a MESMA fileira, pela mesma função central", () => {
  for (const fonte of [vendas, radar]) {
    assert.match(fonte, /resolveRadarChannelPresence/);
    assert.match(fonte, /RADAR_CHANNEL_ORDER/);
    assert.match(fonte, /CanalIcon/);
    assert.match(fonte, /aria-label="Canais encontrados"/);
  }
  // A ordem dos canais é decidida num lugar só — lista duplicada na tela é
  // como as duas telas saíam diferentes uma da outra.
  assert.match(presenca, /export const RADAR_CHANNEL_ORDER/);
  assert.match(presenca, /export function resolveRadarChannelPresence/);
});
