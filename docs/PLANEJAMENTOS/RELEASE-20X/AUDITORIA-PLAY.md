# AUDITORIA-PLAY — EntregaShell → app único HBX na Google Play

Data: 11/07/2026 · Auditor: só-leitura (nenhum arquivo de código alterado)
Escopo: `EntregaShell/` completo + superfícies de compra no `frontend/src` (billing policy da Play).
Premissas (decisões do dono, não re-abertas): app Android ÚNICO do HBX; `applicationId` definitivo `br.com.hbxsystem`; GPS/rota só no módulo logística; modelo credit/enterprise.

Classificação usada: **PRONTO** | **CORRIGIR** | **VALIDAR-EM-APARELHO** | **DECLARAR-CONSOLE** | **BLOQUEADOR-UPLOAD** | **BLOQUEADOR-PRODUCAO**.

---

## 0. Veredito

O shell é pequeno, bem escrito e defensivo (allowlist de host, SSL falha-fechado, sem debug do WebView, sem `ACCESS_BACKGROUND_LOCATION`). O que separa ele da Play são 4 grupos: (1) **identidade/assinatura** — applicationId errado pra decisão do dono e keystore com senha COMITADA no repo; (2) **targetSdk 34** — Console recusa app novo abaixo de 35 (e a régua vira 36 em 31/08/2026); (3) **billing** — o app web exibe compra de créditos via Mercado Pago (bem digital) em 5 superfícies que o modo-shell precisa esconder; (4) **formulários do Console** — foreground service location, full-screen intent, data safety, política de privacidade e **URL de exclusão de conta (hoje não existe no produto)**.

---

## 1. Bloqueadores (resumo)

| # | Item | Classe | Prova |
|---|------|--------|-------|
| 1 | Keystore + senha comitados no git (senha em claro no gradle e em `SENHA.txt`; `.jks` trackeado) | **BLOQUEADOR-PRODUCAO (P0 segurança)** | `EntregaShell/app/build.gradle.kts:21-28`; `git ls-files` inclui `EntregaShell/keystore/hbx-entrega.jks` e `EntregaShell/keystore/SENHA.txt` |
| 2 | `applicationId = "br.com.hbxsystem.entrega"` ≠ decisão batida `br.com.hbxsystem` (id é IMUTÁVEL após 1º upload) | **BLOQUEADOR-UPLOAD** | `EntregaShell/app/build.gradle.kts:11` |
| 3 | `compileSdk = 34` / `targetSdk = 34` — Play exige 35 p/ app novo (36 a partir de 31/08/2026) | **BLOQUEADOR-UPLOAD** | `EntregaShell/app/build.gradle.kts:8,13` |
| 4 | Compra de créditos (bem digital) via Mercado Pago visível no app — viola Play Billing; 5 superfícies mapeadas na §7 | **BLOQUEADOR-PRODUCAO (P0 comercial)** | `frontend/src/components/hbx/credits-wallet-section.tsx:242-315` e §7 |
| 5 | Não existe fluxo/página de exclusão de conta — exigência da Play p/ app com criação de conta (Data safety não fecha sem a URL) | **BLOQUEADOR-PRODUCAO** | grep `excluir conta|delete account` em `frontend/src` → 0 hits |
| 6 | Play só aceita `.aab` — repo hoje só produz/versiona APK (`dist/hbx-entrega.apk` comitado) | **BLOQUEADOR-UPLOAD** (resolvido com `gradlew bundleRelease`) | `git ls-files` → `EntregaShell/dist/hbx-entrega.apk` |

---

## 2. Assinatura e keystore — P0

`EntregaShell/app/build.gradle.kts:21-28`:

```kotlin
signingConfigs {
    create("release") {
        storeFile = file("../keystore/hbx-entrega.jks")
        storePassword = "cFTUN9ZRRDteImsOFDE40bizNPF6JrS"   // linha 24
        keyAlias = "hbx-entrega"
        keyPassword = "cFTUN9ZRRDteImsOFDE40bizNPF6JrS"    // linha 26
    }
}
```

