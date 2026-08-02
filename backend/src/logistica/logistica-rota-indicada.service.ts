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

  async indicar(
    companyId: number,
    rotaModeloId: string,
    paraUserIdRaw: unknown,
    porUserId: number,
    agendadaParaRaw?: unknown,
  ): Promise<RotaIndicadaDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const paraUserId = Math.trunc(Number(paraUserIdRaw));
    if (!Number.isInteger(paraUserId) || paraUserId <= 0) throw new BadRequestException('Escolha para quem indicar a rota.');
    const agendadaPara = parseAgendadaPara(agendadaParaRaw);

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
        agendadaPara,
      },
    });
    this.logger.log(
      `[logistica] rota indicada company=${companyId} modelo=${modelo.id} para=${paraUserId} por=${porUserId}` +
        (agendadaPara ? ` agendada=${agendadaPara.toISOString()}` : ' (imediata)'),
    );
    return this.toDTO(row, modelo);
  }

  /**
   * Do APP: indicações vivas da pessoa logada (pendente = popup; aceita =
   * guardada pra quando a rota atual encerrar).
   *
   * `incluirAgendadas` é COMPATIBILIDADE, não enfeite: o APK antigo abre o popup
   * pra qualquer pendente que ele receba. Se a lista devolvesse uma missão
   * marcada pras 16:00, o aparelho velho perguntaria "aceita?" às 11h — o
   * agendamento viraria mentira. Só o app que sabe ARMAR despertador pede as
   * agendadas (`?agendadas=1`); quem não pede recebe só o que já está na hora.
   */
  async pendentes(companyId: number, userId: number, incluirAgendadas = false): Promise<RotaIndicadaDTO[]> {
    if (!companyId || !userId) return [];
    const rows = await this.prisma.logisticaRotaIndicada.findMany({
      where: { companyId, paraUserId: userId, status: { in: ['pendente', 'aceita'] } },
      orderBy: { createdAt: 'asc' },
      include: { rotaModelo: { select: { id: true, nome: true, diaSemana: true, paradasJson: true } } },
    });
    const agora = Date.now();
    const visiveis = incluirAgendadas
      ? rows
      : rows.filter((row) => !row.agendadaPara || row.agendadaPara.getTime() <= agora);
    const nomes = await this.nomesPorId(companyId, visiveis.map((r) => r.porUserId));
    return visiveis.map((row) => this.toDTO(row, row.rotaModelo, nomes.get(row.porUserId)));
  }

  /**
   * O APP avisa que ARMOU o despertador desta missão. Só isso autoriza o web a
   * dizer "o celular já sabe" — sem o carimbo o painel ficaria prometendo um
   * alarme que talvez nunca toque (aparelho desligado, app nunca aberto).
   * Idempotente: rearmar (troca de horário, reboot) só reescreve a data.
   */
  async marcarAlarmeArmado(companyId: number, id: string, userId: number): Promise<{ armado: boolean }> {
    if (!companyId || !userId) return { armado: false };
    const res = await this.prisma.logisticaRotaIndicada.updateMany({
      where: { id: String(id ?? '').trim(), companyId, paraUserId: userId, status: 'pendente' },
      data: { alarmeArmadoEm: new Date() },
    });
    return { armado: res.count > 0 };
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

  /**
   * PR29072026 (bug do dono, 29/07) — A PESSOA DEVOLVEU A ROTA.
   *
   * Cena relatada: ele indicou a rota, a pessoa ACEITOU e depois CANCELOU a rota
   * no celular. A indicação ficava presa em `aplicada` pra sempre: o web dizia
   * "entregue e aplicada" sobre uma rota que a pessoa tinha desfeito, e ele
   * perguntou — com razão — *"esse painel está acompanhando se a pessoa
   * cancelou? Se ela cancelou devolveu a rota para a pool?"*. Não acompanhava.
   *
   * Status `desfeita` (e não `cancelada`) DE PROPÓSITO: `cancelada` já significa
   * "substituída por uma indicação nova" e é MUDA no web. Devolver a rota tem
   * que APARECER, no mesmo banner da negada — quem indicou precisa saber que
   * ficou sem motorista.
   *
   * Só mexe em `aceita`/`aplicada`: uma indicação `pendente` é um popup que a
   * pessoa ainda NÃO viu — matar isso aqui comeria um recado novo em silêncio.
   * Best-effort por contrato: chamado depois do commit do descarte, nunca dentro
   * dele (falhar aqui não pode desfazer a devolução das ocorrências da agenda).
   */
  async desfazerDoMotorista(companyId: number, paraUserId: number): Promise<number> {
    if (!companyId || !Number.isInteger(paraUserId) || paraUserId <= 0) return 0;
    const res = await this.prisma.logisticaRotaIndicada.updateMany({
      where: { companyId, paraUserId, status: { in: ['aceita', 'aplicada'] } },
      data: { status: 'desfeita', respondidaEm: new Date(), avisoVistoEm: null },
    });
    if (res.count > 0) {
      this.logger.log(
        `[logistica] ${res.count} indicacao(oes) devolvida(s) company=${companyId} user=${paraUserId} (rota desfeita)`,
      );
    }
    return res.count;
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
      agendadaPara: row.agendadaPara ? row.agendadaPara.toISOString() : null,
      alarmeArmado: !!row.alarmeArmadoEm,
    }));
  }

  /**
   * Dispensa o aviso no web (banner some, histórico fica). Vale pros DOIS avisos
   * que o web mostra: `negada` (recusou de cara) e `desfeita` (aceitou e
   * devolveu). Sem `desfeita` aqui o banner novo não teria × e ficaria pra sempre.
   */
  async avisoVisto(companyId: number, id: string): Promise<boolean> {
    if (!companyId || !id) return false;
    const res = await this.prisma.logisticaRotaIndicada.updateMany({
      where: { id: String(id).trim(), companyId, status: { in: ['negada', 'desfeita'] }, avisoVistoEm: null },
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
    row: {
      id: string;
      rotaModeloId: string;
      nomeSnapshot: string;
      status: string;
      createdAt: Date;
      agendadaPara?: Date | null;
      alarmeArmadoEm?: Date | null;
    },
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
      agendadaPara: row.agendadaPara ? row.agendadaPara.toISOString() : null,
      alarmeArmado: !!row.alarmeArmadoEm,
    };
  }
}

