import { BadRequestException, ConflictException, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalRouteDate, type LogisticaRouteMode } from './logistica-route-billing.util';
import { storedNivel } from './logistica-config.service';
import { isLogisticaTrackingEnabled } from './logistica-tracking.flags';
import { LogisticaRotaCobrancaService } from './logistica-rota-cobranca.service';
import { lockLogisticaRouteTransaction } from './logistica-route-lock';
import { LogisticaTrackingService } from './logistica-tracking.service';
import {
  resolverCoordenadaMultilocal,
  enderecoDaFonteMultilocal,
  linhaEnderecoDaFonte,
} from './logistica-geo-fonte.util';
import { stopDeRotaMorta } from './logistica-rota-viva.util';
import { pinoValido } from '../nucleo/nucleo-geo.util';
import { diagnosticarMotoristaUnico } from './logistica-motorista-unico.util';
import { LogisticaOsrmService } from './logistica-osrm.service';
import { LogisticaEstoqueService } from './logistica-estoque.service';
import { sourceDateFromOccurrenceKey, saoPauloMidnight } from './logistica-agenda-cursor.util';
import { apagarNaoProcessadas, TIPOS_CANCELAMENTO_HUMANO } from './logistica-expurgo.util';
import { saoPauloDateKey } from './logistica-dia.util';
import { registrarEventoAgenda, formatDDMM } from './logistica-agenda-evento.util';
import { ProspectorCorredorService } from './prospector-corredor.service';
import { isProspectorEnabled } from './logistica-prospector.flags';
import {
  rotuloDaCesta,
  clampRaioM,
  clampMaxDia,
  RAIO_PADRAO_M,
  MAX_DIA_PADRAO,
} from './prospector-corredor.sql';
// PROSPECTOR v2 (12/08) — a 5ª chave: o TIPO que a PESSOA escolheu nesta semana.
import { LogisticaProspectorSemanaService } from './logistica-prospector-semana.service';
import { cnaeEhDoTipo, type ProspectorTipo } from './logistica-prospector-tipos';
import { ehEsquemaAusente } from './logistica-esquema-ausente.util';
import { isAdminTierActor, isBillingOwnerActor, type ActorKindUserLike } from '../access/actor-kind';
import { isLogisticaAdmin } from './logistica-operacao.service';
import { quemMontouODia, rotaDeOutroMotoristaError } from './logistica-quem-montou.util';
// 12/08 — "Ult. Registro": MAX(deliveredAt) das entregas concluídas, régua única.
import { isoDaUltimaEntrega, ultimaEntregaPorCliente } from './logistica-ultima-entrega.util';

/**
 * LOGÍSTICA-MOBILE M3 (05/07) — MOTOR DE ROTA + ETA (100% local, sem API paga).
 *
 * Ordena a rota do dia do entregador e calcula a previsão de término. Tudo com
 * matemática PURA (Haversine + nearest-neighbor + 2-opt), zero Google Directions,
 * zero chamada externa, R$0. É "bom o bastante" para ≤50 paradas de 1 entregador.
 *
 * ── O QUE FAZ ────────────────────────────────────────────────────────────────
 *  1) Pega as entregas ABERTAS do dia (status 'agendada' | 'em_rota').
 *  2) Ordena por proximidade: nearest-neighbor a partir da ORIGEM (GPS do
 *     entregador ao iniciar, ou a 1ª parada com coord se sem origem) + refino
 *     2-opt (troca de arestas que reduz o trajeto total). Paradas SEM lat/lng
 *     vão pro FIM da fila (flag semCoordenada) — não dá pra roteá-las.
 *  3) Grava `rotaOrdem` (0..N) em cada Entrega.
 *  4) ETA cumulativo: por parada, tempo de trajeto (distância /
 *     velocidadeMediaKmH) + tempoParadaMin. Grava `etaAt` por parada e devolve a
 *     previsão de término (etaAt da última).
 *
 * ── ADITIVO / NÃO QUEBRA N6/M2 ───────────────────────────────────────────────
 * Só GRAVA rotaOrdem/etaAt (colunas M2, opcionais). Não dispara WhatsApp nem
 * cobrança — isso é só no confirmar (N6), atrás de HBX_LOGISTICA_ENABLED. O
 * re-ETA no confirmar/cancelar é aditivo e best-effort (try/catch): se falhar,
 * o comportamento do N6 segue intacto.
 */
@Injectable()
export class LogisticaRotaService {
  private readonly logger = new Logger(LogisticaRotaService.name);

  // Defaults do LogisticaConfig quando a empresa ainda não configurou (schema).
  private static readonly DEFAULT_VELOCIDADE_KMH = 25;
  private static readonly DEFAULT_PARADA_MIN = 5;