- O comentário nas linhas 18-20 registra que foi decisão consciente pra fase sideload ("app de 1 motorista, repo privado"). Pra sideload era aceitável; **pra Play é P0**: quem tiver o repo assina como o app.
- **BLOQUEADOR-PRODUCAO** — plano de correção (nenhum drama, o app nunca foi publicado):
  1. Gerar **upload key NOVA** fora do repo (`keytool`), guardada fora do git (gerenciador de senha / cofre).
  2. Aderir ao **Play App Signing** no primeiro upload (Google guarda a app key; a upload key pode ser trocada se vazar).
  3. Trocar o `signingConfigs` para ler de `keystore.properties`/variáveis de ambiente **fora do controle de versão** (padrão de mercado).
  4. Higiene: remover `keystore/hbx-entrega.jks`, `keystore/SENHA.txt` e `dist/hbx-entrega.apk` do tracking (a chave velha fica queimada de qualquer forma; como o `applicationId` da Play será outro, não há impacto no app publicado).
- **PRONTO** (ponto positivo): a chave comitada nunca tocou a Play — começar com id novo + chave nova zera o risco herdado.

---

## 3. Build config (gradle)

| Item | Hoje | Precisa | Classe | Prova |
|------|------|---------|--------|-------|
| compileSdk / targetSdk | 34 / 34 | **35 / 35** (mirar 36 se upload ficar p/ depois de 31/08/2026) | BLOQUEADOR-UPLOAD | `app/build.gradle.kts:8,13` |
| AGP | 8.4.2 | **8.7.x** (8.6.0 é o mínimo que suporta compileSdk 35 sem warning) | CORRIGIR | `EntregaShell/build.gradle.kts:3` |
| Gradle wrapper | 8.7 | **8.9+** (exigência do AGP 8.7) | CORRIGIR | `gradle/wrapper/gradle-wrapper.properties:3` |
| Kotlin | 1.9.24 | ok com AGP 8.7 (2.0.x opcional) | PRONTO | `EntregaShell/build.gradle.kts:4` |
| minSdk | 26 | ok (~98% devices) | PRONTO | `app/build.gradle.kts:12` |
| versionCode/Name | 1 / "1.0" | ok p/ 1º upload | PRONTO | `app/build.gradle.kts:14-15` |
| Java/JVM target | 17 | ok | PRONTO | `app/build.gradle.kts:37-44` |
| `isMinifyEnabled = false` | sem R8 | aceito pela Play (só warning de ofuscação). Se ligar depois: keep rules p/ `@JavascriptInterface` (HBXShellBridge) | PRONTO (nota) | `app/build.gradle.kts:32` |
| deps (`core-ktx 1.13.1`, `appcompat 1.7.0`, `webkit 1.11.0`) | ok | compatíveis com 35; `core-ktx 1.15+` só APÓS compileSdk 35 | PRONTO | `app/build.gradle.kts:48-50` |

**Atenção ao subir targetSdk 35 (Android 15): edge-to-edge vira FORÇADO.** A MainActivity monta o WebView em `MATCH_PARENT` sem tratamento de insets (`MainActivity.kt:59-63,119`) — com targetSdk 35 o conteúdo web fica por baixo da status bar/gesture bar. Correção barata: `ViewCompat.setOnApplyWindowInsetsListener` no WebView aplicando padding top/bottom (ou `fitsSystemWindows`). **CORRIGIR junto com o bump + VALIDAR-EM-APARELHO.**

---

## 4. AndroidManifest.xml — permissão a permissão

Arquivo: `EntregaShell/app/src/main/AndroidManifest.xml`

