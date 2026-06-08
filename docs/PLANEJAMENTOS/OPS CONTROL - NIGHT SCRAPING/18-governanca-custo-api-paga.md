# Passo 18 - Governanca de custo para API paga

## Objetivo

Criar controle de custo antes de ligar qualquer API paga, incluindo Google oficial, Hunter ou provider equivalente.

## Decisao de margem

API paga e fallback escasso, nao motor principal.

Teto recomendado:

- HBX List: sem custo pago automatico.
- HBX Lead Plus: custo externo muito baixo e limitado.
- HBX Full: custo externo maior, mas ainda auditado.

Regra operacional:

- 70% do budget: reduzir automatico.
- 90% do budget: somente manual/admin.
- 100% do budget: travar paid fallback.

## Separar quotas

Nao misturar `enrichmentsPerDay` com API paga.

Adicionar conceitos separados:

```text
freeSmartEnrichmentsPerDay
paidGoogleFallbacksPerDay
paidEmailVerificationsPerMonth
paidApiBudgetBrlPerMonth
```

## Ledger obrigatorio

Criar `EnrichmentCostLedger` antes de provider externo:

```text
id
companyId
leadId
provider
sku
estimatedCostUsd
estimatedCostBrl
cacheHit
reason
planKey
triggeredBy
createdAt
metadataJson
```

Providers:

- `hbx`
- `google`
- `email_provider`
- `manual`
- `other`

`triggeredBy`:

- `auto`
- `manual`
- `admin`
- `retry`
- `import`

## Google oficial

Google so entra quando:

- lead tem score alto;
- falta dado critico;
- existe nome + cidade suficientes;
- cache nao tem resposta recente;
- plano permite;
- budget permite;
- FieldMask minimo esta definido;
- ledger registra antes/depois.

Nunca pedir campos caros por padrao. Validar precos atuais na tabela oficial antes de liberar producao.

## Provider de e-mail

Nao acoplar Hunter direto.

Criar interface:

```ts
interface EmailEnrichmentProvider {
  verify(email: string): Promise<EmailProviderResult>;
  domainSearch(domain: string): Promise<EmailProviderResult[]>;
  findByCompanyDomain(companyName: string, domain: string): Promise<EmailProviderResult[]>;
}
```

Providers:

- `internal`
- `external_disabled`
- `hunter`
- futuro provider.

Regra:

- `internal` sempre.
- provider externo so com Lead Plus/Full, score alto, dominio, cache miss e saldo.

## Arquivos provaveis

- `backend/prisma/schema.prisma`
- `backend/src/commercial-plans/commercial-plan-catalog.ts`
- novo service de budget/ledger em `backend/src/webscraping/enrichment-cost/`
- controllers/admin para consulta de consumo
- testes de bloqueio por budget.

## Criterios de aceite

- Nenhuma chamada paga acontece sem ledger.
- Nenhuma chamada paga acontece sem budget.
- Cache hit nao consome quota paga.
- List nao aciona Google/Hunter automatico.
- Lead Plus usa fallback pago somente em lead bom.
- Full tem limite proprio.
- Owner consegue ver custo estimado.

## Validacoes

- `cd backend && npm run prisma:validate`
- `cd backend && npm run build`
- testes de budget e ledger
- teste de provider externo mockado, sem chamada real

## Prompt Codex para aplicar

```text
Implemente o Passo 18 em `docs/PLANEJAMENTOS/OPS CONTROL - NIGHT SCRAPING/18-governanca-custo-api-paga.md`.
Crie ledger, budget e interfaces mockadas. Nao ligue chamada real para Google, Hunter ou outro provider neste PR.
```

