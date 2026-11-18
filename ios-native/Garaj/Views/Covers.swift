import SwiftUI

// Look 3 "Coperți" (docs/IOS-NATIVE.md §9): a job shows as a cover in its car's color, the way a
// podcast shows as its artwork. The cards, the job page's header and (later) its sheets use it.

extension Make {
    private static let lightMakes: Set<String> = ["renault", "opel"]

    /// The brand color of a make; a neutral grey for makes without one.
    static func color(_ make: String?) -> Color {
        make.flatMap(key).flatMap { colors[$0] } ?? Color(red: 0.36, green: 0.38, blue: 0.42)
    }

    /// The cover: the brand color deepened so white text reads on it (yellow makes stay light).
    static func cover(_ make: String?) -> Color {
        let light = make.flatMap(key).map { lightMakes.contains($0) } ?? false
        return color(make).mix(with: .black, by: light ? 0.08 : 0.32)
    }

    /// Text and icons on the cover.
    static func ink(_ make: String?) -> Color {
        (make.flatMap(key).map { lightMakes.contains($0) } ?? false) ? .black : .white
    }
}

/// The make's logo alone, large, in the cover's ink (a monogram for makes without a logo).
struct MakeArt: View {
    let make: String
    var size: CGFloat = 86

    var body: some View {
        Group {
            if let key = Make.key(make) {
                Image("Makes/\(key)").resizable().renderingMode(.template).scaledToFit()
            } else {
                Text(make.prefix(1).uppercased()).font(.system(size: size * 0.7, weight: .heavy)).minimumScaleFactor(0.5)
            }
        }
        .frame(width: size, height: size)
        .foregroundStyle(Make.ink(make).opacity(0.95))
        .accessibilityLabel(make.isEmpty ? "Mașină" : make)
    }
}

