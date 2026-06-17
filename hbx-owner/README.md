# HBX Owner

Cockpit local do dono = **uma página só** (sem abas) servida pelo `local-agent` (Node, sem
SQLite). É a **única tela**: junta a sua máquina e a VPS num lugar.

## Como rodar

```powershell
npm run up
npm run owner:app
```

`owner:app` sobe o agent e abre `http://127.0.0.1:3107`. O token local é lido de
`HBX_OWNER_LOCAL_TOKEN` ou gerado/persistido em `hbx-owner/local-agent/.owner-token`
(gitignored).

Pra falar com o backend do produto (banco de leads, export, fábrica) e com a VPS (Ops
Control), o `start-owner.ps1` já injeta os tokens. Manualmente:

```powershell
$env:HBX_OWNER_BACKEND_URL="http://127.0.0.1:3000"
$env:HBX_OWNER_BACKEND_TOKEN="<jwt do master>"
$env:HBX_OWNER_OPS_TOKEN="<OPS_CONTROL_TOKEN do .env.ops-control>"
```

## O que a tela mostra (de cima pra baixo)

- **Topo** — pills de status: agent · backend · Ops · VPS + tema.
- **Pressão** — sua máquina (RAM/CPU/disco nativo) × VPS (via Ops Control), cada lado com veredito.
- **Motores & fábrica** — sua máquina (ligar/parar frota, Lab on/off, checks elástico/fábrica/turbo)
  × VPS (ligar/parar faixa, parar motor base, cancelar busca).
- **Radar ao vivo** — o que cada ambiente raspa AGORA (cidade/segmento/modo) + controles
  Turbo / filtro de canal / Forçar filtro / Cancelar.
- **Leads** — banco local × VPS, Exportar→VPS, Limpar lixo, e Caçar e-mail (Email Lab).
- **Feed honesto** — só a verdade derivada de deltas reais.

## Bridges (bastidores — você não abre nenhum)

- **Backend do produto** (`:3000`) — banco de leads, fábrica, export, clean.
- **Ops Control** (`:3099`) — **headless**, só API: SSH → VPS (pressão, motores, radar-cockpit,
  email-lab, cancelar). Não tem mais tela própria; o Owner é a única cara. Sobe com
  `docker compose -f docker-compose.ops.yml up -d`.
- **Local Lab** (`:3098`) — caça de e-mail local (ligado pelo botão "Ligar Lab").
- **VPS** (`187.77.47.18`) — produção, lida/controlada via Ops Control.

Sem `HBX_OWNER_OPS_TOKEN` (ou com `:3099` fora do ar), a coluna VPS / radar / email-lab
degradam com aviso — não quebram.

## O que o Owner NUNCA faz

- Liberar feature paga sem o backend autorizar.
- Expor secrets ou rodar shell livre.
- Deploy, publish, new, force ou migrations.
- Apagar histórico negativo do Radar.
