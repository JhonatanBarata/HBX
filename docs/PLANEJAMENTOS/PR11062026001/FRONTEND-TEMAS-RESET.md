# PR — Reset destrutivo do frontend a partir do handoff docs/TEMAS

Data: 11/06/2026
Ordem do dono: frontend antigo deletado por completo; o front do sistema passa a ser
o handoff `docs/TEMAS` (corporativo + friendly, claro + escuro), com os endpoints do
backend injetados nos pontos dinâmicos. Backend = contrato intocável (nada mudou lá).

## O que foi feito

Frontend novo em `frontend/` (Next.js 16 + React 19 + TS), telas **copiadas elemento
por elemento** dos HTMLs do handoff:

| Rota | Template de origem |
|---|---|
| `/` | `escuro/marketing/index.html` (landing pública + overlay de login) |
| `/login` | `corporate/Login.html` |
| `/dashboard` | `corporate/Dashboard.html` |
| `/leads` | `corporate/Leads.html` |
| `/webscraping` | `corporate/Webscraping.html` |
| `/vendas` | `corporate/index.html` (Pipeline) |
| `/atendimento` | `corporate/Atendimento.html` |
| `/bot` | `corporate/Bot.html` |
| `/relatorios` | `corporate/Relatorios.html` |
| `/configuracoes` | `corporate/Configuracoes.html` |
| `/workspace` | `workspace/index.html` (app Friendly) |

Shell compartilhado (`src/components/hbx/shell.tsx`) = porta fiel do `shell.jsx` do
handoff (ícones, Sidebar, Topbar, KPIs, ModeToggle, ThemeSwitch). Tokens e CSS
copiados sem alteração de valores para `src/app/hbx-theme/` (fonts, colors,
typography, spacing, effects, base, theme-corporate, corporate). Assets em
`public/hbx-theme/assets/` (idênticos entre claro/escuro no handoff).

Temas (mesma regra do handoff, FRONTEND.md):
- Corporate: escuro padrão; claro = `data-theme-mode="light"`; persiste em `hbx:corporate-mode`.
- Friendly (`/workspace`): claro padrão; escuro = `data-theme-mode="dark"`; persiste em `hbx:friendly-mode`.
- Landing `/`: html puro como no template de marketing.
- Boot inline no layout raiz evita flash; `ThemeAttributes` mantém na navegação SPA.

## Endpoints ligados (pontos dinâmicos)

- **Login (`/login` e overlay da landing)** → `POST /auth/login` `{username, password}`;
  token salvo em `localStorage("token")` (compatível com o app antigo); redireciona
  para o `next` do backend.
- **Identidade no shell** (user-card da sidebar + avatar da topbar) →
  `GET /profile/current-user` (`name`, `userKind`); fallback = texto visual do template.
- **Guarda de rota** (`(app)/layout.tsx`): sem token → `/login`. Regra comercial
  continua 100% no backend.
- Proxy same-origin `/hbx/api` preservado (next.config.ts restaurado do git).

## Elementos que ficaram VISUAIS como no template (sem endpoint nesta fase)

Conforme REGRA ZERO, nada foi removido; registro do que segue visual:
- Dashboard: KPIs, receita 6 meses, funil, atividade, tarefas, top vendedores.
- Leads: KPIs, tabela, filtros de etapa, paginação, contexto, ações rápidas.
- Vendas: KPIs, kanban, detalhes do negócio, tarefas, funil.
- Webscraping: filtros, "Executar coleta", strip de estatísticas, tabela, contexto.
- Atendimento: KPIs, conversas, thread (envio local apenas), contexto.
- Bot: construtor, blocos, canvas, chat de teste (simulado), salvar/publicar.
- Relatórios: períodos, exportar PDF/CSV, gráficos, tabela de vendedores.
- Configurações: todas as seções (Perfil/Empresa/Equipe/Notificações/Plano e
  cobrança). **Plano e cobrança é visual do template** — quando ligar, catálogo vem
  de `workspace.plansCatalog` (PAGAMENTOS.md), nunca hardcode.
- Workspace friendly: esteira, recovery, inbox (envio local apenas).
- Topbar: busca, sinos/badges (8 e 3), botão "+"; Sidebar: plan-card; Login:
  "Manter conectado", "Esqueci minha senha", "Falar com vendas".
- Marketing: âncoras e CTAs abrem o overlay de login (como no template).

## Adaptações técnicas obrigatórias da SPA (sem mudança visual)

1. `corporate.css`: regras de `body`/scrollbar escopadas em `[data-theme="corporate"]`
   (CSS fica carregado entre rotas; sem isso vazaria no friendly/landing).
2. `.app { height:100vh; overflow:hidden }` de Atendimento/Bot virou
   `.app.app-viewport` (senão quebraria o scroll das outras telas corporate).
3. CSS da landing: seletores prefixados com `.mkt` e regras de `body` movidas para
   `.mkt` (colisão com `.topbar`/`.field` do corporate). Valores intactos.
