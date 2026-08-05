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
// 05/08: `vendasCanais` saiu de dentro do page.client e virou LIB
// (lib/vendas-channels.ts) — consumida por Vendas, Central do Lead e preview.
// O invariante "mesma função central" ficou MAIS verdadeiro; o teste pinava o
// endereço velho e morreu. Pina-se agora a lib.
const canais = read("frontend/src/lib/vendas-channels.ts");

test("os canais do card de Vendas nascem do dado real do lead", () => {
  assert.match(canais, /export function vendasCanais\(lead: VendasChannelLead\): RadarChannel\[\]/);
  // Cada canal tem de vir de um campo do lead — a lista abaixo é o contrato.
  assert.match(canais, /hasWhatsapp: temWhatsApp/);
  assert.match(canais, /hasPhone: Boolean\(lead\.phone\)/);
  assert.match(canais, /hasEmail: Boolean\(lead\.email\)/);
  assert.match(canais, /instagramUrl: intelligence\?\.instagramUrl \|\| lead\.ownerInstagram/);
  assert.match(canais, /facebookUrl: intelligence\?\.facebookUrl \|\| lead\.ownerFacebook/);
  assert.match(canais, /website: lead\.website/);
  // Só entra na tela o canal que a presença confirmou.
  assert.match(canais, /RADAR_CHANNEL_ORDER\.filter\(\(canal\) => presence\[canal\]\)/);
  // E a tela de Vendas consome a lib — não tem lista própria de canal.
  assert.match(vendas, /import \{ vendasCanais \} from "@\/lib\/vendas-channels"/);
  assert.match(vendas, /aria-label="Canais encontrados"/);
  assert.match(vendas, /<CanalIcon key=\{canal\} canal=\{canal\} size="sm" \/>/);
});

test("Radar e Vendas usam a MESMA fileira, pela mesma função central", () => {
  // As duas telas renderizam a mesma fileira acessível com o mesmo ícone…
  for (const fonte of [vendas, radar]) {
    assert.match(fonte, /CanalIcon/);
    assert.match(fonte, /aria-label="Canais encontrados"/);
  }
  // …e a presença vem da MESMA função central: o Radar chama direto, Vendas
  // chama pela lib vendasCanais (que delega pra ela).
  assert.match(radar, /resolveRadarChannelPresence/);
  assert.match(radar, /RADAR_CHANNEL_ORDER/);
  assert.match(canais, /resolveRadarChannelPresence/);
  assert.match(canais, /RADAR_CHANNEL_ORDER/);
  // A ordem dos canais é decidida num lugar só — lista duplicada na tela é
  // como as duas telas saíam diferentes uma da outra.
  assert.match(presenca, /export const RADAR_CHANNEL_ORDER/);
  assert.match(presenca, /export function resolveRadarChannelPresence/);
  // E a tela de Vendas NÃO importa a presença crua — se voltar a chamar
  // direto, a lib deixou de ser o lugar único.
  assert.doesNotMatch(vendas, /import[^\n]*resolveRadarChannelPresence/);
});
