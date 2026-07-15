package br.com.hbxsystem.entrega

/** Identidade visual compartilhada pelos APKs atuais do HBX para Android. */
internal object HbxMobileExperience {
    val premiumShell: Boolean
        get() = BuildConfig.APP_MODE == "vendas" || BuildConfig.APP_MODE == "logistica"

    val openingUrl: String
        get() = if (BuildConfig.APP_MODE == "logistica") {
            // O HBX Mobile consolidado já empacota o frontend canônico de Vendas
            // em /assets/vendas; a abertura usa a mesma fonte para não divergir.
            "https://appassets.androidplatform.net/assets/vendas/opening.html"
        } else {
            "https://appassets.androidplatform.net/assets/app/opening.html"
        }
}
