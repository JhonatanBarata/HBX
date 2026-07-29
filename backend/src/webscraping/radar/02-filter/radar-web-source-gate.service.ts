import { Injectable } from '@nestjs/common';
import { RADAR_MARKETPLACE_HOST_HINTS, RADAR_BLOCKED_OFFICIAL_WEBSITE_DOMAINS } from '../shared/radar-core-shared';
import { normalizeSegmentText } from '../shared/radar-segment-match.util';
import type { NormalizedRadarFilters, NormalizedSearchInput } from '../shared/radar-types';

export type RadarWebSourceGateResult = {
  // true = passa (nao e lixo de web); false = rejeitado (motivo em `reason`, prefixo web_gate:).
  passed: boolean;
  reason: string | null;
};

// Fontes cuja porta e outra (Receita = inocente ate prova; database = ja passou antes).
// Ver radar-quality-gate.service.ts (isCnpjPublic) para a polaridade invertida da Receita.
const WEB_GATE_EXEMPT_SOURCES = new Set(['cnpj_public', 'radar_database']);

// Seed do dono (docs/PLANEJAMENTOS/PR01072026/10-filtros-por-motor.md) alem do que ja
// existe em RADAR_BLOCKED_OFFICIAL_WEBSITE_DOMAINS/RADAR_MARKETPLACE_HOST_HINTS — nao
// duplicar valor que ja mora na constante compartilhada.
const WEB_GATE_SEED_DOMAIN_BLACKLIST = [
  'telelistas.com.br',
  'guiamais.com.br',
  'apontador.com.br',
  'guiafacil.com.br',
  'solutudo.com.br',
  'econodata.com.br',
  'cnpj.biz',
  'empresascnpj.com',
  'reclameaqui.com.br',
  'tripadvisor.com',
  'tripadvisor.com.br',
  'ifood.com.br',
  'olx.com.br',
  'mercadolivre.com.br',
  'getninjas.com.br',
  'vagas.com.br',
  'indeed.com',
  'glassdoor.com.br',
  'glassdoor.com',
  'wikipedia.org',
  'youtube.com',
  'gov.br',
  // C3 (calibracao round-2, 01/07): plataformas de agendamento/marketplace que vazaram
  // em run real (barbearia/Goiânia) — item deles aparecia como card "found".
  'booksy.com',
  'trinks.com',
  'fresha.com',
  'agendaboa.com',
  'appbarber.com.br',
  'curtamais.com.br',
  'vidabrilhante.com',
];

// C3: marca de diretorio/plataforma conhecida — se o NOME normalizado do candidato for
// EXATAMENTE a marca (ex.: item chamado "Booksy" passando como found), rejeita mesmo sem
// bater no host. Barato e de alta precisao: so nome EXATO, nao substring.
const KNOWN_DIRECTORY_BRAND_NAMES = [
  'booksy',
  'trinks',
  'fresha',
  'agendaboa',
  'appbarber',
  'curtamais',
  'vidabrilhante',
  'telelistas',
  'apontador',
  'guiamais',
  'guiafacil',
  'solutudo',
];

// F3 REFUNDAÇÃO (28/07) — PORTA DE REALIDADE, camada DURA: portal global/notícia/e-commerce/
// TV/clima/marketplace NUNCA é lead, com ou sem "canal próprio". Caso real de Zacarias/SP:
// eBay, CBS Sports, KSDK (TV americana), Climatempo e Buser entraram como "distribuidora de
// água" porque a exceção de canal próprio (feita pra agregador de delivery com schema.org de
// empresa real) dava carona pra qualquer domínio. Aqui não tem exceção: bateu o host, morreu.
const WEB_GATE_PORTAL_DOMAIN_BLACKLIST = [
  'ebay.com',
  'ebay.com.br',
  'cbssports.com',
  'ksdk.com',
  'climatempo.com.br',
  'buser.com.br',
  'mercadolivre.com.br',
  'mercadolivre.com',
  'mercadolibre.com',
  'olx.com.br',
  'amazon.com',
  'amazon.com.br',
  'americanas.com.br',
  'magazineluiza.com.br',
  'globo.com',
  'g1.globo.com',
  'uol.com.br',
  'terra.com.br',
  'youtube.com',
  'youtu.be',
  'wikipedia.org',
];

