# PR14062026013 — Valor no motor: temperatura de lead + estratégia de gasto

> Brainstorm fechado com o dono em 14/06/2026. **NÃO é ordem de build.** Define a
> filosofia de gasto, o framework de temperatura de lead e o re-corte do catálogo.
> Nada de preço/checkout/provider sem ordem expressa do dono.
> Relacionado: [PR14062026001-AQUECIMENTO-CADENCIA] (mecânica da cadência),
> [PR14062026012-CADASTRO-CHECKOUT-COBRANCA] (catálogo/checkout).

## 0. Estado real do código (confirmado 14/06)

- `enrichment-cost.service.ts` = **governador de gasto sem cano**. `reservePaidFallback`/
  `evaluatePaidFallback` só são chamados em teste; o pipeline do Radar não chama. Tem
  ledger, orçamento por plano (List R$0 / Lead R$25 / Full R$100 por mês) e regras de
  bloqueio por % de uso — tudo pronto, ligado em NADA.
- E-mail pago = `ExternalDisabledEmailEnrichmentProvider` → `status: 'disabled'`. Stub.
- Conclusão do dono (correta): a implantação de gasto foi começada (caixa + cofre) e
  parada antes de plugar API real.

## 1. A filosofia de gasto (decisão do dono — eixo permanente)

**Não se gasta para deixar a lista fria menos fria. Gasta-se para FABRICAR ou CAPTURAR
intenção, e para deixar o toque crível.** O dinheiro sobe a escada de temperatura;
nunca desce pra base.

Raciocínio do dono:
- Enriquecimento de DADO pago (Apollo/Hunter/Speedio/email-finder) faz o que o motor
  já faz: produz registro frio igual-ou-pior. "O Zé pega seu e-mail e caga pra ele."
- A lista fria virou commodity: ChatGPT free + estagiária já acham "100 empresas perto
  pra ligar". Pagar por isso = ralo.
- Lead que VALE é o que levantou a mão: entrou pelo anúncio, marcou interesse no Insta.
  Esse é "hard quente" — o trabalho é ATENDER bem, não descobrir.
- Modelo do brabo: "gaste R$300 aqui (eu gasto R$200 de API), você dobra vendas falando
  com gente realmente interessada." Isso tem resultado, isso tem valor.

## 2. Escada de gasto — o que vale a pena (ranqueado por ROI)

| # | Onde gastar | ROI | Quem paga | Estado |
|---|---|---|---|---|
| 1 | **Captura de intenção** (Meta/Insta Lead Ads, Google Local → lead que levantou a mão cai no Vendas/Atendimento como 🔥) | ALTÍSSIMO | **Cliente** (verba de ads) + HBX gerencia/marca up | BUILD barato (webhook Lead Ads → VendasLead) |
| 2 | **WhatsApp oficial (Meta Cloud API)** — template profissional, remetente verificado, sem ban; reservado a quem JÁ mostrou intenção | MÉDIO/situacional | **Cliente** (créditos pré-pagos) | BUILD (path de envio oficial gated por intenção) |
| 3 | **Verificação "esse número atende?"** (Webwhats, já existe) — filtra número morto antes de gastar toque | ALTO (custo ~0) | HBX (infra) | JÁ EXISTE — manter/expandir |
| 4 | **Dado pago (decisor: nome+cargo+WhatsApp do dono)** — só em B2B ticket alto, gated a lead de score alto | BAIXO | Cliente, pay-per-hit | NÃO agora (scraper + CNPJ público pega quase tudo de graça) |
| 5 | **Assinatura de enriquecimento de dado (Apollo/Speedio/Hunter mensal)** | ~ZERO | — | **NÃO fazer** |

Regra: o caro é **sempre dinheiro do cliente, pré-pago, com markup**. O HBX nunca carrega
o custo no próprio bolso (exceto brinde de aquisição pequeno e capado = verba de marketing).

## 3. Economia do WhatsApp oficial (porque o dono levantou)

