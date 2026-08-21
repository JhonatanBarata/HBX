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
// ---------------------------------------------------------------------------
// A VERSÃO DE CADA APP MORA NUM ARQUIVO DO APP (19/08)
// ---------------------------------------------------------------------------
// `app/versao-<flavor>.properties` guarda o PISO do versionCode e o versionName
// de UM app — com toda a história de por que cada piso subiu. Leia lá: são as
// leis que este projeto pagou pra aprender ("piso ACIMA do maior número que
// existe em QUALQUER celular").
//
// 🔴 POR QUE SAÍRAM DAQUI: este arquivo entra na impressão digital dos DOIS
// APKs — e tem que entrar mesmo, porque o Gradle decide os dois binários. Com
// o piso morando aqui, subir o número do VENDAS mudava o hash do LOGÍSTICA e
// mandava a frota inteira de motoristas baixar ~3 MB de um APK byte-a-byte
// idêntico ao que já tinham. Alavanca de um app não pode acordar o outro.
//
// O publish continua injetando o número por propriedade
// (`-Phbx<App>VersionCode=N`, decidido em scripts/ops/deploy-vps.js pela
// digital dos fontes); o arquivo é o PISO, que vale no build local e nunca
// deixa o publish carimbar abaixo dele.
fun versaoDoApp(flavor: String): Properties {
    val arquivo = file("versao-$flavor.properties")
    // Reprova ALTO se faltar: sem piso o flavor herdaria o `versionCode = 9` do
    // defaultConfig, que é exatamente o defeito que congelou o Vendas em campo
    // de 15/07 a 19/08 — e o build ficaria VERDE enquanto isso acontecia.
    if (!arquivo.exists()) {
        throw GradleException("Falta ${arquivo.path}: é ele que guarda o piso do versionCode do flavor \"$flavor\".")
    }
    // UTF-8 explícito: `Properties.load(InputStream)` decodifica em ISO-8859-1 e
    // o arquivo é quase todo comentário acentuado. Comentário só é descartado
    // DEPOIS de decodificado — decodificar errado é convite a susto.
    return Properties().apply { arquivo.inputStream().reader(Charsets.UTF_8).use { load(it) } }
}

fun versionCodeDoApp(flavor: String, propriedade: String): Int {
    val piso = versaoDoApp(flavor).getProperty("versionCode")?.trim()?.toIntOrNull()
        ?: throw GradleException("versao-$flavor.properties sem `versionCode=N` legível.")
    return (project.findProperty(propriedade) as String?)?.toIntOrNull()?.coerceAtLeast(piso) ?: piso
}

fun versionNameDoApp(flavor: String): String =
    versaoDoApp(flavor).getProperty("versionName")?.trim()?.takeIf { it.isNotEmpty() }
        ?: throw GradleException("versao-$flavor.properties sem `versionName=` legível.")

val hbxVendasVersionCode = versionCodeDoApp("vendas", "hbxVendasVersionCode")

