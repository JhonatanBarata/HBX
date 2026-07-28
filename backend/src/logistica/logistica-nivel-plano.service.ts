import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { storedNivel, type LogisticaNivel } from './logistica-config.service';
import {
  applyLogisticaNivelOverrides,
  franquiaEmBlocos,
  getLogisticaNivelDefinition,
  getLogisticaNivelOverride,
  LOGISTICA_NIVEIS,
  listLogisticaNiveisCatalog,
  normalizeLogisticaNivelKey,
  PARADAS_POR_BLOCO,
  sanitizeLogisticaNivelOverride,
  type LogisticaNivelDefinition,
} from './logistica-nivel-catalog';

/**
 * PR28072026 HÍBRIDO (28/07) — o preço e a FRANQUIA dos 3 níveis de Rota.
 *
 * Espelho exato do CreditPackConfigService: base em código + overlay do banco,
 * hidratado no boot e a cada edição do master. Falha ao hidratar NUNCA derruba o
 * boot (defensivo, igual ao catálogo comercial e ao de pacotes) — sem overlay o
 * sistema roda na base, que é um estado válido, nunca um preço errado.
 *
 * Este serviço é a FONTE ÚNICA de "quanto custa o nível" e "quantas paradas o
 * plano inclui". Quem cobra (logistica-route-billing) pergunta aqui; ninguém
 * recalcula franquia por conta própria.
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

  /** Catálogo efetivo dos 3 níveis + marca de "editado pelo master". */
  listForMaster(): Array<LogisticaNivelDefinition & { editado: boolean; franquiaBlocos: number }> {
    return listLogisticaNiveisCatalog().map((def) => ({
      ...def,
      editado: !!getLogisticaNivelOverride(def.nivel),
      franquiaBlocos: franquiaEmBlocos(def.franquiaParadasMes),
    }));
  }

  /** Grava o override de UM nível (master). Campos ausentes não mudam nada. */
  async setOverride(nivelRaw: unknown, body: unknown): Promise<LogisticaNivelDefinition & { editado: boolean }> {
    const nivel = normalizeLogisticaNivelKey(nivelRaw);
    if (!nivel) throw new BadRequestException('Nível inválido — use BASIC, ADVANCED ou FULL.');
    const patch = sanitizeLogisticaNivelOverride(body);
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('Nada para alterar — informe preço ou franquia.');
    }
    // Merge com o override que já existe: PATCH parcial de verdade (mandar só o
    // preço não apaga a franquia editada antes).
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

  /**
   * FRANQUIA DO MÊS de uma empresa, contada em PARADAS — a unidade do plano e a
   * única que soma os DOIS jeitos de queimar crédito na rua:
   *
   *   - Rota Essencial: 1 claim = 1 BLOCO = 5 paradas;
   *   - Rota Rastreada (Full): 1 claim = 1 ENTREGA = 1 parada.
   *
   * Sem somar os dois, a franquia do Full seria decorativa: o preset do nível
   * liga TRACKED, e o Full queimaria crédito por outra porta com a franquia
   * intacta.
   *
   * "Mês" é o mês CIVIL de São Paulo tirado da própria data da rota (`routeDate`
   * é YYYY-MM-DD já canônico no fuso da operação) — NUNCA `new Date()` do
   * container, que roda em UTC e viraria o mês 3h antes pro dono. Regra da casa:
   * teste verde no meu fuso não vale.
   *
   * Consome franquia todo claim do mês que JÁ foi decidido: coberto pelo plano
   * ('PLAN') ou que tocou a carteira ('PROCESSING'/'DEBITED'/'COMPLETED').
   * Claim que falhou ou foi estornado NÃO consome — o cliente não gastou nada.
   */
  async franquiaDoMes(
    companyId: number,
    routeDate: string,
    nivel?: LogisticaNivel,
  ): Promise<{
    paradasInclusas: number;
    paradasUsadas: number;
    paradasRestantes: number;
    blocosRestantes: number;
  }> {
    const def = nivel
      ? getLogisticaNivelDefinition(nivel)
      : await this.definitionForCompany(companyId);
    const paradasInclusas = Math.max(0, Math.trunc(def.franquiaParadasMes || 0));
    if (paradasInclusas <= 0) {
      return { paradasInclusas: 0, paradasUsadas: 0, paradasRestantes: 0, blocosRestantes: 0 };
    }
    const mes = String(routeDate || '').slice(0, 7); // YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      return { paradasInclusas, paradasUsadas: 0, paradasRestantes: paradasInclusas, blocosRestantes: franquiaEmBlocos(paradasInclusas) };
    }
    const [blocosEssenciais, entregasRastreadas] = await Promise.all([
      (this.prisma as any).logisticaEssentialCreditClaim
        .count({
          where: {
            companyId,
            routeDate: { startsWith: mes },
            status: { in: ['PLAN', 'PROCESSING', 'DEBITED'] },
          },
        })
        .catch(() => 0),
      // Tracked não guarda a data no claim: filtra pela rota (routeDate é a
      // MESMA string canônica), pra não depender do sourceMonth, que só é
      // preenchido quando a entrega fecha.
      (this.prisma as any).logisticaTrackedCreditClaim
        .count({
          where: {
            companyId,
            status: { in: ['PLAN', 'PROCESSING', 'DEBITED', 'COMPLETED'] },
            route: { routeDate: { startsWith: mes } },
          },
        })
        .catch(() => 0),
    ]);
    const paradasUsadas = Number(blocosEssenciais || 0) * PARADAS_POR_BLOCO + Number(entregasRastreadas || 0);
    const paradasRestantes = Math.max(0, paradasInclusas - paradasUsadas);
    return {
      paradasInclusas,
      paradasUsadas,
      paradasRestantes,
      // Bloco é indivisível: sobrar 3 paradas não dá o próximo bloco de graça.
      blocosRestantes: franquiaEmBlocos(paradasRestantes),
    };
  }

  /** Ainda cabe UMA entrega rastreada na franquia deste mês? */
  async cobreParadaRastreada(companyId: number, routeDate: string): Promise<boolean> {
    const f = await this.franquiaDoMes(companyId, routeDate);
    return f.paradasRestantes >= 1;
  }

  /** Espelho pra tela do tenant ("usou 240 das 600 paradas do plano"). */
  async franquiaDoMesEmParadas(
    companyId: number,
    routeDate: string,
  ): Promise<{
    nivel: LogisticaNivel;
    titulo: string;
    precoMensal: number;
    paradasInclusas: number;
    paradasUsadas: number;
    paradasRestantes: number;
  }> {
    const def = await this.definitionForCompany(companyId);
    const f = await this.franquiaDoMes(companyId, routeDate, def.nivel);
    return {
      nivel: def.nivel,
      titulo: def.titulo,
      precoMensal: def.precoMensal,
      paradasInclusas: f.paradasInclusas,
      paradasUsadas: Math.min(f.paradasInclusas, f.paradasUsadas),
      paradasRestantes: f.paradasRestantes,
    };
  }

  /** Só pra log/telemetria — os 3 níveis numa linha. */
  resumo(): string {
    return LOGISTICA_NIVEIS.map((n) => {
      const d = getLogisticaNivelDefinition(n);
      return `${n}=R$${d.precoMensal}/${d.franquiaParadasMes}p`;
    }).join(' ');
  }
}
