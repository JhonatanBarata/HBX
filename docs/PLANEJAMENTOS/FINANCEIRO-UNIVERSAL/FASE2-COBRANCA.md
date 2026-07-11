# FINANCEIRO-UNIVERSAL — Fase 2: COBRANÇA (recebimento direto do lojista + régua no WhatsApp)

> **Para o executor (Opus):** frente financeira → Opus edita DIRETO + revisão de diff (âncora do
> dono). Este arquivo é autossuficiente. Leia também `PLANO.md` (Fase 1, já em prod `f598c3ea`)
> e a memória `financeiro-universal-frente.md`. Mapa técnico-fonte: workflow de 8 agentes 11/07
> (fatos com arquivo:linha citados abaixo foram verificados no código em 11/07 — confira de novo
> antes de editar, o repo anda rápido e há sessões paralelas no mesmo tree).

## Decisões do DONO (11/07, literais — não amaciar)
1. **O lojista recebe SEMPRE direto na conta DELE.** Duas vias: (a) Pix estático (chave dele,
   QR/copia-e-cola, taxa zero, baixa manual) e (b) conta Mercado Pago DELE conectada (link de
   pagamento, baixa automática via webhook). **O dinheiro NUNCA passa pela conta MP da HBX.**
   "Receber pelo HBX" = o app gera/acompanha a cobrança; NÃO = intermediação financeira.
2. **Régua automática de cobrança: APROVADA**, com DUAS condições e só elas:
   (a) só roda se o admin **ativar o módulo** (opt-in explícito);
   (b) o admin **sempre enxerga quem está sendo cobrado** (painel + histórico por cliente).
   SEM aprovação prévia por lote — é visibilidade, não burocracia.
3. **A régua usa o MESMO chip e o MESMO caminho blindado** do aviso "sua entrega chegou"
   (`queueOutboundForCompany` → outbox → dispatcher → throttle). Não criar caminho de envio novo.
4. **Receita da PLATAFORMA (recarga de créditos / assinatura) cai SEMPRE na conta MP master.**
   Nunca na conta MP de tenant (fix do furo de direção).

## Invariantes — o que NUNCA pode acontecer (todo sprint valida contra esta lista)
- **I1** Mensagem de cobrança pra quem NÃO tem dívida vencida REAL (`FinanceiroCharge` `pending`
  com `dueDate < hoje`, origem no catálogo do tenant). Recalcular a dívida NA HORA do envio —
  cliente que pagou entre a varredura e o disparo NÃO recebe cobrança.
- **I2** Cobrança com o módulo desativado (qualquer gate desligado → no-op silencioso).
- **I3** Cliente marcado "não cobrar" (ou opt-out) recebendo mensagem.
- **I4** Mesmo cliente cobrado 2× no mesmo estágio (idempotência dura por [cliente, estágio]).
- **I5** Receita da HBX (recarga/assinatura) caindo em conta MP de tenant.
- **I6** Dinheiro do cliente final caindo na conta MP master por fallback silencioso.
- **I7** Envio fora da fila blindada (socket direto / sem throttle) — proibido; o caminho é
  `queueOutboundForCompany` e nada além.
- **I8** Loop/retry de envio sem teto. Falhou → loga e espera o próximo ciclo do cron. NUNCA
  re-tentar em loop (a máquina de ban histórica era loop, o freio é a correção — ver CLAUDE.md).

## Estado atual (fatos do mapa, com fonte)
- Motor de cadência NÃO existe: `HbxRecoveryFlowStage.daysAfter` é config morta (CRUD em
  `hbx-recovery.service.ts`, zero scheduler na pasta). Envio hoje = manual (`startTemplateFlow`,
  `sendPaymentLink`) ou reativo (devedor responde → menu do bot).
- Varredura da logística (`logistica-recovery.service.ts`, cron 24h + POST /logistica/recovery/varrer)
  já injeta inadimplente no funil (`HbxRecoveryCustomer` + `DebtCase`, `sourceModule='logistica'`),
  opt-in `LogisticaConfig.moduloRecoveryAtivo` (default false) — **só cria o caso, não envia nada**.
- Quitar fiado já fecha o caso (para a cadência de quem pagou): `logistica.service.quitarCharge`
  → `resolverSeQuitado` → só casos `sourceModule='logistica'`.
- Freio de chip existe mas está OFF: `WaSendThrottleService` (8/min, 120/h, warm-up 14d) atrás de
  `HBX_WA_SEND_THROTTLE_ENABLED` — **ligar na VPS é PRÉ-REQUISITO do S2**.
- Decisor de conta MP: `resolveCompanyMercadoPagoAccess` (master-global-integrations.util.ts:282)
  prefere token do TENANT e cai pro master. Usado pelo recovery (certo) E pela recarga
  (credit-recharge.service.ts:108 — ERRADO, é o furo I5). Token de tenant hoje só o master cola
  (companies/master/:id/mercadopago) — nenhum fluxo self-service.