Meta Cloud API cobra por mensagem/conversa (marketing tem custo real por envio no Brasil).
Disparo automático em massa **não paga a mensalidade** — o dono está certo. Paga quando o
template vai pra audiência COM intenção (conversão cobre o custo por conversa). O valor do
oficial = **credibilidade + entregabilidade + sem ban**, não alcance barato. Não-oficial
(Evolution/Webwhats) continua sendo o canal da cadência morna de baixo custo.

## 4. Reframe da carteira (reaproveita o que o dono já construiu)

O `enrichment-cost.service.ts` foi desenhado como "orçamento que o HBX banca". O certo é
virar **carteira PRÉ-PAGA do cliente** (créditos) que financia ação paga (boost de ads,
envio oficial, reveal de decisor); o ledger debita. O que falta:
- (a) saldo/crédito por empresa financiado pelo cliente (não orçamento do HBX);
- (b) os canos reais (Lead Ads intake, envio oficial), gated por temperatura.
O medidor + cofre que ele já fez é exatamente a peça certa — só muda quem abastece.

## 5. Framework de temperatura (Fase 1 — o motor)

Campo novo `leadTemperature: frio | morno | quente`, unindo o que já existe:

| Grau | Significa | Sinal | Estado |
|---|---|---|---|
| 🧊 Frio | Fit/ICP, observado de fora | `opportunityScore` + sinais de buraco + `pitchHint` | ✅ entrega hoje |
| 🌡️ Morno | Fit + (canal verificado vivo / gatilho-intenção / decisor) | WhatsApp `confirmed` ✅ · `hasBudgetIntent`/form no site ✅ · decisor ⚠️ · gatilho ads/contratando ⚠️ | 🟡 parcial |
| 🔥 Quente | Reagiu a um toque OU veio de ads/inbound | `engagementScore` da cadência + Lead Ads intake | ⚠️ desenhado/diferido ([PR14062026001]) + BUILD do intake |

Honestidade que protege: 🔥 só acende quando a cadência (F1–F3 do 001) e/ou o intake de
ads subir. Não vender quente antes de existir.

## 6. Catálogo (Fase 2 — só depois da Fase 1, e só com ordem do dono p/ preço)

Eixos visíveis e gritantes: `TEMPERATURA × FUNCIONÁRIOS × WHATSAPP EMBUTIDO`.

| Plano | Temperatura | WhatsApp | Funcionários | Preço (rascunho) |
|---|---|---|---|---|
| List | 🧊 Frio (a lista) | externo | 1 | R$ 49 |
| Lead | 🧊→🌡️ Frio qualificado + canal verificado | verificado, você opera | 2–3 | R$ 99 |
| Full | 🌡️🔥 Morno + quente automático | embutido (auto-conecta) | 5 | R$ 249 |
| HBX Company | 🔥 Quente operado + ads geridos | embutido + implantado HBX | 10+/negociado | a partir de R$ 499 + setup + gasto pass-through |

O "mendigo de R$100" fica na lista fria (motor grátis + verificação) — funil, não lucro.
O brabo vai pra Company: verba de ads + oficial pré-pagos, leads 🔥 caem no sistema, HBX
marca up o gasto. O caro é dele.

## 7. Anual (do PR-012, mantido): 20% (≈2,5 meses), à vista Pix +5% (=25%), 12x no cartão
é o conversor (commitment sem dor de caixa); founding members travam preço de lançamento.

## 8. Decisões abertas do dono

1. Enriquecer decisor pago (item 4) agora ou só morno grátis (canal+gatilho)?
2. Confirmar: 🔥 nunca antes da cadência/intake existir.
3. Confirmar ordem: Fase 1 (motor) antes de tocar `commercial-plan-catalog.ts`.
4. Primeiro cano a ligar: Lead Ads intake (🔥 barato) ou carteira pré-paga? (recomendo intake)

## Checks quando virar build

- Backend: `npm run prisma:validate` → `npm run build`. Nada de preço/checkout/provider
  sem ordem expressa. Carteira/intake = migration aditiva + testes.
