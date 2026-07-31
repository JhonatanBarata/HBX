# HBX Comex — motor de dados (N1)

Módulo NOVO e ISOLADO — não importa nada do backend, não escreve no Postgres do CRM.
Banco analítico próprio: `data/comex.duckdb` (DuckDB). Dado bruto em `data/raw/` (gitignored).

## Pipeline

| Passo | Script | O que faz |
|---|---|---|
| 1 | `download.sh` | Baixa bulk oficial Comex Stat (MDIC): auxiliares + fluxos `mun` (SH4×município×país, mensal) e `ncm` (NCM×UF×via×URF) 2024–2026. Idempotente (SKIP no que já existe). |
| 2 | `ingest.py` | Carrega tudo no `comex.duckdb`: `aux_*`, `flow_mun`, `flow_ncm`, `cadastro_empresas`/`cadastro_atual`. |
| 3 | `detective.py --sh4 4011` | O cruzamento: municípios que movimentam o SH4 hoje × lista oficial de empresas → candidatos nomeados com CNPJ + score. Sai em `data/out/`. |
| 4 | `enrich_vps.py --in data/out/candidatos_IMP_4011.csv` | Enriquece com a RFB 28M do VPS (situação, porte, telefone, e-mail, sócio, CNAE). SÓ LEITURA, via `scripts/vps-run.js`. |

## As fontes e suas pegadinhas

- **Comex Stat bulk** (`balanca.economia.gov.br/balanca/bd/…`): cadeia TLS incompleta (usar `-k` SÓ aqui);
  latin-1; separador `;`; CSV malformado no NCM.csv (polegadas `37"` soltas) → `strict_mode=false`.
  IMP tem `VL_FRETE`/`VL_SEGURO`; EXP não. Município é só SH4 (4 dígitos); NCM completo é só por UF.
- **Cadastro de empresas EXP/IMP** (CNPJ 14 dígitos + razão + endereço + município + CNAE):
  a SECEX **removeu a publicação em mar/2023** (Nota informativa — o próprio cruzamento
  lista×município reidentifica CNPJ, ou seja: o método do detetive é confirmado pelo governo).
  Resgatado do **Wayback Machine** (`web.archive.org/web/<ts>id_/http://www.mdic.gov.br/balanca/outras/EMPRESAS_CADASTRO_<ANO>.xlsx`),
  anos 2018/2019/2020 (~46k importadoras, ~28k exportadoras por ano). Anos 1997–2017 existem lá também.
  URLs de erro do servidor respondem **200 com página Joomla** — sempre sniffar o conteúdo.
- **RFB 28M**: `CnpjPublicCompany` no `hbx-postgres` do VPS (local dev tem 0 linhas).

## Aviso jurídico (pro dono decidir a embalagem, não o motor)

A SECEX matou a lista para impedir reidentificação de VALOR/PRODUTO por CNPJ.
O produto deve rotular como **"provável importador/exportador"** (inferência) e
**nunca** afirmar valor/volume POR EMPRESA — valores só agregados por município/UF.
Precedente de mercado: Logcomex/Datamyne vendem reconstrução equivalente abertamente.
