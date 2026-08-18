import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../messaging/conversations.service';
import { AtividadesService } from '../atividades/atividades.service';
import { CompanyMailerService, COMPANY_EMAIL_NOT_CONFIGURED } from '../mail/company-mailer.service';
import { EmailOutboxService } from '../mail/email-outbox.service';
import { EmailTemplateService } from '../mail/email-template.service';
import { SenderIdentityService } from '../mail/sender-identity.service';
import { resolveVendasAccessContext, type VendasAccessContext } from '../team/team-access-runtime';
import {
  CADENCIA_SEEDS,
  MAX_WHATS_STEPS_PER_CADENCE,
  normalizePersona,
  sanitizePassos,
  type CadenciaPasso,
} from './cadencia-personas';
import type { AplicarCadenciaDto, CreateCadenciaDto, UpdateCadenciaDto } from './dto/cadencia.dto';
import { CommercialContactControlService } from '../vendas/commercial-contact-control.service';
import { AgendaDisparoService } from '../vendas/agenda-disparo.service';
import { PersonaIaService } from '../vendas/persona-ia.service';
import { reservarVarianteDeAbertura } from '../vendas/vendas-copy-reserva';
import { WaColdContactGateService, normalizeColdText, businessDayStartUtc } from '../messaging/wa-cold-contact-gate.service';
import { VendasContactSuppressionService } from '../vendas/vendas-contact-suppression.service';
import { automationFlag } from '../automation/automation-flags';

// ================================================================
// WORM-13 — CADENCIA (13a): CRUD das personas + aplicar a lista/filtro + runner
// diario. O runner e a UNICA coisa que auto-dispara: fica atras da flag
// HBX_AUTOMATION_RUNNER_ENABLED (S20, MOTOR-ÚNICO — fallback pra
// HBX_CADENCIA_RUNNER_ENABLED, default OFF). Enquanto OFF, o motor NAO roda em
// producao — leads sao inscritos, mas nenhum passo dispara sozinho.
//
// CANAL WHATSAPP = reusa o caminho PROVADO do bot de prospeccao:
// ConversationsService.queueOutboundForCompany(..., sourceModule
// 'vendas_prospeccao_bot', senderType 'bot', variables.botType 'prospeccao').
// Esse caminho ja carrega: disjuntor, 1 numero=1 conexao, janela/gate de conexao
// viva, e o outbox com retry. NUNCA API crua, NUNCA socket novo.
// ================================================================

const RUNNER_FLAG = 'HBX_CADENCIA_RUNNER_ENABLED';
const RUNNER_FLAG_NEW = 'HBX_AUTOMATION_RUNNER_ENABLED';

// E-mail automático da cadência atrás de flag própria (default OFF). Em produção
// o passo entra na outbox durável; o worker possui kill-switch independente.
const EMAIL_FLAG = 'HBX_CADENCIA_EMAIL_ENABLED';

// Teto DURO de passos de WhatsApp disparados por empresa/dia pelo runner de
// cadencia — defesa extra alem do warmup/teto do proprio queueOutbound. NAO
// configuravel pelo cliente (regra de chip). Conservador de proposito.
const CADENCIA_WHATS_DAILY_CAP_PER_COMPANY = Number(process.env.HBX_CADENCIA_WHATS_DAILY_CAP || '10') || 10;

// Teto de e-mails por empresa/dia disparados pelo runner. E-mail e mais barato que
// chip -> teto maior (50). Ao estourar, o passo e ADIADO 1 dia (nunca fura o teto).
const CADENCIA_EMAIL_DAILY_CAP_PER_COMPANY = Number(process.env.HBX_CADENCIA_EMAIL_DAILY_CAP || '50') || 50;

// Quantos leads o runner avanca por ciclo (evita rajada).
const RUNNER_BATCH = 50;

