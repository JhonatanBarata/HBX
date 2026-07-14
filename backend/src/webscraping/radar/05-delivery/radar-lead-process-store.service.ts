import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { RadarLeadProcessRun } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export const RADAR_LEAD_PROCESS_MODES = ['claim', 'search'] as const;

export type RadarLeadProcessMode = (typeof RADAR_LEAD_PROCESS_MODES)[number];

export const RADAR_LEAD_PROCESS_STATUSES = [
  'queued',
  'validating',
  'debit_pending',
  'credit_debited',
  'ownership_claimed',
  'rfb_hydrating',
  'base_revealed',
  'motor_enriching',
  'vendas_creating',
  'completed',
  'partial',
  'failed',
  'refunded',
] as const;

export type RadarLeadProcessStatus = (typeof RADAR_LEAD_PROCESS_STATUSES)[number];

export type RadarLeadProcessStageState =
  | 'pending'
  | 'active'
  | 'completed'
  | 'failed'
  | 'skipped';

export type RadarLeadProcessStageSnapshot = {
  key: RadarLeadProcessStatus;
  label: string;
  order: number;
  state: RadarLeadProcessStageState;
  startedAt: string | null;
  finishedAt: string | null;
  message: string | null;
};

export type RadarLeadProcessEventSnapshot = {
  id: string;
  sequence: number;
  type: string;
  statusFrom: RadarLeadProcessStatus;
  statusTo: RadarLeadProcessStatus;
  message: string | null;
  data: unknown;
  occurredAt: string;
};

export type RadarLeadProcessSnapshot = {
  id: string;
  companyId: number;
  userId: number;
  radarLeadId: string | null;
  mode: RadarLeadProcessMode;
  status: RadarLeadProcessStatus;
  idempotencyKey: string | null;
  stages: RadarLeadProcessStageSnapshot[];
  events: RadarLeadProcessEventSnapshot[];
  data: Record<string, unknown>;
  error: { code: string | null; message: string | null } | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type CreateRadarLeadProcessOperationInput = {
  companyId: number;
  userId: number;
  radarLeadId?: string | null;
  mode: RadarLeadProcessMode;
  idempotencyKey?: string | null;
  snapshot?: Record<string, unknown>;
};

export type UpdateRadarLeadProcessOperationInput = {
  companyId: number;
  operationId: string;
  status?: RadarLeadProcessStatus;
  eventType?: string;
  eventMessage?: string | null;
  eventData?: unknown;
  snapshotPatch?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
};

type StageDefinition = Pick<RadarLeadProcessStageSnapshot, 'key' | 'label'>;

const CLAIM_STAGES: readonly StageDefinition[] = [
  { key: 'queued', label: 'Preparando a puxada' },
  { key: 'validating', label: 'Validando o lead' },
  { key: 'debit_pending', label: 'Reservando o crédito' },
  { key: 'credit_debited', label: 'Crédito debitado' },
  { key: 'ownership_claimed', label: 'Lead reservado para sua empresa' },
  { key: 'rfb_hydrating', label: 'Conferindo a Receita Federal' },
  { key: 'base_revealed', label: 'Liberando os dados adquiridos' },
  { key: 'motor_enriching', label: 'Completando os contatos disponíveis' },
  { key: 'vendas_creating', label: 'Transferindo para Vendas' },
  { key: 'completed', label: 'Lead pronto em Vendas' },
];

const SEARCH_STAGES: readonly StageDefinition[] = [
  { key: 'queued', label: 'Preparando a busca' },
  { key: 'validating', label: 'Validando os filtros' },
  { key: 'rfb_hydrating', label: 'Consultando a Receita Federal' },
  { key: 'motor_enriching', label: 'Cruzando com o motor HBX' },
  { key: 'completed', label: 'Busca concluída' },
];

const TERMINAL_STATUSES = new Set<RadarLeadProcessStatus>([
  'completed',
  'partial',
  'failed',
  'refunded',
]);

const MAX_OPTIMISTIC_RETRIES = 5;

function isMode(value: unknown): value is RadarLeadProcessMode {
  return RADAR_LEAD_PROCESS_MODES.includes(value as RadarLeadProcessMode);
}

function isStatus(value: unknown): value is RadarLeadProcessStatus {
  return RADAR_LEAD_PROCESS_STATUSES.includes(value as RadarLeadProcessStatus);
}

function requiredPositiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestException(`${field} deve ser um inteiro positivo.`);
  }
  return parsed;
}