4. Estado de erro do login: o template só tinha o bloco verde `.ok`; erro reusa o
   mesmo bloco com cores `--hbx-danger` inline (app sem erro visível seria quebrado).
5. Toggles de tema derivam o estado do atributo do `<html>` via MutationObserver
   (exigência do lint/hidratação do Next).

## Aliases de transição (só redirecionam; remover quando as telas donas chegarem)

- `/dashboard/master` → `/dashboard` (backend devolve esse `next` para master).
- `/pre-checkout` e `/precheckout` → `/dashboard` (tela de checkout não existe no
  front novo; backend segue negando APIs comerciais de empresa irregular).

## Quebras back↔front anotadas (LOG DO DIA — 11/06/2026)

1. `next` de login para master (`/dashboard/master`) e contratante irregular
   (`/pre-checkout?reason=...`) apontam para telas que não existem mais — cobertos
   por alias-redirect provisório acima. Decisão pendente do dono: destino real.
2. Todas as rotas do app antigo (master, gerencial, mobile-*, vendas antigas,
   checkout, register, reset-password, tutorial, whatsapp, radar-digital, /dev/ui
   etc.) deixaram de existir junto com o front deletado. Qualquer link/e-mail do
   backend apontando para elas cai em 404. Seguir religando tela a tela.
3. `POST /auth/logout` existe no backend, mas o template não tem elemento de logout
   (o "⋮" do user-card é visual) — não foi inventado botão; ligar quando o dono
   definir o ponto.
4. Catálogo `frontend/cards/Tutorial` (imagens) foi deletado junto; tutorial não
   existe no handoff.

## Ajuste 2 — paridade de módulos no friendly (ordem do dono, 11/06/2026)

"O que aparece no corporativo aparece no friendly." Rail do `/workspace` agora tem
os 8 módulos do corporate + os 2 próprios do friendly, nesta ordem: Início,
Esteira de leads, **Webscraping**, **Vendas**, Atendimento, **Bot**,
**Relatórios**, Recovery, Cadastros, **Configurações**.

- Ícones dos próprios assets do handoff: Webscraping=`site`, Vendas=`opportunity`,
  Bot=`action`, Relatórios=`quality`. Configurações usa a engrenagem inline do
  shell (não existe gear nos assets friendly).
- Módulos sem vista própria no handoff friendly reusam a vista `<Dashboard />` —
  mesmo padrão que o template já aplicava a Esteira/Recovery/Cadastros. Vistas
  friendly dedicadas (Webscraping, Vendas, Bot, Relatórios, Configurações) ficam
  para PRs próprios, quando houver template/contrato.

## Fase 2 — ciclo de auth + Webscraping no motor real (11/06/2026, "go" do dono)

### Ciclo de autenticação ligado
- `/login` → "Esqueci minha senha" agora navega para `/reset-password`.
- `/reset-password` (novo): sem token pede e-mail → `POST /auth/recover-password`;
  com `?token=` pede nova senha → `POST /auth/reset-password` (link do e-mail do
  backend bate com a rota). Sem template dedicado no handoff — moldura reusa 1:1 o
  Login (`AuthSplit`).
- `/confirm-email` (novo): `POST /auth/confirm-email` com o token da URL; sucesso
  pode auto-logar (`access_token` + `next`) e redireciona; link expirado oferece
  reenvio via `POST /auth/resend-confirmation`. Mesma moldura do Login.
- Logout no "⋮" do user-card da sidebar (ponto aprovado pelo dono): menu com
  "Sair" → `POST /auth/logout` + limpeza do token + `/login`. Adaptação mínima de
  markup (menu flutuante com tokens existentes).
- Alias novo: `/boasvindas` → `/dashboard` (confirm-email com trial devolve esse
  `next`; tela de boas-vindas não existe no front novo — mesma família de quebra
  dos demais aliases).

### Webscraping ligado no motor Radar
- Executar coleta → `POST /webscraping/radar/search-runs` `{city, state, segment}`
  (cidade+segmento obrigatórios — erro do backend aparece inline); polling de 4s em
  `GET /webscraping/radar/search-runs/:id`; coleta ativa retomada no load via
  `GET .../search-runs/latest`; ao terminar, recarrega a base.
- Tabela → `GET /webscraping/radar/leads` com `page`, `segment`, `city`, `state`,
  `filterKey` (busca por empresa/domínio); paginação real pelo `total`/`meta.limit`.
- Strip de estatísticas → `meta.enrichmentSummary` (e-mails validados =
  emailConfirmedOrProbable; WhatsApp verificados = whatsappVerified; taxa de
  enriquecimento = readyToCall/cardsAnalyzed). Célula "Telefones encontrados" do
  template virou "WhatsApp verificados" — é o dado real que o motor produz.
- Contexto → `GET /webscraping/radar/leads/:id`; "Adicionar ao CRM" →
  `POST .../send-to-vendas` (resultado inline no painel).
- Filtros Segmento/Cidade viraram inputs com datalist (opções de
  `meta.availableFilters`) e Estado virou select real — eram spans visuais;
  "Tamanho da empresa" segue visual (sem filtro no backend). Campos sem dado no
  Radar (porte, fundação, CNPJ, pessoa de contato) mostram "—"; coluna Contato
  exibe categoria do negócio + canal recomendado.
