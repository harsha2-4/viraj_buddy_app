package com.viraj.aibuddy

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.Button

/** Only the explicitly configured HTTPS voice app can request microphone access. */
class VoiceActivity : Activity() {
    private lateinit var web: WebView
    private var pending: PermissionRequest? = null
    private var reloadOnResume = false
    companion object {
        fun configuredUrl(): Uri? = try {
            Uri.parse(BuildConfig.VOICE_APP_URL).takeIf {
                it.scheme == "https" && !it.host.isNullOrBlank() && it.userInfo == null &&
                    BuildConfig.VOICE_APP_URL.none { c -> c.isWhitespace() || c == '\\' }
            }
        } catch (_: Exception) { null }
    }
    private fun trusted(uri: Uri): Boolean {
        val configured = configuredUrl() ?: return false
        return uri.scheme == configured.scheme && uri.host == configured.host && uri.port == configured.port
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = configuredUrl() ?: run { finish(); return }
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.setOnApplyWindowInsetsListener { view, insets ->
            @Suppress("DEPRECATION")
            view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            insets
        }
        root.addView(Button(this).apply { text = "End and go home"; setOnClickListener { finish() } })
        web = WebView(this)
        root.addView(web, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(root)
        root.requestApplyInsets()
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = route(request.url)
            @Suppress("DEPRECATION")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean = route(Uri.parse(url))
            private fun route(uri: Uri): Boolean {
                if (trusted(uri)) return false
                if (uri.scheme == "https") {
                    try { startActivity(Intent(Intent.ACTION_VIEW, uri)) } catch (_: Exception) { }
                }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                if (!trusted(request.origin) || !request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                    request.deny(); return
                }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                } else {
                    pending?.deny()
                    pending = request
                    requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 7)
                }
            }
            override fun onPermissionRequestCanceled(request: PermissionRequest) { if (pending === request) pending = null }
        }
        web.loadUrl(url.toString())
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 7) {
            pending?.let {
                if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED && trusted(it.origin)) it.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else it.deny()
            }
            pending = null
        }
    }
    override fun onPause() {
        // Destroy the media page on backgrounding; no microphone survives leaving Buddy.
        pending?.deny(); pending = null
        if (::web.isInitialized) { reloadOnResume = true; web.loadUrl("about:blank"); web.onPause() }
        super.onPause()
    }
    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) {
            web.onResume()
            if (reloadOnResume) {
                reloadOnResume = false
                configuredUrl()?.let { web.loadUrl(it.toString()) }
            }
        }
    }
    override fun onDestroy() {
        pending?.deny(); pending = null
        if (::web.isInitialized) { web.stopLoading(); web.destroy() }
        super.onDestroy()
    }
}
