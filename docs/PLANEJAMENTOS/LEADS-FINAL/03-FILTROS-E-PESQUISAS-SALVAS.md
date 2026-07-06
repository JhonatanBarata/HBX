# 03 — Gaveta de filtros + contagem grátis + pesquisas salvas

## Objetivo
Busca simples continua o default ("acha o que quer e boa"). Botão **Filtros** abre gaveta
(`.hbx-drawer`) com os **6 filtros que importam** sobre a base RFB 28M + **contagem
grátis** ("1.243 empresas batem") + **pesquisas salvas**. Disclosure progressivo — o
oposto do formulário-monstro do Biz (1.300 CNAEs num listbox).

## Por quê ($)
Filtro é o que vende crédito: cada refinamento = lead mais certeiro = crédito percebido
como mais valioso. Contagem grátis é o teaser que converte. Pesquisa salva é retenção e a
ponte pro standing order (recompra automática). O filtro-rei do segmento é **"tem
contato"** — muda o valor do lead na hora.

## Estado atual
- Fonte: `cnpj_public` (RFB 28M na VPS) via providers em
  `backend/src/webscraping/radar/providers/cnpj-public/` (SELECT com fix de empate
  `updatedAt` publicado `110f7c41`). A vitrine já filtra por termo/cidade — mapear
  exatamente quais colunas o provider expõe hoje ANTES de definir o contrato.
- Busca atual: barra de comando horizontal do redesign 05/07 (`4f9d3df3`) em
  [leads/page.client.tsx](../../frontend/src/app/(app)/leads/page.client.tsx).
- Gaveta pronta no kit: `.hbx-veil`/`.hbx-drawer` (kit.css). Chips de filtro com "um
  ativo por vez" (ex.: faixa de data) usam glass pill; multi-select não obriga.
- Atenção paralelo: memória registra L1-L4 "standing-order" no working tree de outra
  frente (vendas-radar 04/07) — **conferir origin/master + tree antes** de criar nada
  parecido; pesquisas salvas v1 NÃO implementa standing order, só deixa o gancho.

## Desenho

### Filtros v1 (só os 6; capital social, natureza jurídica, bairro/CEP = v2 explícito)
1. **CNAE** — busca por texto/prefixo com autocomplete (nunca listbox gigante).
2. **UF / cidade** — autocomplete sobre municípios da base.
3. **Porte** — MEI / ME / EPP / demais (chips multi).
4. **Situação cadastral** — default Ativa (chip).
5. **Data de abertura** — faixas prontas (30d / 6m / 1a / 5a+ / todas).
6. **Contato** — tem telefone / tem e-mail / ambos (sobre o que a BASE tem; contato de
   enriquecimento pago NÃO entra como filtro grátis).

### Backend
- Estender o contrato de busca da vitrine com os filtros acima (validação server-side,
  whitelist de colunas — filtro é input do usuário).
- **Endpoint de contagem**: `POST .../radar/count` → `SELECT count(*)` com os mesmos
  filtros. Grátis, **rate-limited** (ex.: 30/min por empresa) — contagem também é oráculo
  pra scraper. Nunca devolver amostra com contato junto da contagem.
- Índices: conferir plano de execução do count nos filtros combinados (CNAE+UF+porte);
  criar índice composto se precisar. Base é grande — count não pode derrubar o Postgres
  da VPS (EXPLAIN antes, LIMIT de custo se necessário: acima de N, mostrar "10.000+").
- **Pesquisas salvas**: tabela `saved_search` (id, companyId, userId, name, filtersJson,
  createdAt, lastUsedAt) + CRUD. Escopo: por usuário, visível pro admin da empresa.

### Front
- Gaveta com os 6 blocos + rodapé fixo: contagem ao vivo (debounced) + "Aplicar".
- Filtros ativos viram chips removíveis na barra de comando (estado na URL — filtro
  compartilhável por link).
- "Minhas pesquisas" = dropdown na barra: salvar atual, aplicar, renomear, excluir.

## Passos
1. Mapear colunas/índices reais do `cnpj_public` (provider + schema Prisma).
2. Contrato de filtros + validação + count endpoint + rate limit + testes.
3. `saved_search` (migration + CRUD + guard company/user).
4. Gaveta + chips + URL-state + dropdown de salvas.
5. EXPLAIN dos counts nas combinações quentes; índice se precisar.

## Riscos / guardrails
- **Migration na VPS**: lembrar "build verde ≠ boot ok" — conferir `docker ps` + logs
  após publish (lição 04/07). Migration aplicada no boot.
- Count caro em filtro largo (ex.: só "Ativa"): usar estimativa/`10.000+` acima de teto —
  número exato só quando o filtro estreita.
- Não vazar contato no payload de contagem/preview (plano 04 audita; aqui já nasce certo).
- Filtro "tem contato" honesto: se a coluna da base for fraca (telefone RFB desatualizado),
  o card continua mostrando sourceChain honesto — filtro não promete enriquecimento.

## Checks / DoD
- Testes do contrato de filtro (whitelist, injection, rate limit).
- Chrome: filtrar CNAE+cidade+porte → contagem aparece → aplicar → prateleira reflete →
  salvar pesquisa → reaplicar do dropdown → chips removem um a um.
- Count p95 < 2s nas combinações quentes na VPS; zero 5xx no boot pós-migration.
