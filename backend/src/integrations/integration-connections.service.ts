import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIntegrationConnectionDto, UpdateIntegrationConnectionDto } from './dto/integration-connection.dto';
import { IntegrationSecretsService } from './integration-secrets.service';

@Injectable()
export class IntegrationConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrationSecrets: IntegrationSecretsService,
  ) {}

  private requireCompanyId(user: any) {
    const companyId = Number(user?.companyId);
    if (!companyId) throw new ForbiddenException('Empresa nao identificada.');
    return companyId;
  }

  private normalizeText(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private normalizeProvider(value: unknown) {
    return (this.normalizeText(value) || '').toUpperCase() || null;
  }

  private normalizeInstanceName(value: unknown) {
    return this.normalizeText(value);
  }

  private serializeConnection(row: any) {
    return {
      id: String(row.id),
      companyId: Number(row.companyId),
      provider: String(row.provider),
      instanceName: String(row.instanceName),
      status: String(row.status || 'DISCONNECTED'),
      lastTestedAt: row.lastTestedAt ? new Date(row.lastTestedAt).toISOString() : null,
      lastSyncAt: row.lastSyncAt ? new Date(row.lastSyncAt).toISOString() : null,
      lastSuccessAt: row.lastSuccessAt ? new Date(row.lastSuccessAt).toISOString() : null,
      lastError: row.lastError ? String(row.lastError) : null,
      isActive: Boolean(row.isActive),
      secretConfigured: Boolean(row.secretCiphertext),
      secretPreview: row.secretPreview ? String(row.secretPreview) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
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
    const normalizedProvider = this.normalizeProvider(provider);
    const rows = await this.prisma.integrationConnection.findMany({
      where: {
        companyId,
        ...(normalizedProvider ? { provider: normalizedProvider } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.serializeConnection(row));
  }

  async getByUser(user: any, connectionId: string) {
    const companyId = this.requireCompanyId(user);
    const row = await this.prisma.integrationConnection.findFirst({
      where: { id: String(connectionId), companyId },
    });
    if (!row) throw new NotFoundException('Conexao de integracao nao encontrada.');
    return this.serializeConnection(row);
  }

  async createByUser(user: any, dto: CreateIntegrationConnectionDto) {
    const companyId = this.requireCompanyId(user);
    const provider = this.normalizeProvider(dto.provider);
    const instanceName = this.normalizeInstanceName(dto.instanceName);
    if (!provider || !instanceName) {
      throw new BadRequestException('Provider e instanceName sao obrigatorios.');
    }

    const isActive = dto.isActive !== false;
    if (isActive) {
      await this.assertNoEquivalentActiveConnection(companyId, provider, instanceName);
    }

    const secret = this.integrationSecrets.normalizeSecret(dto.secret);
    const row = await this.prisma.integrationConnection.create({
      data: {
        companyId,
        provider,
        instanceName,
        secretCiphertext: this.integrationSecrets.encryptSecret(secret),
        secretPreview: this.integrationSecrets.previewSecret(secret),
        status: 'DISCONNECTED',
        isActive,
      },
    });
    return this.serializeConnection(row);
  }

  async updateByUser(user: any, connectionId: string, dto: UpdateIntegrationConnectionDto) {
    const companyId = this.requireCompanyId(user);
    const existing = await this.prisma.integrationConnection.findFirst({
      where: { id: String(connectionId), companyId },
    });
    if (!existing) throw new NotFoundException('Conexao de integracao nao encontrada.');

    const provider = dto.provider !== undefined ? this.normalizeProvider(dto.provider) : String(existing.provider);
    const instanceName = dto.instanceName !== undefined ? this.normalizeInstanceName(dto.instanceName) : String(existing.instanceName);
    if (!provider || !instanceName) {
      throw new BadRequestException('Provider e instanceName sao obrigatorios.');
    }

    const isActive = dto.isActive !== undefined ? Boolean(dto.isActive) : Boolean(existing.isActive);
    if (isActive) {
      await this.assertNoEquivalentActiveConnection(companyId, provider, instanceName, existing.id);
    }

    const secretProvided = dto.secret !== undefined;
    const normalizedSecret = secretProvided ? this.integrationSecrets.normalizeSecret(dto.secret) : null;
    const row = await this.prisma.integrationConnection.update({
      where: { id: existing.id },
      data: {
        provider,
        instanceName,
        isActive,
        ...(secretProvided
          ? {
              secretCiphertext: this.integrationSecrets.encryptSecret(normalizedSecret),
              secretPreview: this.integrationSecrets.previewSecret(normalizedSecret),
              status: 'DISCONNECTED',
              lastTestedAt: null,
              lastSyncAt: null,
              lastSuccessAt: null,
              lastError: null,
            }
          : {}),
      },
    });
    return this.serializeConnection(row);
  }

  async resolveSecretByCompany(companyId: number, connectionId: string) {
    const row = await this.prisma.integrationConnection.findFirst({
      where: { id: String(connectionId), companyId },
      select: { secretCiphertext: true },
    });
    if (!row?.secretCiphertext) return null;
    return this.integrationSecrets.decryptSecret(row.secretCiphertext);
  }
}