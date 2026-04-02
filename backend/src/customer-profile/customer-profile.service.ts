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

type SharedProfilePresenceRecord = {
  present: boolean;
  customerId?: string | null;
  leadId?: string | null;
  status?: string | null;
  route?: string | null;
  updatedAt?: string | null;
  lastContactAt?: string | null;
  lastMessageAt?: string | null;
  openAmount?: number | null;
};

type SharedProfileContextRecord = {
  profileId: string | null;
  displayName: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  email: string | null;
  document: string | null;
  origin: string | null;
  lastContactAt: string | null;
  currentContext: 'vendas' | 'atendimento' | 'recovery' | 'neutro';
  presence: {
    vendas: SharedProfilePresenceRecord;
    atendimento: SharedProfilePresenceRecord;
    recovery: SharedProfilePresenceRecord;
  };
};

@Injectable()
export class CustomerProfileService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeSource(value: unknown) {
    return String(value || '').trim().toLowerCase() || null;
  }

  private normalizeStatus(value: unknown) {
    return String(value || '').trim().toLowerCase() || null;
  }

  private sourcePriority(value: unknown) {
    switch (this.normalizeSource(value)) {
      case 'manual':
        return 400;
      case 'recovery':
        return 350;
      case 'atendimento':
        return 300;
      case 'whatsapp_bot':
        return 100;
      default:
        return 200;
    }
  }

  private scoreNameQuality(value: unknown) {
    const normalized = this.normalizeText(value);
    if (!normalized) return 0;

    const compact = normalized
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const tokens = compact.split(/\s+/).filter(Boolean);
    const lettersOnly = compact.replace(/[^a-z]/g, '');

    if (!lettersOnly) return 0;
    if (/^(oi|ola|ol[áa]|teste|test|cliente|contato|user|usuario|unknown|semnome|sem nome|whatsapp)$/.test(compact)) {
      return 1;
    }

    let score = 1;
    if (lettersOnly.length >= 3) score += 1;
    if (lettersOnly.length >= 6) score += 1;
    if (tokens.length >= 2) score += 1;
    if (!/\d/.test(compact)) score += 1;
    return score;
  }

  private sanitizeNameForPolicy(name: string | null, source: string | null, status: string | null) {
    if (!name) return null;
    const sourcePriority = this.sourcePriority(source);
    const statusNormalized = this.normalizeStatus(status);
    const quality = this.scoreNameQuality(name);

    if (sourcePriority <= 100 && statusNormalized === 'provisional' && quality < 3) {
      return null;
    }

    return name;
  }

  private shouldReplaceName(existing: any, payload: any) {
    if (!payload.name) return false;
    if (!existing.name) return true;

    const existingName = this.normalizeText(existing.name);
    const incomingName = this.normalizeText(payload.name);
    if (!existingName || !incomingName) return Boolean(incomingName && !existingName);
    if (existingName.localeCompare(incomingName, 'pt-BR', { sensitivity: 'base' }) === 0) return false;

    const existingScore = this.scoreNameQuality(existingName);
    const incomingScore = this.scoreNameQuality(incomingName);
    const existingStatus = this.normalizeStatus(existing.status);
    const existingSourcePriority = this.sourcePriority(existing.externalSource);
    const incomingSourcePriority = this.sourcePriority(payload.externalSource);

    if (incomingScore <= existingScore) return false;
    if (existingStatus === 'provisional') return true;
    return incomingSourcePriority > existingSourcePriority;
  }

  private mergeStatus(existingStatus: unknown, incomingStatus: unknown) {
    const current = this.normalizeStatus(existingStatus);
    const next = this.normalizeStatus(incomingStatus);
    if (!next) return current;
    if (!current) return next;
    if (current === 'active') return current;
    if (current === 'provisional' && next === 'active') return next;
    return current;
  }

  private shouldReplaceExternalSource(existing: any, payload: any) {
    if (!payload.externalSource) return false;
    if (!existing.externalSource) return true;
    return this.sourcePriority(payload.externalSource) > this.sourcePriority(existing.externalSource);
  }

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

  private toIsoDate(value: unknown) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  private pickLatestIso(values: Array<unknown>) {
    let winner: string | null = null;
    for (const value of values) {
      const iso = this.toIsoDate(value);
      if (!iso) continue;
      if (!winner || new Date(iso).getTime() > new Date(winner).getTime()) {
        winner = iso;
      }
    }
    return winner;
  }

  private pickSharedOrigin(input: {
    profile?: any;
    vendas?: SharedProfilePresenceRecord;
    atendimento?: SharedProfilePresenceRecord;
    recovery?: SharedProfilePresenceRecord;
  }) {
    const profileOrigin = this.normalizeText(input.profile?.externalSource);
    if (profileOrigin) return profileOrigin;
    if (input.vendas?.present) return 'vendas';
    if (input.atendimento?.present) return this.normalizeText(input.atendimento.route) || 'atendimento';
    if (input.recovery?.present) return 'recovery';
    return null;
  }

  private pickSharedContext(input: {
    vendas: SharedProfilePresenceRecord;
    atendimento: SharedProfilePresenceRecord;
    recovery: SharedProfilePresenceRecord;
  }): SharedProfileContextRecord['currentContext'] {
    if (input.recovery.present && Number(input.recovery.openAmount || 0) > 0) return 'recovery';
    if (input.vendas.present && String(input.vendas.status || '').trim().toLowerCase() !== 'encerrado') return 'vendas';
    if (input.atendimento.present && String(input.atendimento.route || '').trim().toLowerCase() === 'recovery') return 'recovery';
    if (input.atendimento.present) return 'atendimento';
    if (input.vendas.present) return 'vendas';
    if (input.recovery.present) return 'recovery';
    return 'neutro';
  }

  async buildSharedContextRegistry(
    companyId: number,
    input: { profileIds?: string[]; phoneNormalizeds?: string[] },
  ) {
    const profileIds = (Array.isArray(input.profileIds) ? input.profileIds : [])
      .map((value) => this.normalizeText(value))
      .filter(Boolean) as string[];
    const phoneNormalizeds = (Array.isArray(input.phoneNormalizeds) ? input.phoneNormalizeds : [])
      .map((value) => this.normalizePhone(value))
      .filter(Boolean) as string[];

    const byProfileId = new Map<string, SharedProfileContextRecord>();
    const byPhoneNormalized = new Map<string, SharedProfileContextRecord>();
    if (!profileIds.length && !phoneNormalizeds.length) {
      return { byProfileId, byPhoneNormalized };
    }

    const profileRows = await this.prisma.customerProfile.findMany({
      where: {
        companyId,
        OR: [
          profileIds.length ? { id: { in: profileIds } } : undefined,
          phoneNormalizeds.length ? { phoneNormalized: { in: phoneNormalizeds } } : undefined,
        ].filter(Boolean) as any,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const allProfileIds = Array.from(
      new Set([
        ...profileIds,
        ...profileRows.map((row) => this.normalizeText(row.id)).filter(Boolean),
      ]),
    ) as string[];
    const allPhoneNormalizeds = Array.from(
      new Set([
        ...phoneNormalizeds,
        ...profileRows.map((row) => this.normalizePhone(row.phoneNormalized || row.phone)).filter(Boolean),
      ]),
    ) as string[];
    const recoveryPhoneSuffixes = allPhoneNormalizeds.map((value) => String(value).slice(-9)).filter(Boolean);

    const [vendasRows, atendimentoRows, recoveryRows] = await Promise.all([
      allProfileIds.length || allPhoneNormalizeds.length
        ? this.prisma.vendasLead.findMany({
            where: {
              companyId,
              OR: [
                allProfileIds.length ? { customerProfileId: { in: allProfileIds } } : undefined,
                allPhoneNormalizeds.length ? { phoneNormalized: { in: allPhoneNormalizeds } } : undefined,
              ].filter(Boolean) as any,
            },
            select: {
              id: true,
              customerProfileId: true,
              phoneNormalized: true,
              primarySource: true,
              sourceType: true,
              status: true,
              lastContactAt: true,
              updatedAt: true,
            },
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          })
        : [],
      allProfileIds.length || allPhoneNormalizeds.length
        ? this.prisma.atendimentoCustomer.findMany({
            where: {
              companyId,
              OR: [
                allProfileIds.length ? { customerProfileId: { in: allProfileIds } } : undefined,
                allPhoneNormalizeds.length ? { phoneNormalized: { in: allPhoneNormalizeds } } : undefined,
              ].filter(Boolean) as any,
            },
            select: {
              id: true,
              customerProfileId: true,
              phoneNormalized: true,
              registrationOrigin: true,
              route: true,
              lastMessageAt: true,
              updatedAt: true,
            },
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          })
        : [],
      allProfileIds.length || recoveryPhoneSuffixes.length
        ? this.prisma.hbxRecoveryCustomer.findMany({
            where: {
              companyId,
              OR: [
                allProfileIds.length ? { customerProfileId: { in: allProfileIds } } : undefined,
                recoveryPhoneSuffixes.length
                  ? {
                      OR: recoveryPhoneSuffixes.map((suffix) => ({
                        whatsappNumber: { endsWith: suffix },
                      })),
                    }
                  : undefined,
              ].filter(Boolean) as any,
            },
            select: {
              id: true,
              customerProfileId: true,
              whatsappNumber: true,
              openAmount: true,
              status: true,
              updatedAt: true,
            },
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          })
        : [],
    ]);

    const profileKeyByPhone = new Map<string, string>();
    const entryMap = new Map<
      string,
      {
        profile: any | null;
        phoneNormalized: string | null;
        vendas: SharedProfilePresenceRecord;
        atendimento: SharedProfilePresenceRecord;
        recovery: SharedProfilePresenceRecord;
      }
    >();

    const ensureEntry = (key: string, seed?: { profile?: any | null; phoneNormalized?: string | null }) => {
      const existing = entryMap.get(key);
      if (existing) {
        if (!existing.profile && seed?.profile) existing.profile = seed.profile;
        if (!existing.phoneNormalized && seed?.phoneNormalized) existing.phoneNormalized = seed.phoneNormalized;
        return existing;
      }
      const created = {
        profile: seed?.profile || null,
        phoneNormalized: seed?.phoneNormalized || null,
        vendas: { present: false } as SharedProfilePresenceRecord,
        atendimento: { present: false } as SharedProfilePresenceRecord,
        recovery: { present: false } as SharedProfilePresenceRecord,
      };
      entryMap.set(key, created);
      return created;
    };

    for (const row of profileRows) {
      const profileId = this.normalizeText(row.id) as string;
      const phoneNormalized = this.normalizePhone(row.phoneNormalized || row.phone);
      const key = `profile:${profileId}`;
      ensureEntry(key, { profile: row, phoneNormalized });
      if (phoneNormalized) profileKeyByPhone.set(phoneNormalized, key);
    }

    for (const phoneNormalized of allPhoneNormalizeds) {
      if (!profileKeyByPhone.has(phoneNormalized)) {
        ensureEntry(`phone:${phoneNormalized}`, { phoneNormalized });
      }
    }

    const resolveEntryKey = (profileIdRaw?: unknown, phoneRaw?: unknown) => {
      const profileId = this.normalizeText(profileIdRaw);
      if (profileId) return `profile:${profileId}`;
      const phoneNormalized = this.normalizePhone(phoneRaw);
      if (phoneNormalized && profileKeyByPhone.has(phoneNormalized)) {
        return profileKeyByPhone.get(phoneNormalized) as string;
      }
      return phoneNormalized ? `phone:${phoneNormalized}` : null;
    };

    for (const row of vendasRows) {
      const key = resolveEntryKey(row.customerProfileId, row.phoneNormalized);
      if (!key) continue;
      const entry = ensureEntry(key, { phoneNormalized: this.normalizePhone(row.phoneNormalized) });
      if (
        !entry.vendas.present ||
        new Date(this.toIsoDate(row.updatedAt) || 0).getTime() >
          new Date(entry.vendas.updatedAt || 0).getTime()
      ) {
        entry.vendas = {
          present: true,
          leadId: String(row.id),
          status: this.normalizeText(row.status),
          updatedAt: this.toIsoDate(row.updatedAt),
          lastContactAt: this.pickLatestIso([row.lastContactAt, row.updatedAt]),
        };
      }
      if (!entry.profile && this.normalizePhone(row.phoneNormalized)) {
        entry.phoneNormalized = this.normalizePhone(row.phoneNormalized);
      }
    }

    for (const row of atendimentoRows) {
      const key = resolveEntryKey(row.customerProfileId, row.phoneNormalized);
      if (!key) continue;
      const entry = ensureEntry(key, { phoneNormalized: this.normalizePhone(row.phoneNormalized) });
      if (
        !entry.atendimento.present ||
        new Date(this.toIsoDate(row.updatedAt) || 0).getTime() >
          new Date(entry.atendimento.updatedAt || 0).getTime()
      ) {
        entry.atendimento = {
          present: true,
          customerId: String(row.id),
          route: this.normalizeText(row.route),
          updatedAt: this.toIsoDate(row.updatedAt),
          lastMessageAt: this.pickLatestIso([row.lastMessageAt, row.updatedAt]),
          lastContactAt: this.pickLatestIso([row.lastMessageAt, row.updatedAt]),
          status: this.normalizeText(row.registrationOrigin),
        };
      }
      if (!entry.profile && this.normalizePhone(row.phoneNormalized)) {
        entry.phoneNormalized = this.normalizePhone(row.phoneNormalized);
      }
    }

    for (const row of recoveryRows) {
      const normalizedPhone = this.normalizePhone(row.whatsappNumber);
      const key = resolveEntryKey(row.customerProfileId, normalizedPhone);
      if (!key) continue;
      const entry = ensureEntry(key, { phoneNormalized: normalizedPhone });
      if (
        !entry.recovery.present ||
        new Date(this.toIsoDate(row.updatedAt) || 0).getTime() >
          new Date(entry.recovery.updatedAt || 0).getTime()
      ) {
        entry.recovery = {
          present: true,
          customerId: String(row.id),
          status: this.normalizeText(row.status),
          updatedAt: this.toIsoDate(row.updatedAt),
          lastContactAt: this.toIsoDate(row.updatedAt),
          openAmount: Number(row.openAmount || 0),
        };
      }
      if (!entry.profile && normalizedPhone) {
        entry.phoneNormalized = normalizedPhone;
      }
    }

    for (const entry of entryMap.values()) {
      const phoneNormalized =
        this.normalizePhone(entry.profile?.phoneNormalized || entry.profile?.phone) ||
        entry.phoneNormalized ||
        null;
      const sharedContext: SharedProfileContextRecord = {
        profileId: entry.profile?.id ? String(entry.profile.id) : null,
        displayName: this.normalizeText(entry.profile?.name) || null,
        phone: this.normalizeText(entry.profile?.phone) || null,
        phoneNormalized,
        email: this.normalizeEmail(entry.profile?.email) || null,
        document: this.normalizeDocument(entry.profile?.document) || null,
        origin: this.pickSharedOrigin({
          profile: entry.profile,
          vendas: entry.vendas,
          atendimento: entry.atendimento,
          recovery: entry.recovery,
        }),
        lastContactAt: this.pickLatestIso([
          entry.vendas.lastContactAt,
          entry.atendimento.lastContactAt,
          entry.recovery.lastContactAt,
          entry.profile?.updatedAt,
        ]),
        currentContext: this.pickSharedContext({
          vendas: entry.vendas,
          atendimento: entry.atendimento,
          recovery: entry.recovery,
        }),
        presence: {
          vendas: entry.vendas,
          atendimento: entry.atendimento,
          recovery: entry.recovery,
        },
      };

      if (sharedContext.profileId) {
        byProfileId.set(sharedContext.profileId, sharedContext);
      }
      if (sharedContext.phoneNormalized) {
        byPhoneNormalized.set(sharedContext.phoneNormalized, sharedContext);
      }
    }

    return { byProfileId, byPhoneNormalized };
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
      const mergedStatus = this.mergeStatus(existing.status, payload.status);
      const updateData = {
        ...(this.shouldReplaceName(existing, payload) ? { name: payload.name } : {}),
        ...(payload.phone && !existing.phone ? { phone: payload.phone } : {}),
        ...(payload.phoneNormalized && !existing.phoneNormalized ? { phoneNormalized: payload.phoneNormalized } : {}),
        ...(payload.email && !existing.email ? { email: payload.email } : {}),
        ...(payload.document && !existing.document ? { document: payload.document } : {}),
        ...(this.shouldReplaceExternalSource(existing, payload) ? { externalSource: payload.externalSource } : {}),
        ...(payload.externalCustomerId && !existing.externalCustomerId ? { externalCustomerId: payload.externalCustomerId } : {}),
        ...(payload.sourceConnectionId && !existing.sourceConnectionId ? { sourceConnectionId: payload.sourceConnectionId } : {}),
        ...(payload.notes !== null && payload.notes !== undefined ? { notes: payload.notes } : {}),
        ...(mergedStatus && mergedStatus !== this.normalizeStatus(existing.status) ? { status: mergedStatus } : {}),
      };

      if (!Object.keys(updateData).length) {
        return existing;
      }

      const row = await this.prisma.customerProfile.update({
        where: { id: existing.id },
        data: updateData,
      });
      return this.buildProfileRecord(row);
    }

    return this.createProfileConflictSafe(payload);
  }

  private normalizeProfilePayload(input: CustomerProfileInput, opts?: { allowEmpty?: boolean; partial?: boolean }) {
    const normalizedStatus = this.normalizeText(input.status) || 'active';
    const normalizedSource = this.normalizeText(input.externalSource);
    const normalizedName = this.sanitizeNameForPolicy(this.normalizeText(input.name), normalizedSource, normalizedStatus);
    const payload = {
      companyId: Number(input.companyId),
      sourceConnectionId: this.normalizeText(input.sourceConnectionId),
      name: normalizedName,
      phone: this.normalizeText(input.phone),
      phoneNormalized: this.normalizePhone(input.phone),
      email: this.normalizeEmail(input.email),
      document: this.normalizeDocument(input.document),
      externalSource: normalizedSource,
      externalCustomerId: this.normalizeText(input.externalCustomerId),
      status: normalizedStatus,
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
