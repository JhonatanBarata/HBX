import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parseIntegrationCredentialEnvelope } from '../integration-credentials.util';
import { IntegrationSecretsService } from '../integration-secrets.service';
import { TagPlusClient } from './tagplus.client';
import { TagPlusSyncService } from './tagplus.sync.service';
import { TagPlusSyncRequest } from './tagplus.types';

@Injectable()
export class TagPlusIntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrationSecrets: IntegrationSecretsService,
    private readonly tagPlusClient: TagPlusClient,
    private readonly tagPlusSyncService: TagPlusSyncService,
  ) {}

  private async getConnection(companyId: number, integrationId: string) {
    const row = await this.prisma.integrationConnection.findFirst({
      where: {
        id: String(integrationId),
        companyId,
        provider: 'TAGPLUS',
      },
    });

    if (!row) {
      throw new NotFoundException('Conexao TagPlus nao encontrada.');
    }

    return row;
  }

  async testConnection(companyId: number, input: { integrationId: string }) {
    const connection = await this.getConnection(companyId, input.integrationId);
    const decrypted = this.integrationSecrets.decryptSecret(connection.secretCiphertext);
    const envelope = parseIntegrationCredentialEnvelope('TAGPLUS', decrypted);
    const result = await this.tagPlusClient.testConnection({
      token: envelope?.credentials?.token || '',
      authMode: envelope?.config?.authMode || null,
      baseUrl: envelope?.config?.baseUrl || null,
      externalAccountId: envelope?.config?.externalAccountId || null,
    });
    const now = new Date();

    await this.prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        lastTestedAt: now,
        lastTestStatus: result.ok ? 'SUCCESS' : result.status,
        lastTestMessage: result.message,
        status: result.status,
        lastSuccessAt: result.ok ? now : connection.lastSuccessAt,
        lastError: result.ok ? null : result.message,
      },
    });

    return result;
  }

  async syncNow(request: TagPlusSyncRequest) {
    return this.tagPlusSyncService.syncNow(request);
  }
}