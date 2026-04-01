import { Injectable } from '@nestjs/common';
import { IntegrationHttpService } from '../integration-http.service';
import {
  AuvoConnectionCredentials,
  AuvoConnectionTestResult,
  AuvoListRecordsInput,
  AuvoListRecordsResult,
  AuvoRemoteRecord,
} from './auvo.types';
import { resolveAuvoRuntime } from './auvo.runtime';

@Injectable()
export class AuvoClient {
  constructor(private readonly integrationHttp: IntegrationHttpService) {}

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private looksLikeRemoteRecord(value: unknown) {
    if (!this.isRecord(value)) return false;
    const keys = Object.keys(value);
    return [
      'externalId',
      'external_id',
      'taskID',
      'taskId',
      'task_id',
      'id',
      'title',
      'name',
      'orientation',
      'status',
      'taskStatus',
      'customer',
      'userTo',
    ].some((key) => keys.includes(key));
  }

  private buildScaffoldNote(input?: AuvoListRecordsInput) {
    return input?.updatedSince
      ? `Sync AUVO em modo scaffold desde ${input.updatedSince}. Nenhum endpoint remoto foi configurado nesta sprint.`
      : 'Sync AUVO em modo scaffold. Nenhum endpoint remoto foi configurado nesta sprint.';
  }

  private unwrapListPayload(payload: unknown) {
    if (Array.isArray(payload)) {
      return { items: payload, rawShape: 'array' };
    }
    if (!this.isRecord(payload)) {
      return { items: [], rawShape: 'unknown' };
    }

    const data = this.isRecord(payload.data) ? payload.data : null;
    const result = this.isRecord(payload.result) ? payload.result : null;
    const response = this.isRecord(payload.response) ? payload.response : null;
    const dataResult = data && this.isRecord(data.result) ? data.result : null;
    const dataResponse = data && this.isRecord(data.response) ? data.response : null;
    const resultData = result && this.isRecord(result.data) ? result.data : null;
    const responseData = response && this.isRecord(response.data) ? response.data : null;
    const candidates: Array<[string, unknown]> = [
      ['items', payload.items],
      ['results', payload.results],
      ['tasks', payload.tasks],
      ['records', payload.records],
      ['rows', payload.rows],
      ['data.items', data?.items],
      ['data.results', data?.results],
      ['data.tasks', data?.tasks],
      ['data.records', data?.records],
      ['data.rows', data?.rows],
      ['data.result.items', dataResult?.items],
      ['data.response.items', dataResponse?.items],
      ['result.items', result?.items],
      ['result.results', result?.results],
      ['result.tasks', result?.tasks],
      ['result.data.items', resultData?.items],
      ['response.items', response?.items],
      ['response.results', response?.results],
      ['response.tasks', response?.tasks],
      ['response.data.items', responseData?.items],
      ['data', payload.data],
      ['result', payload.result],
      ['response', payload.response],
    ];

    for (const [shape, value] of candidates) {
      if (Array.isArray(value)) {
        return { items: value, rawShape: shape };
      }
    }

    const singleCandidates: Array<[string, unknown]> = [
      ['item', payload.item],
      ['task', payload.task],
      ['record', payload.record],
      ['data.item', data?.item],
      ['data.task', data?.task],
      ['data.record', data?.record],
      ['data.result.item', dataResult?.item],
      ['result.item', result?.item],
      ['result.task', result?.task],
      ['result.record', result?.record],
      ['result.data.item', resultData?.item],
      ['response.item', response?.item],
      ['response.task', response?.task],
      ['response.record', response?.record],
      ['response.data.item', responseData?.item],
      ['response.data.task', responseData?.task],
    ];

    for (const [shape, value] of singleCandidates) {
      if (this.looksLikeRemoteRecord(value)) {
        return { items: [value], rawShape: shape };
      }
    }

    if (this.looksLikeRemoteRecord(payload)) {
      return { items: [payload], rawShape: 'record' };
    }

    const keys = Object.keys(payload).slice(0, 8).join(',');
    return { items: [], rawShape: keys ? `keys:${keys}` : 'record' };
  }

  private normalizeRemoteRecord(item: unknown): AuvoRemoteRecord {
    const record: Record<string, unknown> = this.isRecord(item) ? { ...item } : { value: item };
    const rawPayload = this.isRecord(record.rawPayload) ? record.rawPayload : record;
    return {
      ...record,
      rawPayload,
    };
  }

  normalizeListPayload(
    payload: unknown,
    source: AuvoListRecordsResult['source'] = 'normalized',
  ): AuvoListRecordsResult {
    const envelope = this.unwrapListPayload(payload);
    return {
      items: envelope.items.map((item) => this.normalizeRemoteRecord(item)),
      source,
      note: null,
      rawShape: envelope.rawShape,
    };
  }

