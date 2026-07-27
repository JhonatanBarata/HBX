import { BadRequestException, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LogisticaConfigService } from './logistica-config.service';
import { LogisticaOsrmService } from './logistica-osrm.service';
import { fonteEscolhidaMultilocal, resolverCoordenadaMultilocal } from './logistica-geo-fonte.util';
import {
  conferirCepsEmLote,
  descobrirCepsPorEndereco,
  enderecoSemNumero,
  logradouroDoCadastro,
  normalizarCep,
  temBairroNoCadastro,
  type CepVeredito,
  type EnderecoCadastrado,
} from './logistica-cep.util';
import { aquecerCnefe, extrairNumeroPorta, resolverCnefe, resolverCnefeLote, type CnefePino } from '../nucleo/cnefe-resolver.util';
import {
  haversineKm,
  planRouteByRoads,
  planRouteManual,
  resolveDayRange,
  type Coord,
  type OsrmTablePayload,
  type RouteDegradedReason,
  type RouteEngine,
  type Stop,
} from './logistica-rota.service';
import {
  conferirParadas,
  motivosVisiveisOrdenados,
  type MotivoConferencia,
  type ParadaConferenciaInput,
  type SemaforoCor,
} from './logistica-conferencia.util';

// Só as entregas ABERTAS entram na conferência (mesmo recorte do planejador —
// LogisticaRotaService.STATUS_ABERTO, duplicado aqui de propósito: ver comentário de
// `fetchParadasEstendidas`).
const STATUS_ABERTO = ['agendada', 'em_rota'] as const;

/**
 * S3 (25/07, PR25072026-ROTA-CONFERIDA) — "conferir": o CÉREBRO da frente, DRY-RUN
 * ABSOLUTO (Lei nº3: conferir NUNCA debita crédito nem grava rota).
 *
 * Roda o MESMO motor de planejamento da S1 (planRouteByRoads: proxy→OSRM público→
 * Haversine) em memória — nunca grava `rotaOrdem`/`etaAt`, nunca chama
 * `LogisticaRouteBillingService.prepareRoute`, nunca dispara WhatsApp — e devolve, por
 * parada, o semáforo de confiança do pino (logistica-conferencia.util.ts): a rota pode
 * estar matematicamente correta e ainda assim levar o entregador a um pino ERRADO (Lei
 * nº1) se a fonte da coordenada não foi provada no campo. É o aviso ANTES de sair de
 * casa, nunca um bloqueio (Lei nº7 — vermelho não impede iniciar a rota).
 *
 * S5 (25/07) — furo achado pela própria S4: com `ordemManual` ativo (ver
 * IniciarRotaDto/PlanejarRotaDto), a conferência agora audita a ordem que o entregador
 * VAI RODAR (planRouteManual, mesmo desvio do planejar — pula NN/2-opt/OSRM), não a que
 * o motor automático escolheria hoje.
 */
@Injectable()
export class LogisticaConferenciaService implements OnModuleInit {
  private readonly logger = new Logger(LogisticaConferenciaService.name);

  /** 27/07 (2º incidente company 48) — aquece a base CNEFE no boot: a 1ª consulta
   *  pós-deploy pagava disco frio, estourava o teto e a cura morria "0 de N". */
  onModuleInit(): void {
    void aquecerCnefe();
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: LogisticaConfigService,
    // Mesmo padrão @Optional() de LogisticaRotaService.osrm: sem o proxy injetado
    // (teste instanciando direto, ou módulo sem o provider), planRouteByRoads pula
    // sozinho pro degrau 2 (OSRM público) — nunca quebra por causa deste opcional.
    @Optional() private readonly osrm?: LogisticaOsrmService,
  ) {}

  async conferir(companyId: number, input: ConferirRotaInput = {}, entregadorId?: number): Promise<ConferirRotaResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const { start, end, dayISO } = resolveDayRange(input.date);
    const cfg = await this.config.getConfig(companyId);
    const origem = coordFromInput(input.origemLat, input.origemLng);
    const deliveryIds = normalizeDeliveryIds(input.deliveryIds);
    const ordemManual = normalizeOrdemManual(input.ordemManual);

    const rows = await this.fetchParadasEstendidas(companyId, start, end, entregadorId, deliveryIds);

    // R9 (27/07) — CURA DO PINO ANTES DA RÉGUA: parada sem coordenada em NENHUMA fonte
    // mas com CEP+número no cadastro resolve pela base CNEFE local e GRAVA o pino
    // (geoFonte 'cnefe') no dono do endereço. "Não sei onde fica este endereço" só
    // sobra quando nem o CEP resolve. Esta é a ÚNICA escrita deste serviço, e é de
    // CADASTRO (pino), nunca de rota/crédito — a Lei nº3 (conferir não debita nem
    // grava rota) segue intacta. Best-effort com orçamento: estourou, o resto segue
    // sem pino nesta rodada (a próxima conferência continua de onde parou).
    await this.resolverSemPinoViaCnefe(companyId, rows);

