# PLAN — Refatoração COMPLETA do mobile (Leads/Radar · Vendas · Configurações · Atendimento)

> Gatilho 23/06 (testar.md): o mobile atual "não chegou perto". Fotos do dono: **Leads** com o
> card-navegador flutuando/cortado no meio da tela; **Vendas** com 4 KPIs empilhados gigantes +
> pipeline transbordando. A tentativa de 20/06 (`PLAN-MOBILE-LEADS-DECK`) está **aposentada** — este
> plano a supersede (um plano por assunto).

## Fonte da verdade — o mobile "muito bem feito" (já existe, é só portar)
`C:\Users\Jhonatan\Desktop\frontend` — app Next **separado**, design "corporate" caprichado, **com o
mobile já resolvido**. O ouro:
- `src/components/corporate/HbxCorporateShell.module.css` — shell, topbar enxuta, cards, KPIs compactos,
  list-row, **kanban→coluna**, **chatShell→1 coluna**, **settingsLayout/botLayout→1 coluna**, sheets.
  Os breakpoints já existem: `@media (max-width:1080px)` (sidebar some, grids viram 1 coluna) e
  `@media (max-width:720px)` (topbar quebra, chat colapsa, padding cai).
- Kit `src/components/ui/Hbx*`: `HbxPageShell`, `HbxStatCard`, `HbxKpiGrid`, `HbxDataTable`,
  `HbxStandardList`, `HbxModal`, `HbxDrawer`, `HbxSection`, `HbxEmptyState`, `HbxActionBar`, `HbxFormField`.
- Telas-espelho pra estudar o layout: `src/app/(app)/{vendas,radar-digital,configuracoes,atendimento}/`.

**Portar o DESENHO (layout, hierarquia, espaçamento, cartões), NÃO o código:** o protótipo é
Tailwind + CSS-module; o app vivo é **tokens hbx-theme**. Traduzir pro sistema central do app (5 Leis),
sem hex/inline. O worker LÊ o protótipo como referência visual e reproduz no app com classe/token central.

## Alvo (app vivo)
`C:\Users\Jhonatan\Desktop\App\frontend` — só o **mobile** das 4 telas:
- `src/app/(app)/leads/page.client.tsx` (Radar/Leads — confirmar que é a canônica do menu)
- `src/app/(app)/vendas/page.client.tsx`
- `src/app/(app)/configuracoes/…` (a tela de Configurações)
- `src/app/(app)/atendimento/page.client.tsx`
- CSS central: `src/app/hbx-theme/mobile.css` (+ `screens.css`/`kit.css` onde a classe já mora).

## Leis (não furar)
1. **Desktop byte-a-byte intocado** — tudo atrás de `@media (max-width:860px)` OU `isMobile()`. Conferir
   que o documento desktop não muda.
2. **5 Leis / check-pele** — classe/token central, zero `#hex`/inline color; `npm run lint` (check-pele) passa.
3. **Sem legado** — o mobile do 20/06 (seções RADAR/LEADS, VENDAS, CONFIG, ATENDIMENTO do `mobile.css` +
   overrides em `screens.css` ~1439) é o que "não chegou perto" → **substituído**, não fica vista dupla viva.

## Blocos (SEQUENCIAIS — todos tocam `mobile.css`; 1 worker por passo, ordem por prioridade)
- **B0 — Fundação mobile.** Estudar o shell do protótipo e estabelecer as primitivas centrais no
  `mobile.css`/`screens.css`: topbar enxuta, **bottom-nav**, card padrão, **list-row**, **bottom-sheet/overlay
  central** (reusar `.hbx-veil`/`.hbx-drawer` já existentes), faixa de KPIs compacta. Base que B1–B4 reusam.
- **B1 — Leads/Radar (PIOR — foto 1).** Lista vertical limpa de leads (rola com o dedo) + detalhe **na frente**
  (overlay central, **sem cortar**) com swipe/setas + dots; passou do último → `/vendas`. **Matar o
  card-navegador flutuante quebrado.** Letras proporcionais (rem/clamp).
- **B2 — Vendas (foto 2).** KPIs numa **faixa compacta** (não 4 cartões gigantes empilhados); pipeline em
  lista por etapa (Hoje/Atrasados/Agendados/Fechados) **sem transbordar**; tap no negócio → detalhe em
  **pop-up central** (X fecha).
- **B3 — Configurações.** Seções em **pills** + cartões agrupados ocupando a tela, **nada torto/transbordando**,
  **Salvar sticky**.
- **B4 — Atendimento.** Lista de conversas **fina** + divisória; thread/compose mobile limpos.

## Aplicação (orquestrador)
Opus orquestra; **workers Sonnet** editam, **um por bloco, em sequência** (não paralelo — colidiriam no
`mobile.css`). Sem gate de build travando o fluxo (ordem do dono "sem build nem nada"); ao fim de cada bloco
o orquestrador confere no **preview a 390px + screenshot** e segue. Depois: **publica → dono testa → volta**.

## Reverter
Cada bloco = 1 commit (ou `git checkout` dos arquivos da tela + a seção dela no `mobile.css`). Tudo localhost
reversível, **sem migration**.