- Webhook MP roteável por `?company_id=`; assinatura validada com 1 secret global em modo `log`
  (`MP_WEBHOOK_SIGNATURE_MODE`) — multi-conta exige secret por empresa ANTES de `enforce`.
- Fase 1 (em prod): módulo `financeiro-tenant` (`/financeiro-tenant/saldos|extrato|quitar`),
  tela central `/financeiro`, catálogo `TENANT_FINANCE_SOURCE_MODULES`, vendas gera cobrança.
- UI faltando hoje: `moduloRecoveryAtivo` NÃO tem toggle em tela nenhuma (só API/banco);
  `HbxRecoveryCustomer.automationEnabled` existe no schema sem UI; funil recovery tem ~40
  endpoints sem tela de gestão.

## Sprints (ordem de execução)

### S1 — Direção do dinheiro (cirúrgico, backend só)
**Objetivo:** fechar I5. Receita da plataforma nunca mais resolve token de tenant.
- Criar helper `resolvePlatformMercadoPagoAccess(prisma)` que resolve SÓ da biblioteca master /
  env (`MERCADO_PAGO_ACCESS_TOKEN` / `pickMasterMercadoPagoCredential`), SEM olhar
  `Company.mercadoPagoAccessToken`.
- Trocar em: `credit-recharge.service.ts` (`resolveMpAccessToken`) e nos pontos do
  `financeiro.service.ts` que cobram PLANO/assinatura do tenant (conferir `resolveFinanceContext`
  ~L1072). **NÃO tocar** nos usos do recovery/messaging (lá o token do tenant é o CERTO).
- Teste: recarga com company que TEM `mercadoPagoAccessToken` próprio → pagamento criado com
  token master (mock/assert no client). Suíte de créditos segue verde.
- **NÃO mexer** no fallback master do recovery neste sprint (é o I6, fecha no S4 junto com a
  tela de conectar conta — fechar antes quebraria quem depende do fallback hoje).

### S2 — Motor de cadência (a régua)
**Objetivo:** cobrança automática de INADIMPLENTE, mesmos trilhos do aviso de entrega.
- **Pré-requisito de deploy: `HBX_WA_SEND_THROTTLE_ENABLED=true` na VPS** (o freio de 8/min,
  120/h). Sem a flag ligada o sprint não vai pra prod.
- Cron caseiro no padrão do repo (`logistica-recovery.service.ts` é o modelo: setInterval +
  passada de boot com delay), rodando ~1×/hora. Fluxo por empresa:
  1. Gates (TODOS, fail-closed): `company.botArmedAt` + `recoveryBotLiveAt` +
     `LogisticaConfig.moduloRecoveryAtivo` + `resolveCompanyAccessState.canUse` (empresa
     suspensa não roda).
  2. Casos elegíveis: `HbxRecoveryCustomer` com `openAmount>0` + `automationEnabled=true` +
     telefone válido + `sourceModule='logistica'` (fase 2 restrita à logística; genérico depois).
  3. Estágio devido: dias desde a criação do caso (ou desde o último estágio enviado) ≥
     `daysAfter` do próximo `HbxRecoveryFlowStage` da empresa.
  4. **Recheck de dívida ao vivo (I1):** recomputar o vencido em aberto AGORA; zerou → fecha o
     caso e não envia.
  5. Enviar via `queueOutboundForCompany` (I7) com a mensagem do estágio: valor devido + Pix
     copia-e-cola (chave estática da `LogisticaConfig`, gerar com o mesmo util `pix-brcode` —
     hoje é client-side no app de entrega, portar/duplicar para o backend) + (se S4 pronto e
     conta MP conectada) link de pagamento.
  6. Registrar o envio (idempotência I4): reusar o modelo de interação existente do recovery
     (`HbxRecoveryInteraction` ou equivalente — CONFERIR o nome no schema) com UNIQUE
     [customerId, stageId]; corrida → P2002 → pula.
- Cooldown implícito pela escada de estágios (d0/d2/d5/d8/d12 default). Acabaram os estágios →
  caso fica parado (sem loop de "última tentativa" repetida).
- Opt-out (I3): campo "não cobrar" por cliente (ver S3) + qualquer opt-out global de mensagens
  existente no messaging — CONFERIR o mecanismo do classificador de opt-out do atendimento e
  respeitá-lo.
- Crédito: NADA debita (Baileys nunca debita — decisão do dono). O hook de track do sendOne já
  mede por sourceModule; conferir allowlist e, se preciso, adicionar a origem nova como track.
- Testes: unit do seletor de elegibilidade (todos os gates), do cálculo de estágio devido e da
  idempotência. E2E: empresa de teste + número descartável do Claude (validação de software
  novo — motor/estágios/mensagem — antes de rodar em chip de cliente).

