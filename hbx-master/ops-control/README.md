# HBX Master Ops Control

Painel operacional local do HBX Master para controlar a VPS HBX via SSH, acessivel somente em `127.0.0.1:3099`.

Este modulo fica dentro do Master:

```text
hbx-master/ops-control
```

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
docker compose --env-file .env.ops-control -f hbx-master/ops-control/docker-compose.yml --project-directory . up -d --build
```

Ou pelo script local do Master:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\hbx-master\ops-control\open-hbx-ops-control.ps1
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
