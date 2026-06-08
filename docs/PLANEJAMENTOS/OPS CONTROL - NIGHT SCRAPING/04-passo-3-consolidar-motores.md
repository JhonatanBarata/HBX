# Passo 3 - Motores consolidados em Ops Control

Data: 2026-06-07
Status: aplicado.

## Objetivo

Remover a aba separada `Radar Motores` do Windows App e consolidar os motores locais dentro da aba `Ops Control`.

## Alteracao aplicada

Arquivos alterados:

- `hbx-owner/windows-app/hbx_owner_app.py`
- `hbx-owner/windows-app/config.example.json`
- `hbx-owner/windows-app/README.md`

Mudancas no Windows App:

- `Radar Motores` foi removido de `TAB_NAMES`.
- O branch que criava `_build_radar_engines_tab(frame)` foi removido.
- O antigo construtor de aba virou painel interno: `_build_radar_engines_panel(...)`.
- A aba `Ops Control` agora inclui a seção `Motores locais do Radar`.
- A seção de motores reaproveita:
  - `GET /radar/engines/status`;
  - tabela de `hbx-engine-*`;
  - métricas total/rodando/parados/agent;
  - ação `Iniciar motor`;
  - ação `Parar container`;
  - logs do motor selecionado.
- O botão antigo `Abrir painel Master` foi removido.
- A função antiga `open_radar_owner_panel()` foi removida.
- A configuração `radar_owner_panel_url` saiu do default/config example/tela de config.

## Fluxo atual

```txt
HBX Owner
-> Ops Control
   -> Abrir cockpit Local x VPS
   -> Atualizar cockpit
   -> Containers monitorados
   -> Motores locais do Radar
   -> Eventos recentes
```

## Validacao

Executado:

```txt
python -m py_compile hbx-owner/windows-app/hbx_owner_app.py
```

Resultado: passou.

Busca de vestigios:

```txt
Radar Motores
Abrir painel Master
Painel Master
radar_owner_panel_url
bancodedados?tab=motores
```

Resultado: sem ocorrencias nos arquivos do Windows App/documentacao local alterados.

## Ainda falta

Passo 4:

- adicionar controles seguros de operacao:
  - `Turbo LOCAL`;
  - `Turbo VPS`;
  - `Turbo ambos`;
  - `Forcar filtro`;
  - `Cancelar scraping`.

