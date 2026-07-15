import { ServiceUnavailableException } from '@nestjs/common';
import type { WebscrapingRuntimeDiagnostic } from '../../../modules/webscraping-runtime.util';
import { buildLocalHbxEngineUrls, type HbxEnginePurpose } from '../../hbx-engine-pool.service';
import type { LeadQualityV2, LeadQualityV2SalesProfile } from '../../lead-quality-v2';
import { BLOCK_GLOBAL_POOL_STATUSES } from './radar-disposition-rules';
import waMessageTemplates from './wa-message-templates.json';

// Reexporta a FONTE ÚNICA de disposição de card pra quem importa o barrel shared
// (distribution mixin, e vendas.service.ts via worker C). O mapa mestre + helpers
// (resolveDisposition, isGlobalBlockStatus, isOwnHideStatus, listas derivadas) vivem
// em radar-disposition-rules.ts.
export * from './radar-disposition-rules';

export const PLACES_NEW_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
export const PLACES_NEW_DETAILS_URL = 'https://places.googleapis.com/v1/places';
export const PLACES_TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
export const PLACES_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
export const MAX_QUANTITY = 20;
export const HBX_PJ_MAX_QUANTITY = 100;
export const HBX_PEOPLE_MAX_QUANTITY = 100;
export const DEFAULT_HBX_SCRAPING_ENGINE_URL = 'http://localhost:8001';
export const GLOBAL_CACHE_TTL_HOURS = 24;
export const RECENT_HISTORY_LIMIT = 20;
export const IBGE_CITIES_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome';
export const CITY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const MASS_DATA_INTERNAL_SEGMENTS = [
  // Genéricos REMOVIDOS (27/06): 'empresas','comércio','serviços','lojas','whatsapp','telefone' — não são
  // segmentos, são termos guarda-chuva que o motor responde com o mesmo top-N genérico/duplicado. No TOPO,
  // faziam o cursor moer combo improdutivo antes de chegar nos específicos (padaria, sorveteria, ótica…) que
  // TÊM lead virgem. Lista agora é só segmento real.
  'restaurantes',
  'mercados',
  'oficinas',
  'auto peças',
  'salões de beleza',
  'barbearias',
  'cosméticos',
  'perfumarias',
  'farmácias',
  'clínicas',
  'dentistas',
  'pet shops',
  'materiais de construção',
  'papelarias',
  'lojas de roupas',
  'assistência técnica',
  'hotéis',
  'pousadas',
  'distribuidoras',
  'contabilidades',
  'imobiliárias',
  'academias',
  'supermercados',
  'padarias',
  'açougues',
  'postos de combustível',
  'lava rápido',
  'funilarias',
  'borracharias',
  'auto centers',
  'clínicas veterinárias',
  'ótica',
  'joalherias',
  'floriculturas',
  'gráficas',
  'marcenarias',
  'serralherias',
  'vidraçarias',
  'transportadoras',
  'depósitos de bebidas',
  'lojas de móveis',
  'lojas de eletrodomésticos',
  'informática',
  'assistência celular',
  'escolas',
  'cursos profissionalizantes',
  'laboratórios',
  'fisioterapia',
  'estética',
  'pilates',
  'buffets',
  'eventos',
  'pizzarias',
  'hamburguerias',
  'sorveterias',
  'cafeterias',
  'confeitarias',
  'lanchonetes',
  'lojas de calçados',
  'lojas de acessórios',
  'lojas de bijuterias',
  'moda feminina',
  'moda masculina',
  'moda infantil',
  'uniformes',
  'malharias',
  'costureiras',
  'lavanderias',
  'chaveiros',
  'relojoarias',
  'papel de parede',
  'cortinas e persianas',
  'tapeçarias',
  'decoradores',
  'arquitetos',
  'engenheiros',
  'construtoras',
  'empreiteiras',
  'elétricas',
  'hidráulicas',
  'ar condicionado',
  'refrigeração',
  'dedetizadoras',
  'limpeza comercial',
  'segurança eletrônica',
  'monitoramento',
  'portarias',
  'condomínios',
  'seguros',
  'corretoras',
  'despachantes',
  'advogados',
  'cartórios',
  'consultorias',
  'agências de marketing',
  'produtoras de vídeo',
  'fotógrafos',
  'estúdios',
  'mecânicas diesel',
  'motos',
  'autoescolas',
  'guinchos',
  'locadoras de veículos',
  'turismo',
  'agências de viagem',
  'motéis',
  'hostels',
  'casas de ração',
  'agropecuárias',
  'jardinagem',
  'piscinas',
  'academias de luta',
  'nutricionistas',
  'psicólogos',
  'fonoaudiólogos',
  'clínicas médicas',
  'radiologia',
  'material hospitalar',
  'equipamentos industriais',
  'ferramentas',
  'parafusos',
  'embalagens',
  'brindes',
  'copiadoras',
  'lan houses',
  'provedores de internet',
  'energia solar',
  'marmorarias',
  'calhas',
  'telhados',
];
export const ACRE_CITIES_FALLBACK = [
  'Acrelândia',
  'Assis Brasil',
  'Brasiléia',
  'Bujari',
  'Capixaba',
  'Cruzeiro do Sul',
  'Epitaciolândia',
  'Feijó',
  'Jordão',
  'Mâncio Lima',
  'Manoel Urbano',
  'Marechal Thaumaturgo',
  'Plácido de Castro',
  'Porto Acre',
  'Porto Walter',
  'Rio Branco',
  'Rodrigues Alves',
  'Santa Rosa do Purus',
  'Sena Madureira',
  'Senador Guiomard',
  'Tarauacá',
  'Xapuri',
];
export const AUTONOMOUS_MASS_DATA_LOCATION_FALLBACK = [
  { city: 'São Paulo', state: 'SP' },
  { city: 'Rio de Janeiro', state: 'RJ' },
  { city: 'Belo Horizonte', state: 'MG' },
  { city: 'Curitiba', state: 'PR' },
  { city: 'Porto Alegre', state: 'RS' },
  { city: 'Florianópolis', state: 'SC' },
  { city: 'Salvador', state: 'BA' },
  { city: 'Recife', state: 'PE' },
  { city: 'Fortaleza', state: 'CE' },
  { city: 'Goiânia', state: 'GO' },
  { city: 'Brasília', state: 'DF' },
  { city: 'Vitória', state: 'ES' },
  { city: 'Cuiabá', state: 'MT' },
  { city: 'Campo Grande', state: 'MS' },
  { city: 'Manaus', state: 'AM' },
  { city: 'Belém', state: 'PA' },
  { city: 'São Luís', state: 'MA' },
  { city: 'João Pessoa', state: 'PB' },
  { city: 'Maceió', state: 'AL' },
  { city: 'Natal', state: 'RN' },
];
export const AUTONOMOUS_MASS_DATA_DEFAULT_TASKS = 300;
export const AUTONOMOUS_MASS_DATA_MAX_TASKS = 1000;
export const DEFAULT_MASS_DATA_ENGINE_URLS = buildLocalHbxEngineUrls();
export const TURBO_OPERATIONAL_CONFIG_KEY = 'turbo_noturno';
export const RADAR_RESERVATION_TTL_MS = 72 * 60 * 60 * 1000;
export const RADAR_REGION_MAX_RADIUS_KM = 250;
// Status que somem da VITRINE do Radar (usado em `notIn`/`in` de queries de pool e
// companyState). DERIVA da fonte única `radar-disposition-rules.ts`:
//   - BLOCK_GLOBAL_POOL_STATUSES = motivos que bloqueiam GLOBAL (some pra todas as
//     empresas) → hoje: voicemail, no_whatsapp, invalid_whatsapp, invalid_phone,
//     opt_out, do_not_contact, complaint, blocked. (`no_answer` SAIU; `voicemail` ENTROU.)
//   - OWN_HIDE_ONLY_STATUSES = marcadores de companyState que escondem o card só da
//     PRÓPRIA empresa (recusa leve: descartou/escondeu/negativou) — não bloqueiam global,
//     mas continuam protegidos pra não ressuscitar pra quem dispôs.
// `optout` (sem underscore) fica como alias defensivo de dados legados.
const OWN_HIDE_ONLY_STATUSES = [
  'negative',
  'denied',
  'discarded',
  'hidden',
  'lost',
  'optout',
] as const;

export const RADAR_PROTECTED_STATUSES = Array.from(
  new Set<string>([
    ...BLOCK_GLOBAL_POOL_STATUSES,
    ...OWN_HIDE_ONLY_STATUSES,
  ]),
) as readonly string[];

export type RuntimeStatus = 'online' | 'degraded';
export type ExternalRuntimeStatus = 'online' | 'offline';
export type SearchSource = 'history' | 'google' | 'hbx' | 'hybrid' | 'global_cache' | 'radar_database';
export type WebscrapingEngine = 'google' | 'hbx';
export type HbxTargetType = 'pj' | 'pf' | 'agenda_pf';
export type LeadQualityStatus =
  | 'approved'
  | 'segment_mismatch'
  | 'weak_contact'
  | 'generic_directory'
  | 'invalid'
  | 'duplicate';
