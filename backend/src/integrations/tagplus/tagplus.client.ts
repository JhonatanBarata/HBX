import { Injectable } from '@nestjs/common';
import { IntegrationHttpService } from '../integration-http.service';
import { TagPlusConnectionCredentials, TagPlusConnectionTestResult, TagPlusListRecordsInput, TagPlusListRecordsResult } from './tagplus.types';
import { resolveTagPlusRuntime } from './tagplus.runtime';

@Injectable()
export class TagPlusClient {
  constructor(private readonly integrationHttp: IntegrationHttpService) {}

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private normalizeRemoteRecord(item: unknown) {
    const record: Record<string, unknown> = this.isRecord(item) ? { ...item } : { value: item };
    return {
      ...record,
      rawPayload: this.isRecord(record.rawPayload) ? record.rawPayload : record,
    };
  }

  private unwrapListPayload(payload: unknown) {
    if (Array.isArray(payload)) return payload;
    if (!this.isRecord(payload)) return [];

    const candidates = [
      payload.items,
      payload.results,
      payload.rows,
      payload.data,
      this.isRecord(payload.data) ? payload.data.items : null,
      this.isRecord(payload.data) ? payload.data.results : null,
      this.isRecord(payload.result) ? payload.result.items : null,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }

    return [];
  }

  private normalizeListPayload(payload: unknown): TagPlusListRecordsResult {
    return {
      items: this.unwrapListPayload(payload).map((item) => this.normalizeRemoteRecord(item)),
      source: 'remote',
      note: null,
    };
  }

  private buildAuth(runtime: ReturnType<typeof resolveTagPlusRuntime>) {
    if (!runtime.token) {
      throw new Error('Token TagPlus nao configurado.');
    }

    if (runtime.authMode === 'query_token') {
      return {
        headers: {},
        params: {
          token: runtime.token,
        },
      };
    }

    return {
      headers: {
        Authorization: `Bearer ${runtime.token}`,
      },
      params: {},
    };
  }

  private async requestList(path: string, runtime: ReturnType<typeof resolveTagPlusRuntime>, input: TagPlusListRecordsInput, purpose: string) {
    if (!runtime.baseUrl) {
      throw new Error('TAGPLUS_API_BASE_URL nao configurada e baseUrl nao foi informada na conexao.');
    }

    const auth = this.buildAuth(runtime);
    const result = await this.integrationHttp.paginate<unknown, Record<string, unknown>>({
      provider: 'TAGPLUS',
      purpose,
      pageSize: runtime.pageSize,
      requestPage: async (page) => {
        const response = await this.integrationHttp.requestJson<unknown>({
          provider: 'TAGPLUS',
          purpose,
          method: 'GET',
          baseUrl: runtime.baseUrl,
          path,
          headers: auth.headers,
          params: {
            ...auth.params,
            ...(runtime.externalAccountId ? { externalAccountId: runtime.externalAccountId } : {}),
            ...(input.updatedSince ? { [runtime.updatedSinceParam]: input.updatedSince } : {}),
            [runtime.pageParam]: page,
            [runtime.pageSizeParam]: runtime.pageSize,
          },
          timeoutMs: runtime.timeoutMs,
          retryAttempts: runtime.retryAttempts,
          backoffMs: runtime.backoffMs,
        });
        return response.data;
      },
      extractItems: (payload) => this.normalizeListPayload(payload).items,
    });

    return {
      items: result.items,
      source: 'remote' as const,
      note: result.hasMore
        ? 'Paginacao TagPlus interrompida no limite configurado; ajuste page size ou max pages para homologacao completa.'
        : null,
    };
  }

  async listCustomers(credentials: TagPlusConnectionCredentials, input: TagPlusListRecordsInput = {}): Promise<TagPlusListRecordsResult> {
    const runtime = resolveTagPlusRuntime(credentials);
    if (!runtime.customersPath) {
      return {
        items: [],
        source: 'remote',
        note: 'TagPlus customers endpoint nao configurado; sync dedicado de clientes foi ignorado.',
      };
    }

    return this.requestList(runtime.customersPath, runtime, input, 'listCustomers');
  }

  async listReceivables(credentials: TagPlusConnectionCredentials, input: TagPlusListRecordsInput = {}): Promise<TagPlusListRecordsResult> {
    const runtime = resolveTagPlusRuntime(credentials);
    if (!runtime.receivablesPath) {
      throw new Error('Contrato TagPlus incompleto: configure TAGPLUS_RECEIVABLES_PATH para sincronizar cobrancas/titulos.');
    }

    return this.requestList(runtime.receivablesPath, runtime, input, 'listReceivables');
  }

  async testConnection(credentials: TagPlusConnectionCredentials): Promise<TagPlusConnectionTestResult> {
    const runtime = resolveTagPlusRuntime(credentials);
    if (!runtime.token) {
      return {
        ok: false,
        status: 'DISCONNECTED',
        message: 'Token TagPlus nao configurado.',
      };
    }

    try {
      const testPath = runtime.testPath || runtime.receivablesPath || runtime.customersPath;
      if (!testPath) {
        return {
          ok: false,
          status: 'DISCONNECTED',
          message: 'Contrato TagPlus incompleto: configure TAGPLUS_TEST_PATH, TAGPLUS_RECEIVABLES_PATH ou TAGPLUS_CUSTOMERS_PATH.',
        };
      }

      await this.requestList(testPath, runtime, { updatedSince: null }, 'testConnection');
      return {
        ok: true,
        status: 'CONNECTED',
        message: 'Conexao TagPlus validada via chamada HTTP real.',
      };
    } catch (error) {
      return {
        ok: false,
        status: 'ERROR',
        message: error instanceof Error ? error.message : 'Falha ao validar conexao TagPlus.',
      };
    }
  }

  async listRecords(credentials: TagPlusConnectionCredentials, input: TagPlusListRecordsInput): Promise<TagPlusListRecordsResult> {
    return this.listReceivables(credentials, input);
  }
}