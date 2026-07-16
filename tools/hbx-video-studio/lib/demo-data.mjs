const DEMO_DATE = '2026-07-17';

export const DEMO_PRODUCTS = Object.freeze([
  { id: 101, name: 'Galão 20L', unidade: 'galao', usaLogistica: true, price: 15, priceCents: 1500, status: 'active' },
  { id: 102, name: 'Fardo 500 ml', unidade: 'un', usaLogistica: true, price: 12, priceCents: 1200, status: 'active' },
  { id: 103, name: 'Gelo 5 kg', unidade: 'kg', usaLogistica: true, price: 11, priceCents: 1100, status: 'active' },
  { id: 104, name: 'Suporte para galão', unidade: 'un', usaLogistica: true, price: 28, priceCents: 2800, status: 'active' },
]);

export const DEMO_LOGISTICS_PRODUCTS = Object.freeze(
  DEMO_PRODUCTS.map((product) => ({
    id: product.id,
    nome: product.name,
    unidade: product.unidade,
    precoCatalogo: product.price,
  })),
);

export const DEMO_CLIENTS = Object.freeze([
  client('cliente-padaria', 'Padaria Primavera', '(19)99702-4801', 'Rua das Acácias, 145', 'Centro', [1, 3, 5], 'aberto', 0),
  client('cliente-mercado', 'Mercado Central', '(19)99702-4802', 'Avenida Brasil, 820', 'Jardim Novo', [2, 5], 'mensal', 86),
  client('cliente-condominio', 'Condomínio das Flores', '(19)99702-4803', 'Rua das Palmeiras, 300', 'Vila Verde', [1, 4], 'na_hora', 0),
  client('cliente-academia', 'Academia Movimento', '(19)99702-4804', 'Avenida Paulista, 71', 'Bela Vista', [3, 6], 'aberto', 20),
  client('cliente-restaurante', 'Restaurante Sabor Caseiro', '(19)99702-4805', 'Rua do Comércio, 52', 'Centro', [2, 4, 6], 'pendura', 48),
  client('cliente-petshop', 'Pet Shop Amigo', '(19)99702-4806', 'Rua dos Ipês, 911', 'Jardim Azul', [5], 'mensal', 0),
  client('cliente-farmacia', 'Farmácia Boa Saúde', '(19)99702-4807', 'Avenida Norte, 110', 'Santa Clara', [1, 3], 'aberto', 0),
  client('cliente-escola', 'Escola Pequeno Saber', '(19)99702-4808', 'Rua das Crianças, 45', 'Jardim Sol', [2, 5], 'mensal', 120),
]);

function client(id, name, phone, endereco, bairro, diasEntrega, formaPagamento, debitoAtual) {
  const phoneNormalized = phone.replace(/\D/g, '');
  return {
    id,
    name,
    cnpj: null,
    phone,
    phoneNormalized,
    endereco,
    numero: endereco.split(',').at(-1)?.trim() || null,
    cidade: 'Campinas',
    uf: 'SP',
    isLead: false,
    isCliente: true,
    isFornecedor: false,
    origin: 'manual',
    contatosCount: 1,
    pendencias: [],
    diasEntrega,
    duplicataDe: null,
    debitoAtual,
    formaPagamento,
    diaFechamento: formaPagamento === 'mensal' ? 30 : null,
    entregasCount: 12,
    bairro,
  };
}

const COORDS = Object.freeze({
  'cliente-padaria': [-22.90512, -47.06088],
  'cliente-mercado': [-22.90744, -47.05641],
  'cliente-condominio': [-22.90105, -47.05025],
  'cliente-academia': [-22.89671, -47.04689],
  'cliente-restaurante': [-22.89291, -47.05318],
  'cliente-petshop': [-22.88874, -47.06172],
});

const CLIENT_BY_ID = new Map(DEMO_CLIENTS.map((item) => [item.id, item]));
const PRODUCT_BY_ID = new Map(DEMO_PRODUCTS.map((item) => [item.id, item]));

const ROUTE_BLUEPRINT = Object.freeze([
  stop('entrega-001', 'cliente-padaria', [[101, 2]], '09:55', 'Entregar na porta lateral.'),
  stop('entrega-002', 'cliente-mercado', [[102, 3]], '10:12', null),
  stop('entrega-003', 'cliente-condominio', [[101, 6]], '10:28', 'Portaria bloco B.'),
  stop('entrega-004', 'cliente-academia', [[101, 2], [103, 1]], '10:46', null),
  stop('entrega-005', 'cliente-restaurante', [[101, 4], [103, 2]], '11:05', 'Recebe: Dona Marta.'),
  stop('entrega-006', 'cliente-petshop', [[102, 2]], '11:22', null),
]);