export type LeadQualityResult = {
  status: LeadQualityStatus;
  billable: boolean;
  segmentMatchScore: number;
  contactQualityScore: number;
  commercialScore: number;
  reasons: string[];
};
export type HbxVisibilityTier =
  | 'candidate'
  | 'list_basic'
  | 'enrichment_pending'
  | 'lead_plus_qualified'
  | 'review_backup'
  | 'blocked';
export type HbxDeliveryProduct = 'list' | 'lead_plus';
export type HbxDeliveryClassification = {
  visibilityTier: HbxVisibilityTier;
  billable: boolean;
  debitEligible: boolean;
  deliveryProduct: HbxDeliveryProduct;
  qualityReason: string;
};
export type SearchRunStatus = 'completed' | 'partial_error' | 'completed_with_errors' | 'completed_insufficient_results';
export type WebscrapingSearchRunStatus =
  | 'queued'
  | 'running'
  | 'sleeping'
  | 'completed'
  | 'partial_error'
  | 'completed_insufficient_results'
  | 'failed'
  | 'canceled';
export type RadarOperationalState = 'funcionando' | 'pausado' | 'parado';

// Quando a busca ESGOTA a oferta (cidade/segmento secaram e entregou menos que o pedido —
// NÃO quando pausou por cota), o Radar oferece expandir em 1 toque: ampliar alcance pra cidades
// vizinhas e/ou incluir segmentos parecidos. A UI re-dispara a MESMA busca já expandida.
export type RadarExpansionSuggestion = {
  city: string;
  state: string | null;
  segment: string;
  deliveredCount: number;
  requestedQuantity: number;
  // Ampliar alcance: raio atual e o próximo nível sugerido (null = não dá pra subir mais).
  currentRadiusKm: number;
  nextRadiusKm: number | null;
  // Incluir segmentos parecidos (já formatados pro vendedor); vazio = não há vizinhos conhecidos.
  neighborSegments: string[];
  headline: string;
  widenReachLabel: string | null;
  widenSegmentLabel: string | null;
};

export type WebscrapingSearchRunItemStatus = 'found' | 'duplicate' | 'skipped' | 'invalid';
export type HbxBatchStatus =
  | 'queued_wait'
  | 'running_batch'
  | 'batch_success'
  | 'empty_batch'
  | 'batch_error'
  | 'engine_error'
  | 'radar_resting'
  | 'completed'
  | 'completed_insufficient_results'
  | 'failed'
  | 'canceled';
export type HbxEngineSearchOutput = {
  results: WebscrapingContactResult[];
  status: SearchRunStatus;
  message: string | null;
  httpStatus: number | null;
  rawErrorMessage: string | null;
  urlsDiscovered: number;
  pagesFetched: number;
  parsedContacts: number;
  queriesGenerated?: string[];
  sourceMetrics?: Array<Record<string, any>>;
  missingRequiredChannel?: number;
  approvedCount?: number;
  rejectedCount: number;
  duplicateCount: number;
};

export type RadarSearchRunMetrics = {
  rawFoundCount: number;
  hardBlockedCount: number;
  negativeBlockedCount: number;
  duplicateBlockedCount: number;
  noChannelBlockedCount: number;
  genericNameBlockedCount: number;
  segmentHardMismatchBlockedCount: number;
  savedListBasicCount: number;
  savedReviewBackupCount: number;
  leadPlusQualifiedCount: number;
  downgradedByQualityCount: number;
  urlsDiscovered: number;
  pagesFetched: number;
  parsedContacts: number;
  approvedContacts: number;
  reviewLowScore: number;
  downgradedToReview: number;
  rejectedLowScore?: number;
  rejectedBlockedDomain: number;
  rejectedInvalidPhone: number;
  rejectedGenericName: number;
  durationMs: number;
  engineId: string | null;
  engineIndex: number | null;
  sourceEngine: string | null;
  cacheHit: boolean;
  status: string;
};

export type RadarSearchRunMetricsPatch = Partial<RadarSearchRunMetrics> & {
  increment?: Partial<RadarSearchRunMetrics>;
  [key: string]: any;
};

export const SEGMENT_STOPWORDS = [
  'empresa',
  'empresas',
  'contato',
  'telefone',
  'whatsapp',
  'celular',
  'comercial',
  'servico',
  'servicos',
  'serviço',
  'serviços',
  'loja',
  'lojas',
  'profissional',
  'profissionais',
  'cidade',
  'ddd',
  'perto',
  'maps',
  'site',
];

export const SEGMENT_ALIASES: Record<string, string[]> = {
  dentista: ['dentista', 'odontologia', 'odontologico', 'odontológica', 'clinica odontologica', 'clínica odontológica'],
  clinica: ['clinica', 'clínica', 'saude', 'saúde', 'medico', 'médico', 'fisioterapia', 'estetica', 'estética'],
  oficina: ['oficina', 'mecanica', 'mecânica', 'auto center', 'funilaria', 'pneus', 'automotivo'],
  restaurante: ['restaurante', 'pizzaria', 'pizza', 'pizzaiolo', 'lanchonete', 'lanchonetes', 'lanches', 'hamburgueria', 'delivery', 'bar', 'choperia', 'marmitaria', 'marmitex', 'gastronomia', 'espetinho', 'japones', 'japonês', 'sushi'],
  imobiliaria: ['imobiliaria', 'imobiliária', 'imovel', 'imóvel', 'corretor', 'condominio', 'condomínio'],
  advogado: ['advogado', 'advocacia', 'juridico', 'jurídico'],
  academia: ['academia', 'fitness', 'musculacao', 'musculação', 'crossfit', 'pilates'],
  petshop: ['pet shop', 'petshop', 'veterinaria', 'veterinária', 'banho e tosa', 'racao', 'ração'],
  mercado: ['mercado', 'supermercado', 'mercearia', 'atacarejo'],
  farmacia: ['farmacia', 'farmácia', 'drogaria'],
  salao: ['salao', 'salão', 'beleza', 'cabeleireiro', 'barbearia'],
  automotivo: ['automotivo', 'automotiva', 'auto center', 'oficina', 'mecanica', 'mecânica', 'pneus', 'borracharia', 'auto eletrica', 'auto elétrica'],
  pneus: ['pneus', 'auto center', 'borracharia', 'automotivo', 'automotiva'],
  alimentacao: ['alimentacao', 'alimentação', 'restaurante', 'pizzaria', 'pizza', 'lanchonete', 'bar', 'choperia', 'cafeteria', 'panificadora', 'padaria', 'mercado', 'supermercado', 'acougue', 'açougue', 'confeitaria', 'doceria', 'alimentos naturais'],
  beleza: ['beleza', 'salao', 'salão', 'barbearia', 'estetica', 'estética', 'clinica de estetica', 'clínica de estética', 'cosmeticos', 'cosméticos', 'perfumaria'],
};

export const HBX_CATEGORY_SEGMENTS: Record<string, string[]> = {
  alimentacao: [
    'restaurantes',
    'pizzarias',
    'lanchonetes',
    'bares',
    'cafeterias',
    'panificadoras',
    'confeitarias',
    'docerias',
    'alimentos naturais',
    'mercados',
    'supermercados',
    'açougues',
  ],
  beleza: [
    'salões de beleza',
    'clínicas de estética',
    'cosméticos',
    'perfumarias',
  ],
  automotivo: [
    'acessórios automotivos',
    'auto center',
    'centros automotivos',
    'auto peças',
    'oficinas mecânicas',
    'oficinas',
    'mecânicas',
    'auto elétricas',
    'auto escolas',
    'pneus',
    'borracharias',
    'concessionárias',
    'despachantes',
    'lava rápidos',
    'postos de combustível',
    'revendas de veículos',
    'vistorias veiculares',
  ],
  pneus: [
    'pneus',
    'auto center',
    'borracharias',
  ],
  'pneus automotivo auto center': [
    'pneus',
    'auto center',
    'borracharias',
    'oficinas mecânicas',
    'auto elétricas',
  ],
  'auto eletricas': [
    'auto elétricas',
    'auto center',
    'oficinas mecânicas',
  ],
  industria: [
    'caldeiraria',
    'cerâmicas',
    'componentes elétricos',
    'embalagens',
    'ferramentaria',
    'indústrias de plásticos',
    'indústrias alimentícias',
    'indústrias metalúrgicas',
    'máquinas industriais',
    'metalúrgicas',
    'químicas',
    'usinagem',
  ],
  logistica: [
    'atacadistas',
    'depósitos de bebidas',
    'distribuidoras',
    'fornecedoras industriais',
    'transportadoras',
  ],
  'atacado e logistica': [
    'atacadistas',
    'depósitos de bebidas',
    'distribuidoras',
    'fornecedoras industriais',
    'transportadoras',
  ],
  agro: [
    'agronegócios',
    'agropecuárias',
    'casas de ração',
    'implementos agrícolas',
    'nutrição animal',
    'produtos agrícolas',
  ],
  'agro e campo': [
    'agronegócios',
    'agropecuárias',
    'casas de ração',
    'implementos agrícolas',
    'nutrição animal',
    'produtos agrícolas',
  ],
};

