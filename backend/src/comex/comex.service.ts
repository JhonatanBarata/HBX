import { BadRequestException, Injectable } from '@nestjs/common';

import { ComexDataService } from './comex-data.service';

/**
 * HBX COMEX — inteligência de comércio exterior (módulo NOVO, isolado do /vendas).
 *
 * EMBALAGEM JURÍDICA (decisão 31/07, ver comex-motor/README.md): empresa é sempre
 * "PROVÁVEL importador/exportador" (inferência de dados públicos) e o payload de
 * radar NUNCA carrega valor/volume POR EMPRESA — valores só agregados por
 * município/UF/país (motivo pelo qual a SECEX removeu a lista oficial em 2023).
 */

const FLUXOS = new Set(['IMP', 'EXP']);

function sh4Valido(sh4: string): string {
  const v = String(sh4 || '').trim();
  if (!/^\d{4}$/.test(v)) throw new BadRequestException('sh4 deve ter 4 dígitos');
  return v;
}

function fluxoValido(fluxo: string): string {
  const v = String(fluxo || 'IMP').trim().toUpperCase();
  if (!FLUXOS.has(v)) throw new BadRequestException('fluxo deve ser IMP ou EXP');
  return v;
}

// Texto de busca vira literal SQL seguro: só letras/números/espaço sobrevivem.
function textoBuscaSeguro(q: string): string {
  return String(q || '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().slice(0, 80);
}

@Injectable()
export class ComexService {
  constructor(private readonly data: ComexDataService) {}

  disponivel(): boolean {
    return this.data.available();
  }

  /** Busca de produto por código NCM/SH4 (dígitos) ou descrição (PT). */
  async buscaNcm(q: string) {
    if (!this.data.available()) return { disponivel: false, itens: [] };
    const termo = textoBuscaSeguro(q);
    if (!termo) return { disponivel: true, itens: [] };

    const where = /^\d+$/.test(termo)
      ? `CO_SH4 LIKE '${termo}%'`
      : termo
          .toLowerCase()
          .split(/\s+/)
          .slice(0, 5)
          .map((t) => `lower(strip_accents(NO_SH4_POR)) LIKE '%${t}%'`)
          .join(' AND ');

    const itens = await this.data.query(`
      SELECT DISTINCT CO_SH4 AS sh4, NO_SH4_POR AS descricao,
             NO_SH4_ING AS descricaoEn, NO_SH4_ESP AS descricaoEs
      FROM aux_ncm_sh WHERE ${where} ORDER BY sh4 LIMIT 20
    `);
    return { disponivel: true, itens };
  }

  /** Mapa do mercado do SH4: totais, série mensal, municípios, países, vias. */
  async mercado(sh4Raw: string, fluxoRaw: string) {
    if (!this.data.available()) return { disponivel: false };
    const sh4 = sh4Valido(sh4Raw);
    const fluxo = fluxoValido(fluxoRaw);

    const [descricao] = await this.data.query(`
      SELECT NO_SH4_POR AS pt, NO_SH4_ING AS en, NO_SH4_ESP AS es
      FROM aux_ncm_sh WHERE CO_SH4 = '${sh4}' LIMIT 1
    `);

    const [totais] = await this.data.query(`
      SELECT CAST(sum(VL_FOB) AS DOUBLE) AS fobUsd,
             CAST(sum(KG_LIQUIDO) AS DOUBLE) AS kg,
             CASE WHEN sum(KG_LIQUIDO) > 0
                  THEN round(sum(VL_FOB) / sum(KG_LIQUIDO), 2) END AS usdPorKg,
             count(DISTINCT CO_MUN) AS municipios
      FROM flow_mun WHERE SH4 = '${sh4}' AND fluxo = '${fluxo}'
    `);

    const serieMensal = await this.data.query(`
      SELECT CO_ANO AS ano, CO_MES AS mes,
             CAST(sum(VL_FOB) AS DOUBLE) AS fobUsd,
             CAST(sum(KG_LIQUIDO) AS DOUBLE) AS kg
      FROM flow_mun WHERE SH4 = '${sh4}' AND fluxo = '${fluxo}'
      GROUP BY 1, 2 ORDER BY 1, 2
    `);

    const topMunicipios = await this.data.query(`
      SELECT any_value(u.NO_MUN_MIN) AS municipio, any_value(m.SG_UF_MUN) AS uf,
             CAST(sum(m.VL_FOB) AS DOUBLE) AS fobUsd,
             CAST(sum(m.KG_LIQUIDO) AS DOUBLE) AS kg,
             round(100.0 * sum(m.VL_FOB) / sum(sum(m.VL_FOB)) OVER (), 1) AS sharePct
      FROM flow_mun m LEFT JOIN aux_uf_mun u ON u.CO_MUN_GEO = m.CO_MUN
      WHERE m.SH4 = '${sh4}' AND m.fluxo = '${fluxo}'
      GROUP BY m.CO_MUN ORDER BY fobUsd DESC LIMIT 12
    `);

    // País/via/preço vêm do fluxo NCM (mais rico) — filtro por prefixo do NCM.
    const topPaises = await this.data.query(`
      SELECT any_value(p.NO_PAIS) AS pais, any_value(p.CO_PAIS_ISOA3) AS iso3,
             CAST(sum(f.VL_FOB) AS DOUBLE) AS fobUsd,
             round(100.0 * sum(f.VL_FOB) / sum(sum(f.VL_FOB)) OVER (), 1) AS sharePct,
             CASE WHEN sum(f.KG_LIQUIDO) > 0
                  THEN round(sum(f.VL_FOB) / sum(f.KG_LIQUIDO), 2) END AS usdPorKg
      FROM flow_ncm f LEFT JOIN aux_pais p ON p.CO_PAIS = f.CO_PAIS
      WHERE substr(f.CO_NCM, 1, 4) = '${sh4}' AND f.fluxo = '${fluxo}'
      GROUP BY f.CO_PAIS ORDER BY fobUsd DESC LIMIT 12
    `);

    const vias = await this.data.query(`
      SELECT any_value(v.NO_VIA) AS via,
             round(100.0 * sum(f.VL_FOB) / sum(sum(f.VL_FOB)) OVER (), 1) AS sharePct
      FROM flow_ncm f LEFT JOIN aux_via v ON v.CO_VIA = f.CO_VIA
      WHERE substr(f.CO_NCM, 1, 4) = '${sh4}' AND f.fluxo = '${fluxo}'
      GROUP BY f.CO_VIA ORDER BY sharePct DESC LIMIT 6
    `);

    return {
      disponivel: true,
      sh4,
      fluxo,
      descricao: descricao || null,
      totais: totais || null,
      serieMensal,
      topMunicipios,
      topPaises,
      vias,
    };
  }

  /**
   * Radar Internacional: prováveis importadores/exportadores do SH4 (detetive).
   * SEM valor por empresa no payload — só score/perfil (embalagem jurídica).
   */
  async radar(sh4Raw: string, fluxoRaw: string) {
    if (!this.data.available()) return { disponivel: false, candidatos: [] };
    const sh4 = sh4Valido(sh4Raw);
    const fluxo = fluxoValido(fluxoRaw);

    const [descricao] = await this.data.query(`
      SELECT NO_SH4_POR AS pt FROM aux_ncm_sh WHERE CO_SH4 = '${sh4}' LIMIT 1
    `);
    const tokens = String(descricao?.pt || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .match(/[a-z]{6,}/g) || [];
    const stop = new Set(['outros', 'outras', 'novos', 'novas', 'partes', 'exceto']);
    const afinidade = [...new Set(tokens.filter((t) => !stop.has(t)).map((t) => t.slice(0, 7)))]
      .map((t) => `lower(strip_accents(c.cnae)) LIKE '%${t}%'`)
      .join(' OR ') || 'false';

    const candidatos = await this.data.query(`
      WITH mun_alvo AS (
        SELECT m.CO_MUN, any_value(u.NO_MUN_MIN) AS municipio,
               any_value(m.SG_UF_MUN) AS uf, sum(m.VL_FOB) AS fob
        FROM flow_mun m LEFT JOIN aux_uf_mun u ON u.CO_MUN_GEO = m.CO_MUN
        WHERE m.SH4 = '${sh4}' AND m.fluxo = '${fluxo}'
        GROUP BY m.CO_MUN
      ),
      tot AS (SELECT sum(fob) AS t FROM mun_alvo),
      max_ano AS (SELECT max(ultimo_ano_na_lista) AS m FROM cadastro_atual)
      SELECT c.cnpj, c.empresa, c.municipio, c.uf, c.cnae,
             c.ultimo_ano_na_lista AS ultimoAnoNaLista,
             c.anos_na_lista AS anosNaLista,
             CASE WHEN ${afinidade} THEN 'cnae_do_produto'
                  WHEN substr(c.cnae, 1, 4) IN ('4693','4689','4649','4669','4684','4685')
                       THEN 'trading_atacado' ELSE 'regiao_do_fluxo' END AS perfil,
             round(CASE WHEN ${afinidade} THEN 35
                        WHEN substr(c.cnae, 1, 4) IN ('4693','4689','4649','4669','4684','4685')
                             THEN 15 ELSE 0 END
                   + 40.0 * m.fob / (SELECT t FROM tot)
                   + CASE WHEN c.ultimo_ano_na_lista = (SELECT m FROM max_ano)
                          THEN 15 ELSE 5 END
                   + least(c.anos_na_lista, 3) * 10.0 / 3, 1) AS score
      FROM cadastro_atual c
      JOIN mun_alvo m
        ON upper(strip_accents(c.municipio)) = upper(strip_accents(m.municipio))
       AND c.uf = m.uf
      WHERE c.fluxo = '${fluxo}'
      ORDER BY score DESC LIMIT 60
    `);

    return { disponivel: true, sh4, fluxo, descricao: descricao?.pt || null, candidatos };
  }
}
