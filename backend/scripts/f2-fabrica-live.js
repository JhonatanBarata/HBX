/* eslint-disable no-console */
// Validação AO VIVO da fábrica de enriquecimento (F2). Roda o SERVIÇO REAL contra o Postgres local
// (jhonatan_dev) + Ollama local (30B). NÃO é mock: RFB real → L4 real → extração IA real → LeadContact
// real. Prova de R$0: HBX_ROLE=local ⇒ paidAttempts fica 0 e a trava recusa qualquer fonte paga.
//
// Uso: node scripts/f2-fabrica-live.js [budget]
process.env.HBX_ROLE = process.env.HBX_ROLE || 'local';
process.env.HBX_AI_EXTRACTION_ENABLED = process.env.HBX_AI_EXTRACTION_ENABLED || 'true';
process.env.HBX_MISSION_QUEUE_ENABLED = process.env.HBX_MISSION_QUEUE_ENABLED || 'true';
// DB local exposto no host; Ollama no host.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://admin:admin123@localhost:5432/jhonatan_dev';
process.env.HBX_LLM_CLASSIFIER_URL = process.env.HBX_LLM_CLASSIFIER_URL || 'http://127.0.0.1:11434';

const { PrismaService } = require('../dist/prisma/prisma.service');
const { RadarMissionQueueService } = require('../dist/webscraping/radar/missions/radar-mission-queue.service');
const { LeadContactWriteService } = require('../dist/webscraping/radar/persistence/lead-contact-write.service');
const { RadarFabricaService } = require('../dist/webscraping/radar/fabrica/radar-fabrica.service');
const { isLocalRole, currentRole } = require('../dist/webscraping/source-budget/role-guard');

async function main() {
  const budget = Number(process.argv[2]) || 5;
  const prisma = new PrismaService();
  await prisma.$connect();

  const queue = new RadarMissionQueueService(prisma);
  const write = new LeadContactWriteService();
  const fabrica = new RadarFabricaService(prisma, queue, write);

  console.log(`\n=== F2 LIVE — role=${currentRole()} paidLocked=${isLocalRole()} budget=${budget} ===`);

  // Habilita o cursor da fábrica (PARAR TUDO global desligado) — a fábrica RESPEITA esse switch.
  await prisma.radarFactoryCursor.upsert({
    where: { key: 'main' }, create: { key: 'main', enabled: true }, update: { enabled: true },
  });

  const baseCount = await prisma.cnpjPublicCompany.count();
  console.log(`RFB local disponível (CnpjPublicCompany): ${baseCount}`);

  // Leituras ANTES
  const leadsBefore = await prisma.radarLeadPool.count();
  const contactsBefore = await prisma.leadContact.count();

  // ── 1) START budget=N → drena ────────────────────────────────────────────────────────────────
  const started = await fabrica.start({ budget });
  console.log('start:', JSON.stringify(started.started ? { started: true } : started));

  // aguarda o drain (self-paced) — o 30B leva alguns segundos por lead
  await waitUntil(async () => {
    const s = await fabrica.status();
    process.stdout.write(`\r  processed=${s.processed}/${s.budget} materialized=${s.materialized} contacts=${s.contactsWritten} paid=${s.paidAttempts} running=${s.running}   `);
    return !s.running;
  }, 300_000);
  console.log('');

  const afterRun = await fabrica.status();
  console.log('\n--- status pós-run ---');
  console.log(JSON.stringify({
    processed: afterRun.processed, budget: afterRun.budget, materialized: afterRun.materialized,
    contactsWritten: afterRun.contactsWritten, paidAttempts: afterRun.paidAttempts,
    paidLocked: afterRun.paidLocked, role: afterRun.role, remaining: afterRun.remaining,
    lastLeadId: afterRun.lastLeadId, lastError: afterRun.lastError,
  }, null, 2));

  const leadsAfter = await prisma.radarLeadPool.count();
  const contactsAfter = await prisma.leadContact.count();
  console.log(`\nRadarLeadPool: ${leadsBefore} → ${leadsAfter} (+${leadsAfter - leadsBefore})`);
  console.log(`LeadContact:   ${contactsBefore} → ${contactsAfter} (+${contactsAfter - contactsBefore})`);

  // amostra dos leads enriquecidos nesta corrida (source=cnpj_public via fábrica)
  const sample = await prisma.radarLeadPool.findMany({
    where: { sourceEngine: 'fabrica_enriquecimento' }, orderBy: { createdAt: 'desc' }, take: budget,
    select: { id: true, name: true, city: true, phoneDigits: true, metadataJson: true },
  });
  console.log('\n--- amostra de leads da fábrica ---');
  for (const lead of sample) {
    const contacts = await prisma.leadContact.findMany({ where: { radarLeadId: lead.id }, select: { kind: true, value: true, source: true, confidence: true } });
    console.log(`  ${lead.id} | ${lead.name} | ${lead.city || '-'} | contatos: ${contacts.map((c) => `${c.kind}:${c.value}(${c.source}/${c.confidence})`).join(', ') || '(nenhum público)'}`);
  }

  // missões enrich_lead
  const missionsByStatus = await prisma.radarMission.groupBy({ by: ['status'], where: { stage: 'enrich_lead' }, _count: { _all: true } }).catch(() => []);
  console.log('\nmissões enrich_lead por status:', JSON.stringify(missionsByStatus.map((m) => ({ status: m.status, count: m._count._all }))));

  // ── PROVA DE R$0 ─────────────────────────────────────────────────────────────────────────────
  console.log('\n=== PROVA DE R$0 ===');
  console.log(`paidAttempts nesta corrida: ${afterRun.paidAttempts} (esperado 0)`);
  console.log(`trava ativa (paidLocked): ${afterRun.paidLocked} (esperado true)`);
  const { SourceBudgetService } = require('../dist/webscraping/source-budget/source-budget.service');
  console.log(`tryConsumePaid('brave'): ${await SourceBudgetService.tryConsumePaid('brave')} (esperado false — trava)`);

  await prisma.$disconnect();
  console.log('\n=== FIM ===');
}

async function waitUntil(fn, timeoutMs) {
  const start = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - start > timeoutMs) { console.log('\n[timeout aguardando drain]'); return; }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
