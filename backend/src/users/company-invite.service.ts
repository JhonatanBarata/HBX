import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ensureUserTeamPolicyForUser } from '../team/team-policy-persistence';

// MODO PUXAR (02/08/2026) — convite único de equipe.
// O admin convida por E-MAIL e a resposta pra ele é SEMPRE "Convite enviado."
// (anti-enumeração: o campo nunca revela se o e-mail já tem conta HBX).
// Quem já tem conta vê o convite ao logar e aceita → vira VENDEDOR da empresa
// (cargo rebaixado, comissões zeradas, policy reescrita pro padrão do cargo);
// a conta pessoal CONGELA (Company.dormantAt) e NADA de dado migra — lead,
// crédito e histórico ficam lá. "Desligar da empresa" devolve o usuário pra
// conta pessoal com o cargo do snapshot (e sem re-conceder crédito: o welcome
// é idempotente por empresa).
// Elegibilidade v1 (decisão do dono 02/08): só conta CRÉDITO de 1 usuário,
// sem pagamento aprovado, sem contrato empresarial e sem chip conectado.

const INVITE_TTL_DAYS = 7;

export type PullEligibility = { ok: boolean; code: string | null; message: string | null };

type InviteWithCompany = {
  id: string;
  companyId: number;
  email: string;
  token: string;
  status: string;
  expiresAt: Date;
  claimedByUserId: number | null;
  company: {
    id: number;
    name: string;
    companyKind: string;
    seatCap: number | null;
  } | null;
};

