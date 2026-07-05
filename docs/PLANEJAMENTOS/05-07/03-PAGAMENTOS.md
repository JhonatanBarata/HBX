# Auditoria integral — Pagamentos, planos, assinaturas e créditos

**Data da leitura:** 05/07/2026  
**Papel deste documento:** fiscalização técnica e plano executável pelo Fable.  
**Escopo:** Mercado Pago, assinatura HBX, checkout, webhooks, reembolso, plano, entitlement, quota, créditos, Recovery, razão financeiro/fiscal, frontend, segredos, observabilidade, testes, migração, implantação e rollback.  
**Regra de execução:** este documento não autoriza deploy, migração destrutiva, alteração de preço ou liberação de flag. Cada fase precisa passar seus critérios antes da seguinte.

## Veredito

O backend compila e o schema Prisma é válido, mas **o fluxo financeiro não está pronto para liberar créditos, troca de plano ou cobrança Recovery em produção sem correções P0**. Há caminhos confirmados que:

1. liberam acesso por 48 horas depois de cartão recusado ou assinatura ainda não autorizada;
2. baixam dívida no Recovery mesmo quando o pagamento está `pending`, `in_process` ou `charged_back`;
3. podem criar duas assinaturas recorrentes concorrentes para a mesma empresa;
4. registram cobrança avulsa sem o `mpPaymentId`, fazendo um estorno parecer concluído localmente sem devolver dinheiro no Mercado Pago;
5. permitem que uma cobrança de outra natureza, como recarga de crédito, ative plano e entitlements;
6. prometem crédito de downgrade, mas não aplicam esse crédito ao valor da próxima cobrança;
7. mantêm duas finalidades financeiras diferentes, cobrança da assinatura HBX e cobrança dos clientes do tenant, usando a mesma resolução de credencial Mercado Pago.

**Gate de implantação:** não ligar `HBX_CREDITS_ENABLED`; não habilitar troca de plano live; não considerar webhook Recovery confiável; não vender assinatura live por credencial por empresa até concluir P0-01 a P0-12 e a bateria de reconciliação.

## Convenção de severidade e prova

| Nível | Definição |
|---|---|
| P0 | Pode liberar produto sem pagamento, cobrar duas vezes, devolver dinheiro incorretamente, baixar dívida sem autorização, perder receita ou misturar fundos. Bloqueia produção. |
| P1 | Pode perder evento, causar divergência contábil, quebrar segregação, expor segredo ou tornar a correção operacional insegura. Corrigir antes do rollout. |
| P2 | Débito técnico com impacto operacional, suporte, auditoria ou experiência financeira. |
| P3 | Higiene, documentação, consistência e cobertura complementar. |

**Falha confirmada** significa que o caminho está demonstrado pelo código atual. **Hipótese operacional** depende de configuração do painel Mercado Pago, tráfego real ou dados de produção ainda não inspecionados.

## Inventário examinado

- Regras: `CLAUDE.md`, `docs/Rules/PAGAMENTOS.md`, `docs/Rules/BACKEND.md`, `docs/Rules/FRONTEND.md`, `docs/Rules/INFRA.md`.
- Modelo e migrations: `backend/prisma/schema.prisma`; migrations de assinatura, planos, cobrança e créditos; DDL runtime em `backend/src/modules/master-runtime.ts`.
- Mercado Pago: `backend/src/payments/mercado-pago-client.service.ts`, `mercado-pago-webhook-signature.ts`, `payments.module.ts`.
- Financeiro HBX: controllers, DTOs, webhook, `financeiro.service.ts`, recarga de créditos e integração com o razão master.
- Planos e acesso: catálogo, service, guard, quota, proração, assentos, trial e `company-access-state.ts`.
- Créditos: wallet, ledger, catálogo, config, services, controllers, flags e testes.
- Recovery: controller, webhook, pagamento, customer/debt case, baixa, estorno, eventos e testes.
- Frontend: catálogo/fallback de planos, checkout, troca de plano, bloqueio, configuração financeira, carteira/recarga e master financeiro.
- Fiscal: sincronização da receita, Livro Caixa e vínculo `MasterBillingLedgerEntry` × `FinanceiroCharge`.
- Configuração/deploy: `.env.production.example`, scripts do backend e checks disponíveis.

### Lacunas da inspeção

- Não houve consulta ao painel ou API live do Mercado Pago, nem leitura de token real.
- Não houve consulta ao banco de produção, portanto volume de duplicatas e divergências é desconhecido.
- Não há modelo canônico `Invoice` nem `Payment` transversal. Foram encontrados `FinanceiroCharge`, `HbxRecoveryPayment`, `CompanySubscription`, `CreditLedgerEntry` e uma tabela runtime `MasterBillingLedgerEntry`.
- O frontend e a recarga de créditos estavam com mudanças locais não consolidadas durante a auditoria; foram lidos no estado atual e não foram alterados.
- Não existe suíte dedicada a `FinanceiroService`; os caminhos mais críticos de assinatura, webhook, proração, crédito de downgrade e refund não têm teste automatizado direto.

## Resumo dos achados