- Status reais mapeados: available=Novo, in_attendance=Em atendimento,
  sent_to_vendas=Enviado a Vendas, negative=Negativado (etc.). Empty state na
  tabela (template não tinha; necessário com dado real).
- "Exportar", "Criar abordagem" e "Ver histórico da empresa" seguem visuais
  (endpoints existem para export/eventos — ligar em PR próprio).
- Pendência: validação end-to-end com o backend + banco do Radar rodando (smoke
  local foi sem backend: tela renderiza estados de erro/vazio honestos).

## Fase 3 — extermínio do PWA fantasma (11/06/2026, ordem do dono)

**Sintoma:** telas antigas (login "Firebase Auth multi-tenant" do template
website-kit, landing desbotada) reapareciam em localhost:3001 mesmo depois de
corrigidas/deletadas — inclusive **sem nenhum servidor escutando a porta**
(provado via netstat vazio com a página carregando).

**Causa raiz:** o frontend antigo registrava o service worker `hbx-pwa-v1`
(`public/sw.js`, escopo `/`, ativo também em localhost via `PwaRegister.tsx`).
Ele cacheava navegações inteiras no navegador; o cache vive no Chrome por
origem (localhost:3001 e hbxsystem.com.br) e sobrevive a qualquer rebuild ou
deleção de código. Em produção, o mesmo SW também segura versão velha após
deploy.

**Correção permanente:**
1. `frontend/public/sw.js` virou **kill-switch** no mesmo URL do SW antigo:
   ao ser baixado na atualização automática do navegador, apaga todos os
   caches, desregistra a si mesmo e recarrega as abas. (O registro antigo
   usava `updateViaCache: "none"`, então o navegador sempre busca o sw.js
   novo na rede quando há servidor de pé.)
2. Boot do layout raiz ganhou faxina espelho: desregistra qualquer SW e
   limpa o CacheStorage em todo load.
3. O front novo NÃO registra service worker. **Regra: não recriar PWA/SW sem
   ordem explícita do dono.**
4. Em produção, o primeiro deploy do front novo limpa os navegadores de
   todos os clientes da mesma forma.

## Fase 4 — landing sem login paralelo + Vendas no board real (11/06/2026)

### Landing (ordem do dono)
- "Entrar" e todos os CTAs da landing navegam para `/login`. O overlay de
  login paralelo que existia no template de marketing foi REMOVIDO por ordem
  explícita do dono ("não era pra criar uma tela de login paralela"). O CSS
  do overlay permanece em marketing.css (cópia do handoff, inofensivo).

### Vendas ligado no board real
- `GET /vendas/board` → `{ summary, blocks: { today, overdue, scheduled,
  closed }, usage }`. O modelo real é **agenda de retorno em 4 blocos**, não
  funil de 5 etapas — o kanban do template renderiza os blocos reais (Hoje,
  Atrasados, Agendados, Fechados) com a mesma estrutura visual (.board,
  .col-head, .deal).
- Card real: nome, segmento/cidade, valor (priceLabel do produto ou
  saleValue; "—" sem dado), shortNote/statusLabel, nextAction, responsável
  (owner) e retorno (returnAt; fechados usam closedAt). Badge "Ganho" =
  saleConfirmedAt presente.
- KPIs da tela = summary real: Cards no funil, Para hoje, Atrasados,
  Fechados (delta "—" — não há comparativo mensal no contrato; sparkline
  segue visual do kit).
- Painel de detalhes: valor, produto, etapa (statusLabel), próximo retorno,
  último contato, tentativas, responsável — tudo real; sem dado → "—".
  Linhas "Probabilidade"/"Previsão de fechamento" do template não têm campo
  no contrato e foram substituídas pelos campos reais equivalentes
  (Próximo retorno / Último contato / Tentativas).
- Soma da coluna usa saleValue disponível; sem valores → "—". Contagem real
  por coluna. Empty state quando o funil está vazio (aponta para o Radar).
- Seguem VISUAIS como template (sem endpoint nesta fase, registrado):
  "Próximas tarefas", "Funil de conversão (mês)", botões "Todas as equipes"
  e "Novo lead" (criação manual é `POST /vendas/manual` — ligar em PR
  próprio com formulário).
- Pendência: validação end-to-end com backend de pé (smoke local sem backend
  mostra erro de carga honesto + colunas zeradas).

## Fase 5 — arquitetura "Radar acha → Leads distribui → Vendas trabalha" (11/06/2026, decisão do dono)

Decisões aprovadas pelo dono (4 perguntas respondidas):
A) duas telas (Radar + Leads distribuidor); B) renomear "Webscraping" → "Radar"
na sidebar; C) agenda como botão no cabeçalho do pipeline; D) distribuição
manual primeiro (regra automática visível, edição em PR seguinte).

### Renomeação
- Sidebar corporate e Rail friendly: "Webscraping" → "Radar". Título/crumbs da
  tela também. Rota canônica permanece `/webscraping` (sem alias novo).

