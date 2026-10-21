import ExpoModulesCore
import ImageIO
import Vision

/**
 * Faces in one photo, on the phone (Apple's Vision, built into iOS): where
 * each is, how the head is turned and how open the eyes are. The selfie
 * screen sends a small frame a few times a second while the driver follows
 * the prompts (lib/face-check.ts). Nothing leaves the phone.
 *
 *   detect(uri, deleteAfter) → { width, height, faces: [{ x, y, w, h, yaw, roll, eyes }], eyesKind: "ratio" }
 *
 * x, y, w, h are fractions of the upright photo, from its top left; yaw and
 * roll in degrees; eyes is the eyes' height for their width (open is about
 * 0.3, shut nearer 0.1): the app compares it with the same driver's open eyes.
 */
public class FaceCheckModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WheelersFaceCheck")

    AsyncFunction("detect") { (uri: String, deleteAfter: Bool, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        let url = URL(string: uri) ?? URL(fileURLWithPath: uri)
        defer { if deleteAfter { try? FileManager.default.removeItem(at: url) } }
        guard let image = FaceCheckModule.upright(url) else {
          promise.reject("ERR_FACE_IMAGE", "Could not read the photo")
          return
        }
        do {
          promise.resolve(try FaceCheckModule.faces(in: image))
        } catch {
          promise.reject("ERR_FACE_DETECT", error.localizedDescription)
        }
      }
    }
  }

  /** The photo upright (its EXIF turn applied), at most 720 px across: enough for a face, quick to read. */
  private static func upright(_ url: URL) -> CGImage? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: 720,
    ]
    return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
  }

  private static func faces(in image: CGImage) throws -> [String: Any] {
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    let rectangles = VNDetectFaceRectanglesRequest()
    if #available(iOS 15.0, *) { rectangles.revision = VNDetectFaceRectanglesRequestRevision3 }
    try handler.perform([rectangles])
    let found = rectangles.results ?? []

    // The eyes, for the same faces.
    var landmarks: [VNFaceObservation] = []
    if !found.isEmpty {
      let request = VNDetectFaceLandmarksRequest()
      request.inputFaceObservations = found
      try handler.perform([request])
      landmarks = request.results ?? []
    }

    let list: [[String: Any]] = found.enumerated().map { index, face in
      let box = face.boundingBox  // fractions, from the bottom left
      var item: [String: Any] = [
        "x": Double(box.minX),
        "y": Double(1 - box.maxY),
        "w": Double(box.width),
        "h": Double(box.height),
        "yaw": (face.yaw?.doubleValue ?? 0) * 180 / .pi,
        "roll": (face.roll?.doubleValue ?? 0) * 180 / .pi,
      ]
      if index < landmarks.count, let eyes = openness(landmarks[index].landmarks) {
        item["eyes"] = eyes
      }
      return item
    }
    return ["width": image.width, "height": image.height, "eyesKind": "ratio", "faces": list]
  }

  /** Both eyes' height for their width, averaged: falls as the eyes shut. */
  private static func openness(_ landmarks: VNFaceLandmarks2D?) -> Double? {
    func ratio(_ region: VNFaceLandmarkRegion2D?) -> Double? {
      guard let points = region?.normalizedPoints, points.count >= 4 else { return nil }
      let xs = points.map { Double($0.x) }
      let ys = points.map { Double($0.y) }
      guard let minX = xs.min(), let maxX = xs.max(), let minY = ys.min(), let maxY = ys.max(), maxX - minX > 0 else { return nil }
      return (maxY - minY) / (maxX - minX)
    }
    let left = ratio(landmarks?.leftEye)
    let right = ratio(landmarks?.rightEye)
    switch (left, right) {
    case let (l?, r?): return (l + r) / 2
    case let (l?, nil): return l
    case let (nil, r?): return r
    default: return nil
    }
  }
}
