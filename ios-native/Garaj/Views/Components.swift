import SwiftUI

// The pieces of look A (the board picked on 15 Nov 2026, docs/IOS-NATIVE.md §7): status capsules,
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

/// A section header of look A: small, uppercase, muted.
struct CapsHeader: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text).font(.footnote).foregroundStyle(.secondary).textCase(.uppercase)
    }
}
