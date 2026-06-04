# Company Secrets Migration

## Objetivo

Remover gradualmente segredos de `Company` sem quebrar operacao atual.

A Camada 8 nao faz migracao destrutiva. Ela adiciona:

- inventario em `backend/src/integrations/company-secret-inventory.ts`;
- resolver compativel em `backend/src/integrations/credential-resolver.service.ts`;
- fallback para `Company` enquanto `IntegrationConnection` ainda nao cobre tudo.

## Campos legados inventariados

Campos em `Company` tratados como segredo ou segredo temporario:

- `whatsappAccessToken`
- `mercadoPagoAccessToken`
- `whatsappTemporaryInstanceKey`
- `whatsappTemporaryPairingCode`
- `whatsappTemporaryQrCodeData`

Tambem existe `CompanyWhatsAppEndpoint.whatsappAccessToken`; ele deve entrar em uma etapa posterior de migracao do modulo de endpoints, sem misturar com esta camada.

## Regra de leitura

Leitura nova deve usar `CredentialResolverService`:

1. procurar `IntegrationConnection` ativa do provider;
2. descriptografar `secretCiphertext`;
3. usar `secretPreview` ou `maskSecret`;
4. se nao houver conexao valida, usar fallback em `Company`;
5. nunca logar segredo bruto.

Providers suportados no resolver compativel:

- `WHATSAPP`
- `MERCADOPAGO`

## Plano expand/contract

1. Expand: manter campos em `Company`, criar inventario e resolver compativel.
2. Read switch: trocar consumidores de token para `CredentialResolverService` por modulo, com testes locais.
3. Backfill: criar `IntegrationConnection` criptografada para empresas que ainda usam token em `Company`.
4. Dual-read: manter fallback por pelo menos um ciclo operacional.
5. Contract: quando telemetria indicar que nao ha leitura por fallback, remover writes de segredo em `Company`.
6. Cleanup: depois de backup validado, limpar valores legados e planejar migration de schema.

## Cuidados

- Nao imprimir `secret`, `accessToken`, QR ou pairing code em logs.
- Payloads de API devem retornar apenas `secretPreview`.
- Fallback para `Company` existe por compatibilidade, nao como modelo final.
- Nenhuma etapa deve impedir cobranca, WhatsApp ou Mercado Pago em producao.
