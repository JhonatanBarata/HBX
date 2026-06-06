# HBX Master Ops Control Bridge

Ops Control roda localmente em:

```txt
http://127.0.0.1:3099
```

O codigo do Ops Control fica dentro do Master:

```txt
hbx-master/ops-control
```

O compose local do modulo fica em:

```txt
hbx-master/ops-control/docker-compose.yml
```

## Endpoints

- `/api/overview`
- `/api/containers`
- `/api/logs/:name`
- `/api/radar-audit/vps`
- `/api/radar-audit/localhost`
- `/api/quick/:target/:action`

## Seguranca

- Token obrigatorio.
- Sem shell livre.
- Acoes Docker precisam de allowlist.
- VPS via SSH fica isolado no Ops Control.
- Localhost via Docker local.

## Como aparece no HBX Master

- Saude VPS.
- Saude local.
- Containers.
- Logs.
- Radar Audit.
- Motores.
- Acoes rapidas futuras, com confirmacao.
