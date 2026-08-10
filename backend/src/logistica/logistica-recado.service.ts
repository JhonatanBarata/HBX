import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MobilePushService } from '../auth/mobile-push.service';
import { canonicalRouteDate } from './logistica-route-billing.util';
import { resolveOperationalCapabilities } from '../team/operational-capabilities';
import {
  AparelhoCandidato,
  elegiveisParaOperacao,
  resolverAparelhoDoTurno,
  ultimoSinal,
} from './aparelho-do-turno';

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
 *
 * 🔴 RECADO TEM APARELHO (08/08): até aqui o recado era só DA PESSOA e o
 * primeiro celular que puxasse carimbava `entregueEm` pra todos — dois
 * aparelhos no mesmo login e o segundo nunca recebia (o painel ainda dizia ✓).
 * Agora cada recado nasce com `deviceId`: o aparelho do turno daquela pessoa
 * (régua única em `aparelho-do-turno.ts`) ou o que a tela escolheu. `deviceId`
 * null = recado antigo, entra no primeiro aparelho elegível — compat, sem
 * backfill.
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
/**
 * Alvo CALADO há mais que isto entrega o recado pro próximo aparelho elegível
 * da pessoa (ver `resgatarDeAlvoFrio`). 15 min é o tamanho de uma pausa de café
 * com o celular na mochila — abaixo disso a gente estaria trocando de aparelho
 * por causa de um túnel ou de um elevador.
 */
const ALVO_FRIO_MS = 15 * 60_000;

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
  /**
   * Aparelho alvo escolhido NA TELA (o campo já vem preenchido com o do turno;
   * trocar é a exceção — aparelho quebrou, pegou outro e ninguém registrou).
   * Só vale em recado individual: em broadcast cada pessoa tem o aparelho dela.
   */
  deviceId?: string | null;
}

/** Uma linha da tela "vai para qual aparelho". */
export interface AparelhoDaPessoa {
  deviceId: string;
  nome: string;
  ultimoSinalEm: string | null;
  recebeOperacao: boolean;
  fixado: boolean;
  /** É este que recebe se ninguém trocar nada. */
  doTurno: boolean;
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