| ID | Severidade | Estado | Impacto financeiro |
|---|---:|---|---|
| P0-01 | P0 | Confirmada | Cliente novo com cartão recusado ou pendente recebe recurso pago por 48h. |
| P0-02 | P0 | Confirmada | Recovery quita dívida usando valor de pagamento não aprovado e não reverte chargeback. |
| P0-03 | P0 | Confirmada | Falha entre agregados permite aplicar o mesmo pagamento Recovery novamente no retry. |
| P0-04 | P0 | Confirmada | Upgrade/fim de trial grava cobrança sem `mpPaymentId`; refund pode ser só local. |
| P0-05 | P0 | Confirmada; disparo depende do webhook live | Cobrança de recarga/proração pode ativar plano indevidamente. |
| P0-06 | P0 | Confirmada | Corrida em `subscription/create` pode criar duas recorrências e dupla cobrança. |
| P0-07 | P0 | Confirmada | Upgrade é liberado mesmo se atualizar o valor recorrente no MP falhar; downgrade pode manter cobrança maior. |
| P0-08 | P0 | Confirmada | Crédito de downgrade duplica em retry e não abate a próxima fatura. |
| P0-09 | P0 | Confirmada estrutural | Credencial de billing HBX e de cobrança Recovery é a mesma decisão; fundos podem ir ao recebedor errado. |
| P0-10 | P0 | Confirmada | Qualquer usuário com módulo Atendimento pode marcar dívida paga e solicitar estorno real. |
| P0-11 | P0 | Confirmada | Erro interno de webhook volta HTTP 200 e não há reconciliação automática. |
| P0-12 | P0 | Confirmada | Refund/chargeback não recompõe acesso, assinatura ou créditos concedidos. |
| P1-01 | P1 | Confirmada | Assinatura inválida é aceita por padrão e o exemplo de produção documenta comportamento incorreto. |
| P1-02 | P1 | Confirmada | Idempotência do wallet não é isolada por tenant e grant concorrente não tem trava no banco. |
| P1-03 | P1 | Confirmada | Refund não usa idempotency key; dois requests podem repetir estorno parcial. |
| P1-04 | P1 | Confirmada | Razão master nasce por DDL runtime, sem model/migration nem chave idempotente. |
| P1-05 | P1 | Confirmada | Fallback do frontend contém preço/quota e pode divergir do valor efetivamente cobrado. |
| P1-06 | P1 | Confirmada | Tokens Mercado Pago ficam em texto puro em colunas/JSON do banco. |
| P1-07 | P1 | Confirmada | Webhook sem `company_id` consulta apenas a primeira credencial master; biblioteca multi-conta não é roteável. |
| P1-08 | P1 | Confirmada | Valores monetários críticos usam `Float` e arredondamento distribuído. |
| P2-01 | P2 | Confirmada | Evento financeiro Recovery é best-effort e duplicável; trilha pode sumir. |
| P2-02 | P2 | Código inconsistente; expectativa do teste precisa de triagem | Detecção de transição usa vocabulários incompatíveis e a suíte atual falha. |
| P2-03 | P2 | Confirmada | Créditos estão vendáveis no código, mas o consumo real continua apenas em shadow, sem enforcement. |

## Achados P0 — corrigir antes de produção

### P0-01 — Falha ou pendência na primeira cobrança libera acesso pago

**Evidência:** `backend/src/financeiro/financeiro.service.ts:1495-1563` transforma rejeição ou pendência em `Company.status='overdue'`, `isActive=true`, liga módulos e grava entitlements `grace`. `backend/src/modules/company-access-state.ts:103-110,190-192` inclui `grace` nos estados liberados. O fluxo é chamado na criação/reutilização da assinatura em `financeiro.service.ts:3335-3369,3494-3516,3534-3560`. Além disso, para plano sem trial, uma preapproval apenas `authorized` chama `activateCompanyFromSubscription` diretamente (`financeiro.service.ts:3434-3493`), antes de existir um `payment approved` processado pelo webhook. O efeito antecipado está confirmado; se o provider captura a primeira parcela de forma síncrona nesse exato retorno precisa ser validado em sandbox, mas o código não persiste nem exige essa prova.

**Impacto:** uma empresa sem pagamento anterior pode usar plano pago por 48 horas repetindo cartão recusado/pendente. Grace de renovação foi aplicada também ao primeiro checkout.

**Solução:** separar `first_authorization` de `renewal_failure`. Grace só pode existir quando houver prova de período anterior pago e ainda vigente. Primeira cobrança pendente ou recusada deve manter `pending_checkout`, módulos desligados e entitlements `pending_checkout`. Trial só é liberado com preapproval autorizada e status `trial`, nunca por grace. Plano sem trial só vira `active` depois de payment/capture aprovado, vinculado à assinatura e reconciliado pelo backend.

**Aceite:** teste com empresa nova + `rejected`, `pending`, timeout e token inválido mantém `canUse=false`; teste com renovação de período previamente pago permite grace somente até o fim da política aprovada.

### P0-02 — Recovery baixa dívida sem exigir `approved`

**Evidência:** `backend/src/hbx-recovery/hbx-recovery.service.ts:3188-3225` obtém o status, mas calcula `targetNetPaid = transaction_amount - refunded` sem condicionar a `approved`. Em `:3232-3240`, qualquer diferença positiva chama `applyPayment`. `charged_back` entra como cancelado em `:273-278`, porém, com `transaction_amount_refunded=0`, o alvo líquido continua sendo o valor integral. `in_process`, `pending` e outros estados também podem aplicar saldo.

