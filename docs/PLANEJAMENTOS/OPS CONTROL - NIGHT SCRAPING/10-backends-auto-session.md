# Passo 10 - Backends Local/VPS com sessao operacional automatica

## Problema

O cockpit ja mostrava Local e VPS trabalhando lado a lado, mas os botoes `Turbo ambos` e `Forcar filtro` ainda dependiam de JWT master fixo em:

- `OPS_CONTROL_LOCAL_BACKEND_TOKEN`
- `OPS_CONTROL_VPS_BACKEND_TOKEN`

Isso deixava a operacao fragil: JWT expira, a VPS nao necessariamente guarda senha Master em ambiente e o painel ficava em `Backends Local/VPS incompletos`.

## Decisao

Manter JWT e login Master como opcoes, mas adicionar o modo recomendado para este cockpit:

- `OPS_CONTROL_LOCAL_BACKEND_AUTO_SESSION=true`
- `OPS_CONTROL_VPS_BACKEND_AUTO_SESSION=true`

Nesse modo, o Ops Control usa o acesso operacional que ja possui:

- Docker local para o backend `backend`.
- SSH na VPS para o backend `hbx-backend`.

Antes de chamar as rotas Master, ele cria uma sessao Master temporaria dentro do backend e usa esse token somente para o comando.

## Configuracao aplicada

Sem salvar JWT ou senha de backend:

```env
OPS_CONTROL_LOCAL_BACKEND_URL=http://host.docker.internal:3000
OPS_CONTROL_LOCAL_BACKEND_AUTO_SESSION=true
OPS_CONTROL_LOCAL_BACKEND_CONTAINER=backend
OPS_CONTROL_VPS_BACKEND_URL=https://api.hbxsystem.com.br
OPS_CONTROL_VPS_BACKEND_AUTO_SESSION=true
OPS_CONTROL_VPS_BACKEND_CONTAINER=hbx-backend
```

## Observacao operacional

Criar sessao operacional substitui a sessao Master ativa no backend. Isso foi aceito para esta implantacao, porque o cockpit precisa comandar Local e VPS sem depender de JWT manual.

## Validacao

- `node --check ops-control/server.js`
- `node --check ops-control/public/app.js`
- `git diff --check`
- Ops Control reiniciado em `127.0.0.1:3099`
- `factory-status` respondeu `200` no backend local
- `factory-status` respondeu `200` no backend VPS
- `/api/radar-cockpit` retornou:
  - `bothReady=true`
  - `localAuthMode=auto`
  - `vpsAuthMode=auto`

## Resultado esperado na tela

O painel deve trocar de `Backends Local/VPS incompletos` para `Backends Local/VPS prontos`, com chips:

- `LOCAL ok - sessao operacional`
- `VPS ok - sessao operacional`

Depois disso, `Turbo LOCAL`, `Turbo VPS`, `Turbo ambos` e `Forcar filtro` conseguem autenticar nos dois backends sem JWT manual.