function stop(id, clientId, itemSpecs, hhmm, notes) {
  const clientRecord = CLIENT_BY_ID.get(clientId);
  const coords = COORDS[clientId] || [null, null];
  const items = itemSpecs.map(([productId, quantity], index) => {
    const product = PRODUCT_BY_ID.get(productId);
    return {
      id: `${id}-item-${index + 1}`,
      qtdPrevista: quantity,
      qtdEntregue: null,
      valorUnit: product.price,
      produto: { id: product.id, nome: product.name, unidade: product.unidade },
    };
  });
  const value = items.reduce((total, item) => total + item.qtdPrevista * item.valorUnit, 0);
  const totalQuantity = items.reduce((total, item) => total + item.qtdPrevista, 0);
  const firstProduct = items[0]?.produto || null;
  return {
    id,
    status: 'agendada',
    quantidade: totalQuantity,
    valor: value,
    scheduledAt: `${DEMO_DATE}T09:00:00-03:00`,
    deliveredAt: null,
    deliveredLat: null,
    deliveredLng: null,
    cobrancaStatus: 'pendente',
    notes,
    cliente: {
      id: clientRecord.id,
      nome: clientRecord.name,
      endereco: clientRecord.endereco,
      cidade: clientRecord.cidade,
      uf: clientRecord.uf,
      lat: coords[0],
      lng: coords[1],
      phone: clientRecord.phoneNormalized,
      formaPagamento: clientRecord.formaPagamento,
      metodoPadrao: clientRecord.formaPagamento === 'na_hora' ? 'pix' : null,
      saldoAberto: clientRecord.debitoAtual,
      limiteFiado: clientRecord.formaPagamento === 'pendura' ? 100 : 150,
    },
    contato: { id: `${clientId}-contato`, nome: clientRecord.name, whatsapp: clientRecord.phoneNormalized, phone: clientRecord.phoneNormalized },
    produto: firstProduct,
    itens: items,
    rotaOrdem: null,
    etaAt: `${DEMO_DATE}T${hhmm}:00-03:00`,
    localApelido: clientId === 'cliente-condominio' ? 'Portaria B' : null,
    entregador: { id: 77, nome: 'Carlos Entregador', email: 'carlos@demo.hbx' },
    updatedAt: `${DEMO_DATE}T09:40:00-03:00`,
    comprovante: {
      fotoId: null,
      assinaturaId: null,
      fotoEnviada: false,
      assinaturaEnviada: false,
      codigoGerado: false,
      confirmadoAt: null,
    },
  };
}

export function createDemoState({ scenario = 'standard' } = {}) {
  const deliveredIds = new Set();
  if (scenario === 'standard' || scenario === 'commercial' || scenario === 'admin') {
    deliveredIds.add('entrega-001');
    deliveredIds.add('entrega-002');
  } else if (scenario === 'driver') {
    deliveredIds.add('entrega-001');
  } else if (scenario === 'last-stop') {
    for (const stopItem of ROUTE_BLUEPRINT.slice(0, -1)) deliveredIds.add(stopItem.id);
  }

  return {
    scenario,
    started: scenario === 'driver' || scenario === 'last-stop',
    deliveredIds,
    generated: false,
    routeDate: DEMO_DATE,
  };
}

export function buildRoute(state) {
  const openStops = ROUTE_BLUEPRINT.filter((item) => !state.deliveredIds.has(item.id));
  const currentOpenId = openStops[0]?.id;
  const items = ROUTE_BLUEPRINT.map((blueprint, index) => {
    const delivered = state.deliveredIds.has(blueprint.id);
    const status = delivered ? 'entregue' : state.started && blueprint.id === currentOpenId ? 'em_rota' : 'agendada';
    return {
      ...structuredClone(blueprint),
      status,
      rotaOrdem: index,
      deliveredAt: delivered ? `${DEMO_DATE}T09:${String(18 + index * 7).padStart(2, '0')}:00-03:00` : null,
      itens: blueprint.itens.map((item) => ({ ...item, qtdEntregue: delivered ? item.qtdPrevista : null })),
      comprovante: delivered
        ? { ...blueprint.comprovante, confirmadoAt: `${DEMO_DATE}T09:${String(18 + index * 7).padStart(2, '0')}:00-03:00` }
        : blueprint.comprovante,
    };
  });

  return {
    date: state.routeDate,
    total: items.length,
    effectsEnabled: true,
    routeId: 'demo-route-2026-07-17',
    trackingRequired: false,
    trackingSessionId: null,
    trackingStatus: null,
    moduloFinanceiroAtivo: true,
    pix: { chave: 'financeiro@aguaclara.demo', nome: 'AGUA CLARA', cidade: 'CAMPINAS' },
    avisoChegandoAtivo: true,
    avisoChegandoDistanciaM: 500,
    comprovante: { fotoObrigatoria: false, assinaturaObrigatoria: false, codigoObrigatorio: false },
    items,
  };
}

export function buildRoutePlan(state) {
  state.started = true;
  const route = buildRoute(state);
  const open = route.items.filter((item) => item.status !== 'entregue' && item.status !== 'cancelada');
  return {
    date: state.routeDate,
    total: open.length,
    routeId: route.routeId,
    trackingRequired: false,
    trackingSessionId: null,
    trackingStatus: null,
    semCoordenada: 0,
    distanciaTotalKm: 18.4,
    terminoPrevisto: open.at(-1)?.etaAt || null,
    velocidadeMediaKmH: 28,
    tempoParadaMin: 5,
    paradas: open.map((item, index) => ({
      id: item.id,
      rotaOrdem: index,
      etaAt: item.etaAt,
      semCoordenada: false,
      lat: item.cliente.lat,
      lng: item.cliente.lng,
      status: index === 0 ? 'em_rota' : 'agendada',
      nome: item.cliente.nome,
    })),
  };
}

