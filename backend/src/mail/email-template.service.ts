import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

export type EmailTemplateKind = 'normal' | 'password_reset' | 'email_confirmation' | 'seller_welcome';

export type EmailTemplate = {
  kind: EmailTemplateKind;
  subject: string;
  text: string;
  html?: string | null;
  updatedAt?: string | null;
};

export type EmailTemplateVariableDefinition = {
  key: string;
  token: string;
  label: string;
  group: 'contato' | 'vendedor' | 'card' | 'links' | 'sistema';
  description: string;
  kinds?: EmailTemplateKind[];
};

export type EmailTemplateVariables = {
  nome?: string | null;
  primeironome?: string | null;
  email?: string | null;
  empresa?: string | null;
  linkRecuperacao?: string | null;
  linkConfirmacao?: string | null;
  acesso?: string | null;
  senha?: string | null;
  linkAcesso?: string | null;
  linkMobile?: string | null;
  tipoAcesso?: string | null;
  ano?: string | number | null;
  vendedor?: string | null;
  emailvendedor?: string | null;
  senhavendedor?: string | null;
  comissao?: string | number | null;
  comissaoheranca?: string | number | null;
  d3?: string | null;
  diascomissao?: string | number | null;
  sellerName?: string | null;
  sellerCpf?: string | null;
  sellerEmail?: string | null;
  sellerPhone?: string | null;
  sellerAddress?: string | null;
  commissionPercent?: string | number | null;
  commissionDueBusinessDays?: string | number | null;
  contractDate?: string | null;
  saudacao?: string | null;
  nomecard?: string | null;
  razaosocialcard?: string | null;
  telefonecard?: string | null;
  whatsappcard?: string | null;
  emailcard?: string | null;
  cidadecard?: string | null;
  estadocard?: string | null;
  enderecocard?: string | null;
  bairrocard?: string | null;
  segmentocard?: string | null;
  sitecard?: string | null;
  instagramcard?: string | null;
  facebookcard?: string | null;
  responsavelcard?: string | null;
  observacaocard?: string | null;
};

const TEMPLATE_DIR = join(process.cwd(), 'storage', 'master-email');
const TEMPLATE_PATH = join(TEMPLATE_DIR, 'templates.json');

export const EMAIL_TEMPLATE_KINDS: EmailTemplateKind[] = ['normal', 'password_reset', 'email_confirmation', 'seller_welcome'];