### Leads = distribuidor (ligado)
- Base → `GET /webscraping/radar/leads` (mesma base do Radar; `status` como
  filtro real nos chips de etapa: Todas/Novo/Em atendimento/Enviado a
  Vendas/Negativado).
- KPIs reais via `meta.availableFilters`: Total na base, Quentes (score ≥ 70 —
  definição real do backend, era "≥ 75" no texto fake do template), Disponíveis,
  Em atendimento/Vendas.
- Colunas reais: Lead, Segmento, Cidade, Canal (recommendedChannel),
  Score, Etapa, Responsável (assignedUserId → nome via /users/company),
  Último contato. Coluna "Empresa" do template saiu: na base real o lead É a
  empresa (nome duplicado não informa nada).
- Distribuição manual → `POST /webscraping/radar/leads/distribute-to-vendedores`
  `{leadIds, userIds}` com select de vendedor (lista de
  `GET /users/company`; sem permissão de gerencial o bloco fica oculto).
- "Enviar p/ Vendas" → `send-to-vendas`. "Iniciar conversa" segue visual.
- Regra automática somente leitura: badge com status de
  `GET /webscraping/radar/auto-distribution` (ativa/pausada/rascunho).
  Edição + run ficam para PR seguinte (decisão D).
- "Mover etapa"/"Enviar proposta" do template deram lugar às ações reais da
  tela (distribuir/enviar) — registrado como adaptação por dado real.

### Agenda embutida no Vendas (ligado)
- Botão de relógio no panel-head "Pipeline de vendas" abre painel lateral
  "Agenda de retornos": Atrasados/Hoje/Agendados ordenados por `returnAt`
  (dados do próprio `GET /vendas/board`); clique no item seleciona o card no
  painel de detalhes.
- Ação real: "Sincronizar hoje no WhatsApp" → `POST /vendas/agenda/whatsapp/sync-today`.
- Observação de contrato: `GET /vendas/automation/agenda` retorna a CONFIG da
  agenda (janelas do atendimento), não a lista de retornos — a configuração
  pertence à tela de automação do Atendimento (PR futuro).

## Fase 6 — Atendimento ligado no inbox real (11/06/2026)

- Conversas → `GET /inbox/conversations?take=50` (nome/telefone do customer,
  prévia = última mensagem do summary, hora real, badge de não lidas via
  `metadata.whatsappUnreadCount`).
- Thread → `GET /inbox/conversations/:id/messages?limit=30` com polling de 8s;
  separadores de dia reais (Hoje/Ontem/data); `direction` INBOUND/OUTBOUND.
- Envio real → `POST /inbox/conversations/:id/message { content }` (WhatsApp
  via mensageria do backend/Webwhats); erro de envio aparece no composer.
- Selecionar conversa marca como lida → `PATCH /inbox/conversations/:id/read`.
- Tabs Todas/Não lidas/Minhas = filtro client-side (unread / humanAssigned);
  busca client-side por nome/telefone.
- Badge "Online" do template virou "Bot ativo" (campo real `botActive`);
  subtítulo do thread-head = telefone real (não há cargo/empresa no contrato).
- KPIs: "Atendimentos em aberto" = conversas carregadas; "Conversas
  qualificadas" do template virou "Não lidas" (dado real); tempo médio e
  conversões mostram "—" (sem contrato nesta fase).
- Painel: identidade/canal/última mensagem/bot/humano reais; "Últimas
  interações" derivada das 3 últimas mensagens da thread. Seguem VISUAIS:
  "Todos os canais", filtro, mensagem rápida, anexos/emoji/marcador do
  composer, "Histórico", "Ações rápidas" (Mover etapa/Criar tarefa/Enviar
  proposta) e "Carregar mais conversas" (paginação skip/before fica para PR
  seguinte junto com /inbox/events ao vivo).
- Fluxo de conexão WhatsApp (modal QR/status — WHATSAPP.md R2.9): NÃO entrou
  nesta fase; tela mostra aviso "conecte o WhatsApp" quando vazio. Webwhats/
  não foi tocado.
- Pendência: validação end-to-end com backend + Webwhats conectados.

## Fase 7 — conexão WhatsApp no Atendimento (R2.9, 11/06/2026)

- Fluxo canônico recriado no caminho exigido pela regra
  (`frontend/src/lib/whatsapp-connection-flow.ts`), porta do arquivo antigo +
  helpers de chamada: status/start/qr/disconnect/restart/bootstrap em
  `/companies/me/whatsapp-modal/*`. Tipos/labels em
  `frontend/src/lib/whatsapp-center.ts` (porta enxuta).
- Modal de conexão (`components/hbx/whatsapp-connect-modal.tsx`): status real
  com label PT-BR, QR (qrCodeDataUrl) com instrução de pareamento, polling de
  4s enquanto starting/waiting_qr/reconnecting, bootstrap automático ao
  conectar (espelha conversas/contatos e recarrega o inbox), desconectar em
  duas etapas (clique + confirmação), reiniciar sessão quando travado.
