import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RadarMissionQueueService } from '../missions/radar-mission-queue.service';
import { RadarCnpjL4EnrichmentService } from '../03-enrichment/radar-cnpj-l4-enrichment.service';
import { AiContactExtractionService } from '../03-enrichment/ai-contact-extraction.service';
import { LeadContactWriteService } from '../persistence/lead-contact-write.service';
import { isLocalRole, currentRole } from '../../source-budget/role-guard';
import type { LeadContactCandidate } from '../persistence/lead-contact-gate';

// ─── FÁBRICA DE ENRIQUECIMENTO (F2, 02/07) ──────────────────────────────────────────────────────
// A fábrica NÃO descobre nada novo: ela LÊ a lista RFB local (CnpjPublicCompany) e ENRIQUECE cada
// empresa (tel 1-3, email 1-3, insta, fb, site, sócio) — SEMPRE grátis no local (trava Lei nº1),
// SEMPRE via LeadContactWriteService (gate anti-alucinação). Cada empresa vira um lead na base
// (RadarLeadPool, placeId `cnpj_public:<cnpj>` único → start retoma sem duplicar) e ganha uma missão
// `enrich_lead` na fila S4. O drain roda no BACKEND LOCAL (pull), respeita PARAR TUDO global e o
// stopRequested da corrida, e para SOZINHO ao bater o budget.
//
// Contrato com o painel (outro worker consome — NÃO divergir):
//   GET  /modules/owner/fabrica/status
//   POST /modules/owner/fabrica/start  { budget }   (roda até N e para sozinho; sem budget recusa)
//   POST /modules/owner/fabrica/stop                 (para agora, congela com segurança)
//   GET  /modules/owner/fabrica/energia               (interruptor RadarFactoryCursor.enabled)
//   POST /modules/owner/fabrica/energia { on }        (liga/desliga; relê do banco antes de responder)
//
// ENERGIA (E1, 28/07) — o "anti-26-dias": RadarFactoryCursor.enabled é o PARAR TUDO global lido por
// RadarMissionQueueService.isQueuePaused (e por globalPaused() aqui embaixo), mas NENHUM writer
// existia pra essa coluna — só religava por UPDATE manual no banco. energiaStatus/setEnergia dão
// o interruptor que faltava.

