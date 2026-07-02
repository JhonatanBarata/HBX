import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  sanitizeAssistenteConfig,
  compileSystemPrompt,
  compileConditions,
  type AssistenteConfigShape,
} from './assistente-flow';
import { getSeedFluxo, normalizeTemplate } from './assistente-seeds';
import { normalizePerfil } from './assistente-flow';
import {
  AssistenteSandboxService,
  type SandboxTurn,
  type OllamaChat,
} from './assistente-sandbox.service';
import type { SandboxDto, SaveAssistenteDto } from './dto/assistente.dto';

// ============================================================================
// WORM-14 — Assistente IA (service). CRUD do AssistenteConfig por empresa +
// compilador (fluxoJson->prompt) + sandbox seguro + publicar atras de flag.
//
// PUBLICAR NO CHIP fica atras de HBX_ASSISTENTE_PUBLISH_ENABLED (default OFF): o
// dono liga quando quiser. Enquanto OFF, "publicar" apenas MARCA a intencao
// (published=true) — nenhum caminho deste modulo envia WhatsApp real.
// ============================================================================

const PUBLISH_FLAG = 'HBX_ASSISTENTE_PUBLISH_ENABLED';

function requireCompanyId(user: any): number {
  const companyId = Number(
    user?.masterContext?.active ? user?.masterContext?.companyId : user?.companyId || 0,
  );
  if (!companyId) throw new BadRequestException('Empresa não identificada.');
  return companyId;
}