    // Resolve a fonte MULTILOCAL (mesma regra do planejador, `resolverCoordenadaMultilocal`)
    // e guarda geoFonte/ids de junção à parte — `planRouteByRoads` só conhece `Stop`
    // (id/lat/lng/status/nome/rotaOrdem), o resto vive num Map por id.
    const extras = new Map<string, { geoFonte: string | null; customerProfileId: string; localId: string | null }>();
    // Endereço a conferir contra o CEP, na MESMA ordem de `rows` (o veredito volta por
    // índice) — sempre da fonte que `resolverCoordenadaMultilocal` escolheu pro pino.
    const cadastros: EnderecoCadastrado[] = [];
    const cadastroPorParada = new Map<string, EnderecoCadastrado>();
    const stops: Stop[] = rows.map((r) => {
      const coord = resolverCoordenadaMultilocal(r.local, r.customerProfile);
      extras.set(r.id, { geoFonte: coord.geoFonte, customerProfileId: r.customerProfileId, localId: r.localId });
      const cadastro = enderecoDaFonteEscolhida(r);
      cadastros.push(cadastro);
      cadastroPorParada.set(r.id, cadastro);
      return {
        id: r.id,
        lat: coord.lat,
        lng: coord.lng,
        status: r.status,
        nome: r.local?.apelido ?? r.customerProfile?.name ?? null,
        rotaOrdem: r.rotaOrdem ?? null,
      };
    });

    // CEP × endereço (26/07): DISPARA AGORA, sem `await` — corre em PARALELO com o motor
    // de rota e com os 2 agregados abaixo (Lei nº2: a conferência não pode ficar mais
    // lenta por causa desta checagem). `.catch` já aqui, e não só no `Promise.all`:
    // promise pendurada que rejeita antes de ser aguardada vira unhandledRejection e
    // derruba o processo — `conferirCepsEmLote` não lança, mas isto é o cinto de segurança.
    const cepPromise: Promise<CepVeredito[]> = conferirCepsEmLote(cadastros).catch((err) => {
      this.logger.warn(`[logistica] conferência company=${companyId}: checagem CEP falhou (segue sem ela) — ${err}`);
      return cadastros.map(() => 'indeterminado' as CepVeredito);
    });

    // DRY-RUN: roda o motor em memória. NUNCA persiste (sem prisma.entrega.update*
    // depois disto), NUNCA chama routeBilling — é só leitura + cálculo.
    // S5 — mesmo desvio do planejar (logistica-rota.service.ts): ordemManual presente
    // pula NN/2-opt/OSRM inteiro (planRouteManual é síncrono e nunca falha em rede).
    const partida = new Date();
    const plan = ordemManual
      ? planRouteManual(stops, ordemManual, {
          origem,
          velocidadeKmH: cfg.velocidadeMediaKmH,
          paradaMin: cfg.tempoParadaMin,
          partida,
        })
      : await planRouteByRoads(stops, {
          origem,
          velocidadeKmH: cfg.velocidadeMediaKmH,
          paradaMin: cfg.tempoParadaMin,
          partida,
          osrmTable: this.osrmTableFetcher(companyId),
        });

    const customerProfileIds = [...new Set(rows.map((r) => r.customerProfileId))];
    // nunca_entregue e diverge_gps_ouro: 1 query agregada CADA (nunca N+1 por parada).
    const [entreguesPorCliente, ultimaEntregaConcluida, cepVereditos] = await Promise.all([
      this.contarEntreguesConcluidas(companyId, customerProfileIds),
      this.buscarUltimaEntregaConcluida(companyId, customerProfileIds),
      cepPromise,
    ]);

    // Só 'nao_bate' acusa. 'indeterminado' (CEP ausente/inexistente, ViaCEP fora, orçamento
    // estourado) é SILÊNCIO — fail-OPEN, ver logistica-cep.util.ts.
    const cepDivergentePorId = new Map<string, boolean>(
      rows.map((r, i) => [r.id, cepVereditos[i] === 'nao_bate'] as const),
    );

    const inputsConferencia: ParadaConferenciaInput[] = plan.paradas.map((p) => {
      const extra = extras.get(p.id);
      const chave = extra ? chaveHistorico(extra.customerProfileId, extra.localId) : '';
      const ultimaEntrega = ultimaEntregaConcluida.get(chave);
      const distanciaGpsOuroM =
        ultimaEntrega && typeof p.lat === 'number' && typeof p.lng === 'number'
          ? Math.round(haversineKm({ lat: p.lat, lng: p.lng }, ultimaEntrega) * 1000)
          : null;
      return {
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        geoFonte: extra?.geoFonte ?? null,
        legDistanceM: p.legDistanceM,
        temEntregaConcluida: extra ? entreguesPorCliente.has(chave) : false,
        distanciaGpsOuroM,
        cepDivergente: cepDivergentePorId.get(p.id) === true,
        // Custo zero e sem rede: roda SEMPRE (mesmo com ViaCEP fora, mesmo quando a
        // checagem de CEP nem consultou).
        enderecoSemNumero: enderecoSemNumero(cadastroPorParada.get(p.id) ?? {}),
      };
    });

    const conferidas = conferirParadas(inputsConferencia, { engine: plan.engine });
    const conferidaPorId = new Map(conferidas.map((c) => [c.id, c] as const));

