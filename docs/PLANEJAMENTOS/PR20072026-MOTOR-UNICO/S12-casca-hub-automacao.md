# S12 — Rota /automacao: hub por objetivo + painel de status

**Fase 3 · Worker: Sonnet · Depende de: S04 (overview) · Frontend**

## Objetivo
Nasce a casca única: `/automacao` com hub de entrada POR OBJETIVO (padrão Intercom/HubSpot) e o
painel único de status que o produto nunca teve. As telas velhas continuam no ar (redirect é S17).

## Arquivos
- CRIAR `frontend/src/app/(app)/automacao/page.tsx` (+ `page.client.tsx`)
- CRIAR `frontend/src/app/hbx-theme/automacao.css` (importar no lugar certo junto dos outros css de tela)
- EDITAR `frontend/src/components/hbx/shell.tsx` (adicionar nav id `automacaoHub` label "Automação",
  grupo Facilidades — SEM remover os 3 itens velhos ainda; gate OR descrito abaixo)
- (ícone: reusar `ICONS.automacao` — REGRA: nav id sem entrada em ICONS derruba a Sidebar)

## Tarefas
1. Estrutura da tela (desktop-first, mesma linguagem visual das telas irmãs — hero como
   `/automacoes` v2): **HERO** com identidade + chip do motor; **PAINEL DE STATUS** consumindo
   `GET /automation/overview`: 4 cartões-objetivo com estado real:
   - "Atender sozinho" (Atendente) — ligado/rascunho/aguardando suporte + cérebro atual
   - "Cobrar quem deve" (Cobrança) — live/preflight
   - "Buscar clientes" (Prospecção & Cadência) — plays ativos, leads dentro
   - "Reagir e abastecer" (Regras) — gatilhos/rotinas ativos
   Cada cartão: dot de status, 1 número-chave, CTA "Abrir". Preflight ruim (sem chip) → aviso no
   cartão, nunca 500 (overview é fail-soft).
2. Navegação interna por seção: cartão → `?secao=atendente|cobranca|prospeccao|regras` na MESMA
   rota (estado local; sem sub-rotas Next). Nesta sprint as seções renderizam placeholder mínimo
   "em migração" com link pra tela velha correspondente (S13-S16 preenchem).
3. Gate de visibilidade (decisão nº2 REVISADA pós-S03 — 3 chaves): item nav visível se
   `atendimento` OU `bot` OU `vendas` acessível (`useMyModules`); dentro, cartão de seção só aparece
   se o gate DAQUELA seção passa — atendente → `atendimento` OU `bot`; cobranca → `bot`/`atendimento`;
   prospeccao/regras → `vendas`. Fail-closed mantido (ver README decisão nº2 pro mapa completo).
4. CSS 100% token/classe central (5 Leis; `check-pele` verde). Sem hex, sem inline style além dos
   padrões já usados nas telas irmãs (gap/minWidth utilitários seguem o padrão existente).
5. Testar local (`npm run dev` frontend): tela abre com dados reais do overview, cartões refletem
   gates, console limpo.

## Critérios de aceite
- `/automacao` no ar com painel de status REAL (overview), 4 cartões com gates corretos.
- `cd frontend && npm run lint && npm run build` verdes. Telas velhas intocadas.

## DoD
Commit local: `feat(automation): S12 — casca /automacao com hub por objetivo + painel de status`
