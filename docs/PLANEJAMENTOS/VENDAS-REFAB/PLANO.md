# Refab Vendas + Leis de Distribuição (modelo CNPJ Biz sobre a base 28M)

> Ordem do dono 04/07. Objetivo: refazer **Regras**, **Front** e **Filtro** do Vendas +
> as **leis de distribuição**, respeitando a ÁRVORE. Workers implementam LOCAL (não publicam);
> o dono revisa o diff e publica.

## Invariante-mãe: a ÁRVORE (Master > Admin > Vendedor) — NÃO VIOLAR
1. **MASTER decide o que o ADMIN tem** — define a cota da empresa (X baixas). **Só o Master capa o Admin.**
2. **ADMIN decide TUDO da sua empresa** e **NUNCA é capado por regra de vendedor.** Puxa lead livre até a cota da empresa.
3. **Cada lead puxado da base 28M = 1 BAIXA** na cota da empresa (modelo crédito, estilo CNPJ Biz). A cota mensal da empresa (hoje "LEADS DO MÊS x/5.000") é o TETO real do admin.
4. **ADMIN decide quantas baixas cada VENDEDOR pode consumir** — teto por vendedor **opcional, default SEM teto**.
5. **VENDEDOR** consome dentro do teto que o admin deu. Território/segmento = **CERCA** (limita o que ele VÊ), nunca empurra/trava a empresa.
6. **Cota/valor/baixa só aparece pro ADMIN** (vendedor nunca vê — regra `docs/Rules/PAGAMENTOS.md`).

## A cagada que isso corrige
Hoje a busca do admin é travada pela contagem de cards do vendedor / empresa inteira:
`getVendasPendingCountForRadarContext` cai em `getPendingCount` (empresa toda) quando quem busca
NÃO é vendedor (admin/master) → `stopSearchRunIfVendasStockLimitReached` pausa quando
`pending ≥ "quantos puxar"`. Resultado: **20 cards da Gabriele travam a empresa inteira** e o admin
fica preso. ERRADO — admin não é capado por vendedor. O único teto do admin é a cota da empresa (Master).

## Nova regra dos MOTORES: LISTA + WEB, fusão (resposta do dono)
- **Motor 1 = a LISTA:** SELECT na base RFB 28M (`CnpjPublicCompany`) por CNAE / cidade / UF / porte / tem-site / tem-zap. Descoberta = SELECT instantâneo.
- **Motor 2 = WEB:** pesquisa/enriquece (contato, dono, zap, site).
- **Os dois JUNTAM** (fusão sourceChain). Web preenche o que falta na lista.

## Lixo catalogado ao vivo (remover/consertar)
- Dashboard **"Cards no funil 20"** = cards da empresa toda (Gabriele) exibidos como "meu funil" do admin → admin vê AGREGADO da empresa rotulado, nunca confundido com funil próprio.
- Dashboard **"Leads na base (Radar) 893"** → contagem real da base (28M+), não o pool antigo.
- Painel Buscar empresas **"Total no Brasil 6068"** → contagem real 28M.
- **"Canais Exigidos"** no filtro do motor → não existe na nova regra, remover.
- **"Ativar modo foco"** → sem sentido, remover.
- **Cota só pro admin** (esconder do vendedor).

## Sprints — 1 worker por sprint, SEQUENCIAL (dependência), não publica
- **S1 — Regras/Cota do Vendas (backend):** matar a trava pending-count no caminho admin/master; cota da empresa = único teto do admin; teto por vendedor opcional (default off); remover penalidade de inatividade que zera slots sozinha. Admin/master nunca capado por vendedor.
- **S2 — Leis de distribuição (backend):** território/segmento = cerca (o que o vendedor vê), admin aloca baixas por vendedor; distribuição respeita a árvore.
- **S3 — Filtro do Vendas = 28M + fusão (backend):** "Buscar empresas" vira SELECT sobre `CnpjPublicCompany` (CNAE/cidade/UF/porte/tem-site/tem-zap); motor lista+web fusão; counts reais.
- **S4 — Front Vendas + Dashboard (CNPJ Biz):** filtro estilo CNPJ Biz; consertar números/rótulos do Dashboard; remover Canais Exigidos / Modo foco / Total no Brasil falso; cota só admin.

## Checks por sprint
Backend: `cd backend && npm run build` + suíte tocada verde. Front: `check-pele.mjs` (Leis do Design System). NÃO publicar. Cada worker grava `S{n}-RESULTADO.md` nesta pasta.
