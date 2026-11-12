package com.shub.tv

import android.content.Context

/** URL de la API de S-HUB, configurable desde la app (nada de red hardcodeado). */
object ServerPrefs {
    private const val PREFS = "shub"
    private const val KEY_URL = "server_url"

    fun get(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_URL, null) ?: BuildConfig.DEFAULT_SERVER_URL

    fun set(context: Context, url: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY_URL, normalize(url)).apply()
    }

    fun normalize(url: String): String {
        val trimmed = url.trim().trimEnd('/')
        return if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) trimmed else "http://$trimmed"
    }
}
