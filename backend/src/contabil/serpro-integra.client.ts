import { Injectable, Logger } from '@nestjs/common';

// ===========================================================================
// CONTABIL S7 — Cliente do Serpro Integra Contador (autopost PGDAS-D + DAS).
// ---------------------------------------------------------------------------
// Responsável por: (1) OAuth2 client_credentials com a credencial do cofre
// (consumer key/secret Serpro) → bearer token; (2) as 4 operações do catálogo
// PGDAS-D: declarar a mensal, gerar o DAS (PDF base64), consultar a declaração
// e o extrato do DAS. O Integra Contador opera por PROCURAÇÃO (a própria empresa
// autoriza a si mesma) — não há terceiro/contador no meio.
//
// ⚠️ FLAG + AMBIENTE (Lei do Contabil nº5 — deploy inerte por design):
//   HBX_CONTABIL_SERPRO_ENABLED (default OFF) — sem ela, NADA chama a rede.
//   HBX_CONTABIL_SERPRO_ENV = demo | producao (default demo). O Serpro tem
//   ambiente de DEMONSTRAÇÃO — a validação LIVE roda LÁ antes de produção.
//   A CHAMADA HTTP REAL só existe pelo transporte injetado (RealSerproTransport);
//   em TESTE o transporte é MOCKADO — a suíte exercita a MONTAGEM do payload
//   OAuth/PGDAS-D e o parse das respostas, NUNCA a rede.
//
// ⚠️ SEGREDO (Lei do Contabil nº3): a credencial (key/secret) só é decriptada em
// memória no momento da chamada; NUNCA vai pra log, response ou trilha. O token
// bearer também é volátil (cache curto em memória, nunca persistido).
//
// ⚠️ Lei nº1 (copiloto, não piloto): este cliente é só o TRANSPORTE. Quem decide
// TRANSMITIR (declarar/gerar DAS) é o wizard, sob clique-com-confirmação do dono.
// `declararPgdasd`/`gerarDas` MUDAM estado no governo → só o wizard as chama, com
// aprovadoPor = userId. `consultarDeclaracao`/`consultarExtratoDas` são LEITURA
// (idempotentes) — essas SIM podem ser re-tentadas (conferência automática).
// ===========================================================================

export type SerproAmbiente = 'demo' | 'producao';

export const SERPRO_ENABLED_ENV = 'HBX_CONTABIL_SERPRO_ENABLED';
export const SERPRO_ENV_ENV = 'HBX_CONTABIL_SERPRO_ENV';

// Bases oficiais. A produção usa gateway com mTLS (cert do cofre, S6) + OAuth;
// o demo/trial é HTTP OAuth simples (o gateway de demonstração do Serpro). As
// URLs exatas do gateway são confirmadas no ROTEIRO DE VALIDAÇÃO LIVE (gate do
// dono) — aqui ficam as documentadas, atrás da flag OFF (nada bate nelas hoje).
const BASE_URL_DEMO = 'https://gateway.apiserpro.serpro.gov.br/integra-contador-trial/v1';
const BASE_URL_PRODUCAO = 'https://gateway.apiserpro.serpro.gov.br/integra-contador/v1';
const TOKEN_URL_DEMO = 'https://gateway.apiserpro.serpro.gov.br/token';
const TOKEN_URL_PRODUCAO = 'https://gateway.apiserpro.serpro.gov.br/token';

/** Custo estimado por chamada (tier 1, ref. 02/07/2026) — só p/ exibição no ARMAR. */
export const CUSTO_DECLARAR_PGDASD_CENTS = 40; // ~R$ 0,40
export const CUSTO_GERAR_DAS_CENTS = 32; // ~R$ 0,32
export const CUSTO_CONSULTA_CENTS = 0; // consultas do ciclo (leitura) — desprezível/incluso

/** A credencial que sai do cofre (decriptada só em memória no uso). */
export interface SerproCredential {
  consumerKey: string;
  consumerSecret: string;
  /** CNPJ do contratante/autor do pedido (a própria empresa — procuração de si). */
  contratanteCnpj: string;
  /** CNPJ do contribuinte declarado (== contratante no caso 1-sócio). */
  contribuinteCnpj: string;
}

/** Payload determinístico do PGDAS-D — vem 100% do motor (Lei nº2), nunca recalculado aqui. */
export interface PgdasdPayload {
  competencia: string; // 'YYYY-MM'
  /** Período de apuração no formato do Serpro ('AAAAMM'). */
  periodoApuracao: string; // 'AAAAMM'
  receitaBrutaMesCents: number;
  rbt12Cents: number;
  folha12mCents: number;
  anexoAplicado: string; // 'III' | 'V'
  aliquotaEfetiva: number; // fração 0..1
  dasPrevistoCents: number; // o DAS que o MOTOR calculou (base da conferência)
}

