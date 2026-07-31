# -*- coding: utf-8 -*-
"""
HBX Comex — exporta do comex.duckdb as tabelas que a API NestJS consome, em
Parquet (data/parquet/). Parquet é formato estável entre versões — o binding
Node lê sem depender da versão de storage do DuckDB que o Python gravou.

Uso: python export_parquet.py   (rodar após ingest.py)
"""
import os

import duckdb

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "data", "comex.duckdb")
OUT = os.path.join(HERE, "data", "parquet")

TABLES = [
    "flow_mun",
    "flow_ncm",
    "cadastro_atual",
    "aux_ncm",
    "aux_ncm_sh",
    "aux_pais",
    "aux_uf_mun",
    "aux_via",
    "aux_urf",
]


def main():
    os.makedirs(OUT, exist_ok=True)
    con = duckdb.connect(DB, read_only=True)
    for table in TABLES:
        dest = os.path.join(OUT, f"{table}.parquet").replace("\\", "/")
        con.execute(f"COPY (SELECT * FROM {table}) TO '{dest}' (FORMAT PARQUET, COMPRESSION ZSTD)")
        size_mb = os.path.getsize(dest) / 1e6
        print(f"{table}.parquet  {size_mb:.1f} MB")
    con.close()
    print("OK ->", OUT)


if __name__ == "__main__":
    main()
