# -*- coding: utf-8 -*-
"""
HBX Comex — MATRIZES DE AFINIDADE (F1a do PLANO-COMEX-ANALISTA).

Duas matrizes, medidas em 03/08/2026 contra o caso Ask Crios (CNAE 2072 / produto 3909):

1) prod_insumo_stat — "quem EXPORTA o produto X importa o insumo Y".
   Municípios que exportam um SH4 (peso mínimo US$ 100k) × o que eles importam
   DESPROPORCIONALMENTE ao país. É a lente FORTE: capturou o MDI (2929, 15 votos,
   lift mediano 6,7) que o CNAE não enxerga e que a IA local de 30B não cita.

2) cnae_sh4_stat — "municípios das empresas do CNAE X movimentam Y".
   Fallback pra empresa sem produto conhecido. v2: a média ponderada da v1 afogava
   a química no ruído têxtil — agora conta PRESENÇA de sobre-representação
   (votos = municípios com lift local >= 1.5) e pune SH4 genérico via IDF.

Anti-porto (Santos importa de tudo): tudo é share INTERNO do município vs share
nacional; volume bruto nunca pontua. Voto de >= 3 municípios: 1 cidade não faz padrão.

Uso: python matriz_cnae_ncm.py          (após ingest.py; roda em segundos)
Saída: data/parquet/prod_insumo_stat.parquet + cnae_sh4_stat.parquet (backend lê)
"""
import os

import duckdb

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "data", "comex.duckdb")
OUT_DIR = os.path.join(HERE, "data", "parquet")
OUT_PROD = os.path.join(OUT_DIR, "prod_insumo_stat.parquet").replace("\\", "/")
OUT_CNAE = os.path.join(OUT_DIR, "cnae_sh4_stat.parquet").replace("\\", "/")

# Compartilhado: share interno por município e share nacional, por fluxo.
BASE = """
WITH mun_flow AS (
    SELECT fluxo, CO_MUN, SH4, sum(VL_FOB) AS fob
    FROM flow_mun GROUP BY 1, 2, 3
),
mun_tot AS (
    SELECT fluxo, CO_MUN, sum(fob) AS tot FROM mun_flow GROUP BY 1, 2
),
mun_share AS (
    SELECT f.fluxo, f.CO_MUN, f.SH4, f.fob / t.tot AS share
    FROM mun_flow f
    JOIN mun_tot t ON t.fluxo = f.fluxo AND t.CO_MUN = f.CO_MUN
),
nat AS (
    SELECT fluxo, SH4, sum(fob) AS fob_nat,
           sum(fob) / sum(sum(fob)) OVER (PARTITION BY fluxo) AS share_nat
    FROM mun_flow GROUP BY 1, 2
),
lifts AS (
    SELECT s.fluxo, s.CO_MUN, s.SH4, n.fob_nat,
           s.share / n.share_nat AS lift_local
    FROM mun_share s
    JOIN nat n ON n.fluxo = s.fluxo AND n.SH4 = s.SH4
)
"""

# 1) produto (EXP) → insumo (IMP): cohort = municípios exportadores do produto.
SQL_PROD = BASE + """
, prod AS (
    SELECT SH4 AS sh4_produto, CO_MUN
    FROM flow_mun WHERE fluxo = 'EXP'
    GROUP BY 1, 2 HAVING sum(VL_FOB) > 100000
),
hits AS (
    SELECT p.sh4_produto, l.SH4 AS sh4_insumo,
           count(*) FILTER (l.lift_local >= 1.5) AS votos,
           quantile_cont(l.lift_local, 0.5) FILTER (l.lift_local >= 1.5) AS mediana_lift,
           any_value(l.fob_nat) AS fob_nat
    FROM prod p
    JOIN lifts l ON l.CO_MUN = p.CO_MUN AND l.fluxo = 'IMP'
    GROUP BY 1, 2
),
df AS (  -- em quantos produtos o insumo pontua: IDF suave pune o genérico
    SELECT sh4_insumo, count(*) AS produtos FROM hits WHERE votos >= 3 GROUP BY 1
)
SELECT h.sh4_produto, h.sh4_insumo, h.votos,
       round(CAST(h.mediana_lift AS DOUBLE), 2) AS mediana_lift,
       CAST(h.fob_nat AS DOUBLE) AS fob_nat_usd,
       round(h.votos * ln(1 + h.mediana_lift) / (1 + 0.15 * ln(1 + d.produtos)), 3) AS score
FROM hits h JOIN df d ON d.sh4_insumo = h.sh4_insumo
WHERE h.votos >= 3
QUALIFY row_number() OVER (PARTITION BY h.sh4_produto ORDER BY score DESC) <= 40
ORDER BY h.sh4_produto, score DESC
"""