- Chip de status na coluna de conversas do Atendimento ("● WhatsApp: …")
  abre o modal — adição necessária (R2.9 manda o fluxo entrar com a tela;
  o template não tinha elemento de conexão).
- Rota `/whatsapp` (redirect para automação) fica para quando a tela de
  automação do Atendimento existir — anotado, sem alias por enquanto.
- Webwhats/ não foi tocado. Pendência: teste end-to-end com provider real.

## Fase 8 — Bot, Relatórios e Configurações ligados (11/06/2026)

### Bot (`GET /inbox/bot-config`)
- O bot real é CONFIG estruturada (mensagens/botões/regras), não grafo livre.
  Ligado o que é inequívoco: nós mapeáveis do canvas mostram os textos reais
  (Boas-vindas=welcomeMessage, Qualificação=mainMenuPrompt, Transferir para
  humano=humanAckMessage, Mensagem final=closeTopicMessage); o chat de teste
  usa welcomeMessage/welcomeButtons/mainMenuPrompt/postActionPrompt reais;
  badge do cabeçalho = setup real (✓ Configurado / Configuração pendente).
- Sem config (erro/sem backend) tudo cai no texto do template.
- **DECISÃO DE PRODUTO PENDENTE (dono):** editor do bot — o canvas do
  template é grafo drag-and-drop, mas o contrato é config fixa de cenas.
  Salvar/Publicar/tabs/arrastar blocos seguem visuais até essa definição.

### Relatórios (`GET /vendas/report`, `GET /vendas/seller-audit`, export.pdf)
- Períodos reais do contrato: Hoje/7 dias/30 dias (template tinha 30d/3m/6m/12m).
- KPIs reais: cards recebidos, chamados, taxa de resposta, taxa de conversão.
- "Receita por mês" virou "Top segmentos" (rankings.segments — não há série
  mensal de receita no contrato); "Leads por canal" = rankings.channels;
  funil real Recebidos→Chamados→Respostas→Interessados; recomendação do
  backend exibida sob o funil.
- "Desempenho por vendedor" = seller-audit real (Recebidos/Trabalhados/
  Fechados/Aproveitamento=workRate). Visível para Admin/Master.
- "Exportar PDF" baixa o PDF real (blob autenticado). "Exportar CSV" visual.

### Configurações
- Perfil: dados reais do current-user; salvar nome → `PATCH /profile/display-name`;
  e-mail/perfil de acesso somente leitura (sem PATCH no contrato); campo
  "Cargo" do template virou "Perfil de acesso" (role real); telefone sem
  campo no contrato (readOnly vazio).
- Empresa: razão social/telefone reais (company do current-user), somente
  leitura — não existe PATCH de empresa no contrato; CNPJ/segmento "—".
- Equipe: `GET /users/company` real (nome, e-mail, perfil, ativo/inativo);
  sem permissão de Admin mostra aviso. "Convidar membro"/"Gerenciar" visuais.
- Notificações: visuais (sem contrato). **"Plano e cobrança": VISUAL
  intocado** — zona de pagamento, só liga com ordem explícita do dono.

## Fase 9 — garantias finais, fontes, transições e cobrança (11/06/2026)

### Garantia 1 — zero legado do front antigo
Inventário completo de `frontend/` auditado: todo arquivo de `src/` nasceu do
handoff ou desta reconstrução. Limpos os últimos resquícios de referência:
ignore `.copilot-recovery-head.tsx` do eslint, variáveis Mercado Pago dos
`.env.example`/Dockerfile (sem código que as use), comentário morto em
colors.css. Varredura final: zero ocorrências de termos do app antigo.

### Garantia 2 — padrão único (mudou o padrão, mudam todas as telas)
Toda tela consome exclusivamente: tokens (`hbx-theme/*.css`) + kit do shell
(`components/hbx/shell.tsx`) + classes globais do handoff. Nenhuma tela tem
CSS próprio. Prova prática: a correção da FONTE (abaixo) foi 1 mudança no
layout raiz e corrigiu as 16 rotas de uma vez.

### Causa raiz da "grossura de texto diferente" (achado do dono)
O `@import url(google fonts)` do handoff é descartado pelo bundler de CSS do
Next — o app inteiro renderizava em Segoe UI (fallback) em vez de Plus
Jakarta Sans. Corrigido com `<link>` no head do layout raiz (mesma URL e
pesos do handoff). `tokens/fonts.css` agora documenta: NÃO recriar o @import.

### Transições (ordem do dono)
- `hbx-theme/transitions.css` + `src/app/template.tsx` (toda rota passa por
  `.hbx-page`): **corporate = fade simples** (0,18s) e micro-hover discreto;
  **friendly e site = alto nível** (rise com blur 0,55s, stagger na rail/main,
  elevação no hover, cross-fade de 0,45s na troca de tema/modo via classe
  temporária `hbx-theme-anim` que se remove sozinha — sem transição presa).
- Mesmo padrão do site ao app: landing e auth no tema friendly recebem o
  rise; app corporate recebe o fade.
