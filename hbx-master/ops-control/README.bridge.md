# HBX Master Ops Control Bridge

O HBX Master consome o Ops Control local em `http://127.0.0.1:3099`.

## Endpoints previstos

- `GET /api/overview`
- `GET /api/containers`
- `GET /api/logs/:name`
- `GET /api/radar-audit/vps`
- `GET /api/radar-audit/localhost`
- `GET /api/quick/:target/:action`

## Regra desta fase

O app usa leitura primeiro: overview, containers e Radar Audit. Acoes de restart ficam fora da UI inicial.
