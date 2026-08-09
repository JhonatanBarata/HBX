import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { pinoValido, resolveServerGeo } from './nucleo-geo.util';
import { normalizeSearch } from './nucleo-search.util';
// 🔴 28/07 (dono) — régua de "mesma porta" do anti-duplicata de endereço.
import { mesmaPorta, numeroDaPorta, PortaCadastro } from './endereco-porta.util';
// 🔴 01/08 — via limpa + número separados do campo único de endereço (ver
// maybeResolveServerGeo); e o pino de CEP pro endereço SEM número.
import { extrairNumeroPorta, resolverCnefeCep } from './cnefe-resolver.util';
import { logradouroDoCadastro } from '../logistica/logistica-cep.util';
import {
  decidirGeoFonteCadastro,
  forcaGeoFonte,
  geoFonteDaPorta,
  FORCA_GEO_FONTE,
  type GeoFonteGravada,
} from '../logistica/logistica-geo-fonte.util';

/**
 * NÚCLEO-CRM N1 (04/07) — serviço INERTE da espinha de cadastro.
 *
 * A "espinha" é: CONTA (= CustomerProfile, PJ com CNPJ ou PF pessoa) → N CONTATOS
 * (= Contato, a pessoa). Empresas/Contatos/Clientes são 3 JANELAS filtradas da MESMA
 * base — nunca 3 cadastros paralelos.
 *
 * Este serviço é DELIBERADAMENTE INERTE nesta sprint (N1):
 *  - NÃO tem endpoints, NÃO roda por cron/boot, NÃO dispara WhatsApp, NÃO faz I/O externo.
 *  - Só expõe 2 métodos idempotentes (upsert) que N2 (ingestão no PULL) e N3 (janelas)
 *    vão CHAMAR. Nada aqui chama estes métodos ainda — quem os ligar é a próxima sprint.
 *  - Todo o efeito colateral é uma escrita no MESMO choke (CustomerProfile/Contato),
 *    disparada por um caller consciente — nunca automaticamente.
 */
