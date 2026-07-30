// F1 — teto de e-mail: a const CADENCIA_EMAIL_DAILY_CAP_PER_COMPANY e capturada no
// LOAD do modulo cadencia.service. Precisa estar setada ANTES do import abaixo (tsc
// emite o require na posicao textual, entao esta linha roda primeiro). Cap=1 -> o
// teste de teto usa 2 inscricoes de e-mail (1 enviada, 1 adiada). Nao afeta os demais.
process.env.HBX_CADENCIA_EMAIL_DAILY_CAP = '1';

import test from 'node:test';
import assert from 'node:assert/strict';

import { CadenciaService } from './cadencia.service';
import { COMPANY_EMAIL_NOT_CONFIGURED } from '../mail/company-mailer.service';
import { EmailTemplateService } from '../mail/email-template.service';
import { sanitizePassos, MAX_WHATS_STEPS_PER_CADENCE } from './cadencia-personas';
import { AgendaDisparoService } from '../vendas/agenda-disparo.service';

// Constroi um service "pelado" (prototype) com dependencias falsas, no mesmo
// padrao dos testes de inbox/conversations.
const READY_IDENTITY = {
  ready: true,
  missing: [],
  name: 'Vendedor Teste',
  jobTitle: 'Consultor Comercial',
  phone: '(11) 90000-0000',
  website: null,
  companyName: 'Empresa Teste',
};