/// A square of the make's color with its logo, for list cards.
struct MakeTile: View {
    let make: String
    var size: CGFloat = 72

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.26)
            .fill(LinearGradient(colors: [Make.color(make), Make.cover(make)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay { MakeArt(make: make, size: size * 0.56) }
            .frame(width: size, height: size)
    }
}

/// The words of a job: what it is about, and one line of what is going on.
enum JobText {
    /// The client's request (first line), else the first lines of work, else the job number.
    static func headline(_ order: WorkOrder) -> String {
        if let first = order.complaint.split(whereSeparator: \.isNewline).first.map(String.init)?.trimmingCharacters(in: .whitespaces), !first.isEmpty {
            return first
        }
        let names = order.lines.filter { !$0.refused }.map(\.description).filter { !$0.isEmpty }
        if !names.isEmpty { return names.prefix(2).joined(separator: " + ") + (names.count > 2 ? " +\(names.count - 2)" : "") }
        return "Lucrarea #\(order.number)"
    }

    /// The mechanic's diagnosis, else how many operations and parts it has.
    static func summary(_ order: WorkOrder) -> String {
        let d = order.diagnosis.trimmingCharacters(in: .whitespacesAndNewlines)
        if !d.isEmpty { return d }
        let lines = order.lines.filter { !$0.refused }
        let labor = lines.filter { $0.kind == "labor" }.count
        let parts = lines.filter { $0.kind == "part" }.count
        if lines.isEmpty { return "Nicio operație încă. Adaugă ce e de făcut." }
        return [labor > 0 ? "\(labor) \(labor == 1 ? "operație" : "operații")" : nil, parts > 0 ? "\(parts) \(parts == 1 ? "piesă" : "piese")" : nil]
            .compactMap { $0 }.joined(separator: " · ")
    }
}

/// A job as a cover (Azi → În atelier): the car's color, its logo and plate, the status, what the job
/// is, and one main button for the next step. The rest is in "…" and in the long-press menu.
struct CoverCard<Actions: View>: View {
    let make: String
    let plate: String?
    let eyebrow: String
    let title: String
    let detail: String
    let status: StatusStyle
    /// Top left of the cover, in the status pill's style (a job's number).
    var corner: String? = nil
    /// Shown first, with a person icon, in place of the eyebrow (the car's owner).
    var person: String? = nil
    /// Small counts under the text, each an icon and a number (a job's operations and parts).
    var counts: [(symbol: String, text: String)] = []
    /// At the end of the counts row, in bold (a job's total).
    var total: String? = nil
    var next: (label: String, symbol: String, run: () -> Void)?
    let open: () -> Void
    @ViewBuilder let actions: Actions

    private func pill(_ text: String) -> some View {
        Text(text).font(.caption.weight(.semibold)).monospacedDigit().foregroundStyle(.white)
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(.black.opacity(0.3), in: .capsule)
            .padding(12)
    }

    var body: some View {
        let ink = Make.ink(make)
        VStack(alignment: .leading, spacing: 4) {
            Button(action: open) {
                VStack(alignment: .leading, spacing: 4) {
                    RoundedRectangle(cornerRadius: 24)
                        .fill(RadialGradient(colors: [Make.color(make), Make.cover(make).mix(with: .black, by: 0.25)], center: .topTrailing, startRadius: 10, endRadius: 260))
                        .frame(height: 150)
                        .overlay { MakeArt(make: make, size: 76).offset(y: -14) }
                        .overlay(alignment: .bottomTrailing) { if let plate, !plate.isEmpty { PlateBadge(plate: plate).padding(12) } }
                        .overlay(alignment: .topLeading) { if let corner { pill(corner) } }
                        .overlay(alignment: .topTrailing) { pill(status.label) }
                        .padding(.bottom, 10)
                    if let person {
                        Label(person, systemImage: "person.crop.circle.fill")
                            .font(.subheadline.weight(.semibold)).lineLimit(1).opacity(0.85)
                    } else {
                        Text(eyebrow).font(.footnote.weight(.medium)).textCase(.uppercase).tracking(0.4).lineLimit(1).opacity(0.72)
                    }
                    Text(title).font(.title3.weight(.semibold)).lineLimit(2).multilineTextAlignment(.leading)
                    Text(detail).font(.subheadline).lineLimit(1).opacity(0.72)
                    if !counts.isEmpty {
                        HStack(spacing: 6) {
                            ForEach(counts, id: \.text) { c in
                                HStack(spacing: 4) { Image(systemName: c.symbol).imageScale(.small); Text(c.text) }
                                    .font(.footnote.weight(.semibold)).monospacedDigit().lineLimit(1).fixedSize()
                                    .padding(.horizontal, 8).padding(.vertical, 5)
                                    .background(ink.opacity(0.14), in: .capsule)
                                    .accessibilityElement(children: .combine)
                            }
                            Spacer(minLength: 4)
                            if let total { Text(total).font(.headline).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7) }
                        }
                        .padding(.top, 6)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            Spacer(minLength: 10)
            HStack(spacing: 10) {
                if let next {
                    Button(action: next.run) { Label(next.label, systemImage: next.symbol) }
                        .buttonStyle(.onColor)
                } else {
                    Button(action: open) { Label("Deschide", systemImage: "arrow.up.right") }
                        .buttonStyle(.onColor)
                }
                Menu { actions } label: {
                    Image(systemName: "ellipsis").font(.headline)
                        .frame(width: 50, height: 50)
                        .background(ink.opacity(0.2), in: .circle)
                }
                .accessibilityLabel("Mai multe")
            }
        }
        .foregroundStyle(ink)
        .padding(16)
        .frame(width: 300, height: counts.isEmpty ? 380 : 410)
        .background(Make.cover(make), in: .rect(cornerRadius: 34))
        .contextMenu { actions }
        .accessibilityElement(children: .contain)
    }
}

/// A job as a card in Atelier: logo tile, car and plate, what the job is, the status, a one-line
/// summary, then the main button and round buttons. Tap the card to open the job.
struct JobCard<Actions: View>: View {
    let make: String
    let eyebrow: String
    let title: String
    let status: StatusStyle
    let meta: String
    let summary: String
    var next: (label: String, symbol: String, run: () -> Void)?
    var phone: URL?
    let open: () -> Void
    @ViewBuilder let actions: Actions

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button(action: open) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .center, spacing: 14) {
                        MakeTile(make: make, size: 72)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(eyebrow).font(.footnote.weight(.medium)).textCase(.uppercase).tracking(0.3).foregroundStyle(.secondary).lineLimit(1)
                            Text(title).font(.headline).lineLimit(2).multilineTextAlignment(.leading)
                            HStack(spacing: 6) {
                                StatusPill(style: status)
                                Text(meta).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Image(systemName: "sparkles").font(.footnote).foregroundStyle(.secondary)
                        Text(summary).font(.subheadline).foregroundStyle(.secondary).lineLimit(2).multilineTextAlignment(.leading)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            HStack(spacing: 10) {
                if let next {
                    Button(action: next.run) { Label(next.label, systemImage: next.symbol) }
                        .buttonStyle(FillButtonStyle(small: true, fill: false))
                }
                Spacer(minLength: 0)
                if let phone {
                    Link(destination: phone) { Image(systemName: "phone.fill") }
                        .buttonStyle(CircleButtonStyle(size: 40))
                        .accessibilityLabel("Sună clientul")
                }
                Menu { actions } label: {
                    Image(systemName: "ellipsis").font(.headline).frame(width: 40, height: 40)
                        .background(Color(.tertiarySystemFill), in: .circle)
                }
                .tint(.primary)
                .accessibilityLabel("Mai multe")
            }
        }
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 26))
        .contentShape(.contextMenuPreview, .rect(cornerRadius: 26))
        .contextMenu { actions }
    }
}