const RUN_KEY = 'main';
const MAX_BUDGET = 5000; // teto de sanidade por corrida (env pode reduzir, nunca é surpresa)

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLookupValue(value: unknown) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeCnpj(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePhoneDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

export type FabricaStatus = {
  supported: boolean;
  unavailableReason: string | null;
  running: boolean;
  stopRequested: boolean;
  budget: number;
  processed: number;
  materialized: number;
  contactsWritten: number;
  /** DEVE ser 0 no local — prova viva de R$0. */
  paidAttempts: number;
  remaining: number;
  lastLeadId: string | null;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** total de empresas na lista RFB local disponível pra enriquecer. */
  rfbBaseCount: number;
  role: string;
  /** true = trava anti-pago ativa (localhost). No local espera-se SEMPRE true. */
  paidLocked: boolean;
  queue: unknown;
};

@Injectable()
export class RadarFabricaService {
  private readonly logger = new Logger(RadarFabricaService.name);
  private draining = false;
  private rfbScanOffset = 0;
  // Cache do total da base RFB pro /fabrica/status. O painel :3107 faz polling a cada 10s; um
  // COUNT(*) exato em CnpjPublicCompany (28M linhas) é seq scan de ~5min — sem cache eles
  // empilhavam e entupiam o pool do Prisma (limit 10), derrubando o app inteiro com 500 (P2024).
  // Nunca contar a base ao vivo neste caminho de polling.
  private rfbBaseCountCache: { value: number; expiresAt: number } | null = null;
  // L4 e extração IA são instanciados na mão (não são providers NestJS — mesmo padrão do
  // getCnpjL4Enrichment lazy do core). O gravador único (com gate) é injetado no L4 pra manter
  // a proveniência/telemetria unificada.
  private readonly l4: RadarCnpjL4EnrichmentService;
  private readonly aiExtraction = new AiContactExtractionService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly missionQueue: RadarMissionQueueService,
    private readonly leadContactWrite: LeadContactWriteService,
  ) {
    this.l4 = new RadarCnpjL4EnrichmentService(this.leadContactWrite);
  }

  private async availability(): Promise<{ supported: true } | { supported: false; reason: string }> {
    if (!this.prisma.radarFabricaRun?.upsert || !this.prisma.radarFactoryCursor?.upsert) {
      return { supported: false, reason: 'prisma_client_desatualizado' };
    }
    const requiredTables = ['RadarFabricaRun', 'RadarFactoryCursor', 'RadarMission', 'RadarLeadPool', 'LeadContact', 'CnpjPublicCompany'];
    const tableChecks = await Promise.all(requiredTables.map(async (table) => ({
      table,
      present: await this.prisma.hasTable(table),
    })));
    const missing = tableChecks.filter((check) => !check.present).map((check) => check.table);
    return missing.length
      ? { supported: false, reason: `migration_ausente:${missing.join(',')}` }
      : { supported: true };
  }

  /** Linha única da corrida (cria dormente se faltar). */
  private getOrCreateRun() {
    return this.prisma.radarFabricaRun.upsert({
      where: { key: RUN_KEY },
      create: { key: RUN_KEY },
      update: {},
    });
  }

  /** PARAR TUDO global (RadarFactoryCursor.enabled) — a fábrica respeita o mesmo interruptor da fila. */
  private async globalPaused(): Promise<boolean> {
    return this.missionQueue.isQueuePaused().catch(() => true);
  }

  /**
   * Total da base RFB para o cockpit — SEM varrer CnpjPublicCompany (28M). Fonte 1: CnpjBaseStats
   * (número exato gravado na última carga mensal, poucas linhas). Fonte 2 (fallback): reltuples do
   * planejador (estimativa O(1)). Cache de 5min porque o número só muda na carga. Este é o mesmo
   * padrão já usado em CnpjBaseQueryService.countBase — aqui não pode ser um count() ao vivo porque
   * o /fabrica/status é polado a cada 10s pelo painel :3107.
   */
  private async rfbBaseCountCheap(): Promise<number> {
    const now = Date.now();
    if (this.rfbBaseCountCache && this.rfbBaseCountCache.expiresAt > now) {
      return this.rfbBaseCountCache.value;
    }
    let count = 0;
    try {
      if (await this.prisma.hasTable('CnpjBaseStats').catch(() => false)) {
        const stats = await (this.prisma as any).cnpjBaseStats?.aggregate?.({
          where: { group: 'situacao' },
          _sum: { count: true },
        });
        const n = Number(stats?._sum?.count);
        if (Number.isFinite(n) && n > 0) count = Math.trunc(n);
      }
    } catch { /* cai no fallback do planejador */ }
    if (!count) {
      try {
        const rows = await this.prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(
          `SELECT reltuples::bigint AS n FROM pg_class WHERE relname = 'CnpjPublicCompany'`,
        );
        const n = Number(rows?.[0]?.n);
        if (Number.isFinite(n) && n > 0) count = Math.trunc(n);
      } catch { /* fica 0 — nunca varre a base pra descobrir o total */ }
    }
    this.rfbBaseCountCache = { value: count, expiresAt: now + 5 * 60_000 };
    return count;
  }

  async status(): Promise<FabricaStatus> {
    const role = currentRole();
    const paidLocked = isLocalRole();
    const availability = await this.availability();
    const supported = availability.supported;
    const [run, rfbBaseCount, queue] = await Promise.all([
      supported ? this.getOrCreateRun() : Promise.resolve(null),
      supported ? this.rfbBaseCountCheap() : Promise.resolve(0),
      this.missionQueue.stats().catch(() => null),
    ]);
    const budget = Number(run?.budget || 0);
    const processed = Number(run?.processed || 0);
    return {
      supported,
      unavailableReason: availability.supported === false ? availability.reason : null,
      running: Boolean(run?.running),
      stopRequested: Boolean(run?.stopRequested),
      budget,
      processed,
      materialized: Number(run?.materialized || 0),
      contactsWritten: Number(run?.contactsWritten || 0),
      paidAttempts: Number(run?.paidAttempts || 0),
      remaining: Math.max(0, budget - processed),
      lastLeadId: run?.lastLeadId || null,
      lastError: run?.lastError || null,
      startedAt: run?.startedAt ? new Date(run.startedAt).toISOString() : null,
      finishedAt: run?.finishedAt ? new Date(run.finishedAt).toISOString() : null,
      rfbBaseCount: Number(rfbBaseCount || 0),
      role,
      paidLocked,
      queue,
    };
  }

  /**
   * Inicia uma corrida de N leads. SEM budget válido → RECUSA (contrato do painel). Idempotente:
   * corrida já rodando → devolve o estado atual sem duplicar. O drain roda em background (pull) e
   * para sozinho ao bater o budget / no stop / no PARAR TUDO global.
   */
  async start(input: { budget?: number } = {}): Promise<
    | { started: false; reason: string; status?: FabricaStatus }
    | { started: true; status: FabricaStatus }
  > {
    const availability = await this.availability();
    if (availability.supported === false) return { started: false, reason: availability.reason };

    const budget = Math.trunc(Number(input?.budget));
    if (!Number.isFinite(budget) || budget <= 0) {
      return { started: false, reason: 'budget_obrigatorio' };
    }
    const cappedBudget = Math.min(budget, MAX_BUDGET);

    const run = await this.getOrCreateRun();
    if (run?.running) {
      return { started: false, reason: 'ja_rodando', status: await this.status() };
    }

    this.rfbScanOffset = 0;
    // reset da corrida: zera contadores, define budget, arma running. paidAttempts SEMPRE zera —
    // é a prova de R$0 desta corrida.
    await this.prisma.radarFabricaRun.update({
      where: { key: RUN_KEY },
      data: {
        running: true,
        stopRequested: false,
        budget: cappedBudget,
        processed: 0,
        materialized: 0,
        contactsWritten: 0,
        paidAttempts: 0,
        lastError: null,
        startedAt: new Date(),
        finishedAt: null,
      },
    });

    this.logger.log(`[fabrica] START budget=${cappedBudget} role=${currentRole() || '(local)'} paidLocked=${isLocalRole()}`);
    // drain em background — o start responde na hora, o trabalho corre depois (pull, sem bloquear a rota).
    void this.drainLoop().catch((error) => {
      this.logger.warn(`[fabrica] drain caiu: ${error instanceof Error ? error.message : String(error)}`);
    });
    return { started: true, status: await this.status() };
  }

  /** PARE AGORA: marca stopRequested; o drain sai no próximo checkpoint e congela com segurança. */
  async stop(): Promise<{ stopped: boolean; status?: FabricaStatus }> {
    const availability = await this.availability();
    if (!availability.supported) return { stopped: false };
    await this.prisma.radarFabricaRun.updateMany({
      where: { key: RUN_KEY },
      data: { stopRequested: true },
    });
    this.logger.log('[fabrica] STOP solicitado — congelando no próximo checkpoint.');
    return { stopped: true, status: await this.status() };
  }

  /**
   * Estado do interruptor de energia (RadarFactoryCursor.enabled) pro painel. Reaproveita a mesma
   * availability() dos irmãos status/start/stop — se a fábrica não está montada (migration ausente),
   * a energia também não está.
   */
  async energiaStatus(): Promise<{ supported: boolean; enabled: boolean; forcedOn: boolean; key: string; unavailableReason: string | null }> {
    const availability = await this.availability();
    if (availability.supported === false) {
      // Sem tabela não dá pra saber o valor real — default do schema é enabled:true, não mentimos "desligado".
      return { supported: false, enabled: true, forcedOn: false, key: RUN_KEY, unavailableReason: availability.reason };
    }
    const cursor = await this.prisma.radarFactoryCursor
      .upsert({ where: { key: RUN_KEY }, create: { key: RUN_KEY }, update: {}, select: { enabled: true, forcedOn: true } })
      .catch(() => null);
    return {
      supported: true,
      enabled: cursor ? cursor.enabled === true : true,
      forcedOn: Boolean(cursor?.forcedOn),
      key: RUN_KEY,
      unavailableReason: null,
    };
  }

  /**
   * Liga/desliga a fábrica (RadarFactoryCursor.enabled) — o interruptor que faltava e travou a
   * fábrica por 26 dias (só religava por UPDATE manual). `on` inválido ou tabela ausente NUNCA
   * lança/500: devolve ok:false com o motivo, é o painel quem decide o que mostrar.
   * Verdade verificada (lei nº3): grava e RELÊ do banco antes de responder — nunca ecoa a intenção
   * de quem chamou, porque um upsert concorrente ou um trigger podem deixar o valor diferente.
   */
  async setEnergia(on: unknown): Promise<{ ok: boolean; enabled: boolean; changed: boolean; reason: string | null }> {
    const availability = await this.availability();
    if (availability.supported === false) {
      return { ok: false, enabled: true, changed: false, reason: availability.reason };
    }
    if (typeof on !== 'boolean') {
      const current = await this.energiaStatus();
      return { ok: false, enabled: current.enabled, changed: false, reason: 'on_invalido' };
    }

    const before = await this.prisma.radarFactoryCursor
      .findUnique({ where: { key: RUN_KEY }, select: { enabled: true } })
      .catch(() => null);
    const wasEnabled = before ? before.enabled === true : true; // linha ainda não existe → default do schema é true

    await this.prisma.radarFactoryCursor.upsert({
      where: { key: RUN_KEY },
      create: { key: RUN_KEY, enabled: on },
      update: { enabled: on },
    });

    // Relê — nunca ecoa `on` direto (lei nº3: verdade verificada).
    const after = await this.prisma.radarFactoryCursor
      .findUnique({ where: { key: RUN_KEY }, select: { enabled: true } })
      .catch(() => null);
    const enabledNow = after ? after.enabled === true : on;

    this.logger.log(`[fabrica] ENERGIA ${enabledNow ? 'LIGADA' : 'DESLIGADA'} (key=${RUN_KEY}).`);
    return { ok: true, enabled: enabledNow, changed: enabledNow !== wasEnabled, reason: null };
  }

  /** Deve continuar? Sai por: stop pedido, budget batido ou PARAR TUDO global. */
  private async shouldContinue(): Promise<{ go: boolean; reason?: string }> {
    const run = await this.prisma.radarFabricaRun.findUnique({ where: { key: RUN_KEY } }).catch(() => null);
    if (!run || !run.running) return { go: false, reason: 'parada' };
    if (run.stopRequested) return { go: false, reason: 'stop_solicitado' };
    if (Number(run.processed || 0) >= Number(run.budget || 0)) return { go: false, reason: 'budget_atingido' };
    if (await this.globalPaused()) return { go: false, reason: 'parar_tudo_global' };
    return { go: true };
  }

  /**
   * ANTI-26-DIAS: antes o motivo do fim só ia pro `this.logger` — a tela ficava muda e ninguém via
   * que a fábrica tinha parado (foi exatamente isso que travou por 26 dias). Agora `reason` também
   * vira `lastError`, que já é exposto em status().
   * Fim saudável (`budget_atingido`) limpa lastError — MAS só se a corrida terminou limpa: se já
   * existe um lastError gravado por falha real de lead (processEnrichMissionForLead), esse erro
   * NÃO pode ser apagado só porque o budget também bateu no mesmo instante. Por isso lê o run ANTES
   * de decidir, em vez de zerar cego.
   */
  private async finishRun(reason: string) {
    const run = await this.prisma.radarFabricaRun.findUnique({ where: { key: RUN_KEY } }).catch(() => null);
    const isHealthyEnd = reason === 'budget_atingido';
    const lastError = isHealthyEnd ? (run?.lastError || null) : reason.slice(0, 300);
    await this.prisma.radarFabricaRun
      .updateMany({ where: { key: RUN_KEY }, data: { running: false, finishedAt: new Date(), lastError } })
      .catch(() => null);
    this.logger.log(`[fabrica] corrida encerrada (${reason}).`);
  }

  /**
   * Laço de dreno (self-paced): materializa a próxima empresa RFB → cria missão `enrich_lead` →
   * consome (enriquece grátis) → conta. Um lead por vez (IA local é sequencial; sem falsa
   * concorrência). Reentrância protegida por `draining`.
   */
  private async drainLoop(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      for (;;) {
        const gate = await this.shouldContinue();
        if (!gate.go) {
          await this.finishRun(gate.reason || 'parada');
          return;
        }
        const lead = await this.materializeNextLead();
        if (!lead) {
          await this.finishRun('rfb_esgotada');
          return;
        }
        await this.enqueueEnrichMission(lead.id, lead.cnpj);
        await this.processEnrichMissionForLead(lead.id);
      }
    } finally {
      this.draining = false;
    }
  }

  /**
   * Pega a próxima empresa da lista RFB local que ainda não virou lead e MATERIALIZA como
   * RadarLeadPool (placeId `cnpj_public:<cnpj>` único → nunca duplica; start retoma de onde parou).
   * Devolve o lead já existente OU o recém-criado. null = RFB esgotada.
   */
  private async materializeNextLead(): Promise<{ id: string; cnpj: string; name: string } | null> {
    const db = this.prisma;
    // Varre a RFB inteira em ordem estável e pula quem já tem lead (placeId materializado).
    // Não use teto fixo no skip: uma corrida de 5.000 precisa alcançar registros além dos 2.000
    // primeiros já materializados, inclusive ao retomar depois de corridas anteriores.
    const pageSize = 50;
    for (;;) {
      const companies = await db.cnpjPublicCompany
        .findMany({ orderBy: { cnpj: 'asc' }, skip: this.rfbScanOffset, take: pageSize })
        .catch(() => []);
      if (!companies.length) return null;
      for (const company of companies) {
        this.rfbScanOffset += 1;
        const cnpj = normalizeCnpj(company.cnpj);
        if (cnpj.length < 14) continue;
        const placeId = `cnpj_public:${cnpj}`;
        const existing = await db.radarLeadPool
          .findFirst({ where: { placeId }, select: { id: true, name: true } })
          .catch(() => null);
        if (existing) {
          // Já materializado. Só re-enriquece nesta corrida se ainda não foi processado por ela —
          // aqui simplificamos: pula materializados (evita reprocessar a mesma empresa na corrida).
          continue;
        }
        const created = await this.createLeadFromCnpjRow(company, placeId);
        if (created) {
          await db.radarFabricaRun
            .updateMany({ where: { key: RUN_KEY }, data: { materialized: { increment: 1 } } })
            .catch(() => null);
          return { id: created.id, cnpj, name: created.name };
        }
      }
    }
    return null;
  }

  /** Cria a linha RadarLeadPool mínima a partir do registro RFB (mesmo shape do cnpj_public provider). */
  private async createLeadFromCnpjRow(company: any, placeId: string): Promise<{ id: string; name: string } | null> {
    const db = this.prisma;
    const name = String(company.nomeFantasia || company.razaoSocial || '').trim();
    if (!name) return null;
    const cnpj = normalizeCnpj(company.cnpj);
    const phoneDigits = normalizePhoneDigits(company.phoneDigits || company.phone) || null;
    const city = company.city || null;
    const segment = company.cnaeDescription || company.cnae || null;
    try {
      const created = await db.radarLeadPool.create({
        data: {
          placeId,
          name,
          phone: company.phone || phoneDigits || null,
          // phoneDigits é @unique — só grava se não colidir com outro lead
          phoneDigits: phoneDigits && !(await this.phoneTaken(phoneDigits)) ? phoneDigits : null,
          address: company.address || null,
          city,
          state: company.state || null,
          normalizedCity: normalizeLookupValue(city || company.normalizedCity || ''),
          segment,
          normalizedSegment: normalizeLookupValue(segment || ''),
          website: company.website || null,
          email: company.email || null,
          source: 'cnpj_public',
          sourceEngine: 'fabrica_enriquecimento',
          sourceEngines: JSON.stringify(['cnpj_public']),
          // SÓ o CNPJ vai no metadataJson na materialização — razão/CNAE/situação ficam pro L4
          // PREENCHER (o enrichRow do L4 retorna cedo se já achar tudo, e nesse early-return NÃO
          // escreve o LeadContact). Deixar o L4 fazer o trabalho completo = contato oficial gravado.
          metadataJson: JSON.stringify({ cnpj, fabricaMaterializedAt: Date.now() }),
        },
        select: { id: true, name: true },
      });
      return created;
    } catch {
      // corrida no placeId único (outro drain) → devolve o existente
      const existing = await db.radarLeadPool.findFirst({ where: { placeId }, select: { id: true, name: true } }).catch(() => null);
      return existing || null;
    }
  }

  private async phoneTaken(phoneDigits: string): Promise<boolean> {
    const found = await this.prisma.radarLeadPool
      .findFirst({ where: { phoneDigits }, select: { id: true } })
      .catch(() => null);
    return Boolean(found);
  }

  /** Missão idempotente `enrich_lead` por lead (dedupeKey `lead:<id>`). */
  private async enqueueEnrichMission(leadId: string, cnpj: string): Promise<void> {
    await this.missionQueue.enqueue({
      stage: 'enrich_lead',
      payload: { radarLeadId: leadId, cnpj },
      dedupeKey: `lead:${leadId}`,
      correlationId: 'fabrica',
    }).catch(() => null);
  }

  /**
   * Enriquecimento GRÁTIS de um lead (o "consumo" da missão `enrich_lead`), tudo pelo gravador
   * único com gate:
   *   1. L4 cofre CNPJ (dataset local + BrasilAPI grátis) → razão/CNAE/sócio + tel/email oficiais.
   *   2. Crawl leve do site (se houver) → texto pra extração.
   *   3. Extração IA 30B local (flag HBX_AI_EXTRACTION_ENABLED) → tel/email/sócio literais na fonte.
   * NENHUMA fonte paga é tocada no local (trava Lei nº1). paidAttempts fica 0 = prova de R$0.
   */
  private async processEnrichMissionForLead(leadId: string): Promise<void> {
    const db = this.prisma;
    let contactsWritten = 0;
    try {
      // CNPJ NÃO é coluna de RadarLeadPool — o L4 lê de metadataJson/evidenceJson. Selecionar um
      // campo inexistente fazia o findUnique lançar → row=null → return cedo SEM contar (bug do 1º run).
      const row = await db.radarLeadPool.findUnique({
        where: { id: leadId },
        select: { id: true, name: true, website: true, email: true, phone: true, phoneDigits: true, address: true, metadataJson: true, evidenceJson: true },
      }).catch(() => null);
      // lead sumiu (não deveria) — conta como processado mesmo assim pra o budget SEMPRE avançar
      // (nunca re-loopar o mesmo id pra sempre).
      if (!row) {
        await db.radarFabricaRun.updateMany({ where: { key: RUN_KEY }, data: { processed: { increment: 1 }, lastLeadId: leadId } }).catch(() => null);
        return;
      }

      const before = await this.countLeadContacts(leadId);

      // 1a) Contato OFICIAL direto da linha RFB (tel/email do cadastro) — grava pelo gravador único
      // com gate, independente das guardas internas do L4. Registro público = confiança alta (85).
      const rfbContacts: LeadContactCandidate[] = [
        ...(row.phone || row.phoneDigits ? [{ kind: 'phone' as const, value: String(row.phone || row.phoneDigits), source: 'cnpj_public', confidence: 85 }] : []),
        ...(row.email ? [{ kind: 'email' as const, value: String(row.email), source: 'cnpj_public', confidence: 85 }] : []),
      ];
      if (rfbContacts.length) {
        await this.leadContactWrite.writeContacts(db, leadId, rfbContacts).catch(() => null);
      }

      // 1b) L4 cofre CNPJ (grátis) — completa razão/CNAE/sócio no metadataJson e grava
      // LeadContact source='cnpj_l4' via gate (dataset local + BrasilAPI grátis).
      await this.l4.enrichRow(db, row).catch(() => null);
      const afterL4 = await this.countLeadContacts(leadId);
      contactsWritten += Math.max(0, afterL4 - before);

      // 2 + 3) site → texto → extração IA 30B local (gate literal-na-fonte).
      if (this.aiExtractionEnabled()) {
        const sourceText = await this.fetchSiteText(row).catch(() => '');
        if (sourceText.trim()) {
          const result = await this.aiExtraction.extract({ leadName: row.name, sourceText }).catch(() => null);
          if (result?.ok && result.contacts.length) {
            const written = await this.leadContactWrite
              .writeContacts(db, leadId, result.contacts as LeadContactCandidate[], { sourceText })
              .catch(() => ({ written: 0 }));
            contactsWritten += Number((written as any)?.written || 0);
          }
          if (result?.ownerName) {
            const meta = this.parseJson(row.metadataJson);
            await db.radarLeadPool.update({
              where: { id: leadId },
              data: { metadataJson: JSON.stringify({ ...meta, aiOwnerName: result.ownerName, aiExtractionAt: Date.now() }) },
            }).catch(() => null);
          }
        }
      }

      // completa a missão da fila (idempotente pelo dedupeKey; sem lease aqui = leasing é da PONTE,
      // mas no local o backend é o próprio consumidor → marca completa por dedupe).
      await this.completeEnrichMission(leadId, contactsWritten);

      await db.radarFabricaRun.updateMany({
        where: { key: RUN_KEY },
        data: {
          processed: { increment: 1 },
          contactsWritten: { increment: contactsWritten },
          lastLeadId: leadId,
        },
      }).catch(() => null);
    } catch (error) {
      await db.radarFabricaRun.updateMany({
        where: { key: RUN_KEY },
        data: { processed: { increment: 1 }, lastError: String(error instanceof Error ? error.message : error).slice(0, 300) },
      }).catch(() => null);
    }
  }

  /** Marca a missão `enrich_lead` do lead como completa (pelo dedupeKey — consumo local direto). */
  private async completeEnrichMission(leadId: string, contactsWritten: number): Promise<void> {
    const db = this.prisma;
    await db.radarMission.updateMany({
      where: { stage: 'enrich_lead', dedupeKey: `lead:${leadId}`, status: { in: ['queued', 'leased'] } },
      data: { status: 'completed', completedAt: new Date(), resultJson: { contactsWritten } as any, leaseExpiresAt: null, lastError: null },
    }).catch(() => null);
  }

  private aiExtractionEnabled(): boolean {
    return ['true', '1', 'yes', 'on'].includes(String(process.env.HBX_AI_EXTRACTION_ENABLED || '').trim().toLowerCase());
  }

  private async countLeadContacts(leadId: string): Promise<number> {
    return this.prisma.leadContact.count({ where: { radarLeadId: leadId } }).catch(() => 0);
  }

  private parseJson(value: unknown): Record<string, any> {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
    try {
      const parsed = JSON.parse(String(value));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  /** Busca o texto do site do lead pra alimentar a extração IA. Grátis (fetch direto, IP residencial). */
  private async fetchSiteText(row: any): Promise<string> {
    const website = String(row?.website || '').trim();
    if (!website || !/^https?:\/\//i.test(website)) return '';
    try {
      const response = await fetch(website, {
        signal: AbortSignal.timeout(8000),
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; HBX-Fabrica/1.0)' },
      });
      if (!response.ok) return '';
      const html = await response.text();
      // texto plano bruto (o gate literal-na-fonte tolera separadores; extração cap em MAX_SOURCE_CHARS)
      return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    } catch {
      return '';
    }
  }
}
