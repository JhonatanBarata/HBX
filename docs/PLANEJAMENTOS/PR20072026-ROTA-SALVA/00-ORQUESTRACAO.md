# PR20072026-ROTA-SALVA — Orquestração (Opus, 20/07)

Opus orquestra + integra + testa no moto g15 (ADB, ver [[apk-teste-via-adb]]).
**Publish (VPS) é do dono.** Rebuild/instalação do APK é do Opus (via ADB).

## Frentes
| # | Frente | Onde |
|---|---|---|
| F1 | Rota salva sem dia (diaSemana opcional no finalizar) | backend |
| F2 | Aplicar rota salva roda a lista EXATA (`/rota-modelos/:id/gerar`) | backend + app |
| F2a | Ponte Leitura→cadastro (ClienteProduto SEM dia) | backend |
| F3.1 | Preço estilo banco (centavos, seleciona ao tocar) | app |
| F3.2 | Sequência cliente na leitura + `GET /geo/reverse` (GPS→endereço) | backend + app |
| F3.3 | Preço × financeiro OFF (cadeado + popup "configurar?") | app |
| F3.4 | Chips vivos GPS + Rede no header | app |
| F3.5 | Lapidação (retomar wizard, mapa centrado, textos) | app |
| **F4** | **Auto-update do APK (version.json + PackageInstaller)** | backend + nativo + app |
| **F5** | **Redesign: matar bottom-sheets, usar MODAL CENTRAL c/ setas grandes** | app |
| **F6** | **Loading overlay escurecido, bem feito e leve** | app |

Detalhe de F1/F2/F2a → [00-PLANO.md]. Detalhe de F3 → [01-UX-LEITURA-CELULAR.md].

## Divisão dos subagentes (arquivos DISJUNTOS — zero clobber)
- **AGENT-BACKEND** (Sonnet) → [02-BACKEND.md] — só `backend/**` + `scripts/ops/deploy-vps.js`.
- **AGENT-NATIVE** (Sonnet) → [03-NATIVE-UPDATE.md] — só `EntregaShell/app/src/main/java/**`,
  `AndroidManifest.xml`, `app/build.gradle.kts`. NUNCA toca `app.js`.
- **AGENT-APP** (Sonnet) → [04-APP-UI.md] — só `EntregaShell/app/src/logistica/assets/app/*`
  (`app.js`, `app.css`). É UM agente só (arquivo único, não pode ser paralelizado).

## Contratos entre agentes (LEI — não divergir)
**APP ↔ NATIVE (ponte `HBXAndroid`, wrapper `H`):**
- Versão: APP lê `H.appInfo()` → `{versionCode, versionName}` (JÁ EXISTE em NativeAppBridge.appInfo()).
- Update (métodos NOVOS que o NATIVE expõe e o APP chama):
  - `HBXAndroid.updateInstallAllowed(): boolean` — canRequestPackageInstalls().
  - `HBXAndroid.openInstallPermission()` — abre Settings ACTION_MANAGE_UNKNOWN_APP_SOURCES do app.
  - `HBXAndroid.downloadAndInstall(url, sha256, versionName)` — baixa, confere sha256, dispara
    PackageInstaller. Progresso → `window.HBXUpdate && HBXUpdate.onProgress(pct)`;
    erro → `HBXUpdate.onError(msg)`. (APP registra esses callbacks.)

**APP ↔ BACKEND (endpoints NOVOS):**
- `GET /logistica/geo/reverse?lat=&lng=` → `{ endereco, numero?, bairro, cidade, uf, cep, fonte }`
  (200 sempre; sem match → campos vazios + `fonte:"nenhum"`; NUNCA 500).
- `POST /logistica/rota-modelos/:id/gerar` body `{date?}` → `{ deliveryIds:[...ordem do modelo], avisos:[] }`.
- Update-check JSON servido pelo VPS em `${WEB_BASE_URL}/downloads/version-logistica.json`
  shape `{ versionCode:int, versionName:str, url:str, sha256:str, obrigatoria:bool, nota?:str }`.
  APP faz `fetch` direto (não via H.api), compara `versionCode` com `H.appInfo().versionCode`.

## DAG de execução
1. Spawn PARALELO: AGENT-BACKEND, AGENT-NATIVE, AGENT-APP (arquivos disjuntos).
2. Opus integra ao fim de cada um; roda `cd backend && npm run typecheck` + testes tocados;
   `cd EntregaShell && ./gradlew :app:assembleLogisticaRelease` (compila nativo + assets juntos).
3. Opus: `adb install -r` + walkthrough completo no moto g15 (fluxo leitura nova → endereço →
   número → produto banco/financeiro → finalizar só-nome → Salvos → aplicar → chips → loading →
   simular update). Print de prova.
4. Opus faz o polimento final de APARÊNCIA no device (é o ponto quente do dono).
5. Reporta. **Dono publica o backend** (aí `version.json` nasce no VPS e o auto-update fecha E2E).

## Regras duras (todos os agentes)
- Não commitar (`publish` é do dono). Trabalhar direto na branch atual.
- 5 Leis do Design System no que for FRONTEND web — mas o APK usa CSS PRÓPRIO em
  `assets/app/app.css` (não passa por check-pele); mesmo assim: nada de hex solto novo, reusar
  os tokens/classes que já existem no app.css.
- F4 depende de **mesma keystore de assinatura** (NATIVE confirma que o release NÃO usa chave
  efêmera) e **versionCode sempre crescente**. Sem isso, auto-update é recusado pelo Android.
- Nada de loop de rede (reverse geocode = 1 req/parada + cache; update-check = 1x ao abrir).
