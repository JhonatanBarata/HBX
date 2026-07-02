import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parseJsonArray } from '../radar/shared/radar-core-shared';

/**
 * RadarTreeStatusService — F3 (02/07, docs/PLANEJAMENTOS/PR02072026/F3-3107-arvore-viva.md).
 *
 * Agregador READ-ONLY que alimenta a aba "Árvore do motor" do :3107 — a MESMA grade do desenho
 * `docs/PLANEJAMENTOS/ARVORE-MESTRA/pesquisa-vps.svg`, com números reais. NÃO participa do
 * pipeline de busca/enriquecimento; só LÊ o que já existe.
 *
 * Isolado de propósito num arquivo/serviço NOVO (fora dos mixins do radar core): o F0 paralelo
 * está demolindo `radar-core-factory-admin.mixin.ts`/`radar-core-mass-data.mixin.ts`/
 * `radar-core-campaign-planner.mixin.ts` (fábrica de descoberta antiga) — este serviço não
 * depende de nenhum deles, só de `PrismaService` + `parseJsonArray` (helper genérico que fica).
 *
 * Contrato de resiliência: CADA bloco é lido em isolamento (try/catch próprio). Bloco que falha
 * vira `{ error: string }` — nunca derruba os outros blocos nem a resposta inteira. O controller
 * (`MasterWebscrapingController`) cacheia o resultado por 10s (ver `tree-status` na rota).
 */

// Mesma régua de "hoje" usada no resto do motor (radar-core-factory-admin.mixin.ts,
// getSaoPauloDayRange): fuso America/Sao_Paulo fixo (-03:00, sem DST) — não é UTC puro nem o
// fuso do processo. Reimplementada aqui (não importada do mixin) porque é `private` lá E porque
// aquele mixin está na lista de demolição do F0 — este serviço não pode depender dele.
function saoPauloDayRange(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const start = new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00-03:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60_000);
  return { start, end };
}

// Mesma tabela de lanes do `buildRadarLeadSourceChain` (radar-core-presentation.mixin.ts, P1
// 02/07) — duplicada de propósito (é `private` lá) pra classificar sourceEngines em rfb/web sem
// acoplar a este serviço num mixin que pode mudar de forma independente.
const SOURCE_LANE: Record<string, 'rfb' | 'web'> = {
  cnpj_public: 'rfb',
  cnpj_public_stub: 'rfb',
  hbx_engine: 'web',
  hbx: 'web',
  google_textual: 'web',
  website_crawl_light: 'web',
  radar_web_enrichment: 'web',
  local_directory: 'web',
  local_directories_stub: 'web',
  vertical_source: 'web',
};

function sourceChainOf(sourceEngines: string[], fallbackSource?: string | null): string | null {
  const engines = sourceEngines.length ? sourceEngines : [fallbackSource].filter(Boolean) as string[];
  const lanes = new Set<'rfb' | 'web'>();
  for (const engine of engines) {
    const lane = SOURCE_LANE[String(engine || '').trim()];
    if (lane) lanes.add(lane);
  }
  if (!lanes.size) return null;
  const ordered: string[] = [];
  if (lanes.has('rfb')) ordered.push('rfb');
  if (lanes.has('web')) ordered.push('web');
  return ordered.join('+');
}

function truthyEnv(name: string): boolean {
  return ['1', 'true', 'on', 'yes', 'sim'].includes(String(process.env[name] || '').trim().toLowerCase());
}

export type RadarTreeStatusBlock<T> = { ok: true; data: T } | { ok: false; error: string };

@Injectable()
export class RadarTreeStatusService {
  constructor(private readonly prisma: PrismaService) {}

  // NOTA: só engole "tabela ausente" (worktree sem migration/coluna nova) — erro de VERDADE
  // (conexão caiu, query malformada) propaga pro `wrap()` do bloco, que é quem decide virar
  // `{ ok:false, error }`. Engolir tudo aqui esconderia falha real atrás de um "0" mentiroso.
  private async safeCount(delegateName: string, tableName: string, where?: any): Promise<number> {
    if (!(this.prisma as any)[delegateName]?.count) return 0;
    if (!(await this.prisma.hasTable(tableName).catch(() => false))) return 0;
    return (this.prisma as any)[delegateName].count(where ? { where } : undefined);
  }