  // Só as entregas ABERTAS entram na rota (as concluídas/canceladas saem).
  private static readonly STATUS_ABERTO = ['agendada', 'em_rota'] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cobranca: LogisticaRotaCobrancaService,
    @Optional() private readonly tracking?: LogisticaTrackingService,
    // S1 (25/07, PR25072026-ROTA-CONFERIDA) — DEGRAU 1 do planejamento por
    // ruas (cache + rate-limit por empresa). @Optional() e por ÚLTIMO no
    // construtor de propósito: instanciações diretas existentes em teste
    // (`new LogisticaRotaService(prisma, cobranca)`) continuam válidas
    // sem o proxy — planRouteByRoads simplesmente pula pro degrau 2 (público
    // direto), mesmo comportamento de antes desta sprint.
    @Optional() private readonly osrm?: LogisticaOsrmService,
    // B4 (PR04082026-BALCAO) — reserva amarrada ao ciclo da rota: iniciar
    // reserva o previsto na gaveta do dia, encerrar devolve o remanescente.
    // @Optional() e por ÚLTIMO: instanciações diretas em teste continuam
    // válidas; sem o serviço, a rota funciona exatamente como antes.
    @Optional() private readonly cargaEstoque?: LogisticaEstoqueService,
    // PROSPECTOR CNPJ (PR07082026 F1-servidor, 07/08) — as empresas do corredor
    // embarcam na folha no INICIAR, ao lado da reserva do B4. @Optional() e por
    // ÚLTIMO pelo mesmo motivo dos anteriores: sem ele, a rota é EXATAMENTE a
    // de antes (nenhum prospecto, nenhum campo novo no payload).
    @Optional() private readonly prospector?: ProspectorCorredorService,
    // PROSPECTOR v2 (12/08) — a 5ª CHAVE: a escolha de TIPO que a PESSOA fez nesta
    // semana. @Optional() e por ÚLTIMO pelo mesmo motivo dos anteriores — mas com
    // uma diferença que importa: ausente aqui é FAIL-CLOSED, não "segue como antes".
    // Sem este serviço ninguém tem escolha, e sem escolha o prospector fica QUIETO,
    // que é exatamente a decisão do dono ("desligado pra todos até a pessoa acionar").
    @Optional() private readonly prospectorSemana?: LogisticaProspectorSemanaService,
  ) {}

  /**
   * B4 — reconcilia a reserva da rota na gaveta do dia. Best-effort COM VOZ
   * (lição CNEFE: best-effort que engole erro precisa de alarme): estoque NUNCA
   * derruba o iniciar/encerrar da rota, mas falha nunca é muda.
   */
  private async reconciliarReservaRotaBestEffort(companyId: number, date: string | undefined, contexto: string): Promise<void> {
    if (!this.cargaEstoque) return;
    try {
      const r = await this.cargaEstoque.reconciliarReservaRota(companyId, date);
      if (r.fonte === 'ROTA') {
        this.logger.log(`[logistica] B4 ${contexto}: reserva da rota reconciliada (${r.produtos} produto(s)) company=${companyId}.`);
      }
    } catch (e: any) {
      this.logger.warn(`[logistica] B4 ${contexto}: reserva da rota FALHOU company=${companyId}: ${String(e?.message || e)}`);
    }
  }

  // ── PROSPECTOR CNPJ (PR07082026 F1-servidor) ─────────────────────────────────
  /**
   * As 5 CHAVES do prospector, TODAS obrigatórias — qualquer uma fechada devolve
   * zero prospecto SEM erro e sem efeito nenhum no iniciar-rota:
   *
   *  1. `HBX_PROSPECTOR_ENABLED` (env global, default OFF) — a chave mestra.
   *     É a PRIMEIRA de propósito: com ela fechada nem uma consulta sai, e o
   *     deploy é 100% inerte (é este gate que torna seguro publicar antes de a
   *     migration rodar em produção).
   *  2. `LogisticaConfig.prospectorAtivo` — o admin da empresa opta por entrar.
   *  3. ATOR: admin (master/dono/gerente) sempre; funcionário comum SÓ com
   *     `prospectorEquipe` ligado. Mesma leitura do `passeioEquipe`
   *     (logistica-passeio.service.ts) e FAIL-CLOSED: chamada sem ator
   *     identificado é tratada como funcionário comum.
   *  4. SEMANA DA PESSOA (12/08, PROSPECTOR v2) — a chave NOVA, e a que o dono
   *     pediu: o prospector nasce DESLIGADO pra todo mundo e só acorda quando a
   *     PESSOA aciona e escolhe o TIPO de empresa que interessa a ela NESTA
   *     SEMANA (`LogisticaProspectorSemana`). Sem escolha = mesma semântica de
   *     chave fechada: payload SEM a chave `prospector`, nem uma consulta ao
   *     corredor. Segunda-feira nova zera a escolha sozinha — quieto de novo,
   *     sem faxina (ver logistica-prospector-semana.service.ts).
   *  5. PINO: a empresa precisa ter `CnpjGeo` no corredor. Sem pino na região o
   *     resultado é lista VAZIA — vazio honesto, não erro (`CnpjGeo` hoje é
   *     SP-only, item 6 das decisões em aberto do plano).
   *
   * 🔴 ENFEITE NÃO DERRUBA ROTA: tudo aqui é best-effort COM VOZ. Nenhuma
   * exceção sobe pro iniciar-rota — mas nenhuma falha é muda (lição CNEFE:
   * best-effort silencioso desligou 23M endereços por 5 dias sem ninguém ver).
   *
   * 🔴 NÃO DEBITA NADA. Embarcar e acender são de graça; o crédito é da F2
   * (1 crédito quando o motorista ABRE o lead).
   */
  private async lerPoliticaProspector(companyId: number): Promise<PoliticaProspector | null> {
    try {
      const cfg = await this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: {
          prospectorAtivo: true,
          prospectorEquipe: true,
          prospectorRaioM: true,
          prospectorMaxDia: true,
        },
      });
      if (!cfg) return null;
      return {
        ativo: !!cfg.prospectorAtivo,
        equipe: !!cfg.prospectorEquipe,
        raioM: typeof cfg.prospectorRaioM === 'number' ? cfg.prospectorRaioM : null,
        maxDia: typeof cfg.prospectorMaxDia === 'number' ? cfg.prospectorMaxDia : null,
      };
    } catch (error) {
      // A migration `20260807000000_prospector_e_modulos_do_app` ainda NÃO está
      // aplicada em produção: enquanto não estiver, a coluna não existe e o
      // Prisma reclama (P2022 / 42703). Isso é a TRANSIÇÃO ESPERADA, não um
      // defeito — mas continua aparecendo no log, com o motivo escrito, porque
      // "esperado" nunca é desculpa pra silêncio.
      const msg = String((error as any)?.message || error);
      if (ehEsquemaAusente(error)) {
        this.logger.warn(
          `[logistica] prospector: coluna/tabela ainda não existe neste banco (migration pendente) company=${companyId}: ${msg}`,
        );
      } else {
        this.logger.error(`[logistica] prospector: leitura da config FALHOU company=${companyId}: ${msg}`);
      }
      return null;
    }
  }

  private async embarcarProspectosBestEffort(
    companyId: number,
    plan: PlanejarRotaResult,
    rotaDia: string,
    actor?: AtorProspector,
  ): Promise<RotaProspectorPayload | null> {
    try {
      // Chave 1 — env global. Antes de qualquer ida ao banco.
      if (!this.prospector || !isProspectorEnabled()) return null;

      // Chaves 2 e 3 — tenant e ator, na MESMA leitura de config (uma consulta).
      const politica = await this.lerPoliticaProspector(companyId);
      if (!politica || !politica.ativo) return null;
      if (!isAdminTierActor(actor) && !politica.equipe) return null;

      // Chave 4 — A SEMANA DA PESSOA. Sem serviço injetado ou sem escolha viva, o
      // prospector fica QUIETO: nem o corredor roda (é ele que varre a RFB), nem a
      // chave `prospector` nasce no payload. FAIL-CLOSED de propósito — "desligado
      // pra todos até a pessoa acionar" é a decisão, não um efeito colateral.
      const tipoDaSemana = (await this.prospectorSemana?.escolhaVigente(companyId, idDoAtor(actor))) ?? null;
      if (!tipoDaSemana) return null;

      // Chave 5 — pino. As paradas DO DIA (as da rota que está iniciando); quem
      // não tem coordenada não entra (o corredor também descarta, mas mandar só
      // o que é ponto de verdade deixa o log honesto sobre quantas paradas
      // realmente viraram corredor).
      const paradas = plan.paradas
        .filter((p) => !p.semCoordenada && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)))
        .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }));

      const resultado = await this.prospector.embarcar(companyId, paradas, {
        raioM: politica.raioM,
        maxDia: politica.maxDia,
        rotaDia,
      });

      if (!resultado.ok) {
        // O corredor já logou a mensagem ORIGINAL do erro; aqui o alarme sobe
        // com o contexto da rota, pra ninguém precisar cruzar dois logs.
        this.logger.error(
          `[logistica] prospector: corredor devolveu FALHA no iniciar-rota company=${companyId} rotaDia=${rotaDia} paradas=${paradas.length}.`,
        );
        return null;
      }

      if (resultado.somenteMemoria) {
        this.logger.warn(
          `[logistica] prospector: tabela ProspectoRota ausente — ${resultado.prospectos.length} prospecto(s) só em memória company=${companyId} rotaDia=${rotaDia}.`,
        );
      }

      const escolhidas = resultado.prospectos.filter((p) => cnaeEhDoTipo(p.cnae, tipoDaSemana)).length;
      this.logger.log(
        `[logistica] prospector: ${resultado.prospectos.length} empresa(s) embarcada(s) company=${companyId} rotaDia=${rotaDia} raio=${resultado.raioM}m acende=${resultado.acendeNoDia} tipo=${tipoDaSemana.slug} escolhidas=${escolhidas}.`,
      );

      return {
        rotaDia: resultado.rotaDia,
        raioM: resultado.raioM,
        acendeNoDia: resultado.acendeNoDia,
        persistido: !resultado.somenteMemoria,
        // O tipo viaja pro app poder DIZER o que está caçando (a linha dos Ajustes
        // e o chip da tela). É rótulo, não régua: quem decide a cor é `escolhida`.
        tipo: tipoDaSemana.slug,
        tipoRotulo: tipoDaSemana.rotulo,
        // 🔴 LEI DO VENDEDOR: o motorista vê o FATO (nome, ramo, distância,
        // onde fica) e nada mais. `phoneDigits` e `porte` FICAM no servidor —
        // o disparo (F3) é feito pelo backend, o app nunca precisa do telefone.
        empresas: ordenarParaAcender(
          resultado.prospectos.map((p) => ({
            // `id` é o GANCHO do prédio no mapa do APK (contrato do seam em
            // EntregaShell/.../ponte.js: "sem id, sai sem data-acao"). É o mesmo
            // CNPJ — vai nos dois nomes pra ponte não precisar adivinhar.
            id: p.cnpj,
            cnpj: p.cnpj,
            nome: p.nome,
            ramo: p.cnaeDescricao ?? rotuloDaCesta(p.cnae),
            lat: p.lat,
            lng: p.lng,
            distM: p.distM,
            afinidade: p.afinidade,
            // PROSPECTOR v2 — VERDE ou AZUL. A pergunta é de CÓDIGO de CNAE contra
            // os prefixos do tipo da semana; o resto do corredor continua vindo
            // (é o AMBIENTE), só que mudo.
            escolhida: cnaeEhDoTipo(p.cnae, tipoDaSemana),
            aceso: false,
          })),
          resultado.acendeNoDia,
        ),
      };
    } catch (error) {
      // O caminho que NUNCA pode existir: exceção do prospector derrubando o
      // iniciar-rota. Se chegou aqui, virou log e a rota segue igual.
      this.logger.error(
        `[logistica] prospector FALHOU no iniciar-rota company=${companyId} rotaDia=${rotaDia}: ${String(
          (error as any)?.message || error,
        )}`,
      );
      return null;
    }
  }

  /**
   * RELEITURA do prospector do dia — o mesmo payload do `iniciar-rota`, montado
   * a partir do que JÁ está embarcado em `ProspectoRota`.
   *
   * 🔴 POR QUE PRECISOU EXISTIR (08/08). O `prospector` só viajava na resposta
   * do `POST /rota/iniciar`, e essa resposta é EFÊMERA: o app fechou, o
   * motorista trocou de tela, a bateria acabou — na volta quem roda é o
   * `GET /logistica/rota`, que não sabia do assunto. Resultado: 8 empresas
   * embarcadas no banco e ZERO prédios na tela de navegação. Payload que só
   * existe no instante do clique não é dado do dia, é notificação.
   *
   * NÃO EMBARCA NADA. Este caminho é 100% LEITURA: quem acha empresa no
   * corredor (e gasta a consulta na RFB) continua sendo o INICIAR, uma vez por
   * dia. O `listRota` é hot-path de polling do app — mandar o corredor rodar
   * aqui seria varrer a RFB a cada refresh.
   *
   * AS MESMAS 5 CHAVES do embarque, na mesma ordem (env → tenant → ator →
   * SEMANA DA PESSOA → pino), porque desligar o prospector tem que apagar a tela
   * também, não só parar de embarcar novos. A chave nº5 aqui é "tem linha
   * gravada pro dia".
   *
   * 🔴 E A COR TAMBÉM É RECOMPUTADA AQUI (12/08). `escolhida` não é snapshot: a
   * pessoa pode trocar de tipo na quarta-feira, e a rua tem que mudar de cor no
   * próximo poll. Por isso `ProspectoRota` passou a guardar o CÓDIGO do CNAE — a
   * releitura faz a MESMA pergunta que o embarque fez, contra a escolha de AGORA.
   */
  async lerProspectosDoDia(
    companyId: number,
    rotaDia: string,
    actor?: AtorProspector,
  ): Promise<RotaProspectorPayload | null> {
    try {
      // Chave 1 — env global. Antes de qualquer ida ao banco.
      if (!isProspectorEnabled()) return null;

      // Chaves 2 e 3 — tenant e ator. Fail-closed igual ao embarque.
      const politica = await this.lerPoliticaProspector(companyId);
      if (!politica || !politica.ativo) return null;
      if (!isAdminTierActor(actor) && !politica.equipe) return null;

      // Chave 4 — a SEMANA DA PESSOA. Sem escolha, a tela APAGA: não basta parar
      // de embarcar novos, o que já está no banco também some da vista (é a mesma
      // lei que fez as 4 chaves valerem na releitura desde 08/08).
      const tipoDaSemana = (await this.prospectorSemana?.escolhaVigente(companyId, idDoAtor(actor))) ?? null;
      if (!tipoDaSemana) return null;

      const raioM = clampRaioM(politica.raioM ?? RAIO_PADRAO_M);
      const maxDia = clampMaxDia(politica.maxDia ?? MAX_DIA_PADRAO);

      // Chave 5 — o que foi embarcado NESTE dia. `lead` e `dispensado` ficam de
      // fora: quem virou lead saiu do corredor pra sempre (mora no /vendas
      // agora) e quem foi dispensado está de castigo — os dois voltarem como
      // prédio apagado seria o app oferecendo de novo o que o motorista já
      // resolveu.
      const linhas = await this.prisma.prospectoRota.findMany({
        where: { companyId, rotaDia, estado: { notIn: ['lead', 'dispensado'] } },
        select: { cnpj: true, nome: true, cnae: true, cnaeDescricao: true, lat: true, lng: true, distM: true },
        orderBy: [{ distM: 'asc' }, { cnpj: 'asc' }],
        take: 64,
      });
      if (linhas.length === 0) return null;

      return {
        rotaDia,
        raioM,
        acendeNoDia: maxDia,
        // Veio da tabela: por definição está persistido.
        persistido: true,
        tipo: tipoDaSemana.slug,
        tipoRotulo: tipoDaSemana.rotulo,
        // LEI DO VENDEDOR (a mesma do embarque): `phoneDigits` está no SELECT?
        // Não — e é de propósito. O telefone nunca sai do servidor; o disparo
        // da F3 é feito pelo backend.
        empresas: ordenarParaAcender(
          linhas.map((l) => ({
            id: l.cnpj,
            cnpj: l.cnpj,
            nome: l.nome,
            // `ramo` é o snapshot do embarque. Sem `cnae` gravado não há como
            // cair no `rotuloDaCesta` — e inventar rótulo aqui seria pior que
            // não ter: o motorista leria uma classificação que ninguém apurou.
            ramo: l.cnaeDescricao ?? null,
            lat: l.lat,
            lng: l.lng,
            distM: l.distM,
            // A MESMA pergunta do embarque, contra a escolha de AGORA. Linha antiga
            // (embarcada antes da coluna `cnae` existir) tem código nulo → AZUL:
            // "não sei" pinta como ambiente, nunca como convite.
            escolhida: cnaeEhDoTipo(l.cnae, tipoDaSemana),
            aceso: false,
          })),
          maxDia,
        ),
      };
    } catch (error) {
      // ENFEITE NÃO DERRUBA ROTA — aqui vale em dobro: o `listRota` é a tela
      // principal do motorista. Nada sobe; mas nada é mudo (lição CNEFE).
      const msg = String((error as any)?.message || error);
      if (ehEsquemaAusente(error)) {
        this.logger.warn(
          `[logistica] prospector: releitura sem tabela/coluna (migration pendente) company=${companyId} rotaDia=${rotaDia}: ${msg}`,
        );
      } else {
        this.logger.error(
          `[logistica] prospector: releitura do dia FALHOU company=${companyId} rotaDia=${rotaDia}: ${msg}`,
        );
      }
      return null;
    }
  }

  // ── PLANEJAR ROTA ────────────────────────────────────────────────────────────
  /**
   * Ordena a rota do dia, grava rotaOrdem/etaAt e devolve a rota + término
   * previsto + quantas paradas ficaram sem coordenada.
   */
  async planejarRota(
    companyId: number,
    input: PlanejarRotaInput = {},
    entregadorId?: number,
    actorUserId?: number | null,
    // ROTA v2 (10/08) — vestigial: era "cobrar agora ou só prever" da máquina
    // velha (logistica-route-billing.service.ts, morta nesta onda). O portão
    // novo (assento + dia pago, abaixo) não distingue mais "prever" de
    // "cobrar" — dispara sempre que o dia ganha paradas de verdade, porque o
    // dia PAGO é a régua (`quemMontouODia`, F1b), não a intenção de quem
    // chamou. Mantido na assinatura só pra não quebrar os chamadores existentes.
    chargeEssential = false,
  ): Promise<PlanejarRotaResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    void chargeEssential;
    const routeDate = canonicalRouteDate(input.date);
    const { start, end, dayISO } = resolveDayRange(input.date);
    const config = await this.loadConfig(companyId);
    const origem = coordFromInput(input.origemLat, input.origemLng);

    const deliveryIds = normalizeDeliveryIds(input.deliveryIds);
    const rows = await this.fetchParadasAbertas(companyId, start, end, entregadorId, deliveryIds);

    // Ordena (NN + 2-opt) e calcula ETA cumulativo a partir de AGORA (ou input.startAt).
    const partida = parseDateOrNull(input.startAt) ?? new Date();
    // PR18072026 — ORDEM MANUAL: quando o app manda `ordemManual` (ids na ordem que
    // o entregador arrastou na tela), a rota respeita ESSA ordem ao pé da letra —
    // pula o NN+2-opt inteiro. Paradas listadas recebem rotaOrdem na ordem dada;
    // as não-listadas (fora do conjunto aberto ou esquecidas na lista) vão pro FIM
    // na ordem natural do fetch (rotaOrdem→scheduledAt→createdAt). ETA cumulativo
    // segue a MESMA função (computeEta) — mesma velocidade/tempo de parada, mesma
    // persistência rotaOrdem/etaAt do caminho automático.
    const ordemManual = normalizeOrdemManual(input.ordemManual);
    const plan = ordemManual
      ? planRouteManual(rows.map((r) => toStop(r)), ordemManual, {
          origem,
          velocidadeKmH: config.velocidadeMediaKmH,
          paradaMin: config.tempoParadaMin,
          partida,
        })
      : await planRouteByRoads(
          rows.map((r) => toStop(r)),
          {
            origem,
            velocidadeKmH: config.velocidadeMediaKmH,
            paradaMin: config.tempoParadaMin,
            partida,
            osrmTable: this.osrmTableFetcher(companyId),
          },
        );

    // ROTA v2 F3a/F3b (10/08) — os 2 portões, ANTES de persistir rotaOrdem
    // (ordem: leitura barata primeiro, dinheiro por último):
    //  1) ASSENTO — só quando HÁ um motorista definido (o gate é POR
    //     motorista); planejamento amplo do admin (sem entregadorId) não gateia
    //     ninguém aqui — o gate de verdade pega o motorista no Iniciar/atribuir.
    //  2) DIA PAGO — só nível CREDITO, por EMPRESA+DATA (qualquer motorista);
    //     idempotente: remontar, trocar de motorista ou reabrir o dia nunca
    //     cobra 2×.
    if (plan.paradas.length > 0) {
      // `podeComprar` fica no default false DE PROPÓSITO: `entregadorId` aqui
      // só existe quando o ator é motorista ESCOPADO (whereForActor) — e
      // motorista escopado nunca é dono/master (admin chega sem entregadorId).
      if (entregadorId) await this.cobranca.assertAssentoDoDia(companyId, entregadorId, routeDate);
      await this.cobranca.garantirDiaPago(companyId, routeDate, actorUserId);
    }

    // O piso da numeração (ver `maiorOrdemFechadaDoDia`): as abertas continuam
    // 0..N-1 entre elas — o que muda é onde essa régua COMEÇA, pra não colidir
    // com quem o dia já fechou. Manhã limpa = piso 0 = nada muda.
    const pisoOrdem = await this.maiorOrdemFechadaDoDia(companyId, start, end, entregadorId);

    // Persiste a ordem como UM lote atômico. Conclusão, cancelamento ou
    // transferência concorrente fazem o CAS falhar e a transação inteira volta;
    // nunca sobra metade da rota na ordem antiga e metade na nova.
    const expectedOwnerById = new Map(rows.map((row) => [row.id, row.entregadorId]));
    await this.prisma.$transaction(async (tx: any) => {
      await lockLogisticaRouteTransaction(tx, companyId, `plan:${entregadorId || 0}:date:${routeDate}`);
      for (const p of plan.paradas) {
        const changed = await tx.entrega.updateMany({
          where: {
            companyId,
            id: p.id,
            entregadorId: expectedOwnerById.get(p.id) ?? null,
            status: { in: [...LogisticaRotaService.STATUS_ABERTO] },
          },
          data: { rotaOrdem: p.rotaOrdem + pisoOrdem, etaAt: p.etaAt },
        });
        if (changed.count !== 1) throw new ConflictException('Entrega saiu da rota durante o planejamento.');
      }
    });

    const semCoordenada = plan.paradas.filter((p) => p.semCoordenada).length;
    this.logger.log(
      `[logistica] rota planejada ${dayISO} company=${companyId}: ${plan.paradas.length} parada(s), ` +
        `${semCoordenada} sem coord, término ~${plan.terminoPrevisto ?? 'n/a'}.`,
    );

    return {
      date: dayISO,
      total: plan.paradas.length,
      semCoordenada,
      distanciaTotalKm: round2(plan.distanciaTotalKm),
      terminoPrevisto: plan.terminoPrevisto ? plan.terminoPrevisto.toISOString() : null,
      velocidadeMediaKmH: config.velocidadeMediaKmH,
      tempoParadaMin: config.tempoParadaMin,
      // S1 (25/07, PR25072026-ROTA-CONFERIDA) — crachá: engine SEMPRE presente
      // (Lei nº4, "degradação nunca é silenciosa"); degradedReason só quando
      // o Haversine veio de FALHA (ordem manual também é Haversine, mas por
      // escolha — planRouteManual nunca preenche degradedReason).
      engine: plan.engine,
      ...(plan.degradedReason ? { degradedReason: plan.degradedReason } : {}),
      paradas: plan.paradas.map((p) => ({
        id: p.id,
        // o número que SAI é o mesmo que foi gravado — quem lê a resposta
        // (app, desktop, iniciar) não pode ver uma régua diferente da do banco.
        rotaOrdem: p.rotaOrdem + pisoOrdem,
        etaAt: p.etaAt ? p.etaAt.toISOString() : null,
        semCoordenada: p.semCoordenada,
        lat: p.lat,
        lng: p.lng,
        status: p.status,
        nome: p.nome,
        // S2 — aditivo (ver PlannedStop.legDistanceM/legDurationS).
        legDistanceM: p.legDistanceM,
        legDurationS: p.legDurationS,
      })),
    };
  }

  // ── INICIAR ROTA ─────────────────────────────────────────────────────────────
  /**
   * Marca o início da rota. Re-planeja com a ORIGEM atual (GPS do entregador ao
   * apertar "iniciar") e coloca a 1ª parada em 'em_rota' com startedAt=agora.
   */
  async iniciarRota(
    companyId: number,
    input: IniciarRotaInput = {},
    entregadorId?: number,
    actorUserId?: number | null,
    includeCommercialMode = false,
    // PROSPECTOR (07/08) — o ATOR, não só o id dele: a chave nº3 do prospector
    // é "admin sempre, funcionário só com prospectorEquipe", e isso é PAPEL.
    // Aditivo e por último: quem não passa ator cai no fail-closed (tratado
    // como funcionário comum) e o resto do iniciar-rota é byte a byte o mesmo.
    // 12/08 — o TIPO do ator ganhou o `id`: a chave nº4 (escolha da semana) é DA
    // PESSOA, então o papel sozinho já não responde a pergunta inteira.
    actor?: AtorProspector,
  ): Promise<PlanejarRotaResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const effectiveDriverId = entregadorId ?? (await this.resolveSingleDriver(companyId, input.date, input.deliveryIds, actor));
    const routeDate = canonicalRouteDate(input.date);
    // Reserva a execução ANTES de calcular a rota. Puxar/Retomar usam a mesma
    // trava driver+dia e enxergam INITIALIZING, portanto não conseguem anexar
    // paradas depois que este Iniciar já fotografou a fila.
    const route = await this.claimLogisticaRoute(companyId, effectiveDriverId, routeDate);
    let plan: PlanejarRotaResult;
    try {
      plan = await this.planejarRota(companyId, {
        date: input.date,
        origemLat: input.origemLat,
        origemLng: input.origemLng,
        deliveryIds: input.deliveryIds,
        ordemManual: input.ordemManual,
      }, effectiveDriverId, actorUserId, true);
    } catch (error) {
      await this.releaseInitialization(companyId, route.id);
      throw error;
    }

    if (plan.paradas.length === 0) {
      await this.releaseInitialization(companyId, route.id);
      // "JÁ MONTADA POR X" (10/08, ROTA v2 F1b) — antes desta checagem, um dia
      // com zero paradas ABERTAS pra ESTE motorista (porque a rota inteira já
      // é de outro) caía direto na mensagem genérica de dia vazio, como se
      // ninguém tivesse feito nada. Se sobrar gente que não é o motorista
      // efetivo, o dia tem dono — 409 explica QUEM, em vez de mandar montar de
      // novo por cima.
      const { start, end } = resolveDayRange(input.date);
      const montadores = (await quemMontouODia(this.prisma, companyId, start, end)).filter(
        (m) => m.userId !== effectiveDriverId,
      );
      if (montadores.length > 0) {
        throw rotaDeOutroMotoristaError(montadores, isLogisticaAdmin(actor), routeDate);
      }
      throw new BadRequestException('Não há entregas abertas para iniciar.');
    }

    // ROTA v2 F3d (10/08, "PICAR A PONTE") — MÁQUINA NOVA. A dança
    // PLANNED→INITIALIZING→ACTIVE com lease/CAS só existia pra proteger um
    // débito por bloco que morreu (logistica-route-billing.service.ts). Hoje:
    // garante a `LogisticaRoute` (reaproveita a não-COMPLETED de
    // empresa+motorista+data; sem ela, cria PLANNED) e congela os stops —
    // depois disso, vai DIRETO a ACTIVE+startedAt. `planejarRota` (chamado
    // acima) já garantiu o assento e o dia pago; o gate aqui de novo é
    // barato e idempotente (cobre quem chega direto no Iniciar sem
    // replanejar por um caminho alternativo).
    // `podeComprar` = dono/master (LEI DO VENDEDOR): só quem pode gastar o
    // crédito da empresa vê o botão de comprar o passe no 402.
    await this.cobranca.assertAssentoDoDia(companyId, effectiveDriverId, routeDate, isBillingOwnerActor(actor as any));
    await this.congelarStops(companyId, route.id, routeDate, plan.paradas.map((p) => p.id));

    // 1ª parada roteável vira 'em_rota' com startedAt — só se ainda estiver
    // 'agendada' (não rebaixa nada já em rota/entregue).
    // ⚠️ "primeira" é a MENOR ordem DESTE plano, não o número zero: desde o
    // piso de numeração (ver `maiorOrdemFechadaDoDia`) uma rota re-planejada no
    // meio do dia começa em 3, 7, 12… Comparar com 0 fazia o `find` falhar
    // sempre e cair no fallback calado, perdendo o "roteável" da regra.
    const menorOrdem = plan.paradas.reduce((m, p) => Math.min(m, p.rotaOrdem), Number.POSITIVE_INFINITY);
    const primeira = plan.paradas.find((p) => p.rotaOrdem === menorOrdem && !p.semCoordenada) ?? plan.paradas[0];
    const startedAt = new Date();
    let changedFirst = false;
    let trackingSessionEnsured = false;
    try {
      if (primeira && primeira.status === 'agendada') {
        const changed = await this.prisma.entrega.updateMany({
          where: { companyId, id: primeira.id, entregadorId: effectiveDriverId, status: 'agendada' },
          data: { status: 'em_rota', startedAt },
        });
        changedFirst = changed.count === 1;
        if (changedFirst) primeira.status = 'em_rota';
      }
      // TRACKED precisa da sessão de GPS ANTES de a rota virar ACTIVE — se a
      // sessão falhar, a rota fica PLANNED (retomar tenta de novo, limpo).
      if (route.mode === 'TRACKED') {
        if (!this.tracking) throw new Error('Serviço de rastreamento indisponível para a Rota Rastreada.');
        const session = await this.tracking.ensureSessionForStartedRoute(companyId, route.id, startedAt);
        if (!session) throw new Error('Não foi possível criar a sessão da Rota Rastreada.');
        trackingSessionEnsured = true;
      }
      if (route.status !== 'ACTIVE') {
        // count 0 = outra requisição concorrente já ativou (retomar/duplo-clique)
        // — idempotente, segue o fluxo normal sem erro.
        const activated = await this.prisma.logisticaRoute.updateMany({
          where: { companyId, id: route.id, status: { in: ['PLANNED', 'INITIALIZING'] }, operationalEndedAt: null },
          data: { status: 'ACTIVE', startedAt },
        });
        if (activated.count !== 1) throw new ConflictException('A rota mudou enquanto era iniciada. Atualize a tela.');
      }
    } catch (error) {
      if (changedFirst) {
        await this.prisma.entrega.updateMany({
          where: { companyId, id: primeira.id, status: 'em_rota', startedAt },
          data: { status: 'agendada', startedAt: null },
        }).catch(() => undefined);
      }
      if (trackingSessionEnsured && this.tracking) {
        await this.tracking.discardUnboundSessionAfterRouteFailure(companyId, route.id).catch(() => undefined);
      }
      await this.releaseInitialization(companyId, route.id);
      throw error;
    }
    // PR17072026 — (re)iniciar REATIVA a rota operacional: zera a marca de
    // "encerrada" (operationalEndedAt, decoupled da cobrança) para a 2ª leva no
    // mesmo dia voltar a aparecer como ativa. ANTES de ler a metadata abaixo (que
    // gateia routeStatus por esse campo), senão a própria resposta do iniciar
    // sairia como encerrada. Best-effort: falha aqui não desfaz a rota já ativa.
    await this.prisma.logisticaRoute
      .updateMany({
        where: { companyId, id: route.id, operationalEndedAt: { not: null } },
        data: { operationalEndedAt: null },
      })
      .catch(() => undefined);
    // B4 — o caminhão SAIU: reserva o previsto da rota na gaveta do dia (fonte
    // única com a declaração manual — quem declarou manda, ver o serviço).
    await this.reconciliarReservaRotaBestEffort(companyId, input.date, 'iniciar');
    // PROSPECTOR CNPJ — o caminhão SAIU: as empresas do corredor embarcam na
    // folha. MESMO lugar da reserva do B4 (rota já ACTIVE, paradas já ordenadas)
    // e MESMA lei: best-effort com voz, nunca derruba o iniciar.
    const prospectorPayload = await this.embarcarProspectosBestEffort(
      companyId,
      plan,
      routeDate,
      actor,
    );
    const operational = this.tracking
      ? await this.tracking.getOperationalRouteMetadata(
          companyId,
          effectiveDriverId,
          routeDate,
          includeCommercialMode,
        )
      : {
          routeId: route.id,
          trackingRequired: route.mode === 'TRACKED',
          routeStatus: 'ACTIVE',
          trackingSessionId: null,
          trackingStatus: null,
          ...(includeCommercialMode ? { routeMode: route.mode } : {}),
        };
    const { routeMode, ...operationalOnly } = operational;
    return {
      ...plan,
      ...operationalOnly,
      ...(includeCommercialMode ? { routeMode: routeMode ?? route.mode } : {}),
      // ADITIVO: a chave só existe quando o prospector rodou de verdade (4
      // chaves abertas). Gate fechado ou falha = payload byte a byte o de hoje.
      ...(prospectorPayload ? { prospector: prospectorPayload } : {}),
    };
  }

  /**
   * ROTA v2 F3d — garante a `LogisticaRoute` do dia: reaproveita a mais
   * recente que ainda não é terminal/morta (PLANNED ou ACTIVE); sem ela,
   * cria PLANNED. Estados antigos da máquina morta (REFUNDING/FAILED/
   * INITIALIZING) NUNCA são reaproveitados — ficam quietos (o expurgo já
   * limpa rota morta vazia); uma linha nova nasce do lado deles. `mode`
   * (ESSENTIAL|TRACKED) só é decidido na CRIAÇÃO e congela ali — mudar a
   * config depois não move rota em andamento, mesma lei de sempre.
   */
  private async claimLogisticaRoute(
    companyId: number,
    entregadorId: number,
    routeDate: string,
  ): Promise<{ id: string; mode: LogisticaRouteMode; status: string; operationalEndedAt: Date | null }> {
    return this.prisma.$transaction(async (tx) => {
      // Mesma chave/lock de sempre (driver+data): evita duas requisições
      // concorrentes criando duas linhas novas pro mesmo motorista+dia.
      await lockLogisticaRouteTransaction(tx, companyId, `driver:${entregadorId}:date:${routeDate}`);
      const existing = await tx.logisticaRoute.findFirst({
        // Uma execução encerrada nunca volta à vida. TRACKED congela sessão,
        // aparelho e trilha no routeId; reaproveitar a linha encerrada faria a
        // próxima saída herdar uma sessão ENDED (ou a autoria da saída anterior).
        where: {
          companyId,
          entregadorId,
          routeDate,
          status: { in: ['PLANNED', 'INITIALIZING', 'ACTIVE'] },
          operationalEndedAt: null,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      if (existing?.status === 'INITIALIZING') {
        throw new ConflictException('Esta rota já está sendo iniciada. Aguarde e atualize a tela.');
      }
      if (existing?.status === 'ACTIVE') return existing as any;
      if (existing) {
        const claimed = await tx.logisticaRoute.updateMany({
          where: { companyId, id: existing.id, status: 'PLANNED', operationalEndedAt: null },
          data: { status: 'INITIALIZING' },
        });
        if (claimed.count !== 1) throw new ConflictException('A rota mudou enquanto era iniciada. Atualize a tela.');
        return { ...existing, status: 'INITIALIZING' } as any;
      }
      const mode = await this.resolveRouteModeForCompany(companyId);
      return tx.logisticaRoute.create({
        data: { companyId, entregadorId, routeDate, mode, status: 'INITIALIZING' },
      }) as any;
    });
  }

  private async releaseInitialization(companyId: number, routeId: string): Promise<void> {
    await this.prisma.logisticaRoute.updateMany({
      where: { companyId, id: routeId, status: 'INITIALIZING', operationalEndedAt: null },
      data: { status: 'PLANNED' },
    }).catch(() => undefined);
  }

  /**
   * ROTA v2 F3d — o modo (ESSENTIAL|TRACKED) da PRÓXIMA rota a nascer.
   * Réplica enxuta de `effectiveRouteMode` (logistica-config.service.ts,
   * privada lá) — os 4 gates de sempre: flag global + toggle do tenant +
   * nível FULL + preferência salva. Qualquer buraco cai em ESSENTIAL.
   */
  private async resolveRouteModeForCompany(companyId: number): Promise<LogisticaRouteMode> {
    if (!isLogisticaTrackingEnabled()) return 'ESSENTIAL';
    const cfg = await this.prisma.logisticaConfig
      .findUnique({
        where: { companyId },
        select: { trackingAtivo: true, logisticaNivel: true, modoRotaPadrao: true },
      })
      .catch(() => null);
    if (!cfg?.trackingAtivo) return 'ESSENTIAL';
    if (storedNivel((cfg as any).logisticaNivel) !== 'FULL') return 'ESSENTIAL';
    return String((cfg as any).modoRotaPadrao || '').trim().toUpperCase() === 'TRACKED' ? 'TRACKED' : 'ESSENTIAL';
  }

  /**
   * ROTA v2 F3d — congela as paradas (`LogisticaRouteStop`), append-only e
   * SEM lease (a dança de retry existia pra proteger claim de cobrança que
   * morreu — o advisory lock sozinho já serializa quem escreve nesta rota).
   * Pula `deliveryId` já congelado NESTA rota; migra de graça um stop preso
   * numa rota MORTA (COMPLETED, encerrada operacionalmente, ou de um dia
   * anterior — mesma lei de sempre: pendência de ontem entra de graça hoje);
   * rota estrangeira ainda VIVA no mesmo dia continua 409 humano — a régua
   * financeira sumiu, mas "duas rotas puxando a mesma entrega" continua bug
   * operacional de verdade.
   */
  private async congelarStops(
    companyId: number,
    routeId: string,
    routeDate: string,
    deliveryIds: string[],
  ): Promise<void> {
    const ids = [...new Set(deliveryIds.filter(Boolean))];
    if (!ids.length) return;
    await this.prisma.$transaction(async (tx) => {
      await lockLogisticaRouteTransaction(tx, companyId, routeId);
      const atual = await tx.logisticaRoute.findFirst({ where: { companyId, id: routeId } });
      if (!atual) throw new BadRequestException('Rota não encontrada.');
      if (atual.status === 'COMPLETED') throw new ConflictException('Rota concluída não aceita novas entregas.');

      const existentes = (await tx.logisticaRouteStop.findMany({
        where: { companyId, deliveryId: { in: ids } },
        select: { deliveryId: true, routeId: true },
      })) as Array<{ deliveryId: string; routeId: string }>;
      const donoPorEntrega = new Map(existentes.map((e) => [e.deliveryId, e.routeId]));
      const estrangeiras = [...new Set([...donoPorEntrega.values()].filter((r) => r !== routeId))];

      if (estrangeiras.length > 0) {
        const donos = (await tx.logisticaRoute.findMany({
          where: { companyId, id: { in: estrangeiras } },
        })) as Array<{ id: string; status: string; operationalEndedAt: Date | null; routeDate: string }>;
        const donoPorId = new Map(donos.map((d) => [d.id, d]));
        for (const foreignRouteId of estrangeiras) {
          const dono = donoPorId.get(foreignRouteId);
          const migravel =
            !dono ||
            dono.status === 'COMPLETED' ||
            dono.operationalEndedAt != null ||
            String(dono.routeDate) < String(routeDate);
          if (!migravel) throw stopDeOutraRotaError();
        }
        for (const [deliveryId, foreignRouteId] of donoPorEntrega) {
          if (foreignRouteId === routeId) continue;
          const aggregate = await tx.logisticaRouteStop.aggregate({
            where: { companyId, routeId },
            _max: { snapshotOrder: true },
          });
          const snapshotOrder = Number(aggregate?._max?.snapshotOrder ?? -1) + 1;
          const moved = await tx.logisticaRouteStop.updateMany({
            where: { companyId, deliveryId, routeId: foreignRouteId },
            data: { routeId, snapshotOrder, billingExempt: true },
          });
          if (moved.count !== 1) throw stopDeOutraRotaError();
        }
      }

      for (const deliveryId of ids) {
        if (donoPorEntrega.has(deliveryId)) continue; // já era desta rota ou migrou acima
        const aggregate = await tx.logisticaRouteStop.aggregate({
          where: { companyId, routeId },
          _max: { snapshotOrder: true },
        });
        const snapshotOrder = Number(aggregate?._max?.snapshotOrder ?? -1) + 1;
        await tx.logisticaRouteStop.create({ data: { companyId, routeId, deliveryId, snapshotOrder } });
      }
    });
  }

  // ── ENCERRAR ROTA (PR17072026 Onda 1) ────────────────────────────────────────
  /**
   * Encerra a rota do dia de forma TRANSACIONAL e tudo-ou-nada. Serve os DOIS
   * casos do app ("Cancelar planejamento", antes de iniciar, e "Encerrar rota",
   * no meio) — a diferença é só a cópia da tela; o primitivo do backend é único.
   *
   * Substitui o loop antigo `POST /logistica/entregas/:id/cancelar` por parada
   * (performCancelRoute no app.js): se a rede caísse no meio, metade cancelava e
   * metade ficava (cancelamento PARCIAL); além disso 'cancelada' é semântica de
   * FALHA — errada para "parei a rota, o resto é pendência pra outro dia".
   *
   * Dentro de UMA prisma.$transaction:
   *  - 'entregue'/'cancelada': NUNCA entram no WHERE de escrita — ficam intocadas
   *    (contam em entregues/naoEntregues só de LEITURA).
   *  - 'agendada'/'em_rota' COM sinal de que estavam na rota (rotaOrdem/etaAt/
   *    startedAt preenchidos, ou já em_rota) voltam para 'agendada' com
   *    rotaOrdem/etaAt/startedAt=null. scheduledAt NUNCA muda (não backdata) —
   *    assim a retomada no MESMO dia re-planeja normal (fetchParadasAbertas pega
   *    de novo) e, no dia seguinte, entram na fila de pendência do admin
   *    (scheduledAt < início do dia — ver logistica-admin-route.service.ts:94).
   *  - 'agendada' SEM nenhum sinal de rota (rotaOrdem/etaAt/startedAt todos
   *    null — nunca passou por planejar/iniciar) fica de fora da contagem de
   *    `pendentes` e não é escrita: já está exatamente no estado-alvo. Sem essa
   *    exclusão a IDEMPOTÊNCIA exigida pelo contrato ("2ª chamada acha 0
   *    abertas → pendentes: 0") seria IMPOSSÍVEL de satisfazer: o próprio
   *    revert desta transação deixa a entrega em 'agendada', que TAMBÉM é um
   *    dos status "abertos" do item 2 do contrato — uma leitura 100% literal
   *    ("status IN agendada/em_rota") re-contaria as MESMAS entregas pra sempre
   *    a cada nova chamada. A ESCRITA final é idêntica nas duas leituras (uma
   *    entrega já limpa recebe os MESMOS valores null de novo — no-op); só a
   *    contagem/seleção fica mais precisa e resolve a contradição. Documentado
   *    aqui de propósito para o revisor conferir o raciocínio.
   *  - NÃO dispara WhatsApp/cobrança, NÃO cria DeletionRecord, NÃO toca
   *    comprovante nem FinanceiroCharge — este método só lê/escreve `Entrega`.
   *
   * LogisticaRoute — INVESTIGADO, DELIBERADAMENTE NÃO tocado. Cogitei marcar a
   * linha ACTIVE/PLANNED do dia como COMPLETED (terminal natural do enum) para
   * o app parar de ver routeStatus==='ACTIVE'. Descartado depois de ler
   * logistica-route-billing.service.ts e os dois reconciliadores
   * (logistica-offline-reservation-reconciler.service.ts,
   * logistica-offline-tracked-billing.service.ts):
   *   1) prepareRoute()/beginInitialization() tratam route.status==='COMPLETED'
   *      como TERMINAL: iniciarRota() SEGUINTE no mesmo dia (mesmo motorista)
   *      lança ConflictException('Esta rota já foi concluída e não pode ser
   *      iniciada novamente.') — incondicional, vale pra ESSENTIAL e TRACKED.
   *      Isso QUEBRARIA a exigência do próprio contrato ("retomada no mesmo
   *      dia re-planeja normal"): o motorista ficaria travado até o dia
   *      seguinte por causa da linha da ROTA, mesmo com as ENTREGAS já
   *      corretamente revertidas para pendência.
   *   2) Pro modo ESSENTIAL, reconcilePendingRefunds() (o reconciliador de
   *      estorno) só varre rotas com status PLANNED(stale)/INITIALIZING(lease
   *      vencida)/FAILED/REFUNDING — COMPLETED está fora do WHERE. Marcar
   *      COMPLETED NUNCA dispara estorno de bloco essencial já debitado
   *      (confirmado lendo o método linha a linha). Este modo, isolado, SERIA
   *      seguro.
   *   3) Pro modo TRACKED, logistica-offline-reservation-reconciler.service.ts
   *      varre justamente status==='COMPLETED' e devolve (refund) reservas por
   *      parada ainda DEBITED com lease vencida — comportamento INTENCIONAL do
   *      sistema (documentado no próprio logistica.module.ts: "O reconciliador
   *      devolve claims ainda DEBITED depois que a rota chega a COMPLETED"),
   *      não um bug. Não seria um erro financeiro em si (a parada revertida
   *      pra pendência não foi entregue SOB esta sessão — devolver o crédito
   *      reservado evita cobrar 2× quando for reentregue em rota nova), mas É
   *      um "caminho de refund atrelado à transição" que o contrato pede pra
   *      evitar.
   *   CONCLUSÃO: (1) + (3) descartam COMPLETED. Em vez do status de cobrança,
   *   marco um campo OPERACIONAL decoupled — `operationalEndedAt` (schema) — na
   *   linha ACTIVE/INITIALIZING do dia. As duas projeções de rota lidas pelo app
   *   (getOperationalRouteMetadata e logistica-admin-route-view) passam a reportar
   *   routeStatus NÃO-ativo quando esse campo está setado (e a admin-view para de
   *   promover a próxima parada pra em_rota). Assim o app enxerga a rota como
   *   encerrada SEM COMPLETED: nada de trava de reiniciar no mesmo dia, nada de
   *   reconciliador de estorno. `iniciarRota` zera o campo — a 2ª leva no mesmo
   *   dia (dono, 17/07: "posso sair de novo hoje") volta a aparecer ativa,
   *   reaproveitando a MESMA linha de cobrança ACTIVE (beginInitialization
   *   devolve alreadyActive=true, sem re-cobrar). Este método NÃO altera o
   *   `status`/cobrança da rota, só o campo operacional; NUNCA toca
   *   FinanceiroCharge, comprovante ou entrega 'entregue'.
   */
  async encerrarRota(
    companyId: number,
    input: EncerrarRotaInput = {},
    entregadorId?: number,
  ): Promise<EncerrarRotaResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const { start, end, dayISO } = resolveDayRange(input.date);
    const routeDate = canonicalRouteDate(input.date);

    const resumo = await this.prisma.$transaction(async (tx: any) => {
      let lockedRouteIds: string[] = [];
      // A mesma trava usada por tracking, confirmação e cancelamento. Quem
      // encerra primeiro fecha a porta antes de qualquer ponto/evento novo;
      // quem já estava gravando termina antes do carimbo de encerramento.
      if (
        typeof tx.logisticaRoute?.findMany === 'function' &&
        typeof tx.$executeRawUnsafe === 'function'
      ) {
        const routes = await tx.logisticaRoute.findMany({
          where: {
            companyId,
            routeDate,
            ...(entregadorId ? { entregadorId } : {}),
            status: { in: ['ACTIVE', 'INITIALIZING'] },
            operationalEndedAt: null,
          },
          select: { id: true },
          orderBy: { id: 'asc' },
        });
        lockedRouteIds = routes.map((route: any) => String(route.id));
        for (const route of routes) await lockLogisticaRouteTransaction(tx, companyId, route.id);
      }
      // Mesmo escopo de "entregas do dia" que a lista principal usa (listRota,
      // logistica.service.ts): agendadas pro range do dia + as sem data mas
      // ainda abertas (perpétuas até serem tratadas). TODOS os status entram
      // aqui — preciso do total/entregues/naoEntregues, não só das abertas
      // (diferente de fetchParadasAbertas, que serve só o planejador).
      const rows: EncerrarRotaRow[] = await tx.entrega.findMany({
        where: {
          companyId,
          ...(entregadorId ? { entregadorId } : {}),
          OR: [
            { scheduledAt: { gte: start, lte: end } },
            { scheduledAt: null, status: { in: [...LogisticaRotaService.STATUS_ABERTO] } },
          ],
        },
        select: { id: true, status: true, rotaOrdem: true, etaAt: true, startedAt: true },
      });

      const total = rows.length;
      let entregues = 0;
      let naoEntregues = 0;
      const openIds: string[] = [];
      for (const row of rows) {
        if (row.status === 'entregue') { entregues++; continue; }
        if (row.status === 'cancelada') { naoEntregues++; continue; }
        if (row.status !== 'agendada' && row.status !== 'em_rota') continue; // defensivo: hoje só existem os 4 status do schema
        const estavaNaRota = row.status === 'em_rota' || row.rotaOrdem != null || row.etaAt != null || row.startedAt != null;
        if (estavaNaRota) openIds.push(row.id);
      }

      let pendentes = 0;
      if (openIds.length > 0) {
        // WHERE re-checa status (defesa extra dentro da própria transação) —
        // nunca sobrescreve uma entrega que virou 'entregue'/'cancelada' entre
        // a leitura acima e este update.
        // ⚠️ Este é o ÚNICO dos três caminhos que NÃO solta o `entregadorId`, e
        // o motivo é o que ele faz com a entrega: aqui ela volta VIVA
        // ('agendada'). Toda leitura do app do motorista é escopada por
        // `entregadorId` — soltar o dono aqui faria a entrega viva DESAPARECER da
        // tela de quem acabou de encerrar, sem ninguém ver. (Peguei isso no teste
        // "2ª chamada acha 0 abertas", que passou a contar 0 em vez de 2.)
        //
        // Onde o dono mandou soltar, está solto: `limparDia` (o botão CANCELAR do
        // aparelho) e `descartarMontagem` (a saída de quem não aceitou) matam a
        // entrega — morta, ela não pode mesmo ficar com dono.
        const reverted = await tx.entrega.updateMany({
          where: { companyId, id: { in: openIds }, status: { in: [...LogisticaRotaService.STATUS_ABERTO] } },
          data: { status: 'agendada', rotaOrdem: null, etaAt: null, startedAt: null },
        });
        pendentes = reverted.count;
      }

      // Encerra a rota OPERACIONALMENTE (campo decoupled — ver comentário do
      // método): marca operationalEndedAt na linha viva do dia para o app parar
      // de ver routeStatus ativo. NÃO altera `status` de cobrança. Na MESMA
      // transação das entregas (tudo-ou-nada). Sem entregadorId, encerra as
      // rotas vivas de todos os motoristas da empresa no dia (mesmo escopo do
      // revert de entregas acima).
      await tx.logisticaRoute.updateMany({
        where: {
          companyId,
          routeDate,
          ...(entregadorId ? { entregadorId } : {}),
          status: { in: ['ACTIVE', 'INITIALIZING'] },
        },
        data: { operationalEndedAt: new Date() },
      });
      if (lockedRouteIds.length && typeof tx.logisticaTrackingSession?.updateMany === 'function') {
        await tx.logisticaTrackingSession.updateMany({
          where: { companyId, routeId: { in: lockedRouteIds }, status: 'ACTIVE' },
          data: { status: 'ENDED', endedAt: new Date() },
        });
      }

      return { total, entregues, naoEntregues, pendentes };
    });

    this.logger.log(
      `[logistica] rota encerrada ${dayISO} company=${companyId}` +
        (entregadorId ? ` entregador=${entregadorId}` : '') +
        `: total=${resumo.total} entregues=${resumo.entregues} naoEntregues=${resumo.naoEntregues} pendentes=${resumo.pendentes}` +
        (input.motivo ? ` motivo="${String(input.motivo).slice(0, 200)}"` : ''),
    );

    // B4 — paradas devolvidas pra pendência = previsto caiu: a reconciliação
    // devolve o remanescente da reserva sozinha (gaveta MANUAL fica intocada —
    // essa fecha só na conferência do retorno, como sempre).
    await this.reconciliarReservaRotaBestEffort(companyId, input.date, 'encerrar');

    return { ok: true, resumo };
  }

  // ── DESCARTAR MONTAGEM (27/07) ───────────────────────────────────────────────
  /**
   * 🔴 O TOQUE NO DIA NÃO PODE CONSUMIR O DIA (incidente 27/07, company 48).
   *
   * Desde que montar virou "1 toque no chip do dia" (sem tela de prévia), o toque
   * MATERIALIZA a ocorrência no servidor: `generateDay` cria a Entrega com
   * `agendaOcorrenciaKey = agenda:<plano>:<data de origem>` e empurra a
   * `proximaData` do plano pra semana seguinte. Sair sem aceitar chamava
   * `encerrarRota`, que só devolve as abertas pra pendência (zera rotaOrdem/etaAt)
   * — o avanço do plano FICAVA DE PÉ.
   *
   * Medido em produção: numa segunda (27/07) o dono tocou no chip TERÇA, olhou e
   * fechou. As 7 visitas de terça (28/07) nasceram dentro da segunda e os 7 planos
   * pularam pra 04/08 — a terça de AMANHÃ ficou vazia por causa de um toque que
   * ninguém confirmou, sem debitar 1 crédito (a cobrança só nasce no "Aceitar").
   *
   * Este método é o desfazer de quem NÃO ACEITOU. Diferente do "Limpar dia" (que
   * descarta o dia inteiro, ordem do dono 18/07 — e por isso continua PROIBIDO no
   * caminho de abandono, regra 26/07), aqui o corte é cirúrgico:
   *
   *  - Entrega ABERTA que a Agenda materializou (`agendaOcorrenciaKey` presente),
   *    ainda INTOCADA (status 'agendada', sem `startedAt`, sem comprovante, sem
   *    cobrança lançada e fora de rota comercial) → 'cancelada', chave solta e
   *    `proximaData` do plano de volta pra data de origem da chave. O dia volta
   *    a existir pra quem é dele.
   *  - Entrega aberta SEM chave (avulsa, manual, "Registrar caminho") ou já
   *    começada → só perde a ordem, EXATAMENTE como no `encerrarRota`. Trabalho
   *    de gente não some porque alguém fechou uma montagem.
   *  - 'entregue'/'cancelada', comprovante, FinanceiroCharge: INTOCADOS.
   *
   * IDEMPOTENTE: 2ª chamada não acha mais nada aberto com chave → zeros, sem erro.
   * O `proximaData: { gt: alvoData }` do restore garante o mesmo na Agenda.
   */
  async descartarMontagem(
    companyId: number,
    input: EncerrarRotaInput = {},
    entregadorId?: number,
  ): Promise<DescartarMontagemResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const { start, end, dayISO } = resolveDayRange(input.date);
    const routeDate = canonicalRouteDate(input.date);

    const txResultado = await this.prisma.$transaction(async (tx: any) => {
      // Mesmo escopo "abertas do dia" do encerrarRota (range do dia + sem-data
      // abertas). Aqui preciso de mais campos por linha pra separar "o que a
      // montagem trouxe" de "o que já era da pessoa".
      const abertas: DescartarMontagemRow[] = await tx.entrega.findMany({
        where: {
          companyId,
          ...(entregadorId ? { entregadorId } : {}),
          status: { in: [...LogisticaRotaService.STATUS_ABERTO] },
          OR: [
            { scheduledAt: { gte: start, lte: end } },
            { scheduledAt: null },
          ],
        },
        select: {
          id: true,
          status: true,
          startedAt: true,
          cobrancaStatus: true,
          // F0 (27/07) — dono do evento no extrato (LogisticaAgendaEvento).
          customerProfileId: true,
          planoEntregaId: true,
          agendaOcorrenciaKey: true,
          rotaModeloId: true,
          comprovanteConfirmadoAt: true,
          // 27/07 — a rota da parada congelada vem junto: o que barra o descarte
          // é rota VIVA, não o congelamento em si (ver logistica-rota-viva.util).
          logisticaRouteStop: {
            select: {
              id: true,
              route: { select: { status: true, operationalEndedAt: true, routeDate: true } },
            },
          },
          _count: { select: { comprovantes: true } },
        },
      });

      // "Intocada" = a MONTAGEM trouxe pro dia e NADA aconteceu com ela. Duas
      // portas trazem parada: a Agenda (`agendaOcorrenciaKey`, e aí a ocorrência
      // volta) e a rota salva (`rotaModeloId`, que não tem ocorrência pra
      // devolver — só sai do dia). Sem a 2ª porta, cancelar uma rota montada a
      // partir de "Rotas salvas" largava as paradas penduradas no dia: medido em
      // campo, descartadas=0 e 52 pendências.
      // Qualquer sinal de vida (saiu pra rua, tem foto/assinatura, virou parada
      // de rota comercial, cobrança já lançada) tira a entrega do descarte, e o
      // que é da pessoa (avulsa do "+", Registrar caminho) nunca entra.
      const descartaveis = abertas.filter((row) => (
        (!!row.agendaOcorrenciaKey || !!row.rotaModeloId)
        && row.status === 'agendada'
        && !row.startedAt
        && !row.comprovanteConfirmadoAt
        // Parada congelada só protege a entrega enquanto a ROTA está viva —
        // rota encerrada/terminal/de dia passado não segura mais nada (senão o
        // descarte larga pendência e a ocorrência nunca volta pro cliente).
        && stopDeRotaMorta(row.logisticaRouteStop as any, dayISO)
        && (row._count?.comprovantes ?? 0) === 0
        && (row.cobrancaStatus === 'pendente' || !row.cobrancaStatus)
      ));
      const idsDescarte = descartaveis.map((row) => row.id);

      let descartadas = 0;
      if (idsDescarte.length) {
        /* 🔴 CARIMBA ANTES DE SOLTAR (10/08, F2.1). A chave viva TEM que sair (ver
           abaixo), mas apagá-la sem guardar de onde veio deixava a cancelada sem
           identidade nenhuma. Uma escrita por chave — são poucas por descarte, e
           `updateMany` não sabe copiar coluna em coluna. */
        const comChave = descartaveis.filter((row) => !!row.agendaOcorrenciaKey);
        for (const row of comChave) {
          await tx.entrega.updateMany({
            where: { companyId, id: row.id, status: 'agendada' },
            data: { agendaOcorrenciaKeyOrigem: row.agendaOcorrenciaKey },
          });
        }
        const canceladas = await tx.entrega.updateMany({
          // Re-checa status DENTRO da transação (mesma defesa do limparDia):
          // nunca sobrescreve uma entrega que virou 'entregue' no meio.
          where: { companyId, id: { in: idsDescarte }, status: 'agendada' },
          data: {
            status: 'cancelada',
            rotaOrdem: null,
            etaAt: null,
            startedAt: null,
            // A chave é ÚNICA por empresa: presa na entrega cancelada, o
            // `generateDay` acha "já existe" e pula o cliente PARA SEMPRE
            // (mesma armadilha resolvida no limparDia em 25/07). A ORIGEM dela
            // acabou de ser carimbada logo acima — some a chave, fica a história.
            agendaOcorrenciaKey: null,
          },
        });
        descartadas = canceladas.count;
      }
      // F0 (27/07, endurecido) — extrato: cada cancelamento por descarte vira UMA
      // linha, mas a GRAVAÇÃO fica pra DEPOIS do commit (contrato do evento.util:
      // INSERT falhando dentro da tx abortaria o descarte inteiro no Postgres).
      // Aqui só se coleta o que gravar.
      const eventosDescarte = descartaveis.map((row) => {
        const origemChave = row.planoEntregaId ? sourceDateFromOccurrenceKey(row.agendaOcorrenciaKey) : null;
        return {
          companyId,
          customerProfileId: row.customerProfileId,
          entregaId: row.id,
          planoEntregaId: row.planoEntregaId,
          tipo: 'OCORRENCIA_DEVOLVIDA' as const,
          paraTexto: origemChave ? formatDDMM(origemChave) : null,
          origem: 'descarte' as const,
          actorUserId: null,
        };
      });

      // Devolve o plano pra DATA DE ORIGEM da ocorrência (a que está na chave),
      // nunca pro dia operacional — escrever uma data fora do `diaSemana` do
      // plano mata aquele dia pra sempre (fix 26/07, "a sexta que morreu").
      const planosPorOrigem = new Map<string, Set<string>>();
      for (const row of descartaveis) {
        if (!row.planoEntregaId) continue;
        const origem = sourceDateFromOccurrenceKey(row.agendaOcorrenciaKey);
        if (!origem) continue;
        const grupo = planosPorOrigem.get(origem);
        if (grupo) grupo.add(row.planoEntregaId);
        else planosPorOrigem.set(origem, new Set([row.planoEntregaId]));
      }
      let planosLiberados = 0;
      for (const [origem, ids] of planosPorOrigem) {
        const alvoData = saoPauloMidnight(origem);
        const liberados = await tx.logisticaPlanoEntrega.updateMany({
          where: { companyId, id: { in: [...ids] }, proximaData: { gt: alvoData } },
          data: { proximaData: alvoData },
        });
        planosLiberados += liberados.count;
      }

      // O que SOBROU aberto perde a ordem — e, no DESCARTE, também o motorista.
      //
      // 🔴 PR29072026 (bug do dono, 29/07): a entrega revertida continuava colada
      // no `entregadorId` de quem desistiu. Ele indicou uma rota, a pessoa
      // aceitou e cancelou, ele materializou entregas pelo desktop, e o dia
      // ficou com paradas de DOIS motoristas — estado que o `resolveSingleDriver`
      // bloqueia. Resultado medido em produção: ele travado sem saber por quê.
      //
      // Aqui e SÓ aqui: descartar é "eu não aceitei isso", então a parada volta
      // pra fila SEM dono e qualquer montagem seguinte pode assumi-la. No
      // `encerrarRota` (fim de rota REAL, na rua) a pendência continua sendo
      // daquele motorista de propósito — o trabalho era dele e não acabou.
      const descarteSet = new Set(idsDescarte);
      const idsPendencia = abertas.filter((row) => !descarteSet.has(row.id)).map((row) => row.id);
      let pendentes = 0;
      if (idsPendencia.length) {
        const revertidas = await tx.entrega.updateMany({
          where: {
            companyId,
            id: { in: idsPendencia },
            status: { in: [...LogisticaRotaService.STATUS_ABERTO] },
          },
          data: { status: 'agendada', rotaOrdem: null, etaAt: null, startedAt: null, entregadorId: null },
        });
        pendentes = revertidas.count;
      }

      // Encerra a rota OPERACIONALMENTE (campo decoupled — mesmo comentário do
      // encerrarRota): NÃO altera `status` de cobrança, NÃO estorna nada.
      await tx.logisticaRoute.updateMany({
        where: {
          companyId,
          routeDate,
          ...(entregadorId ? { entregadorId } : {}),
          status: { in: ['ACTIVE', 'INITIALIZING'] },
        },
        data: { operationalEndedAt: new Date() },
      });

      return { descartadas, planosLiberados, pendentes, eventosDescarte };
    });

    // Pós-commit: telemetria com o prisma raiz (nunca dentro da tx — ver acima).
    // Default defensivo: mock pobre de $transaction em teste pode devolver undefined.
    const { eventosDescarte = [], ...resumo } = txResultado ?? { descartadas: 0, planosLiberados: 0, pendentes: 0 };
    for (const evento of eventosDescarte) {
      await registrarEventoAgenda(this.prisma, evento);
    }

    this.logger.log(
      `[logistica] montagem descartada ${dayISO} company=${companyId}` +
        (entregadorId ? ` entregador=${entregadorId}` : '') +
        `: descartadas=${resumo.descartadas} planosLiberados=${resumo.planosLiberados} pendentes=${resumo.pendentes}` +
        (input.motivo ? ` motivo="${String(input.motivo).slice(0, 200)}"` : ''),
    );

    return { ok: true, resumo };
  }

  // ── LIMPAR DIA (PR18072026 Onda 1) ───────────────────────────────────────────
  /**
   * "Limpar dia" — decisão do dono (18/07): CANCELA as entregas ABERTAS
   * (agendada/em_rota) do escopo do dia, transacional e tudo-ou-nada. Mesmo
   * escopo do encerrarRota (mesmo OR: range do dia + sem-data abertas), mas o
   * DESFECHO é diferente por design — aqui é para descartar o dia mesmo
   * (ex.: erro de geração, dia cancelado), não pausar para retomar depois:
   *
   *  - 'agendada'/'em_rota' do escopo → 'cancelada' (rotaOrdem/etaAt/startedAt
   *    limpos — não sobra rastro de rota numa entrega cancelada).
   *  - 'entregue'/'cancelada': NUNCA entram no WHERE de escrita — INTOCADAS.
   *  - FinanceiroCharge/comprovantes: NÃO tocados (este método só lê/escreve
   *    `Entrega` + o campo operacional decoupled de `LogisticaRoute`).
   *  - Encerra a rota OPERACIONALMENTE (operationalEndedAt, mesmo updateMany
   *    do encerrarRota) — o app para de ver a rota do dia como ativa.
   *
   * IDEMPOTENTE: 2ª chamada no mesmo dia não acha mais nenhuma aberta →
   * canceladas:0, sem erro.
   */
  async limparDia(
    companyId: number,
    input: EncerrarRotaInput = {},
    entregadorId?: number,
    // QUEM apertou (F2.2, 10/08). Opcional pra não quebrar chamador nenhum, mas o
    // controller manda sempre: evento sem ator responde "alguém", que é o mesmo
    // que não responder.
    actorUserId?: number | null,
  ): Promise<LimparDiaResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const { start, end, dayISO } = resolveDayRange(input.date);
    const routeDate = canonicalRouteDate(input.date);
    const exactDeliveryIds = input.deliveryIds?.length ? normalizeDeliveryIds(input.deliveryIds) : undefined;

    const resumoBruto = await this.prisma.$transaction(async (tx: any) => {
      if (exactDeliveryIds && entregadorId && typeof tx.$executeRawUnsafe === 'function') {
        // Draft/parked também disputa com Puxar. A trava por motorista+dia
        // impede o cancelamento de ler A e apagar a mesma entrega já movida a B.
        await lockLogisticaRouteTransaction(tx, companyId, `driver:${entregadorId}:date:${routeDate}`);
      }
      // Serializa cancelamento com tracking/transferência/conclusão da mesma
      // execução. Sem isso um lote de GPS pode passar pelo gate enquanto a
      // rota recebe operationalEndedAt na transação vizinha.
      // `lockedRouteIds` sobrevive pro carimbo da LogisticaTrackingSession lá
      // embaixo (mesmo padrão do `encerrarRota` acima).
      let lockedRouteIds: string[] = [];
      if (
        !input.skipRoute &&
        typeof tx.logisticaRoute?.findMany === 'function' &&
        typeof tx.$executeRawUnsafe === 'function'
      ) {
        const lockRoutes = await tx.logisticaRoute.findMany({
          where: {
            companyId,
            routeDate,
            ...(entregadorId ? { entregadorId } : {}),
            ...(input.routeId ? { id: input.routeId } : {}),
            status: { in: ['PLANNED', 'INITIALIZING', 'ACTIVE'] },
          },
          select: { id: true },
          orderBy: { id: 'asc' },
        });
        lockedRouteIds = lockRoutes.map((route: any) => String(route.id));
        for (const route of lockRoutes) await lockLogisticaRouteTransaction(tx, companyId, route.id);
      }
      if (exactDeliveryIds && input.routeId && typeof tx.logisticaRouteStop?.findMany === 'function') {
        const currentStops = await tx.logisticaRouteStop.findMany({
          where: {
            companyId,
            routeId: input.routeId,
            delivery: { status: { in: [...LogisticaRotaService.STATUS_ABERTO] } },
          },
          select: { deliveryId: true },
        });
        const actual = currentStops.map((stop: any) => String(stop.deliveryId)).sort();
        const expected = [...exactDeliveryIds].sort();
        if (actual.length !== expected.length || actual.some((id: string, index: number) => id !== expected[index])) {
          throw new ConflictException('As paradas desta rota mudaram. Atualize a tela antes de cancelar.');
        }
      }
      // Mesmo escopo "abertas do dia" do encerrarRota (range do dia + sem-data
      // abertas), já restrito por status — aqui CANCELA direto (sem o meio-termo
      // "estava mesmo na rota?" do encerrar: Limpar Dia descarta tudo que está
      // aberto no dia, planejado ou não).
      const escopoAberto = {
        companyId,
        ...(entregadorId ? { entregadorId } : {}),
        ...(exactDeliveryIds ? { id: { in: exactDeliveryIds } } : {}),
        status: { in: [...LogisticaRotaService.STATUS_ABERTO] },
        OR: [
          { scheduledAt: { gte: start, lte: end } },
          { scheduledAt: null, status: { in: [...LogisticaRotaService.STATUS_ABERTO] } },
        ],
      };

      // FIX 25/07 (o dia que virava pedra) — Limpar Dia precisa DESFAZER a
      // ocorrência recorrente, não só cancelar a entrega. `generateDay` já tinha
      // empurrado `proximaData` do plano pra semana seguinte e carimbado a
      // `agendaOcorrenciaKey`; cancelar sem desfazer isso deixava o dia
      // impossível de regerar (a Agenda mostrava "98 paradas" e listava 0, e
      // /admin-route/prepare devolvia "Nenhuma parada foi encontrada"). Por isso
      // levantamos as linhas ANTES do updateMany — precisamos dos ids/planos.
      const alvos = await tx.entrega.findMany({
        where: escopoAberto,
        // `customerProfileId` e `scheduledAt` entram pro EVENTO (F2.2): o extrato
        // é por cliente, e a data dita o texto da linha.
        select: {
          id: true, planoEntregaId: true, agendaOcorrenciaKey: true,
          customerProfileId: true, scheduledAt: true,
        },
      });
      const alvoIds = alvos.map((row: any) => row.id);

      /* A rota carregada do dia (montada, inicializando ou rodando) — o recorte
         usado tanto pelas paradas congeladas (logo abaixo) quanto pelo carimbo de
         encerramento no fim. Ver o bloco comentado lá embaixo: a LINHA da rota
         nunca é apagada, ela só morre. */
      const rotaCarregada = {
        companyId,
        routeDate,
        ...(entregadorId ? { entregadorId } : {}),
        ...(input.routeId ? { id: input.routeId } : {}),
        status: { in: ['PLANNED', 'INITIALIZING', 'ACTIVE'] },
      };

      /* 🔴 O SNAPSHOT DA ROTA SAI ANTES DAS ENTREGAS (a ordem é obrigatória, não
         estilo): `LogisticaRouteStop.deliveryId` é `onDelete: Restrict` — parada
         congelada SEGURA a entrega. Este `deleteMany` é o mesmo de 09/08 ("cancelar
         apaga a rota inteira, inclusive a que só estava montada"), palavra por
         palavra; só subiu de lugar. O filtro `status != 'entregue'` continua valendo
         igual: aqui as alvo ainda estão 'agendada'/'em_rota', e a entregue segue
         guardando o stop dela — é o comprovante do que a rota cobrou de verdade. */
      const paradas = input.skipRoute
        ? { count: 0 }
        : await tx.logisticaRouteStop.deleteMany({
            where: {
              companyId,
              route: rotaCarregada,
              // Só os alvos ainda ABERTOS desta própria decisão. Um stop de
              // cancelamento offline já aplicado fica como prova de vínculo e
              // permite reconhecer o retry cujo ACK se perdeu.
              deliveryId: { in: alvoIds },
              delivery: { status: { not: 'entregue' } },
            },
          });

      /* 🔴 CANCELAR APAGA — ESSA É A ORDEM (10/08, dono: *"o cancelar q não deleta,
         essa patifaria"*). A entrega que nunca virou trabalho SOME do banco; ela não
         vira defunto carimbado 'cancelada' esperando 24 h pelo expurgo. Foi assim que
         um dia só juntou 770 canceladas na empresa 41.

         A fronteira é `SEM_SINAL_DE_VIDA` (logistica-expurgo.util) — a MESMA do
         expurgo, num lugar só: some quem nunca saiu, nunca chegou, não tem foto, nem
         trilha, nem claim de crédito, nem cobrança lançada. Quem tiver QUALQUER um
         desses volta pelo caminho de sempre logo abaixo (carimbo 'cancelada'), porque
         história e dinheiro não se apagam — mesmo cancelando.
         💰 Nada de estorno/crédito muda aqui: continua sem encostar em
         `FinanceiroCharge` nem nos claims (o teste guarda isso). */
      const apagadas = await apagarNaoProcessadas(tx, companyId, {
        id: { in: alvoIds },
        ...(entregadorId ? { entregadorId } : {}),
        status: { in: [...LogisticaRotaService.STATUS_ABERTO] },
      });
      const sumiram = new Set<string>(apagadas);
      const sobreviventes = alvos.filter((row: any) => !sumiram.has(row.id));

      // 🔴 29/07 — SOLTA O MOTORISTA junto. Este é o caminho do botão CANCELAR
      // do aparelho ("bati a porra do caminhão, não vai ter entrega, limpa
      // pendência"): a entrega morre cancelada e não pode deixar dono pendurado,
      // senão o dia seguinte nasce dividido entre motoristas e o
      // `resolveSingleDriver` trava tudo — foi o bug que o dono viveu hoje.
      // Só chega aqui quem NÃO pôde ser apagada (tem sinal de vida).
      const canceladasIds: string[] = [];
      if (sobreviventes.length) {
        // Um CAS por linha devolve a identidade exata de quem esta transação
        // realmente cancelou. Snapshot lido antes não pode liberar plano/chave
        // de uma entrega que outra requisição acabou de concluir.
        for (const row of sobreviventes as any[]) {
          const changed = await tx.entrega.updateMany({
            where: {
              companyId,
              id: row.id,
              status: { in: [...LogisticaRotaService.STATUS_ABERTO] },
            },
            data: { status: 'cancelada', rotaOrdem: null, etaAt: null, startedAt: null, entregadorId: null },
          });
          if (changed.count === 1) canceladasIds.push(row.id);
        }
      }
      const efetivos = new Set<string>([...apagadas, ...canceladasIds]);
      const alvosEfetivos = alvos.filter((row: any) => efetivos.has(row.id));
      const sobreviventesCancelados = sobreviventes.filter((row: any) => canceladasIds.includes(row.id));

      // A chave da ocorrência é ÚNICA por empresa. Presa na entrega cancelada,
      // `generateDay` acha "já existe" e pula o cliente PARA SEMPRE. Soltar a
      // chave preserva o histórico (a entrega continua cancelada, com o plano de
      // origem) e devolve o direito de gerar o mesmo dia de novo.
      /* 🔴 A CHAVE É MOVIDA, NÃO APAGADA (10/08, F2.1 da LEI DO DESAPARECER). A
         viva sai — é ela que trava o cliente —, mas a ORIGEM fica gravada: sem
         isso a cancelada não sabia de que visita veio, e nem o histórico nem a
         idempotência do cancelar tinham em que se apoiar. Uma escrita por chave
         (updateMany não copia coluna em coluna) e são poucas por dia.
         Quem foi APAGADA não precisa disto (linha inteira sumiu, chave junto) — a
         prova de "isto foi cancelado por gente" dela é o EVENTO, ver o fim do método. */
      const comChave = sobreviventesCancelados.filter((row: any) => row.agendaOcorrenciaKey);
      for (const row of comChave) {
        await tx.entrega.updateMany({
          where: { companyId, id: row.id, status: 'cancelada' },
          data: { agendaOcorrenciaKey: null, agendaOcorrenciaKeyOrigem: row.agendaOcorrenciaKey },
        });
      }

      // Devolve o plano para a DATA DE ORIGEM da ocorrência, não para o dia
      // operacional que está sendo limpo.
      //
      // FIX 26/07 (a sexta que morreu) — "Montar Rota" materializa a ocorrência
      // de OUTRO dia dentro do dia de hoje (escolher sexta 31/07 num domingo
      // 26/07 cria as entregas com scheduledAt=26/07). Gravar `proximaData=26/07`
      // no plano de sexta escreve uma data que NÃO cai no `diaSemana` dele — e
      // `planOccursOn` (logistica-agenda.service.ts) só aceita a ocorrência
      // quando `elapsedDays % 7 === 0` a partir da `proximaData`. Resultado: a
      // sexta daquele plano nunca mais vencia, em NENHUMA semana. Somava-se o
      // fuso: `resolveDayRange` usa meia-noite do fuso do PROCESSO (UTC no
      // container) e a Agenda lê tudo em dia civil de São Paulo, escorregando a
      // data mais um dia pra trás.
      //
      // A data certa já está gravada na chave da ocorrência
      // (`agenda:<planoId>:<YYYY-MM-DD>`): ela é o dia civil SP em que o plano
      // venceu e, por construção do `generateDay`, cai no `diaSemana` do plano.
      // Entrega aberta SEM chave (nunca foi materializada pela Agenda) fica
      // intocada de propósito — devolver um plano pra um dia arbitrário é
      // exatamente o defeito que este bloco corrige.
      const planosPorOrigem = new Map<string, Set<string>>();
      for (const row of alvosEfetivos as any[]) {
        if (!row.planoEntregaId) continue;
        const origem = sourceDateFromOccurrenceKey(row.agendaOcorrenciaKey);
        if (!origem) continue;
        const grupo = planosPorOrigem.get(origem);
        if (grupo) grupo.add(row.planoEntregaId);
        else planosPorOrigem.set(origem, new Set([row.planoEntregaId]));
      }
      let planosLiberados = 0;
      for (const [origem, ids] of planosPorOrigem) {
        // `proximaData: { gt: alvoData }` garante que só puxamos de volta quem
        // foi adiantado por ESTA ocorrência — plano que já aponta pra data de
        // origem ou pro passado fica como está (idempotente na 2ª limpeza).
        const alvoData = saoPauloMidnight(origem);
        const liberados = await tx.logisticaPlanoEntrega.updateMany({
          where: { companyId, id: { in: [...ids] }, proximaData: { gt: alvoData } },
          data: { proximaData: alvoData },
        });
        planosLiberados += liberados.count;
      }

      /* 🔴 CANCELAR APAGA A ROTA INTEIRA — INCLUSIVE A QUE SÓ ESTAVA MONTADA
         (dono, 09/08: "cancelar tem q limpar toda a rota já carregada… deleta
         ela, tudo, fica limpinho para montar rota do zero").

         Até aqui este updateMany só alcançava `ACTIVE`/`INITIALIZING` — a rota
         que o motorista tinha MONTADO e ainda não iniciado é `PLANNED`, e ela
         sobrevivia inteira ao cancelamento. O aparelho lê o estado por
         `routeStatus` (`getOperationalRouteMetadata`) e `PLANNED` significa
         "pronta" pra ele: o dono cancelava, todas as entregas do dia morriam, e
         o rodapé continuava oferecendo "Iniciar" numa rota sem nenhuma parada
         viva. Cancelar que deixa a rota de pé não cancelou nada.

         E o SNAPSHOT vai junto. `LogisticaRouteStop` é o congelado da rota
         carregada; deixá-lo para trás é o que fazia stop de entrega cancelada
         sobrar pendurado (a "cobrança fantasma" que o billing teve de aprender a
         descontar, ver `assertRouteBillingReady`). Some o que não foi feito;
         fica o que já foi ENTREGUE — a mesma lei de sempre ("só sobrevive o que
         já foi entregue", histórico e financeiro intocados).

         💰 DINHEIRO: nada é estornado, de propósito (dono: "a pessoa perde até
         os créditos, foda-se"). Este método continua sem encostar em
         `FinanceiroCharge` nem nos claims — teste guarda isso. Os claims são
         únicos por (empresa+motorista+data+bloco), então montar de novo no mesmo
         dia reaproveita o que já foi debitado: nem devolve, nem cobra duas
         vezes. Apagar a `LogisticaRoute` em si está FORA de questão — os claims
         são `onDelete: Cascade` nela, e apagar rota apagaria o registro do
         débito. Ela fica morta, não sumida — e é ela o registro de "quanto
         gastei" que o dono cobrou em 10/08. */
      // (o `deleteMany` das paradas subiu pro topo da transação: `Restrict` na
      //  entrega obriga o stop a sair ANTES do delete — ver lá.)

      // Encerra a rota OPERACIONALMENTE (campo decoupled — mesmo comentário do
      // encerrarRota): NÃO altera `status` de cobrança. Zerado sozinho quando o
      // dia for (re)iniciado.
      const encerrouRota = !(input.skipRoute || (exactDeliveryIds && alvosEfetivos.length === 0));
      const rotas = encerrouRota
        ? await tx.logisticaRoute.updateMany({
            where: rotaCarregada,
            data: { operationalEndedAt: new Date() },
          })
        : { count: 0 };
      /* 🔴 A JANELA DE 24h DO TRACKING TAMBÉM FECHA AQUI (15/08). Sem isto, uma
         `LogisticaTrackingSession` ACTIVE sobrevivia ao cancelamento: o
         comando de tracking em voo (fila do aparelho) batia num routeId que
         o app já esqueceu, o servidor respondia CONFLICT e o comando virava
         REJECTED — preso até o teto de 24h do processamento assíncrono, sem
         ninguém ter cancelado nada de propósito. Mesmo padrão do
         `encerrarRota` acima: ACTIVE→ENDED pelos ids já trancados nesta
         transação (`lockedRouteIds`), só quando a rota realmente encerrou
         (mesma condição do `rotas` acima — `skipRoute`/recorte vazio não
         mexem na rota, então também não mexem na sessão dela). */
      if (encerrouRota && lockedRouteIds.length && typeof tx.logisticaTrackingSession?.updateMany === 'function') {
        await tx.logisticaTrackingSession.updateMany({
          where: { companyId, routeId: { in: lockedRouteIds }, status: 'ACTIVE' },
          data: { status: 'ENDED', endedAt: new Date() },
        });
      }

      return {
        /* CONTRATO DO APP: `canceladas` continua sendo QUANTAS PARADAS SAÍRAM DO
           DIA — apagadas + carimbadas. O aparelho mostra este número desde 18/07;
           trocar o significado dele por "só as que sobraram" faria a tela dizer 0
           num dia inteiro cancelado. `apagadas` é o detalhe novo, aditivo. */
        canceladas: apagadas.length + canceladasIds.length,
        apagadas: apagadas.length,
        planosLiberados,
        rotasEncerradas: rotas.count,
        paradasApagadas: paradas.count,
        // o que gravar no extrato DEPOIS do commit — ver abaixo. Sai do `resumo`
        // logo na desestruturação: isto é matéria-prima do evento, NUNCA resposta
        // da API (o app lê este objeto, e teste guarda o formato dele).
        alvosDoEvento: alvosEfetivos as Array<{ id: string; customerProfileId: string; planoEntregaId: string | null; scheduledAt: Date | null; agendaOcorrenciaKey: string | null }>,
      };
    });
    const { alvosDoEvento, ...resumo } = resumoBruto;

    /* 🔴 O CANCELAR EM MASSA DEIXA RASTRO (10/08, F2.2). Fora da transação, pelo
       contrato do `registrarEventoAgenda`: um INSERT que falhe DENTRO da tx aborta
       o cancelamento inteiro no Postgres, e o extrato é história — nunca pode
       derrubar a operação que ele descreve.
       Uma linha por entrega, com o ATOR: até 10/08 este caminho era MUDO, e quando
       o dono perguntou "quem cancelou meu dia?" a resposta só existia no log do
       container — que o publish daquela madrugada já tinha levado embora.

       🔴 E AGORA ELE É A ÚNICA HISTÓRIA QUE SOBRA. Com o cancelar apagando o
       não-processado, este evento passa de telemetria a REGISTRO: é dele que saem
       (1) o dia vermelho do histórico de 14 dias (`historicoDeRotas`) e (2) a prova
       de "esta ocorrência foi cancelada por gente" que segura o `generateDay`
       (`ocorrenciaCanceladaRecente`). Por isso o `deTexto` agora vai: ele carrega o
       DIA DE ORIGEM da ocorrência (o mesmo que está na chave), e sem ele a prova (2)
       não sabe de qual visita o cancelamento falava. */
    for (const row of alvosDoEvento) {
      await registrarEventoAgenda(this.prisma as any, {
        companyId,
        customerProfileId: row.customerProfileId,
        entregaId: row.id,
        planoEntregaId: row.planoEntregaId,
        tipo: 'CANCELADA_LIMPAR_DIA',
        deTexto: formatDDMM(sourceDateFromOccurrenceKey(row.agendaOcorrenciaKey)),
        paraTexto: formatDDMM(saoPauloDateKey(row.scheduledAt) || dayISO),
        origem: 'app',
        actorUserId: actorUserId ?? null,
      });
    }

    this.logger.log(
      `[logistica] limpar-dia ${dayISO} company=${companyId}` +
        (entregadorId ? ` entregador=${entregadorId}` : '') +
        `: canceladas=${resumo.canceladas} apagadas=${resumo.apagadas}` +
        ` planosLiberados=${resumo.planosLiberados}` +
        ` rotasEncerradas=${resumo.rotasEncerradas} paradasApagadas=${resumo.paradasApagadas}` +
        (input.motivo ? ` motivo="${String(input.motivo).slice(0, 200)}"` : ''),
    );

    return { ok: true, resumo };
  }

  private async resolveSingleDriver(
    companyId: number,
    date?: string,
    deliveryIds?: string[],
    actor?: ActorKindUserLike,
  ): Promise<number> {
    const { start, end } = resolveDayRange(date);
    const selectedIds = normalizeDeliveryIds(deliveryIds);
    const rows = await this.prisma.entrega.findMany({
      where: {
        companyId,
        ...(selectedIds?.length ? { id: { in: selectedIds } } : {}),
        status: { in: [...LogisticaRotaService.STATUS_ABERTO] },
        OR: [{ scheduledAt: { gte: start, lte: end } }, { scheduledAt: null }],
      },
      select: { id: true, entregadorId: true },
    });
    // PR29072026 — a régua é a MESMA (os 4 casos continuam bloqueando); o que
    // mudou é a FRASE dizer qual deles é. Ver logistica-motorista-unico.util.ts:
    // a frase única mandava o dono atribuir motorista num dia VAZIO.
    const diagnostico = diagnosticarMotoristaUnico(rows, selectedIds);
    if (diagnostico.mensagem) {
      // "JÁ MONTADA POR X" (10/08, ROTA v2 F1b) — "dia_vazio" é MENTIRA quando
      // sobrou trabalho de outro motorista fora do recorte ABERTO (ex.: ele já
      // entregou tudo). Só este motivo troca de mensagem — os outros 3
      // continuam dizendo exatamente o que já diziam.
      if (diagnostico.motivo === 'dia_vazio') {
        const montadores = await quemMontouODia(this.prisma, companyId, start, end);
        if (montadores.length > 0) {
          throw rotaDeOutroMotoristaError(montadores, isLogisticaAdmin(actor), canonicalRouteDate(date));
        }
      }
      throw new BadRequestException(diagnostico.mensagem);
    }
    return diagnostico.entregadorId as number;
  }

  // ── RE-ETA (hook aditivo do confirmar/cancelar do N6) ────────────────────────
  /**
   * Recalcula etaAt das paradas RESTANTES (ainda abertas) do dia, SEM reordenar o
   * que já foi feito — só desloca o ETA cumulativo pra frente/trás conforme as
   * paradas que saíram da fila. Best-effort: chamado dentro de try/catch pelo N6,
   * qualquer erro aqui NÃO afeta o confirmar/cancelar.
   *
   * @param baseDate dia da entrega tocada (default: hoje) — a fatia de re-cálculo.
   */
  async recalcularEtaRestantes(companyId: number, baseDate?: Date, entregadorId?: number): Promise<{ recalculadas: number } | null> {
    if (!companyId) return null;
    const { start, end } = resolveDayRange(baseDate ? toDayISO(baseDate) : undefined);
    const config = await this.loadConfig(companyId);

    const rows = await this.fetchParadasAbertas(companyId, start, end, entregadorId);
    if (rows.length === 0) return { recalculadas: 0 };

    // NÃO reordena: mantém o rotaOrdem já gravado (o que já foi entregue saiu da
    // lista de abertas; a ordem relativa das restantes é preservada). Ordena pela
    // rotaOrdem atual (nulls por último) e refaz só o ETA cumulativo.
    const stops = rows.map((r) => toStop(r)).sort(compareByRotaOrdem);
    const partida = new Date();
    const withEta = computeEta(stops, {
      velocidadeKmH: config.velocidadeMediaKmH,
      paradaMin: config.tempoParadaMin,
      partida,
    });

    let recalculadas = 0;
    for (const p of withEta) {
      await this.prisma.entrega.update({ where: { id: p.id }, data: { etaAt: p.etaAt } });
      recalculadas++;
    }
    return { recalculadas };
  }

  // ── infra ────────────────────────────────────────────────────────────────────
  /**
   * Monta o fetcher do DEGRAU 1 (proxy) já com o `companyId` amarrado, ou
   * `undefined` se o serviço não foi injetado (teste sem Nest, ou módulo sem
   * o provider) — nesse caso planRouteByRoads pula direto pro degrau 2. Único
   * ponto de conversão Coord[]→string "lng,lat;…" que o proxy espera.
   */
  private osrmTableFetcher(companyId: number): ((coords: Coord[]) => Promise<OsrmTablePayload>) | undefined {
    if (!this.osrm) return undefined;
    const osrm = this.osrm;
    return async (coords: Coord[]) => {
      const coordsRaw = coords.map((c) => `${c.lng},${c.lat}`).join(';');
      return (await osrm.table(companyId, coordsRaw)) as OsrmTablePayload;
    };
  }

  /**
   * HISTÓRICO DA MONTAGEM (09/08, pedido literal do dono: "criar um histórico,
   * salva por 14 dias. SIMPLES E FÁCIL, sem inventar moda. E tem como
   * reutilizar a rota salva"). NADA de tabela nova: as rotas dos últimos 14
   * dias JÁ moram em Entrega — parada é quem tem rotaOrdem OU foi entregue
   * (cancelada sem rotaOrdem não é parada desta rota, lei de 09/08). Hoje fica
   * de fora: a rota de hoje é a viva, não histórico.
   * Sem `date` = a lista dos dias; com `date` = os clientes daquele dia com a
   * MESMA bagagem da linha da agenda (pino + recorrência) — rascunho que nasce
   * sem bagagem é a tela gritando "não sei onde fica" pra cliente com porta
   * marcada, o defeito que este mesmo dia curou.
   */
  async historicoDeRotas(companyId: number, date?: string) {
    const eParada = [
      { rotaOrdem: { not: null } },
      { status: 'entregue' },
    ];
    if (date) {
      const { start, end, dayISO } = resolveDayRange(date);
      const rows = await this.prisma.entrega.findMany({
        where: {
          companyId,
          scheduledAt: { gte: start, lte: end },
          OR: eParada,
        },
        orderBy: [{ rotaOrdem: 'asc' }, { createdAt: 'asc' }],
        select: {
          customerProfileId: true,
          // 🔴 09/08 — MULTILOCAL. Este select lia SÓ o perfil: medido na empresa 41
          // (14 dias, 187 linhas cliente-dia deste endpoint) 31 nasciam SEM pino
          // (o pino mora no LOCAL, o perfil não tem) e 22 nasciam com o pino de
          // OUTRA porta — >50 m de distância, pior caso 5,8 km; na empresa 48, 17
          // de 100 com pino errado. Como o app reenche o rascunho com esta resposta,
          // reutilizar um dia mandava o motorista pra porta errada ou fazia a tela
          // gritar "não sei onde fica" pra cliente com porta marcada.
          localId: true,
          local: {
            select: {
              apelido: true, endereco: true, numero: true, complemento: true,
              bairro: true, cidade: true, uf: true, cep: true,
              lat: true, lng: true, geoFonte: true,
            },
          },
          customerProfile: {
            select: {
              name: true, endereco: true, numero: true, complemento: true,
              bairro: true, cidade: true, uf: true, cep: true,
              lat: true, lng: true, geoFonte: true,
              logisticaPlanosEntrega: { where: { ativo: true }, take: 1, select: { id: true } },
            },
          },
        },
      });
      // 🔴 RECONSTRUÇÃO PELA TRILHA (10/08, ROTA v2 F1c). A LEI DO DESAPARECER já
      // pode ter varrido o CORPO (Entrega) de um dia cancelado antes das 24h de
      // graça virarem 14 dias de histórico — `rows` vem vazio mesmo quando o dia
      // teve gente de verdade. A única fonte que sobra é a TRILHA
      // (`LogisticaAgendaEvento` tipo `CANCELADA_LIMPAR_DIA`, história de DECISÃO
      // que nunca some): ela carrega o `customerProfileId` de quem foi cancelado
      // naquele DD/MM. Sem o corpo não existe mais `localId` (a porta cancelada
      // morreu com a entrega) — o multilocal cai sozinho no PERFIL (local=null,
      // ver resolverCoordenadaMultilocal), que é exatamente a bagagem que sobra.
      // Assim "cancelei hoje" continua dando pra PEGAR/REMONTAR de qualquer dia
      // dos 14, mesmo depois do expurgo ter apagado a linha.
      if (rows.length === 0) {
        const ddmm = formatDDMM(dayISO);
        const eventos = ddmm
          ? await (this.prisma as any).logisticaAgendaEvento
              .findMany({
                where: { companyId, tipo: { in: [...TIPOS_CANCELAMENTO_HUMANO] }, paraTexto: ddmm },
                select: { customerProfileId: true },
              })
              .catch(() => [])
          : [];
        const idsUnicos = [
          ...new Set(
            (eventos as Array<{ customerProfileId: string | null }>)
              .map((e) => String(e.customerProfileId || ''))
              .filter(Boolean),
          ),
        ];
        if (!idsUnicos.length) return { data: dayISO, clientes: [] };
        // 12/08 — mesmo campo da outra saída deste endpoint: a reconstrução pela
        // trilha não pode devolver um cliente com menos bagagem que o corpo vivo.
        const ultimasTrilha = await ultimaEntregaPorCliente(this.prisma, companyId, idsUnicos);
        const perfis = await this.prisma.customerProfile.findMany({
          where: { id: { in: idsUnicos }, companyId },
          select: {
            id: true,
            name: true, endereco: true, numero: true, complemento: true,
            bairro: true, cidade: true, uf: true, cep: true,
            lat: true, lng: true, geoFonte: true,
            logisticaPlanosEntrega: { where: { ativo: true }, take: 1, select: { id: true } },
          },
        });
        const clientesDaTrilha = perfis.map((c) => {
          const coord = resolverCoordenadaMultilocal(null, c);
          const fonte = enderecoDaFonteMultilocal(null, c);
          return {
            customerProfileId: String(c.id),
            localId: null,
            nome: c.name ?? '',
            endereco: fonte.endereco ?? '',
            numero: fonte.numero ?? '',
            complemento: fonte.complemento ?? '',
            bairro: fonte.bairro ?? '',
            cidade: fonte.cidade ?? '',
            uf: fonte.uf ?? '',
            cep: fonte.cep ?? '',
            enderecoLinha: linhaEnderecoDaFonte(fonte),
            lat: coord.lat,
            lng: coord.lng,
            geoFonte: coord.geoFonte,
            recorrente: (c.logisticaPlanosEntrega?.length ?? 0) > 0,
            ultimaEntregaAt: isoDaUltimaEntrega(ultimasTrilha.get(String(c.id))),
          };
        });
        return { data: dayISO, clientes: clientesDaTrilha };
      }
      // 🔴 09/08 — a chave é (cliente|porta), não o cliente: duas portas do mesmo
      // cliente no MESMO dia são duas paradas legítimas, e deduplicar por cliente
      // apagava a segunda. O mesmo cliente na MESMA porta 2x continua sendo UMA
      // linha — reutilizar duplicaria a porta. Mesma semântica do `chaveHistorico`
      // da conferência (as duas pontas precisam concordar sobre o que é "a mesma
      // parada"), sem virar import: o dono da chave é quem a usa.
      const vistos = new Set<string>();
      /* 12/08 — "Ult. Registro": o app reenche o RASCUNHO com esta resposta, e o
         cartão da Montagem é o MESMO das outras duas origens. Sem o campo aqui,
         reutilizar um dia do histórico escrevia "Pendente" justamente na gente
         que a tela acabou de dizer que foi atendida. Régua única do util. */
      const ultimasHistorico = await ultimaEntregaPorCliente(
        this.prisma,
        companyId,
        rows.map((r) => String(r.customerProfileId)),
      );
      const clientes = rows.flatMap((r) => {
        const chave = `${r.customerProfileId}|${r.localId ?? ''}`;
        if (vistos.has(chave)) return [];
        vistos.add(chave);
        const c = r.customerProfile;
        // A régua ÚNICA do multilocal: pino e endereço saem da MESMA fonte inteira
        // (o "pino Frankenstein" — CEP de um, rua do outro — é o que ela mata).
        const coord = resolverCoordenadaMultilocal(r.local, c);
        const fonte = enderecoDaFonteMultilocal(r.local, c);
        return [{
          customerProfileId: String(r.customerProfileId),
          localId: r.localId ?? null,
          nome: c?.name ?? '',
          endereco: fonte.endereco ?? '',
          numero: fonte.numero ?? '',
          complemento: fonte.complemento ?? '',
          bairro: fonte.bairro ?? '',
          cidade: fonte.cidade ?? '',
          uf: fonte.uf ?? '',
          cep: fonte.cep ?? '',
          // 🔴 09/08 — quem monta a linha é o SERVIDOR: 44 dos 225 clientes da
          // empresa 41 têm o número só na coluna `numero`, então o app, lendo o
          // `endereco` cru, mostrava "Rua M-7" onde o desktop mostrava
          // "Rua M-7, 897". Endereço é DADO — não muda de valor conforme a tela.
          enderecoLinha: linhaEnderecoDaFonte(fonte),
          lat: coord.lat,
          lng: coord.lng,
          geoFonte: coord.geoFonte,
          recorrente: (c?.logisticaPlanosEntrega?.length ?? 0) > 0,
          ultimaEntregaAt: isoDaUltimaEntrega(ultimasHistorico.get(String(r.customerProfileId))),
        }];
      });
      return { data: dayISO, clientes };
    }
    const hoje = resolveDayRange();
    const inicio = new Date(hoje.start.getTime() - 14 * 24 * 3600 * 1000);
    /* 🔴 HOJE SÓ ENTRA MORTO (10/08, ROTA v2 F1c). Regra de sempre: "hoje é a
       rota VIVA, não histórico" — dia com QUALQUER entrega aberta continua de
       fora, senão o histórico brigaria com a tela de hoje sobre o que está
       acontecendo agora. A exceção é o dia que já morreu: sem nenhuma aberta E
       com sinal de cancelamento (linha 'cancelada' agendada hoje, ou — se a LEI
       DO DESAPARECER já varreu o corpo — o evento da trilha carimbado com o
       DD/MM de hoje). Sem esta checagem, "cancelei hoje de manhã" só pintava
       vermelho amanhã: o dono cancela e quer ver o registro NA HORA. */
    let incluirHoje = false;
    const hojeTemAberta = await this.prisma.entrega.count({
      where: {
        companyId,
        status: { in: [...LogisticaRotaService.STATUS_ABERTO] },
        OR: [{ scheduledAt: { gte: hoje.start, lte: hoje.end } }, { scheduledAt: null }],
      },
    });
    if (hojeTemAberta === 0) {
      const hojeCancelada = await this.prisma.entrega.count({
        where: { companyId, scheduledAt: { gte: hoje.start, lte: hoje.end }, status: 'cancelada' },
      });
      if (hojeCancelada > 0) {
        incluirHoje = true;
      } else {
        const ddmmHoje = formatDDMM(hoje.dayISO);
        const eventoHoje = ddmmHoje
          ? await (this.prisma as any).logisticaAgendaEvento
              .findFirst({
                where: { companyId, tipo: { in: [...TIPOS_CANCELAMENTO_HUMANO] }, paraTexto: ddmmHoje },
                select: { id: true },
              })
              .catch(() => null)
          : null;
        incluirHoje = !!eventoHoje;
      }
    }
    const fim = incluirHoje ? hoje.end : new Date(hoje.start.getTime() - 1);
    /* 🔴 O HISTÓRICO REGISTRA O QUE NÃO FOI COMPLETADO (10/08, F5 — dono: "tem q
       ficar registrado rotas que eu criei e cancelei").
       Até aqui a lista só via PARADA (`rotaOrdem` ou entregue), e o `limparDia`
       zera `rotaOrdem` ao cancelar: um dia inteiro criado e cancelado sumia da
       tela como se nunca tivesse existido. A cancelada entra agora — e é ela que
       pinta o dia de vermelho.
       ⏱ As 24 h do caso "sem registro nenhum" NÃO são regra desta consulta: elas
       vêm de graça da LEI DO DESAPARECER (logistica-expurgo.util) — passada a
       janela, a linha some do banco e o dia some daqui junto. Uma régua só, nos
       dois lugares. */
    const rows = await this.prisma.entrega.findMany({
      where: {
        companyId,
        scheduledAt: { gte: inicio, lte: fim },
        OR: [...eParada, { status: 'cancelada' }],
      },
      select: {
        scheduledAt: true, customerProfileId: true, localId: true,
        // o desfecho de cada parada: é dele que sai a cor do dia.
        status: true, deliveredAt: true, comprovanteConfirmadoAt: true,
      },
    });
    /* 🔴 O DIA CANCELADO INTEIRO VEM DA TRILHA (10/08). Antes, o que pintava esse
       dia de vermelho eram as PRÓPRIAS entregas canceladas — e desde que o cancelar
       APAGA o não-processado, um dia 100% cancelado não tem mais nenhuma linha pra
       contar: ele sumia da tela como se nunca tivesse existido, que é justamente o
       que o dono mandou não acontecer ("tem q ficar registrado rotas que eu criei e
       cancelei").
       O registro passa a ser o EVENTO com ator (`CANCELADA_LIMPAR_DIA`) — que é
       história de DECISÃO e não some nunca. Ele entra SÓ nos dias que ficaram sem
       nenhuma linha: onde sobrou entrega (entregue, ou cancelada com sinal de vida),
       quem manda continua sendo ela, e assim uma parada nunca é contada duas vezes.
       Bônus pedido hoje: agora o dia cancelado dura os 14 dias, não 24 h. */
    const eventosCancelamento: Array<{ customerProfileId: string; paraTexto: string | null }> =
      await Promise.resolve(
        (this.prisma as any).logisticaAgendaEvento?.findMany({
          where: {
            companyId,
            tipo: { in: [...TIPOS_CANCELAMENTO_HUMANO] },
            createdAt: { gte: inicio },
          },
          select: { customerProfileId: true, paraTexto: true },
        }),
      ).catch(() => []) ?? [];
    // agrupa pela MESMA régua de dia do resolveDayRange (fuso local do
    // servidor, via toDayISO) — segunda régua de dia é como as telas começam
    // a discordar da rota.
    // 🔴 09/08 — e conta pela MESMA chave (cliente|porta) do ramo com `date`:
    // contando só o cliente, o chip do dia dizia "2 paradas" e reutilizar
    // enchia o rascunho com 3 (cliente com duas portas). O mesmo dado com dois
    // números em duas telas é bug de produto, não detalhe.
    const porDia = new Map<string, { paradas: Set<string>; entregues: Set<string> }>();
    rows.forEach((r) => {
      if (!r.scheduledAt) return;
      const dia = toDayISO(r.scheduledAt);
      let bucket = porDia.get(dia);
      if (!bucket) { bucket = { paradas: new Set(), entregues: new Set() }; porDia.set(dia, bucket); }
      const chave = `${r.customerProfileId}|${r.localId ?? ''}`;
      bucket.paradas.add(chave);
      /* "REGISTRO DE VERDADE" (dono, 10/08): alguma coisa ACONTECEU nesta parada.
         Entregue é o caso óbvio; `deliveredAt`/`comprovanteConfirmadoAt` cobrem a
         que foi entregue e depois reaberta ou cancelada — trabalho feito não deixa
         de ter sido feito porque o status mudou depois. */
      if (r.status === 'entregue' || r.deliveredAt || r.comprovanteConfirmadoAt) bucket.entregues.add(chave);
    });
    // DD/MM → dia do recorte. Em 14 dias nenhum DD/MM se repete, então o texto do
    // evento basta pra casar com a MESMA régua de dia usada acima (`toDayISO`).
    const diaPorDDMM = new Map<string, string>();
    for (let t = inicio.getTime(); t <= fim.getTime(); t += 24 * 60 * 60 * 1000) {
      const diaISO = toDayISO(new Date(t));
      const ddmm = formatDDMM(diaISO);
      if (ddmm && !diaPorDDMM.has(ddmm)) diaPorDDMM.set(ddmm, diaISO);
    }
    const diasDaTrilha = new Set<string>();
    for (const evento of eventosCancelamento) {
      const dia = diaPorDDMM.get(String(evento.paraTexto || ''));
      if (!dia) continue;
      // dia que ainda tem linha viva: ela manda (e conta a porta, que o evento não
      // sabe) — a trilha só reconstrói o dia que ficou VAZIO.
      if (porDia.has(dia) && !diasDaTrilha.has(dia)) continue;
      let bucket = porDia.get(dia);
      if (!bucket) {
        bucket = { paradas: new Set(), entregues: new Set() };
        porDia.set(dia, bucket);
        diasDaTrilha.add(dia);
      }
      bucket.paradas.add(`${evento.customerProfileId}|`);
    }
    const dias = [...porDia.entries()]
      .map(([data, { paradas, entregues }]) => {
        const naoCompletadas = Math.max(0, paradas.size - entregues.size);
        return {
          data,
          paradas: paradas.size,
          entregues: entregues.size,
          // O QUE NÃO FOI COMPLETADO — o número que o dono pediu que ficasse
          // registrado nos dois casos (com e sem registro).
          naoCompletadas,
          /* A COR DO DIA, decidida no servidor (as duas telas não podem discordar
             sobre o que é "completa"):
               · `completa`   — todo mundo resolvido;
               · `incompleta` — sobrou parada, mas o dia teve trabalho de verdade
                                (o caso 2b do dono: fica salvo os 14 dias);
               · `cancelada`  — sobrou parada e NADA aconteceu (o caso 2: vive 24 h
                                e some junto com o crédito, pela lei do expurgo).
             Vermelho é `!== 'completa'` — os dois últimos, como ele pediu. */
          desfecho: (naoCompletadas === 0
            ? 'completa'
            : entregues.size > 0 ? 'incompleta' : 'cancelada') as 'completa' | 'incompleta' | 'cancelada',
        };
      })
      .sort((a, b) => (a.data < b.data ? 1 : -1));
    return { dias };
  }

  private async loadConfig(companyId: number): Promise<{ velocidadeMediaKmH: number; tempoParadaMin: number }> {
    let cfg: { velocidadeMediaKmH: number; tempoParadaMin: number } | null = null;
    try {
      cfg = await this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: { velocidadeMediaKmH: true, tempoParadaMin: true },
      });
    } catch (e: any) {
      this.logger.warn(`[logistica] loadConfig company=${companyId} falhou: ${String(e?.message || e)}`);
    }
    const velocidadeMediaKmH =
      cfg && cfg.velocidadeMediaKmH > 0 ? cfg.velocidadeMediaKmH : LogisticaRotaService.DEFAULT_VELOCIDADE_KMH;
    const tempoParadaMin =
      cfg && cfg.tempoParadaMin >= 0 ? cfg.tempoParadaMin : LogisticaRotaService.DEFAULT_PARADA_MIN;
    return { velocidadeMediaKmH, tempoParadaMin };
  }

  /**
   * 🔴 O NÚMERO DA ABERTA NÃO PODE COLIDIR COM O DA JÁ FECHADA (08/08/2026).
   *
   * `planRoute*` numera as paradas ABERTAS de 0 a N-1, e `fetchParadasAbertas`
   * só enxerga 'agendada'/'em_rota' — entregue e cancelada ficam com o número
   * que já tinham. Re-planejar no meio do dia devolvia as abertas ao ZERO e
   * elas colidiam com as fechadas: como o `listRota` ordena por
   * `[rotaOrdem asc, status asc]`, os cartões "Entregue" passavam a INTERCALAR
   * no meio dos pendentes na tela do motorista. Isso era raro enquanto só quem
   * montasse a rota de novo re-planejava; com o ARRASTAR do app novo (o gesto
   * manda `ordemManual`), todo gesto re-planeja — e o defeito virou rotina.
   *
   * Aqui sai o PISO: as abertas passam a numerar DEPOIS da última fechada do
   * dia. Dia sem nada fechado devolve 0 e o comportamento de sempre segue byte
   * a byte (é o caso de toda montagem de manhã). Mesmo escopo do fetch das
   * abertas (empresa + motorista), e a janela é a mesma que o `listRota`
   * mostra: parada sem `scheduledAt` só entra na lista quando está ABERTA,
   * então fechada fora da janela nunca divide tela com esta rota.
   */
  private async maiorOrdemFechadaDoDia(
    companyId: number,
    start: Date,
    end: Date,
    entregadorId?: number,
  ): Promise<number> {
    const fechadas = await this.prisma.entrega.aggregate({
      where: {
        companyId,
        ...(entregadorId ? { entregadorId } : {}),
        status: { notIn: [...LogisticaRotaService.STATUS_ABERTO] },
        scheduledAt: { gte: start, lte: end },
      },
      _max: { rotaOrdem: true },
    });
    const maior = fechadas?._max?.rotaOrdem;
    return typeof maior === 'number' && Number.isFinite(maior) ? maior + 1 : 0;
  }

  private async fetchParadasAbertas(companyId: number, start: Date, end: Date, entregadorId?: number, deliveryIds?: string[]): Promise<ParadaRow[]> {
    return this.prisma.entrega.findMany({
      where: {
        companyId,
        ...(entregadorId ? { entregadorId } : {}),
        ...(deliveryIds?.length ? { id: { in: deliveryIds } } : {}),
        status: { in: [...LogisticaRotaService.STATUS_ABERTO] },
        // 🔴 27/07 — CLIENTE QUE SAIU DO CADASTRO NÃO ENTRA NA ROTA. A Agenda já
        // não MATERIALIZA visita de perfil deleted, mas a entrega que já existia
        // continuava passando por aqui: no teste em campo a rota de SEGUNDA veio
        // com "Francine / Edila (?)" e "Elaine" — nomes que o dono não acha em
        // Clientes. Este é o funil por onde TODA rota passa (planejar/iniciar/
        // conferir), então é aqui que a régua tem que valer.
        // 28/07 — a régua é `status`, NÃO `isCliente`: o soft-delete do cadastro
        // (nucleo-cadastro L1986) sempre grava `status:'deleted'`, então `active`
        // sozinho já barra quem saiu. O `isCliente:true` extra matava a parada da
        // Rota rápida modo Direção, que nasce DE PROPÓSITO com isCliente:false
        // (endereço sem virar cliente no Cadastro) — o planejar devolvia
        // "0 parada(s)" com a entrega recém-criada na cara e o app nunca saía de
        // "Montar rota" com uma parada só.
        customerProfile: { status: 'active' },
        OR: [{ scheduledAt: { gte: start, lte: end } }, { scheduledAt: null }],
      },
      orderBy: [{ rotaOrdem: 'asc' }, { scheduledAt: 'asc' }, { createdAt: 'asc' }],
      take: 300,
      select: {
        id: true,
        entregadorId: true,
        status: true,
        rotaOrdem: true,
        scheduledAt: true,
        // MULTILOCAL (11/07) — geo da PORTA da entrega: quando há um LOCAL, a rota
        // ordena pela coordenada DELE (cada endereço do cliente tem a sua). Sem o
        // local, todas as paradas do cliente cairiam no geo do principal e a rota
        // multi-local ordenaria pela porta errada. MESMO select/regra do listRota.
        local: { select: { apelido: true, lat: true, lng: true } },
        customerProfile: { select: { name: true, lat: true, lng: true } },
      },
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  MATEMÁTICA PURA (exportada e testável sem banco)
// ════════════════════════════════════════════════════════════════════════════

const EARTH_RADIUS_KM = 6371;

/** Uma parada roteável: id + coord (null quando o cliente não tem lat/lng). */
export interface Stop {
  id: string;
  lat: number | null;
  lng: number | null;
  status: string;
  nome: string | null;
  rotaOrdem?: number | null;
}

export interface Coord {
  lat: number;
  lng: number;
}

/**
 * Haversine — distância em KM entre 2 pontos (lat/lng em graus). Pura.
 * Erro < 0.5% p/ distâncias urbanas; suficiente p/ heurística de rota.
 */
export function haversineKm(a: Coord, b: Coord): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Uma parada com coordenada garantida (lat/lng number). */
export type StopComCoord = Stop & { lat: number; lng: number };

/**
 * Só as paradas COM coordenada válida entram na roteirização. Predicado boolean
 * simples (não type-guard) — o guard geraria um tipo-complemento intratável no
 * ramo negativo (`{...s}` spread de tipo não-objeto). Onde o tipo estreito é
 * necessário, usamos filtrarComCoord.
 */
export function hasCoord(s: Stop): boolean {
  return pinoValido(s.lat, s.lng);
}

/** Filtra e ESTREITA para paradas com coord garantida (para NN/2-opt). */
export function filtrarComCoord(stops: Stop[]): StopComCoord[] {
  return stops.filter(hasCoord) as StopComCoord[];
}

/** Distância total (km) de uma sequência ordenada, a partir de uma origem. */
export function routeCostKm(order: Array<Stop & { lat: number; lng: number }>, origem?: Coord | null): number {
  if (order.length === 0) return 0;
  let total = 0;
  let prev: Coord = origem ?? { lat: order[0].lat, lng: order[0].lng };
  for (const s of order) {
    total += haversineKm(prev, { lat: s.lat, lng: s.lng });
    prev = { lat: s.lat, lng: s.lng };
  }
  return total;
}

/**
 * Nearest-neighbor: começa na origem (ou na 1ª parada se sem origem) e vai
 * sempre à parada mais próxima ainda não visitada. Heurística gulosa — a base
 * que o 2-opt refina. Pura.
 */
export function nearestNeighbor(
  stops: Array<Stop & { lat: number; lng: number }>,
  origem?: Coord | null,
): Array<Stop & { lat: number; lng: number }> {
  const restantes = [...stops];
  const ordem: Array<Stop & { lat: number; lng: number }> = [];
  if (restantes.length === 0) return ordem;

  let atual: Coord;
  if (origem) {
    atual = origem;
  } else {
    // Sem origem: a 1ª parada da lista é o ponto de partida.
    const first = restantes.shift()!;
    ordem.push(first);
    atual = { lat: first.lat, lng: first.lng };
  }

  while (restantes.length > 0) {
    let melhorIdx = 0;
    let melhorDist = Infinity;
    for (let i = 0; i < restantes.length; i++) {
      const d = haversineKm(atual, { lat: restantes[i].lat, lng: restantes[i].lng });
      if (d < melhorDist) {
        melhorDist = d;
        melhorIdx = i;
      }
    }
    const escolhido = restantes.splice(melhorIdx, 1)[0];
    ordem.push(escolhido);
    atual = { lat: escolhido.lat, lng: escolhido.lng };
  }
  return ordem;
}

/**
 * 2-opt: parte de uma ordem inicial (ex.: NN) e reverte segmentos enquanto isso
 * REDUZIR o custo total (com a origem fixa). Converge para um ótimo local — nunca
 * PIORA a rota (garantia usada no teste: custo 2-opt ≤ custo NN). Pura.
 */
export function twoOpt(
  initial: Array<Stop & { lat: number; lng: number }>,
  origem?: Coord | null,
  maxPasses = 30,
): Array<Stop & { lat: number; lng: number }> {
  if (initial.length < 4) return [...initial]; // < 4 paradas: 2-opt não muda nada
  let best = [...initial];
  let bestCost = routeCostKm(best, origem);
  let improved = true;
  let passes = 0;

  while (improved && passes < maxPasses) {
    improved = false;
    passes++;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = twoOptSwap(best, i, k);
        const cost = routeCostKm(candidate, origem);
        if (cost + 1e-9 < bestCost) {
          best = candidate;
          bestCost = cost;
          improved = true;
        }
      }
    }
  }
  return best;
}

/** Reverte o segmento [i..k] (inclusive) da ordem — o movimento do 2-opt. */
function twoOptSwap<T>(order: T[], i: number, k: number): T[] {
  return [...order.slice(0, i), ...order.slice(i, k + 1).reverse(), ...order.slice(k + 1)];
}

export interface EtaOptions {
  velocidadeKmH: number;
  paradaMin: number;
  partida: Date;
  /**
   * S2 (25/07, PR25072026-ROTA-CONFERIDA) — origem conhecida (GPS do
   * entregador ao planejar/iniciar), usada SÓ para expor a PERNA da 1ª parada
   * roteável (legDistanceM/legDurationS, ver computeEta). NÃO entra no cúmulo
   * do ETA (acumuladoMin abaixo) — isso mudaria terminoPrevisto do fallback
   * Haversine, comportamento já em produção e fora do escopo desta sprint
   * (só EXPOR a perna, não reconciliar o ETA com o degrau OSRM — esse já soma
   * a perna da origem corretamente via buildRoadPlan). Documentado pro
   * revisor: a soma das pernas bate com distanciaTotalKm (routeCostKm também
   * usa a origem), mas o etaAt cumulativo do Haversine segue sem contar esse
   * trecho — pendência PRÉ-EXISTENTE, reportada no relatório, não corrigida
   * aqui.
   */
  origem?: Coord | null;
}

/** Uma parada já com rotaOrdem e etaAt calculados. */
export interface PlannedStop extends Stop {
  rotaOrdem: number;
  etaAt: Date | null;
  semCoordenada: boolean;
  /**
   * S2 — perna (trecho) da parada ANTERIOR (ou da origem, se for a 1ª
   * roteável) até esta. `null` quando não há ponto de partida conhecido (1ª
   * parada sem origem) OU quando a própria parada está semCoordenada (não dá
   * pra medir trecho até um ponto sem pino). Já era somado e descartado
   * dentro do loop de ETA — aqui só é exposto por parada.
   */
  legDistanceM: number | null;
  legDurationS: number | null;
}

/**
 * ETA cumulativo ao longo de uma sequência JÁ ORDENADA (respeita o rotaOrdem que
 * vier). Por parada: etaAt = partida + Σ (trajeto até ela + tempoParada das
 * anteriores). Trajeto = distância(prev→atual) / velocidade. A 1ª parada NÃO tem
 * origem conhecida aqui (é só o ETA relativo da sequência), então seu trajeto é 0
 * e o ETA é partida + tempoParada. Paradas sem coord recebem etaAt=null (não dá
 * pra estimar trajeto), mas mantêm o rotaOrdem. Pura.
 */
export function computeEta(stops: Stop[], opts: EtaOptions): PlannedStop[] {
  const velocidade = opts.velocidadeKmH > 0 ? opts.velocidadeKmH : 25;
  const paradaMin = opts.paradaMin >= 0 ? opts.paradaMin : 5;
  const out: PlannedStop[] = [];
  let acumuladoMin = 0;
  let prev: Coord | null = null;
  // S2 (25/07, PR25072026-ROTA-CONFERIDA) — rastreador SEPARADO do `prev` do
  // ETA acima: a PERNA exibida da 1ª parada usa a origem quando conhecida
  // (trecho realmente percorrido), mesmo o cúmulo do ETA (acumuladoMin) não
  // contando esse trecho (ver nota em EtaOptions.origem). Ambos avançam juntos
  // depois da 1ª parada (nunca divergem de novo).
  let prevLeg: Coord | null = opts.origem ?? null;

  for (let idx = 0; idx < stops.length; idx++) {
    const s = stops[idx];
    const rotaOrdem = typeof s.rotaOrdem === 'number' ? s.rotaOrdem : idx;
    if (!hasCoord(s)) {
      // Sem coord: mantém a ordem, mas não estima ETA nem perna (null) — não
      // dá pra medir trecho até/depois de um ponto sem pino. `prevLeg` NÃO
      // avança: a próxima parada válida mede a partir do último ponto físico
      // conhecido (mesmo comportamento já existente do `prev` do ETA).
      out.push({ ...s, rotaOrdem, etaAt: null, semCoordenada: true, legDistanceM: null, legDurationS: null });
      continue;
    }
    const cur: Coord = { lat: s.lat as number, lng: s.lng as number };
    // Trajeto desde a parada anterior COM coord (a 1ª não tem prev → 0).
    const trajetoKm = prev ? haversineKm(prev, cur) : 0;
    const trajetoMin = (trajetoKm / velocidade) * 60;
    acumuladoMin += trajetoMin + paradaMin; // chega + descarrega
    const etaAt = new Date(opts.partida.getTime() + acumuladoMin * 60_000);
    const legKm = prevLeg ? haversineKm(prevLeg, cur) : null;
    const legDistanceM = legKm != null ? Math.round(legKm * 1000) : null;
    const legDurationS = legKm != null ? Math.round((legKm / velocidade) * 3600) : null;
    out.push({ ...s, rotaOrdem, etaAt, semCoordenada: false, legDistanceM, legDurationS });
    prev = cur;
    prevLeg = cur;
  }
  return out;
}

// S1 (25/07, PR25072026-ROTA-CONFERIDA) — CRACHÁ do motor de rota: fim do
// fallback Haversine mudo. `engine` diz qual matemática produziu o resultado;
// `degradedReason` só aparece quando o Haversine veio de FALHA de rede (Lei
// nº4 da frente: degradação nunca é silenciosa). Ordem manual também usa
// Haversine, mas por ESCOLHA do entregador — por isso planRouteManual nunca
// preenche degradedReason (é o sinal que o app usa pra NÃO soar o alarme).
export type RouteEngine = 'osrm' | 'haversine';

// timeout = abortou por tempo (8s direto / 9s embutido no proxy); rate_limit =
// disjuntor do proxy tripou (LogisticaOsrmService.consumeRate, 30/min/empresa);
// upstream = qualquer outra falha de rede/servidor/payload (inclui o próprio
// osrmUnavailable de logistica-osrm.service.ts, que já colapsa timeout+5xx
// nesse balde do lado do proxy); coords_invalidas = menos de 2 paradas com
// coordenada — nem dá pra montar matriz, então nem tenta OSRM.
export type RouteDegradedReason = 'timeout' | 'rate_limit' | 'upstream' | 'coords_invalidas';

/** Payload cru da matriz OSRM (mesma forma do proxy e do público direto). */
export interface OsrmTablePayload {
  code?: string;
  durations?: Array<Array<number | null>>;
  distances?: Array<Array<number | null>>;
}

export interface PlanRouteOptions {
  origem?: Coord | null;
  velocidadeKmH: number;
  paradaMin: number;
  partida: Date;
  /**
   * DEGRAU 1 da cadeia de roteamento: fetcher do proxy interno já com o
   * companyId amarrado (injeção — mantém planRouteByRoads pura/testável sem
   * Nest; quem monta o fetcher é LogisticaRotaService.osrmTableFetcher).
   * Ausente, ou erro, ou payload inválido → cai pro degrau 2 (OSRM público
   * direto, o fetch de sempre).
   */
  osrmTable?: (coords: Coord[]) => Promise<OsrmTablePayload>;
}

export interface PlanRouteResult {
  paradas: PlannedStop[];
  distanciaTotalKm: number;
  terminoPrevisto: Date | null;
  /** Motor que produziu ESTE resultado — nunca implícito (Lei nº4). */
  engine: RouteEngine;
  /** Só presente quando `engine==='haversine'` por FALHA (nunca em ordem manual). */
  degradedReason?: RouteDegradedReason;
}

/**
 * PIPELINE COMPLETO (puro): separa com/sem coord → NN → 2-opt → rotaOrdem 0..N
 * (roteáveis primeiro, sem-coord no fim) → ETA cumulativo → término previsto.
 */
export function planRoute(stops: Stop[], opts: PlanRouteOptions): PlanRouteResult {
  const comCoord = filtrarComCoord(stops);
  const semCoord = stops.filter((s) => !hasCoord(s));

  // Ordena os roteáveis: NN a partir da origem + refino 2-opt.
  const nn = nearestNeighbor(comCoord, opts.origem);
  const otimizado = twoOpt(nn, opts.origem);

  // rotaOrdem: 0..M-1 para os roteáveis (na ordem otimizada), depois os sem-coord.
  const ordenados: Stop[] = [
    ...otimizado.map((s, i) => ({ ...s, rotaOrdem: i })),
    ...semCoord.map((s, i) => ({ ...s, rotaOrdem: otimizado.length + i })),
  ];

  const paradas = computeEta(ordenados, {
    velocidadeKmH: opts.velocidadeKmH,
    paradaMin: opts.paradaMin,
    partida: opts.partida,
    // S2 — perna da 1ª parada roteável usa a origem (mesma origem que
    // routeCostKm usa abaixo pra somar distanciaTotalKm) — sem isto a soma
    // das pernas ficaria menor que distanciaTotalKm sempre que há origem.
    origem: opts.origem,
  });

  const distanciaTotalKm = routeCostKm(otimizado, opts.origem);
  // Término = etaAt da última parada COM coord (as sem-coord não têm ETA).
  const comEta = paradas.filter((p) => p.etaAt != null);
  const terminoPrevisto = comEta.length > 0 ? comEta[comEta.length - 1].etaAt : null;

  return { paradas, distanciaTotalKm, terminoPrevisto, engine: 'haversine' };
}

/**
 * PR18072026 — pipeline da ORDEM MANUAL: nada de NN/2-opt/OSRM. `ordemManual`
 * dita a ordem ao pé da letra — só as paradas que EXISTEM no conjunto aberto
 * (`stops`) entram, na ordem dada (1ª ocorrência de um id repetido vence, as
 * demais são ignoradas); tudo que sobrar (fora da lista OU fora do conjunto
 * aberto) vai pro FIM, na ordem natural em que `stops` chegou (já vem
 * pré-ordenado pelo fetch: rotaOrdem→scheduledAt→createdAt). ETA cumulativo
 * pela MESMA `computeEta` — mesma velocidade/tempo de parada do caminho
 * automático; só a ORDEM de entrada muda.
 */
export function planRouteManual(stops: Stop[], ordemManual: string[], opts: PlanRouteOptions): PlanRouteResult {
  const byId = new Map(stops.map((s) => [s.id, s] as const));
  const seen = new Set<string>();
  const manualOrdered: Stop[] = [];
  for (const id of ordemManual) {
    if (seen.has(id)) continue;
    const stop = byId.get(id);
    if (!stop) continue; // fora do conjunto aberto do dia/motorista — ignorado
    manualOrdered.push(stop);
    seen.add(id);
  }
  const resto = stops.filter((s) => !seen.has(s.id));
  const ordenados: Stop[] = [...manualOrdered, ...resto].map((s, i) => ({ ...s, rotaOrdem: i }));

  const paradas = computeEta(ordenados, {
    velocidadeKmH: opts.velocidadeKmH,
    paradaMin: opts.paradaMin,
    partida: opts.partida,
    // S2 — mesmo motivo do planRoute: a perna da 1ª parada roteável reflete
    // a origem, consistente com routeCostKm (abaixo) usando a mesma origem.
    origem: opts.origem,
  });

  const distanciaTotalKm = routeCostKm(filtrarComCoord(ordenados), opts.origem);
  const comEta = paradas.filter((p) => p.etaAt != null);
  const terminoPrevisto = comEta.length > 0 ? comEta[comEta.length - 1].etaAt : null;

  // Ordem manual não usa matriz (nem proxy nem público) — o cálculo de ETA é
  // SEMPRE Haversine (mesma computeEta do automático), mas isso é ESCOLHA do
  // entregador, não degradação de rede: degradedReason fica de fora de
  // propósito (é a ausência que o app usa pra NÃO soar o alarme amarelo).
  return { paradas, distanciaTotalKm, terminoPrevisto, engine: 'haversine' };
}

/**
 * Classifica o erro de uma tentativa OSRM (proxy ou público) no motivo do
 * crachá de degradação. `AbortError` = o próprio timeout local abortou (8s
 * direto / 9s embutido no proxy); status 429 = disjuntor do proxy tripou
 * (LogisticaOsrmService.consumeRate); qualquer outra coisa (rede caída, 5xx,
 * JSON quebrado, matriz com forma errada) cai em 'upstream' — mesmo balde que
 * o próprio proxy já usa pro erro genérico dele (osrmUnavailable).
 */
function classifyOsrmError(error: unknown): RouteDegradedReason {
  if (error instanceof Error && error.name === 'AbortError') return 'timeout';
  const status = typeof (error as any)?.getStatus === 'function' ? (error as any).getStatus() : (error as any)?.status;
  return status === 429 ? 'rate_limit' : 'upstream';
}

/**
 * Monta o resultado (sem `engine` — quem tagueia é o chamador) a partir de um
 * payload de matriz OSRM. Extraído do corpo de planRouteByRoads (S1,
 * PR25072026-ROTA-CONFERIDA) pra ser reusado nos 2 degraus que podem produzir
 * uma matriz usável (proxy e público) sem duplicar parse/ordenação/ETA.
 * `null` = payload ausente/código != Ok/forma errada → o chamador decide se
 * tenta o PRÓXIMO degrau ou já reporta o motivo.
 */
function buildRoadPlan(
  payload: OsrmTablePayload | null | undefined,
  stops: Stop[],
  valid: StopComCoord[],
  coordinates: Coord[],
  opts: PlanRouteOptions,
  hasOrigin: boolean,
): { paradas: PlannedStop[]; distanciaTotalKm: number; terminoPrevisto: Date | null } | null {
  if (
    !payload ||
    payload.code !== 'Ok' ||
    !matrixIsUsable(payload.durations, coordinates.length) ||
    !matrixIsUsable(payload.distances, coordinates.length)
  ) {
    return null;
  }

  const offset = hasOrigin ? 1 : 0;
  const order = greedyRoadOrder(valid.length, payload.durations!, offset, hasOrigin);
  const improved = improveRoadOrder(order, payload.durations!, offset, hasOrigin);
  const orderedValid = improved.map((index) => valid[index]);
  const invalid = stops.filter((stop) => !hasCoord(stop));
  const ordered: Stop[] = [...orderedValid, ...invalid].map((stop, index) => ({ ...stop, rotaOrdem: index }));

  let elapsedMinutes = 0;
  let distanceMeters = 0;
  let previousMatrixIndex = hasOrigin ? 0 : null;
  const paradas: PlannedStop[] = ordered.map((stop, index) => {
    if (!hasCoord(stop)) {
      return { ...stop, rotaOrdem: index, etaAt: null, semCoordenada: true, legDistanceM: null, legDurationS: null };
    }
    const validIndex = valid.findIndex((candidate) => candidate.id === stop.id);
    const matrixIndex = validIndex + offset;
    // S2 (25/07, PR25072026-ROTA-CONFERIDA) — a perna JÁ estava na matriz
    // (durations!/distances![prev][atual]), só era somada e descartada; aqui
    // é exposta por parada, sem mudar a soma (elapsedMinutes/distanceMeters
    // continuam idênticos a antes desta sprint). null quando não há prev na
    // matriz (1ª parada sem origem, offset=0).
    let legDistanceM: number | null = null;
    let legDurationS: number | null = null;
    if (previousMatrixIndex != null) {
      const legDurationRaw = Number(payload.durations![previousMatrixIndex][matrixIndex] || 0);
      const legDistanceRaw = Number(payload.distances![previousMatrixIndex][matrixIndex] || 0);
      elapsedMinutes += legDurationRaw / 60;
      distanceMeters += legDistanceRaw;
      legDurationS = Math.round(legDurationRaw);
      legDistanceM = Math.round(legDistanceRaw);
    }
    elapsedMinutes += Math.max(0, opts.paradaMin);
    previousMatrixIndex = matrixIndex;
    return {
      ...stop,
      rotaOrdem: index,
      etaAt: new Date(opts.partida.getTime() + elapsedMinutes * 60_000),
      semCoordenada: false,
      legDistanceM,
      legDurationS,
    };
  });
  const withEta = paradas.filter((stop) => stop.etaAt != null);
  return { paradas, distanciaTotalKm: distanceMeters / 1_000, terminoPrevisto: withEta.at(-1)?.etaAt ?? null };
}

/**
 * Planejamento real por ruas — CADEIA DE 3 DEGRAUS (S1, 25/07,
 * PR25072026-ROTA-CONFERIDA — fim do fallback Haversine mudo):
 *   1) proxy interno (`opts.osrmTable`, wiring = LogisticaRotaService.osrmTableFetcher
 *      → LogisticaOsrmService.table: cache 10min + rate-limit 30/min/empresa);
 *   2) OSRM público direto (fetch de sempre, mesma URL/timeout de sempre);
 *   3) Haversine (matemática pura, nunca falha).
 * Cada degrau só é tentado se o anterior não devolveu uma matriz usável — o
 * proxy NUNCA vira ponto único de falha (mesmo princípio do próprio serviço).
 * O resultado carrega `engine` sempre e, quando caiu pro Haversine por FALHA
 * (nunca por ordem manual — essa não passa por aqui), `degradedReason`
 * explica o porquê (Lei nº4 da frente: degradação nunca é silenciosa).
 */
export async function planRouteByRoads(stops: Stop[], opts: PlanRouteOptions): Promise<PlanRouteResult> {
  const valid = filtrarComCoord(stops);
  // Menos de 2 paradas com coordenada: não dá pra montar matriz (mínimo 2
  // pontos). O motivo é o DADO, não a rede — nem tenta OSRM à toa, já sai
  // com o crachá certo.
  if (valid.length < 2) return { ...planRoute(stops, opts), degradedReason: 'coords_invalidas' };

  const hasOrigin = !!opts.origem && pinoValido(opts.origem.lat, opts.origem.lng);
  const coordinates: Coord[] = [...(hasOrigin ? [opts.origem as Coord] : []), ...valid.map((stop) => ({ lat: stop.lat, lng: stop.lng }))];

  // DEGRAU 1 — proxy interno. Guarda o motivo só pra reportar CASO o degrau 2
  // também falhe: rate_limit é o sinal mais específico/acionável (disjuntor
  // do proxy tripou); qualquer outro erro daqui é redundante com o que quer
  // que trave o degrau 2 (que é sempre o ÚLTIMO tentado antes do Haversine).
  let proxyReason: RouteDegradedReason | null = null;
  if (opts.osrmTable) {
    try {
      const payload = await opts.osrmTable(coordinates);
      const built = buildRoadPlan(payload, stops, valid, coordinates, opts, hasOrigin);
      if (built) return { ...built, engine: 'osrm' };
      proxyReason = 'upstream'; // respondeu, mas payload/código inválido
    } catch (error) {
      proxyReason = classifyOsrmError(error);
    }
  }

  // DEGRAU 2 — OSRM público direto (fetch de sempre; timeout 8s preservado).
  const encoded = coordinates.map((point) => `${point.lng},${point.lat}`).join(';');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`https://router.project-osrm.org/table/v1/driving/${encoded}?annotations=duration,distance`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HBX-Logistica/1.0' },
    });
    if (!response.ok) throw new Error(`OSRM table HTTP ${response.status}`);
    const payload = await response.json() as OsrmTablePayload;
    const built = buildRoadPlan(payload, stops, valid, coordinates, opts, hasOrigin);
    if (!built) throw new Error(`OSRM table inválida (${payload.code || 'sem código'})`);
    return { ...built, engine: 'osrm' };
  } catch (error) {
    // DEGRAU 3 — Haversine. rate_limit do proxy (degrau 1) é mais específico
    // quando presente; senão o motivo é o que travou aqui mesmo.
    const degradedReason = proxyReason === 'rate_limit' ? 'rate_limit' : classifyOsrmError(error);
    return { ...planRoute(stops, opts), degradedReason };
  } finally {
    clearTimeout(timeout);
  }
}

