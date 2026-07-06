# W5 — RESULTADO: MAIS + CONFIGURAÇÕES mobile (curadas)

Folha "Mais" (aba da tab bar, agora abre `CascaSheet` em vez de navegar) +
tela `/configuracoes` registrada com whitelist curada. Zero backend novo,
zero endpoint novo — mesmos endpoints que o desktop já consome.

## Arquivos criados

- `frontend/src/components/casca/screens/mais-types.ts` — tipos
  compartilhados (`MaisCurrentUser`, `MasterNotice`, `TeamMember`) e helpers
  (`roleLabel`, `displayName`, `companyName`, `fmtWhen`) + hook
  `useMaisCurrentUser()` (`GET /profile/current-user` direto — não usa o
  `useCurrentUser()` de `shell.tsx` porque aquele `CurrentUser` local não
  expõe `avatarUrl`; o próprio desktop `configuracoes/page.client.tsx` busca à
  parte pelo mesmo motivo).
- `frontend/src/components/casca/screens/mais-sheet.tsx` — `MaisSheet`
  (`CascaSheet` acionada pela tab bar): perfil (avatar+nome+empresa) no topo;
  linhas 52px (Notificações, Relatórios, Tutorial, Configurações); `TemaSection`
  (exportado — reusado por Configurações/Aparência) com segmented claro/escuro
  + chips de pele (`PELES`/`setAppTheme`/`setThemeMode` de `theme-attributes`);
  linha "Tela cheia" com switch próprio (`toggleCascaFullscreen` do W1, aviso
  central automático — LEI do dono); "Sair" vermelho com confirmação em
  `CascaSheet` própria (`POST /auth/logout` + `clearToken()` + `router.replace
  ("/login")`, mesmo fluxo do `sairTopo` do desktop). Sub-sheet
  `NotificacoesSheet`: lê `GET /vendas/master-notices` (mesmo que o sino do
  desktop), ack por clique via `POST /vendas/master-notices/:id/ack` (mesmo
  contrato).
- `frontend/src/components/casca/screens/configuracoes.tsx` —
  `ConfiguracoesMobile` (componente registrado): 4 grupos de linhas 52px —
  **Conta** (`ContaSheet`: nome editável via `PATCH /profile/display-name`,
  e-mail leitura, senha via `PATCH /profile/password {newPassword}`);
  **WhatsApp** (`WhatsAppSheet`: status via `fetchWhatsAppModalStatus()` +
  botão que abre o `WhatsAppConnectModal` real — ver seção canônico abaixo);
  **Equipe** (`EquipeSheet`, só quando `isTenantAdmin`: lista de leitura via
  `GET /users/company`, mesmo endpoint do Gerencial); **Aparência** (mesma
  `TemaSection` da folha Mais, sem duplicar lógica).

## Arquivos alterados

- `frontend/src/components/casca/registry.tsx` — `CASCA_SCREENS["/configuracoes"]`
  registrado com `ConfiguracoesMobile` + título "Configurações" em
  `CASCA_TITLES`.
- `frontend/src/components/casca/tab-bar.tsx` — o item "Mais" deixou de ser
  `<Link href="/configuracoes">` e virou `<button>` que abre `<MaisSheet
  open={maisOpen} onClose={...} />` (montada dentro do próprio `CascaTabBar`).
  `isTabActive` mantido (acende em `/configuracoes` e em qualquer rota fora
  das 4 abas fixas) para quando o usuário navega para `/configuracoes` de
  dentro da folha (via "Configurações" → `router.push`).
- `frontend/src/app/hbx-theme/screens.css` — bloco novo "MOBILE-CASCA/W5" no
  final do arquivo. Classes `.mais-m__*` (folha) e `.cfg-m__*`
  (Configurações). Token de escopo próprio `--mais-row-h: 52px` (mais
  compacto que o `--casca-row-h` central de 60px — decisão da spec W5, "linhas
  52px", diferente da régua 56-64px das listas irmãs por ser menu de itens
  curtos, não lista de registros). Zero cor/hex — só tokens.

## Whitelist final (o que aparece em `/configuracoes` mobile)

| Grupo | Conteúdo | Gate |
|---|---|---|
| Conta | Nome (editável), e-mail (leitura), senha (editável) | todos |
| WhatsApp | Status (verde/vermelho + nome da instância) + conectar/gerenciar | todos |
| Equipe | Lista de leitura (nome, papel, ativo/inativo) | `isTenantAdmin` |
| Aparência | Modo claro/escuro + pele | todos |

**Fora da whitelist (nunca renderizado):** bot builder, IA/assistente,
automações, integrações, cobrança/planos, webhooks, avançados. Nenhuma dessas
rotas está registrada em `CASCA_SCREENS` — quem navegar direto por URL cai no
`CascaFallback` central ("Disponível no computador"), exatamente como o
registry do W1 já garante por construção (rota sem entrada = fallback, nunca
crash).

## WhatsApp — confirmação do fluxo canônico

