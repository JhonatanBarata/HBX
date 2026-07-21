import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BotConfigStoreService, type BotConfigVersionInfo } from '../bot/config/bot-config-store.service';
import { BotActivationService } from '../bot/bot-activation.service';
import { normalizeAtendimentoBotConfig } from '../inbox/atendimento-config';
import { resolveAgentBrain } from './agent.service';
import type { AgentBrain } from './dto/agent.dto';

// ============================================================================
// S09 (MOTOR-ÚNICO) — AgentBackfillService.
//
// Backfill IDEMPOTENTE de `AutomationAgent` (S09-schema-automation-agent.md) a
// partir dos DOIS stores legados do Atendente: `AssistenteConfig` (cérebro
// 'ia') e `BotConfig` domain='atendimento_bot' (cérebro 'roteiro', lido via
// `BotConfigStoreService`, dual-read). NÃO roda no boot — só é chamado pelo
// script `backend/scripts/automation-agent-backfill.js`, que o orquestrador
// roda no VPS depois do publish final (S09.md item 3).
//
// Reusa a regra de brain/published da S05 (`resolveAgentBrain`, exportada de
// `agent.service.ts`, e a mesma leitura de `BotActivationService.getActivation`
// que `AgentService.getView` usa para o published do cérebro 'roteiro') — não
// reimplementa a regra, só troca `user` por um objeto mínimo `{ companyId }`
// (o serviço só usa `user.companyId`/`user.masterContext`, e este backfill
// roda fora de qualquer sessão HTTP, empresa por empresa).
//
// Stores antigos (AssistenteConfig, BotConfig) ficam INTOCADOS — este service
// só LÊ os dois e ESCREVE em `AutomationAgent`; o runtime continua lendo os
// stores antigos até a S10 trocar a leitura.
//
// Idempotência (S09.md item 2, "reexecutar não duplica nem regride edições
// manuais posteriores — guard por updatedAt/existência"):
//   - Sem linha em `AutomationAgent` para a empresa -> CRIA.
//   - Com linha existente: compara `existing.updatedAt` com o `updatedAt` mais
//     recente das FONTES legadas (AssistenteConfig.updatedAt e/ou a `createdAt`
//     da versão mais nova de BotConfig). Se a linha em `AutomationAgent` já é
//     tão nova quanto (ou mais nova que) a fonte, PULA — cobre tanto "já
//     migrado, nada mudou" (idempotência pura) quanto "alguém editou o agente
//     depois" (edição manual pós-S10, quando o schema novo virar gravável —
//     o backfill nunca regride um estado mais novo que a fonte). Só quando a
//     fonte legada tem uma mudança MAIS RECENTE que a última sincronização é
//     que a linha é atualizada — re-sync intencional, não regressão.
// ============================================================================

export type AgentBackfillMigratedFrom = 'assistente' | 'bot' | 'ambos';

export type AgentBackfillOutcome = 'created' | 'updated' | 'skipped_no_source' | 'skipped_up_to_date' | 'error';

export type AgentBackfillCompanyResult = {
  companyId: number;
  outcome: AgentBackfillOutcome;
  migratedFrom: AgentBackfillMigratedFrom | null;
  brain: AgentBrain | null;
  reason?: string;
};

export type AgentBackfillSummary = {
  mode: 'apply' | 'dry_run';
  scannedCompanies: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  results: AgentBackfillCompanyResult[];
};

export type AgentBackfillOptions = {
  // Sem filtro -> roda pra toda empresa com AssistenteConfig e/ou
  // BotConfig(atendimento_bot). Com filtro -> roda só pra essa empresa
  // (mesmo que ela não tenha nenhuma das duas fontes — vira
  // skipped_no_source, útil pra depurar 1 empresa isolada).
  companyId?: number | null;
  // default true (grava de verdade, padrão dos scripts da casa —
  // backfill-bot-config.js). false = dry-run: computa tudo, não escreve.
  apply?: boolean;
};

