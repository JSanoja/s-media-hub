package com.shub.tv

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.annotation.OptIn
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.media3.ui.SubtitleView
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Reproductor nativo (Media3/ExoPlayer): MKV, MP4, HEVC, AC3/EAC3 passthrough y subtítulos VTT.
 * Recibe {"item": Item, "startSec": n} (contrato /api/v1) y al terminar pasa al siguiente episodio.
 *
 * Control remoto: OK = play/pausa · ←/→ = −10 s/+10 s · ↑ = mostrar controles
 * · ↓ = sincronizar subtítulos (WU-18) · Atrás = salir.
 */
@OptIn(UnstableApi::class)
class PlayerActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_JSON = "json"
        const val EXTRA_RESULT_ID = "id"
        const val EXTRA_RESULT_POSITION_MS = "positionMs"
        const val EXTRA_RESULT_ENDED = "ended"
        private const val SEEK_MS = 10_000L
        private const val REPORT_EVERY_MS = 15_000L
        private const val CONTROLLER_TIMEOUT_MS = 4_000L
        private const val SYNC_STEP_MS = 500
        private const val SYNC_FINE_MS = 100
        private const val SYNC_MAX_MS = 600_000
        private const val SYNC_APPLY_DELAY_MS = 800L
        private const val SYNC_PANEL_TIMEOUT_MS = 6_000L
    }

    private var player: ExoPlayer? = null
    private lateinit var playerView: PlayerView
    private lateinit var syncPanel: TextView
    /** Ajuste de sincronización por subtítulo (id → ms) del video actual (WU-18). */
    private val subtitleOffsets = mutableMapOf<String, Int>()
    /** Subtítulo que se está ajustando (el activo al abrir el panel). */
    private var syncSubId: String? = null
    /** Hay un ajuste esperando a aplicarse (Handler.hasCallbacks es API 29+). */
    private var syncPending = false
    private var currentItem: JSONObject? = null
    private var profileToken: String? = null
    private var deviceId: String? = null
    private val io: ExecutorService = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_player)
        playerView = findViewById(R.id.player_view)
        syncPanel = findViewById(R.id.sync_panel)

        val raw = intent.getStringExtra(EXTRA_JSON)
        if (raw == null) {
            finish()
            return
        }
        val payload = JSONObject(raw)
        profileToken = payload.optString("profileToken").ifEmpty { null }
        deviceId = payload.optString("deviceId").ifEmpty { null }
        // Tamaño de subtítulos elegido en la interfaz (Perfil → Subtítulos): 1 = pequeño (el de
        // siempre), 1.2 = mediano, 1.4 = grande. Se acota por si llega un valor raro.
        val subtitleScale = payload.optDouble("subtitleScale", 1.0).toFloat().takeIf { !it.isNaN() }?.coerceIn(0.8f, 1.6f) ?: 1f
        playerView.subtitleView?.apply {
            setApplyEmbeddedFontSizes(false)
            setFractionalTextSize(SubtitleView.DEFAULT_TEXT_SIZE_FRACTION * subtitleScale)
        }

        val exo = ExoPlayer.Builder(this)
            .setSeekBackIncrementMs(SEEK_MS)
            .setSeekForwardIncrementMs(SEEK_MS)
            .build()
        // Subtítulos: preferir español y activar los de idioma desconocido ("und").
        exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon()
            .setPreferredTextLanguage("es")
            .setSelectUndeterminedTextLanguage(true)
            .build()
        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) {
                    reportProgress(ended = true)
                    playNext()
                }
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                // Al pausar se guarda la posición (WU-09).
                if (!isPlaying && player?.playbackState == Player.STATE_READY) reportProgress(ended = false)
                // Play/pausa: el servidor sabe qué se está viendo (WU-19).
                if (isPlaying || player?.playbackState == Player.STATE_READY) heartbeat()
            }

            override fun onPlayerError(error: PlaybackException) {
                Toast.makeText(
                    this@PlayerActivity,
                    getString(R.string.player_error, error.errorCodeName),
                    Toast.LENGTH_LONG,
                ).show()
                finishWithResult(ended = false)
            }
        })
        player = exo
        playerView.player = exo
        playerView.controllerShowTimeoutMs = CONTROLLER_TIMEOUT_MS.toInt()
        // Al mostrarse los controles, el foco va a play/pausa (no a la tuerca de ajustes) y se
        // programa el autoocultado; al ocultarse, el foco vuelve al PlayerView.
        playerView.setControllerVisibilityListener(PlayerView.ControllerVisibilityListener { visibility ->
            if (visibility == View.VISIBLE) {
                playerView.findViewById<View>(androidx.media3.ui.R.id.exo_play_pause)?.requestFocus()
                scheduleAutoHide()
            } else {
                main.removeCallbacks(autoHide)
                playerView.requestFocus()
            }
        })

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (syncPanel.visibility == View.VISIBLE) closeSyncPanel() else finishWithResult(ended = false)
            }
        })

        load(payload.getJSONObject("item"), (payload.optDouble("startSec", 0.0) * 1000).toLong())
        playerView.requestFocus()
    }

    private fun load(item: JSONObject, startMs: Long) {
        currentItem = item
        closeSyncPanel()
        subtitleOffsets.clear()
        item.optJSONArray("subtitles")?.let { subs ->
            for (i in 0 until subs.length()) {
                val s = subs.getJSONObject(i)
                subtitleOffsets[s.getString("id")] = s.optInt("offsetMs", 0)
            }
        }
        player?.apply {
            setMediaItem(buildMediaItem(item, defaultSubId = null), startMs)
            prepare()
            playWhenReady = true
        }
        main.removeCallbacks(periodicReport)
        main.postDelayed(periodicReport, REPORT_EVERY_MS)
    }

    /**
     * MediaItem con los subtítulos del item, cada uno con su ajuste de sincronización en la URL
     * (?offsetMs=). `defaultSubId` = el que queda seleccionado (por defecto, el primero).
     */
    private fun buildMediaItem(item: JSONObject, defaultSubId: String?): MediaItem {
        val subtitles = mutableListOf<MediaItem.SubtitleConfiguration>()
        item.optJSONArray("subtitles")?.let { subs ->
            for (i in 0 until subs.length()) {
                val s = subs.getJSONObject(i)
                val id = s.getString("id")
                val lang = s.optString("lang")
                val offset = subtitleOffsets[id] ?: 0
                val baseUrl = s.getString("url").substringBefore('?')
                val url = if (offset != 0) "$baseUrl?offsetMs=$offset" else baseUrl
                val isDefault = if (defaultSubId != null) id == defaultSubId else i == 0
                subtitles += MediaItem.SubtitleConfiguration.Builder(Uri.parse(url))
                    .setId(id)
                    .setMimeType(MimeTypes.TEXT_VTT)
                    .setLanguage(if (lang.isEmpty() || lang == "und") null else lang)
                    .setLabel(s.optString("label"))
                    .setSelectionFlags(if (isDefault) C.SELECTION_FLAG_DEFAULT else 0)
                    .build()
            }
        }
        return MediaItem.Builder()
            .setUri(item.getString("streamUrl"))
            .setMediaId(item.getString("id"))
            .setSubtitleConfigurations(subtitles)
            .setMediaMetadata(MediaMetadata.Builder().setTitle(titleOf(item)).build())
            .build()
    }

    // ---- Sincronizar subtítulos (WU-18) ----

    /** Id (de la API) del subtítulo seleccionado ahora, o el primero si no se puede saber. */
    private fun activeSubtitleId(): String? {
        val ids = subtitleOffsets.keys
        if (ids.isEmpty()) return null
        player?.currentTracks?.groups?.forEach { group ->
            if (group.type != C.TRACK_TYPE_TEXT) return@forEach
            for (i in 0 until group.length) {
                if (!group.isTrackSelected(i)) continue
                // ExoPlayer antepone "n:" al id de los subtítulos externos.
                val formatId = group.getTrackFormat(i).id ?: continue
                ids.firstOrNull { formatId == it || formatId.endsWith(":$it") }?.let { return it }
            }
        }
        return currentItem?.optJSONArray("subtitles")?.optJSONObject(0)?.optString("id")
    }

    private fun subtitleLabel(id: String): String {
        val subs = currentItem?.optJSONArray("subtitles") ?: return ""
        for (i in 0 until subs.length()) {
            val s = subs.getJSONObject(i)
            if (s.getString("id") == id) return s.optString("label")
        }
        return ""
    }

    private fun openSyncPanel() {
        val id = activeSubtitleId()
        if (id == null) {
            Toast.makeText(this, R.string.sync_no_subtitles, Toast.LENGTH_SHORT).show()
            return
        }
        syncSubId = id
        playerView.hideController()
        syncPanel.visibility = View.VISIBLE
        renderSyncPanel()
    }

    private fun closeSyncPanel() {
        if (!::syncPanel.isInitialized) return
        syncPanel.visibility = View.GONE
        main.removeCallbacks(closeSync)
        // Si quedó un cambio pendiente, se aplica ya.
        if (syncPending) {
            main.removeCallbacks(applySync)
            applySync.run()
        }
    }

    private val closeSync = Runnable { closeSyncPanel() }

    private fun renderSyncPanel() {
        val id = syncSubId ?: return
        val ms = subtitleOffsets[id] ?: 0
        val value = String.format(java.util.Locale("es"), "%+.1f s", ms / 1000.0)
        val note = getString(
            when {
                ms > 0 -> R.string.sync_later
                ms < 0 -> R.string.sync_earlier
                else -> R.string.sync_none
            },
        )
        syncPanel.text = getString(R.string.sync_panel, subtitleLabel(id), value, note, getString(R.string.sync_hint))
        main.removeCallbacks(closeSync)
        main.postDelayed(closeSync, SYNC_PANEL_TIMEOUT_MS)
    }

    private fun nudgeSync(deltaMs: Int) {
        val id = syncSubId ?: return
        val next = ((subtitleOffsets[id] ?: 0) + deltaMs).coerceIn(-SYNC_MAX_MS, SYNC_MAX_MS)
        subtitleOffsets[id] = next
        renderSyncPanel()
        // Se aplica cuando se deja de tocar (recargar el subtítulo en cada tecla sería brusco).
        main.removeCallbacks(applySync)
        syncPending = true
        main.postDelayed(applySync, SYNC_APPLY_DELAY_MS)
    }

    /** Recarga el subtítulo con el nuevo ajuste en la misma posición y lo guarda en la API. */
    private val applySync = Runnable {
        syncPending = false
        val item = currentItem ?: return@Runnable
        val id = syncSubId ?: return@Runnable
        val p = player ?: return@Runnable
        val position = p.currentPosition
        val wasPlaying = p.playWhenReady
        p.setMediaItem(buildMediaItem(item, defaultSubId = id), position)
        p.prepare()
        p.playWhenReady = wasPlaying
        saveOffset(item.getString("id"), id, subtitleOffsets[id] ?: 0)
    }

    /** PUT /api/v1/items/:id/subtitles/:subId/offset → queda guardado para la próxima vez. */
    private fun saveOffset(itemId: String, subId: String, offsetMs: Int) {
        val base = apiBase() ?: return
        val body = JSONObject().put("offsetMs", offsetMs).toString()
        try {
            io.execute {
                try {
                    val conn = URL("$base/api/v1/items/$itemId/subtitles/$subId/offset")
                        .openConnection() as HttpURLConnection
                    conn.requestMethod = "PUT"
                    conn.connectTimeout = 5_000
                    conn.readTimeout = 5_000
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.outputStream.use { it.write(body.toByteArray()) }
                    conn.responseCode
                    conn.disconnect()
                } catch (e: Exception) {
                    // Sin red: el ajuste vale para esta reproducción, pero no queda guardado.
                }
            }
        } catch (e: java.util.concurrent.RejectedExecutionException) {
            // Pantalla cerrándose.
        }
    }

    /** Oculta los controles tras unos segundos sin teclas si está reproduciendo (aunque el foco
     *  haya quedado en un botón como la tuerca, que de otro modo los deja fijos). */
    private val autoHide = Runnable {
        if (player?.isPlaying == true) playerView.hideController() else scheduleAutoHide()
    }

    private fun scheduleAutoHide() {
        main.removeCallbacks(autoHide)
        main.postDelayed(autoHide, CONTROLLER_TIMEOUT_MS)
    }

    /** Cada 15 s: guarda la posición (si reproduce) y manda el heartbeat del dispositivo. */
    private val periodicReport: Runnable = object : Runnable {
        override fun run() {
            if (player?.isPlaying == true) reportProgress(ended = false)
            heartbeat()
            main.postDelayed(this, REPORT_EVERY_MS)
        }
    }

    /** Base de la API (esquema + host:puerto) a partir del streamUrl del video actual. */
    private fun apiBase(): String? {
        val item = currentItem ?: return null
        val stream = Uri.parse(item.getString("streamUrl"))
        return "${stream.scheme}://${stream.encodedAuthority}"
    }

    /** Heartbeat del dispositivo con lo que se está viendo (WU-19); `stopped` = ya no reproduce. */
    private fun heartbeat(stopped: Boolean = false) {
        val id = deviceId ?: return
        val base = apiBase() ?: return
        val nowPlaying = if (stopped) null else currentItem?.let { item ->
            JSONObject()
                .put("itemId", item.getString("id"))
                .put("positionSec", (player?.currentPosition ?: 0L) / 1000.0)
                .put("paused", player?.isPlaying != true)
        }
        DeviceHeartbeat.send(io, base, id, profileToken, nowPlaying)
    }

    /** PUT /api/v1/items/:id/progress con el token del perfil (si hay perfil). */
    private fun reportProgress(ended: Boolean) {
        val token = profileToken ?: return
        val item = currentItem ?: return
        val p = player ?: return
        val durationMs = p.duration.takeIf { it != C.TIME_UNSET && it > 0 }
        val positionMs = if (ended) (durationMs ?: p.currentPosition) else p.currentPosition
        val body = JSONObject()
            .put("positionSec", positionMs / 1000.0)
            .put("ended", ended)
        durationMs?.let { body.put("durationSec", it / 1000.0) }
        deviceId?.let { body.put("deviceId", it) }
        val stream = Uri.parse(item.getString("streamUrl"))
        val url = "${stream.scheme}://${stream.encodedAuthority}/api/v1/items/${item.getString("id")}/progress"
        io.execute {
            try {
                val conn = URL(url).openConnection() as HttpURLConnection
                conn.requestMethod = "PUT"
                conn.connectTimeout = 5_000
                conn.readTimeout = 5_000
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("X-Profile-Token", token)
                conn.outputStream.use { it.write(body.toString().toByteArray()) }
                conn.responseCode // fuerza el envío
                conn.disconnect()
            } catch (e: Exception) {
                // Sin red: se reintenta en el próximo reporte.
            }
        }
    }

    private fun titleOf(item: JSONObject): String {
        val title = item.optString("title").ifEmpty { item.optString("fileName") }
        return if (item.optString("type") == "episode") {
            "${item.optString("series")} · T${item.optInt("season")} E${item.optInt("episode")} — $title"
        } else {
            title
        }
    }

    /** Al terminar: pide /api/v1/items/:id/next y sigue con ese video, o vuelve a la interfaz. */
    private fun playNext() {
        val item = currentItem ?: return finishWithResult(ended = true)
        val stream = Uri.parse(item.getString("streamUrl"))
        val base = "${stream.scheme}://${stream.encodedAuthority}"
        val id = item.getString("id")
        io.execute {
            val next = try {
                val conn = URL("$base/api/v1/items/$id/next").openConnection() as HttpURLConnection
                conn.connectTimeout = 5_000
                conn.readTimeout = 5_000
                try {
                    conn.inputStream.bufferedReader().use { JSONObject(it.readText()) }.optJSONObject("next")
                } finally {
                    conn.disconnect()
                }
            } catch (e: Exception) {
                null
            }
            main.post {
                if (isFinishing || isDestroyed) return@post
                if (next != null) load(next, 0L) else finishWithResult(ended = true)
            }
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val p = player
        // Panel de sincronización abierto: las flechas ajustan, OK cierra.
        if (syncPanel.visibility == View.VISIBLE) {
            val delta = when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_LEFT -> -SYNC_STEP_MS
                KeyEvent.KEYCODE_DPAD_RIGHT -> SYNC_STEP_MS
                KeyEvent.KEYCODE_DPAD_UP -> SYNC_FINE_MS
                KeyEvent.KEYCODE_DPAD_DOWN -> -SYNC_FINE_MS
                else -> null
            }
            if (delta != null) {
                if (event.action == KeyEvent.ACTION_DOWN) nudgeSync(delta)
                return true
            }
            if (event.keyCode == KeyEvent.KEYCODE_DPAD_CENTER || event.keyCode == KeyEvent.KEYCODE_ENTER) {
                if (event.action == KeyEvent.ACTION_UP) closeSyncPanel()
                return true
            }
        }
        // Cualquier tecla con los controles visibles reinicia la cuenta del autoocultado.
        if (event.action == KeyEvent.ACTION_DOWN && playerView.isControllerFullyVisible) scheduleAutoHide()
        if (p != null && event.action == KeyEvent.ACTION_DOWN && !playerView.isControllerFullyVisible) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_MEDIA_REWIND -> {
                    p.seekBack()
                    return true
                }
                KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                    p.seekForward()
                    return true
                }
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                    p.playWhenReady = !p.playWhenReady
                    playerView.showController()
                    return true
                }
                KeyEvent.KEYCODE_DPAD_DOWN -> {
                    openSyncPanel()
                    return true
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    private fun finishWithResult(ended: Boolean) {
        main.removeCallbacks(periodicReport)
        if (!ended) reportProgress(ended = false)
        heartbeat(stopped = true)
        val data = Intent()
            .putExtra(EXTRA_RESULT_ID, currentItem?.optString("id"))
            .putExtra(EXTRA_RESULT_POSITION_MS, player?.currentPosition ?: 0L)
            .putExtra(EXTRA_RESULT_ENDED, ended)
        setResult(RESULT_OK, data)
        finish()
    }

    override fun onStart() {
        super.onStart()
        // Volviendo de Home: retoma el reporte periódico (se cortó en onStop).
        if (player != null && currentItem != null) {
            main.removeCallbacks(periodicReport)
            main.postDelayed(periodicReport, REPORT_EVERY_MS)
        }
    }

    override fun onStop() {
        super.onStop()
        player?.pause()
        // En segundo plano no se manda nada: el dispositivo pasa a inactivo a los 2 min (WU-19).
        main.removeCallbacks(periodicReport)
    }

    override fun onDestroy() {
        main.removeCallbacks(periodicReport)
        main.removeCallbacks(autoHide)
        main.removeCallbacks(closeSync)
        main.removeCallbacks(applySync)
        // shutdown (no shutdownNow): deja terminar el último reporte de progreso.
        io.shutdown()
        player?.release()
        player = null
        super.onDestroy()
    }
}