    const paradas: ConferirRotaParada[] = plan.paradas.map((p) => {
      // conferidaPorId sempre tem a chave (1:1 com plan.paradas, ver map acima) —
      // o "!" documenta essa garantia estrutural, não um risco de runtime.
      const c = conferidaPorId.get(p.id)!;
      const extra = extras.get(p.id);
      return {
        id: p.id,
        nome: p.nome,
        // Conta/porta da parada (ver ConferirRotaParada): o "Salvar rota" do APK
        // grava rota-modelo por customerProfileId/localId.
        customerProfileId: extra?.customerProfileId ?? null,
        localId: extra?.localId ?? null,
        rotaOrdem: p.rotaOrdem,
        lat: p.lat,
        lng: p.lng,
        etaAt: p.etaAt ? p.etaAt.toISOString() : null,
        legDistanceM: p.legDistanceM,
        legDurationS: p.legDurationS,
        semaforo: c.semaforo,
        motivos: c.motivos,
        // O front lê SÓ isto (26/07): impeditivos, em ordem de gravidade. `motivos` segue
        // completo no payload pra auditoria/saúde da base, mas não vira frase na tela.
        motivosVisiveis: motivosVisiveisOrdenados(c.motivos),
      };
    });

    this.logger.log(
      `[logistica] conferência ${dayISO} company=${companyId}: ${paradas.length} parada(s) ` +
        `(engine=${plan.engine}${plan.degradedReason ? ` degradedReason=${plan.degradedReason}` : ''}).`,
    );

