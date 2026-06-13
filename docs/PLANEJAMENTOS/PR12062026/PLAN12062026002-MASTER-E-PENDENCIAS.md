# PLAN12062026002 — /master + TODAS as pendências (handoff de sessão)

> Escrito em 12/06/2026 ao fim de uma sessão longa. A próxima sessão deve
> ler ESTE arquivo + CLAUDE.md + docs/Rules/ antes de qualquer código.
> Estado geral: front novo 100% portado e ligado; funil de Ads completo;
> /gerencial restaurado; fila de backend E1–E5 aplicada e validada.
>
> EXECUÇÃO (12/06/2026, mesma data, sessão seguinte):
> - FOCO 1 (/master) CONSTRUÍDO e validado → PR12062026003-MASTER.md.
> - Fila E6 (encoding radar) e E7 (espelho tickets) APLICADAS → PLAN12062026001.md.
> - FOCO 2 (itens com contrato pronto) LIGADO → PR12062026004-FOCO2-PENDENCIAS.md
>   (dashboard links, inbox start no Leads/Atendimento, SSE, quick actions
>   do Vendas, botões do bot, convite/gestão de membro, 5 vistas friendly).
> - Continuam pendentes: checkout (aguarda "go checkout"), decisões do dono
>   (canvas do bot, "Manter conectado", especialista, termos/privacidade,
>   marca TOTVS), gaps de backend listados no PR…004 e dívidas técnicas.

## REGRAS DE OURO (não negociáveis, já combinadas com o dono)

1. **DEPLOY PROIBIDO** — nada sobe pro VPS até ordem EXPLÍCITA do dono.
   O VPS roda build antigo de propósito (consulta do front velho).
2. **Fila de backend**: pequenas edições que o dono avisar NÃO aplicam na
   hora — acumulam em PLAN12062026001.md e aplicam em lote
   (build → `docker restart backend` → validar item a item).
   O watch do container NÃO vê o mount do Windows: mudou backend = restart.
3. **Frontend edita na hora** (dev). Checks: `cd frontend && npm run lint
   && npm run build`. Backend: `npm run prisma:validate && npm run build`
   + testes do módulo tocado (`node --test dist/<mod>/<arquivo>.test.js`).
4. **Caminho do dinheiro** (comissão/venda/payout): rodar
   `node --test dist/vendas/vendas.service.test.js` ANTES e DEPOIS (68 testes).
5. **Dono tem TDAH alto e PEDIU rigidez**: se ele desviar do foco, avisar
   uma vez com clareza e deixar a decisão com ele.
6. Padrão único: toda tela usa tokens `hbx-theme/` + kit `shell.tsx`.
   Schema novo: padrão runtime-ensure do PrismaService (lista + MÉTODO +
   **chamada no runner** — os três lugares!).
7. Sessão de teste dev: `trial-claude-1781274521284@hbx.test` /
   `SenhaForte#2026` (ADMIN da empresa "Dup Teste"). Sessão é ÚNICA:
   login com forceSession derruba a outra (curl × navegador se atropelam).

## FOCO 1 — Construir o /master (ordem dada: "go master")

Contexto: o usuário "Jhonatan" é USERMASTER (isSystemMaster, sem companyId).
As telas operacionais são de empresa e falham para ele (já mostram aviso
amigável). O /master é a casa dele. Guard: `isSystemMaster` apenas
(useCurrentUser().isSystemMaster); item "Master" no menu do avatar só para
ele. Rota canônica `/master`; o alias `/dashboard/master` deve passar a
redirecionar para ela.

Backend PRONTO (controllers já existentes — ligar, não criar):
| Janela | Endpoints base |
|---|---|
| 1. Empresas (CORAÇÃO) | `master/provisioning` (criar/gerir empresa cliente); `GET modules/master/company/:id/detail`; `PUT /modules/master/company/:id/courtesy` (cortesia = única liberação grátis); users master: `PATCH users/master/:id/reset-password`, `PATCH users/master/:id`, `PATCH users/master/:id/delete` |
| 2. Integrações por empresa | `GET/POST modules/master/company/:id/integrations` + `:connectionId` PATCH/test/sync (padrão TagPlus; TOTVS futuro — marca só com autorização) |
| 3. Motor Radar master | `modules/master/webscraping`: engines/status, database-audit, database-cards (+DELETE batch), enrichment-cost/summary |
| 4. E-mails | `master/email` (editor de templates: kinds normal, password_reset, email_confirmation, seller_welcome, seller_onboarding_request; preview com variáveis {acesso},{senha},{comissao}...) |
| 5. Tickets | `owner/tickets` (tabelas hbx_support_ticket/hbx_job) |
| 6. Night Factory | `modules/master/night-factory` |
| 7. Notificações de pagamento | `master/payment-notifications` |
| — | `master-context` (ações de suporte/contexto master já auditam via registerSupportAction) |

Plano de ataque sugerido: layout /master com navegação própria (mesmo kit,
sidebar de janelas master) → Janela 1 (Empresas: lista via provisioning,
detail, cortesia, reset de senha de usuário) → depois 3 (motor) → 4
(e-mails — IMPORTANTE: é onde o dono edita o rascunho de vendedor) → 2, 5,
6, 7. Ler o shape de cada controller ANTES (foi assim o gerencial inteiro).
Login do master hoje cai em /dashboard — ao criar /master, ajustar o
front para mandar isSystemMaster para /master (não mexer no next do backend).

## FOCO 2 — Pendências por tela (NADA fica para trás)

