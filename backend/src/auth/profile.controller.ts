import { BadRequestException, Body, Controller, Get, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { assertPasswordPolicy } from './password-policy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MasterContextService } from '../master-context/master-context.service';
import { ThemePreferencesService } from './theme-preferences.service';
import { resolveCompanyKind, isPlatformInfraCompany, isTenantCompany } from '../common/company-kind';
import { resolveCompanyAccessState } from '../modules/company-access-state';
import { parsePreferredSegments } from '../users/preferred-segments.util';
import { topSegment } from '../users/segment-affinity.util';

class ChangePasswordDto {
  @IsString()
  @IsOptional()
  currentPassword?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;
}

class UpdateDisplayNameDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export function sanitizeUser(user: any, masterContext?: any) {
  if (!user) return null;
  const role = String(user.role || '').trim().toUpperCase();
  const isReferralSeller = false;
  const userKind = user.isSystemMaster
    ? 'system_master'
    : role === 'ADMIN'
        ? 'admin'
        : role === 'USER'
          ? 'seller'
          : 'user';
  const trialEndsAt = user.company?.trialEndsAt instanceof Date ? user.company.trialEndsAt : null;
  const trialRemainingDays = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;
  const companyAccess = user.company ? resolveCompanyAccessState(user.company) : null;
  // Cobranca e assunto do contratante (PR-002 D.4): vendedor recebe apenas
  // accessReleased (liberado ou nao). Status de pagamento, graca, plano,
  // preco e datas de trial NAO saem do backend para role USER.
  // Régua única (PR13062026007 P3): "gerente pra baixo ninguém vê o vínculo
  // HBX×contratante" — só Dono e Master. Gerente = ADMIN com canViewBilling=false.
  const billingAudience = Boolean(user.isSystemMaster) || (role === 'ADMIN' && user.canViewBilling !== false);
  // Ramo-alvo da empresa (dono, 14/06/2026): segmento(s) que a empresa quer
  // prospectar. Lista vazia + dono (ADMIN dono, não gerente, não vendedor, não
  // master) ⇒ portão pergunta no primeiro login.
  const companyProspectingSegments = (() => {
    try {
      const parsed = JSON.parse(String(user.company?.prospectingSegmentsJson || '[]'));
      return Array.isArray(parsed) ? parsed.map((s: any) => String(s || '').trim()).filter(Boolean) : [];
    } catch {
      return [] as string[];
    }
  })();
  const ramoPending =
    role === 'ADMIN' &&
    !user.isSystemMaster &&
    user.canViewBilling !== false &&
    Boolean(user.company) &&
    companyProspectingSegments.length === 0;
  // Preferência do vendedor (self-service 14/06): leitor tolerante a object
  // {segments,cityRegion} e ao bare-array legado. Vira o default do "Puxar leads".
  const sellerPreferred = parsePreferredSegments((user as any).preferredSegmentsJson);
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    role: user.role,
    userKind,
    isSystemMaster: Boolean(user.isSystemMaster),
    // Régua única P3: front esconde "Plano e cobrança" quando false (Gerente).
    canViewBilling: billingAudience,
    mustChangePassword: Boolean(user.mustChangePassword),
    // Boas-vindas (primeiro acesso): true = ainda não viu/dispensou o tutorial.
    // O portão (AuthGate) mostra senha → RAMO → tutorial e repete a cada login até resolver.
    tutorialPending: !user.tutorialCompletedAt,
    // Ramo-alvo: só o dono define. true ⇒ portão pergunta antes do tutorial.
    ramoPending,
    sellerProfile: {
      isReferralSeller,
      isCommonSeller: role === 'USER' && !isReferralSeller && !user.isSystemMaster,
      isAdmin: role === 'ADMIN' && !user.isSystemMaster,
      canRecruitSellers: Boolean(user.canRegisterHbxSellers),
      // comissao de venda do proprio vendedor (a tela /leads mostra para o
      // vendedor; nao e cobranca/plano da empresa) — ordem do dono 13/06/2026.
      commissionPercent: Number(user.commissionPercent || 0) || 0,
      sellerReferralCommissionPercent: Number(user.sellerReferralCommissionPercent || 0) || 0,
      referredByUserId: user.referredByUserId ?? null,
      // Preferência de segmento do vendedor (14/06): vira o default do "Puxar leads".
      // O vendedor edita por self-service (PATCH /profile/preferred-segments).
      preferredSegments: sellerPreferred.segments,
      // Cidade/região preferida (opcional) — round-trip da mesma tela.
      preferredCityRegion: sellerPreferred.cityRegion,
      // Segmento mais tocado pela afinidade observada (17/06): default do "Puxar leads".
      topSegment: topSegment((user as any).segmentAffinityJson),
      // Sellers Brains (17/06): push mutado = true quando o vendedor clicou "Não exibir mais".
      brainPushMuted: Boolean((user as any).brainPushMutedAt),
    },
    createdAt: user.createdAt,
    company: user.company
      ? {
          id: user.company.id,
          name: user.company.name,
          slug: user.company.slug ?? null,
          companyKind: resolveCompanyKind(user.company),
          isTenant: isTenantCompany(user.company),
          isPlatformInfra: isPlatformInfraCompany(user.company),
          // Ramo-alvo da empresa (default do Radar/Leads). Lista vazia = não definido.
          prospectingSegments: companyProspectingSegments,
          accessReleased: companyAccess ? companyAccess.canUse : null,
          accessState: billingAudience && companyAccess ? companyAccess.state : null,
          accessStateLabel: billingAudience && companyAccess ? companyAccess.statusLabel : null,
          selectedPlanKey: billingAudience ? user.company.selectedPlanKey ?? null : null,
          contactPhone: user.company.contactPhone ?? null,
          trialStartsAt: billingAudience ? user.company.trialStartsAt ?? null : null,
          trialEndsAt: billingAudience ? user.company.trialEndsAt ?? null : null,
          trialRemainingDays: billingAudience ? trialRemainingDays : null,
          billingGraceStartedAt: billingAudience ? user.company.billingGraceStartedAt ?? null : null,
          billingGraceEndsAt: billingAudience ? user.company.billingGraceEndsAt ?? null : null,
          billingGraceReason: billingAudience ? user.company.billingGraceReason ?? null : null,
          billingGraceEmailStage: billingAudience ? user.company.billingGraceEmailStage ?? null : null,
          subscriptionCurrentPeriodStart: billingAudience ? user.company.subscriptionCurrentPeriodStart ?? null : null,
          subscriptionCurrentPeriodEnd: billingAudience ? user.company.subscriptionCurrentPeriodEnd ?? null : null,
          trialModuleSelection: user.company.trialModuleSelection ?? null,
          whatsappConnectionMode: user.company.whatsappConnectionMode ?? null,
          whatsappTemporaryStatus: user.company.whatsappTemporaryStatus ?? null,
          whatsappMigrationInterestAt: user.company.whatsappMigrationInterestAt ?? null,
        }
      : null,
    masterContext: masterContext || {
      active: false,
      mode: 'master_puro',
      sessionId: null,
      companyId: null,
      companyName: null,
      reason: null,
      startedAt: null,
      expiresAt: null,
    },
  };
}