function matrixIsUsable(matrix: Array<Array<number | null>> | undefined, size: number): boolean {
  return Array.isArray(matrix) && matrix.length === size && matrix.every((row) => Array.isArray(row) && row.length === size);
}

function roadPathCost(order: number[], matrix: Array<Array<number | null>>, offset: number, hasOrigin: boolean): number {
  let current = hasOrigin ? 0 : order[0] + offset;
  let cost = 0;
  for (let position = hasOrigin ? 0 : 1; position < order.length; position++) {
    const next = order[position] + offset;
    const leg = matrix[current]?.[next];
    if (leg == null || !Number.isFinite(leg)) return Number.POSITIVE_INFINITY;
    cost += leg;
    current = next;
  }
  return cost;
}

function greedyRoadOrder(count: number, matrix: Array<Array<number | null>>, offset: number, hasOrigin: boolean): number[] {
  const remaining = new Set(Array.from({ length: count }, (_, index) => index));
  const order: number[] = [];
  let current = hasOrigin ? 0 : offset;
  if (!hasOrigin) { order.push(0); remaining.delete(0); }
  while (remaining.size) {
    let best = -1; let bestCost = Number.POSITIVE_INFINITY;
    for (const candidate of remaining) {
      const cost = matrix[current]?.[candidate + offset];
      if (cost != null && Number.isFinite(cost) && cost < bestCost) { best = candidate; bestCost = cost; }
    }
    if (best < 0) best = remaining.values().next().value;
    order.push(best); remaining.delete(best); current = best + offset;
  }
  return order;
}

