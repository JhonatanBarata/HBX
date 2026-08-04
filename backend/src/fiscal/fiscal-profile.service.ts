import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { vaultEncrypt, vaultDecrypt } from '../contabil/contabil-vault.util';
import type { CertSigningMaterial } from '../contabil/nfse-cert.service';
import { extrairMaterialDoPfx, MAX_PFX_BYTES } from './pfx.util';

// ===========================================================================
// FISCAL DO TENANT — perfil fiscal POR EMPRESA + cofre A1 + catálogo de
// serviços + allowlist de municípios (PR04082026-FISCAL-TENANT F1a).
// Cofre: MESMO envelope do contabil (partes AES-256-GCM separadas via
// contabil-vault.util) — segredo NUNCA em log/response; serialização pública
// devolve só flags/validade. Toda query dos modelos Fiscal* é company-scoped
// (tenant-guard registrado).
// ===========================================================================

/** Rio Claro/SP — primeira cidade da allowlist (decisão do plano). */
const SEED_MUNICIPIOS = [
  { ibge: '3543907', nome: 'Rio Claro', uf: 'SP', status: 'EM_VALIDACAO' },
];

export interface PerfilPublico {
  configurado: boolean;
  cnpj: string | null;
  razaoSocial: string | null;
  inscricaoMunicipal: string | null;
  regimeCrt: number;
  municipioIbge: string | null;
  municipio: { ibge: string; nome: string; uf: string; status: string; rotaNfse: string } | null;
  ambiente: string;
  serieDps: string;
  escopoServico: boolean;
  escopoProduto: boolean;
  emailAutoEnvio: boolean;
  whatsAutoEnvio: boolean;
  estoqueAtivo: boolean;
  estoqueNegativo: string;
  modoEmissaoProduto: string;
  comprovanteEntrega: boolean;
  disjuntorPausado: boolean;
  cert: { configurado: boolean; expiresAt: string | null; diasParaExpirar: number | null; expirado: boolean };
}

