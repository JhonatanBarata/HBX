import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ROTA PRONTA (29/07) — indicação de uma rota salva (rota-modelo) para alguém
 * da equipe. O web indica, o APK da pessoa mostra popup impeditivo
 * Aceitar/Negar; negada vira aviso no web ("Rota X negada por Y").
 *
 * Ciclo: pendente → aceita → aplicada | negada. Indicar de novo o MESMO modelo
 * pra MESMA pessoa cancela a indicação viva anterior (nunca 2 popups da mesma
 * rota). Quem materializa entregas continua sendo o fluxo existente de rota
 * salva no APP (rota-modelos/:id/gerar) — este serviço só carrega o recado e o
 * estado; por isso não debita, não cria Entrega e não mexe em agenda.
 *
 * Company-scoped e fail-closed em tudo: id de outra empresa (ou indicação de
 * outra pessoa) → 404, nunca vazamento.
 */
@Injectable()
export class LogisticaRotaIndicadaService {
  private readonly logger = new Logger(LogisticaRotaIndicadaService.name);

  constructor(private readonly prisma: PrismaService) {}

  async indicar(companyId: number, rotaModeloId: string, paraUserIdRaw: unknown, porUserId: number): Promise<RotaIndicadaDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const paraUserId = Math.trunc(Number(paraUserIdRaw));
    if (!Number.isInteger(paraUserId) || paraUserId <= 0) throw new BadRequestException('Escolha para quem indicar a rota.');

    const modelo = await this.prisma.logisticaRotaModelo.findFirst({
      where: { id: String(rotaModeloId ?? '').trim(), companyId, tipo: 'LIVRE' },
      select: { id: true, nome: true, diaSemana: true, paradasJson: true },
    });
    if (!modelo) throw new NotFoundException('Rota salva não encontrada');

    const pessoa = await this.prisma.user.findFirst({
      where: { id: paraUserId, companyId, isActive: true, isSystemMaster: false },
      select: { id: true },
    });
    if (!pessoa) throw new BadRequestException('Pessoa não encontrada nesta empresa.');

    // Substituição, nunca fila: a indicação viva anterior (pendente ou aceita
    // ainda não aplicada) do mesmo modelo pra mesma pessoa morre 'cancelada'.
    await this.prisma.logisticaRotaIndicada.updateMany({
      where: { companyId, rotaModeloId: modelo.id, paraUserId, status: { in: ['pendente', 'aceita'] } },
      data: { status: 'cancelada' },
    });