const EMAIL_TEMPLATE_VARIABLES: EmailTemplateVariableDefinition[] = [
  { key: 'nome', token: '{nome}', label: 'Nome do contato', group: 'contato', description: 'Nome da pessoa que vai receber a mensagem.' },
  { key: 'primeironome', token: '{primeironome}', label: 'Primeiro nome', group: 'contato', description: 'Primeiro nome do contato para cumprimentos naturais.' },
  { key: 'email', token: '{email}', label: 'E-mail do contato', group: 'contato', description: 'E-mail principal do destinatário.' },
  { key: 'empresa', token: '{empresa}', label: 'Empresa', group: 'contato', description: 'Empresa ou conta relacionada ao contato.' },
  { key: 'vendedor', token: '{vendedor}', label: 'Vendedor', group: 'vendedor', description: 'Nome do vendedor cadastrado.', kinds: ['seller_welcome'] },
  { key: 'acesso', token: '{acesso}', label: 'Acesso', group: 'vendedor', description: 'Login do vendedor ou usuário.', kinds: ['seller_welcome'] },
  { key: 'senha', token: '{senha}', label: 'Senha', group: 'vendedor', description: 'Senha temporária gerada no cadastro.', kinds: ['seller_welcome'] },
  { key: 'emailvendedor', token: '{emailvendedor}', label: 'E-mail vendedor', group: 'vendedor', description: 'Alias do login/e-mail do vendedor.', kinds: ['seller_welcome'] },
  { key: 'senhavendedor', token: '{senhavendedor}', label: 'Senha vendedor', group: 'vendedor', description: 'Alias da senha temporária do vendedor.', kinds: ['seller_welcome'] },
  { key: 'comissao', token: '{comissao}', label: 'Comissão', group: 'vendedor', description: 'Percentual direto do vendedor: quanto ele recebe sobre vendas/clientes que fechar.' },
  { key: 'comissaoheranca', token: '{comissaoheranca}', label: 'Comissão herança', group: 'vendedor', description: 'Percentual herdado/por indicação: comissão vinculada à rede de vendedores indicados.' },
  { key: 'd3', token: '{d3}', label: 'D3', group: 'vendedor', description: 'Prazo de liberação da comissão. No padrão HBX, D3 significa D+3 dias úteis após a confirmação.' },
  { key: 'diascomissao', token: '{diascomissao}', label: 'Dias comissão', group: 'vendedor', description: 'Número de dias úteis do prazo de comissão, usado para montar frases como D+3.' },
  { key: 'sellerName', token: '{{sellerName}}', label: 'Nome contrato', group: 'vendedor', description: 'Nome do parceiro comercial no contrato.' },
  { key: 'sellerCpf', token: '{{sellerCpf}}', label: 'CPF contrato', group: 'vendedor', description: 'CPF do parceiro no contrato.' },
  { key: 'sellerEmail', token: '{{sellerEmail}}', label: 'E-mail contrato', group: 'vendedor', description: 'E-mail do parceiro no contrato.' },
  { key: 'sellerPhone', token: '{{sellerPhone}}', label: 'Telefone contrato', group: 'vendedor', description: 'Telefone/WhatsApp do parceiro no contrato.' },
  { key: 'sellerAddress', token: '{{sellerAddress}}', label: 'Endereço contrato', group: 'vendedor', description: 'Endereço declarado do parceiro no contrato.' },
  { key: 'commissionPercent', token: '{{commissionPercent}}', label: 'Comissão contrato', group: 'vendedor', description: 'Percentual de comissão usado no contrato, sem editar o texto base.' },
  { key: 'commissionDueBusinessDays', token: '{{commissionDueBusinessDays}}', label: 'Prazo contrato', group: 'vendedor', description: 'Prazo em dias úteis usado no contrato.' },
  { key: 'contractDate', token: '{{contractDate}}', label: 'Data contrato', group: 'sistema', description: 'Data de geração ou aceite do contrato.' },
  { key: 'nomecard', token: '{nomecard}', label: 'Nome do card', group: 'card', description: 'Nome da empresa ou lead exibido no card comercial.' },
  { key: 'razaosocialcard', token: '{razaosocialcard}', label: 'Razão social', group: 'card', description: 'Razão social do card quando existir.' },
  { key: 'telefonecard', token: '{telefonecard}', label: 'Telefone', group: 'card', description: 'Telefone público do card.' },
  { key: 'whatsappcard', token: '{whatsappcard}', label: 'WhatsApp', group: 'card', description: 'WhatsApp do card para abordagem do bot.' },
  { key: 'emailcard', token: '{emailcard}', label: 'E-mail do card', group: 'card', description: 'E-mail público ou comercial do card.' },
  { key: 'cidadecard', token: '{cidadecard}', label: 'Cidade', group: 'card', description: 'Cidade do lead/card.' },
  { key: 'estadocard', token: '{estadocard}', label: 'Estado', group: 'card', description: 'UF ou estado do lead/card.' },
  { key: 'enderecocard', token: '{enderecocard}', label: 'Endereço', group: 'card', description: 'Endereço do card quando disponível.' },
  { key: 'bairrocard', token: '{bairrocard}', label: 'Bairro', group: 'card', description: 'Bairro do lead/card.' },
  { key: 'segmentocard', token: '{segmentocard}', label: 'Segmento', group: 'card', description: 'Segmento comercial do card.' },
  { key: 'sitecard', token: '{sitecard}', label: 'Site', group: 'card', description: 'Site encontrado no card.' },
  { key: 'instagramcard', token: '{instagramcard}', label: 'Instagram', group: 'card', description: 'Instagram do card quando existir.' },
  { key: 'facebookcard', token: '{facebookcard}', label: 'Facebook', group: 'card', description: 'Facebook do card quando existir.' },
  { key: 'responsavelcard', token: '{responsavelcard}', label: 'Responsável', group: 'card', description: 'Responsável pelo contato quando identificado.' },
  { key: 'observacaocard', token: '{observacaocard}', label: 'Observação', group: 'card', description: 'Resumo ou observação operacional do card.' },
  { key: 'linkAcesso', token: '{linkAcesso}', label: 'Link desktop', group: 'links', description: 'Link de acesso desktop ao HBX.' },
  { key: 'linkMobile', token: '{linkMobile}', label: 'Link mobile', group: 'links', description: 'Link de acesso mobile ao HBX.' },
  { key: 'linkRecuperacao', token: '{linkRecuperacao}', label: 'Link recuperação', group: 'links', description: 'Link de recuperação de senha.', kinds: ['password_reset'] },
  { key: 'linkConfirmacao', token: '{linkConfirmacao}', label: 'Link confirmação', group: 'links', description: 'Link de confirmação de e-mail.', kinds: ['email_confirmation'] },
  { key: 'tipoAcesso', token: '{tipoAcesso}', label: 'Tipo de acesso', group: 'sistema', description: 'Tipo de perfil criado no HBX.', kinds: ['seller_welcome'] },
  { key: 'saudacao', token: '{saudacao}', label: 'Saudação', group: 'sistema', description: 'Saudação pronta, como Bom dia, Boa tarde ou Boa noite.' },
  { key: 'ano', token: '{ano}', label: 'Ano', group: 'sistema', description: 'Ano atual.' },
];

