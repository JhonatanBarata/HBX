/**
 * DADOS HOSTIS — o combustível do fiscal de aparência.
 *
 * A lição que custou os prints: uma tela VAZIA nunca corta nada. O detector
 * antigo passava em 100% das rotas porque media páginas sem dado — e página
 * sem dado é sempre bonita. Layout não quebra com o caso médio; quebra com o
 * caso extremo, e o caso extremo é o cliente real.
 *
 * Então o mock aqui não imita "um lead". Ele imita O PIOR LEAD QUE EXISTE:
 *
 *   - razão social de cartório, do tamanho que a Receita deixa
 *   - rótulo de status que é uma frase ("Aguardando resposta do cliente")
 *   - cidade com nome composto e acento
 *   - valor na casa do milhão, com separador de milhar
 *   - e, no meio, um registro CURTO ("AL", "SP") — porque o outro extremo
 *     também quebra: caixa dimensionada pro texto longo fica ridícula com
 *     texto de 2 letras, e ninguém testa esse
 *
 * O nome da RISSO é o do print do dono, de propósito: o teste tem que reprovar
 * exatamente o caso que ele viu com o olho, senão a rede não cobre a realidade
 * que a motivou.
 *
 * REGRA PRA QUEM MEXER: dado hostil só ANDA PRA PIOR. Encurtar um nome aqui
 * para "o teste passar" é desligar o fiscal sem desligar o arquivo.
 */

/** Razões sociais que existem no Brasil e estouram qualquer pílula. */
export const NOMES_LONGOS = [
  "RISSO DISTRIBUIDORA – ÁGUA MINERAL E BEBIDAS EM GERAL LTDA ME",
  "COMERCIAL DE ALIMENTOS E DISTRIBUIDORA SÃO SEBASTIÃO DO PARAÍSO LTDA EPP",
  "INDÚSTRIA E COMÉRCIO DE EMBALAGENS PLÁSTICAS TRÊS CORAÇÕES S/A",
  "AL", // o outro extremo — caixa larga demais para texto curto
  "TRANSPORTADORA E LOGÍSTICA INTEGRADA DO VALE DO PARAÍBA LTDA",
];

export const CIDADES = ["INDAIATUBA", "São José do Rio Preto", "Santa Bárbara d'Oeste", "SP", "Poá"];

export const SEGMENTOS = [
  "Distribuidora De Agua Mineral E Bebidas",
  "Comércio Atacadista De Produtos Alimentícios Em Geral",
  "Bar",
  "Indústria De Transformação De Materiais Plásticos",
];

/** Frases inteiras que hoje moram dentro de pílulas de 10px. */
export const STATUS_LONGOS = [
  { status: "awaiting_reply", label: "Aguardando resposta do cliente" },
  { status: "processing", label: "Em processo de liberação" },
  { status: "scheduled", label: "Retorno agendado para segunda-feira" },
  { status: "new", label: "Novo lead" },
  { status: "negotiating", label: "Em negociação avançada" },
];

const ISO = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();

function lead(i: number, block: "today" | "overdue" | "scheduled" | "closed") {
  const st = STATUS_LONGOS[i % STATUS_LONGOS.length];
  const fechado = block === "closed";
  return {
    id: `lead-${block}-${i}`,
    radarLeadId: `radar-${i}`,
    customerProfileId: null,
    name: NOMES_LONGOS[i % NOMES_LONGOS.length],
    razaoSocial: NOMES_LONGOS[(i + 1) % NOMES_LONGOS.length],
    phone: "+5519981874096",
    phones: ["+5519981874096", "+551938752211"],
    phonesWhatsapp: { "+5519981874096": true },
    email: "contato.comercial.matriz@distribuidoraparaiso.com.br",
    emails: ["contato.comercial.matriz@distribuidoraparaiso.com.br"],
    address: "Rodovia Santos Dumont, Km 66, s/n — Distrito Industrial João Narezzi",
    website: "https://www.distribuidoradeaguamineralparaiso.com.br",
    cnpj: "12.345.678/0001-90",
    cnae: "4635-4/02 — Comércio atacadista de cerveja, chope e refrigerante",
    ownerName: "Maria Aparecida de Souza Nascimento Filho",
    ownerNames: ["Maria Aparecida de Souza Nascimento Filho"],
    ownerPhone: "+5519981874096",
    ownerInstagram: null,
    ownerFacebook: null,
    companySituation: "ATIVA",
    city: CIDADES[i % CIDADES.length],
    state: "SP",
    segment: SEGMENTOS[i % SEGMENTOS.length],
    rating: 4.7,
    reviews: 1284,
    opportunityScore: 87,
    leadTemperature: "quente",
    timesSeen: 3,
    status: st.status,
    statusLabel: st.label,
    nextAction: "Ligar para o responsável pelo setor de compras",
    returnAt: block === "scheduled" ? ISO(2) : null,
    shortNote: "Cliente pediu para retornar depois do dia 15 — orçamento em análise pela diretoria.",
    lastContactAt: ISO(-3),
    attemptCount: 4,
    lastResult: "Sem resposta",
    closedAt: fechado ? ISO(-1) : null,
    createdAt: ISO(-30),
    updatedAt: ISO(-1),
    sourceType: "radar",
    primarySource: "Radar HBX",
    isFreshCompany: i % 3 === 0,
    daysSinceOpened: 12,
    isInInbox: true,
    conversation: null,
    engagement: null,
    automation: null,
    timeline: [],
    saleConfirmedAt: fechado ? ISO(-1) : null,
    saleStatus: fechado ? "won" : null,
    saleStatusLabel: fechado ? "Venda confirmada com contrato assinado" : null,
    saleValue: fechado ? 1_234_567.89 : null,
    commissionStatusLabel: fechado ? "Comissão liberada para pagamento" : null,
    commissionAmount: fechado ? 98_765.43 : null,
    commissionDueAt: fechado ? ISO(10) : null,
    commissionRecurring: true,
    commissionNote: null,
    setupValue: fechado ? 4_500 : null,
    setupCommissionAmount: fechado ? 450 : null,
    setupCommissionStatusLabel: fechado ? "Implantação faturada" : null,
    commissionPercentSnapshot: 8,
    product: { name: "Plano Distribuidora Full — 12 meses", priceLabel: "R$ 1.234.567,89", canViewPrice: true },
    leadIntelligence: {
      whatsappStatus: "confirmed",
      emailStatus: "probable",
      websiteStatus: "confirmed",
      instagramUrl: null,
      facebookUrl: null,
      opportunityReason: "Empresa aberta há pouco tempo e sem presença digital consolidada na região",
      leadReasonTags: ["Recém-aberta", "Sem site institucional", "Alto volume de avaliações"],
      recommendedChannel: "whatsapp",
      painType: "logistica",
      painPitch: "Entregas atrasando por falta de roteirização automática",
      messageTemplate: null,
      contactQuality: "alta",
      enrichedAt: ISO(-5),
    },
    owner: { name: "Jhonatan Barata de Oliveira" },
    block,
  };
}

