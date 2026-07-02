# CNPJ Biz — benchmark tela-a-tela (logado) + plano de paridade

> Recon 01/07/2026, conta real logada (app + site público). Não é plano de cópia: é mapa de
> onde eles ganham, onde o HBX já ganha, e a alavanca que fecha o gap com R$0 de dado.

## O que eles são
Mesma categoria do HBX: **base de empresas + filtros + CRM + automação WhatsApp/e-mail + IA**.
Não houve cópia de ninguém — é evolução convergente da fórmula que funciona em prospecção B2B BR.
A diferença estrutural: **a base deles é o dump aberto da Receita Federal ingerido inteiro**
(eles mesmos declaram no FAQ: "uma vez por mês atualizamos conforme os dados disponibilizados
pela Receita Federal"). 28,4M ativas / +60M total, 1.360 segmentos, 5.573 municípios.

## Tela-a-tela → equivalente HBX
| Tela deles | O que faz | HBX hoje |
|---|---|---|
| `/empresas` + página por CNPJ | SEO programático (milhões de páginas indexadas), contato mascarado → cadastro; AdSense | NÃO TEM (decisão: não competir agora, ver F4) |
| `/app/pesquisa-avancada` | Filtros: CNAE multi, natureza jurídica, situação, porte, MEI/Simples, matriz/filial, localização, **data de abertura com slider até "HOJE"**, opções de contato (só c/ celular, c/ email, combos), anti-contab (remove tel/email repetido, email c/ "contab"), "excluir já exportadas", pesquisas salvas + notificação | Radar tem busca por segmento+cidade; filtros cadastrais NÃO existem (fonte `cnpj_public` lê tabela com 8 linhas) |
| `/app/enrichment` | Cola CNPJs → planilha com dado CADASTRAL da Receita. 1 crédito/CNPJ. **Sem crawl, sem WhatsApp, sem sociais** | Enriquecimento HBX é mais fundo: crawl site (email/tel), WhatsApp-gate, QSA/dono, IA extração/score |
| `/appjs/*` CRM | Leads/Oportunidades/Atividades/Equipes/Relatórios, termômetro, pipeline kanban, landing pages | Cards Vendas/Atendimento + distribuição por vendedor (mais vertical, menos genérico) |
| WhatsApp + Assistente IA | Disparo em massa + IA SDR (ChatGPT, cobrado em crédito: GPT-4 Turbo 1 crédito ≈ 1.000 palavras) | Webwhats (Baileys) + bot IA local (qwen 7B) = **custo marginal zero** |
| `/app/api` | API de busca de empresas + API do CRM (chave Bearer) | Interno só |

## Preços reais deles (capturado logado)
- **Trial:** ~10 créditos. 1 crédito = 1 CNPJ exportado/processado ("respirei, acabou").
- **Avulso (não expira):** 100=R$50 (0,50/un) · 500=R$150 (0,30) · 1.000=R$240 (0,24) ·
  5.000=R$400 (0,08) · 10.000=R$500 (0,05) · 50.000=R$1.000 (0,02) · **150.000=R$2.250 (0,015)**.
- **Assinatura 500 créditos/mês (anual):** R$266/mês (~R$397 mensal cheio) → 1 usuário,
  1 conta WhatsApp, 3 automações, 25 créditos IA, CRM capado em 1.500 leads.
- Mercado: Speedio ~R$500+/mês, Econodata ~R$300+/mês. Reclame Aqui deles: 8.1, 356 reclamações,
  ~90% = LGPD "tira meu dado do site" (passivo do modelo de página pública).

## Onde cada um ganha
**Eles:** base completa RFB (cobertura), filtros cadastrais maduros, SEO = CAC ~zero, API.
**HBX:** dado VIVO (crawl, tel validado no WhatsApp — eles vendem tel cadastral frio, muitas
vezes do contador), IA local sem taxímetro, motor WhatsApp próprio, CRM vertical com entrega
(site/atendimento), sem modelo de crédito. **O dado deles nasce morto; o nosso nasce validado.**

---

## Plano

### F1 — ALAVANCA-MÃE: ingerir o dump da Receita (paridade de base, R$0 de dado)
A infra JÁ EXISTE e está vazia: tabela `CnpjPublicCompany` (schema.prisma:3148, índices
city/state/cnae/phone), importador `backend/scripts/import-cnpj-dataset.js` (já entende os
aliases do dump: `razao_social`, `ddd_telefone_1`, `correio_eletronico`...), fonte
`cnpj_public` no Radar lendo dela. Hoje: 8 linhas local / 16 VPS.

Worker (1 .md novo):
1. **Downloader**: dump mensal em dados.gov.br/Receita (layout/URL MUDOU jan/2026 — verificar
   no dia; mirror: dados-abertos-rf-cnpj.casadosdados.com.br). Zips: Empresas, Estabelecimentos,
   Sócios, Simples (10 partes cada, ~5-7GB zipado total).
2. **Conversor/join**: Estabelecimentos (endereço/tel/email/CNAE/situação) + Empresas
   (razão/porte) por cnpj-básico → JSONL no formato do importador. `--only-active` primeiro (~28M).
3. **Import em massa**: o script atual faz upsert em lote de 1000 via Prisma — em 28M linhas
   isso leva DIAS. Medir; provavelmente trocar por `COPY` em staging + merge SQL. `searchText`
   com LIKE em 28M precisa índice pg_trgm (GIN) ou matching restrito por cidade primeiro.
4. **Onde roda**: LOCAL (árvore final: VPS sem fábrica; VPS guarda+serve leads prontos).
   Estimar disco: ~25-35GB Postgres. VPS não recebe a base crua.

Ganhos imediatos: fonte `cnpj_public` (deep/night_factory) funciona de verdade; CNPJ-backfill
vira match LOCAL por nome+cidade+telefone (**libera o budget Brave** p/ descoberta site-less);
BrasilAPI (throttle 700ms) vira só gap-fill; o funil "Receita primeiro" do ARCSCRAPING.md
sai do papel; filtro "aberta na última semana" vira produto (lead quentíssimo).

### F1.5 — Sócios (dono direto, sem BrasilAPI)
`CnpjPublicCompany` não tem sócio; dono hoje só via BrasilAPI (`qsa`). Ingerir o arquivo
Sócios (tabela nova `CnpjPublicPartner` cnpjBasico→nome/qualificação) mata a dependência
externa do enriquecimento-de-dono para formalizados. (Depois de F1 estabilizar.)

### F2 — Produto: "lead validado" como diferencial de venda (já construído)
Não é código novo: é POSICIONAMENTO. Eles vendem CNPJ cru a R$0,015–0,50; o HBX entrega lead
com WhatsApp validado + site/sociais + dono + score. Argumento anti-crédito: "lá você paga pra
respirar; aqui o plano entrega lead pronto". Precificar por lead ENTREGUE/validado, nunca por export.

### F3 — Telas a roubar (barato, alto impacto no Owner/Master)
1. Bloco "filtros Receita" (CNAE, porte, natureza, MEI/Simples, data abertura c/ "hoje",
   situação) na árvore do Owner e no radar do vendedor — vira trivial com F1 no banco.
2. "Opções de contato" (só com celular / com email / com ambos) + anti-contab (remover
   tel/email duplicado na base, email contendo "contab") — regras SQL simples, valor enorme.
3. "Desconsiderar já entregues" (HBX já tem dedup por empresa/vendedor — expor como filtro).
4. Pesquisas salvas + notificação "lista pronta".

### F4 — SEO programático: NÃO agora (decisão consciente)
Competir com cnpj.biz/casadosdados no Google = guerra de meses, passivo LGPD (o Reclame Aqui
deles é 90% "remove meu dado"), e não é o canal do HBX (venda direta/vertical). Reavaliar só
se sobrar capacidade — e aí com páginas por nicho, não por CNPJ.

## Ordem e custo
F1 é a única com esforço real (downloader+conversor+import bulk) — e é 100% dado público
gratuito. F3 depende de F1. F2 é copy/pitch. Nada disso toca Webwhats/chips.

## Checks antes do worker F1
- [ ] URL/layout atual do dump (mudou jan/26)
- [ ] Disco livre local p/ ~40GB (zips + Postgres)
- [ ] Benchmark import: se upsert-1000 < ~5k linhas/s, trocar por COPY+staging
- [ ] Índice trgm p/ searchText OU matching sempre ancorado em normalizedCity