export interface SerproRequestResult {
  httpStatus: number;
  ok: boolean;
  body?: any; // JSON parseado da resposta (SEM segredo — só dado fiscal público)
  erro?: string | null;
}

export interface DeclararPgdasdResult {
  ok: boolean;
  httpStatus: number;
  numeroRecibo?: string | null; // nº do recibo de entrega da declaração
  numeroDeclaracao?: string | null;
  dasApuradoCents?: number | null; // DAS que o GOVERNO apurou (base da conferência)
  erro?: string | null;
}

export interface GerarDasResult {
  ok: boolean;
  httpStatus: number;
  pdfBase64?: string | null; // guia DAS em PDF (base64)
  numeroDocumento?: string | null; // nº do documento de arrecadação
  valorTotalCents?: number | null;
  dataVencimento?: string | null;
  erro?: string | null;
}

export interface ConsultarDeclaracaoResult {
  ok: boolean;
  httpStatus: number;
  encontrada: boolean;
  numeroRecibo?: string | null;
  receitaBrutaCents?: number | null; // receita que consta gravada no governo
  dasApuradoCents?: number | null; // DAS apurado que consta gravado no governo
  erro?: string | null;
}

/**
 * Transporte HTTP (OAuth + POST/GET no gateway). Injetável p/ mockar em teste —
 * NENHUMA rede real na suíte. Recebe SEMPRE a credencial decriptada (nunca a
 * persistimos aqui).
 */
export interface SerproTransport {
  /** OAuth2 client_credentials → { accessToken, expiresInSec }. */
  obterToken(input: { tokenUrl: string; consumerKey: string; consumerSecret: string }): Promise<{
    httpStatus: number;
    accessToken: string | null;
    expiresInSec: number;
    erro?: string | null;
  }>;
  /** POST/GET numa operação do Integra Contador (bearer + body JSON). */
  chamar(input: {
    baseUrl: string;
    path: string;
    method: 'POST' | 'GET';
    accessToken: string;
    bodyJson?: string | null;
  }): Promise<SerproRequestResult>;
}

@Injectable()
export class SerproIntegraClient {
  private readonly logger = new Logger(SerproIntegraClient.name);

  // Cache curto do token em memória (nunca persistido). Renovado ao expirar.
  private tokenCache: { token: string; expiraEmMs: number } | null = null;

  // Transporte default = HTTP real (só EXERCIDO com a flag ON — ver wizard/service).
  constructor(private readonly transport: SerproTransport = new RealSerproTransport()) {}

  static isEnabled(): boolean {
    const v = String(process.env[SERPRO_ENABLED_ENV] || '0').trim().toLowerCase();
    return v === '1' || v === 'true';
  }

  static ambiente(): SerproAmbiente {
    const v = String(process.env[SERPRO_ENV_ENV] || 'demo').trim().toLowerCase();
    return v === 'producao' ? 'producao' : 'demo';
  }

  static baseUrl(ambiente: SerproAmbiente): string {
    return ambiente === 'producao' ? BASE_URL_PRODUCAO : BASE_URL_DEMO;
  }

  static tokenUrl(ambiente: SerproAmbiente): string {
    return ambiente === 'producao' ? TOKEN_URL_PRODUCAO : TOKEN_URL_DEMO;
  }

  // -------------------------------------------------------------------------
  // OAuth2 — token bearer (cache curto em memória; nunca persistido).
  // -------------------------------------------------------------------------

  /**
   * Garante um bearer token válido: usa o cache enquanto não expirou (com 60s de
   * margem), senão pede um novo via client_credentials. A credencial NUNCA é
   * logada. Lança em falha de autenticação (o wizard trata como fallback).
   */
  private async garantirToken(cred: SerproCredential, ambiente: SerproAmbiente): Promise<string> {
    const agora = Date.now();
    if (this.tokenCache && this.tokenCache.expiraEmMs - 60_000 > agora) {
      return this.tokenCache.token;
    }
    const tokenUrl = SerproIntegraClient.tokenUrl(ambiente);
    const res = await this.transport.obterToken({
      tokenUrl,
      consumerKey: cred.consumerKey,
      consumerSecret: cred.consumerSecret,
    });
    if (!res.accessToken) {
      throw new Error(`OAuth Serpro falhou (HTTP ${res.httpStatus}${res.erro ? `: ${res.erro}` : ''})`);
    }
    const ttlMs = Math.max(30_000, Math.trunc((res.expiresInSec || 3600) * 1000));
    this.tokenCache = { token: res.accessToken, expiraEmMs: agora + ttlMs };
    return res.accessToken;
  }

