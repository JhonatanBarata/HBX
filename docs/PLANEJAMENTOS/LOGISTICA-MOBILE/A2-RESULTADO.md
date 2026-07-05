# A2 — Tab bar do app `/entrega` (RESULTADO)

Sprint **A2** do plano `PLANO-APPIFICACAO.md`: o app de entrega ganhou a SUA barra de
abas inferior (skin entrega), independente da `MobileTabBar` do dashboard.

## A tab bar
- **Componente:** `frontend/src/app/entrega/EntregaTabBar.tsx` (`"use client"`).
  4 abas fixas, ícone + label, alvo `>= var(--ent-tap)` (52px):
  **Rota (`/entrega`) · Clientes (`/entrega/clientes`) · Produtos (`/entrega/produtos`) · Ajustes (`/entrega/ajustes`)**.
- **Ativo pelo pathname:** "Rota" acende só em `/entrega` exato; as demais quando o
  pathname bate a seção (`=== href` ou `startsWith(href + "/")`, cobre subrotas futuras).
- **Fixa no rodapé** com `position: fixed` + safe-area (`--ent-safe-bottom`), `max-width: 560px`
  centralizada (igual `.ent-app`). Item ativo = cor da marca + fundo `--ent-brand-soft`.
- **Classes novas em `entrega.css`:** `.ent-tabbar`, `.ent-tab`, `.ent-tab.is-on`,
  `.ent-tab-label`, `.ent-app.has-tabbar` (padding-bottom reserva a altura da barra).
  Var nova `--ent-tabbar-h: 64px`. Zero hex/inline (só tokens `--ent-*`).
- **Não cobre conteúdo:** `.ent-app.has-tabbar` recebe `padding-bottom` = altura da barra +
  safe-area; a `.ent-actionbar` sticky (Iniciar rota / Cheguei) foi elevada para ficar ACIMA
  da barra quando ela existe.

## Ícones novos (`icons.tsx`)
`clientes`, `produtos`, `ajustes` (SVG inline, `currentColor`). "route" reusado pela aba Rota.

## Rotas novas (cascas)
Cada uma = `page.tsx` (server, fino) + `page.client.tsx` (delega ao scaffold):
- `entrega/clientes/` — "Nenhum cliente ainda"
- `entrega/produtos/` — "Nenhum produto ainda"
- `entrega/ajustes/` — "Nada para ajustar ainda"

Casca compartilhada: `frontend/src/app/entrega/EntregaScaffold.tsx` (header do skin + estado
vazio honesto + tab bar + auth reusada — sem token → `/login`). A3/A4 trocam o miolo (children).

## Home = aba Rota
`entrega/page.client.tsx`: adicionado `<EntregaTabBar />` e classe `has-tabbar`. Onboarding
do 1º acesso (retorno antecipado) fica SEM barra — intacto. Wake-lock / geofence / offline / sheet
de chegada não foram tocados.

## Checks (todos verdes)
- `npm run build` → **exit 0**; as 4 rotas compilam (`/entrega`, `/entrega/clientes`,
  `/entrega/produtos`, `/entrega/ajustes` no output do build).
- `npx tsc --noEmit` → **exit 0**.
- `check-pele` → **0 violação nos arquivos do A2**. (O script reprova por violações
  PRÉ-EXISTENTES em `whatsapp.css`/`screens.css`/`bot-builder.css` — commitadas no HEAD,
  não tocadas por mim; nenhuma nos meus arquivos.)
- Navegação verificada no dev server (`:3001`): as 4 rotas → HTTP 200; a tab bar e os 4
  labels renderizam; exatamente 1 aba `is-on` por rota, batendo o pathname.
