# Passo 5 - Coordenacao Local x VPS sem duplicidade

Data: 2026-06-07

## Objetivo

Garantir que Local e VPS possam trabalhar juntos sem iniciar a mesma cidade, segmento ou tarefa em paralelo.

## Decisao aplicada

O ponto de coordenacao fica no `ops-control`, porque ele e o agregador que enxerga os dois lados ao mesmo tempo.

O backend ja possui lock de tarefa dentro de um mesmo banco, mas Local e VPS podem estar em bancos/processos diferentes. Por isso, o bloqueio entre ambientes precisa acontecer antes de acionar `scope="both"`.

## Como funciona

O `GET /api/radar-cockpit` agora retorna tambem:

```json
{
  "coordination": {
    "status": "ok | attention | blocked",
    "summary": "...",
    "environments": {
      "localhost": {
        "active": {},
        "next": {}
      },
      "vps": {
        "active": {},
        "next": {}
      }
    },
    "conflicts": []
  }
}
```

A comparacao normaliza cidade, estado, segmento e tipo de alvo. Acentos e diferencas simples de espaco nao geram falso negativo.

## Pre-checagem dos comandos ambos

Antes de executar:

- `Turbo ambos`
- `Forcar filtro` com alvo `Local + VPS`

o Ops Control faz uma pre-checagem:

1. coleta o cockpit Local/VPS;
2. consulta `factory-status` dos backends quando os JWTs por ambiente estao configurados;
3. compara trabalho ativo e proxima missao;
4. se houver colisao resolvivel, chama `POST /modules/master/webscraping/factory/force-next` em um lado;
5. se a colisao continuar ou se os dois ja estiverem no mesmo trabalho ativo, bloqueia o comando `both`.

## Regra de seguranca

O passo 5 nao cancela campanha/tarefa ativa para resolver duplicidade. Cancelar trabalho ativo poderia derrubar lote em andamento e perder contexto operacional.

Quando Local e VPS ja estao trabalhando na mesma cidade/segmento, o Ops Control bloqueia o novo comando `both` e mostra a colisao no cockpit. A separacao pode ser feita avancando uma fabrica ou cancelando pelo fluxo operacional ja existente.

## UI adicionada

No cockpit aparece uma faixa:

- `Coordenacao ok`
- `Coordenacao com risco`
- `Coordenacao bloqueada`

Ela mostra:

- LOCAL ativo
- LOCAL proximo
- VPS ativo
- VPS proximo
- conflitos encontrados

## Arquivos tocados

- `ops-control/server.js`
- `ops-control/public/index.html`
- `ops-control/public/app.js`
- `ops-control/public/styles.css`
- `ops-control/README.md`

## Proxima etapa

Passo 6: aplicar o hard filter real de canais no backend e propagar `requiredChannels`, `channelMatchMode` e `freshness`.
