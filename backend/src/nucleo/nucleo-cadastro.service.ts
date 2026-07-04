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
