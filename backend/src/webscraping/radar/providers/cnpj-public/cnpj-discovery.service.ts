import { Injectable, Optional } from '@nestjs/common';
import type { NormalizedSearchInput } from '../../shared/radar-types';
import { RadarCnpjL4EnrichmentService } from '../../03-enrichment/radar-cnpj-l4-enrichment.service';
import { isValidCnpjCheckDigits } from './cnpj-public-provider.service';
import type { CnpjPublicCompanyRecord } from './cnpj-public-types';

/**
 * L0/L4 — Descoberta de CNPJ por nicho+cidade (furo comprovado 01/07, ver
 * docs/PLANEJAMENTOS/PR01072026/30-motor-receita.md): a fonte `cnpj_public` só LÊ a tabela
 * `CnpjPublicCompany`, que não tinha nada a alimentá-la por nicho+cidade. Este serviço
 * BUSCA CNPJs na web (queries "segmento cidade cnpj") e HIDRATA via L4
 * (`RadarCnpjL4EnrichmentService.lookup`, que já tem throttle 700ms + cache + BrasilAPI).
 *
 * Reuso do client web-search já existente: MESMO endpoint/contrato de
 * `WebscrapingService.webSearch()` (backend/src/webscraping/webscraping.service.ts:141-179) —
 * `POST {HBX_SCRAPING_ENGINE_URL}/web-search` do motor Python (`hbx-scraping-engine/app/main.py`,
 * rota `/web-search` → `WebSearchService`), mesma env `HBX_SCRAPING_ENGINE_URL` (default
 * `http://hbx-scraping-engine:8001`, mesmo default de `resolveHbxEngineUrl()`/
 * `getHbxScrapingEngineUrl()`), mesmo payload `{ query, limit, fresh }` e mesmo shape de resposta
 * (`{ query, count, cached, results: [{ title, url, snippet, rank, source, fetchedAt }], errors,
 * stats }`). NÃO é um client novo — `WebscrapingService.webSearch()` não pode ser importado aqui
 * sem criar dependência circular (`WebscrapingService` já importa, transitivamente, a fonte
 * `cnpj_public` deste mesmo módulo via `RadarWebscrapingCoreService`), então a chamada HTTP é
 * replicada byte-a-byte (mesma env/endpoint/payload) em vez de instanciar a classe inteira.
 */

export type CnpjDiscoveryInput = {
  normalized: NormalizedSearchInput;
  needed: number;
  prisma: any;
};

type WebSearchResult = {
  title?: string;
  url?: string;
  snippet?: string;
};

type WebSearchResponse = {
  results?: WebSearchResult[];
};

function envInt(name: string, fallback: number) {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function envEnabled(name: string, fallback: boolean) {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  if (!raw) return fallback;
  return raw === 'true';
}

/** Mesmo default/resolução de `resolveHbxEngineUrl()`/`getHbxScrapingEngineUrl()`. */
function resolveHbxEngineUrl() {
  const configured = String(process.env.HBX_SCRAPING_ENGINE_URL || 'http://hbx-scraping-engine:8001').trim();
  const first = configured.split(',')[0]?.trim() || 'http://hbx-scraping-engine:8001';
  return first.replace(/\/+$/, '');
}

function compactText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Extrai TODOS os CNPJs válidos (mod-11) de um texto livre (título/snippet/url).
 * Validação de DV reusa `isValidCnpjCheckDigits` de `cnpj-public-provider.service.ts`
 * (mesma regra mod-11 já usada pelo provider — não duplicar a validação).
 */
export function extractValidCnpjsFromText(text: string): string[] {
  const value = String(text || '');
  const found = new Set<string>();
  // Formatado: 12.345.678/0001-90
  const formatted = value.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) || [];
  for (const raw of formatted) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 14 && isValidCnpjCheckDigits(digits)) found.add(digits);
  }
  // Sem máscara ou parcialmente mascarado (ex.: cnpj.biz/64711048000190): 14 dígitos corridos.
  const loose = value.match(/\d{14}/g) || [];
  for (const raw of loose) {
    if (isValidCnpjCheckDigits(raw)) found.add(raw);
  }
  return Array.from(found);
}

function buildDiscoveryQueries(input: NormalizedSearchInput, maxQueries: number): string[] {
  const segment = compactText(input.segment);
  const city = compactText(input.city);
  const state = compactText(input.state);
  const queries = [
    segment && city ? `${segment} ${city} cnpj` : '',
    segment && city && state ? `${segment} ${city} ${state} cnpj` : '',
    segment && city ? `site:cnpj.biz ${segment} ${city}` : '',
  ].filter(Boolean);
  return queries.slice(0, Math.max(1, maxQueries));
}

