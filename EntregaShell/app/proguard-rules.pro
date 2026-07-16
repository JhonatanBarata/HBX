# A bridge só é chamada pelo nome a partir do WebView local. R8 pode ofuscar o
# restante, mas estes membros anotados precisam conservar assinatura e nome.
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault,Signature,InnerClasses,EnclosingMethod
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Componentes declarados no manifesto já são mantidos pelo Android Gradle Plugin.
# Mantém somente os modelos JSON que são construídos por reflexão de plataforma.
-keepclassmembers enum br.com.hbxsystem.entrega.** { *; }

# Não publique nomes de arquivo-fonte nem numeração original em stack traces.
-renamesourcefileattribute SourceFile
-keepattributes LineNumberTable