@Injectable()
export class FiscalProfileService implements OnModuleInit {
  private readonly logger = new Logger(FiscalProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Seed idempotente da allowlist (upsert — boot nunca duplica nem sobrescreve status). */
  async onModuleInit() {
    for (const m of SEED_MUNICIPIOS) {
      try {
        await (this.prisma as any).fiscalMunicipio.upsert({
          where: { ibge: m.ibge },
          create: m,
          update: {}, // status/rota são decisão de governança — o seed nunca regride
        });
      } catch (err) {
        // Best-effort COM VOZ (lei do CNEFE): logar alto, nunca engolir em silêncio.
        this.logger.warn(`[fiscal] seed municipio ${m.ibge} falhou: ${String((err as Error)?.message || err).slice(0, 160)}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // PERFIL
  // -------------------------------------------------------------------------

  async getOrCreatePerfil(companyId: number) {
    const existing = await (this.prisma as any).fiscalTenantProfile.findUnique({ where: { companyId } });
    if (existing) return existing;
    return (this.prisma as any).fiscalTenantProfile.create({ data: { companyId } });
  }

  async getPerfilPublico(companyId: number): Promise<PerfilPublico> {
    const p = await this.getOrCreatePerfil(companyId);
    const municipio = p.municipioIbge
      ? await (this.prisma as any).fiscalMunicipio.findUnique({ where: { ibge: p.municipioIbge } })
      : null;
    return this.serializePerfil(p, municipio);
  }

  async updatePerfil(companyId: number, dto: {
    cnpj?: string;
    razaoSocial?: string;
    inscricaoMunicipal?: string | null;
    regimeCrt?: number;
    municipioIbge?: string;
    escopoServico?: boolean;
    escopoProduto?: boolean;
    emailAutoEnvio?: boolean;
    whatsAutoEnvio?: boolean;
    estoqueAtivo?: boolean;
    estoqueNegativo?: string;
    modoEmissaoProduto?: string;
    comprovanteEntrega?: boolean;
  }): Promise<PerfilPublico> {
    await this.getOrCreatePerfil(companyId);
    const data: Record<string, unknown> = {};
    if (dto.cnpj !== undefined) {
      const digits = String(dto.cnpj || '').replace(/\D/g, '');
      if (digits && digits.length !== 14) throw new BadRequestException('CNPJ deve ter 14 dígitos.');
      data.cnpj = digits || null;
    }
    if (dto.razaoSocial !== undefined) data.razaoSocial = String(dto.razaoSocial || '').trim() || null;
    if (dto.inscricaoMunicipal !== undefined) data.inscricaoMunicipal = String(dto.inscricaoMunicipal || '').trim() || null;
    if (dto.regimeCrt !== undefined) {
      const crt = Math.trunc(Number(dto.regimeCrt));
      if (![1, 2, 3, 4].includes(crt)) throw new BadRequestException('Regime (CRT) inválido.');
      data.regimeCrt = crt;
    }
    if (dto.municipioIbge !== undefined) {
      const ibge = String(dto.municipioIbge || '').replace(/\D/g, '');
      if (ibge && ibge.length !== 7) throw new BadRequestException('Código IBGE do município deve ter 7 dígitos.');
      // Revisão adversarial A4: a allowlist gate a CIDADE; isto amarra a EMPRESA à
      // cidade dela. Cruza com a base RFB (best-effort COM VOZ: base ausente no
      // ambiente = deixa passar e loga; divergência confirmada = recusa).
      if (ibge) {
        const atual = await (this.prisma as any).fiscalTenantProfile.findUnique({ where: { companyId } });
        const cnpjPerfil = String((dto.cnpj !== undefined ? dto.cnpj : atual?.cnpj) || '').replace(/\D/g, '');
        if (cnpjPerfil.length === 14) {
          const divergencia = await this.municipioDivergeDaRfb(cnpjPerfil, ibge);
          if (divergencia) {
            throw new BadRequestException(
              `O CNPJ informado está registrado na Receita em ${divergencia}. Selecione o município do próprio CNPJ — emissão em outra cidade não é permitida.`,
            );
          }
        }
      }
      data.municipioIbge = ibge || null;
    }
    for (const k of ['escopoServico', 'escopoProduto', 'emailAutoEnvio', 'whatsAutoEnvio', 'estoqueAtivo', 'comprovanteEntrega'] as const) {
      if (dto[k] !== undefined) data[k] = Boolean(dto[k]);
    }
    if (dto.estoqueNegativo !== undefined) {
      if (!['avisar', 'travar'].includes(String(dto.estoqueNegativo))) {
        throw new BadRequestException("estoqueNegativo deve ser 'avisar' ou 'travar'.");
      }
      data.estoqueNegativo = dto.estoqueNegativo;
    }
    if (dto.modoEmissaoProduto !== undefined) {
      if (!['fechamento', 'entrega'].includes(String(dto.modoEmissaoProduto))) {
        throw new BadRequestException("modoEmissaoProduto deve ser 'fechamento' ou 'entrega'.");
      }
      data.modoEmissaoProduto = dto.modoEmissaoProduto;
    }
    // GATE DURO do plano: NF-e de produto exige controle de estoque ligado.
    const next = await (this.prisma as any).fiscalTenantProfile.update({ where: { companyId }, data });
    if (next.escopoProduto && !next.estoqueAtivo) {
      await (this.prisma as any).fiscalTenantProfile.update({ where: { companyId }, data: { escopoProduto: false } });
      throw new BadRequestException('Sem controle de estoque não há emissão de nota de produto: ligue o estoque primeiro.');
    }
    const municipio = next.municipioIbge
      ? await (this.prisma as any).fiscalMunicipio.findUnique({ where: { ibge: next.municipioIbge } })
      : null;
    return this.serializePerfil(next.escopoProduto && !next.estoqueAtivo ? { ...next, escopoProduto: false } : next, municipio);
  }

  /** Rearma o disjuntor (decisão consciente do admin depois de olhar o erro). */
  async rearmarDisjuntor(companyId: number) {
    await this.getOrCreatePerfil(companyId);
    await (this.prisma as any).fiscalTenantProfile.update({
      where: { companyId },
      data: { disjuntorPausado: false, errosConsecutivos: 0 },
    });
    return { rearmado: true };
  }

  // -------------------------------------------------------------------------
  // COFRE DO CERTIFICADO A1 (por tenant)
  // -------------------------------------------------------------------------

  async uploadCertificado(companyId: number, pfxBuffer: Buffer, senha: string) {
    if (!pfxBuffer?.length) throw new BadRequestException('Envie o arquivo .pfx do certificado.');
    if (pfxBuffer.length > MAX_PFX_BYTES) throw new BadRequestException('Arquivo de certificado grande demais (máx 512KB).');
    const pass = String(senha ?? '');
    if (!pass) throw new BadRequestException('Informe a senha do certificado.');

    await this.getOrCreatePerfil(companyId);

    let material;
    try {
      material = await extrairMaterialDoPfx(pfxBuffer, pass);
    } catch (err) {
      // Mensagem GENÉRICA — nunca ecoa senha nem stderr do openssl.
      this.logger.warn(`[fiscal] extração do certificado falhou (company ${companyId}): ${String((err as Error)?.message || err).slice(0, 120)}`);
      throw new BadRequestException('Não foi possível abrir o certificado. Confira o arquivo .pfx e a senha.');
    }
    if (material.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(`Certificado já expirou (validade ${material.expiresAt.toISOString().slice(0, 10)}).`);
    }

    // Revisão adversarial M2: a senha do .pfx NÃO é guardada — a chave PEM já sai
    // sem senha (-nodes) e ninguém a lê depois. Segredo sem função é só risco.
    const envelope = JSON.stringify({
      v: 1,
      certPem: vaultEncrypt(material.certPem),
      keyPem: vaultEncrypt(material.keyPem),
    });
    await (this.prisma as any).fiscalTenantProfile.update({
      where: { companyId },
      data: { certA1Encrypted: envelope, certA1ExpiresAt: material.expiresAt },
    });
    return { configurado: true, certA1ExpiresAt: material.expiresAt.toISOString(), subject: material.subject };
  }

  async removerCertificado(companyId: number) {
    await this.getOrCreatePerfil(companyId);
    await (this.prisma as any).fiscalTenantProfile.update({
      where: { companyId },
      data: { certA1Encrypted: null, certA1ExpiresAt: null },
    });
    return { configurado: false };
  }

  /** Material decriptado SÓ em memória, na hora de assinar. Caller usa e descarta — nunca loga. */
  async getSigningMaterial(companyId: number): Promise<CertSigningMaterial> {
    const p = await (this.prisma as any).fiscalTenantProfile.findUnique({ where: { companyId } });
    if (!p?.certA1Encrypted) throw new NotFoundException('Certificado A1 não configurado no cofre fiscal da empresa.');
    let env: any;
    try {
      env = JSON.parse(String(p.certA1Encrypted));
    } catch {
      throw new BadRequestException('Envelope do certificado corrompido no cofre.');
    }
    const certPem = vaultDecrypt(env?.certPem);
    const keyPem = vaultDecrypt(env?.keyPem);
    if (!certPem || !keyPem) throw new BadRequestException('Material do certificado ausente no cofre.');
    return { certPem, keyPem };
  }

  // -------------------------------------------------------------------------
  // CATÁLOGO DE SERVIÇOS (montado 1x com o contador do tenant)
  // -------------------------------------------------------------------------

  async listarServicos(companyId: number, incluirInativos = false) {
    const where: Record<string, unknown> = { companyId };
    if (!incluirInativos) where.ativo = true;
    return (this.prisma as any).fiscalServicoCatalogo.findMany({ where, orderBy: { createdAt: 'asc' } });
  }

  async criarServico(companyId: number, dto: { descricao: string; codigoTributacaoNacional: string; cnae: string; aliquotaIss?: number | null; issRetido?: boolean }) {
    const descricao = String(dto.descricao || '').trim();
    const cTrib = String(dto.codigoTributacaoNacional || '').trim();
    const cnae = String(dto.cnae || '').replace(/\D/g, '');
    if (!descricao) throw new BadRequestException('Descrição do serviço é obrigatória.');
    if (!/^\d{2}\.\d{2}$/.test(cTrib)) throw new BadRequestException("Código de tributação nacional no formato 'XX.XX' (item da LC 116).");
    if (cnae.length !== 7) throw new BadRequestException('CNAE deve ter 7 dígitos.');
    const aliquota = dto.aliquotaIss == null ? null : Number(dto.aliquotaIss);
    if (aliquota != null && (Number.isNaN(aliquota) || aliquota < 0 || aliquota > 0.15)) {
      throw new BadRequestException('Alíquota de ISS fora da faixa legal (0 a 15%). Informe como fração, ex.: 0.02.');
    }
    return (this.prisma as any).fiscalServicoCatalogo.create({
      data: { companyId, descricao, codigoTributacaoNacional: cTrib, cnae, aliquotaIss: aliquota, issRetido: Boolean(dto.issRetido) },
    });
  }

  async atualizarServico(companyId: number, id: string, dto: { descricao?: string; aliquotaIss?: number | null; issRetido?: boolean; ativo?: boolean }) {
    const existing = await (this.prisma as any).fiscalServicoCatalogo.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Serviço não encontrado.');
    const data: Record<string, unknown> = {};
    if (dto.descricao !== undefined) {
      const d = String(dto.descricao || '').trim();
      if (!d) throw new BadRequestException('Descrição não pode ficar vazia.');
      data.descricao = d;
    }
    if (dto.aliquotaIss !== undefined) {
      const a = dto.aliquotaIss == null ? null : Number(dto.aliquotaIss);
      if (a != null && (Number.isNaN(a) || a < 0 || a > 0.15)) throw new BadRequestException('Alíquota de ISS fora da faixa legal (0 a 15%).');
      data.aliquotaIss = a;
    }
    if (dto.issRetido !== undefined) data.issRetido = Boolean(dto.issRetido);
    if (dto.ativo !== undefined) data.ativo = Boolean(dto.ativo);
    return (this.prisma as any).fiscalServicoCatalogo.update({ where: { id: existing.id }, data });
  }

  // -------------------------------------------------------------------------
  // MUNICÍPIOS (allowlist) + CONSULTA CNPJ (auto-fill da base RFB)
  // -------------------------------------------------------------------------

  async listarMunicipios() {
    return (this.prisma as any).fiscalMunicipio.findMany({ orderBy: [{ uf: 'asc' }, { nome: 'asc' }] });
  }

  /** Auto-fill do tomador: base RFB local (28M) — best-effort (dev sem dump segue manual). */
  async consultaCnpj(cnpjRaw: string) {
    const cnpj = String(cnpjRaw || '').replace(/\D/g, '');
    if (cnpj.length !== 14) throw new BadRequestException('CNPJ deve ter 14 dígitos.');
    try {
      const row = await (this.prisma as any).cnpjPublicCompany.findFirst({
        where: { cnpj },
        select: { razaoSocial: true, nomeFantasia: true, situacao: true, city: true, state: true, email: true, phoneDigits: true, address: true, simples: true, mei: true },
      });
      if (!row) return { encontrada: false, cnpj };
      return {
        encontrada: true,
        cnpj,
        razaoSocial: row.razaoSocial || row.nomeFantasia || null,
        nomeFantasia: row.nomeFantasia || null,
        situacao: row.situacao || null,
        municipio: row.city || null,
        uf: row.state || null,
        email: row.email || null,
        telefone: row.phoneDigits || null, // auto-fill do WhatsApp do tomador (F1b)
        endereco: row.address || null,
        simples: row.simples ?? null,
        mei: row.mei ?? null,
      };
    } catch (err) {
      this.logger.warn(`[fiscal] consulta CNPJ indisponível: ${String((err as Error)?.message || err).slice(0, 120)}`);
      return { encontrada: false, cnpj, aviso: 'Base RFB indisponível neste ambiente — preencha manualmente.' };
    }
  }

  // -------------------------------------------------------------------------

  /**
   * A4 — retorna a cidade da RFB ("Nome/UF") se ela EXISTIR e divergir do
   * município escolhido; null = sem divergência comprovável (bate, ou base/dado
   * indisponível — nunca travar cadastro por falta de base no ambiente).
   */
  private async municipioDivergeDaRfb(cnpj: string, ibge: string): Promise<string | null> {
    try {
      const [rfb, municipio] = await Promise.all([
        (this.prisma as any).cnpjPublicCompany.findFirst({ where: { cnpj }, select: { city: true, state: true } }),
        (this.prisma as any).fiscalMunicipio.findUnique({ where: { ibge } }),
      ]);
      if (!rfb?.city || !municipio?.nome) return null;
      const norm = (s: string) =>
        String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
      const bateCidade = norm(rfb.city) === norm(municipio.nome);
      const bateUf = !rfb.state || norm(rfb.state) === norm(municipio.uf);
      if (bateCidade && bateUf) return null;
      return `${rfb.city}${rfb.state ? `/${rfb.state}` : ''}`;
    } catch (err) {
      this.logger.warn(`[fiscal] cruzamento município×RFB indisponível: ${String((err as Error)?.message || err).slice(0, 120)}`);
      return null;
    }
  }

  private serializePerfil(p: any, municipio: any): PerfilPublico {
    const expiresAt: Date | null = p.certA1ExpiresAt ? new Date(p.certA1ExpiresAt) : null;
    const dias = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
    const configurado = Boolean(p.cnpj && p.razaoSocial && p.municipioIbge);
    return {
      configurado,
      cnpj: p.cnpj || null,
      razaoSocial: p.razaoSocial || null,
      inscricaoMunicipal: p.inscricaoMunicipal || null,
      regimeCrt: p.regimeCrt,
      municipioIbge: p.municipioIbge || null,
      municipio: municipio
        ? { ibge: municipio.ibge, nome: municipio.nome, uf: municipio.uf, status: municipio.status, rotaNfse: municipio.rotaNfse }
        : null,
      ambiente: p.ambiente,
      serieDps: p.serieDps,
      escopoServico: p.escopoServico,
      escopoProduto: p.escopoProduto,
      emailAutoEnvio: p.emailAutoEnvio,
      whatsAutoEnvio: p.whatsAutoEnvio,
      estoqueAtivo: p.estoqueAtivo,
      estoqueNegativo: p.estoqueNegativo,
      modoEmissaoProduto: p.modoEmissaoProduto || 'fechamento',
      comprovanteEntrega: Boolean(p.comprovanteEntrega),
      disjuntorPausado: p.disjuntorPausado,
      cert: {
        configurado: Boolean(p.certA1Encrypted),
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        diasParaExpirar: dias,
        expirado: dias != null && dias < 0,
      },
    };
  }
}
