@preconcurrency import AVFoundation
import CoreImage
import CoreImage.CIFilterBuiltins
import PDFKit
import UIKit
import Vision

// The talon scanner's engine: the back camera with a live search for the document's edges, the still photo,
// and the clean-up (straighten to the page, rotate) and text reading of the picture.

/// A document's four corners, normalised 0…1 with the origin at the top left of the upright image.
struct Quad: Equatable, Sendable {
    var tl: CGPoint, tr: CGPoint, br: CGPoint, bl: CGPoint

    var points: [CGPoint] { [tl, tr, br, bl] }

    /// How far the corners moved from another quad, as the largest single move (0…1).
    func distance(to o: Quad) -> CGFloat {
        zip(points, o.points).map { hypot($0.x - $1.x, $0.y - $1.y) }.max() ?? 1
    }

    /// The whole picture, inset a little: where cropping starts when no edges were found.
    static let full = Quad(tl: CGPoint(x: 0.06, y: 0.06), tr: CGPoint(x: 0.94, y: 0.06), br: CGPoint(x: 0.94, y: 0.94), bl: CGPoint(x: 0.06, y: 0.94))

    /// From a Vision observation (origin at the bottom left).
    init(_ r: VNRectangleObservation) {
        let flip = { (p: CGPoint) in CGPoint(x: p.x, y: 1 - p.y) }
        tl = flip(r.topLeft); tr = flip(r.topRight); br = flip(r.bottomRight); bl = flip(r.bottomLeft)
    }

    init(tl: CGPoint, tr: CGPoint, br: CGPoint, bl: CGPoint) { self.tl = tl; self.tr = tr; self.br = br; self.bl = bl }
}

/// The back camera: a preview session, edge search on the live frames, and the still photo.
final class CameraEngine: NSObject, @unchecked Sendable, AVCaptureVideoDataOutputSampleBufferDelegate, AVCapturePhotoCaptureDelegate {
    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "garaj.scan.camera")
    private let video = AVCaptureVideoDataOutput()
    private let photo = AVCapturePhotoOutput()
    private var lastSearch = Date.distantPast
    private var configured = false
    /// Called on the main queue with the edges found in the latest frame (nil when none).
    var onQuad: (@MainActor @Sendable (Quad?) -> Void)?
    private var onPhoto: (@Sendable (Data?) -> Void)?

    /// Asks for the camera when needed and starts it; false when there is no camera or no permission.
    func start() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: break
        case .notDetermined: guard await AVCaptureDevice.requestAccess(for: .video) else { return false }
        default: return false
        }
        return await withCheckedContinuation { done in
            queue.async {
                if !self.configured { self.configured = self.configure() }
                if self.configured, !self.session.isRunning { self.session.startRunning() }
                done.resume(returning: self.configured)
            }
        }
    }

    func stop() { queue.async { if self.session.isRunning { self.session.stopRunning() } } }

    private func configure() -> Bool {
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: device) else { return false }
        session.beginConfiguration()
        session.sessionPreset = .photo
        guard session.canAddInput(input), session.canAddOutput(video), session.canAddOutput(photo) else { session.commitConfiguration(); return false }
        session.addInput(input)
        video.alwaysDiscardsLateVideoFrames = true
        video.setSampleBufferDelegate(self, queue: queue)
        session.addOutput(video)
        session.addOutput(photo)
        photo.maxPhotoQualityPrioritization = .quality
        // Upright portrait frames and photos, so the edges found map straight onto the screen.
        for output in [video, photo] as [AVCaptureOutput] {
            if let c = output.connection(with: .video), c.isVideoRotationAngleSupported(90) { c.videoRotationAngle = 90 }
        }
        session.commitConfiguration()
        try? device.lockForConfiguration()
        if device.isFocusModeSupported(.continuousAutoFocus) { device.focusMode = .continuousAutoFocus }
        device.unlockForConfiguration()
        return true
    }

    func capture(flash: AVCaptureDevice.FlashMode, done: @escaping @Sendable (Data?) -> Void) {
        queue.async {
            let settings = AVCapturePhotoSettings()
            if self.photo.supportedFlashModes.contains(flash) { settings.flashMode = flash }
            settings.photoQualityPrioritization = .quality
            self.onPhoto = done
            self.photo.capturePhoto(with: settings, delegate: self)
        }
    }

    // About eight searches a second are enough to follow the hand and cheap on the battery.
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard Date().timeIntervalSince(lastSearch) > 0.12, let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lastSearch = Date()
        let quad = DocumentProcessor.detect(VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .up))
        let report = onQuad
        Task { @MainActor in report?(quad) }
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let data = photo.fileDataRepresentation()
        onPhoto?(data)
        onPhoto = nil
    }
}

