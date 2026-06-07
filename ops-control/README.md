# HBX Ops Control

Painel operacional local para controlar a VPS HBX via SSH, acessivel somente em `127.0.0.1:3099`.

Agora o painel tambem tem a area **Auditoria do Radar**, com abas:

- `VPS`: consulta Docker, logs e Postgres da VPS via SSH.
- `localhost`: consulta Docker, logs e Postgres da maquina local quando o socket Docker esta disponivel.

O cockpit Local x VPS tambem tem controles seguros:

- `Turbo LOCAL`, `Turbo VPS` e `Turbo ambos`.
- `Forcar filtro`, enviando `requiredChannels`, `channelMatchMode=all_required` e `freshness=live` para o backend.
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

Para acionar os botoes operacionais, configure tambem os backends por ambiente:

```bash
echo "OPS_CONTROL_LOCAL_BACKEND_URL=http://host.docker.internal:3001" >> .env.ops-control
echo "OPS_CONTROL_LOCAL_BACKEND_TOKEN=jwt-master-local" >> .env.ops-control
echo "OPS_CONTROL_VPS_BACKEND_URL=https://backend-vps-acessivel-pelo-ops-control" >> .env.ops-control
echo "OPS_CONTROL_VPS_BACKEND_TOKEN=jwt-master-vps" >> .env.ops-control
```

Para usar apenas um ambiente por vez, `OPS_CONTROL_BACKEND_URL` e `OPS_CONTROL_BACKEND_TOKEN` funcionam como fallback. Para o alvo `Local + VPS`, use as variaveis especificas para evitar disparar duas vezes o mesmo backend.

Abra:

```text
http://127.0.0.1:3099
```

## Limites

- Nao existe endpoint de shell livre.
- Todas as APIs exigem `Authorization: Bearer <token>`.
- As acoes executam apenas comandos Docker allowlistados.
- A auditoria do Radar le apenas Docker, logs recentes e consultas SQL fixas de diagnostico.
- Os controles de turbo/cancelamento chamam apenas rotas master existentes no backend e exigem JWT master configurado por ambiente.
- O filtro por canal e enviado ao backend master; exige backend atualizado com o passo 6.
- Quando `Turbo ambos` ou `Forcar filtro` usam `Local + VPS`, o Ops Control compara trabalho ativo e proxima missao dos dois ambientes. Se houver colisao resolvivel, ele chama `factory/force-next` em um lado antes de iniciar; se os dois ja estiverem no mesmo trabalho ativo, ele bloqueia o comando para evitar duplicidade.
- A aba localhost exige Docker local acessivel pelo processo do Ops Control. No compose, isso usa `/var/run/docker.sock`.
- O frontend em PM2 nao e controlado nesta primeira versao, porque o painel roda isolado em Docker e nao monta o ambiente PM2 do usuario host.
