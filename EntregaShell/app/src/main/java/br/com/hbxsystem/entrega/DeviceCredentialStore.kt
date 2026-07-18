package br.com.hbxsystem.entrega

import android.content.Context
import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Guarda a credencial duradoura do aparelho criptografada por uma chave que
 * nunca sai do Android Keystore. O installationId não é segredo: identifica
 * esta instalação e permanece estável até os dados do app serem apagados.
 */
class DeviceCredentialStore(context: Context) {
    private val appContext = context.applicationContext
    companion object {
        private const val PREFS = "hbx_mobile_pairing"
        private const val KEY_INSTALLATION_ID = "installation_id"
        private const val KEY_TOKEN_IV = "device_token_iv"
        private const val KEY_TOKEN_CIPHER = "device_token_cipher"
        private const val KEYSTORE_ALIAS = "hbx_mobile_device_credential_v1"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }

    private val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun installationId(): String {
        val existing = prefs.getString(KEY_INSTALLATION_ID, null)?.trim().orEmpty()
        if (existing.isNotEmpty()) return existing
        val created = "hbx_install_${UUID.randomUUID()}"
        prefs.edit().putString(KEY_INSTALLATION_ID, created).apply()
        return created
    }

    // FIX 18/07 — ANDROID_ID sobrevive a desinstalar/reinstalar o app (ao
    // contrário do installationId, que mora em SharedPreferences e é apagado
    // junto com os dados do app). O backend usa isto pra reconhecer "mesmo
    // celular reconectando" em vez de abrir um cadastro de aparelho novo.
    // Não é segredo; pode voltar null em ROMs/emuladores atípicos.
    fun hardwareId(): String? = runCatching {
        Settings.Secure.getString(appContext.contentResolver, Settings.Secure.ANDROID_ID)
    }.getOrNull()?.trim()?.takeIf { it.isNotEmpty() }

    fun saveDeviceToken(token: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        prefs.edit()
            .putString(KEY_TOKEN_IV, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString(KEY_TOKEN_CIPHER, Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .apply()
    }

    fun readDeviceToken(): String? {
        val ivText = prefs.getString(KEY_TOKEN_IV, null) ?: return null
        val cipherText = prefs.getString(KEY_TOKEN_CIPHER, null) ?: return null
        return runCatching {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            val iv = Base64.decode(ivText, Base64.NO_WRAP)
            val encrypted = Base64.decode(cipherText, Base64.NO_WRAP)
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(encrypted), Charsets.UTF_8)
        }.getOrElse {
            clearDeviceToken()
            null
        }
    }

    fun clearDeviceToken() {
        prefs.edit().remove(KEY_TOKEN_IV).remove(KEY_TOKEN_CIPHER).apply()
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEYSTORE_ALIAS, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEYSTORE_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build()
        )
        return generator.generateKey()
    }
}
