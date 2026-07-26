import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../messaging/conversations.service';
import { AtividadesService } from '../atividades/atividades.service';
import { CompanyMailerService, COMPANY_EMAIL_NOT_CONFIGURED } from '../mail/company-mailer.service';
import { EmailOutboxService } from '../mail/email-outbox.service';
import { resolveVendasAccessContext, type VendasAccessContext } from '../team/team-access-runtime';
import {
  CADENCIA_SEEDS,
  MAX_WHATS_STEPS_PER_CADENCE,
  normalizePersona,
  sanitizePassos,
  type CadenciaPasso,
} from './cadencia-personas';
import type { AplicarCadenciaDto, CreateCadenciaDto, UpdateCadenciaDto } from './dto/cadencia.dto';
import { CommercialContactControlService } from '../vendas/commercial-contact-control.service';
import { AgendaDisparoService } from '../vendas/agenda-disparo.service';
import { automationFlag } from '../automation/automation-flags';

// ================================================================
// WORM-13 — CADENCIA (13a): CRUD das personas + aplicar a lista/filtro + runner
// diario. O runner e a UNICA coisa que auto-dispara: fica atras da flag
// HBX_AUTOMATION_RUNNER_ENABLED (S20, MOTOR-ÚNICO — fallback pra
// HBX_CADENCIA_RUNNER_ENABLED, default OFF). Enquanto OFF, o motor NAO roda em
// producao — leads sao inscritos, mas nenhum passo dispara sozinho.
//
// CANAL WHATSAPP = reusa o caminho PROVADO do bot de prospeccao:
// ConversationsService.queueOutboundForCompany(..., sourceModule
// 'vendas_prospeccao_bot', senderType 'bot', variables.botType 'prospeccao').
// Esse caminho ja carrega: disjuntor, 1 numero=1 conexao, janela/gate de conexao
// viva, e o outbox com retry. NUNCA API crua, NUNCA socket novo.
// ================================================================

const RUNNER_FLAG = 'HBX_CADENCIA_RUNNER_ENABLED';
const RUNNER_FLAG_NEW = 'HBX_AUTOMATION_RUNNER_ENABLED';

// E-mail automático da cadência atrás de flag própria (default OFF). Em produção
// o passo entra na outbox durável; o worker possui kill-switch independente.
const EMAIL_FLAG = 'HBX_CADENCIA_EMAIL_ENABLED';

// Teto DURO de passos de WhatsApp disparados por empresa/dia pelo runner de
// cadencia — defesa extra alem do warmup/teto do proprio queueOutbound. NAO
// configuravel pelo cliente (regra de chip). Conservador de proposito.
const CADENCIA_WHATS_DAILY_CAP_PER_COMPANY = Number(process.env.HBX_CADENCIA_WHATS_DAILY_CAP || '10') || 10;

// Teto de e-mails por empresa/dia disparados pelo runner. E-mail e mais barato que
// chip -> teto maior (50). Ao estourar, o passo e ADIADO 1 dia (nunca fura o teto).
const CADENCIA_EMAIL_DAILY_CAP_PER_COMPANY = Number(process.env.HBX_CADENCIA_EMAIL_DAILY_CAP || '50') || 50;

// Quantos leads o runner avanca por ciclo (evita rajada).
const RUNNER_BATCH = 50;