### Compras/planos (aguardando "go checkout" do dono)
- Trilha completa documentada em
  docs/PLANEJAMENTOS/PR11062026001/FRONTEND-TEMAS-RESET.md (seção "PLANO DA
  TRILHA DE CHECKOUT"): /pre-checkout vira tela real (hoje alias), cartão
  tokenizado Mercado Pago (reintroduzir NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY),
  `/financeiro/*` (checkout, subscription create/cancel/change-card/status).
- ✅ FEITO (13/06/2026): "Gerenciar plano" das Configurações deixou de ser
  visual — ligado em POST /commercial-plans/select (Configurações → Plano e
  cobrança, só ADMIN/master via canSelectPlan). Botão rola até o catálogo da
  própria tela; cada plano não-atual tem "Trocar para este plano" com confirm
  honesto. Backend manda a regra: trocar p/ plano diferente cai em
  pending_checkout + desativa a empresa (sem afrouxar paywall); "Full" volta
  "Fale com a HBX". FALTA AINDA: a trilha de pagamento de fato (pre-checkout
  real + Mercado Pago + /financeiro/*) para o acesso voltar sem reativação
  manual. Cuidado: trocar plano na HBX interna derruba a cortesia.
- PAGAMENTOS.md vale inteiro: vendedor nunca vê; preço só da API.

### Bot
- Decisão de produto pendente do dono: editor é config de cenas (real) ×
  canvas drag-drop (visual). Abas Integrações/Publicação/Análises sem contrato.
- Editor dos BOTÕES do bot (welcomeButtons/mainMenuButtons — contrato existe
  no PATCH /inbox/bot-config). Botão Publicar é visual.

### Atendimento
- Tempo real: GET /inbox/events (SSE) — hoje polling 8s.
- Iniciar conversa manual: POST /inbox/conversations/start (EXISTE, só ligar).
- Anexos/emoji/mensagem rápida/etapa do thread: visuais.
- KPIs tempo médio/conversões: sem contrato (gap backend).

### Vendas
- "Todas as equipes": board filtrado por vendedor = gap de backend (query).
- Painel "Próximas tarefas" e funil lateral: visuais do template.
- Mover card de bloco/registrar tentativa: PATCH lead/:id (returnAt/status) e
  POST lead/:id/attempt EXISTEM — ligar nas quick actions (hoje só fechar).

### Leads
- "Iniciar conversa" → ligar no inbox start.
- Linhas por página fixa em 8 (o dono pediu sem rolagem; select é visual).

### Dashboard
- Links "Ver tudo"/"Ver relatório"/"Ver todas no Vendas": ligar navegação.
- Série mensal de receita: gap de backend.

### Configurações
- Convidar membro → ligar no fluxo real de convite (POST users/company/create
  — convite com senha por link). Gerenciar membro (role/ativação) idem.
- Foto de perfil: visual. Notificações: sem contrato (gap). PATCH empresa:
  gap. Telefone do perfil: campo existe no User mas não exposto (gap).

### Relatórios
- "Ver detalhes" visual; CSV server-side: gap (client-side já funciona).

### Friendly (/workspace)
- Ligar as 5 vistas novas (Radar/Vendas/Bot/Relatórios/Config) nos MESMOS
  contratos do corporate (estão visuais com nota "liga na fase técnica").
- Esteira/Recovery/Cadastros: vistas do template ainda visuais
  (backend: hbx-recovery e cadastros existem).

### E5 fase 2 (caso de cancelamento — núcleo já APLICADO e validado)
- Sino DIRECIONADO ao vendedor (precisa targetUserId no MasterNotice +
  filtro na listagem) para o aviso de desfecho — hoje o desfecho vai pelo
  timeline do card (decisão registrada, suficiente v1).
- Refund pro-rata refinado por billingCycle real da empresa vinculada.

### Trabalhe Conosco (núcleo COMPLETO e validado)
- Upload de currículo PDF: entra na fase de onboarding pós-aprovação (anexos
  já existem) — opcional na candidatura se o dono quiser depois.
- "Aprovar" pode ganhar atalho que abre o convite preenchido (hoje devolve
  instrução em texto).
- PRODUÇÃO precisará da env NEXT_PUBLIC_HIRING_COMPANY_SLUG (dev está em
  frontend/.env.local, gitignored).

### Conteúdo/decisões do dono pendentes
- Termos de uso/Privacidade: texto jurídico (criar /termos e /privacidade).
- Destino do "Falar com especialista"/empresarial (WhatsApp comercial?).
- "Manter conectado" do login: criar refresh-token/sessão longa (gap) ou
  remover o checkbox.
- Autorização da marca TOTVS (até lá, UI fala "integração/ERP").

### Dívidas técnicas registradas
- runtime-ensure marcados shouldBecomeMigration=true → virar migrations de
  verdade um dia (vendas-cancellation-case-columns, hbx-job-application-table
  e os antigos).
- Dados de teste no dev DB (empresas Trial/Dup/HBX3, produtos Validacao E3
  etc.) — limpar quando incomodar.
- E-mail E2 em produção SÓ resolve com deploy (autorização do dono).
- test:e2e das 3 personas: rodar quando ambiente estiver pronto.

## Onde está cada documentação
- Reset do front + fases 1–15: docs/PLANEJAMENTOS/PR11062026001/FRONTEND-TEMAS-RESET.md
- Fila de backend (E1–E5, todos APLICADOS): PR12062026/PLAN12062026001.md
- Trilha Produtos & Comissão (itens 1–5 CONCLUÍDOS): PR12062026/TRILHA-PRODUTOS-COMISSAO.md
- Regras por domínio: docs/Rules/ (FRONTEND.md foi reescrito e está atual)
