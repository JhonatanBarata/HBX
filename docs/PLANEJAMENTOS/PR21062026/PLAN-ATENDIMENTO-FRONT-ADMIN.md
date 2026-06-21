# PLAN — Atendimento: front do admin (filtro por vendedor + organizar o topo)

> Frontend only. O backend já manda tudo (`/inbox/whatsapp-session` → `sessions:[{id,sellerName,phone}]`;
> cada conversa tem `whatsappConnectionSessionId`). Irmão do [PLAN-WHATSAPP-FASE-B](PLAN-WHATSAPP-FASE-B-VISAO-EMPRESA.md)
> (aquele é o modelo/escopo no backend; este é só a TELA do admin).

## Context / dor
O admin vê o Atendimento agregado = conversas de TODOS os vendedores **misturadas**. Difícil saber/escolher
de qual vendedor é cada chat. O dono quer um **filtro simples por vendedor** ("ver só os chats do vendedor X"),
**não** um rótulo em cada chat (o "Vendedor: X" no cabeçalho foi adicionado e **removido** a pedido dele).
E tem **redundância**: 2 controles pra o filtro de fila — o **ícone de funil** + o botão **"Todas as filas ▾"**
fazem a mesma coisa = "duas coisas vivas pra mesma função" (proibido, regra Sem-legado).

## O que fazer
1. **Filtro por vendedor (o pedido principal):** um **dropdown único** no topo da lista — `Vendedor: Todos ▾` —
   visível só na visão de empresa (admin/gerente, `waMode==='company'`) com mais de um número. Escolher um
   vendedor → mostra só as conversas daquele número (a base já existe: estado `numberFilter` + filtro client-side
   por `whatsappConnectionSessionId`). Hoje são "chips" soltos (`num-filter-row`); virar **dropdown** (mais limpo).
   Mostra **nome** do vendedor; sem nome, o **número cheio**.
2. **Matar a redundância da fila:** manter **UM** controle de fila (o dropdown com label) e **remover o ícone-funil
   solto** — ou enfiar o ícone DENTRO do dropdown. Um controle por função.
3. **Topo limpo:** Fila e Vendedor como dois filtros irmãos, alinhados, sem poluir.

## Decisões a confirmar (antes de aplicar)
- Filtro de vendedor = **dropdown** `Vendedor: Todos ▾` (proposto, mais limpo) **ou** manter os chips melhorados?
- Fila + Vendedor = **dois dropdowns lado a lado** ou **um só "Filtrar"** que abre os dois?
- **Lembrar** o vendedor filtrado ao recarregar a página, ou zera?

## Não fazer
- Não voltar o rótulo "Vendedor: X" no cabeçalho do chat (removido — o dono não quer).
- Backend intocado.

## Arquivos
- `frontend/src/app/(app)/atendimento/page.client.tsx` (topo da lista: `FILAS`/`filaOpen` da fila + `showNumberFilter`/`numberFilter` do vendedor).
- `frontend/src/app/hbx-theme/kit.css` (classe do dropdown, se precisar — sem hex).

## Checks
- `cd frontend && npm run lint && npm run build`.

## Já feito nesta rodada (pendente publicar)
- Removido o cabeçalho "Vendedor: X" do chat.
- Removido `frontend/public/Plano-Vivi-Rigatto.pdf` (era favor pra prima do dono).
- **Não republicado ainda** — sobe junto com o filtro novo (ou antes, se o dono quiser limpar a prod já).
