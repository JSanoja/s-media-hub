package com.shub.tv

import android.os.Build
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ExecutorService

/**
 * Heartbeat del dispositivo (WU-19): POST /api/v1/devices/heartbeat.
 * La interfaz web lo manda cada 60 s; mientras el reproductor nativo está abierto lo manda él,
 * con lo que se está viendo.
 */
object DeviceHeartbeat {
    /** Identidad del dispositivo (la misma que usa la web vía el puente). */
    fun info(): JSONObject {
        val model = Build.MODEL?.takeIf { it.isNotBlank() } ?: "Android TV"
        return JSONObject()
            .put("kind", "android-tv")
            .put("name", model)
            .put("model", model)
            .put("appVersion", BuildConfig.VERSION_NAME)
    }

    /** Envía el heartbeat en `io` (nunca en el hilo principal). Si falla, se reintenta en el próximo. */
    fun send(
        io: ExecutorService,
        baseUrl: String,
        deviceId: String,
        profileToken: String?,
        nowPlaying: JSONObject?,
    ) {
        val body = info()
            .put("deviceId", deviceId)
            .put("nowPlaying", nowPlaying ?: JSONObject.NULL)
        try {
            io.execute {
                try {
                    val conn = URL("$baseUrl/api/v1/devices/heartbeat").openConnection() as HttpURLConnection
                    conn.requestMethod = "POST"
                    conn.connectTimeout = 5_000
                    conn.readTimeout = 5_000
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json")
                    profileToken?.let { conn.setRequestProperty("X-Profile-Token", it) }
                    conn.outputStream.use { it.write(body.toString().toByteArray()) }
                    conn.responseCode // fuerza el envío
                    conn.disconnect()
                } catch (e: Exception) {
                    // Sin red: el próximo heartbeat lo corrige.
                }
            }
        } catch (e: java.util.concurrent.RejectedExecutionException) {
            // El executor ya se cerró (la pantalla se está destruyendo).
        }
    }
}
