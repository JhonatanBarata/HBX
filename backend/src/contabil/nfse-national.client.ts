import { Injectable, Logger } from '@nestjs/common';
import { createHash, createSign, createVerify, X509Certificate } from 'crypto';
import { gzipSync } from 'zlib';
import type { CertSigningMaterial } from './nfse-cert.service';

// ===========================================================================
// CONTABIL S6 — Cliente da NFS-e Nacional (Sistema Nacional NFS-e / Sefin).
// ---------------------------------------------------------------------------
// Responsável por: (1) montar a DPS (Declaração de Prestação de Serviços) em XML
// a partir do FiscalProfile (prestador) + serviço "licenciamento de software"
// (CNAE 6203-1/00) + tomador (empresa cliente do HBX); (2) ASSINAR a DPS com
// XMLDSIG (enveloped, RSA-SHA256) usando o cert do cofre; (3) GZip+Base64 o XML
// assinado no payload JSON; (4) POST síncrono /nfse com mTLS.
//
// ⚠️ FLAG + AMBIENTE:
//   HBX_CONTABIL_NFSE_ENABLED (default OFF) — sem ela, a emissão nem começa.
//   HBX_CONTABIL_NFSE_ENV = restrita | producao (default restrita).
//   A CHAMADA HTTP REAL só acontece com a flag ON. Em teste, o transporte é
//   MOCKADO (injetado no construtor) — os testes exercitam MONTAGEM + ASSINATURA
//   com um cert de teste auto-assinado, NUNCA a rede.
//
// ⚠️ XMLDSIG: canonicalização C14N completa (com resolução de namespace herdado)
// é complexa. Aqui geramos NÓS o XML (forma fixa, sem namespaces default
// conflitantes, sem comentários/PI), então usamos uma canonicalização
// determinística sobre o próprio texto que produzimos — suficiente p/ a
// assinatura fechar contra o cert e ser verificável. A homologação contra o
// validador oficial do Sistema Nacional fica no ROTEIRO DE VALIDAÇÃO LIVE (gate
// do dono) — pode exigir trocar por uma lib C14N ICP-Brasil completa.
// ===========================================================================

export type NfseAmbiente = 'restrita' | 'producao';

export interface NfsePrestador {
  cnpj: string; // só dígitos
  razaoSocial: string;
  inscricaoMunicipal?: string | null;
  codigoMunicipio: string; // IBGE 7 dígitos
  regimeTributario?: string | null;
}

export interface NfseTomador {
  documento: string; // CNPJ/CPF só dígitos
  nome: string;
}

export interface NfseServico {
  descricao: string;
  valorCents: number;
  codigoTributacaoNacional: string; // ex.: '01.05' licenciamento de software
  cnae: string; // '6203100' (CNAE 6203-1/00 sem máscara)
  codigoMunicipio: string; // IBGE do local do serviço
  aliquotaIss?: number | null; // fração (0..1); default 0 (fora do escopo do dono)
}

export interface DpsInput {
  serie: string; // série da DPS
  numero: number; // nº sequencial da DPS
  competencia: string; // 'YYYY-MM' → dhEmi
  prestador: NfsePrestador;
  tomador: NfseTomador;
  servico: NfseServico;
  ambiente: NfseAmbiente;
}

export interface NfseTransportResult {
  httpStatus: number;
  ok: boolean;
  chaveAcesso?: string | null;
  xmlRetornoGzB64?: string | null;
  erro?: string | null;
}

/** Transporte HTTP (mTLS + POST). Injetável p/ mockar em teste (nenhuma rede real no teste). */
export interface NfseTransport {
  postNfse(input: {
    baseUrl: string;
    payloadJson: string;
    cert: CertSigningMaterial;
  }): Promise<NfseTransportResult>;
}

export const NFSE_ENABLED_ENV = 'HBX_CONTABIL_NFSE_ENABLED';
export const NFSE_ENV_ENV = 'HBX_CONTABIL_NFSE_ENV';

const BASE_URL_RESTRITA = 'https://sefin.producaorestrita.nfse.gov.br';
const BASE_URL_PRODUCAO = 'https://sefin.nfse.gov.br';

@Injectable()
export class NfseNationalClient {
  private readonly logger = new Logger(NfseNationalClient.name);

