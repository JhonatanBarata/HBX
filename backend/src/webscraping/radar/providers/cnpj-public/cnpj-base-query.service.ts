import { BadRequestException, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { LeadHarvestImportService } from '../../../lead-harvest/lead-harvest-import.service';
import { normalizePhoneDigits } from '../../shared/radar-core-shared';
import { segmentPhraseTokenGroups } from '../../shared/radar-segment-match.util';

/**
 * HOT-02 + HOT-03 (fundidos) — "Base Receita": pesquisa avançada em cima do dump local da RFB
 * (`CnpjPublicCompany`, colunas do HOT-01) + anti-contador (phoneShareCount/emailShareCount).
 *
 * Escopo estrito: LEITURA de dado já carregado localmente (nunca dispara fonte paga — não há
 * fetch de rede aqui, só SQL na base local). `materialize` reusa o caminho PÚBLICO existente
 * `LeadHarvestImportService.importBatchForUser` (dedup/gate já vivos) em vez de escrever direto
 * em RadarLeadPool/LeadContact — superfície mínima no caminho de escrita que o dono está
 * refatorando em paralelo.
 */

export type CnpjBaseContatoFilter = {
  comEmail?: boolean;
  comCelular?: boolean;
  comTelefone?: boolean;
  // "tem site"/"tem WhatsApp validado" NÃO entram aqui de propósito (decisão 02/07, ver
  // comentário em buildWhere): `website` NUNCA é populado por import-cnpj-dataset.js na base
  // fria — filtrar por ele devolveria vitrine vazia. Presença digital é OUTPUT do enriquecimento
  // (RadarLeadPool), não filtro da Base Receita.
  maxPhoneShare?: number; // default 3 (HOT-03: "remover mesmo número" graduado)
  maxEmailShare?: number;
  blocklistEmail?: boolean; // aplica BLOCKLIST_EMAIL_CONTADOR
};

export type CnpjBaseQueryInput = {
  cnaes?: string[];
  cnaePrincipalOnly?: boolean;
  naturezas?: string[];
  situacoes?: string[];
  porte?: string[];
  mei?: boolean;
  simples?: boolean;
  // Aceita 1 valor (legado) ou vários (seleção múltipla Matriz+Filial no filtro avançado).
  matrizFilial?: string | string[];
  capitalMin?: number;
  capitalMax?: number;
  // NÃO filtra nada hoje: regimeTributario é fase 2 da RFB (coluna sempre NULL na carga atual
  // do import-cnpj-dataset.js — Lucro Real/Presumido é dataset separado). Campo aceito e
  // IGNORADO no WHERE até a coluna ter dado real — nunca ofereça filtro sem lastro em coluna
  // populada (correção de escopo 02/07: "não oferecer o que o motor não entrega depois").
  regime?: string;
  keyword?: string;
  cities?: string[]; // "cidade|UF" ou só cidade (normalizedCity)
  states?: string[];
  ddd?: string;
  abertaDe?: string; // ISO date
  abertaAte?: string;
  // Idade da empresa em anos (derivado de openedAt) — açúcar sintático sobre abertaDe/abertaAte
  // pro front não ter que calcular data; aplicado no mesmo campo openedAt (nunca os dois juntos
  // com abertaDe/abertaAte sem sentido — quem manda os dois, os dois entram em AND).
  idadeMinAnos?: number;
  idadeMaxAnos?: number;
  contato?: CnpjBaseContatoFilter;
  // VENDAS-REFAB item 4: "Sócio/dono" — ownerName/ownerQualification (denormalizados do QSA da
  // RFB, ver comentário no schema.prisma). `donoConhecido` filtra só quem tem sócio identificado
  // (ownerName preenchido); `ownerNameKeyword` busca por nome do sócio; `ownerQualifications`
  // filtra pelo cargo/qualificação do sócio-administrador (ex.: "Sócio-Administrador").
  donoConhecido?: boolean;
  ownerNameKeyword?: string;
  ownerQualifications?: string[];
  excluirJaEntregues?: boolean;
  limit?: number;
  includeCount?: boolean;
  cursor?: string | null;
};

export type CnpjBaseSampleRow = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnae: string | null;
  cnaeDescription: string | null;
  porte: string | null;
  situacao: string;
  matrizFilial: string | null;
  capitalSocial: string | null;
  naturezaJuridica: string | null;
  simples: boolean | null;
  mei: boolean | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  website: string | null;
  openedAt: string | null;
  firstSeenAt: string | null;
  phoneShareCount: number | null;
  emailShareCount: number | null;
  ownerName: string | null;
  ownerQualification: string | null;
  selo: 'whatsapp_validado' | 'celular_provavel' | 'fixo' | 'provavel_contador' | 'sem_contato';
};

