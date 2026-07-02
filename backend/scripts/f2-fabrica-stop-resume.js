/* eslint-disable no-console */
// Valida STOP no meio → congela, e START retoma SEM duplicar (F2 aceite). Real DB + real serviço.
process.env.HBX_ROLE = 'local';
process.env.HBX_AI_EXTRACTION_ENABLED = process.env.HBX_AI_EXTRACTION_ENABLED || 'false'; // sem IA aqui (foco no stop/resume)
process.env.HBX_MISSION_QUEUE_ENABLED = 'true';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://admin:admin123@localhost:5432/jhonatan_dev';
process.env.HBX_LLM_CLASSIFIER_URL = process.env.HBX_LLM_CLASSIFIER_URL || 'http://127.0.0.1:11434';

const { PrismaService } = require('../dist/prisma/prisma.service');
const { RadarMissionQueueService } = require('../dist/webscraping/radar/missions/radar-mission-queue.service');
const { LeadContactWriteService } = require('../dist/webscraping/radar/persistence/lead-contact-write.service');
const { RadarFabricaService } = require('../dist/webscraping/radar/fabrica/radar-fabrica.service');

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const fabrica = new RadarFabricaService(prisma, new RadarMissionQueueService(prisma), new LeadContactWriteService());
  await prisma.radarFactoryCursor.upsert({ where: { key: 'main' }, create: { key: 'main', enabled: true }, update: { enabled: true } });

  console.log('\n=== STOP/RESUME — budget grande (20), stop cedo, resume ===');
  const started = await fabrica.start({ budget: 20 });
  console.log('start:', started.started);

  // deixa processar alguns e MANDA PARAR no meio
  await sleepUntil(async () => (await fabrica.status()).processed >= 3, 30_000);
  const stopRes = await fabrica.stop();
  console.log('stop pedido em processed>=3:', stopRes.stopped);
  // espera congelar (running=false)
  await sleepUntil(async () => !(await fabrica.status()).running, 15_000);
  const afterStop = await fabrica.status();
  console.log(`CONGELADO: processed=${afterStop.processed} materialized=${afterStop.materialized} running=${afterStop.running} stopRequested=${afterStop.stopRequested}`);

  const leadsAfterStop = await prisma.radarLeadPool.count({ where: { sourceEngine: 'fabrica_enriquecimento' } });
  const contactsAfterStop = await prisma.leadContact.count();

  // RESUME — novo start do MESMO budget que falta (ou o total). Não pode duplicar leads/contatos.
  console.log('\n--- RESUME ---');
  const resume = await fabrica.start({ budget: 20 });
  console.log('resume start:', resume.started);
  await sleepUntil(async () => !(await fabrica.status()).running, 60_000);
  const afterResume = await fabrica.status();
  console.log(`pós-resume: processed=${afterResume.processed} materialized=${afterResume.materialized} running=${afterResume.running}`);

  // PROVA de não-duplicação: placeId cnpj_public:<cnpj> é único → contagem de distinct = total
  const totalFabrica = await prisma.radarLeadPool.count({ where: { sourceEngine: 'fabrica_enriquecimento' } });
  const distinctPlace = await prisma.$queryRawUnsafe(`SELECT count(DISTINCT "placeId")::int AS n FROM "RadarLeadPool" WHERE "sourceEngine"='fabrica_enriquecimento'`);
  const dupContacts = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM (SELECT "radarLeadId","kind","valueNormalized",count(*) c FROM "LeadContact" GROUP BY 1,2,3 HAVING count(*)>1) t`);
  console.log('\n=== NÃO-DUPLICAÇÃO ===');
  console.log(`leads fábrica total=${totalFabrica} distinct placeId=${distinctPlace[0].n} (iguais = sem duplicata)`);
  console.log(`LeadContact duplicados (mesmo lead+kind+valor)=${dupContacts[0].n} (esperado 0)`);
  console.log(`leads após stop=${leadsAfterStop} → após resume=${totalFabrica} (cresceu sem recriar os já feitos)`);
  console.log(`contacts após stop=${contactsAfterStop} → agora=${await prisma.leadContact.count()}`);

  await prisma.$disconnect();
  console.log('\n=== FIM ===');
}

async function sleepUntil(fn, timeoutMs) {
  const start = Date.now();
  for (;;) { if (await fn()) return; if (Date.now() - start > timeoutMs) return; await new Promise((r) => setTimeout(r, 500)); }
}
main().catch((e) => { console.error(e); process.exit(1); });
