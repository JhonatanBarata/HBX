import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../messaging/conversations.service';
import { normalizeBrPhoneE164 } from '../messaging/whatsapp-channel';
import { canonicalRouteDate } from './logistica-route-billing.service';
import { haversineMeters } from './logistica-tracking.service';
import { isSentinelaWhatsEnabled } from './sentinela.flags';

/**
 * 31/07 — "COMEÇOU E DESISTIU": o recado que faltava.
 *
 * O dono só era avisado quando alguém NEGAVA uma rota indicada. Aceitar, sair
 * pra rua e largar no meio — ou pior, dar Iniciar e sumir com o app fechado —
 * não gerava aviso NENHUM: o painel dizia "na rua" até a meia-noite e os
 * clientes ficavam sem entrega sem ninguém saber.
 *
 * Duas portas alimentam este serviço:
 *   1) SAÍDA PELA PORTA (`registrarSaida`) — o app chamou encerrar/descartar/
 *      limpar-dia. Chamado pelo controller DEPOIS do commit, best-effort:
 *      falhar aqui não pode desfazer o que já aconteceu com as entregas.
 *   2) VIGIA (`varrer`) — tick de 10min atrás do abandono SILENCIOSO: rota viva,
 *      iniciada há mais de 90min, sem nenhuma entrega concluída.
 *
 * RÉGUA AFIADA (senão vira alarme que ninguém lê):
 *   · `abandonada` = saiu pra rua (rota com `startedAt`) e entregou ZERO.
 *   · `parcial`    = entregou alguma coisa e deixou parada aberta pra trás.
 *   · `parada`     = o vigia achou rota viva sem sinal de vida (só o vigia usa).
 *   · Rota que nem saiu (sem `startedAt`) e montagem desfeita NÃO viram recado —
 *     desistir antes de sair é o fluxo normal de quem não aceitou.
 *
 * FREIO: `@@unique(companyId, motoristaUserId, routeDate, tipo)` — o mesmo
 * abandono nunca vira dois avisos, e o vigia pode rodar de 10 em 10 minutos
 * sem nunca virar spam. Colisão (P2002) é sucesso silencioso, não erro.
 */

const TICK_MS = Number(process.env.HBX_ROTA_VIGIA_TICK_MS || '') || 10 * 60 * 1000;
/** Minutos de rota iniciada sem NADA entregue até o vigia acusar. */
const SILENCIO_MIN = Number(process.env.HBX_ROTA_VIGIA_SILENCIO_MIN || '') || 90;
const STATUS_ABERTO = ['agendada', 'em_rota'] as const;
const ROTA_VIVA_STATUS = ['ACTIVE', 'INITIALIZING'] as const;

/**
 * SENTINELA (03/08) — o raio que decide "ele não saiu do lugar". Menor que
 * qualquer raio de chegada de cliente: a pergunta aqui é sobre o VEÍCULO parado,
 * não sobre estar perto de uma porta.
 */
const RAIO_PARADO_M = 80;
/** Teto de pontos lidos por sessão na checagem de parado (freio de query). */
const MAX_PONTOS_PARADO = 240;

export type RotaAvisoTipo =
  | 'abandonada'
  | 'parcial'
  | 'parada'
  // ── SENTINELA (03/08) ──
  | 'sem_sinal'
  | 'parado_demais'
  | 'atraso';

export interface RotaAvisoDTO {
  id: string;
  tipo: RotaAvisoTipo;
  motoristaNome: string;
  motoristaUserId: number;
  rotaNome: string | null;
  rotaModeloId: string | null;
  total: number;
  entregues: number;
  abertas: number;
  detalhe: string | null;
  createdAt: string;
}

