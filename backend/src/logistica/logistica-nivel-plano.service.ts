import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { storedNivel, type LogisticaNivel } from './logistica-config.service';
import {
  applyLogisticaNivelOverrides,
  getLogisticaNivelDefinition,
  getLogisticaNivelOverride,
  LOGISTICA_NIVEIS,
  listLogisticaNiveisCatalog,
  normalizeLogisticaNivelKey,
  sanitizeLogisticaNivelOverride,
  type LogisticaNivelDefinition,
} from './logistica-nivel-catalog';

/**
 * PR28072026 HÍBRIDO (28/07) — o preço (e os assentos) dos níveis de Rota.
 * 24/08/2026 — a FRANQUIA saiu do catálogo (vitrine morta desde ROTA v2).
 *
 * Espelho exato do CreditPackConfigService: base em código + overlay do banco,
 * hidratado no boot e a cada edição do master. Falha ao hidratar NUNCA derruba o
 * boot (defensivo, igual ao catálogo comercial e ao de pacotes) — sem overlay o
 * sistema roda na base, que é um estado válido, nunca um preço errado.
 *
 * Este serviço é a FONTE ÚNICA de "quanto custa o nível" e "quantos assentos o
 * plano inclui".
 */
@Injectable()
export class LogisticaNivelPlanoService implements OnModuleInit {
  private readonly logger = new Logger(LogisticaNivelPlanoService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refreshOverlay().catch((err) =>
      this.logger.warn(`Falha ao hidratar catálogo dos níveis de Rota: ${err instanceof Error ? err.message : err}`),
    );
  }

  /** Lê LogisticaNivelConfig e empurra pro overlay em memória. Idempotente. */
  async refreshOverlay(): Promise<void> {
    let rows: Array<{ nivel: string; configJson: string | null }> = [];
    try {
      rows = await (this.prisma as any).logisticaNivelConfig.findMany({
        select: { nivel: true, configJson: true },
      });
    } catch {
      // Tabela ainda sem migration aplicada (deploy em 2 tempos) = catálogo puro.
      rows = [];
    }
    const entries = (rows || []).map((row) => {
      let parsed: unknown = null;
      if (row.configJson) {
        try { parsed = JSON.parse(row.configJson); } catch { parsed = null; }
      }
      return { nivel: row.nivel, override: sanitizeLogisticaNivelOverride(parsed) };
    });
    applyLogisticaNivelOverrides(entries);
  }

  /** Catálogo efetivo dos níveis + marca de "editado pelo master". */
  listForMaster(): Array<LogisticaNivelDefinition & { editado: boolean }> {
    return listLogisticaNiveisCatalog().map((def) => ({
      ...def,
      editado: !!getLogisticaNivelOverride(def.nivel),
    }));
  }

  /**
   * Catálogo para a VITRINE PÚBLICA do site (/rota, sem login) — mesma fonte do
   * billing, recortada no que é material de anúncio: nível, título, slogan,
   * mensalidade e assentos. `editado` fica de fora de propósito: é detalhe
   * interno de operação, não interessa a quem está decidindo comprar.
   * Ver logistica-planos-publico.controller.ts.
   */
  listPublico(): LogisticaNivelDefinition[] {
    return listLogisticaNiveisCatalog();
  }

