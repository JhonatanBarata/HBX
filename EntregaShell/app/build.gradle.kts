import com.android.build.api.variant.BuildConfigField
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
val hbxLogisticaVersionCodeFloor = 156
val hbxLogisticaVersionCode =
    (project.findProperty("hbxLogisticaVersionCode") as String?)?.toIntOrNull()
        ?.coerceAtLeast(hbxLogisticaVersionCodeFloor)
        ?: hbxLogisticaVersionCodeFloor

// ---------------------------------------------------------------------------
// LOGHBX 2 — a bancada do app novo (06/08/2026)
// ---------------------------------------------------------------------------
// Cópia viva do Loghbx que roda contra o LOCALHOST e nunca é publicada. Ela
// existe pra receber a refatoração visual grande sem encostar no APK que o
// motorista usa hoje — por isso é um flavor SEPARADO, com applicationId
// próprio: os dois apps convivem no mesmo celular, cada um com seu ícone.
// Quando o pacote estiver pronto, os assets do logistica2 substituem os do
// logistica e o applicationId volta ao de sempre — o aparelho atualiza sozinho
// pelo aviso, sem ninguém reparear.
//
// O endereço mora FORA do git (EntregaShell/logistica2.properties) de
// propósito: `apkFingerprintRoots` do scripts/ops/deploy-vps.js hasheia
// build.gradle.kts, então trocar o IP do notebook aqui dentro carimbaria uma
// versão nova no APK de PRODUÇÃO e mandaria todo motorista baixar à toa.
val logistica2PropsFile = rootProject.file("logistica2.properties")
val logistica2Props = Properties().apply {
    if (logistica2PropsFile.exists()) {
        FileInputStream(logistica2PropsFile).use { load(it) }
    }
}

fun logistica2Url(propertyName: String, fallback: String): String =
    logistica2Props.getProperty(propertyName).orEmpty().trim().ifBlank { fallback }.trimEnd('/')

// 127.0.0.1 no celular = o notebook, via `adb reverse tcp:3000 tcp:3000`.
// Backend local é o container `backend` (porta 3000); o Next fica no 3001.
// Sem cabo, apontar para o IP da rede em logistica2.properties.
val logistica2ApiBaseUrl = logistica2Url("apiBaseUrl", "http://127.0.0.1:3000")
val logistica2WebBaseUrl = logistica2Url("webBaseUrl", "http://127.0.0.1:3001")

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
        // Só a bancada do Loghbx 2 liga esta chave. Serve para o código novo
        // separar o que é do app novo SEM inventar um APP_MODE novo (ver o
        // comentário no flavor logistica2).
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
            versionName = "beta1.3.2"
            buildConfigField("String", "APP_MODE", buildConfigString("logistica"))
            manifestPlaceholders["hbxAppLabel"] = "HBX Logística"
        }
        // Bancada do app novo — nunca entra no publish (o deploy-vps.js monta
        // só assembleLogisticaRelease e assembleVendasRelease).
        create("logistica2") {
            dimension = "experience"
            applicationId = "br.com.hbxsystem.logistica2"
            // Número fixo: este APK não tem auto-update, ele nasce do cabo.
            versionCode = 1
            versionName = "2.0.0-bancada"
            // 🔴 APP_MODE CONTINUA "logistica", de propósito. O Kotlin de main/
            // decide 40+ comportamentos comparando esta string com "logistica"
            // (NativeAppBridge, HbxMobileBridge, MainActivity, som, push). Um
            // APP_MODE "logistica2" faria cada uma dessas funções sair pela
            // porta dos fundos e o app nasceria oco. Quem separa o app novo é
            // o HBX_V2 abaixo.
            buildConfigField("String", "APP_MODE", buildConfigString("logistica"))
            buildConfigField("boolean", "HBX_V2", "true")
            manifestPlaceholders["hbxAppLabel"] = "HBX Logística 2"
            manifestPlaceholders["hbxUsesCleartextTraffic"] = "true"
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

// Na fusão do DSL o buildType VENCE o flavor — e o buildType `debug` define
// API_BASE_URL a partir de `hbxApiBaseUrl`, que por padrão é PRODUÇÃO. Sem o
// bloco abaixo, o logistica2Debug (o build que eu uso pra inspecionar a tela
// pelo Chrome DevTools) nasceria falando com o VPS em vez do localhost — que é
// exatamente o acidente que esta bancada existe pra evitar. A API de variante
// roda DEPOIS da fusão e é a única que ganha do buildType.
androidComponents {
    onVariants(selector().withFlavor("experience" to "logistica2")) { variant ->
        variant.buildConfigFields?.put(
            "API_BASE_URL",
            BuildConfigField("String", buildConfigString(logistica2ApiBaseUrl), "Bancada do Loghbx 2"),
        )
        variant.buildConfigFields?.put(
            "WEB_BASE_URL",
            BuildConfigField("String", buildConfigString(logistica2WebBaseUrl), "Bancada do Loghbx 2"),
        )
        // Mesmo motivo: o placeholder do buildType `debug` também vence o do
        // flavor, e ele calcula "false" a partir da URL de produção (https).
        // Com cleartext bloqueado o app abriria e TODA chamada ao localhost
        // morreria — com cara de backend fora do ar, não de bloqueio do Android.
        variant.manifestPlaceholders.put("hbxUsesCleartextTraffic", "true")
    }
}

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
    // O google-services.json só declara br.com.hbxsystem e .logistica, então o
    // plugin derruba o build ao não achar br.com.hbxsystem.logistica2. A
    // bancada fala com o localhost e não precisa de push; a única chamada ao
    // Firebase (HbxMobileBridge.registrarPushToken) já vive dentro de
    // runCatching, então o app sobe igual sem o Firebase inicializado.
    if (name.contains("Logistica2") && name.endsWith("GoogleServices")) enabled = false
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
