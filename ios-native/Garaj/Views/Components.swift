import SwiftUI

// The pieces of looks A and 3 (docs/IOS-NATIVE.md §7, §9): status capsules,
// number tiles, shortcut tiles, Settings-style icon squares, the time column of a booking row.

/// A status as a tinted capsule ("În lucru", "Plătită").
struct StatusPill: View {
    let style: StatusStyle
    var body: some View {
        Text(style.label)
            .font(.caption.weight(.semibold))
            .foregroundStyle(style.color)
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(style.color.opacity(0.13), in: .capsule)
            .accessibilityLabel("Stare: \(style.label)")
    }
}

/// A number with its label and one line under it; tapping it can jump somewhere.
struct StatTile: View {
    let label: String
    let value: String
    let detail: String
    var detailColor: Color? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        let content = VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
            Text(value).font(.title2.weight(.bold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
            Text(detail).font(.caption.weight(detailColor == nil ? .regular : .semibold))
                .foregroundStyle(detailColor ?? .secondary).lineLimit(1).minimumScaleFactor(0.85)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        if let action {
            Button(action: action) { content }.buttonStyle(.plain)
        } else {
            content
        }
    }
}

/// Two tiles per row.
struct TileGrid<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) { content }
    }
}

/// A shortcut: an icon on a tinted square over a short label.
struct QuickAction: View {
    let title: String
    let symbol: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: symbol)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 40, height: 40)
                    .background(Color.accentColor.opacity(0.12), in: .rect(cornerRadius: 12))
                Text(title).font(.caption.weight(.medium)).foregroundStyle(.primary).lineLimit(1).minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}

/// An SF Symbol in white on a colored rounded square, as in the iPhone's Settings.
struct IconSquare: View {
    let symbol: String
    let color: Color
    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 30, height: 30)
            .background(color, in: .rect(cornerRadius: 8))
            .accessibilityHidden(true)
    }
}

/// A Settings-style row: icon square, title, a muted value.
struct IconRowLabel: View {
    let title: String
    let symbol: String
    let color: Color
    var value: String? = nil
    var body: some View {
        HStack(spacing: 12) {
            IconSquare(symbol: symbol, color: color)
            Text(title)
            Spacer()
            if let value { Text(value).foregroundStyle(.secondary).monospacedDigit() }
        }
    }
}

/// The left column of a booking row: the time, and under it how long or which day.
struct TimeColumn: View {
    let time: String
    let detail: String
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(time).font(.subheadline.weight(.semibold)).monospacedDigit()
            Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(width: 52, alignment: .leading)
    }
}

extension View {
    /// A row that sits on the grouped background instead of in a cell (tiles, shortcuts).
    func bareRow() -> some View {
        listRowBackground(Color.clear).listRowInsets(EdgeInsets()).listRowSeparator(.hidden)
    }
}

/// A section header of look 3: the section's name in bold, optionally a › when tapping it shows
/// everything, and one muted line under it saying what is in the section.
struct SectionHeader: View {
    let title: String
    var subtitle: String?
    var action: (() -> Void)?
    init(_ title: String, subtitle: String? = nil, action: (() -> Void)? = nil) {
        self.title = title
        self.subtitle = subtitle
        self.action = action
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let action {
                Button(action: action) {
                    HStack(spacing: 4) {
                        Text(title).foregroundStyle(Color.primary)
                        Image(systemName: "chevron.right").font(.body.weight(.bold)).foregroundStyle(.secondary)
                    }
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityHint("Arată tot")
            } else {
                Text(title)
            }
            if let subtitle {
                Text(subtitle).font(.subheadline).fontWeight(.regular).foregroundStyle(.secondary)
            }
        }
        .font(.title3.weight(.bold))
        .foregroundStyle(.primary)
        .textCase(nil)
        .padding(.leading, -4)
        .padding(.bottom, 4)
        .accessibilityAddTraits(.isHeader)
    }
}

/// The plain section headers of the earlier looks now read as look 3's headers.
struct CapsHeader: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View { SectionHeader(text) }
}

/// A Romanian number plate: blue EU strip with "RO", the number in bold on white.
struct PlateBadge: View {
    let plate: String
    var body: some View {
        HStack(spacing: 0) {
            Text("RO")
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 14)
                .frame(maxHeight: .infinity, alignment: .bottom)
                .padding(.bottom, 3)
                .background(Color(red: 0.12, green: 0.25, blue: 0.69))
            Text(People.formatPlate(plate))
                .font(.system(size: 16, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(.black)
                .padding(.horizontal, 8)
        }
        .frame(height: 30)
        .background(.white)
        .clipShape(.rect(cornerRadius: 5))
        .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(.black, lineWidth: 2))
        .accessibilityLabel("Numărul \(People.formatPlate(plate))")
    }
}

