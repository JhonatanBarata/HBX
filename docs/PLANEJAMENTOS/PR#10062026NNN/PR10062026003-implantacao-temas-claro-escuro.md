# PR10062026003 — Redesign HBX: temas Corporativo + Friendly (handoff completo)

Data: 10/06/2026 (atualizado após leitura do handoff)
Status: PLANEJADO — fila: executa DEPOIS do PR10062026002 (arquitetura pura)
Fonte da verdade: `docs/TEMAS/design_handoff_hbx_corporativo/` (README.md = guia de
implementação; pastas `docs/TEMAS/claro|escuro` = mesmas referências com o modo fixado
para abrir no navegador).

## O que o handoff realmente é (supera o plano original)
- **Dois temas, cada um com claro+escuro (4 combinações)**, mecanismo por atributos no
  `<html>` (`data-theme="corporate"` / `data-theme-mode`):
  **Corporativo** = tema principal do app (flat, near-black, acento teal; dark padrão).
  **Friendly** = marketing/onboarding (liquid glass; light padrão).
  Topbar ganha sol/lua + chavinha Friendly↔Corporativo.
- **Não é só re-skin: é redesign com nova arquitetura de navegação** — o app passa a ter
  8 seções (Dashboard · Leads · Webscraping · Vendas · Atendimento · Bot · Relatórios ·
  Configurações); as ~20 rotas legadas são absorvidas gradualmente (nada deletado antes
  da tela nova estar no ar).
- Pacote inclui: `tokens/*.css` portáveis quase 1:1 (namespace `--hbx-*`, sem conflito),
  9 telas Corporativo completas em HTML hi-fi (pixel-perfect, fonte da verdade visual),
  `shell.jsx` de referência (sidebar 218px + topbar), primitivas React, assets, fontes
  (Plus Jakarta Sans + IBM Plex Mono) e plano de migração próprio — compatível com o
  método que havíamos definido.

## Fases (alinhadas ao plano do handoff)
- [ ] **T.1 Tokens:** portar `tokens/*.css` para o frontend, importados ANTES das regras
      atuais (namespace novo não conflita). Fontes via `tokens/fonts.css`.
- [ ] **T.2 Mecanismo de tema:** provider novo com `data-theme`/`data-theme-mode` no
      `<html>` + kill de transições no swap (receita do README), persistência integrada
      ao `themePreferenceConfig` existente, coexistindo com o ThemeProvider atual até o
      fim da migração.
- [ ] **T.3 Shell Corporativo:** sidebar (8 seções) + topbar (busca ⌘K, sol/lua,
      chavinha, "+", sinos) como TSX, atrás de rota nova ou feature flag — referência
      `shell.jsx` + `corporate.css`.
- [ ] **T.4 Uma tela por PR**, validada visualmente contra o HTML de referência antes do
      merge, na ordem do handoff: Dashboard → Vendas → Atendimento → Webscraping → Bot →
      Leads → Relatórios → Configurações → Login.
- [ ] **T.5 Friendly:** workspace glass (onboarding) + site público marketing
      (`ui_kits/workspace`, `ui_kits/marketing`).
- [ ] **T.6 Absorção das rotas legadas + limpeza final:** redirects, remoção de telas e
      CSS antigos, `HBX_THEME_PALETTES` substituído. Só depois de tudo no ar.
      (Ajuste do diagnóstico 10/06): **manifesto de rotas canônicas** versionado + teste
      de CI que falha se nascer rota duplicada (caso pre-checkout/precheckout) + política
      "alias só para compatibilidade, com prazo de remoção".

## Interação com o PR10062026002 (arquitetura pura)
- Ordem mantida: **arquitetura primeiro**. Para evitar trabalho dobrado, as fases de UI
  do PR-002 (master inspector, gerencial, telas do contratante) ficam **funcionais e
  mínimas** — o visual definitivo chega aqui (ex.: gerencial do contratante = tela
  "Configurações > Equipe/Plano" do handoff).
- A central master NÃO está entre as 8 seções do app: continua com a central própria;
  ganha a pele Corporativo em T.4/T.6 sem mudar a estrutura definida no PR-001/002.

## Contrato de telas — pedido do dono em 10/06/2026 (telas FIXAS daqui pra frente)

Garantia: **módulo novo nunca mais nasce do zero**. Toda tela do HBX é montagem de um
kit fechado. Entregáveis (fazem parte deste plano, construídos junto com T.3/T.4):

- [ ] **K.1 Kit de layout:** `PageShell` (grid 218px + 1fr, variante com painel de
      contexto +300px), `Section/Panel` (header padrão), grades de KPI, tabela padrão,
      lista padrão — os ÚNICOS layouts permitidos.
- [ ] **K.2 Kit de sobreposição:** `Modal` (janela), `ConfirmDialog` (pop-up de decisão),
      **`PersistentNotice`** (aviso persistente que só sai com clique do usuário —
      não existe no handoff, será desenhado no kit com os tokens), `Toast` (efêmero),
      `Drawer` se necessário. Um de cada — proibido criar variações locais.
- [ ] **K.3 Escalas fixas:** espaçamento (escala única do `tokens/spacing.css`),
      tamanhos de texto (corpo 14px, título de página 1.18rem/700, KPI 1.5rem/800,
      meta 0.7rem — nada fora da escala), raios e sombras do token.
- [ ] **K.4 Guia de texto (copy):** tom pt-BR direto do `design_system_readme.md` —
      títulos, mensagens de vazio, erros, confirmações: frases-padrão reutilizáveis.
- [ ] **K.5 Catálogo vivo:** rota interna `/dev/ui` renderizando TODAS as peças nos
      4 visuais (Corporativo/Friendly × claro/escuro) — é onde se confere o padrão e
      onde peça nova nasce ANTES de aparecer em tela real.
- [ ] **K.6 Blueprint de módulo novo:** doc curto "como criar uma tela" — escolher
      PageShell, encaixar Panels/tabelas do kit, textos pelo guia. Vira invariante no
      AGENTS.md: **nenhuma tela nova com layout/popup/espaçamento fora do kit**;
      revisão deve recusar tela bespoke.

## Salvaguardas
- Hi-fi: valores de cor/tipo/raio/sombra são finais — normalizar para o padrão do repo
  mantendo os MESMOS valores; nunca hex direto em componente (só `var(--hbx-*)`).
- Nada de blur/glass no Corporativo; respeitar `prefers-reduced-motion`; declarar `color`
  em todo `<button>` (bugs reais documentados no handoff).
- Nenhuma tela perde funcionalidade na troca; cada tela commitada com lint+build verdes
  e validação visual do dono contra o HTML de referência.

## Observação de higiene do pacote
- Existe uma duplicata acidental dentro do handoff
  (`design_handoff_hbx_corporativo/docs/TEMAS/claro/...`) — inofensiva; limpar quando
  conveniente.
