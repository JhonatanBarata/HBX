import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * PR18072026 W1 — CRUD de "rota-modelo" (roteiro salvo): nome + dia da semana
 * opcional + paradas em ordem (cliente + local opcional). Company-scoped,
 * fail-closed (id de outra empresa → null, o controller vira 404).
 *
 * Aplicar o modelo é 100% CLIENT-SIDE: o app lê `paradas` e monta o
 * `ordemManual` que manda pro planejar/iniciar — não existe endpoint
 * "aplicar" aqui (contrato do 00-ORQUESTRACAO.md).
 */
@Injectable()
export class LogisticaRotaModeloService {
  private readonly logger = new Logger(LogisticaRotaModeloService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: number): Promise<RotaModeloDTO[]> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const rows = await this.prisma.logisticaRotaModelo.findMany({
      where: { companyId },
      orderBy: [{ nome: 'asc' }],
    });
    return rows.map(toDTO);
  }

  async create(companyId: number, input: RotaModeloInput): Promise<RotaModeloDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const nome = normalizeNome(input.nome);
    const diaSemana = normalizeDiaSemana(input.diaSemana);
    const paradas = normalizeParadas(input.paradas);
    const row = await this.prisma.logisticaRotaModelo.create({
      data: { companyId, nome, diaSemana, paradasJson: paradas as any },
    });
    this.logger.log(`[logistica] rota-modelo criado company=${companyId} id=${row.id} paradas=${paradas.length}`);
    return toDTO(row);
  }

  async update(companyId: number, id: string, input: Partial<RotaModeloInput>): Promise<RotaModeloDTO | null> {
    if (!companyId || !id) return null;
    const existing = await this.prisma.logisticaRotaModelo.findFirst({
      where: { id: String(id).trim(), companyId },
      select: { id: true },
    });
    if (!existing) return null;

    const data: Record<string, unknown> = {};
    if (input.nome !== undefined) data.nome = normalizeNome(input.nome);
    if (input.diaSemana !== undefined) data.diaSemana = normalizeDiaSemana(input.diaSemana);
    if (input.paradas !== undefined) data.paradasJson = normalizeParadas(input.paradas) as any;

    const row = await this.prisma.logisticaRotaModelo.update({ where: { id: existing.id }, data });
    return toDTO(row);
  }

  async remove(companyId: number, id: string): Promise<boolean> {
    if (!companyId || !id) return false;
    const existing = await this.prisma.logisticaRotaModelo.findFirst({
      where: { id: String(id).trim(), companyId },
      select: { id: true },
    });
    if (!existing) return false;
    await this.prisma.logisticaRotaModelo.delete({ where: { id: existing.id } });
    return true;
  }
}

function normalizeNome(value: unknown): string {
  const nome = String(value ?? '').trim();
  if (!nome) throw new BadRequestException('Nome é obrigatório.');
  if (nome.length > 80) throw new BadRequestException('Nome deve ter até 80 caracteres.');
  return nome;
}

function normalizeDiaSemana(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Math.trunc(Number(value));
  if (!Number.isInteger(n) || n < 1 || n > 7) {
    throw new BadRequestException('diaSemana deve ser 1 (segunda) a 7 (domingo), ou omitido.');
  }
  return n;
}

function normalizeParadas(value: unknown): RotaModeloParada[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new BadRequestException('paradas deve ser uma lista.');
  if (value.length > 500) throw new BadRequestException('No máximo 500 paradas por modelo.');
  return value.map((item, index) => {
    const customerProfileId = String((item as any)?.customerProfileId ?? '').trim();
    if (!customerProfileId) {
      throw new BadRequestException(`paradas[${index}].customerProfileId é obrigatório.`);
    }
    const localIdRaw = (item as any)?.localId;
    const localId = localIdRaw != null ? String(localIdRaw).trim() : null;
    return { customerProfileId, ...(localId ? { localId } : {}) };
  });
}

function toDTO(row: { id: string; nome: string; diaSemana: number | null; paradasJson: unknown }): RotaModeloDTO {
  return {
    id: row.id,
    nome: row.nome,
    diaSemana: row.diaSemana ?? null,
    paradas: Array.isArray(row.paradasJson) ? (row.paradasJson as RotaModeloParada[]) : [],
  };
}

export interface RotaModeloParada {
  customerProfileId: string;
  localId?: string;
}

export interface RotaModeloInput {
  nome: string;
  diaSemana?: number | null;
  paradas?: RotaModeloParada[];
}

export interface RotaModeloDTO {
  id: string;
  nome: string;
  diaSemana: number | null;
  paradas: RotaModeloParada[];
}
