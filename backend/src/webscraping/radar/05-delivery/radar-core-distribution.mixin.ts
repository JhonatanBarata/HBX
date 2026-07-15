// @ts-nocheck
import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  isGlobalBlockStatus,
  normalizeLookupValue,
  normalizePhoneDigits,
} from '../radar-core-method-imports';
import type {
  RadarLeadStatus,
  SearchExecutionContext,
} from '../radar-core-method-imports';

export class RadarCoreDistributionMixin {
  [key: string]: any;
  async getRadarContactProtectionForUser(user: any, input: { phone?: string | null; phoneDigits?: string | null }) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarPersistence())) {
      return { blocked: false, reason: 'radar_unavailable' };
    }
    const phoneDigits = normalizePhoneDigits(input.phoneDigits || input.phone);
    if (!phoneDigits) return { blocked: false, reason: 'no_phone' };
    const row = await (this.prisma as any).radarLeadPool.findFirst({
      where: {
        OR: [
          { phoneDigits },
          { phoneDigits: phoneDigits.startsWith('55') ? phoneDigits.slice(2) : `55${phoneDigits}` },
        ],
      },
      include: {
        companyStates: { where: { companyId: context.companyId }, take: 1 },
      },
    }).catch(() => null);
    if (!row) return { blocked: false, reason: 'not_found' };
    const companyState = Array.isArray(row.companyStates) && row.companyStates.length ? row.companyStates[0] : null;
    const status = this.normalizeRadarLeadStatus(companyState?.status || row.status);
    const blocked = this.isRadarProtectedStatus(status);
    return {
      blocked,
      status,
      radarLeadId: row.id,
      reason: blocked ? companyState?.negativeReason || companyState?.deniedReason || row.deniedReason || row.complaintReason || status : null,
    };
  }

  private async assertRadarDispositionPaidAcquisition(context: SearchExecutionContext, row: any) {
    const state = Array.isArray(row?.companyStates) ? row.companyStates[0] || null : null;
    const usageKey = String(state?.claimUsageKey || '').trim();
    if (Number(row?.ownerCompanyId || 0) !== context.companyId
      || !state?.paidClaimOperationId
      || !usageKey
      || !state?.acquiredAt) {
      throw new ForbiddenException('Puxe e pague o lead antes de registrar esta ação.');
    }
    if (typeof this.commercialUsageLimits?.hasActiveLeadDeliveryCredit !== 'function') {
      throw new ServiceUnavailableException('Não foi possível confirmar a aquisição paga do lead.');
    }
    const active = await this.commercialUsageLimits.hasActiveLeadDeliveryCredit(
      context.companyId,
      { usageKey },
    ).catch(() => false);
    if (!active) throw new ForbiddenException('A aquisição deste lead não possui crédito ativo.');
    return state;
  }

  async markRadarContactDispositionForUser(
    user: any,
    input: {
      phone?: string | null;
      phoneDigits?: string | null;
      name?: string | null;
      city?: string | null;
      state?: string | null;
      segment?: string | null;
      status: string;
      reason?: string | null;
      source?: string | null;
    },
  ) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarPersistence())) return { ok: false, reason: 'radar_unavailable' };
    const phoneDigits = normalizePhoneDigits(input.phoneDigits || input.phone);
    if (!phoneDigits) return { ok: false, reason: 'no_phone' };
    const now = new Date();
    let row = await (this.prisma as any).radarLeadPool.findFirst({
      where: { phoneDigits },
    }).catch(() => null);
    if (!row) {
      row = await (this.prisma as any).radarLeadPool.create({
        data: {
          name: String(input.name || 'Contato sem nome').trim() || 'Contato sem nome',
          phone: String(input.phone || phoneDigits).trim() || phoneDigits,
          phoneDigits,
          ddd: this.extractDdd(phoneDigits),
          city: String(input.city || '').trim() || null,
          state: String(input.state || '').trim().toUpperCase() || null,
          normalizedCity: normalizeLookupValue(String(input.city || '')),
          segment: String(input.segment || '').trim() || null,
          normalizedSegment: normalizeLookupValue(String(input.segment || '')),
          websiteStatus: 'unknown',
          source: input.source || 'vendas_automation',
          sourceEngine: 'vendas_automation',
          sourceEngines: JSON.stringify(['vendas_automation']),
          opportunityScore: 0,
          opportunityReason: 'Criado para proteger histórico operacional de Vendas.',
          status: 'clean',
          firstSeenAt: now,
          lastSeenAt: now,
        },
      });
    }
    const dispositionStatus = this.normalizeRadarLeadStatus(input.status);
    if (dispositionStatus === 'interested' || dispositionStatus === 'positive') {
      return this.markRadarLeadPositiveDispositionForUser(user, row.id, {
        status: dispositionStatus,
        reason: input.reason || input.status,
        privateNotes: input.source || 'Vendas Automação',
      });
    }
    return this.markRadarLeadNegativeForUser(user, row.id, {
      status: input.status,
      reason: input.reason || input.status,
      privateNotes: input.source || 'Vendas Automação',
    });
  }

  private async markRadarLeadPositiveDispositionForUser(
    user: any,
    radarLeadId: string,
    input: { status?: string; reason?: string; privateNotes?: string } = {},
  ) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: String(radarLeadId || '').trim() },
      include: { companyStates: { where: { companyId: context.companyId }, take: 1 } },
    });
    if (!row) throw new NotFoundException('Card do Radar nao encontrado.');
    const ownershipEnabled = await this.supportsRadarOwnershipPersistence();
    if (!ownershipEnabled) throw new ServiceUnavailableException('Controle seguro de aquisição indisponível.');
    await this.assertRadarDispositionPaidAcquisition(context, row);
    const status = this.normalizeRadarLeadStatus(input.status || 'interested');
    const existing = await (this.prisma as any).radarLeadCompanyState.findUnique({
      where: {
        companyId_radarLeadId: {
          companyId: context.companyId,
          radarLeadId: row.id,
        },
      },
    }).catch(() => null);
    const now = new Date();
    await (this.prisma as any).radarLeadCompanyState.upsert({
      where: {
        companyId_radarLeadId: {
          companyId: context.companyId,
          radarLeadId: row.id,
        },
      },
      create: {
        companyId: context.companyId,
        radarLeadId: row.id,
        status,
        negativeReason: null,
        deniedReason: null,
        complaintReason: null,
        privateNotes: String(input.privateNotes || '').trim() || null,
        lastActionAt: now,
      },
      update: {
        status,
        negativeReason: null,
        deniedReason: null,
        complaintReason: null,
        privateNotes: String(input.privateNotes || '').trim() || null,
        lastActionAt: now,
      },
    });
    await (this.prisma as any).radarLeadPool.update({
      where: { id: row.id },
      data: {
        status,
        deniedReason: null,
        complaintReason: null,
        recommendedChannel: 'whatsapp',
        lastSeenAt: now,
      },
    }).catch(() => null);
    await this.recordRadarLeadEvent({
      leadId: row.id,
      companyId: context.companyId,
      userId: context.userId,
      eventType: 'status_changed',
      note: String(input.reason || '').trim() || null,
      statusFrom: this.normalizeRadarLeadStatus(existing?.status || row.status),
      statusTo: status,
    });
    return {
      ok: true,
      radarLeadId: row.id,
      status,
    };
  }

  // Recusa DURA = o contato é ruim pra TODO MUNDO (número não existe, sem WhatsApp,
  // número inválido, CAIXA POSTAL, opt-out, reclamação, bloqueio) → o lead some da
  // lagoa pra todas as empresas. Recusa LEVE ("sem interesse", recusou a oferta,
  // descartou, escondeu, NÃO ATENDEU) é só desta empresa → o lead VOLTA pra lagoa pros
  // outros. Dono 14/06: "pode não querer refrigerante mas topar a ligação da cerveja".
  // DERIVA da fonte única `radar-disposition-rules.ts` (matriz do dono PR24062026):
  //   - `no_answer` ("não atendeu") agora é LEVE (saiu do bloqueio global).
  //   - `voicemail` ("caixa postal") agora é DURA (entrou no bloqueio global).
  private isRadarGlobalKillStatus(status: string): boolean {
    return isGlobalBlockStatus(status);
  }

  async markRadarLeadNegativeForUser(user: any, radarLeadId: string, input: { status?: string; reason?: string; privateNotes?: string } = {}) {
    const context = this.resolveContext(user);
    if (!(await this.supportsRadarPersistence())) {
      throw new ServiceUnavailableException('Banco do Radar ainda nao foi migrado neste ambiente.');
    }
    const row = await (this.prisma as any).radarLeadPool.findUnique({
      where: { id: String(radarLeadId || '').trim() },
      include: { companyStates: { where: { companyId: context.companyId }, take: 1 } },
    });
    if (!row) throw new NotFoundException('Card do Radar nao encontrado.');
    const ownershipEnabled = await this.supportsRadarOwnershipPersistence();
    const ownerCompanyId = Math.trunc(Number(row?.ownerCompanyId || 0)) || 0;
    if (ownershipEnabled && ownerCompanyId && ownerCompanyId !== context.companyId) {
      throw new ForbiddenException('Este card já está na carteira de outra empresa.');
    }
    const normalizedStatus = String(input.status || '').trim().toLowerCase();
    const status: RadarLeadStatus =
      normalizedStatus === 'denied'
        ? 'denied'
        : normalizedStatus === 'complaint'
          ? 'complaint'
          : normalizedStatus === 'hidden'
            ? 'hidden'
            : normalizedStatus === 'discarded' || normalizedStatus === 'descartado'
        ? 'discarded'
        : normalizedStatus === 'blocked' || normalizedStatus === 'bloqueado'
          ? 'blocked'
          // caixa postal (voicemail) = único kill de LIGAÇÃO → status próprio, protegido,
          // bloqueia global (matriz do dono PR24062026). 'voicemail' ∈ RADAR_PROTECTED_STATUSES.
          : normalizedStatus === 'voicemail' || normalizedStatus === 'caixa_postal'
            ? 'voicemail'
          : normalizedStatus === 'opt_out' || normalizedStatus === 'optout' || normalizedStatus === 'do_not_contact' || normalizedStatus === 'nao_quer_contato' || normalizedStatus === 'não_quer_contato'
            ? 'opt_out'
            : normalizedStatus === 'no_whatsapp'
              ? 'no_whatsapp'
              : normalizedStatus === 'invalid_whatsapp'
                ? 'invalid_whatsapp'
              : 'negative';
    const existing = await (this.prisma as any).radarLeadCompanyState.findUnique({
      where: {
        companyId_radarLeadId: {
          companyId: context.companyId,
          radarLeadId: row.id,
        },
      },
    }).catch(() => null);
    let paidState: any = null;
    if (ownershipEnabled && ownerCompanyId === context.companyId) {
      paidState = await this.assertRadarDispositionPaidAcquisition(context, row).catch(() => null);
    }
    const ownedByCompany = Boolean(paidState);
    if (!ownedByCompany && this.isRadarGlobalKillStatus(status)) {
      throw new ForbiddenException('Puxe e pague o lead antes de registrar um bloqueio global.');
    }
    const now = new Date();
    await (this.prisma as any).radarLeadCompanyState.upsert({
      where: {
        companyId_radarLeadId: {
          companyId: context.companyId,
          radarLeadId: row.id,
        },
      },
      create: {
        companyId: context.companyId,
        radarLeadId: row.id,
        status,
        negativeReason: String(input.reason || '').trim() || null,
        deniedReason: ['negative', 'denied', 'opt_out', 'blocked'].includes(status) ? String(input.reason || '').trim() || null : null,
        complaintReason: status === 'complaint' ? String(input.reason || '').trim() || null : null,
        privateNotes: String(input.privateNotes || '').trim() || null,
        lastActionAt: now,
      },
      update: {
        status,
        negativeReason: String(input.reason || '').trim() || null,
        deniedReason: ['negative', 'denied', 'opt_out', 'blocked'].includes(status) ? String(input.reason || '').trim() || null : null,
        complaintReason: status === 'complaint' ? String(input.reason || '').trim() || null : null,
        privateNotes: String(input.privateNotes || '').trim() || null,
        lastActionAt: now,
      },
    });
    if (!this.isRadarProtectedStatus(existing?.status)) {
      if (this.isRadarGlobalKillStatus(status)) {
        // DURA: morre pra todos. Marca o status global protegido — o buildRadarWhere
        // exclui da lagoa inteira (número/contato ruim não serve pra ninguém).
        await (this.prisma as any).radarLeadPool.update({
          where: { id: row.id },
          data: {
            status,
            deniedReason: ['denied', 'opt_out', 'blocked'].includes(status) ? String(input.reason || '').trim() || null : undefined,
            complaintReason: status === 'complaint' ? String(input.reason || '').trim() || null : undefined,
            recommendedChannel: 'discard',
            enrichmentScore: 0,
            globalNegativeCount: { increment: 1 },
            lastSeenAt: now,
          },
        }).catch(() => null);
      } else {
        // LEVE: bloqueia só ESTA empresa (companyState já gravado acima) e LIBERA o
        // card de volta pra lagoa pros outros. Não toca canal/score (opinião de A não
        // vale pra B) e NUNCA ressuscita um lead já morto globalmente por outra empresa.
        const globallyDead = this.isRadarProtectedStatus(row?.status)
          || ['rejected', 'duplicate'].includes(String(row?.status || '').trim().toLowerCase());
        // Antes da compra, o descarte é apenas uma preferência tenant-scoped no
        // companyState: não reivindica posse nem altera o lead global. Depois da
        // compra, a recusa leve pode devolver o ativo para a lagoa.
        if (ownedByCompany) {
          await (this.prisma as any).radarLeadPool.update({
            where: { id: row.id },
            data: {
              ...(ownershipEnabled ? { ownerCompanyId: null, claimedAt: null } : {}),
              ...(globallyDead ? {} : { status: 'clean' }),
              globalNegativeCount: { increment: 1 },
              lastSeenAt: now,
            },
          }).catch(() => null);
        }
      }
    }
    await this.recordRadarLeadEvent({
      leadId: row.id,
      companyId: context.companyId,
      userId: context.userId,
      eventType: status === 'discarded'
        ? 'discarded'
        : status === 'hidden'
          ? 'hidden'
        : status === 'blocked'
          ? 'blocked'
        : status === 'opt_out'
          ? 'opt_out'
          : status === 'complaint'
            ? 'complaint'
            : status === 'no_whatsapp' || status === 'invalid_whatsapp'
              ? 'no_answer'
              : status === 'denied'
                ? 'denied'
                : 'negative',
      note: String(input.reason || '').trim() || null,
      statusFrom: this.normalizeRadarLeadStatus(existing?.status || row.status),
      statusTo: status,
    });
    return {
      ok: true,
      radarLeadId: row.id,
      status,
    };
  }

  // ── Standing order do vendedor: REMOVIDO (LIMPEZA-DESTRUTIVA L4, 04/07) ─────
  // Era self-serve inerte (pump já morto desde o VENDAS-REFAB item 5). O fluxo
  // atual é explícito: localizar, debitar um crédito e transferir para Vendas.
}
