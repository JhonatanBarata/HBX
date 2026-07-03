# WEBWHATS-ARQ3 — Sprint 7: Canal oficial (WhatsApp Cloud API) como hedge anti-ban

> O único sprint que muda a TOPOLOGIA de canal. Não é substituto do Baileys — é rota de fuga e
> migração seletiva. Pode rodar em PARALELO aos outros (não depende deles). Sprint mais caro e o
> de maior alavanca estratégica. Índice: [sprint 0](WEBWHATS-ARQ3-sprint-0-visao.md).

## Problema ($) e a decisão de mercado
Todo o negócio de mensageria do HBX depende de UM canal não-oficial (Baileys/WhatsApp Web). O
disjuntor + freio (S4) reduzem o risco de ban, mas não o eliminam — a Meta pode banir um chip a
qualquer momento por heurística própria. Hoje, chip de cliente pagante banido = **dias/semanas**
para reparear e recuperar (e às vezes número perdido). Empresas de altíssimo porte NÃO apostam a
receita num canal que pode sumir: usam a **WhatsApp Cloud API oficial** (direto Meta ou via BSP —
Twilio/Infobip/Gupshup/360dialog).

**Não é "trocar tudo pelo oficial".** Trade-off honesto:
- Oficial: sem ban, SLA, ~80 msg/s por número, mas **custo por conversa**, exige aprovação de
  templates fora da janela de 24h, cadastro Business (Meta Business + número dedicado), e não
  serve o caso "conectar o WhatsApp pessoal do vendedor por QR" (isso é a essência do produto atual).
- Não-oficial (Baileys): grátis, conecta qualquer número por QR (o valor do HBX), mas ban é risco
  real e a conta é de responsabilidade do cliente.

**Estratégia recomendada:** oficial como **hedge + tier premium**, não como substituto.
- Cliente crítico / alto volume / que exige garantia → oferece número no canal oficial (upsell).
- Chip pagante banido → religa no oficial em horas enquanto reparear o Baileys.
- Prospecção fria em massa continua no Baileys (oficial cobra por conversa; frio não paga).

## Fatos verificados (o esqueleto JÁ existe)
| Fato | Onde |
|---|---|
| Backend já tem webhook Cloud API + verify token da Meta | `backend/src/messaging/messaging.controller.ts:42,63` (`/webhooks/whatsapp`) |
| `handleWhatsAppWebhook` com validação de assinatura `x-hub-signature-256` | `messaging.controller.ts:63` |
| Fork Evolution suporta canal "Business API" (Meta oficial) nativamente | `Webwhats/src/api/integrations/channel/meta/` |
| Fila de saída (`OutboundMessage`) é agnóstica de provider (`provider` column) | `messaging.service.ts:7960` |
| DTO de inbound proxy já existe | `messaging.controller.ts:29` |

## Entregas (fases — grande, fatiar bem)
1. **Spike/decisão de fornecedor (dono):** Meta direto vs BSP. BSP (ex.: 360dialog/Gupshup) reduz
   burocracia de onboarding e dá billing/observabilidade, com markup. Meta direto é mais barato
   por conversa e mais trabalho. Levantar custo/conversa real do volume do HBX ANTES de codar.
2. **1 número piloto no oficial** (número dedicado de TESTE, jamais o chip do dono): cadastro
   Business, template básico aprovado (saudação/atendimento), webhook apontando pro backend.
3. **Adapter de canal no dispatcher:** `OutboundMessage.provider` decide Baileys vs Cloud API;
   a fila e o resto do pipeline não sabem qual é. Janela 24h + fallback template implementados
   (regra dura da Meta: fora de 24h só template aprovado).
4. **Ingestão unificada:** eventos Cloud API entram pelo mesmo `processWebwhatsEventCore`/projeção
   do Sprint 3 (a conversa é a mesma, muda só o transporte).
5. **UI de escolha de canal por número** (Master/admin): "este número é oficial ou QR".
6. **Runbook de failover:** chip Baileys banido → passos para religar aquele cliente no oficial.

## Aceite
- [ ] Piloto envia e recebe pelo oficial, aparecendo na MESMA inbox do app (via projeção S3).
- [ ] Fora da janela 24h: só template aprovado sai; dentro: texto livre. Testado.
- [ ] `provider` roteia corretamente; um número Baileys e um oficial coexistem sem vazamento.
- [ ] Custo/conversa medido no piloto batendo com a estimativa do spike.
- [ ] Runbook de failover ensaiado com número de teste.

## Riscos / decisões
- Custo por conversa pode inviabilizar prospecção fria no oficial → por isso é HEDGE/premium, não
  substituto. Manter Baileys como canal barato é decisão explícita.
- Onboarding Business/aprovação de template é lento (dias) — começar cedo, em paralelo.
- NÃO migrar o chip do dono pro oficial sem ele pedir; piloto é número dedicado de teste.
- Este sprint é o de maior retorno estratégico (elimina o risco existencial de canal único) e o
  de maior custo/prazo — só arrancar com o dono decidindo fornecedor e orçamento.
