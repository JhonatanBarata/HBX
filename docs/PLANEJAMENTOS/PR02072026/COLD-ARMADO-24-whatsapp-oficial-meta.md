# COLD-24 — ARMADO (WhatsApp Oficial Meta) — disparar só com demanda pagante

> Blueprint estratégico: `docs/PLANEJAMENTOS/cold/24-whatsapp-oficial-meta.md`. NÃO deletar até disparar.
> **Gatilho:** 1º cliente que EXIGIR oficial (enterprise/medroso, disparo em volume com bênção da Meta)
> OU sinal de risco sistêmico no não-oficial. **Custo Meta é REAL** (R$/conversa 24h) + verificação de
> negócio + templates aprovados → só ligar com cliente pagando por isso.

## Leitura estratégica (já batida)
O CNPJ Biz assume no produto que roda Baileys igual ao nosso Webwhats, e vende o oficial como **upsell
de estabilidade**. Ou seja: nosso Webwhats **não é gambiarra, é o padrão do mercado**. O oficial é
segunda opção, não substituto.

## Arquitetura (o ponto-chave: o app não pode saber a diferença)
Adapter `whatsapp-official` DENTRO do `Webwhats/`, atrás da **MESMA interface interna do motor** que o
Baileys já implementa. Meta Cloud API = webhook (recebe) + send de template/mensagem (envia). O backend
continua falando com o motor por `http://172.18.0.1:8080` sem saber se por trás é Baileys ou Cloud API.
- **Leia `Webwhats/AGENTS.md` antes de tocar** (projeto separado, Evolution/Baileys, systemd
  `webwhats.service`).
- Webhook Meta = mesmo padrão do `backend/src/meta-lead-ads` (verify handshake + HMAC do App Secret,
  fail-closed sem segredo). Reaproveitar esse molde.

## Wizard de conexão (copiar a honestidade deles)
Tela "Adicionar conexão" com as 2 opções lado a lado, prós/contras na cara:
- **Oficial (Meta Business):** alta estabilidade, recursos avançados, suporte oficial — **custo Meta**.
- **Não oficial (nosso Webwhats):** recursos ilimitados, sem custo adicional.

## Regras DURAS que continuam (independem do tipo de conexão)
- **1 número = 1 conexão** (2 sockets no mesmo número = ban).
- **Disjuntor de reconexão** (teto + backoff + parar-e-marcar). Loop de reconexão = ban.
- Testar em número descartável, nunca no chip do dono.
Estas valem pro Baileys hoje; o adapter oficial NÃO afrouxa nenhuma.

## Preço
Conexão oficial **só em plano alto** (repassa custo Meta + margem). Frente financeira → Opus no preço.

## Sprint (quando disparar)
1. Conta Meta Business + verificação + 1 template aprovado (trabalho de CADASTRO do dono, não código).
2. Adapter `whatsapp-official` no Webwhats atrás da interface interna (send template/mensagem + webhook).
3. Wizard 2-opções no painel + gate de plano.
4. Typecheck ESTRITO do motor (`cd Webwhats && npm run typecheck`). Testes do adapter (webhook HMAC, send).

## Custo/risco
ALTO (dinheiro Meta recorrente + verificação + risco de mexer no motor de chip). **Não construir por
antecipação** — só com cliente pagando pelo oficial na mão.
