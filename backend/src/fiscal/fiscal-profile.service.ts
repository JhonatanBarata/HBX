import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
// M1: cofre com chave PRÓPRIA do fiscal (HBX_FISCAL_VAULT_KEY, prefixo f1) e
// fallback transparente pro envelope legado v1 (chave do contabil).
import { fiscalVaultEncrypt, fiscalVaultDecrypt } from './fiscal-vault.util';
import type { CertSigningMaterial } from '../contabil/nfse-cert.service';
import { extrairMaterialDoPfx, MAX_PFX_BYTES } from './pfx.util';
import { FiscalAutomationLogService } from '../contabil/fiscal-automation-log.service';
import { cnpjDvValido } from './cnpj-dv.util';
import { POLITICA_GESTAO, TIPOS_EMPRESA } from './politica-gestao';

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
  endereco: { cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; completo: boolean };
  contadorAprovou: boolean;
  contadorAprovouEm: string | null;
  producaoAtivadaEm: string | null;
  cert: { configurado: boolean; expiresAt: string | null; diasParaExpirar: number | null; expirado: boolean };
  // B0 — modo da empresa (nomes do dono): 'comum' = HBX Comum · 'gestao' = HBX Gestão Fiscal
  modo: 'comum' | 'gestao';
  tipoEmpresa: string | null;
  gestao: {
    ativadaEm: string | null;
    politicaVersao: string | null;
    politicaAceiteEm: string | null;
    cnpjConferidoEm: string | null;
    cnpjSituacaoRfb: string | null;
    cnpjRfbAviso: string | null;
  };
}

@Injectable()
export class FiscalProfileService implements OnModuleInit {
  private readonly logger = new Logger(FiscalProfileService.name);