### S3 — Painel "Cobrança" na tela /financeiro (transparência = condição do dono)
**Objetivo:** o admin SEMPRE sabe quem está sendo cobrado. Sem isso a régua não liga.
- Aba/seção "Cobrança" em `/financeiro` (client em `frontend/src/app/(app)/financeiro/`):
  - **Toggle do módulo** (o `moduloRecoveryAtivo` ganha UI aqui — hoje só existe via API) com
    texto honesto: "Ao ligar, clientes com dívida vencida e telefone entram na régua de
    cobrança pelo seu WhatsApp".
  - **Lista "quem está na régua"**: nome, valor devido, estágio atual, última mensagem (quando),
    próxima mensagem (previsão), com botão **Pausar** por cliente (`automationEnabled=false`)
    e **Pausar tudo** (desliga o módulo).
  - **Histórico por cliente**: interações de cobrança (o que foi mandado, quando, pagou?).
  - Botão **"Cobrar agora"** manual por cliente (reusa `sendPaymentLink`/fluxo atual).
- Ao LIGAR o módulo, mostrar na hora a lista de quem VAI entrar (inadimplentes atuais) — o
  admin liga já vendo o efeito. Cliente elegível nasce `automationEnabled=true` (praticidade,
  decisão de desenho) e o admin desmarca exceções ANTES de sair da tela se quiser.
- Campo "não cobrar este cliente" também na ficha do cliente do /entrega (1 switch, discreto).
- LEI DO VENDEDOR: tudo @Admin; vendedor não vê valores nem a régua.

### S4 — Receber direto na conta MP do lojista (liquidação real)
**Objetivo:** fechar o ciclo (link → pagou → baixa sozinha) e fechar I6.
- Tela self-service "Conectar Mercado Pago" na aba Cobrança: colar Access Token, validar
  (reusar a validação do master: chama `/users/me` do MP — `companies.controller.ts:612`),
  mostrar e-mail da conta conectada + botão desconectar. Guardar onde já se guarda
  (`Company.mercadoPagoAccessToken`) — migrar pra credencial cifrada (`IntegrationConnection` +
  `CredentialResolverService`, já prontos e órfãos) se couber no sprint; senão registrar como
  dívida técnica.
- Com conta conectada: mensagens da régua (S2) e o "Cobrar agora" (S3) incluem link de
  pagamento MP; o webhook `?company_id=` + `applyPayment` já baixam o caso (existe). Conferir
  que a baixa TAMBÉM quita a `FinanceiroCharge` de origem (hoje o webhook baixa o
  DebtCase/openAmount — ligar a ponte de volta pra charge se faltar).
- **Fechar I6:** SEM conta conectada → link MP indisponível (mensagem só com Pix estático;
  tela explica "conecte sua conta MP para link com baixa automática"). Remover o
  `master_fallback` dos fluxos de cobrança do cliente final (recovery/messaging) — dinheiro de
  cliente final SÓ com conta do próprio lojista.
- Webhook multi-conta: assinatura fica em modo `log` (como hoje) até existir secret por
  empresa; NÃO ligar `enforce` com conta de tenant ativa (rejeitaria os webhooks deles).
  Registrar como pendência explícita.

### S5 — Gates de go-live (ordem)
1. `HBX_WA_SEND_THROTTLE_ENABLED=true` na VPS (antes do S2 em prod).
2. S2 validado em empresa de teste com número descartável do Claude (nunca chip de cliente).
3. Publicar; conferir boot (docker ps + logs — build verde ≠ boot ok) e o cron logando ciclo.
4. Ligar o módulo APENAS na(s) empresa(s) que o dono mandar; acompanhar 1 semana de régua no
   painel antes de divulgar.

## FORA desta fase (não implementar)
- Lembrete PRÉ-vencimento ("vence amanhã") — fase 3, toggle separado.
- Débito de crédito por cobrança (só track; preço = decisão futura do dono).
- "HBX recebe e repassa" (split/intermediação) — NÃO é o desenho.
- Negativação Serasa, parcelamento na régua, Pix Automático, régua genérica multi-módulo
  (vendas_fechamento na régua) — depois que a da logística rodar 1 ciclo limpo.

## Armadilhas conhecidas (não tropeçar)
- `openAmount` é monofonte por cliente: caso manual e dívida da logística não convivem
  discriminados; a varredura PULA cliente que já tem caso manual — a régua herda esse limite
  (aceito nesta fase; não "consertar" por fora).
- `resolverDebtCaseSeQuitado` só fecha caso `sourceModule='logistica'` — de propósito (caso
  manual nunca é auto-quitado). Manter.
- Assinatura hardcoded de piloto no default `HBX_RECOVERY_PAYMENT_APPROVED_SIGNATURE`
  ("Equipe Colsani...") — limpar quando tocar nas mensagens.
- Sessões paralelas no mesmo tree: conferir `git status` antes de cada sprint; commit/publish
  é do dono; NÃO reverter trabalho alheio.
- Teste `vendas-automation` vermelho (mock sem companyId) é pré-existente e de outra frente —
  não é gate desta.