/// A filter chip with its count; the selected one is filled with ink (look 3).
struct CountChip: View {
    let title: String
    let count: Int
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Text(title)
                Text("\(count)").monospacedDigit().foregroundStyle(on ? Color(.systemBackground).opacity(0.7) : .secondary)
            }
            .font(.subheadline.weight(.medium))
            .padding(.horizontal, 12)
            .frame(minHeight: 32)
            .foregroundStyle(on ? Color(.systemBackground) : .primary)
            .background(on ? Color.primary : Color(.secondarySystemGroupedBackground), in: .capsule)
        }
        .buttonStyle(.plain)
        .frame(minHeight: 44)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// A row of chips that scrolls sideways, on the grouped background.
struct ChipRow<Content: View>: View {
    var inset: CGFloat = 20
    @ViewBuilder let content: Content
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) { content }.padding(.horizontal, inset)
        }
        .scrollClipDisabled()
    }
}

/// The buttons of look 3: the main action is an ink capsule (black, white in dark mode; white when it
/// sits on a car's color), the others a light grey capsule. 50 pt tall, 36 pt when small, inside rows.
struct FillButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary, onColor }
    var kind: Kind = .primary
    var small = false
    /// Stretch to the row's width (a lone icon button keeps its own width).
    var fill = true
    @Environment(\.isEnabled) private var enabled

    private var background: Color {
        switch kind {
        case .primary: Color.primary
        case .secondary: Color(.tertiarySystemFill)
        case .onColor: Color.white
        }
    }
    private var foreground: Color {
        switch kind {
        case .primary: Color(.systemBackground)
        case .secondary: Color.primary
        case .onColor: Color.black
        }
    }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(small ? .subheadline.weight(.semibold) : .headline)
            .lineLimit(1)
            .foregroundStyle(foreground)
            .padding(.horizontal, small ? 14 : 20)
            .frame(maxWidth: fill ? .infinity : nil, minHeight: small ? 36 : 50)
            .frame(minWidth: small ? 36 : 50)
            .background(background, in: .capsule)
            .contentShape(.capsule)
            .opacity(enabled ? (configuration.isPressed ? 0.7 : 1) : 0.4)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(duration: 0.2), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == FillButtonStyle {
    static var primary: FillButtonStyle { FillButtonStyle() }
    static var secondary: FillButtonStyle { FillButtonStyle(kind: .secondary) }
    static var primarySmall: FillButtonStyle { FillButtonStyle(small: true) }
    static var secondarySmall: FillButtonStyle { FillButtonStyle(kind: .secondary, small: true) }
    static var onColor: FillButtonStyle { FillButtonStyle(kind: .onColor) }
}

/// A round glass button for the secondary actions of look 3 (call, photo, "…").
struct CircleButtonStyle: ButtonStyle {
    var size: CGFloat = 46
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: size * 0.4, weight: .semibold))
            .foregroundStyle(.primary)
            .frame(width: size, height: size)
            .glassEffect(.regular.interactive(), in: .circle)
            .contentShape(.circle)
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

extension ButtonStyle where Self == CircleButtonStyle {
    static var circle: CircleButtonStyle { CircleButtonStyle() }
}

/// The toolbar's sort and group menu (look 2 round): two inline pickers, the choice remembered by the caller.
struct SortGroupMenu: View {
    let sorts: [(key: String, label: String)]
    @Binding var sort: String
    var groups: [(key: String, label: String)] = []
    var group: Binding<String>? = nil

    var body: some View {
        Menu {
            Section("Sortează după") {
                Picker("Sortează după", selection: $sort) { ForEach(sorts, id: \.key) { Text($0.label).tag($0.key) } }.pickerStyle(.inline)
            }
            if let group, !groups.isEmpty {
                Section("Grupează după") {
                    Picker("Grupează după", selection: group) { ForEach(groups, id: \.key) { Text($0.label).tag($0.key) } }.pickerStyle(.inline)
                }
            }
        } label: {
            Label("Sortează", systemImage: "arrow.up.arrow.down")
        }
        .sensoryFeedback(.selection, trigger: sort)
    }
}

// MARK: Background

extension Color {
    /// The screens' background: in light, a shade darker than the system's grouped grey (#F2F2F7 → #D4D4DC) so the
    /// white cards stand out more (owner, 18 Nov 2026); in dark, the system's own black.
    static let groupedBackground = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark ? .systemGroupedBackground : UIColor(red: 212 / 255, green: 212 / 255, blue: 220 / 255, alpha: 1)
    })
}

extension View {
    /// A List or Form on `Color.groupedBackground` instead of the system's grey.
    func groupedBackground() -> some View {
        scrollContentBackground(.hidden).background(Color.groupedBackground)
    }
}