/// A screen whose top is the car's color, fading into the grouped background. The color follows
/// the content up and stretches when pulled down; the bar's controls read white on it.
struct CoverBackground: ViewModifier {
    let color: Color
    var height: CGFloat = 420
    @State private var offset: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .scrollContentBackground(.hidden)
            .onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y + $0.contentInsets.top } action: { _, y in offset = y }
            .background(alignment: .top) {
                ZStack(alignment: .top) {
                    Color.groupedBackground
                    LinearGradient(stops: [.init(color: color, location: 0), .init(color: color, location: 0.6), .init(color: Color.groupedBackground, location: 1)],
                                   startPoint: .top, endPoint: .bottom)
                        .frame(height: max(0, height - offset))
                }
                .ignoresSafeArea()
                .accessibilityHidden(true)
            }
            .toolbarColorScheme(offset < height * 0.5 ? .dark : nil, for: .navigationBar)
    }
}

extension View {
    func cover(_ color: Color, height: CGFloat = 420) -> some View { modifier(CoverBackground(color: color, height: height)) }
}

// MARK: - Sheets on the car's color

extension EnvironmentValues {
    /// The make whose color a sheet sits on; nil for ordinary sheets.
    @Entry var coverMake: String? = nil
}

extension View {
    /// A sheet about one car takes its color (look 3): the cover behind, light rows, the cover's ink.
    func carSheet(_ make: String?) -> some View {
        let light = Make.ink(make) == .black
        return self
            .environment(\.coverMake, make ?? "")
            .environment(\.colorScheme, light ? .light : .dark)
            .tint(Make.ink(make))
            .presentationBackground(Make.cover(make))
    }

    /// The rows of a form on a car's color: a light veil of the cover's ink instead of grey cells.
    func coverRows(_ make: String?) -> some View {
        listRowBackground(make.map { Make.ink($0).opacity(0.12) })
    }
}

/// Azi's top (owner, 18 Nov 2026: "a nice colorful gradient, Netflix inspired", then "make it red"): near-black lit
/// by reds, behind the title, the search bar and the shortcuts; it fades into the grouped
/// background, follows the content up and stretches when pulled down. The bar reads white on it.
/// How the shop stands right now, shown as the colour of the dashboard's top (owner): green when all is well,
/// yellow when something waits on you or a deadline is close, red when something is past its deadline.
enum HeroMood: Equatable {
    case good, attention, late

    var rgb: (r: Double, g: Double, b: Double) {
        switch self {
        case .good: (0.22, 0.62, 0.40)
        case .attention: (0.86, 0.62, 0.10)
        case .late: (0.86, 0.12, 0.14)
        }
    }

    var color: Color { Color(red: rgb.r, green: rgb.g, blue: rgb.b) }
}

struct HeroBackground: ViewModifier {
    var height: CGFloat = 470
    var mood: HeroMood = .good
    @State private var offset: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .scrollContentBackground(.hidden)
            .onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y + $0.contentInsets.top } action: { _, y in offset = y }
            .background(alignment: .top) {
                ZStack(alignment: .top) {
                    Color.groupedBackground
                    HeroGlow(color: mood.color)
                        .frame(height: max(0, height - offset))
                        .mask(LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.62), .init(color: .clear, location: 1)],
                                             startPoint: .top, endPoint: .bottom))
                }
                .ignoresSafeArea()
                .animation(.easeInOut(duration: 0.6), value: mood)
                .accessibilityHidden(true)
            }
    }
}

/// The mood's colour glowing from the top left, slowly drifting and breathing (owner: "moving, breathing").
/// Dark mode: on near-black, like a lit room seen from the dark. Light mode: straight on the page's own background,
/// so the fade never passes through grey or black. Still when Reduce Motion is on.
private struct HeroGlow: View {
    let color: Color
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { context in
            let t = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate
            let dark = scheme == .dark
            let light = color.mix(with: .white, by: 0.35)
            let deep = color.mix(with: .black, by: 0.25)
            ZStack {
                if dark { Color(red: 0.05, green: 0.06, blue: 0.06) } else {
                    LinearGradient(colors: [color.opacity(0.55), color.opacity(0.25), .clear], startPoint: .top, endPoint: .bottom)
                }
                blob(color, alpha: dark ? 0.85 : 0.95, x: 0.12 + 0.10 * sin(t / 7.0), y: 0.10 + 0.06 * cos(t / 9.0),
                     radius: 450 * (1 + 0.08 * sin(t / 4.0)))
                blob(light, alpha: dark ? 0.40 : 0.70, x: 0.85 + 0.12 * cos(t / 8.0), y: 0.05 + 0.08 * sin(t / 6.0),
                     radius: 320 * (1 + 0.10 * cos(t / 5.0)))
                blob(deep, alpha: dark ? 0.45 : 0.55, x: 0.50 + 0.25 * sin(t / 11.0), y: 0.40 + 0.08 * cos(t / 7.5),
                     radius: 260 * (1 + 0.12 * sin(t / 6.5)))
            }
        }
    }

    private func blob(_ c: Color, alpha: Double, x: Double, y: Double, radius: Double) -> some View {
        RadialGradient(colors: [c.opacity(alpha), c.opacity(alpha * 0.35), .clear], center: UnitPoint(x: x, y: y), startRadius: 0, endRadius: radius)
    }
}

extension View {
    func hero(height: CGFloat = 470, mood: HeroMood = .good) -> some View { modifier(HeroBackground(height: height, mood: mood)) }
}
