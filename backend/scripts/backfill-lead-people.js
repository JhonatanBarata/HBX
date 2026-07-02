// WORM-16 (02/07, docs/PLANEJAMENTOS/worm/16-tela-contatos-empresas-crm.md)
//
// Backfill IDEMPOTENTE da tabela LeadPerson (contato por PESSOA: nome + cargo). Lê os blobs
// existentes do RadarLeadPool (metadataJson: people/ownerName/ownerNames + ownerPhone) e, quando
// o lead tem CNPJ, junta o QSA da Receita (CnpjPublicPartner via cnpjBasico) p/ o CARGO do sócio.
// ADITIVO — nunca apaga/sobrescreve metadataJson. Roda contra QUALQUER DATABASE_URL (local hoje,
// VPS no publish do dono).
//
// Uso:
//   node scripts/backfill-lead-people.js                 (roda contra DATABASE_URL do .env)
//   node scripts/backfill-lead-people.js --page-size 500  (tamanho de página, default 500)
//
// Idempotente por (radarLeadId, personKey). personKey = source + nome normalizado. Pode rodar de
// novo a qualquer momento (ex.: depois de mais leads enriquecidos) sem duplicar.

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Mesmo ranking do "dono" usado em radar-cnpj-l4-enrichment / import-cnpj-dataset.
const PARTNER_QUALIFICATION_RANK = {
  '49': 0, '05': 1, '65': 2, '10': 3, '16': 4, '34': 5, '28': 6, '22': 7, '23': 8, '47': 9, '74': 10,
};

function getArgValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const raw = process.argv[index + 1];
  return raw === undefined ? fallback : raw;
}

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

function normalizePersonName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function personKeyOf(source, name) {
  return `${String(source || 'unknown').trim().toLowerCase()}:${normalizePersonName(name)}`;
}

function normalizeCnpj(value) {
  return String(value || '').replace(/\D/g, '');
}

// Cache do QSA por cnpjBasico (evita re-consultar a mesma empresa em vários leads).
const partnersCache = new Map();

async function fetchPartners(cnpjBasico) {
  if (partnersCache.has(cnpjBasico)) return partnersCache.get(cnpjBasico);
  let result = [];
  try {
    const rows = await prisma.cnpjPublicPartner.findMany({
      where: { cnpjBasico },
      select: { nome: true, qualificationCode: true, qualificationDescription: true, identificador: true },
      take: 12,
    });
    const rankOf = (r) =>
      (PARTNER_QUALIFICATION_RANK[String(r.qualificationCode || '')] ?? 20) * 2
      + (String(r.identificador || '') === '2' ? 0 : 1);
    const seen = new Set();
    result = (rows || [])
      .map((r) => ({ name: String(r.nome || '').trim(), role: String(r.qualificationDescription || '').trim() || null, rank: rankOf(r) }))
      .filter((r) => r.name)
      .sort((a, b) => a.rank - b.rank)
      .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)))
      .map((r) => ({ name: r.name, role: r.role }));
  } catch {
    result = [];
  }
  partnersCache.set(cnpjBasico, result);
  return result;
}

// Extrai as pessoas candidatas de UM lead: QSA (com cargo, prioridade) + blob (people/ownerName/
// ownerNames, sem cargo). Dedup por nome normalizado. O top-rank herda o ownerPhone do blob.
async function extractPeople(lead) {
  const meta = parseMaybeJson(lead.metadataJson);
  const ownerPhoneDigits = String(meta.ownerPhone || '').replace(/\D/g, '') || null;

  const fromMetaStructured = Array.isArray(meta.people)
    ? meta.people.map((p) => ({ name: String(p && p.name || '').trim(), role: (p && p.role) || null }))
    : [];
  const fromOwnerName = meta.ownerName ? [{ name: String(meta.ownerName).trim(), role: null }] : [];
  const fromOwnerNames = Array.isArray(meta.ownerNames)
    ? meta.ownerNames.map((n) => ({ name: String(n || '').trim(), role: null }))
    : [];

  let qsaPartners = [];
  const cnpj = normalizeCnpj(meta.cnpj);
  if (cnpj.length >= 14) qsaPartners = await fetchPartners(cnpj.slice(0, 8));

  const merged = [];
  const seen = new Set();
  // QSA primeiro (tem cargo), depois blob estruturado, depois nomes soltos.
  for (const p of [...qsaPartners, ...fromMetaStructured, ...fromOwnerName, ...fromOwnerNames]) {
    const name = String(p.name || '').trim();
    const key = normalizePersonName(name);
    if (!name || key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    merged.push({ name, role: p.role || null });
  }
  return merged.map((p, i) => ({
    name: p.name,
    role: p.role,
    source: 'receita_qsa',
    phoneDigits: i === 0 ? ownerPhoneDigits : null,
    rank: i + 1,
  }));
}

async function backfillLead(lead, existingKeys) {
  const people = await extractPeople(lead);
  let inserted = 0;
  for (const person of people) {
    const key = personKeyOf(person.source, person.name);
    const dedupeKey = `${lead.id}::${key}`;
    if (existingKeys.has(dedupeKey)) continue;
    await prisma.leadPerson.create({
      data: {
        radarLeadId: lead.id,
        name: person.name,
        role: person.role,
        phoneDigits: person.phoneDigits,
        email: null,
        source: person.source,
        personKey: key,
        rank: person.rank,
      },
    });
    existingKeys.add(dedupeKey);
    inserted += 1;
  }
  return inserted;
}

async function main() {
  const pageSize = Math.max(50, Number(getArgValue('--page-size', '500')) || 500);
  console.log(`[backfill-lead-people] iniciando — pageSize=${pageSize}`);

  const existingRows = await prisma.leadPerson.findMany({ select: { radarLeadId: true, personKey: true } });
  const existingKeys = new Set(existingRows.map((r) => `${r.radarLeadId}::${r.personKey}`));
  console.log(`[backfill-lead-people] ${existingKeys.size} pessoa(s) já existente(s) (serão puladas)`);

  let cursor = null;
  let leadsProcessed = 0;
  let leadsWithPeople = 0;
  let peopleInserted = 0;
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
      try {
        const inserted = await backfillLead(lead, existingKeys);
        if (inserted > 0) { leadsWithPeople += 1; peopleInserted += inserted; }
      } catch (error) {
        errors += 1;
        console.error(`[backfill-lead-people] erro no lead ${lead.id}:`, error instanceof Error ? error.message : error);
      }
    }

    cursor = page[page.length - 1].id;
    console.log(`[backfill-lead-people] progresso: ${leadsProcessed} leads varridos, ${peopleInserted} pessoas inseridas, ${errors} erros`);
    if (page.length < pageSize) break;
  }

  console.log('[backfill-lead-people] concluído', { leadsProcessed, leadsWithNewPeople: leadsWithPeople, peopleInserted, errors });
}

main()
  .catch((error) => {
    console.error('[backfill-lead-people] falha fatal:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