const EMAIL_TEMPLATE_VARIABLE_KEYS = EMAIL_TEMPLATE_VARIABLES.map((variable) => variable.key);

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
      'Segue uma pequena apresentação em anexo. Em uma conversa rápida eu consigo te mostrar as principais telas do sistema e explicar como ele pode ajudar sua empresa. O teste é gratuito por 7 dias.',
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
  seller_welcome: {
    kind: 'seller_welcome',
    subject: 'Bem-vindo à equipe HBX, {vendedor}',
    text: [
      'Olá {vendedor}, seja bem-vindo à equipe HBX.',
      '',
      'Seu cadastro como vendedor HBX foi realizado com sucesso e seu acesso já está pronto.',
      '',
      'Seu acesso é {acesso}',
      'Senha temporária: {senha}',
      '',
      'Sua comissão direta: {comissao}',
      'Comissão por herança/indicação: {comissaoheranca}',
      'Liberação da comissão: {d3}',
      '',
      'No primeiro login, pedimos a gentileza de trocar essa senha temporária. O HBX vai direcionar você para essa etapa antes de liberar a rotina comercial.',
      '',
      'Acesse pelo desktop: {{linkAcesso}}',
      'Acesse pelo mobile: {{linkMobile}}',
      '',
      'Use o mobile para acompanhar seus leads, retornar contatos e manter seu funil atualizado durante o dia.',
      '',
      'Conte com a gente e boas vendas.',
      '',
      'Equipe HBX',
    ].join('\n'),
    html: null,
    updatedAt: null,
  },
};

@Injectable()
export class EmailTemplateService {
  private readonly logger = new Logger(EmailTemplateService.name);
  private legacyMigrationChecked = false;

  constructor(private readonly prisma: PrismaService) {}

  getDefaultTemplate(kind: EmailTemplateKind) {
    return { ...DEFAULT_TEMPLATES[this.normalizeKind(kind)] };
  }

  getVariableDefinitions(kind: EmailTemplateKind) {
    const normalizedKind = this.normalizeKind(kind);
    return EMAIL_TEMPLATE_VARIABLES.filter((variable) => !variable.kinds || variable.kinds.includes(normalizedKind));
  }

