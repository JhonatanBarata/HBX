import { Injectable, Logger } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../../prisma/prisma.service';
import { parseAndValidateCnpjBatch, type CnpjXrayInvalidRow } from './cnpj-xray-validate';

// O Raio-X do Owner e somente um exportador cadastral da base RFB ja carregada.
// Ele nao consulta rede, nao materializa RadarLeadPool, nao faz crawl/WhatsApp/IA e
// nao produz RadarMission. Enriquecimento nasce exclusivamente na saga paga de claim.

const MAX_CNPJS = 10_000;

export type CnpjXrayLayer = 'cadastral';

export type CnpjXrayStartInput = {
  cnpjs: unknown[];
  requestedByUserId?: number | null;
};

export type CnpjXrayStartResult =
  | { started: false; reason: string }
  | { started: true; jobId: string; validCount: number; invalidCount: number };

type CnpjXrayCadastralResult = {
  found: boolean;
  cnpj: string;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  companySituation: string | null;
  cnae: string | null;
  cnaeDescription: string | null;
  cnaeSecundarias: string | null;
  porte: string | null;
  matrizFilial: string | null;
  naturezaJuridica: string | null;
  capitalSocial: string | number | null;
  simples: boolean | null;
  mei: boolean | null;
  regimeTributario: string | null;
  openedAt: Date | string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  phone2: string | null;
  fax: string | null;
  email: string | null;
  ownerNames: string[];
};

/** Estimativa honesta: existe uma unica camada, leitura local cadastral. */
export function estimateCnpjXrayCost(validCount: number) {
  const n = Math.max(0, Math.trunc(validCount));
  const secondsEstimate = n * 0.05;
  return {
    perLayer: [{ layer: 'cadastral' as const, label: 'Cadastral RFB local', secondsEstimate, free: true }],
    totalSecondsEstimate: Math.round(secondsEstimate),
  };
}

@Injectable()
export class CnpjXrayService {
  private readonly logger = new Logger(CnpjXrayService.name);
  private draining = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  private db() {
    return this.prisma as any;
  }

  async supports(): Promise<boolean> {
    return this.prisma.hasTable('CnpjXrayJob').catch(() => false);
  }

  private storageDir(): string {
    return process.env.HBX_XRAY_STORAGE_DIR || join(process.cwd(), 'storage', 'cnpj-xray');
  }

  /** Valida + cria o job cadastral + dispara a exportacao em background. */
  async start(input: CnpjXrayStartInput): Promise<CnpjXrayStartResult> {
    if (!(await this.supports())) return { started: false, reason: 'xray_indisponivel_migration_ausente' };

    const rawLines = (Array.isArray(input.cnpjs) ? input.cnpjs : []).map((value) => String(value ?? ''));
    if (!rawLines.length) return { started: false, reason: 'lista_vazia' };
    if (rawLines.length > MAX_CNPJS) return { started: false, reason: `maximo_${MAX_CNPJS}_cnpjs` };

    const { valid, invalid } = parseAndValidateCnpjBatch(rawLines, MAX_CNPJS);
    if (!valid.length) return { started: false, reason: 'nenhum_cnpj_valido' };

    const job = await this.db().cnpjXrayJob.create({
      data: {
        status: 'queued',
        layers: JSON.stringify(['cadastral']),
        requestedCount: rawLines.length,
        validCount: valid.length,
        invalidCount: invalid.length,
        invalidReportJson: invalid as any,
        requestedByUserId: input.requestedByUserId ?? null,
        startedAt: new Date(),
      },
    });

    this.logger.log(`[xray] job=${job.id} start cadastral_only valid=${valid.length} invalid=${invalid.length}`);
    void this.runJob(job.id, valid.map((value) => value.cnpj)).catch((error) => {
      this.logger.warn(`[xray] job=${job.id} caiu: ${error instanceof Error ? error.message : String(error)}`);
    });

    return { started: true, jobId: job.id, validCount: valid.length, invalidCount: invalid.length };
  }

  async status(jobId: string) {
    const job = await this.db().cnpjXrayJob.findUnique({ where: { id: jobId } }).catch(() => null);
    if (!job) return { found: false };
    return { found: true, job: this.presentJob(job) };
  }