**Impacto:** dívida de cliente pode ser marcada como paga antes da autorização; chargeback mantém cliente quitado; Recovery e `DebtCase` passam a mentir para cobrança, comissão e atendimento.

**Solução:** criar mapeamento explícito e exaustivo de status. Somente `approved`/`accredited` produz `authorizedNetAmount`. `pending`, `in_process`, `in_mediation`, `rejected`, `cancelled` produzem zero novo. `refunded`, `partially_refunded` e `charged_back` reduzem o líquido autorizado e revertem o agregado. Estado desconhecido é fail-closed e vai para fila de revisão.

**Aceite:** matriz de status comprova que apenas aprovado baixa dívida; chargeback devolve o valor ao aberto; evento desconhecido não altera customer/debt case.

### P0-03 — Atualização não atômica permite dupla baixa no retry

**Evidência:** `applyPayment` altera `HbxRecoveryCustomer` em `hbx-recovery.service.ts:3098-3106`, sincroniza `DebtCase` depois em `:3107` e só mais tarde o chamador incrementa `appliedToCustomerAmount` em `:3242-3250`. Se a sync do debt case ou o update final falhar, a dívida já diminuiu, mas o pagamento continua com aplicado zero; o retry tenta aplicar novamente. `reversePayment` repete o padrão em `:3124-3134`.

**Impacto:** um único pagamento pode reduzir duas vezes a dívida ou um refund pode reabrir valor duplicado após falha parcial.

**Solução:** executar PaymentApplication append-only + atualização de customer + debt case + acumuladores do pagamento em uma transação. Usar chave única `(paymentId, movementKind, providerRevision)` ou `(provider, providerAccount, mpPaymentId, netAmountVersion)`. Agregados devem ser recomputáveis do movimento, não depender de várias escritas soltas.

**Aceite:** testes injetam falha após cada statement e repetem o evento; resultado final deve ser exatamente uma baixa/reversão.

### P0-04 — Cobranças avulsas ficam órfãs do pagamento Mercado Pago

**Evidência:** upgrade cria pagamento em `financeiro.service.ts:3882-3905` e envia apenas `providerPaymentId` em metadata ao chamar `recordProrationCharge` (`:3928-3941`). `recordProrationCharge` cria `FinanceiroCharge` em `:4428-4456`, mas não grava `mpPaymentId`; ainda gera outro `externalReference`. O mesmo helper é usado no fim de trial em `:4105-4115`. O refund só chama MP se `charge.mpPaymentId` existir (`:4516-4528`); sem ele, altera apenas o banco local (`:4535-4570`).

**Impacto:** o painel pode informar “estornado” e reduzir receita fiscal sem o dinheiro ter sido devolvido ao comprador. Chargeback ou refund assíncrono da cobrança avulsa não encontra a charge local.

**Solução:** criar a intenção local antes da chamada ao MP; usar o mesmo `externalReference` e idempotency key estável; persistir `mpPaymentId`, provider account e resposta aprovada na mesma saga; refund sem provider payment deve falhar fechado, nunca simular sucesso live.

**Aceite:** toda charge live paga tem `mpPaymentId`; todo refund local possui refund id do MP; reconciliação encontra 1:1 provider payment → charge → ledger.

### P0-05 — Tipo de cobrança não controla a ativação do plano

**Evidência:** `syncChargeFromProvider` chama `activateCompanyFromCharge` para qualquer `FinanceiroCharge` aprovada (`financeiro.service.ts:2366-2368`). `activateCompanyFromCharge` usa o `selectedPlanKey` atual da empresa e ativa plano/entitlements (`:1741-1777`), sem validar `chargeKind`, snapshot de plano, preço ou finalidade. A recarga cria uma `FinanceiroCharge` aprovada com `mpPaymentId` em `backend/src/financeiro/credit-recharge.service.ts:224-254`.

**Impacto:** se o webhook global entregar a recarga ou uma atualização manual sincronizar a charge, pagar um pacote de créditos pode ativar uma assinatura. Também existe risco TOCTOU: uma cobrança criada para um plano pode ativar o `selectedPlanKey` alterado depois.

**Solução:** tornar `chargeKind` obrigatório (`subscription_cycle`, `plan_upgrade`, `credit_recharge`, `recovery_collection`, `extra_seat`, `setup`). Somente kind de assinatura com snapshot imutável `{planKey,billingCycle,amount,currency}` pode ativar plano. Recarga só concede lote; Recovery só mexe em dívida; assento só mexe em capacidade.

**Aceite:** webhook aprovado de cada kind altera apenas seu agregado; teste de recarga nunca muda `Company.status`, módulos ou entitlements.

### P0-06 — Corrida pode criar duas assinaturas recorrentes

**Evidência:** `CompanySubscription` não tem unique por empresa/conta/status (`schema.prisma:492-520`). O service consulta assinatura existente em `financeiro.service.ts:3305`, depois cria linha em `:3397-3409` e preapproval com `randomUUID()` em `:3413-3432`. Duas requisições concorrentes podem observar “sem assinatura” e criar duas preapprovals autorizadas.

**Impacto:** dupla cobrança recorrente, duas assinaturas locais e dificuldade de cancelamento/reconciliação.

**Solução:** `SubscriptionIntent` com operation key estável; unique parcial para uma assinatura aberta por `(companyId, merchantAccount, productFamily)`; lock transacional/advisory por empresa; idempotency key determinística no MP; resposta repetida retorna a assinatura original.