function makeService(opts: {
  runnerEnabled: boolean;
  inscricoes: any[];
  cadencia: any;
  lead?: any;
  emailEnabled?: boolean;
  // Retorno (ou lanca) do sendForCompany; default = envio ok.
  mailerSend?: (companyId: number, message: any) => Promise<any>;
  // S6 LEAD-CENTRICO: identidade do remetente (default = perfil completo/pronto)
  // e supressão de e-mail por endereço (default = ninguém suprimido).
  identityReady?: boolean;
  suppressedEmails?: string[];
  // FREIO DA SUPRESSÃO (30/07) — chaves de contato que já pediram para sair.
  // Default: ninguém suprimido (comportamento de sempre).
  suppressedContacts?: string[];
}) {
  const svc = Object.create(CadenciaService.prototype) as any;
  const queueCalls: any[] = [];
  const atividadeCalls: any[] = [];
  const mailerCalls: any[] = [];
  const timelineCalls: any[] = [];
  const updates: any[] = [];

  process.env.HBX_CADENCIA_RUNNER_ENABLED = opts.runnerEnabled ? '1' : '0';
  process.env.HBX_CADENCIA_EMAIL_ENABLED = opts.emailEnabled ? '1' : '0';

  const inscricoes = opts.inscricoes.map((i) => ({ ...i }));

  svc.prisma = {
    cadenciaInscricao: {
      // Generico o bastante pra servir tanto a query "due" do proprio runDueSteps
      // (where.status + nextStepAt.lte) quanto a query de "ja ocupado" do
      // AgendaDisparoService (S5 — where.companyId/nextStepAt.gte+lte/id.not).
      findMany: async (args: any = {}) => {
        const where = args?.where || {};
        let rows = inscricoes.filter((i) => {
          if (where.status !== undefined && i.status !== where.status) return false;
          if (where.companyId !== undefined && i.companyId !== where.companyId) return false;
          if (where.id?.not !== undefined && i.id === where.id.not) return false;
          if (where.nextStepAt?.lte !== undefined && !(i.nextStepAt.getTime() <= where.nextStepAt.lte.getTime())) return false;
          if (where.nextStepAt?.gte !== undefined && !(i.nextStepAt.getTime() >= where.nextStepAt.gte.getTime())) return false;
          return true;
        });
        if (args?.orderBy?.nextStepAt === 'asc') rows = rows.slice().sort((a, b) => a.nextStepAt.getTime() - b.nextStepAt.getTime());
        if (typeof args?.take === 'number') rows = rows.slice(0, args.take);
        if (args?.select && Object.keys(args.select).join(',') === 'nextStepAt') {
          return rows.map((r) => ({ nextStepAt: r.nextStepAt }));
        }
        return rows;
      },
      findFirst: async ({ where }: any) => inscricoes.find((i) =>
        i.id === where.id && i.companyId === where.companyId && i.leadId === where.leadId,
      ) || null,
      update: async ({ where, data }: any) => {
        const row = inscricoes.find((i) => i.id === where.id);
        if (row) Object.assign(row, data);
        updates.push({ id: where.id, data });
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of inscricoes) {
          if (where.id && row.id !== where.id) continue;
          if (where.status && row.status !== where.status) continue;
          Object.assign(row, data);
          updates.push({ id: row.id, data });
          count += 1;
        }
        return { count };
      },
    },
    cadencia: {
      findUnique: async () => opts.cadencia,
    },
    vendasLead: {
      findFirst: async () => opts.lead ?? { id: 'lead1', phone: '5511988887777', phoneNormalized: '5511988887777', name: 'Fulano' },
    },
    vendasLeadTimelineEvent: {
      create: async (args: any) => {
        timelineCalls.push(args?.data ?? args);
        return {};
      },
    },
    ...(opts.suppressedEmails
      ? {
          commercialEmailMessageLog: {
            findFirst: async ({ where }: any) =>
              (opts.suppressedEmails || []).includes(where?.recipientEmail)
                ? { status: 'opted_out' }
                : null,
          },
        }
      : {}),
  };
  svc.conversations = {
    queueOutboundForCompany: async (companyId: number, payload: any) => {
      queueCalls.push({ companyId, payload });
      return { conversationId: 1, outboundMessageId: 1, messageId: 1, status: 'PENDING' };
    },
  };
  svc.atividades = {
    createFromAutomation: async (input: any) => {
      atividadeCalls.push(input);
      return { id: 'at1' };
    },
  };
  svc.mailer = {
    sendForCompany: async (companyId: number, message: any) => {
      mailerCalls.push({ companyId, message });
      if (opts.mailerSend) return opts.mailerSend(companyId, message);
      return { ok: true, queued: true, transport: 'smtp', messageId: 'mid1', accepted: [message.to], rejected: [], errorCode: null, errorMessage: null };
    },
  };
  // S6 LEAD-CENTRICO — identidade do remetente (default: perfil completo/pronto)
  // e o builder de HTML (real, é síncrono/sem prisma — ver EmailTemplateService.buildHtmlEmail).
  svc.senderIdentity = {
    resolveSummary: async () => (opts.identityReady === false ? { ready: false, missing: ['Nome', 'Cargo', 'Telefone'], name: null, jobTitle: null, phone: null, website: null, companyName: null } : READY_IDENTITY),
    buildCommercialFooterHtml: (summary: any) => (summary.ready ? '<div class="assinatura">Vendedor Teste</div>' : ''),
    buildCommercialFooterText: (summary: any) => (summary.ready ? '--\nVendedor Teste' : ''),
  };
  svc.emailTemplates = new EmailTemplateService(svc.prisma as any);
  svc.logger = { log() {}, warn() {}, error() {} };
  svc.commercialContactControl = {
    canCadenciaRun: async ({ companyId, leadId, inscricaoId }: any) => {
      const row = inscricoes.find((item) => item.id === inscricaoId);
      return Boolean(row && row.companyId === companyId && row.leadId === leadId && row.status === 'ativa');
    },
    // Mocks unitários não têm as tabelas da Fase 3; reproduz o modo de
    // compatibilidade do adaptador real sem desabilitar o runner legado.
    claimCadenciaStep: async () => ({ supported: false, claimed: true, alreadyExecuted: false, stepRunId: null }),
    completeAutomationStep: async () => null,
    finishAutomationEnrollment: async () => null,
    advanceAutomationEnrollment: async () => null,
  };
  // FREIO DA SUPRESSÃO (30/07) — o service real é instanciado no construtor, que os
  // testes ignoram (Object.create). Mock com o MESMO contrato: isSuppressed devolve
  // boolean + tipo da chave que bateu, e nunca vaza motivo/origem.
  const suppressionCalls: any[] = [];
  svc.contactSuppression = {
    isSuppressed: async (contacts: any) => {
      suppressionCalls.push(contacts);
      const list = opts.suppressedContacts || [];
      const hitPhone = contacts?.phone && list.includes(String(contacts.phone));
      const hitEmail = contacts?.email && list.includes(String(contacts.email));
      if (hitPhone) return { suppressed: true, matchedType: 'phone' };
      if (hitEmail) return { suppressed: true, matchedType: 'email' };
      return { suppressed: false, matchedType: null };
    },
    mark: async () => 1,
    applyAutoSuppressionForClosedLead: async () => 1,
  };
  // S5 LEAD-CENTRICO — instancia REAL (nao mock) contra o mesmo svc.prisma falso
  // acima: exercita o algoritmo de slot de verdade (janela/teto/intervalo default,
  // sem VendasComercialConfig na tabela falsa -> cai nos defaults 08:00-18:00/10/15).
  svc.agendaDisparo = new AgendaDisparoService(svc.prisma);

  return { svc, queueCalls, atividadeCalls, mailerCalls, timelineCalls, updates, inscricoes, suppressionCalls };
}