| Linha | Permissão | Avaliação | Classe |
|-------|-----------|-----------|--------|
| 4 | `INTERNET` | necessária | PRONTO |
| 5 | `ACCESS_FINE_LOCATION` | runtime pedida (`MainActivity.kt:155-158`); usada pelo geofence nativo | PRONTO (ver bug de fluxo §5.1) |
| 6 | `ACCESS_COARSE_LOCATION` | declarada no manifest mas **NÃO entra no request runtime** — em Android 12+ o usuário que escolher "aproximada" deixa FINE eternamente negado e o fluxo trava (§5.1) | CORRIGIR |
| — | `ACCESS_BACKGROUND_LOCATION` | **AUSENTE — e isso é ÓTIMO, manter assim.** Foreground-only dispensa o formulário mais duro da Play. Nenhum código pede background (confirmado: nenhum hit no shell) | PRONTO |
| 7 | `POST_NOTIFICATIONS` | runtime pedida em API 33+ (`MainActivity.kt:160-165`) | PRONTO |
| 8 | `RECORD_AUDIO` | pedida em runtime (`MainActivity.kt:168-172`) p/ voz via Web Speech — **mas Web Speech API (SpeechRecognition) não é exposta pelo WebView do Android** (só Chrome). O front é feature-detected (`frontend/src/app/entrega/voz.ts:48-54,91`): dentro do shell o ctor tende a ser `null` → voz muda → permissão de mic pedida SEM uso = red flag em review/data safety. O `onPermissionRequest` do shell cobre `getUserMedia` (WebRTC), não SpeechRecognition | **VALIDAR-EM-APARELHO** (se a voz não funcionar: remover RECORD_AUDIO do manifest OU implementar `SpeechRecognizer` nativo na bridge) |
| 9-10 | `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION` | corretas p/ o RotaService (`foregroundServiceType="location"` no manifest:46 e `startForeground` tipado `RotaService.kt:278-284`) | PRONTO no código + **DECLARAR-CONSOLE** (formulário de FGS com vídeo demo) |
| 11 | `USE_FULL_SCREEN_INTENT` | Android 14+ não pré-concede p/ app que não é alarme/chamada; o código já trata: `canUseFullScreenIntent()` + `ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT` (`MainActivity.kt:200-216`), e a notificação de chegada tem `setFullScreenIntent` (`RotaService.kt:241`) com fallback heads-up | PRONTO no código + **DECLARAR-CONSOLE** (declaração de full-screen intent) |
| 12 | `WAKE_LOCK` | usada via `FLAG_KEEP_SCREEN_ON`/TTS | PRONTO |
| 13 | `SYSTEM_ALERT_WINDOW` | overlay p/ takeover de chegada; pedida no máx 1x por processo (`MainActivity.kt:177-189`), checada antes de usar (`RotaService.kt:196`), **com fallback completo se negada** (heads-up + full-screen intent) | PRONTO (justificar na review se questionado; fallback existe) |
| 14 | `VIBRATE` | ChegadaActivity | PRONTO |

Outros pontos do manifest:

| Linha | Item | Avaliação | Classe |
|-------|------|-----------|--------|
| 17 | `android:allowBackup="true"` | Sessão (localStorage/cookies do WebView) entra no auto-backup do Google → token de login restaurável em outro device/extraível. Trocar para `allowBackup="false"` **ou** manter true com `android:dataExtractionRules`/`fullBackupContent` excluindo `app_webview/` | CORRIGIR |
| 20 | `usesCleartextTraffic="false"` | mixed content já morre no default do WebView (NEVER_ALLOW) + https only | PRONTO |
| 23-32 | MainActivity `exported=true` + LAUNCHER, `singleTask` | correto | PRONTO |
| 34-42 | ChegadaActivity `exported=false`, `singleInstance`, `excludeFromRecents`, `showWhenLocked`, `turnScreenOn`, `taskAffinity=""` | padrão certo de takeover | PRONTO |
| 44-47 | RotaService `exported=false`, `foregroundServiceType="location"` | correto | PRONTO |
| — | `android:screenOrientation` ausente na MainActivity | rotação DESTRÓI a activity → WebView recriado → `loadUrl` do zero no meio da rota (perde estado da SPA). App de motorista: lock `portrait` é o padrão de mercado (1 linha) ou `configChanges` | CORRIGIR |
| — | Sem intent-filter `VIEW` p/ `https://www.hbxsystem.com.br` (App Links) | links do site abrem no navegador, não no app. Opcional p/ fase 2 (exige `assetlinks.json` no site) | CORRIGIR (opcional, fase 2) |
| — | `<queries>` ausente | ok — o shell usa `startActivity` direto com try/catch (não filtrado por package visibility); `resolveActivity` não é usado | PRONTO |

---

## 5. Código Kotlin — arquivo a arquivo

### 5.1 `MainActivity.kt` (218 linhas)

