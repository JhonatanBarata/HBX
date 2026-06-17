# 014 — OWNER: cockpit ÚNICO (`:3107`) + Ops Control headless

> Ordem do dono (17/06): "refaz o HBX Owner, não tá legal. Mantém SÓ o Sistema, apaga o
> resto, **sem abas** (página única). Regra: **não deixar vestígios**. Absorve tudo em 1 —
> escolha o que manter você mesmo." Decisão técnica assumida: **uma cara só = o cockpit do
> Owner (`:3107`)**; o Ops Control vira **motor SSH headless** (mantém `server.js`/API, perde
> a tela `public/`). NÃO mover SSH pra dentro do Owner (criaria vestígio/duplicação de `ssh2`).

## MAPA DE ENDEREÇOS (depois)
- `127.0.0.1:3107` — **única tela** (cockpit). FICA.
- `127.0.0.1:3099` — Ops Control: **só API** (SSH→VPS). Some a cara, fica o motor.
- bastidores que o cockpit consome sozinho: `:3000` backend · `:3098` Local Lab · `187.77.47.18` VPS.

## DESENHO DA PÁGINA ÚNICA (sem abas)
1. **Topo** — pills de status: agent · backend · Ops · VPS (mata a aba "Config") + tema.
2. **Pressão** — Local (RAM/CPU/disco NATIVO) | VPS (via Ops Control), cada lado com veredito.
3. **Radar ao vivo Local × VPS** — o que cada um raspa AGORA (cidade/segmento/modo), motores
   vivos/teto, fábrica on/off, e-mails 24h, bloqueios. Controles: Turbo (local/vps/ambos),
   filtro de canal, Forçar filtro, Cancelar, ligar/parar motores (local e VPS).
4. **Leads** — banco local+VPS (delta), Caçar e-mail (Email Lab), Exportar→VPS, Limpar lixo.
5. **Feed honesto** ao vivo (mantém `diffFeed`/`pushFeed`).
6. *(recolhido)* Containers + logs + Top processos.

## BLOCOS (curto, pro Sonnet; construir 1→5, depois demolir 6/7)
| # | Bloco | Arquivos |
|---|---|---|
| ✅ **014-1** | FEITO/verificado: casca única sem abas, pills de status (agent/backend/ops/vps), Pressão Local×VPS com veredito. (bônus: consertado bug do `server.js` que dava 404 em GET sem `/api`) | `web/index.html`, `web/app.js` |
| ✅ **014-2** | FEITO/verificado: Radar ao vivo Local×VPS (`/owner/radar-cockpit` cacheado 60s) + Turbo/Forçar/Cancelar (`/owner/ops/turbo`,`/force-filter`,`/cancel`). Botões de ação **não disparados** (testar c/ dono) | `server.js`, `web/index.html`, `web/app.js` |
| ✅ **014-3** | FEITO/verificado: Caçar e-mail via Email Lab (`/owner/email-lab/status`, `/owner/export` scope+mode, `/status/:id`, `/import`, `/cancel`) com métricas ao vivo. Caça real **não disparada** (testar c/ dono) | `server.js`, `web/index.html`, `web/app.js` |
| **014-4** | Feed honesto (porta o `diffFeed`/`pushFeed` atual pro novo layout) | `web/app.js` |
| **014-5** | *(recolhido)* Containers + logs + Top processos via Ops Control (`/api/containers`, `/api/logs/:name`, `/api/overview`) | `server.js`, `web/index.html`, `web/app.js` |
| ✅ **014-6** | FEITO/verificado: removidos endpoints+helpers de Hoje/Tickets/Caça-antiga/git/commands/runs/test/verify-prod; apagados `allowlist.json` (versionado) e `state/today.json`. `node --check` OK, **0 referências órfãs**, endpoints mantidos=200 / removidos=404. | `server.js`, `allowlist.json`, `state/` |
| ✅ **014-7** | FEITO/verificado AO VIVO: `express.static` removido, `public/` apagado, **`COPY public` tirado do Dockerfile** (vestígio que quebrava o build), `open-hbx-ops-control.ps1` não abre mais o browser. Container rebuildado e no ar: `GET /`→404 (sem tela), `/api`→200 (motor SSH vivo). Owner lê VPS (4168 leads) por ele. | `ops-control/server.js`, `ops-control/public/`, `ops-control/Dockerfile`, `ops-control/open-hbx-ops-control.ps1` |
|  | **Doc:** INFRA.md (Owner página única + Ops Control headless) e `hbx-owner/README.md` reescritos. **014 inteiro concluído** — pode apagar este doc quando quiser. | `docs/Rules/INFRA.md`, `hbx-owner/README.md` |

## INVARIANTES (não quebrar)
- Owner NUNCA: deploy/publish/new/force/migrations, shell livre, expor secret, liberar feature
  paga sem backend, apagar histórico negativo do Radar. (mantém destrutivos com confirmação)
- Demolição = só depois dos blocos 1→5 testados na tela (constrói o novo, prova, aí remove o velho).
- Ops Control segue como motor: a coluna VPS e o Export dependem dele.
