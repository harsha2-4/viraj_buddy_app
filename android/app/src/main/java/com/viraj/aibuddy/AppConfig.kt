package com.viraj.aibuddy

import android.net.Uri

object AppConfig {
    // Generated from web/js/config.js at build time. Do not duplicate the URL here.
    val chatgptUrl: String get() = BuildConfig.CHATGPT_URL
    const val enableCameraButton = true
    const val enableAnimations = true

    fun destination(): Uri? {
        return try {
            val uri = Uri.parse(chatgptUrl)
            val host = uri.host?.lowercase(java.util.Locale.ROOT)
            if (uri.scheme?.lowercase(java.util.Locale.ROOT) != "https" ||
                host !in setOf("chatgpt.com", "chat.openai.com") ||
                !uri.userInfo.isNullOrEmpty() || uri.port !in setOf(-1, 443) ||
                chatgptUrl.any { it.isWhitespace() || it == '\\' }) null else uri
        } catch (_: Exception) {
            null
        }
    }
}