  // trilha @Optional no FIM do construtor — testes posicionais (new FiscalProfileService(prisma)) intactos.
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly trilha: FiscalAutomationLogService | null = null,
  ) {}

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
    // B5 (revisão adversarial): upsert — duas primeiras visitas simultâneas não
    // estouram P2002/500 na corrida find→create.
    return (this.prisma as any).fiscalTenantProfile.upsert({
      where: { companyId },
      create: { companyId },
      update: {},
    });
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
    endCep?: string | null;
    endLogradouro?: string | null;
    endNumero?: string | null;
    endComplemento?: string | null;
    endBairro?: string | null;
  }): Promise<PerfilPublico> {
    const atual = await this.getOrCreatePerfil(companyId);
    // B0 (decisão 12): o modo HBX Gestão Fiscal LIGA só pelo rito (ativarGestao) e,
    // depois do primeiro lançamento, NUNCA mais desliga — histórico é escrituração.
    if (dto.estoqueAtivo !== undefined) {
      const quer = Boolean(dto.estoqueAtivo);
      if (quer && !atual.estoqueAtivo) {
        throw new BadRequestException(
          'O modo HBX Gestão Fiscal é ativado pelo rito próprio (aviso → política → CNPJ conferido) — use "Ativar HBX Gestão Fiscal" na tela fiscal.',
        );
      }
      if (!quer && atual.estoqueAtivo) await this.exigirDesligavel(companyId);
    }
    const data: Record<string, unknown> = {};
    if (dto.cnpj !== undefined) {
      const digits = String(dto.cnpj || '').replace(/\D/g, '');
      if (digits && digits.length !== 14) throw new BadRequestException('CNPJ deve ter 14 dígitos.');
      data.cnpj = digits || null;
      // CNPJ mudou → a conferência antiga não vale mais (o carimbo é do número conferido).
      if (digits !== String(atual.cnpj || '')) {
        data.cnpjConferidoEm = null;
        data.cnpjSituacaoRfb = null;
        data.cnpjRfbAviso = null;
      }
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
    if (dto.endCep !== undefined) {
      const cep = String(dto.endCep || '').replace(/\D/g, '');
      if (cep && cep.length !== 8) throw new BadRequestException('CEP deve ter 8 dígitos.');
      data.endCep = cep || null;
    }
    for (const k of ['endLogradouro', 'endNumero', 'endComplemento', 'endBairro'] as const) {
      if (dto[k] !== undefined) data[k] = String(dto[k] || '').trim() || null;
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
  // MODO HBX GESTÃO FISCAL — rito de ativação (B0, decisão 12 do plano BALCÃO)
  // Ordem EXATA do dono: ① aviso da irreversibilidade → ② política aceita
  // (versão/quem/quando) → ③ CNPJ EXIGIDO e CONFERIDO → ④ dados puxados + tipo
  // de empresa → ⑤ ativa. Desligar morre no primeiro lançamento (escrituração).
  // -------------------------------------------------------------------------

  politicaGestao() {
    return { ...POLITICA_GESTAO, tiposEmpresa: TIPOS_EMPRESA };
  }

  /**
   * EXIGIR E CONFERIR: dígito verificador de verdade (antes só checava tamanho)
   * + base RFB local (28M). Devolve TUDO que a base tem pro wizard mostrar.
   */
  async conferirCnpjGestao(cnpjRaw: string) {
    const cnpj = String(cnpjRaw || '').replace(/\D/g, '');
    if (!cnpjDvValido(cnpj)) {
      throw new BadRequestException('CNPJ inválido — o dígito verificador não confere. Confira o número digitado.');
    }
    let row: any = null;
    let baseIndisponivel = false;
    try {
      row = await (this.prisma as any).cnpjPublicCompany.findFirst({
        where: { cnpj },
        select: {
          razaoSocial: true, nomeFantasia: true, situacao: true, city: true, state: true,
          address: true, email: true, phoneDigits: true, simples: true, mei: true,
          cnae: true, cnaeDescription: true, porte: true, naturezaJuridica: true,
          openedAt: true, matrizFilial: true,
        },
      });
    } catch (err) {
      baseIndisponivel = true;
      this.logger.warn(`[fiscal] conferência de CNPJ indisponível: ${String((err as Error)?.message || err).slice(0, 120)}`);
    }
    if (!row) {
      // Não encontrado NÃO bloqueia (base local pode estar defasada; empresa
      // recém-aberta) — mas o aviso fica GRAVADO no perfil e na trilha.
      return {
        cnpj,
        encontrada: false,
        aviso: baseIndisponivel
          ? 'Base da Receita indisponível neste ambiente — a ativação registra este aviso no perfil.'
          : 'CNPJ não localizado na base local da Receita (base pode estar defasada ou empresa recém-aberta). A ativação registra este aviso no perfil — confirme o número com seu contador.',
      };
    }
    const situacao = String(row.situacao || '').trim();
    // CRT sugerido pelos dados públicos: MEI→4, Simples→1, fora do Simples→3.
    // SUGESTÃO cadastral, não enquadramento — o contador do tenant confirma (decisão 11).
    const crtSugerido = row.mei === true ? 4 : row.simples === true ? 1 : row.simples === false ? 3 : null;
    return {
      cnpj,
      encontrada: true,
      razaoSocial: row.razaoSocial || row.nomeFantasia || null,
      nomeFantasia: row.nomeFantasia || null,
      situacao: situacao || null,
      situacaoAtiva: this.situacaoRfbAtiva(situacao),
      municipio: row.city || null,
      uf: row.state || null,
      endereco: row.address || null,
      email: row.email || null,
      telefone: row.phoneDigits || null,
      simples: row.simples ?? null,
      mei: row.mei ?? null,
      crtSugerido,
      cnae: row.cnae || null,
      cnaeDescricao: row.cnaeDescription || null,
      porte: row.porte || null,
      naturezaJuridica: row.naturezaJuridica || null,
      abertura: row.openedAt ? new Date(row.openedAt).toISOString().slice(0, 10) : null,
      matrizFilial: row.matrizFilial || null,
      municipioAllowlist: await this.municipioAllowlistDaCidade(row.city, row.state),
    };
  }

  async ativarGestao(companyId: number, userId: number | null, dto: { cnpj?: string; politicaVersao?: string; tipoEmpresa?: string }) {
    const perfil = await this.getOrCreatePerfil(companyId);
    if (perfil.estoqueAtivo) throw new BadRequestException('O modo HBX Gestão Fiscal já está ativo nesta empresa.');
    if (String(dto?.politicaVersao || '') !== POLITICA_GESTAO.versao) {
      throw new BadRequestException('A política do modo mudou — leia e aceite a versão atual antes de ativar.');
    }
    const tipoEmpresa = String(dto?.tipoEmpresa || '');
    if (!(TIPOS_EMPRESA as readonly string[]).includes(tipoEmpresa)) {
      throw new BadRequestException('Escolha o tipo de empresa.');
    }
    const conferencia = await this.conferirCnpjGestao(dto?.cnpj || ''); // DV valida aqui dentro
    const cnpj = conferencia.cnpj;
    if (conferencia.encontrada && conferencia.situacaoAtiva === false) {
      throw new BadRequestException(
        `Este CNPJ consta na Receita como "${conferencia.situacao}" — só empresa ATIVA pode ativar o modo. Regularize a situação ou confira o número.`,
      );
    }
    // A4: empresa amarrada à cidade do próprio CNPJ (mesma trava do perfil).
    if (perfil.municipioIbge) {
      const divergencia = await this.municipioDivergeDaRfb(cnpj, perfil.municipioIbge);
      if (divergencia) {
        throw new BadRequestException(
          `O CNPJ informado está registrado na Receita em ${divergencia}, mas o perfil aponta outro município. Acerte o município antes de ativar.`,
        );
      }
    }
    const agora = new Date();
    const data: Record<string, unknown> = {
      cnpj,
      estoqueAtivo: true,
      tipoEmpresa,
      gestaoPoliticaVersao: POLITICA_GESTAO.versao,
      gestaoPoliticaAceiteEm: agora,
      gestaoPoliticaAceitePor: userId != null ? String(userId) : null,
      gestaoAtivadaEm: agora,
      gestaoAtivadaPor: userId != null ? String(userId) : null,
      cnpjConferidoEm: agora,
      cnpjSituacaoRfb: conferencia.encontrada ? conferencia.situacao || null : null,
      cnpjRfbAviso: conferencia.encontrada ? null : conferencia.aviso || null,
    };
    if (conferencia.encontrada) {
      if (conferencia.razaoSocial) data.razaoSocial = conferencia.razaoSocial;
      if (conferencia.crtSugerido != null) data.regimeCrt = conferencia.crtSugerido;
      if (!perfil.municipioIbge && conferencia.municipioAllowlist) data.municipioIbge = conferencia.municipioAllowlist.ibge;
    }
    const next = await (this.prisma as any).fiscalTenantProfile.update({ where: { companyId }, data });
    await this.trilha?.registrar({
      sistema: 'NFSE',
      operacao: 'ATIVAR_GESTAO_FISCAL',
      requestResumo:
        `company=${companyId} cnpj=${cnpj} tipo=${tipoEmpresa} politica=${POLITICA_GESTAO.versao}` +
        (conferencia.encontrada ? ` situacao=${conferencia.situacao || '?'}` : ' AVISO_RFB=fora_da_base'),
      sucesso: true,
      resultRef: null,
      aprovadoPor: userId != null ? String(userId) : null,
    });
    const municipio = next.municipioIbge
      ? await (this.prisma as any).fiscalMunicipio.findUnique({ where: { ibge: next.municipioIbge } })
      : null;
    return {
      ativado: true,
      aviso: conferencia.encontrada ? null : conferencia.aviso || null,
      perfil: this.serializePerfil(next, municipio),
    };
  }

  /** Trava da decisão 12: existiu lançamento → o modo NUNCA mais desliga. */
  private async exigirDesligavel(companyId: number) {
    const [movimentos, xmls] = await Promise.all([
      (this.prisma as any).estoqueMovimento.count({ where: { companyId } }),
      (this.prisma as any).fiscalCompraXml.count({ where: { companyId } }),
    ]);
    if (movimentos > 0 || xmls > 0) {
      throw new BadRequestException(
        `O modo HBX Gestão Fiscal não pode mais ser desligado: já existem lançamentos (${movimentos} movimento(s) de estoque, ${xmls} nota(s) de compra) — o histórico faz parte da escrituração da empresa. Errou um lançamento? Corrija com movimento novo (ajuste/estorno), com rastro.`,
      );
    }
  }

  /** null = base não afirma nada (situação vazia) — não bloqueia por dado incompleto. */
  private situacaoRfbAtiva(situacao: string): boolean | null {
    const s = String(situacao || '').trim().toUpperCase();
    if (!s) return null;
    return s === '02' || s.includes('ATIVA');
  }

  private async municipioAllowlistDaCidade(city?: string | null, uf?: string | null) {
    if (!city) return null;
    try {
      const lista = await (this.prisma as any).fiscalMunicipio.findMany();
      const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
      const m = (lista || []).find((x: any) => norm(x.nome) === norm(city) && (!uf || norm(x.uf) === norm(uf)));
      return m ? { ibge: m.ibge, nome: m.nome, uf: m.uf, status: m.status } : null;
    } catch {
      return null;
    }
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
      certPem: fiscalVaultEncrypt(material.certPem),
      keyPem: fiscalVaultEncrypt(material.keyPem),
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
    let certPem: string | null;
    let keyPem: string | null;
    try {
      certPem = fiscalVaultDecrypt(env?.certPem);
      keyPem = fiscalVaultDecrypt(env?.keyPem);
    } catch (err) {
      // Voz em vez de 500 cru (achado do verificador): chave do cofre ausente/
      // trocada no servidor não pode virar erro mudo na emissão.
      this.logger.error(`[fiscal] cofre indisponível (company ${companyId}): ${String((err as Error)?.message || err).slice(0, 120)}`);
      throw new BadRequestException('Cofre fiscal indisponível no servidor (chave do cofre ausente ou trocada) — avise o suporte.');
    }
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
      endereco: {
        cep: p.endCep || null,
        logradouro: p.endLogradouro || null,
        numero: p.endNumero || null,
        complemento: p.endComplemento || null,
        bairro: p.endBairro || null,
        completo: Boolean(p.endCep && p.endLogradouro && p.endNumero && p.endBairro),
      },
      contadorAprovou: Boolean(p.contadorAprovou),
      contadorAprovouEm: p.contadorAprovouEm ? new Date(p.contadorAprovouEm).toISOString() : null,
      producaoAtivadaEm: p.producaoAtivadaEm ? new Date(p.producaoAtivadaEm).toISOString() : null,
      cert: {
        configurado: Boolean(p.certA1Encrypted),
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        diasParaExpirar: dias,
        expirado: dias != null && dias < 0,
      },
      modo: p.estoqueAtivo ? 'gestao' : 'comum',
      tipoEmpresa: p.tipoEmpresa || null,
      gestao: {
        ativadaEm: p.gestaoAtivadaEm ? new Date(p.gestaoAtivadaEm).toISOString() : null,
        politicaVersao: p.gestaoPoliticaVersao || null,
        politicaAceiteEm: p.gestaoPoliticaAceiteEm ? new Date(p.gestaoPoliticaAceiteEm).toISOString() : null,
        cnpjConferidoEm: p.cnpjConferidoEm ? new Date(p.cnpjConferidoEm).toISOString() : null,
        cnpjSituacaoRfb: p.cnpjSituacaoRfb || null,
        cnpjRfbAviso: p.cnpjRfbAviso || null,
      },
    };
  }
}
