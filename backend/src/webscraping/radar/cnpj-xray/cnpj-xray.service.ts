import { Injectable, Logger } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../../prisma/prisma.service';
import { parseAndValidateCnpjBatch, type CnpjXrayInvalidRow } from './cnpj-xray-validate';
import { RadarCnpjL4EnrichmentService, type CnpjL4Result } from '../03-enrichment/radar-cnpj-l4-enrichment.service';
import { RadarMissionQueueService } from '../missions/radar-mission-queue.service';
import { LeadContactWriteService } from '../persistence/lead-contact-write.service';
import { AiContactExtractionService } from '../03-enrichment/ai-contact-extraction.service';
import { CnpjXrayAiNoteService } from './cnpj-xray-ai-note.service';
import type { LeadContactCandidate } from '../persistence/lead-contact-gate';

// ─── RAIO-X DE CNPJ EM LOTE (HOT-04, 02/07) ─────────────────────────────────────────────────────
// Cola até 10k CNPJs → 3 camadas OPCIONAIS, cada uma acumulando em cima da anterior:
//   1. cadastral (instantânea, grátis): CnpjPublicCompany local → BrasilAPI (throttle do
//      SourceBudgetService, já embutido no RadarCnpjL4EnrichmentService.lookup) → cacheia local.
//   2. vivo (fila da fábrica): materializa o CNPJ como RadarLeadPool (MESMO placeId
//      `cnpj_public:<cnpj>` da fábrica F2 — nunca duplica lead entre fábrica e raio-x) e
//      enfileira uma missão `enrich_lead` (RadarMissionQueueService — a fila JÁ existente, nenhuma
//      fila nova). O consumo em si reusa os MESMOS passos que a fábrica usa (L4 + crawl leve do
//      site + extração IA opcional + LeadContactWriteService com gate) — hoje não há um worker de
//      lease genérico pra `enrich_lead` (só a RadarFabricaService drena o que ELA MESMA
//      materializa), então este serviço processa localmente o que enfileira, marcando a missão
//      completa ao final (idempotente por dedupeKey `lead:<id>`, mesmo padrão da fábrica).
//   3. IA (opcional): nota ICP 0-100 + resumo de 1 linha via qwen2.5:7b (CnpjXrayAiNoteService).
// TRAVA LEI Nº1: nenhuma camada aqui toca fonte paga — L4/BrasilAPI é grátis; a camada vivo usa os
// MESMOS serviços gratuitos da fábrica (nenhuma chamada a brave/google_places/serper).

const MAX_CNPJS = 10_000;

export type CnpjXrayLayer = 'cadastral' | 'vivo' | 'ia';

export type CnpjXrayStartInput = {
  cnpjs: unknown[];
  layers: unknown[];
  requestedByUserId?: number | null;
};

export type CnpjXrayStartResult =
  | { started: false; reason: string }
  | { started: true; jobId: string; validCount: number; invalidCount: number };

function normalizeLayers(raw: unknown[]): CnpjXrayLayer[] {
  const allowed: CnpjXrayLayer[] = ['cadastral', 'vivo', 'ia'];
  const set = new Set(
    (Array.isArray(raw) ? raw : [])
      .map((v) => String(v || '').trim().toLowerCase())
      .filter((v): v is CnpjXrayLayer => (allowed as string[]).includes(v)),
  );
  if (!set.size) set.add('cadastral'); // camada 1 é sempre o mínimo (grátis, instantânea)
  return allowed.filter((layer) => set.has(layer));
}

/** Estimativa de custo/tempo por camada — exibida na tela ANTES de iniciar (não é medição viva). */
export function estimateCnpjXrayCost(validCount: number, layers: CnpjXrayLayer[]) {
  const n = Math.max(0, Math.trunc(validCount));
  const perLayer: Record<CnpjXrayLayer, { label: string; secondsEstimate: number; free: boolean }> = {
    cadastral: { label: 'Cadastral (local + BrasilAPI)', secondsEstimate: n * 0.05, free: true },
    vivo: { label: 'Vivo — crawl + WhatsApp-gate (fila da fábrica)', secondsEstimate: n * 3, free: true },
    ia: { label: 'IA — nota ICP + resumo (qwen2.5:7b)', secondsEstimate: n * 23, free: true },
  };
  const selected = layers.map((layer) => ({ layer, ...perLayer[layer] }));
  const totalSeconds = selected.reduce((sum, l) => sum + l.secondsEstimate, 0);
  return { perLayer: selected, totalSecondsEstimate: Math.round(totalSeconds) };
}

function normalizeCnpjDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

@Injectable()
export class CnpjXrayService {
  private readonly logger = new Logger(CnpjXrayService.name);
  private readonly l4: RadarCnpjL4EnrichmentService;
  private readonly aiExtraction = new AiContactExtractionService();
  private readonly aiNote = new CnpjXrayAiNoteService();
  private draining = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly missionQueue: RadarMissionQueueService,
    private readonly leadContactWrite: LeadContactWriteService,
  ) {
    this.l4 = new RadarCnpjL4EnrichmentService(this.leadContactWrite);
  }

  private db() {
    return this.prisma as any;
  }

  async supports(): Promise<boolean> {
    return this.prisma.hasTable('CnpjXrayJob').catch(() => false);
  }

  private storageDir(): string {
    return process.env.HBX_XRAY_STORAGE_DIR || join(process.cwd(), 'storage', 'cnpj-xray');
  }

  /** Valida + cria o job + dispara o processamento em background (a rota responde na hora). */
  async start(input: CnpjXrayStartInput): Promise<CnpjXrayStartResult> {
    if (!(await this.supports())) return { started: false, reason: 'xray_indisponivel_migration_ausente' };

    const rawLines = (Array.isArray(input.cnpjs) ? input.cnpjs : []).map((v) => String(v ?? ''));
    if (!rawLines.length) return { started: false, reason: 'lista_vazia' };
    if (rawLines.length > MAX_CNPJS) return { started: false, reason: `maximo_${MAX_CNPJS}_cnpjs` };

    const layers = normalizeLayers(input.layers);
    const { valid, invalid } = parseAndValidateCnpjBatch(rawLines, MAX_CNPJS);
    if (!valid.length) return { started: false, reason: 'nenhum_cnpj_valido' };

    const db = this.db();
    const job = await db.cnpjXrayJob.create({
      data: {
        status: 'queued',
        layers: JSON.stringify(layers),
        requestedCount: rawLines.length,
        validCount: valid.length,
        invalidCount: invalid.length,
        invalidReportJson: invalid as any,
        requestedByUserId: input.requestedByUserId ?? null,
        startedAt: new Date(),
      },
    });

    this.logger.log(`[xray] job=${job.id} start layers=${layers.join(',')} valid=${valid.length} invalid=${invalid.length}`);
    void this.runJob(job.id, valid.map((v) => v.cnpj), layers).catch((error) => {
      this.logger.warn(`[xray] job=${job.id} caiu: ${error instanceof Error ? error.message : String(error)}`);
    });

    return { started: true, jobId: job.id, validCount: valid.length, invalidCount: invalid.length };
  }

  async status(jobId: string) {
    const db = this.db();
    const job = await db.cnpjXrayJob.findUnique({ where: { id: jobId } }).catch(() => null);
    if (!job) return { found: false };
    return { found: true, job: this.presentJob(job) };
  }

  async listJobs(limit = 50) {
    if (!(await this.supports())) return { supported: false, jobs: [] };
    const db = this.db();
    const jobs = await db.cnpjXrayJob
      .findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(1, limit), 200) })
      .catch(() => []);
    return { supported: true, jobs: (jobs as any[]).map((j) => this.presentJob(j)) };
  }

  private presentJob(job: any) {
    let layers: string[] = [];
    try { layers = JSON.parse(job.layers || '[]'); } catch { layers = []; }
    return {
      id: job.id,
      status: job.status,
      layers,
      requestedCount: job.requestedCount,
      validCount: job.validCount,
      invalidCount: job.invalidCount,
      processedCount: job.processedCount,
      missionsQueued: job.missionsQueued,
      missionsDone: job.missionsDone,
      aiDone: job.aiDone,
      resultFileName: job.resultFileName || null,
      lastError: job.lastError || null,
      startedAt: job.startedAt ? new Date(job.startedAt).toISOString() : null,
      finishedAt: job.finishedAt ? new Date(job.finishedAt).toISOString() : null,
      downloadReady: Boolean(job.resultFileName && job.status === 'done'),
    };
  }

  /** Caminho do arquivo no disco (usado pelo controller pra servir o download). */
  async resolveDownloadPath(jobId: string): Promise<{ path: string; fileName: string } | null> {
    const db = this.db();
    const job = await db.cnpjXrayJob.findUnique({ where: { id: jobId }, select: { resultPath: true, resultFileName: true, status: true } }).catch(() => null);
    if (!job || job.status !== 'done' || !job.resultPath || !job.resultFileName) return null;
    return { path: job.resultPath, fileName: job.resultFileName };
  }

  // ── processamento (background) ────────────────────────────────────────────────────────────────

  private async runJob(jobId: string, cnpjs: string[], layers: CnpjXrayLayer[]): Promise<void> {
    if (this.draining.has(jobId)) return;
    this.draining.add(jobId);
    const db = this.db();
    try {
      await db.cnpjXrayJob.update({ where: { id: jobId }, data: { status: 'running_cadastral' } }).catch(() => null);

      const rows: Array<Record<string, any>> = [];
      let processedCount = 0;
      let missionsQueued = 0;
      let missionsDone = 0;
      let aiDone = 0;

      for (const cnpj of cnpjs) {
        const cadastral = await this.l4.lookup(this.prisma, cnpj).catch(() => null);
        // openedAt não faz parte do CnpjL4Result — leitura complementar SÓ-LEITURA direto na tabela
        // (não escreve, não altera CnpjPublicCompany — outro worker é dono dessa model).
        const openedAt = await db.cnpjPublicCompany
          ?.findUnique?.({ where: { cnpj }, select: { openedAt: true } })
          .catch(() => null);
        processedCount += 1;

        let leadId: string | null = null;
        let whatsappValidado = false;
        let siteVivo: string | null = cadastral?.website || null;
        let instagram: string | null = null;

        if (layers.includes('vivo') && cadastral?.found && (cadastral.phone || cadastral.website)) {
          const materialized = await this.materializeLead(cadastral, cnpj).catch(() => null);
          if (materialized) {
            leadId = materialized.id;
            missionsQueued += 1;
            await this.enqueueEnrichMission(materialized.id, cnpj);
            const enriched = await this.processVivoLayer(materialized.id).catch(() => null);
            if (enriched) {
              missionsDone += 1;
              whatsappValidado = enriched.whatsappValidado;
              siteVivo = enriched.website || siteVivo;
              instagram = enriched.instagram;
            }
          }
        }

        let notaIcp: number | null = null;
        let resumoIa: string | null = null;
        if (layers.includes('ia') && CnpjXrayAiNoteService.enabled()) {
          const noteResult = await this.aiNote.note({
            razaoSocial: cadastral?.razaoSocial || null,
            nomeFantasia: cadastral?.nomeFantasia || null,
            situacao: cadastral?.companySituation || null,
            cnaeDescription: cadastral?.cnaeDescription || null,
            porte: cadastral?.porte || null,
            city: cadastral?.city || null,
            state: cadastral?.state || null,
            hasWebsite: Boolean(siteVivo),
            hasWhatsappValidado: whatsappValidado,
            hasEmail: Boolean(cadastral?.email),
          }).catch(() => null);
          if (noteResult?.ok) {
            aiDone += 1;
            notaIcp = noteResult.notaIcp;
            resumoIa = noteResult.resumo;
          }
        }

        rows.push(this.buildRow(cnpj, cadastral, {
          whatsappValidado, site: siteVivo, instagram, notaIcp, resumoIa,
          openedAt: openedAt?.openedAt ? new Date(openedAt.openedAt).toISOString().slice(0, 10) : null,
        }));

        // checkpoint a cada 25 linhas — job sobrevive a restart com progresso visível
        if (processedCount % 25 === 0) {
          await db.cnpjXrayJob.update({
            where: { id: jobId },
            data: { processedCount, missionsQueued, missionsDone, aiDone, status: this.statusForLayers(layers) },
          }).catch(() => null);
        }
      }

      const { fileName, filePath } = await this.writeXlsx(jobId, rows);

      await db.cnpjXrayJob.update({
        where: { id: jobId },
        data: {
          status: 'done',
          processedCount,
          missionsQueued,
          missionsDone,
          aiDone,
          resultFileName: fileName,
          resultPath: filePath,
          finishedAt: new Date(),
        },
      }).catch(() => null);
      this.logger.log(`[xray] job=${jobId} concluído (${processedCount} linhas) → ${fileName}`);
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error).slice(0, 300);
      await db.cnpjXrayJob.update({
        where: { id: jobId },
        data: { status: 'error', lastError: message, finishedAt: new Date() },
      }).catch(() => null);
      this.logger.error(`[xray] job=${jobId} erro: ${message}`);
    } finally {
      this.draining.delete(jobId);
    }
  }

  private statusForLayers(layers: CnpjXrayLayer[]): string {
    if (layers.includes('ia')) return 'running_ia';
    if (layers.includes('vivo')) return 'running_vivo';
    return 'running_cadastral';
  }

  /** MESMO placeId `cnpj_public:<cnpj>` da fábrica F2 — nunca duplica lead entre fábrica e raio-x. */
  private async materializeLead(cadastral: CnpjL4Result, cnpj: string): Promise<{ id: string } | null> {
    const db = this.db();
    const placeId = `cnpj_public:${cnpj}`;
    const existing = await db.radarLeadPool.findFirst({ where: { placeId }, select: { id: true } }).catch(() => null);
    if (existing) return existing;

    const name = String(cadastral.nomeFantasia || cadastral.razaoSocial || '').trim();
    if (!name) return null;
    const phoneDigits = normalizeCnpjDigits(cadastral.phone) || null; // reaproveita o normalizador (só dígitos)
    try {
      const created = await db.radarLeadPool.create({
        data: {
          placeId,
          name,
          phone: cadastral.phone || null,
          phoneDigits: phoneDigits && phoneDigits.length >= 10 && !(await this.phoneTaken(phoneDigits)) ? phoneDigits : null,
          address: cadastral.address || null,
          city: cadastral.city || null,
          state: cadastral.state || null,
          normalizedCity: this.normalizeLookupValue(cadastral.city || ''),
          segment: cadastral.cnaeDescription || cadastral.cnae || null,
          normalizedSegment: this.normalizeLookupValue(cadastral.cnaeDescription || ''),
          website: cadastral.website || null,
          email: cadastral.email || null,
          source: 'cnpj_public',
          sourceEngine: 'cnpj_xray',
          sourceEngines: JSON.stringify(['cnpj_public']),
          metadataJson: JSON.stringify({ cnpj, xrayMaterializedAt: Date.now() }),
        },
        select: { id: true },
      });
      return created;
    } catch {
      const found = await db.radarLeadPool.findFirst({ where: { placeId }, select: { id: true } }).catch(() => null);
      return found || null;
    }
  }

  private normalizeLookupValue(value: unknown) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async phoneTaken(phoneDigits: string): Promise<boolean> {
    const found = await this.db().radarLeadPool.findFirst({ where: { phoneDigits }, select: { id: true } }).catch(() => null);
    return Boolean(found);
  }

  /** Missão `enrich_lead` idempotente (dedupeKey `lead:<id>`) — MESMA fila da fábrica, sem fila nova. */
  private async enqueueEnrichMission(leadId: string, cnpj: string): Promise<void> {
    await this.missionQueue.enqueue({
      stage: 'enrich_lead',
      payload: { radarLeadId: leadId, cnpj },
      dedupeKey: `lead:${leadId}`,
      correlationId: 'cnpj-xray',
    }).catch(() => null);
  }

  /**
   * Consumo da camada vivo: MESMOS passos da fábrica (L4 já rodou na camada 1; aqui completa
   * crawl leve do site + extração IA opcional, tudo grátis) e marca a missão completa.
   * whatsappValidado só fica true se o gate/consumo social já tiver confirmado — este lote NÃO
   * dispara L5 (whatsapp-check) diretamente (regra do dono: WhatsApp-gate roda no consumo normal
   * da fábrica/delivery, não duplicado aqui) — o campo reflete o que já existir gravado no lead.
   */
  private async processVivoLayer(leadId: string): Promise<{ whatsappValidado: boolean; website: string | null; instagram: string | null } | null> {
    const db = this.db();
    try {
      const row = await db.radarLeadPool.findUnique({
        where: { id: leadId },
        select: { id: true, name: true, website: true, email: true, phone: true, phoneDigits: true, instagramUrl: true, metadataJson: true, evidenceJson: true },
      }).catch(() => null);
      if (!row) return null;

      await this.l4.enrichRow(db, row).catch(() => null);

      if (this.aiExtractionEnabled() && row.website) {
        const sourceText = await this.fetchSiteText(row.website).catch(() => '');
        if (sourceText.trim()) {
          const result = await this.aiExtraction.extract({ leadName: row.name, sourceText }).catch(() => null);
          if (result?.ok && result.contacts.length) {
            await this.leadContactWrite.writeContacts(db, leadId, result.contacts as LeadContactCandidate[], { sourceText }).catch(() => null);
          }
        }
      }

      await this.completeEnrichMission(leadId);

      const refreshed = await db.radarLeadPool.findUnique({
        where: { id: leadId },
        select: { website: true, instagramUrl: true, phoneDigits: true },
      }).catch(() => row);
      const zapCache = refreshed?.phoneDigits
        ? await db.whatsappNumberCheckCache?.findUnique?.({ where: { phoneDigits: refreshed.phoneDigits }, select: { exists: true } }).catch(() => null)
        : null;
      return {
        whatsappValidado: Boolean(zapCache?.exists),
        website: refreshed?.website || row.website || null,
        instagram: refreshed?.instagramUrl || row.instagramUrl || null,
      };
    } catch {
      return null;
    }
  }

  private async completeEnrichMission(leadId: string): Promise<void> {
    await this.db().radarMission.updateMany({
      where: { stage: 'enrich_lead', dedupeKey: `lead:${leadId}`, status: { in: ['queued', 'leased'] } },
      data: { status: 'completed', completedAt: new Date(), leaseExpiresAt: null, lastError: null },
    }).catch(() => null);
  }

  private aiExtractionEnabled(): boolean {
    return ['true', '1', 'yes', 'on'].includes(String(process.env.HBX_AI_EXTRACTION_ENABLED || '').trim().toLowerCase());
  }

  private async fetchSiteText(website: string): Promise<string> {
    if (!website || !/^https?:\/\//i.test(website)) return '';
    try {
      const response = await fetch(website, {
        signal: AbortSignal.timeout(8000),
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; HBX-Xray/1.0)' },
      });
      if (!response.ok) return '';
      const html = await response.text();
      return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    } catch {
      return '';
    }
  }

  private buildRow(
    cnpj: string,
    cadastral: CnpjL4Result | null,
    vivo: { whatsappValidado: boolean; site: string | null; instagram: string | null; notaIcp: number | null; resumoIa: string | null; openedAt: string | null },
  ): Record<string, any> {
    const cnpjFormatted = cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    const phone = cadastral?.phone || null;
    const waLink = phone ? `https://wa.me/55${phone}` : null;
    return {
      cnpj: cnpjFormatted,
      situacao: cadastral?.companySituation || (cadastral?.found ? 'ativa' : 'nao_encontrado'),
      razaoSocial: cadastral?.razaoSocial || null,
      nomeFantasia: cadastral?.nomeFantasia || null,
      email: cadastral?.email || null,
      abertura: vivo.openedAt,
      porte: cadastral?.porte || null,
      endereco: cadastral?.address || null,
      telefone: phone,
      linkWhatsapp: waLink,
      socios: (cadastral?.ownerNames || []).join('; ') || null,
      cnae: cadastral?.cnae || null,
      cnaeDescricao: cadastral?.cnaeDescription || null,
      // NOSSAS colunas (o "humilha o deles" do plano):
      whatsappValidado: vivo.whatsappValidado ? 'sim' : 'não checado',
      site: vivo.site || null,
      instagram: vivo.instagram || null,
      notaIcp: vivo.notaIcp,
      resumoIa: vivo.resumoIa,
      seloContato: cadastral?.found && (cadastral.phone || cadastral.email || vivo.site) ? 'VIVO' : 'SEM CONTATO',
    };
  }

  private async writeXlsx(jobId: string, rows: Array<Record<string, any>>): Promise<{ fileName: string; filePath: string }> {
    const headerMap: Array<[string, string]> = [
      ['cnpj', 'CNPJ'],
      ['situacao', 'Situação'],
      ['razaoSocial', 'Razão social'],
      ['nomeFantasia', 'Nome fantasia'],
      ['email', 'E-mail'],
      ['abertura', 'Abertura'],
      ['porte', 'Porte'],
      ['endereco', 'Endereço'],
      ['telefone', 'Telefone'],
      ['linkWhatsapp', 'Link WhatsApp'],
      ['socios', 'Sócios'],
      ['cnae', 'CNAE'],
      ['cnaeDescricao', 'CNAE descrição'],
      ['whatsappValidado', 'WhatsApp validado'],
      ['site', 'Site'],
      ['instagram', 'Instagram'],
      ['notaIcp', 'Nota ICP'],
      ['resumoIa', 'Resumo IA'],
      ['seloContato', 'Selo'],
    ];
    const aoa = [
      headerMap.map(([, label]) => label),
      ...rows.map((row) => headerMap.map(([key]) => row[key] ?? '')),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Raio-X CNPJ');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const dir = this.storageDir();
    await mkdir(dir, { recursive: true });
    const fileName = `raio-x-cnpj-${jobId}.xlsx`;
    const filePath = join(dir, fileName);
    await writeFile(filePath, buffer);
    return { fileName, filePath };
  }
}