type AssistenteConfigRow = {
  nome: string;
  tom: string;
  perfil: string;
  produtos: string | null;
  empresaNome: string | null;
  fluxoJson: string;
  published: boolean;
  testCounter: number;
  updatedAt: Date;
};

@Injectable()
export class AgentBackfillService {
  private readonly logger = new Logger(AgentBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly botConfigStore: BotConfigStoreService,
    private readonly botActivationService: BotActivationService,
  ) {}

  async runBackfill(options: AgentBackfillOptions = {}): Promise<AgentBackfillSummary> {
    const apply = options.apply !== false;
    const companyIds = await this.resolveCandidateCompanyIds(options.companyId ?? null);

    const results: AgentBackfillCompanyResult[] = [];
    for (const companyId of companyIds) {
      try {
        results.push(await this.backfillCompany(companyId, apply));
      } catch (error: any) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`[agent-backfill] companyId=${companyId} falhou: ${message}`, error?.stack);
        results.push({ companyId, outcome: 'error', migratedFrom: null, brain: null, reason: message });
      }
    }

    return {
      mode: apply ? 'apply' : 'dry_run',
      scannedCompanies: companyIds.length,
      created: results.filter((r) => r.outcome === 'created').length,
      updated: results.filter((r) => r.outcome === 'updated').length,
      skipped: results.filter((r) => r.outcome === 'skipped_no_source' || r.outcome === 'skipped_up_to_date').length,
      errors: results.filter((r) => r.outcome === 'error').length,
      results,
    };
  }

  // Universo natural: toda empresa com pelo menos 1 das 2 fontes. `distinct`
  // no companyId evita 1 entrada por versão de BotConfig (só precisamos saber
  // QUAIS empresas têm o domínio, não quantas versões).
  private async resolveCandidateCompanyIds(onlyCompanyId: number | null): Promise<number[]> {
    if (onlyCompanyId) return [onlyCompanyId];

    const [assistenteRows, roteiroRows] = await Promise.all([
      this.prisma.assistenteConfig.findMany({ select: { companyId: true } }),
      this.prisma.botConfig.findMany({
        where: { domain: 'atendimento_bot' },
        select: { companyId: true },
        distinct: ['companyId'],
      }),
    ]);

    const ids = new Set<number>();
    assistenteRows.forEach((row: { companyId: number }) => ids.add(row.companyId));
    roteiroRows.forEach((row: { companyId: number }) => ids.add(row.companyId));
    return Array.from(ids).sort((a, b) => a - b);
  }

  private async backfillCompany(companyId: number, apply: boolean): Promise<AgentBackfillCompanyResult> {
    const [assistente, roteiroVersions] = await Promise.all([
      this.prisma.assistenteConfig.findUnique({ where: { companyId } }) as Promise<AssistenteConfigRow | null>,
      this.botConfigStore.listVersions(companyId, 'atendimento_bot'),
    ]);

    const hasAssistente = Boolean(assistente);
    const hasRoteiro = roteiroVersions.length > 0;

    if (!hasAssistente && !hasRoteiro) {
      return {
        companyId,
        outcome: 'skipped_no_source',
        migratedFrom: null,
        brain: null,
        reason: 'nenhuma AssistenteConfig nem BotConfig(atendimento_bot) para esta empresa',
      };
    }

    const migratedFrom: AgentBackfillMigratedFrom =
      hasAssistente && hasRoteiro ? 'ambos' : hasAssistente ? 'assistente' : 'bot';
    const brain = resolveAgentBrain(hasAssistente, Boolean(assistente?.published), hasRoteiro);
    const published = await this.resolvePublished(companyId, brain, assistente);
    const roteiroJson = await this.resolveRoteiroJson(companyId, hasRoteiro);

    const fields = {
      nome: assistente?.nome ?? 'Assistente',
      tom: assistente?.tom ?? 'normal',
      perfil: assistente?.perfil ?? 'vendas',
      produtos: assistente?.produtos ?? null,
      empresaNome: assistente?.empresaNome ?? null,
      brain,
      roteiroJson,
      // AssistenteConfig.fluxoJson já é a string JSON validada na escrita
      // original (sanitizeFluxo) — repassada como está, sem reparse/resanitize
      // (evita risco de alterar o conteúdo já em produção).
      fluxoJson: assistente?.fluxoJson ?? '{}',
      published,
      testCounter: assistente?.testCounter ?? 0,
      migratedFrom,
    };

    const existing = await this.prisma.automationAgent.findUnique({ where: { companyId } });

    if (!existing) {
      if (apply) {
        await this.prisma.automationAgent.create({ data: { companyId, ...fields } });
      }
      return { companyId, outcome: 'created', migratedFrom, brain };
    }

    const sourceUpdatedAt = this.resolveSourceUpdatedAt(assistente, roteiroVersions);
    if (sourceUpdatedAt && existing.updatedAt && new Date(existing.updatedAt) >= sourceUpdatedAt) {
      // Já sincronizado (ou editado manualmente depois da última mudança na
      // fonte legada) — não regride, não duplica.
      return {
        companyId,
        outcome: 'skipped_up_to_date',
        migratedFrom: (existing.migratedFrom as AgentBackfillMigratedFrom | null) ?? migratedFrom,
        brain: (existing.brain as AgentBrain) ?? brain,
      };
    }

    if (apply) {
      await this.prisma.automationAgent.update({ where: { companyId }, data: fields });
    }
    return { companyId, outcome: 'updated', migratedFrom, brain };
  }

  // Mesma regra de `published` que AgentService.getView (S05) usa: cérebro
  // 'ia' reflete AssistenteConfig.published direto; cérebro 'roteiro' não tem
  // coluna própria — reflete o pino ao vivo do BotActivationService (mesmo
  // service, `user` mínimo `{ companyId }` porque o backfill roda sem sessão
  // HTTP). Fail-soft: se a ativação não puder ser lida, published fica false
  // (mesmo comportamento conservador do resto da sprint — nunca assume "ao
  // vivo" sem confirmar).
  private async resolvePublished(
    companyId: number,
    brain: AgentBrain,
    assistente: AssistenteConfigRow | null,
  ): Promise<boolean> {
    if (brain === 'ia') return Boolean(assistente?.published);

    const activation = await this.botActivationService.getActivation({ companyId }).catch((error: any) => {
      this.logger.warn(
        `[agent-backfill] getActivation indisponível companyId=${companyId}: ${String(error?.message || error)}`,
      );
      return null;
    });
    return Boolean((activation as any)?.types?.atendimento?.live);
  }

  // roteiroJson = payload ATUAL do bot-config-store (S09.md item 2),
  // normalizado pelo MESMO normalizador que o resto do produto usa
  // (normalizeAtendimentoBotConfig) — nunca inventa shape novo. Sem roteiro
  // configurado, fica no default do schema ("{}"), sem chamar o store à toa.
  private async resolveRoteiroJson(companyId: number, hasRoteiro: boolean): Promise<string> {
    if (!hasRoteiro) return '{}';
    const payload = await this.botConfigStore.get(companyId, 'atendimento_bot');
    return JSON.stringify(normalizeAtendimentoBotConfig(payload as any));
  }

  private resolveSourceUpdatedAt(
    assistente: AssistenteConfigRow | null,
    roteiroVersions: BotConfigVersionInfo[],
  ): Date | null {
    const timestamps: number[] = [];
    if (assistente?.updatedAt) timestamps.push(new Date(assistente.updatedAt).getTime());
    if (roteiroVersions[0]?.createdAt) timestamps.push(new Date(roteiroVersions[0].createdAt).getTime());
    if (!timestamps.length) return null;
    return new Date(Math.max(...timestamps));
  }
}