function improveRoadOrder(order: number[], matrix: Array<Array<number | null>>, offset: number, hasOrigin: boolean): number[] {
  let best = [...order]; let bestCost = roadPathCost(best, matrix, offset, hasOrigin);
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let from = hasOrigin ? 0 : 1; from < best.length - 1; from++) {
      for (let to = from + 1; to < best.length; to++) {
        const candidate = [...best.slice(0, from), ...best.slice(from, to + 1).reverse(), ...best.slice(to + 1)];
        const cost = roadPathCost(candidate, matrix, offset, hasOrigin);
        if (cost + 0.5 < bestCost) { best = candidate; bestCost = cost; changed = true; }
      }
    }
    if (!changed) break;
  }
  return best;
}

// ── helpers de mapeamento / data ────────────────────────────────────────────────
function toStop(r: ParadaRow): Stop {
  // MULTILOCAL (11/07) — PREFERE o geo do LOCAL quando a entrega tem um (cada porta
  // tem sua coordenada); senão cai no perfil (legado). MESMA regra que o listRota
  // aplica. FIX (25/07) — o local só vale como fonte se tiver lat E lng válidos;
  // antes bastava o OBJETO `local` existir (mesmo sem coordenada, caso dos ~824
  // registros que o backfill do freio de geocode deixou null de propósito) para
  // descartar um pino BOM do perfil. `resolverCoordenadaMultilocal` também garante
  // que lat/lng nunca vêm de fontes diferentes (nunca combina local.lat+perfil.lng).
  const coord = resolverCoordenadaMultilocal(r.local, r.customerProfile);
  return {
    id: r.id,
    lat: coord.lat,
    lng: coord.lng,
    status: r.status,
    // Rótulo da parada: apelido do local ("Casa"|"Loja") quando presente, senão o nome do cliente.
    nome: r.local?.apelido ?? r.customerProfile?.name ?? null,
    rotaOrdem: r.rotaOrdem ?? null,
  };
}

