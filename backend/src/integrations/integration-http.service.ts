import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosHeaders, AxiosRequestConfig, AxiosResponseHeaders } from 'axios';

export type IntegrationHttpRequestOptions = {
  provider: string;
  purpose: string;
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  baseUrl: string;
  path: string;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  data?: unknown;
  timeoutMs?: number;
  retryAttempts?: number;
  backoffMs?: number;
};

export type IntegrationHttpResult<T = unknown> = {
  data: T;
  status: number;
  headers: AxiosResponseHeaders | Partial<AxiosHeaders>;
  durationMs: number;
};

export type IntegrationPaginationOptions<TPayload, TItem> = {
  provider: string;
  purpose: string;
  pageSize?: number | null;
  maxPages?: number;
  requestPage: (page: number) => Promise<TPayload>;
  extractItems: (payload: TPayload) => TItem[];
  resolveNextPage?: (payload: TPayload, currentPage: number, pageItems: TItem[]) => number | null;
};

@Injectable()
export class IntegrationHttpService {
  private readonly logger = new Logger(IntegrationHttpService.name);

  computeBackoffDelay(baseBackoffMs = 0, attempt = 1) {
    const safeBase = Math.max(0, Number(baseBackoffMs || 0));
    const safeAttempt = Math.max(1, Number(attempt || 1));
    return safeBase * safeAttempt;
  }

  private sleep(delayMs: number) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private normalizeBaseUrl(baseUrl: string) {
    return String(baseUrl || '').trim().replace(/\/+$/, '');
  }

  private normalizePath(path: string) {
    const normalized = String(path || '').trim();
    if (!normalized) return '/';
    return normalized.startsWith('/') ? normalized : `/${normalized}`;
  }

  private buildRequestUrl(baseUrl: string, path: string) {
    return `${this.normalizeBaseUrl(baseUrl)}${this.normalizePath(path)}`;
  }

  private buildErrorMessage(error: AxiosError | any, provider: string, purpose: string) {
    const responseData = error?.response?.data;
    const status = Number(error?.response?.status || 0) || null;
    const apiMessage = String(
      responseData?.message ||
        responseData?.error_description ||
        responseData?.error ||
        responseData?.detail ||
        responseData?.title ||
        error?.message ||
        '',
    ).trim();
    const label = `${provider} ${purpose}`.trim();

    if (status && apiMessage) return `${label}: ${status} ${apiMessage}`;
    if (status) return `${label}: HTTP ${status}`;
    if (apiMessage) return `${label}: ${apiMessage}`;
    return `${label}: falha na chamada HTTP.`;
  }

  private isTransientError(error: AxiosError | any) {
    const status = Number(error?.response?.status || 0) || null;
    const code = String(error?.code || '').trim().toUpperCase();
    if (status && [408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;
    return ['ECONNABORTED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code);
  }

  async requestJson<T = unknown>(options: IntegrationHttpRequestOptions): Promise<IntegrationHttpResult<T>> {
    const retryAttempts = Math.max(0, Number(options.retryAttempts || 0));
    const timeoutMs = Math.max(1000, Number(options.timeoutMs || 15000));
    const requestUrl = this.buildRequestUrl(options.baseUrl, options.path);

    for (let attempt = 1; attempt <= retryAttempts + 1; attempt += 1) {
      const startedAt = Date.now();
      try {
        const response = await axios.request<T>({
          method: options.method,
          url: requestUrl,
          headers: options.headers,
          params: options.params,
          data: options.data,
          timeout: timeoutMs,
        } as AxiosRequestConfig<T>);

        return {
          data: response.data,
          status: Number(response.status || 200),
          headers: response.headers || {},
          durationMs: Date.now() - startedAt,
        };
      } catch (error: any) {
        const retryable = this.isTransientError(error);
        const message = this.buildErrorMessage(error, options.provider, options.purpose);
        const durationMs = Date.now() - startedAt;

        if (retryable && attempt <= retryAttempts) {
          const delayMs = this.computeBackoffDelay(options.backoffMs || 0, attempt);
          this.logger.warn(
            `[${options.provider}] ${options.purpose} falhou na tentativa ${attempt}/${retryAttempts + 1} em ${durationMs}ms: ${message}. Retry em ${delayMs}ms.`,
          );
          if (delayMs > 0) {
            await this.sleep(delayMs);
          }
          continue;
        }

        throw new Error(message);
      }
    }

    throw new Error(`${options.provider} ${options.purpose}: falha HTTP sem detalhe adicional.`);
  }

  private defaultNextPage(currentPage: number, pageItems: unknown[], pageSize?: number | null) {
    if (!pageSize || pageSize <= 0) return null;
    return pageItems.length >= pageSize ? currentPage + 1 : null;
  }

  async paginate<TPayload, TItem>(options: IntegrationPaginationOptions<TPayload, TItem>) {
    const items: TItem[] = [];
    const maxPages = Math.max(1, Number(options.maxPages || 20));
    let currentPage = 1;
    let pagesFetched = 0;

    while (currentPage && pagesFetched < maxPages) {
      const payload = await options.requestPage(currentPage);
      const pageItems = options.extractItems(payload) || [];
      items.push(...pageItems);
      pagesFetched += 1;

      const nextPage = options.resolveNextPage
        ? options.resolveNextPage(payload, currentPage, pageItems)
        : this.defaultNextPage(currentPage, pageItems, options.pageSize);

      if (!nextPage || nextPage <= currentPage) {
        return {
          items,
          pagesFetched,
          lastPage: currentPage,
          hasMore: false,
        };
      }

      currentPage = nextPage;
    }

    return {
      items,
      pagesFetched,
      lastPage: currentPage,
      hasMore: pagesFetched >= maxPages,
    };
  }
}