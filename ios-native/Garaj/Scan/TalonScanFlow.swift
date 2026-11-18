@preconcurrency import AVFoundation
import PDFKit
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

// Scanning a talon or a car's document (owner, 18 Nov 2026, after their reference): the camera with a frame that follows the page's
// corners and "Ține nemișcat" once they hold still; then "Arată bine?" with Decupează / Rotește, Confirmă or Refă;
// then what was read, to check, with the client to pick; then what comes next (only the car, a deviz, a job or a
// booking). The picture comes from the camera, the photo library or Files (a picture or a PDF).

/// Where the scan started, which decides what it is for and how it ends.
enum ScanMode: Equatable {
    /// Azi's quick button: any car's talon; then add the car to a job (or a deviz, a booking, only the car).
    case home
    /// A car's page: its talon fills in that car; then, if wanted, a new deviz for it.
    case talon(String)
    /// A car's page: any document (ITP, RCA, an invoice…) kept on that car under a name.
    case document(String)

    var isDocument: Bool { if case .document = self { true } else { false } }
    var carId: String? {
        switch self {
        case .home: nil
        case .talon(let id), .document(let id): id
        }
    }
}

struct TalonScanFlow: View {
    @Environment(\.dismiss) private var dismiss
    var mode: ScanMode = .home
    /// Debug: start from this picture instead of the camera.
    var startImage: UIImage? = nil
    /// From a car's page: what to open there once the talon is saved (a new deviz, the open job).
    var finished: ((TalonNext) -> Void)? = nil

    private enum Step { case camera, review, reading, details, naming, saved }
    @State private var step: Step
    /// A PDF's other pages, tried in turn when the first one doesn't read as a talon.
    @State private var extraPages: [UIImage] = []
    @State private var next: TalonNext = .car
    @State private var original: UIImage?
    @State private var quad: Quad?
    @State private var turns = 0
    @State private var page: UIImage?
    @State private var data = TalonData()
    @State private var savedId: String?
    @State private var cropping = false

    init(mode: ScanMode = .home, startImage: UIImage? = nil, finished: ((TalonNext) -> Void)? = nil) {
        self.mode = mode
        self.startImage = startImage
        self.finished = finished
        _step = State(initialValue: startImage == nil ? .camera : .review)
    }

    private var noun: String { mode.isDocument ? "documentul" : "talonul" }

    var body: some View {
        ZStack {
            switch step {
            case .camera:
                TalonCameraScreen(noun: noun, close: { dismiss() }, took: { take($0, more: $1) })
                    .transition(.opacity)
            case .review, .reading:
                TalonReviewScreen(noun: noun, confirmLabel: mode.isDocument ? "Atașează documentul" : "Confirmă talonul",
                                  page: page, reading: step == .reading,
                                  back: { retake() }, crop: { cropping = true }, rotate: { rotate() },
                                  confirm: { if mode.isDocument { step = .naming } else { Task { await read() } } }, retake: { retake() })
                    .transition(.opacity)
            case .details:
                TalonDetailsScreen(data: $data, page: page, carId: mode.carId, retake: { retake() }, cancel: { dismiss() }) { id, then in
                    if let page { TalonFiles.save(page, vehicleId: id) }
                    if mode.carId != nil {
                        // Back on the car's page, which opens what was chosen.
                        dismiss()
                        finished?(then)
                    } else {
                        savedId = id
                        next = then
                        withAnimation { step = .saved }
                    }
                }
                .transition(.move(edge: .trailing))
            case .naming:
                if let page, let carId = mode.carId {
                    DocumentNameScreen(page: page, vehicleId: carId, back: { step = .review }) { dismiss() }
                        .transition(.move(edge: .trailing))
                }
            case .saved:
                if let savedId { TalonDoneScreen(vehicleId: savedId, next: next, close: { dismiss() }).transition(.move(edge: .trailing)) }
            }
        }
        .animation(.smooth(duration: 0.3), value: step)
        .fullScreenCover(isPresented: $cropping) {
            if let original {
                TalonCropScreen(image: original, quad: quad ?? .full) { edited in
                    quad = edited
                    Task { await develop() }
                }
            }
        }
        .task {
            guard let startImage else { return }
            take(startImage, more: [])
            #if DEBUG
            // Screenshots: `-GarajScanRead 1` confirms the picture straight away.
            if UserDefaults.standard.string(forKey: "GarajScanRead") != nil {
                try? await Task.sleep(for: .seconds(2))
                await read()
            }
            #endif
        }
    }