type AssistenteRow = {
  id: string;
  companyId: number;
  nome: string;
  tom: string;
  perfil: string;
  produtos: string | null;
  empresaNome: string | null;
  fluxoJson: string;
  published: boolean;
  testCounter: number;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class AssistenteService {
  private readonly logger = new Logger(AssistenteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sandbox: AssistenteSandboxService,
  ) {}

  private get publishEnabled(): boolean {
    return ['true', '1', 'yes', 'on'].includes(String(process.env[PUBLISH_FLAG] || '').trim().toLowerCase());
  }

  private parseConfigFromRow(row: AssistenteRow): AssistenteConfigShape {
    let fluxo: unknown = {};
    try {
      fluxo = JSON.parse(row.fluxoJson || '{}');
    } catch {
      fluxo = {};
    }
    return sanitizeAssistenteConfig({
      nome: row.nome,
      tom: row.tom,
      perfil: row.perfil,
      produtos: row.produtos ?? '',
      empresaNome: row.empresaNome ?? '',
      fluxo,
    });
  }

  private serialize(row: AssistenteRow | null) {
    if (!row) return null;
    const config = this.parseConfigFromRow(row);
    return {
      id: row.id,
      nome: config.nome,
      tom: config.tom,
      perfil: config.perfil,
      produtos: config.produtos,
      empresaNome: config.empresaNome,
      fluxo: config.fluxo,
      published: row.published,
      testCounter: row.testCounter,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    };
  }

  private async findRow(companyId: number): Promise<AssistenteRow | null> {
    return (await (this.prisma as any).assistenteConfig.findFirst({
      where: { companyId },
      orderBy: { updatedAt: 'desc' },
    })) as AssistenteRow | null;
  }

  // GET /assistente — config atual (ou null se ainda nao criada).
  async get(user: any) {
    const companyId = requireCompanyId(user);
    const row = await this.findRow(companyId);
    return {
      ok: true,
      publishEnabled: this.publishEnabled,
      assistente: this.serialize(row),
    };
  }

  // GET /assistente/templates?perfil=vendas — seeds p/ o passo 3 do wizard.
  templates(perfilRaw: unknown) {
    const perfil = normalizePerfil(perfilRaw);
    return {
      ok: true,
      perfil,
      templates: (['agil', 'flexivel', 'avancado'] as const).map((tpl) => {
        const fluxo = getSeedFluxo(perfil, tpl);
        return {
          key: tpl,
          label:
            tpl === 'agil' ? 'Ágil' : tpl === 'flexivel' ? 'Flexível' : 'Avançado',
          passos: fluxo.passos.length,
          condicoes: fluxo.condicoes.length,
          fluxo,
        };
      }),
    };
  }

  // POST /assistente — cria/atualiza (upsert por empresa). Aceita `template` p/
  // materializar um seed quando o fluxo nao veio pronto do front.
  async save(user: any, dto: SaveAssistenteDto & { template?: string }) {
    const companyId = requireCompanyId(user);

    // Se veio perfil + template mas sem fluxo, materializa o seed.
    let incoming: any = { ...dto };
    const hasFluxoPassos =
      dto?.fluxo && Array.isArray(dto.fluxo.passos) && dto.fluxo.passos.length > 0;
    if (!hasFluxoPassos && dto?.template) {
      const perfil = normalizePerfil(dto?.perfil);
      incoming.fluxo = getSeedFluxo(perfil, normalizeTemplate(dto.template));
    }

    const config = sanitizeAssistenteConfig(incoming);
    const existing = await this.findRow(companyId);

    const data = {
      companyId,
      nome: config.nome,
      tom: config.tom,
      perfil: config.perfil,
      produtos: config.produtos || null,
      empresaNome: config.empresaNome || null,
      fluxoJson: JSON.stringify(config.fluxo),
    };

    let row: AssistenteRow;
    if (existing?.id) {
      row = (await (this.prisma as any).assistenteConfig.update({
        where: { id: existing.id },
        data,
      })) as AssistenteRow;
    } else {
      row = (await (this.prisma as any).assistenteConfig.create({ data })) as AssistenteRow;
    }
    return { ok: true, assistente: this.serialize(row) };
  }

  // GET /assistente/prompt — inspeciona o prompt-sistema compilado (debug/preview).
  async prompt(user: any) {
    const companyId = requireCompanyId(user);
    const row = await this.findRow(companyId);
    if (!row) throw new BadRequestException('Nenhum assistente configurado ainda.');
    const config = this.parseConfigFromRow(row);
    return {
      ok: true,
      systemPrompt: compileSystemPrompt(config),
      conditions: compileConditions(config),
    };
  }

  // POST /assistente/sandbox — TESTE SEGURO. Roda o mesmo pipeline do bot SEM
  // tocar Webwhats. Numera o teste (testCounter) como o concorrente ("Teste nº").
  async runSandbox(user: any, dto: SandboxDto, chat?: OllamaChat) {
    const companyId = requireCompanyId(user);

    // Config: usa a em-edicao (dto.config) se veio, senao a salva.
    let config: AssistenteConfigShape;
    let row = await this.findRow(companyId);
    if (dto?.config) {
      config = sanitizeAssistenteConfig(dto.config);
    } else if (row) {
      config = this.parseConfigFromRow(row);
    } else {
      throw new BadRequestException('Configure o assistente antes de testar.');
    }

    const history: SandboxTurn[] = (Array.isArray(dto?.history) ? dto.history : [])
      .map((t) => ({
        role: String(t?.role || '').toLowerCase() === 'assistant' ? 'assistant' : 'user',
        content: String(t?.content || '').slice(0, 2000),
      }))
      .filter((t) => t.content) as SandboxTurn[];

    const message = String(dto?.message || '').trim();

    const result = await this.sandbox.reply(config, history, message, chat);

    // Numera o teste: incrementa o contador da empresa (sem transacao pesada —
    // colisao aqui e irrelevante; e so um rotulo de UX). Sem envio real.
    let testNumber = row?.testCounter ?? 0;
    if (row) {
      const updated = (await (this.prisma as any).assistenteConfig.update({
        where: { id: row.id },
        data: { testCounter: { increment: 1 } },
        select: { testCounter: true },
      })) as { testCounter: number };
      testNumber = updated.testCounter;
    } else {
      testNumber += 1;
    }

    return {
      ok: true,
      testNumber,
      // Marca inequivoca de que NADA foi enviado ao chip.
      dispatched: false,
      channel: 'sandbox',
      reply: result.reply,
      source: result.source,
      matchedCondicaoId: result.matchedCondicaoId,
      model: result.model,
      latencyMs: result.latencyMs,
    };
  }

  // POST /assistente/publish — liga/desliga o assistente NO CHIP. Atras de flag.
  // Com a flag OFF, apenas registra a INTENCAO (published) — nenhum envio real
  // acontece por este modulo (o caminho de disparo vive no bot/cadencia com freios).
  async publish(user: any, on: boolean) {
    const companyId = requireCompanyId(user);
    const row = await this.findRow(companyId);
    if (!row) throw new BadRequestException('Configure o assistente antes de publicar.');

    if (on && !this.publishEnabled) {
      return {
        ok: false,
        published: row.published,
        publishEnabled: false,
        message:
          'Publicação no chip está desativada nesta instalação. Teste à vontade no sandbox — o envio real é liberado pelo responsável.',
      };
    }

    const updated = (await (this.prisma as any).assistenteConfig.update({
      where: { id: row.id },
      data: { published: on },
    })) as AssistenteRow;

    return { ok: true, published: updated.published, publishEnabled: this.publishEnabled };
  }
}