  /** Zera o cache do token (usado ao trocar credencial ou em teste). */
  resetTokenCache(): void {
    this.tokenCache = null;
  }

  /**
   * Envelope-padrão do Integra Contador: todo pedido carrega o contratante,
   * o autor-do-pedido (a própria empresa — procuração de si) e o contribuinte,
   * mais o `pedidoDados` da operação. Montado aqui de forma determinística.
   * SEM segredo — só CNPJs (dado público) e os números do motor.
   */
  private montarEnvelope(cred: SerproCredential, idSistema: string, idServico: string, dados: unknown): string {
    return JSON.stringify({
      contratante: { numero: this.digits(cred.contratanteCnpj), tipo: 2 },
      autorPedidoDados: { numero: this.digits(cred.contratanteCnpj), tipo: 2 },
      contribuinte: { numero: this.digits(cred.contribuinteCnpj), tipo: 2 },
      pedidoDados: {
        idSistema,
        idServico,
        versaoSistema: '1.0',
        dados: JSON.stringify(dados),
      },
    });
  }

  // -------------------------------------------------------------------------
  // 1) DECLARAR PGDAS-D — TRANSMISSÃO (só o wizard chama, sob clique do dono).
  // -------------------------------------------------------------------------

  /**
   * Entrega a declaração mensal do PGDAS-D. O payload vem do MOTOR (Lei nº2) —
   * este método só empacota e transmite. Retorna o recibo + o DAS que o GOVERNO
   * apurou (base da conferência do wizard). NUNCA é chamado por cron/retry: é
   * transmissão, e transmissão exige o clique-com-confirmação do dono (Lei nº1).
   */
  async declararPgdasd(cred: SerproCredential, payload: PgdasdPayload): Promise<DeclararPgdasdResult> {
    const ambiente = SerproIntegraClient.ambiente();
    const token = await this.garantirToken(cred, ambiente);
    const dados = {
      // Campos-chave do PGDAS-D (declaração da apuração do PA). Valores em REAIS
      // com 2 casas (layout do Serpro) — a fonte é sempre o motor.
      cnpjCompleto: this.digits(cred.contribuinteCnpj),
      pa: payload.periodoApuracao, // 'AAAAMM'
      indicadorTransmissao: true,
      indicadorComparacao: true,
      receitaPaCompetenciaInterna: this.reais(payload.receitaBrutaMesCents),
      receitaBrutaAnterior12: this.reais(payload.rbt12Cents),
      folhaSalarial12: this.reais(payload.folha12mCents),
      anexo: payload.anexoAplicado,
      aliquotaEfetiva: Number((payload.aliquotaEfetiva * 100).toFixed(4)),
    };
    const bodyJson = this.montarEnvelope(cred, 'PGDASD', 'TRANSDECLARACAO11', dados);
    const res = await this.transport.chamar({
      baseUrl: SerproIntegraClient.baseUrl(ambiente),
      path: '/Declarar',
      method: 'POST',
      accessToken: token,
      bodyJson,
    });
    if (!res.ok) {
      return { ok: false, httpStatus: res.httpStatus, erro: res.erro || `HTTP ${res.httpStatus}` };
    }
    const parsed = this.extrairDados(res.body);
    return {
      ok: true,
      httpStatus: res.httpStatus,
      numeroRecibo: this.str(parsed?.numeroReciboDeclaracao ?? parsed?.numeroRecibo ?? res.body?.numeroRecibo),
      numeroDeclaracao: this.str(parsed?.numeroDeclaracao),
      dasApuradoCents: this.centsFromReais(parsed?.valorTotalDevido ?? parsed?.valorDevido ?? parsed?.dasApurado),
    };
  }

  // -------------------------------------------------------------------------
  // 2) GERAR DAS — TRANSMISSÃO (só o wizard chama, sob clique do dono).
  // -------------------------------------------------------------------------

