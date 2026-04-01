export type TagPlusConnectionCredentials = {
  token: string;
  authMode?: string | null;
  baseUrl?: string | null;
  externalAccountId?: string | null;
};

export type TagPlusRemoteRecord = {
  customerId?: string | number | null;
  customerExternalId?: string | number | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerDocument?: string | null;
  debtId?: string | number | null;
  invoiceId?: string | number | null;
  amount?: string | number | null;
  openAmount?: string | number | null;
  dueDate?: string | number | Date | null;
  paidAt?: string | number | Date | null;
  status?: string | null;
  notes?: string | null;
  rawPayload?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type TagPlusConnectionTestResult = {
  ok: boolean;
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  message: string;
};

export type TagPlusListRecordsInput = {
  updatedSince?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
};

export type TagPlusListRecordsResult = {
  items: TagPlusRemoteRecord[];
  source: 'scaffold' | 'normalized' | 'remote';
  note?: string | null;
};

export type TagPlusMappedRecord = {
  externalCustomerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  customerDocument: string | null;
  externalDebtId: string | null;
  amount: number;
  dueDate: Date | null;
  paidAt: Date | null;
  status: string | null;
  notes: string | null;
  rawPayloadJson: string | null;
};

export type TagPlusSyncRequest = {
  companyId: number;
  connectionId: string;
  triggeredByUserId?: number | null;
  triggerType?: 'manual' | 'automatic';
  since?: string | null;
  windowDays?: number | null;
};