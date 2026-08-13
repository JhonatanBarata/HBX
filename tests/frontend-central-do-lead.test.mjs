// ============================================================
// CENTRAL DO LEAD — a âncora do desenho aprovado (28/07/2026).
//
// Este arquivo substitui frontend-vendas-details2-approved.test.mjs, que
// travava o Detalhes ANTIGO linha a linha. Aquele desenho foi deletado por
// ordem do dono ("remova todos legados... não quero reaproveitado nada"), e
// um teste que guarda um desenho morto só serve pra impedir a substituição.
//
// O que este aqui protege:
//  1. o legado REALMENTE saiu (nada de voltar por engano num merge);
//  2. a Premium tem paleta PRÓPRIA e não herda cor de tema nenhum;
//  3. o desenho da referência está na tela, medida por medida;
//  4. o backend não mudou — as mesmas rotas continuam ligadas.
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const url = (path) => new URL(`../${path}`, import.meta.url);
const read = (path) => readFileSync(url(path), "utf8");

const central = read("frontend/src/components/hbx/central-do-lead.tsx");
const conversa = read("frontend/src/components/hbx/central-do-lead-conversa.tsx");
const css = read("frontend/src/app/hbx-theme/central-do-lead.css");
// 03/08 a reforma das peles matou casca-premium.css e theme-premium.css; a paleta
// da ficha migrou pra theme-central-do-lead.css, declarada NO PRÓPRIO `.cdl` (alvo
// único — imune a casca e a modo escuro por construção, não por override). Este
// teste apontava pros arquivos mortos e CRASHAVA no import — ou seja, TODAS as
// âncoras abaixo ficaram desligadas de 03/08 a 05/08 sem ninguém ver. Teste que
// não carrega não protege nada.
const temaCdl = read("frontend/src/app/hbx-theme/theme-central-do-lead.css");
const globals = read("frontend/src/app/globals.css");
const vendas = read("frontend/src/app/(app)/vendas/page.client.tsx");

test("o Detalhes velho não existe mais em lugar nenhum", () => {
  for (const morto of [
    "frontend/src/components/hbx/lead-cockpit-modal.tsx",
    "frontend/src/components/hbx/lead-cockpit-history.tsx",
    "frontend/src/app/hbx-theme/vendas-details2.css",
  ]) {
    assert.equal(existsSync(url(morto)), false, `${morto} devia ter sido deletado`);
  }
  // O @import morreu; o nome sobrevive só no comentário que conta a história.
  assert.doesNotMatch(globals, /@import[^\n]*vendas-details2/);
  assert.doesNotMatch(vendas, /LeadCockpitModal|lead-cockpit-modal/);
  assert.match(vendas, /import \{ CentralDoLead \} from "@\/components\/hbx\/central-do-lead"/);
  assert.match(vendas, /<CentralDoLead/);
  // Nenhum vocabulário do desenho velho sobreviveu dentro do novo.
  for (const fonte of [central, conversa, css]) {
    assert.doesNotMatch(fonte, /lead-cockpit__|lead-history__/);
  }
});