  // Transporte default = HTTP real (só é EXERCIDO com a flag ON — ver emissor).
  constructor(private readonly transport: NfseTransport = new RealNfseTransport()) {}

  static isEnabled(): boolean {
    const v = String(process.env[NFSE_ENABLED_ENV] || '0').trim().toLowerCase();
    return v === '1' || v === 'true';
  }

  static ambiente(): NfseAmbiente {
    const v = String(process.env[NFSE_ENV_ENV] || 'restrita').trim().toLowerCase();
    return v === 'producao' ? 'producao' : 'restrita';
  }

  static baseUrl(ambiente: NfseAmbiente): string {
    return ambiente === 'producao' ? BASE_URL_PRODUCAO : BASE_URL_RESTRITA;
  }

  // -------------------------------------------------------------------------
  // 1) MONTAGEM DA DPS (XML) — determinística.
  // -------------------------------------------------------------------------

  /**
   * Monta o XML da DPS (não assinado). Forma fixa, sem namespace default
   * conflitante. `Id` do infDPS = "DPS" + chave-síntese (usado como Reference
   * URI da assinatura). Valores em REAIS com 2 casas (o layout nacional é em reais).
   */
  montarDps(input: DpsInput): { xml: string; infId: string } {
    const p = input.prestador;
    const t = input.tomador;
    const s = input.servico;
    const dhEmi = this.dhEmiDaCompetencia(input.competencia);
    const valorReais = (Math.max(0, Math.trunc(s.valorCents)) / 100).toFixed(2);
    const infId = this.montarInfId(input);

    const xml =
      `<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">` +
      `<infDPS Id="${infId}">` +
      `<tpAmb>${input.ambiente === 'producao' ? '1' : '2'}</tpAmb>` +
      `<dhEmi>${dhEmi}</dhEmi>` +
      `<verAplic>HBX-Contabil-1.0</verAplic>` +
      `<serie>${this.esc(input.serie)}</serie>` +
      `<nDPS>${Math.max(1, Math.trunc(input.numero))}</nDPS>` +
      `<tpEmit>1</tpEmit>` +
      `<cLocEmi>${this.esc(p.codigoMunicipio)}</cLocEmi>` +
      `<prest>` +
      `<CNPJ>${this.digits(p.cnpj)}</CNPJ>` +
      (p.inscricaoMunicipal ? `<IM>${this.esc(p.inscricaoMunicipal)}</IM>` : '') +
      `<xNome>${this.esc(p.razaoSocial)}</xNome>` +
      (p.regimeTributario ? `<regTrib>${this.esc(p.regimeTributario)}</regTrib>` : '') +
      `</prest>` +
      `<toma>` +
      (this.digits(t.documento).length === 14 ? `<CNPJ>${this.digits(t.documento)}</CNPJ>` : `<CPF>${this.digits(t.documento)}</CPF>`) +
      `<xNome>${this.esc(t.nome)}</xNome>` +
      `</toma>` +
      `<serv>` +
      `<cServ>` +
      `<cTribNac>${this.esc(s.codigoTributacaoNacional)}</cTribNac>` +
      `<CNAE>${this.digits(s.cnae)}</CNAE>` +
      `<xDescServ>${this.esc(s.descricao)}</xDescServ>` +
      `<cLocIncid>${this.esc(s.codigoMunicipio)}</cLocIncid>` +
      `</cServ>` +
      `</serv>` +
      `<valores>` +
      `<vServPrest><vServ>${valorReais}</vServ></vServPrest>` +
      `<trib><tribMun><tribISSQN>1</tribISSQN><pAliq>${((s.aliquotaIss ?? 0) * 100).toFixed(2)}</pAliq></tribMun></trib>` +
      `</valores>` +
      `</infDPS>` +
      `</DPS>`;

    return { xml, infId };
  }

  // -------------------------------------------------------------------------
  // 2) ASSINATURA XMLDSIG (enveloped, RSA-SHA256).
  // -------------------------------------------------------------------------

