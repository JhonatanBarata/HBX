import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NucleoCadastroService } from '../nucleo/nucleo-cadastro.service';
import { LogisticaAgendaService } from './logistica-agenda.service';
import {
  parseDiasSemanaFlexivel,
  parseLinhaTexto,
  parsePlanilhaBuffer,
  quebrarEmLinhas,
  type ParsedItemFields,
} from './logistica-importacao-parser.util';
import { classificarCampoBasico, sanitizarEndereco } from './logistica-importacao-sanitizacao.util';
import type { PatchImportacaoItemDto } from './dto/logistica-importacao.dto';

/**
 * F4 (27/07, PR27072026-ROTA-3-NIVEIS) — MÁQUINA DE ENGOLIR LISTA PODRE.
 *
 * Orquestra a quarentena: cria lote (arquivo/texto/foto) → sanitiza em lote (CNEFE,
 * reusado) → efetiva (SÓ item VERDE vira CustomerProfile + LogisticaPlanoEntrega) →
 * ou descarta. A agenda (generateDay) NUNCA vê nada daqui até EFETIVAR — nenhum
 * método deste serviço fora de `efetivarItem` cria CustomerProfile/Plano/Entrega.
 *
 * Reuso deliberado (não duplicado):
 *  - régua verde/vermelho: logistica-importacao-sanitizacao.util.ts, que chama o
 *    MESMO resolverCuraCnefe de logistica-conferencia.service.ts;
 *  - criação de conta/contato: NucleoCadastroService#createConta (o MESMO caminho
 *    idempotente do cadastro manual do vendedor — chave por telefone/documento);
 *  - criação do plano de entrega: LogisticaAgendaService#createPlan (o MESMO
 *    endpoint que a tela de Agenda usa pra "Novo cliente").
 */
@Injectable()
export class LogisticaImportacaoService {
  private readonly logger = new Logger(LogisticaImportacaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nucleoCadastro: NucleoCadastroService,
    private readonly agenda: LogisticaAgendaService,
  ) {}

  // ── criação de lote ──────────────────────────────────────────────────────────

  async criarLoteArquivo(companyId: number, userId: number, file: any) {
    if (!file?.buffer?.length) throw new BadRequestException('Envie um arquivo de planilha (.xlsx/.csv).');
    if (file.buffer.length > ARQUIVO_MAX_BYTES) {
      throw new BadRequestException('O arquivo deve ter no máximo 10 MB.');
    }
    let linhas: Array<{ bruto: string; fields: ParsedItemFields }>;
    try {
      linhas = parsePlanilhaBuffer(Buffer.from(file.buffer));
    } catch (e) {
      throw new BadRequestException('Não consegui ler a planilha. Confira se é um .xlsx/.csv válido.');
    }
    if (!linhas.length) throw new BadRequestException('Planilha sem nenhuma linha com dado.');

    const lote = await this.prisma.logisticaImportacaoLote.create({
      data: {
        companyId,
        origem: 'ARQUIVO',
        nomeArquivo: String(file.originalname || 'planilha').slice(0, 180),
        criadoPorUserId: userId || null,
      },
    });
    await this.inserirItens(companyId, lote.id, linhas);
    return this.obterLoteResumo(companyId, lote.id);
  }

  async criarLoteTexto(companyId: number, userId: number, dto: { texto: string; cidadePadrao?: string; ufPadrao?: string }) {
    const linhasTexto = quebrarEmLinhas(dto.texto);
    if (!linhasTexto.length) throw new BadRequestException('Cole ao menos 1 linha de texto.');
    if (linhasTexto.length > TEXTO_MAX_LINHAS) {
      throw new BadRequestException(`Muitas linhas de uma vez (máximo ${TEXTO_MAX_LINHAS}). Cole em partes menores.`);
    }
    const opts = {
      cidadePadrao: dto.cidadePadrao?.trim() || null,
      ufPadrao: dto.ufPadrao?.trim().toUpperCase().slice(0, 2) || null,
    };
    const linhas = linhasTexto.map((bruto) => ({ bruto, fields: parseLinhaTexto(bruto, opts) }));

    const lote = await this.prisma.logisticaImportacaoLote.create({
      data: { companyId, origem: 'TEXTO', cidadePadrao: opts.cidadePadrao, ufPadrao: opts.ufPadrao, criadoPorUserId: userId || null },
    });
    await this.inserirItens(companyId, lote.id, linhas);
    return this.obterLoteResumo(companyId, lote.id);
  }

