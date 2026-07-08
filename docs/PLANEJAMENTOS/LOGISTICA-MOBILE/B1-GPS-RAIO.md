# B1 — GPS da entrega realimenta o cadastro + raio de chegada configurável DE VERDADE

> Worker Sonnet. Trabalhar DIRETO no master (NUNCA criar branch/worktree/stash). Commit local por
> caminho (`git add <paths>`), mensagem `feat(logistica): ...`. **NÃO publicar.** Antes de começar:
> `git status` + conferir `origin/master` (trabalho paralelo do dono é comum). `casca.css` e
> `kit.css` estão sujos do dono — INTOCÁVEIS. Aprovado pelo dono 07/07 (brainstorm da logística).

## Defeitos a matar (achados na revisão de 07/07)
1. **Raio configurável ignorado**: `RAIO_CHEGADA_FALLBACK_M = 60` hardcoded em
   `frontend/src/app/entrega/page.client.tsx` (~linha 42 e ~101). O admin edita
   `LogisticaConfig.raioChegadaM` (backend + tela Ajustes M5) e o app do entregador nunca lê.
2. **GPS de ouro jogado fora**: o pino do cadastro vem de geocode Nominatim (impreciso no BR —
   número de casa raro no OSM) → geofence quase nunca dispara. Ao confirmar entrega, o app grava
   `deliveredLat/Lng` REAL da porta na `Entrega`… e NUNCA atualiza `CustomerProfile.lat/lng`.

## O que fazer
### Parte A — raio real no app
- `page.client.tsx`: buscar `GET /logistica/config` 1× no mount (best-effort; fallback 60 se
  falhar) e usar `raioChegadaM` no alvo do geofence. Sem tela nova — Ajustes já edita o valor.

### Parte B — realimentação de coordenada (backend, `confirmarEntrega` em
`backend/src/logistica/logistica.service.ts`)
- Migration ADITIVA (padrão N1, SQL à mão se shadow falhar): `CustomerProfile.geoFonte String?`
  — valores: `geocode` | `gps_cadastro` | `gps_entrega`.
- No cadastro/edição de cliente (endpoints do núcleo usados por `/entrega/clientes` — mapear onde
  lat/lng são gravados): quando a coord vier do fluxo "Usar este local" (GPS do aparelho), gravar
  `geoFonte='gps_cadastro'`; quando vier de geocode (CEP→Nominatim), `geoFonte='geocode'`. O front
  passa a enviar a origem junto (campo novo opcional no payload; front em
  `frontend/src/app/entrega/clientes/page.client.tsx` sabe qual caminho gerou a coord).
- No `confirmarEntrega`: se veio GPS válido com `accuracy <= 60` (adicionar `accuracy` opcional ao
  DTO/payload — o front captura de `geolocation` em `getPosicaoUma`, propagar) **e**
  `geoFonte != 'gps_cadastro'` → atualizar `CustomerProfile.lat/lng` + `geoFonte='gps_entrega'`.
  Última entrega vence (a porta converge). NUNCA sobrescrever coord marcada `gps_cadastro`.
  Best-effort FORA da transação do confirmar (falha aqui não pode reverter entrega) — mesmo padrão
  do `persistirDesfecho` existente.
- Front: `getPosicaoUma`/`useGeofence` em `entrega-hooks.ts` propagam `accuracy` no confirmar
  (`entrega-api.ts` ConfirmarPayload + `entrega-offline.ts` PendenciaPayload — aditivo, não quebrar
  itens já enfileirados).

## Guardrails
- NÃO tocar WhatsApp/cobrança/flags. NÃO mexer no motor de rota. Nada de loop/retry novo.
- Idempotência do confirmar INTACTA (replay por idempotencyKey não re-executa efeitos).
- Checks: `cd backend && npm run build` + `npx prisma validate` + testes do módulo logistica
  verdes (adicionar caso: confirmar com GPS atualiza coord de cliente `geocode`, NÃO atualiza
  `gps_cadastro`); `cd frontend && npx tsc --noEmit`; check-pele verde (não deve tocar CSS).

## Ao concluir
Gravar `B1-RESULTADO.md` (o que mudou, arquivos, checks) e APAGAR este arquivo. Commit local.