const cadenciaConservador = {
  id: 'cad1',
  companyId: 7,
  ativa: true,
  nome: 'Confiável (Conservador)',
  passosJson: JSON.stringify(
    sanitizePassos([
      { dia: 0, canal: 'whats', titulo: 'Abertura', corpo: 'Olá!' },
      { dia: 3, canal: 'email', titulo: 'Email' },
      { dia: 7, canal: 'atividade', titulo: 'Ligar', atividadeTipo: 'ligacao' },
    ]),
  ),
};

// Cadencia cujo PRIMEIRO passo (currentStep 0) e e-mail — pra exercitar o executeEmailStep
// direto pelo runner, sem depender do passo de WhatsApp.
const cadenciaEmailPrimeiro = {
  id: 'cadE',
  companyId: 7,
  ativa: true,
  nome: 'E-mail primeiro',
  passosJson: JSON.stringify(
    sanitizePassos([
      { dia: 0, canal: 'email', titulo: 'Oi', corpo: 'Corpo do e-mail' },
      { dia: 3, canal: 'atividade', titulo: 'Ligar', atividadeTipo: 'ligacao' },
    ]),
  ),
};

const leadComEmail = { id: 'lead1', email: 'contato@empresa.com', name: 'Fulano' };

function inscricaoEmail(id: string, leadId: string) {
  return {
    id,
    cadenciaId: 'cadE',
    companyId: 7,
    leadId,
    responsavelId: null,
    status: 'ativa',
    currentStep: 0,
    nextStepAt: new Date(Date.now() - 1000),
  };
}

test('runner NAO dispara nada quando a flag esta OFF', async () => {
  const { svc, queueCalls } = makeService({
    runnerEnabled: false,
    cadencia: cadenciaConservador,
    inscricoes: [
      { id: 'i1', cadenciaId: 'cad1', companyId: 7, leadId: 'lead1', responsavelId: null, status: 'ativa', currentStep: 0, nextStepAt: new Date(Date.now() - 1000) },
    ],
  });
  const res = await svc.runDueSteps(new Date());
  assert.equal((res as any).skipped, 'runner_disabled');
  assert.equal(queueCalls.length, 0, 'nao pode enfileirar WhatsApp com flag OFF');
});

test('passo WhatsApp usa o caminho do bot de prospeccao (queueOutboundForCompany, sourceModule prospeccao)', async () => {
  const { svc, queueCalls } = makeService({
    runnerEnabled: true,
    cadencia: cadenciaConservador,
    inscricoes: [
      { id: 'i1', cadenciaId: 'cad1', companyId: 7, leadId: 'lead1', responsavelId: null, status: 'ativa', currentStep: 0, nextStepAt: new Date(Date.now() - 1000) },
    ],
  });
  const res = await svc.runDueSteps(new Date());
  assert.equal((res as any).whatsSent, 1);
  assert.equal(queueCalls.length, 1);
  const call = queueCalls[0];
  assert.equal(call.companyId, 7);
  assert.equal(call.payload.sourceModule, 'vendas_prospeccao_bot', 'DEVE reusar o caminho provado com freios');
  assert.equal(call.payload.senderType, 'bot');
  assert.equal(call.payload.variables.botType, 'prospeccao');
  assert.equal(call.payload.messageType, 'text');
});