// ---------------------------------------------------------------------------
// O LOGISTICA E UM APP DE LOJA. SO ISSO. (20/08/2026 - ordem do dono)
// ---------------------------------------------------------------------------
// Ate hoje o HBX Logistica vivia de APK baixado de hbxsystem.com.br e se
// atualizava sozinho. A partir daqui ele existe SO na Google Play -- e essa
// decisao APAGA trabalho em vez de criar: o auto-update inteiro virou codigo
// morto e foi DELETADO (o Vendas nunca se auto-atualizou -- "o de vendas vem
// da loja" ja estava escrito no proprio codigo), a permissao
// REQUEST_INSTALL_PACKAGES sumiu dos DOIS APKs, e nao sobrou divisao de canal
// nenhuma pra manter: o canal E o flavor.
//
// 🔴 O PRECO, escrito aqui pra ninguem se surpreender depois: a casca inteira
// do app (mock.js + ponte.js) viaja DENTRO do binario. Sem auto-update, todo
// ajuste de tela passa a esperar a revisao da Play -- hoje isso levava minutos.
// A saida legitima existe e a propria politica do Google a abre: JavaScript em
// WebView e a EXCECAO EXPRESSA da regra de auto-atualizacao, entao servir a
// casca do VPS devolve a correcao em minutos sem violar nada. Enquanto isso
// nao existir, bug de campo custa uma revisao. Ver docs/Rules/ANDROID-PLAY.md.
val hbxLogisticaVersionCode = versionCodeDoApp("logistica", "hbxLogisticaVersionCode")

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
    // 36 = Android 16. A Play passa a EXIGIR isso em 31/08/2026, para app novo e
    // para toda atualização (docs/Rules/ANDROID-PLAY.md §1). Correr para enviar
    // com 35 antes do prazo compra 11 dias e nada mais: depois da data, qualquer
    // atualização — inclusive dentro do teste fechado de 14 dias — já cobra o 36.
    // A ferramenta (AGP 8.9.1 / Gradle 8.11.1) subiu numa leva ANTES desta,
    // justamente para que qualquer quebra aqui tenha um suspeito só.
    compileSdk = 36

    defaultConfig {
        applicationId = "br.com.hbxsystem"
        minSdk = 26
        // 🔴 O QUE O 36 MUDA NESTE APP, e onde cada coisa foi tratada:
        // · edge-to-edge deixa de ter opt-out → as telas nativas que não tratavam
        //   inset passaram a tratar (Pairing, Opening, RechargeCheckout,
        //   MobileAction); statusBarColor/navigationBarColor do tema pararam de
        //   valer e viraram fundo de layout de verdade.
        // · screenOrientation="portrait" é IGNORADO em tela >= 600dp → opt-out
        //   temporário declarado no AndroidManifest (vale até a API 37).
        // · cota de JobScheduler passa a valer para job rodando junto com
        //   foreground service → atinge as duas outboxes durante a rota. Isso é
        //   MEDIÇÃO no aparelho, não conserto de build: ver §6 do Rules.
        // · predictive back e páginas de 16 KB: já estavam conformes, medidos.
        targetSdk = 36
        versionCode = 9
        versionName = "2.0.1"
        buildConfigField("String", "API_BASE_URL", buildConfigString(productionApiBaseUrl))
        buildConfigField("String", "WEB_BASE_URL", buildConfigString(productionWebBaseUrl))
        buildConfigField("String", "APP_MODE", buildConfigString("vendas"))
        buildConfigField("boolean", "VIDEO_STUDIO", "false")
        // HBX_V2 = "esta variante roda a casca 2.0, com abertura ÚNICA". Desde
        // 19/08 os DOIS flavors de produto a ligam (cada um no bloco dele); o
        // `false` daqui é o piso do que sobra — a variante `videostudio` e
        // qualquer flavor futuro, que não têm casca 2.0 e ainda precisam da
        // cortina antiga. Ligar por default faria um app SEM casca nova nascer
        // sem abertura nenhuma.
        buildConfigField("boolean", "HBX_V2", "false")
        // HBX_PLAY = "este binário vai para a Google Play". Quem lê: o Kotlin
        // (fecha a ponte de compra e a Activity de checkout) e o JS, por
        // `window.HBX.info().play`. O default é FALSE e quem liga é o FLAVOR —
        // hoje só o `logistica`. O Vendas continua fora da Play, e por isso
        // continua vendendo recarga normalmente.
        buildConfigField("boolean", "HBX_PLAY", "false")
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", buildConfigString(googleWebClientId))
        manifestPlaceholders["hbxUsesCleartextTraffic"] = "false"
        manifestPlaceholders["hbxAppLabel"] = "HBX Vendas"
    }

    flavorDimensions += "experience"
    productFlavors {
        create("vendas") {
            dimension = "experience"
            applicationId = "br.com.hbxsystem"
            // O número deste app agora ANDA — quem o injeta é o publish
            // (-PhbxVendasVersionCode), e quem garante o piso é o
            // app/versao-vendas.properties. Herdar o `versionCode = 9` do
            // defaultConfig era o que mantinha todo Salehbx.apk publicado
            // carimbado igual, e todo aparelho em campo cego pra qualquer
            // correção — a história inteira está no arquivo do piso.
            versionCode = hbxVendasVersionCode
            // NOME E NÚMERO SAEM DO MESMO ARQUIVO (app/versao-vendas.properties),
            // porque quem monta o `version-vendas.json` é o publish
            // (readFlavorVersion em scripts/ops/deploy-vps.js) e ele precisa ler
            // EXATAMENTE o que entra no binário. Enquanto o nome era um literal
            // aqui, o publish tinha de adivinhá-lo com regex no meio de um arquivo
            // que é mais comentário que código — e em 19/08 essa regex casou
            // dentro de uma FRASE. Arquivo de dados não tem essa ambiguidade.
            versionName = versionNameDoApp("vendas")
            buildConfigField("String", "APP_MODE", buildConfigString("vendas"))
            // 🔴 HBX_V2 LIGADO EM 19/08, junto com a PONTE deste app. Ele decide
            // a abertura ÚNICA, e a conta é literal: com `false`, a
            // `MainActivity` monta a cortina ANTIGA por cima da nova
            // (`if (!BuildConfig.HBX_V2) mountOpeningOverlay`, MainActivity.kt)
            // e ainda soma 1.630 ms de espera antes de mostrar a WebView
            // (`mainHandoffVisibleAt`, MainActivity.kt) — ou seja, DUAS aberturas
            // em sequência para o mesmo toque, com a segunda (a boa) começando
            // depois de um segundo e meio de tela parada.
            // Até esta leva o `false` estava certo: o app de Vendas ainda era a
            // maquete e a casca 2.0 dele não tinha ponte, então a única cena de
            // abertura era mesmo a antiga. Com a casca 2.0 viva dentro do APK, o
            // motivo daquele `false` morreu — e o que ele passou a produzir é o
            // defeito que ele existia pra evitar.
            buildConfigField("boolean", "HBX_V2", "true")
            manifestPlaceholders["hbxAppLabel"] = "HBX Vendas"
        }
        create("logistica") {
            dimension = "experience"
            applicationId = "br.com.hbxsystem.logistica"
            versionCode = hbxLogisticaVersionCode
            // Nome e número vêm de app/versao-logistica.properties — o mesmo
            // arquivo que o publish lê pra montar o version-logistica.json, e o
            // mesmo lugar onde mora a história de cada subida de piso.
            versionName = versionNameDoApp("logistica")
            // 🔴 ESTE APP É DA LOJA. É esta linha que apaga a vitrine de recarga
            // (preço, pacotes e o botão que cobra no cartão) e fecha a ponte de
            // compra no Kotlin. Ver docs/Rules/ANDROID-PLAY.md §3.2: a isenção
            // que vale aqui é a de app `consumption-only` — quem paga, paga no
            // site, e o app só ENTRA numa conta que já foi paga. O preço dela é
            // literal: zero compra dentro do app e nenhum link que leve a pagar
            // fora. Só o saldo e o extrato ficam, que é informação de conta.
            buildConfigField("boolean", "HBX_PLAY", "true")
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

// ---------------------------------------------------------------------------
// O CHECKOUT DO MERCADO PAGO — agora ENTRA por injeção, não por herança de pasta
// ---------------------------------------------------------------------------
// 🔴 ONDE ELE MORAVA E POR QUE ISSO ERA UM PROBLEMA (20/08/2026): a pasta ficava
// em `src/logistica/assets/checkout`, ou seja, DENTRO do sourceSet do logística —
// então o Gradle a empacotava no APK do logística por padrão, e a task abaixo só
// COPIAVA a mesma pasta para o vendas. Provado no merge de release: o
// `checkout/index.html` estava no bundle do logística.
//
// Esse arquivo carrega uma CSP liberando `https://sdk.mercadopago.com` e monta os
// campos seguros de número/validade/CVV do cartão. Num binário da Play isso é
// formulário de pagamento de gateway externo dentro do app — reprovação direta em
// Pagamentos, mesmo que nenhum botão chame a tela: o revisor extrai o .aab e acha,
// e o SDK remoto ainda é código carregado em runtime.
//
// Agora a pasta é NEUTRA (`src/checkout-mp/`, fora de qualquer sourceSet Android)
// e cada alvo a recebe por injeção explícita. O canal `play` simplesmente não
// injeta — e aí o .aab sai sem UM BYTE de checkout.
// PROVA: `unzip -l app-logistica-release.aab | grep checkout` tem que vir VAZIO.
val generatedVendasCheckoutAssets = layout.buildDirectory.dir("generated/vendasCheckoutAssets")
val prepareVendasCheckoutAssets = tasks.register<Sync>("prepareVendasCheckoutAssets") {
    into(generatedVendasCheckoutAssets)
    // ⚠️ O CAMINHO FICA LITERAL AQUI, e não numa `val`, de propósito: o portão
    // `tests/apk-digital-por-flavor.test.mjs` LÊ este arquivo com um regex, à
    // procura das cópias entre flavors, pra descobrir sozinho o que o Gradle
    // leva de uma pasta pra outra. Guardar o caminho numa variável deixa o
    // portão cego — e portão cego é pior que portão nenhum, porque fica verde.
    // 🔴 E pelo mesmo motivo: NÃO escrever a chamada de cópia como exemplo em
    // comentário neste arquivo. O regex não sabe o que é comentário, lê o
    // exemplo como se fosse código e vai procurar uma pasta que não existe.
    // (Aconteceu em 20/08/2026, escrevendo justamente este aviso.)
    from("src/checkout-mp/assets/checkout") { into("checkout") }
}

android.sourceSets.getByName("vendas").assets.srcDir(generatedVendasCheckoutAssets)

// O checkout do Mercado Pago NAO entra mais no APK do Logistica.
// A pasta e neutra (src/checkout-mp/, fora de qualquer sourceSet Android) e so
// o Vendas a injeta, pela task acima. O Logistica e app de loja: nao pode ter
// formulario de cartao de gateway externo dentro do binario, nem que nenhum
// botao chame a tela -- o revisor extrai o .aab e acha.
// PROVA: unzip -l app-logistica-release.aab | grep checkout tem que vir VAZIO.
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