    // Em QUAL celular cada recado cai. Uma query pra todos os destinos: mesmo o
    // broadcast de 12 pessoas resolve o alvo sem 12 idas ao banco.
    const alvoPorPessoa = await this.resolverAlvos(companyId, destinos, {
      // Escolha da tela só existe em recado individual — em broadcast, cada
      // pessoa tem o aparelho DELA (um deviceId só destruiria o disparo).
      deviceIdEscolhido: ehBroadcast ? null : input?.deviceId ?? null,
    });

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
            deviceId: alvoPorPessoa.get(motoristaUserId) ?? null,
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
    void this.tocarCampainha(
      companyId,
      destinos.map((motoristaUserId) => ({
        userId: motoristaUserId,
        deviceId: alvoPorPessoa.get(motoristaUserId) ?? null,
      })),
    ).catch(() => undefined);

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
  async puxar(
    companyId: number,
    motoristaUserId: number,
    deviceId?: string | null,
  ): Promise<RecadoDTO[]> {
    if (!companyId || !motoristaUserId) return [];
    const rows = await this.prisma.logisticaRecado.findMany({
      where: { companyId, motoristaUserId, origem: ORIGEM_ESCRITORIO, entregueEm: null },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    if (!rows.length) return [];

    const alvo = String(deviceId || '').trim();
    // Chamada sem aparelho (navegador do admin): comportamento de antes.
    if (!alvo) return rows.map((row) => this.toDTO(row));

    const meus = rows.filter((row) => !row.deviceId || row.deviceId === alvo);
    const deOutro = rows.filter((row) => row.deviceId && row.deviceId !== alvo);
    if (!deOutro.length) return meus.map((row) => this.toDTO(row));

    const resgatados = await this.resgatarDeAlvoFrio(companyId, alvo, deOutro);
    return [...meus, ...resgatados]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((row) => this.toDTO(row));
  }

  /**
   * O FREIO DO RECADO PRESO (08/08).
   *
   * Endereçar o recado a um aparelho cria um jeito novo de ele sumir: celular
   * alvo sem bateria, esquecido na base, ou a pessoa pegou outro sem avisar — e
   * o urgente fica mudo a manhã inteira enquanto ela está com OUTRO aparelho da
   * empresa na mão. Então: se o alvo saiu da operação (ou está calado há mais de
   * ALVO_FRIO_MS) e um aparelho elegível DA MESMA PESSOA está pedindo agora, ele
   * leva — e o recado é REENDEREÇADO pra ele, pra que o "recebi" seja dele e o
   * painel pare de apontar o celular errado.
   *
   * Isto NÃO ressuscita o bug que gerou tudo: aparelho de teste/base tem
   * `recebeOperacao=false` e nunca chega aqui (quem pede já passou pelo gate).
   */
  private async resgatarDeAlvoFrio<T extends { id: string; deviceId: string | null }>(
    companyId: number,
    deviceId: string,
    pendentes: T[],
  ): Promise<T[]> {
    const quemPede = await this.prisma.mobileDevice.findFirst({
      where: { id: deviceId, companyId },
      select: { id: true, revokedAt: true, ocultoEm: true, recebeOperacao: true },
    });
    // Quem pede precisa estar na operação: aparelho de teste não resgata nada.
    if (!quemPede || !elegiveisParaOperacao([quemPede as AparelhoCandidato]).length) return [];

    const alvos = Array.from(new Set(pendentes.map((row) => String(row.deviceId))));
    const linhas = await this.prisma.mobileDevice.findMany({
      where: { id: { in: alvos }, companyId },
      select: {
        id: true,
        revokedAt: true,
        ocultoEm: true,
        recebeOperacao: true,
        ultimaTelaAt: true,
        lastUsedAt: true,
      },
    });
    const porId = new Map(linhas.map((linha) => [String(linha.id), linha]));
    const agora = Date.now();

    const frios = pendentes.filter((row) => {
      const dono = porId.get(String(row.deviceId));
      // Alvo que sumiu do banco (aparelho apagado) é órfão na hora.
      if (!dono) return true;
      if (!elegiveisParaOperacao([dono as AparelhoCandidato]).length) return true;
      const sinal = ultimoSinal(dono as AparelhoCandidato);
      return !sinal || agora - sinal > ALVO_FRIO_MS;
    });
    if (!frios.length) return [];

    const ids = frios.map((row) => String(row.id));
    await this.prisma.logisticaRecado.updateMany({
      where: { id: { in: ids }, companyId, entregueEm: null },
      data: { deviceId },
    });
    this.logger.log(
      `[logistica] recado resgatado de aparelho frio company=${companyId} para=${deviceId} qtd=${ids.length}`,
    );
    return frios.map((row) => ({ ...row, deviceId }));
  }

  /**
   * O que ESTE aparelho pode levar: o que foi endereçado a ele + o que não tem
   * dono (recado antigo, ou pessoa que não tinha aparelho elegível no envio).
   * Sem `deviceId` (chamada legada) o filtro some — comportamento de antes.
   */
  private filtroDoAparelho(deviceId?: string | null) {
    const alvo = String(deviceId || '').trim();
    if (!alvo) return {};
    return { OR: [{ deviceId: alvo }, { deviceId: null }] };
  }

  /** Confirma o recebimento somente depois de o conteúdo estar no aparelho. */
  async marcarRecebidos(
    companyId: number,
    motoristaUserId: number,
    ids: string[],
    deviceId?: string | null,
  ): Promise<number> {
    const lista = this.idsSeguros(ids);
    if (!companyId || !motoristaUserId || !lista.length) return 0;
    const res = await this.prisma.logisticaRecado.updateMany({
      where: {
        id: { in: lista },
        companyId,
        motoristaUserId,
        origem: ORIGEM_ESCRITORIO,
        entregueEm: null,
        ...this.filtroDoAparelho(deviceId),
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
  async portao(
    companyId: number,
    motoristaUserId: number,
    deviceId?: string | null,
  ): Promise<RecadoDTO[]> {
    if (!companyId || !motoristaUserId) return [];
    const rows = await this.prisma.logisticaRecado.findMany({
      where: {
        companyId,
        motoristaUserId,
        origem: ORIGEM_ESCRITORIO,
        nivel: { in: [...NIVEL_COBRA_ACK] },
        entregueEm: { not: null },
        ackEm: null,
        ...this.filtroDoAparelho(deviceId),
      },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });
    return rows.map((row) => this.toDTO(row));
  }

  /** "Entendi" do portão (e o visto que vem junto — ele leu pra poder clicar). */
  async confirmar(companyId: number, motoristaUserId: number, id: string): Promise<boolean> {
    if (!companyId || !motoristaUserId || !id) return false;
    const recadoId = String(id).trim();
    const existente = await this.prisma.logisticaRecado.findFirst({
      where: {
        id: recadoId,
        companyId,
        motoristaUserId,
        origem: ORIGEM_ESCRITORIO,
        nivel: { in: [...NIVEL_COBRA_ACK] },
        entregueEm: { not: null },
      },
      select: { id: true },
    });
    if (!existente) return false;
    const agora = new Date();
    await this.prisma.logisticaRecado.updateMany({
      where: {
        id: recadoId,
        companyId,
        motoristaUserId,
        origem: ORIGEM_ESCRITORIO,
        nivel: { in: [...NIVEL_COBRA_ACK] },
        entregueEm: { not: null },
        ackEm: null,
      },
      data: { ackEm: agora, vistoEm: agora },
    });
    // Retry do mesmo gesto também é sucesso: o aparelho mantém a resposta
    // nativa até receber `ok`, então rede interrompida não pode transformar um
    // "Entendi" já gravado em erro na tentativa seguinte.
    return true;
  }

  /** Abriu a lista no app: marca visto sem exigir "Entendi". */
  async marcarVisto(companyId: number, motoristaUserId: number, ids: string[]): Promise<number> {
    const lista = this.idsSeguros(ids);
    if (!companyId || !motoristaUserId || !lista.length) return 0;
    const res = await this.prisma.logisticaRecado.updateMany({
      where: { id: { in: lista }, companyId, motoristaUserId, origem: ORIGEM_ESCRITORIO, vistoEm: null },
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

  /**
   * Acorda SÓ o aparelho que vai receber (best-effort, nunca derruba o envio).
   *
   * Tocar em todos os aparelhos da pessoa era metade do bug: o aparelho de
   * teste (e o que está na base carregando) acordava junto e podia puxar
   * primeiro. Alvo sem `deviceId` (recado antigo) mantém o comportamento
   * anterior, mas já filtrando os aparelhos elegíveis.
   */
  private async tocarCampainha(
    companyId: number,
    alvos: Array<{ userId: number; deviceId: string | null }>,
  ): Promise<void> {
    if (!this.push || !alvos.length) return;
    const comAlvo = alvos.filter((alvo) => !!alvo.deviceId).map((alvo) => alvo.deviceId as string);
    const semAlvo = alvos.filter((alvo) => !alvo.deviceId).map((alvo) => alvo.userId);

    const aparelhos = await this.prisma.mobileDevice.findMany({
      where: {
        companyId,
        revokedAt: null,
        pushToken: { not: null },
        OR: [
          ...(comAlvo.length ? [{ id: { in: comAlvo } }] : []),
          ...(semAlvo.length ? [{ userId: { in: semAlvo } }] : []),
        ],
      },
      select: {
        id: true,
        pushToken: true,
        revokedAt: true,
        ocultoEm: true,
        recebeOperacao: true,
      },
      take: 50,
    });
    if (!aparelhos.length) return;

    for (const aparelho of elegiveisParaOperacao(aparelhos as any[])) {
      try {
        await this.push.sendWake((aparelho as any).pushToken);
      } catch {
        // Campainha muda não invalida o recado: o polling do APK entrega.
      }
    }
  }

  // ── APARELHO DO TURNO ─────────────────────────────────────────────────────
  /**
   * Em qual aparelho cai o recado de cada pessoa. Uma query só; a decisão em si
   * é da régua pura (`resolverAparelhoDoTurno`), que tem teste próprio.
   */
  private async resolverAlvos(
    companyId: number,
    userIds: number[],
    options: { deviceIdEscolhido?: string | null } = {},
  ): Promise<Map<number, string | null>> {
    const mapa = new Map<number, string | null>();
    if (!userIds.length) return mapa;

    const aparelhos = await this.prisma.mobileDevice.findMany({
      where: { companyId, userId: { in: userIds }, revokedAt: null },
      select: {
        id: true,
        userId: true,
        name: true,
        revokedAt: true,
        ocultoEm: true,
        recebeOperacao: true,
        principalDesde: true,
        ultimaTelaAt: true,
        lastUsedAt: true,
      },
      take: 200,
    });

    const escolhido = String(options?.deviceIdEscolhido || '').trim();
    for (const userId of userIds) {
      const daPessoa = aparelhos.filter((linha) => Number(linha.userId) === Number(userId));
      if (escolhido && userIds.length === 1) {
        // Escolha explícita da tela: tem que ser um aparelho DELA e elegível —
        // senão o recado nasceria endereçado a um celular que nunca vai puxar.
        const valido = elegiveisParaOperacao(daPessoa as AparelhoCandidato[]).find(
          (linha) => String(linha.id) === escolhido,
        );
        if (!valido) {
          throw new BadRequestException('Esse aparelho não está disponível para esta pessoa.');
        }
        mapa.set(userId, String(valido.id));
        continue;
      }
      const alvo = resolverAparelhoDoTurno(daPessoa as AparelhoCandidato[]);
      mapa.set(userId, alvo ? String(alvo.id) : null);
    }
    return mapa;
  }

  /**
   * Os aparelhos de UMA pessoa pra tela de disparo — já marcando qual recebe.
   * É o que impede o "escolhe às cegas": o campo nasce preenchido.
   */
  async aparelhosDaPessoa(companyId: number, motoristaUserId: number): Promise<AparelhoDaPessoa[]> {
    if (!companyId || !motoristaUserId) return [];
    const aparelhos = await this.prisma.mobileDevice.findMany({
      where: { companyId, userId: motoristaUserId, revokedAt: null, ocultoEm: null },
      select: {
        id: true,
        name: true,
        ocultoEm: true,
        revokedAt: true,
        recebeOperacao: true,
        principalDesde: true,
        ultimaTelaAt: true,
        lastUsedAt: true,
      },
      take: 20,
    });
    const alvo = resolverAparelhoDoTurno(aparelhos as AparelhoCandidato[]);
    return aparelhos.map((linha) => {
      const sinal = Math.max(
        linha.ultimaTelaAt ? new Date(linha.ultimaTelaAt).getTime() : 0,
        linha.lastUsedAt ? new Date(linha.lastUsedAt).getTime() : 0,
      );
      return {
        deviceId: String(linha.id),
        nome: linha.name || 'Aparelho Android',
        ultimoSinalEm: sinal > 0 ? new Date(sinal).toISOString() : null,
        recebeOperacao: (linha as any).recebeOperacao !== false,
        fixado: !!(linha as any).principalDesde,
        doTurno: !!alvo && String(alvo.id) === String(linha.id),
      };
    });
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