function compareByRotaOrdem(a: Stop, b: Stop): number {
  const ao = typeof a.rotaOrdem === 'number' ? a.rotaOrdem : Number.MAX_SAFE_INTEGER;
  const bo = typeof b.rotaOrdem === 'number' ? b.rotaOrdem : Number.MAX_SAFE_INTEGER;
  return ao - bo;
}

function coordFromInput(lat?: number | null, lng?: number | null): Coord | null {
  return pinoValido(lat, lng) ? { lat: lat as number, lng: lng as number } : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ROTA v2 F3d — 409 humano (mesmo shape/lei da máquina velha): nunca vaza id
// de entrega pra tela do motorista. O app trata o `code` e orienta ("encerre
// a rota antiga"); a migração automática em `congelarStops` faz este erro só
// sobrar pra rota dona ainda VIVA no mesmo dia.
function stopDeOutraRotaError(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'ENTREGA_EM_OUTRA_ROTA',
    message: 'Uma das entregas ainda está em outra rota em andamento. Encerre a rota antiga e monte de novo.',
  });
}

// NOTA (BUG 5, 11/07): esta resolveDayRange é DUPLICADA em logistica.service.ts —
// mesma forma, cada uma com sua própria parseDateOrNull local. Não deduplicado
// agora (fora do escopo do fix); só mantidas as duas em paridade.
export function resolveDayRange(dateInput?: string): { start: Date; end: Date; dayISO: string } {
  const base = parseDateOrNull(dateInput) ?? new Date();
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);
  return { start, end, dayISO: toDayISO(start) };
}