  /**
   * Assina a DPS: calcula o DigestValue (SHA-256) do infDPS, monta o SignedInfo,
   * assina o SignedInfo (RSA-SHA256) com a chave privada do cofre e injeta o
   * elemento <Signature> ao final do <DPS>. Retorna o XML assinado.
   */
  assinarDps(xml: string, infId: string, cert: CertSigningMaterial): string {
    // Digest do elemento referenciado (infDPS). Canonicalização determinística
    // do nosso próprio XML (ver nota de cabeçalho sobre C14N).
    const infDpsXml = this.extrairElemento(xml, 'infDPS');
    if (!infDpsXml) throw new Error('infDPS não encontrado no XML da DPS');
    const digestValue = createHash('sha256').update(this.c14n(infDpsXml)).digest('base64');

    const signedInfo =
      `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
      `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
      `<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>` +
      `<Reference URI="#${infId}">` +
      `<Transforms>` +
      `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
      `<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
      `</Transforms>` +
      `<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
      `<DigestValue>${digestValue}</DigestValue>` +
      `</Reference>` +
      `</SignedInfo>`;

    const signer = createSign('RSA-SHA256');
    signer.update(this.c14n(signedInfo));
    signer.end();
    const signatureValue = signer.sign(cert.keyPem, 'base64');

    const x509b64 = this.certToBase64Der(cert.certPem);

    const signature =
      `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
      signedInfo +
      `<SignatureValue>${signatureValue}</SignatureValue>` +
      `<KeyInfo><X509Data><X509Certificate>${x509b64}</X509Certificate></X509Data></KeyInfo>` +
      `</Signature>`;

    // Enveloped: injeta a Signature ANTES do fechamento do <DPS>.
    return xml.replace('</DPS>', `${signature}</DPS>`);
  }

  /**
   * Verifica localmente a assinatura de uma DPS assinada por NÓS (usado nos
   * testes e num self-check opcional): recomputa o digest do infDPS, remonta o
   * SignedInfo e confere o SignatureValue contra a chave pública do cert.
   * Retorna true se digest e assinatura batem.
   */
  verificarAssinatura(xmlAssinado: string): boolean {
    try {
      const infDpsXml = this.extrairElemento(xmlAssinado, 'infDPS');
      const signedInfo = this.extrairElemento(xmlAssinado, 'SignedInfo');
      const signatureValue = this.extrairConteudo(xmlAssinado, 'SignatureValue');
      const digestValue = this.extrairConteudo(xmlAssinado, 'DigestValue');
      const x509b64 = this.extrairConteudo(xmlAssinado, 'X509Certificate');
      if (!infDpsXml || !signedInfo || !signatureValue || !digestValue || !x509b64) return false;

      // 1) digest do infDPS confere?
      const digestRecalc = createHash('sha256').update(this.c14n(infDpsXml)).digest('base64');
      if (digestRecalc !== digestValue) return false;

      // 2) assinatura do SignedInfo confere contra a chave pública do cert embutido?
      const certPem = this.derBase64ToPem(x509b64);
      const pubKey = new X509Certificate(certPem).publicKey;
      const verifier = createVerify('RSA-SHA256');
      verifier.update(this.c14n(this.reforcarNamespaceSignedInfo(signedInfo)));
      verifier.end();
      return verifier.verify(pubKey, Buffer.from(signatureValue, 'base64'));
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // 3+4) PAYLOAD (GZip+Base64) + POST síncrono.
  // -------------------------------------------------------------------------

  /** Empacota o XML assinado no payload JSON do endpoint /nfse (XML GZip+Base64). */
  montarPayload(xmlAssinado: string): string {
    const gz = gzipSync(Buffer.from(xmlAssinado, 'utf8')).toString('base64');
    return JSON.stringify({ dpsXmlGZipB64: gz });
  }

  /**
   * Fluxo completo de emissão: monta → assina → empacota → POST. A CHAMADA REAL
   * só ocorre pelo transporte injetado; o EMISSOR só chama isto com a flag ON.
   * Retorna o resultado do transporte (chave de acesso / erro).
   */
  async emitir(input: DpsInput, cert: CertSigningMaterial): Promise<{ result: NfseTransportResult; xmlAssinado: string }> {
    const { xml, infId } = this.montarDps(input);
    const xmlAssinado = this.assinarDps(xml, infId, cert);
    const payloadJson = this.montarPayload(xmlAssinado);
    const baseUrl = NfseNationalClient.baseUrl(input.ambiente);
    const result = await this.transport.postNfse({ baseUrl, payloadJson, cert });
    return { result, xmlAssinado };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private montarInfId(input: DpsInput): string {
    // Id determinístico e único por (prestador, série, número) — vira o Reference URI.
    const raw = `${this.digits(input.prestador.cnpj)}-${input.serie}-${input.numero}`;
    const h = createHash('sha1').update(raw).digest('hex').slice(0, 20).toUpperCase();
    return `DPS${h}`;
  }

  private dhEmiDaCompetencia(competencia: string): string {
    // dia 01 da competência, 12:00Z (determinístico p/ o teste; o layout aceita a competência).
    const m = /^(\d{4})-(\d{2})$/.exec(String(competencia || ''));
    if (!m) return new Date().toISOString();
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1, 12, 0, 0)).toISOString();
  }

  private digits(v: string): string {
    return String(v || '').replace(/\D/g, '');
  }

  private esc(v: string): string {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Canonicalização determinística: normaliza CRLF e remove espaço entre tags. */
  private c14n(xml: string): string {
    return xml.replace(/\r\n/g, '\n').replace(/>\s+</g, '><').trim();
  }

  /** SignedInfo, ao ser destacado, precisa manter o xmlns dsig p/ o C14N do verify bater. */
  private reforcarNamespaceSignedInfo(signedInfo: string): string {
    if (/<SignedInfo[^>]*xmlns=/.test(signedInfo)) return signedInfo;
    return signedInfo.replace('<SignedInfo', '<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"');
  }

  private extrairElemento(xml: string, tag: string): string | null {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}>`);
    const m = re.exec(xml);
    return m ? m[0] : null;
  }

  private extrairConteudo(xml: string, tag: string): string | null {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`);
    const m = re.exec(xml);
    return m ? m[1].trim() : null;
  }