- **URL carregada**: `https://www.hbxsystem.com.br/entrega` (`MainActivity.kt:35`) — gap p/ app único na §6.
- **Allowlist de host**: `www.hbxsystem.com.br` + `hbxsystem.com.br` (`:36-37`); `shouldOverrideUrlLoading` mantém http(s) do host no WebView e MANDA TODO O RESTO pra Intent externa com try/catch de `ActivityNotFoundException` (`:95-115`). **PRONTO** — é exatamente o desenho certo (Maps/Waze/wa.me/tel: abrem fora; WebView nunca navega pra origem estranha).
- **Mic gateado por host**: `onPermissionRequest` só concede `RESOURCE_AUDIO_CAPTURE` quando a página atual é do host (`:80-92`). **PRONTO** (design); utilidade real depende da validação do Web Speech (§4 linha 8).
- **Geolocation do WebView**: `onGeolocationPermissionsShowPrompt` concede pra QUALQUER origin (`:71-78`) — hoje o risco é baixo (navegação presa no host), mas um iframe de terceiro poderia pedir geo e ganhar. Aplicar o mesmo padrão do áudio (checar origin contra allowlist). **CORRIGIR** (hardening de 3 linhas).
- **Tratamento de erro/offline**: NÃO há `onReceivedError`/`onReceivedHttpError` — abrir sem rede mostra a página de erro cinza do WebView (`net::ERR_INTERNET_DISCONNECTED`) sem retry. Pra review da Play (que testa em condições ruins) e pra motorista em área rural: tela offline mínima com botão "tentar de novo". **CORRIGIR**.
- **Debug do WebView**: `setWebContentsDebuggingEnabled` nunca é chamado → produção não é inspecionável via chrome://inspect. **PRONTO** (correto).
- **Persistência de login**: `domStorageEnabled=true` (`:65`) + `CookieManager.flush()` no onPause (`:135`) → localStorage/cookies sobrevivem a restart. Login persiste (confirmado em uso real do APK sideload). **PRONTO**.
- **SSL**: `onReceivedSslError` NÃO sobrescrito → default cancela o load (falha fechada). **PRONTO** — a Play REJEITA apps que chamam `proceed()` em erro SSL; não sobrescrever é o certo.
- **BUG de fluxo de permissões** (`pedirPermissoesFaltantes`, `:153-192`): o `return` da linha 175 segura overlay/full-screen-intent enquanto QUALQUER permissão do lote (FINE, POST_NOTIFICATIONS, **RECORD_AUDIO**) estiver negada. Cenários reais:
  - Usuário nega o MIC (opcional por definição — comentário `:166-167` diz "negar não bloqueia nada") → `faltando` nunca esvazia → **overlay e full-screen-intent NUNCA são pedidos** → takeover de chegada degrada pra sempre, silenciosamente (após 2 negas o Android nem mostra mais diálogo).
  - Android 12+: usuário escolhe localização "aproximada" → FINE fica negado pra sempre → mesmo efeito.
  **CORRIGIR**: tratar mic como opcional de verdade (fora do gate), pedir FINE+COARSE juntas e aceitar COARSE como satisfeito (o RotaService já opera com NETWORK_PROVIDER, `RotaService.kt:171-179`).
- **onBackPressed**: `canGoBack()` → `goBack()` (`:139-145`). **PRONTO** (funciona com o history da SPA; deprecação do callback não bloqueia).
- **Chegadas**: listener registrado no onResume + drenagem de pendências (`:123-131`) casa com o contrato do front (`page.client.tsx:464-465`). **PRONTO**.

### 5.2 `RotaService.kt` (322 linhas)

- Foreground type location correto: canal + `startForeground(..., FOREGROUND_SERVICE_TYPE_LOCATION)` em Q+ (`:278-284`); notificação persistente LOW/silenciosa (`:265-276`). **PRONTO**.
- Start/stop: `sync()` via `startForegroundService` (chamado só com app em foreground, via bridge — ok com restrição do Android 12+); stop com debounce de 4s pra rajada clearRota→setRota do web (`:43,63-67,102-117`). **PRONTO** (bom design).
- GPS sem Play Services (LocationManager GPS+NETWORK, 3s/5m) com checagem de permissão antes de registrar (`:157-184`). **PRONTO**.
- **Recuperação de processo INCOMPLETA**: `START_STICKY` (`:116`) renasce o serviço após kill, mas `RotaState` é memória pura → renasce com 0 alvos, GPS ligado, notificação "0 paradas" — zumbi drenando bateria até o usuário reabrir o app. **CORRIGIR**: no `onStartCommand`/restart, se `RotaState.alvos.isEmpty()` → `stopSelf()` (3 linhas) ou persistir a rota em disco. Também conta pra review (FGS rodando sem função visível).
- Takeover só quando app NÃO está em foreground (`temListenerAtivo`, `:194`), com heads-up + overlay condicionado a `canDrawOverlays` (`:195-207`) e fallback se negado. **PRONTO**.
- TTS/notificações best-effort com try/catch. **PRONTO**.

