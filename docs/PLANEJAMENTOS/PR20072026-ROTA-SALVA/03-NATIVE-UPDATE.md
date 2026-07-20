# 03 — AGENT-NATIVE (Sonnet) — Auto-update do APK (F4)

Escopo: SÓ `EntregaShell/app/src/main/java/**`, `EntregaShell/app/src/main/AndroidManifest.xml`,
`EntregaShell/app/build.gradle.kts`. NUNCA toque `assets/app/app.js` nem `backend/`. NÃO commite.
Leia `EntregaShell/AGENTS.md` se existir. Ao terminar, valide que compila:
`cd EntregaShell && ./gradlew :app:assembleLogisticaRelease --stacktrace` (ou reporte se o ambiente
não deixar; o Opus builda de qualquer forma).

## Contexto que JÁ existe (não reinventar)
- Ponte JS↔nativo: `NativeAppBridge.kt` exposta como `HBXAndroid` (MainActivity.kt:202).
  Já tem `appInfo()` devolvendo `versionName`/`versionCode`. Callbacks pro JS via
  `webView.evaluateJavascript("window.X && X.y(...)")` (padrão do `resolve()`).
- Manifesto já tem `FileProvider` (`${applicationId}.fileprovider`) e paths em `res/xml`.
- gradle flavor `logistica`: `versionCode = 5`, `versionName = "1.2.1"` (linhas ~100-101).
  minSdk 26, targetSdk 35. Device de teste = Android 15 (moto g15).

## Tarefa 1 — versão
- `build.gradle.kts` flavor logistica: bump `versionCode = 6`, `versionName = "beta1.3.0"`
  (esquema `beta1.x.x` pedido pelo dono). versionCode DEVE ser > 5 (instalado).
- **CONFIRME e reporte**: a assinatura do `logisticaRelease` usa uma keystore FIXA (signingConfig
  estável), não chave efêmera/debug gerada por build. Auto-update SÓ funciona se toda release for
  assinada com a MESMA chave. Se hoje não houver signingConfig de release dedicada, DOCUMENTE isso
  como bloqueador pro dono (não invente keystore nova).

## Tarefa 2 — permissão de instalar
- `AndroidManifest.xml`: adicionar `<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES"/>`.
- Garantir que o FileProvider cobre o diretório onde o APK baixado será salvo (ex.: `files/updates`
  ou cache). Se o `res/xml/*_paths.xml` não cobre, adicionar o path.

## Tarefa 3 — métodos novos na ponte (`NativeAppBridge.kt`)
Adicionar, todos gated `BuildConfig.APP_MODE == "logistica"`:
- `@JavascriptInterface fun updateInstallAllowed(): Boolean` — em API≥26
  `context.packageManager.canRequestPackageInstalls()`; senão true.
- `@JavascriptInterface fun openInstallPermission()` — abre
  `Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))`
  no `runOnUiThread` (try/catch ActivityNotFound → fallback ACTION_MANAGE_UNKNOWN_APP_SOURCES sem data).
- `@JavascriptInterface fun downloadAndInstall(url: String, sha256: String, versionName: String)`:
  - Em background (executor). Baixa o APK de `url` (só aceitar https e host == host de
    `BuildConfig.WEB_BASE_URL`/`API_BASE_URL` — trava anti-SSRF; rejeite outros hosts).
  - Emite progresso: `webView.evaluateJavascript("window.HBXUpdate&&HBXUpdate.onProgress(<pct>)")`.
  - Confere `sha256` do baixado; divergiu → `HBXUpdate.onError('arquivo corrompido')` e ABORTA.
  - Instala via **PackageInstaller** (Session API): write do APK na sessão, `commit`.
    - Em API≥31 (Android 12+): `session.setRequireUserAction(SessionParams.USER_ACTION_NOT_REQUIRED)`
      APÓS a primeira instalação (quando o app já é o installer de registro) → update SILENCIOSO.
      Na 1ª vez o sistema mostra o diálogo dele (inevitável) — está ok.
    - Use um `IntentSender` via `PendingIntent` + `BroadcastReceiver` pra receber
      STATUS_PENDING_USER_ACTION (dispara o Intent do sistema) e STATUS_SUCCESS/FAILURE
      (→ `HBXUpdate.onProgress(100)` / `onError`).
  - NUNCA logar o APK inteiro; timeouts sensatos; sem retry em loop.
- Registrar os métodos: já basta estarem em `NativeAppBridge` (a instância é adicionada como
  `HBXAndroid`). Confirme que não há allowlist de métodos que precise atualizar.

## Tarefa 4 — segurança
- `HbxWebBridgeSecurity.kt` / allowlist: se existir uma lista de métodos permitidos da ponte,
  incluir os 3 novos. Se a ponte for aberta (todos @JavascriptInterface valem), nada a fazer.
- O download só de host confiável (ver acima). O install só de arquivo com sha256 conferido.

## Entregar
- Resumo dos arquivos tocados.
- **Resposta explícita sobre a keystore** (Tarefa 1) — é o item que decide se F4 fecha E2E.
- Confirmar se compilou (ou o erro exato pro Opus resolver).
