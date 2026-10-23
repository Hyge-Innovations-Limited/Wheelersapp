package com.wheelers.rideoverlay

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Outline
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewOutlineProvider
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import kotlin.math.abs
import kotlin.math.hypot

/**
 * The Wheelers bubble: a round Wheelers logo kept on the side of the screen
 * while an online driver is in another app (WhatsApp, Maps, the home screen),
 * so the way back is always one tap away.
 *
 *   tap              open Wheelers
 *   drag             move it anywhere; let go and it slides to the nearest
 *                    side and stays there (remembered for next time)
 *   drag to the ✕    hide it until the driver next goes online (they stay online)
 *
 * A green dot says online; an orange ring says a trip is on; it pulses when a
 * request comes in. The app shows and hides it (lib/ride-overlay.ts).
 */
object RideBubble {
  private val ORANGE = Color.parseColor("#FF7700")
  private val INK = Color.parseColor("#1A1410")
  private val GREEN = Color.parseColor("#00C48C")
  private const val PREFS = "wheelers_bubble"
  private const val SIZE_DP = 58
  private const val EDGE_DP = 6

  private val main = Handler(Looper.getMainLooper())
  private var bubble: FrameLayout? = null
  private var ring: View? = null
  private var params: WindowManager.LayoutParams? = null
  private var target: View? = null
  private var trip = false
  /** Dragged to the ✕: stays hidden until the app says the driver went online again. */
  private var dismissed = false

  fun show(context: Context, onTrip: Boolean): Boolean {
    if (dismissed || !Settings.canDrawOverlays(context)) return false
    main.post {
      trip = onTrip
      if (bubble == null) addNow(context) else ring?.visibility = if (trip) View.VISIBLE else View.INVISIBLE
    }
    return true
  }

  fun hide() {
    main.post { removeNow() }
  }

  /** A new online session: the bubble may show again after being dragged away. */
  fun reset() {
    dismissed = false
  }

  /** A request came in: three quick beats. */
  fun pulse() {
    main.post {
      val view = bubble ?: return@post
      val beat = ValueAnimator.ofFloat(1f, 1.22f, 1f).apply {
        duration = 380
        repeatCount = 2
        addUpdateListener {
          val scale = it.animatedValue as Float
          view.scaleX = scale
          view.scaleY = scale
        }
      }
      beat.start()
    }
  }

