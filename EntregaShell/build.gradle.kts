// Root build.gradle.kts — apenas declara os plugins (sem aplicar) para o subprojeto :app.
//
// ---------------------------------------------------------------------------
// A FERRAMENTA SOBE ANTES DO SDK (20/08/2026)
// ---------------------------------------------------------------------------
// 🔴 POR QUE 8.9.1 E NÃO 8.7.3: `compileSdk = 36` (Android 16) exige AGP >= 8.9.1
// — é tabela oficial (developer.android.com/build/releases/about-agp), não
// preferência. E a Play passa a exigir targetSdk 36 em 31/08/2026 para app novo
// E para toda atualização, então o 36 não é opcional: é o pedágio de entrar na
// loja. AGP 8.9 por sua vez exige Gradle >= 8.11.1 (o wrapper subiu junto).
//
// 🔴 POR QUE A FERRAMENTA SOBE SOZINHA, NUMA LEVA SÓ: subir AGP + Gradle +
// compileSdk no mesmo commit faz qualquer quebra virar adivinhação — foi
// o Kotlin, o AGP, o Gradle ou o comportamento novo do Android 16? Com a
// ferramenta subindo primeiro e o `compileSdk` ainda em 35, o build ou passa
// (e aí o 36 é o único suspeito da leva seguinte) ou quebra por conta da
// ferramenta, isolado. Ver docs/Rules/ANDROID-PLAY.md §6.
//
// ⚠️ KOTLIN 1.9.24 É O PONTO FRÁGIL DESTA SUBIDA: o KGP 1.9.x é anterior ao AGP
// 8.9 e pode reclamar de versão não testada. Se quebrar de fato, o próximo passo
// é Kotlin 2.0.x — que troca o compilador (K2) e acorda warnings novos, e por
// isso NÃO vem preventivamente: só se o build cobrar.
plugins {
    id("com.android.application") version "8.9.1" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
    id("com.google.gms.google-services") version "4.4.4" apply false
}