export function confirmDelivery(state, deliveryId) {
  if (!ROUTE_BLUEPRINT.some((item) => item.id === deliveryId)) {
    throw new Error(`Entrega demo desconhecida: ${deliveryId}`);
  }
  state.deliveredIds.add(deliveryId);
  state.started = true;
  return { id: deliveryId, status: 'entregue', deliveredAt: `${DEMO_DATE}T10:31:00-03:00` };
}

export function buildSummary(state) {
  const delivered = buildRoute(state).items.filter((item) => item.status === 'entregue');
  const received = delivered
    .filter((item) => item.cliente.formaPagamento !== 'mensal' && item.cliente.formaPagamento !== 'pendura')
    .reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const due = delivered
    .filter((item) => item.cliente.formaPagamento === 'mensal' || item.cliente.formaPagamento === 'pendura')
    .reduce((sum, item) => sum + Number(item.valor || 0), 0);
  return { date: DEMO_DATE, entregues: delivered.length, recebidoHoje: received, aReceber: due + 134 };
}

export function buildClientsResult(query = '') {
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const items = normalized
    ? DEMO_CLIENTS.filter((item) => item.name.toLocaleLowerCase('pt-BR').includes(normalized))
    : [...DEMO_CLIENTS];
  return { page: 1, pageSize: 100, total: items.length, totalPages: 1, items };
}

export function buildClientDetail(id) {
  const item = CLIENT_BY_ID.get(id) || DEMO_CLIENTS[0];
  const [lat, lng] = COORDS[item.id] || [-22.90512, -47.06088];
  return {
    id: item.id,
    name: item.name,
    tipo: 'pf',
    cnpj: null,
    document: null,
    endereco: item.endereco,
    numero: item.numero,
    bairro: item.bairro,
    cidade: item.cidade,
    uf: item.uf,
    cep: '13010-100',
    lat,
    lng,
    geoFonte: 'gps_entrega',
    whatsapp: item.phoneNormalized,
    email: null,
    isLead: false,
    isCliente: true,
    isFornecedor: false,
    formaPagamento: item.formaPagamento,
    metodoPadrao: item.formaPagamento === 'na_hora' ? 'pix' : null,
    contabilizar: true,
    diaFechamento: item.diaFechamento,
    limiteFiado: 150,
    avisarCobranca: true,
    contatoPrincipalId: `${item.id}-contato`,
    locais: [{
      id: `${item.id}-local`,
      apelido: item.id === 'cliente-condominio' ? 'Portaria B' : 'Principal',
      endereco: item.endereco,
      numero: item.numero,
      bairro: item.bairro,
      cidade: item.cidade,
      uf: item.uf,
      cep: '13010-100',
      lat,
      lng,
      geoFonte: 'gps_entrega',
      isPrincipal: true,
      ativo: true,
    }],
    telefones: [{
      id: `${item.id}-contato`,
      nome: item.name,
      whatsapp: item.phoneNormalized,
      phone: item.phoneNormalized,
      isPrincipal: true,
    }],
  };
}

export function buildDayPreview(date = DEMO_DATE) {
  return {
    date,
    clientes: ROUTE_BLUEPRINT.slice(0, 5).map((item) => ({
      customerProfileId: item.cliente.id,
      nome: item.cliente.nome,
      localId: item.localApelido ? `${item.cliente.id}-local` : null,
      localApelido: item.localApelido,
      itens: item.itens.map((entry) => ({ productId: entry.produto.id, nome: entry.produto.nome, qtd: entry.qtdPrevista })),
    })),
  };
}

export function buildClientProducts(clientId) {
  const picks = clientId === 'cliente-restaurante' ? [101, 103] : clientId === 'cliente-mercado' ? [102] : [101];
  return picks.map((productId, index) => {
    const product = PRODUCT_BY_ID.get(productId);
    return {
      id: `${clientId}-produto-${productId}`,
      customerProfileId: clientId,
      productId,
      qtdPadrao: index === 0 ? 2 : 1,
      precoAcordado: product.price,
      frequenciaDias: null,
      diasSemana: '1,3,5',
      proximaData: `${DEMO_DATE}T09:00:00-03:00`,
      ativo: true,
      localId: null,
      produto: { id: product.id, nome: product.name, unidade: product.unidade, precoCatalogo: product.price },
    };
  });
}

export function firstOpenCoordinates(state) {
  const first = buildRoute(state).items.find((item) => item.status !== 'entregue' && item.status !== 'cancelada');
  return first ? { latitude: first.cliente.lat, longitude: first.cliente.lng, accuracy: 12 } : { latitude: -22.90512, longitude: -47.06088, accuracy: 12 };
}
