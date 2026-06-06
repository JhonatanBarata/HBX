# HBX Ops Control

Painel operacional local para controlar a VPS HBX via SSH, acessivel somente em `127.0.0.1:3099`.

Agora o painel tambem tem a area **Auditoria do Radar**, com abas:

- `VPS`: consulta Docker, logs e Postgres da VPS via SSH.
- `localhost`: consulta Docker, logs e Postgres da maquina local quando o socket Docker esta disponivel.

## Uso

```bash
echo "OPS_CONTROL_TOKEN=troque-por-um-token-grande" >> .env.ops-control
echo "OPS_CONTROL_TARGET=ssh" >> .env.ops-control
echo "OPS_CONTROL_SSH_HOST=187.77.47.18" >> .env.ops-control
echo "OPS_CONTROL_SSH_USER=root" >> .env.ops-control
echo "OPS_CONTROL_SSH_PASSWORD=sua-senha" >> .env.ops-control
docker compose --env-file .env.ops-control -f docker-compose.ops.yml up -d --build
```

Abra:

```text
http://127.0.0.1:3099
```

## Limites

- Nao existe endpoint de shell livre.
- Todas as APIs exigem `Authorization: Bearer <token>`.
- As acoes executam apenas comandos Docker allowlistados.
- A auditoria do Radar le apenas Docker, logs recentes e consultas SQL fixas de diagnostico.
- A aba localhost exige Docker local acessivel pelo processo do Ops Control. No compose, isso usa `/var/run/docker.sock`.
- O frontend em PM2 nao e controlado nesta primeira versao, porque o painel roda isolado em Docker e nao monta o ambiente PM2 do usuario host.