    const row = await this.prisma.logisticaRotaIndicada.create({
      data: {
        companyId,
        rotaModeloId: modelo.id,
        nomeSnapshot: modelo.nome,
        paraUserId,
        porUserId,
      },
    });
    this.logger.log(`[logistica] rota indicada company=${companyId} modelo=${modelo.id} para=${paraUserId} por=${porUserId}`);
    return this.toDTO(row, modelo);
  }

  /** Do APP: indicações vivas da pessoa logada (pendente = popup; aceita = guardada pra quando a rota atual encerrar). */
  async pendentes(companyId: number, userId: number): Promise<RotaIndicadaDTO[]> {
    if (!companyId || !userId) return [];
    const rows = await this.prisma.logisticaRotaIndicada.findMany({
      where: { companyId, paraUserId: userId, status: { in: ['pendente', 'aceita'] } },
      orderBy: { createdAt: 'asc' },
      include: { rotaModelo: { select: { id: true, nome: true, diaSemana: true, paradasJson: true } } },
    });
    const nomes = await this.nomesPorId(companyId, rows.map((r) => r.porUserId));
    return rows.map((row) => this.toDTO(row, row.rotaModelo, nomes.get(row.porUserId)));
  }

  async responder(companyId: number, id: string, userId: number, aceita: boolean): Promise<RotaIndicadaDTO> {
    const row = await this.findVivaDoUsuario(companyId, id, userId, ['pendente']);
    const atualizado = await this.prisma.logisticaRotaIndicada.update({
      where: { id: row.id },
      data: { status: aceita ? 'aceita' : 'negada', respondidaEm: new Date() },
      include: { rotaModelo: { select: { id: true, nome: true, diaSemana: true, paradasJson: true } } },
    });
    this.logger.log(`[logistica] rota indicada ${aceita ? 'aceita' : 'negada'} company=${companyId} id=${row.id} user=${userId}`);
    return this.toDTO(atualizado, atualizado.rotaModelo);
  }

  /** O APP marca depois de gerar+planejar com sucesso — fecha o ciclo do aceite. */
  async aplicada(companyId: number, id: string, userId: number): Promise<RotaIndicadaDTO> {
    const row = await this.findVivaDoUsuario(companyId, id, userId, ['aceita']);
    const atualizado = await this.prisma.logisticaRotaIndicada.update({
      where: { id: row.id },
      data: { status: 'aplicada', aplicadaEm: new Date() },
    });
    return this.toDTO(atualizado);
  }

  /** Do WEB: histórico recente com nomes — alimenta o banner de negadas. */
  async listar(companyId: number): Promise<RotaIndicadaWebDTO[]> {
    if (!companyId) return [];
    const rows = await this.prisma.logisticaRotaIndicada.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    const nomes = await this.nomesPorId(companyId, rows.flatMap((r) => [r.paraUserId, r.porUserId]));
    return rows.map((row) => ({
      id: row.id,
      nome: row.nomeSnapshot,
      status: row.status,
      paraNome: nomes.get(row.paraUserId) ?? `Usuário ${row.paraUserId}`,
      porNome: nomes.get(row.porUserId) ?? `Usuário ${row.porUserId}`,
      respondidaEm: row.respondidaEm ? row.respondidaEm.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      avisoVisto: !!row.avisoVistoEm,
    }));
  }

  /** Dispensa o aviso de negada no web (banner some, histórico fica). */
  async avisoVisto(companyId: number, id: string): Promise<boolean> {
    if (!companyId || !id) return false;
    const res = await this.prisma.logisticaRotaIndicada.updateMany({
      where: { id: String(id).trim(), companyId, status: 'negada', avisoVistoEm: null },
      data: { avisoVistoEm: new Date() },
    });
    return res.count > 0;
  }

  private async findVivaDoUsuario(companyId: number, id: string, userId: number, status: string[]) {
    if (!companyId || !userId) throw new NotFoundException('Indicação não encontrada');
    const row = await this.prisma.logisticaRotaIndicada.findFirst({
      where: { id: String(id ?? '').trim(), companyId, paraUserId: userId, status: { in: status } },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Indicação não encontrada');
    return row;
  }

  private async nomesPorId(companyId: number, ids: number[]): Promise<Map<number, string>> {
    const unicos = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
    if (!unicos.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unicos }, companyId },
      select: { id: true, name: true, username: true, email: true },
    });
    return new Map(users.map((u) => [u.id, u.name || u.username || u.email || `Usuário ${u.id}`]));
  }

  private toDTO(
    row: { id: string; rotaModeloId: string; nomeSnapshot: string; status: string; createdAt: Date },
    modelo?: { diaSemana: number | null; paradasJson: unknown } | null,
    porNome?: string,
  ): RotaIndicadaDTO {
    return {
      id: row.id,
      rotaModeloId: row.rotaModeloId,
      nome: row.nomeSnapshot,
      status: row.status,
      diaSemana: modelo?.diaSemana ?? null,
      paradas: Array.isArray(modelo?.paradasJson) ? (modelo!.paradasJson as unknown[]).length : 0,
      porNome: porNome ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

export interface RotaIndicadaDTO {
  id: string;
  rotaModeloId: string;
  nome: string;
  status: string;
  diaSemana: number | null;
  paradas: number;
  porNome: string | null;
  createdAt: string;
}

export interface RotaIndicadaWebDTO {
  id: string;
  nome: string;
  status: string;
  paraNome: string;
  porNome: string;
  respondidaEm: string | null;
  createdAt: string;
  avisoVisto: boolean;
}
