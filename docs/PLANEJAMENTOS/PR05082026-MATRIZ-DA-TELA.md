# PR05082026 — A MATRIZ DA TELA (a caderneta vira o espelho de tudo)

**Pedido do dono (05/08, literal):** "a tela de caderneta tem q ser espelho em todas telas,
com o q for devido. (…) a matriz: PRESSIONAR PRA EXCLUIR, pressionar o da esquerda pra
arrastar… PREÇOS, pagou, pix, marcou, cartão, mesma coisa. (…) me ajuda criar um padrão,
para não acontecer de novo isso? por exemplo o excluir, isso tinha q vir junto."

**Status:** 🟢 GO do dono 05/08 (mock a mock). Padrão cravado na seção 2b. M0 em execução.

---

## 1. A doença, medida neste chat (não é opinião)

| Sintoma | Prova |
|---|---|
| O mesmo gesto reescrito à mão | **50 ocorrências de `is-hold-arming`, 9 máquinas de hold** no app.js. Adicionar o 9º (caderneta) exigiu editar 5 pontos (touchstart/move/end/cancel/contextmenu) |
| O excluir NÃO veio junto | A caderneta nasceu sem o segurar-pra-apagar; o dono cobrou ("mantem pressionado e não deleta") |
| Dinheiro reconstruído por tela | O "Deve" da chegada foi refeito na caderneta; o preço editável existia na chegada e a caderneta nasceu só-leitura |
| Palavra de dinheiro espalhada | fiado→Marcar varreu **11 arquivos** (APK + 9 telas web + tutorial) |
| Filtro-chip reinventado | `min-width: 62px` do chip estourou a tela **3 vezes** (Rota rápida 2×, Clientes, caderneta) — mesma armadilha, 3 consertos |
| Rótulo preso no reconciliador | Botão com ícone+texto não troca o texto (caso Finalizar/Reabrir) — regra conhecida, redescoberta na dor |

**A lição que a própria casa já pagou:** as 5 Leis do Design System + `check-pele` mataram a
cor solta. Mas as Leis cobrem a PELE (cor/borda/fonte). Não existe lei nem fiscal pro
COMPORTAMENTO (gesto/dinheiro/filtro/linha) — e "lei sem fiscal é decoração"
(provado: fiscal vermelho 16/07→04/08 sem ninguém ver).

## 2. A ideia — UMA MATRIZ, cada tela só escolhe as colunas

A caderneta de hoje é a matriz porque é a tela mais recente e mais brigada — cada peça dela
foi cravada pelo dono em cima de erro real. O que ela ensina vira LEI DE LINHA:

```
┌─────────────────────────────────────────────────┐
│ [Nº]  Título                                    │  ← nº = alça de arrastar (quando a ordem é do usuário)
│  ↑    Marcado: R$ X          (só quem tem)      │
│ alça  1× Produto - Un R$ Y = Total: R$ Z        │
│       Ficou Pendente | Pix | Dinheiro | Cartão  │  ← desfecho NA linha, nunca selo separado
└─────────────────────────────────────────────────┘
   segurar o CORPO = excluir (950ms, confirmação)
   tocar = abrir/editar (nunca duplicar)
```

**Regra de ouro: a tela não escreve gesto, ela DECLARA dados.** Uma tela nova diz
"minhas linhas são estas, o segurar apaga isto, a alça reordena (ou não)" — e a matriz
entrega o resto pronto: hold com vermelho progressivo, guard de clique fantasma,
confirmação, arraste com transform, filtros de largura certa, vocabulário do dinheiro.
É por isso que "o excluir vem junto": **não dá pra desenhar uma linha apagável sem
ganhar o gesto de graça.**

## 2b. O PADRÃO CRAVADO (GO 05/08, mock a mock — palavras do dono são literais)

### Lei 8 — TELEGRAMA (a densidade que faltava nas 7 Leis)

