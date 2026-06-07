# Passo 2 - Windows App ligado ao Ops Control

Data: 2026-06-07
Status: aplicado.

## Objetivo

Ligar o `HBX Owner > Ops Control` ao cockpit Local/VPS criado no `ops-control`, sem ainda remover a aba separada `Radar Motores`.

## Alteracao aplicada

Arquivo:

- `hbx-owner/windows-app/hbx_owner_app.py`

Mudancas:

- A aba `Ops Control` agora se apresenta como `Cockpit Local x VPS do scraping Radar`.
- O botao principal virou `Abrir cockpit`.
- A URL exibida agora usa o texto `Cockpit: ...`.
- O refresh da aba passou a consultar o endpoint:

```txt
GET /api/radar-cockpit
```

- O token e lido de `OPS_CONTROL_TOKEN`, primeiro do ambiente e depois de `.env.ops-control`.
- O token nao e mostrado na UI nem nos logs.
- A aba ganhou metricas nativas:
  - `Local`;
  - `VPS`;
  - `Containers`;
  - `Docker`;
  - `Atualizado`.
- O painel de eventos agora resume:
  - se local esta trabalhando/pronto/config/offline;
  - se VPS esta trabalhando/pronto/config/offline;
  - o que cada lado esta scrapeando;
  - motores rodando/total;
  - cards com email em 24h;
  - bloqueios em 24h;
  - query/contexto quando existir.

## Validacao

Executado:

```txt
python -m py_compile hbx-owner/windows-app/hbx_owner_app.py
```

Resultado: passou.

## O que ainda nao foi feito

Isto nao removeu a aba `Radar Motores`.

Esse sera o passo 3:

- remover `Radar Motores` de `TAB_NAMES`;
- remover o branch `_build_radar_engines_tab(frame)`;
- parar de usar `open_radar_owner_panel()` para motor;
- mover/consolidar os controles de motores dentro de `Ops Control`.

