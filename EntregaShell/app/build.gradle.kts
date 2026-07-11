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
        versionCode = 1
        versionName = "1.0.0"
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
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
}