### 5.3 `ChegadaActivity.kt` (279 linhas)

- `showWhenLocked`/`turnScreenOn` com fallback legado pra API 26 (`:76-91`), immersive best-effort (`:92-102`). **PRONTO**.
- Som de alarme + vibração em loop com auto-stop 45s (`:45,60`), para em onPause/onDestroy (`:63-72`). **PRONTO**.
- Fallbacks se permissão negada: a activity só é lançada quando `canDrawOverlays` OU via full-screen-intent da notificação; negado tudo → sobra heads-up + TTS (`RotaService.kt:194-208`). **PRONTO**.
- Cores hardcoded (`:109-111`) — é app nativo, fora das 5 Leis do front. Sem impacto Play. **PRONTO**.

### 5.4 `HBXShellBridge.kt` (69 linhas) — API JS exposta (contrato pro front)

| Método | Assinatura | O que faz | Prova |
|--------|-----------|-----------|-------|
| `setRota` | `(json: String)` | substitui estado inteiro da rota no GPS nativo; JSON `{raioM, paradas:[{id,nome,lat,lng}]}`; liga/desliga o RotaService conforme lista | `HBXShellBridge.kt:19-44` |
| `clearRota` | `()` | desliga o serviço (com debounce no service) | `:46-54` |
| `abrirMaps` | `(url: String)` | Intent ACTION_VIEW externa (Maps/Waze) | `:56-64` |
| `versao` | `(): String = "1.0"` | feature-detect da casca | `:66-67` |

- Espelho web: `frontend/src/app/entrega/shell-bridge.ts:25-30` (interface idêntica) — `window.HBXShell` é injetado GLOBALMENTE em toda página carregada no WebView (`MainActivity.kt:68`), então **`shellDisponivel()` já serve de gate "estou no app Android" pra qualquer rota do app único** (inclusive pra esconder billing, §7).
- Tudo em try/catch, JSON validado campo a campo, ids vazios/NaN descartados (`:26-33`). **PRONTO**.
- **Sugestão barata p/ app único**: (a) bump `versao()` → "2.0" no build Play; (b) acrescentar sufixo no User-Agent (`settings.userAgentString += " HBXShell/2"`) pra front SSR e backend enxergarem o shell sem depender de JS — vira o gate confiável do modo-Play. **CORRIGIR (recomendado, 2 linhas)**.

### 5.5 `RotaState.kt` / `Parada.kt`

- Singleton thread-safe (`@Volatile`/`synchronized`/set sincronizado), semântica clear-vs-setRota documentada pra rajada do useEffect do web (`RotaState.kt:12-18,40-56`), pendências drenadas no onResume (`:87-91`). **PRONTO**.
- Estado só em memória — vira o problema do restart STICKY (§5.2). CORRIGIR lá.

### 5.6 Recursos

- Ícone é PLACEHOLDER (círculo branco sobre fundo, comentário admite "Sem arte por enquanto" — `app/src/main/res/drawable/ic_launcher_foreground.xml:2`). Play exige ícone real no app + 512×512 + feature graphic na ficha. **CORRIGIR**.
- `app_name = "Entrega HBX"` (`res/values/strings.xml:3`) — app único deve chamar "HBX System" (ou o nome que o dono bater). **CORRIGIR**.
- Só adaptive icon anydpi-v26 (ok com minSdk 26). **PRONTO**.

---

## 6. GAP pro APP ÚNICO (carregar a raiz, não /entrega)

Hoje: `ENTREGA_URL = "https://www.hbxsystem.com.br/entrega"` (`MainActivity.kt:35`). A porta única já existe no front: `/` decide landing × app logado via `AUTH_BOOT` inline que lê o token do localStorage e faz `location.replace("/dashboard")` (`frontend/src/app/page.tsx:19,47`) — **funciona dentro do WebView** (localStorage + domStorage ligados). Mudanças mapeadas:

