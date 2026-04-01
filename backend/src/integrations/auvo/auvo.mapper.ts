import { Injectable } from '@nestjs/common';
import { AuvoMappedRecord, AuvoRemoteRecord } from './auvo.types';

const EXTERNAL_ID_PATHS = ['externalId', 'external_id', 'taskID', 'taskId', 'task_id', 'task.id', 'id'];
const TITLE_PATHS = ['title', 'name', 'description', 'orientation', 'taskDescription', 'serviceDescription', 'subject'];
const STATUS_PATHS = ['status', 'taskStatus', 'situation', 'status.description', 'situation.description'];
const START_PATHS = ['scheduledStart', 'startDate', 'taskDate', 'date', 'initialDate', 'start_at', 'checkInDate', 'start.date', 'dates.start'];
const END_PATHS = ['scheduledEnd', 'endDate', 'finalDate', 'finishDate', 'end_at', 'checkOutDate', 'end.date', 'dates.end'];
const TECHNICIAN_PATHS = ['technicianName', 'technician', 'technician.name', 'userName', 'user', 'user.name', 'userTo', 'userTo.name', 'assignedTo', 'assignedTo.name'];
const CUSTOMER_PATHS = ['customerName', 'customerDescription', 'customer', 'customer.name', 'clientName', 'client', 'client.name', 'deal.customer.name', 'deal.customerName'];
const CUSTOMER_PHONE_PATHS = ['phone', 'mobile', 'whatsapp', 'customer.phone', 'customer.mobile', 'customer.whatsapp', 'client.phone', 'client.mobile', 'contact.phone', 'contact.mobile'];
const CUSTOMER_EMAIL_PATHS = ['email', 'customer.email', 'client.email', 'contact.email'];
const CUSTOMER_DOCUMENT_PATHS = ['document', 'cpfCnpj', 'customer.document', 'customer.cpfCnpj', 'client.document', 'client.cpfCnpj'];
const EXTERNAL_CUSTOMER_ID_PATHS = ['customerId', 'clientId', 'externalCustomerId', 'customer.id', 'customer.customerId', 'client.id', 'client.customerId'];
const EXTERNAL_DEBT_ID_PATHS = ['deal.id', 'deal.debtId', 'financial.id', 'charge.id', 'invoice.id'];
const DEBT_AMOUNT_PATHS = ['deal.amount', 'financial.amount', 'charge.amount', 'invoice.amount', 'openAmount', 'amount'];
const DEBT_DUE_DATE_PATHS = ['deal.dueDate', 'financial.dueDate', 'charge.dueDate', 'invoice.dueDate', 'dueDate'];
const DEBT_STATUS_PATHS = ['deal.status', 'financial.status', 'charge.status', 'invoice.status', 'paymentStatus'];
const UPDATED_AT_PATHS = ['updatedAt', 'updated_at', 'lastUpdate', 'lastUpdatedAt', 'modifiedAt', 'lastModified', 'updateDate', 'updated.date', 'dates.updatedAt'];

@Injectable()
export class AuvoMapper {
  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private normalizeText(value: unknown) {
    if (value == null) return null;
    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized || null;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (!this.isRecord(value)) return null;

    for (const key of ['name', 'title', 'description', 'label', 'value']) {
      const nested = this.normalizeText(value[key]);
      if (nested) return nested;
    }
    return null;
  }

  private normalizeIdentifier(value: unknown) {
    if (value == null) return null;
    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized || null;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (!this.isRecord(value)) return null;

    for (const key of ['id', 'externalId', 'external_id', 'taskID', 'taskId', 'task_id', 'value', 'code']) {
      const nested = this.normalizeIdentifier(value[key]);
      if (nested) return nested;
    }
    return null;
  }

  private getPathValue(source: unknown, path: string): unknown {
    if (!this.isRecord(source)) return undefined;

    let current: unknown = source;
    for (const part of path.split('.')) {
      if (!this.isRecord(current)) return undefined;
      current = current[part];
    }
    return current;
  }

