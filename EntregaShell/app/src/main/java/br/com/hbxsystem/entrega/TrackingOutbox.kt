package br.com.hbxsystem.entrega

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject

data class QueuedTrackingEvent(
    val rowId: Long,
    val routeId: String,
    val sessionId: String?,
    val eventId: String,
    val type: String,
    val deliveryId: String?,
    val capturedAtMs: Long,
    val pointJson: JSONObject?,
)

/**
 * Outbox SQLite durável. Pontos e marcos ficam no aparelho até o VPS confirmar
 * os IDs; fechar o WebView, matar o processo ou perder a rede não apaga a fila.
 */
class TrackingOutbox private constructor(context: Context) : SQLiteOpenHelper(
    context.applicationContext,
    DATABASE_NAME,
    null,
    DATABASE_VERSION,
) {
    companion object {
        /**
         * 🔴 UM HELPER SÓ POR PROCESSO (17/08 — logcat do dono, junto do loop de
         *    409: "A SQLiteConnection object for database
         *    'hbx_tracking_outbox.db' was leaked!"). Cada `TrackingOutbox(ctx)`
         *    abria conexão nova e ninguém fechava; o dreno instanciava a cada
         *    flush, a cada heartbeat e a cada job do scheduler. Helper
         *    compartilhado é a recomendação do Android e fecha o vazamento —
         *    de quebra serializa o acesso ao banco, que é justamente o que os
         *    `@Synchronized` daqui já assumiam ao proteger só a própria
         *    instância. Ninguém chama `close()`: o helper vive com o processo.
         */
        @Volatile
        private var instancia: TrackingOutbox? = null

        fun get(context: Context): TrackingOutbox = instancia ?: synchronized(this) {
            instancia ?: TrackingOutbox(context.applicationContext).also { instancia = it }
        }

        private const val DATABASE_NAME = "hbx_tracking_outbox.db"
        private const val DATABASE_VERSION = 2
        private const val MAX_REJECTED_ROWS = 100

        /**
         * 🔴 O TETO QUE FALTAVA (17/08). O mapa de códigos do 409 cobre o que a
         *    gente conhece hoje; ESTE número cobre o que ainda não aconteceu.
         *    Qualquer item que falhe tantas vezes seguidas para de ser tentado —
         *    não importa o status, o código ou o motivo. É o disjuntor: sem ele,
         *    todo erro novo que ninguém mapeou vira o loop de novo.
         *
         *    25 é folgado de propósito. O dreno roda por JobScheduler com backoff
         *    exponencial a partir de 30 s, então 25 falhas é MUITO mais que uma
         *    passagem ruim de túnel — chegou aqui, não é falta de sinal.
         */
        private const val MAX_ATTEMPTS = 25
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE tracking_routes (
                route_id TEXT PRIMARY KEY,
                session_id TEXT,
                start_pending INTEGER NOT NULL DEFAULT 1,
                terminal_error TEXT,
                attempts INTEGER NOT NULL DEFAULT 0,
                updated_at_ms INTEGER NOT NULL
            )
            """.trimIndent(),
        )
        db.execSQL(
            """
            CREATE TABLE tracking_points (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                route_id TEXT NOT NULL,
                session_id TEXT,
                client_point_id TEXT NOT NULL UNIQUE,
                sequence_no INTEGER NOT NULL,
                captured_at_ms INTEGER NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                accuracy_m REAL NOT NULL,
                speed_mps REAL,
                bearing_deg REAL,
                event_type TEXT NOT NULL,
                delivery_id TEXT,
                created_at_ms INTEGER NOT NULL
            )
            """.trimIndent(),
        )
        db.execSQL("CREATE INDEX tracking_points_route_sequence_idx ON tracking_points(route_id, sequence_no)")
        db.execSQL(
            """
            CREATE TABLE tracking_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                route_id TEXT NOT NULL,
                session_id TEXT,
                event_id TEXT NOT NULL UNIQUE,
                event_type TEXT NOT NULL,
                delivery_id TEXT,
                captured_at_ms INTEGER NOT NULL,
                point_json TEXT,
                attempts INTEGER NOT NULL DEFAULT 0,
                created_at_ms INTEGER NOT NULL
            )
            """.trimIndent(),
        )
        db.execSQL("CREATE INDEX tracking_events_route_id_idx ON tracking_events(route_id, id)")
        db.execSQL(
            """
            CREATE TABLE tracking_rejected (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_kind TEXT NOT NULL,
                item_id TEXT NOT NULL,
                rejection_code TEXT NOT NULL,
                payload_json TEXT,
                rejected_at_ms INTEGER NOT NULL
            )
            """.trimIndent(),
        )
    }

    /**
     * v1 → v2: coluna do contador de tentativas. Aditiva e idempotente — banco
     * de aparelho não tem janela de manutenção, então migration aqui só pode
     * SOMAR. `runCatching` porque um APK que já subiu a coluna não pode quebrar
     * ao reabrir o banco.
     */
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) {
            runCatching { db.execSQL("ALTER TABLE tracking_events ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0") }
            runCatching { db.execSQL("ALTER TABLE tracking_routes ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0") }
        }
    }

    @Synchronized
    fun ensureRoute(routeId: String, hintedSessionId: String? = null) {
        if (routeId.isBlank()) return
        val values = ContentValues().apply {
            put("route_id", routeId)
            hintedSessionId?.takeIf(String::isNotBlank)?.let { put("session_id", it) }
            // Mesmo com hint do web, /start precisa rodar para o VPS vincular a
            // sessão ao MobileDevice autenticado.
            put("start_pending", 1)
            put("updated_at_ms", System.currentTimeMillis())
        }
        writableDatabase.insertWithOnConflict("tracking_routes", null, values, SQLiteDatabase.CONFLICT_IGNORE)
        if (!hintedSessionId.isNullOrBlank()) {
            writableDatabase.update(
                "tracking_routes",
                ContentValues().apply {
                    put("session_id", hintedSessionId)
                    put("updated_at_ms", System.currentTimeMillis())
                },
                "route_id = ?",
                arrayOf(routeId),
            )
        }
    }

    @Synchronized
    fun markSession(routeId: String, sessionId: String) {
        writableDatabase.insertWithOnConflict(
            "tracking_routes",
            null,
            ContentValues().apply {
                put("route_id", routeId)
                put("session_id", sessionId)
                put("start_pending", 0)
                putNull("terminal_error")
                put("updated_at_ms", System.currentTimeMillis())
            },
            SQLiteDatabase.CONFLICT_IGNORE,
        )
        writableDatabase.update(
            "tracking_routes",
            ContentValues().apply {
                put("session_id", sessionId)
                put("start_pending", 0)
                putNull("terminal_error")
                put("updated_at_ms", System.currentTimeMillis())
            },
            "route_id = ?",
            arrayOf(routeId),
        )
    }

    @Synchronized
    fun isStartPending(routeId: String): Boolean {
        readableDatabase.query(
            "tracking_routes",
            arrayOf("start_pending"),
            "route_id = ? AND terminal_error IS NULL",
            arrayOf(routeId),
            null,
            null,
            null,
            "1",
        ).use { cursor ->
            return !cursor.moveToFirst() || cursor.getInt(0) != 0
        }
    }

    @Synchronized
    fun markRouteTerminal(routeId: String, code: String) {
        writableDatabase.update(
            "tracking_routes",
            ContentValues().apply {
                put("start_pending", 0)
                put("terminal_error", code.take(100))
                put("updated_at_ms", System.currentTimeMillis())
            },
            "route_id = ?",
            arrayOf(routeId),
        )
    }

    @Synchronized
    fun hintedSessionId(routeId: String): String? {
        readableDatabase.query(
            "tracking_routes",
            arrayOf("session_id"),
            "route_id = ?",
            arrayOf(routeId),
            null,
            null,
            null,
            "1",
        ).use { cursor ->
            return if (cursor.moveToFirst()) cursor.optionalString("session_id") else null
        }
    }

    @Synchronized
    fun enqueuePoint(point: TrackingPoint): Boolean {
        val values = ContentValues().apply {
            put("route_id", point.routeId)
            put("session_id", point.sessionId)
            put("client_point_id", point.clientPointId)
            put("sequence_no", point.sequence)
            put("captured_at_ms", point.capturedAtMs)
            put("latitude", point.latitude)
            put("longitude", point.longitude)
            put("accuracy_m", point.accuracyM)
            point.speedMps?.let { put("speed_mps", it) }
            point.bearingDeg?.let { put("bearing_deg", it) }
            put("event_type", point.eventType.name)
            point.deliveryId?.let { put("delivery_id", it) }
            put("created_at_ms", System.currentTimeMillis())
        }
        return writableDatabase.insertWithOnConflict(
            "tracking_points",
            null,
            values,
            SQLiteDatabase.CONFLICT_IGNORE,
        ) != -1L
    }

    @Synchronized
    fun enqueueEvent(event: TrackingEvent): Boolean {
        require(event.type == TrackingPointEvent.ARRIVAL || event.type == TrackingPointEvent.END)
        val values = ContentValues().apply {
            put("route_id", event.routeId)
            put("session_id", event.sessionId)
            put("event_id", event.eventId)
            put("event_type", event.type.name)
            event.deliveryId?.let { put("delivery_id", it) }
            put("captured_at_ms", event.capturedAtMs)
            event.point?.let { put("point_json", it.toApiJson().toString()) }
            put("created_at_ms", System.currentTimeMillis())
        }
        return writableDatabase.insertWithOnConflict(
            "tracking_events",
            null,
            values,
            SQLiteDatabase.CONFLICT_IGNORE,
        ) != -1L
    }

    @Synchronized
    fun pendingRouteIds(): List<String> {
        val result = linkedSetOf<String>()
        readableDatabase.rawQuery(
            "SELECT route_id FROM tracking_routes WHERE start_pending = 1 AND terminal_error IS NULL " +
                "UNION SELECT p.route_id FROM tracking_points p " +
                "LEFT JOIN tracking_routes r ON r.route_id = p.route_id WHERE r.terminal_error IS NULL " +
                "UNION SELECT e.route_id FROM tracking_events e " +
                "LEFT JOIN tracking_routes r ON r.route_id = e.route_id WHERE r.terminal_error IS NULL",
            null,
        ).use { cursor ->
            while (cursor.moveToNext()) cursor.getString(0)?.takeIf(String::isNotBlank)?.let(result::add)
        }
        return result.toList()
    }

    @Synchronized
    fun points(routeId: String, limit: Int): List<TrackingPoint> {
        val result = mutableListOf<TrackingPoint>()
        readableDatabase.query(
            "tracking_points",
            null,
            "route_id = ?",
            arrayOf(routeId),
            null,
            null,
            "sequence_no ASC, id ASC",
            limit.coerceIn(1, 100).toString(),
        ).use { cursor ->
            while (cursor.moveToNext()) result.add(cursor.toTrackingPoint())
        }
        return result
    }

    @Synchronized
    fun events(routeId: String, limit: Int = 20): List<QueuedTrackingEvent> {
        val result = mutableListOf<QueuedTrackingEvent>()
        readableDatabase.query(
            "tracking_events",
            null,
            "route_id = ?",
            arrayOf(routeId),
            null,
            null,
            "id ASC",
            limit.coerceIn(1, 50).toString(),
        ).use { cursor ->
            while (cursor.moveToNext()) {
                val rawPoint = cursor.optionalString("point_json")
                result.add(
                    QueuedTrackingEvent(
                        rowId = cursor.long("id"),
                        routeId = cursor.string("route_id"),
                        sessionId = cursor.optionalString("session_id"),
                        eventId = cursor.string("event_id"),
                        type = cursor.string("event_type"),
                        deliveryId = cursor.optionalString("delivery_id"),
                        capturedAtMs = cursor.long("captured_at_ms"),
                        pointJson = rawPoint?.let { runCatching { JSONObject(it) }.getOrNull() },
                    ),
                )
            }
        }
        return result
    }

    @Synchronized
    fun deletePoints(clientPointIds: Collection<String>) {
        if (clientPointIds.isEmpty()) return
        val ids = clientPointIds.distinct()
        val placeholders = ids.joinToString(",") { "?" }
        writableDatabase.delete("tracking_points", "client_point_id IN ($placeholders)", ids.toTypedArray())
    }

    @Synchronized
    fun deleteEvent(eventId: String) {
        writableDatabase.delete("tracking_events", "event_id = ?", arrayOf(eventId))
    }

    @Synchronized
    fun clearEventPoint(eventId: String) {
        writableDatabase.update(
            "tracking_events",
            ContentValues().apply { putNull("point_json") },
            "event_id = ?",
            arrayOf(eventId),
        )
    }

    @Synchronized
    fun hasPendingEnd(routeId: String): Boolean {
        readableDatabase.rawQuery(
            "SELECT 1 FROM tracking_events WHERE route_id = ? AND event_type = 'END' LIMIT 1",
            arrayOf(routeId),
        ).use { return it.moveToFirst() }
    }

    @Synchronized
    fun cleanupRouteIfEmpty(routeId: String) {
        writableDatabase.execSQL(
            """
            DELETE FROM tracking_routes
            WHERE route_id = ?
              AND NOT EXISTS (SELECT 1 FROM tracking_points WHERE route_id = ?)
              AND NOT EXISTS (SELECT 1 FROM tracking_events WHERE route_id = ?)
            """.trimIndent(),
            arrayOf(routeId, routeId, routeId),
        )
    }

    @Synchronized
    fun quarantine(kind: String, itemId: String, code: String, payload: JSONObject?) {
        writableDatabase.beginTransaction()
        try {
            writableDatabase.insert(
                "tracking_rejected",
                null,
                ContentValues().apply {
                    put("item_kind", kind.take(24))
                    put("item_id", itemId.take(100))
                    put("rejection_code", code.take(100))
                    payload?.let { put("payload_json", it.toString().take(8_000)) }
                    put("rejected_at_ms", System.currentTimeMillis())
                },
            )
            writableDatabase.execSQL(
                "DELETE FROM tracking_rejected WHERE id NOT IN " +
                    "(SELECT id FROM tracking_rejected ORDER BY id DESC LIMIT $MAX_REJECTED_ROWS)",
            )
            writableDatabase.setTransactionSuccessful()
        } finally {
            writableDatabase.endTransaction()
        }
    }

    fun hasPending(): Boolean = pendingRouteIds().isNotEmpty()

    /**
     * Conta a falha e diz se este item já estourou o teto. Chamado SÓ quando o
     * dreno decidiu "tenta de novo": sucesso, terminal e quarentena não passam
     * por aqui, então o contador mede insistência inútil, não uso normal.
     */
    @Synchronized
    fun bumpEventAttempts(eventId: String): Boolean {
        writableDatabase.execSQL(
            "UPDATE tracking_events SET attempts = attempts + 1 WHERE event_id = ?",
            arrayOf(eventId),
        )
        return readAttempts("tracking_events", "event_id", eventId) >= MAX_ATTEMPTS
    }

    @Synchronized
    fun bumpRouteAttempts(routeId: String): Boolean {
        writableDatabase.execSQL(
            "UPDATE tracking_routes SET attempts = attempts + 1 WHERE route_id = ?",
            arrayOf(routeId),
        )
        return readAttempts("tracking_routes", "route_id", routeId) >= MAX_ATTEMPTS
    }

    /** Passou uma vez, o caminho está vivo: o teto volta ao zero. */
    @Synchronized
    fun resetRouteAttempts(routeId: String) {
        writableDatabase.execSQL(
            "UPDATE tracking_routes SET attempts = 0 WHERE route_id = ? AND attempts <> 0",
            arrayOf(routeId),
        )
    }

    private fun readAttempts(table: String, column: String, id: String): Int {
        readableDatabase.rawQuery(
            "SELECT attempts FROM $table WHERE $column = ? LIMIT 1",
            arrayOf(id),
        ).use { cursor ->
            return if (cursor.moveToFirst()) cursor.getInt(0) else 0
        }
    }

    private fun Cursor.toTrackingPoint(): TrackingPoint = TrackingPoint(
        routeId = string("route_id"),
        sessionId = optionalString("session_id"),
        clientPointId = string("client_point_id"),
        sequence = long("sequence_no"),
        capturedAtMs = long("captured_at_ms"),
        latitude = double("latitude"),
        longitude = double("longitude"),
        accuracyM = double("accuracy_m"),
        speedMps = optionalDouble("speed_mps"),
        bearingDeg = optionalDouble("bearing_deg"),
        eventType = runCatching { TrackingPointEvent.valueOf(string("event_type")) }
            .getOrDefault(TrackingPointEvent.PERIODIC),
        deliveryId = optionalString("delivery_id"),
    )

    private fun Cursor.index(column: String): Int = getColumnIndexOrThrow(column)
    private fun Cursor.string(column: String): String = getString(index(column))
    private fun Cursor.optionalString(column: String): String? =
        index(column).let { if (isNull(it)) null else getString(it) }
    private fun Cursor.long(column: String): Long = getLong(index(column))
    private fun Cursor.double(column: String): Double = getDouble(index(column))
    private fun Cursor.optionalDouble(column: String): Double? =
        index(column).let { if (isNull(it)) null else getDouble(it) }
}