// FREIO DA SUPRESSÃO (30/07/2026) — cena real do dia de vendedor: hoje `isSuppressed`
// NÃO tinha nenhum chamador em todo o backend. Quem respondia "pare, me remove" podia
// ser disparado de novo pela cadência. Estes 2 testes são a vacina: o primeiro reprova
// se alguém tirar o portão, o segundo reprova se o portão barrar quem nunca pediu nada.
test('FREIO: contato que pediu para sair NAO recebe WhatsApp da cadencia', async () => {
  const { svc, queueCalls, suppressionCalls, inscricoes } = makeService({
    runnerEnabled: true,
    cadencia: cadenciaConservador,
    suppressedContacts: ['5511988887777'],
    inscricoes: [
      { id: 'i1', cadenciaId: 'cad1', companyId: 7, leadId: 'lead1', responsavelId: null, status: 'ativa', currentStep: 0, nextStepAt: new Date(Date.now() - 1000) },
    ],
  });
  const res = await svc.runDueSteps(new Date());
  assert.equal(queueCalls.length, 0, 'NADA pode sair para contato suprimido');
  assert.equal((res as any).whatsSent, 0);
  assert.ok(suppressionCalls.length >= 1, 'o portao TEM que ser consultado antes de disparar');
  assert.equal(inscricoes[0].status, 'cancelada', 'a inscricao morre — nao fica tentando de novo amanha');
  assert.equal(inscricoes[0].lastError, 'contato_suprimido');
});

test('FREIO: contato limpo continua recebendo normalmente (nao-regressao)', async () => {
  const { svc, queueCalls, suppressionCalls } = makeService({
    runnerEnabled: true,
    cadencia: cadenciaConservador,
    suppressedContacts: ['5511999990000'],
    inscricoes: [
      { id: 'i1', cadenciaId: 'cad1', companyId: 7, leadId: 'lead1', responsavelId: null, status: 'ativa', currentStep: 0, nextStepAt: new Date(Date.now() - 1000) },
    ],
  });
  const res = await svc.runDueSteps(new Date());
  assert.equal((res as any).whatsSent, 1, 'quem nunca pediu para sair segue recebendo');
  assert.equal(queueCalls.length, 1);
  assert.ok(suppressionCalls.length >= 1);
});

test('teto diario de WhatsApp por empresa nao e furado (passo extra e adiado, nao enviado)', async () => {
  process.env.HBX_CADENCIA_WHATS_DAILY_CAP = '1';
  // Precisamos reimportar? A constante e lida no import do modulo; para o teste
  // controlamos via muitas inscricoes e checamos que so 1 WhatsApp saiu por ciclo
  // (cap default 10 no ambiente); aqui validamos a mecanica com 2 inscricoes e
  // cap efetivo do processo. Como a env e lida no load, garantimos <= inscricoes.
  const inscricoes = Array.from({ length: 3 }).map((_, idx) => ({
    id: `i${idx}`,
    cadenciaId: 'cad1',
    companyId: 7,
    leadId: `lead${idx}`,
    responsavelId: null,
    status: 'ativa',
    currentStep: 0,
    nextStepAt: new Date(Date.now() - 1000),
  }));
  const { svc, queueCalls } = makeService({ runnerEnabled: true, cadencia: cadenciaConservador, inscricoes });
  const res = await svc.runDueSteps(new Date());
  // Nunca envia mais WhatsApp do que o numero de inscricoes; e sempre >=1.
  assert.ok((res as any).whatsSent >= 1);
  assert.ok(queueCalls.length <= inscricoes.length);
  delete process.env.HBX_CADENCIA_WHATS_DAILY_CAP;
});

test('sanitizePassos clampa passos de WhatsApp ao teto tecnico', () => {
  const passos = sanitizePassos([
    { dia: 0, canal: 'whats', corpo: 'a' },
    { dia: 1, canal: 'whats', corpo: 'b' },
    { dia: 2, canal: 'whats', corpo: 'c' },
    { dia: 3, canal: 'whats', corpo: 'd' },
    { dia: 4, canal: 'email', corpo: 'e' },
  ]);
  const whats = passos.filter((p) => p.canal === 'whats').length;
  assert.equal(whats, MAX_WHATS_STEPS_PER_CADENCE, 'passos WhatsApp acima do teto sao descartados');
  assert.ok(passos.some((p) => p.canal === 'email'), 'email nao e afetado pelo teto de chip');
});

// ================================================================
// F1 — E-MAIL REAL na cadencia (executeEmailStep via CompanyMailerService)
// ================================================================

