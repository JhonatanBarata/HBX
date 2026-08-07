# REFERÊNCIA — as duas telas de demonstração que saíram da casca (07/08/2026)

O dono mandou remover TODAS as explicações do app (item 6). Na varredura sobraram duas
telas que **eram explicação inteira**, não linha de explicação dentro de tela de trabalho:

| Tela | Chave | O que era |
|---|---|---|
| Gestos: segurar e arrastar | `T.gestos` | maquete que ENSINAVA os dois gestos, com 4 paradas de mentira pra treinar o dedo |
| Padrões de movimento | `T.padroes` | catálogo das 7 leis de animação + tabela de superfícies com o tempo de cada uma |

Decisão do dono em 07/08: **"somem as duas"**. São telas de demonstração interna — o
motorista nunca precisou delas.

⚠️ **O que SAIU foi a tela, não o comportamento.** Os dois gestos continuam vivos, e agora
na lista de paradas de verdade (é lá que o punho está desenhado): `ligarGestos()` segue no
mock, ligado por `[data-gestos]` nas listas de rota. O catálogo de movimento abaixo continua
sendo o que a folha faz — o que morreu foi a tela que o RECITAVA.

Este arquivo é só registro. Não é carregado por nada.

---

## 1. Gestos: segurar e arrastar (`T.gestos`)

Texto que a tela mostrava:

> **Dois gestos, duas zonas**
>
> **Segurar 1 segundo** no cartão = excluir. O vermelho enche pra avisar que está armando,
> e o aparelho vibra quando arma.
> **Pegar no punho** (os 6 pontinhos) = arrastar pra reordenar, na hora, sem espera. Dedo no
> punho **nunca** arma o excluir.
>
> *experimente aqui — funciona com o dedo e com o mouse*
>
> (4 paradas de maquete: João da Silva, Mercadinho Bom Preço, Maria Aparecida, Padaria Pão Nosso)
>
> ⚠ No app não existe **lixeira** nem botão de excluir na lista: o gesto É a porta.

Números do gesto, que continuam cravados no código (`ligarGestos`):

| | valor | por quê |
|---|---|---|
| tempo pra armar o excluir | `950 ms` | os mesmos do app antigo |
| tolerância de tremor | `12 px` | passou disso, desarma — dedo que anda não é dedo que segura |
| vibração ao armar | `45 ms` | avisa antes de abrir a confirmação |
| troca de posição no arrasto | `60%` da altura do vizinho | antes disso é tremor, não intenção |

Regra dura que sobrevive à tela: **a zona do punho NUNCA arma o excluir**. No app antigo isso
já custou cartão apagado por engano.

## 2. Padrões de movimento (`T.padroes`)

### As 7 leis

1. Nada aparece: o que nasce entra, o que morre sai.
2. Quem entra desacelera; quem sai acelera.
3. Lista entra escalonada — passo de 22 ms, teto de 14.
4. A origem tem significado (aviso nasce no sino).
5. Erro entra na cara: rápido, com sacudida e cor cheia.
6. O fundo escuro entra e sai junto com a peça.
7. Menos movimento no sistema = nenhum movimento aqui.

### Superfícies

| Superfície | Onde | Tempo | Curva |
|---|---|---|---|
| Troca de tela | Rota → Clientes, aba a aba | 440 ms | entra |
| Tela cheia | Rota iniciada (GPS) — de qualquer tela | 520 ms | entra |
| Folha | Venda, fechamento, histórico | 380 ms | entra |
| Aviso | Recado, entrega, falta | 280 ms | mola |
| Erro | Falhou algo que o motorista tentou | 320 ms | mola + sacudida |
| Confirmação | Retirar da rota, cancelar | 280 ms | entra |
| Toque | Todo botão do app | 120 ms | sai |