// Config do blocklist de e-mail de contador (HOT-03) — editável sem redeploy via env JSON.
// HBX_CNPJ_BASE_EMAIL_BLOCKLIST="contab,fiscal,escritorio,assessoria,adv"
const DEFAULT_EMAIL_BLOCKLIST = ['contab', 'fiscal', 'escritorio', 'assessoria', 'adv'];
function emailBlocklistTokens(): string[] {
  const raw = String(process.env.HBX_CNPJ_BASE_EMAIL_BLOCKLIST || '').trim();
  if (!raw) return DEFAULT_EMAIL_BLOCKLIST;
  const tokens = raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  return tokens.length ? tokens : DEFAULT_EMAIL_BLOCKLIST;
}

function isLikelyCelular(phoneDigits: string | null | undefined): boolean {
  const digits = String(phoneDigits || '').replace(/\D/g, '');
  // Regra-do-9: DDD (2) + 9 dígitos, 1º dígito do número = 9.
  const local = digits.length > 11 ? digits.slice(-11) : digits;
  return local.length === 11 && local[2] === '9';
}

// Mesmo princípio da busca principal do Radar: a palavra digitada pelo usuário é pesquisada
// diretamente no texto normalizado da Receita (fantasia, razão social e atividade). Não exige
// que a pessoa conheça o código ou a nomenclatura oficial do CNAE. Para termos longos, também
// usa um radical curto: "sorveteria" encontra "sorvetes" na descrição da atividade.
function selarQualidade(row: { phone: string | null; email: string | null; phoneShareCount: number | null; emailShareCount: number | null; whatsappValidado?: boolean }, maxShare: number): CnpjBaseSampleRow['selo'] {
  const tokens = emailBlocklistTokens();
  const emailLower = String(row.email || '').toLowerCase();
  const isContadorEmail = tokens.some((t) => emailLower.includes(t));
  const highShare = (row.phoneShareCount != null && row.phoneShareCount > maxShare) || (row.emailShareCount != null && row.emailShareCount > maxShare);
  if (isContadorEmail || highShare) return 'provavel_contador';
  if (row.whatsappValidado) return 'whatsapp_validado';
  if (row.phone && isLikelyCelular(row.phone)) return 'celular_provavel';
  if (row.phone) return 'fixo';
  return 'sem_contato';
}

