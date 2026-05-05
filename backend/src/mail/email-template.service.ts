import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

export type EmailTemplateKind = 'normal' | 'password_reset' | 'email_confirmation';

export type EmailTemplate = {
  kind: EmailTemplateKind;
  subject: string;
  text: string;
  html?: string | null;
  updatedAt?: string | null;
};

export type EmailTemplateVariables = {
  nome?: string | null;
  email?: string | null;
  empresa?: string | null;
  linkRecuperacao?: string | null;
  linkConfirmacao?: string | null;
  ano?: string | number | null;
};

const TEMPLATE_DIR = join(process.cwd(), 'storage', 'master-email');
const TEMPLATE_PATH = join(TEMPLATE_DIR, 'templates.json');

export const EMAIL_TEMPLATE_KINDS: EmailTemplateKind[] = ['normal', 'password_reset', 'email_confirmation'];

const DEFAULT_TEMPLATES: Record<EmailTemplateKind, EmailTemplate> = {
  normal: {
    kind: 'normal',
    subject: 'Apresentação HBX System',
    text: [
      'Boa tarde, tudo bem {{nome}}?',
      '',
      'Recebi seu contato e queria te apresentar rapidamente o HBX, um sistema que ajuda empresas a se organizarem melhor, venderem mais e automatizarem processos.',
      '',
      'O HBX reúne CRM, localização de clientes, cards comerciais, WhatsApp automático com IA e bot para prospecções.',
      '',
      'Segue uma pequena apresentação em anexo. Em uma conversa rápida eu consigo te mostrar as principais telas do sistema e explicar como ele pode ajudar sua empresa. O teste é gratuito por 30 dias.',
      '',
      'Qualquer dúvida, fico à disposição.',
      '',
      'Atenciosamente,',
      'Jhonatan | HBX',
    ].join('\n'),
    html: null,
    updatedAt: null,
  },
  password_reset: {
    kind: 'password_reset',
    subject: 'Recuperação de senha HBX',
    text: [
      'Olá, {{nome}}.',
      '',
      'Recebemos uma solicitação para redefinir a senha da sua conta HBX.',
      '',
      'Para criar uma nova senha, acesse o link abaixo:',
      '',
      '{{linkRecuperacao}}',
      '',
      'Se você não solicitou essa recuperação, ignore este email.',
      '',
      'Atenciosamente,',
      'Equipe HBX',
    ].join('\n'),
    html: null,
    updatedAt: null,
  },
  email_confirmation: {
    kind: 'email_confirmation',
    subject: 'Confirme seu email no HBX',
    text: [
      'Olá, {{nome}}.',
      '',
      'Seu cadastro no HBX foi criado com sucesso.',
      '',
      'Empresa/conta: {{empresa}}',
      '',
      'Para liberar seu acesso, confirme seu email no link abaixo:',
      '',
      '{{linkConfirmacao}}',
      '',
      'Se você não solicitou este cadastro, ignore esta mensagem.',
      '',
      'Atenciosamente,',
      'Equipe HBX',
    ].join('\n'),
    html: null,
    updatedAt: null,
  },
};

@Injectable()
export class EmailTemplateService {
  private readonly logger = new Logger(EmailTemplateService.name);

  getDefaultTemplate(kind: EmailTemplateKind) {
    return { ...DEFAULT_TEMPLATES[this.normalizeKind(kind)] };
  }

  getAvailableVariables(kind: EmailTemplateKind) {
    if (kind === 'password_reset') return ['{{nome}}', '{{email}}', '{{linkRecuperacao}}', '{{ano}}'];
    if (kind === 'email_confirmation') return ['{{nome}}', '{{empresa}}', '{{email}}', '{{linkConfirmacao}}', '{{ano}}'];
    return ['{{nome}}', '{{email}}', '{{empresa}}', '{{ano}}'];
  }

  getRequiredVariable(kind: EmailTemplateKind) {
    if (kind === 'password_reset') return '{{linkRecuperacao}}';
    if (kind === 'email_confirmation') return '{{linkConfirmacao}}';
    return null;
  }

  normalizeKind(value: unknown): EmailTemplateKind {
    const kind = String(value || '').trim() as EmailTemplateKind;
    if (!EMAIL_TEMPLATE_KINDS.includes(kind)) {
      throw new BadRequestException('Template de email inválido.');
    }
    return kind;
  }

  normalizeSubject(value: unknown) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  normalizeText(value: unknown) {
    return String(value || '').replace(/\r\n/g, '\n').trim();
  }

  validateTemplateInput(kind: EmailTemplateKind, subject: string, text: string) {
    if (!subject) throw new BadRequestException('Informe o assunto do template.');
    if (subject.length > 180) throw new BadRequestException('O assunto pode ter no máximo 180 caracteres.');
    if (!text) throw new BadRequestException('Informe o corpo do template.');
    if (text.length > 12000) throw new BadRequestException('O corpo pode ter no máximo 12000 caracteres.');

    const requiredVariable = this.getRequiredVariable(kind);
    if (requiredVariable && !text.includes(requiredVariable)) {
      throw new BadRequestException(`Este template precisa conter ${requiredVariable}.`);
    }
  }

  escapeHtml(value: string) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  textToHtml(text: string) {
    return this.escapeHtml(text)
      .split('\n')
      .map((line) => (line ? line : '&nbsp;'))
      .join('<br>');
  }

