package com.wheelers.rideoverlay

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** What the card says, all of it written by the app (lib/ride-overlay.ts). */
class RideRequestCard : Record {
  @Field val rideId: String = ""
  @Field val heading: String = ""
  @Field val fare: String = ""
  @Field val detail: String = ""
  @Field val pickup: String = ""
  @Field val dropoff: String = ""
  @Field val acceptLabel: String = ""
  @Field val showForMs: Double = 30_000.0
}

/**
 * A ride request over other apps, for a driver who is online while another
 * app is in front. Android only; the driver allows "Display over other apps"
 * in Android's settings, and without it nothing is ever drawn.
 */
class RideOverlayModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("WheelersRideOverlay")

    Events("onAction")

    OnCreate {
      RideOverlay.onAction = { action, rideId ->
        sendEvent("onAction", Bundle().apply {
          putString("action", action)
          putString("rideId", rideId)
        })
      }
    }

    OnDestroy {
      RideOverlay.onAction = null
    }

    Function("canShow") {
      Settings.canDrawOverlays(context)
    }

    Function("openSettings") {
      val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("show") { card: RideRequestCard ->
      RideOverlay.show(context, card)
    }

    Function("hide") { rideId: String? ->
      RideOverlay.hide(rideId)
    }

    Function("takePendingAction") {
      RideOverlay.takePending()
    }
  }
}
