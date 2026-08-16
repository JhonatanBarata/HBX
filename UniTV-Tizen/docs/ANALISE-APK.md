# Análise do APK UniTV 4.19.1 → Mapa para porte Tizen

APK analisado: `unitv-4.19.1.apk`
Package: **`com.global.unitviptv`** · versionName **4.19.1** (versionCode 41901)
minSdk 21 · targetSdk 33 · compileSdk 34 · **Android TV (leanback)**

> White-label: o package é `com.global.unitviptv`, mas o código e o launcher usam o namespace **`com.interactive.brasiliptv`**. É um app IPTV "de marca" (UniTV / UniqueTV) construído sobre um framework comum chinês de TV (**CoolX** + **TheRouter** + módulos `com.vod/com.live/com.mine/com.match`).

## 1. Proteções e stack técnica

| Item | Detalhe | Impacto no porte |
|---|---|---|
| Packer | **ijiami (爱加密)** — `assets/ijiami.dat`, `ijiami.ajm`, `ijm_lib/*/libexec*.so`, `classes.dex` de só 13 KB (stub) | O DEX real é **criptografado**. Não dá para decompilar a lógica de API/auth estaticamente. |
| Player | **ijkplayer** (FFmpeg): `libijkplayer.so`, `libijkffmpeg.so`, `libijksdl.so`. UI oferece "Player 1 / Player 2" = IjkMediaPlayer / IjkExoMediaPlayer / AndroidMediaPlayer | No Tizen troca por **AVPlay** (decoder de hardware do painel). |
| Roteamento | **TheRouter** (`assets/therouter/routeMap.json`) | Dá o mapa de navegação entre telas. |
| UI base | CoolX TV framework (`org.coolx.*`), design **1920×1080** (`design_width/height`) | Desenhar o Tizen em canvas lógico **1920×1080 (FHD)**. |
| Analytics/Push | Firebase (Messaging/Analytics/Crashlytics), Yandex **AppMetrica**, ByteDance **Ranger**, **Bugly**, **Qiniu** DNS | No Tizen: opcional. Pode omitir ou trocar por telemetria própria. |
| Rede | OkHttp3 | No Tizen: `fetch`/XHR. |

### Config Firebase (extraída de `resources.arsc`)
```
project_id            = unitv-kh3
google_app_id         = 1:373016554559:android:96dbbbe239c4911fe95c8a
gcm_defaultSenderId   = 373016554559
google_api_key        = AIzaSyCmcq8rNyTaJpj2OpVvpTzpfrPfnMwg2jE
firebase_database_url = https://unitv-kh3.firebaseio.com
storage_bucket        = unitv-kh3.appspot.com
```
Contatos de marca: `unitv4k@gmail.com`, `www.uniquetv.live`, download `dwonload.youcine.net` (typo no próprio app).

## 2. Activities (do AndroidManifest) → telas Tizen

Launcher: **`com.interactive.brasiliptv.ui.activity.WelcomeActivity`** (MAIN + LEANBACK_LAUNCHER)

