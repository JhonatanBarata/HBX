# HBX Repo Map

Mapa de alto nivel do repositorio. Ele e propositalmente orientado a agente: mostra onde olhar primeiro e onde evitar leitura inicial.

## Raiz

- `AGENTS.md`: instrucoes raiz para agentes. Deve ficar na raiz para ser lido automaticamente.
- `README.md`: resumo SaaS, comandos oficiais e observacoes de ambiente.
- `OPS.md`: comandos operacionais publicos e fluxo de deploy/verificacao.
- `package.json`: scripts raiz para local, deploy, e2e e owner agent.
- `docker-compose*.yml`, `Dockerfile`, `deploy/`: infraestrutura local/producao. Nao alterar em tarefas funcionais sem pedido claro.
- `.env*.example`: exemplos de ambiente. Nao abrir, imprimir ou editar `.env` reais sem necessidade explicita.
- `publish-trigger.txt`: artefato operacional.

## `backend`

NestJS + Prisma + TypeScript. Fonte de verdade para auth, tenant, planos, quotas, webhooks, Radar, Vendas, WhatsApp bridge e financeiro.

Arquivos centrais:

- `backend/src/app.module.ts`: registra modulos do Nest.
- `backend/src/main.ts`: bootstrap, CORS, ValidationPipe, proxy condicional para webscraping.
- `backend/prisma/schema.prisma`: modelos persistidos.
- `backend/src/prisma/prisma.service.ts`: acesso Prisma.
- `backend/src/bootstrap/structural-defaults.json`: defaults estruturais de modulos, planos, features e seed local.

Pastas:

- `access`: governanca de acesso de vendedor.
- `admin`: sessoes ativas e recursos administrativos.
- `auth`: login, perfil, JWT, roles, guards admin/master e preferencias de tema.
- `bootstrap`: seed/defaults estruturais do sistema.
- `cadastros`: cadastros operacionais como pais, porto, transit time e fornecedores.
- `categories`: categorias de produtos.
- `commercial-plans`: catalogo comercial, entitlement guard, quotas/limites e billing de seats/cards.
- `commissions`: sincronizacao de comissoes.
- `companies`: empresas/tenants, status operacional e sincronizacao WhatsApp cliente.
- `customer-profile`: perfil e historico do cliente/contato.
- `financeiro`: cobrancas, financeiro e webhooks financeiros.
- `gerencial`: gestao, onboarding de sellers, contratos e indicacoes/parcerias.
- `hbx-recovery`: fluxo de recuperacao/cobranca com templates e webhook proprio.
- `inbox`: atendimento, filas, configuracao e lixeira/purge.
- `integrations`: conexoes externas, secrets, AUVO, TagPlus, ledger de webhooks externos.
- `mail`: envio de e-mail, templates master e apresentacao.
- `master-context`: assumicao/saida de contexto master e auditoria.
- `messaging`: WhatsApp HBX, conversas, orquestrador, bridge Webwhats, consent ledger e auditoria.
- `modules`: modulos globais/por empresa, policy e guard de acesso.
- `night-factory`: fabrica/rewards/trabalhos noturnos.
- `owner`: tickets do owner/local agent.
- `payments`: cliente Mercado Pago. Area sensivel.
- `plans`: planos/features legados ou administrativos.
- `products`: produtos e versoes.
- `pulse`: resumo/sinalizacao HBX Pulse.
- `support`: suporte.
- `users`: usuarios.
- `vendas`: leads comerciais, automacao, safety, enrichment, fingerprints e comissoes.
- `webscraping`: Radar, busca, enriquecimento, distribuicao, providers e runtime.
- `website`: geracao/gestao de websites.
- `website-kit`: sites gerados por empresa; normalmente nao ler tudo em tarefas gerais.
- `public`: uploads/admin assets.

Principais modelos Prisma por dominio:

- Empresas/usuarios/auth: `Company`, `User`, `AuthSession`, `PasswordReset`, `MasterAssumedContextSession`.
- Comercial: `CompanyCommercialEntitlement`, `CompanyCommercialUsageLog`, `CompanySubscription`, `CommercialPlanProviderMapping`, `Plan`, `Feature`, `SystemModule`, `CompanyModule`, `UserModuleAccess`.
- Radar/webscraping: `WebscrapingSearchHistory`, `WebscrapingSearchRun`, `WebscrapingSearchRunItem`, `WebscrapingSourceQuality`, `RadarLeadPool`, `RadarLeadCompanyState`, `RadarLeadEvent`, `RadarAutoDistributionRule`, `RadarDistributionDailyUsage`, `RadarLeadEnrichment`, `RecoveryOpportunity`, `WebscrapingCampaign`, `WebscrapingCampaignTask`, `RadarFactoryCursor`, `RadarStockConfig`.
- Vendas: `VendasLead`, `VendasLeadTimelineEvent`, `VendasAutomationCampaign`, `VendasAutomationJob`, `VendasCommissionPayout`, `VendasCommissionReceivable`, `SalesProfile`, `VendasCardComplaint`.
- WhatsApp/atendimento: `WhatsAppConnectionSession`, `CompanyWhatsAppEndpoint`, `WhatsappConsentLedger`, `CompanyConversation`, `CompanyMessage`, `Conversation`, `Message`, `ConversationSession`, `OrderDraft`, `InboundMessage`, `OutboundMessage`, `OutboundAttempt`, `WhatsAppWebhookEvent`, `WhatsAppAuditLog`, `AtendimentoCustomer`, `AtendimentoAppointment`.
- Financeiro/recovery: `FinanceiroCharge`, `HbxRecoveryCustomer`, `HbxRecoveryPayment`, `HbxRecoveryFlowStage`, `DebtCase`.
- Integracoes: `IntegrationConnection`, `IntegrationSyncRun`, `ExternalWebhookEvent`, `AuvoExternalRecord`, `MasterGlobalIntegrationConfig`.
- Owner/suporte: `HbxSupportTicket`, `MasterSupportAuditLog`, `HbxJob`, `TechAssistantInteraction`, `MasterNotice`, `MasterNoticeAck`.
- Cadastros/produtos: `Product`, `ProductVersion`, `Category`, `CadastroFornecedor`, `CadastroPais`, `CadastroPorto`, `CadastroTransitTime`.