- **Login/reset/confirm com switch Friendly↔Corporativo**
  (`AuthThemeControls`): persiste em `hbx:ws-theme`, respeitado pelo boot de
  tema; ◐ continua alternando claro/escuro do tema ativo (instantâneo no
  corporate, cross-fade no friendly).

### Plano e cobrança REAL (ordem explícita do dono nesta data)
- `GET /commercial-plans/me`: card do plano vigente (título do catálogo,
  preço da API, trial com dias restantes, estado de acesso projetado do
  canônico), usuários inclusos, implantação assistida, módulos liberados
  (entitlements) e catálogo completo de planos (título, badge, preço,
  headline, features) com destaque do plano atual.
- PAGAMENTOS.md respeitado: seção OCULTA para vendedor (userKind seller);
  nenhum preço/plano hardcoded — tudo da API; estado vem do
  `accessStateLabel` projetado (nunca re-derivado).
- "Gerenciar plano"/troca de plano/checkout NÃO ligados: o fluxo de
  pagamento ainda não existe no front novo — próxima trilha, com ordem.

### Master
Tela do master não refeita (fora deste PR). Com o padrão fechado (tokens +
kit + transições + telas ligadas), as janelas do master nascem pré-feitas
das mesmas peças — próxima fase natural junto com o fluxo de checkout.

## Fase 10 — contratos da fila pré-aprovada (12/06/2026)

- **Leads / auto-distribuição (decisão D do dono — "edição no PR seguinte"):**
  badge virou botão (Admin) que abre painel com a regra real
  (`GET/PUT /webscraping/radar/auto-distribution`): status
  rascunho/ativa/pausada, estoque e limite diário por vendedor, incluir
  admin (+campos próprios), segmento/cidade/UF preferidos, contagem de
  vendedores ativos, e "Executar agora" (`POST .../run`, habilitado só com
  regra ativa). **Bugfix:** o status da regra vem aninhado em `rule` — o
  badge lia a raiz e nunca aparecia.
- **Vendas / Novo lead manual:** botão abre modal do kit →
  `POST /vendas/manual` (nome, telefone, e-mail, próximo passo, nota);
  cria o card real e recarrega o board.
- **Atendimento / Carregar mais conversas:** paginação real
  (`take=50&skip=N`, dedupe por id); sem mais páginas mostra "Sem mais
  conversas".
- Ajuste de dobra (pedido do dono): Radar e Leads pedem `limit=8` à API —
  tela cabe sem rolagem como o template; paginação real compacta.

### Exports entregues (12/06/2026)
- Radar "Exportar": CSV client-side da base atual (até 2000 linhas, respeitando
  filtros). NÃO usa `POST /webscraping/export` — aquele endpoint dispara uma
  busca NOVA no motor (gasta quota); exportar a tela é leitura pura.
- Relatórios "Exportar CSV": CSV client-side com métricas, rankings e
  vendedores reais (não há endpoint CSV no contrato; PDF continua via API).

### PLANO DA TRILHA DE CHECKOUT — aguardando aprovação do dono
Contratos mapeados: `/financeiro/*` (overview, PUT card tokenizado,
checkout, subscription create/cancel/change-card/status, webhook MP) e
`POST /commercial-plans/select`.

Etapas propostas:
1. **Tela de checkout** (rota `/pre-checkout` vira tela real; sai o alias):
   motivo da regularização (`?reason=`), plano do catálogo, cartão com
   tokenização Mercado Pago no navegador (SDK MP + reintroduzir
   `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY` no .env — nunca trafegar número de
   cartão pelo nosso backend), `POST /financeiro/checkout` ou
   `subscription/create`; sucesso → `/dashboard`.
2. **"Gerenciar plano" nas Configurações**: status da assinatura, troca de
   plano (`/commercial-plans/select`), trocar cartão, cancelar (2 etapas).
3. **Guard-rails PAGAMENTOS.md**: tudo só para `userKind=admin`; preço só do
   catálogo; estado canônico; 403 genérico nunca vira payment_failed.
4. **Validação**: local com `PAYMENTS_PROVIDER=mock`, depois sandbox MP;
   e2e da persona contratante antes de produção.

Para executar preciso de: "go checkout" do dono + public key MP (sandbox)
na hora de testar.

## Fase 11 — embelezamento só-front (12/06/2026, ordem do dono)

- Overlays/modais/drawers/popovers com entrada animada do padrão único
  (classes `hbx-veil/modal/drawer/pop` em transitions.css): corporate =
  fade/slide curto e simples; friendly = rise/slide com blur de alto nível.
  Aplicado em: Novo lead e Agenda (Vendas), regra de distribuição (Leads),
  modal WhatsApp (Atendimento) e menu Sair (sidebar).
- Foco visível por teclado no padrão (`--ring-brand`) para botões/links/selects.
- Vistas friendly DEDICADAS no /workspace (Radar, Vendas, Bot, Relatórios,
  Configurações): linguagem glass do handoff, com Stat rows e seções; dados
  visuais "—" anotados na própria tela ("liga na fase técnica") — ligar nos
  mesmos contratos do corporate amanhã. Início/Esteira/Recovery/Cadastros
  seguem com as vistas do template.