  private pickFirstValue(sources: unknown[], paths: string[]) {
    for (const source of sources) {
      for (const path of paths) {
        const value = this.getPathValue(source, path);
        if (value == null) continue;
        if (typeof value === 'string' && !value.trim()) continue;
        return value;
      }
    }
    return null;
  }

  private pickFirstText(sources: unknown[], paths: string[]) {
    return this.normalizeText(this.pickFirstValue(sources, paths));
  }

  private pickFirstIdentifier(sources: unknown[], paths: string[]) {
    return this.normalizeIdentifier(this.pickFirstValue(sources, paths));
  }

  private parseUnixTimestamp(value: number) {
    const normalized = Math.abs(value) < 100000000000 ? value * 1000 : value;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private parsePtBrDate(value: string) {
    const match = value.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})(?:\s*(?:T| )\s*(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!match) return null;

    const [, day, month, year, hour = '00', minute = '00', second = '00'] = match;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private parseIsoDateOnly(value: string) {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const [, year, month, day] = match;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private parseDateFromRecord(value: Record<string, unknown>) {
    for (const key of ['date', 'datetime', 'value', 'timestamp', 'time', 'startDate', 'endDate', 'updatedAt', 'lastUpdate']) {
      const candidate = value[key];
      const parsed = candidate === value ? null : this.parseDate(candidate);
      if (parsed) return parsed;
    }
    return null;
  }

  private parseDate(value: unknown) {
    if (value == null) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number') return this.parseUnixTimestamp(value);
    if (this.isRecord(value)) return this.parseDateFromRecord(value);

    const normalized = this.normalizeText(value);
    if (!normalized) return null;
    if (/^\d{10,13}$/.test(normalized)) {
      return this.parseUnixTimestamp(Number(normalized));
    }

    const ptBrDate = this.parsePtBrDate(normalized);
    if (ptBrDate) return ptBrDate;

    const isoDateOnly = this.parseIsoDateOnly(normalized);
    if (isoDateOnly) return isoDateOnly;

    const isoCandidate = normalized.includes(' ') && !normalized.includes('T') ? normalized.replace(' ', 'T') : normalized;
    const parsed = new Date(isoCandidate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private parseNumber(value: unknown) {
    if (value == null || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const normalized = String(value).replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private normalizeStatus(value: unknown) {
    const normalized = this.normalizeText(value);
    if (!normalized) return null;

    const token = normalized
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!token) return null;
    if (['OPEN', 'ABERTO', 'EM_ABERTO', 'NEW'].includes(token)) return 'OPEN';
    if (['PENDING', 'PENDENTE'].includes(token)) return 'PENDING';
    if (['SCHEDULED', 'AGENDADO', 'PROGRAMADO', 'PLANNED'].includes(token)) return 'SCHEDULED';
    if (['IN_PROGRESS', 'EM_ANDAMENTO', 'EM_EXECUCAO', 'STARTED', 'EXECUTANDO', 'EXECUTION', 'ON_ROUTE'].includes(token)) {
      return 'IN_PROGRESS';
    }
    if (['DONE', 'FINISHED', 'FINALIZADO', 'CONCLUIDO', 'COMPLETED', 'CLOSED', 'FECHADO', 'SUCCESS'].includes(token)) {
      return 'DONE';
    }
    if (['CANCELLED', 'CANCELED', 'CANCELADO'].includes(token)) return 'CANCELED';
    if (['NO_SHOW', 'NAO_COMPARECEU'].includes(token)) return 'NO_SHOW';
    return token;
  }

  private getSources(record: AuvoRemoteRecord) {
    const rawPayload = this.isRecord(record.rawPayload) ? record.rawPayload : null;
    return rawPayload ? [record, rawPayload] : [record];
  }

  private summarizeValue(value: unknown, depth = 0): unknown {
    if (value == null) return null;
    if (typeof value === 'string') return value.slice(0, 240);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (depth >= 1) {
      if (Array.isArray(value)) return value.length;
      if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).slice(0, 12);
      return String(value).slice(0, 240);
    }
    if (Array.isArray(value)) {
      return value.slice(0, 5).map((item) => this.summarizeValue(item, depth + 1));
    }
    if (typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .slice(0, 12)
          .map(([key, nested]) => [key, this.summarizeValue(nested, depth + 1)]),
      );
    }
    return String(value).slice(0, 240);
  }

  private buildRawPayloadSummary(record: AuvoRemoteRecord) {
    const sources = this.getSources(record);
    const payload = this.isRecord(record.rawPayload) ? record.rawPayload : record;
    const summary = {
      externalId: this.pickFirstIdentifier(sources, EXTERNAL_ID_PATHS),
      title: this.pickFirstText(sources, TITLE_PATHS),
      status: this.normalizeStatus(this.pickFirstValue(sources, STATUS_PATHS)),
      scheduledStart: this.normalizeText(this.pickFirstValue(sources, START_PATHS)),
      scheduledEnd: this.normalizeText(this.pickFirstValue(sources, END_PATHS)),
      technician: this.pickFirstText(sources, TECHNICIAN_PATHS),
      customer: this.pickFirstText(sources, CUSTOMER_PATHS),
      updatedAt: this.normalizeText(this.pickFirstValue(sources, UPDATED_AT_PATHS)),
      payloadShape: this.isRecord(payload) ? Object.keys(payload).slice(0, 12) : null,
      rawPayload: this.summarizeValue(payload),
    };
    return JSON.stringify(summary);
  }

  toExternalRecord(record: AuvoRemoteRecord): AuvoMappedRecord {
    const sources = this.getSources(record);
    return {
      externalId: this.pickFirstIdentifier(sources, EXTERNAL_ID_PATHS),
      title: this.pickFirstText(sources, TITLE_PATHS),
      status: this.normalizeStatus(this.pickFirstValue(sources, STATUS_PATHS)),
      scheduledStart: this.parseDate(this.pickFirstValue(sources, START_PATHS)),
      scheduledEnd: this.parseDate(this.pickFirstValue(sources, END_PATHS)),
      technicianName: this.pickFirstText(sources, TECHNICIAN_PATHS),
      customerName: this.pickFirstText(sources, CUSTOMER_PATHS),
      customerPhone: this.pickFirstText(sources, CUSTOMER_PHONE_PATHS),
      customerEmail: this.pickFirstText(sources, CUSTOMER_EMAIL_PATHS),
      customerDocument: this.pickFirstText(sources, CUSTOMER_DOCUMENT_PATHS),
      externalCustomerId: this.pickFirstIdentifier(sources, EXTERNAL_CUSTOMER_ID_PATHS),
      externalDebtId: this.pickFirstIdentifier(sources, EXTERNAL_DEBT_ID_PATHS),
      debtAmount: this.parseNumber(this.pickFirstValue(sources, DEBT_AMOUNT_PATHS)),
      debtDueDate: this.parseDate(this.pickFirstValue(sources, DEBT_DUE_DATE_PATHS)),
      debtStatus: this.normalizeStatus(this.pickFirstValue(sources, DEBT_STATUS_PATHS)),
      sourceUpdatedAt: this.parseDate(this.pickFirstValue(sources, UPDATED_AT_PATHS)),
      rawPayloadSummaryJson: this.buildRawPayloadSummary(record),
    };
  }

  toCustomerProjection(record: AuvoRemoteRecord) {
    const sources = this.getSources(record);
    return {
      externalCustomerId:
        this.pickFirstIdentifier(sources, EXTERNAL_CUSTOMER_ID_PATHS) ||
        this.pickFirstIdentifier(sources, EXTERNAL_ID_PATHS),
      name: this.pickFirstText(sources, [...CUSTOMER_PATHS, ...TITLE_PATHS]),
      phone: this.pickFirstText(sources, CUSTOMER_PHONE_PATHS),
      email: this.pickFirstText(sources, CUSTOMER_EMAIL_PATHS),
      document: this.pickFirstText(sources, CUSTOMER_DOCUMENT_PATHS),
      notes: this.pickFirstText(sources, ['notes', 'observation', 'description']),
      sourceUpdatedAt: this.parseDate(this.pickFirstValue(sources, UPDATED_AT_PATHS)),
    };
  }
}