1. **Coisa antes de conta.** `Galão 20 Litros 4×11,00 = R$44,00` — nome puxa, número fecha.
2. **`R$` uma vez, no ÚLTIMO valor** (correção literal do dono: "só movimento o R$ para o
   último valor"). Unitário sem R$.
3. **Rótulo que se deduz, morre**: Un, Total:, Ficou, dois-pontos depois de palavra.
4. **1 item = conta cheia** (`Nome 1×11,00 = R$11,00`) · **2+ itens = só quantidades**
   (`Nome 6× · Nome2 2× = R$82,00`) · sem financeiro/preço = `Nome 2×`.
5. **Um desfecho = uma palavra**, na ponta direita da 1ª linha: Dinheiro · Pix · Cartão ·
   **Marcou** (era "Ficou Pendente" — morto pelo dono). Botão manda no infinitivo (Marcar),
   linha conta no passado (Marcou).
6. Nome trunca com `…`; a conta nunca quebra. Números com `tabular-nums` (já é token).

### O bloco do dinheiro na linha (correções 05/08, à tarde)

```
[2] Maik · Casa                     Marcou
    Anterior R$27,00                ← o que já devia ANTES de hoje (só se > 0)
    Galão 20 Litros 1×11,00 = R$11,00
    Total Marcado R$38,00           ← Anterior+Agora; SÓ quando marcou hoje E havia Anterior
```
- Pagou hoje (Pix/Dinheiro/Cartão) mas tem pendência antiga → aparece SÓ `Anterior R$X`.
- Cliente ainda não atendido com pendência → SÓ `Anterior R$X`.
- **"Sem repetir informações"** (dono): valor que não soma nada não aparece.
- Tela Clientes (sem "hoje"): o saldo do cliente chama **`Total Marcado R$X`**, só pra quem tem.
- Vocabulário final: **Anterior** (antes de hoje) · **Total Marcado** (consolidado) ·
  **Marcado** (linha do fechamento = o que marcou NO dia) · **Marcou/Pagou** (desfechos).

### Decisões fechadas mock a mock

- **Chips da caderneta**: `Todos / Pagou / Marcou` (chaves internas todos/pago/pendente ficam).
- **Fechamento**: grade 2×2 (Dinheiro·Cartão / Pix·Marcado) + Total na barra; R$ só no Total.
- **Alça = o NÚMERO, em toda tela de ordem do usuário.** SEM ícone de pontinhos (dono: "se
  fizer, tem q ser em todos" — então não faz; o número já é a alça cravada da opção A).
  Segurar o corpo = excluir, IGUAL em todas.
- **Conferência lista SÓ problema** (dono: "o q está ok não aparece — não me vá fazer cagada,
  demorou pra ficar bom"). O comportamento atual é LEI; a matriz não encosta nisso.
- **Rotas salvas TEM a caderneta** ("Caderneta de <dia>") — a linha() precisa vesti-la também.
- **Telas web (balcão/logística/clientes) são ESPELHO do celular**: mesmas informações e
  MESMOS acessos de edição; o desenho pode diferir, o dado e o poder de editar NÃO.
- Folha da venda: conta vira `Anterior / Venda / Total Marcado` (mesma língua da linha).
- Rota do dia (M3): o selo "Entregue" morre — vira a palavra do desfecho (Pix/Marcou/…).

### As 7 Leis da Matriz

1. **LINHA ÚNICA** — todo card de lista é `linha()`: nº/check à esquerda, título,
   sub-linhas (Marcado / produto-Un-Total / desfecho / obs), nada fora disso.
2. **SEGURAR = EXCLUIR, SEMPRE** — linha que pode morrer declara `apagar:`; a matriz arma
   o hold. Tela sem `apagar:` não tem hold nenhum (nada de gesto que não faz nada).
3. **ALÇA = ORDEM DO USUÁRIO** — o nº arrasta SÓ onde a ordem é dele (caderneta, montagem
   manual). Clientes ordena por nome/servidor → SEM alça (gesto que mente é pior que
   nenhum). Zona de exclusão: dedo na alça nunca arma o excluir.
4. **DINHEIRO É UM BLOCO SÓ** — os 4 botões (Dinheiro/Pix/Cartão/**Marcar**), a linha
   "Marcado: R$ X" (sempre o valor ANTERIOR, nunca somando o de hoje) e o formato
   "1× Produto - Un R$ Y = Total: R$ Z" saem de UMA função. Chegada, caderneta, balcão:
   a mesma.
5. **VOCABULÁRIO CRAVADO** — Marcar/Marcado/Pendente/Pago. As palavras fiado/deve/devendo
   são PROIBIDAS em tela (dado do banco `receiptMethod:'fiado'` não muda — é contrato).
6. **RÓTULO EM `<span>`** — todo botão com ícone+texto embrulha o texto (é o que o
   reconciliador consegue trocar). Sem span = rótulo que congela.
7. **FILTRO É `chips()`** — linha de chips de colunas iguais (`minmax(0,1fr)`), contagem
   dentro, multi ou única seleção por parâmetro. Ninguém mais escreve grade de chip.

## 3. As peças (onde mora)

**APK** — `EntregaShell/app/src/logistica/assets/app/matriz.js` (novo, carregado antes do
app.js) exporta em `window.HBXMatriz`:
- `linha(dados)` → HTML da linha canônica (título, dinheiro, desfecho, obs, alça?, apagar?)
- `gestos(config)` → UM registro de touchstart/move/end/cancel por `data-matriz-*`
  (mata as 9 máquinas aos poucos — cada tela migrada apaga a sua cópia)
- `dinheiro` → `{ rotulos, botoes(handlers), marcado(valor), linhaItem(qtd,nome,un) }`
- `chips(lista, ativo, action)` → a linha de filtros/dias
- CSS junto: bloco `/* MATRIZ */` no app.css — `.mtz-linha`, `.mtz-chips`, `.mtz-pagto`

**Web** — `frontend/src/components/hbx/matriz/` com `<Linha>`, `<Chips>`, `<Dinheiro>`
espelhando as mesmas leis (React não importa o js do APK; a paridade é do FISCAL, não da fé).

**Fiscal** — `frontend/scripts/check-matriz.mjs`, rodando JUNTO do check-pele:
- 🔴 palavra banida em string de tela: `Fiado|fiado |[Dd]evendo|Deve:|[Dd]evedor` (APK+web)
- 🔴 hold artesanal: `is-hold-arming` fora do matriz.js → catraca (hoje ~50, só desce)
- 🔴 rótulo sem span: botão com `icon(` + texto solto no template da matriz
- 🔴 vocabulário divergente: compara o mapa `rotulos` do matriz.js com o do web — se um
  mudar sem o outro, VERMELHO. (É assim que "varra o sistema" nunca mais acontece: muda-se
  UMA linha e o fiscal aponta o resto.)

## 4. Fases — por CENA, cada uma com prova na tela

**M0 — A matriz nasce da caderneta (sem mudar NADA visível).**
Extrair linha/gestos/dinheiro/chips da caderneta pro matriz.js; a caderneta passa a
consumir. Prova: tela IDÊNTICA no g15 (screenshot antes/depois), segurar apaga, alça
arrasta, filtros filtram. Catraca do fiscal ligada com os números de hoje.

**M1 — Clientes vira espelho.** A lista de clientes usa `linha()`: nome, endereço,
**Marcado: R$ X** (mesmo número da caderneta), dia de entrega. Segurar = excluir (migra o
clientHold pra matriz e apaga a cópia). SEM alça (Lei 3). Os chips de dia viram `chips()`.
Prova: cena do dono — abrir Clientes e ver a MESMA linguagem da caderneta.

**M2 — O dinheiro é um só.** A folha de chegada (rota) e a folha da venda (caderneta)
montam os botões e a conta pela MESMA `dinheiro.botoes()`/`marcado()`. O balcão web usa
`<Dinheiro>`. Prova: mudar um rótulo em UM lugar muda nas três telas; fiscal verde.

**M3 — Rota e montagem entram.** stop-card da rota e paradas da montagem viram `linha()`
(segurar = retirar da rota, já existe; alça só na ordem manual). As 9 máquinas de hold
viram 1. Prova: catraca `is-hold-arming` fora da matriz = **0**.

**M4 — O portão de tela nova.** Checklist no topo do matriz.js (5 perguntas: o que o
segurar apaga? o que a alça ordena? onde está o dinheiro? que palavras aparecem? todo
rótulo tem span?) + fiscal no publish. Daqui pra frente, tela que não responde não compila
na revisão.

Ordem defendida: M0→M1 primeiro (Clientes é onde o dono apontou a dor), M2 na sequência
(dinheiro é o que mais dói errado), M3 quando sobrar fôlego, M4 junto de M0 (fiscal
primeiro, senão M1-M3 recaem antes de nascer).

## 5. O que NÃO muda (pra não quebrar o que funciona)

- **Dado e contrato:** `receiptMethod:'fiado'`, `fiadoCents`, `limiteFiado`, `pendura` —
  banco e API ficam. Matriz é TELA.
- **As 10 Leis de UI do APK** continuam valendo — a matriz as IMPLEMENTA (Lei 1 do
  segurar, Lei 8 da copy), não as substitui.
- **Reconciliador, folhas, modais** — intocados. A matriz gera marcação que eles já sabem
  tratar.
- **Telas fora de lista** (mapa, chat, ajustes) — fora do escopo; matriz é pra LINHA.

## 6. Riscos honestos

- **matriz.js vira um segundo app.js gordo** → freio: só entra o que JÁ existe em 2+
  telas. Peça de tela única fica na tela.
- **Paridade APK×web na mão do fiscal** → é deliberado: React e JS puro não compartilham
  código sem build novo; comparar mapas por script é barato e grita no publish.
- **Migração meia-boca** (metade das telas na matriz, metade fora) → a catraca só desce;
  cada frente que tocar numa tela velha é OBRIGADA a migrá-la (mesma regra do check-pele).
