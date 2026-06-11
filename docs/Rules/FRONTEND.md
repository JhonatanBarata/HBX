# Regras — FRONTEND

> Next.js + React + TypeScript + Tailwind em `frontend/`.
> Leia este arquivo antes de criar ou alterar qualquer tela.

## Princípio do PR-010 (refatoração destrutiva)

- Tela nova NUNCA nasce do zero nem herda código da tela velha: nasce do kit.
- Ao refazer uma tela, a tela velha é DELETADA no mesmo commit. Nada de versão paralela.
- O backend é contrato intocável por tela: refazer tela não muda endpoint, payload
  nem regra de negócio (mudança de backend é trilha própria, nunca "de carona").
- Quebra back↔front descoberta no caminho: anotar no log do dia
  (`docs/PLANEJAMENTOS/`, pasta mais recente) e seguir — nunca adiar.
- Cada tela nova precisa de validação visual do dono contra o HTML de referência
  do handoff antes de ser considerada pronta.

## Kit fechado de UI (única forma de compor tela nova)

Camada de layout:
- `PageShell` — grid principal, topbar/sidebar, claro/escuro. Não busca perfil,
  não decide acesso comercial, não guarda regra de negócio.
- `Section` / `Panel` — header, título, descrição, densidade `default|compact`.
  Não vira card dentro de card, não contém navegação primária.

Camada de dados:
- `KpiGrid` / `KpiCard` — indicadores curtos; estado visual por token, não cor local.
- `DataTable` — listas comparáveis (master/admin/financeiro/relatórios).
  Estados obrigatórios: carregando, vazio, erro, seleção, ação por linha, paginação.
- `StandardList` — feed operacional, mobile, painéis laterais.
  Estados obrigatórios: carregando, vazio, erro, ação primária evidente.

Overlays (contrato fechado):
- Formulário/fluxo curto → `Modal` (título, fechamento claro, ações no rodapé, erro inline).
- Decisão/confirmação → `ConfirmDialog` (cancelar + confirmar, estado busy, variante destrutiva).
- Aviso que exige ação → `PersistentNotice` (nunca para cobrança de vendedor).
- Feedback efêmero → `Toast` (nunca a única evidência de erro crítico).
- Detalhe lateral → `Drawer`.
- **Proibido importar `HbxPopup1/2/3/4` em código novo.** Usos existentes são legado.
- Erro crítico de ação aparece NO ponto de ação, não só em toast/console.

Catálogo vivo: rota `/dev/ui` renderiza todos os componentes do kit, todos os estados,
claro/escuro, corporativo/friendly, com texto PT-BR realista.

Componente novo fora do kit só quando: comportamento é específico de domínio, não cabe
em nada do kit, a exceção foi registrada no plano ativo, e há plano de voltar ao kit.

## Visual corporativo (fonte: handoff `docs/TEMAS`)

- A fonte visual das telas novas é o handoff corporativo em `docs/TEMAS`
  (claro/ e escuro/ — HTMLs auto-contidos de referência + tokens CSS).
- Shell oficial: `HbxAppShell` (sidebar + topbar corporativos). Peças:
  `HbxCorporateKpis/Panel/Tag`, `tealButton`/`ghostButton`.
- Modos: Corporativo tem escuro como padrão; claro = `data-theme="corporate"`
  `data-theme-mode="light"`. Friendly tem claro como padrão; escuro = `data-theme-mode="dark"`.
- Tokens implantados em `frontend/src/app/hbx-theme`; assets em `frontend/public/hbx-theme`.
- Modo corporativo persiste em localStorage (`hbx:corporate-mode`) até a integração
  com `/profile/theme-preferences` (decisão conjunta pendente).
- NÃO usar as peças `HbxAdminUi` (visual admin) em tela corporativa nova.

## CSS e tema

- Não criar `page.module.css` novo para página operacional.
- Preferir tokens e classes globais `hbx-*`. Cor local nova precisa de par claro/escuro.
- Não hardcodar card branco / texto preto / sombra clara sem equivalente dark.
- Páginas operacionais desktop não têm hero nem header de marketing. Guias:
  `HbxGuide1` (guia1), `HbxGuide4` (guia vertical esquerda), `hbx-guide5` (subguia horizontal).
- Texto público sempre em PT-BR.

## Rotas

- Cada funcionalidade tem UMA rota canônica. Alias só redireciona — sem regra de
  negócio, API, layout ou CSS próprio.
- Alias novo registra: rota canônica, motivo, prazo de remoção, dono.
- Rotas legadas do master (`/master/clientes|financeiro|...`) resolvem via `?tab=` —
  manter funcionando ou remover, nunca meio-ligadas.

## Acesso e cobrança no frontend

- Frontend NÃO decide regra comercial. Consome `accessState` / `accessStateLabel` /
  `accessReleased` e mensagens seguras do backend.
- `PreCheckoutGate` é o único ponto de decisão visual para checkout.
- Vendedor nunca vê checkout, valor ou motivo financeiro (ver docs/Rules/PAGAMENTOS.md).
- 403 genérico nunca vira `payment_failed` no frontend.
- Catálogo de planos vem de `workspace.plansCatalog` — preço hardcoded é proibido.

## Zona de contenção

- `frontend/src/app/vendas/page.client.tsx` é o maior arquivo de risco: não adicionar
  responsabilidade nova; ao tocar, extrair componente/hook; não misturar visual com
  regra comercial.
- `DashboardScaffold` e o TopBar legado são alvo de demolição (R3) — sem correção
  cosmética neles; o shell novo absorve as funções quando a tela dona chegar.

## Checks e gates

- `cd frontend && npm run lint` e `npm run build` antes de entregar.
- Scanner report-only do contrato: `node scripts/hbx-frontend-contract-scan.mjs`
  (HbxPopup*, page.module.css novo, alias, preço hardcoded).
- E2E guardião das 3 personas:
  `npx playwright test tests/e2e/fluxo-contratante-vendedor.spec.ts`.
