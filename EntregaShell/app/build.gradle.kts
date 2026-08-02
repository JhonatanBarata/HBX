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
val hbxLogisticaVersionCodeFloor = 131
val hbxLogisticaVersionCode =
    (project.findProperty("hbxLogisticaVersionCode") as String?)?.toIntOrNull()
        ?.coerceAtLeast(hbxLogisticaVersionCodeFloor)
        ?: hbxLogisticaVersionCodeFloor

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