// "Esgotou a oferta" → sugerir segmentos VIZINHOS ao pedido (ex.: barbearia → salão de beleza,
// estética, cabeleireiro). Reaproveita SEGMENT_ALIASES: indexa cada termo (chave OU valor) pros
// "irmãos" do mesmo grupo, e some o que o usuário já pediu. Sem inventar mapa novo.
const NEIGHBOR_SEGMENT_LABELS: Record<string, string> = {
  'salao': 'salões de beleza',
  'salão': 'salões de beleza',
  'beleza': 'salões de beleza',
  'cabeleireiro': 'cabeleireiros',
  'barbearia': 'barbearias',
  'estetica': 'clínicas de estética',
  'estética': 'clínicas de estética',
  'clinica de estetica': 'clínicas de estética',
  'clínica de estética': 'clínicas de estética',
  'cosmeticos': 'cosméticos',
  'cosméticos': 'cosméticos',
  'perfumaria': 'perfumarias',
  'restaurante': 'restaurantes',
  'pizzaria': 'pizzarias',
  'pizza': 'pizzarias',
  'lanchonete': 'lanchonetes',
  'lanchonetes': 'lanchonetes',
  'lanches': 'lanchonetes',
  'hamburgueria': 'hamburguerias',
  'bar': 'bares',
  'choperia': 'choperias',
  'cafeteria': 'cafeterias',
  'marmitaria': 'marmitarias',
  'padaria': 'padarias',
  'panificadora': 'panificadoras',
  'confeitaria': 'confeitarias',
  'doceria': 'docerias',
  'mercado': 'mercados',
  'supermercado': 'supermercados',
  'mercearia': 'mercearias',
  'acougue': 'açougues',
  'açougue': 'açougues',
  'oficina': 'oficinas mecânicas',
  'mecanica': 'oficinas mecânicas',
  'mecânica': 'oficinas mecânicas',
  'auto center': 'auto centers',
  'funilaria': 'funilarias',
  'pneus': 'pneus',
  'borracharia': 'borracharias',
  'automotivo': 'centros automotivos',
  'auto eletrica': 'auto elétricas',
  'auto elétrica': 'auto elétricas',
  'farmacia': 'farmácias',
  'farmácia': 'farmácias',
  'drogaria': 'drogarias',
  'academia': 'academias',
  'fitness': 'academias',
  'musculacao': 'academias',
  'musculação': 'academias',
  'crossfit': 'crossfit',
  'pilates': 'estúdios de pilates',
  'pet shop': 'pet shops',
  'petshop': 'pet shops',
  'veterinaria': 'clínicas veterinárias',
  'veterinária': 'clínicas veterinárias',
  'banho e tosa': 'banho e tosa',
  'racao': 'casas de ração',
  'ração': 'casas de ração',
  'clinica': 'clínicas',
  'clínica': 'clínicas',
  'saude': 'clínicas',
  'saúde': 'clínicas',
  'medico': 'clínicas médicas',
  'médico': 'clínicas médicas',
  'fisioterapia': 'fisioterapia',
  'dentista': 'dentistas',
  'odontologia': 'clínicas odontológicas',
  'imobiliaria': 'imobiliárias',
  'imobiliária': 'imobiliárias',
  'corretor': 'corretores de imóveis',
  'advogado': 'advogados',
  'advocacia': 'escritórios de advocacia',
};

// Chaves de SEGMENT_ALIASES que são GUARDA-CHUVA (categorias amplas), não segmentos irmãos —
// não sugerir "alimentação" pra quem pediu "padaria"; sugerir os IRMÃOS concretos do grupo.
const NEIGHBOR_UMBRELLA_KEYS = new Set([
  'alimentacao', 'beleza', 'automotivo', 'saude', 'clinica',
]);

// Raiz para casar singular/plural ("barbearias" do dropdown vs "barbearia" do alias).
function neighborStem(value: string) {
  return normalizeLookupValue(value).replace(/s$/, '');
}

// Dado o segmento pedido (uma ou várias frases separadas por vírgula), devolve até `limit`
// segmentos vizinhos rotulados pro vendedor — terminologia humana, sem repetir o que ele pediu.
// Só surge membro com rótulo humano conhecido (NEIGHBOR_SEGMENT_LABELS) — sem variantes cruas
// de busca tipo "pizzaiolo"/"odontologico".
export function buildRadarNeighborSegments(segment: string | null | undefined, limit = 4): string[] {
  const requestedRaw = String(segment || '')
    .split(',')
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!requestedRaw.length) return [];
  const requestedStems = new Set(requestedRaw.map((item) => neighborStem(item)));
  const seenLabelStems = new Set<string>();
  const ordered: string[] = [];
  const pushNeighbor = (token: string) => {
    const key = normalizeLookupValue(token);
    if (!key || NEIGHBOR_UMBRELLA_KEYS.has(key)) return;
    // Só termos com rótulo humano conhecido — corta variantes cruas de busca.
    const label = NEIGHBOR_SEGMENT_LABELS[key];
    if (!label) return;
    const labelStem = neighborStem(label);
    if (requestedStems.has(labelStem) || requestedStems.has(neighborStem(token))) return; // já pedido
    if (seenLabelStems.has(labelStem)) return; // já sugerido (singular/plural/variante)
    seenLabelStems.add(labelStem);
    ordered.push(label);
  };
  for (const requested of requestedRaw) {
    const requestedKey = normalizeLookupValue(requested);
    const requestedStem = neighborStem(requested);
    for (const [groupKey, members] of Object.entries(SEGMENT_ALIASES)) {
      const groupMembers = [groupKey, ...members];
      const groupKeys = groupMembers.map((item) => normalizeLookupValue(item));
      const groupStems = groupMembers.map((item) => neighborStem(item));
      const belongsToGroup = groupKeys.includes(requestedKey)
        || groupStems.includes(requestedStem)
        || groupKeys.some((item) => item && item.length >= 4 && requestedKey.length >= 4
          && (requestedKey.includes(item) || item.includes(requestedKey)));
      if (!belongsToGroup) continue;
      // Sugerir só os IRMÃOS concretos (members), nunca a chave guarda-chuva do grupo.
      for (const member of members) pushNeighbor(member);
    }
  }
  // De-dup por rótulo final (já garantido por seenLabelStems, mas defensivo).
  const seenLabels = new Set<string>();
  const deduped = ordered.filter((label) => {
    const key = normalizeLookupValue(label);
    if (seenLabels.has(key)) return false;
    seenLabels.add(key);
    return true;
  });
  return deduped.slice(0, Math.max(0, limit));
}

export const GENERIC_DIRECTORY_NAMES = [
  'empresa',
  'empresas',
  'sem nome',
  'contato',
  'home',
  'ir para o conteúdo',
  'ir para o conteudo',
  'laa',
  'mmm',
  'nnn',
  'whatsapp',
  'telefone',
  'lista telefonica',
  'lista telefônica',
  'comercial',
  'atendimento',
  'anuncie aqui',
  'guia comercial',
  'guia telefone',
  'lista de empresas',
];

export const GENERIC_DIRECTORY_PREFIXES = [
  '10 melhores',
  '20 melhores',
  '30 melhores',
  '40 melhores',
  '50 melhores',
  'melhores',
  'as melhores',
  'as melhores condicoes',
  'todos os estabelecimentos',
  'lista de empresas',
  'confira as melhores',
  'procurando',
  'encontre aqui',
  // C4 (calibracao round-2, 01/07): prefixo "encontre"/"encontrar" — medido: "Encontre
  // Salões de beleza: Goiânia, Go" passou como card.
  'encontre',
  'encontrar',
  'conheca',
  'portal',
  'guia',
  'blog',
  'preco de',
  'quanto custa',
  'gastronomia na',
  'gastronomia no',
  'gastronomia em',
  'sms para',
  'otimizacao seo',
  'whatsapp da',
  'whatsapp do',
  'whatsapp de',
  'contato encontrado',
];

export const GENERIC_DIRECTORY_CONTAINS = [
  'perto de mim',
  'pesquise outros',
  'pesquisar outros',
  'busque outros',
  'buscar outros',
  'resultado de pesquisa',
  'resultados de pesquisa',
  'confira as melhores',
  ' melhores ',
  'todos os estabelecimentos',
  'lista de empresas',
  'conheca o rio',
  'conheca santa',
  'noticias',
  'abre vagas',
  'lanca campanha',
  'reserve ja',
  'reserva ja',
  'quanto custa',
  'preco de',
  'orcamento',
  'sms para',
  'otimizacao seo',
  'marketing digital para',
  'terceirizacao',
  'trocar tela iphone',
  'locacao de aparelho',
  'telhado com',
  'estancia hidromineral',
  'estância hidromineral',
  'gastronomia completo',
];