| # | Mudança | Onde | Custo |
|---|---------|------|-------|
| 1 | `ENTREGA_URL` → `https://www.hbxsystem.com.br/` | `MainActivity.kt:35` | 1 linha |
| 2 | `applicationId` → `br.com.hbxsystem` (namespace pode FICAR `br.com.hbxsystem.entrega` — só o id importa na Play; evita refactor de packages) | `app/build.gradle.kts:11` | 1 linha |
| 3 | `app_name` → nome único + ícone real | `strings.xml:3`, `ic_launcher_foreground.xml` | arte |
| 4 | GPS/rota só no módulo logística | **JÁ É ASSIM DE GRAÇA**: o RotaService só liga quando o web chama `HBXShell.setRota` — e só o `/entrega` chama (`frontend/src/app/entrega/page.client.tsx:283-292`). Nenhuma flag nativa necessária | zero |
| 5 | Upload de arquivos (`<input type=file>`): `onShowFileChooser` NÃO implementado → uploads (logo da empresa, anexos do atendimento) morrem silenciosamente no app único | `MainActivity.kt:70-93` (WebChromeClient) | ~30 linhas |
| 6 | Download (export CSV/relatórios): `DownloadListener` não setado → downloads não acontecem | `MainActivity.kt:59-117` | ~20 linhas ou validar que não há download no fluxo mobile |
| 7 | `window.open`/target=_blank (8 arquivos no front usam: vendas, leads, master, dashboard/website, tutorial, fechar-venda — ex. wa.me) — com `setSupportMultipleWindows` default (false) o WebView navega a própria janela e o `shouldOverrideUrlLoading` manda pra Intent externa; PROVAVELMENTE funciona, mas é o tipo de coisa que varia por versão de WebView | grep `window.open` em `frontend/src` | **VALIDAR-EM-APARELHO** (wa.me, maps, preview do site) |
| 8 | Deep links / App Links do domínio (abrir link do site direto no app) | manifest + `/.well-known/assetlinks.json` | fase 2, opcional |
| 9 | Edge-to-edge do targetSdk 35 (insets no WebView) | §3 | ~10 linhas |
| 10 | Teclado sobre inputs (login etc.): `windowSoftInputMode` não declarado | manifest | VALIDAR-EM-APARELHO |
| 11 | Mixed content/SSL | cleartext off + default NEVER_ALLOW + SSL falha-fechado | PRONTO |
| 12 | Links externos abrindo fora | allowlist já cobre (`MainActivity.kt:95-115`) | PRONTO |

---

## 7. BILLING POLICY DA PLAY — P0 comercial

Regra: créditos HBX = **bem digital consumido dentro do app** → dentro de app distribuído na Play, a compra TEM que ser via Play Billing (30%/15%) — **não pode nem exibir CTA/preço apontando pra compra externa (anti-steering)**. O caminho batido (track-first, enforcement OFF) casa bem: o modo-shell **esconde toda superfície de compra** e o usuário compra pela web fora do app (permitido, desde que o app não aponte pra lá).

Nota: o financeiro do TENANT (cobranças de água dos clientes finais, `frontend/src/app/entrega/financeiro/page.client.tsx` — W4 em progresso no working tree, não mexido) é **bem físico + registro manual ("Marcar pago")** → FORA da política de billing. Sem problema.

### Superfícies que o modo-shell PRECISA esconder (arquivo:linha)

| # | Superfície | Arquivo:linha | O que aparece |
|---|-----------|---------------|----------------|
| 1 | **Configurações → Créditos — vitrine de packs** com preço R$, "X% mais barato", CTA que abre pagamento | `frontend/src/components/hbx/credits-wallet-section.tsx:242-287` (vitrine), `:262-280` (cards com `brl(p.price)` e CTA `setPagando`) | preços + botão comprar |
| 2 | **CheckoutPanel inline (cartão Mercado Pago)** — tokenização no navegador, SDK `sdk.mercadopago.com/js/v2` | `frontend/src/components/hbx/checkout-panel.tsx` inteiro (SDK `:110`, form `:196-330`); montado em `credits-wallet-section.tsx:288-315` → `POST /financeiro/credits/recharge` (`:295`) | fluxo de compra completo dentro do app |
| 3 | **Montagem da seção Créditos nas Configurações** | `frontend/src/app/(app)/configuracoes/page.client.tsx:508` (`<CreditsWalletSection />`) | a aba inteira (no shell: esconder a vitrine/recarga; saldo+extrato podem ficar) |
| 4 | **Menu do shell web — "Ver créditos"** | `frontend/src/components/hbx/shell.tsx:913` (botão), `:733-735` (`abrirCreditos` → Configurações→Créditos) | CTA que leva à compra |
| 5 | **BloqueioGate (sem saldo) — copy + CTA de recarga** | `frontend/src/components/hbx/bloqueio-gate.tsx:100` ("Recarregue seus créditos para liberar sua operação."), `:119-120` (botão "Ver créditos →" → `verCreditos` `:92-96`) | CTA direto pra recarga. No shell: copy neutra SEM apontar compra (anti-steering pega até texto) |