    return {
      date: dayISO,
      engine: plan.engine,
      degradedReason: plan.degradedReason ?? null,
      total: paradas.length,
      // comAviso = o número que a tela mostra ("2 de 97 precisam de correção"). Hoje é
      // idêntico a `vermelhas` por construção (impeditivo é o que pinta), e é assim de
      // propósito: se um dia existir aviso impeditivo que não pinte, o front não muda.
      comAviso: paradas.filter((p) => p.motivosVisiveis.length > 0).length,
      verdes: paradas.filter((p) => p.semaforo === 'verde').length,
      vermelhas: paradas.filter((p) => p.semaforo === 'vermelho').length,
      distanciaTotalKm: Math.round(plan.distanciaTotalKm * 100) / 100,
      terminoPrevisto: plan.terminoPrevisto ? plan.terminoPrevisto.toISOString() : null,
      paradas,
    };
  }

  /**
   * R9 (27/07) — resolve os `sem_pino` elegíveis pela base CNEFE, agrupando por DONO
   * do endereço (LocalEntrega ou perfil): 1 consulta por dono mesmo com N entregas
   * do mesmo cliente no dia. Concorrência e orçamento limitados (a conferência nunca
   * fica lenta por causa disto — mesmo espírito do lote de CEP em logistica-cep.util).
   */
  private async resolverSemPinoViaCnefe(companyId: number, rows: ParadaConferenciaRow[]): Promise<void> {
    const porDono = new Map<string, { alvo: AlvoCuraCnefe; linhas: ParadaConferenciaRow[] }>();
    for (const r of rows) {
      const alvo = alvoCuraCnefe(r);
      if (!alvo) continue;
      const chave = alvo.tipo === 'local' ? `l:${r.localId}` : `p:${r.customerProfileId}`;
      const entrada = porDono.get(chave);
      if (entrada) entrada.linhas.push(r);
      else porDono.set(chave, { alvo, linhas: [r] });
    }
    if (!porDono.size) return;

    const donos = [...porDono.values()].slice(0, CNEFE_CURA_TETO);
    const fim = Date.now() + CNEFE_CURA_ORCAMENTO_MS;
    let proximo = 0;
    let curados = 0;
    const trabalhador = async (): Promise<void> => {
      for (;;) {
        const i = proximo;
        proximo += 1;
        if (i >= donos.length || Date.now() >= fim) return;
        const dono = donos[i];
        const cura = await resolverCuraCnefe(dono.alvo, { queryTimeoutMs: 10000 });
        if (!cura) continue;
        const gravou = await this.gravarCuraCnefe(companyId, dono.alvo, dono.linhas[0], cura);
        if (!gravou || !cura.pino) continue;
        curados += 1;
        for (const linha of dono.linhas) aplicarPinoCnefeNaLinha(linha, dono.alvo.tipo, cura.pino);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, donos.length) }, () => trabalhador()));
    // 27/07 (incidente company 48) — loga SEMPRE que houve candidato, mesmo com 0
    // curados: "0 de 50" nos logs teria denunciado na hora o veto de via que
    // engolia a cidade inteira de rua numerada. Silêncio nunca mais.
    this.logger.log(
      `[logistica] conferência company=${companyId}: cura CNEFE resolveu ${curados} de ${donos.length} candidato(s) sem pino.`,
    );
  }

  /**
   * Grava a cura no DONO do endereço. Duas escritas independentes, cada uma com o
   * próprio guard de "só preenche buraco":
   *  - CEP descoberto → só onde o campo está VAZIO (nunca troca CEP que o dono digitou);
   *  - pino → só quando ainda não tem lat (nunca sobrescreve pino existente).
   * Corrida com outra escrita = quem chegou primeiro fica. Devolve true só quando o
   * PINO entrou (é ele que tira a parada do vermelho).
   */
  private async gravarCuraCnefe(
    companyId: number,
    alvo: AlvoCuraCnefe,
    row: ParadaConferenciaRow,
    cura: CuraCnefeResultado,
  ): Promise<boolean> {
    const noLocal = alvo.tipo === 'local' && !!row.localId;
    try {
      if (cura.cepDescoberto) {
        const onde = { companyId, OR: [{ cep: null }, { cep: '' }] };
        if (noLocal) await this.prisma.localEntrega.updateMany({ where: { id: row.localId as string, ...onde }, data: { cep: cura.cepDescoberto } });
        else await this.prisma.customerProfile.updateMany({ where: { id: row.customerProfileId, ...onde }, data: { cep: cura.cepDescoberto } });
      }
      if (!cura.pino) return false;
      const dados = { lat: cura.pino.lat, lng: cura.pino.lng, geoFonte: 'cnefe' };
      const res = noLocal
        ? await this.prisma.localEntrega.updateMany({ where: { id: row.localId as string, companyId, lat: null }, data: dados })
        : await this.prisma.customerProfile.updateMany({ where: { id: row.customerProfileId, companyId, lat: null }, data: dados });
      return res.count > 0;
    } catch (e) {
      this.logger.warn(`[logistica] cura CNEFE não gravou (segue sem pino): ${String((e as any)?.message || e)}`);
      return false;
    }
  }

  /**
   * SANITIZADOR (27/07, ordem do dono) — a correção em massa do pop-up do Gerenciador.
   * Mesmo motor da cura inline, mas em LOTE explícito: aqui o orçamento é generoso
   * (é ação do operador, não o caminho quente da geração) e o app REPETE a chamada
   * até `restantes` zerar — dono curado sai do filtro sem-pino sozinho na chamada
   * seguinte, então não precisa de cursor. `executar:false` só CLASSIFICA (placar).
   * Escreve SÓ pino de cadastro (gravarPinoCnefe) — rota/crédito intocados.
   */
  async sanitizar(
    companyId: number,
    input: { date?: string; executar?: boolean },
    entregadorId?: number,
  ): Promise<{
    alvos: number;
    curaveis: ClienteSanitizador[];
    semDados: ClienteSanitizador[];
    curados: number;
    naoEncontrado: ClienteSanitizador[];
    processados: number;
    restantes: number;
  }> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const { start, end } = resolveDayRange(input.date);
    const rows = await this.fetchParadasEstendidas(companyId, start, end, entregadorId);

    const nomeDe = (r: ParadaConferenciaRow): string =>
      r.local?.apelido ?? r.customerProfile?.name ?? 'Cliente';
    // O app lista Cliente → problema e o toque abre a FICHA: cada item vai com o
    // customerProfileId E a frase do problema. Quem escreve a frase é AQUI (o servidor
    // é quem sabe o que faltou), nunca o app chutando um rótulo por lista.
    const semDadosMap = new Map<string, ClienteSanitizador>();
    const porDono = new Map<string, { alvo: AlvoCuraCnefe; row: ParadaConferenciaRow }>();
    for (const r of rows) {
      const coord = resolverCoordenadaMultilocal(r.local, r.customerProfile);
      if (coord.lat != null && coord.lng != null) continue; // tem pino — fora do sanitizador
      const alvo = alvoCuraCnefe(r);
      if (!alvo) {
        semDadosMap.set(r.customerProfileId, { id: r.customerProfileId, nome: nomeDe(r), problema: problemaDoCadastro(r) });
        continue;
      }
      const chave = alvo.tipo === 'local' ? `l:${r.localId}` : `p:${r.customerProfileId}`;
      if (!porDono.has(chave)) porDono.set(chave, { alvo, row: r });
    }
    const donos = [...porDono.values()];
    const semDados = [...semDadosMap.values()];
    const curaveis = donos.map((d) => ({ id: d.row.customerProfileId, nome: nomeDe(d.row), problema: 'Sem localização' }));

    if (input.executar !== true) {
      return { alvos: donos.length, curaveis, semDados, curados: 0, naoEncontrado: [], processados: 0, restantes: donos.length };
    }

    // Lote e teto POR CHAMADA — o app repete até zerar; nunca uma chamada eterna.
    const LOTE = 12;
    // 27/07 — a cura SEM CEP paga 1 ida ao ViaCEP + 1-2 ao CNEFE por cliente (contra 1
    // do caminho com CEP). 20s por chamada, teto de consulta folgado: é ação explícita
    // do operador, e o app repete até a fila zerar. Apertado demais = "0 curados".
    const fim = Date.now() + 20000;
    let curados = 0;
    let processados = 0;
    const naoEncontrado: ClienteSanitizador[] = [];
    const recusa = (dono: { row: ParadaConferenciaRow }, problema: string): void => {
      naoEncontrado.push({ id: dono.row.customerProfileId, nome: nomeDe(dono.row), problema });
    };
    for (const dono of donos) {
      if (processados >= LOTE || Date.now() >= fim) break;
      processados += 1;
      const cura = await resolverCuraCnefe(dono.alvo, { queryTimeoutMs: 8000 });
      if (!cura) {
        recusa(dono, 'Endereço não achado na base');
        continue;
      }
      const gravou = await this.gravarCuraCnefe(companyId, dono.alvo, dono.row, cura);
      if (gravou) curados += 1;
      // CEP descoberto mas porta não provada: o cadastro melhorou (o CEP entrou), a
      // parada NÃO curou — e a lista diz exatamente isso, sem fingir sucesso.
      else recusa(dono, cura.cepDescoberto ? 'CEP achado, número não' : 'Endereço não achado na base');
    }
    this.logger.log(
      `[logistica] sanitizador company=${companyId}: ${curados} curado(s) de ${processados} processado(s), ${donos.length - processados} na fila.`,
    );
    return {
      alvos: donos.length,
      curaveis,
      semDados,
      curados,
      naoEncontrado,
      processados,
      restantes: donos.length - processados,
    };
  }

  // ── infra ────────────────────────────────────────────────────────────────────
  /**
   * Select PRÓPRIO — decisão registrada no relatório da S3: `fetchParadasAbertas` de
   * LogisticaRotaService é PRIVADO e alimenta o caminho que GRAVA rotaOrdem/etaAt.
   * `/rota/conferir` é uma rota READ-ONLY de diagnóstico; duplicar o select aqui
   * (ESTENDIDO com geoFonte de local/perfil + customerProfileId/localId, que o
   * planejador não precisa) evita tocar num arquivo grande que outras sprints desta
   * mesma frente (e o dono, em paralelo) já mexem — zero risco pro caminho que grava.
   * Mesmo filtro (status aberto + janela do dia) e mesma ordenação/teto (300) do
   * planejador, pra os dois lerem exatamente o mesmo "dia".
   */
  private async fetchParadasEstendidas(
    companyId: number,
    start: Date,
    end: Date,
    entregadorId?: number,
    deliveryIds?: string[],
  ): Promise<ParadaConferenciaRow[]> {
    return this.prisma.entrega.findMany({
      where: {
        companyId,
        ...(entregadorId ? { entregadorId } : {}),
        ...(deliveryIds?.length ? { id: { in: deliveryIds } } : {}),
        status: { in: [...STATUS_ABERTO] },
        OR: [{ scheduledAt: { gte: start, lte: end } }, { scheduledAt: null }],
      },
      orderBy: [{ rotaOrdem: 'asc' }, { scheduledAt: 'asc' }, { createdAt: 'asc' }],
      take: 300,
      select: {
        id: true,
        status: true,
        rotaOrdem: true,
        customerProfileId: true,
        localId: true,
        // cep/endereco/bairro/cidade/uf (26/07): colunas que JÁ existem nos dois models
        // (nenhuma migration nesta mudança) — alimentam a checagem CEP × endereço.
        local: {
          select: {
            apelido: true, lat: true, lng: true, geoFonte: true,
            cep: true, endereco: true, numero: true, bairro: true, cidade: true, uf: true,
          },
        },
        customerProfile: {
          select: {
            name: true, lat: true, lng: true, geoFonte: true,
            cep: true, endereco: true, numero: true, bairro: true, cidade: true, uf: true,
          },
        },
      },
    });
  }

  /**
   * Mesmo adaptador de LogisticaRotaService.osrmTableFetcher (privado lá — sem
   * visibilidade pra reusar de fora). Duplicado aqui de propósito: são 3 linhas, e o
   * risco de reimplementar errado é menor que o de abrir a visibilidade de um método
   * privado do serviço que GRAVA rota pra um consumidor read-only.
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
   * `nunca_entregue` barato: 1 `groupBy` contando quantas entregas 'entregue' cada
   * (cliente, local) já teve — nunca um `findFirst` por parada (N+1). Guard de array
   * vazio: `groupBy`/`in: []` com lista vazia não tem nada a agrupar.
   */
  private async contarEntreguesConcluidas(companyId: number, customerProfileIds: string[]): Promise<Set<string>> {
    if (customerProfileIds.length === 0) return new Set();
    const grupos = await this.prisma.entrega.groupBy({
      by: ['customerProfileId', 'localId'],
      where: { companyId, status: 'entregue', customerProfileId: { in: customerProfileIds } },
      _count: { _all: true },
    });
    return new Set(
      grupos.filter((g: any) => g._count._all > 0).map((g: any) => chaveHistorico(g.customerProfileId, g.localId)),
    );
  }

  /**
   * `diverge_gps_ouro` barato: 1 query com `DISTINCT ON` (Postgres) traz a ÚLTIMA
   * entrega CONCLUÍDA (maior deliveredAt) por (cliente, local) — sem isso seria 1
   * `findFirst` por parada (N+1 que o S3 explicitamente proíbe). Mesmo padrão já usado
   * em `modules.service.ts` (WebscrapingLatestUsageRow). `Prisma.join` exige array
   * não-vazio, daí o guard early-return.
   */
  private async buscarUltimaEntregaConcluida(companyId: number, customerProfileIds: string[]): Promise<Map<string, Coord>> {
    if (customerProfileIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<UltimaEntregaConcluidaRow[]>(Prisma.sql`
      SELECT DISTINCT ON ("customerProfileId", COALESCE("localId", ''))
        "customerProfileId", "localId", "deliveredLat", "deliveredLng"
      FROM "Entrega"
      WHERE "companyId" = ${companyId}
        AND "status" = 'entregue'
        AND "deliveredLat" IS NOT NULL
        AND "deliveredLng" IS NOT NULL
        AND "customerProfileId" IN (${Prisma.join(customerProfileIds)})
      ORDER BY "customerProfileId", COALESCE("localId", ''), "deliveredAt" DESC
    `);
    const mapa = new Map<string, Coord>();
    for (const row of rows) {
      if (typeof row.deliveredLat === 'number' && typeof row.deliveredLng === 'number') {
        mapa.set(chaveHistorico(row.customerProfileId, row.localId), { lat: row.deliveredLat, lng: row.deliveredLng });
      }
    }
    return mapa;
  }
}

