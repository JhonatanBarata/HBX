package br.com.hbxsystem.entrega

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject

/**
 * Bridge injetada no WebView como `window.HBXShell` (addJavascriptInterface).
 * Contrato exato em APK-SHELL.md / frontend/src/app/entrega/shell-bridge.ts —
 * não desviar. Métodos rodam numa thread própria do WebView (nunca a UI
 * thread) — por isso tudo aqui é defensivo (try/catch nunca deixa uma
 * exceção da bridge derrubar o app).
 */
class HBXShellBridge(private val context: Context) {

    @JavascriptInterface
    fun setRota(json: String) {
        try {
            val obj = JSONObject(json)
            val raioM = obj.optInt("raioM", 60)
            val paradasJson: JSONArray = obj.optJSONArray("paradas") ?: JSONArray()
            val paradas = mutableListOf<Parada>()
            for (i in 0 until paradasJson.length()) {
                val p = paradasJson.optJSONObject(i) ?: continue
                val id = p.optString("id", "")
                if (id.isEmpty()) continue
                val lat = p.optDouble("lat", Double.NaN)
                val lng = p.optDouble("lng", Double.NaN)
                if (lat.isNaN() || lng.isNaN()) continue
                paradas.add(Parada(id = id, nome = p.optString("nome", "Cliente"), lat = lat, lng = lng))
            }
            RotaState.setRota(raioM, paradas)
            if (paradas.isNotEmpty()) {
                RotaService.sync(context)
            } else {
                RotaService.requestStop(context)
            }
        } catch (e: Exception) {
            // Bridge nunca pode derrubar o WebView por causa de um JSON malformado.
        }
    }

    @JavascriptInterface
    fun clearRota() {
        try {
            RotaState.clear() // NUNCA mexe em "disparados" — só é podado no próximo setRota
            RotaService.requestStop(context)
        } catch (e: Exception) {
            // no-op
        }
    }

    @JavascriptInterface
    fun abrirMaps(url: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (e: Exception) {
            // sem app pra resolver a URL — no-op (o web cai no fallback normal)
        }
    }

    @JavascriptInterface
    fun versao(): String = "1.0"
}