- `prefers-reduced-motion` desliga todas as animações novas.

## Fase 12 — repasse total: "tudo que existe no backend" (12/06/2026, ordem do dono)

### Topbar real (shell — vale para todas as telas corporate)
- Sino = avisos do master reais (`GET /vendas/master-notices`): badge com a
  contagem de NÃO lidos (some quando zero), dropdown com título/corpo/data e
  "Marcar lido" (`POST /vendas/master-notices/:id/ack`).
- Balão = conversas com mensagem não lida no inbox real (badge some quando
  zero); clique vai para /atendimento.
- "+" abre o Novo lead do Vendas (flag de sessão; navega e abre o modal).
- Cache de 30s por módulo para não martelar a API a cada navegação.
- Os "8" e "3" fixos do template eram dado fake — substituídos pelo real.

### Bot — aba Configurações EDITÁVEL (decisão do dono: config mora no Bot)
- Tabs reais; "Configurações" edita a config do bot via
  `PATCH /inbox/bot-config`: 7 mensagens (boas-vindas, cliente retornando,
  menu, pós-ação, transferência humana, encerramento, bloqueado) + 5 regras
  de roteamento (toggles). "Salvar" do cabeçalho salva também.
- Integrações/Publicação/Análises: aviso honesto de "sem contrato ainda".

### Vendas — Prospecção automática (bot automático de prospecção)
- Botão-robô no cabeçalho do pipeline abre painel com
  `GET /vendas/automation/live-status` (poll 8s): status PT-BR (buscando/
  importando/agendando/enviando/aguardando/pausada/...), contadores (hoje,
  atrasados, futuros, enviados, positivos, falhas) e próximo disparo.
- Ações reais: Iniciar / Pausar / Retomar / Cancelar (2 etapas) em
  `POST /vendas/automation/prospecting/*`.
- Sem plano com Bot IA (HTTP 402) → aviso claro no painel.

### Dashboard ligado nos contratos existentes
- KPIs: cards no funil (board), leads na base (Radar), atendimentos em
  aberto (inbox), taxa de conversão 7d (report).
- "Receita (6 meses)" → "Top segmentos (7 dias)" (não há série de receita
  no backend); funil real do report.
- Atividade recente = eventos reais das timelines dos cards do board;
  Tarefas de hoje = retornos reais do bloco today; Top vendedores =
  seller-audit real (Admin).

## Fase 13 — REVISÃO PÁGINA POR PÁGINA (12/06/2026, pedido do dono)

Correções desta fase: Relatórios com erro do backend em DESTAQUE + "Tentar
novamente" (a tela parecia morta com o chip pequeno); logoff agora em 3
lugares: avatar da topbar (menu com Configurações/Sair), "⋮" do user-card
da sidebar, e botão "Sair" no rail do friendly.

### Estado por página (front)
| Página | Ligado | Ainda visual (sem prejuízo) | Falta de CONTRATO no backend |
|---|---|---|---|
| / landing | navegação | todo o conteúdo (correto) | — |
| /login (+reset/confirm) | auth completa, switch de tema | "Falar com vendas" | "manter conectado" (refresh token) |
| /dashboard | KPIs, segmentos, funil, atividade, tarefas, vendedores | — | série de receita mensal; endpoint agregado |
| /webscraping (Radar) | coleta+poll, base, contexto, CRM, export CSV | filtro "Tamanho", criar abordagem, ver histórico | filtro de porte |
| /leads | base, status, distribuição manual+regra+run | "Iniciar conversa" (backend TEM /inbox/conversations/start — ligar) | — |
| /vendas | board, agenda+sync, prospecção automática, novo lead | "Todas as equipes", funil/tarefas do painel, mover/fechar card (PATCH lead + attempt EXISTEM — próxima fase) | board filtrado por vendedor |
| /atendimento | conversas, thread, envio, lida, paginação, conexão QR | anexos/emoji, msg rápida, etapa, iniciar conversa manual (backend TEM) | KPIs tempo médio/conversões |
| /bot | config editável (7 msgs + 5 regras), teste real, setup badge | canvas drag&drop, Publicar, botões do menu (welcomeButtons — próximo) | Integrações/Publicação/Análises |
| /relatorios | report, vendedores, PDF, CSV, erro+retry | "Ver detalhes" | CSV server-side; receita mensal |
| /configuracoes | perfil (salva nome), empresa (leitura), equipe, plano real | foto, convidar/gerenciar membro, notificações | PATCH empresa; preferências de notificação; telefone do perfil |
| /workspace | shell, Início/Inbox template, Sair | 5 vistas novas (ligam na fase técnica) | — |
| master | NÃO construída (backend modules/master/* prontos) | — | — |

### Aliases temporários ativos
/boasvindas, /dashboard/master, /pre-checkout, /precheckout → /dashboard.

### Backend — lacunas de contrato identificadas (para a fase técnica)
1. Série de receita/atividade mensal (dashboard e relatórios).
2. Export CSV server-side.
3. `PATCH /companies/me` (editar dados da empresa).
4. Preferências de notificação do usuário.
5. Telefone no perfil (campo existe no User; não exposto no sanitizeUser).
6. Board de Vendas com filtro por vendedor (suporte ao "Todas as equipes").
7. Refresh token / "manter conectado".

### Diagnóstico "Relatórios não funciona"
Backend de pé e rotas existem (`/vendas/report` e `/vendas/seller-audit`
respondem 401 sem token = rota OK). A falha acontece AUTENTICADO — o erro
exato agora aparece em destaque na tela (com HTTP status) para o repasse de
amanhã no VPS. Candidatos: contexto master/empresa HBX no resolve do Vendas
ou capability do plano.

## Fase 14 — entrada trial-first 14 dias + /register + /planos (12/06/2026, ordem do dono)

Estratégia aprovada: aquisição estilo SaaS de prospecção (trial sem cartão,
valor na primeira sessão). O trial de 14 dias JÁ EXISTIA no backend
(`hbx_padrao`) — o cadastro só não enviava plano/telefone/CPF.

- **/register** (novo, moldura do login): Empresa, E-mail, "Como deseja ser
  chamado?", WhatsApp, CPF/CNPJ (exigência real do backend p/ trial,
  anti-abuso), Senha+confirmação com olhinho; envia `selectedPlanKey=
  hbx_padrao + trialModuleSelection=vendas + trialContactPhone +
  trialTaxDocument`. Copy: "Teste grátis por 14 dias… sem cartão".
  Pós-cadastro: com sessão devolvida (fluxo local confirma na hora) mostra
  "Tudo pronto ✓ … trial ativo até DD/MM" e botão "Encontrar meus primeiros
  leads →" que entra direto; sem sessão (produção) mostra confirmação de
  e-mail + reenviar. Selos de confiança (criptografia/LGPD/infra) do
  reference do dono.
