import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuvoIntegrationService } from './auvo/auvo.integration.service';
import { CreateIntegrationConnectionDto, UpdateIntegrationConnectionDto } from './dto/integration-connection.dto';
import { IntegrationSyncDto } from './dto/integration-sync.dto';
import {
  buildIntegrationCredentialEnvelope,
  buildIntegrationCredentialSummary,
  buildIntegrationConnectionConfigSummary,
  buildIntegrationSecretPreview,
  parseIntegrationCredentialEnvelope,
  resolvePrimaryIntegrationSecret,
  serializeIntegrationCredentialEnvelope,
} from './integration-credentials.util';
import { getIntegrationProviderModel, normalizeIntegrationProvider } from './integration-provider.types';
import { IntegrationSecretsService } from './integration-secrets.service';
import { TagPlusIntegrationService } from './tagplus/tagplus.integration.service';

@Injectable()
export class IntegrationConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrationSecrets: IntegrationSecretsService,
    private readonly auvoIntegrationService: AuvoIntegrationService,
    private readonly tagPlusIntegrationService: TagPlusIntegrationService,
  ) {}

  private requireCompanyId(user: any) {
    const companyId = Number(user?.companyId);
    if (!companyId) throw new ForbiddenException('Empresa nao identificada.');
    return companyId;
  }

  private normalizeCompanyId(companyIdRaw: unknown) {
    const companyId = Number(companyIdRaw);
    if (!companyId) throw new ForbiddenException('Empresa nao identificada.');
    return companyId;
  }

  private normalizeText(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private normalizeProvider(value: unknown) {
    return normalizeIntegrationProvider(value);
  }

  private normalizeInstanceName(value: unknown) {
    return this.normalizeText(value);
  }

  private parseStoredCredentials(row: any) {
    if (!row?.secretCiphertext) return null;
    try {
      const decrypted = this.integrationSecrets.decryptSecret(row.secretCiphertext);
      return parseIntegrationCredentialEnvelope(row.provider, decrypted);
    } catch {
      return null;
    }
  }

  private serializeSyncRun(row: any) {
    return {
      id: String(row.id),
      companyId: Number(row.companyId),
      connectionId: String(row.connectionId),
      provider: row.provider ? String(row.provider) : null,
      type: String(row.type || 'manual'),
      triggerType: row.triggerType ? String(row.triggerType) : null,
      triggeredByUserId: Number(row.triggeredByUserId || 0) || null,
      startedAt: row.startedAt ? new Date(row.startedAt).toISOString() : null,
      finishedAt: row.finishedAt ? new Date(row.finishedAt).toISOString() : null,
      status: String(row.status || 'SUCCESS'),
      importedCount: Number(row.importedCount || 0),
      updatedCount: Number(row.updatedCount || 0),
      failedCount: Number(row.failedCount || 0),
      skippedCount: Number(row.skippedCount || 0),
      errorCount: Number(row.errorCount || 0),
      errorSummary: row.errorSummary ? String(row.errorSummary) : null,
      checkpoint: row.checkpoint ? String(row.checkpoint) : null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt || null,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt || null,
    };
  }

  private serializeConnection(row: any) {
    const provider = this.normalizeProvider(row.provider) || 'AUVO';
    const credentials = this.parseStoredCredentials(row);
    return {
      id: String(row.id),
      companyId: Number(row.companyId),
      provider,
      providerModel: getIntegrationProviderModel(provider),
      instanceName: String(row.instanceName),
      status: String(row.status || 'DISCONNECTED'),
      lastTestedAt: row.lastTestedAt ? new Date(row.lastTestedAt).toISOString() : null,
      lastTestStatus: row.lastTestStatus ? String(row.lastTestStatus) : null,
      lastTestMessage: row.lastTestMessage ? String(row.lastTestMessage) : null,
      lastSyncAt: row.lastSyncAt ? new Date(row.lastSyncAt).toISOString() : null,
      lastSuccessAt: row.lastSuccessAt ? new Date(row.lastSuccessAt).toISOString() : null,
      lastError: row.lastError ? String(row.lastError) : null,
      isActive: Boolean(row.isActive),
      secretConfigured: Boolean(credentials?.credentials?.token),
      secretPreview: row.secretPreview ? String(row.secretPreview) : null,
      credentialSummary: buildIntegrationCredentialSummary(provider, credentials),
      connectionConfig: buildIntegrationConnectionConfigSummary(credentials),
      lastSyncRun: Array.isArray(row?.syncRuns) && row.syncRuns.length ? this.serializeSyncRun(row.syncRuns[0]) : null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt || null,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt || null,
    };
  }

  private async findConnectionByCompanyId(companyIdRaw: unknown, connectionId: string, includeLatestRun = false) {
    const companyId = this.normalizeCompanyId(companyIdRaw);
    const row = await this.prisma.integrationConnection.findFirst({
      where: { id: String(connectionId), companyId },
      ...(includeLatestRun
        ? {
            include: {
              syncRuns: {
                orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
                take: 1,
              },
            },
          }
        : {}),
    });
    if (!row) throw new NotFoundException('Conexao de integracao nao encontrada.');
    return row;
  }

  private async assertNoEquivalentActiveConnection(companyId: number, provider: string, instanceName: string, ignoreId?: string) {
    const candidates = await this.prisma.integrationConnection.findMany({
      where: {
        companyId,
        isActive: true,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: {
        id: true,
        provider: true,
        instanceName: true,
      },
    });

    const normalizedProvider = this.normalizeProvider(provider);
    const normalizedInstanceName = this.normalizeInstanceName(instanceName)?.toLowerCase();
    const duplicate = candidates.find(
      (row) =>
        this.normalizeProvider(row.provider) === normalizedProvider &&
        this.normalizeInstanceName(row.instanceName)?.toLowerCase() === normalizedInstanceName,
    );

    if (duplicate) {
      throw new BadRequestException('Ja existe uma conexao ativa equivalente para este provider e instanceName nesta empresa.');
    }
  }

  async listByUser(user: any, provider?: string) {
    const companyId = this.requireCompanyId(user);
    return this.listByCompanyId(companyId, provider);
  }

  async listByCompanyId(companyIdRaw: unknown, provider?: string) {
    const companyId = this.normalizeCompanyId(companyIdRaw);
    const normalizedProvider = this.normalizeProvider(provider);
    const rows = await this.prisma.integrationConnection.findMany({
      where: {
        companyId,
        ...(normalizedProvider ? { provider: normalizedProvider } : {}),
      },
      include: {
        syncRuns: {
          orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.serializeConnection(row));
  }

  async getByUser(user: any, connectionId: string) {
    const companyId = this.requireCompanyId(user);
    return this.getByCompanyId(companyId, connectionId);
  }

  async getByCompanyId(companyIdRaw: unknown, connectionId: string) {
    const row = await this.findConnectionByCompanyId(companyIdRaw, connectionId, true);
    return this.serializeConnection(row);
  }

  async createByUser(user: any, dto: CreateIntegrationConnectionDto) {
    const companyId = this.requireCompanyId(user);
    return this.createByCompanyId(companyId, dto);
  }

  async createByCompanyId(companyIdRaw: unknown, dto: CreateIntegrationConnectionDto) {
    const companyId = this.normalizeCompanyId(companyIdRaw);
    const provider = this.normalizeProvider(dto.provider);
    const instanceName = this.normalizeInstanceName(dto.instanceName);
    if (!provider || !instanceName) {
      throw new BadRequestException('Provider e instanceName sao obrigatorios.');
    }

    const isActive = dto.isActive !== false;
    if (isActive) {
      await this.assertNoEquivalentActiveConnection(companyId, provider, instanceName);
    }

    const credentialEnvelope = buildIntegrationCredentialEnvelope(provider, {
      token: dto.secret,
      appKey: dto.appKey,
      baseUrl: dto.baseUrl,
      authMode: dto.authMode,
      externalAccountId: dto.externalAccountId,
    });
    const row = await this.prisma.integrationConnection.create({
      data: {
        companyId,
        provider,
        instanceName,
        secretCiphertext: this.integrationSecrets.encryptSecret(serializeIntegrationCredentialEnvelope(credentialEnvelope)),
        secretPreview: buildIntegrationSecretPreview(provider, credentialEnvelope),
        status: 'DISCONNECTED',
        isActive,
      },
    });
    return this.getByCompanyId(companyId, row.id);
  }

  async updateByUser(user: any, connectionId: string, dto: UpdateIntegrationConnectionDto) {
    const companyId = this.requireCompanyId(user);
    return this.updateByCompanyId(companyId, connectionId, dto);
  }

  async updateByCompanyId(companyIdRaw: unknown, connectionId: string, dto: UpdateIntegrationConnectionDto) {
    const companyId = this.normalizeCompanyId(companyIdRaw);
    const existing = await this.findConnectionByCompanyId(companyId, connectionId);

    const provider = dto.provider !== undefined ? this.normalizeProvider(dto.provider) : this.normalizeProvider(existing.provider);
    const instanceName = dto.instanceName !== undefined ? this.normalizeInstanceName(dto.instanceName) : String(existing.instanceName);
    if (!provider || !instanceName) {
      throw new BadRequestException('Provider e instanceName sao obrigatorios.');
    }

    const isActive = dto.isActive !== undefined ? Boolean(dto.isActive) : Boolean(existing.isActive);
    if (isActive) {
      await this.assertNoEquivalentActiveConnection(companyId, provider, instanceName, existing.id);
    }

    const secretProvided = dto.secret !== undefined;
    const existingEnvelope = this.parseStoredCredentials(existing);
    const credentialEnvelope =
      secretProvided || dto.appKey !== undefined || dto.baseUrl !== undefined || dto.authMode !== undefined || dto.externalAccountId !== undefined
        ? buildIntegrationCredentialEnvelope(provider, {
            token: secretProvided ? dto.secret : existingEnvelope?.credentials?.token,
            appKey: dto.appKey !== undefined ? dto.appKey : existingEnvelope?.credentials?.appKey,
            baseUrl: dto.baseUrl !== undefined ? dto.baseUrl : existingEnvelope?.config?.baseUrl,
            authMode: dto.authMode !== undefined ? dto.authMode : existingEnvelope?.config?.authMode,
            externalAccountId:
              dto.externalAccountId !== undefined ? dto.externalAccountId : existingEnvelope?.config?.externalAccountId,
          })
        : null;
    const row = await this.prisma.integrationConnection.update({
      where: { id: existing.id },
      data: {
        provider,
        instanceName,
        isActive,
        ...(credentialEnvelope
          ? {
              secretCiphertext: this.integrationSecrets.encryptSecret(serializeIntegrationCredentialEnvelope(credentialEnvelope)),
              secretPreview: buildIntegrationSecretPreview(provider, credentialEnvelope),
              ...(secretProvided
                ? {
                    status: 'DISCONNECTED',
                    lastTestedAt: null,
                    lastTestStatus: null,
                    lastTestMessage: null,
                    lastSyncAt: null,
                    lastSuccessAt: null,
                    lastError: null,
                  }
                : {}),
            }
          : {}),
      },
    });
    return this.getByCompanyId(companyId, row.id);
  }

  async testByUser(user: any, connectionId: string) {
    const companyId = this.requireCompanyId(user);
    return this.testByCompanyId(companyId, connectionId);
  }

  async testByCompanyId(companyIdRaw: unknown, connectionId: string) {
    const companyId = this.normalizeCompanyId(companyIdRaw);
    const connection = await this.findConnectionByCompanyId(companyId, connectionId, true);
    const provider = this.normalizeProvider(connection.provider);

    if (provider === 'AUVO') {
      return this.auvoIntegrationService.testConnection(companyId, { integrationId: connection.id });
    }
    if (provider === 'TAGPLUS') {
      return this.tagPlusIntegrationService.testConnection(companyId, { integrationId: connection.id });
    }

    throw new BadRequestException('Provider nao suportado.');
  }

  async syncNowByUser(user: any, connectionId: string, input?: IntegrationSyncDto) {
    const companyId = this.requireCompanyId(user);
    return this.syncNowByCompanyId(companyId, connectionId, input || {});
  }

  async syncNowByCompanyId(companyIdRaw: unknown, connectionId: string, input?: IntegrationSyncDto) {
    const companyId = this.normalizeCompanyId(companyIdRaw);
    const connection = await this.findConnectionByCompanyId(companyId, connectionId, true);
    const provider = this.normalizeProvider(connection.provider);

    if (!connection.isActive) {
      throw new BadRequestException('Ative a conexao antes de sincronizar.');
    }

    const decrypted = connection.secretCiphertext ? this.integrationSecrets.decryptSecret(connection.secretCiphertext) : null;
    const primarySecret = resolvePrimaryIntegrationSecret(provider, decrypted);
    if (!primarySecret) {
      throw new BadRequestException('Credencial da integracao nao configurada.');
    }

    if (provider === 'AUVO') {
      return this.auvoIntegrationService.syncNow({
        companyId,
        connectionId: connection.id,
        triggeredByUserId: null,
        triggerType: 'manual',
        since: input?.since || null,
        windowDays: input?.windowDays || null,
      });
    }
    if (provider === 'TAGPLUS') {
      return this.tagPlusIntegrationService.syncNow({
        companyId,
        connectionId: connection.id,
        triggeredByUserId: null,
        triggerType: 'manual',
        since: input?.since || null,
        windowDays: input?.windowDays || null,
      });
    }

    throw new BadRequestException('Provider nao suportado.');
  }

  async resolveSecretByCompany(companyId: number, connectionId: string) {
    const row = await this.prisma.integrationConnection.findFirst({
      where: { id: String(connectionId), companyId },
      select: { provider: true, secretCiphertext: true },
    });
    if (!row?.secretCiphertext) return null;
    return resolvePrimaryIntegrationSecret(row.provider, this.integrationSecrets.decryptSecret(row.secretCiphertext));
  }
}