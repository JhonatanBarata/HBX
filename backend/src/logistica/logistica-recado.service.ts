import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MobilePushService } from '../auth/mobile-push.service';
import { canonicalRouteDate } from './logistica-route-billing.service';
import { resolveOperationalCapabilities } from '../team/operational-capabilities';

/**
 * COCKPIT (03/08) — RECADO escritório ⇄ motorista.
 *
 * O buraco nº1 do módulo: o único texto que saía do escritório pro celular era
 * o NOME de uma rota indicada. "Ao finalizar, passa na central" não tinha por
 * onde passar — o dono acabava no WhatsApp pessoal, fora do sistema, sem prova
 * de leitura e sem ninguém sabendo o que foi combinado.
 *
 * ── A ESCADA (`nivel`) — força no aparelho, não no texto ────────────────────
 *   normal  → lista/sino do app. `vistoEm` já é prova suficiente.
 *   urgente → heads-up + som + voz; e o PORTÃO: o próximo Confirmar/Cheguei
 *             abre o recado por cima e exige "Entendi" (`ackEm`) pra liberar.
 *   alarme  → tela cheia (reusa a MissaoAlarme que já existe no APK).
 *
 * 🔴 POR QUE O PORTÃO E NÃO "TOMAR A TELA": ordem do dono foi garantir o clique
 * "do nível q atrapalha a rota se ele não clicar". Sequestrar a tela com o Maps
 * aberto é (a) perigoso — o cara está dirigindo — e (b) o Android moderno nem
 * permite de forma confiável. Então a cobrança acontece no momento em que ele
 * JÁ vai tocar no celular PARADO: na chegada/confirmação. Clique garantido,
 * rota intacta.
 *
 * 🔴 BROADCAST NASCE EXPLODIDO: "todos na rua" grava UMA LINHA POR PESSOA (mesmo
 * `loteId`). Linha compartilhada não teria onde guardar o ✓✓ de cada um — e
 * recado sem prova individual é o "mandei, e daí?" que já gerou o painel de
 * missões. O custo é N linhas de VarChar(500): barato.
 *
 * 🔴 O FCM É SÓ CAMPAINHA (mesma lei do mobile-actions): o push não carrega o
 * texto, só acorda o app pra puxar. Recado pode ter dado de cliente; conteúdo
 * não passa por servidor de terceiro.
 */

const NIVEIS = ['normal', 'urgente', 'alarme'] as const;
export type RecadoNivel = (typeof NIVEIS)[number];
/** Níveis que EXIGEM o "Entendi" — normal se resolve com o visto. */
const NIVEL_COBRA_ACK: readonly string[] = ['urgente', 'alarme'];
const ORIGEM_ESCRITORIO = 'escritorio';
const ORIGEM_MOTORISTA = 'motorista';
const TEXTO_MAX = 500;
/** Teto de leitura do fio — o cockpit mostra conversa, não arquivo morto. */
const FIO_TAKE = 40;
const OPEN_STATUS = ['agendada', 'em_rota'] as const;

export interface RecadoDTO {
  id: string;
  motoristaUserId: number;
  origem: 'escritorio' | 'motorista';
  autorNome: string;
  texto: string;
  nivel: RecadoNivel;
  loteId: string | null;
  criadoEm: string;
  entregueEm: string | null;
  vistoEm: string | null;
  ackEm: string | null;
  /** Estado em UMA palavra — é o que o cockpit pinta embaixo da bolha. */
  estado: 'enviado' | 'no_aparelho' | 'visto' | 'entendido';
}

export interface EnviarRecadoInput {
  /** null/ausente = broadcast pra todo mundo com trabalho hoje. */
  paraUserId?: number | null;
  texto: string;
  nivel?: string;
}

@Injectable()
export class LogisticaRecadoService {
  private readonly logger = new Logger(LogisticaRecadoService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Opcional de propósito: sem Firebase configurado o recado continua
    // funcionando (o APK busca no polling que já roda). Push é aceleração,
    // nunca o transporte.
    @Optional() private readonly push?: MobilePushService,
  ) {}

