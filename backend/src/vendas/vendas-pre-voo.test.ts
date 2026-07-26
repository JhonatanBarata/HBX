import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAbertura,
  buildPersonaPreviews,
  buildProntidao,
  recommendPersona,
  resolveCanalEmail,
  resolveCanalWhatsapp,
  resolveContact,
  resolveObjetivo,
} from './vendas-pre-voo';
import { CADENCIA_SEEDS } from '../cadencia/cadencia-personas';

// ── resolveContact (regra dura do nome) ──────────────────────────────────

test('QSA da Receita (CnpjPublicPartner) vira confianca alta e nome utilizavel', () => {
  const contact = resolveContact({ qsaPartnerName: 'Maria Souza', qsaPartnerQualification: 'Sócio-Administrador' });
  assert.equal(contact.confianca, 'alta');
  assert.equal(contact.nome, 'Maria Souza');
  assert.equal(contact.fonte, 'qsa_rfb');
  assert.equal(contact.candidatoDuvidoso, null);
});

test('ownerName denormalizado da CnpjPublicCompany tambem conta como alta (mesma fonte RFB)', () => {
  const contact = resolveContact({ companyOwnerName: 'Joao Lima' });
  assert.equal(contact.confianca, 'alta');
  assert.equal(contact.nome, 'Joao Lima');
});

test('LeadPerson source=manual conta como alta (humano confirmou)', () => {
  const contact = resolveContact({ leadPersonCandidates: [{ name: 'Ana Paula', role: 'Gerente', source: 'manual' }] });
  assert.equal(contact.confianca, 'alta');
  assert.equal(contact.nome, 'Ana Paula');
});

test('LeadPerson source=crawl NUNCA vira nome utilizavel — fica so como candidato duvidoso', () => {
  const contact = resolveContact({ leadPersonCandidates: [{ name: 'Pedro X', source: 'crawl' }] });
  assert.equal(contact.confianca, 'media');
  assert.equal(contact.nome, null);
  assert.equal(contact.candidatoDuvidoso?.nome, 'Pedro X');
});

test('ownerName vindo de web scraping (radar) NUNCA vira nome utilizavel', () => {
  const contact = resolveContact({ radarOwnerName: 'Carlos Web' });
  assert.equal(contact.confianca, 'baixa');
  assert.equal(contact.nome, null);
  assert.equal(contact.candidatoDuvidoso?.fonte, 'radar_enrichment');
});

test('lead sem nenhum dado confiavel -> ausente', () => {
  const contact = resolveContact({});
  assert.equal(contact.confianca, 'ausente');
  assert.equal(contact.nome, null);
  assert.equal(contact.candidatoDuvidoso, null);
});

// ── buildAbertura (regra dura: nunca inventar nome) ──────────────────────

test('confianca alta -> abertura usa o nome', () => {
  const abertura = buildAbertura({ nome: 'Maria Souza', confianca: 'alta', empresaNome: 'Padaria Sol' });
  assert.equal(abertura, 'Olá, Maria Souza! Tudo bem? Queria falar rapidinho sobre a Padaria Sol.');
  assert.doesNotMatch(abertura, /HBX/);
});

test('sem dado confiavel -> abertura NEUTRA, nunca com nome inventado', () => {
  const abertura = buildAbertura({ nome: null, confianca: 'ausente', empresaNome: 'Padaria Sol' });
  assert.equal(abertura, 'Olá, tudo bem? Estou tentando falar com o responsável pela Padaria Sol...');
  assert.doesNotMatch(abertura, /Boa tarde Padaria Sol/i);
});

test('confianca media/baixa tambem cai pra neutra (nome so entra com ALTA)', () => {
  const abertura = buildAbertura({ nome: null, confianca: 'baixa', empresaNome: 'Padaria Sol' });
  assert.match(abertura, /responsável pela Padaria Sol/);
});

test('sem nome de empresa -> fallback generico, nunca undefined/empty', () => {
  const abertura = buildAbertura({ nome: null, confianca: 'ausente', empresaNome: null });
  assert.match(abertura, /a empresa/);
});

// ── canais ────────────────────────────────────────────────────────────────

test('whatsapp confirmed -> confirmado', () => {
  assert.equal(resolveCanalWhatsapp('confirmed', '11999998888').status, 'confirmado');
});
test('whatsapp unverified com telefone -> duvidoso', () => {
  assert.equal(resolveCanalWhatsapp('unverified', '11999998888').status, 'duvidoso');
});
test('whatsapp missing -> faltante', () => {
  assert.equal(resolveCanalWhatsapp('missing', null).status, 'faltante');
});
test('email confirmed -> confirmado', () => {
  assert.equal(resolveCanalEmail('confirmed', 'a@b.com').status, 'confirmado');
});
test('email probable -> duvidoso', () => {
  assert.equal(resolveCanalEmail('probable', 'a@b.com').status, 'duvidoso');
});
test('email missing -> faltante', () => {
  assert.equal(resolveCanalEmail('missing', null).status, 'faltante');
});

