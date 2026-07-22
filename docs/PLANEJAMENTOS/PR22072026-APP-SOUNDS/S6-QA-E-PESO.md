# S6 — QA no aparelho + veredito de peso

**Status: PARCIAL (22/07, madrugada).** Rodou o que dá pra rodar sem ouvido humano; o resto
depende do dono.

## Peso — MEDIDO

- APK antes: **1.582.222 bytes** (1,58 MB)
- APK depois: **1.819.478 bytes** (1,82 MB)
- Delta: **+237.256 bytes = +15,0%** (estimativa do plano era +13%; errei pra menos 2 pontos)

**Veredito de mono: NÃO fazer agora.** 237 KB num APK de 1,8 MB não é gargalo nenhum, e o
auto-update puxa isso uma vez por release. Converter pra mono economizaria ~95 KB e custaria
reprocessar 16 arquivos — só vale se o dono reclamar do peso do update no 4G.

## O que FOI verificado no moto g15 (ZF5255SMWF, via ADB)

- [x] `assembleLogisticaRelease` + `testLogisticaReleaseUnitTest` verdes
- [x] Backend `tsc` verde + 129 testes do módulo logística passando (5 novos no S7)
- [x] APK instalado e **abre sem crash** (OpeningActivity → MainActivity, zero FATAL no logcat)
- [x] Rota real de 94 paradas carregada, app funcional
- [x] Chip **Som** aparece à esquerda do GPS e abre a folha
- [x] Folha renderiza: mestra, **Voz do GPS** separada, 16 sons agrupados em PT-BR,
      "Aviso de chegada" primeiro com subtítulo `Essencial`, prévia `▶` em cada linha
- [x] **A prévia toca de verdade** — `AudioTrack: createTrack_l (frameCount 48000)` +
      `setOutputDevices` pro speaker no logcat. Isto é prova de áudio real, não de build verde.
- [x] Ajustes › Aplicativo mostra a linha **Sons · Ativo**

## Bug encontrado E CORRIGIDO no aparelho (commit `35ddfbce`)

O 3º chip empurrou a toolbar além do centro da tela e a marca `» HBX`
(`position:absolute`, centralizada) passou a ser **pintada por cima do chip Som**. Só apareceu
no device — a árvore de acessibilidade entregou: `.brand [372..557]` × chip Som `[477..565]`.
Marca voltou pro fluxo, à esquerda. Conferido depois: marca `[70..227]`, chip `[477..565]`.

⚠️ **Isso mudou a aparência do topo:** a marca saiu do centro e foi pra esquerda. É layout padrão
de app bar e era a única saída geométrica, mas é mudança visual que o dono não pediu —
reverter são 2 linhas de CSS.

## O que NÃO foi verificado (precisa de ouvido humano / campo)

- [ ] **Se os sons são bons e se algum irrita.** Eu ouço `AudioTrack` no log, não o som. O veredito
      de excesso do plano (candidatos a corte: `navigation_open`, `sync_pending`, `warning`)
      continua aberto e é do dono.
- [ ] Chegada real em campo: loop tocando, USAGE_ALARM no silencioso, voz 1,2 s depois do alerta
- [ ] Fone / bluetooth do carro / música tocando por cima
- [ ] Chamada telefônica em curso (gate nº4)
- [ ] Modo avião → reconectar (`offline_saved` … `sync_complete`)
- [ ] Fallback do alarme (apagar o raw à força e ver voltar o RingtoneManager)
- [ ] Trava de crédito do S7 com saldo 0 real (precisa de conta sem saldo)

## Pendências abertas herdadas dos outros sprints

1. **`pairing_success` não toca** — `PairingActivity` é Activity nativa pura, não passa pelo
   WebView. Precisa de chamada direta ao `HbxSoundEngine` lá dentro.
2. **`sync_complete` só cobre a fila da Leitura de Rota.** O outbox nativo de entregas
   (`OperationalSync`) não tem evento JS de "fila zerou" — precisaria de um `dispatchEvent` novo
   no Kotlin, no mesmo padrão do `hbx:leitura-pausa`.
3. **`warning` sem call site próprio** além do S7 — nenhum toast existente foi reclassificado
   (decisão do dono: o que é aviso e o que é erro).