    private func take(_ image: UIImage, more: [UIImage]) {
        extraPages = more
        Task {
            let up = DocumentProcessor.upright(image)
            original = up
            quad = await DocumentProcessor.detect(in: up)
            turns = 0
            await develop()
            step = .review
        }
    }

    /// The page from the original: cut along the corners (when found or set), then turned.
    private func develop() async {
        guard let original else { return }
        var out = quad.map { _ in original } ?? original
        if let quad { out = await DocumentProcessor.straighten(original, quad: quad) }
        for _ in 0..<turns { out = DocumentProcessor.rotated(out) }
        page = out
    }

    private func rotate() {
        guard let page else { return }
        turns = (turns + 1) % 4
        withAnimation(.snappy) { self.page = DocumentProcessor.rotated(page) }
    }

    private func retake() {
        original = nil; quad = nil; page = nil; turns = 0; extraPages = []
        step = startImage == nil ? .camera : .review
        if startImage != nil { dismiss() }
    }

    /// Reads the page; when nothing useful comes out it tries the other three ways round (a talon photographed
    /// sideways) and keeps the turn that read best.
    private func read() async {
        guard let page else { return }
        step = .reading
        var best = TalonParser.parse(await DocumentProcessor.readText(page))
        var bestPage = page
        if best.plate.isEmpty && best.vin.isEmpty {
            var turned = page
            for _ in 1...3 {
                turned = DocumentProcessor.rotated(turned)
                let t = TalonParser.parse(await DocumentProcessor.readText(turned))
                if score(t) > score(best) { best = t; bestPage = turned }
            }
        }
        // A PDF: its next pages when the first didn't read (the talon is often page 2 of a scan).
        for extra in extraPages where score(best) < 2 {
            let t = TalonParser.parse(await DocumentProcessor.readText(extra))
            if score(t) > score(best) { best = t; bestPage = extra }
        }
        self.page = bestPage
        data = best
        withAnimation { step = .details }
    }

    private func score(_ t: TalonData) -> Int {
        [!t.plate.isEmpty, !t.vin.isEmpty, !t.make.isEmpty, !t.model.isEmpty, !t.owner.isEmpty, t.year != nil].filter { $0 }.count
    }
}

// MARK: - Camera

private struct TalonCameraScreen: View {
    /// "talonul" or "documentul".
    let noun: String
    let close: () -> Void
    /// The picture, and a PDF's other pages.
    let took: (UIImage, [UIImage]) -> Void

    @State private var engine = CameraEngine()
    @State private var available: Bool?
    @State private var quad: Quad?
    @State private var recent: [Quad] = []
    @State private var flash: AVCaptureDevice.FlashMode = .auto
    @State private var capturing = false
    @State private var picked: PhotosPickerItem?
    @State private var choosing = false
    @State private var pickingPhoto = false
    @State private var pickingFile = false
    @State private var problem: String?

    /// Corners found in each of the last four searches (about half a second), all within 2% of each other.
    private var steady: Bool {
        guard recent.count >= 4, let last = recent.last else { return false }
        return recent.allSatisfy { $0.distance(to: last) < 0.02 }
    }

