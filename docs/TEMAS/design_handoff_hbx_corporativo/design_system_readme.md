# HBX System — Design System

A design system for **HBX System** (`hbxsystem.com.br`), a Brazilian (pt-BR) B2B SaaS
that helps salespeople and companies stop revenue from leaking out of WhatsApp. It bundles
four jobs into one workspace:

- **HBX Leads / Radar** — local lead generation and enrichment (CNPJ, channels, confidence score).
- **HBX List** — turn cold territory into a usable commercial list by segment + city.
- **Esteira Mobile** — a mobile sales pipeline: list → prioritized lead → WhatsApp outreach → next action.
- **HBX Recovery** — a WhatsApp "régua" to chase overdue payments, reactivate lost customers and never drop a follow-up.
- **Atendimento** — organized, partly-automated (bot) customer service inbox.

Two audiences enter through different doors: **vendedor** (salesperson, instant entry) and
**empresa** (company, by consultative onboarding).

## Source

This system was reverse-engineered from the product's own frontend (Next.js 16 + React 19 +
Tailwind v4):

- **GitHub:** https://github.com/JhonatanBarata/HBX — see `frontend/` (the web app).
  - Color/typography source of truth: `frontend/src/lib/theme-palettes.ts` ("shadcn" / *Tema HBX*).
  - Component language: `frontend/src/app/globals.css` (`.btn`, `.card`, `.input`, `.badge`).
  - Marketing site: `frontend/src/app/page.tsx` + `page.module.css`.
  - Brand assets: `frontend/public/icons`, `frontend/public/assets/hbx-radar-cards`, `frontend/public/hbx-visuals`.

Explore that repository for deeper context when building new HBX surfaces — it contains the real
inbox, automation builder, dashboard and mobile flows this system abstracts.

---

## CONTENT FUNDAMENTALS

**Language:** Brazilian Portuguese, always. UI labels, CTAs and copy are pt-BR.

**Tone:** blunt, operational, sales-driven — it talks about money and movement, not features.
Copy is written to "assustar pelo diagnóstico e impressionar pela clareza" (scare with the
diagnosis, impress with the clarity). It favors short, declarative, punchy lines:

- *"O vazamento de receita está no WhatsApp."*
- *"Escolha sua entrada antes que o lead esfrie."*
- *"HBX não vende tela bonita. Vende movimento."*
- *"Cliente parado não é fim de funil. É fila de recuperação."*

**Person:** addresses the user directly and by role — *"Sou vendedor" / "Sou empresa"*,
*"Entre direto na esteira"*. Imperatives are common (*Entrar*, *Abrir esteira*, *Consultar implantação*).

**Casing:** Sentence case for body and most headings. UPPERCASE only for wide-tracked
eyebrows/overlines (e.g. `ENTRADA IMEDIATA`, `PLANO FOCO`). Product names keep the `HBX`
prefix and are capitalized: **HBX Leads**, **HBX List**, **HBX Recovery**.

**Numbers & money:** Brazilian formatting — `R$ 42.380`, `87% prioridade`, `1.284 leads`.
Rendered in IBM Plex Mono, tabular.

**Emoji:** sparingly, only inside chat/WhatsApp contexts (e.g. a 👍 in a message bubble).
Never in marketing headings or UI chrome.

**Vibe words to reach for:** esteira, lead quente, prioridade, próxima melhor ação, recovery,
follow-up, implantação sob consulta, ao vivo.

---

## VISUAL FOUNDATIONS

**Overall aesthetic: "liquid glass premium."** Every raised surface is a translucent, layered
gradient with an inset top highlight and a large, soft, far-throw shadow — like backlit frosted
glass. The product's own theme calls itself *"Base líquida premium / Panorâmico / Líquido."*

**Color.** One palette, two modes (light is default).
- Light: brand `#245CFF` (blue) → `#009FD9` (cyan); canvas `#F4F9FF`; surface white; ink `#0A1730`.
- Dark: brand `#2F6BFF` → `#00C2FF`; canvas `#07111F`; surface `#0D1B2E`; ink `#EAF4FF`.
- Accent magenta `#E63BC1` appears in the primary button gradient and highlights.
- Semantic: success `#11A86B`, warning `#F2A53A`, danger `#C92F7E`, info `#009FD9`.
- The **marketing site** runs a darker, separate shell: deep navy→teal→purple gradient with
  **mint** (`#6EF2D8`) highlights and a faint grid texture. Mint is the marketing's hero accent.

**Type.** *Plus Jakarta Sans* for everything (display + body); *IBM Plex Mono* for numerals,
codes and data labels. Headings use very tight tracking (−0.04em to −0.08em) and near-1 line
height (0.86–0.98), so they read as dense, confident blocks. Eyebrows are uppercase, 0.18em tracked.

**Backgrounds.** App canvas is a soft light-blue vertical gradient with two faint brand glows in
the top corners. Marketing is a dark radial+linear gradient with a masked 64px grid overlay and
floating orbit rings. No photography in chrome; product imagery is bright, cool, UI-screenshot style.

**Corner radii.** 8 / 12 / 16 / 20 / 28 px + 999px pills. Controls = 12px, panels = 20px, hero = 28px.
Avatars are **rounded squares**, not circles. Chips/badges/nav-links are full pills.