**Aceite:** 20 requests concorrentes criam uma linha local e uma preapproval; retries após timeout devolvem o mesmo id.

### P0-07 — Plano local muda mesmo se valor recorrente no MP não mudar

**Evidência:** no upgrade, a atualização da preapproval é best-effort e a exceção só gera log (`financeiro.service.ts:3954-3963`); em seguida o plano e entitlements são liberados (`:3966-3984`). No downgrade, o plano é reduzido primeiro (`:4269-4291`) e a atualização do valor no MP falha silenciosamente depois (`:4293-4302`).

**Impacto:** upgrade pode continuar cobrando o plano barato; downgrade pode continuar cobrando o plano caro. Ambos geram divergência contratual e financeira.

**Solução:** tratar mudança como saga com estados `requested → provider_updated → locally_applied → reconciled`. Upgrade não libera até provider confirmar o novo valor e a cobrança imediata. Downgrade não retorna sucesso até provider aceitar o valor futuro; se a política exigir mudança local imediata, persistir estado compensável e alertar operação, sem esconder falha.

**Aceite:** falha do MP deixa plano anterior intacto ou aciona compensação explícita; nunca retorna `ok:true` com preço recorrente divergente.

### P0-08 — Crédito de downgrade duplica e nunca é consumido

**Evidência:** `billingCreditCents` é incrementado sem operation key em `financeiro.service.ts:4246-4266`; retry/double-click repete o incremento. O saldo é apenas exibido em `buildPricing` (`:973-976`), enquanto `finalCycleAmount` é calculado sem abatê-lo (`:920-924`). Busca global mostra que não há outro consumo de `billingCreditCents`.

**Impacto:** o sistema pode fabricar crédito duplicado e, ao mesmo tempo, cobrar a fatura cheia apesar de prometer abatimento.

**Solução:** substituir contador mutável por ledger de crédito de billing, com `operationKey` única, saldo em centavos e consumo FIFO atômico ao criar a próxima invoice. Persistir `creditAppliedCents`, `amountBeforeCreditCents`, `amountDueCents`; não alterar crédito até provider confirmar a cobrança líquida.

**Aceite:** retry do downgrade gera um movimento; próxima cobrança abate exatamente uma vez; saldo residual permanece; refund/cancelamento recompõe conforme política documentada.

### P0-09 — Billing HBX e cobrança Recovery compartilham a mesma credencial

**Evidência:** `resolveCompanyMercadoPagoAccess` escolhe token da empresa ou master (`backend/src/modules/master-global-integrations.util.ts:282-317`). O Financeiro da assinatura HBX usa essa resolução em `financeiro.service.ts:1029-1060`; o Recovery usa a mesma resolução em `hbx-recovery.service.ts:2956-2970`.

**Impacto:** são dois recebedores econômicos diferentes. A assinatura HBX deve cair na conta HBX; a dívida cobrada pelo tenant deve cair na conta definida para aquele tenant. Uma única chave `useMasterMercadoPagoToken` não representa as duas decisões e pode direcionar fundos ao recebedor errado.

**Solução:** separar `HBX_BILLING_MERCHANT` global e obrigatório de `TENANT_COLLECTION_MERCHANT` por empresa. Payment intent guarda `merchantAccountKey`; webhook e reconciliação resolvem por essa chave imutável.

**Aceite:** testes com duas contas sandbox provam que assinatura cai somente na HBX e Recovery somente na conta do tenant; nenhuma configuração de Recovery altera billing HBX.

### P0-10 — Permissão financeira do Recovery é ampla demais

**Evidência:** o controller inteiro usa apenas JWT + `ModuleAccessGuard` de Atendimento (`backend/src/hbx-recovery/hbx-recovery.controller.ts:52-54`). `mark-paid` (`:178-184`) e `payments/:id/refund` (`:318-324`) não adicionam `RolesGuard`, `Admin` ou capacidade financeira. Os únicos endpoints com `RolesGuard` aparecem na limpeza/reset (`:327-335`).

**Impacto:** vendedor ou operador com acesso ao módulo pode quitar dívida manualmente e solicitar refund real.

**Solução:** capability específica `canManageRecoveryPayments`; refund exige dono/master e reautenticação/confirm intent; baixa manual exige capability, motivo e audit log imutável. Vendedor só consulta estado operacional neutro.

**Aceite:** matriz master/dono/gerente/vendedor prova 403 para não autorizados e não revela valor/motivo financeiro ao vendedor.

### P0-11 — Webhook perde retry e não existe reconciliação automática

**Evidência:** services capturam exceção e retornam `processed:false` (`financeiro.service.ts:4700-4751`; `hbx-recovery.service.ts:4628-4638`). Controllers sempre respondem `{ok:true, received:true}` (`financeiro.webhook.controller.ts:34-44`; `hbx-recovery.webhook.controller.ts:34-44`). O único intervalo do Financeiro processa grace/trial (`financeiro.service.ts:97-106`), não pagamentos pendentes. Não há worker de reconciliação MP.

**Impacto:** timeout de banco/API converte evento financeiro em HTTP 200; o provedor considera entregue e o sistema fica divergente indefinidamente.