- **Login**: "Falar com vendas" virou "Criar Conta" → /register (ordem).
- **/planos** (novo, público, linguagem da landing): List, Lead (destaque
  "14 dias grátis · sem cartão") e Empresarial sob consulta; preços do
  catálogo da API quando disponíveis — SEM hardcode; vitrine pública do
  catálogo entrou na fila do backend (PLAN12062026001 E1).
- **Landing**: CTAs de aquisição → /register ("Começar grátis — 14 dias",
  "Testar grátis por 14 dias"); empresa → /planos; nav "Planos" → /planos.
- **Validado E2E no backend real**: conta trial2-claude-*@hbx.test criada →
  trial ativo até 26/06/2026 (14 dias exatos) → sessão automática →
  /dashboard logado. A mensagem que o dono rejeitou ("finalize o pagamento")
  não aparece mais no fluxo trial.
- Pendência de decisão: destino de "Falar com especialista"/empresarial
  (hoje → /register).

## Fase 15 — gating por entitlement + tutorial List→Lead→Full (12/06/2026, ordem do dono)

### Módulos ocultos por plano
- `useEntitlements()` no shell (cache 60s de `/commercial-plans/me`).
- Sidebar corporate e Rail friendly FILTRAM por entitlement real:
  Leads/Radar ← `webscraping`; Vendas/Relatórios ← `vendas`; Atendimento ←
  `atendimento_chat`; Bot ← `bot_ia`; Recovery (friendly) ← `recovery`;
  Dashboard/Início/Configurações sempre. Sem flash: condicionais só aparecem
  após carregar. UX apenas — guard real continua no backend (PAGAMENTOS.md).
- Validado com conta trial (Lead): sidebar SEM o módulo Bot.

### Tutorial (/tutorial)
- 3 capítulos fixos List → Lead → Full, passos objetivos e CTA real por
  capítulo (Radar, Leads, Configurações/sob consulta).
- Marco dinâmico por planKey: hbx_lite termina no cap.1, hbx_padrao no cap.2,
  hbx_melhor no cap.3 — banner "✓ Seu tutorial termina aqui" + "Começar a
  usar" + "Continuar lendo". Capítulos além do plano = vitrine com tarja
  "Disponível no plano X / sob consulta" e botão "Ver planos" (/planos).
- "Pular tutorial" e "Concluir" marcam `hbx:tutorial-visto` (localStorage).
- `/boasvindas` agora redireciona para `/tutorial`: recém-confirmado de
  campanha cai direto no tutorial do plano dele.
- Validado E2E com a conta trial: cap.2 com marco, cap.3 com tarja de
  upgrade e "Ver planos".

## Checks executados

- `cd frontend && npm run lint` → limpo.
- `cd frontend && npm run build` → verde (16 rotas estáticas).
- Smoke visual (dev server + screenshots): dashboard escuro, leads claro,
  atendimento escuro, bot escuro, login, workspace friendly claro, landing — todos
  fiéis ao handoff.
- Validação visual final contra o HTML de referência: **pendente do dono**
  (gate do FRONTEND.md).
