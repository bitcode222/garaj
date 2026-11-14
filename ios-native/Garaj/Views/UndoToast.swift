import SwiftUI

/// "Anulează" after a change (the web's toast with undo): one at a time, above the tab bar.
@MainActor
@Observable
final class UndoCenter {
    struct Item: Identifiable {
        let id = UUID()
        let message: String
        let undo: (() throws -> Void)?
    }

    private(set) var item: Item?
    @ObservationIgnored private var timer: Task<Void, Never>?

    func show(_ message: String, undo: (() throws -> Void)? = nil) {
        item = Item(message: message, undo: undo)
        timer?.cancel()
        timer = Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            self?.item = nil
        }
    }

    func perform() {
        guard let undo = item?.undo else { return }
        item = nil
        try? undo()
    }

    func dismiss() { item = nil }
}

struct UndoToastView: View {
    @Environment(UndoCenter.self) private var center
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack {
            if let item = center.item {
                HStack(spacing: 12) {
                    Text(item.message)
                        .font(.subheadline.weight(.medium))
                        .lineLimit(2)
                    Spacer(minLength: 8)
                    if item.undo != nil {
                        Button("Anulează") { center.perform() }
                            .font(.subheadline.weight(.semibold))
                            .frame(minHeight: 44)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 4)
                .glassEffect(.regular, in: .capsule)
                .padding(.horizontal, 16)
                .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                .id(item.id)
                .onTapGesture { center.dismiss() }
            }
        }
        .animation(reduceMotion ? .easeOut(duration: 0.2) : .spring(duration: 0.35, bounce: 0), value: center.item?.id)
    }
}
