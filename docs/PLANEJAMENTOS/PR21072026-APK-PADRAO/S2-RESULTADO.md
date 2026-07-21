# S2-RESULTADO — Teclado nunca cobre nada + Enter avança/confirma

**Status: FEITO e JÁ PUBLICADO.** O worker do S2 foi interrompido no meio (limite de sessão),
mas o código que ele já tinha escrito estava no tree e foi varrido pelo publish do dono
(`24a38140 chore: publish 20260721_165537`). A auditoria no aparelho foi terminada
manualmente depois, com o APK rebuildado do tree atual.

## O que mudou no código (dentro de `24a38140`)

1. **`app.css` — regra sticky do CTA generalizada.** Antes só 3 ids (`#new-oneoff-form`,
   `#leitura-novo-form`, `#edit-product-form`) mantinham o botão final visível com o teclado
   aberto. Agora a regra vale para qualquer form dentro de `.modal`, `.sheet` ou
   `.center-modal-body`, além da régua `.client-primary-actions` (que ganhou fundo próprio,
   porque é um grid com vão entre os botões e o conteúdo rolava por trás).
   `.company-name-form` ficou de fora **de propósito** — campo e botão já vivem lado a lado
   na mesma linha, sticky ali afastaria o botão do campo.
2. **`app.js`** — `data-enter-submit` no textarea de observação do `new-delivery-form`, para
   o Enter no último campo confirmar em vez de só quebrar linha.

## Auditoria no moto g15 (APK rebuildado do tree, instalado 17:14)

| Form | Enter avança | Enter confirma no fim | CTA visível c/ teclado | Como |
|---|---|---|---|---|
| `new-product` | ✓ Nome→Unidade→Preço→Estoque | ✓ **cadastrou** o produto | ✓ "Cadastrar" | tela |
| `edit-product` | ✓ Nome→Unidade | — (não salvei) | ✓ "Salvar" | tela |
| `new-client` | ✓ Nome→Telefone→CPF→CEP | ✓ (worker confirmou) | ✓ pós-fix | tela |
| `new-oneoff` / `leitura-novo` | — | — | ✓ (regra antiga preservada) | código |
| `client-details`, `client-product`, `new-delivery`, `leitura-nome`, `arrival-radius` | — | — | ✓ cobertos pelo seletor genérico | código |
| `company-name` | n/a (1 campo) | ✓ submete | n/a (botão ao lado) | código |

**Provas visuais colhidas:** `new-product` com teclado aberto mostrando os 3 campos
preenchidos + Estoque focado + botão "Cadastrar" inteiro acima do teclado; a tecla do
teclado vira **→|** (next) nos campos do meio e **→** (done) no último; produto
"S2AUDIT · Cx · R$ 9,00" criado só apertando Enter no último campo.

**Não auditado na tela:** os 5 forms da 3ª linha e os popups de busca da Leitura — a regra
CSS que os cobre é a mesma provada nos outros três, e abrir a Leitura criaria sessão de
leitura no servidor. Ficam para a passada do S6 (o E2E percorre todos eles de verdade).

## Limpeza feita (conta mock, autorizada pelo dono)

- Produtos de teste `S2AUDIT` e `S2TESTE` → arquivados pelo gesto de segurar (o hold em
  Produtos abre "Arquivar produto?", não exclusão — comportamento correto e reversível).
- Cliente `S2TESTE` (deixado pelo worker interrompido) → excluído segurando pressionado.
- Resíduos antigos de outras sessões (`Teste`, `Teste Origem` ×2, listados na memória como
  "pro dono apagar") → excluídos. Base voltou a **210 clientes / 5 produtos**, sem lixo.

## Achados fora de escopo (ANOTADOS, não consertados)

1. **Busca de clientes mostra resultado velho durante o debounce.** Digitando `S2TESTE` a
   lista continuou exibindo "50 de 58" com nomes que não casavam (resultado da consulta
   anterior), sem nenhum sinal de "carregando". Com termo que casa (`Adriana` → 4) e sem
   match (`TESTE` após limpeza → "Nenhum cliente / Nenhum resultado") o comportamento final
   é correto — o problema é só o estado intermediário mentir. Candidato a skeleton/spinner
   na lista enquanto a busca não volta (encaixa no S4, estados padrão).
2. Confirmado ao vivo que a **decisão de pendência do S1 está no ar**: `Tel` e `Dup` viraram
   chips cinza e não pintam mais o card; `End` e `Dia` seguem vermelhos pintando card e
   avatar. A aba Clientes deixou de parecer tela de erro.
