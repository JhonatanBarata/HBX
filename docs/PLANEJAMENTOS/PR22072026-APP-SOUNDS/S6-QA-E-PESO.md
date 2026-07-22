# S6 — QA no aparelho + veredito de peso

**Depende de:** S1–S5. Nada publica antes deste sprint fechar.

Áudio é a área onde build verde mente mais: compila, instala, e só o ouvido no aparelho revela
sobreposição, volume errado e som que não para.

## Roteiro no moto g15 (ADB — ver [[apk-teste-via-adb]])

Rodar o **dia inteiro simulado** em cada cenário, não só o evento isolado:

| Cenário | O que se checa |
|---|---|
| Fone de ouvido plugado | volume não estoura; o `arrival_alert_loop` não machuca o ouvido |
| Alto-falante + música tocando | dá pra ouvir o `delivery_complete` por cima; o rádio **não** é pausado (efeito não pede foco) |
| Chamada telefônica em curso | **nenhum** efeito toca (gate nº4 do S1) |
| Celular no silencioso | só a chegada toca (`USAGE_ALARM`); o resto cala |
| Bluetooth do carro | sons saem no carro, sem estouro nem corte da instrução de voz |
| Tela apagada / app em segundo plano | chegada toca; efeitos de UI não |
| Modo avião → reconectar | `offline_saved` … `sync_complete`, sem repique |

## Peso — medir e decidir

- [ ] APK antes: **1,58 MB**
- [ ] APK depois: **____ MB** (esperado ~1,79 MB)
- [ ] Delta real: **____ %**

**Veredito de mono:** os 16 OGG estão em estéreo 48 kHz; celular toca por um alto-falante só.
Converter para mono corta ~40% (pacote 218 KB → ~130 KB, APK ~1,71 MB).
Fazer **só se** o delta medido incomodar — o auto-update puxa o APK inteiro a cada release no 4G do
motorista, mas 200 KB não é o gargalo. Decisão registrada aqui, com número, não com achismo.

## Veredito de excesso (o mais importante)

Depois de um dia rodando, responder por escrito: **algum som irritou?**
Candidatos naturais a corte: `navigation_open`, `sync_pending`, `warning`.
Cortar som é barato (apagar o raw + a chamada); tirar depois que o motorista já reclamou é caro.

## Fecho

- [ ] `./gradlew assembleLogisticaRelease` + `testLogisticaReleaseUnitTest` verdes
- [ ] `npm run typecheck` onde tocou JS
- [ ] `check-pele` verde
- [ ] Nenhum arquivo de `masters-wav/` foi parar em `res/` (conferir com `git status`)
- [ ] Resumo do veredito (sons mantidos/cortados, peso final) escrito neste arquivo
- [ ] **Publish só com o dono mandando** — som é frente de aparência, não de emergência