// Hosts de marketplace/listagem de terceiro (sem contato próprio) — usado pelo quality
// gate comum e pelo web gate. FONTE ÚNICA: não duplicar em outro arquivo.
export const RADAR_MARKETPLACE_HOST_HINTS = [
  'catalogo',
  'getninjas',
  'ifood',
  'mercadolivre',
  'olx',
  'portal',
  'solutudo',
  'telelistas',
];

// Domínios de "site oficial" que na verdade são diretório/agregador (nunca o site real
// do lead) — usado por isBlockedLeadOfficialWebsite e pelo web gate. FONTE ÚNICA.
export const RADAR_BLOCKED_OFFICIAL_WEBSITE_DOMAINS = [
  'cardapio.menu',
  'restaurantguru.com',
  'restaurantguru.com.br',
  'econodata.com.br',
  'solutudo.com.br',
  'benditoguia.com.br',
  'polomap.com',
  'top-rated.online',
  'locaisdobrasil.com.br',
  'directmap.biz',
  'listaamarela.com.br',
  'paginasamarelas.cybo.com',
  'cybo.com',
  'gupy.io',
  'aguasdesaopedro.com.br',
  'linkedin.com',
  'pizzariaspertodemim.com',
  'siteindices.com',
  'tripadvisor.com',
  'tripadvisor.com.br',
  'urlm.com.br',
  'visitmestre.com',
];

// Palavras GRAMATICAIS do inglês que não existem em nome de empresa brasileira.
// 2+ distintas no nome = é frase/título em inglês, não um negócio local.
export const NON_BUSINESS_ENGLISH_STOPWORDS = new Set([
  'the', 'of', 'to', 'for', 'and', 'that', 'this', 'with', 'your', 'you',
  'in', 'on', 'at', 'by', 'from', 'into', 'about', 'their', 'they', 'what',
  'how', 'why', 'when', 'where', 'which', 'are', 'was', 'were', 'will', 'would',
  'can', 'could', 'should', 'has', 'have', 'had', 'does', 'did', 'its',
]);

// Lixo de scraping que os filtros PT NÃO pegam: títulos de página, portais GLOBAIS e idioma
// estrangeiro (ex.: "8 deaths that rocked the NASCAR world", "Official Site of the NHL",
// "30 Best Things to Do in Vancouver", "IBEXエアラインズ"). ALTA PRECISÃO: só marca sinais
// que jamais aparecem em nome de empresa local brasileira — não derruba negócio real.
export function looksLikeNonBusinessName(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  // 1) Script estrangeiro (grego, cirílico, hebraico, árabe, tailandês, CJK, coreano).
  if (/[Ͱ-ϿЀ-ӿ֐-׿؀-ۿ฀-๿　-ヿ㐀-鿿가-힯]/.test(raw)) {
    return true;
  }
  // 2) Separador de título de página da web (pipe / travessão entre partes).
  if (raw.includes('|') || /\s[–—]\s/.test(raw)) return true;
  // 3) Pergunta = título/artigo, não empresa.
  if (raw.includes('?')) return true;
  const words = raw.toLowerCase().split(/[^a-zà-ÿ0-9+]+/i).filter(Boolean);
  // 4) Nome comprido demais = título de página (empresa local tem nome curto).
  if (words.length > 9) return true;
  // 5) Frase em inglês: 2+ palavras gramaticais que não existem em nome de empresa BR.
  const englishHits = new Set(words.filter((word) => NON_BUSINESS_ENGLISH_STOPWORDS.has(word)));
  if (englishHits.size >= 2) return true;
  return false;
}

export const GENERIC_CATEGORY_HEADS = [
  'academias',
  'acessorios automotivos',
  'assistencia tecnica',
  'bares',
  'bares e restaurantes',
  'bijuterias',
  'borracharias',
  'calcados infantis',
  'clinicas de estetica',
  'clinicas medicas',
  'contabilidades',
  'dentistas',
  'distribuidores de bebidas',
  'farmacias',
  'farmacias e drogarias',
  'gesso',
  'imobiliarias',
  'loja de automotivo',
  'lojas de celulares',
  'malharias',
  'materiais de construcao',
  'moveis de escritorio',
  'oficinas',
  'oficinas mecanicas',
  'perfumarias',
  'perfumarias e cosmeticos',
  'pizzarias',
  'planos de saude',
  'saloes de beleza',
  'transporte',
  'transportes',
];

export const VERTICAL_TOKEN_GROUPS: Record<string, string[]> = {
  academia: ['academia', 'fitness', 'crossfit', 'pilates'],
  barbearia: ['barbearia', 'barbearias', 'salao', 'saloes', 'beleza', 'cabeleireiro'],
  farmacia: ['farmacia', 'farmacias', 'drogaria', 'drogarias'],
  imobiliaria: ['imobiliaria', 'imobiliarias', 'imovel', 'imoveis', 'corretor'],
  moda: ['moda', 'roupas', 'malharia', 'calcados', 'bijuterias'],
  oficina: ['oficina', 'oficinas', 'mecanica', 'automotivo', 'automotiva', 'auto'],
  restaurante: ['restaurante', 'restaurantes', 'bar', 'bares', 'lanchonete', 'pizzaria', 'pizza', 'pizzaiolo', 'choperia', 'marmitaria', 'marmitex', 'gastronomia', 'espetinho', 'japones', 'japonês', 'sushi'],
};

export let cityCache: {
  loadedAt: number;
  items: string[];
} | null = null;

export type NativeRuntimeDiagnostic = {
  status: RuntimeStatus;
  code: string;
  message: string;
  googleApiKeyConfigured: boolean;
};

export type HbxRuntimeDiagnostic = {
  status: ExternalRuntimeStatus;
  code: string;
  message: string;
  healthUrl: string;
  httpStatus: number | null;
};

export type WebscrapingRuntimeResponse = {
  native: NativeRuntimeDiagnostic;
  hbx: HbxRuntimeDiagnostic;
  quota: {
    remainingSearches: number | null;
    dailyLimit: number | null;
    isTrialLimited: boolean;
    accessMode: 'plan' | 'blocked';
  };
  diagnostics?: {
    checkedAt: string;
    nativeTechnicalMessage: string;
    hbxTechnicalMessage: string;
    legacy: WebscrapingRuntimeDiagnostic | null;
  };
};

export type WebscrapingSearchFilters = {
  minRating: number | null;
  minReviews: number | null;
  onlyWithWebsite: boolean;
  radiusKm?: number;
  scoreRange?: string | null;
};

export type WebscrapingContactResult = {
  [key: string]: any;
  placeId: string;
  name: string;
  phone: string;
  phoneDigits: string;
  rating: number | null;
  reviews: number | null;
  address: string | null;
  website: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  email?: string | null;
  emailStatus?: string | null;
  socialStatus?: string | null;
  socialConfidence?: number | null;
  googleMapsUrl?: string | null;
  whatsappStatus?: string | null;
  whatsappCheckStatus?: string | null;
  recommendedChannel?: string | null;
  source?: string | null;
  sourceEngine?: string | null;
  sourceUrl?: string | null;
  evidenceJson?: Record<string, any> | string | null;
  rejectReasons?: string[] | string | null;
  qualityReason?: string | null;
  visibilityTier?: string | null;
  deliveryProduct?: string | null;
  score?: number | null;
  opportunityScore?: number | null;
  opportunityReason?: string | null;
  enrichmentScore?: number | null;
  enrichmentJson?: Record<string, any> | string | null;
  qualityV2?: LeadQualityV2 | Record<string, any> | null;
  quality?: LeadQualityResult | null;
};

export type WebscrapingSearchResponse = {
  query: {
    city: string;
    state?: string | null;
    segment: string;
    quantity: number;
    engine: WebscrapingEngine;
    targetType: HbxTargetType;
    filters: WebscrapingSearchFilters;
  };
  meta: {
    historyId: string | null;
    source: SearchSource;
    sourceEngines?: string[];
    reusedCount: number;
    fetchedCount: number;
    totalStoredCount?: number;
    status?: SearchRunStatus;
    message?: string | null;
    technicalCacheUsed: boolean;
    technicalCacheReusedCount: number;
    technicalCacheValidUntil: string | null;
    requestedCount?: number;
    candidateCount?: number;
    deliveredCount?: number;
    filteredOutCount?: number;
    attempts?: number;
    requiredChannels?: RadarChannelFilter[];
    channelMatchMode?: RadarChannelMatchMode;
    requiredChannelRejectedCount?: number;
    queryTaskCount?: number;
    currentCity?: string | null;
    currentSegment?: string | null;
    currentQuery?: string | null;
    approved?: number;
    skipped?: number;
    duplicate?: number;
    urlsDiscovered?: number;
    pagesFetched?: number;
    parsedContacts?: number;
    queriesGenerated?: string[];
    sourceMetrics?: Array<Record<string, any>>;
    missingRequiredChannel?: number;
    searchStrategy?: {
      mode: string;
      reason?: string;
      targetCards?: number;
      maxProviderRounds?: number;
    };
    sourcePlan?: Array<{
      source: string;
      enabled: boolean;
      implemented: boolean;
      stopWhenEnough?: boolean;
    }>;
    sourceExpansion?: {
      googleTextualQueries?: string[];
      siteCrawlPaths?: string[];
      cnpjSeeds?: Array<Record<string, any>>;
      directorySeeds?: string[];
      verticalStrategies?: Array<Record<string, any>>;
      opportunitySignals?: Array<Record<string, any>>;
      reprocessRules?: Array<Record<string, any>>;
    };
    activeSources?: string[];
    pendingSources?: string[];
    sourceDiagnostics?: Array<Record<string, any>>;
    radarStageIssues?: Array<Record<string, any>>;
    nonBlockingIssues?: Array<Record<string, any>>;
    deliveryBlockers?: Array<Record<string, any>>;
  };
  results: Array<Omit<WebscrapingContactResult, 'placeId'>>;
};

