# S2 — Leitura de Rota: GPS contínuo, trilha e detecção de pausa (lado NATIVO)

**Dono deste arquivo:** 1 subagente. Arquivos que VOCÊ pode editar:
`EntregaShell/app/src/main/java/br/com/hbxsystem/entrega/*.kt` (foco em `RotaService.kt`,
`RotaState.kt`, `NativeApiClient.kt`, `HBXShellBridge.kt`/`NativeAppBridge.kt`) e o backend
NestJS (endpoint novo da trilha).
**PROIBIDO editar `EntregaShell/app/src/logistica/assets/app/app.js` e `app.css`** — outro
agente é o dono desses dois arquivos nesta leva.

## Regras de convivência (há OUTRO agente trabalhando no app agora)
- **NÃO rodar teste, build, gradle, `npm run *`, ADB, docker.** Só editar código.
- **NÃO rodar git.** Tree com edições de terceiros — não reverta nada que não seja seu.
- Backend: leia `docs/Rules/BACKEND.md` antes de tocar. **Só ADICIONAR** — nada de
  refatorar módulo existente.

## O que já existe (base — NÃO reescrever)
`RotaService.kt` é um foreground service `type=location` em produção: GPS puro
(`LocationManager`, GPS_PROVIDER + NETWORK_PROVIDER, 3s/5m, sem Play Services), haversine
contra alvos, TTS + notificação heads-up de chegada, `RotaState` persistido (sobrevive a
restart), `TrackingOutbox`/`TrackingSync` pra fila offline. A Leitura de Rota é um **MODO
novo desse serviço**, reusando tudo isso.

---

## S2.1 — Modo LEITURA: gravar a trilha
- `RotaState` ganha uma sessão de leitura: `leituraId`, `ativa`, buffer de amostras
  `(lat, lng, ts, accuracy, speed)`. Persistido no mesmo esquema do `RotaState.persistir`
  (tem que sobreviver a restart do app/serviço).
- No `locationListener`: quando a sessão de leitura está ativa, gravar amostra.
  **Filtros** (senão a trilha vira rabisco): descartar `accuracy > 35m`; descartar salto
  que implique velocidade absurda (> 150 km/h); só gravar se andou > 8m do último ponto
  **ou** passaram > 15s.
- Teto de memória: buffer com limite (ex. 5.000 pontos) — ao encher, simplificar em
  memória (mantém a forma, joga fora ponto redundante).
- Notificação fixa do foreground: texto do modo leitura ("Gravando rota · N paradas") —
  copy mínima, sem jargão.

## S2.2 — Detecção de PAUSA
Regra: **velocidade < ~2 km/h E deslocamento < ~15m mantidos por ~50s contínuos** → dispara
evento PAUSA no ponto médio da janela.
- Histerese obrigatória: só rearma depois de o entregador voltar a se mover (> 40m do ponto
  da pausa). Nunca redisparar no mesmo lugar.
- Não disparar se a última pausa foi confirmada/dispensada há menos de ~60s.
- Ao disparar, calcular **o cliente cadastrado mais próximo** (haversine contra os alvos que
  o serviço já recebe, raio ~60m — reuse `RotaState.raioM`) e mandar junto no evento.

## S2.3 — Entregar o evento ao front (contrato de ponte)
Você **define e documenta** a ponte; o outro agente consome do lado JS. Contrato mínimo:
- App em primeiro plano → evento pro WebView (mesmo caminho que a chegada já usa):
  `{ tipo: "pausa", lat, lng, ts, clienteProximo: { id, nome, distanciaM } | null }`.
- App em segundo plano → **notificação heads-up** no canal `chegada` que já existe; tocar
  abre o app já com o evento pendente (a pausa não pode se perder: guarde-a em
  `RotaState` como "pendente" até o front confirmar ou dispensar).
- Posição ao vivo: expor a última amostra + a trilha acumulada pro JS ler (o front desenha
  no mapa que já existe). Formato enxuto: array de `[lat, lng]`.
- **Escreva o contrato final em `S2-CONTRATO-PONTE.md` nesta mesma pasta** — nomes exatos de
  método/evento/campo. É o que o front vai implementar; se ficar vago, a leva quebra.

## S2.4 — Salvar a trilha (endpoint novo)
- Backend: `POST /logistica/leitura/:id/trilha` recebendo a polyline
  (`[{lat,lng,ts}]`) da sessão. Simplificar antes de enviar (Douglas-Peucker, tolerância
  ~10m) — reduz payload em ~90% sem perder a forma do caminho.
- Persistir junto da sessão de leitura existente. Envio pela fila offline
  (`TrackingOutbox`), nunca bloqueando a UI.
- **Allowlist obrigatória** em `NativeApiClient.kt` (`normalizeAndAuthorizePath`, ~linha
  270-310): sem entrada lá o app leva 403 e ninguém entende por quê. Siga o padrão dos
  vizinhos (`method == "POST" && segments.size == 4 && … segments[3] == "trilha"`).

## Limites conhecidos (documente, não tente vencer)
- GPS urbano deriva 5–30m; a trilha é fiel ao caminho, não é mapa perfeito.
- Semáforo/engarrafamento longo pode disparar pausa falsa — é aceito, o usuário dispensa.
- Nome das ruas percorridas **fica pra fase 2** (reverse geocode ponto a ponto é caro/lento).
  Nesta sprint, rua só nos pontos de PARADA (o reverse já existe no front).

## Definição de pronto
Kotlin coerente e compilável à vista (sem rodar gradle), allowlist mexida, endpoint
adicionado, `S2-CONTRATO-PONTE.md` escrito. **Não teste, não builde, não commite** — relate
o que mudou por arquivo e o que ficou em aberto.
