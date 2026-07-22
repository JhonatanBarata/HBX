# S7 — Aviso de créditos esgotados, com o motivo certo pra cada um

**Depende de:** S1 (usa o som `warning`). Independente de S2–S5 no resto.

## O buraco de hoje

Já existe a trava, pronta e bonita: `creditsLockOverlay()` ([app.js:3640](../../EntregaShell/app/src/logistica/assets/app/app.js)) —
card com ícone de carteira, "Créditos esgotados", botão **Recarregar créditos** e
**Já recarreguei · atualizar**. Reaproveitar isso é o trabalho; não desenhar nada novo.

**O buraco está em `app.js:4110`:**

```javascript
if (isAdmin()) void refreshCreditsLock();
```

A trava **só roda pra admin**. O motorista nunca vê nada: ele abre o app, tenta gerar a rota e leva
um erro seco — ou pior, fica achando que o app quebrou e liga pro dono no meio da manhã. O aviso
existe e está escondido justamente de quem está na rua.

## O que muda

Um overlay, **dois textos**, escolhidos por `isAdmin()` (`app.js:331`):

| | Admin | Motorista |
|---|---|---|
| Título | Créditos esgotados | Rota indisponível hoje |
| Corpo | Sem créditos a rota do dia não pode ser gerada. Recarregue para continuar usando o aplicativo. | Fale com o Financeiro para liberar as rotas. |
| Botão 1 | **Recarregar créditos** (`open-recarga`) | — |
| Botão 2 | Já recarreguei · atualizar | **Atualizar** |

**Por que o motorista não vê a palavra "créditos" nem valor nenhum:** ele não pode resolver e não
deve ver dinheiro da empresa (mesma linha da LEI DO VENDEDOR — só Admin vê valores). Dizer
"acabaram os créditos" pra quem não pode recarregar só gera ligação pro dono. "Fale com o
Financeiro" é a única ação que ele **pode** executar.

Reaproveita 100% da casca: mesmo `.credits-lock` / `.credits-lock-card`, mesmo ícone, mesmos botões.
**Zero CSS novo.**

## O problema técnico que decide o sprint

`GET /logistica/creditos/extrato` é `@Admin()`
([logistica.controller.ts:815](../../backend/src/logistica/logistica.controller.ts)) — o motorista
leva **403**. Ou seja: o app do motorista **não tem hoje como saber** que o saldo acabou.

**Solução (a certa):** um booleano em `GET /logistica/config`, que o entregador **já lê** (o próprio
controller documenta: "o app do entregador também lê a config"):

```ts
creditosEsgotados: boolean   // saldo <= 0. BOOLEANO, nunca o saldo.
```

Zero endpoint novo, zero valor vazado, zero permissão nova. O motorista recebe o **fato**
(não dá pra rodar hoje), nunca o **número**.

**Gatilho secundário (rede de segurança):** se a geração da rota falhar com erro de crédito, mostrar
o mesmo overlay na hora, sem esperar o próximo boot.

## Regras que não podem quebrar

1. **`routeActive()` continua sendo exceção** — quem já está dirigindo termina o dia. A trava é
   sobre gerar rota nova, não sobre abandonar entrega no meio da rua. (Regra já existente, do dono.)
2. **Fail-open em erro de rede.** O `catch (_) { state.creditsLock = null; }` de hoje está certo:
   trancar o app por bug de conexão é pior que deixar passar um dia. Não "melhorar" isso.
3. **Som:** `warning` uma vez ao abrir o overlay — **nunca** a cada `render()`
   (o anti-repique do S1 protege, mas o certo é disparar na transição, não no desenho).

## Aceite do S7

- [ ] Admin com saldo 0: overlay atual, com Recarregar — **nada mudou pra ele**
- [ ] Motorista com saldo 0: vê "Fale com o Financeiro", **sem** botão de recarga e **sem** número
- [ ] Motorista **em rota ativa** com saldo 0: **não** trava, termina o dia
- [ ] Modo avião: **não** trava ninguém (fail-open preservado)
- [ ] Saldo volta a positivo → "Atualizar" limpa o overlay pros dois papéis
- [ ] Resposta de `/logistica/config` para não-admin não traz saldo, só o booleano
- [ ] `warning` toca uma vez, não a cada render