export type WebscrapingSearchRunResponse = {
  id: string;
  runId: string;
  status: WebscrapingSearchRunStatus;
  city: string;
  state: string | null;
  segment: string;
  engine: WebscrapingEngine;
  targetType: HbxTargetType;
  targetQuantity: number;
  foundCount: number;
  importedCount: number;
  duplicateCount: number;
  skippedCount: number;
  errorMessage: string | null;
  attemptCount: number;
  failedBatchCount: number;
  consecutiveEmptyBatchCount: number;
  consecutiveEngineErrorCount: number;
  lastBatchError: string | null;
  lastBatchStatus: HbxBatchStatus | null;
  nextRetryAt: string | null;
  lastQueryUsed: string | null;
  lastEngineUrl: string | null;
  assignedEngineId: string | null;
  assignedEngineIndex: number | null;
  batchLimit: number;
  maxAttempts: number;
  operationalStatus?: 'healthy' | 'degraded';
  operationalMessage?: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  query: WebscrapingSearchResponse['query'];
  meta: WebscrapingSearchResponse['meta'] & {
    runId: string;
    duplicateCount: number;
    skippedCount: number;
    importedCount: number;
    operationalState?: RadarOperationalState;
    operationalReason?: string | null;
    operationalMessage?: string | null;
    expansionSuggestion?: RadarExpansionSuggestion | null;
  };
  items: Array<{
    id: string;
    placeId: string;
    name: string;
    phone: string;
    phoneDigits: string;
    rating?: number | null;
    reviews?: number | null;
    website: string | null;
    instagramUrl?: string | null;
    facebookUrl?: string | null;
    email?: string | null;
    emailStatus?: string | null;
    deliveryStatus?: string | null;
    enrichmentStatus?: string | null;
    socialStatus?: string | null;
    socialConfidence?: number | null;
    googleMapsUrl?: string | null;
    whatsappStatus?: string | null;
    whatsappCheckStatus?: string | null;
    recommendedChannel?: string | null;
    opportunityScore?: number | null;
    opportunityReason?: string | null;
    enrichmentScore?: number | null;
    qualityV2?: LeadQualityV2 | Record<string, any> | null;
    websiteKey: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    segment: string | null;
    source: string | null;
    status: WebscrapingSearchRunItemStatus;
    duplicateReason: string | null;
    sourceDiagnostics?: Array<Record<string, any>>;
    nonBlockingIssues?: Array<Record<string, any>>;
    deliveryBlockers?: Array<Record<string, any>>;
    createdAt: string;
  }>;
  results: Array<Omit<WebscrapingContactResult, 'placeId'>>;
};

export type WebscrapingHistorySummary = {
  id: string;
  city: string;
  segment: string;
  quantity: number;
  resultCount: number;
  filters: WebscrapingSearchFilters;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
  preview: string[];
  scope: 'company' | 'global';
  sourceLabel: string;
  cacheValidUntil?: string | null;
};

export type SearchContactsInput = {
  city?: string;
  segment?: string;
  quantity: number;
  state?: string | null;
  radiusKm?: number | null;
  originLat?: number | null;
  originLng?: number | null;
  engine?: WebscrapingEngine;
  targetType?: HbxTargetType;
  minRating?: number | null;
  minReviews?: number | null;
  onlyWithWebsite?: boolean;
  excludePhoneDigits?: string[];
  preferredChannels?: string[];
  requiredChannels?: string[];
  channelMatchMode?: 'prefer' | 'any_required' | 'all_required' | string | null;
  freshness?: 'live' | 'database_first' | 'hybrid' | string | null;
  salesProfile?: Partial<LeadQualityV2SalesProfile> | null;
  whatDoYouSell?: string | null;
  offerCategory?: string | null;
  targetAudience?: string[] | { labels?: string[]; notes?: string } | null;
  targetSegments?: string[] | { labels?: string[]; weights?: Record<string, number> } | null;
  avoidSegments?: string[] | { labels?: string[]; hardReject?: string[] } | null;
  hardRejectSegments?: string[] | null;
  leadPreferences?: Record<string, any> | null;
  negativeRules?: Record<string, any> | null;
};

export type SearchPlacesCandidate = {
  placeId: string;
  name: string;
};

export type PlaceDetails = {
  name: string;
  internationalPhoneNumber: string;
  formattedPhoneNumber: string;
  website: string;
  formattedAddress: string;
  rating: number | null;
  userRatingsTotal: number | null;
};

export type SearchExecutionContext = {
  companyId: number;
  userId: number;
  user: any;
};

export type NormalizedSearchInput = {
  city: string;
  state: string;
  segment: string;
  radiusKm: number;
  originLat: number | null;
  originLng: number | null;
  regionalCities: RegionalCity[];
  quantity: number;
  engine: WebscrapingEngine;
  targetType: HbxTargetType;
  filters: WebscrapingSearchFilters;
  filtersJson: string;
  searchSignature: string;
  cacheSignature: string;
  normalizedCity: string;
  normalizedSegment: string;
  excludePhoneDigits: string[];
  salesProfile: LeadQualityV2SalesProfile | null;
  preferredChannels: RadarChannelFilter[];
  requiredChannels: RadarChannelFilter[];
  channelMatchMode: RadarChannelMatchMode;
  freshness: 'live' | 'database_first' | 'hybrid';
};

export type SearchExecutionOptions = {
  historyIdHint?: string;
  skipRadarLookup?: boolean;
  skipRadarPersist?: boolean;
  skipPrivateHistory?: boolean;
  skipTechnicalCache?: boolean;
  recordUsage?: boolean;
  hbxEngineUrl?: string;
  usageEventType?: UsageEventType;
  purpose?: HbxEnginePurpose;
};

export type RegionalCity = {
  city: string;
  state: string;
  normalizedCity: string;
  distanceKm: number;
};

export type NormalizeSearchInputOptions = {
  allowMissingHbxState?: boolean;
};

export type UsageEventType = 'EXECUTED' | 'GOOGLE_SEARCH_EXECUTED' | 'GOOGLE_EMERGENCY_EXECUTED' | 'BLOCKED_DAILY_LIMIT';

export type UsageExecutionMeta = {
  source?: SearchSource;
  reusedCount?: number;
  fetchedCount?: number;
  technicalCacheUsed?: boolean;
  technicalCacheReusedCount?: number;
};

export type RadarWebsiteStatus = 'none' | 'present' | 'social_only' | 'weak' | 'unreachable' | 'unknown';
export type RadarOpportunityLevel = 'high' | 'medium' | 'low' | null;
export type RadarWhatsappCheckMode = 'off' | 'enrich' | 'only_valid';
export type RadarWhatsappCheckStatus = 'confirmed' | 'missing' | 'unverified';

export type RadarFiltersInput = {
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  radiusKm?: number | null;
  originLat?: number | null;
  originLng?: number | null;
  quantity?: number | null;
  limit?: number | null;
  page?: number | null;
  filterKey?: string | null;
  status?: string | null;
  ddd?: string | null;
  scoreRange?: string | null;
  source?: string | null;
  minRating?: number | null;
  minReviews?: number | null;
  noWebsite?: boolean | string | null;
  withWebsite?: boolean | string | null;
  weakWebsite?: boolean | string | null;
  validPhone?: boolean | string | null;
  likelyWhatsapp?: boolean | string | null;
  highOpportunity?: boolean | string | null;
  opportunityLevel?: string | null;
  includeHidden?: boolean | string | null;
  engine?: WebscrapingEngine | string | null;
  targetType?: HbxTargetType | string | null;
  desiredStock?: number | null;
  minimumStock?: number | null;
  whatsappCheckMode?: RadarWhatsappCheckMode | string | null;
  preferredChannels?: string[] | null;
  requiredChannels?: string[] | null;
  channelMatchMode?: 'prefer' | 'any_required' | 'all_required' | string | null;
  freshness?: 'live' | 'database_first' | 'hybrid' | string | null;
  salesProfile?: Partial<LeadQualityV2SalesProfile> | null;
  whatDoYouSell?: string | null;
  offerCategory?: string | null;
  targetAudience?: string[] | { labels?: string[]; notes?: string } | null;
  targetSegments?: string[] | { labels?: string[]; weights?: Record<string, number> } | null;
  avoidSegments?: string[] | { labels?: string[]; hardReject?: string[] } | null;
  hardRejectSegments?: string[] | null;
  leadPreferences?: Record<string, any> | null;
  negativeRules?: Record<string, any> | null;
};

