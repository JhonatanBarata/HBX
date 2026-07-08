# F2 — RESULTADO (08/07, worker Sonnet — frente financeira, aguarda revisão de diff do Opus)

## O que entrou
1. **Botão "＋ Adicionar produto" na folha de chegada** (`ArrivalSheet.tsx`): abaixo dos
   steppers dos itens previstos. Toque → picker compacto com o catálogo da empresa
   (`listProdutos()`, já existente em `clientes-api.ts`), filtrado para excluir produtos
   já presentes na lista (previstos OU já adicionados). Escolheu → vira uma nova linha de
   stepper (qtd inicial 1, tag "novo"). Catálogo carregado 1× quando a folha abre
   (best-effort: falha só esconde o botão, o resto da folha funciona normal).
2. **Trocar = adicionar + zerar**: linhas "novas" ganham um botão × que zera a
   quantidade (equivalente a levar o stepper a 0 manualmente) — sem remoção da lista,
   mesmo comportamento que um item previsto zerado.
3. **Valor ao vivo (QR Pix) atualizado**: `valorAtual` agora soma as linhas novas
   (`qtd × precoCatalogo`, preview) junto com os itens previstos. Tratamento extra
   para entregas **legadas** (agendadas avulsas, sem `EntregaItem` real antes desta
   chegada): a soma dos itens novos **SOMA** ao valor escalar previsto em vez de
   substituí-lo — mesma regra usada no backend (ver §2 abaixo), senão o QR pediria só
   o produto novo e "esqueceria" o valor que já existia.
4. **Backend** (`ConfirmarEntregaDto.novosItens` → `LogisticaController.confirmar` →
   `LogisticaService.confirmarEntrega`): dentro da MESMA transação guardada do Passo 1
   (após o `updateMany` dos itens existentes), para cada `novoItem`:
   - resolve `Product` **company-scoped** (`{ id: productId, companyId }` — produto de
     outro tenant/inexistente é **ignorado**, log de warn, sem quebrar o confirmar);
   - preço = `priceCents/100` OU `price` do **catálogo** — o MESMO que o front usa no QR
     Pix do ato, pra a cobrança registrada ser IDÊNTICA ao que o cliente paga no QR.
     (Revisão do Opus 08/07: a versão inicial do worker deixava o `precoAcordado` do
     `ClienteProduto` vencer o catálogo, mas o front não conhece o negociado → o QR
     mostraria um valor ≠ da cobrança. O negociado vale p/ o item PLANEJADO/recorrente,
     que já vem com seu `valorUnit` gravado; add avulso na chegada = preço de tabela.);
   - cria `EntregaItem { entregaId, productId, qtdPrevista: qtd, qtdEntregue: qtd,
     valorUnit: <preço do servidor> }`.
   - A recomputação de valor do F1 (`Σ qtdEntregue×valorUnit`) passou a rodar também
     quando só há itens **novos** (antes só disparava com `itens` no payload). Fórmula
     ajustada: se a entrega **já tinha** `EntregaItem` real antes desta chamada, a soma
     dos itens **substitui** o valor (comportamento F1 clássico, intacto); se **não
     tinha** (legada — ex.: agendada avulsa ganhando seu 1º item agora), a soma **SOMA**
     ao valor escalar que já existia (aditivo — não apaga o que já valia).

## REGRA DE OURO — preço sempre do servidor
- O DTO `ConfirmarNovoItemDto` só aceita `productId` + `qtdEntregue` — **não existe
  campo de preço na classe**. Com `ValidationPipe` global (`whitelist +
  forbidNonWhitelisted`), qualquer preço que o cliente tentasse mandar seria **rejeitado
  na porta** (400), nem chega a ser lido pelo serviço.
- O serviço nunca lê preço do `gps.novosItens` — só `productId`/`qtdEntregue`. O
  `valorUnit` gravado no `EntregaItem` vem SEMPRE de `tx.product.findFirst` (catálogo,
  company-scoped).
- Provado por teste: `entregaItemCreates[0].valorUnit` bate com o catálogo do MOCK do
  "banco" (ignora o `precoAcordado` presente), nunca com o payload do confirmar.

## Idempotência
- Os `EntregaItem` novos nascem **dentro** da transação guardada da 1ª confirmação. O
  bloco de criação (e o de recálculo de valor) são gateados por `!jaEntregue` — mesmo
  padrão já usado pelo recálculo de valor do F1.
- Na prática, o reenvio da fila offline (M8) sempre carrega a **mesma** `idempotencyKey`
  — o replay é decidido **antes** da transação (`entrega.idempotencyKey === key` no topo
  do método) e retorna sem executar nada de novo: a transação inteira (incluindo o
  `entregaItem.create`) não roda uma 2ª vez. Provado por teste: confirmar 2× com a
  mesma key → `entregaItemCreates.length` continua 1, `chargesCreated.length` continua 1,
  `replayed: true` no 2º retorno.