**Solução:** inbox durável antes do processamento; responder 2xx apenas depois de persistir o evento; worker com retry/backoff/dead-letter; job periódico lista intents pendentes e consulta provider; alerta por idade/quantidade e ação master de reprocessar.

**Aceite:** falha forçada de banco/provider não perde evento; retry converge; dead-letter aparece no master; job repara evento nunca recebido.

### P0-12 — Refund e chargeback não recompõem os agregados pagos

**Evidência:** o próprio refund do Financeiro declara que não mexe em acesso/assinatura (`financeiro.service.ts:4477-4482`). A sincronização de charge atualiza charge/ledger, mas só tem efeito comercial no branch `approved` (`:2320-2368`). A sincronização de pagamento recorrente não trata `refunded`, `partially_refunded` ou `charged_back` para recalcular autorização (`:2538-2556`); `charged_back` ainda cai no default `pending` do normalizador (`:285-292`). A recarga concede lote pago (`credit-recharge.service.ts:212-222`), mas nenhum refund/chargeback chama uma revogação no wallet.

**Impacto:** o dinheiro pode voltar ao comprador enquanto plano, entitlements, seats ou créditos continuam disponíveis. Chargeback pode virar perda integral e ainda manter o custo de uso.

**Solução:** política por `purpose`: refund total/chargeback revoga o período não autorizado e reavalia acesso; refund parcial recalcula o direito conforme regra comercial; recarga revoga saldo não consumido e trata consumo já realizado por política explícita; toda compensação nasce de movement idempotente.

**Aceite:** testes de refund parcial, total e chargeback atualizam provider, charge, ledger, fiscal e agregado específico; nenhum saldo/recurso pago sobrevive sem autorização remanescente.

## Achados P1

### P1-01 — Assinatura de webhook fail-open e configuração enganosa

`backend/src/payments/mercado-pago-webhook-signature.ts:75-85,104-133` usa modo `log` por padrão, aceitando assinatura inválida mesmo com segredo. `.env.production.example:14-17` afirma que configurar o segredo rejeita assinatura inválida e nem declara `MP_WEBHOOK_SIGNATURE_MODE`. Corrigir documentação e tornar `enforce` obrigatório em produção após teste de manifesto, com tolerância de timestamp/replay ledger. Nunca confiar em `company_id` não assinado.

### P1-02 — Idempotência de créditos não é tenant-safe nem concorrente para grants

`CreditWalletService.grant` procura `usageKey` global e faz create sem transação/trava (`backend/src/credits/credit-wallet.service.ts:169-202`). O índice `@@unique([usageKey,parentEntryId])` (`schema.prisma:4214-4222`) não deduplica lotes porque `parentEntryId` é `NULL`. Débito/refund também consultam usage key sem `companyId` (`credit-wallet.service.ts:205-240,352-379`). A recarga manda ao MP `credrech-${idempotencyKey}` sem company/merchant (`credit-recharge.service.ts:184-186`). Criar `operationKey` normalizada e unique por `(companyId, kind, operationKey)` ou partial unique; escopar toda leitura por wallet/company; incluir merchant + company na idempotency key do provider.

### P1-03 — Refund concorrente não é idempotente

`MercadoPagoClientService.refundPayment` envia POST sem `X-Idempotency-Key` (`backend/src/payments/mercado-pago-client.service.ts:298-323`). O Financeiro calcula saldo reembolsável antes do provider e atualiza depois (`financeiro.service.ts:4491-4552`), sem lock/operation key. Dois refunds parciais concorrentes podem ser aceitos. Exigir `refundIntentId`, idempotency key estável, unique local e estado de saga.

### P1-04 — Razão master é schema runtime e não tem idempotência estrutural

`MasterBillingLedgerEntry` não existe como model Prisma/migration; é criada em runtime por `backend/src/modules/master-runtime.ts:442-475`. Não há unique por charge/payment/provider. `insertBillingLedgerEntry` sempre gera UUID (`financeiro.service.ts:1189-1234`). Mover para migration/model, adicionar `sourceType/sourceId/operationKey` unique e backfill antes de remover DDL runtime.

### P1-05 — Frontend ainda possui preço/quota fallback

`frontend/src/lib/plans.tsx:29-47` contém preços, trial e quotas. `CheckoutPanel` inicia nesses dados e calcula total (`frontend/src/components/hbx/checkout-panel.tsx:109-153`). Em falha da API, o usuário pode ver valor antigo enquanto o backend cobra o catálogo atual. Em checkout, falha de catálogo deve bloquear a compra com erro explícito; fallback pode manter apenas copy não financeira.

### P1-06 — Tokens Mercado Pago em texto puro

`Company.mercadoPagoAccessToken` (`schema.prisma:76`) e `MasterGlobalIntegrationConfig.mercadoPagoAccessToken/mercadoPagoLibrary` (`schema.prisma:3280-3289`) armazenam token em plaintext/JSON. Migrar para cofre/serviço de secrets com criptografia autenticada e key rotation; banco guarda referência e metadados. Nunca logar payload/token; manter public key apenas no frontend.

### P1-07 — Biblioteca multi-credencial não é roteável no webhook de pagamento