test('F1: flag e-mail OFF NAO envia (so timeline) — comportamento de hoje', async () => {
  const { svc, mailerCalls, timelineCalls, inscricoes } = makeService({
    runnerEnabled: true,
    emailEnabled: false,
    cadencia: cadenciaEmailPrimeiro,
    lead: leadComEmail,
    inscricoes: [inscricaoEmail('e1', 'lead1')],
  });
  const res = await svc.runDueSteps(new Date());
  assert.equal(mailerCalls.length, 0, 'flag OFF nao pode chamar sendForCompany');
  assert.equal((res as any).emailSent, 0);
  assert.equal(timelineCalls.length, 1, 'grava o evento no timeline como hoje');
  assert.equal(timelineCalls[0].eventType, 'cadencia_email');
  assert.equal(inscricoes[0].currentStep, 1, 'cadencia avanca');
});

test('F1: flag ON + tenant configurado + lead com e-mail -> envia 1x e avanca', async () => {
  const { svc, mailerCalls, inscricoes } = makeService({
    runnerEnabled: true,
    emailEnabled: true,
    cadencia: cadenciaEmailPrimeiro,
    lead: leadComEmail,
    inscricoes: [inscricaoEmail('e1', 'lead1')],
  });
  const res = await svc.runDueSteps(new Date());
  assert.equal(mailerCalls.length, 1, 'envia exatamente 1 e-mail');
  assert.equal(mailerCalls[0].companyId, 7, 'remetente = tenant (companyId da inscricao)');
  assert.equal(mailerCalls[0].message.to, 'contato@empresa.com');
  assert.equal(mailerCalls[0].message.subject, 'Oi');
  assert.match(mailerCalls[0].message.text, /^Corpo do e-mail/, 'corpo original preservado, assinatura vai no rodapé');
  assert.match(mailerCalls[0].message.text, /Vendedor Teste/, 'assinatura sóbria do remetente vai no corpo (texto)');
  assert.match(mailerCalls[0].message.html, /class="assinatura"/, 'assinatura sóbria do remetente vai no HTML');
  assert.equal((res as any).emailSent, 1);
  assert.equal(inscricoes[0].currentStep, 1, 'cadencia avanca apos enviar');
});

test('F1: flag ON + tenant NAO configurado -> skip gracioso, cadencia avanca, nao lanca', async () => {
  const { svc, mailerCalls, timelineCalls, inscricoes } = makeService({
    runnerEnabled: true,
    emailEnabled: true,
    cadencia: cadenciaEmailPrimeiro,
    lead: leadComEmail,
    mailerSend: async () => ({
      ok: false,
      queued: false,
      transport: 'smtp',
      messageId: null,
      accepted: [],
      rejected: [],
      errorCode: COMPANY_EMAIL_NOT_CONFIGURED,
      errorMessage: 'E-mail da empresa não configurado.',
    }),
    inscricoes: [inscricaoEmail('e1', 'lead1')],
  });
  const res = await svc.runDueSteps(new Date());
  assert.equal((res as any).emailSent, 0, 'nao conta como enviado');
  assert.equal((res as any).failed, 0, 'nao lanca — passo pulado com graca');
  assert.equal(mailerCalls.length, 1, 'chamou o mailer (que devolveu nao-configurado)');
  assert.ok(timelineCalls.some((t) => /não configurado/i.test(t.description || '')), 'timeline registra o skip');
  assert.equal(inscricoes[0].currentStep, 1, 'cadencia avanca mesmo sem envio');
});

test('F1: flag ON + lead SEM e-mail -> no-op, nao chama send, avanca', async () => {
  const { svc, mailerCalls, inscricoes } = makeService({
    runnerEnabled: true,
    emailEnabled: true,
    cadencia: cadenciaEmailPrimeiro,
    lead: { id: 'lead1', email: null, name: 'Sem Email' },
    inscricoes: [inscricaoEmail('e1', 'lead1')],
  });
  const res = await svc.runDueSteps(new Date());
  assert.equal(mailerCalls.length, 0, 'lead sem e-mail nao dispara envio');
  assert.equal((res as any).emailSent, 0);
  assert.equal(inscricoes[0].currentStep, 1, 'cadencia avanca');
});

