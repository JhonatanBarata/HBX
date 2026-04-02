import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCadastroClienteDto,
  CreateCustomerProfileDto,
  CreateFornecedorDto,
  CreatePaisDto,
  CreatePortoDto,
  UpdateCadastroClienteDto,
  UpdateCustomerProfileDto,
  UpsertTransitTimeDto,
} from './dto/cadastros.dto';
import { CustomerProfileService } from '../customer-profile/customer-profile.service';

@Injectable()
export class CadastrosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerProfileService: CustomerProfileService,
  ) {}

  private ensureCompanyIdFromUser(user: any): number {
    const companyId = Number(user?.companyId);
    if (!companyId) throw new ForbiddenException('Empresa nao identificada');
    return companyId;
  }

  private cleanName(input: string) {
    return String(input || '').trim();
  }

  normalizeCustomerPhone(raw: string): string {
    return String(raw || '').replace(/\D/g, '').slice(-13);
  }

  private buildCustomerRecord(row: any, recoveryData?: any, profileData?: any, sharedProfile?: any) {
    return {
      id: String(row.id),
      companyId: Number(row.companyId),
      customerProfileId: row.customerProfileId ? String(row.customerProfileId) : profileData?.id ?? null,
      name: row.name ? String(row.name) : null,
      phone: String(row.phone),
      phoneNormalized: String(row.phoneNormalized),
      email: profileData?.email ?? null,
      document: profileData?.document ?? null,
      externalSource: profileData?.externalSource ?? null,
      externalCustomerId: profileData?.externalCustomerId ?? null,
      customerProfileStatus: profileData?.status ?? null,
      sourceConnectionId: profileData?.sourceConnectionId ?? null,
      registrationOrigin: String(row.registrationOrigin || 'whatsapp_bot'),
      registrationStatus: String(row.registrationStatus || 'pending_confirmation'),
      route: String(row.route || 'atendimento'),
      notes: row.notes ? String(row.notes) : null,
      lastMessageAt: row.lastMessageAt ? new Date(row.lastMessageAt).toISOString() : null,
      conversationId: row.conversationId ? Number(row.conversationId) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      recoveryCustomerId: recoveryData?.id ?? null,
      openAmount: recoveryData?.openAmount ?? null,
      recoveryStatus: recoveryData?.status ?? null,
      recoveryRiskScore:
        recoveryData?.paymentHistoryScore === undefined ||
        recoveryData?.paymentHistoryScore === null
          ? null
          : Number(recoveryData.paymentHistoryScore),
      recoveryTotalPaid: Number(recoveryData?.totalPaid || 0),
      recoveryAutomationEnabled:
        recoveryData?.automationEnabled === undefined || recoveryData?.automationEnabled === null
          ? null
          : Boolean(recoveryData.automationEnabled),
      sharedProfile: sharedProfile || null,
    };
  }

  private async ensureCustomerProfile(input: {
    companyId: number;
    phone?: string | null;
    name?: string | null;
    notes?: string | null;
    externalSource?: string | null;
    status?: string | null;
  }) {
    const phoneNormalized = this.customerProfileService.normalizePhone(input.phone);
    if (!phoneNormalized && !this.cleanName(input.name || '')) return null;

    return this.customerProfileService.upsertProfile({
      companyId: input.companyId,
      phone: input.phone || null,
      name: input.name || null,
      notes: input.notes || null,
      externalSource: input.externalSource || null,
      status: input.status || 'active',
    });
  }

  private async loadProfileMap(companyId: number, rows: any[]) {
    const profiles = await this.customerProfileService.findProfilesForRegistry(companyId, {
      profileIds: rows.map((row) => row.customerProfileId).filter(Boolean),
      phoneNormalizeds: rows.map((row) => row.phoneNormalized).filter(Boolean),
    });

    const byId = new Map<string, any>();
    const byPhone = new Map<string, any>();
    for (const profile of profiles) {
      if (profile.id) byId.set(String(profile.id), profile);
      if (profile.phoneNormalized && !byPhone.has(String(profile.phoneNormalized))) {
        byPhone.set(String(profile.phoneNormalized), profile);
      }
    }
    return { byId, byPhone };
  }

  private async loadSharedProfileMap(companyId: number, rows: any[]) {
    return this.customerProfileService.buildSharedContextRegistry(companyId, {
      profileIds: rows.map((row) => row.customerProfileId).filter(Boolean),
      phoneNormalizeds: rows.map((row) => row.phoneNormalized || row.phone).filter(Boolean),
    });
  }

  async listRawCustomerRegistry(companyId: number) {
    return this.prisma.atendimentoCustomer.findMany({
      where: { companyId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findCustomerRegistryRecordById(companyId: number, customerId: string) {
    const row = await this.prisma.atendimentoCustomer.findFirst({
      where: { id: customerId, companyId },
    });
    if (!row) throw new NotFoundException('Cliente nao encontrado.');
    return row;
  }

  async findCustomerRegistryByPhone(companyId: number, phone: string) {
    const phoneNorm = this.normalizeCustomerPhone(phone);
    if (!phoneNorm) return null;
    return this.prisma.atendimentoCustomer.findUnique({
      where: { companyId_phoneNormalized: { companyId, phoneNormalized: phoneNorm } },
    });
  }

  async syncCustomerRegistryFromRecovery(companyId: number, recoveryRow: any) {
    const rawPhone = String(recoveryRow?.whatsappNumber || '').trim();
    const phoneNorm = this.normalizeCustomerPhone(rawPhone);
    if (!phoneNorm) return null;

    const fallbackName = this.cleanName(recoveryRow?.clientName || recoveryRow?.name || '');
    const profile = await this.ensureCustomerProfile({
      companyId,
      phone: rawPhone || phoneNorm,
      name: fallbackName || null,
      externalSource: 'recovery',
      status: 'active',
    });
    const existing = await this.prisma.atendimentoCustomer.findUnique({
      where: { companyId_phoneNormalized: { companyId, phoneNormalized: phoneNorm } },
    });
    const updatedAt = recoveryRow?.updatedAt instanceof Date ? recoveryRow.updatedAt : new Date();
    const createdAt = recoveryRow?.createdAt instanceof Date ? recoveryRow.createdAt : new Date();

    if (existing) {
      return this.prisma.atendimentoCustomer.update({
        where: { id: existing.id },
        data: {
          ...(fallbackName && !existing.name ? { name: fallbackName } : {}),
          ...(existing.phone ? {} : { phone: rawPhone || existing.phoneNormalized }),
          ...(profile?.id ? { customerProfileId: String(profile.id) } : {}),
          registrationOrigin: existing.registrationOrigin === 'manual' ? existing.registrationOrigin : 'recovery',
          registrationStatus: existing.registrationStatus === 'manual' ? existing.registrationStatus : 'confirmed',
          route: 'recovery',
          updatedAt,
        },
      });
    }

    return this.prisma.atendimentoCustomer.create({
      data: {
        companyId,
        customerProfileId: profile?.id ? String(profile.id) : null,
        phone: rawPhone || phoneNorm,
        phoneNormalized: phoneNorm,
        name: fallbackName || null,
        registrationOrigin: 'recovery',
        registrationStatus: 'confirmed',
        route: 'recovery',
        createdAt,
        updatedAt,
      },
    });
  }

  async upsertCustomerRegistry(input: {
    companyId: number;
    phone: string;
    customerProfileId?: string | null;
    name?: string | null;
    registrationOrigin?: string;
    registrationStatus?: string;
    route?: string;
    notes?: string | null;
    conversationId?: number | null;
    lastMessageAt?: Date | null;
  }) {
    const phoneNorm = this.normalizeCustomerPhone(input.phone);
    if (!phoneNorm || phoneNorm.length < 8) return null;

    const now = input.lastMessageAt ?? new Date();
    const profileId = String(input.customerProfileId || '').trim() || null;
    const profile = profileId
      ? { id: profileId }
      : await this.ensureCustomerProfile({
          companyId: input.companyId,
          phone: input.phone,
          name: input.name || null,
          notes: input.notes || null,
          externalSource: input.registrationOrigin || 'atendimento',
          status: 'active',
        });
    const existing = await this.prisma.atendimentoCustomer.findUnique({
      where: { companyId_phoneNormalized: { companyId: input.companyId, phoneNormalized: phoneNorm } },
    });

    if (existing) {
      const shouldUpdateName = !existing.name && !!input.name;
      return this.prisma.atendimentoCustomer.update({
        where: { id: existing.id },
        data: {
          ...(shouldUpdateName
            ? {
                name: input.name!,
                registrationStatus: input.registrationStatus || existing.registrationStatus,
              }
            : {}),
          ...(input.registrationStatus && input.registrationStatus !== 'pending_confirmation'
            ? { registrationStatus: input.registrationStatus }
            : {}),
          ...(input.route === 'recovery' ? { route: 'recovery' } : {}),
          ...(input.notes !== undefined ? { notes: input.notes ? String(input.notes).trim() || null : null } : {}),
          ...(input.conversationId ? { conversationId: input.conversationId } : {}),
          ...(existing.phone ? {} : { phone: input.phone }),
          ...(profile?.id ? { customerProfileId: String(profile.id) } : {}),
          lastMessageAt: now,
          updatedAt: now,
        },
      });
    }

    return this.prisma.atendimentoCustomer.create({
      data: {
        companyId: input.companyId,
        customerProfileId: profile?.id ? String(profile.id) : null,
        phone: input.phone,
        phoneNormalized: phoneNorm,
        name: input.name || null,
        registrationOrigin: input.registrationOrigin || 'whatsapp_bot',
        registrationStatus: input.registrationStatus || 'pending_confirmation',
        route: input.route || 'atendimento',
        notes: input.notes ? String(input.notes).trim() || null : null,
        conversationId: input.conversationId ?? null,
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  async listCustomerRegistry(companyId: number, phoneFilter?: string) {
    const where: any = { companyId };
    if (phoneFilter) {
      const digits = this.normalizeCustomerPhone(phoneFilter);
      if (digits) where.phoneNormalized = { endsWith: digits.slice(-9) };
    }

    const [registryRows, recoveryRows] = await Promise.all([
      this.prisma.atendimentoCustomer.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.hbxRecoveryCustomer.findMany({
        where: { companyId },
        select: {
          id: true,
          name: true,
          clientName: true,
          whatsappNumber: true,
          openAmount: true,
          status: true,
          paymentHistoryScore: true,
          totalPaid: true,
          automationEnabled: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const recoveryByPhone = new Map<string, any>();
    for (const recoveryRow of recoveryRows) {
      const norm = this.normalizeCustomerPhone(recoveryRow.whatsappNumber);
      if (norm) recoveryByPhone.set(norm, recoveryRow);
    }

    const registryPhones = new Set(registryRows.map((row) => String(row.phoneNormalized)));
    for (const recoveryRow of recoveryRows) {
      const norm = this.normalizeCustomerPhone(recoveryRow.whatsappNumber);
      if (!norm || registryPhones.has(norm)) continue;
      const synced = await this.syncCustomerRegistryFromRecovery(companyId, recoveryRow);
      if (synced) {
        registryRows.push(synced);
        registryPhones.add(norm);
      }
    }

    registryRows.sort((left: any, right: any) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
    const [profileMap, sharedMap] = await Promise.all([
      this.loadProfileMap(companyId, registryRows),
      this.loadSharedProfileMap(companyId, registryRows),
    ]);
    return registryRows.map((row) =>
      this.buildCustomerRecord(
        row,
        recoveryByPhone.get(row.phoneNormalized) ?? null,
        row.customerProfileId
          ? profileMap.byId.get(String(row.customerProfileId)) ?? null
          : profileMap.byPhone.get(String(row.phoneNormalized)) ?? null,
        row.customerProfileId
          ? sharedMap.byProfileId.get(String(row.customerProfileId)) ?? null
          : sharedMap.byPhoneNormalized.get(String(row.phoneNormalized)) ?? null,
      ),
    );
  }

  async createCustomerRegistry(companyId: number, dto: CreateCadastroClienteDto) {
    const phone = this.cleanName(dto.phone);
    const phoneNorm = this.normalizeCustomerPhone(phone);
    if (!phoneNorm || phoneNorm.length < 8) {
      throw new BadRequestException('Telefone invalido. Informe apenas os digitos incluindo DDI.');
    }

    const existing = await this.prisma.atendimentoCustomer.findUnique({
      where: { companyId_phoneNormalized: { companyId, phoneNormalized: phoneNorm } },
    });
    if (existing) {
      throw new BadRequestException(`Ja existe um cliente cadastrado com o telefone ${phone}.`);
    }

    const now = new Date();
    const profile = await this.ensureCustomerProfile({
      companyId,
      phone,
      name: dto.name ? this.cleanName(dto.name) || null : null,
      notes: dto.notes ? this.cleanName(dto.notes) || null : null,
      externalSource: 'manual',
      status: 'active',
    });
    const created = await this.prisma.atendimentoCustomer.create({
      data: {
        companyId,
        customerProfileId: profile?.id ? String(profile.id) : null,
        phone,
        phoneNormalized: phoneNorm,
        name: dto.name ? this.cleanName(dto.name) || null : null,
        registrationOrigin: 'manual',
        registrationStatus: 'manual',
        route: dto.route ? this.cleanName(dto.route) || 'atendimento' : 'atendimento',
        notes: dto.notes ? this.cleanName(dto.notes) || null : null,
        createdAt: now,
        updatedAt: now,
      },
    });
    const sharedMap = await this.customerProfileService.buildSharedContextRegistry(companyId, {
      profileIds: profile?.id ? [String(profile.id)] : [],
      phoneNormalizeds: [phoneNorm],
    });
    return this.buildCustomerRecord(
      created,
      null,
      profile,
      profile?.id
        ? sharedMap.byProfileId.get(String(profile.id)) ?? null
        : sharedMap.byPhoneNormalized.get(String(phoneNorm)) ?? null,
    );
  }

  async updateCustomerRegistry(companyId: number, customerId: string, dto: UpdateCadastroClienteDto) {
    const existing = await this.findCustomerRegistryRecordById(companyId, customerId);
    const profile = await this.customerProfileService.upsertProfile({
      companyId,
      phone: existing.phone,
      name: dto.name !== undefined ? (dto.name ? this.cleanName(dto.name) || null : null) : existing.name || null,
      notes: dto.notes !== undefined ? (dto.notes ? this.cleanName(dto.notes) || null : null) : existing.notes || null,
      externalSource: existing.registrationOrigin || 'atendimento',
      status: 'active',
    });
    const updated = await this.prisma.atendimentoCustomer.update({
      where: { id: existing.id },
      data: {
        ...(profile?.id ? { customerProfileId: String(profile.id) } : {}),
        ...(dto.name !== undefined ? { name: dto.name ? this.cleanName(dto.name) || null : null } : {}),
        ...(dto.route !== undefined ? { route: dto.route ? this.cleanName(dto.route) || 'atendimento' : 'atendimento' } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes ? this.cleanName(dto.notes) || null : null } : {}),
        ...(dto.registrationStatus !== undefined ? { registrationStatus: dto.registrationStatus } : {}),
        updatedAt: new Date(),
      },
    });

    const recoveryData = await this.prisma.hbxRecoveryCustomer.findFirst({
      where: { companyId, whatsappNumber: { endsWith: updated.phoneNormalized.slice(-9) } },
      select: {
        id: true,
        openAmount: true,
        status: true,
        paymentHistoryScore: true,
        totalPaid: true,
        automationEnabled: true,
      },
    });
    const sharedMap = await this.customerProfileService.buildSharedContextRegistry(companyId, {
      profileIds: [String(profile?.id || updated.customerProfileId || '')].filter(Boolean),
      phoneNormalizeds: [String(updated.phoneNormalized || updated.phone || '')].filter(Boolean),
    });
    return this.buildCustomerRecord(
      updated,
      recoveryData,
      profile,
      profile?.id
        ? sharedMap.byProfileId.get(String(profile.id)) ?? null
        : sharedMap.byPhoneNormalized.get(String(updated.phoneNormalized || '')) ?? null,
    );
  }

  async getCustomerRegistryByPhone(companyId: number, phone: string) {
    const phoneNorm = this.normalizeCustomerPhone(phone);
    if (!phoneNorm) throw new BadRequestException('Telefone invalido.');

    const row = await this.prisma.atendimentoCustomer.findUnique({
      where: { companyId_phoneNormalized: { companyId, phoneNormalized: phoneNorm } },
    });
    if (!row) throw new NotFoundException('Cliente nao encontrado.');

    const profile = row.customerProfileId
      ? await this.customerProfileService.findProfileByIdOrNull(companyId, row.customerProfileId)
      : await this.customerProfileService.findPreferredProfileByPhoneNormalized(companyId, phoneNorm);

    const recoveryData = await this.prisma.hbxRecoveryCustomer.findFirst({
      where: { companyId, whatsappNumber: { endsWith: phoneNorm.slice(-9) } },
      select: {
        id: true,
        openAmount: true,
        status: true,
        paymentHistoryScore: true,
        totalPaid: true,
        automationEnabled: true,
      },
    });
    const sharedMap = await this.customerProfileService.buildSharedContextRegistry(companyId, {
      profileIds: [String(profile?.id || row.customerProfileId || '')].filter(Boolean),
      phoneNormalizeds: [String(row.phoneNormalized || row.phone || '')].filter(Boolean),
    });
    return this.buildCustomerRecord(
      row,
      recoveryData,
      profile,
      profile?.id
        ? sharedMap.byProfileId.get(String(profile.id)) ?? null
        : sharedMap.byPhoneNormalized.get(String(row.phoneNormalized || '')) ?? null,
    );
  }

  async listCustomerRegistryByUser(user: any, phoneFilter?: string) {
    return this.listCustomerRegistry(this.ensureCompanyIdFromUser(user), phoneFilter);
  }

  async createCustomerRegistryByUser(user: any, dto: CreateCadastroClienteDto) {
    return this.createCustomerRegistry(this.ensureCompanyIdFromUser(user), dto);
  }

  async updateCustomerRegistryByUser(user: any, customerId: string, dto: UpdateCadastroClienteDto) {
    return this.updateCustomerRegistry(this.ensureCompanyIdFromUser(user), customerId, dto);
  }

  async listCustomerProfilesByUser(user: any, filters?: { phone?: string; document?: string }) {
    return this.customerProfileService.listProfiles(this.ensureCompanyIdFromUser(user), filters);
  }

  async createCustomerProfileByUser(user: any, dto: CreateCustomerProfileDto) {
    return this.customerProfileService.createProfile(this.ensureCompanyIdFromUser(user), dto);
  }

  async updateCustomerProfileByUser(user: any, profileId: string, dto: UpdateCustomerProfileDto) {
    return this.customerProfileService.updateProfile(this.ensureCompanyIdFromUser(user), profileId, dto);
  }

  async getCustomerProfileByPhone(user: any, phone: string) {
    return this.customerProfileService.getProfileByPhone(this.ensureCompanyIdFromUser(user), phone);
  }

  async getCustomerProfileByDocument(user: any, document: string) {
    return this.customerProfileService.getProfileByDocument(this.ensureCompanyIdFromUser(user), document);
  }

  async getOptions(user: any) {
    const companyId = this.ensureCompanyIdFromUser(user);
    const [fornecedores, paises, portos, transitTimes, customers] = await Promise.all([
      this.prisma.cadastroFornecedor.findMany({
        where: { empresaId: companyId },
        include: { pais: true, portoOrigem: true, portoDestino: true },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.cadastroPais.findMany({
        where: { empresaId: companyId },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.cadastroPorto.findMany({
        where: { empresaId: companyId },
        include: { pais: true },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.cadastroTransitTime.findMany({
        where: { empresaId: companyId },
        include: { portoOrigem: true, portoDestino: true },
        orderBy: [{ portoOrigemId: 'asc' }, { portoDestinoId: 'asc' }],
      }),
      this.listCustomerRegistry(companyId),
    ]);

    return { fornecedores, paises, portos, transitTimes, customers };
  }

  async createFornecedor(user: any, dto: CreateFornecedorDto) {
    const companyId = this.ensureCompanyIdFromUser(user);
    const nome = this.cleanName(dto?.nome);
    if (!nome) throw new BadRequestException('Nome do fornecedor e obrigatorio');

    let paisId: number | null = null;
    if (dto?.paisId !== undefined && dto?.paisId !== null) {
      const pais = await this.prisma.cadastroPais.findUnique({ where: { id: Number(dto.paisId) } });
      if (!pais || pais.empresaId !== companyId) throw new NotFoundException('Pais nao encontrado');
      paisId = pais.id;
    }

    let portoOrigemId: number | null = null;
    if (dto?.portoOrigemId !== undefined && dto?.portoOrigemId !== null) {
      const porto = await this.prisma.cadastroPorto.findUnique({ where: { id: Number(dto.portoOrigemId) } });
      if (!porto || porto.empresaId !== companyId) throw new NotFoundException('Porto de origem nao encontrado');
      portoOrigemId = porto.id;
    }

    let portoDestinoId: number | null = null;
    if (dto?.portoDestinoId !== undefined && dto?.portoDestinoId !== null) {
      const porto = await this.prisma.cadastroPorto.findUnique({ where: { id: Number(dto.portoDestinoId) } });
      if (!porto || porto.empresaId !== companyId) throw new NotFoundException('Porto de destino nao encontrado');
      portoDestinoId = porto.id;
    }

    if (portoOrigemId && portoDestinoId && portoOrigemId === portoDestinoId) {
      throw new BadRequestException('Porto de origem e destino devem ser diferentes');
    }

    return this.prisma.cadastroFornecedor.upsert({
      where: { empresaId_nome: { empresaId: companyId, nome } },
      update: { paisId, portoOrigemId, portoDestinoId },
      create: { empresaId: companyId, nome, paisId, portoOrigemId, portoDestinoId },
      include: { pais: true, portoOrigem: true, portoDestino: true },
    });
  }

  async createPais(user: any, dto: CreatePaisDto) {
    const companyId = this.ensureCompanyIdFromUser(user);
    const nome = this.cleanName(dto?.nome);
    if (!nome) throw new BadRequestException('Nome do pais e obrigatorio');
    return this.prisma.cadastroPais.upsert({
      where: { empresaId_nome: { empresaId: companyId, nome } },
      update: {},
      create: { empresaId: companyId, nome },
    });
  }

  async createPorto(user: any, dto: CreatePortoDto) {
    const companyId = this.ensureCompanyIdFromUser(user);
    const nome = this.cleanName(dto?.nome);
    if (!nome) throw new BadRequestException('Nome do porto e obrigatorio');

    let paisId: number | null = null;
    if (dto?.paisId !== undefined && dto?.paisId !== null) {
      const pais = await this.prisma.cadastroPais.findUnique({ where: { id: Number(dto.paisId) } });
      if (!pais || pais.empresaId !== companyId) throw new NotFoundException('Pais nao encontrado');
      paisId = pais.id;
    }

    return this.prisma.cadastroPorto.upsert({
      where: { empresaId_nome: { empresaId: companyId, nome } },
      update: { paisId },
      create: { empresaId: companyId, nome, paisId },
      include: { pais: true },
    });
  }

  async upsertTransitTime(user: any, dto: UpsertTransitTimeDto) {
    const companyId = this.ensureCompanyIdFromUser(user);
    const origem = await this.prisma.cadastroPorto.findUnique({ where: { id: Number(dto.portoOrigemId) } });
    const destino = await this.prisma.cadastroPorto.findUnique({ where: { id: Number(dto.portoDestinoId) } });
    if (!origem || origem.empresaId !== companyId) throw new NotFoundException('Porto de origem nao encontrado');
    if (!destino || destino.empresaId !== companyId) throw new NotFoundException('Porto de destino nao encontrado');
    if (origem.id === destino.id) throw new BadRequestException('Portos de origem e destino devem ser diferentes');

    const dias = Number(dto?.dias || 0);
    if (!Number.isFinite(dias) || dias <= 0) throw new BadRequestException('Dias de transit time invalido');

    return this.prisma.cadastroTransitTime.upsert({
      where: {
        empresaId_portoOrigemId_portoDestinoId: {
          empresaId: companyId,
          portoOrigemId: origem.id,
          portoDestinoId: destino.id,
        },
      },
      update: { dias },
      create: {
        empresaId: companyId,
        portoOrigemId: origem.id,
        portoDestinoId: destino.id,
        dias,
      },
      include: { portoOrigem: true, portoDestino: true },
    });
  }

  async resolveTransitTime(user: any, portoOrigemId: number, portoDestinoId: number) {
    const companyId = this.ensureCompanyIdFromUser(user);
    const row = await this.prisma.cadastroTransitTime.findUnique({
      where: {
        empresaId_portoOrigemId_portoDestinoId: {
          empresaId: companyId,
          portoOrigemId: Number(portoOrigemId),
          portoDestinoId: Number(portoDestinoId),
        },
      },
    });
    return row ? { dias: row.dias } : { dias: null };
  }
}