  async criarLoteFoto(companyId: number, userId: number, files: any[]) {
    const lista = Array.isArray(files) ? files.filter((f) => f?.buffer?.length) : [];
    if (!lista.length) throw new BadRequestException('Envie ao menos 1 foto (jpg/png) ou PDF.');
    if (lista.length > FOTO_MAX_ARQUIVOS) throw new BadRequestException(`Máximo ${FOTO_MAX_ARQUIVOS} arquivos por vez.`);

    const detectados = lista.map((f) => ({ file: f, detectado: detectarArquivoFoto(Buffer.from(f.buffer)) }));
    const invalido = detectados.find((d) => !d.detectado);
    if (invalido) throw new BadRequestException('Arquivo inválido. Envie foto JPG/PNG ou PDF reais.');
    for (const d of detectados) {
      if (d.file.buffer.length > FOTO_MAX_BYTES) throw new BadRequestException('Cada arquivo deve ter no máximo 8 MB.');
    }

    const lote = await this.prisma.logisticaImportacaoLote.create({
      data: { companyId, origem: 'FOTO', criadoPorUserId: userId || null },
    });

    const dir = fotoUploadDir();
    await mkdir(dir, { recursive: true });
    let linha = 1;
    for (const { file, detectado } of detectados) {
      const storedFilename = `${lote.id}-${randomUUID()}${detectado!.extension}`;
      const storagePath = join(dir, storedFilename);
      await writeFile(storagePath, Buffer.from(file.buffer));
      await this.prisma.logisticaImportacaoItem.create({
        data: {
          companyId,
          loteId: lote.id,
          linha: linha++,
          bruto: `[foto] ${String(file.originalname || 'foto').slice(0, 160)}`,
          statusSanitizacao: 'PENDENTE',
          motivoProblema: 'Aguardando transcrição (foto enviada — preencha os campos na correção manual).',
          fotoOriginalFilename: String(file.originalname || 'foto').slice(0, 180),
          fotoStoredFilename: storedFilename,
          fotoStoragePath: storagePath,
          fotoContentType: detectado!.contentType,
          fotoByteSize: file.buffer.length,
        },
      });
    }
    await this.recalcularContadores(companyId, lote.id);
    return this.obterLoteResumo(companyId, lote.id);
  }

  /** Insere os itens já parseados + roda a passada BARATA de classificação (zero
   *  rede) + resolve produto do catálogo quando possível. Nunca chama CNEFE aqui —
   *  isso é `sanitizarLote`, sob demanda e com orçamento. */
  private async inserirItens(
    companyId: number,
    loteId: string,
    linhas: Array<{ bruto: string; fields: ParsedItemFields }>,
  ): Promise<void> {
    const produtos = await this.prisma.product.findMany({
      where: { companyId, status: 'active', usaLogistica: true },
      select: { id: true, name: true, price: true },
    });

    let linha = 1;
    for (const { bruto, fields } of linhas) {
      const produtoResolvido = resolverProduto(produtos, fields.produtoTexto);
      const basico = classificarCampoBasico({
        endereco: fields.endereco, numero: fields.numero, bairro: fields.bairro,
        cidade: fields.cidade, uf: fields.uf, cep: fields.cep,
      });
      await this.prisma.logisticaImportacaoItem.create({
        data: {
          companyId,
          loteId,
          linha: linha++,
          bruto: bruto || '(linha vazia)',
          nome: fields.nome,
          telefone: fields.telefone,
          endereco: fields.endereco,
          numero: fields.numero,
          bairro: fields.bairro,
          cidade: fields.cidade,
          uf: fields.uf,
          cep: fields.cep,
          diasSemana: fields.diasSemana.length ? fields.diasSemana.join(',') : null,
          produtoTexto: fields.produtoTexto,
          produtoId: produtoResolvido?.id ?? null,
          qtd: fields.qtd ?? (produtoResolvido ? 1 : null),
          valorUnit: produtoResolvido?.price ?? null,
          statusSanitizacao: basico.status,
          motivoProblema: basico.motivo,
        },
      });
    }
    await this.recalcularContadores(companyId, loteId);
  }

