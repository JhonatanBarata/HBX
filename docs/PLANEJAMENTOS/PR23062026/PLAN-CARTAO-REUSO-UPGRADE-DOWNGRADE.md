# Reuso do cartão da ficha no upgrade/downgrade ("•••• 4242 — confirmar")

**Pedido do dono (23/06):** o cartão que o cliente já passou pra pegar o trial tem que
**aparecer** na hora de assinar/subir/baixar de plano — *"VISA •••• 4242 — confirmar upgrade?"*
— em vez de pedir o cartão de novo. "O sistema deve facilitar o upgrade, não dificultar."

## Diagnóstico (estado real do código)
- O trial **já salva o cartão**: assinatura criada no MP com `free_trial` (cartão autorizado
  agora, 1ª cobrança no fim). `cardBrand`/`cardLast4` ficam gravados na `CompanySubscription`.
- **Pagante:** `change-plan` reusa o cartão via `updatePreapproval` — mas **silencioso** (a tela
  nem mostra o cartão).
- **Trial (caso do dono):** `changePlanForUser` trava em `isPaying` → upgrade devolve
  `NEEDS_CHECKOUT` e o front abre o **formulário de cartão de novo**. **Não reusa.**
- O `last4` **não** chega no `/commercial-plans/me` (`buildCurrentState` nem carrega a subscription).
- **CORREÇÃO 23/06 — o localhost DESTE dono NÃO é mock.** `backend/.env` tem
  `PAYMENTS_PROVIDER=mercadopago` (+ chaves) → `getPaymentsConfig` devolve `mode:'live'` (conta de
  TESTE do MP). Logo a premissa "Mock (localhost) = ponta a ponta" (decisão 4) **não vale aqui**:
  o local já tokeniza no MP real e o upgrade com `chargeNow>0` cai em `LIVE_PRORATION_TODO` → form
  de cartão. **É por isso que o dono viu "cartão não salvou" + upgrade pedindo cartão de novo.**
  Pra exercitar o caminho mock ponta-a-ponta, setar `PAYMENTS_PROVIDER=mock` no `backend/.env`.
- **last4 some no live:** `subscriptionCardSnapshot` (`financeiro.service.ts:797`) lê
  `last_four_digits` da resposta de **preapproval** do MP, que nem sempre vem → `billingCardLast4`
  fica null → painel diz "sem cartão" embora o cartão ESTEJA vinculado no gateway. B1 tem que
  capturar o last4 de forma confiável (do token/pagamento autorizado), não só surfaçar o campo.

## Decisões (Opus, frente financeira — edito direto + diff review)
1. Surfaçar `savedCard {brand,last4}` no `/commercial-plans/me` (gated: vendedor nunca vê).
2. Mostrar "•••• 4242 — confirmar" no `TrocarPlanoModal` e no "Assinar agora", com link
   **"usar outro cartão"** (fallback = CheckoutPanel de hoje).
3. **Trial reusa o cartão:** upgrade/assinar no trial passa a converter pela assinatura
   existente (reusa o cartão autorizado), não abre formulário.
   - Upgrade/assinar no trial = converter agora (encerra trial, cobra) — "preciso do pro".
   - Downgrade no trial = só troca a seleção (sem cobrança), como hoje.
4. **Live continua atrás da trava de validação no VPS** (cobrança avulsa/diferença). Mock
   (localhost) = ponta a ponta. Honesto: em produção ainda cai no cartão até validar.

## Redesenho visual do modal — FEITO 23/06 (Opus direto, só front, working tree NÃO commitado)
Pedido do dono (23/06): o modal de upgrade/downgrade ficou "vazio dos lados"; tem que **reusar o
UI/UX que já existe** — o card "Detalhes do plano" da landing + o "cartão de crédito"
(`CheckoutPanel`). Aplicado (type-check verde, landing provada idêntica no preview):
- **Extraí** `frontend/src/components/hbx/plan-detail-card.tsx` do corpo `site-plan-intruder` da
  landing (`page.client.tsx`) → fonte única, usado na landing E no modal (igual o `PlanCard`).
- `TrocarPlanoModal` agora mostra: **faixa "antes→depois"** (preço, acessos, leads/mês, seta ↑/↓)
  + **detalhe do destino no MESMO UI da landing** (`PlanDetailCard`) + a linha de diferença/crédito
  (do dryRun). Card alargado (`bv-card--plan`); classes novas em `screens.css` (só token, sem hex).
