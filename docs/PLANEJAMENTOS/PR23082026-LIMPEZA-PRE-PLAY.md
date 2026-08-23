# PR23082026 — A última limpeza antes da Play

> Brainstorm do dono (23/08/2026): *"centralizar créditos X mensalidades — contra — desktop e
> celular… remova o aspecto IA do aplicativo, muita coisa escrita… newbies e pessoas de mais
> idade (40~60) gostam de apps q o ícone explique as coisas… sem refatorar, só um ajuste visual
> fino. É necessário agora isso? ou postar do jeito que está?"*
>
> Resposta medida: **o app é funcional e a maioria das telas JÁ é ícone + rótulo.** O que
> justifica segurar o build não é estética — são **3 frases que mentem** e **3 telas que abrem
> em branco**. Isso é o Lote A. O resto pinga durante os 14 dias do teste fechado, que é o
> relógio que realmente manda.

---

## 0. O que foi MEDIDO (não achado)

14 telas fotografadas no moto g15 (`versionCode 357`, `versionName 2.0.0`), em
`scratchpad/shots/`:

| Tela | Veredito |
|---|---|
| Mapa, Ajustes, Avançado, Montagem, Chat, Cadastro, Tutorial, Fechamento, lâmpada | ✅ limpas — ícone + rótulo, zero textão |
| **Créditos** | 🔴 3 dos 9 banners do app inteiro estão nesta tela; **2 estão errados** |
| **Procurar** | ⚠️ a mesma informação 3× (placeholder + dica + estado vazio) |
| **Financeiro** | 🔴 abre **em branco** — só o título |
| **Clientes** (0 clientes) | 🔴 lista em branco + rótulo órfão "marcado hoje" sem número |
| **Meus clientes** (base vazia) | ⚠️ diz *"Nenhum cliente com esse nome"* sem ninguém ter digitado nome |

### As 3 frases que mentem (tela de Créditos)