## `frontend`

Next.js App Router + React + TypeScript. UI publica e operacional em PT-BR.

Arquivos centrais:

- `frontend/src/app/layout.tsx`: providers, tema, topbar, PWA, gate pre-checkout, popup Radar e ajuda WhatsApp.
- `frontend/src/app/globals.css`: tokens e classes globais.
- `frontend/src/app/_lib/api.ts`: cliente/helper de API.
- `frontend/src/app/_lib/useRequireAuth.ts`: guard client-side de autenticacao.
- `frontend/src/app/_lib/useRequireModule.ts`: guard client-side de modulo.
- `frontend/src/lib/theme-palettes.ts`: paletas.
- `frontend/src/lib/billing-access.ts`: logica client-side de acesso comercial. Nao usar como fonte final de autorizacao.

Rotas principais:

- `app/page.tsx`: entrada.
- `app/login`, `app/register`, `app/reset-password`, `app/confirm-email`: auth.
- `app/dashboard`: aliases/rotas antigas para modulos.
- `app/radar-digital`: cockpit Radar.
- `app/webscraping`: modulo webscraping.
- `app/vendas`: cockpit Vendas.
- `app/vendas/automacao`: automacao de Vendas.
- `app/whatsapp`: centro WhatsApp.
- `app/atendimento`: atendimento/inbox.
- `app/messages`: mensagens.
- `app/auto-replies`: respostas automaticas.
- `app/cadastros`: cadastros.
- `app/bancodedados`: banco de dados operacional.
- `app/gerencial`: gerencial.
- `app/financeiro` via dashboard/master: financeiro.
- `app/master/*`: telas master clientes, email, exclusoes, financeiro, links, operacao, planos, webscraping, WhatsApp.
- `app/hbx-recovery`: recovery/cobranca.
- `app/planos`, `app/checkout`, `app/pagamento`, `app/pre-checkout`, `app/precheckout`: compra/acesso comercial. Area sensivel.
- `app/mobile/*` e aliases `mobile-*`: experiencias mobile.
- `app/website`: websites.
- `app/tutorial`, `app/boasvindas`, `app/layouts`, paginas legais.
- `app/api/tutorial-card-image`: rota interna para imagem de tutorial.
- `app/webhooks/whatsapp`: webhook no frontend quando aplicavel.

Componentes globais:

- `DashboardScaffold`: scaffold operacional.
- `HbxGuide1`: guia principal horizontal.
- `HbxGuide4`: guia vertical icon-only.
- `ThemeProvider`, `ThemeSwitcher`, `TopBar`, `PageTransition`, `InterfaceTransitionProvider`.
- `PreCheckoutGate`, `PlanSelectionExperience`, `PremiumLaunchDialog`.
- `RadarPopupHost`, `WhatsAppHelpBubble`, `WhatsAppOperationalDialog`.

Biblioteca:

- `hbx-modules.ts`: catalogo client-side de modulos.
- `commercial-plans.ts`: dados client-side de planos.
- `whatsapp-center.ts`, `whatsapp-connection-flow.ts`: fluxos WhatsApp.
- `radar-active-run.ts`: estado de execucao Radar.
- `route-aliases.ts`: aliases de rotas.
- `renderSafeText.ts`: renderizacao segura.
- `topbar-progress.ts`, `workspace-edit-events.ts`, `window-layout-presets.ts`: experiencia de workspace.

## `Webwhats`

Area WhatsApp separada, baseada em Evolution API. Tem `AGENTS.md` proprio e regras especificas.

Estrutura:

- `src/main.ts`: entrada.
- `src/api/server.module.ts`: composicao da API.
- `src/api/routes`: rotas Express.
- `src/api/controllers`: handlers finos.
- `src/api/services`: regra de negocio.
- `src/api/provider`: sessoes/instancias WhatsApp.
- `src/api/integrations`: canais, chatbots, eventos e storage.
- `src/api/guards`: auth/instance/telemetry.
- `src/api/repository`: Prisma repository.
- `src/validate`: schemas JSONSchema7.
- `src/cache`: Redis/local cache.
- `src/utils`: JID, i18n, status, proxy, auth-state, telemetria.
- `prisma`: schemas/migrations PostgreSQL/MySQL.
- `Docker`, `systemd`, `prometheus.yml.example`: infraestrutura.

