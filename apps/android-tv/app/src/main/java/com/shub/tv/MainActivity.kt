package com.shub.tv

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.text.InputType
import android.view.KeyEvent
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

/**
 * Pantalla principal: carga la interfaz web de TV (apps/tv) que sirve la API en /tv/.
 * La navegación es web (D-pad → flechas); la reproducción se delega a PlayerActivity (Media3).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var errorDialog: AlertDialog? = null

    private val playerLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val data = result.data ?: return@registerForActivityResult
            val id = data.getStringExtra(PlayerActivity.EXTRA_RESULT_ID) ?: return@registerForActivityResult
            val detail = JSONObject()
                .put("id", id)
                .put("positionSec", data.getLongExtra(PlayerActivity.EXTRA_RESULT_POSITION_MS, 0L) / 1000.0)
                .put("ended", data.getBooleanExtra(PlayerActivity.EXTRA_RESULT_ENDED, false))
            // La web puede escucharlo para "Seguir viendo" (WU-09).
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('shub:playback',{detail:$detail}))",
                null,
            )
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(Color.rgb(11, 11, 15))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            isFocusable = true
            isFocusableInTouchMode = true
            webViewClient = object : WebViewClient() {
                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: WebResourceError,
                ) {
                    if (request.isForMainFrame) showConnectionError()
                }

                override fun onReceivedHttpError(
                    view: WebView,
                    request: WebResourceRequest,
                    errorResponse: WebResourceResponse,
                ) {
                    if (request.isForMainFrame && errorResponse.statusCode >= 500) showConnectionError()
                }
            }
            addJavascriptInterface(Bridge(), "SHubPlayer")
        }
        setContentView(webView)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) loadUi()
        webView.requestFocus()
    }

    private fun loadUi() {
        errorDialog?.dismiss()
        errorDialog = null
        webView.loadUrl("${ServerPrefs.get(this)}/tv/")
    }

    private fun showConnectionError() {
        if (isFinishing || errorDialog?.isShowing == true) return
        errorDialog = AlertDialog.Builder(this)
            .setTitle(R.string.error_title)
            .setMessage(getString(R.string.error_message, ServerPrefs.get(this)))
            .setPositiveButton(R.string.retry) { _, _ -> loadUi() }
            .setNeutralButton(R.string.change_server) { _, _ -> showSettings() }
            .setCancelable(false)
            .show()
    }

    private fun showSettings() {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setText(ServerPrefs.get(this@MainActivity))
            hint = getString(R.string.settings_hint)
            setSelection(text.length)
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.settings_title)
            .setView(input)
            .setPositiveButton(R.string.settings_save) { _, _ ->
                ServerPrefs.set(this, input.text.toString())
                loadUi()
            }
            .setNegativeButton(R.string.settings_cancel, null)
            .show()
    }

    /** Tecla MENU (si el control la tiene) abre la configuración del servidor. */
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            showSettings()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    // En segundo plano (Home, o el reproductor nativo encima) se pausan los timers de la web: así
    // deja de mandar heartbeats y el dispositivo pasa a inactivo a los 2 min (WU-19).
    override fun onResume() {
        super.onResume()
        webView.onResume()
        webView.resumeTimers()
    }

    override fun onPause() {
        webView.onPause()
        webView.pauseTimers()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        errorDialog?.dismiss()
        webView.destroy()
        super.onDestroy()
    }

    /** Puente JS → nativo: window.SHubPlayer.play(json) / openSettings(). Corre en otro hilo. */
    inner class Bridge {
        @JavascriptInterface
        fun play(json: String) {
            runOnUiThread {
                playerLauncher.launch(
                    Intent(this@MainActivity, PlayerActivity::class.java)
                        .putExtra(PlayerActivity.EXTRA_JSON, json),
                )
            }
        }

        @JavascriptInterface
        fun openSettings() {
            runOnUiThread { showSettings() }
        }

        @JavascriptInterface
        fun serverUrl(): String = ServerPrefs.get(this@MainActivity)

        @JavascriptInterface
        fun version(): String = BuildConfig.VERSION_NAME

        /** Identidad del dispositivo para el heartbeat de la web (WU-19). */
        @JavascriptInterface
        fun deviceInfo(): String = DeviceHeartbeat.info().toString()
    }
}
