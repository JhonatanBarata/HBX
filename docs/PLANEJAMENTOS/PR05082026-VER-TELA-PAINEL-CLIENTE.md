# PR05082026 — VER TELA + PAINEL DO CLIENTE no /master (o Pulso muda de casa)

Plano ditado pelo dono 05/08/2026 (madrugada), com 4 emendas aceitas na conversa.
Substitui a moradia do PULSO (PR04082026-PULSO-DO-APP): a ESCRITA do pulso fica,
a janela solta morre.

## 0. O plano do dono (literal)

1. Construir **VER TELA** de verdade (ver o que o cliente está vendo).
2. **Remover a janela "Pulso"** do /master e injetar DENTRO da empresa cliente:
   botão **"Ver tela"** ao lado do "Entrar como" — só clicável se o aparelho
   estiver online.
3. **Remover "Quem está online"** ("não serve pra uma bosta" — o André usou o
   app ontem e hoje e nunca apareceu lá).
4. **Painel bem feito do cliente**: aparelhos conectados na conta (NOMES),
   derrubar / remover aparelho, histórico.
5. **Consultas só no CLIQUE do cliente** — nada de ficar consultando direto.
6. Manter **histórico de ERROS que apareceram pro cliente** (dúvida dele → eu
   confirmei: é assim que o mercado faz).
7. APK: **ocultar "Rota" com o modo caderneta ligado**; quando todos os
   clientes estiverem ok, aviso: **"Clientes estão ok, gostaria de ativar o
   modo comum, e começar utilizar nosso GPS?"** (copy do dono = literal).

## 1. Por que o desenho está certo (o que o mercado faz)

- **"Ver tela" de app = SESSION REPLAY do próprio app** (LogRocket, Smartlook,
  UXCam): o app espelha as PRÓPRIAS telas — nunca MediaProjection/print do
  sistema (aquilo exige banner do Android e vê o celular INTEIRO; espelhar só o
  nosso app é telemetria padrão, com 1 linha na política + máscara de digitação).
- **Erro por sessão** (Sentry-like): guarda-se o que o USUÁRIO viu (toast
  vermelho/crash), pouco e com retenção curta — não log técnico infinito.
- **Tudo on-demand/batched**: detalhe caro só quando alguém CLICA; telemetria
  contínua só de carona em tráfego que já existe (nosso poll de 5s).
- "Quem está online" mentia porque olha SESSÃO WEB — o André só vive no APK.
  O pulso (APK) é a fonte da verdade de presença; por isso ele FICA.

## 2. Desenho

### V1 — Painel do cliente (ficha da empresa no /master), LAZY
Seção **"Aparelhos"** carregada SÓ ao abrir a ficha (1 query):
`GET /master/empresas/:companyId/aparelhos` → linha por aparelho:
**nome do aparelho** ("Motorola moto g15") · pessoa · pareado em DD/MM ·
versão · 🟢 no app / ⚪ fora do app (ultimaTelaAt < 15s) · tela atual ·
trilha do dia (expandir — reusa `trilhaDoDia`). Ações por linha:
- **Ver tela** — habilitado SÓ com 🟢 (V2);
- **Derrubar** — revoga a sessão (revokedAt + tokenVersion++), confirmação de
  2 cliques mostrando o NOME do aparelho (derrubar o e13 real do André no meio
  do dia é tiro no pé);
- **Remover** — derruba + some da lista (mata os pareamentos-fantasma 1.2.1 de
  julho). `hardwareId` fica no histórico (re-parear reconecta a MESMA vaga).
Morrem: a janela "Pulso" solta (`janela-pulso.tsx` vira componente da ficha) e
a janela "Quem está online".

### V2 — VER TELA (espelho do NOSSO app, on-demand)
1. Master clica "Ver tela" → `POST /master/aparelhos/:id/espelho` grava flag
   com TTL 60s (renovada a cada 10s enquanto o painel está aberto; fechar =
   morre sozinho).
2. O poll de 5s responde `espelho: true` pro aparelho marcado → o app começa a
   mandar snapshot compacto da tela (`POST /logistica/espelho/quadro`, a cada
   ~2s SÓ enquanto a flag vive): HTML sanitizado da tela atual (sem <script>,
   digitação mascarada) + nome da tela.
3. Painel renderiza a réplica (sandbox, CSS do app embutido 1×). Não é vídeo:
   é a tela reconstruída — leve, e só existe enquanto o dono está olhando.
4. Kotlin: endpoint novo na allowlist (`POST logistica/espelho/quadro`) — os
   TRÊS ou nada (app.js + allowlist + rebuild).
5. Política de privacidade ganha a linha da telemetria de tela do app.

### V3 — ERROS que o cliente viu (Sentry-lite)
- app.js: todo toast VERMELHO + erro JS global entra num buffer local
  (tela, mensagem, hora); vai DE CARONA no poll só quando houver novidade
  (campo `erros[]` opcional — mesmo contrato aditivo do `tela`).
- Backend: tabela leve `MobileErroTrilha` (companyId, deviceId, tela, msg,
  at) — retenção 7 dias, faxina lazy (mesmo padrão da trilha).
- Painel do cliente: "Erros recentes" (últimos 50). Escrita batched, leitura
  só no clique.

### V4 — APK: rota some + convite pro GPS
- Modo caderneta ON → a aba **"Rota" muda de RÓTULO para "Caderneta"** (mesma
  posição/ícone — geografia preservada; a tela do dia já é a caderneta).
  Emenda aceita: esconder a aba inteira quebraria a lei das MESMAS TELAS.
- **Medidor vira GLOBAL**: "Mapa: X de N" passa a contar TODOS os clientes com
  dia de entrega cadastrado (a base da agenda), não só o dia de hoje — é a
  régua do convite. `caderneta/resumo` ganha `base: {total, provados, pronto}`.
- **Convite** (100% da base provada, 1× por atingimento): centerModal com a
  copy LITERAL do dono: "Clientes estão ok, gostaria de ativar o modo comum,
  e começar utilizar nosso GPS?" → [Ativar GPS] = PATCH modoCaderneta=false
  (admin; rótulo volta a "Rota", fluxo normal) · [Agora não] = não repete até
  a base mudar (H.cache por marca d'água de N provados). Saída manual segue em
  Ajustes. Cliente avulso SEM dia cadastrado nunca trava o convite.

## 3. Fatias e ordem

V1 painel lazy + derrubar/remover (backend+web) → V4 APK (rótulo + medidor
global + convite; é o que o André vê primeiro) → V2 ver tela → V3 erros.
Backend sempre publica ANTES do APK (DTO aditivo); endpoints novos do app na
allowlist Kotlin.

## 4. Leis desta frente

- Consulta pesada SÓ no clique (lazy); o poll não engorda (espelho/erros só
  com flag/novidade).
- Espelho é do NOSSO app, nunca do aparelho; digitação mascarada por default.
- Derrubar/remover com confirmação nominal; remover não apaga trilha/erros.
- Copy do dono é literal; a palavra "pino" segue proibida em tela.
