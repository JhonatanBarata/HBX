import java.io.FileInputStream
import java.net.URI
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.gms.google-services")
}

// Assinatura de release FORA do git: EntregaShell/keystore.properties (gitignored)
// ou HBX_ANDROID_STORE_FILE/HBX_ANDROID_STORE_PASSWORD/HBX_ANDROID_KEY_ALIAS/
// HBX_ANDROID_KEY_PASSWORD no ambiente de CI. Sem uma das duas fontes completas,
// qualquer task de release falha — nunca sai .aab sem assinatura por acidente.
// Auto-update do APK Logística: o versionCode do flavor "logistica" pode ser
// INJETADO pelo publish (-PhbxLogisticaVersionCode=N). Quem decide o número é
// o scripts/ops/deploy-vps.js, que só incrementa quando o APK realmente mudou
// (impressão digital dos fontes do EntregaShell contra a última publicada) —
// publish de backend/frontend NÃO faz o motorista baixar 1,5 MB à toa.
// O literal abaixo é o PISO: sem a propriedade (build local, Android Studio),
// vale ele — e o publish nunca publica abaixo dele, nem quando a digital dos
// fontes não mudou. É por isso que subir este número é a ALAVANCA MANUAL pra
// forçar os celulares a baixarem de novo.
// 8 → 15 em 22/07: o servidor estava servindo um APK já corrigido carimbado
// como 14, o mesmo código que os aparelhos tinham — ninguém via atualização e
// a digital publicada já era a do tree, então o publish repetia "inalterado".
// 15 → 18 em 22/07 (tarde): o publish carimbou 16 e, testando a chegada nova no
// moto g15, instalei à mão um build 17. Sem subir o piso, o próximo publish
// carimbaria 17 — MESMO número que já está no aparelho — e o celular jamais
// veria atualização (repetição exata do caso 8→15 acima).
// 18 → 38 em 25/07: testando o fim da faixa "Gravando" grudada na tela instalei
// à mão um build 37 no moto g15. Sem subir o piso, o próximo publish carimbaria
// 37 — MESMO número já no aparelho — e o celular nunca veria a atualização
// (repetição exata dos casos 8→15 e 15→18 acima).
// 38 → 60 em 27/07: testando o Gerenciador de Rota e a contagem de dias no moto
// g15 instalei à mão os builds 57/58/59/60. Sem subir o piso, o próximo publish
// carimbaria um número que JÁ está no aparelho e ele nunca veria a atualização
// (mesmo caso de 8→15, 15→18 e 18→38 acima).
// 60 → 68 em 27/07: testando o chip de dia virando interruptor (tocar de novo
// TIRA o dia) instalei à mão o build 68 no moto g15, que já rodava o 67 vindo do
// publish. Sem subir o piso o próximo publish carimbaria 68 — MESMO número já no
// aparelho — e ele nunca veria a atualização (mesmo caso de 8→15, 15→18, 18→38
// e 38→60 acima).
// 87 → 95 em 28/07: testando a seção "Cadastrar Rota Offline" nos Ajustes instalei
// à mão o build 91 no moto g15 (que rodava o 90) e, no meio do teste, o publish do
// dono carimbou o 94 no ar. Sem subir o piso o próximo publish repetiria um número
// que JÁ está em aparelho e ele nunca veria a atualização (mesmo caso de 8→15,
// 15→18, 18→38, 38→60 e 60→68 acima).
// 95 → 110 em 29/07: o publish das 20:22 carimbou 105 — o MESMO número que os
// aparelhos já rodavam — porque o piso (95) estava abaixo do publicado e não
// tinha força pra empurrar. Resultado: APK corrigido no servidor (Cancelar único
// + 3 sons virando 1) e nenhum celular vendo atualização. No g15 nem apareceu
// porque eu tinha sideloadado o 95 por cima do 105. Piso ACIMA do publicado é o
// que destrava (mesmo caso de 8→15, 15→18, 18→38, 38→60, 60→68 e 87→95 acima).
// 110 → 117 em 29/07 (noite): consertando a navegação COM O DONO usando o app pra
// se guiar (traço, seta, chegada, noturno), sideloadei 112, 113, 114, 115 e 116 no
// moto g15. O piso tem que ficar ACIMA do maior número que já está no aparelho,
// senão o publish carimba um versionCode que o celular já roda e ele nunca vê a
// atualização chegar (mesmo caso de 8→15, 15→18, 18→38, 38→60, 60→68, 87→95 e
// 95→110 acima).
// 117 → 123 em 31/07 (madrugada): a frente "HBX vira app de rota" sideloadou 119,
// 120, 121 e 122 no moto g15 durante o teste no aparelho. Piso ACIMA do maior que
// já está no celular, senão o publish carimba um número que ele já roda e a
// atualização nunca aparece (mesmo caso de 8→15, 15→18, 18→38, 38→60, 60→68,
// 87→95, 95→110 e 110→117 acima).
// 123 → 131 em 02/08: o publish do AGENDADOR DE MISSÃO carimbou 127 e o moto g15
// já rodava um 130 sideloadado por outra frente — o APK novo não só deixou de ser
// ofertado como nem instalava à mão (INSTALL_FAILED_VERSION_DOWNGRADE), e o
// aparelho ficava sem o despertador da rota marcada. Piso ACIMA do maior número
// que está no celular é o que destrava (mesmo caso de 8→15, 15→18, 18→38, 38→60,
// 60→68, 87→95, 95→110, 110→117 e 117→123 acima).
// 131 → 134 em 02/08 (mesma tarde): o publish carimbou 132 e depois 133 enquanto
// eu testava no g15, e o build local (piso 131) parou de instalar por downgrade.
// O piso tem que ficar ACIMA do maior número que já saiu — senão o ciclo
// "editar → instalar no aparelho" trava no meio do teste.
// 137 → 140 em 03/08: publiquei o APK do canal de RECADO (139) e, em vez de
// esperar o aviso de atualização chegar no aparelho, instalei à mão pelo ADB —
// que é o meu atalho, não o caminho do motorista. Dois estragos: (a) o g15 ficou
// com 139 sideloadado, então o piso precisa passar dele; (b) atropelei justamente
// o teste que teria achado o bug do aviso (o modal só aparecia em atualização
// OBRIGATÓRIA — ver o comentário no `checkAppUpdate` do app.js). Piso ACIMA do
// maior número que está no celular é o que destrava (mesmo caso de 8→15, 15→18,
// 18→38, 38→60, 60→68, 87→95, 95→110, 110→117, 117→123 e 131→134 acima).
// 140 → 142 em 03/08 (noite): o reparo da allowlist dos recados precisa ser
// instalado no g15 durante a prova. O piso fica acima do build local 141 para
// que o próximo publish nunca repita a versão que já parou no aparelho.
// 142 → 148 em 03/08 (noite): o canal de recados foi provado até o build 147.
// O módulo Chat e o fluxo suportado de aviso precisam nascer acima da versão
// que já está no aparelho para a atualização normal realmente ser oferecida.
// 148 → 156 em 05/08: o publish da CADERNETA 7 DIAS carimbou 154 e o piso ficou
// em 148 — o build local parou de instalar no g15 por downgrade no meio do teste
// que o dono pediu ("abra o celular e teste tudo"). Piso ACIMA do maior número
// que já saiu, senão o ciclo "editar → instalar no aparelho" trava (mesmo caso
// de 8→15, 15→18, 18→38, 38→60, 60→68, 87→95, 95→110, 110→117, 117→123,
// 123→131 e 131→134 acima).
// 🔴 156 → 170 em 07/08 — A FUSÃO (o app novo virou O app). O piso estava em
// 156 e o PUBLICADO em produção era 163 (medido em version-logistica.json:
// {"versionCode":163,"versionName":"beta1.3.2"}): piso ABAIXO do publicado é
// exatamente o caso 95→110, o que faz o publish carimbar um número que o
// celular já roda e a atualização NUNCA aparecer. E desta vez o custo seria o
// pior possível: o motorista ficaria com o app antigo enquanto o servidor
// serviria o app novo, sem ninguém ver erro. 170 fica com folga acima de 163.
// 170 → 171 na MESMA sessão, e o motivo é a prova: a ordem mandava instalar o
// flavor de PRODUÇÃO no g15 pra provar por toque que o app novo é o app. Isso
// sideloadou o 170 no aparelho. Piso 170 faria o publish carimbar 170 — o
// MESMO número que o g15 já roda — e o g15 nunca veria o aviso de atualização
// aparecer sozinho, que é justamente a 1ª prova depois do publish (§6.4 do
// PR07082026-FECHAR-LOGISTICA2). O André (163) atualizaria de qualquer jeito,
// mas a bancada ficaria cega pra conferir o aviso. 171 mantém a lei de sempre:
// piso ACIMA do maior número que já está em algum celular.
// 171 → 175 em 07/08 (noite): a leva "barra de 3 + dia da rota + Voltar em
// pilha" sideloadou o 173 no moto g15 durante o teste por toque. Piso ACIMA
// do maior número que já está em algum celular — a lei de sempre.
// 175 → 185 em 07/08 (madrugada de 08): o roteiro funcional (montar → salvar →
// iniciar → entregar) foi testado por toque no g15 em 6 rodadas de build, e a
// última sideloadada foi a 184. Piso ACIMA do maior número que já está em
// algum celular, senão o publish carimba um número que o g15 já roda e o aviso
// de atualização nunca aparece — que é a 1ª prova depois de publicar.
// 185 → 201 em 09/08 (madrugada): a leva "títulos de tela centralizados" provou
// no g15 por sideload, e o último debug instalado foi o 200. Com o piso em 185,
// o publicado era 198 e o próximo publish carimbaria max(198,185)+1 = 199 — ou
// seja, ABAIXO do que o g15 já roda, e o aparelho de bancada ficaria cego pro
// aviso de atualização. Piso ACIMA do maior número que já está em algum celular:
// a lei de sempre, terceira vez que ela é cobrada por sideload de prova.
// 201 → 221 em 09/08 (manhã) — A QUARTA COBRANÇA DA MESMA LEI, e desta vez ela
// mordeu o dono na cara: ele publicou a leva "a agenda sai da tela", abriu o
// g15 e não viu nada mudar. Medido: o publish carimbou **219** (digital nova,
// conteúdo certo — provado com `unzip -p base.apk assets/app/mock.js` dentro do
// .apk publicado), mas o g15 tinha **220** instalado às 04:41 por sideload de
// prova de OUTRA sessão. 219 < 220 ⇒ o app se recusa a "atualizar pra trás", e
// com razão: quem decide é o NÚMERO, não a data. O aparelho ficou rodando o
// front da véspera enquanto o servidor servia o novo, sem erro nenhum na tela —
// a assinatura exata de [[publish-subiu-codigo-mas-nao-o-apk]].
// E o piso em 201 deixava a armadilha armada pro publish SEGUINTE: max(219,201)
// + 1 = 220, o mesmo número do sideload, e o g15 seguiria cego. 221 fica acima
// do maior número que existe em qualquer celular hoje.
// 🔴 A LIÇÃO QUE NÃO PEGOU EM 4 TENTATIVAS: quem sideloada pra provar SOBE O
// PISO no mesmo commit. O sideload é diagnóstico; o piso é o que devolve o
// aparelho pro fluxo de verdade (aviso → download → instalar).
// 221 → 241 em 09/08 (noite) — A QUINTA COBRANÇA, e desta vez ela foi paga ANTES
// de morder: a leva "a entrada começa e começa novamente" exigiu quatro builds
// sideloadadas no g15 pra achar o defeito por gravação de tela (236, 237, 238 e
// 240 — a 240 com a cena de saída nova). O publicado era 235. Sem subir o piso,
// o próximo publish carimbaria max(235,221)+1 = 236, que o g15 JÁ RODA, e o
// aparelho de prova ficaria cego pro aviso de atualização — exatamente o buraco
// que custou o "publiquei e não mudou nada" da manhã.
// 241 → 244 na mesma noite: a cena de saída (o reverso começando pelo mapa)
// custou mais duas builds no g15 (242 publicada e 243 sideloadada). Piso ACIMA
// do maior número que existe em qualquer celular — a lei de sempre.
val hbxLogisticaVersionCodeFloor = 244
val hbxLogisticaVersionCode =
    (project.findProperty("hbxLogisticaVersionCode") as String?)?.toIntOrNull()
        ?.coerceAtLeast(hbxLogisticaVersionCodeFloor)
        ?: hbxLogisticaVersionCodeFloor

