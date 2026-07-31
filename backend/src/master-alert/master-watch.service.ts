import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';
import { readMotorInstanceName } from '../messaging/whatsapp-connection-state';
import { emitMasterEvent } from '../common/master-event';
import { resolveCompanyAccessState, CompanyAccessSnapshot } from '../modules/company-access-state';
import { MasterAlertService } from './master-alert.service';
import { listDigestEventTypes } from './master-alert.routes';

// Watcher de transições — COCKPIT-MASTER Sprint 3. Acaba com o silêncio sobre
// falha: chip caído, cobrança travada, fábrica parada e mudança de estado
// comercial viram evento (MasterEvent, Sprint 1) roteado por política
// (MasterAlertService.routeEvent, Sprint 3) em vez de o dono descobrir tarde.
//
// Padrão da casa (setInterval em onModuleInit, ex. vendas-automation.service.ts
// :526) — de propósito NÃO usa @nestjs/schedule (nada na base usa; não
// introduzir dependência nova por este sprint). Tick a cada 5 min, guard de
// tick-em-voo (mesmo padrão do workerRunning do vendas-automation), clearInterval
// no destroy.
//
// TETO DESTE MÓDULO (Guardrails do sprint): só LÊ o motor
// (WebwhatsBridgeService.listMotorInstances, GET puro, sem retry/side-effect).
// JAMAIS chama connect/reconnect/logout/delete — reagir a chip caído
// (reconectar) é decisão HUMANA do dono, nunca automática.
@Injectable()
export class MasterWatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MasterWatchService.name);

  private tickTimer: NodeJS.Timeout | null = null;
  private tickRunning = false;

  // Baseline dos chips em memória — reinício do processo = baseline novo (nunca
  // dispara chip.dropped comparando com um estado de antes do restart, que
  // seria alerta falso). Chave: instanceName cru do motor.
  private lastChipStateByInstance = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly webwhats: WebwhatsBridgeService,
    private readonly masterAlert: MasterAlertService,
  ) {}

  onModuleInit() {
    if (!this.isEnabled()) {
      this.logger.warn('master-watch DESLIGADO por env (HBX_MASTER_WATCH_ENABLED) — zero ticks.');
      return;
    }
    this.tickTimer = setInterval(() => {
      void this.runTick().catch((error) => {
        this.logger.warn(`master-watch tick falhou: ${String((error as Error)?.message || error)}`);
      });
    }, this.tickIntervalMs());
    this.logger.log(`master-watch LIGADO — tick a cada ${this.tickIntervalMs() / 60000} min.`);
  }

  onModuleDestroy() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  // Default: ON em produção, OFF em dev — evita spam de alerta/zap em ambiente
  // local/dev (base de dev tem empresas de teste "sempre quebradas").
  private isEnabled(): boolean {
    const raw = String(process.env.HBX_MASTER_WATCH_ENABLED || '').trim().toLowerCase();
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
  }

  private tickIntervalMs(): number {
    return 5 * 60 * 1000;
  }

  private staleBillingHours(): number {
    const n = Number(process.env.HBX_MASTER_WATCH_BILLING_STALE_HOURS || 6);
    return Number.isFinite(n) && n > 0 ? n : 6;
  }

  private stalledFactoryHours(): number {
    const n = Number(process.env.HBX_MASTER_WATCH_FACTORY_STALLED_HOURS || 12);
    return Number.isFinite(n) && n > 0 ? n : 12;
  }

  // Ciclo do tick: 5 checagens, cada uma BEST-EFFORT e ISOLADA — uma falhar
  // nunca derruba as outras (mesmo padrão do buildHealth do MasterCockpitService).
  private async runTick(): Promise<void> {
    if (this.tickRunning) return;
    this.tickRunning = true;
    try {
      await Promise.all([
        this.checkCompanyStateTransitions().catch((error) =>
          this.logger.warn(`master-watch company_state falhou: ${String((error as Error)?.message || error)}`),
        ),
        this.checkChips().catch((error) =>
          this.logger.warn(`master-watch chips falhou: ${String((error as Error)?.message || error)}`),
        ),
        this.checkBillingStale().catch((error) =>
          this.logger.warn(`master-watch billing falhou: ${String((error as Error)?.message || error)}`),
        ),
        this.checkFactoryStalled().catch((error) =>
          this.logger.warn(`master-watch factory falhou: ${String((error as Error)?.message || error)}`),
        ),
        this.checkDailyDigest().catch((error) =>
          this.logger.warn(`master-watch digest falhou: ${String((error as Error)?.message || error)}`),
        ),
      ]);
    } finally {
      this.tickRunning = false;
    }
  }

  // (a) Estado comercial: resolveCompanyAccessState por empresa do roster.
  // dedupKey = company-state:{id} + dedup por payload.state (emitMasterEvent
  // só insere quando o state MUDA — mecanismo do Sprint 1). Sem diff manual
  // aqui: a dedup de emitMasterEvent JÁ é "só emite quando muda".
  private async checkCompanyStateTransitions(): Promise<void> {
    const nowMs = Date.now();
    const companies = await this.prisma.company.findMany({
      where: { companyKind: 'tenant' },
      take: 1000,
      select: {
        id: true,
        name: true,
        slug: true,
        companyKind: true,
        // MASTER-REFAB S6 (10/07 noite): resolveCompanyAccessState bifurca por accountType antes
        // de olhar pra courtesy/trial/overdue — sem selecionar o campo, TODA empresa (inclusive
        // enterprise real) normalizava pro default 'credit' aqui e a detecção de transição de
        // estado morria silenciosamente.
        accountType: true,
        status: true,
        isActive: true,
        paymentMethod: true,
        selectedPlanKey: true,
        trialEndsAt: true,
        billingGraceEndsAt: true,
        courtesyEndsAt: true,
        courtesyReason: true,
      },
    });

    for (const company of companies) {
      try {
        const snapshot: CompanyAccessSnapshot = {
          companyKind: company.companyKind,
          slug: company.slug,
          accountType: (company as any).accountType,
          status: company.status,
          isActive: company.isActive,
          paymentMethod: company.paymentMethod,
          selectedPlanKey: company.selectedPlanKey,
          trialEndsAt: company.trialEndsAt,
          billingGraceEndsAt: company.billingGraceEndsAt,
          courtesyEndsAt: company.courtesyEndsAt,
          courtesyReason: company.courtesyReason,
        };
        const access = resolveCompanyAccessState(snapshot, nowMs);
        const severity = access.state === 'overdue' || access.state === 'suspended' ? 'action_required' : 'attention';

        const eventId = await emitMasterEvent(this.prisma, {
          type: 'company.state_changed',
          severity,
          companyId: company.id,
          dedupKey: `company-state:${company.id}`,
          payload: {
            state: access.state,
            statusLabel: access.statusLabel,
            riskLevel: access.riskLevel,
            companyName: company.name,
          },
        });

        // Só roteia (email/zap/sino) quando o evento REALMENTE foi inserido —
        // emitMasterEvent devolve null quando a dedup engoliu (estado não mudou).
        if (eventId) {
          await this.masterAlert.routeEvent({
            id: eventId,
            type: 'company.state_changed',
            severity,
            companyId: company.id,
            dedupKey: `company-state:${company.id}`,
            payload: {
              state: access.state,
              statusLabel: access.statusLabel,
              riskLevel: access.riskLevel,
              companyName: company.name,
            },
          });
        }
      } catch (error) {
        // Best-effort POR EMPRESA — uma empresa quebrada não pode travar o roster inteiro.
        this.logger.warn(
          `master-watch company_state falhou para company=${company.id}: ${String((error as Error)?.message || error)}`,
        );
      }
    }
  }

  // (b) Chips: leitura SÓ-LEITURA do motor ao vivo (listMotorInstances).
  // Chip que estava 'open' no tick anterior e sumiu/fechou neste tick →
  // chip.dropped. NUNCA reage (reconectar é decisão humana do dono).
  private async checkChips(): Promise<void> {
    const instances = await this.webwhats.listMotorInstances();
    if (instances === null) return; // motor desligado/indisponível — sem leitura, sem alerta falso.

    const currentStateByInstance = new Map<string, string>();
    for (const inst of instances) {
      const name = readMotorInstanceName(inst);
      if (!name) continue;
      const state = String(
        inst?.connectionStatus ?? inst?.instance?.state ?? inst?.instance?.status ?? inst?.state ?? inst?.status ?? '',
      )
        .trim()
        .toLowerCase();
      currentStateByInstance.set(name, state);
    }

    for (const [name, previousState] of this.lastChipStateByInstance.entries()) {
      const wasOpen = previousState === 'open';
      const currentState = currentStateByInstance.get(name);
      const droppedNow = wasOpen && (currentState === undefined || (currentState !== 'open' && currentState !== ''));
      if (!droppedNow) continue;

      const companyId = this.extractCompanyIdFromInstanceName(name);
      const eventId = await emitMasterEvent(this.prisma, {
        type: 'chip.dropped',
        severity: 'action_required',
        companyId,
        dedupKey: `chip:${companyId ?? 'unknown'}:${name}`,
        payload: { state: currentState || 'missing', instance: name },
      });
      if (eventId) {
        await this.masterAlert.routeEvent({
          id: eventId,
          type: 'chip.dropped',
          severity: 'action_required',
          companyId,
          dedupKey: `chip:${companyId ?? 'unknown'}:${name}`,
          payload: { state: currentState || 'missing', instance: name },
        });
      }
    }

    // Baseline do PRÓXIMO tick — substitui inteiro (não acumula instâncias mortas).
    this.lastChipStateByInstance = currentStateByInstance;
  }

  // instanceName = `company-{id}` ou `company-{id}-user-{userId}` (docs/Rules/WHATSAPP.md).
  private extractCompanyIdFromInstanceName(name: string): number | null {
    const match = /^company-(\d+)/.exec(name);
    if (!match) return null;
    const id = Number(match[1]);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  // (c) Cobrança: último webhook processado (FinanceiroCharge.lastWebhookAt,
  // mesma fonte do Sprint 2/health) há mais de N horas → billing.webhook_stale.
  private async checkBillingStale(): Promise<void> {
    const row = await this.prisma.financeiroCharge.findFirst({
      where: { lastWebhookAt: { not: null } },
      orderBy: [{ lastWebhookAt: 'desc' }],
      select: { lastWebhookAt: true },
    });

    // Sem NENHUM webhook ainda registrado: ambiente novo/dev — não alerta
    // (não há "estava vivo e parou" para comparar; evita ruído no dia 1).
    if (!row?.lastWebhookAt) return;

    const staleMs = this.staleBillingHours() * 60 * 60 * 1000;
    const ageMs = Date.now() - new Date(row.lastWebhookAt).getTime();
    if (ageMs <= staleMs) return;

    const eventId = await emitMasterEvent(this.prisma, {
      type: 'billing.webhook_stale',
      severity: 'action_required',
      dedupKey: 'billing-webhook-stale',
      dedupWindowMinutes: 24 * 60,
      payload: {
        state: 'stale',
        lastWebhookAt: row.lastWebhookAt.toISOString(),
        staleHours: this.staleBillingHours(),
      },
    });
    if (eventId) {
      await this.masterAlert.routeEvent({
        id: eventId,
        type: 'billing.webhook_stale',
        severity: 'action_required',
        dedupKey: 'billing-webhook-stale',
        payload: {
          lastWebhookAt: row.lastWebhookAt.toISOString(),
          staleHours: this.staleBillingHours(),
        },
      });
    }
  }

  // (d) Fábrica: nenhum RadarLeadPool novo/revisto há mais de N horas →
  // factory.stalled (mesma fonte do Sprint 2/health: lastSeenAt).
  private async checkFactoryStalled(): Promise<void> {
    const row = await this.prisma.radarLeadPool.findFirst({
      orderBy: [{ lastSeenAt: 'desc' }],
      select: { lastSeenAt: true },
    });

    // Sem NENHUM lead ainda: ambiente novo/dev — não alerta.
    if (!row?.lastSeenAt) return;

    const stalledMs = this.stalledFactoryHours() * 60 * 60 * 1000;
    const ageMs = Date.now() - new Date(row.lastSeenAt).getTime();
    if (ageMs <= stalledMs) return;

    const eventId = await emitMasterEvent(this.prisma, {
      type: 'factory.stalled',
      severity: 'attention',
      dedupKey: 'factory-stalled',
      dedupWindowMinutes: 24 * 60,
      payload: {
        state: 'stalled',
        lastLeadSeenAt: row.lastSeenAt.toISOString(),
        stalledHours: this.stalledFactoryHours(),
      },
    });
    if (eventId) {
      await this.masterAlert.routeEvent({
        id: eventId,
        type: 'factory.stalled',
        severity: 'attention',
        dedupKey: 'factory-stalled',
        payload: {
          lastLeadSeenAt: row.lastSeenAt.toISOString(),
          stalledHours: this.stalledFactoryHours(),
        },
      });
    }
  }

  // (e) Digest diário (Sprint 4): fora da janela 08:00–08:30 (hora local
  // America/Sao_Paulo) → nunca dispara. Dentro da janela, dedup por DIA
  // (dedupKey `digest:{YYYY-MM-DD}` na MasterEvent — mesmo mecanismo de
  // dedup do Sprint 1, sem tabela/estado novo) garante 1x e só 1x. Junta
  // eventos das últimas 24h cujo `type` tem rota `digest:true`, agrupa por
  // tipo e entrega via MasterAlertService.deliverDigest (email sempre; zap
  // NO MÁXIMO 1, contando no MESMO teto diário de 10 zaps do roteador).
  private async checkDailyDigest(): Promise<void> {
    if (!this.isWithinDigestWindow()) return;

    const dayKey = this.saoPauloDateKey();
    const dedupKey = `digest:${dayKey}`;

    const digestTypes = listDigestEventTypes();
    if (digestTypes.length === 0) return; // nenhuma rota digest cadastrada — nada a fazer.

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const events = await this.prisma.masterEvent.findMany({
      where: { type: { in: digestTypes }, createdAt: { gte: since } },
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
      select: { type: true, companyId: true, payloadJson: true, createdAt: true },
    });

    // Sem NENHUM evento acumulado → silêncio total (nem marca o dia como
    // "enviado" — se algo acontecer mais tarde no mesmo dia, o próximo tick
    // ainda está fora da janela, então não reabre a janela; é aceitável: o
    // contrato pede "sem evento acumulado não envia nada", não "tenta de novo").
    if (events.length === 0) return;

    // Marca o dia ANTES de entregar (via emitMasterEvent com a MESMA dedupKey
    // `digest:{YYYY-MM-DD}`): `payload.state = dayKey` é o mesmo mecanismo de
    // dedup do checkCompanyStateTransitions — o dia só muda 1x, então o 2º
    // tick dentro da MESMA janela (ou de um dia igual) encontra `sameState`
    // e emitMasterEvent devolve null, sem precisar de dedupWindowMinutes.
    const marked = await emitMasterEvent(this.prisma, {
      type: 'digest.sent',
      severity: 'info',
      dedupKey,
      payload: { state: dayKey, eventCount: events.length },
    });
    // emitMasterEvent devolve null quando a dedup engoliu — digest de hoje JÁ saiu.
    if (!marked) return;

    const { subject, text } = this.buildDigestContent(dayKey, events);
    await this.masterAlert.deliverDigest({ subject, text });
  }

  // Agrupa por tipo (contagem + até 3 exemplos/empresa) e monta um texto curto.
  private buildDigestContent(
    dayKey: string,
    events: Array<{ type: string; companyId: number | null; payloadJson: string | null; createdAt: Date }>,
  ): { subject: string; text: string } {
    const labels: Record<string, string> = {
      'company.state_changed': 'Empresas que mudaram de estado comercial',
      'factory.stalled': 'Fábrica de leads parada',
    };

    const byType = new Map<string, typeof events>();
    for (const event of events) {
      const list = byType.get(event.type) || [];
      list.push(event);
      byType.set(event.type, list);
    }

    const lines: string[] = [`Resumo diário HBX Master — ${dayKey}`, ''];
    for (const [type, list] of byType.entries()) {
      const label = labels[type] || type;
      lines.push(`${label}: ${list.length}`);
      // top 3 itens do tipo, mais recentes primeiro (a query já veio ordenada desc).
      for (const item of list.slice(0, 3)) {
        const payload = this.safeParsePayload(item.payloadJson);
        const companyPart = item.companyId ? ` — empresa #${item.companyId}` : '';
        const statePart = payload?.state ? ` (${payload.state})` : '';
        lines.push(`  - ${item.createdAt.toISOString().slice(11, 16)}${companyPart}${statePart}`);
      }
      lines.push('');
    }
    lines.push('Detalhe completo no cockpit (/master).');

    const text = lines.join('\n');
    return { subject: `Resumo diário HBX Master — ${dayKey}`, text };
  }

  private safeParsePayload(payloadJson: string | null): Record<string, unknown> | null {
    if (!payloadJson) return null;
    try {
      const parsed = JSON.parse(payloadJson);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  // Hora local America/Sao_Paulo calculada via Intl (NÃO copia o UTC-3
  // hardcoded na mão do hbx-pulse.service.ts:260 — aquele cálculo quebra
  // silenciosamente no horário de verão; timeZone do Intl é sempre correto,
  // e o Brasil não usa mais DST desde 2019, mas o país-fonte da verdade aqui
  // é o próprio Intl, não uma constante fixa).
  private saoPauloHourMinute(): { hour: number; minute: number } {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return { hour: Number.isFinite(hour) ? hour : 0, minute: Number.isFinite(minute) ? minute : 0 };
  }

  private saoPauloDateKey(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find((p) => p.type === 'year')?.value || '0000';
    const month = parts.find((p) => p.type === 'month')?.value || '01';
    const day = parts.find((p) => p.type === 'day')?.value || '01';
    return `${year}-${month}-${day}`; // en-CA formata nativamente como YYYY-MM-DD.
  }

  // Janela 08:00–08:30 (Guardrails do sprint: digest só de dia, nunca de
  // madrugada). Tick de 5 min cabe confortavelmente dentro de 30 min de janela
  // (pelo menos 1 tick vai cair dentro dela, mesmo com jitter do processo).
  private isWithinDigestWindow(): boolean {
    const { hour, minute } = this.saoPauloHourMinute();
    if (hour !== 8) return false;
    return minute >= 0 && minute < 30;
  }
}
