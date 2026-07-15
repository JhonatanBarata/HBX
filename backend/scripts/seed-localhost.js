// Script EFEMERO — prepara um localhost limpo de testes de frontend.
// Roda DENTRO do container `backend` (bind-mount /app == host backend/):
//   docker exec backend node scripts/seed-localhost.js
//
// O que faz:
//  1) Apaga TODAS as companies exceto a platform_infra (WhatsApp do Master, id fixo
//     detectado por companyKind) e qualquer empresa vinculada ao usuario MASTER do
//     sistema (isSystemMaster) — replica a mesma fronteira do
//     permanentlyDeleteCompanyInternal (companies.service.ts): purga as tabelas
//     escalares SEM FK (SCALAR_TENANT_PRISMA_MODELS/RAW_TABLES) e deixa o resto pro
//     cascade declarativo (migration 20260703_tenant_cascade_delete).
//  2) Cria a empresa "Teste" + usuario admin teste/teste123 usando o FLUXO REAL
//     (POST /auth/signup do proprio backend rodando em localhost:3000) — no ambiente
//     local (NODE_ENV=development + PAYMENTS_PROVIDER=mock) o signup já autoconfirma
//     o e-mail e, com HBX_CREDITS_ENABLED=true, ativa a empresa como status=courtesy
//     isActive=true automaticamente (auth.service.ts::activateConfirmedTrialTx).
//  3) Injeta 10 VendasLead (funil) + 5 RadarLeadPool (reivindicados pela Teste).
//  4) Marca o WhatsApp da Teste como CONECTADO (fake, trilho QR/temporario) + 1
//     WhatsAppConnectionSession ativa + 3 CompanyConversation com mensagens.
//
// Idempotente o suficiente para re-rodar (limpa companies antes de recriar).

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ── Mesmas listas de companies.service.ts (SCALAR_TENANT_PRISMA_MODELS / RAW) ──
const SCALAR_TENANT_PRISMA_MODELS = [
  'assistenteConfig',
  'atendimentoQuickReply',
  'atendimentoCustomer',
  'atividade',
  'cadenciaInscricao',
  'cadenciaGatilho',
  'cadenciaRotina',
  'cadencia',
  'commercialEmailMessageLog',
  'fiscalInvoice',
  'gmailConnection',
  'harvestImportBatch',
  'inboxTrashMeticulousPurgeJob',
  'masterPaymentNotificationLog',
  'radarLeadEnrichment',
  'recoveryOpportunity',
  'savedSearch',
  'whatsAppWebhookEvent',
];
const SCALAR_TENANT_RAW_TABLES = ['HbxJobApplication', 'HbxRecoveryPaymentEvent'];