@Injectable()
export class CompanyInviteService {
  private readonly logger = new Logger(CompanyInviteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  private buildAppUrl() {
    return String(process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');
  }

  private buildInviteUrl(token: string) {
    return `${this.buildAppUrl()}/convite/${encodeURIComponent(token)}`;
  }

  private normalizeEmail(raw: unknown) {
    return String(raw || '').trim().toLowerCase();
  }

  private isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private escapeHtml(value: string) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Varredura preguiçosa: pendente vencido vira 'expired' quando alguém olha.
  private async sweepExpired(where: { companyId?: number; email?: string; claimedByUserId?: number }) {
    await this.prisma.companyUserInvite.updateMany({
      where: { ...where, status: 'pending', expiresAt: { lt: new Date() } },
      data: { status: 'expired' },
    }).catch(() => undefined);
  }

  private async sendInviteEmail(input: { to: string; companyName: string; inviteUrl: string }) {
    const companyName = this.escapeHtml(input.companyName);
    const inviteUrl = this.escapeHtml(input.inviteUrl);
    const subject = `Convite para a equipe ${input.companyName} no HBX`;
    const text = [
      `${input.companyName} convidou você para entrar na equipe no HBX.`,
      '',
      `Acesse o link para aceitar: ${input.inviteUrl}`,
      '',
      `O convite expira em ${INVITE_TTL_DAYS} dias. Se você não reconhece este convite, ignore este e-mail.`,
    ].join('\n');
    const html = [
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937">',
      `<h2 style="margin:0 0 12px">Convite para a equipe ${companyName}</h2>`,
      `<p style="margin:0 0 16px;line-height:1.5">${companyName} convidou você para entrar na equipe no HBX.</p>`,
      `<p style="margin:0 0 20px"><a href="${inviteUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px">Ver convite</a></p>`,
      `<p style="margin:0 0 6px;font-size:13px;color:#6b7280;line-height:1.5">Se o botão não abrir, copie e cole no navegador:<br>${inviteUrl}</p>`,
      `<p style="margin:12px 0 0;font-size:13px;color:#6b7280;line-height:1.5">O convite expira em ${INVITE_TTL_DAYS} dias. Se você não reconhece este convite, ignore este e-mail.</p>`,
      '</div>',
    ].join('');
    return this.mail.sendMail({ to: input.to, subject, text, html });
  }

  // ADMIN cria/renova o convite. Resposta é sempre "Convite enviado." — o único
  // erro que vaza é sobre a PRÓPRIA equipe (não revela nada de outro tenant).
  async createInvite(actingUser: any, rawEmail: unknown) {
    const companyId = Number(actingUser?.companyId);
    if (!companyId) throw new ForbiddenException('Company context required');
    const email = this.normalizeEmail(rawEmail);
    if (!email || !this.isValidEmail(email)) {
      throw new BadRequestException('Informe um e-mail válido para o convite.');
    }
    if (this.normalizeEmail(actingUser?.email) === email) {
      throw new BadRequestException('Você não pode convidar o próprio e-mail.');
    }

    const alreadyInTeam = await this.prisma.user.findFirst({
      where: { email, companyId },
      select: { id: true },
    });
    if (alreadyInTeam) {
      throw new BadRequestException('Este e-mail já faz parte da sua equipe.');
    }

    await this.sweepExpired({ companyId });
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    // Reenvio idempotente: convite pendente pro mesmo e-mail renova o prazo e
    // reusa o token (o link já mandado por zap continua valendo).
    const pending = await this.prisma.companyUserInvite.findFirst({
      where: { companyId, email, status: 'pending' },
    });
    const invite = pending
      ? await this.prisma.companyUserInvite.update({
          where: { id: pending.id },
          data: { expiresAt, invitedByUserId: Number(actingUser?.id) || null },
        })
      : await this.prisma.companyUserInvite.create({
          data: {
            companyId,
            email,
            token: `inv_${crypto.randomBytes(24).toString('base64url')}`,
            invitedByUserId: Number(actingUser?.id) || null,
            expiresAt,
          },
        });

    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
    const inviteUrl = this.buildInviteUrl(invite.token);
    let emailSent = false;
    try {
      const result = await this.sendInviteEmail({ to: email, companyName: company?.name || 'Sua empresa', inviteUrl });
      emailSent = Boolean(result?.ok);
    } catch (error: any) {
      this.logger.warn(`invite_email_failed company=${companyId} error=${String(error?.message || error)}`);
    }

    return {
      ok: true,
      message: 'Convite enviado.',
      invite: this.presentInvite(invite),
      inviteUrl,
      emailSent,
    };
  }

  private presentInvite(invite: { id: string; email: string; status: string; createdAt: Date; expiresAt: Date; token?: string }) {
    return {
      id: invite.id,
      email: invite.email,
      status: invite.status,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      ...(invite.token ? { inviteUrl: this.buildInviteUrl(invite.token) } : {}),
    };
  }

  async listCompanyInvites(companyId: number) {
    await this.sweepExpired({ companyId });
    const invites = await this.prisma.companyUserInvite.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    // Link só volta em convite PENDENTE (resolvido não precisa de link vivo).
    return invites.map((invite) => this.presentInvite(invite.status === 'pending' ? invite : { ...invite, token: undefined }));
  }

  async cancelInvite(actingUser: any, inviteId: string) {
    const companyId = Number(actingUser?.companyId);
    const invite = await this.prisma.companyUserInvite.findUnique({ where: { id: String(inviteId || '') } });
    if (!invite || Number(invite.companyId) !== companyId) throw new NotFoundException('Convite não encontrado');
    if (invite.status !== 'pending') throw new BadRequestException('Este convite já foi resolvido.');
    const updated = await this.prisma.companyUserInvite.update({
      where: { id: invite.id },
      data: { status: 'canceled', canceledAt: new Date() },
    });
    return { ok: true, invite: this.presentInvite({ ...updated, token: undefined }) };
  }

  // Página pública do link (/convite/<token>): mostra quem convidou e pra qual
  // e-mail. Quem tem o link já recebeu esses dados no próprio convite.
  async getPublicInvite(rawToken: string) {
    const token = String(rawToken || '').trim();
    if (!token) throw new NotFoundException('Convite não encontrado');
    const invite = await this.prisma.companyUserInvite.findUnique({
      where: { token },
      include: { company: { select: { name: true } } },
    });
    if (!invite) throw new NotFoundException('Convite não encontrado');
    const expired = invite.status === 'pending' && invite.expiresAt.getTime() < Date.now();
    if (expired) {
      await this.prisma.companyUserInvite.update({ where: { id: invite.id }, data: { status: 'expired' } }).catch(() => undefined);
    }
    return {
      companyName: invite.company?.name || 'Empresa',
      email: invite.email,
      status: expired ? 'expired' : invite.status,
      expiresAt: invite.expiresAt,
    };
  }

  // ===== Aceite (a PESSOA convidada) =====

  private async loadUserForPull(userId: number) {
    return this.prisma.user.findUnique({
      where: { id: Number(userId) },
      select: {
        id: true,
        email: true,
        googleId: true,
        emailConfirmedAt: true,
        role: true,
        isSystemMaster: true,
        companyId: true,
        personalCompanyId: true,
        company: {
          select: {
            id: true,
            name: true,
            companyKind: true,
            accountType: true,
            whatsappConnectionMode: true,
            whatsappTemporaryStatus: true,
            currentWhatsappConnectionSessionId: true,
          },
        },
      },
    });
  }

  // Elegibilidade v1 — devolve o PRIMEIRO bloqueio com mensagem pra tela.
  private async assessPullEligibility(user: NonNullable<Awaited<ReturnType<CompanyInviteService['loadUserForPull']>>>, invite: InviteWithCompany): Promise<PullEligibility> {
    const block = (code: string, message: string): PullEligibility => ({ ok: false, code, message });

    if (invite.status !== 'pending') return block('NOT_PENDING', 'Este convite já foi resolvido.');
    if (invite.expiresAt.getTime() < Date.now()) return block('EXPIRED', 'Este convite expirou. Peça um novo convite à empresa.');
    if (user.isSystemMaster) return block('SYSTEM_MASTER', 'Conta master não pode aceitar convite de equipe.');
    if (this.normalizeEmail(user.email) !== this.normalizeEmail(invite.email)) {
      return block('EMAIL_MISMATCH', 'Este convite é para outro e-mail.');
    }
    if (!user.emailConfirmedAt && !user.googleId) {
      return block('EMAIL_NOT_CONFIRMED', 'Confirme seu e-mail para aceitar o convite.');
    }
    if (Number(user.companyId) === Number(invite.companyId)) {
      return block('ALREADY_IN_COMPANY', 'Você já faz parte desta empresa.');
    }
    if (user.personalCompanyId != null) {
      return block('ALREADY_PULLED', 'Sua conta já está vinculada a uma empresa. Peça o desligamento antes de aceitar outro convite.');
    }
    const personal = user.company;
    if (!personal || personal.companyKind !== 'tenant') {
      return block('COMPANY_NOT_PERSONAL', 'Sua conta atual não pode ser vinculada a outra empresa.');
    }
    if (personal.accountType !== 'credit') {
      return block('COMPANY_NOT_PERSONAL', 'Conta empresarial não pode ser vinculada a outra empresa.');
    }
    const teammates = await this.prisma.user.count({ where: { companyId: personal.id } });
    if (teammates > 1) {
      return block('TEAM_NOT_ALONE', 'Sua conta tem outros usuários — só conta pessoal (você sozinho) pode ser vinculada.');
    }
    const paidCharges = await this.prisma.financeiroCharge.count({
      where: {
        companyId: personal.id,
        OR: [{ status: 'approved' }, { lifecycle: { in: ['paid', 'finalized'] } }],
      },
    });
    if (paidCharges > 0) {
      return block('HAS_PAID_CHARGES', 'Sua conta já tem pagamentos e não pode ser vinculada a outra empresa.');
    }
    const chipConnected =
      personal.whatsappConnectionMode !== 'NONE' ||
      personal.whatsappTemporaryStatus !== 'NOT_CONNECTED' ||
      Boolean(personal.currentWhatsappConnectionSessionId);
    if (chipConnected) {
      return block('CHIP_CONNECTED', 'Desconecte o WhatsApp da sua conta antes de aceitar o convite.');
    }
    const destination = invite.company;
    if (!destination || destination.companyKind !== 'tenant') {
      return block('COMPANY_INVALID', 'A empresa deste convite não está mais disponível.');
    }
    const seatCap = Number(destination.seatCap || 0);
    if (seatCap > 0) {
      const activeUsers = await this.prisma.user.count({ where: { companyId: destination.id, isActive: true } });
      if (activeUsers >= seatCap) {
        return block('SEAT_CAP', 'A empresa atingiu o teto de acessos. Peça ao admin para liberar espaço.');
      }
    }
    return { ok: true, code: null, message: null };
  }

  private async loadInviteWithCompany(inviteId: string): Promise<InviteWithCompany | null> {
    return this.prisma.companyUserInvite.findUnique({
      where: { id: String(inviteId || '') },
      include: { company: { select: { id: true, name: true, companyKind: true, seatCap: true } } },
    }) as any;
  }

  // Convites pendentes do usuário logado (por e-mail) + por que não dá pra
  // aceitar, quando não dá — o banner mostra o motivo em vez de sumir.
  async listPendingForUser(userId: number) {
    const user = await this.loadUserForPull(Number(userId));
    if (!user || !user.email) return { invites: [] };
    await this.sweepExpired({ email: this.normalizeEmail(user.email) });
    const invites = (await this.prisma.companyUserInvite.findMany({
      where: { email: this.normalizeEmail(user.email), status: 'pending' },
      orderBy: { createdAt: 'desc' },
      include: { company: { select: { id: true, name: true, companyKind: true, seatCap: true } } },
      take: 5,
    })) as any as InviteWithCompany[];
    const out = [] as Array<{ id: string; companyName: string; expiresAt: Date; eligible: boolean; blockedReason: string | null }>;
    for (const invite of invites) {
      const eligibility = await this.assessPullEligibility(user, invite);
      out.push({
        id: invite.id,
        companyName: invite.company?.name || 'Empresa',
        expiresAt: invite.expiresAt,
        eligible: eligibility.ok,
        blockedReason: eligibility.message,
      });
    }
    return { invites: out };
  }

  // O ACEITE — move o usuário pra empresa do convite. Regras duras:
  // cargo REBAIXADO pra vendedor (nunca chega admin), comissões zeradas,
  // policy reescrita pro padrão do cargo, sessões antigas mortas (o token
  // velho carrega a empresa antiga), conta pessoal congelada. NADA migra.
  async acceptInvite(userId: number, inviteId: string) {
    const user = await this.loadUserForPull(Number(userId));
    if (!user) throw new NotFoundException('Usuário não encontrado');
    const invite = await this.loadInviteWithCompany(inviteId);
    if (!invite || this.normalizeEmail(invite.email) !== this.normalizeEmail(user.email)) {
      throw new NotFoundException('Convite não encontrado');
    }
    const eligibility = await this.assessPullEligibility(user, invite);
    if (!eligibility.ok) {
      if (eligibility.code === 'EXPIRED') {
        await this.prisma.companyUserInvite.update({ where: { id: invite.id }, data: { status: 'expired' } }).catch(() => undefined);
      }
      throw new BadRequestException(eligibility.message || 'Convite indisponível.');
    }

    const now = new Date();
    const personalCompanyId = Number(user.companyId);
    const personalRole = String(user.role || 'ADMIN');

    await this.prisma.$transaction(async (tx) => {
      // Guarda de corrida: só UM aceite resolve o convite.
      const resolved = await tx.companyUserInvite.updateMany({
        where: { id: invite.id, status: 'pending' },
        data: { status: 'accepted', acceptedAt: now, acceptedByUserId: user.id },
      });
      if (resolved.count !== 1) throw new ConflictException('Este convite já foi resolvido.');

      await tx.user.update({
        where: { id: user.id },
        data: {
          companyId: invite.companyId,
          role: 'USER',
          canViewBilling: false,
          canRegisterHbxSellers: false,
          commissionPercent: 0,
          commissionMonthlyCap: 0,
          setupCommissionCap: 0,
          referredByUserId: null,
          sellerReferralCommissionPercent: 0,
          referredByCommissionPercentSnapshot: 0,
          sellerDistributionMode: 'learning',
          sellerDistributionPausedUntil: null,
          sellerDistributionDailyLimitOverride: null,
          sellerDistributionNote: null,
          sellerDistributionUpdatedAt: null,
          botAccessEnabled: false,
          personalCompanyId,
          personalRoleSnapshot: personalRole,
          pulledIntoCompanyAt: now,
          isActive: true,
          deactivatedAt: null,
          retentionUntil: null,
          currentSessionId: null,
          sessionVersion: { increment: 1 },
        },
      });

      await tx.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'company_invite_accept' },
      });

      await tx.company.update({ where: { id: personalCompanyId }, data: { dormantAt: now } });
    });