  // ── ESCRITA (escritório) ──────────────────────────────────────────────────
  /**
   * Manda recado pra UMA pessoa ou pra todo mundo com trabalho hoje.
   * Devolve as linhas criadas (uma por destinatário).
   */
  async enviar(
    companyId: number,
    autor: { id: number; nome: string },
    input: EnviarRecadoInput,
    dateInput?: string,
  ): Promise<RecadoDTO[]> {
    if (!companyId) throw new BadRequestException('Empresa não identificada.');
    const texto = String(input?.texto ?? '').trim();
    if (!texto) throw new BadRequestException('Escreva o recado.');
    if (texto.length > TEXTO_MAX) {
      throw new BadRequestException(`Recado muito longo (máximo ${TEXTO_MAX} caracteres).`);
    }
    const nivel = this.nivelSeguro(input?.nivel);
    const routeDate = this.diaSeguro(dateInput);

    const alvoBruto = input?.paraUserId;
    const ehBroadcast = alvoBruto === null || alvoBruto === undefined;

    const destinos = ehBroadcast
      ? await this.quemEstaNaRua(companyId, routeDate)
      : [await this.exigirMotorista(companyId, alvoBruto)];

    if (!destinos.length) {
      throw new BadRequestException(
        ehBroadcast ? 'Ninguém com entrega hoje pra receber o recado.' : 'Pessoa não encontrada nesta empresa.',
      );
    }

    // Um loteId só quando é disparo em massa: recado individual não é lote, e
    // carimbar um id nele faria o cockpit agrupar conversa que não é grupo.
    const loteId = ehBroadcast && destinos.length > 1 ? `lote_${Date.now().toString(36)}` : null;
    const autorNome = String(autor?.nome || `Usuário ${autor?.id ?? '?'}`).slice(0, 120);

    const criados = await this.prisma.$transaction(
      destinos.map((motoristaUserId) =>
        this.prisma.logisticaRecado.create({
          data: {
            companyId,
            motoristaUserId,
            origem: ORIGEM_ESCRITORIO,
            autorUserId: autor.id,
            autorNome,
            texto,
            nivel,
            routeDate,
            loteId,
          },
        }),
      ),
    );

    this.logger.log(
      `[logistica] recado ${nivel} company=${companyId} de=${autor.id} para=${
        ehBroadcast ? `TODOS(${destinos.length})` : destinos[0]
      } dia=${routeDate}`,
    );

    // Campainha depois do commit e best-effort: aparelho desligado não pode
    // desfazer um recado que já está gravado (o pull entrega quando ele voltar).
    void this.tocarCampainha(companyId, destinos).catch(() => undefined);

    return criados.map((row) => this.toDTO(row));
  }

