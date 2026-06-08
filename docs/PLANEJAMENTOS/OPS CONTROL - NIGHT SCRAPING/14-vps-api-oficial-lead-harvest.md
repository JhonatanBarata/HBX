# Passo 14 - API oficial VPS de Lead Harvest

## Objetivo

Criar a API limpa da VPS para receber batches, consultar importacoes e preparar envio ao Radar/Vendas. Essa API e produto oficial. Ela nao executa Local Lab e nao faz scraping experimental de buscador.

## Endpoints propostos

```text
POST /webscraping/lead-harvest/import
GET  /webscraping/lead-harvest/imports/:id
GET  /webscraping/lead-harvest/results
POST /webscraping/lead-harvest/results/:id/send-to-radar
POST /webscraping/lead-harvest/results/:id/send-to-vendas
```

## Escopo do MVP

Fazer primeiro:

- `POST /webscraping/lead-harvest/import`
- `GET /webscraping/lead-harvest/imports/:id`

Deixar `send-to-radar` e `send-to-vendas` para depois se o importador ainda nao souber salvar no destino final com seguranca.

## Regras de seguranca

- Endpoint exige auth Master/admin compatível com rotas atuais de webscraping.
- Nao aceitar batch sem `batchId`.
- Nao aceitar item sem `sourceUrl`.
- Nao aceitar item sem evidencia minima.
- Nao aceitar `sourceMode=local_lab` como valor salvo final; na VPS deve virar `sourceMode=imported_lab`.
- Nao aceitar segredo, token, cookie ou HTML bruto pesado no payload.
- Nao executar fetch externo durante a importacao no MVP; importar e validar primeiro.

## Persistencia sugerida

Adicionar tabelas somente quando o contrato estiver testado:

```text
HarvestImportBatch
HarvestImportItem
```

Campos de batch:

- id;
- batchId externo;
- sourceMode;
- sourceName;
- requestedBy;
- city/state/segment;
- providersJson;
- statsJson;
- status: `received`, `validated`, `imported`, `partial`, `rejected`;
- counts: received, accepted, rejected, duplicates, negatives, optOuts;
- createdAt/updatedAt.

Campos de item:

- id;
- batchId;
- externalId;
- kind: `lead` ou `email`;
- normalizedEmail;
- normalizedPhone;
- normalizedDomain;
- companyName;
- website;
- sourceUrl;
- sourceProvider;
- confidence;
- status: `accepted`, `rejected`, `duplicate`, `negative`, `opt_out`;
- rejectReason;
- payloadJson;
- importedRadarLeadId;
- importedVendasLeadId.

## Integracoes com HBX atual

Usar os validadores ja existentes quando possivel:

- normalizacao de e-mail em `radar-lead-enrichment`;
- score/decisao em `lead-quality-v2`;
- filtros de canais em webscraping;
- dedupe de telefone/dominio/nome+cidade;
- negativos e opt-outs antes de salvar como lead utilizavel.

## Criterios de aceite

- Importar um batch pequeno com 2 leads e 2 e-mails.
- Aceitar e-mail publico valido com evidencia.
- Rejeitar e-mail invalido.
- Rejeitar dominio bloqueado.
- Marcar item duplicado sem criar novo card.
- Nunca salvar direto em Vendas sem passar por regra de import.
- Retornar resumo de importacao com contadores e motivos.

## Validacoes

- `cd backend && npm run prisma:validate`
- `cd backend && npm run build`
- teste unitario do service de import
- teste e2e/controller se houver padrao local para rotas de webscraping

## Prompt Codex para aplicar

```text
Implemente o Passo 14 em `docs/PLANEJAMENTOS/OPS CONTROL - NIGHT SCRAPING/14-vps-api-oficial-lead-harvest.md`.
Comece pelo endpoint de importacao e consulta de batch. Nao implemente Local Lab, nao rode scraping de buscador e nao envie para Vendas ainda se isso exigir mudar regras comerciais.
```