  /**
   * Gera a guia DAS da competência em PDF (base64). Requer a declaração já
   * entregue. Retorna o PDF + nº do documento + valor + vencimento. Como
   * `declararPgdasd`, é ação de estado — só o wizard, sob clique do dono.
   */
  async gerarDas(cred: SerproCredential, competencia: string): Promise<GerarDasResult> {
    const ambiente = SerproIntegraClient.ambiente();
    const token = await this.garantirToken(cred, ambiente);
    const pa = this.periodoApuracao(competencia);
    const dados = { periodoApuracao: pa };
    const bodyJson = this.montarEnvelope(cred, 'PGDASD', 'GERARDAS12', dados);
    const res = await this.transport.chamar({
      baseUrl: SerproIntegraClient.baseUrl(ambiente),
      path: '/Emitir',
      method: 'POST',
      accessToken: token,
      bodyJson,
    });
    if (!res.ok) {
      return { ok: false, httpStatus: res.httpStatus, erro: res.erro || `HTTP ${res.httpStatus}` };
    }
    const parsed = this.extrairDados(res.body);
    const pdf = this.str(parsed?.pdf ?? parsed?.docArrecadacaoPdfB64 ?? res.body?.pdf);
    return {
      ok: Boolean(pdf),
      httpStatus: res.httpStatus,
      pdfBase64: pdf,
      numeroDocumento: this.str(parsed?.numeroDocumento),
      valorTotalCents: this.centsFromReais(parsed?.valorTotalDocumento ?? parsed?.valorTotal),
      dataVencimento: this.str(parsed?.dataVencimento),
      erro: pdf ? null : 'DAS sem PDF na resposta',
    };
  }

  // -------------------------------------------------------------------------
  // 3) CONSULTAR DECLARAÇÃO — LEITURA (idempotente; retry permitido).
  // -------------------------------------------------------------------------

  /**
   * Consulta a última declaração entregue da competência (conferência do wizard:
   * o que o governo GRAVOU bate com o que enviamos?). Leitura pura — pode ser
   * re-tentada à vontade. `encontrada=false` = ainda não consta (não é erro).
   */
  async consultarDeclaracao(cred: SerproCredential, competencia: string): Promise<ConsultarDeclaracaoResult> {
    const ambiente = SerproIntegraClient.ambiente();
    const token = await this.garantirToken(cred, ambiente);
    const pa = this.periodoApuracao(competencia);
    const dados = { periodoApuracao: pa };
    const bodyJson = this.montarEnvelope(cred, 'PGDASD', 'CONSDECLARACAO13', dados);
    const res = await this.transport.chamar({
      baseUrl: SerproIntegraClient.baseUrl(ambiente),
      path: '/Consultar',
      method: 'POST',
      accessToken: token,
      bodyJson,
    });
    if (!res.ok) {
      return { ok: false, httpStatus: res.httpStatus, encontrada: false, erro: res.erro || `HTTP ${res.httpStatus}` };
    }
    const parsed = this.extrairDados(res.body);
    const recibo = this.str(parsed?.numeroReciboDeclaracao ?? parsed?.numeroRecibo);
    return {
      ok: true,
      httpStatus: res.httpStatus,
      encontrada: Boolean(recibo),
      numeroRecibo: recibo,
      receitaBrutaCents: this.centsFromReais(parsed?.receitaPaCompetenciaInterna ?? parsed?.receitaBruta),
      dasApuradoCents: this.centsFromReais(parsed?.valorTotalDevido ?? parsed?.valorDevido ?? parsed?.dasApurado),
    };
  }

  // -------------------------------------------------------------------------
  // 4) CONSULTAR EXTRATO DO DAS — LEITURA (idempotente; retry permitido).
  // -------------------------------------------------------------------------

  /** Extrato do DAS da competência (situação de pagamento). Leitura pura. */
  async consultarExtratoDas(cred: SerproCredential, competencia: string): Promise<SerproRequestResult> {
    const ambiente = SerproIntegraClient.ambiente();
    const token = await this.garantirToken(cred, ambiente);
    const pa = this.periodoApuracao(competencia);
    const dados = { periodoApuracao: pa };
    const bodyJson = this.montarEnvelope(cred, 'PGDASD', 'CONSEXTRATO16', dados);
    return this.transport.chamar({
      baseUrl: SerproIntegraClient.baseUrl(ambiente),
      path: '/Consultar',
      method: 'POST',
      accessToken: token,
      bodyJson,
    });
  }

  // -------------------------------------------------------------------------
  // Helpers determinísticos.
  // -------------------------------------------------------------------------

  /** 'YYYY-MM' → 'AAAAMM' (período de apuração do Serpro). */
  periodoApuracao(competencia: string): string {
    const m = /^(\d{4})-(\d{2})$/.exec(String(competencia || ''));
    if (!m) throw new Error(`competência inválida: '${competencia}' (esperado 'YYYY-MM')`);
    return `${m[1]}${m[2]}`;
  }