Quando não há `company_id`, `resolveWebhookMercadoPagoAccessToken` pega env ou primeira credencial (`financeiro.service.ts:1063-1072`), embora a biblioteca suporte várias (`master-global-integrations.util.ts:260-267`). Pagamento recorrente de outra conta não pode ser consultado para descobrir a assinatura. Registrar endpoint/secret por merchant account e rotear pelo endpoint ou app id assinado; nunca tentar descobrir tenant consultando uma conta arbitrária.

### P1-08 — Dinheiro em `Float`

`FinanceiroCharge.amount/refundAmount` e `HbxRecoveryPayment.amount/refundAmount` são `Float` (`schema.prisma:551-581,615-639`); o ledger runtime também usa `DOUBLE PRECISION` (`master-runtime.ts:451`). Arredondamentos estão espalhados. Migrar aditivamente para `amountCents/refundCents/currency`, dual-write, reconciliar e só depois aposentar floats.

## Achados P2/P3

### P2-01 — Audit event do Recovery pode sumir ou duplicar

`recordPaymentEvent` engole qualquer falha (`hbx-recovery.service.ts:3048-3076`) e não possui event id único (`schema.prisma:599-613`). Para evento financeiro, usar outbox/inbox transacional e unique operation key. Notificação pode ser best-effort; trilha de dinheiro não.

### P2-02 — Notificação aprovada do Recovery falha

`normalizeLifecycle` não reconhece o próprio valor `paid` (`hbx-recovery.service.ts:273-278`), mas a detecção pós-update passa `updated.lifecycle` (`:3292-3294`). O teste `hbx-recovery.service.test.ts:720-770` espera uma notificação e atualmente recebe zero. A inconsistência está confirmada no código; como o worktree mudou durante a auditoria, o Fable deve decidir se a expectativa do teste ainda é a regra vigente antes de corrigir. Não usar essa falha isolada como prova de perda de dinheiro e não usar a notificação como fonte financeira.

### P2-03 — Venda de créditos precede enforcement

`.env.production.example:110-119` declara que créditos e shadow ficam desligados e que enforcement futuro não existe. `CreditsService.recordShadowDebit` grava apenas `debit_shadow`, best-effort, sem afetar saldo (`backend/src/credits/credits.service.ts:214-265`). Ao mesmo tempo, a recarga real já cobra e concede lote. Não vender créditos até existir decisão de produto e enforcement transacional no choke de entrega; caso contrário o cliente paga por saldo que não governa o recurso.

### P3 — Consistência e documentação

- Corrigir comentários que afirmam garantias não estruturais, especialmente assinatura de webhook e idempotência de grant.
- Remover métodos financeiros mortos ou expor somente depois de testados; `createCheckoutForUser` e `refreshChargeForUser` não têm rota encontrada.
- Padronizar vocabulário de status interno e impedir status desconhecido de virar `pending` silencioso.
- Manter vendedor sem valores e motivos financeiros em todas as respostas, inclusive erros de Recovery.

## Arquitetura alvo mínima

Não é necessário reescrever o sistema. O menor núcleo seguro é:

1. **PaymentIntent**: `id`, `companyId`, `purpose`, `merchantAccountKey`, `amountCents`, `currency`, `planSnapshot`, `customer/debt/subscription refs`, `operationKey`, `providerPaymentId`, `providerStatus`, `internalStatus`, timestamps.
2. **PaymentEventInbox**: payload sanitizado, provider, merchant, event id, signature result, received/processed/failed, attempts, nextRetryAt, unique provider event.
3. **PaymentMovement**: movimentos append-only `authorize/capture/refund/chargeback/credit_grant/credit_revoke`, unique operation key.
4. **Agregados**: `FinanceiroCharge`, assinatura, Recovery customer/debt, wallet e razão são atualizados pelo mesmo movimento transacional ou recomputados dele.
5. **Outbox**: e-mail, WhatsApp, comissão, NFS-e e alertas saem depois do commit; falha de canal não muda dinheiro.

Mapeamento de efeitos obrigatório:

| purpose | Efeito permitido |
|---|---|
| `subscription_cycle` | Ativar/renovar assinatura e entitlements do snapshot. |
| `plan_upgrade` | Cobrar diferença e aplicar target plan; atualizar recorrência. |
| `credit_recharge` | Conceder lote de créditos; refund/chargeback revoga saldo conforme política. |
| `recovery_collection` | Baixar/reabrir DebtCase e customer do mesmo tenant. |
| `extra_seat` | Alterar capacidade, nunca plano. |
| `setup_fee` | Receita de implantação, sem liberar plano automaticamente. |

## Sequência executável pelo Fable

### Fase 0 — Congelar risco e criar baseline

1. Manter `HBX_CREDITS_ENABLED=false` e `HBX_CREDITS_SHADOW=false` em produção.
2. Bloquear por flag os caminhos live de change-plan, extra seat e recarga enquanto P0 não passar.
3. Fazer backup/dump antes de migration e exportar contagens por status das cinco tabelas financeiras.
4. Criar relatório de baseline: payments MP aprovados/refund/chargeback × charges × ledger × subscriptions × wallet grants.
5. Não apagar nem “corrigir” dados automaticamente nesta fase.

**Saída:** snapshot reproduzível e lista de divergências com IDs, tenant e valores em centavos.

### Fase 1 — Fechar liberações indevidas e autorização