// F0 (27/07) — sourceDateFromOccurrenceKey/saoPauloMidnight se mudaram para
// logistica-agenda-cursor.util.ts (logistica.service.ts também precisa das
// duas pro avanço do cursor no desfecho — ver avancarPlanoNoDesfecho). Reexporta
// aqui para não quebrar quem já importa deste módulo (ex.: testes existentes).
export { sourceDateFromOccurrenceKey, saoPauloMidnight };

function toDayISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  // "YYYY-MM-DD" puro é lido no fuso LOCAL (mesmo cuidado do M2: em Brasília -3,
  // o parse UTC escorregaria pro dia anterior).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const day = Number(m[3]);
    const d = new Date(y, mo - 1, day, 0, 0, 0, 0);
    // FIX (BUG 5, 11/07) — round-trip: sem isso, "2026-02-30" (30 de fevereiro,
    // impossível mas bem-formada) fazia overflow silencioso pro dia 02/mar em vez
    // de cair pra HOJE como já acontecia com "abc"/"2026-13-45" — inconsistente.
    // Se o Date construído não bate com y/mo/day pedidos, é rollover → inválida.
    if (Number.isNaN(d.getTime()) || d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day) {
      return null;
    }
    return d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── tipos de I/O ────────────────────────────────────────────────────────────────
