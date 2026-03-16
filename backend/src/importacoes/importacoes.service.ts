import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ConversationsService } from '../messaging/conversations.service';
import { WhatsAppAuditService } from '../messaging/whatsapp-audit.service';
import {
  CreateAlertaImportacaoDto,
  CreateImportacaoDto,
  FollowupGlobalQueryDto,
  GraficoQueryDto,
  HistoricoQueryDto,
  IMPORTACAO_ACOES,
  ReabrirImportacaoDto,
  UpdateImportacaoDto,
  UpdatePermissaoRoleDto,
} from './dto/importacoes.dto';
import structuralDefaults from '../bootstrap/structural-defaults.json';

type ImportacaoAcao = (typeof IMPORTACAO_ACOES)[number];

const ROLE_DEFAULTS = structuralDefaults.companyRolePermissions as Record<string, Record<ImportacaoAcao, boolean>>;

const FINALIZACAO_OBRIGATORIOS = [
  'fornecedorId',
  'pais',
  'portoOrigem',
  'portoDestino',
  'dataEmbarque',
  'dataAtracacao',
  'valorUsd',
  'valorDolar',
  'pesoKg',
] as const;

@Injectable()
export class ImportacoesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImportacoesService.name);
  private alertJobHandle: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly conversations: ConversationsService,
    private readonly whatsappAudit: WhatsAppAuditService,
  ) {}

  async onModuleInit() {
    await this.ensureModuleRegistration();
    this.alertJobHandle = setInterval(() => {
      this.runDailyAlertJob().catch((e) => this.logger.error(e?.message || e));
    }, 60 * 60 * 1000);
    this.runDailyAlertJob().catch((e) => this.logger.error(e?.message || e));
  }

  onModuleDestroy() {
    if (this.alertJobHandle) clearInterval(this.alertJobHandle);
    this.alertJobHandle = null;
  }

  private normalizeRole(role: string | null | undefined) {
    const raw = String(role || '').trim().toUpperCase();
    if (raw === 'ADMIN') return 'ADMIN';
    if (raw === 'GERENTE' || raw === 'MANAGER') return 'GERENTE';
    return 'USUARIO';
  }

  private ensureCompanyIdFromUser(user: any): number {
    const companyId = Number(user?.companyId);
    if (!companyId) throw new ForbiddenException('Empresa nao identificada');
    return companyId;
  }

  private isAdmin(user: any): boolean {
    return this.normalizeRole(user?.role) === 'ADMIN' || Boolean(user?.isSystemMaster);
  }

  private async ensureModuleRegistration() {
    const moduleItem = await this.prisma.systemModule.upsert({
      where: { key: 'follow_up_internacional' },
      update: {
        name: 'Follow Up Internacional',
        description: 'Gestao visual de importacoes, historico financeiro e alertas inteligentes.',
        defaultEnabled: false,
        companyAssignable: true,
        serviceUrl: '/dashboard/importacoes/followup-global',
      },
      create: {
        key: 'follow_up_internacional',
        name: 'Follow Up Internacional',
        description: 'Gestao visual de importacoes, historico financeiro e alertas inteligentes.',
        defaultEnabled: false,
        companyAssignable: true,
        serviceUrl: '/dashboard/importacoes/followup-global',
      },
    });

    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "CompanyModule" ("companyId", "moduleId", "enabled", "createdAt", "updatedAt")
      SELECT c.id, ${moduleItem.id}, false, NOW(), NOW()
      FROM "Company" c
      ON CONFLICT ("companyId", "moduleId") DO NOTHING;
    `);
  }

  private toFloat(value: any): number | null | undefined {
    if (value === null) return null;
    if (value === undefined || value === '') return undefined;
    const parsed = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(parsed)) throw new BadRequestException('Valor numerico invalido');
    return parsed;
  }

  private toDate(value: any): Date | null | undefined {
    if (value === null) return null;
    if (value === undefined || value === '') return undefined;
    const dt = new Date(String(value));
    if (Number.isNaN(dt.getTime())) throw new BadRequestException('Data invalida');
    return dt;
  }

  private async resolveTransitDaysByPortNames(companyId: number, portoOrigem?: string | null, portoDestino?: string | null) {
    const origemNome = String(portoOrigem || '').trim();
    const destinoNome = String(portoDestino || '').trim();
    if (!origemNome || !destinoNome) return null;

    const [origem, destino] = await Promise.all([
      this.prisma.cadastroPorto.findFirst({
        where: { empresaId: companyId, nome: { equals: origemNome, mode: 'insensitive' } },
        select: { id: true },
      }),
      this.prisma.cadastroPorto.findFirst({
        where: { empresaId: companyId, nome: { equals: destinoNome, mode: 'insensitive' } },
        select: { id: true },
      }),
    ]);
    if (!origem || !destino) return null;

    const tt = await this.prisma.cadastroTransitTime.findUnique({
      where: {
        empresaId_portoOrigemId_portoDestinoId: {
          empresaId: companyId,
          portoOrigemId: origem.id,
          portoDestinoId: destino.id,
        },
      },
      select: { dias: true },
    });
    return tt?.dias ?? null;
  }

  private addDays(base: Date, days: number) {
    const result = new Date(base);
    result.setDate(result.getDate() + Number(days || 0));
    return result;
  }

  private normalizePayload(input: CreateImportacaoDto | UpdateImportacaoDto) {
    const data: any = {};
    if ('numeroPedido' in input && input.numeroPedido !== undefined) data.numeroPedido = String(input.numeroPedido).trim();
    if ('fornecedorId' in input && input.fornecedorId !== undefined) data.fornecedorId = input.fornecedorId ? String(input.fornecedorId).trim() : null;
    if ('pais' in input && input.pais !== undefined) data.pais = input.pais ? String(input.pais).trim() : null;
    if ('portoOrigem' in input && input.portoOrigem !== undefined) data.portoOrigem = input.portoOrigem ? String(input.portoOrigem).trim() : null;
    if ('portoDestino' in input && input.portoDestino !== undefined) data.portoDestino = input.portoDestino ? String(input.portoDestino).trim() : null;
    if ('dataEmbarque' in input && input.dataEmbarque !== undefined) data.dataEmbarque = this.toDate(input.dataEmbarque);
    if ('dataAtracacao' in input && input.dataAtracacao !== undefined) data.dataAtracacao = this.toDate(input.dataAtracacao);
    if ('valorUsd' in input && input.valorUsd !== undefined) data.valorUsd = this.toFloat(input.valorUsd);
    if ('valorDolar' in input && input.valorDolar !== undefined) data.valorDolar = this.toFloat(input.valorDolar);
    if ('pesoKg' in input && input.pesoKg !== undefined) data.pesoKg = this.toFloat(input.pesoKg);
    if ('status' in input && input.status !== undefined) data.status = String(input.status).trim().toUpperCase();
    return data;
  }

  private computeValorTotalReal(valorUsd?: number | null, valorDolar?: number | null): number | null {
    if (valorUsd === null || valorDolar === null) return null;
    if (valorUsd === undefined || valorDolar === undefined) return null;
    return Number((Number(valorUsd) * Number(valorDolar)).toFixed(2));
  }

  private calcRsKg(item: any): number | null {
    const peso = Number(item?.pesoKg || 0);
    const total = Number(item?.valorTotalReal || 0);
    if (!peso || peso <= 0 || !total) return null;
    return Number((total / peso).toFixed(4));
  }

  private async ensureCompanyPermissions(companyId: number) {
    for (const role of ['ADMIN', 'GERENTE', 'USUARIO']) {
      for (const acao of IMPORTACAO_ACOES) {
        await this.prisma.importacaoPermissao.upsert({
          where: { empresaId_role_acao: { empresaId: companyId, role, acao } },
          update: {},
          create: {
            empresaId: companyId,
            role,
            acao,
            allowed: ROLE_DEFAULTS[role][acao],
          },
        });
      }
    }
  }

  private async assertPermission(user: any, acao: ImportacaoAcao) {
    const companyId = this.ensureCompanyIdFromUser(user);
    if (this.isAdmin(user)) return companyId;

    await this.ensureCompanyPermissions(companyId);
    const role = this.normalizeRole(user?.role);
    const row = await this.prisma.importacaoPermissao.findUnique({
      where: { empresaId_role_acao: { empresaId: companyId, role, acao } },
    });
    if (!row?.allowed) {
      throw new ForbiddenException(`Sem permissao para: ${acao}`);
    }
    return companyId;
  }

  private async requireImportacao(companyId: number, id: number) {
    const row = await this.prisma.importacao.findUnique({ where: { id } });
    if (!row || row.empresaId !== companyId) throw new NotFoundException('Importacao nao encontrada');
    return row;
  }

  private buildUserLabel(user: any) {
    return String(user?.username || user?.email || `usuario_${user?.id || 'desconhecido'}`);
  }

  private async writeLog(tx: any, importacaoId: number, user: any, alteracao: string, before?: any, after?: any, versao?: number) {
    await tx.importacaoLog.create({
      data: {
        importacaoId,
        alteracao,
        usuario: this.buildUserLabel(user),
        versao: versao ?? null,
        dadosAntes: before ? JSON.stringify(before) : null,
        dadosDepois: after ? JSON.stringify(after) : null,
      },
    });
  }

  async create(user: any, dto: CreateImportacaoDto, pdfPath?: string | null) {
    const companyId = await this.assertPermission(user, 'CRIAR_IMPORTACAO');
    const data = this.normalizePayload(dto);
    if (!data.numeroPedido) throw new BadRequestException('numero_pedido e obrigatorio');
    if (!data.dataAtracacao && data.dataEmbarque && data.portoOrigem && data.portoDestino) {
      const transitDays = await this.resolveTransitDaysByPortNames(companyId, data.portoOrigem, data.portoDestino);
      if (transitDays && transitDays > 0) {
        data.dataAtracacao = this.addDays(data.dataEmbarque, transitDays);
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.importacao.create({
        data: {
          empresaId: companyId,
          numeroPedido: data.numeroPedido,
          fornecedorId: data.fornecedorId ?? null,
          pais: data.pais ?? null,
          portoOrigem: data.portoOrigem ?? null,
          portoDestino: data.portoDestino ?? null,
          dataEmbarque: data.dataEmbarque,
          dataAtracacao: data.dataAtracacao,
          valorUsd: data.valorUsd ?? null,
          valorDolar: data.valorDolar ?? null,
          pesoKg: data.pesoKg ?? null,
          valorTotalReal: this.computeValorTotalReal(data.valorUsd, data.valorDolar),
          status: 'EM_CADASTRO',
          pdfPath: pdfPath || null,
          createdBy: Number(user?.id || 0) || null,
        },
      });

      await this.writeLog(tx, row.id, user, 'CRIACAO', null, row, row.versao);
      return row;
    });

    return created;
  }

  async list(user: any) {
    const companyId = this.ensureCompanyIdFromUser(user);
    return this.prisma.importacao.findMany({
      where: { empresaId: companyId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
  }

  async getById(user: any, id: number) {
    const companyId = this.ensureCompanyIdFromUser(user);
    const importacao = await this.requireImportacao(companyId, id);
    const logs = await this.prisma.importacaoLog.findMany({
      where: { importacaoId: id },
      orderBy: { data: 'desc' },
      take: 50,
    });
    return { ...importacao, logs };
  }

  async update(user: any, id: number, dto: UpdateImportacaoDto, pdfPath?: string | null) {
    const companyId = await this.assertPermission(user, 'EDITAR_IMPORTACAO');
    const current = await this.requireImportacao(companyId, id);

    if (current.status === 'FINALIZADO' && !this.isAdmin(user)) {
      throw new ForbiddenException('Importacao finalizada so pode ser editada por ADMIN');
    }

    const data = this.normalizePayload(dto);
    if (data.status === 'FINALIZADO') {
      throw new BadRequestException('Use o endpoint de finalizacao para concluir a importacao');
    }
    const nextPortoOrigem = data.portoOrigem !== undefined ? data.portoOrigem : current.portoOrigem;
    const nextPortoDestino = data.portoDestino !== undefined ? data.portoDestino : current.portoDestino;
    const nextDataEmbarque = data.dataEmbarque !== undefined ? data.dataEmbarque : current.dataEmbarque;
    if (data.dataAtracacao === undefined && nextDataEmbarque && nextPortoOrigem && nextPortoDestino) {
      const transitDays = await this.resolveTransitDaysByPortNames(companyId, nextPortoOrigem, nextPortoDestino);
      if (transitDays && transitDays > 0) {
        data.dataAtracacao = this.addDays(new Date(nextDataEmbarque), transitDays);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextVersion = (current.versao || 1) + 1;
      const row = await tx.importacao.update({
        where: { id },
        data: {
          ...data,
          pdfPath: pdfPath ? pdfPath : undefined,
          valorTotalReal: this.computeValorTotalReal(
            data.valorUsd !== undefined ? data.valorUsd : current.valorUsd,
            data.valorDolar !== undefined ? data.valorDolar : current.valorDolar,
          ),
          versao: nextVersion,
        },
      });
      await this.writeLog(tx, id, user, 'ATUALIZACAO', current, row, row.versao);
      return row;
    });

    return updated;
  }

  async attachPdf(user: any, id: number, pdfPath: string) {
    const companyId = await this.assertPermission(user, 'EDITAR_IMPORTACAO');
    const current = await this.requireImportacao(companyId, id);
    if (current.status === 'FINALIZADO' && !this.isAdmin(user)) {
      throw new ForbiddenException('Importacao finalizada so pode ser editada por ADMIN');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.importacao.update({
        where: { id },
        data: {
          pdfPath,
          versao: (current.versao || 1) + 1,
        },
      });
      await this.writeLog(tx, id, user, 'ANEXO_PDF', current, row, row.versao);
      return row;
    });
    return updated;
  }

  async finalizar(user: any, id: number) {
    const companyId = await this.assertPermission(user, 'FINALIZAR_IMPORTACAO');
    const current = await this.requireImportacao(companyId, id);
    if (current.status === 'FINALIZADO') return current;

    const missing = FINALIZACAO_OBRIGATORIOS.filter((key) => {
      const v = (current as any)[key];
      if (v === null || v === undefined) return true;
      if (typeof v === 'string' && !v.trim()) return true;
      return false;
    });
    if (missing.length) {
      throw new BadRequestException(`Campos obrigatorios para finalizar: ${missing.join(', ')}`);
    }

    const valorTotalReal = this.computeValorTotalReal(current.valorUsd, current.valorDolar);
    if (valorTotalReal === null) {
      throw new BadRequestException('Nao foi possivel calcular valor_total_real');
    }

    const finalized = await this.prisma.$transaction(async (tx) => {
      const row = await tx.importacao.update({
        where: { id },
        data: {
          status: 'FINALIZADO',
          valorTotalReal,
          finalizedAt: new Date(),
          finalizedBy: Number(user?.id || 0) || null,
          versao: (current.versao || 1) + 1,
        },
      });
      await this.writeLog(tx, id, user, 'FINALIZACAO', current, row, row.versao);
      return row;
    });
    return finalized;
  }

  async reabrir(user: any, id: number, dto: ReabrirImportacaoDto) {
    const companyId = await this.assertPermission(user, 'REABRIR_IMPORTACAO');
    if (!this.isAdmin(user)) {
      throw new ForbiddenException('Somente ADMIN pode reabrir importacoes finalizadas');
    }

    const current = await this.requireImportacao(companyId, id);
    if (current.status !== 'FINALIZADO') {
      throw new BadRequestException('Apenas importacoes finalizadas podem ser reabertas');
    }

    const statusDestino = dto?.statusDestino || 'EM_CADASTRO';
    const reopened = await this.prisma.$transaction(async (tx) => {
      const row = await tx.importacao.update({
        where: { id },
        data: {
          status: statusDestino,
          reabertoPor: Number(user?.id || 0) || null,
          finalizedAt: null,
          finalizedBy: null,
          versao: (current.versao || 1) + 1,
        },
      });
      await this.writeLog(tx, id, user, 'REABERTURA', current, row, row.versao);
      return row;
    });
    return reopened;
  }

  async delete(user: any, id: number, force = false, motivo?: string | null) {
    if (!this.isAdmin(user)) throw new ForbiddenException('Somente ADMIN pode excluir importacoes');
    const companyId = this.ensureCompanyIdFromUser(user);
    const current = await this.requireImportacao(companyId, id);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const logsCount = await tx.importacaoLog.count({ where: { importacaoId: id } });
        const alertCount = await tx.alertaImportacao.count({ where: { importacaoId: id } });
        if (!force && (logsCount > 0 || alertCount > 0)) {
          throw new BadRequestException('Nao autorizado: existem registros relacionados (logs/alertas). Use ?force=true para remover dependencias.');
        }

        if (force) {
          await tx.importacaoLog.deleteMany({ where: { importacaoId: id } });
          await tx.alertaImportacao.deleteMany({ where: { importacaoId: id } });
        }

        const deleted = await tx.importacao.delete({ where: { id } });
        await tx.deletionRecord.create({
          data: {
            moduleKey: 'follow_up_internacional',
            entityType: 'Importacao',
            entityId: String(deleted.id),
            companyId,
            motivo: motivo ? String(motivo).trim() : null,
            snapshot: JSON.stringify({
              importacao: current,
              dependencias: { logsCount, alertCount },
              deletedBy: this.buildUserLabel(user),
            }),
            deletedByUserId: Number(user?.id || 0) || null,
          },
        });
        return { ok: true, id: deleted.id };
      });
      return result;
    } catch (e: any) {
      const code = e?.code || (e?.originalError && e.originalError.code) || null;
      if (code === 'P2003') {
        throw new BadRequestException('Nao foi possivel excluir: existem registros dependentes. Use ?force=true para remover dependencias.');
      }
      if (e instanceof BadRequestException || e instanceof ForbiddenException || e instanceof NotFoundException) throw e;
      this.logger.error(e?.message || e);
      throw new BadRequestException('Falha ao excluir importacao');
    }
  }

  private buildImportacaoWhere(companyId: number, q: HistoricoQueryDto | FollowupGlobalQueryDto | GraficoQueryDto) {
    const where: any = { empresaId: companyId };
    const ands: any[] = [];
    if ((q as any).de || (q as any).ate) {
      ands.push({
        dataEmbarque: {
          gte: (q as any).de ? new Date((q as any).de) : undefined,
          lte: (q as any).ate ? new Date((q as any).ate) : undefined,
        },
      });
    }
    if ((q as any).fornecedor) ands.push({ fornecedorId: { contains: String((q as any).fornecedor), mode: 'insensitive' } });
    if ((q as any).status) ands.push({ status: String((q as any).status).toUpperCase() });
    if ((q as any).porto) {
      ands.push({
        OR: [
          { portoOrigem: { contains: String((q as any).porto), mode: 'insensitive' } },
          { portoDestino: { contains: String((q as any).porto), mode: 'insensitive' } },
        ],
      });
    }
    if ((q as any).numero) ands.push({ numeroPedido: { contains: String((q as any).numero), mode: 'insensitive' } });
    if ((q as any).dolarMin !== undefined || (q as any).dolarMax !== undefined) {
      ands.push({
        valorDolar: {
          gte: (q as any).dolarMin !== undefined ? Number((q as any).dolarMin) : undefined,
          lte: (q as any).dolarMax !== undefined ? Number((q as any).dolarMax) : undefined,
        },
      });
    }
    if (ands.length) where.AND = ands;
    return where;
  }

  async historico(user: any, query: HistoricoQueryDto) {
    const companyId = await this.assertPermission(user, 'VER_HISTORICO_FINANCEIRO');
    const where = this.buildImportacaoWhere(companyId, query);
    const rows = await this.prisma.importacao.findMany({
      where,
      orderBy: [{ dataAtracacao: 'desc' }, { id: 'desc' }],
    });

    return rows.map((item) => ({
      id: item.id,
      pedido: item.numeroPedido,
      fornecedor: item.fornecedorId,
      usd: item.valorUsd,
      dolar: item.valorDolar,
      peso: item.pesoKg,
      rsKg: this.calcRsKg(item),
      status: item.status,
      dataAtracacao: item.dataAtracacao,
      portoOrigem: item.portoOrigem,
      portoDestino: item.portoDestino,
    }));
  }

  async graficos(user: any, query: GraficoQueryDto) {
    const companyId = await this.assertPermission(user, 'VER_HISTORICO_FINANCEIRO');
    const where = this.buildImportacaoWhere(companyId, query);
    const rows = await this.prisma.importacao.findMany({
      where,
      orderBy: { dataEmbarque: 'asc' },
    });

    const grafico1 = rows.map((item) => ({
      dataEmbarque: item.dataEmbarque,
      rsKg: this.calcRsKg(item),
      valorUsd: item.valorUsd,
      valorDolar: item.valorDolar,
      pedido: item.numeroPedido,
    }));

    const grafico2 = rows.map((item) => ({
      data: item.dataEmbarque,
      valorDolar: item.valorDolar,
      pedido: item.numeroPedido,
    }));

    return { grafico1, grafico2 };
  }

  private statusColor(status: string) {
    const map: Record<string, string> = {
      EM_CADASTRO: 'yellow',
      EM_PRODUCAO: 'amber',
      EM_TRANSITO: 'orange',
      ATRACADO: 'teal',
      FINALIZADO: 'green',
      CANCELADO: 'red',
    };
    return map[status] || 'gray';
  }

  private clampProgress(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Number(value.toFixed(1))));
  }

  async followupGlobal(user: any, query: FollowupGlobalQueryDto) {
    const companyId = this.ensureCompanyIdFromUser(user);
    const where = this.buildImportacaoWhere(companyId, query);
    const rows = await this.prisma.importacao.findMany({
      where,
      orderBy: [{ status: 'asc' }, { dataEmbarque: 'asc' }],
    });

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const bloco1 = rows
      .filter((item) => item.status === 'EM_CADASTRO' || item.status === 'EM_PRODUCAO')
      .map((item) => ({
        id: item.id,
        numeroPedido: item.numeroPedido,
        fornecedor: item.fornecedorId,
        pais: item.pais,
        usdTotal: item.valorUsd,
        previsaoEmbarque: item.dataEmbarque,
        status: item.status,
        statusColor: this.statusColor(item.status),
        icon: 'factory',
      }));

    const bloco2 = rows
      .filter((item) => item.status === 'EM_TRANSITO' || item.status === 'ATRACADO')
      .map((item) => {
        const emb = item.dataEmbarque ? new Date(item.dataEmbarque).getTime() : null;
        const atr = item.dataAtracacao ? new Date(item.dataAtracacao).getTime() : null;
        const progresso = emb && atr && atr > emb ? this.clampProgress(((now - emb) / (atr - emb)) * 100) : 0;
        const diasRestantes = atr ? Math.ceil((atr - now) / oneDay) : null;
        return {
          id: item.id,
          numeroPedido: item.numeroPedido,
          fornecedor: item.fornecedorId,
          dataEmbarque: item.dataEmbarque,
          dataAtracacao: item.dataAtracacao,
          diasRestantes,
          progresso,
          dolar: item.valorDolar,
          peso: item.pesoKg,
          status: item.status,
          statusColor: this.statusColor(item.status),
          icon: 'ship',
        };
      });

    const bloco3 = rows
      .filter((item) => item.status === 'FINALIZADO')
      .map((item) => ({
        id: item.id,
        pedido: item.numeroPedido,
        dataChegada: item.dataAtracacao,
        rsKgFinal: this.calcRsKg(item),
        dolar: item.valorDolar,
        status: item.status,
        statusColor: 'green',
        icon: 'check',
      }));

    const resumo = {
      emTransito: bloco2.length,
      emProducao: bloco1.filter((item) => item.status === 'EM_PRODUCAO').length,
      concluidas: bloco3.length,
      usdTotalEmAberto: Number(
        rows
          .filter((item) => item.status !== 'FINALIZADO' && item.status !== 'CANCELADO')
          .reduce((acc, item) => acc + Number(item.valorUsd || 0), 0)
          .toFixed(2),
      ),
      pesoTotalVindo: Number(
        rows
          .filter((item) => item.status !== 'FINALIZADO' && item.status !== 'CANCELADO')
          .reduce((acc, item) => acc + Number(item.pesoKg || 0), 0)
          .toFixed(2),
      ),
    };

    return { resumo, bloco1, bloco2, bloco3 };
  }

  async listPermissoes(user: any) {
    const companyId = this.ensureCompanyIdFromUser(user);
    if (!this.isAdmin(user)) throw new ForbiddenException('Somente ADMIN pode gerenciar permissoes');
    await this.ensureCompanyPermissions(companyId);

    const rows = await this.prisma.importacaoPermissao.findMany({
      where: { empresaId: companyId },
      orderBy: [{ role: 'asc' }, { acao: 'asc' }],
    });

    const grouped: Record<string, Array<{ acao: string; allowed: boolean }>> = { ADMIN: [], GERENTE: [], USUARIO: [] };
    for (const row of rows) {
      if (!grouped[row.role]) grouped[row.role] = [];
      grouped[row.role].push({ acao: row.acao, allowed: row.allowed });
    }
    return grouped;
  }

  async updatePermissoes(user: any, dto: UpdatePermissaoRoleDto) {
    const companyId = this.ensureCompanyIdFromUser(user);
    if (!this.isAdmin(user)) throw new ForbiddenException('Somente ADMIN pode gerenciar permissoes');
    const role = this.normalizeRole(dto.role);

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.permissoes || []) {
        await tx.importacaoPermissao.upsert({
          where: { empresaId_role_acao: { empresaId: companyId, role, acao: item.acao } },
          update: { allowed: Boolean(item.allowed) },
          create: { empresaId: companyId, role, acao: item.acao, allowed: Boolean(item.allowed) },
        });
      }
    });
    return this.listPermissoes(user);
  }

  async createAlerta(user: any, importacaoId: number, dto: CreateAlertaImportacaoDto) {
    const companyId = await this.assertPermission(user, 'CRIAR_ALERTA');
    const importacao = await this.requireImportacao(companyId, importacaoId);
    if (!importacao.dataAtracacao) throw new BadRequestException('Defina data de atracacao antes de criar alerta');

    const alerta = await this.prisma.alertaImportacao.create({
      data: {
        importacaoId,
        empresaId: companyId,
        diasAntes: Number(dto.diasAntes || 0),
        enviarEmail: Boolean(dto.enviarEmail),
        enviarWhatsapp: Boolean(dto.enviarWhatsapp),
        listaEmails: JSON.stringify(dto.listaEmails || []),
        listaWhatsapp: JSON.stringify(dto.listaWhatsapp || []),
      },
    });

    await this.prisma.importacaoLog.create({
      data: {
        importacaoId,
        alteracao: 'ALERTA_CRIADO',
        usuario: this.buildUserLabel(user),
        dadosDepois: JSON.stringify(alerta),
      },
    });

    return alerta;
  }

  async listAlertas(user: any, importacaoId: number) {
    const companyId = this.ensureCompanyIdFromUser(user);
    await this.requireImportacao(companyId, importacaoId);
    return this.prisma.alertaImportacao.findMany({
      where: { importacaoId, empresaId: companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private formatDateYmd(date: Date) {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private parseStringArray(json: string | null | undefined) {
    if (!json) return [] as string[];
    try {
      const arr = JSON.parse(json);
      if (!Array.isArray(arr)) return [];
      return arr.map((x) => String(x || '').trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  private async sendWhatsapp(companyId: number, to: string, body: string) {
    const templateName = String(process.env.WHATSAPP_FOLLOWUP_TEMPLATE_NAME || '').trim();
    const templateLanguage = String(process.env.WHATSAPP_FOLLOWUP_TEMPLATE_LANGUAGE || 'pt_BR').trim();

    try {
      const queued = await this.conversations.queueOutboundForCompany(companyId, {
        to,
        body,
        messageType: 'text',
        sourceModule: 'follow_up_internacional',
      });
      return { ok: true, queued };
    } catch (e: any) {
      const message = String(e?.message || '');
      const needsTemplate = message.toLowerCase().includes('24h') || message.toLowerCase().includes('template');
      if (needsTemplate && templateName) {
        const queuedTemplate = await this.conversations.queueOutboundForCompany(companyId, {
          to,
          body,
          messageType: 'template',
          templateName,
          templateLanguage,
          sourceModule: 'follow_up_internacional',
        });
        return { ok: true, queued: queuedTemplate, usedTemplate: true };
      }
      return { ok: false, reason: message || 'failed_to_enqueue' };
    }
  }

  async runDailyAlertJob() {
    const now = new Date();
    const today = this.formatDateYmd(now);
    const pendentes = await this.prisma.alertaImportacao.findMany({
      where: { disparado: false },
      include: {
        importacao: true,
      },
      take: 500,
      orderBy: { id: 'asc' },
    });

    for (const alerta of pendentes) {
      try {
        if (!alerta.importacao?.dataAtracacao) continue;
        if (alerta.importacao.status === 'CANCELADO') continue;

        const target = new Date(alerta.importacao.dataAtracacao);
        target.setUTCDate(target.getUTCDate() - Number(alerta.diasAntes || 0));
        const targetYmd = this.formatDateYmd(target);
        if (today !== targetYmd) continue;

        const assunto = `Alerta de importacao ${alerta.importacao.numeroPedido}`;
        const texto = [
          `Pedido: ${alerta.importacao.numeroPedido}`,
          `Status: ${alerta.importacao.status}`,
          `Atracacao prevista: ${alerta.importacao.dataAtracacao.toISOString().slice(0, 10)}`,
          `Alerta: faltam ${alerta.diasAntes} dia(s).`,
        ].join('\n');

        if (alerta.enviarEmail) {
          const emails = this.parseStringArray(alerta.listaEmails);
          for (const email of emails) {
            await this.mailService.sendMail({ to: email, subject: assunto, text: texto });
          }
        }

        if (alerta.enviarWhatsapp) {
          const phones = this.parseStringArray(alerta.listaWhatsapp);
          const whatsappErrors: Array<{ phone: string; reason: string }> = [];
          for (const phone of phones) {
            const sent = await this.sendWhatsapp(alerta.empresaId, phone, texto);
            if (!sent.ok) {
              whatsappErrors.push({ phone, reason: String((sent as any).reason || 'erro_desconhecido') });
            }
          }
          if (whatsappErrors.length > 0) {
            await this.prisma.importacaoLog.create({
              data: {
                importacaoId: alerta.importacaoId,
                alteracao: 'ALERTA_WHATSAPP_FALHA',
                usuario: 'job_diario',
                dadosDepois: JSON.stringify({ alertaId: alerta.id, erros: whatsappErrors }),
              },
            });
            await this.whatsappAudit.log({
              companyId: alerta.empresaId,
              scope: 'follow_up_internacional',
              event: 'alert_dispatch_failed',
              level: 'ERROR',
              message: `Falha ao enfileirar alerta WhatsApp da importacao ${alerta.importacao.numeroPedido}`,
              metadata: { alertaId: alerta.id, errors: whatsappErrors },
            });
            continue;
          }
        }

        await this.prisma.$transaction(async (tx) => {
          await tx.alertaImportacao.update({
            where: { id: alerta.id },
            data: { disparado: true, disparadoEm: new Date() },
          });
          await tx.importacaoLog.create({
            data: {
              importacaoId: alerta.importacaoId,
              alteracao: 'ALERTA_DISPARADO',
              usuario: 'job_diario',
              dadosDepois: JSON.stringify({ alertaId: alerta.id, diasAntes: alerta.diasAntes }),
            },
          });
        });
        await this.whatsappAudit.log({
          companyId: alerta.empresaId,
          scope: 'follow_up_internacional',
          event: 'alert_dispatched',
          message: `Alerta disparado para importacao ${alerta.importacao.numeroPedido}`,
          metadata: { alertaId: alerta.id, diasAntes: alerta.diasAntes },
        });
      } catch (e: any) {
        this.logger.warn(`Falha no alerta ${alerta.id}: ${e?.message || e}`);
      }
    }

    return { ok: true, processados: pendentes.length };
  }
}