| Módulo | Activity (Android) | Função | Tela Tizen (rota) |
|---|---|---|---|
| bootstrap | WelcomeActivity | Splash, checagem de device/versão/token, autologin | `#/welcome` |
| bootstrap | GuidePageActivity | Onboarding primeiro uso | `#/guide` |
| login | ForcePasswordChangeActivity | Troca de senha obrigatória | `#/force-pwd` |
| main | **HomeActivity** | Home com abas Live / Movies / Series / Match | `#/home` |
| vod | VodCategoryActivity | Grade de categoria VOD | `#/vod/category` |
| vod | VodDetailsActivity | Detalhe do filme/série (temporadas, elenco, similares) | `#/vod/details` |
| vod | VodSearchActivity | Busca VOD | `#/vod/search` |
| vod | RestrictLevelSearchActivity | Busca com nível de restrição (adulto) | `#/vod/search-restrict` |
| vod | TopicActivity / TopicMoreActivity | Coleções/temáticas | `#/vod/topic` |
| vod | ActorDetailsActivity | Filmografia do ator | `#/vod/actor` |
| vod | KidsCategoryActivity | Modo Kids | `#/vod/kids` |
| vod | FilterActivity | Filtro (Genre/Country/Year/Type) | `#/vod/filter` |
| vod | SmartvListActivity | Lista "SmarTV" | `#/vod/smartv` |
| live | **LiveFreeActivity** | Player de TV ao vivo + EPG + lista de canais | `#/live` |
| live | LiveVoiceSearchActivity / LiveNewVoiceSearchActivity | Busca por voz de canal | `#/live/voice` |
| match | MatchScheduleActivity | Agenda de jogos | `#/match` |
| match | MatchDetailActivity | Detalhe do jogo (line-up, stats, canais) | `#/match/detail` |
| match | MatchCategoryActivity | Categoria de esporte | `#/match/category` |
| match | MatchRankCategoryActivity | Classificação/tabela | `#/match/rank` |
| mine | UserCenterActivity | Central do usuário / perfil | `#/user` |
| mine | AccountSecurityActivity | Segurança da conta (bind e-mail/telefone, senha) | `#/user/security` |
| mine | PurchaseActivity | Compra de plano (QR + e-mail) | `#/purchase` |
| mine | OrderHistoryActivity | Histórico de compras | `#/user/orders` |
| mine | MyRecordActivity | Histórico de reprodução / continue assistindo | `#/user/history` |
| mine | CouponActivity | Cupons | `#/user/coupons` |
| mine | InviteFriendsActivity | Indicação (QR, código) | `#/user/invite` |
| mine | EventCenterActivity | Central de eventos/promos | `#/user/events` |
| mine | DisplayQRCodeActivity | Exibe QR (compra/login/invite) | `#/qr` |
| mine | PersonalMoreActivity | Mais opções do perfil | `#/user/more` |
| mine | SettingsActivity | Ajustes (idioma, cache, parental, playback, sobre) | `#/settings` |
| module | CommonWebActivity / WebActivity | WebView (termos, ajuda, pagamento) | `#/web` |
| service | MyFirebaseMessagingService | Push FCM | (opcional no Tizen) |
| service | ReportService | Telemetria de reprodução | (opcional) |

### routeMap.json (TheRouter) — deep links internos
```
http://module_vod/VodDetailsActivity   -> com.vod.ui.activity.VodDetailsActivity
http://module_vod/VodCategoryActivity   -> com.vod.ui.activity.VodCategoryActivity
http://module_vod/TopicActivity         -> com.vod.ui.activity.TopicActivity
http://module_vod/SmartvListActivity    -> com.vod.ui.activity.SmartvListActivity
http://module_mine/UserCenterActivity   -> com.mine.ui.activity.UserCenterActivity
http://module_mine/PurchaseActivity     -> com.mine.ui.activity.PurchaseActivity
http://module_mine/InviteFriendsActivity-> com.mine.ui.activity.InviteFriendsActivity
http://module_mine/CouponActivity       -> com.mine.ui.activity.CouponActivity
http://module_mine/AccountSecurityActivity -> ...AccountSecurityActivity
http://module_main/HomeActivity         -> com.main.ui.activity.HomeActivity
http://module_login/ForcePasswordChangeActivity -> ...ForcePasswordChangeActivity
```

## 3. Autenticação (inferida das strings e do fluxo típico CoolX)

Fluxo: **login por conta+senha** (também há telefone/SMS/e-mail no código, mas o build está com "account login" como principal — `dialog_login_account`).

- Campos: **Account** (usuário ou e-mail) + **Password** (`account_input_account`, `account_input_password`).
- **Código de ativação**: prefixos `EG1-` … `EG10-` (`activation_eg1..eg10`) — ativa/renova o plano (VIP) via activation code, alternativa ao login.
- **Vínculo de device**: o app amarra a conta a um **device id/MAC**. Regra de VIP: *"Allows you to login in two devices simultaneously (1 phone + 1 TV box)"* (`vip_privilege`). Erros: `account_already_login`, `account_login_another`, `account_device_not_support`, `devces_expired_tips`, `account_area_invalid`/`account_blacklist` (geofence).
- **Token**: sessão por token (`account_login_token_invalid`, `account_login_timeout` → "log in again"). Guardar token + refazer login quando expira.
- **Force password change**: servidor pode exigir troca (`ForcePasswordChangeActivity`).

> Os campos que **você** usa (o usuário/senha comprado) são enviados no login. O único dado que falta para o cliente Tizen é a **URL base** do servidor — ver seção 5.