Regra critica: toda operacao deve ser isolada por instancia/tenant.

## `hbx-scraping-engine`

Motor Python isolado do Radar moderno.

Estrutura:

- `app/main.py`: FastAPI.
- `app/cli.py`: CLI.
- `app/schemas.py`: contratos de request/response.
- `app/config.py`: configuracao.
- `app/services/discovery.py`: discovery de URLs.
- `app/services/fetcher.py`: HTTP fetch.
- `app/services/parser.py`: extracao HTML/JSON-LD/meta/telefone.
- `app/services/normalizer.py`: normalizacao de telefones e campos.
- `app/services/scoring.py`: score.
- `app/services/search_service.py`: orquestracao de busca.
- `app/services/web_search_service.py`: busca web interna.
- `app/services/social.py`: sinais sociais.
- `app/services/storage.py`: cache SQLite.
- `app/search/*`: enriquecimento, ranking e fontes.
- `tests`: pytest.
- `data-*`: caches/dados locais; nao ler em varredura inicial.

Contrato de resultado valido: `name`, `phone`, `phoneDigits`; opcionais incluem `rating`, `reviews`, `address`, `website`, `score`, `source`.

## `webscraping`

App Python/Streamlit legado ou demonstrativo com Google Places/mock.

- `app.py`: UI Streamlit.
- `services/google_places.py`: Google Places.
- `services/cities.py`: cidades.
- `utils/phone.py`: telefone.

Use quando a tarefa mencionar app Streamlit/Google Places. Para Radar atual, prefira `hbx-scraping-engine` e `backend/src/webscraping`.

## `docs`

Documentacao, auditorias, runbooks, assets e referencias visuais.

- `docs/ai`: contexto para agentes.
- `docs/compliance`: compliance, como WhatsApp opt-in.
- `docs/security`: secrets, webhooks e seguranca.
- `docs/ops`: runtime e operacao.
- `docs/monetization`: playbooks de monetizacao/mobile.
- `docs/radar-smoke-results`: resultados de smoke.
- `docs/ICONES`, `docs/TUTORIAL`, imagens `RADAR*`, `VENDAS*`: assets/referencias visuais.
- `docs/RADARCORRECAO.MD`: documento grande de correcao/anotacoes Radar.
- `docs/WEBWHATS_ATENDIMENTO_AUDIT.md`: auditoria Webwhats/Atendimento.
- `docs/Deep Research do repositório HBX 06-06.pdf`: pesquisa profunda em PDF.

## `scripts`

Automacao local/producao. Area operacional; nao rodar deploy/publish/release sem pedido explicito.

- `start-all.ps1`, `stop-all.ps1`: ambiente local.
- `deploy-hostinger.js`, `release.js`, `publish.js`, `ops/*`: deploy/publicacao.
- `verify-prod.js`, `smoke*.js`, `whatsapp-smoke.js`: verificacoes.
- `backup-prod.js`, `backup-before-format.ps1`: backup.
- `generate-hbx-engines-compose.js`, `cleanup-hbx-extra-engines*`: motores.
- `commit.js`: commit automatizado.

## `tests`

Playwright e testes de politica/contrato no nivel raiz.

- `tests/e2e`: fluxos e2e.
- `tests/radar-backend-policy.test.mjs`: politica backend do Radar.
- `tests/frontend-radar-channel-filter.test.mjs`: filtro de canal Radar no frontend.
- `tests/frontend-vendas-channel-icons.test.mjs`: icones/canais em Vendas.

## `ops-control`

Painel/servidor local de controle operacional.

- `server.js`: servidor.
- `public/*`: UI.
- `README.md`: uso.

## `hbx-owner`

Ferramentas do owner e agente local.

- `local-agent/server.js`: agente local.
- `local-agent/allowlist.json`: comandos permitidos.
- `local-agent/COMMANDS.md`, `README.md`: docs.
- `automations/catalog.example.json`: catalogo exemplo.
- `windows-app`: app desktop Python, quando presente.

## `electron`

Shell Electron simples.

- `main.js`
- `icon.ico`
- `ELECTRON_README.md`

## `patches`

Diffs historicos e propostas de alteracao. Nao aplicar automaticamente sem entender se ainda sao atuais.

## `.orchestrator`, `.githooks`

Arquivos auxiliares de orquestracao e hooks Git.

## Pastas a evitar em leitura inicial

- `node_modules`: dependencias.
- `.git`: metadados Git.
- `.worktrees`: worktrees paralelos, podem ter estado antigo.
- `postgres-data`: dados locais Postgres.
- `storage`: runtime local.
- `backups`: backups.
- `backend/website-kit/companies/*/site`: sites gerados e muitos assets.
- `hbx-scraping-engine/data-*`: caches/artefatos do motor.