/** Resposta de /vendas/board com os 4 blocos preenchidos. */
export function boardHostil() {
  const today = [0, 1, 2, 3].map((i) => lead(i, "today"));
  const overdue = [0, 1, 2].map((i) => lead(i, "overdue"));
  const scheduled = [0, 1].map((i) => lead(i, "scheduled"));
  const closed = [0, 1].map((i) => lead(i, "closed"));
  return {
    summary: {
      total: today.length + overdue.length + scheduled.length + closed.length,
      today: today.length,
      overdue: overdue.length,
      scheduled: scheduled.length,
      closed: closed.length,
    },
    blocks: { today, overdue, scheduled, closed },
    sellsHbxPlans: true,
    canViewValues: true,
    radarSupply: {
      isSeller: true,
      unlimited: false,
      activeCards: 26,
      capacity: 30,
      availableSlots: 4,
      full: false,
      paused: true,
      code: "CARTEIRA_QUASE_CHEIA",
    },
    team: {
      sellers: [
        { id: 1, name: "Jhonatan Barata de Oliveira", active: true, isMe: true },
        { id: 2, name: "Maria Aparecida de Souza Nascimento Filho", active: true, isMe: false },
      ],
      selectedSellerId: null,
    },
    assistant: {
      configured: true,
      publicName: "Assistente Comercial HBX",
      published: true,
      runtimeEnabled: true,
      channelArmed: true,
      active: true,
      updatedAt: ISO(-1),
    },
  };
}

/**
 * Painel das costas (GET /painel-modulo/:modulo) — o cartão que se monta
 * dentro do menu lateral. É o print nº1 do dono: o painel sobe e come o
 * item "Automação" da navegação. Contrato em components/hbx/costas-panel.tsx.
 */
export function painelModuloHostil(modulo: string) {
  return {
    modulo,
    titulo: "Disparos da campanha de prospecção",
    legenda: "Últimos 7 dias corridos, incluindo finais de semana",
    tom: "atencao",
    hero: { valor: "0/26", rotulo: "Pausada", nota: "Fora da janela comercial configurada" },
    serie: [4, 9, 2, 14, 7, 0, 0],
    serieRotulo: "Mensagens entregues por dia",
    metricas: [
      { rotulo: "Taxa de resposta acumulada", valor: "12,4%", tom: "ok" },
      { rotulo: "Créditos restantes", valor: "49.770", tom: "neutro" },
      { rotulo: "Bloqueios reportados", valor: "0", tom: "ok" },
    ],
    barras: [
      { rotulo: "Distribuidora De Agua Mineral E Bebidas", valor: 18, pct: 72, texto: "18 leads", tom: "ok" },
      { rotulo: "Comércio Atacadista De Produtos Alimentícios", valor: 7, pct: 28, texto: "7 leads", tom: "neutro" },
    ],
    fatos: [
      { rotulo: "Último disparo", valor: "ontem às 18:42", tom: "neutro" },
      { rotulo: "Próxima janela", valor: "segunda-feira, 09:00", tom: "atencao" },
    ],
    rodape: "O robô nunca dispara fora da janela comercial configurada.",
  };
}

/** Conversas do /conversas e do painel lateral — mesma régua de hostilidade. */
export function conversasHostis() {
  return {
    items: NOMES_LONGOS.map((nome, i) => ({
      id: `conv-${i}`,
      contactName: nome,
      contactPhone: "+5519981874096",
      lastMessage:
        "Boa tarde! Recebi o orçamento e vou levar para a diretoria analisar. Consegue me mandar também a proposta com o plano anual?",
      lastMessageAt: ISO(-i),
      unreadCount: i * 3,
      channel: "whatsapp",
      status: STATUS_LONGOS[i % STATUS_LONGOS.length].status,
      statusLabel: STATUS_LONGOS[i % STATUS_LONGOS.length].label,
      avatarUrl: null,
      assignedTo: { id: 1, name: "Jhonatan Barata de Oliveira" },
    })),
    total: NOMES_LONGOS.length,
  };
}
