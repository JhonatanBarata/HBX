import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
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
        // Decisão batida do dono: app Android ÚNICO do HBX na Play.
        // O applicationId é IMUTÁVEL após o 1º upload — tem que ir certo aqui.
        // O namespace Kotlin (br.com.hbxsystem.entrega) fica como está: só o
        // applicationId importa pra Play; evita refactor de packages.
        applicationId = "br.com.hbxsystem"
        minSdk = 26
        targetSdk = 35
        versionCode = 5
        versionName = "1.2.0"
        buildConfigField("String", "API_BASE_URL", buildConfigString(productionApiBaseUrl))
        buildConfigField("String", "WEB_BASE_URL", buildConfigString(productionWebBaseUrl))
        manifestPlaceholders["hbxUsesCleartextTraffic"] = "false"
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
        }
        release {
            isMinifyEnabled = false
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

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
}