`WhatsAppSheet` (em `configuracoes.tsx`) **não fala com o motor**: usa
`fetchWhatsAppModalStatus()` de `src/lib/whatsapp-connection-flow.ts` só para
status, e delega TODA a ação de conectar/desconectar/QR/pairing/wipe ao
componente `<WhatsAppConnectModal>` já existente
(`components/hbx/whatsapp-connect-modal.tsx`), o MESMO componente que o
desktop usa em `/atendimento`. Esse modal, por sua vez, só chama
`/companies/me/whatsapp-modal/{status,start,qr,disconnect,restart}` e
`/inbox/whatsapp-session` — nenhuma chamada nova, nenhuma API crua do motor
(`Webwhats/`), nenhum toque em reconexão/disjuntor. Zero caminho de dispatch
novo.

## Reset de sub-sheets sem `useEffect`

`MaisSheet`/`ContaSheet` resetam estado ao abrir/fechar usando o padrão
"adjust state while rendering" (guardar `lastOpen` em `useState`, comparar
durante o render) — o mesmo padrão que `useCascaExitGate` (W1) já usa. Isso
evita `react-hooks/set-state-in-effect` (regra estrita do React Compiler
deste projeto), sem `useEffect` supérfluo. `TemaSection` lê a pele ativa via
lazy `useState(() => getActivePele())` em vez de `useEffect`, pelo mesmo
motivo.

## Régua (auditada)

- Linhas `--mais-row-h: 52px` (token de escopo desta folha/tela, conforme a
  spec pedia — mais compacto que o `--casca-row-h` central de 60px usado nas
  listas irmãs).
- Alvos: linha inteira ≥52px de altura, botões de ação (chips de pele, switch
  de tela cheia) ≥28px.
- Cromo: a folha "Mais" é sheet (sem cromo de topo próprio, herda o header do
  `CascaSheet`); `/configuracoes` também não tem busca/stats (é lista de
  grupos curta, cabe toda na viewport com scroll).
- Anti-placona: grupos com título uppercase 11px + linhas compactas, sem
  cartões grandes.
- Casca intocada: nenhuma alteração em `mobile-shell.tsx`/`transitions.tsx`
  além de reusar `CascaSheet` (API pública do W1).
- Transição em tudo: abrir "Mais" = `CascaSheet` (slide de baixo); "Sair" e
  cada sub-item de Configurações = `CascaSheet` própria; "Configurações" a
  partir da folha = `router.push` (transição IR da própria casca).

## Checks

- `npx tsc --noEmit` — limpo (0 erros).
- `npm run lint` (eslint) — meus 3 arquivos (`mais-types.ts`, `mais-sheet.tsx`,
  `configuracoes.tsx`) com **0 erros/warnings**. A contagem total do repo
  (85 problems / 47 errors / 38 warnings no momento desta entrega) é de
  arquivos fora do meu escopo (`entrega/*`, `vendas-funil.tsx`,
  `bot-prosp-fields.tsx`, `voice-rubberband.ts` etc. — trabalho paralelo do
  dono, não tocado aqui).
- `check-pele` isolado — catraca em 497/495 (2 acima do teto), mas **nenhum
  arquivo meu está na lista de piores ofensores**: os 8 arquivos listados
  (`janela-empresas.tsx` 90, `gerencial/page.client.tsx` 55,
  `relatorios/page.client.tsx` 42 etc.) são pré-existentes, não tocados nesta
  entrega — mesmo estouro pré-existente que W1/W4 já documentaram.
- `npm run build` — verde, "Compiled successfully", 42 rotas geradas
  (`/configuracoes` incluída).

## Correção pós-publish (transparência)

Durante o desenvolvimento, o dono rodou `npm run publish` em ritmo acelerado
(vários publishes em minutos) e capturou uma versão intermediária do meu
trabalho — a que ainda usava `useCurrentUser()` do shell (sem `avatarUrl`,
quebrava `tsc --noEmit`) e tinha 3 ocorrências de
`react-hooks/set-state-in-effect` nos meus próprios arquivos. Identifiquei o
gap comparando `git status`/`git log` durante os checks finais, reapliquei as
correções (hook `useMaisCurrentUser` dedicado + padrão "adjust state while
rendering" nos 3 pontos) diretamente nos arquivos, e os checks finais
(tsc/lint/build) já foram rodados e confirmados verdes **depois** dessa
correção — o HEAD atual do repo já contém a versão corrigida (o dono seguiu
publicando por cima, capturando a correção automaticamente).

## Pendência honesta

Não houve spot-check visual ao vivo autenticado (Chrome 375×812, `.test-login.local.md`):
localhost roda com banco vazio e login costuma dar 401 (nota do próprio dono
no `.test-login.local.md`, 06/07 — "só vai testar depois que publicar"; teste
real acontece no VPS pós-publish). Confirmei apenas que `/configuracoes`
compila e renderiza 200 no dev server local (sem sessão, redireciona
corretamente para `/login`, sem erro 500/crash de render) — não é o veredito
visual, que fica para o dono no VPS.