export type RadarLeadEventType =
  | 'found'
  | 'imported_to_vendas'
  | 'contacted'
  | 'denied'
  | 'negative'
  | 'blocked'
  | 'opt_out'
  | 'discarded'
  | 'complaint'
  | 'no_answer'
  | 'no_whatsapp'
  | 'invalid_whatsapp'
  | 'hidden'
  | 'note'
  | 'duplicate'
  | 'ownership_reserved'
  | 'ownership_released'
  | 'presentation_email_previewed'
  | 'presentation_email_sent'
  | 'presentation_email_failed'
  | 'enriched'
  | 'whatsapp_checked'
  | 'status_changed';

export type RadarLeadStatus =
  | 'clean'
  | 'new'
  | 'reserved'
  | 'delivered'
  | 'approved'
  | 'sent_to_vendas'
  | 'in_attendance'
  | 'interested'
  | 'positive'
  | 'converted'
  | 'denied'
  | 'negative'
  | 'blocked'
  | 'opt_out'
  | 'discarded'
  | 'complaint'
  | 'no_answer'
  | 'voicemail'
  | 'no_whatsapp'
  | 'invalid_whatsapp'
  | 'duplicate'
  | 'rejected'
  | 'hidden';

export type RadarCampaignInput = {
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  mode?: string | null;
  targetType?: HbxTargetType | 'both' | string | null;
  targetTotal?: number | null;
  batchSize?: number | null;
  maxAttemptsPerTask?: number | null;
  nightOnly?: boolean | string | null;
  allowedStartHour?: number | null;
  allowedEndHour?: number | null;
  timezone?: string | null;
  preferredChannels?: string[] | null;
  requiredChannels?: string[] | null;
  channelMatchMode?: RadarChannelMatchMode | string | null;
  freshness?: 'live' | 'database_first' | 'hybrid' | string | null;
};

export type WebscrapingOperationalConfigInput = {
  enabled?: boolean | string | null;
  startHour?: number | null;
  startMinute?: number | null;
  endHour?: number | null;
  endMinute?: number | null;
  engineCount?: number | null;
  intensity?: string | null;
  memoryTargetGb?: number | null;
  batchSize?: number | null;
  maxAttemptsPerTask?: number | null;
  autonomousFillEnabled?: boolean | string | null;
  autonomousFillBatchSize?: number | null;
  forceNow?: boolean | string | null;
  forcedUntil?: string | null;
  timezone?: string | null;
  emergencyStop?: boolean | string | null;
  stopOutsideWindow?: boolean | string | null;
  weekdaysOnly?: boolean | string | null;
  weekendAlwaysOn?: boolean | string | null;
  factoryState?: string | null;
  factoryCity?: string | null;
  maxEngines?: number | null;
  minEngines?: number | null;
  drainTimeoutSeconds?: number | null;
  preferredChannels?: string[] | null;
  requiredChannels?: string[] | null;
  channelMatchMode?: RadarChannelMatchMode | string | null;
  freshness?: 'live' | 'database_first' | 'hybrid' | string | null;
};

export type MasterMassDataCampaignInput = RadarCampaignInput & WebscrapingOperationalConfigInput & {
  companyId?: number | string | null;
};

export type AutonomousMassDataStrategyMode = 'guided' | 'automatic';
export type AutonomousMassDataWorkReason = 'guided_filter' | 'low_stock' | 'low_duplicate_recent' | 'unexplored' | 'fallback_national';

export type AutonomousMassDataWork = {
  mode: AutonomousMassDataStrategyMode;
  state: string;
  city: string;
  segment: string;
  targetType: HbxTargetType;
  desiredStock: number;
  minimumStock: number;
  reason: AutonomousMassDataWorkReason;
  stockCount: number;
};

export type AutonomousMassDataCandidate = AutonomousMassDataWork & {
  key: string;
  taskExists: boolean;
  duplicateRatio: number;
  explored: boolean;
  lastWorkedAt: Date | null;
};

export type NormalizedRadarFilters = {
  city: string;
  state: string;
  segment: string;
  radiusKm: number;
  originLat: number | null;
  originLng: number | null;
  regionalCities: RegionalCity[];
  normalizedCity: string;
  normalizedSegment: string;
  quantity: number;
  limit: number;
  page: number;
  filterKey: string;
  status: string;
  ddd: string;
  scoreRange: string;
  source: string;
  minRating: number | null;
  minReviews: number | null;
  noWebsite: boolean;
  withWebsite: boolean;
  weakWebsite: boolean;
  validPhone: boolean;
  likelyWhatsapp: boolean;
  opportunityLevel: RadarOpportunityLevel;
  includeHidden: boolean;
  engine: WebscrapingEngine;
  targetType: HbxTargetType;
  desiredStock: number;
  minimumStock: number;
  stockOverride: boolean;
  whatsappCheckMode: RadarWhatsappCheckMode;
  preferredChannels: RadarChannelFilter[];
  requiredChannels: RadarChannelFilter[];
  channelMatchMode: RadarChannelMatchMode;
  freshness: 'live' | 'database_first' | 'hybrid';
  salesProfile: LeadQualityV2SalesProfile | null;
};

export type RadarChannelFilter = 'whatsapp' | 'instagram' | 'email' | 'website' | 'phone' | 'facebook';
export type RadarChannelMatchMode = 'prefer' | 'any_required' | 'all_required';

export type SearchHistoryRow = {
  id: string;
  userId: number;
  city: string;
  segment: string;
  quantity: number;
  filtersJson: string;
  searchSignature: string;
  resultCount: number;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date;
  places: Array<{
    id: string;
    placeId: string;
    rank: number;
    name: string;
    phone: string;
    phoneDigits: string;
    rating: number | null;
    reviews: number;
    address: string;
    website: string;
    source?: string | null;
    score?: number | null;
    opportunityReason?: string | null;
  }>;
};

export type GlobalCacheRow = {
  id: string;
  cacheSignature: string;
  normalizedCity: string;
  normalizedSegment: string;
  filtersJson: string;
  resultCount: number;
  cacheValidUntil: Date;
  createdAt: Date;
  updatedAt: Date;
  lastFetchedAt: Date;
  lastServedAt: Date;
  places: Array<{
    id: string;
    placeId: string;
    rank: number;
    name: string;
    phone: string;
    phoneDigits: string;
    rating: number | null;
    reviews: number;
    address: string;
    website: string;
  }>;
};

export type HistoryPlaceColumnSupport = {
  source: boolean;
  score: boolean;
  opportunityReason: boolean;
};

export class GooglePlacesApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class HbxBatchError extends ServiceUnavailableException {
  constructor(
    readonly httpStatus: number | null,
    readonly rawMessage: string,
    readonly retryable: boolean,
    readonly code = 'hbx_batch_error',
  ) {
    super({
      code,
      message: rawMessage || 'Falha no lote do Motor HBX.',
      httpStatus,
      retryable,
    });
  }
}

export function normalizePhoneDigits(raw: string | null | undefined) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  return digits;
}

export function isLikelyValidBrPhone(raw: string | null | undefined) {
  const digits = normalizePhoneDigits(raw);
  return digits.length === 10 || digits.length === 11;
}

// DDDs que existem de verdade no Brasil (Anatel). Fora dessa lista = telefone falso.
export const VALID_BR_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

// Telefone BR que PODE existir — não só contagem de dígitos (isLikelyValidBrPhone só
// conta 10/11). Exige DDD real, prefixo de celular (9) ou fixo (2-5) e rejeita repetição
// óbvia (0000…, 9999…). É o que barra os "telefones que não existem" que o scraping pega.
export function isRealisticBrPhone(raw: string | null | undefined) {
  const digits = normalizePhoneDigits(raw);
  if (digits.length !== 10 && digits.length !== 11) return false;
  if (!VALID_BR_DDDS.has(Number(digits.slice(0, 2)))) return false;
  const subscriber = digits.slice(2);
  if (/^(\d)\1+$/.test(subscriber)) return false; // assinante todo repetido = falso
  if (digits.length === 11) return subscriber.length === 9 && subscriber[0] === '9';
  return subscriber.length === 8 && '2345'.includes(subscriber[0]);
}

export function isLikelyWhatsapp(raw: string | null | undefined) {
  const digits = normalizePhoneDigits(raw);
  if (digits.length !== 11) return false;
  const mobilePrefix = Number(digits[2] || '0');
  return Number.isFinite(mobilePrefix) && mobilePrefix >= 6;
}

