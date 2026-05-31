import { Injectable } from '@nestjs/common';
import { buildLightCrawlUrls, normalizeWebsiteUrl, WEBSITE_CRAWL_LIGHT_PATHS } from './website-crawl-link-extractor';
import { WebsiteCrawlContactExtractor } from './website-crawl-contact-extractor';
import type {
  WebsiteCrawlEvidence,
  WebsiteCrawlExtractedFields,
  WebsiteCrawlFetchLike,
  WebsiteCrawlOptions,
  WebsiteCrawlResult,
} from './website-crawl-types';

const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_MAX_HTML_BYTES = 250_000;

function positiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function emptyFields(): WebsiteCrawlExtractedFields {
  return {
    phones: [],
    phoneDigits: [],
    whatsappUrls: [],
    whatsappPhoneDigits: [],
    instagramUrls: [],
    facebookUrls: [],
    emails: [],
    cnpjs: [],
    address: null,
    contactLinks: [],
    formLinks: [],
    budgetLinks: [],
    chatLinks: [],
    hasContactForm: false,
    hasBudgetIntent: false,
    hasChatWidget: false,
    opportunitySignals: [],
    siteIssues: [],
  };
}

function mergeFields(target: WebsiteCrawlExtractedFields, incoming: WebsiteCrawlExtractedFields) {
  const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));
  target.phones = unique([...target.phones, ...incoming.phones]);
  target.phoneDigits = unique([...target.phoneDigits, ...incoming.phoneDigits]);
  target.whatsappUrls = unique([...target.whatsappUrls, ...incoming.whatsappUrls]);
  target.whatsappPhoneDigits = unique([...target.whatsappPhoneDigits, ...incoming.whatsappPhoneDigits]);
  target.instagramUrls = unique([...target.instagramUrls, ...incoming.instagramUrls]);
  target.facebookUrls = unique([...target.facebookUrls, ...incoming.facebookUrls]);
  target.emails = unique([...target.emails, ...incoming.emails]);
  target.cnpjs = unique([...target.cnpjs, ...incoming.cnpjs]);
  target.contactLinks = unique([...target.contactLinks, ...incoming.contactLinks]);
  target.formLinks = unique([...target.formLinks, ...incoming.formLinks]);
  target.budgetLinks = unique([...target.budgetLinks, ...incoming.budgetLinks]);
  target.chatLinks = unique([...target.chatLinks, ...incoming.chatLinks]);
  target.opportunitySignals = unique([...target.opportunitySignals, ...incoming.opportunitySignals]);
  target.siteIssues = unique([...target.siteIssues, ...incoming.siteIssues]);
  target.address = target.address || incoming.address || null;
  target.hasContactForm = target.hasContactForm || incoming.hasContactForm;
  target.hasBudgetIntent = target.hasBudgetIntent || incoming.hasBudgetIntent;
  target.hasChatWidget = target.hasChatWidget || incoming.hasChatWidget;
}

function countFields(fields: WebsiteCrawlExtractedFields) {
  return fields.phoneDigits.length
    + fields.whatsappUrls.length
    + fields.instagramUrls.length
    + fields.facebookUrls.length
    + fields.emails.length
    + fields.cnpjs.length
    + fields.formLinks.length
    + fields.budgetLinks.length
    + fields.chatLinks.length
    + (fields.address ? 1 : 0);
}

@Injectable()
export class WebsiteCrawlProviderService {
  constructor(private readonly extractor = new WebsiteCrawlContactExtractor()) {}

  async crawl(rawUrl: string, options: WebsiteCrawlOptions = {}): Promise<WebsiteCrawlResult> {
    const normalized = normalizeWebsiteUrl(rawUrl);
    const evidence: WebsiteCrawlEvidence = {
      requestedUrl: String(rawUrl || ''),
      normalizedUrl: normalized.url,
      pages: [],
    };
    if (!normalized.url) {
      return {
        status: 'skipped',
        retryable: false,
        foundCount: 0,
        acceptedCount: 0,
        rejectedCount: 1,
        reason: normalized.reason || 'website_invalido',
        evidence,
        fields: emptyFields(),
      };
    }

    const timeoutMs = options.timeoutMs || positiveIntegerEnv('HBX_RADAR_WEBSITE_CRAWL_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
    const maxHtmlBytes = options.maxHtmlBytes || positiveIntegerEnv('HBX_RADAR_WEBSITE_CRAWL_MAX_HTML_BYTES', DEFAULT_MAX_HTML_BYTES);
    const fetcher = options.fetcher || (globalThis.fetch as WebsiteCrawlFetchLike | undefined);
    if (!fetcher) {
      return this.failure(evidence, 'fetch_indisponivel', false);
    }

    const urls = buildLightCrawlUrls(normalized.url, options.paths || WEBSITE_CRAWL_LIGHT_PATHS);
    const fields = emptyFields();
    let fetched = 0;
    let failures = 0;

    for (const url of urls) {
      try {
        const html = await this.fetchHtml(fetcher, url, timeoutMs, maxHtmlBytes);
        fetched += 1;
        evidence.pages.push({ url, status: 'fetched', httpStatus: html.status, bytesRead: html.body.length });
        mergeFields(fields, this.extractor.extract(html.body, url));
      } catch (error) {
        failures += 1;
        evidence.pages.push({
          url,
          status: 'error',
          reason: String((error as any)?.message || error || 'falha_fetch'),
        });
      }
    }

    const foundCount = countFields(fields);
    if (!fetched && failures) {
      return {
        ...this.failure(evidence, 'website_crawl_fetch_failed', true),
        foundCount,
      };
    }
    return {
      status: failures ? 'partial_error' : 'completed',
      retryable: failures > 0,
      foundCount,
      acceptedCount: foundCount,
      rejectedCount: failures,
      reason: foundCount ? 'website_crawl_light_executado' : 'website_crawl_sem_dados_publicos',
      evidence,
      fields,
      issue: failures ? {
        message: 'website_crawl_light teve falhas parciais',
        retryable: true,
        blocksDelivery: false,
      } : null,
    };
  }

  private async fetchHtml(fetcher: WebsiteCrawlFetchLike, url: string, timeoutMs: number, maxHtmlBytes: number) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, {
        signal: controller.signal,
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'HBX Radar Website Crawl Light',
        },
      });
      if (!response.ok) throw new Error(`http_${response.status}`);
      const contentType = response.headers?.get?.('content-type') || '';
      if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) throw new Error('content_type_nao_html');
      const body = (await response.text()).slice(0, maxHtmlBytes);
      return { status: response.status, body };
    } finally {
      clearTimeout(timer);
    }
  }

  private failure(evidence: WebsiteCrawlEvidence, reason: string, retryable: boolean): WebsiteCrawlResult {
    return {
      status: retryable ? 'partial_error' : 'failed',
      retryable,
      foundCount: 0,
      acceptedCount: 0,
      rejectedCount: evidence.pages.length || 1,
      reason,
      evidence,
      fields: emptyFields(),
      issue: {
        message: reason,
        retryable,
        blocksDelivery: false,
      },
    };
  }
}
