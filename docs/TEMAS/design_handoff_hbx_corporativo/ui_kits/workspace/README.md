# UI Kit — HBX Workspace (in-app)

A high-fidelity recreation of the HBX System **in-app workspace** in the default light glass
theme (palette + chrome from `frontend/src/lib/theme-palettes.ts` and `globals.css`).

- **`index.html`** — an interactive workspace shell:
  - **Nav rail** (260px glass) with the brand lockup, operation sections (Início, Esteira de
    leads, Atendimento, Recovery, Cadastros — using the real radar SVG icons) and the user chip.
    Click to switch views; the active item gets the brand-tinted pill.
  - **Top bar** — floating glass header with a "WhatsApp conectado" status pill and the
    Importar / Novo lead actions.
  - **Início (dashboard)** — workspace hero, a 4-up KPI row (mono tabular values), the **esteira
    mobile** lead queue (hot leads get the mint "próxima melhor ação" CTA → fires a toast), and
    a **Recovery** régua panel.
  - **Atendimento (inbox)** — a real WhatsApp-style inbox: conversation list with avatars,
    presence dots and unread badges, a chat thread (inbound/outbound/system bubbles), and a
    working composer (type + Enter or **Enviar** to append a message).

## Notes
- Self-contained: built with React (inline JSX via Babel) and styled entirely with the
  design-system tokens from `styles.css`. It mirrors the documented primitives
  (`Button`, `Card`, `StatCard`, `LeadCard`, `ChatBubble`, `Avatar`, `StatusDot`) — consuming
  projects should compose those from `window.<Namespace>` instead of re-deriving them here.
- Secondary rail items (Leads/Recovery/Cadastros) reuse the dashboard as a stand-in rather than
  inventing screens that don't exist in the source.
