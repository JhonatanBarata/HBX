import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';
import { emitMasterEvent } from '../common/master-event';
import { pushMasterNotice } from '../common/push-master-notice';
import { MASTER_ALERT_MAX_WHATSAPP_PER_DAY, resolveMasterAlertRoute } from './master-alert.routes';

// Alerta do MASTER (o dono) quando entra um pedido que ele precisa tocar à mão —
// hoje: HBX Full (implantação assistida, sem self-checkout). Best-effort em 3
// frentes: e-mail, WhatsApp e log (visível na janela Pagamentos do /master).
// NENHUMA falha de canal derruba o fluxo de quem chamou — o pedido continua.
//
// Módulo-folha de propósito: depende só de Prisma + Mail + WebwhatsBridge (que
// por sua vez só usa Prisma). Não importa MessagingModule — assim NÃO cria o
// ciclo CommercialPlans → Messaging → Modules → CommercialPlans.
//
// COCKPIT-MASTER Sprint 1: os 3 canais viraram UM entregador privado (`deliver`)
// — antes o bloco estava copiado 3× — e cada alerta também vira evento tipado na
// trilha única do dono (emitMasterEvent, write-through: nada saiu das trilhas antigas).
//
// COCKPIT-MASTER Sprint 3: `routeEvent` decide OS CANAIS por política
// (master-alert.routes.ts) e os 3 alertas legados passam a chamá-lo — o
// comportamento observável para quem chama (vendas.service.ts,
// commercial-plans.service.ts) fica IDÊNTICO (email+zap+log imediato).

// Nº do dono usado como fallback do canal WhatsApp quando MASTER_ALERT_WHATSAPP_TO
// não está definido — constante única (antes repetido em 3 métodos).
const DEFAULT_MASTER_WHATSAPP = '19997024884';

// Evento roteável (o suficiente do MasterEvent para decidir canais + montar o
// texto). `text`/`subject` são opcionais: quando ausentes, routeEvent monta um
// texto genérico a partir do payload — os 3 alertas legados sempre os passam
// explícitos (preserva a mensagem exata de hoje).
export type RoutableMasterEvent = {
  id?: string | null;
  type: string;
  severity: string;
  companyId?: number | null;
  dedupKey?: string | null;
  payload?: Record<string, unknown> | null;
  subject?: string;
  text?: string;
  // false preserva o comportamento antigo do notifyBotConfigMissing, que NUNCA
  // avisava canal ausente (repassado direto ao deliver()). Default true.
  warnMissingChannels?: boolean;
};

export type FullPlanRequestInput = {
  companyId: number;
  companyName?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  requestedByEmail?: string | null;
};

export type BotConfigMissingInput = {
  companyId: number;
  companyName?: string | null;
  requestedByName?: string | null;
  requestedByPhone?: string | null;
  requestedByEmail?: string | null;
};

export type ImplantacaoSoldInput = {
  companyId: number;
  sellerName?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  planLabel?: string | null;
  monthlyValue?: number | null;
  setupValue?: number | null;
  leadId?: string | null;
};

// CONTABIL S2 — alerta de obrigação fiscal (D-7/D-3/D-1/D0/ATRASADO). Texto já
// vem PRONTO do obligation-scheduler (o Contabil é o único autor do conteúdo —
// este método só entrega nos canais). `permitirWhatsapp=false` pula o canal
// WhatsApp mas ainda registra e-mail + log (usado pelo teto anti-spam do
// scheduler: quando o teto de zaps/dia estoura, o alerta ainda existe, só não
// dispara zap).
export type FiscalObligationAlertInput = {
  competencia: string;
  tipo: string;
  estado: string;
  dueDate: Date;
  texto: string;
  permitirWhatsapp?: boolean;
};

@Injectable()
export class MasterAlertService {
  private readonly logger = new Logger(MasterAlertService.name);