  /** Resposta do motorista — mesmo fio, direção contrária. */
  async responder(
    companyId: number,
    motoristaUserId: number,
    texto: string,
    dateInput?: string,
    options: { clientMessageId?: string; recadoId?: string } = {},
  ): Promise<RecadoDTO> {
    if (!companyId || !motoristaUserId) throw new BadRequestException('Sessão inválida.');
    const limpo = String(texto ?? '').trim();
    if (!limpo) throw new BadRequestException('Escreva a mensagem.');
    if (limpo.length > TEXTO_MAX) throw new BadRequestException('Mensagem muito longa.');

    const pessoa = await this.prisma.user.findFirst({
      where: { id: motoristaUserId, companyId },
      select: { name: true, username: true, email: true },
    });
    const clientMessageId = String(options?.clientMessageId || '').trim() || null;
    const recadoId = String(options?.recadoId || '').trim() || null;
    const autorNome = (pessoa?.name || pessoa?.username || pessoa?.email || `Usuário ${motoristaUserId}`).slice(0, 120);
    const routeDate = this.diaSeguro(dateInput);

    return this.prisma.$transaction(async (tx) => {
      const original = recadoId
        ? await tx.logisticaRecado.findFirst({
            where: {
              id: recadoId,
              companyId,
              motoristaUserId,
              origem: ORIGEM_ESCRITORIO,
            },
            select: { id: true, nivel: true },
          })
        : null;
      if (recadoId && !original) {
        throw new NotFoundException('Recado não encontrado neste aparelho.');
      }

      const data = {
        companyId,
        motoristaUserId,
        origem: ORIGEM_MOTORISTA,
        autorUserId: motoristaUserId,
        autorNome,
        texto: limpo,
        nivel: 'normal',
        routeDate,
        clientMessageId,
        respostaAoId: original?.id ?? null,
        // A mensagem já chegou AO SERVIDOR, mas a central ainda não abriu.
        // `vistoEm` precisa ficar null para o badge avisar quem está no PC.
        entregueEm: new Date(),
        vistoEm: null,
      };
      const row = clientMessageId
        ? await tx.logisticaRecado.upsert({
            where: {
              companyId_motoristaUserId_clientMessageId: {
                companyId,
                motoristaUserId,
                clientMessageId,
              },
            },
            create: data,
            update: {},
          })
        : await tx.logisticaRecado.create({ data });

      // Responder e confirmar são UMA gravação lógica. Se qualquer passo
      // falhar, a transação não deixa metade do gesto no banco.
      if (original) {
        const agora = new Date();
        await tx.logisticaRecado.updateMany({
          where: {
            id: original.id,
            companyId,
            motoristaUserId,
            origem: ORIGEM_ESCRITORIO,
          },
          data: {
            vistoEm: agora,
            ...(NIVEL_COBRA_ACK.includes(original.nivel) ? { ackEm: agora } : {}),
          },
        });
      }
      return this.toDTO(row);
    });
  }

  // ── LEITURA (cockpit) ─────────────────────────────────────────────────────
  /** O fio de UMA pessoa, do mais antigo pro mais novo (ordem de leitura). */
  async fio(companyId: number, motoristaUserId: number): Promise<RecadoDTO[]> {
    if (!companyId || !motoristaUserId) return [];
    const rows = await this.prisma.logisticaRecado.findMany({
      where: { companyId, motoristaUserId },
      orderBy: { createdAt: 'desc' },
      take: FIO_TAKE,
    });
    return rows.reverse().map((row) => this.toDTO(row));
  }

  /**
   * Quantas respostas do motorista o escritório ainda não abriu, POR pessoa —
   * é o badge vermelho do elenco. Uma query, não uma por motorista.
   */
  async naoLidosPorMotorista(companyId: number): Promise<Record<number, number>> {
    if (!companyId) return {};
    const rows = await this.prisma.logisticaRecado.groupBy({
      by: ['motoristaUserId'],
      where: { companyId, origem: ORIGEM_MOTORISTA, vistoEm: null },
      _count: { _all: true },
    });
    const mapa: Record<number, number> = {};
    for (const row of rows) mapa[row.motoristaUserId] = row._count._all;
    return mapa;
  }

  /** O escritório abriu o fio: as respostas daquela pessoa deixam de ser novas. */
  async marcarFioLido(companyId: number, motoristaUserId: number): Promise<number> {
    if (!companyId || !motoristaUserId) return 0;
    const res = await this.prisma.logisticaRecado.updateMany({
      where: { companyId, motoristaUserId, origem: ORIGEM_MOTORISTA, vistoEm: null },
      data: { vistoEm: new Date() },
    });
    return res.count;
  }

