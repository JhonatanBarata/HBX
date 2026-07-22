# Integração recomendada no HBX

## Melhor caminho

Integrar os sons no código-fonte e gerar um novo APK assinado.
Evite editar o APK pronto: isso exige remontagem, nova assinatura e pode quebrar
atualização, integridade ou compatibilidade com a instalação existente.

## Android

1. Copiar os `.ogg` para:

```text
EntregaShell/app/src/main/res/raw/
```

2. Criar um `HbxSoundEngine` com `SoundPool` para efeitos curtos.
3. Manter `MediaPlayer` apenas para:
   - `hbx_opening_signature`
   - `hbx_arrival_alert_loop`

4. Expor na `NativeAppBridge`:

```kotlin
@JavascriptInterface
fun playSound(key: String) {
    activity.runOnUiThread { soundEngine.play(key) }
}
```

5. A interface web pode chamar:

```javascript
window.HBXAndroid?.playSound?.("route_start");
```

## Pontos principais

- `OpeningActivity.startWebHandoffWhenReady()`:
  `hbx_opening_signature`
- Após `routeActivated()`:
  `hbx_route_start`
- Após `stopRoute()` / `pararLeituraTrilha()`:
  `hbx_route_stop`
- `ChegadaActivity.iniciarSom()`:
  substituir o alarme padrão por `hbx_arrival_alert_loop`
- Evento `hbx:leitura-pausa`:
  `hbx_pause_detected`
- Entrega concluída:
  `hbx_delivery_complete`
- Comprovante salvo:
  `hbx_proof_saved`
- Sincronização concluída:
  `hbx_sync_complete`
- Operação guardada offline:
  `hbx_offline_saved`
- Erro:
  `hbx_error`

## Preferência do usuário

Adicionar uma configuração:
- Sons do sistema: ligado/desligado
- Alertas críticos de chegada continuam separados

Assim o motorista pode desligar efeitos comuns sem perder o alerta de chegada.
