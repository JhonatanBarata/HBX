# Passo 6 - Hard filter real de canais

Data: 2026-06-07

## Objetivo

Fazer o botao `Forcar filtro` sair do estado de anotacao visual e virar regra real do backend.

Quando o operador escolher um canal no cockpit, Local e/ou VPS devem raspar e aprovar somente candidatos que tenham o canal obrigatorio solicitado.

## Decisao aplicada

O `ops-control` continua como agregador unico da operacao Local x VPS.

O backend passa a aceitar e armazenar os filtros operacionais:

- `preferredChannels`
- `requiredChannels`
- `channelMatchMode`
- `freshness`

Para o comando `Forcar filtro`, o Ops Control envia:

```json
{
  "requiredChannels": ["email"],
  "channelMatchMode": "all_required",
  "freshness": "live"
}
```

## Como funciona

O endpoint `POST /api/opscontrol/force-filter` agora encaminha o filtro para:

`POST /modules/master/webscraping/turbo-noturno/force-now`

O backend aceita esses campos no DTO do turbo noturno, grava os filtros no `metadataJson` da configuracao operacional e repassa a regra para campanhas/tarefas de `mass_data`.

Na aprovacao final do lote, o backend tambem valida o candidato antes de persistir no Radar. Se o canal obrigatorio nao existir, o candidato e rejeitado e nao entra como aprovado.

## Regras de canal

- `channelMatchMode=prefer`: nao bloqueia, apenas preserva compatibilidade.
- `channelMatchMode=any_required`: aprova se tiver pelo menos um dos canais obrigatorios.
- `channelMatchMode=all_required`: aprova somente se tiver todos os canais obrigatorios.

Os canais aceitos continuam:

- email
- whatsapp
- instagram
- website
- phone
- facebook

## Pontos protegidos

O hard filter foi aplicado em tres lugares:

- candidato antes de virar aprovado/persistido no Radar;
- listagem/contagem de rows do Radar quando filtros estao ativos;
- tarefas de massa de dados/noturno ao montar o input de busca.

Isso evita o problema do cockpit mostrar filtro ativo enquanto o backend aprova lead sem o canal pedido.

## Limites intencionais

Nao houve migracao de banco. Os novos filtros ficam no `metadataJson` operacional, seguindo o padrao ja usado pelo turbo noturno.

Os testes legados que garantem compatibilidade do Radar Direct e search-run foram preservados. O hard filter novo entra pelo fluxo operacional do Ops Control/mass data, sem transformar filtros legados antigos em bloqueio geral inesperado.

## Arquivos tocados

- `backend/src/webscraping/webscraping.controller.ts`
- `backend/src/webscraping/radar/shared/radar-core-shared.ts`
- `backend/src/webscraping/radar/01-search/radar-core-campaign-planner.mixin.ts`
- `backend/src/webscraping/radar/01-search/mass-data/radar-core-mass-data.mixin.ts`
- `backend/src/webscraping/radar/03-enrichment/radar-core-quality-enrichment.mixin.ts`
- `backend/src/webscraping/radar/05-delivery/radar-core-delivery.mixin.ts`
- `backend/src/webscraping/radar/06-presentation/radar-core-presentation.mixin.ts`
- `backend/src/webscraping/webscraping.service.test.ts`
- `ops-control/server.js`
- `ops-control/public/app.js`
- `ops-control/README.md`

## Validacoes

- `node --check ops-control/server.js`
- `cd backend && npm run build`
- `cd backend && node --test dist/webscraping/webscraping.service.test.js`
- smoke local com backend fake confirmando `filterForwarded=true` e payload com `requiredChannels`, `channelMatchMode=all_required` e `freshness=live`

## Proxima etapa

Passo 7: remover o acesso separado aos motores no `Banco de Dados`, deixando o controle operacional concentrado no Ops Control.
