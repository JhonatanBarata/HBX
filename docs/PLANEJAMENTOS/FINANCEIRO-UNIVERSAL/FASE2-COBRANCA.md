# FINANCEIRO-UNIVERSAL — Fase 2: COBRANÇA (recebimento do lojista + régua no WhatsApp)

> **Para o executor (Opus):** frente financeira → Opus edita DIRETO + revisão de diff (âncora do
> dono). Arquivo autossuficiente; plano em PARTES PICADAS — cada parte é publicável e testável
> SOZINHA, na ordem. NÃO adiantar parte futura. Leia `PLANO.md` (Fase 1, em prod `f598c3ea`) e a
> memória `financeiro-universal-frente.md`. Fatos arquivo:linha verificados 11/07 — reconfira
> antes de editar (repo rápido, sessões paralelas no mesmo tree; `git status` antes de cada parte).
> **⛔ Execução só com o GO explícito do dono no chat. Todas as dúvidas já estão respondidas
> (decisão nº6) — não reabrir pergunta já cravada.**

## Decisões do DONO (literais — não amaciar)
1. O lojista recebe direto na conta DELE por padrão: (a) Pix estático (chave dele, taxa zero,
   baixa manual) e (b) conta Mercado Pago DELE conectada (link, baixa automática).
2. Régua automática de cobrança APROVADA com 2 condições só: (a) admin ATIVA o módulo;
   (b) admin SEMPRE enxerga quem está sendo cobrado (painel + histórico). Sem aprovação por lote.
3. Régua usa o MESMO chip e caminho blindado do aviso "entregou" (`queueOutboundForCompany`).
4. Receita da PLATAFORMA (recarga/assinatura) cai SEMPRE na conta MP master.
5. **(11/07 noite — FOCO MÁXIMO) "Parece roubo": NUNCA dinheiro do lojista cai na conta da HBX
   sem ele saber e confirmar EXPLICITAMENTE.** O modo **"Receber pelo HBX"** (dinheiro cai na
   conta HBX → dono repassa) EXISTE como opção, mas SÓ com: consentimento explícito na tela +
   **falar com o suporte ANTES de ativar** (botão WhatsApp). Fallback silencioso = proibido pra sempre.
