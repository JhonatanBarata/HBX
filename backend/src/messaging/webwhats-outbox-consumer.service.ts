import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingService } from './messaging.service';

/**
 * GATEWAY-WA S2 — consumer da OUTBOX DURÁVEL do motor Webwhats
 * (docs/PLANEJAMENTOS/GATEWAY-WA/GATEWAY-WA-sprint-2-outbox.md).
 *
 * PROBLEMA ($): hoje o evento motor→backend viaja por webhook HTTP com retry EM MEMÓRIA. Todo
 * `npm run publish` reinicia o motor e o backend e descarta retries pendentes — a mensagem não se
 * perde (fica no `webwhats_prod`), mas a REAÇÃO se perde (bot mudo, inbox parado) até o sync por
 * polling backfillar. Bot mudo em horário comercial = venda perdida sem sintoma.
 *
 * SOLUÇÃO: o motor grava cada evento numa outbox serial (EventOutbox) e expõe
 * `GET /events?cursor={lastId}&limit={n}`. Este consumer puxa a partir do último cursor persistido
 * (tabela WebwhatsEventCursor, sobrevive a restart) e reaproveita 100% o pipeline atual via
 * `MessagingService.processWebwhatsEventCore` — o MESMO miolo que o webhook usa. A idempotência de
 * ingestão (upsert por providerMessageId) absorve a dupla entrega durante a transição (o webhook
 * HTTP continua LIGADO — este consumer é aditivo).
 *
 * FLAG (default OFF): só roda se `HBX_WEBWHATS_OUTBOX_CONSUMER_ENABLED === 'true'`. Sem a flag,
 * NADA muda no publish — o webhook segue sendo o único caminho, exatamente como hoje.
 *
 * DEFENSIVO: se o motor responder 404 (endpoint /events ainda não existe), erro ou timeout
 * (motor reiniciando no deploy), o consumer LOGA e recua — NUNCA derruba o processo, NUNCA avança
 * o cursor sem sucesso. O cursor só avança para o maior id de evento PROCESSADO com sucesso.
 */
