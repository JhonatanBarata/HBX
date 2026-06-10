# UI Kit — HBX Marketing (public sales site)

A faithful recreation of the HBX System public landing page (`frontend/src/app/page.tsx`
+ `page.module.css`).

- **`index.html`** — the full sales site: topbar + brand lockup, the "escolha sua entrada"
  hero with vendedor/empresa audience cards, the animated phone/esteira preview with orbit
  rings, the proof strip, the esteira pipeline, the List/Leads/empresa plans, the recovery
  section, the final CTA, and a working login overlay (click **Entrar** or any CTA).

## Notes
- This is the marketing shell, which runs a **darker, separate palette** from the app: deep
  navy→teal→purple gradient, faint 64px grid texture, glass cards with `backdrop-filter`, and
  **mint** (`#6EF2D8`) as the hero accent. The login button uses the app's brand
  blue→magenta→cyan gradient.
- Styled entirely with the design-system tokens from `styles.css`; copy and structure mirror
  the real product. Interactions (smooth-scroll nav, login modal, Esc to close) are wired with
  a few lines of vanilla JS.
