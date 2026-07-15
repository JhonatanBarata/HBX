package br.com.hbxsystem.entrega

/** Identidade visual compartilhada pelos APKs atuais do HBX para Android. */
internal object HbxMobileExperience {
    val premiumShell: Boolean
        get() = BuildConfig.APP_MODE == "vendas" || BuildConfig.APP_MODE == "logistica"

    val openingUrl: String
        get() = if (BuildConfig.APP_MODE == "logistica") {
            // O HBX Mobile consolidado usa a abertura aprovada do próprio app;
            // /assets/vendas fica reservado à experiência comercial interna.
            "https://appassets.androidplatform.net/assets/app/opening.html"
        } else {
            "https://appassets.androidplatform.net/assets/app/opening.html"
        }
}
