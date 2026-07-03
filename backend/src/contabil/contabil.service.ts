import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FiscalEngineService } from './fiscal-engine.service';
import { RevenueSyncService } from './revenue-sync.service';
import type { AjusteManualDto, UpdateFiscalProfileDto } from './dto/contabil.dto';

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