@Controller('profile')
export class ProfileController {
  constructor(
    private readonly usersService: UsersService,
    private readonly masterContextService: MasterContextService,
    private readonly themePreferencesService: ThemePreferencesService,
  ) {}

  private async resolveMasterContext(req: any, user: any) {
    if (!user?.isSystemMaster) {
      return {
        active: false,
        mode: 'master_puro',
        sessionId: null,
        companyId: null,
        companyName: null,
        reason: null,
        startedAt: null,
        expiresAt: null,
      };
    }

    if (req?.user?.masterContext) {
      return req.user.masterContext;
    }

    return this.masterContextService.getCurrentContext(Number(user.id));
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async profile(@Req() req: any) {
    const user = await this.usersService.findById(req.user.id);
    const masterContext = await this.resolveMasterContext(req, user);
    const userWithRuntimeCompany: any = user;
    const runtimeUser = userWithRuntimeCompany && !userWithRuntimeCompany.company && req.user?.company
      ? { ...user, company: req.user.company }
      : user;
    return sanitizeUser(runtimeUser, masterContext);
  }

  @Get('current-user')
  @UseGuards(JwtAuthGuard)
  async currentUser(@Req() req: any) {
    const user = await this.usersService.findById(req.user.id);
    const masterContext = await this.resolveMasterContext(req, user);
    const userWithRuntimeCompany: any = user;
    const runtimeUser = userWithRuntimeCompany && !userWithRuntimeCompany.company && req.user?.company
      ? { ...user, company: req.user.company }
      : user;
    return sanitizeUser(runtimeUser, masterContext);
  }

  @Get('theme-preferences')
  @UseGuards(JwtAuthGuard)
  async getThemePreferences(@Req() req: any) {
    return this.themePreferencesService.getThemePreferencesForUser(Number(req.user?.id));
  }

  @Patch('theme-preferences')
  @UseGuards(JwtAuthGuard)
  async updateThemePreferences(
    @Req() req: any,
    @Body() body: { scope?: string; config?: any; reset?: boolean },
  ) {
    return this.themePreferencesService.updateThemePreferencesForUser(Number(req.user?.id), body || {});
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    const user = await this.usersService.findById(req.user.id);
    if (!user) throw new BadRequestException('Usuario invalido');

    const currentPassword = String(dto.currentPassword || '');
    const nextPassword = String(dto.newPassword || '');
    assertPasswordPolicy(nextPassword);

    if (!user.mustChangePassword) {
      if (!currentPassword) throw new BadRequestException('Informe a senha atual');
      const matches = await bcrypt.compare(currentPassword, user.password || '');
      if (!matches) throw new BadRequestException('Senha atual incorreta');
    }

    const hashed = await bcrypt.hash(nextPassword, 10);
    await this.usersService.setPassword(user.id, hashed);
    return { ok: true };
  }

  // Boas-vindas (primeiro acesso): "Começar a usar" OU "Não exibir mais" no portão
  // resolvem o tutorial. Sem corpo — só marca tutorialCompletedAt do próprio usuário.
  @Post('tutorial-done')
  @UseGuards(JwtAuthGuard)
  async markTutorialDone(@Req() req: any) {
    await this.usersService.markTutorialCompleted(Number(req.user?.id));
    return { ok: true };
  }

  // Ramo-alvo da empresa (primeiro acesso do dono, 14/06/2026): salva os segmentos
  // que a empresa quer prospectar. Só o DONO (ADMIN com cobrança, não master/gerente/
  // vendedor) define — vira filtro padrão do Radar/Leads.
  @Post('prospecting-segments')
  @UseGuards(JwtAuthGuard)
  async saveProspectingSegments(@Req() req: any, @Body() body: { segments?: string[] }) {
    const user = await this.usersService.findById(req.user.id);
    if (!user) throw new BadRequestException('Usuario invalido');
    const role = String(user.role || '').trim().toUpperCase();
    if (user.isSystemMaster || role !== 'ADMIN' || (user as any).canViewBilling === false) {
      throw new BadRequestException('Apenas o dono define o ramo da empresa.');
    }
    const companyId = Number((user as any).companyId || 0);
    if (!companyId) throw new BadRequestException('Empresa nao encontrada.');
    const segments = Array.isArray(body?.segments) ? body.segments : [];
    if (!segments.some((s) => String(s || '').trim())) {
      throw new BadRequestException('Escolha pelo menos um ramo.');
    }
    const saved = await this.usersService.saveCompanyProspectingSegments(companyId, segments);
    return { ok: true, prospectingSegments: saved };
  }

  // Preferência de segmento/região do PRÓPRIO vendedor (self-service 14/06):
  // grava em User.preferredSegmentsJson do usuário logado. Vira o default do
  // "Puxar leads". Lista vazia ⇒ limpa a preferência (cai no ramo da empresa).
  // Qualquer usuário autenticado edita a SUA preferência; o master não tem
  // contexto de vendedor próprio.
  @Patch('preferred-segments')
  @UseGuards(JwtAuthGuard)
  async savePreferredSegments(
    @Req() req: any,
    @Body() body: { segments?: string[]; cityRegion?: string | null },
  ) {
    const user = await this.usersService.findById(req.user.id);
    if (!user) throw new BadRequestException('Usuario invalido');
    if (user.isSystemMaster) {
      throw new BadRequestException('O master nao possui preferencia de vendedor.');
    }
    const segments = Array.isArray(body?.segments) ? body.segments : [];
    const saved = await this.usersService.saveUserPreferredSegments(
      Number(user.id),
      segments,
      body?.cityRegion ?? null,
    );
    return {
      ok: true,
      preferredSegments: saved.segments,
      preferredCityRegion: saved.cityRegion,
    };
  }

  @Patch('display-name')
  @UseGuards(JwtAuthGuard)
  async updateDisplayName(@Req() req: any, @Body() dto: UpdateDisplayNameDto) {
    const name = String(dto?.name || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2) throw new BadRequestException('Informe o Como deseja ser chamado?.');
    await this.usersService.updateById(Number(req.user.id), { name });
    const updated = await this.usersService.findById(Number(req.user.id));
    const masterContext = await this.resolveMasterContext(req, updated);
    const updatedWithRuntimeCompany: any = updated;
    const runtimeUser = updatedWithRuntimeCompany && !updatedWithRuntimeCompany.company && req.user?.company
      ? { ...updated, company: req.user.company }
      : updated;
    return sanitizeUser(runtimeUser, masterContext);
  }
}

// Vitrine de onboarding (PR17062026038): preview de leads reais com telefone mascarado.
// Serve pending_checkout — sem @ModuleAccess intencionalmente (é a isca pré-pagamento).
function normalizeForSearch(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function maskPhoneDigits(digits: string | null | undefined): string {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length < 10) return '(XX) XXXX-XXXX';
  const ddd = d.slice(0, 2);
  const local = d.slice(2);
  const last2 = local.slice(-2);
  if (local.length >= 9) return `(${ddd}) ${local[0]}XXXX-XX${last2}`;
  return `(${ddd}) XXXX-XX${last2}`;
}

const VITRINE_EXCLUDED = ['rejected', 'duplicate', 'opt_out', 'blocked', 'complaint', 'negative', 'discarded', 'hidden', 'no_whatsapp', 'invalid_whatsapp'];

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('segment-preview')
  @UseGuards(JwtAuthGuard)
  async segmentPreview(@Query('segment') segment: string) {
    try {
      const pool = (this.prisma as any).radarLeadPool;
      if (!pool?.findMany || !pool?.count) return { count: 0, sample: [] };
      const normalized = normalizeForSearch(segment);
      const keyword = normalized.split(/\s+/).find((w: string) => w.length > 2) || normalized.split(/\s+/)[0] || '';
      if (!keyword) return { count: 0, sample: [] };
      const where = {
        normalizedSegment: { contains: keyword },
        status: { notIn: VITRINE_EXCLUDED },
        phoneDigits: { not: null },
      };
      const [count, rows] = await Promise.all([
        pool.count({ where }),
        pool.findMany({
          where,
          select: { name: true, city: true, ddd: true, phoneDigits: true },
          take: 18,
          orderBy: { opportunityScore: 'desc' },
        }),
      ]);
      const sample = (rows as any[]).map((row) => ({
        name: String(row.name || '').trim(),
        city: String(row.city || '').trim(),
        ddd: String(row.ddd || String(row.phoneDigits || '').slice(0, 2)),
        phoneMasked: maskPhoneDigits(row.phoneDigits),
      }));
      return { count, sample };
    } catch {
      return { count: 0, sample: [] };
    }
  }
}
