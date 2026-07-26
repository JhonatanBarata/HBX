import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailTemplateService } from './email-template.service';

// S6 LEAD-CENTRICO (26/07, docs/PLANEJAMENTOS/PR25072026-LEAD-CENTRICO/06-email-v1.md):
// perfil do remetente POR USUÁRIO (nome vem de User.name; cargo/telefone/site vêm de
// UserSenderProfile) — monta a assinatura sóbria e é a REGRA DURA que todo e-mail
// comercial (cadência + envio manual) precisa passar antes de sair: sem nome+cargo+
// telefone, `resolveSummary().ready` é false e o chamador PULA o envio (nunca manda
// e-mail "sem identidade"). Site é opcional (não bloqueia).

export const COMMERCIAL_EMAIL_OPT_OUT_LINE =
  'Se não fizer sentido pra vocês, me avisa por aqui que não volto a incomodar.';

export type SenderIdentitySummary = {
  ready: boolean;
  missing: string[];
  name: string | null;
  jobTitle: string | null;
  phone: string | null;
  website: string | null;
  companyName: string | null;
};

export type SaveSenderIdentityInput = {
  jobTitle?: string | null;
  phone?: string | null;
  website?: string | null;
};

function normalizeText(value: unknown, max: number) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  return normalized.slice(0, max);
}

function normalizeWebsiteHref(website: string) {
  const trimmed = website.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

@Injectable()
export class SenderIdentityService {
  private readonly logger = new Logger(SenderIdentityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailTemplates: EmailTemplateService,
  ) {}

  private async canUseTable() {
    return this.prisma.hasTable('UserSenderProfile').catch(() => false);
  }

  async getRaw(userId: number | null | undefined) {
    const normalizedUserId = Math.trunc(Number(userId || 0));
    if (!normalizedUserId || !(await this.canUseTable())) return null;
    return (this.prisma as any).userSenderProfile.findUnique({ where: { userId: normalizedUserId } }).catch(() => null);
  }

  // Fonte única de "o remetente pode mandar e-mail comercial". Usada tanto pelo
  // envio manual (detalhes do lead) quanto pelo passo de e-mail da cadência —
  // regra dura: sem nome+cargo+telefone, `ready` é false e QUEM CHAMA pula o envio.
  async resolveSummary(userId: number | null | undefined, companyId: number | null | undefined): Promise<SenderIdentitySummary> {
    const normalizedUserId = Math.trunc(Number(userId || 0));
    const normalizedCompanyId = Math.trunc(Number(companyId || 0));
    const missing: string[] = [];

    const user = normalizedUserId
      ? await this.prisma.user.findUnique({ where: { id: normalizedUserId }, select: { name: true } }).catch(() => null)
      : null;
    const name = normalizeText(user?.name, 120);
    if (!normalizedUserId) missing.push('Remetente não definido');
    else if (!name) missing.push('Nome');

    const profile = normalizedUserId ? await this.getRaw(normalizedUserId) : null;
    const jobTitle = normalizeText(profile?.jobTitle, 80);
    if (!jobTitle) missing.push('Cargo');
    const phone = normalizeText(profile?.phone, 40);
    if (!phone) missing.push('Telefone');
    const website = normalizeText(profile?.website, 180);

    const company = normalizedCompanyId
      ? await this.prisma.company.findUnique({ where: { id: normalizedCompanyId }, select: { name: true } }).catch(() => null)
      : null;
    const companyName = normalizeText(company?.name, 180);

    return { ready: missing.length === 0, missing, name, jobTitle, phone, website, companyName };
  }

  async getPublicState(userId: number, companyId: number) {
    return this.resolveSummary(userId, companyId);
  }

  async save(userId: number, companyId: number, input: SaveSenderIdentityInput) {
    const normalizedUserId = Math.trunc(Number(userId || 0));
    const normalizedCompanyId = Math.trunc(Number(companyId || 0));
    if (!normalizedUserId || !normalizedCompanyId || !(await this.canUseTable())) {
      return this.getPublicState(normalizedUserId, normalizedCompanyId);
    }
    const data = {
      jobTitle: input.jobTitle !== undefined ? normalizeText(input.jobTitle, 80) : undefined,
      phone: input.phone !== undefined ? normalizeText(input.phone, 40) : undefined,
      website: input.website !== undefined ? normalizeText(input.website, 180) : undefined,
    };
    await (this.prisma as any).userSenderProfile.upsert({
      where: { userId: normalizedUserId },
      create: { userId: normalizedUserId, companyId: normalizedCompanyId, ...data },
      update: data,
    }).catch((error: any) => {
      this.logger.warn(`sender_identity_save_failed user=${normalizedUserId}: ${String(error?.message || error)}`);
    });
    return this.getPublicState(normalizedUserId, normalizedCompanyId);
  }

  // Assinatura sóbria: nome / cargo | empresa / telefone / site — sem banner, sem
  // logo pesado, sem lista de links (decisão do dono, 06-email-v1.md). Retorna null
  // quando `summary.ready` é false (quem chama nunca deveria pedir HTML sem checar
  // ready antes, mas o guard aqui é redundância barata).
  buildSignatureHtml(summary: SenderIdentitySummary): string | null {
    if (!summary.ready || !summary.name) return null;
    const roleLine = [summary.jobTitle, summary.companyName].filter(Boolean).join(' | ');
    const websiteHref = summary.website ? normalizeWebsiteHref(summary.website) : null;
    const lines = [
      `<strong style="color:#111827">${this.emailTemplates.escapeHtml(summary.name)}</strong>`,
      roleLine ? this.emailTemplates.escapeHtml(roleLine) : '',
      summary.phone ? this.emailTemplates.escapeHtml(summary.phone) : '',
      websiteHref
        ? `<a href="${websiteHref}" style="color:#0f766e;text-decoration:none">${this.emailTemplates.escapeHtml(summary.website || '')}</a>`
        : '',
    ].filter(Boolean);
    return [
      '<div style="margin-top:18px;padding-top:12px;border-top:1px solid #e5e7eb;',
      'font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#374151">',
      lines.join('<br>'),
      '</div>',
    ].join('');
  }

  buildSignatureText(summary: SenderIdentitySummary): string | null {
    if (!summary.ready || !summary.name) return null;
    const roleLine = [summary.jobTitle, summary.companyName].filter(Boolean).join(' | ');
    return ['--', summary.name, roleLine, summary.phone, summary.website].filter(Boolean).join('\n');
  }

  buildOptOutFooterHtml(): string {
    return [
      '<div style="margin-top:10px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b7280">',
      this.emailTemplates.escapeHtml(COMMERCIAL_EMAIL_OPT_OUT_LINE),
      '</div>',
    ].join('');
  }

  // HTML combinado (assinatura + frase de saída) pronto pra virar `appendHtml` de
  // EmailTemplateService.buildHtmlEmail. Só usar quando `summary.ready`.
  buildCommercialFooterHtml(summary: SenderIdentitySummary): string {
    return [this.buildSignatureHtml(summary), this.buildOptOutFooterHtml()].filter(Boolean).join('');
  }

  buildCommercialFooterText(summary: SenderIdentitySummary): string {
    return [this.buildSignatureText(summary), COMMERCIAL_EMAIL_OPT_OUT_LINE].filter(Boolean).join('\n\n');
  }
}
