# PR21072026 — MONTAR ROTA (Play) com 4 opções + Leitura GPS de verdade

> ## ✅ EXECUTADO E PUBLICADO EM 21/07/2026
> Commits no master/origin: **`87af90ba`** (frente inteira) + **`40bd0454`** (fix do build).
> APK assinado publicado e validado no VPS (SHA-256 conferido entre build e destino);
> `version-logistica.json` no ar (auto-update do APK); backend/frontend recriados e
> saudáveis; migration `20260721210000_logistica_leitura_trilha` aplicada
> (`prisma migrate status` = "Database schema is up to date!"); Nest subiu limpo.
>
> **Como foi publicado:** `npm run publish` (full) **trava** enquanto existir worktree
> ativo em `.claude/worktrees/` — a etapa `removeNonMasterBranches` faz `git branch -D`
> e o git recusa apagar branch presa a worktree, abortando o deploy inteiro ANTES do
> build. Contornado com `npm run new` (selective), que pula essa limpeza e faz o mesmo
> commit→build→push→deploy→APK. **Não remover worktree de sessão paralela pra destravar.**
>
> **Bug de build achado e corrigido:** `LeituraTrilhaSync.kt` não compilava —
> **Kotlin aceita comentário de bloco ANINHADO**, e o KDoc citava rotas com glob
> (`tracking/*`, `leitura/*`); cada `/*` abria um nível novo que nunca fechava e o
> compilador engolia o arquivo até o EOF ("Unclosed comment"), derrubando as
> referências a `LeituraTrilhaSync` em `RotaService`/`NativeAppBridge`. Trocado por
> `tracking/…`. É o primo do já conhecido "`*/` em comentário CSS derruba o app".
>
> ### ⬜ Pendente
> **Nada foi testado no aparelho** (o dono pediu teste só no fim). Conferir no moto g15:
> (1) os 4 botões do menu cabem sem scroll; (2) transição menu→wizard manual; (3) jornada
> real de Leitura com trilha + popup de pausa; (4) primeira instalação pedindo permissão
> de GPS na hora do "Iniciar Leitura".


Escopo: APK entregador (`EntregaShell/app/src/logistica/assets/app/app.js` + `app.css` +
`RotaService.kt`). Seguir a CONSTITUIÇÃO (10 Leis) de `androidapk.md` à risca.
NÃO tocar nas edições paralelas do dono no working tree.

## O menu (dayHomeModal → 4 botões)

Ordem: **1º Rotas Salvas** (exigência do dono), depois Por dia, Criar Rota Manual,
Iniciar Leitura de Rota. Os botões "Iniciar Leitura de Rota" e "Criar rota manual"
SAEM da tela Rota (`leituraBanner`) e entram aqui.

## S1 — Menu Play com 4 opções (SIMPLES, front-only)

- `dayHomeModal()` passa a listar os 4 botões (moldura `.day-home` atual, cartão central — Lei 3).
- Remover os 2 botões soltos do `leituraBanner()` da tela Rota.
- `handleBack`: menu aberto → fecha (Lei 10). Transições Lei 9.

## S2 — Por dia VERTICAL com contagem (SIMPLES, front-only)

- Chips seg→dom viram LISTA VERTICAL; cada linha = dia + **quantidade de clientes
  agendados** naquele dia. Multi-seleção mantida (tocar = liga/desliga).
- Contagem calculada localmente por `diasEntrega` dos clientes (`ensureAllClientsLoaded`),
  com skeleton `loading()` enquanto carrega (Lei 7). Resto do fluxo (prévia, ordem,
  Gerar agora) intocado.

## S3 — Criar Rota Manual = wizard PRÓPRIO (SIMPLES, front-only)

Hoje: banner "Rota manual em andamento" em cima da tela Rota, com "Cancelar leitura"
(copy errada). Vira um passo a passo dele, em cartão central (`centerModal`, setas ‹›):

1. **Paradas** — buscar/adicionar clientes (telas já existem: picker + itens da leitura MANUAL).
2. **Ordem** — revisar/reordenar (▲▼ como no "Minha ordem").
3. **Nome e salvar** — nome sugerido + salvar como rota salva (fluxo `leitura-finalizar` atual).

- Zero backend novo: reusa a sessão `MANUAL` da leitura e os endpoints atuais.
- Copy própria: "Cancelar rota manual" (nunca "leitura"); loading em cada passo;
  nada renderizado por cima da tela Rota.
- `handleBack`: volta passo → fecha com confirmação se houver paradas (Lei 10 + `.app-confirm`).

## S4 — Iniciar Leitura de Rota (a parte GRANDE — GPS contínuo)

Base já existente: `RotaService.kt` (foreground type location, GPS 3s/5m, heads-up,
fila offline, haversine/raio). A Leitura vira um MODO desse serviço.

### S4a — Trilha + posição ao vivo
- Modo "leitura" no RotaService: grava amostras (lat/lng/ts/speed/accuracy) num buffer
  persistido (sobrevive a restart, padrão `RotaState.persistir`).
- Bridge service→WebView: app aberto mostra posição ao vivo + trilha desenhada no mapa
  já existente (transplante `el.__hbxMap`). Filtro de amostra: descartar accuracy > 35m.

### S4b — Detecção de pausa + popup HBX
- No service: velocidade < ~2 km/h E deslocamento < ~15m por ~50s contínuos → evento PAUSA.
  Histerese pra não redisparar no mesmo ponto; semáforo longo ainda pode dar falso
  positivo (limite aceito, mitigado pelo tempo).
- App na tela → popup central do HBX: **"Você parou — salvar parada?"** já carregando o
  cliente cadastrado mais próximo (haversine, raio ~60m — reuso do raio de chegada).
  Sem cliente perto → oferece o fluxo Cadastrar Local atual (reverse geocode já pronto).
- App em segundo plano → notificação heads-up (canal `chegada` existente) que, ao tocar,
  abre direto o popup. (Limite do Android: popup visual só com app na tela; fora dela é
  notificação — mesma mecânica da chegada de hoje.)

### S4c — Salvar rota + trilha
- Confirmar pausa = registra parada na sessão de leitura (ordem = ordem real da trilha).
- Finalizar = salva rota (fluxo atual de nome/rota salva) **+ trilha** (polyline
  simplificada, ex. Douglas-Peucker ~10m) → endpoint novo
  `POST /logistica/leitura/:id/trilha` + allowlist em `NativeApiClient.kt` + rebuild APK.
- Botão "Cadastrar Local" continua como captura manual (fallback quando não pausou).

### S4d — Fase 2 (não bloqueia)
- Nome das ruas da trilha ("quais ruas virou"): reverse geocode só nos pontos de parada
  é grátis e imediato; rua-a-rua da trilha inteira = snap/match em lote depois (OSRM),
  não em tempo real. Replay da trilha no mapa.

### Limites a explicar na tela (copy mínima, Lei 8)
- GPS urbano deriva 5–30m: a trilha é fiel ao caminho, não um mapa perfeito.
- Pausa ≠ 100%: parada longa em trânsito pode perguntar à toa (é só dispensar).
- Com a tela desligada o serviço continua gravando (notificação fixa obrigatória do Android).

## Ordem de execução e custo
S1+S2+S3 = 1 leva front-only (rápida). S4 = leva própria (Kotlin + 1 endpoint + rebuild
APK + teste via ADB no moto g15 — jornada real com trilha antes de dar por pronto).
Custo de API externa: R$0 (GPS nativo + Nominatim já usado).
