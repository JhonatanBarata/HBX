import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type CustomerProfileInput = {
  companyId: number;
  sourceConnectionId?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  document?: string | null;
  externalSource?: string | null;
  externalCustomerId?: string | null;
  status?: string | null;
  notes?: string | null;
};

@Injectable()
export class CustomerProfileService {
  constructor(private readonly prisma: PrismaService) {}

  private isUniqueConstraintError(error: unknown) {
    return Boolean(error) && typeof error === 'object' && (error as any).code === 'P2002';
  }

  private normalizeText(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  normalizePhone(raw: unknown) {
    const digits = String(raw || '').replace(/\D/g, '');
    return digits ? digits.slice(-13) : null;
  }

  normalizeDocument(raw: unknown) {
    const digits = String(raw || '').replace(/\D/g, '');
    return digits || null;
  }

  normalizeEmail(raw: unknown) {
    const text = this.normalizeText(raw);
    return text ? text.toLowerCase() : null;
  }

  private buildProfileRecord(row: any) {
    return {
      id: String(row.id),
      companyId: Number(row.companyId),
      sourceConnectionId: row.sourceConnectionId ? String(row.sourceConnectionId) : null,
      name: row.name ? String(row.name) : null,
      phone: row.phone ? String(row.phone) : null,
      phoneNormalized: row.phoneNormalized ? String(row.phoneNormalized) : null,
      email: row.email ? String(row.email) : null,
      document: row.document ? String(row.document) : null,
      externalSource: row.externalSource ? String(row.externalSource) : null,
      externalCustomerId: row.externalCustomerId ? String(row.externalCustomerId) : null,
      status: row.status ? String(row.status) : null,
      notes: row.notes ? String(row.notes) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async findPreferredProfileByFilters(input: {
    companyId: number;
    phoneNormalized?: string | null;
    document?: string | null;
    sourceConnectionId?: string | null;
    externalCustomerId?: string | null;
  }) {
    const where: any[] = [];

    if (input.sourceConnectionId && input.externalCustomerId) {
      where.push({
        sourceConnectionId: input.sourceConnectionId,
        externalCustomerId: input.externalCustomerId,
      });
    }

    if (input.phoneNormalized) {
      where.push({ phoneNormalized: input.phoneNormalized });
    }

    if (input.document) {
      where.push({ document: input.document });
    }

    if (!where.length) return null;

    return this.prisma.customerProfile.findFirst({
      where: {
        companyId: input.companyId,
        OR: where,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async createProfileConflictSafe(payload: any) {
    try {
      const row = await this.prisma.customerProfile.create({ data: payload });
      return this.buildProfileRecord(row);
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;

      const existing = await this.findPreferredProfileByFilters({
        companyId: Number(payload.companyId),
        phoneNormalized: payload.phoneNormalized,
        document: payload.document,
        sourceConnectionId: payload.sourceConnectionId,
        externalCustomerId: payload.externalCustomerId,
      });
      if (existing) return existing;
      throw error;
    }
  }

  async findProfileByIdOrNull(companyId: number, profileId: string | null | undefined) {
    const normalizedId = this.normalizeText(profileId);
    if (!normalizedId) return null;
    const row = await this.prisma.customerProfile.findFirst({
      where: { id: normalizedId, companyId },
    });
    return row ? this.buildProfileRecord(row) : null;
  }

  async findPreferredProfileByPhoneNormalized(companyId: number, phoneNormalized: string | null | undefined) {
    const normalized = this.normalizePhone(phoneNormalized);
    if (!normalized) return null;
    const row = await this.prisma.customerProfile.findFirst({
      where: { companyId, phoneNormalized: normalized },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return row ? this.buildProfileRecord(row) : null;
  }

  async findProfilesForRegistry(companyId: number, input: { profileIds?: string[]; phoneNormalizeds?: string[] }) {
    const profileIds = (Array.isArray(input.profileIds) ? input.profileIds : [])
      .map((value) => this.normalizeText(value))
      .filter(Boolean) as string[];
    const phoneNormalizeds = (Array.isArray(input.phoneNormalizeds) ? input.phoneNormalizeds : [])
      .map((value) => this.normalizePhone(value))
      .filter(Boolean) as string[];

    if (!profileIds.length && !phoneNormalizeds.length) return [];

    const rows = await this.prisma.customerProfile.findMany({
      where: {
        companyId,
        OR: [
          profileIds.length ? { id: { in: profileIds } } : undefined,
          phoneNormalizeds.length ? { phoneNormalized: { in: phoneNormalizeds } } : undefined,
        ].filter(Boolean) as any,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return rows.map((row) => this.buildProfileRecord(row));
  }

  async listProfiles(companyId: number, filters?: { phone?: string; document?: string }) {
    const phoneNormalized = this.normalizePhone(filters?.phone);
    const document = this.normalizeDocument(filters?.document);

    const where: any = { companyId };
    if (phoneNormalized) where.phoneNormalized = phoneNormalized;
    if (document) where.document = document;

    const rows = await this.prisma.customerProfile.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.buildProfileRecord(row));
  }

  async getProfileById(companyId: number, profileId: string) {
    const row = await this.prisma.customerProfile.findFirst({
      where: { id: String(profileId), companyId },
    });
    if (!row) throw new NotFoundException('Perfil do cliente nao encontrado.');
    return this.buildProfileRecord(row);
  }

  async getProfileByPhone(companyId: number, phone: string) {
    const phoneNormalized = this.normalizePhone(phone);
    if (!phoneNormalized) throw new BadRequestException('Telefone invalido.');
    const rows = await this.prisma.customerProfile.findMany({
      where: { companyId, phoneNormalized },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 2,
    });
    if (!rows.length) throw new NotFoundException('Perfil do cliente nao encontrado.');
    if (rows.length > 1) throw new BadRequestException('Mais de um perfil encontrado para este telefone.');
    return this.buildProfileRecord(rows[0]);
  }

  async getProfileByDocument(companyId: number, document: string) {
    const normalizedDocument = this.normalizeDocument(document);
    if (!normalizedDocument) throw new BadRequestException('Documento invalido.');
    const rows = await this.prisma.customerProfile.findMany({
      where: { companyId, document: normalizedDocument },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 2,
    });
    if (!rows.length) throw new NotFoundException('Perfil do cliente nao encontrado.');
    if (rows.length > 1) throw new BadRequestException('Mais de um perfil encontrado para este documento.');
    return this.buildProfileRecord(rows[0]);
  }

  async createProfile(companyId: number, input: Omit<CustomerProfileInput, 'companyId'>) {
    const payload = this.normalizeProfilePayload({ ...input, companyId }) as any;
    return this.createProfileConflictSafe(payload);
  }

  async updateProfile(companyId: number, profileId: string, input: Omit<CustomerProfileInput, 'companyId'>) {
    await this.getProfileById(companyId, profileId);
    const payload = this.normalizeProfilePayload({ ...input, companyId }, { partial: true }) as any;
    const row = await this.prisma.customerProfile.update({
      where: { id: String(profileId) },
      data: payload,
    });
    return this.buildProfileRecord(row);
  }

  async upsertProfile(input: CustomerProfileInput) {
    const payload = this.normalizeProfilePayload(input, { allowEmpty: true }) as any;
    const existing = await this.findPreferredProfileByFilters({
      companyId: Number(input.companyId),
      phoneNormalized: payload.phoneNormalized,
      document: payload.document,
      sourceConnectionId: payload.sourceConnectionId,
      externalCustomerId: payload.externalCustomerId,
    });

    if (existing) {
      const row = await this.prisma.customerProfile.update({
        where: { id: existing.id },
        data: {
          ...(payload.name && !existing.name ? { name: payload.name } : {}),
          ...(payload.phone && !existing.phone ? { phone: payload.phone } : {}),
          ...(payload.phoneNormalized && !existing.phoneNormalized ? { phoneNormalized: payload.phoneNormalized } : {}),
          ...(payload.email && !existing.email ? { email: payload.email } : {}),
          ...(payload.document && !existing.document ? { document: payload.document } : {}),
          ...(payload.externalSource && !existing.externalSource ? { externalSource: payload.externalSource } : {}),
          ...(payload.externalCustomerId && !existing.externalCustomerId ? { externalCustomerId: payload.externalCustomerId } : {}),
          ...(payload.sourceConnectionId && !existing.sourceConnectionId ? { sourceConnectionId: payload.sourceConnectionId } : {}),
          ...(payload.notes !== null && payload.notes !== undefined ? { notes: payload.notes } : {}),
          ...(payload.status ? { status: payload.status } : {}),
        },
      });
      return this.buildProfileRecord(row);
    }

    return this.createProfileConflictSafe(payload);
  }

  private normalizeProfilePayload(input: CustomerProfileInput, opts?: { allowEmpty?: boolean; partial?: boolean }) {
    const payload = {
      companyId: Number(input.companyId),
      sourceConnectionId: this.normalizeText(input.sourceConnectionId),
      name: this.normalizeText(input.name),
      phone: this.normalizeText(input.phone),
      phoneNormalized: this.normalizePhone(input.phone),
      email: this.normalizeEmail(input.email),
      document: this.normalizeDocument(input.document),
      externalSource: this.normalizeText(input.externalSource),
      externalCustomerId: this.normalizeText(input.externalCustomerId),
      status: this.normalizeText(input.status) || 'active',
      notes: this.normalizeText(input.notes),
    };

    if (!opts?.partial && !payload.companyId) {
      throw new BadRequestException('Empresa nao identificada para o perfil do cliente.');
    }

    const hasIdentity = Boolean(
      payload.name ||
      payload.phone ||
      payload.email ||
      payload.document ||
      payload.externalCustomerId,
    );
    if (!opts?.allowEmpty && !opts?.partial && !hasIdentity) {
      throw new BadRequestException('Informe pelo menos um identificador para criar o perfil do cliente.');
    }

    if (opts?.partial) {
      return {
        ...(input.sourceConnectionId !== undefined ? { sourceConnectionId: payload.sourceConnectionId } : {}),
        ...(input.name !== undefined ? { name: payload.name } : {}),
        ...(input.phone !== undefined
          ? {
              phone: payload.phone,
              phoneNormalized: payload.phoneNormalized,
            }
          : {}),
        ...(input.email !== undefined ? { email: payload.email } : {}),
        ...(input.document !== undefined ? { document: payload.document } : {}),
        ...(input.externalSource !== undefined ? { externalSource: payload.externalSource } : {}),
        ...(input.externalCustomerId !== undefined ? { externalCustomerId: payload.externalCustomerId } : {}),
        ...(input.status !== undefined ? { status: payload.status } : {}),
        ...(input.notes !== undefined ? { notes: payload.notes } : {}),
      };
    }

    return payload;
  }
}