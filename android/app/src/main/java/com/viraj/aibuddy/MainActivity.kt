package com.viraj.aibuddy

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/** Native launcher only. Authentication, microphone and photos stay in the external browser. */
class MainActivity : Activity() {
    private lateinit var avatar: ImageView
    private lateinit var status: TextView
    private lateinit var talk: Button
    private lateinit var photo: Button
    private var idleAnimator: ObjectAnimator? = null
    private val handler = Handler(Looper.getMainLooper())
    private var opening = false
    private val ink = Color.rgb(35, 62, 59)
    private val green = Color.rgb(40, 92, 79)
    private val paper = Color.rgb(248, 245, 238)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(paper)
        }
        // Respect status/navigation bars on Android 15 as well as older Fire OS.
        root.setOnApplyWindowInsetsListener { view, insets ->
            @Suppress("DEPRECATION")
            view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop,
                insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            insets
        }
        setContentView(root)
        root.requestApplyInsets()

        val top = LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(20), dp(8), dp(20), 0)
        }
        top.addView(label(getString(R.string.app_name), 16f, true), LinearLayout.LayoutParams(0, -2, 1f))
        top.addView(Button(this).apply {
            text = getString(R.string.parent_label)
            textSize = 12f
            isAllCaps = false
            contentDescription = getString(R.string.parent_accessibility)
            minHeight = dp(48)
            setTextColor(ink)
            background = rounded(Color.TRANSPARENT)
            setOnClickListener { showSettings() }
        }, LinearLayout.LayoutParams(-2, dp(48)))
        root.addView(top)

        val scroll = ScrollView(this).apply { isFillViewport = true; clipToPadding = false }
        root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
        val frame = LinearLayout(this).apply { gravity = Gravity.CENTER; setPadding(dp(24), dp(16), dp(24), dp(24)) }
        scroll.addView(frame, ScrollView.LayoutParams(-1, -1))
        val landscape = resources.configuration.screenWidthDp > resources.configuration.screenHeightDp
        val content = LinearLayout(this).apply {
            orientation = if (landscape) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }
        frame.addView(content, LinearLayout.LayoutParams(dp(if (landscape) 900 else 460).coerceAtMost(resources.displayMetrics.widthPixels - dp(48)), -2))

        avatar = ImageView(this).apply {
            setImageResource(R.drawable.buddy)
            contentDescription = getString(R.string.avatar_description)
            scaleType = ImageView.ScaleType.FIT_CENTER
            background = rounded(Color.rgb(231, 236, 223), 160f)
        }
        val avatarSize = if (landscape) 230 else 240
        content.addView(avatar, LinearLayout.LayoutParams(dp(avatarSize), dp(avatarSize)).apply {
            if (landscape) marginEnd = dp(40) else bottomMargin = dp(28)
        })
        val controls = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }
        content.addView(controls, if (landscape) LinearLayout.LayoutParams(0, -2, 1f) else LinearLayout.LayoutParams(-1, -2))
        controls.addView(label(getString(R.string.eyebrow), 10f, true))
        controls.addView(label(getString(R.string.greeting), 38f, true), spaced(10))
        controls.addView(label(getString(R.string.subtitle), 18f), spaced(8))
        talk = action(getString(R.string.talk), true) { openBuddy(false) }
        photo = action(getString(R.string.photo), false) { openBuddy(true) }
        controls.addView(talk, spaced(28))
        controls.addView(photo, spaced(14))
        photo.visibility = if (AppConfig.enableCameraButton) View.VISIBLE else View.GONE
        status = label(getString(R.string.idle_status), 13f).apply {
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        }
        controls.addView(status, spaced(20))
        root.addView(label(getString(R.string.footer), 11f).apply { setPadding(dp(12), dp(8), dp(12), dp(16)) })
    }

    private fun action(title: String, primary: Boolean, clicked: () -> Unit) = Button(this).apply {
        text = title
        textSize = if (primary) 21f else 17f
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        isAllCaps = false
        minHeight = dp(if (primary) 88 else 76)
        setPadding(dp(16), dp(16), dp(16), dp(16))
        setTextColor(if (primary) Color.WHITE else ink)
        background = RippleDrawable(ColorStateList.valueOf(0x22659879), rounded(if (primary) green else Color.WHITE), null)
        setOnClickListener { clicked() }
    }

    private fun label(value: String, size: Float, bold: Boolean = false) = TextView(this).apply {
        text = value
        textSize = size
        setTextColor(ink)
        gravity = Gravity.CENTER
        if (bold) typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
    }

    private fun spaced(top: Int) = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(top) }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun rounded(color: Int, radius: Float = 22f) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = radius * resources.displayMetrics.density
    }

    private fun animationsEnabled() = AppConfig.enableAnimations &&
        Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f

    private fun startIdle() {
        idleAnimator?.cancel()
        if (!animationsEnabled()) return
        idleAnimator = ObjectAnimator.ofFloat(avatar, View.TRANSLATION_Y, 0f, -dp(7).toFloat(), 0f).apply {
            duration = 4000
            repeatCount = ValueAnimator.INFINITE
            interpolator = AccelerateDecelerateInterpolator()
            start()
        }
    }

    private fun showSettings() {
        val configured = AppConfig.destination() != null
        val destinationStatus = getString(if (configured) R.string.configured else R.string.not_configured)
        val message = getString(R.string.settings_message, BuildConfig.VERSION_NAME, destinationStatus) +
            if (configured) "" else getString(R.string.setup_help)
        AlertDialog.Builder(this).setTitle(R.string.app_name).setMessage(message)
            .setPositiveButton(R.string.close, null).show()
    }

    private fun openBuddy(showPhoto: Boolean) {
        if (opening) return
        val destination = AppConfig.destination()
        if (destination == null) {
            status.setText(R.string.needs_setup)
            showSettings()
            return
        }
        opening = true
        talk.isEnabled = false
        photo.isEnabled = false
        status.setText(if (showPhoto) R.string.photo_status else R.string.talk_status)
        idleAnimator?.cancel()
        if (animationsEnabled()) avatar.animate().translationY(-dp(16).toFloat()).rotation(-5f).setDuration(200).start()
        handler.postDelayed({
            try {
                // No WebView or forced app package. Android resolves the available HTTPS handler.
                startActivity(Intent(Intent.ACTION_VIEW, destination).addCategory(Intent.CATEGORY_BROWSABLE))
            } catch (_: ActivityNotFoundException) {
                resetLauncher()
                status.setText(R.string.no_browser)
            } catch (_: SecurityException) {
                resetLauncher()
                status.setText(R.string.browser_blocked)
            }
        }, 450)
    }

    private fun resetLauncher() {
        opening = false
        talk.isEnabled = true
        photo.isEnabled = true
        avatar.animate().cancel()
        avatar.rotation = 0f
        avatar.translationY = 0f
        startIdle()
    }

    override fun onResume() {
        super.onResume()
        resetLauncher()
        status.setText(R.string.idle_status)
    }

    override fun onPause() {
        handler.removeCallbacksAndMessages(null)
        idleAnimator?.cancel()
        avatar.animate().cancel()
        super.onPause()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        idleAnimator?.cancel()
        super.onDestroy()
    }
}