@Injectable()
export class LogisticaRotaAvisoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogisticaRotaAvisoService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    // Opcional: sem mensageria injetada (testes, boot parcial) a sentinela
    // continua alimentando o feed. O eco no WhatsApp é aditivo, nunca requisito.
    @Optional() private readonly conversations?: ConversationsService,
  ) {}

  onModuleInit() {
    // Entregue LIGADO: o vigia é a única coisa que enxerga o abandono
    // silencioso, e um vigia atrás de chavinha é um vigia dormindo.
    this.timer = setInterval(() => {
      void this.varrer().catch((e) =>
        this.logger.warn(`[logistica] vigia de rota falhou: ${String((e as Error)?.message || e)}`),
      );
    }, TICK_MS);
    this.logger.log(`[logistica] vigia de rota parada LIGADO — tick ${TICK_MS}ms, silêncio ${SILENCIO_MIN}min`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ── PORTA 1: o app avisou que saiu ────────────────────────────────────────
  /**
   * Chamado depois de encerrar/descartar/limpar-dia, SÓ quando dá pra atribuir
   * a saída a uma pessoa (admin encerrando a rota dos outros não vira recado de
   * ninguém). Decide o tipo lendo o dia daquele motorista.
   */
  async registrarSaida(companyId: number, entregadorId: number, dateInput?: string): Promise<RotaAvisoTipo | null> {
    if (!companyId || !Number.isInteger(entregadorId) || entregadorId <= 0) return null;
    try {
      const routeDate = this.diaSeguro(dateInput);
      const rota = await this.prisma.logisticaRoute.findFirst({
        where: { companyId, entregadorId, routeDate },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { startedAt: true },
      });
      // Não saiu pra rua = não abandonou nada. Desfazer montagem antes de sair
      // é o fluxo normal de quem não aceitou (e esse já tem o aviso de rota
      // indicada devolvida).
      if (!rota?.startedAt) return null;

      const contagem = await this.contarDia(companyId, entregadorId, routeDate);
      // Entregou tudo o que tinha: rota encerrada com sucesso, sem recado.
      if (contagem.abertas === 0 && contagem.entregues > 0) return null;
      if (contagem.total === 0) return null;
      const tipo: RotaAvisoTipo = contagem.entregues === 0 ? 'abandonada' : 'parcial';
      return await this.gravar(companyId, entregadorId, routeDate, tipo, contagem);
    } catch (e: any) {
      this.logger.warn(`[logistica] registrarSaida falhou entregador=${entregadorId}: ${String(e?.message || e)}`);
      return null;
    }
  }

  // ── PORTA 2: o vigia do abandono SILENCIOSO ───────────────────────────────
  /**
   * Rota VIVA (não encerrada), iniciada há mais de `SILENCIO_MIN` minutos, com
   * ZERO entrega concluída → recado 'parada'. É o caso que nenhum endpoint
   * denuncia: o motorista deu Iniciar e fechou o app.
   */
  async varrer(agora: Date = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const routeDate = canonicalRouteDate(undefined, agora);
      const limite = new Date(agora.getTime() - SILENCIO_MIN * 60 * 1000);
      const rotas = await this.prisma.logisticaRoute.findMany({
        where: {
          routeDate,
          status: { in: [...ROTA_VIVA_STATUS] },
          operationalEndedAt: null,
          startedAt: { not: null, lte: limite },
        },
        select: { companyId: true, entregadorId: true },
        take: 200,
      });
      let criados = 0;
      for (const rota of rotas) {
        const contagem = await this.contarDia(rota.companyId, rota.entregadorId, routeDate);
        // Entregou alguma coisa = está trabalhando, mesmo devagar. O vigia é pro
        // silêncio TOTAL — acusar quem está na rua seria o alarme que ninguém lê.
        if (contagem.entregues > 0 || contagem.abertas === 0) continue;
        const gravado = await this.gravar(rota.companyId, rota.entregadorId, routeDate, 'parada', contagem);
        if (gravado) criados++;
      }
      if (criados) this.logger.log(`[logistica] vigia de rota: ${criados} recado(s) de rota parada`);
      // 🔴 A SENTINELA É ADITIVA E NUNCA DERRUBA O VIGIA. Ela nasceu depois e
      // depende de tabelas que o vigia original não tocava (sessão e pontos de
      // rastreamento) — deixar a exceção subir faria uma feature NOVA apagar o
      // aviso de abandono, que é o mais grave dos dois. Falha aqui vira log.
      try {
        criados += await this.sentinela(routeDate, agora);
      } catch (e: any) {
        this.logger.warn(`[logistica] sentinela falhou: ${String(e?.message || e)}`);
      }
      return criados;
    } finally {
      this.running = false;
    }
  }

  // ── PORTA 3: A SENTINELA (03/08) ──────────────────────────────────────────
  /**
   * Até aqui "Parado" e "Sem sinal" eram RÓTULO CALCULADO NA LEITURA: existiam
   * só enquanto a tela /rastreamento estava aberta, não viravam evento e não
   * chegavam em ninguém. Fechou a aba, ninguém sabia.
   *
   * Três perguntas, uma varredura, todas em cima de sessão de rastreamento VIVA
   * (rota Essencial não emite posição — e acusar quem nunca prometeu mandar
   * sinal seria o alarme que ninguém lê):
   *
   *   sem_sinal     — última posição mais velha que a régua da empresa.
   *   parado_demais — não saiu de um raio de 80 m pela régua inteira E está
   *                   FORA de qualquer cliente da rota (dentro do raio de
   *                   chegada é trabalho: descarregar galão demora).
   *   atraso        — a próxima parada aberta tem ETA vencido além da régua.
   *
   * Régua 0 em qualquer uma DESLIGA aquela pergunta na empresa (entrega em
   * prédio com garagem não quer "sem sinal" tocando o dia todo).
   */
  private async sentinela(routeDate: string, agora: Date): Promise<number> {
    const sessoes = await this.prisma.logisticaTrackingSession.findMany({
      where: {
        status: 'ACTIVE',
        route: { routeDate, status: { in: [...ROTA_VIVA_STATUS] }, operationalEndedAt: null },
      },
      select: {
        id: true,
        companyId: true,
        entregadorId: true,
        startedAt: true,
        lastPointAt: true,
        lastLatitude: true,
        lastLongitude: true,
      },
      take: 200,
    });
    if (!sessoes.length) return 0;

    // Uma leitura de config por EMPRESA, não por sessão.
    const empresas = [...new Set(sessoes.map((s) => s.companyId))];
    const configs = await this.prisma.logisticaConfig.findMany({
      where: { companyId: { in: empresas } },
      select: {
        companyId: true,
        sentinelaSemSinalMin: true,
        sentinelaParadoMin: true,
        sentinelaAtrasoMin: true,
        raioChegadaM: true,
      },
    });
    const regua = new Map(configs.map((cfg) => [cfg.companyId, cfg]));

    let criados = 0;
    for (const sessao of sessoes) {
      const cfg = regua.get(sessao.companyId);
      // Empresa sem linha de config ainda não abriu a tela de Regras: usa os
      // mesmos defaults do schema em vez de ficar sem vigia nenhum.
      const semSinalMin = cfg?.sentinelaSemSinalMin ?? 15;
      const paradoMin = cfg?.sentinelaParadoMin ?? 25;
      const atrasoMin = cfg?.sentinelaAtrasoMin ?? 20;
      const raioChegadaM = cfg?.raioChegadaM ?? 60;

      try {
        const contagem = await this.contarDia(sessao.companyId, sessao.entregadorId, routeDate);
        // Dia já resolvido não gera alarme: quem entregou tudo pode ficar
        // parado e sem sinal à vontade — acabou o trabalho.
        if (contagem.abertas === 0) continue;

        // 1) SEM SINAL
        const idadeMin = sessao.lastPointAt
          ? Math.floor((agora.getTime() - sessao.lastPointAt.getTime()) / 60000)
          : Math.floor((agora.getTime() - sessao.startedAt.getTime()) / 60000);
        if (semSinalMin > 0 && idadeMin >= semSinalMin) {
          const quando = sessao.lastPointAt
            ? `última posição às ${horaLocal(sessao.lastPointAt)}`
            : 'nenhuma posição desde o início da rota';
          if (await this.gravar(sessao.companyId, sessao.entregadorId, routeDate, 'sem_sinal', contagem,
            `${idadeMin} min sem sinal · ${quando}`)) criados++;
          // Sem sinal já explica o resto: sem posição nova não dá pra afirmar
          // que ele está parado (só que o celular calou). Alarme duplo pelo
          // mesmo fato é exatamente o ruído que faz o dono parar de ler.
          continue;
        }

        // 2) PARADO DEMAIS (fora de cliente)
        if (paradoMin > 0 && sessao.lastLatitude != null && sessao.lastLongitude != null) {
          const paradoHa = await this.minutosSemAndar(sessao.id, sessao.companyId, agora, paradoMin, {
            lat: sessao.lastLatitude,
            lng: sessao.lastLongitude,
          });
          if (paradoHa >= paradoMin) {
            const emCliente = await this.estaEmAlgumCliente(
              sessao.companyId,
              sessao.entregadorId,
              routeDate,
              { lat: sessao.lastLatitude, lng: sessao.lastLongitude },
              raioChegadaM,
            );
            if (!emCliente
              && await this.gravar(sessao.companyId, sessao.entregadorId, routeDate, 'parado_demais', contagem,
                `${paradoHa} min parado fora de cliente`)) criados++;
          }
        }

        // 3) ATRASO contra o ETA que o planejador já calculou
        if (atrasoMin > 0) {
          const atraso = await this.minutosDeAtraso(sessao.companyId, sessao.entregadorId, routeDate, agora);
          if (atraso && atraso.minutos >= atrasoMin
            && await this.gravar(sessao.companyId, sessao.entregadorId, routeDate, 'atraso', contagem,
              `${atraso.minutos} min atrás do plano em ${atraso.cliente}`)) criados++;
        }
      } catch (e: any) {
        // Uma sessão problemática não pode calar o vigia das outras.
        this.logger.warn(`[logistica] sentinela falhou sessao=${sessao.id}: ${String(e?.message || e)}`);
      }
    }
    if (criados) this.logger.log(`[logistica] sentinela: ${criados} aviso(s) novo(s)`);
    return criados;
  }

  /**
   * Há quantos minutos ele não sai de um raio de 80 m. Lê só a janela que
   * interessa (`tetoMin`) e para no primeiro ponto FORA do raio — quem andou
   * não está parado, e não há por que varrer o resto do dia.
   */
  private async minutosSemAndar(
    sessionId: string,
    companyId: number,
    agora: Date,
    tetoMin: number,
    onde: { lat: number; lng: number },
  ): Promise<number> {
    const desde = new Date(agora.getTime() - (tetoMin + 5) * 60 * 1000);
    const pontos = await this.prisma.logisticaTrackingPoint.findMany({
      where: { sessionId, companyId, capturedAt: { gte: desde } },
      orderBy: { capturedAt: 'desc' },
      select: { capturedAt: true, latitude: true, longitude: true },
      take: MAX_PONTOS_PARADO,
    });
    if (!pontos.length) return 0;
    let maisAntigoParado = pontos[0].capturedAt;
    for (const ponto of pontos) {
      if (haversineMeters(onde.lat, onde.lng, ponto.latitude, ponto.longitude) > RAIO_PARADO_M) break;
      maisAntigoParado = ponto.capturedAt;
    }
    return Math.floor((agora.getTime() - maisAntigoParado.getTime()) / 60000);
  }

  /** Está dentro do raio de chegada de alguma parada ABERTA dele? = trabalhando. */
  private async estaEmAlgumCliente(
    companyId: number,
    entregadorId: number,
    routeDate: string,
    onde: { lat: number; lng: number },
    raioM: number,
  ): Promise<boolean> {
    const { start, end } = rangeDoDia(routeDate);
    const paradas = await this.prisma.entrega.findMany({
      where: {
        companyId,
        entregadorId,
        status: { in: [...STATUS_ABERTO] },
        OR: [{ scheduledAt: { gte: start, lte: end } }, { scheduledAt: null }],
      },
      select: { customerProfile: { select: { lat: true, lng: true } } },
      take: 200,
    });
    return paradas.some((parada) => {
      const lat = parada.customerProfile?.lat;
      const lng = parada.customerProfile?.lng;
      if (typeof lat !== 'number' || typeof lng !== 'number') return false;
      return haversineMeters(onde.lat, onde.lng, lat, lng) <= Math.max(30, raioM);
    });
  }

  /** O ETA vencido mais ANTIGO entre as paradas abertas (o pior atraso). */
  private async minutosDeAtraso(
    companyId: number,
    entregadorId: number,
    routeDate: string,
    agora: Date,
  ): Promise<{ minutos: number; cliente: string } | null> {
    const { start, end } = rangeDoDia(routeDate);
    const parada = await this.prisma.entrega.findFirst({
      where: {
        companyId,
        entregadorId,
        status: { in: [...STATUS_ABERTO] },
        etaAt: { not: null, lt: agora },
        OR: [{ scheduledAt: { gte: start, lte: end } }, { scheduledAt: null }],
      },
      orderBy: { etaAt: 'asc' },
      select: { etaAt: true, customerProfile: { select: { name: true } } },
    });
    if (!parada?.etaAt) return null;
    return {
      minutos: Math.floor((agora.getTime() - parada.etaAt.getTime()) / 60000),
      cliente: parada.customerProfile?.name || 'uma parada',
    };
  }

  // ── Leitura pro web ───────────────────────────────────────────────────────
  async listar(companyId: number): Promise<RotaAvisoDTO[]> {
    if (!companyId) return [];
    const rows = await this.prisma.logisticaRotaAviso.findMany({
      where: { companyId, vistoEm: null },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return rows.map((row) => ({
      id: row.id,
      tipo: row.tipo as RotaAvisoTipo,
      motoristaNome: row.motoristaNome,
      motoristaUserId: row.motoristaUserId,
      rotaNome: row.rotaNome,
      rotaModeloId: row.rotaModeloId,
      total: row.total,
      entregues: row.entregues,
      abertas: row.abertas,
      detalhe: row.detalhe ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** O × do banner: some da tela, fica no histórico. */
  async visto(companyId: number, id: string): Promise<boolean> {
    if (!companyId || !id) return false;
    const res = await this.prisma.logisticaRotaAviso.updateMany({
      where: { id: String(id).trim(), companyId, vistoEm: null },
      data: { vistoEm: new Date() },
    });
    return res.count > 0;
  }

  // ── Internos ──────────────────────────────────────────────────────────────
  /** Conta o dia DAQUELE motorista + a rota salva de origem, quando existe. */
  private async contarDia(companyId: number, entregadorId: number, routeDate: string) {
    const { start, end } = rangeDoDia(routeDate);
    const entregas = await this.prisma.entrega.findMany({
      where: {
        companyId,
        entregadorId,
        OR: [{ scheduledAt: { gte: start, lte: end } }, { scheduledAt: null, status: { in: [...STATUS_ABERTO] } }],
      },
      select: { status: true, rotaModeloId: true },
      take: 500,
    });
    let entregues = 0;
    let abertas = 0;
    const modelos = new Map<string, number>();
    for (const entrega of entregas) {
      if (entrega.status === 'entregue') entregues++;
      else if (entrega.status === 'agendada' || entrega.status === 'em_rota') abertas++;
      if (entrega.rotaModeloId) modelos.set(entrega.rotaModeloId, (modelos.get(entrega.rotaModeloId) ?? 0) + 1);
    }
    let rotaModeloId: string | null = null;
    let maior = 0;
    for (const [id, quantas] of modelos) if (quantas > maior) { rotaModeloId = id; maior = quantas; }
    return { total: entregas.length, entregues, abertas, rotaModeloId };
  }

  private async gravar(
    companyId: number,
    motoristaUserId: number,
    routeDate: string,
    tipo: RotaAvisoTipo,
    contagem: { total: number; entregues: number; abertas: number; rotaModeloId: string | null },
    detalhe?: string | null,
  ): Promise<RotaAvisoTipo | null> {
    const [pessoa, modelo] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: motoristaUserId, companyId },
        select: { name: true, username: true, email: true },
      }),
      contagem.rotaModeloId
        ? this.prisma.logisticaRotaModelo.findFirst({
            where: { id: contagem.rotaModeloId, companyId },
            select: { id: true, nome: true },
          })
        : Promise.resolve(null),
    ]);
    try {
      await this.prisma.logisticaRotaAviso.create({
        data: {
          companyId,
          tipo,
          motoristaUserId,
          motoristaNome: (pessoa?.name || pessoa?.username || pessoa?.email || `Usuário ${motoristaUserId}`).slice(0, 120),
          rotaModeloId: modelo?.id ?? null,
          rotaNome: modelo?.nome ?? null,
          routeDate,
          total: contagem.total,
          entregues: contagem.entregues,
          abertas: contagem.abertas,
          detalhe: detalhe ? String(detalhe).slice(0, 160) : null,
        },
      });
      this.logger.log(
        `[logistica] recado de rota ${tipo} company=${companyId} motorista=${motoristaUserId} dia=${routeDate}` +
          ` (${contagem.entregues}/${contagem.total} entregues, ${contagem.abertas} abertas)`,
      );
      // Só ecoa aviso que ACABOU de nascer — o P2002 abaixo é justamente o que
      // impede o mesmo fato de virar WhatsApp de 10 em 10 minutos. O freio do
      // spam é o índice único, não um contador em memória que o restart zera.
      void this.ecoarNoWhatsApp(
        companyId,
        tipo,
        (pessoa?.name || pessoa?.username || `Usuário ${motoristaUserId}`).slice(0, 120),
        detalhe ?? null,
        contagem.abertas,
      ).catch(() => undefined);
      return tipo;
    } catch (e: any) {
      // P2002 = já existe recado deste tipo pra este motorista HOJE. É o freio
      // funcionando, não erro: o vigia roda a cada 10min de propósito.
      if (String(e?.code) === 'P2002') return null;
      throw e;
    }
  }

  /**
   * ECO NO WHATSAPP DO DONO — o que faz o aviso existir fora da tela aberta.
   *
   * ── REGRAS DURAS (mesmas do resumo-diário; cicatriz de chip banido) ────────
   * · 2 CHAVES: env global HBX_SENTINELA_WHATS_ENABLED **E**
   *   LogisticaConfig.sentinelaWhatsAtiva (por tenant, default false).
   * · DESTINO = Company.contactPhone SOMENTE com contactPhoneVerifiedAt != null.
   *   Sem telefone verificado → pula em SILÊNCIO. Zero fallback pro User.
   * · Envio exclusivamente por `queueOutboundForCompany` com senderType
   *   'system' — disjuntor, outbox e 1-número=1-conexão são de lá. Nunca bridge
   *   cru.
   * · TETO POR CONSTRUÇÃO: uma linha de aviso = no máximo um WhatsApp, porque
   *   só o caminho que venceu o `create` chega aqui.
   * · Falhar aqui NUNCA desfaz o aviso: o feed do cockpit é a entrega primária,
   *   o WhatsApp é o eco.
   */
  private async ecoarNoWhatsApp(
    companyId: number,
    tipo: RotaAvisoTipo,
    motoristaNome: string,
    detalhe: string | null,
    abertas: number,
  ): Promise<void> {
    if (!this.conversations || !isSentinelaWhatsEnabled()) return;

    const [cfg, company] = await Promise.all([
      this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: { sentinelaWhatsAtiva: true },
      }),
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { contactPhone: true, contactPhoneVerifiedAt: true },
      }),
    ]);
    if (!cfg?.sentinelaWhatsAtiva) return;

    const telefone = String(company?.contactPhone || '').trim();
    if (!telefone || !company?.contactPhoneVerifiedAt) return;

    const body = frasePraWhatsApp(tipo, motoristaNome, detalhe, abertas);
    if (!body) return;

    const to = normalizeBrPhoneE164(telefone) || telefone;
    try {
      await this.conversations.queueOutboundForCompany(companyId, {
        to,
        contactId: to,
        body,
        messageType: 'text',
        sourceModule: 'logistica_sentinela',
        senderType: 'system',
        variables: { module: 'logistica', event: 'sentinela', tipo },
        flowState: { botActive: false, humanAssigned: false, flowResult: null },
      });
    } catch (e: any) {
      // Sem chip conectado (ou disjuntor aberto) o aviso continua no feed —
      // e o vigia NÃO reenfileira: o índice único já consumiu este fato.
      this.logger.warn(`[logistica] eco da sentinela company=${companyId} falhou: ${String(e?.message || e)}`);
    }
  }

  private diaSeguro(dateInput?: string): string {
    try {
      return canonicalRouteDate(dateInput);
    } catch {
      return canonicalRouteDate();
    }
  }
}

