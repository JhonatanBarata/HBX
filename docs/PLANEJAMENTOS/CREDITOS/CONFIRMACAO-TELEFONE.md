# CONFIRMAÇÃO DE TELEFONE — plano (06/07, pedido do dono)

> Contexto: modelo grátis LIVE (50 créditos no confirm). Dono barrou exigir telefone sem CONFIRMAR
> ("sem confirmação não tem necessidade") — Google fica como está POR ORA e este é o plano pra
> confirmação de verdade. Objetivo final: **brinde de 50 só com email + telefone VERIFICADOS**,
> dedup anti-farra em cima de telefone provado (não digitado).

## Estado hoje (o que já existe — F6, 19/06)
- Backend: `POST /auth/onboarding/whatsapp/start` + `/confirm` — código de 6 dígitos enviado pelo
  **WhatsApp do Master**; desenho SEM coluna nova (JWT efêmero carrega só o hash do código).
- **Mock-first:** em dev o código sai no log/preview; envio LIVE está **GATED** (`LIVE_WHATSAPP_CONFIRM`,
  não implementado de propósito — disparar WhatsApp é ação live).
- Front: `register/page.client.tsx` já tem o fluxo completo (`waStep: idle→phone→code`), hoje como
  caminho ALTERNATIVO ao link de email. No modelo grátis o telefone digitado já é obrigatório e
  pré-preenche o F6 — mas não é verificado.

## Fases (cada uma atrás de flag, ordem fixa)

**F1 — Envio LIVE do código pelo chip do Master.** Implementar o send real atrás de
`LIVE_WHATSAPP_CONFIRM=true` (default OFF), pela rotina do app (messaging service), NUNCA API crua
do motor. Guardrails duros (família dos bans de jun/26): teto de envios por telefone/hora, cooldown
60s entre reenvios, disjuntor — jamais loop de retry. Testar com **número descartável** como DESTINO;
o chip do Master só ENVIA (uso normal de mensagem, não conexão), respeitando throttle.

**F2 — Brinde amarrado ao telefone VERIFICADO.** Marcar verificação (ex.: `Company.contactPhoneVerifiedAt`,
migration pequena — gravada quando o F6 confirma o código do telefone que está no cadastro). Gate novo no
`maybeGrantWelcomeAfterConfirm`: flag `HBX_CREDITS_REQUIRE_VERIFIED_PHONE` (default OFF) → ON exige
email confirmado **E** telefone verificado pra soltar os 50. Dedup passa a comparar telefone verificado.

**F3 — Google fecha o vetor.** Pós-login Google sem telefone verificado → banner "confirme seu WhatsApp
pra liberar seus 50 créditos" (bloqueia SÓ o brinde, nunca o app). No /register o passo do código vira
obrigatório no fluxo grátis. Com F2 ON, "1 gmail novo = 50 créditos" morre: gmail infinito existe,
número de WhatsApp infinito não.

**F4 — Rollout.** Dev mock (código no log) → F1 live com número descartável → F2 flag ON → F3.
Reversível em cada passo (flags). Custo: zero (chip do Master já existe). Risco real: throttle de envio —
por isso teto+cooldown+disjuntor nascem JUNTO com o F1, não depois.

## Fora de escopo (decidido 06/07)
- SMS pago (Twilio etc.): não — o WhatsApp do Master faz o serviço de graça.
- Bloquear cadastro por telefone repetido: não — repetido cria conta, só não ganha brinde (já em prod).