export function toNumberOrNull(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function clampQuantity(value: number, maxQuantity = MAX_QUANTITY) {
  const safeMax = Math.max(1, Math.trunc(maxQuantity || MAX_QUANTITY));
  return Math.min(Math.max(Math.trunc(value || 0), 1), safeMax);
}

export function normalizeLookupValue(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeWebsiteKey(value: string | null | undefined) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${host}${path}`;
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  }
}

export const RADAR_THIRD_PARTY_SOCIAL_PROFILE_HINTS = [
  'editoramanole',
  'fresha',
  'guiatemdigital',
  'oficialmanole',
  'petdiretorio',
  'qconcursos',
  'setorenergetico',
  'socorroauto',
];

export function normalizeSocialProfileKey(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return normalizeLookupValue(`${parsed.hostname} ${parsed.pathname}`).replace(/[^a-z0-9]+/g, ' ');
  } catch {
    return normalizeLookupValue(raw).replace(/[^a-z0-9]+/g, ' ');
  }
}

export function looksLikeThirdPartySocialProfile(value: string | null | undefined) {
  const key = normalizeSocialProfileKey(value);
  if (!key) return false;
  return RADAR_THIRD_PARTY_SOCIAL_PROFILE_HINTS.some((hint) => key.includes(normalizeLookupValue(hint)));
}

export const RADAR_SOCIAL_BLOCKED_PATH_PARTS = new Set([
  'accounts',
  'events',
  'explore',
  'hashtag',
  'hashtags',
  'login',
  'pages',
  'posts',
  'photos',
  'search',
  'share',
  'tag',
  'tags',
  'videos',
  'groups',
  'reel',
  'reels',
  'p',
  'stories',
]);

export const RADAR_SOCIAL_CATEGORY_TOKENS = new Set([
  'auto',
  'bar',
  'bares',
  'barbearia',
  'beleza',
  'borracharia',
  'calcado',
  'calcados',
  'center',
  'choperia',
  'clinica',
  'confeccao',
  'confeccoes',
  'confeitaria',
  'delivery',
  'doceria',
  'esmalteria',
  'esfiharia',
  'esfiharias',
  'estetica',
  'gastronomia',
  'hamburgueria',
  'imob',
  'imobiliaria',
  'imobiliarias',
  'imovel',
  'imoveis',
  'lanches',
  'lancheria',
  'lancherias',
  'lanchonete',
  'lanchonetes',
  'loja',
  'marmitaria',
  'mecanica',
  'oficina',
  'padaria',
  'pneu',
  'pneus',
  'pizzaria',
  'pizza',
  'pizzas',
  'restaurante',
  'restaurantes',
  'rotisserie',
  'salao',
  'sobrancelha',
  'studio',
  'trattoria',
  'trattorias',
]);

export const RADAR_SOCIAL_STOP_TOKENS = new Set([
  'cia',
  'comercio',
  'comercial',
  'companhia',
  'das',
  'de',
  'do',
  'dos',
  'eireli',
  'ltda',
  'moraes',
]);

export const RADAR_SOCIAL_WEAK_TOKENS = new Set([
  'absolute',
  'bella',
  'belle',
  'bello',
  'bem',
  'casa',
  'casas',
  'central',
  'centro',
  'class',
  'clinic',
  'estilo',
  'express',
  'ideal',
  'mais',
  'max',
  'mega',
  'nova',
  'novo',
  'oficial',
  'popular',
  'prime',
  'real',
  'top',
  'vip',
]);

export const RADAR_WEBSITE_GENERIC_HOST_TOKENS = new Set([
  ...Array.from(RADAR_SOCIAL_CATEGORY_TOKENS),
  'animal',
  'animais',
  'medica',
  'medicas',
  'medico',
  'medicos',
  'odontologica',
  'odontologicas',
  'odontologico',
  'odontologicos',
  'pet',
  'pets',
  'vet',
  'veterinaria',
  'veterinarias',
  'veterinario',
  'veterinarios',
]);

export function socialHandleFromUrl(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.some((part) => RADAR_SOCIAL_BLOCKED_PATH_PARTS.has(normalizeLookupValue(part)))) return '';
    return normalizeLookupValue(parts[0] || '').replace(/[^a-z0-9]+/g, '');
  } catch {
    return normalizeLookupValue(raw).replace(/[^a-z0-9]+/g, '');
  }
}

export function cityInitialsKey(value: string | null | undefined) {
  const tokens = normalizeLookupValue(value).split(/\s+/).filter((token) => token.length >= 3);
  return tokens.length >= 2 ? tokens.map((token) => token[0]).join('') : '';
}

export function socialTokenVariants(token: string) {
  const normalized = normalizeLookupValue(token).replace(/[^a-z0-9]+/g, '');
  if (!normalized) return [];
  const variants = new Set([normalized]);
  if (normalized.length >= 5 && normalized.endsWith('s')) variants.add(normalized.slice(0, -1));
  return Array.from(variants);
}

export function socialCategoryTokenVariants(token: string) {
  const variants = new Set(socialTokenVariants(token));
  if (token === 'pizzaria' || token === 'pizzarias') {
    variants.add('pizza');
    variants.add('pizzas');
  }
  if (token === 'lanchonete' || token === 'lanchonetes') variants.add('lanches');
  if (token === 'restaurante' || token === 'restaurantes') {
    variants.add('restaurante');
    variants.add('restaurantes');
  }
  if (['imob', 'imobiliaria', 'imobiliarias', 'imovel', 'imoveis'].includes(token)) {
    ['imob', 'imobiliaria', 'imobiliarias', 'imovel', 'imoveis'].forEach((variant) => variants.add(variant));
  }
  return Array.from(variants);
}

export function hasTrustedEngineSocialSignal(row: any) {
  const sourceKey = normalizeLookupValue([
    row?.source,
    row?.sourceEngine,
    ...(Array.isArray(row?.sourceEngines) ? row.sourceEngines : parseJsonArray(row?.sourceEngines)),
  ].filter(Boolean).join(' '));
  const socialStatus = normalizeLookupValue(row?.socialStatus || row?.signals?.socialStatus);
  const socialConfidence = safeInteger(row?.socialConfidence ?? row?.signals?.socialConfidence);

  return Boolean(
    (sourceKey.includes('hbx') || sourceKey.includes('scraping'))
    && ['found', 'confirmed'].includes(socialStatus)
    && socialConfidence >= 70
  );
}

export function socialProfileLooksCompatibleWithLead(row: any, value: string | null | undefined) {
  const handle = socialHandleFromUrl(value);
  if (!handle) return false;
  if (hasTrustedEngineSocialSignal(row)) return true;
  const name = normalizeLookupValue(row?.name || row?.companyName || '');
  const tokens = name.split(/\s+/).filter((token) => token.length >= 3 && !RADAR_SOCIAL_STOP_TOKENS.has(token));
  const categoryTokens = tokens.filter((token) => RADAR_SOCIAL_CATEGORY_TOKENS.has(token));
  const strongTokens = tokens.filter((token) => (
    token.length >= 4
    && !RADAR_SOCIAL_CATEGORY_TOKENS.has(token)
    && !RADAR_SOCIAL_WEAK_TOKENS.has(token)
  ));
  if (!strongTokens.length) return false;
  const compactName = tokens.join('');
  if (compactName.length >= 8 && compactName.length <= 36 && (handle.includes(compactName) || compactName.includes(handle))) return true;
  const strongVariants = Array.from(new Set(strongTokens.flatMap((token) => socialTokenVariants(token))));
  const categoryVariants = Array.from(new Set(categoryTokens.flatMap((token) => socialCategoryTokenVariants(token))));
  for (const category of categoryVariants) {
    for (const token of strongVariants) {
      const a = `${category}${token}`;
      const b = `${token}${category}`;
      if ((a.length >= 6 && handle.includes(a)) || (b.length >= 6 && handle.includes(b))) return true;
      if (handle.includes(category) && handle.includes(token)) return true;
    }
  }
  const strongHits = strongTokens.filter((token) => socialTokenVariants(token).some((variant) => variant.length >= 5 && handle.includes(variant)));
  if (strongHits.length >= 2) return true;
  const initials = cityInitialsKey(row?.city);
  if (initials && strongHits.some((token) => token.length >= 6) && handle.endsWith(initials)) return true;
  return false;
}

export function getWebsiteHost(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
  }
}

export function websiteHostLooksCompatibleWithLead(row: any, value: string | null | undefined) {
  const host = getWebsiteHost(value);
  if (!host) return false;
  const hostKey = normalizeLookupValue(host).replace(/[^a-z0-9]+/g, '');
  if (!hostKey) return false;
  if (host === 'visitmestre.com' || host.endsWith('.visitmestre.com')) return false;
  const name = normalizeLookupValue(row?.name || row?.companyName || '');
  const tokens = name.split(/\s+/).filter((token) => token.length >= 3 && !RADAR_SOCIAL_STOP_TOKENS.has(token));
  const categoryTokens = tokens.filter((token) => RADAR_SOCIAL_CATEGORY_TOKENS.has(token));
  const strongTokens = tokens.filter((token) => (
    token.length >= 4
    && !RADAR_SOCIAL_CATEGORY_TOKENS.has(token)
    && !RADAR_SOCIAL_WEAK_TOKENS.has(token)
  ));
  const compactName = tokens.join('');
  if (compactName.length >= 8 && hostKey.includes(compactName)) return true;
  const strongVariants = Array.from(new Set(strongTokens.flatMap((token) => socialTokenVariants(token))));
  const strongHits = strongTokens.filter((token) => socialTokenVariants(token).some((variant) => variant.length >= 4 && hostKey.includes(variant)));
  const distinctiveHits = strongHits.filter((token) => !RADAR_WEBSITE_GENERIC_HOST_TOKENS.has(token));
  if (!distinctiveHits.length) return false;
  if (strongHits.length >= 2) return true;
  if (strongHits.length === 1 && strongTokens.length === 1 && tokens.length <= 2) return true;
  const categoryVariants = Array.from(new Set(categoryTokens.flatMap((token) => socialCategoryTokenVariants(token))));
  for (const category of categoryVariants) {
    for (const token of strongVariants) {
      if (token.length < 4) continue;
      if (RADAR_WEBSITE_GENERIC_HOST_TOKENS.has(token)) continue;
      if (hostKey.includes(`${category}${token}`) || hostKey.includes(`${token}${category}`)) return true;
    }
  }
  return false;
}

export function inferWebsiteStatus(value: string | null | undefined): RadarWebsiteStatus {
  const website = String(value || '').trim();
  if (!website) return 'none';
  const host = getWebsiteHost(website);
  if (!host) return 'unknown';
  const socialHosts = [
    'facebook.com',
    'instagram.com',
    'linkedin.com',
    'tiktok.com',
    'youtube.com',
    'x.com',
    'twitter.com',
    'wa.me',
    'whatsapp.com',
  ];
  if (socialHosts.some((domain) => host === domain || host.endsWith(`.${domain}`))) return 'social_only';
  const weakHosts = [
    'linktr.ee',
    'bio.link',
    'beacons.ai',
    'wixsite.com',
    'weebly.com',
    'blogspot.com',
    'wordpress.com',
    'sites.google.com',
    'business.site',
    'google.com',
    'google.com.br',
  ];
  if (weakHosts.some((domain) => host === domain || host.endsWith(`.${domain}`))) return 'weak';
  return 'present';
}

export const RADAR_BAD_EMAIL_LOCAL_PARTS = new Set([
  'asset',
  'assets',
  'email',
  'example',
  'favicon',
  'icon',
  'image',
  'img',
  'logo',
  'sprite',
  'test',
  'teste',
  'user',
  'usuario',
]);

export const RADAR_BAD_EMAIL_DOMAINS = new Set([
  'bit.ly',
  'econodata.com.br',
  'example.com',
  'example.com.br',
  'facebook.com',
  'fb.com',
  'google.com',
  'instagram.com',
  'linktr.ee',
  'maps.app.goo.gl',
  'restaurantguru.com',
  'restaurantguru.com.br',
  'solutudo.com.br',
  'test.com',
  'teste.com',
  'wa.me',
  'whatsapp.com',
]);

export const RADAR_BAD_EMAIL_TLDS = new Set(['css', 'gif', 'jpeg', 'jpg', 'js', 'png', 'svg', 'webp']);

export function normalizeBusinessEmail(value: string | null | undefined) {
  const raw = String(value || '').trim().toLowerCase();
  const match = raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  if (!match) return '';
  const email = match[0].toLowerCase();
  const [local, domain] = email.split('@');
  const tld = String(domain || '').split('.').pop() || '';
  if (!local || !domain) return '';
  if (RADAR_BAD_EMAIL_LOCAL_PARTS.has(local)) return '';
  if (RADAR_BAD_EMAIL_DOMAINS.has(domain)) return '';
  if (RADAR_BAD_EMAIL_TLDS.has(tld)) return '';
  return email;
}

export function parseJsonArray(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function parseJsonObject(raw: unknown): Record<string, any> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, any>;
  }
  try {
    const parsed = JSON.parse(String(raw || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function isFallbackEligible(error: GooglePlacesApiError) {
  return ['google_api_not_enabled', 'google_request_denied', 'google_upstream_error'].includes(error.code);
}

export function coerceBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  }
  return false;
}

export function normalizeEngine(value: unknown): WebscrapingEngine {
  return String(value || '').trim().toLowerCase() === 'hbx' ? 'hbx' : 'google';
}

export function normalizeEnginePurpose(value: unknown): HbxEnginePurpose {
  const purpose = String(value || '').trim().toLowerCase();
  if (purpose === 'radar_pull' || purpose === 'radar_digital' || purpose === 'lead_plus_enrichment' || purpose === 'vendas' || purpose === 'autonomous' || purpose === 'mass_data') {
    return purpose;
  }
  return 'manual';
}

export function isAutomaticEnginePurpose(purpose: HbxEnginePurpose) {
  return purpose === 'autonomous' || purpose === 'mass_data';
}

export function normalizeTargetType(value: unknown): HbxTargetType {
  const targetType = String(value || '').trim().toLowerCase();
  if (targetType === 'pf' || targetType === 'agenda_pf') return targetType;
  return 'pj';
}

export function parsePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(String(value || '').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

export function maxQuantityFor(engine: WebscrapingEngine, targetType: HbxTargetType) {
  if (engine === 'google') return MAX_QUANTITY;
  return targetType === 'pj' ? HBX_PJ_MAX_QUANTITY : HBX_PEOPLE_MAX_QUANTITY;
}

export function safeInteger(value: unknown, fallback = 0) {
  const numeric = toNumberOrNull(value);
  if (numeric == null) return fallback;
  return Math.max(0, Math.trunc(numeric));
}

export function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const numeric = toNumberOrNull(value);
  const parsed = numeric == null ? fallback : Math.trunc(numeric);
  return Math.min(Math.max(parsed, min), max);
}

export function parsePositiveIntegerEnv(name: string, fallback: number) {
  return parsePositiveInteger(process.env[name], fallback);
}

export function minutesAgo(minutes: number) {
  return new Date(Date.now() - Math.max(0, minutes) * 60_000);
}

export function formatCityWithState(city: string, state: string | null | undefined) {
  const safeCity = String(city || '').trim();
  const safeState = String(state || '').trim().toUpperCase();
  if (!safeCity || !safeState) return safeCity;
  if (new RegExp(`\\s-\\s${safeState}$`, 'i').test(safeCity)) return safeCity;
  return `${safeCity} - ${safeState}`;
}

// ── HOT-05 — link WhatsApp (wa.me) de 1 clique ──────────────────────────────────────────────
// Fonte ÚNICA do backend (exports/relatórios do Radar; ação HUMANA do vendedor, não passa pelo
// motor/Webwhats — zero risco de ban). Cópia irmã no front: frontend/src/lib/wa-link.ts (mesma
// assinatura/regra de normalização; front não importa direto do backend por não terem infra de
// monorepo). Ver docs/PLANEJAMENTOS/hot/05-links-whatsapp-1clique.md.

/** Normaliza qualquer telefone BR cru pros dígitos que o wa.me espera (55 + DDD + número). */
export function normalizeWaPhoneDigits(rawPhone: string | null | undefined): string {
  const digits = normalizePhoneDigits(rawPhone);
  if (!digits) return '';
  // normalizePhoneDigits já tira o 55 de duplo-DDI; aqui garantimos o 55 único de volta.
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export type BuildWaLinkOptions = {
  /** Texto pré-preenchido (vira `?text=`, já URL-encoded pela função). */
  text?: string | null;
};

/**
 * Monta o link wa.me de 1 clique a partir de um telefone cru (com ou sem DDI/máscara).
 * `opts.text` vira `?text=` (URL-encoded). Retorna null se não sobrar nenhum dígito.
 */
export function buildWaLink(phone: string | null | undefined, opts: BuildWaLinkOptions = {}): string | null {
  const digits = normalizeWaPhoneDigits(phone);
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  const text = String(opts.text || '').trim();
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

type WaTemplates = Record<string, string> & { _comment?: string };
const WA_TEMPLATES = waMessageTemplates as WaTemplates;

function normalizeWaTemplateCategory(category: string | null | undefined): string {
  const normalized = normalizeLookupValue(category).replace(/\s+/g, '');
  return normalized && WA_TEMPLATES[normalized] ? normalized : 'default';
}

/**
 * Preenche o template de abertura por categoria (wa-message-templates.json) com os dados do
 * lead. `category` é a chave normalizada (ex.: "alimentacao", espelha HBX_CATEGORY_SEGMENTS);
 * cai em "default" se não existir ou não vier.
 */
export function buildWaMessage(params: {
  category?: string | null;
  name?: string | null;
  segment?: string | null;
  city?: string | null;
}): string {
  const key = normalizeWaTemplateCategory(params.category);
  const template = WA_TEMPLATES[key] || WA_TEMPLATES.default;
  const nome = params.name ? ` ${params.name}` : '';
  const segmento = params.segment ? params.segment.toLowerCase() : 'sua área';
  const cidade = params.city ? ` em ${params.city}` : '';
  return template
    .replace('{nome}', nome)
    .replace('{segmento}', segmento)
    .replace('{cidade}', cidade);
}

export * from './radar-error-codes';
export * from './radar-stage.types';
export * from './radar-stage-policy';
export * from './radar-stage-result';