// ── R9: cura de pino via CNEFE (helpers puros, testáveis isolados) ─────────────

/** Orçamento total da cura numa conferência — estourou, o resto fica pra próxima.
 *  27/07 (2º incidente company 48): 4s morria na 1ª consulta fria pós-deploy e o dono
 *  via "0 de 1" na tela. Gerar rota PODE pagar alguns segundos pra sanear a base
 *  (palavra do dono, 27/07: "na hora de gerar a rota, rodar essa sanitização era
 *  aceitável") — o que não pode é ficar sem pino por pressa. */
const CNEFE_CURA_ORCAMENTO_MS = 12000;
/** Teto de donos consultados por conferência (defesa contra base gigante toda sem pino). */
const CNEFE_CURA_TETO = 150;

export interface AlvoCuraCnefe {
  tipo: 'local' | 'perfil';
  /** null = cadastro SEM CEP, mas com rua+cidade+UF: o CEP se descobre pelo endereço
   *  (ViaCEP busca por rua) antes de entrar no CNEFE — ver `resolverCuraCnefe`. */
  cep: string | null;
  numero: number;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}

/**
 * A parada é elegível pra cura? Só quando NENHUMA fonte tem coordenada válida (é o
 * `sem_pino` de logo adiante) E o dono do endereço dá pra localizar: número de porta
 * MAIS (CEP) ou (rua + cidade + UF). Dono = LOCAL quando ele existe (a porta é dele —
 * pós-multilocal o endereço mora lá), senão o PERFIL. Nunca mistura campos das duas
 * fontes (mesma lei de logistica-geo-fonte.util.ts).
 *
 * 27/07 (ordem do dono, "sanitização funcional") — o 2º caminho é o que faltava:
 * cliente com endereço PERFEITO e sem CEP caía em "Sem CEP e número" e ficava vermelho
 * pra sempre. CEP não é o dado, é um atalho pro dado; faltando ele, procura-se a rua.
 */