  private certToBase64Der(certPem: string): string {
    // Base64 DER do cert = miolo do PEM sem cabeçalho/rodapé/quebras.
    return certPem
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '');
  }

  private derBase64ToPem(b64: string): string {
    const clean = String(b64 || '').replace(/\s+/g, '');
    const lines = clean.match(/.{1,64}/g)?.join('\n') ?? clean;
    return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----\n`;
  }
}

// ===========================================================================
// Transporte REAL (mTLS + POST). NUNCA é exercido em teste (o teste injeta um
// transporte fake). Só roda quando o emissor chama com a flag ON. Usa `https`
// nativo p/ poder passar cert/key do cofre (mTLS) sem novo npm dep.
// ===========================================================================
export class RealNfseTransport implements NfseTransport {
  async postNfse(input: { baseUrl: string; payloadJson: string; cert: CertSigningMaterial }): Promise<NfseTransportResult> {
    const https = await import('https');
    const url = new URL('/nfse', input.baseUrl);
    return new Promise<NfseTransportResult>((resolve) => {
      const req = https.request(
        {
          method: 'POST',
          hostname: url.hostname,
          path: url.pathname,
          port: url.port || 443,
          // mTLS: cert + key do cofre autenticam o cliente.
          cert: input.cert.certPem,
          key: input.cert.keyPem,
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(input.payloadJson) },
          timeout: 30_000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c as Buffer));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            const status = res.statusCode || 0;
            let chaveAcesso: string | null = null;
            let xmlRetornoGzB64: string | null = null;
            try {
              const parsed = JSON.parse(body);
              chaveAcesso = parsed?.chaveAcesso ?? parsed?.nfse?.chaveAcesso ?? null;
              xmlRetornoGzB64 = parsed?.nfseXmlGZipB64 ?? null;
            } catch { /* corpo não-JSON: mantém null */ }
            resolve({
              httpStatus: status,
              ok: status >= 200 && status < 300 && Boolean(chaveAcesso),
              chaveAcesso,
              xmlRetornoGzB64,
              erro: status >= 200 && status < 300 ? null : `HTTP ${status}`,
            });
          });
        },
      );
      req.on('timeout', () => { req.destroy(new Error('timeout')); });
      req.on('error', (err) => resolve({ httpStatus: 0, ok: false, erro: String(err?.message || err) }));
      req.end(input.payloadJson);
    });
  }
}