async function purgeScalarTenantTables(tx, id) {
  for (const model of SCALAR_TENANT_PRISMA_MODELS) {
    try {
      await tx[model].deleteMany({ where: { companyId: id } });
    } catch (error) {
      console.warn(`  [purge-scalar] model=${model} company=${id} falhou: ${error?.message || error}`);
    }
  }
  for (const table of SCALAR_TENANT_RAW_TABLES) {
    try {
      await tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "companyId" = $1`, id);
    } catch (error) {
      console.warn(`  [purge-scalar-raw] table=${table} company=${id} falhou: ${error?.message || error}`);
    }
  }
}

async function deleteCompanyCascade(id) {
  await prisma.$transaction(
    async (tx) => {
      await purgeScalarTenantTables(tx, id);
      await tx.company.delete({ where: { id } });
    },
    { timeout: 30000 },
  );
}

function randomBRPhone(seed) {
  // DDD 47 (SC) + celular (9 + 8 dígitos) = 11 dígitos totais — formato exigido pelo
  // gate de qualidade do Radar (radar-quality-gate.service.ts: digits.length===11 &&
  // digits[2]==='9'). Um telefone de 9 dígitos (bug da v1 deste script) reprovava no
  // gate e o lead nunca aparecia em GET /webscraping/radar/leads.
  const suffix = String(10000000 + seed).padStart(8, '0');
  return `479${suffix}`;
}

function pick(arr, i) {
  return arr[i % arr.length];
}

async function step1_deleteOldCompanies() {
  console.log('\n=== STEP 1: apagar companies-tenant ===');
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      companyKind: true,
      users: { select: { id: true, isSystemMaster: true } },
    },
    orderBy: { id: 'asc' },
  });

  const deleted = [];
  const kept = [];
  for (const c of companies) {
    const isMasterCompany = c.users.some((u) => u.isSystemMaster);
    const isPlatformInfra = c.companyKind === 'platform_infra';
    if (isMasterCompany || isPlatformInfra) {
      kept.push({ id: c.id, name: c.name, reason: isMasterCompany ? 'master-linked' : 'platform_infra' });
      continue;
    }
    try {
      await deleteCompanyCascade(c.id);
      deleted.push({ id: c.id, name: c.name });
      console.log(`  OK deletada company=${c.id} "${c.name}"`);
    } catch (error) {
      console.error(`  FALHOU deletar company=${c.id} "${c.name}": ${error?.message || error}`);
      throw error;
    }
  }

  console.log(`\nDeletadas: ${deleted.length}. Mantidas: ${JSON.stringify(kept)}`);
  return { deleted, kept };
}

async function step2_createTesteCompany() {
  console.log('\n=== STEP 2: signup real da empresa "Teste" ===');

  const email = 'teste@teste.com';
  const username = 'teste';

  // Limpa qualquer resquício do próprio username/email de rodadas anteriores.
  const existingUser = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
  if (existingUser?.companyId) {
    console.log(`  Usuário/empresa 'teste' já existe (user=${existingUser.id} company=${existingUser.companyId}) — apagando antes de recriar.`);
    await deleteCompanyCascade(existingUser.companyId);
  } else if (existingUser) {
    await prisma.user.delete({ where: { id: existingUser.id } });
  }

  const body = {
    entityType: 'PJ',
    companyName: 'Teste',
    name: 'Teste Admin',
    username,
    email,
    password: 'teste123',
    trialContactPhone: '47999990000',
    acceptedTerms: true,
  };

  const resp = await fetch('http://localhost:3000/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  console.log(`  POST /auth/signup -> HTTP ${resp.status}`);
  console.log('  resposta:', JSON.stringify(json, null, 2));

  if (resp.status >= 400) {
    throw new Error(`signup falhou: HTTP ${resp.status} — ${JSON.stringify(json)}`);
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.companyId) {
    throw new Error('signup aparentemente OK mas usuário "teste" não foi encontrado no banco.');
  }

  const companyId = user.companyId;

  // Ajustes finais: nome/slug amigáveis + garantir tutorial destravado.
  await prisma.company.update({
    where: { id: companyId },
    data: { name: 'Teste', slug: 'teste' },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { tutorialCompletedAt: new Date(), mustChangePassword: false, isActive: true },
  });

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  console.log(`  Company Teste id=${companyId} status=${company.status} isActive=${company.isActive}`);

  // O signup sem selectedPlanKey caiu no plano default (hbx_lite), que só liga
  // vendas+webscraping (syncPlanModulesTx). Sem o módulo 'atendimento' habilitado,
  // GET /inbox/conversations e /inbox/whatsapp-session devolvem 403
  // MODULE_ACCESS_DENIED — as telas de Atendimento/Conversas ficariam vazias mesmo
  // com dados no banco. Libera aqui TODOS os módulos operacionais padrão (os
  // defaultEnabled=true do SystemModule), pra um localhost de teste não esbarrar
  // em parede de acesso em nenhuma tela.
  const systemModules = await prisma.systemModule.findMany({ where: { defaultEnabled: true } });
  for (const mod of systemModules) {
    await prisma.companyModule.upsert({
      where: { companyId_moduleId: { companyId, moduleId: mod.id } },
      create: { companyId, moduleId: mod.id, enabled: true },
      update: { enabled: true },
    });
  }
  console.log(`  Módulos habilitados: ${systemModules.map((m) => m.key).join(', ')}`);

  return { companyId, userId: user.id, company };
}

async function step3_seedLeads(companyId) {
  console.log('\n=== STEP 3: seed de leads (VendasLead + RadarLeadPool) ===');

  const nomes = [
    'Padaria Sao Jose', 'Auto Peças Silva', 'Mercadinho Boa Vista', 'Clinica OdontoVida',
    'Studio Beleza Bella', 'Distribuidora Aço Forte', 'Restaurante Sabor Caseiro',
    'Pet Shop Amigo Fiel', 'Loja Moda Urbana', 'Farmácia Vida Plena',
    'Oficina Mecânica Rápida', 'Salão Charme Total', 'Mercearia Bom Preço',
    'Academia Corpo Ativo', 'Papelaria Escolar Plus',
  ];
  const cidades = [
    ['Balneário Camboriú', 'SC'], ['Itajaí', 'SC'], ['Blumenau', 'SC'],
    ['Florianópolis', 'SC'], ['Joinville', 'SC'],
  ];
  const segmentos = ['alimentacao', 'saude', 'beleza', 'varejo', 'servicos', 'automotivo'];
  const statusFunil = ['novo', 'contato', 'retorno', 'qualificado', 'encerrado'];
  const temperaturas = ['frio', 'morno', 'quente'];

  // ── 10 VendasLead ──
  const vendasLeadsData = [];
  for (let i = 0; i < 10; i++) {
    const [city, state] = pick(cidades, i);
    const phone = randomBRPhone(100 + i);
    vendasLeadsData.push({
      companyId,
      name: pick(nomes, i),
      phone,
      phoneNormalized: phone,
      city,
      state,
      segment: pick(segmentos, i),
      status: pick(statusFunil, i),
      leadTemperature: pick(temperaturas, i),
      opportunityScore: 40 + ((i * 7) % 60),
      sourceType: 'manual',
      primarySource: 'seed_localhost',
      createdAt: new Date(Date.now() - i * 3 * 24 * 60 * 60 * 1000),
    });
  }

  await prisma.vendasLead.deleteMany({ where: { companyId, primarySource: 'seed_localhost' } });
  await prisma.vendasLead.createMany({ data: vendasLeadsData });
  console.log(`  VendasLead criados: ${vendasLeadsData.length}`);

  // ── 5 RadarLeadPool reivindicados pela Teste ──
  const radarLeadsData = [];
  for (let i = 0; i < 5; i++) {
    const [city, state] = pick(cidades, i + 2);
    const segment = pick(segmentos, i + 3);
    const phoneDigits = randomBRPhone(200 + i);
    radarLeadsData.push({
      companyId,
      ownerCompanyId: companyId,
      claimedAt: new Date(),
      name: pick(nomes, i + 5),
      phone: phoneDigits,
      phoneDigits,
      city,
      state,
      normalizedCity: city.toLowerCase(),
      segment,
      normalizedSegment: segment,
      opportunityScore: 50 + ((i * 9) % 45),
      websiteStatus: pick(['none', 'weak', 'present', 'unreachable'], i),
      status: 'clean',
      source: 'seed_localhost',
    });
  }

  // RadarLeadPool.company é onDelete:SetNull (não Cascade) — ao apagar a empresa
  // anterior (STEP 1) estas linhas viram órfãs (ownerCompanyId=null), não somem.
  // Limpa GLOBALMENTE por source (tag exclusiva deste script), não só por company.
  await prisma.radarLeadPool.deleteMany({ where: { source: 'seed_localhost' } });
  await prisma.radarLeadPool.createMany({ data: radarLeadsData });
  console.log(`  RadarLeadPool criados: ${radarLeadsData.length}`);

  return { vendasCount: vendasLeadsData.length, radarCount: radarLeadsData.length };
}

async function step4_fakeWhatsapp(companyId) {
  console.log('\n=== STEP 4: WhatsApp FAKE conectado + conversas ===');

  const tenantKey = `company-${companyId}`;
  const displayNumber = '+55 47 99999-0000';
  const phoneNormalized = '5547999990000';
  const now = new Date();

  // Sessão de conexão ativa (trilho QR/temporário — normalizeMode mapeia
  // TEMPORARY/QR -> 'QR' em whatsapp-center.util.ts, que é o que a Central de
  // WhatsApp lê para mostrar "Conectado").
  await prisma.whatsAppConnectionSession.deleteMany({ where: { companyId, tenantKey } });
  const session = await prisma.whatsAppConnectionSession.create({
    data: {
      companyId,
      provider: 'webwhats',
      tenantKey,
      phoneNormalized,
      displayPhone: displayNumber,
      status: 'active',
      connectedAt: now,
      lastReconciledAt: now,
      motorState: 'open',
      metadataJson: JSON.stringify({ fake: true, seededBy: 'seed-localhost.js' }),
    },
  });

  await prisma.company.update({
    where: { id: companyId },
    data: {
      whatsappConnectionMode: 'TEMPORARY',
      whatsappTemporaryStatus: 'TEMPORARY',
      whatsappTemporaryProvider: 'webwhats',
      whatsappTemporaryInstanceKey: tenantKey,
      whatsappTemporaryDisplayNumber: displayNumber,
      whatsappTemporaryConnectedAt: now,
      whatsappTemporaryLastSyncAt: now,
      whatsappTemporaryStatusError: null,
      whatsappDisplayNumber: displayNumber,
      whatsappNumber: displayNumber,
      whatsappStatus: 'CONNECTED',
      whatsappStatusUpdatedAt: now,
      whatsappAttendanceMode: 'shared',
      currentWhatsappConnectionSessionId: session.id,
    },
  });

  console.log(`  WhatsAppConnectionSession id=${session.id} status=active motorState=open`);
  console.log('  Company atualizada: whatsappConnectionMode=TEMPORARY whatsappTemporaryStatus=TEMPORARY whatsappStatus=CONNECTED');

  // ── 3 conversas com 2-4 mensagens cada (CompanyConversation @@map "Conversation",
  // CompanyMessage @@map "Message") ──
  const contatos = [
    { contact: '5547988880001', nome: 'Mariana Souza' },
    { contact: '5547988880002', nome: 'Carlos Eduardo' },
    { contact: '5547988880003', nome: 'Fernanda Lima' },
  ];

  await prisma.companyMessage.deleteMany({ where: { companyId, conversation: { sourceTenantKey: tenantKey } } });
  await prisma.companyConversation.deleteMany({ where: { companyId, sourceTenantKey: tenantKey } });

  let totalMessages = 0;
  for (let i = 0; i < contatos.length; i++) {
    const { contact, nome } = contatos[i];
    const lastMessageAt = new Date(now.getTime() - i * 60 * 60 * 1000);
    const conversation = await prisma.companyConversation.create({
      data: {
        companyId,
        whatsappConnectionSessionId: session.id,
        sourcePhoneNormalized: phoneNormalized,
        sourceTenantKey: tenantKey,
        channel: 'whatsapp',
        contact,
        currentFlow: 'atendimento',
        currentStep: 'novo',
        botActive: false,
        humanAssigned: i !== 2,
        metadata: JSON.stringify({
          whatsappRemoteJid: `${contact}@s.whatsapp.net`,
          whatsappDisplayName: nome,
          whatsappIsGroup: false,
          fake: true,
        }),
        lastInteractionAt: lastMessageAt,
        lastMessageAt,
      },
    });

    const msgs = [
      { direction: 'INBOUND', senderType: 'client', body: `Olá, vi vocês no Google e queria saber mais.`, status: 'RECEIVED' },
      { direction: 'OUTBOUND', senderType: 'human', body: `Olá ${nome.split(' ')[0]}! Tudo bem? Como posso te ajudar hoje?`, status: 'SENT' },
      { direction: 'INBOUND', senderType: 'client', body: `Gostaria de saber o valor e prazo de entrega.`, status: 'RECEIVED' },
      { direction: 'OUTBOUND', senderType: 'human', body: `Claro! Te enviei os detalhes por aqui, qualquer dúvida é só chamar.`, status: 'SENT' },
    ];

    for (let m = 0; m < msgs.length; m++) {
      const msg = msgs[m];
      await prisma.companyMessage.create({
        data: {
          companyId,
          conversationId: conversation.id,
          whatsappConnectionSessionId: session.id,
          sourcePhoneNormalized: phoneNormalized,
          sourceTenantKey: tenantKey,
          contactId: contact,
          direction: msg.direction,
          messageType: 'text',
          body: msg.body,
          senderType: msg.senderType,
          status: msg.status,
          timestamp: new Date(lastMessageAt.getTime() - (msgs.length - m) * 5 * 60 * 1000),
        },
      });
      totalMessages++;
    }
    console.log(`  Conversa #${conversation.id} (${nome}, ${contact}) com ${msgs.length} mensagens`);
  }

  return { conversations: contatos.length, messages: totalMessages };
}

// STEP 5: garante a carteira de crédito da empresa courtesy (modelo grátis).
// A empresa "Teste" nasce status=courtesy no signup self-service (HBX_CREDITS_ENABLED=true) e o
// próprio signup concede o lote de boas-vindas (welcome:<companyId>, 50 créditos). Se por algum
// motivo o saldo vier 0 (ambiente sem a chavinha no momento do signup), garante 50 aqui —
// idempotente por usageKey própria (não colide com o lote real de boas-vindas).
async function step5_ensureCredits(companyId) {
  console.log('\n=== STEP 5: carteira de crédito (modelo grátis, 50 créditos) ===');
  const wallet = await prisma.creditWallet.upsert({
    where: { companyId },
    create: { companyId },
    update: {},
  });
  const now = Date.now();
  const openLots = await prisma.creditLedgerEntry.findMany({
    where: { walletId: wallet.id, kind: { in: ['grant', 'recharge', 'promo'] }, remaining: { gt: 0 } },
  });
  const balance = openLots
    .filter((l) => !l.expiresAt || new Date(l.expiresAt).getTime() > now)
    .reduce((s, l) => s + l.remaining, 0);
  if (balance > 0) {
    console.log(`  Carteira já tem saldo=${balance} crédito(s) (lote de boas-vindas do signup) — ok.`);
    return { balance };
  }
  const usageKey = `seed-welcome:${companyId}`;
  const existing = await prisma.creditLedgerEntry.findFirst({ where: { usageKey } });
  if (!existing) {
    await prisma.creditLedgerEntry.create({
      data: {
        walletId: wallet.id,
        companyId,
        kind: 'promo',
        grantType: 'promo',
        amount: 50,
        remaining: 50,
        expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000),
        usageKey,
        sourceRef: 'seed_localhost_welcome',
      },
    });
    console.log('  Carteira semeada: 50 créditos (lote promo, validade 30d).');
  } else {
    console.log('  Lote seed-welcome já existia — nada a fazer.');
  }
  return { balance: 50 };
}

async function main() {
  const { deleted, kept } = await step1_deleteOldCompanies();
  const { companyId } = await step2_createTesteCompany();
  const leadsResult = await step3_seedLeads(companyId);
  const waResult = await step4_fakeWhatsapp(companyId);
  const creditsResult = await step5_ensureCredits(companyId);

  console.log('\n=== RESUMO ===');
  console.log(`Empresas apagadas: ${deleted.length}`);
  console.log(`Empresas mantidas: ${JSON.stringify(kept)}`);
  console.log(`Company Teste: id=${companyId}`);
  console.log(`VendasLead: ${leadsResult.vendasCount} | RadarLeadPool: ${leadsResult.radarCount}`);
  console.log(`Conversas: ${waResult.conversations} | Mensagens: ${waResult.messages}`);
  console.log(`Créditos na carteira: ${creditsResult.balance}`);
  console.log('\nLogin: username=teste senha=teste123');
}

main()
  .catch((err) => {
    console.error('\nERRO FATAL:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
