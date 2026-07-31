// INTENTENGINE S3 (docs/PLANEJAMENTOS/INTENTENGINE/INTENTENGINE-sprint3.md).
// Fonte única de leitura/escrita da config do bot na tabela `BotConfig` (versionada,
// auditada). Antes disso, cada consumidor (bot-activation, inbox, messaging,
// hbx-recovery) duplicava `getConfigRow`/`saveConfigRow` lendo/gravando JSON serializado
// dentro de `HbxRecoveryFlowStage` (tabela do recovery reaproveitada como chave-valor) —
// sem histórico, sem autor, sem rollback. Aqui: leitura = MAIOR version por
// (companyId, domain); escrita = SEMPRE INSERT de nova version (nunca update) →
// histórico de graça e rollback de graça.
//
// DUAL-READ (migração lazy, sem downtime, sem script obrigatório antes do deploy):
//   1) tenta `BotConfig` (maior version) — se existir, é a fonte.
//   2) se não existir NENHUMA linha em `BotConfig` para (companyId, domain), cai no
//      canal mágico legado em `HbxRecoveryFlowStage` (mesma lógica de hoje) e loga
//      warn de fallback — dá pra medir quantas empresas ainda não migraram.
// A partir do deploy, TODA escrita nova (`save`) grava só em `BotConfig` — nenhum
// caminho de escrita mira mais o canal legado. As linhas legadas NÃO são apagadas
// (ficam como fallback morto até o backfill rodar + 1 release de garantia).
//
// Normalizadores (normalizeAtendimentoBotConfig, normalizeAtendimentoAgendaConfig,
// normalizeRecoveryBotConfig, parse do master-switch) continuam nos módulos de origem
// — este service só troca a ORIGEM do JSON bruto, nunca decide formato/default.

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// 'bot_master_switch' morreu com a chave geral (31/07/2026 — migration
// 20260801020000_mata_bloqueios_bot apagou as linhas).
export type BotConfigDomain =
  | 'atendimento_bot'
  | 'atendimento_agenda'
  | 'recovery_bot';

// Canal/título mágico legado por domínio — mesmas constantes já usadas hoje em
// atendimento-config.ts / recovery-bot-config.ts / bot-activation.service.ts. Duplicadas
// aqui como literais (não importar os módulos de origem evitaria dependência circular,
// mas o valor em si é estável há tempo — qualquer mudança de canal legado é ruptura
// grande o bastante pra exigir revisão manual dos 2 lados mesmo assim).
const LEGACY_CHANNEL_BY_DOMAIN: Record<BotConfigDomain, { channel: string; title: string }> = {
  atendimento_bot: { channel: '__ATENDIMENTO_BOT_CONFIG__', title: 'config_v1' },
  atendimento_agenda: { channel: '__ATENDIMENTO_AGENDA_CONFIG__', title: 'config_v1' },
  recovery_bot: { channel: '__HBX_RECOVERY_BOT_CONFIG__', title: 'config_v1' },
};

export type BotConfigVersionInfo = {
  version: number;
  updatedByUserId: number | null;
  createdAt: Date;
};

@Injectable()
export class BotConfigStoreService {
  private readonly logger = new Logger(BotConfigStoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── leitura ────────────────────────────────────────────────────────────────
  // Retorna o payload JÁ PARSEADO (ou null se não existir em nenhuma das duas fontes).
  // Quem chama continua responsável por normalizar (normalizeXxx) — este service não
  // conhece o formato de cada domínio.
  async get(companyId: number, domain: BotConfigDomain): Promise<unknown | null> {
    const latest = await this.getLatestRow(companyId, domain);
    if (latest) {
      try {
        return JSON.parse(latest.payload);
      } catch {
        this.logger.warn(
          `BotConfig payload inválido (companyId=${companyId}, domain=${domain}, version=${latest.version}) — tratando como ausente.`,
        );
        return null;
      }
    }

    // Fallback: canal mágico legado (mesma lógica de hoje, migração lazy).
    const legacy = LEGACY_CHANNEL_BY_DOMAIN[domain];
    const legacyRow = await this.prisma.hbxRecoveryFlowStage.findFirst({
      where: { companyId, channel: legacy.channel, title: legacy.title },
      orderBy: { updatedAt: 'desc' },
      select: { template: true },
    });
    if (!legacyRow?.template) return null;

    this.logger.warn(
      `BotConfig fallback legado (companyId=${companyId}, domain=${domain}) — empresa ainda não migrada para BotConfig; rodar backfill (backend/scripts/backfill-bot-config.js).`,
    );
    try {
      return JSON.parse(legacyRow.template);
    } catch {
      return null;
    }
  }

  // ── escrita ────────────────────────────────────────────────────────────────
  // SEMPRE insere nova version (nunca update) — histórico de graça. Nunca escreve no
  // canal legado: a partir do deploy, toda escrita nova cai só na BotConfig.
  async save(
    companyId: number,
    domain: BotConfigDomain,
    payload: unknown,
    userId?: number | null,
  ): Promise<void> {
    const nextVersion = await this.resolveNextVersion(companyId, domain);
    await this.prisma.botConfig.create({
      data: {
        companyId,
        domain,
        version: nextVersion,
        payload: JSON.stringify(payload ?? {}),
        updatedByUserId: userId || null,
      },
    });
  }

  // ── histórico (base do endpoint de rollback) ─────────────────────────────────
  async listVersions(companyId: number, domain: BotConfigDomain): Promise<BotConfigVersionInfo[]> {
    const rows = await this.prisma.botConfig.findMany({
      where: { companyId, domain },
      orderBy: { version: 'desc' },
      select: { version: true, updatedByUserId: true, createdAt: true },
    });
    return rows.map((row) => ({
      version: row.version,
      updatedByUserId: row.updatedByUserId ?? null,
      createdAt: row.createdAt,
    }));
  }

  // ── rollback: regrava a versão anterior como NOVA versão (nunca apaga histórico) ──
  async rollback(companyId: number, domain: BotConfigDomain, userId?: number | null): Promise<unknown> {
    const rows = await this.prisma.botConfig.findMany({
      where: { companyId, domain },
      orderBy: { version: 'desc' },
      take: 2,
      select: { version: true, payload: true },
    });
    const previous = rows[1];
    if (!previous) {
      throw new Error(`BotConfig sem versão anterior para rollback (companyId=${companyId}, domain=${domain}).`);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(previous.payload);
    } catch {
      payload = {};
    }
    await this.save(companyId, domain, payload, userId);
    return payload;
  }

  // ── helpers privados ───────────────────────────────────────────────────────

  private async getLatestRow(companyId: number, domain: BotConfigDomain) {
    return this.prisma.botConfig.findFirst({
      where: { companyId, domain },
      orderBy: { version: 'desc' },
      select: { version: true, payload: true },
    });
  }

  private async resolveNextVersion(companyId: number, domain: BotConfigDomain): Promise<number> {
    const latest = await this.getLatestRow(companyId, domain);
    return (latest?.version || 0) + 1;
  }
}
