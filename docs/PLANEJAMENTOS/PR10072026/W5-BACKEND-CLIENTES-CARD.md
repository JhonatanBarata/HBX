# W5 — Backend: card de clientes do /entrega (pendências, duplicidade, débito, delete admin)

Frente do card de clientes (pedido do dono 10/07, sessão 2 — paralela a W1–W4). Leia `CONTRATOS.md` antes.
**Só tocar em `backend/src/nucleo/*`** (controller, service, DTOs). **PROIBIDO editar `backend/src/logistica/*`,
`backend/src/modules/*`, `backend/prisma/schema.prisma`** — W1/W2 estão editando esses arquivos AGORA em paralelo.
Zero migration (todos os dados existem). Ler LogisticaConfig/FinanceiroCharge/Entrega/ClienteProduto via Prisma direto.

## 1. GET `/nucleo/clientes` — campos novos por item (aditivos, contrato com W6)

- `pendencias: Array<'endereco'|'numero'|'gps'|'dia'|'whatsapp'>` — nesta ordem fixa. Regras:
  `endereco` = sem `endereco` (trim vazio); `numero` = sem `numero`; `gps` = `lat` ou `lng` null;
  `dia` = NENHUM vínculo `ClienteProduto` ativo do cliente com `diasSemana` preenchido OU `frequenciaDias > 0`
  (cliente sem nenhum vínculo → pendente); `whatsapp` = sem `phoneNormalized`.
- `diasEntrega: number[]` — união ISO (1=seg…7=dom) dos `diasSemana` dos vínculos ativos do cliente (CSV → int[]).
- `duplicataDe: { id: string; nome: string } | null` — detecção company-wide (não por página, se houver paginação):
  dois clientes ativos (`status='active'`, `isCliente=true`) são par se **nome normalizado idêntico** (lower, sem
  acento, espaços colapsados, ignorar vazios) OU **endereco+numero normalizados idênticos** (ambos não-vazios).
  Marcar OS DOIS lados do par (cada um aponta o outro). Sem fuzzy — só igualdade exata pós-normalização.
- `debitoAtual: number` — SÓ quando `LogisticaConfig.moduloFinanceiroAtivo` do tenant (senão omitir o campo):
  espelho exato da regra canônica `saldoAbertoPorClientes` (`backend/src/logistica/logistica.service.ts:1251` — LER
  para copiar a regra, NÃO editar): Σ `FinanceiroCharge` `status='pending'` com `sourceModule` in
  (`logistica_entrega`,`logistica_fechamento`) por `customerProfileId` + Σ `Entrega.valor` com `status='entregue'` e
  `cobrancaStatus='aguardando_fechamento'`. 2 groupBy por request, company-scoped. Comentar no código que a fonte
  canônica é `saldoAbertoPorClientes` (duplicação consciente p/ não colidir com W2 hoje).
- `entregasCount: number` — groupBy count de `Entrega` não-cancelada por `customerProfileId` (company-scoped).
- Performance: escala single-driver (centenas de clientes) — groupBy/fetch em memória OK; não fazer N+1.

## 2. DELETE `/nucleo/contas/:id` — admin + bloqueio por dívida

- Adicionar `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Admin()` (mesmo padrão do `mergeConta` logo acima no
  controller). Ninguém no frontend chama esse endpoint hoje (verificado) — sem fallout.
- Antes do soft-delete: calcular `debitoAtual` do cliente (mesma regra do item 1, SEMPRE — mesmo com
  `moduloFinanceiroAtivo=false`; dívida existente bloqueia igual). Se > 0 → **409** com body
  `{ error: 'CLIENTE_COM_DEBITO', saldo: number }`. Zero → segue o soft-delete existente (DeletionRecord).

## 3. `mergeContas` — verificar/estender o re-aponte

- LER `mergeContas` em `nucleo-cadastro.service.ts` e conferir se ele re-aponta para a conta destino:
  `Entrega`, `FinanceiroCharge`, `ClienteProduto`, `DebtCase`, `Contato`. O que faltar, ESTENDER (na transação),
  com cuidado nos uniques: `[companyId, phoneNormalized]` (se as duas têm phone, manter o da destino) e o unique de
  `ClienteProduto` (vínculo duplicado do mesmo produto → manter o da destino, somar nada, só descartar o da origem;
  `FinanceiroCharge` unique parcial por `entregaId` já viaja junto com a entrega). Charges/entregas NUNCA podem
  ficar órfãos num merge.

## Regras duras
- NUNCA criar branch; editar direto na working tree (master). **NÃO commitar** — o orquestrador commita.
- NÃO tocar em `Webwhats/`.
- Respostas aditivas — não remover/renomear campo existente do ClienteListItem.

## Checks obrigatórios
- `cd backend && npx tsc --noEmit` — W1/W2 editam outros arquivos em paralelo: erro FORA de `nucleo/*` = ignorar e
  anotar; `nucleo/*` tem que compilar limpo.
- Se existir `nucleo*.test.ts`, rodar por caminho. Adicionar teste unitário da detecção de duplicidade
  (normalização) e do 409 por dívida se o padrão de teste do módulo permitir sem subir banco.
- Retornar JSON: `{status, filesTouched[], checks, pendencias[], notas[]}`.