// ---------------------------------------------------------------------------
// A FUSÃO — 07/08/2026: o app novo virou O app
// ---------------------------------------------------------------------------
// De 06/08 a 07/08 o app novo cresceu num flavor SEPARADO (`logistica2`), com
// applicationId próprio, apontando pro localhost e fora do publish, pra não
// encostar no APK que o motorista usa. Ordem do dono em 07/08 — "junte agora o
// app em 1" — e o flavor foi DISSOLVIDO: os assets dele viraram os do
// `logistica`, os 17 sons MARCADO vieram junto, e sobrou um app só.
//
// 🔴 O QUE NÃO PODE VOLTAR: o flavor carregava um override que forçava
// API_BASE_URL pro `logistica2.properties` (default `http://localhost:3000`).
// Um flavor de bancada NUNCA pode ser o mesmo que vai pro cliente — ver o aviso
// grande onde o bloco morava, logo antes do `prepareVendasCheckoutAssets`.

val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) {
        FileInputStream(keystorePropsFile).use { load(it) }
    }
}

fun releaseSigningValue(propertyName: String, environmentName: String): String =
    keystoreProps.getProperty(propertyName).orEmpty().trim().ifBlank {
        providers.environmentVariable(environmentName).orNull.orEmpty().trim()
    }

val releaseStoreFileValue = releaseSigningValue("storeFile", "HBX_ANDROID_STORE_FILE")
val releaseStorePassword = releaseSigningValue("storePassword", "HBX_ANDROID_STORE_PASSWORD")
val releaseKeyAlias = releaseSigningValue("keyAlias", "HBX_ANDROID_KEY_ALIAS")
val releaseKeyPassword = releaseSigningValue("keyPassword", "HBX_ANDROID_KEY_PASSWORD")
val releaseStoreFile = releaseStoreFileValue.takeIf(String::isNotBlank)?.let(rootProject::file)
val releaseSigningReady = releaseStoreFile?.isFile == true &&
    releaseStorePassword.isNotBlank() && releaseKeyAlias.isNotBlank() && releaseKeyPassword.isNotBlank()