@Injectable()
export class NucleoCadastroService {
  private readonly logger = new Logger(NucleoCadastroService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert idempotente de uma CONTA (CustomerProfile) a partir de um registro de CNPJ
   * (fonte: base RFB 28M — CnpjPublicCompany/ownerName). Chave de idempotência por-tenant:
   * (companyId, cnpj). Marca papéis via flags e origin ('radar' quando vem do pull).
   *
   * INERTE em N1: implementado como método puro, sem caller. N2 é quem vai plugar isto
   * no hook de `cnpj-base/pull`, junto do VendasLead, no mesmo choke (aditivo).
   *
   * @returns o id da Conta (CustomerProfile) criada/atualizada.
   */
  async upsertContaFromCnpj(input: UpsertContaFromCnpjInput): Promise<string> {
    const cnpj = normalizeDigits(input.cnpj);
    if (!input.companyId || !cnpj) {
      throw new Error('upsertContaFromCnpj: companyId e cnpj são obrigatórios');
    }

    const roleFlags = {
      isLead: input.isLead ?? true,
      isCliente: input.isCliente ?? false,
      isFornecedor: input.isFornecedor ?? false,
    };

    // Chave por-tenant: (companyId, cnpj). CustomerProfile não tem @@unique nesse par
    // (o unique existente é phoneNormalized), então resolvemos manualmente: acha-ou-cria.
    const existing = await this.prisma.customerProfile.findFirst({
      where: { companyId: input.companyId, cnpj },
      select: { id: true },
    });

    if (existing) {
      const updated = await this.prisma.customerProfile.update({
        where: { id: existing.id },
        data: {
          tipo: 'pj',
          // nome só é sobrescrito quando vier um novo (não apaga o que já existe)
          ...(input.nome ? { name: input.nome } : {}),
          ...(input.endereco !== undefined ? { endereco: input.endereco } : {}),
          ...(input.cidade !== undefined ? { cidade: input.cidade } : {}),
          ...(input.uf !== undefined ? { uf: input.uf } : {}),
          ...(input.cep !== undefined ? { cep: input.cep } : {}),
          ...(input.lat !== undefined ? { lat: input.lat } : {}),
          ...(input.lng !== undefined ? { lng: input.lng } : {}),
          // papéis são acumulativos: só LIGAM, nunca desligam um papel já marcado
          ...(roleFlags.isLead ? { isLead: true } : {}),
          ...(roleFlags.isCliente ? { isCliente: true } : {}),
          ...(roleFlags.isFornecedor ? { isFornecedor: true } : {}),
        },
        select: { id: true },
      });
      return updated.id;
    }

    const created = await this.prisma.customerProfile.create({
      data: {
        companyId: input.companyId,
        tipo: 'pj',
        cnpj,
        name: input.nome ?? null,
        document: cnpj,
        endereco: input.endereco ?? null,
        cidade: input.cidade ?? null,
        uf: input.uf ?? null,
        cep: input.cep ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        isLead: roleFlags.isLead,
        isCliente: roleFlags.isCliente,
        isFornecedor: roleFlags.isFornecedor,
        origin: input.origin ?? 'radar',
      },
      select: { id: true },
    });
    return created.id;
  }

  /**
   * NÚCLEO-CRM N2 (05/07) — Upsert idempotente de uma CONTA (CustomerProfile) a partir
   * de um lead WEB do Radar (Google Maps/scraping), ou seja, SEM CNPJ. Enquanto
   * `upsertContaFromCnpj` chaveia por (companyId, cnpj), aqui a única chave segura de
   * idempotência é (companyId, phoneNormalized) — sem telefone normalizável não dá pra
   * deduplicar com segurança, então devolve `null` (o helper de ingestão trata como skip).
   *
   * Papéis acumulativos (mesma regra do resto do serviço): só LIGA `isLead`, nunca desliga;
   * gaps de nome/endereço/cidade/uf são preenchidos sem sobrescrever o que já existe.
   *
   * @returns o id da Conta (CustomerProfile) criada/atualizada, ou `null` sem phone.
   */
  async upsertContaFromRadarWebLead(input: UpsertContaFromRadarWebLeadInput): Promise<string | null> {
    if (!input.companyId) {
      throw new Error('upsertContaFromRadarWebLead: companyId é obrigatório');
    }
    const phoneNormalized = normalizeDigits(input.phone) || null;
    if (!phoneNormalized) return null;

    const existing = await this.prisma.customerProfile.findFirst({
      where: { companyId: input.companyId, phoneNormalized },
      select: { id: true },
    });

    if (existing) {
      const updated = await this.prisma.customerProfile.update({
        where: { id: existing.id },
        data: {
          // nome/endereço só preenchem GAPS (não sobrescrevem o que já existe)
          ...(input.nome ? { name: input.nome } : {}),
          ...(input.endereco !== undefined ? { endereco: input.endereco } : {}),
          ...(input.cidade !== undefined ? { cidade: input.cidade } : {}),
          ...(input.uf !== undefined ? { uf: input.uf } : {}),
          // papéis são acumulativos: só LIGA, nunca desliga um papel já marcado
          isLead: true,
        },
        select: { id: true },
      });
      return updated.id;
    }

    const created = await this.prisma.customerProfile.create({
      data: {
        companyId: input.companyId,
        tipo: 'pj',
        name: input.nome ?? null,
        phone: normalizeDigits(input.phone) || null,
        phoneNormalized,
        // `document` fica NULL de propósito: telefone NÃO é documento. Gravar o phone aqui
        // colidiria no dedupe-por-document do `createConta` (checa document ANTES de phone)
        // contra um CPF real de 11 dígitos → falso-merge de contas. A dedupe do lead web já
        // é garantida pelo @@unique([companyId, phoneNormalized]).
        endereco: input.endereco ?? null,
        cidade: input.cidade ?? null,
        uf: input.uf ?? null,
        isLead: true,
        isCliente: false,
        origin: 'radar',
      },
      select: { id: true },
    });
    return created.id;
  }

  /**
   * Upsert idempotente do CONTATO PRINCIPAL de uma Conta (a pessoa: dono/comprador/
   * quem recebe). Idempotência por (companyId, customerProfileId, isPrincipal): mantém
   * NO MÁXIMO um principal por conta. Se já houver um principal, atualiza-o; senão cria.
   *
   * INERTE em N1: sem caller. N2 planta o Contato(dono) a partir do ownerName/QSA no
   * mesmo pull; N4 usa isto no cadastro manual.
   *
   * @returns o id do Contato criado/atualizado.
   */
  async upsertContatoPrincipal(input: UpsertContatoPrincipalInput): Promise<string> {
    if (!input.companyId || !input.customerProfileId || !input.nome?.trim()) {
      throw new Error(
        'upsertContatoPrincipal: companyId, customerProfileId e nome são obrigatórios',
      );
    }

    const existing = await this.prisma.contato.findFirst({
      where: {
        companyId: input.companyId,
        customerProfileId: input.customerProfileId,
        isPrincipal: true,
      },
      select: { id: true },
    });

    if (existing) {
      const updated = await this.prisma.contato.update({
        where: { id: existing.id },
        data: {
          nome: input.nome.trim(),
          ...(input.cargo !== undefined ? { cargo: input.cargo } : {}),
          ...(input.whatsapp !== undefined ? { whatsapp: normalizeDigits(input.whatsapp) || null } : {}),
          ...(input.phone !== undefined ? { phone: normalizeDigits(input.phone) || null } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
        },
        select: { id: true },
      });
      return updated.id;
    }

    const created = await this.prisma.contato.create({
      data: {
        companyId: input.companyId,
        customerProfileId: input.customerProfileId,
        nome: input.nome.trim(),
        cargo: input.cargo ?? null,
        whatsapp: normalizeDigits(input.whatsapp) || null,
        phone: normalizeDigits(input.phone) || null,
        email: input.email ?? null,
        isPrincipal: true,
        source: input.source ?? 'manual',
      },
      select: { id: true },
    });
    return created.id;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NÚCLEO-CRM N3 (04/07) — LEITURA da janela "Empresas" (contas PJ).
  // READ-ONLY, company-scoped (companyId sempre do usuário logado — nunca do
  // cliente). Só lê CustomerProfile.tipo='pj'; papéis viram badges. Sem efeito
  // colateral, sem escrita. Consumido pelo NucleoController.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Lista paginada de CONTAS PJ da empresa (janela Empresas). Filtra por texto
   * livre (nome/cnpj/cidade) e por UF. Retorna contagem de contatos por conta.
   */
  async listEmpresas(companyId: number, params: ListEmpresasParams): Promise<ListEmpresasResult> {
    if (!companyId) {
      throw new Error('listEmpresas: companyId é obrigatório');
    }
    const page = Math.max(1, Math.trunc(Number(params.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(params.pageSize) || 30)));
    const skip = (page - 1) * pageSize;

    const query = String(params.query ?? '').trim();
    const uf = String(params.uf ?? '').trim().toUpperCase();

    const where: any = { companyId, tipo: 'pj' };
    if (uf) where.uf = uf;
    if (query) {
      const queryDigits = query.replace(/\D+/g, '');
      const or: any[] = [
        { name: { contains: query, mode: 'insensitive' } },
        { cidade: { contains: query, mode: 'insensitive' } },
      ];
      // BUG 1 (11/07) — ILIKE (`name`/`mode: insensitive`) é acento-SENSÍVEL no Postgres
      // ("Déia" não bate "Deia"). ADITIVO: busca também na coluna espelho sem acento.
      const searchQuery = normalizeSearch(query);
      if (searchQuery) or.push({ searchName: { contains: searchQuery } });
      if (queryDigits) or.push({ cnpj: { contains: queryDigits } });
      where.OR = or;
    }

    const [total, rows] = await Promise.all([
      this.prisma.customerProfile.count({ where }),
      this.prisma.customerProfile.findMany({
        where,
        orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: pageSize,
        select: {
          id: true,
          name: true,
          cnpj: true,
          cidade: true,
          uf: true,
          isLead: true,
          isCliente: true,
          isFornecedor: true,
          origin: true,
          _count: { select: { contatos: true } },
        },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: rows.map((row) => ({
        id: row.id,
        name: row.name ?? null,
        cnpj: row.cnpj ?? null,
        cidade: row.cidade ?? null,
        uf: row.uf ?? null,
        isLead: Boolean(row.isLead),
        isCliente: Boolean(row.isCliente),
        isFornecedor: Boolean(row.isFornecedor),
        origin: row.origin ?? null,
        contatosCount: Number(row._count?.contatos || 0),
      })),
    };
  }

  /**
   * Detalhe de UMA conta PJ da empresa + seus contatos. Retorna null quando a
   * conta não existe OU não pertence à empresa (isolamento por-tenant duro:
   * o id sozinho nunca vaza dados de outro tenant).
   */
  async getEmpresa(companyId: number, id: string): Promise<EmpresaDetail | null> {
    if (!companyId || !id) return null;
    const row = await this.prisma.customerProfile.findFirst({
      where: { id, companyId, tipo: 'pj' },
      select: {
        id: true,
        name: true,
        cnpj: true,
        document: true,
        endereco: true,
        numero: true,
        cidade: true,
        uf: true,
        cep: true,
        lat: true,
        lng: true,
        phone: true,
        email: true,
        isLead: true,
        isCliente: true,
        isFornecedor: true,
        origin: true,
        createdAt: true,
        contatos: {
          orderBy: [{ isPrincipal: 'desc' }, { nome: 'asc' }],
          select: {
            id: true,
            nome: true,
            cargo: true,
            whatsapp: true,
            phone: true,
            email: true,
            isPrincipal: true,
            source: true,
          },
        },
      },
    });
    if (!row) return null;

    return {
      id: row.id,
      name: row.name ?? null,
      cnpj: row.cnpj ?? null,
      document: row.document ?? null,
      endereco: row.endereco ?? null,
      numero: row.numero ?? null,
      cidade: row.cidade ?? null,
      uf: row.uf ?? null,
      cep: row.cep ?? null,
      lat: row.lat ?? null,
      lng: row.lng ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      isLead: Boolean(row.isLead),
      isCliente: Boolean(row.isCliente),
      isFornecedor: Boolean(row.isFornecedor),
      origin: row.origin ?? null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : null,
      contatos: (row.contatos || []).map((c) => ({
        id: c.id,
        nome: c.nome,
        cargo: c.cargo ?? null,
        whatsapp: c.whatsapp ?? null,
        phone: c.phone ?? null,
        email: c.email ?? null,
        isPrincipal: Boolean(c.isPrincipal),
        source: c.source ?? null,
      })),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NÚCLEO-CRM N4 (04/07) — janela "Contatos" (pessoas) + "Clientes" (papel) +
  // criação/edição MANUAL. Company-scoped (companyId sempre do JWT). Escrita
  // consciente (o vendedor cadastrando cliente) — sem cron/boot, sem WhatsApp.
  // Cadastro manual é GRÁTIS (não é lead da base 28M → não debita crédito).
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Lista paginada de CONTATOS (pessoas) da empresa, com a Conta a que pertencem.
   * Filtra por texto livre (nome do contato/cargo/canal OU nome da conta).
   */
  async listContatos(
    companyId: number,
    params: ListContatosParams,
  ): Promise<ListContatosResult> {
    if (!companyId) throw new Error('listContatos: companyId é obrigatório');
    const page = Math.max(1, Math.trunc(Number(params.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(params.pageSize) || 30)));
    const skip = (page - 1) * pageSize;
    const query = String(params.query ?? '').trim();

    const where: any = { companyId };
    if (query) {
      const digits = query.replace(/\D+/g, '');
      // FOLLOW-UP (BUG 1, 11/07) — mesma lacuna de acento (ILIKE acento-sensível) existe
      // aqui em `Contato.nome`/`customerProfile.name`, mas o fix desta passada ficou
      // escopado a CustomerProfile (listEmpresas/listClientes, via coluna `searchName`).
      // Contato não tem coluna espelho ainda — pendente numa próxima passada.
      const or: any[] = [
        { nome: { contains: query, mode: 'insensitive' } },
        { cargo: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        { customerProfile: { is: { name: { contains: query, mode: 'insensitive' } } } },
      ];
      if (digits) {
        or.push({ whatsapp: { contains: digits } });
        or.push({ phone: { contains: digits } });
      }
      where.OR = or;
    }

    const [total, rows] = await Promise.all([
      this.prisma.contato.count({ where }),
      this.prisma.contato.findMany({
        where,
        orderBy: [{ isPrincipal: 'desc' }, { nome: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: pageSize,
        select: {
          id: true,
          nome: true,
          cargo: true,
          whatsapp: true,
          phone: true,
          email: true,
          isPrincipal: true,
          source: true,
          customerProfileId: true,
          customerProfile: {
            select: {
              id: true,
              name: true,
              tipo: true,
              isCliente: true,
              isLead: true,
              isFornecedor: true,
              phoneNormalized: true,
              botOff: true,
              botOffReason: true,
              botOffAt: true,
            },
          },
        },
      }),
    ]);

    // Atendimento: casa cada contato com a conversa salva pelo telefone (1 query pra página).
    const conversaMap = await this.loadConversasForContatos(
      companyId,
      rows.map((r) => ({
        id: r.id,
        whatsapp: r.whatsapp ?? null,
        phone: r.phone ?? null,
        profilePhone: r.customerProfile?.phoneNormalized ?? null,
      })),
    );

    return {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: rows.map((r) => ({
        id: r.id,
        nome: r.nome,
        cargo: r.cargo ?? null,
        whatsapp: r.whatsapp ?? null,
        phone: r.phone ?? null,
        email: r.email ?? null,
        isPrincipal: Boolean(r.isPrincipal),
        source: r.source ?? null,
        contaId: r.customerProfileId,
        contaNome: r.customerProfile?.name ?? null,
        contaTipo: r.customerProfile?.tipo ?? null,
        contaIsCliente: Boolean(r.customerProfile?.isCliente),
        contaIsLead: Boolean(r.customerProfile?.isLead),
        contaIsFornecedor: Boolean(r.customerProfile?.isFornecedor),
        conversa: conversaMap.get(r.id) ?? null,
        finalizado: Boolean(r.customerProfile?.botOff),
        finalizadoMotivo: r.customerProfile?.botOffReason ?? null,
        finalizadoEm: r.customerProfile?.botOffAt
          ? new Date(r.customerProfile.botOffAt).toISOString()
          : null,
      })),
    };
  }

  /**
   * Casa os contatos da página com a conversa salva (CompanyConversation) pelo
   * telefone, tolerando país (55) e o "9" de celular. READ-ONLY: só lê o que o
   * Atendimento já grava — não cria conversa nem dispara nada pro WhatsApp.
   *
   * Uma query só pra a página inteira (OR de `contact endsWith <chave-local>`),
   * depois o casamento fino é feito em memória comparando as chaves locais
   * (DDD+número, com/sem o 9). Quando o mesmo número tem várias linhas (chips
   * diferentes), soma as mensagens e abre a mais recente que tem mensagem.
   */
  private async loadConversasForContatos(
    companyId: number,
    contatos: Array<{ id: string; whatsapp: string | null; phone: string | null; profilePhone: string | null }>,
  ): Promise<Map<string, ContatoConversaResumo>> {
    const result = new Map<string, ContatoConversaResumo>();
    if (!companyId || !contatos.length) return result;

    const perContato = new Map<string, Set<string>>();
    const allKeys = new Set<string>();
    for (const c of contatos) {
      const keys = new Set<string>();
      for (const src of [c.whatsapp, c.phone, c.profilePhone]) {
        for (const k of phoneLocalKeys(src)) {
          keys.add(k);
          allKeys.add(k);
        }
      }
      if (keys.size) perContato.set(c.id, keys);
    }
    if (!allKeys.size) return result;

    const conversas = await this.prisma.companyConversation.findMany({
      where: {
        companyId,
        channel: 'whatsapp',
        OR: [...allKeys].map((k) => ({ contact: { endsWith: k } })),
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 1000,
      select: {
        id: true,
        contact: true,
        lastMessageAt: true,
        _count: { select: { messages: true } },
      },
    });

    const convKeys = conversas.map((cv) => ({
      id: cv.id,
      lastMessageAt: cv.lastMessageAt ? new Date(cv.lastMessageAt).toISOString() : null,
      mensagens: Number(cv._count?.messages || 0),
      keys: new Set(phoneLocalKeys(cv.contact)),
    }));

    for (const [contatoId, keys] of perContato) {
      const matches = convKeys.filter((cv) => {
        for (const k of cv.keys) if (keys.has(k)) return true;
        return false;
      });
      if (!matches.length) continue;
      const mensagens = matches.reduce((s, m) => s + m.mensagens, 0);
      // conversas já vêm ordenadas por lastMessageAt desc → [0] é a mais recente.
      const comMsg = matches.filter((m) => m.mensagens > 0);
      const pick = (comMsg.length ? comMsg : matches)[0];
      result.set(contatoId, { id: pick.id, lastMessageAt: pick.lastMessageAt, mensagens });
    }

    return result;
  }

  /**
   * Lista paginada de CONTAS com papel CLIENTE (a view "Clientes"). Reusa a MESMA
   * base/serialização de `listEmpresas`, apenas trocando o filtro de papel: em vez
   * de `tipo='pj'`, filtra `isCliente=true` (PF ou PJ). Zero lógica duplicada de
   * escrita/serialização — é a mesma tabela vista por outro recorte.
   */
  async listClientes(
    companyId: number,
    params: ListEmpresasParams,
  ): Promise<ListClientesResult> {
    if (!companyId) throw new Error('listClientes: companyId é obrigatório');
    const page = Math.max(1, Math.trunc(Number(params.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(params.pageSize) || 30)));
    const skip = (page - 1) * pageSize;
    const query = String(params.query ?? '').trim();
    const uf = String(params.uf ?? '').trim().toUpperCase();

    // Recorte por PAPEL (não por tipo): "Clientes" = mesma base, isCliente=true.
    const where: any = { companyId, isCliente: true };
    if (uf) where.uf = uf;

    // FILTRO POR DIA DE ENTREGA (05/08, pedido do dono na tela Clientes do APK:
    // "botões de filtro, de segunda a domingo, igual é feito no traçar rota").
    //
    // A fonte é `LogisticaPlanoEntrega` — a MESMA que o traçar rota lê. É lei da
    // casa: o dia é do CLIENTE (visita/plano), NUNCA do produto; filtrar por
    // ClienteProduto.diasSemana aqui daria uma 2ª verdade de dia, e é
    // exatamente assim que a tela começa a discordar da rota.
    //
    // Vários dias = OU (quem entrega na segunda OU na quarta), igual aos chips
    // do traçar rota. Dia inválido é IGNORADO, nunca vira lista vazia calada.
    const dias = Array.from(
      new Set(
        (Array.isArray(params.diasSemana) ? params.diasSemana : [])
          .map((d) => Math.trunc(Number(d)))
          .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7),
      ),
    );
    if (dias.length) {
      where.logisticaPlanosEntrega = {
        some: { companyId, ativo: true, diaSemana: { in: dias } },
      };
    }
    if (query) {
      // Só trata como telefone/documento quando a consulta inteira é numérica
      // (aceitando a pontuação usual). Em "123teste", aproveitar apenas "123"
      // traz clientes cujo telefone contém 123, mesmo sem relação com o nome.
      const queryDigits = /^[\d\s()+./-]+$/.test(query) ? query.replace(/\D+/g, '') : '';
      const or: any[] = [
        { name: { contains: query, mode: 'insensitive' } },
        { cidade: { contains: query, mode: 'insensitive' } },
        { endereco: { contains: query, mode: 'insensitive' } },
      ];
      // BUG 1 (11/07) — mesma lacuna de acento do listEmpresas acima (ADITIVO).
      const searchQuery = normalizeSearch(query);
      if (searchQuery) or.push({ searchName: { contains: searchQuery } });
      if (queryDigits) {
        or.push({ cnpj: { contains: queryDigits } });
        or.push({ document: { contains: queryDigits } });
        or.push({ phoneNormalized: { contains: queryDigits } });
      }
      where.OR = or;
    }

    const [total, rows] = await Promise.all([
      this.prisma.customerProfile.count({ where }),
      this.prisma.customerProfile.findMany({
        where,
        orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: pageSize,
        select: {
          id: true,
          name: true,
          cnpj: true,
          document: true,
          cidade: true,
          uf: true,
          isLead: true,
          isCliente: true,
          isFornecedor: true,
          origin: true,
          // W5 (10/07) — insumos do card de clientes do /entrega (pendências/duplicidade).
          status: true,
          phone: true,
          endereco: true,
          numero: true,
          lat: true,
          lng: true,
          phoneNormalized: true,
          formaPagamento: true,
          diaFechamento: true,
          // PR18072026 W1 — observação livre sobre o cliente (card do /entrega).
          observacoes: true,
          // O telefone operacional pode viver no Contato principal. O app edita
          // esse registro; usar só CustomerProfile mantinha o alerta vermelho
          // mesmo depois de salvar corretamente o número.
          contatos: {
            orderBy: [{ isPrincipal: 'desc' }, { createdAt: 'asc' }],
            take: 1,
            select: { whatsapp: true, phone: true },
          },
          _count: { select: { contatos: true } },
        },
      }),
    ]);

    // W5 (10/07) — enriquecimento ADITIVO do card (pendências, dias, duplicata,
    // débito, entregas). Calculado pra página inteira, sem N+1.
    const extras = await this.loadClientesCardExtras(companyId, rows);

    return {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: rows.map((row) => ({
        id: row.id,
        name: row.name ?? null,
        cnpj: row.cnpj ?? null,
        document: row.document ?? null,
        phone: row.phone ?? row.contatos?.[0]?.whatsapp ?? row.contatos?.[0]?.phone ?? null,
        phoneNormalized: row.phoneNormalized ?? null,
        endereco: row.endereco ?? null,
        numero: row.numero ?? null,
        cidade: row.cidade ?? null,
        uf: row.uf ?? null,
        // O PINO VIAJA JUNTO (09/08): o select já paga por lat/lng e este map
        // os descartava — o rascunho da Rota avulsa recebia cliente sem pino e
        // a montagem carimbava "sem trajeto" em gente com porta marcada.
        lat: row.lat ?? null,
        lng: row.lng ?? null,
        formaPagamento: row.formaPagamento ?? 'aberto',
        diaFechamento: row.diaFechamento ?? null,
        // PR18072026 W1 — observação livre sobre o cliente.
        observacoes: row.observacoes ?? null,
        isLead: Boolean(row.isLead),
        isCliente: Boolean(row.isCliente),
        isFornecedor: Boolean(row.isFornecedor),
        origin: row.origin ?? null,
        contatosCount: Number(row._count?.contatos || 0),
        ...(extras.get(row.id) ?? EMPTY_CLIENTE_CARD_EXTRAS),
      })),
    };
  }

  /**
   * W5 (10/07) — campos ADITIVOS do card de clientes do /entrega, calculados pra
   * página inteira sem N+1 (escala single-driver — centenas de clientes):
   *   pendencias[]  = o que falta no cadastro (ordem fixa endereco→numero→gps→dia→whatsapp);
   *   diasEntrega[] = união ISO (1=seg…7=dom) dos dias do PLANO ativo do cliente
   *                   (LogisticaPlanoEntrega.diaSemana) — fonte ÚNICA do dia,
   *                   a mesma que o generateDay materializa e que o filtro usa;
   *   duplicataDe   = par duplicado COMPANY-WIDE (não por página): nome normalizado
   *                   idêntico OU endereco+numero normalizados idênticos, só entre
   *                   clientes ativos — sem fuzzy, os DOIS lados apontam um pro outro;
   *   debitoAtual   = SÓ quando LogisticaConfig.moduloFinanceiroAtivo (senão omitido);
   *   entregasCount = entregas NÃO-canceladas do cliente.
   */
  private async loadClientesCardExtras(
    companyId: number,
    rows: Array<{
      id: string;
      name: string | null;
      status: string | null;
      endereco: string | null;
      numero: string | null;
      lat: number | null;
      lng: number | null;
      phoneNormalized: string | null;
      contatos?: Array<{ whatsapp: string | null; phone: string | null }>;
    }>,
  ): Promise<Map<string, ClienteCardExtras>> {
    const result = new Map<string, ClienteCardExtras>();
    if (!companyId || !rows.length) return result;
    const pageIds = rows.map((r) => r.id);

    // A query do ClienteProduto MORREU aqui (05/08): ela só existia pra ler dia
    // de produto. Uma ida a menos ao banco por página de clientes.
    const [entregasAgg, config, dupUniverse, locaisAtivos, planosAgenda] = await Promise.all([
      this.prisma.entrega.groupBy({
        by: ['customerProfileId'],
        where: { companyId, customerProfileId: { in: pageIds }, status: { not: 'cancelada' } },
        _count: { _all: true },
      }),
      this.prisma.logisticaConfig.findFirst({
        where: { companyId },
        select: { moduloFinanceiroAtivo: true },
      }),
      // Duplicidade é COMPANY-WIDE: o universo é TODO cliente ativo do tenant, não
      // só a página (senão o par que caiu em outra página passaria batido).
      this.prisma.customerProfile.findMany({
        where: { companyId, isCliente: true, status: 'active' },
        select: { id: true, name: true, endereco: true, numero: true },
      }),
      // MULTILOCAL (10/07) — endereco/numero/gps do card passam a olhar o LOCAL PRINCIPAL
      // (após backfill = o antigo endereço do perfil). isPrincipal desc + createdAt asc:
      // a 1ª linha de cada cliente é o principal (ou, na falta da flag, o mais antigo ativo).
      this.prisma.localEntrega.findMany({
        where: { companyId, customerProfileId: { in: pageIds }, ativo: true },
        orderBy: [{ isPrincipal: 'desc' }, { createdAt: 'asc' }],
        select: { customerProfileId: true, endereco: true, numero: true, lat: true, lng: true },
      }),
      // O DIA DO CLIENTE — fonte ÚNICA (05/08). Não há mais fallback nem flag:
      // quem manda no dia é o plano de entrega do cliente.
      this.prisma.logisticaPlanoEntrega.findMany({
        where: { companyId, customerProfileId: { in: pageIds }, ativo: true },
        select: { customerProfileId: true, diaSemana: true },
      }),
    ]);

    // Local principal (ou mais antigo ativo) por cliente — 1ª ocorrência vence.
    const principalLocalByCliente = new Map<
      string,
      { endereco: string | null; numero: string | null; lat: number | null; lng: number | null }
    >();
    for (const l of locaisAtivos) {
      if (!principalLocalByCliente.has(l.customerProfileId)) {
        principalLocalByCliente.set(l.customerProfileId, {
          endereco: l.endereco,
          numero: l.numero,
          lat: l.lat,
          lng: l.lng,
        });
      }
    }

    const financeiroAtivo = Boolean(config?.moduloFinanceiroAtivo);
    const debitoMap = financeiroAtivo
      ? await this.debitoAbertoPorClientes(companyId, pageIds)
      : new Map<string, number>();

    // 🔴 O DIA É DO CLIENTE, PONTO (ordem do dono, 05/08: "o dia, ou os dias de
    // entrega do CLIENTE. não é o produto quem decide"). A fonte é ÚNICA:
    // LogisticaPlanoEntrega — a mesma que o filtro por dia usa, a mesma que o
    // traçar rota lê, a mesma que o generateDay materializa.
    //
    // MORREU AQUI o fallback pro ClienteProduto.diasSemana (a "ponte" de 26/07,
    // que só valia com agendaV2Ativa). Ele era a 2ª verdade que fazia a tela
    // Clientes MENTIR: filtrando por SEG a lista vinha certa do servidor e as
    // legendas diziam "Entrega SEX/QUI/SÁB", porque legenda e filtro liam
    // tabelas diferentes.
    const vincByCliente = new Map<string, { dias: Set<number>; temDia: boolean }>();
    for (const p of planosAgenda) {
      let entry = vincByCliente.get(p.customerProfileId);
      if (!entry) {
        entry = { dias: new Set<number>(), temDia: false };
        vincByCliente.set(p.customerProfileId, entry);
      }
      const dia = Math.trunc(Number(p.diaSemana));
      if (dia >= 1 && dia <= 7) entry.dias.add(dia);
      entry.temDia = true;
    }

    const entregasCountMap = new Map<string, number>();
    for (const g of entregasAgg) {
      if (g.customerProfileId) {
        entregasCountMap.set(g.customerProfileId, Number((g as any)._count?._all || 0));
      }
    }

    // Índices de duplicidade (igualdade EXATA pós-normalização — sem fuzzy).
    const byNome = new Map<string, string[]>();
    const byEndereco = new Map<string, string[]>();
    const nomeById = new Map<string, string>();
    const push = (map: Map<string, string[]>, key: string, id: string) => {
      const list = map.get(key);
      if (list) list.push(id);
      else map.set(key, [id]);
    };
    for (const c of dupUniverse) {
      nomeById.set(c.id, String(c.name ?? '').trim());
      const nk = normalizeDupKey(c.name);
      if (nk) push(byNome, nk, c.id);
      const ek = enderecoDupKey(c.endereco, c.numero);
      if (ek) push(byEndereco, ek, c.id);
    }

    for (const row of rows) {
      const vinc = vincByCliente.get(row.id);

      // ordem FIXA do contrato com W6: endereco → numero → gps → dia → whatsapp.
      // MULTILOCAL (10/07) — endereco/numero/gps olham o LOCAL PRINCIPAL do cliente.
      // Sem NENHUM local ativo → as 3 acendem (o cadastro do endereço migrou pro local).
      const pendencias: ClientePendencia[] = [];
      const local = principalLocalByCliente.get(row.id) ?? null;
      if (!local) {
        pendencias.push('endereco', 'numero', 'gps');
      } else {
        if (!String(local.endereco ?? '').trim()) pendencias.push('endereco');
        if (!String(local.numero ?? '').trim()) pendencias.push('numero');
        if (local.lat == null || local.lng == null) pendencias.push('gps');
      }
      if (!vinc?.temDia) pendencias.push('dia'); // sem NENHUM vínculo → pendente
      const contatoPhone = row.contatos?.[0]?.whatsapp ?? row.contatos?.[0]?.phone;
      if (!String(row.phoneNormalized ?? contatoPhone ?? '').trim()) pendencias.push('whatsapp');

      // duplicata: o OUTRO lado do par (só entre clientes ATIVOS — os dois lados).
      let duplicataDe: { id: string; nome: string } | null = null;
      if (row.status === 'active') {
        const nk = normalizeDupKey(row.name);
        const ek = enderecoDupKey(row.endereco, row.numero);
        const candidatos = [
          ...(nk ? byNome.get(nk) ?? [] : []),
          ...(ek ? byEndereco.get(ek) ?? [] : []),
        ];
        const outro = candidatos.find((id) => id !== row.id);
        if (outro) duplicataDe = { id: outro, nome: nomeById.get(outro) ?? '' };
      }

      result.set(row.id, {
        pendencias,
        diasEntrega: vinc ? [...vinc.dias].sort((a, b) => a - b) : [],
        duplicataDe,
        entregasCount: entregasCountMap.get(row.id) ?? 0,
        // debitoAtual OMITIDO quando o módulo financeiro está off (contrato W6).
        ...(financeiroAtivo ? { debitoAtual: round2(debitoMap.get(row.id) ?? 0) } : {}),
      });
    }
    return result;
  }

  /**
   * W5 (10/07) — débito em aberto por cliente. ESPELHO EXATO da regra CANÔNICA
   * `saldoAbertoPorClientes` (backend/src/logistica/logistica.service.ts) —
   * duplicação CONSCIENTE pra não editar logistica/* hoje (W2 trabalha lá em
   * paralelo); se a regra mudar lá, espelhar aqui. Regra: Σ FinanceiroCharge
   * 'pending' com sourceModule logistica_entrega|logistica_fechamento + Σ
   * Entrega.valor 'entregue' com cobrancaStatus='aguardando_fechamento'.
   * Read-only, company-scoped, 2 groupBy por request.
   */
  private async debitoAbertoPorClientes(
    companyId: number,
    clienteIds: string[],
  ): Promise<Map<string, number>> {
    const mapa = new Map<string, number>();
    const ids = Array.from(new Set(clienteIds.filter(Boolean)));
    if (!companyId || ids.length === 0) return mapa;

    const [pendentes, aguardando] = await Promise.all([
      this.prisma.financeiroCharge.groupBy({
        by: ['customerProfileId'],
        where: {
          companyId,
          customerProfileId: { in: ids },
          status: 'pending',
          sourceModule: { in: ['logistica_entrega', 'logistica_fechamento'] },
        },
        _sum: { amount: true },
      }),
      this.prisma.entrega.groupBy({
        by: ['customerProfileId'],
        where: {
          companyId,
          customerProfileId: { in: ids },
          status: 'entregue',
          cobrancaStatus: 'aguardando_fechamento',
        },
        _sum: { valor: true },
      }),
    ]);

    const add = (id: string | null, valor: unknown) => {
      if (!id) return;
      mapa.set(id, round2((mapa.get(id) ?? 0) + Math.max(0, Number(valor) || 0)));
    };
    for (const p of pendentes) add(p.customerProfileId, p._sum?.amount);
    for (const a of aguardando) add(a.customerProfileId, a._sum?.valor);
    return mapa;
  }

  /**
   * A3 (LOGÍSTICA-MOBILE) — detalhe de UM cliente para a ficha do app de entrega.
   *
   * Ao contrário de `getEmpresa` (que trava em tipo='pj'), este lê a conta seja PF
   * ou PJ — o cadastro manual do app nasce PF ("Dona Maria"). Devolve endereço +
   * coordenada + o contato PRINCIPAL (telefone/whatsapp) + os DOIS eixos do contrato
   * financeiro (formaPagamento/metodoPadrao/contabilizar/diaFechamento), pra a ficha
   * pré-preencher edição sem endpoint novo de escrita (reusa PATCH nucleo/logistica).
   *
   * READ-ONLY, company-scoped: id inexistente OU de outro tenant → null (o controller
   * vira 404, nunca vaza a existência de conta alheia — R5).
   */
  async getCliente(companyId: number, id: string): Promise<ClienteDetail | null> {
    if (!companyId || !id) return null;
    const row = await this.prisma.customerProfile.findFirst({
      where: { id: String(id).trim(), companyId },
      select: {
        id: true,
        name: true,
        tipo: true,
        cnpj: true,
        document: true,
        endereco: true,
        // B3 — partes do endereço (número/bairro) pra o editor pré-preencher os
        // campos próprios e a reedição parar de degradar o texto composto.
        numero: true,
        // 06/08 — apartamento/bloco: o editor precisa dele pra responder "é apartamento?".
        complemento: true,
        bairro: true,
        cidade: true,
        uf: true,
        cep: true,
        lat: true,
        lng: true,
        // B1 — a ficha devolve a origem do pino atual (o editor manda de volta no
        // save, e o front decide se pisa nela ou não conforme o que o usuário fez).
        geoFonte: true,
        phone: true,
        email: true,
        status: true,
        isLead: true,
        isCliente: true,
        isFornecedor: true,
        formaPagamento: true,
        metodoPadrao: true,
        contabilizar: true,
        diaFechamento: true,
        limiteFiado: true,
        // S2 COBRANÇA-WHATS (11/07) — opt-out do aviso de cobrança (toggle da ficha).
        avisarCobranca: true,
        // PR18072026 W1 — observação livre sobre o cliente.
        observacoes: true,
        // MULTILOCAL (10/07) — a ficha agora traz TODOS os contatos (telefones[]),
        // principal primeiro. O whatsapp da ficha continua vindo do principal (abaixo).
        contatos: {
          orderBy: [{ isPrincipal: 'desc' }, { createdAt: 'asc' }],
          select: { id: true, nome: true, whatsapp: true, phone: true, isPrincipal: true },
        },
        // MULTILOCAL (10/07) — N locais de entrega (só ativos), principal primeiro.
        locais: {
          where: { ativo: true },
          orderBy: [{ isPrincipal: 'desc' }, { createdAt: 'asc' }],
          select: {
            id: true, apelido: true, endereco: true, numero: true, complemento: true, bairro: true,
            cidade: true, uf: true, cep: true, lat: true, lng: true, geoFonte: true,
            isPrincipal: true, ativo: true,
          },
        },
      },
    });
    if (!row) return null;
    // principal = o contato marcado (preserva EXATAMENTE a semântica anterior:
    // sem principal → null e o whatsapp cai pro phone da conta).
    const principal = row.contatos?.find((c) => c.isPrincipal) ?? null;

    return {
      id: row.id,
      name: row.name ?? null,
      tipo: row.tipo ?? 'pf',
      cnpj: row.cnpj ?? null,
      document: row.document ?? null,
      endereco: row.endereco ?? null,
      numero: row.numero ?? null,
      complemento: row.complemento ?? null,
      bairro: row.bairro ?? null,
      cidade: row.cidade ?? null,
      uf: row.uf ?? null,
      cep: row.cep ?? null,
      lat: row.lat ?? null,
      lng: row.lng ?? null,
      geoFonte: row.geoFonte ?? null,
      // telefone da ficha = do contato principal (fonte do fluxo do app); cai pro
      // phone da conta se o principal não tiver.
      whatsapp: principal?.whatsapp ?? principal?.phone ?? row.phone ?? null,
      email: row.email ?? null,
      isLead: Boolean(row.isLead),
      isCliente: Boolean(row.isCliente),
      isFornecedor: Boolean(row.isFornecedor),
      formaPagamento: row.formaPagamento ?? 'aberto',
      metodoPadrao: row.metodoPadrao ?? null,
      contabilizar: row.contabilizar !== false,
      diaFechamento: row.diaFechamento ?? null,
      limiteFiado: row.limiteFiado ?? null,
      // S2 COBRANÇA-WHATS — default true (coluna nova; legado sem valor = avisa).
      avisarCobranca: row.avisarCobranca !== false,
      contatoPrincipalId: principal?.id ?? null,
      // MULTILOCAL (10/07) — aditivos: locais de entrega (principal primeiro) e a lista
      // de telefones (Contatos). Cobrança segue 1 só por CONTA — isto é só ONDE/COM QUEM.
      locais: (row.locais ?? []).map((l) => ({
        id: l.id,
        apelido: l.apelido ?? null,
        endereco: l.endereco ?? null,
        numero: l.numero ?? null,
        complemento: l.complemento ?? null,
        bairro: l.bairro ?? null,
        cidade: l.cidade ?? null,
        uf: l.uf ?? null,
        cep: l.cep ?? null,
        lat: l.lat ?? null,
        lng: l.lng ?? null,
        geoFonte: l.geoFonte ?? null,
        isPrincipal: Boolean(l.isPrincipal),
        ativo: Boolean(l.ativo),
      })),
      telefones: (row.contatos ?? []).map((c) => ({
        id: c.id,
        nome: c.nome,
        whatsapp: c.whatsapp ?? null,
        phone: c.phone ?? null,
        isPrincipal: Boolean(c.isPrincipal),
      })),
      // PR18072026 W1 — observação livre sobre o cliente.
      observacoes: row.observacoes ?? null,
    };
  }

  /**
   * 🔴 QUEM JÁ ESTÁ NESTA PORTA? (28/07, ordem do dono) — leitura pura, company-scoped.
   *
   * Serve pro cadastro PERGUNTAR antes de criar mais uma linha no mesmo endereço
   * (Rota rápida do APK) e pro `createConta` não deixar passar stub duplicado.
   * A régua de "mesma porta" vive em `endereco-porta.util` (fail-closed: sem número
   * dos dois lados não decide nada).
   *
   * Candidatos vêm em 2 tiros baratos e o JS confirma a porta:
   *  1. coluna `numero` contendo os dígitos pedidos (o caminho de 99% da base nova);
   *  2. legado COMPOSTO (número dentro do texto, coluna vazia) — só se o 1º não achou.
   * Apagado (status 'deleted') nunca conta.
   */
  async acharContasNoEndereco(
    companyId: number,
    alvo: PortaCadastro,
    opts?: { ignorarId?: string | null; limite?: number },
  ): Promise<ContaNoEndereco[]> {
    if (!companyId) throw new Error('acharContasNoEndereco: companyId é obrigatório');
    const numero = numeroDaPorta(alvo);
    if (!numero) return [];
    const numeroTexto = String(numero);
    const limite = Math.min(10, Math.max(1, Math.trunc(Number(opts?.limite) || 5)));
    const ignorar = String(opts?.ignorarId ?? '');

    const select = {
      id: true,
      name: true,
      endereco: true,
      numero: true,
      bairro: true,
      cidade: true,
      uf: true,
      cep: true,
      isCliente: true,
      isLead: true,
      isFornecedor: true,
      phone: true,
    } as const;

    // 🔴 28/07 (medido na base do dono, company 48) — "Rua 14 JP, 1682" tem 9 contas:
    // 1 CLIENTE e 8 stubs de Rota rápida. Quem responde primeiro tem que ser o
    // cliente de verdade (é ele que a tela oferece pra reusar); stub vai pro fim,
    // que é onde ele serve — pra ser adotado por quem cadastrar de verdade.
    const pesoDoPapel = (row: Record<string, any>): number =>
      row.isCliente ? 0 : row.isLead || row.isFornecedor ? 1 : 2;

    const confirmar = (rows: Array<Record<string, any>>): ContaNoEndereco[] =>
      rows
        .filter((row) => String(row.id) !== ignorar && mesmaPorta(alvo, row as PortaCadastro))
        .sort((a, b) => pesoDoPapel(a) - pesoDoPapel(b))
        .slice(0, limite)
        .map((row) => ({
          id: String(row.id),
          nome: row.name ?? null,
          endereco: row.endereco ?? null,
          numero: row.numero ?? null,
          bairro: row.bairro ?? null,
          cidade: row.cidade ?? null,
          uf: row.uf ?? null,
          cep: row.cep ?? null,
          isCliente: Boolean(row.isCliente),
          isLead: Boolean(row.isLead),
          isFornecedor: Boolean(row.isFornecedor),
          telefone: row.phone ?? null,
        }));

    const porColuna = await this.prisma.customerProfile.findMany({
      where: { companyId, status: { not: 'deleted' }, numero: { contains: numeroTexto } },
      select,
      take: 60,
    });
    const achados = confirmar(porColuna);
    if (achados.length) return achados;

    const porTexto = await this.prisma.customerProfile.findMany({
      where: {
        companyId,
        status: { not: 'deleted' },
        OR: [{ numero: null }, { numero: '' }],
        endereco: { contains: numeroTexto },
      },
      select,
      take: 60,
    });
    return confirmar(porTexto);
  }

  /**
   * Cria uma CONTA manual (`origin='manual'`) + o CONTATO principal (a pessoa) —
   * o fluxo do vendedor cadastrando "Dona Maria" + endereço. GRÁTIS (não debita
   * crédito: não é lead da base 28M).
   *
   * 06/08 (REGRA do dono) — CLIENTE não entra mais sem endereço fechado: CEP e
   * número. Ver `exigirEnderecoFechado` no fim do arquivo.
   *
   * Idempotência por-tenant: se já existir uma conta com o MESMO document/cnpj
   * OU o MESMO telefone normalizado nesta empresa, faz UPSERT (não duplica) —
   * reusa `upsertContaFromCnpj` (pj com cnpj) ou resolve o profile manualmente.
   */
  async createConta(companyId: number, input: CreateContaInput): Promise<ContaCreated> {
    if (!companyId) throw new Error('createConta: companyId é obrigatório');
    const nome = String(input.nome ?? '').trim();
    // BUG 2 (11/07) — nome só-espaço/tab passava no DTO (@MinLength conta os espaços) e
    // caía aqui vazio pós-trim; entrada inválida do USUÁRIO é 400, nunca Error puro (o
    // filtro global vira 500 sem isso).
    if (!nome) throw new BadRequestException('Nome é obrigatório');
    exigirEnderecoFechado(input, input.isCliente ?? true);

    const tipo = input.tipo === 'pj' ? 'pj' : 'pf';
    const cnpj = tipo === 'pj' ? normalizeDigits(input.cnpj ?? input.document) : '';
    const document = normalizeDigits(input.document ?? input.cnpj) || null;
    const phoneRaw = input.whatsapp ?? input.phone;
    const phoneNormalized = normalizeDigits(phoneRaw) || null;

    // Papéis: cadastro manual do vendedor nasce CLIENTE por default (o pedido).
    const isCliente = input.isCliente ?? true;
    const isLead = input.isLead ?? false;
    const isFornecedor = input.isFornecedor ?? false;

    // ── Resolve idempotência: acha uma conta existente por (cnpj/document/phone) ──
    // Select traz também os campos de geo (B-backend 08/07): precisamos saber se o
    // registro JÁ tem pino (e de que fonte) antes de decidir se vale resolver no servidor.
    let existing: GeoRecord | null = null;
    if (cnpj) {
      existing = await this.prisma.customerProfile.findFirst({
        where: { companyId, cnpj },
        select: GEO_RECORD_SELECT,
      });
    }
    if (!existing && document) {
      existing = await this.prisma.customerProfile.findFirst({
        where: { companyId, document },
        select: GEO_RECORD_SELECT,
      });
    }
    if (!existing && phoneNormalized) {
      existing = await this.prisma.customerProfile.findFirst({
        where: { companyId, phoneNormalized },
        select: GEO_RECORD_SELECT,
      });
    }
    // 🔴 28/07 (dono) — STUB da mesma porta NÃO vira linha nova. A Rota rápida no modo
    // "Direção" cria conta só pra segurar o endereço da parada (sem papel nenhum:
    // isCliente/isLead/isFornecedor false); passar 3× na mesma casa criava 3 contas.
    // Quem chega depois ASSUME o stub — inclusive o cadastro de verdade, que herda a
    // porta e carimba nome + papel por cima.
    // Só STUB é absorvido aqui: conta COM papel nunca é fundida sozinha (dois
    // moradores no mesmo endereço são duas contas legítimas — juntar é decisão de
    // tela, com o nome na frente de quem cadastra, nunca silenciosa).
    if (!existing) {
      const stub = (await this.acharContasNoEndereco(companyId, input)).find(
        (conta) => !conta.isCliente && !conta.isLead && !conta.isFornecedor,
      );
      if (stub) {
        existing = await this.prisma.customerProfile.findFirst({
          where: { companyId, id: stub.id },
          select: GEO_RECORD_SELECT,
        });
      }
    }

    let contaId: string;
    if (existing) {
      // Navegador conseguiu → respeita sempre. Senão, tenta resolver no servidor
      // (Nominatim → cidade) SÓ se a conta ainda não tem nenhuma coordenada e não é
      // pino humano protegido (maybeResolveServerGeo cobre as duas checagens).
      const clientCoord = pinoValido(input.lat, input.lng);
      const resolvedGeo = clientCoord ? null : await this.maybeResolveServerGeo(input, existing);
      // TETO DE PRECISÃO (25/07) — hasCoord usa o valor FINAL (o novo se veio, senão
      // o já salvo): editar só `geoFonte` sem reenviar lat/lng ainda decide certo.
      const hasCoordParaGeoFonte = pinoValido(
        input.lat !== undefined ? input.lat : existing.lat,
        input.lng !== undefined ? input.lng : existing.lng,
      );
      const updated = await this.prisma.customerProfile.update({
        where: { id: existing.id },
        data: {
          tipo,
          name: nome,
          // BUG 1 (11/07) — coluna espelho sem acento/caixa p/ busca ILIKE-insensível-a-acento.
          searchName: normalizeSearch(nome),
          ...(document ? { document } : {}),
          ...(cnpj ? { cnpj } : {}),
          ...(phoneRaw !== undefined ? { phone: normalizeDigits(phoneRaw) || null, phoneNormalized } : {}),
          ...(input.email !== undefined ? { email: input.email || null } : {}),
          ...(input.endereco !== undefined ? { endereco: input.endereco || null } : {}),
          ...(input.numero !== undefined ? { numero: input.numero || null } : {}),
          ...(input.complemento !== undefined ? { complemento: input.complemento || null } : {}),
          ...(input.bairro !== undefined ? { bairro: input.bairro || null } : {}),
          ...(input.cidade !== undefined ? { cidade: input.cidade || null } : {}),
          ...(input.uf !== undefined ? { uf: (input.uf || '').toUpperCase() || null } : {}),
          ...(input.cep !== undefined ? { cep: input.cep || null } : {}),
          ...(resolvedGeo
            ? { lat: resolvedGeo.lat, lng: resolvedGeo.lng, geoFonte: resolvedGeo.geoFonte }
            : {
                ...(input.lat !== undefined ? { lat: input.lat } : {}),
                ...(input.lng !== undefined ? { lng: input.lng } : {}),
                // TETO DE PRECISÃO (25/07) — fail-closed: o backend decide entre
                // 'gps_cadastro'/'gps_impreciso' via gpsAccuracy, nunca confia na
                // alegação crua do cliente (ver decidirGeoFonteCadastro).
                ...(input.geoFonte !== undefined
                  ? { geoFonte: decidirGeoFonteCadastro(hasCoordParaGeoFonte, input.geoFonte, input.gpsAccuracy) }
                  : {}),
              }),
          // papéis acumulativos: só LIGAM (nunca desligam um papel já marcado)
          ...(isCliente ? { isCliente: true } : {}),
          ...(isLead ? { isLead: true } : {}),
          ...(isFornecedor ? { isFornecedor: true } : {}),
          // PR18072026 W1 — observação livre (trim + max 500).
          ...(input.observacoes !== undefined ? { observacoes: normalizeObservacoes(input.observacoes) } : {}),
        },
        select: { id: true },
      });
      contaId = updated.id;
    } else {
      const clientCoord = pinoValido(input.lat, input.lng);
      const resolvedGeo = clientCoord ? null : await this.maybeResolveServerGeo(input, null);
      const created = await this.prisma.customerProfile.create({
        data: {
          companyId,
          tipo,
          name: nome,
          // BUG 1 (11/07) — mesma coluna espelho de busca do ramo update acima.
          searchName: normalizeSearch(nome),
          cnpj: cnpj || null,
          document,
          phone: normalizeDigits(phoneRaw) || null,
          phoneNormalized,
          email: input.email || null,
          endereco: input.endereco || null,
          numero: input.numero || null,
          complemento: input.complemento || null,
          bairro: input.bairro || null,
          cidade: input.cidade || null,
          uf: (input.uf || '').toUpperCase() || null,
          cep: input.cep || null,
          lat: resolvedGeo ? resolvedGeo.lat : input.lat ?? null,
          lng: resolvedGeo ? resolvedGeo.lng : input.lng ?? null,
          // TETO DE PRECISÃO (25/07) — ver comentário equivalente no ramo update acima.
          geoFonte: resolvedGeo
            ? resolvedGeo.geoFonte
            : decidirGeoFonteCadastro(clientCoord, input.geoFonte, input.gpsAccuracy),
          isCliente,
          isLead,
          isFornecedor,
          origin: 'manual',
          // PR18072026 W1 — observação livre (trim + max 500).
          observacoes: normalizeObservacoes(input.observacoes),
        },
        select: { id: true },
      });
      contaId = created.id;
    }

    // Contato principal (a pessoa) — reusa o upsert idempotente de N1.
    const contatoId = await this.upsertContatoPrincipal({
      companyId,
      customerProfileId: contaId,
      nome,
      cargo: input.cargo ?? null,
      whatsapp: input.whatsapp ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      source: 'manual',
    });

    // MULTILOCAL (11/07) — conta criada fora da ficha (manual/import/ingestão) não pode
    // nascer sem LocalEntrega: semeia o LOCAL PRINCIPAL a partir do endereço do perfil,
    // SÓ quando o input trouxe algum campo de endereço (sem endereço → nada a semear). Se
    // a conta já existia (idempotência) e já tinha principal, isto SINCRONIZA sem duplicar.
    if (hasAnyEnderecoField(input)) {
      await this.seedOrSyncLocalPrincipal(companyId, contaId);
    }

    return { contaId, contatoId };
  }

  /**
   * IMPORTAÇÃO EM MASSA de contatos/clientes a partir de uma planilha (uma linha =
   * uma Conta + Contato principal). Roda o MESMO caminho idempotente do cadastro
   * manual (`createConta`) linha a linha — GRÁTIS (não é lead da base 28M). Uma linha
   * que falha NÃO derruba as outras: é registrada em `errors` e a batelada segue.
   *
   * Regras (pedido do dono): só `nome` é obrigatório (linha sem nome é PULADA); CNPJ
   * preenchido → a conta vira PJ automaticamente; UF aceita 2 letras OU nome do estado.
   */
  async importContas(companyId: number, rows: ImportContatoRow[]): Promise<ImportContasResult> {
    if (!companyId) throw new Error('importContas: companyId é obrigatório');
    const list = Array.isArray(rows) ? rows : [];
    const result: ImportContasResult = {
      total: list.length,
      imported: 0,
      skipped: 0,
      errors: [],
    };

    for (let i = 0; i < list.length; i++) {
      const row = list[i] || {};
      const nome = String(row.nome ?? '').trim();
      if (!nome) {
        result.skipped++;
        continue;
      }
      try {
        const cnpj = normalizeDigits(row.cnpj);
        const tipo: 'pf' | 'pj' = row.tipo === 'pj' || cnpj.length === 14 ? 'pj' : 'pf';
        await this.createConta(companyId, {
          nome,
          tipo,
          whatsapp: row.telefone ?? undefined,
          cnpj: cnpj || undefined,
          document: cnpj || undefined,
          email: row.email ?? undefined,
          endereco: row.endereco ?? undefined,
          cidade: row.cidade ?? undefined,
          uf: normalizeUf(row.uf),
          cep: row.cep ?? undefined,
          cargo: row.cargo ?? undefined,
          // Import do vendedor nasce CLIENTE por default (igual ao cadastro manual).
          isCliente: row.isCliente ?? true,
        });
        result.imported++;
      } catch (error: any) {
        result.errors.push({
          line: i + 1,
          nome,
          message: String(error?.message || error || 'linha inválida'),
        });
      }
    }

    this.logger.log(
      `[nucleo] import contatos company=${companyId} total=${result.total} imported=${result.imported} skipped=${result.skipped} errors=${result.errors.length}`,
    );
    return result;
  }

  /** Edita uma CONTA (papéis/endereço/dados). Company-scoped (isolamento duro). */
  async updateConta(companyId: number, id: string, input: UpdateContaInput): Promise<{ id: string } | null> {
    if (!companyId || !id) return null;
    // Select traz os campos de geo (B-backend 08/07) — precisamos saber se a conta JÁ
    // tem pino (e de que fonte) antes de decidir se vale tentar resolver no servidor.
    const found = await this.prisma.customerProfile.findFirst({
      where: { id, companyId },
      select: GEO_RECORD_SELECT,
    });
    if (!found) return null;

    const data: any = {};
    if (input.nome !== undefined) {
      data.name = String(input.nome).trim() || null;
      // BUG 1 (11/07) — nome mudou → a coluna espelho de busca acompanha.
      data.searchName = normalizeSearch(data.name);
    }
    if (input.tipo !== undefined) data.tipo = input.tipo === 'pj' ? 'pj' : 'pf';
    // CPF/CNPJ (07/08): mesma normalização do createConta — só DÍGITOS entram,
    // e campo apagado vira null em vez de string vazia. Nunca obrigatório.
    if (input.document !== undefined) data.document = normalizeDigits(input.document) || null;
    if (input.email !== undefined) data.email = input.email || null;
    if (input.phone !== undefined) {
      data.phone = normalizeDigits(input.phone) || null;
      data.phoneNormalized = normalizeDigits(input.phone) || null;
    }
    if (input.endereco !== undefined) data.endereco = input.endereco || null;
    if (input.numero !== undefined) data.numero = input.numero || null;
    if (input.complemento !== undefined) data.complemento = input.complemento || null;
    if (input.bairro !== undefined) data.bairro = input.bairro || null;
    if (input.cidade !== undefined) data.cidade = input.cidade || null;
    if (input.uf !== undefined) data.uf = (input.uf || '').toUpperCase() || null;
    if (input.cep !== undefined) data.cep = input.cep || null;

    // Coordenada (B-backend 08/07): o navegador mandou lat/lng explícito → respeita
    // sempre (inclusive troca o pino humano se for uma edição explícita — é o próprio
    // vendedor mexendo). Sem coordenada no resultado, tenta resolver no servidor — e
    // `maybeResolveServerGeo` blinda o pino humano ('gps_cadastro'): nunca sobrescreve.
    // 09/08 — a régua toda mora em `decidirPinoNoUpdate`, compartilhada com o
    // `updateLocal`: o que é regra no PERFIL é regra no LOCAL (e vice-versa), senão a
    // mesma edição salva coisas diferentes conforme a tela por onde ela entrou.
    Object.assign(data, await this.decidirPinoNoUpdate(input, found));

    // Papéis no PATCH: aqui podem LIGAR e DESLIGAR (é edição explícita da conta).
    if (input.isCliente !== undefined) data.isCliente = Boolean(input.isCliente);
    if (input.isLead !== undefined) data.isLead = Boolean(input.isLead);
    if (input.isFornecedor !== undefined) data.isFornecedor = Boolean(input.isFornecedor);
    // PR18072026 W1 — observação livre (trim + max 500); string vazia limpa (null).
    if (input.observacoes !== undefined) data.observacoes = normalizeObservacoes(input.observacoes);

    /* 🔴 A REGRA DE ENDEREÇO FECHADO TAMBÉM VALE NA EDIÇÃO (09/08, ordem do dono:
       "faça o cadastro recusar sem CEP/número").
       Ela existia desde 06/08 — e só no `createConta`. Por isso a base continuou
       ganhando buraco: dava pra criar a conta fechada e APAGAR o CEP no PATCH
       seguinte, e dava pra ligar `isCliente` numa conta que entrou como lead sem
       endereço nenhum. Medido em produção na company 41: 91 dos 225 clientes sem CEP.

       Duas escolhas de propósito:
       · A conta é julgada pelo RESULTADO (o que já está salvo + o que veio no corpo),
         nunca só pelo corpo — senão trocar o telefone de um cliente completo
         reprovaria por "sem CEP" que ele nunca deixou de ter.
       · Só cobra quando o PATCH ENCOSTA no endereço, ou quando a conta VIRA cliente.
         Editar nome/telefone de um cadastro legado incompleto continua passando: o
         que está barrado é criar buraco novo e é fechar o endereço pela metade. */
    const seraCliente = input.isCliente !== undefined ? Boolean(input.isCliente) : Boolean(found.isCliente);
    const virouCliente = input.isCliente === true && !found.isCliente;
    if (seraCliente && (enderecoEscritoTocado(input) || virouCliente)) {
      exigirEnderecoFechado(
        {
          cep: input.cep !== undefined ? input.cep : found.cep,
          numero: input.numero !== undefined ? input.numero : found.numero,
          endereco: input.endereco !== undefined ? input.endereco : found.endereco,
        },
        true,
      );
    }

    const updated = await this.prisma.customerProfile.update({
      where: { id: found.id },
      data,
      select: { id: true },
    });

    // MULTILOCAL (11/07) — editar endereço no PERFIL espelha no LOCAL PRINCIPAL: se há
    // principal, atualiza; se não há e a conta passou a ter endereço, cria (seed). Só
    // roda quando o update mexeu em algum campo de endereço. Idempotente, nunca duplica.
    if (enderecoFieldsTouched(input)) {
      await this.seedOrSyncLocalPrincipal(companyId, found.id);
    }

    return { id: updated.id };
  }

  /**
   * B-backend (08/07) — decide SE vale resolver coordenada no servidor pra um
   * create/update, e resolve. Gatilho: o registro (se já existir) ainda não tem
   * NENHUMA coordenada válida E não é pino humano protegido (`geoFonte='gps_cadastro'`
   * — decisão do "Usar este local" no cadastro, intocável). Usa o endereço do `input`
   * quando presente, senão cai pro do registro já salvo (edição parcial que não tocou
   * no endereço, mas a conta nunca teve pino). Best-effort: NUNCA lança (o util já
   * degrada tudo pra null internamente).
   *
   * FREIO (25/07) — o util agora só devolve coordenada que PROVA ser o endereço pedido
   * (bate cidade+UF+via e ainda número da casa OU bairro) e não existe mais fallback de
   * "centro da cidade". Então `null` aqui virou o caso NORMAL, não a exceção: conta sem
   * pino acende a pendência "GPS" no card e a primeira entrega grava a porta real.
   */
  private async maybeResolveServerGeo(
    input: {
      endereco?: string | null;
      numero?: string | null;
      bairro?: string | null;
      cidade?: string | null;
      uf?: string | null;
      cep?: string | null;
    },
    // 09/08 — sem o `id` de propósito: o LOCAL passou a usar esta mesma função (era só
    // do perfil, e por isso a porta que 62% das entregas usam nunca ganhava pino do
    // CNEFE na escrita). O `id` nunca foi lido aqui; exigi-lo só forçava duplicação.
    existing: GeoRecordParaResolver | null,
  ): Promise<{ lat: number; lng: number; geoFonte: 'geocode' | 'cnefe' | 'cnefe_cep' } | null> {
    if (existing && (pinoValido(existing.lat, existing.lng) || existing.geoFonte === 'gps_cadastro')) {
      return null; // já tem pino (qualquer fonte) OU é pino humano protegido — nunca mexe
    }

    const enderecoBruto = input.endereco ?? existing?.endereco ?? null;
    const numeroColuna = input.numero ?? existing?.numero ?? null;
    const cep = input.cep ?? existing?.cep ?? null;
    const uf = input.uf ?? existing?.uf ?? null;

    /**
     * 🔴 01/08 (teste de rota ao vivo) — o cadastro TEM um campo de endereço só
     * ("Rua, número, bairro"), então o que chega aqui é blob: "Avenida Ápia, 150,
     * Jardim Paulista". O resolver comparava esse blob INTEIRO contra o logradouro do
     * CNEFE ("AVENIDA APIA") e a régua de via reprovava — resultado medido em prod: o
     * cliente nascia sem pino, a rota entrava por texto e o km/ETA saíam errados.
     *
     * A correção não é afrouxar a régua (pino errado segue pior que pino vazio): é
     * entregar pra ela o que ela sempre esperou — a VIA limpa e o NÚMERO separado —
     * usando os mesmos extratores que o resto do sistema já usa pra decidir "mesma
     * porta" (`logradouroDoCadastro` + `extrairNumeroPorta`).
     */
    const via = logradouroDoCadastro(enderecoBruto) || enderecoBruto;
    const numeroPorta = extrairNumeroPorta({ numero: numeroColuna, endereco: enderecoBruto });

    const preciso = await resolveServerGeo({
      endereco: via,
      numero: numeroPorta == null ? null : String(numeroPorta),
      bairro: input.bairro ?? existing?.bairro,
      cidade: input.cidade ?? existing?.cidade,
      uf,
      cep,
    });
    if (preciso) return preciso;

    /**
     * SEM NÚMERO — endereço S/N (posto, chácara, praça, comércio, estrada) nunca teve
     * pino nenhum porque todo o caminho exigia número. Aqui ele ganha o ponto do TRECHO
     * do CEP, gravado com fonte PRÓPRIA (`cnefe_cep`) justamente pra tela poder dizer
     * "confira no mapa" — e pra primeira entrega com GPS real sobrescrever sem dó.
     */
    if (numeroPorta == null && cep) {
      const porCep = await resolverCnefeCep({ cep, endereco: via, uf });
      if (porCep) return { lat: porCep.lat, lng: porCep.lng, geoFonte: 'cnefe_cep' };
    }
    return null;
  }

  /**
   * 🔴 O PINO NUM PATCH (09/08) — a régua ÚNICA de perfil e local.
   *
   * Nasceu de dois defeitos que eram o mesmo defeito, um em cada porta:
   *
   * 1) `lat`/`lng` OMITIDOS não são "não mexe no pino" quando o ENDEREÇO mudou. O
   *    cockpit de endereços do desktop, ao trocar o CEP sem que o geocode prove ponto
   *    novo, simplesmente não manda lat/lng — e o endereço NOVO ficava salvo com o pino
   *    VELHO, calado, enquanto a tela dizia "sem ponto provado". Agora o corpo pode
   *    dizer `lat: null, lng: null` — "esse pino não é desta porta" — e o pino some.
   *    Junto com ele some a `geoFonte`: procedência sem ponto é mentira pronta pra
   *    enganar a próxima regra que ler só a fonte.
   *    APAGAR é sempre EXPLÍCITO: `undefined` (campo ausente) nunca apaga nada — senão
   *    qualquer PATCH de apelido viraria uma porta pra destruir pino de ouro sem querer.
   *
   * 2) Registro que fica SEM coordenada tenta o servidor (CNEFE → geocode com freio),
   *    exatamente como o perfil já fazia. `maybeResolveServerGeo` continua blindando
   *    `gps_cadastro` (decisão humana) e nunca escreve por cima de pino existente — o
   *    que volta, volta PROVADO, e só quando não há nada no lugar.
   *
   * A `geoFonte` usada na blindagem é a SALVA, não a do corpo: quem decide se um pino
   * do cliente vira 'gps_cadastro' é `decidirGeoFonteCadastro` (fail-closed), aqui só
   * se compara procedência já gravada.
   */
  private async decidirPinoNoUpdate(
    input: PinoNoCorpo,
    atual: GeoRecordParaResolver,
  ): Promise<{ lat?: number | null; lng?: number | null; geoFonte?: string | null }> {
    const apagouOPino = input.lat === null || input.lng === null;
    const latFinal = apagouOPino ? null : input.lat !== undefined ? input.lat : atual.lat;
    const lngFinal = apagouOPino ? null : input.lng !== undefined ? input.lng : atual.lng;

    const data: { lat?: number | null; lng?: number | null; geoFonte?: string | null } = {};
    if (apagouOPino) {
      data.lat = null;
      data.lng = null;
      data.geoFonte = null;
    } else {
      if (input.lat !== undefined) data.lat = input.lat;
      if (input.lng !== undefined) data.lng = input.lng;
      // TETO DE PRECISÃO (25/07) — fail-closed: o backend decide entre
      // 'gps_cadastro'/'gps_impreciso' via gpsAccuracy, nunca confia na alegação crua
      // do cliente. hasCoord usa o valor FINAL (novo se veio, senão o já salvo), então
      // editar só o `geoFonte` sem reenviar o pino ainda decide certo.
      if (input.geoFonte !== undefined) {
        data.geoFonte = decidirGeoFonteCadastro(
          pinoValido(latFinal, lngFinal),
          input.geoFonte,
          input.gpsAccuracy,
        );
      }
    }

    if (!pinoValido(latFinal, lngFinal)) {
      const resolvedGeo = await this.maybeResolveServerGeo(input, { ...atual, lat: latFinal, lng: lngFinal });
      if (resolvedGeo) {
        data.lat = resolvedGeo.lat;
        data.lng = resolvedGeo.lng;
        data.geoFonte = resolvedGeo.geoFonte;
      }
    }
    return data;
  }

  /**
   * MULTILOCAL (11/07) — semeia/sincroniza o LOCAL PRINCIPAL a partir do endereço do
   * PERFIL (CustomerProfile). O card de clientes do /entrega lê endereço/número/gps do
   * LOCAL principal; contas criadas/importadas FORA da ficha (createConta manual, import
   * de planilha, ingestão do Radar) nasciam SEM LocalEntrega → o card acendia pendência
   * falsa mesmo com endereço no perfil, e editar o endereço no perfil não refletia no local.
   *
   * IDEMPOTENTE e sem duplicar (a ficha/front já faz upsert do principal pelos endpoints de
   * local): se já existe um principal ATIVO → ATUALIZA (sync); senão, e havendo endereço no
   * perfil → CRIA principal (seed), mas SÓ quando não há nenhum local ativo (preserva a
   * invariante "1 principal por conta" — jamais cria um 2º).
   * Best-effort: NUNCA lança (não trava o cadastro) — espelha `maybeResolveServerGeo`.
   *
   * 🔴 O SYNC NÃO REBAIXA PINO (09/08). Ele roda a cada edição de QUALQUER campo de
   * endereço do perfil (`enderecoFieldsTouched`) — inclusive corrigir o bairro. Se o
   * LOCAL já tem pino provado na porta (`GEO_FONTES_DA_PORTA`) e o perfil chega com
   * fonte mais fraca, o TEXTO do endereço é copiado e o PINO fica onde está. O caso
   * real: o entregador prova a porta (`gps_entrega` vai pro local e pro perfil), depois
   * alguém arruma o bairro no perfil — e o perfil, que também tem `gps_entrega`, não
   * rebaixa nada; quem rebaixava era a cópia com fonte perdida (ver
   * `normalizeGeoFonteCopiaInterna`). Com as duas correções juntas o pino do chão só
   * some quando alguém, de propósito, manda outro.
   */
  private async seedOrSyncLocalPrincipal(companyId: number, customerProfileId: string): Promise<void> {
    if (!companyId || !customerProfileId) return;
    try {
      const perfil = await this.prisma.customerProfile.findFirst({
        where: { id: customerProfileId, companyId },
        select: {
          endereco: true, numero: true, bairro: true, cidade: true,
          uf: true, cep: true, lat: true, lng: true, geoFonte: true,
        },
      });
      if (!perfil) return;

      const textoDoEndereco = {
        endereco: perfil.endereco || null,
        numero: perfil.numero || null,
        bairro: perfil.bairro || null,
        cidade: perfil.cidade || null,
        uf: perfil.uf || null, // já normalizado (uppercase) na escrita do perfil
        cep: perfil.cep || null,
      };
      const pinoDoPerfil = {
        lat: perfil.lat ?? null,
        lng: perfil.lng ?? null,
        geoFonte: normalizeGeoFonteCopiaInterna(perfil.geoFonte),
      };
      const data = { ...textoDoEndereco, ...pinoDoPerfil };

      const principal = await this.prisma.localEntrega.findFirst({
        where: { companyId, customerProfileId, ativo: true, isPrincipal: true },
        // lat/lng/geoFonte entram no select porque o sync PRECISA saber o que vai
        // sobrescrever antes de sobrescrever (09/08 — ver o cabeçalho deste método).
        select: { id: true, lat: true, lng: true, geoFonte: true },
      });
      if (principal) {
        // SYNC: atualiza o principal existente — nunca cria um 2º (sem duplicar).
        // O pino do LOCAL só é trocado quando o do perfil vale o mesmo ou mais na
        // escada (`forcaGeoFonte`). Local sem pino, ou com pino fraco, copia tudo —
        // é o comportamento de sempre, e é o que faz o cadastro convergir.
        const localTemPinoDaPorta =
          pinoValido(principal.lat, principal.lng) && geoFonteDaPorta(principal.geoFonte);
        const perfilRebaixaria = forcaGeoFonte(pinoDoPerfil.geoFonte) < forcaGeoFonte(principal.geoFonte);
        await this.prisma.localEntrega.update({
          where: { id: principal.id },
          data: localTemPinoDaPorta && perfilRebaixaria ? textoDoEndereco : data,
        });
        return;
      }

      // SEED: só quando o perfil tem endereço E não há NENHUM local ativo. A invariante
      // garante que "sem principal ativo" ⇒ "sem locais ativos"; a contagem é o cinto de
      // segurança pra jamais criar um 2º local que ficaria sem principal.
      if (!hasAnyEnderecoField(perfil)) return;
      const ativos = await this.prisma.localEntrega.count({
        where: { companyId, customerProfileId, ativo: true },
      });
      if (ativos > 0) return;
      await this.prisma.localEntrega.create({
        data: { companyId, customerProfileId, apelido: null, ...data, isPrincipal: true, ativo: true },
      });
    } catch (err) {
      this.logger.warn(
        `[nucleo] seedOrSyncLocalPrincipal company=${companyId} conta=${customerProfileId}: ${String((err as any)?.message || err)}`,
      );
    }
  }

  /**
   * Adiciona um CONTATO (pessoa) a uma conta existente. Valida que a conta
   * pertence à empresa (isolamento). Se `isPrincipal=true`, rebaixa o principal
   * anterior (mantém no máximo 1 principal por conta).
   */
  async addContato(companyId: number, input: AddContatoInput): Promise<{ id: string } | null> {
    if (!companyId) throw new Error('addContato: companyId é obrigatório');
    const nome = String(input.nome ?? '').trim();
    // BUG 3 (11/07) — mesma causa do BUG 2 (createConta): nome só-espaço passa o
    // @MinLength(1) do DTO e chega vazio aqui pós-trim; é entrada inválida do USUÁRIO
    // (400), nunca Error puro (viraria 500 no filtro global).
    if (!input.customerProfileId || !nome) {
      throw new BadRequestException('Nome é obrigatório');
    }
    // A conta precisa ser DESTA empresa (nunca pendura contato em conta alheia).
    const conta = await this.prisma.customerProfile.findFirst({
      where: { id: input.customerProfileId, companyId },
      select: { id: true },
    });
    if (!conta) return null;

    const wantsPrincipal = Boolean(input.isPrincipal);
    if (wantsPrincipal) {
      // rebaixa o principal atual (só pode haver 1)
      await this.prisma.contato.updateMany({
        where: { companyId, customerProfileId: conta.id, isPrincipal: true },
        data: { isPrincipal: false },
      });
    }

    const created = await this.prisma.contato.create({
      data: {
        companyId,
        customerProfileId: conta.id,
        nome,
        cargo: input.cargo ?? null,
        whatsapp: normalizeDigits(input.whatsapp) || null,
        phone: normalizeDigits(input.phone) || null,
        email: input.email ?? null,
        isPrincipal: wantsPrincipal,
        source: 'manual',
      },
      select: { id: true },
    });
    return { id: created.id };
  }

  /** Edita um CONTATO. Company-scoped. Se virar principal, rebaixa o anterior. */
  async updateContato(companyId: number, id: string, input: UpdateContatoInput): Promise<{ id: string } | null> {
    if (!companyId || !id) return null;
    const found = await this.prisma.contato.findFirst({
      where: { id, companyId },
      select: { id: true, customerProfileId: true },
    });
    if (!found) return null;

    if (input.isPrincipal === true) {
      await this.prisma.contato.updateMany({
        where: {
          companyId,
          customerProfileId: found.customerProfileId,
          isPrincipal: true,
          NOT: { id: found.id },
        },
        data: { isPrincipal: false },
      });
    }

    const data: any = {};
    if (input.nome !== undefined) data.nome = String(input.nome).trim();
    if (input.cargo !== undefined) data.cargo = input.cargo || null;
    if (input.whatsapp !== undefined) data.whatsapp = normalizeDigits(input.whatsapp) || null;
    if (input.phone !== undefined) data.phone = normalizeDigits(input.phone) || null;
    if (input.email !== undefined) data.email = input.email || null;
    if (input.isPrincipal !== undefined) data.isPrincipal = Boolean(input.isPrincipal);

    const updated = await this.prisma.contato.update({
      where: { id: found.id },
      data,
      select: { id: true },
    });
    return { id: updated.id };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MULTILOCAL (10/07, docs/PLANEJAMENTOS/MULTILOCAL-10072026) — CRUD de LocalEntrega
  // (N endereços de entrega por CONTA) + CRUD de telefones (via Contato). Company-scoped
  // (companyId sempre do JWT), SEM @Admin — o próprio entregador cadastra local/telefone
  // do cliente. A cobrança segue 1 só por CONTA (customerProfileId); multi-local é apenas
  // ONDE se entrega. Escrita consciente, sem cron/boot, sem WhatsApp.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Cria um LOCAL de entrega para o cliente `:id`. O 1º local ativo do cliente nasce
   * PRINCIPAL; `isPrincipal=true` (ou ser o primeiro) desmarca os demais atomicamente.
   * Company-scoped: cliente inexistente/de outro tenant → null (o controller → 404).
   */
  async createLocal(
    companyId: number,
    customerProfileId: string,
    input: LocalInput,
  ): Promise<{ id: string } | null> {
    if (!companyId || !customerProfileId) return null;
    const conta = await this.prisma.customerProfile.findFirst({
      where: { id: String(customerProfileId).trim(), companyId },
      select: { id: true, isCliente: true },
    });
    if (!conta) return null;

    /* 🔴 O LOCAL É A PORTA — e era a porta SEM GUARDA (09/08).
       `resolverCoordenadaMultilocal` lê o LOCAL primeiro: um cliente com perfil
       perfeito e um local sem CEP entrega pelo local, e o local é que manda. A regra
       de endereço fechado nascera só no `createConta`, então a segunda casa do
       cliente entrava por aqui sem CEP nenhum e desfazia o que o perfil garantia. */
    exigirEnderecoFechado(input, Boolean(conta.isCliente));

    // 1º local ativo nasce principal (ou quando o cliente pede explicitamente).
    const ativosCount = await this.prisma.localEntrega.count({
      where: { companyId, customerProfileId: conta.id, ativo: true },
    });
    const isPrincipal = input.isPrincipal === true || ativosCount === 0;

    /* 🔴 A PORTA TAMBÉM PEDE PINO AO SERVIDOR (09/08). Só o PERFIL chamava
       `maybeResolveServerGeo` — e a porta é o LOCAL (`resolverCoordenadaMultilocal` lê
       o local primeiro; 62% das entregas medidas saem por ele). Resultado: o 2º
       endereço do cliente nascia sem pino sempre que o navegador não conseguisse
       geocodificar, e ficava esperando a 1ª entrega confirmada pra existir no mapa.
       Mesma regra do perfil: só quando o registro NASCE sem coordenada. */
    const clientCoord = pinoValido(input.lat, input.lng);
    const resolvedGeo = clientCoord ? null : await this.maybeResolveServerGeo(input, null);

    const created = await this.prisma.$transaction(async (tx) => {
      if (isPrincipal) {
        // trocar principal é ATÔMICO: desmarca o(s) principal(is) atual(is) na mesma tx.
        await tx.localEntrega.updateMany({
          where: { companyId, customerProfileId: conta.id, isPrincipal: true },
          data: { isPrincipal: false },
        });
      }
      return tx.localEntrega.create({
        data: {
          companyId,
          customerProfileId: conta.id,
          apelido: input.apelido?.trim() || null,
          endereco: input.endereco || null,
          numero: input.numero || null,
          complemento: input.complemento || null,
          bairro: input.bairro || null,
          cidade: input.cidade || null,
          uf: (input.uf || '').toUpperCase() || null,
          cep: input.cep || null,
          lat: resolvedGeo ? resolvedGeo.lat : input.lat ?? null,
          lng: resolvedGeo ? resolvedGeo.lng : input.lng ?? null,
          // TETO DE PRECISÃO (25/07) — fail-closed via decidirGeoFonteCadastro (ver
          // comentário equivalente em createConta/updateConta acima).
          geoFonte: resolvedGeo
            ? resolvedGeo.geoFonte
            : decidirGeoFonteCadastro(clientCoord, input.geoFonte, input.gpsAccuracy),
          isPrincipal,
          ativo: true,
        },
        select: { id: true },
      });
    });
    return { id: created.id };
  }

  /**
   * Edita um LOCAL (parcial). Promover a principal (`isPrincipal=true`) move a flag
   * ATOMICAMENTE (desmarca os demais do mesmo cliente). Não rebaixamos direto via PATCH
   * (`isPrincipal=false` é ignorado) — a troca se faz promovendo OUTRO local, nunca
   * deixando o cliente sem principal. Company-scoped → null (404).
   */
  async updateLocal(companyId: number, id: string, input: LocalInput): Promise<{ id: string } | null> {
    if (!companyId || !id) return null;
    const found = await this.prisma.localEntrega.findFirst({
      where: { id: String(id).trim(), companyId },
      select: {
        id: true, customerProfileId: true, isPrincipal: true, lat: true, lng: true,
        // pra julgar o endereço pelo RESULTADO (salvo + corpo), como no updateConta.
        cep: true, numero: true, endereco: true,
        // 09/08 — o resto do endereço + a procedência do pino entram porque a régua
        // do pino (`decidirPinoNoUpdate`) é a MESMA do perfil, e ela lê o registro
        // inteiro pra decidir se ainda dá pra resolver no servidor.
        bairro: true, cidade: true, uf: true, geoFonte: true,
        customerProfile: { select: { isCliente: true } },
      },
    });
    if (!found) return null;

    // Mesma regra do `createLocal`, e pelo mesmo motivo: editar o local até deixá-lo
    // sem CEP é o mesmo buraco, feito em dois passos.
    if (enderecoEscritoTocado(input)) {
      exigirEnderecoFechado(
        {
          cep: input.cep !== undefined ? input.cep : found.cep,
          numero: input.numero !== undefined ? input.numero : found.numero,
          endereco: input.endereco !== undefined ? input.endereco : found.endereco,
        },
        Boolean(found.customerProfile?.isCliente),
      );
    }

    const data: any = {};
    if (input.apelido !== undefined) data.apelido = input.apelido?.trim() || null;
    if (input.endereco !== undefined) data.endereco = input.endereco || null;
    if (input.numero !== undefined) data.numero = input.numero || null;
    if (input.complemento !== undefined) data.complemento = input.complemento || null;
    if (input.bairro !== undefined) data.bairro = input.bairro || null;
    if (input.cidade !== undefined) data.cidade = input.cidade || null;
    if (input.uf !== undefined) data.uf = (input.uf || '').toUpperCase() || null;
    if (input.cep !== undefined) data.cep = input.cep || null;
    // 09/08 — pino: MESMA régua do perfil (apagar é explícito; sem coordenada no
    // resultado, o servidor tenta provar uma). Ver `decidirPinoNoUpdate`.
    Object.assign(data, await this.decidirPinoNoUpdate(input, found));

    const promote = input.isPrincipal === true && !found.isPrincipal;

    await this.prisma.$transaction(async (tx) => {
      if (promote) {
        await tx.localEntrega.updateMany({
          where: { companyId, customerProfileId: found.customerProfileId, isPrincipal: true, NOT: { id: found.id } },
          data: { isPrincipal: false },
        });
        data.isPrincipal = true;
      }
      await tx.localEntrega.update({ where: { id: found.id }, data });
    });
    return { id: found.id };
  }

  /**
   * Soft-delete de um LOCAL (ativo=false). Barra excluir o ÚNICO local ativo do cliente
   * quando há `ClienteProduto` ativo apontando pra ele (400 curto — o vínculo ficaria
   * órfão). Se o local removido era o principal e sobrou local ativo, promove o mais
   * antigo. Idempotente (já inativo → no-op). Company-scoped → null (404).
   */
  async deleteLocal(companyId: number, id: string): Promise<{ id: string } | null> {
    if (!companyId || !id) return null;
    const found = await this.prisma.localEntrega.findFirst({
      where: { id: String(id).trim(), companyId },
      select: { id: true, customerProfileId: true, isPrincipal: true, ativo: true },
    });
    if (!found) return null;
    if (!found.ativo) return { id: found.id }; // já inativo — idempotente

    // demais locais ATIVOS do cliente (exclui o atual).
    const outrosAtivos = await this.prisma.localEntrega.findMany({
      where: { companyId, customerProfileId: found.customerProfileId, ativo: true, NOT: { id: found.id } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    // é o ÚNICO local ativo? então não pode sumir se há vínculo ATIVO apontando pra ele.
    if (outrosAtivos.length === 0) {
      const vinculo = await this.prisma.clienteProduto.findFirst({
        where: { companyId, localId: found.id, ativo: true },
        select: { id: true },
      });
      if (vinculo) {
        throw new BadRequestException({ error: 'LOCAL_UNICO_COM_VINCULO' });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.localEntrega.update({
        where: { id: found.id },
        data: { ativo: false, isPrincipal: false },
      });
      // era o principal e sobrou local ativo → promove o mais antigo (atômico).
      if (found.isPrincipal && outrosAtivos.length > 0) {
        await tx.localEntrega.update({
          where: { id: outrosAtivos[0].id },
          data: { isPrincipal: true },
        });
      }
    });
    return { id: found.id };
  }

  /**
   * Adiciona um TELEFONE (Contato) ao cliente `:id`. Exige ao menos um número (whatsapp
   * OU phone — 400 curto sem número). Sem `nome`, o próprio número identifica o Contato
   * (nome é obrigatório no schema). `isPrincipal=true` rebaixa o principal anterior.
   * Reusa `addContato` (valida o tenant). Company-scoped → null (404). SEM @Admin.
   */
  async addTelefone(
    companyId: number,
    customerProfileId: string,
    input: TelefoneInput,
  ): Promise<{ id: string } | null> {
    if (!companyId || !customerProfileId) return null;
    const whats = normalizeDigits(input.whatsapp) || null;
    const ph = normalizeDigits(input.phone) || null;
    if (!whats && !ph) {
      throw new BadRequestException({ error: 'TELEFONE_SEM_NUMERO' });
    }
    const nome = String(input.nome ?? '').trim() || whats || ph || '';
    return this.addContato(companyId, {
      customerProfileId,
      nome,
      whatsapp: input.whatsapp ?? null,
      phone: input.phone ?? null,
      isPrincipal: input.isPrincipal,
    });
  }

  /**
   * Remove um TELEFONE (Contato). Não deixa ZERAR o principal quando é o ÚNICO contato
   * do cliente (400 curto). Removendo o principal havendo outros, promove o próximo (mais
   * antigo). Snapshot em DeletionRecord (padrão do repo). Company-scoped → null (404).
   */
  async deleteTelefone(companyId: number, id: string): Promise<{ id: string } | null> {
    if (!companyId || !id) return null;
    const row = await this.prisma.contato.findFirst({
      where: { id: String(id).trim(), companyId },
      select: {
        id: true, companyId: true, customerProfileId: true, nome: true, cargo: true,
        whatsapp: true, phone: true, email: true, isPrincipal: true, source: true,
      },
    });
    if (!row) return null;

    if (row.isPrincipal) {
      const total = await this.prisma.contato.count({
        where: { companyId, customerProfileId: row.customerProfileId },
      });
      if (total <= 1) {
        throw new BadRequestException({ error: 'TELEFONE_PRINCIPAL_UNICO' });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.deletionRecord.create({
        data: {
          moduleKey: 'nucleo',
          entityType: 'Contato',
          entityId: row.id,
          companyId,
          motivo: null,
          snapshot: JSON.stringify(row),
          deletedByUserId: null,
        },
      });
      await tx.contato.delete({ where: { id: row.id } });
      // era o principal e sobraram contatos → promove o mais antigo (mantém 1 principal).
      if (row.isPrincipal) {
        const next = await tx.contato.findFirst({
          where: { companyId, customerProfileId: row.customerProfileId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (next) {
          await tx.contato.update({ where: { id: next.id }, data: { isPrincipal: true } });
        }
      }
    });
    return { id: row.id };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NÚCLEO-CRM R3 (05/07) — INTEGRIDADE da espinha (PLANO-ROBUSTEZ).
  //
  // (b) MERGE de contas duplicadas (radar×manual): funde a conta `sourceId` na
  //     `intoId` (MESMA empresa). Regra: QUEM TEM MAIS DADO VENCE como base — o
  //     vencedor sobrevive, as refs (Entrega/Contato/ClienteProduto/FinanceiroCharge/
  //     VendasLead) da PERDEDORA migram para o vencedor, a perdedora vira DeletionRecord
  //     (snapshot) e é removida. ATÔMICO ($transaction). Idempotente/seguro: não funde
  //     consigo mesma, valida que AS DUAS contas são do tenant.
  //
  // (d) SOFT-DELETE de Conta/Contato/Entrega: grava DeletionRecord (snapshot) e ESCONDE
  //     o registro, seguindo o padrão do repo. Company-scoped (isolamento duro).
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Funde `sourceId` em `intoId` (mesma empresa). O VENCEDOR (base) é quem tem mais
   * dado preenchido — não necessariamente o `intoId`. Migra as referências da
   * perdedora → vencedora, snapshota a perdedora em DeletionRecord e a remove.
   * Retorna { winnerId, loserId, moved } ou null (conta inexistente / tenant errado).
   */
  async mergeContas(
    companyId: number,
    sourceId: string,
    intoId: string,
    opts: { deletedByUserId?: number | null; motivo?: string | null } = {},
  ): Promise<MergeResult | null> {
    if (!companyId) throw new Error('mergeContas: companyId é obrigatório');
    const a = String(sourceId || '').trim();
    const b = String(intoId || '').trim();
    if (!a || !b) return null;
    // Fundir consigo mesma é no-op seguro (idempotente).
    if (a === b) {
      const self = await this.prisma.customerProfile.findFirst({
        where: { id: a, companyId },
        select: { id: true },
      });
      if (!self) return null;
      return { winnerId: a, loserId: a, moved: {}, noop: true };
    }

    // AS DUAS contas TÊM de ser desta empresa (isolamento duro — nunca funde cross-tenant).
    const [ca, cb] = await Promise.all([
      this.prisma.customerProfile.findFirst({ where: { id: a, companyId }, select: MERGE_ACCOUNT_SELECT }),
      this.prisma.customerProfile.findFirst({ where: { id: b, companyId }, select: MERGE_ACCOUNT_SELECT }),
    ]);
    if (!ca || !cb) return null;

    // Quem tem MAIS DADO vence (empate → o mais ANTIGO; empate final → menor id).
    const winner = pickRicherAccount(ca, cb);
    const loser = winner.id === ca.id ? cb : ca;

    // Atômico: migra refs + preenche buracos do vencedor + snapshot + remove a perdedora.
    const moved = await this.prisma.$transaction(async (tx) => {
      const scope = (customerProfileId: string) => ({ companyId, customerProfileId });
      // W5 (10/07): + DebtCase (FK Cascade — sem o re-aponte, apagar a perdedora
      // APAGAVA os casos de dívida junto). ClienteProduto migra inteiro: o unique
      // [companyId, customerProfileId, productId] foi REMOVIDO de propósito (TASK 5
      // 08/07 — vínculo duplicado do mesmo produto é feature), então não há colisão.
      // FinanceiroCharge: o unique parcial por entregaId viaja junto com a própria
      // charge (a linha não muda de entregaId) — também sem colisão.
      const [entregas, contatos, clienteProdutos, charges, leads, debtCases, locais] = await Promise.all([
        tx.entrega.updateMany({ where: scope(loser.id), data: { customerProfileId: winner.id } }),
        tx.contato.updateMany({ where: scope(loser.id), data: { customerProfileId: winner.id } }),
        tx.clienteProduto.updateMany({ where: scope(loser.id), data: { customerProfileId: winner.id } }),
        tx.financeiroCharge.updateMany({ where: scope(loser.id), data: { customerProfileId: winner.id } }),
        tx.vendasLead.updateMany({ where: scope(loser.id), data: { customerProfileId: winner.id } }),
        tx.debtCase.updateMany({ where: scope(loser.id), data: { customerProfileId: winner.id } }),
        // MULTILOCAL (10/07) — os locais de entrega da perdedora migram pro vencedor
        // (mesma CONTA agora; a cobrança sempre foi 1 só por customerProfileId).
        tx.localEntrega.updateMany({ where: scope(loser.id), data: { customerProfileId: winner.id } }),
      ]);

      // Papéis são acumulativos (só LIGAM) + preenche campos VAZIOS do vencedor com os
      // da perdedora (não sobrescreve o que o vencedor já tem — ele é a base).
      const fill = buildWinnerFill(winner, loser);
      // W5 (10/07) — uniques por-tenant ([companyId, phoneNormalized] e o parcial de
      // cnpj): se o fill vai CARREGAR phone/cnpj da perdedora pro vencedor, solta
      // primeiro na perdedora (ela ainda existe dentro da transação — sem isso o
      // update do vencedor colide no unique). Quando os DOIS têm phone, o do vencedor
      // (destino) é mantido — buildWinnerFill nunca sobrescreve campo preenchido.
      const clearLoser: Record<string, null> = {};
      if ('phoneNormalized' in fill) clearLoser.phoneNormalized = null;
      if ('cnpj' in fill) clearLoser.cnpj = null;
      if (Object.keys(clearLoser).length) {
        await tx.customerProfile.update({ where: { id: loser.id }, data: clearLoser });
      }
      await tx.customerProfile.update({ where: { id: winner.id }, data: fill });

      // MULTILOCAL (10/07) — NENHUM telefone some no merge. Os Contatos da perdedora já
      // migraram (updateMany acima); falta o CustomerProfile.phone DELA: se esse número
      // não ficou representado no vencedor — nem como phone da conta APÓS o fill, nem como
      // Contato — vira um Contato NÃO-principal no vencedor. Erra pro lado de PRESERVAR.
      const loserPhone = normalizeDigits(loser.phoneNormalized || loser.phone) || null;
      if (loserPhone) {
        const winnerPhoneAfter =
          normalizeDigits(
            String(('phoneNormalized' in fill ? fill.phoneNormalized : (winner.phoneNormalized ?? winner.phone)) ?? ''),
          ) || null;
        if (winnerPhoneAfter !== loserPhone) {
          const jaContato = await tx.contato.findFirst({
            where: {
              companyId,
              customerProfileId: winner.id,
              OR: [{ whatsapp: loserPhone }, { phone: loserPhone }],
            },
            select: { id: true },
          });
          if (!jaContato) {
            await tx.contato.create({
              data: {
                companyId,
                customerProfileId: winner.id,
                nome: String(loser.name ?? '').trim() || loserPhone,
                whatsapp: loserPhone,
                phone: null,
                isPrincipal: false,
                source: 'manual',
              },
            });
          }
        }
      }

      // Snapshot da perdedora ANTES de apagar (padrão DeletionRecord do repo).
      await tx.deletionRecord.create({
        data: {
          moduleKey: 'nucleo',
          entityType: 'CustomerProfile',
          entityId: loser.id,
          companyId,
          motivo: opts.motivo ?? `merge → ${winner.id}`,
          snapshot: JSON.stringify({ ...loser, mergedInto: winner.id }),
          deletedByUserId: opts.deletedByUserId ?? null,
        },
      });

      // Remove a perdedora (as refs da espinha já apontam pro vencedor; as demais
      // filhas com FK Cascade/SetNull resolvem sozinhas).
      await tx.customerProfile.delete({ where: { id: loser.id } });

      return {
        entregas: entregas.count,
        contatos: contatos.count,
        clienteProdutos: clienteProdutos.count,
        financeiroCharges: charges.count,
        vendasLeads: leads.count,
        debtCases: debtCases.count,
        locais: locais.count,
      };
    });

    this.logger.log(`[nucleo] merge conta loser=${loser.id} → winner=${winner.id} company=${companyId} moved=${JSON.stringify(moved)}`);
    return { winnerId: winner.id, loserId: loser.id, moved };
  }

  /**
   * SOFT-DELETE de uma CONTA (CustomerProfile): snapshot em DeletionRecord + esconde
   * (status='deleted', isCliente/isLead/isFornecedor off pra sumir das janelas).
   * Company-scoped. Retorna { id } ou null (inexistente / tenant errado).
   */
  async softDeleteConta(
    companyId: number,
    id: string,
    opts: { deletedByUserId?: number | null; motivo?: string | null } = {},
  ): Promise<{ id: string } | null> {
    if (!companyId || !id) return null;
    const row = await this.prisma.customerProfile.findFirst({
      where: { id: String(id).trim(), companyId },
      select: MERGE_ACCOUNT_SELECT,
    });
    if (!row) return null;
    if (row.status === 'deleted') return { id: row.id }; // idempotente

    // W5 (10/07) — dívida BLOQUEIA a exclusão SEMPRE (mesmo com o módulo financeiro
    // do tenant desligado: débito existente não deixa de existir porque a UI está
    // off). Regra do saldo = espelho da canônica (debitoAbertoPorClientes).
    const debito = (await this.debitoAbertoPorClientes(companyId, [row.id])).get(row.id) ?? 0;
    if (debito > 0) {
      throw new ConflictException({ error: 'CLIENTE_COM_DEBITO', saldo: debito });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.deletionRecord.create({
        data: {
          moduleKey: 'nucleo',
          entityType: 'CustomerProfile',
          entityId: row.id,
          companyId,
          motivo: opts.motivo ?? null,
          snapshot: JSON.stringify(row),
          deletedByUserId: opts.deletedByUserId ?? null,
        },
      });
      await tx.customerProfile.update({
        where: { id: row.id },
        data: { status: 'deleted', isCliente: false, isLead: false, isFornecedor: false },
      });
    });
    return { id: row.id };
  }

  /**
   * SOFT-DELETE de um CONTATO: snapshot + remove a linha (Contato não tem coluna de
   * status; o padrão do repo é snapshot-e-apaga quando não há flag de ocultação). O
   * histórico fica no DeletionRecord. Company-scoped.
   */
  async softDeleteContato(
    companyId: number,
    id: string,
    opts: { deletedByUserId?: number | null; motivo?: string | null } = {},
  ): Promise<{ id: string } | null> {
    if (!companyId || !id) return null;
    const row = await this.prisma.contato.findFirst({
      where: { id: String(id).trim(), companyId },
      select: {
        id: true, companyId: true, customerProfileId: true, nome: true, cargo: true,
        whatsapp: true, phone: true, email: true, isPrincipal: true, source: true,
      },
    });
    if (!row) return null;

    await this.prisma.$transaction(async (tx) => {
      await tx.deletionRecord.create({
        data: {
          moduleKey: 'nucleo',
          entityType: 'Contato',
          entityId: row.id,
          companyId,
          motivo: opts.motivo ?? null,
          snapshot: JSON.stringify(row),
          deletedByUserId: opts.deletedByUserId ?? null,
        },
      });
      await tx.contato.delete({ where: { id: row.id } });
    });
    return { id: row.id };
  }

}

// ── R3 — helpers de merge/integridade ─────────────────────────────────────────

// Campos lidos das duas contas p/ decidir o vencedor + snapshot da perdedora.
const MERGE_ACCOUNT_SELECT = {
  id: true, companyId: true, tipo: true, name: true, cnpj: true, document: true,
  phone: true, phoneNormalized: true, email: true, endereco: true, cidade: true,
  uf: true, cep: true, lat: true, lng: true, status: true,
  isLead: true, isCliente: true, isFornecedor: true, origin: true, createdAt: true,
} as const;

type MergeAccount = {
  id: string; companyId: number; tipo: string | null; name: string | null;
  cnpj: string | null; document: string | null; phone: string | null;
  phoneNormalized: string | null; email: string | null; endereco: string | null;
  cidade: string | null; uf: string | null; cep: string | null;
  lat: number | null; lng: number | null; status: string | null;
  isLead: boolean; isCliente: boolean; isFornecedor: boolean; origin: string | null;
  createdAt: Date | null;
};

// "Riqueza" = quantos campos de contato/endereço a conta tem preenchidos.
function accountRichness(a: MergeAccount): number {
  const has = (v: unknown) => (typeof v === 'string' ? v.trim().length > 0 : v != null);
  const fields: unknown[] = [a.name, a.cnpj, a.document, a.phone, a.email, a.endereco, a.cidade, a.uf, a.cep, a.lat, a.lng];
  return fields.reduce<number>((n, v) => n + (has(v) ? 1 : 0), 0);
}

// Quem vence: mais dado; empate → o mais ANTIGO (createdAt asc); empate final → menor id.
export function pickRicherAccount(a: MergeAccount, b: MergeAccount): MergeAccount {
  const ra = accountRichness(a);
  const rb = accountRichness(b);
  if (ra !== rb) return ra > rb ? a : b;
  const ta = a.createdAt ? a.createdAt.getTime() : Number.MAX_SAFE_INTEGER;
  const tb = b.createdAt ? b.createdAt.getTime() : Number.MAX_SAFE_INTEGER;
  if (ta !== tb) return ta < tb ? a : b;
  return a.id < b.id ? a : b;
}

// Preenche SÓ os buracos do vencedor com os dados da perdedora (não sobrescreve o que
// o vencedor já tem — ele é a base) + acumula papéis (só LIGA).
function buildWinnerFill(winner: MergeAccount, loser: MergeAccount): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const empty = (v: unknown) => (typeof v === 'string' ? v.trim().length === 0 : v == null);
  const carry = <K extends keyof MergeAccount>(key: K, col = key as string) => {
    if (empty(winner[key]) && !empty(loser[key])) data[col] = loser[key];
  };
  carry('name'); carry('cnpj'); carry('document'); carry('phone'); carry('phoneNormalized');
  carry('email'); carry('endereco'); carry('cidade'); carry('uf'); carry('cep');
  carry('lat'); carry('lng');
  if (loser.isLead) data.isLead = true;
  if (loser.isCliente) data.isCliente = true;
  if (loser.isFornecedor) data.isFornecedor = true;
  return data;
}

function normalizeDigits(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D+/g, '');
}

// PR18072026 W1 — observação livre do cliente: trim + max 500; string vazia
// (após trim) vira null (limpa o campo), mesmo padrão de endereco/bairro etc.
function normalizeObservacoes(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

// ── W5 (10/07) — helpers do card de clientes do /entrega ─────────────────────

/**
 * Normalização da detecção de duplicidade (SEM fuzzy — igualdade EXATA pós-
 * normalização): lowercase + sem acento + espaços colapsados. Vazio → null
 * (valor vazio nunca forma par). Exportada pra teste unitário.
 */
export function normalizeDupKey(value: string | null | undefined): string | null {
  const key = String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return key || null;
}

/**
 * Chave de duplicidade por endereço: endereco+numero normalizados, e SÓ vale
 * quando AMBOS são não-vazios (endereço sem número não forma par). Exportada
 * pra teste unitário.
 */
export function enderecoDupKey(
  endereco: string | null | undefined,
  numero: string | null | undefined,
): string | null {
  const e = normalizeDupKey(endereco);
  const n = normalizeDupKey(numero);
  return e && n ? `${e}|${n}` : null;
}

// Mesma semântica do round2 do LogisticaService (espelho consciente — ver
// debitoAbertoPorClientes).
function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * 🔴 ENDEREÇO FECHADO É REGRA DE ENTRADA (06/08, ordem do dono): "cliente não serão
 * mais aceitos cadastros sem CEP e número. se tiver só CEP até ok, aceite SN".
 *
 * Por que virou regra: a base do André tinha 109 clientes sem CEP ou sem número, e
 * cada um deles é um endereço que o sistema não consegue resolver até a porta — o
 * CNEFE entra por (CEP, número), e sem eles não há como saber onde fica a casa. Barrar
 * na ENTRADA é o único jeito de a fila parar de crescer enquanto a gente limpa o que
 * já entrou.
 *
 * Duas frouxidões DE PROPÓSITO, porque endereço de rua real é assim:
 *  · o número vale da coluna `numero` OU de dentro do texto composto (legado);
 *  · "SN"/"S/N"/"sem número" é resposta VÁLIDA — casa sem número existe, e o dono já
 *    escreve isso à mão em 10 cadastros. O que não vale é o campo em BRANCO, que não
 *    diz se é sem número ou se ninguém perguntou.
 *
 * Só vale pra CLIENTE (quem recebe entrega). Lead/fornecedor/contato seguem entrando
 * sem endereço — a regra é da logística, não do CRM.
 */
const SEM_NUMERO_DECLARADO = /^(s\.?\/?\s*n\.?|sem\s*n[uú]?mero?)$/i;

export function exigirEnderecoFechado(
  cadastro: { cep?: string | null; numero?: string | null; endereco?: string | null },
  isCliente: boolean,
): void {
  if (!isCliente) return;
  const cep = String(cadastro.cep ?? '').replace(/\D+/g, '');
  if (cep.length !== 8) {
    throw new BadRequestException('Informe o CEP do cliente (8 dígitos) — sem ele não dá pra achar a casa.');
  }
  const numeroTexto = String(cadastro.numero ?? '').trim();
  const declarouSemNumero = SEM_NUMERO_DECLARADO.test(numeroTexto)
    || /sem\s*n[uú]?mero|\bs\/?n\b/i.test(String(cadastro.endereco ?? ''));
  const temNumero = !!extrairNumeroPorta({ numero: cadastro.numero ?? null, endereco: cadastro.endereco ?? null });
  if (!temNumero && !declarouSemNumero) {
    throw new BadRequestException('Informe o número da casa — se não tiver, escreva SN.');
  }
}

/* A ESCADA DA PROCEDENCIA DO PINO mudou de casa em 09/08 (logistica-geo-fonte.util.ts):
 * a conferencia, o semaforo e o fechamento do dia tinham cada um a SUA copia, e as tres
 * ja discordavam entre si. Uma escada so, no arquivo dono do assunto `geoFonte`. */

/* CÓPIA INTERNA perfil→local (09/08) — esta função NÃO é porta de entrada de cliente.
 *
 * Ela nasceu (07/07) como "normalizeGeoFonteInput", com a allowlist curta do que o
 * front manda ('geocode' | 'gps_cadastro'), e foi ganhando remendo a cada fonte nova
 * que o próprio serviço passou a gravar ('cidade' 08/07, 'gps_impreciso' 25/07,
 * 'cnefe' 27/07). O comentário antigo dizia, com todas as letras, que 'gps_entrega'
 * "nunca é gravado aqui" — e estava certo sobre QUEM GRAVA e errado sobre o que esta
 * função faz: ela COPIA o que já está gravado no perfil para o local principal.
 *
 * 🔴 MEDIDO EM PROD (09/08): 22 perfis com `gps_entrega` e local principal ativo, e 2
 * com `cnefe_cep`. Em todos, corrigir o BAIRRO no perfil derrubava a fonte do local
 * pra null (a coordenada continuava lá, órfã) — e fonte null é justamente o que a cura
 * do CNEFE tem permissão de sobrescrever. Ou seja: o pino provado no chão pelo
 * entregador virava candidato a ser trocado por um palpite, sem ninguém pedir nada.
 * Lei nº1 da casa: pino errado é pior que pino vazio, e pino BOM que existe jamais
 * pode ser descartado.
 *
 * Por que UMA função e não duas (a "curta do cliente" + a "completa da cópia"): não
 * existe caller de cliente. O valor cru do body NUNCA passa por aqui — ele entra por
 * `decidirGeoFonteCadastro` (logistica-geo-fonte.util.ts), que é fail-closed e só
 * devolve 'geocode' | 'gps_cadastro' | 'gps_impreciso', e antes disso já bateu no
 * `@IsIn` dos DTOs. Uma segunda função com allowlist curta e zero chamadores seria
 * código morto fingindo ser trava. O nome é a trava: quem chamar isto está COPIANDO
 * o que a casa já gravou.
 *
 * A lista é a MESMA da escada acima — uma fonte nova entra em um lugar só. */
function normalizeGeoFonteCopiaInterna(v: string | null | undefined): GeoFonteGravada | null {
  // `hasOwnProperty` de propósito: `geoFonte` vem do banco como string crua, e
  // `FORCA['toString']` devolveria uma função em vez de "não conheço".
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(FORCA_GEO_FONTE, v)
    ? (v as GeoFonteGravada)
    : null;
}

// MULTILOCAL (11/07) — "a conta tem endereço?" pro seed do LOCAL PRINCIPAL: qualquer
// campo de endereço não-vazio (ou coordenada numérica válida) conta. Conta sem NENHUM
// campo de endereço → nada a semear (o card do /entrega não acende pendência falsa).
function hasAnyEnderecoField(input: {
  endereco?: string | null;
  numero?: string | null;
  /** 06/08 — apartamento/bloco/sala (o que separa duas contas na mesma porta). */
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  lat?: number | null;
  lng?: number | null;
}): boolean {
  const filled = (v: string | null | undefined) => typeof v === 'string' && v.trim().length > 0;
  return (
    filled(input.endereco) ||
    filled(input.numero) ||
    filled(input.bairro) ||
    filled(input.cidade) ||
    filled(input.uf) ||
    filled(input.cep) ||
    pinoValido(input.lat, input.lng)
  );
}

// MULTILOCAL (11/07) — o update MEXEU em algum campo de endereço? (presença no body,
// `!== undefined` — inclui limpar pra vazio). É o gate do sync do LOCAL PRINCIPAL no
// updateConta: só sincroniza o local quando o endereço do perfil foi de fato tocado.
function enderecoFieldsTouched(input: {
  endereco?: string | null;
  numero?: string | null;
  /** 06/08 — apartamento/bloco/sala (o que separa duas contas na mesma porta). */
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  lat?: number | null;
  lng?: number | null;
  geoFonte?: string | null;
}): boolean {
  return (
    input.endereco !== undefined ||
    input.numero !== undefined ||
    input.bairro !== undefined ||
    input.cidade !== undefined ||
    input.uf !== undefined ||
    input.cep !== undefined ||
    input.lat !== undefined ||
    input.lng !== undefined ||
    input.geoFonte !== undefined
  );
}

/**
 * O PATCH encostou no ENDEREÇO ESCRITO? (09/08) — gate da regra de endereço fechado.
 *
 * Parece o `enderecoFieldsTouched` de cima, e a diferença é o ponto inteiro: aquele
 * inclui `lat`/`lng`/`geoFonte`, porque o sync do local principal tem que rodar
 * quando o PINO muda. Aqui não pode incluir: marcar o ponto no mapa é justamente
 * como o dono conserta um endereço ruim na rua, e cobrar CEP nessa hora barraria a
 * correção — a tela recusaria exatamente a ação que melhora o cadastro.
 * Pino não é endereço: quem manda pino não está reescrevendo a porta.
 */
function enderecoEscritoTocado(input: {
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
}): boolean {
  return (
    input.endereco !== undefined ||
    input.numero !== undefined ||
    input.bairro !== undefined ||
    input.cidade !== undefined ||
    input.uf !== undefined ||
    input.cep !== undefined
  );
}

// B-backend (08/07) — recorte do CustomerProfile que `maybeResolveServerGeo` precisa pra
// decidir se vale (e com que endereço) resolver coordenada no servidor.
type GeoRecord = {
  id: string;
  lat: number | null;
  lng: number | null;
  geoFonte: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
};

/** 09/08 — o mesmo recorte SEM o `id`: é o que `maybeResolveServerGeo` de fato lê, e é
 *  o que o LOCAL consegue oferecer sem fingir ser um CustomerProfile. */
type GeoRecordParaResolver = Omit<GeoRecord, 'id'>;

/** 09/08 — o pedaço do corpo de um PATCH que decide o PINO (perfil ou local). Os campos
 *  de endereço entram porque, sem coordenada, é deles que o servidor tenta provar uma. */
interface PinoNoCorpo {
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  lat?: number | null;
  lng?: number | null;
  geoFonte?: string | null;
  gpsAccuracy?: number | null;
}

const GEO_RECORD_SELECT = {
  id: true,
  lat: true,
  lng: true,
  geoFonte: true,
  endereco: true,
  numero: true,
  bairro: true,
  cidade: true,
  uf: true,
  cep: true,
  // 09/08 — o PATCH decide a regra de endereço fechado sobre o cadastro RESULTANTE
  // (o que já está salvo + o que veio no corpo), e pra isso precisa saber se esta
  // conta é CLIENTE. Ver `exigirEnderecoFechado` no updateConta.
  isCliente: true,
} as const;

// Casa contato↔conversa pelo MESMO número, tolerando país (55) e o "9" de celular.
// Devolve as chaves LOCAIS comparáveis (DDD+número): p.ex. "85999990000" e a
// variante sem o 9 ("8599990000"). Interseção não-vazia entre dois conjuntos de
// chaves = mesmo telefone (evita falso-positivo cross-DDD do simples "últimos 8").
function phoneLocalKeys(raw: string | null | undefined): string[] {
  const digits = normalizeDigits(raw);
  if (digits.length < 10) return [];
  let local = digits;
  if (local.length > 11 && local.startsWith('55')) local = local.slice(2);
  const keys = new Set<string>();
  keys.add(local);
  if (local.length === 11 && local[2] === '9') {
    keys.add(local.slice(0, 2) + local.slice(3)); // celular sem o 9 (10 dígitos)
  } else if (local.length === 10) {
    keys.add(local.slice(0, 2) + '9' + local.slice(2)); // celular com o 9 (11 dígitos)
  }
  return [...keys];
}

// Import de planilha: coluna "uf" aceita 2 letras OU o nome do estado ("Ceará",
// "sao paulo"). Devolve a sigla de 2 letras, ou undefined quando não reconhece
// (deixa vazio em vez de gravar lixo). Sem acento/caixa importam.
const UF_SIGLAS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);
const UF_POR_NOME: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
  'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA',
  'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA',
  paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};
function normalizeUf(value: string | null | undefined): string | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  if (upper.length === 2 && UF_SIGLAS.has(upper)) return upper;
  const key = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return UF_POR_NOME[key] ?? undefined;
}

export interface UpsertContaFromCnpjInput {
  companyId: number;
  cnpj: string;
  nome?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** papéis — default: isLead=true (veio do Radar), demais false */
  isLead?: boolean;
  isCliente?: boolean;
  isFornecedor?: boolean;
  /** 'radar' | 'manual' | 'import' — default 'radar' pra este caminho */
  origin?: string;
}

/** N2 (05/07) — input do upsert de lead WEB do Radar (sem CNPJ), chave = phoneNormalized. */
export interface UpsertContaFromRadarWebLeadInput {
  companyId: number;
  nome?: string | null;
  phone?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
}

export interface UpsertContatoPrincipalInput {
  companyId: number;
  customerProfileId: string;
  nome: string;
  cargo?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  email?: string | null;
  /** 'radar' | 'manual' | 'cnpj_socio' — default 'manual' */
  source?: string;
}

// ── N3 — tipos de LEITURA (janela Empresas) ────────────────────────────────
export interface ListEmpresasParams {
  query?: string;
  uf?: string;
  page?: number;
  pageSize?: number;
  // Só o listClientes usa: dias da semana (1=seg … 7=dom) do plano de entrega.
  // Vazio/ausente = a base inteira, como sempre foi.
  diasSemana?: number[];
}

export interface EmpresaListItem {
  id: string;
  name: string | null;
  cnpj: string | null;
  cidade: string | null;
  uf: string | null;
  isLead: boolean;
  isCliente: boolean;
  isFornecedor: boolean;
  origin: string | null;
  contatosCount: number;
}

export interface ListEmpresasResult {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: EmpresaListItem[];
}

// ── W5 (10/07) — card de clientes do /entrega: campos ADITIVOS por item ───────
// Contrato com o W6 (frontend). Nada do EmpresaListItem foi removido/renomeado.
export type ClientePendencia = 'endereco' | 'numero' | 'gps' | 'dia' | 'whatsapp';

export interface ClienteCardExtras {
  /** ordem FIXA: endereco → numero → gps → dia → whatsapp */
  pendencias: ClientePendencia[];
  /** união ISO (1=seg…7=dom) dos dias das VISITAS ativas (LogisticaPlanoEntrega), asc */
  diasEntrega: number[];
  /** o OUTRO lado do par duplicado (company-wide, só clientes ativos) ou null */
  duplicataDe: { id: string; nome: string } | null;
  /** presente SÓ quando LogisticaConfig.moduloFinanceiroAtivo do tenant */
  debitoAtual?: number;
  /** entregas NÃO-canceladas do cliente */
  entregasCount: number;
}

// Fallback defensivo (todo row da página tem extras; isto só blinda o spread).
const EMPTY_CLIENTE_CARD_EXTRAS: ClienteCardExtras = {
  pendencias: [],
  diasEntrega: [],
  duplicataDe: null,
  entregasCount: 0,
};

export interface ClienteListItem extends EmpresaListItem, ClienteCardExtras {
  document: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  endereco: string | null;
  numero: string | null;
  formaPagamento: string;
  diaFechamento: number | null;
  // PR18072026 W1 — observação livre sobre o cliente.
  observacoes: string | null;
}

export interface ListClientesResult {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: ClienteListItem[];
}

export interface EmpresaContato {
  id: string;
  nome: string;
  cargo: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  isPrincipal: boolean;
  source: string | null;
}

export interface EmpresaDetail {
  id: string;
  name: string | null;
  cnpj: string | null;
  document: string | null;
  endereco: string | null;
  /** 09/08 — o detalhe passou a devolver o NÚMERO porque a tela de editar ganhou
   *  campo pra ele (regra de endereço fechado). Caixa vazia num cadastro que TEM
   *  número é a tela mentindo sobre o que está salvo. */
  numero: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  email: string | null;
  isLead: boolean;
  isCliente: boolean;
  isFornecedor: boolean;
  origin: string | null;
  createdAt: string | null;
  contatos: EmpresaContato[];
}

// ── A3 — detalhe do cliente pra ficha do app de entrega (PF ou PJ) ─────────
export interface ClienteDetail {
  id: string;
  name: string | null;
  tipo: string;
  cnpj: string | null;
  document: string | null;
  endereco: string | null;
  // B3 — partes do endereço (o texto composto `endereco` continua vindo tb).
  numero: string | null;
  /** 06/08 — apartamento/bloco/sala (separa duas contas na mesma porta). */
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  lat: number | null;
  lng: number | null;
  // B1 — origem do pino atual (geocode | gps_cadastro | gps_entrega | null).
  geoFonte: string | null;
  whatsapp: string | null;
  email: string | null;
  isLead: boolean;
  isCliente: boolean;
  isFornecedor: boolean;
  formaPagamento: string;
  metodoPadrao: string | null;
  contabilizar: boolean;
  diaFechamento: number | null;
  limiteFiado: number | null;
  // S2 COBRANÇA-WHATS (11/07) — opt-out do aviso de cobrança no zap (default true).
  avisarCobranca: boolean;
  contatoPrincipalId: string | null;
  // MULTILOCAL (10/07) — aditivos: N locais de entrega (principal primeiro, só ativos)
  // e a lista de telefones (Contatos). Cobrança segue 1 só por CONTA.
  locais: LocalEntregaDTO[];
  telefones: ClienteTelefone[];
  // PR18072026 W1 — observação livre sobre o cliente.
  observacoes: string | null;
}

// ── MULTILOCAL (10/07) — DTOs de leitura (ficha do cliente) ──────────────────
export interface LocalEntregaDTO {
  id: string;
  apelido: string | null;
  endereco: string | null;
  numero: string | null;
  /** 06/08 — apartamento/bloco/sala (separa duas contas na mesma porta). */
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  lat: number | null;
  lng: number | null;
  geoFonte: string | null;
  isPrincipal: boolean;
  ativo: boolean;
}

export interface ClienteTelefone {
  id: string;
  nome: string;
  whatsapp: string | null;
  phone: string | null;
  isPrincipal: boolean;
}

// ── MULTILOCAL (10/07) — inputs de escrita (CRUD locais/telefones) ───────────
export interface LocalInput {
  apelido?: string | null;
  endereco?: string | null;
  numero?: string | null;
  /** 06/08 — apartamento/bloco/sala (o que separa duas contas na mesma porta). */
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  lat?: number | null;
  lng?: number | null;
  geoFonte?: string | null;
  // TETO DE PRECISÃO DO GPS (25/07) — ver decidirGeoFonteCadastro (logistica-geo-fonte.util.ts).
  gpsAccuracy?: number | null;
  isPrincipal?: boolean;
}

export interface TelefoneInput {
  nome?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  isPrincipal?: boolean;
}

// ── N4 — tipos da janela "Contatos" (pessoas) e escrita manual ─────────────
export interface ListContatosParams {
  query?: string;
  page?: number;
  pageSize?: number;
}

// Resumo da conversa salva (WhatsApp) casada pelo telefone do contato. `id` abre
// a conversa no Atendimento (deep-link /atendimento?conversation=<id>).
export interface ContatoConversaResumo {
  id: number;
  lastMessageAt: string | null;
  mensagens: number;
}

export interface ContatoListItem {
  id: string;
  nome: string;
  cargo: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  isPrincipal: boolean;
  source: string | null;
  contaId: string;
  contaNome: string | null;
  contaTipo: string | null;
  contaIsCliente: boolean;
  contaIsLead: boolean;
  contaIsFornecedor: boolean;
  // Atendimento: "teve conversa" (conversa salva casada por telefone) + "finalizado"
  // (o SOFT-hide do cliente vive em CustomerProfile.botOff — sobrevive à troca de chip).
  conversa: ContatoConversaResumo | null;
  finalizado: boolean;
  finalizadoMotivo: string | null;
  finalizadoEm: string | null;
}

export interface ListContatosResult {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: ContatoListItem[];
}

export interface CreateContaInput {
  nome: string;
  tipo?: 'pf' | 'pj';
  whatsapp?: string | null;
  phone?: string | null;
  email?: string | null;
  document?: string | null;
  cnpj?: string | null;
  endereco?: string | null;
  // B3 — partes do endereço (dupla escrita: o texto composto vem em `endereco`).
  numero?: string | null;
  /** 06/08 — apartamento/bloco/sala (o que separa duas contas na mesma porta). */
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  lat?: number | null;
  lng?: number | null;
  // LOGÍSTICA-MOBILE B1 (07/07) — origem da coordenada. 'gps_entrega' é
  // EXCLUSIVO do confirmarEntrega (LogisticaService); aqui só 'geocode' | 'gps_cadastro'
  // | 'gps_impreciso' (25/07). Quem decide entre 'gps_cadastro'/'gps_impreciso' é
  // sempre o serviço (decidirGeoFonteCadastro), nunca este valor cru do cliente.
  geoFonte?: string | null;
  // TETO DE PRECISÃO DO GPS (25/07) — precisão do fix em METROS.
  gpsAccuracy?: number | null;
  isCliente?: boolean;
  isLead?: boolean;
  isFornecedor?: boolean;
  cargo?: string | null;
  // PR18072026 W1 — observação livre sobre o cliente.
  observacoes?: string | null;
}

export interface ContaCreated {
  contaId: string;
  contatoId: string;
}

/** 🔴 28/07 — uma conta que JÁ está na porta pedida (anti-duplicata de endereço). */
export interface ContaNoEndereco {
  id: string;
  nome: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  /** Sem nenhum papel = STUB de endereço (parada "Direção" da Rota rápida). */
  isCliente: boolean;
  isLead: boolean;
  isFornecedor: boolean;
  telefone: string | null;
}

// ── Importação em massa (planilha) ────────────────────────────────────────────
export interface ImportContatoRow {
  nome?: string | null;
  telefone?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cnpj?: string | null;
  email?: string | null;
  endereco?: string | null;
  cep?: string | null;
  cargo?: string | null;
  tipo?: 'pf' | 'pj';
  isCliente?: boolean;
}

export interface ImportContasResult {
  total: number;
  imported: number;
  skipped: number;
  errors: { line: number; nome: string; message: string }[];
}

export interface UpdateContaInput {
  nome?: string;
  tipo?: 'pf' | 'pj';
  /** CPF/CNPJ — opcional (ordem do dono 07/08); guardado só em dígitos. */
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  endereco?: string | null;
  // B3 — partes do endereço (dupla escrita: o texto composto vem em `endereco`).
  numero?: string | null;
  /** 06/08 — apartamento/bloco/sala (o que separa duas contas na mesma porta). */
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  lat?: number | null;
  lng?: number | null;
  // LOGÍSTICA-MOBILE B1 (07/07) — mesma regra do CreateContaInput acima.
  geoFonte?: string | null;
  // TETO DE PRECISÃO DO GPS (25/07) — mesma regra do CreateContaInput acima.
  gpsAccuracy?: number | null;
  isCliente?: boolean;
  isLead?: boolean;
  isFornecedor?: boolean;
  // PR18072026 W1 — observação livre sobre o cliente.
  observacoes?: string | null;
}

export interface AddContatoInput {
  customerProfileId: string;
  nome: string;
  cargo?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrincipal?: boolean;
}

export interface UpdateContatoInput {
  nome?: string;
  cargo?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrincipal?: boolean;
}

// ── R3 — merge de contas ──────────────────────────────────────────────────────
export interface MergeResult {
  winnerId: string;
  loserId: string;
  moved: {
    entregas?: number;
    contatos?: number;
    clienteProdutos?: number;
    financeiroCharges?: number;
    vendasLeads?: number;
    debtCases?: number;
    locais?: number;
  };
  noop?: boolean;
}