  /** seed: buscas (runs) de HOJE — 1 run = 1 clique em "buscar" do vendedor. */
  private async readSeed(todayStart: Date, todayEnd: Date) {
    const runsToday = await this.safeCount('webscrapingSearchRun', 'WebscrapingSearchRun', {
      createdAt: { gte: todayStart, lt: todayEnd },
    });
    return { runsToday };
  }

  /** rfb: tamanho do extrato local + flag que liga a fonte no caminho do cliente. */
  private async readRfb() {
    const totalCompanies = await this.safeCount('cnpjPublicCompany', 'CnpjPublicCompany');
    return {
      totalCompanies,
      enabled: truthyEnv('HBX_RADAR_CNPJ_PUBLIC_ENABLED'),
    };
  }

  /** gates: aceitos x rejeitados hoje. NÃO existe log porta-a-porta ainda (item aberto no plano
   *  02/07) — aproxima via WebscrapingSearchRunItem (found=aceito, skipped/invalid=rejeitado). */
  private async readGates(todayStart: Date, todayEnd: Date) {
    const [accepted, rejected] = await Promise.all([
      this.safeCount('webscrapingSearchRunItem', 'WebscrapingSearchRunItem', {
        status: 'found',
        createdAt: { gte: todayStart, lt: todayEnd },
      }),
      this.safeCount('webscrapingSearchRunItem', 'WebscrapingSearchRunItem', {
        status: { in: ['skipped', 'invalid'] },
        createdAt: { gte: todayStart, lt: todayEnd },
      }),
    ]);
    return {
      accepted,
      rejected,
      approx: true,
      note: 'aproximado via WebscrapingSearchRunItem — log porta-a-porta da Receita ainda não existe (item aberto do plano 02/07)',
    };
  }

  /** fusion: % de cards de hoje com 2+ fontes em sourceEngines. */
  private async readFusion(todayStart: Date, todayEnd: Date) {
    if (!(await this.prisma.hasTable('RadarLeadPool').catch(() => false))) {
      return { cardsToday: 0, fusedToday: 0, fusionPct: 0 };
    }
    const rows = await (this.prisma as any).radarLeadPool.findMany({
      where: { createdAt: { gte: todayStart, lt: todayEnd } },
      select: { sourceEngines: true },
      take: 5000,
    });
    const cardsToday = rows.length;
    const fusedToday = rows.filter((row: any) => parseJsonArray(row?.sourceEngines).length >= 2).length;
    return {
      cardsToday,
      fusedToday,
      fusionPct: cardsToday > 0 ? Math.round((fusedToday / cardsToday) * 1000) / 10 : 0,
    };
  }

  /** enrich: fill-rate email/instagram/sócio do pool de hoje. */
  private async readEnrich(todayStart: Date, todayEnd: Date) {
    const dateWhere = { createdAt: { gte: todayStart, lt: todayEnd } };
    const [cardsToday, withEmail, withInstagram] = await Promise.all([
      this.safeCount('radarLeadPool', 'RadarLeadPool', dateWhere),
      this.safeCount('radarLeadPool', 'RadarLeadPool', { ...dateWhere, email: { not: null } }),
      this.safeCount('radarLeadPool', 'RadarLeadPool', { ...dateWhere, instagramUrl: { not: null } }),
    ]);
    // sócio vive dentro de metadataJson (sem coluna própria) — Prisma não filtra dentro de String
    // JSON sem $queryRaw; amostra "hoje" (teto 5000, mesma régua do bloco fusion) e conta em JS.
    let withOwner = 0;
    if (await this.prisma.hasTable('RadarLeadPool').catch(() => false)) {
      const rows = await (this.prisma as any).radarLeadPool.findMany({
        where: dateWhere,
        select: { metadataJson: true },
        take: 5000,
      });
      for (const row of rows) {
        try {
          const meta = JSON.parse(String(row?.metadataJson || '{}'));
          if (meta?.ownerName) withOwner += 1;
        } catch { /* metadataJson malformado nao conta, nao derruba */ }
      }
    }
    const pct = (n: number) => (cardsToday > 0 ? Math.round((n / cardsToday) * 1000) / 10 : 0);
    return {
      cardsToday,
      email: { count: withEmail, pct: pct(withEmail) },
      instagram: { count: withInstagram, pct: pct(withInstagram) },
      owner: { count: withOwner, pct: pct(withOwner) },
    };
  }