// Marca de portal global como NOME do candidato (item "eBay" sem host mapeável) — mesmo
// critério exato-e-barato do KNOWN_DIRECTORY_BRAND_NAMES.
const KNOWN_PORTAL_BRAND_NAMES = [
  'ebay',
  'cbs sports',
  'ksdk',
  'climatempo',
  'buser',
  'mercado livre',
  'mercadolivre',
  'olx',
  'amazon',
  'americanas',
  'magazine luiza',
  'magazineluiza',
  'globo',
  'g1',
  'uol',
  'terra',
  'youtube',
  'wikipedia',
];

function envDomainBlacklist(): string[] {
  const raw = String(process.env.HBX_RADAR_WEB_DOMAIN_BLACKLIST || '').trim();
  if (!raw) return [];
  return raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

// Extensão de operação da camada DURA (mesma semântica do env da lista branda): domínio aqui
// mata SEM exceção de canal próprio.
function envPortalBlacklist(): string[] {
  const raw = String(process.env.HBX_RADAR_WEB_PORTAL_BLACKLIST || '').trim();
  if (!raw) return [];
  return raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

export function buildWebGatePortalBlacklist(): string[] {
  return Array.from(new Set([
    ...WEB_GATE_PORTAL_DOMAIN_BLACKLIST,
    ...envPortalBlacklist(),
  ].map((item) => item.toLowerCase())));
}

// Merge de seed (codigo) + constantes compartilhadas do quality gate + env (operacao)
// sem duplicar valor — Set dedup pelo host puro.
export function buildWebGateDomainBlacklist(): string[] {
  return Array.from(new Set([
    ...WEB_GATE_SEED_DOMAIN_BLACKLIST,
    ...RADAR_BLOCKED_OFFICIAL_WEBSITE_DOMAINS,
    ...RADAR_MARKETPLACE_HOST_HINTS,
    ...envDomainBlacklist(),
  ].map((item) => item.toLowerCase())));
}

// Padrao titulo-lista/diretorio/noticia no name — case/acento-insensivel (normalizeKey
// tira acento antes de testar).
const TITLE_LIST_PATTERNS: RegExp[] = [
  /\btop\s*\d+\b/,
  /\bas\s+\d+\s+melhores\b/,
  /\bmelhores\s+\w+/,
  /\blista\s+de\b/,
  /\bguia\s+de\b/,
  /\bonde\s+(comer|encontrar)\b/,
  /\bo\s+que\s+fazer\b/,
  /\branking\b/,
  /\bvagas\b/,
  /\bcurriculo\b/,
  /\bnoticias?\b/,
  /\bpasso\s+a\s+passo\b/,
  /\bcomo\s+(abrir|montar)\b/,
  // F3 REFUNDAÇÃO (28/07): página de diretório/agregador com título "Distribuidores de Água
  // em Aguaí" virava lead. Cabeça no PLURAL + "de/da/do" + " em <lugar>" é título de listagem,
  // não nome de empresa (empresa real é "Distribuidora de Água Chagas", singular e sem "em").
  /^(?:os\s+|as\s+)?[a-z0-9]+s\s+(?:de|da|do|das|dos)\s+.+\bem\s+\S+/,
];

// F3 REFUNDAÇÃO (28/07) — sinal local só é EXIGIDO fora das cidades grandes ("não quebrar o
// que funciona em capital"): capitais + municípios notoriamente grandes ficam isentos; o resto
// do país (onde o motor de busca devolve lixo global) precisa provar vínculo com a cidade.
// Chave: "<cidade normalizada>:<UF>". Extensível por env HBX_RADAR_LOCAL_SIGNAL_CITY_EXEMPT
// (lista "cidade:UF" separada por vírgula) pra operação isentar cidade média sem deploy.
const RADAR_BIG_CITY_KEYS = new Set([
  // Capitais
  'rio branco:AC', 'maceio:AL', 'macapa:AP', 'manaus:AM', 'salvador:BA', 'fortaleza:CE',
  'brasilia:DF', 'vitoria:ES', 'goiania:GO', 'sao luis:MA', 'cuiaba:MT', 'campo grande:MS',
  'belo horizonte:MG', 'belem:PA', 'joao pessoa:PB', 'curitiba:PR', 'recife:PE', 'teresina:PI',
  'rio de janeiro:RJ', 'natal:RN', 'porto alegre:RS', 'porto velho:RO', 'boa vista:RR',
  'florianopolis:SC', 'sao paulo:SP', 'aracaju:SE', 'palmas:TO',
  // Grandes não-capitais (ordem de grandeza 300k+ hab)
  'guarulhos:SP', 'campinas:SP', 'sao goncalo:RJ', 'duque de caxias:RJ',
  'sao bernardo do campo:SP', 'nova iguacu:RJ', 'santo andre:SP', 'osasco:SP',
  'sao jose dos campos:SP', 'ribeirao preto:SP', 'sorocaba:SP', 'uberlandia:MG',
  'contagem:MG', 'juiz de fora:MG', 'feira de santana:BA', 'joinville:SC', 'londrina:PR',
  'aparecida de goiania:GO', 'ananindeua:PA', 'niteroi:RJ', 'campos dos goytacazes:RJ',
  'caxias do sul:RS', 'maringa:PR', 'jaboatao dos guararapes:PE', 'sao jose do rio preto:SP',
  'santos:SP', 'mogi das cruzes:SP', 'diadema:SP', 'betim:MG', 'piracicaba:SP', 'bauru:SP',
  'jundiai:SP', 'franca:SP', 'anapolis:GO', 'pelotas:RS', 'canoas:RS', 'vila velha:ES',
  'serra:ES', 'cariacica:ES', 'caruaru:PE', 'blumenau:SC', 'ponta grossa:PR', 'cascavel:PR',
  'petrolina:PE', 'paulista:PE', 'uberaba:MG', 'santarem:PA', 'montes claros:MG',
  'sao vicente:SP', 'praia grande:SP', 'taubate:SP', 'limeira:SP', 'suzano:SP',
  'sao jose dos pinhais:PR', 'foz do iguacu:PR', 'itaquaquecetuba:SP', 'guaruja:SP',
  'vitoria da conquista:BA', 'camacari:BA', 'juazeiro do norte:CE', 'caucaia:CE',
  'imperatriz:MA', 'sao joao de meriti:RJ', 'belford roxo:RJ', 'petropolis:RJ',
  'volta redonda:RJ', 'mossoro:RN', 'santa maria:RS', 'gravatai:RS', 'novo hamburgo:RS',
  'viamao:RS', 'olinda:PE', 'criciuma:SC', 'itajai:SC', 'chapeco:SC', 'palhoca:SC',
  'sao jose:SC', 'marilia:SP', 'presidente prudente:SP', 'americana:SP', 'araraquara:SP',
  'indaiatuba:SP', 'cotia:SP', 'itapevi:SP', 'hortolandia:SP', 'rio claro:SP',
  'barueri:SP', 'embu das artes:SP', 'carapicuiba:SP', 'maua:SP', 'sumare:SP',
  'taboao da serra:SP', 'sao carlos:SP', 'aracatuba:SP', 'jacarei:SP',
  'dourados:MS', 'varzea grande:MT', 'rondonopolis:MT', 'parauapebas:PA', 'maraba:PA',
  'castanhal:PA', 'arapiraca:AL', 'caxias:MA', 'sobral:CE', 'parnamirim:RN',
  'campina grande:PB', 'ipatinga:MG', 'sete lagoas:MG', 'divinopolis:MG',
  'governador valadares:MG', 'ribeirao das neves:MG', 'santa luzia:MG', 'ibirite:MG',
  'colombo:PR', 'guarapuava:PR', 'apucarana:PR', 'toledo:PR', 'rio grande:RS',
  'passo fundo:RS', 'sapucaia do sul:RS', 'alvorada:RS', 'macae:RJ', 'itaborai:RJ',
  'mage:RJ', 'cabo frio:RJ', 'nova friburgo:RJ', 'angra dos reis:RJ',
  'lauro de freitas:BA', 'juazeiro:BA', 'itabuna:BA', 'ilheus:BA', 'jequie:BA',
  'teixeira de freitas:BA', 'barreiras:BA', 'alagoinhas:BA', 'maracanau:CE',
  'crato:CE', 'itapipoca:CE', 'maranguape:CE', 'sao luis de montes belos:GO',
  'rio verde:GO', 'aguas lindas de goias:GO', 'luziania:GO', 'valparaiso de goias:GO',
  'trindade:GO', 'senador canedo:GO', 'catalao:GO', 'itumbiara:GO',
  'timon:MA', 'paco do lumiar:MA', 'sao jose de ribamar:MA', 'cascavel:CE',
  'garanhuns:PE', 'vitoria de santo antao:PE', 'igarassu:PE', 'abreu e lima:PE',
  'camaragibe:PE', 'cabo de santo agostinho:PE', 'parnaiba:PI', 'picos:PI',
  'ariquemes:RO', 'ji-parana:RO', 'vilhena:RO', 'gurupi:TO', 'araguaina:TO',
  'linhares:ES', 'colatina:ES', 'guarapari:ES', 'sao mateus:ES', 'cachoeiro de itapemirim:ES',
  'lages:SC', 'balneario camboriu:SC', 'brusque:SC', 'tubarao:SC', 'jaragua do sul:SC',
]);

function envLocalSignalCityExempt(): string[] {
  const raw = String(process.env.HBX_RADAR_LOCAL_SIGNAL_CITY_EXEMPT || '').trim();
  if (!raw) return [];
  return raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

export function isRadarLocalSignalExemptCity(city: unknown, state: unknown): boolean {
  const cityKey = normalizeSegmentText(city);
  const stateKey = String(state || '').trim().toUpperCase();
  if (!cityKey) return true; // sem cidade pedida não há "sinal local" a cobrar
  const key = `${cityKey}:${stateKey}`;
  if (RADAR_BIG_CITY_KEYS.has(key)) return true;
  return envLocalSignalCityExempt().includes(key.toLowerCase());
}

function normalizeKey(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSourceKey(value: unknown) {
  return normalizeKey(value).replace(/\s+/g, '_');
}

// Fone valido (10/11 digitos, ignorando DDI 55) ou instagram/facebook proprios — mesmo
// criterio de "canal proprio acionavel" usado no lead-quality-v2 (independente por design:
// o gate nao importa do quality module pra nao criar acoplamento cruzado).
function hasOwnActionableChannel(candidate: Record<string, any>): boolean {
  const digitsRaw = String(candidate?.phoneDigits || candidate?.phone || '').replace(/\D/g, '');
  const digits = digitsRaw.startsWith('55') && digitsRaw.length > 11 ? digitsRaw.slice(2) : digitsRaw;
  if (digits.length >= 10 && digits.length <= 11) return true;
  if (String(candidate?.instagramUrl || '').trim()) return true;
  if (String(candidate?.facebookUrl || '').trim()) return true;
  return false;
}

function getHost(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
  }
}

@Injectable()
export class RadarWebSourceGateService {
  // Fonte nao e web (Receita/database) → gate nao roda, sempre passa.
  appliesTo(candidate: Record<string, any>): boolean {
    const sourceKey = normalizeSourceKey(candidate?.source ?? candidate?.sourceEngine);
    return !WEB_GATE_EXEMPT_SOURCES.has(sourceKey);
  }

  evaluate(input: {
    candidate: Record<string, any>;
    filters?: NormalizedSearchInput | NormalizedRadarFilters | null;
  }): RadarWebSourceGateResult {
    const candidate = input.candidate || {};
    if (!this.appliesTo(candidate)) return { passed: true, reason: null };

    // Camada DURA primeiro: portal global não tem a exceção de canal próprio das listas
    // brandas (o telefone/instagram num resultado do eBay não é "canal da empresa local").
    const portalReason = this.checkGlobalPortal(candidate);
    if (portalReason) return { passed: false, reason: `web_gate:${portalReason}` };

    const brandReason = this.checkBrandName(candidate);
    if (brandReason) return { passed: false, reason: `web_gate:${brandReason}` };

    const domainReason = this.checkDomainBlacklist(candidate);
    if (domainReason) return { passed: false, reason: `web_gate:${domainReason}` };

    const titleReason = this.checkTitleListPattern(candidate);
    if (titleReason) return { passed: false, reason: `web_gate:${titleReason}` };

    const geoReason = this.checkGeoConflict(candidate, input.filters);
    if (geoReason) return { passed: false, reason: `web_gate:${geoReason}` };

    return { passed: true, reason: null };
  }

  // F3 REFUNDAÇÃO: portal global por HOST (sourceUrl OU website) ou por NOME exato de marca.
  // SEM exceção de canal próprio — o dado "próprio" achado numa página do eBay/Climatempo é
  // da plataforma, não de uma empresa da cidade pesquisada.
  private checkGlobalPortal(candidate: Record<string, any>): string | null {
    const blacklist = buildWebGatePortalBlacklist();
    const matchesBlacklist = (host: string) => Boolean(host) && blacklist.some((domain) => host === domain || host.endsWith(`.${domain}`));
    if (matchesBlacklist(getHost(candidate.sourceUrl))) return 'global_portal';
    if (matchesBlacklist(getHost(candidate.website))) return 'global_portal';
    const name = normalizeKey(candidate.name);
    if (name && KNOWN_PORTAL_BRAND_NAMES.includes(name)) return 'global_portal';
    return null;
  }

  // C3: nome EXATO de marca de diretorio/agendamento conhecida (ex.: item chamado "Booksy"
  // passando como found) — barato, alta precisao, roda antes do host pra pegar caso sem
  // sourceUrl/website hospedado no dominio da marca.
  private checkBrandName(candidate: Record<string, any>): string | null {
    const name = normalizeKey(candidate.name);
    if (!name) return null;
    return KNOWN_DIRECTORY_BRAND_NAMES.includes(name) ? 'brand_name' : null;
  }

  // C3/R2 (calibracao round-3, 01/07): host do sourceUrl (de onde o dado veio) na blacklist
  // MATA o item por padrao — e diretorio/agregador, nao a empresa. MEDIDO: em nicho
  // delivery/cidade menor, quase todo lead real chega via pagina agregadora (schema.org com
  // nome+fone proprios) — matar cego joga fora 13 pizzarias reais. Excecao: se o candidato
  // tem canal PROPRIO acionavel (fone BR realista/instagram/facebook) E o nome nao e marca de
  // diretorio (ja garantido — checkBrandName roda ANTES no evaluate()) E nao e titulo-lista
  // (checkTitleListPattern roda DEPOIS no evaluate() — se formos deixar passar aqui, o titulo-
  // lista ainda mata na sequencia), deixa passar; zera `website` in-place se ele TAMBEM for do
  // mesmo dominio bloqueado (card sem link de "site oficial" falso, mas com contato real).
  // Sem canal proprio -> procedencia decide sozinha, mata como antes.
  private checkDomainBlacklist(candidate: Record<string, any>): string | null {
    const blacklist = buildWebGateDomainBlacklist();
    const matchesBlacklist = (host: string) => Boolean(host) && blacklist.some((domain) => host === domain || host.endsWith(`.${domain}`));

    const sourceHost = getHost(candidate.sourceUrl);
    if (matchesBlacklist(sourceHost)) {
      if (!hasOwnActionableChannel(candidate)) return 'blocked_domain';
      // Agregador com identidade propria (fone/instagram/facebook do candidato, nao do
      // diretorio): mantem o card. Se o website tambem aponta pro mesmo agregador/dominio
      // bloqueado, zera o campo — nao deixa link de "site oficial" que na verdade e o
      // agregador.
      const websiteHost = getHost(candidate.website);
      if (matchesBlacklist(websiteHost)) candidate.website = null;
      return null;
    }

    const websiteHost = getHost(candidate.website);
    if (matchesBlacklist(websiteHost)) {
      if (!hasOwnActionableChannel(candidate)) return 'blocked_domain';
      // Lead real sem site proprio confiavel: zera o website, mantem o card.
      candidate.website = null;
      return null;
    }

    return null;
  }

  private checkTitleListPattern(candidate: Record<string, any>): string | null {
    const name = normalizeKey(candidate.name);
    if (!name) return null;
    return TITLE_LIST_PATTERNS.some((pattern) => pattern.test(name)) ? 'title_list_pattern' : null;
  }

  // F3 REFUNDAÇÃO (28/07) — SINAL LOCAL em cidade pequena/média: fora da lista de cidades
  // grandes, candidato da lane web só passa se provar vínculo com a cidade pedida por UM de:
  // (a) DDD do telefone bate com os DDDs reais da cidade (amostra da RFB local);
  // (b) nome da cidade aparece no CONTEÚDO do candidato (nome/endereço/snippet/URL — os
  //     campos city/state NÃO contam: são carimbo herdado da própria busca);
  // (c) match na RFB 28M (reconciliação web→RFB feita antes desta porta).
  // Degrade gracioso: se a RFB estava indisponível E não há DDD conhecido da cidade, não há
  // como verificar nada — passa (o card segue "não confirmado"), nunca trava a entrega.
  evaluateLocalReality(input: {
    candidate: Record<string, any>;
    filters?: NormalizedSearchInput | NormalizedRadarFilters | null;
    rfbMatched?: boolean;
    rfbUnavailable?: boolean;
    cityDddHints?: string[] | null;
  }): RadarWebSourceGateResult {
    const candidate = input.candidate || {};
    if (!this.appliesTo(candidate)) return { passed: true, reason: null };
    const requestedCity = String((input.filters as any)?.city || '').trim();
    const requestedState = String((input.filters as any)?.state || '').trim().toUpperCase();
    if (!requestedCity) return { passed: true, reason: null };
    if (isRadarLocalSignalExemptCity(requestedCity, requestedState)) return { passed: true, reason: null };

    if (input.rfbMatched) return { passed: true, reason: null };

    // (a) DDD do telefone × DDDs reais da cidade (amostra RFB). Hints vazios/nulos = não
    // verificável — não aprova nem reprova sozinho.
    const hints = Array.isArray(input.cityDddHints) ? input.cityDddHints.filter(Boolean) : null;
    const digitsRaw = String(candidate.phoneDigits || candidate.phone || '').replace(/\D/g, '');
    const digits = digitsRaw.startsWith('55') && digitsRaw.length > 11 ? digitsRaw.slice(2) : digitsRaw;
    const candidateDdd = digits.length >= 10 ? digits.slice(0, 2) : '';
    if (hints?.length && candidateDdd && hints.includes(candidateDdd)) return { passed: true, reason: null };

    // (b) cidade pedida (ou vizinha do raio) citada no conteúdo próprio do candidato.
    // E4 ESTABILIZAÇÃO (29/07): sourceUrl/website SAÍRAM do conteúdo — cidade na URL é o
    // padrão exato do portal com página por cidade (tiempo.com/brasil/analandia/...,
    // querobrasil.com.br/sp/analandia/agua-saneamento) e virava carimbo automático de
    // localidade. Sinal local por texto = o que a empresa DIZ (nome/endereço/descrição),
    // nunca o caminho do link; empresa real da cidade ancora pela RFB ou pelo DDD.
    const cityNames = [requestedCity, ...(Array.isArray((input.filters as any)?.regionalCities)
      ? (input.filters as any).regionalCities.map((item: any) => String(item?.city || '').trim()).filter(Boolean)
      : [])];
    const contentText = normalizeSegmentText([
      candidate.name,
      candidate.razaoSocial,
      candidate.address,
      candidate.snippet,
      candidate.description,
      candidate.opportunityReason,
    ].filter(Boolean).join(' '));
    for (const cityName of cityNames) {
      const cityPhrase = normalizeSegmentText(cityName);
      if (cityPhrase && contentText && new RegExp(`\\b${cityPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(contentText)) {
        return { passed: true, reason: null };
      }
    }

    // Nada verificável (RFB fora do ar e sem DDD da cidade) → gracioso, nunca trava.
    if (input.rfbUnavailable && !hints?.length) return { passed: true, reason: null };

    return { passed: false, reason: 'web_gate:no_local_signal' };
  }

  private checkGeoConflict(
    candidate: Record<string, any>,
    filters?: NormalizedSearchInput | NormalizedRadarFilters | null,
  ): string | null {
    const requestedCity = normalizeKey((filters as any)?.city);
    const requestedState = normalizeKey((filters as any)?.state);
    const candidateCity = normalizeKey(candidate.city);
    const candidateState = normalizeKey(candidate.state);
    // Ausente NAO rejeita — so conflito explicito (cidade/UF presente e diferente da pedida).
    if (requestedCity && candidateCity && requestedCity !== candidateCity) return 'geo_conflict';
    if (requestedState && candidateState && requestedState !== candidateState) return 'geo_conflict';
    return null;
  }
}
