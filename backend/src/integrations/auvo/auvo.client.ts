import { Injectable } from '@nestjs/common';
import {
  AuvoConnectionCredentials,
  AuvoConnectionTestResult,
  AuvoListRecordsInput,
  AuvoListRecordsResult,
  AuvoRemoteRecord,
} from './auvo.types';

@Injectable()
export class AuvoClient {
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

  async testConnection(credentials: AuvoConnectionCredentials): Promise<AuvoConnectionTestResult> {
    const secret = String(credentials?.secret || '').trim();
    if (!secret) {
      return {
        ok: false,
        status: 'ERROR',
        message: 'Segredo AUVO nao configurado.',
      };
    }

    return {
      ok: true,
      status: 'CONNECTED',
      message: 'Scaffold AUVO validado localmente. Endpoint remoto ainda nao foi configurado nesta sprint.',
    };
  }

  async listRecords(
    credentials: AuvoConnectionCredentials,
    input: AuvoListRecordsInput,
  ): Promise<AuvoListRecordsResult> {
    const secret = String(credentials?.secret || '').trim();
    if (!secret) {
      throw new Error('Segredo AUVO nao configurado.');
    }

    const response = this.normalizeListPayload({ items: [] }, 'scaffold');
    return {
      ...response,
      note: this.buildScaffoldNote(input),
    };
  }
}