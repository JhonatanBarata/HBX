# S3-PARTE2 — Recarga self-service via MercadoPago (cartão one-off) — RESULTADO (05/07)

> Feito DIRETO pelo Opus (frente financeira). **LOCAL, NÃO publicado.** Tudo atrás de
> `HBX_CREDITS_ENABLED` (OFF em prod ⇒ 404, rota inerte). Completa o S3: parte1 (catálogo
> editável + concessão master) já estava no master pela fusão; agora o admin COMPRA crédito.

## O que foi criado
- **`backend/src/financeiro/credit-recharge.service.ts`** — serviço NOVO no financeiro (não
  engorda o `financeiro.service` de 4.4k linhas). Por que no financeiro e não no credits:
  preserva a invariante do S2 (**CreditsModule depende SÓ do Prisma**; CommercialPlans→Credits
  sem ciclo) — o financeiro importa o CreditsModule e é a casa única da cobrança de cartão.
- **`credit-recharge.controller.ts`** — `POST /financeiro/credits/recharge` (JwtAuthGuard; a
  autorização fina mora no service: `isBillingOwnerActor` ⇒ vendedor E GERENTE levam Forbidden
  NEUTRO — `@Admin()` deixaria gerente passar, LEI DO VENDEDOR não deixa).
- **`financeiro.module.ts`** — imports += CreditsModule; wiring dos 2 novos.
- **Front** — `credits-wallet-section.tsx`: CTA "Recarregar" saiu do "em breve" → fluxo real
  com `CheckoutPanel` (`submitOverride` + `amountOverride`, mesmo padrão do upgrade live);
  `configuracoes/page.client.tsx` passa email/nome pro panel.

## Regras de dinheiro implementadas
- **Regra de Ouro** (caminho já provado do upgrade live): `createPayment` one-off síncrono;
  só credita com `status=approved` na resposta. Recusado → `CHARGE_DECLINED`, gateway caiu →
  `CHARGE_FAILED`, sem cartão → `CARD_REQUIRED`; nos três, NADA muda no ledger.
- **Idempotência em 3 camadas:** front gera `idempotencyKey` (1 UUID por intenção) →
  (1) `X-Idempotency-Key` do MP (retry de rede não cobra 2×; MP devolve o MESMO pagamento);
  (2) `usageKey = mp:<paymentId>` no grant (ledger dedupa o crédito);
  (3) receita dedupada por `externalReference` único (`hbx-credit-recharge-<companyId>-<key>`,
  P2002 tratado).
- **Receita NA COMPRA (D3/S5-ponte):** `FinanceiroCharge` gravado `approved/paid` na hora com
  competência do mês (regime de caixa) — o fiscal consome daí. Lote `grantType: 'paid'`,
  validade = `defaultExpiryDays` do pacote (fallback: default global D6).
- **Cartão-only nesta fase (decisão explícita):** Pix/boleto exigem confirmação assíncrona →
  webhook 2-fases fail-closed; fica como onda própria, não meio-implementado.

## Checks
- Backend: `npm run build` verde; suíte nova **10/10**; créditos+recarga+shadow **83/83** no
  mesmo run. `test:credits` atualizado pra rodar a pasta inteira + usage-limits.
- Front: `next build` (rodando ao gravar este arquivo — resultado no chat da sessão) +
  check-pele (reprova pré-existente em `hbx-theme/whatsapp.css`, não relacionada).
- Gotcha de teste registrado: a cadeia de imports puxa dotenv → `.env` DEV (PAYMENTS_PROVIDER=
  mock) contaminava a suíte; o teste força `PAYMENTS_PROVIDER=mercadopago` no topo.

## Pendências honestas (pro dono)
1. **Validação LIVE na VPS** com cartão real (igual pendência do upgrade/trial-end) — mock e
   testes não provam o gateway de verdade. Roteiro: ligar `HBX_CREDITS_ENABLED=true` na VPS,
   comprar o menor pacote com cartão do dono, conferir lote na carteira + charge no financeiro.
2. **CheckoutPanel reusado às pressas:** `planKey="hbx_padrao"` só alimenta textos internos do
   panel; `title`/`ctaLabel`/`amountOverride` cobrem o visível. Revisar copy na tela real.
3. `credited: 0` no retorno quando o retry dedupa (idempotente) — o front atual só mostra
   sucesso genérico; ok pra F1.