  // ── APK ───────────────────────────────────────────────────────────────────
  /**
   * O aparelho puxa o que ainda não recebeu. O ✓✓ só nasce no endpoint
   * `recebidos`, DEPOIS de a resposta HTTP chegar e ser persistida no aparelho.
   *
   * Marcar na entrega — e não no "abriu" — é o que separa "chegou no aparelho"
   * de "a pessoa leu": são dois estados diferentes e o dono precisa dos dois
   * (é a diferença entre "o celular está desligado" e "ele está ignorando").
   */
  async puxar(companyId: number, motoristaUserId: number): Promise<RecadoDTO[]> {
    if (!companyId || !motoristaUserId) return [];
    const rows = await this.prisma.logisticaRecado.findMany({
      where: { companyId, motoristaUserId, origem: ORIGEM_ESCRITORIO, entregueEm: null },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    return rows.map((row) => this.toDTO(row));
  }

  /** Confirma o recebimento somente depois de o conteúdo estar no aparelho. */
  async marcarRecebidos(companyId: number, motoristaUserId: number, ids: string[]): Promise<number> {
    const lista = this.idsSeguros(ids);
    if (!companyId || !motoristaUserId || !lista.length) return 0;
    const res = await this.prisma.logisticaRecado.updateMany({
      where: {
        id: { in: lista },
        companyId,
        motoristaUserId,
        origem: ORIGEM_ESCRITORIO,
        entregueEm: null,
      },
      data: { entregueEm: new Date() },
    });
    return res.count;
  }

  /**
   * O PORTÃO: recado urgente/alarme que chegou e ainda não teve "Entendi".
   *
   * O APK chama antes de liberar Confirmar/Cheguei. Devolve vazio = caminho
   * livre. Só cobra o que JÁ está no aparelho (`entregueEm` != null): recado
   * que a rede ainda não trouxe não pode travar a rua.
   */
  async portao(companyId: number, motoristaUserId: number): Promise<RecadoDTO[]> {
    if (!companyId || !motoristaUserId) return [];
    const rows = await this.prisma.logisticaRecado.findMany({
      where: {
        companyId,
        motoristaUserId,
        origem: ORIGEM_ESCRITORIO,
        nivel: { in: [...NIVEL_COBRA_ACK] },
        entregueEm: { not: null },
        ackEm: null,
      },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });
    return rows.map((row) => this.toDTO(row));
  }

  /** "Entendi" do portão (e o visto que vem junto — ele leu pra poder clicar). */
  async confirmar(companyId: number, motoristaUserId: number, id: string): Promise<boolean> {
    if (!companyId || !motoristaUserId || !id) return false;
    const agora = new Date();
    const res = await this.prisma.logisticaRecado.updateMany({
      where: {
        id: String(id).trim(),
        companyId,
        motoristaUserId,
        origem: ORIGEM_ESCRITORIO,
        nivel: { in: [...NIVEL_COBRA_ACK] },
        entregueEm: { not: null },
        ackEm: null,
      },
      data: { ackEm: agora, vistoEm: agora },
    });
    return res.count > 0;
  }

  /** Abriu a lista no app: marca visto sem exigir "Entendi". */
  async marcarVisto(companyId: number, motoristaUserId: number, ids: string[]): Promise<number> {
    const lista = this.idsSeguros(ids);
    if (!companyId || !motoristaUserId || !lista.length) return 0;
    const res = await this.prisma.logisticaRecado.updateMany({
      where: { id: { in: lista }, companyId, motoristaUserId, vistoEm: null },
      data: { vistoEm: new Date() },
    });
    return res.count;
  }

  // ── Internos ──────────────────────────────────────────────────────────────
  /**
   * Quem tem trabalho HOJE — a definição operacional de "na rua". Inclui quem
   * já entregou tudo (ele continua na rua até encerrar) e exclui quem não tem
   * parada nenhuma (mandar recado de rota pra quem está de folga é ruído).
   */
  private async quemEstaNaRua(companyId: number, routeDate: string): Promise<number[]> {
    const { start, end } = rangeDoDia(routeDate);
    const rows = await this.prisma.entrega.groupBy({
      by: ['entregadorId'],
      where: {
        companyId,
        entregadorId: { not: null },
        OR: [
          { scheduledAt: { gte: start, lte: end } },
          { scheduledAt: null, status: { in: [...OPEN_STATUS] } },
        ],
      },
    });
    return rows
      .map((row) => Number(row.entregadorId))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  /**
   * Destinatário precisa ser gente DESTA empresa e que pode dirigir — a mesma
   * régua de `listarEntregadores` (quem aparece no cockpit é quem recebe).
   * Fail-closed: id de outra empresa vira 404, nunca vazamento.
   */
  private async exigirMotorista(companyId: number, paraUserIdRaw: unknown): Promise<number> {
    const paraUserId = Math.trunc(Number(paraUserIdRaw));
    if (!Number.isInteger(paraUserId) || paraUserId <= 0) {
      throw new BadRequestException('Escolha para quem mandar o recado.');
    }
    const pessoa = await this.prisma.user.findFirst({
      where: { id: paraUserId, companyId, isActive: true, isSystemMaster: false },
      select: { id: true, name: true, email: true, username: true, role: true, companyId: true, isSystemMaster: true },
    });
    if (!pessoa) throw new NotFoundException('Pessoa não encontrada nesta empresa.');
    const capacidades = await resolveOperationalCapabilities(this.prisma, pessoa as any);
    if (!capacidades.includes('DRIVER')) {
      throw new BadRequestException('Essa pessoa não dirige — o recado não teria onde aparecer.');
    }
    return pessoa.id;
  }

  /** Acorda os aparelhos das pessoas (best-effort, nunca derruba o envio). */
  private async tocarCampainha(companyId: number, userIds: number[]): Promise<void> {
    if (!this.push || !userIds.length) return;
    const aparelhos = await this.prisma.mobileDevice.findMany({
      where: { companyId, userId: { in: userIds }, revokedAt: null, pushToken: { not: null } },
      select: { id: true, pushToken: true },
      take: 50,
    });
    for (const aparelho of aparelhos) {
      try {
        await this.push.sendWake(aparelho.pushToken);
      } catch {
        // Campainha muda não invalida o recado: o polling do APK entrega.
      }
    }
  }

  private nivelSeguro(valor: unknown): RecadoNivel {
    const limpo = String(valor ?? 'normal').trim().toLowerCase();
    return (NIVEIS as readonly string[]).includes(limpo) ? (limpo as RecadoNivel) : 'normal';
  }

  private idsSeguros(ids: string[]): string[] {
    return [...new Set((Array.isArray(ids) ? ids : [])
      .map((id) => String(id || '').trim())
      .filter((id) => id.length > 0 && id.length <= 64))]
      .slice(0, 50);
  }

  private diaSeguro(dateInput?: string): string {
    try {
      return canonicalRouteDate(dateInput);
    } catch {
      return canonicalRouteDate();
    }
  }

  private toDTO(row: {
    id: string;
    motoristaUserId: number;
    origem: string;
    autorNome: string;
    texto: string;
    nivel: string;
    loteId: string | null;
    createdAt: Date;
    entregueEm: Date | null;
    vistoEm: Date | null;
    ackEm: Date | null;
  }): RecadoDTO {
    return {
      id: row.id,
      motoristaUserId: row.motoristaUserId,
      origem: row.origem === ORIGEM_MOTORISTA ? ORIGEM_MOTORISTA : ORIGEM_ESCRITORIO,
      autorNome: row.autorNome,
      texto: row.texto,
      nivel: this.nivelSeguro(row.nivel),
      loteId: row.loteId,
      criadoEm: row.createdAt.toISOString(),
      entregueEm: row.entregueEm?.toISOString() ?? null,
      vistoEm: row.vistoEm?.toISOString() ?? null,
      ackEm: row.ackEm?.toISOString() ?? null,
      estado: row.ackEm ? 'entendido' : row.vistoEm ? 'visto' : row.entregueEm ? 'no_aparelho' : 'enviado',
    };
  }
}

/** Janela local do dia (mesma semântica do resolveDayRange e do rota-aviso). */
function rangeDoDia(routeDate: string): { start: Date; end: Date } {
  const [ano, mes, dia] = routeDate.split('-').map(Number);
  const start = new Date(ano, (mes || 1) - 1, dia || 1, 0, 0, 0, 0);
  const end = new Date(ano, (mes || 1) - 1, dia || 1, 23, 59, 59, 999);
  return { start, end };
}