1. Corrigir P0-01: primeira falha/pending fica `pending_checkout`; grace exige período pago anterior.
2. Corrigir P0-02: Recovery só aplica valor `approved`; refund e chargeback reduzem net authorized.
3. Aplicar guard financeiro ao mark-paid/refund Recovery e audit log obrigatório.
4. Introduzir `purpose/chargeKind` e bloquear `activateCompanyFromCharge` para qualquer outro purpose.
5. Fazer status desconhecido falhar fechado e gerar alerta.
6. Reavaliar acesso/wallet/Recovery em refund total e chargeback conforme o purpose.

**Saída:** nenhum recurso/dívida muda sem autorização financeira válida.

### Fase 2 — Idempotência e atomicidade

1. Adicionar models/tabelas canônicas de intent, inbox e movement por migration aditiva.
2. Criar unique de intent por operation key; unique de provider payment por merchant account; unique de evento webhook.
3. Criar unique parcial de assinatura aberta por empresa/merchant/produto.
4. Refatorar Recovery para aplicar/reverter em transação única.
5. Refatorar wallet para operation key tenant-scoped e unique real para grant/recharge/refund.
6. Toda chamada create payment/preapproval/refund usa idempotency key estável persistida antes da rede.

**Saída:** retries, concorrência e crashes convergem para exatamente um efeito.

### Fase 3 — Webhook, reconciliação e merchants

1. Separar merchant HBX billing de merchant tenant collections.
2. Criar endpoint/secret por merchant e armazenar `merchantAccountKey` no intent.
3. Persistir inbox antes de processar; worker com retry/backoff/dead-letter.
4. Corrigir resposta HTTP: 2xx após persistência; 5xx quando nem persistir foi possível.
5. Implantar reconciliador periódico e ação master de reprocessar.
6. Validar assinatura em `log`, medir, corrigir manifesto e promover para `enforce`; documentar env.

**Saída:** nenhum evento se perde e toda conta MP é roteada corretamente.

### Fase 4 — Assinaturas, planos e créditos de billing

1. Tornar criação de assinatura serializada/idempotente.
2. Transformar change-plan em saga; não aplicar local se provider update falhar.
3. Criar ledger de crédito de downgrade e aplicar na invoice seguinte.
4. Persistir snapshot imutável de plano/preço/ciclo/assentos na intent.
5. Garantir que trial autorizado continue `trial`; webhook de preapproval não pode convertê-lo em `active` antes da primeira captura.

**Saída:** plano, preço provider e estado local sempre reconciliáveis.

### Fase 5 — Recarga e refund de créditos

1. Criar intent `credit_recharge` antes da cobrança e persistir `mpPaymentId`/merchant.
2. Conceder crédito pelo movimento aprovado do webhook ou confirmação provider reconciliada, não apenas pela resposta síncrona.
3. Definir política de refund: saldo não consumido é revogado; saldo já consumido cria saldo devedor/bloqueio ou limita refund, decisão explícita do dono.
4. Implementar chargeback de recarga e observabilidade.
5. Só então criar `HBX_CREDITS_ENFORCE` e ativar canário.

**Saída:** não existe crédito grátis após refund/chargeback e não existe cobrança sem entitlement consumível.

### Fase 6 — Frontend e master

1. Remover fallback financeiro de preço/quota; falha de catálogo bloqueia CTA.
2. Exibir estados `processando`, `aprovado`, `recusado`, `reembolsado`, `em revisão`, sempre vindos do backend.
3. Evitar mensagem “aprovado” baseada apenas em retorno HTTP se intent ainda não está capturada.
4. Master mostra provider id, merchant, purpose, intent, divergência e ação de reprocessar; segredo permanece mascarado.
5. Vendedor continua sem valor, plano, status financeiro ou refund.

**Saída:** UI não inventa verdade financeira e oferece reparo auditável ao master.

### Fase 7 — Implantação controlada

1. Deploy de schema aditivo com flags off.
2. Backfill e relatório de inconsistência; nenhuma constraint final até zerar conflitos.
3. Dual-write + shadow-read por pelo menos um ciclo de teste sandbox.
4. Habilitar webhook inbox/reconciler por merchant em canário.
5. Habilitar assinatura live para tenant interno/teste; depois poucos tenants.
6. Habilitar recarga sem enforcement apenas não é aceitável; recarga e enforcement entram juntos após reconciliação verde.
7. Executar pós-deploy e manter rollback pronto.

## Critérios de aceite globais

- Nenhum `pending`, `in_process`, `rejected`, `cancelled`, `in_mediation`, status desconhecido ou assinatura sem captura libera recurso pago fora de trial/cortesia formal.
- Um `mpPaymentId` produz no máximo uma intent/movimentação por merchant account.
- Uma operation key produz exatamente um pagamento, assinatura, grant, refund ou crédito, mesmo com 20 requests concorrentes.
- Valor, moeda, merchant, tenant, purpose, external reference e snapshot de plano são validados antes de qualquer efeito.
- Refund parcial/total/chargeback aparece no provider, charge, ledger, fiscal, assinatura/Recovery/wallet conforme a finalidade.
- Nenhuma operação financeira de tenant A lê ou altera tenant B.
- Toda falha de webhook fica persistida, reprocessável e visível; nenhum erro vira 200 silencioso sem inbox.
- Razão financeiro e base fiscal reconciliam ao centavo.
- Segredos não ficam em payload, log, frontend ou plaintext novo.
- Build, lint, migrations, testes unitários, concorrência, integração sandbox e smoke pós-deploy passam.

