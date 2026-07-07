# Regras — FRONTEND

> Next.js (App Router) + React + TypeScript em `frontend/`.
> Leia antes de criar ou alterar qualquer tela.

## As 5 Leis do Design System (MÉTODO — todo visual nasce centralizado)

> Não são freio: refatorar aparência e criar peles está AUTORIZADO. São o
> método pra todo valor visual nascer em token/classe central. O fiscal
> (`frontend/scripts/check-pele.mjs`, dentro do `npm run lint`) reprova o
> build se um hex/inline vazar pra dentro de tela — a disciplina não depende
> de memória de ninguém.

1. **Tokens centrais.** Todo valor visual (cor, fonte, radius, sombra,
   movimento) nasce em `frontend/src/app/hbx-theme/`:
   - `skeleton.css` — o CONTRATO inteiro, em valores neutros (cinza). É a
     lista fechada de variáveis que existe. Modo escuro é AUTOMÁTICO:
     `[data-theme-mode="dark"]` troca a escada de tokens — tela nunca sabe
     que o dark existe.
   - `theme.css` — Tailwind v4 (`@theme inline`): cada token vira utility
     (`bg-surface`, `text-ink-muted`, `rounded-panel`, `shadow-lip`…). A
     paleta default do Tailwind foi APAGADA — não existe utility de cor
     fora do contrato.
   - **Métrica estrutural é ESQUELETO (LEADS-FINAL/01, 06/07).** `font-size`,
     alturas (`height`, `--control-height*`, `--field-height`, `--row-height`),
     larguras de shell (`--rail-width*`, `--context-width`) e a escala de
     spacing nascem SÓ em `typography.css`/`spacing.css`/`skeleton.css`. Pele
     (`theme-*.css`) é PROIBIDA de declarar `font-size`/altura/largura
     estrutural — pele veste cor, borda, sombra, vidro, radius e família de
     fonte. É isso que garante troca de tema sem quebrar densidade (o
     check-pele reprova `font-size:<px>` dentro de `theme-*.css`).
     Alvos de densidade: lista de dados mostra **≥9 linhas em 1080p**
     (`--row-height: 48px`); zero-scroll (abaixo) continua lei — densidade
     não é desculpa pra deixar a tela rolar.
2. **Componentes centrais.** Visual repetido vira classe do kit
   (`kit.css`: panels, botões, campos, tabelas, overlays `.hbx-veil/.hbx-modal/
   .hbx-pop/.hbx-drawer`…) ou utility. Estrutura por-tela vive em
   `screens.css`. Nunca se repete visual em tela.
   - **Pop-up = SEMPRE no centro, pela central.** `.hbx-veil` já centraliza
     (`position:fixed; inset:0; grid; place-items:center; padding; z-index`).
     TODA tela só põe `className="hbx-veil"` + `.hbx-modal` e dimensiona a
     moldura (width). É PROIBIDO re-centralizar, re-posicionar ou re-empilhar
     (`z-index`) inline na tela. Pop-up fora do centro / "não aparece" = a tela
     está furando isto — o conserto é na classe central, NUNCA na página.
   - **Seleção ativa (menu/aba/chip/passo) = SEMPRE Glass Pill deslizante**
     (ordem do dono, 05/07 — nasceu do menu lateral, virou regra pra TODO
     grupo de botões/links com um "ativo" por vez). Nunca um `background`/
     `border` próprio que troca instantâneo no item clicado — o destaque é
     uma pílula de vidro (blur + brilho + sombra) que MEDE a posição do item
     ativo e desliza até ele, com uma leve "chacoalhada" de pouso ao chegar
     (squash/stretch, como uma gota assentando). Hook + componente prontos:
     `components/hbx/glass-pill.tsx` (`useGlassPill` + `<GlassPill>`); CSS
     genérico em `kit.css` (`.glass-pill-track`, `.glass-pill-item`,
     `.glass-pill`, `.glass-pill__glass`); cada pele veste o vidro em
     `theme-<nome>.css` via `.glass-pill__glass` (não recriar o efeito). Uso:
     ```tsx
     const gp = useGlassPill(activeKey, outrasDeps...);
     <div className="glass-pill-track algumaClasseDoContainer">
       <GlassPill {...gp} />
       {items.map(it => (
         <button key={it.key} ref={gp.itemRef(it.key)}
           className={"glass-pill-item algumaClasseDoItem" + (it.key === activeKey ? " active" : "")}>
           {it.label}
         </button>
       ))}
     </div>
     ```
     O container do grupo precisa de `position:relative` (a classe
     `.glass-pill-track` já dá isso). Forma padrão = `--radius-pill`; grupo
     com cantos quadrados (ex.: sub-menu de Configurações) seta
     `--glass-pill-radius: var(--radius-sm)` (ou a variável de radius que já
     usava) no container. Aplica-se a QUALQUER menu novo: sub-nav vertical,
     abas horizontais, chips de filtro/período, passos de wizard — não só ao
     menu lateral.