/**
 * Hora da missão: ISO do web → Date, ou null (missão imediata, contrato antigo).
 *
 * Fail-closed nos três jeitos de estragar um agendador: data podre ("99:99" já
 * corrompeu a agenda do disparo em 30/07), hora no PASSADO (o despertador nunca
 * tocaria e o admin acharia que tocou) e data absurda (digitar o ano errado
 * agenda pra 2027 em silêncio). O minuto de folga existe porque "agendar pra
 * agora" chega com alguns segundos de atraso de rede — recusar isso seria
 * pedantismo.
 */
function parseAgendadaPara(raw: unknown): Date | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const texto = String(raw).trim();
  if (!texto) return null;
  const data = new Date(texto);
  if (Number.isNaN(data.getTime())) throw new BadRequestException('Hora da missão inválida.');
  const agora = Date.now();
  if (data.getTime() < agora - 60_000) throw new BadRequestException('Essa hora já passou. Escolha um horário à frente.');
  if (data.getTime() > agora + 30 * 24 * 60 * 60_000) {
    throw new BadRequestException('Só dá pra agendar missão até 30 dias à frente.');
  }
  return data;
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
  /** ISO da hora marcada; null = missão imediata. */
  agendadaPara: string | null;
  /** O aparelho confirmou que armou o despertador desta missão. */
  alarmeArmado: boolean;
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
  agendadaPara: string | null;
  alarmeArmado: boolean;
}
