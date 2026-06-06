# HBX Master Deploy Control

## Comandos existentes

- `npm run new`
- `npm run publish`
- `npm run verify:prod`
- `npm run force`

## Fase atual

Somente `verify:prod` pode ser acionado pelo Local Agent, com confirmacao.

## new

Documentado apenas. Futuramente exige:

- branch `master`.
- git status limpo.
- testes passados.
- confirmacao digitada `PUBLICAR`.

## publish

Documentado apenas. Futuramente exige:

- branch `master`.
- git status limpo.
- testes passados.
- confirmacao digitada `PUBLICAR`.

## force

Bloqueado na primeira versao do HBX Master.

## Nunca

- Publicar branch de PR.
- Publicar com teste falhando.
- Publicar com HOLD.
- Publicar sem confirmacao.
