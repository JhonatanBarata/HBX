# PR15062026005 — CAÇA: Radar + Leads viram 1 tela (#5)

> O item FORTE da noite ("a vendedora tem que começar a trabalhar"). Brainstorm fechado;
> recomendações já baked pras 3 decisões — confirmar a direção no início da sessão e aplicar.
> Reaproveita o que JÁ existe: `pull-to-vendas`, `puxar-leads-panel.tsx`, `minha-preferencia-panel.tsx`,
> lagoa compartilhada (ownerCompanyId/recircula). Ver memórias radar-pull-pipeline + radar-compartilhado.

## O problema
Radar e Leads são a MESMA coisa quebrada em duas: "ver a lagoa" e "puxar da lagoa" são o
mesmo ato (caçar). A "Base de leads" vazia é o sintoma. Separar confunde a vendedora.

## A direção (2 telas, não 1)
- 🏹 **CAÇA** (Radar+Leads viram 1): achar E pegar no mesmo lugar.
  - Topo: **Minha preferência** + **Puxar leads** (massa por filtro) — igual ao que existe.
  - Embaixo: **carrossel da lagoa** (cards), cada card com botão **"Puxar"** → cai na
    carteira em Vendas e revela o contato.
  - **Some a "Base de leads"** — o que puxou já vive no Vendas; nada de 3ª lista no meio.
- 💼 **VENDAS**: fica igual, a bancada — trabalha e fecha.
- **Sidebar:** "Radar" + "Leads" viram **uma entrada só**.
- Por que não 1 tela só: misturar caçar e trabalhar o funil vira bagunça; o pipeline
  precisa respirar. Caça | Vendas = encher a carteira | fechar.

## Decisões TRAVADAS pelo dono (15/06)
1. **Nome da tela:** **"Radar"** ✅ (sidebar: uma entrada só; some "Leads").
2. **Endpoint "puxar ESTE card" (1 card):** **CRIAR.** ✅ O de massa (`POST
   /webscraping/radar/pull-to-vendas`) já existe; o de 1-card é rapidinho (mesma lógica,
   1 id). Reusa reveal-on-pull (assignedUserId) e a posse da lagoa.
3. **Distribuição + regra automática (admin):** viram **seção só-do-admin** dentro da Caça
   (vendedor não vê). Hoje moram no Leads. Não some — muda de lugar e ganha gate de role.

## Build (front-pesado + 1 endpoint; SERIAL com a Fase C? não — é independente da cobrança)
1. **Backend:** `POST /webscraping/radar/pull-card/:id` (ou body `{cardId}`) — puxa 1 card
   pra carteira do vendedor logado, revela contato, respeita posse/recircula/negativados.
   Reusa o serviço do pull em massa. Migration: nenhuma. Teste direcionado.
2. **Front:** tela **Caça** = `minha-preferencia-panel` + `puxar-leads-panel` (topo) +
   carrossel da lagoa (cards com botão Puxar) + seção admin (distribuição/regra) gated.
   Deletar a tela/rota de "Base de leads". Sidebar: fundir as 2 entradas em 1.
   5 Leis: visual só por token/classe central; mesmo DOM em qualquer tema; check-pele.
3. **Aba na URL** (regra geral use-tab-param): seção da Caça vive na URL, não em useState.

## Done
- Vendedor entra na Caça, vê a lagoa, clica Puxar num card → lead aparece em Vendas
  atribuído a ele, contato revelado, e o card sai da lagoa dele. Sem "Base de leads".
- Admin vê a seção de distribuição/regra; vendedor não.
- Lint+catraca+build verdes; mobile (375px) não quebra (Fase F confirma).

## Riscos
- Não quebrar o `pull-to-vendas` em massa que já roda. O de 1-card é ADITIVO.
- Não apagar histórico/posse da lagoa ao remover a "Base de leads" — é só tela, o dado
  fica no Vendas + estados da lagoa (radar-compartilhado).