test("a ficha tem paleta própria — não herda cor de tema nenhum", () => {
  // A cor mora SÓ na pele (é onde o check-pele permite literal).
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  // A paleta da referência agora tem UM alvo só: declarada no PRÓPRIO `.cdl`,
  // a ficha sai igual em qualquer casca e em qualquer modo — não existe mais
  // o override de [data-theme] pra dar errado. As cores-âncora do desenho
  // aprovado (28/07) seguem valendo, byte a byte:
  assert.match(temaCdl, /\.cdl \{/);
  assert.match(temaCdl, /--cdl-brand:\s*#2E6BFF/i);
  assert.match(temaCdl, /--cdl-money:\s*#0FA968/i);
  assert.match(temaCdl, /--cdl-amber:\s*#E8960C/i);
  assert.match(temaCdl, /--cdl-dark:\s*#0E1729/i);
  assert.match(temaCdl, /--cdl-paper:\s*#EEF1F8/i);
  // Os arquivos mortos da reforma de 03/08 não podem voltar num merge.
  for (const morto of [
    "frontend/src/app/hbx-theme/casca-premium.css",
    "frontend/src/app/hbx-theme/theme-premium.css",
  ]) {
    assert.equal(existsSync(url(morto)), false, `${morto} morreu na reforma das peles (03/08)`);
  }
  // Ordem de import: o tema da ficha antes das cascas, a folha da ficha DEPOIS
  // de todas (é a ordem real do globals.css — quem inverter quebra a cascata).
  const iTema = globals.indexOf("theme-central-do-lead.css");
  const iModern = globals.indexOf("casca-modern.css");
  const iCorp = globals.indexOf("casca-corporativa.css");
  // A barra na âncora é obrigatória: "central-do-lead.css" é SUBSTRING de
  // "theme-central-do-lead.css" e sem ela o indexOf casa no import errado.
  const iCdl = globals.indexOf("/central-do-lead.css");
  assert.ok(iTema > 0 && iModern > iTema && iCorp > iModern && iCdl > iCorp,
    "ordem: theme-central-do-lead → cascas → central-do-lead.css por último");
});

test("o desenho da referência está na tela, medida por medida", () => {
  // 1 · funil = UMA peça em setas (clip-path), não 5 botões com número.
  assert.match(css, /\.cdl-step\s*\{[\s\S]*?clip-path:\s*polygon\(/);
  assert.match(css, /\.cdl-step\s*\{[\s\S]*?height:|\.cdl-funnel\s*\{[\s\S]*?height:\s*38px/);
  assert.doesNotMatch(central, /\{index \+ 1\}/);
  // 2 · régua de vitais no topo escuro: anel, prontidão em 6 barrinhas, AGORA.
  assert.match(css, /\.cdl-vitals\s*\{[\s\S]*?display:\s*flex/);
  assert.match(css, /\.cdl-seg i\.is-on/);
  assert.match(css, /\.cdl-vit\.is-now/);
  assert.match(central, /Prontidão/);
  assert.match(central, /Último contato/);
  // 3 · aba no degrau t10 (o 13,5px de antes da tipografia central) peso 650,
  //     com régua de 3px deslizante. O pino mudou de px pra TOKEN em 04/08:
  //     a medida agora mora em typography.css e a tela só aponta pro degrau.
  assert.match(css, /\.cdl-tab\s*\{[\s\S]*?font-size:\s*var\(--fz-t10\)[\s\S]*?font-weight:\s*650/);
  assert.match(css, /\.cdl-tabs \.glass-pill__glass\s*\{[\s\S]*?height:\s*3px/);
  // 4 · ícone de 24px na caixa de 40 (60% — regra ótica).
  assert.match(css, /\.cdl-chan\s*\{[\s\S]*?width:\s*40px[\s\S]*?height:\s*40px/);
  assert.match(css, /\.cdl-chan svg\s*\{\s*width:\s*24px/);
  // 5 · o CNPJ existe num LUGAR SÓ da tela: o cartão do dossiê (na versão
  //     antiga ele aparecia no topo E no dossiê).
  assert.equal((central.match(/>CNPJ</g) || []).length, 1, "o rótulo CNPJ é escrito uma vez só");
  assert.match(css, /\.cdl-kv__val\.is-mono/);
  // 6 · Copiloto é uma LINHA com 3 chips, não um bloco.
  assert.match(css, /\.cdl-copilot\s*\{[\s\S]*?display:\s*flex/);
  for (const chip of ["Rascunhar resposta", "Resumir conversa", "Próxima ação"]) {
    assert.match(conversa, new RegExp(chip));
  }
  // 7 · robô = cartão branco com listra + LED âmbar e grade de 3 campos.
  assert.match(css, /\.cdl-card\.is-robot::before/);
  assert.match(css, /\.cdl-led/);
  assert.match(css, /\.cdl-form3\s*\{[\s\S]*?grid-template-columns:\s*1fr 1fr 1fr/);
  assert.match(central, /Teto\/dia/);
  // 8 · composer com altura reservada FIXA: trocar de modo não mexe no feed.
  //     Tem de ser `height`, não `min-height` — com min-height o modo
  //     Observação (o mais alto) empurrava o feed 69px pra cima, que é
  //     exatamente a montanha-russa que o desenho vem matar. Medido na tela
  //     depois do conserto: feed constante em 482px nos 4 modos.
  assert.match(css, /\.cdl-composer__slot\s*\{\s*\n?\s*height:\s*96px/);
  assert.doesNotMatch(css, /\.cdl-composer__slot\s*\{\s*min-height/);
  assert.match(css, /\.cdl-preview\s*\{[\s\S]*?max-height:\s*100%[\s\S]*?overflow-y:\s*auto/);
  // 9 · "Fechar venda" é o único verde-dinheiro, grande, no canto de ação.
  assert.match(css, /\.cdl-close-sale\s*\{[\s\S]*?height:\s*40px[\s\S]*?background:\s*var\(--cdl-money-grad\)/);
  assert.equal((css.match(/--cdl-money-grad\)/g) || []).length, 1, "verde-dinheiro só no Fechar venda");
});

test("as setas percorrem a lista visível sem reiniciar nos limites", () => {
  assert.match(central, /\{previousLead && onNavigate && \(/);
  assert.match(central, /\{nextLead && onNavigate && \(/);
  assert.match(central, /Lead anterior:/);
  assert.match(central, /Próximo lead:/);
  assert.match(css, /\.cdl-nav--previous/);
  assert.match(css, /\.cdl-nav--next/);

  assert.match(vendas, /const cockpitSequence = view === "list" \? listLeads : flatLeads/);
  assert.match(vendas, /const previousCockpitLead = cockpitIndex > 0 \? cockpitSequence\[cockpitIndex - 1\] : null/);
  assert.match(vendas, /cockpitIndex < cockpitSequence\.length - 1[\s\S]*?cockpitSequence\[cockpitIndex \+ 1\][\s\S]*?: null/);
  assert.match(vendas, /previousLead=\{previousCockpitLead\}/);
  assert.match(vendas, /nextLead=\{nextCockpitLead\}/);
});

test("o backend não mudou — as mesmas rotas continuam ligadas", () => {
  const juntos = central + conversa;
  for (const rota of [
    "/pre-voo",
    "/cockpit",
    "/inbox/whatsapp-session",
    "/company-email/status",
    "/assistente/copiloto",
    "/vendas/agenda-disparo/proximo-slot",
    "/vendas/agenda-disparo/config",
    "/robo",
    "/enrichment",
    "/negativar",
    "/gerar-cobranca",
    "/financeiro-tenant/charges/",
    "/financeiro-tenant/clientes/",
    "/conversation/messages",
    "/conversation/message",
    "/atividades",
    "/note",
    "/email/presentation/preview",
    "/email/presentation/send",
    "/email/opt-out",
    "/webscraping/radar/leads/",
  ]) {
    assert.ok(juntos.includes(rota), `a rota ${rota} devia continuar ligada`);
  }
  // Lei do Vendedor: quem não pode ver valor não vê Negócio nem Financeiro.
  assert.match(central, /canViewValues && \(\s*\n\s*<section className="cdl-card">\s*\n\s*<div className="cdl-card__h">\s*\n\s*Negócio/);
  assert.match(central, /\{canViewValues && \(/);
  // Guardrail do Copiloto: ele NUNCA envia — só preenche o campo.
  assert.match(conversa, /setRascunho\(res\.rascunho\)/);
  assert.doesNotMatch(conversa, /copiloto[\s\S]{0,400}enviarWhatsapp\(\)/);
});

test("VACINA: o chat do Vendas some quando o telefone não tem WhatsApp confirmado", () => {
  assert.match(central, /whatsappRecipientStatus=\{whatsappRecipientStatus\}/);
  assert.match(conversa, /whatsappRecipientStatus === "unavailable"/);
  assert.match(conversa, /Este telefone não possui WhatsApp confirmado\./);
  assert.match(conversa, /whatsappRecipientStatus !== "confirmed"/);
  assert.match(conversa, /Não foi possível confirmar o WhatsApp deste contato\./);
});
