# CONTABIL S4 — Livro Caixa automático + painel de lucro isento

**Objetivo:** o livro obrigatório da ME escriturado sozinho (a lei pede Livro Caixa com TODA a
movimentação — art. 26 LC 123) + o painel que responde "quanto posso tirar da empresa sem imposto?".

## Entregas

### 1. Migration `FiscalLedgerEntry`
```prisma
model FiscalLedgerEntry {
  id          String   @id @default(cuid())
  data        DateTime
  competencia String                   // "2026-07"
  tipo        String                   // ENTRADA | SAIDA
  categoria   String                   // RECEITA_ASSINATURA | DAS | DARF_INSS | PROLABORE |
                                       // DISTRIBUICAO_LUCRO | INFRA | FERRAMENTA | OUTRO
  descricao   String
  valorCents  Int
  origem      String                   // AUTO_MP | AUTO_OBRIGACAO | MANUAL
  refId       String?                  // id do pagamento MP / da FiscalObligation
  createdAt   DateTime @default(now())
  @@index([competencia, tipo])
  @@unique([origem, refId])            // idempotência das entradas automáticas
}
```

### 2. Alimentação automática
- **Entradas:** job que espelha cada pagamento MP aprovado como ENTRADA/RECEITA_ASSINATURA
  (mesma fonte mapeada no S1; idempotente via @@unique).
- **Saídas fiscais:** quando uma FiscalObligation DAS/DARF_INSS vira PAGO (S2), lançar a SAIDA
  correspondente automaticamente (origem AUTO_OBRIGACAO).
- **Manuais:** CRUD de lançamento (servidor, ferramenta, pró-labore pago, distribuição de lucro).

### 3. Painel de lucro isento (na janela do S3, novo bloco)
- `lucroIsentoDisponivel(ano)` do motor S1: 32% × receita bruta acumulada − DAS pago − já
  distribuído (categoria DISTRIBUICAO_LUCRO);
- Barra de progresso "distribuído / disponível" + botão **"Registrar retirada de lucro"**
  (lançamento manual guiado) — com aviso quando a retirada do mês passar de R$ 50.000 p/ o mesmo
  CPF (retenção da Lei 15.270/2025, problema-bom futuro);
- Nota educativa fixa: *"acima do limite de presunção exige balanço assinado por contador (CRC)"*.

### 4. Export + UI
- Bloco "Livro Caixa" na janela: tabela mensal (data, histórico, entrada, saída, saldo),
  filtros por competência/categoria, saldo acumulado;
- Export CSV da competência e do ano (formato aceito por contador: data;histórico;entrada;saída;saldo)
  — streaming como o export do :3107 (padrão já provado na casa);
- Fechamento anual: botão "fechar Livro Caixa {ano}" → congela lançamentos do ano (edição só com
  motivo, trilha em log).

## Aceite
- Mês corrente do Livro Caixa batendo com a janela-pagamentos/extrato MP (conferência manual).
- Re-rodar o job de espelhamento não duplica nada.
- Export CSV abre no Excel com acentuação correta (BOM UTF-8).
- tsc + testes verdes (idempotência, lucro isento com os números do golden test 7 do S1).

## Guardrails
- Lançamento automático NUNCA é editável direto — corrigir via lançamento de estorno (trilha limpa).
- Frente financeira: revisão de diff obrigatória.
