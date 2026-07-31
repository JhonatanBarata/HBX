# -*- coding: utf-8 -*-
"""
HBX Comex — DOSSIÊ DE EMPRESA (demo comercial).

Dado o município/UF da empresa e uma lista de NCMs candidatos (do que ela
fabrica), monta o retrato do mercado dela: quanto o Brasil movimenta de cada
NCM, de onde vem, o preço médio USD/kg por origem, a tendência, o que o
município dela movimenta e quem mais no Brasil provavelmente compra o mesmo.

Uso:
  python demo_empresa.py --municipio "Rio Claro" --uf SP \
      --ncm 27101221,38112120,38112130,38241000,39094029 --out demo.json
"""
import argparse
import json
import os
import unicodedata

import duckdb

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "data", "comex.duckdb")


def sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


def ncm_bloco(con, ncm: str, fluxo: str) -> dict:
    desc = con.execute(
        "SELECT NO_NCM_POR FROM aux_ncm WHERE CO_NCM = ? LIMIT 1", [ncm]
    ).fetchone()
    tot = con.execute(f"""
        SELECT CAST(sum(VL_FOB) AS DOUBLE) AS fob, CAST(sum(KG_LIQUIDO) AS DOUBLE) AS kg,
               CASE WHEN sum(KG_LIQUIDO) > 0 THEN round(sum(VL_FOB)/sum(KG_LIQUIDO), 2) END AS usd_kg,
               count(DISTINCT CO_PAIS) AS paises
        FROM flow_ncm WHERE CO_NCM = ? AND fluxo = ?
    """, [ncm, fluxo]).fetchone()
    if not tot or not tot[0]:
        return {"ncm": ncm, "descricao": desc[0] if desc else None, "fluxo": fluxo, "semDado": True}

    origens = con.execute(f"""
        SELECT any_value(p.NO_PAIS) AS pais, any_value(p.CO_PAIS_ISOA3) AS iso3,
               CAST(sum(f.VL_FOB) AS DOUBLE) AS fob,
               round(100.0*sum(f.VL_FOB)/sum(sum(f.VL_FOB)) OVER (), 1) AS share,
               CASE WHEN sum(f.KG_LIQUIDO) > 0
                    THEN round(sum(f.VL_FOB)/sum(f.KG_LIQUIDO), 2) END AS usd_kg
        FROM flow_ncm f LEFT JOIN aux_pais p ON p.CO_PAIS = f.CO_PAIS
        WHERE f.CO_NCM = ? AND f.fluxo = ?
        GROUP BY f.CO_PAIS ORDER BY fob DESC LIMIT 8
    """, [ncm, fluxo]).fetchall()

    ufs = con.execute(f"""
        SELECT SG_UF_NCM AS uf, CAST(sum(VL_FOB) AS DOUBLE) AS fob,
               round(100.0*sum(VL_FOB)/sum(sum(VL_FOB)) OVER (), 1) AS share
        FROM flow_ncm WHERE CO_NCM = ? AND fluxo = ?
        GROUP BY 1 ORDER BY fob DESC LIMIT 6
    """, [ncm, fluxo]).fetchall()

    serie = con.execute(f"""
        SELECT CO_ANO AS ano, CAST(sum(VL_FOB) AS DOUBLE) AS fob
        FROM flow_ncm WHERE CO_NCM = ? AND fluxo = ? GROUP BY 1 ORDER BY 1
    """, [ncm, fluxo]).fetchall()

    return {
        "ncm": ncm,
        "descricao": desc[0] if desc else None,
        "fluxo": fluxo,
        "fobUsd": tot[0], "kg": tot[1], "usdPorKg": tot[2], "paises": tot[3],
        "origens": [dict(zip(("pais", "iso3", "fobUsd", "sharePct", "usdPorKg"), o)) for o in origens],
        "ufs": [dict(zip(("uf", "fobUsd", "sharePct"), u)) for u in ufs],
        "serieAnual": [dict(zip(("ano", "fobUsd"), s)) for s in serie],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--municipio", required=True)
    ap.add_argument("--uf", required=True)
    ap.add_argument("--ncm", required=True, help="lista separada por vírgula (8 dígitos)")
    ap.add_argument("--out", default="demo.json")
    args = ap.parse_args()

    con = duckdb.connect(DB, read_only=True)
    con.create_function("py_sem_acento", sem_acento, ["VARCHAR"], "VARCHAR")

    ncms = [n.strip() for n in args.ncm.split(",") if n.strip()]
    dossie = {
        "empresa": {"municipio": args.municipio, "uf": args.uf},
        "ncms": {"IMP": [], "EXP": []},
    }
    for ncm in ncms:
        for fluxo in ("IMP", "EXP"):
            dossie["ncms"][fluxo].append(ncm_bloco(con, ncm, fluxo))

    # O que o MUNICÍPIO da empresa movimenta (SH4) — mostra o entorno logístico.
    for fluxo in ("IMP", "EXP"):
        rows = con.execute(f"""
            SELECT m.SH4 AS sh4, any_value(s.NO_SH4_POR) AS descricao,
                   CAST(sum(m.VL_FOB) AS DOUBLE) AS fob,
                   CASE WHEN sum(m.KG_LIQUIDO) > 0
                        THEN round(sum(m.VL_FOB)/sum(m.KG_LIQUIDO), 2) END AS usd_kg
            FROM flow_mun m
            LEFT JOIN aux_uf_mun u ON u.CO_MUN_GEO = m.CO_MUN
            LEFT JOIN (SELECT DISTINCT CO_SH4, NO_SH4_POR FROM aux_ncm_sh) s ON s.CO_SH4 = m.SH4
            WHERE upper(strip_accents(u.NO_MUN_MIN)) = upper(?) AND m.SG_UF_MUN = ?
              AND m.fluxo = ?
            GROUP BY m.SH4 ORDER BY fob DESC LIMIT 12
        """, [sem_acento(args.municipio).upper(), args.uf, fluxo]).fetchall()
        dossie.setdefault("municipio", {})[fluxo] = [
            dict(zip(("sh4", "descricao", "fobUsd", "usdPorKg"), r)) for r in rows
        ]

    with open(os.path.join(HERE, "data", "out", args.out), "w", encoding="utf-8") as f:
        json.dump(dossie, f, ensure_ascii=False, indent=1)
    print("OK ->", args.out)

    for fluxo in ("IMP", "EXP"):
        print(f"\n== {fluxo}")
        for b in dossie["ncms"][fluxo]:
            if b.get("semDado"):
                print(f"  {b['ncm']}  SEM FLUXO  {str(b.get('descricao'))[:50]}")
            else:
                print(f"  {b['ncm']}  US$ {b['fobUsd']/1e6:.1f} mi  {b['usdPorKg']}/kg  "
                      f"{b['paises']} paises  {str(b['descricao'])[:45]}")
        print(f"  -- municipio top: " + ", ".join(
            f"{r['sh4']}({r['fobUsd']/1e6:.0f}mi)" for r in dossie["municipio"][fluxo][:6]))


if __name__ == "__main__":
    main()
