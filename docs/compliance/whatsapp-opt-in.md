# WhatsApp Opt-in Ledger

## Objetivo

Registrar opt-in, opt-out e finalidade de contato proativo por WhatsApp.

Esta camada cria:

- model `WhatsappConsentLedger`;
- migration SQL idempotente;
- `WhatsappConsentLedgerService`;
- testes de grant, revoke e consulta ativa.

Ela nao bloqueia envios de forma ampla. O helper `assertCanSendProactiveMessage` retorna aviso operacional para uso futuro.

## Campos

- `companyId`: empresa dona do contato.
- `phoneNormalized`: telefone apenas com digitos.
- `source`: origem do consentimento, como `landing_page`, `manual`, `checkout` ou `whatsapp_reply`.
- `purpose`: finalidade, como `collection_followup`, `sales_followup` ou `support_update`.
- `status`: `active` ou `revoked`.
- `grantedAt`: data do opt-in.
- `revokedAt`: data do opt-out.
- `metadataJson`: contexto adicional sem segredo.

## Funcoes

- `grantConsent(input)`: cria consentimento ativo.
- `revokeConsent(input)`: revoga consentimentos ativos para telefone/finalidade.
- `hasActiveConsent(companyId, phone, purpose)`: retorna booleano.
- `assertCanSendProactiveMessage(companyId, phone, purpose)`: retorna `allowed` e `warning`.

## Regras operacionais

- Nunca registrar segredo, token ou conteudo sensivel em `metadataJson`.
- Usar `purpose` especifica; evitar valores genericos como `marketing`.
- Respostas inbound do proprio contato podem virar origem futura `whatsapp_reply`, mas isso deve ser integrado em camada separada.
- Antes de bloquear envios reais, medir cobertura de opt-in por empresa e finalidade.

## Proxima etapa

1. Integrar opt-in em formularios publicos e fluxos de cadastro.
2. Registrar opt-out quando o cliente responder parada/SAIR/cancelar.
3. Usar o helper em automacoes proativas com modo `warn` primeiro.
4. Depois de telemetria, transformar `warn` em bloqueio apenas nos fluxos exigidos.
