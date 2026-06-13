# PR13062026001 — Aquecimento de leads (cadência tipo Apollo)

> **REVISÃO 13/06 (auto):** build DEFERIDO. A cadência depende do bot/automação, que a
> régua tornou **MURO fail-closed** (só liga com triagem completa) e que o dono decidiu
> **NÃO impor às vendedoras na 1ª semana** (elas aprendem o HBX primeiro — árvore 3).
> Design segue 100% válido; implementar junto do **Atendimento + Bot** (árvore 3), não antes.

> Design fechado pelo dono. Decisões 12–13/06/2026. **Build agendado para 13/06 (à
> tarde)**, depois da entrega da manhã das funcionárias (basicão funcionar, fechar uma
> venda, tutorial TOP, PDF da apresentação). A deadline de segunda deixou de travar isto:
> o cadastro das funcionárias já está completo.

## 1. O que já existe (nada nasce do zero)

A prospecção do Vendas **já é** um motor de disparo com quase tudo do Apollo, faltando
uma coisa só. Diagnóstico do código real:

| Peça | Onde | Estado |
|---|---|---|
| Campanha de prospecção | `VendasAutomationCampaign` (schema.prisma:2293) | 1 `messageTemplate`, `intervalMinutes` (entre leads), `dailyLimit`, `maxAttemptsPerLead` **default 1**, `workingHoursStart/End`, simulação de digitação, keywords de intenção, `optOutMessage`. |
| Job por lead | `VendasAutomationJob` (schema.prisma:2331) | 1 linha por (campanha, lead). status: `pending→scheduled→sending→sent→replied_positive/negative/no_response_archived/failed/skipped/canceled`. Tem `attemptNumber`, `conversationId`, `scheduledAt/sentAt/repliedAt`. |
| Worker/scheduler | `vendas-automation.service.ts:508` (`setInterval`) | Pega jobs vencidos, envia 1º contato, espera resposta com `replyDeadlineAt`, classifica intenção, aplica opt-out. |
| Segurança de abordagem | `prospecting-safety.ts` | Templates/variantes de 1º contato, sanitize, classificação de resposta, opt-out. |
| Funil do lead | `VendasLead.status` (schema.prisma:2124) | `novo→contato→retorno→qualificado→encerrado` + `attemptCount`, `lastContactAt`, `nextAction`, `returnAt`. |
| Timeline | `VendasLeadTimelineEvent` (schema.prisma:2242) | Histórico append-only por lead. |
| Canais | Evolution/Webwhats + **CompanyMailer (PR-005)** | WhatsApp (confirmed só via Webwhats) + e-mail por empresa (SMTP por tenant). |
| Munição | Radar | Card já entrega `painType/painLabel/painPitch` + `recommendedChannel`. |

## 2. O furo (a única coisa que falta pra ser "Apollo")

Hoje o motor é **tiro único**: `maxAttemptsPerLead=1`, **um** template, 1 Job = 1 toque.
Apollo **aquece** = **cadência multi-toque** com cursor por lead, pausando sozinha na
resposta + score de engajamento. Tradução: o Job vira um **cursor que anda por N passos**
de uma sequência, reusando scheduler + detecção de resposta + opt-out que já existem.
**Não é motor novo — é camada de "passo atual / próximo passo".**

## 3. A sequência concreta (DECIDIDA pelo dono)

E-mail aquece; WhatsApp humaniza em cima dele. A munição (dor) vem do Radar (`painPitch`).

- **Passo 1 — E-mail (dia 0)** via **CompanyMailer (PR-005)**. É pra isso que serve o
  cadastro de e-mail por admin: o 1º toque é o e-mail da própria empresa. Assunto/corpo
  usam a dor detectada (`painType/painPitch`).
- **Passo 2 — WhatsApp (dia X, humanizado)** referenciando o e-mail:
  *"Olá! Te mandei um e-mail dia {data} sobre {dor} — chegou aí?"*. Aquela puxada humana
  no chat que transforma frio em conversa.
- **Passo 3+ (opcional)** — outro ângulo / outro canal, só se sem resposta.

Regra de ouro do toque 2: ele **referencia de verdade** o que aconteceu no passo 1
(data do e-mail), nunca um "oi genérico". O humano sente que houve história.

## 4. Gating por plano (DECIDIDO pelo dono — não toca em cobrança, só lê entitlement)

**Auto-enrollment a partir do Radar = só plano `full` (`hbx_melhor`, "HBX Full — Bot e IA").**

Encaixe com o catálogo atual (`commercial-plan-catalog.ts`): o Full **já** declara
`requiresAssistedSetup: true`, `setupFeeMode: 'negotiated'`, *"Implantação e configuração
assistida pela HBX"*, *"Bot de prospecção pós-resposta"* e *"Automação com limites e
segurança"*. O passo WhatsApp da cadência exige **implantação assistida do WhatsApp**
(Evolution/Webwhats por cliente) — exatamente o que o Full empacota. **Não é regra de
preço nova; é amarrar a cadência no plano que já promete a implantação.**

- **Motivo do dono**: Lead Plus (R$99) é barato demais pra implantar WhatsApp
  cliente-a-cliente na mão. Full (R$149,90 + setup negociado) tem acompanhamento.
- **Capacidade operacional atual**: dono aguenta ~20 clientes de implantação manual
  tranquilo → cap suave de onboarding Full por enquanto (não é trava de código, é
  realidade de operação; pode virar fila depois).
- **Lead Plus / List**: seguem com o **tiro único** de hoje (sem mudança, retrocompat).
- **ABERTO p/ decisão do dono**: liberar cadência **só-e-mail** no Lead Plus? E-mail via
  CompanyMailer **não** exige implantação manual, então tecnicamente caberia. Não decido
  preço — fica como pergunta.
