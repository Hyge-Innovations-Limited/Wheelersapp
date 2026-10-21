package com.wheelers.facecheck

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.ExifInterface
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetector
import com.google.mlkit.vision.face.FaceDetectorOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Faces in one photo, on the phone (Google ML Kit, its model inside the app):
 * where each is, how the head is turned and how open the eyes are. The selfie
 * screen sends a small frame a few times a second while the driver follows
 * the prompts (lib/face-check.ts). Nothing leaves the phone.
 *
 *   detect(uri, deleteAfter) → { width, height, faces: [{ x, y, w, h, yaw, roll, eyes }], eyesKind: "probability" }
 *
 * x, y, w, h are fractions of the upright photo; yaw and roll in degrees;
 * eyes is how open both eyes are, 0 to 1 (null when it cannot tell).
 */
class FaceCheckModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("WheelersFaceCheck")

    AsyncFunction("detect") { uri: String, deleteAfter: Boolean, promise: Promise ->
      val path = pathOf(uri)
      val upright = try {
        path?.let { load(it) }
      } catch (_: Throwable) {
        null
      }
      if (upright == null) {
        if (deleteAfter) path?.let { File(it).delete() }
        promise.reject("ERR_FACE_IMAGE", "Could not read the photo", null)
        return@AsyncFunction
      }
      val (bitmap, rotation) = upright
      val width = if (rotation == 90 || rotation == 270) bitmap.height else bitmap.width
      val height = if (rotation == 90 || rotation == 270) bitmap.width else bitmap.height
      detector.process(InputImage.fromBitmap(bitmap, rotation))
        .addOnSuccessListener { faces ->
          val list = faces.map { face ->
            val box = face.boundingBox
            val left = face.leftEyeOpenProbability
            val right = face.rightEyeOpenProbability
            val eyes = if (left != null && right != null) (left + right) / 2.0 else (left ?: right)?.toDouble()
            mapOf(
              "x" to box.left.toDouble() / width,
              "y" to box.top.toDouble() / height,
              "w" to box.width().toDouble() / width,
              "h" to box.height().toDouble() / height,
              "yaw" to face.headEulerAngleY.toDouble(),
              "roll" to face.headEulerAngleZ.toDouble(),
              "eyes" to eyes,
            )
          }
          promise.resolve(
            mapOf(
              "width" to width,
              "height" to height,
              "eyesKind" to "probability",
              "faces" to list,
            ),
          )
        }
        .addOnFailureListener { error -> promise.reject("ERR_FACE_DETECT", error.message ?: "Face detection failed", error) }
        .addOnCompleteListener {
          bitmap.recycle()
          if (deleteAfter) path?.let { File(it).delete() }
        }
    }
  }

  private val detector: FaceDetector by lazy {
    FaceDetection.getClient(
      FaceDetectorOptions.Builder()
        .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
        .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
        .setMinFaceSize(0.15f)
        .build(),
    )
  }

  private fun pathOf(uri: String): String? =
    if (uri.startsWith("file:")) Uri.parse(uri).path else if (uri.startsWith("/")) uri else null

  /** The photo at most about 720 px across (enough for a face, quick to read), and how far to turn it upright. */
  private fun load(path: String): Pair<Bitmap, Int>? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 720) sample *= 2
    val bitmap = BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
    val rotation = when (ExifInterface(path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
      ExifInterface.ORIENTATION_ROTATE_90, ExifInterface.ORIENTATION_TRANSPOSE -> 90
      ExifInterface.ORIENTATION_ROTATE_180, ExifInterface.ORIENTATION_FLIP_VERTICAL -> 180
      ExifInterface.ORIENTATION_ROTATE_270, ExifInterface.ORIENTATION_TRANSVERSE -> 270
      else -> 0
    }
    return bitmap to rotation
  }
}