### Superfícies avaliadas e LIBERADAS (não são compra in-app)

| Superfície | Prova | Por quê ok |
|------------|-------|------------|
| Landing `?ver=planos` | `frontend/src/app/page.tsx:31-38` — redirect pra `/?criar` (card de CADASTRO) | virou cadastro grátis; PublicEntry sem preço/pack (grep `price|R$|packs` → 0 hits) |
| Cadastro | `frontend/src/components/hbx/register-client.tsx:450-451` | promete créditos GRÁTIS "Sem cartão" — grátis não é billing |
| Fechar venda (vendedor gera link p/ o LEAD) | `frontend/src/components/hbx/fechar-venda-modal.tsx:278-285` (`registerUrl` copiado/enviado por WhatsApp) | compra é de TERCEIRO, fora do device/app (ferramenta B2B). Risco baixo; manter de olho na copy |
| Janelas do master (packs, grants, recargas históricas) | `frontend/src/app/(app)/master/janela-creditos.tsx:23-32` | administração da plataforma, não loja; revisor nunca vê conta master. Opcional esconder no shell por higiene |
| Financeiro do tenant (/entrega/financeiro) | `frontend/src/app/entrega/financeiro/page.client.tsx:1-18` | cobrança de bem físico (água) com quitação manual — permitido |

### Mecanismo de esconder (recomendação)

- Gate único `useIsShell()` sobre `shellDisponivel()` (`frontend/src/app/entrega/shell-bridge.ts:39-46`) — a bridge é injetada em TODAS as rotas do WebView, não só /entrega (`MainActivity.kt:68`), então já funciona no app inteiro hoje.
- Robustez extra (recomendado): User-Agent custom no shell (§5.4) → o gate deixa de depender de JS e o backend pode auditar/telemetrar o modo-Play.
- Esconder client-side é a prática comum aceita; o que NÃO pode é sobrar preço/CTA/rota de checkout acessível no APK da review.

---

## 8. Formulários / declarações do Play Console (o que o dono declara)

| Formulário | O que declarar | Base no código |
|------------|----------------|----------------|
| **Data safety — Localização** | Coleta: **provável "não coletada"** (processada só no device) — o web afirma "NADA de posição contínua sobe pro servidor" (`frontend/src/app/entrega/entrega-hooks.ts:9`) e o RotaService não fala com rede. **Confirmar com grep no backend antes de preencher** (se qualquer endpoint receber lat/lng do device, declarar "coletada, App functionality, não compartilhada") | `RotaService.kt` (sem rede), `entrega-hooks.ts:9` |
| **Data safety — Microfone/voz** | SÓ se a voz funcionar no shell (§4 linha 8): "gravação de voz processada de forma efêmera". Se não funcionar: REMOVER a permissão e não declarar nada | `voz.ts`, `MainActivity.kt:80-92` |
| **Data safety — Dados pessoais** | Nome/email/telefone da conta; dados de clientes do tenant (nomes/endereços/telefones inseridos pelo usuário); criptografia em trânsito (https); exclusão via URL (item abaixo) | fluxo register/backend |
| **Foreground service — FOREGROUND_SERVICE_LOCATION** | Justificativa: "detecção de chegada em paradas de rota de entrega enquanto o motorista navega com o app em segundo plano (foreground service com notificação)"; anexar vídeo do fluxo rota→Maps→chegada | manifest:10,46; `RotaService.kt:278-284` |
| **Full-screen intent (targetSdk 34+)** | Uso: alerta de chegada tempo-sensível estilo navegação/delivery; fallback implementado | manifest:11; `RotaService.kt:241`; `MainActivity.kt:200-216` |
| **Política de privacidade (URL pública)** | `https://www.hbxsystem.com.br/politicas` já existe (`frontend/src/app/politicas/page.tsx`) — **revisar se cobre localização, notificações e dados de clientes finais** | politicas/page.tsx |
| **URL de exclusão de conta** | **NÃO EXISTE no produto** (grep sem hits) — obrigatório p/ app com criação de conta. Criar página/fluxo web (pode ser formulário de solicitação) e declarar | — |
| **Conta demo pro revisor** | Login+senha de tenant de teste com módulo logística ATIVO e rota demo (revisor precisa exercitar o FGS); instruções na seção App access | `.test-login.local.md` (adaptar p/ conta dedicada de review) |
| **Ficha/classificação** | Categoria Business; questionário de content rating (sem conteúdo sensível); público 18+; "sem anúncios"; declarar que NÃO usa Play Billing (enquanto não houver compra in-app) | — |
| **Conta de desenvolvedor** | Preferir conta de ORGANIZAÇÃO (CNPJ): conta pessoal nova exige 12 testers por 14 dias antes de produção; organização não | — |

