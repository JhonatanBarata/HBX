# W1 — RESULTADO: A CASCA (fundação mobile)

A moldura única do celular + toda a API que W2–W6 vão consumir. Desktop 100%
intocado (quando não-mobile, a MobileShell devolve `children` puro; nenhuma
classe `.casca-*` entra no DOM do desktop).

## Arquivos criados

### CSS (métrica ESTRUTURAL nos arquivos da Lei 1 + folha da casca)
- `frontend/src/app/hbx-theme/casca.css` **(novo)** — todas as classes da casca
  (topo, stage, tab bar, fallback, stub, transições IR/VOLTAR, bottom sheet,
  toast, segmented, **CascaLoading**). Cores SÓ por token — a casca veste a pele
  ativa sozinha. Importado no `globals.css` (depois de `transitions.css`).
- `frontend/src/app/hbx-theme/spacing.css` — tokens `--casca-*` de altura
  (`--casca-top-h:48px`, `--casca-tabbar-h:55px`, `--casca-row-h:60px`,
  `--casca-segment-h:28px`, safe-areas, `--casca-loading-size/thick`).
- `frontend/src/app/hbx-theme/typography.css` — tokens `--casca-text-*`
  (title 15px, label 10.5px, stat 11px, body 14px, sub 12px, pct 13px,
  `--casca-loading-mark`).
- `frontend/src/app/hbx-theme/skeleton.css` — movimento `--casca-motion-dur/ease`
  + contrato NEUTRO do anel de loading (`--casca-ring-1..5`, `--casca-ring-track`,
  `--casca-ring-glow`, `--casca-mark-1..3`) claro **e** escuro.
- `frontend/src/app/hbx-theme/theme-aurora.css` / `theme-ember.css` /
  `theme-rose.css` — cada pele VESTE o anel (`--casca-ring-*`) e o wordmark
  platina (`--casca-mark-*`). Espectro termina em **platina** (sem vermelho/rosa,
  ordem do dono).

### TS/TSX
- `frontend/src/lib/casca-mobile.ts` — hook `useCascaMobile` (breakpoint 768px,
  SSR-safe via `useSyncExternalStore`).
- `frontend/src/lib/casca-toast.ts` — store do toast central (`showCascaToast`,
  `dismissCascaToast`, `useCascaToast`).
- `frontend/src/lib/casca-fullscreen.ts` — Fullscreen API + aviso central
  (`enterCascaFullscreen`, `exitCascaFullscreen`, `toggleCascaFullscreen`,
  `isFullscreenActive`, `isFullscreenSupported`).
- `frontend/src/components/casca/mobile-shell.tsx` — `MobileShell` (a moldura).
- `frontend/src/components/casca/registry.tsx` — registry rota→tela + stubs.
- `frontend/src/components/casca/transitions.tsx` — `useCascaExitGate`,
  `CascaView`, `CascaSheet`.
- `frontend/src/components/casca/loading.tsx` — `CascaLoading`.
- `frontend/src/components/casca/tab-bar.tsx` — `CascaTabBar`.
- `frontend/src/components/casca/fallback.tsx` — `CascaFallback`.
- `frontend/src/components/casca/stub.tsx` — `CascaStub`.
- `frontend/src/components/casca/toast-host.tsx` — `CascaToastHost`.
- `frontend/src/components/casca/index.ts` — **barrel da API pública**.

### Integração
- `frontend/src/components/hbx/app-shell.tsx` — o retorno desktop foi envolvido
  por `<MobileShell>`. No desktop devolve `children` puro (shell intocado); no
  celular substitui TODO o chrome pela casca.

## A API — em 10 linhas (import `@/components/casca`)

1. **Registrar tela:** em `registry.tsx`, troque o stub por seu componente em
   `CASCA_SCREENS["/rota"]` e o título em `CASCA_TITLES["/rota"]`. Rota não
   registrada → `CascaFallback` central automático ("Disponível no computador").
2. **É mobile?** `const mobile = useCascaMobile();` (true < 768px, SSR-safe).
3. **Sub-tela empilhada (IR/VOLTAR):** `{open && <CascaView title="Ficha"
   onClose={()=>setOpen(false)}>…</CascaView>}` — ABRIR = IR (entra DA direita,
   `.casca-view--enter` sem `is-back`); FECHAR = VOLTAR (sai PRA direita,
   `.casca-view--leave.is-back`), e ela **desmonta sozinha** (não some seco).