interface ParadaRow {
  id: string;
  entregadorId: number | null;
  status: string;
  rotaOrdem: number | null;
  scheduledAt: Date | null;
  // MULTILOCAL (11/07) — o LOCAL da entrega (null = perfil/legado); seu geo tem
  // prioridade sobre o do perfil na roteirização.
  local: { apelido: string | null; lat: number | null; lng: number | null } | null;
  customerProfile: { name: string | null; lat: number | null; lng: number | null } | null;
}

// ── ENCERRAR ROTA (PR17072026 Onda 1) — shape mínimo lido por linha ──────────
interface EncerrarRotaRow {
  id: string;
  status: string;
  rotaOrdem: number | null;
  etaAt: Date | null;
  startedAt: Date | null;
}

export interface PlanejarRotaInput {
  date?: string;
  origemLat?: number;
  origemLng?: number;
  deliveryIds?: string[];
  startAt?: string; // hora de partida (default: agora) — usado no cálculo do ETA
  // PR18072026 — ids das entregas na ordem que o entregador arrastou na tela
  // ("Minha ordem"). Presentes = ordem dada; ausentes/fora do conjunto aberto
  // do dia/motorista = apêndice no fim (ordem natural do fetch). Pula NN+2-opt.
  ordemManual?: string[];
}

