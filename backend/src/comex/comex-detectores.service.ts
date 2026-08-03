import { BadRequestException, Injectable } from '@nestjs/common';

import { ComexDataService } from './comex-data.service';

/**
 * HBX COMEX — BIBLIOTECA DE DETECTORES (F1 do PLANO-COMEX-ANALISTA).
 *
 * Cada achado da demo Ask Crios virou um padrão computável em SQL sobre o
 * parquet — SEM IA nenhuma. A mesma biblioteca serve três bocas: o Analista
 * (roda agora), o Vigia (diff mensal → WhatsApp) e as lentes C1–C3 (tela).
 *
 * Todo achado sai com frase-template pronta e fonte carimbada: é a escada de
 * degradação nº 1 — o produto funciona sem nenhum modelo de IA no ar.
 *
 * Embalagem jurídica (N4 §6): nenhum valor/volume por CNPJ; empresa é sempre
 * "provável"; cifra só agregada. O detector nome-antigo (SECEX × RFB) fica
 * pra F2 — exige a ficha RFB, que mora no Postgres, fora deste módulo.
 */

export interface ComexAchado {
  tipo: string;
  forca: number; // 0–100 — ordena o ranking; heurística, não estatística
  frase: string;
  dados: Record<string, unknown>;
  fonte: string;
}

export interface ComexAchadosParams {
  sh4?: string;
  fluxo: string;
  uf?: string;
  municipio?: string;
  cnae4?: string;
  produtoSh4?: string;
  excluirSh4s: string[];
  precoUsdKg?: number;
}

const FONTE_STAT = 'Comex Stat/MDIC';
const FONTE_SECEX = 'Lista oficial SECEX 2018–2020 (resgate Wayback)';
const FONTE_MATRIZ = 'HBX — matriz de afinidade (derivada Comex Stat × SECEX)';

