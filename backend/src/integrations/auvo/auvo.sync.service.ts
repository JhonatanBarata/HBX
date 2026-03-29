import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationSecretsService } from '../integration-secrets.service';
import { AuvoClient } from './auvo.client';
import { AuvoMapper } from './auvo.mapper';
import { AuvoConnectionCredentials, AuvoMappedRecord, AuvoRemoteRecord, AuvoSyncRequest } from './auvo.types';

@Injectable()
export class AuvoSyncService {
  constructor(
    private readonly prisma: any,
    private readonly integrationSecrets: IntegrationSecretsService,
    private readonly auvoClient: AuvoClient,
    private readonly auvoMapper: AuvoMapper,
  ) {}

  private async getConnection(companyId: number, connectionId: string) {
    const row = await this.prisma.integrationConnection.findFirst({
      where: {
        id: String(connectionId),
        companyId,
        provider: 'AUVO',
      },
    });

    if (!row) {
      throw new NotFoundException('Conexao AUVO nao encontrada.');
    }

    return row;
  }

  private buildCredentials(connection: any): AuvoConnectionCredentials {
    const secret = this.integrationSecrets.decryptSecret(connection.secretCiphertext);
    return {
      secret: secret || '',
    };
  }

  private buildListRecordsInput(request: AuvoSyncRequest, connection: any) {
    const since = String(request.since || connection.lastSyncAt?.toISOString?.() || '').trim();
    const normalizedSince = since || null;

    return {
      updatedSince: normalizedSince,
      periodStart: normalizedSince,
      periodEnd: null,
      limit: null,
    };
  }

  private getExternalId(record: AuvoMappedRecord) {
    return String(record.externalId || '').trim();
  }

  private normalizeDate(value: unknown) {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value as any);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private isIncomingNewer(existing: any, mapped: AuvoMappedRecord) {
    const existingUpdatedAt = this.normalizeDate(existing?.sourceUpdatedAt);
    const incomingUpdatedAt = this.normalizeDate(mapped.sourceUpdatedAt);

    if (!existingUpdatedAt || !incomingUpdatedAt) {
      return true;
    }

    return incomingUpdatedAt.getTime() > existingUpdatedAt.getTime();
  }

  private buildUpsertPayload(companyId: number, connectionId: string, rawRecord: AuvoRemoteRecord, mapped: AuvoMappedRecord) {
    return {
      companyId,
      connectionId,
      externalId: this.getExternalId(mapped),
      title: mapped.title,
      status: mapped.status,
      scheduledStart: mapped.scheduledStart,
      scheduledEnd: mapped.scheduledEnd,
      technicianName: mapped.technicianName,
      customerName: mapped.customerName,
      sourceUpdatedAt: mapped.sourceUpdatedAt,
      rawPayloadSummaryJson: mapped.rawPayloadSummaryJson,
      rawPayloadJson: JSON.stringify(rawRecord.rawPayload || rawRecord),
    };
  }

  private async markRunFailed(runId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error || 'Erro desconhecido.');
    await this.prisma.integrationSyncRun.update({
      where: { id: runId },
      data: {
        status: 'ERROR',
        finishedAt: new Date(),
        errorLog: message,
        errorSummary: message,
        errorCount: 1,
        failedCount: 1,
      },
    });
  }

  async syncNow(request: AuvoSyncRequest) {
    const connection = await this.getConnection(request.companyId, request.connectionId);
    const credentials = this.buildCredentials(connection);
    const startedAt = new Date();

    let runRecord: any;
    try {
      runRecord = await this.prisma.integrationSyncRun.create({
        data: {
          companyId: request.companyId,
          connectionId: connection.id,
          provider: 'AUVO',
          type: request.triggerType || 'manual',
          triggerType: request.triggerType || 'manual',
          triggeredByUserId: request.triggeredByUserId || null,
          startedAt,
          status: 'RUNNING',
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException('Ja existe sincronizacao AUVO em andamento para esta conexao.');
      }
      throw error;
    }

    try {
      const listInput = this.buildListRecordsInput(request, connection);
      const listResult = await this.auvoClient.listRecords(credentials, listInput);
      const rawItems = Array.isArray(listResult?.items) ? listResult.items : [];
      const existingRows = await this.prisma.auvoExternalRecord.findMany({
        where: {
          companyId: request.companyId,
        },
      });

      const existingByExternalId = new Map<string, any>();
      for (const row of Array.isArray(existingRows) ? existingRows : []) {
        const externalId = String(row?.externalId || '').trim();
        if (externalId) {
          existingByExternalId.set(externalId, row);
        }
      }

      const seenExternalIds = new Set<string>();
      let importedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      for (const rawRecord of rawItems) {
        const mapped = this.auvoMapper.toExternalRecord(rawRecord);
        const externalId = this.getExternalId(mapped);
        if (!externalId) {
          skippedCount += 1;
          continue;
        }

        if (seenExternalIds.has(externalId)) {
          skippedCount += 1;
          continue;
        }
        seenExternalIds.add(externalId);

        const existing = existingByExternalId.get(externalId);
        if (existing && !this.isIncomingNewer(existing, mapped)) {
          skippedCount += 1;
          continue;
        }

        const payload = this.buildUpsertPayload(request.companyId, connection.id, rawRecord, mapped);
        await this.prisma.auvoExternalRecord.upsert({
          where: {
            companyId_externalId: {
              companyId: request.companyId,
              externalId,
            },
          },
          create: payload,
          update: payload,
        });

        if (existing) {
          updatedCount += 1;
        } else {
          importedCount += 1;
        }
      }

      const finishedAt = new Date();
      await this.prisma.integrationSyncRun.update({
        where: { id: runRecord.id },
        data: {
          status: 'SUCCESS',
          finishedAt,
          importedCount,
          updatedCount,
          skippedCount,
          errorCount: 0,
          failedCount: 0,
          checkpoint: JSON.stringify({
            source: listResult?.source || null,
            note: listResult?.note || null,
          }),
        },
      });

      await this.prisma.integrationConnection.update({
        where: { id: connection.id },
        data: {
          status: 'CONNECTED',
          lastSyncAt: finishedAt,
          lastSuccessAt: finishedAt,
          lastError: null,
        },
      });

      return {
        ok: true,
        importedCount,
        updatedCount,
        skippedCount,
        errorCount: 0,
        source: listResult?.source || null,
      };
    } catch (error) {
      await this.markRunFailed(runRecord.id, error);
      await this.prisma.integrationConnection.update({
        where: { id: connection.id },
        data: {
          lastError: error instanceof Error ? error.message : String(error || 'Erro desconhecido.'),
        },
      });
      throw error;
    }
  }

  async syncIncremental(request: AuvoSyncRequest) {
    const connection = await this.getConnection(request.companyId, request.connectionId);
    const since = connection.lastSyncAt ? new Date(connection.lastSyncAt).toISOString() : null;

    return this.syncNow({
      ...request,
      since,
      triggerType: request.triggerType || 'automatic',
    });
  }
}