@Injectable()
export class WebwhatsOutboxConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebwhatsOutboxConsumerService.name);
  private pollHandle: NodeJS.Timeout | null = null;
  private running = false;
  private cursorLoaded = false;
  private lastCursor = 0n;

  // Nome da linha única do cursor (WebwhatsEventCursor é key-value single-row).
  private static readonly CURSOR_NAME = 'webwhats_outbox';

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  onModuleInit() {
    // Intervalo próprio, curto (default 5s, alinhado ao worker de saída existente). O tick só faz
    // trabalho quando a flag está ON — barato o suficiente para deixar armado sempre.
    const intervalMs = this.pollIntervalMs();
    this.pollHandle = setInterval(() => {
      this.tick().catch((error) => {
        this.logger.warn(`Webwhats outbox tick falhou: ${String((error as any)?.message || error)}`);
      });
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.pollHandle) clearInterval(this.pollHandle);
    this.pollHandle = null;
  }

  private isEnabled(): boolean {
    return String(process.env.HBX_WEBWHATS_OUTBOX_CONSUMER_ENABLED || '').trim().toLowerCase() === 'true';
  }

  private pollIntervalMs(): number {
    const raw = Number(process.env.HBX_WEBWHATS_OUTBOX_POLL_MS || 5000);
    return Number.isFinite(raw) ? Math.max(1000, Math.min(60000, raw)) : 5000;
  }

  private pageLimit(): number {
    const raw = Number(process.env.HBX_WEBWHATS_OUTBOX_LIMIT || 200);
    return Number.isFinite(raw) ? Math.max(1, Math.min(500, Math.trunc(raw))) : 200;
  }

  // Config do motor — MESMO padrão do webwhats-bridge.service.ts (readConfig): URL interna +
  // apikey + timeout, todos por env. Sem acoplar ao bridge (só lê as mesmas envs).
  private readMotorConfig(): { url: string; apiKey: string; timeoutMs: number } | null {
    const url = String(process.env.WHATSAPP_MODAL_INTERNAL_URL || '').trim().replace(/\/+$/, '');
    const apiKey = String(process.env.WHATSAPP_MODAL_API_KEY || '').trim();
    const timeoutRaw = Number(
      process.env.WHATSAPP_MODAL_TIMEOUT_MS || process.env.WHATSAPP_PROVIDER_TIMEOUT_MS || 12000,
    );
    const timeoutMs = Number.isFinite(timeoutRaw) ? Math.max(2000, Math.min(30000, timeoutRaw)) : 12000;
    if (!url || !apiKey) return null;
    return { url, apiKey, timeoutMs };
  }

  /**
   * Carrega o cursor persistido no primeiro tick habilitado. Falha de banco = não avança
   * (mantém 0n e loga) — na próxima rodada tenta de novo; nunca crasha.
   */
  private async loadCursor(): Promise<void> {
    if (this.cursorLoaded) return;
    try {
      const row = await (this.prisma as any).webwhatsEventCursor.findUnique({
        where: { name: WebwhatsOutboxConsumerService.CURSOR_NAME },
      });
      this.lastCursor = row?.cursor != null ? BigInt(row.cursor) : 0n;
      this.cursorLoaded = true;
    } catch (error) {
      this.logger.warn(`Webwhats outbox: falha ao carregar cursor: ${String((error as any)?.message || error)}`);
    }
  }

  private async persistCursor(cursor: bigint): Promise<void> {
    try {
      await (this.prisma as any).webwhatsEventCursor.upsert({
        where: { name: WebwhatsOutboxConsumerService.CURSOR_NAME },
        create: { name: WebwhatsOutboxConsumerService.CURSOR_NAME, cursor },
        update: { cursor },
      });
      this.lastCursor = cursor;
    } catch (error) {
      this.logger.warn(`Webwhats outbox: falha ao persistir cursor=${cursor}: ${String((error as any)?.message || error)}`);
    }
  }

  private async fetchEvents(cursor: bigint, limit: number): Promise<Array<{ id: bigint; instanceName: string | null; eventName: string | null; payload: any }> | null> {
    const config = this.readMotorConfig();
    if (!config) {
      this.logger.warn('Webwhats outbox: motor não configurado (WHATSAPP_MODAL_INTERNAL_URL/API_KEY ausentes).');
      return null;
    }
    const url = new URL('events', `${config.url}/`);
    url.searchParams.set('cursor', String(cursor));
    url.searchParams.set('limit', String(limit));
    let response;
    try {
      response = await axios.request({
        method: 'GET',
        url: url.toString(),
        timeout: config.timeoutMs,
        headers: { apikey: config.apiKey },
        validateStatus: () => true,
      });
    } catch (error) {
      // Timeout / rede / motor reiniciando: recua sem crashar.
      this.logger.warn(`Webwhats outbox: GET /events indisponível: ${String((error as any)?.message || error)}`);
      return null;
    }

    if (response.status === 404) {
      // Endpoint ainda não existe no motor (motor antigo / sprint do motor não subiu). Silencioso
      // no nível debug — esperado durante a transição.
      this.logger.debug('Webwhats outbox: GET /events respondeu 404 (endpoint ausente no motor) — recuando.');
      return null;
    }
    if (response.status < 200 || response.status >= 300) {
      this.logger.warn(`Webwhats outbox: GET /events status=${response.status} — recuando.`);
      return null;
    }

    const body = response.data;
    const rawEvents = Array.isArray(body) ? body : Array.isArray(body?.events) ? body.events : [];
    const events: Array<{ id: bigint; instanceName: string | null; eventName: string | null; payload: any }> = [];
    for (const raw of rawEvents) {
      const idRaw = raw?.id ?? raw?.cursor;
      let id: bigint;
      try {
        id = BigInt(idRaw);
      } catch {
        continue; // evento sem id serial válido — ignora (defensivo)
      }
      events.push({
        id,
        instanceName: this.normalizeString(raw?.instanceName ?? raw?.instance),
        eventName: this.normalizeString(raw?.eventName ?? raw?.event),
        payload: raw?.payload ?? raw?.data ?? raw ?? {},
      });
    }
    // Ordena por id crescente para avançar o cursor de forma monotônica.
    events.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return events;
  }

  private normalizeString(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }

  /**
   * 1 rodada: só age se a flag estiver ON e não houver outra rodada em voo. Puxa uma página de
   * eventos após o cursor e processa cada um pelo miolo do webhook, avançando o cursor por evento
   * bem-sucedido. Um evento que falhe no processamento NÃO avança o cursor (será re-tentado na
   * próxima rodada — a idempotência absorve o reprocessamento).
   */
  private async tick(): Promise<void> {
    if (!this.isEnabled()) return;
    if (this.running) return;
    this.running = true;
    try {
      await this.loadCursor();
      if (!this.cursorLoaded) return; // banco fora — tenta de novo no próximo tick

      const limit = this.pageLimit();
      const events = await this.fetchEvents(this.lastCursor, limit);
      if (!events || events.length === 0) return;

      for (const event of events) {
        try {
          await this.messaging.processWebwhatsEventCore(event.payload, {
            query: event.instanceName ? { instance: event.instanceName } : undefined,
            tenantKeyOverride: event.instanceName,
          });
        } catch (error) {
          // Falha no processamento de UM evento: para nesta página e NÃO avança além dele — o
          // próximo tick reprocessa a partir daqui (idempotência absorve). Não crasha.
          this.logger.warn(
            `Webwhats outbox: falha ao processar evento id=${event.id} instance=${event.instanceName || '(?)'} — cursor mantido: ${String((error as any)?.message || error)}`,
          );
          return;
        }
        // Avança o cursor por evento processado (mesmo em falha na página seguinte, o cursor já
        // reflete o último sucesso). Persistência best-effort.
        if (event.id > this.lastCursor) {
          await this.persistCursor(event.id);
        }
      }

      // Se a página veio cheia, provavelmente há mais — o próximo tick continua o catch-up sem
      // estourar memória (uma página por vez).
      if (events.length >= limit) {
        this.logger.debug(`Webwhats outbox: página cheia (${events.length}), catch-up continua no próximo tick.`);
      }
    } finally {
      this.running = false;
    }
  }
}
