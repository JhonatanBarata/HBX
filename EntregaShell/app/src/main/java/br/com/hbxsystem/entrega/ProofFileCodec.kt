package br.com.hbxsystem.entrega

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

data class EncodedProof(
    val bytes: ByteArray,
    val mime: String,
    val extension: String,
)

/** Reduz comprovantes antes de persistir/enviar; falha de codec mantém o original. */
object ProofFileCodec {
    private const val PHOTO_MAX_EDGE = 1600
    private const val SIGNATURE_MAX_EDGE = 1400
    private const val JPEG_QUALITY = 78

    fun normalize(type: String, original: ByteArray, originalMime: String): EncodedProof {
        if (original.isEmpty()) throw IllegalArgumentException("Comprovante vazio.")
        return runCatching {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(original, 0, original.size, bounds)
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@runCatching fallback(original, originalMime)
            val maxEdge = if (type == "assinatura") SIGNATURE_MAX_EDGE else PHOTO_MAX_EDGE
            var sample = 1
            while (bounds.outWidth / sample > maxEdge * 2 || bounds.outHeight / sample > maxEdge * 2) sample *= 2
            val decoded = BitmapFactory.decodeByteArray(
                original,
                0,
                original.size,
                BitmapFactory.Options().apply {
                    inSampleSize = sample
                    inPreferredConfig = Bitmap.Config.ARGB_8888
                },
            ) ?: return@runCatching fallback(original, originalMime)
            val oriented = rotateFromExif(decoded, original)
            val scale = minOf(1.0, maxEdge.toDouble() / maxOf(oriented.width, oriented.height).toDouble())
            val scaled = if (scale < 1.0) {
                Bitmap.createScaledBitmap(
                    oriented,
                    (oriented.width * scale).toInt().coerceAtLeast(1),
                    (oriented.height * scale).toInt().coerceAtLeast(1),
                    true,
                )
            } else {
                oriented
            }
            val output = ByteArrayOutputStream()
            val signature = type == "assinatura"
            val format = if (signature) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG
            if (!scaled.compress(format, if (signature) 100 else JPEG_QUALITY, output)) {
                return@runCatching fallback(original, originalMime)
            }
            if (scaled !== oriented) scaled.recycle()
            if (oriented !== decoded) oriented.recycle()
            decoded.recycle()
            EncodedProof(
                bytes = output.toByteArray(),
                mime = if (signature) "image/png" else "image/jpeg",
                extension = if (signature) ".png" else ".jpg",
            )
        }.getOrElse { fallback(original, originalMime) }
    }

    private fun rotateFromExif(bitmap: Bitmap, bytes: ByteArray): Bitmap {
        val orientation = runCatching {
            ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL,
            )
        }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.preScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.preScale(1f, -1f)
            else -> return bitmap
        }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    private fun fallback(bytes: ByteArray, mimeInput: String): EncodedProof {
        val mime = mimeInput.takeIf { it in setOf("image/jpeg", "image/png", "image/webp") } ?: "image/jpeg"
        val extension = when (mime) {
            "image/png" -> ".png"
            "image/webp" -> ".webp"
            else -> ".jpg"
        }
        return EncodedProof(bytes, mime, extension)
    }
}