  /** O `pedidoDados.dados` do Serpro vem como STRING JSON — desembrulha 1 nível. */
  private extrairDados(body: any): any {
    if (!body) return null;
    // Resposta típica: { dados: '<json string>', ... }.
    const bruto = body?.dados ?? body?.retorno ?? body;
    if (typeof bruto === 'string') {
      try {
        return JSON.parse(bruto);
      } catch {
        return null;
      }
    }
    return bruto ?? null;
  }

  private reais(cents: number): number {
    return Math.max(0, Math.trunc(Number(cents) || 0)) / 100;
  }

  /**
   * Reais → cents. O Serpro devolve valores como número JSON ou string numérica
   * com PONTO decimal ('300.00' = trezentos reais) — convenção de API, não a
   * máscara BR (não há separador de milhar nessas respostas). Se aparecer vírgula
   * decimal ('300,00'), aceitamos também. Nunca tratamos '.' como milhar aqui.
   */
  private centsFromReais(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    let n: number;
    if (typeof v === 'string') {
      const s = v.trim();
      // Vírgula decimal (formato BR) → troca por ponto; senão o ponto já é decimal.
      n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
    } else {
      n = Number(v);
    }
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
  }

  private digits(v: string): string {
    return String(v || '').replace(/\D/g, '');
  }

  private str(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s ? s : null;
  }
}

// ===========================================================================
// Transporte REAL (OAuth + POST/GET no gateway Serpro). NUNCA é exercido em
// teste (a suíte injeta um transporte fake). Só roda quando a flag está ON e o
// wizard chama. Usa `https` nativo — sem novo npm dep. Em produção o gateway
// exige mTLS (cert do cofre S6) além do bearer; aqui deixamos o esqueleto do
// bearer (o mTLS entra na validação LIVE, gate do dono).
// ===========================================================================
export class RealSerproTransport implements SerproTransport {
  async obterToken(input: { tokenUrl: string; consumerKey: string; consumerSecret: string }): Promise<{
    httpStatus: number;
    accessToken: string | null;
    expiresInSec: number;
    erro?: string | null;
  }> {
    const https = await import('https');
    const url = new URL(input.tokenUrl);
    const basic = Buffer.from(`${input.consumerKey}:${input.consumerSecret}`).toString('base64');
    const body = 'grant_type=client_credentials';
    return new Promise((resolve) => {
      const req = https.request(
        {
          method: 'POST',
          hostname: url.hostname,
          path: url.pathname + url.search,
          port: url.port || 443,
          headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: 30_000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c as Buffer));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            const status = res.statusCode || 0;
            let accessToken: string | null = null;
            let expiresInSec = 3600;
            try {
              const parsed = JSON.parse(raw);
              accessToken = parsed?.access_token ?? null;
              expiresInSec = Number(parsed?.expires_in) || 3600;
            } catch {
              /* corpo não-JSON: token fica null */
            }
            resolve({
              httpStatus: status,
              accessToken: status >= 200 && status < 300 ? accessToken : null,
              expiresInSec,
              erro: status >= 200 && status < 300 ? null : `HTTP ${status}`,
            });
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (err) => resolve({ httpStatus: 0, accessToken: null, expiresInSec: 0, erro: String(err?.message || err) }));
      req.end(body);
    });
  }

  async chamar(input: {
    baseUrl: string;
    path: string;
    method: 'POST' | 'GET';
    accessToken: string;
    bodyJson?: string | null;
  }): Promise<SerproRequestResult> {
    const https = await import('https');
    const url = new URL(input.path, input.baseUrl.endsWith('/') ? input.baseUrl : input.baseUrl + '/');
    const payload = input.bodyJson || '';
    return new Promise((resolve) => {
      const req = https.request(
        {
          method: input.method,
          hostname: url.hostname,
          path: url.pathname + url.search,
          port: url.port || 443,
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            'Content-Type': 'application/json',
            ...(input.method === 'POST' ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          },
          timeout: 60_000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c as Buffer));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            const status = res.statusCode || 0;
            let body: any = null;
            try {
              body = JSON.parse(raw);
            } catch {
              /* corpo não-JSON */
            }
            resolve({
              httpStatus: status,
              ok: status >= 200 && status < 300,
              body,
              erro: status >= 200 && status < 300 ? null : `HTTP ${status}`,
            });
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (err) => resolve({ httpStatus: 0, ok: false, erro: String(err?.message || err) }));
      if (input.method === 'POST') req.end(payload);
      else req.end();
    });
  }
}
