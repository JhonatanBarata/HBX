# HBX Support Ops Spec

## Entrada

- Webwhats.
- Chat do HBX.
- Botao Reportar problema.
- Vendedor interno.

## Identidade

- cliente HBX.
- vendedor nosso.
- lead.
- desconhecido.

## Tipo de problema

- Atendimento / WhatsApp.
- Radar.
- Vendas.
- Login / acesso.
- Pagamento / plano.
- Lentidao.
- Erro visual.
- Outro.

## Tom emocional

- normal.
- ansioso.
- irritado.
- urgente.
- encaminhar humano.

## Classificacoes

- USER_ERROR
- BUG_SAFE
- BUG_RISKY
- COMMERCIAL_ACCESS
- AUTH_SECURITY
- VPS_HEALTH
- RADAR_BLOCK
- WEBWHATS_FAIL
- NEEDS_HUMAN

## Quando acionar Codex

Somente `BUG_SAFE`. Nunca auth, billing, plans, secrets, migrations ou deploy.
