import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isHbxPlatformCompany } from '../common/hbx-platform-company';
import { PrismaService } from '../prisma/prisma.service';
import {
  EMAIL_TEMPLATE_VARIABLES,
  EmailTemplate,
  EmailTemplateKind,
  EmailTemplateService,
  EmailTemplateVariables,
} from './email-template.service';

// PR12062026005: templates de e-mail POR EMPRESA.
// - Admin cria ("+"), edita e REMOVE templates próprios (kind tpl_*).
// - Os prontos do Master NÃO são copiados pra ninguém — exceto
//   seller_welcome / seller_onboarding_request, semeados SÓ pra empresa HBX
//   (isSeeded=true: não removem, têm "restaurar padrão").

export const HBX_SEEDED_TEMPLATE_KINDS = ['seller_welcome', 'seller_onboarding_request'] as const;

const SEEDED_LABELS: Record<string, string> = {
  seller_welcome: 'Boas-vindas do vendedor',
  seller_onboarding_request: 'Onboarding do vendedor',
};

export type CompanyEmailTemplatePayload = {
  kind: string;
  label: string;
  subject: string;
  text: string;
  html: string | null;
  isSeeded: boolean;
  updatedAt: string | null;
  variables: string[];
  variableDefinitions: typeof EMAIL_TEMPLATE_VARIABLES;
  requiredVariable: string | null;
  usesSignature: boolean;
  usesAttachment: boolean;
};

