# S3 — Resultado (segurar-pra-excluir em tudo que remove + régua de confirmação)

Executado 21/07. Arquivos tocados (únicos permitidos): `EntregaShell/app/src/logistica/assets/app/app.js`
e `EntregaShell/app/src/main/assets/app/app.css`.

## Inventário completo (tarefa 1)

Varredura: grep por `delete-`/`remove`/`remover`/`arquivar`/`excluir`/`cancel`, todo `data-action`
destrutivo, os 4 endpoints `DELETE` do app (`nucleo/contas`, `logistica/cliente-produtos`,
`logistica/leitura/.../parada`, `logistica/rota-modelos`), e todo `icon("close"/"trash")` usado como
remoção.

| # | Item / tela | Gesto ANTES | Gesto AGORA | Confirma? | Veredito |
|---|---|---|---|---|---|
| 1 | Cliente (lista Clientes) | segurar | segurar (intocado) | Sim — "Excluir cliente?" | Já conforme |
| 2 | Produto (lista Produtos, admin) | segurar | segurar (intocado) | Sim — "Arquivar produto?" | Já conforme |
| 3 | Vínculo produto-cliente (lista Produtos já salvos, dentro da ficha do cliente — é o MESMO card/atributo da lista) | segurar | segurar (intocado) | Sim — "Excluir produto?" | Já conforme. "Botão −" citado no plano não existe no código |
| 4 | Parada da rota do dia (`data-route-stop`) | segurar | segurar (intocado) | Não (recorrência volta sozinha) | Já conforme — pequeno/refazível |
| 5 | Rota salva (Salvos/Minhas rotas) | segurar | segurar (intocado) | Sim — "Excluir rota salva?" | Já conforme |
| 6 | Parada do editor de rota salva (`data-rme-parada`) | segurar | segurar (intocado) | Não (rascunho local) | Já conforme |
| 7 | Produto fixado na parada do editor de rota salva (`data-rme-item`) | segurar | segurar (intocado) | Não (rascunho local) | Já conforme |
| 8 | **Produto do passo "Produto" da Leitura/rota manual** (`state.leituraItens`) | **botão X** (`icon("close")`, `data-action="leitura-item-remover"`) | **segurar o item** (`data-lrt-item-hold`) | Não (rascunho local, "+ Adicionar produto" devolve) | **CONVERTIDO** |
| 9 | **Parada do "Resumo da leitura"** (`state.leituraResumo.paradas`, já persistida via POST) | **botão texto "Remover"** (`link-btn lrt-timeline-remove`) | **segurar a linha** (`data-lrt-parada-hold`) | Sim — "Remover parada?" (já existia, agora acionada pelo hold) | **CONVERTIDO** |
| 10 | Cancelar leitura (link de página, não item de lista) | botão + `state.confirmation` | intocado | Sim | Já conforme (ação de fluxo, não item) |
| 11 | Cancelar planejamento / Encerrar rota (ícone no topo da Rota) | botão + `state.confirmation` | intocado | Sim | Já conforme (ação de fluxo) |
| 12 | "Limpar o dia" (satélite + dentro do popup de cancelar) | botão + `state.confirmation` (2 confirmações em cadeia) | intocado | Sim | Já conforme (ação de peso, doc já dava OK) |
| 13 | **Arquivar produto (dentro da ficha "Editar produto")** | botão executava o PATCH **na hora, sem confirmar** | botão abre `state.confirmation` antes de arquivar | **Sim (passou a confirmar)** — Reativar continua imediato (não é destrutivo) | **CORRIGIDO** (régua, não gesto — não é item de lista) |

Telefones/endereços extras do cliente (candidato citado no plano): **não existem no código** — cliente
tem 1 telefone e 1 endereço, não há lista para excluir item. Entrega avulsa criada errada: vira um
`data-route-stop` normal assim que confirmada — já coberta pela linha 4.

## Conversões (tarefa 2) — copiado do padrão, timing intocado

Os dois holds novos (`lrtParadaHold`, `lrtItemHold`) seguem byte a byte o padrão dos outros 7:
`is-hold-arming` no touchstart → 950ms vira `is-holding` + `H.vibrate(45)` → ação no touchend; cancela
em touchmove > 12px; touchcancel limpa. CSS reaproveita `@keyframes client-hold-fill` já existente,
só estendendo os seletores.

- **`lrtItemHold`** — touchstart ignora toque que começa dentro de um `<input>` (o campo de preço, que
  só existe com Financeiro ligado): segurar pra digitar/selecionar texto no campo é gesto nativo do
  teclado, não pode competir com o hold-pra-remover. Não há precedente disso nos outros 7 holds porque
  nenhum envolve um `<input>` de texto dentro da área do hold — decisão nova, documentada no código.
- **`lrtParadaHold`** — ao contrário do item (sem confirmação), a parada JÁ tinha uma DELETE real no
  backend (a parada foi persistida assim que a leitura/GPS/produtos foram capturados); por isso o
  hold, ao disparar, abre `state.confirmation` em vez de remover direto — mesmo padrão do
  `routeModeloHold` (hold → confirmação, não hold → ação).

**Bug pego e corrigido durante o próprio sprint** (não foi ao commit quebrado): a guarda anti-clique-
fantasma (`ignoredLrtParadaClickId`) copiada de `ignoredRouteModeloClickId`/`ignoredRmeParadaClickIndex`
usava `!== null` sem comparar QUAL id — testado ao vivo: segurar a parada A e remover, depois tocar
"Editar" na parada B (nunca segurada) ficava **mudo** (guarda travava o clique errado). Corrigido pra
comparar o id exato (`ignoredLrtParadaClickId === target.dataset.paradaId`), no padrão mais seguro que
já existe em `ignoredClientClickId`. Reproduzido o bug, corrigido, reconstruído o APK e re-testado no
aparelho antes de fechar — a versão com bug nunca foi commitada.

