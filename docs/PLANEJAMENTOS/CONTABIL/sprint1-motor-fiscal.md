# CONTABIL S1 — Motor fiscal + fonte de verdade da receita (sem UI)

**Objetivo:** o cérebro. Um serviço que sabe calcular o Simples da HBX igual (ou melhor que) um
contador, alimentado pela receita REAL que já vive no banco (Mercado Pago live).

## Leia antes
- `docs/Rules/BACKEND.md` (padrões NestJS/Prisma da casa)
- `docs/PLANEJAMENTOS/CONTABIL/README.md` (Leis do Contabil — especialmente a nº2)
- Referência da matemática: seção 6 do guia do dono (Fator R) — números golden abaixo já conferidos

## Entregas

### 1. Migrations Prisma (novos modelos, prefixo Fiscal*)
```prisma
model FiscalProfile {            // singleton do dono (1 linha)
  id                Int      @id @default(1)
  cnpj              String?
  razaoSocial       String?
  dataAbertura      DateTime?
  regime            String   @default("simples")   // simples
  anexoBase         String   @default("V")          // nasce no V, Fator R decide
  cnaePrincipal     String   @default("6203-1/00")
  aliquotaIssMunicipal Float?                        // p/ exibição
  prolaboreAlvoPct  Float    @default(0.28)          // Fator R alvo
  certA1Encrypted   String?                          // S6 — AES-256-GCM, NUNCA em log
  certA1ExpiresAt   DateTime?
  serproCredEncrypted String?                        // S7
  updatedAt         DateTime @updatedAt
}

model FiscalRevenueMonth {       // consolidação mensal (competência = "2026-07")
  id                String   @id @default(cuid())
  competencia       String   @unique
  receitaCaixaCents Int      @default(0)   // MP aprovado no mês
  receitaNotasCents Int      @default(0)   // NFS-e emitidas (S6)
  ajusteManualCents Int      @default(0)   // correção do dono, com motivo
  ajusteMotivo      String?
  folhaMesCents     Int      @default(0)   // pró-labore bruto do mês
  rbt12Cents        Int      @default(0)   // calculado
  folha12mCents     Int      @default(0)   // calculado
  fatorR            Float?                 // folha12m / rbt12
  anexoAplicado     String?                // "III" | "V"
  aliquotaEfetiva   Float?
  dasPrevistoCents  Int?
  inssPrevistoCents Int?
  irrfPrevistoCents Int?
  fechadoEm         DateTime?              // S5 — mês fechado pelo copiloto
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

### 2. `backend/src/contabil/` (módulo-folha, sem ciclos — copiar filosofia do master-alert)
- `contabil.module.ts` — depende só de Prisma (+ MasterAlert no S2).
- `fiscal-tables.ts` — **constantes versionadas por vigência**:
  - Anexo III e V completos (6 faixas: alíquota nominal + parcela a deduzir — LC 123/2006);
  - INSS contribuinte individual: 11%, teto 2026 = R$ 8.475,55 (máx R$ 932,31/mês);
  - IRRF 2026: tabela progressiva + **isenção Lei 15.270/2025** (zero até R$ 5.000/mês de
    rendimento, redutor decrescente até R$ 7.350);
  - Presunção de lucro isento serviços: 32% da receita bruta − DAS pago (sem escrituração completa);
  - Cada bloco com `{ vigenciaInicio, vigenciaFim?, fonte }` — pra quando o governo mudar, a
    correção ser 1 constante nova, não um refactor.
- `fiscal-engine.service.ts` — funções PURAS (entrada → saída, sem I/O):
  - `rbt12(competencia)`, `folha12m(competencia)` — com **proporcionalização de início de
    atividade** (empresa com <12 meses: média × 12, regra do PGDAS-D);
  - `fatorR(folha12m, rbt12)` → anexo aplicado (≥0,28 → III);
  - `aliquotaEfetiva(rbt12, anexo)` = (rbt12 × aliqNominal − dedução) / rbt12;
  - `dasDoMes(receitaMes, aliquotaEfetiva)`;
  - `inssProlabore(bruto)` (11%, teto), `irrfProlabore(bruto, inss)` (isenção 2026);
  - `prolaboreRecomendado(receitaPrevistaMes, folha11mAnteriores, rbt12)` → o valor exato que
    mantém Fator R ≥ 0,28 na competência (o "pensa comigo" nº1);
  - `simulaCenario(receitaMes, prolabore)` → { das, inss, irrf, totalTributos } — base do simulador
    da UI (S3);
  - `lucroIsentoDisponivel(ano)` = 32% × receita acumulada − DAS pago acumulado − já distribuído.
- `revenue-sync.service.ts` — consolida `receitaCaixaCents` do mês a partir da fonte MP REAL:
  - **Primeira tarefa do executor: mapear a fonte exata** — `CompanySubscription` (status/eventos)
    + webhook MP em `backend/src/payments/` + `MasterPaymentNotificationLog`. Critério: dinheiro
    APROVADO no mês (regime de caixa). Documentar a query escolhida no próprio service.
  - Idempotente (re-rodar não duplica), recalcula a cadeia rbt12/fatorR/das do mês afetado.

### 3. Endpoints (owner-only, mesmo guard das rotas /master existentes)
- `GET /master/contabil/mes/:competencia` — FiscalRevenueMonth completo (calcula on-demand se não existir)
- `GET /master/contabil/simulador?receita=&prolabore=` — simulaCenario
- `PATCH /master/contabil/perfil` — FiscalProfile (sem campos *Encrypted por aqui)
- `POST /master/contabil/mes/:competencia/ajuste` — ajuste manual com motivo obrigatório

## Golden tests (obrigatórios — o aceite É passar neles)
Números conferidos com a legislação 2026 (guias do dono):
1. RBT12 120.000_00 + folha12m 33.600_00 → fatorR 0,28 → Anexo III → efetiva 6% → receita mês
   10.000_00 → DAS 600_00; pró-labore 2.800_00 → INSS 308_00, IRRF 0 → total tributos 908_00.
2. Mesmo RBT12 com pró-labore mínimo (1.621_00/mês) → fatorR <0,28 → Anexo V → efetiva 15,5% →
   DAS 1.550_00; INSS 178_31 → total ~1.728_31. (Diferença vs cenário 1 ≈ 820/mês.)
3. RBT12 360.000_00, Anexo V: efetiva 16,75% (18% − ded 4.500) → DAS mês 5.025_00.
   Anexo III: efetiva 8,6% (11,2% − ded 9.360) → DAS 2.580_00; pró-labore 8.400_00 →
   INSS 924_00, IRRF ≈ 1.147_17 (sem redutor: bruto > 7.350).
4. INSS teto: pró-labore 20.000_00 → INSS = 932_31 (não 2.200).
5. IRRF isenção: bruto 5.000_00 → IRRF 0. Bruto 4.000_00 → IRRF 0.
6. Proporcionalização: empresa aberta há 3 meses, receita 10k/10k/10k → rbt12 = 120.000_00.
7. Lucro isento: ano com 120.000_00 de receita e 7.200_00 de DAS → disponível 31.200_00.
8. `prolaboreRecomendado` devolve valor que, aplicado, produz fatorR ≥ 0,2800 (nunca 0,2799…).

## Aceite
- `cd backend && npx tsc --noEmit` verde + suíte do módulo verde (golden tests 1–8).
- Endpoint do mês atual respondendo com receita real do MP (conferir manualmente contra a
  janela-pagamentos do master).

## Guardrails
- Dinheiro em **cents (Int)** — nunca Float em valor monetário (Floats só em percentuais).
- Nada de credencial/segredo neste sprint (campos *Encrypted ficam null até S6/S7).
- Não tocar em nenhum fluxo de pagamento existente — o Contabil só LÊ as fontes MP.
