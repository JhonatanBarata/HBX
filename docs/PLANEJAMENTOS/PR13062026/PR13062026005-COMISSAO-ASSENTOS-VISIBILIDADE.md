# PR13062026005 — Comissão visível, implantação e cap de assento (foco 100% vendedora)

> Ordem do dono (13/06/2026): foco combinado é as 2 vendedoras de segunda. A comissão
> VISÍVEL é a motivação de dia 1 — "fechei empresa pro cara e nem vejo quanto vou ganhar"
> desanima. Logo isto NÃO é desvio do foco; é o foco. Dono autorizou o build (domínio
> PAGAMENTOS liberado nesta tarefa). 2 dias de prazo.

## STATUS (13/06) — F1 ✅ · F2 ✅ · F3 🟡

Entregue e testado (backend build + front lint/build; comissão 7/7, vendas 68/68). **Local, nada deployado.**

### ⚠️ PRECISA ANTES DE TESTAR
- **Reiniciar o container `hbx-backend`** — as 4 colunas novas (`setupValue`,
  `setupCommissionAmount`, `setupCommissionStatus` no lead; `seatCap` na company) se
  auto-criam no boot via runtime-ensure, e a lógica nova só vale após o restart.
  Frontend já vale no `npm run up`.

### PENDÊNCIAS (próxima sessão — não relido)
1. **F3 — tabela de preço da mensalidade no modal de fechar** (pequeno): ler do catálogo
   via API (sem hardcode) e mostrar List/Lead+/Full pra vendedora saber o valor ANTES de
   fechar. Hoje ela vê o valor no card só DEPOIS.
2. **Receivable `kind:'setup'` no payout** (follow-up): a comissão de implantação hoje vive
   no lead e aparece no card + no resumo "a receber", mas NÃO vira linha formal no batch de
   pagamento. Integrar quando for pagar comissão de verdade.
3. **Cap na reativação** (follow-up): o teto rígido barra na CRIAÇÃO de acesso; reativar um
   acesso inativo não passa pelo gate. Fechar se virar problema.

## Diagnóstico (o que já existe — confirmado lendo o código)

- **Comissão da MENSALIDADE: ✅ funciona e é automática.** Mensalidade = preço do plano
  (catálogo; Full R$149,90). Comissão = `mensalidade × User.commissionPercent`, aparece no
  card de Vendas (linha Venda/Valor fechado/Comissão) e sincroniza sozinha quando o cliente
  ativa/paga (`hbx-commission-sync.service.ts`, gatilhos em auth/financeiro/vendas/gerencial).
  Recorrência mensal + **herança até 5 níveis** (`referredByUserId` / `referredByCommissionPercentSnapshot`).
- **Status do cliente indicado: ✅ no card** (`saleStatus` sincroniza). 🟡 falta painel consolidado.
- **Implantação/setup: ❌ não existe.** Catálogo diz `setupFeeMode: 'negotiated'` mas NÃO há
  campo de valor de setup no schema → master não registra, não comissiona, vendedora não vê.
- **Cap de assento: ❌ não existe.** Modelo é "2 inclusos + extra medido R$24,90/mês" (sem trava).
  O "1 de 2 assentos" é informativo. Dono quer **cap rígido**.

## Decisões travadas (dono, 13/06)

1. **Assento = cap RÍGIDO por empresa.** Bloqueia criar acesso além do teto. Master controla.
2. **Implantação = campo por lead** (`setupValue` + comissão one-time), NÃO produto.
   Motivo: menor risco ao motor mensal que já funciona; semântica "one-time" limpa; valor é
   negociado por negócio (cabe no lead, não no catálogo). (Revisão da ideia "produto" do
   diagnóstico — fica registrado; dono pode vetar.)
3. **Comissão da vendedora visível** no card (mensalidade + implantação) e num painel próprio.
4. Base de comissão com desconto: decidir depois (default atual = preço de tabela). Não bloqueia.

## Modelo de dados (aditivo, retrocompatível)

Migração `20260613_commission_setup_seatcap` (aditiva):
- `VendasLead.setupValue Float?` — valor negociado da implantação (one-time).
- `VendasLead.setupCommissionAmount Float?` — comissão da vendedora sobre a implantação.
- `VendasLead.setupCommissionStatus String?` — pending|payable|paid|canceled|none (espelha a venda).
- `VendasCommissionReceivable` ganha `kind:'setup'` (one-time, gerado no fechamento).
- `Company.seatCap Int?` — teto rígido de assentos (null = sem cap / comportamento atual).

## Fatias de execução (cada uma testada antes da próxima)

### F1 — Implantação: valor + comissão visível (o coração) — ✅ OK (13/06, build verde)
- [x] schema: `setupValue/setupCommissionAmount/setupCommissionStatus` no lead (runtime ensure em prisma.service).
- [x] DTO `UpdateVendasLeadDto`: aceita `setupValue`.
- [x] service close (`buildSaleCommissionPatch`): grava setup + comissão one-time espelhando o status da venda.
- [x] motor `hbx-commission-sync`: calcula a comissão do setup quando o cliente ativa pelo link
      (a venda confirma sozinha) — `setupValue × percent`, não recorrente.
- [x] payload do lead (`presentLead`): expõe `setupValue/setupCommissionAmount/setupCommissionStatusLabel`.
- [x] front card de Vendas: linhas "Implantação" + "Comissão implantação".
- [x] front fechamento: campo "Implantação (R$)" no modal; persiste antes do handoff e no salvar.
- Nota: receivable formal `kind:setup` no payout NÃO foi criado — o valor da comissão de setup
  vive no lead e aparece no card. Integrar no batch de payout = follow-up se o dono quiser.

### F2 — Cap rígido de assento — ✅ OK (13/06, build verde)
- [x] schema `Company.seatCap` + runtime ensure (master-runtime).
- [x] enforcement: `createCompanyUser` (admin E master) barra criar acesso quando `activeUsers >= seatCap`.
- [x] master (aba Comercial → "Limites por empresa"): campo "Assentos (teto)" via endpoint card-quota (update condicional, não apaga quota).
- [x] banner do "Novo acesso" mostra o teto e avisa quando atingido.
- Nota: o cap conta acessos ATIVOS na criação. Reativar um acesso inativo não passa pelo gate
  (caminho de ativação não checado) — follow-up se virar problema.

### F3 — Vendedora enxerga preço + comissão antes/depois — 🟡 PARCIAL (13/06)
- [x] resumo/pipeline de comissão (`buildHbxClosingPipeline`) soma a comissão de implantação
      no total "a receber" e expõe `setupValue/setupCommissionAmount` por item.
- [ ] tabela de preços (mensalidade por plano) no modal de fechar — FALTA (pequeno; ler do
      catálogo via API, sem hardcode). Hoje ela vê o valor no card depois de fechar.
- Nota: o painel consolidado "minhas comissões" já existe (resumo de Vendas) e agora inclui setup.

## Trava (regras)
- Migração só aditiva; edições de backend em lote (PLAN12062026001) + docker restart.
- Não afrouxar paywall; vendedor vê a PRÓPRIA comissão (permitido), nunca a cobrança do cliente.
- Front respeita as 5 LEIS (classe central/token, catraca não sobe).

## Checks
- Backend: `prisma:validate` → `build`. Front: `lint` → `build`.
