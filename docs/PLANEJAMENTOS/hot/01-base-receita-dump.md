# HOT-01 — Base Receita completa (o alicerce de tudo)

**Tela deles:** Pesquisa Avançada mostra "Há 4.717 empresas com os seguintes filtros" em segundos,
sobre +60M de CNPJs (28,4M ativas). O segredo não é tela: é a base inteira da RFB dentro do banco.
**Ler antes:** `docs/Rules/BACKEND.md` + `docs/Rules/MOTOR.md`. Visão: `PR01072026/40-cnpjbiz-paridade.md`.

## O que o HBX já tem (comprovado 01/07)
- Tabela `CnpjPublicCompany` (schema.prisma:3148) c/ índices `[normalizedCity,state]`, `[state,cnae]`, `[phoneDigits]` — **8 linhas local / 16 VPS**.
- Importador `backend/scripts/import-cnpj-dataset.js` que JÁ entende aliases do dump (`razao_social`, `ddd_telefone_1`, `correio_eletronico`, `data_inicio_atividade`...), JSONL/CSV, `--only-active`.
- Fonte `cnpj_public` no Radar (01-search) lendo a tabela; L4 BrasilAPI como gap-fill.

## O que o teste de enriquecimento do dono (01/07) provou que a base entrega
CNPJ, situação, razão, fantasia, e-mail, data abertura, **capital social**, MEI, porte, endereço completo,
**telefones + tipo**, **sócios (QSA)**, CNAE principal+secundárias, **regime tributário (Lucro Real)**, Simples.
Tudo isso existe nos dados abertos da RFB — de graça.

## Plano (worker backend/dados — pode rodar em background à noite)
1. **Downloader** `backend/scripts/rfb-download.js`: baixa o dump mensal.
   Fonte oficial: dados.gov.br "Cadastro Nacional da Pessoa Jurídica — CNPJ" (layout/URL MUDOU jan/26 — resolver no dia).
   Mirror confiável: `dados-abertos-rf-cnpj.casadosdados.com.br`. Arquivos: Empresas*.zip, Estabelecimentos*.zip,
   Socios*.zip, Simples.zip, Cnaes.zip, Municipios.zip (10 partes as grandes; ~5-7GB zipado).
   Retomável (por arquivo), checksum de tamanho, roda com `--month 2026-06`.
2. **Conversor** `backend/scripts/rfb-convert.js`: junta por cnpj-básico (8 dígitos):
   Estabelecimentos (endereço/DDD+tel 1-2/email/CNAE/situação/data abertura/matriz-filial/município-código)
   + Empresas (razão social/porte/**capital social**/natureza jurídica) + Simples (opção Simples/MEI)
   + Municipios (código→nome). Emite JSONL no formato do importador. `--only-active` default.
   Regime tributário (Lucro Real/Presumido/Arbitrado) é dataset separado da RFB — fase 2 do conversor.
3. **Import BULK**: o script atual (upsert lote 1000 via Prisma) NÃO escala p/ 28M (dias).
   Trocar: `COPY` p/ tabela staging + `INSERT ... ON CONFLICT (cnpj) DO UPDATE` em SQL puro,
   ou `createMany({skipDuplicates})` em transações grandes. Meta: importar 28M em horas, não dias.
   Benchmark com 100k linhas ANTES de rodar o total.
4. **Colunas novas** (migration aditiva) em `CnpjPublicCompany`: `capitalSocial Decimal?`,
   `naturezaJuridica String?`, `simples Boolean?`, `mei Boolean?`, `regimeTributario String?`,
   `phone2 String?`, `cnaeSecundarias String?` (csv de códigos). NÃO mexer nas existentes.
5. **Sócios**: tabela nova `CnpjPublicPartner { id, cnpjBasico, nome, qualificacao, entrada }`
   + índice `[cnpjBasico]`. Mata a dependência BrasilAPI p/ "dono" de empresa formalizada.
6. **searchText/matching em 28M**: LIKE puro morre. Índice `pg_trgm` GIN em `searchText`
   OU regra: matching SEMPRE ancorado em `normalizedCity` primeiro (índice já existe) e trgm só no recorte.
7. **Onde roda:** LOCAL (árvore final: VPS sem fábrica; VPS guarda+serve leads prontos).
   VPS NÃO recebe os 28M. Checar disco local (~40GB livres: zips+staging+tabela).
8. **Atualização mensal:** job manual no Owner (`Atualizar base Receita`) — baixa dump novo,
   reimporta com upsert (update preenche vazios, não sobrescreve enriquecido). Diff mensal
   alimenta HOT-07 (recém-abertas).

## Efeito cascata (por que é o #1)
- `cnpj_public` vira fonte REAL (deep/night_factory param de moer vazio em cidade esgotada — dá estoque infinito limpo).
- CNPJ-backfill do enrichment vira match LOCAL (nome+cidade+telefone) → **libera o budget Brave inteiro** p/ descoberta site-less.
- BrasilAPI (throttle 700ms) vira exceção, não regra.
- HOT-02/03/04/07 e metade do worm dependem só disto.
- Funil ARCSCRAPING ("Receita primeiro, web depois") sai do papel.

## Aceite
- [ ] `CnpjPublicCompany` com ≥25M ativas locais; consulta por cidade+CNAE < 1s
- [ ] `CnpjPublicPartner` populada; sócio aparece no lookup local
- [ ] Fonte `cnpj_public` servindo leads reais numa busca de teste (barbearia + cidade média)
- [ ] Typecheck verde; deletar este .md
