import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MobilePushService } from '../auth/mobile-push.service';
import { canonicalRouteDate } from './logistica-route-billing.util';
import { linhaEnderecoDaFonte } from './logistica-geo-fonte.util';
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

/* ── ANEXO (12/08) — o recado que CARREGA trabalho ──────────────────────────
 *
 * 🔴 POR QUE NO CHAT E NÃO NUMA TELA DE "ROTA INDICADA". Essa tela existiu e
 * morreu no corte de 06/08: 4 linhas na história inteira, servidas por 2.981
 * chamadas de poll. Canal próprio para um gesto raro é caro e ninguém aprende a
 * usar. Ordem do dono: *"o mecanismo de 'fazem a rota pra mim' fica no chat —
 * todo motorista sabe usar chat"*. O que renasce daqui é só o DESENHO DE
 * ESTADOS da falecida (pendente → aceita/negada), nunca o canal.
 *
 * 🔴 NEGAR NÃO PRECISA LIMPAR NADA. A parada só é criada no 'encaixar'; até lá
 * o anexo é uma REFERÊNCIA (um id) dentro de uma mensagem. Então "a rota
 * recebida é limpa, não fica presa em limbo nenhum" sai de graça da construção
 * — e o que sobra é o que o dono quer que sobre: a linha no histórico do chat
 * dizendo que negou, com ou sem motivo.
 */
const ANEXO_TIPOS = ['parada', 'rota'] as const;
export type RecadoAnexoTipo = (typeof ANEXO_TIPOS)[number];
const ANEXO_PENDENTE = 'pendente';
const ANEXO_FINAIS = ['encaixada', 'negada'] as const;
export type RecadoAnexoEstado = typeof ANEXO_PENDENTE | (typeof ANEXO_FINAIS)[number];

/** O que a Central manda: só o id — nome e endereço são resolvidos na leitura. */
export type RecadoAnexoInput =
  | { tipo: 'parada'; contaId: string }
  | { tipo: 'rota'; rotaModeloId: string };

