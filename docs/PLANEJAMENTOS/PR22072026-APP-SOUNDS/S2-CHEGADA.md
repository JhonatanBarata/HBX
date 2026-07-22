# S2 — Chegada (maior valor, maior risco de atropelo)

**Depende de:** S1.

Chegar no cliente é o único momento em que o app precisa gritar. Hoje já grita — só que com o
**alarme genérico do Android**, o mesmo som do despertador do motorista. Trocar por som próprio é
ganho real: ele reconhece "é o HBX" sem olhar.

## O que existe hoje (ler antes de mexer)

`ChegadaActivity.kt`:
- `iniciarSom()` (~linha 224): `RingtoneManager.getDefaultUri(TYPE_ALARM)` → `MediaPlayer`,
  `USAGE_ALARM` + `CONTENT_TYPE_SONIFICATION`, `isLooping = true`. Falha = segue só com vibração.
- `iniciarVibracao()`: `VibrationEffect.createWaveform(PADRAO_VIBRACAO, 0)` (loop).
- `pararSomEVibracao()` chamado em `ignorar()`, no abrir e no `onDestroy`.

`RotaService.kt` (~linha 317): `tts?.speak("Chegou: $nome", QUEUE_ADD, …)`.

**Ou seja: alarme em loop + vibração em loop + voz, tudo ao mesmo tempo.** Somar `arrival_confirm`
em cima disso sem pensar = barulheira.

## Mudança 1 — trocar a fonte do alarme

Em `iniciarSom()`, trocar o `RingtoneManager` por `R.raw.hbx_arrival_alert_loop`:

```kotlin
val uri = Uri.parse("android.resource://$packageName/${R.raw.hbx_arrival_alert_loop}")
```

**Preservar tudo o mais como está:** `USAGE_ALARM` (atravessa o modo silencioso e sobe no volume de
alarme, não no de mídia), `isLooping = true`, o `try/catch` que já garante "som nunca derruba a
Activity", e o `pararSomEVibracao()` intacto.

**Fallback obrigatório:** se `prepare()` falhar com o raw (arquivo corrompido, codec do aparelho),
cair no `RingtoneManager` de antes — chegada é crítica, não pode emudecer por causa de um OGG.

## Mudança 2 — dedupe com a voz

`arrival_alert_loop` (crítico, loop) e o `"Chegou: $nome"` do `RotaService` disputam o mesmo instante.
Regra: **alerta primeiro, voz depois** — o alerta é o que faz ele olhar; a voz diz quem é.

Implementação mínima: o `RotaService` já dispara a voz; atrasar essa fala em ~1,2 s
(`Handler.postDelayed`, cancelado se a chegada for ignorada/atendida antes). Nada de `QUEUE_ADD`
disputando com o loop.

## Mudança 3 — `arrival_confirm` (quando ELE responde)

`arrival_confirm` **não** é "chegou". É o *"ok, entendi"* de quando o motorista abre a entrega a
partir da chegada: para o loop e toca o confirm curto. Isso fecha o ciclo sonoro (grita → ele
responde → silencia com um "ok"), que é exatamente o que evita a sensação de alarme burro.

- Ao abrir a entrega pela ChegadaActivity: `stopSound(arrival_alert)` → `play(arrival_confirm)`.
- Em `ignorar()`: só para, **sem** confirm (ignorar não é confirmar).

## Aceite do S2

- [ ] moto g15 via ADB: simular chegada → toca o som HBX (não o alarme do sistema), em loop
- [ ] Volume de alarme baixo/celular no silencioso: **ainda toca** (USAGE_ALARM preservado)
- [ ] Abrir a entrega: loop para na hora, toca o confirm, **nada continua tocando**
- [ ] Ignorar: para tudo, sem confirm
- [ ] A voz "Chegou: X" vem **depois** do alerta, não junto
- [ ] Renomear/apagar o raw à força (teste de fallback) → volta o alarme padrão, sem crash
