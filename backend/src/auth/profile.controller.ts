import { BadRequestException, Body, Controller, Delete, Get, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
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
import { resolveActorKind, isBillingOwnerActor } from '../access/actor-kind';

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
  // RBAC Sprint 3: papel hierárquico derivado 1× da fonte única.
  const actorKind = resolveActorKind(user);
  const isReferralSeller = false;
  // USERMASTER (dono do tenant) e SUPERSET de ADMIN — trata igual a ADMIN em
  // todo lugar que concede privilegio. Sem isto o dono caia em userKind 'user'
  // (orfao) e herdava comportamento de vendedor no front inteiro (/auth/me).
  const isTenantAdminRole = role === 'ADMIN' || role === 'USERMASTER';
  const userKind = user.isSystemMaster
    ? 'system_master'
    : isTenantAdminRole
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
  // RBAC Sprint 3: master OU ADMIN-dono via fonte única (isBillingOwnerActor = master|dono).
  const billingAudience = isBillingOwnerActor(user);
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
    actorKind === 'dono' &&
    Boolean(user.company) &&
    // Só DEPOIS de ter acesso (cartão/pago/trial). Sem isto a tela de ramo
    // aparecia antes do cartão (pending_checkout) — o certo é pagar primeiro,
    // aí o gate de pagamento (bloqueio-gate) é quem assume.
    Boolean(companyAccess?.canUse) &&
    companyProspectingSegments.length === 0;
  // Onboarding do ADMIN/dono (Camada 4, 28/06): no 1º login o dono escolhe
  // "sozinho ou com time?" — a escolha ramifica o checklist. Pendente = mesmo
  // gating do dono (ADMIN dono, com acesso) E ainda SEM carimbo admin_mode:*.
  // Vem DEPOIS do ramo (o portão resolve senha → ramo → modo → tutorial). Só
  // leitura; a escolha é gravada em /onboarding/event { admin_mode:solo|team }.
  const adminModeChosen = (() => {
    try {
      const parsed = JSON.parse(String(user.onboardingStateJson || '{}'));
      const ev = parsed && typeof parsed === 'object' ? parsed.events : null;
      return Boolean(ev && (ev['admin_mode:solo'] || ev['admin_mode:team']));
    } catch {
      return false;
    }
  })();
  const adminOnboardingPending =
    actorKind === 'dono' &&
    Boolean(user.company) &&
    Boolean(companyAccess?.canUse) &&
    !adminModeChosen;
  // Preferência do vendedor (self-service 14/06): leitor tolerante a object
  // {segments,cityRegion} e ao bare-array legado. Vira o default do "Puxar leads".
  const sellerPreferred = parsePreferredSegments((user as any).preferredSegmentsJson);
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl ?? null,
    role: user.role,
    userKind,
    isSystemMaster: Boolean(user.isSystemMaster),
    // Régua única P3: front esconde "Plano e cobrança" quando false (Gerente).
    canViewBilling: billingAudience,
    mustChangePassword: Boolean(user.mustChangePassword),
    // Boas-vindas (primeiro acesso): true = ainda não viu/dispensou o tutorial.
    // O portão (AuthGate) mostra senha → RAMO → tutorial e repete a cada login até resolver.
    // Gateado por acesso: tutorial/onboarding é DEPOIS de pagar (igual ao ramo) — sem
    // cartão, o gate de pagamento assume a tela, não o onboarding.
    tutorialPending: !user.tutorialCompletedAt && Boolean(companyAccess?.canUse),
    // Ramo-alvo: só o dono define. true ⇒ portão pergunta antes do tutorial.
    ramoPending,
    // Onboarding do dono (Camada 4): true ⇒ portão pergunta "solo ou time?" antes
    // do tutorial (depois do ramo). Só o dono (não gerente/master/vendedor).
    adminOnboardingPending,
    sellerProfile: {
      isReferralSeller,
      isCommonSeller: actorKind === 'vendedor' && !isReferralSeller,
      // RBAC Sprint 3: ADMIN não-master = dono OU gerente (fonte única).
      isAdmin: actorKind === 'dono' || actorKind === 'gerente',
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
    private readonly prisma: PrismaService,
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
    const isTenantAdminRole = role === 'ADMIN' || role === 'USERMASTER';
    if (user.isSystemMaster || !isTenantAdminRole || (user as any).canViewBilling === false) {
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

  // Avatar do usuário: armazenado como data URL (base64) na coluna avatarUrl do User.
  // Limite de ~500KB (700000 chars) e apenas imagens PNG/JPEG/WEBP são aceitas.
  @Patch('avatar')
  @UseGuards(JwtAuthGuard)
  async updateAvatar(@Req() req: any, @Body() body: { dataUrl?: string }) {
    const userId = Number(req.user?.id);
    const dataUrl = String(body?.dataUrl || '').trim();
    if (!dataUrl) throw new BadRequestException('dataUrl é obrigatório.');
    if (!/^data:image\/(png|jpe?g|webp);base64,/.test(dataUrl)) {
      throw new BadRequestException('dataUrl deve ser uma imagem PNG, JPEG ou WEBP em formato base64.');
    }
    if (dataUrl.length > 700000) {
      throw new BadRequestException('Imagem muito grande. Máximo ~500KB após compressão.');
    }
    await this.prisma.$executeRawUnsafe(
      'UPDATE "User" SET "avatarUrl" = $1 WHERE "id" = $2',
      dataUrl,
      userId,
    );
    const updated = await this.usersService.findById(userId);
    const masterContext = await this.resolveMasterContext(req, updated);
    const runtimeUser: any = updated;
    const finalUser = runtimeUser && !runtimeUser.company && req.user?.company
      ? { ...updated, company: req.user.company }
      : updated;
    return sanitizeUser(finalUser, masterContext);
  }

  @Delete('avatar')
  @UseGuards(JwtAuthGuard)
  async removeAvatar(@Req() req: any) {
    const userId = Number(req.user?.id);
    await this.prisma.$executeRawUnsafe(
      'UPDATE "User" SET "avatarUrl" = NULL WHERE "id" = $1',
      userId,
    );
    const updated = await this.usersService.findById(userId);
    const masterContext = await this.resolveMasterContext(req, updated);
    const runtimeUser: any = updated;
    const finalUser = runtimeUser && !runtimeUser.company && req.user?.company
      ? { ...updated, company: req.user.company }
      : updated;
    return sanitizeUser(finalUser, masterContext);
  }

  // Preferências de notificação do usuário: 4 booleans persistidos em JSON na coluna
  // notificationPrefsJson do User. Lógica inline (pequena e auto-contida).
  private notifDefaults() {
    return { novoLead: true, semResposta: true, resumoDiario: false, tarefasAtrasadas: true };
  }

  private async readNotifPrefs(userId: number): Promise<{ novoLead: boolean; semResposta: boolean; resumoDiario: boolean; tarefasAtrasadas: boolean }> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ notificationPrefsJson: string | null }>>(
      'SELECT "notificationPrefsJson" FROM "User" WHERE "id" = $1 LIMIT 1',
      userId,
    );
    const raw = rows?.[0]?.notificationPrefsJson;
    const defaults = this.notifDefaults();
    if (!raw) return defaults;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaults;
      return {
        novoLead:         typeof parsed.novoLead === 'boolean'         ? parsed.novoLead         : defaults.novoLead,
        semResposta:      typeof parsed.semResposta === 'boolean'      ? parsed.semResposta      : defaults.semResposta,
        resumoDiario:     typeof parsed.resumoDiario === 'boolean'     ? parsed.resumoDiario     : defaults.resumoDiario,
        tarefasAtrasadas: typeof parsed.tarefasAtrasadas === 'boolean' ? parsed.tarefasAtrasadas : defaults.tarefasAtrasadas,
      };
    } catch {
      return defaults;
    }
  }

  @Get('notification-prefs')
  @UseGuards(JwtAuthGuard)
  async getNotificationPrefs(@Req() req: any) {
    const prefs = await this.readNotifPrefs(Number(req.user?.id));
    return { prefs };
  }

  @Patch('notification-prefs')
  @UseGuards(JwtAuthGuard)
  async updateNotificationPrefs(@Req() req: any, @Body() body: { prefs?: Record<string, unknown> }) {
    const userId = Number(req.user?.id);
    const current = await this.readNotifPrefs(userId);
    const patch = body?.prefs && typeof body.prefs === 'object' ? body.prefs : {};

    // whitelist: só as 4 chaves válidas — ignora qualquer outro campo do body
    const next = {
      novoLead:         'novoLead'         in patch ? Boolean(patch.novoLead)         : current.novoLead,
      semResposta:      'semResposta'      in patch ? Boolean(patch.semResposta)      : current.semResposta,
      resumoDiario:     'resumoDiario'     in patch ? Boolean(patch.resumoDiario)     : current.resumoDiario,
      tarefasAtrasadas: 'tarefasAtrasadas' in patch ? Boolean(patch.tarefasAtrasadas) : current.tarefasAtrasadas,
    };

    await this.prisma.$executeRawUnsafe(
      'UPDATE "User" SET "notificationPrefsJson" = $1 WHERE "id" = $2',
      JSON.stringify(next),
      userId,
    );

    return { prefs: next };
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

// ── Ativação / onboarding (28/06) ──────────────────────────────────────────────
// Camada 1 (vendedor) + Camada 4 (admin/empresa solo|time, gerente). Marcos
// rastreados da jornada. milestone=true ⇒ o front dispara o "momento de conquista"
// uma única vez (firstTime). A ordem do array é a ordem do checklist.
//
// IMPORTANTE: este controller é a FONTE ÚNICA da camada de dados de onboarding de
// TODOS os papéis (vendedor, admin/dono, gerente). Os workers C3 (gerencial) e C5
// (master) DISPARAM eventos do front, mas o catálogo de eventos + checklists vive
// aqui. Eventos novos NÃO podem quebrar o vendedor (Camada 1).
const ONBOARDING_EVENTS = [
  // Camada 1 — vendedor (e admin solo, que reusa a jornada do vendedor)
  'lead_pulled',
  'whatsapp_connected',
  'first_conversation_started',
  'first_deal_closed',
  // Camada 4 — admin/dono (1º login solo|time)
  'company_identity_set',
  'first_module_confirmed',
  'first_seller_invited',
  'first_conversation', // ativação do admin solo (sinônimo "fez acontecer")
  // Camada 4 — gerente (worker C3 dispara do front; aqui só registramos + checklist)
  'first_seller_released',
] as const;
type OnboardingEvent = (typeof ONBOARDING_EVENTS)[number];

type ChecklistStep = {
  key: OnboardingEvent;
  label: string;
  hint: string;
  href: string;
  cta: string;
  milestone: boolean;
};

// Checklist do VENDEDOR (coração da Camada 1). Ativação = 1ª conversa iniciada.
const SELLER_CHECKLIST: ChecklistStep[] = [
  { key: 'lead_pulled', label: 'Puxe seu primeiro lead', hint: 'Abra o Radar, busque empresas do seu ramo e traga uma pra sua carteira.', href: '/vendas', cta: 'Abrir Radar', milestone: true },
  { key: 'whatsapp_connected', label: 'Conecte seu WhatsApp', hint: 'É por ele que você fala com o cliente. Leva 1 minuto.', href: '/atendimento', cta: 'Conectar', milestone: false },
  { key: 'first_conversation_started', label: 'Inicie a primeira conversa', hint: 'Mande a primeira mensagem — é aqui que você ativa de verdade.', href: '/atendimento', cta: 'Ir para Conversas', milestone: true },
  { key: 'first_deal_closed', label: 'Feche a primeira venda', hint: 'Gere o link de contratação e amarre a sua comissão.', href: '/vendas', cta: 'Abrir Vendas', milestone: true },
];

// Checklist do ADMIN/DONO (Camada 4), RAMIFICADO por modo de operação:
//  - 'team' (com time): identidade → módulos → 1º vendedor convidado → 1ª conversa.
//  - 'solo' (sozinho): identidade → módulos → cai no fluxo do vendedor (puxar lead,
//    conectar WhatsApp, 1ª conversa). O admin solo "vira vendedor" de si mesmo.
// Identidade e módulos são comuns. O ramo é escolhido no 1º login (portão) e
// carimba `company_identity_set` — o checklist auto-cura do dado real (ramo salvo).
const ADMIN_COMMON_STEPS: ChecklistStep[] = [
  { key: 'company_identity_set', label: 'Defina a identidade da empresa', hint: 'Nome, ramo-alvo e o que você vende — é o que alimenta o Radar e o fechamento.', href: '/configuracoes', cta: 'Abrir Configurações', milestone: false },
  { key: 'first_module_confirmed', label: 'Confirme os módulos', hint: 'Já vêm ligados pelo seu plano. Confira o que sua equipe vai usar.', href: '/configuracoes', cta: 'Ver módulos', milestone: false },
];
const ADMIN_TEAM_STEPS: ChecklistStep[] = [
  ...ADMIN_COMMON_STEPS,
  { key: 'first_seller_invited', label: 'Convide seu primeiro vendedor', hint: 'Cadastre um vendedor e defina o cargo. A operação começa quando o time entra.', href: '/gerencial', cta: 'Convidar vendedor', milestone: true },
  { key: 'first_conversation', label: 'Veja a primeira conversa acontecer', hint: 'Acompanhe o time falar com o cliente — é aqui que a empresa ativa.', href: '/atendimento', cta: 'Abrir Atendimento', milestone: true },
];
const ADMIN_SOLO_STEPS: ChecklistStep[] = [
  ...ADMIN_COMMON_STEPS,
  { key: 'lead_pulled', label: 'Puxe seu primeiro lead', hint: 'Abra o Radar, busque empresas do seu ramo e traga uma pra sua carteira.', href: '/vendas', cta: 'Abrir Radar', milestone: true },
  { key: 'whatsapp_connected', label: 'Conecte seu WhatsApp', hint: 'É por ele que você fala com o cliente. Leva 1 minuto.', href: '/atendimento', cta: 'Conectar', milestone: false },
  { key: 'first_conversation', label: 'Inicie a primeira conversa', hint: 'Mande a primeira mensagem — é aqui que você ativa de verdade.', href: '/atendimento', cta: 'Ir para Conversas', milestone: true },
];

// Checklist do GERENTE (Camada 4): 1 marco — liberar o 1º vendedor. O worker C3
// dispara `first_seller_released` do front; aqui registramos + auto-curamos do dado
// real (existe vendedor ATIVO na empresa).
const MANAGER_CHECKLIST: ChecklistStep[] = [
  { key: 'first_seller_released', label: 'Libere o primeiro vendedor', hint: 'Aprove o acesso de um vendedor da equipe — é o seu papel pra operação girar.', href: '/gerencial', cta: 'Abrir Equipe', milestone: true },
];

// 'admin' aqui é o DONO (vê cobrança). O GERENTE também é role ADMIN no banco, mas
// com canViewBilling=false (régua única PR13062026007). Separamos os dois.
// RBAC Sprint 3: papel derivado da fonte única (resolveActorKind); aqui só
// traduzimos o vocabulário PT → o vocabulário local (EN) que o checklist usa.
// Semântica idêntica ao inline anterior (caracterização em access/actor-kind.test.ts).
function resolveUserKind(user: any): 'system_master' | 'admin' | 'manager' | 'seller' | 'user' {
  switch (resolveActorKind(user)) {
    case 'master': return 'system_master';
    case 'dono': return 'admin';
    case 'gerente': return 'manager';
    case 'vendedor': return 'seller';
    default: return 'user';
  }
}

// Modo de operação do admin (solo|time). Decidido no 1º login (portão) e gravado
// como carimbo de onboarding (admin_mode:solo|admin_mode:team). Default = 'team'
// (mais comum) até a escolha; o portão força a escolha antes de soltar o app.
function resolveAdminMode(stamps: Record<string, string>): 'solo' | 'team' {
  if (stamps['admin_mode:solo']) return 'solo';
  if (stamps['admin_mode:team']) return 'team';
  return 'team';
}

@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  // Checklist de ativação do usuário logado, POR PAPEL (Camada 1 vendedor +
  // Camada 4 admin/gerente). master/usuário genérico voltam applicable=false e o
  // front esconde a casca. O estado vem dos carimbos (onboardingStateJson) E DERIVA
  // dos dados reais — assim o painel mostra a VERDADE e se auto-cura pra quem já fez
  // antes do recurso. Toda derivação é defensiva: query falhou → cai só no carimbo.
  @Get('checklist')
  @UseGuards(JwtAuthGuard)
  async checklist(@Req() req: any) {
    const user = await this.usersService.findById(Number(req.user?.id));
    const kind = resolveUserKind(user);
    if (kind !== 'seller' && kind !== 'admin' && kind !== 'manager') {
      return {
        applicable: false, role: kind, complete: true, activated: false,
        progress: { done: 0, total: 0 }, steps: [], adminMode: null,
      };
    }

    const userId = Number(user?.id || 0);
    const companyId = Number((user as any)?.companyId || 0);
    const stamps = this.usersService.getOnboardingEvents(user as any);
    const derived = await this.deriveOnboardingState(kind, userId, companyId, user);

    // Seleção do checklist + chave de "ativado" por papel.
    let template: ChecklistStep[];
    let activatedKey: OnboardingEvent;
    let adminMode: 'solo' | 'team' | null = null;
    if (kind === 'manager') {
      template = MANAGER_CHECKLIST;
      activatedKey = 'first_seller_released';
    } else if (kind === 'admin') {
      adminMode = resolveAdminMode(stamps);
      template = adminMode === 'solo' ? ADMIN_SOLO_STEPS : ADMIN_TEAM_STEPS;
      activatedKey = 'first_conversation';
    } else {
      template = SELLER_CHECKLIST;
      activatedKey = 'first_conversation_started';
    }

    const steps = template.map((s) => {
      const stampedAt = stamps[s.key] || null;
      const done = Boolean(stampedAt) || derived[s.key] === true;
      return {
        key: s.key,
        label: s.label,
        hint: s.hint,
        href: s.href,
        cta: s.cta,
        milestone: s.milestone,
        done,
        doneAt: stampedAt,
      };
    });

    const doneCount = steps.filter((s) => s.done).length;
    const activated = Boolean(steps.find((s) => s.key === activatedKey)?.done);
    return {
      applicable: true,
      role: kind,
      adminMode,
      complete: doneCount >= steps.length,
      activated,
      progress: { done: doneCount, total: steps.length },
      steps,
    };
  }

  // Auto-cura: deriva o estado dos marcos a partir do DADO REAL por papel. Defensiva:
  // qualquer query que falhe cai fora (o carimbo assume). Nenhuma derivação aqui faz
  // AÇÃO live (WhatsApp etc.) — só CONTAGEM read-only.
  private async deriveOnboardingState(
    kind: 'seller' | 'admin' | 'manager',
    userId: number,
    companyId: number,
    user: any,
  ): Promise<Partial<Record<OnboardingEvent, boolean>>> {
    const derived: Partial<Record<OnboardingEvent, boolean>> = {};

    // Identidade da empresa (admin): ramo-alvo já salvo = identidade definida. Os
    // módulos JÁ vêm ligados pelo plano (não há ação que "confirme" — seria um passo
    // fantasma travando o checklist), então confirmação de módulo auto-cura junto da
    // identidade; o admin ainda pode ajustar em Configurações quando quiser.
    if (kind === 'admin') {
      try {
        const segs = JSON.parse(String(user?.company?.prospectingSegmentsJson || '[]'));
        if (Array.isArray(segs) && segs.some((s: any) => String(s || '').trim())) {
          derived.company_identity_set = true;
          derived.first_module_confirmed = true;
        }
      } catch { /* sem ramo legível — segue pelo carimbo */ }
    }

    // Vendedor convidado/liberado (admin/gerente): existe USER na empresa? (≠ o próprio).
    if (kind === 'admin' || kind === 'manager') {
      try {
        const [anySeller, activeSeller] = await Promise.all([
          companyId
            ? this.prisma.user.count({ where: { companyId, role: 'USER', isSystemMaster: false } })
            : Promise.resolve(0),
          companyId
            ? this.prisma.user.count({ where: { companyId, role: 'USER', isSystemMaster: false, isActive: true } })
            : Promise.resolve(0),
        ]);
        derived.first_seller_invited = anySeller > 0;
        derived.first_seller_released = activeSeller > 0;
      } catch { /* sem derivação de equipe */ }
    }

    // 1ª conversa da EMPRESA (admin: solo ou time) — qualquer conversa da empresa conta.
    if (kind === 'admin') {
      try {
        const convs = companyId
          ? await this.prisma.companyConversation.count({ where: { companyId } })
          : 0;
        derived.first_conversation = convs > 0;
      } catch { /* sem derivação de conversa */ }
    }

    // Fluxo do vendedor (vendedor OU admin solo): lead puxado / chip ativo / venda.
    if (kind === 'seller' || kind === 'admin') {
      try {
        const [pulled, waActive, dealClosed] = await Promise.all([
          userId ? this.prisma.vendasLead.count({ where: { assignedUserId: userId } }) : Promise.resolve(0),
          companyId
            ? this.prisma.whatsAppConnectionSession.count({
                where: { companyId, status: 'active', OR: [{ userId }, { userId: null }] },
              })
            : Promise.resolve(0),
          userId
            ? this.prisma.vendasLead.count({ where: { assignedUserId: userId, saleStatus: { not: 'none' } } })
            : Promise.resolve(0),
        ]);
        derived.lead_pulled = pulled > 0;
        derived.whatsapp_connected = waActive > 0;
        derived.first_deal_closed = dealClosed > 0;
      } catch { /* sem derivação do fluxo do vendedor */ }
    }

    return derived;
  }

  // Carimbos de configuração do onboarding (NÃO são marcos do checklist): a escolha
  // solo|time do admin no 1º login + o interesse em configurar IA/Bot perguntado no
  // tutorial (07/07). Idempotentes; não entram no checklist nem celebram conquista.
  private static readonly ONBOARDING_CONFIG_EVENTS = [
    'admin_mode:solo',
    'admin_mode:team',
    'ai_bot_interest:yes',
    'ai_bot_interest:no',
  ] as const;

  // Carimba um marco (idempotente). Devolve firstTime + se o marco é milestone —
  // o front decide disparar a conquista só na 1ª vez de um marco celebrável. Aceita
  // tanto marcos do checklist (ONBOARDING_EVENTS) quanto carimbos de config
  // (admin_mode:*) usados pelo portão para ramificar o checklist do admin.
  @Post('event')
  @UseGuards(JwtAuthGuard)
  async event(@Req() req: any, @Body() body: { event?: string }) {
    const event = String(body?.event || '').trim();
    const isMilestoneEvent = ONBOARDING_EVENTS.includes(event as OnboardingEvent);
    const isConfigEvent = (OnboardingController.ONBOARDING_CONFIG_EVENTS as readonly string[]).includes(event);
    if (!isMilestoneEvent && !isConfigEvent) {
      throw new BadRequestException('Evento de onboarding inválido.');
    }
    const userId = Number(req.user?.id || 0);
    if (!userId) throw new BadRequestException('Usuario invalido');
    const { firstTime } = await this.usersService.stampOnboardingEvent(userId, event);
    // Milestone (momento de conquista) só p/ marco celebrável DO PAPEL de quem chama:
    // vendedor vê os marcos de vendedor, admin/dono os do admin (solo|time), gerente
    // o seu. Carimbos de config nunca celebram.
    const user = await this.usersService.findById(userId);
    const kind = resolveUserKind(user);

    // Fix 28/06 — a escolha solo|time do dono no 1º login DEFINE o modelo de
    // atendimento real (Company.whatsappAttendanceMode), não é só casca pro checklist:
    //   solo = 'individual' (atende pelo próprio WhatsApp) · time = 'shared' (número da empresa).
    // Grava SÓ quando ainda não definido (1º login, sem chip) — nunca sobrescreve uma
    // escolha já feita. Gravar o campo NÃO desconecta chip (a troca-com-desconexão mora
    // no painel /atendimento); por isso é seguro aqui. Best-effort: jamais derruba o carimbo.
    // SÓ os carimbos admin_mode:* definem o modelo de atendimento — os demais
    // carimbos de config (ex.: ai_bot_interest:*) não têm nada a ver com chip e
    // NÃO podem encostar em whatsappAttendanceMode.
    const isAdminModeEvent = event === 'admin_mode:solo' || event === 'admin_mode:team';
    if (isAdminModeEvent && kind === 'admin') {
      const companyId = Number((user as any)?.companyId || 0);
      if (companyId) {
        const desiredMode = event === 'admin_mode:solo' ? 'individual' : 'shared';
        try {
          const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { whatsappAttendanceMode: true } as any,
          });
          if (company && !(company as any).whatsappAttendanceMode) {
            await this.prisma.company.update({
              where: { id: companyId },
              data: { whatsappAttendanceMode: desiredMode } as any,
            });
          }
        } catch { /* best-effort: o link do modelo nunca derruba o carimbo de onboarding */ }
      }
    }

    let milestone = false;
    if (isMilestoneEvent) {
      const stamps = this.usersService.getOnboardingEvents(user as any);
      let template: ChecklistStep[] | null = null;
      if (kind === 'seller') template = SELLER_CHECKLIST;
      else if (kind === 'manager') template = MANAGER_CHECKLIST;
      else if (kind === 'admin') template = resolveAdminMode(stamps) === 'solo' ? ADMIN_SOLO_STEPS : ADMIN_TEAM_STEPS;
      milestone = Boolean(template?.find((s) => s.key === event)?.milestone);
    }
    return { ok: true, event, firstTime, milestone };
  }

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