/** O que a tela recebe: o id MAIS o que dá pra ler sem abrir outra tela. */
export interface RecadoAnexoDTO {
  tipo: RecadoAnexoTipo;
  contaId: string | null;
  rotaModeloId: string | null;
  /** "Mercado Estrela" · "Rota da Quarta" — vazio = a referência sumiu do cadastro. */
  nome: string;
  /** "R. das Orquídeas, 55" · "6 paradas". */
  detalhe: string;
  /** Só em rota: quantas paradas ela tem hoje. */
  paradas: number | null;
  estado: RecadoAnexoEstado;
}

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
  /** null = recado só de texto (todo o banco de antes de 12/08). */
  anexo: RecadoAnexoDTO | null;
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
  /**
   * O trabalho grudado no texto (12/08). Só em recado individual.
   *
   * CRU de propósito — quem chega aqui é o DTO, que só garante forma; quem
   * garante SENTIDO (o par tipo×id, e a empresa dona) é `anexoSeguro`. Tipar a
   * entrada como união já validada seria o contrato mentindo sobre onde a
   * conferência acontece.
   */
  anexo?: { tipo?: string; contaId?: string; rotaModeloId?: string } | null;
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

    /* 🔴 ANEXO NÃO ENTRA EM BROADCAST. O anexo é uma decisão de UMA pessoa
       ("encaixa esta parada na SUA rota"); mandado pra todo mundo na rua, cinco
       motoristas encaixariam a mesma parada e o cliente receberia cinco
       visitas. Recusa explícita e cedo — antes de qualquer escrita. */
    const anexo = await this.anexoSeguro(companyId, input?.anexo, ehBroadcast);

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
            // null vs 'pendente' são coisas diferentes: null = recado sem anexo
            // (o banco inteiro de antes de 12/08); 'pendente' = há trabalho
            // grudado e ninguém decidiu ainda.
            ...(anexo ? { anexoJson: anexo, anexoEstado: ANEXO_PENDENTE } : {}),
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

    return this.comAnexos(companyId, criados);
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
    return this.comAnexos(companyId, rows.reverse());
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
    if (!alvo) return this.comAnexos(companyId, rows);

    const meus = rows.filter((row) => !row.deviceId || row.deviceId === alvo);
    const deOutro = rows.filter((row) => row.deviceId && row.deviceId !== alvo);
    if (!deOutro.length) return this.comAnexos(companyId, meus);

    const resgatados = await this.resgatarDeAlvoFrio(companyId, alvo, deOutro);
    return this.comAnexos(
      companyId,
      [...meus, ...resgatados].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    );
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
    return this.comAnexos(companyId, rows);
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

  // ── ANEXO (12/08) ─────────────────────────────────────────────────────────
  /**
   * O DESFECHO. O motorista decidiu o que fazer com o trabalho que veio grudado.
   *
   * 🔴 IDEMPOTENTE POR DESENHO. O aparelho repete o gesto quando a rede engasga
   * (é a mesma lei do "Entendi"), e estado JÁ FINAL responde `ok` sem mudar
   * nada: transformar um encaixe gravado em erro na segunda tentativa faria o
   * motorista encaixar a parada duas vezes.
   *
   * 🔴 DECIDIR É LER — E LER DESTRAVA O PORTÃO. Recado urgente com anexo cobra
   * o "Entendi"; se negar sem motivo não carimbasse `ackEm`, o motorista
   * decidiria o anexo e continuaria travado pra fechar a próxima entrega, por
   * um recado que ele acabou de responder com o dedo. Mesmo carimbo que o
   * `responder` já dá — e pela mesma razão.
   */
  async decidirAnexo(
    companyId: number,
    motoristaUserId: number,
    id: string,
    acao: 'encaixar' | 'negar',
  ): Promise<{ ok: true; estado: RecadoAnexoEstado }> {
    if (!companyId || !motoristaUserId) throw new BadRequestException('Sessão inválida.');
    const recadoId = String(id || '').trim();
    if (!recadoId) throw new BadRequestException('Recado não informado.');
    const destino: RecadoAnexoEstado = acao === 'encaixar' ? 'encaixada' : 'negada';

    const linha = await this.prisma.logisticaRecado.findFirst({
      where: { id: recadoId, companyId, motoristaUserId, origem: ORIGEM_ESCRITORIO },
      select: { id: true, nivel: true, anexoJson: true, anexoEstado: true },
    });
    // Fail-closed: recado de outra empresa/pessoa é 404, nunca vazamento.
    if (!linha) throw new NotFoundException('Recado não encontrado neste aparelho.');
    if (!this.lerAnexo(linha.anexoJson)) {
      throw new BadRequestException('Este recado não tem rota nem parada anexada.');
    }
    const atual = String(linha.anexoEstado || ANEXO_PENDENTE);
    if ((ANEXO_FINAIS as readonly string[]).includes(atual)) {
      return { ok: true, estado: atual as RecadoAnexoEstado };
    }

    const agora = new Date();
    await this.prisma.logisticaRecado.updateMany({
      where: {
        id: recadoId,
        companyId,
        motoristaUserId,
        origem: ORIGEM_ESCRITORIO,
        // A corrida entre dois toques morre aqui: quem chega segundo não acha
        // linha pendente e o `findFirst` acima já devolveu o estado final.
        anexoEstado: ANEXO_PENDENTE,
      },
      data: {
        anexoEstado: destino,
        vistoEm: agora,
        ...(NIVEL_COBRA_ACK.includes(String(linha.nivel)) ? { ackEm: agora } : {}),
      },
    });
    this.logger.log(
      `[logistica] anexo do recado ${recadoId} company=${companyId} motorista=${motoristaUserId} -> ${destino}`,
    );
    return { ok: true, estado: destino };
  }

  /**
   * O anexo que a Central mandou, conferido contra a EMPRESA de quem manda.
   *
   * Multi-tenant é a única coisa que este método existe pra garantir: sem ele,
   * um id de conta de outra empresa viraria uma parada real na rota de alguém
   * — que é o pior vazamento possível, porque ele sai andando na rua.
   */
  private async anexoSeguro(
    companyId: number,
    bruto: { tipo?: string; contaId?: string; rotaModeloId?: string } | null | undefined,
    ehBroadcast: boolean,
  ): Promise<RecadoAnexoInput | null> {
    if (!bruto) return null;
    if (ehBroadcast) {
      throw new BadRequestException('Recado com parada ou rota anexada é para UMA pessoa.');
    }
    const tipo = String((bruto as any).tipo || '').trim();

    if (tipo === 'parada') {
      const contaId = String((bruto as any).contaId || '').trim();
      if (!contaId) throw new BadRequestException('Escolha o cliente da parada.');
      const conta = await this.prisma.customerProfile.findFirst({
        where: { id: contaId, companyId },
        select: { id: true },
      });
      if (!conta) throw new NotFoundException('Cliente não encontrado nesta empresa.');
      return { tipo: 'parada', contaId };
    }

    if (tipo === 'rota') {
      const rotaModeloId = String((bruto as any).rotaModeloId || '').trim();
      if (!rotaModeloId) throw new BadRequestException('Escolha a rota salva.');
      const modelo = await this.prisma.logisticaRotaModelo.findFirst({
        where: { id: rotaModeloId, companyId },
        select: { id: true },
      });
      if (!modelo) throw new NotFoundException('Rota salva não encontrada nesta empresa.');
      return { tipo: 'rota', rotaModeloId };
    }

    throw new BadRequestException('Só dá pra anexar uma parada ou uma rota salva.');
  }

  /** O JSON do banco de volta na forma canônica — ou null se não for anexo. */
  private lerAnexo(valor: unknown): RecadoAnexoInput | null {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
    const tipo = String((valor as any).tipo || '');
    if (tipo === 'parada') {
      const contaId = String((valor as any).contaId || '').trim();
      return contaId ? { tipo: 'parada', contaId } : null;
    }
    if (tipo === 'rota') {
      const rotaModeloId = String((valor as any).rotaModeloId || '').trim();
      return rotaModeloId ? { tipo: 'rota', rotaModeloId } : null;
    }
    return null;
  }

  /**
   * Uma lista de recados vira DTO com os anexos RESOLVIDOS — duas queries no
   * pior caso (contas + rotas), nunca uma por linha. O fio tem 40 linhas e o
   * poll do aparelho roda de 5 em 5 segundos: uma query por recado aqui viraria
   * tráfego de banco proporcional à conversa.
   */
  private async comAnexos<T extends LinhaDeRecado>(companyId: number, rows: T[]): Promise<RecadoDTO[]> {
    const anexos = rows.map((row) => this.lerAnexo((row as any).anexoJson));
    if (!anexos.some(Boolean)) return rows.map((row) => this.toDTO(row));

    const contaIds = [...new Set(anexos.filter((a) => a?.tipo === 'parada').map((a) => (a as any).contaId))];
    const rotaIds = [...new Set(anexos.filter((a) => a?.tipo === 'rota').map((a) => (a as any).rotaModeloId))];

    const [contas, rotas] = await Promise.all([
      contaIds.length
        ? this.prisma.customerProfile.findMany({
            where: { id: { in: contaIds }, companyId },
            select: { id: true, name: true, endereco: true, numero: true, bairro: true, cidade: true },
          })
        : Promise.resolve([] as any[]),
      rotaIds.length
        ? this.prisma.logisticaRotaModelo.findMany({
            where: { id: { in: rotaIds }, companyId },
            // A CONTAGEM sai da relação (a tabela é a fonte desde 09/08, quando
            // o `paradasJson` foi dropado por divergir dela em produção).
            select: { id: true, nome: true, paradas: { select: { id: true } } },
          })
        : Promise.resolve([] as any[]),
    ]);
    const porConta = new Map((contas as any[]).map((c) => [String(c.id), c]));
    const porRota = new Map((rotas as any[]).map((r) => [String(r.id), r]));

    return rows.map((row, i) => {
      const anexo = anexos[i];
      if (!anexo) return this.toDTO(row);
      const estado = this.estadoDoAnexo((row as any).anexoEstado);
      if (anexo.tipo === 'parada') {
        const conta = porConta.get(anexo.contaId);
        return this.toDTO(row, {
          tipo: 'parada',
          contaId: anexo.contaId,
          rotaModeloId: null,
          // Conta apagada do cadastro depois do envio: nome VAZIO, e a tela diz
          // isso em vez de mostrar um card mudo com botão de encaixar.
          nome: String(conta?.name || '').trim(),
          detalhe: conta ? linhaEnderecoDaFonte(conta) : '',
          paradas: null,
          estado,
        });
      }
      const rota = porRota.get(anexo.rotaModeloId);
      const quantas = rota ? (rota.paradas as any[]).length : 0;
      return this.toDTO(row, {
        tipo: 'rota',
        contaId: null,
        rotaModeloId: anexo.rotaModeloId,
        nome: String(rota?.nome || '').trim(),
        detalhe: rota ? `${quantas} ${quantas === 1 ? 'parada' : 'paradas'}` : '',
        paradas: rota ? quantas : null,
        estado,
      });
    });
  }

  private estadoDoAnexo(valor: unknown): RecadoAnexoEstado {
    const limpo = String(valor ?? ANEXO_PENDENTE).trim();
    return (ANEXO_FINAIS as readonly string[]).includes(limpo)
      ? (limpo as RecadoAnexoEstado)
      : ANEXO_PENDENTE;
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

  private toDTO(row: LinhaDeRecado, anexo: RecadoAnexoDTO | null = null): RecadoDTO {
    return {
      anexo,
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

/**
 * A linha do banco como o `toDTO` precisa dela. `anexoJson`/`anexoEstado` são
 * OPCIONAIS aqui de propósito: quem chama `toDTO` direto (a resposta do
 * motorista, que nunca tem anexo) não precisa selecioná-las.
 */
interface LinhaDeRecado {
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
  anexoJson?: unknown;
  anexoEstado?: string | null;
}

/** Janela local do dia (mesma semântica do resolveDayRange e do rota-aviso). */
function rangeDoDia(routeDate: string): { start: Date; end: Date } {
  const [ano, mes, dia] = routeDate.split('-').map(Number);
  const start = new Date(ano, (mes || 1) - 1, dia || 1, 0, 0, 0, 0);
  const end = new Date(ano, (mes || 1) - 1, dia || 1, 23, 59, 59, 999);
  return { start, end };
}