export function alvoCuraCnefe(r: ParadaConferenciaRow): AlvoCuraCnefe | null {
  const coord = resolverCoordenadaMultilocal(r.local, r.customerProfile);
  if (coord.lat != null && coord.lng != null) return null;
  // 27/07 (incidente company 48) — o alvo é QUEM DÁ PRA LOCALIZAR: local primeiro
  // (a porta é dele), senão o PERFIL. Antes, local com endereço mas SEM CEP
  // travava a cura mesmo com o perfil completinho do lado (28 sem_pino no dia e
  // só 2 candidatos). Fonte segue INTEIRA: cep/número/endereço/cidade/UF sempre do
  // mesmo dono, e o pino é gravado nesse mesmo dono — zero Frankenstein.
  const candidatos: Array<{ tipo: 'local' | 'perfil'; cad: ParadaConferenciaRow['local'] | ParadaConferenciaRow['customerProfile'] }> = [
    ...(r.local && r.localId ? [{ tipo: 'local' as const, cad: r.local }] : []),
    ...(r.customerProfile ? [{ tipo: 'perfil' as const, cad: r.customerProfile }] : []),
  ];
  const monta = (tipo: 'local' | 'perfil', cad: NonNullable<typeof candidatos[number]['cad']>, cep: string | null, numero: number): AlvoCuraCnefe => ({
    tipo, cep, numero, endereco: cad.endereco ?? null, bairro: cad.bairro ?? null, cidade: cad.cidade ?? null, uf: cad.uf ?? null,
  });
  // 1ª passada: quem TEM CEP (caminho direto e mais barato — zero rede externa).
  for (const { tipo, cad } of candidatos) {
    if (!cad) continue;
    const cep = normalizarCep(cad.cep);
    const numero = extrairNumeroPorta(cad);
    if (!cep || !numero) continue;
    return monta(tipo, cad, cep, numero);
  }
  // 2ª passada: sem CEP em lugar nenhum, mas com endereço completo o bastante pra
  // achar a rua (rua + cidade + UF de 2 letras + número da porta).
  for (const { tipo, cad } of candidatos) {
    if (!cad) continue;
    const numero = extrairNumeroPorta(cad);
    if (!numero) continue;
    if (logradouroDoCadastro(cad.endereco).length < 3) continue;
    if (String(cad.cidade ?? '').trim().length < 3) continue;
    if (!/^[A-Za-z]{2}$/.test(String(cad.uf ?? '').trim())) continue;
    return monta(tipo, cad, null, numero);
  }
  return null;
}

/** O que a cura conseguiu apurar sobre um alvo. `pino` null com `cepDescoberto`
 *  preenchido = achou o CEP da rua mas o CNEFE não provou a porta: grava o CEP
 *  (o furo do cadastro some) e a parada segue pendente, sem mentir que curou. */
export interface CuraCnefeResultado {
  pino: CnefePino | null;
  cepDescoberto: string | null;
}

/**
 * Resolve o pino do alvo. Com CEP é o caminho de sempre (CNEFE direto). SEM CEP,
 * descobre o(s) CEP(s) da rua no ViaCEP (fail-closed: cidade e via provadas) e tenta
 * cada um no CNEFE — quem casa o NÚMERO da casa vence. É o CNEFE, não o ViaCEP, que
 * decide o pino; o ViaCEP só diz "esta rua tem estes CEPs".
 */
