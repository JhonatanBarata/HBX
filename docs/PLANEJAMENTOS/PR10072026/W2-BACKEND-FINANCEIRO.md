# W2 — Backend Financeiro do cliente (fase 1, dentro do módulo logística)

Leia `CONTRATOS.md` (mesma pasta) antes. Só backend, só `backend/src/logistica/*` (service, controller, DTOs). NÃO tocar em `backend/src/financeiro/` (é o financeiro da PLATAFORMA) nem em `backend/src/modules/*` (W1 está mexendo neles em paralelo — conflito proibido). Zero migration: todos os dados já existem.

## 1. GET `/logistica/clientes/:id/entregas` (contrato nº4)
- Histórico de entregas do cliente, tenant-scoped (companyId do JWT + customerProfileId), paginação por cursor (`take` default 30, máx 100), ordenado desc por `deliveredAt ?? scheduledAt` (índice `[companyId, customerProfileId, scheduledAt]` já existe).
- Incluir `EntregaItem` (join produto p/ nome) → `itens[{produtoNome, qtd (qtdEntregue ?? qtdPrevista), valorUnit}]`; entregas single-produto antigas sem itens: montar 1 item sintético de `productId/quantidade/valor`.
- Campos por item do contrato: id, scheduledAt, deliveredAt, status, valor, receiptMethod, cobrancaStatus, whatsappStatus, whatsappMotivo.
- Excluir soft-deleted se o padrão do service já filtra (seguir o padrão de `listRota`/`extratoCliente`).

## 2. POST `/logistica/charges/:id/quitar` (contrato nº5 — baixa manual do fiado)
- Só dono/ADMIN (seguir o padrão de role usado em `fecharMes`). Charge precisa ser da MESMA empresa e `sourceModule` iniciando com `logistica`. `pending` → paga com `paidAt=now` (usar o status/valor que o schema de FinanceiroCharge usa p/ "pago" — conferir enum/valores existentes, ex. o que `lancarCobranca` grava no pago-na-hora). Idempotente: já paga → 200 com estado atual. Charge de outra origem/empresa → 404 (não vazar existência).
- Registrar `notes`/campo de auditoria se existir padrão; senão, log estruturado.

## 3. GET `/logistica/financeiro/saldos` (contrato nº6)
- Reusar `saldoAbertoPorClientes`; devolver só clientes com `saldoAberto>0 || aguardandoFechamento>0`, com nome do cliente. Respeitar o gate `moduloFinanceiroAtivo` seguindo o MESMO padrão dos endpoints financeiros existentes (resumo-dia/extrato) — se eles fail-close com o toggle OFF, estes também.

## Cuidados
- `HBX_LOGISTICA_ENABLED`/`moduloFinanceiroAtivo`: espelhar exatamente o comportamento fail-closed dos endpoints vizinhos.
- Não criar prefixo `/financeiro` novo — tudo sob `/logistica/*`.
- Manter distância do prefixo de description `'Recarga de créditos —'` em qualquer texto gravado em FinanceiroCharge.

## Checks obrigatórios
- `cd backend && npx tsc --noEmit` (ou script de typecheck do package.json). ATENÇÃO: W1 edita outros arquivos em paralelo — se o typecheck acusar erro FORA de `logistica/*`, ignorar e anotar; só garantir que `logistica/*` compila.
- Testes existentes de logística (se houver `logistica*.test.ts`, rodar por caminho). Adicionar teste unitário do `quitar` (idempotência + cross-tenant 404) seguindo o padrão de testes do módulo.
- NÃO commitar. Retornar JSON: `{status, filesTouched[], endpoints[], checks, pendencias[], notas[]}`.
