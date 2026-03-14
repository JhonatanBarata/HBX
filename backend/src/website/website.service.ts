import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { constants } from 'fs';
import { access, cp, mkdir, readFile, readdir, rm, writeFile } from 'fs/promises';
import { join, relative, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWebsiteProjectDto } from './dto/create-website-project.dto';
import { UpdateWebsiteProjectDto } from './dto/update-website-project.dto';

type WebsiteTemplate = {
  key: string;
  name: string;
  type?: string;
  hasFunctions?: boolean;
  sourcePath?: string;
  copiedAt?: string;
  templateRoot: string;
  sourceRoot: string;
};

type WebsiteProjectRecord = {
  companyId: number;
  companyName: string;
  companySlug: string;
  templateKey: string;
  templateName: string;
  firebaseProjectId?: string | null;
  status: 'CREATED';
  localPath: string;
  relativePath: string;
  createdAt: string;
  updatedAt: string;
};

type WebsiteProjectsState = {
  version: number;
  projects: WebsiteProjectRecord[];
};

@Injectable()
export class WebsiteService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly backendRoot = resolve(__dirname, '..', '..');
  private readonly kitRoot = join(this.backendRoot, 'website-kit');
  private readonly templatesRoot = join(this.kitRoot, 'templates');
  private readonly companiesRoot = join(this.kitRoot, 'companies');
  private readonly stateFilePath = join(this.kitRoot, 'projects.json');

  private normalizeSlug(input: string) {
    return String(input || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  private async fileExists(path: string) {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureBaseDirectories() {
    await mkdir(this.templatesRoot, { recursive: true });
    await mkdir(this.companiesRoot, { recursive: true });
  }

  private async readState(): Promise<WebsiteProjectsState> {
    await this.ensureBaseDirectories();
    const exists = await this.fileExists(this.stateFilePath);
    if (!exists) {
      return { version: 1, projects: [] };
    }

    try {
      const raw = await readFile(this.stateFilePath, 'utf8');
      const parsed = JSON.parse(raw.replace(/^\uFEFF/, '')) as WebsiteProjectsState;
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.projects)) {
        return { version: 1, projects: [] };
      }
      return {
        version: Number(parsed.version || 1),
        projects: parsed.projects,
      };
    } catch {
      return { version: 1, projects: [] };
    }
  }

  private async writeState(state: WebsiteProjectsState) {
    await this.ensureBaseDirectories();
    await writeFile(this.stateFilePath, JSON.stringify(state, null, 2), 'utf8');
  }

  private async resolveCompanyFromUser(user: any) {
    const companyId = Number(user?.companyId || 0);
    if (!companyId) throw new ForbiddenException('Empresa nao identificada no contexto do usuario');

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, slug: true },
    });
    if (!company) throw new NotFoundException('Empresa nao encontrada');

    const companySlug = this.normalizeSlug(company.slug || company.name || `empresa-${company.id}`) || `empresa-${company.id}`;
    return { id: company.id, name: company.name, slug: companySlug };
  }

  private async resolveCompanyForWebsite(user: any, overrideCompanyId?: number) {
    const requestedCompanyId = Number(overrideCompanyId || 0);
    const isSystemMaster = Boolean(user?.isSystemMaster);

    if (isSystemMaster) {
      if (!requestedCompanyId) {
        throw new BadRequestException('companyId e obrigatorio para o usuario MASTER no modulo Website');
      }

      const company = await this.prisma.company.findUnique({
        where: { id: requestedCompanyId },
        select: { id: true, name: true, slug: true },
      });
      if (!company) throw new NotFoundException('Empresa nao encontrada');

      const companySlug =
        this.normalizeSlug(company.slug || company.name || `empresa-${company.id}`) ||
        `empresa-${company.id}`;
      return { id: company.id, name: company.name, slug: companySlug };
    }

    const currentCompany = await this.resolveCompanyFromUser(user);
    if (requestedCompanyId && requestedCompanyId !== currentCompany.id) {
      throw new ForbiddenException('Este usuario nao pode operar websites de outra empresa');
    }
    return currentCompany;
  }

  private async readTemplateMeta(templateRoot: string): Promise<WebsiteTemplate | null> {
    const metaPath = join(templateRoot, 'template.json');
    const sourceRoot = join(templateRoot, 'source');
    const sourceExists = await this.fileExists(sourceRoot);
    if (!sourceExists) return null;

    const fallbackKey = templateRoot.split(/[\\/]/).pop() || 'template';
    const fallback: WebsiteTemplate = {
      key: fallbackKey,
      name: fallbackKey,
      templateRoot,
      sourceRoot,
    };

    const metaExists = await this.fileExists(metaPath);
    if (!metaExists) return fallback;

    try {
      const parsed = JSON.parse((await readFile(metaPath, 'utf8')).replace(/^\uFEFF/, '')) as Partial<WebsiteTemplate>;
      return {
        key: String(parsed.key || fallback.key),
        name: String(parsed.name || fallback.name),
        type: parsed.type ? String(parsed.type) : undefined,
        hasFunctions: Boolean(parsed.hasFunctions),
        sourcePath: parsed.sourcePath ? String(parsed.sourcePath) : undefined,
        copiedAt: parsed.copiedAt ? String(parsed.copiedAt) : undefined,
        templateRoot,
        sourceRoot,
      };
    } catch {
      return fallback;
    }
  }

  private async listTemplatesInternal() {
    await this.ensureBaseDirectories();
    const entries = await readdir(this.templatesRoot, { withFileTypes: true });

    const templates: WebsiteTemplate[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const templateRoot = join(this.templatesRoot, entry.name);
      const meta = await this.readTemplateMeta(templateRoot);
      if (!meta) continue;
      templates.push(meta);
    }

    templates.sort((a, b) => a.name.localeCompare(b.name));
    return templates;
  }

  private async applyFirebaseProjectIdIfProvided(sitePath: string, firebaseProjectId?: string) {
    const normalized = String(firebaseProjectId || '').trim();
    if (!normalized) return null;

    const firebasercPath = join(sitePath, '.firebaserc');
    let payload: any = { projects: { default: normalized } };

    if (await this.fileExists(firebasercPath)) {
      try {
        const current = JSON.parse(await readFile(firebasercPath, 'utf8'));
        payload = {
          ...current,
          projects: {
            ...(current?.projects || {}),
            default: normalized,
          },
        };
      } catch {
        payload = { projects: { default: normalized } };
      }
    }

    await writeFile(firebasercPath, JSON.stringify(payload, null, 2), 'utf8');
    return normalized;
  }

  private async writeWebsiteManifest(sitePath: string, project: WebsiteProjectRecord) {
    const manifestPath = join(sitePath, 'hbx.website.json');
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          company: {
            id: project.companyId,
            name: project.companyName,
            slug: project.companySlug,
          },
          template: {
            key: project.templateKey,
            name: project.templateName,
          },
          firebaseProjectId: project.firebaseProjectId || null,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  private async writeDeployGuide(sitePath: string, project: WebsiteProjectRecord) {
    const deployGuidePath = join(sitePath, 'HBX-DEPLOY.md');
    const firebaseProject = project.firebaseProjectId ? `\`${project.firebaseProjectId}\`` : '`SEU_FIREBASE_PROJECT_ID`';
    const lines = [
      '# Deploy do Website (HBX)',
      '',
      `Empresa: ${project.companyName} (#${project.companyId})`,
      `Template: ${project.templateName} (${project.templateKey})`,
      '',
      '## Passos',
      '1. Instalar Firebase CLI (uma vez): `npm i -g firebase-tools`',
      '2. Fazer login: `firebase login`',
      `3. Selecionar projeto Firebase: \`firebase use ${firebaseProject}\``,
      '4. Publicar hosting:',
      '   - sem functions: `firebase deploy --only hosting`',
      '   - com functions: `firebase deploy --only hosting,functions`',
      '',
      '## Observacoes',
      '- Este website foi provisionado automaticamente pelo modulo Website do HBX.',
      '- Ajuste `firebase-config.js`/`firebase-config.local.js` conforme o projeto Firebase da empresa.',
    ];
    await writeFile(deployGuidePath, `${lines.join('\n')}\n`, 'utf8');
  }

  private toProjectResponse(project: WebsiteProjectRecord) {
    return {
      ...project,
      deploy: {
        useCommand: project.firebaseProjectId ? `firebase use ${project.firebaseProjectId}` : 'firebase use <project-id>',
        hostingCommand: 'firebase deploy --only hosting',
        hostingFunctionsCommand: 'firebase deploy --only hosting,functions',
      },
    };
  }

  async listTemplates() {
    const templates = await this.listTemplatesInternal();
    return templates.map((template) => ({
      key: template.key,
      name: template.name,
      type: template.type || null,
      hasFunctions: Boolean(template.hasFunctions),
      sourcePath: template.sourcePath || null,
      copiedAt: template.copiedAt || null,
    }));
  }

  async getMyProject(user: any, companyId?: number) {
    const company = await this.resolveCompanyForWebsite(user, companyId);
    const state = await this.readState();
    const existing = state.projects.find((project) => project.companyId === company.id);
    return existing ? this.toProjectResponse(existing) : null;
  }

  async createMyProject(user: any, input: CreateWebsiteProjectDto) {
    const company = await this.resolveCompanyForWebsite(user, input?.companyId);
    const templateKey = String(input?.templateKey || '').trim();
    if (!templateKey) throw new BadRequestException('templateKey e obrigatorio');

    const templates = await this.listTemplatesInternal();
    const template = templates.find((item) => item.key === templateKey);
    if (!template) throw new BadRequestException(`Template '${templateKey}' nao encontrado`);

    const companyRoot = join(this.companiesRoot, company.slug);
    const sitePath = join(companyRoot, 'site');

    const siteExists = await this.fileExists(sitePath);
    if (siteExists && !input?.overwrite) {
      throw new BadRequestException('Este website ja existe para a empresa. Use overwrite=true para recriar.');
    }

    await mkdir(companyRoot, { recursive: true });
    if (siteExists && input?.overwrite) {
      await rm(sitePath, { recursive: true, force: true });
    }

    await cp(template.sourceRoot, sitePath, { recursive: true, force: true });
    const firebaseProjectId = await this.applyFirebaseProjectIdIfProvided(sitePath, input?.firebaseProjectId);

    const nowIso = new Date().toISOString();
    const projectRecord: WebsiteProjectRecord = {
      companyId: company.id,
      companyName: company.name,
      companySlug: company.slug,
      templateKey: template.key,
      templateName: template.name,
      firebaseProjectId: firebaseProjectId || null,
      status: 'CREATED',
      localPath: sitePath,
      relativePath: relative(this.backendRoot, sitePath).replace(/\\/g, '/'),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const state = await this.readState();
    const existingIndex = state.projects.findIndex((project) => project.companyId === company.id);
    if (existingIndex >= 0) {
      const existing = state.projects[existingIndex];
      projectRecord.createdAt = existing.createdAt;
      state.projects[existingIndex] = projectRecord;
    } else {
      state.projects.push(projectRecord);
    }
    await this.writeState(state);

    await this.writeWebsiteManifest(sitePath, projectRecord);
    await this.writeDeployGuide(sitePath, projectRecord);

    return this.toProjectResponse(projectRecord);
  }

  async updateMyProject(user: any, input: UpdateWebsiteProjectDto) {
    const company = await this.resolveCompanyForWebsite(user, input?.companyId);
    const state = await this.readState();
    const index = state.projects.findIndex((project) => project.companyId === company.id);
    if (index < 0) throw new NotFoundException('Website da empresa nao foi criado ainda');

    const current = state.projects[index];
    const sitePath = current.localPath;
    const siteExists = await this.fileExists(sitePath);
    if (!siteExists) {
      throw new NotFoundException('Pasta do website nao encontrada. Recrie o website desta empresa.');
    }

    let firebaseProjectId = current.firebaseProjectId || null;
    if (typeof input?.firebaseProjectId === 'string') {
      firebaseProjectId = await this.applyFirebaseProjectIdIfProvided(sitePath, input.firebaseProjectId);
    }

    const updated: WebsiteProjectRecord = {
      ...current,
      firebaseProjectId: firebaseProjectId || null,
      updatedAt: new Date().toISOString(),
    };

    state.projects[index] = updated;
    await this.writeState(state);
    await this.writeWebsiteManifest(sitePath, updated);
    await this.writeDeployGuide(sitePath, updated);

    return this.toProjectResponse(updated);
  }
}