  // ── leitura ──────────────────────────────────────────────────────────────────

  async listarLotes(companyId: number, params: { status?: string; page?: number }) {
    const page = Math.max(1, Math.trunc(Number(params.page) || 1));
    const pageSize = 20;
    const where: any = { companyId };
    if (params.status) where.status = params.status;
    const [total, rows] = await Promise.all([
      this.prisma.logisticaImportacaoLote.count({ where }),
      this.prisma.logisticaImportacaoLote.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      }),
    ]);
    return {
      page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: rows.map(mapLote),
    };
  }

  async obterLote(companyId: number, loteId: string, params: { status?: string; page?: number }) {
    const lote = await this.prisma.logisticaImportacaoLote.findFirst({ where: { id: loteId, companyId } });
    if (!lote) throw new NotFoundException('Lote não encontrado.');
    const page = Math.max(1, Math.trunc(Number(params.page) || 1));
    const pageSize = 50;
    const where: any = { companyId, loteId };
    if (params.status) where.statusSanitizacao = params.status;
    const [total, itens] = await Promise.all([
      this.prisma.logisticaImportacaoItem.count({ where }),
      this.prisma.logisticaImportacaoItem.findMany({
        where, orderBy: { linha: 'asc' }, skip: (page - 1) * pageSize, take: pageSize,
      }),
    ]);
    return {
      lote: mapLote(lote),
      page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)),
      itens: itens.map(mapItem),
    };
  }

  private async obterLoteResumo(companyId: number, loteId: string) {
    const lote = await this.prisma.logisticaImportacaoLote.findFirst({ where: { id: loteId, companyId } });
    if (!lote) throw new NotFoundException('Lote não encontrado.');
    return mapLote(lote);
  }

  // ── correção manual (PATCH item) ────────────────────────────────────────────

  async corrigirItem(companyId: number, loteId: string, itemId: string, dto: PatchImportacaoItemDto) {
    const item = await this.prisma.logisticaImportacaoItem.findFirst({ where: { id: itemId, loteId, companyId } });
    if (!item) throw new NotFoundException('Item não encontrado.');
    if (item.customerProfileId) {
      throw new BadRequestException('Item já efetivado — edite o cliente pela ficha normal.');
    }

    const data: any = {};
    for (const campo of ['nome', 'telefone', 'endereco', 'numero', 'bairro', 'cidade', 'cep'] as const) {
      if (dto[campo] !== undefined) data[campo] = String(dto[campo] ?? '').trim() || null;
    }
    if (dto.uf !== undefined) data.uf = String(dto.uf ?? '').trim().toUpperCase().slice(0, 2) || null;
    if (dto.diasSemana !== undefined) {
      data.diasSemana = dto.diasSemana.length ? [...new Set(dto.diasSemana)].sort((a, b) => a - b).join(',') : null;
    }
    if (dto.produtoId !== undefined) {
      if (dto.produtoId != null) {
        const produto = await this.prisma.product.findFirst({
          where: { id: dto.produtoId, companyId, status: 'active' }, select: { id: true, price: true },
        });
        if (!produto) throw new BadRequestException('Produto não encontrado nesta empresa.');
        data.produtoId = produto.id;
        if (dto.valorUnit === undefined) data.valorUnit = produto.price;
      } else {
        data.produtoId = null;
      }
    }
    if (dto.qtd !== undefined) data.qtd = dto.qtd;
    if (dto.valorUnit !== undefined) data.valorUnit = dto.valorUnit;

    const merged = { ...item, ...data };
    const basico = classificarCampoBasico(merged);
    data.statusSanitizacao = basico.status; // sempre reabre pra PENDENTE/VERMELHO — corrigir nunca deixa VERDE velho mentindo
    data.motivoProblema = basico.motivo;
    data.lat = null;
    data.lng = null;
    data.geoFonte = null;

    // Revalida NA HORA (é 1 item só — barato, sem fila/orçamento igual ao lote
    // inteiro). Se o campo básico já falhou, nem tenta CNEFE.
    if (basico.status === 'PENDENTE') {
      const resultado = await sanitizarEndereco(merged);
      data.statusSanitizacao = resultado.status;
      data.motivoProblema = resultado.motivo;
      data.lat = resultado.lat;
      data.lng = resultado.lng;
      data.geoFonte = resultado.geoFonte;
      if (resultado.cepDescoberto && !merged.cep) data.cep = resultado.cepDescoberto;
    }

    const atualizado = await this.prisma.logisticaImportacaoItem.update({ where: { id: itemId }, data });
    await this.recalcularContadores(companyId, loteId);
    return mapItem(atualizado);
  }

  // ── sanitização em lote (CNEFE, com orçamento — mesmo padrão do sanitizador) ──

  async sanitizarLote(companyId: number, loteId: string) {
    const lote = await this.prisma.logisticaImportacaoLote.findFirst({ where: { id: loteId, companyId } });
    if (!lote) throw new NotFoundException('Lote não encontrado.');
    if (lote.status === 'DESCARTADO' || lote.status === 'EFETIVADO') {
      throw new BadRequestException('Lote encerrado não pode ser sanitizado.');
    }

    const pendentes = await this.prisma.logisticaImportacaoItem.findMany({
      where: { companyId, loteId, statusSanitizacao: 'PENDENTE', fotoStoragePath: null },
      orderBy: { linha: 'asc' },
      take: SANITIZAR_LOTE_TAMANHO,
    });

    let processados = 0;
    let verdes = 0;
    let vermelhos = 0;
    const fim = Date.now() + SANITIZAR_ORCAMENTO_MS;
    for (const item of pendentes) {
      if (Date.now() >= fim) break;
      processados += 1;
      const resultado = await sanitizarEndereco(item, { queryTimeoutMs: 8000 });
      if (resultado.status === 'VERDE') verdes += 1; else vermelhos += 1;
      await this.prisma.logisticaImportacaoItem.update({
        where: { id: item.id },
        data: {
          statusSanitizacao: resultado.status,
          motivoProblema: resultado.motivo,
          lat: resultado.lat,
          lng: resultado.lng,
          geoFonte: resultado.geoFonte,
          ...(resultado.cepDescoberto && !item.cep ? { cep: resultado.cepDescoberto } : {}),
        },
      });
    }

    const totalPendentesRestantes = await this.prisma.logisticaImportacaoItem.count({
      where: { companyId, loteId, statusSanitizacao: 'PENDENTE' },
    });
    await this.recalcularContadores(companyId, loteId);
    this.logger.log(
      `[logistica-importacao] sanitizar lote=${loteId} company=${companyId}: ${verdes} verde(s), ${vermelhos} vermelho(s) de ${processados} processado(s); ${totalPendentesRestantes} pendente(s) restante(s).`,
    );
    return { processados, verdes, vermelhos, restantes: totalPendentesRestantes };
  }

  // ── efetivação ───────────────────────────────────────────────────────────────

  async efetivarLote(companyId: number, userId: number, loteId: string, itemIds?: string[]) {
    const lote = await this.prisma.logisticaImportacaoLote.findFirst({ where: { id: loteId, companyId } });
    if (!lote) throw new NotFoundException('Lote não encontrado.');
    if (lote.status === 'DESCARTADO') throw new BadRequestException('Lote descartado não pode ser efetivado.');

    const where: any = { companyId, loteId, statusSanitizacao: 'VERDE' };
    if (itemIds?.length) where.id = { in: itemIds };
    const candidatos = await this.prisma.logisticaImportacaoItem.findMany({ where, orderBy: { linha: 'asc' } });

    if (itemIds?.length && candidatos.length < itemIds.length) {
      // Algum id pedido não é VERDE (ou não existe/não é deste lote) — avisa, mas
      // segue com os que SÃO válidos (uma seleção ruim não trava as boas).
      this.logger.warn(`[logistica-importacao] efetivar lote=${loteId}: ${itemIds.length - candidatos.length} id(s) pedido(s) não elegível(is) (não-VERDE ou fora do lote).`);
    }

    const efetivados: string[] = [];
    const jaEfetivados: string[] = [];
    const falhas: Array<{ itemId: string; linha: number; erro: string }> = [];

    for (const item of candidatos) {
      try {
        const resultado = await this.efetivarItem(companyId, userId, item);
        if (resultado.jaEfetivado) jaEfetivados.push(item.id); else efetivados.push(item.id);
      } catch (e: any) {
        falhas.push({ itemId: item.id, linha: item.linha, erro: String(e?.message || e) });
        this.logger.warn(`[logistica-importacao] efetivar item=${item.id} linha=${item.linha} falhou: ${String(e?.message || e)}`);
      }
    }

    await this.fecharLoteSePossivel(companyId, loteId);
    return { efetivados: efetivados.length, jaEfetivados: jaEfetivados.length, falhas };
  }

  /** Efetiva 1 item. Idempotente por `item.customerProfileId` — chamar de novo num
   *  item já efetivado é NO-OP (nunca cria uma segunda conta pro mesmo item). */
  private async efetivarItem(companyId: number, userId: number, item: any): Promise<{ contaId: string; jaEfetivado: boolean }> {
    if (item.customerProfileId) return { contaId: item.customerProfileId, jaEfetivado: true };
    if (item.statusSanitizacao !== 'VERDE') {
      throw new BadRequestException('Item não está verde — corrija e revalide antes de efetivar.');
    }

    const criada = await this.nucleoCadastro.createConta(companyId, {
      nome: item.nome || 'Cliente sem nome',
      whatsapp: item.telefone || undefined,
      endereco: item.endereco || undefined,
      numero: item.numero || undefined,
      bairro: item.bairro || undefined,
      cidade: item.cidade || undefined,
      uf: item.uf || undefined,
      cep: item.cep || undefined,
      isCliente: true,
    });
    const contaId = criada.contaId;

    // Pino já PROVADO pelo sanitizador CNEFE — grava por fora do createConta (que só
    // aceita geoFonte geocode/gps_*), "só preenche buraco" (nunca pisa em pino que já
    // exista — ex.: createConta casou por telefone numa conta que já tinha pino humano).
    if (typeof item.lat === 'number' && typeof item.lng === 'number') {
      await this.gravarPinoCnefeNaConta(companyId, contaId, item.lat, item.lng);
    }

    await this.prisma.logisticaImportacaoItem.update({
      where: { id: item.id },
      data: { customerProfileId: contaId, efetivadoAt: new Date() },
    });

    // Plano de entrega — só com dia(s) da semana E produto resolvido (createPlan
    // exige >=1 item; carrinho nunca é inventado). Sem isso, a conta existe (aparece
    // em Clientes) mas fica sem rota até alguém completar produto/dia na ficha.
    const dias = parseDiasField(item.diasSemana);
    if (dias.length && item.produtoId && item.valorUnit != null) {
      for (const dia of dias) {
        const jaTemPlano = await this.prisma.logisticaPlanoEntrega.findFirst({
          where: { companyId, customerProfileId: contaId, diaSemana: dia, ativo: true },
          select: { id: true },
        });
        if (jaTemPlano) continue; // não duplica plano do mesmo cliente+dia num retry
        try {
          await this.agenda.createPlan(companyId, {
            customerProfileId: contaId,
            diaSemana: dia,
            frequencia: 'SEMANAL',
            itens: [{ productId: item.produtoId, qtd: Math.max(1, Math.trunc(Number(item.qtd) || 1)), valorUnit: Number(item.valorUnit) }],
          } as any);
        } catch (e: any) {
          // Conta e pino já gravados (o cliente EXISTE) — plano falhar não pode
          // reverter isso; loga e segue (o dono completa o plano na tela da Agenda).
          this.logger.warn(`[logistica-importacao] plano do item=${item.id} dia=${dia} falhou (conta ${contaId} criada mesmo assim): ${String(e?.message || e)}`);
        }
      }
    }

    void userId; // reservado pra auditoria futura (quem efetivou) — sem coluna própria ainda
    return { contaId, jaEfetivado: false };
  }

  private async gravarPinoCnefeNaConta(companyId: number, contaId: string, lat: number, lng: number): Promise<void> {
    const dados = { lat, lng, geoFonte: 'cnefe' };
    await this.prisma.customerProfile.updateMany({ where: { id: contaId, companyId, lat: null }, data: dados });
    await this.prisma.localEntrega.updateMany({
      where: { customerProfileId: contaId, companyId, isPrincipal: true, lat: null },
      data: dados,
    });
  }

  private async fecharLoteSePossivel(companyId: number, loteId: string): Promise<void> {
    await this.recalcularContadores(companyId, loteId);
    const lote = await this.prisma.logisticaImportacaoLote.findFirst({ where: { id: loteId, companyId } });
    if (!lote || lote.status === 'DESCARTADO' || lote.status === 'EFETIVADO') return;
    const acionaveis = await this.prisma.logisticaImportacaoItem.count({
      where: { companyId, loteId, statusSanitizacao: 'VERDE', customerProfileId: null },
    });
    if (acionaveis === 0 && lote.totalPendentes === 0 && lote.totalEfetivados > 0) {
      await this.prisma.logisticaImportacaoLote.update({ where: { id: loteId }, data: { status: 'EFETIVADO' } });
    }
  }

  // ── descarte ─────────────────────────────────────────────────────────────────

  async descartarLote(companyId: number, loteId: string) {
    const lote = await this.prisma.logisticaImportacaoLote.findFirst({ where: { id: loteId, companyId } });
    if (!lote) throw new NotFoundException('Lote não encontrado.');
    // Descartar NUNCA desfaz cliente já efetivado (CustomerProfile intocado) — só
    // fecha o lote pra parar de aparecer como "rascunho pendente".
    const atualizado = await this.prisma.logisticaImportacaoLote.update({
      where: { id: loteId }, data: { status: 'DESCARTADO' },
    });
    return mapLote(atualizado);
  }

  // ── foto (fase 1: visualização manual; fase 2 = encaixe de IA de visão, ver README) ──

  async getFotoItem(companyId: number, itemId: string) {
    const item = await this.prisma.logisticaImportacaoItem.findFirst({ where: { id: itemId, companyId } });
    if (!item || !item.fotoStoragePath) throw new NotFoundException('Foto não encontrada.');
    const content = await readFile(item.fotoStoragePath).catch(() => null);
    if (!content) throw new NotFoundException('Arquivo da foto não encontrado em disco.');
    return {
      content,
      filename: item.fotoOriginalFilename || item.fotoStoredFilename || 'foto',
      contentType: item.fotoContentType || 'application/octet-stream',
      byteSize: item.fotoByteSize || content.length,
    };
  }

  // ── contadores ───────────────────────────────────────────────────────────────

  private async recalcularContadores(companyId: number, loteId: string): Promise<void> {
    const grupos = await this.prisma.logisticaImportacaoItem.groupBy({
      by: ['statusSanitizacao'],
      where: { companyId, loteId },
      _count: { _all: true },
    });
    const porStatus = new Map(grupos.map((g: any) => [g.statusSanitizacao, g._count._all as number]));
    const totalEfetivados = await this.prisma.logisticaImportacaoItem.count({
      where: { companyId, loteId, customerProfileId: { not: null } },
    });
    const totalItens = [...porStatus.values()].reduce((a, b) => a + b, 0);
    const totalPendentes = porStatus.get('PENDENTE') ?? 0;

    const lote = await this.prisma.logisticaImportacaoLote.findFirst({ where: { id: loteId, companyId }, select: { status: true } });
    const data: any = {
      totalItens,
      totalVerdes: porStatus.get('VERDE') ?? 0,
      totalVermelhos: porStatus.get('VERMELHO') ?? 0,
      totalPendentes,
      totalEfetivados,
    };
    // RASCUNHO → CONFERIDO sozinho quando não sobra PENDENTE (sanitização completa).
    // Nunca mexe em status terminal (EFETIVADO/DESCARTADO).
    if (lote && lote.status === 'RASCUNHO' && totalPendentes === 0 && totalItens > 0) {
      data.status = 'CONFERIDO';
    }
    await this.prisma.logisticaImportacaoLote.update({ where: { id: loteId }, data });
  }
}