  // Throttle do roteador (Sprint 3): mecanismo mais simples que funciona —
  // Map in-memory por `type+dedupKey` → timestamp da última entrega. Reinicia
  // a zero a cada boot do processo (mesma premissa de instância única do
  // MasterCockpitService/master-watch). NÃO é durável de propósito: throttle
  // é proteção de RAJADA (não martelar o mesmo alerta), não contabilidade —
  // perder o histórico num restart só significa "1 entrega a mais", nunca loop.
  private readonly lastRoutedAt = new Map<string, number>();

  // Teto duro de zaps/dia (Guardrails do sprint): contagem in-memory por dia
  // corrente (chave `YYYY-MM-DD`). Reinicia a zero a cada boot — pior caso é
  // subestimar num restart no meio do dia, nunca superestimar/travar o e-mail.
  private whatsappDailyKey: string | null = null;
  private whatsappDailyCount = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly webwhats: WebwhatsBridgeService,
  ) {}

  // ── Roteador (Sprint 3) ──────────────────────────────────────────────────
  // Aplica a tabela de rotas (master-alert.routes.ts) a UM evento: decide
  // canais, aplica throttle por `type+dedupKey`, respeita o teto diário de
  // zaps e entrega pelo `deliver()` já existente (Sprint 1). Eventos
  // `digest:true` NÃO disparam zap/e-mail na hora — ficam para o Sprint 4
  // (resumo periódico); o canal sino continua acendendo (é grátis/local).
  // Best-effort por contrato: nunca lança — um roteamento que falha não pode
  // derrubar quem chamou (watcher ou fluxo de venda).
  async routeEvent(event: RoutableMasterEvent): Promise<{ email: boolean; whatsapp: boolean; sino: boolean }> {
    const result = { email: false, whatsapp: false, sino: false };
    try {
      const route = resolveMasterAlertRoute(event.type);
      const companyId = Number(event.companyId || 0) || 0;
      const throttleKey = `${event.type}:${event.dedupKey || ''}`;

      if (route.throttleMinutes > 0 && this.isThrottled(throttleKey, route.throttleMinutes)) {
        return result;
      }

      // Canal sino: sempre roda (independe de digest) — é o feed in-app do
      // /master, não "incomoda" ninguém como zap/e-mail incomodam.
      if (route.channels.includes('sino') && companyId > 0) {
        const notice = this.buildNoticeContent(event);
        if (notice) {
          const sent = await pushMasterNotice(this.prisma, {
            companyId,
            audience: 'seller',
            title: notice.title,
            body: notice.body,
            tone: this.severityToNoticeTone(event.severity),
            source: 'master_alert',
            nudgeKey: event.dedupKey ? `master-alert:${event.dedupKey}` : null,
          });
          result.sino = Boolean(sent);
        }
      }

      // digest:true — email/zap ficam para o Sprint 4 (resumo periódico).
      // Registra o throttle mesmo assim (evita reavaliar o mesmo estado a
      // cada tick de 5 min só para descartar de novo).
      if (route.digest) {
        if (route.throttleMinutes > 0) this.lastRoutedAt.set(throttleKey, Date.now());
        return result;
      }

      const wantsEmail = route.channels.includes('email');
      const wantsWhatsapp = route.channels.includes('whatsapp') && this.canSendWhatsappToday();
      if (!wantsEmail && !wantsWhatsapp) {
        if (route.throttleMinutes > 0) this.lastRoutedAt.set(throttleKey, Date.now());
        return result;
      }

      const { subject, text } = this.buildDeliveryContent(event);
      const delivered = await this.deliver({
        companyId,
        subject,
        text,
        logTarget: event.type.replace(/[^a-z0-9_]+/gi, '_'),
        channels: { email: wantsEmail, whatsapp: wantsWhatsapp },
        warnMissingChannels: event.warnMissingChannels,
      });
      result.email = delivered.email;
      result.whatsapp = delivered.whatsapp;
      if (delivered.whatsapp) this.recordWhatsappSent();

      if (route.throttleMinutes > 0) this.lastRoutedAt.set(throttleKey, Date.now());
      return result;
    } catch (error) {
      this.logger.warn(`routeEvent falhou para type=${event?.type}: ${String((error as Error)?.message || error)}`);
      return result;
    }
  }

  // ── Digest diário (Sprint 4) ─────────────────────────────────────────────
  // Entrega do resumo diário montado pelo MasterWatchService: e-mail SEMPRE,
  // zap NO MÁXIMO 1 (a chamada em si já É o "1 zap do digest" — quem decide
  // SE chama 1x/dia é o watcher via dedup de MasterEvent, não este método).
  // Reusa o MESMO contador diário do roteador (canSendWhatsappToday/
  // recordWhatsappSent) — o zap do digest CONTA no teto de 10/dia (Guardrails
  // do sprint), sem duplicar estado em outro lugar. Best-effort: nunca lança.
  async deliverDigest(input: { companyId?: number; subject: string; text: string }): Promise<{ email: boolean; whatsapp: boolean }> {
    try {
      const wantsWhatsapp = this.canSendWhatsappToday();
      const delivered = await this.deliver({
        companyId: Number(input.companyId || 0) || 0,
        subject: input.subject,
        text: input.text,
        logTarget: 'digest',
        channels: { email: true, whatsapp: wantsWhatsapp },
        warnMissingChannels: false,
      });
      if (delivered.whatsapp) this.recordWhatsappSent();
      return delivered;
    } catch (error) {
      this.logger.warn(`deliverDigest falhou: ${String((error as Error)?.message || error)}`);
      return { email: false, whatsapp: false };
    }
  }

  private isThrottled(key: string, throttleMinutes: number): boolean {
    const last = this.lastRoutedAt.get(key);
    if (!last) return false;
    return Date.now() - last < throttleMinutes * 60_000;
  }

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // Teto duro (constante MASTER_ALERT_MAX_WHATSAPP_PER_DAY): acima do teto,
  // só e-mail+sino — nunca bloqueia o e-mail nem lança erro.
  private canSendWhatsappToday(): boolean {
    const key = this.todayKey();
    if (this.whatsappDailyKey !== key) {
      this.whatsappDailyKey = key;
      this.whatsappDailyCount = 0;
    }
    return this.whatsappDailyCount < MASTER_ALERT_MAX_WHATSAPP_PER_DAY;
  }

  private recordWhatsappSent(): void {
    const key = this.todayKey();
    if (this.whatsappDailyKey !== key) {
      this.whatsappDailyKey = key;
      this.whatsappDailyCount = 0;
    }
    this.whatsappDailyCount += 1;
  }

  private severityToNoticeTone(severity: string): 'info' | 'success' | 'warning' | 'urgent' {
    if (severity === 'action_required') return 'urgent';
    if (severity === 'attention') return 'warning';
    return 'info';
  }

  // Texto de entrega (email/zap): usa subject/text explícitos quando o caller
  // já os montou (os 3 alertas legados sempre passam — preserva a mensagem
  // exata de hoje); senão monta um texto genérico a partir do payload (usado
  // pelo watcher, que não precisa reinventar template por tipo de evento).
  private buildDeliveryContent(event: RoutableMasterEvent): { subject: string; text: string } {
    if (event.subject && event.text) return { subject: event.subject, text: event.text };
    const label = this.eventTypeLabel(event.type);
    const companyPart = event.companyId ? ` — empresa #${event.companyId}` : '';
    const payloadLines = Object.entries(event.payload || {})
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k}: ${v}`);
    const text = [label + companyPart, '', ...payloadLines].join('\n');
    return { subject: `${label}${companyPart}`, text };
  }

  private buildNoticeContent(event: RoutableMasterEvent): { title: string; body: string } | null {
    const { subject, text } = this.buildDeliveryContent(event);
    if (!subject && !text) return null;
    return { title: subject || this.eventTypeLabel(event.type), body: text || subject };
  }

  private eventTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      'chip.dropped': 'Chip do WhatsApp caiu',
      'billing.webhook_stale': 'Webhook de cobrança sem novidade',
      'company.state_changed': 'Empresa mudou de estado comercial',
      'factory.stalled': 'Fábrica de leads parada',
      'fullplan.requested': 'HBX Full solicitado',
      'implantacao.sold': 'Venda com implantação',
      'bot.config_missing': 'Bot IA sem configuração',
    };
    return labels[type] || type;
  }

  private normalizeWhatsAppTarget(value: unknown): string | null {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) return null;
    return digits.startsWith('55') ? digits : `55${digits}`;
  }

  // E-mail do master: env explícito tem prioridade; senão, o usuário system_master.
  private async resolveMasterEmail(): Promise<string | null> {
    const fromEnv = String(process.env.MASTER_ALERT_EMAIL || '').trim();
    if (fromEnv) return fromEnv;
    try {
      const master = await this.prisma.user.findFirst({
        where: { isSystemMaster: true, email: { not: null } },
        select: { email: true },
        orderBy: { id: 'asc' },
      });
      return master?.email || null;
    } catch {
      return null;
    }
  }

  private async recordLog(entry: {
    companyId: number;
    target: string;
    text: string;
    status: 'sent' | 'failed';
    providerMessageId?: string | null;
    errorMessage?: string | null;
  }) {
    try {
      await this.prisma.masterPaymentNotificationLog.create({
        data: {
          companyId: entry.companyId,
          target: entry.target,
          text: entry.text,
          status: entry.status,
          providerMessageId: entry.providerMessageId || null,
          errorMessage: entry.errorMessage || null,
        },
      });
    } catch {
      // tabela indisponível neste ambiente — segue sem histórico
    }
  }

  // Entregador genérico dos alertas do master: concentra os 3 canais (e-mail via
  // resolveMasterEmail, WhatsApp single-shot gated por env, recordLog) que antes
  // estavam copiados nos 3 métodos públicos. Best-effort canal a canal — NENHUMA
  // falha derruba o fluxo de quem chamou. `logTarget` é o infixo dos warns
  // (`master_alert_${logTarget}_...`); `warnMissingChannels: false` preserva o
  // comportamento antigo do notifyBotConfigMissing, que NÃO avisava canal ausente.
  private async deliver(input: {
    companyId: number;
    subject: string;
    text: string;
    logTarget: string;
    warnMissingChannels?: boolean;
    // Sprint 3: quais canais o roteador decidiu para este evento (teto diário
    // de zap já aplicado por quem chama). Ausente = os 2 (comportamento antigo
    // de quem chamava deliver() direto, pré-roteador).
    channels?: { email: boolean; whatsapp: boolean };
  }): Promise<{ email: boolean; whatsapp: boolean }> {
    const { companyId, subject, text, logTarget } = input;
    const warnMissing = input.warnMissingChannels !== false;
    const wantEmail = input.channels ? input.channels.email : true;
    const wantWhatsapp = input.channels ? input.channels.whatsapp : true;

    let emailOk = false;
    let whatsappOk = false;

    // 1) E-mail
    if (!wantEmail) {
      // rota não pede e-mail — nada a fazer, nada a logar.
    } else try {
      const to = await this.resolveMasterEmail();
      if (to) {
        const res = await this.mail.sendMail({ to, subject, text });
        emailOk = Boolean(res?.ok);
        await this.recordLog({
          companyId,
          target: `email:${to}`,
          text,
          status: emailOk ? 'sent' : 'failed',
          errorMessage: emailOk ? null : (res?.errorMessage || 'email não confirmado'),
        });
      } else if (warnMissing) {
        this.logger.warn(`master_alert_${logTarget}_sem_email — defina MASTER_ALERT_EMAIL ou um usuário system_master com e-mail`);
      }
    } catch (error) {
      this.logger.warn(`master_alert_${logTarget}_email_falhou: ${String((error as Error)?.message || error)}`);
      await this.recordLog({ companyId, target: 'email', text, status: 'failed', errorMessage: String((error as Error)?.message || error) });
    }

    // 2) WhatsApp — single-shot, sem loop. Gated por env (sem chip/local não dispara).
    if (!wantWhatsapp) {
      // rota não pede whatsapp (ou teto diário estourado) — nada a fazer.
    } else try {
      const to = this.normalizeWhatsAppTarget(process.env.MASTER_ALERT_WHATSAPP_TO || DEFAULT_MASTER_WHATSAPP);
      const senderCompanyId = Number(process.env.MASTER_ALERT_WA_COMPANY_ID || 0) || 0;
      if (to && senderCompanyId > 0) {
        const sent = await this.webwhats.sendText(senderCompanyId, { to, text });
        whatsappOk = true;
        await this.recordLog({ companyId, target: sent.target, text, status: 'sent', providerMessageId: sent.providerMessageId });
      } else if (!senderCompanyId && warnMissing) {
        this.logger.warn(`master_alert_${logTarget}_sem_whatsapp — defina MASTER_ALERT_WA_COMPANY_ID (empresa HBX com WhatsApp conectado)`);
      }
    } catch (error) {
      this.logger.warn(`master_alert_${logTarget}_whatsapp_falhou: ${String((error as Error)?.message || error)}`);
      await this.recordLog({ companyId, target: 'whatsapp', text, status: 'failed', errorMessage: String((error as Error)?.message || error) });
    }

    return { email: emailOk, whatsapp: whatsappOk };
  }

  // Dispara o alerta de pedido de HBX Full. Sempre resolve (best-effort).
  async notifyFullPlanRequested(input: FullPlanRequestInput): Promise<{ email: boolean; whatsapp: boolean }> {
    const companyId = Number(input.companyId || 0);
    const company = String(input.companyName || '').trim() || `empresa #${companyId}`;
    const contact = String(input.contactName || '').trim();
    const phone = String(input.contactPhone || '').trim();
    const requestedBy = String(input.requestedByEmail || '').trim();

    const linhas = [
      '🟣 HBX Full solicitado — implantação assistida',
      `Empresa: ${company}`,
      contact ? `Contato: ${contact}` : '',
      phone ? `Telefone: ${phone}` : '',
      requestedBy ? `Conta: ${requestedBy}` : '',
      '',
      'Um especialista (você) precisa entrar em contato para implantar.',
    ].filter(Boolean);
    const text = linhas.join('\n');

    // Write-through COCKPIT-MASTER: o pedido também vira evento tipado na trilha
    // única do dono (best-effort — nunca derruba o alerta nem muda o retorno).
    const payload = {
      companyName: company,
      contactName: contact || null,
      contactPhone: phone || null,
      requestedByEmail: requestedBy || null,
    };
    const eventId = await emitMasterEvent(this.prisma, {
      type: 'fullplan.requested',
      severity: 'action_required',
      companyId,
      payload,
    });

    // Sprint 3: rotea pela política (fullplan.requested = email+zap+sino,
    // throttle 0 = comportamento IDÊNTICO ao antigo deliver() direto).
    return this.routeEvent({
      id: eventId,
      type: 'fullplan.requested',
      severity: 'action_required',
      companyId,
      payload,
      subject: `HBX Full solicitado — ${company}`,
      text,
    });
  }

  // Alerta ao master quando uma venda fecha COM IMPLANTAÇÃO (setup > 0) — ele
  // precisa executar a instalação à mão, sem o vendedor mandar mensagem na mão.
  // Fonte da verdade é o card; isto é só o cutuque. Best-effort em 3 canais
  // (e-mail, WhatsApp single-shot, log p/ a janela Pagamentos do /master).
  // NUNCA bloqueia nem derruba o fechamento de quem chamou.
  async notifyImplantacaoSold(input: ImplantacaoSoldInput): Promise<{ email: boolean; whatsapp: boolean }> {
    const companyId = Number(input.companyId || 0);
    const brl = (v: number | null | undefined) =>
      v != null && Number.isFinite(v)
        ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : '—';
    const customer = String(input.customerName || '').trim() || 'cliente';
    const phone = String(input.customerPhone || '').trim();
    const seller = String(input.sellerName || '').trim();
    const planLabel = String(input.planLabel || '').trim();
    const leadId = String(input.leadId || '').trim();

    const linhas = [
      '💰 Venda fechada COM implantação — toque à mão',
      `Cliente: ${customer}`,
      phone ? `Telefone: ${phone}` : '',
      planLabel ? `Plano: ${planLabel} — mensalidade ${brl(input.monthlyValue)}` : `Mensalidade: ${brl(input.monthlyValue)}`,
      `Implantação: ${brl(input.setupValue)}`,
      seller ? `Vendedor: ${seller}` : '',
      leadId ? `Card: ${leadId}` : '',
      '',
      'A implantação precisa ser executada por você (master).',
    ].filter(Boolean);
    const text = linhas.join('\n');

    // 0) Registro SEMPRE presente no feed do master (independe de e-mail/WhatsApp):
    // é o "card de implantação a fazer" na janela Pagamentos do /master. Fonte da
    // verdade do que o master precisa tocar à mão — os canais abaixo são só o cutuque.
    await this.recordLog({ companyId, target: 'implantacao', text, status: 'sent' });

    // Write-through COCKPIT-MASTER: a venda com implantação também vira evento
    // tipado na trilha única do dono (best-effort — nunca derruba o fechamento).
    const payload = {
      customerName: customer,
      customerPhone: phone || null,
      sellerName: seller || null,
      planLabel: planLabel || null,
      monthlyValue: input.monthlyValue ?? null,
      setupValue: input.setupValue ?? null,
      leadId: leadId || null,
    };
    const eventId = await emitMasterEvent(this.prisma, {
      type: 'implantacao.sold',
      severity: 'action_required',
      companyId,
      payload,
    });

    // Sprint 3: rotea pela política (implantacao.sold = email+zap+sino,
    // throttle 0 = comportamento IDÊNTICO ao antigo deliver() direto).
    return this.routeEvent({
      id: eventId,
      type: 'implantacao.sold',
      severity: 'action_required',
      companyId,
      payload,
      subject: `Implantação vendida — ${customer}`,
      text,
    });
  }

  // Alerta ao master quando bot-módulo está habilitado para a empresa mas a
  // chave-mestra (botArmedAt) ainda não foi configurada — vendedor pediu retorno
  // automático e o fluxo não pode rodar sem a ativação.
  async notifyBotConfigMissing(input: BotConfigMissingInput): Promise<{ email: boolean; whatsapp: boolean }> {
    const companyId = Number(input.companyId || 0);
    const company = String(input.companyName || '').trim() || `empresa #${companyId}`;
    const seller = String(input.requestedByName || '').trim();
    const phone = String(input.requestedByPhone || '').trim();
    const email = String(input.requestedByEmail || '').trim();

    const linhas = [
      '⚠️ Bot IA sem chave-mestra — vendedor pediu retorno automático',
      `Empresa: ${company}`,
      seller ? `Vendedor: ${seller}` : '',
      phone ? `Telefone: ${phone}` : '',
      email ? `E-mail: ${email}` : '',
      '',
      'Ative o bot desta empresa no painel Master para liberar o retorno automático.',
    ].filter(Boolean);
    const text = linhas.join('\n');

    // Write-through COCKPIT-MASTER: a pendência também vira evento tipado na
    // trilha única do dono (best-effort — nunca derruba o pedido do vendedor).
    const payload = {
      companyName: company,
      requestedByName: seller || null,
      requestedByPhone: phone || null,
      requestedByEmail: email || null,
    };
    const eventId = await emitMasterEvent(this.prisma, {
      type: 'bot.config_missing',
      severity: 'action_required',
      companyId,
      payload,
    });

    // warnMissingChannels: false — este método nunca avisou canal ausente
    // (comportamento observável preservado no refactor). Sprint 3: rotea pela
    // política (bot.config_missing = email+zap+sino, throttle 0 = IDÊNTICO).
    return this.routeEvent({
      id: eventId,
      type: 'bot.config_missing',
      severity: 'action_required',
      companyId,
      payload,
      subject: `Bot IA sem configuração — ${company}`,
      text,
      warnMissingChannels: false,
    });
  }

  // CONTABIL S2 — alerta de obrigação fiscal. Não existe "empresa-cliente" dona
  // deste alerta (é o fisco DO PRÓPRIO dono) — reusamos MASTER_ALERT_WA_COMPANY_ID
  // (a empresa HBX já usada como remetente do WhatsApp) como companyId do log só
  // p/ satisfazer a FK de MasterPaymentNotificationLog; se a env não estiver
  // configurada, recordLog() já é try/catch (best-effort) e o log simplesmente
  // não persiste — nunca derruba o alerta em si. target prefixado "fiscal:".
  async fiscalObligationAlert(input: FiscalObligationAlertInput): Promise<{ email: boolean; whatsapp: boolean }> {
    const companyId = Number(process.env.MASTER_ALERT_WA_COMPANY_ID || 0) || 0;
    const text = String(input.texto || '').trim();
    const permitirWhatsapp = input.permitirWhatsapp !== false;

    // 0) Registro sempre presente (fonte da verdade do "o que o Contabil já avisou").
    await this.recordLog({ companyId, target: `fiscal:${input.competencia}:${input.tipo}`, text, status: 'sent' });

    let emailOk = false;
    let whatsappOk = false;

    // 1) E-mail
    try {
      const to = await this.resolveMasterEmail();
      if (to) {
        const res = await this.mail.sendMail({
          to,
          subject: `[Contabil] ${input.tipo} ${input.competencia} — ${input.estado}`,
          text,
        });
        emailOk = Boolean(res?.ok);
        await this.recordLog({
          companyId,
          target: `email:${to}`,
          text,
          status: emailOk ? 'sent' : 'failed',
          errorMessage: emailOk ? null : (res?.errorMessage || 'email não confirmado'),
        });
      } else {
        this.logger.warn('master_alert_fiscal_sem_email — defina MASTER_ALERT_EMAIL ou um usuário system_master com e-mail');
      }
    } catch (error) {
      this.logger.warn(`master_alert_fiscal_email_falhou: ${String((error as Error)?.message || error)}`);
      await this.recordLog({ companyId, target: 'email', text, status: 'failed', errorMessage: String((error as Error)?.message || error) });
    }

    // 2) WhatsApp — só se o chamador ainda não estourou o teto anti-spam do dia.
    if (permitirWhatsapp) {
      try {
        const to = this.normalizeWhatsAppTarget(process.env.MASTER_ALERT_WHATSAPP_TO || '19997024884');
        const senderCompanyId = Number(process.env.MASTER_ALERT_WA_COMPANY_ID || 0) || 0;
        if (to && senderCompanyId > 0) {
          const sent = await this.webwhats.sendText(senderCompanyId, { to, text });
          whatsappOk = true;
          await this.recordLog({ companyId, target: sent.target, text, status: 'sent', providerMessageId: sent.providerMessageId });
        } else if (!senderCompanyId) {
          this.logger.warn('master_alert_fiscal_sem_whatsapp — defina MASTER_ALERT_WA_COMPANY_ID (empresa HBX com WhatsApp conectado)');
        }
      } catch (error) {
        this.logger.warn(`master_alert_fiscal_whatsapp_falhou: ${String((error as Error)?.message || error)}`);
        await this.recordLog({ companyId, target: 'whatsapp', text, status: 'failed', errorMessage: String((error as Error)?.message || error) });
      }
    }

    return { email: emailOk, whatsapp: whatsappOk };
  }
}
