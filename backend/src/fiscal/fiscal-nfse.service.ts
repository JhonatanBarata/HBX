import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { gzipSync } from 'zlib';
import { PrismaService } from '../prisma/prisma.service';
import { NfseNationalClient, type DpsInput, type NfseAmbiente } from '../contabil/nfse-national.client';
import { FiscalAutomationLogService } from '../contabil/fiscal-automation-log.service';
import { FiscalProfileService } from './fiscal-profile.service';
import { FiscalEnvioService } from './fiscal-envio.service';

// ===========================================================================
// FISCAL DO TENANT — emissão AVULSA de NFS-e na API nacional (Sefin), F1a.
// A nota nasce do PEDIDO de emissão (clique do admin do tenant), nunca de job
// em background — lei copiloto-não-piloto herdada do contabil. Rota decidida
// pela allowlist (FiscalMunicipio): NACIONAL_DIRETO usa o client do contabil
// (já paramétrico); PROVEDOR é a tomada da F2b (stub honesto até contratar).
//
// DISJUNTOR (mesma lei do S6): 3 ERROs consecutivos POR EMPRESA pausam a
// emissão até o admin rearmar — nunca 4ª tentativa às cegas.
// NUMERAÇÃO: increment atômico no perfil DENTRO do fluxo (colisão de nDPS na
// Sefin = rejeição; o increment atômico do Prisma elimina a corrida).
// ===========================================================================

const MAX_TENTATIVAS = 3;
const DISJUNTOR_LIMITE = 3;

export interface EmitirAvulsaInput {
  tomadorDoc: string;
  tomadorNome: string;
  tomadorEmail?: string | null;
  tomadorFone?: string | null; // WhatsApp do tomador (F1b) — destino do envio auto
  servicoId: string;
  valorCents: number;
  descricao?: string | null;
}

@Injectable()
export class FiscalNfseService {
  private readonly logger = new Logger(FiscalNfseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly profile: FiscalProfileService,
    private readonly client: NfseNationalClient,
    private readonly trilha: FiscalAutomationLogService,
    // Opcional: testes montam o serviço sem envio; no app o módulo sempre provê.
    @Optional() private readonly envio?: FiscalEnvioService,
  ) {}

  // -------------------------------------------------------------------------
  // EMISSÃO AVULSA
  // -------------------------------------------------------------------------

  async emitirAvulsa(companyId: number, userId: number | null, input: EmitirAvulsaInput) {
    const { perfil, municipio } = await this.validarPerfilProntoParaEmitir(companyId);

    const tomadorDoc = String(input.tomadorDoc || '').replace(/\D/g, '');
    if (![11, 14].includes(tomadorDoc.length)) {
      throw new BadRequestException('Documento do tomador deve ser CPF (11) ou CNPJ (14 dígitos).');
    }
    const tomadorNome = String(input.tomadorNome || '').trim();
    if (!tomadorNome) throw new BadRequestException('Nome do tomador é obrigatório.');
    const tomadorFone = String(input.tomadorFone || '').replace(/\D/g, '');
    if (tomadorFone && tomadorFone.length < 10) {
      throw new BadRequestException('WhatsApp do tomador incompleto — informe DDD + número (ou deixe vazio).');
    }
    const valorCents = Math.trunc(Number(input.valorCents));
    if (!Number.isFinite(valorCents) || valorCents <= 0) throw new BadRequestException('Valor da nota deve ser maior que zero.');
    // Teto do int4 (revisão adversarial M4): valor além disso estouraria o INSERT
    // DEPOIS de queimar número de DPS. Nota acima de R$ 21 milhões não é caso da v1.
    if (valorCents > 2_000_000_000) throw new BadRequestException('Valor acima do suportado (R$ 20.000.000,00). Fale com o suporte.');

    const servico = await (this.prisma as any).fiscalServicoCatalogo.findFirst({
      where: { id: String(input.servicoId || ''), companyId, ativo: true },
    });
    if (!servico) throw new BadRequestException('Serviço não encontrado no catálogo da empresa.');

    // Documento nasce PENDENTE com numeração reservada atomicamente.
    // ⚠️ originKey aqui NÃO é dedup de conteúdo (o número é único por construção):
    // dois pedidos idênticos geram DUAS notas — igual a dois cliques no emissor da
    // prefeitura. Idempotência REAL por origem entra quando FECHAMENTO/OS plugarem
    // (originKey = 'fechamento:<chargeId>' etc., aí sim o UNIQUE morde).
    const numero = await this.reservarNumero(companyId);
    const doc = await (this.prisma as any).fiscalDocumento.create({
      data: {
        companyId,
        tipo: 'NFSE',
        origem: 'AVULSA',
        originKey: `avulsa:${companyId}:${perfil.serieDps}:${numero}`,
        // Snapshot do prestador (A2): a DANFSe desta nota nunca muda com o perfil.
        prestadorRazaoSocial: perfil.razaoSocial,
        prestadorCnpj: perfil.cnpj,
        prestadorMunicipio: municipio ? `${municipio.nome}/${municipio.uf}` : null,
        status: 'PENDENTE',
        tomadorDoc,
        tomadorNome,
        tomadorEmail: String(input.tomadorEmail || '').trim() || null,
        tomadorFone: tomadorFone || null,
        servicoId: servico.id,
        descricao: String(input.descricao || '').trim() || servico.descricao,
        valorCents,
        competencia: this.competenciaAtual(),
        emissorRota: 'NACIONAL_DIRETO',
        ambiente: perfil.ambiente,
        serie: perfil.serieDps,
        numero,
      },
    });

    return this.transmitir(companyId, userId, doc.id);
  }

