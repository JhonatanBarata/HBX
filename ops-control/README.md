# HBX Ops Control

Painel operacional local para controlar a VPS HBX via SSH, acessivel somente em `127.0.0.1:3099`.

Agora o painel tambem tem a area **Auditoria do Radar**, com abas:

- `VPS`: consulta Docker, logs e Postgres da VPS via SSH.
- `localhost`: consulta Docker, logs e Postgres da maquina local quando o socket Docker esta disponivel.

O cockpit Local x VPS tambem tem controles seguros:

- `Turbo LOCAL`, `Turbo VPS` e `Turbo ambos`.
- filtro opcional no seletor do Turbo; quando um canal esta escolhido, `Turbo LOCAL`, `Turbo VPS` e `Turbo ambos` tambem enviam `requiredChannels`, `channelMatchMode=all_required` e `freshness=live`.
- `Forcar filtro`, atalho explicito para acionar o canal obrigatorio selecionado.
- `Cancelar scraping`, que chama o cancelamento do modo forcado com drenagem curta.
- Coordenacao Local x VPS para evitar que o alvo `Local + VPS` inicie duas fabricas na mesma cidade/segmento/tarefa.

## Uso

```bash
echo "OPS_CONTROL_TOKEN=troque-por-um-token-grande" >> .env.ops-control
echo "OPS_CONTROL_TARGET=ssh" >> .env.ops-control
echo "OPS_CONTROL_SSH_HOST=187.77.47.18" >> .env.ops-control
echo "OPS_CONTROL_SSH_USER=root" >> .env.ops-control
echo "OPS_CONTROL_SSH_PASSWORD=sua-senha" >> .env.ops-control
docker compose --env-file .env.ops-control -f docker-compose.ops.yml up -d --build
```

Para acionar os botoes operacionais, configure tambem os backends por ambiente com JWT master:

```bash
echo "OPS_CONTROL_LOCAL_BACKEND_URL=http://host.docker.internal:3000" >> .env.ops-control
echo "OPS_CONTROL_LOCAL_BACKEND_TOKEN=jwt-master-local" >> .env.ops-control
echo "OPS_CONTROL_VPS_BACKEND_URL=https://backend-vps-acessivel-pelo-ops-control" >> .env.ops-control
echo "OPS_CONTROL_VPS_BACKEND_TOKEN=jwt-master-vps" >> .env.ops-control
```

Como alternativa a JWT manual, use credenciais Master por ambiente. O Ops Control chama `/auth/login` com `forceSession=true` antes do comando:

```bash
echo "OPS_CONTROL_LOCAL_BACKEND_USERNAME=usuario-master-local" >> .env.ops-control
echo "OPS_CONTROL_LOCAL_BACKEND_PASSWORD=senha-master-local" >> .env.ops-control
echo "OPS_CONTROL_VPS_BACKEND_USERNAME=usuario-master-vps" >> .env.ops-control
echo "OPS_CONTROL_VPS_BACKEND_PASSWORD=senha-master-vps" >> .env.ops-control
```

Quando o Ops Control tem acesso ao Docker local e ao SSH da VPS, a opcao recomendada e criar uma sessao operacional automatica no container backend antes do comando:

```bash
echo "OPS_CONTROL_LOCAL_BACKEND_AUTO_SESSION=true" >> .env.ops-control
echo "OPS_CONTROL_LOCAL_BACKEND_CONTAINER=backend" >> .env.ops-control
echo "OPS_CONTROL_VPS_BACKEND_AUTO_SESSION=true" >> .env.ops-control
echo "OPS_CONTROL_VPS_BACKEND_CONTAINER=hbx-backend" >> .env.ops-control
```

Para usar apenas um ambiente por vez, `OPS_CONTROL_BACKEND_URL` com `OPS_CONTROL_BACKEND_TOKEN`, `OPS_CONTROL_BACKEND_USERNAME/PASSWORD` ou `OPS_CONTROL_BACKEND_AUTO_SESSION=true` funcionam como fallback. Para o alvo `Local + VPS`, use as variaveis especificas para evitar disparar duas vezes o mesmo backend.

Se o Ops Control estiver rodando direto no Windows, fora do Docker, o backend local normalmente fica em `http://127.0.0.1:3000`. Dentro do compose do Ops Control, use `http://host.docker.internal:3000`.

Abra:

```text
http://127.0.0.1:3099
```

## Limites

- Nao existe endpoint de shell livre.
- Todas as APIs exigem `Authorization: Bearer <token>`.
- As acoes executam apenas comandos Docker allowlistados.
- A auditoria do Radar le apenas Docker, logs recentes e consultas SQL fixas de diagnostico.
- Os controles de turbo/cancelamento chamam apenas rotas master existentes no backend e exigem JWT master, login Master ou sessao operacional automatica configurada por ambiente.
- O filtro por canal e enviado ao backend master; exige backend atualizado com o passo 6.
- Quando `Turbo ambos` ou `Forcar filtro` usam `Local + VPS`, o Ops Control compara trabalho ativo e proxima missao dos dois ambientes. Se houver colisao resolvivel, ele chama `factory/force-next` em um lado antes de iniciar; se os dois ja estiverem no mesmo trabalho ativo, ele bloqueia o comando para evitar duplicidade.
- A aba localhost exige Docker local acessivel pelo processo do Ops Control. No compose, isso usa `/var/run/docker.sock`.
- O frontend em PM2 nao e controlado nesta primeira versao, porque o painel roda isolado em Docker e nao monta o ambiente PM2 do usuario host.
