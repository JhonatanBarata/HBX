plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "br.com.hbxsystem.entrega"
    compileSdk = 34

    defaultConfig {
        applicationId = "br.com.hbxsystem.entrega"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    // App sideload de 1 motorista (repo privado) — keystore + senha comitados
    // de propósito (decisão do orquestrador, ver keystore/SENHA.txt). Senha
    // igual à gerada por keytool na criação do keystore.
    signingConfigs {
        create("release") {
            storeFile = file("../keystore/hbx-entrega.jks")
            storePassword = "cFTUN9ZRRDteImsOFDE40bizNPF6JrS"
            keyAlias = "hbx-entrega"
            keyPassword = "cFTUN9ZRRDteImsOFDE40bizNPF6JrS"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
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