  /** Grava o override de UM nível (master). Campos ausentes não mudam nada. */
  async setOverride(nivelRaw: unknown, body: unknown): Promise<LogisticaNivelDefinition & { editado: boolean }> {
    const nivel = normalizeLogisticaNivelKey(nivelRaw);
    if (!nivel) throw new BadRequestException('Nível inválido — use BASIC, ADVANCED ou FULL.');
    const patch = sanitizeLogisticaNivelOverride(body);
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('Nada para alterar — informe preço, título, slogan ou assentos.');
    }
    // Merge com o override que já existe: PATCH parcial de verdade (mandar só o
    // preço não apaga os assentos editados antes).
    const atual = getLogisticaNivelOverride(nivel) ?? {};
    const merged = { ...atual, ...patch };
    await (this.prisma as any).logisticaNivelConfig.upsert({
      where: { nivel },
      update: { configJson: JSON.stringify(merged) },
      create: { nivel, configJson: JSON.stringify(merged) },
    });
    await this.refreshOverlay();
    return { ...getLogisticaNivelDefinition(nivel), editado: !!getLogisticaNivelOverride(nivel) };
  }

  /** Apaga o override e volta o nível pro catálogo de fábrica. */
  async clearOverride(nivelRaw: unknown): Promise<LogisticaNivelDefinition & { editado: boolean }> {
    const nivel = normalizeLogisticaNivelKey(nivelRaw);
    if (!nivel) throw new BadRequestException('Nível inválido — use BASIC, ADVANCED ou FULL.');
    await (this.prisma as any).logisticaNivelConfig
      .deleteMany({ where: { nivel } })
      .catch(() => undefined);
    await this.refreshOverlay();
    return { ...getLogisticaNivelDefinition(nivel), editado: false };
  }

  /** Definição efetiva do nível de UMA empresa (lê LogisticaConfig). */
  async definitionForCompany(companyId: number): Promise<LogisticaNivelDefinition> {
    const cfg = await this.prisma.logisticaConfig
      .findUnique({ where: { companyId }, select: { logisticaNivel: true } })
      .catch(() => null);
    return getLogisticaNivelDefinition(storedNivel((cfg as any)?.logisticaNivel));
  }

  // ⛔ ROTA v2 (10/08, "PICAR A PONTE") — `franquiaDoMes`/`cobreParadaRastreada`
  // MORRERAM aqui. Plano com nível (BASIC/ADVANCED/FULL) virou rota ILIMITADA
  // — o único limite que resta é de ASSENTO (quantos motoristas rodam ao mesmo
  // tempo, ver `LogisticaRotaCobrancaService.assertAssentoDoDia`).
  // 24/08/2026 — `franquiaParadasMes` saiu até do CATÁLOGO (era vitrine morta).

  /**
   * Status do nível pra tela do TENANT ("seu plano é X, N assentos inclusos").
   * ROTA v2 (10/08) — sucessora de `franquiaDoMesEmParadas`: sem franquia pra
   * mostrar, o que importa agora é nível + assentos (default do catálogo ou
   * override da empresa).
   */
  async statusDoNivel(companyId: number): Promise<{
    nivel: LogisticaNivel;
    titulo: string;
    precoMensal: number;
    assentosInclusos: number;
    logisticaAssentos: number | null;
  }> {
    const cfg = await this.prisma.logisticaConfig
      .findUnique({ where: { companyId }, select: { logisticaNivel: true, logisticaAssentos: true } })
      .catch(() => null);
    const def = getLogisticaNivelDefinition(storedNivel((cfg as any)?.logisticaNivel));
    return {
      nivel: def.nivel,
      titulo: def.titulo,
      precoMensal: def.precoMensal,
      assentosInclusos: def.assentosInclusos,
      logisticaAssentos: typeof (cfg as any)?.logisticaAssentos === 'number' ? (cfg as any).logisticaAssentos : null,
    };
  }

  /**
   * PAINEL DO MASTER (28/07, pedido do dono: "quero controle sem depender de vc") —
   * uma linha por empresa com o nível e os assentos. ROTA v2 (10/08): a coluna
   * de consumo do mês morreu junto com a franquia — "quem está no crédito puro
   * × quem está num plano fixo" agora se lê direto do NÍVEL, sem precisar
   * varrer claim nenhum (1 query só).
   */
  async listarEmpresasParaMaster(): Promise<Array<{
    companyId: number;
    nivel: LogisticaNivel;
    titulo: string;
    precoMensal: number;
    assentosInclusos: number;
    logisticaAssentos: number | null;
  }>> {
    const configs: Array<{ companyId: number; logisticaNivel: string | null; logisticaAssentos: number | null }> =
      await (this.prisma as any).logisticaConfig
        .findMany({ select: { companyId: true, logisticaNivel: true, logisticaAssentos: true } })
        .catch(() => []);

    return configs.map((cfg) => {
      const def = getLogisticaNivelDefinition(storedNivel(cfg.logisticaNivel));
      return {
        companyId: cfg.companyId,
        nivel: def.nivel,
        titulo: def.titulo,
        precoMensal: def.precoMensal,
        assentosInclusos: def.assentosInclusos,
        logisticaAssentos: typeof cfg.logisticaAssentos === 'number' ? cfg.logisticaAssentos : null,
      };
    });
  }

  /** Só pra log/telemetria — os níveis numa linha. */
  resumo(): string {
    return LOGISTICA_NIVEIS.map((n) => {
      const d = getLogisticaNivelDefinition(n);
      return `${n}=R$${d.precoMensal}/${d.assentosInclusos}a`;
    }).join(' ');
  }
}