---

## 9. Lista ordenada — mudanças mínimas pro primeiro `.aab` de teste fechado

Ordem de execução (cada item independente e pequeno):

1. **Nova upload key fora do repo** + `signingConfigs` lendo de `keystore.properties` não versionado; parar de trackear `keystore/*` e `dist/*.apk` (`app/build.gradle.kts:21-28`). [BLOQUEADOR]
2. **`applicationId = "br.com.hbxsystem"`** (`app/build.gradle.kts:11`) — imutável depois, tem que ir certo no 1º upload. [BLOQUEADOR]
3. **compileSdk/targetSdk 35** (`app/build.gradle.kts:8,13`) + **AGP 8.7.x** (`build.gradle.kts:3`) + **Gradle 8.9** (`gradle-wrapper.properties:3`) + insets edge-to-edge no WebView (§3). [BLOQUEADOR]
4. **URL raiz**: `ENTREGA_URL` → `https://www.hbxsystem.com.br/` (`MainActivity.kt:35`) + `app_name`/ícone reais (`strings.xml:3`, `ic_launcher_foreground.xml`). [app único]
5. **Modo-shell esconde billing** no front: gate `useIsShell()` + esconder as 5 superfícies da §7 (wallet-vitrine, CheckoutPanel, seção Créditos, "Ver créditos" no shell.tsx, copy do BloqueioGate). Recomendado junto: User-Agent `HBXShell/2`. [BLOQUEADOR-PRODUCAO — fazer antes de qualquer revisor ver o app]
6. **Fluxo/URL de exclusão de conta** no site + política de privacidade revisada. [BLOQUEADOR-PRODUCAO — o Data safety não fecha sem isso]
7. **allowBackup=false** (ou dataExtractionRules excluindo `app_webview/`) (`AndroidManifest.xml:17`). [segurança]
8. **Fix do gate de permissões** (mic opcional fora do lote; FINE+COARSE juntas) (`MainActivity.kt:153-192`). [qualidade que a review pega]
9. **RotaService restart-zumbi**: `stopSelf()` quando renascer sem alvos (`RotaService.kt:102-117`). [bateria/review]
10. **Decidir a voz**: validar Web Speech no aparelho; não funcionando → remover `RECORD_AUDIO` (manifest:8) ou implementar SpeechRecognizer nativo. [data safety limpa]
11. `screenOrientation="portrait"` na MainActivity (manifest) + tela offline mínima (`onReceivedError`). [qualidade]
12. **Gerar `.aab`**: `gradlew bundleRelease` → subir no track de teste fechado com as declarações da §8.

Depois do teste fechado (fase 2, não bloqueia o 1º .aab): App Links + assetlinks.json, upload/download no WebView (§6 itens 5-6), R8/minify com keep rules, geolocation gateada por origin.

---

## 10. O que JÁ ESTÁ PRONTO (não mexer)

- Sem `ACCESS_BACKGROUND_LOCATION` — manter assim (evita o formulário mais pesado da Play).
- Allowlist de navegação + tudo-externo-por-Intent (`MainActivity.kt:95-115`).
- SSL falha-fechado; sem debug de WebView; cleartext off.
- Arquitetura do takeover (heads-up → full-screen-intent → overlay, cada um com fallback e pedido no máx 1x).
- Foreground service tipado + notificação persistente silenciosa.
- Bridge defensiva com contrato espelhado no front (`shell-bridge.ts`), pronta pra virar o gate do modo-Play no app inteiro.
- Porta única do front (`page.tsx:19`) já resolve login/landing dentro do WebView — o app único é 90% troca de URL.