  private buildAuth(runtime: ReturnType<typeof resolveAuvoRuntime>) {
    if (!runtime.token) {
      throw new Error('Token AUVO nao configurado.');
    }

    if (runtime.authMode === 'app_key_token_query') {
      if (!runtime.appKey) {
        throw new Error('App Key AUVO obrigatoria para authMode=app_key_token_query.');
      }

      return {
        headers: {},
        params: {
          token: runtime.token,
          appKey: runtime.appKey,
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

  private buildBaseParams(runtime: ReturnType<typeof resolveAuvoRuntime>, input?: AuvoListRecordsInput, page?: number) {
    const auth = this.buildAuth(runtime);
    return {
      headers: auth.headers,
      params: {
        ...auth.params,
        ...(runtime.externalAccountId ? { externalAccountId: runtime.externalAccountId } : {}),
        ...(input?.updatedSince ? { [runtime.updatedSinceParam]: input.updatedSince } : {}),
        ...(page ? { [runtime.pageParam]: page } : {}),
        ...(runtime.pageSize > 0 ? { [runtime.pageSizeParam]: input?.limit || runtime.pageSize } : {}),
      },
    };
  }

  private async requestList(path: string, runtime: ReturnType<typeof resolveAuvoRuntime>, input: AuvoListRecordsInput, purpose: string, paramsPatch?: Record<string, unknown>) {
    if (!runtime.baseUrl) {
      throw new Error('AUVO_API_BASE_URL nao configurada e baseUrl nao foi informada na conexao.');
    }

    const pageSize = input.limit || runtime.pageSize;
    const result = await this.integrationHttp.paginate<unknown, AuvoRemoteRecord>({
      provider: 'AUVO',
      purpose,
      pageSize,
      requestPage: async (page) => {
        const request = this.buildBaseParams(runtime, input, page);
        const response = await this.integrationHttp.requestJson<unknown>({
          provider: 'AUVO',
          purpose,
          method: 'GET',
          baseUrl: runtime.baseUrl,
          path,
          headers: request.headers,
          params: {
            ...request.params,
            ...(paramsPatch || {}),
          },
          timeoutMs: runtime.timeoutMs,
          retryAttempts: runtime.retryAttempts,
          backoffMs: runtime.backoffMs,
        });
        return response.data;
      },
      extractItems: (payload) => this.normalizeListPayload(payload, 'remote').items,
    });

    return {
      items: result.items,
      source: 'remote' as const,
      note: result.hasMore
        ? 'Paginacao AUVO interrompida no limite configurado; ajuste page size ou max pages para homologacao completa.'
        : null,
      rawShape: null,
    };
  }

  async listCustomers(
    credentials: AuvoConnectionCredentials,
    input: AuvoListRecordsInput = {},
  ): Promise<AuvoListRecordsResult> {
    const runtime = resolveAuvoRuntime(credentials);
    if (!runtime.customersPath) {
      return {
        items: [],
        source: 'remote',
        note: 'AUVO customers endpoint nao configurado; sync de clientes dedicados foi ignorado.',
        rawShape: null,
      };
    }

    return this.requestList(runtime.customersPath, runtime, input, 'listCustomers');
  }

  async testConnection(credentials: AuvoConnectionCredentials): Promise<AuvoConnectionTestResult> {
    const runtime = resolveAuvoRuntime(credentials);
    if (!runtime.token) {
      return {
        ok: false,
        status: 'DISCONNECTED',
        message: 'Token AUVO nao configurado.',
      };
    }

    try {
      const testPath = runtime.testPath || runtime.tasksPath || runtime.customersPath;
      if (!testPath) {
        return {
          ok: false,
          status: 'DISCONNECTED',
          message: 'Contrato AUVO incompleto: configure AUVO_TEST_PATH, AUVO_TASKS_PATH ou AUVO_CUSTOMERS_PATH.',
        };
      }

      await this.requestList(testPath, runtime, { limit: 1 }, 'testConnection');
      return {
        ok: true,
        status: 'CONNECTED',
        message: 'Conexao AUVO validada via chamada HTTP real.',
      };
    } catch (error) {
      return {
        ok: false,
        status: 'ERROR',
        message: error instanceof Error ? error.message : 'Falha ao validar conexao AUVO.',
      };
    }
  }

  async listRecords(
    credentials: AuvoConnectionCredentials,
    input: AuvoListRecordsInput,
  ): Promise<AuvoListRecordsResult> {
    const runtime = resolveAuvoRuntime(credentials);
    if (!runtime.tasksPath) {
      throw new Error('Contrato AUVO incompleto: configure AUVO_TASKS_PATH para sincronizar tarefas/OS.');
    }

    const pendingPatch = runtime.pendingStatusValues.length
      ? { [runtime.pendingStatusParam]: runtime.pendingStatusValues.join(',') }
      : undefined;
    return this.requestList(runtime.tasksPath, runtime, input, 'listTasks', pendingPatch);
  }
}