/// The picture's clean-up and reading; all of it runs off the main thread.
enum DocumentProcessor {
    /// The most document-like rectangle (a talon is about 3:2 either way), or nil.
    static func detect(_ handler: VNImageRequestHandler) -> Quad? {
        let request = VNDetectRectanglesRequest()
        request.minimumAspectRatio = 0.3
        request.maximumAspectRatio = 1.0
        request.minimumSize = 0.25
        request.quadratureTolerance = 25
        request.minimumConfidence = 0.6
        request.maximumObservations = 1
        try? handler.perform([request])
        return request.results?.first.map(Quad.init)
    }

    /// The edges of the document in a still picture.
    static func detect(in image: UIImage) async -> Quad? {
        guard let cg = image.cgImage else { return nil }
        return await Task.detached(priority: .userInitiated) { detect(VNImageRequestHandler(cgImage: cg, orientation: .up)) }.value
    }

    /// The picture drawn upright (photos carry their rotation as a flag; Vision and Core Image want pixels) and no
    /// larger than 3000 px on its long side, which reads as well and keeps memory low for 48 MP photos.
    static func upright(_ image: UIImage) -> UIImage {
        let pixels = CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
        let shrink = min(1, 3000 / max(pixels.width, pixels.height))
        guard image.imageOrientation != .up || shrink < 1 || image.scale != 1 else { return image }
        let size = CGSize(width: (pixels.width * shrink).rounded(), height: (pixels.height * shrink).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
    }

    /// A PDF's first pages as pictures, about 2400 px on the long side, on white.
    @MainActor
    static func images(of pdf: PDFDocument, limit: Int) -> [UIImage] {
        (0..<min(limit, pdf.pageCount)).compactMap { i in
            guard let page = pdf.page(at: i) else { return nil }
            let box = page.bounds(for: .mediaBox)
            let s = 2400 / max(box.width, box.height)
            return page.thumbnail(of: CGSize(width: box.width * s, height: box.height * s), for: .mediaBox)
        }
    }

    /// The page cut out along the four corners and straightened to a rectangle, a little crisper.
    static func straighten(_ image: UIImage, quad: Quad) async -> UIImage {
        guard let cg = image.cgImage else { return image }
        return await Task.detached(priority: .userInitiated) {
            let ci = CIImage(cgImage: cg)
            let w = ci.extent.width, h = ci.extent.height
            let point = { (p: CGPoint) in CGPoint(x: p.x * w, y: (1 - p.y) * h) } // Core Image's origin is at the bottom left
            let fix = CIFilter.perspectiveCorrection()
            fix.inputImage = ci
            fix.topLeft = point(quad.tl); fix.topRight = point(quad.tr)
            fix.bottomRight = point(quad.br); fix.bottomLeft = point(quad.bl)
            let sharpen = CIFilter.colorControls()
            sharpen.inputImage = fix.outputImage
            sharpen.contrast = 1.08
            sharpen.saturation = 1.0
            guard let out = sharpen.outputImage, let made = CIContext().createCGImage(out, from: out.extent) else { return image }
            return UIImage(cgImage: made)
        }.value
    }

    /// A quarter turn clockwise.
    static func rotated(_ image: UIImage) -> UIImage {
        let size = CGSize(width: image.size.height, height: image.size.width)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = image.scale
        return UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            ctx.cgContext.translateBy(x: size.width / 2, y: size.height / 2)
            ctx.cgContext.rotate(by: .pi / 2)
            image.draw(in: CGRect(x: -image.size.width / 2, y: -image.size.height / 2, width: image.size.width, height: image.size.height))
        }
    }

    /// The text on the page, line by line from the top.
    static func readText(_ image: UIImage) async -> [String] {
        guard let cg = image.cgImage else { return [] }
        return await Task.detached(priority: .userInitiated) {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["ro-RO", "en-US"]
            request.usesLanguageCorrection = false
            try? VNImageRequestHandler(cgImage: cg, orientation: .up).perform([request])
            let found = (request.results ?? []).compactMap { o in o.topCandidates(1).first.map { (text: $0.string, box: o.boundingBox) } }
            // Top to bottom, then left to right within a row.
            return found.sorted { a, b in
                abs(a.box.midY - b.box.midY) > 0.012 ? a.box.midY > b.box.midY : a.box.minX < b.box.minX
            }.map(\.text)
        }.value
    }
}

/// Where scanned talons are kept: one picture per car in the app's documents, beside the data.
enum TalonFiles {
    private static var folder: URL {
        let url = URL.documentsDirectory.appending(path: "Scans", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    static func url(_ vehicleId: String) -> URL { folder.appending(path: "\(vehicleId)-talon.jpg") }

    static func save(_ image: UIImage, vehicleId: String) {
        if let data = image.jpegData(compressionQuality: 0.82) { try? data.write(to: url(vehicleId), options: .atomic) }
    }

    static func image(_ vehicleId: String) -> UIImage? { UIImage(contentsOfFile: url(vehicleId).path()) }

    static func delete(_ vehicleId: String) { try? FileManager.default.removeItem(at: url(vehicleId)) }
}