  sanitizeHtml(html: string) {
    return String(html || '')
      .replace(/<\s*(script|style|iframe|object|embed|meta|link)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<\s*(script|style|iframe|object|embed|meta|link)\b[^>]*\/?\s*>/gi, '')
      .replace(/\s+on[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, '')
      .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')
      .replace(/javascript:/gi, '')
      .trim();
  }

  renderString(value: string, variables: EmailTemplateVariables) {
    const map: Record<string, string> = {
      nome: String(variables.nome || 'cliente'),
      email: String(variables.email || ''),
      empresa: String(variables.empresa || ''),
      linkRecuperacao: String(variables.linkRecuperacao || ''),
      linkConfirmacao: String(variables.linkConfirmacao || ''),
      ano: String(variables.ano || new Date().getFullYear()),
    };

    return String(value || '').replace(/\{\{\s*(nome|email|empresa|linkRecuperacao|linkConfirmacao|ano)\s*\}\}/g, (_, key: string) => map[key] || '');
  }

  buildHtmlEmail(text: string, options?: { html?: string | null; appendHtml?: string | null }) {
    const content = this.sanitizeHtml(options?.html || '') || this.textToHtml(text);
    const appendHtml = this.sanitizeHtml(options?.appendHtml || '');
    return [
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111827">',
      content,
      appendHtml ? `<div style="margin-top:18px">${appendHtml}</div>` : '',
      '</div>',
    ].join('');
  }

  async listTemplates() {
    const stored = await this.readStoredTemplates();
    return EMAIL_TEMPLATE_KINDS.map((kind) => this.mergeTemplate(kind, stored[kind]));
  }

  async getTemplate(kindInput: EmailTemplateKind) {
    const kind = this.normalizeKind(kindInput);
    const stored = await this.readStoredTemplates();
    return this.mergeTemplate(kind, stored[kind]);
  }

  async getTemplateSafe(kindInput: EmailTemplateKind) {
    const kind = this.normalizeKind(kindInput);
    try {
      const template = await this.getTemplate(kind);
      this.validateTemplateInput(kind, template.subject, template.text);
      return template;
    } catch (error) {
      this.logger.warn(`Falling back to default ${kind} email template: ${error instanceof Error ? error.message : error}`);
      return this.getDefaultTemplate(kind);
    }
  }

  async saveTemplate(kindInput: EmailTemplateKind, input: { subject?: unknown; text?: unknown; html?: unknown }) {
    const kind = this.normalizeKind(kindInput);
    const subject = this.normalizeSubject(input.subject);
    const text = this.normalizeText(input.text);
    const html = this.sanitizeHtml(String(input.html || ''));
    this.validateTemplateInput(kind, subject, text);
    if (html.length > 50000) throw new BadRequestException('O HTML pode ter no máximo 50000 caracteres.');

    const stored = await this.readStoredTemplates();
    const template: EmailTemplate = {
      kind,
      subject,
      text,
      html: html || null,
      updatedAt: new Date().toISOString(),
    };
    stored[kind] = template;
    await this.writeStoredTemplates(stored);
    return this.mergeTemplate(kind, template);
  }

  async restoreTemplate(kindInput: EmailTemplateKind) {
    const kind = this.normalizeKind(kindInput);
    const stored = await this.readStoredTemplates();
    delete stored[kind];
    await this.writeStoredTemplates(stored);
    return this.getDefaultTemplate(kind);
  }

  renderTemplate(template: EmailTemplate, variables: EmailTemplateVariables, options?: { appendHtml?: string | null }) {
    const subject = this.renderString(template.subject, variables);
    const text = this.renderString(template.text, variables);
    const renderedHtml = template.html ? this.renderString(template.html, variables) : null;
    return {
      subject,
      text,
      html: this.buildHtmlEmail(text, {
        html: renderedHtml,
        appendHtml: options?.appendHtml || null,
      }),
    };
  }

  private mergeTemplate(kind: EmailTemplateKind, stored?: Partial<EmailTemplate> | null): EmailTemplate {
    const fallback = this.getDefaultTemplate(kind);
    return {
      kind,
      subject: this.normalizeSubject(stored?.subject) || fallback.subject,
      text: this.normalizeText(stored?.text) || fallback.text,
      html: stored?.html ? this.sanitizeHtml(String(stored.html)) : null,
      updatedAt: stored?.updatedAt ? String(stored.updatedAt) : null,
    };
  }

  private async readStoredTemplates(): Promise<Partial<Record<EmailTemplateKind, EmailTemplate>>> {
    if (!existsSync(TEMPLATE_PATH)) return {};
    try {
      const parsed = JSON.parse(await readFile(TEMPLATE_PATH, 'utf8'));
      if (!parsed || typeof parsed !== 'object') return {};
      return parsed.templates && typeof parsed.templates === 'object' ? parsed.templates : parsed;
    } catch (error) {
      this.logger.warn(`Failed to read email templates storage: ${error instanceof Error ? error.message : error}`);
      return {};
    }
  }

  private async writeStoredTemplates(templates: Partial<Record<EmailTemplateKind, EmailTemplate>>) {
    await mkdir(TEMPLATE_DIR, { recursive: true });
    await writeFile(TEMPLATE_PATH, JSON.stringify({ templates }, null, 2), 'utf8');
  }
}