- **Implementação**: ler `getCommercialPlanTier(company.selectedPlanKey) === 'full'`
  (catálogo já expõe). Só leitura de entitlement; **nada** de checkout/webhook/preço.

## 5. Modelo de dados (aditivo; campanha sem cadência = igual hoje)

Migração aditiva `20260613_vendas_cadence`. Retrocompatível.

**`VendasAutomationCampaign` ganha:**
- `cadenceStepsJson String?` — `[{ order, channel:"email"|"whatsapp", delayHoursAfterPrev, template, variantsJson?, condition?:"no_reply" }]`. `messageTemplate` vira o passo 0 default quando nulo.

**`VendasAutomationJob` vira cursor (ganha):**
- `currentStepIndex Int @default(0)`, `nextTouchAt DateTime?`,
  `cadenceStatus String @default("active")` (`active|paused_replied|completed|opted_out|stopped_manual`),
  `engagementScore Int @default(0)`.

**Nova tabela `VendasCadenceTouch`** (1 linha por envio real → rastreio por passo + base do score):
- `jobId, companyId, leadId, stepIndex, channel, scheduledAt/sentAt, status (scheduled|sent|failed|skipped), engagement (delivered|opened|clicked|replied), messageRendered, conversationId?, emailMessageId?`.
- índices `[jobId, stepIndex]`, `[companyId, channel, sentAt]`.

## 6. Scheduler (o que muda no tick — `setInterval` já existe)

Além do que já faz:
1. **Avançar cadência**: Job `active` com `nextTouchAt<=now`, em working hours, sem
   resposta → renderiza o passo (variante anti-igualdade), envia pelo canal do passo
   (e-mail via CompanyMailer / WhatsApp pelo caminho atual), cria `VendasCadenceTouch`,
   `currentStepIndex++`, `nextTouchAt = now + próximoPasso.delay`. Último passo → `completed`.
2. **Resposta pausa a sequência (núcleo do Apollo)**: inbound → `paused_replied`,
   classifica, **para os toques**. Nunca dispara em cima de conversa viva.
3. **Opt-out / negativo = parada dura + dedupe permanente** (regra de ouro do MOTOR:
   negativo nunca some/recontata) → `opted_out`.
4. **Vendedora mandou msg manual** → `stopped_manual` (humano assumiu).
5. **Limites por toque, não só no 1º**: `dailyLimit` + variância + working hours +
   digitação humana em **todos** os passos (anti-ban WhatsApp).

## 7. Score → calor

`engagementScore` = soma ponderada dos toques: `replied` >> `clicked` > `opened` >
`delivered`. E-mail (CompanyMailer) carrega pixel de abertura / redirect de clique →
alimenta o score; WhatsApp só `delivered + replied`. Resposta positiva → `VendasLead.status`
vira `retorno`/`qualificado`; badge "🔥 quente" acima do limiar. Vendedora prioriza quem
esquentou.

## 8. Segurança (não-negociável — vale em todo passo)

Opt-out em cada passo; negativo = parada dura + dedupe permanente; working hours + daily
limit + timing humano em todos os toques; resposta pausa a sequência inteira; WhatsApp
`confirmed` só via Webwhats; vendedora vê sequência + calor, **nunca** cobrança.

## 9. Endpoints (REST, `JwtAuthGuard`, escopo por empresa)

- `POST /vendas/cadences` (cria sequência) · `GET /vendas/cadences` · `PATCH /vendas/cadences/:id` (edita/pausa/retoma).
- `POST /vendas/cadences/:id/enroll` (matricula por filtro/ids — gate `full` no auto a partir do Radar).
- `GET /vendas/leads/:id/cadence` (passo atual + toques + score).
- Reusa pause/resume/cancel de campanha que já existem.

## 10. Frontend (ESQUELETO — só estrutura/fluxo, sem visual; REGRA ZERO)

Visual = classes centrais/tokens (5 LEIS); estrutura/escrita = referência `docs/TEMAS`.
Card do lead ganha painel **cadência** (stepper passo 1..N, próximos toques, badge de
calor). Form "criar sequência" (canal + delay + template/variantes). Só liga endpoint;
mesmo DOM em qualquer tema.

## 11. Fasiamento (build — começa 13/06 à tarde)

1. **F1** — schema aditivo + cursor no Job + **passo 1 e-mail (CompanyMailer)**. Menor PR útil.
2. **F2** — passo 2 WhatsApp humanizado ("te mandei e-mail dia X") + tracking de abertura → score.
3. **F3** — score/badge de calor + tela de sequência.
4. **F4** — auto-enrollment a partir do Radar **gated `full`** (Encomenda → cadência).

## 12. Riscos

- **Ban de WhatsApp**: limites + variância + working hours são obrigatórios, não opcionais.
- **Conflito com atendimento humano**: cadência pausa quando a vendedora assume.
- **Gargalo de implantação**: WhatsApp Full é manual hoje (~20 clientes); virar fila
  quando crescer (gera necessidade de funcionário, como o dono já previu).

## 13. Métricas de sucesso

- % de leads que respondem **após o toque 2+** (vs só toque 1 hoje).
- Taxa de opt-out baixa (subiu = virou spam).
- Leads "quentes" que viram `qualificado`.

## Checks por PR

- Backend: `npm run prisma:validate` → `npm run build` (+ `vendas-automation.service.test.ts`).
- Migração aditiva; edições pequenas seguem a fila do PLAN12062026001 (lote + docker restart).