// ── buildProntidao ────────────────────────────────────────────────────────

test('dono via QSA + whatsapp confirmado -> pronto, com confirmados preenchidos', () => {
  const contatoAlta = resolveContact({ qsaPartnerName: 'Maria Souza' });
  const p = buildProntidao({
    empresaEncontrada: true,
    whatsapp: resolveCanalWhatsapp('confirmed', '11999998888'),
    email: resolveCanalEmail('missing', null),
    contato: contatoAlta,
  });
  assert.equal(p.veredito, 'pronto');
  assert.ok(p.confirmados.some((s) => s.includes('WhatsApp confirmado')));
  assert.ok(p.confirmados.some((s) => s.includes('Maria Souza')));
  assert.ok(p.faltantes.some((s) => s.toLowerCase().includes('e-mail')));
});

test('lead sem nenhum canal confirmado -> falta_dados, com faltantes listados (nome ausente incluso)', () => {
  const contatoAusente = resolveContact({});
  const p = buildProntidao({
    empresaEncontrada: false,
    whatsapp: resolveCanalWhatsapp('missing', null),
    email: resolveCanalEmail('missing', null),
    contato: contatoAusente,
  });
  assert.equal(p.veredito, 'falta_dados');
  assert.ok(p.faltantes.length >= 3);
  assert.ok(p.faltantes.some((s) => s.toLowerCase().includes('whatsapp')));
  assert.ok(p.faltantes.some((s) => s.toLowerCase().includes('e-mail')));
  assert.ok(p.faltantes.some((s) => s.toLowerCase().includes('responsável')));
});

test('email confirmado sozinho (sem whatsapp) tambem basta pra pronto', () => {
  const contatoAusente = resolveContact({});
  const p = buildProntidao({
    empresaEncontrada: true,
    whatsapp: resolveCanalWhatsapp('missing', null),
    email: resolveCanalEmail('confirmed', 'a@b.com'),
    contato: contatoAusente,
  });
  assert.equal(p.veredito, 'pronto');
});

// ── recommendPersona (heuristica, sem IA) ────────────────────────────────

test('score 0/1 -> conservador', () => {
  assert.equal(recommendPersona({ whatsappConfirmado: false, emailConfirmado: false, nomeAlta: false }).personaKey, 'conservador');
  assert.equal(recommendPersona({ whatsappConfirmado: true, emailConfirmado: false, nomeAlta: false }).personaKey, 'conservador');
});

test('zap confirmado + dono conhecido (score 2) -> moderado/Estrategico, exemplo literal do briefing', () => {
  const r = recommendPersona({ whatsappConfirmado: true, emailConfirmado: false, nomeAlta: true });
  assert.equal(r.personaKey, 'moderado');
  assert.equal(r.source, 'heuristica');
});

test('todos os 3 canais fortes -> agressivo', () => {
  assert.equal(recommendPersona({ whatsappConfirmado: true, emailConfirmado: true, nomeAlta: true }).personaKey, 'agressivo');
});

// ── resolveObjetivo ───────────────────────────────────────────────────────

test('mapeia status conhecidos e cai em Primeiro contato por default', () => {
  assert.equal(resolveObjetivo('novo'), 'Primeiro contato');
  assert.equal(resolveObjetivo('contato'), 'Reengajar');
  assert.equal(resolveObjetivo('retorno'), 'Retomar contato agendado');
  assert.equal(resolveObjetivo('qualificado'), 'Avançar negociação');
  assert.equal(resolveObjetivo('lixo'), 'Primeiro contato');
});

// ── buildPersonaPreviews (revisao das mensagens reais) ───────────────────

test('so o passo Abertura (dia 0, whats) e trocado pela abertura resolvida; os demais ficam verbatim da seed', () => {
  const abertura = 'Olá, tudo bem? Estou tentando falar com o responsável pela Padaria Sol...';
  const previews = buildPersonaPreviews(CADENCIA_SEEDS, abertura, 'moderado');
  assert.equal(previews.length, 3);

  for (const persona of previews) {
    const seed = CADENCIA_SEEDS.find((s) => s.key === persona.key)!;
    const aberturaStep = persona.passos.find((p) => p.canal === 'whats' && p.dia === 0);
    assert.equal(aberturaStep?.corpo, abertura);

    const outrosSeed = seed.passos.filter((p) => !(p.canal === 'whats' && p.dia === 0));
    const outrosPreview = persona.passos.filter((p) => !(p.canal === 'whats' && p.dia === 0));
    assert.deepEqual(outrosPreview.map((p) => p.corpo), outrosSeed.map((p) => p.corpo || null));
  }

  assert.equal(previews.find((p) => p.key === 'moderado')?.recomendado, true);
  assert.equal(previews.find((p) => p.key === 'conservador')?.recomendado, false);
});