export async function resolverCuraCnefe(
  alvo: AlvoCuraCnefe,
  opts?: { queryTimeoutMs?: number },
): Promise<CuraCnefeResultado | null> {
  const base = { numero: alvo.numero, endereco: alvo.endereco, uf: alvo.uf };
  if (alvo.cep) {
    const pino = await resolverCnefe({ ...base, cep: alvo.cep }, opts);
    return pino ? { pino, cepDescoberto: null } : null;
  }
  // ── ESCOPO (27/07, ordem do dono, depois da pesquisa dele) ────────────────────
  // "Não existe entrega sem o endereço certo. Eu queria um sistema que limpasse
  // errinhos bobos, não que ACHASSE endereço — nem IA adivinha onde o cliente mora."
  // A auditoria dele provou o estrago da versão anterior: "Avenida 3" virava o CEP da
  // Avenida 3 do Centro quando o cliente mora na Avenida 3 SCT do São Caetano II; nº
  // 1486 recebia CEP de faixa que só atende 1601-2999 ímpar. Então, sem CEP no cadastro,
  // a cura só aceita PROVA, nas três travas abaixo — e "não sei" é resposta legítima:
  //   1. cadastro COMPLETO (rua + número + bairro). Incompleto não vira endereço válido.
  //   2. BAIRRO PREDOMINANTE: o trecho tem que bater o bairro do cadastro. A rua é
  //      AJUDANTE — é o bairro que distingue "Avenida 3" de "Avenida 3 SCT"/"3 PA".
  //   3. PORTA EXATA no Censo. Nada de vizinho de número: é aí que se inventa endereço,
  //      e é o que faz uma faixa de CEP errada passar por certa.
  if (!temBairroNoCadastro({ endereco: alvo.endereco, bairro: alvo.bairro })) return null;
  const ruas = await descobrirCepsPorEndereco({
    endereco: alvo.endereco, bairro: alvo.bairro, cidade: alvo.cidade, uf: alvo.uf,
  });
  const comBairro = ruas.filter((r) => r.bairroBate);
  if (!comBairro.length) return null;
  // 1 consulta cobrindo os trechos do bairro (nunca um laço por CEP: com 37 trechos e
  // 4s de teto por consulta, a cura morria no orçamento antes de curar alguém).
  const emLote = await resolverCnefeLote(comBairro.map((r) => r.cep), base, { ...opts, exigirPorta: true });
  return emLote ? { pino: emLote.pino, cepDescoberto: emLote.cep } : null;
}

/**
 * A frase do sanitizador pra quem NÃO dá pra localizar — o CAMPO que falta, na ordem
 * em que se resolve. Antes o app carimbava "Sem CEP e número" na lista inteira, o que
 * era mentira pra cliente com endereço perfeito e sem CEP (o caso que abriu esta
 * mudança). Diagnóstico olha as DUAS fontes: aqui não se grava nada, só se diz ao dono
 * o que digitar.
 */
export function problemaDoCadastro(r: ParadaConferenciaRow): string {
  const cadastros = [r.localId ? r.local : null, r.customerProfile].filter(
    (c): c is NonNullable<ParadaConferenciaRow['customerProfile']> => !!c,
  );
  if (!cadastros.some((c) => extrairNumeroPorta(c) != null)) return 'Falta o número da casa';
  if (!cadastros.some((c) => logradouroDoCadastro(c.endereco).length >= 3)) return 'Falta a rua';
  if (!cadastros.some((c) => String(c.cidade ?? '').trim().length >= 3)) return 'Falta a cidade';
  return 'Falta o estado (UF)';
}

/** Aplica o pino curado na linha EM MEMÓRIA (a fonte inteira, nunca campo solto) —
 *  esta mesma conferência já roda com o pino novo, sem re-consultar o banco. */
function aplicarPinoCnefeNaLinha(r: ParadaConferenciaRow, tipo: 'local' | 'perfil', pino: CnefePino): void {
  const alvoObj = tipo === 'local' ? r.local : r.customerProfile;
  if (!alvoObj) return;
  (alvoObj as { lat: number | null }).lat = pino.lat;
  (alvoObj as { lng: number | null }).lng = pino.lng;
  (alvoObj as { geoFonte: string | null }).geoFonte = 'cnefe';
}

/** Chave de junção (cliente, local) — local null vira string vazia (mesmo cliente sem
 *  LocalEntrega cadastrado, endereço do perfil/legado). Usada nos dois agregados
 *  (nunca_entregue e diverge_gps_ouro) e no map de extras — mantém as 3 pontas em sincronia. */
function chaveHistorico(customerProfileId: string, localId: string | null): string {
  return `${customerProfileId}|${localId ?? ''}`;
}

/** Tem QUALQUER coisa comparável contra o CEP? (bairro sozinho não conta — ele não entra
 *  na comparação, ver logistica-cep.util.ts). */
function temEnderecoUtil(e: EnderecoCadastrado | null): boolean {
  if (!e) return false;
  return Boolean(
    String(e.cep ?? '').trim() ||
      String(e.endereco ?? '').trim() ||
      String(e.cidade ?? '').trim() ||
      String(e.uf ?? '').trim(),
  );
}

function enderecoDe(fonte: EnderecoCadastrado | null | undefined): EnderecoCadastrado {
  return {
    cep: fonte?.cep ?? null,
    endereco: fonte?.endereco ?? null,
    numero: fonte?.numero ?? null,
    bairro: fonte?.bairro ?? null,
    cidade: fonte?.cidade ?? null,
    uf: fonte?.uf ?? null,
  };
}