fun buildConfigString(value: String): String =
    "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

val productionApiBaseUrl = "https://api.hbxsystem.com.br"
val productionWebBaseUrl = "https://www.hbxsystem.com.br"
val googleWebClientId = "959050454992-6pcir0fud29ttoo1sb1ig29q59ovedbh.apps.googleusercontent.com"
val debugApiBaseUrl = providers.gradleProperty("hbxApiBaseUrl")
    .orElse(productionApiBaseUrl)
    .get()
    .trimEnd('/')
val debugWebBaseUrl = providers.gradleProperty("hbxWebBaseUrl")
    .orElse(productionWebBaseUrl)
    .get()
    .trimEnd('/')
val videoStudioApiBaseUrl = providers.gradleProperty("hbxVideoApiBaseUrl")
    .orElse("http://127.0.0.1:3210")
    .get()
    .trimEnd('/')
val videoStudioWebBaseUrl = providers.gradleProperty("hbxVideoWebBaseUrl")
    .orElse("http://127.0.0.1:3210")
    .get()
    .trimEnd('/')

fun requireVideoLoopback(value: String, name: String) {
    val uri = runCatching { URI(value) }.getOrNull()
    require(
        uri != null && uri.scheme in setOf("http", "https") &&
            uri.host in setOf("127.0.0.1", "localhost", "::1") &&
            uri.userInfo == null,
    ) { "$name do Video Studio deve usar somente loopback; recebido: $value" }
}

