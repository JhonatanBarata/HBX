import { Injectable, Optional } from '@nestjs/common';
import type { WebscrapingContactResult } from '../shared/radar-core-shared';
import { buildRadarStageIssue } from '../shared/radar-stage-policy';
import { isOfficialWebsiteUrl } from '../providers/website-crawl/website-crawl-link-extractor';
import { WebsiteCrawlProviderService } from '../providers/website-crawl/website-crawl-provider.service';
import type { WebsiteCrawlOptions, WebsiteCrawlResult } from '../providers/website-crawl/website-crawl-types';
import type { RadarLeadSourceResult } from './radar-lead-source.types';

function envEnabled(name: string) {
  return String(process.env[name] || '').trim().toLowerCase() === 'true';
}

function positiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function firstValue(values: string[]) {
  return values.find((value) => String(value || '').trim()) || null;
}

function sourceIssue(message: string) {
  return buildRadarStageIssue({
    stage: 'site',
    code: 'site_enrichment_failed',
    message,
    retryable: true,
    blocksDelivery: false,
  });
}

@Injectable()
export class RadarWebsiteCrawlSourceService {
  constructor(@Optional() private readonly provider?: WebsiteCrawlProviderService) {}

  async run(input: {
    currentResults: WebscrapingContactResult[];
    remainingQuantity?: number;
    options?: WebsiteCrawlOptions;
  }): Promise<RadarLeadSourceResult> {
    if (!envEnabled('HBX_RADAR_WEBSITE_CRAWL_LIGHT_ENABLED')) {
      return {
        source: 'website_crawl_light',
        status: 'skipped',
        retryable: false,
        foundCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        reason: 'flag_website_crawl_light_desativada',
        results: [],
      };
    }

    const maxSites = Math.min(
      positiveIntegerEnv('HBX_RADAR_WEBSITE_CRAWL_MAX_SITES_PER_RUN', 3),
      Math.max(1, input.remainingQuantity || Number.MAX_SAFE_INTEGER),
    );
    const candidates = (input.currentResults || [])
      .filter((result) => isOfficialWebsiteUrl(result.website))
      .slice(0, maxSites);
    if (!candidates.length) {
      return {
        source: 'website_crawl_light',
        status: 'skipped',
        retryable: false,
        foundCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        reason: 'sem_website_oficial_para_crawl',
        results: [],
      };
    }

    const provider = this.provider || new WebsiteCrawlProviderService();
    const results: WebscrapingContactResult[] = [];
    let foundCount = 0;
    let rejectedCount = 0;
    let retryable = false;

    for (const candidate of candidates) {
      try {
        const crawl = await provider.crawl(String(candidate.website || ''), input.options || {});
        foundCount += crawl.foundCount;
        rejectedCount += crawl.rejectedCount;
        retryable = retryable || crawl.retryable;
        const enriched = this.toResult(candidate, crawl);
        if (enriched) results.push(enriched);
      } catch (error) {
        rejectedCount += 1;
        retryable = true;
      }
    }

    if (retryable && !results.length) {
      const issue = sourceIssue('website_crawl_light falhou sem bloquear delivery');
      return {
        source: 'website_crawl_light',
        status: 'partial_error',
        retryable: true,
        foundCount,
        acceptedCount: 0,
        rejectedCount,
        reason: issue.message,
        results: [],
        issue,
      };
    }

    return {
      source: 'website_crawl_light',
      status: retryable ? 'partial_error' : 'completed',
      retryable,
      foundCount,
      acceptedCount: results.length,
      rejectedCount,
      reason: results.length ? 'website_crawl_light_executado' : 'website_crawl_light_sem_dados_publicos',
      results,
      issue: retryable ? sourceIssue('website_crawl_light teve falhas parciais sem bloquear delivery') : null,
    };
  }

  private toResult(candidate: WebscrapingContactResult, crawl: WebsiteCrawlResult): WebscrapingContactResult | null {
    if (!crawl.fields || crawl.foundCount <= 0) return null;
    const phoneDigits = candidate.phoneDigits || firstValue(crawl.fields.phoneDigits) || '';
    const phone = candidate.phone || firstValue(crawl.fields.phones) || phoneDigits;
    return {
      ...candidate,
      placeId: candidate.placeId || `website_crawl_light:${candidate.website}`,
      phone,
      phoneDigits,
      website: candidate.website,
      email: candidate.email || firstValue(crawl.fields.emails),
      instagramUrl: candidate.instagramUrl || firstValue(crawl.fields.instagramUrls),
      facebookUrl: candidate.facebookUrl || firstValue(crawl.fields.facebookUrls),
      address: candidate.address || crawl.fields.address || null,
      cnpj: (candidate as any).cnpj || firstValue(crawl.fields.cnpjs),
      whatsappStatus: (candidate as any).whatsappStatus || (crawl.fields.whatsappPhoneDigits.length || crawl.fields.whatsappUrls.length ? 'unverified' : undefined),
      whatsappUrl: (candidate as any).whatsappUrl || firstValue(crawl.fields.whatsappUrls),
      source: 'website_crawl_light',
      sourceEngine: 'website_crawl_light',
      evidenceJson: {
        ...((typeof candidate.evidenceJson === 'object' && candidate.evidenceJson) ? candidate.evidenceJson : {}),
        websiteCrawlLight: crawl.evidence,
        extractedFields: crawl.fields,
      },
    } as any;
  }
}