    var body: some View {
        GeometryReader { geo in
            let window = CGRect(x: 16, y: 150, width: geo.size.width - 32, height: max(200, geo.size.height - 150 - 210))
            ZStack(alignment: .top) {
                Color.black.ignoresSafeArea()
                if available == true {
                    CameraPreview(session: engine.session).ignoresSafeArea()
                } else if available == false {
                    ContentUnavailableView {
                        Label("Camera nu e disponibilă", systemImage: "camera.fill")
                    } description: {
                        Text("Dă voie aplicației la cameră din Setări, sau alege o poză ori un PDF.")
                    } actions: {
                        Button("Alege din galerie", systemImage: "photo.on.rectangle") { pickingPhoto = true }
                        Button("Alege din fișiere", systemImage: "folder") { pickingFile = true }
                    }
                    .frame(maxHeight: .infinity)
                }
                // The page's window: the feed dimmed around it, corner marks on the page (or on the window).
                if available == true {
                    WindowDim(window: window).ignoresSafeArea()
                    CornerMarks(quad: quad.map { mapped($0, in: geo.size) }, window: window, found: quad != nil)
                        .ignoresSafeArea()
                        .animation(.easeOut(duration: 0.12), value: quad)
                }
                VStack(alignment: .leading, spacing: 18) {
                    ScanHeader(title: "Scanează \(noun)", back: close)
                    Label("Încadrează toate cele patru colțuri ale \(noun == "talonul" ? "talonului" : "documentului").", systemImage: "info.circle")
                        .font(.subheadline).foregroundStyle(.white.opacity(0.85))
                    Spacer()
                    if available == true {
                        HStack {
                            Spacer()
                            Label(steady ? "Toate marginile găsite · Ține nemișcat" : quad != nil ? "Margini găsite · Ține nemișcat" : "Caut marginile \(noun == "talonul" ? "talonului" : "documentului")…",
                                  systemImage: quad != nil ? "checkmark.circle" : "viewfinder")
                                .font(.subheadline.weight(.medium))
                                .padding(.horizontal, 16).padding(.vertical, 10)
                                .background(.black.opacity(0.45), in: .capsule)
                                .contentTransition(.opacity)
                            Spacer()
                        }
                        .animation(.smooth, value: steady)
                    }
                    controls
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 8)
                .foregroundStyle(.white)
            }
        }
        .preferredColorScheme(.dark)
        .sensoryFeedback(.success, trigger: steady) { _, now in now }
        .task {
            engine.onQuad = { q in
                quad = q
                if let q { recent = Array((recent + [q]).suffix(4)) } else { recent = [] }
            }
            available = await engine.start()
        }
        .onDisappear { engine.stop() }
        .confirmationDialog("Scanează din", isPresented: $choosing, titleVisibility: .visible) {
            Button("Galerie foto") { pickingPhoto = true }
            Button("Fișiere (poză sau PDF)") { pickingFile = true }
        }
        .photosPicker(isPresented: $pickingPhoto, selection: $picked, matching: .images)
        .fileImporter(isPresented: $pickingFile, allowedContentTypes: [.image, .pdf]) { result in
            switch result {
            case .success(let url): open(url)
            case .failure: problem = "Fișierul nu s-a putut deschide."
            }
        }
        .onChange(of: picked) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                    took(image, [])
                } else {
                    problem = "Poza nu s-a putut încărca. Dacă e în iCloud, așteaptă să se descarce și încearcă din nou."
                }
                picked = nil
            }
        }
        .alert("Nu se poate", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(problem ?? "") }
    }

    private var controls: some View {
        HStack {
            Button {
                flash = flash == .auto ? .on : flash == .on ? .off : .auto
            } label: {
                Label(flash == .auto ? "Auto" : flash == .on ? "Pornit" : "Oprit", systemImage: flash == .off ? "bolt.slash.fill" : "bolt.fill")
                    .font(.subheadline.weight(.medium))
                    .frame(minWidth: 72, minHeight: 44, alignment: .leading)
            }
            .accessibilityLabel("Bliț: \(flash == .auto ? "automat" : flash == .on ? "pornit" : "oprit")")
            .disabled(available != true)
            Spacer()
            Button(action: capture) {
                Label("Fă poza", systemImage: "camera.fill")
                    .font(.headline)
                    .foregroundStyle(.black)
                    .padding(.horizontal, 26).frame(height: 54)
                    .background(.white, in: .capsule)
                    .padding(4)
                    .overlay(Capsule().strokeBorder(.white, lineWidth: 2))
            }
            .buttonStyle(.plain)
            .disabled(available != true || capturing)
            .opacity(available == true ? 1 : 0.4)
            Spacer()
            Button { choosing = true } label: {
                Image(systemName: "photo.on.rectangle").font(.title2).frame(width: 72, height: 44, alignment: .trailing)
            }
            .accessibilityLabel("Alege din galerie sau din fișiere")
        }
    }

    private func capture() {
        capturing = true
        engine.capture(flash: flash) { data in
            let image = data.flatMap(UIImage.init(data:))
            Task { @MainActor in
                capturing = false
                if let image { took(image, []) } else { problem = "Poza nu s-a putut face. Încearcă din nou." }
            }
        }
    }

    /// A picture or a PDF from Files. A PDF gives its first pages (the talon may be any of them).
    private func open(_ url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        if UTType(filenameExtension: url.pathExtension)?.conforms(to: .pdf) == true {
            guard let pdf = PDFDocument(url: url) else { problem = "PDF-ul nu s-a putut deschide."; return }
            if pdf.isLocked { problem = "PDF-ul e protejat cu parolă. Deschide-l, salvează-l fără parolă și încearcă din nou."; return }
            let pages = DocumentProcessor.images(of: pdf, limit: 4)
            guard let first = pages.first else { problem = "PDF-ul nu are nicio pagină."; return }
            took(first, Array(pages.dropFirst()))
        } else if let data = try? Data(contentsOf: url), let image = UIImage(data: data) {
            took(image, [])
        } else {
            problem = "Fișierul nu e o poză sau un PDF."
        }
    }

    /// From the upright camera frame (3:4, filling the screen) to screen points.
    private func mapped(_ q: Quad, in size: CGSize) -> Quad {
        let aspect: CGFloat = 3.0 / 4.0
        let w: CGFloat, h: CGFloat
        if size.width / size.height > aspect { w = size.width; h = size.width / aspect } else { h = size.height; w = size.height * aspect }
        let dx = (size.width - w) / 2, dy = (size.height - h) / 2
        let p = { (pt: CGPoint) in CGPoint(x: dx + pt.x * w, y: dy + pt.y * h) }
        return Quad(tl: p(q.tl), tr: p(q.tr), br: p(q.br), bl: p(q.bl))
    }
}

private struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var preview: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }

    func makeUIView(context: Context) -> PreviewView {
        let v = PreviewView()
        v.preview.session = session
        v.preview.videoGravity = .resizeAspectFill
        if let c = v.preview.connection, c.isVideoRotationAngleSupported(90) { c.videoRotationAngle = 90 }
        return v
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {}
}

/// The feed dimmed everywhere but the page's window.
private struct WindowDim: View {
    let window: CGRect
    var body: some View {
        Canvas { ctx, size in
            var path = Path(CGRect(origin: .zero, size: size))
            path.addRoundedRect(in: window, cornerSize: CGSize(width: 28, height: 28))
            ctx.fill(path, with: .color(.black.opacity(0.5)), style: FillStyle(eoFill: true))
        }
        .allowsHitTesting(false)
    }
}

/// White corner marks: on the page's corners when found, else on the window's.
private struct CornerMarks: View {
    let quad: Quad?
    let window: CGRect
    let found: Bool

    var body: some View {
        let q = quad ?? Quad(tl: CGPoint(x: window.minX + 24, y: window.minY + 24), tr: CGPoint(x: window.maxX - 24, y: window.minY + 24),
                             br: CGPoint(x: window.maxX - 24, y: window.maxY - 24), bl: CGPoint(x: window.minX + 24, y: window.maxY - 24))
        Brackets(quad: q)
            .stroke(.white.opacity(found ? 1 : 0.55), style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

/// An L at each corner of a quad, along its two edges.
private struct Brackets: Shape {
    var quad: Quad

    var animatableData: AnimatablePair<AnimatablePair<AnimatablePair<CGFloat, CGFloat>, AnimatablePair<CGFloat, CGFloat>>,
                                       AnimatablePair<AnimatablePair<CGFloat, CGFloat>, AnimatablePair<CGFloat, CGFloat>>> {
        get {
            .init(.init(.init(quad.tl.x, quad.tl.y), .init(quad.tr.x, quad.tr.y)), .init(.init(quad.br.x, quad.br.y), .init(quad.bl.x, quad.bl.y)))
        }
        set {
            quad = Quad(tl: CGPoint(x: newValue.first.first.first, y: newValue.first.first.second),
                        tr: CGPoint(x: newValue.first.second.first, y: newValue.first.second.second),
                        br: CGPoint(x: newValue.second.first.first, y: newValue.second.first.second),
                        bl: CGPoint(x: newValue.second.second.first, y: newValue.second.second.second))
        }
    }

    func path(in rect: CGRect) -> Path {
        let pts = quad.points
        var path = Path()
        for i in 0..<4 {
            let c = pts[i], prev = pts[(i + 3) % 4], next = pts[(i + 1) % 4]
            let toward = { (o: CGPoint) -> CGPoint in
                let len = max(1, hypot(o.x - c.x, o.y - c.y))
                let l = min(30, len / 3)
                return CGPoint(x: c.x + (o.x - c.x) / len * l, y: c.y + (o.y - c.y) / len * l)
            }
            path.move(to: toward(prev))
            path.addLine(to: c)
            path.addLine(to: toward(next))
        }
        return path
    }
}

private struct ScanHeader: View {
    let title: String
    let back: () -> Void
    var body: some View {
        Button(action: back) {
            HStack(spacing: 12) {
                Image(systemName: "chevron.left").font(.title3.weight(.semibold))
                Text(title).font(.title3.weight(.medium))
            }
            .frame(minHeight: 44)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Înapoi")
        .padding(.top, 8)
    }
}

// MARK: - Review

private struct TalonReviewScreen: View {
    let noun: String
    let confirmLabel: String
    let page: UIImage?
    let reading: Bool
    let back: () -> Void
    let crop: () -> Void
    let rotate: () -> Void
    let confirm: () -> Void
    let retake: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScanHeader(title: "Scanează \(noun)", back: back)
            Text("Arată bine?").font(.title.weight(.semibold)).padding(.top, 22)
            Text("Verifică dacă detaliile sunt clare și lizibile.").font(.body).foregroundStyle(.white.opacity(0.6)).padding(.top, 6)
            ZStack {
                RoundedRectangle(cornerRadius: 28).fill(Color(white: 0.12))
                if let page {
                    Image(uiImage: page).resizable().scaledToFit()
                        .clipShape(.rect(cornerRadius: 8))
                        .padding(24)
                        .overlay {
                            if reading {
                                ProgressView("Citesc talonul…").tint(.white).padding(18)
                                    .background(.black.opacity(0.6), in: .rect(cornerRadius: 16))
                            }
                        }
                }
            }
            .frame(maxHeight: .infinity)
            .padding(.top, 22)
            HStack(spacing: 44) {
                Button(action: crop) { Label("Decupează", systemImage: "crop") }
                Button(action: rotate) { Label("Rotește", systemImage: "rotate.right") }
            }
            .font(.body.weight(.medium))
            .frame(maxWidth: .infinity)
            .frame(minHeight: 44)
            .padding(.top, 18)
            .disabled(reading)
            VStack(spacing: 14) {
                Button(action: confirm) {
                    Label(confirmLabel, systemImage: "checkmark.circle.fill")
                        .font(.headline).foregroundStyle(.black)
                        .padding(.horizontal, 28).frame(height: 54)
                        .background(.white, in: .capsule)
                }
                .buttonStyle(.plain)
                Button("Refă", action: retake).font(.body.weight(.medium)).frame(minHeight: 44)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 22)
            .disabled(reading || page == nil)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 8)
        .foregroundStyle(.white)
        .tint(.white)
        .background {
            ZStack {
                Color(red: 0.03, green: 0.04, blue: 0.04)
                RadialGradient(colors: [Color(red: 0.13, green: 0.26, blue: 0.20).opacity(0.9), .clear], center: .topLeading, startRadius: 0, endRadius: 420)
            }
            .ignoresSafeArea()
        }
        .preferredColorScheme(.dark)
    }
}

// MARK: - Crop

/// The original picture with its four corners to drag; Gata straightens the page along them.
private struct TalonCropScreen: View {
    @Environment(\.dismiss) private var dismiss
    let image: UIImage
    @State var quad: Quad
    let done: (Quad) -> Void

    var body: some View {
        NavigationStack {
            GeometryReader { geo in
                let fit = fitted(image.size, in: geo.size)
                ZStack(alignment: .topLeading) {
                    Image(uiImage: image).resizable().scaledToFit().frame(width: fit.width, height: fit.height).position(x: fit.midX, y: fit.midY)
                    let screen = Quad(tl: at(quad.tl, fit), tr: at(quad.tr, fit), br: at(quad.br, fit), bl: at(quad.bl, fit))
                    Path { p in p.addLines(screen.points); p.closeSubpath() }
                        .fill(.white.opacity(0.12))
                    Path { p in p.addLines(screen.points); p.closeSubpath() }
                        .stroke(.white, lineWidth: 2)
                    ForEach(0..<4, id: \.self) { i in
                        Circle().fill(.white).frame(width: 26, height: 26)
                            .overlay(Circle().strokeBorder(.black.opacity(0.25), lineWidth: 1))
                            .frame(width: 44, height: 44).contentShape(.circle)
                            .position(screen.points[i])
                            .gesture(DragGesture().onChanged { g in set(i, to: back(g.location, fit)) })
                            .accessibilityLabel(["Colțul din stânga sus", "Colțul din dreapta sus", "Colțul din dreapta jos", "Colțul din stânga jos"][i])
                    }
                }
            }
            .padding(20)
            .background(Color.black.ignoresSafeArea())
            .navigationTitle("Decupează")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Gata") { done(quad); dismiss() } }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func fitted(_ size: CGSize, in box: CGSize) -> CGRect {
        let s = min(box.width / size.width, box.height / size.height)
        let w = size.width * s, h = size.height * s
        return CGRect(x: (box.width - w) / 2, y: (box.height - h) / 2, width: w, height: h)
    }

    private func at(_ p: CGPoint, _ r: CGRect) -> CGPoint { CGPoint(x: r.minX + p.x * r.width, y: r.minY + p.y * r.height) }

    private func back(_ p: CGPoint, _ r: CGRect) -> CGPoint {
        CGPoint(x: min(1, max(0, (p.x - r.minX) / r.width)), y: min(1, max(0, (p.y - r.minY) / r.height)))
    }

    private func set(_ i: Int, to p: CGPoint) {
        switch i {
        case 0: quad.tl = p
        case 1: quad.tr = p
        case 2: quad.br = p
        default: quad.bl = p
        }
    }
}

