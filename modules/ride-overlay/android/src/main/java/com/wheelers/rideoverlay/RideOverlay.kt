package com.wheelers.rideoverlay

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.RingtoneManager
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/**
 * The card itself: one at a time at the top of the screen, gone when its time
 * is up, when the app says so, or when a button is pressed.
 *
 *   tap the card   open Wheelers on this request
 *   Accept         open Wheelers and take the rider's price
 *   Ignore / ✕     close the card; the request stays in the app
 *
 * Opening the app leaves the choice in `pending` as well as sending it as an
 * event, so the app still finds it if it was not listening at that moment.
 */
object RideOverlay {
  private val ORANGE = Color.parseColor("#FF7700")
  private val INK = Color.parseColor("#1A1410")
  private val MUTED = Color.parseColor("#6B625A")
  private val CARD = Color.WHITE

  private val main = Handler(Looper.getMainLooper())
  private var shown: View? = null
  private var shownRideId: String? = null
  private var pending: Map<String, String>? = null
  private val timeUp = Runnable { removeNow() }

  var onAction: ((String, String) -> Unit)? = null

  fun show(context: Context, card: RideRequestCard): Boolean {
    if (card.rideId.isEmpty() || !Settings.canDrawOverlays(context)) return false
    main.post { showNow(context, card) }
    return true
  }

  fun hide(rideId: String?) {
    main.post { if (rideId == null || rideId == shownRideId) removeNow() }
  }

  @Synchronized
  fun takePending(): Map<String, String>? {
    val choice = pending
    pending = null
    return choice
  }

  @Synchronized
  private fun leave(choice: Map<String, String>) {
    pending = choice
  }

  private fun showNow(context: Context, card: RideRequestCard) {
    removeNow()
    val windows = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val view = build(context, card)
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP
      y = dp(context, 36)
      windowAnimations = android.R.style.Animation_Toast
    }
    try {
      windows.addView(view, params)
    } catch (_: Exception) {
      return
    }
    shown = view
    shownRideId = card.rideId
    main.postDelayed(timeUp, card.showForMs.toLong().coerceIn(5_000L, 120_000L))
    chime(context)
  }

  private fun removeNow() {
    main.removeCallbacks(timeUp)
    val view = shown ?: return
    shown = null
    shownRideId = null
    try {
      (view.context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(view)
    } catch (_: Exception) {
      // Already gone.
    }
  }

  private fun act(context: Context, action: String, rideId: String) {
    if (action != "ignore") {
      leave(mapOf("action" to action, "rideId" to rideId))
      // While its card is on screen Android lets the app bring itself to the front.
      context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { intent ->
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        try {
          context.startActivity(intent)
        } catch (_: Exception) {
          // The request is still in the app for when it is opened.
        }
      }
    }
    try {
      onAction?.invoke(action, rideId)
    } catch (_: Exception) {
      // The app is not listening; `pending` holds the choice.
    }
    removeNow()
  }

  private fun build(context: Context, card: RideRequestCard): View {
    val box = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      val pad = dp(context, 16)
      setPadding(pad, pad, pad, pad)
      background = GradientDrawable().apply {
        setColor(CARD)
        cornerRadius = dp(context, 22).toFloat()
        setStroke(dp(context, 2), INK)
      }
      elevation = dp(context, 8).toFloat()
      isClickable = true
      setOnClickListener { act(context, "open", card.rideId) }
    }

    val top = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }
    top.addView(
      words(context, card.heading.ifEmpty { "New ride request" }, 13f, ORANGE, bold = true),
      LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f),
    )
    top.addView(
      words(context, "✕", 18f, MUTED, bold = true).apply {
        val pad = dp(context, 6)
        setPadding(pad * 2, pad, 0, pad)
        contentDescription = "Close"
        isClickable = true
        setOnClickListener { act(context, "ignore", card.rideId) }
      },
    )
    box.addView(top)

    box.addView(words(context, card.fare, 28f, INK, bold = true))
    if (card.detail.isNotEmpty()) box.addView(words(context, card.detail, 13f, MUTED))

    box.addView(place(context, "From", card.pickup), spaced(context, 10))
    box.addView(place(context, "To", card.dropoff), spaced(context, 4))

    val buttons = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
    buttons.addView(
      button(context, "Ignore", filled = false) { act(context, "ignore", card.rideId) },
      LinearLayout.LayoutParams(0, dp(context, 48), 1f).apply { marginEnd = dp(context, 8) },
    )
    buttons.addView(
      button(context, card.acceptLabel.ifEmpty { "Accept" }, filled = true) { act(context, "accept", card.rideId) },
      LinearLayout.LayoutParams(0, dp(context, 48), 1.6f),
    )
    box.addView(buttons, spaced(context, 14))

    // Room around the card for its shadow.
    return FrameLayout(context).apply {
      setPadding(dp(context, 12), dp(context, 4), dp(context, 12), dp(context, 12))
      addView(box, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }
  }

  private fun place(context: Context, label: String, value: String): View =
    LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      addView(words(context, label, 13f, MUTED, bold = true), LinearLayout.LayoutParams(dp(context, 44), ViewGroup.LayoutParams.WRAP_CONTENT))
      addView(
        words(context, value, 15f, INK).apply {
          maxLines = 1
          ellipsize = TextUtils.TruncateAt.END
        },
        LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f),
      )
    }

  private fun button(context: Context, label: String, filled: Boolean, onTap: () -> Unit): TextView =
    words(context, label, 15f, INK, bold = true).apply {
      gravity = Gravity.CENTER
      maxLines = 1
      ellipsize = TextUtils.TruncateAt.END
      contentDescription = label
      background = GradientDrawable().apply {
        cornerRadius = dp(context, 14).toFloat()
        if (filled) {
          setColor(ORANGE)
        } else {
          setColor(CARD)
          setStroke(dp(context, 2), INK)
        }
      }
      isClickable = true
      setOnClickListener { onTap() }
    }

  private fun words(context: Context, value: String, sizeSp: Float, color: Int, bold: Boolean = false): TextView =
    TextView(context).apply {
      text = value
      setTextColor(color)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
      typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
    }

  private fun spaced(context: Context, topDp: Int) =
    LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
      topMargin = dp(context, topDp)
    }

  private fun chime(context: Context) {
    try {
      RingtoneManager.getRingtone(context, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))?.play()
    } catch (_: Exception) {
      // A card without a sound is still a card.
    }
  }

  private fun dp(context: Context, value: Int): Int = (value * context.resources.displayMetrics.density).toInt()
}