// ── constantes ───────────────────────────────────────────────────────────────────
const ARQUIVO_MAX_BYTES = 10 * 1024 * 1024;
const FOTO_MAX_BYTES = 8 * 1024 * 1024;
const FOTO_MAX_ARQUIVOS = 20;
const TEXTO_MAX_LINHAS = 1000;
/** Mesmo espírito do LOTE=12/20s de LogisticaConferenciaService#sanitizar: o app
 *  repete a chamada até `restantes` zerar — nunca uma chamada eterna que trava a tela. */
const SANITIZAR_LOTE_TAMANHO = 15;
const SANITIZAR_ORCAMENTO_MS = 20000;

function fotoUploadDir(): string {
  return process.env.LOGISTICA_IMPORTACAO_UPLOAD_DIR || join(process.cwd(), 'storage', 'logistica-importacao');
}

/** Assinatura de bytes (mesmo espírito de detectarImagem em logistica-operacao.service.ts,
 *  duplicada aqui de propósito — arquivo pequeno, evita exportar um helper privado de
 *  um serviço que o dono edita em paralelo). Aceita JPG/PNG/PDF (spec F4). */
function detectarArquivoFoto(buffer: Buffer): { contentType: string; extension: string } | null {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { contentType: 'image/png', extension: '.png' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { contentType: 'image/jpeg', extension: '.jpg' };
  }
  if (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return { contentType: 'application/pdf', extension: '.pdf' };
  }
  return null;
}

