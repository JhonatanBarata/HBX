# Passo 7 - Remocao de motores do Banco de Dados

Data: 2026-06-07

## Objetivo

Remover o acesso separado aos motores no `Banco de Dados` e no fluxo visual antigo do `Master`.

O operador deve controlar scraping, motores, turbo, filtro e cancelamento pelo `HBX Owner > Ops Control`, que ja enxerga Local e VPS no mesmo cockpit.

## Decisao aplicada

O `Banco de Dados` volta a ser uma tela de memoria operacional do Radar:

- pesquisas;
- excluidos;
- reclamacoes;
- distribuicao de cards.

Ele nao aciona mais endpoints de motor, factory, dreno ou cancelamento.

## O que mudou

No frontend `/bancodedados`:

- removida a guia `Motores`;
- `?tab=motores` deixou de ser uma aba valida;
- removida a chamada a `/modules/master/webscraping/elastic/status` no carregamento da tela;
- removido o KPI `Motores`;
- removido o painel `ElasticEnginePanel`;
- removidos botoes de `Forcar noite`, `Religar warm pool`, `Cancelar factory`, `Drenar` e `Parar ocioso`;
- removido o atalho `Master` dentro da tela.

No fluxo `/master/webscraping`:

- o redirect deixou de apontar para `/bancodedados?tab=motores`;
- o caminho passa a abrir `/bancodedados` sem acesso ao painel antigo de motores.

Na documentacao do local-agent:

- a referencia a aba `Radar Motores` foi substituida por `Ops Control`;
- os endpoints locais de motor continuam documentados como base segura, mas nao como UI separada.

## Limite intencional

Os endpoints backend/local-agent de motores nao foram removidos neste passo.

Eles ainda sao necessarios para o Ops Control e para diagnostico seguro, mas deixam de aparecer como controle independente dentro do Banco de Dados.

## Arquivos tocados

- `frontend/src/app/bancodedados/page.client.tsx`
- `frontend/src/app/master/webscraping/page.tsx`
- `hbx-owner/local-agent/README.md`
- `hbx-owner/local-agent/COMMANDS.md`

## Validacoes

- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- busca por `tab=motores`, `Radar Motores` e chamadas `webscraping/elastic` no frontend e docs locais do Owner

## Proxima etapa

Passo 8: revisar o topo/atalhos globais que ainda mostram status de motores para garantir que eles informem saude operacional, mas nao reabram controle separado fora do Ops Control.
