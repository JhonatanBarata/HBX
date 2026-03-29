export type AuvoConnectionCredentials = {
  secret: string;
};

export type AuvoNamedReference = {
  id?: unknown;
  name?: unknown;
  title?: unknown;
  description?: unknown;
  label?: unknown;
  value?: unknown;
  [key: string]: unknown;
};

export type AuvoRemoteRecord = {
  externalId?: string | number | null;
  external_id?: string | number | null;
  id?: string | number | null;
  taskID?: string | number | null;
  taskId?: string | number | null;
  task_id?: string | number | null;
  title?: string | null;
  name?: string | null;
  description?: string | null;
  orientation?: string | null;
  taskDescription?: string | null;
  status?: string | null;
  taskStatus?: string | number | null;
  situation?: string | number | null;
  scheduledStart?: string | number | Date | Record<string, unknown> | null;
  scheduledEnd?: string | number | Date | Record<string, unknown> | null;
  startDate?: string | number | Date | Record<string, unknown> | null;
  endDate?: string | number | Date | Record<string, unknown> | null;
  taskDate?: string | number | Date | Record<string, unknown> | null;
  date?: string | number | Date | Record<string, unknown> | null;
  technician?: string | AuvoNamedReference | Record<string, unknown> | null;
  technicianName?: string | null;
  user?: string | AuvoNamedReference | Record<string, unknown> | null;
  userName?: string | null;
  userTo?: AuvoNamedReference | Record<string, unknown> | null;
  customer?: string | AuvoNamedReference | Record<string, unknown> | null;
  customerName?: string | null;
  customerDescription?: string | null;
  client?: string | AuvoNamedReference | Record<string, unknown> | null;
  clientName?: string | null;
  updatedAt?: string | number | Date | Record<string, unknown> | null;
  updated_at?: string | number | Date | Record<string, unknown> | null;
  lastUpdate?: string | number | Date | Record<string, unknown> | null;
  modifiedAt?: string | number | Date | Record<string, unknown> | null;
  rawPayload?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type AuvoConnectionTestResult = {
  ok: boolean;
  status: 'CONNECTED' | 'ERROR';
  message: string;
};

export type AuvoListRecordsInput = {
  updatedSince?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  limit?: number | null;
};

export type AuvoListRecordsResult = {
  items: AuvoRemoteRecord[];
  source: 'scaffold' | 'normalized';
  note?: string | null;
  rawShape?: string | null;
};

export type AuvoMappedRecord = {
  externalId: string | null;
  title: string | null;
  status: string | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  technicianName: string | null;
  customerName: string | null;
  sourceUpdatedAt: Date | null;
  rawPayloadSummaryJson: string | null;
};

export type AuvoSyncRequest = {
  companyId: number;
  connectionId: string;
  triggeredByUserId?: number | null;
  triggerType?: 'manual' | 'automatic';
  since?: string | null;
  windowDays?: number | null;
};