function parseDiasField(v: string | null | undefined): number[] {
  return String(v ?? '').split(',').map((s) => Number(s.trim())).filter((n) => n >= 1 && n <= 7);
}

/** Casa produtoTexto (livre) contra o catálogo `usaLogistica` por CONTAINS
 *  normalizado; sem match e catálogo com EXATAMENTE 1 produto, assume esse (caso
 *  comum: distribuidora que só vende 1 item, ex. "galão 20L" — não faz sentido
 *  obrigar o operador a digitar o nome do produto que já é o único que existe). */
function resolverProduto(
  produtos: Array<{ id: number; name: string; price: number }>,
  produtoTexto: string | null,
): { id: number; price: number } | null {
  if (produtoTexto) {
    const alvo = normalizarSimples(produtoTexto);
    const achado = produtos.find((p) => normalizarSimples(p.name).includes(alvo) || alvo.includes(normalizarSimples(p.name)));
    if (achado) return achado;
  }
  if (produtos.length === 1) return produtos[0];
  return null;
}

function normalizarSimples(v: string): string {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// ── serialização ─────────────────────────────────────────────────────────────────
function mapLote(l: any) {
  return {
    id: l.id,
    origem: l.origem,
    nomeArquivo: l.nomeArquivo,
    cidadePadrao: l.cidadePadrao,
    ufPadrao: l.ufPadrao,
    status: l.status,
    totalItens: l.totalItens,
    totalVerdes: l.totalVerdes,
    totalVermelhos: l.totalVermelhos,
    totalPendentes: l.totalPendentes,
    totalEfetivados: l.totalEfetivados,
    createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
    updatedAt: l.updatedAt instanceof Date ? l.updatedAt.toISOString() : l.updatedAt,
  };
}

function mapItem(i: any) {
  return {
    id: i.id,
    linha: i.linha,
    bruto: i.bruto,
    nome: i.nome,
    telefone: i.telefone,
    endereco: i.endereco,
    numero: i.numero,
    bairro: i.bairro,
    cidade: i.cidade,
    uf: i.uf,
    cep: i.cep,
    diasSemana: parseDiasField(i.diasSemana),
    produtoTexto: i.produtoTexto,
    produtoId: i.produtoId,
    qtd: i.qtd,
    valorUnit: i.valorUnit,
    statusSanitizacao: i.statusSanitizacao,
    motivoProblema: i.motivoProblema,
    temFoto: Boolean(i.fotoStoragePath),
    customerProfileId: i.customerProfileId,
    efetivadoAt: i.efetivadoAt instanceof Date ? i.efetivadoAt.toISOString() : i.efetivadoAt,
  };
}
