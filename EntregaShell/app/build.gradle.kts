import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Assinatura de release FORA do git: EntregaShell/keystore.properties (gitignored)
// aponta pro upload keystore em EntregaShell/keystore-release/ (gitignored).
// Sem o arquivo, qualquer task de release FALHA explicando — nunca sai .aab sem
// assinatura "por acidente" (a Play recusa bundle não assinado).
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) {
        FileInputStream(keystorePropsFile).use { load(it) }
    }
}

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

// FCM sem google-services.json no repositório. As quatro propriedades podem viver
// em ~/.gradle/gradle.properties ou ser passadas por -P no build. Sem elas o APK
// continua funcionando por fila/poll em primeiro plano, apenas sem push em background.
val firebaseProjectId = providers.gradleProperty("hbxFirebaseProjectId").orElse("").get().trim()
val firebaseApplicationId = providers.gradleProperty("hbxFirebaseApplicationId").orElse("").get().trim()
val firebaseApiKey = providers.gradleProperty("hbxFirebaseApiKey").orElse("").get().trim()
val firebaseSenderId = providers.gradleProperty("hbxFirebaseSenderId").orElse("").get().trim()

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
        buildConfigField("String", "FIREBASE_PROJECT_ID", buildConfigString(firebaseProjectId))
        buildConfigField("String", "FIREBASE_APPLICATION_ID", buildConfigString(firebaseApplicationId))
        buildConfigField("String", "FIREBASE_API_KEY", buildConfigString(firebaseApiKey))
        buildConfigField("String", "FIREBASE_SENDER_ID", buildConfigString(firebaseSenderId))
        manifestPlaceholders["hbxUsesCleartextTraffic"] = "false"
    }

    signingConfigs {
        if (keystorePropsFile.exists()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
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
            if (keystorePropsFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            } else {
                val querRelease = gradle.startParameter.taskNames.any {
                    it.contains("Release", ignoreCase = true) || it.contains("bundle", ignoreCase = true)
                }
                if (querRelease) {
                    throw GradleException(
                        "EntregaShell/keystore.properties não encontrado — a assinatura de release " +
                            "vive FORA do git. Crie o arquivo com storeFile/storePassword/keyAlias/" +
                            "keyPassword apontando pro upload keystore (EntregaShell/keystore-release/). " +
                            "Sem ele não sai .aab de release."
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
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-messaging")
}