function slugifyLabel(label: string) {
  const base = String(label || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return base || 'template';
}

@Injectable()
export class CompanyEmailTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailTemplates: EmailTemplateService,
  ) {}

  private isSeededKind(kind: string) {
    return (HBX_SEEDED_TEMPLATE_KINDS as readonly string[]).includes(kind);
  }

  private variableDefinitionsFor(kind: string) {
    if (this.isSeededKind(kind)) {
      return this.emailTemplates.getVariableDefinitions(kind as EmailTemplateKind);
    }
    // custom: só variáveis sem restrição de kind (genéricas de contato/card/links/sistema)
    return EMAIL_TEMPLATE_VARIABLES.filter((variable) => !variable.kinds);
  }

  formatForApi(row: { kind: string; label: string; subject: string; text: string; html: string | null; isSeeded: boolean; updatedAt: Date | null }): CompanyEmailTemplatePayload {
    const definitions = this.variableDefinitionsFor(row.kind);
    return {
      kind: row.kind,
      label: row.label,
      subject: row.subject,
      text: row.text,
      html: row.html,
      isSeeded: row.isSeeded,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      variables: definitions.map((variable) => variable.token),
      variableDefinitions: definitions,
      requiredVariable: this.isSeededKind(row.kind)
        ? this.emailTemplates.getRequiredVariable(row.kind as EmailTemplateKind)
        : null,
      usesSignature: true,
      usesAttachment: !row.isSeeded,
    };
  }

  // semeia as cópias da HBX a partir do template ATUAL do Master (com as
  // personalizações dele), uma única vez; restaurar volta ao padrão do kind
  async ensureSeeded(companyId: number) {
    if (!isHbxPlatformCompany(companyId)) return;
    for (const kind of HBX_SEEDED_TEMPLATE_KINDS) {
      const existing = await this.prisma.companyEmailTemplate.findUnique({
        where: { companyId_kind: { companyId, kind } },
        select: { id: true },
      });
      if (existing) continue;
      const source = await this.emailTemplates.getTemplateSafe(kind);
      await this.prisma.companyEmailTemplate.create({
        data: {
          companyId,
          kind,
          label: SEEDED_LABELS[kind] || kind,
          subject: source.subject,
          text: source.text,
          html: source.html || null,
          isSeeded: true,
        },
      });
    }
  }

  async list(companyId: number) {
    await this.ensureSeeded(companyId);
    const rows = await this.prisma.companyEmailTemplate.findMany({
      where: { companyId },
      orderBy: [{ isSeeded: 'desc' }, { label: 'asc' }],
    });
    return rows.map((row) => this.formatForApi(row));
  }

  async getRow(companyId: number, kind: string) {
    const normalized = String(kind || '').trim();
    if (!normalized) throw new BadRequestException('Template inválido.');
    const row = await this.prisma.companyEmailTemplate.findUnique({
      where: { companyId_kind: { companyId, kind: normalized } },
    });
    if (!row) throw new NotFoundException('Template não encontrado.');
    return row;
  }

  async getSafe(companyId: number, kind: string) {
    await this.ensureSeeded(companyId);
    return this.getRow(companyId, kind);
  }

  private validateInput(kind: string, isSeeded: boolean, subject: string, text: string) {
    if (isSeeded) {
      // mantém as regras do kind pronto (ex.: seller_welcome exige {acesso}+{senha})
      this.emailTemplates.validateTemplateInput(kind as EmailTemplateKind, subject, text);
      return;
    }
    if (!subject) throw new BadRequestException('Informe o assunto do template.');
    if (subject.length > 180) throw new BadRequestException('O assunto pode ter no máximo 180 caracteres.');
    if (!text) throw new BadRequestException('Informe o corpo do template.');
    if (text.length > 12000) throw new BadRequestException('O corpo pode ter no máximo 12000 caracteres.');
  }

  async create(companyId: number, input: { label?: unknown; subject?: unknown; text?: unknown }) {
    const label = String(input.label || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!label || label.length < 3) throw new BadRequestException('Dê um nome ao template (mínimo 3 letras).');

    const subject = this.emailTemplates.normalizeSubject(input.subject) || label;
    const text = this.emailTemplates.normalizeText(input.text)
      || ['{saudacao}, {nome}!', '', 'Escreva aqui o corpo do seu e-mail.', '', 'Atenciosamente,', '{empresa}'].join('\n');
    this.validateInput('custom', false, subject, text);

    const baseKind = `tpl_${slugifyLabel(label)}`;
    let kind = baseKind;
    for (let i = 2; i <= 50; i += 1) {
      const clash = await this.prisma.companyEmailTemplate.findUnique({
        where: { companyId_kind: { companyId, kind } },
        select: { id: true },
      });
      if (!clash) break;
      kind = `${baseKind}_${i}`;
    }

    const row = await this.prisma.companyEmailTemplate.create({
      data: { companyId, kind, label, subject, text, isSeeded: false },
    });
    return this.formatForApi(row);
  }

  async save(companyId: number, kind: string, input: { subject?: unknown; text?: unknown; html?: unknown; label?: unknown }) {
    const row = await this.getRow(companyId, kind);
    const subject = this.emailTemplates.normalizeSubject(input.subject);
    const text = this.emailTemplates.normalizeText(input.text);
    const html = this.emailTemplates.sanitizeHtml(String(input.html || ''));
    this.validateInput(row.kind, row.isSeeded, subject, text);
    if (html.length > 50000) throw new BadRequestException('O HTML pode ter no máximo 50000 caracteres.');

    const label = row.isSeeded
      ? row.label
      : String(input.label || row.label).replace(/\s+/g, ' ').trim().slice(0, 120) || row.label;

    const updated = await this.prisma.companyEmailTemplate.update({
      where: { id: row.id },
      data: { subject, text, html: html || null, label },
    });
    return this.formatForApi(updated);
  }

  async remove(companyId: number, kind: string) {
    const row = await this.getRow(companyId, kind);
    if (row.isSeeded) {
      throw new BadRequestException('Template padrão do sistema não pode ser removido — use "Restaurar padrão".');
    }
    await this.prisma.companyEmailTemplate.delete({ where: { id: row.id } });
    return { ok: true };
  }

  async restore(companyId: number, kind: string) {
    const row = await this.getRow(companyId, kind);
    if (!row.isSeeded) {
      throw new BadRequestException('Só templates padrão têm "Restaurar" — os seus você edita ou remove.');
    }
    const fallback = this.emailTemplates.getDefaultTemplate(row.kind as EmailTemplateKind);
    const updated = await this.prisma.companyEmailTemplate.update({
      where: { id: row.id },
      data: { subject: fallback.subject, text: fallback.text, html: fallback.html || null },
    });
    return this.formatForApi(updated);
  }

  renderRow(
    row: { kind: string; subject: string; text: string; html: string | null },
    variables: EmailTemplateVariables,
    options?: { appendHtml?: string | null },
  ) {
    const template: EmailTemplate = {
      kind: row.kind as EmailTemplateKind,
      subject: row.subject,
      text: row.text,
      html: row.html,
    };
    return this.emailTemplates.renderTemplate(template, variables, options);
  }
}