  /** card: entregues hoje (RadarLeadPool.status = sent_to_vendas) + split de sourceChain. */
  private async readCard(todayStart: Date, todayEnd: Date) {
    if (!(await this.prisma.hasTable('RadarLeadPool').catch(() => false))) {
      return { deliveredToday: 0, split: { rfb_web: 0, web: 0, rfb: 0, unmapped: 0 } };
    }
    const dateWhere = { status: 'sent_to_vendas', updatedAt: { gte: todayStart, lt: todayEnd } };
    const deliveredToday = await this.safeCount('radarLeadPool', 'RadarLeadPool', dateWhere);
    const rows = await (this.prisma as any).radarLeadPool.findMany({
      where: dateWhere,
      select: { sourceEngines: true, source: true },
      take: 5000,
    });
    const split = { rfb_web: 0, web: 0, rfb: 0, unmapped: 0 };
    for (const row of rows) {
      const chain = sourceChainOf(parseJsonArray(row?.sourceEngines), row?.source);
      if (chain === 'rfb+web') split.rfb_web += 1;
      else if (chain === 'web') split.web += 1;
      else if (chain === 'rfb') split.rfb += 1;
      else split.unmapped += 1;
    }
    return { deliveredToday, split };
  }

  /**
   * Monta o agregador inteiro. CADA bloco em try/catch próprio — falha de um NUNCA derruba os
   * outros. Blocos que dependem de outro serviço (web/missions/vault/zapGate) são injetados como
   * funções pelo chamador (controller), que já tem HbxEnginePoolService/RadarMissionQueueService/
   * SourceBudgetService/ZapCheckGuardService disponíveis — este serviço só cuida do que é
   * Prisma puro, pra não duplicar DI.
   */
  async build(externalBlocks: {
    web: () => Promise<unknown>;
    missions: () => Promise<unknown>;
    vault: () => Promise<unknown>;
    zapGate: () => unknown;
  }) {
    const now = new Date();
    const { start: todayStart, end: todayEnd } = saoPauloDayRange(now);

    const wrap = async <T>(label: string, fn: () => Promise<T>): Promise<RadarTreeStatusBlock<T>> => {
      try {
        return { ok: true, data: await fn() };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error || 'erro desconhecido') };
      }
    };
    const wrapSync = <T>(fn: () => T): RadarTreeStatusBlock<T> => {
      try {
        return { ok: true, data: fn() };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error || 'erro desconhecido') };
      }
    };

    const [seed, rfb, web, gates, fusion, enrich, zapGate, card, missions, vault] = await Promise.all([
      wrap('seed', () => this.readSeed(todayStart, todayEnd)),
      wrap('rfb', () => this.readRfb()),
      wrap('web', externalBlocks.web),
      wrap('gates', () => this.readGates(todayStart, todayEnd)),
      wrap('fusion', () => this.readFusion(todayStart, todayEnd)),
      wrap('enrich', () => this.readEnrich(todayStart, todayEnd)),
      Promise.resolve(wrapSync(externalBlocks.zapGate)),
      wrap('card', () => this.readCard(todayStart, todayEnd)),
      wrap('missions', externalBlocks.missions),
      wrap('vault', externalBlocks.vault),
    ]);

    return {
      generatedAt: now.toISOString(),
      seed,
      rfb,
      web,
      gates,
      fusion,
      enrich,
      zapGate,
      card,
      missions,
      vault,
    };
  }
}
