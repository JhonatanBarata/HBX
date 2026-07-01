// PR1 (30/06, docs/PLANEJAMENTOS/PR30062026/arvore-final-owner-enriquecimento.md)
//
// Backfill IDEMPOTENTE: lê RadarLeadPool.metadataJson (fonte de verdade do card, não tocada) e
// popula a tabela normalizada LeadContact (emails/phones/whatsapp/instagram/facebook) p/ BUSCA EM
// LOTE eficiente (ex.: "50 emails não reivindicados"). Aditivo — nunca apaga/sobrescreve
// metadataJson. Roda contra QUALQUER DATABASE_URL (local hoje, VPS no publish do dono).
//
// Uso:
//   node scripts/backfill-lead-contacts.js                 (roda contra DATABASE_URL do .env)
//   node scripts/backfill-lead-contacts.js --page-size 500  (tamanho de página, default 500)
//
// Idempotente: para cada (radarLeadId, kind, valueNormalized) já existente, pula — pode rodar de
// novo a qualquer momento (ex.: depois que mais leads forem enriquecidos) sem duplicar linhas.

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function getArgValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const raw = process.argv[index + 1];
  return raw === undefined ? fallback : raw;
}

// Mesmo padrão de parseMaybeJson usado em radar-cnpj-l4-enrichment.service.ts: metadataJson pode
// vir como string, objeto já parseado, null ou lixo inválido — nunca deixa o backfill explodir.
function parseMaybeJson(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeEmail(raw) {
  const m = String(raw || '').trim().toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return m ? m[0] : null;
}

function normalizePhoneDigits(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11 ? digits : null;
}

function normalizeSocialUrl(raw) {
  const s = String(raw || '').trim();
  return s ? s.toLowerCase() : null;
}

// Extrai a lista de contatos candidatos do metadataJson de UM lead, já no formato
// { kind, value, valueNormalized, rank, source } pronto pro upsert.
function extractContactsFromMeta(meta) {
  const out = [];
  if (!meta || typeof meta !== 'object') return out;

  const emails = Array.isArray(meta.emails) ? meta.emails : [];
  let emailRank = 0;
  for (const raw of emails) {
    const normalized = normalizeEmail(raw);
    if (!normalized) continue;
    emailRank += 1;
    out.push({ kind: 'email', value: String(raw).trim(), valueNormalized: normalized, rank: emailRank });
  }

  const phones = Array.isArray(meta.phones) ? meta.phones : [];
  let phoneRank = 0;
  const phonesWhatsapp = meta.phonesWhatsapp && typeof meta.phonesWhatsapp === 'object' ? meta.phonesWhatsapp : {};
  for (const raw of phones) {
    const normalized = normalizePhoneDigits(raw);
    if (!normalized) continue;
    phoneRank += 1;
    out.push({ kind: 'phone', value: String(raw).trim(), valueNormalized: normalized, rank: phoneRank });
    // Telefone confirmado com WhatsApp pelo motor (regra do dono) vira linha própria 'whatsapp'.
    if (phonesWhatsapp[normalized] === true) {
      out.push({ kind: 'whatsapp', value: String(raw).trim(), valueNormalized: normalized, rank: 1 });
    }
  }

  const ownerPhone = normalizePhoneDigits(meta.ownerPhone);
  if (ownerPhone) {
    out.push({ kind: 'phone', value: String(meta.ownerPhone).trim(), valueNormalized: ownerPhone, rank: phoneRank + 1 });
  }

  const ownerInstagram = normalizeSocialUrl(meta.ownerInstagram);
  if (ownerInstagram) {
    out.push({ kind: 'instagram', value: String(meta.ownerInstagram).trim(), valueNormalized: ownerInstagram, rank: 1 });
  }

  const ownerFacebook = normalizeSocialUrl(meta.ownerFacebook);
  if (ownerFacebook) {
    out.push({ kind: 'facebook', value: String(meta.ownerFacebook).trim(), valueNormalized: ownerFacebook, rank: 1 });
  }

  return out;
}

async function backfillLead(lead, existingKeys) {
  const meta = parseMaybeJson(lead.metadataJson);
  const candidates = extractContactsFromMeta(meta);
  let inserted = 0;

  for (const candidate of candidates) {
    const dedupeKey = `${lead.id}::${candidate.kind}::${candidate.valueNormalized}`;
    if (existingKeys.has(dedupeKey)) continue; // já existe — idempotente, pula

    await prisma.leadContact.create({
      data: {
        radarLeadId: lead.id,
        kind: candidate.kind,
        value: candidate.value,
        valueNormalized: candidate.valueNormalized,
        rank: candidate.rank,
        source: 'metadataJson_backfill',
        confidence: 0,
      },
    });
    existingKeys.add(dedupeKey);
    inserted += 1;
  }

  return inserted;
}

async function main() {
  const pageSize = Math.max(50, Number(getArgValue('--page-size', '500')) || 500);

  console.log(`[backfill-lead-contacts] iniciando — pageSize=${pageSize}`);

  // Carrega as chaves já existentes em LeadContact 1x (radarLeadId+kind+valueNormalized) pra
  // dedupe O(1) durante a varredura, sem 1 SELECT por contato candidato.
  const existingRows = await prisma.leadContact.findMany({
    select: { radarLeadId: true, kind: true, valueNormalized: true },
  });
  const existingKeys = new Set(
    existingRows.map((row) => `${row.radarLeadId}::${row.kind}::${row.valueNormalized}`),
  );
  console.log(`[backfill-lead-contacts] ${existingKeys.size} contato(s) já existente(s) em LeadContact (serão pulados)`);

  let cursor = null;
  let leadsProcessed = 0;
  let leadsWithMeta = 0;
  let contactsInserted = 0;
  let errors = 0;

  for (;;) {
    const page = await prisma.radarLeadPool.findMany({
      take: pageSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, metadataJson: true },
    });

    if (!page.length) break;

    for (const lead of page) {
      leadsProcessed += 1;
      if (!lead.metadataJson) continue;
      try {
        const inserted = await backfillLead(lead, existingKeys);
        if (inserted > 0) {
          leadsWithMeta += 1;
          contactsInserted += inserted;
        }
      } catch (error) {
        errors += 1;
        console.error(`[backfill-lead-contacts] erro no lead ${lead.id}:`, error instanceof Error ? error.message : error);
      }
    }

    cursor = page[page.length - 1].id;
    console.log(`[backfill-lead-contacts] progresso: ${leadsProcessed} leads varridos, ${contactsInserted} contatos inseridos, ${errors} erros`);

    if (page.length < pageSize) break;
  }

  console.log('[backfill-lead-contacts] concluído', {
    leadsProcessed,
    leadsWithNewContacts: leadsWithMeta,
    contactsInserted,
    errors,
  });
}

main()
  .catch((error) => {
    console.error('[backfill-lead-contacts] falha fatal:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