## 4. Player

- No Android: **ijkplayer** (FFmpeg/software) + fallback ExoPlayer/MediaPlayer. Suporta HLS (`.m3u8`), h264/h265, **AV1** ("exclusive AV1 program source"), múltiplas faixas de áudio, legendas externas (SRT/estilo/tamanho/tempo), troca de resolução (ABR manual), razão de tela.
- Alerta do próprio app: *"This source uses h265... hardware does not support..."* → depende do decoder do device.
- **No Tizen (BU8000)**: usar **`webapis.avplay`**, que usa o decoder de **hardware** do painel (H.264/H.265/HEVC até 4K; AV1 depende do chipset — BU8000 é série 2020, AV1 pode não ter HW decode). Funções equivalentes:
  - HLS/VOD/live: `avplay.open(url)` → `prepareAsync()` → `play()`
  - Trocar faixa de áudio/legenda: `getTotalTrackInfo()` + `setSelectTrack('AUDIO'|'TEXT', idx)`
  - Razão de tela: `setDisplayMethod(...)`
  - ABR/qualidade: `setStreamingProperty('ADAPTIVE_INFO','BITRATES=...')` ou trocar URL por variante
  - Legenda externa: `setExternalSubtitlePath()` + `onsubtitlechange`

## 5. APIs, URLs de mídia e o que está criptografado

**O que NÃO está no APK em texto claro:** o host de API, o host de EPG e as URLs de stream. Eles são guardados como `hex(base64(AES))` e descriptografados em runtime. Exemplos extraídos:

```
PORTAL_KEY (meta-data) = hex→ "bQ4xD8uHnZ+YnoR67A0UmJuHNQwyftyEs7yvPtrcemxNzu4ismBQYw=="
                         → base64 → 40 bytes AES (identificador do portal/tenant)
epg_main   = 626f59...  → base64 → 24 bytes AES
epg_backup = 654e63...  → base64 → 16 bytes AES
epg4b_data_main/backup  → idem
```
A **chave AES** que abre esses valores está no DEX empacotado pelo ijiami → **não recuperável estaticamente** sem des-empacotar (unpack dinâmico).

**Como obter as URLs reais (uma vez):**
1. **Proxy MITM** — instalar mitmproxy/Charles no PC, apontar o proxy no Android/emulador, rodar o UniTV, fazer login e observar:
   - `POST .../login` (ou `/user/login`, `/auth/login`) → base da API + formato do body/headers e o **token**.
   - Chamadas de `channels`, `epg`, `vod/list`, `vod/detail`, `play/url` → padrões de endpoint.
   - A **URL de mídia** volta nessas respostas (normalmente `.m3u8` HLS com token/expiração na query).
2. Preencher `js/config.js` (`BASE_URL`, `PORTAL_KEY`, headers) e mapear os endpoints em `js/api/*.js`.

> Sem TLS pinning aparente no lado web; o proxy deve capturar tudo. Se houver pinning no Android, usar emulador com Frida ou app-Android descompilado só para o pinning — mas para o **cliente Tizen** o que importa é só reproduzir as chamadas HTTP capturadas.

## 6. Navegação (controle remoto) — mapa Home

```
WelcomeActivity ──(autologin ok)──▶ HomeActivity
      │(sem sessão)                     ├─ aba LIVE   ▶ LiveFreeActivity ▶ player + EPG + lista canais
      ▼                                 ├─ aba MOVIES ▶ VodCategory ▶ VodDetails ▶ player VOD
   Login (account+senha)               ├─ aba SERIES ▶ VodCategory ▶ VodDetails(temporadas) ▶ player
   ou Activation code (EGx-)           ├─ aba MATCH  ▶ MatchSchedule ▶ MatchDetail ▶ player
                                        ├─ Search    ▶ VodSearch / LiveVoiceSearch
                                        └─ User      ▶ UserCenter ▶ {Security, Orders, History,
                                                                    Coupons, Invite, Purchase, Settings}
```
Teclas: navegação D-pad + OK; **BACK/RETURN** volta; **MENU** ou **long-OK** abre opções no player (áudio/legenda/qualidade/feedback/troca de player); teclas coloridas e Info usadas no EPG.

---
Ver `../README.md` para como configurar a API e empacotar o `.wgt`.
