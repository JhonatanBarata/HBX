import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parseIntegrationCredentialEnvelope } from '../integration-credentials.util';
import { IntegrationProjectionService } from '../integration-projection.service';
import { IntegrationSecretsService } from '../integration-secrets.service';
import { AuvoClient } from './auvo.client';
import { AuvoMapper } from './auvo.mapper';
import { AuvoConnectionCredentials, AuvoListRecordsInput, AuvoMappedRecord, AuvoRemoteRecord, AuvoSyncRequest } from './auvo.types';

@Injectable()
export class AuvoSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrationSecrets: IntegrationSecretsService,
    private readonly integrationProjection: IntegrationProjectionService,
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
    const decrypted = this.integrationSecrets.decryptSecret(connection.secretCiphertext);
    const envelope = parseIntegrationCredentialEnvelope('AUVO', decrypted);
    return {
      token: envelope?.credentials?.token || '',
      appKey: envelope?.credentials?.appKey || null,
      authMode: envelope?.config?.authMode || null,
      baseUrl: envelope?.config?.baseUrl || null,
      externalAccountId: envelope?.config?.externalAccountId || null,
    };
  }

  private buildListRecordsInput(request: AuvoSyncRequest, connection: any) {
    const fallbackSince =
      request.windowDays && Number(request.windowDays) > 0
        ? new Date(Date.now() - Number(request.windowDays) * 24 * 60 * 60 * 1000).toISOString()
        : null;
    const since = String(request.since || connection.lastSyncAt?.toISOString?.() || fallbackSince || '').trim();
    const normalizedSince = since || null;

    return {
      updatedSince: normalizedSince,
      periodStart: normalizedSince,
      periodEnd: null,
      limit: null,
    };
  }

  private async syncDedicatedCustomers(
    request: AuvoSyncRequest,
    connection: any,
    credentials: AuvoConnectionCredentials,
    input: AuvoListRecordsInput,
    state: {
      failedCount: number;
      errors: string[];
      domainSummary: {
        customerProfilesImported: number;
        customerProfilesUpdated: number;
        debtCasesImported: number;
        debtCasesUpdated: number;
      };
      customerProfilesByExternalId: Map<string, string>;
    },
  ) {
    const customersResult = await this.auvoClient.listCustomers(credentials, input);

    for (const rawCustomer of customersResult.items || []) {
      try {
        const mapped = this.auvoMapper.toCustomerProjection(rawCustomer);
        const hasIdentity = Boolean(
          mapped.externalCustomerId || mapped.phone || mapped.email || mapped.document || mapped.name,
        );
        if (!hasIdentity) continue;

        const profile = await this.integrationProjection.upsertCustomerProfile({
          companyId: request.companyId,
          sourceConnectionId: connection.id,
          sourceProvider: 'AUVO',
          externalCustomerId: mapped.externalCustomerId,
          name: mapped.name,
          phone: mapped.phone,
          email: mapped.email,
          document: mapped.document,
          status: 'active',
          notes: mapped.notes,
        });

        const externalCustomerId = String(mapped.externalCustomerId || '').trim();
        if (externalCustomerId) {
          state.customerProfilesByExternalId.set(externalCustomerId, String(profile.row.id));
        }

        if (profile.action === 'imported') {
          state.domainSummary.customerProfilesImported += 1;
        } else {
          state.domainSummary.customerProfilesUpdated += 1;
        }
      } catch (error) {
        state.failedCount += 1;
        state.errors.push(error instanceof Error ? error.message : String(error || 'Erro desconhecido.'));
      }
    }

    return customersResult;
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
      let importedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      const errors: string[] = [];
      const domainSummary = {
        customerProfilesImported: 0,
        customerProfilesUpdated: 0,
        debtCasesImported: 0,
        debtCasesUpdated: 0,
      };
      const customerProfilesByExternalId = new Map<string, string>();
      const state = {
        failedCount,
        errors,
        domainSummary,
        customerProfilesByExternalId,
      };
      const customersResult = await this.syncDedicatedCustomers(request, connection, credentials, listInput, state);
      failedCount = state.failedCount;
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

      for (const rawRecord of rawItems) {
        try {
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

          const hasCustomerIdentity = Boolean(
            mapped.externalCustomerId ||
            mapped.customerPhone ||
            mapped.customerEmail ||
            mapped.customerDocument ||
            mapped.customerName
          );
          if (hasCustomerIdentity) {
            const externalCustomerId = String(mapped.externalCustomerId || externalId || '').trim();
            let customerProfileId = externalCustomerId ? customerProfilesByExternalId.get(externalCustomerId) || null : null;
            let customerProfileAction: string | null = null;

            if (!customerProfileId) {
              const customerProfile = await this.integrationProjection.upsertCustomerProfile({
                companyId: request.companyId,
                sourceConnectionId: connection.id,
                sourceProvider: 'AUVO',
                externalCustomerId: externalCustomerId || null,
                name: mapped.customerName,
                phone: mapped.customerPhone,
                email: mapped.customerEmail,
                document: mapped.customerDocument,
                status: 'active',
                notes: mapped.title,
              });
              customerProfileId = String(customerProfile.row.id);
              customerProfileAction = customerProfile.action;
              if (externalCustomerId) {
                customerProfilesByExternalId.set(externalCustomerId, customerProfileId);
              }
            }

            if (customerProfileAction === 'imported') {
              domainSummary.customerProfilesImported += 1;
            } else if (customerProfileAction === 'updated') {
              domainSummary.customerProfilesUpdated += 1;
            }

            const hasDebtIdentity = Boolean(mapped.externalDebtId || mapped.debtAmount || mapped.debtDueDate);
            if (hasDebtIdentity && customerProfileId) {
              const debtCase = await this.integrationProjection.upsertDebtCase({
                companyId: request.companyId,
                sourceConnectionId: connection.id,
                sourceProvider: 'AUVO',
                customerProfileId,
                externalDebtId: mapped.externalDebtId,
                amount: mapped.debtAmount,
                dueDate: mapped.debtDueDate,
                status: mapped.debtStatus || 'open',
                rawPayloadJson: JSON.stringify(rawRecord.rawPayload || rawRecord),
              });

              if (debtCase.action === 'imported') {
                domainSummary.debtCasesImported += 1;
              } else {
                domainSummary.debtCasesUpdated += 1;
              }
            }
          }
        } catch (error) {
          failedCount += 1;
          errors.push(error instanceof Error ? error.message : String(error || 'Erro desconhecido.'));
        }
      }

      const finishedAt = new Date();
      await this.prisma.integrationSyncRun.update({
        where: { id: runRecord.id },
        data: {
          status: failedCount > 0 ? (importedCount || updatedCount ? 'PARTIAL' : 'ERROR') : 'SUCCESS',
          finishedAt,
          importedCount,
          updatedCount,
          skippedCount,
          errorCount: failedCount,
          failedCount,
          checkpoint: JSON.stringify({
            source: listResult?.source || null,
            note: listResult?.note || null,
            customersSource: customersResult?.source || null,
            customersNote: customersResult?.note || null,
            domainSummary,
            incrementalSince: listInput.updatedSince,
          }),
          errorSummary: errors.length ? errors.slice(0, 3).join(' | ') : null,
          errorLog: errors.length ? JSON.stringify(errors) : null,
        },
      });

      await this.prisma.integrationConnection.update({
        where: { id: connection.id },
        data: {
          status: failedCount > 0 && !importedCount && !updatedCount ? 'ERROR' : 'CONNECTED',
          lastSyncAt: finishedAt,
          lastSuccessAt: finishedAt,
          lastError: errors.length ? errors[0] : null,
        },
      });

      return {
        ok: failedCount === 0 || Boolean(importedCount || updatedCount),
        importedCount,
        updatedCount,
        skippedCount,
        failedCount,
        errorCount: failedCount,
        source: listResult?.source || null,
        domainSummary,
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