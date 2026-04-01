import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IntegrationProjectionService } from '../integration-projection.service';
import { IntegrationSecretsService } from '../integration-secrets.service';
import { parseIntegrationCredentialEnvelope } from '../integration-credentials.util';
import { TagPlusClient } from './tagplus.client';
import { TagPlusMapper } from './tagplus.mapper';
import { TagPlusConnectionCredentials, TagPlusSyncRequest } from './tagplus.types';

@Injectable()
export class TagPlusSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrationSecrets: IntegrationSecretsService,
    private readonly integrationProjection: IntegrationProjectionService,
    private readonly tagPlusClient: TagPlusClient,
    private readonly tagPlusMapper: TagPlusMapper,
  ) {}

  private async getConnection(companyId: number, connectionId: string) {
    const row = await this.prisma.integrationConnection.findFirst({
      where: {
        id: String(connectionId),
        companyId,
        provider: 'TAGPLUS',
      },
    });

    if (!row) {
      throw new NotFoundException('Conexao TagPlus nao encontrada.');
    }

    return row;
  }

  private buildCredentials(connection: any): TagPlusConnectionCredentials {
    const decrypted = this.integrationSecrets.decryptSecret(connection.secretCiphertext);
    const envelope = parseIntegrationCredentialEnvelope('TAGPLUS', decrypted);
    return {
      token: envelope?.credentials?.token || '',
      authMode: envelope?.config?.authMode || null,
      baseUrl: envelope?.config?.baseUrl || null,
      externalAccountId: envelope?.config?.externalAccountId || null,
    };
  }

  private buildListRecordsInput(request: TagPlusSyncRequest, connection: any) {
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

  async syncNow(request: TagPlusSyncRequest) {
    const connection = await this.getConnection(request.companyId, request.connectionId);
    const credentials = this.buildCredentials(connection);

    let runRecord: any;
    try {
      runRecord = await this.prisma.integrationSyncRun.create({
        data: {
          companyId: request.companyId,
          connectionId: connection.id,
          provider: 'TAGPLUS',
          type: request.triggerType || 'manual',
          triggerType: request.triggerType || 'manual',
          triggeredByUserId: request.triggeredByUserId || null,
          startedAt: new Date(),
          status: 'RUNNING',
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException('Ja existe sincronizacao TagPlus em andamento para esta conexao.');
      }
      throw error;
    }

    try {
      let importedCount = 0;
      let updatedCount = 0;
      let failedCount = 0;
      const errors: string[] = [];
      const domainSummary = {
        customerProfilesImported: 0,
        customerProfilesUpdated: 0,
        debtCasesImported: 0,
        debtCasesUpdated: 0,
      };
      const listInput = this.buildListRecordsInput(request, connection);
      const customersResult = await this.tagPlusClient.listCustomers(credentials, listInput);
      const customerProfilesByExternalId = new Map<string, string>();

      for (const rawCustomer of Array.isArray(customersResult.items) ? customersResult.items : []) {
        try {
          const mappedCustomer = this.tagPlusMapper.toCustomerProjection(rawCustomer);
          const hasIdentity = Boolean(
            mappedCustomer.externalCustomerId ||
              mappedCustomer.phone ||
              mappedCustomer.email ||
              mappedCustomer.document ||
              mappedCustomer.name,
          );
          if (!hasIdentity) continue;

          const customerProfile = await this.integrationProjection.upsertCustomerProfile({
            companyId: request.companyId,
            sourceConnectionId: connection.id,
            sourceProvider: 'TAGPLUS',
            externalCustomerId: mappedCustomer.externalCustomerId,
            name: mappedCustomer.name,
            phone: mappedCustomer.phone,
            email: mappedCustomer.email,
            document: mappedCustomer.document,
            status: 'active',
            notes: mappedCustomer.notes,
          });

          const externalCustomerId = String(mappedCustomer.externalCustomerId || '').trim();
          if (externalCustomerId) {
            customerProfilesByExternalId.set(externalCustomerId, String(customerProfile.row.id));
          }

          if (customerProfile.action === 'imported') {
            importedCount += 1;
            domainSummary.customerProfilesImported += 1;
          } else {
            updatedCount += 1;
            domainSummary.customerProfilesUpdated += 1;
          }
        } catch (error) {
          failedCount += 1;
          errors.push(error instanceof Error ? error.message : String(error || 'Erro desconhecido.'));
        }
      }

      const listResult = await this.tagPlusClient.listReceivables(credentials, listInput);
      const rawItems = Array.isArray(listResult.items) ? listResult.items : [];

      for (const rawRecord of rawItems) {
        try {
          const mapped = this.tagPlusMapper.toMappedRecord(rawRecord);
          const hasCustomerIdentity = Boolean(
            mapped.externalCustomerId ||
            mapped.customerPhone ||
            mapped.customerDocument ||
            mapped.customerEmail ||
            mapped.customerName
          );
          if (!hasCustomerIdentity) {
            continue;
          }

          const externalCustomerId = String(mapped.externalCustomerId || '').trim();
          let customerProfileId = externalCustomerId ? customerProfilesByExternalId.get(externalCustomerId) || null : null;

          if (!customerProfileId) {
            const customerProfile = await this.integrationProjection.upsertCustomerProfile({
              companyId: request.companyId,
              sourceConnectionId: connection.id,
              sourceProvider: 'TAGPLUS',
              externalCustomerId: mapped.externalCustomerId,
              name: mapped.customerName,
              phone: mapped.customerPhone,
              email: mapped.customerEmail,
              document: mapped.customerDocument,
              status: 'active',
              notes: mapped.notes,
            });

            customerProfileId = String(customerProfile.row.id);
            if (externalCustomerId) {
              customerProfilesByExternalId.set(externalCustomerId, customerProfileId);
            }

            if (customerProfile.action === 'imported') {
              importedCount += 1;
              domainSummary.customerProfilesImported += 1;
            } else {
              updatedCount += 1;
              domainSummary.customerProfilesUpdated += 1;
            }
          }

          const hasDebtIdentity = Boolean(mapped.externalDebtId || mapped.amount > 0 || mapped.dueDate);
          if (hasDebtIdentity && customerProfileId) {
            const debtCase = await this.integrationProjection.upsertDebtCase({
              companyId: request.companyId,
              sourceConnectionId: connection.id,
              sourceProvider: 'TAGPLUS',
              customerProfileId,
              externalDebtId: mapped.externalDebtId,
              amount: mapped.amount,
              dueDate: mapped.dueDate,
              paidAt: mapped.paidAt,
              status: mapped.status,
              rawPayloadJson: mapped.rawPayloadJson,
            });

            if (debtCase.action === 'imported') {
              importedCount += 1;
              domainSummary.debtCasesImported += 1;
            } else {
              updatedCount += 1;
              domainSummary.debtCasesUpdated += 1;
            }
          }
        } catch (error) {
          failedCount += 1;
          errors.push(error instanceof Error ? error.message : String(error || 'Erro desconhecido.'));
        }
      }

      const finishedAt = new Date();
      const status = failedCount > 0 ? (importedCount || updatedCount ? 'PARTIAL' : 'ERROR') : 'SUCCESS';

      await this.prisma.integrationSyncRun.update({
        where: { id: runRecord.id },
        data: {
          status,
          finishedAt,
          importedCount,
          updatedCount,
          failedCount,
          errorCount: failedCount,
          checkpoint: JSON.stringify({
            source: listResult.source || null,
            note: listResult.note || null,
            customersSource: customersResult.source || null,
            customersNote: customersResult.note || null,
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
          status: status === 'ERROR' ? 'ERROR' : 'CONNECTED',
          lastSyncAt: finishedAt,
          lastSuccessAt: status === 'ERROR' ? connection.lastSuccessAt : finishedAt,
          lastError: errors.length ? errors[0] : null,
        },
      });

      return {
        ok: status !== 'ERROR',
        importedCount,
        updatedCount,
        failedCount,
        source: listResult.source || null,
        note: listResult.note || null,
        domainSummary,
      };
    } catch (error) {
      await this.markRunFailed(runRecord.id, error);
      await this.prisma.integrationConnection.update({
        where: { id: connection.id },
        data: {
          status: 'ERROR',
          lastError: error instanceof Error ? error.message : String(error || 'Erro desconhecido.'),
        },
      });
      throw error;
    }
  }
}