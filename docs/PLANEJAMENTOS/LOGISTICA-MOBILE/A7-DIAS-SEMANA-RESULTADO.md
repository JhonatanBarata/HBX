# A7 — Seletor de "dias da semana" no produto do cliente

Feedback do dono: tem cliente controlado por **dia da semana** (seg/qua/sex), não só
"a cada N dias". O schema (`ClienteProduto.diasSemana`) e o motor já suportavam; faltava
o SELETOR no app e a garantia de que a geração respeita o dia.

## Convenção de dias (importante)
O backend usa **ISO day-of-week: 1=segunda, 2=terça, … 7=domingo** — NÃO é `getDay()`
(que é 0=dom). Ver `isoDow()` em `logistica-recorrencia.service.ts:406`. Exemplo:
seg+qua+sex → `"1,3,5"`. A string é normalizada (dedupe + ordenada) em `normalizeDiasSemana`.
O front monta a string na MESMA convenção.

## Estado do filtro no `gerarDia` — JÁ EXISTIA e estava CORRETO (não consertei)
`dueOnDay(v, dia, dow)` (`logistica-recorrencia.service.ts:338`) já faz:
- se `diasSemana` tem itens → retorna `dias.includes(dow)` (só cria se HOJE bate na lista);
- senão, cai no `proximaData <= dia`.
`nextProximaData` avança para o próximo dia da lista (ou +N na frequência). A idempotência
por `[companyId, customerProfileId, dia]` segue intacta.

Confirmado por teste: com dia simulado = segunda (2026-07-06, ISO dow=1):
- vínculo `diasSemana:"1,3,5"` (inclui seg) → **cria**;
- vínculo `diasSemana:"2,4"` (não inclui seg) → **NÃO cria**;
- idempotência mantida (2ª passada não duplica).

Adicionei 2 testes de `gerarDia` cobrindo explicitamente "inclui → cria" e "não inclui →
não cria" (os testes anteriores cobriam só o `dueOnDay` puro). **Nenhuma mudança de código
de produção no backend.**

## UI (app `/entrega/clientes`, skin entrega)
No form "Adicionar produto" do cliente, 2 modos de recorrência (chips, sem jargão):
- **"A cada N dias"** → campo numérico (`frequenciaDias`, o que já existia);
- **"Dias da semana"** → chips **Seg Ter Qua Qui Sex Sáb Dom** (multi-seleção) → monta
  `diasSemana` na convenção ISO (ex.: seg+qua+sex → `"1,3,5"`).

O payload manda **SÓ o modo escolhido**: modo "semana" envia `diasSemana` (sem
`frequenciaDias`); modo "dias" envia `frequenciaDias` (sem `diasSemana`). Reusa
`POST /logistica/cliente-produtos`.

Rótulo da lista de produtos: novo helper `recorrenciaLabel(p)` → "Seg, Qua, Sex" quando
por dia da semana; "A cada 7 dias"/"Todo dia"/"Avulso" quando por frequência.

Reusou `.ent-chips`/`.ent-chip`/`.is-on` já existentes — **ZERO CSS novo** (check-pele limpo).

### Dashboard `contatos` (parin opcional) — NÃO feito
O drawer do dashboard já EXIBE `diasSemana` no rótulo (lê a string), mas seu form de criar
só manda `frequenciaDias`. Deixei fora para não introduzir padrão/CSS novo noutro namespace
(`cli-prod`/`hbx-drawer`); é a mesma receita se o dono quiser depois.

## Arquivos
- `frontend/src/app/entrega/clientes-api.ts` — `diasSemana` no payload + helpers
  `diasSemanaLabel` / `recorrenciaLabel`.
- `frontend/src/app/entrega/clientes/page.client.tsx` — const `DIAS_SEMANA`, estado
  `modo`/`diasSemana`, seletor de modo + chips, payload por modo, rótulo da lista.
- `backend/src/logistica/logistica-recorrencia.service.test.ts` — +2 testes de `gerarDia`
  (inclui/não-inclui o dia). **Sem mudança no service.**

## Checks
- Backend `node:test` (recorrência): **12/12 verde** (2 novos inclusos).
- Frontend `npx tsc --noEmit`: **verde**.
- Frontend `npm run build`: **verde** (Compiled successfully, `/entrega/clientes` ok).
- `check-pele`: **0 violação nos meus arquivos** (as R1 restantes são pré-existentes em
  `bot-builder.css`/`screens.css`/`whatsapp.css`, arquivos NÃO tocados aqui).
