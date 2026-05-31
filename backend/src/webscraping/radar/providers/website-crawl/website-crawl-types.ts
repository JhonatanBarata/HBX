export type WebsiteCrawlStatus = 'completed' | 'partial_error' | 'skipped' | 'failed';

export type WebsiteCrawlFetchLike = (
  url: string,
  init?: {
    signal?: AbortSignal;
    headers?: Record<string, string>;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  headers?: { get?: (name: string) => string | null };
}>;

export type WebsiteCrawlOptions = {
  timeoutMs?: number;
  maxHtmlBytes?: number;
  paths?: string[];
  fetcher?: WebsiteCrawlFetchLike;
};

export type WebsiteCrawlExtractedFields = {
  phones: string[];
  phoneDigits: string[];
  whatsappUrls: string[];
  whatsappPhoneDigits: string[];
  instagramUrls: string[];
  facebookUrls: string[];
  emails: string[];
  cnpjs: string[];
  address: string | null;
  contactLinks: string[];
  formLinks: string[];
  budgetLinks: string[];
  chatLinks: string[];
  hasContactForm: boolean;
  hasBudgetIntent: boolean;
  hasChatWidget: boolean;
  opportunitySignals: string[];
  siteIssues: string[];
};

export type WebsiteCrawlEvidence = {
  requestedUrl: string;
  normalizedUrl: string | null;
  pages: Array<{
    url: string;
    status: 'fetched' | 'error' | 'skipped';
    httpStatus?: number | null;
    bytesRead?: number;
    reason?: string;
  }>;
};

export type WebsiteCrawlResult = {
  status: WebsiteCrawlStatus;
  retryable: boolean;
  foundCount: number;
  acceptedCount: number;
  rejectedCount: number;
  reason: string;
  evidence: WebsiteCrawlEvidence;
  fields: WebsiteCrawlExtractedFields;
  issue?: {
    message: string;
    retryable: boolean;
    blocksDelivery: false;
  } | null;
};