  /** Reemissão de documento em ERRO/REJEITADA (mesmo número — a DPS não foi aceita). */
  async reemitir(companyId: number, userId: number | null, documentoId: string) {
    const doc = await (this.prisma as any).fiscalDocumento.findFirst({ where: { id: documentoId, companyId } });
    if (!doc) throw new NotFoundException('Documento não encontrado.');
    if (!['ERRO', 'REJEITADA'].includes(doc.status)) {
      throw new BadRequestException('Só documento em ERRO ou REJEITADA pode ser reemitido.');
    }
    if (doc.tentativas >= MAX_TENTATIVAS) {
      throw new BadRequestException(`Máximo de ${MAX_TENTATIVAS} tentativas atingido — revise o erro antes de insistir (disjuntor).`);
    }
    await this.validarPerfilProntoParaEmitir(companyId);
    return this.transmitir(companyId, userId, doc.id);
  }

  // -------------------------------------------------------------------------
  // CANCELAMENTO — rito legal com rastro; nada some.
  // -------------------------------------------------------------------------

  async cancelar(companyId: number, documentoId: string, motivo: string) {
    const motivoLimpo = String(motivo || '').trim();
    if (motivoLimpo.length < 5) throw new BadRequestException('Motivo do cancelamento é obrigatório (mínimo 5 caracteres).');
    const doc = await (this.prisma as any).fiscalDocumento.findFirst({ where: { id: documentoId, companyId } });
    if (!doc) throw new NotFoundException('Documento não encontrado.');
    if (doc.status !== 'AUTORIZADA') throw new BadRequestException('Só nota AUTORIZADA pode ser cancelada.');
    const updated = await (this.prisma as any).fiscalDocumento.update({
      where: { id: doc.id },
      data: { status: 'CANCELADA', canceladaEm: new Date(), motivoCancelamento: motivoLimpo },
    });
    // Cancelamento no Sistema Nacional segue MANUAL (mesma lei do S6 — nunca
    // automatizado no F1a); aqui fica o estado + rastro, a tela instrui o portal.
    return this.serializeDocumento(updated, {
      aviso: 'Nota marcada como cancelada no HBX. Confirme o cancelamento também no portal gov.br/nfse (evento de cancelamento).',
    });
  }

  // -------------------------------------------------------------------------
  // LISTAGEM / DOWNLOAD
  // -------------------------------------------------------------------------