/** Janela local do dia de uma chave 'YYYY-MM-DD' (mesma semântica do resolveDayRange). */
function rangeDoDia(routeDate: string): { start: Date; end: Date } {
  const [ano, mes, dia] = routeDate.split('-').map(Number);
  const start = new Date(ano, (mes || 1) - 1, dia || 1, 0, 0, 0, 0);
  const end = new Date(ano, (mes || 1) - 1, dia || 1, 23, 59, 59, 999);
  return { start, end };
}

/** Hora local curta pro texto do aviso ("última posição às 15:07"). */
function horaLocal(data: Date): string {
  return data.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

/**
 * A frase do WhatsApp. Curta, sem jargão, e SEMPRE com nome + o número que
 * decide — é lida no celular, no meio da rua, por quem tem 3 segundos.
 * Tipo desconhecido devolve null: melhor não mandar nada que mandar "undefined".
 */
function frasePraWhatsApp(
  tipo: RotaAvisoTipo,
  motoristaNome: string,
  detalhe: string | null,
  abertas: number,
): string | null {
  const cauda = abertas > 0 ? ` ${abertas} cliente(s) ainda esperando.` : '';
  const medida = detalhe ? ` (${detalhe})` : '';
  switch (tipo) {
    case 'sem_sinal':
      return `⚠️ HBX Logística: ${motoristaNome} sumiu do mapa${medida}.${cauda}`;
    case 'parado_demais':
      return `⚠️ HBX Logística: ${motoristaNome} está parado fora de cliente${medida}.${cauda}`;
    case 'atraso':
      return `⏱️ HBX Logística: ${motoristaNome} está atrasado no plano${medida}.${cauda}`;
    case 'abandonada':
      return `🔴 HBX Logística: ${motoristaNome} saiu pra rua e encerrou sem entregar nada.${cauda}`;
    case 'parcial':
      return `🔴 HBX Logística: ${motoristaNome} encerrou a rota no meio.${cauda}`;
    case 'parada':
      return `🔴 HBX Logística: ${motoristaNome} iniciou a rota e está sem entregar nada.${cauda}`;
    default:
      return null;
  }
}