  getAvailableVariables(kind: EmailTemplateKind) {
    return this.getVariableDefinitions(kind).map((variable) => variable.token);
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
    const requiredKey = requiredVariable ? requiredVariable.replace(/[{}]/g, '').trim() : null;
    if (requiredKey && !this.textHasVariable(text, requiredKey)) {
      throw new BadRequestException(`Este template precisa conter ${requiredVariable}.`);
    }
    const hasSellerAccess = this.textHasAnyVariable(text, ['acesso', 'emailvendedor']);
    const hasSellerPassword = this.textHasAnyVariable(text, ['senha', 'senhavendedor']);
    if (kind === 'seller_welcome' && (!hasSellerAccess || !hasSellerPassword)) {
      throw new BadRequestException('Este template precisa conter {acesso} e {senha}.');
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
    const nome = String(variables.nome || variables.vendedor || variables.nomecard || 'cliente');
    const primeiroNome = String(variables.primeironome || nome.split(/\s+/)[0] || nome);
    const acesso = String(variables.acesso || variables.emailvendedor || variables.email || '');
    const senha = String(variables.senha || variables.senhavendedor || '');
    const empresa = String(variables.empresa || variables.nomecard || '');
    const map: Record<string, string> = {
      nome,
      primeironome: primeiroNome,
      email: String(variables.email || ''),
      empresa,
      linkRecuperacao: String(variables.linkRecuperacao || ''),
      linkConfirmacao: String(variables.linkConfirmacao || ''),
      acesso,
      senha,
      linkAcesso: String(variables.linkAcesso || ''),
      linkMobile: String(variables.linkMobile || ''),
      tipoAcesso: String(variables.tipoAcesso || ''),
      ano: String(variables.ano || new Date().getFullYear()),
      vendedor: String(variables.vendedor || variables.nome || 'vendedor'),
      emailvendedor: acesso,
      senhavendedor: senha,
      comissao: this.formatPercentVariable(variables.comissao),
      comissaoheranca: this.formatPercentVariable(variables.comissaoheranca),
      d3: String(variables.d3 || `D+${Number(variables.diascomissao || 3) || 3} úteis`),
      diascomissao: String(variables.diascomissao || 3),
      sellerName: String(variables.sellerName || variables.vendedor || variables.nome || ''),
      sellerCpf: String(variables.sellerCpf || ''),
      sellerEmail: String(variables.sellerEmail || variables.emailvendedor || variables.acesso || variables.email || ''),
      sellerPhone: String(variables.sellerPhone || variables.telefonecard || ''),
      sellerAddress: String(variables.sellerAddress || ''),
      commissionPercent: this.formatPercentNumberOnly(variables.commissionPercent ?? variables.comissao),
      commissionDueBusinessDays: String(variables.commissionDueBusinessDays || variables.diascomissao || 3),
      contractDate: String(variables.contractDate || new Date().toLocaleDateString('pt-BR')),
      saudacao: String(variables.saudacao || this.defaultGreeting()),
      nomecard: String(variables.nomecard || variables.empresa || ''),
      razaosocialcard: String(variables.razaosocialcard || ''),
      telefonecard: String(variables.telefonecard || variables.whatsappcard || ''),
      whatsappcard: String(variables.whatsappcard || variables.telefonecard || ''),
      emailcard: String(variables.emailcard || ''),
      cidadecard: String(variables.cidadecard || ''),
      estadocard: String(variables.estadocard || ''),
      enderecocard: String(variables.enderecocard || ''),
      bairrocard: String(variables.bairrocard || ''),
      segmentocard: String(variables.segmentocard || ''),
      sitecard: String(variables.sitecard || ''),
      instagramcard: String(variables.instagramcard || ''),
      facebookcard: String(variables.facebookcard || ''),
      responsavelcard: String(variables.responsavelcard || ''),
      observacaocard: String(variables.observacaocard || ''),
    };

    return String(value || '').replace(this.variableRegex(), (_, doubleKey: string, singleKey: string) => {
      const key = String(doubleKey || singleKey || '').trim();
      return map[key] || '';
    });
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

  private variableRegex() {
    const keys = EMAIL_TEMPLATE_VARIABLE_KEYS.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    return new RegExp(`\\{\\{\\s*(${keys})\\s*\\}\\}|\\{\\s*(${keys})\\s*\\}`, 'g');
  }

  private textHasVariable(text: string, key: string) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}|\\{\\s*${escapedKey}\\s*\\}`).test(String(text || ''));
  }

  private textHasAnyVariable(text: string, keys: string[]) {
    return keys.some((key) => this.textHasVariable(text, key));
  }

  private defaultGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  private formatPercentVariable(value: unknown) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return '0%';
      return trimmed.includes('%') ? trimmed : `${trimmed}%`;
    }
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return '0%';
    return `${numeric.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
  }

  private formatPercentNumberOnly(value: unknown) {
    const formatted = this.formatPercentVariable(value);
    return formatted.replace(/\s*%$/, '');
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
    if (await this.canUseDatabaseStorage()) {
      await this.migrateLegacyTemplatesToDatabase();
      const rows = await this.prisma.masterEmailTemplate.findMany();
      const templates: Partial<Record<EmailTemplateKind, EmailTemplate>> = {};
      for (const row of rows) {
        const kind = this.safeKind(row.kind);
        if (!kind) continue;
        templates[kind] = {
          kind,
          subject: row.subject,
          text: row.text,
          html: row.html,
          updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
        };
      }
      return templates;
    }

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
    if (await this.canUseDatabaseStorage()) {
      await this.migrateLegacyTemplatesToDatabase();
      for (const kind of EMAIL_TEMPLATE_KINDS) {
        const template = templates[kind];
        if (!template) {
          await this.prisma.masterEmailTemplate.deleteMany({ where: { kind } });
          continue;
        }
        const normalized = this.mergeTemplate(kind, template);
        await this.prisma.masterEmailTemplate.upsert({
          where: { kind },
          create: {
            kind,
            subject: normalized.subject,
            text: normalized.text,
            html: normalized.html || null,
          },
          update: {
            subject: normalized.subject,
            text: normalized.text,
            html: normalized.html || null,
          },
        });
      }
      return;
    }

    await mkdir(TEMPLATE_DIR, { recursive: true });
    await writeFile(TEMPLATE_PATH, JSON.stringify({ templates }, null, 2), 'utf8');
  }

  private async canUseDatabaseStorage() {
    return this.prisma.hasTable('MasterEmailTemplate');
  }

  private safeKind(value: unknown): EmailTemplateKind | null {
    const kind = String(value || '').trim() as EmailTemplateKind;
    return EMAIL_TEMPLATE_KINDS.includes(kind) ? kind : null;
  }

  private async migrateLegacyTemplatesToDatabase() {
    if (this.legacyMigrationChecked) return;
    this.legacyMigrationChecked = true;
    if (!existsSync(TEMPLATE_PATH)) return;

    try {
      const parsed = JSON.parse(await readFile(TEMPLATE_PATH, 'utf8'));
      const stored = parsed?.templates && typeof parsed.templates === 'object' ? parsed.templates : parsed;
      if (!stored || typeof stored !== 'object') return;

      for (const kind of EMAIL_TEMPLATE_KINDS) {
        const legacyTemplate = stored[kind];
        if (!legacyTemplate) continue;
        const existing = await this.prisma.masterEmailTemplate.findUnique({
          where: { kind },
          select: { kind: true },
        });
        if (existing) continue;
        const normalized = this.mergeTemplate(kind, legacyTemplate);
        await this.prisma.masterEmailTemplate.create({
          data: {
            kind,
            subject: normalized.subject,
            text: normalized.text,
            html: normalized.html || null,
          },
        });
      }
    } catch (error) {
      this.logger.warn(`Failed to migrate legacy email template storage: ${error instanceof Error ? error.message : error}`);
    }
  }
}