export interface IniciarRotaInput {
  date?: string;
  origemLat?: number;
  origemLng?: number;
  deliveryIds?: string[];
  ordemManual?: string[];
}

// ── ENCERRAR ROTA (PR17072026 Onda 1) ────────────────────────────────────────
export interface EncerrarRotaInput {
  date?: string;
  motivo?: string;
  /** Escopo exato usado pela continuidade; não faz parte do contrato legado. */
  deliveryIds?: string[];
  routeId?: string;
  skipRoute?: boolean;
}

export interface EncerrarRotaResumo {
  total: number;
  entregues: number;
  naoEntregues: number;
  pendentes: number;
}

export interface EncerrarRotaResult {
  ok: true;
  resumo: EncerrarRotaResumo;
}

// ── DESCARTAR MONTAGEM (27/07) ────────────────────────────────────────────────
/** Shape mínimo lido por linha aberta ao desfazer uma montagem não aceita. */
interface DescartarMontagemRow {
  id: string;
  status: string;
  startedAt: Date | null;
  cobrancaStatus: string | null;
  customerProfileId: string;
  planoEntregaId: string | null;
  agendaOcorrenciaKey: string | null;
  rotaModeloId: string | null;
  comprovanteConfirmadoAt: Date | null;
  logisticaRouteStop: {
    id: string;
    route: { status: string | null; operationalEndedAt: Date | null; routeDate: string | null } | null;
  } | null;
  _count?: { comprovantes: number };
}

export interface DescartarMontagemResumo {
  /** Entregas que a montagem materializou e ninguém tocou — canceladas aqui. */
  descartadas: number;
  /** Planos cuja `proximaData` voltou pra data de origem da ocorrência. */
  planosLiberados: number;
  /** Abertas que ficaram (avulsa/manual/já iniciada): só perderam a ordem. */
  pendentes: number;
}

export interface DescartarMontagemResult {
  ok: true;
  resumo: DescartarMontagemResumo;
}

// ── LIMPAR DIA (PR18072026 Onda 1) ────────────────────────────────────────────
export interface LimparDiaResumo {
  /** Paradas que saíram do dia: as APAGADAS + as que só puderam ser carimbadas. */
  canceladas: number;
  /** Quantas SUMIRAM de verdade (10/08, "o cancelar q não deleta, essa patifaria"). */
  apagadas: number;
  /** Planos recorrentes cuja `proximaData` voltou pro dia limpo (25/07). */
  planosLiberados: number;
  /** Rotas do dia (montada, inicializando ou rodando) que morreram (09/08). */
  rotasEncerradas: number;
  /** Paradas congeladas apagadas — as do que NÃO foi entregue (09/08). */
  paradasApagadas: number;
}

export interface LimparDiaResult {
  ok: true;
  resumo: LimparDiaResumo;
}

function normalizeDeliveryIds(value?: string[]): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = [...new Set(value.map(id => String(id || '').trim()).filter(id => id.length > 0 && id.length <= 80))].slice(0, 300);
  return ids.length ? ids : undefined;
}

// PR18072026 — mesma normalização de normalizeDeliveryIds (trim + tamanho +
// teto), mas SEM dedupe/Set: planRouteManual precisa da ORDEM original dada
// pelo app (o Set do normalizeDeliveryIds embaralharia a ordem de inserção
// em runtimes que não preservam string keys — mais seguro nunca depender
// disso aqui). O dedupe acontece em planRouteManual (1ª ocorrência vence).
function normalizeOrdemManual(value?: string[]): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value
    .map((id) => String(id || '').trim())
    .filter((id) => id.length > 0 && id.length <= 80)
    .slice(0, 500);
  return ids.length ? ids : undefined;
}

// ── PROSPECTOR CNPJ (PR07082026 F1-servidor) ──────────────────────────────────

/** As 2 chaves de política + as 2 réguas, lidas numa consulta só. Interno. */
type PoliticaProspector = {
  ativo: boolean;
  equipe: boolean;
  raioM: number | null;
  maxDia: number | null;
};

/**
 * O ATOR do prospector: o papel (que decide a chave nº3) MAIS o id (que decide a
 * chave nº4, a escolha da semana). Era só `ActorKindUserLike`; o id entrou quando a
 * escolha passou a ser DA PESSOA. `req.user` e `LogisticaActor` já satisfazem os dois.
 */
export type AtorProspector =
  | ({ id?: number | string | null } & NonNullable<ActorKindUserLike>)
  | null
  | undefined;

/**
 * O id de quem está dirigindo — ou 0, que FECHA a chave da semana.
 *
 * Fail-closed é a mesma régua da chave nº3 ("chamada sem ator é tratada como
 * funcionário comum"): sem saber QUEM é, não há de quem ler a escolha, e a resposta
 * honesta é o prospector quieto.
 */
function idDoAtor(actor: AtorProspector): number {
  const id = Math.trunc(Number((actor as any)?.id || 0));
  return Number.isFinite(id) && id > 0 ? id : 0;
}

/** Uma empresa do corredor, do jeito que o APK desenha o prédio no mapa. */
export interface RotaProspectoEmpresa {
  /** Gancho do prédio na tela (contrato do seam da ponte). É o próprio CNPJ. */
  id: string;
  cnpj: string;
  nome: string;
  /** Ramo legível: descrição do CNAE da RFB, ou o rótulo da cesta. */
  ramo: string | null;
  lat: number;
  lng: number;
  /** Metros até a parada mais próxima da rota do dia. */
  distM: number;
  /**
   * true = está na cesta "sede de água" (afinidade de ramo). SÓ existe no
   * payload do INICIAR: a afinidade é do CNAE, e `ProspectoRota` guarda a
   * descrição do ramo, não o código — então a RELEITURA (listRota) não tem como
   * recomputá-la. Campo opcional em vez de `false` na releitura de propósito:
   * "não sei" e "não tem afinidade" são coisas diferentes.
   */
  afinidade?: boolean;
  /**
   * PROSPECTOR v2 (12/08) — VERDE ou AZUL, e é o servidor que diz.
   *
   * `true`  = o CNAE bate nos prefixos do TIPO que a pessoa escolheu nesta semana.
   *           Só ela pode acender, falar e ganhar rótulo.
   * `false` = está no corredor mas não é do tipo: prédio AZUL, ambiente, MUDO. Ele
   *           continua vindo de propósito — filtrar no corredor deixaria a rua vazia
   *           e mataria a sensação de "tem mundo aí fora", que é metade da cena.
   *
   * Recomputado nos DOIS payloads contra a escolha de AGORA (nunca snapshot), senão
   * trocar de tipo na quarta não mudaria a cor da rua até a semana virar.
   */
  escolhida: boolean;
  /**
   * O prédio nasce ACESO na tela de navegação (o resto nasce apagado e é
   * reserva do clique do motorista). Decidido pelo SERVIDOR, nos dois payloads,
   * pela mesma régua — ver `ordenarParaAcender`.
   */
  aceso: boolean;
}

/**
 * QUEM ACENDE SOZINHO — a régua ÚNICA dos dois payloads do prospector (o do
 * `iniciar-rota` e o da releitura do `listRota`).
 *
 * 🔴 POR QUE ISTO EXISTE. A tela de navegação pinta prédio ACESO e prédio
 * APAGADO. Se cada payload decidisse por conta, reabrir o app trocaria QUAIS
 * empresas estão acesas — o motorista veria a tela mudar sozinha sem nada ter
 * acontecido na rua. Dado em dois lugares que discordam é bug de produto.
 *
 * A DIVISÃO DE TRABALHO, que é o que torna esta régua reproduzível:
 *  · a AFINIDADE de ramo (cesta "sede de água") decide quem EMBARCA — é o
 *    ranking do corredor (`ordenarProspectos`), e o cap é o dobro do teto do dia;
 *  · a DISTÂNCIA decide quem ACENDE — e distância É persistida (`ProspectoRota.
 *    distM`), então a releitura reproduz a MESMA lista, na MESMA ordem, com os
 *    MESMOS acesos, sem coluna nova e sem migration.
 *
 * Desempate por `cnpj` porque duas empresas na mesma esquina dão o mesmo `distM`
 * arredondado — sem ele a ordem viraria a do banco, que não é estável.
 *
 * 🔴 PROSPECTOR v2 (12/08) — O TETO É SÓ ENTRE AS ESCOLHIDAS. Antes o teto do dia
 * caía nas N mais perto, quaisquer que fossem. Agora as azuis são AMBIENTE: elas
 * ocupam a rua mas não ocupam vaga de "acesa" — senão três mercearias e um pet shop
 * na frente do padeiro que a pessoa está caçando gastariam o teto inteiro em prédio
 * mudo, e a tela ficaria cheia de convite que ninguém pediu. Nenhuma escolhida no
 * corredor = NINGUÉM acende, e está certo: a rua fica azul e quieta.
 */
export function ordenarParaAcender(
  empresas: readonly RotaProspectoEmpresa[],
  acendeNoDia: number,
): RotaProspectoEmpresa[] {
  const teto = Number.isFinite(acendeNoDia) ? Math.max(0, Math.trunc(acendeNoDia)) : 0;
  let acesas = 0;
  return [...empresas]
    .sort((a, b) => (a.distM !== b.distM ? a.distM - b.distM : a.cnpj < b.cnpj ? -1 : a.cnpj > b.cnpj ? 1 : 0))
    .map((e) => {
      // A ORDEM da lista continua sendo a de distância (é ela que a tela usa pra
      // brigar por rótulo e empilhar prédio). O que passou a ser filtrado é só quem
      // GASTA vaga do teto.
      const aceso = !!e.escolhida && acesas < teto;
      if (aceso) acesas += 1;
      return { ...e, aceso };
    });
}

export interface RotaProspectorPayload {
  /** Dia OPERACIONAL da rota (YYYY-MM-DD, America/Sao_Paulo). */
  rotaDia: string;
  raioM: number;
  /** Quantas o mapa pode ACENDER sozinho no dia — o resto é reserva do clique. */
  acendeNoDia: number;
  /** false = a tabela ProspectoRota ainda não existe (a lista vale só hoje). */
  persistido: boolean;
  /** Slug do TIPO que a pessoa escolheu nesta semana (a chave nº4). Sempre presente:
   *  sem escolha este payload inteiro não existe. */
  tipo: string;
  /** O mesmo tipo em português, pro app não ter que traduzir slug. */
  tipoRotulo: string;
  empresas: RotaProspectoEmpresa[];
}

export interface PlanejarRotaParada {
  id: string;
  rotaOrdem: number;
  etaAt: string | null;
  semCoordenada: boolean;
  lat: number | null;
  lng: number | null;
  status: string;
  nome: string | null;
  // S2 (25/07, PR25072026-ROTA-CONFERIDA) — perna (trecho) da parada anterior
  // (ou da origem, na 1ª) até esta. Ver PlannedStop.legDistanceM/legDurationS.
  legDistanceM: number | null;
  legDurationS: number | null;
}

export interface PlanejarRotaResult {
  date: string;
  total: number;
  semCoordenada: number;
  distanciaTotalKm: number;
  terminoPrevisto: string | null;
  velocidadeMediaKmH: number;
  tempoParadaMin: number;
  // S1 (25/07, PR25072026-ROTA-CONFERIDA) — crachá do motor, aditivo (campos
  // acima intocados). engine sempre presente; degradedReason só quando o
  // Haversine veio de falha real (nunca em ordem manual). Ver PlanRouteResult.
  engine: RouteEngine;
  degradedReason?: RouteDegradedReason;
  paradas: PlanejarRotaParada[];
  routeId?: string | null;
  trackingRequired?: boolean;
  routeMode?: 'ESSENTIAL' | 'TRACKED' | null;
  routeStatus?: string | null;
  trackingSessionId?: string | null;
  trackingStatus?: string | null;
  // PROSPECTOR CNPJ (07/08) — ADITIVO e CONDICIONAL: a chave só aparece no
  // iniciar-rota e só quando as 4 chaves do prospector estão abertas. Ausente
  // = exatamente o payload de sempre (planejar/recalcular nunca a produzem).
  prospector?: RotaProspectorPayload;
}
