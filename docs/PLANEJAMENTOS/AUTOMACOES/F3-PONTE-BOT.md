# F3 — Ponte visível Bot ↔ Automações

**Orquestração:** Opus planeja, 1 worker Sonnet edita este .md. Só FRONTEND, só visual/navegação.
**Contexto (pergunta do dono):** "faz sentido ele ser junto com os bots... já é pra juntar com o
BOT não é?". No backend a junção JÁ existe (o passo WhatsApp da cadência sai pelo MESMO motor do bot
de prospecção — `queueOutboundForCompany`, `sourceModule 'vendas_prospeccao_bot'`, teto de chip). O que
falta é tornar isso VISÍVEL: hoje `/automacoes` e `/bot` parecem dois mundos. F3 é só percepção — custo
baixo, zero risco (nenhum disparo novo, nenhuma regra de chip tocada).

## Objetivo
Deixar claro na UI que Automações e Bot são o mesmo braço de WhatsApp, e criar atalho cruzado.

## Escopo (3 toques pequenos, TODOS em classe central / tokens — 5 Leis, `check-pele` não pode subir)
1. **Card de cadência (`/automacoes`, aba Cadências) — nota de origem do WhatsApp.**
   Em `frontend/src/app/(app)/automacoes/page.client.tsx`, no `persona-card`, quando a cadência tem
   passo `whats` (`c.passos.some(p => p.canal==='whats')`), mostrar uma linha discreta tipo
   "WhatsApp sai pelo seu chip do Bot" com link pra `/bot`. Reusar `.auto-flag-note` (classe já
   existente, compartilhada com /assistente) OU uma linha `.hint` com `<a className="link" href="/bot">`.
   Texto curto, 1 linha. NÃO inventar textão.
2. **Barra da aba Cadências — atalho pro Bot.**
   Ao lado da frase-guia (`.auto-bar`), um `btn-ghost` "Abrir o Bot" → `/bot` (usar `ICONS.bot`).
   Só um link de navegação, sem estado.
3. **Tela `/bot` — atalho de volta pra Automações.**
   Em `frontend/src/app/(app)/bot/page.client.tsx`, achar o header/topo do painel e adicionar um
   `btn-ghost` discreto "Ver Automações" → `/automacoes` (`ICONS.automacao`). Colocar perto do título,
   sem quebrar o layout existente do pino/chaves. Se não houver lugar limpo, pôr uma linha `.hint`
   com link. Mínimo invasivo — NÃO refatorar a tela do Bot.

## Regras de design (duras)
- ZERO hex/cor/estilo visual solto novo. Se precisar de um respiro, usar `style` só de LAYOUT
  (display/gap/margin) — nunca cor/borda/sombra. Cor vem de `.link`/`.btn-ghost`/tokens.
- `frontend/scripts/check-pele.mjs`: a contagem de inline-visual NÃO pode subir. Preferir classes
  existentes (`.auto-flag-note`, `.hint`, `.auto-bar`, `.btn-ghost`, `.link`). Se criar classe nova,
  ela vai em `frontend/src/app/hbx-theme/screens.css` (seção WORM-13), não inline.
- Navegação: usar o mesmo padrão de link das outras telas (href direto `/bot` `/automacoes` funciona
  — a casca intercepta). Não importar router novo se um `<a>`/`.link` resolve.

## Gates
- `cd frontend && npx tsc --noEmit` verde + `node ./scripts/check-pele.mjs` (contagem NÃO sobe).
- Provar no Chrome desktop (localhost:3001, login teste): abrir `/automacoes` → ver a nota + atalho;
  clicar → cai em `/bot`; do `/bot` clicar "Ver Automações" → volta. Console limpo.
- NÃO publicar. NÃO tocar backend.

## Fora de escopo (é F4, precisa go do dono)
Gatilho acionar o bot numa conversa; qualquer disparo novo de WhatsApp. F3 é SÓ link/rótulo.