const MESES_PT = [
  '', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function fmt(v: number, casas = 1): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function fmtMi(usd: number): string {
  if (usd >= 1e9) return `US$ ${fmt(usd / 1e9)} bi`;
  if (usd >= 1e6) return `US$ ${fmt(usd / 1e6)} mi`;
  return `US$ ${fmt(usd / 1e3, 0)} mil`;
}

function sh4Valido(raw: string, campo: string): string {
  const v = String(raw || '').replace(/\D/g, '');
  // aceita NCM de 8 dígitos por cortesia — o nível de análise é SH4
  if (v.length !== 4 && v.length !== 8) {
    throw new BadRequestException(`${campo} deve ter 4 (SH4) ou 8 (NCM) dígitos`);
  }
  return v.slice(0, 4);
}

@Injectable()
export class ComexDetectoresService {
  constructor(private readonly data: ComexDataService) {}

  /** Carimbo de janela do dado ("jan/2024–jun/2026"), cacheado por processo. */
  private janela: string | null = null;
  private async fonteStat(): Promise<string> {
    if (!this.janela) {
      const [r] = await this.data.query(`
        SELECT min(CO_ANO * 100 + CO_MES) AS ini, max(CO_ANO * 100 + CO_MES) AS fim FROM flow_mun
      `);
      const rot = (ym: number) =>
        `${MESES_PT[ym % 100].slice(0, 3)}/${Math.floor(ym / 100)}`;
      this.janela = r ? `${rot(num(r.ini))}–${rot(num(r.fim))}` : '';
    }
    return `${FONTE_STAT} ${this.janela}`;
  }

  /**
   * Orquestra os detectores aplicáveis aos parâmetros e devolve o ranking.
   * Cada detector é isolado: falhar um não derruba a investigação.
   */
  async achados(params: ComexAchadosParams): Promise<{
    disponivel: boolean;
    fonteJanela?: string;
    achados: ComexAchado[];
  }> {
    if (!this.data.available()) return { disponivel: false, achados: [] };
    const fonte = await this.fonteStat();

    const jobs: Array<Promise<ComexAchado | ComexAchado[] | null>> = [];
    const { sh4, fluxo, uf, municipio, cnae4, produtoSh4, excluirSh4s, precoUsdKg } = params;

    if (sh4) {
      jobs.push(this.origemCara(sh4, fluxo, fonte));
      jobs.push(this.spreadInterno(sh4, fluxo, fonte));
      jobs.push(this.viradaDeMao(sh4, fonte));
      jobs.push(this.sazonalidade(sh4, fluxo, fonte));
      jobs.push(this.origemNova(sh4, fluxo, fonte));
      jobs.push(this.precoEmMovimento(sh4, fluxo, fonte));
      if (uf) jobs.push(this.rotaAlheia(sh4, fluxo, uf, fonte));
      if (precoUsdKg) jobs.push(this.percentilPreco(sh4, fluxo, precoUsdKg, fonte));
    }
    if (municipio && uf) jobs.push(this.vizinhanca(municipio, uf, fluxo));
    if (produtoSh4 || cnae4) {
      jobs.push(this.giganteEscondido({ produtoSh4, cnae4, fluxo, excluirSh4s }));
    }

    const resultados = await Promise.all(
      jobs.map((j) => j.catch(() => null)), // detector isolado: erro vira ausência
    );
    const achados = resultados
      .flatMap((r) => (Array.isArray(r) ? r : r ? [r] : []))
      .sort((a, b) => b.forca - a.forca);

    return { disponivel: true, fonteJanela: fonte, achados };
  }

  /** Top origens do SH4 com preço — insumo comum a vários detectores. */
  private async origens(sh4: string, fluxo: string, limite = 8) {
    return this.data.query(`
      SELECT any_value(p.NO_PAIS) AS pais, any_value(p.CO_PAIS_ISOA3) AS iso3,
             CAST(sum(f.VL_FOB) AS DOUBLE) AS fobUsd,
             round(100.0 * sum(f.VL_FOB) / sum(sum(f.VL_FOB)) OVER (), 1) AS sharePct,
             CASE WHEN sum(f.KG_LIQUIDO) > 0
                  THEN round(sum(f.VL_FOB) / sum(f.KG_LIQUIDO), 2) END AS usdKg
      FROM flow_ncm f LEFT JOIN aux_pais p ON p.CO_PAIS = f.CO_PAIS
      WHERE substr(f.CO_NCM, 1, 4) = '${sh4}' AND f.fluxo = '${fluxo}'
      GROUP BY f.CO_PAIS ORDER BY fobUsd DESC LIMIT ${limite}
    `);
  }

  /** A origem principal é a mais cara entre as maiores (caso China da demo). */
  private async origemCara(sh4: string, fluxo: string, fonte: string): Promise<ComexAchado | null> {
    const top = (await this.origens(sh4, fluxo, 5)).filter((o) => num(o.usdKg) > 0);
    if (top.length < 3) return null;
    const principal = top[0];
    const maisBarata = top.reduce((a, b) => (num(a.usdKg) <= num(b.usdKg) ? a : b));
    const premio = (num(principal.usdKg) - num(maisBarata.usdKg)) / num(maisBarata.usdKg);
    const ehMaisCara = top.every((o) => num(o.usdKg) <= num(principal.usdKg));
    if (!ehMaisCara || premio < 0.15) return null;
    const verbo = fluxo === 'IMP' ? 'origem' : 'destino';
    return {
      tipo: 'origem_cara',
      forca: Math.min(90, Math.round(40 + premio * 50)),
      frase:
        `${principal.pais} é a ${verbo} mais cara entre as ${top.length} maiores do ${sh4} — ` +
        `US$ ${fmt(num(principal.usdKg), 2)}/kg contra US$ ${fmt(num(maisBarata.usdKg), 2)}/kg de ${maisBarata.pais} ` +
        `(${fmt(premio * 100, 0)}% de diferença), com ${fmt(num(principal.sharePct), 0)}% do fluxo.`,
      dados: { sh4, fluxo, principal, maisBarata, topOrigens: top },
      fonte,
    };
  }

  /** Spread interno >3× = dois produtos convivendo no mesmo código (resina ureica). */
  private async spreadInterno(sh4: string, fluxo: string, fonte: string): Promise<ComexAchado | null> {
    const rel = (await this.origens(sh4, fluxo)).filter(
      (o) => num(o.usdKg) > 0 && num(o.sharePct) >= 3,
    );
    if (rel.length < 2) return null;
    const cara = rel.reduce((a, b) => (num(a.usdKg) >= num(b.usdKg) ? a : b));
    const barata = rel.reduce((a, b) => (num(a.usdKg) <= num(b.usdKg) ? a : b));
    const razao = num(cara.usdKg) / num(barata.usdKg);
    if (razao < 3) return null;
    return {
      tipo: 'spread_interno',
      forca: Math.min(95, Math.round(30 + razao * 10)),
      frase:
        `No ${sh4} convivem produtos muito diferentes: US$ ${fmt(num(cara.usdKg), 2)}/kg (${cara.pais}) ` +
        `contra US$ ${fmt(num(barata.usdKg), 2)}/kg (${barata.pais}) — spread de ${fmt(razao, 1)}×. ` +
        `Saber qual grade você compra muda a conta inteira.`,
      dados: { sh4, fluxo, cara, barata, razao: Math.round(razao * 10) / 10 },
      fonte,
    };
  }

  /** O fluxo do código entra/sai por outra UF (caso "80% pelo RS" da demo). */
  private async rotaAlheia(sh4: string, fluxo: string, uf: string, fonte: string): Promise<ComexAchado | null> {
    const ufs = await this.data.query(`
      SELECT SG_UF_NCM AS uf, CAST(sum(VL_FOB) AS DOUBLE) AS fobUsd,
             round(100.0 * sum(VL_FOB) / sum(sum(VL_FOB)) OVER (), 1) AS sharePct
      FROM flow_ncm WHERE substr(CO_NCM, 1, 4) = '${sh4}' AND fluxo = '${fluxo}'
      GROUP BY 1 ORDER BY fobUsd DESC LIMIT 6
    `);
    const top = ufs[0];
    if (!top || String(top.uf) === uf || num(top.sharePct) < 40) return null;
    const verbo = fluxo === 'IMP' ? 'entra' : 'sai';
    return {
      tipo: 'rota_alheia',
      forca: Math.min(85, Math.round(num(top.sharePct))),
      frase:
        `${fmt(num(top.sharePct), 0)}% do ${sh4} do Brasil ${verbo} por ${top.uf} — não pela sua UF (${uf}). ` +
        `A rota dominante diz onde estão os concorrentes e o frete que eles pagam.`,
      dados: { sh4, fluxo, ufEmpresa: uf, topUfs: ufs },
      fonte,
    };
  }

  /** Importa caro e exporta barato o mesmo código (fenol da demo) — trading/substituição. */
  private async viradaDeMao(sh4: string, fonte: string): Promise<ComexAchado | null> {
    const [r] = await this.data.query(`
      SELECT
        CAST(sum(VL_FOB) FILTER (fluxo = 'IMP') AS DOUBLE) AS fobImp,
        CAST(sum(VL_FOB) FILTER (fluxo = 'EXP') AS DOUBLE) AS fobExp,
        CASE WHEN sum(KG_LIQUIDO) FILTER (fluxo = 'IMP') > 0
             THEN round(sum(VL_FOB) FILTER (fluxo = 'IMP') / sum(KG_LIQUIDO) FILTER (fluxo = 'IMP'), 2) END AS usdKgImp,
        CASE WHEN sum(KG_LIQUIDO) FILTER (fluxo = 'EXP') > 0
             THEN round(sum(VL_FOB) FILTER (fluxo = 'EXP') / sum(KG_LIQUIDO) FILTER (fluxo = 'EXP'), 2) END AS usdKgExp
      FROM flow_ncm WHERE substr(CO_NCM, 1, 4) = '${sh4}'
    `);
    if (!r || !num(r.usdKgImp) || !num(r.usdKgExp)) return null;
    const gap = (num(r.usdKgImp) - num(r.usdKgExp)) / num(r.usdKgExp);
    if (gap < 0.25) return null;
    return {
      tipo: 'virada_de_mao',
      forca: Math.min(90, Math.round(35 + gap * 60)),
      frase:
        `O Brasil importa ${sh4} a US$ ${fmt(num(r.usdKgImp), 2)}/kg e exporta o mesmo código a ` +
        `US$ ${fmt(num(r.usdKgExp), 2)}/kg (${fmt(gap * 100, 0)}% mais barato) — sinal clássico de ` +
        `oportunidade de substituição de importação ou de trading.`,
      dados: { sh4, ...r, gapPct: Math.round(gap * 100) },
      fonte,
    };
  }

  /** Relógio do código: mês forte × mês fraco na média da janela (lente C2). */
  private async sazonalidade(sh4: string, fluxo: string, fonte: string): Promise<ComexAchado | null> {
    const meses = await this.data.query(`
      WITH m AS (
        SELECT CO_ANO, CO_MES, sum(VL_FOB) AS fob
        FROM flow_ncm WHERE substr(CO_NCM, 1, 4) = '${sh4}' AND fluxo = '${fluxo}'
        GROUP BY 1, 2
      )
      SELECT CO_MES AS mes, CAST(avg(fob) AS DOUBLE) AS media
      FROM m GROUP BY 1 HAVING count(*) >= 2 ORDER BY 1
    `);
    if (meses.length < 10) return null; // série curta demais pra falar de estação
    const forte = meses.reduce((a, b) => (num(a.media) >= num(b.media) ? a : b));
    const fraco = meses.reduce((a, b) => (num(a.media) <= num(b.media) ? a : b));
    const razao = num(forte.media) / Math.max(1, num(fraco.media));
    if (razao < 1.4) return null;
    const verbo = fluxo === 'IMP' ? 'compra' : 'embarque';
    return {
      tipo: 'sazonalidade',
      forca: Math.min(80, Math.round(razao * 25)),
      frase:
        `O ${sh4} tem relógio: ${MESES_PT[num(forte.mes)]} concentra ${fmt(razao, 1)}× mais fluxo que ` +
        `${MESES_PT[num(fraco.mes)]} na média da janela — janela de ${verbo} não é detalhe.`,
      dados: { sh4, fluxo, mesForte: forte, mesFraco: fraco, serie: meses },
      fonte,
    };
  }

  /** Vizinhança SECEX: prováveis operadores no município da empresa (sem cifra por CNPJ). */
  private async vizinhanca(municipio: string, uf: string, fluxo: string): Promise<ComexAchado | null> {
    const chave = municipio.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().slice(0, 60);
    if (!chave) return null;
    const rows = await this.data.query(`
      SELECT empresa, cnae, ultimo_ano_na_lista AS ultimoAno
      FROM cadastro_atual
      WHERE fluxo = '${fluxo}'
        AND upper(strip_accents(municipio)) = upper(strip_accents('${chave}'))
        AND uf = '${uf}'
      ORDER BY anos_na_lista DESC, ultimo_ano_na_lista DESC LIMIT 40
    `);
    if (rows.length < 2) return null;
    const rotulo = fluxo === 'IMP' ? 'importadores' : 'exportadores';
    const exemplos = rows.slice(0, 4).map((r) => String(r.empresa)).join(', ');
    return {
      tipo: 'vizinhanca',
      forca: Math.min(70, 20 + rows.length),
      frase:
        `${rows.length >= 40 ? '40+' : rows.length} prováveis ${rotulo} na lista oficial em ` +
        `${chave}/${uf} — ex.: ${exemplos}. O ecossistema logístico do município já existe.`,
      dados: { municipio: chave, uf, fluxo, total: rows.length, vizinhos: rows.slice(0, 12) },
      fonte: FONTE_SECEX,
    };
  }

  /**
   * Gigante escondido: o que o perfil da empresa (produto exportado ou CNAE)
   * movimenta desproporcionalmente e ela não citou — o "MDI de US$ 536 mi".
   * Preferência: matriz produto→insumo (forte); fallback: matriz CNAE.
   */
  private async giganteEscondido(args: {
    produtoSh4?: string;
    cnae4?: string;
    fluxo: string;
    excluirSh4s: string[];
  }): Promise<ComexAchado[] | null> {
    const excluir = new Set(args.excluirSh4s);
    let rows: Array<Record<string, unknown>> = [];
    let contexto = '';

    if (args.produtoSh4 && (await this.data.ensureOptional('prod_insumo_stat'))) {
      excluir.add(args.produtoSh4);
      rows = await this.data.query(`
        SELECT m.sh4_insumo AS sh4, m.votos, m.mediana_lift AS lift, m.score,
               CAST(m.fob_nat_usd AS DOUBLE) AS fobNatUsd,
               any_value(s.NO_SH4_POR) AS descricao
        FROM prod_insumo_stat m
        LEFT JOIN aux_ncm_sh s ON s.CO_SH4 = m.sh4_insumo
        WHERE m.sh4_produto = '${args.produtoSh4}'
        GROUP BY ALL ORDER BY m.score DESC LIMIT 12
      `);
      contexto = `quem exporta ${args.produtoSh4}`;
    } else if (args.cnae4 && (await this.data.ensureOptional('cnae_sh4_stat'))) {
      rows = await this.data.query(`
        SELECT m.sh4, m.votos, m.mediana_lift AS lift, m.score,
               CAST(m.fob_nat_usd AS DOUBLE) AS fobNatUsd,
               any_value(s.NO_SH4_POR) AS descricao
        FROM cnae_sh4_stat m
        LEFT JOIN aux_ncm_sh s ON s.CO_SH4 = m.sh4
        WHERE m.cnae4 = '${args.cnae4}' AND m.fluxo = '${args.fluxo}'
        GROUP BY ALL ORDER BY m.score DESC LIMIT 12
      `);
      contexto = `o setor (CNAE ${args.cnae4})`;
    }

    const candidatos = rows.filter((r) => !excluir.has(String(r.sh4))).slice(0, 3);
    if (!candidatos.length) return null;
    const verbo = args.fluxo === 'EXP' ? 'venda' : 'compra';
    return candidatos.map((c, i) => ({
      tipo: 'gigante_escondido',
      forca: Math.min(95, 45 + num(c.votos) * 2 - i * 8),
      frase:
        `Onde ${contexto} está, a ${verbo} de ${String(c.descricao || '').slice(0, 70)} (${c.sh4}) é ` +
        `${fmt(num(c.lift), 1)}× o padrão nacional (${c.votos} municípios confirmam) — mercado de ` +
        `${fmtMi(num(c.fobNatUsd))} que não estava na sua lista.`,
      dados: { ...c, contexto, fluxo: args.fluxo },
      fonte: FONTE_MATRIZ,
    }));
  }

  /** Régua "você paga caro?": percentil do preço informado no volume da janela (lente C1). */
  private async percentilPreco(
    sh4: string,
    fluxo: string,
    preco: number,
    fonte: string,
  ): Promise<ComexAchado | null> {
    const origens = (await this.origens(sh4, fluxo, 20)).filter((o) => num(o.usdKg) > 0);
    if (origens.length < 3) return null;
    const [r] = await this.data.query(`
      WITH o AS (
        SELECT sum(KG_LIQUIDO) AS kg, sum(VL_FOB) / sum(KG_LIQUIDO) AS usdKg
        FROM flow_ncm
        WHERE substr(CO_NCM, 1, 4) = '${sh4}' AND fluxo = '${fluxo}' AND KG_LIQUIDO > 0
        GROUP BY CO_PAIS
      )
      SELECT round(100.0 * sum(kg) FILTER (usdKg <= ${preco}) / sum(kg), 0) AS percentil FROM o
    `);
    const percentil = num(r?.percentil);
    const competitivas = origens.filter((o) => num(o.sharePct) >= 3);
    const maisBarata = competitivas.reduce((a, b) => (num(a.usdKg) <= num(b.usdKg) ? a : b));
    const economia = (preco - num(maisBarata.usdKg)) / preco;
    return {
      tipo: 'percentil_preco',
      forca: Math.min(90, Math.max(15, Math.round(percentil))),
      frase:
        `US$ ${fmt(preco, 2)}/kg fica acima de ${fmt(percentil, 0)}% do volume do ${sh4} na janela. ` +
        (economia > 0.05
          ? `A origem competitiva mais barata sai a US$ ${fmt(num(maisBarata.usdKg), 2)}/kg ` +
            `(${maisBarata.pais}) — diferença de ${fmt(economia * 100, 0)}%.`
          : `Seu preço está entre os melhores do código.`),
      dados: { sh4, fluxo, preco, percentil, maisBarata, origens: competitivas },
      fonte,
    };
  }

  /** Janela recente (6 meses) vs anterior — base do Vigia. */
  private janelasSql(sh4: string, fluxo: string): string {
    return `
      WITH base AS (
        SELECT CO_ANO * 100 + CO_MES AS ym, CO_PAIS, VL_FOB, KG_LIQUIDO
        FROM flow_ncm WHERE substr(CO_NCM, 1, 4) = '${sh4}' AND fluxo = '${fluxo}'
      ),
      meses AS (SELECT DISTINCT ym FROM base ORDER BY ym DESC LIMIT 12),
      corte AS (SELECT min(ym) AS ini12, quantile_disc(ym, 0.5) AS meio FROM meses)
    `;
  }

  /** Origem que não existia e passou a pesar — concorrente achou fornecedor novo. */
  private async origemNova(sh4: string, fluxo: string, fonte: string): Promise<ComexAchado | null> {
    const rows = await this.data.query(`
      ${this.janelasSql(sh4, fluxo)}
      SELECT any_value(p.NO_PAIS) AS pais,
             round(100.0 * sum(b.VL_FOB) FILTER (b.ym > (SELECT meio FROM corte))
                   / sum(sum(b.VL_FOB) FILTER (b.ym > (SELECT meio FROM corte))) OVER (), 1) AS shareRecente,
             round(100.0 * sum(b.VL_FOB) FILTER (b.ym <= (SELECT meio FROM corte))
                   / sum(sum(b.VL_FOB) FILTER (b.ym <= (SELECT meio FROM corte))) OVER (), 1) AS shareAnterior
      FROM base b LEFT JOIN aux_pais p ON p.CO_PAIS = b.CO_PAIS
      WHERE b.ym >= (SELECT ini12 FROM corte)
      GROUP BY b.CO_PAIS
    `);
    const nova = rows
      .filter((r) => num(r.shareRecente) >= 5 && num(r.shareAnterior) < 0.5)
      .sort((a, b) => num(b.shareRecente) - num(a.shareRecente))[0];
    if (!nova) return null;
    const rotulo = fluxo === 'IMP' ? 'origem' : 'destino';
    return {
      tipo: 'origem_nova',
      forca: Math.min(85, Math.round(30 + num(nova.shareRecente) * 3)),
      frase:
        `${nova.pais} apareceu como ${rotulo} novo do ${sh4}: ${fmt(num(nova.shareRecente), 1)}% do fluxo ` +
        `nos últimos 6 meses (antes: ~0%). Alguém achou um fornecedor que você ainda não olhou.`,
      dados: { sh4, fluxo, ...nova },
      fonte,
    };
  }

  /** Preço da origem principal mexeu forte entre as janelas — base do Vigia. */
  private async precoEmMovimento(sh4: string, fluxo: string, fonte: string): Promise<ComexAchado | null> {
    const [r] = await this.data.query(`
      ${this.janelasSql(sh4, fluxo)}
      , principal AS (
        SELECT CO_PAIS FROM base GROUP BY 1 ORDER BY sum(VL_FOB) DESC LIMIT 1
      )
      SELECT any_value(p.NO_PAIS) AS pais,
             round(sum(b.VL_FOB) FILTER (b.ym > (SELECT meio FROM corte))
                   / nullif(sum(b.KG_LIQUIDO) FILTER (b.ym > (SELECT meio FROM corte)), 0), 2) AS precoRecente,
             round(sum(b.VL_FOB) FILTER (b.ym <= (SELECT meio FROM corte))
                   / nullif(sum(b.KG_LIQUIDO) FILTER (b.ym <= (SELECT meio FROM corte)), 0), 2) AS precoAnterior
      FROM base b LEFT JOIN aux_pais p ON p.CO_PAIS = b.CO_PAIS
      WHERE b.CO_PAIS = (SELECT CO_PAIS FROM principal) AND b.ym >= (SELECT ini12 FROM corte)
    `);
    if (!r || !num(r.precoRecente) || !num(r.precoAnterior)) return null;
    const delta = (num(r.precoRecente) - num(r.precoAnterior)) / num(r.precoAnterior);
    if (Math.abs(delta) < 0.15) return null;
    const dir = delta > 0 ? 'subiu' : 'caiu';
    return {
      tipo: 'preco_em_movimento',
      forca: Math.min(90, Math.round(Math.abs(delta) * 100)),
      frase:
        `O preço da principal origem do ${sh4} (${r.pais}) ${dir} ${fmt(Math.abs(delta) * 100, 0)}% ` +
        `nos últimos 6 meses: US$ ${fmt(num(r.precoAnterior), 2)} → US$ ${fmt(num(r.precoRecente), 2)}/kg.`,
      dados: { sh4, fluxo, ...r, deltaPct: Math.round(delta * 100) },
      fonte,
    };
  }
}

/** Query string → parâmetros validados (letra/dígito estrito — nada cru chega no SQL). */
export function parseComexAchadosParams(
  q: Record<string, string | undefined>,
): ComexAchadosParams {
  const fluxo = String(q.fluxo || 'IMP').trim().toUpperCase();
  if (fluxo !== 'IMP' && fluxo !== 'EXP') {
    throw new BadRequestException('fluxo deve ser IMP ou EXP');
  }
  const params: ComexAchadosParams = { fluxo, excluirSh4s: [] };
  if (q.sh4) params.sh4 = sh4Valido(q.sh4, 'sh4');
  if (q.produto) params.produtoSh4 = sh4Valido(q.produto, 'produto');
  if (q.cnae) {
    const c = String(q.cnae).replace(/\D/g, '').slice(0, 4);
    if (c.length !== 4) throw new BadRequestException('cnae deve ter 4 dígitos');
    params.cnae4 = c;
  }
  if (q.uf) {
    const u = String(q.uf).trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(u)) throw new BadRequestException('uf inválida');
    params.uf = u;
  }
  if (q.municipio) params.municipio = String(q.municipio).slice(0, 80);
  if (q.excluir) {
    params.excluirSh4s = String(q.excluir)
      .split(',')
      .map((s) => s.replace(/\D/g, ''))
      .filter((s) => s.length >= 4)
      .map((s) => s.slice(0, 4))
      .slice(0, 30);
  }
  if (q.preco) {
    const p = Number(String(q.preco).replace(',', '.'));
    if (!Number.isFinite(p) || p <= 0 || p > 1e6) {
      throw new BadRequestException('preco inválido');
    }
    params.precoUsdKg = p;
  }
  if (!params.sh4 && !params.produtoSh4 && !params.cnae4 && !(params.municipio && params.uf)) {
    throw new BadRequestException('informe sh4, produto, cnae ou municipio+uf');
  }
  return params;
}