- Passo do cartão = `CheckoutPanel` (já era reusado via `onConfirmUpgrade`) — nada novo.
- **B3 abaixo encaixa AQUI:** a linha "•••• {last4} — confirmar" entra DENTRO deste modal já
  redesenhado, não num modal à parte.
- **Pendente:** commit; **revisão visual do dono** (o modal é auth-gated; provei só a extração na
  landing pública, não o modal ao vivo). Build/publish travado por WIP do dono (ver Riscos).

## Blocos
### B1 — Backend: surfaçar o cartão salvo
- `buildCurrentState` (commercial-plans.service.ts): carregar a `CompanySubscription` vigente,
  devolver `savedCard: {brand,last4} | null` no `current`.
- `presentCurrentStateForUser`: zerar `savedCard` p/ audiência não-billing (vendedor).
- Tipo `CommercialCurrentState`: + `savedCard`.

### B2 — Backend: trial reusa o cartão no change-plan
- `changePlanForUser`: no ramo `!isPaying`, se a empresa está em **trial com assinatura
  `trialing` + cartão na ficha**, em vez de `NEEDS_CHECKOUT`:
  - upgrade/mesmo-plano → converter pela assinatura existente (reusa preapproval):
    - mock: status `active`, período, ledger da cobrança (ponta a ponta).
    - live: `updatePreapproval` p/ novo valor; cobrança imediata gated → devolve `LIVE_*_TODO`.
  - downgrade → mantém o comportamento atual (troca de seleção, sem cobrança).
- Mesmo-plano (converter trial→pago sem trocar tier) entra aqui também (não é noop quando vindo
  do "Assinar agora" do trial).

### B3 — Frontend: mostrar e reusar
- Tipos `current.savedCard` (shell.tsx `PlanMe`, configuracoes).
- `TrocarPlanoModal`: se `savedCard`, linha "•••• {last4} {brand}" + confirma reusando (chama
  change-plan inclusive no trial); link "usar outro cartão" → `onConfirmUpgrade` (CheckoutPanel).
- "Assinar agora" (sidebar + configuracoes): se `savedCard` no trial, confirma reusando o cartão
  (sem formulário) + "usar outro cartão". Sem `savedCard` → CheckoutPanel de hoje.

### B4 — testar.md (leigo) — feito.

## Riscos / reverter
- Redesenho do modal: risco baixo, só front/leitura. Reverter = `git checkout` dos 3 arquivos
  + apagar `plan-detail-card.tsx`.
- B1/B3 (mostrar + reusar): risco baixo, UI/leitura. Reverter = `git checkout` dos arquivos.
- B2 (trial converte reusando): toca lifecycle da assinatura. **Live gated** — só mock converte
  no localhost (e o localhost do dono é LIVE, ver Diagnóstico). Reverter = `git checkout
  financeiro.service.ts`. Reseed desfaz estado local.
- **Build/publish travado por WIP do dono (não por mim):** `npm run lint` está vermelho por (1)
  CSS cru (hex/rgba) do portal/chooser V1.0 em `screens.css` (R1 do check-pele) e (2) o
  `useEffect`+`checkoutIntentRef` em `configuracoes/page.client.tsx` (regra react-hooks). Não
  toquei (trabalho paralelo do dono) — mas trava o build até limpar. Meu código: TS 0 erros,
  zero violação de pele.
- Nada de cobrança real disparada por mim (Guardrails).

## Status
- [x] Redesenho visual do modal (front, working tree)
- [x] **B1** — `savedCard {brand,last4}` no `/commercial-plans/me` (gated). tsc verde.
- [ ] **B2** — trial reusa cartão no change-plan. **NÃO feito** (localhost LIVE → cobrança avulsa
      gated; e você foi por `changePreapprovalCard`+`syncSubscriptionForUser`). Decidir se ainda quer.
- [~] **B3** — linha "•••• {last4} — confirmar" + "usar outro cartão" no modal, **só caso PAGANTE**
      (onde change-plan reusa de verdade). Trial não entra até B2/validação live. tsc+lint verdes.
- [x] **B4** — testar.md leigo.
- [x] **Fix build** — removido meu auto-open (`checkoutIntentRef`) que dava erro "setState in effect"
      e abria form em branco (errado com o reuso). "Assinar agora" só leva pra tela do plano agora.