## Régua de confirmação (tarefa 3)

Único caso fora do lugar: **"Arquivar produto" dentro da ficha "Editar produto"** executava o PATCH
`ativo:false` direto no clique, sem NENHUMA confirmação — a mesma ação, disparada pelo hold na lista de
Produtos, sempre confirmou ("Arquivar produto? ... Você pode reativar depois."). Corrigido pra abrir a
mesma confirmação (`state.confirmation` tipo `archive-product-edit`, função nova
`performArchiveProductFromEdit` que fecha o modal + toast, espelhando o `performArchiveProduct` do
hold). "Reativar produto" continua imediato — reativar não é destrutivo.

Todo o resto já estava no lado certo: paradas/itens de rascunho (linhas 4, 6, 7, 8) sem confirmação;
exclusões reais e ações de peso (linhas 1, 2, 3, 5, 9, 10, 11, 12) com confirmação.

## Grep final de segurança (tarefa 4)

- `icon("trash"` em `app.js`: **0 ocorrências** (o path `trash` nem existe no dicionário de ícones).
- Rótulo `Excluir`/`Apagar`/`Remover` em botão de item de lista: **0 ocorrências** — as únicas
  sobras de "Excluir"/"Remover" no arquivo são `title`/`confirmLabel` dentro de `state.confirmation`
  (texto do POPUP que só aparece depois do hold, ex.: `confirmLabel: "Excluir"`), que é o padrão
  correto e esperado.

## NÃO mexido (conforme o "NÃO fazer" do plano)

- Timings (950ms / 12px / vibrate 45ms) — copiados, não alterados.
- Stepper −/+ da entrega e dos itens (Produto/Leitura, rme-item, delivery) — continuam stepper, não
  viraram hold.
- Nenhum hold novo em ação que não remove.

## Achados fora de escopo (ANOTADOS, não consertados)

1. **Dois `data-action` mortos, pré-existentes** (não introduzidos por mim, sobraram de uma conversão
   anterior a botão→hold que nunca foi ao commit): `rme-item-remover` (app.js ~3514) e
   `delete-route-modelo` (app.js ~3535, fora do handler do hold) — nenhum botão no render usa mais
   esses `data-action`, só o hold aciona a lógica equivalente inline. Candidato a limpeza do S1.
2. **CSS morto pré-existente**: `.rme-remove` (app.css ~270) — mesma classe da leva anterior, sem
   nenhum uso em `app.js`.
3. **Contador "N paradas registradas" no banner da rota manual não desconta remoção.** `state.leitura.count`
   é incrementado a cada `saveLeituraParada()` mas nunca decrementado em `performRemoveLeituraParada()`
   — testado ao vivo: removi 1 de 2 paradas no Resumo (foi pra 1 corretamente), mas o banner de fundo
   continuou dizendo "3 paradas registradas" depois de eu ter removido 2 no total. Cosmético (o Resumo,
   fonte da verdade, está correto), mas mente no meio do fluxo. Não é escopo de exclusão — é estado
   informativo, mais para o S4.

## Verificação

- `node --check app.js`: **passou** (checado 2×, antes e depois do fix do bug de guarda).
- Brace-balance do CSS (script Node dedicado): **profundidade final 0**.
- **No aparelho** (moto g15, serial `ZF5255SMWF`, 3 ciclos de build/instalação — 1 inicial, 1 depois do
  bug achado, 1 final de confirmação):
  - **Arquivar produto (ficha)**: toquei "Arquivar produto" em "Galao20l" → apareceu
    "Arquivar produto? Galao20l sai do catálogo ativo..." (screenshot) → confirmei → toast
    "Produto arquivado.", modal fechou, card veio "Arquivado" na lista. Reabri, toquei "Reativar
    produto" → **sem popup**, toast "Produto reativado." na hora. Produto voltou ativo (estado
    igual ao que encontrei).
  - **Produto do passo "Produto" (rota manual)**: adicionei 2 produtos a uma parada (Galão 20Litros +
    Galao20l), segurei o card "Galao20l" 1400ms → sumiu da lista sem popup, resumo do topo caiu pra
    "1× Galão 20Litros" (screenshot antes/depois).
  - **Parada do "Resumo da leitura"**: criei 2 paradas (Ademir, Adlen/Thaís) numa rota manual de
    teste, cheguei no Resumo → nenhuma linha tem mais botão "Remover", só "Editar" → segurei a linha
    da 2ª parada 1400ms → apareceu "Remover parada? Esta parada será removida do resumo." → confirmei
    → toast "Parada removida.", resumo caiu pra "1 parada" (screenshots de cada etapa).
  - **Bug da guarda**: reproduzido ao vivo (segurar parada A, remover; tocar Editar em B não abria
    nada), corrigido no código, rebuild, reinstalado, retestado: segurar A remove, tocar Editar em B
    abre o formulário normalmente.
  - **Limpeza**: cancelei a leitura de teste inteira (`Cancelar leitura` → confirmação → "Leitura
    cancelada.") — nenhuma rota, parada ou cliente novo ficou no banco; só usei clientes já existentes
    (Ademir, Adlen/Thaís) e reverti o produto arquivado/reativado. Base como encontrei (210
    clientes / 5 produtos).

## Commit

`fix(apk): S3 exclusao padrao unico` — `d2422347`.