@Injectable()
export class CnpjDiscoveryService {
  // @Optional() + fallback `new` no uso — padrão do domínio (mesmo de radar-webscraping-core.service.ts
  // e radar-cnpj-public-source.service.ts). RadarCnpjL4EnrichmentService NÃO é provider registrado em
  // módulo nenhum (os outros call sites também instanciam na mão). Default parameter no constructor NÃO
  // impede o Nest de tentar resolver o token via DI → quebrava o bootstrap do backend
  // (Injector.lookupComponentInParentModules).
  constructor(@Optional() private readonly l4Enrichment?: RadarCnpjL4EnrichmentService) {}

  /**
   * Descobre CNPJs via busca web (segmento+cidade) e hidrata via L4 (dataset local + BrasilAPI).
   * Degrade gracioso sempre: falha de rede/parse/timeout devolve o que já foi hidratado até então
   * (nunca joga exceção pra cima — padrão do domínio, spec item 5).
   */
  async discover(input: CnpjDiscoveryInput): Promise<CnpjPublicCompanyRecord[]> {
    const budgetMs = envInt('HBX_RADAR_CNPJ_DISCOVERY_BUDGET_MS', 90000);
    const maxQueries = envInt('HBX_RADAR_CNPJ_DISCOVERY_QUERIES', 3);
    const maxLookups = envInt('HBX_RADAR_CNPJ_DISCOVERY_MAX_LOOKUPS', 25);
    const startedAt = Date.now();
    const timeLeft = () => budgetMs - (Date.now() - startedAt);

    const queries = buildDiscoveryQueries(input.normalized, maxQueries);
    if (!queries.length) return [];

    const candidateCnpjs = new Set<string>();
    for (const query of queries) {
      if (timeLeft() <= 0) break;
      if (candidateCnpjs.size >= maxLookups) break;
      try {
        const results = await this.searchWeb(query, Math.max(1000, Math.min(15000, timeLeft())));
        for (const result of results) {
          const text = `${result.title || ''} ${result.snippet || ''} ${result.url || ''}`;
          for (const cnpj of extractValidCnpjsFromText(text)) {
            candidateCnpjs.add(cnpj);
            if (candidateCnpjs.size >= maxLookups) break;
          }
          if (candidateCnpjs.size >= maxLookups) break;
        }
      } catch {
        // degrade gracioso: segue pra próxima query / devolve o que já tem
        continue;
      }
    }

    if (!candidateCnpjs.size) return [];

    const l4Enrichment = this.l4Enrichment || new RadarCnpjL4EnrichmentService();
    const hydrated: CnpjPublicCompanyRecord[] = [];
    for (const cnpj of candidateCnpjs) {
      if (timeLeft() <= 0) break;
      if (hydrated.length >= (input.needed || maxLookups)) break;
      try {
        const l4 = await l4Enrichment.lookup(input.prisma, cnpj);
        if (!l4?.found) continue; // 404/429/inválido — ignora, próximo candidato
        hydrated.push({
          cnpj: l4.cnpj || cnpj,
          nomeFantasia: l4.nomeFantasia || null,
          razaoSocial: l4.razaoSocial || null,
          city: l4.city || null,
          state: l4.state || null,
          cnae: l4.cnae || null,
          cnaeDescription: l4.cnaeDescription || null,
          situacao: l4.companySituation || 'ativa',
          porte: l4.porte || null,
          matrizFilial: l4.matrizFilial || null,
          email: l4.email || null,
          phone: l4.phone || null,
          website: l4.website || null,
          address: l4.address || null,
          raw: null,
        });
      } catch {
        // degrade gracioso: ignora o CNPJ que falhou, segue pros próximos
        continue;
      }
    }

    return hydrated;
  }

  /** Reuso do client web-search já existente (ver comentário do topo do arquivo). */
  private async searchWeb(query: string, timeoutMs: number): Promise<WebSearchResult[]> {
    const engineUrl = resolveHbxEngineUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${engineUrl}/web-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 10, fresh: false }),
        signal: controller.signal,
      });
      if (!response.ok) return [];
      const data = (await response.json()) as WebSearchResponse;
      return Array.isArray(data?.results) ? data.results : [];
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Flag mestre — default OFF (spec: "Env novas"). */
export function isCnpjDiscoveryEnabled(): boolean {
  return envEnabled('HBX_RADAR_CNPJ_DISCOVERY_ENABLED', false);
}