## Testes novos (`logistica.service.test.ts`)
`buildPrismaMock` estendido com `opts.products`/`opts.clienteProdutos` (catálogo
injetável) + `entregaItem.create`/`count` (refletem no mesmo "banco" que `findMany` lê,
igual ao Prisma real dentro de uma tx interativa — read-your-writes).
1. `F2: novoItem cria EntregaItem com o preço do CATÁLOGO (servidor) e o charge soma
   existente+novo` — existente 2×R$10 + novo 1×R$15 (catálogo) = charge R$35.
2. `F2: add avulso usa o preço de CATÁLOGO (não o precoAcordado); entrega legada (sem
   item antes) SOMA ao valor escalar` — catálogo R$15 (ignora precoAcordado R$9);
   legado R$20 + novo
   2×R$9 = charge R$38 (prova a fórmula aditiva, não a substitutiva).
3. `F2: novoItem de produto de OUTRA empresa é ignorado (company-scoped)` — 0 itens
   criados, valor legado intocado.
4. `F2 idempotência: reenvio com a MESMA idempotencyKey NÃO duplica o item novo
   (replay)` — 2ª chamada com a mesma key: `entregaItemCreates`/`chargesCreated`
   continuam em 1, `replayed: true`.

## Checks
- `cd backend && npm run build` — limpo.
- `node --test dist/logistica/logistica.service.test.js dist/logistica/logistica-rota.service.test.js
  dist/logistica/logistica-config.service.test.js dist/logistica/logistica-recorrencia.service.test.js
  dist/logistica/logistica-recovery.service.test.js` — **59/59** (era 55; +4 novos do F2,
  zero regressão). Por arquivo: service 31 (era 27), rota 6, config 6, recorrencia 12,
  recovery 4.
- `cd frontend && npx tsc --noEmit` — limpo (0 saída).
- `node scripts/check-pele.mjs` (rodado de `frontend/`, é onde o script vive — não
  existe `scripts/` na raiz) — catraca **504/495 estourada**, mas 100% de arquivos do
  dono (`janela-empresas.tsx` +90, `gerencial/page.client.tsx` +55, `relatorios` +42,
  `vendas` +31, `agenda` +24, `company-email-section.tsx` +24, `novo-acesso-modal.tsx`
  +24, `janela-emails.tsx` +20 — nenhum deles tocado por mim). Confirmado por diff:
  `ArrivalSheet.tsx` tem zero `style=`; o diff de `page.client.tsx` não adiciona
  nenhuma linha com `style=` (as 3 ocorrências pré-existentes no arquivo — barra de
  progresso e swipe — não são minhas e nem contam pra catraca, já que `width`/
  `transform` não são propriedades "visuais" pela regex do script).
- Verificação em browser (localhost, `npm run dev:preview` isolado em porta autoPort):
  bloqueada por CORS pré-existente do backend (só libera a origem fixa `:3001` do dono,
  não a porta dinâmica do preview isolado) — **não é sintoma do meu diff**; não mexi em
  CORS do backend por estar fora de escopo e ser área sensível (endurecida recentemente
  por segurança). Servidor de preview parado ao final, nada deixado no ar.

## Arquivos
Backend: `logistica/dto/logistica.dto.ts` (`ConfirmarNovoItemDto` + campo `novosItens`),
`logistica/logistica.controller.ts` (repassa `novosItens`), `logistica/logistica.service.ts`
(`ConfirmarGps.novosItens` + bloco de criação + fórmula de recálculo aditiva/substitutiva),
`logistica/logistica.service.test.ts` (mock estendido + 4 testes F2).
Frontend: `entrega/ArrivalSheet.tsx` (picker, tag "novo", botão ×, `valorAtual` aditivo),
`entrega/entrega-api.ts` (`ConfirmarPayload.novosItens`), `entrega/entrega-offline.ts`
(`PendenciaPayload.novosItens`, aditivo), `entrega/page.client.tsx` (`onEntregue` repassa
`novosItens` pro `enqueueConfirmacao`), `hbx-theme/entrega.css` (+~100 linhas:
`ent-item-tag`, `ent-item-row`, `ent-item-remove`, `ent-btn--add`, `ent-picker*`).

## Pendências / limitações conhecidas
- "Trocar" (adicionar + zerar o antigo) é limpo em entregas multi-produto (M2/M4, com
  `EntregaItem` real). Em entregas **legadas** avulsas (sem `EntregaItem`, só escalar
  `Entrega.quantidade`/`valor`), zerar a linha sintética única não tem efeito no
  servidor (o `id` sintético não bate com nenhum `EntregaItem` real) — limitação
  **pré-existente** ao F2 (o stepper legado já podia ser zerado sem efeito desde o F1);
  o F2 só garante que ADICIONAR nesse caso soma corretamente ao valor legado.
- Não criei migration nem toquei `schema.prisma` — F2 só usa modelos/colunas que já
  existiam (`Product`, `ClienteProduto.precoAcordado`, `EntregaItem`).