## Bateria obrigatória de reconciliação

### Status e ordem de eventos

1. `pending → approved`; só o segundo aplica.
2. `approved → approved` repetido 20 vezes; um efeito.
3. `approved → partially_refunded → refunded`; agregados acompanham líquido.
4. `approved → charged_back`; acesso/saldo/dívida seguem política de reversão.
5. Evento antigo chega depois do novo; não há regressão.
6. Status desconhecido; nenhuma liberação, evento em revisão.

### Concorrência e crash

1. 20 `subscription/create` simultâneos.
2. 20 grants com mesma e com chaves diferentes, no mesmo tenant e em tenants diferentes.
3. Dois refunds parciais concorrentes.
4. Crash após provider aprovar e antes do commit local.
5. Crash após customer update e antes de debt/payment update.
6. Banco indisponível no webhook; inbox/retry converge.

### Segregação e fraude de contexto

1. Alterar `company_id` da query.
2. Payment de merchant A enviado ao endpoint B.
3. Metadata sem company, divergente e malformada.
4. Mesmo idempotency key enviado por tenants diferentes.
5. Usuário vendedor tenta mark-paid/refund/change-plan/recharge.

### Valores e finalidade

1. Amount/currency divergente do snapshot.
2. Pagamento Lite com `selectedPlanKey` trocado para Pro enquanto pendente.
3. Recarga de crédito nunca ativa plano.
4. Refund de upgrade realmente aparece no MP.
5. Crédito downgrade abate exatamente uma invoice.
6. Refund de recarga com créditos parcialmente consumidos segue decisão documentada.

### Reconciliação SQL/relatório

Para cada competência e merchant:

- `SUM(provider approved) - SUM(provider refunded/chargeback)`;
- `SUM(FinanceiroCharge.amount - refundAmount)`;
- `SUM(MasterBillingLedgerEntry líquido)`;
- base fiscal/Livro Caixa;
- grants pagos de crédito vinculados a payment aprovado;
- aplicações Recovery vinculadas a net authorized.

Diferença permitida: **R$ 0,00**. Toda exceção precisa de ajuste compensatório append-only, nunca update destrutivo sem trilha.

## Plano de migration e backfill

1. Criar colunas/tabelas novas em cents, nullable e sem remover legado.
2. Backfill `merchantAccountKey`, `purpose`, `operationKey`, `providerPaymentId` e refs a partir de metadata/provider payload; marcar `needs_review` quando ambíguo.
3. Backfill intents para `FinanceiroCharge`, `HbxRecoveryPayment` e subscriptions; não inferir pagamento aprovado só por `Company.status`.
4. Importar `MasterBillingLedgerEntry` para model Prisma sem mudar IDs.
5. Detectar antes das unique constraints: subscriptions abertas duplicadas, provider payment duplicado, external reference repetida, grants com mesma usage key e company divergente.
6. Dual-write legado + novo; comparar em shadow.
7. Passar leitura/reconciliação para o novo núcleo por flag.
8. Só depois tornar campos obrigatórios e descontinuar DDL runtime/float/plaintext antigo em migration futura e separada.

## Rollback

### Rollback de código

- Flags desligam novas rotas e voltam leitura ao legado; manter dual-write/inbox para não perder evento.
- Nunca apagar intents/events/movements criados durante o canário.
- Se reconciler errar, pausar worker; não pausar recebimento da inbox.

### Rollback de banco

- Migration inicial é somente aditiva; rollback normal não faz DROP.
- Constraints problemáticas podem ser removidas isoladamente, preservando colunas/dados.
- Não reverter crédito/refund com `UPDATE` direto; lançar movimento compensatório com actor, motivo e source id.

### Rollback financeiro externo

- Pagamento já capturado não se desfaz com rollback de código. Gerar fila de compensação com verificação humana para refund/cancel preapproval.
- Antes de rollback, listar operações provider-confirmed sem commit local e operações locais sem provider-confirmation.
- Após rollback, rodar reconciliação completa e bloquear tenant divergente até correção.

## Checks executados nesta auditoria

- `backend: npm run prisma:validate` — passou.
- `backend: npm run build` — passou no worktree atual.
- Créditos/quota/recarga: 83 testes passaram.
- `node --test dist/hbx-recovery/hbx-recovery.service.test.js` — **21 passaram, 1 falhou**: `MP recovery approved: concurrent deliveries notify the customer only once`, esperado 1 envio e ocorrido 0. Resultado atual reproduzível; como o worktree mudou durante a auditoria, classificado como inconsistência código × expectativa a triar, não como prova isolada de falha financeira.
- Não foi executado frontend lint/build nem teste live/sandbox, pois não houve alteração de produto e o worktree estava sendo modificado por outros workers.

## Ordem final de prioridade

1. P0-01, P0-02, P0-03 e P0-10: impedir liberação/baixa/refund não autorizado.
2. P0-04, P0-05, P0-06, P0-11 e P0-12: identidade, finalidade, idempotência, refund e entrega durável.
3. P0-07, P0-08 e P0-09: consistência de plano/preço/crédito/merchant.
4. P1: assinatura enforce, refund idempotente, razão migrado, segredos, cents e multi-merchant.
5. P2/P3 e frontend.
6. Somente depois ativar créditos, checkout live ampliado e rollout por tenant.
