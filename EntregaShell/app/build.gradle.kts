import java.io.FileInputStream
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
            versionCode = 4
            versionName = "1.2.0"
            buildConfigField("String", "APP_MODE", buildConfigString("logistica"))
            manifestPlaceholders["hbxAppLabel"] = "HBX Mobile"
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

// O HBX Mobile reaproveita o frontend canônico do flavor Vendas sem duplicá-lo
// no repositório. No APK Logística ele é empacotado em /assets/vendas e usa a
// mesma bridge/sessão nativa do restante do aplicativo.
val generatedMobileVendasAssets = layout.buildDirectory.dir("generated/mobileVendasAssets")
val prepareMobileVendasAssets = tasks.register<Sync>("prepareMobileVendasAssets") {
    into(generatedMobileVendasAssets)
    from("src/vendas/assets/app") { into("vendas") }
    from("src/main/assets/app") {
        include("app.css", "native.js")
        into("vendas")
    }
}

android.sourceSets.getByName("logistica").assets.srcDir(generatedMobileVendasAssets)
tasks.configureEach {
    val empacotaAssetsLogistica = name.startsWith("mergeLogistica") && name.endsWith("Assets")
    val validaAssetsLogistica = name.contains("Logistica") && name.contains("lint", ignoreCase = true)
    if (empacotaAssetsLogistica || validaAssetsLogistica) {
        dependsOn(prepareMobileVendasAssets)
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