**Cards.** 1px hairline border (`color-mix(line, background)`), 20px radius, a two-stop vertical
surface gradient plus a brand-tinted corner spotlight, `inset 0 1px 0 rgba(255,255,255,.72)` top
highlight, and a soft `shadow-sm`. Featured/hot variants swap the spotlight for brand or mint.

**Buttons.** Glass with multiple stacked layers: white corner highlight, intent-tinted radial,
diagonal gradient fill, plus a heavy `backdrop-filter: blur(~32px) saturate(180%)`. Primary is a
blue→magenta→cyan gradient. 12px radius, 800 weight, ~38px tall (32px sm).

**Inputs.** 42px tall, 12px radius, subtle vertical gradient fill, inset highlight. Focus = brand
border + 3px soft brand ring.

**Shadows.** Far-throw, low-opacity, brand/ink-tinted (e.g. `0 18px 42px -24px`). Always paired
with the inset top highlight to sell the glass. Dark mode deepens shadow opacity, drops the inset.

**Motion.** Calm and liquid — `cubic-bezier(0.22,1,0.36,1)` for transforms (320–620ms), 180ms ease
for hovers. Hover lifts cards `translateY(-6px)` and brightens the border to brand/mint; orbit rings
rotate slowly; floating panels drift. Everything respects `prefers-reduced-motion`.

**Hover / press.** Hover: lift + border tint toward brand/mint, slightly stronger shadow. Press:
settle back down. Nav links get a translucent white pill background on hover.

**Transparency & blur.** Used heavily — topbar/nav/floating chrome sit on `rgba()` surfaces with
22–28px backdrop blur. Glass cards on marketing use `blur(22px)` over the dark gradient.

---

## ICONOGRAPHY

HBX uses **custom, colorful, filled SVG icons** rather than a monoline icon font. There are two
families, both in `assets/`:

- **Radar-card icons** (`assets/icons/*.svg`, 24×24) — the lead/prospecting set: `radar`,
  `cnpj`, `coins`, `confidence`, `quality`, `opportunity`, `lead-plus`, `enriching`, `map`,
  `channel`, `action`, `check`, `copy`, `external` plus channel glyphs. Style: a mix of
  2px sky-blue (`#0ea5e9`) line marks and brand-colored fills. They share gradient defs
  (`hbx-blue`, `hbx-gold`, `hbx-instagram`).
- **Channel icons** (`assets/channels/*.webp`, light + `_dark` variants) — rich, rendered
  brand badges for WhatsApp, Instagram, Facebook, e-mail, site/globe and telefone. Use the
  `_dark` file on dark surfaces.

Inline glyphs in the app (login side cards, toggles) are simple 24×24 **stroke** SVGs drawn at
1.5–1.7px weight (headset, shield, building, pulse, etc.) — clean, rounded line icons.

**Emoji** appear only inside chat/WhatsApp message content, never as UI iconography. Unicode
arrows (→) and `+`/`⋯` are used as lightweight button glyphs.

When you need an icon not in the set, match the existing style: 24×24, rounded line caps, ~1.7px
stroke for monoline, or a flat brand-colored fill for channel/category icons. Do not invent
gradient-heavy 3D icons.

**Logo:** the `HBX` wordmark (Plus Jakarta, 900 weight) inside a circular gradient orbit ring on a
dark navy field — see `assets/logo/hbx-app-icon-512.png`. In compact UI the brand renders as a
rounded-square `HBX` mark with a teal→navy→purple gradient.

---

## INDEX

**Root**
- `styles.css` — global entry point (import this). `@import`s the token + base layer only.
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `effects.css`, `base.css`.
- `assets/` — `logo/`, `icons/` (radar SVGs), `channels/` (webp channel badges), `visuals/` (product imagery).
- `SKILL.md` — Agent Skill wrapper for use in Claude Code.

**Components** (`window.HBXSystemDesignSystem_*`) — see each `.prompt.md` for usage:
- `components/core/` — `Button`, `IconButton`, `Badge`, `Chip`, `Avatar`, `StatusDot`.
- `components/surfaces/` — `Card`, `StatCard`.
- `components/forms/` — `TextField`, `Toggle`.
- `components/product/` — `LeadCard` (esteira), `ChatBubble` (atendimento inbox).

**Foundations** — specimen cards live in `guidelines/` (Type, Colors, Spacing, Brand) and render
in the Design System tab.

**UI kits** — full-screen recreations:
- `ui_kits/marketing/` — the public sales site (vendedor vs empresa entry).
- `ui_kits/workspace/` — the in-app HBX workspace (dashboard + atendimento inbox), Friendly light theme.
- `ui_kits/corporate/` — **the Corporativo dark app, 8 navigable screens** (Login, Dashboard, Leads,
  Webscraping, Vendas/Pipeline, Atendimento, Bot builder, Relatórios, Configurações) sharing
  `corporate.css` + `shell.jsx`. Activated via `<html data-theme="corporate">` — tokens in
  `tokens/theme-corporate.css` (teal #16C7A4, near-black surfaces, flat 1px hairlines, no glass).
