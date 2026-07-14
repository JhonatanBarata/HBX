package br.com.hbxsystem.entrega

import java.net.URI

const val HBX_NATIVE_ROUTE_BRIDGE = "HBXNativeRouteBridge"

/** Shim compatível com a API web existente, instalado somente no top frame HBX. */
val HBX_SHELL_TOP_FRAME_SHIM = """
    (() => {
      if (window !== window.top) return;
      const transport = window.$HBX_NATIVE_ROUTE_BRIDGE;
      if (!transport || typeof transport.postMessage !== 'function') return;
      const send = (type, payload) => transport.postMessage(JSON.stringify({ type, payload }));
      const shell = Object.freeze({
        setRota: (json) => { if (typeof json === 'string') send('setRota', json); },
        clearRota: () => send('clearRota', null),
        abrirMaps: (url) => { if (typeof url === 'string') send('abrirMaps', url); },
        versao: () => '3.0'
      });
      try {
        Object.defineProperty(window, 'HBXShell', {
          value: shell, configurable: false, enumerable: false, writable: false
        });
      } catch (_) {}
    })();
""".trimIndent()

/** Origem exata; nunca devolve wildcard, path, query, fragment ou credencial. */
fun canonicalHbxWebOrigin(baseUrl: String, debug: Boolean): String? {
    val uri = runCatching { URI(baseUrl.trim()) }.getOrNull() ?: return null
    val path = uri.rawPath.orEmpty()
    if (path.isNotEmpty() && path != "/") return null
    if (uri.rawQuery != null || uri.rawFragment != null || uri.userInfo != null) return null
    return webOriginForUrl(baseUrl, debug)
}

/** Extrai a origem de uma URL de navegação, aceitando path mas não user-info. */
fun webOriginForUrl(url: String, debug: Boolean): String? {
    val uri = runCatching { URI(url.trim()) }.getOrNull() ?: return null
    val scheme = uri.scheme?.lowercase() ?: return null
    if (scheme != "https" && !(debug && scheme == "http")) return null
    if (uri.userInfo != null) return null
    val host = uri.host?.lowercase()?.takeIf(String::isNotBlank) ?: return null
    val hostText = if (host.contains(':') && !host.startsWith("[")) "[$host]" else host
    val portText = if (uri.port >= 0) ":${uri.port}" else ""
    return "$scheme://$hostText$portText"
}
