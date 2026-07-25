# S6 — Financeiro transparente (preview de créditos na aprovação)

Pré-requisito: `01-CONTRATO-WORKER.md`, `docs/Rules/BACKEND.md` e
`docs/Rules/PAGAMENTOS.md`. Depende de S4/S5 (a tela onde o número aparece).
LER ANTES (obrigatório): `logistica-route-billing.service.ts` INTEIRO — o
preview tem que ESPELHAR a matemática real dos blocos, não inventar outra.

## Regra de negócio (já em prod — NÃO mudar, só LER)
- Essencial = 1 crédito por bloco iniciado de 5 entregas únicas (linha ~70).
- Claim idempotente por empresa+motorista+data+bloco; canceladas NÃO inflam
  blocos (fix da linha ~328); START cobra, PLAN só reconcilia.

## Entregável backend
1. `GET /logistica/rota/custo-preview?date=...` (+ `deliveryIds` opcional) —
   **somente leitura**: computa blocos necessários da rota do dia (mesma
   função/critério de contagem do billing — EXTRAIR a matemática de blocos pra
   função pura compartilhada se ela estiver inline, pra preview e débito nunca
   divergirem), conta claims já DEBITED da chave empresa+motorista+data, e
   devolve:
```jsonc
{ "blocosTotais": 4, "blocosJaDebitados": 0, "creditosAIniciar": 4,
  "saldoAtual": 37, "saldoCobre": true }
```
   Saldo via serviço de wallet existente (ler como `logisticaRouteBilling`
   consulta saldo/débito — usar o MESMO caminho de leitura).
2. **Teste-invariante**: preview == débito efetivado. Cenário de teste: rota de
   N entregas → preview diz X → simular START (caminho de teste existente do
   billing) → total debitado == X. + caso re-iniciar (claims DEBITED) → preview
   0. + canceladas não contam.
3. NENHUMA escrita: teste afirma zero mutação (mesmo padrão do invariante S3).

## Entregável APK (`app.js`)
1. Tela de aprovação (S4/S5), papel ADMIN/USERMASTER: linha
   `Iniciar vai debitar 4 créditos · saldo 37` (tokens existentes; sem R$).
2. **Entregador não-admin (decisão do dono): só vê aviso quando o saldo NÃO
   cobre** — "Créditos insuficientes para iniciar — avise o administrador."
   Sem número de saldo, sem custo. Papel via `isAdmin()` existente.
3. `saldoCobre:false` na CONFERÊNCIA (véspera) já acende o aviso — não esperar
   o Iniciar falhar às 6h30. O aviso de crédito por papel já existe no app
   (frente APP-SOUNDS) — investigar e REUSAR o componente/padrão.
4. Preview indisponível (endpoint erro) → NÃO travar nada: aprovação segue sem
   a linha (best-effort, degrada mudo aqui é aceitável porque o débito real
   continua protegido pelos claims).

## Aceite
- `npm run build` + novo script `test:rota-custo-preview` verde (padrão test:*).
- Grep-prova no relatório: nenhum `wallet.debit`/`prepareRoute` novo em caminho
  de preview/conferência.