6. **(11/07, respostas às dúvidas — cravadas)**
   (a) **Prazo do repasse NÃO é fixo**: "um dia" = **quantos dias o dono COMBINAR com cada
   lojista** na conversa. Prazo é configuração POR EMPRESA, definida na ativação.
   (b) **Repasse é LÍQUIDO da comissão do dono**: a HBX desconta a comissão combinada (também
   POR EMPRESA, definida na mesma conversa) antes de repassar.
   (c) **Ativação SEMPRE via conversa com o dono** ("envolve contabilidade, movimentação — muito
   além de 'eu recebo e mando'") → **SÓ o master ativa** o modo, depois do contato no suporte.
   O lojista, pela tela, só lê a explicação e chama o suporte.
   (d) **WhatsApp do suporte**: empresa **+55 19 93300-5153** (padrão do botão) · pessoal
   **+55 19 99702-4884** (alternativo, registrado aqui).

## Invariantes — o que NUNCA pode acontecer (toda parte valida contra esta lista)
- **I1** Cobrança pra quem não tem dívida vencida REAL. Recheck da dívida NA HORA do envio —
  pagou entre a varredura e o disparo → não recebe.
- **I2** Cobrança com módulo desativado (qualquer gate OFF → no-op).
- **I3** Cliente marcado "não cobrar" / opt-out recebendo mensagem.
- **I4** Mesmo cliente cobrado 2× no mesmo estágio (idempotência dura [cliente, estágio]).
- **I5** Receita da HBX (recarga/assinatura) caindo em conta MP de tenant.
- **I6 (FOCO MÁXIMO do dono)** Dinheiro de cliente final caindo na conta HBX SEM o modo
  "Receber pelo HBX" ativo + consentimento REGISTRADO (quem aceitou, quando, versão do texto).
  Sem conta própria E sem o modo → link MP simplesmente NÃO EXISTE. Fallback silencioso nunca.
- **I7** Envio fora da fila blindada (`queueOutboundForCompany`) ou sem throttle.
- **I8** Loop/retry de envio sem teto. Falhou → loga e espera o próximo ciclo do cron.
- **I9 (novo)** Todo pagamento que cai na HBX em nome de um lojista gera NA MESMA transação uma
  linha de REPASSE (valor, prazo, status) visível pro lojista E pro master. Dinheiro na conta
  HBX sem linha de repasse = bug grave.
- **I10 (novo)** O consentimento do modo HBX diz com todas as letras, sem juridiquês: onde o
  dinheiro cai, em quantos dias o lojista recebe, e o WhatsApp do suporte.

## Estado atual (fatos-fonte do mapa 11/07)
- Motor de cadência NÃO existe (`HbxRecoveryFlowStage.daysAfter` = config morta; envio hoje é
  manual `startTemplateFlow`/`sendPaymentLink` ou reativo via bot).
- Varredura logística→funil existe e SÓ cria o caso (`logistica-recovery.service.ts`, opt-in
  `LogisticaConfig.moduloRecoveryAtivo` default false, cron 24h). Quitar fiado fecha o caso.
- Freio de chip `WaSendThrottleService` existe, flag `HBX_WA_SEND_THROTTLE_ENABLED` **OFF na VPS**.
- Decisor de conta MP `resolveCompanyMercadoPagoAccess` (master-global-integrations.util.ts:282)
  prefere token do tenant e cai pro master. Usa: recovery (`hbx-recovery.service.ts:3738`,
  `messaging.service.ts:5994`) — certo pro tenant, mas com fallback master silencioso (I6!);
  recarga (`credit-recharge.service.ts:108`) — ERRADO (I5).
- Webhook MP roteável `?company_id=`; assinatura 1 secret global, modo `log`. NÃO ligar
  `enforce` com conta de tenant ativa.
- Fase 1 em prod: `/financeiro-tenant/*` + tela `/financeiro` + vendas gera cobrança.
- Sem UI hoje: toggle `moduloRecoveryAtivo`, `HbxRecoveryCustomer.automationEnabled`, gestão do
  funil (~40 endpoints órfãos).

## PARTES PICADAS (ordem de execução; 1 parte = 1 publish possível)

### P0 — TRAVA ANTI-FALLBACK (1ª a publicar; é o foco máximo do dono)
Nos fluxos de cobrança do cliente final (`sendPaymentLink` no hbx-recovery + link do bot no
messaging): empresa SEM conta MP própria e SEM modo HBX ativo → **não gerar link** (mensagem
clara: "Conecte sua conta Mercado Pago, ou fale com o suporte para ativar o Receber pelo HBX").
Elimina o `master_fallback` desses caminhos. Pix estático segue intocado (nunca tocou HBX).
Recovery quase não tem uso real hoje (sem UI) → freio primeiro, funcionalidade depois.
Teste: empresa sem token → link negado; empresa com token próprio → link na conta DELA.

### P1 — DIREÇÃO DA PLATAFORMA (cirúrgico)
Helper `resolvePlatformMercadoPagoAccess` (só master library/env, NUNCA `Company.mercadoPagoAccessToken`).
Trocar em `credit-recharge.service.ts` (`resolveMpAccessToken`) e nos pontos de PLANO/assinatura
do `financeiro.service.ts` (conferir `resolveFinanceContext` ~L1072). NÃO tocar recovery/messaging.
Teste: recarga com company que tem token próprio → pagamento sai no token master. Créditos verdes.

### P2 — PAINEL "COBRANÇA" na tela /financeiro (transparência ANTES do motor)
Aba em `frontend/src/app/(app)/financeiro/`: toggle do módulo (UI pro `moduloRecoveryAtivo` —
hoje só API) com texto honesto ("ao ligar, clientes com dívida vencida e telefone entram na
régua do seu WhatsApp"); lista "quem está na régua" (nome, valor, estágio, última/próxima msg);
**Pausar** por cliente (`automationEnabled=false`) e **Pausar tudo**; histórico por cliente;
"Cobrar agora" manual (reusa fluxo atual). Ao LIGAR, mostrar na hora quem VAI entrar. Switch
"não cobrar este cliente" também na ficha do /entrega. Tudo @Admin (Lei do Vendedor).

### P3 — MOTOR DA RÉGUA (só depois do P2 no ar)
**Pré-req de deploy: `HBX_WA_SEND_THROTTLE_ENABLED=true` na VPS.**
Cron caseiro (padrão `logistica-recovery.service.ts`), ~1×/h, por empresa:
gates fail-closed (`botArmedAt` + `recoveryBotLiveAt` + `moduloRecoveryAtivo` +
`resolveCompanyAccessState.canUse`) → casos `openAmount>0` + `automationEnabled` + telefone +
`sourceModule='logistica'` → estágio devido por `daysAfter` → **recheck da dívida ao vivo (I1)**
→ envia via `queueOutboundForCompany` (valor + Pix copia-e-cola da chave estática; link MP só se
P4/P5 der conta válida) → registra interação com UNIQUE [customerId, stageId] (I4).
Sem estágio restante → caso para (sem loop). Crédito: nada debita (track só, conferir allowlist
do meter). Testes: elegibilidade/estágio/idempotência unit + E2E em empresa de teste com número
descartável do Claude ANTES de chip de cliente (validação de software novo, não drama).

### P4 — CONECTAR CONTA MP DO LOJISTA (self-service)
Tela "Conectar Mercado Pago" na aba Cobrança: colar token, validar via `/users/me` (reusar
validação do master `companies.controller.ts:612`), mostrar conta conectada + desconectar.
Com conta: régua e "Cobrar agora" incluem link MP; webhook `?company_id=` + `applyPayment` baixam
sozinhos (conferir que a baixa também quita a `FinanceiroCharge` de origem — ligar a ponte se
faltar). Assinatura de webhook fica em `log` até secret por empresa (pendência explícita).

### P5 — MODO "RECEBER PELO HBX" (repasse) — decisões cravadas (decisão nº6)
Para o lojista que NÃO quer conta MP própria. Desenho:
- **Tela do lojista (aba Cobrança)**: explicação simples e honesta (I10), SEM botão de ativar —
  só "Falar com o suporte" (WhatsApp **+55 19 93300-5153**). Texto-modelo: "Nesse modo, o
  pagamento do seu cliente cai na conta da HBX e a HBX te paga em ATÉ {prazoDias} dia(s),
  descontando a comissão combinada de {comissaoPct}%. Fale com o suporte para combinar e ativar."
  Enquanto o modo está OFF, a tela mostra só o convite ao suporte (sem números de prazo/comissão).
- **Ativação SÓ pelo /master** (janela da empresa): campos OBRIGATÓRIOS na ativação, sem default —
  `prazoRepasseDias` (o que foi combinado na conversa) e `comissaoRepassePct`. Ativar exige os 2.
- **Consentimento do lojista**: depois do master ativar, o lojista vê o termo COM os números da
  empresa dele (prazo + comissão) e aceita na tela → registrado em banco (userId, data, versão do
  texto, prazoDias e comissaoPct da época). **Link MP no modo HBX só passa a funcionar APÓS o
  aceite do lojista** (ativação do master sozinha não basta — I6).
- **Com o modo ativo + aceite**: link MP usa a conta master; cada pagamento aprovado cria NA
  MESMA transação a linha de repasse (I9): model novo simples (valorBruto, comissaoPct,
  valorLiquido, chargeId/paymentId, companyId, dataLimite = paidAt + prazoDias, status
  pendente|pago, paidAt do repasse) + painel do lojista ("a receber da HBX", com data-limite) +
  janela no /master ("quem preciso pagar", ordenado por data-limite, botão "marcar pago" — o
  repasse em si é Pix MANUAL do dono, fora do sistema).
- Comissão/prazo são POR EMPRESA; mudar depois = nova conversa + novo aceite (versão nova do termo).

### P6 — GATES LIVE (ordem)
1. Throttle ON na VPS (antes do P3 em prod). 2. P3 validado em empresa de teste + número
descartável. 3. Publicar; conferir boot + cron logando. 4. Ligar módulo só nas empresas que o
dono mandar; 1 semana de painel antes de divulgar.

## FORA desta fase
Lembrete pré-vencimento; débito de crédito por cobrança (só track); repasse AUTOMÁTICO
(split/transferência MP — repasse é manual do dono nesta fase); negativação Serasa; parcelamento
na régua; Pix Automático; régua genérica multi-módulo (vendas na régua só após 1 ciclo limpo).

## Armadilhas conhecidas
- `openAmount` monofonte por cliente (caso manual × dívida logística não convivem; varredura pula
  quem tem caso manual — limite aceito nesta fase).
- `resolverDebtCaseSeQuitado` só fecha caso `sourceModule='logistica'` — de propósito, manter.
- Assinatura hardcoded de piloto (`HBX_RECOVERY_PAYMENT_APPROVED_SIGNATURE` "Equipe Colsani...")
  — limpar ao tocar nas mensagens.
- Sessões paralelas no mesmo tree; commit/publish é do dono; não reverter trabalho alheio.
- Teste `vendas-automation` vermelho (mock sem companyId) é pré-existente de outra frente.
