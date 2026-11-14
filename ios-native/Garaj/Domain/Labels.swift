import SwiftUI

// Port of src/lib/labels.js and src/lib/tones.js: the Romanian names, SF Symbols
// and system colors for each status. Tones map to iOS system colors.

struct StatusStyle: Hashable {
    let label: String
    let symbol: String
    let color: Color
    var hint: String = ""
}

enum Tone {
    static func color(_ name: String) -> Color {
        switch name {
        case "blue": .blue
        case "teal": .teal
        case "purple": .purple
        case "orange": .orange
        case "yellow": .yellow
        case "green": .green
        case "red": .red
        case "pink": .pink
        default: .gray
        }
    }
}

enum Labels {
    static let workOrderStatus: [String: StatusStyle] = [
        "estimate": .init(label: "Deviz", symbol: "hourglass", color: .yellow, hint: "Așteaptă aprobarea clientului"),
        "approved": .init(label: "Aprobat", symbol: "hand.thumbsup", color: .green, hint: "Aprobat, încă neînceput"),
        "in_progress": .init(label: "În lucru", symbol: "wrench.and.screwdriver", color: .orange, hint: "Mecanicul lucrează"),
        "waiting_parts": .init(label: "Așteaptă piese", symbol: "shippingbox", color: .yellow, hint: "Blocat până vin piesele"),
        "ready": .init(label: "Gata", symbol: "checkmark.circle", color: .green, hint: "Gata de predare"),
        "delivered": .init(label: "Predat", symbol: "key", color: .gray, hint: "Mașina a fost predată"),
        "cancelled": .init(label: "Anulat", symbol: "xmark.circle", color: .gray, hint: "Lucrare anulată"),
    ]

    static func workOrder(_ status: String) -> StatusStyle {
        workOrderStatus[status] ?? .init(label: status, symbol: "questionmark.circle", color: .gray)
    }

    /// The order the statuses are listed in filters.
    static let workOrderOrder = ["estimate", "approved", "in_progress", "waiting_parts", "ready", "delivered", "cancelled"]
}
