(function () {
  "use strict";
  const H = window.HBX;
  // Versões anteriores armazenavam a resposta genérica de customer-profiles,
  // que também contém contatos importados pelo WhatsApp. Nunca reaproveite esse cache.
  H.cache.remove("logistica-clients");
  // 28/07 (dono, item 8) — "entrando no menu principal o mapa fica piscando com os
  // pré-carregamentos e depois limpa": o cache da rota não guardava DIA. A rota de
  // ONTEM abria a tela com as paradas no mapa e sumia assim que a resposta de HOJE
  // chegava (vazia). Cache de rota só vale pro dia operacional em que foi gravado —
  // dia diferente, o cache morre aqui e a tela nasce limpa.
  // 28/07 (dono, item 7) — carimbo de "esta rota do dia JÁ FOI ACEITA". Vive no
  // cache (sobrevive a fechar/abrir o app) porque `rotaConferencia.confirmada` é
  // só da sessão da tela: sem ele, reabrir o Gerenciador numa rota já aceita e
  // apertar Voltar DESFAZIA rota já debitada — o dono decidiu 28/07 que voltar só
  // limpa rota NÃO aceita.
  function rotaAceitaHoje() { return H.cache.get("logistica-rota-aceita-dia", "") === operationalDate(); }
  function marcarRotaAceita() { H.cache.set("logistica-rota-aceita-dia", operationalDate()); }
  function limparRotaAceita() { H.cache.remove("logistica-rota-aceita-dia"); }
  function rotaEmCache() {
    if (H.cache.get("logistica-route-dia", "") === operationalDate()) return H.cache.get("logistica-route", null);
    H.cache.remove("logistica-route");
    H.cache.remove("logistica-route-dia");
    return null;
  }
  const state = {
    screen: new URLSearchParams(window.location.search).get("screen") || "route",
    route: rotaEmCache(),
    routeSelection: H.cache.get("logistica-route-selection", null),
    products: H.cache.get("logistica-products", []),
    clients: [],
    clientsPage: 0,
    clientsTotal: 0,
    clientsTotalPages: 1,
    clientsLoading: false,
    clientsError: null,
    config: H.cache.get("logistica-config", null),
    companyName: H.cache.get("logistica-company-name", ""),
    statement: null,
    // Recarga: o shell principal mostra apenas a carteira e os pacotes. O
    // checkout vive em uma Activity/WebView isolada e devolve somente o saldo.
    recargaCatalog: null,
    recargaLoading: false,
    recargaError: null,
    creditsLock: null,
    // 28/07 (item 6) — GPS do mapa PARADO: posição atual e o endereço dela
    // (reverse geocode com freio, ver resolverEnderecoOcioso).
    // ITEM 1 (28/07) — checagem de endereços ANTES de montar a rota.
    // { dias, dates, dados, carregando, erro, removendo } | null = tela fechada.
    checagem: null,
    checagemRetorno: false,
    // "Remover da Rota" (só hoje) — customerProfileIds fora desta montagem.
    rotaExcluidos: [],
    idlePosicao: null,
    idleEndereco: null,
    idleEnderecoDetalhe: null,
    // PR — os KPIs viraram filtros clicáveis da lista de paradas (Fila/Entregue).
    routeFilter: "fila",
    // S1 25/07 (PR25072026-ROTA-CONFERIDA) — crachá do motor de rota. O resultado
    // de planejar/iniciar é persistido e revalidado contra a rota carregada para
    // o selo não desaparecer ao reabrir o app.
    routeEngine: null,
    routeDegradedReason: null,
    // 27/07 (ordem do dono) — pop-up "Correção em massa" do Gerenciador
    // S4 25/07 (PR25072026-ROTA-CONFERIDA) — estado da tela de conferência
    // (flag rotaConferidaAtiva). null = tela fechada; `abrirRotaConferencia()`
    // monta o objeto inteiro de novo a cada abertura (nunca reaproveita entre
    // sessões). Ver bloco "ROTA-CONFERIDA — S4" perto de routeEngineBanner.
    rotaConferencia: null,
    filter: "Todos",
    query: "",
    selected: null,
    modal: null,
    loading: !rotaEmCache(),
    refreshing: false,
    error: null,
    toast: null,
    screenMotion: new URLSearchParams(window.location.search).get("motion") || "",
    navMotionFrom: null,
    closingOverlay: null,
    openingOverlay: null,
    leituraStepMotion: "",
    leituraStepChanging: false,
    daySelection: [],
    dayPreview: [],
    dayPreviewEnteringIds: [],
    dayPreviewLeavingIds: [],
    daySourceDates: {},
    dayPreviewLoading: false,
    dayPreviewError: null,
    dayMode: "start",
    dayStarting: false,
    // 26/07 — abandono do fluxo de montagem (regra "só o Confirmar consolida").
    montagemAbandonada: false,
    desfazendoRota: false,
    // PR18072026 Onda 3 — passo de "modo de ordem" entre a escolha de dias e a
    // prévia/geração: null (dia-chips) → "choose" (3 cards) → "manual" (▲▼) ou
    // "saved" (lista de rota-modelos). dayOrderMode é o modo EFETIVO desta
    // montagem ("app" = fluxo automático, nunca manda ordemManual).
    dayOrderStep: null,
    dayOrderMode: "manual",
    dayManualOrder: [],
    dayManualSave: false,
    dayAgendaOrderOriginal: [],
    // S1 21/07 — contagem por dia da semana no "Por dia" vertical (S1.2):
    // { [isoDay]: n }, uma chamada em paralelo por dia de workDays() ao abrir
    // o menu; dia que falhar fica sem número (não quebra a lista).
    dayCounts: {},
    dayCountsLoaded: false,
    // Agenda semanal canônica. O APK mantém fallback para dia-preview enquanto
    // aparelhos e servidor atravessam versões diferentes.
    agenda: null,
    agendaLoading: false,
    agendaError: null,
    agendaAvailable: true,
    routeModelos: [],
    routeModelosLoading: false,
    routeModelosError: null,
    // Editor da rota salva (21/07): { id, nome, paradas, step, paradaIndex, saving }.
    // paradas = [{ customerProfileId, localId?, itens:[{productId,qtd,valorUnit}] }],
    // MESMO formato que o PATCH /logistica/rota-modelos aceita.
    routeModeloEditor: null,
    // ordem manual/salva ATIVA na rota planejada de hoje — sobrevive do
    // planejar até o "Iniciar rota" (ação separada, ver startPlannedRoute).
    // S5 25/07 (PR25072026-ROTA-CONFERIDA) — quando esta ordem vem de uma
    // APROVAÇÃO na conferência (conferencia-continuar), o objeto também carrega
    // `origem: {lat,lng}` (o ponto usado no conferir aprovado); ver
    // activeRouteOrdemManualOrigem/origemAprovadaDistanciaM.
    routeOrdemManual: H.cache.get("logistica-route-ordem-manual", null),
    clientProductDays: [],
    clientProductMode: "",
    clientProductDraft: { productId: "", qtdPadrao: "1", proximaData: "", frequenciaDias: "30", scheduledAt: "", precoAcordado: "" },
    clientProducts: [],
    clientProductsLoading: false,
    clientProductsError: null,
    clientProductEditingId: null,
    // PR — form "Novo produto / entrega" da ficha de EDIÇÃO fica oculto até o
    // operador tocar "+ Novo" ou um produto já salvo (fix do botão morto).
    clientProductFormOpen: false,
    productQuery: "",
    editProductDraft: null,
    clientDetail: null,
    clientPaymentDraft: { name: "", phone: "", cep: "", endereco: "", numero: "", bairro: "", cidade: "", uf: "", localId: "", lat: null, lng: null, geoFonte: null, limite: "", formaPagamento: "aberto", metodoPadrao: "", diaFechamento: "", observacoes: "" },
    clientCepStatus: "",
    newClientDraft: { name: "", phone: "", cpf: "", limite: "", formaPagamento: "aberto", metodoPadrao: "", diaFechamento: "", cep: "", endereco: "", numero: "", bairro: "", cidade: "", uf: "", lat: null, lng: null, geoFonte: null, observacoes: "" },
    newClientCepStatus: "",
    newClientGpsLoading: false,
    deliveryDraft: null,
    deliveryReason: "",
    deliveryNotDelivered: false,
    deliveryArrived: false,
    deliveryProductPicker: false,
    deliverySimpleDetail: false,
    // CHEGADA 22/07 (pedido do dono) — a folha virou editável na cara: qual linha
    // está trocando de produto (deliverySwapKey), qual está com o preço aberto
    // (deliveryPriceEdit) e qual entrega JÁ CONCLUÍDA está sendo reeditada pela
    // guia "Entregue" (deliveryEditingId — abre a MESMA tela da chegada).
    deliverySwapKey: null,
    deliveryPriceEdit: null,
    deliveryEditingId: null,
    // 25/07 — guard de duplo-toque: confirmDelivery espera GPS (até 8s) + rede
    // antes do som/ação de fato. Sem isso, dois toques no mesmo botão (ou em
    // "Pago"+"Entregue" quase juntos) disparavam confirmDelivery 2x e tocavam
    // som 2x. true durante a chamada em voo; false de novo no finally (sucesso
    // OU erro), pra permitir retry depois de um erro real.
    deliveryConfirming: false,
    // HISTÓRICO DO CLIENTE — {clienteId, items, loading, erro}. Carregado sob
    // demanda ao abrir o modal; nunca vive no cache junto com a rota.
    historico: null,
    nextStop: null,
    nextCountdown: 5,
    nextStopOpening: false,
    // PR20072026 (feedback dono) — pop-up "Qual o DDD?" do número sem DDD.
    dddPrompt: null,
    routePaused: H.cache.get("logistica-route-paused", false) === true,
    distanceWarning: null,
    distanceOverrideDeliveryId: null,
    confirmation: null,
    // PR20072026 W2 — Leitura de Rota (wizard GPS + fila offline). `leitura` é a
    // sessão ativa ({id, modo, startedAt, count}) — sobrevive a restart do app
    // via cache; `count` é o contador local otimista (nunca regride, ver
    // restoreLeituraSession/leitura-proximo). Estado do wizard some ao fechar.
    leitura: (() => {
      const cached = H.cache.get("logistica-leitura", null);
      return cached && cached.modo === "LEITURA" ? cached : null;
    })(),
    leituraStarting: false,
    leituraCapturing: false,
    leituraAwaitingGps: false,
    // S06 (fix 21/07) — permissão de localização pedida ANTES de iniciar a
    // GRAVAÇÃO nativa da trilha ("Iniciar Leitura de Rota"), mesmo mecanismo
    // de leituraAwaitingGps acima (ver ensureLeituraTrilhaLocationPermission).
    leituraTrilhaAwaitingGps: false,
    leituraCapture: null,
    leituraStep: null,
    leituraClientMode: null,
    leituraClienteQuery: "",
    leituraSelectedClient: null,
    leituraClienteProdutos: {},
    leituraNovoDraft: { nome: "", telefone: "", cep: "", endereco: "", numero: "", bairro: "", cidade: "", uf: "", lat: null, lng: null, geoFonte: null },
    leituraNovoEditing: false,
    // Status do lookup de CEP/geocode ao editar o endereço de um cliente novo.
    leituraNovoCepStatus: "",
    leituraTelefoneValue: "",
    leituraTelefoneConfirmado: false,
    leituraTelefoneCorrigindo: false,
    leituraItens: [],
    leituraProdutoPicker: false,
    leituraProdutoQuery: "",
    // PR20072026 (feedback dono) — passo "Observações" (última tela da parada):
    // abre o campo do cliente, 7s de contagem pra interagir (foco/toque PARA a
    // contagem e revela Salvar; sem interação, salva sozinho ao zerar).
    leituraObsDraft: "",
    leituraObsTyped: false,
    leituraObsCountdown: 7,
    leituraFinalStep: null,
    leituraResumo: null,
    leituraResumoLoading: false,
    leituraResumoError: null,
    leituraEditParadaId: null,
    leituraEditDraft: null,
    leituraDiaEscolhido: null,
    leituraNomeRota: "",
    leituraNomeError: "",
    leituraSaving: false,
    // S3 21/07 — tela viva "Leitura de rota" (state.modal === "leitura-ativa",
    // GPS ao vivo): trilha desenhada + posição atual + popup de pausa, ponte
    // com o nativo via window.HBXAndroid (contrato exato em
    // S2-CONTRATO-PONTE.md). leituraTrilha é SEMPRE ressincronizada por
    // leituraStatus() ao abrir a tela — nunca é o dado definitivo, só o
    // desenho; leituraPausaPendente é overlay GLOBAL (aparece em cima de
    // qualquer tela/modal, igual state.confirmation) porque o evento nativo
    // pode chegar com o app em qualquer lugar.
    leituraTrilha: [],
    leituraUltimaAmostra: null,
    leituraPausaPendente: null,
    // S2 21/07 (PR21072026-NAVEGAÇÃO) — trilha/posição da navegação NORMAL
    // (rota já planejada, sem app externo). Mesmo shape de ponto da Leitura
    // ({lat,lng,accuracyM,speedMps,bearingDeg}), mas alimentado por um
    // navigator.geolocation.watchPosition em JS (ver startNavWatch), não pela
    // gravação nativa em background. Sobrevive a pausa/retomada do mesmo dia;
    // encerrar rota limpa (ver performEncerrarRota/performLimparDia).
    navTrilha: [],
    navPosicao: null,
    // S3 21/07 (PR21072026-NAVEGAÇÃO) — rota viária da navegação em pernas:
    // {geometry, cortes} onde cortes é [{id, index}] (id da PARADA, não a
    // posição na lista — ver navRouteOpenPoints/recomputeNavRoute). Some no
    // mesmo ponto em que a trilha zera (encerrar rota / limpar o dia).
    navRota: null,
    // S5 21/07 (PR21072026-NAVEGAÇÃO-HBX) — voz da navegação: navMudo é a
    // preferência do motorista (persistida, sobrevive a troca de rota/dia);
    // navVoice é bookkeeping do step falado da perna atual ({epoch,
    // forStopId, stepIndex, spoken400, spoken60}), resetado por navVoiceState()
    // sempre que a perna atual muda de parada ou a rota é recalculada (mesmo
    // ponto em que navRota zera — ver performEncerrarRota/performLimparDia).
    navMudo: H.cache.get("nav-mudo", false) || false,
    navVoice: null,
    // S5 22/07 (PR22072026-APP-SOUNDS) — Central de Sons: lido 1x aqui do
    // SharedPreferences nativo via H.soundPrefs.get() (leitura SÍNCRONA pela
    // ponte, mesmo padrão de H.info()/H.offline.status() acima). state.soundPrefs
    // é só CACHE PRA PINTAR A TELA — a fonte da verdade é sempre o nativo
    // (ChegadaActivity/RotaService leem de lá direto, nunca daqui); toda
    // escrita (persistSoundPrefs) manda pro nativo e recebe de volta o que
    // realmente foi gravado, nunca confia cegamente no otimista local.
    soundPrefs: H.soundPrefs.get(),
  };
  const app = document.getElementById("app");
  let moduleActive = true;
  let clientsRequestId = 0;
  let clientsLoadObserver = null;
  let clientCepRequestId = 0;
  let clientsSearchTimer = null;
  let productsSearchTimer = null;
  let leituraObsTimer = null;
  let leituraEnderecoRequestId = 0;
  let keyboardBaselineHeight = Math.max(window.innerHeight || 0, window.visualViewport && window.visualViewport.height || 0);
  let lastKeyboardAction = { name: "", at: 0 };
  let keyboardRevealTimer = null;
  let touchStart = null;
  let clientHold = null;
  let ignoredClientClickId = null;
  let clientProductHold = null;
  let ignoredClientProductClickId = null;
  // Dias que a ficha já conheceu, por cliente (ver lembrarDiasDoCliente).
  const clientDiasMemo = new Map(Object.entries(H.cache.get("logistica-client-dias", {}) || {}));
  // Um timer por vínculo: a seta ↑↓ pinta na hora e só grava depois da pausa.
  const clientProductQtyTimers = new Map();
  let routeStopHold = null;
  let rmeParadaHold = null;
  let rmeItemHold = null;
  let routeModeloHold = null;
  let ignoredRouteStopClickId = null;
  let ignoredRmeParadaClickIndex = null;
  let ignoredRouteModeloClickId = null;
  let productHold = null;
  let ignoredProductClickId = null;
  // S3 21/07 — dois holds novos, mesmo padrão dos outros 7 (ver bloco touchstart/
  // touchmove/touchend/touchcancel abaixo): parada do resumo da leitura (tem
  // confirmação, porque já foi persistida via DELETE) e produto do passo
  // "Produto" da leitura (sem confirmação, é rascunho local igual ao rme-item).
  let lrtParadaHold = null;
  let ignoredLrtParadaClickId = null;
  let lrtItemHold = null;
  // 22/07 — 8º hold: linha do histórico do cliente (Lei 1 — excluir é segurar,
  // nunca lixeira). Tem confirmação porque a linha já está persistida no servidor.
  let historicoHold = null;
  let dayPreviewRequestId = 0;
  let navMotionTimer = null;
  let nextStopTimer = null;
  // R6 (27/07) — auto-cura do motor de rotas (retry com backoff, ver syncAutoCuraMotor).
  let motorCuraTimer = null;
  let motorCuraTentativas = 0;
  // R8 (27/07) — última carga do painel de créditos do dia (throttle 5 min).
  let creditosDiaCarregadoEm = 0;
  let routeMap = null;
  let routeMapHost = null;
  let routeMapLibraryPromise = null;
  let routeMapLayoutTimers = [];
  // S1 21/07 (PR21072026-NAVEGAÇÃO) — último fix de GPS conhecido, setado por
  // currentPosition() sempre que qualquer fluxo do app pede localização. Usado
  // pelo painel "Próxima parada" pra mostrar a distância reta até a parada sem
  // abrir um watch novo (S2 assume via watch contínuo). Sem fix ainda -> null,
  // o painel só omite a linha de distância (nunca inventa número).
  let lastKnownPosition = null;
  // S3 21/07 — mapa vivo da tela "Leitura de rota" (state.modal ===
  // "leitura-ativa"). Host PRÓPRIO ("leitura-live-map"), nunca o mesmo nó do
  // mapa da Rota — cada um com seu transplante __hbxMap (regra que já quebrou:
  // remontar o nó mata o mapa vivo).
  let leituraLiveMap = null;
  let leituraLiveMapHost = null;
  // S2 21/07 (PR21072026-NAVEGAÇÃO) — watch JS da navegação normal. Diferente
  // da Leitura (gravação nativa em background via HBXAndroid): aqui é só um
  // navigator.geolocation.watchPosition em primeiro plano, ligado/desligado
  // por navModeActive() (ver syncNavWatch, chamado a cada render()). Guardar
  // o id pra clear idempotente — nunca deixar 2 watchers vivos ao mesmo tempo
  // (regra dura do Webwhats não se aplica aqui, mas o princípio "1 watcher
  // por vez" é o mesmo). navWatchSeq muda a sessão de câmera a cada
  // (re)início do watch (fresh start ou retomada pós-pausa).
  let navWatchId = null;
  let navWatchSeq = 0;
  // 28/07 (item 6) — watch do mapa parado (ver startIdleWatch) e o freio do
  // reverse geocode do endereço mostrado nele.
  let idleWatchId = null;
  let idleEnderecoBuscando = false;
  // Balão da bolinha azul (28/07) — 1 por vez, igual toast.
  let balaoLocal = null;
  // S3 21/07 — disjuntor do recálculo de pernas (regra dura da frente): mínimo
  // 30s entre tentativas + teto de 10 por rota/dia; zera só junto com a trilha
  // (encerrar rota / limpar o dia — ver resetNavRecalcBudget).
  let navRecalcState = { count: 0, lastAt: 0 };
  let navOffPathStreak = 0;
  let navRecalcToastAt = 0;
  const roadGeometryCache = new Map();
  // ══ CONTRATO DO ÍCONE (22/07) — ler antes de encostar aqui ══
  // Este objeto guarda SÓ GEOMETRIA. Aparência (tamanho do traço, cor, pontas,
  // preenchimento) é decidida uma vez em icon() logo abaixo, pra que trocar o
  // padrão seja UMA edição que vale pro app inteiro.
  //   • grade 24×24, glifo dentro da área útil 2..22
  //   • traço 1.8, pontas/junções redondas, fill:none — SEM exceção
  //   • proibido `fill=`, `stroke=`, `stroke-width=` dentro do path daqui: quem
  //     escreve aparência no glifo se desliga do padrão pra sempre (era o caso
  //     do `stop`, que era sólido e minúsculo — virava um ponto do lado do play)
  //   • "cheio" é papel do COMPONENTE (fundo do botão), nunca do ícone
  // Base: Lucide 24. Desenhar glifo novo na mão é o que faz o conjunto
  // desandar — se faltar um, trazer o de Lucide, que já obedece esta grade.
  const paths = {
    // S2 22/07 (APK-PROFISSIONAL) — pathLength="1" nos 3 paths que a animação
    // "hbx-icon-draw" desenha (route/check/volumeOff, ver app.css): normaliza
    // o traço pro comprimento REAL de cada um. Sem isso, um `stroke-dasharray`
    // chumbado (64) servia os três com comprimentos bem diferentes e no mais
    // curto o "desenhar" virava fade.
    route: "<path d='M5 19c4-7 10-7 14-14' pathLength='1'/><circle cx='5' cy='19' r='2'/><circle cx='19' cy='5' r='2'/>",
    edit: "<path d='M12 20h9'/><path d='M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z'/>",
    users: "<path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><path d='M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8'/>",
    box: "<path d='m21 8-9 5-9-5 9-5z'/><path d='m3 8 9 5v9l9-5V8M12 13v9'/>",
    gear: "<circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1-2.8-2.8.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1 2.8-2.8.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3h4v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1 2.8 2.8-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.2v4h-.2a1.7 1.7 0 0 0-1.5 1z'/>",
    refresh: "<path d='M20 6v5h-5M4 18v-5h5'/><path d='M18 9a7 7 0 0 0-12-3L4 8m2 7a7 7 0 0 0 12 3l2-2'/>",
    moon: "<path d='M21 12.7A8.5 8.5 0 1 1 11.3 3 6.5 6.5 0 0 0 21 12.7z'/>",
    phone: "<path d='M22 17v3a2 2 0 0 1-2 2A19 19 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2L8 10a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2-.5c.8.3 1.8.6 2.8.7a2 2 0 0 1 2 2z'/>",
    wa: "<path d='M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.3A8.5 8.5 0 1 1 21 11.5z'/><path d='M8.5 8.5c.7 3 2 4.3 5 5'/>",
    map: "<polygon points='1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6'/><path d='M8 2v16M16 6v16'/>",
    plus: "<path d='M12 5v14M5 12h14'/>",
    close: "<path d='m6 6 12 12M18 6 6 18'/>",
    check: "<path d='m20 6-11 11-5-5' pathLength='1'/>",
    star: "<path d='m12 2.7 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z'/>",
    chevronLeft: "<path d='m15 18-6-6 6-6'/>",
    chevronRight: "<path d='m9 18 6-6-6-6'/>",
    // Setas ↑↓ do stepper da chegada (22/07). Trazidas do Lucide 24, como manda o
    // contrato acima — nada desenhado na mão.
    chevronUp: "<path d='m18 15-6-6-6 6'/>",
    chevronDown: "<path d='m6 9 6 6 6-6'/>",
    wallet: "<path d='M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6'/><path d='M16 13h4'/>",
    card: "<rect x='2' y='5' width='20' height='14' rx='2'/><path d='M2 10h20M6 15h4'/>",
    logout: "<path d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9'/>",
    gps: "<circle cx='12' cy='12' r='3'/><circle cx='12' cy='12' r='8'/><path d='M12 2v3M12 19v3M2 12h3M19 12h3'/>",
    search: "<circle cx='11' cy='11' r='7'/><path d='m20 20-4-4'/>",
    sales: "<path d='M4 20V10M10 20V4M16 20v-7M22 20V7'/>",
    calendar: "<rect x='3' y='5' width='18' height='16' rx='2'/><path d='M16 3v4M8 3v4M3 10h18'/>",
    lock: "<rect x='5' y='11' width='14' height='9' rx='2'/><path d='M8 11V7a4 4 0 0 1 8 0v4'/>",
    signal: "<path d='M4 20v-4M9 20v-8M14 20V9M19 20V4'/>",
    trash: "<path d='M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'/>",
    download: "<path d='M12 3v12M7 10l5 5 5-5M5 21h14'/>",
    wifi: "<path d='M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0'/><circle cx='12' cy='19.5' r='.6'/>",
    // S5 21/07 (PR21072026-NAVEGAÇÃO-HBX) — botão mudo do painel de navegação.
    volume: "<polygon points='11 5 6 9 2 9 2 15 6 15 11 19 11 5'/><path d='M15.5 8.5a5 5 0 0 1 0 7'/><path d='M18.5 5.5a9 9 0 0 1 0 13'/>",
    volumeOff: "<polygon points='11 5 6 9 2 9 2 15 6 15 11 19 11 5'/><path d='M17 9l6 6M23 9l-6 6' pathLength='1'/>",
    // S5 22/07 (PR22072026-APP-SOUNDS) — ▶ da prévia na folha "Sons" (mesmo
    // estilo outline dos demais: polygon com fill:none, igual o corpo do
    // alto-falante do ícone `volume` acima).
    // Centro ÓPTICO, não o da caixa: triângulo apontando pra direita puxa o
    // peso pro bico, então a base fica em 8 e o bico em 19,5 pro centróide cair
    // em ~12. Mesma massa do stop abaixo — os dois são o mesmo controle.
    play: "<polygon points='8 5 19.5 12 8 19'/>",
    stop: "<rect x='6' y='6' width='12' height='12' rx='2.5'/>",
    // Seta de navegação — é o que Waze e Google Maps usam pra "me leve".
    // O "map" (mapa dobrado) virou ícone de mapa ESTÁTICO no mercado e lia
    // como "ver o mapa", não como "abrir a navegação".
    navigation: "<polygon points='3 11 22 2 13 21 11 13 3 11'/>",
  };
  function icon(name, size) {
    const iconName = Object.prototype.hasOwnProperty.call(paths, name) ? name : "box";
    return `<svg class="hbx-icon" data-hbx-icon="${iconName}" width="${size || 20}" height="${size || 20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[iconName]}</svg>`;
  }
  // S2 22/07 (APK-PROFISSIONAL) — movimento é OPT-IN. Antes disparava em
  // QUALQUER toque que subisse até "button,a,[role='button'],[data-action],
  // [data-nav],[data-screen]" — ou seja, quase todo controle do app, inclusive
  // os cards de segurar-pressionado (Lei 1: excluir É o hold, nunca lixeira) e
  // qualquer toque de scroll que esbarrasse num botão. Duas linguagens de
  // gesto competindo no mesmo toque, e a que não pode perder é o hold. Agora
  // só reage a controle marcado de propósito com `data-hbx-motion` — lista
  // curta e explícita (tema, sincronizar, continuar/encerrar rota), não
  // "qualquer coisa clicável". A classe também se limpa sozinha no fim da
  // animação (animationend), nunca fica pendurada esperando o próximo toque.
  function replayIconMotion(target) {
    if (!target || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    const control = target.closest && target.closest("[data-hbx-motion]");
    if (!control) return;
    const glyph = control.matches(".hbx-icon") ? control : control.querySelector(".hbx-icon");
    if (!glyph) return;
    glyph.classList.remove("is-animating");
    glyph.addEventListener("animationend", () => glyph.classList.remove("is-animating"), { once: true });
    requestAnimationFrame(() => { if (glyph.isConnected) glyph.classList.add("is-animating"); });
  }
  function initials(name) { return String(name || "Cliente").split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase(); }
  function err(error) { return error instanceof Error ? error.message : "Não foi possível concluir."; }
  function humanApiError(error) {
    // Nunca mostrar id cru na tela: cuid (ex.: c1a2b3c4d5e6f7g8h9i0j1k2) vira uma
    // referência humana; erros conhecidos do backend ganham texto explicativo.
    const code = error && error.body && error.body.code;
    if (code === "ENTREGA_EM_OUTRA_ROTA") return "Uma entrega ficou presa em outra rota. Encerre a rota antiga ou tente montar de novo.";
    if (code === "ROTA_NOME_DUPLICADO") return "Já existe uma rota com esse nome.";
    // S4 21/07 — achado provado ao vivo (modo avião): sem `code` nenhum, a ponte
    // nativa devolve a exceção crua do Android ("Unable to resolve host…"),
    // violando a Lei 6 (erro pra humano). Sem internet é o caso mais comum de
    // erro SEM code — intercepta antes de cair no texto técnico.
    if (!netOnline()) return "Sem conexão com a internet. Verifique o Wi-Fi ou os dados móveis e tente de novo.";
    return err(error).replace(/\bc[a-z0-9]{20,}\b/g, "essa entrega");
  }
  function allRouteItems() { return state.route && Array.isArray(state.route.items) ? state.route.items : []; }
  function activeRouteSelectionIds() {
    const selection = state.routeSelection;
    if (!selection || !state.route || selection.date !== state.route.date || !Array.isArray(selection.ids) || !selection.ids.length) return null;
    return new Set(selection.ids.map(String));
  }
  function items() { const visible = allRouteItems().filter(item => item.status !== "cancelada"); const selected = activeRouteSelectionIds(); return selected ? visible.filter(item => selected.has(String(item.id))) : visible; }
  function storedRouteOrder(item) { const raw = item && item.rotaOrdem; return raw !== null && raw !== undefined && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null; }
  function orderedItems() { return items().map((item, index) => ({ item, index, order: storedRouteOrder(item) })).sort((a, b) => a.order === null && b.order === null ? a.index - b.index : a.order === null ? 1 : b.order === null ? -1 : a.order - b.order).map(row => row.item); }
  function openItems() { return orderedItems().filter(item => item.status === "agendada" || item.status === "em_rota"); }
  // Uma rota continua pronta quando já existem paradas ordenadas, mesmo que
  // uma entrega nova ainda esteja sem ordem. R10 26/07 — o atalho "ENCERRADA
  // com abertas também é pronta" (2ª leva, 17/07) MORREU: o encerrar zera a
  // ordem de TODAS as abertas no backend, então "cancelei o planejamento" e
  // "encerrei no meio da rua" chegam aqui IGUAIS — e o atalho pintava
  // "Iniciar" pra uma rota que não existe mais (dono: "após cancelar ele não
  // limpa"). Sair de novo no mesmo dia continua: montar de novo (1 toque) e o
  // claim por dia dos créditos garante que não recobra.
  function routePlanned() {
    const open = openItems();
    return open.length > 0 && open.some(item => storedRouteOrder(item) !== null);
  }
  function deliveredItems() { return items().filter(item => item.status === "entregue"); }
  function isAdmin() { return !!state.config && Object.prototype.hasOwnProperty.call(state.config, "modoRotaPadrao"); }
  // PR18072026 Módulo Financeiro — chaves operacionais que o backend defaulta
  // TRUE (aceitaNaHora/aceitaMensal/aceitaFiado/precoPorClienteAtivo). Um cache
  // local de config gravado antes deste deploy pode não ter essas chaves ainda;
  // configFlag() cobre esse vão sem depender de um refresh imediato do GET.
  const CONFIG_DEFAULT_TRUE_KEYS = new Set(["aceitaNaHora", "aceitaMensal", "aceitaFiado", "precoPorClienteAtivo"]);
  function configFlag(key) {
    const value = state.config && state.config[key];
    if (value !== undefined) return !!value;
    return CONFIG_DEFAULT_TRUE_KEYS.has(key);
  }
  function serverRouteActive() { return !!(state.route && state.route.routeStatus === "ACTIVE"); }
  function routeActive() { return serverRouteActive() && openItems().length > 0 && !state.routePaused; }
  function routeTracked() {
    // O modo só fica congelado depois que a rota realmente inicia. Antes disso,
    // a rota pronta deve acompanhar imediatamente a preferência salva no Ajustes.
    if (serverRouteActive()) return !!(state.route && state.route.trackingRequired);
    return !!(state.config && state.config.trackingDisponivel && state.config.trackingAtivo && state.config.modoRotaPadrao === "TRACKED");
  }
  function address(client) { return [client && client.endereco, [client && client.cidade, client && client.uf].filter(Boolean).join(" - ")].filter(Boolean).join(", ") || "Sem endereço cadastrado"; }
  // S3 22/07 (PR22072026-APP-SOUNDS) — gate único do funil de avisos: TODO
  // toast() passa por aqui, então uma linha cobre as dezenas de call sites do
  // arquivo de uma vez (Lei nº1 da frente, "um gate único"). `opts.mudo`
  // suprime o som genérico quando o call site JÁ tocou um som mais específico
  // (delivery_complete, proof_saved, offline_saved, route_stop…) — sem isso
  // dois sons tocam colados no mesmo toast (Lei nº4, "um evento, um som").
  // `opts.warn` reserva o degrau error>warning>success pra quando um call site
  // precisar avisar sem virar "falha" (ex.: a trava de crédito do S7) — nenhum
  // call site usa ainda, infraestrutura pronta, decisão de QUAL toast vira
  // warning fica pro S7 (não é deste sprint reclassificar toast já existente).
  // H.sound() é no-op silencioso sem bridge (preview no navegador) — nunca
  // pode derrubar o toast em si (Lei nº3, som é acessório).
  function toast(message, error, opts) {
    const options = opts || {};
    if (!options.mudo) H.sound(options.warn ? "warning" : (error ? "error" : "success"));
    state.toast = { message, error: !!error }; render(); clearTimeout(toast.timer); toast.timer = setTimeout(() => { state.toast = null; render(); }, 2600);
  }
  function validCoordinates(latValue, lngValue) { const lat = Number(latValue); const lng = Number(lngValue); return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0); }
  function routeMapPoints() { return orderedItems().map((item, index) => { const client = item.cliente || {}; const lat = Number(client.lat); const lng = Number(client.lng); return validCoordinates(lat, lng) ? { item, lat, lng, number: index + 1 } : null; }).filter(Boolean); }
  // 28/07 (dono, item 8) — GARAGEM DO MAPA. Trocar de aba (Rota → Clientes →
  // Rota) DESTRUÍA a instância maplibre e a volta recriava tudo: tiles baixando
  // de novo, "Carregando mapa…", marcadores aparecendo depois — a piscada que o
  // dono vê "ao entrar no menu principal". Agora o nó VIVO fica estacionado fora
  // da tela e volta inteiro pro lugar quando a Rota reaparece. Destruir de
  // verdade só quando o mapa muda de host (montagem) ou o app descarta.
  let mapaEstacionado = null;
  function garagemDoMapa() {
    let garagem = document.querySelector(".hbx-mapa-garagem");
    if (!garagem) {
      garagem = document.createElement("div");
      garagem.className = "hbx-mapa-garagem";
      garagem.setAttribute("aria-hidden", "true");
      document.body.appendChild(garagem);
    }
    return garagem;
  }
  function estacionarRouteMap() {
    if (!routeMap || !routeMapHost || routeMapHost.id !== "route-live-map") { disposeRouteMap(); return; }
    if (mapaEstacionado === routeMapHost) return;
    garagemDoMapa().appendChild(routeMapHost);
    mapaEstacionado = routeMapHost;
  }
  function disposeRouteMap() {
    // PR18072026 L4-D — quando de fato descartamos, limpar as marcas no
    // elemento (el.__hbxMap/__hbxMapParts) pra que o transplante do native.js
    // e o próximo mountMap nunca leiam uma instância morta como se estivesse viva.
    if (routeMapHost) {
      ((routeMapHost.__hbxMapParts && routeMapHost.__hbxMapParts.markers) || []).forEach(marker => { try { marker.remove(); } catch (_) {} });
      const currentLocationMarker = routeMapHost.__hbxMapParts && routeMapHost.__hbxMapParts.currentLocationMarker;
      if (currentLocationMarker) { try { currentLocationMarker.remove(); } catch (_) {} }
      const resizeObserver = routeMapHost.__hbxMapParts && routeMapHost.__hbxMapParts.resizeObserver;
      if (resizeObserver) { try { resizeObserver.disconnect(); } catch (_) {} }
      const resizeFrame = routeMapHost.__hbxMapParts && routeMapHost.__hbxMapParts.resizeFrame;
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      routeMapHost.__hbxMap = null;
      routeMapHost.__hbxMapParts = null;
    }
    // Item 8 — mapa estacionado na garagem morre junto (o nó sai do documento):
    // é o único jeito de o próximo mountMap saber que precisa criar um novo.
    if (mapaEstacionado) { try { mapaEstacionado.remove(); } catch (_) {} mapaEstacionado = null; }
    if (routeMap) { routeMap.remove(); routeMap = null; }
    routeMapHost = null;
  }
  function loadRouteMapLibrary() {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (routeMapLibraryPromise) return routeMapLibraryPromise;
    routeMapLibraryPromise = new Promise((resolve, reject) => {
      let timer = 0;
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (error) {
          routeMapLibraryPromise = null;
          reject(error);
        } else resolve(window.maplibregl);
      };
      if (!document.querySelector('link[data-hbx-maplibre]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "vendor/maplibre-gl.css";
        link.dataset.hbxMaplibre = "true";
        document.head.appendChild(link);
      }
      const script = document.createElement("script");
      script.src = "vendor/maplibre-gl.js";
      script.async = true;
      script.dataset.hbxMaplibre = "true";
      script.onload = () => window.maplibregl ? finish() : finish(new Error("Mapa indisponível."));
      script.onerror = () => { script.remove(); finish(new Error("Mapa indisponível.")); };
      document.head.appendChild(script);
      timer = setTimeout(() => { script.remove(); finish(new Error("Mapa indisponível.")); }, 9000);
    });
    return routeMapLibraryPromise;
  }
  function currentMapTheme() { return document.documentElement.dataset.theme === "dark" ? "dark" : "light"; }
  function currentMapStyle() { return `https://tiles.openfreemap.org/styles/${currentMapTheme() === "dark" ? "fiord" : "liberty"}`; }
  // Fase 2 C7 22/07 (APK-PROFISSIONAL) — paint de camada MapLibre é WebGL puro
  // (setPaintProperty/addLayer), NÃO aceita `var(--token)`: só DOM/CSS aceita.
  // mapPaintToken lê o valor JÁ resolvido do token no :root em runtime
  // (getComputedStyle) pra alimentar esses paints sem duplicar cor cravada.
  // Fallback é a cor antiga (em rgb(), não hex — o R6 do check-pele mira hex
  // solto; grafar o mesmo número em rgb() não reintroduz a duplicação que a
  // sprint fecha, só preserva o valor de segurança) — WebView velho sem
  // custom property, ou token ausente, devolve string vazia: cor errada é
  // ruim, camada sem cor (linha invisível) é pior.
  function mapPaintToken(name, fallback) {
    try {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value || fallback;
    } catch (_) { return fallback; }
  }
  function applyDarkMapStreetContrast(map) {
    if (currentMapTheme() !== "dark" || !map || !map.getStyle) return;
    const layers = (map.getStyle() && map.getStyle().layers) || [];
    layers.filter(layer => layer.type === "symbol" && /^highway_name/.test(layer.id)).forEach(layer => {
      try {
        // A cor antiga deste rótulo não duplicava nenhum token existente com
        // exatidão; a mais próxima no :root é --glass-ink (mesma família
        // "tinta sobre o mapa" do chip/botão de GPS) — registrado no
        // RESULTADO, não existe token dedicado a rótulo de rua.
        map.setPaintProperty(layer.id, "text-color", mapPaintToken("--glass-ink", "rgb(247,249,255)"));
        map.setPaintProperty(layer.id, "text-halo-color", "rgba(24,32,51,.96)");
        map.setPaintProperty(layer.id, "text-halo-width", 1.6);
        map.setPaintProperty(layer.id, "text-halo-blur", .35);
      } catch (_) {}
    });
  }
  // Fase 2 C7 22/07 — troca de tema (Ajustes → data-action="theme") pode
  // acontecer com o mapa da Rota/Leitura JÁ montado (instância viva sobrevive
  // à troca de tela, ver comentário do L4-D em disposeRouteMap). Sem isto a
  // trilha/pernas/precisão ficavam pintadas com a cor do tema ANTERIOR até o
  // próximo remount. setPaintProperty só nas camadas que existirem agora
  // (map.getLayer ausente lança) — a BASE de tiles (fiord/liberty) troca
  // sozinha no próprio fluxo de remount de cada mapa (mountMap já detecta
  // parts.mapTheme !== theme e chama setStyle); aqui é só a TINTA das
  // camadas próprias, pra não depender de um remount acontecer primeiro.
  function repaintThemedMapLayers() {
    const repaint = map => {
      if (!map || typeof map.getLayer !== "function") return;
      const paint = (id, prop, token, fallback) => {
        try { if (map.getLayer(id)) map.setPaintProperty(id, prop, mapPaintToken(token, fallback)); } catch (_) {}
      };
      paint("hbx-reading-trail", "line-color", "--info", "rgb(8,101,223)");
      paint("hbx-reading-accuracy", "fill-color", "--info", "rgb(22,139,232)");
      paint("hbx-reading-accuracy-outline", "line-color", "--info", "rgb(22,139,232)");
      paint("hbx-nav-leg-resto", "line-color", "--brand", "rgb(120,201,0)");
      paint("hbx-nav-leg-atual", "line-color", "--cta-to", "rgb(7,169,63)");
      paint("hbx-route-line", "line-color", "--brand", "rgb(120,201,0)");
      paint("hbx-leitura-trilha", "line-color", "--brand", "rgb(120,201,0)");
      try { applyDarkMapStreetContrast(map); } catch (_) {}
    };
    repaint(routeMap);
    repaint(leituraLiveMap);
  }
  // S4 21/07 (PR21072026-NAVEGACAO-HBX) — router.project-osrm.org é servidor de
  // DEMONSTRAÇÃO (sem SLA, pode bloquear a qualquer momento). roadGeometry e
  // roadOptimizedPoints agora tentam o backend primeiro (cache + rate-limit
  // compartilhados por empresa); QUALQUER erro (offline, 429, 502
  // OSRM_INDISPONIVEL, timeout) cai direto no público, exatamente como antes
  // desta sprint — o público nunca deixa de ser a rede de segurança.
  function osrmRouteCoordinates(payload) {
    return payload && payload.code === "Ok" && payload.routes && payload.routes[0] && payload.routes[0].geometry && payload.routes[0].geometry.coordinates;
  }
  // S5 21/07 (PR21072026-NAVEGAÇÃO-HBX) — tabela MÍNIMA de instrução (Lei 8,
  // nada além disso): turn left/right, slight, rotatória+saída, continue/new
  // name (com/sem rua) e arrive. Maneuver fora da tabela = sem instrução
  // (step descartado, não inventa copy).
  function osrmStepInstrucao(step) {
    const maneuver = (step && step.maneuver) || {};
    const type = String(maneuver.type || "");
    const modifier = String(maneuver.modifier || "");
    const rua = String((step && step.name) || "").trim();
    if (type === "arrive") return "você chegou";
    if ((type === "roundabout" || type === "rotary") && Number.isFinite(Number(maneuver.exit))) {
      return `na rotatória, pegue a ${Math.trunc(Number(maneuver.exit))}ª saída`;
    }
    if (modifier === "slight left") return "mantenha-se à esquerda";
    if (modifier === "slight right") return "mantenha-se à direita";
    if (type === "turn" && modifier === "left") return "vire à esquerda";
    if (type === "turn" && modifier === "right") return "vire à direita";
    if (type === "continue" || type === "new name") return rua ? `continue na ${rua}` : "continue";
    return null;
  }
  // {lat,lng,instrucao} por step de UMA perna (leg do OSRM) — location vem de
  // maneuver.location ([lng,lat], eixo OSRM). Steps sem instrução mapeada ou
  // sem coordenada válida somem da lista (ver osrmStepInstrucao).
  function osrmLegInstructions(leg) {
    const steps = (leg && Array.isArray(leg.steps)) ? leg.steps : [];
    return steps.map(step => {
      const instrucao = osrmStepInstrucao(step);
      const location = step && step.maneuver && step.maneuver.location;
      if (!instrucao || !Array.isArray(location) || location.length < 2) return null;
      const lng = Number(location[0]); const lat = Number(location[1]);
      return validCoordinates(lat, lng) ? { lat, lng, instrucao } : null;
    }).filter(Boolean);
  }
  async function fetchOsrmRoutePublic(key, wantSteps) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${key}?overview=full&geometries=geojson&steps=${wantSteps ? "true" : "false"}`, { signal: controller.signal });
      if (!response.ok) throw new Error("Roteamento indisponível.");
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  // wantSteps (S5): SÓ true quando quem chama está em navModeActive() (ver
  // recomputeNavRoute) — pede &steps=true pro backend/fallback público e o
  // retorno passa a ser {coordinates, legSteps} em vez do array cru de
  // coordenadas (legSteps[i] = instruções da perna i, mesma ordem de
  // `cortes` em recomputeNavRoute). Cache chaveado à parte (sufixo #steps)
  // pra nunca devolver um payload sem steps pra quem pediu com steps.
  async function roadGeometry(points, wantSteps) {
    const coordinates = points.map(point => [Number(point.lng), Number(point.lat)]).filter((point, index, rows) => index === 0 || point[0] !== rows[index - 1][0] || point[1] !== rows[index - 1][1]);
    if (coordinates.length < 2) return wantSteps ? { coordinates: [], legSteps: [] } : [];
    const key = coordinates.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(";");
    const cacheKey = wantSteps ? `${key}#steps` : key;
    if (roadGeometryCache.has(cacheKey)) return roadGeometryCache.get(cacheKey);
    let payload;
    try { payload = await H.api(`/logistica/osrm/route?coords=${encodeURIComponent(key)}${wantSteps ? "&steps=true" : ""}`); }
    catch (_) { payload = await fetchOsrmRoutePublic(key, wantSteps); }
    const routed = osrmRouteCoordinates(payload);
    if (!Array.isArray(routed) || routed.length < 2) throw new Error("Rota viária não encontrada.");
    const result = wantSteps
      ? { coordinates: routed, legSteps: ((payload.routes[0].legs) || []).map(osrmLegInstructions) }
      : routed;
    roadGeometryCache.set(cacheKey, result);
    if (roadGeometryCache.size > 12) roadGeometryCache.delete(roadGeometryCache.keys().next().value);
    return result;
  }
  async function fetchOsrmTablePublic(encoded) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`https://router.project-osrm.org/table/v1/driving/${encoded}?annotations=duration`, { signal: controller.signal });
      if (!response.ok) throw new Error("Matriz viária indisponível.");
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  async function roadOptimizedPoints(points) {
    if (points.length < 2) return points;
    const origin = await currentPosition();
    const matrixPoints = [...(origin && validCoordinates(origin.lat, origin.lng) ? [{ lat: origin.lat, lng: origin.lng }] : []), ...points];
    const offset = matrixPoints.length > points.length ? 1 : 0;
    const encoded = matrixPoints.map(point => `${Number(point.lng)},${Number(point.lat)}`).join(";");
    try {
      let payload;
      try { payload = await H.api(`/logistica/osrm/table?coords=${encodeURIComponent(encoded)}`); }
      catch (_) { payload = await fetchOsrmTablePublic(encoded); }
      const matrix = payload && payload.durations;
      if (payload.code !== "Ok" || !Array.isArray(matrix) || matrix.length !== matrixPoints.length) throw new Error("Matriz viária inválida.");
      const remaining = new Set(points.map((_, index) => index)); const order = []; let current = offset ? 0 : 0;
      if (!offset) { order.push(0); remaining.delete(0); }
      while (remaining.size) {
        let best = -1; let bestCost = Infinity;
        remaining.forEach(index => { const cost = matrix[current] && matrix[current][index + offset]; if (Number.isFinite(cost) && cost < bestCost) { best = index; bestCost = cost; } });
        if (best < 0) best = remaining.values().next().value;
        order.push(best); remaining.delete(best); current = best + offset;
      }
      const cost = sequence => { let at = offset ? 0 : sequence[0] + offset; let total = 0; for (let i = offset ? 0 : 1; i < sequence.length; i++) { const next = sequence[i] + offset; const leg = matrix[at] && matrix[at][next]; if (!Number.isFinite(leg)) return Infinity; total += leg; at = next; } return total; };
      let improved = [...order]; let bestTotal = cost(improved);
      for (let pass = 0; pass < 8; pass++) { let changed = false; for (let from = offset ? 0 : 1; from < improved.length - 1; from++) for (let to = from + 1; to < improved.length; to++) { const candidate = [...improved.slice(0, from), ...improved.slice(from, to + 1).reverse(), ...improved.slice(to + 1)]; const total = cost(candidate); if (total + .5 < bestTotal) { improved = candidate; bestTotal = total; changed = true; } } if (!changed) break; }
      return improved.map((index, position) => ({ ...points[index], number: position + 1 }));
    } catch (_) { return points; }
  }
  function dayPreviewCoordinates(client) {
    const routeItems = allRouteItems();
    const profileId = client && client.customerProfileId;
    const localId = client && client.localId;
    const routeItem = routeItems.find(item => {
      const sameProfile = profileId && [item.customerProfileId, item.cliente && item.cliente.id, item.clienteId].some(id => String(id) === String(profileId));
      const sameLocal = localId && [item.localId, item.cliente && item.cliente.localId].some(id => String(id) === String(localId));
      return sameProfile && (!localId || sameLocal || !item.localId);
    });
    const sources = [client || {}, routeItem && routeItem.cliente || {}];
    for (const source of sources) { const lat = Number(source.lat ?? source.latitude); const lng = Number(source.lng ?? source.longitude); if (validCoordinates(lat, lng)) return { item: routeItem || client, lat, lng }; }
    return null;
  }
  // PR18072026 L4-D — extraídas do corpo do mountMap pra serem reaproveitadas
  // tanto na criação (dentro do map.on("load")) quanto na atualização de um
  // mapa já vivo (sem recriar o objeto map): markers sempre podem ser
  // removidos/recriados, a linha da rota é atualizada via source.setData
  // quando já existe.
  // 28/07 (dono: "queria bonitinho saindo da rota, aquele efeito aproximando,
  // montando") — coreografia ÚNICA de entrada da tela Rota: o mapa (que nunca foi
  // destruído, ver garagemDoMapa) abre um pouco mais afastado e FECHA suave no
  // enquadramento certo. Sempre o mesmo alvo, sempre o mesmo tempo — nada de
  // zoom diferente a cada volta. Quem pediu menos movimento pula direto pro alvo.
  function animarEntradaDoMapa(map, bounds, temParadas) {
    const suave = !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const enquadrar = duracao => map.fitBounds(bounds, { padding: temParadas ? 46 : 90, maxZoom: temParadas ? 15 : 15.6, duration: duracao, essential: false });
    if (!suave) { enquadrar(0); return; }
    enquadrar(0);
    const alvo = { zoom: map.getZoom(), center: map.getCenter() };
    try {
      map.jumpTo({ center: alvo.center, zoom: Math.max(2.4, alvo.zoom - 1.25) });
      map.easeTo({ center: alvo.center, zoom: alvo.zoom, duration: 780, easing: t => 1 - Math.pow(1 - t, 3), essential: false });
    } catch (_) { enquadrar(0); }
  }
  function applyRouteMarkers(host, map, points, interactive) {
    const parts = host.__hbxMapParts || (host.__hbxMapParts = { markers: [] });
    const markerSignature = `${interactive ? "1" : "0"}#${points.map((point, index) => `${point.item && point.item.id != null ? point.item.id : index}:${point.number}:${Number(point.lat).toFixed(6)},${Number(point.lng).toFixed(6)}`).join("|")}`;
    const rebuild = parts.markerSignature !== markerSignature || (parts.markers || []).length !== points.length;
    if (rebuild) {
      (parts.markers || []).forEach(marker => { try { marker.remove(); } catch (_) {} });
      // As paradas montam uma única vez, quando a instância do mapa nasce.
      const montando = parts.animarMarcadores === true;
      parts.animarMarcadores = false;
      parts.markers = points.map((point, index) => {
        const pin = document.createElement(interactive ? "button" : "span");
        if (interactive) pin.type = "button";
        pin.className = `route-map-pin${montando ? " is-montando" : ""}`;
        pin.textContent = String(point.number);
        pin.setAttribute("aria-label", `Parada ${point.number}`);
        pin.__hbxItem = point.item;
        if (montando) pin.style.setProperty("--ordem", String(Math.min(index, 14)));
        if (interactive) pin.addEventListener("click", () => pin.__hbxItem && showSheet(pin.__hbxItem));
        return new window.maplibregl.Marker({ element: pin, anchor: "center" }).setLngLat([point.lng, point.lat]).addTo(map);
      });
      parts.markerSignature = markerSignature;
    } else {
      points.forEach((point, index) => {
        const marker = parts.markers[index];
        const pin = marker && typeof marker.getElement === "function" ? marker.getElement() : null;
        if (pin) pin.__hbxItem = point.item;
      });
    }
    const bounds = new window.maplibregl.LngLatBounds(); points.forEach(point => bounds.extend([point.lng, point.lat]));
    // S2 21/07 — nav mode também tem câmera própria (fitBounds motorista+
    // próxima parada, depois follow), então some da lista de quem pode pedir
    // o fitBounds genérico "todas as paradas" (mesma regra que já valia só
    // pra Leitura).
    const reading = interactive && host.id === "route-live-map" && !!routeLiveMode();
    // R6 (27/07, ordem do dono) — o mapa centra levando em conta a LOCALIZAÇÃO
    // do motorista: a posição conhecida entra nos bounds junto com as paradas
    // (fora dos modos vivos, que já têm câmera própria de follow).
    if (!reading && lastKnownPosition && validCoordinates(lastKnownPosition.lat, lastKnownPosition.lng)) {
      bounds.extend([lastKnownPosition.lng, lastKnownPosition.lat]);
    }
    // 🔴 28/07 (dono: "aperto voltar e parece um circo") — ESTE fitBounds rodava em
    // TODO render: toast, refresh, tick de GPS, voltar de aba… cada um reenquadrava
    // o mapa (com `duration:0` quando não havia parada = TRANCO seco). O mapa só se
    // reenquadra quando o CONJUNTO de pontos muda de verdade, ou quando a tela Rota
    // está entrando (aí é a animação de aproximar, ver animarEntradaDoMapa).
    const motoristaConhecido = lastKnownPosition && validCoordinates(lastKnownPosition.lat, lastKnownPosition.lng);
    const assinatura = `${points.map(p => `${Number(p.lat).toFixed(4)},${Number(p.lng).toFixed(4)}`).join("|")}#${motoristaConhecido ? "com-motorista" : "sem-motorista"}`;
    const precisaEnquadrar = !reading && !bounds.isEmpty() && parts.enquadradoEm !== assinatura;
    if (precisaEnquadrar) {
      parts.enquadradoEm = assinatura;
      if (parts.entradaPendente) animarEntradaDoMapa(map, bounds, points.length);
      else map.fitBounds(bounds, { padding: 42, maxZoom: 15, duration: points.length ? 420 : 0 });
    } else if (parts.entradaPendente && !bounds.isEmpty()) {
      animarEntradaDoMapa(map, bounds, points.length);
    }
    parts.entradaPendente = false;
    if (interactive && host.id === "route-live-map") updateRouteReadingMap(host, map);
  }

  // S2 21/07 (PR21072026-NAVEGAÇÃO) — o mapa da Rota tem 2 modos "ao vivo"
  // mutuamente exclusivos (navModeActive() já exclui leituraRouteActive():
  // nunca os dois juntos): "leitura" (gravação nativa em background) e "nav"
  // (rota planejada em execução, watch JS — ver startNavWatch). As funções
  // routeReading*/ensureRouteReadingUi/followRouteReadingPosition/
  // updateRouteReadingMap abaixo generalizaram pra receber esse modo; quando
  // mode==="leitura" o comportamento é IDÊNTICO ao publicado ontem (mesma
  // fonte de dados, state.leituraTrilha/leituraLiveLastPoint()).
  function routeLiveMode() {
    if (leituraRouteActive()) return "leitura";
    if (navModeActive()) return "nav";
    return null;
  }
  function routeLivePoint(mode) {
    return mode === "nav" ? state.navPosicao : mode === "leitura" ? leituraLiveLastPoint() : null;
  }
  function routeLiveTrailSource(mode) {
    return mode === "nav" ? (state.navTrilha || []) : (state.leituraTrilha || []);
  }
  function routeReadingTrailData(mode) {
    const coordinates = routeLiveTrailSource(mode || "leitura")
      .map(point => Array.isArray(point) ? [Number(point[1]), Number(point[0])] : null)
      .filter(point => point && validCoordinates(point[1], point[0]));
    return coordinates.length >= 2
      ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }
      : null;
  }
  function routeReadingAccuracyData(point) {
    const radius = Number(point && point.accuracyM);
    if (!point || !Number.isFinite(radius) || radius <= 0) return { type: "FeatureCollection", features: [] };
    const latStep = radius / 111320;
    const lngScale = Math.max(.08, Math.cos(Number(point.lat) * Math.PI / 180));
    const lngStep = radius / (111320 * lngScale);
    const ring = [];
    for (let i = 0; i <= 48; i++) {
      const angle = i / 48 * Math.PI * 2;
      ring.push([Number(point.lng) + Math.cos(angle) * lngStep, Number(point.lat) + Math.sin(angle) * latStep]);
    }
    return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
  }
  function routeReadingBearing(point, mode) {
    const nativeBearing = point && point.bearingDeg;
    if (nativeBearing != null && Number.isFinite(Number(nativeBearing))) return (Number(nativeBearing) % 360 + 360) % 360;
    const trail = routeLiveTrailSource(mode || "leitura");
    if (trail.length < 2) return null;
    const a = trail[trail.length - 2]; const b = trail[trail.length - 1];
    if (!Array.isArray(a) || !Array.isArray(b) || !validCoordinates(a[0], a[1]) || !validCoordinates(b[0], b[1])) return null;
    if (distanceMeters({ lat: Number(a[0]), lng: Number(a[1]) }, { lat: Number(b[0]), lng: Number(b[1]) }) < 4) return null;
    const lat1 = Number(a[0]) * Math.PI / 180; const lat2 = Number(b[0]) * Math.PI / 180;
    const dLng = (Number(b[1]) - Number(a[1])) * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  function removeRouteReadingLayers(map) {
    ["hbx-reading-trail", "hbx-reading-trail-casing", "hbx-reading-accuracy-outline", "hbx-reading-accuracy"].forEach(id => {
      try { if (map.getLayer(id)) map.removeLayer(id); } catch (_) {}
    });
    ["hbx-reading-trail", "hbx-reading-accuracy"].forEach(id => {
      try { if (map.getSource(id)) map.removeSource(id); } catch (_) {}
    });
  }
  function raiseRouteReadingTrail(map) {
    try { if (map.getLayer("hbx-reading-trail-casing")) map.moveLayer("hbx-reading-trail-casing"); } catch (_) {}
    try { if (map.getLayer("hbx-reading-trail")) map.moveLayer("hbx-reading-trail"); } catch (_) {}
  }
  function syncRouteReadingFollowUi(parts) {
    if (!parts || !parts.followControl) return;
    const mode = routeLiveMode();
    const point = routeLivePoint(mode) || state.idlePosicao || lastKnownPosition;
    const available = !!point && validCoordinates(point.lat, point.lng);
    const following = !!mode && parts.following !== false;
    parts.followControl.classList.toggle("is-following", following);
    parts.followControl.disabled = !available;
    if (mode) parts.followControl.setAttribute("aria-pressed", following ? "true" : "false");
    else parts.followControl.removeAttribute("aria-pressed");
    parts.followControl.setAttribute("aria-label", available ? "Recentralizar na minha localização" : "Aguardando localização para recentralizar");
  }
  function followRouteReadingPosition(host, map, parts, point, resetZoom, mode) {
    if (!point || parts.following === false) return;
    const bearing = routeReadingBearing(point, mode);
    const speed = Number(point.speedMps);
    const moving = Number.isFinite(speed) && speed >= 1.8 && Number.isFinite(bearing);
    const first = !parts.followCameraInitialized;
    const options = {
      center: [point.lng, point.lat],
      offset: [0, Math.round(Math.min(54, Math.max(22, host.clientHeight * .1)))],
      duration: first ? 620 : 820,
      essential: false,
    };
    if (first || resetZoom || Number(map.getZoom()) < 15) options.zoom = resetZoom ? Math.max(Number(map.getZoom()) || 0, 16.6) : 16.6;
    if (moving) { options.bearing = bearing; options.pitch = 36; }
    else if (first || resetZoom) { options.bearing = 0; options.pitch = 0; }
    try { map.easeTo(options); parts.followCameraInitialized = true; } catch (_) {}
  }
  // S2 21/07 — câmera de abertura da navegação: motorista + próxima parada
  // num fitBounds só, ANTES do follow tomar conta (spec S2 #2, "Câmera").
  // Sem next com coordenada válida, devolve false e o follow de sempre
  // (single-point, zoom 16.6) cobre o enquadramento.
  function navInitialFitBounds(map, point) {
    const next = openItems()[0];
    const client = next && next.cliente || {};
    if (!point || !validCoordinates(client.lat, client.lng)) return false;
    try {
      const bounds = new window.maplibregl.LngLatBounds();
      bounds.extend([point.lng, point.lat]);
      bounds.extend([Number(client.lng), Number(client.lat)]);
      map.fitBounds(bounds, { padding: 64, maxZoom: 16, duration: 500 });
      return true;
    } catch (_) { return false; }
  }
  function ensureGpsStatusEl(host, parts) {
    if (!parts.gpsStatus) {
      parts.gpsStatus = document.createElement("span");
      parts.gpsStatus.className = "route-gps-status";
      host.appendChild(parts.gpsStatus);
    }
    return parts.gpsStatus;
  }
  function ensureRouteRecenterControl(host, map, parts) {
    if (!parts.followControl) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "route-follow-control";
      button.innerHTML = icon("gps", 20);
      if (host.id) button.setAttribute("aria-controls", host.id);
      button.addEventListener("pointerdown", event => event.stopPropagation());
      button.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation();
        const mode = routeLiveMode();
        const point = routeLivePoint(mode) || state.idlePosicao || lastKnownPosition;
        if (!point || !validCoordinates(point.lat, point.lng)) return;
        if (mode) {
          parts.following = true;
          followRouteReadingPosition(host, map, parts, point, true, mode);
        } else {
          try {
            map.easeTo({
              center: [point.lng, point.lat],
              zoom: Math.max(Number(map.getZoom()) || 0, 16.6),
              bearing: 0,
              pitch: 0,
              duration: 620,
              essential: false,
            });
          } catch (_) {}
        }
        syncRouteReadingFollowUi(parts);
        H.vibrate(10);
      });
      host.appendChild(button);
      parts.followControl = button;
    }
    syncRouteReadingFollowUi(parts);
    return parts.followControl;
  }
  // 28/07 (dono, item 6) — "o status parado do mapa sempre vai pontuar onde você
  // está, e o seu endereço; dessa forma eu sei que o GPS tá ok". Sem rota rodando
  // não há trilha, follow nem câmera perseguindo ninguém: fica o MESMO ponto azul
  // da navegação + a MESMA faixa .route-gps-status (padronizar é IGUALAR), só que
  // escrevendo o endereço de onde o aparelho está.
  function updateMapaOcioso(host, map, parts) {
    removeRouteReadingLayers(map);
    parts.readingSessionId = null; parts.followCameraInitialized = false; parts.following = true;
    host.classList.remove("is-reading-route");
    const status = ensureGpsStatusEl(host, parts);
    ensureRouteRecenterControl(host, map, parts);
    const point = state.idlePosicao;
    if (!point || !validCoordinates(point.lat, point.lng)) {
      if (parts.currentLocationMarker) { try { parts.currentLocationMarker.remove(); } catch (_) {} }
      parts.currentLocationMarker = null;
      status.textContent = gpsChipClass() === "is-off" ? "GPS desligado" : "Buscando GPS…";
      return;
    }
    if (parts.currentLocationMarker) {
      parts.currentLocationMarker.setLngLat([point.lng, point.lat]);
    } else {
      const dot = document.createElement("span");
      dot.className = "route-current-location";
      dot.innerHTML = '<i class="route-current-heading" aria-hidden="true"></i><i class="route-current-core" aria-hidden="true"></i>';
      dot.setAttribute("role", "img");
      dot.setAttribute("aria-label", "Sua localização atual");
      parts.currentLocationMarker = new window.maplibregl.Marker({ element: dot, anchor: "center", rotationAlignment: "map", pitchAlignment: "map" }).setLngLat([point.lng, point.lat]).addTo(map);
    }
    const markerElement = parts.currentLocationMarker.getElement && parts.currentLocationMarker.getElement();
    if (markerElement) markerElement.classList.remove("has-heading");
    ligarToqueNaBolinha(host, parts, map);
    const precisao = Number(point.accuracyM);
    const metros = Number.isFinite(precisao) && precisao > 0 ? ` · ±${Math.round(precisao)} m` : "";
    const endereco = state.idleEndereco && state.idleEndereco.texto ? state.idleEndereco.texto : "";
    // Corte no JS: dentro de um flex o text-overflow não pega o nó de texto.
    const curto = endereco.length > 38 ? `${endereco.slice(0, 37).trimEnd()}…` : endereco;
    status.textContent = `Você · ${curto || "Localização atual"}${metros}`;
    // Mapa SEM parada nenhuma não tem o que enquadrar: centraliza em você UMA vez
    // (mesma chave de enquadramento do applyRouteMarkers — os dois nunca disputam
    // a câmera; disputa de câmera é metade do "circo" que o dono viu).
    if (!routeMapPoints().length && parts.enquadradoEm !== "#eu") {
      parts.enquadradoEm = "#eu";
      try { map.easeTo({ center: [point.lng, point.lat], zoom: Math.max(Number(map.getZoom()) || 0, 15.6), duration: 620, essential: false }); } catch (_) {}
    }
  }
  // 28/07 (dono) — BALÃO DA BOLINHA AZUL: toque no ponto abre um cartãozinho preso
  // nele com a rua certinha onde o pino está e o bairro (em cidade de rua numerada,
  // "estou na Três Nv ou na Três Dv?" é pergunta de verdade). Só DADO em linha
  // (Lei nº8): rua, bairro, cidade/UF e a precisão do GPS.
  function balaoLocalHtml(point) {
    const endereco = (state.idleEndereco && state.idleEndereco.texto) || "";
    const detalhe = state.idleEnderecoDetalhe || {};
    const precisao = Number(point && point.accuracyM);
    const linhaPrecisao = Number.isFinite(precisao) && precisao > 0 ? `±${Math.round(precisao)} m` : "";
    const rua = detalhe.endereco || endereco || "";
    const bairro = detalhe.bairro || "";
    const cidade = [detalhe.cidade, detalhe.uf].filter(Boolean).join("/");
    const rodape = [cidade, linhaPrecisao].filter(Boolean).join(" · ");
    if (!rua && !bairro && !cidade) return `<strong>Estou aqui</strong><span>Procurando o endereço…</span>${linhaPrecisao ? `<small>${H.escape(linhaPrecisao)}</small>` : ""}`;
    return `<strong>${H.escape(rua || "Estou aqui")}</strong>${bairro ? `<span>${H.escape(bairro)}</span>` : ""}${rodape ? `<small>${H.escape(rodape)}</small>` : ""}`;
  }
  function abrirBalaoLocal(map, point) {
    if (!map || !point || !window.maplibregl) return;
    H.vibrate(8);
    if (balaoLocal) { try { balaoLocal.remove(); } catch (_) {} balaoLocal = null; }
    balaoLocal = new window.maplibregl.Popup({ closeButton: false, closeOnClick: true, offset: 22, className: "hbx-balao", maxWidth: "260px" })
      .setLngLat([point.lng, point.lat])
      .setHTML(`<div class="hbx-balao-corpo">${balaoLocalHtml(point)}</div>`)
      .addTo(map);
    // Endereço ainda não resolvido (ou velho): pede AGORA e repinta o balão aberto.
    void resolverEnderecoOcioso(point, true);
  }
  function atualizarBalaoLocal() {
    if (!balaoLocal || !balaoLocal.isOpen || !balaoLocal.isOpen()) return;
    const point = state.idlePosicao || routeLivePoint(routeLiveMode());
    if (point) balaoLocal.setHTML(`<div class="hbx-balao-corpo">${balaoLocalHtml(point)}</div>`);
  }
  function ligarToqueNaBolinha(host, parts, map) {
    const element = parts.currentLocationMarker && parts.currentLocationMarker.getElement && parts.currentLocationMarker.getElement();
    if (!element || element.__hbxBalaoBound) return;
    element.__hbxBalaoBound = true;
    element.style.cursor = "pointer";
    element.addEventListener("click", event => {
      event.preventDefault(); event.stopPropagation();
      const point = state.idlePosicao || routeLivePoint(routeLiveMode());
      if (point) abrirBalaoLocal(map, point);
    });
  }
  function ensureRouteReadingUi(host, map, parts, mode, point) {
    const liveMode = mode || routeLiveMode();
    const sessionId = liveMode === "nav" ? `nav:${navWatchSeq}` : String(state.leitura && state.leitura.id || "");
    const isNewSession = parts.readingSessionId !== sessionId;
    if (isNewSession) {
      parts.readingSessionId = sessionId;
      parts.following = true;
      parts.followCameraInitialized = false;
    }
    ensureGpsStatusEl(host, parts);
    // O mesmo controle permanece no mapa parado: no modo vivo religa o follow;
    // fora dele faz uma recentralização única, sem a câmera perseguir o motorista.
    ensureRouteRecenterControl(host, map, parts);
    if (!parts.readingInteractionBound) {
      const detach = event => {
        if (!routeLiveMode() || !event || !event.originalEvent) return;
        parts.following = false;
        syncRouteReadingFollowUi(parts);
      };
      map.on("dragstart", detach);
      map.on("zoomstart", detach);
      map.on("rotatestart", detach);
      map.on("pitchstart", detach);
      parts.readingInteractionBound = true;
    }
    host.classList.add("is-reading-route");
    // Sessão de NAVEGAÇÃO nova: 1x fitBounds(motorista + próxima parada)
    // antes do follow (spec S2 #2). A Leitura não entra aqui — não tem
    // "próxima parada", desenha só a trilha andada (comportamento intocado).
    if (isNewSession && liveMode === "nav" && point && navInitialFitBounds(map, point)) parts.followCameraInitialized = true;
    syncRouteReadingFollowUi(parts);
  }
  function ensureRouteMapResizeGuard(host, map) {
    const parts = host.__hbxMapParts || (host.__hbxMapParts = { markers: [] });
    let observerCreated = false;
    if (!parts.resizeObserver && "ResizeObserver" in window) {
      parts.resizeObserver = new ResizeObserver(() => {
        if (parts.resizeFrame) cancelAnimationFrame(parts.resizeFrame);
        parts.resizeFrame = requestAnimationFrame(() => {
          parts.resizeFrame = null;
          if (host.__hbxMap === map && typeof map.resize === "function") { try { map.resize(); } catch (_) {} }
        });
      });
      parts.resizeObserver.observe(host);
      observerCreated = true;
    }
    if (observerCreated || !("ResizeObserver" in window)) {
      requestAnimationFrame(() => {
        if (host.__hbxMap === map && typeof map.resize === "function") { try { map.resize(); } catch (_) {} }
      });
    }
  }
  function updateRouteReadingMap(host, map, options) {
    const parts = host.__hbxMapParts || (host.__hbxMapParts = { markers: [] });
    const mode = routeLiveMode();
    const point = routeLivePoint(mode);
    // 28/07 (dono, item 6) — parado NÃO é mapa mudo: mostra você e o seu endereço.
    if (!mode) { updateMapaOcioso(host, map, parts); return; }
    if (typeof map.isStyleLoaded === "function" && !map.isStyleLoaded()) return;
    ensureRouteReadingUi(host, map, parts, mode, point);
    const trailData = routeReadingTrailData(mode);
    if (trailData) {
      const trailSource = map.getSource("hbx-reading-trail");
      if (trailSource) trailSource.setData(trailData);
      else {
        map.addSource("hbx-reading-trail", { type: "geojson", data: trailData });
        map.addLayer({ id: "hbx-reading-trail-casing", type: "line", source: "hbx-reading-trail", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "rgba(255,255,255,.92)", "line-width": 9, "line-opacity": .94 } });
        map.addLayer({ id: "hbx-reading-trail", type: "line", source: "hbx-reading-trail", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": mapPaintToken("--info", "rgb(8,101,223)"), "line-width": 5, "line-opacity": .96 } });
      }
    } else {
      ["hbx-reading-trail", "hbx-reading-trail-casing"].forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
      if (map.getSource("hbx-reading-trail")) map.removeSource("hbx-reading-trail");
    }
    const accuracyData = routeReadingAccuracyData(point);
    const accuracySource = map.getSource("hbx-reading-accuracy");
    if (accuracySource) accuracySource.setData(accuracyData);
    else {
      map.addSource("hbx-reading-accuracy", { type: "geojson", data: accuracyData });
      // Este azul de precisão (mais claro) não era o mesmo tom cravado da
      // trilha (mais escuro) mas é da mesma família — sem token dedicado pro
      // tom mais claro, converge no --info existente (mais próximo do
      // :root), registrado no RESULTADO.
      map.addLayer({ id: "hbx-reading-accuracy", type: "fill", source: "hbx-reading-accuracy", paint: { "fill-color": mapPaintToken("--info", "rgb(22,139,232)"), "fill-opacity": .12 } });
      map.addLayer({ id: "hbx-reading-accuracy-outline", type: "line", source: "hbx-reading-accuracy", paint: { "line-color": mapPaintToken("--info", "rgb(22,139,232)"), "line-width": 1.5, "line-opacity": .3 } });
    }
    raiseRouteReadingTrail(map);
    if (!point) {
      if (parts.currentLocationMarker) { try { parts.currentLocationMarker.remove(); } catch (_) {} }
      parts.currentLocationMarker = null;
      parts.gpsStatus.textContent = "Buscando GPS…";
      return;
    }
    const bearing = routeReadingBearing(point, mode);
    if (parts.currentLocationMarker) {
      parts.currentLocationMarker.setLngLat([point.lng, point.lat]);
    } else {
      const dot = document.createElement("span");
      dot.className = "route-current-location";
      dot.innerHTML = '<i class="route-current-heading" aria-hidden="true"></i><i class="route-current-core" aria-hidden="true"></i>';
      dot.setAttribute("role", "img");
      dot.setAttribute("aria-label", "Sua localização atual");
      parts.currentLocationMarker = new window.maplibregl.Marker({ element: dot, anchor: "center", rotationAlignment: "map", pitchAlignment: "map" }).setLngLat([point.lng, point.lat]).addTo(map);
    }
    const markerElement = parts.currentLocationMarker.getElement && parts.currentLocationMarker.getElement();
    if (markerElement) markerElement.classList.toggle("has-heading", Number.isFinite(bearing));
    ligarToqueNaBolinha(host, parts, map);
    if (Number.isFinite(bearing) && typeof parts.currentLocationMarker.setRotation === "function") parts.currentLocationMarker.setRotation(bearing);
    const accuracy = Number(point.accuracyM);
    parts.gpsStatus.textContent = Number.isFinite(accuracy) && accuracy > 0 ? `GPS · ±${Math.round(accuracy)} m` : "GPS ativo";
    if ((options && options.moveCamera) || !parts.followCameraInitialized) followRouteReadingPosition(host, map, parts, point, !!(options && options.resetZoom), mode);
  }
  function collapseMapAttribution(host) {
    requestAnimationFrame(() => {
      const attribution = host && host.querySelector(".maplibregl-ctrl-attrib.maplibregl-compact");
      if (!attribution) return;
      attribution.open = false;
      attribution.removeAttribute("open");
      attribution.classList.remove("maplibregl-compact-show");
    });
  }
  // ==========================================================================
  // S3 21/07 (PR21072026-NAVEGAÇÃO) — pernas da rota em 3 cores: percorrido
  // (trilha azul, já existente), perna ATUAL (esmeralda, do motorista até a
  // próxima parada aberta roteável) e RESTANTE (limão apagado). state.navRota
  // {geometry, cortes} vem de UMA chamada roadGeometry(motorista → paradas
  // abertas com coordenadas válidas, na ordem do backend); cortes é
  // [{id, index}] — chaveado pelo ID da parada, não pela posição na lista, de
  // propósito: "avançar de perna" ao confirmar entrega (S3 #2) normalmente só
  // relê o corte da nova primeira parada aberta no MESMO cortes, sem chamar o
  // OSRM de novo. Só pede rota nova quando aparece uma parada com ID que o
  // cortes atual não conhece (1ª ativação, ou parada nova no meio do
  // dia) ou quando o disjuntor de "saiu do caminho" dispara (S3 #4). Ordem
  // final das camadas de paint: hbx-nav-leg-resto < hbx-nav-leg-atual(+casing)
  // < hbx-reading-trail(+casing) — raiseRouteReadingTrail (já existente,
  // compartilhado com a Leitura) sempre traz a trilha pro topo por cima
  // delas; marcador é DOM (Marker), sempre acima de qualquer layer de canvas.
  // ==========================================================================
  function navRouteOpenPoints() {
    return openItems().map(item => {
      const client = item.cliente || {};
      return validCoordinates(client.lat, client.lng) ? { id: item.id, lat: Number(client.lat), lng: Number(client.lng) } : null;
    }).filter(Boolean);
  }
  function navRoutePointsSignature(points) {
    const route = state.route || {};
    const identity = `${route.routeId || ""}:${route.date || ""}`;
    return `${identity}|${points.map((point, index) => `${index}:${String(point.id)}:${Number(point.lat).toFixed(6)},${Number(point.lng).toFixed(6)}`).join("|")}`;
  }
  function navCurrentLegCutIndex() {
    const rota = state.navRota;
    if (!rota || !Array.isArray(rota.cortes)) return null;
    const first = navRouteOpenPoints()[0];
    if (!first) return null;
    const entry = rota.cortes.find(corte => String(corte.id) === String(first.id));
    return entry ? entry.index : null;
  }
  // S5 21/07 — steps (instruções) da perna ATUAL: legSteps é paralelo a
  // `cortes` (mesma ordem de waypoints da chamada OSRM em recomputeNavRoute),
  // então a POSIÇÃO do corte da 1ª parada aberta no array `cortes` é o índice
  // da perna em `legSteps` (não o `id`, que é só chave de busca).
  function navCurrentLegSteps() {
    const rota = state.navRota;
    if (!rota || !Array.isArray(rota.cortes) || !Array.isArray(rota.legSteps)) return [];
    const first = navRouteOpenPoints()[0];
    if (!first) return [];
    const position = rota.cortes.findIndex(corte => String(corte.id) === String(first.id));
    return position >= 0 ? (rota.legSteps[position] || []) : [];
  }
  // Painel S1 (distância da linha 2): soma distanceMeters ponto-a-ponto da
  // geometria até o corte da perna atual. null = sem rota viária ainda
  // (chamador cai pro fallback reta, spec "Fallback: reta").
  function navLegAtualMeters() {
    const rota = state.navRota;
    const cut = navCurrentLegCutIndex();
    if (!rota || !Number.isFinite(cut) || cut < 1) return null;
    let total = 0;
    for (let i = 1; i <= cut; i++) total += distanceMeters({ lat: rota.geometry[i - 1][1], lng: rota.geometry[i - 1][0] }, { lat: rota.geometry[i][1], lng: rota.geometry[i][0] });
    return total;
  }
  // S5 21/07 — bookkeeping do step falado da perna atual (state.navVoice:
  // {epoch, forStopId, stepIndex, spoken400, spoken60}). Ressincroniza
  // (zera stepIndex/marcações) sempre que a perna muda de parada-alvo
  // (avanço sem recompute — S3 #2) OU o voiceEpoch muda (recompute — S3 #4/
  // 1ª ativação): "Recálculo (S3) → refaz steps e zera marcações" (spec S5 #3).
  // Chamada tanto pela leitura (render, navActiveVoiceStep) quanto pelo tick
  // que fala (processNavVoice) — idempotente, sem efeito colateral visível.
  function navVoiceState() {
    const rota = state.navRota;
    const first = navRouteOpenPoints()[0];
    const forStopId = first ? String(first.id) : null;
    const epoch = (rota && rota.voiceEpoch) || 0;
    const voice = state.navVoice;
    if (!voice || voice.forStopId !== forStopId || voice.epoch !== epoch) {
      state.navVoice = { epoch, forStopId, stepIndex: 0, spoken400: false, spoken60: false };
    }
    return state.navVoice;
  }
  // Leitura pro painel/banner (linha 2): step ativo + distância reta até ele
  // via lastKnownPosition (mesmo padrão de fallback do painel, sem exigir um
  // fix novo). null = sem step à frente (banner cai pro endereço).
  function navActiveVoiceStep() {
    if (!navModeActive()) return null;
    const steps = navCurrentLegSteps();
    if (!steps.length) return null;
    const voice = navVoiceState();
    const step = steps[voice.stepIndex];
    if (!step || !lastKnownPosition) return null;
    return { instrucao: step.instrucao, distanceM: distanceMeters(lastKnownPosition, { lat: step.lat, lng: step.lng }) };
  }
  // Disparo de voz por distância (spec S5 #3): fala cada step 2x — ~400m
  // ("Em 400 metros, {instrução}") e ~60m ("{instrução}"), cada limiar só 1x
  // (marcação em state.navVoice). "Passou do step" é aproximado por chegar a
  // ~40m do ponto da manobra — aí avança pro próximo step da perna (índice
  // seguinte, marcações zeradas). Mudo (state.navMudo) segura só o H.speak —
  // o avanço de step continua acontecendo (o banner não pode travar num step
  // antigo só porque a voz está muda). Chamado a cada fix do watch
  // (startNavWatch) e imediatamente depois que o OSRM termina de montar os
  // steps: o primeiro fix não pode tentar falar cedo demais e depender de um
  // segundo movimento do aparelho para finalmente anunciar a manobra.
  function processNavVoice(point) {
    if (!navModeActive()) return;
    const steps = navCurrentLegSteps();
    if (!steps.length) return;
    const voice = navVoiceState();
    const step = steps[voice.stepIndex];
    if (!step) return;
    const distanceM = distanceMeters(point, { lat: step.lat, lng: step.lng });
    if (!state.navMudo) {
      if (distanceM <= 400 && !voice.spoken400) { voice.spoken400 = true; H.speak(`Em 400 metros, ${step.instrucao}`); }
      if (distanceM <= 60 && !voice.spoken60) { voice.spoken60 = true; H.speak(step.instrucao); }
    }
    if (distanceM <= 40) { voice.stepIndex += 1; voice.spoken400 = false; voice.spoken60 = false; }
  }
  function nearestGeometryIndex(geometry, stop) {
    let bestIndex = 0; let bestDist = Infinity;
    for (let i = 0; i < geometry.length; i++) {
      const dist = distanceMeters({ lat: geometry[i][1], lng: geometry[i][0] }, stop);
      if (dist < bestDist) { bestDist = dist; bestIndex = i; }
    }
    return bestIndex;
  }
  // Projeção local plana (metros por grau na latitude do ponto A do segmento)
  // — precisa o bastante pra ruas curtas; evita 2 haversine por segmento num
  // loop rodado a cada fix de GPS (checkNavOffPath varre a perna inteira).
  function pointToSegmentMeters(point, a, b) {
    const latM = 111320; const lngM = 111320 * Math.max(.05, Math.cos(a.lat * Math.PI / 180));
    const px = (point.lng - a.lng) * lngM; const py = (point.lat - a.lat) * latM;
    const bx = (b.lng - a.lng) * lngM; const by = (b.lat - a.lat) * latM;
    const lenSq = bx * bx + by * by;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / lenSq)) : 0;
    const dx = px - bx * t; const dy = py - by * t;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function distanceToPolylineMeters(point, coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
    let best = Infinity;
    for (let i = 1; i < coordinates.length; i++) {
      const a = { lat: coordinates[i - 1][1], lng: coordinates[i - 1][0] };
      const b = { lat: coordinates[i][1], lng: coordinates[i][0] };
      const dist = pointToSegmentMeters(point, a, b);
      if (dist < best) best = dist;
    }
    return Number.isFinite(best) ? best : null;
  }
  // Pede motorista→paradas abertas de uma vez (mesma roadGeometry/cache do
  // resto do app) e recorta os cortes por ID. NUNCA reordena `stops` — a
  // ordem já chega do backend via openItems()/navRouteOpenPoints().
  async function recomputeNavRoute(stops) {
    const origin = state.navPosicao;
    if (!origin || !validCoordinates(origin.lat, origin.lng) || !stops.length) return false;
    const session = navWatchSeq;
    const stopsSignature = navRoutePointsSignature(stops);
    try {
      // S5 21/07 — steps=true SÓ em navegação ativa (spec S5 #6): fora disso
      // o payload cresceria à toa (roadGeometry aceita o 2º arg em qualquer
      // chamador, mas só quem monta a perna atual da navegação passa true).
      const result = await roadGeometry([{ lat: origin.lat, lng: origin.lng }, ...stops], navModeActive());
      if (!navModeActive() || navWatchSeq !== session || navRoutePointsSignature(navRouteOpenPoints()) !== stopsSignature) return false;
      const geometry = result.coordinates || result;
      if (!geometry || geometry.length < 2) return false;
      state.navRota = {
        geometry,
        cortes: stops.map(stop => ({ id: stop.id, index: nearestGeometryIndex(geometry, stop) })),
        // legSteps é paralelo a `cortes` — ver navCurrentLegSteps(). voiceEpoch
        // incrementa a cada recompute bem-sucedido: navVoiceState() usa isso
        // pra zerar as marcações de voz mesmo quando a parada-alvo não mudou
        // (recálculo por "saiu do caminho" refaz as instruções da perna).
        legSteps: Array.isArray(result.legSteps) ? result.legSteps : [],
        voiceEpoch: ((state.navRota && state.navRota.voiceEpoch) || 0) + 1,
      };
      // O 1º fix dispara este cálculo de forma assíncrona. Antes, a voz rodava
      // enquanto `legSteps` ainda estava vazio e só tentava de novo se o GPS
      // emitisse outro fix — parado no local de saída, o motorista ficava sem
      // instrução. Processa agora, com os steps prontos e a posição mais nova.
      const voicePoint = state.navPosicao;
      if (voicePoint && validCoordinates(voicePoint.lat, voicePoint.lng)) {
        processNavVoice(voicePoint);
        updateNextStopPanelDistance();
      }
      return true;
    } catch (_) { return false; } // OSRM fora do ar: mantém o desenho atual (state.navRota intocado).
  }
  function navRecalcAllowed() {
    if (navRecalcState.count >= 10) return false; // disjuntor: teto por rota/dia
    if (navRecalcState.lastAt && Date.now() - navRecalcState.lastAt < 30000) return false; // disjuntor: mínimo 30s
    return true;
  }
  function markNavRecalc() { navRecalcState.count += 1; navRecalcState.lastAt = Date.now(); }
  function resetNavRecalcBudget() { navRecalcState = { count: 0, lastAt: 0 }; navOffPathStreak = 0; navRecalcToastAt = 0; }
  // S3 #4 — "saiu do caminho": > 120m do segmento mais próximo da perna ATUAL
  // por 3 fixes seguidos (chamado a cada tick do watch, ver startNavWatch).
  function checkNavOffPath(point) {
    const cut = navCurrentLegCutIndex();
    const rota = state.navRota;
    if (!rota || !Number.isFinite(cut) || cut < 1) { navOffPathStreak = 0; return; }
    const distance = distanceToPolylineMeters(point, rota.geometry.slice(0, cut + 1));
    if (distance == null || distance <= 120) { navOffPathStreak = 0; return; }
    navOffPathStreak += 1;
    if (navOffPathStreak < 3) return;
    navOffPathStreak = 0;
    triggerNavOffPathRecalc();
  }
  function triggerNavOffPathRecalc() {
    if (!navRecalcAllowed()) return; // teto/backoff estourado: log silencioso, mantém a última geometria (sem toast repetido — Lei 8).
    markNavRecalc();
    const stops = navRouteOpenPoints();
    if (!stops.length) return;
    const targetMap = routeMap;
    const targetHost = routeMapHost;
    const session = navWatchSeq;
    recomputeNavRoute(stops).then(ok => {
      if (!ok || !targetMap || !targetHost) return; // falha do OSRM: mantém o desenho atual, tenta no próximo gatilho.
      if (routeMap !== targetMap || routeMapHost !== targetHost || targetHost.id !== "route-live-map") return;
      if (!navModeActive() || navWatchSeq !== session) return;
      if (typeof targetMap.isStyleLoaded === "function" && !targetMap.isStyleLoaded()) return;
      drawNavLegLayers(targetMap);
      raiseRouteReadingTrail(targetMap);
      const now = Date.now();
      if (now - navRecalcToastAt >= 60000) { navRecalcToastAt = now; toast("Rota atualizada."); }
    });
  }
  function setNavLegLine(map, id, coordinates, paint) {
    const data = coordinates.length >= 2 ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } } : { type: "FeatureCollection", features: [] };
    const source = map.getSource(id);
    if (source) source.setData(data);
    else map.addSource(id, { type: "geojson", data });
    if (!map.getLayer(id)) map.addLayer({ id, type: "line", source: id, layout: { "line-cap": "round", "line-join": "round" }, paint });
  }
  function removeNavLegLayers(map) {
    ["hbx-nav-leg-atual", "hbx-nav-leg-atual-casing", "hbx-nav-leg-resto"].forEach(id => { try { if (map.getLayer(id)) map.removeLayer(id); } catch (_) {} });
    ["hbx-nav-leg-atual", "hbx-nav-leg-atual-casing", "hbx-nav-leg-resto"].forEach(id => { try { if (map.getSource(id)) map.removeSource(id); } catch (_) {} });
  }
  function drawNavLegLayers(map) {
    const rota = state.navRota; const cut = navCurrentLegCutIndex();
    if (!rota || !Number.isFinite(cut) || cut < 1) { removeNavLegLayers(map); return; }
    // Ordem de criação = ordem de empilhamento (quem nasce depois fica por
    // cima): resto primeiro (base), casing branco fino, esmeralda por cima —
    // mesmo padrão casing/core da trilha (hbx-reading-trail-casing/-trail).
    setNavLegLine(map, "hbx-nav-leg-resto", rota.geometry.slice(cut), { "line-color": mapPaintToken("--brand", "rgb(120,201,0)"), "line-width": 4, "line-opacity": .35 });
    setNavLegLine(map, "hbx-nav-leg-atual-casing", rota.geometry.slice(0, cut + 1), { "line-color": "rgba(255,255,255,.9)", "line-width": 7, "line-opacity": .9 });
    setNavLegLine(map, "hbx-nav-leg-atual", rota.geometry.slice(0, cut + 1), { "line-color": mapPaintToken("--cta-to", "rgb(7,169,63)"), "line-width": 5, "line-opacity": .96 });
    // A linha única planejada não convive com as pernas — nav mode substitui.
    if (map.getLayer("hbx-route-line")) map.removeLayer("hbx-route-line");
    if (map.getSource("hbx-route-line")) map.removeSource("hbx-route-line");
  }
  // Chamada por applyRouteLine (todo render/mount) e pelo bootstrap do 1º fix
  // (startNavWatch). Barata quando não há nada novo: só entra no OSRM quando
  // ainda não existe navRota OU aparece uma parada de ID desconhecido — nunca
  // por causa só do motorista ter andado um pouco (isso é o watch/trilha).
  async function applyNavLegRoute(host, map) {
    if (typeof map.isStyleLoaded === "function" && !map.isStyleLoaded()) return;
    const session = navWatchSeq;
    const stops = navRouteOpenPoints();
    const originValid = state.navPosicao && validCoordinates(state.navPosicao.lat, state.navPosicao.lng);
    if (!stops.length || !originValid) { removeNavLegLayers(map); return; }
    const knownIds = new Set(((state.navRota && state.navRota.cortes) || []).map(corte => String(corte.id)));
    const hasUnknownStop = stops.some(stop => !knownIds.has(String(stop.id)));
    if ((!state.navRota || hasUnknownStop) && navRecalcAllowed()) {
      markNavRecalc();
      await recomputeNavRoute(stops);
      if (routeMap !== map || routeMapHost !== host || !navModeActive() || navWatchSeq !== session) return;
    }
    if (!state.navRota || !navModeActive() || navWatchSeq !== session) { removeNavLegLayers(map); return; }
    drawNavLegLayers(map);
    raiseRouteReadingTrail(map);
  }
  async function applyRouteLine(host, map, points) {
    const parts = host.__hbxMapParts || (host.__hbxMapParts = { markers: [] });
    let requestId = null;
    try {
      // S3 21/07 — em navegação ativa a linha única vira 3 cores (pernas);
      // Leitura e rota planejada (não ativa) continuam com a linha única de
      // sempre, comportamento intocado (invariante da frente).
      if (navModeActive()) {
        parts.routeLineRequestId = Number(parts.routeLineRequestId || 0) + 1;
        parts.routeLinePendingSignature = null;
        await applyNavLegRoute(host, map);
        return;
      }
      removeNavLegLayers(map);
      // A linha representa só o que FALTA percorrer: paradas abertas
      // (agendada/em_rota). Entregues continuam como pino, mas saem do traçado
      // — rota já cumprida não fica desenhada por cima do que foi feito, e
      // quando tudo foi entregue não sobra linha nenhuma. Pontos sem `item`
      // (pré-visualização do planejamento) passam direto, sem filtro.
      const lineStops = points.filter(point => !point.item || point.item.status === "agendada" || point.item.status === "em_rota");
      const signature = lineStops.map((point, index) => `${point.item && point.item.id != null ? point.item.id : index}:${Number(point.lat).toFixed(6)},${Number(point.lng).toFixed(6)}`).join("|");
      const sourceReady = !!map.getSource("hbx-route-line");
      const layerReady = !!map.getLayer("hbx-route-line");
      if (lineStops.length < 2) {
        parts.routeLineRequestId = Number(parts.routeLineRequestId || 0) + 1;
        parts.routeLinePendingSignature = null;
        parts.routeLineSignature = signature;
        if (layerReady) map.removeLayer("hbx-route-line");
        if (sourceReady) map.removeSource("hbx-route-line");
        return;
      }
      if (parts.routeLineSignature === signature && sourceReady && layerReady) {
        raiseRouteReadingTrail(map);
        return;
      }
      if (parts.routeLinePendingSignature === signature) return;
      requestId = Number(parts.routeLineRequestId || 0) + 1;
      parts.routeLineRequestId = requestId;
      parts.routeLinePendingSignature = signature;
      const coordinates = lineStops.length >= 2 ? await roadGeometry(lineStops) : [];
      if (routeMap !== map || routeMapHost !== host || parts.routeLineRequestId !== requestId || navModeActive()) return;
      parts.routeLinePendingSignature = null;
      if (coordinates.length < 2) {
        if (map.getLayer("hbx-route-line")) map.removeLayer("hbx-route-line");
        if (map.getSource("hbx-route-line")) map.removeSource("hbx-route-line");
        parts.routeLineSignature = signature;
        return;
      }
      const data = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } };
      const source = map.getSource("hbx-route-line");
      if (source) source.setData(data);
      else {
        map.addSource("hbx-route-line", { type: "geojson", data });
      }
      if (!map.getLayer("hbx-route-line")) {
        map.addLayer({ id: "hbx-route-line", type: "line", source: "hbx-route-line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": mapPaintToken("--brand", "rgb(120,201,0)"), "line-width": 4, "line-opacity": .9 } });
      }
      parts.routeLineSignature = signature;
      raiseRouteReadingTrail(map);
    } catch (_) {
      if (requestId !== null && parts.routeLineRequestId === requestId) parts.routeLinePendingSignature = null;
      // Sem resposta viária, mantenha somente os pinos. Uma linha reta entre
      // casas seria visualmente falsa e não pode ser apresentada como rota.
    }
  }
  // R2 (27/07) — toque no mapa da MONTAGEM vira parada (rota rápida). Handler
  // guardado no HOST (não na closure) pra sobreviver ao transplante entre
  // renders sem pendurar um listener novo por render (bind único por instância).
  function wireMapTap(host, map, opts) {
    host.__hbxMapTap = (opts && opts.onTap) || null;
    if (host.__hbxMapTapBound) return;
    host.__hbxMapTapBound = true;
    map.on("click", event => {
      const handler = host.__hbxMapTap;
      if (handler && event && event.lngLat) handler({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    });
  }
  async function mountMap(hostId, points, interactive, opts) {
    let host = document.getElementById(hostId);
    if (!host) return;
    // Item 8 — voltando pra Rota, o mapa que ficou na garagem entra no lugar do
    // placeholder novo (nada de instância nova, nada de tiles baixando de novo).
    if (hostId === "route-live-map" && mapaEstacionado && host !== mapaEstacionado && mapaEstacionado.__hbxMap) {
      host.replaceWith(mapaEstacionado);
      host = mapaEstacionado;
      mapaEstacionado = null;
      routeMapHost = host;
      routeMap = host.__hbxMap;
      const mapaVoltou = routeMap;
      requestAnimationFrame(() => { if (routeMap === mapaVoltou && typeof mapaVoltou.resize === "function") { try { mapaVoltou.resize(); } catch (_) {} } });
    }
    try {
      // R1 (27/07) — keepOrder: a montagem manda pontos JÁ na ordem da rota
      // conferida/prévia; re-otimizar aqui desenharia no mapa uma ordem que
      // NÃO é a da lista ao lado (mapa mentiroso).
      if (!interactive && !(opts && opts.keepOrder)) points = await roadOptimizedPoints(points);
      // PR18072026 L4-D — se este host já carrega a MESMA instância viva
      // (pendurada em host.__hbxMap por uma montagem anterior e preservada
      // pelo transplante do native.js entre renders), atualiza markers/rota/
      // fitBounds no lugar; o objeto map em si nunca é recriado à toa.
      if (host.__hbxMap && routeMap === host.__hbxMap && routeMapHost === host) {
        wireMapTap(host, host.__hbxMap, opts);
        ensureRouteMapResizeGuard(host, host.__hbxMap);
        const parts = host.__hbxMapParts || (host.__hbxMapParts = { markers: [] });
        const theme = currentMapTheme();
        if (parts.mapTheme !== theme) {
          parts.mapTheme = theme;
          parts.pendingPoints = points;
          host.__hbxMap.once("style.load", async () => {
            if (routeMap !== host.__hbxMap || routeMapHost !== host) return;
            const latest = (host.__hbxMapParts && host.__hbxMapParts.pendingPoints) || points;
            applyDarkMapStreetContrast(host.__hbxMap);
            applyRouteMarkers(host, host.__hbxMap, latest, interactive);
            host.classList.add("is-ready");
            collapseMapAttribution(host);
            host.__hbxMap.resize();
            await applyRouteLine(host, host.__hbxMap, latest);
          });
          host.__hbxMap.setStyle(currentMapStyle(), { diff: true });
          return;
        }
        const styleLoaded = !host.__hbxMap.isStyleLoaded || host.__hbxMap.isStyleLoaded();
        if (styleLoaded) {
          applyDarkMapStreetContrast(host.__hbxMap);
          applyRouteMarkers(host, host.__hbxMap, points, interactive);
          host.classList.add("is-ready");
          void applyRouteLine(host, host.__hbxMap, points);
          collapseMapAttribution(host);
        } else {
          // Mapa recém-criado, estilo ainda carregando: o handler "load" logo
          // abaixo aplica os pontos mais recentes quando disparar.
          host.__hbxMapParts.pendingPoints = points;
        }
        return;
      }
      const pendingPosition = !points.length && interactive ? currentPosition() : Promise.resolve(null);
      // S2 21/07 — generaliza pro modo "nav" (ver routeLiveMode/routeLivePoint
      // acima): leitura mantém a MESMA fonte/comportamento de antes.
      const liveMode = interactive ? routeLiveMode() : null;
      const readingPoint = routeLivePoint(liveMode);
      const center = readingPoint || points[0] || { lat: -14.235, lng: -51.9253 };
      const maplibregl = await loadRouteMapLibrary();
      if (!host.isConnected || host !== document.getElementById(hostId)) return;
      if (host.querySelector(".route-map-unavailable")) {
        host.classList.remove("is-ready");
        host.innerHTML = `<span class="route-map-loading">Carregando mapa…</span>`;
      }
      disposeRouteMap(); routeMapHost = host;
      const map = new maplibregl.Map({ container: host, style: currentMapStyle(), center: [center.lng, center.lat], zoom: readingPoint ? 16.6 : points.length ? 12 : 3.5, attributionControl: { compact: true }, cooperativeGestures: false, maxPitch: 60 });
      // Mapa nascendo (boot do app): entra com a MESMA coreografia da volta.
      routeMap = map; host.__hbxMap = map; host.__hbxMapParts = { markers: [], mapTheme: currentMapTheme(), entradaPendente: true, animarMarcadores: true };
      wireMapTap(host, map, opts);
      ensureRouteMapResizeGuard(host, map);
      if (!points.length) void pendingPosition.then(position => {
        if (position && routeMap === map && routeMapHost === host && !routeLivePoint(routeLiveMode())) map.easeTo({ center: [position.lng, position.lat], zoom: routeLiveMode() ? 16.6 : 14, duration: 500 });
      });
      map.on("load", async () => {
        if (routeMap !== map || routeMapHost !== host) return;
        const latest = (host.__hbxMapParts && host.__hbxMapParts.pendingPoints) || points;
        applyDarkMapStreetContrast(map);
        applyRouteMarkers(host, map, latest, interactive);
        host.classList.add("is-ready");
        collapseMapAttribution(host);
        map.resize();
        await applyRouteLine(host, map, latest);
      });
      map.on("error", () => {});
    } catch (_) { if (host.isConnected) host.innerHTML = `<span class="route-map-unavailable">Não foi possível carregar o mapa agora.</span>`; }
  }
  function mountRouteMap() { return mountMap("route-live-map", routeMapPoints(), true); }

  // ==========================================================================
  // S3 21/07 — mapa vivo da tela "Leitura de rota" (host #leitura-live-map,
  // NUNCA o mesmo nó do mapa da Rota). Trilha desenhada é uma LineString
  // "crua" (SEM roadGeometry/OSRM — o desenho tem que ser fiel ao caminho
  // percorrido, já vem simplificado do nativo por Douglas-Peucker) + 1
  // marcador de posição atual. Mesma regra de transplante do mountMap: se o
  // host já carrega a instância viva, só atualiza layer/marcador no lugar.
  // ==========================================================================
  function disposeLeituraLiveMap() {
    if (leituraLiveMapHost) {
      if (leituraLiveMapHost.__hbxLeituraMarker) { try { leituraLiveMapHost.__hbxLeituraMarker.remove(); } catch (_) {} }
      leituraLiveMapHost.__hbxMap = null;
      leituraLiveMapHost.__hbxLeituraMarker = null;
    }
    if (leituraLiveMap) { leituraLiveMap.remove(); leituraLiveMap = null; }
    leituraLiveMapHost = null;
  }
  function applyLeituraLiveLayer(map) {
    const coordinates = (state.leituraTrilha || []).map(([lat, lng]) => [lng, lat]);
    if (coordinates.length < 2) {
      if (map.getLayer("hbx-leitura-trilha")) map.removeLayer("hbx-leitura-trilha");
      if (map.getSource("hbx-leitura-trilha")) map.removeSource("hbx-leitura-trilha");
      return;
    }
    const data = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } };
    const source = map.getSource("hbx-leitura-trilha");
    if (source) source.setData(data);
    else {
      map.addSource("hbx-leitura-trilha", { type: "geojson", data });
      map.addLayer({ id: "hbx-leitura-trilha", type: "line", source: "hbx-leitura-trilha", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": mapPaintToken("--brand", "rgb(120,201,0)"), "line-width": 4, "line-opacity": .85 } });
    }
  }
  function leituraLiveLastPoint() {
    const amostra = state.leituraUltimaAmostra;
    if (amostra && validCoordinates(amostra.lat, amostra.lng)) return {
      lat: Number(amostra.lat), lng: Number(amostra.lng), ts: amostra.ts == null ? null : Number(amostra.ts),
      accuracyM: amostra.accuracyM == null ? null : Number(amostra.accuracyM),
      speedMps: amostra.speedMps == null ? null : Number(amostra.speedMps),
      bearingDeg: amostra.bearingDeg == null ? null : Number(amostra.bearingDeg),
    };
    const trilha = state.leituraTrilha || [];
    if (!trilha.length) return null;
    const [lat, lng] = trilha[trilha.length - 1];
    return validCoordinates(lat, lng) ? { lat, lng } : null;
  }
  function applyLeituraLiveMarker(host, map) {
    const point = leituraLiveLastPoint();
    if (!point) return;
    if (host.__hbxLeituraMarker) host.__hbxLeituraMarker.setLngLat([point.lng, point.lat]);
    else {
      const dot = document.createElement("span");
      dot.className = "leitura-live-dot";
      host.__hbxLeituraMarker = new window.maplibregl.Marker({ element: dot, anchor: "center" }).setLngLat([point.lng, point.lat]).addTo(map);
    }
  }
  async function mountLeituraLiveMap() {
    const host = document.getElementById("leitura-live-map");
    if (!host) return;
    try {
      if (host.__hbxMap && leituraLiveMap === host.__hbxMap && leituraLiveMapHost === host) {
        const styleLoaded = !host.__hbxMap.isStyleLoaded || host.__hbxMap.isStyleLoaded();
        if (styleLoaded) { applyLeituraLiveLayer(host.__hbxMap); applyLeituraLiveMarker(host, host.__hbxMap); host.classList.add("is-ready"); }
        return;
      }
      const maplibregl = await loadRouteMapLibrary();
      if (!host.isConnected || host !== document.getElementById("leitura-live-map")) return;
      if (host.querySelector(".route-map-unavailable")) {
        host.classList.remove("is-ready");
        host.innerHTML = `<span class="route-map-loading">Carregando mapa…</span>`;
      }
      disposeLeituraLiveMap();
      leituraLiveMapHost = host;
      const last = leituraLiveLastPoint();
      const center = last || { lat: -14.235, lng: -51.9253 };
      const map = new maplibregl.Map({ container: host, style: currentMapStyle(), center: [center.lng, center.lat], zoom: last ? 16 : 3.5, attributionControl: { compact: true }, cooperativeGestures: false });
      leituraLiveMap = map; host.__hbxMap = map; host.__hbxLeituraMarker = null;
      map.on("load", () => {
        if (leituraLiveMap !== map || leituraLiveMapHost !== host) return;
        applyDarkMapStreetContrast(map);
        applyLeituraLiveLayer(map);
        applyLeituraLiveMarker(host, map);
        host.classList.add("is-ready");
      });
      map.on("error", () => {});
    } catch (_) { if (host.isConnected) host.innerHTML = `<span class="route-map-unavailable">Não foi possível carregar o mapa agora.</span>`; }
  }

  function shell(content, floatingAction) {
    // 🔴 ITEM 1 (28/07) — a tela "Endereços com erro" é o PORTÃO da montagem: vive
    // por cima de tudo (inclusive do Gerenciador) sem depender de state.modal, que
    // continua sendo do Gerenciador por baixo.
    // Enquanto o CADASTRO real está aberto (toque numa linha), a tela de erros sai
    // da frente — ela volta sozinha quando o cadastro fecha (ver closeOverlay).
    const checagemOverlay = state.checagem && state.modal !== "client-product" ? `<div class="overlay-host is-opening">${checagemModal()}</div>` : "";
    const standardModal = state.modal && state.modal !== "distance-warning" ? `<div class="overlay-host ${state.openingOverlay === "modal" ? "is-opening" : ""} ${state.closingOverlay === "modal" ? "is-closing" : ""}">${modal()}</div>` : "";
    const distanceModal = state.modal === "distance-warning" ? `<div class="overlay-host is-opening">${modal()}</div>` : "";
    const overlays = `${floatingAction || ""}${creditsLockOverlay()}${routeNoticeOverlay()}${standardModal}${checagemOverlay}${state.selected ? `<div class="overlay-host ${state.openingOverlay === "sheet" ? "is-opening" : ""} ${state.closingOverlay === "sheet" ? "is-closing" : ""}">${deliverySheet(state.selected)}</div>` : ""}${distanceModal}${state.nextStop ? nextStopOverlay(state.nextStop) : ""}${confirmationOverlay()}${dddPromptOverlay()}${leituraPausaOverlay()}${state.toast ? `<div class="toast ${state.toast.error ? "error" : ""}">${H.escape(state.toast.message)}</div>` : ""}`;
    return H.mobileShell.frame({ appName: "logistica", currentScreen: state.screen, content, icon, motion: state.screenMotion, refreshing: state.refreshing, error: state.error, overlays });
  }
  function nextStopOverlay(item) { const client = item.cliente || {}; const count = Math.max(0, Number(state.nextCountdown || 0)); const ringOffset = (188.5 * count / 5).toFixed(1); return `<div class="next-stop-overlay"><section class="next-stop-card"><span class="hero-kicker">Entrega confirmada</span><div class="next-stop-count"><svg viewBox="0 0 70 70" aria-hidden="true"><circle class="next-stop-track" cx="35" cy="35" r="30"/><circle class="next-stop-progress" cx="35" cy="35" r="30" style="stroke-dashoffset:${ringOffset}"/></svg><i>${count || "✓"}</i></div><p class="subtitle">Próxima parada</p><h2>${H.escape(client.nome || "Cliente")}</h2><small>${H.escape(address(client))}</small><div class="actions next-stop-actions"><button class="btn btn-primary" data-action="next-stop">Ver rota</button><button class="btn btn-secondary" data-action="cancel-next-stop">Ficar aqui</button></div></section></div>`; }
  function confirmationOverlay() {
    const confirmation = state.confirmation;
    if (!confirmation) return "";
    // PR18072026 Onda 3 — extraAction/extraLabel: botão perigoso opcional
    // dentro do próprio popup (ex.: "Limpar o dia" dentro de cancelar
    // planejamento); cancelLabel troca o texto do botão neutro (ex.: "Agora não").
    return `<div class="modal-wrap app-confirm-wrap"><section class="modal app-confirm" role="dialog" aria-modal="true" aria-labelledby="app-confirm-title"><div class="app-confirm-icon">${icon(confirmation.icon || "box", 24)}</div><h2 id="app-confirm-title">${H.escape(confirmation.title || "Confirmar")}</h2>${confirmation.message ? `<p>${H.escape(confirmation.message)}</p>` : ""}${confirmation.extraAction ? `<button class="btn ${confirmation.extraDanger === false ? "btn-secondary" : "btn-danger"} btn-block app-confirm-extra" type="button" data-action="${H.escape(confirmation.extraAction)}">${H.escape(confirmation.extraLabel || "")}</button>` : ""}<div class="actions"><button class="btn btn-secondary" data-action="cancel-confirmation">${H.escape(confirmation.cancelLabel || "Cancelar")}</button><button class="btn ${confirmation.danger ? "btn-danger" : "btn-primary"}" data-action="accept-confirmation">${H.escape(confirmation.confirmLabel || "Confirmar")}</button></div></section></div>`;
  }
  // PR20072026 (feedback dono) — pop-up que PERGUNTA o DDD do número sem DDD,
  // já sugerindo o da região do CEP (ViaCEP devolve `ddd`). O motorista confirma
  // ou corrige. Nada de chutar 19 fixo.
  function dddPromptOverlay() {
    const p = state.dddPrompt;
    if (!p) return "";
    const localFmt = displayPhone(p.local);
    const sug = p.suggesting ? "Buscando DDD pelo CEP…" : (p.suggested ? `Sugerido pelo CEP: ${p.suggested}` : "Informe o DDD (2 dígitos)");
    return `<div class="modal-wrap app-confirm-wrap ddd-wrap"><section class="modal app-confirm ddd-prompt" role="dialog" aria-modal="true" aria-labelledby="ddd-title"><div class="app-confirm-icon ddd-icon">${icon("phone", 24)}</div><h2 id="ddd-title">Qual o DDD?</h2><p>${H.escape(p.name || "Cliente")} · ${H.escape(localFmt)}</p><div class="ddd-row"><input id="ddd-input" class="ddd-input" data-enter-action="confirm-ddd" inputmode="numeric" maxlength="2" value="${H.escape(p.ddd || "")}" placeholder="00" aria-label="DDD"><span class="ddd-preview">${H.escape(localFmt)}</span></div><p class="ddd-sug">${H.escape(sug)}</p><div class="actions"><button class="btn btn-secondary" type="button" data-action="cancel-ddd">Cancelar</button><button class="btn btn-primary" type="button" data-action="confirm-ddd" ${p.saving ? "disabled" : ""}>${p.saving ? "Salvando…" : "Salvar"}</button></div></section></div>`;
  }
  // S3 21/07 — popup "Você parou — salvar parada?" (S3.2): overlay GLOBAL
  // igual confirmationOverlay/dddPromptOverlay (aparece em cima de QUALQUER
  // tela/modal, porque hbx:leitura-pausa pode chegar com o app em qualquer
  // lugar — inclusive re-disparado sozinho no onResume, ver listener no fim
  // do arquivo). Mesma moldura .app-confirm (Lei 3), zero CSS novo.
  function leituraPausaOverlay() {
    const pausa = state.leituraPausaPendente;
    if (!pausa) return "";
    const cliente = pausa.clienteProximo;
    const distancia = cliente && Number.isFinite(Number(cliente.distanciaM)) ? Number(cliente.distanciaM) : null;
    const distanciaTxt = distancia !== null ? (distancia < 1000 ? `${Math.round(distancia)} m` : `${(distancia / 1000).toFixed(1)} km`) : "";
    const corpo = cliente
      ? `<p><strong>${H.escape(cliente.nome || "Cliente")}</strong>${distanciaTxt ? `<br><span class="lrt-distance">${H.escape(distanciaTxt)}</span>` : ""}</p>`
      : `<p>Nenhum cliente cadastrado por perto.</p>`;
    return `<div class="modal-wrap app-confirm-wrap"><section class="modal app-confirm" role="dialog" aria-modal="true" aria-labelledby="lrt-pausa-title"><div class="app-confirm-icon">${icon("gps", 24)}</div><h2 id="lrt-pausa-title">Você parou — salvar parada?</h2>${corpo}<div class="actions"><button class="btn btn-secondary" type="button" data-action="leitura-pausa-dispensar">Dispensar</button><button class="btn btn-primary" type="button" data-action="leitura-pausa-salvar">${cliente ? "Salvar parada" : "Cadastrar Local"}</button></div></section></div>`;
  }
  function empty(title, text) { return `<div class="empty"><strong>${H.escape(title)}</strong>${H.escape(text)}</div>`; }
  function loading() { return `<div class="list"><div class="card loading"></div><div class="card loading"></div><div class="card loading"></div></div>`; }
  function statusLabel(status) { return ({ agendada: "Agendada", em_rota: "Em rota", entregue: "Entregue", cancelada: "Cancelada" })[status] || status; }

  // ==========================================================================
  // F5 — componente base do wizard de leitura: cartão CENTRAL (mesma moldura de
  // dayHomeModal, `.modal-wrap.day-home-wrap` + `.modal.day-home`) com header
  // (ícone + título + resumo do que já foi escolhido) e rodapé com DUAS SETAS
  // CIRCULARES GRANDES (‹ voltar / › próximo). `backAction`/`nextAction` são
  // data-action (delegação de clique já existente); omitir desabilita a seta.
  // `extra` é HTML livre entre o corpo e as setas (ex.: botões Sim/Não).
  // `backGlyph` (26/07) troca o desenho da seta da esquerda: a moldura é reusada
  // por telas onde o botão da esquerda NÃO volta passo nenhum (ex.: "Cancelar
  // rota" da conferência) — ali o "‹" prometia voltar e mentia; quem não volta
  // manda o próprio glifo ("×").
  // ==========================================================================
  function centerModal(opts) {
    const o = opts || {};
    const closeAction = o.closeAction === false ? null : (o.closeAction || "leitura-voltar");
    const stepMotion = state.modal === "leitura-parada" && state.leituraStepMotion ? ` leitura-step-${state.leituraStepMotion}` : "";
    const titleId = `center-modal-title-${String(o.title || "dialogo").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "dialogo"}`;
    const backButton = o.backAction ? `<button type="button" class="center-arrow center-arrow--back" data-action="${o.backAction}" aria-label="${H.escape(o.backLabel || "Voltar")}"><span class="center-arrow-glyph">${o.backGlyph === "×" ? icon("close", 27) : icon("chevronLeft", 29)}</span><span class="center-arrow-label">${H.escape(o.backLabel || "Voltar")}</span></button>` : "";
    const nextButton = o.nextAction ? `<button type="button" class="center-arrow center-arrow--next" data-action="${o.nextAction}" ${o.nextDisabled ? "disabled" : ""} aria-label="${H.escape(o.nextLabel || "Próximo")}"><span class="center-arrow-glyph">${icon("chevronRight", 29)}</span><span class="center-arrow-label">${H.escape(o.nextLabel || "Próximo")}</span></button>` : "";
    const navClass = backButton && nextButton ? "" : nextButton ? " is-next-only" : " is-back-only";
    return `<div class="modal-wrap day-home-wrap" ${closeAction ? `data-action="${closeAction}"` : ""}><section class="modal day-home center-modal${stepMotion}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
      <div class="center-modal-head">
        <div class="day-home-icon">${icon(o.icon || "route", 22)}</div>
        <h2 id="${titleId}">${H.escape(o.title || "")}</h2>
        ${o.resumo ? `<p class="center-modal-resumo">${o.resumo}</p>` : ""}
        ${o.hideClose ? "" : `<button class="close center-modal-close" type="button" data-action="${o.closeButtonAction || "leitura-voltar"}" aria-label="${H.escape(o.closeLabel || "Fechar")}">${icon("close", 16)}</button>`}
      </div>
      <div class="center-modal-body">${o.body || ""}</div>
      ${o.extra || ""}
      ${backButton || nextButton ? `<div class="center-modal-nav${navClass}">${backButton}${nextButton}</div>` : ""}
    </section></div>`;
  }

  // Teclado x UI — contrato único da Logística. O visualViewport informa a
  // altura realmente livre no Android; as classes são consumidas pelo CSS do
  // shell para esconder a navegação fixa e manter campo/CTA acima do teclado.
  function keyboardEditable(element) {
    return !!(element && element.matches && element.matches("input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]),textarea,select"));
  }
  function focusKeyboardField(element) {
    if (!keyboardEditable(element) || element.disabled || element.readOnly) return;
    try { element.focus({ preventScroll: true }); } catch (_) { element.focus(); }
    if (typeof element.setSelectionRange === "function" && element.tagName !== "SELECT") {
      const end = String(element.value || "").length;
      try { element.setSelectionRange(end, end); } catch (_) {}
    }
    requestAnimationFrame(() => {
      try { element.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" }); } catch (_) {}
    });
  }
  function keyboardControls(scope) {
    return [...scope.querySelectorAll("input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]),textarea,select")]
      .filter(element => !element.disabled && !element.readOnly && !element.hidden && element.getAttribute("aria-hidden") !== "true");
  }
  function enhanceKeyboardFields() {
    app.querySelectorAll("form,[data-enter-scope],.center-modal-body").forEach(scope => {
      const controls = keyboardControls(scope);
      controls.forEach((control, index) => {
        const last = index === controls.length - 1;
        control.setAttribute("enterkeyhint", last ? "done" : "next");
      });
    });
    app.querySelectorAll("input[data-enter-action],textarea[data-enter-action],select[data-enter-action]").forEach(control => {
      if (!control.hasAttribute("enterkeyhint")) control.setAttribute("enterkeyhint", "done");
    });
    app.querySelectorAll("#leitura-cliente-search,#leitura-produto-search").forEach(control => control.setAttribute("enterkeyhint", "go"));
  }
  function enhanceAccessibility() {
    app.querySelectorAll("button.close:not([aria-label])").forEach(button => button.setAttribute("aria-label", "Fechar"));
    app.querySelectorAll('[role="button"],[role="switch"]').forEach(control => {
      if (!control.hasAttribute("tabindex") && !control.matches("button,a,input,select,textarea")) control.tabIndex = 0;
    });
  }
  function focusedControlSnapshot() {
    const element = document.activeElement;
    if (!keyboardEditable(element) || !app.contains(element)) return null;
    let key = null;
    if (element.id) key = { id: element.id };
    else if (element.form && element.form.id && element.name) key = { formId: element.form.id, name: element.name };
    if (!key) return null;
    return {
      key,
      // O que ESTÁ na tela vence o que o estado sabe: entre o render e o próximo
      // quadro o campo é trocado, e a tecla digitada nessa fresta caía no elemento
      // velho ("wellen" virava "wel" na busca do seletor).
      value: typeof element.value === "string" ? element.value : null,
      start: typeof element.selectionStart === "number" ? element.selectionStart : null,
      end: typeof element.selectionEnd === "number" ? element.selectionEnd : null,
    };
  }
  function restoreFocusedControl(snapshot) {
    if (!snapshot) return;
    requestAnimationFrame(() => {
      let element = snapshot.key.id ? document.getElementById(snapshot.key.id) : null;
      if (!element && snapshot.key.formId) {
        const form = document.getElementById(snapshot.key.formId);
        element = form && form.elements && form.elements.namedItem(snapshot.key.name);
      }
      if (!keyboardEditable(element) || !app.contains(element)) return;
      try { element.focus({ preventScroll: true }); } catch (_) { element.focus(); }
      // Devolve o texto perdido no troca-troca do DOM e reavisa quem escuta, pra
      // busca e estado voltarem a falar a mesma língua.
      if (snapshot.value !== null && element.value !== snapshot.value) {
        element.value = snapshot.value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (snapshot.start !== null && typeof element.setSelectionRange === "function") {
        const length = String(element.value || "").length;
        try { element.setSelectionRange(Math.min(snapshot.start, length), Math.min(snapshot.end, length)); } catch (_) {}
      }
    });
  }
  function syncKeyboardViewport() {
    const viewport = window.visualViewport;
    const visibleHeight = Math.max(0, Number(viewport && viewport.height || window.innerHeight || 0));
    const active = document.activeElement;
    const editing = moduleActive && keyboardEditable(active) && app.contains(active);
    if (!editing) keyboardBaselineHeight = Math.max(visibleHeight, window.innerHeight || 0);
    else if (visibleHeight > keyboardBaselineHeight) keyboardBaselineHeight = Math.max(visibleHeight, window.innerHeight || 0);
    const keyboardOpen = editing && keyboardBaselineHeight - visibleHeight > 120;
    const height = keyboardOpen ? visibleHeight : Math.max(visibleHeight, window.innerHeight || 0);
    document.documentElement.style.setProperty("--hbx-visible-height", `${Math.round(height)}px`);
    document.documentElement.classList.toggle("keyboard-open", keyboardOpen);
    document.body.classList.toggle("keyboard-open", keyboardOpen);
  }
  function revealFocusedForKeyboard() {
    clearTimeout(keyboardRevealTimer);
    keyboardRevealTimer = setTimeout(() => {
      const active = document.activeElement;
      if (!document.documentElement.classList.contains("keyboard-open") || !keyboardEditable(active) || !app.contains(active)) return;
      try { active.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" }); } catch (_) {}
    }, 80);
  }
  function clearKeyboardViewport() {
    clearTimeout(keyboardRevealTimer);
    document.documentElement.classList.remove("keyboard-open");
    document.body.classList.remove("keyboard-open");
    document.documentElement.style.setProperty("--hbx-visible-height", `${Math.round(window.innerHeight || keyboardBaselineHeight)}px`);
  }
  // Mede o cromo REAL (topbar + nav) e publica em CSS vars. É o que deixa o mapa
  // da Rota crescer até encostar o play no rodapé em QUALQUER tela/densidade, sem
  // altura chutada: muda o aparelho, muda a fonte do sistema, gira a tela — a
  // conta do .route-hero acompanha. Só escreve quando o valor muda (não suja o
  // style a cada render).
  // Encaixa o mapa da Rota no espaço real que sobra entre o topo dele e a nav,
  // deixando o play com a MESMA folga em cima e embaixo. Mede a nav de verdade
  // (getBoundingClientRect) em vez de descontar altura chutada, então funciona em
  // qualquer resolução/densidade e depois de girar a tela.
  function fitRouteMap() {
    const shell = app.querySelector(".route-hero > .route-map-shell");
    const controls = app.querySelector(".route-hero > .route-controls");
    const nav = app.querySelector(".bottom-nav");
    if (!shell || !controls || !nav) return;
    // 28/07 (dono: "voce fez algo q cortou o header") — esta conta so fecha com a
    // pagina no TOPO (ver a bola de neve documentada abaixo). Rolagem HERDADA de
    // outra tela (lista de Clientes, modal alto) empurrava o cromo do topo pra
    // debaixo da barra do sistema. Quando a Rota nao tem o que rolar, volta pro
    // topo ANTES de medir — e nunca briga com quem esta rolando uma lista de
    // paradas de verdade (ai sobra rolagem e este bloco nao encosta em nada).
    const raizDoc = document.documentElement;
    const sobraDoc = Math.max(0, raizDoc.scrollHeight - (window.innerHeight || 0));
    const sobraApp = Math.max(0, (app.scrollHeight || 0) - (app.clientHeight || 0));
    const rolado = Math.round(window.scrollY || raizDoc.scrollTop || app.scrollTop || 0);
    if (rolado > 0 && sobraDoc <= 8 && sobraApp <= 8) {
      try { window.scrollTo(0, 0); } catch (_) {}
      raizDoc.scrollTop = 0;
      if (app.scrollTop) app.scrollTop = 0;
    }
    const play = controls.querySelector(".route-transmux-wrap");
    const measuredNavTop = nav.getBoundingClientRect().top;
    // Na Leitura a nav já foi transicionada para fora da tela. Usar a posição
    // transformada dela faria o mapa crescer por baixo da barra do Android e
    // cortaria os controles; o limite passa a ser o viewport realmente visível.
    const visibleBottom = Number(window.visualViewport && window.visualViewport.height || window.innerHeight || measuredNavTop);
    const navTop = leituraRouteActive() ? Math.min(measuredNavTop, visibleBottom) : measuredNavTop;
    // 22/07 — o topo do shell é medido em relação à JANELA, mas a nav é
    // position:fixed e NÃO anda com a rolagem. Com a página rolada S px o
    // shellTop vinha S menor e `livre` saía S MAIOR: o mapa crescia, a página
    // passava a transbordar, e o fitRouteMap seguinte (são 4 por render, mais
    // todo resize) media com um scroll ainda maior — bola de neve. Resultado:
    // mapa gigante, controles e play empurrados pra fora e o resto da tela só
    // aparecendo se rolar. Somar o scroll de volta devolve os dois lados ao
    // mesmo referencial: a tela como ela fica SEM rolagem, que é o layout que a
    // Rota quer. (Quem começa a rolagem é o scrollIntoView do teclado nos campos
    // dos modais — buscar/editar cliente antes de excluir.)
    const scrolled = Math.max(0, Math.round(window.scrollY || document.documentElement.scrollTop || 0));
    const shellTop = shell.getBoundingClientRect().top + scrolled;
    // Teto duro: erre a medição por onde errar, o mapa nunca passa do que cabe
    // na tela visível. É o freio pra isto não virar transbordo de novo.
    const livre = Math.min(navTop - shellTop, Math.max(0, visibleBottom - shellTop));
    if (!(livre > 0)) return;
    // 22/07 — a altura vai em CSS var no <html>, NÃO no style do nó. Toda troca
    // de conteúdo da Rota substitui o .content inteiro (native.js mount →
    // content.replaceWith): o nó novo nasceria sem style e pintaria um frame com
    // o fallback do CSS antes do setTimeout devolver a altura — a piscada em que
    // o play "entra dentro do mapa". A var sobrevive à troca do nó, então o
    // frame novo já nasce certo. Ver o bloco .route-hero no app.css.
    const raiz = document.documentElement;
    const escrever = (nome, valor) => {
      if (raiz.style.getPropertyValue(nome) !== valor) raiz.style.setProperty(nome, valor);
    };
    // O herói inteiro (mapa + faixa de controles + barra de progresso) recebe o
    // espaço livre; o mapa é `flex: 1 1 auto` e fica com o que sobrar. Como esta
    // conta só depende do topo do herói e da nav, ela não muda entre os quatro
    // estados iconográficos da rota.
    escrever("--hbx-route-hero-h", `${Math.round(livre)}px`);
    // Na Leitura de rota entra outro conjunto de controles, sem o disco central;
    // nesse caso a altura continua natural e o mapa absorve o restante.
    if (!play) { escrever("--hbx-route-controls-h", "auto"); return; }
    // A faixa do play recebe a altura do próprio play + a MESMA folga dos dois
    // lados, e termina exatamente na nav. Como o play é centrado nela, o espaço
    // acima e abaixo dele fica igual por construção — em qualquer tela.
    const playH = Math.round(play.getBoundingClientRect().height) || 112;
    const folga = Math.max(10, Math.min(28, Math.round((livre - playH) * 0.18)));
    escrever("--hbx-route-controls-h", `${playH + folga * 2}px`);
  }
  function stabilizeRouteMapLayout() {
    routeMapLayoutTimers.forEach(clearTimeout);
    if (state.screen !== "route") {
      routeMapLayoutTimers = [];
      return;
    }
    // 22/07 — a primeira medição é SÍNCRONA (era setTimeout 0). Entre o mount e
    // um setTimeout cabe um paint, e era nele que a tela aparecia com a altura
    // errada. Rodando aqui, a CSS var já está certa antes do primeiro pixel do
    // conteúdo novo. As passadas seguintes só refinam (fonte do sistema, tiles,
    // teclado fechando).
    fitRouteMap();
    routeMapLayoutTimers = [90, 220, 420].map(delay => setTimeout(() => {
      if (state.screen !== "route") return;
      fitRouteMap();
    }, delay));
  }
  function syncChromeMetrics() {
    const root = document.documentElement;
    // Marca a tela Rota no próprio .content (o seletor :has não é confiável em
    // todo WebView; a classe é). É ela que troca a folga de rodapé grande do app
    // pela folga curta que encosta o play na nav.
    // Só quando a Rota está SEM paradas: aí a tela fecha exatamente na altura
    // visível (play encostado na nav, nada pra rolar). Com rota traçada volta a
    // folga normal de rodapé, senão o último card da lista encostaria na nav.
    const content = app.querySelector(".content");
    const rotaSolo = state.screen === "route" && !items().length;
    if (content) content.classList.toggle("is-rota", rotaSolo);
    // Sem paradas a tela fecha na altura exata: trava o arrasto vertical pra não
    // sobrar aquele resto de rolagem (o padding do topo aparecendo). Com rota
    // traçada volta ao normal, senão a lista não rolaria.
    document.body.style.overflowY = rotaSolo ? "hidden" : "";
    [[".topbar", "--hbx-topbar-h"], [".bottom-nav", "--hbx-nav-h"]].forEach(([selector, prop]) => {
      const node = app.querySelector(selector);
      if (!node) return;
      const height = Math.round(node.getBoundingClientRect().height);
      if (height > 0 && root.style.getPropertyValue(prop) !== `${height}px`) root.style.setProperty(prop, `${height}px`);
    });
  }

  // ==========================================================================
  // F6 — loading overlay escurecido, leve (spinner CSS puro, 1 nó reaproveitado
  // fora do ciclo de render do #app — nunca recriado/re-renderizado junto com o
  // resto). Contador de refs: várias chamadas simultâneas não piscam; debounce
  // de 150ms pra não aparecer em requests rápidos.
  // ==========================================================================
  // Auto-update: cache do appInfo() nativo e trava da rechecagem periódica.
  let appInfoCache;
  let lastUpdateCheckAt = 0;
  let hbxLoadingRefs = 0;
  let hbxLoadingTimer = null;
  let hbxLoadingEl = null;
  let hbxLoadingMsg = "Carregando…";
  function showLoading(msg) {
    if (msg) hbxLoadingMsg = msg;
    hbxLoadingRefs += 1;
    if (hbxLoadingEl) { const t = hbxLoadingEl.querySelector(".hbx-loading-text"); if (t) t.textContent = hbxLoadingMsg; }
    if (hbxLoadingRefs > 1) return;
    clearTimeout(hbxLoadingTimer);
    hbxLoadingTimer = setTimeout(() => {
      if (hbxLoadingRefs <= 0) return;
      if (!hbxLoadingEl) {
        hbxLoadingEl = document.createElement("div");
        hbxLoadingEl.className = "hbx-loading-overlay";
        hbxLoadingEl.innerHTML = `<div class="hbx-loading-spinner" aria-hidden="true"></div><p class="hbx-loading-text"></p>`;
        document.body.appendChild(hbxLoadingEl);
      }
      hbxLoadingEl.querySelector(".hbx-loading-text").textContent = hbxLoadingMsg;
      hbxLoadingEl.classList.add("is-visible");
    }, 150);
  }
  function hideLoading() {
    hbxLoadingRefs = Math.max(0, hbxLoadingRefs - 1);
    if (hbxLoadingRefs > 0) return;
    clearTimeout(hbxLoadingTimer);
    if (hbxLoadingEl) hbxLoadingEl.classList.remove("is-visible");
  }

  // ==========================================================================
  // F3.1 — campo de moeda "estilo banco": guarda CENTAVOS, digitação sempre no
  // fim (nunca deixa cair "no meio do número" — bug provado no aparelho).
  // preventDefault em keydown/beforeinput controla 100% o valor; a exibição
  // (`R$ 20,00`) é sempre recalculada a partir dos centavos internos.
  // ==========================================================================
  function moneyCentsToBRL(cents) {
    const value = Math.max(0, Math.round(Number(cents) || 0));
    return (value / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function moneyInputReais(value) {
    return (Number(onlyDigits(value)) || 0) / 100;
  }
  function attachMoneyInput(el, initialReais, onChange) {
    if (!el) return;
    // Idempotência (22/07): com o mount() reaproveitando nós iguais, este campo
    // pode chegar aqui já preparado. Sem o guarda, um 2º jogo de listeners faria
    // cada dígito ser aplicado DUAS vezes — digitar 5 viraria 55.
    if (el.__hbxMoneyBound) return;
    el.__hbxMoneyBound = true;
    let cents = Math.max(0, Math.round((Number(initialReais) || 0) * 100));
    // Feedback do dono: ao tocar no campo e COMEÇAR a digitar, o valor atual é
    // LIMPO (digita do zero, estilo caixa eletrônico). `pristine` = acabou de
    // focar e ainda não digitou nada — o 1º dígito substitui tudo; do 2º em
    // diante empurra dos centavos normalmente. Backspace também sai do pristine.
    let pristine = false;
    const paint = () => {
      el.value = moneyCentsToBRL(cents);
      requestAnimationFrame(() => { try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {} });
    };
    paint();
    const apply = next => {
      cents = Math.max(0, Math.min(9999999, Math.round(next)));
      paint();
      if (typeof onChange === "function") onChange(cents / 100);
    };
    const pushDigit = digit => {
      const base = pristine ? 0 : cents;
      pristine = false;
      apply(base * 10 + Number(digit));
    };
    const digitFrom = event => {
      if (event.key && /^[0-9]$/.test(event.key)) return event.key;
      if (event.data && /^[0-9]$/.test(event.data)) return event.data;
      return null;
    };
    el.addEventListener("keydown", event => {
      const digit = digitFrom(event);
      if (digit !== null) { event.preventDefault(); pushDigit(digit); return; }
      if (event.key === "Backspace") { event.preventDefault(); pristine = false; apply(Math.floor(cents / 10)); return; }
      if (event.key === "Delete") { event.preventDefault(); pristine = false; apply(0); return; }
      if (["Tab", "Enter", "Escape", "Shift", "Control", "Meta", "Alt", "Unidentified"].includes(event.key) || (event.key && event.key.indexOf("Arrow") === 0)) return;
      event.preventDefault();
    });
    el.addEventListener("beforeinput", event => {
      if (event.inputType === "insertText") {
        const digit = digitFrom(event);
        event.preventDefault();
        if (digit !== null) pushDigit(digit);
        return;
      }
      if (event.inputType === "deleteContentBackward") { event.preventDefault(); pristine = false; apply(Math.floor(cents / 10)); return; }
      if (event.inputType === "insertFromPaste") {
        event.preventDefault();
        pristine = false;
        const pasted = onlyDigits(event.data || (event.dataTransfer && event.dataTransfer.getData("text")) || "");
        if (pasted) apply(Number(pasted.slice(-7)));
        return;
      }
      event.preventDefault();
    });
    el.addEventListener("focus", () => { pristine = true; requestAnimationFrame(() => { try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {} }); });
  }
  // Liga os campos de moeda visíveis no DOM atual (chamado a cada render — a
  // folha inteira é recriada do zero, então religar é barato e necessário).
  function enhanceMoneyInputs() {
    app.querySelectorAll("[data-leitura-preco]").forEach(el => {
      const productId = el.dataset.leituraPreco;
      const item = state.leituraItens.find(i => String(i.productId) === String(productId));
      if (!item) return;
      attachMoneyInput(el, Number(item.valorUnit || 0), value => { item.valorUnit = value; });
    });
    // Bug#2 — mesmo campo moeda-banco ao EDITAR o preço de uma parada no Resumo.
    app.querySelectorAll("[data-leitura-edit-preco]").forEach(el => {
      const productId = el.dataset.leituraEditPreco;
      const item = (state.leituraEditDraft && state.leituraEditDraft.itens || []).find(i => String(i.productId) === String(productId));
      if (!item) return;
      attachMoneyInput(el, Number(item.valorUnit || 0), value => { item.valorUnit = value; });
    });
    // 22/07 — preço de HOJE na chegada usa EXATAMENTE o mesmo campo-banco (o dono
    // já conhece o comportamento; inventar um segundo jeito de digitar dinheiro no
    // mesmo app seria a inconsistência que ele cobra). Escreve direto no rascunho,
    // então o total recalcula enquanto digita.
    app.querySelectorAll("[data-chegada-preco]").forEach(el => {
      if (!state.selected) return;
      const draft = deliveryDraftFor(state.selected);
      const row = draft.items.find(x => x.key === el.dataset.chegadaPreco);
      if (!row) return;
      attachMoneyInput(el, unitPriceFor(state.selected, row), value => { row.valorUnit = value; renderChegadaConta(); });
    });
    app.querySelectorAll("[data-product-price]").forEach(el => {
      const editing = el.dataset.productPrice === "edit";
      const initial = editing ? Number(state.editProductDraft && state.editProductDraft.precoCatalogo || 0) : 0;
      attachMoneyInput(el, initial, value => {
        if (editing && state.editProductDraft) state.editProductDraft.precoCatalogo = String(value);
      });
    });
  }
  // Repinta SÓ as 3 linhas de valor enquanto o preço é digitado. Um render() aqui
  // recriaria o input e mataria o foco/teclado no meio da digitação.
  function renderChegadaConta() {
    if (!state.selected) return;
    const box = app.querySelector(".chegada-conta");
    if (!box) return;
    const antigo = Number((state.selected.cliente || {}).debitoAtual || 0);
    const agora = draftValorAgora(state.selected);
    const valores = box.querySelectorAll(".chegada-conta-linha b");
    if (valores.length === 3) {
      valores[0].textContent = H.money(antigo);
      valores[1].textContent = H.money(agora);
      valores[2].textContent = H.money(antigo + agora);
    }
  }
  // ==========================================================================
  // F3.4 — chips vivos GPS + Rede no topbar (+ F4: chip "Atualizar"). Injetados
  // via DOM no `.toolbar` DEPOIS do mount (o header vem da casca compartilhada
  // native.js; não dá pra editar a casca só pra logística). O mount reconcilia o
  // topbar sem recriar a toolbar, então o container injetado sobrevive; ainda
  // assim reescrevo o innerHTML a cada render (idempotente).
  // ==========================================================================
  function netOnline() { return navigator.onLine !== false; }
  // GPS realmente pegou uma posição? (fato > API de permissão, que é FURADA no
  // WebView do Android — reporta "denied" mesmo com a localização funcionando).
  function markGpsFix() { state.gpsFixAt = Date.now(); state.gpsPerm = "granted"; syncHeaderChips(); }
  function gpsChipClass() {
    // Fix recente (≤5 min) = verde, não importa o que a API de permissão diga.
    if (state.gpsFixAt && Date.now() - state.gpsFixAt < 300000) return "is-ok";
    if (state.gpsPerm === "denied") return "is-off";
    return "is-warn"; // permissão sem posição recente ainda não comprova sinal
  }
  // S5 (PR22072026-APP-SOUNDS) — leitura do cache local (state.soundPrefs é só
  // pra pintar a tela, a fonte real é o SharedPreferences nativo — ver
  // comentário no state inicial). `master`/`voz` ausentes = tudo ligado
  // (mesmo default do nativo, nunca dois padrões divergentes).
  function soundPrefsLocal() { return state.soundPrefs || { master: true, voz: true, off: [] }; }
  function soundMasterOn() { return soundPrefsLocal().master !== false; }
  function soundVozOn() { return soundPrefsLocal().voz !== false; }
  function soundItemOn(key) { return (soundPrefsLocal().off || []).indexOf(key) === -1; }
  // Escada de estado do chip do topo (mesma ideia de gpsChipClass acima): o
  // motorista precisa VER que perdeu algum aviso sem abrir a folha — hoje ele
  // só descobre tarde demais (S5-PREFERENCIA.md, "é isso que faz o chip valer
  // a área nobre do topo").
  function soundChipClass() {
    if (!soundMasterOn()) return "is-off"; // mudo geral
    return (soundPrefsLocal().off || []).length ? "is-warn" : "is-ok"; // algo desligado vs tudo ligado
  }
  // Grava no nativo (fonte da verdade) e recebe de volta o estado JÁ
  // persistido — nunca confia cegamente no `next` otimista (mesmo padrão de
  // H.offline.setPreferences). Chamador é responsável por render() depois.
  function persistSoundPrefs(next) { state.soundPrefs = H.soundPrefs.set(next) || next; }
  // R6 (27/07) — saúde do MOTOR de cálculo de rota, na palavra do dono: "em cima
  // um Motor alegando falha; se avermelhou eu já sei o que tá pegando". Vermelho
  // = a última rota saiu em linha reta por FALHA DE REDE (nunca por escolha de
  // ordem manual, nem por dado sem pino — ver routeEngineBanner de 25/07, que
  // esta regra herda). O cliente NUNCA lê o nome técnico do serviço de rotas.
  function motorDegradadoPorRede() {
    return state.routeEngine === "haversine" && !!state.routeDegradedReason && state.routeDegradedReason !== "coords_invalidas";
  }
  function motorChipClass() {
    if (!state.routeEngine || (state.routeEngine === "haversine" && state.routeDegradedReason === "coords_invalidas")) return "is-warn";
    return motorDegradadoPorRede() ? "is-off" : "is-ok";
  }
  function syncHeaderChips() {
    const toolbar = document.querySelector(".topbar .toolbar");
    if (!toolbar) return;
    let box = toolbar.querySelector("#hbx-header-chips");
    if (!box) {
      box = document.createElement("div");
      box.id = "hbx-header-chips";
      toolbar.insertBefore(box, toolbar.firstChild);
    }
    const net = netOnline();
    const upd = state.updateInfo && state.updateInfo.outdated;
    box.innerHTML =
      (upd ? `<button class="hbx-chip hbx-chip-update" data-action="app-update" aria-label="Atualizar aplicativo">${icon("download", 13)}<span>Atualizar</span></button>` : "") +
      // R6 — chip "Motor" (verde/vermelho) no lugar da faixa técnica que morreu.
      `<button class="hbx-chip ${motorChipClass()}" data-action="chip-motor" aria-label="Motor de rotas">${icon("route", 15)}</button>` +
      // S5 — chip "Som" ENTRA à esquerda do GPS (S5-PREFERENCIA.md, "Porta 1").
      `<button class="hbx-chip ${soundChipClass()}" data-action="chip-som" aria-label="Sons">${icon(soundMasterOn() ? "volume" : "volumeOff", 15)}</button>` +
      `<button class="hbx-chip ${gpsChipClass()}" data-action="chip-gps" aria-label="Sinal de GPS">${icon("gps", 15)}</button>` +
      `<button class="hbx-chip ${net ? "is-ok" : "is-off"}" data-action="chip-rede" aria-label="Conexão de rede">${icon(net ? "wifi" : "signal", 15)}</button>`;
  }
  function refreshGpsPerm() {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: "geolocation" }).then(p => {
          // A query só é confiável quando diz "granted". "denied"/"prompt" no
          // WebView do Android é NÃO-confiável → tratamos como "aguardando"
          // (amarelo), nunca vermelho. Vermelho só vem de uma FALHA real de fix.
          const apply = st => { state.gpsPerm = st === "granted" ? "granted" : "prompt"; syncHeaderChips(); };
          apply(p.state);
          try { p.onchange = () => apply(p.state); } catch (_) {}
        }).catch(() => {});
      }
    } catch (_) {}
  }
  // Falha real de localização: só marca "negado" (vermelho) quando o erro é de
  // PERMISSÃO (code 1). Timeout/indisponível vira "aguardando" (amarelo).
  function markGpsError(err) {
    if (err && err.code === 1) state.gpsPerm = "denied";
    else if (!state.gpsFixAt) state.gpsPerm = "prompt";
    syncHeaderChips();
  }
  // F4 — checa a versão publicada (version-logistica.json no site) contra a do
  // APK (via ponte nativa). Maior no servidor → acende o chip "Atualizar".
  // Dados do próprio APK (versão instalada), lidos 1x da ponte nativa. Fora do
  // Android (preview) fica null e a linha de versão em Ajustes não aparece.
  function appInfo() {
    if (appInfoCache !== undefined) return appInfoCache;
    try { appInfoCache = typeof HBXAndroid !== "undefined" && HBXAndroid.appInfo ? JSON.parse(HBXAndroid.appInfo() || "{}") : null; }
    catch (_) { appInfoCache = null; }
    return appInfoCache;
  }
  // 22/07 — a checagem rodava SÓ no boot frio. O motorista deixa o app aberto o
  // dia inteiro na rota: passava dias sem nunca reabrir do zero e nunca via
  // versão nova. Agora também roda ao voltar do fundo (visibilitychange, com
  // trava de 30min pra não bater no servidor a cada troca de app) e no toque da
  // linha "Versão" em Ajustes (forced=true, aí sempre checa e responde).
  async function checkAppUpdate(forced) {
    if (!forced && Date.now() - lastUpdateCheckAt < 1800000) return;
    try {
      const info = appInfo();
      if (!info) return;
      if (typeof HBXAndroid.downloadAndInstall !== "function") { if (forced) toast("Atualização automática indisponível nesta versão.", true); return; } // nativo antigo → sem auto-update
      const base = String(info.webBaseUrl || "").replace(/\/+$/, "");
      if (!base) return;
      lastUpdateCheckAt = Date.now();
      const resp = await fetch(`${base}/downloads/version-logistica.json`, { cache: "no-store" });
      if (!resp.ok) throw new Error("manifesto indisponível");
      const v = await resp.json();
      if (v && Number(v.versionCode) > Number(info.versionCode || 0)) {
        state.updateInfo = { versionName: v.versionName, versionCode: v.versionCode, url: v.url, sha256: v.sha256, obrigatoria: !!v.obrigatoria, nota: v.nota || "", outdated: true };
        syncHeaderChips();
        if (state.updateInfo.obrigatoria || forced) showModal("app-update");
      } else if (forced) {
        toast("Você já está na versão mais recente.");
      }
    } catch (_) { if (forced) toast("Não foi possível verificar agora.", true); }
  }
  function appUpdateModal() {
    const u = state.updateInfo || {};
    const canInstall = typeof HBXAndroid !== "undefined" && typeof HBXAndroid.updateInstallAllowed === "function" ? HBXAndroid.updateInstallAllowed() : true;
    const busy = !!state.updateBusy;
    const pct = Math.max(0, Math.min(100, Number(state.updateProgress || 0)));
    const body = `<p class="day-home-sub">Uma versão nova (${H.escape(u.versionName || "")}) está pronta.${u.nota ? " " + H.escape(u.nota) : ""}</p>${busy ? `<div class="app-update-progress"><i style="width:${pct}%"></i></div><p class="subtitle subtitle-gap">Baixando… ${pct}%</p>` : (!canInstall ? `<p class="subtitle">O Android vai abrir uma tela: ligue <b>"Permitir desta fonte"</b> e volte aqui.</p>` : "")}`;
    const cta = busy
      ? `<button class="btn btn-primary btn-block rp2-cta" type="button" disabled>Baixando…</button>`
      : (!canInstall
        ? `<button class="btn btn-primary btn-block rp2-cta" type="button" data-action="update-permitir">Abrir permissão</button>`
        : `<button class="btn btn-primary btn-block rp2-cta" type="button" data-action="update-instalar">Atualizar agora</button>`);
    return `<div class="modal-wrap day-home-wrap"${u.obrigatoria ? "" : ` data-action="close-modal"`}><section class="modal day-home" role="dialog" aria-modal="true"><div class="day-home-icon">${icon("download", 24)}</div><h2>Atualizar app</h2>${body}<div class="center-modal-actions app-update-actions">${cta}${u.obrigatoria ? "" : `<button class="btn btn-secondary btn-block" type="button" data-action="close-modal">${busy ? "Fechar" : "Agora não"}</button>`}</div></section></div>`;
  }
  // 22/07 (dono no moto g15) — DEAD-END: o modal "Atualizar app" decide entre
  // "Abrir permissão" e "Atualizar agora" lendo `updateInstallAllowed()` na
  // HORA DO RENDER. O dono tocava em "Abrir permissão", ligava "Permitir desta
  // fonte" no Android e voltava — e NADA re-renderizava o modal: a volta do
  // fundo só chamava `checkAppUpdate()`, que tem trava de 30min e, mesmo
  // passando, só mexe nos chips do header. O botão continuava "Abrir permissão"
  // pra sempre, com a permissão já concedida. Agora a volta reavalia: se a
  // permissão saiu E foi o dono que pediu, emenda o download; se ainda não
  // saiu, pelo menos re-renderiza (nunca fica mostrando estado velho).
  function retomarUpdatePosPermissao() {
    if (state.modal !== "app-update") return;
    const permitido = typeof HBXAndroid !== "undefined" && typeof HBXAndroid.updateInstallAllowed === "function"
      ? HBXAndroid.updateInstallAllowed()
      : true;
    if (permitido && state.updateAwaitingPermission && !state.updateBusy) {
      state.updateAwaitingPermission = false;
      startAppUpdate(); // já dá render() por dentro
      return;
    }
    if (permitido) state.updateAwaitingPermission = false;
    render();
  }
  function startAppUpdate() {
    const u = state.updateInfo || {};
    if (!u.url || !u.sha256) { toast("Informações da atualização indisponíveis.", true); return; }
    if (typeof HBXAndroid === "undefined" || typeof HBXAndroid.downloadAndInstall !== "function") { toast("Atualização não suportada nesta versão.", true); return; }
    window.HBXUpdate = {
      // S3 22/07 — NativeAppBridge.emitUpdateProgress(100) só dispara em
      // PackageInstaller.STATUS_SUCCESS (instalação de fato concluída), não
      // em cada byte baixado — é o "fato" certo pro update_complete. Guard
      // `state.updateBusy` garante 1 som só: onProgress(100) só entra aqui
      // enquanto ainda tava "busy" (baixando); a 2ª chamada (se o receiver
      // repetir) já acha updateBusy=false e não repica.
      onProgress(p) {
        const value = Number(p) || 0;
        const acabouAgora = value >= 100 && state.updateBusy;
        state.updateProgress = value;
        if (value >= 100) state.updateBusy = false;
        if (acabouAgora) H.sound("update_complete");
        render();
      },
      onError(msg) { state.updateBusy = false; render(); toast(msg || "Falha ao atualizar.", true); },
    };
    state.updateBusy = true; state.updateProgress = 0; render();
    try { HBXAndroid.downloadAndInstall(u.url, u.sha256, u.versionName || ""); }
    catch (error) { state.updateBusy = false; render(); toast("Não foi possível iniciar a atualização.", true); }
  }
  const weekDays = [
    { n: 1, label: "SEG", nome: "Segunda" },
    { n: 2, label: "TER", nome: "Terça" },
    { n: 3, label: "QUA", nome: "Quarta" },
    { n: 4, label: "QUI", nome: "Quinta" },
    { n: 5, label: "SEX", nome: "Sexta" },
    { n: 6, label: "SÁB", nome: "Sábado" },
    { n: 7, label: "DOM", nome: "Domingo" },
  ];
  function operationalDate() {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const value = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }
  function localDateTimeInputValue(date) {
    const value = date instanceof Date ? date : new Date(date);
    const pad = number => String(number).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
  }
  function operationalScheduledAt() { return `${operationalDate()}T12:00:00.000Z`; }
  function todayIso() { return new Date(`${operationalDate()}T12:00:00`).getDay() || 7; }
  function workDays() {
    const agendaRows = state.agenda && Array.isArray(state.agenda.dias) ? state.agenda.dias : [];
    if (agendaRows.length) {
      const active = agendaRows.filter(row => row && row.ativo !== false).map(row => Number(row.diaSemana)).filter(day => day >= 1 && day <= 7);
      return [...new Set(active)];
    }
    const raw = String(state.config && state.config.diasTrabalho || "");
    const chosen = raw.split(",").map(Number).filter(n => n >= 1 && n <= 7);
    return chosen.length ? [...new Set(chosen)] : weekDays.map(day => day.n);
  }
  function dateForIsoDay(isoDay, extraWeeks) { const date = new Date(`${operationalDate()}T12:00:00`); const delta = (isoDay - todayIso() + 7) % 7 + Math.max(0, Number(extraWeeks || 0)) * 7; date.setDate(date.getDate() + delta); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
  function apiRouteUnavailable(error) { return [404, 405, 501].includes(Number(error && error.status || 0)); }
  function agendaDaySummary(day) {
    const rows = state.agenda && Array.isArray(state.agenda.dias) ? state.agenda.dias : [];
    return rows.find(row => Number(row && row.diaSemana) === Number(day)) || null;
  }
  function agendaDayEnabled(day) {
    const summary = agendaDaySummary(day);
    return summary ? summary.ativo !== false : workDays().includes(day);
  }
  async function loadAgenda(force) {
    if (agendaLoaded && !force) return state.agenda;
    state.agendaLoading = true;
    state.agendaError = null;
    try {
      const result = await H.api("/logistica/agenda");
      state.agenda = result && Array.isArray(result.dias) ? result : { dias: [] };
      state.agendaAvailable = true;
      agendaLoaded = true;
      return state.agenda;
    } catch (error) {
      agendaLoaded = true;
      if (apiRouteUnavailable(error)) {
        state.agenda = null;
        state.agendaAvailable = false;
        return null;
      }
      state.agendaError = humanApiError(error);
      return null;
    } finally {
      state.agendaLoading = false;
      render();
    }
  }
  function normalizeAgendaPreview(result) {
    const rows = result && Array.isArray(result.paradas)
      ? result.paradas
      : result && Array.isArray(result.planos)
        ? result.planos
        : result && Array.isArray(result.clientes)
          ? result.clientes
          : [];
    return rows
      .filter(row => row && row.ocorreNaData !== false)
      .map(row => {
        const plano = row.plano || row;
        const cliente = row.cliente || plano.cliente || {};
        const local = row.local || plano.local || {};
        const itens = (Array.isArray(row.itens) ? row.itens : Array.isArray(plano.itens) ? plano.itens : []).map(item => ({
          ...item,
          productId: item.productId,
          nome: item.nome || item.produto && (item.produto.nome || item.produto.name) || "Produto",
          qtd: Math.max(1, Number(item.qtd ?? item.qtdPadrao ?? item.qtdPrevista ?? 1)),
        }));
        return {
          ...row,
          agendaPlanoId: row.planoEntregaId || plano.planoEntregaId || plano.id || null,
          customerProfileId: row.customerProfileId || plano.customerProfileId || cliente.id || null,
          nome: cliente.nome || cliente.name || row.nome || plano.nome || "Cliente",
          localId: row.localId || plano.localId || local.id || null,
          localApelido: local.apelido || row.localApelido || plano.localApelido || null,
          endereco: local.endereco || row.endereco || cliente.endereco || null,
          numero: local.numero || row.numero || cliente.numero || null,
          bairro: local.bairro || row.bairro || cliente.bairro || null,
          cidade: local.cidade || row.cidade || cliente.cidade || null,
          uf: local.uf || row.uf || cliente.uf || null,
          lat: local.lat ?? row.lat ?? cliente.lat ?? null,
          lng: local.lng ?? row.lng ?? cliente.lng ?? null,
          geoFonte: local.geoFonte || row.geoFonte || cliente.geoFonte || null,
          janela: row.janela || plano.janela || null,
          tempoParadaMin: row.tempoParadaMin ?? plano.tempoParadaMin ?? null,
          instrucoes: row.instrucoes || plano.instrucoes || null,
          acesso: row.acesso || plano.acesso || local.acesso || null,
          adicional: row.adicional || plano.adicional || null,
          ordem: row.ordem ?? plano.ordem ?? null,
          ordemTravada: row.ordemTravada ?? plano.ordemTravada ?? false,
          observacoes: row.observacoes || plano.observacoes || cliente.observacoes || null,
          itens,
        };
      });
  }
  function enrichAgendaPreview(agendaRows, legacyResult) {
    const legacyRows = legacyResult && Array.isArray(legacyResult.clientes) ? legacyResult.clientes : [];
    return agendaRows.map(row => {
      const legacy = legacyRows.find(item =>
        String(item.customerProfileId || "") === String(row.customerProfileId || "") &&
        (!row.localId || !item.localId || String(item.localId) === String(row.localId))
      );
      if (!legacy) return row;
      return {
        ...legacy,
        ...row,
        lat: row.lat ?? legacy.lat ?? null,
        lng: row.lng ?? legacy.lng ?? null,
        geoFonte: row.geoFonte || legacy.geoFonte || null,
        observacoes: row.observacoes || legacy.observacoes || null,
        itens: row.itens && row.itens.length ? row.itens : legacy.itens || [],
      };
    });
  }
  async function loadManagedDayPreview(day, date) {
    try {
      const agendaPreview = await H.api(`/logistica/agenda/dias/${encodeURIComponent(day)}/previa?date=${encodeURIComponent(date)}`);
      state.agendaAvailable = true;
      const agendaRows = normalizeAgendaPreview(agendaPreview);
      let legacy = null;
      try { legacy = await H.api(`/logistica/dia-preview?date=${encodeURIComponent(date)}`); } catch (_) {}
      return { ...agendaPreview, clientes: enrichAgendaPreview(agendaRows, legacy) };
    } catch (error) {
      if (!apiRouteUnavailable(error)) throw error;
      state.agendaAvailable = false;
      return H.api(`/logistica/dia-preview?date=${encodeURIComponent(date)}`);
    }
  }
  function mergeDayPreview(previews) {
    const merged = new Map();
    previews.forEach(preview => (preview && preview.clientes || []).forEach(client => {
      const key = `${client.customerProfileId || ""}:${client.localId || ""}`;
      const current = merged.get(key) || { ...client, itens: [] };
      const byProduct = new Map(current.itens.map(item => [String(item.productId), { ...item }]));
      (client.itens || []).forEach(item => { const old = byProduct.get(String(item.productId)); byProduct.set(String(item.productId), old ? { ...old, qtd: Number(old.qtd || 0) + Number(item.qtd || 0) } : { ...item }); });
      current.itens = [...byProduct.values()]; merged.set(key, current);
    }));
    return [...merged.values()];
  }
  function dayPreviewKey(client) {
    if (!client) return "";
    if (client.agendaPlanoId) return `plano:${client.agendaPlanoId}`;
    const profile = client.customerProfileId || client.id || client.nome || "";
    return `${profile}:${client.localId || ""}`;
  }
  function compactRouteTime(value) {
    const match = String(value || "").match(/(?:T|\b)([01]?\d|2[0-3]):([0-5]\d)/);
    return match ? `${String(match[1]).padStart(2, "0")}:${match[2]}` : "";
  }
  function routeConstraintSource(primary, fallback) {
    const first = primary || {};
    const second = fallback || {};
    return {
      ...second,
      ...first,
      janela: first.janela || second.janela || null,
      acesso: first.acesso || second.acesso || null,
      adicional: first.adicional || second.adicional || null,
      instrucoes: first.instrucoes || second.instrucoes || null,
      observacoes: first.observacoes || second.observacoes || null,
    };
  }
  function routeConstraintMeta(source) {
    const data = source || {};
    const result = [];
    const seen = new Set();
    const push = (label, tone, title) => {
      const clean = String(label || "").trim();
      if (!clean || seen.has(clean.toLowerCase()) || result.length >= 5) return;
      seen.add(clean.toLowerCase());
      result.push({ label: clean, tone: tone || "", title: String(title || clean).trim() });
    };
    const janela = data.janela || data.janelaHorario || {};
    const inicio = compactRouteTime(janela.inicio || data.janelaInicio || data.horarioInicio);
    const fim = compactRouteTime(janela.fim || data.janelaFim || data.horarioFim);
    if (inicio || fim) {
      const label = inicio && fim ? `${inicio}–${fim}` : inicio ? `Após ${inicio}` : `Até ${fim}`;
      push(label, String(janela.tipo || "").toUpperCase() === "RIGIDA" ? "is-time-rigid" : "is-time", `Horário ${label.toLowerCase()}`);
    } else if (data.horaRef) {
      const referencia = compactRouteTime(data.horaRef);
      if (referencia) push(`Ref. ${referencia}`, "is-time", `Horário de referência ${referencia}`);
    }
    const acesso = data.acesso || {};
    const tipoAcesso = String(acesso.tipo || data.tipoAcesso || "").toUpperCase();
    const andares = Math.max(0, Number(acesso.andares ?? data.andares ?? 0));
    if (tipoAcesso === "ESCADA" || data.temEscada === true || data.possuiEscada === true) {
      push(andares ? `Escada · ${andares} and.` : "Escada", "is-access", acesso.observacao || "Acesso por escada");
    } else if (tipoAcesso === "ELEVADOR" || acesso.temElevador === true) {
      push("Elevador", "is-access", acesso.observacao || "Acesso por elevador");
    } else if (tipoAcesso === "OUTRO") {
      push("Acesso", "is-access", acesso.observacao || data.instrucoes || "Acesso especial");
    }
    const minutos = Math.max(0, Number(data.tempoParadaMin || 0));
    if (minutos) push(`${minutos} min`, "is-duration", `Tempo previsto: ${minutos} minutos`);
    if (data.ordemTravada === true) push("Ordem fixa", "is-locked", "A rota automática preserva esta posição");
    const adicional = data.adicional;
    if (adicional && Number(adicional.valor) > 0) {
      const suffix = String(adicional.tipo || "").toUpperCase() === "POR_UNIDADE" ? "/un." : "";
      push(`+ ${H.money(Number(adicional.valor))}${suffix}`, "is-price", adicional.motivo || "Adicional desta parada");
    }
    const instrucoes = String(data.instrucoes || acesso.observacao || "").trim();
    if (instrucoes) {
      const known = instrucoes.match(/\b(portaria|port[aã]o|interfone|chave|cachorro|elevador)\b/i);
      const label = instrucoes.length <= 18 ? instrucoes : known ? known[1] : "Instrução";
      push(label.charAt(0).toUpperCase() + label.slice(1), "is-access", instrucoes);
    }
    const obs = String(data.observacoes || "").trim();
    if (obs && !inicio && !fim) {
      const timeMatch = obs.match(/\b(ap[oó]s|depois das?|a partir das?|at[eé]|antes das?)\s*(\d{1,2}(?::\d{2})?\s*h?)/i);
      if (timeMatch) push(`${timeMatch[1]} ${timeMatch[2]}`, "is-time-rigid", obs);
    }
    if (obs && !result.some(item => item.tone === "is-access")) {
      const accessMatch = obs.match(/\b(escada|andar|portaria|port[aã]o|interfone|chave|cachorro|elevador)\b/i);
      if (accessMatch) push(accessMatch[1].charAt(0).toUpperCase() + accessMatch[1].slice(1), "is-access", obs);
    }
    return result;
  }
  function routeConstraintChips(source) {
    const chips = routeConstraintMeta(source);
    return chips.length
      ? `<div class="route-constraint-chips">${chips.map(item => `<span class="route-constraint-chip ${item.tone}" title="${H.escape(item.title)}">${H.escape(item.label)}</span>`).join("")}</div>`
      : "";
  }
  function previewMatchesDelivery(preview, item) {
    const profileId = preview && preview.customerProfileId;
    const localId = preview && preview.localId;
    const sameProfile = profileId && [item && item.customerProfileId, item && item.cliente && item.cliente.id, item && item.clienteId].some(id => String(id) === String(profileId));
    const sameLocal = localId && [item && item.localId, item && item.cliente && item.cliente.localId].some(id => String(id) === String(localId));
    return !!sameProfile && (!localId || sameLocal || !(item && item.localId));
  }
  function selectedPreviewDeliveryIds() { return allRouteItems().filter(item => (state.dayPreview || []).some(preview => previewMatchesDelivery(preview, item))).map(item => String(item.id)); }
  function setRouteSelection(ids) {
    const unique = [...new Set((ids || []).map(String).filter(Boolean))];
    if (!unique.length) return;
    state.routeSelection = { date: state.route && state.route.date || operationalDate(), ids: unique };
    H.cache.set("logistica-route-selection", state.routeSelection);
  }
  function clearRouteSelection() {
    state.routeSelection = null;
    H.cache.remove("logistica-route-selection");
  }
  // PR18072026 Onda 3 — "Minha ordem"/"Rota salva": guarda o ordemManual ATIVO
  // pra rota planejada de hoje, no mesmo padrão de routeSelection (sobrevive até
  // o "Iniciar rota" separado, ver startPlannedRoute/startRoute).
  function activeRouteOrdemManual() {
    const stored = state.routeOrdemManual;
    if (!stored || !Array.isArray(stored.ids) || !stored.ids.length) return null;
    return stored.date === operationalDate() ? stored.ids : null;
  }
  // S5 25/07 — a origem (lat/lng) usada quando ESTA ordem foi aprovada na
  // conferência (só quem chama setRouteOrdemManual com o 2º argumento
  // preenche); "Minha ordem"/"Rota salva" seguem sem origem, e o drift-check
  // (origemAprovadaDistanciaM) simplesmente não se aplica a esses fluxos —
  // eles nunca tiveram o conceito de "onde foi conferido e aprovado".
  function activeRouteOrdemManualOrigem() {
    const stored = state.routeOrdemManual;
    if (!stored || stored.date !== operationalDate() || !stored.origem) return null;
    return stored.origem;
  }
  function setRouteOrdemManual(ids, origem) {
    const unique = [...new Set((ids || []).map(String).filter(Boolean))];
    if (!unique.length) return clearRouteOrdemManual();
    const ponto = origem && validCoordinates(origem.lat, origem.lng) ? { lat: Number(origem.lat), lng: Number(origem.lng) } : null;
    state.routeOrdemManual = { date: operationalDate(), ids: unique, ...(ponto ? { origem: ponto } : {}) };
    H.cache.set("logistica-route-ordem-manual", state.routeOrdemManual);
  }
  function clearRouteOrdemManual() {
    state.routeOrdemManual = null;
    H.cache.remove("logistica-route-ordem-manual");
  }
  // Traduz a ordem escolhida pelo usuário (chaves de dayPreviewKey, cliente/local)
  // pras deliveryIds reais já materializadas (depois de gerar-dia/admin-route
  // prepare). Ausentes na ordem = o backend apêndice no fim sozinho.
  function manualOrderDeliveryIds(routeItems) {
    const used = new Set();
    const ids = [];
    (state.dayManualOrder || []).forEach(key => {
      const preview = (state.dayPreview || []).find(client => dayPreviewKey(client) === key);
      if (!preview) return;
      const match = (routeItems || []).find(item => !used.has(String(item.id)) && previewMatchesDelivery(preview, item));
      if (match) { ids.push(String(match.id)); used.add(String(match.id)); }
    });
    return ids;
  }
  // Paradas {customerProfileId, localId?} na ordem manual escolhida — pro
  // corpo de POST/PATCH rota-modelos.
  function manualOrderParadas() {
    return (state.dayManualOrder || [])
      .map(key => (state.dayPreview || []).find(client => dayPreviewKey(client) === key))
      .filter(Boolean)
      .map(client => ({ customerProfileId: String(client.customerProfileId || ""), ...(client.localId ? { localId: String(client.localId) } : {}) }))
      .filter(row => row.customerProfileId);
  }
  let agendaLoaded = false;
  let routeModelosLoaded = false;
  async function loadRouteModelos(force) {
    if (routeModelosLoaded && !force) return;
    state.routeModelosLoading = true; state.routeModelosError = null; render();
    try {
      const result = await H.api("/logistica/rota-modelos");
      state.routeModelos = Array.isArray(result) ? result : (result && (result.items || result.data)) || [];
      routeModelosLoaded = true;
    } catch (error) { state.routeModelosError = humanApiError(error); }
    finally { state.routeModelosLoading = false; render(); }
  }
  function manualOrderAgendaIds() {
    return (state.dayManualOrder || [])
      .map(key => (state.dayPreview || []).find(client => dayPreviewKey(client) === key))
      .map(client => client && String(client.agendaPlanoId || ""))
      .filter(Boolean);
  }
  function agendaSupportsWeeklyOrder() {
    const agenda = state.agenda || {};
    const mode = String(agenda.modo || "").toUpperCase();
    return agenda.agendaV2Ativa === true && (mode === "V2" || mode === "AGENDA_V2");
  }
  function agendaOrderCanPersist() {
    if (!isAdmin() || !agendaSupportsWeeklyOrder() || state.daySelection.length !== 1 || !state.dayPreview.length) return false;
    const ids = manualOrderAgendaIds();
    const summary = agendaDaySummary(state.daySelection[0]);
    const totalPlanos = Math.max(0, Number(summary && summary.totalPlanos || 0));
    return ids.length === state.dayPreview.length &&
      new Set(ids).size === ids.length &&
      ids.every(id => !id.toLowerCase().startsWith("legado:")) &&
      (!totalPlanos || ids.length === totalPlanos);
  }
  // Na Agenda nova, "Minha ordem" grava a sequência semanal pelo contrato
  // canônico. Em servidor antigo, mantém o checkbox legado de rota-modelo.
  async function saveManualRouteModeloIfNeeded() {
    if (state.daySelection.length !== 1) return;
    const diaSemana = state.daySelection[0];
    if (agendaOrderCanPersist()) {
      const planoIds = manualOrderAgendaIds();
      const original = state.dayAgendaOrderOriginal || [];
      if (planoIds.length === original.length && planoIds.every((id, index) => id === original[index])) return;
      await H.api(`/logistica/agenda/dias/${encodeURIComponent(diaSemana)}/ordem`, { method: "PATCH", body: { planoIds } });
      state.dayAgendaOrderOriginal = planoIds.slice();
      void loadAgenda(true);
      return;
    }
    if (!state.dayManualSave) return;
    const paradas = manualOrderParadas();
    if (!paradas.length) return;
    try {
      await loadRouteModelos(true);
      const existing = (state.routeModelos || []).find(modelo => Number(modelo.diaSemana) === diaSemana);
      const dayLabel = (weekDays.find(day => day.n === diaSemana) || {}).label || "";
      if (existing) await H.api(`/logistica/rota-modelos/${encodeURIComponent(existing.id)}`, { method: "PATCH", body: { paradas } });
      else await H.api("/logistica/rota-modelos", { method: "POST", body: { nome: `Minha rota de ${dayLabel}`, diaSemana, paradas } });
      await loadRouteModelos(true);
    } catch (error) { toast(humanApiError(error), true); }
  }
  async function refreshDayPreview() {
    const requestId = ++dayPreviewRequestId;
    const previous = state.dayPreview || [];
    const previousIds = new Set(previous.map(dayPreviewKey));
    state.dayPreviewLoading = true; state.dayPreviewError = null; state.dayPreviewLeavingIds = [];
    try {
      const previewRows = await Promise.all(state.daySelection.map(async day => {
        const primaryDate = dateForIsoDay(day);
        let preview = await loadManagedDayPreview(day, primaryDate);
        let sourceDate = primaryDate;
        if (!state.agendaAvailable && day === todayIso() && !(preview && Array.isArray(preview.clientes) && preview.clientes.length)) {
          const fallbackDate = dateForIsoDay(day, 1);
          const fallback = await loadManagedDayPreview(day, fallbackDate);
          if (fallback && Array.isArray(fallback.clientes) && fallback.clientes.length) { preview = fallback; sourceDate = fallbackDate; }
        }
        return { day, sourceDate, preview };
      }));
      if (requestId !== dayPreviewRequestId) return;
      state.daySourceDates = Object.fromEntries(previewRows.map(row => [row.day, row.sourceDate]));
      const next = mergeDayPreview(previewRows.map(row => row.preview));
      const nextIds = new Set(next.map(dayPreviewKey));
      const leavingIds = previous.filter(client => !nextIds.has(dayPreviewKey(client))).map(dayPreviewKey);
      if (leavingIds.length) {
        state.dayPreviewLeavingIds = leavingIds;
        render();
        await new Promise(resolve => setTimeout(resolve, 150));
        if (requestId !== dayPreviewRequestId) return;
      }
      state.dayPreview = next;
      state.dayAgendaOrderOriginal = state.daySelection.length === 1
        ? next.map(client => String(client.agendaPlanoId || "")).filter(Boolean)
        : [];
      state.dayPreviewLeavingIds = [];
      state.dayPreviewEnteringIds = next.filter(client => !previousIds.has(dayPreviewKey(client))).map(dayPreviewKey);
    } catch (error) { if (requestId === dayPreviewRequestId) { state.dayPreviewError = humanApiError(error); state.dayPreviewEnteringIds = []; } }
    finally {
      if (requestId === dayPreviewRequestId) {
        state.dayPreviewLoading = false;
        render();
        if (state.dayPreviewEnteringIds.length) setTimeout(() => {
          if (requestId === dayPreviewRequestId) { state.dayPreviewEnteringIds = []; render(); }
        }, 190);
      }
    }
  }
  // S1 21/07 — contagem de clientes por dia (S1.2), pro "Por dia" vertical.
  // Mesmo endpoint da prévia (/logistica/dia-preview?date=), uma chamada em
  // paralelo por dia de workDays(); cacheia por sessão do modal
  // (dayCountsLoaded some no próximo openDayManager). Dia que falhar fica sem
  // número — não quebra a lista nem mostra erro por dia.
  async function loadDayCounts() {
    if (state.dayCountsLoaded) return;
    state.dayCountsLoaded = true;
    const agenda = await loadAgenda();
    if (agenda && Array.isArray(agenda.dias)) {
      agenda.dias.forEach(row => {
        const day = Number(row && row.diaSemana);
        // 27/07 (dono) — o número do chip é QUANTA GENTE o dia tem
        // (`totalClientesDia`), não quantas visitas caem na próxima data daquele
        // dia (`totalParadas`): esse último zera sozinho quando o dia já foi
        // gerado ou quando a cadência é quinzenal — e terça com 7 clientes
        // aparecia como 0. Servidor antigo (sem o campo) cai no de antes.
        // `totalPlanos` (as VISITAS cadastradas naquele dia) já vem do servidor de
        // hoje e é o que salva a tela sem esperar deploy; `totalClientesDia` é o
        // mesmo número já contado por CLIENTE, quando o servidor tiver.
        if (day >= 1 && day <= 7) state.dayCounts[day] = Math.max(0, Number(row.totalClientesDia ?? row.totalPlanos ?? row.totalParadas ?? row.totalClientes ?? 0));
      });
      render();
      return;
    }
    workDays().forEach(day => {
      (async () => {
        try {
          const preview = await H.api(`/logistica/dia-preview?date=${encodeURIComponent(dateForIsoDay(day))}`);
          state.dayCounts[day] = Array.isArray(preview && preview.clientes) ? preview.clientes.length : 0;
        } catch (_) { state.dayCounts[day] = null; /* falhou: linha fica sem número (null ≠ undefined = ainda carregando), sem toast por dia */ }
        render();
      })();
    });
  }
  // R1 (27/07, padrão Circuit) — quais dias compõem a rota MONTADA agora. É o que
  // mata o "0 mentiroso" (item 9 do dono: gerar segunda zerava a contagem e o chip
  // parecia vazio): chip de dia já montado mostra "Adicionado ✓", nunca a contagem.
  // Persistido em cache local (sobrevive reabrir o app com a rota ainda de pé).
  function diasAdicionados() {
    if (!Array.isArray(state.dayAdicionados)) state.dayAdicionados = H.cache.get("logistica-dias-rota", []) || [];
    return state.dayAdicionados;
  }
  function setDiasAdicionados(days) {
    state.dayAdicionados = [...new Set((days || []).map(Number).filter(day => day >= 1 && day <= 7))].sort((a, b) => a - b);
    H.cache.set("logistica-dias-rota", state.dayAdicionados);
  }
  function clearDiasAdicionados() { state.dayAdicionados = []; H.cache.remove("logistica-dias-rota"); }
  function openDayManager(mode) {
    // Sessão LEITURA (GPS) já ativa: volta para a própria tela Rota, onde os
    // controles de gravação ocupam o lugar do Play.
    if (state.leitura && state.leitura.modo === "LEITURA") { void openLeituraAtiva(); return; }
    state.dayMode = mode || "start";
    // Uma geração anterior pode ter terminado com o painel fechado. O estado
    // de processamento não pode sobreviver à abertura seguinte, senão o
    // botão "Próximo" permanece desabilitado até o aplicativo reiniciar.
    state.dayStarting = false;
    state.montagemAbandonada = false;
    // R1 (27/07, fusão Circuit): morreu o menu "Montar Rota" e a Agenda separada —
    // abre DIRETO na tela única (chips de dia + mapa + lista + Aceitar). Com rota
    // já montada, a tela abre mostrando a PRÓPRIA rota (conferência da rota atual)
    // e os dias dela carimbados "Adicionado ✓"; chip novo ADICIONA na rota.
    // A seleção continua explícita: sem rota, nenhum dia nasce marcado.
    state.daySelection = routePlanned() ? [...diasAdicionados()] : [];
    state.dayPreview = []; state.dayPreviewEnteringIds = []; state.dayPreviewLeavingIds = []; state.daySourceDates = {}; state.dayPreviewError = null; state.openingOverlay = "modal"; state.modal = "manage-day";
    state.dayOrderStep = null; state.dayOrderMode = "app"; state.dayManualOrder = []; state.dayManualSave = false; state.dayAgendaOrderOriginal = [];
    // S1 21/07 — contagem por dia (S1.2) zera a cada abertura.
    state.dayCounts = {}; state.dayCountsLoaded = false;
    render();
    void loadRouteModelos();
    void loadDayCounts();
    if (routePlanned()) void abrirRotaConferencia();
  }
  async function toggleManagedRouteDay(day) {
    if (!Number.isInteger(day) || day < 1 || day > 7) return;
    if (!agendaDayEnabled(day)) return;
    if (state.dayStarting) return;
    // R1/R4 (27/07) — com rota já montada, o chip vira o gesto de ADICIONAR (padrão
    // Circuit): dia novo soma e REGENERA a rota inteira (gerar-dia é idempotente e o
    // claim por dia garante que dia pago não recobra — o que estourar o bloco aparece
    // na linha de créditos como o "+X" a debitar).
    if (routePlanned()) {
      const adicionados = diasAdicionados();
      // 27/07 (dono) — o chip é INTERRUPTOR: tocar num dia MARCADO desmarca. Antes
      // só avisava "cancele a rota para remover" — o dono tinha que cancelar tudo e
      // remontar na mão. Agora o app faz esse mesmo caminho sozinho: desfaz a
      // montagem (descartar-montagem DEVOLVE a ocorrência, não consome o dia do
      // cliente) e remonta só com os dias que sobraram. Sem dia nenhum, fica
      // desfeita. Nada disso debita — quem debita é "Confirmar/Aceitar rota".
      if (adicionados.includes(day)) {
        const restantes = adicionados.filter(value => value !== day);
        state.dayStarting = true; render();
        showLoading(restantes.length ? "Refazendo a rota…" : "Tirando o dia…");
        try {
          // A conferência na tela é da rota que está morrendo: sai ANTES (mesmo
          // cuidado do popup "Cancelar?"), senão sobraria uma lista de paradas de
          // uma rota que não existe mais. `cancelada` evita que o guard de abandono
          // do closeOverlay dispare um segundo desfazer em cima deste.
          if (state.rotaConferencia) state.rotaConferencia.cancelada = true;
          state.rotaConferencia = null;
          await performEncerrarRota("Dia retirado da montagem.", { descartar: true, semToast: restantes.length > 0 });
        } finally { hideLoading(); state.dayStarting = false; }
        // performEncerrarRota engole o próprio erro (já falou na tela) e só limpa os
        // dias adicionados quando o backend confirmou: se ainda tem dia carimbado,
        // nada foi desfeito e a seleção não pode mentir.
        if (diasAdicionados().length) { render(); return; }
        state.daySelection = restantes;
        render();
        if (restantes.length) void beginManagedRoute();
        return;
      }
      state.daySelection = [...new Set([...adicionados, day])].sort((a, b) => a - b);
      // Item 1 — dia novo entrando numa rota já montada passa pelo MESMO portão
      // (checa só o dia que está chegando; o resto já foi conferido pra entrar).
      if (!(await checarEnderecosAntesDeMontar([day]))) return;
      void beginManagedRoute();
      return;
    }
    // 27/07 (dono, 2ª cobrança) — SEM tela de prévia: o primeiro toque num dia
    // JÁ monta a rota daquele dia nesta mesma tela (a conferência renderiza no
    // lugar; dias seguintes caem no ramo de ADICIONAR acima).
    // 🔴 ITEM 1 (28/07) — antes de montar, os ENDEREÇOS. Só monta com tudo certo.
    state.daySelection = [...new Set([...state.daySelection, day])].sort((a, b) => a - b);
    render();
    if (!(await checarEnderecosAntesDeMontar(state.daySelection))) return;
    void beginManagedRoute();
  }
  function blankClientProductDraft() { return { productId: "", qtdPadrao: "1", proximaData: "", frequenciaDias: "30", scheduledAt: "", precoAcordado: "" }; }
  function resetClientProductEditor() {
    state.clientProductEditingId = null;
    // R5 (27/07) — clientProductDays NÃO zera aqui: o dia é do CLIENTE (chips
    // na seção Cadastro da ficha), não do form de produto; fechar o form de
    // produto não pode apagar os dias do cliente. Quem semeia/zera é o abrir
    // da ficha (openClientEditor / ação new-client).
    state.clientProductMode = "";
    state.clientProductDraft = blankClientProductDraft();
  }
  function recurrenceLabel(item) {
    const days = String(item.diasSemana || "").split(",").map(Number).filter(Boolean);
    if (days.length) return weekDays.filter(day => days.includes(day.n)).map(day => day.label).join(" · ");
    if (item.frequenciaDias) return `A cada ${item.frequenciaDias} dia(s)`;
    return "Sem recorrência";
  }
  // PONTE CADASTRO→AGENDA (26/07) — os dias que o CLIENTE já tem: união do card
  // (diasEntrega, que com a Agenda V2 vem dos PLANOS) com os vínculos semanais
  // ativos já carregados na ficha. É o default do produto novo — o dia se
  // pergunta 1x por cliente, não de novo a cada produto.
  function clientKnownDays(client) {
    const fromCard = Array.isArray(client && client.diasEntrega) ? client.diasEntrega : [];
    const fromProducts = (state.clientProducts || [])
      .filter(item => item && item.ativo !== false)
      .flatMap(item => String(item.diasSemana || "").split(",").map(Number));
    // Os chips seguem SÓ o dado real (card + vínculos) — nunca a memória do
    // card, senão um dia tirado no PC voltaria sozinho na ficha.
    return Array.from(new Set([...fromCard, ...fromProducts].map(Number).filter(day => day >= 1 && day <= 7))).sort((a, b) => a - b);
  }
  // 27/07 (dono) — o CARD do cliente mostrava MENOS dia que a ficha: o servidor
  // manda no card só os dias do PLANO, e o cliente que recebe SEG e TER aparecia
  // como "Entrega SEG". Aqui o app guarda, por cliente, os dias que a ficha já
  // conheceu (união card+vínculos, e o que foi salvo nos chips) — o card mostra a
  // UNIÃO disso com o servidor, então card e chips falam a mesma língua.
  function lembrarDiasDoCliente(clientId, dias) {
    const id = String(clientId || "");
    if (!id) return;
    const lista = [...new Set((dias || []).map(Number).filter(day => day >= 1 && day <= 7))].sort((a, b) => a - b);
    const atual = clientDiasMemo.get(id) || [];
    if (atual.length === lista.length && atual.every((day, index) => day === lista[index])) return;
    if (lista.length) clientDiasMemo.set(id, lista); else clientDiasMemo.delete(id);
    H.cache.set("logistica-client-dias", Object.fromEntries(clientDiasMemo));
  }
  function clientCardDays(client) {
    const doServidor = Array.isArray(client && client.diasEntrega) ? client.diasEntrega : [];
    const lembrados = clientDiasMemo.get(String((client && client.id) || "")) || [];
    return [...new Set([...doServidor, ...lembrados].map(Number).filter(day => day >= 1 && day <= 7))].sort((a, b) => a - b);
  }
  async function loadClientProducts() {
    const client = state.modalClient;
    if (!client || !client.id) return;
    state.clientProductsLoading = true; state.clientProductsError = null; render();
    try {
      const result = await H.api(`/logistica/cliente-produtos?customerProfileId=${encodeURIComponent(client.id)}`);
      state.clientProducts = Array.isArray(result) ? result : (result && (result.items || result.data)) || [];
      // R5 (27/07) — com os vínculos reais na mão, os dias do cliente ganham a
      // versão autoritativa (união card+vínculos); não pisa no que o usuário
      // já tocou nesta sessão. O original serve pro save saber se mudou.
      const diasReais = clientKnownDays(state.modalClient);
      lembrarDiasDoCliente(state.modalClient && state.modalClient.id, diasReais);
      state.clientDaysOriginal = diasReais;
      if (!state.clientDaysTouched) state.clientProductDays = diasReais;
    } catch (error) { state.clientProducts = []; state.clientProductsError = humanApiError(error); }
    finally { state.clientProductsLoading = false; render(); }
  }
  function openClientEditor(client) {
    if (!client || !client.id) return undefined;
    state.modalClient = client;
    state.clientDetail = null;
    state.clientProducts = [];
    state.clientProductsError = null;
    state.clientCepStatus = "";
    clientCepRequestId += 1;
    resetClientProductEditor();
    // R5 (27/07) — dia fixo NO CLIENTE: chips da ficha nascem com os dias que o
    // cliente já tem (card); loadClientProducts refina com os vínculos reais.
    state.clientProductDays = clientKnownDays(client);
    state.clientDaysOriginal = null;
    state.clientDaysTouched = false;
    state.clientProductFormOpen = false;
    showModal("client-product");
    void loadClientProducts();
    // S4 25/07 (PR25072026-ROTA-CONFERIDA) — devolve a MESMA promise de
    // loadClientDetail pra quem precisar esperar o detalhe chegar antes de
    // mexer no draft (ver abrirFichaComEditor/capturarGpsParaEdicaoCliente,
    // que só grava o GPS DEPOIS do fetch preencher clientPaymentDraft — senão
    // a resposta em voo sobrescreveria o pino capturado). Chamadores antigos
    // continuam ignorando o retorno (fire-and-forget, comportamento idêntico).
    return loadClientDetail();
  }
  async function loadClientDetail() {
    const client = state.modalClient;
    if (!client || !client.id) return;
    try {
      state.clientDetail = await H.api(`/nucleo/clientes/${encodeURIComponent(client.id)}`);
      const locais = Array.isArray(state.clientDetail.locais) ? state.clientDetail.locais : [];
      const local = locais.find(item => item && item.isPrincipal) || locais[0] || null;
      const parts = separateAddress(local && local.endereco || state.clientDetail.endereco || client.endereco, local && local.numero || state.clientDetail.numero || client.numero, local && local.bairro || state.clientDetail.bairro || client.bairro);
      state.clientPaymentDraft = {
        name: state.clientDetail.name || state.clientDetail.nome || client.name || client.nome || "",
        phone: displayPhone(state.clientDetail.whatsapp || client.phone || client.phoneNormalized || client.whatsapp || ""),
        cep: formatCep(local && local.cep || state.clientDetail.cep || client.cep || ""),
        endereco: parts.endereco,
        numero: parts.numero,
        bairro: parts.bairro,
        cidade: local && local.cidade || state.clientDetail.cidade || client.cidade || "",
        uf: local && local.uf || state.clientDetail.uf || client.uf || "",
        localId: local && local.id || "",
        lat: (local && (local.lat ?? local.latitude)) ?? state.clientDetail.lat ?? client.lat ?? null,
        lng: (local && (local.lng ?? local.longitude)) ?? state.clientDetail.lng ?? client.lng ?? null,
        geoFonte: local && local.geoFonte || state.clientDetail.geoFonte || client.geoFonte || null,
        formaPagamento: state.clientDetail.formaPagamento || "aberto",
        metodoPadrao: state.clientDetail.metodoPadrao || "",
        diaFechamento: state.clientDetail.diaFechamento ? String(state.clientDetail.diaFechamento) : "",
        limite: state.clientDetail.limiteFiado != null ? String(state.clientDetail.limiteFiado) : "",
        observacoes: state.clientDetail.observacoes || client.observacoes || ""
      };
      render();
    }
    catch (error) { state.clientDetail = null; render(); toast(humanApiError(error), true); }
  }
  // PR20072026 (feedback dono) — abre o pop-up de DDD para o número atual (sem
  // DDD) e busca a sugestão pela região do CEP (ViaCEP `ddd`). Nunca chuta.
  function openDddPrompt() {
    const raw = (state.clientDetail && state.clientDetail.whatsapp) || (state.modalClient && (state.modalClient.phone || state.modalClient.phoneNormalized || state.modalClient.whatsapp)) || "";
    const local = phoneDigits(raw);
    if (!local || phoneComplete(local)) return; // nada a completar
    const cep = onlyDigits((state.clientPaymentDraft && state.clientPaymentDraft.cep) || (state.clientDetail && state.clientDetail.cep) || (state.modalClient && state.modalClient.cep) || "");
    state.dddPrompt = { local, name: (state.modalClient && (state.modalClient.nome || state.modalClient.name)) || "Cliente", cep, ddd: "", suggested: "", suggesting: cep.length === 8, saving: false };
    render();
    if (cep.length === 8) void suggestDddFromCep(cep);
  }
  async function suggestDddFromCep(cep) {
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { headers: { Accept: "application/json" } });
      const data = await response.json();
      const ddd = data && !data.erro ? onlyDigits(data.ddd || "").slice(0, 2) : "";
      if (!state.dddPrompt) return; // usuário fechou enquanto buscava
      state.dddPrompt.suggesting = false;
      state.dddPrompt.suggested = ddd;
      if (ddd && !state.dddPrompt.ddd) state.dddPrompt.ddd = ddd;
      render();
    } catch (_) { if (state.dddPrompt) { state.dddPrompt.suggesting = false; render(); } }
  }
  async function confirmDddPrompt() {
    const prompt = state.dddPrompt;
    if (!prompt) return;
    const input = document.getElementById("ddd-input");
    const ddd = onlyDigits(input ? input.value : prompt.ddd).slice(0, 2);
    if (ddd.length !== 2) { toast("Informe o DDD com 2 dígitos.", true); return; }
    const full = ddd + prompt.local;
    if (!phoneComplete(full)) { toast("Número não ficou válido com esse DDD.", true); return; }
    const client = state.modalClient;
    if (!client || !client.id) { toast("Cliente não encontrado.", true); return; }
    prompt.saving = true; render();
    try {
      await saveClientPhone(client, formatPhone(full));
      state.dddPrompt = null;
      await loadClientDetail();
      await loadClients(true, true);
      render();
      toast("DDD adicionado.");
    } catch (error) { prompt.saving = false; render(); toast(humanApiError(error), true); }
  }
  // Grava o telefone no contato PRINCIPAL (PATCH) ou cria um (POST) — mesmo
  // caminho do salvar-cliente, isolado pra reuso do fluxo de DDD. Mantém
  // também o espelho da conta porque a lista/busca de versões antigas da API
  // ainda lê `CustomerProfile.phoneNormalized`.
  async function saveClientPhone(client, phone) {
    await H.api(`/nucleo/contas/${encodeURIComponent(client.id)}`, { method: "PATCH", body: { phone } });
    const detailMatchesClient = state.clientDetail && String(state.clientDetail.id || state.clientDetail.customerProfileId || "") === String(client.id);
    const principalId = client.contatoPrincipalId || (detailMatchesClient && state.clientDetail.contatoPrincipalId);
    if (principalId) await H.api(`/nucleo/telefones/${encodeURIComponent(principalId)}`, { method: "PATCH", body: { whatsapp: phone, phone, isPrincipal: true } });
    else await H.api(`/nucleo/clientes/${encodeURIComponent(client.id)}/telefones`, { method: "POST", body: { nome: client.nome || client.name || phone, whatsapp: phone, phone, isPrincipal: true } });
  }
  function editClientProduct(item) {
    state.clientProductFormOpen = true;
    state.clientProductEditingId = item.id;
    // 27/07 — produto NÃO tem dia: abrir um produto não pode reescrever os dias
    // do CLIENTE (antes, editar um vínculo de TER apagava o SEG dos chips).
    // 27/07 — produto não tem tipo: editar QUALQUER vínculo (até legado "a cada N
    // dias") abre no modo único; salvar converte pros dias do cliente.
    state.clientProductMode = "weekly";
    state.clientProductDraft = {
      productId: String(item.productId || ""), qtdPadrao: String(item.qtdPadrao || 1),
      proximaData: item.proximaData ? String(item.proximaData).slice(0, 10) : "",
      frequenciaDias: String(item.frequenciaDias || 30), scheduledAt: "",
      precoAcordado: item.precoAcordado != null ? String(item.precoAcordado) : ""
    };
    render();
  }
  function deleteClient(client) {
    if (!client || !client.id) return;
    state.confirmation = { type: "delete-client", itemId: client.id, title: "Excluir cliente?", message: `${client.nome || client.name || "Este cliente"} será excluído definitivamente.`, confirmLabel: "Excluir", danger: true, icon: "users" };
    render();
  }
  async function performDeleteClient(client) {
    if (!client || !client.id) return;
    try {
      await H.api(`/nucleo/contas/${encodeURIComponent(client.id)}`, { method: "DELETE" });
      await loadClients(true, true);
      toast("Cliente excluído.");
    } catch (error) { toast(humanApiError(error), true); }
  }
  function archiveProductByHold(product) {
    if (!product) return;
    const active = product.ativo !== false;
    if (!active) { toast("Este produto já está arquivado."); return; }
    state.confirmation = { type: "archive-product", itemId: product.id, title: "Arquivar produto?", message: `${product.nome || product.name || "Produto"} sai do catálogo ativo. Você pode reativar depois.`, confirmLabel: "Arquivar", danger: true, icon: "box" };
    render();
  }
  async function performArchiveProduct(product) {
    if (!product) return;
    try {
      await H.api(`/logistica/produtos/${encodeURIComponent(product.id)}`, { method: "PATCH", body: { ativo: false } });
      await refresh(true);
      toast("Produto arquivado.");
    } catch (error) { toast(humanApiError(error), true); }
  }
  // S3 21/07 — mesma ação de performArchiveProduct, mas chamada de dentro da
  // ficha "Editar produto" (fecha o modal em vez de só dar refresh na lista).
  async function performArchiveProductFromEdit(product) {
    if (!product) return;
    try {
      await H.api(`/logistica/produtos/${encodeURIComponent(product.id)}`, { method: "PATCH", body: { ativo: false } });
      product.ativo = false;
      H.cache.set("logistica-products", state.products);
      await closeOverlay("modal");
      toast("Produto arquivado.");
    } catch (error) { toast(humanApiError(error), true); }
  }
  async function deleteClientProduct(item) {
    if (!item || !item.id) return;
    const name = item.produto && item.produto.nome || "este produto";
    state.confirmation = { type: "delete-client-product", itemId: item.id, title: "Excluir produto?", message: `${name} será removido das entregas recorrentes deste cliente.`, confirmLabel: "Excluir", danger: true, icon: "box" };
    render();
  }
  async function performDeleteClientProduct(item) {
    if (!item || !item.id) return;
    try {
      await H.api(`/logistica/cliente-produtos/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (state.clientProductEditingId === item.id) { resetClientProductEditor(); state.clientProductFormOpen = false; }
      await loadClientProducts();
      toast("Produto removido das entregas recorrentes.");
    } catch (error) { toast(humanApiError(error), true); }
  }
  function blankNewClientDraft() { return { name: "", phone: "", cpf: "", limite: "", formaPagamento: "aberto", metodoPadrao: "", diaFechamento: "", cep: "", endereco: "", numero: "", bairro: "", cidade: "", uf: "", lat: null, lng: null, geoFonte: null, observacoes: "" }; }
  function paymentFields(draft, target) {
    // PR18072026 Módulo Financeiro — unifica "aberto"(Na entrega)+"na_hora" numa
    // única forma "Na hora"; cliente legado com formaPagamento="aberto" continua
    // válido no backend (nunca reescrito aqui), só é EXIBIDO como "na_hora" ativo.
    // Cada forma só entra na lista se seu toggle de config estiver ligado; se
    // todas estiverem OFF, esconde o seletor inteiro (só resta limite/saldo).
    const rawForm = draft.formaPagamento || "na_hora";
    const form = rawForm === "aberto" ? "na_hora" : rawForm;
    const options = [
      configFlag("aceitaNaHora") ? ["na_hora", "Na hora"] : null,
      configFlag("aceitaMensal") ? ["mensal", "Mensal"] : null,
      configFlag("aceitaFiado") ? ["pendura", "Fiado"] : null,
    ].filter(Boolean);
    const formaSelector = options.length ? `<div class="section-title"><strong>Forma de pagamento</strong></div><div class="recurrence-modes">${options.map(([id, label]) => `<button type="button" class="recurrence-mode ${form === id ? "active" : ""}" data-payment-form="${id}" data-payment-target="${target}">${label}</button>`).join("")}</div>` : "";
    const naHoraDisponivel = options.some(([id]) => id === "na_hora");
    const mensalDisponivel = options.some(([id]) => id === "mensal");
    return `${formaSelector}${form === "na_hora" && naHoraDisponivel ? `<div class="field"><label>Recebe por</label><div class="recurrence-modes"><button type="button" class="recurrence-mode ${draft.metodoPadrao === "pix" ? "active" : ""}" data-payment-method="pix" data-payment-target="${target}">Pix</button><button type="button" class="recurrence-mode ${draft.metodoPadrao === "dinheiro" ? "active" : ""}" data-payment-method="dinheiro" data-payment-target="${target}">Dinheiro</button></div></div>` : ""}${form === "mensal" && mensalDisponivel ? `<div class="field"><label>Dia de pagamento</label><input name="diaFechamento" type="number" inputmode="numeric" min="1" max="31" value="${H.escape(draft.diaFechamento || "")}" placeholder="Ex.: 10"></div>` : ""}<div class="field"><label>Limite</label><input name="limite" inputmode="decimal" type="number" min="0" step="0.01" value="${H.escape(draft.limite || "")}" placeholder="R$ 0,00"></div>${target === "client" && state.modalClient && state.modalClient.id ? `<button type="button" class="btn btn-secondary btn-block historico-abrir" data-action="open-historico">${icon("calendar", 18)} Histórico</button>` : ""}`;
  }
  function onlyDigits(value) { return String(value || "").replace(/\D/g, ""); }
  function formatPhone(value) { const digits = onlyDigits(value).slice(0, 11); if (digits.length <= 2) return digits ? `(${digits}` : ""; if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`; const split = digits.length <= 10 ? 6 : 7; return `(${digits.slice(0, 2)}) ${digits.slice(2, split)}-${digits.slice(split)}`; }
  function savedPhone(value) { let digits = onlyDigits(value); if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2); return (digits.length === 10 || digits.length === 11) && !/^0+$/.test(digits) ? formatPhone(digits) : ""; }
  // Dígitos "locais" do telefone (sem +55). Base de displayPhone/phoneComplete.
  function phoneDigits(value) { let digits = onlyDigits(value); if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2); return /^0+$/.test(digits) ? "" : digits; }
  // Um número só é DISCÁVEL com DDD (10 fixo / 11 celular). O resto (8-9 díg.,
  // salvo sem DDD) é incompleto — precisa perguntar o DDD antes de ligar.
  function phoneComplete(value) { const d = phoneDigits(value); return d.length === 10 || d.length === 11; }
  // Exibe QUALQUER número não-vazio (o feedback do dono: "tem telefone e não
  // exibe"). Com DDD → formata normal; 8-9 díg. sem DDD → mostra só o número
  // local (nunca chuta os 2 primeiros como DDD, que é o bug do formatPhone).
  function displayPhone(value) { const d = phoneDigits(value); if (!d) return ""; if (d.length >= 10) return formatPhone(d); if (d.length === 9) return `${d.slice(0, 5)}-${d.slice(5)}`; if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`; return d; }
  function formatPhoneInput(value) { const d = phoneDigits(value).slice(0, 11); return d.length < 10 ? displayPhone(d) : formatPhone(d); }
  function formatCpf(value) { const digits = onlyDigits(value).slice(0, 11); return digits.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2"); }
  function formatCep(value) { const digits = onlyDigits(value).slice(0, 8); if (digits.length <= 2) return digits; if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`; return `${digits.slice(0, 2)}.${digits.slice(2, 5)}-${digits.slice(5)}`; }
  // S4 21/07 (achado #0, 1a aplicacao da classe unica de aviso) - o status do
  // CEP era texto cinza cru (`.subtitle`) e sucesso/erro tinham a MESMA cara.
  // Classifica pela mensagem exata (zero copy nova, Lei 8) em ok/warn; texto
  // de carregamento (termina em reticencias) fica neutro, sem caixa, pra nao
  // piscar moldura a cada digito digitado.
  function cepStatusKind(message) {
    const text = String(message || "");
    if (!text || /[.]{3}$|…$/.test(text)) return "";
    const OK = [
      "Endereço preenchido. Informe o número.",
      "Endereço preenchido. Confirme o número.",
      "Endereço localizado. Salve o cliente para confirmar.",
      "Localização preenchida. Confirme o número.",
    ];
    return OK.includes(text) ? "ok" : "warn";
  }
  function clientAddressFields(fields, status, mode) {
    const isNew = mode === "new";
    const statusKind = cepStatusKind(status);
    const statusClass = statusKind ? `hbx-aviso hbx-aviso--${statusKind}` : "subtitle";
    return `<div class="section-title"><strong>Endereço</strong></div><div class="client-address-row client-address-primary"><div class="field"><label>CEP</label><input name="cep" inputmode="numeric" maxlength="10" value="${H.escape(fields.cep || "")}" placeholder="00.000-000"></div><div class="field"><label>Rua / Avenida</label><input name="endereco" maxlength="240" value="${H.escape(fields.endereco || "")}"></div><div class="field"><label>Nº</label><input name="numero" inputmode="numeric" maxlength="30" value="${H.escape(fields.numero || "")}"></div></div><p class="${statusClass} ${isNew ? "new-client-cep-status" : "client-cep-status"}" ${status ? "" : "hidden"}>${H.escape(status || "")}</p><div class="field"><label>Bairro</label><input name="bairro" maxlength="120" value="${H.escape(fields.bairro || "")}"></div><div class="client-address-row client-address-city"><div class="field"><label>Cidade</label><input name="cidade" maxlength="120" value="${H.escape(fields.cidade || "")}"></div><div class="field"><label>UF</label><input name="uf" maxlength="2" autocapitalize="characters" value="${H.escape(fields.uf || "")}"></div></div><div class="client-location-actions">${isNew ? `<button type="button" class="btn btn-secondary btn-block" data-action="new-client-gps">${icon("gps", 16)} Usar minha localização</button>` : ""}<button type="button" class="btn btn-secondary btn-block client-locate-address" data-action="${isNew ? "new-client-locate-address" : "locate-client-address"}">${icon("map", 16)} Consultar local</button></div><div class="field"><label>Observações</label><textarea name="observacoes" maxlength="500" placeholder="Ex.: entregar só depois das 14h, portão azul">${H.escape(fields.observacoes || "")}</textarea></div>`;
  }
  function separateAddress(value, numberValue, districtValue) {
    let endereco = String(value || "").trim(); const numero = String(numberValue || "").trim(); const bairro = String(districtValue || "").trim();
    if (bairro && endereco.endsWith(` - ${bairro}`)) endereco = endereco.slice(0, -(` - ${bairro}`).length);
    if (numero && endereco.endsWith(`, ${numero}`)) endereco = endereco.slice(0, -(`, ${numero}`).length);
    return { endereco: endereco.trim(), numero, bairro };
  }
  function composeAddress(draft) { return [[String(draft.endereco || "").trim(), String(draft.numero || "").trim()].filter(Boolean).join(", "), String(draft.bairro || "").trim()].filter(Boolean).join(" - "); }
  async function geocodeNewClient(query) {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=br&limit=1&q=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" } });
      const hit = response.ok ? (await response.json())[0] : null; const lat = Number(hit && hit.lat); const lng = Number(hit && hit.lon);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    } catch (error) { return null; }
  }
  async function lookupNewClientCep(value) {
    const cep = onlyDigits(value); if (cep.length !== 8) return;
    state.newClientCepStatus = "Buscando CEP…"; render();
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { headers: { Accept: "application/json" } });
      const data = response.ok ? await response.json() : null;
      if (!data || data.erro) throw new Error("CEP não encontrado.");
      Object.assign(state.newClientDraft, { cep: formatCep(cep), endereco: data.logradouro || "", bairro: data.bairro || "", cidade: data.localidade || "", uf: data.uf || "", lat: null, lng: null, geoFonte: null });
      state.newClientCepStatus = "Endereço preenchido. Informe o número."; render();
      const point = await geocodeNewClient([data.logradouro, data.bairro, data.localidade, data.uf, cep].filter(Boolean).join(", "));
      if (point) { Object.assign(state.newClientDraft, point, { geoFonte: "geocode" }); render(); }
    } catch (error) { state.newClientCepStatus = "CEP não encontrado. Preencha o endereço."; render(); }
  }
  function setClientCepStatus(message) {
    state.clientCepStatus = message || "";
    const status = app.querySelector(".client-cep-status");
    if (status) {
      status.textContent = state.clientCepStatus;
      status.hidden = !state.clientCepStatus;
      const kind = cepStatusKind(state.clientCepStatus);
      status.className = `${kind ? `hbx-aviso hbx-aviso--${kind}` : "subtitle"} client-cep-status`;
    }
  }
  async function lookupClientCep(value) {
    const cep = onlyDigits(value);
    if (cep.length !== 8) return;
    const requestId = ++clientCepRequestId;
    setClientCepStatus("Buscando CEP…");
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { headers: { Accept: "application/json" } });
      const data = response.ok ? await response.json() : null;
      if (requestId !== clientCepRequestId) return;
      if (!data || data.erro) throw new Error("CEP não encontrado.");
      Object.assign(state.clientPaymentDraft, { cep: formatCep(cep), endereco: data.logradouro || "", bairro: data.bairro || "", cidade: data.localidade || "", uf: data.uf || "", lat: null, lng: null, geoFonte: null });
      const form = app.querySelector("#client-details-form");
      ["cep", "endereco", "bairro", "cidade", "uf"].forEach(name => { const field = form && form.elements.namedItem(name); if (field) field.value = state.clientPaymentDraft[name] || ""; });
      setClientCepStatus("Endereço preenchido. Confirme o número.");
      const point = await geocodeNewClient([data.logradouro, data.bairro, data.localidade, data.uf, cep].filter(Boolean).join(", "));
      if (requestId === clientCepRequestId && point) Object.assign(state.clientPaymentDraft, point, { geoFonte: "geocode" });
    } catch (_) {
      if (requestId === clientCepRequestId) setClientCepStatus("CEP não encontrado. Preencha o endereço.");
    }
  }
  async function locateClientAddress() {
    const draft = state.clientPaymentDraft;
    const street = [String(draft.endereco || "").trim(), String(draft.numero || "").trim()].filter(Boolean).join(", ");
    const query = [street, String(draft.bairro || "").trim(), String(draft.cidade || "").trim(), String(draft.uf || "").trim(), onlyDigits(draft.cep || "")].filter(Boolean).join(", ");
    if (!street || !draft.cidade) return setClientCepStatus("Preencha rua, número e cidade para localizar.");
    setClientCepStatus("Localizando este endereço…");
    let point = await geocodeNewClient(query);
    if (!point && onlyDigits(draft.cep || "").length === 8) {
      // Ruas locais podem trazer sufixos do bairro (ex.: "JP") que ainda não
      // existem no OSM. Respeita o intervalo do Nominatim e cai no CEP, que
      // mantém o pino na região postal correta sem inventar coordenadas.
      await new Promise(resolve => setTimeout(resolve, 1100));
      point = await geocodeNewClient([formatCep(draft.cep), draft.cidade, draft.uf].filter(Boolean).join(", "));
    }
    if (!point) return setClientCepStatus("Não foi possível localizar este endereço.");
    Object.assign(state.clientPaymentDraft, point, { geoFonte: "geocode" });
    setClientCepStatus("Endereço localizado. Salve o cliente para confirmar.");
    H.vibrate(12);
  }
  async function locateNewClientAddress() {
    const draft = state.newClientDraft;
    const street = [String(draft.endereco || "").trim(), String(draft.numero || "").trim()].filter(Boolean).join(", ");
    const query = [street, String(draft.bairro || "").trim(), String(draft.cidade || "").trim(), String(draft.uf || "").trim(), onlyDigits(draft.cep || "")].filter(Boolean).join(", ");
    if (!street || !draft.cidade) { state.newClientCepStatus = "Preencha rua, número e cidade para localizar."; render(); return; }
    state.newClientCepStatus = "Localizando este endereço…"; render();
    let point = await geocodeNewClient(query);
    if (!point && onlyDigits(draft.cep || "").length === 8) {
      await new Promise(resolve => setTimeout(resolve, 1100));
      point = await geocodeNewClient([formatCep(draft.cep), draft.cidade, draft.uf].filter(Boolean).join(", "));
    }
    if (!point) { state.newClientCepStatus = "Não foi possível localizar este endereço."; render(); return; }
    Object.assign(state.newClientDraft, point, { geoFonte: "geocode" });
    state.newClientCepStatus = "Endereço localizado. Salve o cliente para confirmar."; render();
    H.vibrate(12);
  }
  async function useCurrentLocationForNewClient(permissionReady) {
    if (!navigator.geolocation) return toast("GPS indisponível neste aparelho.", true);
    if (!permissionReady && H.requestLocationPermission) {
      state.newClientCepStatus = "Autorize a localização para preencher este endereço."; render();
      H.requestLocationPermission();
      return;
    }
    state.newClientGpsLoading = true; state.newClientCepStatus = "Lendo localização…"; render();
    try {
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
      markGpsFix();
      const lat = position.coords.latitude; const lng = position.coords.longitude;
      Object.assign(state.newClientDraft, { lat, lng, geoFonte: "gps_cadastro" });
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`, { headers: { Accept: "application/json" } });
      const address = response.ok ? (await response.json()).address || {} : {};
      const stateName = String(address.state || "").toLowerCase(); const stateMap = { "acre":"AC", "alagoas":"AL", "amapá":"AP", "amazonas":"AM", "bahia":"BA", "ceará":"CE", "distrito federal":"DF", "espírito santo":"ES", "goiás":"GO", "maranhão":"MA", "mato grosso":"MT", "mato grosso do sul":"MS", "minas gerais":"MG", "pará":"PA", "paraíba":"PB", "paraná":"PR", "pernambuco":"PE", "piauí":"PI", "rio de janeiro":"RJ", "rio grande do norte":"RN", "rio grande do sul":"RS", "rondônia":"RO", "roraima":"RR", "santa catarina":"SC", "são paulo":"SP", "sergipe":"SE", "tocantins":"TO" };
      Object.assign(state.newClientDraft, { cep: formatCep(address.postcode || state.newClientDraft.cep), endereco: address.road || address.pedestrian || address.footway || state.newClientDraft.endereco, numero: address.house_number || state.newClientDraft.numero, bairro: address.suburb || address.neighbourhood || address.quarter || state.newClientDraft.bairro, cidade: address.city || address.town || address.village || address.municipality || state.newClientDraft.cidade, uf: (String(address["ISO3166-2-lvl4"] || "").match(/^BR-([A-Z]{2})$/) || [])[1] || stateMap[stateName] || state.newClientDraft.uf });
      state.newClientCepStatus = "Localização preenchida. Confirme o número.";
    } catch (error) { state.newClientCepStatus = "Não foi possível obter a localização."; }
    finally { state.newClientGpsLoading = false; render(); }
  }

  // ==========================================================================
  // PR20072026 W2 — Leitura de Rota: wizard "Cadastrar Local" (GPS em campo) +
  // fila offline (localStorage, clientKey idempotente, replay em ordem) +
  // wizard de finalização (resumo/timeline → dia da semana → nome → Feito.).
  // Contrato dos endpoints é LEI de 00-ORQUESTRACAO.md — não inventar campos.
  // ==========================================================================
  const weekDayFullLabels = { 1: "Segunda-feira", 2: "Terça-feira", 3: "Quarta-feira", 4: "Quinta-feira", 5: "Sexta-feira", 6: "Sábado", 7: "Domingo" };
  function diaSemanaLabel(n) { return weekDayFullLabels[n] || ""; }
  function blankLeituraNovoDraft() { return { nome: "", telefone: "", cep: "", endereco: "", numero: "", bairro: "", cidade: "", uf: "", lat: null, lng: null, geoFonte: null, gpsAccuracy: null }; }
  // Captura de GPS de alta precisão (teto do que dá pra fazer sem pagar API
  // paga — só Geolocation nativa do WebView). Antes era getCurrentPosition de
  // tiro único: 1 fix ruim (dentro de galpão/prédio) virava 'gps_cadastro' pra
  // sempre, porque essa fonte é intocável (autocorreção nunca reescreve).
  // Agora amostra com watchPosition e guarda SEMPRE a MELHOR leitura (menor
  // accuracy), parando cedo ao atingir um fix "bom o bastante" ou desistindo
  // no timeout total — o que vier primeiro — e devolve a melhor amostra obtida
  // até ali (nunca inventa coordenada: sem nenhum fix, resolve null como antes).
  const LEITURA_GPS_ACCURACY_BOA_M = 20; // atingiu isso, para de amostrar
  const LEITURA_GPS_TIMEOUT_MS = 15000; // desiste e usa a melhor amostra até aqui
  function leituraCapturePosition() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      let best = null;
      let settled = false;
      let watchId = null;
      let timeoutId = null;
      // Limpa o watch em QUALQUER saída (fix bom, timeout, permissão negada) —
      // watchPosition esquecido drena a bateria de quem passa o dia na rua.
      const finish = () => {
        if (settled) return;
        settled = true;
        if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
        if (timeoutId != null) { clearTimeout(timeoutId); timeoutId = null; }
        resolve(best);
      };
      watchId = navigator.geolocation.watchPosition(
        p => {
          markGpsFix();
          const accuracy = Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null;
          if (!best || (accuracy != null && (best.accuracy == null || accuracy < best.accuracy))) {
            best = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy };
          }
          if (accuracy != null && accuracy <= LEITURA_GPS_ACCURACY_BOA_M) finish();
        },
        err => {
          if (!best) markGpsError(err);
          // Permissão negada não melhora esperando — desiste na hora. Timeout/
          // indisponível momentâneo segue amostrando até o teto de tempo.
          if (err && err.code === 1) finish();
        },
        { enableHighAccuracy: true, timeout: LEITURA_GPS_TIMEOUT_MS, maximumAge: 0 }
      );
      timeoutId = setTimeout(finish, LEITURA_GPS_TIMEOUT_MS);
    });
  }
  // Reverse geocode Nominatim — mesmo padrão de useCurrentLocationForNewClient,
  // duplicado aqui de propósito (fluxo isolado; não mexe no cadastro existente).
  async function reverseGeocodeLeitura(lat, lng) {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`, { headers: { Accept: "application/json" } });
      if (!response.ok) return null;
      const address = (await response.json()).address || {};
      const stateName = String(address.state || "").toLowerCase();
      const stateMap = { "acre": "AC", "alagoas": "AL", "amapá": "AP", "amazonas": "AM", "bahia": "BA", "ceará": "CE", "distrito federal": "DF", "espírito santo": "ES", "goiás": "GO", "maranhão": "MA", "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", "pará": "PA", "paraíba": "PB", "paraná": "PR", "pernambuco": "PE", "piauí": "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS", "rondônia": "RO", "roraima": "RR", "santa catarina": "SC", "são paulo": "SP", "sergipe": "SE", "tocantins": "TO" };
      return {
        cep: formatCep(address.postcode || ""),
        endereco: address.road || address.pedestrian || address.footway || "",
        numero: address.house_number || "",
        bairro: address.suburb || address.neighbourhood || address.quarter || "",
        cidade: address.city || address.town || address.village || address.municipality || "",
        uf: (String(address["ISO3166-2-lvl4"] || "").match(/^BR-([A-Z]{2})$/) || [])[1] || stateMap[stateName] || "",
      };
    } catch (_) { return null; }
  }
  // Consulta de endereço digitado no cadastro feito durante a leitura.
  // Mantém este fluxo isolado do cadastro normal de clientes.
  async function lookupLeituraNovoCep(value) {
    const cep = onlyDigits(value); if (cep.length !== 8) return;
    state.leituraNovoCepStatus = "Buscando CEP…"; render();
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { headers: { Accept: "application/json" } });
      const data = response.ok ? await response.json() : null;
      if (!data || data.erro) throw new Error("CEP não encontrado.");
      Object.assign(state.leituraNovoDraft, { cep: formatCep(cep), endereco: data.logradouro || "", bairro: data.bairro || "", cidade: data.localidade || "", uf: data.uf || "", lat: null, lng: null, geoFonte: null, gpsAccuracy: null });
      state.leituraNovoCepStatus = "Endereço preenchido. Informe o número.";
      render();
      const point = await geocodeNewClient([data.logradouro, data.bairro, data.localidade, data.uf, cep].filter(Boolean).join(", "));
      if (point) { Object.assign(state.leituraNovoDraft, point, { geoFonte: "geocode", gpsAccuracy: null }); state.leituraNovoCepStatus = "Endereço localizado."; render(); }
    } catch (_) { state.leituraNovoCepStatus = "CEP não encontrado. Preencha o endereço."; render(); }
  }
  async function locateLeituraNovoAddress() {
    const draft = state.leituraNovoDraft;
    const street = [String(draft.endereco || "").trim(), String(draft.numero || "").trim()].filter(Boolean).join(", ");
    const query = [street, String(draft.bairro || "").trim(), String(draft.cidade || "").trim(), String(draft.uf || "").trim(), onlyDigits(draft.cep || "")].filter(Boolean).join(", ");
    if (!street || !draft.cidade) { state.leituraNovoCepStatus = "Preencha rua, número e cidade para localizar."; render(); return; }
    state.leituraNovoCepStatus = "Localizando este endereço…"; render();
    let point = await geocodeNewClient(query);
    if (!point && onlyDigits(draft.cep || "").length === 8) {
      await new Promise(resolve => setTimeout(resolve, 1100));
      point = await geocodeNewClient([formatCep(draft.cep), draft.cidade, draft.uf].filter(Boolean).join(", "));
    }
    if (!point) { state.leituraNovoCepStatus = "Não foi possível localizar este endereço."; render(); return; }
    Object.assign(draft, point, { geoFonte: "geocode", gpsAccuracy: null });
    state.leituraNovoCepStatus = "Endereço localizado.";
    render();
    H.vibrate(12);
  }
  // Fila offline: cada item é {sessionId, clientKey, payload} — persistido em
  // localStorage via H.cache. clientKey garante idempotência no backend
  // (sessaoId+clientKey); replay sempre em ordem (shift do array).
  const LEITURA_QUEUE_KEY = "logistica-leitura-fila";
  function leituraQueueAll() { const raw = H.cache.get(LEITURA_QUEUE_KEY, []); return Array.isArray(raw) ? raw : []; }
  function leituraQueueForSession(sessionId) { return leituraQueueAll().filter(row => row && String(row.sessionId) === String(sessionId)); }
  function leituraQueuePush(sessionId, clientKey, payload) { const all = leituraQueueAll(); all.push({ sessionId, clientKey, payload }); H.cache.set(LEITURA_QUEUE_KEY, all); }
  function leituraQueueRemove(sessionId, clientKey) { H.cache.set(LEITURA_QUEUE_KEY, leituraQueueAll().filter(row => !(row && String(row.sessionId) === String(sessionId) && row.clientKey === clientKey))); }
  function leituraQueueClearSession(sessionId) { H.cache.set(LEITURA_QUEUE_KEY, leituraQueueAll().filter(row => !(row && String(row.sessionId) === String(sessionId)))); }
  function leituraPendingCount() { return state.leitura ? leituraQueueForSession(state.leitura.id).length : 0; }
  function persistLeituraSession() { if (state.leitura) H.cache.set("logistica-leitura", state.leitura); else H.cache.remove("logistica-leitura"); }
  // S3 21/07 — ponte nativa da Leitura de Rota (GPS ao vivo), contrato exato
  // em S2-CONTRATO-PONTE.md §1: window.HBXAndroid.{iniciarLeituraTrilha,
  // pararLeituraTrilha,resolverPausaLeitura,leituraStatus}. Síncronos,
  // fire-and-forget, sem H.api/HTTP. Guard igual ao já usado pro auto-update
  // (typeof HBXAndroid === "undefined" cobre navegador sem a ponte nativa).
  function leituraTrilhaIniciar(leituraId) {
    try { if (typeof HBXAndroid !== "undefined" && typeof HBXAndroid.iniciarLeituraTrilha === "function") HBXAndroid.iniciarLeituraTrilha(String(leituraId)); } catch (_) {}
  }
  // S06 (fix 21/07) — "Iniciar Leitura de Rota" chamava leituraTrilhaIniciar
  // sem garantir a permissão de localização antes: numa instalação nova o
  // Android nunca perguntava nada e o serviço nativo se autoencerrava em
  // silêncio (S2-CONTRATO-PONTE.md §1) — a trilha gravava ZERO sem erro na
  // tela. Reaproveita o MESMO mecanismo de startLeituraGpsCapture acima
  // (H.requestLocationPermission + callback locationPermissionChanged), só
  // que aqui não queremos um fix de GPS, só a permissão concedida — resolve
  // a Promise via leituraTrilhaPermResolve quando o callback chega.
  // Já concedida: locationPermissionChanged(true) volta quase na hora (a
  // ponte nativa responde direto, sem diálogo) — zero fricção extra.
  let leituraTrilhaPermResolve = null;
  function ensureLeituraTrilhaLocationPermission() {
    return new Promise(resolve => {
      if (typeof HBXAndroid === "undefined" || !H.requestLocationPermission) { resolve(true); return; }
      leituraTrilhaPermResolve = resolve;
      state.leituraTrilhaAwaitingGps = true;
      H.requestLocationPermission();
    });
  }
  function leituraTrilhaParar() {
    try { if (typeof HBXAndroid !== "undefined" && typeof HBXAndroid.pararLeituraTrilha === "function") HBXAndroid.pararLeituraTrilha(); } catch (_) {}
  }
  function leituraPausaResolver(aceitar) {
    try { if (typeof HBXAndroid !== "undefined" && typeof HBXAndroid.resolverPausaLeitura === "function") HBXAndroid.resolverPausaLeitura(!!aceitar); } catch (_) {}
  }
  function leituraStatusSnapshot() {
    try {
      if (typeof HBXAndroid === "undefined" || typeof HBXAndroid.leituraStatus !== "function") return null;
      const raw = HBXAndroid.leituraStatus();
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }
  function leituraLocationSample(raw) {
    const source = raw || {};
    const lat = Number(source.lat); const lng = Number(source.lng);
    if (!validCoordinates(lat, lng)) return null;
    const optionalNumber = value => value == null || value === "" ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
    return {
      lat, lng, ts: optionalNumber(source.ts), accuracyM: optionalNumber(source.accuracyM),
      speedMps: optionalNumber(source.speedMps), bearingDeg: optionalNumber(source.bearingDeg),
    };
  }
  // Aplica o snapshot completo (leituraStatus(), chamado 1x ao abrir a tela
  // viva) no estado de desenho — é sempre um REPLACE (fonte da verdade do
  // nativo), nunca um merge; os pontos incrementais de hbx:leitura-ponto (ver
  // listener no fim do arquivo) só somam depois desse resync inicial.
  function applyLeituraSnapshot(snapshot) {
    if (!snapshot) return;
    if (Array.isArray(snapshot.pontos)) state.leituraTrilha = snapshot.pontos.filter(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))).map(p => [Number(p[0]), Number(p[1])]);
    const latest = leituraLocationSample(snapshot.ultimaAmostra);
    state.leituraUltimaAmostra = latest || null;
    if (snapshot.pausaPendente) state.leituraPausaPendente = snapshot.pausaPendente;
  }
  function leituraRouteActive() {
    return state.screen === "route" && !!(state.leitura && state.leitura.modo === "LEITURA");
  }
  // S2 21/07 (PR21072026-NAVEGAÇÃO) — mapa da Rota vira a navegação: ativo só
  // quando a rota está rodando de verdade (routeActive() já é serverRouteActive()
  // && openItems().length>0 && !routePaused — o !state.routePaused aqui é
  // paranoia redundante, mantida pra bater com a leitura literal do spec) e
  // NÃO há Leitura tomando conta do mesmo mapa — mutuamente exclusivos, nunca
  // os dois watchers vivos ao mesmo tempo (ver routeLiveMode acima).
  function navModeActive() {
    return routeActive() && !state.routePaused && !leituraRouteActive();
  }
  // Abre (ou reabre) a leitura na própria tela Rota. O snapshot nativo continua
  // sendo sincronizado, mas não existe mais um segundo mapa/modal para exibi-lo.
  async function openLeituraAtiva() {
    applyLeituraSnapshot(leituraStatusSnapshot());
    state.screen = "route";
    if (state.modal) await closeOverlay("modal");
    else render();
    // A transmutação acontece só na entrada. Os renders seguintes recriam o
    // conteúdo sem esta classe, evitando que qualquer ação faça os controles
    // piscarem/repetirem a animação.
    requestAnimationFrame(() => app.querySelector(".leitura-route-controls")?.classList.add("is-entering"));
  }
  let leituraFlushing = false;
  let leituraFlushPromise = Promise.resolve();
  // Sincroniza a fila em ordem; falha de rede no meio pára e deixa o resto
  // esperando (nunca perde uma parada, nunca reordena).
  async function flushLeituraQueue() {
    if (!state.leitura) return;
    // Aguarda o flush que já estiver em andamento para preservar a ordem.
    if (leituraFlushing) {
      await leituraFlushPromise;
      return;
    }
    leituraFlushing = true;
    const sessionId = state.leitura.id;
    // S3 22/07 — sync_complete SÓ toca se havia pendência ANTES do flush
    // (capturado aqui, fora do try, antes de qualquer tentativa de rede).
    // "Sincronizar" é chamado tanto pelo usuário quanto sozinho (evento
    // "online" no fim do arquivo, e ao terminar a Leitura) — sem este guard
    // o motorista ganharia um ding toda vez que apertasse Sincronizar com a
    // fila já vazia, e ele aperta por ansiedade, não porque há algo pra
    // mandar (regra dura do S3, ver S3-ENTREGA-E-SINCRONIA.md).
    const hadPending = leituraQueueForSession(sessionId).length > 0;
    leituraFlushPromise = (async () => {
      try {
        // Lê a cabeça da fila a cada volta para também consumir paradas que
        // entrarem enquanto este mesmo flush estiver em andamento.
        while (true) {
          const row = leituraQueueForSession(sessionId)[0];
          if (!row) break;
          try {
            await H.api(`/logistica/leitura/${encodeURIComponent(sessionId)}/parada`, { method: "POST", body: row.payload });
            leituraQueueRemove(sessionId, row.clientKey);
          } catch (_) { break; }
        }
        if (hadPending && !leituraQueueForSession(sessionId).length) H.sound("sync_complete");
      } finally { leituraFlushing = false; render(); }
    })();
    await leituraFlushPromise;
  }
  // Boot / retomada: GET /logistica/leitura/atual é a fonte de verdade quando
  // alcançável; falha de rede preserva a sessão já em cache local (offline-first
  // — o motorista continua registrando sem depender do boot ter sucesso).
  async function restoreLeituraSession() {
    try {
      const result = await H.api("/logistica/leitura/atual");
      if (result && result.id && result.modo !== "LEITURA") {
        try { await H.api(`/logistica/leitura/${encodeURIComponent(result.id)}/cancelar`, { method: "POST", body: {} }); } catch (_) {}
        leituraQueueClearSession(result.id);
        state.leitura = null;
      } else if (result && result.id) {
        const cached = state.leitura;
        const serverCount = Array.isArray(result.paradas) ? result.paradas.length : 0;
        const cachedCount = cached && String(cached.id) === String(result.id) ? Number(cached.count || 0) : 0;
        state.leitura = { id: result.id, modo: result.modo || "LEITURA", startedAt: result.startedAt, count: Math.max(serverCount, cachedCount) };
      } else state.leitura = null;
      persistLeituraSession();
      render();
      void flushLeituraQueue();
    } catch (_) { /* offline: mantém a sessão local e tenta de novo quando houver rede */ }
  }
  function leituraDefaultValor(productId) {
    const acordado = state.leituraClienteProdutos[String(productId)];
    if (acordado != null) return Number(acordado);
    const client = state.leituraSelectedClient;
    if (client && client.precoPadrao != null && Number(client.precoPadrao) > 0) return Number(client.precoPadrao);
    const product = (state.products || []).find(p => String(p.id) === String(productId));
    return product ? Number(product.precoCatalogo ?? product.price ?? 0) : 0;
  }
  function normalizeCatalogProducts(rows) {
    return (Array.isArray(rows) ? rows : [])
      .filter(product => !product || !product.kind || (product.kind === "tenant_product" && product.usaLogistica !== false))
      .map(product => {
        if (!product) return product;
        const fromManager = product.status !== undefined || product.priceCents !== undefined || product.stock !== undefined;
        return {
          ...product,
          nome: product.nome || product.name || "",
          ativo: fromManager ? String(product.status || "").toLowerCase() === "active" : product.ativo !== false,
          precoCatalogo: product.precoCatalogo != null
            ? Number(product.precoCatalogo)
            : (product.priceCents != null ? Number(product.priceCents) / 100 : (product.price != null ? Number(product.price) : null)),
          estoque: product.estoque != null ? Number(product.estoque) : (product.stock != null ? Number(product.stock) : null),
        };
      });
  }
  function itemLabel(productId) { const p = (state.products || []).find(pr => String(pr.id) === String(productId)); return p ? `${p.nome || p.name || "Produto"} · ${p.unidade || "unidade"}` : "Produto"; }
  // PR20072026 fix 20/07 — carrega os produtos JÁ cadastrados do cliente e (a)
  // guarda o preço acordado por produto (usado como valor sugerido) e (b)
  // PRÉ-CARREGA esses produtos como itens da parada (o dono pediu: "não carrega
  // produto pré cadastrado"). Cliente sem produto salvo → itens fica limpo.
  async function loadLeituraClienteProdutos(customerProfileId) {
    try {
      const result = await H.api(`/logistica/cliente-produtos?customerProfileId=${encodeURIComponent(customerProfileId)}`);
      const list = Array.isArray(result) ? result : (result && (result.items || result.data)) || [];
      const map = {};
      const itens = [];
      list.forEach(item => {
        if (!item || item.productId == null || item.ativo === false) return;
        if (item.precoAcordado != null) map[String(item.productId)] = Number(item.precoAcordado);
        if (itens.some(i => String(i.productId) === String(item.productId))) return; // dedupe: cliente pode ter 2 vínculos do mesmo produto
        const prod = (state.products || []).find(p => String(p.id) === String(item.productId));
        const nome = (item.produto && item.produto.nome) || (prod && (prod.nome || prod.name)) || "Produto";
        const unidade = (item.produto && item.produto.unidade) || (prod && prod.unidade) || "unidade";
        itens.push({ productId: item.productId, nome, unidade, qtd: Number(item.qtdPadrao || 1), valorUnit: null });
      });
      // Bug#4 — guarda de corrida: se o motorista já trocou de cliente enquanto
      // esta resposta estava em voo, NÃO aplica o mapa de preços (senão o preço
      // sugerido do cliente novo vinha do acordo do anterior).
      if (!state.leituraSelectedClient || String(state.leituraSelectedClient.id) !== String(customerProfileId)) return;
      state.leituraClienteProdutos = map; // setar ANTES do leituraDefaultValor (ele lê esse mapa)
      // Só pré-carrega se o usuário ainda está neste cliente e não montou itens à mão.
      if (!state.leituraItens.length) {
        itens.forEach(it => { it.valorUnit = leituraDefaultValor(it.productId); });
        state.leituraItens = itens;
      }
      render();
    } catch (_) { state.leituraClienteProdutos = {}; }
  }
  function leituraExistenteResults() {
    const capture = state.leituraCapture;
    const hasGps = capture && validCoordinates(capture.lat, capture.lng);
    const pool = state.clients || [];
    const withDistance = pool.map(client => {
      const lat = Number(client.lat); const lng = Number(client.lng);
      const dist = hasGps && validCoordinates(lat, lng) ? distanceMeters(capture, { lat, lng }) : null;
      return { client, dist };
    });
    withDistance.sort((a, b) => {
      if (a.dist === null && b.dist === null) return String(a.client.nome || "").localeCompare(String(b.client.nome || ""));
      if (a.dist === null) return 1;
      if (b.dist === null) return -1;
      return a.dist - b.dist;
    });
    return withDistance;
  }
  function chooseLeituraClient(client) {
    if (!client || !client.id) return;
    state.leituraSelectedClient = client;
    state.leituraClienteProdutos = {};
    state.leituraItens = [];
    void loadLeituraClienteProdutos(client.id);
    state.leituraTelefoneValue = savedPhone(client.phone || client.phoneNormalized || client.whatsapp || "") || "";
    state.leituraTelefoneConfirmado = false;
    state.leituraTelefoneCorrigindo = false;
    state.leituraEnd = null;
    state.leituraEndNovo = false;
    const cap = state.leituraCapture;
    const temGps = cap && Number.isFinite(Number(cap.lat)) && Number.isFinite(Number(cap.lng));
    if (temGps) {
      const requestId = ++leituraEnderecoRequestId;
      state.leituraEnd = { loading: true, loadingStage: "signal", reverse: null, decision: null, numero: String(client.numero || "") };
      void changeLeituraStep("endereco").then(changed => { if (changed) void startLeituraEndereco(client, cap, requestId); });
    }
    else void changeLeituraStep("telefone");
  }
  async function advanceLeituraNovoDraft() {
    const draft = state.leituraNovoDraft;
    state.leituraSelectedClient = null;
    state.leituraClienteProdutos = {};
    state.leituraTelefoneValue = draft.telefone || "";
    state.leituraTelefoneConfirmado = !!draft.telefone;
    state.leituraTelefoneCorrigindo = false;
    const cap = state.leituraCapture;
    const temGps = cap && Number.isFinite(Number(cap.lat)) && Number.isFinite(Number(cap.lng));
    if (temGps) {
      state.leituraEndNovo = true;
      const requestId = ++leituraEnderecoRequestId;
      state.leituraEnd = { loading: true, loadingStage: "signal", reverse: null, decision: null, numero: String(draft.numero || "") };
      const changed = await changeLeituraStep("endereco");
      if (changed) void startLeituraEndereco({ numero: draft.numero || "" }, cap, requestId);
    } else {
      state.leituraEndNovo = false;
      state.leituraEnd = null;
      await changeLeituraStep("telefone");
    }
  }
  async function changeLeituraStep(nextStep, beforeEnter) {
    if (!nextStep || state.leituraStepChanging) return false;
    state.leituraStepChanging = true;
    state.leituraStepMotion = "exit";
    render();
    await new Promise(resolve => setTimeout(resolve, 170));
    if (typeof beforeEnter === "function") beforeEnter();
    state.leituraStep = nextStep;
    state.leituraStepMotion = "enter";
    render();
    await new Promise(resolve => setTimeout(resolve, 240));
    state.leituraStepMotion = "";
    state.leituraStepChanging = false;
    return true;
  }
  // Passo do wizard "Cadastrar Local" que o Voltar (físico ou botão) deve
  // reabrir; devolve null quando já está no primeiro passo (tipo) — o chamador
  // fecha a folha inteira nesse caso. SÍNCRONO de propósito: o handleBack do
  // Kotlin só lê o boolean de retorno, então precisa decidir "tem passo
  // anterior?" sem await (Lei 10).
  function leituraBackTarget() {
    const step = state.leituraStep;
    if (!step || step === "tipo") return null;
    if (step === "existente" || step === "novo") return { step: "tipo" };
    // F3.2 — cliente existente na LEITURA passa por endereço → número antes do telefone.
    // Bug#1: no sub-modo "Digitar endereço" o Voltar/X deve só SAIR da edição
    // (não pular 2 passos e perder o que foi digitado).
    if (step === "endereco" && state.leituraEnd && state.leituraEnd.editing) return { step: "endereco", beforeEnter: () => { state.leituraEnd.editing = false; } };
    if (step === "endereco") return { step: state.leituraEndNovo ? "novo" : "existente" };
    if (step === "numero") return { step: "endereco" };
    if (step === "telefone") return { step: state.leituraEnd ? "numero" : (state.leituraSelectedClient ? "existente" : "novo") };
    if (step === "produto") return { step: "telefone" };
    // `before` roda ANTES da transição (o timer tem que morrer na hora);
    // `beforeEnter` roda no meio dela (conteúdo já escondido).
    if (step === "observacoes") return { step: "produto", before: () => clearInterval(leituraObsTimer) };
    return null;
  }
  async function leituraGoBack() {
    const target = leituraBackTarget();
    if (!target) return false;
    if (target.before) target.before();
    await changeLeituraStep(target.step, target.beforeEnter);
    return true;
  }
  async function performCancelLeitura() {
    if (!state.leitura) return;
    const sessionId = state.leitura.id;
    try { await H.api(`/logistica/leitura/${encodeURIComponent(sessionId)}/cancelar`, { method: "POST", body: {} }); }
    catch (error) { toast(humanApiError(error), true); }
    leituraTrilhaParar();
    leituraQueueClearSession(sessionId);
    state.leitura = null;
    persistLeituraSession();
    state.leituraTrilha = [];
    state.leituraUltimaAmostra = null;
    state.leituraPausaPendente = null;
    // 25/07 — o redesenho NÃO pode depender do closeOverlay: ele sai na hora
    // (`if (state.closingOverlay) return`) quando outra animação de overlay
    // está em voo, e aí a tela ficava com a faixa "Gravando" desenhada com
    // state.leitura JÁ nulo — a partir daí "Cancelar" não fazia mais nada
    // (promptCancelLeitura sai no `!state.leitura`) e a tela parecia travada.
    // Fecha o modal SÓ se houver um (mesmo idioma de openLeituraAtiva) e
    // manda um render() incondicional depois.
    if (state.modal) await closeOverlay("modal");
    render();
    toast("Leitura cancelada.");
  }
  // S3 21/07 — "Cancelar" da tela viva (botão, X, fundo E handleBack, Lei 10)
  // caem todos aqui: mesma confirmação `.app-confirm` (Lei 3) que o antigo
  // botão "Cancelar leitura" da faixa já usava.
  function promptCancelLeitura() {
    // Sem sessão viva não há o que cancelar — mas se a faixa "Gravando" ainda
    // está na tela, ela é sobra de desenho: redesenha em vez de engolir o
    // toque calado (era o beco sem saída do "travado em Gravando").
    if (!state.leitura) { render(); return; }
    // O botão neutro NÃO pode se chamar "Cancelar" num popup cujo título já é
    // "Cancelar leitura?": os dois "Cancelar" querem dizer o contrário um do
    // outro e o toque no errado devolvia pra tela gravando (relato do dono
    // 25/07: "já cancelei e a tela fica travada em Gravando").
    state.confirmation = { type: "cancel-leitura", title: "Cancelar leitura?", message: "Descarta as paradas desta leitura. Clientes, Agenda e rotas já salvas não mudam.", confirmLabel: "Descartar leitura", cancelLabel: "Continuar gravando", danger: true, icon: "route" };
    render();
  }
  // Fecha o cadastro de parada e retorna à leitura ativa.
  async function closeLeituraParadaModal() {
    await closeOverlay("modal");
    if (state.leitura && state.leitura.modo === "LEITURA") await openLeituraAtiva();
  }
  // Abre o wizard "Cadastrar Local" com a captura do GPS. Zera o estado do
  // wizard e carrega a lista de clientes se ainda não veio.
  function openLeituraParada(capture) {
    state.leituraCapture = capture;
    state.leituraStep = "tipo";
    state.leituraClientMode = null;
    state.leituraSelectedClient = null;
    state.leituraClienteProdutos = {};
    state.leituraNovoDraft = blankLeituraNovoDraft();
    state.leituraNovoEditing = false;
    state.leituraEnd = null;
    state.leituraEndNovo = false;
    state.leituraNovoCepStatus = "";
    state.leituraClienteQuery = "";
    state.leituraTelefoneValue = "";
    state.leituraTelefoneConfirmado = false;
    state.leituraTelefoneCorrigindo = false;
    state.leituraItens = [];
    state.leituraProdutoPicker = false;
    state.leituraProdutoQuery = "";
    showModal("leitura-parada");
    // O seletor e a tela Clientes dividem a mesma lista e a mesma busca: abrir o
    // seletor com o termo herdado da outra tela mostraria lista filtrada e caixa
    // de busca vazia. Zera o termo e recarrega quando havia filtro.
    const precisaRecarregar = state.clientsPage === 0 || state.query !== "";
    state.query = "";
    if (precisaRecarregar) void loadClients(true, true).then(() => {
      if (state.modal === "leitura-parada") render();
    });
  }
  // PR20072026 fix 20/07 — "não foi possível obter sua localização": a WebView
  // precisa da permissão nativa (H.requestLocationPermission) ANTES do
  // getCurrentPosition. Se a 1ª leitura falha, pede a permissão e retoma pelo
  // callback locationPermissionChanged (state.leituraAwaitingGps).
  async function startLeituraGpsCapture() {
    if (!state.leitura || state.leituraCapturing) return;
    state.leituraCapturing = true; render();
    const position = await leituraCapturePosition();
    if (position) { finishLeituraGpsCapture(position); return; }
    if (H.requestLocationPermission) { state.leituraAwaitingGps = true; H.requestLocationPermission(); return; }
    state.leituraCapturing = false;
    toast("Não foi possível obter sua localização. Tente novamente.", true);
    render();
  }
  // Teto do backend pra 'gps_cadastro' virar ponto DEFINITIVO (contrato
  // gpsAccuracy); acima disso o backend grava como aproximado e corrige
  // sozinho na 1ª entrega confirmada. Só orienta o aviso — quem decide a
  // fonte é sempre o servidor, aqui é apenas UX.
  const LEITURA_GPS_ACCURACY_APROXIMADO_M = 60;
  function finishLeituraGpsCapture(position) {
    state.leituraCapturing = false;
    if (!position) { toast("Não foi possível obter sua localização. Tente novamente.", true); render(); return; }
    const accuracy = Number(position.accuracy);
    if (Number.isFinite(accuracy) && accuracy > LEITURA_GPS_ACCURACY_APROXIMADO_M) {
      toast(`Local aproximado (±${Math.round(accuracy)} m) — ajusta sozinho na 1ª entrega.`, false, { warn: true });
    }
    openLeituraParada({ ...position, capturadoEm: new Date().toISOString() });
  }
  async function performRemoveLeituraParada(paradaId) {
    if (!state.leitura || !paradaId) return;
    try {
      await H.api(`/logistica/leitura/${encodeURIComponent(state.leitura.id)}/parada/${encodeURIComponent(paradaId)}`, { method: "DELETE" });
      state.leituraResumo = await H.api(`/logistica/leitura/${encodeURIComponent(state.leitura.id)}/resumo`);
      toast("Parada removida.");
    } catch (error) { toast(humanApiError(error), true); }
    render();
  }
  async function prepareLeituraNome() {
    await loadRouteModelos(true);
    // F1 — sem dia da semana: nome sugerido "Rota dd/mm" (com dedupe numérico).
    const label = state.leituraDiaEscolhido ? diaSemanaLabel(state.leituraDiaEscolhido) : rotaDefaultName();
    const existingNames = new Set((state.routeModelos || []).map(m => String(m.nome || "").trim().toLowerCase()));
    let candidate = label; let n = 2;
    while (existingNames.has(candidate.toLowerCase())) { candidate = `${label} ${n}`; n += 1; }
    state.leituraNomeRota = candidate;
    state.leituraNomeError = "";
    render();
  }
  // F3.2 — reverse geocode do ponto capturado: tenta o backend (server-side,
  // confiável) e cai no Nominatim direto do app se o backend não responder.
  async function leituraReverse(lat, lng) {
    try {
      const r = await H.api(`/logistica/geo/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
      if (r && (r.endereco || r.cidade) && r.fonte !== "nenhum") return r;
    } catch (_) {}
    return await reverseGeocodeLeitura(lat, lng);
  }
  function clientAddressText(client) {
    if (!client) return "";
    // S1 21/07 (achado 3) — não repetir o número: alguns cadastros antigos já
    // trazem "nº X" dentro do próprio `endereco`, e o join duplicava (ex.:
    // "Avenida 5, 1079, 1079"). Só concatena `numero` se ele ainda não aparece
    // no texto do endereço (borda de palavra, pra não casar sub-string à toa).
    const endereco = client.endereco || "";
    const numero = client.numero != null ? String(client.numero).trim() : "";
    const numeroJaNoEndereco = numero && new RegExp(`(^|\\D)${numero.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\D|$)`).test(endereco);
    const rua = [endereco, numeroJaNoEndereco ? "" : numero].filter(Boolean).join(", ");
    return [rua, client.bairro, client.cidade].filter(Boolean).join(" · ");
  }
  function reverseAddressText(rev) {
    if (!rev) return "";
    const rua = [rev.endereco, rev.numero].filter(Boolean).join(", ");
    return [rua, rev.bairro, rev.cidade].filter(Boolean).join(" · ") || "Endereço não identificado";
  }
  // F3.2 — abre o passo ENDEREÇO: busca o reverse do GPS e mede a distância pro
  // pino do cadastro (se houver), pro passo decidir "confere" × "diverge".
  async function startLeituraEndereco(client, cap, activeRequestId) {
    const requestId = activeRequestId || ++leituraEnderecoRequestId;
    if (!state.leituraEnd || !state.leituraEnd.loading) {
      state.leituraEnd = { loading: true, loadingStage: "signal", reverse: null, decision: null, numero: String(client.numero || "") };
      render();
    }
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (requestId !== leituraEnderecoRequestId || state.leituraStep !== "endereco") return;
    state.leituraEnd.loadingStage = "address";
    render();
    let rev = null;
    try { rev = await leituraReverse(cap.lat, cap.lng); } catch (_) {}
    if (requestId !== leituraEnderecoRequestId || state.leituraStep !== "endereco") return;
    const clat = Number(client.lat), clng = Number(client.lng);
    const dist = validCoordinates(clat, clng) ? distanceMeters({ lat: cap.lat, lng: cap.lng }, { lat: clat, lng: clng }) : null;
    state.leituraEnd = { loading: false, reverse: rev, dist, decision: null, numero: String(client.numero || (rev && rev.numero) || "") };
    render();
  }
  // F3.2 — grava a decisão do passo endereço no cadastro do cliente. "atualizar":
  // substitui endereço + pino pelo GPS/reverse (mesmo contrato do editar cliente:
  // PATCH conta + local). "manter": só grava o número se mudou. Best-effort.
  async function persistLeituraEndereco(numero) {
    const client = state.leituraSelectedClient;
    const e = state.leituraEnd;
    if (!e) return;
    // Cliente NOVO: ainda não existe conta — grava o endereço do GPS no rascunho
    // (vai no clienteNovo do finalizar). Nada de PATCH.
    if (state.leituraEndNovo || !client || !client.id) {
      const cap = state.leituraCapture || {};
      const r = e.chosen || e.reverse || {};
      const digitado = !!e.chosenTyped;
      const d = state.leituraNovoDraft;
      Object.assign(d, {
        endereco: r.endereco || d.endereco || "",
        numero: numero || d.numero || "",
        bairro: r.bairro || d.bairro || "",
        cidade: r.cidade || d.cidade || "",
        uf: String(r.uf || d.uf || "").toUpperCase(),
        cep: r.cep || d.cep || "",
        // Pino do GPS só vale quando o endereço veio do GPS; se foi 100% digitado
        // sem base de GPS, não força coordenada (evita pino errado).
        // gpsAccuracy (metros) viaja junto — o backend decide a fonte definitiva
        // × aproximada, o app só reporta o número honesto da captura.
        ...(Number.isFinite(Number(cap.lat)) && Number.isFinite(Number(cap.lng)) && !digitado ? { lat: cap.lat, lng: cap.lng, geoFonte: "gps_cadastro", gpsAccuracy: Number.isFinite(Number(cap.accuracy)) ? Number(cap.accuracy) : null } : {}),
      });
      return;
    }
    const cap = state.leituraCapture || {};
    let loading = false;
    try {
      if (e.decision === "atualizar" && (e.chosen || e.reverse)) {
        const r = e.chosen || e.reverse;
        const digitado = !!e.chosenTyped;
        const coords = Number.isFinite(Number(cap.lat)) && Number.isFinite(Number(cap.lng)) && !digitado ? { lat: Number(cap.lat), lng: Number(cap.lng) } : {};
        const body = { endereco: r.endereco || "", numero: numero || "", bairro: r.bairro || "", cidade: r.cidade || "", uf: String(r.uf || "").toUpperCase(), cep: r.cep || "", ...coords };
        loading = true; showLoading("Atualizando endereço…");
        await H.api(`/nucleo/contas/${encodeURIComponent(client.id)}`, { method: "PATCH", body });
        try {
          if (client.localId) await H.api(`/nucleo/locais/${encodeURIComponent(client.localId)}`, { method: "PATCH", body });
          else if (body.endereco || body.cep) await H.api(`/nucleo/clientes/${encodeURIComponent(client.id)}/locais`, { method: "POST", body: { ...body, isPrincipal: true } });
        } catch (_) {}
        Object.assign(client, body);
        toast("Endereço atualizado.");
      } else if (numero && String(client.numero || "") !== numero) {
        await H.api(`/nucleo/contas/${encodeURIComponent(client.id)}`, { method: "PATCH", body: { numero } });
        client.numero = numero;
      }
    } catch (error) { toast(humanApiError(error), true); }
    finally { if (loading) hideLoading(); }
  }
  function leituraEnderecoStep() {
    const client = state.leituraSelectedClient || {};
    const e = state.leituraEnd || {};
    const temEndereco = !!(client.endereco || client.cidade);
    const resumo = leituraResumo() || client.nome || "";
    if (e.loading) {
      const receiving = e.loadingStage !== "address";
      const body = `<div class="lrt-endereco-loading lrt-gps-loading" role="status" aria-live="polite"><div class="lrt-endereco-loading-icon">${icon("gps", 24)}</div><strong>${receiving ? "Recebendo sinal do GPS…" : "Localizando endereço…"}</strong><span>${receiving ? "Aguarde só um instante." : "Conferindo o endereço deste local."}</span></div>`;
      return centerModal({ icon: "map", title: "Endereço", resumo, body, backAction: "leitura-voltar", nextAction: "" });
    }
    // Modo DIGITAR — campos editáveis (pré-preenchidos com o que o GPS achou ou o
    // que já estava no cadastro). O dono pediu: sempre poder digitar/corrigir.
    if (e.editing) {
      const f = e.form || {};
      const body = `<div data-enter-scope data-enter-action="leitura-end-salvar-digitado"><div class="field"><label>Rua / Avenida</label><input id="lend-endereco" maxlength="240" value="${H.escape(f.endereco || "")}" placeholder="Ex.: Rua 16"></div><div class="field"><label>Bairro</label><input id="lend-bairro" maxlength="120" value="${H.escape(f.bairro || "")}"></div><div class="client-address-row client-address-city"><div class="field"><label>Cidade</label><input id="lend-cidade" maxlength="120" value="${H.escape(f.cidade || "")}"></div><div class="field"><label>UF</label><input id="lend-uf" maxlength="2" autocapitalize="characters" value="${H.escape(f.uf || "")}"></div></div><div class="field"><label>CEP</label><input id="lend-cep" inputmode="numeric" maxlength="10" value="${H.escape(f.cep || "")}"></div><div class="center-modal-extra"><button class="btn btn-primary btn-block rp2-cta" type="button" data-action="leitura-end-salvar-digitado">Usar este endereço</button></div></div>`;
      return centerModal({ icon: "map", title: "Digitar endereço", resumo, body, backAction: "leitura-end-cancelar-digitar", backLabel: "Voltar", nextAction: "" });
    }
    const rev = e.reverse;
    // Confere = tem endereço no cadastro E o GPS caiu perto do pino (≤120 m).
    const confere = temEndereco && e.dist !== null && e.dist <= 120;
    const digitarBtn = `<button class="btn btn-secondary btn-block" type="button" data-action="leitura-end-digitar">${icon("map", 15)} Digitar endereço</button>`;
    let body;
    if (!rev) {
      body = `<div class="lrt-endereco-options"><div class="lrt-endereco-option"><strong>Não foi possível identificar o endereço</strong><span>Tente localizar novamente ou digite o endereço.</span></div></div><div class="center-modal-extra"><button class="btn btn-primary btn-block rp2-cta" type="button" data-action="leitura-end-retry">Localizar novamente</button>${digitarBtn}</div>`;
    } else if (!temEndereco) {
      const titulo = state.leituraEndNovo ? "Endereço do local (pelo GPS):" : "Cliente sem endereço.";
      body = `<div class="lrt-endereco-options"><div class="lrt-endereco-option lrt-endereco-option--gps"><strong>${titulo}</strong><span>${H.escape(reverseAddressText(rev))}</span></div></div><div class="center-modal-extra"><button class="btn btn-primary btn-block rp2-cta" type="button" data-action="leitura-end-usar">Usar este endereço</button>${digitarBtn}</div>`;
    } else if (confere) {
      body = `<div class="lrt-endereco-card lrt-endereco-ok">${icon("check", 16)} Endereço confere${e.dist !== null ? ` · a ${Math.round(e.dist)} m` : ""}</div><p class="day-home-sub">${H.escape(clientAddressText(client))}</p><div class="center-modal-extra">${digitarBtn}</div>`;
    } else {
      body = `<div class="lrt-endereco-options"><div class="lrt-endereco-option"><strong>Endereço cadastrado</strong><span>${H.escape(clientAddressText(client) || "—")}</span></div><div class="lrt-endereco-option lrt-endereco-option--gps"><strong>Endereço encontrado pelo GPS</strong><span>${H.escape(reverseAddressText(rev))}${e.dist !== null ? ` · ${Math.round(e.dist)} m do cadastro` : ""}</span></div><p class="lrt-endereco-warning">Atualizar substitui o endereço anterior.</p></div><div class="center-modal-extra"><button class="btn btn-primary btn-block rp2-cta" type="button" data-action="leitura-end-atualizar">Atualizar com GPS</button><button class="btn btn-secondary btn-block" type="button" data-action="leitura-end-manter">Manter o cadastrado</button>${digitarBtn}</div>`;
    }
    // Quando confere, o › avança direto pro número; senão o avanço é pelos botões.
    return centerModal({ icon: "map", title: "Endereço", resumo, body, backAction: "leitura-voltar", nextAction: confere ? "leitura-end-manter" : "", nextLabel: "Próximo" });
  }
  function leituraNumeroStep() {
    const e = state.leituraEnd || {};
    const body = `<div class="field" data-enter-scope data-enter-action="leitura-numero-confirmar"><label>Número da casa</label><input id="leitura-numero-input" class="lrt-input-lg" inputmode="numeric" maxlength="30" value="${H.escape(String(e.numero || ""))}" placeholder="Ex.: 1079"></div>`;
    return centerModal({ icon: "map", title: "Número", resumo: leituraResumo() || (state.leituraSelectedClient && state.leituraSelectedClient.nome) || "", body, backAction: "leitura-end-voltar-numero", nextAction: "leitura-numero-confirmar", nextLabel: "Próximo" });
  }
  // Resumo curto do que já foi escolhido nesta parada (cliente · itens) — some no
  // header do modal central pra idoso não perder o fio.
  function leituraResumo() {
    const parts = [];
    const c = state.leituraSelectedClient;
    if (c) parts.push(c.nome || c.name || "Cliente");
    else if (state.leituraNovoDraft && state.leituraNovoDraft.nome) parts.push(state.leituraNovoDraft.nome);
    const itens = state.leituraItens || [];
    if (itens.length) parts.push(itens.map(i => `${i.qtd}× ${i.nome}`).join(" · "));
    return parts.length ? H.escape(parts.join("  ·  ")) : "";
  }
  function leituraTipoStep() {
    const body = `<div class="lrt-choice"><button class="row-card lrt-choice-btn" type="button" data-action="leitura-tipo-existente"><span class="card-main"><strong>Cliente existente</strong></span><span class="rp2-mode-chev">${icon("chevronRight", 18)}</span></button><button class="row-card lrt-choice-btn" type="button" data-action="leitura-tipo-novo"><span class="card-main"><strong>Cliente novo</strong></span><span class="rp2-mode-chev">${icon("chevronRight", 18)}</span></button></div>`;
    return centerModal({ icon: "gps", title: "Novo local", resumo: "Cliente novo ou existente?", body, closeButtonAction: "close-modal", backAction: "close-modal", backLabel: "Fechar" });
  }
  function leituraExistenteStep() {
    const rows = leituraExistenteResults();
    // "Mais perto primeiro" só quando há distância real (cliente com GPS); senão
    // é ordem alfabética — não mentir pro motorista (F3.5).
    const temDistancia = rows.some(r => r.dist !== null);
    const query = duplicateTextKey(state.leituraClienteQuery);
    const visibleCount = rows.filter(({ client }) => duplicateTextKey(`${client.nome || client.name || ""} ${client.phone || client.whatsapp || client.phoneNormalized || ""} ${address(client)}`).includes(query)).length;
    const list = rows.length ? `<div class="list hbx-selection-list" id="leitura-cliente-list">${rows.map(({ client, dist }) => clientCatalogCard(client, { selection: true, distance: dist, hidden: !!query && !duplicateTextKey(`${client.nome || client.name || ""} ${client.phone || client.whatsapp || client.phoneNormalized || ""} ${address(client)}`).includes(query) })).join("")}</div>` : "";
    const noResults = rows.length ? `<div class="empty hbx-selection-state" id="leitura-cliente-empty"${visibleCount ? " hidden" : ""}><strong>Nenhum cliente encontrado</strong>Tente outro nome, telefone ou endereço.</div>` : empty(state.clientsLoading ? "Carregando…" : "Nenhum cliente encontrado", "");
    const body = `<div class="hbx-selection-view"><label class="search hbx-selection-toolbar">${icon("search", 16)}<input id="leitura-cliente-search" placeholder="Buscar por nome, telefone ou endereço" value="${H.escape(state.leituraClienteQuery)}" autocomplete="off"></label>${list}${noResults}${clientsAutoLoad()}</div>`;
    return centerModal({ icon: "users", title: "Cliente existente", resumo: temDistancia ? "Mais perto primeiro" : "Ordem alfabética", body, backAction: "leitura-voltar" });
  }
  function leituraNovoStep() {
    const draft = state.leituraNovoDraft;
    const summary = [[draft.endereco, draft.numero].filter(Boolean).join(", "), draft.bairro].filter(Boolean).join(" - ");
    const body = `<form id="leitura-novo-form"><div class="field"><label>Nome</label><input name="nome" required maxlength="160" value="${H.escape(draft.nome)}"></div><div class="field"><label>Telefone</label><input name="telefone" inputmode="tel" maxlength="15" value="${H.escape(draft.telefone)}" placeholder="(00) 00000-0000"></div>${state.leituraNovoEditing ? `<div class="section-title"><strong>Endereço</strong><button type="button" class="link-btn" data-action="leitura-novo-endereco-fechar">Fechar</button></div><div class="field"><label>CEP</label><input name="cep" inputmode="numeric" maxlength="10" value="${H.escape(draft.cep)}" placeholder="00.000-000"></div><div class="client-address-row client-address-primary"><div class="field"><label>Rua / Avenida</label><input name="endereco" maxlength="240" value="${H.escape(draft.endereco)}"></div><div class="field"><label>Nº</label><input name="numero" inputmode="numeric" maxlength="30" value="${H.escape(draft.numero)}"></div></div><div class="field"><label>Bairro</label><input name="bairro" maxlength="120" value="${H.escape(draft.bairro)}"></div><div class="client-address-row client-address-city"><div class="field"><label>Cidade</label><input name="cidade" maxlength="120" value="${H.escape(draft.cidade)}"></div><div class="field"><label>UF</label><input name="uf" maxlength="2" autocapitalize="characters" value="${H.escape(draft.uf)}"></div></div>${state.leituraNovoCepStatus ? `<p class="subtitle">${H.escape(state.leituraNovoCepStatus)}</p>` : ""}<div class="client-location-actions"><button type="button" class="btn btn-secondary btn-block client-locate-address" data-action="leitura-novo-consultar-local">${icon("map", 16)} Consultar local</button></div>` : `<p class="subtitle lrt-address-summary"><span>${summary ? `Endereço: ${H.escape(summary)}` : "Endereço não localizado ainda."}</span> <button type="button" class="link-btn" data-action="leitura-novo-endereco-editar">editar</button></p>`}<button class="btn btn-primary btn-block rp2-cta" type="submit">Confirmar</button></form>`;
    return centerModal({ icon: "users", title: "Cliente novo", body, backAction: "leitura-voltar", nextAction: "" });
  }
  function leituraTelefoneStep() {
    const hasPhone = !!state.leituraTelefoneValue;
    const editing = state.leituraTelefoneCorrigindo || !hasPhone;
    const body = editing
      ? `<div class="field" data-enter-scope data-enter-action="leitura-telefone-salvar"><label>Telefone</label><input id="leitura-telefone-input" inputmode="tel" maxlength="15" value="${H.escape(state.leituraTelefoneValue)}" placeholder="(00) 00000-0000"></div>`
      : `<p class="lrt-phone-display">${H.escape(state.leituraTelefoneValue)}</p>`;
    // Ação extra (Salvar / Corrigir) acima das setas: o "Próximo" (›) confirma.
    const extra = editing
      ? `<div class="center-modal-extra"><button class="btn btn-primary btn-block rp2-cta" type="button" data-action="leitura-telefone-salvar">${hasPhone ? "Salvar" : "Continuar sem telefone"}</button></div>`
      : `<div class="center-modal-extra"><button class="btn btn-secondary btn-block" type="button" data-action="leitura-telefone-corrigir">Corrigir número</button></div>`;
    return centerModal({ icon: "phone", title: "Telefone", resumo: hasPhone ? "Confirme o número" : "Nenhum telefone cadastrado", body, extra, backAction: "leitura-voltar", nextAction: editing ? "" : "leitura-telefone-confirmar", nextLabel: "Confirmar", nextDisabled: editing });
  }
  // PR20072026 fix 20/07 — a tela "Valor do cliente" foi FUNDIDA aqui (o dono
  // pediu): cada item mostra qtd (−/+) E o valor já pré-preenchido (preço do
  // cliente → do cliente → do catálogo; sem preço = vazio). "Próximo" salva a
  // parada direto (não existe mais passo de valor separado).
  function leituraProdutoStep() {
    const selectedIds = new Set(state.leituraItens.map(i => String(i.productId)));
    const available = (state.products || []).filter(p => p && p.id != null && p.ativo !== false && !selectedIds.has(String(p.id)));
    if (state.leituraProdutoPicker) {
      const query = duplicateTextKey(state.leituraProdutoQuery);
      const visibleCount = available.filter(product => duplicateTextKey(product.nome || product.name || "").includes(query)).length;
      const list = available.length ? `<div class="list hbx-selection-list" id="leitura-produto-list">${available.map(product => productCatalogCard(product, { selection: true, hidden: !!query && !duplicateTextKey(product.nome || product.name || "").includes(query) })).join("")}</div>` : "";
      const noResults = available.length ? `<div class="empty hbx-selection-state" id="leitura-produto-empty"${visibleCount ? " hidden" : ""}><strong>Nenhum produto encontrado</strong>Tente outro nome.</div>` : empty("Todos os produtos já foram adicionados", "Volte para ajustar quantidade e preço.");
      const body = `<div class="hbx-selection-view"><label class="search hbx-selection-toolbar">${icon("search", 16)}<input id="leitura-produto-search" placeholder="Buscar produto" value="${H.escape(state.leituraProdutoQuery)}" autocomplete="off"></label><div class="section-title"><strong>Catálogo</strong><span>${available.length}</span></div>${list}${noResults}</div>`;
      return centerModal({ icon: "box", title: "Produtos", resumo: "Escolha no catálogo", body, backAction: "leitura-produto-fechar-picker", backLabel: "Voltar", nextAction: "" });
    }
    // F3.3 — sem módulo Financeiro, preço fica TRAVADO (cadeado): tocar abre o
    // popup "configurar financeiro?". Com financeiro, campo moeda estilo banco.
    const financeiroOn = configFlag("moduloFinanceiroAtivo");
    const rows = state.leituraItens.map(item => {
      if (item.valorUnit === null || item.valorUnit === undefined) item.valorUnit = leituraDefaultValor(item.productId);
      const valorField = financeiroOn
        ? `<label class="lrt-produto-valor"><span>R$</span><input type="text" inputmode="numeric" class="lrt-produto-valor-input" data-leitura-preco="${H.escape(item.productId)}" data-enter-action="leitura-proximo" value="${H.escape(moneyCentsToBRL(Math.round(Number(item.valorUnit || 0) * 100)))}"></label>`
        : `<button type="button" class="lrt-produto-valor lrt-produto-valor-locked" data-action="leitura-preco-bloqueado" aria-label="Preço bloqueado">${icon("lock", 14)}<span>R$ —</span></button>`;
      // S3 21/07 — o X de remover virou segurar o item (data-lrt-item-hold), sem
      // confirmação (é rascunho local, mesma régua do produto fixado na rota
      // salva/rme-item: pequeno e refazível, "+ Adicionar produto" devolve).
      return `<div class="lrt-produto-item" data-lrt-item-hold="${H.escape(item.productId)}"><div class="lrt-produto-head"><div><strong>${H.escape(item.nome)}</strong><small>${H.escape(item.unidade)}</small></div></div><div class="lrt-produto-controls"><div class="delivery-stepper"><button type="button" data-action="leitura-item-qtd" data-product-id="${H.escape(item.productId)}" data-delta="-1">−</button><b>${item.qtd}</b><button type="button" data-action="leitura-item-qtd" data-product-id="${H.escape(item.productId)}" data-delta="1">+</button></div>${valorField}</div></div>`;
    }).join("");
    const picker = available.length ? `<button class="delivery-add" type="button" data-action="leitura-produto-abrir-picker">+ Adicionar produto</button>` : "";
    const body = `${rows || empty("Nenhum produto ainda", "Toque em adicionar produto abaixo.")}${picker}`;
    return centerModal({ icon: "box", title: "Produto", resumo: leituraResumo() || "O que ele recebe?", body, backAction: "leitura-voltar", nextAction: "leitura-proximo", nextLabel: "Próximo", nextDisabled: !state.leituraItens.length });
  }
  function leituraParadaModal() {
    const step = state.leituraStep;
    if (step === "existente") return leituraExistenteStep();
    if (step === "novo") return leituraNovoStep();
    if (step === "endereco") return leituraEnderecoStep();
    if (step === "numero") return leituraNumeroStep();
    if (step === "telefone") return leituraTelefoneStep();
    if (step === "produto") return leituraProdutoStep();
    if (step === "observacoes") return leituraObsStep();
    return leituraTipoStep();
  }
  // PR20072026 (feedback dono) — última tela da parada: SÓ abre o campo de
  // observações do cliente (o mesmo do /cliente) pra lembrar o motorista na
  // entrega (escadas, cliente chato, horário X). 7s de contagem: se ninguém
  // interage, salva sozinho; foco/toque para a contagem antes mesmo de digitar.
  function leituraObsStep() {
    // Contagem só enquanto ninguém digitou (ao digitar ela some via DOM, sem
    // re-render, pra não roubar o foco do textarea no 1º caractere).
    const hint = state.leituraObsTyped ? "" : `<p class="lrt-obs-count">Salvando em <b class="lrt-obs-secs">${Math.max(0, Number(state.leituraObsCountdown || 0))}</b>s… <span>ou escreva um lembrete</span></p>`;
    const body = `<div class="field"><textarea id="leitura-obs-input" data-enter-action="leitura-obs-salvar" maxlength="500" rows="4" placeholder="Ex.: subir escadas, cachorro bravo, entregar após 18h…">${H.escape(state.leituraObsDraft || "")}</textarea></div>${hint}`;
    return centerModal({ icon: "box", title: "Observações", resumo: leituraResumo() || "Lembrete pra entrega (opcional)", body, backAction: "leitura-voltar", nextAction: "leitura-obs-salvar", nextLabel: "Salvar" });
  }
  // Abre o passo Observações e liga a contagem de 7s (auto-salva ao zerar).
  async function startLeituraObs() {
    clearInterval(leituraObsTimer);
    state.leituraObsDraft = (state.leituraSelectedClient && state.leituraSelectedClient.observacoes) || "";
    state.leituraObsTyped = false;
    state.leituraObsCountdown = 7;
    await changeLeituraStep("observacoes");
    leituraObsTimer = setInterval(() => {
      if (state.leituraStep !== "observacoes" || state.leituraObsTyped) { clearInterval(leituraObsTimer); return; }
      state.leituraObsCountdown = Math.max(0, state.leituraObsCountdown - 1);
      if (state.leituraObsCountdown === 0) { clearInterval(leituraObsTimer); void saveLeituraParada(); return; }
      const secs = document.querySelector(".lrt-obs-secs");
      if (secs) secs.textContent = String(state.leituraObsCountdown);
    }, 1000);
  }
  // Save real da parada (era o corpo do "leitura-proximo"); agrega a observação
  // digitada. `observacoes` só vai quando há texto — assim NÃO apaga a nota já
  // existente do cliente quando o passo é pulado em branco.
  async function saveLeituraParada() {
    clearInterval(leituraObsTimer);
    if (!state.leitura || !state.leituraItens.length || !state.leituraCapture) return;
    const atualizarPrecoAcordado = state.leituraItens.some(item => Math.abs(Number(item.valorUnit || 0) - Number(leituraDefaultValor(item.productId) || 0)) > 0.001);
    const obs = String(state.leituraObsDraft || "").trim().slice(0, 500);
    const clientKey = H.uuid();
    const payload = {
      clientKey,
      capturadoEm: state.leituraCapture.capturadoEm,
      lat: state.leituraCapture.lat,
      lng: state.leituraCapture.lng,
      accuracy: state.leituraCapture.accuracy,
      itens: state.leituraItens.map(item => ({ productId: item.productId, qtd: Number(item.qtd || 1), valorUnit: Number(item.valorUnit || 0) })),
      telefoneConfirmado: !!state.leituraTelefoneConfirmado,
      atualizarPrecoAcordado,
    };
    if (obs) payload.observacoes = obs;
    if (state.leituraSelectedClient) payload.customerProfileId = state.leituraSelectedClient.id;
    else {
      const draft = state.leituraNovoDraft;
      payload.clienteNovo = { nome: draft.nome, telefone: draft.telefone || undefined, cep: draft.cep || undefined, endereco: draft.endereco || undefined, numero: draft.numero || undefined, bairro: draft.bairro || undefined, cidade: draft.cidade || undefined, uf: draft.uf || undefined, lat: draft.lat ?? undefined, lng: draft.lng ?? undefined, geoFonte: draft.geoFonte || "gps_cadastro", gpsAccuracy: draft.gpsAccuracy ?? undefined };
    }
    leituraQueuePush(state.leitura.id, clientKey, payload);
    state.leitura.count = Number(state.leitura.count || 0) + 1;
    persistLeituraSession();
    await closeLeituraParadaModal();
    // S3 22/07 — a parada SEMPRE entra na fila local primeiro (linha acima).
    // Sem internet agora, ela FICA na fila de verdade — isso é "operação
    // entrou na fila" (sync_pending), som mais discreto que offline_saved
    // porque aqui o wizard já tem seu próprio toast dedicado ("Parada
    // registrada.") cobrindo a confirmação visual; sync_pending só soma a
    // pista sonora de "isso ainda não saiu daqui". Com rede, o flush deve
    // resolver quase na hora — não vale duplicar som pra essa janela.
    const ficaNaFilaAgora = !netOnline();
    if (ficaNaFilaAgora) H.sound("sync_pending");
    toast("Parada registrada.", false, { mudo: ficaNaFilaAgora });
    H.vibrate(12);
    void flushLeituraQueue();
  }
  function leituraTimelineStep() {
    const resumo = state.leituraResumo || {};
    const paradas = Array.isArray(resumo.paradas) ? resumo.paradas : [];
    const rows = paradas.map(parada => {
      if (state.leituraEditParadaId === parada.id) {
        const draft = state.leituraEditDraft || { itens: [] };
        // Bug#2 — editar preço da parada usa o MESMO gate do passo Produto:
        // campo moeda-banco; travado (cadeado) quando o Financeiro está desligado
        // (Lei do Vendedor — motorista não digita valor livre).
        const editFinanceiroOn = configFlag("moduloFinanceiroAtivo");
        // Layout EMPILHADO (nome em cima, qtd + preço embaixo) pra caber no modal
        // central — a linha horizontal era do bottom-sheet largo e estourava.
        const itemRows = draft.itens.map(item => {
          const valorField = editFinanceiroOn
            ? `<label class="lrt-produto-valor lrt-produto-valor--edit"><span>R$</span><input type="text" inputmode="numeric" class="lrt-produto-valor-input" data-leitura-edit-preco="${H.escape(item.productId)}" value="${H.escape(moneyCentsToBRL(Math.round(Number(item.valorUnit || 0) * 100)))}"></label>`
            : `<button type="button" class="lrt-produto-valor lrt-produto-valor-locked lrt-produto-valor--edit-locked" data-action="leitura-preco-bloqueado" aria-label="Preço bloqueado">${icon("lock", 14)}<span>R$ —</span></button>`;
          return `<div class="lrt-timeline-edit-item"><strong class="lrt-timeline-edit-item-name">${H.escape(itemLabel(item.productId))}</strong><div class="lrt-timeline-edit-item-row"><div class="delivery-stepper"><button type="button" data-action="leitura-parada-editar-qtd" data-product-id="${H.escape(item.productId)}" data-delta="-1">−</button><b>${item.qtd}</b><button type="button" data-action="leitura-parada-editar-qtd" data-product-id="${H.escape(item.productId)}" data-delta="1">+</button></div>${valorField}</div></div>`;
        }).join("");
        return `<div class="lrt-timeline-row lrt-timeline-editing"><div class="lrt-timeline-edit-body">${itemRows}</div><div class="actions lrt-timeline-edit-actions"><button type="button" class="btn btn-secondary" data-action="leitura-parada-editar-cancelar">Cancelar</button><button type="button" class="btn btn-primary" data-action="leitura-parada-editar-salvar">Salvar</button></div></div>`;
      }
      // S3 21/07 — "Remover" era texto/botão (violava Lei 1); agora é segurar a
      // própria linha (data-lrt-parada-hold), mesmo gesto dos outros 7 holds.
      // "Editar" continua toque curto normal.
      return `<div class="lrt-timeline-row" data-lrt-parada-hold="${H.escape(parada.id)}"><span class="lrt-timeline-time">${H.escape(parada.hora || "")}</span><div class="card-main"><strong>${H.escape(parada.clienteNome || "Cliente")}</strong><span>${H.escape((parada.itens || []).map(i => { const p = (state.products || []).find(pr => String(pr.id) === String(i.productId)); return `${i.qtd} ${(p && (p.unidade || p.nome || p.name)) || i.unidade || i.nome || "item"}`; }).join(", "))}</span></div><strong class="lrt-timeline-valor">${H.money(parada.subtotal)}</strong><div class="lrt-timeline-actions"><button type="button" class="link-btn" data-action="leitura-parada-editar" data-parada-id="${H.escape(parada.id)}">Editar</button></div></div>`;
    }).join("");
    const total = `Total: ${paradas.length} ${paradas.length === 1 ? "parada" : "paradas"} · ${H.money(resumo.total || 0)}`;
    const body = state.leituraResumoLoading ? loading() : state.leituraResumoError ? empty("Não foi possível carregar", state.leituraResumoError) : (rows ? `<div class="lrt-timeline">${rows}</div><p class="lrt-timeline-total">${total}</p>` : empty("Nenhuma parada", "Cadastre paradas antes de finalizar."));
    // S3 21/07 — "Fechar" não pode mais cair na tela Rota crua: a sessão
    // LEITURA agora mora na tela viva (leitura-ativa-fechar reabre ela, ver
    // ação abaixo); "close-modal" genérico deixaria a sessão sem tela nenhuma.
    return centerModal({ icon: "route", title: "Resumo da leitura", resumo: total, body, closeButtonAction: "leitura-finalizar-fechar", backAction: "leitura-finalizar-fechar", backLabel: "Fechar", nextAction: "leitura-ir-salvar", nextLabel: "Salvar rota", nextDisabled: !paradas.length });
  }
  // F1 — nome default da rota quando salva SEM dia da semana: "Rota dd/mm".
  function rotaDefaultName() {
    const d = new Date(`${operationalDate()}T12:00:00`);
    return `Rota ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function leituraSalvarNomeStep() {
    const body = `<form id="leitura-nome-form"><div class="field"><label>Nome da rota</label><input name="nome" maxlength="120" value="${H.escape(state.leituraNomeRota)}"></div>${state.leituraNomeError ? `<p class="subtitle subtitle-danger">${H.escape(state.leituraNomeError)}</p>` : ""}<button class="btn btn-primary btn-block rp2-cta" type="submit" ${state.leituraSaving ? "disabled" : ""}>Confirmar</button></form>`;
    return centerModal({ icon: "route", title: "Nome da rota", resumo: "Dê um nome pra encontrar depois", body, backAction: "leitura-salvar-dia-voltar-nome", nextAction: "" });
  }
  function leituraFinalizarModal() {
    const step = state.leituraFinalStep;
    if (step === "nome") return leituraSalvarNomeStep();
    return leituraTimelineStep();
  }
  // S3 21/07 — "tempo em rota" pro cabeçalho enxuto da tela viva (S3.1):
  // calculado no render (sem timer próprio — os eventos de GPS já disparam
  // render com frequência suficiente enquanto anda).
  function leituraTempoEmRota() {
    const startedAt = state.leitura && state.leitura.startedAt;
    if (!startedAt) return "";
    const ms = Date.now() - new Date(startedAt).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "";
    const minutos = Math.floor(ms / 60000);
    if (minutos < 60) return `${minutos} min`;
    return `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, "0")}`;
  }
  function leituraAtivaResumoTexto() {
    const count = Number(state.leitura && state.leitura.count || 0);
    const paradasTxt = `${count} ${count === 1 ? "parada registrada" : "paradas registradas"}`;
    const tempo = leituraTempoEmRota();
    return tempo ? `${tempo} em rota · ${paradasTxt}` : paradasTxt;
  }
  // S3.1 — tela própria da Leitura em andamento (mapa ao vivo + trilha
  // desenhada + posição atual), em cartão central (Lei 3), sem faixa sobre a
  // tela Rota. Mapa em host PRÓPRIO
  // ("leitura-live-map", ver mountLeituraLiveMap) — nunca reaproveita
  // #route-live-map (regra do transplante __hbxMap).
  function leituraAtivaModal() {
    const body = `<div class="route-map-shell leitura-live-map-shell"><div id="leitura-live-map" class="route-live-map" aria-label="Mapa da leitura em andamento"><span class="route-map-loading">Carregando mapa…</span></div></div><p class="subtitle">A precisão varia conforme o GPS.</p>`;
    const extra = `<div class="center-modal-extra"><button type="button" class="btn btn-primary btn-block rp2-cta" data-action="leitura-cadastrar-local" ${state.leituraCapturing ? "disabled" : ""}>${icon("gps", 17)} ${state.leituraCapturing ? "Lendo GPS…" : "Cadastrar Local"}</button></div>`;
    return centerModal({
      icon: "gps", title: "Leitura de rota", resumo: leituraAtivaResumoTexto(), body, extra,
      closeAction: "leitura-cancelar", closeButtonAction: "leitura-cancelar",
      backAction: "leitura-cancelar", backLabel: "Cancelar",
      nextAction: "leitura-finalizar-iniciar", nextLabel: "Finalizar",
    });
  }

  // R8 (27/07) — painel de créditos CONSUMIDOS no dia, no topo da tela Rota.
  // LEI DO VENDEDOR: só Admin vê valores — entregador comum não tem painel.
  // Ajustes ganha a opção de REMOVER o painel (nasce desativada = painel
  // visível). Toque no painel abre o extrato completo ("Consumo e bônus").
  function creditosPanelOculto() { return H.cache.get("logistica-creditos-panel-oculto", false) === true; }
  async function loadCreditosDia(force) {
    if (!isAdmin() || creditosPanelOculto()) return;
    if (!force && Date.now() - creditosDiaCarregadoEm < 300000) return;
    try {
      const s = await H.api("/logistica/creditos/extrato");
      state.creditosDia = { hoje: Number((s && s.usage && s.usage.hoje) || 0), saldo: Number((s && s.balanceCredits) || 0) };
      creditosDiaCarregadoEm = Date.now();
      render();
    } catch (_) { /* painel é informativo — sem rede, fica com o último valor */ }
  }
  function creditosDiaPanel() {
    if (!isAdmin() || creditosPanelOculto() || !state.creditosDia) return "";
    const hoje = Number(state.creditosDia.hoje || 0);
    return `<button type="button" class="creditos-dia" data-action="statement" aria-label="Consumo de créditos de hoje">${icon("wallet", 14)}<span>Hoje: <b>${hoje}</b> crédito${hoje === 1 ? "" : "s"}</span><span class="creditos-dia-saldo">Saldo: <b>${Number(state.creditosDia.saldo || 0)}</b></span></button>`;
  }
  function routeScreen() {
    if (state.loading) return shell(loading());
    if (!state.route) return shell(empty("Rota indisponível", state.error || "Atualize para tentar novamente."));
    const open = openItems(); const done = deliveredItems(); const total = items().length; const next = open[0];
    const progress = total ? Math.round(done.length / total * 100) : 0;
    const paused = serverRouteActive() && open.length > 0 && state.routePaused;
    const planned = routePlanned();
    const leituraAtiva = leituraRouteActive();
    const mapLabel = leituraAtiva ? "Mapa da leitura em andamento" : paused ? "Mapa da rota pausada" : routeActive() ? "Mapa da rota em andamento" : planned ? "Mapa da rota montada" : "Mapa das entregas do dia";
    // S1 21/07 (PR21072026-NAVEGAÇÃO) — painel compacto "Próxima parada" some na
    // Leitura (ela tem os controles dela, e o topo do mapa já é o gpsStatus/
    // followControl dela — nunca exibem juntos, ver ensureRouteReadingUi).
    const showNextPanel = !!next && !leituraAtiva;
    // Subconjunto da lista conforme o filtro ativo (Fila/Entregue). 28/07 (dono,
    // item 4) — o filtro "Avulsos" saiu junto com a entrega avulsa: a parada da
    // Rota rápida entra na fila do dia como qualquer outra, não numa gaveta.
    const filtered = state.routeFilter === "entregue" ? deliveredItems() : orderedItems().filter(i => (i.status === "agendada" || i.status === "em_rota") && i.id !== next?.id);
    // S2 21/07 — "has-next-panel" empurra route-gps-status/route-follow-control
    // (agora também usados pela navegação normal, não só Leitura) pra baixo do
    // painel "Próxima parada" quando os dois aparecem juntos (ver app.css).
    return shell(`${creditosDiaPanel()}<section class="hero route-hero"><div class="route-map-shell${showNextPanel ? " has-next-panel" : ""}"><div id="route-live-map" class="route-live-map" aria-label="${mapLabel}"><span class="route-map-loading">Carregando mapa…</span></div>${showNextPanel ? routeNextStopPanel(next) : ""}</div><div class="route-controls">${leituraAtiva ? leituraRouteControls() : routeTransmuxControl(planned, paused)}</div>${total ? `<div class="progress"><i style="width:${progress}%"></i></div>` : ""}</section>
      ${total ? `<div class="route-filter" role="tablist" aria-label="Filtros da rota">
        <button type="button" class="route-filter-btn ${state.routeFilter === "fila" ? "active" : ""}" data-action="route-filter" data-filter="fila" role="tab" aria-selected="${state.routeFilter === "fila"}">Fila <b>${open.length}</b></button>
        <button type="button" class="route-filter-btn ${state.routeFilter === "entregue" ? "active" : ""}" data-action="route-filter" data-filter="entregue" role="tab" aria-selected="${state.routeFilter === "entregue"}">Entregue <b>${done.length}</b></button>
      </div>` : ""}
      ${state.routeFilter === "fila" && next && !showNextPanel ? `<div class="section-title"><strong>Próxima parada</strong><span>${next.etaAt ? H.date(next.etaAt, { hour: "2-digit", minute: "2-digit" }) : ""}</span></div>${stopCard(next, true)}` : ""}
      ${total ? (filtered.length ? `<div class="list">${filtered.map((item, index) => `${state.routeFilter === "fila" ? routeLegConnector(item) : ""}${stopCard(item, false, index + (state.routeFilter === "fila" ? 2 : 1))}`).join("")}</div>` : state.routeFilter === "fila" && next ? "" : empty("Nada aqui", "")) : ""}`, leituraAtiva ? "" : `<button class="fab" data-action="rota-rapida" aria-label="Rota rápida">${icon("plus", 22)}</button>`);
  }
  function leituraRouteControls() {
    const checkpointLabel = state.leituraCapturing ? "Lendo GPS…" : "Checkpoint";
    return `<div class="leitura-route-controls" aria-label="Leitura de rota em andamento">
      <button type="button" class="leitura-route-action leitura-route-action--cancel" data-action="leitura-cancelar" aria-label="Cancelar leitura">${icon("trash", 22)}<strong>Cancelar</strong></button>
      <button type="button" class="leitura-route-recording" data-action="leitura-finalizar-iniciar" aria-label="Gravando rota"><span class="leitura-route-recording-dot" aria-hidden="true"></span><strong>Gravando</strong></button>
      <button type="button" class="leitura-route-action leitura-route-action--checkpoint" data-action="leitura-cadastrar-local" aria-label="${checkpointLabel}" ${state.leituraCapturing ? "disabled" : ""}>${icon("gps", 22)}<strong>${checkpointLabel}</strong></button>
    </div>`;
  }
  // S1 21/07 (PR21072026-NAVEGAÇÃO) — overlay compacto no topo do mapa da Rota,
  // irmão do #route-live-map (o mapa é transplantado, este painel não — ele
  // re-renderiza normal a cada render()). Copy EXATA do spec (Lei 8), 2 linhas.
  // n/total = mesma numeração dos cards (orderedItems/items). Toque = showSheet
  // (via data-delivery, mesmo dispatcher que os stopCard já usam).
  // S5 21/07 — linha 2 (routeNextStopSubText, compartilhada com o patch AO
  // VIVO em updateNextStopPanelDistance): em navegação ativa E com step à
  // frente, vira "Em {distância}, {instrução}"; sem step (reta longa) ou fora
  // de navegação, volta pro endereço+distância de sempre.
  function routeNextStopSubText(next) {
    const c = next.cliente || {};
    const step = navActiveVoiceStep();
    if (step) return `Em ${formatRouteDistance(Math.max(0, step.distanceM))}, ${step.instrucao}`;
    const viaria = navModeActive() ? navLegAtualMeters() : null;
    const distanceTxt = viaria != null ? formatRouteDistance(viaria) : (lastKnownPosition && validCoordinates(c.lat, c.lng) ? formatRouteDistance(distanceMeters(lastKnownPosition, { lat: Number(c.lat), lng: Number(c.lng) })) : "");
    return `${address(c)}${distanceTxt ? ` · aproximadamente ${distanceTxt}` : ""}`;
  }
  function routeNextStopPanel(next) {
    const c = next.cliente || {};
    const n = orderedItems().indexOf(next) + 1;
    const total = items().length;
    // S5 21/07 — botão mudo (H.speak) SÓ existe em navegação ativa; fora dela
    // não há voz pra silenciar (Leitura/pausada nunca chegam aqui — H.speak
    // não é chamado, então o botão só confundiria).
    const muteBtn = navModeActive() ? `<button type="button" class="route-next-panel-mute${state.navMudo ? " is-muted" : ""}" data-action="nav-mute-toggle" aria-label="${state.navMudo ? "Ativar voz da navegação" : "Silenciar voz da navegação"}">${icon(state.navMudo ? "volumeOff" : "volume", 18)}</button>` : "";
    return `<div class="route-next-panel"><button type="button" class="route-next-panel-open" data-delivery="${H.escape(next.id)}" aria-label="Ver próxima parada"><strong class="route-next-panel-title">Próxima parada · ${H.escape(c.nome || "Cliente")} — ${n} de ${total}</strong><span class="route-next-panel-sub">${H.escape(routeNextStopSubText(next))}</span></button>${muteBtn}</div>`;
  }
  function routeTransmuxControl(planned, paused) {
    const active = routeActive();
    const main = paused
      ? { state: "resume", action: "resume-route", label: "Continuar rota", caption: "Continuar", glifo: "play" }
      : active
        ? { state: "stop", action: "stop-route", label: "Pausar rota", caption: "Pausar", glifo: "stop" }
        : planned
          // 26/07 (dono): rota pronta que nunca rodou INICIA — "Continuar" era mentira
          // de semântica (só quem pausou continua; o caso paused acima segue "Continuar").
          ? { state: "ready", action: "start-planned-route", label: "Iniciar rota", caption: "Iniciar", glifo: "play" }
          : { state: "plan", action: "plan-route", label: "Montar rota", caption: "Montar rota", glifo: "route" };
    const clearDayVisible = !active && !paused && isAdmin() && openItems().length > 0;
    const routeSatellite = (cls, action, label, caption, glifo, motion) => `<span class="route-control-unit route-control-unit--satellite"><button class="${cls}" type="button" data-action="${action}" aria-label="${H.escape(label)}"${motion ? " data-hbx-motion" : ""}>${icon(glifo, 21)}</button><small class="route-control-label">${H.escape(caption)}</small></span>`;
    // A ação de encerramento/cancelamento/limpeza fica sempre à esquerda. Ela
    // continua protegida pela confirmação original, mas o glifo é neutro como
    // os demais satélites — cor cheia pertence só ao estado principal.
    const leftIcon = active || paused
      ? routeSatellite("route-cancel-icon", "finish-route", "Encerrar rota", "Encerrar", "stop", true)
      : planned && isAdmin()
        ? routeSatellite("route-cancel-icon", "cancel-route", "Cancelar planejamento", "Cancelar", "close")
        : clearDayVisible
          ? routeSatellite("route-cancel-icon", "clear-day-request", "Cancelar entregas abertas", "Cancelar abertas", "close")
          : "";
    // Rota pronta: o satélite da direita ADICIONA paradas na rota que já existe
    // (mesma tela de montagem por baixo). 26/07 (dono, 4ª cobrança): o rótulo diz o
    // que o botão FAZ — "Adicionar na rota", nunca "Montar Rota" com rota já montada.
    const rightIcon = planned
      ? routeSatellite("route-nav-external", "plan-route", "Adicionar na rota", "Adicionar", "route")
      : "";
    return `<div class="route-transmux-wrap"><span class="route-satellite-slot route-satellite-slot--left">${leftIcon}</span><span class="route-control-unit route-control-unit--main" data-state="${main.state}"><button class="route-transmux" type="button" data-action="${main.action}" data-state="${main.state}" aria-label="${main.label}" data-hbx-motion ${state.dayStarting ? "disabled" : ""}>${icon(main.glifo, 44)}</button><small class="route-control-label">${H.escape(main.caption)}</small></span><span class="route-satellite-slot route-satellite-slot--right">${rightIcon}</span></div>`;
  }
  function stopCard(item, featured, sequenceNumber) {
    const c = item.cliente || {}; const done = item.status === "entregue"; const order = sequenceNumber || Math.max(1, orderedItems().indexOf(item) + 1);
    const constraints = routeConstraintChips(routeConstraintSource(item, c));
    return `<article class="stop-card ${featured ? "card" : ""}" data-delivery="${H.escape(item.id)}" data-route-stop="${H.escape(item.id)}" ${featured ? `data-route-current="${H.escape(item.id)}"` : ""} role="button" tabindex="0"><div class="stop-top"><div class="order">${done ? icon("check", 16) : order}</div><div class="card-main"><strong>${H.escape(c.nome || "Cliente")}${item.localApelido ? ` · ${H.escape(item.localApelido)}` : ""}</strong><span>${H.escape(address(c))}</span><small>${H.escape((item.itens || []).map(x => `${x.qtdPrevista}× ${x.produto && x.produto.nome || "item"}`).join(", ") || `${item.quantidade || 0} item(ns)`)}</small>${constraints}${c.observacoes ? `<small class="stop-obs">${H.escape(c.observacoes)}</small>` : ""}</div><span class="badge ${done ? "success" : item.status === "em_rota" ? "warning" : ""}">${H.escape(statusLabel(item.status))}</span></div>${done ? `<div class="stop-actions stop-actions-done"><button class="btn btn-secondary" type="button" data-action="edit-delivered" data-delivery-edit="${H.escape(item.id)}">${icon("edit", 16)} Editar</button></div>` : ""}${featured ? `<div class="stop-actions"><button class="btn btn-secondary" data-action="call-stop" aria-label="Ligar para ${H.escape(c.nome || "cliente")}">${icon("phone", 17)}</button><button class="btn btn-secondary" data-action="wa-stop" aria-label="Abrir WhatsApp de ${H.escape(c.nome || "cliente")}">${icon("wa", 17)}</button><button class="btn btn-primary" data-action="confirm-stop" ${state.deliveryConfirming ? "disabled" : ""}>Confirmar entrega</button></div>` : ""}</article>`;
  }
  // S2 25/07 (PR25072026-ROTA-CONFERIDA) — conector "perna a perna" entre um
  // card e o próximo na FILA: expõe legDistanceM/legDurationS que o backend já
  // calcula por parada (listRota, ver logistica.service.ts) — nada de distância
  // calculada no cliente. Formato pedido: <1000m em metros, ≥1km em "N,N km",
  // minutos arredondados. Só chamado com routeFilter==="fila" (ver routeScreen):
  // na aba Entregue a lista pula paradas fora de ordem — o
  // conector mostraria a perna do vizinho ERRADO (a parada real anterior não
  // está visível ali), então melhor não desenhar do que mentir.
  // Reusa .badge (token existente, zero hex/moldura nova); pino sem coordenada
  // usa .badge.danger (mesmo tom de alerta já usado noutros pontos do app).
  function routeLegConnector(item) {
    if (item.semCoordenada) {
      // 26/07 — jargão fora da tela do motorista (ordem do dono: a palavra
      // "pino" não diz nada pra quem dirige). `semCoordenadaLabel` encurta o
      // selo quando a MESMA linha já explica o motivo logo abaixo (conferência).
      const txt = item.semCoordenadaLabel || "sem trajeto — não sei onde fica este endereço";
      return `<div class="route-leg-connector"><span class="badge danger">${H.escape(txt)}</span></div>`;
    }
    if (!Number.isFinite(item.legDistanceM)) return ""; // 1ª parada da fila: sem perna anterior pra mostrar
    const distTxt = item.legDistanceM < 1000 ? `${Math.round(item.legDistanceM)} m` : `${(item.legDistanceM / 1000).toFixed(1).replace(".", ",")} km`;
    const minTxt = Number.isFinite(item.legDurationS) ? ` · ${Math.round(item.legDurationS / 60)} min` : "";
    return `<div class="route-leg-connector"><span class="badge">↓ ${distTxt}${minTxt}</span></div>`;
  }

  // Os catálogos e o wizard usam o mesmo cartão. Em modo seleção, só mudam a
  // ação e o complemento contextual (distância/selecionar); cadastro e edição
  // continuam pertencendo às telas administrativas reais.
  function clientCatalogCard(client, options) {
    const opts = options || {};
    const selection = !!opts.selection;
    const pending = clientPendingKeys(client);
    const name = client.name || client.nome || "Cliente";
    const phone = savedPhone(client.phone || client.phoneNormalized || client.whatsapp || "");
    const location = address(client);
    const subtitle = selection ? [phone, location].filter(Boolean).join(" · ") || "Sem telefone ou endereço" : location;
    const distance = Number.isFinite(opts.distance) ? opts.distance : null;
    const trailing = selection
      ? (distance !== null ? `<span class="lrt-distance">${distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(1)} km`}</span>` : `<span class="selection-mode-chevron">${icon("chevronRight", 18)}</span>`)
      : `<span class="selection-mode-chevron">${icon("chevronRight", 18)}</span>`;
    const searchText = duplicateTextKey(`${name} ${phone} ${location}`);
    const attrs = selection
      ? `type="button" data-action="leitura-escolher-cliente" data-client-id="${H.escape(client.id)}" data-selection-search="${H.escape(searchText)}"${opts.hidden ? " hidden" : ""}`
      : `data-client="${H.escape(client.id)}"`;
    return `<button class="lead-card ${pendingHasBlocking(pending) ? "has-pending" : ""}${selection ? " hbx-selection-item lrt-client-row" : ""}${distance !== null && distance <= 200 ? " lrt-client-near" : ""}" ${attrs}><div class="avatar">${H.escape(initials(name))}</div><div class="card-main"><strong>${H.escape(name)}</strong><span>${H.escape(subtitle)}</span>${selection ? "" : `<div class="client-balance">${configFlag("moduloFinanceiroAtivo") ? `<small>Saldo ${H.money(Number(client.debitoAtual || 0))}</small>` : ""}${clientMissingLabels(client)}</div>`}</div>${trailing}</button>`;
  }
  function productCatalogCard(product, options) {
    const opts = options || {};
    const selection = !!opts.selection;
    const admin = isAdmin();
    const archived = product.ativo === false;
    const tag = selection || admin ? "button" : "article";
    const attrs = selection
      ? `type="button" data-action="leitura-item-adicionar" data-product-id="${H.escape(product.id)}" data-selection-search="${H.escape(duplicateTextKey(product.nome || product.name || ""))}"${opts.hidden ? " hidden" : ""}`
      : (admin ? `type="button" data-action="edit-product" data-product-id="${H.escape(product.id)}"` : "");
    const subtitle = admin && !selection && product.precoCatalogo != null ? `${H.escape(product.unidade || "unidade")} · ${H.money(product.precoCatalogo)}` : H.escape(product.unidade || "unidade");
    return `<${tag} class="lead-card${selection ? " hbx-selection-item" : ""}${archived ? " hbx-dimmed" : ""}" ${attrs}><div class="avatar">${icon("box", 19)}</div><div class="card-main"><strong>${H.escape(product.nome || product.name)}</strong><span>${subtitle}${archived ? ` · <span class="badge">Arquivado</span>` : ""}</span></div>${selection || admin ? `<span class="selection-mode-chevron">${icon("chevronRight", 18)}</span>` : ""}</${tag}>`;
  }

  function clientsScreen() {
    const list = state.clients || [];
    const total = Number(state.clientsTotal || 0);
    const firstLoad = state.clientsLoading && state.clientsPage === 0;
    const emptyText = state.clientsError || (state.query.trim() ? "Nenhum resultado." : "");
    return shell(`<div class="screen-head"><div><h1>Clientes</h1></div></div><label class="search">${icon("search", 18)}<input id="client-search" aria-label="Buscar clientes" placeholder="Buscar" value="${H.escape(state.query)}"></label><div class="section-title"><strong>Cadastros</strong><span>${list.length}${total > list.length ? ` de ${total}` : ""}</span></div>${firstLoad ? loading() : `<div class="list">${list.length ? list.map(c => clientCatalogCard(c)).join("") : empty(state.clientsError ? "Não foi possível carregar" : "Nenhum cliente", emptyText)}</div>`}${clientsAutoLoad()}`, `<button class="fab" data-action="new-client" aria-label="Novo cliente">${icon("plus", 22)}</button>`);
  }
  function productsScreen() {
    const all = state.products || [];
    const admin = isAdmin();
    const query = state.productQuery.trim().toLowerCase();
    const products = query ? all.filter(p => String(p.nome || p.name || "").toLowerCase().includes(query)) : all;
    const emptyText = all.length && query ? "Nenhum resultado." : "";
    return shell(`<div class="screen-head"><div><h1>Produtos</h1></div></div><label class="search">${icon("search", 18)}<input id="product-search" aria-label="Buscar produtos" placeholder="Buscar" value="${H.escape(state.productQuery)}"></label><div class="section-title"><strong>Catálogo</strong><span>${products.length}</span></div><div class="list">${products.length ? products.map(p => productCatalogCard(p)).join("") : empty(all.length ? "Nenhum resultado" : "Nenhum produto", emptyText)}</div>`, admin ? `<button class="fab" data-action="new-product" aria-label="Novo produto">${icon("plus", 22)}</button>` : "");
  }
  // 26/07 — a seção "Operação" (linhas só-leitura "Rastreamento: Disponível/Off"
  // e "Modo da rota") SAIU dos Ajustes por ordem do dono: Logística Simples é o
  // modo de todo mundo e a Rastreada fica QUIETA. Com a flag global ligada,
  // "Rastreamento: Disponível" anunciava pra TODO entregador um produto que a
  // empresa dele não usa — e o celular não manda nesse modo de qualquer jeito
  // (quem liga é o administrador pelo PC, em /logistica/config). O cálculo
  // `trackedAvailable` (cfg.trackingDisponivel) morreu junto — não sobrou leitor.
  // `routeTracked()` FICA: o hero acima ainda diz em que modo a rota está rodando.
  // 27/07 (ordem do dono) — Ajustes enxuto. SAÍRAM: a seção "Módulos" inteira
  // (a chave Logística), "Minhas rotas" (virou "Rotas salvas", dentro do
  // Gerenciador de Rota), "Registrar caminho" (mudou pro Gerenciador de Rota) e
  // Tema/Sons/Sincronizar — os três já são botão do topo em TODA tela (a lua, o
  // chip de som e o ↻ da barra), então a linha aqui era o mesmo botão duas vezes.
  function settingsScreen() {
    const cfg = state.config || {};
    const chevron = icon("chevronRight", 18);
    return shell(`<div class="screen-head"><div><h1>Ajustes</h1></div></div>
      ${isAdmin() ? `<div class="section-title"><strong>Administração</strong></div><section class="card flat"><button class="settings-row" data-action="arrival-radius"><div class="avatar">${icon("gps", 18)}</div><div class="settings-copy"><strong>Avisar chegada</strong></div><strong>${Math.max(20, Number(cfg.raioChegadaM || 60))} m</strong>${chevron}</button><button class="settings-row" data-action="statement"><div class="avatar">${icon("sales", 18)}</div><div class="settings-copy"><strong>Consumo e bônus</strong></div>${chevron}</button><button class="settings-row" data-action="toggle-creditos-panel" role="switch" aria-checked="${!creditosPanelOculto()}"><div class="avatar">${icon("calendar", 18)}</div><div class="settings-copy"><strong>Painel de créditos do dia</strong></div><span class="module-switch ${!creditosPanelOculto() ? "active" : ""}" aria-hidden="true"><i></i></span></button><button class="settings-row" data-action="open-recarga"><div class="avatar">${icon("card", 18)}</div><div class="settings-copy"><strong>Recarga de créditos</strong></div>${chevron}</button><button class="settings-row" data-action="open-financeiro"><div class="avatar">${icon("wallet", 18)}</div><div class="settings-copy"><strong>Financeiro</strong></div>${chevron}</button><button class="settings-row" data-action="open-avancado"><div class="avatar">${icon("gear", 18)}</div><div class="settings-copy"><strong>Avançado</strong></div>${chevron}</button></section>` : ""}
      <div class="section-title"><strong>Aplicativo</strong></div><section class="card flat"><form id="company-name-form" class="company-name-form"><div class="field"><label>Nome da empresa</label><input name="companyName" maxlength="80" value="${H.escape(state.companyName)}" placeholder="Ex.: Água Boa"></div><button class="btn btn-primary" type="submit">Salvar</button></form><button class="settings-row" data-action="logout"><div class="avatar">${icon("logout", 18)}</div><div class="settings-copy"><strong>Sair</strong></div>${chevron}</button>${versionSettingsRow()}</section>`);
  }

  // 22/07 — a versão instalada não aparecia em lugar nenhum: sem isso não dá
  // pra saber, olhando o celular do motorista, se ele está com o app certo.
  // Tocar força a checagem de atualização (checkAppUpdate(true) responde
  // sempre: abre o modal se tiver nova, ou avisa que já está na mais recente).
  function versionSettingsRow() {
    const info = appInfo();
    if (!info || !info.versionName) return "";
    const nova = state.updateInfo && state.updateInfo.outdated;
    return `<button class="settings-row" data-action="check-update"><div class="avatar">${icon("download", 18)}</div><div class="settings-copy"><strong>Versão</strong><span>${H.escape(info.versionName)} · código ${H.escape(String(info.versionCode || "?"))}</span></div>${nova ? `<span class="badge success">Nova</span>` : ""}${icon("chevronRight", 18)}</button>`;
  }
  // CHEGADA 22/07 — preço UNITÁRIO que a tela usa pra somar "Valor agora".
  // Ordem: (1) preço editado na mão nesta chegada; (2) valorUnit do item, que só
  // chega pra quem enxerga catálogo (admin); (3) preço do catálogo local; (4)
  // rateio do valorHoje do servidor (Σ qtdPrevista) — o único número de dinheiro
  // que o entregador comum recebe. Nunca INVENTA preço: sem nenhuma das fontes,
  // devolve 0 e a linha simplesmente não soma.
  function unitPriceFor(item, row) {
    if (row && row.valorUnit !== undefined && row.valorUnit !== null) return Math.max(0, Number(row.valorUnit) || 0);
    if (row && row.valorUnitOriginal) return Math.max(0, Number(row.valorUnitOriginal) || 0);
    const product = (state.products || []).find(p => String(p.id) === String(row && row.productId));
    if (product && product.precoCatalogo) return Math.max(0, Number(product.precoCatalogo) || 0);
    const previstas = (item.itens || []).reduce((sum, x) => sum + Math.max(0, Number(x.qtdPrevista || 0)), 0);
    const valorHoje = Number(item.valorHoje || 0);
    return previstas > 0 && valorHoje > 0 ? valorHoje / previstas : 0;
  }
  // "Valor agora" = o que está na tela AGORA (qtd × preço de cada linha), não o
  // que o servidor calculou quando o dia foi gerado — senão mexer no stepper ou
  // no preço não mudaria o total que o cliente vai pagar.
  function draftValorAgora(item) {
    return deliveryDraftFor(item).items.reduce((sum, row) => sum + Math.max(0, Number(row.qtd || 0)) * unitPriceFor(item, row), 0);
  }
  function simpleModeActive(item) {
    // Modo simples é camada opcional por cima do fluxo atual: só entra quando o
    // financeiro está ligado, o toggle "cobrança simples" também está ligado, a
    // entrega ainda está aberta e o motorista não pediu "Ver detalhes" (aí a
    // folha completa assume até fechar a folha). Financeiro OFF cai no nível 1
    // (deliveryOfflineSheet), nunca neste modo.
    // 22/07 — EDIÇÃO pela guia "Entregue": o dono pediu "cliquei em editar, abrir
    // a MESMA tela". Então a entrega concluída que está sendo editada entra aqui
    // mesmo estando 'entregue', e independe do toggle de cobrança simples (senão
    // "a mesma tela" mudaria de cara conforme a configuração do tenant).
    if (!configFlag("moduloFinanceiroAtivo") || !item || state.deliverySimpleDetail || state.deliveryNotDelivered) return false;
    if (state.deliveryEditingId === item.id) return true;
    return !!(state.config && state.config.cobrancaSimples) && item.status !== "entregue" && item.status !== "cancelada";
  }
  function offlineModeActive(item) {
    // Nível 1 do contrato Financeiro: módulo inteiro desligado. Ultra-simples,
    // sem nenhum dado de dinheiro na tela. Só entra enquanto a entrega segue
    // aberta — finalizada/cancelada cai na folha completa (reabrir, comprovante).
    return !configFlag("moduloFinanceiroAtivo") && !!item && !state.deliveryNotDelivered && item.status !== "entregue" && item.status !== "cancelada";
  }
  // Uma linha do histórico. O texto vem PRONTO do servidor (titulo/itensResumo):
  // congelar a frase lá é o que impede o histórico de ontem mudar quando a tela
  // de hoje muda. Aqui só resta formatar data e dinheiro.
  function historicoLinha(linha) {
    const quando = linha.createdAt ? H.date(linha.createdAt, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
    // 22/07 (dono) — o método vinha CRU do banco e escrevia "fiado" na tela, do
    // lado de um título que já dizia a mesma coisa. Pix/Dinheiro viram nome
    // próprio; "fiado" não vira palavra nenhuma (o título já diz "a receber").
    const metodo = { pix: "Pix", dinheiro: "Dinheiro" }[String(linha.receiptMethod || "").toLowerCase()] || "";
    const detalhe = [linha.itensResumo, metodo, linha.motivo].filter(Boolean).join(" · ");
    const pago = linha.tipo === "pago";
    const valor = Number(linha.valorEvento || 0);
    return `<article class="historico-item ${linha.tipo === "sem_atendimento" ? "is-sem-atendimento" : ""}" data-historico-hold="${H.escape(linha.id)}">
      <div class="historico-item-topo"><strong>${H.escape(linha.titulo || "Visita")}</strong>${valor > 0 ? `<span class="badge ${pago ? "success" : ""}">${H.money(valor)}</span>` : ""}</div>
      <small>${H.escape([quando, detalhe].filter(Boolean).join(" · "))}</small>
    </article>`;
  }
  // Grava o preço de HOJE na linha do rascunho. Campo "estilo banco" (o mesmo da
  // Leitura de Rota): o que vale são os DÍGITOS = centavos, então "R$ 12,50"
  // digitado de qualquer jeito nunca vira NaN. Fica só no rascunho até o confirmar.
  function salvarPrecoDeHoje(form) {
    if (!form || !state.selected) return;
    const draft = deliveryDraftFor(state.selected);
    const row = draft.items.find(x => x.key === form.dataset.draftItem);
    const campo = form.querySelector("input[name=preco]");
    if (row && campo) {
      row.valorUnit = (Number(String(campo.value || "").replace(/\D/g, "")) || 0) / 100;
      H.vibrate(8);
    }
    state.deliveryPriceEdit = null;
    render();
  }
  async function abrirHistorico(client) {
    if (!client || !client.id) return;
    state.historico = { clienteId: client.id, items: [], loading: true, erro: "" };
    showModal("historico");
    try {
      const res = await H.api(`/logistica/clientes/${encodeURIComponent(client.id)}/historico?limit=50`);
      // A resposta pode chegar depois do dono já ter fechado/trocado de cliente.
      if (!state.historico || state.historico.clienteId !== client.id) return;
      state.historico = { clienteId: client.id, items: (res && res.items) || [], loading: false, erro: "" };
    } catch (error) {
      if (!state.historico || state.historico.clienteId !== client.id) return;
      state.historico = { clienteId: client.id, items: [], loading: false, erro: humanApiError(error) };
    }
    render();
  }
  async function performApagarHistorico(historicoId) {
    const h = state.historico;
    if (!h || !h.clienteId || !historicoId) return;
    try {
      await H.api(`/logistica/clientes/${encodeURIComponent(h.clienteId)}/historico/${encodeURIComponent(historicoId)}`, { method: "DELETE" });
      h.items = (h.items || []).filter(x => String(x.id) !== String(historicoId));
      render();
      toast("Linha apagada do histórico.");
    } catch (error) { toast(humanApiError(error), true); }
  }
  async function performLimparHistorico() {
    const h = state.historico;
    if (!h || !h.clienteId) return;
    try {
      await H.api(`/logistica/clientes/${encodeURIComponent(h.clienteId)}/historico`, { method: "DELETE" });
      h.items = [];
      render();
      toast("Histórico apagado.");
    } catch (error) { toast(humanApiError(error), true); }
  }
  // ── CHEGADA (reescrita 22/07, pedido do dono) ────────────────────────────────
  // O que mudou e por quê:
  //   • "Chegou em {cliente}" no lugar do nome solto — a frase diz o que está
  //     acontecendo; o nome sozinho não dizia.
  //   • Quantidade com seta grande ↑↓ e PRODUTO como botão (toca e troca): o
  //     entregador corrige na porta o que foi planejado ontem, sem "Ver detalhes".
  //   • PREÇO editável ao lado do produto — é o VALOR DE HOJE. "Se ontem vendeu
  //     por 10 e hoje é 50, vai ficar 60": o passado nunca é reescrito, o valor
  //     antigo continua lá e o total soma os dois.
  //   • Cobrança simples resume em "Deve R$ X" e pergunta se pagou ou ficou
  //     devendo; a exibição detalhada preserva antigo / agora / total.
    //   • "Não entregue" pede o motivo; "Não atendeu" mantém o atalho direto.
  function deliverySimpleSheet(item) {
    const c = item.cliente || {};
    const editando = state.deliveryEditingId === item.id;
    const debitoAtual = c.debitoAtual;
    const financeiroAtivo = configFlag("moduloFinanceiroAtivo") && debitoAtual !== null && debitoAtual !== undefined;
    const cobrancaSimples = financeiroAtivo && !editando && !!(state.config && state.config.cobrancaSimples);
    const valorAntigo = financeiroAtivo ? Number(debitoAtual || 0) : 0;
    const valorAgora = draftValorAgora(item);
    const draft = deliveryDraftFor(item);
    const produtosDisponiveis = (state.products || []).filter(p => p && p.id != null && p.ativo !== false);
    const linhasVisiveis = draft.items.filter(row => !row.zeradoPorTroca);
    const produtosNaEntrega = new Set(linhasVisiveis.map(row => String(row.productId)).filter(Boolean));
    const produtosParaAdicionar = produtosDisponiveis.filter(p => !produtosNaEntrega.has(String(p.id)));
    const linhas = linhasVisiveis.map(row => {
      const preco = financeiroAtivo ? unitPriceFor(item, row) : 0;
      const editandoPreco = financeiroAtivo && state.deliveryPriceEdit === row.key;
      // Layout escolhido pelo dono (22/07, "opção A"): SEM moldura nenhuma. As três
      // caixas com borda (setas / produto / valor) dentro da caixa do bloco eram o
      // que deixava a chegada pesada. Aqui é uma linha só, centralizada: setas
      // discretas, número grande, produto · valor no mesmo tamanho.
      return `<div class="chegada-linha" data-draft-row="${H.escape(row.key)}">
        <div class="chegada-stepper">
          <button type="button" class="chegada-seta" data-action="delivery-qty" data-draft-item="${H.escape(row.key)}" data-delta="1" aria-label="Aumentar quantidade">${icon("chevronUp", 24)}</button>
          <button type="button" class="chegada-seta" data-action="delivery-qty" data-draft-item="${H.escape(row.key)}" data-delta="-1" aria-label="Diminuir quantidade">${icon("chevronDown", 24)}</button>
        </div>
        <b class="chegada-qtd">${Number(row.qtd || 0)}</b>
        <button type="button" class="chegada-produto" data-action="delivery-swap" data-draft-item="${H.escape(row.key)}">${H.escape(row.nome)}</button>
        ${financeiroAtivo
          ? editandoPreco
            ? `<form id="chegada-preco-form" class="chegada-preco-form" data-preco-form data-draft-item="${H.escape(row.key)}"><input class="chegada-preco-input lrt-produto-valor-input" name="preco" type="text" inputmode="numeric" autocomplete="off" data-chegada-preco="${H.escape(row.key)}" value="${H.escape(H.money(preco))}" aria-label="Valor da entrega" data-enter-action="delivery-price-save"><button type="submit" class="chegada-preco-ok" data-action="delivery-price-save" data-draft-item="${H.escape(row.key)}" aria-label="Confirmar valor">${icon("check", 18)}</button></form>`
            : `<span class="chegada-sep" aria-hidden="true">·</span><button type="button" class="chegada-preco" data-action="delivery-price" data-draft-item="${H.escape(row.key)}">${H.escape(H.money(preco))}</button>`
          : ""}
      </div>`;
    }).join("");
    const produtosDoPicker = state.deliverySwapKey ? produtosDisponiveis : produtosParaAdicionar;
    const picker = state.deliveryProductPicker
      ? `<div class="chegada-picker"><strong>${state.deliverySwapKey ? "Trocar produto" : "Adicionar produto"}</strong>${produtosDoPicker.map(p => `<button type="button" data-action="delivery-product" data-product-id="${H.escape(p.id)}">${H.escape(p.nome || p.name || "Produto")}</button>`).join("") || `<p class="subtitle">Nenhum outro produto no catálogo.</p>`}<button type="button" class="btn btn-secondary" data-action="delivery-close-picker">Fechar</button></div>`
      : produtosParaAdicionar.length
        ? `<button type="button" class="chegada-add" data-action="delivery-add-product">${icon("plus", 18)} Adicionar produto</button>`
        : "";
    const acoes = financeiroAtivo
      ? `<div class="chegada-acoes"><button class="btn delivery-confirm chegada-btn chegada-btn-pago" type="button" data-action="confirm-pago" ${state.deliveryConfirming ? "disabled" : ""}>${icon("wallet", 20)} Entregue e quitou</button><button class="btn delivery-confirm chegada-btn chegada-btn-entregue" type="button" data-action="confirm-proximo" ${state.deliveryConfirming ? "disabled" : ""}>${icon("check", 20)} Entregue, ficou devendo</button>${editando ? `<button class="chegada-btn-sem" type="button" data-action="cancel-delivery-edit">Voltar sem alterar</button>` : `<button class="chegada-btn-sem" type="button" data-action="delivery-not-delivered">Não entregue</button><button class="chegada-btn-sem" type="button" data-action="confirm-sem-atendimento">Não atendeu</button>`}</div>${editando ? "" : `<button class="link-btn delivery-detail-link" type="button" data-action="delivery-simple-detail">Ver detalhes</button>`}`
      : `<div class="delivery-hero-actions"><button class="btn btn-secondary delivery-confirm delivery-big-btn" type="button" data-action="delivery-not-delivered">${icon("close", 20)} Não entregue</button><button class="btn btn-secondary delivery-confirm delivery-big-btn" type="button" data-action="confirm-sem-atendimento">${icon("phone", 20)} Não atendeu</button><button class="btn btn-primary delivery-confirm delivery-big-btn" type="button" data-action="confirm-entregue-simples" ${state.deliveryConfirming ? "disabled" : ""}>${icon("check", 20)} Entregue</button></div>`;
    const conta = !financeiroAtivo ? "" : cobrancaSimples
      ? `<div class="chegada-conta"><div class="chegada-conta-linha chegada-conta-total"><span>Deve</span><b>${H.money(valorAntigo + valorAgora)}</b></div></div>`
      : `<div class="chegada-conta"><div class="chegada-conta-linha"><span>Valor antigo</span><b>${H.money(valorAntigo)}</b></div><div class="chegada-conta-linha"><span>Valor entrega</span><b>${H.money(valorAgora)}</b></div><div class="chegada-conta-linha chegada-conta-total"><span>Valor total</span><b>${H.money(valorAntigo + valorAgora)}</b></div></div>`;
    return `<div class="sheet-wrap" data-action="close-sheet"><section class="sheet delivery-sheet delivery-sheet-simple"><div class="handle"></div>${state.deliveryArrived ? `<div class="delivery-arrived">${icon("gps", 14)} Você chegou no endereço</div>` : ""}<div class="sheet-head"><div class="avatar">${H.escape(initials(c.nome))}</div><div><p class="subtitle delivery-hero-kicker">${editando ? "Editando entrega" : "Chegada"}</p></div><button class="close" type="button" data-action="close-sheet">${icon("close", 18)}</button></div><div class="delivery-hero"><h1 class="delivery-hero-name">${editando ? "Editando" : "Chegou em"} <b>${H.escape(c.nome || "Cliente")}</b></h1>${c.observacoes ? `<p class="subtitle delivery-hero-obs">${H.escape(c.observacoes)}</p>` : ""}<div class="chegada-box"><span class="subtitle chegada-box-titulo">Entregar</span><div class="chegada-lista">${linhas}</div>${picker}</div>${conta}</div>${acoes}</section></div>`;
  }
  // Financeiro OFF reutiliza a chegada já existente, com produto, quantidade,
  // troca e adição. A própria folha esconde preço/conta/Pago neste modo.
  function deliveryOfflineSheet(item) {
    return deliverySimpleSheet(item);
  }
  function deliverySheet(item) {
    if (offlineModeActive(item)) return deliveryOfflineSheet(item);
    if (simpleModeActive(item)) return deliverySimpleSheet(item);
    const c = item.cliente || {}; const phone = c.phone || item.contato && (item.contato.whatsapp || item.contato.phone) || "";
    const finished = item.status === "entregue" || item.status === "cancelada";
    const proof = item.comprovante || {};
    const draft = deliveryDraftFor(item); const reason = state.deliveryReason; const notDelivered = state.deliveryNotDelivered;
    const productIds = new Set(draft.items.map(x => String(x.productId)).filter(Boolean));
    const availableProducts = (state.products || []).filter(p => p && p.id != null && p.ativo !== false && !productIds.has(String(p.id)));
    const itemRows = draft.items.map(row => `<div class="delivery-item"><div><strong>${H.escape(row.nome)}</strong><small>${H.money(unitPriceFor(item, row))}${row.novo ? " · Novo na entrega" : ""}</small></div><div class="delivery-stepper"><button data-action="delivery-qty" data-draft-item="${H.escape(row.key)}" data-delta="-1" ${finished ? "disabled" : ""}>−</button><b>${row.qtd}</b><button data-action="delivery-qty" data-draft-item="${H.escape(row.key)}" data-delta="1" ${finished ? "disabled" : ""}>+</button></div></div>`).join("") || empty("Sem itens", "Adicione o que foi entregue.");
    const reasonPanel = `<div class="delivery-reason"><strong>Por que não foi entregue?</strong><div class="delivery-reason-options">${[["ausente","Ausente"],["recusou","Recusou"],["reagendar","Reagendar"]].map(([id,label]) => `<button class="${reason === id ? "active" : ""}" data-action="delivery-reason" data-reason="${id}">${label}</button>`).join("")}</div><button class="btn btn-danger delivery-confirm" data-action="confirm-not-delivered" ${reason ? "" : "disabled"}>Confirmar não entregue</button><button class="btn btn-secondary" data-action="delivery-back">Voltar</button></div>`;
    const editor = `<div class="delivery-editor"><div class="delivery-editor-head"><strong>Quantidade entregue</strong></div>${itemRows}${!finished && availableProducts.length ? (!state.deliveryProductPicker ? `<button class="delivery-add" data-action="delivery-add-product">${icon("plus", 17)} Adicionar produto</button>` : `<div class="delivery-picker"><strong>Adicionar produto</strong>${availableProducts.map(p => `<button data-action="delivery-product" data-product-id="${H.escape(p.id)}">${H.escape(p.nome || p.name || "Produto")}</button>`).join("")}<button class="btn btn-secondary" data-action="delivery-close-picker">Fechar</button></div>`) : ""}</div>`;
    return `<div class="sheet-wrap" data-action="close-sheet"><section class="sheet delivery-sheet"><div class="handle"></div>${state.deliveryArrived ? `<div class="delivery-arrived">${icon("gps", 14)} Você chegou no endereço</div>` : ""}<div class="sheet-head"><div class="avatar">${H.escape(initials(c.nome))}</div><div><h2>${H.escape(c.nome || "Cliente")}</h2><p class="subtitle">${H.escape(address(c))}</p></div><button class="close" data-action="close-sheet" aria-label="Fechar">${icon("close", 18)}</button></div>${c.observacoes ? `<div class="card flat delivery-obs-card"><strong>Observações</strong><p class="subtitle">${H.escape(c.observacoes)}</p></div>` : ""}${notDelivered ? reasonPanel : editor}${item.status === "entregue" ? `<button class="btn btn-secondary btn-block delivery-reopen" data-action="reopen-delivery">${icon("refresh", 17)} Reabrir entrega</button>` : ""}${!finished && !notDelivered ? `<div class="delivery-tools"><button class="btn btn-secondary" data-action="maps">${icon("route", 17)} Continuar navegação</button><button class="btn btn-secondary" data-action="call" ${phone ? "" : "disabled"}>${icon("phone", 17)} Ligar</button><button class="btn btn-secondary" data-action="whatsapp" ${phone ? "" : "disabled"}>${icon("wa", 17)} WhatsApp</button></div><div class="section-title"><strong>Comprovante</strong><span>opcional</span></div><div class="actions"><input class="sr-only" id="proof-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"><button class="btn btn-secondary" data-action="photo">${proof.fotoEnviada ? icon("check",17) : icon("plus",17)} Foto</button></div><div class="chegada-acoes"><button class="btn delivery-confirm chegada-btn chegada-btn-pago" type="button" data-action="confirm-pago" ${state.deliveryConfirming ? "disabled" : ""}>${icon("wallet", 20)} Entregue e quitou</button><button class="btn delivery-confirm chegada-btn chegada-btn-entregue" type="button" data-action="confirm-proximo" ${state.deliveryConfirming ? "disabled" : ""}>${icon("check", 20)} Entregue, ficou devendo</button><button class="chegada-btn-sem" type="button" data-action="delivery-not-delivered">Não entregue</button><button class="chegada-btn-sem" type="button" data-action="confirm-sem-atendimento">Não atendeu</button></div>${state.deliverySimpleDetail ? `<button class="link-btn delivery-detail-link" type="button" data-action="delivery-simple-back">Voltar para exibição simples</button>` : ""}` : ""}</section></div>`;
  }
  function newClientProductFields() {
    const draft = state.clientProductDraft;
    // 27/07 (ordem do dono, cobrança final) — produto NÃO tem tipo, NÃO tem dia e não
    // FALA de dia: o form é Produto + Quantidade + Preço, ponto. Dia é do CLIENTE
    // (chips da seção Cadastro) e o vínculo segue eles sozinho. Parada fora do
    // plano vive no fluxo próprio "Rota rápida"; "Por data" morreu.
    return `<div class="section-title"><strong>Produto / entrega</strong></div><div class="field"><label>Produto</label><select name="productId"><option value="">Escolha o produto</option>${(state.products || []).filter(product => product.ativo !== false).map(product => `<option value="${product.id}" ${String(draft.productId) === String(product.id) ? "selected" : ""}>${H.escape(product.nome || product.name)}</option>`).join("")}</select></div><div class="field"><label>Quantidade</label><input name="qtdPadrao" type="number" min="1" value="${H.escape(draft.qtdPadrao || "1")}"></div>${configFlag("precoPorClienteAtivo") ? `<div class="field"><label>Preço para este cliente</label><input name="precoAcordado" type="number" min="0" step="0.01" inputmode="decimal" value="${H.escape(draft.precoAcordado || "")}" placeholder="Vazio = preço do catálogo"></div>` : ""}`;
  }
  function clientEditorModal(isNew) {
    const client = isNew ? state.newClientDraft : (state.modalClient || {}); const fields = isNew ? state.newClientDraft : state.clientPaymentDraft;
    const pending = isNew ? [] : clientPendingKeys(client);
    const phone = isNew ? state.newClientDraft.phone : (state.clientDetail ? fields.phone : displayPhone(client.phone || client.phoneNormalized || client.whatsapp || ""));
    // A ficha detalhada é atualizada antes do card que abriu o modal. Depois de
    // salvar/completar o telefone, não mantenha o "Tel" antigo só porque
    // modalClient ainda é o snapshot anterior da lista.
    if (!isNew) {
      const telIndex = pending.indexOf("Tel");
      if (phoneComplete(phone) && telIndex !== -1) pending.splice(telIndex, 1);
      else if (!phoneComplete(phone) && telIndex === -1) pending.unshift("Tel");
    }
    // PR20072026 (feedback dono) — número sem DDD APARECE (não some) mas não é
    // discável: no lugar de Ligar/WhatsApp entra "Completar DDD", que pergunta o
    // DDD já sugerindo o da região do CEP.
    const phoneReady = !isNew && !!phone && phoneComplete(phone);
    const phoneIncomplete = !isNew && !!phone && !phoneComplete(phone);
    const ddHint = phoneIncomplete ? `<p class="client-ddd-hint">Falta o DDD — toque em “Completar DDD”.</p>` : "";
    const identity = isNew ? `<div class="form-grid"><div class="field"><label>Nome</label><input name="name" required maxlength="160" value="${H.escape(state.newClientDraft.name)}"></div><div class="field"><label>Telefone / WhatsApp</label><input name="phone" inputmode="tel" maxlength="15" value="${H.escape(phone)}" placeholder="(00) 00000-0000"></div></div><div class="field"><label>CPF</label><input name="cpf" inputmode="numeric" maxlength="14" value="${H.escape(state.newClientDraft.cpf)}" placeholder="000.000.000-00"></div>` : `<div class="form-grid"><div class="field"><label>Nome</label><input name="name" required maxlength="160" value="${H.escape(state.clientDetail ? fields.name : (client.name || client.nome || ""))}"></div><div class="field ${pending.includes("Tel") ? "client-field-pending" : ""}"><label>Telefone / WhatsApp${pending.includes("Tel") ? " · pendente" : ""}</label><input name="phone" inputmode="tel" maxlength="15" value="${H.escape(phone)}" placeholder="(00) 00000-0000">${ddHint}</div></div>`;
    const actions = `<div class="client-primary-actions ${phoneReady ? "has-contact" : ""}"><button class="btn btn-primary btn-block" type="submit">Salvar cliente</button>${phoneReady ? `<button type="button" class="btn btn-secondary" data-action="call-client">${icon("phone", 16)} Ligar</button><button type="button" class="btn btn-secondary" data-action="whatsapp-client">${icon("wa", 16)} WhatsApp</button>` : ""}${phoneIncomplete ? `<button type="button" class="btn btn-secondary" data-action="complete-ddd">${icon("phone", 16)} Completar DDD</button>` : ""}</div>`;
    let products = newClientProductFields();
    if (!isNew) {
      const draft = state.clientProductDraft;
      // 27/07 (ordem do dono, cobrança final) — produto NÃO tem tipo, NÃO tem dia e não
      // FALA de dia: todo vínculo segue os dias do CLIENTE (chips do Cadastro).
      // Avulsa = fluxo próprio; "Por data" morreu do form.
      // 27/07 (ordem do dono) — o produto salvo é SÓ produto + quantidade: dia
      // saiu daqui (o dia é do CLIENTE, chips do Cadastro) e a quantidade se
      // corrige na própria linha com a seta ↑↓, igual à Chegada. A linha virou
      // <div> porque agora tem botão dentro (button aninhado é inválido); o
      // toque no resto da linha continua abrindo o editor e o toque longo
      // continua excluindo.
      const linked = state.clientProductsLoading ? `<div class="empty">Carregando produtos já salvos…</div>` : state.clientProductsError ? `<div class="empty">${H.escape(state.clientProductsError)}</div>` : state.clientProducts.length ? `<div class="list client-product-list">${state.clientProducts.map(item => {
        const selecionado = state.clientProductEditingId === item.id;
        const qtd = Math.max(1, Number(item.qtdPadrao || 1));
        return `<div class="row-card client-product-row ${selecionado ? "selected" : ""}" data-client-product-id="${H.escape(item.id)}"><div class="chegada-stepper"><button type="button" class="chegada-seta" data-action="client-product-qty" data-client-product="${H.escape(item.id)}" data-delta="1" aria-label="Aumentar quantidade">${icon("chevronUp", 22)}</button><button type="button" class="chegada-seta" data-action="client-product-qty" data-client-product="${H.escape(item.id)}" data-delta="-1" aria-label="Diminuir quantidade">${icon("chevronDown", 22)}</button></div><b class="chegada-qtd client-product-qtd">${qtd}</b><span class="client-product-nome">${H.escape(item.produto && item.produto.nome || "Produto")}</span>${item.precoAcordado != null ? `<span class="client-product-preco">${H.money(item.precoAcordado)}</span>` : ""}<span class="client-product-editar">${selecionado ? "Selecionado" : "Editar"}</span></div>`;
      }).join("")}</div>` : `<p class="subtitle">Nenhum produto recorrente salvo ainda.</p>`;
      const submitLabel = state.clientProductEditingId ? "Salvar alterações" : "Salvar produto";
      const formOpen = !!state.clientProductFormOpen;
      const editorForm = formOpen ? `<div class="section-title"><strong>${state.clientProductEditingId ? "Editar produto" : "Novo produto / entrega"}</strong><button class="link-btn" type="button" data-action="close-client-product-form">Fechar</button></div><form id="client-product-form"><input type="hidden" name="customerProfileId" value="${H.escape(client.id || "")}"><div class="field"><label>Produto</label><select name="productId" required ${state.clientProductEditingId ? "disabled" : ""}><option value="">Escolha o produto</option>${(state.products || []).filter(product => product.ativo !== false).map(product => `<option value="${product.id}" ${String(draft.productId) === String(product.id) ? "selected" : ""}>${H.escape(product.nome || product.name)}</option>`).join("")}</select></div><div class="field"><label>Quantidade por entrega</label><input name="qtdPadrao" type="number" min="1" value="${H.escape(draft.qtdPadrao || "1")}" required></div>${configFlag("precoPorClienteAtivo") || (state.clientProductEditingId && String(draft.precoAcordado || "").trim() !== "") ? `<div class="field"><label>Preço para este cliente</label><input name="precoAcordado" type="number" min="0" step="0.01" inputmode="decimal" value="${H.escape(draft.precoAcordado || "")}" placeholder="Vazio = preço do catálogo"></div>` : ""}<button class="btn btn-primary btn-block" type="submit">${submitLabel}</button></form>` : "";
      products = `<div class="section-title"><strong>Produtos já salvos</strong><button class="link-btn" type="button" data-action="new-client-product">+ Novo</button></div>${linked}${editorForm}`;
    }
    const formId = isNew ? "new-client-form" : "client-details-form"; const status = isNew ? state.newClientCepStatus : state.clientCepStatus;
    // R5 (27/07, combinado do dono) — o DIA DA SEMANA é fixo NO CLIENTE: os
    // chips moram aqui na seção Cadastro; o form de produto ficou só com
    // qtd/frequência (modo semanal SEGUE estes dias, ver newClientProductFields).
    const diasEntregaField = `<div class="field client-dias-field ${!isNew && pending.includes("Dia") ? "client-field-pending" : ""}"><label>Dias de entrega${!isNew && pending.includes("Dia") ? " · pendente" : ""}</label><div class="day-chips">${weekDays.map(day => `<button type="button" class="day-chip ${state.clientProductDays.includes(day.n) ? "active" : ""}" data-client-day="${day.n}" aria-pressed="${state.clientProductDays.includes(day.n)}">${day.label}</button>`).join("")}</div></div>`;
    const registration = `<section class="client-editor-part client-editor-registration ${pending.includes("End") ? "client-part-pending" : ""} ${pending.includes("Dup") ? "client-address-duplicate" : ""}"><div class="client-editor-part-head"><span>1</span><strong>Cadastro${pending.includes("End") ? " · endereço pendente" : ""}</strong></div>${identity}${diasEntregaField}${clientAddressFields(fields, status, isNew ? "new" : "edit")}</section>`;
    // 27/07 (ordem do dono) — a seção Produto NÃO fala de dia, nem pinta por dia: o dia
    // é do CLIENTE e a pendência dele mora no campo "Dias de entrega" da seção 1, ao
    // lado dos chips que a resolvem. Cobrar dia dentro de Produto é mandar o dono
    // procurar o botão na seção errada.
    const productPart = `<section class="client-editor-part client-editor-products"><div class="client-editor-part-head"><span>2</span><strong>Produto</strong></div>${products}</section>`;
    // PR18072026 Módulo Financeiro — seção 3 inteira some quando o módulo está
    // desligado (nada de saldo/forma de pagamento pra quem não usa financeiro).
    const finance = configFlag("moduloFinanceiroAtivo") ? `<section class="client-editor-part client-editor-finance ${pending.includes("Pag") ? "client-part-pending" : ""}"><div class="client-editor-part-head"><span>3</span><strong>Financeiro${pending.includes("Pag") ? " · falta o dia de fechamento" : ""}</strong></div><div class="client-financial-fields"></div></section>` : "";
    const customerForm = `<form id="${formId}">${registration}${isNew ? productPart : ""}${finance}${actions}</form>`;
    return `<div class="modal-wrap" data-action="close-modal"><section class="modal client-edit-modal"><div class="sheet-head ${pendingHasBlocking(pending) ? "client-head-pending" : ""}"><div class="avatar">${icon("users", 18)}</div><div><h2>${isNew ? "Novo cliente" : "Editar cliente"}</h2>${isNew ? "" : `<p class="subtitle">${H.escape(client.nome || client.name || "Cliente")}</p>`}</div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><div class="client-editor-body">${customerForm}${isNew ? "" : productPart}</div></section></div>`;
  }
  function modal() {
    if (state.modal === "client-product") return clientEditorModal(false);
    if (state.modal === "new-client") return clientEditorModal(true);
    if (state.modal === "new-product") return `<div class="modal-wrap day-home-wrap product-edit-wrap" data-action="close-modal"><section class="modal day-home center-modal product-edit-modal" role="dialog" aria-modal="true" aria-labelledby="new-product-title"><div class="center-modal-head"><div class="day-home-icon">${icon("box", 22)}</div><h2 id="new-product-title">Novo produto</h2><button class="close center-modal-close" type="button" data-action="close-modal" aria-label="Fechar">${icon("close", 16)}</button></div><div class="center-modal-body product-edit-body"><form id="new-product-form"><div class="form-grid"><div class="field"><label>Nome</label><input name="name" required maxlength="140"></div><div class="field"><label>Unidade</label><input name="unidade" maxlength="60" placeholder="galão, caixa, unidade"></div><div class="field"><label>Preço</label><input name="price" type="text" inputmode="numeric" data-product-price="new"></div><div class="field"><label>Estoque</label><input name="stock" type="number" min="0" step="1"></div></div><button class="btn btn-primary btn-block product-edit-save" type="submit">Cadastrar</button></form></div></section></div>`;
    if (state.modal === "edit-product") {
      const p = state.modalProduct || {};
      const d = state.editProductDraft || { nome: p.nome || p.name || "", unidade: p.unidade || "", precoCatalogo: p.precoCatalogo != null ? String(p.precoCatalogo) : "", estoque: p.estoque != null ? String(p.estoque) : "" };
      const active = p.ativo !== false;
      return `<div class="modal-wrap day-home-wrap product-edit-wrap" data-action="close-modal"><section class="modal day-home center-modal product-edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-product-title"><div class="center-modal-head"><div class="day-home-icon">${icon("box", 22)}</div><h2 id="edit-product-title">Editar produto</h2><p class="center-modal-resumo">${H.escape(p.nome || p.name || "Produto")}</p><button class="close center-modal-close" type="button" data-action="close-modal" aria-label="Fechar">${icon("close", 16)}</button></div><div class="center-modal-body product-edit-body"><form id="edit-product-form"><div class="form-grid"><div class="field"><label>Nome</label><input name="nome" required maxlength="140" value="${H.escape(d.nome)}"></div><div class="field"><label>Unidade</label><input name="unidade" maxlength="60" placeholder="galão, caixa, unidade" value="${H.escape(d.unidade)}"></div><div class="field"><label>Preço</label><input name="precoCatalogo" type="text" inputmode="numeric" data-product-price="edit" value="${H.escape(d.precoCatalogo)}"></div><div class="field"><label>Estoque</label><input name="estoque" type="number" min="0" step="1" inputmode="numeric" value="${H.escape(d.estoque)}"></div></div><button class="btn btn-primary btn-block product-edit-save" type="submit">Salvar</button></form><div class="product-edit-danger"><button class="btn ${active ? "btn-danger" : "btn-secondary"} btn-block" type="button" data-action="toggle-product-active" data-product-id="${H.escape(p.id)}">${active ? "Arquivar produto" : "Reativar produto"}</button></div></div></section></div>`;
    }
    if (state.modal === "new-delivery") {
      const client = state.modalClient; return `<div class="modal-wrap" data-action="close-modal"><section class="modal"><div class="sheet-head"><div class="avatar">${icon("route", 18)}</div><div><h2>Criar entrega</h2><p class="subtitle">${H.escape(client && (client.name || client.nome) || "Cliente")}</p></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="new-delivery-form"><input type="hidden" name="customerProfileId" value="${H.escape(client && client.id || "")}"><div class="form-grid"><div class="field"><label>Produto</label><select name="productId"><option value="">Sem produto</option>${(state.products || []).filter(p => p.ativo !== false).map(p => `<option value="${p.id}">${H.escape(p.nome || p.name)}</option>`).join("")}</select></div><div class="field"><label>Quantidade</label><input name="quantidade" type="number" min="1" value="1"></div></div><div class="field"><label>Data e hora</label><input name="scheduledAt" type="datetime-local" value="${localDateTimeInputValue(new Date(Date.now() + 3600000))}"></div><div class="field"><label>Observação</label><textarea name="notes" data-enter-submit maxlength="500"></textarea></div><button class="btn btn-primary btn-block" type="submit">Adicionar à rota</button></form></section></div>`;
    }
    // HISTÓRICO DO CLIENTE (22/07) — a resposta pro "vocês nunca vieram" / "eu já
    // paguei". Cartão CENTRAL (Lei 3). Cada linha some SEGURANDO PRESSIONADO (Lei
    // 1: nunca lixeira); "Apagar tudo" pede confirmação. Apagar aqui NÃO mexe em
    // cobrança — a tela diz isso, porque é a dúvida óbvia de quem aperta.
    if (state.modal === "historico") {
      const h = state.historico || {};
      const nome = (state.modalClient && (state.modalClient.nome || state.modalClient.name)) || "Cliente";
      const corpo = h.loading
        ? loading()
        : h.erro
          ? `<div class="hbx-aviso hbx-aviso--danger">${H.escape(h.erro)}</div>`
          : (h.items || []).length
            ? `<div class="historico-lista">${h.items.map(linha => historicoLinha(linha)).join("")}</div><p class="subtitle historico-dica">Segure em cima de uma linha para apagar</p>`
            : empty("Sem histórico ainda", "Cada entrega, pagamento ou não atendimento entra aqui.");
      return centerModal({
        icon: "calendar",
        title: "Histórico",
        resumo: H.escape(nome),
        body: corpo,
        closeAction: "close-historico",
        closeButtonAction: "close-historico",
        extra: (h.items || []).length ? `<div class="historico-rodape"><button type="button" class="link-btn historico-limpar" data-action="historico-limpar">Apagar tudo</button></div>` : "",
      });
    }
    // 28/07 (dono, item 4) — "+" da tela Rota: a MESMA Rota rápida do Gerenciador
    // (padronizar é IGUALAR), agora encaixando na rota que já está rodando.
    if (state.modal === "rota-rapida") return state.montagemRapida ? montagemRapidaModal() : "";
    if (state.modal === "manage-day") {
      // R1 (27/07) — tela ÚNICA de montagem (padrão Circuit); "Rotas salvas" é o
      // único passo separado que restou (vira lista, Voltar cai de novo aqui).
      if (state.dayOrderStep === "saved") return dayOrderSavedModal();
      return montagemUnicaSheet();
    }
    // 26/07 — o modal "Modo das próximas rotas" (Essencial × Rastreada) SAIU do
    // celular por ordem do dono. Simples é o modo de todo mundo; a Rastreada
    // continua existindo no backend e quem liga é o ADMINISTRADOR PELO PC
    // (/logistica/config → "Modo das novas rotas"). O aparelho só OBEDECE o modo
    // que o servidor devolve em state.config/state.route — nunca escolhe.
    if (state.modal === "arrival-radius") { const radius = Math.max(20, Number(state.config && state.config.raioChegadaM || 60)); return `<div class="sheet-wrap" data-action="close-modal"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("gps", 18)}</div><div><h2>Avisar chegada</h2></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><form id="arrival-radius-form"><div class="field"><label>Metros</label><input name="raioChegadaM" type="number" min="20" max="1000" step="10" inputmode="numeric" value="${radius}" required></div><button class="btn btn-primary btn-block" type="submit">Salvar</button></form></section></div>`; }
    if (state.modal === "distance-warning") { const warning = state.distanceWarning || {}; return `<div class="sheet-wrap"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("gps", 18)}</div><div><h2>Você está longe do endereço</h2><p class="subtitle">Confira a entrega antes de continuar</p></div></div><div class="card flat distance-warning-card"><strong class="distance-warning-value">${Math.round(Number(warning.distance || 0))} m</strong><p class="subtitle distance-warning-sub">do endereço de ${H.escape(warning.clientName || "este cliente")}</p></div><p class="subtitle">A entrega só deve ser confirmada de longe se você tiver certeza de que está no local correto.</p><div class="actions"><button class="btn btn-secondary" data-action="cancel-distance-confirm">Voltar</button><button class="btn btn-primary" data-action="confirm-distance-delivery">Confirmar mesmo assim</button></div></section></div>`; }
    if (state.modal === "statement") {
      // PR18072026 — o extrato real do backend (getAdminStatement) devolve saldo,
      // totals.{bonusCredits,trackedDeliveries}, usage.{hoje,semana,mes} e a lista
      // trackedDeliveries[]. Créditos são NÚMEROS inteiros, nunca moeda.
      const s = state.statement || {}; const totals = s.totals || {}; const usage = s.usage || {};
      const moves = Array.isArray(s.trackedDeliveries) ? s.trackedDeliveries : [];
      return `<div class="sheet-wrap" data-action="close-modal"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("wallet", 18)}</div><div><h2>Consumo e bônus</h2></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><div class="kpis"><div class="kpi"><span>Saldo</span><strong>${Number(s.balanceCredits || 0)}</strong></div><div class="kpi"><span>Bônus</span><strong>${Number(totals.bonusCredits || 0)}</strong></div><div class="kpi"><span>Entregas</span><strong>${Number(totals.trackedDeliveries || 0)}</strong></div></div><div class="kpis"><div class="kpi"><span>Hoje</span><strong>${Number(usage.hoje || 0)}</strong></div><div class="kpi"><span>Semana</span><strong>${Number(usage.semana || 0)}</strong></div><div class="kpi"><span>Mês</span><strong>${Number(usage.mes || 0)}</strong></div></div><div class="list">${moves.length ? moves.slice(0, 30).map(e => `<div class="row-card"><div class="card-main"><strong>Entrega rastreada</strong><span>${H.date(e.completedAt)}</span></div><strong>${Number(e.paidCredits || e.credits || 0)}</strong></div>`).join("") : empty("Sem entregas rastreadas", "")}</div></section></div>`;
    }
    if (state.modal === "route-modelo-editor") return routeModeloEditorModal();
    if (state.modal === "rota-conferencia") return rotaConferenciaModal();
    if (state.modal === "recarga") return recargaModal();
    if (state.modal === "financeiro") return financeiroModal();
    if (state.modal === "sons") return sonsModal();
    if (state.modal === "avancado") return avancadoModal();
    if (state.modal === "leitura-parada") return leituraParadaModal();
    if (state.modal === "leitura-finalizar") return leituraFinalizarModal();
    if (state.modal === "leitura-ativa") return leituraAtivaModal();
    if (state.modal === "app-update") return appUpdateModal();
    return "";
  }
  // O checkout completo é aberto pelo nativo em uma WebView isolada. Esta
  // tela mantém somente a vitrine; nenhum dado de cartão existe neste shell.
  function recargaPacks() { return state.recargaCatalog && Array.isArray(state.recargaCatalog.packs) ? state.recargaCatalog.packs : []; }
  function beginRecargaCheckout(packKey) {
    const pack = recargaPacks().find(item => String(item.key) === String(packKey));
    if (!pack || pack.paused) return;
    if (!H.recharge(pack.key)) toast("Atualize o aplicativo para concluir a recarga.", true);
  }
  function recargaSheetHeader(title, subtitle) {
    return `<div class="recarga-head"><div class="recarga-head-icon">${icon("wallet", 19)}</div><div class="recarga-head-copy"><h2>${H.escape(title)}</h2>${subtitle ? `<p>${H.escape(subtitle)}</p>` : ""}</div><button type="button" class="close recarga-close" data-action="close-modal" aria-label="Fechar">${icon("close", 18)}</button></div>`;
  }
  function recargaPacksView() {
    const catalog = state.recargaCatalog || {};
    const packs = recargaPacks();
    const balance = Number(catalog.balance !== undefined ? catalog.balance : state.statement && state.statement.balanceCredits || 0);
    const units = packs.filter(pack => !pack.paused && Number(pack.credits) > 0 && Number(pack.price) > 0).map(pack => Number(pack.price) / Number(pack.credits));
    const worstUnit = units.length ? Math.max(...units) : 0;
    const skeletons = `<div class="recarga-pack-track" aria-hidden="true">${[0, 1, 2].map(() => `<div class="recarga-pack recarga-pack-skeleton loading"></div>`).join("")}</div>`;
    const error = `<div class="recarga-load-error"><div class="recarga-load-error-icon">${icon("wallet", 22)}</div><strong>Não foi possível abrir a recarga</strong><p>${H.escape(state.recargaError || "Tente novamente em instantes.")}</p><button type="button" class="btn btn-secondary" data-action="recarga-reload">Tentar novamente</button></div>`;
    const cards = packs.map(pack => {
      const credits = Number(pack.credits || 0); const price = Number(pack.price || 0); const unit = credits > 0 ? price / credits : 0;
      const save = !pack.paused && worstUnit > 0 && unit > 0 ? Math.round((1 - unit / worstUnit) * 100) : 0;
      const badge = pack.badge || (pack.recommended ? "Mais escolhido" : "");
      return `<article class="recarga-pack${pack.recommended ? " is-best" : ""}${pack.paused ? " is-paused" : ""}" data-recarga-pack="${H.escape(pack.key)}">${badge ? `<span class="recarga-pack-badge">${H.escape(badge)}</span>` : ""}<span class="recarga-pack-title">${H.escape(pack.title || "Pacote")}</span><div class="recarga-pack-credits"><strong>${credits.toLocaleString("pt-BR")}</strong><span>créditos</span></div><strong class="recarga-pack-price">${H.money(price)}</strong><span class="recarga-pack-unit">${H.money(unit)} por crédito</span>${save > 0 ? `<span class="recarga-pack-save">Economize ${save}% por crédito</span>` : `<span class="recarga-pack-save is-neutral">Recarga rápida e sem assinatura</span>`}<span class="recarga-pack-expiry">Validade de ${Number(pack.defaultExpiryDays || 0)} dias</span><button type="button" class="btn btn-primary btn-block recarga-pack-cta" data-action="recarga-select-pack" data-pack-key="${H.escape(pack.key)}" ${pack.paused ? "disabled" : ""}>${pack.paused ? "Em breve" : "Escolher pacote"}</button></article>`;
    }).join("");
    const content = state.recargaLoading ? skeletons : state.recargaError ? error : packs.length ? `<div class="recarga-pack-track">${cards}</div>` : `<div class="recarga-load-error"><strong>Sem pacotes no momento</strong><p>Fale com o suporte HBX.</p></div>`;
    return `${recargaSheetHeader("Recarga de créditos", "Escolha o pacote ideal para sua operação")}<section class="recarga-balance-hero"><span class="recarga-balance-kicker">Saldo disponível</span><div class="recarga-balance-value"><strong>${Number.isFinite(balance) ? balance.toLocaleString("pt-BR") : "0"}</strong><span>créditos</span></div><p>Os créditos entram na hora após a aprovação.</p><span class="recarga-balance-orbit one"></span><span class="recarga-balance-orbit two"></span></section><div class="recarga-section-title"><div><strong>Pacotes</strong><span>Sem assinatura e sem fidelidade</span></div><span class="recarga-secure-chip">${icon("lock", 13)} Seguro</span></div>${content}<div class="recarga-trust-row"><span>${icon("check", 14)} Aprovação imediata</span><span>${icon("check", 14)} Valor atualizado</span><span>${icon("lock", 14)} Cartão protegido</span></div>`;
  }
  function recargaModal() {
    return `<div class="sheet-wrap recarga-wrap" data-action="close-modal"><section class="sheet recarga-sheet">${recargaPacksView()}</section></div>`;
  }
  function openRecarga() {
    if (!isAdmin()) return;
    state.recargaLoading = true;
    state.recargaError = null;
    state.recargaCatalog = null;
    showModal("recarga");
    void (async () => {
      try {
        const wallet = await H.api("/credits/me");
        const billingShape = wallet && wallet.balance !== undefined && Array.isArray(wallet.packs);
        if (!billingShape) throw new Error("A recarga está disponível somente para o responsável pela conta.");
        state.recargaCatalog = wallet;
        state.statement = { ...(state.statement || {}), balanceCredits: Number(wallet.balance || 0) };
        state.recargaLoading = false;
        render();
        return;
      } catch (error) { state.recargaError = humanApiError(error); }
      state.recargaLoading = false;
      render();
    })();
  }
  // Trava de créditos esgotados (L4-F): saldo <= 0 SEM rota ativa cobre o app —
  // quem está dirigindo termina o dia (exceção pedida pelo dono); o próximo boot
  // sem saldo cai na trava. Erro de rede NUNCA tranca (fail-open): trancar por
  // bug de conexão seria pior que deixar passar um dia de saldo negativo.
  async function refreshCreditsLock() {
    const wasLocked = !!state.creditsLock;
    try {
      const statement = await H.api("/logistica/creditos/extrato");
      state.statement = statement;
      const balance = Number(statement && statement.balanceCredits);
      state.creditsLock = Number.isFinite(balance) && balance <= 0 && !routeActive() ? { balance } : null;
    } catch (_) { state.creditsLock = null; }
    // S7 (PR22072026-APP-SOUNDS) — warning toca SÓ na TRANSIÇÃO destravado→
    // travado, nunca a cada render(): refreshCreditsLock roda de novo a cada
    // refresh() (isAdmin) e um re-toque a cada poll seria irritante/errado.
    if (state.creditsLock && !wasLocked) H.sound("warning");
    render();
  }
  // 28/07 (dono) — papel operacional NUNCA vê trava de créditos: dinheiro é
  // conversa do admin (LEI DO VENDEDOR). O booleano `creditosEsgotados` do
  // config segue existindo pro painel web; aqui ele não trava mais nada — a
  // função sobrevive só pra limpar lock residual deixado por versão anterior.
  function applyDriverCreditsLock() {
    state.creditsLock = null;
  }
  // 28/07 (dono, incidente "créditos esgotados" com carteira cheia) — o 402 de
  // rota agora vem com a CAUSA (body.reason, ver commercialUnavailable() em
  // logistica-route-billing.service.ts) e cada causa tem a SUA tela, em
  // linguagem de cliente. A trava de créditos (overlay com Recarregar) é
  // EXCLUSIVA do admin e SÓ nasce de reason "creditos" (saldo zerado de
  // verdade); pintá-la por qualquer 402 custou clientela. Backend antigo sem
  // reason NUNCA tranca créditos (fail-open) — cai no cartão genérico com a
  // mensagem do servidor. Devolve true quando tratou (o chamador não joga
  // toast técnico em cima).
  const ROUTE_NOTICE_CARDS = {
    creditos: { icon: "lock", title: "Dia bloqueado", text: "Fale com o responsável pela conta para liberar as rotas de hoje." },
    "rota-vazia": { icon: "map", title: "Rota sem paradas", text: "Adicione pelo menos uma entrega para montar a rota do dia." },
    "cobranca-pendente": { icon: "map", title: "Rota desatualizada", text: "A rota mudou depois de preparada. Recalcule a rota e tente iniciar de novo." },
    "rota-nao-iniciada": { icon: "navigation", title: "Rota ainda não iniciada", text: "Inicie a rota do dia antes de confirmar entregas." },
    "entrega-fora-da-rota": { icon: "gps", title: "Entrega fora da rota de hoje", text: "Recalcule a rota para incluir esta entrega." },
  };
  function routeUnavailableFromError(error) {
    const body = error && error.body;
    if (!body || body.code !== "LOGISTICA_ROUTE_UNAVAILABLE") return false;
    if (body.reason === "creditos" && isAdmin()) {
      const wasLocked = !!state.creditsLock;
      state.creditsLock = state.creditsLock || { balance: 0 };
      if (!wasLocked) H.sound("warning");
      render();
      return true;
    }
    const card = ROUTE_NOTICE_CARDS[body.reason];
    state.routeNotice = card ? { ...card } : { icon: "map", title: "Não deu para concluir", text: humanApiError(error) };
    H.sound("warning");
    render();
    return true;
  }
  function creditsLockOverlay() {
    // 28/07 (dono) — overlay de créditos é EXCLUSIVO do admin; quem não é
    // admin nunca vê tela de dinheiro (blindagem além do gate acima).
    if (!state.creditsLock || !isAdmin()) return "";
    return `<div class="credits-lock"><div class="credits-lock-card"><div class="avatar">${icon("wallet", 22)}</div><h2>Créditos esgotados</h2><p>Sem créditos a rota do dia não pode ser gerada. Recarregue para continuar usando o aplicativo.</p><button class="btn btn-primary btn-block" data-action="open-recarga">Recarregar créditos</button><button class="btn btn-secondary btn-block" data-action="credits-lock-refresh">Já recarreguei · atualizar</button></div></div>`;
  }
  // 28/07 (dono) — cartão de recusa da rota por tipo (ROUTE_NOTICE_CARDS):
  // mesma casca visual da trava (zero classe nova), fecha no "Entendi". A
  // trava de créditos tem prioridade — nunca dois overlays ao mesmo tempo.
  function routeNoticeOverlay() {
    const notice = state.routeNotice;
    if (!notice || state.creditsLock) return "";
    return `<div class="credits-lock"><div class="credits-lock-card"><div class="avatar">${icon(notice.icon || "map", 22)}</div><h2>${H.escape(notice.title)}</h2><p>${H.escape(notice.text)}</p><button class="btn btn-primary btn-block" data-action="route-notice-close">Entendi</button></div></div>`;
  }
  // ==========================================================================
  // S5 (PR22072026-APP-SOUNDS) — Central de Sons: chip no topo (syncHeaderChips
  // acima) + linha "Sons" em Ajustes abrem A MESMA folha (sonsModal). Tabela
  // PT-BR dos sons que entram no APK (docs/APP SOUNDS/docs/sound-map.json),
  // agrupada pelo MOMENTO em que o motorista ouve — nunca a key técnica
  // (`delivery_complete` não diz nada a ninguém). `essencial` marca a ÚNICA
  // linha que o dono pediu como "escolha consciente, não deslize de dedo"
  // (S5-PREFERENCIA.md): por isso ela é a PRIMEIRA da lista.
  // ==========================================================================
  const SOUND_CATALOG = [
    { group: "Chegada", key: "arrival_alert_loop", label: "Aviso de chegada", essencial: true },
    { group: "Chegada", key: "arrival_confirm", label: "Chegada confirmada" },
    { group: "Entrega", key: "delivery_complete", label: "Entrega concluída" },
    { group: "Entrega", key: "proof_saved", label: "Comprovante salvo" },
    { group: "Sincronia", key: "offline_saved", label: "Salvo sem internet" },
    { group: "Sincronia", key: "sync_pending", label: "Sincronização pendente" },
    { group: "Sincronia", key: "sync_complete", label: "Sincronização concluída" },
    { group: "Rota", key: "pause_detected", label: "Parada detectada" },
    { group: "Rota", key: "route_start", label: "Rota iniciada" },
    { group: "Rota", key: "route_stop", label: "Rota encerrada" },
    { group: "Rota", key: "navigation_open", label: "Navegação aberta" },
    { group: "Sistema", key: "error", label: "Erro" },
    { group: "Sistema", key: "warning", label: "Aviso" },
    { group: "Sistema", key: "success", label: "Sucesso" },
    { group: "Sistema", key: "update_complete", label: "Atualização concluída" },
    { group: "Sistema", key: "pairing_success", label: "Pareamento concluído" },
    { group: "Sistema", key: "sonic_logo", label: "Abertura do app" },
  ];
  // 27/07 (dono) — a linha "Sons" de Ajustes MORREU: a Central de Sons continua
  // inteira, agora com uma porta só — o chip de som do topo (data-action
  // "chip-som", em toda tela). Duas portas pro mesmo lugar era repetição.
  // Cada item é um DIV (não button) com data-action próprio — precisa de DOIS
  // alvos de toque independentes na mesma linha (o toggle do item inteiro E o
  // ▶ da prévia), e <button> dentro de <button> é HTML inválido. O clique
  // delegado do app (app.addEventListener("click", …)) já despacha por
  // [data-action] em QUALQUER tag, então o div funciona igual a um botão —
  // mesmo truque que stopCard() usa (article + role="button" + tabindex).
  function soundItemRow(entry) {
    const on = soundItemOn(entry.key);
    return `<div class="settings-row" data-action="toggle-sound-item" data-sound-key="${entry.key}" role="switch" aria-checked="${on}" tabindex="0"><div class="settings-copy"><strong>${H.escape(entry.label)}</strong></div><button type="button" class="link-btn" data-action="preview-sound" data-sound-key="${entry.key}" aria-label="Ouvir ${H.escape(entry.label)}">${icon("play", 15)}</button><span class="module-switch ${on ? "active" : ""}" aria-hidden="true"><i></i></span></div>`;
  }
  function soundGroupSection(groupName) {
    const rows = SOUND_CATALOG.filter(entry => entry.group === groupName).map(soundItemRow).join("");
    return `<div class="section-title"><strong>${groupName}</strong></div><section class="card flat">${rows}</section>`;
  }
  function sonsModal() {
    const master = soundMasterOn();
    const voz = soundVozOn();
    // Mestra desligada: a lista continua visível (o dono quer poder préconfigurar
    // os itens mesmo mudo), só esmaece — mesma classe hbx-dimmed de produto
    // arquivado/cliente pendente, sem `pointer-events` (os toggles continuam
    // funcionando, só o SOM que não sai enquanto a mestra estiver off).
    const groupsHtml = ["Chegada", "Entrega", "Sincronia", "Rota", "Sistema"].map(soundGroupSection).join("");
    return `<div class="sheet-wrap" data-action="close-modal"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon(master ? "volume" : "volumeOff", 18)}</div><div><h2>Sons</h2></div><button class="close" data-action="close-modal" aria-label="Fechar">${icon("close", 18)}</button></div><section class="card flat"><button class="settings-row" type="button" data-action="toggle-sound-master" role="switch" aria-checked="${master}"><div class="avatar">${icon(master ? "volume" : "volumeOff", 18)}</div><div class="settings-copy"><strong>Todos os sons</strong></div><span class="module-switch ${master ? "active" : ""}" aria-hidden="true"><i></i></span></button><button class="settings-row" type="button" data-action="toggle-sound-voz" role="switch" aria-checked="${voz}"><div class="avatar">${icon(voz ? "volume" : "volumeOff", 18)}</div><div class="settings-copy"><strong>Voz do GPS</strong></div><span class="module-switch ${voz ? "active" : ""}" aria-hidden="true"><i></i></span></button></section><div class="${master ? "" : "hbx-dimmed"}">${groupsHtml}</div></section></div>`;
  }
  // PR18072026 — "Financeiro" (Ajustes › Administração): mestre liga/desliga o
  // módulo inteiro; sub-toggles só aparecem com o mestre ON. Cada linha é 1
  // PATCH /logistica/config isolado, mesmo padrão do antigo toggle-cobranca-simples.
  function financeiroModal() {
    const ativo = configFlag("moduloFinanceiroAtivo");
    const sub = (key, label, hint) => `<button class="settings-row" type="button" data-action="toggle-config-flag" data-config-key="${key}" role="switch" aria-checked="${configFlag(key)}"><div class="settings-copy"><strong>${label}</strong>${hint ? `<span>${hint}</span>` : ""}</div><span class="module-switch ${configFlag(key) ? "active" : ""}" aria-hidden="true"><i></i></span></button>`;
    return `<div class="sheet-wrap" data-action="close-modal"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("wallet", 18)}</div><div><h2>Financeiro</h2></div><button class="close" data-action="close-modal" aria-label="Fechar">${icon("close", 18)}</button></div><section class="card flat"><button class="settings-row" type="button" data-action="toggle-config-flag" data-config-key="moduloFinanceiroAtivo" role="switch" aria-checked="${ativo}"><div class="avatar">${icon("wallet", 18)}</div><div class="settings-copy"><strong>Ativar financeiro</strong></div><span class="module-switch ${ativo ? "active" : ""}" aria-hidden="true"><i></i></span></button></section>${ativo ? `<section class="card flat">${sub("cobrancaSimples", "Cobrança simples na chegada")}${sub("aceitaNaHora", "Na hora")}${sub("aceitaMensal", "Mensal")}${sub("aceitaFiado", "Fiado")}${sub("precoPorClienteAtivo", "Preço por cliente")}</section>` : ""}</section></div>`;
  }
  // "Avançado" (Ajustes › Administração): estrutura pronta pra crescer com
  // mais toggles operacionais, sem precisar de tela nova a cada item.
  function avancadoModal() {
    return `<div class="sheet-wrap" data-action="close-modal"><section class="sheet"><div class="handle"></div><div class="sheet-head"><div class="avatar">${icon("gear", 18)}</div><div><h2>Avançado</h2></div><button class="close" data-action="close-modal">${icon("close", 18)}</button></div><section class="card flat"><button class="settings-row" type="button" data-action="toggle-config-flag" data-config-key="avisoWhatsEnabled" role="switch" aria-checked="${configFlag("avisoWhatsEnabled")}"><div class="avatar">${icon("wa", 18)}</div><div class="settings-copy"><strong>Mensagens automáticas</strong></div><span class="module-switch ${configFlag("avisoWhatsEnabled") ? "active" : ""}" aria-hidden="true"><i></i></span></button><button class="settings-row" type="button" data-action="toggle-config-flag" data-config-key="cobrancaAutomatica" role="switch" aria-checked="${configFlag("cobrancaAutomatica")}"><div class="avatar">${icon("wallet", 18)}</div><div class="settings-copy"><strong>Cobrança automática</strong></div><span class="module-switch ${configFlag("cobrancaAutomatica") ? "active" : ""}" aria-hidden="true"><i></i></span></button></section></section></div>`;
  }
  // 27/07 (dono) — "Minhas rotas" (Ajustes › Administração) MORREU: era a mesma
  // lista de "Rotas salvas", que hoje mora no Gerenciador de Rota. Foi junto o
  // "Renomear" que só existia nela (e chamava window.prompt, dialog nativo que o
  // app não usa em lugar nenhum); o editor da rota salva segue pelo lápis da lista.
  // ——— Editor da rota salva (21/07, pedido do dono): reordenar, remover, somar
  // cliente e mexer nos itens de cada parada. Tudo em rascunho no estado; só o
  // "Salvar" manda o PATCH — sair fora disso não escreve nada.
  function rmeParadaResumo(parada) {
    const itens = Array.isArray(parada.itens) ? parada.itens : [];
    if (!itens.length) return "Defina os itens desta parada";
    return itens.map(item => `${item.qtd}× ${produtoNome(item.productId)}`).join(" · ");
  }
  function produtoNome(productId) {
    const produto = (state.products || []).find(p => String(p.id) === String(productId));
    return produto ? (produto.nome || produto.name || "Produto") : "Produto";
  }
  function rmeClienteNome(parada) {
    const cliente = clientById(parada.customerProfileId);
    return cliente ? (cliente.nome || cliente.name || "Cliente") : "Cliente removido";
  }
  function routeModeloEditorParadasStep() {
    const editor = state.routeModeloEditor;
    const paradas = editor.paradas || [];
    // Tirar da rota é SEGURAR PRESSIONADO (padrão do app: Clientes, Produtos e
    // paradas da rota do dia). Sem lixeira — o dono não quer botão de excluir.
    const rows = paradas.map((parada, index) => {
      const nome = rmeClienteNome(parada);
      const constraints = routeConstraintChips(routeConstraintSource(parada, clientById(parada.customerProfileId)));
      return `<div class="row-card rp2-order-row" data-rme-parada="${index}"><label class="rp2-order-position"><span>Pos.</span><input type="number" min="1" max="${paradas.length}" inputmode="numeric" value="${index + 1}" data-rme-position-index="${index}" aria-label="Posição de ${H.escape(nome)}"></label><button type="button" class="card-main card-main-btn" data-action="rme-editar-itens" data-index="${index}"><strong>${H.escape(nome)}</strong><span>${H.escape(rmeParadaResumo(parada))}</span>${constraints}</button><div class="rp2-order-arrows"><button type="button" class="btn btn-secondary rp2-order-arrow" data-action="rme-mover" data-index="${index}" data-delta="-1" aria-label="Mover para cima" ${index === 0 ? "disabled" : ""}>${icon("chevronUp", 18)}</button><button type="button" class="btn btn-secondary rp2-order-arrow" data-action="rme-mover" data-index="${index}" data-delta="1" aria-label="Mover para baixo" ${index === paradas.length - 1 ? "disabled" : ""}>${icon("chevronDown", 18)}</button></div></div>`;
    }).join("");
    const body = `<div class="list day-order-list">${rows || empty("Rota sem paradas", "Toque em adicionar cliente abaixo.")}</div><button class="delivery-add" type="button" data-action="rme-add-cliente">+ Adicionar cliente</button><p class="subtitle rme-dica">Toque: itens · Segure: tirar</p>`;
    return centerModal({
      icon: "route",
      title: H.escape(editor.nome || "Rota salva"),
      resumo: `${paradas.length} parada(s)`,
      body,
      backAction: "rme-fechar",
      backLabel: "Fechar",
      nextAction: "rme-salvar",
      nextLabel: editor.saving ? "Salvando…" : "Salvar",
      nextDisabled: !!editor.saving,
    });
  }
  function routeModeloEditorClienteStep() {
    // Mesma lista/busca do seletor da leitura (server-side) — nada de inventar
    // uma segunda régua de carregamento pro dono.
    const jaNaRota = new Set((state.routeModeloEditor.paradas || []).map(p => String(p.customerProfileId)));
    const pool = (state.clients || []).filter(client => client && client.id != null && !jaNaRota.has(String(client.id)));
    const list = pool.length ? `<div class="list hbx-selection-list">${pool.map(client => clientCatalogCard(client, { selection: true })).join("")}</div>` : "";
    const vazio = pool.length ? "" : empty(state.clientsLoading ? "Carregando…" : "Nenhum cliente", "Todos já estão nesta rota.");
    const body = `<div class="hbx-selection-view"><label class="search hbx-selection-toolbar">${icon("search", 16)}<input id="leitura-cliente-search" placeholder="Buscar por nome, telefone ou endereço" value="${H.escape(state.leituraClienteQuery)}" autocomplete="off"></label>${list}${vazio}${clientsAutoLoad()}</div>`;
    return centerModal({ icon: "users", title: "Adicionar cliente", resumo: "Quem entra na rota?", body, backAction: "rme-voltar-paradas", backLabel: "Voltar", nextAction: "" });
  }
  function routeModeloEditorItensStep() {
    const editor = state.routeModeloEditor;
    const parada = (editor.paradas || [])[editor.paradaIndex];
    if (!parada) return routeModeloEditorParadasStep();
    const itens = Array.isArray(parada.itens) ? parada.itens : [];
    const selectedIds = new Set(itens.map(i => String(i.productId)));
    const available = (state.products || []).filter(p => p && p.id != null && p.ativo !== false && !selectedIds.has(String(p.id)));
    if (editor.produtoPicker) {
      const list = available.length ? `<div class="list hbx-selection-list">${available.map(product => `<button type="button" class="lead-card hbx-selection-item" data-action="rme-produto-escolher" data-product-id="${H.escape(product.id)}"><div class="avatar">${icon("box", 19)}</div><div class="card-main"><strong>${H.escape(product.nome || product.name)}</strong><span>${H.escape(product.unidade || "unidade")}</span></div><span class="selection-mode-chevron">${icon("chevronRight", 18)}</span></button>`).join("")}</div>` : empty("Todos os produtos já estão nesta parada", "");
      return centerModal({ icon: "box", title: "Produtos", resumo: "Escolha no catálogo", body: `<div class="hbx-selection-view">${list}</div>`, backAction: "rme-produto-fechar-picker", backLabel: "Voltar", nextAction: "" });
    }
    const rows = itens.map(item => `<div class="lrt-produto-item" data-rme-item="${H.escape(item.productId)}"><div class="lrt-produto-head"><div><strong>${H.escape(produtoNome(item.productId))}</strong></div></div><div class="lrt-produto-controls"><div class="delivery-stepper"><button type="button" data-action="rme-item-qtd" data-product-id="${H.escape(item.productId)}" data-delta="-1">−</button><b>${item.qtd}</b><button type="button" data-action="rme-item-qtd" data-product-id="${H.escape(item.productId)}" data-delta="1">+</button></div></div></div>`).join("");
    // Sem snapshot de itens, o catálogo já entra na tela para o operador
    // completar a parada sem misturar produtos de outros dias.
    if (!itens.length) {
      const catalogo = available.length
        ? `<div class="list hbx-selection-list">${available.map(product => productCatalogCard(product, { selection: true })).join("")}</div>`
        : empty("Nenhum produto no catálogo", "Cadastre um produto para fixar itens nesta rota.");
      const body = `<p class="subtitle rme-dica">Defina os itens desta parada.</p>${catalogo}`;
      return centerModal({ icon: "box", title: H.escape(rmeClienteNome(parada)), resumo: "O que ele recebe nesta rota", body, backAction: "rme-voltar-paradas", backLabel: "Voltar", nextAction: "" });
    }
    const body = `${rows}${available.length ? `<button class="delivery-add" type="button" data-action="rme-produto-abrir-picker">+ Adicionar produto</button>` : ""}<p class="subtitle rme-dica">Segure um produto para tirar.</p>`;
    return centerModal({ icon: "box", title: H.escape(rmeClienteNome(parada)), resumo: "O que ele recebe nesta rota", body, backAction: "rme-voltar-paradas", backLabel: "Voltar", nextAction: "" });
  }
  function routeModeloEditorModal() {
    const editor = state.routeModeloEditor;
    if (!editor) return "";
    if (editor.step === "cliente") return routeModeloEditorClienteStep();
    if (editor.step === "itens") return routeModeloEditorItensStep();
    return routeModeloEditorParadasStep();
  }
  // Puxa TODAS as páginas de cliente: sem isso o editor mostra "Cliente removido"
  // em quem ficou fora da 1ª página.
  async function ensureAllClientsLoaded() {
    if (state.clientsPage === 0 || state.query !== "") { state.query = ""; await loadClients(true, true); }
    let guard = 0;
    while (state.clientsPage < state.clientsTotalPages && guard < 40) { guard += 1; await loadClients(false, true); }
  }
  async function abrirRouteModeloEditor(modeloId) {
    const modelo = (state.routeModelos || []).find(m => String(m.id) === String(modeloId));
    if (!modelo) return;
    state.routeModeloEditor = {
      id: modelo.id,
      nome: modelo.nome || "Rota salva",
      paradas: (modelo.paradas || []).map(parada => ({
        customerProfileId: String(parada.customerProfileId || ""),
        ...(parada.localId ? { localId: String(parada.localId) } : {}),
        ...(parada.horaRef ? { horaRef: String(parada.horaRef) } : {}),
        itens: (Array.isArray(parada.itens) ? parada.itens : []).map(item => ({
          productId: Number(item.productId),
          qtd: Math.max(1, Number(item.qtd) || 1),
          valorUnit: Number(item.valorUnit) || 0,
        })),
      })).filter(parada => parada.customerProfileId),
      step: "paradas",
      paradaIndex: -1,
      produtoPicker: false,
      saving: false,
    };
    state.leituraClienteQuery = "";
    showModal("route-modelo-editor");
    showLoading("Abrindo a rota…");
    try { await ensureAllClientsLoaded(); } finally { hideLoading(); if (state.modal === "route-modelo-editor") render(); }
  }
  async function salvarRouteModeloEditor() {
    const editor = state.routeModeloEditor;
    if (!editor || editor.saving) return;
    if (!editor.paradas.length) { toast("A rota precisa de pelo menos uma parada.", true); return; }
    editor.saving = true; render();
    try {
      const paradas = editor.paradas.map(parada => ({
        customerProfileId: parada.customerProfileId,
        ...(parada.localId ? { localId: parada.localId } : {}),
        ...(parada.horaRef ? { horaRef: parada.horaRef } : {}),
        ...(parada.itens && parada.itens.length ? { itens: parada.itens.map(item => ({ productId: item.productId, qtd: item.qtd, valorUnit: item.valorUnit })) } : {}),
      }));
      await H.api(`/logistica/rota-modelos/${encodeURIComponent(editor.id)}`, { method: "PATCH", body: { paradas } });
      await loadRouteModelos(true);
      state.routeModeloEditor = null;
      await closeOverlay("modal");
      toast("Rota salva atualizada.");
    } catch (error) { editor.saving = false; toast(humanApiError(error), true); render(); }
  }
  // Menu de entrada centralizado. Enquanto as rotas salvas carregam, o botão
  // Salvos mostra "Carregando…".
  // ==========================================================================
  // R1 (27/07, ordem do dono) — MONTAR ROTA numa tela só (padrão Circuit).
  // Morreram: o menu "Montar Rota" (Agenda/Rotas salvas/Registrar caminho) e a
  // Agenda como tela separada. Aqui: chips dos dias no topo ("Adicionado ✓" pra
  // dia que JÁ compõe a rota — fim do "0" mentiroso), mapa da rota, lista
  // (prévia antes de montar; conferência com ▲▼/avisos depois), linha de
  // créditos e "Aceitar rota" (é o Aceitar que debita — o Play depois não cobra
  // de novo). "Rotas salvas" virou LINHA desta tela; "Registrar caminho" saiu
  // do fluxo (mora nos Ajustes — é outro trabalho, não montagem de rota).
  // ==========================================================================
  function montagemConferencia() {
    const rc = state.rotaConferencia;
    return rc && rc.host === "montagem" ? rc : null;
  }
  function montagemDiaChips() {
    const allowed = workDays();
    const hasAgendaDays = !!(state.agenda && Array.isArray(state.agenda.dias) && state.agenda.dias.length);
    const adicionados = routePlanned() ? diasAdicionados() : [];
    return weekDays.filter(day => hasAgendaDays || allowed.includes(day.n)).map(day => {
      const enabled = hasAgendaDays ? agendaDayEnabled(day.n) : allowed.includes(day.n);
      const added = adicionados.includes(day.n);
      const selectedChip = state.daySelection.includes(day.n);
      const count = state.dayCounts ? state.dayCounts[day.n] : undefined;
      // 27/07 (dono) — dia SEM cliente não vira chip. A régua da linha é "onde tem
      // gente pra entregar": dia inativo e dia zerado só ocupavam espaço. Dia que
      // JÁ está na rota fica sempre (o servidor zera a contagem depois de montar) e
      // dia ainda contando (undefined) também — sumir e voltar meio segundo depois
      // faria a linha inteira piscar.
      if (!added && (!enabled || count === null || count === 0)) return "";
      // 27/07 (dono, 2ª ordem) — dia na rota fica verde E MANTÉM o número: a
      // contagem é ROSTER da agenda (quanta gente tem no dia), que não zera ao
      // montar. Sumir com o número parecia a tela quebrando.
      const sub = count === undefined ? "…" : count === null ? "" : `${count}`;
      return `<button type="button" class="montagem-dia${selectedChip || added ? " active" : ""}${added ? " is-added" : ""}${enabled ? "" : " is-inactive"}" data-day="${day.n}" aria-pressed="${selectedChip || added}" ${enabled ? "" : "disabled"}><strong>${day.label}</strong><small>${H.escape(sub)}</small></button>`;
    }).join("");
  }
  function montagemMapPoints() {
    const rc = montagemConferencia();
    if (rc && rc.data && Array.isArray(rc.data.paradas)) {
      return rc.data.paradas.map((p, index) => validCoordinates(p.lat, p.lng) ? { item: p, lat: Number(p.lat), lng: Number(p.lng), number: index + 1 } : null).filter(Boolean);
    }
    return (state.dayPreview || []).map((client, index) => { const c = dayPreviewCoordinates(client); return c ? { item: c.item, lat: c.lat, lng: c.lng, number: index + 1 } : null; }).filter(Boolean);
  }
  // R2 (27/07) — "+" ROTA RÁPIDA: CEP+número (resolver CNEFE do backend, GET
  // /logistica/geo/cep) ou toque no mapa viram uma parada NA rota que
  // está sendo montada. CEP+número NÃO manda pino: o servidor resolve pela base
  // CNEFE no cadastro e grava a fonte certa ('cnefe'); toque no mapa manda o
  // ponto tocado (o backend carimba 'gps_impreciso' — a 1ª entrega corrige).
  // 28/07 (dono) — "Direção" é o padrão: o pedido foi "só traçar rota mesmo,
  // sem produto, sem valor nem nada". Quem quer cliente de verdade toca em
  // Cadastro. Toque no mapa não tem cadastro pra fazer — é sempre Direção.
  function rapidaModo(r) {
    if (!r) return "direcao";
    if (r.origem === "mapa") return "direcao";
    return r.modo === "cadastro" ? "cadastro" : "direcao";
  }
  // 🔴 28/07 (dono, na tela) — "se a pessoa clicou em CADASTRO tem q cadastrar
  // certinho, e comece a barrar lixo pra dentro do sistema". No modo Cadastro o
  // nome é OBRIGATÓRIO e tem que ter cara de nome: "1", "...", "-" não são
  // cadastro, são lixo entrando na base. No modo Direção segue opcional — ali o
  // pedido do dono foi "só traçar rota mesmo, sem produto, sem valor nem nada".
  function nomeDeCadastroValido(nome) {
    const limpo = String(nome || "").trim();
    if (limpo.length < 2) return false;
    return (limpo.match(/[a-zà-ÿ]/gi) || []).length >= 2;
  }
  // Conta SEM papel nenhum = stub de endereço (a parada "Direção" nasce assim).
  // Quem cadastra por cima ASSUME o stub em vez de abrir linha nova na base.
  function contaEhStub(conta) { return !!conta && !conta.isCliente && !conta.isLead && !conta.isFornecedor; }
  // Parada ABERTA da mesma conta na rota de hoje. Entregue não conta: voltar no
  // mesmo cliente depois de entregar é operação real ("esqueci o galão").
  function paradaAbertaDaConta(contaId) {
    if (!contaId) return null;
    return openItems().find(item => String((item && item.customerProfileId) || (item && item.cliente && item.cliente.id) || "") === String(contaId)) || null;
  }
  function nomeDaConta(conta) {
    if (!conta) return "";
    return String(conta.nome || "").trim() || [conta.endereco, conta.numero].filter(Boolean).join(", ") || "Cadastro sem nome";
  }
  // 🔴 28/07 (dono: "nem compara se já existe o endereço?") — ANTES de criar conta,
  // pergunta quem JÁ está nesta porta (a régua de "mesma porta" é do backend, e é
  // fail-closed: na dúvida responde vazio). Best-effort: consulta que falha não
  // trava a rua — o pior caso volta a ser o de hoje, uma linha nova.
  async function montagemRapidaChecarPorta() {
    const r = state.montagemRapida;
    const res = r && r.resolvido;
    if (!r || !res) return;
    const numero = onlyDigits(r.numero) || onlyDigits(res.numero);
    if (!numero) { r.duplicado = null; return; }
    const cep = onlyDigits(r.cep) || onlyDigits(res.cep);
    const partes = [`numero=${encodeURIComponent(numero)}`];
    if (cep.length === 8) partes.push(`cep=${encodeURIComponent(cep)}`);
    if (res.endereco) partes.push(`endereco=${encodeURIComponent(res.endereco)}`);
    if (res.bairro) partes.push(`bairro=${encodeURIComponent(res.bairro)}`);
    if (res.cidade) partes.push(`cidade=${encodeURIComponent(res.cidade)}`);
    if (res.uf) partes.push(`uf=${encodeURIComponent(res.uf)}`);
    r.checando = true; render();
    try {
      const resposta = await H.api(`/nucleo/contas/por-endereco?${partes.join("&")}`);
      const achada = resposta && Array.isArray(resposta.contas) ? resposta.contas[0] : null;
      if (state.montagemRapida === r) r.duplicado = achada || null;
    } catch (_) { if (state.montagemRapida === r) r.duplicado = null; }
    finally { if (state.montagemRapida === r) { r.checando = false; render(); } }
  }
  function montagemRapidaModal() {
    const r = state.montagemRapida;
    const res = r.resolvido;
    const temEndereco = !!(res && (res.endereco || res.cidade));
    const resumo = temEndereco
      ? `${[res.endereco, onlyDigits(r.numero)].filter(Boolean).join(", ")}${res.bairro ? ` - ${res.bairro}` : ""}${res.cidade ? ` · ${[res.cidade, res.uf].filter(Boolean).join("/")}` : ""}`
      : "";
    const localizado = !!(res && (validCoordinates(res.lat, res.lng) || r.origem === "mapa"));
    // 🔴 28/07 (dono) — quem já está nesta porta manda na tela: a linha do
    // duplicado VENCE o "Endereço localizado" (é o dado que decide a ação).
    const modo = rapidaModo(r);
    const duplicado = r.duplicado || null;
    const jaNaRota = duplicado ? paradaAbertaDaConta(duplicado.id) : null;
    const procurando = !!(r.buscando || r.checando);
    const statusLinha = r.erro
      ? `<div class="hbx-aviso hbx-aviso--danger">${H.escape(r.erro)}</div>`
      : procurando
        ? `<p class="subtitle">Procurando o endereço…</p>`
        : jaNaRota
          ? `<div class="hbx-aviso hbx-aviso--danger">Já está na rota: ${H.escape(nomeDaConta(duplicado))}</div>`
          : duplicado
            ? `<div class="hbx-aviso hbx-aviso--warn">Já cadastrado: ${H.escape(nomeDaConta(duplicado))}</div>`
            : res
              ? localizado
                ? `<div class="hbx-aviso hbx-aviso--ok">Endereço localizado${resumo ? `: ${H.escape(resumo)}` : ""}</div>`
                : `<div class="hbx-aviso hbx-aviso--warn">Endereço anotado${resumo ? `: ${H.escape(resumo)}` : ""}</div>`
              : "";
    const pronto = !!res;
    // 28/07 (dono, item 4) — na tela Rota o "+" é a MESMA Rota rápida, com uma
    // pergunta a mais: entra no caminho (encaixe pelo ponto mais perto, o app
    // decide) ou fura a fila. Só aparece com rota de pé — sem paradas abertas
    // não há "caminho" nem "primeira" que signifiquem alguma coisa.
    const escolhaPosicao = r.contexto === "rota" && openItems().length
      ? `<div class="day-chips rapida-posicao">${[["perto", "No caminho"], ["primeira", "Primeira parada"]].map(([valor, rotulo]) => `<button type="button" class="montagem-dia${(r.posicao || "perto") === valor ? " active" : ""}" data-action="rota-rapida-posicao" data-posicao="${valor}" aria-pressed="${(r.posicao || "perto") === valor}"><strong>${rotulo}</strong></button>`).join("")}</div>`
      : "";
    // 28/07 (dono) — DIREÇÃO × CADASTRO. Direção é "só traçar rota mesmo": a
    // parada entra na rota igual, mas NÃO vira cliente no Cadastro (a conta
    // nasce isCliente:false — a lista de Clientes filtra por isCliente, a rota
    // não). Cadastro é o fluxo de sempre, pra quando é cliente de verdade.
    // Dinheiro não muda nos dois: a parada é absorvida, quem cobra é a rota.
    const escolhaModo = `<div class="day-chips rapida-modo">${[["direcao", "Direção"], ["cadastro", "Cadastro"]].map(([valor, rotulo]) => `<button type="button" class="montagem-dia${rapidaModo(r) === valor ? " active" : ""}" data-action="rota-rapida-modo" data-modo="${valor}" aria-pressed="${rapidaModo(r) === valor}"><strong>${rotulo}</strong></button>`).join("")}</div>`;
    // 🔴 28/07 (dono) — o campo Nome só existe quando ele vai pra algum lugar:
    // com cadastro JÁ EXISTENTE nesta porta quem manda é o nome de lá (campo que
    // não salva é mentira na tela). Sobra pedir nome quando é conta nova ou
    // quando o Cadastro vai batizar um stub de endereço.
    const vaiBatizar = !duplicado || contaEhStub(duplicado);
    const pedeNome = modo === "cadastro" && vaiBatizar;
    const campoNome = duplicado && !pedeNome
      ? ""
      : `<div class="field"><label>Nome${pedeNome ? "" : " (opcional)"}</label><input name="nome" maxlength="120" value="${H.escape(r.nome)}" data-enter-action="${pronto ? "montagem-rapida-confirmar" : "montagem-rapida-buscar"}"></div>`;
    const body = `<form id="montagem-rapida-form">${r.origem === "cep" ? `<div class="form-grid"><div class="field"><label>CEP</label><input name="cep" inputmode="numeric" maxlength="10" value="${H.escape(r.cep)}"></div><div class="field"><label>Número</label><input name="numero" inputmode="numeric" maxlength="6" value="${H.escape(r.numero)}"></div></div>` : ""}${campoNome}</form>${escolhaModo}${escolhaPosicao}${statusLinha}`;
    const rotuloPronto = !duplicado || modo !== "cadastro"
      ? "Adicionar na rota"
      : contaEhStub(duplicado) ? "Cadastrar aqui" : "Usar este cadastro";
    return centerModal({
      icon: "plus",
      title: "Rota rápida",
      resumo: "",
      body,
      closeAction: "montagem-rapida-fechar",
      closeButtonAction: "montagem-rapida-fechar",
      backAction: "montagem-rapida-fechar",
      backLabel: "Voltar",
      nextAction: pronto ? "montagem-rapida-confirmar" : "montagem-rapida-buscar",
      nextLabel: r.salvando ? "Adicionando…" : pronto ? rotuloPronto : procurando ? "Procurando…" : "Buscar endereço",
      // Parada aberta da mesma porta na rota de hoje: não há o que adicionar.
      nextDisabled: procurando || r.salvando || !!jaNaRota,
    });
  }
  async function montagemRapidaBuscar() {
    const r = state.montagemRapida;
    if (!r || r.buscando) return;
    const cepDigits = onlyDigits(r.cep);
    const numeroDigits = onlyDigits(r.numero);
    if (cepDigits.length !== 8) { r.erro = "Informe o CEP completo."; r.resolvido = null; render(); return; }
    if (!numeroDigits) { r.erro = "Informe o número."; r.resolvido = null; render(); return; }
    r.buscando = true; r.erro = ""; r.duplicado = null; render();
    try {
      const res = await H.api(`/logistica/geo/cep?cep=${encodeURIComponent(cepDigits)}&numero=${encodeURIComponent(numeroDigits)}`);
      if (res && (res.fonte === "cnefe" || res.fonte === "geocode" || res.endereco || res.cidade)) r.resolvido = res;
      else { r.resolvido = null; r.erro = "Não encontrei este endereço. Confira o CEP e o número."; }
    } catch (error) { r.resolvido = null; r.erro = humanApiError(error); }
    finally { r.buscando = false; render(); }
    // Achou o endereço → pergunta quem já mora nele ANTES de deixar cadastrar.
    if (state.montagemRapida === r && r.resolvido) await montagemRapidaChecarPorta();
  }
  // Matriz de tempo pelas RUAS (mesmo proxy OSRM do planejador). null = sem rede
  // ou resposta inválida — quem chama cai na linha reta, nunca trava.
  async function matrizViaria(pontos) {
    if (!Array.isArray(pontos) || pontos.length < 2) return null;
    const encoded = pontos.map(p => `${Number(p.lng)},${Number(p.lat)}`).join(";");
    try {
      let payload;
      try { payload = await H.api(`/logistica/osrm/table?coords=${encodeURIComponent(encoded)}`); }
      catch (_) { payload = await fetchOsrmTablePublic(encoded); }
      const matriz = payload && payload.durations;
      if (payload.code !== "Ok" || !Array.isArray(matriz) || matriz.length !== pontos.length) return null;
      return matriz;
    } catch (_) { return null; }
  }
  // 28/07 (dono, item 4) — ENCAIXE da Rota rápida na rota que já está de pé:
  // "se tiver perto, ele entra na logística — entre 1 e 10, se está mais perto do
  // 5, vira o 6 e ficam 11". Custo de inserção clássico: em cada perna
  // (anterior → próxima) mede quanto custa passar pelo ponto novo no meio
  // (d(ant,novo) + d(novo,prox) − d(ant,prox)); ganha a perna mais barata. Pelas
  // ruas quando o OSRM responde, linha reta quando não. Devolve o NOME de quem
  // fica antes dele (pro toast dizer onde ele caiu) ou null se foi pra frente.
  async function encaixarParadaNaRota(novoId, posicao) {
    const abertas = openItems();
    const novo = abertas.find(item => String(item.id) === String(novoId));
    const base = abertas.filter(item => String(item.id) !== String(novoId));
    // 🔴 28/07 (dono, no g15) — PARADA ÚNICA também planeja. O `!base.length` aqui
    // devolvia `aplicado:false` e saía ANTES do /rota/planejar: com uma parada só,
    // ninguém ganhava rotaOrdem, `routePlanned()` ficava falso e o botão travava
    // em "Montar rota" — o "Iniciar rota" só aparecia depois do 2º endereço. Sem
    // perna pra medir o encaixe não há o que decidir: a ordem É a própria parada.
    if (!novo) return { indice: 0, anterior: null, aplicado: false };
    const ids = base.map(item => String(item.id));
    const pontoDe = item => { const c = (item && item.cliente) || {}; return validCoordinates(c.lat, c.lng) ? { lat: Number(c.lat), lng: Number(c.lng) } : null; };
    const pNovo = pontoDe(novo);
    let indice = ids.length;
    if (posicao === "primeira") indice = 0;
    // Com `base` vazia o índice já é 0 e não há perna pra comparar — pedir matriz
    // ao OSRM pra um ponto só seria round-trip jogado fora.
    else if (pNovo && base.length) {
      const origem = await currentPosition();
      const pOrigem = origem && validCoordinates(origem.lat, origem.lng) ? { lat: origem.lat, lng: origem.lng } : null;
      // nós[0] = de onde eu saio (pode não existir), depois as paradas na ordem,
      // e o novo ponto no fim.
      const nos = [pOrigem, ...base.map(pontoDe), pNovo];
      const indicesValidos = nos.map((p, i) => (p ? i : -1)).filter(i => i >= 0);
      const matriz = await matrizViaria(indicesValidos.map(i => nos[i]));
      const naMatriz = new Map(indicesValidos.map((noIndex, matrixIndex) => [noIndex, matrixIndex]));
      const d = (a, b) => {
        if (a == null || b == null || !nos[a] || !nos[b]) return Infinity;
        if (matriz && naMatriz.has(a) && naMatriz.has(b)) {
          const valor = matriz[naMatriz.get(a)][naMatriz.get(b)];
          if (Number.isFinite(valor)) return valor;
        }
        return distanceMeters(nos[a], nos[b]);
      };
      const iNovo = nos.length - 1;
      let melhor = Infinity;
      for (let k = 0; k <= base.length; k++) {
        const ant = k === 0 ? (pOrigem ? 0 : null) : k;
        const prox = k < base.length ? k + 1 : null;
        const entrada = ant == null ? 0 : d(ant, iNovo);
        const saida = prox == null ? 0 : d(iNovo, prox);
        const antiga = ant == null || prox == null ? 0 : d(ant, prox);
        const custo = entrada + saida - antiga;
        if (Number.isFinite(custo) && custo < melhor) { melhor = custo; indice = k; }
      }
    }
    const novaOrdem = [...ids.slice(0, indice), String(novoId), ...ids.slice(indice)];
    const origem = await currentPosition();
    const body = { date: operationalDate(), deliveryIds: novaOrdem, ordemManual: novaOrdem };
    if (origem && validCoordinates(origem.lat, origem.lng)) { body.origemLat = origem.lat; body.origemLng = origem.lng; }
    applyRouteEngineState(await H.api("/logistica/rota/planejar", { method: "POST", body }));
    setRouteOrdemManual(novaOrdem);
    const anterior = indice > 0 ? base[indice - 1] : null;
    return { indice, anterior: anterior && anterior.cliente && anterior.cliente.nome || null, aplicado: true };
  }
  async function montagemRapidaConfirmar() {
    const r = state.montagemRapida;
    if (!r || r.salvando || r.buscando || r.checando || !r.resolvido) return;
    const res = r.resolvido;
    const modo = rapidaModo(r);
    const duplicado = r.duplicado || null;
    const nomeDigitado = String(r.nome || "").trim();
    // 🔴 28/07 (dono) — 3 freios ANTES de escrever qualquer coisa na base:
    // (1) a mesma porta não entra 2× na rota do dia;
    // (2) Cadastro sem nome de gente não passa (Direção passa, é só direção);
    // (3) endereço que já tem conta REUSA a conta — nada de linha nova.
    if (duplicado && paradaAbertaDaConta(duplicado.id)) {
      r.erro = `${nomeDaConta(duplicado)} já está na rota.`;
      render();
      return;
    }
    const vaiBatizar = !duplicado || contaEhStub(duplicado);
    const pedeNome = modo === "cadastro" && vaiBatizar;
    if (pedeNome && !nomeDeCadastroValido(nomeDigitado)) {
      r.erro = "Escreva o nome do cliente.";
      render();
      return;
    }
    r.salvando = true; r.erro = ""; render();
    showLoading("Adicionando parada…");
    try {
      const numero = onlyDigits(r.numero) || String(res.numero || "");
      const nome = nomeDigitado || [res.endereco, numero].filter(Boolean).join(", ") || "Parada rápida";
      let customerProfileId = duplicado ? String(duplicado.id) : "";
      if (duplicado && pedeNome) {
        // Stub de endereço vira CADASTRO de verdade: MESMA conta, agora com nome
        // e papel de cliente. Cadastro que já tem nome nunca é renomeado daqui —
        // quem edita ficha de cliente é a ficha.
        await H.api(`/nucleo/contas/${encodeURIComponent(duplicado.id)}`, { method: "PATCH", body: { nome, isCliente: true } });
      }
      if (!customerProfileId) {
        const body = {
          // 28/07 (dono) — DIREÇÃO não vira cliente: a conta existe só pra segurar
          // o endereço da parada (a entrega precisa de uma), mas fica FORA do
          // Cadastro (a lista de Clientes filtra isCliente; a rota não filtra).
          // Sem isto, cada parada rápida virava um "cliente" chamado
          // "Rua 14 JP, 1682" na base do dono.
          nome, tipo: "pf", isCliente: modo === "cadastro", isLead: false,
          endereco: res.endereco, numero, bairro: res.bairro, cidade: res.cidade, uf: res.uf,
          cep: onlyDigits(r.cep) || res.cep,
          // Só o TOQUE NO MAPA manda pino (o ponto tocado É a intenção do usuário);
          // CEP+número deixa o servidor resolver pela base CNEFE (fonte certa).
          ...(r.origem === "mapa" && validCoordinates(r.lat, r.lng) ? { lat: Number(r.lat), lng: Number(r.lng) } : {}),
        };
        Object.keys(body).forEach(k => { if (body[k] === undefined || body[k] === null || body[k] === "") delete body[k]; });
        const created = await H.api("/nucleo/contas", { method: "POST", body });
        customerProfileId = created && (created.contaId || created.customerProfileId || created.id);
      }
      if (!customerProfileId) throw new Error("Cliente criado sem identificador.");
      // 🔴 28/07 — `paraMinhaRota` faz a entrega NASCER com motorista. Sem ele
      // ela nascia órfã e o Iniciar respondia "Atribua as entregas a exatamente
      // um motorista" pro dia inteiro (era o bug das 2 paradas do dono).
      const delivery = await H.api("/logistica/entregas", { method: "POST", body: { customerProfileId, quantidade: 1, scheduledAt: operationalScheduledAt(), paraMinhaRota: true } });
      const contexto = r.contexto;
      const posicao = r.posicao || "perto";
      state.montagemRapida = null;
      // 28/07 (item 4) — vindo da tela Rota, a parada nova ENCAIXA na rota que
      // está rodando (ou fura a fila, se foi isso que pediram) e a tela volta pro
      // lugar de sempre; o caminho do Gerenciador segue reconferindo, como antes.
      if (contexto === "rota") {
        await closeOverlay("modal");
        // 28/07 (provado no g15) — a seleção do dia é filtro DURO em `items()`:
        // rota montada pelo chip nasce com `routeSelection`, e o id da parada
        // recém-criada não está nela. Sem somar o id aqui, `openItems()` não
        // enxerga a parada nova, `encaixarParadaNaRota` devolve `aplicado:false`
        // e ela fica NO DIA mas FORA da rota (rotaOrdem null) — o contador
        // seguia "1 de 1" e o toast caía no genérico. O caminho do Gerenciador
        // (logo abaixo) já fazia isso; o da tela Rota tinha ficado sem.
        const novoIdRota = delivery && delivery.id ? String(delivery.id) : null;
        const selecaoRota = activeRouteSelectionIds();
        if (selecaoRota && novoIdRota) setRouteSelection([...selecaoRota, novoIdRota]);
        await refresh(true);
        const encaixe = await encaixarParadaNaRota(novoIdRota, posicao);
        await refresh(true);
        toast(!encaixe.aplicado ? "Parada adicionada na rota."
          : encaixe.anterior ? `Entra depois de ${encaixe.anterior}.`
          : "Entra como primeira parada.");
        return;
      }
      await refresh(true);
      const rc = montagemConferencia();
      if (rc) {
        const novoId = delivery && delivery.id ? String(delivery.id) : null;
        const selection = activeRouteSelectionIds();
        // Seleção ativa sem o id novo deixaria a parada fora da conferência: com
        // o id, soma; sem ele, cai pro dia inteiro (que inclui a recém-criada).
        if (selection) { if (novoId) setRouteSelection([...selection, novoId]); else clearRouteSelection(); }
        await recarregarConferencia();
      }
      toast("Parada adicionada na rota.");
    } catch (error) { toast(humanApiError(error), true); }
    finally { hideLoading(); if (state.montagemRapida) state.montagemRapida.salvando = false; render(); }
  }
  async function montagemMapTap(point) {
    if (!montagemConferencia() || state.montagemRapida || state.dayStarting) return;
    if (!point || !validCoordinates(point.lat, point.lng)) return;
    state.montagemRapida = { origem: "mapa", cep: "", numero: "", nome: "", lat: point.lat, lng: point.lng, resolvido: { fonte: "mapa", endereco: "", bairro: "", cidade: "", uf: "", cep: "", numero: "", lat: point.lat, lng: point.lng }, buscando: true, checando: false, salvando: false, erro: "", duplicado: null };
    render();
    try {
      // Sugestão EDITÁVEL de endereço (geo/reverse, mesmo contrato da Leitura);
      // falhar em silêncio é ok — o pino tocado já basta pra parada existir.
      const rev = await H.api(`/logistica/geo/reverse?lat=${encodeURIComponent(point.lat)}&lng=${encodeURIComponent(point.lng)}`);
      const r = state.montagemRapida;
      if (r && r.origem === "mapa" && rev) {
        r.resolvido = { fonte: "mapa", endereco: rev.endereco || "", bairro: rev.bairro || "", cidade: rev.cidade || "", uf: rev.uf || "", cep: rev.cep || "", numero: rev.numero || "", lat: point.lat, lng: point.lng };
        if (rev.cep) r.cep = rev.cep;
        if (rev.numero) r.numero = rev.numero;
      }
    } catch (_) {}
    finally { const r = state.montagemRapida; if (r) r.buscando = false; render(); }
    // Toque no mapa que caiu num endereço com número também passa pelo freio de
    // duplicata (o reverse costuma trazer rua+número da porta tocada).
    if (state.montagemRapida && state.montagemRapida.origem === "mapa") await montagemRapidaChecarPorta();
  }
  // ══════════════════════════════════════════════════════════════════════════
  // 🔴 ITEM 1 (28/07, ordem do dono) — "Ao clicar no dia, ou em rotas salvas:
  // PRIMEIRO verificar se todos endereços estão certos; caso não, exibir na tela
  // os endereços com erro, deixando claro a parte do endereço com erro. Erro
  // resolvido? monta a rota e pede confirmação". Ajuste dele no mesmo dia: "ao
  // detectar erro, exibir APENAS os erros, e a opção remover todos os clientes e
  // o dia salvo deles — assim não volta na rota".
  // Nada aqui monta rota nem debita: é leitura + cura automática do backend.
  // ══════════════════════════════════════════════════════════════════════════
  function checagemDatasDosDias(dias) {
    return dias.map(dia => state.daySourceDates[dia] || dateForIsoDay(dia));
  }
  // true = pode montar. false = a tela de erros está de pé (ou o dono cancelou).
  async function checarEnderecosAntesDeMontar(dias) {
    const lista = [...new Set((dias || []).map(Number).filter(d => d >= 1 && d <= 7))].sort((a, b) => a - b);
    if (!lista.length) return true;
    const dates = checagemDatasDosDias(lista);
    showLoading("Conferindo os endereços…");
    try {
      const dados = await H.api("/logistica/rota/checar-enderecos", { method: "POST", body: { dias: lista, dates } });
      const problemas = (dados && Array.isArray(dados.problemas)) ? dados.problemas : [];
      if (!problemas.length) { state.checagem = null; return true; }
      state.checagem = { dias: lista, dates, dados, carregando: false, erro: null, removendo: false };
      render();
      return false;
    } catch (error) {
      // Ponte de transição: servidor sem o endpoint (app novo, backend velho) não
      // pode impedir o dono de montar a rota — segue o fluxo de antes.
      if (apiRouteUnavailable(error)) return true;
      toast(humanApiError(error), true);
      return false;
    } finally { hideLoading(); }
  }
  async function recarregarChecagem() {
    const c = state.checagem;
    if (!c || c.carregando) return;
    c.carregando = true; c.erro = null; render();
    try {
      const dados = await H.api("/logistica/rota/checar-enderecos", { method: "POST", body: { dias: c.dias, dates: c.dates } });
      c.dados = dados;
      if (!((dados && dados.problemas) || []).length) {
        // Zerou: o contrato do dono é montar na hora e cair no Gerenciador.
        state.checagem = null;
        state.daySelection = c.dias;
        render();
        toast("Endereços certos. Montando a rota…");
        void beginManagedRoute();
        return;
      }
    } catch (error) { c.erro = humanApiError(error); }
    finally { if (state.checagem) state.checagem.carregando = false; render(); }
  }
  // Endereço em LINHA com a parte quebrada marcada (Lei nº8: dado, nunca parágrafo).
  function checagemEnderecoHtml(item) {
    const campos = new Set((item.campos || []).map(c => c.campo));
    const e = item.endereco || {};
    const pedacos = [];
    const ruim = texto => `<b class="chk-ruim">${H.escape(texto)}</b>`;
    // Endereço legado vem COMPOSTO ("Rua 3a, 1354 - Jd. Ypê"): repetir número e
    // bairro depois dele escrevia a mesma coisa duas vezes na linha do dono.
    const semAcento = texto => String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const jaEscrito = trecho => !!trecho && semAcento(e.logradouro).includes(semAcento(trecho));
    if (e.logradouro) pedacos.push(campos.has("endereco") ? ruim(e.logradouro) : H.escape(e.logradouro));
    else pedacos.push(ruim("sem rua"));
    if (e.numero && !jaEscrito(e.numero)) pedacos.push(H.escape(e.numero));
    else if (!e.numero && campos.has("numero")) pedacos.push(ruim("sem número"));
    if (e.bairro && !jaEscrito(e.bairro)) pedacos.push(H.escape(e.bairro));
    if (campos.has("cep")) pedacos.push(ruim(e.cep ? `CEP ${e.cep} é de outra rua` : "sem CEP"));
    if (campos.has("localizacao") && !campos.has("numero") && !campos.has("endereco")) pedacos.push(ruim("não achei no mapa"));
    return pedacos.join(", ");
  }
  function checagemModal() {
    const c = state.checagem;
    if (!c) return "";
    const problemas = ((c.dados && c.dados.problemas) || []);
    const total = Number(c.dados && c.dados.total) || 0;
    const linhas = problemas.map(item => `<div class="row-card chk-linha"><button type="button" class="card-main card-main-btn" data-action="checagem-abrir" data-cliente-id="${H.escape(item.customerProfileId)}"><strong>${H.escape(item.nome || "Cliente")}</strong><span class="chk-endereco">${checagemEnderecoHtml(item)}</span></button><span class="chk-seta">${icon("chevronRight", 18)}</span></div>`).join("");
    const corpo = c.erro
      ? `<div class="hbx-aviso hbx-aviso--danger">${H.escape(c.erro)}</div>`
      : c.carregando && !problemas.length
        ? loading()
        : `<div class="list chk-lista">${linhas}</div>`;
    // 28/07 (correção do dono, no meio do teste): são DUAS opções, não uma.
    // "Remover da Rota" = só HOJE (o cliente continua com o dia salvo; volta na
    // semana que vem). "Remover do dia" = tira o dia do CADASTRO dele (não volta
    // sozinho nunca mais) — por isso esta pede confirmação e a outra não.
    const trava = c.removendo || c.carregando ? "disabled" : "";
    const extra = `<div class="center-modal-extra chk-acoes"><button class="btn btn-secondary btn-block" type="button" data-action="checagem-remover-rota" ${trava}>Tirar só da rota de hoje (${problemas.length})</button><button class="btn btn-danger btn-block" type="button" data-action="checagem-remover" ${trava}>${c.removendo ? "Removendo…" : `Remover este dia do cadastro (${problemas.length})`}</button></div>`;
    return centerModal({
      icon: "route",
      title: "Endereços com erro",
      resumo: `${problemas.length} de ${total} ${total === 1 ? "cliente" : "clientes"}`,
      body: corpo,
      extra,
      closeAction: "checagem-fechar",
      closeButtonAction: "checagem-fechar",
      backAction: "checagem-fechar",
      backLabel: "Fechar",
      backGlyph: "×",
      nextAction: "checagem-verificar",
      nextLabel: c.carregando ? "Conferindo…" : "Verificar de novo",
      nextDisabled: c.carregando || c.removendo,
    });
  }
  async function checagemRemoverTodos() {
    const c = state.checagem;
    if (!c || c.removendo) return;
    const problemas = ((c.dados && c.dados.problemas) || []);
    const ids = [...new Set(problemas.map(p => String(p.customerProfileId)).filter(Boolean))];
    if (!ids.length) return;
    c.removendo = true; render();
    showLoading("Tirando da rota…");
    try {
      await H.api("/logistica/rota/tirar-do-dia", { method: "POST", body: { dias: c.dias, customerProfileIds: ids } });
      toast(`${ids.length} ${ids.length === 1 ? "cliente saiu" : "clientes saíram"} do dia.`);
      c.removendo = false;
      await recarregarChecagem();
    } catch (error) {
      c.removendo = false;
      toast(humanApiError(error), true);
      render();
    } finally { hideLoading(); }
  }
  function montagemUnicaSheet() {
    const rc = montagemConferencia();
    // Ficha "Como resolver?" e a Rota rápida são PASSOS por cima da tela única
    // (mesma moldura central da conferência); Voltar cai de novo aqui.
    if (state.montagemRapida) return montagemRapidaModal();
    if (state.montagemSalvar) return montagemSalvarModal();
    const chipsHtml = montagemDiaChips();
    const chips = chipsHtml ? `<div class="montagem-dias">${chipsHtml}</div>` : "";
    const mapa = `<div id="route-plan-preview-map" class="montagem-map" aria-label="Mapa da rota em montagem"><span class="route-map-loading">Carregando mapa…</span></div>`;
    let corpo = ""; let footer = "";
    if (rc) {
      const pendentes = conferenciaVermelhasPendentes(rc);
      const rows = rc.data ? (rc.data.paradas || []).map((parada, index) => conferenciaParadaRow(parada, index, rc)).join("") : "";
      // 27/07 (ordem do dono) — havendo vermelho, o caminho é a correção EM MASSA
      // (mesmo botão da moldura standalone da conferência).
      const vermelhasMontagem = rc.data ? Number(rc.data.vermelhas) || 0 : 0;
      corpo = rc.error && !rc.data
        ? `<div class="hbx-aviso hbx-aviso--danger">${H.escape(rc.error)}</div><button class="btn btn-secondary btn-block" type="button" data-action="conferencia-tentar-de-novo">Tentar de novo</button>`
        : !rc.data
          ? loading()
          : `${custoPreviewBanner(rc)}<div class="list conferencia-lista">${rows || empty("Sem paradas", "")}</div>`;
      // 27/07 (dono) — mexeu na sequência com as setas ▲▼, aparece "Salvar rota":
      // a ordem que ele alinhou na mão vira rota-modelo (Rotas salvas) COM O NOME
      // QUE ELE ESCOLHER. Só aparece depois da 1ª troca (rc.ordemManual só existe
      // por toque humano em conferencia-mover) e é independente do Aceitar —
      // salvar não debita, não aceita, não fecha a montagem.
      const ordemEditada = !!(rc.ordemManual && rc.ordemManual.length);
      const salvarLinha = ordemEditada
        ? `<div class="montagem-salvar-linha"><button class="btn btn-secondary btn-block" type="button" data-action="montagem-salvar-rota" ${rc.loading || !rc.data ? "disabled" : ""}>Salvar rota</button></div>`
        : "";
      footer = `${salvarLinha}<div class="rp2-footer montagem-footer"><button class="btn btn-secondary" type="button" data-action="cancel-route">Cancelar rota</button><button class="btn btn-primary rp2-cta" data-action="conferencia-continuar" ${rc.loading || !rc.data ? "disabled" : ""}>${rc.loading ? "Atualizando…" : "Aceitar rota"}</button></div>`;
    } else {
      // 27/07 (dono, 2ª cobrança): NÃO existe tela de prévia — tocar no dia JÁ
      // monta (toggleManagedRouteDay chama beginManagedRoute na hora) e esta
      // mesma tela vira a rota montada. Antes de montar: "Rotas salvas",
      // "Registrar caminho" e a dica de tocar no dia.
      const modelos = state.routeModelos || [];
      const savedHint = state.routeModelosLoading ? "Carregando…" : (modelos.length ? `${modelos.length} rota${modelos.length === 1 ? "" : "s"} salva${modelos.length === 1 ? "" : "s"}` : "Nenhuma salva ainda");
      const salvasRow = `<button type="button" class="row-card rp2-mode-card montagem-salvas-row" data-action="day-entry-saved" ${state.routeModelosLoading ? "disabled" : ""}><span class="rp2-mode-icon rp2-mode-icon--saved rp2-saved-icon">${icon("star", 17)}</span><span class="card-main"><strong>Rotas salvas</strong><span>${H.escape(savedHint)}</span></span><span class="rp2-mode-chev">${icon("chevronRight", 18)}</span></button>`;
      // 27/07 (dono) — "Registrar caminho" mora AQUI, junto de "Rotas salvas":
      // as duas portas de rota ficam na mesma tela (saiu dos Ajustes).
      const leituraRow = `<button type="button" class="row-card rp2-mode-card montagem-salvas-row" data-action="day-entry-leitura" ${state.leituraStarting ? "disabled" : ""}><span class="rp2-mode-icon rp2-mode-icon--app rp2-saved-icon">${icon("gps", 16)}</span><span class="card-main"><strong>Iniciar gravação</strong></span><span class="rp2-mode-chev">${icon("chevronRight", 18)}</span></button>`;
      const semDia = !chipsHtml;
      corpo = `${salvasRow}${leituraRow}${state.dayStarting
        ? loading()
          : semDia
          ? empty("Nenhum dia com cliente", "Marque os dias de entrega no cadastro do cliente.")
          : ""}`;
      footer = "";
    }
    // R2 — o "+" da rota rápida só faz sentido com rota montada (a parada nasce
    // nova DENTRO da rota em conferência).
    const plus = rc ? `<button type="button" class="close montagem-plus" data-action="montagem-rapida" aria-label="Adicionar parada rápida">${icon("plus", 18)}</button>` : "";
    const closeControl = rc
      ? `<span class="montagem-descartar-unit"><button class="close montagem-descartar" type="button" data-action="close-modal" aria-label="Descartar montagem">${icon("close", 18)}</button><small>Descartar</small></span>`
      : `<button class="close" type="button" data-action="close-modal" aria-label="Fechar">${icon("close", 18)}</button>`;
    const backdropAction = rc ? "" : ` data-action="close-modal"`;
    // 27/07 (dono) — cabeçalho só com o NOME da tela, centralizado: o ícone, o
    // "Montar rota" e o resumo de paradas/km/previsão saíram. Os dois botões
    // (rota rápida e fechar) flutuam à direita sem tirar o título do meio.
    return `<div class="sheet-wrap route-plan-wrap montagem-wrap"${backdropAction}><section class="sheet route-plan-sheet rp2-sheet montagem-sheet"><div class="sheet-head montagem-head"><h2>Gerenciador de Rota</h2><div class="montagem-head-acoes">${plus}${closeControl}</div></div>${chips}${mapa}<div class="rp2-body montagem-body">${corpo}</div>${footer}</section></div>`;
  }
  // 27/07 (dono) — "Salvar rota" da montagem: mesma moldura/idioma do passo
  // "Nome da rota" da Leitura (padronizar é IGUALAR), com uma diferença pedida
  // no chat: aqui NÃO se sugere nome nenhum — quem escolhe é a pessoa.
  function montagemSalvarModal() {
    const s = state.montagemSalvar;
    const body = `<form id="montagem-salvar-form"><div class="field"><label>Nome da rota</label><input name="nome" maxlength="80" value="${H.escape(s.nome)}"></div><button class="btn btn-primary btn-block rp2-cta" type="submit" ${s.salvando ? "disabled" : ""}>${s.salvando ? "Salvando…" : "Salvar"}</button></form>`;
    return centerModal({
      icon: "route",
      title: "Nome da rota",
      resumo: "",
      body,
      closeAction: "montagem-salvar-fechar",
      closeButtonAction: "montagem-salvar-fechar",
      backAction: "montagem-salvar-fechar",
      backLabel: "Voltar",
      nextAction: "",
    });
  }
  // Paradas da rota conferida, NA ORDEM DA TELA, no contrato de rota-modelo
  // ({customerProfileId, localId?}). O id da parada é o da ENTREGA: a conta/porta
  // vem do payload da conferência quando o servidor manda, senão do item da rota
  // que já está carregado (app velho contra servidor novo e vice-versa).
  function montagemParadasParaSalvar(rc) {
    const itens = allRouteItems();
    return (rc && rc.data && rc.data.paradas || []).map(parada => {
      const item = itens.find(it => String(it.id) === String(parada.id));
      const customerProfileId = String(parada.customerProfileId || (item && (item.customerProfileId || item.cliente && item.cliente.id)) || "");
      const localId = String(parada.localId || (item && item.localId) || "");
      if (!customerProfileId) return null;
      // 27/07 — a rota salva aqui nascia SEM itens e o /gerar não tinha do que
      // materializar: toda parada virava "rota antiga sem itens" e acionar a
      // rota salva devolvia erro com rota vazia (dono, rota "Quarta"). O
      // servidor agora cai no plano da Agenda quando falta, mas mandar a
      // fotografia do que ESTA rota levava é mais fiel — e é o mesmo contrato
      // que o editor de rota-modelo já usa (padronizar é IGUALAR).
      const produtos = (item && Array.isArray(item.itens) ? item.itens : [])
        .map(it => ({
          productId: Number(it.produto && it.produto.id || it.produtoId || 0),
          qtd: Math.max(1, Number(it.qtdPrevista ?? it.qtd ?? 1)),
          valorUnit: Number(it.valorUnit || 0),
        }))
        .filter(it => Number.isInteger(it.productId) && it.productId > 0);
      return { customerProfileId, ...(localId ? { localId } : {}), ...(produtos.length ? { itens: produtos } : {}) };
    }).filter(Boolean);
  }
  async function montagemSalvarConfirmar() {
    const s = state.montagemSalvar;
    const rc = montagemConferencia();
    if (!s || s.salvando) return;
    const nome = String(s.nome || "").trim();
    if (!nome) { toast("Escreva um nome para a rota.", true); return; }
    const paradas = montagemParadasParaSalvar(rc);
    if (!paradas.length) { toast("Esta rota não tem parada para salvar.", true); return; }
    // Guard de reentrância (lei do som duplo, 25/07): marca + render ANTES do
    // primeiro await, solta no finally.
    s.salvando = true; render();
    showLoading("Salvando rota…");
    try {
      await H.api("/logistica/rota-modelos", { method: "POST", body: { nome, paradas } });
      await loadRouteModelos(true);
      state.montagemSalvar = null;
      toast("Rota salva. Ela está em Rotas salvas.");
    } catch (error) { toast(humanApiError(error), true); }
    finally { hideLoading(); if (state.montagemSalvar) state.montagemSalvar.salvando = false; render(); }
  }
  // 26/07 (dono, fusão final): o passo "Sequência" (Automática × Minha ordem) e a
  // tela de ordem manual PRÉ-geração MORRERAM — "Montar rota" gera direto e a única
  // tela de revisão é a Conferência de rota, onde a sequência é editável (setas).
  // "Rota salva": lista de rota-modelos; escolher pré-ordena a prévia (clientes
  // fora do modelo vão pro fim) e segue direto pro "Gerar agora".
  function dayOrderSavedModal() {
    // F1/F2 — rota salva é LISTA LIVRE: sem rótulo de dia, sem ordenar "hoje
    // primeiro" (todas iguais, por nome). Lixeira só pro admin (reusa a ação
    // delete-route-modelo). Container + 2 botões (button aninhado é inválido).
    const modelos = [...(state.routeModelos || [])].sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));
    const admin = isAdmin();
    // Excluir rota é SEGURAR PRESSIONADO — sem lixeira, igual ao resto do app.
    const rows = modelos.map(modelo => {
      const dia = weekDays.find(item => item.n === Number(modelo.diaSemana));
      const meta = [dia && dia.label, `${(modelo.paradas || []).length} ${(modelo.paradas || []).length === 1 ? "parada" : "paradas"}`].filter(Boolean).join(" · ");
      return `<div class="day-saved-row"><button type="button" class="row-card rp2-mode-card" data-action="apply-route-modelo" data-modelo-id="${H.escape(modelo.id)}" ${admin ? `data-route-modelo-hold="${H.escape(modelo.id)}"` : ""}><span class="rp2-mode-icon rp2-mode-icon--saved rp2-saved-icon">${icon("star", 17)}</span><span class="card-main"><strong>${H.escape(modelo.nome || "Rota")}</strong><span>${H.escape(meta)}</span></span><span class="rp2-mode-chev">${icon("chevronRight", 18)}</span></button>${admin ? `<button type="button" class="day-saved-edit" data-action="edit-route-modelo" data-modelo-id="${H.escape(modelo.id)}" aria-label="Editar rota">${icon("edit", 16)}</button>` : ""}</div>`;
    }).join("");
    return `<div class="modal-wrap day-home-wrap"><section class="modal day-home day-saved" role="dialog" aria-modal="true" aria-labelledby="day-saved-title"><div class="day-home-icon day-home-icon--saved">${icon("star", 24)}</div><h2 id="day-saved-title">Rotas salvas</h2><div class="list rp2-mode-list day-saved-list">${state.routeModelosLoading ? loading() : state.routeModelosError ? empty("Não foi possível carregar", state.routeModelosError) : rows || empty("Nenhuma rota salva", "")}</div><button class="btn btn-secondary btn-block" type="button" data-action="back-route-order">Voltar</button></section></div>`;
  }
  function clientScheduleLine(client) {
    const days = clientCardDays(client);
    const delivery = days.length ? `Entrega ${weekDays.filter(day => days.includes(day.n)).map(day => day.label).join("/")}` : "";
    const payment = client.formaPagamento === "mensal" && client.diaFechamento ? `Pagamento dia ${client.diaFechamento}` : "";
    return [delivery, payment].filter(Boolean).join(" · ");
  }
  function clientAddressKey(client) {
    if (!client || !String(client.endereco || "").trim()) return "";
    return [client.endereco, client.numero, client.cidade, client.uf]
      .map(value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\W/g, ""))
      .join("|");
  }
  function duplicateTextKey(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  }
  function duplicateReason(client, draft) {
    const document = onlyDigits(draft.document || draft.cpf || "");
    const clientDocument = onlyDigits(client.document || client.cnpj || "");
    if (document && clientDocument === document) return "CPF";
    const phone = onlyDigits(draft.phone || draft.telefone || "");
    const clientPhone = onlyDigits(client.phoneNormalized || client.phone || client.whatsapp || "");
    if (phone && clientPhone === phone) return "telefone";
    const endereco = duplicateTextKey(draft.endereco);
    const numero = duplicateTextKey(draft.numero);
    if (endereco && numero && duplicateTextKey(client.endereco) === endereco && duplicateTextKey(client.numero) === numero) return "endereço";
    const name = duplicateTextKey(draft.name || draft.nome);
    if (name && duplicateTextKey(client.name || client.nome) === name) return "nome";
    return "";
  }
  async function findDuplicateClient(draft) {
    const candidates = new Map((state.clients || []).filter(client => client && client.id).map(client => [String(client.id), client]));
    const queries = [draft.document || draft.cpf, draft.phone || draft.telefone, draft.name || draft.nome, draft.endereco]
      .map(value => String(value || "").trim())
      .filter((value, index, list) => value && list.indexOf(value) === index);
    if (netOnline()) {
      await Promise.all(queries.map(async query => {
        try {
          const result = await H.api(`/nucleo/clientes?page=1&pageSize=100&query=${encodeURIComponent(query)}`);
          (Array.isArray(result && result.items) ? result.items : []).forEach(client => { if (client && client.id) candidates.set(String(client.id), client); });
        } catch (_) {}
      }));
    }
    const matches = [...candidates.values()].map(client => ({ client, reason: duplicateReason(client, draft) })).filter(match => match.reason);
    const priority = { CPF: 0, telefone: 1, "endereço": 2, nome: 3 };
    matches.sort((a, b) => priority[a.reason] - priority[b.reason]);
    return matches[0] || null;
  }
  function showDuplicateClient(duplicate, type) {
    const client = duplicate && duplicate.client;
    if (!client) return;
    const name = client.name || client.nome || "Este cliente";
    const sameNameCanContinue = type === "duplicate-leitura-client" && duplicate.reason === "nome";
    state.confirmation = {
      type,
      title: sameNameCanContinue ? "Nome já cadastrado" : "Cliente já cadastrado",
      message: sameNameCanContinue ? `${name} já está cadastrado com o mesmo nome. Se for outra pessoa, você pode cadastrar mesmo assim.` : `${name} já está cadastrado com o mesmo ${duplicate.reason}. Use o cadastro existente para evitar duplicidade.`,
      cancelLabel: "Voltar",
      confirmLabel: type === "duplicate-leitura-client" ? "Usar cliente" : "Abrir cliente",
      icon: "users",
      ...(sameNameCanContinue ? { extraAction: "duplicate-leitura-continue", extraLabel: "Cadastrar outro com o mesmo nome", extraDanger: false } : {}),
      payload: { client, reason: duplicate.reason },
    };
    render();
  }
  function clientPendingKeys(client) {
    const pending = Array.isArray(client.pendencias) ? client.pendencias : [];
    const missing = [];
    // "Tel" pendente = sem número OU número sem DDD (incompleto, não discável).
    // Antes só checava existência → número sem DDD sumia SEM acender alerta.
    const anyPhone = client.phone || client.phoneNormalized || client.whatsapp;
    // A lista já traz o telefone operacional resolvido entre perfil e contato
    // principal. Se esse número atual está completo, não preserve uma pendência
    // `whatsapp` antiga devolvida pelo servidor.
    if (!anyPhone || !phoneComplete(anyPhone)) missing.push("Tel");
    if (pending.some(item => ["endereco", "numero", "gps"].includes(item))) missing.push("End");
    if (pending.includes("dia") || !(client.diasEntrega || []).length) missing.push("Dia");
    // 27/07 (ordem do dono) — "pagamento pendente" NÃO existe em cliente que nem
    // recebeu ainda: isso é dívida, e dívida não se inventa no cadastro. Forma de
    // pagamento vazia também não é pendência — o form já mostra "Na hora" marcado
    // (paymentFields: `draft.formaPagamento || "na_hora"`), então acender alerta era
    // cobrar um campo que não tem o que preencher. Sobra o ÚNICO caso com buraco de
    // verdade: mensal sem o dia de fechamento (sem ele não há o que fechar).
    if (configFlag("moduloFinanceiroAtivo") && client.formaPagamento === "mensal" && !client.diaFechamento) missing.push("Pag");
    // PR18072026 item 8 — confiar SÓ no backend (marca duplicataDe por nome OU
    // endereço+número). A checagem extra no app gerava falso-positivo grosseiro.
    if (client.duplicataDe) missing.push("Dup");
    return missing;
  }
  // S1 21/07 — decisão do dono: só End/Dia TRAVAM a entrega (card/avatar pintam
  // de vermelho); o resto (Tel, Dup, Pag) é informativo — chip neutro, nunca
  // pinta o card. `pendingIsBlocking` é a fonte única dessa regra.
  function pendingIsBlocking(key) { return key === "End" || key === "Dia"; }
  function pendingHasBlocking(list) { return (list || []).some(pendingIsBlocking); }
  function clientMissingLabels(client) {
    const missing = clientPendingKeys(client);
    const labels = { Tel: "Telefone", End: "Endereço", Dia: "Agenda", Pag: "Pagamento", Dup: "Duplicado" };
    return missing.length ? `<span class="client-missing">${missing.map(item => `<b${pendingIsBlocking(item) ? "" : ` class="is-neutral"`}>${H.escape(labels[item] || item)}</b>`).join(" ")}</span>` : "";
  }
  function enhancePaymentForms() {
    const newForm = app.querySelector("#new-client-form");
    const newFinancialFields = newForm && newForm.querySelector(".client-financial-fields");
    if (newFinancialFields) newFinancialFields.innerHTML = paymentFields(state.newClientDraft, "new");
    const clientForm = app.querySelector("#client-details-form");
    if (clientForm) {
      const clientFinancialFields = clientForm.querySelector(".client-financial-fields");
      if (clientFinancialFields) clientFinancialFields.innerHTML = paymentFields(state.clientPaymentDraft, "client");
      clientForm.querySelector(".client-primary-actions button[type=submit]").textContent = "Salvar cliente";
    }
    app.querySelectorAll(".lead-card[data-client]").forEach(card => {
      // insertAdjacentHTML NÃO é idempotente: com o nó sobrevivendo ao render
      // (mount() de 22/07), rodar de novo empilharia um <small> por render.
      if (card.__hbxScheduleLine) return;
      const client = clientById(card.dataset.client); const line = client && clientScheduleLine(client);
      if (!line) return;
      card.__hbxScheduleLine = true;
      card.querySelector(".client-balance")?.insertAdjacentHTML("afterend", `<small>${H.escape(line)}</small>`);
    });
  }
  function render() {
    // S2 21/07 (PR21072026-NAVEGAÇÃO) — sincroniza o watch da navegação a
    // CADA render (o pulso central do app, roda depois de qualquer ação que
    // possa mudar navModeActive()). Antes do early-return de moduleActive:
    // syncNavWatch já checa moduleActive por dentro e desliga o watch se for
    // o caso, então nenhuma chamada perdida de render() deixa watcher vivo.
    syncNavWatch();
    if (!moduleActive) return;
    const leituraAtivaNaRota = leituraRouteActive();
    document.documentElement.classList.toggle("leitura-route-active", leituraAtivaNaRota);
    document.body.classList.toggle("leitura-route-active", leituraAtivaNaRota);
    const focusedControl = focusedControlSnapshot();
    const modalScroll = app.querySelector(".modal")?.scrollTop || 0;
    const centerModalBodyScroll = app.querySelector(".center-modal-body")?.scrollTop || 0;
    const sheetScroll = app.querySelector(".sheet")?.scrollTop || 0;
    // PR18072026 L4-D — só descarta o mapa vivo quando este render NÃO vai
    // reexibi-lo; se vai (mesma tela), mountRouteMap reaproveita a instância
    // (applyRouteMarkers/applyRouteLine) em vez de destruir e recriar o
    // maplibre a cada render (piscada + peso, item 10).
    // R1 (27/07) — o mapa da MONTAGEM (tela única) divide o singleton do mapa da
    // Rota (mountMap troca de host sozinho); enquanto a montagem está aberta, o
    // mapa vive nela (#route-plan-preview-map — id que o transplante de overlay
    // do native.js já conhece) e a Rota por baixo fica sem mapa até fechar.
    const montagemMapaAberta = state.modal === "manage-day" && state.dayOrderStep !== "saved";
    const willShowRouteMap = state.screen === "route" && !montagemMapaAberta;
    // Item 8 (28/07) — sair da tela Rota ESTACIONA o mapa em vez de destruí-lo
    // (ver garagemDoMapa): voltar não recarrega tile nenhum.
    if (!willShowRouteMap && !montagemMapaAberta) estacionarRouteMap();
    // S3 21/07 — mesma regra pro mapa vivo da Leitura (host próprio, ver bloco
    // mountLeituraLiveMap acima): só descarta quando este render NÃO vai
    // reexibir a tela.
    const willShowLeituraLiveMap = state.modal === "leitura-ativa";
    if (!willShowLeituraLiveMap) disposeLeituraLiveMap();
    const screens = { route: routeScreen, clients: clientsScreen, products: productsScreen, settings: settingsScreen };
    H.mobileShell.mount(app, (screens[state.screen] || routeScreen)());
    enhancePaymentForms();
    enhanceMoneyInputs();
    enhanceKeyboardFields();
    enhanceAccessibility();
    syncChromeMetrics();
    stabilizeRouteMapLayout();
    syncHeaderChips();
    // O WebView de alguns aparelhos não entrega de forma confiável o toque
    // destes chips ao listener delegado do shell. O listener direto mantém a
    // montagem da rota operável sem duplicar o clique no listener global.
    // O guarda __hbxDayBound virou OBRIGATÓRIO em 22/07: o mount() agora pula a
    // troca do .content quando a marcação não mudou, então estes botões podem
    // ser os MESMOS nós do render anterior — sem o guarda, cada render pendura
    // mais um listener e o dia passa a ligar/desligar 2x, 3x no mesmo toque.
    app.querySelectorAll("[data-day]").forEach(button => {
      if (button.__hbxDayBound) return;
      button.__hbxDayBound = true;
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        void toggleManagedRouteDay(Number(button.dataset.day));
      });
    });
    const modal = app.querySelector(".modal");
    const centerModalBody = app.querySelector(".center-modal-body");
    const sheet = app.querySelector(".sheet");
    if (modal && modalScroll) modal.scrollTop = modalScroll;
    if (centerModalBody && centerModalBodyScroll) centerModalBody.scrollTop = centerModalBodyScroll;
    if (sheet && sheetScroll) sheet.scrollTop = sheetScroll;
    restoreFocusedControl(focusedControl);
    syncKeyboardViewport();
    setupClientsAutoLoad();
    if (montagemMapaAberta) void mountMap("route-plan-preview-map", montagemMapPoints(), false, { keepOrder: true, onTap: montagemMapTap });
    else if (willShowRouteMap) void mountRouteMap();
    if (willShowLeituraLiveMap) void mountLeituraLiveMap();
    H.revealActiveNav();
    H.mobileShell.setContext({ appName: "logistica", currentScreen: state.screen, navigate: navigateTo });
    state.openingOverlay = null;
  }

  function clientsAutoLoad() {
    if (state.clientsPage >= state.clientsTotalPages) return "";
    const status = state.clientsError ? "Não foi possível carregar o restante." : state.clientsLoading ? "Carregando…" : "";
    return `<div class="clients-auto-load" data-clients-auto-load aria-live="polite">${H.escape(status)}</div>`;
  }

  function setupClientsAutoLoad() {
    if (clientsLoadObserver) clientsLoadObserver.disconnect();
    clientsLoadObserver = null;
    const sentinel = app.querySelector("[data-clients-auto-load]");
    if (!sentinel || state.clientsError || !("IntersectionObserver" in window)) return;
    const scrollRoot = sentinel.closest(".center-modal-body");
    clientsLoadObserver = new IntersectionObserver(entries => {
      if (!moduleActive || !entries.some(entry => entry.isIntersecting)) return;
      void loadClients(false);
    }, { root: scrollRoot, rootMargin: "0px 0px 180px 0px" });
    clientsLoadObserver.observe(sentinel);
  }

  async function loadClients(reset, silent) {
    if (!reset && (state.clientsLoading || state.clientsPage >= state.clientsTotalPages)) return;
    const requestId = reset ? ++clientsRequestId : clientsRequestId;
    const page = reset ? 1 : state.clientsPage + 1;
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    const query = state.query.trim();
    if (query) params.set("query", query);
    state.clientsLoading = true;
    state.clientsError = null;
    if (reset) {
      state.clients = [];
      state.clientsPage = 0;
      state.clientsTotal = 0;
      state.clientsTotalPages = 1;
    }
    if (!silent) render();
    // F6 — só escurece com loading quando é a 1ª página (reset) e não-silencioso:
    // é o caso do "tela branca ao carregar muitos clientes" que o dono reportou.
    const overlayThisLoad = reset && !silent;
    if (overlayThisLoad) showLoading("Carregando clientes…");
    try {
      const result = await H.api(`/nucleo/clientes?${params.toString()}`);
      if (requestId !== clientsRequestId) return;
      // Defesa em profundidade: mesmo que o contrato do backend seja alterado,
      // a agenda/lead só aparece aqui depois de virar cliente explicitamente.
      const incoming = (Array.isArray(result && result.items) ? result.items : []).filter(client => client && client.isCliente === true);
      const byId = new Map((reset ? [] : state.clients).map(client => [String(client.id), client]));
      incoming.forEach(client => byId.set(String(client.id), client));
      state.clients = [...byId.values()];
      state.clientsPage = Number(result && result.page || page);
      state.clientsTotal = Number(result && result.total || state.clients.length);
      state.clientsTotalPages = Math.max(1, Number(result && result.totalPages || 1));
    } catch (error) {
      if (requestId === clientsRequestId) state.clientsError = humanApiError(error);
    } finally {
      if (overlayThisLoad) hideLoading();
      if (requestId === clientsRequestId) {
        state.clientsLoading = false;
        if (!silent) render();
      }
    }
  }

  // S1 25/07 (PR25072026-ROTA-CONFERIDA) — "Motor com crachá": o backend agora
  // sempre devolve `engine` ('osrm'|'haversine') no resultado de planejar/
  // iniciar (fim do fallback Haversine mudo). `result` pode vir NO NÍVEL
  // (rota/planejar, rota/iniciar, admin-route/start) ou aninhado em `.plan`
  // (admin-route/prepare) — os dois formatos são o MESMO PlanejarRotaResult do
  // backend, só a casca muda. Sem resultado válido, zera (ex.: erro de rede
  // não deixa crachá velho mentindo na tela).
  function applyRouteEngineState(result) {
    const plan = result && result.engine !== undefined ? result : (result && result.plan) || null;
    state.routeEngine = (plan && plan.engine) || null;
    state.routeDegradedReason = (plan && plan.degradedReason) || null;
    if (!["osrm", "haversine"].includes(state.routeEngine)) {
      state.routeEngine = null;
      state.routeDegradedReason = null;
      H.cache.remove("logistica-route-engine");
      return;
    }
    H.cache.set("logistica-route-engine", {
      date: String(plan.date || operationalDate()),
      routeId: result && result.routeId || state.route && state.route.routeId || null,
      engine: state.routeEngine,
      degradedReason: state.routeDegradedReason,
    });
    // R6 (27/07) — todo resultado novo re-arma (ou desarma) a auto-cura.
    syncAutoCuraMotor();
  }
  function routeEngineIdentity(route) {
    if (!route || !Array.isArray(route.items)) return null;
    const ids = route.items
      .filter(item => item && item.status !== "cancelada" && item.id)
      .map(item => `${String(item.id)}:${storedRouteOrder(item) ?? "-"}`)
      .sort();
    if (!ids.length) return null;
    return {
      date: String(route.date || operationalDate()),
      routeId: route.routeId || null,
      signature: ids.join("|"),
    };
  }
  function clearRouteEngineState() {
    state.routeEngine = null;
    state.routeDegradedReason = null;
    H.cache.remove("logistica-route-engine");
    syncAutoCuraMotor();
  }
  function restoreRouteEngineState(route) {
    const cached = H.cache.get("logistica-route-engine", null);
    const identity = routeEngineIdentity(route);
    if (!cached || !identity || cached.date !== identity.date
      || (cached.routeId && identity.routeId && cached.routeId !== identity.routeId)
      || (cached.signature && cached.signature !== identity.signature)) {
      clearRouteEngineState();
      return;
    }
    state.routeEngine = cached.engine || null;
    state.routeDegradedReason = cached.degradedReason || null;
    if (!state.routeEngine) {
      clearRouteEngineState();
      return;
    }
    H.cache.set("logistica-route-engine", {
      ...cached,
      routeId: identity.routeId || cached.routeId || null,
      signature: identity.signature,
    });
    // R6 (27/07) — rota restaurada degradada re-arma a auto-cura no boot.
    syncAutoCuraMotor();
  }
  // Selo discreto (osrm) ou faixa de alerta (haversine por FALHA). Rota pronta
  // sem motor identificável também recebe a faixa: é o caso legado de uma rota
  // calculada antes de o app persistir o resultado, e nunca pode ficar silencioso.
  // Ordem manual também é haversine, mas por ESCOLHA — o backend nunca manda
  // degradedReason nesse caso, e é essa ausência que mantém a faixa calada.
  // S2 25/07 (fix herdado do review da S1) — "coords_invalidas" (<2 paradas com
  // pino) é problema de DADO, não de REDE: a faixa "rede de rotas indisponível"
  // mentiria (a rede nem chegou a ser tentada). O estado "sem pino" já aparece
  // nos conectores da lista (routeLegConnector, abaixo) e no semáforo da S3 —
  // aqui fica CALADO só pra esse motivo; timeout/rate_limit/upstream (falha de
  // rede de verdade) continuam acendendo a faixa normalmente.
  // R6 (27/07, ordem do dono) — a FAIXA "Distâncias aproximadas em linha reta —
  // rede de rotas indisponível" MORREU: quem sinaliza é o chip Motor no topo
  // (verde/vermelho, ver motorDegradadoPorRede) e quem RESOLVE é a auto-cura
  // abaixo — rota que nasceu em linha reta por falha de rede re-planeja sozinha
  // pelas ruas quando o motor volta (retry com backoff, teto de tentativas).
  // Palavra do dono: "eu quero um app que funcione; em cima um Motor alegando
  // falha, assim se avermelhou eu já sei o que tá pegando".
  function syncAutoCuraMotor() {
    if (!motorDegradadoPorRede()) {
      motorCuraTentativas = 0;
      if (motorCuraTimer) { clearTimeout(motorCuraTimer); motorCuraTimer = null; }
      return;
    }
    if (motorCuraTimer || motorCuraTentativas >= 5) return;
    // 30s, 1min, 2min, 4min, 8min — disjuntor: nunca loop livre em cima de rede caída.
    const delayMs = 30000 * Math.pow(2, motorCuraTentativas);
    motorCuraTimer = setTimeout(() => { motorCuraTimer = null; void tentarCuraMotor(); }, delayMs);
  }
  async function tentarCuraMotor() {
    motorCuraTentativas += 1;
    if (!motorDegradadoPorRede()) { syncAutoCuraMotor(); return; }
    const rc = montagemConferencia();
    try {
      if (rc && !rc.loading && !rc.confirmada && !rc.cancelada) {
        // Conferência aberta: a reconferida já replaneja em dry-run — se o motor
        // voltou, a lista/km/ETA saem pelas ruas e o chip volta ao verde.
        await recarregarConferencia();
      } else if (routePlanned() && !routeActive() && !state.routePaused && !(activeRouteOrdemManual() || []).length) {
        // Rota planejada AUTOMÁTICA (sem ordem aceita pelo humano — essa nunca é
        // reordenada por conta própria): replaneja quieto com a mesma seleção.
        const selection = activeRouteSelectionIds();
        const body = { date: operationalDate(), ...(selection ? { deliveryIds: [...selection] } : {}) };
        const result = await H.api("/logistica/rota/planejar", { method: "POST", body });
        applyRouteEngineState(result);
        await refresh(true);
        if (!motorDegradadoPorRede()) toast("Rede de rotas voltou — rota recalculada pelas ruas.");
      }
    } catch (_) { /* rede ainda fora — o backoff cuida da próxima tentativa */ }
    finally { syncAutoCuraMotor(); }
  }

  // ==========================================================================
  // ROTA-CONFERIDA — S4 (25/07): tela de conferência (flag `rotaConferidaAtiva`,
  // ver configFlag/state.config). Flag OFF → `afterRoutaPlanejada` só chama
  // `toast(...)`, idêntico ao comportamento antigo (nenhum destes caminhos é
  // sequer chamado). Flag ON → depois de PLANEJAR (nunca de iniciar), troca o
  // toast seco pela tela de conferência (POST /logistica/rota/conferir,
  // dry-run — Lei nº3, nunca debita). Reusa: routeEngineBanner (S1),
  // routeLegConnector (S2), centerModal/.row-card/.order/.badge/.module-switch
  // (catálogo do APK) e o editor REAL de cliente (openClientEditor) pra
  // "Corrigir endereço"/"Usar meu GPS daqui" — zero formulário duplicado.
  // ==========================================================================
  // 26/07 (ordem do dono) — frases VISÍVEIS, só do que é IMPEDITIVO. O backend
  // manda `motivosVisiveis` já filtrado e ordenado por gravidade; o campo
  // `motivos` é auditoria interna e NUNCA é lido aqui. Código que não estiver
  // neste mapa não vira texto na tela (o backend pode ganhar motivo novo antes
  // de a tela ter uma frase de motorista pra ele — melhor calado que críptico).
  // Jargão proibido: nenhuma frase daqui pode falar de "pino"/coordenada.
  const CONFERENCIA_MOTIVO_FRASE = {
    cep_endereco_divergente: "CEP e endereço não batem",
    sem_pino: "Não sei onde fica este endereço",
    pino_compartilhado: "Endereço igual ao de outro cliente",
    diverge_gps_ouro: "Diferente de onde você já entregou",
    // Padronizar é IGUALAR: pro motorista os dois motivos de distância dizem a
    // mesma coisa, então dizem com a MESMA frase (o dedupe abaixo evita repetir
    // quando a parada acumula os dois).
    fora_do_casulo: "Muito longe das outras paradas",
    perna_outlier: "Muito longe das outras paradas",
  };
  function conferenciaMotivosTexto(parada) {
    const lista = Array.isArray(parada && parada.motivosVisiveis) ? parada.motivosVisiveis : [];
    const frases = [];
    lista.forEach(motivo => {
      const frase = CONFERENCIA_MOTIVO_FRASE[motivo];
      if (frase && frases.indexOf(frase) === -1) frases.push(frase);
    });
    return frases.join(" · ");
  }
  // Verde não ganha selo NENHUM (26/07): parada sem problema é só número, nome
  // e a distância do conector — repetir "Pronta"/"Aviso" em 10 linhas iguais
  // não informa nada. Só o impeditivo se anuncia.
  function conferenciaSemaforoInfo(semaforo) {
    return semaforo === "vermelho" ? { badgeClass: "danger", label: "Corrigir" } : null;
  }
  // Duas linhas, no formato escrito pelo dono. `comAviso` = paradas impeditivas
  // (backend antigo/ausente → conta os vermelhos aqui em vez de quebrar).
  function conferenciaResumoLinhas(data) {
    const total = Number(data.total) || 0;
    const comAvisoBruto = Number(data.comAviso);
    const comAviso = Number.isFinite(comAvisoBruto)
      ? comAvisoBruto
      : (data.paradas || []).filter(p => p.semaforo === "vermelho").length;
    const km = Math.round(Number(data.distanciaTotalKm) || 0);
    const fim = data.terminoPrevisto ? H.date(data.terminoPrevisto, { hour: "2-digit", minute: "2-digit" }) : "";
    return [
      `${total} ${total === 1 ? "parada" : "paradas"}, ${comAviso} com aviso${comAviso === 1 ? "" : "s"}.`,
      fim ? `Total ${km} km. Previsão de finalizar: ${fim}.` : `Total ${km} km.`,
    ];
  }
  // Vermelhas que AINDA exigem o toque de ciência (Lei nº7) — corrigidas ou
  // retiradas da rota somem daqui sozinhas no próximo recarregarConferencia().
  function conferenciaVermelhasPendentes(rc) {
    if (!rc || !rc.data) return [];
    return (rc.data.paradas || []).filter(p => p.semaforo === "vermelho" && !rc.acknowledged.has(String(p.id)));
  }
  function conferenciaParadaRow(parada, index, rc) {
    const info = conferenciaSemaforoInfo(parada.semaforo);
    const frase = conferenciaMotivosTexto(parada);
    // Mesmo componente da S2 (routeLegConnector) — selo curto "sem trajeto"
    // quando a parada não tem coordenada (o porquê já está na frase da própria
    // linha, repetir seria o mesmo texto duas vezes), "↓ N m · N min" quando
    // tem perna medida.
    const conector = routeLegConnector({ semCoordenada: !validCoordinates(parada.lat, parada.lng), semCoordenadaLabel: "sem trajeto", legDistanceM: parada.legDistanceM, legDurationS: parada.legDurationS });
    const id = String(parada.id);
    const acknowledged = rc.acknowledged.has(id);
    // Switch do catálogo (.module-switch, já usado em Ajustes/"salvar como
    // minha rota") direto no <span> — vira o próprio alvo clicável (role=switch)
    // pra não precisar de um botão-reset novo só pra caber neste cartão.
    // 🔴 ITEM 2 (28/07, ordem do dono) — o selo "Corrigir" e o liga/desliga de
    // ciência SAÍRAM do Gerenciador: com a checagem de endereços ANTES da montagem
    // (item 1), é impossível chegar aqui com cliente quebrado. O que sobra nesta
    // linha é ordem e sequência. `info`/`acknowledged` seguem calculados de graça
    // (custam nada) pra frase da linha continuar existindo quando o motor apontar
    // suspeita geométrica — mas nada BLOQUEIA o Aceitar aqui.
    const ack = "";
    const selo = "";
    // 26/07 (fusão) — a sequência edita AQUI: ▲▼ por linha, mesma mecânica da
    // antiga tela "Minha ordem" (que morreu), agora na única tela de revisão.
    const total = (rc.data && rc.data.paradas || []).length;
    const setas = `<span class="conferencia-reorder"><button type="button" class="conferencia-reorder-btn" data-action="conferencia-mover" data-dir="up" data-parada-id="${H.escape(id)}" aria-label="Mover para cima" ${index === 0 || rc.loading ? "disabled" : ""}>▲</button><button type="button" class="conferencia-reorder-btn" data-action="conferencia-mover" data-dir="down" data-parada-id="${H.escape(id)}" aria-label="Mover para baixo" ${index === total - 1 || rc.loading ? "disabled" : ""}>▼</button></span>`;
    return `${conector}<div class="row-card rp2-order-row conferencia-parada"><div class="order">${index + 1}</div><button type="button" class="card-main card-main-btn" data-action="conferencia-abrir-ficha" data-parada-id="${H.escape(id)}"><strong>${H.escape(parada.nome || "Cliente")}</strong>${frase ? `<span>${H.escape(frase)}</span>` : ""}</button>${setas}${selo}${ack}</div>`;
  }
  // S6 (25/07, PR25072026-ROTA-CONFERIDA) — linha do preview de créditos, POR
  // PAPEL (mesmo espírito do creditsLockOverlay/S7 APP-SOUNDS: o FATO é o
  // mesmo, o que muda é quanto dele aparece). ADMIN/USERMASTER vê o número
  // (isAdmin() == billing owner, LEI DO VENDEDOR já cobre o resto do app);
  // entregador comum só vê o aviso quando o saldo NÃO cobre — nunca vê saldo
  // nem custo. `rc.custo` null (endpoint indisponível ou flag OFF) = sem
  // linha nenhuma, aprovação segue normal (item 4 do S6, degrada mudo).
  function custoPreviewBanner(rc) {
    const custo = rc && rc.custo;
    if (!custo) return "";
    if (!isAdmin()) {
      if (custo.saldoCobre === false) {
        return `<div class="hbx-aviso hbx-aviso--danger">Créditos insuficientes para confirmar — avise o administrador.</div>`;
      }
      return "";
    }
    // 28/07 (dono, item 3) — a linha "Créditos atual / Aceitar Debitará" SAIU do
    // Gerenciador: o painel de créditos do dia já mora no topo da tela Rota e o
    // saldo não é decisão de montagem. Sobra só o que BLOQUEIA: saldo que não
    // cobre o Aceitar (sem isso o botão falharia com erro cru do backend).
    if (custo.saldoCobre === false) {
      return `<div class="hbx-aviso hbx-aviso--danger">Créditos insuficientes para confirmar.</div>`;
    }
    return "";
  }
  function conferenciaListaStep(rc) {
    const data = rc.data;
    // Estados sem lista: aqui não há rota conferida pra cancelar nem pra
    // iniciar, então a esquerda é só "Fechar" — e fechar é o que ela faz.
    if (!data && rc.loading) {
      return centerModal({ icon: "route", title: "Conferência de rota", body: loading(), closeAction: "close-modal", closeButtonAction: "close-modal", backAction: "close-modal", backLabel: "Fechar", backGlyph: "×", nextAction: "" });
    }
    if (!data && rc.error) {
      return centerModal({ icon: "route", title: "Conferência de rota", body: `<div class="hbx-aviso hbx-aviso--danger">${H.escape(rc.error)}</div>`, closeAction: "close-modal", closeButtonAction: "close-modal", backAction: "close-modal", backLabel: "Fechar", backGlyph: "×", nextAction: "conferencia-tentar-de-novo", nextLabel: "Tentar de novo" });
    }
    if (!data) return centerModal({ icon: "route", title: "Conferência de rota", body: empty("Nada para conferir", ""), closeAction: "close-modal", closeButtonAction: "close-modal", backAction: "close-modal", backLabel: "Fechar", backGlyph: "×", nextAction: "" });
    const pendentes = conferenciaVermelhasPendentes(rc);
    const rows = (data.paradas || []).map((parada, index) => conferenciaParadaRow(parada, index, rc)).join("");
    // 27/07 (ordem do dono) — havendo vermelho, o caminho é a correção EM MASSA:
    const vermelhas = Number(data.vermelhas) || 0;
    const body = `${custoPreviewBanner(rc)}<div class="list conferencia-lista">${rows || empty("Sem paradas", "")}</div>`;
    const resumo = conferenciaResumoLinhas(data).map(linha => `<span class="conferencia-resumo-linha">${H.escape(linha)}</span>`).join("");
    return centerModal({
      icon: "route",
      title: "Conferência de rota",
      resumo,
      body,
      closeAction: "close-modal",
      closeButtonAction: "close-modal",
      // 26/07 — o botão da esquerda MENTIA: era um "‹ Fechar" com cara de
      // voltar, mas quando esta tela abre a rota JÁ FOI GERADA — não havia pra
      // onde voltar. Agora ele faz o que diz: "cancel-route" (a MESMA
      // confirmação da tela Rota) desfaz só o PLANEJAMENTO — as entregas
      // abertas voltam pra pendência, Agenda e financeiro não mudam (ver
      // POST /logistica/rota/encerrar). O caminho destrutivo de verdade
      // ("Limpar hoje e cancelar as abertas") continua onde sempre esteve:
      // botão extra DENTRO daquela confirmação, com segunda confirmação.
      // Fechar sem cancelar nada continua no × do canto e no toque no fundo.
      backAction: "cancel-route",
      backLabel: "Cancelar rota",
      backGlyph: "×",
      // Lei nº7 (dono, 25/07): vermelho NUNCA bloqueia a saída — o botão só
      // fica desabilitado enquanto sobrar vermelha sem o toque individual de
      // ciência (nunca "ignorar todas" — o desabilitado cai sozinho a cada
      // toque no switch da linha). 26/07: o rótulo parou de acusar o motorista
      // ("Continuar mesmo assim") e passou a dizer exatamente o que o botão
      // faz — CONFIRMAR a conferência (é o confirmar que cobra, ver a linha de
      // créditos acima). Ele NÃO é o Play: confirmar devolve a tela Rota com a
      // rota montada, e o Play de lá é que inicia.
      nextAction: "conferencia-continuar",
      // R1 (27/07) — a palavra do roteiro do dono é ACEITAR (é o aceitar que
      // debita; o Play depois não cobra de novo). Mesmo rótulo da tela única.
      nextLabel: rc.loading ? "Atualizando…" : "Aceitar rota",
      // Item 2 (28/07) — só o carregamento segura o botão; vermelho não chega aqui.
      nextDisabled: rc.loading,
    });
  }
  // 27/07 (dono) — a ficha intermediária "Como resolver?" foi REMOVIDA: o toque
  // na parada abre direto o editor real do cliente (abrirFichaComEditor). Não
  // recriar passo entre a lista e o cadastro.
  function rotaConferenciaModal() {
    const rc = state.rotaConferencia;
    if (!rc) return "";
    return conferenciaListaStep(rc);
  }
  // S6 (25/07, PR25072026-ROTA-CONFERIDA) — preview de créditos: GET 100%
  // leitura (Lei nº3, nunca debita) com a MESMA data/seleção do conferir.
  // Best-effort de propósito (doc S6, item 4): endpoint fora do ar NUNCA
  // trava a aprovação — só a linha de créditos some da tela (degrada mudo).
  async function recarregarCustoPreview(date, deliveryIds) {
    const rc = state.rotaConferencia;
    if (!rc) return;
    if (!configFlag("rotaConferidaAtiva")) { rc.custo = null; return; }
    try {
      const params = new URLSearchParams();
      if (date) params.set("date", date);
      if (deliveryIds && deliveryIds.length) params.set("deliveryIds", deliveryIds.join(","));
      const qs = params.toString();
      rc.custo = await H.api(`/logistica/rota/custo-preview${qs ? `?${qs}` : ""}`);
    } catch (_) {
      rc.custo = null;
    }
  }
  // Chama /logistica/rota/conferir (dry-run — Lei nº3) com a MESMA seleção de
  // deliveryIds que o planejar usou. S5 25/07 — fecha o furo da S4: agora manda
  // também a ordem manual ATIVA (ver ConferirRotaDto/LogisticaConferenciaService),
  // pra uma rota com ordem manual ativa ser reconferida na ordem que o
  // entregador vai RODAR de verdade, não na ordem que o motor escolheria.
  async function recarregarConferencia() {
    const rc = state.rotaConferencia;
    if (!rc) return;
    rc.loading = true; rc.error = null; render();
    try {
      const position = await currentPosition();
      const body = { date: operationalDate() };
      // Guarda a origem desta conferência — se o operador aprovar (conferencia-
      // continuar), ela vira a origem "aprovada" pro drift-check do Iniciar
      // (ver origemAprovadaDistanciaM, ~startRoute).
      if (position) { body.origemLat = position.lat; body.origemLng = position.lng; rc.origem = { lat: position.lat, lng: position.lng }; }
      const selection = activeRouteSelectionIds();
      if (selection) body.deliveryIds = [...selection];
      // 26/07 — a sequência é editável DENTRO da conferência: a ordem tocada
      // nas setas (rc.ordemManual) vence a ordem manual persistida.
      const manualOrder = (rc.ordemManual && rc.ordemManual.length) ? rc.ordemManual : activeRouteOrdemManual();
      if (manualOrder && manualOrder.length) body.ordemManual = manualOrder;
      const antes = new Map((rc.data && rc.data.paradas || []).map((p, i) => [String(p.id), i + 1]));
      // Preview roda em PARALELO (Lei nº2 "zero lentidão artificial") e nunca
      // deixa a própria falha vazar pro catch do conferir — ver função acima.
      const custoPromise = recarregarCustoPreview(body.date, body.deliveryIds);
      const result = await H.api("/logistica/rota/conferir", { method: "POST", body });
      await custoPromise;
      applyRouteEngineState(result);
      rc.data = result;
      // "Fulano passou da parada 3 para a 8" — só quando ALGUÉM pediu foco
      // (voltou de corrigir/GPS numa parada específica); nunca compara a lista
      // inteira sozinha (ruído a cada refresh automático).
      if (rc.focusParadaId) {
        const id = String(rc.focusParadaId);
        const depoisIndex = (result.paradas || []).findIndex(p => String(p.id) === id);
        const antesPos = antes.get(id);
        if (depoisIndex !== -1 && antesPos && antesPos !== depoisIndex + 1) {
          const nome = result.paradas[depoisIndex].nome || "A parada";
          toast(`${nome} passou da parada ${antesPos} para a ${depoisIndex + 1}.`);
        }
        rc.focusParadaId = null;
      }
      // Só as vermelhas ATUAIS seguem exigindo o toque — quem corrigiu ou saiu
      // da rota não carrega mais o "ciente" pendurado pra sempre.
      const vermelhasAtuais = new Set((result.paradas || []).filter(p => p.semaforo === "vermelho").map(p => String(p.id)));
      rc.acknowledged = new Set([...rc.acknowledged].filter(id => vermelhasAtuais.has(id)));
    } catch (error) {
      rc.error = humanApiError(error);
    } finally {
      rc.loading = false; render();
    }
  }
  async function abrirRotaConferencia() {
    // `origem` (S5) é preenchida por recarregarConferencia a cada chamada —
    // começa null aqui só pra documentar o formato do objeto. `custo` (S6) é
    // o preview de créditos (null = ainda não chegou ou indisponível, ver
    // recarregarCustoPreview — degrada mudo, nunca trava a tela).
    // R1 (27/07) — `host`: com a tela única de montagem aberta (manage-day), a
    // conferência RENDERIZA DENTRO dela (chips + mapa + lista + Aceitar), não
    // num cartão separado; o cartão central segue existindo pra qualquer caminho
    // que chegue aqui sem a montagem aberta.
    const host = state.modal === "manage-day" ? "montagem" : "standalone";
    // Item 7 — rota do dia JÁ aceita reabre como confirmada: sair (Voltar, ×, fundo)
    // não desfaz o que já foi pago. Desfazer segue no botão "Cancelar rota".
    state.rotaConferencia = { data: null, loading: true, error: null, step: "lista", ficha: null, acknowledged: new Set(), focusParadaId: null, retornoParadaId: null, origem: null, custo: null, ordemManual: null, confirmada: rotaAceitaHoje(), cancelada: false, host };
    if (host === "montagem") render(); else showModal("rota-conferencia");
    await recarregarConferencia();
  }
  // 26/07 — o desfazer do abandono: MESMO caminho seguro do "Cancelar?"
  // (rota/encerrar devolve as abertas pra pendência; NUNCA limpar-dia).
  async function desfazerRotaMontada() {
    if (state.desfazendoRota) return;
    state.desfazendoRota = true;
    try { await performEncerrarRota("Rota desfeita antes da confirmação.", { descartar: true, mensagemToast: "Rota desfeita." }); }
    finally { state.desfazendoRota = false; }
  }
  // Ponto único chamado depois de TODO caminho que só PLANEJA (nunca inicia) —
  // ver startRoute(planOnly) e o ramo dayMode==="plan" de beginManagedRoute.
  async function afterRoutaPlanejada(toastMessage) {
    // Operador fechou a Agenda com a geração em voo: a rota que acabou de
    // aterrissar já nasceu abandonada — desfaz em vez de abrir a conferência.
    if (state.montagemAbandonada) { state.montagemAbandonada = false; await desfazerRotaMontada(); return; }
    // Flag OFF = contrato antigo (toast seco, sem conferência): a montagem fecha
    // aqui mesmo — sem rc, o closeOverlay não desfaz nada (rota planejada fica).
    if (!configFlag("rotaConferidaAtiva")) { if (state.modal === "manage-day") await closeOverlay("modal"); toast(toastMessage); return; }
    await abrirRotaConferencia();
  }
  // Chamado pelo closeOverlay ao fechar o editor de cliente aberto pelo toque
  // na parada (conferencia-abrir-ficha → abrirFichaComEditor; guard
  // `voltaParaConferencia` dentro de closeOverlay). Volta pra LISTA e
  // reconfere — salvou ou só cancelou, tanto faz: o cache OSRM de 10min torna
  // a rechecada barata.
  async function reabrirConferenciaAposEdicao() {
    const rc = state.rotaConferencia;
    if (!rc) return;
    rc.step = "lista";
    rc.ficha = null;
    rc.focusParadaId = rc.retornoParadaId;
    rc.retornoParadaId = null;
    // R1 (27/07) — volta pro MESMO hospedeiro de onde a ficha saiu (tela única
    // de montagem ou o cartão central antigo).
    state.modal = rc.host === "montagem" ? "manage-day" : "rota-conferencia";
    await recarregarConferencia();
  }
  // "Corrigir endereço" e "Usar meu GPS daqui" abrem o MESMO editor real
  // (openClientEditor) — nunca duplicam o PATCH de local-vs-perfil que já
  // resolve corretamente qual dos dois (local ou perfil) é a fonte multilocal
  // vigente. capturarGps=true só PRÉ-PREENCHE o pino (lat/lng/geoFonte) antes
  // do operador ver o formulário; ele ainda decide "Salvar cliente".
  async function abrirFichaComEditor(capturarGps) {
    const rc = state.rotaConferencia; const ficha = rc && rc.ficha;
    const client = ficha && ficha.item && ficha.item.cliente;
    if (!client || !client.id) { toast("Cliente não encontrado nesta parada.", true); return; }
    rc.retornoParadaId = String(ficha.paradaId);
    const detailLoaded = openClientEditor(client);
    if (capturarGps) {
      // openClientEditor devolve a promise de loadClientDetail — espera ela
      // preencher clientPaymentDraft (perfil+local reais) ANTES de gravar o
      // GPS; sem isso a resposta em voo sobrescreveria o pino capturado.
      if (detailLoaded) await detailLoaded;
      await capturarGpsParaEdicaoCliente();
    }
  }
  // SÓ o pino muda (geoFonte:'gps_cadastro') — nunca o texto do endereço
  // (diferente de useCurrentLocationForNewClient, que reverse-geocodifica pra
  // PREENCHER um cadastro em branco; aqui o endereço já existe e pode estar
  // certo, só o pino estava errado). Reusa currentPosition() — a esta altura
  // da sessão o GPS já foi concedido pelo fluxo de planejar/iniciar a rota.
  async function capturarGpsParaEdicaoCliente() {
    setClientCepStatus("Lendo localização…");
    const position = await currentPosition();
    if (!position) { setClientCepStatus("Não foi possível obter a localização."); return; }
    Object.assign(state.clientPaymentDraft, {
      lat: position.lat, lng: position.lng, geoFonte: "gps_cadastro",
      ...(Number.isFinite(position.accuracy) ? { gpsAccuracy: position.accuracy } : {}),
    });
    setClientCepStatus("Localização atual capturada. Toque em Salvar cliente para confirmar.");
  }

  async function refresh(silent, boot) {
    state.refreshing = true; if (!silent && !state.route) state.loading = true; render();
    // R8 (27/07) — painel de créditos do dia (fire-and-forget, throttle interno).
    void loadCreditosDia(false);
    const routePath = isAdmin() ? "/logistica/admin-route/route" : "/logistica/rota";
    const productsPath = isAdmin() ? "/products" : "/logistica/produtos";
    const requests = [H.api(`${routePath}?date=${encodeURIComponent(operationalDate())}`), H.api(productsPath), H.api("/logistica/config")];
    const bootTotal = requests.length + (state.screen === "clients" ? 1 : 0);
    if (boot) H.boot.begin("logistica", bootTotal);
    const tracked = boot ? requests.map(request => Promise.resolve(request).finally(() => H.boot.step("logistica"))) : requests;
    const results = await Promise.allSettled(tracked);
    // Aplica produtos/config ANTES de tratar a rota: no primeiro login a rota pode
    // falhar, mas o config precisa entrar mesmo assim — isAdmin() depende dele, e
    // sem ele a retry escolheria a rota errada e repetiria o mesmo erro pra sempre.
    if (results[1].status === "fulfilled") { state.products = normalizeCatalogProducts(results[1].value); H.cache.set("logistica-products", state.products); }
    if (results[2].status === "fulfilled") { state.config = results[2].value; H.cache.set("logistica-config", state.config); }
    if (results[0].status === "fulfilled") {
      state.route = results[0].value;
      H.cache.set("logistica-route", state.route);
      // Item 8 — o cache carrega o DIA junto (ver rotaEmCache): sem isso a rota de
      // ontem reaparecia no boot de hoje e sumia quando a de hoje chegava.
      H.cache.set("logistica-route-dia", operationalDate());
      restoreRouteEngineState(state.route);
      state.error = null;
      state.routeBootRetries = 0;
    }
    // L4-F: saldo do admin em segundo plano — alimenta a trava "créditos esgotados"
    // (dirigindo termina o dia; falha de rede nunca tranca). Não bloqueia o boot.
    if (isAdmin()) void refreshCreditsLock();
    else {
      // 28/07 (dono) — motorista não deriva mais trava de créditos de nada:
      // a chamada sobrevive só pra limpar lock residual de versão anterior.
      applyDriverCreditsLock();
      state.error = humanApiError(results[0].reason);
      // Primeiro login: a sessão nativa pode não estar pronta quando o boot já
      // dispara — em vez de mostrar "Rota indisponível" e obrigar o motorista a
      // apertar Atualizar, mantém o "carregando" e tenta sozinho algumas vezes.
      if (!state.route && (state.routeBootRetries || 0) < 5) {
        state.routeBootRetries = (state.routeBootRetries || 0) + 1;
        state.loading = true; state.refreshing = false; render();
        if (boot) H.boot.ready("logistica");
        setTimeout(() => refresh(true), 1200);
        return;
      }
    }
    if (state.screen === "clients") {
      await loadClients(true, true);
      if (boot) H.boot.step("logistica");
    }
    state.loading = false; state.refreshing = false; render();
    // RE-ARMAR o GPS nativo depois de recarregar os dados — não é início de
    // rota, então vai sem a flag e SEM som (ver activateNativeRoute).
    if (routeActive()) activateNativeRoute();
    if (boot) H.boot.ready("logistica");
  }
  function activateNativeRoute(startResult, inicioReal) {
    const route = startResult || state.route || {}; const open = openItems();
    // GPS não pode anunciar 25 clientes simultaneamente quando vários endereços
    // estão no mesmo raio. Ele acompanha somente a próxima parada geolocalizada;
    // após confirmar/pular, o refresh arma a seguinte.
    const next = open.find(item => validCoordinates(item.cliente && item.cliente.lat, item.cliente && item.cliente.lng));
    const stops = next ? [{ id: next.id, nome: next.cliente.nome || "Cliente", lat: Number(next.cliente.lat), lng: Number(next.cliente.lng) }] : [];
    if (inicioReal) H.sound("route_start");
    if (!stops.length) return;
    // S4 22/07 (PR22072026-APP-SOUNDS) — esta função é o gate único de "a rota
    // REALMENTE começou a rodar": todo caminho que inicia rota de verdade
    // (startRoute não-planOnly, startPlannedRoute, beginManagedRoute) só chama
    // activateNativeRoute depois do H.api de iniciar ter respondido OK — nunca
    // no clique do botão (montar/planejar sozinho não passa por aqui, ver
    // startRoute com planOnly=true no fluxo de "aplicar rota salva"). Um único
    // ponto cobre os três fluxos sem duplicar H.sound em cada um.
    //
    // 22/07 — SOM TOCAVA 2x. O raciocínio acima esqueceu que esta função NÃO é
    // só o portão de "a rota começou": ela é também a rotina de RE-ARMAR o GPS
    // nativo, chamada no fim de todo refresh() com rota ativa (ver o
    // `if (routeActive()) activateNativeRoute()` lá em cima). E os três fluxos
    // de início fazem exatamente `activateNativeRoute(...)` e logo em seguida
    // `await refresh(true)` — ou seja, sempre dois toques: o início e o
    // re-armar. Iniciar e Continuar rota cantavam duas vezes, toda vez.
    // Agora o som é OPT-IN: quem realmente está iniciando pede (inicioReal),
    // o re-armar fica calado. Silêncio é o default de propósito — um caminho
    // novo que esqueça a flag fica mudo, que é o erro barato; o caro é este
    // aqui, cantar onde não devia.
    H.activateRoute({ raioM: Number(state.config && state.config.raioChegadaM || 60), paradas: stops, routeId: route.routeId || state.route.routeId || null, mode: route.trackingRequired || state.route.trackingRequired ? "TRACKED" : "ESSENTIAL", trackingSessionId: route.trackingSessionId || state.route.trackingSessionId || null });
  }
  // S1 21/07 — todo fluxo que já chamava currentPosition() (iniciar rota, dia,
  // etc.) agora também alimenta lastKnownPosition e tenta um patch AO VIVO (sem
  // render()) da linha 2 do painel "Próxima parada", se ele estiver na tela —
  // padrão gpsStatus/nextStop count (querySelector, não re-render).
  function currentPosition() { return new Promise(resolve => { if (!navigator.geolocation) return resolve(null); navigator.geolocation.getCurrentPosition(p => { markGpsFix(); const point = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }; lastKnownPosition = point; updateNextStopPanelDistance(); resolve(point); }, err => { markGpsError(err); resolve(null); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }); }); }
  function distanceMeters(a, b) { const r = 6371000; const lat = Math.PI / 180; const dLat = (b.lat - a.lat) * lat; const dLng = (b.lng - a.lng) * lat; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * lat) * Math.cos(b.lat * lat) * Math.sin(dLng / 2) ** 2; return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); }
  // Formato padrão "lrt-distance" já usado em clientCatalogCard/leituraPausaOverlay.
  function formatRouteDistance(meters) { return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`; }
  // Patch por querySelector (sem render()) da linha 2 do painel "Próxima parada" —
  // só mexe no textContent se o painel já estiver montado na tela Rota; nunca cria
  // o painel sozinho (isso é papel do routeScreen/render normal).
  function updateNextStopPanelDistance() {
    const sub = app.querySelector(".route-next-panel-sub");
    if (!sub) return;
    if (state.screen !== "route" || leituraRouteActive()) return;
    const next = openItems()[0];
    if (!next) return;
    // S3/S5 21/07 — mesma regra do routeNextStopPanel: viária em nav mode
    // (ou instrução do step à frente), reta de fallback (esta função é o
    // patch AO VIVO da mesma linha 2 do painel — sem re-render).
    sub.textContent = routeNextStopSubText(next);
  }
  // S2 21/07 (PR21072026-NAVEGAÇÃO) — watch da navegação normal (rota já em
  // execução, sem app externo). Mesmas options de currentPosition() (spec S2
  // #2, item "Posição ao vivo"). Cada fix normaliza pro mesmo shape de ponto
  // da Leitura ({lat,lng,accuracyM,speedMps,bearingDeg}), alimenta
  // state.navPosicao + empurra em state.navTrilha (filtro ~8m de distância
  // mínima, teto 2000 pontos — descarta do início, mesmo padrão do nativo da
  // Leitura) e reaproveita updateNextStopPanelDistance()/updateRouteReadingMap
  // pra atualizar painel e mapa sem esperar o próximo render() completo.
  function startNavWatch() {
    if (navWatchId != null || !navigator.geolocation) return;
    navWatchSeq += 1;
    navWatchId = navigator.geolocation.watchPosition(position => {
      markGpsFix();
      const coords = position.coords || {};
      const point = {
        lat: coords.latitude, lng: coords.longitude,
        accuracyM: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
        speedMps: Number.isFinite(coords.speed) ? coords.speed : null,
        bearingDeg: Number.isFinite(coords.heading) ? coords.heading : null,
      };
      if (!validCoordinates(point.lat, point.lng)) return;
      state.navPosicao = point;
      lastKnownPosition = { lat: point.lat, lng: point.lng, accuracy: point.accuracyM };
      const trail = state.navTrilha || [];
      const last = trail[trail.length - 1];
      const movedEnough = !last || distanceMeters({ lat: last[0], lng: last[1] }, point) >= 8;
      if (movedEnough) {
        const nextTrail = [...trail, [point.lat, point.lng]];
        state.navTrilha = nextTrail.length > 2000 ? nextTrail.slice(nextTrail.length - 2000) : nextTrail;
      }
      if (routeMap && routeMapHost) updateRouteReadingMap(routeMapHost, routeMap, { moveCamera: true });
      // S3 21/07 — desenha as pernas assim que o 1º fix chega (sem esperar um
      // render() completo); depois disso só redesenha por gatilho real (perna
      // avançou, parada nova ou saiu do caminho — applyNavLegRoute/
      // checkNavOffPath cuidam disso), nunca a cada tick de GPS.
      if (!state.navRota) {
        if (routeMap && routeMapHost) {
          void applyNavLegRoute(routeMapHost, routeMap);
        } else {
          // Voz não depende do MapLibre ter terminado de montar. Se o primeiro
          // fix chegar antes do mapa, busca os steps diretamente; o disjuntor
          // compartilhado impede uma segunda requisição concorrente no mount.
          const stops = navRouteOpenPoints();
          if (stops.length && navRecalcAllowed()) {
            markNavRecalc();
            void recomputeNavRoute(stops);
          }
        }
      }
      checkNavOffPath(point);
      // S5 21/07 — processa voz/step ANTES do patch do painel (senão o banner
      // ficaria 1 tick atrasado do avanço de step feito aqui).
      processNavVoice(point);
      updateNextStopPanelDistance();
    }, err => { markGpsError(err); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 });
  }
  function stopNavWatch() {
    if (navWatchId == null) return;
    try { navigator.geolocation.clearWatch(navWatchId); } catch (_) {}
    navWatchId = null;
  }
  // 28/07 (dono, item 6) — watch do mapa PARADO. Irmão pobre do startNavWatch:
  // sem alta precisão, sem trilha, sem voz — só o suficiente pro ponto azul e pro
  // endereço aparecerem quando não há rota rodando (prova de que o GPS está vivo).
  function startIdleWatch() {
    if (idleWatchId != null || !navigator.geolocation) return;
    idleWatchId = navigator.geolocation.watchPosition(position => {
      markGpsFix();
      const coords = position.coords || {};
      const point = { lat: coords.latitude, lng: coords.longitude, accuracyM: Number.isFinite(coords.accuracy) ? coords.accuracy : null };
      if (!validCoordinates(point.lat, point.lng)) return;
      state.idlePosicao = point;
      lastKnownPosition = { lat: point.lat, lng: point.lng, accuracy: point.accuracyM };
      if (routeMap && routeMapHost) updateRouteReadingMap(routeMapHost, routeMap);
      void resolverEnderecoOcioso(point);
    }, err => { markGpsError(err); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 30000 });
  }
  function stopIdleWatch() {
    if (idleWatchId == null) return;
    try { navigator.geolocation.clearWatch(idleWatchId); } catch (_) {}
    idleWatchId = null;
  }
  // Reverse geocode com FREIO (mesma lei do disjuntor): 1 chamada em voo, e só
  // pede de novo quando andou >150 m ou passou de 10 min. Falhou? fica o "Estou
  // aqui" com a precisão — o ponto no mapa já é a prova que o dono pediu.
  async function resolverEnderecoOcioso(point, agora) {
    if (idleEnderecoBuscando || !netOnline()) return;
    const atual = state.idleEndereco;
    // `agora` = o dedo pediu (balão aberto): o freio de distância/tempo não vale,
    // mas o "1 em voo por vez" vale sempre.
    if (!agora && atual && distanceMeters({ lat: atual.lat, lng: atual.lng }, point) < 150 && Date.now() - atual.at < 600000) return;
    idleEnderecoBuscando = true;
    try {
      const rev = await H.api(`/logistica/geo/reverse?lat=${encodeURIComponent(point.lat)}&lng=${encodeURIComponent(point.lng)}`);
      const texto = [[rev && rev.endereco, rev && rev.numero].filter(Boolean).join(", "), rev && rev.bairro].filter(Boolean).join(" - ");
      state.idleEnderecoDetalhe = rev ? { endereco: rev.endereco || "", bairro: rev.bairro || "", cidade: rev.cidade || "", uf: rev.uf || "" } : null;
      if (texto) {
        state.idleEndereco = { texto, lat: point.lat, lng: point.lng, at: Date.now() };
        if (routeMap && routeMapHost) updateRouteReadingMap(routeMapHost, routeMap);
      }
      atualizarBalaoLocal();
    } catch (_) { /* endereço é enfeite do ponto; sem rede, o ponto basta */ }
    finally { idleEnderecoBuscando = false; }
  }
  function syncIdleWatch() {
    if (moduleActive && state.screen === "route" && !state.modal && !routeLiveMode()) startIdleWatch(); else stopIdleWatch();
  }
  // Chamado no topo de todo render() (o pulso central do app — roda depois de
  // qualquer ação que possa mudar navModeActive()). Start/stop são idempotentes
  // (guard por navWatchId), então nunca vaza watcher nem duplica: pausar,
  // encerrar, "Limpar o dia" e logout derrubam navModeActive() e o PRÓXIMO
  // render desliga sozinho — logout também para explícito (não espera
  // render), ver "accept-confirmation".
  function syncNavWatch() {
    if (moduleActive && navModeActive()) startNavWatch(); else stopNavWatch();
    syncIdleWatch();
  }
  // ==========================================================================
  // ROTA-CONFERIDA — S5 (25/07): "aprovar congela". A ordem aprovada em
  // abrirRotaConferencia/conferencia-continuar já viaja pro Iniciar de graça
  // (activeRouteOrdemManual — reusa o mecanismo de "Minha ordem"/"Rota salva"
  // da Onda 3 de 18/07). Falta só o caso em que o motorista se afastou MUITO de
  // onde aprovou: Lei nº6 é sobre a ORDEM ("a rota iniciada é a aprovada"),
  // isto aqui é sobre "essa origem ainda faz sentido?" — nunca decide sozinho,
  // sempre pergunta (popup no molde de state.confirmation, igual "finish-route").
  // ==========================================================================
  // Consumido 1x por "Manter sequência aprovada" (mesmo espírito do
  // state.distanceOverrideDeliveryId em confirmDelivery) — sem isto, o próprio
  // resume do popup perguntaria de novo ao re-executar a mesma função.
  let rotaOrigemAprovadaOverride = false;
  function origemAprovadaDistanciaM(position) {
    if (rotaOrigemAprovadaOverride) return null;
    if (!configFlag("rotaConferidaAtiva")) return null;
    const manualOrder = activeRouteOrdemManual();
    const origem = activeRouteOrdemManualOrigem();
    if (!manualOrder || !manualOrder.length || !origem || !position) return null;
    const dist = distanceMeters(origem, position);
    return dist > 1000 ? dist : null;
  }
  // Devolve true quando INTERROMPEU o fluxo de iniciar (o chamador deve
  // `return` na hora — a decisão do motorista chega depois, via accept-
  // confirmation/"rota-origem-recalcular"). `resume` é o bastante pra
  // re-executar o MESMO caminho do zero quando ele escolher "Manter".
  function avisarDriftOrigemAprovada(position, resume) {
    const distM = origemAprovadaDistanciaM(position);
    if (distM == null) return false;
    state.confirmation = {
      type: "rota-origem-divergente",
      title: "Longe do ponto de partida",
      message: `Você está a ${formatRouteDistance(distM)} de onde a rota foi conferida e aprovada. Manter a sequência aprovada ou recalcular?`,
      confirmLabel: "Manter sequência aprovada",
      extraAction: "rota-origem-recalcular",
      extraLabel: "Recalcular rota",
      extraDanger: false,
      icon: "route",
      payload: resume,
    };
    render();
    return true;
  }
  async function startRoute(planOnly, generateToday, deliveryIds) {
    try {
      state.routePaused = false; H.cache.remove("logistica-route-paused");
      if (generateToday !== false) await H.api("/logistica/gerar-dia", { method: "POST", body: { date: operationalDate() } });
      const selectedIds = Array.isArray(deliveryIds) ? deliveryIds : activeRouteSelectionIds() ? [...activeRouteSelectionIds()] : [];
      const position = await currentPosition(); const body = position ? { date: operationalDate(), origemLat: position.lat, origemLng: position.lng } : { date: operationalDate() };
      if (selectedIds.length) body.deliveryIds = selectedIds;
      // PR18072026 Onda 3 — "Minha ordem"/"Rota salva": reaplica o ordemManual
      // ativo tanto no planejar quanto no iniciar (o iniciar acontece numa ação
      // separada, depois — sem isso a ordem manual se perderia no NN+2-opt).
      const manualOrder = activeRouteOrdemManual();
      if (manualOrder && manualOrder.length) body.ordemManual = manualOrder;
      // S5 25/07 — drift de origem só entra pro Iniciar de VERDADE; planOnly
      // sempre recalcula do zero com o GPS atual, nada congelado ainda pra
      // divergir.
      if (!planOnly && avisarDriftOrigemAprovada(position, { fn: "start-route", generateToday, deliveryIds })) return;
      const result = await H.api(planOnly ? "/logistica/rota/planejar" : "/logistica/rota/iniciar", { method: "POST", body });
      applyRouteEngineState(result);
      if (!planOnly) activateNativeRoute(result, true);
      await refresh(true);
      // S4 25/07 (PR25072026-ROTA-CONFERIDA) — só o PLANEJAR troca o toast pela
      // tela de conferência (flag rotaConferidaAtiva); iniciar segue idêntico.
      if (planOnly) await afterRoutaPlanejada("Rota recalculada.");
      else toast("Rota iniciada.", false, { mudo: true });
      // S2 21/07 (PR21072026-NAVEGAÇÃO) — fim do troca-troca: NÃO abre mais
      // Waze/Maps. Fica na tela Rota; navModeActive() vira true sozinho (rota
      // ativa, não pausada, sem Leitura) e o render() acima (dentro do
      // refresh) já liga o watch/mapa via syncNavWatch/updateRouteReadingMap.
    } catch (error) { if (!routeUnavailableFromError(error)) toast(humanApiError(error), true); }
  }
  function pauseRouteOnDevice() {
    clearInterval(nextStopTimer);
    state.nextStop = null;
    state.selected = null;
    state.deliveryDraft = null;
    state.deliveryArrived = false;
    state.routePaused = true;
    H.cache.set("logistica-route-paused", true);
    // S5 21/07 — navModeActive() já vira false com routePaused=true (nenhum
    // H.speak novo dispara), mas uma fala em curso continuaria até o fim: o
    // spec é claro (voz NUNCA com rota pausada), corta na hora.
    H.speakStop();
    H.stopRoute();
  }
  async function resumeRouteOnDevice() {
    // 25/07 — mesmo guard que beginManagedRoute/startPlannedRoute já usam: sem
    // ele, o botão "Continuar rota" (route-transmux, ~L3748, já lê dayStarting
    // pro `disabled`) ficava clicável durante o GPS+rede do startRoute e um
    // segundo toque disparava "Rota iniciada." 2x.
    if (state.dayStarting) return;
    state.dayStarting = true; render();
    try { await startRoute(false, false); }
    finally { state.dayStarting = false; render(); }
  }
  async function startPlannedRoute() {
    if (!routePlanned() || state.dayStarting) return;
    if (!isAdmin()) { await startRoute(false, false); return; }
    state.dayStarting = true; render();
    // 22/07 — mesmo buraco do beginManagedRoute: iniciar uma rota já planejada
    // faz GPS + admin-route/start + refresh sem véu nenhum.
    showLoading("Iniciando a rota…");
    try {
      const position = await currentPosition();
      const body = { operationalDate: operationalDate() };
      if (position) { body.origemLat = position.lat; body.origemLng = position.lng; }
      // PR18072026 Onda 3 — admin-route/start não conhece ordemManual (contrato
      // fica só em rota/planejar|iniciar). Com ordem manual ativa, chama o
      // iniciar direto: mesmo ator, resolve o único motorista já atribuído no
      // prepare (resolveSingleDriver) e mantém a MESMA ordem definida.
      const manualOrder = activeRouteOrdemManual();
      // S5 25/07 — mesma trava de startRoute: ordem aprovada + GPS afastado
      // > 1km de onde ela foi conferida pergunta antes de seguir.
      if (avisarDriftOrigemAprovada(position, { fn: "start-planned-route" })) return;
      const started = manualOrder && manualOrder.length
        ? await H.api("/logistica/rota/iniciar", { method: "POST", body: { date: operationalDate(), ordemManual: manualOrder, ...(position ? { origemLat: position.lat, origemLng: position.lng } : {}) } })
        : await H.api("/logistica/admin-route/start", { method: "POST", body });
      applyRouteEngineState(started);
      state.routePaused = false;
      H.cache.remove("logistica-route-paused");
      activateNativeRoute(started, true);
      await refresh(true);
      toast("Rota iniciada.", false, { mudo: true });
      // S2 21/07 — idem startRoute: fica na tela Rota, navModeActive() liga
      // o watch/mapa sozinho (ver comentário em startRoute).
    } catch (error) { if (!routeUnavailableFromError(error)) toast(humanApiError(error), true); }
    finally { hideLoading(); state.dayStarting = false; }
  }
  // "Remover da Rota" da tela de erros (28/07): tira do que ESTA montagem leva,
  // sem tocar no cadastro. Devolve a lista de entregas que sobram (null = nada a
  // excluir). Some sozinho quando a rota é desfeita/aceita.
  function aplicarExcluidosDaRota() {
    const excluidos = new Set((state.rotaExcluidos || []).map(String));
    if (!excluidos.size) return null;
    const sobram = allRouteItems()
      .filter(item => item.status !== "cancelada")
      .filter(item => {
        const cliente = item.cliente || {};
        const id = String(item.customerProfileId || cliente.id || "");
        return !excluidos.has(id);
      })
      .map(item => String(item.id));
    return sobram;
  }
  async function beginManagedRoute() {
    if (!state.daySelection.length || state.dayStarting) return;
    state.dayStarting = true; render();
    // 22/07 — este caminho (Play › Agenda › Sequência automática/Minha ordem)
    // era o ÚNICO sem véu: só desabilitava o botão e ficava mudo por
    // vários segundos (gerar-dia + prepare + refresh + planejar + OSRM), então
    // a tela parecia travar/piscar e pulava seca pra Rota. O overlay já existia
    // e só estava ligado em Rotas Salvas. Mesmo par showLoading/hideLoading:
    // hide vai no finally porque o try tem vários `return` no meio.
    showLoading("Montando a rota…");
    try {
      // A sequência semanal é salva antes de materializar o dia. Se a Agenda
      // rejeitar a escrita, nada novo é gerado com uma ordem que não persistiu.
      if (state.dayOrderMode === "manual" && agendaOrderCanPersist()) await saveManualRouteModeloIfNeeded();
      if (isAdmin()) {
        const today = operationalDate();
        const sourceDates = state.daySelection.map(day => state.daySourceDates[day] || dateForIsoDay(day));
        const position = await currentPosition();
        const adjustments = await H.api(`/logistica/admin-route/adjustments?date=${encodeURIComponent(today)}`);
        const pendingDeliveryIds = (Array.isArray(adjustments && adjustments.pending) ? adjustments.pending : [])
          .filter(item => sourceDates.includes(String(item && item.sourceDate || "")))
          .map(item => String(item && item.id || ""))
          .filter(Boolean);
        const body = { operationalDate: today, sourceDates, pendingDeliveryIds };
        if (position) { body.origemLat = position.lat; body.origemLng = position.lng; }
        const prepared = await H.api("/logistica/admin-route/prepare", { method: "POST", body });
        applyRouteEngineState(prepared);
        state.routePaused = false;
        H.cache.remove("logistica-route-paused");
        clearRouteSelection();
        // PR18072026 Onda 3 — "Minha ordem"/"Rota salva": admin-route/prepare já
        // fez o planejamento automático; se o usuário escolheu ordem manual,
        // sobrepõe agora chamando rota/planejar direto (aceita ordemManual —
        // admin-route não aceita). refresh ANTES pra allRouteItems() enxergar as
        // entregas recém-materializadas e traduzir cliente→deliveryId. IMPORTANTE:
        // esse endpoint (chamado como admin) NÃO resolve motorista sozinho como o
        // iniciar faz — por isso deliveryIds vem EXPLÍCITO (só o que o prepare já
        // atribuiu a este admin/motorista), pra nunca reordenar rota de outro
        // motorista numa empresa com mais de um.
        const preparedIds = [...new Set((prepared && prepared.plan && prepared.plan.paradas || []).map(p => String(p.id)))];
        let ordemManual = null;
        if (preparedIds.length && state.dayOrderMode !== "app" && state.dayManualOrder.length) {
          await refresh(true);
          const preparedSet = new Set(preparedIds);
          ordemManual = manualOrderDeliveryIds(allRouteItems()).filter(id => preparedSet.has(id));
        }
        if (ordemManual && ordemManual.length) {
          const manualPlan = await H.api("/logistica/rota/planejar", { method: "POST", body: { date: today, deliveryIds: preparedIds, ordemManual, ...(position ? { origemLat: position.lat, origemLng: position.lng } : {}) } });
          applyRouteEngineState(manualPlan);
          setRouteOrdemManual(ordemManual);
        } else clearRouteOrdemManual();
        await saveManualRouteModeloIfNeeded();
        if (state.dayMode === "plan") {
          // R1 (27/07) — a montagem NÃO fecha mais: a conferência renderiza na
          // MESMA tela (chips + mapa + lista + Aceitar). Os dias que acabaram de
          // montar viram "Adicionado ✓" nos chips.
          await refresh(true);
          setDiasAdicionados(state.daySelection);
          // Item 1 (28/07) — "Remover da Rota" vale AQUI: a seleção passa a ser só
          // quem sobrou (o Aceitar cobra pelo que está selecionado).
          const sobramAdmin = aplicarExcluidosDaRota();
          if (sobramAdmin) setRouteSelection(sobramAdmin);
          // S4 25/07 (PR25072026-ROTA-CONFERIDA) — mesmo ponto único de startRoute.
          await afterRoutaPlanejada("Rota planejada.");
          return;
        }
        await closeOverlay("modal");
        // dayMode "start" (sem botão hoje, mantido por completude): mesma troca
        // acima — ordem manual pula admin-route/start e vai direto no iniciar.
        // S5 25/07 — generaliza pro mesmo mecanismo de startRoute/
        // startPlannedRoute: `ordemManual` local acima já foi persistido via
        // setRouteOrdemManual/clearRouteOrdemManual (linhas acima), então
        // activeRouteOrdemManual() aqui é o MESMO valor — só compartilha a
        // fonte com o drift-check (avisarDriftOrigemAprovada).
        const ordemAprovada = activeRouteOrdemManual();
        if (avisarDriftOrigemAprovada(position, { fn: "begin-managed-route" })) return;
        const started = ordemAprovada && ordemAprovada.length
          ? await H.api("/logistica/rota/iniciar", { method: "POST", body: { date: today, deliveryIds: preparedIds, ordemManual: ordemAprovada, ...(position ? { origemLat: position.lat, origemLng: position.lng } : {}) } })
          : await H.api("/logistica/admin-route/start", { method: "POST", body: { operationalDate: today, ...(position ? { origemLat: position.lat, origemLng: position.lng } : {}) } });
        applyRouteEngineState(started);
        activateNativeRoute(started, true);
        await refresh(true);
        toast("Rota iniciada.", false, { mudo: true });
        // S2 21/07 — idem startRoute: fica na tela Rota, navModeActive() liga
        // o watch/mapa sozinho (ver comentário em startRoute).
        return;
      }
      const generatedDays = await Promise.all(state.daySelection.map(day => H.api("/logistica/gerar-dia", { method: "POST", body: { date: state.daySourceDates[day] || dateForIsoDay(day) } })));
      await refresh(true);
      const deliveryIds = [...new Set(generatedDays.flatMap(day => Array.isArray(day && day.deliveryIds) ? day.deliveryIds.map(String) : []))];
      if (!deliveryIds.length) deliveryIds.push(...selectedPreviewDeliveryIds());
      if (!deliveryIds.length) throw new Error("Não encontrei as entregas dos dias selecionados. Atualize e tente novamente.");
      // PR18072026 Onda 3 — mesma tradução cliente→deliveryId acima, já com
      // allRouteItems() atualizado pelo refresh(true) logo depois do gerar-dia.
      const manualOrder = state.dayOrderMode !== "app" && state.dayManualOrder.length ? manualOrderDeliveryIds(allRouteItems()) : null;
      if (manualOrder && manualOrder.length) setRouteOrdemManual(manualOrder); else clearRouteOrdemManual();
      await saveManualRouteModeloIfNeeded();
      // Item 1 (28/07) — a seleção já nasce sem quem o dono removeu da rota de hoje.
      const excluidosHoje = new Set((state.rotaExcluidos || []).map(String));
      const idsCliente = new Map(allRouteItems().map(item => [String(item.id), String(item.customerProfileId || (item.cliente || {}).id || "")]));
      setRouteSelection(excluidosHoje.size ? deliveryIds.filter(id => !excluidosHoje.has(idsCliente.get(String(id)) || "")) : deliveryIds);
      // R1 (27/07) — mesmo contrato do ramo admin acima: planejar fica NA tela
      // única (a conferência renderiza nela); só o iniciar de verdade fecha.
      if (state.dayMode === "plan") setDiasAdicionados(state.daySelection);
      else await closeOverlay("modal");
      await startRoute(state.dayMode === "plan", false, deliveryIds);
    } catch (error) { if (!routeUnavailableFromError(error)) { render(); toast(humanApiError(error), true); } }
    finally { hideLoading(); state.dayStarting = false; }
  }
  async function confirmDelivery(item, options) {
    // 25/07 — mesmo padrão de accept-confirmation: guarda contra o segundo
    // toque (Pago/Entregue/confirm-stop/etc chamam todos esta função) enquanto
    // a primeira chamada ainda espera GPS+rede. Reset no finally cobre TODO
    // caminho de saída (sucesso, erro e os `return` do meio, ex.: aviso de
    // distância) — sem isso o botão da tela de aviso ficaria preso desabilitado.
    if (state.deliveryConfirming) return;
    state.deliveryConfirming = true; render();
    const opts = options || {};
    try {
      const requirements = state.route && state.route.comprovante || {};
      const proof = item.comprovante || {};
      if (requirements.fotoObrigatoria && !proof.fotoId) throw new Error("Anexe a foto obrigatória antes de confirmar.");
      const position = await currentPosition();
      const client = item.cliente || {}; const limit = Math.max(Number(state.config && state.config.raioChegadaM || 60) * 2, 120);
      if (position && Number(position.accuracy || 0) <= limit && validCoordinates(client.lat, client.lng)) {
        const distance = distanceMeters(position, { lat: Number(client.lat), lng: Number(client.lng) });
        if (distance > limit && state.distanceOverrideDeliveryId !== item.id) { state.distanceWarning = { itemId: item.id, distance, clientName: client.nome || "este cliente", options: opts }; showModal("distance-warning"); return; }
      }
      // EDIÇÃO de entrega já concluída (guia Entregue → Editar, 22/07): reabre
      // ANTES de reconfirmar. Sem isso o backend trata como reconfirmação e ignora
      // itens/preço novos — e a idempotencyKey velha devolveria o desfecho antigo,
      // por isso ela também é descartada aqui.
      if (item.status === "entregue" && state.deliveryEditingId === item.id) {
        await H.api(`/logistica/entregas/${encodeURIComponent(item.id)}/reabrir`, { method: "POST", body: {} });
        H.cache.remove(`delivery-confirm:${item.id}`);
        item.status = "agendada";
      }
      const keyName = `delivery-confirm:${item.id}`; let key = H.cache.get(keyName, null); if (!key) { key = H.uuid(); H.cache.set(keyName, key); }
      const draft = deliveryDraftFor(item);
      // `valorUnit` só viaja quando o entregador REALMENTE editou o preço na tela
      // (o campo é opcional no backend; ausente = preço que já estava no item).
      const body = { idempotencyKey: key, itens: draft.items.filter(x => !x.novo).map(x => ({ id: x.id, qtdEntregue: Number(x.qtd || 0), ...(x.valorUnit !== undefined && x.valorUnit !== null ? { valorUnit: Number(x.valorUnit) } : {}) })) };
      const novosItens = draft.items.filter(x => x.novo && x.qtd > 0 && x.productId != null).map(x => ({ productId: Number(x.productId), qtdEntregue: Number(x.qtd), ...(x.valorUnit !== undefined && x.valorUnit !== null ? { valorUnit: Number(x.valorUnit) } : {}) }));
      if (novosItens.length) body.novosItens = novosItens;
      if (opts.receiptMethod) body.receiptMethod = opts.receiptMethod;
      if (opts.quitarAberto) body.quitarAberto = true;
      if (proof.fotoId) body.comprovanteFotoId = proof.fotoId;
      if (proof.assinaturaId) body.comprovanteAssinaturaId = proof.assinaturaId;
      if (requirements.codigoObrigatorio) {
        const code = prompt("Digite o código de 6 dígitos do comprovante:");
        if (!code) return;
        body.comprovanteCodigo = code.trim();
      }
      if (position) Object.assign(body, position);
      // Regra de ouro do S3: som toca no FATO (aqui, depois do await abaixo),
      // nunca no clique que chamou confirmDelivery — se a chamada falhar, cai
      // no catch e só o "error" do gate central de toast() toca.
      const confirmResult = await H.api(`/logistica/entregas/${encodeURIComponent(item.id)}/confirmar`, { method: "POST", body });
      state.deliveryEditingId = null;
      H.cache.remove(keyName); await closeOverlay("sheet"); await refresh(true);
      // S3 22/07 — o nativo (OperationalStore.interceptMutation) pode ter
      // respondido 202 LOCAL, sem chegar no servidor ainda (rota preparada
      // offline); nesse caso o corpo vem com offline:true/pendingSync:true.
      // "Confirmei" é fato dos dois jeitos (o item já muda de status na tela),
      // mas o SOM tem que dizer qual dos dois: offline_saved avisa "salvei
      // aqui, ainda não mandei" — tocar delivery_complete nesse caso ensinaria
      // o motorista a confiar numa sincronia que ainda não aconteceu.
      H.sound(confirmResult && confirmResult.offline ? "offline_saved" : "delivery_complete");
      H.vibrate(12);
      toast("Entrega confirmada.", false, { mudo: true });
      const next = openItems()[0];
      if (next) showNextStop(next); else pauseRouteOnDevice();
    } catch (error) { toast(humanApiError(error), true); }
    finally { state.deliveryConfirming = false; render(); }
  }
  async function removeStopForToday(item, reason, message) {
    if (!item || !item.id || item.status === "entregue" || item.status === "cancelada") return;
    const name = item.cliente && item.cliente.nome || "este cliente";
    state.confirmation = { type: "remove-route-stop", itemId: item.id, reason: reason || "Retirado da rota pelo operador.", title: "Retirar da rota de hoje?", message: message || `${name} sai somente da rota de hoje. O cliente e a recorrência continuam cadastrados.`, confirmLabel: "Retirar", danger: true, icon: "route" };
    render();
  }
  async function performRemoveStopForToday(item, reason) {
    if (!item || !item.id || item.status === "entregue" || item.status === "cancelada") return;
    try {
      await H.api(`/logistica/entregas/${encodeURIComponent(item.id)}/cancelar`, { method: "POST", body: { motivo: reason || "Retirado da rota pelo operador." } });
      state.selected = null;
      await refresh(true);
      toast("Entrega retirada somente da rota de hoje.");
    } catch (error) { toast(humanApiError(error), true); }
  }
  async function performEncerrarRota(motivo, options) {
    // Substitui o loop antigo (cancelava entrega por entrega — cancelamento
    // parcial se a rede caísse no meio). Uma chamada só, transacional no
    // backend. Em erro, NÃO mexe em nenhum estado local: o backend é atômico,
    // então "meio encerrado" não existe — ou some tudo, ou nada muda aqui.
    // options.playSound: encerramento REAL (finish-route) toca route_stop;
    // cancelar planejamento (cancel-route) não. options.saveRoute: encerra E
    // salva a ordem de hoje na MESMA ação (fim do segundo popup). Snapshot
    // ANTES da chamada porque depois do encerrar os itens voltam pra "agendada"
    // e perdem a ordem real (entregues por conclusão + abertas por rotaOrdem).
    // 27/07 — options.descartar: a saída de quem NÃO ACEITOU (fechar a montagem,
    // "Cancelar rota"). Vai no endpoint que DESFAZ a ocorrência — sem ele o
    // toque num chip de dia consumia o dia do cliente (a `proximaData` pulava a
    // semana) mesmo sem confirmar nada. Encerrar de verdade (fim da rota na rua)
    // continua no /encerrar: lá a visita ACONTECEU, a ocorrência não volta.
    const opts = options || {};
    const snapshot = opts.saveRoute ? items() : null;
    try {
      const body = { date: operationalDate(), motivo: motivo || "Rota encerrada." };
      // Ponte de transição: app novo pode chegar antes do servidor. 404/405 =
      // servidor sem o endpoint → cai no encerrar de sempre (comportamento
      // anterior, sem devolver a ocorrência) em vez de estourar erro na cara.
      const response = opts.descartar
        ? await H.api("/logistica/rota/descartar-montagem", { method: "POST", body })
          .catch(error => (error && (error.status === 404 || error.status === 405)
            ? H.api("/logistica/rota/encerrar", { method: "POST", body })
            : Promise.reject(error)))
        : await H.api("/logistica/rota/encerrar", { method: "POST", body });
      const resumo = (response && response.resumo) || {};
      clearInterval(nextStopTimer);
      state.nextStop = null;
      state.routePaused = false;
      H.cache.remove("logistica-route-paused");
      clearRouteSelection();
      clearRouteOrdemManual();
      clearRouteEngineState();
      // R1 (27/07) — sem rota, nenhum dia é "Adicionado ✓" nos chips da montagem.
      clearDiasAdicionados();
      // A exclusão "só hoje" da tela de erros morre junto com a rota.
      state.rotaExcluidos = [];
      // Item 7 (28/07) — a rota morreu: o carimbo de "já aceita" morre com ela
      // (a próxima montagem do dia volta a se desfazer ao sair sem aceitar).
      limparRotaAceita();
      H.stopRoute();
      // S2 21/07 — "encerrar rota limpa" a trilha (spec S2 #4): não sobrevive
      // de um dia pro outro (sobrevive só a pausa/retomada DO MESMO dia, ver
      // comentário em state.navTrilha). stopNavWatch() explícito não é
      // necessário aqui — o refresh(true) logo abaixo já chama render(), que
      // desliga o watch sozinho (syncNavWatch, routeActive() vira false).
      state.navTrilha = [];
      state.navPosicao = null;
      // S3 21/07 — a rota viária em pernas e o disjuntor de recálculo são "por
      // rota/dia" igual à trilha: zeram junto (senão a próxima rota herdava
      // cortes de paradas que não existem mais e um orçamento já gasto).
      state.navRota = null;
      // S5 21/07 — bookkeeping de voz é "por rota/dia" também; navVoiceState()
      // já resincronizaria sozinho (forStopId muda), mas zerar explícito aqui
      // segue o mesmo padrão do navRota/navTrilha acima e corta qualquer fala
      // em curso da rota que acabou de encerrar.
      state.navVoice = null;
      H.speakStop();
      resetNavRecalcBudget();
      await refresh(true);
      // S4 22/07 — route_stop é "a rota que tava rodando parou de rodar", não
      // "cancelei um planejamento que nem tinha começado" (esta MESMA função
      // atende cancel-route também). Por isso o som vem de opts.playSound, e
      // não de "vai salvar" — encerrar sem salvar continua sendo route stop.
      const isRealRouteStop = !!opts.playSound;
      if (isRealRouteStop) H.sound("route_stop");
      // Quando vai salvar a ordem, saveTodayRoute dá o toast final (silencioso,
      // pra não empilhar som em cima do route_stop). Senão, resumo do encerrar.
      if (opts.saveRoute && snapshot) await saveTodayRoute(snapshot);
      // Resumo de entregues/pendentes é do encerrar de verdade — aqui seria zero.
      // opts.semToast: tirar UM dia dos vários desfaz e remonta na sequência — o
      // toast do remontar é quem fala, senão saem dois avisos empilhados.
      else if (opts.descartar) { if (!opts.semToast) toast(opts.mensagemToast || "Rota desfeita."); }
      else toast(opts.mensagemToast || `Rota encerrada. ${Number(resumo.entregues || 0)} entregues preservadas, ${Number(resumo.pendentes || 0)} pendentes.`, false, { mudo: isRealRouteStop });
    } catch (error) {
      toast(humanApiError(error), true);
    }
  }
  // PR18072026 Onda 3 (simplificado 22/07) — salvar a ordem de hoje deixou de
  // ser um SEGUNDO popup depois do encerrar; virou o botão "Salvar esta ordem e
  // encerrar" DENTRO do mesmo popup de Encerrar (uma decisão só). Ordem real =
  // entregues por deliveredAt asc (na ordem em que aconteceram) + abertas por
  // rotaOrdem.
  function todayRouteParadas(snapshot) {
    const delivered = snapshot.filter(item => item.status === "entregue")
      .sort((a, b) => new Date(a.deliveredAt || 0).getTime() - new Date(b.deliveredAt || 0).getTime());
    const open = snapshot.filter(item => item.status !== "entregue")
      .sort((a, b) => (storedRouteOrder(a) ?? Infinity) - (storedRouteOrder(b) ?? Infinity));
    return [...delivered, ...open]
      .map(item => { const cliente = item.cliente || {}; return cliente.id ? { customerProfileId: String(cliente.id) } : null; })
      .filter(Boolean);
  }
  async function saveTodayRoute(snapshot) {
    const paradas = todayRouteParadas(snapshot);
    const dia = todayIso();
    const dayLabel = (weekDays.find(day => day.n === dia) || {}).label || "";
    if (paradas.length < 2) { toast("Rota encerrada."); return; }
    try {
      await loadRouteModelos(true);
      const existing = (state.routeModelos || []).find(modelo => Number(modelo.diaSemana) === dia);
      if (existing) await H.api(`/logistica/rota-modelos/${encodeURIComponent(existing.id)}`, { method: "PATCH", body: { paradas } });
      else await H.api("/logistica/rota-modelos", { method: "POST", body: { nome: `Minha rota de ${dayLabel}`, diaSemana: dia, paradas } });
      await loadRouteModelos(true);
      // Silencioso: o route_stop já tocou; um som de sucesso aqui empilharia.
      toast(`Rota encerrada e ordem salva${dayLabel ? ` como sua rota de ${dayLabel}` : ""}.`, false, { mudo: true });
    } catch (error) { toast(humanApiError(error), true); }
  }
  async function performDeleteRouteModelo(id) {
    if (!id) return;
    try {
      await H.api(`/logistica/rota-modelos/${encodeURIComponent(id)}`, { method: "DELETE" });
      await loadRouteModelos(true);
      toast("Rota excluída.");
    } catch (error) { toast(humanApiError(error), true); }
  }
  // PR18072026 Onda 3 — "Limpar o dia": CANCELA (não pausa) as entregas
  // abertas de hoje. Botão perigoso dentro do popup de cancelar planejamento.
  async function performLimparDia() {
    try {
      const response = await H.api("/logistica/rota/limpar-dia", { method: "POST", body: { date: operationalDate(), motivo: "Dia limpo pelo administrador." } });
      const canceladas = Number((response && response.canceladas) || 0);
      clearInterval(nextStopTimer);
      state.nextStop = null;
      state.routePaused = false;
      H.cache.remove("logistica-route-paused");
      clearRouteSelection();
      clearRouteOrdemManual();
      clearRouteEngineState();
      // R1 (27/07) — sem rota, nenhum dia é "Adicionado ✓" nos chips da montagem.
      clearDiasAdicionados();
      H.stopRoute();
      // S2 21/07 — mesma lógica de performEncerrarRota: "Limpar o dia" também
      // encerra a execução de hoje, então a trilha da navegação não deve
      // sobrar pro próximo dia/sessão.
      state.navTrilha = [];
      state.navPosicao = null;
      // S3 21/07 — mesma lógica de performEncerrarRota: zera junto com a trilha.
      state.navRota = null;
      // S5 21/07 — idem performEncerrarRota: zera bookkeeping de voz e corta
      // fala em curso.
      state.navVoice = null;
      H.speakStop();
      resetNavRecalcBudget();
      await refresh(true);
      toast(canceladas > 0 ? `${canceladas} entrega(s) cancelada(s).` : "Nenhuma entrega aberta para cancelar.");
    } catch (error) {
      toast(humanApiError(error), true);
    }
  }
  async function markNotDelivered(item) {
    const reason = state.deliveryReason;
    if (!item || !reason) return;
    try {
      await H.api(`/logistica/entregas/${encodeURIComponent(item.id)}/cancelar`, { method: "POST", body: { motivo: reason } });
      await closeOverlay("sheet"); await refresh(true); toast("Entrega retirada da rota.");
      const next = openItems()[0]; if (next) showNextStop(next);
    } catch (error) { toast(humanApiError(error), true); }
  }
  // PR18072026 Módulo Financeiro — nível 1 (deliveryOfflineSheet): "Não
  // atendeu" direto, sem pedir motivo (o app não tem pra onde mostrar isso
  // nesta folha ultra-simples). Mesmo endpoint/fluxo de próxima parada do
  // markNotDelivered acima — só sem a etapa de escolher motivo.
  async function performOfflineNotDelivered(item) {
    if (!item) return;
    try {
      await H.api(`/logistica/entregas/${encodeURIComponent(item.id)}/cancelar`, { method: "POST", body: { motivo: "Não atendeu." } });
      await closeOverlay("sheet"); await refresh(true); toast("Marcado como não atendido.");
      const next = openItems()[0]; if (next) showNextStop(next);
    } catch (error) { toast(humanApiError(error), true); }
  }
  async function uploadProof(item, type, file) {
    try {
      // S3 22/07 — "Enviando…" é INTENÇÃO (o upload nem começou de verdade),
      // não fato; mudo:true corta o "success" genérico daqui, senão o
      // motorista ouviria um ding de sucesso antes do arquivo sequer sair do
      // aparelho (o mesmo erro que a Regra de Ouro do S3 proíbe pro clique).
      toast("Enviando comprovante…", false, { mudo: true });
      const keyName = `proof:${item.id}:${type}`; let key = H.cache.get(keyName, null); if (!key) { key = H.uuid(); H.cache.set(keyName, key); }
      // H.uploadProof (native.js) só resolve no CALLBACK nativo de sucesso —
      // é a ponte de fato descrita no S3 (native.js:94), nunca no clique.
      await H.uploadProof(item.id, type, file, key);
      H.cache.remove(keyName);
      const selectedId = item.id;
      await refresh(true);
      state.selected = items().find(x => x.id === selectedId) || null;
      render();
      H.sound("proof_saved");
      toast(type === "foto" ? "Foto anexada." : "Assinatura anexada.", false, { mudo: true });
    } catch (error) { toast(humanApiError(error), true); }
  }
  function clientById(id) { return (state.clients || []).find(c => String(c.id) === String(id)); }
  function navigateTo(nextScreen, motion) {
    const screens = ["route", "clients", "products", "settings"];
    const currentIndex = screens.indexOf(state.screen);
    const nextIndex = screens.indexOf(nextScreen);
    state.navMotionFrom = currentIndex === -1 || nextIndex === -1 || currentIndex === nextIndex ? null : currentIndex;
    state.screenMotion = motion || (currentIndex === -1 || nextIndex === -1 || currentIndex === nextIndex ? "" : nextIndex > currentIndex ? "forward" : "back");
    state.screen = nextScreen;
    state.selected = null;
    state.modal = null;
    render();
    state.screenMotion = "";
    clearTimeout(navMotionTimer);
    navMotionTimer = setTimeout(() => { state.navMotionFrom = null; }, 360);
    // Lista e busca são as MESMAS do seletor da rota: entrar em Clientes com o
    // termo herdado de lá mostraria a lista já filtrada. Chega sempre limpa.
    if (nextScreen === "clients" && (state.clientsPage === 0 || state.query !== "")) { state.query = ""; loadClients(true); }
  }
  function closeOverlay(kind) {
    if (state.closingOverlay) return Promise.resolve();
    // Lei 10 (25/07) — update OBRIGATÓRIA (state.updateInfo.obrigatoria) não
    // fecha por NENHUM caminho: o próprio appUpdateModal já esconde o toque-no-
    // fundo e o "Agora não" pra esse caso (~L1934); esta trava cobre qualquer
    // outra chamada de código que tente fechar o modal por baixo (handleBack
    // já para antes de chegar aqui, mas esta é a segunda barreira).
    if (kind === "modal" && state.modal === "app-update" && state.updateInfo && state.updateInfo.obrigatoria) return Promise.resolve();
    if (kind === "modal") clearInterval(leituraObsTimer);
    // S4 25/07 (PR25072026-ROTA-CONFERIDA) — a mini-ficha da conferência abre o
    // editor de cliente REAL (openClientEditor/"client-product") por cima da
    // tela de conferência em vez de duplicar o formulário de endereço. Fechar
    // esse editor (salvar OU só cancelar) precisa VOLTAR pra conferência, não
    // cair na tela Rota crua — a intenção é capturada AGORA (state.modal ainda
    // não mudou; rotaConferencia.retornoParadaId só existe enquanto esse editor
    // está aberto vindo da ficha, ver abrirFichaComEditor).
    const voltaParaConferencia = kind === "modal" && state.modal === "client-product" && state.rotaConferencia && state.rotaConferencia.retornoParadaId;
    // Item 1 (28/07) — mesma ideia, pro cadastro aberto pela tela "Endereços com erro".
    const voltaParaChecagem = kind === "modal" && state.checagemRetorno && !!state.checagem;
    // 26/07 (dono, regra ABSOLUTA, 3ª cobrança): só o "Aceitar rota" consolida.
    // Sair da conferência por QUALQUER outro caminho (×, voltar, toque no fundo)
    // desfaz a rota sozinho. `confirmada`/`cancelada` marcam as duas saídas
    // legítimas (aceitar; popup Cancelar? que já encerra por conta própria).
    // R1 (27/07) — vale igual quando a conferência mora DENTRO da tela única de
    // montagem (host 'montagem', modal manage-day).
    const abandonaConferencia = kind === "modal" && state.rotaConferencia && !state.rotaConferencia.confirmada && !state.rotaConferencia.cancelada && routePlanned() &&
      (state.modal === "rota-conferencia" || (state.modal === "manage-day" && state.rotaConferencia.host === "montagem"));
    // Fechar a montagem some com a conferência hospedada nela (confirmada ou
    // abandonada, tanto faz — o estado não pode sobreviver pro próximo abrir).
    const limpaConferenciaMontagem = kind === "modal" && state.modal === "manage-day" && state.rotaConferencia && state.rotaConferencia.host === "montagem";
    // Fechar a Agenda com a geração EM VOO: rede não se cancela — marca o
    // abandono e afterRoutaPlanejada desfaz assim que a chamada aterrissar.
    if (kind === "modal" && state.modal === "manage-day" && state.dayStarting) state.montagemAbandonada = true;
    state.closingOverlay = kind;
    render();
    return new Promise(resolve => setTimeout(() => {
      // 28/07 (item 4) — a Rota rápida da tela Rota morre com o modal dela (senão
      // o próximo "+" abriria com o CEP da vez passada preenchido).
      if (kind === "modal" && state.modal === "rota-rapida") state.montagemRapida = null;
      if (kind === "modal") { state.modal = null; state.modalClient = null; state.editProductDraft = null; state.clientProductFormOpen = false; state.dddPrompt = null; state.historico = null; }
      // Passos que vivem DENTRO da montagem morrem com ela (senão o próximo
      // "Montar rota" abriria direto no nome da rota da vez passada).
      if (limpaConferenciaMontagem || abandonaConferencia) { state.montagemSalvar = null; state.montagemRapida = null; }
      if (abandonaConferencia) { state.rotaConferencia = null; void desfazerRotaMontada(); }
      else if (limpaConferenciaMontagem) state.rotaConferencia = null;
      // 22/07 — fechar a folha zera TUDO da chegada editável (picker, preço aberto,
      // modo edição). Sem isso, a próxima parada abriria com o estado da anterior.
      if (kind === "sheet") { state.selected = null; state.deliveryProductPicker = false; state.deliverySwapKey = null; state.deliveryPriceEdit = null; state.deliveryEditingId = null; }
      state.closingOverlay = null;
      if (voltaParaConferencia) void reabrirConferenciaAposEdicao();
      // Item 1 — saiu do cadastro aberto pela tela de erros: volta pra ela JÁ
      // reconferindo (corrigiu? a linha some sozinha; zerou? monta a rota).
      else if (voltaParaChecagem) { state.checagemRetorno = false; void recarregarChecagem(); }
      render();
      resolve();
    }, 180));
  }
  function showModal(name) { state.openingOverlay = "modal"; state.modal = name; render(); }
  // `valorUnitOriginal` = preço que JÁ estava no item (só chega pra quem enxerga
  // catálogo). `valorUnit` fica indefinido até o entregador editar na tela — é o
  // que decide se o preço viaja no confirmar.
  function makeDeliveryDraft(item) { const existing = (item.itens || []).map(x => ({ key: `item-${x.id}`, id: x.id, productId: x.produto && x.produto.id || x.produtoId || null, nome: x.produto && x.produto.nome || "Produto", qtd: Math.max(0, Number(x.qtdEntregue ?? x.qtdPrevista ?? 1)), valorUnitOriginal: Number(x.valorUnit || 0) || 0, novo: false })); if (existing.length) return { deliveryId: item.id, items: existing }; return { deliveryId: item.id, items: [{ key: `legacy-${item.id}`, id: item.id, productId: item.produto && item.produto.id || item.produtoId || null, nome: item.produto && item.produto.nome || "Entrega", qtd: Math.max(1, Number(item.quantidade || 1)), novo: false }] }; }
  function deliveryDraftFor(item) { if (!state.deliveryDraft || state.deliveryDraft.deliveryId !== item.id) state.deliveryDraft = makeDeliveryDraft(item); return state.deliveryDraft; }
  // "GPS avançado" (S1, ícone à esquerda do play) e data-action="maps" da
  // folha continuam chamando isto — único jeito de abrir Waze/Maps que sobra
  // depois do S2 (fim do troca-troca automático).
  // S4 22/07 — navigation_open só toca aqui, no deep-link explícito pro
  // Waze/Maps ("Continuar navegação"/"show-map"). NÃO plugado na ativação
  // automática do modo de navegação interna (navModeActive() virar true
  // sozinho quando a rota inicia) — isso tocaria colado com route_start
  // (mesmíssimo instante, toda vez que uma rota começa), virando duplicata
  // (Lei nº4). H.maps() não tem callback de sucesso/falha (intent fire-and-
  // forget do Android): aqui o clique E o fato acontecem no mesmo instante,
  // então não há "torcer pelo sucesso" como em confirmDelivery — o som pode
  // ficar junto do clique sem violar a Regra de Ouro.
  function abrirNavegacao(item) { if (!item) return; const client = item.cliente || {}; if (!validCoordinates(client.lat, client.lng) && !String(client.endereco || "").trim()) { toast("Destino sem coordenadas ou endereço cadastrado.", true); return; } H.sound("navigation_open"); H.maps(client.lat, client.lng, address(client)); }
  // S2 21/07 — reengancha o follow e centraliza motorista+próxima parada no
  // mapa da Rota (mesmo fitBounds de abertura da navegação, navInitialFitBounds;
  // cai pro follow single-point de sempre se não der). Usado pelo fim do
  // countdown de "Próxima parada" (openNextStop) — o foco muda de tela pra
  // MAPA, nunca mais pra app externo.
  function refocusNavCamera() {
    if (!routeMap || !routeMapHost) return;
    const parts = routeMapHost.__hbxMapParts || (routeMapHost.__hbxMapParts = { markers: [] });
    parts.following = true;
    syncRouteReadingFollowUi(parts);
    const mode = routeLiveMode();
    const point = routeLivePoint(mode);
    if (!navInitialFitBounds(routeMap, point)) followRouteReadingPosition(routeMapHost, routeMap, parts, point, true, mode);
  }
  function openNextStop() {
    // Ponto único: o timer (countdown chega a 0) e o toque em "Ver rota" caem
    // os dois aqui. O guard evita disparar 2x se ambos acontecerem perto um
    // do outro; nextStop é limpo ANTES, então uma segunda chamada encontra
    // state.nextStop nulo e não faz nada.
    // S2 21/07 — NÃO abre mais Waze/Maps: garante a tela Rota (navigateTo se
    // preciso — o overlay pode ter ficado aberto sobre outra tela), fecha o
    // overlay e foca o mapa na próxima parada (fitBounds + follow religado).
    if (!state.nextStop || state.nextStopOpening) return;
    state.nextStopOpening = true;
    clearInterval(nextStopTimer);
    state.nextStop = null;
    if (state.screen !== "route") navigateTo("route"); else render();
    refocusNavCamera();
    state.nextStopOpening = false;
  }
  function showNextStop(item) { clearInterval(nextStopTimer); state.screen = "route"; state.nextStop = item; state.nextCountdown = 5; state.nextStopOpening = false; render(); nextStopTimer = setInterval(() => { if (!state.nextStop) return clearInterval(nextStopTimer); state.nextCountdown = Math.max(0, state.nextCountdown - 1); if (state.nextCountdown === 0) { clearInterval(nextStopTimer); openNextStop(); return; } const label = document.querySelector(".next-stop-count i"); if (label) label.textContent = String(state.nextCountdown); const ring = document.querySelector(".next-stop-progress"); if (ring) ring.style.strokeDashoffset = (188.5 * state.nextCountdown / 5).toFixed(1); }, 1000); }
  function showSheet(item, arrived) { clearInterval(nextStopTimer); state.nextStop = null; state.openingOverlay = "sheet"; state.selected = item; state.deliveryDraft = makeDeliveryDraft(item); state.deliveryReason = ""; state.deliveryNotDelivered = false; state.deliveryArrived = !!arrived; state.deliveryProductPicker = false; state.deliverySimpleDetail = false; render(); }

  function stopLeituraObsCountdown() {
    if (state.leituraStep !== "observacoes" || state.leituraObsTyped) return;
    state.leituraObsTyped = true;
    clearInterval(leituraObsTimer);
    const line = app.querySelector(".lrt-obs-count");
    if (line) line.remove();
  }
  function filterSelectionList(input, listId, emptyId) {
    const query = duplicateTextKey(input.value);
    const list = document.getElementById(listId);
    let visible = 0;
    if (list) list.querySelectorAll("[data-selection-search]").forEach(row => {
      const show = !query || String(row.dataset.selectionSearch || "").includes(query);
      row.hidden = !show;
      if (show) visible += 1;
    });
    const emptyState = document.getElementById(emptyId);
    if (emptyState) emptyState.hidden = visible > 0;
  }
  app.addEventListener("keydown", event => {
    if (!moduleActive || event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target;
    const customControl = target && target.matches && !target.matches("button,a,input,select,textarea") && target.matches('[role="button"],[role="switch"]');
    if (customControl && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      event.stopPropagation();
      target.click();
      return;
    }
    if (event.key !== "Enter") return;
    if (!keyboardEditable(target)) return;
    if (target.tagName === "TEXTAREA" && !target.dataset.enterAction && target.dataset.enterSubmit === undefined) return;
    if (target.id === "leitura-cliente-search" || target.id === "leitura-produto-search") {
      const listId = target.id === "leitura-cliente-search" ? "leitura-cliente-list" : "leitura-produto-list";
      const list = document.getElementById(listId);
      const first = list && [...list.querySelectorAll("[data-action]")].find(row => !row.hidden && !row.disabled);
      if (first) { event.preventDefault(); event.stopPropagation(); target.blur(); first.click(); }
      return;
    }
    const scope = target.closest("[data-enter-scope]") || target.form || target.closest(".center-modal-body") || target.parentElement;
    const controls = scope ? keyboardControls(scope) : [target];
    const index = controls.indexOf(target);
    const next = index >= 0 ? controls.slice(index + 1).find(control => control !== target) : null;
    const action = target.dataset.enterAction || scope && scope.dataset && scope.dataset.enterAction;
    const form = target.form;
    if (!next && !action && !form) return;
    event.preventDefault();
    event.stopPropagation();
    if (next) { focusKeyboardField(next); return; }
    if (action) {
      const now = Date.now();
      if (lastKeyboardAction.name === action && now - lastKeyboardAction.at < 800) return;
      const button = [...app.querySelectorAll("[data-action]")].find(candidate => candidate.dataset.action === action && !candidate.disabled);
      if (button) { target.blur(); lastKeyboardAction = { name: action, at: now }; button.click(); }
      return;
    }
    if (!form) return;
    const submit = form.querySelector("button[type=submit],input[type=submit]");
    if (submit && submit.disabled) return;
    target.blur();
    if (typeof form.requestSubmit === "function") { if (submit) form.requestSubmit(submit); else form.requestSubmit(); }
    else if (submit) submit.click();
  });
  app.addEventListener("pointerdown", event => {
    if (event.target.closest && event.target.closest("#leitura-obs-input")) stopLeituraObsCountdown();
    replayIconMotion(event.target);
  }, { passive: true });
  app.addEventListener("focusin", event => {
    if (event.target && event.target.id === "leitura-obs-input") stopLeituraObsCountdown();
    requestAnimationFrame(() => { syncKeyboardViewport(); revealFocusedForKeyboard(); });
  });
  app.addEventListener("focusout", event => {
    setTimeout(syncKeyboardViewport, 80);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => { syncKeyboardViewport(); revealFocusedForKeyboard(); });
    window.visualViewport.addEventListener("scroll", syncKeyboardViewport);
  }
  window.addEventListener("resize", () => { syncKeyboardViewport(); syncChromeMetrics(); stabilizeRouteMapLayout(); });
  window.addEventListener("orientationchange", () => requestAnimationFrame(() => { syncChromeMetrics(); stabilizeRouteMapLayout(); }));

  app.addEventListener("click", async event => {
    if (!moduleActive) return;
    if (event.detail === 0) replayIconMotion(event.target);
    const target = event.target.closest("[data-screen],[data-action],[data-delivery],[data-client],[data-mode],[data-day],[data-client-day],[data-client-product-mode],[data-client-product-id],[data-payment-form],[data-payment-method]"); if (!target) return;
    // O wrapper fecha somente pelo toque no fundo. Controles dentro do modal não
    // podem herdar o data-action="close-modal" do wrapper.
    if (target.matches(".modal-wrap,.sheet-wrap") && event.target !== target) return;
    if (target.dataset.screen) { navigateTo(target.dataset.screen); return; }
    if (target.dataset.delivery) { if (ignoredRouteStopClickId === target.dataset.delivery) { ignoredRouteStopClickId = null; return; } const item = items().find(i => i.id === target.dataset.delivery) || null; if (item) showSheet(item); return; }
    if (target.dataset.client) { if (ignoredClientClickId === target.dataset.client) { ignoredClientClickId = null; return; } openClientEditor(clientById(target.dataset.client)); return; }
    if (target.dataset.day) { void toggleManagedRouteDay(Number(target.dataset.day)); return; }
    if (target.dataset.clientDay) { const day = Number(target.dataset.clientDay); state.clientDaysTouched = true; state.clientProductDays = state.clientProductDays.includes(day) ? state.clientProductDays.filter(value => value !== day) : [...state.clientProductDays, day].sort((a, b) => a - b); render(); return; }
    if (target.dataset.clientProductId) { if (ignoredClientProductClickId === target.dataset.clientProductId) { ignoredClientProductClickId = null; return; } const item = state.clientProducts.find(product => product.id === target.dataset.clientProductId); if (item) editClientProduct(item); return; }
    if (target.dataset.paymentForm) { const draft = target.dataset.paymentTarget === "client" ? state.clientPaymentDraft : state.newClientDraft; draft.formaPagamento = target.dataset.paymentForm; if (draft.formaPagamento !== "na_hora") draft.metodoPadrao = ""; render(); return; }
    if (target.dataset.paymentMethod) { const draft = target.dataset.paymentTarget === "client" ? state.clientPaymentDraft : state.newClientDraft; draft.metodoPadrao = target.dataset.paymentMethod; render(); return; }
    // 26/07 — o handler data-mode (PATCH /logistica/config com trackingAtivo +
    // modoRotaPadrao) SAIU junto com o modal: o celular não escolhe mais o modo
    // comercial da rota. Quem liga a Rastreada é o administrador pelo PC.
    const action = target.dataset.action;
    if (action === "recarga-select-pack") { beginRecargaCheckout(target.dataset.packKey); return; }
    if (action === "recarga-reload") { openRecarga(); return; }
    // S5 21/07 (PR21072026-NAVEGAÇÃO-HBX) — mudo do painel de navegação:
    // alterna state.navMudo + persiste (H.cache). Mudo NÃO some com o
    // banner, só segura os H.speak() futuros (ver processNavVoice); um
    // H.speakStop() aqui evita que uma fala já em curso continue depois do
    // toque em mudo.
    if (action === "nav-mute-toggle") {
      state.navMudo = !state.navMudo;
      H.cache.set("nav-mudo", state.navMudo);
      if (state.navMudo) H.speakStop();
      render();
      return;
    }
    if (action === "open-financeiro") { if (!isAdmin()) return; showModal("financeiro"); return; }
    if (action === "open-avancado") { if (!isAdmin()) return; showModal("avancado"); return; }
    if (action === "toggle-config-flag") {
      if (!isAdmin()) return;
      const key = target.dataset.configKey;
      if (!key) return;
      const next = !configFlag(key);
      try {
        await H.api("/logistica/config", { method: "PATCH", body: { [key]: next } });
        state.config = { ...(state.config || {}), [key]: next };
        H.cache.set("logistica-config", state.config);
        render();
      } catch (error) { toast(humanApiError(error), true); }
      return;
    }
    if (action === "reopen-delivery" && state.selected) {
      const reopenedId = state.selected.id;
      try {
        await H.api(`/logistica/entregas/${encodeURIComponent(reopenedId)}/reabrir`, { method: "POST", body: {} });
        H.cache.remove(`delivery-confirm:${reopenedId}`);
        state.selected.status = "agendada";
        state.deliveryNotDelivered = false;
        state.deliveryProductPicker = false;
        render();
        await refresh(true);
        toast("Entrega reaberta. Ajuste os itens e confirme novamente.");
      } catch (error) { toast(humanApiError(error), true); }
      return;
    }
    if (action === "delivery-qty" && state.selected) { const draft = deliveryDraftFor(state.selected); const row = draft.items.find(x => x.key === target.dataset.draftItem); if (row) { row.qtd = Math.max(0, Number(row.qtd || 0) + Number(target.dataset.delta || 0)); H.vibrate(8); render(); } return; }
    if (action === "delivery-add-product") { state.deliveryProductPicker = true; render(); return; }
    if (action === "delivery-close-picker") { state.deliveryProductPicker = false; state.deliverySwapKey = null; render(); return; }
    // CHEGADA 22/07 — tocar no nome do produto abre a lista pra TROCAR aquela linha.
    if (action === "delivery-swap" && state.selected) { state.deliverySwapKey = target.dataset.draftItem || null; state.deliveryProductPicker = true; state.deliveryPriceEdit = null; H.vibrate(8); render(); return; }
    if (action === "delivery-product" && state.selected) {
      const product = (state.products || []).find(p => String(p.id) === String(target.dataset.productId));
      const draft = deliveryDraftFor(state.selected);
      if (product) {
        const swapKey = state.deliverySwapKey;
        const alvo = swapKey ? draft.items.find(x => x.key === swapKey) : null;
        if (alvo) {
          // TROCA: o backend não troca o produto de um EntregaItem no lugar. Então a
          // linha antiga vai a ZERO (some da cobrança) e o produto escolhido entra
          // como item novo, com a MESMA quantidade e o preço já editado, se houver.
          // No banco ficam as duas linhas — o que é bom pra auditoria.
          const qtd = Math.max(1, Number(alvo.qtd || 1));
          const preco = alvo.valorUnit;
          if (alvo.novo) {
            // Linha que ainda não existe no servidor: some do rascunho e pronto.
            draft.items = draft.items.filter(x => x.key !== alvo.key);
          } else {
            // Item REAL da entrega: precisa viajar com qtd 0 pro servidor tirar da
            // cobrança. Fica no rascunho, mas some da tela (`zeradoPorTroca`) —
            // senão a chegada mostraria "0× Galão" do lado do produto novo.
            alvo.qtd = 0;
            alvo.zeradoPorTroca = true;
          }
          draft.items.push({ key: `novo-${product.id}`, id: null, productId: product.id, nome: product.nome || product.name || "Produto", qtd, novo: true, ...(preco !== undefined && preco !== null ? { valorUnit: preco } : {}) });
        } else {
          draft.items.push({ key: `novo-${product.id}`, id: null, productId: product.id, nome: product.nome || product.name || "Produto", qtd: 1, novo: true });
        }
        state.deliveryProductPicker = false;
        state.deliverySwapKey = null;
        H.vibrate(10);
        render();
      }
      return;
    }
    // PREÇO DE HOJE: toca no valor → vira campo; confirma → fica só nesta entrega.
    if (action === "delivery-price" && state.selected) { state.deliveryPriceEdit = target.dataset.draftItem || null; state.deliveryProductPicker = false; render(); return; }
    if (action === "delivery-price-save" && state.selected) { event.preventDefault(); salvarPrecoDeHoje(target.closest("[data-preco-form]")); return; }
    if (action === "delivery-not-delivered") { state.deliveryNotDelivered = true; state.deliveryReason = ""; render(); return; }
    if (action === "delivery-reason") { state.deliveryReason = target.dataset.reason || ""; render(); return; }
    if (action === "delivery-back") { state.deliveryNotDelivered = false; state.deliveryReason = ""; render(); return; }
    if (action === "confirm-not-delivered" && state.selected) { markNotDelivered(state.selected); return; }
    if (action === "delivery-simple-detail") { state.deliverySimpleDetail = true; render(); return; }
    if (action === "delivery-simple-back") { state.deliverySimpleDetail = false; render(); return; }
    if (action === "open-historico") { void abrirHistorico(state.modalClient); return; }
    // Fechar o histórico volta pra ficha do cliente (de onde ele foi aberto), não
    // pra lista — senão o dono perde o que estava editando.
    if (action === "close-historico") { state.historico = null; showModal("client-product"); return; }
    if (action === "historico-limpar") {
      state.confirmation = { type: "limpar-historico", title: "Apagar o histórico todo?", message: "Todas as linhas somem. As entregas e as cobranças continuam no financeiro.", confirmLabel: "Apagar tudo", danger: true, icon: "calendar" };
      render();
      return;
    }
    // [Pago] — paga o VALOR TOTAL (dívida velha + entrega de hoje). O quitarAberto
    // é o que fecha as cobranças antigas; sem ele o app quitava só a de hoje e a
    // dívida velha ficava órfã no financeiro (buraco achado em 22/07).
    if (action === "confirm-pago" && state.selected) { const client = state.selected.cliente || {}; const method = ["pix", "dinheiro"].includes(client.metodoPadrao) ? client.metodoPadrao : "dinheiro"; confirmDelivery(state.selected, { receiptMethod: method, quitarAberto: true }); return; }
    // [Entregue] — só soma o que saiu do caminhão e vai pra próxima parada.
    if (action === "confirm-proximo" && state.selected) { confirmDelivery(state.selected, { receiptMethod: "fiado" }); return; }
    if (action === "confirm-sem-atendimento" && state.selected) {
      const nome = (state.selected.cliente || {}).nome || "este cliente";
      state.confirmation = { type: "sem-atendimento", itemId: state.selected.id, title: "Marcar como não atendido?", message: `${nome} sai da fila de hoje e nada é cobrado.`, confirmLabel: "Marcar", danger: true, icon: "phone" };
      render();
      return;
    }
    // Guia "Entregue" → Editar: abre a MESMA tela da chegada, com a entrega já
    // concluída. Quem grava é o confirmDelivery (que reabre antes de reconfirmar).
    if (action === "edit-delivered") {
      const alvo = items().find(i => i.id === target.dataset.deliveryEdit);
      if (alvo) { state.deliveryEditingId = alvo.id; state.deliveryDraft = null; state.deliverySimpleDetail = false; showSheet(alvo); }
      return;
    }
    if (action === "cancel-delivery-edit") { state.deliveryEditingId = null; await closeOverlay("sheet"); return; }
    // Nível 1 (financeiro OFF) — deliveryOfflineSheet: "Entregue" reusa
    // confirmDelivery sem receiptMethod (GPS-check preservado); "Não atendeu"
    // marca direto (sem motivo digitado) e segue pro fluxo de próxima parada.
    if (action === "confirm-entregue-simples" && state.selected) { confirmDelivery(state.selected, {}); return; }
    if (action === "confirm-nao-atendeu" && state.selected) { performOfflineNotDelivered(state.selected); return; }
    if (action === "next-stop") { openNextStop(); return; }
    if (action === "cancel-next-stop") { clearInterval(nextStopTimer); state.nextStop = null; render(); return; }
    if (action === "route-filter") { state.routeFilter = target.dataset.filter || "fila"; render(); return; }
    // Fase 2 C7 22/07 — repaintThemedMapLayers reaplica a tinta das camadas
    // vivas do mapa (trilha/precisão/pernas/rota) pro tema novo; ver
    // comentário da função (mapa sobrevive à troca de tela).
    if (action === "theme") { H.theme.toggle(); render(); repaintThemedMapLayers(); }
    if (action === "refresh") refresh(false);
    if (action === "close-modal") { await closeOverlay("modal"); return; }
    if (action === "close-sheet") { await closeOverlay("sheet"); return; }
    if (action === "cancel-confirmation") { state.confirmation = null; render(); return; }
    if (action === "duplicate-leitura-continue") {
      const confirmation = state.confirmation;
      if (!confirmation || confirmation.type !== "duplicate-leitura-client" || !confirmation.payload || confirmation.payload.reason !== "nome") return;
      state.confirmation = null;
      render();
      await advanceLeituraNovoDraft();
      return;
    }
    if (action === "accept-confirmation") {
      const confirmation = state.confirmation;
      state.confirmation = null;
      render();
      if (!confirmation) return;
      if (confirmation.type === "checagem-remover") await checagemRemoverTodos();
      if (confirmation.type === "delete-client") await performDeleteClient(clientById(confirmation.itemId));
      if (confirmation.type === "delete-client-product") await performDeleteClientProduct(state.clientProducts.find(item => item.id === confirmation.itemId));
      if (confirmation.type === "archive-product") await performArchiveProduct((state.products || []).find(p => String(p.id) === String(confirmation.itemId)));
      if (confirmation.type === "archive-product-edit") await performArchiveProductFromEdit((state.products || []).find(p => String(p.id) === String(confirmation.itemId)));
      if (confirmation.type === "remove-route-stop") {
        await performRemoveStopForToday(items().find(item => item.id === confirmation.itemId), confirmation.reason);
        // S4 25/07 (PR25072026-ROTA-CONFERIDA) — "tirar desta rota" tocado de
        // dentro da mini-ficha: volta pra lista e reconfere (o conjunto do dia
        // mudou — fora_do_casulo/perna_outlier dependem de TODAS as paradas,
        // não só da que saiu).
        const rcRemove = state.rotaConferencia;
        if (rcRemove && rcRemove.ficha && String(rcRemove.ficha.paradaId) === String(confirmation.itemId)) {
          rcRemove.step = "lista"; rcRemove.ficha = null;
          await recarregarConferencia();
        }
      }
      // 26/07 — "Cancelar rota"/"Limpar hoje" podem nascer DENTRO da tela de
      // conferência (botão da esquerda). Depois de cancelar não existe mais
      // rota pra conferir: o cartão sai junto, senão ficaria aberto mostrando a
      // conferência de uma rota que não existe mais.
      if ((confirmation.type === "cancel-route" || confirmation.type === "limpar-dia") &&
        (state.modal === "rota-conferencia" || (state.modal === "manage-day" && state.rotaConferencia && state.rotaConferencia.host === "montagem"))) {
        // Marca ANTES do close: o guard de abandono do closeOverlay não pode
        // disparar um segundo encerrar em cima do que este popup já executa.
        if (state.rotaConferencia) state.rotaConferencia.cancelada = true;
        await closeOverlay("modal");
        state.rotaConferencia = null;
      }
      // Cancelar = a saída de quem não aceitou: descarta e devolve os dias.
      if (confirmation.type === "cancel-route") await performEncerrarRota("Planejamento cancelado pelo administrador.", { descartar: true });
      if (confirmation.type === "finish-route") await performEncerrarRota("Rota encerrada pelo motorista.", { playSound: true });
      if (confirmation.type === "limpar-dia") await performLimparDia();
      if (confirmation.type === "sem-atendimento") await performOfflineNotDelivered(items().find(item => item.id === confirmation.itemId));
      if (confirmation.type === "apagar-historico") await performApagarHistorico(confirmation.itemId);
      if (confirmation.type === "limpar-historico") await performLimparHistorico();
      if (confirmation.type === "delete-route-modelo") await performDeleteRouteModelo(confirmation.itemId);
      if (confirmation.type === "cancel-leitura") await performCancelLeitura();
      if (confirmation.type === "remove-leitura-parada") await performRemoveLeituraParada(confirmation.itemId);
      if (confirmation.type === "logout") { stopNavWatch(); H.logout(); }
      if (confirmation.type === "ativar-financeiro") {
        try {
          await H.api("/logistica/config", { method: "PATCH", body: { moduloFinanceiroAtivo: true } });
          state.config = { ...(state.config || {}), moduloFinanceiroAtivo: true };
          H.cache.set("logistica-config", state.config);
          toast("Financeiro ativado. Agora você pode informar preços.");
          render();
        } catch (error) { toast(humanApiError(error), true); }
      }
      if (confirmation.type === "duplicate-new-client") openClientEditor(confirmation.payload && confirmation.payload.client);
      if (confirmation.type === "duplicate-leitura-client") chooseLeituraClient(confirmation.payload && confirmation.payload.client);
      // S5 25/07 (PR25072026-ROTA-CONFERIDA) — "Manter sequência aprovada" do
      // drift de origem: re-executa o MESMO caminho de iniciar do zero (ver
      // avisarDriftOrigemAprovada); o override consumido 1x evita perguntar de
      // novo no re-disparo (mesmo espírito de distanceOverrideDeliveryId).
      if (confirmation.type === "rota-origem-divergente") {
        const payload = confirmation.payload || {};
        rotaOrigemAprovadaOverride = true;
        if (payload.fn === "start-route") await startRoute(false, payload.generateToday, payload.deliveryIds);
        else if (payload.fn === "start-planned-route") await startPlannedRoute();
        else if (payload.fn === "begin-managed-route") await beginManagedRoute();
        rotaOrigemAprovadaOverride = false;
      }
      // type "info": só um aviso (OK) — nenhum efeito colateral.
      return;
    }
    if (action === "new-client") { state.newClientDraft = blankNewClientDraft(); state.newClientCepStatus = ""; resetClientProductEditor(); state.clientProductDays = []; state.clientDaysOriginal = []; state.clientDaysTouched = false; showModal("new-client"); }
    if (action === "new-client-gps") await useCurrentLocationForNewClient();
    if (action === "new-client-locate-address") await locateNewClientAddress();
    if (action === "locate-client-address") await locateClientAddress();
    if (action === "new-product") showModal("new-product");
    if (action === "edit-product") {
      if (ignoredProductClickId === target.dataset.productId) { ignoredProductClickId = null; return; }
      if (!isAdmin()) return;
      const product = (state.products || []).find(p => String(p.id) === String(target.dataset.productId));
      if (product) {
        state.modalProduct = product;
        state.editProductDraft = { nome: product.nome || product.name || "", unidade: product.unidade || "", precoCatalogo: product.precoCatalogo != null ? String(product.precoCatalogo) : "", estoque: product.estoque != null ? String(product.estoque) : "" };
        showModal("edit-product");
      }
      return;
    }
    if (action === "toggle-product-active") {
      const product = (state.products || []).find(p => String(p.id) === String(target.dataset.productId));
      if (!product) return;
      const nextActive = product.ativo === false;
      // S3 21/07 — arquivar (nextActive===false) é a MESMA ação do hold na lista
      // de Produtos, que já confirma; este botão da ficha executava direto, sem
      // confirmação. Reativar continua imediato (não é destrutivo).
      if (!nextActive) {
        state.confirmation = { type: "archive-product-edit", itemId: product.id, title: "Arquivar produto?", message: `${product.nome || product.name || "Produto"} sai do catálogo ativo. Você pode reativar depois.`, confirmLabel: "Arquivar", danger: true, icon: "box" };
        render();
        return;
      }
      try {
        await H.api(`/logistica/produtos/${encodeURIComponent(product.id)}`, { method: "PATCH", body: { ativo: true } });
        product.ativo = true;
        H.cache.set("logistica-products", state.products);
        await closeOverlay("modal");
        toast("Produto reativado.");
      } catch (error) { toast(humanApiError(error), true); }
      return;
    }
    if (action === "new-client-product") {
      resetClientProductEditor();
      // 27/07 — form aberto = modo único (dias do CLIENTE). Sem dias marcados, o
      // salvar avisa "Marque os dias de entrega no Cadastro".
      state.clientProductMode = "weekly";
      state.clientProductFormOpen = true; render();
    }
    if (action === "close-client-product-form") { resetClientProductEditor(); state.clientProductFormOpen = false; render(); }
    // Seta ↑↓ da quantidade no produto já salvo: pinta na hora e grava depois de
    // meio segundo parado (toque repetido não vira uma chamada por toque).
    if (action === "client-product-qty") {
      const vinculoId = target.dataset.clientProduct;
      const item = (state.clientProducts || []).find(product => String(product.id) === String(vinculoId));
      if (!item) return;
      const atual = Math.max(1, Number(item.qtdPadrao || 1));
      const nova = Math.max(1, atual + Number(target.dataset.delta || 0));
      if (nova === atual) return;
      item.qtdPadrao = nova;
      if (state.clientProductEditingId === item.id) state.clientProductDraft.qtdPadrao = String(nova);
      render();
      clearTimeout(clientProductQtyTimers.get(String(vinculoId)));
      clientProductQtyTimers.set(String(vinculoId), setTimeout(async () => {
        clientProductQtyTimers.delete(String(vinculoId));
        try {
          await H.api(`/logistica/cliente-produtos/${encodeURIComponent(vinculoId)}`, { method: "PATCH", body: { qtdPadrao: nova } });
        } catch (error) {
          toast(humanApiError(error), true);
          await loadClientProducts();
        }
      }, 500));
      return;
    }
    if (action === "call-client" && state.modalClient) H.call(state.clientDetail && state.clientDetail.whatsapp || state.modalClient.phone || state.modalClient.phoneNormalized || state.modalClient.whatsapp);
    if (action === "whatsapp-client" && state.modalClient) { const client = state.modalClient; H.whatsapp(state.clientDetail && state.clientDetail.whatsapp || client.whatsapp || client.phone || client.phoneNormalized, `Olá, ${client.nome || client.name || "tudo bem"}?`); }
    // PR20072026 (feedback dono) — completar DDD do número salvo sem DDD.
    if (action === "complete-ddd") { openDddPrompt(); return; }
    if (action === "cancel-ddd") { state.dddPrompt = null; render(); return; }
    if (action === "confirm-ddd") { await confirmDddPrompt(); return; }
    if (action === "cancel-distance-confirm") { state.distanceWarning = null; state.distanceOverrideDeliveryId = null; await closeOverlay("modal"); return; }
    if (action === "confirm-distance-delivery") { const warning = state.distanceWarning; const item = warning && items().find(row => row.id === warning.itemId); const pendingOptions = warning && warning.options; state.distanceWarning = null; state.distanceOverrideDeliveryId = item && item.id || null; await closeOverlay("modal"); if (item) await confirmDelivery(item, pendingOptions); return; }
    if (action === "arrival-radius") { if (!isAdmin()) return; showModal("arrival-radius"); }
    if (action === "start-route") openDayManager("start");
    if (action === "plan-route") openDayManager("plan");
    if (action === "start-planned-route") await startPlannedRoute();
    // 26/07 (dono): "CANCELAR? Tem certeza? Sim, Não. PRONTO." — sem quest, sem
    // terceiro botão. O Limpar o dia continua no satélite próprio da tela Rota.
    // R3 (27/07) — o que o dono pediu VISÍVEL: cancelar não queima os créditos do
    // dia (claim por dia — montar de novo não cobra de novo). Sem frase técnica.
    // 27/07 (dono): o popup fica, a ESCRITA sai. A pergunta é o título; o resto
    // era frase minha explicando crédito. Título + Sim/Não, nada mais.
    if (action === "cancel-route") { state.confirmation = { type: "cancel-route", title: "Cancelar?", confirmLabel: "Sim", cancelLabel: "Não", danger: true, icon: "route" }; render(); }
    // 22/07 — popup enxuto: texto de 1 linha e o "salvar rota" virou botão DESTE
    // mesmo popup (extraAction, sem segundo popup). "Salvar" só aparece quando há
    // ≥2 paradas com cliente pra formar uma rota.
    if (action === "finish-route") {
      const podeSalvar = items().filter(item => (item.cliente || {}).id).length >= 2;
      state.confirmation = { type: "finish-route", title: "Encerrar rota?", message: `${deliveredItems().length} entregues ficam no histórico. ${openItems().length} abertas voltam às pendências.`, confirmLabel: "Encerrar", danger: true, icon: "route", ...(podeSalvar ? { extraAction: "finish-route-save", extraLabel: "Salvar esta ordem e encerrar", extraDanger: false } : {}) };
      render();
    }
    // Botão "Salvar esta ordem e encerrar" do popup acima: encerra E salva numa
    // ação só (ver performEncerrarRota/saveTodayRoute).
    if (action === "finish-route-save") { state.confirmation = null; render(); await performEncerrarRota("Rota encerrada pelo motorista.", { playSound: true, saveRoute: true }); return; }
    // PR18072026 Onda 3 — "Limpar o dia": segunda confirmação a partir do botão
    // perigoso dentro do popup de cancelar planejamento.
    if (action === "confirm-limpar-dia") { state.confirmation = { type: "limpar-dia", title: "Cancelar entregas abertas?", message: `Cancela ${openItems().length} entregas abertas. Agenda, entregues e financeiro não mudam.`, confirmLabel: "Cancelar abertas", danger: true, icon: "route" }; render(); return; }
    // PR18072026 — satélite lixeira "Limpar o dia" fora do popup de cancelar
    // planejamento (o X só existe quando há rota planejada; sem ele a fila
    // ficava sem jeito de limpar). Mesma confirmação/type "limpar-dia" de cima,
    // reusa performLimparDia via accept-confirmation — zero duplicação de API.
    if (action === "clear-day-request") { state.confirmation = { type: "limpar-dia", title: "Cancelar entregas abertas?", message: `Cancela ${openItems().length} entregas abertas. Agenda, entregues e financeiro não mudam.`, confirmLabel: "Cancelar abertas", danger: true, icon: "route" }; render(); return; }
    if (action === "begin-managed-route") await beginManagedRoute();
    // R1 (27/07) — o menu "Montar Rota" morreu; "Rotas salvas" é linha da tela
    // única e abre o único passo separado que restou.
    if (action === "day-entry-saved") { state.dayOrderStep = "saved"; state.dayOrderMode = "saved"; render(); void loadRouteModelos(); return; }
    // S1 21/07 — "Iniciar Leitura de Rota" (POST modo LEITURA). S3 21/07:
    // não fecha mais pra faixa da tela Rota — liga a gravação nativa
    // (leituraTrilhaIniciar, S2-CONTRATO-PONTE §1) e abre a tela viva própria.
    // S06 (fix 21/07) — garante a permissão de localização ANTES de criar a
    // sessão no backend: sem isso, numa instalação nova, o serviço nativo
    // gravava a trilha ZERO em silêncio. Checar antes do POST evita sessão
    // órfã no backend caso o usuário negue (nada é criado se não tem GPS).
    if (action === "day-entry-leitura") {
      if (state.leitura && state.leitura.modo === "LEITURA") { await openLeituraAtiva(); return; }
      if (state.leituraStarting) return;
      state.leituraStarting = true; render();
      const podeGravar = await ensureLeituraTrilhaLocationPermission();
      if (!podeGravar) { state.leituraStarting = false; render(); return; }
      try {
        const result = await H.api("/logistica/leitura/iniciar", { method: "POST", body: { modo: "LEITURA" } });
        state.leitura = { id: result.id, modo: result.modo || "LEITURA", startedAt: result.startedAt, count: Array.isArray(result.paradas) ? result.paradas.length : 0 };
        state.leituraTrilha = [];
        state.leituraUltimaAmostra = null;
        persistLeituraSession();
        leituraTrilhaIniciar(result.id);
      } catch (error) { toast(humanApiError(error), true); state.leituraStarting = false; render(); return; }
      state.leituraStarting = false;
      await openLeituraAtiva();
      return;
    }
    // 27/07 (dono, 2ª cobrança) — "montar-rota-agora" morreu: o toque no CHIP do
    // dia já monta (toggleManagedRouteDay → beginManagedRoute), sem CTA no meio.
    // R1 (27/07) — Voltar das Rotas salvas cai de novo na tela única.
    if (action === "back-route-order") { state.dayOrderStep = null; render(); return; }
    if (action === "apply-route-modelo") {
      // O clique que fecha o toque-longo de excluir NÃO pode sair rodando a rota.
      if (ignoredRouteModeloClickId !== null) { ignoredRouteModeloClickId = null; return; }
      const modelo = (state.routeModelos || []).find(m => String(m.id) === target.dataset.modeloId);
      if (!modelo) return;
      // F2 (PR20072026-ROTA-SALVA) — aplicar rota salva agora RODA A LISTA EXATA:
      // chama o endpoint que MATERIALIZA as entregas válidas do modelo e devolve
      // os deliveryIds na ordem salva. O backend só usa snapshot/plano compatível;
      // não mistura vínculos de produto de outros dias.
      if (state.dayStarting) return;
      // 🔴 ITEM 1 (28/07) — "ao clicar no dia, OU EM ROTAS SALVAS": rota salva com
      // dia fixo passa pelo mesmo portão de endereços. Rota salva SEM dia (lista
      // livre) não tem roster de agenda pra conferir — segue direto, e a régua
      // volta a valer na conferência da rota montada.
      if (Number.isInteger(Number(modelo.diaSemana)) && Number(modelo.diaSemana) >= 1 && Number(modelo.diaSemana) <= 7) {
        if (!(await checarEnderecosAntesDeMontar([Number(modelo.diaSemana)]))) return;
      }
      state.dayStarting = true; render();
      showLoading("Montando a rota…");
      try {
        const result = await H.api(`/logistica/rota-modelos/${encodeURIComponent(modelo.id)}/gerar`, { method: "POST", body: { date: operationalDate() } });
        const deliveryIds = [...new Set((result && Array.isArray(result.deliveryIds) ? result.deliveryIds : []).map(String))];
        const avisos = (result && Array.isArray(result.avisos)) ? result.avisos : [];
        if (!deliveryIds.length) { toast(avisos[0] || "Nenhuma entrega para esta rota.", true); return; }
        setRouteSelection(deliveryIds);
        setRouteOrdemManual(deliveryIds);
        // R1 (27/07) — rota salva também fica NA tela única: volta pro passo
        // principal e a conferência renderiza ali (chips sem dia carimbado —
        // rota de modelo não é rota "por dia").
        state.dayOrderStep = null;
        state.dayOrderMode = "saved";
        clearDiasAdicionados();
        render();
        // planeja com a lista+ordem exatas (generateToday=false: NÃO gera recorrência
        // do dia; as entregas já foram materializadas pelo /gerar acima).
        await startRoute(true, false, deliveryIds);
        if (avisos.length) toast(avisos.length === 1 ? avisos[0] : `${avisos.length} cliente(s) pulado(s).`);
      } catch (error) { toast(humanApiError(error), true); }
      finally { hideLoading(); state.dayStarting = false; render(); }
      return;
    }
    // S4 25/07 (PR25072026-ROTA-CONFERIDA) — ações da tela de conferência
    // (lista + mini-ficha). Ver bloco "ROTA-CONFERIDA — S4" perto de
    // routeEngineBanner pras funções chamadas aqui.
    if (action === "conferencia-tentar-de-novo") { await recarregarConferencia(); return; }
    // 🔴 ITEM 1 (28/07) — ações da tela "Endereços com erro".
    if (action === "checagem-fechar") { state.checagem = null; render(); return; }
    if (action === "checagem-verificar") { await recarregarChecagem(); return; }
    if (action === "checagem-remover-rota") {
      const c = state.checagem;
      const ids = [...new Set((((c && c.dados && c.dados.problemas) || []).map(p => String(p.customerProfileId)).filter(Boolean)))];
      if (!c || !ids.length) return;
      // Só HOJE: nada de cadastro. Os clientes ficam de fora da montagem que vem
      // agora (a seleção da rota é quem manda no que entra — mesmo mecanismo de
      // "Minha ordem"/rota salva), e o dia deles continua salvo pra próxima.
      state.rotaExcluidos = ids;
      state.daySelection = c.dias;
      state.checagem = null;
      render();
      toast(`${ids.length} ${ids.length === 1 ? "cliente fica" : "clientes ficam"} fora da rota de hoje.`);
      void beginManagedRoute();
      return;
    }
    if (action === "checagem-remover") {
      const c = state.checagem;
      const quantos = ((c && c.dados && c.dados.problemas) || []).length;
      if (!quantos) return;
      // Mexer no dia do cliente é escrita de cadastro: confirma antes (mesma
      // moldura .app-confirm de toda ação destrutiva do app).
      state.confirmation = {
        type: "checagem-remover",
        title: "Remover este dia do cadastro?",
        message: `${quantos} ${quantos === 1 ? "cliente perde" : "clientes perdem"} este dia no cadastro e não voltam sozinhos.`,
        confirmLabel: "Remover",
        danger: true,
        icon: "users",
      };
      render();
      return;
    }
    if (action === "checagem-abrir") {
      const id = String(target.dataset.clienteId || "");
      if (!id) return;
      showLoading("Abrindo o cadastro…");
      try {
        if (!(state.clients || []).length) await loadClients(true, true);
        const daTela = ((state.checagem && state.checagem.dados && state.checagem.dados.problemas) || []).find(x => String(x.customerProfileId) === id);
        const cliente = (state.clients || []).find(c => String(c.id) === id) || { id, nome: (daTela && daTela.nome) || "Cliente" };
        // Volta pra tela de erros quando o cadastro fechar (ver closeOverlay).
        state.checagemRetorno = true;
        openClientEditor(cliente);
      } catch (error) { toast(humanApiError(error), true); }
      finally { hideLoading(); }
      return;
    }
    // R2 (27/07) — "+" rota rápida (CEP+número via CNEFE, ou toque no mapa).
    if (action === "montagem-rapida") { state.montagemRapida = { origem: "cep", contexto: "montagem", cep: "", numero: "", nome: "", lat: null, lng: null, resolvido: null, buscando: false, checando: false, salvando: false, erro: "", duplicado: null }; render(); return; }
    // 28/07 (dono, item 4) — mesmo passo, aberto pelo "+" da tela Rota: aqui ele
    // ganha o "No caminho × Primeira parada" e encaixa na rota que está de pé.
    if (action === "rota-rapida") { state.montagemRapida = { origem: "cep", contexto: "rota", posicao: "perto", cep: "", numero: "", nome: "", lat: null, lng: null, resolvido: null, buscando: false, checando: false, salvando: false, erro: "", duplicado: null }; showModal("rota-rapida"); return; }
    if (action === "rota-rapida-posicao") { if (state.montagemRapida) { state.montagemRapida.posicao = target.dataset.posicao === "primeira" ? "primeira" : "perto"; render(); } return; }
    if (action === "rota-rapida-modo") { if (state.montagemRapida) { state.montagemRapida.modo = target.dataset.modo === "cadastro" ? "cadastro" : "direcao"; state.montagemRapida.erro = ""; render(); } return; }
    if (action === "montagem-rapida-fechar") { if (state.modal === "rota-rapida") { state.montagemRapida = null; await closeOverlay("modal"); return; } state.montagemRapida = null; render(); return; }
    if (action === "montagem-rapida-buscar") { await montagemRapidaBuscar(); return; }
    if (action === "montagem-rapida-confirmar") { await montagemRapidaConfirmar(); return; }
    // 27/07 (dono) — salvar a sequência alinhada na mão como rota salva.
    if (action === "montagem-salvar-rota") { state.montagemSalvar = { nome: "", salvando: false }; render(); return; }
    if (action === "montagem-salvar-fechar") { if (state.montagemSalvar && state.montagemSalvar.salvando) return; state.montagemSalvar = null; render(); return; }
    if (action === "montagem-salvar-confirmar") { await montagemSalvarConfirmar(); return; }
    if (action === "conferencia-continuar") {
      const rc = state.rotaConferencia;
      if (!rc || rc.loading) return;
      // 26/07 (fusão) — ordem mexida nas setas vira a rota REAL antes de fechar:
      // um replanejar só, com a ordem final (o conferir já rodava em dry-run).
      if (rc.ordemManual && rc.ordemManual.length) {
        try {
          const body = { date: operationalDate(), deliveryIds: rc.ordemManual, ordemManual: rc.ordemManual };
          if (rc.origem) { body.origemLat = rc.origem.lat; body.origemLng = rc.origem.lng; }
          applyRouteEngineState(await H.api("/logistica/rota/planejar", { method: "POST", body }));
        } catch (error) { toast(humanApiError(error), true); return; }
      }
      rc.confirmada = true;
      marcarRotaAceita();
      // S5 25/07 — "Aprovar rota": concluir a conferência (Lei 7 "vermelho
      // nunca bloqueia") CONGELA a ordem revisada via o mesmo mecanismo de
      // "Minha ordem"/"Rota salva" (setRouteOrdemManual); a origem usada no
      // conferir aprovado viaja junto (rc.origem, ver recarregarConferencia).
      if (rc.data && Array.isArray(rc.data.paradas) && rc.data.paradas.length) {
        setRouteOrdemManual(rc.data.paradas.map(p => String(p.id)), rc.origem);
      }
      await closeOverlay("modal");
      // 26/07 (dono) — CONFIRMAR não é o Play: o débito acontece no confirmar
      // (backend), e o motorista tem que cair na tela Rota com a rota montada,
      // pronta pro Play — sem passo extra, sem toast mandando ele fazer mais
      // nada. O fechamento do cartão já devolve a tela de baixo, que nos
      // caminhos de hoje é a Rota; este navigateTo é a garantia de que é
      // SEMPRE ela (mesmo idioma de openNextStop, ~L6100) caso um caminho
      // futuro planeje a rota de outra tela.
      if (state.screen !== "route") navigateTo("route");
      if (rc.ordemManual && rc.ordemManual.length) await refresh(true);
      // R8 (27/07) — o Aceitar é quem debita: o painel do dia atualiza na hora.
      void loadCreditosDia(true);
      return;
    }
    if (action === "conferencia-mover") {
      const rc = state.rotaConferencia;
      if (!rc || !rc.data || rc.loading) return;
      const ids = (rc.data.paradas || []).map(p => String(p.id));
      const i = ids.indexOf(String(target.dataset.paradaId));
      const j = target.dataset.dir === "up" ? i - 1 : i + 1;
      if (i === -1 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      rc.ordemManual = ids;
      await recarregarConferencia();
      return;
    }
    if (action === "conferencia-reconhecer") {
      const rc = state.rotaConferencia;
      if (!rc) return;
      const id = String(target.dataset.paradaId);
      if (rc.acknowledged.has(id)) rc.acknowledged.delete(id); else rc.acknowledged.add(id);
      render();
      return;
    }
    if (action === "conferencia-abrir-ficha") {
      const rc = state.rotaConferencia;
      if (!rc || !rc.data) return;
      const id = String(target.dataset.paradaId);
      const parada = (rc.data.paradas || []).find(p => String(p.id) === id);
      if (!parada) return;
      // 27/07 (dono) — a ficha "Como resolver?" MORREU: tocar na parada abre
      // DIRETO o cadastro real do cliente (o antigo "Corrigir endereço"). O
      // toque de ciência continua no switch da própria linha; tirar da rota
      // continua pelo caminho de sempre da tela Rota.
      rc.ficha = { paradaId: id, parada, item: allRouteItems().find(it => String(it.id) === id) || null };
      await abrirFichaComEditor(false);
      return;
    }
    // S5 25/07 — "Recalcular" do popup de drift de origem (ver
    // avisarDriftOrigemAprovada): a ordem aprovada não faz mais sentido
    // geográfico daqui, descarta e replaneja do zero com o GPS atual; flag ON
    // reabre a conferência sozinha (afterRoutaPlanejada, dentro de startRoute/
    // beginManagedRoute). NUNCA chama iniciar/billing — só planeja de novo.
    if (action === "rota-origem-recalcular") {
      const payload = (state.confirmation && state.confirmation.payload) || {};
      state.confirmation = null;
      clearRouteOrdemManual();
      render();
      if (payload.fn === "begin-managed-route") await beginManagedRoute();
      else await startRoute(true, false, payload.deliveryIds);
      return;
    }
    // F3.4 — toques nos chips do header.
    if (action === "chip-rede") { toast(netOnline() ? "Rede online." : "Sem rede. As alterações sincronizam quando o sinal voltar.", !netOnline()); return; }
    // R6 (27/07) — chip Motor: frase de motorista, zero jargão técnico.
    if (action === "chip-motor") {
      if (motorChipClass() === "is-warn") toast("Motor de rotas ainda não verificado.");
      else toast(motorDegradadoPorRede() ? "Sem cálculo pelas ruas agora." : "Motor de rotas online.", motorDegradadoPorRede());
      return;
    }
    if (action === "chip-gps") {
      if (gpsChipClass() === "is-ok") { toast("GPS ativo."); return; }
      if (H.requestLocationPermission) { H.requestLocationPermission(); toast("Confirme a permissão de localização."); }
      else toast("Ative a localização do aparelho.", true);
      return;
    }
    // S5 (PR22072026-APP-SOUNDS) — "Duas portas, uma folha" (S5-PREFERENCIA.md):
    // o chip do header e a linha "Sons" de Ajustes abrem o MESMO showModal.
    if (action === "chip-som" || action === "open-sons") { showModal("sons"); return; }
    if (action === "toggle-sound-master") {
      persistSoundPrefs({ ...soundPrefsLocal(), master: !soundMasterOn() });
      render();
      return;
    }
    if (action === "toggle-sound-voz") {
      const next = !soundVozOn();
      persistSoundPrefs({ ...soundPrefsLocal(), voz: next });
      // Mesma cortesia do "nav-mute-toggle" (ver mais abaixo): desligar cala
      // NA HORA qualquer fala já em curso, não só as próximas — sem isto o
      // motorista desliga e a voz continua terminando a frase sozinha.
      if (!next) H.speakStop();
      render();
      return;
    }
    if (action === "toggle-sound-item") {
      const key = target.dataset.soundKey; if (!key) return;
      const atual = soundPrefsLocal(); const off = new Set(atual.off || []);
      if (off.has(key)) off.delete(key); else off.add(key);
      persistSoundPrefs({ ...atual, off: [...off] });
      render();
      return;
    }
    // Prévia (▶): não mexe em preferência nenhuma, só toca — o gate
    // `preview=true` do HbxSoundEngine é quem decide o que ainda vale (nunca
    // durante ligação/voz em curso, ver S5-PREFERENCIA.md).
    if (action === "preview-sound") { const key = target.dataset.soundKey; if (key) H.soundPreview(key); return; }
    // F4 — auto-update.
    if (action === "app-update") { if (state.updateInfo) showModal("app-update"); return; }
    if (action === "check-update") { toast("Verificando…", false, { mudo: true }); void checkAppUpdate(true); return; }
    // 22/07 — marca a INTENÇÃO antes de sair pro Android: quem toca aqui já
    // disse que quer atualizar. Na volta, retomarUpdatePosPermissao() usa isso
    // pra emendar o download sozinho em vez de deixar o dono num botão morto.
    if (action === "update-permitir") { state.updateAwaitingPermission = true; if (typeof HBXAndroid !== "undefined" && HBXAndroid.openInstallPermission) HBXAndroid.openInstallPermission(); return; }
    if (action === "update-instalar") { startAppUpdate(); return; }
    // ——— Editor da rota salva. Só mexe no rascunho; PATCH só no "Salvar".
    if (action === "edit-route-modelo") { if (!isAdmin()) return; await abrirRouteModeloEditor(target.dataset.modeloId); return; }
    if (action === "rme-fechar") { state.routeModeloEditor = null; await closeOverlay("modal"); return; }
    if (action === "rme-voltar-paradas") { const e = state.routeModeloEditor; if (!e) return; e.step = "paradas"; e.paradaIndex = -1; e.produtoPicker = false; render(); return; }
    if (action === "rme-mover") {
      const e = state.routeModeloEditor; if (!e) return;
      const from = Number(target.dataset.index); const to = from + Number(target.dataset.delta);
      if (!(from >= 0 && to >= 0 && to < e.paradas.length)) return;
      const [movida] = e.paradas.splice(from, 1); e.paradas.splice(to, 0, movida);
      H.vibrate(8); render(); return;
    }
    if (action === "rme-add-cliente") {
      const e = state.routeModeloEditor; if (!e) return;
      e.step = "cliente"; state.leituraClienteQuery = ""; render(); return;
    }
    if (action === "rme-editar-itens") {
      const e = state.routeModeloEditor; if (!e) return;
      // O clique que fecha o toque-longo não pode abrir os itens da parada que
      // acabou de sair (os índices já andaram).
      if (ignoredRmeParadaClickIndex !== null) { ignoredRmeParadaClickIndex = null; return; }
      e.paradaIndex = Number(target.dataset.index); e.step = "itens"; e.produtoPicker = false; render(); return;
    }
    if (action === "rme-produto-abrir-picker") { const e = state.routeModeloEditor; if (!e) return; e.produtoPicker = true; render(); return; }
    if (action === "rme-produto-fechar-picker") { const e = state.routeModeloEditor; if (!e) return; e.produtoPicker = false; render(); return; }
    if (action === "rme-produto-escolher") {
      const e = state.routeModeloEditor; if (!e) return;
      const parada = e.paradas[e.paradaIndex]; if (!parada) return;
      const productId = Number(target.dataset.productId);
      const produto = (state.products || []).find(p => String(p.id) === String(productId));
      if (!Array.isArray(parada.itens)) parada.itens = [];
      parada.itens.push({ productId, qtd: 1, valorUnit: Number(produto && produto.precoCatalogo) || 0 });
      e.produtoPicker = false; render(); return;
    }
    if (action === "rme-item-qtd") {
      const e = state.routeModeloEditor; if (!e) return;
      const parada = e.paradas[e.paradaIndex]; if (!parada) return;
      const item = (parada.itens || []).find(i => String(i.productId) === String(target.dataset.productId));
      if (!item) return;
      item.qtd = Math.max(1, item.qtd + Number(target.dataset.delta)); render(); return;
    }
    if (action === "rme-item-remover") {
      const e = state.routeModeloEditor; if (!e) return;
      const parada = e.paradas[e.paradaIndex]; if (!parada) return;
      parada.itens = (parada.itens || []).filter(i => String(i.productId) !== String(target.dataset.productId));
      render(); return;
    }
    if (action === "rme-salvar") { await salvarRouteModeloEditor(); return; }
    if (action === "delete-route-modelo") {
      const modelo = (state.routeModelos || []).find(m => String(m.id) === target.dataset.modeloId);
      if (!modelo) return;
      state.confirmation = { type: "delete-route-modelo", itemId: modelo.id, title: "Excluir rota salva?", message: `Apaga "${modelo.nome || "Esta rota"}". Clientes, Agenda, entregas e financeiro não mudam.`, confirmLabel: "Excluir rota", danger: true, icon: "route" };
      render();
      return;
    }
    if (action === "stop-route") { pauseRouteOnDevice(); render(); toast("Rota pausada."); }
    if (action === "resume-route") { await resumeRouteOnDevice(); }
    if (action === "show-map") abrirNavegacao(openItems()[0]);
    if (action === "maps" && state.selected) abrirNavegacao(state.selected);
    if (action === "call" && state.selected) H.call(state.selected.cliente.phone || state.selected.contato && state.selected.contato.phone);
    if (action === "whatsapp" && state.selected) H.whatsapp(state.selected.cliente.phone || state.selected.contato && (state.selected.contato.whatsapp || state.selected.contato.phone), `Olá, ${state.selected.cliente.nome || "tudo bem"}? Sua entrega está a caminho.`);
    if (action === "photo") document.getElementById("proof-photo")?.click();
    if (action === "call-stop" || action === "wa-stop" || action === "confirm-stop") { event.preventDefault(); event.stopPropagation(); const next = openItems()[0]; if (!next) return; if (action === "call-stop") H.call(next.cliente.phone); if (action === "wa-stop") H.whatsapp(next.cliente.phone, `Olá, ${next.cliente.nome || "tudo bem"}? Sua entrega está a caminho.`); if (action === "confirm-stop") confirmDelivery(next); }
    if (action === "confirm" && state.selected) confirmDelivery(state.selected);
    if (action === "statement") { try { state.statement = await H.api("/logistica/creditos/extrato"); showModal("statement"); } catch (error) { toast(humanApiError(error), true); } }
    // R8 (27/07) — liga/desliga o painel de créditos do dia (nasce LIGADO).
    if (action === "toggle-creditos-panel") { H.cache.set("logistica-creditos-panel-oculto", !creditosPanelOculto()); if (!creditosPanelOculto()) void loadCreditosDia(true); render(); return; }
    if (action === "open-recarga") { openRecarga(); return; }
    // S7 — "Atualizar" do motorista não tem extrato pra chamar (403 pra ele):
    // dispara um refresh(true) normal, que já busca /logistica/config de novo e
    // reaplica applyDriverCreditsLock — mesmo botão, caminho por papel.
    if (action === "credits-lock-refresh") {
      if (isAdmin()) { toast("Atualizando saldo…", false, { mudo: true }); void refreshCreditsLock(); }
      else { toast("Atualizando…", false, { mudo: true }); void refresh(true); }
    }
    // 28/07 (dono) — fecha o cartão de recusa da rota (routeNoticeOverlay).
    if (action === "route-notice-close") { state.routeNotice = null; render(); return; }
    if (action === "logout") { state.confirmation = { type: "logout", title: "Desvincular aparelho?", message: "Este aparelho precisará ser vinculado novamente para acessar o HBX Logística.", confirmLabel: "Desvincular", danger: true, icon: "logout" }; render(); }
    // ---- PR20072026 W2 — Leitura de Rota ----
    // A entrada da leitura parte de "day-entry-leitura".
    if (action === "leitura-cancelar") { promptCancelLeitura(); return; }
    if (action === "leitura-finalizar-fechar") { await closeLeituraParadaModal(); return; }
    // S3.2 — popup de pausa: resolverPausaLeitura SEMPRE, aceitando ou
    // dispensando (S2-CONTRATO-PONTE §1 — senão o detector nativo fica "preso").
    if (action === "leitura-pausa-salvar") {
      const pausa = state.leituraPausaPendente;
      if (!pausa) return;
      leituraPausaResolver(true);
      state.leituraPausaPendente = null;
      openLeituraParada({ lat: pausa.lat, lng: pausa.lng, accuracy: null, capturadoEm: new Date(Number(pausa.ts) || Date.now()).toISOString() });
      if (pausa.clienteProximo && pausa.clienteProximo.id) {
        const client = (state.clients || []).find(c => String(c.id) === String(pausa.clienteProximo.id)) || { id: pausa.clienteProximo.id, nome: pausa.clienteProximo.nome };
        chooseLeituraClient(client);
      }
      return;
    }
    if (action === "leitura-pausa-dispensar") {
      if (!state.leituraPausaPendente) return;
      leituraPausaResolver(false);
      state.leituraPausaPendente = null;
      render();
      return;
    }
    if (action === "leitura-cadastrar-local") { await startLeituraGpsCapture(); return; }
    if (action === "leitura-voltar") { if (!(await leituraGoBack())) await closeLeituraParadaModal(); return; }
    if (action === "leitura-tipo-existente") { await changeLeituraStep("existente"); return; }
    if (action === "leitura-tipo-novo") {
      const capture = state.leituraCapture;
      if (capture) Object.assign(state.leituraNovoDraft, { lat: capture.lat, lng: capture.lng, geoFonte: "gps_cadastro", gpsAccuracy: Number.isFinite(Number(capture.accuracy)) ? Number(capture.accuracy) : null });
      await changeLeituraStep("novo", () => { state.leituraNovoEditing = false; });
      if (capture && validCoordinates(capture.lat, capture.lng)) {
        const point = await reverseGeocodeLeitura(capture.lat, capture.lng);
        if (point && state.leituraStep === "novo") { Object.assign(state.leituraNovoDraft, point); render(); }
      }
      return;
    }
    if (action === "leitura-novo-endereco-editar") { await changeLeituraStep("novo", () => { state.leituraNovoEditing = true; }); return; }
    if (action === "leitura-novo-endereco-fechar") { await changeLeituraStep("novo", () => { state.leituraNovoEditing = false; }); return; }
    if (action === "leitura-escolher-cliente") {
      const client = (state.clients || []).find(c => String(c.id) === String(target.dataset.clientId));
      if (!client) return;
      // O card de cliente é o MESMO nos dois seletores; no editor de rota salva
      // ele acrescenta uma parada em vez de abrir o passo da leitura.
      const editor = state.routeModeloEditor;
      if (state.modal === "route-modelo-editor" && editor && editor.step === "cliente") {
        editor.paradas.push({ customerProfileId: String(client.id), itens: [] });
        editor.step = "paradas";
        state.leituraClienteQuery = "";
        H.vibrate(8);
        render();
        return;
      }
      chooseLeituraClient(client);
      return;
    }
    // F3.2 — decisões do passo endereço. `chosen` = endereço que será gravado
    // (do GPS/reverse OU digitado à mão); numero vem no passo seguinte.
    if (action === "leitura-end-usar" || action === "leitura-end-atualizar") {
      const e = state.leituraEnd || {}; const r = e.reverse || {};
      e.chosen = { endereco: r.endereco || "", bairro: r.bairro || "", cidade: r.cidade || "", uf: String(r.uf || "").toUpperCase(), cep: r.cep || "" };
      e.chosenTyped = false;
      e.decision = "atualizar"; state.leituraEnd = e;
      await changeLeituraStep("numero"); return;
    }
    if (action === "leitura-end-manter") { const e = state.leituraEnd || {}; e.decision = "manter"; e.chosen = null; state.leituraEnd = e; await changeLeituraStep("numero"); return; }
    if (action === "leitura-end-retry") {
      const cap = state.leituraCapture;
      if (!cap || !validCoordinates(cap.lat, cap.lng)) return;
      const client = state.leituraSelectedClient || { numero: state.leituraNovoDraft.numero || "" };
      const requestId = ++leituraEnderecoRequestId;
      state.leituraEnd = { loading: true, loadingStage: "signal", reverse: null, decision: null, numero: String((state.leituraEnd && state.leituraEnd.numero) || client.numero || "") };
      render();
      void startLeituraEndereco(client, cap, requestId);
      return;
    }
    // Digitar/corrigir endereço à mão: semeia o formulário com o GPS/cadastro.
    if (action === "leitura-end-digitar") {
      const e = { ...(state.leituraEnd || {}) }; const r = e.reverse || {}; const c = state.leituraSelectedClient || {};
      const seed = (r.endereco || r.cidade) ? r : c;
      e.form = { endereco: seed.endereco || "", bairro: seed.bairro || "", cidade: seed.cidade || "", uf: String(seed.uf || "").toUpperCase(), cep: seed.cep || "" };
      e.editing = true; await changeLeituraStep("endereco", () => { state.leituraEnd = e; }); return;
    }
    if (action === "leitura-end-cancelar-digitar") { const e = { ...(state.leituraEnd || {}), editing: false }; await changeLeituraStep("endereco", () => { state.leituraEnd = e; }); return; }
    if (action === "leitura-end-salvar-digitado") {
      const e = state.leituraEnd || {};
      const val = id => { const el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; };
      e.chosen = { endereco: val("lend-endereco"), bairro: val("lend-bairro"), cidade: val("lend-cidade"), uf: val("lend-uf").toUpperCase(), cep: val("lend-cep") };
      e.form = { ...e.chosen };
      e.chosenTyped = true;
      e.decision = "atualizar"; e.editing = false; state.leituraEnd = e;
      await changeLeituraStep("numero"); return;
    }
    if (action === "leitura-end-voltar-numero") { await changeLeituraStep("endereco"); return; }
    if (action === "leitura-numero-confirmar") {
      const input = document.getElementById("leitura-numero-input");
      const numero = String(input ? input.value : (state.leituraEnd && state.leituraEnd.numero) || "").trim();
      if (state.leituraEnd) state.leituraEnd.numero = numero;
      await persistLeituraEndereco(numero);
      await changeLeituraStep("telefone"); return;
    }
    if (action === "leitura-telefone-corrigir") { await changeLeituraStep("telefone", () => { state.leituraTelefoneCorrigindo = true; }); return; }
    if (action === "leitura-telefone-confirmar") { state.leituraTelefoneConfirmado = true; await changeLeituraStep("produto"); return; }
    if (action === "leitura-telefone-salvar") {
      const input = document.getElementById("leitura-telefone-input");
      const value = formatPhone(input ? input.value : state.leituraTelefoneValue);
      if (state.leituraSelectedClient && value) {
        try {
          const selectedClient = state.leituraSelectedClient;
          const detail = await H.api(`/nucleo/clientes/${encodeURIComponent(selectedClient.id)}`);
          await saveClientPhone({ ...selectedClient, contatoPrincipalId: detail && detail.contatoPrincipalId }, value);
        } catch (error) {
          toast(humanApiError(error), true);
          return;
        }
      }
      state.leituraTelefoneValue = value;
      state.leituraTelefoneConfirmado = !!value;
      state.leituraTelefoneCorrigindo = false;
      if (state.leituraSelectedClient) state.leituraSelectedClient = { ...state.leituraSelectedClient, phone: value };
      else state.leituraNovoDraft.telefone = value;
      await changeLeituraStep("produto");
      return;
    }
    if (action === "leitura-produto-abrir-picker") { await changeLeituraStep("produto", () => { state.leituraProdutoPicker = true; state.leituraProdutoQuery = ""; }); return; }
    if (action === "leitura-produto-fechar-picker") { await changeLeituraStep("produto", () => { state.leituraProdutoPicker = false; state.leituraProdutoQuery = ""; }); return; }
    // F3.3 — tocou no preço travado (módulo Financeiro desligado). Admin: oferece
    // ativar na hora; não-admin: só orienta (Lei do Vendedor — preço é admin-only).
    if (action === "leitura-preco-bloqueado") {
      if (isAdmin()) {
        state.confirmation = { type: "ativar-financeiro", title: "Preço faz parte do Financeiro", message: "O módulo Financeiro está desligado. Deseja ativá-lo agora para informar preços?", confirmLabel: "Sim, ativar", cancelLabel: "Agora não", icon: "wallet" };
      } else {
        state.confirmation = { type: "info", title: "Preço bloqueado", message: "O módulo Financeiro está desligado. Peça ao administrador para ativá-lo.", confirmLabel: "Entendi", icon: "wallet" };
      }
      render();
      return;
    }
    if (action === "leitura-item-adicionar") {
      const product = (state.products || []).find(p => String(p.id) === String(target.dataset.productId));
      if (!product) return;
      // Mesmo card de produto do app; no editor de rota salva ele fixa o item na
      // parada em vez de entrar na leitura em andamento.
      const editorProduto = state.routeModeloEditor;
      if (state.modal === "route-modelo-editor" && editorProduto) {
        const parada = editorProduto.paradas[editorProduto.paradaIndex];
        if (!parada) return;
        if (!Array.isArray(parada.itens)) parada.itens = [];
        parada.itens.push({ productId: Number(product.id), qtd: 1, valorUnit: Number(product.precoCatalogo) || 0 });
        editorProduto.produtoPicker = false;
        H.vibrate(10);
        render();
        return;
      }
      state.leituraItens.push({ productId: product.id, nome: product.nome || product.name || "Produto", unidade: product.unidade || "unidade", qtd: 1, valorUnit: null });
      state.leituraProdutoPicker = false;
      state.leituraProdutoQuery = "";
      H.vibrate(10);
      render();
      return;
    }
    if (action === "leitura-item-qtd") {
      const item = state.leituraItens.find(i => String(i.productId) === String(target.dataset.productId));
      if (item) { item.qtd = Math.max(1, Number(item.qtd || 1) + Number(target.dataset.delta || 0)); render(); }
      return;
    }
    if (action === "leitura-proximo") {
      if (!state.leitura || !state.leituraItens.length || !state.leituraCapture) return;
      await startLeituraObs();
      return;
    }
    if (action === "leitura-obs-salvar") { await saveLeituraParada(); return; }
    if (action === "leitura-finalizar-iniciar") {
      if (!state.leitura) return;
      await flushLeituraQueue();
      const pending = leituraPendingCount();
      if (pending > 0) { toast(`${pending} parada(s) aguardando rede.`, true); return; }
      state.leituraFinalStep = "timeline";
      // Bug#3 — zera qualquer edição de parada pendente pra não reabrir o Resumo
      // com uma parada em modo-edição e rascunho velho vazado da vez anterior.
      state.leituraEditParadaId = null; state.leituraEditDraft = null;
      state.leituraResumoLoading = true; state.leituraResumoError = null; state.leituraResumo = null;
      showModal("leitura-finalizar");
      try { state.leituraResumo = await H.api(`/logistica/leitura/${encodeURIComponent(state.leitura.id)}/resumo`); }
      catch (error) { state.leituraResumoError = humanApiError(error); }
      state.leituraResumoLoading = false;
      render();
      return;
    }
    if (action === "leitura-novo-consultar-local") { await locateLeituraNovoAddress(); return; }
    if (action === "leitura-parada-editar") {
      // Guarda o clique-fantasma do touchend quando ESTA parada específica virou
      // hold (mesmo motivo do ignoredClientClickId — comparar o id, não só "não
      // é null": senão um hold em QUALQUER parada travava o Editar de todas as
      // outras até o próximo toque, porque a flag nunca era limpa por elas).
      if (ignoredLrtParadaClickId === target.dataset.paradaId) { ignoredLrtParadaClickId = null; return; }
      const parada = (state.leituraResumo && state.leituraResumo.paradas || []).find(p => String(p.id) === String(target.dataset.paradaId));
      if (!parada) return;
      state.leituraEditParadaId = parada.id;
      state.leituraEditDraft = { itens: (parada.itens || []).map(i => ({ productId: i.productId, qtd: Number(i.qtd || 1), valorUnit: Number(i.valorUnit ?? i.valor ?? 0) })) };
      render();
      return;
    }
    if (action === "leitura-parada-editar-cancelar") { state.leituraEditParadaId = null; state.leituraEditDraft = null; render(); return; }
    if (action === "leitura-parada-editar-qtd") {
      const draft = state.leituraEditDraft; if (!draft) return;
      const item = draft.itens.find(i => String(i.productId) === String(target.dataset.productId));
      if (item) { item.qtd = Math.max(1, Number(item.qtd || 1) + Number(target.dataset.delta || 0)); render(); }
      return;
    }
    if (action === "leitura-parada-editar-salvar") {
      const paradaId = state.leituraEditParadaId; const draft = state.leituraEditDraft;
      if (!paradaId || !draft || !state.leitura) return;
      try {
        await H.api(`/logistica/leitura/${encodeURIComponent(state.leitura.id)}/parada/${encodeURIComponent(paradaId)}`, { method: "PATCH", body: { itens: draft.itens } });
        state.leituraEditParadaId = null; state.leituraEditDraft = null;
        state.leituraResumo = await H.api(`/logistica/leitura/${encodeURIComponent(state.leitura.id)}/resumo`);
        toast("Parada atualizada.");
      } catch (error) { toast(humanApiError(error), true); }
      render();
      return;
    }
    // F1 — rota salva é LISTA LIVRE (sem dia): finalizar vai direto do resumo pro
    // nome. O dia da semana saiu do fluxo (recorrência é outra coisa, no cadastro).
    if (action === "leitura-ir-salvar") { state.leituraFinalStep = "nome"; state.leituraDiaEscolhido = null; void prepareLeituraNome(); render(); return; }
    if (action === "leitura-salvar-dia-voltar-nome") { state.leituraFinalStep = "timeline"; render(); return; }
  });
  app.addEventListener("touchstart", event => {
    const clientCard = event.target.closest("[data-client]");
    if (clientCard && event.touches.length === 1 && state.screen === "clients" && !state.modal && !state.selected) {
      const touch = event.touches[0]; const hold = { id: clientCard.dataset.client, el: clientCard, x: touch.clientX, y: touch.clientY, triggered: false, timer: null };
      hold.el.classList.add("is-hold-arming");
      hold.timer = setTimeout(() => { hold.triggered = true; hold.el.classList.remove("is-hold-arming"); hold.el.classList.add("is-holding"); H.vibrate(45); }, 950);
      clientHold = hold;
    }
    const productCard = event.target.closest("[data-client-product-id]");
    // Seta ↑↓ da quantidade não arma o toque-longo de excluir (o botão vive
    // DENTRO da linha desde 27/07).
    if (productCard && event.touches.length === 1 && !event.target.closest("button")) {
      const touch = event.touches[0]; const hold = { id: productCard.dataset.clientProductId, el: productCard, x: touch.clientX, y: touch.clientY, triggered: false, timer: null };
      // Mesmo padrão do clientHold: arma is-hold-arming na hora do touchstart
      // (vermelho progressivo); só aos 950ms vira is-holding + vibra. Ao soltar
      // abre a confirmação. Assim o toque longo nunca parece um clique que não
      // fez nada.
      hold.el.classList.add("is-hold-arming");
      hold.timer = setTimeout(() => { hold.triggered = true; hold.el.classList.remove("is-hold-arming"); hold.el.classList.add("is-holding"); H.vibrate(45); }, 950);
      clientProductHold = hold;
    }
    // Parada do editor de rota salva: mesmo gesto de sempre (arma vermelho aos
    // 950ms, vibra, e ao soltar tira da rota). Só no rascunho — nada de PATCH.
    const rmeParada = event.target.closest("[data-rme-parada]");
    if (rmeParada && event.touches.length === 1 && state.modal === "route-modelo-editor" && !event.target.closest("input")) {
      // A trava vale SÓ pro clique que fecha o toque-longo. Um toque novo começa
      // limpo — senão o hold que remove a parada engolia o próximo toque de boa fé.
      ignoredRmeParadaClickIndex = null;
      const touch = event.touches[0]; const hold = { id: rmeParada.dataset.rmeParada, el: rmeParada, x: touch.clientX, y: touch.clientY, triggered: false, timer: null };
      hold.el.classList.add("is-hold-arming");
      hold.timer = setTimeout(() => { hold.triggered = true; hold.el.classList.remove("is-hold-arming"); hold.el.classList.add("is-holding"); H.vibrate(45); }, 950);
      rmeParadaHold = hold;
    }
    // Produto fixado na parada: segurar tira (não há X).
    const rmeItem = event.target.closest("[data-rme-item]");
    if (rmeItem && event.touches.length === 1 && state.modal === "route-modelo-editor") {
      const touch = event.touches[0]; const hold = { id: rmeItem.dataset.rmeItem, el: rmeItem, x: touch.clientX, y: touch.clientY, triggered: false, timer: null };
      hold.el.classList.add("is-hold-arming");
      hold.timer = setTimeout(() => { hold.triggered = true; hold.el.classList.remove("is-hold-arming"); hold.el.classList.add("is-holding"); H.vibrate(45); }, 950);
      rmeItemHold = hold;
    }
    // Rota salva (lista de Salvos e Minhas rotas): segurar exclui a rota inteira.
    const routeModeloCard = event.target.closest("[data-route-modelo-hold]");
    if (routeModeloCard && event.touches.length === 1) {
      ignoredRouteModeloClickId = null;
      const touch = event.touches[0]; const hold = { id: routeModeloCard.dataset.routeModeloHold, el: routeModeloCard, x: touch.clientX, y: touch.clientY, triggered: false, timer: null };
      hold.el.classList.add("is-hold-arming");
      hold.timer = setTimeout(() => { hold.triggered = true; hold.el.classList.remove("is-hold-arming"); hold.el.classList.add("is-holding"); H.vibrate(45); }, 950);
      routeModeloHold = hold;
    }
    const target = event.target;
    const routeStop = target.closest("[data-route-stop]");
    if (routeStop && event.touches.length === 1 && !state.modal && !state.selected) {
      const touch = event.touches[0]; const hold = { id: routeStop.dataset.routeStop, el: routeStop, x: touch.clientX, y: touch.clientY, triggered: false, timer: null };
      hold.el.classList.add("is-hold-arming");
      hold.timer = setTimeout(() => { hold.triggered = true; hold.el.classList.remove("is-hold-arming"); hold.el.classList.add("is-holding"); H.vibrate(45); }, 950);
      routeStopHold = hold;
    }
    // Segurar pressionado no card de Produtos (só admin) arma o vermelho e vibra;
    // ao soltar abre a confirmação de arquivar. Espelha o padrão de Clientes/Rota.
    const catalogCard = target.closest("[data-product-id]");
    if (catalogCard && event.touches.length === 1 && state.screen === "products" && isAdmin() && !state.modal && !state.selected) {
      const touch = event.touches[0]; const hold = { id: catalogCard.dataset.productId, el: catalogCard, x: touch.clientX, y: touch.clientY, triggered: false, timer: null };
      hold.el.classList.add("is-hold-arming");
      hold.timer = setTimeout(() => { hold.triggered = true; hold.el.classList.remove("is-hold-arming"); hold.el.classList.add("is-holding"); H.vibrate(45); }, 950);
      productHold = hold;
    }
    // Parada do resumo da leitura: segurar remove (com confirmação, já
    // persistida via DELETE).
    const lrtParada = target.closest("[data-lrt-parada-hold]");
    if (lrtParada && event.touches.length === 1 && state.modal === "leitura-finalizar") {
      const touch = event.touches[0]; const hold = { id: lrtParada.dataset.lrtParadaHold, el: lrtParada, x: touch.clientX, y: touch.clientY, triggered: false, timer: null };
      hold.el.classList.add("is-hold-arming");
      hold.timer = setTimeout(() => { hold.triggered = true; hold.el.classList.remove("is-hold-arming"); hold.el.classList.add("is-holding"); H.vibrate(45); }, 950);
      lrtParadaHold = hold;
    }
    // Produto do passo "Produto" da leitura (state.leituraItens, rascunho local
    // antes de salvar a parada): segurar tira, sem confirmação — mesma régua do
    // rme-item. Toque começando no campo de preço NÃO arma o hold (o campo é
    // input de texto; segurar nele é seleção de texto do teclado, não exclusão).
    // Linha do histórico (modal "historico"): segurar 950ms abre a confirmação de
    // apagar. Mesmo gesto dos outros 7 holds.
    const historicoRow = target.closest("[data-historico-hold]");
    if (historicoRow && event.touches.length === 1 && state.modal === "historico") {
      const touch = event.touches[0]; const hold = { id: historicoRow.dataset.historicoHold, el: historicoRow, x: touch.clientX, y: touch.clientY, triggered: false, timer: null };
      hold.el.classList.add("is-hold-arming");
      hold.timer = setTimeout(() => { hold.triggered = true; hold.el.classList.remove("is-hold-arming"); hold.el.classList.add("is-holding"); H.vibrate(45); }, 950);
      historicoHold = hold;
    }
    const lrtItem = target.closest("[data-lrt-item-hold]");
    if (lrtItem && event.touches.length === 1 && !target.closest("input")) {
      const touch = event.touches[0]; const hold = { id: lrtItem.dataset.lrtItemHold, el: lrtItem, x: touch.clientX, y: touch.clientY, triggered: false, timer: null };
      hold.el.classList.add("is-hold-arming");
      hold.timer = setTimeout(() => { hold.triggered = true; hold.el.classList.remove("is-hold-arming"); hold.el.classList.add("is-holding"); H.vibrate(45); }, 950);
      lrtItemHold = hold;
    }
    if (event.touches.length !== 1 || state.modal || state.selected || !target.closest("[data-route-current]")) { touchStart = null; return; }
    const touch = event.touches[0];
    touchStart = { x: touch.clientX, y: touch.clientY, currentStopId: target.closest("[data-route-current]")?.dataset.routeCurrent || null };
  }, { passive: true });
  app.addEventListener("touchmove", event => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (clientHold && (Math.abs(touch.clientX - clientHold.x) > 12 || Math.abs(touch.clientY - clientHold.y) > 12)) { clearTimeout(clientHold.timer); clientHold.el.classList.remove("is-hold-arming", "is-holding"); clientHold = null; }
    if (clientProductHold && (Math.abs(touch.clientX - clientProductHold.x) > 12 || Math.abs(touch.clientY - clientProductHold.y) > 12)) { clearTimeout(clientProductHold.timer); clientProductHold.el.classList.remove("is-hold-arming", "is-holding"); clientProductHold = null; }
    if (routeStopHold && (Math.abs(touch.clientX - routeStopHold.x) > 12 || Math.abs(touch.clientY - routeStopHold.y) > 12)) { clearTimeout(routeStopHold.timer); routeStopHold.el.classList.remove("is-hold-arming", "is-holding"); routeStopHold = null; }
    if (rmeParadaHold && (Math.abs(touch.clientX - rmeParadaHold.x) > 12 || Math.abs(touch.clientY - rmeParadaHold.y) > 12)) { clearTimeout(rmeParadaHold.timer); rmeParadaHold.el.classList.remove("is-hold-arming", "is-holding"); rmeParadaHold = null; }
    if (rmeItemHold && (Math.abs(touch.clientX - rmeItemHold.x) > 12 || Math.abs(touch.clientY - rmeItemHold.y) > 12)) { clearTimeout(rmeItemHold.timer); rmeItemHold.el.classList.remove("is-hold-arming", "is-holding"); rmeItemHold = null; }
    if (routeModeloHold && (Math.abs(touch.clientX - routeModeloHold.x) > 12 || Math.abs(touch.clientY - routeModeloHold.y) > 12)) { clearTimeout(routeModeloHold.timer); routeModeloHold.el.classList.remove("is-hold-arming", "is-holding"); routeModeloHold = null; }
    if (productHold && (Math.abs(touch.clientX - productHold.x) > 12 || Math.abs(touch.clientY - productHold.y) > 12)) { clearTimeout(productHold.timer); productHold.el.classList.remove("is-hold-arming", "is-holding"); productHold = null; }
    if (lrtParadaHold && (Math.abs(touch.clientX - lrtParadaHold.x) > 12 || Math.abs(touch.clientY - lrtParadaHold.y) > 12)) { clearTimeout(lrtParadaHold.timer); lrtParadaHold.el.classList.remove("is-hold-arming", "is-holding"); lrtParadaHold = null; }
    if (lrtItemHold && (Math.abs(touch.clientX - lrtItemHold.x) > 12 || Math.abs(touch.clientY - lrtItemHold.y) > 12)) { clearTimeout(lrtItemHold.timer); lrtItemHold.el.classList.remove("is-hold-arming", "is-holding"); lrtItemHold = null; }
    if (historicoHold && (Math.abs(touch.clientX - historicoHold.x) > 12 || Math.abs(touch.clientY - historicoHold.y) > 12)) { clearTimeout(historicoHold.timer); historicoHold.el.classList.remove("is-hold-arming", "is-holding"); historicoHold = null; }
    if (touchStart && touchStart.currentStopId) {
      const current = document.querySelector(`[data-route-current="${touchStart.currentStopId}"]`);
      current?.classList.toggle("is-swiping-skip", touch.clientX - touchStart.x < -24 && Math.abs(touch.clientX - touchStart.x) > Math.abs(touch.clientY - touchStart.y));
    }
  }, { passive: true });
  app.addEventListener("touchend", event => {
    if (historicoHold) {
      clearTimeout(historicoHold.timer);
      const hold = historicoHold; historicoHold = null; hold.el.classList.remove("is-hold-arming", "is-holding");
      if (hold.triggered) {
        state.confirmation = { type: "apagar-historico", itemId: hold.id, title: "Apagar do histórico?", message: "Some só do histórico. A entrega e a cobrança continuam no financeiro.", confirmLabel: "Apagar", danger: true, icon: "calendar" };
        render();
        return;
      }
    }
    if (clientHold) {
      clearTimeout(clientHold.timer);
      const hold = clientHold; clientHold = null; hold.el.classList.remove("is-hold-arming", "is-holding");
      if (hold.triggered) { ignoredClientClickId = hold.id; touchStart = null; deleteClient(clientById(hold.id)); return; }
    }
    if (clientProductHold) {
      clearTimeout(clientProductHold.timer);
      const hold = clientProductHold; clientProductHold = null; hold.el.classList.remove("is-hold-arming", "is-holding");
      if (hold.triggered) { ignoredClientProductClickId = hold.id; void deleteClientProduct(state.clientProducts.find(item => item.id === hold.id)); return; }
    }
    if (rmeItemHold) {
      clearTimeout(rmeItemHold.timer);
      const hold = rmeItemHold; rmeItemHold = null; hold.el.classList.remove("is-hold-arming", "is-holding");
      const editor = state.routeModeloEditor;
      if (hold.triggered && editor) {
        const parada = editor.paradas[editor.paradaIndex];
        if (parada) {
          parada.itens = (parada.itens || []).filter(i => String(i.productId) !== String(hold.id));
          render();
          toast("Produto tirado da parada.");
        }
        return;
      }
    }
    if (routeModeloHold) {
      clearTimeout(routeModeloHold.timer);
      const hold = routeModeloHold; routeModeloHold = null; hold.el.classList.remove("is-hold-arming", "is-holding");
      if (hold.triggered) {
        ignoredRouteModeloClickId = hold.id;
        const modelo = (state.routeModelos || []).find(m => String(m.id) === String(hold.id));
        if (modelo) {
          state.confirmation = { type: "delete-route-modelo", itemId: modelo.id, title: "Excluir rota salva?", message: `Apaga "${modelo.nome || "Esta rota"}". Clientes, Agenda, entregas e financeiro não mudam.`, confirmLabel: "Excluir rota", danger: true, icon: "route" };
          render();
        }
        return;
      }
    }
    if (rmeParadaHold) {
      clearTimeout(rmeParadaHold.timer);
      const hold = rmeParadaHold; rmeParadaHold = null; hold.el.classList.remove("is-hold-arming", "is-holding");
      const editor = state.routeModeloEditor;
      if (hold.triggered && editor) {
        const index = Number(hold.id);
        const parada = editor.paradas[index];
        if (parada) {
          ignoredRmeParadaClickIndex = hold.id;
          editor.paradas.splice(index, 1);
          render();
          toast(`${rmeClienteNome(parada)} saiu da rota.`);
        }
        return;
      }
    }
    if (routeStopHold) {
      clearTimeout(routeStopHold.timer);
      const hold = routeStopHold; routeStopHold = null; hold.el.classList.remove("is-hold-arming", "is-holding");
      if (hold.triggered) {
        ignoredRouteStopClickId = hold.id;
        touchStart = null;
        void removeStopForToday(items().find(item => item.id === hold.id), "Retirado da rota pelo operador.");
        return;
      }
    }
    if (productHold) {
      clearTimeout(productHold.timer);
      const hold = productHold; productHold = null; hold.el.classList.remove("is-hold-arming", "is-holding");
      if (hold.triggered) { ignoredProductClickId = hold.id; archiveProductByHold((state.products || []).find(p => String(p.id) === String(hold.id))); return; }
    }
    if (lrtParadaHold) {
      clearTimeout(lrtParadaHold.timer);
      const hold = lrtParadaHold; lrtParadaHold = null; hold.el.classList.remove("is-hold-arming", "is-holding");
      if (hold.triggered) {
        ignoredLrtParadaClickId = hold.id;
        state.confirmation = { type: "remove-leitura-parada", itemId: hold.id, title: "Remover da leitura?", message: "Remove esta parada da leitura atual. Cliente e Agenda não mudam.", confirmLabel: "Remover parada", danger: true, icon: "route" };
        render();
        return;
      }
    }
    if (lrtItemHold) {
      clearTimeout(lrtItemHold.timer);
      const hold = lrtItemHold; lrtItemHold = null; hold.el.classList.remove("is-hold-arming", "is-holding");
      if (hold.triggered) {
        state.leituraItens = state.leituraItens.filter(i => String(i.productId) !== String(hold.id));
        render();
        toast("Produto tirado.");
        return;
      }
    }
    if (!touchStart || state.modal || state.selected || event.changedTouches.length !== 1) { touchStart = null; return; }
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    const currentStopId = touchStart.currentStopId;
    touchStart = null;
    document.querySelector("[data-route-current].is-swiping-skip")?.classList.remove("is-swiping-skip");
    if (currentStopId && dx < -64 && Math.abs(dx) > Math.abs(dy)) {
      ignoredRouteStopClickId = currentStopId;
      void removeStopForToday(items().find(item => item.id === currentStopId), "Cliente ausente; pulado hoje.", "Cliente não está no local? Vamos pular somente a entrega de hoje e abrir a próxima parada. O cliente e a recorrência continuam cadastrados.");
      return;
    }
  }, { passive: true });
  app.addEventListener("touchcancel", () => { if (rmeParadaHold) { clearTimeout(rmeParadaHold.timer); rmeParadaHold.el.classList.remove("is-hold-arming", "is-holding"); } rmeParadaHold = null; if (rmeItemHold) { clearTimeout(rmeItemHold.timer); rmeItemHold.el.classList.remove("is-hold-arming", "is-holding"); } rmeItemHold = null; if (routeModeloHold) { clearTimeout(routeModeloHold.timer); routeModeloHold.el.classList.remove("is-hold-arming", "is-holding"); } routeModeloHold = null; if (clientHold) { clearTimeout(clientHold.timer); clientHold.el.classList.remove("is-hold-arming", "is-holding"); } clientHold = null; if (clientProductHold) { clearTimeout(clientProductHold.timer); clientProductHold.el.classList.remove("is-hold-arming", "is-holding"); } clientProductHold = null; if (routeStopHold) { clearTimeout(routeStopHold.timer); routeStopHold.el.classList.remove("is-hold-arming", "is-holding"); } routeStopHold = null; if (productHold) { clearTimeout(productHold.timer); productHold.el.classList.remove("is-hold-arming", "is-holding"); } productHold = null; if (lrtParadaHold) { clearTimeout(lrtParadaHold.timer); lrtParadaHold.el.classList.remove("is-hold-arming", "is-holding"); } lrtParadaHold = null; if (lrtItemHold) { clearTimeout(lrtItemHold.timer); lrtItemHold.el.classList.remove("is-hold-arming", "is-holding"); } lrtItemHold = null; if (historicoHold) { clearTimeout(historicoHold.timer); historicoHold.el.classList.remove("is-hold-arming", "is-holding"); } historicoHold = null; document.querySelector("[data-route-current].is-swiping-skip")?.classList.remove("is-swiping-skip"); }, { passive: true });
  app.addEventListener("contextmenu", event => { if (event.target.closest("[data-client],[data-client-product-id],[data-route-stop],[data-product-id]")) event.preventDefault(); });
  app.addEventListener("input", event => {
    if (event.target.form && event.target.form.id === "edit-product-form" && event.target.name) {
      state.editProductDraft = { ...(state.editProductDraft || {}), [event.target.name]: event.target.value };
      return;
    }
    if (event.target.form && event.target.form.id === "client-product-form" && event.target.name) { state.clientProductDraft[event.target.name] = event.target.value; return; }
    if (event.target.form && event.target.form.id === "new-client-form" && ["productId", "qtdPadrao", "proximaData", "frequenciaDias", "scheduledAt", "precoAcordado"].includes(event.target.name)) { state.clientProductDraft[event.target.name] = event.target.value; return; }
    if (event.target.form && event.target.form.id === "client-details-form" && event.target.name) { if (event.target.name === "phone") event.target.value = formatPhoneInput(event.target.value); if (event.target.name === "cep") event.target.value = formatCep(event.target.value); if (event.target.name === "uf") event.target.value = event.target.value.toUpperCase(); state.clientPaymentDraft[event.target.name] = event.target.value; if (event.target.name === "cep") { if (onlyDigits(event.target.value).length === 8) void lookupClientCep(event.target.value); else { clientCepRequestId += 1; setClientCepStatus(""); } } return; }
    if (event.target.form && event.target.form.id === "new-client-form" && event.target.name) {
      const name = event.target.name; const value = name === "cep" ? formatCep(event.target.value) : name === "phone" ? formatPhoneInput(event.target.value) : name === "cpf" ? formatCpf(event.target.value) : event.target.value;
      event.target.value = value; state.newClientDraft[name] = value;
      if (name === "cep") { if (onlyDigits(value).length === 8) lookupNewClientCep(value); else state.newClientCepStatus = ""; }
      return;
    }
    // R2 (27/07) — rascunho da Rota rápida sobrevive a re-render (mesma lei L4-F).
    if (event.target.form && event.target.form.id === "montagem-rapida-form" && event.target.name && state.montagemRapida) {
      const r = state.montagemRapida;
      r[event.target.name] = event.target.value;
      // 🔴 28/07 — mexeu no CEP/número: o endereço achado e a checagem de porta
      // valem pro endereço ANTERIOR. Some com os dois (volta pro "Buscar
      // endereço") — senão o botão adiciona uma parada que não é a da tela.
      if ((event.target.name === "cep" || event.target.name === "numero") && (r.resolvido || r.duplicado || r.erro)) {
        r.resolvido = null; r.duplicado = null; r.erro = "";
        render();
      }
      return;
    }
    // Rascunho do nome da rota salva (mesma lei L4-F: re-render não apaga o digitado).
    if (event.target.form && event.target.form.id === "montagem-salvar-form" && event.target.name === "nome" && state.montagemSalvar) { state.montagemSalvar.nome = event.target.value; return; }
    // PR20072026 W2 — Leitura de Rota.
    if (event.target.form && event.target.form.id === "leitura-novo-form" && event.target.name) {
      const name = event.target.name;
      const value = name === "telefone" ? formatPhoneInput(event.target.value) : name === "cep" ? formatCep(event.target.value) : name === "uf" ? event.target.value.toUpperCase() : event.target.value;
      event.target.value = value;
      state.leituraNovoDraft[name] = value;
      // CEP digitado dispara ViaCEP + geocode.
      if (name === "cep") { if (onlyDigits(value).length === 8) void lookupLeituraNovoCep(value); else state.leituraNovoCepStatus = ""; }
      return;
    }
    if (event.target.form && event.target.form.id === "leitura-nome-form" && event.target.name === "nome") { state.leituraNomeRota = event.target.value; state.leituraNomeError = ""; return; }
    if (["lend-endereco", "lend-bairro", "lend-cidade", "lend-uf", "lend-cep"].includes(event.target.id)) {
      const key = ({ "lend-endereco": "endereco", "lend-bairro": "bairro", "lend-cidade": "cidade", "lend-uf": "uf", "lend-cep": "cep" })[event.target.id];
      const value = key === "uf" ? event.target.value.toUpperCase() : key === "cep" ? formatCep(event.target.value) : event.target.value;
      event.target.value = value;
      if (state.leituraEnd) state.leituraEnd.form = { ...(state.leituraEnd.form || {}), [key]: value };
      return;
    }
    if (event.target.id === "leitura-numero-input") { if (state.leituraEnd) state.leituraEnd.numero = event.target.value; return; }
    if (event.target.id === "leitura-telefone-input") { event.target.value = formatPhoneInput(event.target.value); state.leituraTelefoneValue = event.target.value; return; }
    // Observações da parada: foco/toque já parou a contagem; input só persiste o
    // rascunho sem renderizar e sem derrubar o teclado.
    if (event.target.id === "leitura-obs-input") { state.leituraObsDraft = event.target.value; stopLeituraObsCountdown(); return; }
    // DDD do pop-up: mantém só dígitos e guarda no estado (pra não perder o que
    // foi digitado se a sugestão do CEP chegar e re-renderizar).
    if (event.target.id === "ddd-input") { const v = onlyDigits(event.target.value).slice(0, 2); event.target.value = v; if (state.dddPrompt) state.dddPrompt.ddd = v; return; }
    // Seletor de cliente da rota = MESMA busca da tela Clientes (pedido do dono,
    // 21/07). O filtro local é só o alívio imediato enquanto o servidor responde;
    // sozinho ele só enxergava a página já carregada e "sumia" com o resto.
    if (event.target.id === "leitura-cliente-search") {
      state.leituraClienteQuery = event.target.value;
      filterSelectionList(event.target, "leitura-cliente-list", "leitura-cliente-empty");
      state.query = event.target.value;
      clearTimeout(clientsSearchTimer);
      clientsSearchTimer = setTimeout(() => { void loadClients(true); }, 300);
      return;
    }
    if (event.target.id === "leitura-produto-search") { state.leituraProdutoQuery = event.target.value; filterSelectionList(event.target, "leitura-produto-list", "leitura-produto-empty"); return; }
    if (event.target.dataset.leituraValor !== undefined) {
      const item = state.leituraItens.find(i => String(i.productId) === String(event.target.dataset.leituraValor));
      if (item) item.valorUnit = event.target.value === "" ? null : Number(event.target.value);
      return;
    }
    if (event.target.dataset.leituraEditValor !== undefined) {
      const draft = state.leituraEditDraft;
      const item = draft && draft.itens.find(i => String(i.productId) === String(event.target.dataset.leituraEditValor));
      if (item) item.valorUnit = event.target.value === "" ? 0 : Number(event.target.value);
      return;
    }
    if (event.target.id === "day-preview-search") {
      const query = event.target.value.trim().toLowerCase();
      app.querySelectorAll("[data-day-preview]").forEach(row => { row.hidden = !!query && !row.dataset.dayPreview.includes(query); });
      return;
    }
    if (event.target.id === "product-search") { state.productQuery = event.target.value; clearTimeout(productsSearchTimer); productsSearchTimer = setTimeout(() => render(), 300); return; }
    if (event.target.id !== "client-search") return;
    state.query = event.target.value;
    clearTimeout(clientsSearchTimer);
    clientsSearchTimer = setTimeout(() => loadClients(true), 300);
  });
  app.addEventListener("change", event => {
    if (event.target.dataset.rmePositionIndex !== undefined) {
      const editor = state.routeModeloEditor;
      const from = Number(event.target.dataset.rmePositionIndex);
      const requested = Math.trunc(Number(event.target.value));
      if (!editor || !Number.isInteger(from) || !Number.isFinite(requested) || !editor.paradas[from]) { render(); return; }
      const to = Math.max(0, Math.min(editor.paradas.length - 1, requested - 1));
      if (to !== from) {
        const [moved] = editor.paradas.splice(from, 1);
        editor.paradas.splice(to, 0, moved);
        H.vibrate(8);
      }
      render();
      return;
    }
    if (event.target.form && event.target.form.id === "edit-product-form" && event.target.name) { state.editProductDraft = { ...(state.editProductDraft || {}), [event.target.name]: event.target.value }; return; }
    if (event.target.form && event.target.form.id === "client-product-form" && event.target.name) { state.clientProductDraft[event.target.name] = event.target.value; return; }
    if (event.target.form && event.target.form.id === "client-details-form" && event.target.name) { state.clientPaymentDraft[event.target.name] = event.target.value; return; }
    if (!state.selected || !event.target.files || !event.target.files[0]) return;
    if (event.target.id === "proof-photo") uploadProof(state.selected, "foto", event.target.files[0]);
  });
  function formValues(form) {
    if (!form) return {};
    const values = Object.fromEntries(new FormData(form).entries());
    Object.keys(values).forEach(key => { if (!String(values[key]).trim()) delete values[key]; });
    return values;
  }
  // 🔴 27/07 (ordem do dono) — dia da semana é do CLIENTE, e este é o ÚNICO
  // caminho de escrita: uma chamada por cliente, o servidor aplica em todos os
  // vínculos e espelha na Agenda. Não existe mais dia dentro de produto.
  async function salvarDiasDoCliente(customerProfileId, dias, vinculoIdsExtras) {
    if (!customerProfileId) return;
    const lista = [...new Set((dias || []).map(Number).filter(d => d >= 1 && d <= 7))].sort((a, b) => a - b);
    try {
      await H.api(`/logistica/clientes/${encodeURIComponent(customerProfileId)}/dias`, { method: "PATCH", body: { dias: lista } });
      // O card lê os dias do PLANO; o que acabou de ser salvo fica lembrado aqui
      // pro card mostrar TODOS os dias do cliente já na volta pra lista.
      lembrarDiasDoCliente(customerProfileId, lista);
      return;
    } catch (error) {
      // PONTE DE TRANSIÇÃO (27/07): o celular atualiza antes do servidor. Enquanto
      // o endpoint novo não está no ar (404/405), grava pelo caminho antigo pra
      // ninguém ficar sem salvar o dia do cliente. APAGAR ESTE CATCH depois do
      // publish que leva o endpoint — ele é o único resquício de dia em vínculo.
      const status = Number(error && (error.status || error.statusCode));
      if (status !== 404 && status !== 405) throw error;
      const ids = [...new Set([
        ...(state.clientProducts || []).filter(v => v && v.ativo !== false).map(v => String(v.id)),
        ...(vinculoIdsExtras || []).map(String),
      ])].filter(Boolean);
      for (const id of ids) {
        await H.api(`/logistica/cliente-produtos/${encodeURIComponent(id)}`, { method: "PATCH", body: { diasSemana: lista.join(",") } });
      }
      lembrarDiasDoCliente(customerProfileId, lista);
    }
  }
  async function persistClientProduct(customerProfileId, values) {
    const productId = Number(values.productId || state.clientProductDraft.productId);
    const quantity = Number(values.qtdPadrao || state.clientProductDraft.qtdPadrao || 1);
    if (!customerProfileId) throw new Error("Cliente não encontrado para salvar o produto.");
    if (!productId) throw new Error("Escolha o produto.");
    if (!Number.isFinite(quantity) || quantity < 1) throw new Error("Informe uma quantidade válida.");
    const precoAcordadoRaw = values.precoAcordado !== undefined ? values.precoAcordado : state.clientProductDraft.precoAcordado;
    const precoAcordado = precoAcordadoRaw !== undefined && precoAcordadoRaw !== null && String(precoAcordadoRaw).trim() !== "" ? Number(precoAcordadoRaw) : null;
    if (!state.clientProductDays.length) throw new Error("Marque os dias de entrega do cliente (seção Cadastro).");
    // 27/07 (ordem do dono, 3ª cobrança) — produto NÃO tem tipo nem dia: TODO vínculo
    // segue os dias do CLIENTE (o servidor copia os dias da conta pro vínculo novo).
    // Vínculo legado "a cada N dias" que for salvo aqui CONVERTE pros dias do cliente
    // (frequenciaDias/proximaData zerados de propósito). Avulsa = fluxo próprio.
    const body = { qtdPadrao: quantity, frequenciaDias: null, proximaData: null, ativo: true, precoAcordado };
    if (state.clientProductEditingId) await H.api(`/logistica/cliente-produtos/${encodeURIComponent(state.clientProductEditingId)}`, { method: "PATCH", body });
    else await H.api("/logistica/cliente-produtos", { method: "POST", body: { customerProfileId, productId, ...body } });
  }
  app.addEventListener("submit", async event => {
    event.preventDefault(); const form = event.target; const button = form.querySelector("button[type=submit]"); button.disabled = true;
    try {
      const data = formValues(form);
      // Preço de hoje na chegada (22/07): Enter no teclado confirma igual ao ✓
      // (Lei 5). Sem este ramo o submit caía no fim do handler sem fazer nada e o
      // valor digitado se perdia.
      if (form.id === "chegada-preco-form") { salvarPrecoDeHoje(form); return; }
      if (form.id === "company-name-form") { state.companyName = String(data.companyName || "").trim().slice(0, 80); H.cache.set("logistica-company-name", state.companyName); render(); toast(state.companyName ? "Nome da empresa atualizado." : "Nome da empresa removido."); }
      if (form.id === "arrival-radius-form") { const radius = Math.max(20, Math.min(1000, Number(data.raioChegadaM))); if (!Number.isFinite(radius)) throw new Error("Informe um raio entre 20 e 1000 metros."); await H.api("/logistica/config", { method: "PATCH", body: { raioChegadaM: radius } }); await closeOverlay("modal"); await refresh(true); toast(`Aviso de chegada ajustado para ${radius} m.`); }
      if (form.id === "new-client-form") {
        const d = state.newClientDraft;
        const body = { nome: data.name, tipo: "pf", whatsapp: data.phone, document: data.cpf, endereco: data.endereco, numero: data.numero, bairro: data.bairro, cidade: data.cidade, uf: data.uf && String(data.uf).toUpperCase(), cep: data.cep, lat: d.lat, lng: d.lng, isCliente: true, isLead: false, observacoes: data.observacoes };
        Object.keys(body).forEach(k => { if (body[k] === undefined || body[k] === null || body[k] === "") delete body[k]; });
        const duplicate = await findDuplicateClient({ name: data.name, phone: data.phone, document: data.cpf, endereco: data.endereco, numero: data.numero });
        if (duplicate) { showDuplicateClient(duplicate, "duplicate-new-client"); return; }
        const created = await H.api("/nucleo/contas", { method: "POST", body });
        const customerProfileId = created && (created.contaId || created.customerProfileId || created.id);
        if (!customerProfileId) throw new Error("Cliente criado sem identificador para vincular os dados.");
        const limite = Number(data.limite); const dia = Math.max(1, Math.min(31, Number(data.diaFechamento)));
        await H.api(`/logistica/clientes/${encodeURIComponent(customerProfileId)}/financeiro`, { method: "PATCH", body: { formaPagamento: d.formaPagamento, metodoPadrao: d.formaPagamento === "na_hora" ? d.metodoPadrao : "", limiteFiado: data.limite !== undefined && Number.isFinite(limite) && limite >= 0 ? limite : null, ...(d.formaPagamento === "mensal" && Number.isFinite(dia) ? { diaFechamento: dia } : {}) } });
        // 27/07 (ordem do dono, 3ª cobrança) — produto no cadastro novo não tem tipo:
        // escolheu produto = vínculo nos dias do CLIENTE; sem produto = só o cliente.
        const productIdNovo = Number(data.productId || state.clientProductDraft.productId);
        if (productIdNovo) {
          const quantity = Number(data.qtdPadrao || state.clientProductDraft.qtdPadrao || 1);
          const precoAcordado = data.precoAcordado !== undefined && String(data.precoAcordado).trim() !== "" ? Number(data.precoAcordado) : null;
          if (!state.clientProductDays.length) throw new Error("Marque os dias de entrega do cliente (seção Cadastro).");
          const vinculo = await H.api("/logistica/cliente-produtos", { method: "POST", body: { customerProfileId, productId: productIdNovo, qtdPadrao: quantity, ativo: true, precoAcordado } });
          await salvarDiasDoCliente(customerProfileId, state.clientProductDays, vinculo && vinculo.id ? [vinculo.id] : []);
        }
        await closeOverlay("modal"); await loadClients(true, true); toast(productIdNovo ? "Cliente e produto cadastrados." : "Cliente cadastrado.");
      }
      if (form.id === "client-details-form") {
        const client = state.modalClient; const phoneDigits = onlyDigits(data.phone); const placeholderPhone = phoneDigits.length > 0 && /^0+$/.test(phoneDigits); const phone = (phoneDigits.length === 10 || phoneDigits.length === 11) && !placeholderPhone ? formatPhone(phoneDigits) : "";
        if (!client || !client.id) throw new Error("Cliente não encontrado.");
        if (phoneDigits.length && !placeholderPhone && !phone) throw new Error("Telefone incompleto.");
        const d = state.clientPaymentDraft; const endereco = composeAddress(d); const lat = Number(d.lat); const lng = Number(d.lng); const hasCoordinates = d.lat !== null && d.lat !== "" && d.lng !== null && d.lng !== "" && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0); const observacoes = String(form.elements.namedItem("observacoes")?.value || "").trim().slice(0, 500);
        // S4 25/07 (PR25072026-ROTA-CONFERIDA) — achado durante a mini-ficha da
        // conferência: este PATCH nunca mandava `geoFonte`/`gpsAccuracy`, então
        // "Consultar local" (geocode) e o novo "Usar meu GPS daqui" moviam o
        // pino mas o freio de precisão (`decidirGeoFonteCadastro`) nunca era
        // chamado — o pino corrigido continuava marcado com a fonte ANTIGA (ex.:
        // 'geocode' cru, sem nunca virar 'gps_cadastro'), então a conferência
        // seguiria acusando o mesmo motivo pra sempre. `d.geoFonte` só entra
        // quando é um valor que o backend ACEITA como input ('geocode'/
        // 'gps_cadastro'/'gps_impreciso') — nunca 'gps_entrega' (exclusivo do
        // confirmarEntrega, rejeitado pelo @IsIn do DTO) nem o vazio do cadastro
        // ainda não tocado nesta sessão; editar só o texto do endereço sem
        // mexer no pino continua sem mandar geoFonte, byte a byte como antes.
        const geoFonteEditavel = d.geoFonte === "geocode" || d.geoFonte === "gps_cadastro" || d.geoFonte === "gps_impreciso";
        const gpsAccuracyNum = Number(d.gpsAccuracy);
        const addressBody = { nome: String(data.name || "").trim(), endereco, numero: String(d.numero || "").trim(), bairro: String(d.bairro || "").trim(), cidade: String(d.cidade || "").trim(), uf: String(d.uf || "").trim().toUpperCase(), cep: formatCep(d.cep || ""), observacoes, ...(hasCoordinates ? { lat, lng, ...(geoFonteEditavel ? { geoFonte: d.geoFonte, ...(Number.isFinite(gpsAccuracyNum) ? { gpsAccuracy: gpsAccuracyNum } : {}) } : {}) } : {}) };
        await H.api(`/nucleo/contas/${encodeURIComponent(client.id)}`, { method: "PATCH", body: addressBody });
        try {
          // 27/07 (toast na tela do dono): `nome` é campo da CONTA — o DTO de locais
          // não o aceita (local tem `apelido`) e o PATCH inteiro caía em 400
          // "property nome should not exist" pra TODO cliente com local principal.
          const localBody = { ...addressBody, endereco }; delete localBody.observacoes; delete localBody.nome;
          if (d.localId) await H.api(`/nucleo/locais/${encodeURIComponent(d.localId)}`, { method: "PATCH", body: localBody });
          else if (endereco || addressBody.cep) await H.api(`/nucleo/clientes/${encodeURIComponent(client.id)}/locais`, { method: "POST", body: { ...localBody, isPrincipal: true } });
        } catch (localError) { toast("O endereço do mapa não atualizou: " + humanApiError(localError), true); }
        if (phone) await saveClientPhone(client, phone);
        const limite = Number(data.limite); const dia = Math.max(1, Math.min(31, Number(data.diaFechamento))); await H.api(`/logistica/clientes/${encodeURIComponent(client.id)}/financeiro`, { method: "PATCH", body: { formaPagamento: d.formaPagamento, metodoPadrao: d.formaPagamento === "na_hora" ? d.metodoPadrao : "", limiteFiado: data.limite !== undefined && Number.isFinite(limite) && limite >= 0 ? limite : null, ...(d.formaPagamento === "mensal" && Number.isFinite(dia) ? { diaFechamento: dia } : {}) } });
        const savesProduct = !!state.clientProductMode;
        // 🔴 27/07 (ordem do dono) — o DIA é do cliente e vai PRIMEIRO: o vínculo
        // criado logo abaixo herda do servidor os dias da conta (produto não tem
        // mais dia nenhum). Dias vazios não zeram nada por engano.
        const diasNovos = [...state.clientProductDays].sort((a, b) => a - b);
        // 27/07 (caso Dona Maria) — manda SEMPRE que houver dia marcado, não só
        // quando mudou: os chips pré-carregam do VÍNCULO antigo, e a pendência
        // "Dia" do servidor só sai quando os dias viram PLANO. Com o guard de
        // diff, salvar a ficha sem tocar nos chips deixava a pendência eterna.
        // PATCH é idempotente; dias vazios seguem sem zerar nada por engano.
        if (diasNovos.length) {
          await salvarDiasDoCliente(client.id, diasNovos);
          state.clientDaysOriginal = diasNovos;
        }
        if (savesProduct) {
          await persistClientProduct(client.id, formValues(app.querySelector("#client-product-form")));
          // Vínculo criado agora nasce nos dias da conta pelo servidor; a 2ª
          // chamada só existe pro caminho de transição (servidor antigo), e é
          // idempotente — some junto com o catch de transição.
          if (diasNovos.length) await salvarDiasDoCliente(client.id, diasNovos);
        }
        await closeOverlay("modal"); await loadClients(true, true); render(); toast(savesProduct ? "Cliente e produto salvos." : "Cliente salvo.");
      }
      if (form.id === "client-product-form") {
        const wasEditing = !!state.clientProductEditingId;
        await persistClientProduct(data.customerProfileId, data);
        await closeOverlay("modal");
        await loadClients(true, true);
        toast(wasEditing ? "Alterações salvas." : "Produto salvo.");
      }
      if (form.id === "new-product-form") { data.price = moneyInputReais(data.price); data.stock = Number(data.stock || 0); data.kind = "tenant_product"; data.status = "active"; data.usaLogistica = true; await H.api("/products", { method: "POST", body: data }); await closeOverlay("modal"); await refresh(true); toast("Produto cadastrado."); }
      if (form.id === "edit-product-form") {
        const product = state.modalProduct;
        if (!product || !product.id) throw new Error("Produto não encontrado.");
        // Contrato do backend (UpdateProdutoDto): campo de preço chama `preco`;
        // só manda o que foi preenchido (formValues já dropa vazios).
        const body = { nome: data.nome, ...(data.unidade !== undefined ? { unidade: data.unidade } : {}), ...(data.precoCatalogo !== undefined ? { preco: moneyInputReais(data.precoCatalogo) } : {}), ...(data.estoque !== undefined ? { estoque: Math.trunc(Number(data.estoque)) } : {}) };
        await H.api(`/logistica/produtos/${encodeURIComponent(product.id)}`, { method: "PATCH", body });
        await closeOverlay("modal");
        await refresh(true);
        toast("Produto atualizado.");
      }
      if (form.id === "new-delivery-form") { data.productId = data.productId ? Number(data.productId) : undefined; data.quantidade = Number(data.quantidade || 1); data.scheduledAt = data.scheduledAt ? new Date(data.scheduledAt).toISOString() : undefined; await H.api("/logistica/entregas", { method: "POST", body: data }); await closeOverlay("modal"); await refresh(true); toast("Entrega adicionada à rota."); }
      if (form.id === "leitura-novo-form") {
        const nome = String(data.nome || "").trim();
        if (!nome) throw new Error("Informe o nome do cliente.");
        const draft = state.leituraNovoDraft;
        draft.nome = nome;
        draft.telefone = data.telefone || "";
        if (data.endereco !== undefined) draft.endereco = data.endereco;
        if (data.numero !== undefined) draft.numero = data.numero;
        if (data.bairro !== undefined) draft.bairro = data.bairro;
        if (data.cidade !== undefined) draft.cidade = data.cidade;
        if (data.uf !== undefined) draft.uf = String(data.uf).toUpperCase();
        const duplicate = await findDuplicateClient(draft);
        if (duplicate) { showDuplicateClient(duplicate, "duplicate-leitura-client"); return; }
        button.disabled = false;
        // Cliente novo usa a mesma transição atômica do existente: o estado de
        // GPS já nasce carregando antes de a tela de endereço aparecer.
        await advanceLeituraNovoDraft();
      }
      if (form.id === "montagem-salvar-form" && state.montagemSalvar) {
        state.montagemSalvar.nome = String(data.nome || "");
        await montagemSalvarConfirmar();
        return;
      }
      if (form.id === "leitura-nome-form" && state.leitura) {
        const nome = String(data.nome || "").trim() || rotaDefaultName();
        // F1 — rota salva SEM dia (lista livre); backend aceita diaSemana ausente.
        const body = { nome };
        // S3 21/07 — só a sessão LEITURA liga a gravação nativa (S2-CONTRATO-PONTE §1).
        const wasLeitura = state.leitura.modo === "LEITURA";
        state.leituraSaving = true; render();
        try {
          await H.api(`/logistica/leitura/${encodeURIComponent(state.leitura.id)}/finalizar`, { method: "POST", body });
          if (wasLeitura) leituraTrilhaParar();
          leituraQueueClearSession(state.leitura.id);
          state.leitura = null;
          persistLeituraSession();
          state.leituraResumo = null;
          state.leituraTrilha = [];
          state.leituraUltimaAmostra = null;
          state.leituraPausaPendente = null;
          await closeOverlay("modal");
          await loadRouteModelos(true);
          toast("Feito.");
        } catch (error) {
          const code = error && error.body && error.body.code;
          if (code === "ROTA_NOME_DUPLICADO") state.leituraNomeError = humanApiError(error);
          else toast(humanApiError(error), true);
        }
        state.leituraSaving = false;
        button.disabled = false;
        render();
      }
    } catch (error) { button.disabled = false; toast(humanApiError(error), true); }
  });
  // S5 21/07 (PR21072026-NAVEGAÇÃO-HBX) — "Chegada na parada: hbx:arrival já
  // abre a folha — falar 'Você chegou' 1x" (spec S5 #3). navModeActive()+
  // !navMudo é a MESMA porta de todo H.speak desta frente (nunca em Leitura/
  // pausada, respeita mudo); a chamada é 1x por evento (o nativo dispara uma
  // vez por chegada, não há loop pra deduplicar aqui).
  document.addEventListener("hbx:arrival", event => {
    const item = items().find(x => x.id === event.detail.deliveryId);
    if (!item) return;
    state.screen = "route";
    showSheet(item, true);
    toast(`Você chegou em ${item.cliente.nome || "uma parada"}.`);
    if (navModeActive() && !state.navMudo) H.speak("Você chegou");
    // O backend aplica configuração de distância, idempotência e fila segura.
    // A mensagem é best effort e nunca bloqueia a folha de chegada.
    void H.api(`/logistica/entregas/${encodeURIComponent(item.id)}/chegando`, { method: "POST", body: {} }).catch(() => {});
  });
  document.addEventListener("hbx:theme", render);
  // Fix visual de alta frequência (~3s): move posição/precisão/câmera, mas não
  // entra na trilha gravada. O nativo mantém a gravação filtrada em 8m/15s.
  document.addEventListener("hbx:leitura-posicao", event => {
    if (!state.leitura || state.leitura.modo !== "LEITURA") return;
    const sample = leituraLocationSample(event && event.detail);
    if (!sample) return;
    state.leituraUltimaAmostra = sample;
    if (leituraRouteActive() && routeMap && routeMapHost) updateRouteReadingMap(routeMapHost, routeMap, { moveCamera: true });
  });
  // S3 21/07 — S2-CONTRATO-PONTE §2. hbx:leitura-ponto: só desenha se a tela
  // viva estiver aberta (evita render à toa em qualquer outra tela); a trilha
  // em si é sempre ressincronizada do zero por leituraStatus() ao reabrir a
  // tela (applyLeituraSnapshot), então não precisa acumular fora dela.
  document.addEventListener("hbx:leitura-ponto", event => {
    if (!state.leitura || state.leitura.modo !== "LEITURA") return;
    const sample = leituraLocationSample(event && event.detail);
    if (!sample) return;
    const current = state.leituraUltimaAmostra;
    const alreadyAppliedLive = current && sample.ts != null && Number(current.ts) === Number(sample.ts);
    const trail = state.leituraTrilha || [];
    const last = trail[trail.length - 1];
    if (!last || Number(last[0]) !== sample.lat || Number(last[1]) !== sample.lng) state.leituraTrilha = [...trail, [sample.lat, sample.lng]];
    if (!current || current.ts == null || sample.ts == null || Number(sample.ts) >= Number(current.ts)) state.leituraUltimaAmostra = sample;
    if (leituraRouteActive() && routeMap && routeMapHost) updateRouteReadingMap(routeMapHost, routeMap, { moveCamera: !alreadyAppliedLive });
    else if (state.modal === "leitura-ativa") render();
  });
  // hbx:leitura-pausa: overlay GLOBAL (leituraPausaOverlay, dentro de shell())
  // — pode chegar com o app em qualquer tela, inclusive re-disparado sozinho
  // no onResume (evento pendente com o app fechado, ver contrato §2). Guard
  // por segurança: só reage se o front também acha que há sessão LEITURA
  // ativa (evita popup fantasma se os dois lados ficarem dessincronizados).
  document.addEventListener("hbx:leitura-pausa", event => {
    if (!state.leitura || state.leitura.modo !== "LEITURA") return;
    // S4 22/07 — pause_detected só na TRANSIÇÃO nenhuma-pausa→pausa-pendente:
    // o comentário acima já avisa que este evento pode ser re-disparado
    // sozinho no onResume com o popup ainda na tela (mesma pausa, sem
    // resolver) — sem este guard o som repicaria toda vez que o modal
    // re-renderiza, o que o aceite do S4 proíbe explicitamente. O modal fica
    // na tela mesmo se o som não tocar (a informação não se perde — é a
    // "exceção parcial" do S4 pro descarte de efeito).
    const jaPendente = !!state.leituraPausaPendente;
    const detail = (event && event.detail) || {};
    state.leituraPausaPendente = { lat: detail.lat, lng: detail.lng, ts: detail.ts, clienteProximo: detail.clienteProximo || null };
    if (!jaPendente) H.sound("pause_detected");
    render();
  });
  window.addEventListener("online", () => { refresh(true); void flushLeituraQueue(); syncHeaderChips(); });
  window.addEventListener("offline", syncHeaderChips);
  window.HBXApp = {
    refresh,
    rechargeCompleted(detail) {
      const result = detail && typeof detail === "object" ? detail : {};
      const balanceAfter = Number(result.balanceAfter);
      const credited = Number(result.credited);
      if (Number.isFinite(balanceAfter)) {
        if (state.recargaCatalog) state.recargaCatalog = { ...state.recargaCatalog, balance: balanceAfter };
        state.statement = { ...(state.statement || {}), balanceCredits: balanceAfter };
        if (balanceAfter > 0) state.creditsLock = null;
      }
      if (state.modal === "recarga") state.modal = null;
      toast(Number.isFinite(credited) && credited > 0 ? `${credited.toLocaleString("pt-BR")} créditos adicionados com sucesso.` : "Recarga concluída. Saldo atualizado.");
    },
    handleBack() {
      // Regra do dono: voltar sempre fecha o que está por cima primeiro; só sai do
      // app quando já está na Rota sem nada aberto. Síncrono pro nativo (Kotlin só
      // quer o boolean); closeOverlay é assíncrono, então dispara com `void` e já
      // devolve `true` — a UI fecha com a animação de qualquer forma.
      try {
        if (state.dddPrompt) { state.dddPrompt = null; render(); return true; }
        if (state.confirmation) { state.confirmation = null; render(); return true; }
        // S3.2 — popup de pausa (overlay global, aparece em cima de qualquer
        // tela): voltar SEMPRE dispensa (mesmo botão "Dispensar"), nunca sai
        // da tela por baixo dele numa tacada só.
        if (state.leituraPausaPendente) { leituraPausaResolver(false); state.leituraPausaPendente = null; render(); return true; }
        // fecha SÓ ele (rodando, o loop vê `abortar` e para sozinho). Lei 10.
        // 22/07 — Lei 10: tela nova entra aqui. Histórico volta pra ficha do
        // cliente (de onde foi aberto); dentro da chegada, o picker de produto e o
        // campo de preço fecham ANTES da folha inteira.
        if (state.modal === "historico") { state.historico = null; showModal("client-product"); return true; }
        if (state.selected && (state.deliveryProductPicker || state.deliveryPriceEdit)) {
          state.deliveryProductPicker = false;
          state.deliverySwapKey = null;
          state.deliveryPriceEdit = null;
          render();
          return true;
        }
        // Lei 10 — tela nova entra aqui: a de erros fecha e devolve a montagem.
        if (state.checagem && !state.modal) { state.checagem = null; render(); return true; }
        if (state.modal === "manage-day") {
          // R1 (27/07) — Lei 10 na tela única: Rota rápida e Rotas salvas
          // voltam pra tela principal; ficha "Como resolver?" volta pra lista;
          // na tela principal, o voltar fecha o modal (cai no closeOverlay
          // genérico, que desfaz a rota não aceita — "só o Aceitar consolida").
          if (state.montagemRapida) {
            state.montagemRapida = null;
            render();
            return true;
          }
          // Lei 10 — o passo "Nome da rota" volta pra rota em conferência (e não
          // sai do meio de um POST em voo).
          if (state.montagemSalvar) {
            if (!state.montagemSalvar.salvando) { state.montagemSalvar = null; render(); }
            return true;
          }
          if (state.dayOrderStep === "saved") {
            state.dayOrderStep = null;
            render();
            return true;
          }
        }
        if (state.modal === "leitura-parada") {
          // leituraGoBack é async: chamar direto no `if` testa a Promise (SEMPRE
          // truthy) e o closeOverlay abaixo nunca rodava — no 1º passo ("tipo") o
          // voltar do Android prendia o usuário no wizard. Decide pelo teste
          // síncrono e dispara a navegação com `void`.
          if (leituraBackTarget()) { void leituraGoBack(); return true; }
          // Mesmo fechamento do botão/X (data-action="leitura-voltar"): volta pra
          // tela viva da sessão, não pra Rota crua.
          void closeLeituraParadaModal();
          return true;
        }
        if (state.modal === "leitura-finalizar") {
          const step = state.leituraFinalStep;
          if (step === "nome") { state.leituraFinalStep = "timeline"; render(); return true; }
          void closeLeituraParadaModal();
          return true;
        }
        // Leitura ativa mora na própria Rota: voltar pede a mesma confirmação
        // do controle "Cancelar" antes de sair do app.
        if (leituraRouteActive()) { promptCancelLeitura(); return true; }
        // Lei 10 (25/07) — update OBRIGATÓRIA (mesmo contrato do modal: toque-
        // no-fundo e "Agora não" já somem em appUpdateModal ~L1934 quando
        // obrigatoria). Voltar físico não pode ser a porta que escapava dessa
        // regra: consome o evento (true) e NÃO fecha nem cai pro fallback de
        // sair da tela/app.
        if (state.modal === "app-update" && state.updateInfo && state.updateInfo.obrigatoria) return true;
        // S4 25/07 (PR25072026-ROTA-CONFERIDA) — Lei 10: a ficha da conferência
        // é um PASSO dentro do mesmo modal (como manage-day/leitura-parada
        // acima); voltar sai da ficha pra lista, só fecha o modal inteiro
        // quando já está na lista (cai no fallback genérico abaixo).
        if (state.modal) { void closeOverlay("modal"); return true; }
        if (state.deliveryProductPicker) { state.deliveryProductPicker = false; render(); return true; }
        if (state.selected) { void closeOverlay("sheet"); return true; }
        if (state.screen !== "route") { navigateTo("route", "back"); return true; }
        return false;
      } catch (error) {
        console.error(error);
        return false;
      }
    },
    routeActivated() { toast("GPS da rota ativado."); },
    locationPermissionChanged(granted) {
      // S06 (fix 21/07) — resolve ensureLeituraTrilhaLocationPermission() acima
      // (pedido feito ANTES de iniciar a gravação nativa da trilha). Checado
      // primeiro porque é o pedido mais recente em voo.
      if (state.leituraTrilhaAwaitingGps) {
        state.leituraTrilhaAwaitingGps = false;
        const resolve = leituraTrilhaPermResolve;
        leituraTrilhaPermResolve = null;
        if (!granted) toast("Permita a localização para gravar a trilha da rota.", true);
        if (resolve) resolve(!!granted);
        return;
      }
      // PR20072026 fix — retoma a captura da Leitura de Rota quando a permissão
      // foi pedida pelo "Cadastrar Local" (tem prioridade sobre o cadastro).
      if (state.leituraAwaitingGps) {
        state.leituraAwaitingGps = false;
        if (!granted) { state.leituraCapturing = false; toast("Permita a localização para cadastrar o local.", true); render(); return; }
        leituraCapturePosition().then(finishLeituraGpsCapture);
        return;
      }
      if (granted) useCurrentLocationForNewClient(true);
      else { state.newClientGpsLoading = false; state.newClientCepStatus = "Permita a localização para usar este atalho."; render(); }
    }
  };
  if (!["route", "clients", "products", "settings"].includes(state.screen)) state.screen = "route";
  restoreRouteEngineState(state.route);
  render(); refresh(false, true); state.screenMotion = ""; void restoreLeituraSession(); refreshGpsPerm(); void checkAppUpdate(false);
  // Volta do fundo = nova chance de ver atualização (a trava de 30min dentro
  // de checkAppUpdate segura a frequência; trocar de app não vira enxurrada).
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { retomarUpdatePosPermissao(); void checkAppUpdate(); } });
  // Voltar da tela de permissão do Android nem sempre passa por
  // visibilitychange em toda WebView — o focus da janela é o segundo laço de
  // segurança. retomarUpdatePosPermissao() é idempotente (sai na hora se o
  // modal não for o de update), então rodar duas vezes não custa nada.
  window.addEventListener("focus", () => retomarUpdatePosPermissao());
})();
