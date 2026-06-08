# Passo 16 - Importador seguro na VPS

## Objetivo

Importar resultados do Local Lab ou da API oficial sem poluir o Radar, sem ignorar negativos e sem criar leads falsos.

## Regra principal

A VPS nunca confia no batch.

Ela valida, normaliza, deduplica, compara historico e so entao salva.

## Status implementado

Implementado no backend em `backend/src/webscraping/lead-harvest/lead-harvest-import.service.ts`.

O importador agora:

- rejeita payload inseguro com motivo `unsafe_payload`;
- rejeita schema desconhecido com motivo `unsupported_schema_version`;
- normaliza leads/e-mails antes de qualquer persistencia;
- padroniza motivos como `invalid_email`, `blocked_email_domain`, `missing_source_url`, `missing_company_name`, `duplicate_email`, `duplicate_phone`, `duplicate_company_city`, `negative_history`, `opt_out`, `low_identity_confidence` e `generic_source_only`;
- deduplica por e-mail, telefone/WhatsApp, dominio/site, `placeId` e nome+cidade+UF;
- checa opt-out antes de salvar no Radar;
- checa historico negativo antes de salvar no Radar;
- grava itens aceitos no `RadarLeadPool` com `sourceEngine = imported_local_lab` quando a origem vem do Local Lab;
- preenche `enrichmentJson`, `evidenceJson`, `emailStatus`, `emailConfidence`, `opportunityScore` e rastreabilidade do batch;
- grava `importedRadarLeadId` no item importado;
- nao chama fluxo de Vendas e mantem `importedVendasLeadId` nulo neste passo.

## Ordem da importacao

1. Validar formato do batch.
2. Normalizar campos.
3. Rejeitar payload com segredo/cookie/token/HTML bruto pesado.
4. Validar e-mail e fonte.
5. Deduplicar por:
   - e-mail;
   - dominio;
   - telefone;
   - WhatsApp;
   - nome + cidade + UF;
   - placeId quando existir.
6. Checar negativos e opt-outs.
7. Checar bloqueios comerciais.
8. Calcular score inicial.
9. Salvar item aceito como importado.
10. Salvar rejeicao com motivo.

## Motivos de rejeicao padronizados

```text
invalid_email
blocked_email_domain
missing_source_url
missing_company_name
duplicate_email
duplicate_phone
duplicate_company_city
negative_history
opt_out
low_identity_confidence
generic_source_only
unsafe_payload
unsupported_schema_version
```

## Nao descartar negativo

Negativo protege o sistema. Se um lead importado bater com historico negativo:

- nao recriar card;
- registrar `negative_history`;
- manter evidencia da tentativa;
- opcionalmente atualizar contador de tentativa bloqueada;
- nao mandar para Vendas.

## Salvar no Radar

Quando o item for aceito:

- `sourceEngine = imported_local_lab` quando vier do Local Lab;
- `sourceRisk = experimental`;
- `sourceProvider` preserva o provider original;
- `sourceUrl` preserva a evidencia;
- `enrichmentJson` inclui origem, batch e evidencias;
- `emailStatus` respeita `confirmed/probable/missing/invalid`;
- `emailConfidence` vem normalizada.

## Salvar em Vendas

Somente depois de MVP do Radar estar estavel.

Regras:

- usar fluxo existente de envio Radar -> Vendas;
- respeitar time policy;
- respeitar requiredChannels;
- nao furar entitlement/plano;
- nao enviar negativo/opt-out;
- manter rastreabilidade do batch.

## Criterios de aceite

- Batch com e-mail valido cria item aceito.
- Batch duplicado nao cria segundo lead.
- Batch com opt-out e rejeitado.
- Batch com negativo e rejeitado.
- Batch com e-mail invalido e rejeitado.
- Batch sem evidencia e rejeitado.
- Importacao retorna contadores corretos.

## Validacoes

- `cd backend && npm run prisma:validate`
- `cd backend && npm run build`
- teste unitario do importador
- teste de regressao para negativos/opt-out se ja existir suite nessa area

## Prompt Codex para aplicar

```text
Implemente o Passo 16 em `docs/PLANEJAMENTOS/OPS CONTROL - NIGHT SCRAPING/16-importador-seguro-vps.md`.
Foque no importador seguro, dedupe, negativos, opt-out e motivos de rejeicao. Nao conecte provider externo e nao mande direto para Vendas no primeiro PR.
```
