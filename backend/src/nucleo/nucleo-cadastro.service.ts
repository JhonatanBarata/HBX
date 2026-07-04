import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
            },
          },
        },
      }),
    ]);

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
      })),
    };
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
  ): Promise<ListEmpresasResult> {
    if (!companyId) throw new Error('listClientes: companyId é obrigatório');
    const page = Math.max(1, Math.trunc(Number(params.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(params.pageSize) || 30)));
    const skip = (page - 1) * pageSize;
    const query = String(params.query ?? '').trim();
    const uf = String(params.uf ?? '').trim().toUpperCase();

    // Recorte por PAPEL (não por tipo): "Clientes" = mesma base, isCliente=true.
    const where: any = { companyId, isCliente: true };
    if (uf) where.uf = uf;
    if (query) {
      const queryDigits = query.replace(/\D+/g, '');
      const or: any[] = [
        { name: { contains: query, mode: 'insensitive' } },
        { cidade: { contains: query, mode: 'insensitive' } },
      ];
      if (queryDigits) {
        or.push({ cnpj: { contains: queryDigits } });
        or.push({ document: { contains: queryDigits } });
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
   * Cria uma CONTA manual (`origin='manual'`) + o CONTATO principal (a pessoa) —
   * o fluxo do vendedor cadastrando "Dona Maria" + endereço. GRÁTIS (não debita
   * crédito: não é lead da base 28M).
   *
   * Idempotência por-tenant: se já existir uma conta com o MESMO document/cnpj
   * OU o MESMO telefone normalizado nesta empresa, faz UPSERT (não duplica) —
   * reusa `upsertContaFromCnpj` (pj com cnpj) ou resolve o profile manualmente.
   */
  async createConta(companyId: number, input: CreateContaInput): Promise<ContaCreated> {
    if (!companyId) throw new Error('createConta: companyId é obrigatório');
    const nome = String(input.nome ?? '').trim();
    if (!nome) throw new Error('createConta: nome é obrigatório');

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
    let existing: { id: string } | null = null;
    if (cnpj) {
      existing = await this.prisma.customerProfile.findFirst({
        where: { companyId, cnpj },
        select: { id: true },
      });
    }
    if (!existing && document) {
      existing = await this.prisma.customerProfile.findFirst({
        where: { companyId, document },
        select: { id: true },
      });
    }
    if (!existing && phoneNormalized) {
      existing = await this.prisma.customerProfile.findFirst({
        where: { companyId, phoneNormalized },
        select: { id: true },
      });
    }

    let contaId: string;
    if (existing) {
      const updated = await this.prisma.customerProfile.update({
        where: { id: existing.id },
        data: {
          tipo,
          name: nome,
          ...(document ? { document } : {}),
          ...(cnpj ? { cnpj } : {}),
          ...(phoneRaw !== undefined ? { phone: normalizeDigits(phoneRaw) || null, phoneNormalized } : {}),
          ...(input.email !== undefined ? { email: input.email || null } : {}),
          ...(input.endereco !== undefined ? { endereco: input.endereco || null } : {}),
          ...(input.cidade !== undefined ? { cidade: input.cidade || null } : {}),
          ...(input.uf !== undefined ? { uf: (input.uf || '').toUpperCase() || null } : {}),
          ...(input.cep !== undefined ? { cep: input.cep || null } : {}),
          ...(input.lat !== undefined ? { lat: input.lat } : {}),
          ...(input.lng !== undefined ? { lng: input.lng } : {}),
          // papéis acumulativos: só LIGAM (nunca desligam um papel já marcado)
          ...(isCliente ? { isCliente: true } : {}),
          ...(isLead ? { isLead: true } : {}),
          ...(isFornecedor ? { isFornecedor: true } : {}),
        },
        select: { id: true },
      });
      contaId = updated.id;
    } else {
      const created = await this.prisma.customerProfile.create({
        data: {
          companyId,
          tipo,
          name: nome,
          cnpj: cnpj || null,
          document,
          phone: normalizeDigits(phoneRaw) || null,
          phoneNormalized,
          email: input.email || null,
          endereco: input.endereco || null,
          cidade: input.cidade || null,
          uf: (input.uf || '').toUpperCase() || null,
          cep: input.cep || null,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          isCliente,
          isLead,
          isFornecedor,
          origin: 'manual',
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

    return { contaId, contatoId };
  }

  /** Edita uma CONTA (papéis/endereço/dados). Company-scoped (isolamento duro). */
  async updateConta(companyId: number, id: string, input: UpdateContaInput): Promise<{ id: string } | null> {
    if (!companyId || !id) return null;
    const found = await this.prisma.customerProfile.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!found) return null;

    const data: any = {};
    if (input.nome !== undefined) data.name = String(input.nome).trim() || null;
    if (input.tipo !== undefined) data.tipo = input.tipo === 'pj' ? 'pj' : 'pf';
    if (input.email !== undefined) data.email = input.email || null;
    if (input.phone !== undefined) {
      data.phone = normalizeDigits(input.phone) || null;
      data.phoneNormalized = normalizeDigits(input.phone) || null;
    }
    if (input.endereco !== undefined) data.endereco = input.endereco || null;
    if (input.cidade !== undefined) data.cidade = input.cidade || null;
    if (input.uf !== undefined) data.uf = (input.uf || '').toUpperCase() || null;
    if (input.cep !== undefined) data.cep = input.cep || null;
    if (input.lat !== undefined) data.lat = input.lat;
    if (input.lng !== undefined) data.lng = input.lng;
    // Papéis no PATCH: aqui podem LIGAR e DESLIGAR (é edição explícita da conta).
    if (input.isCliente !== undefined) data.isCliente = Boolean(input.isCliente);
    if (input.isLead !== undefined) data.isLead = Boolean(input.isLead);
    if (input.isFornecedor !== undefined) data.isFornecedor = Boolean(input.isFornecedor);

    const updated = await this.prisma.customerProfile.update({
      where: { id: found.id },
      data,
      select: { id: true },
    });
    return { id: updated.id };
  }

  /**
   * Adiciona um CONTATO (pessoa) a uma conta existente. Valida que a conta
   * pertence à empresa (isolamento). Se `isPrincipal=true`, rebaixa o principal
   * anterior (mantém no máximo 1 principal por conta).
   */
  async addContato(companyId: number, input: AddContatoInput): Promise<{ id: string } | null> {
    if (!companyId) throw new Error('addContato: companyId é obrigatório');
    const nome = String(input.nome ?? '').trim();
    if (!input.customerProfileId || !nome) {
      throw new Error('addContato: customerProfileId e nome são obrigatórios');
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
      const [entregas, contatos, clienteProdutos, charges, leads] = await Promise.all([
        tx.entrega.updateMany({ where: scope(loser.id), data: { customerProfileId: winner.id } }),
        tx.contato.updateMany({ where: scope(loser.id), data: { customerProfileId: winner.id } }),
        tx.clienteProduto.updateMany({ where: scope(loser.id), data: { customerProfileId: winner.id } }),
        tx.financeiroCharge.updateMany({ where: scope(loser.id), data: { customerProfileId: winner.id } }),
        tx.vendasLead.updateMany({ where: scope(loser.id), data: { customerProfileId: winner.id } }),
      ]);

      // Papéis são acumulativos (só LIGAM) + preenche campos VAZIOS do vencedor com os
      // da perdedora (não sobrescreve o que o vencedor já tem — ele é a base).
      const fill = buildWinnerFill(winner, loser);
      await tx.customerProfile.update({ where: { id: winner.id }, data: fill });

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

// ── N4 — tipos da janela "Contatos" (pessoas) e escrita manual ─────────────
export interface ListContatosParams {
  query?: string;
  page?: number;
  pageSize?: number;
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
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  lat?: number | null;
  lng?: number | null;
  isCliente?: boolean;
  isLead?: boolean;
  isFornecedor?: boolean;
  cargo?: string | null;
}

export interface ContaCreated {
  contaId: string;
  contatoId: string;
}

export interface UpdateContaInput {
  nome?: string;
  tipo?: 'pf' | 'pj';
  email?: string | null;
  phone?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  lat?: number | null;
  lng?: number | null;
  isCliente?: boolean;
  isLead?: boolean;
  isFornecedor?: boolean;
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
  };
  noop?: boolean;
}