1. *"Crédito só é debitado quando a rota **inicia**. Conferir nunca debita."*
   **Falso desde a ROTA v2 (10/08).** O débito do dia sai em `POST /logistica/rota/planejar`
   (`garantirDiaPago`, [logistica-rota.service.ts:473](../../backend/src/logistica/logistica-rota.service.ts)),
   e **quem chama o planejar é o MONTAR** ([32-verbos-montar-iniciar.js:117](../../EntregaShell/app/src/logistica/ponte-src/32-verbos-montar-iniciar.js)).
   Montou, debitou. Cancelar **não estorna** (decisão do dono, mesma lei do "cancelar apaga mas
   não devolve"). A frase promete o contrário — é reclamação de cliente esperando acontecer.
2. *"Migração entre rotas é grátis: a mesma entrega não debita duas vezes."*
   **Fóssil de 06/08** (git: `073257bd`), do modelo por-ENTREGA que morreu em 10/08. Hoje não
   existe débito por entrega: existe **dia** (nível CREDITO) e **passe de motorista** (planos).
3. *"Precisa de ajuda? Fale com a gente."* — não mente, mas repete os DOIS botões logo abaixo.

**A lição, e é a que dá nome ao PR:** texto explicativo é **passivo** — envelhece errado e em
silêncio. As frases eram verdade quando nasceram; o modelo mudou e ninguém as viu. Ícone,
número e estado vazio não envelhecem. Tirar o "aspecto IA" não é apagar letra: é trocar frase
defensiva por **fato curto**.

---

## 1. Crédito × mensalidade — o retrato

| Ação | Créditos | ≈ R$ (0,75–0,97/cr) |
|---|---|---|
| Lead entregue | 1 | 0,75–0,97 |
| **Dia de rota (avulso)** | **6** — 1× por empresa+dia | 4,50–5,82 |
| Passe de motorista extra | 8/dia | 6,00–7,76 |
| Automação / IA tempo real | 0,1 | centavos |
| Planos Rota (Basic/Advanced/Full) | — | 99 / 199 / 299 por mês |

**A assimetria que o dono sentiu** (motorista gasta 6 no dia inteiro; vendedor gasta 6 em 10
minutos) **não é defeito de preço.** Preço não segue esforço nem tempo — segue valor e
concorrência. O vendedor comprou 6 oportunidades; se 1 fecha, o ROI dele é maior. Crédito é
MOEDA: uma carteira, N preços (padrão Twilio/AWS/Zenvia). Referência de mercado: lead B2B
enriquecido com telefone custa R$ 1–3 no Brasil (Econodata/Speedio); SaaS de rota para
água/gás cobra R$ 60–300/mês (SGA, Gestor Gás). **Os dois lados estão dentro do mercado.**

**O que os números REALMENTE mostram — a escada está plana:** avulso todo dia útil ≈ 132
cr/mês ≈ **R$ 99–128**, que é o preço do Basic (R$ 99). Assinar quase não economiza; o degrau
perde a força. O mercado põe o pay-as-you-go 1,5–2× acima da assinatura justamente para o
degrau funcionar. Saídas: dia a 8 créditos (Basic passa a economizar 25–42%) **ou** aceitar que
o avulso é o produto do pequeno e o degrau real é assento/recurso. **Decisão do dono, com dado
de uso, DEPOIS da produção** — mexer em preço no meio do teste fechado é trocar a régua no meio
da medição. Os 100 créditos de boas-vindas (≈ 16 dias de rota) são um trial ótimo para os 14
dias; não estragar isso agora.

### O que centralizar (e a política da Play já obriga)

**A loja é o painel; o celular é ferramenta.**

- **Celular**: saldo, extrato, "quem recarrega é o administrador" + portas de suporte. Zero
  vitrine (já é assim desde 20/08 — `encherCarteira` esvazia `packs` quando `HBX.info().play`).
- **Painel**: uma página só de Plano & Créditos — cartão do plano (nível, assentos, preço),
  carteira, extrato. **Hoje o dono da distribuidora NÃO consegue ver o plano dele nem assinar
  sozinho** (ver dívida em §4): é aí que vaza dinheiro, não no preço do crédito.
- **Fundir mensalidade em crédito: NÃO.** A decisão de 28/07 continua certa (MRR previsível,
  degrau de upgrade, e preço ≠ custo na mesma unidade).

---

## 2. LOTE A — entra no build que sobe para a faixa (feito neste PR)

Tudo em `docs/mockups/logistica2.0/logistica-2.0.html` (a FONTE) + `casca-injetar` +
`ponte-costurar`. Zero refatoração, zero endpoint novo.

| # | O quê | Onde |
|---|---|---|
| A1 | Créditos: 3 banners → **1 fato**. Sai a frase do "inicia" (mentira) e a da "migração" (fóssil); o aviso da loja perde a 2ª frase (os botões já dizem). Ícone deixa de ser ⚠ e passa a ser o do assunto | `T.creditos` |
| A2 | **4º estado: `nada()`** — o servidor respondeu e a resposta é NADA. Aplicado em Financeiro, Clientes e Meus clientes. Ícone + 3 palavras + (quando há verbo) 1 botão | `mioloDe` vizinhança, `T.financeiro`, `T.clientes`, `T.rapida` |
| A3 | Aula "Créditos": os 2 passos de COMPRA saem no canal loja (`se:d=>!d.loja`), entra o passo das portas de suporte; título vira "Créditos"; some "entrega rastreada" (modelo morto) | `AULAS.creditos`, `CAPITULOS.creditos`, ponte publica o fato `loja` |
| A4 | Rótulo órfão: "marcado hoje" sem número some junto com o número | `T.clientes` |

**Regra que não se quebra aqui:** nenhum literal de dinheiro entra na casca. Por isso a frase
nova do A1 **não diz "6 créditos"** — o preço é editável no `/master`
(`credit-action-config`), e número chumbado na casca vira mentira no dia em que o dono mudar o
preço. A frase diz o que **não** muda: cobra 1× por dia, remontar não cobra de novo.

## 3. LOTE B — durante os 14 dias (atualização da faixa chega sozinha)

- Procurar: cortar a dica redundante (`.avb-dica`) — o placeholder já diz.
- Traduzir o saldo ("≈ N dias de rota") lendo o custo do dia, sem chumbar preço.
- Nomenclatura: "Rota avulsa — adicione as paradas" → "Adicione as paradas de hoje";
  avaliar "Espaço 1/2/3" → "Roteiro 1/2/3".
- **Desktop**: reviver o cartão do plano e apagar os textos do modelo morto (§4).

## 4. Dívida medida no desktop (não entra hoje — é painel, não app)

`frontend/src/app/(app)/logistica/config/page.client.tsx`:
- L456: o cartão do plano **nunca renderiza** — a condição é `plano.paradasInclusas > 0`, e o
  `GET /logistica/plano` ([logistica-nivel-plano.service.ts](../../backend/src/logistica/logistica-nivel-plano.service.ts))
  **não devolve mais** esse campo desde a ROTA v2 (devolve `nivel`, `titulo`, `precoMensal`,
  `assentosInclusos`). Resultado: o dono não vê em que plano está.
- L497–517: ainda vende *"Rota Essencial — cobra por parada"* e *"Rastreada — 2 créditos por
  entrega concluída"* — as duas ações estão **travadas em `free`** no catálogo
  (`OVERRIDE_LOCKED_ACTIONS`). O painel descreve uma cobrança que não existe mais.

## 5. Verificação deste PR

- `casca-conferir` + `ponte-conferir` verdes (casca sem ponte = maquete na mão do cliente).
- Foto no g15 das 3 telas que mudaram: Créditos, Financeiro (vazio), Clientes (vazio).
- Tutorial › Créditos abre e completa **sem** passo de pacote no binário da loja.

## 6. O que sobe hoje, e em que ordem

1. Lote A + `casca-injetar`/`ponte-costurar` + foto no g15.
2. Commit (a árvore tem o extrato do cliente pendente — commit junto ou à parte, decisão do dono).
3. Bundle **versionCode 358** (357 já foi gerado — a Play queima número para sempre).
4. Faixa **fechada**, 12 testadores clicando **no mesmo dia** (o relógio é por pessoa).
5. Formulários do Console que ainda estavam ⬜ em 21/08: Segurança de dados, IARC, público-alvo.
   Sem eles a faixa não publica e o link de opt-in não nasce.