function requiredText(value: unknown, field: string): string {
  const normalized = String(value || '').trim();
  if (!normalized) throw new BadRequestException(`${field} é obrigatório.`);
  return normalized;
}

function optionalText(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function parseJsonArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function stringifyJson(value: unknown, field: string): string {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('undefined');
    return serialized;
  } catch {
    throw new BadRequestException(`${field} precisa ser JSON serializável.`);
  }
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function stageDefinitions(mode: RadarLeadProcessMode): readonly StageDefinition[] {
  return mode === 'claim' ? CLAIM_STAGES : SEARCH_STAGES;
}

export function buildRadarLeadProcessInitialStages(
  mode: RadarLeadProcessMode,
  occurredAt: string,
): RadarLeadProcessStageSnapshot[] {
  return stageDefinitions(mode).map((stage, order) => ({
    ...stage,
    order,
    state: order === 0 ? 'active' : 'pending',
    startedAt: order === 0 ? occurredAt : null,
    finishedAt: null,
    message: null,
  }));
}

export function advanceRadarLeadProcessStages(input: {
  mode: RadarLeadProcessMode;
  stages: RadarLeadProcessStageSnapshot[];
  status: RadarLeadProcessStatus;
  occurredAt: string;
  message?: string | null;
}): RadarLeadProcessStageSnapshot[] {
  const definitions = stageDefinitions(input.mode);
  const existing = new Map(input.stages.map((stage) => [stage.key, stage]));
  const stages = definitions.map((definition, order) => ({
    ...definition,
    order,
    state: 'pending' as RadarLeadProcessStageState,
    startedAt: null as string | null,
    finishedAt: null as string | null,
    message: null as string | null,
    ...(existing.get(definition.key) || {}),
  }));

  if (input.status === 'completed') {
    return stages.map((stage) => ({
      ...stage,
      state: 'completed',
      startedAt: stage.startedAt || input.occurredAt,
      finishedAt: stage.finishedAt || input.occurredAt,
      message: stage.key === 'completed' ? optionalText(input.message) : stage.message,
    }));
  }

  if (input.status === 'failed' || input.status === 'refunded') {
    let terminalApplied = false;
    return stages.map((stage) => {
      if (stage.state !== 'active' || terminalApplied) return stage;
      terminalApplied = true;
      return {
        ...stage,
        state: 'failed',
        finishedAt: input.occurredAt,
        message: optionalText(input.message),
      };
    });
  }

  if (input.status === 'partial') {
    return stages.map((stage) => stage.state === 'active'
      ? {
          ...stage,
          state: 'completed',
          finishedAt: input.occurredAt,
          message: optionalText(input.message),
        }
      : stage);
  }

  const targetIndex = stages.findIndex((stage) => stage.key === input.status);
  if (targetIndex < 0) return stages;

  return stages.map((stage, index) => {
    if (index < targetIndex) {
      return {
        ...stage,
        state: 'completed',
        startedAt: stage.startedAt || input.occurredAt,
        finishedAt: stage.finishedAt || input.occurredAt,
      };
    }
    if (index === targetIndex) {
      return {
        ...stage,
        state: 'active',
        startedAt: stage.startedAt || input.occurredAt,
        finishedAt: null,
        message: optionalText(input.message),
      };
    }
    return stage;
  });
}

function isUniqueConflict(error: unknown): boolean {
  return String((error as { code?: unknown } | null)?.code || '').toUpperCase() === 'P2002';
}

@Injectable()
export class RadarLeadProcessStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async createOperation(
    input: CreateRadarLeadProcessOperationInput,
  ): Promise<RadarLeadProcessSnapshot> {
    const companyId = requiredPositiveInteger(input.companyId, 'companyId');
    const userId = requiredPositiveInteger(input.userId, 'userId');
    if (!isMode(input.mode)) throw new BadRequestException('mode deve ser claim ou search.');

    const radarLeadId = optionalText(input.radarLeadId);
    if (input.mode === 'claim' && !radarLeadId) {
      throw new BadRequestException('radarLeadId é obrigatório para uma puxada de lead.');
    }
    const idempotencyKey = optionalText(input.idempotencyKey);
    if (idempotencyKey && idempotencyKey.length > 200) {
      throw new BadRequestException('idempotencyKey deve ter no máximo 200 caracteres.');
    }

    if (idempotencyKey) {
      const existing = await this.findByIdempotencyKey(companyId, idempotencyKey);
      if (existing) return this.assertIdempotentMatch(existing, { ...input, companyId, userId, radarLeadId });
    }

    const tenantUser = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
      select: { id: true },
    });
    if (!tenantUser) throw new NotFoundException('Usuário não pertence à empresa informada.');

    if (radarLeadId) {
      const lead = await this.prisma.radarLeadPool.findUnique({
        where: { id: radarLeadId },
        select: { id: true },
      });
      if (!lead) throw new NotFoundException('Lead do Radar não encontrado.');
    }

    const now = new Date();
    const occurredAt = now.toISOString();
    const stages = buildRadarLeadProcessInitialStages(input.mode, occurredAt);
    const events: RadarLeadProcessEventSnapshot[] = [{
      id: randomUUID(),
      sequence: 0,
      type: 'operation.created',
      statusFrom: 'queued',
      statusTo: 'queued',
      message: null,
      data: { mode: input.mode },
      occurredAt,
    }];

    try {
      const row = await this.prisma.radarLeadProcessRun.create({
        data: {
          companyId,
          userId,
          radarLeadId,
          mode: input.mode,
          status: 'queued',
          idempotencyKey,
          stagesJson: stringifyJson(stages, 'stages'),
          eventsJson: stringifyJson(events, 'events'),
          snapshotJson: stringifyJson(input.snapshot || {}, 'snapshot'),
        },
      });
      return this.mapSnapshot(row);
    } catch (error) {
      if (!idempotencyKey || !isUniqueConflict(error)) throw error;
      const winner = await this.findByIdempotencyKey(companyId, idempotencyKey);
      if (!winner) throw error;
      return this.assertIdempotentMatch(winner, { ...input, companyId, userId, radarLeadId });
    }
  }

  async getSnapshot(companyIdInput: number, operationIdInput: string): Promise<RadarLeadProcessSnapshot> {
    const companyId = requiredPositiveInteger(companyIdInput, 'companyId');
    const operationId = requiredText(operationIdInput, 'operationId');
    const row = await this.prisma.radarLeadProcessRun.findFirst({
      where: { id: operationId, companyId },
    });
    if (!row) throw new NotFoundException('Processamento do lead não encontrado.');
    return this.mapSnapshot(row);
  }

  async updateOperation(
    input: UpdateRadarLeadProcessOperationInput,
  ): Promise<RadarLeadProcessSnapshot> {
    const companyId = requiredPositiveInteger(input.companyId, 'companyId');
    const operationId = requiredText(input.operationId, 'operationId');
    const hasStatus = input.status !== undefined;
    if (hasStatus && !isStatus(input.status)) {
      throw new BadRequestException('status de processamento inválido.');
    }
    const eventType = optionalText(input.eventType) || (input.status ? `status.${input.status}` : null);
    if (!eventType && !input.snapshotPatch && input.errorCode === undefined && input.errorMessage === undefined) {
      throw new BadRequestException('Informe status, evento, erro ou snapshotPatch para atualizar.');
    }

    for (let attempt = 0; attempt < MAX_OPTIMISTIC_RETRIES; attempt += 1) {
      const row = await this.prisma.radarLeadProcessRun.findFirst({
        where: { id: operationId, companyId },
      });
      if (!row) throw new NotFoundException('Processamento do lead não encontrado.');

      const mode = isMode(row.mode) ? row.mode : null;
      const currentStatus = isStatus(row.status) ? row.status : null;
      if (!mode || !currentStatus) {
        throw new ConflictException('O processamento persistido possui mode ou status inválido.');
      }

      const nextStatus = input.status || currentStatus;
      const now = new Date();
      const occurredAt = now.toISOString();
      const currentStages = parseJsonArray<RadarLeadProcessStageSnapshot>(row.stagesJson);
      const stages = input.status
        ? advanceRadarLeadProcessStages({
            mode,
            stages: currentStages.length
              ? currentStages
              : buildRadarLeadProcessInitialStages(mode, iso(row.createdAt) || occurredAt),
            status: nextStatus,
            occurredAt,
            message: input.eventMessage ?? input.errorMessage,
          })
        : currentStages;

      const events = parseJsonArray<RadarLeadProcessEventSnapshot>(row.eventsJson);
      if (eventType) {
        events.push({
          id: randomUUID(),
          sequence: Number(row.version || 0) + 1,
          type: eventType,
          statusFrom: currentStatus,
          statusTo: nextStatus,
          message: optionalText(input.eventMessage ?? input.errorMessage),
          data: input.eventData ?? null,
          occurredAt,
        });
      }

      const currentSnapshot = parseJsonObject(row.snapshotJson);
      const snapshot = input.snapshotPatch
        ? { ...currentSnapshot, ...input.snapshotPatch }
        : currentSnapshot;
      const terminal = TERMINAL_STATUSES.has(nextStatus);
      const progressing = nextStatus !== 'queued';
      const data: Record<string, unknown> = {
        version: { increment: 1 },
      };

      if (input.status) {
        data.status = nextStatus;
        data.stagesJson = stringifyJson(stages, 'stages');
        data.startedAt = progressing ? row.startedAt || now : row.startedAt;
        data.finishedAt = terminal ? now : null;
        data.errorCode = nextStatus === 'failed' || nextStatus === 'partial' || nextStatus === 'refunded'
          ? optionalText(input.errorCode)
          : null;
        data.errorMessage = nextStatus === 'failed' || nextStatus === 'partial' || nextStatus === 'refunded'
          ? optionalText(input.errorMessage)
          : null;
      } else {
        if (input.errorCode !== undefined) data.errorCode = optionalText(input.errorCode);
        if (input.errorMessage !== undefined) data.errorMessage = optionalText(input.errorMessage);
      }
      if (eventType) data.eventsJson = stringifyJson(events, 'events');
      if (input.snapshotPatch) data.snapshotJson = stringifyJson(snapshot, 'snapshot');

      const updated = await this.prisma.radarLeadProcessRun.updateMany({
        where: { id: operationId, companyId, version: row.version },
        data,
      });
      if (updated.count === 1) return this.getSnapshot(companyId, operationId);
    }

    throw new ConflictException('O processamento recebeu muitas atualizações simultâneas. Tente novamente.');
  }

  transitionOperation(input: UpdateRadarLeadProcessOperationInput & { status: RadarLeadProcessStatus }) {
    return this.updateOperation(input);
  }

  appendEvent(input: Omit<UpdateRadarLeadProcessOperationInput, 'status'> & { eventType: string }) {
    return this.updateOperation(input);
  }

  private async findByIdempotencyKey(companyId: number, idempotencyKey: string) {
    return this.prisma.radarLeadProcessRun.findFirst({
      where: { companyId, idempotencyKey },
    });
  }

  private assertIdempotentMatch(
    row: RadarLeadProcessRun,
    input: CreateRadarLeadProcessOperationInput & {
      companyId: number;
      userId: number;
      radarLeadId: string | null;
    },
  ): RadarLeadProcessSnapshot {
    const sameRequest = row.mode === input.mode
      && row.userId === input.userId
      && (row.radarLeadId || null) === input.radarLeadId;
    if (!sameRequest) {
      throw new ConflictException('idempotencyKey já foi usada por outra operação nesta empresa.');
    }
    return this.mapSnapshot(row);
  }

  private mapSnapshot(row: RadarLeadProcessRun): RadarLeadProcessSnapshot {
    const mode = isMode(row.mode) ? row.mode : 'claim';
    const status = isStatus(row.status) ? row.status : 'failed';
    const errorCode = optionalText(row.errorCode);
    const errorMessage = optionalText(row.errorMessage);
    return {
      id: row.id,
      companyId: row.companyId,
      userId: row.userId,
      radarLeadId: row.radarLeadId || null,
      mode,
      status,
      idempotencyKey: row.idempotencyKey || null,
      stages: parseJsonArray<RadarLeadProcessStageSnapshot>(row.stagesJson),
      events: parseJsonArray<RadarLeadProcessEventSnapshot>(row.eventsJson),
      data: parseJsonObject(row.snapshotJson),
      error: errorCode || errorMessage ? { code: errorCode, message: errorMessage } : null,
      startedAt: iso(row.startedAt),
      finishedAt: iso(row.finishedAt),
      createdAt: iso(row.createdAt) || new Date(0).toISOString(),
      updatedAt: iso(row.updatedAt) || new Date(0).toISOString(),
      version: Number(row.version || 0),
    };
  }
}
