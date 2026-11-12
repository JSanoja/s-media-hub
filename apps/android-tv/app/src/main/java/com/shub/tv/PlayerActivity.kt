package com.shub.tv

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.KeyEvent
import android.view.View
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
 * Control remoto: OK = play/pausa · ←/→ = −10 s/+10 s · ↑/↓ = mostrar controles · Atrás = salir.
 */
@OptIn(UnstableApi::class)
class PlayerActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_JSON = "json"
        const val EXTRA_RESULT_ID = "id"
        const val EXTRA_RESULT_POSITION_MS = "positionMs"
        const val EXTRA_RESULT_ENDED = "ended"
        private const val SEEK_MS = 10_000L
        /** Mínimo entre dos guardados de progreso; también es el período del reporte (y del heartbeat). */
        private const val REPORT_EVERY_MS = 20_000L
        private const val CONTROLLER_TIMEOUT_MS = 4_000L
    }

    private var player: ExoPlayer? = null
    private lateinit var playerView: PlayerView
    /** Último guardado de progreso (elapsedRealtime); se reinicia al cargar cada video. */
    private var lastProgressAt = 0L
    private var currentItem: JSONObject? = null
    private var profileToken: String? = null
    private var deviceId: String? = null
    private val io: ExecutorService = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_player)
        playerView = findViewById(R.id.player_view)

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
                    reportProgress(ended = true, force = true)
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
                finishWithResult(ended = false)
            }
        })

        load(payload.getJSONObject("item"), (payload.optDouble("startSec", 0.0) * 1000).toLong())
        playerView.requestFocus()
    }

    private fun load(item: JSONObject, startMs: Long) {
        currentItem = item
        // No se guarda la posición inicial: el primer guardado llega a los 20 s.
        lastProgressAt = SystemClock.elapsedRealtime()
        player?.apply {
            setMediaItem(buildMediaItem(item), startMs)
            prepare()
            playWhenReady = true
        }
        main.removeCallbacks(periodicReport)
        main.postDelayed(periodicReport, REPORT_EVERY_MS)
    }

    /** MediaItem con los subtítulos del item (VTT); el primero queda seleccionado por defecto. */
    private fun buildMediaItem(item: JSONObject): MediaItem {
        val subtitles = mutableListOf<MediaItem.SubtitleConfiguration>()
        item.optJSONArray("subtitles")?.let { subs ->
            for (i in 0 until subs.length()) {
                val s = subs.getJSONObject(i)
                val lang = s.optString("lang")
                subtitles += MediaItem.SubtitleConfiguration.Builder(Uri.parse(s.getString("url")))
                    .setId(s.getString("id"))
                    .setMimeType(MimeTypes.TEXT_VTT)
                    .setLanguage(if (lang.isEmpty() || lang == "und") null else lang)
                    .setLabel(s.optString("label"))
                    .setSelectionFlags(if (i == 0) C.SELECTION_FLAG_DEFAULT else 0)
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

    /** Oculta los controles tras unos segundos sin teclas si está reproduciendo (aunque el foco
     *  haya quedado en un botón como la tuerca, que de otro modo los deja fijos). */
    private val autoHide = Runnable {
        if (player?.isPlaying == true) playerView.hideController() else scheduleAutoHide()
    }

    private fun scheduleAutoHide() {
        main.removeCallbacks(autoHide)
        main.postDelayed(autoHide, CONTROLLER_TIMEOUT_MS)
    }

    /** Cada 20 s: guarda la posición (si reproduce) y manda el heartbeat del dispositivo. */
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

    /**
     * PUT /api/v1/items/:id/progress con el token del perfil (si hay perfil), como mucho una vez
     * cada 20 s. `force` (fin del video, salir) guarda aunque el último guardado sea reciente.
     */
    private fun reportProgress(ended: Boolean, force: Boolean = false) {
        val token = profileToken ?: return
        val item = currentItem ?: return
        val p = player ?: return
        val now = SystemClock.elapsedRealtime()
        if (!force && now - lastProgressAt < REPORT_EVERY_MS) return
        lastProgressAt = now
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
            }
        }
        return super.dispatchKeyEvent(event)
    }

    private fun finishWithResult(ended: Boolean) {
        main.removeCallbacks(periodicReport)
        if (!ended) reportProgress(ended = false, force = true)
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
        // A segundo plano (Home): se guarda siempre, Android puede cerrar la app después.
        reportProgress(ended = false, force = true)
        player?.pause()
        // En segundo plano no se manda nada: el dispositivo pasa a inactivo a los 2 min (WU-19).
        main.removeCallbacks(periodicReport)
    }

    override fun onDestroy() {
        main.removeCallbacks(periodicReport)
        main.removeCallbacks(autoHide)
        // shutdown (no shutdownNow): deja terminar el último reporte de progreso.
        io.shutdown()
        player?.release()
        player = null
        super.onDestroy()
    }
}