    // Policy do cargo NOVO (Lei do Vendedor: nasce operacional-máximo do cargo
    // USER; nada herdado da empresa pessoal). overwrite explícito de propósito.
    await ensureUserTeamPolicyForUser(this.prisma, user.id, { source: 'company_invite_accept', overwrite: true });

    return {
      userId: user.id,
      companyId: invite.companyId,
      companyName: invite.company?.name || 'Empresa',
    };
  }

  async declineInvite(userId: number, inviteId: string) {
    const user = await this.loadUserForPull(Number(userId));
    if (!user) throw new NotFoundException('Usuário não encontrado');
    const invite = await this.prisma.companyUserInvite.findUnique({ where: { id: String(inviteId || '') } });
    if (!invite || this.normalizeEmail(invite.email) !== this.normalizeEmail(user.email)) {
      throw new NotFoundException('Convite não encontrado');
    }
    if (invite.status !== 'pending') throw new BadRequestException('Este convite já foi resolvido.');
    await this.prisma.companyUserInvite.update({
      where: { id: invite.id },
      data: { status: 'declined', declinedAt: new Date() },
    });
    return { ok: true };
  }

  // ===== Cadastro via link (auth chama) =====

  // Valida o token pro SIGNUP: o e-mail do cadastro tem que ser o do convite.
  async resolveInviteForSignup(rawToken: string, email: string) {
    const token = String(rawToken || '').trim();
    if (!token) return null;
    const invite = await this.prisma.companyUserInvite.findUnique({ where: { token } });
    if (!invite) throw new BadRequestException('Convite inválido. Cadastre-se normalmente ou peça um novo convite.');
    if (invite.status !== 'pending' || invite.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Convite expirado ou já resolvido. Cadastre-se normalmente ou peça um novo convite.');
    }
    if (this.normalizeEmail(invite.email) !== this.normalizeEmail(email)) {
      throw new BadRequestException('Este convite é para outro e-mail.');
    }
    return invite;
  }

  async attachClaim(inviteId: string, userId: number) {
    await this.prisma.companyUserInvite.updateMany({
      where: { id: String(inviteId || ''), status: 'pending' },
      data: { claimedByUserId: Number(userId) },
    }).catch(() => undefined);
  }

  // Pós-confirmação de e-mail: cadastro que nasceu do LINK aceita sozinho
  // (clicar no link + provar o e-mail É o consentimento). Best-effort: se a
  // elegibilidade falhar (convite cancelado no meio, etc.), o cadastro segue
  // como conta normal — quem decide depois é o banner.
  async acceptClaimedInviteAfterConfirm(userId: number): Promise<{ accepted: boolean; companyId?: number; companyName?: string; reason?: string } | null> {
    const invite = await this.prisma.companyUserInvite.findFirst({
      where: { claimedByUserId: Number(userId), status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    if (!invite) return null;
    try {
      const result = await this.acceptInvite(Number(userId), invite.id);
      return { accepted: true, companyId: result.companyId, companyName: result.companyName };
    } catch (error: any) {
      this.logger.warn(`invite_auto_accept_failed user=${userId} invite=${invite.id} error=${String(error?.message || error)}`);
      return { accepted: false, reason: String(error?.message || error) };
    }
  }

  // ===== Desligar da empresa (ADMIN) =====

  // Devolve o vendedor puxado pra conta pessoal dele: descongela a empresa,
  // restaura o cargo do snapshot e mata as sessões (token velho aponta pra
  // empresa errada). Créditos NÃO renascem — o welcome é idempotente.
  async releaseUserToPersonal(actingUser: any, targetUserId: number) {
    const companyId = Number(actingUser?.companyId);
    if (!companyId) throw new ForbiddenException('Company context required');
    const target = await this.prisma.user.findUnique({
      where: { id: Number(targetUserId) },
      select: {
        id: true,
        companyId: true,
        personalCompanyId: true,
        personalRoleSnapshot: true,
        isSystemMaster: true,
        name: true,
        email: true,
      },
    });
    if (!target || Number(target.companyId) !== companyId) throw new NotFoundException('Usuário não encontrado');
    if (target.isSystemMaster) throw new ForbiddenException('Usuário MASTER não pode ser alterado por admin da empresa');
    if (Number(actingUser?.id) === Number(target.id)) {
      throw new BadRequestException('Você não pode desligar o próprio acesso.');
    }
    if (!target.personalCompanyId) {
      throw new BadRequestException('Este usuário não veio de conta pessoal — use desativar ou excluir.');
    }

    const now = new Date();
    const personalCompanyId = Number(target.personalCompanyId);
    const restoredRole = String(target.personalRoleSnapshot || 'ADMIN');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: {
          companyId: personalCompanyId,
          role: restoredRole,
          canViewBilling: true,
          commissionPercent: 0,
          commissionMonthlyCap: 0,
          setupCommissionCap: 0,
          referredByUserId: null,
          sellerReferralCommissionPercent: 0,
          referredByCommissionPercentSnapshot: 0,
          sellerDistributionMode: 'learning',
          sellerDistributionPausedUntil: null,
          sellerDistributionDailyLimitOverride: null,
          sellerDistributionNote: null,
          sellerDistributionUpdatedAt: null,
          personalCompanyId: null,
          personalRoleSnapshot: null,
          pulledIntoCompanyAt: null,
          isActive: true,
          deactivatedAt: null,
          retentionUntil: null,
          currentSessionId: null,
          sessionVersion: { increment: 1 },
        },
      });

      await tx.authSession.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'company_invite_release' },
      });

      await tx.company.update({ where: { id: personalCompanyId }, data: { dormantAt: null } });
    });

    await ensureUserTeamPolicyForUser(this.prisma, target.id, { source: 'company_invite_release', overwrite: true });

    return {
      ok: true,
      message: `${target.name || target.email || 'Usuário'} foi desligado da empresa e voltou para a conta pessoal.`,
    };
  }
}