  async listarDocumentos(companyId: number, opts: { status?: string; competencia?: string; limite?: number } = {}) {
    const where: Record<string, unknown> = { companyId };
    if (opts.status) where.status = String(opts.status);
    if (opts.competencia) where.competencia = String(opts.competencia);
    const rows = await (this.prisma as any).fiscalDocumento.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(200, Math.trunc(opts.limite || 50))),
    });
    return rows.map((r: any) => this.serializeDocumento(r));
  }

  async getDocumento(companyId: number, id: string) {
    const doc = await (this.prisma as any).fiscalDocumento.findFirst({ where: { id, companyId } });
    if (!doc) throw new NotFoundException('Documento não encontrado.');
    return doc;
  }

  /** XML autorizado decomprimido (download). */
  async getXml(companyId: number, id: string): Promise<{ filename: string; xml: string }> {
    const doc = await this.getDocumento(companyId, id);
    if (!doc.xmlGzB64) throw new NotFoundException('Documento ainda não tem XML autorizado.');
    const { gunzipSync } = await import('zlib');
    const xml = gunzipSync(Buffer.from(String(doc.xmlGzB64), 'base64')).toString('utf8');
    return { filename: `nfse-${doc.serie || 's'}-${doc.numero || doc.id}.xml`, xml };
  }

  // -------------------------------------------------------------------------
  // RECONCILIAÇÃO PÓS-TIMEOUT (F1b, A3-completo) — timeout não prova falha:
  // a consulta por chave da DPS pergunta À SEFIN se a nota existe, tirando a
  // dúvida ANTES de o tenant emitir duplicata.
  // -------------------------------------------------------------------------

  async conferirNaSefin(companyId: number, userId: number | null, documentoId: string) {
    const doc = await (this.prisma as any).fiscalDocumento.findFirst({ where: { id: documentoId, companyId } });
    if (!doc) throw new NotFoundException('Documento não encontrado.');
    if (doc.status !== 'ERRO') {
      throw new BadRequestException('Conferência na Sefin é para documento em ERRO (dúvida pós-timeout).');
    }
    if (doc.emissorRota !== 'NACIONAL_DIRETO') {
      throw new BadRequestException('Conferência direta na Sefin só vale para a rota nacional.');
    }
    if (!doc.numero) throw new BadRequestException('Documento sem número de DPS reservado.');

    const perfil = await this.profile.getOrCreatePerfil(companyId);
    const cnpj = String(doc.prestadorCnpj || perfil.cnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14 || !perfil.municipioIbge) {
      throw new BadRequestException('Perfil fiscal sem CNPJ/município — complete antes de consultar.');
    }
    // A chave da DPS mistura o CNPJ do SNAPSHOT com o município ATUAL do perfil
    // (o doc não guarda IBGE). Se o perfil trocou de CNPJ depois do timeout, a
    // chave sai errada e um 404 falso viraria "reemitir é seguro" — convite à
    // duplicata. Divergiu → conferência manual no portal, nunca resposta errada.
    const cnpjPerfilAtual = String(perfil.cnpj || '').replace(/\D/g, '');
    if (doc.prestadorCnpj && cnpjPerfilAtual && cnpjPerfilAtual !== cnpj) {
      throw new BadRequestException(
        'O CNPJ do perfil mudou depois desta emissão — confira esta nota direto no portal gov.br/nfse.',
      );
    }
    const cert = await this.profile.getSigningMaterial(companyId);
    const ambiente = (doc.ambiente === 'producao' ? 'producao' : 'restrita') as NfseAmbiente;
    const chaveDps = NfseNationalClient.chaveDps({
      municipioIbge: perfil.municipioIbge,
      documento: cnpj,
      serie: doc.serie || perfil.serieDps,
      numero: doc.numero,
    });

    const consulta = await this.client.consultarDps({ ambiente, chaveDps }, cert);
    await this.trilha.registrar({
      sistema: 'NFSE',
      operacao: 'CONSULTAR_DPS_TENANT',
      requestResumo: `company=${companyId} doc=${doc.id} chaveDps=${chaveDps} ambiente=${ambiente}`,
      httpStatus: consulta.httpStatus || null,
      sucesso: consulta.encontrada || consulta.httpStatus === 404,
      resultRef: consulta.chaveAcesso,
      aprovadoPor: userId != null ? String(userId) : null,
    });

    if (consulta.encontrada && consulta.chaveAcesso) {
      // A nota EXISTE — o timeout era só a resposta que não chegou. Recupera o
      // XML best-effort (a chave já resolve a dúvida mesmo sem ele).
      let xmlGzB64: string | null = null;
      try {
        const nfse = await this.client.consultarNfse({ ambiente, chaveAcesso: consulta.chaveAcesso }, cert);
        xmlGzB64 = nfse.xmlGzB64;
      } catch (err) {
        this.logger.warn(`[fiscal] XML da nota recuperada não veio (company ${companyId}, doc ${doc.id}): ${String((err as Error)?.message || err).slice(0, 120)}`);
      }
      const updated = await (this.prisma as any).fiscalDocumento.update({
        where: { id: doc.id },
        data: {
          status: 'AUTORIZADA',
          chaveAcesso: consulta.chaveAcesso,
          ...(xmlGzB64 ? { xmlGzB64 } : {}),
          emitidaEm: new Date(),
          erroMsg: null,
        },
      });
      // A emissão comprovadamente FUNCIONOU: o erro que armou o disjuntor era
      // falso alarme. Zera e desarma — a conferência já é gesto consciente do admin.
      await (this.prisma as any).fiscalTenantProfile.update({
        where: { companyId },
        data: { errosConsecutivos: 0, disjuntorPausado: false },
      });
      this.dispararEnvioAutomatico(companyId, doc.id, userId);
      return this.serializeDocumento(updated, {
        sefinTemNota: true,
        aviso: 'A Sefin confirmou: a nota FOI autorizada (o timeout era só a resposta que não chegou). Documento recuperado — NÃO reemita.',
      });
    }

    if (consulta.httpStatus === 404) {
      // Sefin respondeu: a DPS nunca virou nota. Reescreve o erro SEM a palavra
      // "timeout" — o aviso anti-duplicata sai de cena e a reemissão fica liberada.
      const quando = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const updated = await (this.prisma as any).fiscalDocumento.update({
        where: { id: doc.id },
        data: { erroMsg: `Transmissão sem resposta; Sefin conferida em ${quando} UTC: nota NÃO consta — reemitir é seguro.` },
      });
      return this.serializeDocumento(updated, {
        sefinTemNota: false,
        aviso: 'A Sefin confirmou: a nota NÃO existe lá. Pode reemitir com segurança.',
      });
    }

    return this.serializeDocumento(doc, {
      sefinTemNota: null,
      aviso: `A Sefin não respondeu a consulta agora (${consulta.erro || `HTTP ${consulta.httpStatus}`}). Tente de novo em instantes.`,
    });
  }

  // -------------------------------------------------------------------------
  // MIOLO — transmissão com disjuntor
  // -------------------------------------------------------------------------

  private async transmitir(companyId: number, userId: number | null, documentoId: string) {
    const perfil = await (this.prisma as any).fiscalTenantProfile.findUnique({ where: { companyId } });
    const doc = await (this.prisma as any).fiscalDocumento.findFirst({ where: { id: documentoId, companyId } });
    const servico = doc.servicoId
      ? await (this.prisma as any).fiscalServicoCatalogo.findFirst({ where: { id: doc.servicoId, companyId } })
      : null;
    if (!servico) throw new BadRequestException('Serviço do documento não existe mais no catálogo.');

    const ambiente = (perfil.ambiente === 'producao' ? 'producao' : 'restrita') as NfseAmbiente;
    const dps: DpsInput = {
      serie: doc.serie || perfil.serieDps,
      numero: doc.numero,
      competencia: doc.competencia,
      ambiente,
      prestador: {
        cnpj: perfil.cnpj,
        razaoSocial: perfil.razaoSocial,
        inscricaoMunicipal: perfil.inscricaoMunicipal || null,
        codigoMunicipio: perfil.municipioIbge,
        regimeTributario: String(perfil.regimeCrt || 1),
      },
      tomador: { documento: doc.tomadorDoc, nome: doc.tomadorNome },
      servico: {
        descricao: doc.descricao || servico.descricao,
        valorCents: doc.valorCents,
        codigoTributacaoNacional: servico.codigoTributacaoNacional,
        cnae: servico.cnae,
        codigoMunicipio: perfil.municipioIbge,
        aliquotaIss: servico.aliquotaIss ?? null,
      },
    };

    const cert = await this.profile.getSigningMaterial(companyId);
    let updated;
    try {
      const { result, xmlAssinado } = await this.client.emitir(dps, cert);
      await this.trilha.registrar({
        sistema: 'NFSE',
        operacao: 'EMITIR_DPS_TENANT',
        requestResumo: `company=${companyId} competencia=${doc.competencia} serie=${dps.serie} nDPS=${dps.numero} valor=R$${(doc.valorCents / 100).toFixed(2)} ambiente=${ambiente}`,
        httpStatus: result.httpStatus,
        sucesso: result.ok,
        resultRef: result.chaveAcesso || null,
        aprovadoPor: userId != null ? String(userId) : null,
      });

      if (result.ok) {
        updated = await (this.prisma as any).fiscalDocumento.update({
          where: { id: doc.id },
          data: {
            status: 'AUTORIZADA',
            chaveAcesso: result.chaveAcesso || null,
            // Guarda o XML de RETORNO quando a Sefin devolve; senão o assinado (auditoria).
            xmlGzB64: result.xmlRetornoGzB64 || gzipSync(Buffer.from(xmlAssinado, 'utf8')).toString('base64'),
            emitidaEm: new Date(),
            tentativas: doc.tentativas + 1,
            erroMsg: null,
          },
        });
        await (this.prisma as any).fiscalTenantProfile.update({ where: { companyId }, data: { errosConsecutivos: 0 } });
        // F1b: envio automático do PDF+XML ao tomador (opt-in do perfil).
        // Fire-and-forget de propósito: SMTP lento não pode segurar a resposta
        // da emissão além do teto do proxy — o resultado fica na trilha envio*.
        this.dispararEnvioAutomatico(companyId, doc.id, userId);
        return this.serializeDocumento(updated);
      }

      updated = await this.registrarErro(companyId, doc, result.erro || `HTTP ${result.httpStatus}`, result.httpStatus === 400 ? 'REJEITADA' : 'ERRO');
      return this.serializeDocumento(updated);
    } catch (err) {
      const msg = String((err as Error)?.message || err).slice(0, 300);
      await this.trilha.registrar({
        sistema: 'NFSE',
        operacao: 'EMITIR_DPS_TENANT',
        requestResumo: `company=${companyId} serie=${dps.serie} nDPS=${dps.numero} — exceção de transporte/montagem`,
        sucesso: false,
        aprovadoPor: userId != null ? String(userId) : null,
      });
      updated = await this.registrarErro(companyId, doc, msg, 'ERRO');
      return this.serializeDocumento(updated);
    }
  }

  private async registrarErro(companyId: number, doc: any, erroMsg: string, status: 'ERRO' | 'REJEITADA') {
    const updated = await (this.prisma as any).fiscalDocumento.update({
      where: { id: doc.id },
      data: { status, erroMsg: String(erroMsg).slice(0, 500), tentativas: doc.tentativas + 1 },
    });
    const perfil = await (this.prisma as any).fiscalTenantProfile.update({
      where: { companyId },
      data: { errosConsecutivos: { increment: 1 } },
    });
    if (perfil.errosConsecutivos >= DISJUNTOR_LIMITE && !perfil.disjuntorPausado) {
      await (this.prisma as any).fiscalTenantProfile.update({ where: { companyId }, data: { disjuntorPausado: true } });
      this.logger.warn(`[fiscal] DISJUNTOR: emissão pausada para company ${companyId} após ${perfil.errosConsecutivos} erros consecutivos.`);
    }
    return updated;
  }

  /** Envio automático F1b — nunca derruba o fluxo fiscal; falha vira log + trilha envio* no doc. */
  private dispararEnvioAutomatico(companyId: number, documentoId: string, userId: number | null): void {
    if (!this.envio) return;
    void this.envio.enviarAutomatico(companyId, documentoId, userId).catch((err) => {
      this.logger.warn(`[fiscal] envio automático falhou (company ${companyId}, doc ${documentoId}): ${String((err as Error)?.message || err).slice(0, 160)}`);
    });
  }

  /** Reserva de numeração ATÔMICA (increment do Prisma — sem corrida). */
  private async reservarNumero(companyId: number): Promise<number> {
    const p = await (this.prisma as any).fiscalTenantProfile.update({
      where: { companyId },
      data: { proximoNumeroDps: { increment: 1 } },
    });
    return p.proximoNumeroDps - 1;
  }

  /**
   * Perfil pronto = dados + cert válido + município na allowlist + disjuntor
   * armado. Producao exige município HOMOLOGADO; restrita aceita EM_VALIDACAO
   * (é exatamente como uma cidade nova VIRA homologada).
   */
  private async validarPerfilProntoParaEmitir(companyId: number) {
    const perfil = await this.profile.getOrCreatePerfil(companyId);
    if (!perfil.escopoServico) throw new BadRequestException('Emissão de nota de serviço está desligada no perfil fiscal da empresa.');
    if (!perfil.cnpj || !perfil.razaoSocial || !perfil.municipioIbge) {
      throw new BadRequestException('Complete o perfil fiscal (CNPJ, razão social e município) antes de emitir.');
    }
    if (!perfil.certA1Encrypted) throw new BadRequestException('Suba o certificado A1 no cofre fiscal antes de emitir.');
    if (perfil.certA1ExpiresAt && new Date(perfil.certA1ExpiresAt).getTime() <= Date.now()) {
      throw new BadRequestException('Certificado A1 expirado — renove antes de emitir.');
    }
    if (perfil.disjuntorPausado) {
      throw new BadRequestException('Emissão pausada pelo disjuntor (3 erros seguidos). Revise o último erro e rearme na tela fiscal.');
    }
    const municipio = await (this.prisma as any).fiscalMunicipio.findUnique({ where: { ibge: perfil.municipioIbge } });
    if (!municipio || municipio.status === 'BLOQUEADO') {
      throw new BadRequestException('Município ainda não liberado para emissão pelo HBX — fale com o suporte para homologar sua cidade.');
    }
    if (perfil.ambiente === 'producao' && municipio.status !== 'HOMOLOGADO') {
      throw new BadRequestException('Município em validação: produção só depois da homologação (teste em produção-restrita já funciona).');
    }
    if (municipio.rotaNfse === 'PROVEDOR') {
      // Tomada da F2b — stub honesto (adapter do provedor ainda não contratado).
      throw new BadRequestException('Cidade roteada para o provedor pago, que ainda não está contratado (PROVEDOR_NAO_CONTRATADO).');
    }
    return { perfil, municipio };
  }

  /** Competência no fuso do BRASIL (America/Sao_Paulo) — teste verde em UTC não vale. */
  private competenciaAtual(now = new Date()): string {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' });
    const parts = fmt.formatToParts(now);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    return `${y}-${m}`;
  }

  private serializeDocumento(d: any, extra: Record<string, unknown> = {}) {
    // A3 (revisão adversarial): timeout NÃO prova falha — a Sefin pode ter
    // autorizado sem a resposta chegar. Avisar ANTES que o tenant emita duplicata.
    const timeoutSuspeito =
      ['ERRO', 'REJEITADA'].includes(d.status) && /timeout/i.test(String(d.erroMsg || ''));
    if (timeoutSuspeito && extra.aviso == null) {
      extra = {
        ...extra,
        aviso:
          'A transmissão não respondeu a tempo — a nota PODE ter sido emitida mesmo assim. Use "Conferir na Sefin" antes de emitir outra.',
      };
    }
    return {
      id: d.id,
      tipo: d.tipo,
      origem: d.origem,
      status: d.status,
      tomadorDoc: d.tomadorDoc,
      tomadorNome: d.tomadorNome,
      tomadorEmail: d.tomadorEmail,
      tomadorFone: d.tomadorFone || null,
      envioEmailEm: d.envioEmailEm || null,
      envioEmailErro: d.envioEmailErro || null,
      envioWhatsEm: d.envioWhatsEm || null,
      envioWhatsErro: d.envioWhatsErro || null,
      descricao: d.descricao,
      valorCents: d.valorCents,
      competencia: d.competencia,
      ambiente: d.ambiente,
      serie: d.serie,
      numero: d.numero,
      chaveAcesso: d.chaveAcesso || null,
      erroMsg: d.erroMsg || null,
      tentativas: d.tentativas,
      emitidaEm: d.emitidaEm || null,
      canceladaEm: d.canceladaEm || null,
      motivoCancelamento: d.motivoCancelamento || null,
      createdAt: d.createdAt,
      temXml: Boolean(d.xmlGzB64),
      ...extra,
    };
  }
}