4. **Bottom sheet:** `<CascaSheet open={open} title="Detalhe"
   onClose={()=>setOpen(false)}>…</CascaSheet>` — handle, sobe/desce com
   transição, arrastar-pra-baixo > 96px fecha, veil clicável fecha.
5. **Loading padrão:** `<CascaLoading value={pct} caption="…" />` (progresso 0–100
   com % e anel enchendo) ou `<CascaLoading />` (indeterminado, enche em loop).
   `overlay` = camada semitransparente sobre a tela.
6. **Toast central:** `showCascaToast("mensagem")` (some sozinho; host já montado).
7. **Fullscreen:** `toggleCascaFullscreen()` — entra com aviso central automático
   (LEI nº3); `isFullscreenSupported()` pra esconder a opção onde não dá.
8. **Lifecycle cru (avançado):** `useCascaExitGate(open, onClosed)` devolve
   `{mounted, leaving, handleAnimEnd}` — segura o unmount até a saída animar.
   Ponha `handleAnimEnd` no `onAnimationEnd` da SUA camada raiz.

## LEI "nada abre/fecha seco" — como é garantida
`CascaView`/`CascaSheet` são a ÚNICA forma de abrir/fechar. Ambos passam pelo
`useCascaExitGate`: `open=false` NÃO desmonta na hora — marca `leaving`, toca a
animação de saída (classe `is-leaving`/`is-back`) e só desmonta no
`onAnimationEnd`. Trocar de rota na tab bar toca a transição IR no `.casca-view`
(key=pathname). Ajuste de estado feito DURANTE o render (padrão React "adjust
state while rendering"), sem `useEffect` — passa no lint estrito (React Compiler).

## Tab bar / registry / redirect
- Abas: **Vendas · Conversas · Empresas · Rota · Mais**. "Buscar" NÃO existe
  (vive dentro de Vendas). Rota = módulo Logística (`/entrega`, gate
  `isModuleVisible('logistica')`, skin própria do W6). Mais = `/configuracoes`
  (W5 troca por folha "Mais"). Ativo pelo pathname.
- Registrados (stub): `/vendas`, `/atendimento`, `/empresas`. W2–W4 trocam o
  miolo (mesma chave).
- `/dashboard` no mobile → `router.replace('/vendas')`.

## CascaLoading (ordem do dono, com os 3 ajustes)
- Marca **HBX** no centro: chevron » colorido (herda `--hbx-brand-strong`) +
  "HBX" em **Sora black** (fonte de marca já carregada no `layout.tsx`) com
  acabamento **metálico platina** (gradiente + `background-clip:text`, classe
  central `.casca-loading__mark strong`) — logotipo, não texto default.
- Anel **multi-cor** (conic-gradient) que ENCHE 0→100% via `--casca-fill` (com
  `@property` pra interpolar suave). Espectro **termina em platina**, sem
  vermelho/rosa. Anel **fino** (`--casca-loading-thick:10px` ≈ 7% de 148px).
  Acabamento 3D: glow (`drop-shadow`), sombra interna, hub elevado.
- 2 modos: determinado (mostra %) e indeterminado (gira + pulsa com easing).

## Régua (auditada)
Cromo fixo = topo 48px + tab bar 55px = **103px** (< 140px). Linhas 60px (56–64),
segmented 28px, stats 11px, sem fileira de ícones no topo, anti-placona. Casca
idêntica em todos os painéis (a moldura é uma só; tela só injeta conteúdo).

## Checks
- `check-pele` (design system) — **0 violações duras; catraca 495/495** (inalterada;
  o `--casca-fill` inline é custom property, não conta como style visual).
- `eslint` — **45 errors / 38 warnings**, IDÊNTICO à baseline pré-W1 (W0-RESULTADO):
  meus arquivos adicionaram **0** erro/warning. (Os 45 são pré-existentes fora do
  meu escopo.)
- `tsc --noEmit` — **limpo (0 erros)**.
- `npm run build` — **verde**, "Compiled successfully", 42 rotas geradas.

## Pendência de verificação (para o dono)
Não consegui a verificação visual ao vivo nesta rodada: a extensão Claude-in-Chrome
ficou fora do ar e a porta 3001 estava tomada pelo dev server já rodando (não
derrubei). **Falta o spot-check no Chrome 375×812**: navegar as 5 abas vendo a
transição IR/VOLTAR, o fallback numa rota não registrada, e o fullscreen com
aviso — além de conferir o desktop 1366×768 idêntico. Build/tsc/lint verdes dão
alta confiança de compilação e das 5 Leis; falta só o olho no pixel.