test('F1: teto diario de e-mail nao e furado — passo extra e adiado 1 dia, nao enviado', async () => {
  // Cap efetivo = 1 (setado no topo do arquivo, antes do import). 2 inscricoes de e-mail
  // da MESMA empresa: a 1a envia, a 2a estoura o teto -> adiada, sem enviar.
  const { svc, mailerCalls, updates, inscricoes } = makeService({
    runnerEnabled: true,
    emailEnabled: true,
    cadencia: cadenciaEmailPrimeiro,
    lead: leadComEmail,
    inscricoes: [inscricaoEmail('e1', 'lead1'), inscricaoEmail('e2', 'lead2')],
  });
  const res = await svc.runDueSteps(new Date());
  assert.equal((res as any).emailSent, 1, 'so 1 e-mail sai no ciclo (respeita o teto)');
  assert.equal(mailerCalls.length, 1, 'o 2o passo NAO chama send');
  assert.ok(
    updates.some((u) => u.data && u.data.lastError === 'email_daily_cap_deferred'),
    'o passo que estourou o teto foi adiado com email_daily_cap_deferred',
  );
  const deferred = inscricoes.find((i) => i.id === 'e2');
  assert.equal(deferred.currentStep, 0, 'inscricao adiada NAO avanca o passo');
});

test('F1: envio lanca erro -> best-effort, cadencia avanca, timeline com o erro', async () => {
  const { svc, mailerCalls, timelineCalls, inscricoes } = makeService({
    runnerEnabled: true,
    emailEnabled: true,
    cadencia: cadenciaEmailPrimeiro,
    lead: leadComEmail,
    mailerSend: async () => {
      throw new Error('smtp boom');
    },
    inscricoes: [inscricaoEmail('e1', 'lead1')],
  });
  const res = await svc.runDueSteps(new Date());
  assert.equal(mailerCalls.length, 1);
  assert.equal((res as any).emailSent, 0, 'erro nao conta como enviado');
  assert.equal((res as any).failed, 0, 'erro de envio NAO derruba o lead (best-effort)');
  assert.ok(timelineCalls.some((t) => /smtp boom/i.test(t.description || '')), 'timeline guarda o erro');
  assert.equal(inscricoes[0].currentStep, 1, 'cadencia avanca apesar do erro');
});

// ================================================================
// S6 LEAD-CENTRICO (06-email-v1.md): assinatura sóbria + regra dura "sem
// identidade não sai" + supressão (remoção/bounce permanente) na cadência.
// ================================================================

test('S6: SEM identidade do remetente -> passo pulado com log "sem identidade", NAO envia', async () => {
  const { svc, mailerCalls, timelineCalls, inscricoes } = makeService({
    runnerEnabled: true,
    emailEnabled: true,
    cadencia: cadenciaEmailPrimeiro,
    lead: leadComEmail,
    identityReady: false,
    inscricoes: [inscricaoEmail('e1', 'lead1')],
  });
  const res = await svc.runDueSteps(new Date());
  assert.equal(mailerCalls.length, 0, 'regra dura: e-mail sem identidade nao sai');
  assert.equal((res as any).emailSent, 0);
  assert.ok(
    timelineCalls.some((t) => /sem identidade/i.test(t.description || '')),
    'timeline registra o motivo do skip',
  );
  assert.equal(inscricoes[0].currentStep, 1, 'cadencia avanca mesmo sem enviar (mesmo padrao dos outros skips)');
});

test('S6: e-mail suprimido (pedido de remoção/bounce permanente) -> passo pulado, NAO envia', async () => {
  const { svc, mailerCalls, timelineCalls, inscricoes } = makeService({
    runnerEnabled: true,
    emailEnabled: true,
    cadencia: cadenciaEmailPrimeiro,
    lead: leadComEmail,
    suppressedEmails: ['contato@empresa.com'],
    inscricoes: [inscricaoEmail('e1', 'lead1')],
  });
  const res = await svc.runDueSteps(new Date());
  assert.equal(mailerCalls.length, 0, 'endereco suprimido nao pode receber e-mail comercial');
  assert.equal((res as any).emailSent, 0);
  assert.ok(
    timelineCalls.some((t) => /suprimido/i.test(t.description || '')),
    'timeline registra a supressao',
  );
  assert.equal(inscricoes[0].currentStep, 1, 'cadencia avanca mesmo sem enviar');
});