requireVideoLoopback(videoStudioApiBaseUrl, "hbxVideoApiBaseUrl")
requireVideoLoopback(videoStudioWebBaseUrl, "hbxVideoWebBaseUrl")

android {
    namespace = "br.com.hbxsystem.entrega"
    compileSdk = 35

    defaultConfig {
        applicationId = "br.com.hbxsystem"
        minSdk = 26
        targetSdk = 35
        versionCode = 9
        versionName = "2.0.1"
        buildConfigField("String", "API_BASE_URL", buildConfigString(productionApiBaseUrl))
        buildConfigField("String", "WEB_BASE_URL", buildConfigString(productionWebBaseUrl))
        buildConfigField("String", "APP_MODE", buildConfigString("vendas"))
        buildConfigField("boolean", "VIDEO_STUDIO", "false")
        // Só o flavor `logistica` liga esta chave (desde a FUSÃO de 07/08). Ela
        // separa o app novo SEM inventar um APP_MODE novo — ver o comentário no
        // flavor. O `vendas` continua `false` de propósito: ele nunca recebeu a
        // abertura única, e ligar aqui apagaria a cortina dele.
        buildConfigField("boolean", "HBX_V2", "false")
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", buildConfigString(googleWebClientId))
        manifestPlaceholders["hbxUsesCleartextTraffic"] = "false"
        manifestPlaceholders["hbxAppLabel"] = "HBX Vendas"
    }

    flavorDimensions += "experience"
    productFlavors {
        create("vendas") {
            dimension = "experience"
            applicationId = "br.com.hbxsystem"
            buildConfigField("String", "APP_MODE", buildConfigString("vendas"))
            manifestPlaceholders["hbxAppLabel"] = "HBX Vendas"
        }
        create("logistica") {
            dimension = "experience"
            applicationId = "br.com.hbxsystem.logistica"
            versionCode = hbxLogisticaVersionCode
            // ALPHA1 (07/08) — ordem do dono na FUSÃO: "junte agora o app em 1".
            // Sai o `beta1.3.2` (o app antigo) e entra o nome que o dono batizou
            // pro app novo. Nunca deixar `-bancada` aqui: este é o flavor que vai
            // pro celular do cliente.
            versionName = "alpha1"
            // 🔴 APP_MODE CONTINUA "logistica". O Kotlin de main/ decide 40+
            // comportamentos comparando esta string com "logistica"
            // (NativeAppBridge, HbxMobileBridge, MainActivity, som, push). Um
            // APP_MODE novo faria cada uma dessas funções sair pela porta dos
            // fundos e o app nasceria oco. Quem liga o app novo é o HBX_V2.
            buildConfigField("String", "APP_MODE", buildConfigString("logistica"))
            // 🔴 HBX_V2 = a chave do app novo. É ela que decide a ABERTURA ÚNICA
            // (OpeningActivity sem cena, só o porteiro da sessão) e o porteiro
            // liso da MainActivity (`if (!BuildConfig.HBX_V2) mountOpeningOverlay`).
            // Se voltar pra `false`, a abertura anterior RESSUSCITA e o motorista
            // vê duas aberturas em sequência de novo.
            buildConfigField("boolean", "HBX_V2", "true")
            manifestPlaceholders["hbxAppLabel"] = "HBX Logística"
        }
    }

    signingConfigs {
        if (releaseSigningReady) {
            create("release") {
                storeFile = releaseStoreFile
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "API_BASE_URL", buildConfigString(debugApiBaseUrl))
            buildConfigField("String", "WEB_BASE_URL", buildConfigString(debugWebBaseUrl))
            manifestPlaceholders["hbxUsesCleartextTraffic"] =
                (debugApiBaseUrl.startsWith("http://") || debugWebBaseUrl.startsWith("http://")).toString()
            // A variante debug precisa atualizar o APK já instalado no aparelho de teste.
            // Mantém BuildConfig.DEBUG para ADB/Chrome DevTools, mas usa a chave local de release.
            if (releaseSigningReady) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
        create("videoStudio") {
            initWith(getByName("debug"))
            applicationIdSuffix = ".videostudio"
            versionNameSuffix = "-video"
            buildConfigField("String", "API_BASE_URL", buildConfigString(videoStudioApiBaseUrl))
            buildConfigField("String", "WEB_BASE_URL", buildConfigString(videoStudioWebBaseUrl))
            buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", buildConfigString("video-studio-local"))
            buildConfigField("boolean", "VIDEO_STUDIO", "true")
            manifestPlaceholders["hbxUsesCleartextTraffic"] = "true"
            manifestPlaceholders["hbxAppLabel"] = "HBX Video Studio"
            matchingFallbacks += listOf("debug")
        }
        release {
            // A autoridade continua no servidor; R8 apenas remove o caminho fácil de
            // copiar nomes/classes e reduz a superfície do APK distribuído.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            if (releaseSigningReady) {
                signingConfig = signingConfigs.getByName("release")
            } else {
                val querRelease = gradle.startParameter.taskNames.any {
                    it.contains("Release", ignoreCase = true) || it.contains("bundle", ignoreCase = true)
                }
                if (querRelease) {
                    throw GradleException(
                        "Assinatura Android de release não configurada. Use EntregaShell/keystore.properties " +
                            "com storeFile/storePassword/keyAlias/keyPassword ou as variáveis " +
                            "HBX_ANDROID_STORE_FILE/HBX_ANDROID_STORE_PASSWORD/HBX_ANDROID_KEY_ALIAS/" +
                            "HBX_ANDROID_KEY_PASSWORD. Diagnóstico: storeFile=${releaseStoreFile?.isFile == true}, " +
                            "storePassword=${releaseStorePassword.isNotBlank()}, keyAlias=${releaseKeyAlias.isNotBlank()}, " +
                            "keyPassword=${releaseKeyPassword.isNotBlank()}. Sem ela não sai .aab de release."
                    )
                }
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }
}

// 🔴 AQUI MORAVA O OVERRIDE DE ENDEREÇO DA BANCADA — não ressuscitar.
// Existia um `androidComponents.onVariants(selector().withFlavor("experience" to
// "logistica2"))` que FORÇAVA API_BASE_URL/WEB_BASE_URL a partir do
// `logistica2.properties`, cujo default era `http://localhost:3000`. Ele saiu
// junto com o flavor na FUSÃO de 07/08.
//
// Por que o aviso: em 07/08 esse bloco derrubou o app de verdade — o APK saiu
// apontando pro localhost e o pareamento "expirava" (o servidor aceitava o
// código, o `MobileEntrySession.validatedEntryUri` comparava HOST com HOST e
// recusava a entrada, com cara de código errado). Se um dia voltar a existir um
// flavor de bancada, ele NUNCA pode ser o flavor que vai pro cliente.
//
// Hoje o endereço do `logistica` vem de um lugar só: `productionApiBaseUrl` /
// `productionWebBaseUrl` no `defaultConfig` (release) e `debugApiBaseUrl` /
// `debugWebBaseUrl` no buildType `debug` — que caem no MESMO valor de produção
// quando ninguém passa `-PhbxApiBaseUrl`. Pra rodar contra o notebook, é
// `-PhbxApiBaseUrl=http://localhost:3000 -PhbxWebBaseUrl=http://localhost:3001`
// na linha de comando: some quando o comando acaba, não fica preso num arquivo.

// Recarga é função geral do sistema: os dois APKs usam o mesmo checkout
// isolado, sem duplicar os arquivos sensíveis do frontend.
val generatedVendasCheckoutAssets = layout.buildDirectory.dir("generated/vendasCheckoutAssets")
val prepareVendasCheckoutAssets = tasks.register<Sync>("prepareVendasCheckoutAssets") {
    into(generatedVendasCheckoutAssets)
    from("src/logistica/assets/checkout") { into("checkout") }
}

android.sourceSets.getByName("vendas").assets.srcDir(generatedVendasCheckoutAssets)
tasks.configureEach {
    if (name.endsWith("VideoStudioGoogleServices")) enabled = false
    // 🔴 AQUI MORAVA O DESLIGA-PUSH DA BANCADA — não ressuscitar sem motivo.
    // O `logistica2` desligava o `GoogleServices` porque o google-services.json
    // só declara `br.com.hbxsystem` e `br.com.hbxsystem.logistica`, e o plugin
    // derruba o build ao não achar um applicationId. Com a FUSÃO de 07/08 o
    // applicationId voltou pra `.logistica`, que ESTÁ declarado — então o
    // plugin roda e o push volta a existir.
    // Por que isto tinha que ser conferido à mão: a única chamada ao Firebase
    // (`HbxMobileBridge.registrarPushToken`) vive dentro de um `runCatching`.
    // Com o plugin desligado o Firebase nunca inicializa, a chamada falha, o
    // `runCatching` engole, o app sobe normal — e o PUSH MORRE EM SILÊNCIO.
    // Ninguém percebe até o motorista parar de receber recado.
    val empacotaAssetsVendas = name.startsWith("mergeVendas") && name.endsWith("Assets")
    val validaAssetsVendas = name.contains("Vendas") && name.contains("lint", ignoreCase = true)
    if (empacotaAssetsVendas || validaAssetsVendas) {
        dependsOn(prepareVendasCheckoutAssets)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
    implementation(platform("com.google.firebase:firebase-bom:34.15.0"))
    implementation("com.google.firebase:firebase-messaging")
    testImplementation("junit:junit:4.13.2")
}
