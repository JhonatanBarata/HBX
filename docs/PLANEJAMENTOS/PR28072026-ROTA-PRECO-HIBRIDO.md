# PR28072026 — PREÇO HÍBRIDO DOS 3 NÍVEIS DE ROTA

> **ESTADO (28/07 ~05h): IMPLANTADO** — commit `40aef2ab`, publicado.
> Decisão do dono depois do brainstorm: **mensalidade fixa + franquia de paradas
> inclusa; o excedente segue consumindo crédito.** Preço e franquia editáveis no
> Master (janela Créditos → guia **Rota**).

## A pergunta que originou isto (dono, 28/07)

> "o básico que é o consumir créditos existe aqui [master → créditos → Ações] —
> por que não deixar valores consumíveis em crédito?"

**Resposta: porque são coisas diferentes, e misturar quebra a venda.**

| | Já existia | Mede |
|---|---|---|
| Crédito por uso (guia Ações) | Logística Simples 1 cr/bloco de 5 paradas · Rastreada 2 cr/entrega | **custo marginal** |
| Mensalidade do plano | overlay do catálogo comercial | **preço do produto** |

4 motivos para NÃO transformar a mensalidade em crédito:
1. **O cliente do nicho compra mensalidade fixa.** SGA e Gestor Gás vendem assim;
   preço que oscila com a operação vira medo de estourar a conta e te tira da
   comparação direta na hora da venda.
2. **Receita de consumo é serrote** — cai em feriado, cai em janeiro. Mensalidade
   é MRR previsível.
3. **Crédito puro MATA O DEGRAU.** O motor da escada é o selo "Disponível no
   Advanced". Se tudo é consumo, o cliente nunca sobe de nível: só recarrega no
   mesmo, e os R$ 100 de degrau viram zero.
4. **Mistura custo com margem.** Perde-se a régua "quanto me custa servir esse
   cliente × quanto ele me paga".

**A franquia é o motor de upgrade:** ao estourar, o cliente compara "recarregar
crédito" com "subir de plano" — e sobe sozinho.

## Os números (calibrados com PRODUÇÃO, julho/2026 — não com chute)

Bloco de cobrança = 5 paradas = 1 crédito. Crédito custa R$ 0,75–0,97
(Starter 100/R$97 · Growth 300/R$247 · Scale 800/R$597).

| Empresa | paradas/mês | ≈ créditos | ≈ R$ |
|---|---|---|---|
| Cia 41 (piloto) | 424 | 85 | 70 |
| Cia 48 | 1.104 | 221 | 181 |

| Nível | Mensalidade | Franquia | Valor-em-crédito incluso |
|---|---|---|---|
| Rota Basic | R$ 99 | 300 paradas | ≈ R$ 49 (50% do preço) |
| Rota Advanced | R$ 199 | 600 paradas | ≈ R$ 98 (49%) |
| Rota Full | R$ 299 | 1.000 paradas | ≈ R$ 164 (55%) |

A régua cai naturalmente no real: a **41 estoura o Basic e cabe no Advanced**
(que é onde ela já está); operação pesada cabe no Full.

## Como ficou no código

- **Catálogo**: `logistica-nivel-catalog.ts` — base em CÓDIGO + overlay editável
  no banco (`LogisticaNivelConfig`), getters síncronos. Mesmo molde do
  `credit-pack-catalog`. Migration **aditiva e sem seed**: tabela vazia = todo
  mundo no catálogo, então ligar isto não muda cobrança de ninguém sozinho.
- **Franquia antes da carteira, nos DOIS caminhos de queima**:
  - Essencial: bloco dentro da franquia vira claim `PLAN` (mesma tabela, carteira
    intocada). O unique (empresa+motorista+data+bloco) faz a decisão ser tomada
    **uma vez na vida do bloco** — repreparar a rota não recobra nem reconta.
  - Rastreada: 1 entrega = 1 parada, mesmo claim `PLAN`. **Sem isso a franquia do
    Full seria decorativa** (o preset do Full liga TRACKED e queimaria crédito
    por outra porta com a franquia intacta).
- `PLAN` é terminal: sem `usageKey`, invisível pros varredores de estorno.
- Falha ao ler a franquia **nunca** trava a rota nem cobra em dobro — cai no
  caminho de sempre (débito).
- Mês = o da **rota**, no fuso da operação. Nunca o relógio UTC do container.
- **Master**: janela Créditos → guia **Rota** (preço, franquia, restaurar padrão).
- **Tenant**: `GET /logistica/plano` (Admin-only — carrega valor, LEI DO VENDEDOR)
  e o bloco "usou X de Y paradas do plano neste mês" na tela de regras.

## ⚠️ Consequência comercial imediata (o dono precisa saber)

**Nenhuma empresa tem assinatura no sistema** (`CompanySubscription` vazio para
todas as 8). O que roda de verdade hoje é o crédito. Com a franquia ligada:

- a **41** (424 paradas/mês) passa a consumir **zero crédito** — cabe inteira nos
  600 do Advanced;
- a **48** (1.104) passa a consumir só o excedente (~500 paradas ≈ 100 créditos).

Ou seja: **a receita de crédito dessas duas cai para perto de zero e a
mensalidade ainda NÃO é cobrada automaticamente pelo sistema.** Cobrar os
R$ 199/mês é, por enquanto, ato comercial fora do app.

Amarrar a mensalidade no MercadoPago (assinatura recorrente de verdade) é a
próxima decisão: existe máquina pronta (catálogo comercial + proração +
self-checkout), mas ninguém a usa hoje e ligar cobrança recorrente ao vivo é
decisão do dono, não efeito colateral desta entrega.

## Pendências

- Decidir se os 3 níveis viram **família de plano própria** no catálogo comercial
  (com checkout MP) ou seguem cobrados por fora. A 41 é logística-only, então
  "Rota Basic 99" bateria de frente com o "Padrão 99" da plataforma no mesmo
  checkout — por isso não emendei sozinho.
- Taxa de implantação (importação assistida / IA de visão da F4).
