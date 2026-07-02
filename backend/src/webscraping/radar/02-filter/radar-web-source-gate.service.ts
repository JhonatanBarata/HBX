import { Injectable } from '@nestjs/common';
import { RADAR_MARKETPLACE_HOST_HINTS, RADAR_BLOCKED_OFFICIAL_WEBSITE_DOMAINS } from '../shared/radar-core-shared';
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

function envDomainBlacklist(): string[] {
  const raw = String(process.env.HBX_RADAR_WEB_DOMAIN_BLACKLIST || '').trim();
  if (!raw) return [];
  return raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
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
];

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
