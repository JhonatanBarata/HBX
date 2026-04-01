import { Injectable } from '@nestjs/common';
import { TagPlusMappedRecord, TagPlusRemoteRecord } from './tagplus.types';

function normalizeText(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeNumber(value: unknown) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value).replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDate(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

@Injectable()
export class TagPlusMapper {
  private pick(source: TagPlusRemoteRecord, keys: string[]) {
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }
    return null;
  }

  private normalizeStatus(value: unknown) {
    const normalized = normalizeText(value);
    if (!normalized) return 'open';
    const token = normalized
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    if (['paid', 'pago', 'quitado', 'recebido'].includes(token)) return 'paid';
    if (['cancelled', 'canceled', 'cancelado'].includes(token)) return 'cancelled';
    return 'open';
  }

  toMappedRecord(record: TagPlusRemoteRecord): TagPlusMappedRecord {
    return {
      externalCustomerId: normalizeText(this.pick(record, ['customerExternalId', 'customerId', 'clientId'])),
      customerName: normalizeText(this.pick(record, ['customerName', 'name', 'clientName'])),
      customerPhone: normalizeText(this.pick(record, ['customerPhone', 'phone', 'whatsapp'])),
      customerEmail: normalizeText(this.pick(record, ['customerEmail', 'email'])),
      customerDocument: normalizeText(this.pick(record, ['customerDocument', 'document', 'cpfCnpj'])),
      externalDebtId: normalizeText(this.pick(record, ['debtId', 'invoiceId', 'receivableId'])),
      amount: normalizeNumber(this.pick(record, ['openAmount', 'amount', 'value'])),
      dueDate: normalizeDate(this.pick(record, ['dueDate', 'expiresAt'])),
      paidAt: normalizeDate(this.pick(record, ['paidAt', 'paymentDate'])),
      status: this.normalizeStatus(this.pick(record, ['status', 'situation'])),
      notes: normalizeText(this.pick(record, ['notes', 'observation'])),
      rawPayloadJson: JSON.stringify(record.rawPayload || record),
    };
  }

  toCustomerProjection(record: TagPlusRemoteRecord) {
    return {
      externalCustomerId: normalizeText(this.pick(record, ['customerExternalId', 'customerId', 'clientId', 'id'])),
      name: normalizeText(this.pick(record, ['customerName', 'name', 'clientName', 'razaoSocial'])),
      phone: normalizeText(this.pick(record, ['customerPhone', 'phone', 'whatsapp', 'telefone'])),
      email: normalizeText(this.pick(record, ['customerEmail', 'email'])),
      document: normalizeText(this.pick(record, ['customerDocument', 'document', 'cpfCnpj'])),
      notes: normalizeText(this.pick(record, ['notes', 'observation'])),
      rawPayloadJson: JSON.stringify(record.rawPayload || record),
    };
  }
}