3. **Tema SÓ troca tokens (+ camada de vestir).** Pele nova =
   `theme-<nome>.css` (tokens claro/escuro + reestilo visual das classes
   centrais, tudo sob `[data-theme="nome"]`) + import no `globals.css` +
   entrada no `PELES` (theme-attributes.tsx). Como encomendar a uma IA:
   **docs/Rules/PEDIDO-DE-PELE.md**. Julgamento: tela-prova **/dev/pele**.
   Tema NUNCA muda escrita, estrutura, menu ou navegação — uma
   funcionalidade = UMA tela, UM DOM, UMA escrita. Cores instaladas: aurora
   (padrão), ember, rose, hbx-cyber. `skeleton.css` é a BASE de tokens
   (contrato neutro que as peles vestem) — NÃO é uma opção do seletor.
   - **CASCAS (dono 07/07; aprovação na mesma noite: "remover temas e
     cascas antigas, ficou perfeito os 4 novos"):** a casca MODERN
     (`casca-modern.css`, fundo infinito + vidro) é a ÚNICA selecionável —
     o seletor tem só os 4 temas "<Nome> Mod" e o visual clássico saiu do
     seletor (kit.css/casca.css seguem como ESTRUTURA base que a casca
     veste). Mecânica (genérica, serve pra casca futura): entrada com
     `casca: "modern"` no `PELES` aplica `data-casca="modern"` no `<html>`
     por cima do `data-theme` da COR base (`base:`); chave clássica salva
     em localStorage migra pra variante Mod da mesma cor (registry + boot
     do layout.tsx, manter em sincronia). Casca NÃO é pele: veste o MESMO
     DOM (shell desktop + casca mobile) e deriva TODA cor de token
     (`var(--hbx-*)` + color-mix com #fff/#000) — por isso
     `casca-modern.css` NÃO é isenta do check-pele e uma folha serve às 4
     cores. Continua valendo: UMA tela, UM DOM, UMA escrita — casca nova
     nunca duplica tela nem cria navegação própria.
4. **Tela é PROIBIDA de ter visual próprio.** Nenhuma cor, borda, sombra,
   fonte ou radius dentro de TSX — só classe central/utility/token. Inline
   `style` é tolerado SOMENTE para layout (display/gap/padding/width…).
5. **Fiscal no lint.** `check-pele.mjs`: cor literal em CSS fora de pele,
   cor literal em TSX e valor arbitrário do Tailwind (`bg-[#…]`) = build
   REPROVADO na hora. Styles visuais inline legados descem por CATRACA
   (`scripts/pele-baseline.json` — o teto só desce; meta ZERO; subir = build
   reprovado).

### Estado atual e exceções registradas
- Peles de COR instaladas (aurora, ember, rose, hbx-cyber) vestem o contrato
  neutro de tokens; criar/refatorar pele é trabalho autorizado (ver
  PEDIDO-DE-PELE.md). `skeleton.css` é a base de tokens, não uma opção do
  seletor. Seletor mostra SÓ os 4 temas "<Nome> Mod" (cor × casca MODERN —
  ver Lei nº3/CASCAS; padrão = Aurora Mod). Os theme-<cor>.css seguem vivos
  como fonte de tokens consumida via `base:` — não deletar.
- **Pele noir REMOVIDA (dono 07/07, mesma ordem que criou a casca Modern):**
  theme-noir.css, a vitrine `.vnd-m__vitrine` (screens.css/vendas-funil.tsx)
  e o campo `mobileOnly` do PELES saíram juntos — não reintroduzir.
- `docs/TEMAS` é REFERÊNCIA de estrutura/escrita das telas — o visual de lá
  não se copia para dentro de tela nem de TSX (vira token/classe).
- Mundo-site (visual próprio, fora do fiscal): `hbx-theme/marketing.css`,
  `src/app/page.client.tsx` (landing) e `src/app/trabalhe-conosco/`.
- OOBE (07/07): `hbx-theme/oobe.css` — casca ISOLADA do primeiro acesso
  (`components/hbx/oobe-gate.tsx`), paleta própria dark constante (mock
  aprovado pelo dono), padrão mundo-site: NUNCA vestir com a pele do app.
- `public/sw.js` é kill-switch permanente do PWA antigo — não remover; não
  registrar service worker novo sem ordem do dono.
- Webfonts via `<link>` no `src/app/layout.tsx` (nunca `@import` em CSS — o
  bundler descarta em silêncio).

## Layout — Zero scroll em desktop (100% zoom)

Toda tela de marketing (landing, esteira, módulos, planos) e toda tela do app
**deve caber na viewport sem rolar verticalmente** em desktop 100% de zoom.
Viewport alvo: ≥ 768 px de altura (resolução 1366×768 em tela cheia é o mínimo
comum de laptop).

### Como verificar antes de entregar

```js
// no console do navegador — retorna true se não precisa rolar
document.documentElement.scrollHeight <= window.innerHeight
// ou para a .scene-center da landing:
document.querySelector('.scene-center').offsetHeight <= window.innerHeight
```

### Onde e como corrigir overflow

O ajuste nunca mexe no visual macro: não "amassa" card, não troca cópia, não
remove elemento. A técnica é **compactar espaçamento** proporcionalmente à
altura da viewport com `@media (max-height: …)` + `clamp(vh, vh, px)`:

- **Arquivo:** `frontend/src/app/hbx-theme/screens.css`
- **Bloco existente:** `@media (max-height: 900px)` (perto do fim do arquivo)
  que já cuida da casca de marketing (`.scene-center`, `.scene-next`,
  `.site-integra`). Adicione aí se a tela usa essa casca.
- **Novas telas do app:** mesma lógica — `max-height` reduz padding/gap do
  container principal, nunca o conteúdo em si.

### Ordens

1. Novo componente ou tela adicionado → testar scroll no Chrome 100% zoom antes
   de marcar como feito.
2. Overflow detectado → corrigir via `@media (max-height: 900px)` em
   `screens.css`, **não** via `overflow-y: auto` no container da tela (isso
   esconde o problema em vez de resolver).
3. Reduzir na ordem: primeiro padding/gap da view, depois tamanho de botão de
   navegação, por último font-size (só se realmente necessário).

## Dados e API

- Client único: `src/lib/api.ts` (`apiFetch`, token em localStorage, proxy
  `/hbx/api` em dev via next.config). 401 fora do login → limpa token e volta
  pro `/login` (AuthGate no layout do grupo `(app)`).
- Conexão WhatsApp: fluxo canônico em `src/lib/whatsapp-connection-flow.ts`
  (+ `whatsapp-center.ts`); UI em `components/hbx/whatsapp-connect-modal.tsx`.
- Dado sem contrato no backend mostra "—" ou fica visual com nota — nunca
  número fake ao lado de dado real.

## Rotas

- Uma rota canônica por funcionalidade; alias só redireciona.
- Aliases ativos: `/dashboard/master` → `/dashboard`; `/workspace` → `/dashboard` (app paralelo
  friendly morto na unificação); `/webscraping` → `/leads` (Radar unificada).
  (`/boasvindas`, `/pre-checkout`, `/precheckout` removidos em F8/19/06 — rotas mortas deletadas.)
- **Sem legado (regra dura, dono 17/06).** Merge/substituição de tela apaga a velha NO
  MESMO passo — ela vira alias `redirect()` (ex.: `/workspace`→`/dashboard`,
  `/webscraping`→`/leads`) ou é deletada; e saem JUNTOS os botões/links que apontavam pra
  ela, a entrada `META` em `app-shell.tsx` e o CSS de `screens.css` que só ela usava. Duas
  telas vivas pra mesma função = legado proibido. Antes de editar, confirme que a tela é a
  CANÔNICA (a que o menu abre) — editar a homônima morta é trabalho jogado fora.

## Acesso e cobrança

- Frontend NÃO decide regra comercial: consome `accessState*` e mensagens do
  backend. Vendedor (`userKind=seller`) nunca vê plano/valor/cobrança.
- **Módulo sem acesso NÃO aparece no painel da esquerda.** O gate é
  `isModuleVisible` em `components/hbx/shell.tsx` e é
  **fail-closed**: o item da sidebar só entra quando `/modules/me` afirma
  `accessible:true` (mesmo veredito do guard real `canUserAccessModule`).
  Nunca mostrar um módulo e barrar no clique — sem acesso = some da navegação.
- Preço/plano só do catálogo da API (`/commercial-plans/me`) — hardcode proibido.
- Trilha de checkout: aguardando "go checkout" do dono.

## Checks

- `cd frontend && npm run lint` (eslint + check-pele) → `npm run build`
  antes de entregar. Lint vermelho do check-pele = a entrega está ERRADA —
  corrigir na fonte (token/classe central), nunca contornar o fiscal.