# 2) CNAE → SH4 (IMP e EXP): cohort = municípios das empresas do CNAE (cadastro SECEX).
SQL_CNAE = BASE + """
, emp AS (
    SELECT fluxo, cnpj, substr(trim(cnae), 1, 4) AS cnae4, municipio, uf
    FROM cadastro_atual
    WHERE cnae IS NOT NULL AND substr(trim(cnae), 1, 4) ~ '^[0-9]{4}$'
),
emp_mun AS (
    SELECT e.fluxo, e.cnae4, m.CO_MUN_GEO AS co_mun
    FROM emp e
    JOIN aux_uf_mun m
      ON upper(strip_accents(e.municipio)) = upper(strip_accents(m.NO_MUN_MIN))
     AND e.uf = m.SG_UF
    GROUP BY 1, 2, 3
),
hits AS (
    SELECT em.fluxo, em.cnae4, l.SH4 AS sh4,
           count(*) FILTER (l.lift_local >= 1.5) AS votos,
           quantile_cont(l.lift_local, 0.5) FILTER (l.lift_local >= 1.5) AS mediana_lift,
           any_value(l.fob_nat) AS fob_nat
    FROM emp_mun em
    JOIN lifts l ON l.CO_MUN = em.co_mun AND l.fluxo = em.fluxo
    GROUP BY 1, 2, 3
),
df AS (  -- IDF forte: ferramenta/café pontuam em todo CNAE de cidade grande
    SELECT fluxo, sh4, count(*) AS cnaes FROM hits WHERE votos >= 3 GROUP BY 1, 2
)
SELECT h.fluxo, h.cnae4, h.sh4, h.votos,
       round(CAST(h.mediana_lift AS DOUBLE), 2) AS mediana_lift,
       CAST(h.fob_nat AS DOUBLE) AS fob_nat_usd,
       round(h.votos * ln(1 + h.mediana_lift) / ln(exp(1) + d.cnaes), 3) AS score
FROM hits h JOIN df d ON d.fluxo = h.fluxo AND d.sh4 = h.sh4
WHERE h.votos >= 3
QUALIFY row_number() OVER (PARTITION BY h.fluxo, h.cnae4 ORDER BY score DESC) <= 25
ORDER BY h.fluxo, h.cnae4, score DESC
"""


def exporta(con, sql: str, dest: str, nome: str) -> None:
    con.execute(f"COPY ({sql}) TO '{dest}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    n = con.execute(f"SELECT count(*) FROM read_parquet('{dest}')").fetchone()[0]
    print(f"{nome}  {os.path.getsize(dest) / 1e6:.1f} MB  {n} pares")


def aceite(con) -> None:
    """Caso Ask Crios: produto 3909 tem que puxar a cesta da resina (incl. MDI 2929)."""
    print("\n== prod_insumo 3909 (resinas fenólicas) — top 12")
    for r in con.execute(f"""
        SELECT m.sh4_insumo, m.votos, m.mediana_lift, m.score,
               any_value(s.NO_SH4_POR)[:55] AS d
        FROM read_parquet('{OUT_PROD}') m
        LEFT JOIN aux_ncm_sh s ON s.CO_SH4 = m.sh4_insumo
        WHERE m.sh4_produto = '3909'
        GROUP BY ALL ORDER BY m.score DESC LIMIT 12
    """).fetchall():
        print(f"  {r[0]}  votos {r[1]:>3}  lift~{r[2]:>5}  score {r[3]:>7}  {r[4]}")

    # ⚠️ resinas termofixas = CNAE 2032 (2072 é tintas de impressão — pegadinha
    # que veio dos testes de 01/08 e foi corrigida pelo cadastro do próprio CNPJ).
    print("\n== cnae_sh4 2032 IMP (v2, resinas termofixas) — top 12")
    for r in con.execute(f"""
        SELECT m.sh4, m.votos, m.mediana_lift, m.score,
               any_value(s.NO_SH4_POR)[:55] AS d
        FROM read_parquet('{OUT_CNAE}') m
        LEFT JOIN aux_ncm_sh s ON s.CO_SH4 = m.sh4
        WHERE m.cnae4 = '2032' AND m.fluxo = 'IMP'
        GROUP BY ALL ORDER BY m.score DESC LIMIT 12
    """).fetchall():
        print(f"  {r[0]}  votos {r[1]:>3}  lift~{r[2]:>5}  score {r[3]:>7}  {r[4]}")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    con = duckdb.connect(DB, read_only=True)
    exporta(con, SQL_PROD, OUT_PROD, "prod_insumo_stat.parquet")
    exporta(con, SQL_CNAE, OUT_CNAE, "cnae_sh4_stat.parquet")
    aceite(con)
    con.close()


if __name__ == "__main__":
    main()