type CadenciaRow = {
  id: string;
  companyId: number;
  ownerId: number | null;
  nome: string;
  persona: string;
  descricao: string | null;
  passosJson: string;
  ativa: boolean;
  isSeed: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class CadenciaService {
  private readonly logger = new Logger(CadenciaService.name);
  private readonly commercialContactControl: CommercialContactControlService;
  // S5 LEAD-CENTRICO (05-agenda-slots.md) — quando o runner agenda o próximo passo
  // (sucesso) ou adia por teto físico estourado, a DECISÃO de "quando" passa a vir
  // daqui (janela/teto/intervalo da config comercial da empresa), nunca mais um
  // addDays cru. Mesmo padrão de instanciação manual do commercialContactControl.
  private readonly agendaDisparo: AgendaDisparoService;
  // S7 LEAD-CENTRICO (07-pool-raiz.md) — cadência ESGOTADA (todos os passos
  // rodaram sem resposta) é o gatilho de 'nao_atendeu' (resfriamento ~90
  // dias). Mesmo padrão de instanciação manual acima.
  private readonly contactSuppression: VendasContactSuppressionService;

  // BUG DO PLACEHOLDER CRU (31/07/2026, turno dos 5 disparos): a abertura
  // agendada saiu pro lead com "{{funcionario}}" LITERAL — a cadência mandava a
  // aberturaCopy sem renderizar. A persona (identidade única da IA) preenche o
  // {{funcionario}} agora; plain class fora do grafo de DI, padrão do arquivo.
  private readonly personaIa: PersonaIaService;

  // R5 (17/08/2026): a régua de carimbo do gate anti-ban vale TAMBÉM na hora de
  // agendar em massa. Uma régua só para "esse texto já saiu?" — duas réguas é
  // como nasce "passou no preparo e o freio cancelou no envio, um por um".
  private readonly coldGate: WaColdContactGateService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly atividades: AtividadesService,
    private readonly mailer: CompanyMailerService,
    // S6 LEAD-CENTRICO (06-email-v1.md): identidade do remetente (assinatura sóbria +
    // regra dura "sem perfil não sai") e o builder de HTML do corpo. @Optional porque
    // os testes unitários constroem o service via Object.create (bypassa o construtor)
    // e atribuem svc.senderIdentity/svc.emailTemplates direto — em produção o Nest
    // sempre resolve (MailModule exporta os dois).
    @Optional() private readonly senderIdentity?: SenderIdentityService,
    @Optional() private readonly emailTemplates?: EmailTemplateService,
    @Optional() private readonly emailOutbox?: EmailOutboxService,
  ) {
    this.commercialContactControl = new CommercialContactControlService(this.prisma);
    this.agendaDisparo = new AgendaDisparoService(this.prisma);
    this.contactSuppression = new VendasContactSuppressionService(this.prisma);
    this.personaIa = new PersonaIaService(this.prisma);
    this.coldGate = new WaColdContactGateService(this.prisma as any);
  }

  // ── R5 — O DEPÓSITO DE TEXTO (17/08/2026) ─────────────────────────────────
  // As variantes de primeiro contato ainda moram no `filtersJson` da campanha
  // aposentada (ela virou DEPÓSITO em 25/07 — não dispara mais nada). Enquanto a
  // F3 do PR17082026 não muda a casa delas pra dentro da cadência, este é o
  // ÚNICO leitor do depósito no caminho de massa. Variante pausada carrega um
  // caractere de controle no começo (o dono desliga sem perder o texto).
  private async lerVariantesDeAbertura(companyId: number): Promise<string[]> {
    const campaign = await (this.prisma as any).vendasAutomationCampaign
      ?.findFirst?.({ where: { companyId }, orderBy: { updatedAt: 'desc' }, select: { filtersJson: true } })
      .catch(() => null);
    let filters: Record<string, any> = {};
    const raw = (campaign as any)?.filtersJson;
    if (raw && typeof raw === 'object') filters = raw as Record<string, any>;
    else if (raw) {
      try {
        filters = JSON.parse(String(raw)) || {};
      } catch {
        filters = {};
      }
    }
    const brutas = Array.isArray(filters?.firstContactVariants) ? filters.firstContactVariants : [];
    return brutas
      .map((v: unknown) => String(v || ''))
      .filter((v: string) => v && v.charCodeAt(0) !== 1)
      .map((v: string) => v.trim())
      .filter(Boolean);
  }

  // O que já saiu (ou já está agendado) na janela de carimbo, normalizado. Mesma
  // fonte que o gate consulta na hora do envio.
  private async lerCopiasFriasRecentes(companyId: number): Promise<string[]> {
    const rows = await (this.prisma as any).whatsAppAuditLog
      ?.findMany?.({
        where: {
          companyId,
          scope: 'dispatch',
          event: { in: ['cold_contact_sent', 'cold_contact_scheduled'] },
          createdAt: { gte: new Date(Date.now() - this.coldGate.similarityWindowMs()) },
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: { metadata: true },
      })
      .catch(() => []);
    const textos: string[] = [];
    for (const row of rows || []) {
      try {
        const texto = String(JSON.parse(String(row?.metadata || '{}'))?.extra?.textNorm || '');
        if (texto) textos.push(texto);
      } catch {
        // metadata podre não invalida a checagem das outras
      }
    }
    return textos;
  }

  // Dia civil de São Paulo (-03) do slot — a cota de texto é POR DIA, e dia é o
  // do dono, nunca o UTC do container ([[teste-verde-no-meu-fuso-nao-vale]]).
  private diaDoSlot(quando: Date): string {
    return new Date(quando.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  // Quantos disparos automáticos JÁ SAÍRAM hoje, por empresa — lido do banco, não
  // da memória do processo. É o que faz o teto do runner ser diário de verdade
  // (e sobreviver a restart, que era a outra metade do buraco de 17/08).
  // Best-effort com fail-closed brando: falha de leitura devolve o teto CHEIO
  // como já gasto, ou seja, o runner segura o dia em vez de liberar às cegas.
  private async lerEnviosAutomaticosDeHoje(companyIds: number[]): Promise<Map<number, number>> {
    const mapa = new Map<number, number>();
    if (!companyIds.length) return mapa;
    const inicioDoDia = businessDayStartUtc(new Date());
    for (const companyId of companyIds) {
      try {
        const total = await (this.prisma as any).whatsAppAuditLog.count({
          where: {
            companyId,
            scope: 'dispatch',
            event: 'cold_contact_sent',
            createdAt: { gte: inicioDoDia },
          },
        });
        mapa.set(companyId, Math.max(0, Math.trunc(Number(total) || 0)));
      } catch (error) {
        this.logger.warn(
          `[cadencia-runner] falha ao ler a cota de hoje (company=${companyId}) — segurando o dia: ${String((error as any)?.message || error)}`,
        );
        mapa.set(companyId, CADENCIA_WHATS_DAILY_CAP_PER_COMPANY);
      }
    }
    return mapa;
  }

  private get runnerEnabled(): boolean {
    return automationFlag(RUNNER_FLAG_NEW, RUNNER_FLAG);
  }

  // Flag propria do e-mail real (default OFF). Segue o padrao do runnerEnabled.
  private get emailEnabled(): boolean {
    return String(process.env[EMAIL_FLAG] || '').trim() === '1' || String(process.env[EMAIL_FLAG] || '').trim().toLowerCase() === 'true';
  }

  private async resolveContext(user: any): Promise<VendasAccessContext> {
    return resolveVendasAccessContext(this.prisma, user);
  }

  private parsePassos(json: string | null | undefined): CadenciaPasso[] {
    try {
      return sanitizePassos(JSON.parse(json || '[]'));
    } catch {
      return [];
    }
  }

  private serialize(row: CadenciaRow, extra: { inscritos?: number } = {}) {
    const passos = this.parsePassos(row.passosJson);
    return {
      id: row.id,
      nome: row.nome,
      persona: row.persona,
      descricao: row.descricao ?? null,
      passos,
      passosCount: passos.length,
      whatsSteps: passos.filter((p) => p.canal === 'whats').length,
      ativa: row.ativa,
      isSeed: row.isSeed,
      inscritos: extra.inscritos ?? undefined,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    };
  }

  private normalizeName(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const t = value.trim();
    return t ? t.slice(0, 120) : null;
  }

  // Admin/gerente cuida de automacao da empresa; vendedor comum nao mexe.
  private assertCanManage(context: VendasAccessContext) {
    if (context.isAdmin || context.canViewCompanyCards) return;
    throw new ForbiddenException('Sem permissão para gerenciar automações.');
  }

  // Garante os 3 seeds de persona para a empresa (idempotente). Chamado no listar.
  private async ensureSeeds(companyId: number, ownerId: number | null) {
    const existing = (await (this.prisma as any).cadencia.findMany({
      where: { companyId, isSeed: true },
      select: { persona: true },
    })) as Array<{ persona: string }>;
    const have = new Set(existing.map((r) => r.persona));
    for (const seed of CADENCIA_SEEDS) {
      if (have.has(seed.key)) continue;
      await (this.prisma as any).cadencia
        .create({
          data: {
            companyId,
            ownerId,
            nome: seed.nome,
            persona: seed.key,
            descricao: seed.descricao,
            passosJson: JSON.stringify(sanitizePassos(seed.passos)),
            ativa: true,
            isSeed: true,
          },
        })
        .catch(() => null);
    }
  }

  // ---------------- LISTAR (cards de persona) ----------------
  async listForUser(user: any) {
    const context = await this.resolveContext(user);
    await this.ensureSeeds(context.companyId, context.userId).catch(() => null);

    const rows = (await (this.prisma as any).cadencia.findMany({
      where: { companyId: context.companyId },
      orderBy: [{ isSeed: 'desc' }, { createdAt: 'asc' }],
      take: 100,
    })) as CadenciaRow[];

    // Contagem de inscritos ativos por cadencia (1 query agregada).
    const counts = (await (this.prisma as any).cadenciaInscricao.groupBy({
      by: ['cadenciaId'],
      where: { companyId: context.companyId, status: 'ativa' },
      _count: { _all: true },
    })) as Array<{ cadenciaId: string; _count: { _all: number } }>;
    const countByCadencia = new Map(counts.map((c) => [c.cadenciaId, c._count._all]));

    return {
      ok: true,
      canManage: context.isAdmin || context.canViewCompanyCards,
      runnerEnabled: this.runnerEnabled,
      cadencias: rows.map((row) => this.serialize(row, { inscritos: countByCadencia.get(row.id) ?? 0 })),
    };
  }

  // ---------------- CRIAR (persona custom) ----------------
  async createForUser(user: any, dto: CreateCadenciaDto) {
    const context = await this.resolveContext(user);
    this.assertCanManage(context);
    const nome = this.normalizeName(dto?.nome);
    if (!nome) throw new BadRequestException('Nome da cadência obrigatório.');
    const persona = normalizePersona(dto?.persona);
    const passos = sanitizePassos(dto?.passos);
    if (!passos.length) throw new BadRequestException('Adicione ao menos um passo.');

    const row = (await (this.prisma as any).cadencia.create({
      data: {
        companyId: context.companyId,
        ownerId: context.userId,
        nome,
        persona,
        descricao: typeof dto?.descricao === 'string' ? dto.descricao.trim().slice(0, 400) || null : null,
        passosJson: JSON.stringify(passos),
        ativa: true,
        isSeed: false,
      },
    })) as CadenciaRow;
    return { ok: true, cadencia: this.serialize(row, { inscritos: 0 }) };
  }

  // ---------------- EDITAR ----------------
  async updateForUser(user: any, id: string, dto: UpdateCadenciaDto) {
    const context = await this.resolveContext(user);
    this.assertCanManage(context);
    const existing = (await (this.prisma as any).cadencia.findFirst({
      where: { id: String(id || '').trim(), companyId: context.companyId },
    })) as CadenciaRow | null;
    if (!existing) throw new NotFoundException('Cadência não encontrada.');
    if (existing.isSeed && (dto?.passos !== undefined || dto?.nome !== undefined)) {
      throw new BadRequestException('Cadência de persona padrão não pode ter passos/nome editados. Duplique numa cadência própria.');
    }

    const data: Record<string, any> = {};
    if (dto?.nome !== undefined) {
      const nome = this.normalizeName(dto.nome);
      if (!nome) throw new BadRequestException('Nome obrigatório.');
      data.nome = nome;
    }
    if (dto?.descricao !== undefined) data.descricao = typeof dto.descricao === 'string' ? dto.descricao.trim().slice(0, 400) || null : null;
    if (dto?.passos !== undefined) {
      const passos = sanitizePassos(dto.passos);
      if (!passos.length) throw new BadRequestException('Adicione ao menos um passo.');
      data.passosJson = JSON.stringify(passos);
    }
    if (dto?.ativa !== undefined) data.ativa = Boolean(dto.ativa);

    const row = (await (this.prisma as any).cadencia.update({ where: { id: existing.id }, data })) as CadenciaRow;
    return { ok: true, cadencia: this.serialize(row) };
  }

  // ---------------- DELETAR ----------------
  async deleteForUser(user: any, id: string) {
    const context = await this.resolveContext(user);
    this.assertCanManage(context);
    const existing = (await (this.prisma as any).cadencia.findFirst({
      where: { id: String(id || '').trim(), companyId: context.companyId },
      select: { id: true, isSeed: true },
    })) as { id: string; isSeed: boolean } | null;
    if (!existing) throw new NotFoundException('Cadência não encontrada.');
    if (existing.isSeed) throw new BadRequestException('Cadência de persona padrão não pode ser removida (desative-a).');
    await (this.prisma as any).cadenciaInscricao.deleteMany({ where: { cadenciaId: existing.id } }).catch(() => null);
    await (this.prisma as any).cadencia.delete({ where: { id: existing.id } });
    return { ok: true, deleted: true };
  }

  // ---------------- APLICAR a lista/filtro ----------------
  // Inscreve leads na cadencia. Aceita leadIds explicitos OU um savedSearchId
  // (WORM-15) cujos leads ja PRESENTES no funil viram inscritos (o runner nao
  // cria lead novo — so trabalha o que ja esta no Vendas).
  async aplicarForUser(user: any, cadenciaId: string, dto: AplicarCadenciaDto) {
    const context = await this.resolveContext(user);
    this.assertCanManage(context);
    const cadencia = (await (this.prisma as any).cadencia.findFirst({
      where: { id: String(cadenciaId || '').trim(), companyId: context.companyId },
    })) as CadenciaRow | null;
    if (!cadencia) throw new NotFoundException('Cadência não encontrada.');
    if (!cadencia.ativa) throw new BadRequestException('Ative a cadência antes de aplicá-la.');
    const passos = this.parsePassos(cadencia.passosJson);
    if (!passos.length) throw new BadRequestException('Cadência sem passos.');

    let leadIds = Array.isArray(dto?.leadIds) ? dto.leadIds.map((s) => String(s || '').trim()).filter(Boolean) : [];

    // savedSearchId -> resolve os leads do funil por cidade/segmento do filtro salvo.
    if ((!leadIds.length) && dto?.savedSearchId) {
      leadIds = await this.resolveLeadIdsFromSavedSearch(context, String(dto.savedSearchId).trim());
    }
    if (!leadIds.length) throw new BadRequestException('Nenhum lead para aplicar (informe leadIds ou um savedSearchId com resultado).');

    // Confere que os leads sao da empresa (nao inscreve lead de fora).
    const validLeads = (await this.prisma.vendasLead.findMany({
      where: { id: { in: leadIds.slice(0, 500) }, companyId: context.companyId },
      select: { id: true, assignedUserId: true },
    })) as Array<{ id: string; assignedUserId: number | null }>;

    const now = new Date();
    const firstDay = passos[0]?.dia ?? 0;
    const responsavelDefault = dto?.responsavelId != null ? Number(dto.responsavelId) : null;

    // ── R3 (17/08/2026) — SELECIONAR NÃO É ENVIAR ────────────────────────────
    // O QUE ESTA LINHA CUSTOU: 17/08 17:39, "Selecionar visíveis" + Aplicar
    // inscreveu 124 leads com `nextStepAt = addDays(now, 0)` — ou seja, TODOS
    // devidos NO MESMO INSTANTE — e o runner cuspiu 126 mensagens idênticas pelo
    // chip do dono. A porta certa já existia ao lado (`ligarRoboForUser`: reserva
    // slot na agenda e reserva variante de texto), mas só atendia 1 lead por vez;
    // a porta de massa não passava por nenhuma das duas.
    //
    // Agora massa e unitário usam a MESMA régua: cada lead recebe um HORÁRIO
    // reservado na agenda (janela + teto/dia + intervalo com jitter humano) e um
    // TEXTO que ninguém usou naquele dia. Selecionar 240 leads passa a encher o
    // calendário das próximas semanas, nunca o minuto atual.
    const variantes = await this.lerVariantesDeAbertura(context.companyId);
    const usadasPorDia = new Map<string, string[]>();
    // O que já saiu nas últimas horas conta como "usado hoje" — a régua de
    // carimbo é do CHIP, não desta chamada.
    usadasPorDia.set(this.diaDoSlot(now), await this.lerCopiasFriasRecentes(context.companyId));

    let inscritos = 0;
    let jaInscritos = 0;
    let conflitosAutomacao = 0;
    let primeiroSlot: Date | null = null;
    let ultimoSlot: Date | null = null;
    let semTextoNovo = 0;

    for (const lead of validLeads) {
      const responsavelId = responsavelDefault ?? lead.assignedUserId ?? null;
      const slot = await this.commercialContactControl.createCadenciaInscricao({
        companyId: context.companyId,
        leadId: lead.id,
        data: {
          cadenciaId: cadencia.id,
          companyId: context.companyId,
          leadId: lead.id,
          responsavelId,
          status: 'ativa',
          currentStep: 0,
          startedAt: now,
          // Provisório: o horário DEFINITIVO sai da agenda logo abaixo, dentro do
          // mutex por empresa. Gravar o pedido aqui já faz a linha ocupar lugar
          // para quem estiver reservando em paralelo (mesma manobra do unitário).
          nextStepAt: this.addDays(now, firstDay),
        },
      });
      if (!slot.created) {
        if (slot.alreadyEnrolled) jaInscritos += 1;
        else conflitosAutomacao += 1;
        continue;
      }
      inscritos += 1;

      const inscricaoId = String((slot as any).row?.id || '').trim();
      if (!inscricaoId) continue;

      // 1) O HORÁRIO — a agenda é quem manda, não o clique.
      const reserva = await this.agendaDisparo.reservarProximoSlot({
        companyId: context.companyId,
        inscricaoId,
        desiredAt: now,
        now,
      });
      const quando = reserva.slot;
      if (!primeiroSlot || quando < primeiroSlot) primeiroSlot = quando;
      if (!ultimoSlot || quando > ultimoSlot) ultimoSlot = quando;

      // 2) O TEXTO — variante inédita NO DIA em que o disparo vai sair. A janela
      // de carimbo é de 24h, então a mesma variante pode voltar dias depois; o
      // que não pode é sair duas vezes igual no mesmo dia (foi o blast).
      const diaKey = this.diaDoSlot(quando);
      const usadas = usadasPorDia.get(diaKey) ?? [];
      const escolha = reservarVarianteDeAbertura({
        variantes,
        usadasNorm: usadas,
        threshold: this.coldGate.similarityThreshold(),
        minLen: this.coldGate.similarityMinLen(),
      });
      if (escolha.ok === false) {
        // Sem texto novo pra este dia: a inscrição FICA (o horário já é dela),
        // mas sem `aberturaCopy` o runner cairia no corpo fixo do passo — que é
        // exatamente o carimbo. Melhor adiar do que repetir: empurra pro próximo
        // dia útil, onde a cota de texto está limpa.
        semTextoNovo += 1;
        await this.agendaDisparo.reservarProximoDiaUtil({
          companyId: context.companyId,
          inscricaoId,
          from: quando,
          extraData: { lastError: 'sem_variante_de_texto_no_dia' },
        });
        continue;
      }
      await (this.prisma as any).cadenciaInscricao
        .updateMany({ where: { id: inscricaoId, status: 'ativa' }, data: { aberturaCopy: escolha.variante } })
        .catch(() => null);
      usadas.push(normalizeColdText(escolha.variante));
      usadasPorDia.set(diaKey, usadas);
    }

    return {
      ok: true,
      inscritos,
      jaInscritos,
      conflitosAutomacao,
      total: validLeads.length,
      runnerEnabled: this.runnerEnabled,
      // A tela precisa dizer QUANDO isto vai acontecer — "agendei 124" sem data é
      // como o dono descobriu o blast: pelo WhatsApp apitando.
      primeiroDisparoAt: primeiroSlot ? primeiroSlot.toISOString() : null,
      ultimoDisparoAt: ultimoSlot ? ultimoSlot.toISOString() : null,
      adiadosPorFaltaDeTexto: semTextoNovo,
    };
  }

  // Cancela a inscricao de um lead (ou de toda a cadencia).
  async cancelarInscricoes(user: any, cadenciaId: string, leadId?: string) {
    const context = await this.resolveContext(user);
    this.assertCanManage(context);
    const where: Record<string, any> = { cadenciaId: String(cadenciaId || '').trim(), companyId: context.companyId, status: 'ativa' };
    if (leadId) where.leadId = String(leadId).trim();
    const affected = await (this.prisma as any).cadenciaInscricao.findMany({
      where,
      select: { id: true },
      take: 500,
    });
    const res = await (this.prisma as any).cadenciaInscricao.updateMany({ where, data: { status: 'cancelada' } });
    for (const row of affected || []) {
      await this.commercialContactControl.finishAutomationEnrollment({
        companyId: context.companyId,
        legacySource: 'cadencia_inscricao',
        legacyExecutionId: String(row.id),
        status: 'canceled',
        reason: 'canceled_by_user',
      });
    }
    return { ok: true, canceladas: res?.count ?? 0 };
  }

  // Resolve leads do funil a partir de um SavedSearch (cidade/segmento). Nao roda
  // o Radar (que cria leads novos) — pega o que ja esta no Vendas batendo o filtro.
  private async resolveLeadIdsFromSavedSearch(context: VendasAccessContext, savedSearchId: string): Promise<string[]> {
    const search = (await (this.prisma as any).savedSearch.findFirst({
      where: { id: savedSearchId, companyId: context.companyId },
      select: { filtroJson: true },
    })) as { filtroJson: string } | null;
    if (!search) return [];
    let filtro: Record<string, any> = {};
    try {
      filtro = JSON.parse(search.filtroJson || '{}') || {};
    } catch {
      filtro = {};
    }
    const where: Record<string, any> = { companyId: context.companyId };
    const city = String(filtro.city || '').trim();
    const state = String(filtro.state || '').trim();
    const segment = String(filtro.segment || '').trim();
    if (city) where.city = { equals: city, mode: 'insensitive' };
    if (state) where.state = { equals: state, mode: 'insensitive' };
    if (segment) where.segment = { equals: segment, mode: 'insensitive' };
    const limit = Math.min(500, Math.max(1, Number(filtro.quantos || filtro.limit || 100) || 100));
    const rows = (await this.prisma.vendasLead.findMany({
      where,
      select: { id: true },
      take: limit,
      orderBy: { createdAt: 'desc' },
    })) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  // ================================================================
  // RUNNER DIARIO — avanca as inscricoes cujo passo do dia esta devido.
  // Chamado pelo scheduler (onModuleInit) SOMENTE se a flag estiver ON.
  // Retorna um resumo para log/observabilidade.
  // ================================================================
  async runDueSteps(nowInput?: Date) {
    if (!this.runnerEnabled) {
      return { ok: true, skipped: 'runner_disabled' as const };
    }
    const now = nowInput ?? new Date();

    const due = (await (this.prisma as any).cadenciaInscricao.findMany({
      where: { status: 'ativa', nextStepAt: { lte: now } },
      orderBy: { nextStepAt: 'asc' },
      take: RUNNER_BATCH,
    })) as Array<{
      id: string;
      cadenciaId: string;
      companyId: number;
      leadId: string;
      responsavelId: number | null;
      currentStep: number;
      nextStepAt: Date;
      aberturaCopy: string | null;
    }>;

    let executed = 0;
    let whatsSent = 0;
    let emailSent = 0;
    let concluded = 0;
    let failed = 0;
    // ── O TETO DIÁRIO ERA UM TETO POR MINUTO (bug achado em 17/08/2026) ───────
    // Este Map nasce vazio A CADA TICK do runner (60s). O comentário lá em cima
    // promete "teto DURO por empresa/DIA = 10", mas o contador zerava a cada
    // giro: o teto real era 10 por empresa por MINUTO. Com 124 inscrições
    // vencidas ao mesmo tempo, 60 tiques de um minuto entregam 600 mensagens sem
    // que nada "estoure" — foi assim que 126 saíram achando que o teto segurava.
    //
    // Agora o contador NASCE do que já foi enviado hoje de verdade (a cota
    // persistente do gate anti-ban, que sobrevive a restart e a publish). Mesma
    // fonte que o freio do envio consulta: um número, uma verdade.
    const whatsSentByCompany = await this.lerEnviosAutomaticosDeHoje(
      Array.from(new Set(due.map((d) => Number(d.companyId)).filter((n) => Number.isFinite(n)))),
    );
    const emailSentByCompany = new Map<number, number>();

    for (const insc of due) {
      let activeStepRunId: string | null = null;
      try {
        if (!(await this.commercialContactControl.canCadenciaRun({
          companyId: insc.companyId,
          leadId: insc.leadId,
          inscricaoId: insc.id,
        }))) {
          continue;
        }
        const cadencia = (await (this.prisma as any).cadencia.findUnique({ where: { id: insc.cadenciaId } })) as CadenciaRow | null;
        if (!cadencia || !cadencia.ativa) {
          await (this.prisma as any).cadenciaInscricao.updateMany({
            where: { id: insc.id, status: 'ativa' },
            data: { status: 'pausada' },
          });
          await this.commercialContactControl.finishAutomationEnrollment({
            companyId: insc.companyId,
            legacySource: 'cadencia_inscricao',
            legacyExecutionId: insc.id,
            status: 'paused',
            reason: 'cadence_definition_inactive',
          });
          continue;
        }
        const passos = this.parsePassos(cadencia.passosJson);
        if (insc.currentStep >= passos.length) {
          const result = await (this.prisma as any).cadenciaInscricao.updateMany({
            where: { id: insc.id, status: 'ativa' },
            data: { status: 'concluida' },
          });
          concluded += Number(result?.count || 0);
          await this.commercialContactControl.finishAutomationEnrollment({
            companyId: insc.companyId,
            legacySource: 'cadencia_inscricao',
            legacyExecutionId: insc.id,
            status: 'completed',
            reason: 'all_steps_completed',
          });
          continue;
        }
        const passo = passos[insc.currentStep];

        const alreadyToday = whatsSentByCompany.get(insc.companyId) ?? 0;
        const whatsCapReached = passo.canal === 'whats' && alreadyToday >= CADENCIA_WHATS_DAILY_CAP_PER_COMPANY;
        // Teto de e-mail so conta quando o envio real esta ligado (emailEnabled);
        // com a flag OFF o passo so grava timeline, entao nao ha o que adiar.
        const emailAlreadyToday = emailSentByCompany.get(insc.companyId) ?? 0;
        const emailCapReached = passo.canal === 'email' && this.emailEnabled && emailAlreadyToday >= CADENCIA_EMAIL_DAILY_CAP_PER_COMPANY;

        if (passo.canal === 'whats' && whatsCapReached) {
          // Teto FISICO de chip atingido (freio intocado): NAO dispara. O "quando"
          // do adiamento passa pelo servico de slots (S5) — proximo dia util NO
          // HORARIO configurado, nunca mais "amanha nesta mesma hora" cru (podia
          // cair de madrugada/fim de semana).
          await this.agendaDisparo.reservarProximoDiaUtil({
            companyId: insc.companyId,
            inscricaoId: insc.id,
            from: now,
            extraData: { lastError: 'whats_daily_cap_deferred' },
          });
          continue;
        }
        if (passo.canal === 'email' && emailCapReached) {
          // Teto de e-mail atingido: NAO envia (mesmo padrao do WhatsApp acima).
          await this.agendaDisparo.reservarProximoDiaUtil({
            companyId: insc.companyId,
            inscricaoId: insc.id,
            from: now,
            extraData: { lastError: 'email_daily_cap_deferred' },
          });
          continue;
        }

        // Claim durável por passo: duas réplicas podem ler a mesma inscrição,
        // mas somente uma muda scheduled -> claimed. Se a outbox já foi criada
        // antes de um crash, a réplica seguinte apenas avança a inscrição.
        const automationStep = await this.commercialContactControl.claimCadenciaStep({
          companyId: insc.companyId,
          leadId: insc.leadId,
          cadenciaId: insc.cadenciaId,
          inscricaoId: insc.id,
          currentStep: insc.currentStep,
          channel: passo.canal,
          scheduledAt: insc.nextStepAt,
          snapshot: { cadenciaNome: cadencia.nome, passo },
        });
        activeStepRunId = automationStep.stepRunId;
        if (automationStep.supported && !automationStep.claimed && !automationStep.alreadyExecuted) {
          continue;
        }

        if (!automationStep.alreadyExecuted) {
          if (passo.canal === 'whats') {
            // O ROBÔ ENXERGA O HUMANO (30/07): ABERTURA = o PRIMEIRO passo de
            // WhatsApp da cadência. Só ele é do vendedor por regra; follow-up de
            // WhatsApp continua sendo do robô.
            const isAbertura = passos.findIndex((p) => p.canal === 'whats') === insc.currentStep;
            const outcome = await this.executeWhatsStep(insc, cadencia, passo, activeStepRunId, isAbertura);
            if (outcome.sent) {
              whatsSent += 1;
              whatsSentByCompany.set(insc.companyId, alreadyToday + 1);
            } else {
              await this.commercialContactControl.completeAutomationStep({
                companyId: insc.companyId,
                stepRunId: activeStepRunId,
                status: 'skipped',
                errorCode: outcome.skipReason || 'whatsapp_step_not_queued',
              });
            }
          } else if (passo.canal === 'email') {
            const queued = await this.executeEmailStep(insc, cadencia, passo, activeStepRunId);
            if (queued) {
              emailSent += 1;
              emailSentByCompany.set(insc.companyId, emailAlreadyToday + 1);
            }
            if (!queued) {
              await this.commercialContactControl.completeAutomationStep({
                companyId: insc.companyId,
                stepRunId: activeStepRunId,
                status: 'skipped',
                errorCode: 'email_action_not_dispatched',
              });
            }
          } else if (passo.canal === 'atividade') {
            await this.executeAtividadeStep(insc, cadencia, passo);
            await this.commercialContactControl.completeAutomationStep({
              companyId: insc.companyId,
              stepRunId: activeStepRunId,
              status: 'succeeded',
            });
          }
        }

        // Um inbound pode ter cancelado a inscricao enquanto o passo executava.
        // Nunca reativa nem conclui por cima desse cancelamento.
        if (!(await this.commercialContactControl.canCadenciaRun({
          companyId: insc.companyId,
          leadId: insc.leadId,
          inscricaoId: insc.id,
        }))) {
          continue;
        }

        // Avanca para o proximo passo. nextStepAt = startedAt-relativo ao dia do
        // proximo passo, medido a partir de agora + (diaProx - diaAtual).
        const nextStep = insc.currentStep + 1;
        if (nextStep >= passos.length) {
          const result = await (this.prisma as any).cadenciaInscricao.updateMany({
            where: { id: insc.id, status: 'ativa' },
            data: { currentStep: nextStep, status: 'concluida', lastStepAt: now, lastError: null },
          });
          concluded += Number(result?.count || 0);
          if (Number(result?.count || 0) > 0) {
            await this.commercialContactControl.finishAutomationEnrollment({
              companyId: insc.companyId,
              legacySource: 'cadencia_inscricao',
              legacyExecutionId: insc.id,
              status: 'completed',
              reason: 'all_steps_completed',
            });
            // S7 LEAD-CENTRICO (07-pool-raiz.md, item 1): cadência esgotou os
            // passos sem resposta = "não atendeu" -> resfriamento ~90 dias na
            // marquinha global do contato. Best-effort: nunca derruba o
            // fechamento do ciclo do runner.
            await this.markNaoAtendeuAfterCadenciaExhausted(insc.companyId, insc.leadId).catch((error: any) => {
              this.logger.warn(`[cadencia-suppression] falha ao marcar lead=${insc.leadId}: ${String(error?.message || error)}`);
            });
          }
        } else {
          // Dia-alvo continua vindo da PERSONA (deltaDias, intocado); o servico de
          // slots (S5) so decide a HORA dentro desse dia (ou empurra pro proximo
          // dia util se a janela/teto/intervalo da empresa não deixar) — nunca fura
          // janela/teto/intervalo (docs/PLANEJAMENTOS/PR25072026-LEAD-CENTRICO/05-agenda-slots.md).
          const deltaDias = Math.max(0, (passos[nextStep].dia ?? 0) - (passo.dia ?? 0));
          const desiredAt = this.addDays(now, deltaDias);
          const reserved = await this.agendaDisparo.reservarProximoSlot({
            companyId: insc.companyId,
            inscricaoId: insc.id,
            desiredAt,
            now,
            extraData: { currentStep: nextStep, lastStepAt: now, lastError: null },
          });
          if (reserved.updatedCount > 0) {
            await this.commercialContactControl.advanceAutomationEnrollment({
              companyId: insc.companyId,
              legacySource: 'cadencia_inscricao',
              legacyExecutionId: insc.id,
              currentStep: nextStep,
              nextStepAt: reserved.slot,
            });
          }
        }
        executed += 1;
      } catch (error: any) {
        failed += 1;
        await this.commercialContactControl.completeAutomationStep({
          companyId: insc.companyId,
          stepRunId: activeStepRunId,
          status: 'scheduled',
          errorCode: 'cadence_step_failed',
          errorMessage: String(error?.message || error),
        }).catch(() => null);
        this.logger.warn(`[cadencia-runner] falha inscricao=${insc.id}: ${String(error?.message || error)}`);
        await (this.prisma as any).cadenciaInscricao
          .updateMany({
            where: { id: insc.id, status: 'ativa' },
            data: { nextStepAt: this.addDays(now, 1), lastError: String(error?.message || error).slice(0, 200) },
          })
          .catch(() => null);
      }
    }

    return { ok: true, considered: due.length, executed, whatsSent, emailSent, concluded, failed };
  }

  // S7 LEAD-CENTRICO (07-pool-raiz.md, item 1): busca best-effort do contato
  // (+ cnpj quando o lead está linkado a um CustomerProfile PJ) pra marcar
  // 'nao_atendeu' (~90 dias) na marquinha global quando a cadência esgota os
  // passos sem resposta alguma. Nunca lança — chamador já trata com .catch.
  private async markNaoAtendeuAfterCadenciaExhausted(companyId: number, leadId: string): Promise<void> {
    const lead = await this.prisma.vendasLead.findFirst({
      where: { id: leadId, companyId },
      select: { id: true, phone: true, phoneNormalized: true, email: true, customerProfileId: true },
    });
    if (!lead) return;
    let cnpj: string | null = null;
    if (lead.customerProfileId) {
      const profile = await this.prisma.customerProfile
        .findUnique({ where: { id: lead.customerProfileId }, select: { cnpj: true } })
        .catch(() => null);
      cnpj = profile?.cnpj || null;
    }
    await this.contactSuppression.mark(
      { cnpj, phone: lead.phoneNormalized || lead.phone, email: lead.email },
      'nao_atendeu',
      { companyId, leadId: lead.id },
    );
  }

  // FREIO DA SUPRESSÃO (30/07/2026) — portão ÚNICO de saída da cadência.
  // Até hoje `isSuppressed` não tinha UM chamador em todo o backend: quem respondia
  // "pare, me remove" seguia elegível a disparo. Agora nenhum canal sai sem consultar,
  // e marca positiva MATA a inscrição — só pular o passo adiaria o incômodo para o
  // próximo ciclo. A leitura é fail-open por dentro (isSuppressed nunca lança): queda
  // de banco não trava a cadência inteira, mas marca encontrada SEMPRE barra.
  // Quem encerra aqui não é sobrescrito depois: o runner reconfere canCadenciaRun
  // antes de avançar/concluir (mesmo guard que protege o cancelamento por inbound).
  private async blockedBySuppression(
    insc: { id: string; companyId: number; leadId: string },
    contacts: { phone?: string | null; email?: string | null },
  ): Promise<boolean> {
    const hit = await this.contactSuppression.isSuppressed(contacts);
    if (!hit.suppressed) return false;
    this.logger.log(
      `[cadencia-runner] contato suprimido lead=${insc.leadId} chave=${hit.matchedType} — cadencia encerrada`,
    );
    await (this.prisma as any).cadenciaInscricao
      .update({ where: { id: insc.id }, data: { status: 'cancelada', lastError: 'contato_suprimido' } })
      .catch(() => null);
    return true;
  }

  // Saudação no fuso do dono (mesma régua de vendas-automation.service.ts).
  private saudacaoBrasilia(): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'America/Sao_Paulo',
    }).formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
    if (hour >= 18 || hour < 3) return 'Boa noite';
    if (hour >= 12) return 'Boa tarde';
    return 'Bom dia';
  }

  /**
   * Renderiza o corpo de um passo WhatsApp da cadência. {{funcionario}} = a
   * PERSONA da empresa (aiNome ou vendedor representado — persona-ia.service),
   * {{empresa}} = nome da empresa, {{cliente}} = nome do lead,
   * {{cumprimentacao}} = saudação do fuso. Marcador desconhecido é REMOVIDO:
   * cliente jamais lê "{{...}}" (bug real de 31/07 — o RISSO leu).
   */
  // `responsavelId` = a pessoa dona do lead, que é de quem sai o chip (ver
  // senderUserId em executeWhatsStep). UM NÚMERO, UM NOME (03/08): tendo dona, o
  // {{funcionario}} é o nome DELA — cinco vendedoras com cinco chips assinando
  // todas a persona da empresa é o teatro que o lead percebe. Sem dona, cai na
  // identidade da empresa exatamente como antes.
  private async renderCorpoWhats(
    companyId: number,
    leadName: string | null,
    template: string,
    responsavelId?: number | null,
  ): Promise<string> {
    const texto = String(template || '').trim();
    if (!texto.includes('{{')) return texto;
    const [company, funcionario] = await Promise.all([
      (this.prisma as any).company
        ?.findUnique?.({ where: { id: Number(companyId) }, select: { name: true } })
        .catch(() => null),
      this.personaIa.assinaturaDaPessoa(Number(companyId), responsavelId, 'time comercial'),
    ]);
    const valores: Record<string, string> = {
      cumprimentacao: this.saudacaoBrasilia(),
      empresa: String(company?.name || 'nossa empresa').trim(),
      funcionario: String(funcionario || 'time comercial').trim(),
      cliente: String(leadName || 'sua empresa').trim(),
    };
    let out = texto;
    for (const [chave, valor] of Object.entries(valores)) {
      out = out.replace(new RegExp(`\\{\\{\\s*${chave}\\s*\\}\\}`, 'gi'), valor);
    }
    return out.replace(/\{\{[^}]*\}\}/g, '').replace(/[ \t]{2,}/g, ' ').trim();
  }

  // WhatsApp: reusa o caminho PROVADO do bot de prospeccao (com todos os freios).
  // `isAbertura` = este passo é a PRIMEIRA mensagem de WhatsApp da cadência (a
  // abertura). Quando é, o robô confere se um humano já abriu a conversa.
  private async executeWhatsStep(
    insc: { id: string; companyId: number; leadId: string; aberturaCopy?: string | null; responsavelId?: number | null },
    cadencia: CadenciaRow,
    passo: CadenciaPasso,
    automationStepRunId?: string | null,
    isAbertura = false,
  ): Promise<{ sent: boolean; skipReason?: string }> {
    if (!(await this.commercialContactControl.canCadenciaRun({
      companyId: insc.companyId,
      leadId: insc.leadId,
      inscricaoId: insc.id,
    }))) {
      return { sent: false, skipReason: 'cadencia_inativa' };
    }
    const lead = (await this.prisma.vendasLead.findFirst({
      where: { id: insc.leadId, companyId: insc.companyId },
      select: { id: true, phone: true, phoneNormalized: true, name: true },
    })) as { id: string; phone: string | null; phoneNormalized: string | null; name: string | null } | null;
    const contact = String(lead?.phoneNormalized || lead?.phone || '').trim();
    if (!contact) {
      // Sem telefone: passo WhatsApp vira no-op silencioso (segue a cadencia).
      this.logger.log(`[cadencia-runner] whats sem telefone lead=${insc.leadId} — passo pulado`);
      return { sent: false, skipReason: 'whats_sem_telefone' };
    }

    // A existência de telefone não prova WhatsApp. O mesmo zap-gate usado na
    // porta final confirma o número antes de montar texto ou criar outbox.
    const confirmation = await this.conversations.confirmWhatsappRecipient(contact);
    if (confirmation.status === 'unavailable') {
      this.logger.log(`[cadencia-runner] whatsapp nao confirmado lead=${insc.leadId} — passo pulado`);
      await this.writeCadenciaTimeline(
        insc.leadId,
        'cadencia_whats',
        cadencia,
        passo,
        'WhatsApp não enviado: o motor confirmou que este contato não possui WhatsApp.',
      );
      return { sent: false, skipReason: 'whatsapp_destinatario_sem_whatsapp' };
    }
    if (confirmation.status !== 'confirmed') {
      // Indisponibilidade técnica não vira falso negativo permanente: o runner
      // cai no catch externo e agenda nova verificação, sempre sem enviar.
      throw new Error('whatsapp_destinatario_nao_confirmado');
    }

    // Nada sai para quem pediu para sair — consulta ANTES de montar a mensagem.
    if (await this.blockedBySuppression(insc, { phone: contact })) {
      return { sent: false, skipReason: 'contato_suprimido' };
    }
    // A ABERTURA É DO VENDEDOR (30/07/2026). Se um humano já mandou mensagem para
    // este lead/telefone, a abertura FIXA do robô NÃO sai — seria a segunda abertura
    // no mesmo número, minutos depois da do vendedor. A cadência NÃO morre: o passo
    // é pulado e ela segue do passo seguinte (o resto da sequência continua valendo).
    if (isAbertura) {
      const humano = await this.commercialContactControl.hasHumanOpeningForLead({
        companyId: insc.companyId,
        leadId: insc.leadId,
        phone: contact,
      });
      if (humano?.found) {
        this.logger.log(
          `[cadencia-runner] abertura ja feita por humano lead=${insc.leadId}` +
          `${humano.failClosed ? ' (leitura falhou — fail-closed)' : ''} — passo de abertura pulado`,
        );
        await this.writeCadenciaTimeline(
          insc.leadId,
          'cadencia_whats',
          cadencia,
          passo,
          humano.failClosed
            ? 'Abertura do robô pulada por segurança (não deu para conferir o histórico da conversa).'
            : 'Abertura do robô pulada — o vendedor já falou com este contato. A cadência segue do próximo passo.',
        );
        return { sent: false, skipReason: 'human_opening_already_sent' };
      }
    }
    // ── TEXTO DA ABERTURA (31/07/2026) ───────────────────────────────────────
    // O corpo do passo é IGUAL para todo mundo. Agendar 10 disparos numa noite
    // mandava 10 mensagens idênticas na manhã seguinte — carimbo de robô, que é
    // o que faz a Meta derrubar o dispositivo. Quem agenda agora reserva uma
    // variante do dono ainda não usada (`aberturaCopy`); só a abertura usa esse
    // texto, e quem não tem reserva segue com o corpo do passo, como antes.
    const aberturaReservada = isAbertura ? String(insc.aberturaCopy || '').trim() : '';
    const bodyCru = aberturaReservada || String(passo.corpo || passo.titulo || '').trim();
    if (!bodyCru) return { sent: false, skipReason: 'passo_sem_corpo' };
    // RENDER ANTES DE ENVIAR (31/07/2026): o RISSO recebeu "{{funcionario}}"
    // LITERAL porque este caminho mandava o template cru. {{funcionario}} é a
    // PERSONA da empresa (identidade única); marcador desconhecido NUNCA vaza.
    const body = await this.renderCorpoWhats(insc.companyId, lead?.name || null, bodyCru, insc.responsavelId);
    if (!body) return { sent: false, skipReason: 'passo_sem_corpo' };

    // MESMO caminho do vendas-automation (queueOutboundForCompany) — disjuntor,
    // 1 numero=1 conexao, janela/gate de conexao viva, warmup e outbox com retry.
    await this.conversations.queueOutboundForCompany(insc.companyId, {
      to: contact,
      contactId: contact,
      body,
      messageType: 'text',
      sourceModule: 'vendas_prospeccao_bot',
      senderType: 'bot',
      // A CADÊNCIA SAI PELO CHIP DE QUEM É O LEAD (04/08/2026). Mesma lei do
      // vendas-automation (`senderUserId: campaign.createdByUserId`): sem isto, o
      // robô da Bianca falava pelo chip do dono e o lead respondia pro número
      // errado. `responsavelId` é o assignedUserId do lead no momento da inscrição.
      // Nulo = fallback de sempre (queueOutboundForCompany escolhe a sessão viva).
      senderUserId: insc.responsavelId || null,
      variables: {
        botType: 'prospeccao',
        cadenciaId: cadencia.id,
        cadenciaInscricaoId: insc.id,
        leadId: lead!.id,
        step: passo.dia,
        automationStepRunId: automationStepRunId || null,
      },
      automationStepRunId: automationStepRunId || undefined,
      flowState: { botActive: true, humanAssigned: false, flowResult: null },
    });
    return { sent: true };
  }

  // E-mail automático: enfileira pelo remetente do próprio tenant, atrás da flag
  // HBX_CADENCIA_EMAIL_ENABLED. Retorna true quando a outbox aceitou o passo.
  //  - flag OFF            -> comportamento de hoje: so grava timeline, zero envio.
  //  - lead sem e-mail     -> no-op (igual WhatsApp sem telefone): so timeline.
  //  - passo sem corpo     -> no-op: so timeline (igual WhatsApp sem body).
  //  - tenant nao config.  -> SKIP gracioso (errorCode COMPANY_EMAIL_NOT_CONFIGURED): timeline + segue.
  //  - erro de envio       -> timeline com o erro, cadencia AVANCA.
  private async executeEmailStep(
    insc: { id: string; leadId: string; companyId: number; responsavelId?: number | null },
    cadencia: CadenciaRow,
    passo: CadenciaPasso,
    automationStepRunId?: string | null,
  ): Promise<boolean> {
    // Flag OFF: comportamento de hoje (so timeline "cadencia_email", zero envio).
    if (!this.emailEnabled) {
      await this.writeEmailTimeline(insc.leadId, cadencia, passo, passo.corpo || '');
      return false;
    }

    const lead = (await this.prisma.vendasLead.findFirst({
      where: { id: insc.leadId, companyId: insc.companyId },
      select: { id: true, email: true, name: true },
    })) as { id: string; email: string | null; name: string | null } | null;

    const to = String(lead?.email || '').trim();
    if (!to) {
      // Sem e-mail: passo vira no-op (segue a cadencia), igual WhatsApp sem telefone.
      this.logger.log(`[cadencia-runner] email sem destinatario lead=${insc.leadId} — passo pulado`);
      await this.writeEmailTimeline(insc.leadId, cadencia, passo, 'Lead sem e-mail — passo pulado.');
      return false;
    }

    // Mesmo portão do WhatsApp: a marquinha global de contato vale para TODO canal,
    // e vem antes da supressão específica de e-mail (bounce/opt-out do provedor).
    if (await this.blockedBySuppression(insc, { email: to })) {
      await this.writeEmailTimeline(insc.leadId, cadencia, passo, 'Contato pediu para não ser mais chamado — cadência encerrada.');
      return false;
    }

    // S6 LEAD-CENTRICO (06-email-v1.md): contato pediu remoção/sem interesse OU
    // teve bounce permanente — mesma fonte lida pelo envio manual (CommercialEmailMessageLog).
    if (await this.isEmailSuppressed(to)) {
      this.logger.log(`[cadencia-runner] email suprimido lead=${insc.leadId} — passo pulado`);
      await this.writeEmailTimeline(insc.leadId, cadencia, passo, 'E-mail suprimido (remoção/bounce permanente) — passo pulado.');
      return false;
    }

    const subject = String(passo.titulo || 'Contato').slice(0, 200);
    const body = String(passo.corpo || '').trim();
    if (!body) {
      // Sem corpo: nao envia (igual WhatsApp sem body), so timeline.
      await this.writeEmailTimeline(insc.leadId, cadencia, passo, 'Passo de e-mail sem corpo — não enviado.');
      return false;
    }

    // S6 LEAD-CENTRICO: regra dura — e-mail comercial sem identidade do remetente
    // (nome+cargo+telefone) NAO SAI. Remetente = responsável pela inscrição de cadência.
    const identity = await this.senderIdentity!.resolveSummary(insc.responsavelId ?? null, insc.companyId);
    if (!identity.ready) {
      this.logger.log(`[cadencia-runner] email sem identidade lead=${insc.leadId} — passo pulado`);
      await this.writeEmailTimeline(insc.leadId, cadencia, passo, 'E-mail sem identidade do remetente — passo pulado.');
      return false;
    }
    const bodyHtml = this.emailTemplates!.buildHtmlEmail(body, {
      appendHtml: this.senderIdentity!.buildCommercialFooterHtml(identity),
    });
    const bodyWithSignature = [body, this.senderIdentity!.buildCommercialFooterText(identity)].filter(Boolean).join('\n\n');

    if (this.emailOutbox) {
      await this.emailOutbox.enqueue({
        companyId: insc.companyId,
        leadId: insc.leadId,
        automationStepRunId: automationStepRunId || null,
        recipient: to,
        subject,
        bodyText: bodyWithSignature,
        bodyHtml,
        sourceModule: 'cadencia_email',
        purpose: 'commercial_contact',
        idempotencyKey: automationStepRunId || `cadencia:${cadencia.id}:${insc.leadId}:${passo.dia}`,
        metadata: { cadenciaId: cadencia.id, passoDia: passo.dia },
      });
      await this.writeEmailTimeline(insc.leadId, cadencia, passo, `E-mail para ${to} entrou na fila de Automação.`);
      return true;
    }

    // Compatibilidade para testes unitários que constroem o service sem o módulo.
    try {
      const result = await this.mailer.sendForCompany(insc.companyId, { to, subject, text: bodyWithSignature, html: bodyHtml });
      if (result.ok) {
        await this.writeEmailTimeline(insc.leadId, cadencia, passo, `E-mail enviado para ${to}.`);
        return true;
      }
      if (result.errorCode === COMPANY_EMAIL_NOT_CONFIGURED) {
        // Tenant sem config de e-mail: SKIP gracioso, cadencia segue.
        await this.writeEmailTimeline(insc.leadId, cadencia, passo, 'E-mail não configurado — passo pulado.');
        return false;
      }
      await this.writeEmailTimeline(
        insc.leadId,
        cadencia,
        passo,
        `Falha no envio de e-mail: ${result.errorMessage || result.errorCode || 'erro desconhecido'}`,
      );
      return false;
    } catch (error: any) {
      // Best-effort: qualquer erro inesperado nao trava a cadencia.
      this.logger.warn(`[cadencia-runner] email falhou lead=${insc.leadId}: ${String(error?.message || error)}`);
      await this.writeEmailTimeline(insc.leadId, cadencia, passo, `Falha no envio de e-mail: ${String(error?.message || error)}`);
      return false;
    }
  }

  // Registra o evento de e-mail no timeline do lead (best-effort — nunca lanca).
  // Mantem o mesmo eventType/sourceType de hoje ('cadencia_email' / 'automacao').
  private async writeEmailTimeline(leadId: string, cadencia: CadenciaRow, passo: CadenciaPasso, description: string | null) {
    await this.writeCadenciaTimeline(leadId, 'cadencia_email', cadencia, passo, description);
  }

  // Mesmo registro, com o eventType do canal (best-effort — nunca lanca). O vendedor
  // precisa VER na ficha por que o robô não mandou a abertura dele.
  private async writeCadenciaTimeline(
    leadId: string,
    eventType: string,
    cadencia: CadenciaRow,
    passo: CadenciaPasso,
    description: string | null,
  ) {
    await this.prisma.vendasLeadTimelineEvent
      .create({
        data: {
          leadId,
          eventType,
          title: `Cadência (${cadencia.nome}): ${passo.titulo || (eventType === 'cadencia_email' ? 'E-mail' : 'WhatsApp')}`.slice(0, 200),
          description: (description || '').slice(0, 500) || null,
          sourceType: 'automacao',
        },
      })
      .catch(() => null);
  }

  // S6 LEAD-CENTRICO (06-email-v1.md): mesma fonte de supressão lida pelo envio
  // manual (vendas.service.ts assertEmailAllowsManualSend) — pedido de remoção OU
  // bounce permanente gravam CommercialEmailMessageLog.status opted_out/do_not_contact.
  // Defensivo: tabela ausente (ambiente sem a migration/tests sem mock) = nao suprime.
  private async isEmailSuppressed(recipientEmail: string): Promise<boolean> {
    try {
      if (typeof (this.prisma as any)?.commercialEmailMessageLog?.findFirst !== 'function') return false;
      const blocked = await (this.prisma as any).commercialEmailMessageLog.findFirst({
        where: { recipientEmail, status: { in: ['opted_out', 'do_not_contact'] } },
        orderBy: { createdAt: 'desc' },
        select: { status: true },
      });
      return Boolean(blocked);
    } catch {
      return false;
    }
  }

  // Atividade: usa o HOOK do WORM-12 (nao cria por caminho paralelo).
  private async executeAtividadeStep(
    insc: { leadId: string; companyId: number; responsavelId: number | null },
    cadencia: CadenciaRow,
    passo: CadenciaPasso,
  ) {
    await this.atividades
      .createFromAutomation({
        leadId: insc.leadId,
        companyId: insc.companyId,
        titulo: passo.titulo || `Cadência (${cadencia.nome})`,
        vencimento: new Date(),
        tipo: (passo.atividadeTipo as any) || 'ligacao',
        responsavelId: insc.responsavelId,
        origin: 'automacao',
      })
      .catch((e) => this.logger.warn(`[cadencia-runner] atividade falhou lead=${insc.leadId}: ${String(e?.message || e)}`));
  }

  private addDays(base: Date, days: number): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + Math.max(0, Math.trunc(days)));
    return d;
  }

  // Exposto para o controller de diagnostico/teste manual (nao dispara sem flag).
  get maxWhatsStepsPerCadence() {
    return MAX_WHATS_STEPS_PER_CADENCE;
  }
}