/**
 * Endereço a conferir, tirado da MESMA fonte que deu o pino (`fonteEscolhidaMultilocal`)
 * — nunca o CEP de um com a rua do outro: essa mistura é o "pino Frankenstein" que
 * logistica-geo-fonte.util.ts existe pra impedir, só que em texto.
 *
 * Exceção única: a fonte escolhida (ou a ausência de fonte, quando ninguém tem pino) não
 * tem endereço NENHUM — aí cai pro perfil, que no legado é onde o endereço mora. Fonte com
 * endereço parcial NÃO cai: endereço meio preenchido do local é o endereço daquele local,
 * completar com o do perfil recriaria a mistura.
 */
function enderecoDaFonteEscolhida(row: ParadaConferenciaRow): EnderecoCadastrado {
  const escolhida = fonteEscolhidaMultilocal(row.local, row.customerProfile);
  const daFonte = escolhida === 'local' ? enderecoDe(row.local) : enderecoDe(row.customerProfile);
  if (temEnderecoUtil(daFonte)) return daFonte;
  return enderecoDe(row.customerProfile);
}

// PR18072026 (duplicado de logistica-rota.service.ts, privado lá): valida
// origemLat/Lng vindos do body — finito, dentro da faixa, nunca 0,0 (mesmo crivo do
// planejador, pra origem inválida nunca ser tratada como um ponto real no oceano).
function coordFromInput(lat?: number | null, lng?: number | null): Coord | null {
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  ) {
    return { lat, lng };
  }
  return null;
}

// Mesma normalização de logistica-rota.service.ts (privada lá): trim + tamanho + teto
// de 300 ids, dedupe via Set (ordem não importa aqui — a conferência não tem conceito
// de "ordem manual" como o planejador).
function normalizeDeliveryIds(value?: string[]): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = [
    ...new Set(value.map((id) => String(id || '').trim()).filter((id) => id.length > 0 && id.length <= 80)),
  ].slice(0, 300);
  return ids.length ? ids : undefined;
}

// S5 — duplicado de normalizeOrdemManual em logistica-rota.service.ts (privada lá,
// mesmo motivo do normalizeDeliveryIds acima: reusar o método privado obrigaria a abrir
// visibilidade num arquivo grande que o dono edita em paralelo). SEM dedupe/Set: a ORDEM
// original importa aqui (planRouteManual resolve 1ª ocorrência vence sozinho).
function normalizeOrdemManual(value?: string[]): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value.map((id) => String(id || '').trim()).filter((id) => id.length > 0 && id.length <= 80).slice(0, 500);
  return ids.length ? ids : undefined;
}

// ── tipos de I/O ────────────────────────────────────────────────────────────────
interface ParadaConferenciaRow {
  id: string;
  status: string;
  rotaOrdem: number | null;
  customerProfileId: string;
  localId: string | null;
  local: ({ apelido: string | null; lat: number | null; lng: number | null; geoFonte: string | null } & EnderecoCadastrado) | null;
  customerProfile:
    | ({ name: string | null; lat: number | null; lng: number | null; geoFonte: string | null } & EnderecoCadastrado)
    | null;
}

/** Linha do sanitizador no app: cliente + o problema JÁ em português. */
export interface ClienteSanitizador {
  id: string;
  nome: string;
  problema: string;
}

interface UltimaEntregaConcluidaRow {
  customerProfileId: string;
  localId: string | null;
  deliveredLat: number | null;
  deliveredLng: number | null;
}

export interface ConferirRotaInput {
  date?: string;
  origemLat?: number;
  origemLng?: number;
  deliveryIds?: string[];
  // S5 — ordem ATIVA no app (ver ConferirRotaDto); presente = audita ESSA ordem
  // (planRouteManual), ausente = comportamento antigo (planRouteByRoads).
  ordemManual?: string[];
}

export interface ConferirRotaParada {
  id: string;
  nome: string | null;
  /**
   * Conta/porta desta parada. 27/07 — o APK salva a sequência conferida como rota
   * salva ("Salvar rota" na montagem) e o contrato de rota-modelo é por
   * customerProfileId/localId, não por id de entrega. Sem estes dois o app teria
   * que adivinhar a porta de cliente multilocal.
   */
  customerProfileId: string | null;
  localId: string | null;
  rotaOrdem: number;
  lat: number | null;
  lng: number | null;
  etaAt: string | null;
  legDistanceM: number | null;
  legDurationS: number | null;
  semaforo: SemaforoCor;
  /** TODOS os motivos apurados, inclusive os informativos (auditoria/saúde da base). */
  motivos: MotivoConferencia[];
  /** O que o motorista VÊ: só impeditivos, em ordem de gravidade. O front lê SÓ este. */
  motivosVisiveis: MotivoConferencia[];
}

export interface ConferirRotaResult {
  date: string;
  engine: RouteEngine;
  degradedReason: RouteDegradedReason | null;
  total: number;
  /** Paradas com pelo menos 1 motivo impeditivo — o número que a tela mostra. */
  comAviso: number;
  verdes: number;
  vermelhas: number;
  distanciaTotalKm: number;
  terminoPrevisto: string | null;
  paradas: ConferirRotaParada[];
}