  async listJobs(limit = 50) {
    if (!(await this.supports())) return { supported: false, jobs: [] };
    const jobs = await this.db().cnpjXrayJob
      .findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(1, limit), 200) })
      .catch(() => []);
    return { supported: true, jobs: (jobs as any[]).map((job) => this.presentJob(job)) };
  }

  private presentJob(job: any) {
    return {
      id: job.id,
      status: job.status,
      layers: ['cadastral'],
      requestedCount: job.requestedCount,
      validCount: job.validCount,
      invalidCount: job.invalidCount,
      processedCount: job.processedCount,
      resultFileName: job.resultFileName || null,
      lastError: job.lastError || null,
      startedAt: job.startedAt ? new Date(job.startedAt).toISOString() : null,
      finishedAt: job.finishedAt ? new Date(job.finishedAt).toISOString() : null,
      downloadReady: Boolean(job.resultFileName && job.status === 'done'),
    };
  }

  async resolveDownloadPath(jobId: string): Promise<{ path: string; fileName: string } | null> {
    const job = await this.db().cnpjXrayJob
      .findUnique({ where: { id: jobId }, select: { resultPath: true, resultFileName: true, status: true } })
      .catch(() => null);
    if (!job || job.status !== 'done' || !job.resultPath || !job.resultFileName) return null;
    return { path: job.resultPath, fileName: job.resultFileName };
  }

  private async runJob(jobId: string, cnpjs: string[]): Promise<void> {
    if (this.draining.has(jobId)) return;
    this.draining.add(jobId);
    const db = this.db();
    try {
      await db.cnpjXrayJob.update({ where: { id: jobId }, data: { status: 'running_cadastral' } }).catch(() => null);
      const rows: Array<Record<string, any>> = [];
      let processedCount = 0;

      for (const cnpj of cnpjs) {
        const cadastral = await this.lookupLocalCadastral(cnpj).catch(() => null);
        processedCount += 1;
        rows.push(this.buildRow(cnpj, cadastral));
        if (processedCount % 25 === 0) {
          await db.cnpjXrayJob.update({
            where: { id: jobId },
            data: { processedCount, status: 'running_cadastral' },
          }).catch(() => null);
        }
      }

      const { fileName, filePath } = await this.writeXlsx(jobId, rows);
      await db.cnpjXrayJob.update({
        where: { id: jobId },
        data: {
          status: 'done',
          processedCount,
          resultFileName: fileName,
          resultPath: filePath,
          finishedAt: new Date(),
        },
      }).catch(() => null);
      this.logger.log(`[xray] job=${jobId} concluido cadastral_only (${processedCount} linhas) -> ${fileName}`);
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

  /** Somente tabelas RFB locais; nenhuma queda para BrasilAPI ou qualquer fetch. */
  private async lookupLocalCadastral(cnpj: string): Promise<CnpjXrayCadastralResult | null> {
    const db = this.db();
    const row = await db.cnpjPublicCompany?.findUnique?.({ where: { cnpj } });
    if (!row) return null;
    const partnerQuery = db.cnpjPublicPartner?.findMany?.({
      where: { cnpjBasico: cnpj.slice(0, 8) },
      select: { nome: true },
      take: 12,
    });
    const partners = partnerQuery ? await partnerQuery.catch(() => []) : [];
    const ownerNames = Array.from(new Set(
      [row.ownerName, ...(Array.isArray(partners) ? partners.map((partner: any) => partner?.nome) : [])]
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ));
    return {
      found: true,
      cnpj,
      razaoSocial: String(row.razaoSocial || '').trim() || null,
      nomeFantasia: String(row.nomeFantasia || '').trim() || null,
      companySituation: String(row.situacao || '').trim().toLowerCase() || null,
      cnae: String(row.cnae || '').trim() || null,
      cnaeDescription: String(row.cnaeDescription || '').trim() || null,
      cnaeSecundarias: String(row.cnaeSecundarias || '').trim() || null,
      porte: String(row.porte || '').trim() || null,
      matrizFilial: String(row.matrizFilial || '').trim() || null,
      naturezaJuridica: String(row.naturezaJuridica || '').trim() || null,
      capitalSocial: row.capitalSocial == null ? null : String(row.capitalSocial),
      simples: typeof row.simples === 'boolean' ? row.simples : null,
      mei: typeof row.mei === 'boolean' ? row.mei : null,
      regimeTributario: String(row.regimeTributario || '').trim() || null,
      openedAt: row.openedAt || null,
      address: String(row.address || '').trim() || null,
      city: String(row.city || '').trim() || null,
      state: String(row.state || '').trim().toUpperCase() || null,
      phone: String(row.phone || '').trim() || null,
      phone2: String(row.phone2 || '').trim() || null,
      fax: String(row.fax || '').trim() || null,
      email: String(row.email || '').trim().toLowerCase() || null,
      ownerNames,
    };
  }

  private buildRow(cnpj: string, cadastral: CnpjXrayCadastralResult | null): Record<string, any> {
    const formatted = cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    const hasContact = Boolean(cadastral?.phone || cadastral?.phone2 || cadastral?.email);
    return {
      cnpj: formatted,
      situacao: cadastral?.companySituation || (cadastral?.found ? 'ativa' : 'nao_encontrado'),
      razaoSocial: cadastral?.razaoSocial || null,
      nomeFantasia: cadastral?.nomeFantasia || null,
      email: cadastral?.email || null,
      abertura: cadastral?.openedAt ? new Date(cadastral.openedAt).toISOString().slice(0, 10) : null,
      porte: cadastral?.porte || null,
      matrizFilial: cadastral?.matrizFilial || null,
      naturezaJuridica: cadastral?.naturezaJuridica || null,
      capitalSocial: cadastral?.capitalSocial || null,
      simples: cadastral?.simples == null ? null : cadastral.simples ? 'sim' : 'nao',
      mei: cadastral?.mei == null ? null : cadastral.mei ? 'sim' : 'nao',
      regimeTributario: cadastral?.regimeTributario || null,
      endereco: cadastral?.address || null,
      cidade: cadastral?.city || null,
      uf: cadastral?.state || null,
      telefone1: cadastral?.phone || null,
      telefone2: cadastral?.phone2 || null,
      fax: cadastral?.fax || null,
      socios: (cadastral?.ownerNames || []).join('; ') || null,
      cnae: cadastral?.cnae || null,
      cnaeDescricao: cadastral?.cnaeDescription || null,
      cnaesSecundarios: cadastral?.cnaeSecundarias || null,
      seloContato: cadastral?.found ? (hasContact ? 'CADASTRAL COM CONTATO' : 'CADASTRAL SEM CONTATO') : 'NAO ENCONTRADO NA BASE LOCAL',
    };
  }

  private async writeXlsx(jobId: string, rows: Array<Record<string, any>>): Promise<{ fileName: string; filePath: string }> {
    const headerMap: Array<[string, string]> = [
      ['cnpj', 'CNPJ'],
      ['situacao', 'Situacao'],
      ['razaoSocial', 'Razao social'],
      ['nomeFantasia', 'Nome fantasia'],
      ['email', 'E-mail cadastral'],
      ['abertura', 'Abertura'],
      ['porte', 'Porte'],
      ['matrizFilial', 'Matriz/filial'],
      ['naturezaJuridica', 'Natureza juridica'],
      ['capitalSocial', 'Capital social'],
      ['simples', 'Simples'],
      ['mei', 'MEI'],
      ['regimeTributario', 'Regime tributario'],
      ['endereco', 'Endereco'],
      ['cidade', 'Cidade'],
      ['uf', 'UF'],
      ['telefone1', 'Telefone cadastral 1'],
      ['telefone2', 'Telefone cadastral 2'],
      ['fax', 'Fax cadastral'],
      ['socios', 'Socios'],
      ['cnae', 'CNAE'],
      ['cnaeDescricao', 'CNAE descricao'],
      ['cnaesSecundarios', 'CNAEs secundarios'],
      ['seloContato', 'Selo cadastral'],
    ];
    const aoa = [headerMap.map(([, label]) => label), ...rows.map((row) => headerMap.map(([key]) => row[key] ?? ''))];
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