@Injectable()
export class CnpjBaseQueryService {
  private readonly logger = new Logger(CnpjBaseQueryService.name);
  private readonly countCache = new Map<string, { value: { available: boolean; count: number | null }; expiresAt: number }>();
  private readonly pendingCounts = new Map<string, Promise<{ available: boolean; count: number | null }>>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly leadHarvestImport?: LeadHarvestImportService,
  ) {}

  private db() {
    return this.prisma as any;
  }

  private async supports(): Promise<boolean> {
    return this.prisma.hasTable('CnpjPublicCompany').catch(() => false);
  }

  /** Monta o WHERE dinâmico. SEMPRE prioriza state/city (índices compostos existentes). */
  private buildWhere(input: CnpjBaseQueryInput): Record<string, any> {
    const where: Record<string, any> = {};
    const and: Record<string, any>[] = [];

    // ---- Localização primeiro (usa [normalizedCity,state] / [state,cnae]) ----
    if (input.states?.length) where.state = { in: input.states.map((s) => String(s).trim().toUpperCase()).filter(Boolean) };
    if (input.cities?.length) {
      const cities = input.cities.map((c) => String(c).trim().toLowerCase()).filter(Boolean);
      if (cities.length) where.normalizedCity = { in: cities };
    }
    if (input.ddd) {
      const ddd = String(input.ddd).replace(/\D/g, '').slice(0, 2);
      if (ddd) and.push({ OR: [{ phoneDigits: { contains: ddd } }, { phone: { contains: ddd } }] });
    }
    // bairro/CEP REMOVIDOS (correção de escopo 02/07): `address` é uma string concatenada
    // (logradouro+numero+bairro), não há coluna estruturada — um LIKE aqui seria vitrine vazia
    // (raramente bate) fingindo precisão que a base fria não tem. Sem lastro, não oferece.

    // ---- Características ----
    if (input.cnaes?.length) {
      const codes = input.cnaes.map((c) => String(c).trim()).filter(Boolean);
      if (codes.length) {
        if (input.cnaePrincipalOnly) {
          where.cnae = { in: codes };
        } else {
          and.push({ OR: [{ cnae: { in: codes } }, ...codes.map((c) => ({ cnaeSecundarias: { contains: c } }))] });
        }
      }
    }
    if (input.naturezas?.length) where.naturezaJuridica = { in: input.naturezas };
    if (input.situacoes?.length) where.situacao = { in: input.situacoes.map((s) => String(s).trim().toLowerCase()) };
    if (input.porte?.length) where.porte = { in: input.porte };
    if (input.matrizFilial) {
      const matrizFilialList = Array.isArray(input.matrizFilial) ? input.matrizFilial : [input.matrizFilial];
      const values = matrizFilialList.map((v) => String(v).trim()).filter(Boolean);
      if (values.length === 1) where.matrizFilial = values[0];
      else if (values.length > 1) where.matrizFilial = { in: values };
    }
    if (input.mei != null) where.mei = input.mei;
    if (input.simples != null) where.simples = input.simples;
    // input.regime NUNCA filtra (correção de escopo 02/07): regimeTributario é fase 2 da RFB,
    // sempre NULL na carga atual — filtrar por ele devolveria 0 resultados sempre. Aceito no
    // input só pra não quebrar contrato do front quando a fase 2 chegar; ignorado até lá.
    if (input.capitalMin != null || input.capitalMax != null) {
      where.capitalSocial = {};
      if (input.capitalMin != null) where.capitalSocial.gte = input.capitalMin;
      if (input.capitalMax != null) where.capitalSocial.lte = input.capitalMax;
    }
    if (input.keyword) {
      const keyword = String(input.keyword).trim();
      // Lei única de radar-segment-match.util (28/07): lista separada por vírgula = OR entre
      // frases; dentro de cada frase, AND entre as palavras (grupo = variantes singular/plural/
      // radical da MESMA palavra, em OR interno). O OR plano antigo fazia "distribuidora de
      // agua" contar a cidade inteira de Aguai ("agua" batia em "AGUAI" no nome de qualquer
      // empresa local). Frase inteira em razao/fantasia segue valendo.
      const phraseGroups = segmentPhraseTokenGroups(keyword, { withRadical: true });
      and.push({
        OR: [
          { razaoSocial: { contains: keyword, mode: 'insensitive' } },
          { nomeFantasia: { contains: keyword, mode: 'insensitive' } },
          ...phraseGroups.map((groups) => ({
            AND: groups.map((group) => ({ OR: group.map((token) => ({ searchText: { contains: token } })) })),
          })),
        ],
      });
    }

    // ---- Datas ----
    if (input.abertaDe || input.abertaAte) {
      where.openedAt = {};
      if (input.abertaDe) where.openedAt.gte = new Date(input.abertaDe);
      if (input.abertaAte) where.openedAt.lte = new Date(input.abertaAte);
    }
    // Idade da empresa (anos) — açúcar sobre openedAt: "idadeMinAnos=5" = aberta há PELO MENOS
    // 5 anos (openedAt <= hoje-5anos); "idadeMaxAnos=2" = aberta há NO MÁXIMO 2 anos
    // (openedAt >= hoje-2anos). Combina em AND com abertaDe/abertaAte se ambos vierem (raro,
    // mas não é erro — o front decide qual UI oferecer, o backend só aplica).
    if (input.idadeMinAnos != null || input.idadeMaxAnos != null) {
      const ageWhere: Record<string, any> = { ...(where.openedAt || {}) };
      const now = Date.now();
      const yearMs = 365.25 * 24 * 60 * 60 * 1000;
      if (input.idadeMinAnos != null) {
        const cutoff = new Date(now - Math.max(0, Number(input.idadeMinAnos) || 0) * yearMs);
        ageWhere.lte = ageWhere.lte ? new Date(Math.min(ageWhere.lte.getTime(), cutoff.getTime())) : cutoff;
      }
      if (input.idadeMaxAnos != null) {
        const cutoff = new Date(now - Math.max(0, Number(input.idadeMaxAnos) || 0) * yearMs);
        ageWhere.gte = ageWhere.gte ? new Date(Math.max(ageWhere.gte.getTime(), cutoff.getTime())) : cutoff;
      }
      where.openedAt = ageWhere;
    }

    // ---- Sócio/dono (item 4 PLANO-UI) ----
    if (input.donoConhecido) {
      and.push({ ownerName: { not: null } });
    }
    if (input.ownerNameKeyword) {
      and.push({ ownerName: { contains: input.ownerNameKeyword, mode: 'insensitive' } });
    }
    if (input.ownerQualifications?.length) {
      const qualifications = input.ownerQualifications.map((q) => String(q).trim()).filter(Boolean);
      if (qualifications.length) where.ownerQualification = { in: qualifications };
    }

    // ---- HOT-03 anti-contador / opções de contato ----
    const contato = input.contato || {};
    if (contato.comEmail) where.email = { not: null };
    if (contato.comTelefone) where.phoneDigits = { not: null };
    if (contato.comCelular) {
      // regra-do-9 aproximada em SQL: 11 dígitos locais com 3º = '9'. Prisma não faz regex
      // portável fácil aqui — filtragem fina do "celular" acontece em memória na amostra
      // (isLikelyCelular), este filtro só garante que HÁ telefone.
      where.phoneDigits = { not: null };
    }
    const maxPhoneShare = contato.maxPhoneShare ?? 3;
    const maxEmailShare = contato.maxEmailShare ?? 3;
    if (contato.maxPhoneShare != null || contato.blocklistEmail) {
      and.push({ OR: [{ phoneShareCount: null }, { phoneShareCount: { lte: maxPhoneShare } }] });
    }
    if (contato.maxEmailShare != null) {
      and.push({ OR: [{ emailShareCount: null }, { emailShareCount: { lte: maxEmailShare } }] });
    }
    if (contato.blocklistEmail) {
      const tokens = emailBlocklistTokens();
      and.push({ NOT: { OR: tokens.map((t) => ({ email: { contains: t, mode: 'insensitive' } })) } });
    }

    // temSite/semSite/temInstagram/temWhatsAppValidado/notaIAMin/semPresencaDigital REMOVIDOS
    // (correção de escopo 02/07, ordem do dono: "não oferecer filtro que o motor não entrega
    // depois"). `website` NUNCA é populado por import-cnpj-dataset.js (o dump RFB não tem site;
    // é enriquecimento) — filtrar por ele na base fria seria vitrine vazia. Presença digital é
    // OUTPUT do enriquecimento (RadarLeadPool), não filtro da base fria dos 28M. Se o dono quiser
    // esses cortes, a resposta certa é uma visão SEPARADA sobre leads já enriquecidos, nunca
    // inflando a contagem/amostra da Base Receita com dado que ela não tem.

    if (and.length) where.AND = and;
    return where;
  }

  /**
   * VENDAS-REFAB S3 — count PURO (sem amostra) sobre a base 28M, pro "Buscar empresas"/Dashboard
   * mostrarem o total REAL da LISTA (RFB) filtrado, não o pool local pequeno (RadarLeadPool).
   * Nunca lança: sem a tabela carregada (ambiente local, ~893 no pool) devolve `available:false`
   * e count `null` — quem chama decide o fallback (nunca inventar um número fixo aqui).
   */
  async countBase(input: CnpjBaseQueryInput): Promise<{ available: boolean; count: number | null }> {
    if (!(await this.supports())) {
      return { available: false, count: null };
    }
    const where = this.buildWhere(input);
    const cacheKey = JSON.stringify(where);
    const now = Date.now();
    const cached = this.countCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.value;

    // Uma abertura do /vendas dispara mais de um consumidor desta contagem. Sem single-flight,
    // cada request fazia seu proprio COUNT(*) sobre a base Receita (dezenas de GB) e ocupava
    // todas as conexoes do Prisma ate derrubar endpoints sem relacao com o Radar.
    const pending = this.pendingCounts.get(cacheKey);
    if (pending) return pending;

    const operation = (async () => {
      let count: number | null = null;

      // A carga mensal ja grava a contagem exata por situacao em CnpjBaseStats. Somar essas
      // poucas linhas entrega o total global sem varrer CnpjPublicCompany inteira. Consultas
      // com filtros continuam usando o count real com os indices correspondentes.
      if (!Object.keys(where).length && await this.prisma.hasTable('CnpjBaseStats').catch(() => false)) {
        const statsModel = this.db().cnpjBaseStats;
        const stats = typeof statsModel?.aggregate === 'function'
          ? await statsModel.aggregate({
            where: { group: 'situacao' },
            _sum: { count: true },
          }).catch(() => null)
          : null;
        const statsCount = Number(stats?._sum?.count);
        if (Number.isFinite(statsCount) && statsCount > 0) count = Math.trunc(statsCount);
      }

      if (count == null) {
        count = await this.db().cnpjPublicCompany.count({ where }).catch(() => null);
      }

      const value = { available: true, count: typeof count === 'number' ? count : null };
      this.countCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + (value.count == null ? 15_000 : 5 * 60_000),
      });
      return value;
    })();

    this.pendingCounts.set(cacheKey, operation);
    try {
      return await operation;
    } finally {
      this.pendingCounts.delete(cacheKey);
    }
  }

  /**
   * Count seguro pra um WHERE já montado. Busca SEM nenhum filtro (where vazio — ex.: o app não
   * mandou cidade) faria um COUNT(*) seq scan da base inteira (28M), prendendo a conexão por
   * minutos e entupindo o pool do Prisma (a tempestade que derrubava /vendas, /me etc. com 500).
   * Nesse caso desvia pro total barato (CnpjBaseStats/estimativa, com cache e single-flight) via
   * countBase. Com qualquer filtro, o índice composto (state,city,...) limita o count e ele roda
   * direto. Assim a "busca total" fica liberada sem risco de derrubar o sistema.
   */
  private async countForWhere(where: Record<string, unknown>): Promise<number | null> {
    if (!where || Object.keys(where).length === 0) {
      const cheap = await this.countBase({}).catch(() => ({ available: false, count: null as number | null }));
      return cheap.count;
    }
    return this.db().cnpjPublicCompany.count({ where }).catch(() => 0);
  }

  /**
   * POST /modules/owner/cnpj-base/query — count + amostra de 20 + cursor. Query builder com
   * WHERE dinâmico; SEMPRE state/city entram primeiro no WHERE (índice composto absorve o resto).
   */
  async query(input: CnpjBaseQueryInput) {
    if (!(await this.supports())) {
      throw new ServiceUnavailableException('Base Receita (CnpjPublicCompany) ainda nao foi carregada neste ambiente.');
    }
    const limit = Math.min(Math.max(Math.trunc(Number(input.limit) || 20), 1), 1000);
    const where = this.buildWhere(input);

    let excludeCnpjs: string[] = [];
    if (input.excluirJaEntregues) {
      excludeCnpjs = await this.findAlreadyDeliveredCnpjs(where);
      if (excludeCnpjs.length) where.cnpj = { notIn: excludeCnpjs };
    }

    const cursorClause = input.cursor ? { cnpj: { gt: input.cursor } } : {};
    const finalWhere = cursorClause.cnpj ? { AND: [where, cursorClause] } : where;

    const rowsPromise = this.db().cnpjPublicCompany.findMany({
        where: finalWhere,
        orderBy: { cnpj: 'asc' },
        take: limit,
        select: {
          cnpj: true, razaoSocial: true, nomeFantasia: true, cnae: true, cnaeDescription: true,
          porte: true, situacao: true, matrizFilial: true, capitalSocial: true, naturezaJuridica: true,
          simples: true, mei: true, city: true, state: true, phone: true, phone2: true, email: true,
          website: true, openedAt: true, firstSeenAt: true, phoneShareCount: true, emailShareCount: true,
          phoneDigits: true, ownerName: true, ownerQualification: true,
        },
      }).catch(() => []);
    const countPromise = input.includeCount === false
      ? Promise.resolve<number | null>(null)
      : this.countForWhere(where).catch(() => 0);
    const [count, rows] = await Promise.all([countPromise, rowsPromise]);

    const whatsappValidados = await this.lookupWhatsappValidated(rows.map((r: any) => r.phoneDigits).filter(Boolean));

    const maxShare = input.contato?.maxPhoneShare ?? 3;
    const sample: CnpjBaseSampleRow[] = (rows || []).map((row: any) => ({
      cnpj: row.cnpj,
      razaoSocial: row.razaoSocial,
      nomeFantasia: row.nomeFantasia || null,
      cnae: row.cnae || null,
      cnaeDescription: row.cnaeDescription || null,
      porte: row.porte || null,
      situacao: row.situacao || 'ativa',
      matrizFilial: row.matrizFilial || null,
      capitalSocial: row.capitalSocial != null ? String(row.capitalSocial) : null,
      naturezaJuridica: row.naturezaJuridica || null,
      simples: row.simples ?? null,
      mei: row.mei ?? null,
      city: row.city || null,
      state: row.state || null,
      phone: row.phone || null,
      phone2: row.phone2 || null,
      email: row.email || null,
      website: row.website || null,
      openedAt: row.openedAt ? new Date(row.openedAt).toISOString() : null,
      firstSeenAt: row.firstSeenAt ? new Date(row.firstSeenAt).toISOString() : null,
      phoneShareCount: row.phoneShareCount ?? null,
      emailShareCount: row.emailShareCount ?? null,
      ownerName: row.ownerName || null,
      ownerQualification: row.ownerQualification || null,
      selo: selarQualidade({ phone: row.phone, email: row.email, phoneShareCount: row.phoneShareCount, emailShareCount: row.emailShareCount, whatsappValidado: whatsappValidados.has(normalizePhoneDigits(row.phoneDigits) || '') }, maxShare),
    }));

    // Estatística de topo (HOT-03 "criatividade"): quantos da AMOSTRA têm celular próprio vs contador.
    const statsAmostra = {
      total: sample.length,
      comCelularProprio: sample.filter((s) => s.selo === 'celular_provavel' || s.selo === 'whatsapp_validado').length,
      provavelContador: sample.filter((s) => s.selo === 'provavel_contador').length,
    };

    return {
      count,
      sample,
      cursorNext: rows.length === limit ? rows[rows.length - 1].cnpj : null,
      statsAmostra,
      excludedJaEntregues: excludeCnpjs.length,
    };
  }

  /** Dedup "já entregues": RadarLeadPool não tem coluna cnpj — cruza por phoneDigits (índice único). */
  private async findAlreadyDeliveredCnpjs(where: Record<string, any>): Promise<string[]> {
    if (!(await this.prisma.hasTable('RadarLeadPool').catch(() => false))) return [];
    const candidates = await this.db().cnpjPublicCompany.findMany({
      where,
      select: { cnpj: true, phoneDigits: true },
      take: 5000,
    }).catch(() => []);
    const digitsToCnpj = new Map<string, string>();
    for (const c of candidates) {
      const digits = normalizePhoneDigits(c.phoneDigits);
      if (digits) digitsToCnpj.set(digits, c.cnpj);
    }
    if (!digitsToCnpj.size) return [];
    const existing = await this.db().radarLeadPool.findMany({
      where: { phoneDigits: { in: Array.from(digitsToCnpj.keys()) } },
      select: { phoneDigits: true },
      take: 5000,
    }).catch(() => []);
    const out: string[] = [];
    for (const row of existing) {
      const cnpj = digitsToCnpj.get(String(row.phoneDigits || ''));
      if (cnpj) out.push(cnpj);
    }
    return out;
  }

  /** Selo "WhatsApp validado" (HOT-03): cruza phoneDigits com LeadContact kind=whatsapp já gravado. */
  private async lookupWhatsappValidated(phoneDigitsList: string[]): Promise<Set<string>> {
    const digits = Array.from(new Set(phoneDigitsList.map((d) => normalizePhoneDigits(d)).filter(Boolean))) as string[];
    if (!digits.length || !(await this.prisma.hasTable('LeadContact').catch(() => false))) return new Set();
    const rows = await this.db().leadContact.findMany({
      where: { kind: 'whatsapp', valueNormalized: { in: digits } },
      select: { valueNormalized: true },
      take: 2000,
    }).catch(() => []);
    return new Set(rows.map((r: any) => r.valueNormalized));
  }

  /**
   * POST /modules/owner/cnpj-base/materialize — vira RadarLeads via caminho PÚBLICO existente
   * (LeadHarvestImportService), sem tocar fundo nos serviços de escrita de lead/contato. Respeita
   * dedup existente do harvest import (email/phone/domain/company+city). Teto de segurança: 500
   * por chamada (materialização em massa é ação do dono, não precisa ser 1 clique = 1 milhão).
   */
  async materialize(user: any, input: CnpjBaseQueryInput & { maxItems?: number }) {
    if (!(await this.supports())) {
      throw new ServiceUnavailableException('Base Receita (CnpjPublicCompany) ainda nao foi carregada neste ambiente.');
    }
    if (!this.leadHarvestImport) {
      throw new ServiceUnavailableException('LeadHarvestImportService indisponivel neste processo.');
    }
    const maxItems = Math.min(Math.max(Math.trunc(Number(input.maxItems) || 100), 1), 500);
    const where = this.buildWhere(input);
    let excludeCnpjs: string[] = [];
    if (input.excluirJaEntregues !== false) {
      excludeCnpjs = await this.findAlreadyDeliveredCnpjs(where);
      if (excludeCnpjs.length) where.cnpj = { notIn: excludeCnpjs };
    }

    const rows = await this.db().cnpjPublicCompany.findMany({
      where,
      orderBy: { cnpj: 'asc' },
      take: maxItems,
      select: {
        cnpj: true, razaoSocial: true, nomeFantasia: true, city: true, state: true,
        cnaeDescription: true, website: true, phone: true, phoneDigits: true, email: true,
      },
    }).catch(() => []);

    if (!rows.length) {
      return { ok: true, batchId: null, requested: 0, counts: null, message: 'Nenhuma empresa elegivel para materializar (filtros vazios ou tudo ja entregue).' };
    }

    const batchId = `cnpj-base-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const leads = rows.map((row: any) => ({
      externalId: `cnpj:${row.cnpj}`,
      placeId: `cnpj:${row.cnpj}`,
      name: row.nomeFantasia || row.razaoSocial,
      city: row.city,
      state: row.state,
      segment: row.cnaeDescription || null,
      website: row.website || null,
      phone: row.phone || null,
      email: row.email || null,
      emailStatus: row.email ? 'probable' : 'missing',
      sourceUrl: `internal://cnpj-base/${row.cnpj}`,
      sourceProvider: 'cnpj_base_query',
      sourceMode: 'production',
      evidence: { cnpj: row.cnpj },
    }));

    const result = await this.leadHarvestImport.importBatchForUser(user, {
      schemaVersion: 'hbx-harvest.v1',
      batchId,
      sourceMode: 'production',
      sourceName: 'cnpj_base_query',
      requestedBy: user?.email || user?.name || 'owner',
      leads,
      emails: [],
    });

    return {
      ok: true,
      batchId: result.batchId,
      requested: leads.length,
      counts: result.counts,
      excludedJaEntregues: excludeCnpjs.length,
    };
  }

  /** GET /modules/owner/cnpj-base/cities?q= — distinct normalizedCity+state p/ autocomplete. */
  async searchCities(q: string) {
    if (!(await this.supports())) return { items: [] };
    const query = String(q || '').trim().toLowerCase();
    if (query.length < 2) return { items: [] };
    const rows = await this.db().cnpjPublicCompany.findMany({
      where: { normalizedCity: { contains: query } },
      select: { normalizedCity: true, city: true, state: true },
      distinct: ['normalizedCity', 'state'],
      take: 20,
      orderBy: { normalizedCity: 'asc' },
    }).catch(() => []);
    return {
      items: rows.map((r: any) => ({ normalizedCity: r.normalizedCity, city: r.city || r.normalizedCity, state: r.state })),
    };
  }

  /** CNAE picker por texto (código ou descrição) no catálogo CnpjPublicCnae (trgm em descricao). */
  async searchCnaes(q: string) {
    if (!(await this.prisma.hasTable('CnpjPublicCnae').catch(() => false))) return { items: [] };
    const query = String(q || '').trim();
    if (!query) return { items: [] };
    const isCode = /^\d+$/.test(query);
    const rows = await this.db().cnpjPublicCnae.findMany({
      where: isCode
        ? { codigo: { startsWith: query } }
        : { descricao: { contains: query, mode: 'insensitive' } },
      take: 20,
      orderBy: { codigo: 'asc' },
    }).catch(() => []);
    return { items: rows.map((r: any) => ({ codigo: r.codigo, descricao: r.descricao })) };
  }

  /**
   * Contagem por opção (estilo "Empresário (Individual) (44.889.600)") — SEMPRE lê o cache
   * `CnpjBaseStats` (populado 1x/mês pelo import-cnpj-dataset.js). Nunca faz GROUP BY ao vivo.
   */
  async getStats(group?: string) {
    if (!(await this.prisma.hasTable('CnpjBaseStats').catch(() => false))) return { groups: {}, generatedAt: null };
    const rows = await this.db().cnpjBaseStats.findMany({
      where: group ? { group } : undefined,
      orderBy: [{ group: 'asc' }, { count: 'desc' }],
      take: 2000,
    }).catch(() => []);
    const groups: Record<string, Array<{ key: string; label: string | null; count: number }>> = {};
    let generatedAt: string | null = null;
    for (const row of rows) {
      (groups[row.group] = groups[row.group] || []).push({ key: row.key, label: row.label, count: row.count });
      const updated = row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null;
      if (updated && (!generatedAt || updated > generatedAt)) generatedAt = updated;
    }
    return { groups, generatedAt };
  }
}
