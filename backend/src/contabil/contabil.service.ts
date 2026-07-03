import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FiscalEngineService } from './fiscal-engine.service';
import { RevenueSyncService } from './revenue-sync.service';
import { LivroCaixaService } from './livro-caixa.service';
import type { AjusteManualDto, MarcarObligationDto, UpdateFiscalProfileDto } from './dto/contabil.dto';

const ESTADOS_VALIDOS = new Set([
  'AGUARDANDO_DADOS',
  'PRONTO',
  'ARMADO',
  'TRANSMITIDO',
  'PAGO',
  'CONFERIDO',
]);

// ===========================================================================
// CONTABIL — orquestração fina (perfil singleton + leitura de mês + ajuste).
// TODO cálculo delega ao FiscalEngineService (puro) e RevenueSyncService (I/O).
// Owner-only garantido no controller (JwtAuthGuard + MasterGuard).
// ===========================================================================

const FISCAL_PROFILE_ID = 1;

@Injectable()
export class ContabilService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: FiscalEngineService,
    private readonly revenueSync: RevenueSyncService,
    private readonly livroCaixa: LivroCaixaService,
  ) {}

  /** FiscalProfile singleton (cria com defaults do schema se não existir). */
  async getPerfil() {
    const existing = await (this.prisma as any).fiscalProfile.findUnique({
      where: { id: FISCAL_PROFILE_ID },
    });
    if (existing) return this.serializePerfil(existing);
    const created = await (this.prisma as any).fiscalProfile.create({
      data: { id: FISCAL_PROFILE_ID },
    });
    return this.serializePerfil(created);
  }

  async updatePerfil(dto: UpdateFiscalProfileDto) {
    const data: Record<string, unknown> = {};
    if (dto.cnpj !== undefined) data.cnpj = dto.cnpj || null;
    if (dto.razaoSocial !== undefined) data.razaoSocial = dto.razaoSocial || null;
    if (dto.dataAbertura !== undefined) {
      data.dataAbertura = dto.dataAbertura ? new Date(dto.dataAbertura) : null;
    }
    if (dto.regime !== undefined) data.regime = dto.regime;
    if (dto.anexoBase !== undefined) data.anexoBase = dto.anexoBase;
    if (dto.cnaePrincipal !== undefined) data.cnaePrincipal = dto.cnaePrincipal;
    if (dto.aliquotaIssMunicipal !== undefined) data.aliquotaIssMunicipal = dto.aliquotaIssMunicipal;
    if (dto.prolaboreAlvoPct !== undefined) data.prolaboreAlvoPct = dto.prolaboreAlvoPct;

    const saved = await (this.prisma as any).fiscalProfile.upsert({
      where: { id: FISCAL_PROFILE_ID },
      create: { id: FISCAL_PROFILE_ID, ...data },
      update: data,
    });
    return this.serializePerfil(saved);
  }

  /** Mês completo — calcula on-demand (sync do ledger) se ainda não consolidado. */
  async getMes(competencia: string) {
    this.assertCompetencia(competencia);
    const saved = await this.revenueSync.syncCompetencia(competencia);
    return saved;
  }

  /** Simulador de cenário (base da UI S3). Valores de entrada em cents. */
  simulador(input: {
    receitaMesCents: number;
    prolaboreCents: number;
    rbt12Cents?: number;
    folha12mCents?: number;
  }) {
    return this.engine.simulaCenario(input);
  }

  /** Ajuste manual da receita do mês (motivo obrigatório) → recomputa a cadeia. */
  async ajusteManual(competencia: string, dto: AjusteManualDto) {
    this.assertCompetencia(competencia);
    if (!dto?.motivo || dto.motivo.trim().length < 3) {
      throw new BadRequestException('motivo do ajuste é obrigatório');
    }
    // Garante linha (calcula base do ledger antes de aplicar o ajuste).
    await this.revenueSync.syncCompetencia(competencia);
    await (this.prisma as any).fiscalRevenueMonth.update({
      where: { competencia },
      data: {
        ajusteManualCents: Math.trunc(dto.ajusteManualCents),
        ajusteMotivo: dto.motivo.trim(),
      },
    });
    // Recomputa a cadeia já com o ajuste aplicado.
    return this.revenueSync.syncCompetencia(competencia);
  }

  // ---------------------------------------------------------------------
  // CONTABIL S2 — calendário fiscal (obligation-scheduler por trás).
  // ---------------------------------------------------------------------

  /** GET /master/contabil/obrigacoes?competencia= — lista com estados. competencia omitida = todas. */
  async listarObrigacoes(competencia?: string) {
    const where: Record<string, unknown> = {};
    if (competencia) {
      this.assertCompetenciaOuAnual(competencia);
      where.competencia = competencia;
    }
    const rows = await (this.prisma as any).fiscalObligation.findMany({
      where,
      orderBy: { dueDate: 'asc' },
    });
    return rows.map((r: any) => this.serializeObligation(r));
  }

  /** GET /master/contabil/proximas — as 5 próximas (badge do master). Ordena por dueDate, exclui CONFERIDO/naoAplicavel. */
  async proximasObrigacoes(limite = 5) {
    const rows = await (this.prisma as any).fiscalObligation.findMany({
      where: { naoAplicavel: false, estado: { notIn: ['CONFERIDO'] } },
      orderBy: { dueDate: 'asc' },
      take: Math.max(1, Math.min(50, Math.trunc(limite) || 5)),
    });
    return rows.map((r: any) => this.serializeObligation(r));
  }

  /** POST /master/contabil/obrigacoes/:id/marcar — transição manual (dono confirma). */
  async marcarObrigacao(id: string, dto: MarcarObligationDto) {
    const estado = String(dto?.estado || '').trim().toUpperCase();
    if (!ESTADOS_VALIDOS.has(estado)) {
      throw new BadRequestException(
        `estado inválido: '${dto?.estado}' (esperado um de ${Array.from(ESTADOS_VALIDOS).join(', ')})`,
      );
    }
    const existente = await (this.prisma as any).fiscalObligation.findUnique({ where: { id } });
    if (!existente) throw new NotFoundException(`obrigação '${id}' não encontrada`);

    const data: Record<string, unknown> = { estado };
    if (dto.resultJson !== undefined) data.resultJson = dto.resultJson || null;

    const saved = await (this.prisma as any).fiscalObligation.update({ where: { id }, data });

    // CONTABIL S4 — hook Livro Caixa: só na TRANSIÇÃO para PAGO (existente.estado
    // != 'PAGO' antes de gravar), nunca ao re-marcar/repetir — o idempotência real
    // é o @@unique([origem, refId]) do LivroCaixaService, isto aqui só evita chamar
    // à toa. Best-effort: falha aqui NUNCA derruba a marcação da obrigação (já
    // gravada acima) — o Livro Caixa é um espelho, não trava o fluxo fiscal.
    if (estado === 'PAGO' && existente.estado !== 'PAGO') {
      await this.livroCaixa.lancarSaidaObrigacaoPaga({
        id: saved.id,
        competencia: saved.competencia,
        tipo: saved.tipo,
        dueDate: saved.dueDate,
      });
    }

    return this.serializeObligation(saved);
  }

  private serializeObligation(row: any) {
    return {
      id: row.id,
      competencia: row.competencia,
      tipo: row.tipo,
      dueDate: row.dueDate,
      estado: row.estado,
      naoAplicavel: row.naoAplicavel,
      atrasado: !row.naoAplicavel && row.estado !== 'CONFERIDO' && new Date(row.dueDate).getTime() < Date.now(),
      payloadJson: row.payloadJson ?? null,
      resultJson: row.resultJson ?? null,
      alertasEnviados: row.alertasEnviados,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    };
  }

  private assertCompetenciaOuAnual(competencia: string) {
    if (!/^\d{4}-\d{2}$/.test(competencia) && !/^\d{4}-ANUAL$/.test(competencia)) {
      throw new BadRequestException(`competência inválida: '${competencia}' (esperado 'YYYY-MM' ou 'YYYY-ANUAL')`);
    }
  }

  private serializePerfil(row: any) {
    // NUNCA expor os campos *Encrypted (segredo). Só flags de presença.
    return {
      id: row.id,
      cnpj: row.cnpj ?? null,
      razaoSocial: row.razaoSocial ?? null,
      dataAbertura: row.dataAbertura ?? null,
      regime: row.regime,
      anexoBase: row.anexoBase,
      cnaePrincipal: row.cnaePrincipal,
      aliquotaIssMunicipal: row.aliquotaIssMunicipal ?? null,
      prolaboreAlvoPct: row.prolaboreAlvoPct,
      certA1ExpiresAt: row.certA1ExpiresAt ?? null,
      certA1Configured: Boolean(row.certA1Encrypted),
      serproConfigured: Boolean(row.serproCredEncrypted),
      updatedAt: row.updatedAt,
    };
  }

  private assertCompetencia(competencia: string) {
    if (!/^\d{4}-\d{2}$/.test(String(competencia || ''))) {
      throw new BadRequestException(`competência inválida: '${competencia}' (esperado 'YYYY-MM')`);
    }
  }
}
