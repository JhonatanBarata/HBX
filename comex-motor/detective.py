# -*- coding: utf-8 -*-
"""
HBX Comex — N1: o "detetive" v0 (100% local, sem RFB ainda).

Dado um SH4 (posição do NCM), cruza:
  1. flow_mun      — municípios que importam/exportam o SH4 hoje (Comex Stat, público)
  2. cadastro_atual — lista OFICIAL de empresas importadoras/exportadoras (CNPJ, publicada
                      pela SECEX até a remoção em mar/2023; seed histórico 2018-2020)

Saída: empresas nomeadas, com CNPJ, no município que movimenta o SH4 — ranqueadas por:
  peso do município no fluxo atual do produto + recência/constância na lista oficial.

Fase 2 (VPS): enriquecer com RFB (situação, porte, contato) e somar candidatos novos.

Uso: python detective.py --sh4 4011 [--fluxo IMP] [--meses 18] [--top 40]
"""
import argparse
import os

import duckdb

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "data", "comex.duckdb")
OUT = os.path.join(HERE, "data", "out")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sh4", required=True)
    ap.add_argument("--fluxo", default="IMP", choices=["IMP", "EXP"])
    ap.add_argument("--meses", type=int, default=18)
    ap.add_argument("--top", type=int, default=40)
    args = ap.parse_args()

    os.makedirs(OUT, exist_ok=True)
    con = duckdb.connect(DB, read_only=True)

    desc = con.execute(
        "SELECT NO_SH4_POR FROM aux_ncm_sh WHERE CO_SH4 = ? LIMIT 1", [args.sh4]
    ).fetchone()
    print(f"== SH4 {args.sh4} ({args.fluxo}): {desc[0] if desc else '?'}\n")

    # 1) municípios que movimentam o SH4 na janela recente
    con.execute(f"""
        CREATE TEMP TABLE mun_alvo AS
        WITH ult AS (
            SELECT max(CO_ANO * 100 + CO_MES) AS fim FROM flow_mun
        )
        SELECT m.CO_MUN,
               any_value(u.NO_MUN_MIN) AS municipio,
               any_value(m.SG_UF_MUN)  AS uf,
               sum(m.VL_FOB)  AS fob_usd,
               sum(m.KG_LIQUIDO) AS kg,
               count(DISTINCT m.CO_ANO * 100 + m.CO_MES) AS meses_ativos
        FROM flow_mun m
        JOIN ult ON (m.CO_ANO * 100 + m.CO_MES) >
                    (SELECT fim FROM ult) - {args.meses // 12 * 100 + args.meses % 12}
        LEFT JOIN aux_uf_mun u ON u.CO_MUN_GEO = m.CO_MUN
        WHERE m.SH4 = ? AND m.fluxo = ?
        GROUP BY m.CO_MUN
    """, [args.sh4, args.fluxo])

    top_mun = con.execute("""
        SELECT municipio, uf, fob_usd, kg, meses_ativos,
               round(100.0 * fob_usd / sum(fob_usd) OVER (), 1) AS share_pct
        FROM mun_alvo ORDER BY fob_usd DESC LIMIT 15
    """).fetchdf()
    print("-- Top municípios no fluxo (janela recente):")
    print(top_mun.to_string(index=False))

    # tokens do descritivo do SH4 p/ medir afinidade com o CNAE da empresa
    # (ex.: "Pneumáticos novos, de borracha" -> pneumat, borrach)
    stop = {"de", "da", "do", "para", "com", "sem", "e", "ou", "em", "os", "as",
            "novos", "novas", "outros", "outras", "tipo", "tipos", "uso", "usos"}
    desc_txt = (desc[0] if desc else "").lower()
    tokens = sorted({w[:7] for w in __import__("re").findall(r"[a-zà-ú]+",
                     desc_txt) if len(w) > 5 and w not in stop})
    afinidade = " OR ".join(
        f"lower(strip_accents(c.cnae)) LIKE '%{t}%'" for t in tokens) or "false"

    # 2) cruzamento: empresas da lista oficial nesses municípios
    #    score = afinidade de CNAE (35 / trading 15) + peso do município (0-40)
    #          + recência na lista (15/5) + constância (0-10)
    candidatos = con.execute(f"""
        WITH tot AS (SELECT sum(fob_usd) AS t FROM mun_alvo),
             max_ano AS (SELECT max(ultimo_ano_na_lista) AS m FROM cadastro_atual)
        SELECT c.cnpj, c.empresa, c.municipio, c.uf, c.cnae,
               c.ultimo_ano_na_lista, c.anos_na_lista,
               CASE WHEN {afinidade} THEN 'cnae_do_produto'
                    WHEN substr(c.cnae, 1, 4) IN ('4693','4689','4649','4669','4684','4685')
                         THEN 'trading_atacado' ELSE 'outro' END AS perfil,
               round(CASE WHEN {afinidade} THEN 35
                          WHEN substr(c.cnae, 1, 4) IN ('4693','4689','4649','4669','4684','4685')
                               THEN 15 ELSE 0 END
                     + 40.0 * m.fob_usd / (SELECT t FROM tot)
                     + CASE WHEN c.ultimo_ano_na_lista = (SELECT m FROM max_ano)
                            THEN 15 ELSE 5 END
                     + least(c.anos_na_lista, 3) * 10.0 / 3, 1) AS score
        FROM cadastro_atual c
        JOIN mun_alvo m
          ON upper(strip_accents(c.municipio)) = upper(strip_accents(m.municipio))
         AND c.uf = m.uf
        WHERE c.fluxo = ?
        ORDER BY score DESC
        LIMIT {args.top}
    """, [args.fluxo]).fetchdf()

    print(f"\n-- Top {args.top} empresas candidatas ({args.fluxo} de {args.sh4}):")
    print(candidatos.to_string(index=False, max_colwidth=38))

    out = os.path.join(OUT, f"candidatos_{args.fluxo}_{args.sh4}.csv")
    candidatos.to_csv(out, index=False, encoding="utf-8-sig")
    print(f"\nOK -> {out}")


if __name__ == "__main__":
    main()
