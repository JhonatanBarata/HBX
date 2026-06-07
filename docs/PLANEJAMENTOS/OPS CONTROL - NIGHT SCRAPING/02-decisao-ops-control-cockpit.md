# Decisao aplicada - Ops Control como cockpit Local/VPS

Data: 2026-06-07
Status: primeira implementacao aplicada no `ops-control`.

## Decisao

O cockpit Local/VPS fica no `ops-control`.

Motivo:

- `ops-control` ja possui base para VPS via SSH.
- `ops-control` ja consulta Docker, logs e Postgres por ambiente.
- O Windows app pode abrir/consumir o cockpit sem virar responsavel direto por SSH.
- O `local-agent` continua focado em automacoes locais do Owner e comandos locais permitidos.

Fluxo escolhido:

```txt
Windows App / navegador local
-> ops-control
-> localhost + VPS
-> Docker, Postgres, campanhas, tarefas, batches e logs
```

## Implementacao feita nesta etapa

Arquivos alterados:

- `ops-control/server.js`
- `ops-control/public/index.html`
- `ops-control/public/app.js`
- `ops-control/public/styles.css`

Entregue:

- novo endpoint `GET /api/radar-cockpit`;
- coleta simultanea de `localhost` e `vps`;
- fallback seguro quando VPS nao tem SSH configurado;
- consulta operacional extra no Postgres:
  - campanhas ativas;
  - tarefas ativas/lockadas;
  - batches recentes;
  - cursor da fabrica;
  - estoque gerado em 24h/7d;
  - cards com email em 24h/7d;
- resumo `workingNow` por ambiente, para mostrar o que cada lado esta scrapeando;
- tela dividida no meio:
  - coluna `localhost`;
  - coluna `VPS`;
  - motores;
  - backend;
  - email 24h;
  - bloqueios;
  - campanha/tarefa/lote/banco;
  - decisao humana;
  - campanhas/tarefas;
  - bloqueios e buscas recentes;
- suporte visual para tema escuro via `prefers-color-scheme`.

## Smoke executado

Com token temporario e porta `3199`:

```txt
GET /api/radar-cockpit
```

Resultado observado:

- endpoint respondeu JSON;
- ambiente local ficou disponivel;
- `workingNow` local detectou `Abadiania / despachantes`;
- VPS retornou fallback seguro: configurar `OPS_CONTROL_SSH_HOST` e senha/chave.

Tambem foi testado o fluxo que a pagina usa:

```txt
GET /api/overview
GET /api/radar-cockpit
```

Resultado:

- os dois endpoints responderam;
- `overview` retornou containers e erros tecnicos do ambiente local, sem impedir o cockpit;
- `radar-cockpit` retornou local/VPS normalmente.

Checks:

```txt
node --check ops-control/server.js
node --check ops-control/public/app.js
```

Ambos passaram.

Observacao:

- `npm --prefix ops-control install` foi executado porque `ops-control/node_modules` nao existia e o smoke precisava de `express`.
- `npm` reportou 2 vulnerabilidades moderadas; nao foi executado `npm audit fix --force` para nao alterar versoes fora do escopo.

## Proximos passos planejados

1. Ligar o Windows app a esse cockpit, mantendo `ops-control` como fonte Local/VPS.
2. Adicionar controles operacionais seguros para turbo/filtro/cancelamento, sem comando livre pelo body.
3. Corrigir o hard filter backend `candidateHasRequiredChannels`.
4. Propagar `requiredChannels`, `channelMatchMode` e `freshness` nas campanhas/fabrica.
5. Remover motores do `/bancodedados` depois que o cockpit estiver aceito.

