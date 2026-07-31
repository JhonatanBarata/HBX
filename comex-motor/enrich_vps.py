# -*- coding: utf-8 -*-
"""
HBX Comex — N1 fase 2: enriquece os candidatos do detective.py com a RFB 28M do VPS
(tabela CnpjPublicCompany, Postgres em hbx-postgres). SÓ LEITURA.

Pega o CSV de candidatos, consulta situação/porte/contato/sócio por CNPJ via
scripts/vps-run.js (ponte SSH já existente) e grava candidatos_enriquecidos.

Uso: python enrich_vps.py --in data/out/candidatos_IMP_4011.csv
"""
import argparse
import csv
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)


def run_vps_sql(sql: str) -> list[dict]:
    cmd = (
        "docker exec hbx-postgres psql -U "
        "$(docker exec hbx-postgres printenv POSTGRES_USER) "
        "-d $(docker exec hbx-backend printenv DATABASE_URL | sed -E 's|.*/([^?]+).*|\\1|') "
        f"-tA -c \"{sql}\""
    )
    out = subprocess.run(
        ["node", os.path.join(REPO, "scripts", "vps-run.js"), cmd],
        capture_output=True, text=True, encoding="utf-8", cwd=REPO, timeout=180,
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr[:2000])
    rows = []
    for line in out.stdout.splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    args = ap.parse_args()

    with open(args.inp, encoding="utf-8-sig") as f:
        candidatos = list(csv.DictReader(f))
    cnpjs = [c["cnpj"] for c in candidatos if c.get("cnpj")]
    if not cnpjs:
        print("nenhum cnpj no arquivo"); return 1

    in_list = ",".join(f"'{c}'" for c in cnpjs)
    sql = (
        "SELECT row_to_json(t) FROM ("
        "SELECT cnpj, situacao, porte, phone, phone2, email, website, "
        "\\\"ownerName\\\" AS owner, \\\"cnaeDescription\\\" AS cnae_desc "
        f"FROM \\\"CnpjPublicCompany\\\" WHERE cnpj IN ({in_list})"
        ") t"
    )
    rfb = {r["cnpj"]: r for r in run_vps_sql(sql)}
    print(f"RFB devolveu {len(rfb)} de {len(cnpjs)} CNPJs")

    for c in candidatos:
        r = rfb.get(c["cnpj"], {})
        c.update({
            "rfb_situacao": r.get("situacao", "nao_encontrado"),
            "rfb_porte": r.get("porte") or "",
            "rfb_telefone": r.get("phone") or r.get("phone2") or "",
            "rfb_email": r.get("email") or "",
            "rfb_site": r.get("website") or "",
            "rfb_socio": r.get("owner") or "",
            "rfb_cnae_desc": r.get("cnae_desc") or "",
        })

    out_path = args.inp.replace(".csv", "_enriquecido.csv")
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(candidatos[0].keys()))
        w.writeheader()
        w.writerows(candidatos)
    print("OK ->", out_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