type CadenciaRow = {
  id: string;
  companyId: number;
  ownerId: number | null;
  nome: string;
  persona: string;
  descricao: string | null;
  passosJson: string;
  ativa: boolean;
  isSeed: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class CadenciaService {
  private readonly logger = new Logger(CadenciaService.name);
  private readonly commercialContactControl: CommercialContactControlService;
  // S5 LEAD-CENTRICO (05-agenda-slots.md) — quando o runner agenda o próximo passo
  // (sucesso) ou adia por teto físico estourado, a DECISÃO de "quando" passa a vir
  // daqui (janela/teto/intervalo da config comercial da empresa), nunca mais um
  // addDays cru. Mesmo padrão de instanciação manual do commercialContactControl.
  private readonly agendaDisparo: AgendaDisparoService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly atividades: AtividadesService,
    private readonly mailer: CompanyMailerService,
    @Optional() private readonly emailOutbox?: EmailOutboxService,
  ) {
    this.commercialContactControl = new CommercialContactControlService(this.prisma);
    this.agendaDisparo = new AgendaDisparoService(this.prisma);
  }

  private get runnerEnabled(): boolean {
    return automationFlag(RUNNER_FLAG_NEW, RUNNER_FLAG);
  }

  // Flag propria do e-mail real (default OFF). Segue o padrao do runnerEnabled.
  private get emailEnabled(): boolean {
    return String(process.env[EMAIL_FLAG] || '').trim() === '1' || String(process.env[EMAIL_FLAG] || '').trim().toLowerCase() === 'true';
  }

  private async resolveContext(user: any): Promise<VendasAccessContext> {
    return resolveVendasAccessContext(this.prisma, user);
  }

  private parsePassos(json: string | null | undefined): CadenciaPasso[] {
    try {
      return sanitizePassos(JSON.parse(json || '[]'));
    } catch {
      return [];
    }
  }

  private serialize(row: CadenciaRow, extra: { inscritos?: number } = {}) {
    const passos = this.parsePassos(row.passosJson);
    return {
      id: row.id,
      nome: row.nome,
      persona: row.persona,
      descricao: row.descricao ?? null,
      passos,
      passosCount: passos.length,
      whatsSteps: passos.filter((p) => p.canal === 'whats').length,
      ativa: row.ativa,
      isSeed: row.isSeed,
      inscritos: extra.inscritos ?? undefined,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    };
  }

  private normalizeName(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const t = value.trim();
    return t ? t.slice(0, 120) : null;
  }

  // Admin/gerente cuida de automacao da empresa; vendedor comum nao mexe.
  private assertCanManage(context: VendasAccessContext) {
    if (context.isAdmin || context.canViewCompanyCards) return;
    throw new ForbiddenException('Sem permissão para gerenciar automações.');
  }

  // Garante os 3 seeds de persona para a empresa (idempotente). Chamado no listar.
  private async ensureSeeds(companyId: number, ownerId: number | null) {
    const existing = (await (this.prisma as any).cadencia.findMany({
      where: { companyId, isSeed: true },
      select: { persona: true },
    })) as Array<{ persona: string }>;
    const have = new Set(existing.map((r) => r.persona));
    for (const seed of CADENCIA_SEEDS) {
      if (have.has(seed.key)) continue;
      await (this.prisma as any).cadencia
        .create({
          data: {
            companyId,
            ownerId,
            nome: seed.nome,
            persona: seed.key,
            descricao: seed.descricao,
            passosJson: JSON.stringify(sanitizePassos(seed.passos)),
            ativa: true,
            isSeed: true,
          },
        })
        .catch(() => null);
    }
  }

  // ---------------- LISTAR (cards de persona) ----------------
  async listForUser(user: any) {
    const context = await this.resolveContext(user);
    await this.ensureSeeds(context.companyId, context.userId).catch(() => null);

    const rows = (await (this.prisma as any).cadencia.findMany({
      where: { companyId: context.companyId },
      orderBy: [{ isSeed: 'desc' }, { createdAt: 'asc' }],
      take: 100,
    })) as CadenciaRow[];

    // Contagem de inscritos ativos por cadencia (1 query agregada).
    const counts = (await (this.prisma as any).cadenciaInscricao.groupBy({
      by: ['cadenciaId'],
      where: { companyId: context.companyId, status: 'ativa' },
      _count: { _all: true },
    })) as Array<{ cadenciaId: string; _count: { _all: number } }>;
    const countByCadencia = new Map(counts.map((c) => [c.cadenciaId, c._count._all]));

    return {
      ok: true,
      canManage: context.isAdmin || context.canViewCompanyCards,
      runnerEnabled: this.runnerEnabled,
      cadencias: rows.map((row) => this.serialize(row, { inscritos: countByCadencia.get(row.id) ?? 0 })),
    };
  }

  // ---------------- CRIAR (persona custom) ----------------
  async createForUser(user: any, dto: CreateCadenciaDto) {
    const context = await this.resolveContext(user);
    this.assertCanManage(context);
    const nome = this.normalizeName(dto?.nome);
    if (!nome) throw new BadRequestException('Nome da cadência obrigatório.');
    const persona = normalizePersona(dto?.persona);
    const passos = sanitizePassos(dto?.passos);
    if (!passos.length) throw new BadRequestException('Adicione ao menos um passo.');

    const row = (await (this.prisma as any).cadencia.create({
      data: {
        companyId: context.companyId,
        ownerId: context.userId,
        nome,
        persona,
        descricao: typeof dto?.descricao === 'string' ? dto.descricao.trim().slice(0, 400) || null : null,
        passosJson: JSON.stringify(passos),
        ativa: true,
        isSeed: false,
      },
    })) as CadenciaRow;
    return { ok: true, cadencia: this.serialize(row, { inscritos: 0 }) };
  }

  // ---------------- EDITAR ----------------
  async updateForUser(user: any, id: string, dto: UpdateCadenciaDto) {
    const context = await this.resolveContext(user);
    this.assertCanManage(context);
    const existing = (await (this.prisma as any).cadencia.findFirst({
      where: { id: String(id || '').trim(), companyId: context.companyId },
    })) as CadenciaRow | null;
    if (!existing) throw new NotFoundException('Cadência não encontrada.');
    if (existing.isSeed && (dto?.passos !== undefined || dto?.nome !== undefined)) {
      throw new BadRequestException('Cadência de persona padrão não pode ter passos/nome editados. Duplique numa cadência própria.');
    }

    const data: Record<string, any> = {};
    if (dto?.nome !== undefined) {
      const nome = this.normalizeName(dto.nome);
      if (!nome) throw new BadRequestException('Nome obrigatório.');
      data.nome = nome;
    }
    if (dto?.descricao !== undefined) data.descricao = typeof dto.descricao === 'string' ? dto.descricao.trim().slice(0, 400) || null : null;
    if (dto?.passos !== undefined) {
      const passos = sanitizePassos(dto.passos);
      if (!passos.length) throw new BadRequestException('Adicione ao menos um passo.');
      data.passosJson = JSON.stringify(passos);
    }
    if (dto?.ativa !== undefined) data.ativa = Boolean(dto.ativa);

    const row = (await (this.prisma as any).cadencia.update({ where: { id: existing.id }, data })) as CadenciaRow;
    return { ok: true, cadencia: this.serialize(row) };
  }

  // ---------------- DELETAR ----------------
  async deleteForUser(user: any, id: string) {
    const context = await this.resolveContext(user);
    this.assertCanManage(context);
    const existing = (await (this.prisma as any).cadencia.findFirst({
      where: { id: String(id || '').trim(), companyId: context.companyId },
      select: { id: true, isSeed: true },
    })) as { id: string; isSeed: boolean } | null;
    if (!existing) throw new NotFoundException('Cadência não encontrada.');
    if (existing.isSeed) throw new BadRequestException('Cadência de persona padrão não pode ser removida (desative-a).');
    await (this.prisma as any).cadenciaInscricao.deleteMany({ where: { cadenciaId: existing.id } }).catch(() => null);
    await (this.prisma as any).cadencia.delete({ where: { id: existing.id } });
    return { ok: true, deleted: true };
  }

  // ---------------- APLICAR a lista/filtro ----------------
  // Inscreve leads na cadencia. Aceita leadIds explicitos OU um savedSearchId
  // (WORM-15) cujos leads ja PRESENTES no funil viram inscritos (o runner nao
  // cria lead novo — so trabalha o que ja esta no Vendas).
  async aplicarForUser(user: any, cadenciaId: string, dto: AplicarCadenciaDto) {
    const context = await this.resolveContext(user);
    this.assertCanManage(context);
    const cadencia = (await (this.prisma as any).cadencia.findFirst({
      where: { id: String(cadenciaId || '').trim(), companyId: context.companyId },
    })) as CadenciaRow | null;
    if (!cadencia) throw new NotFoundException('Cadência não encontrada.');
    if (!cadencia.ativa) throw new BadRequestException('Ative a cadência antes de aplicá-la.');
    const passos = this.parsePassos(cadencia.passosJson);
    if (!passos.length) throw new BadRequestException('Cadência sem passos.');

    let leadIds = Array.isArray(dto?.leadIds) ? dto.leadIds.map((s) => String(s || '').trim()).filter(Boolean) : [];

    // savedSearchId -> resolve os leads do funil por cidade/segmento do filtro salvo.
    if ((!leadIds.length) && dto?.savedSearchId) {
      leadIds = await this.resolveLeadIdsFromSavedSearch(context, String(dto.savedSearchId).trim());
    }
    if (!leadIds.length) throw new BadRequestException('Nenhum lead para aplicar (informe leadIds ou um savedSearchId com resultado).');

    // Confere que os leads sao da empresa (nao inscreve lead de fora).
    const validLeads = (await this.prisma.vendasLead.findMany({
      where: { id: { in: leadIds.slice(0, 500) }, companyId: context.companyId },
      select: { id: true, assignedUserId: true },
    })) as Array<{ id: string; assignedUserId: number | null }>;

    const now = new Date();
    const firstDay = passos[0]?.dia ?? 0;
    const nextStepAt = this.addDays(now, firstDay);
    const responsavelDefault = dto?.responsavelId != null ? Number(dto.responsavelId) : null;

    let inscritos = 0;
    let jaInscritos = 0;
    let conflitosAutomacao = 0;
    for (const lead of validLeads) {
      const responsavelId = responsavelDefault ?? lead.assignedUserId ?? null;
      const slot = await this.commercialContactControl.createCadenciaInscricao({
        companyId: context.companyId,
        leadId: lead.id,
        data: {
          cadenciaId: cadencia.id,
          companyId: context.companyId,
          leadId: lead.id,
          responsavelId,
          status: 'ativa',
          currentStep: 0,
          startedAt: now,
          nextStepAt,
        },
      });
      if (slot.created) {
        inscritos += 1;
      } else if (slot.alreadyEnrolled) {
        jaInscritos += 1;
      } else {
        conflitosAutomacao += 1;
      }
    }

    return { ok: true, inscritos, jaInscritos, conflitosAutomacao, total: validLeads.length, runnerEnabled: this.runnerEnabled };
  }

  // Cancela a inscricao de um lead (ou de toda a cadencia).
  async cancelarInscricoes(user: any, cadenciaId: string, leadId?: string) {
    const context = await this.resolveContext(user);
    this.assertCanManage(context);
    const where: Record<string, any> = { cadenciaId: String(cadenciaId || '').trim(), companyId: context.companyId, status: 'ativa' };
    if (leadId) where.leadId = String(leadId).trim();
    const affected = await (this.prisma as any).cadenciaInscricao.findMany({
      where,
      select: { id: true },
      take: 500,
    });
    const res = await (this.prisma as any).cadenciaInscricao.updateMany({ where, data: { status: 'cancelada' } });
    for (const row of affected || []) {
      await this.commercialContactControl.finishAutomationEnrollment({
        companyId: context.companyId,
        legacySource: 'cadencia_inscricao',
        legacyExecutionId: String(row.id),
        status: 'canceled',
        reason: 'canceled_by_user',
      });
    }
    return { ok: true, canceladas: res?.count ?? 0 };
  }

  // Resolve leads do funil a partir de um SavedSearch (cidade/segmento). Nao roda
  // o Radar (que cria leads novos) — pega o que ja esta no Vendas batendo o filtro.
  private async resolveLeadIdsFromSavedSearch(context: VendasAccessContext, savedSearchId: string): Promise<string[]> {
    const search = (await (this.prisma as any).savedSearch.findFirst({
      where: { id: savedSearchId, companyId: context.companyId },
      select: { filtroJson: true },
    })) as { filtroJson: string } | null;
    if (!search) return [];
    let filtro: Record<string, any> = {};
    try {
      filtro = JSON.parse(search.filtroJson || '{}') || {};
    } catch {
      filtro = {};
    }
    const where: Record<string, any> = { companyId: context.companyId };
    const city = String(filtro.city || '').trim();
    const state = String(filtro.state || '').trim();
    const segment = String(filtro.segment || '').trim();
    if (city) where.city = { equals: city, mode: 'insensitive' };
    if (state) where.state = { equals: state, mode: 'insensitive' };
    if (segment) where.segment = { equals: segment, mode: 'insensitive' };
    const limit = Math.min(500, Math.max(1, Number(filtro.quantos || filtro.limit || 100) || 100));
    const rows = (await this.prisma.vendasLead.findMany({
      where,
      select: { id: true },
      take: limit,
      orderBy: { createdAt: 'desc' },
    })) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  // ================================================================
  // RUNNER DIARIO — avanca as inscricoes cujo passo do dia esta devido.
  // Chamado pelo scheduler (onModuleInit) SOMENTE se a flag estiver ON.
  // Retorna um resumo para log/observabilidade.
  // ================================================================
  async runDueSteps(nowInput?: Date) {
    if (!this.runnerEnabled) {
      return { ok: true, skipped: 'runner_disabled' as const };
    }
    const now = nowInput ?? new Date();

    const due = (await (this.prisma as any).cadenciaInscricao.findMany({
      where: { status: 'ativa', nextStepAt: { lte: now } },
      orderBy: { nextStepAt: 'asc' },
      take: RUNNER_BATCH,
    })) as Array<{
      id: string;
      cadenciaId: string;
      companyId: number;
      leadId: string;
      responsavelId: number | null;
      currentStep: number;
      nextStepAt: Date;
    }>;

    let executed = 0;
    let whatsSent = 0;
    let emailSent = 0;
    let concluded = 0;
    let failed = 0;
    const whatsSentByCompany = new Map<number, number>();
    const emailSentByCompany = new Map<number, number>();

    for (const insc of due) {
      let activeStepRunId: string | null = null;
      try {
        if (!(await this.commercialContactControl.canCadenciaRun({
          companyId: insc.companyId,
          leadId: insc.leadId,
          inscricaoId: insc.id,
        }))) {
          continue;
        }
        const cadencia = (await (this.prisma as any).cadencia.findUnique({ where: { id: insc.cadenciaId } })) as CadenciaRow | null;
        if (!cadencia || !cadencia.ativa) {
          await (this.prisma as any).cadenciaInscricao.updateMany({
            where: { id: insc.id, status: 'ativa' },
            data: { status: 'pausada' },
          });
          await this.commercialContactControl.finishAutomationEnrollment({
            companyId: insc.companyId,
            legacySource: 'cadencia_inscricao',
            legacyExecutionId: insc.id,
            status: 'paused',
            reason: 'cadence_definition_inactive',
          });
          continue;
        }
        const passos = this.parsePassos(cadencia.passosJson);
        if (insc.currentStep >= passos.length) {
          const result = await (this.prisma as any).cadenciaInscricao.updateMany({
            where: { id: insc.id, status: 'ativa' },
            data: { status: 'concluida' },
          });
          concluded += Number(result?.count || 0);
          await this.commercialContactControl.finishAutomationEnrollment({
            companyId: insc.companyId,
            legacySource: 'cadencia_inscricao',
            legacyExecutionId: insc.id,
            status: 'completed',
            reason: 'all_steps_completed',
          });
          continue;
        }
        const passo = passos[insc.currentStep];

        const alreadyToday = whatsSentByCompany.get(insc.companyId) ?? 0;
        const whatsCapReached = passo.canal === 'whats' && alreadyToday >= CADENCIA_WHATS_DAILY_CAP_PER_COMPANY;
        // Teto de e-mail so conta quando o envio real esta ligado (emailEnabled);
        // com a flag OFF o passo so grava timeline, entao nao ha o que adiar.
        const emailAlreadyToday = emailSentByCompany.get(insc.companyId) ?? 0;
        const emailCapReached = passo.canal === 'email' && this.emailEnabled && emailAlreadyToday >= CADENCIA_EMAIL_DAILY_CAP_PER_COMPANY;

        if (passo.canal === 'whats' && whatsCapReached) {
          // Teto FISICO de chip atingido (freio intocado): NAO dispara. O "quando"
          // do adiamento passa pelo servico de slots (S5) — proximo dia util NO
          // HORARIO configurado, nunca mais "amanha nesta mesma hora" cru (podia
          // cair de madrugada/fim de semana).
          await this.agendaDisparo.reservarProximoDiaUtil({
            companyId: insc.companyId,
            inscricaoId: insc.id,
            from: now,
            extraData: { lastError: 'whats_daily_cap_deferred' },
          });
          continue;
        }
        if (passo.canal === 'email' && emailCapReached) {
          // Teto de e-mail atingido: NAO envia (mesmo padrao do WhatsApp acima).
          await this.agendaDisparo.reservarProximoDiaUtil({
            companyId: insc.companyId,
            inscricaoId: insc.id,
            from: now,
            extraData: { lastError: 'email_daily_cap_deferred' },
          });
          continue;
        }

        // Claim durável por passo: duas réplicas podem ler a mesma inscrição,
        // mas somente uma muda scheduled -> claimed. Se a outbox já foi criada
        // antes de um crash, a réplica seguinte apenas avança a inscrição.
        const automationStep = await this.commercialContactControl.claimCadenciaStep({
          companyId: insc.companyId,
          leadId: insc.leadId,
          cadenciaId: insc.cadenciaId,
          inscricaoId: insc.id,
          currentStep: insc.currentStep,
          channel: passo.canal,
          scheduledAt: insc.nextStepAt,
          snapshot: { cadenciaNome: cadencia.nome, passo },
        });
        activeStepRunId = automationStep.stepRunId;
        if (automationStep.supported && !automationStep.claimed && !automationStep.alreadyExecuted) {
          continue;
        }

        if (!automationStep.alreadyExecuted) {
          if (passo.canal === 'whats') {
            const sent = await this.executeWhatsStep(insc, cadencia, passo, activeStepRunId);
            if (sent) {
              whatsSent += 1;
              whatsSentByCompany.set(insc.companyId, alreadyToday + 1);
            } else {
              await this.commercialContactControl.completeAutomationStep({
                companyId: insc.companyId,
                stepRunId: activeStepRunId,
                status: 'skipped',
                errorCode: 'whatsapp_step_not_queued',
              });
            }
          } else if (passo.canal === 'email') {
            const queued = await this.executeEmailStep(insc, cadencia, passo, activeStepRunId);
            if (queued) {
              emailSent += 1;
              emailSentByCompany.set(insc.companyId, emailAlreadyToday + 1);
            }
            if (!queued) {
              await this.commercialContactControl.completeAutomationStep({
                companyId: insc.companyId,
                stepRunId: activeStepRunId,
                status: 'skipped',
                errorCode: 'email_action_not_dispatched',
              });
            }
          } else if (passo.canal === 'atividade') {
            await this.executeAtividadeStep(insc, cadencia, passo);
            await this.commercialContactControl.completeAutomationStep({
              companyId: insc.companyId,
              stepRunId: activeStepRunId,
              status: 'succeeded',
            });
          }
        }

        // Um inbound pode ter cancelado a inscricao enquanto o passo executava.
        // Nunca reativa nem conclui por cima desse cancelamento.
        if (!(await this.commercialContactControl.canCadenciaRun({
          companyId: insc.companyId,
          leadId: insc.leadId,
          inscricaoId: insc.id,
        }))) {
          continue;
        }

        // Avanca para o proximo passo. nextStepAt = startedAt-relativo ao dia do
        // proximo passo, medido a partir de agora + (diaProx - diaAtual).
        const nextStep = insc.currentStep + 1;
        if (nextStep >= passos.length) {
          const result = await (this.prisma as any).cadenciaInscricao.updateMany({
            where: { id: insc.id, status: 'ativa' },
            data: { currentStep: nextStep, status: 'concluida', lastStepAt: now, lastError: null },
          });
          concluded += Number(result?.count || 0);
          if (Number(result?.count || 0) > 0) {
            await this.commercialContactControl.finishAutomationEnrollment({
              companyId: insc.companyId,
              legacySource: 'cadencia_inscricao',
              legacyExecutionId: insc.id,
              status: 'completed',
              reason: 'all_steps_completed',
            });
          }
        } else {
          // Dia-alvo continua vindo da PERSONA (deltaDias, intocado); o servico de
          // slots (S5) so decide a HORA dentro desse dia (ou empurra pro proximo
          // dia util se a janela/teto/intervalo da empresa não deixar) — nunca fura
          // janela/teto/intervalo (docs/PLANEJAMENTOS/PR25072026-LEAD-CENTRICO/05-agenda-slots.md).
          const deltaDias = Math.max(0, (passos[nextStep].dia ?? 0) - (passo.dia ?? 0));
          const desiredAt = this.addDays(now, deltaDias);
          const reserved = await this.agendaDisparo.reservarProximoSlot({
            companyId: insc.companyId,
            inscricaoId: insc.id,
            desiredAt,
            now,
            extraData: { currentStep: nextStep, lastStepAt: now, lastError: null },
          });
          if (reserved.updatedCount > 0) {
            await this.commercialContactControl.advanceAutomationEnrollment({
              companyId: insc.companyId,
              legacySource: 'cadencia_inscricao',
              legacyExecutionId: insc.id,
              currentStep: nextStep,
              nextStepAt: reserved.slot,
            });
          }
        }
        executed += 1;
      } catch (error: any) {
        failed += 1;
        await this.commercialContactControl.completeAutomationStep({
          companyId: insc.companyId,
          stepRunId: activeStepRunId,
          status: 'scheduled',
          errorCode: 'cadence_step_failed',
          errorMessage: String(error?.message || error),
        }).catch(() => null);
        this.logger.warn(`[cadencia-runner] falha inscricao=${insc.id}: ${String(error?.message || error)}`);
        await (this.prisma as any).cadenciaInscricao
          .updateMany({
            where: { id: insc.id, status: 'ativa' },
            data: { nextStepAt: this.addDays(now, 1), lastError: String(error?.message || error).slice(0, 200) },
          })
          .catch(() => null);
      }
    }

    return { ok: true, considered: due.length, executed, whatsSent, emailSent, concluded, failed };
  }

  // WhatsApp: reusa o caminho PROVADO do bot de prospeccao (com todos os freios).
  private async executeWhatsStep(
    insc: { id: string; companyId: number; leadId: string },
    cadencia: CadenciaRow,
    passo: CadenciaPasso,
    automationStepRunId?: string | null,
  ): Promise<boolean> {
    if (!(await this.commercialContactControl.canCadenciaRun({
      companyId: insc.companyId,
      leadId: insc.leadId,
      inscricaoId: insc.id,
    }))) {
      return false;
    }
    const lead = (await this.prisma.vendasLead.findFirst({
      where: { id: insc.leadId, companyId: insc.companyId },
      select: { id: true, phone: true, phoneNormalized: true, name: true },
    })) as { id: string; phone: string | null; phoneNormalized: string | null; name: string | null } | null;
    const contact = String(lead?.phoneNormalized || lead?.phone || '').trim();
    if (!contact) {
      // Sem telefone: passo WhatsApp vira no-op silencioso (segue a cadencia).
      this.logger.log(`[cadencia-runner] whats sem telefone lead=${insc.leadId} — passo pulado`);
      return false;
    }
    const body = String(passo.corpo || passo.titulo || '').trim();
    if (!body) return false;

    // MESMO caminho do vendas-automation (queueOutboundForCompany) — disjuntor,
    // 1 numero=1 conexao, janela/gate de conexao viva, warmup e outbox com retry.
    await this.conversations.queueOutboundForCompany(insc.companyId, {
      to: contact,
      contactId: contact,
      body,
      messageType: 'text',
      sourceModule: 'vendas_prospeccao_bot',
      senderType: 'bot',
      variables: {
        botType: 'prospeccao',
        cadenciaId: cadencia.id,
        cadenciaInscricaoId: insc.id,
        leadId: lead!.id,
        step: passo.dia,
        automationStepRunId: automationStepRunId || null,
      },
      automationStepRunId: automationStepRunId || undefined,
      flowState: { botActive: true, humanAssigned: false, flowResult: null },
    });
    return true;
  }

  // E-mail automático: enfileira pelo remetente do próprio tenant, atrás da flag
  // HBX_CADENCIA_EMAIL_ENABLED. Retorna true quando a outbox aceitou o passo.
  //  - flag OFF            -> comportamento de hoje: so grava timeline, zero envio.
  //  - lead sem e-mail     -> no-op (igual WhatsApp sem telefone): so timeline.
  //  - passo sem corpo     -> no-op: so timeline (igual WhatsApp sem body).
  //  - tenant nao config.  -> SKIP gracioso (errorCode COMPANY_EMAIL_NOT_CONFIGURED): timeline + segue.
  //  - erro de envio       -> timeline com o erro, cadencia AVANCA.
  private async executeEmailStep(
    insc: { leadId: string; companyId: number },
    cadencia: CadenciaRow,
    passo: CadenciaPasso,
    automationStepRunId?: string | null,
  ): Promise<boolean> {
    // Flag OFF: comportamento de hoje (so timeline "cadencia_email", zero envio).
    if (!this.emailEnabled) {
      await this.writeEmailTimeline(insc.leadId, cadencia, passo, passo.corpo || '');
      return false;
    }

    const lead = (await this.prisma.vendasLead.findFirst({
      where: { id: insc.leadId, companyId: insc.companyId },
      select: { id: true, email: true, name: true },
    })) as { id: string; email: string | null; name: string | null } | null;

    const to = String(lead?.email || '').trim();
    if (!to) {
      // Sem e-mail: passo vira no-op (segue a cadencia), igual WhatsApp sem telefone.
      this.logger.log(`[cadencia-runner] email sem destinatario lead=${insc.leadId} — passo pulado`);
      await this.writeEmailTimeline(insc.leadId, cadencia, passo, 'Lead sem e-mail — passo pulado.');
      return false;
    }

    const subject = String(passo.titulo || 'Contato').slice(0, 200);
    const body = String(passo.corpo || '').trim();
    if (!body) {
      // Sem corpo: nao envia (igual WhatsApp sem body), so timeline.
      await this.writeEmailTimeline(insc.leadId, cadencia, passo, 'Passo de e-mail sem corpo — não enviado.');
      return false;
    }

    if (this.emailOutbox) {
      await this.emailOutbox.enqueue({
        companyId: insc.companyId,
        leadId: insc.leadId,
        automationStepRunId: automationStepRunId || null,
        recipient: to,
        subject,
        bodyText: body,
        sourceModule: 'cadencia_email',
        purpose: 'commercial_contact',
        idempotencyKey: automationStepRunId || `cadencia:${cadencia.id}:${insc.leadId}:${passo.dia}`,
        metadata: { cadenciaId: cadencia.id, passoDia: passo.dia },
      });
      await this.writeEmailTimeline(insc.leadId, cadencia, passo, `E-mail para ${to} entrou na fila de Automação.`);
      return true;
    }

    // Compatibilidade para testes unitários que constroem o service sem o módulo.
    try {
      const result = await this.mailer.sendForCompany(insc.companyId, { to, subject, text: body });
      if (result.ok) {
        await this.writeEmailTimeline(insc.leadId, cadencia, passo, `E-mail enviado para ${to}.`);
        return true;
      }
      if (result.errorCode === COMPANY_EMAIL_NOT_CONFIGURED) {
        // Tenant sem config de e-mail: SKIP gracioso, cadencia segue.
        await this.writeEmailTimeline(insc.leadId, cadencia, passo, 'E-mail não configurado — passo pulado.');
        return false;
      }
      await this.writeEmailTimeline(
        insc.leadId,
        cadencia,
        passo,
        `Falha no envio de e-mail: ${result.errorMessage || result.errorCode || 'erro desconhecido'}`,
      );
      return false;
    } catch (error: any) {
      // Best-effort: qualquer erro inesperado nao trava a cadencia.
      this.logger.warn(`[cadencia-runner] email falhou lead=${insc.leadId}: ${String(error?.message || error)}`);
      await this.writeEmailTimeline(insc.leadId, cadencia, passo, `Falha no envio de e-mail: ${String(error?.message || error)}`);
      return false;
    }
  }

  // Registra o evento de e-mail no timeline do lead (best-effort — nunca lanca).
  // Mantem o mesmo eventType/sourceType de hoje ('cadencia_email' / 'automacao').
  private async writeEmailTimeline(leadId: string, cadencia: CadenciaRow, passo: CadenciaPasso, description: string | null) {
    await this.prisma.vendasLeadTimelineEvent
      .create({
        data: {
          leadId,
          eventType: 'cadencia_email',
          title: `Cadência (${cadencia.nome}): ${passo.titulo || 'E-mail'}`.slice(0, 200),
          description: (description || '').slice(0, 500) || null,
          sourceType: 'automacao',
        },
      })
      .catch(() => null);
  }

  // Atividade: usa o HOOK do WORM-12 (nao cria por caminho paralelo).
  private async executeAtividadeStep(
    insc: { leadId: string; companyId: number; responsavelId: number | null },
    cadencia: CadenciaRow,
    passo: CadenciaPasso,
  ) {
    await this.atividades
      .createFromAutomation({
        leadId: insc.leadId,
        companyId: insc.companyId,
        titulo: passo.titulo || `Cadência (${cadencia.nome})`,
        vencimento: new Date(),
        tipo: (passo.atividadeTipo as any) || 'ligacao',
        responsavelId: insc.responsavelId,
        origin: 'automacao',
      })
      .catch((e) => this.logger.warn(`[cadencia-runner] atividade falhou lead=${insc.leadId}: ${String(e?.message || e)}`));
  }

  private addDays(base: Date, days: number): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + Math.max(0, Math.trunc(days)));
    return d;
  }

  // Exposto para o controller de diagnostico/teste manual (nao dispara sem flag).
  get maxWhatsStepsPerCadence() {
    return MAX_WHATS_STEPS_PER_CADENCE;
  }
}