  @SuppressLint("ClickableViewAccessibility")
  private fun addNow(context: Context) {
    val windows = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val size = dp(context, SIZE_DP)
    val view = build(context, size)
    val screen = context.resources.displayMetrics
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val onRight = prefs.getBoolean("right", true)
    val layout = WindowManager.LayoutParams(
      size,
      size,
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = if (onRight) screen.widthPixels - size - dp(context, EDGE_DP) else dp(context, EDGE_DP)
      y = prefs.getInt("y", (screen.heightPixels * 0.35).toInt()).coerceIn(dp(context, 40), screen.heightPixels - size - dp(context, 80))
    }

    view.setOnClickListener { open(context) }
    val slop = ViewConfiguration.get(context).scaledTouchSlop
    var downX = 0f
    var downY = 0f
    var startX = 0
    var startY = 0
    var dragging = false
    view.setOnTouchListener { _, event ->
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downX = event.rawX
          downY = event.rawY
          startX = layout.x
          startY = layout.y
          dragging = false
          view.animate().scaleX(0.92f).scaleY(0.92f).setDuration(80).start()
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = event.rawX - downX
          val dy = event.rawY - downY
          if (!dragging && hypot(dx, dy) > slop) {
            dragging = true
            showTarget(context)
          }
          if (dragging) {
            layout.x = (startX + dx).toInt()
            layout.y = (startY + dy).toInt()
            update(windows, view, layout)
            target?.let { t -> t.alpha = if (overTarget(context, layout, size)) 1f else 0.7f }
          }
          true
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          view.animate().scaleX(1f).scaleY(1f).setDuration(120).start()
          if (!dragging) {
            // A tap is a click, so TalkBack's double-tap opens Wheelers too.
            if (event.actionMasked == MotionEvent.ACTION_UP) view.performClick()
          } else if (overTarget(context, layout, size)) {
            dismissed = true
            removeNow()
          } else {
            snap(context, windows, view, layout, size)
          }
          hideTarget(context)
          true
        }
        else -> false
      }
    }

    try {
      windows.addView(view, layout)
    } catch (_: Exception) {
      return
    }
    bubble = view
    params = layout
    view.alpha = 0f
    view.scaleX = 0.6f
    view.scaleY = 0.6f
    view.animate().alpha(1f).scaleX(1f).scaleY(1f).setInterpolator(OvershootInterpolator()).setDuration(260).start()
  }

  /** Let go: to the nearest side, kept on screen, remembered. */
  private fun snap(context: Context, windows: WindowManager, view: View, layout: WindowManager.LayoutParams, size: Int) {
    val screen = context.resources.displayMetrics
    val toRight = layout.x + size / 2 > screen.widthPixels / 2
    val endX = if (toRight) screen.widthPixels - size - dp(context, EDGE_DP) else dp(context, EDGE_DP)
    val endY = layout.y.coerceIn(dp(context, 40), screen.heightPixels - size - dp(context, 80))
    val fromX = layout.x
    val fromY = layout.y
    ValueAnimator.ofFloat(0f, 1f).apply {
      duration = 240
      interpolator = DecelerateInterpolator()
      addUpdateListener {
        val t = it.animatedValue as Float
        layout.x = (fromX + (endX - fromX) * t).toInt()
        layout.y = (fromY + (endY - fromY) * t).toInt()
        update(windows, view, layout)
      }
      start()
    }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("right", toRight).putInt("y", endY).apply()
  }

  /** Back to its side and on screen, after the screen turned. */
  private fun keepOnScreen(context: Context) {
    val view = bubble ?: return
    val layout = params ?: return
    val size = dp(context, SIZE_DP)
    val screen = context.resources.displayMetrics
    val onRight = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("right", true)
    layout.x = if (onRight) screen.widthPixels - size - dp(context, EDGE_DP) else dp(context, EDGE_DP)
    layout.y = layout.y.coerceIn(dp(context, 40), (screen.heightPixels - size - dp(context, 80)).coerceAtLeast(dp(context, 40)))
    update(context.getSystemService(Context.WINDOW_SERVICE) as WindowManager, view, layout)
  }

  private fun update(windows: WindowManager, view: View, layout: WindowManager.LayoutParams) {
    try {
      windows.updateViewLayout(view, layout)
    } catch (_: Exception) {
      // Gone meanwhile.
    }
  }

  private fun open(context: Context) {
    context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { intent ->
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      try {
        context.startActivity(intent)
      } catch (_: Exception) {
        // Wheelers opens from its icon as ever.
      }
    }
  }

  private fun removeNow() {
    // Hidden mid-drag (offline, or Wheelers came to the front): the ✕ goes too.
    target?.let { hideTarget(it.context) }
    val view = bubble ?: return
    bubble = null
    ring = null
    params = null
    try {
      (view.context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(view)
    } catch (_: Exception) {
      // Already gone.
    }
  }

  /** The ✕ at the bottom while dragging: let go on it to hide the bubble. */
  private fun showTarget(context: Context) {
    if (target != null) return
    val windows = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val size = dp(context, 64)
    val view = TextView(context).apply {
      text = "✕"
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
      typeface = Typeface.DEFAULT_BOLD
      contentDescription = "Hide the Wheelers bubble"
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(INK)
        setStroke(dp(context, 2), Color.WHITE)
      }
      alpha = 0.7f
    }
    val layout = WindowManager.LayoutParams(
      size,
      size,
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
      y = dp(context, 56)
    }
    try {
      windows.addView(view, layout)
      target = view
    } catch (_: Exception) {
      // No target: the bubble can still be moved.
    }
  }

  private fun hideTarget(context: Context) {
    val view = target ?: return
    target = null
    try {
      (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(view)
    } catch (_: Exception) {
      // Already gone.
    }
  }

  private fun overTarget(context: Context, layout: WindowManager.LayoutParams, size: Int): Boolean {
    val screen = context.resources.displayMetrics
    val bubbleX = layout.x + size / 2f
    val bubbleY = layout.y + size / 2f
    val targetX = screen.widthPixels / 2f
    val targetY = screen.heightPixels - dp(context, 56) - dp(context, 32).toFloat()
    return abs(bubbleX - targetX) < dp(context, 70) && abs(bubbleY - targetY) < dp(context, 90)
  }

  private fun build(context: Context, size: Int): FrameLayout {
    val box = object : FrameLayout(context) {
      // The screen turned: the side it was on may now be past the edge.
      override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        post { keepOnScreen(context) }
      }
    }.apply {
      contentDescription = "Open Wheelers"
      elevation = dp(context, 6).toFloat()
    }
    // The orange ring while a trip is on.
    val tripRing = View(context).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.TRANSPARENT)
        setStroke(dp(context, 3), ORANGE)
      }
      visibility = if (trip) View.VISIBLE else View.INVISIBLE
    }
    box.addView(tripRing, FrameLayout.LayoutParams(size, size))
    ring = tripRing

    // The Wheelers logo: the app's own icon, round.
    val inset = dp(context, 4)
    val logo = ImageView(context).apply {
      setImageDrawable(context.packageManager.getApplicationIcon(context.packageName))
      scaleType = ImageView.ScaleType.CENTER_CROP
      outlineProvider = object : ViewOutlineProvider() {
        override fun getOutline(view: View, outline: Outline) {
          outline.setOval(0, 0, view.width, view.height)
        }
      }
      clipToOutline = true
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(ORANGE)
      }
    }
    box.addView(logo, FrameLayout.LayoutParams(size - inset * 2, size - inset * 2).apply { gravity = Gravity.CENTER })

    // Online.
    val dotSize = dp(context, 14)
    val dot = View(context).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(GREEN)
        setStroke(dp(context, 2), Color.WHITE)
      }
    }
    box.addView(dot, FrameLayout.LayoutParams(dotSize, dotSize).apply { gravity = Gravity.BOTTOM or Gravity.END })
    return box
  }

  private fun dp(context: Context, value: Int): Int = (value * context.resources.displayMetrics.density).toInt()
}
