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
        "declined": .init(label: "Refuzat", symbol: "hand.thumbsdown", color: .red, hint: "Clientul a refuzat devizul"),
    ]

    /// What the button that moves a job to a status says (WORK_ORDER_ACTIONS).
    static func workOrderAction(from: String, to: String) -> String {
        if from == "delivered" && to == "ready" { return "Redeschide" }
        if (from == "cancelled" || from == "declined") && to == "estimate" { return "Reactivează" }
        if WorkOrderRules.isBackward(from, to) {
            return ["approved": "Înapoi la aprobat", "in_progress": "Înapoi în lucru", "estimate": "Înapoi la deviz"][to] ?? workOrder(to).label
        }
        return [
            "approved": "Aprobă devizul", "in_progress": from == "waiting_parts" ? "Reia lucrul" : "Începe lucrul",
            "waiting_parts": "Așteaptă piese", "ready": "Marchează gata", "delivered": "Predă mașina",
            "estimate": "Înapoi la deviz", "cancelled": "Anulează lucrarea",
            "declined": "Clientul a refuzat",
        ][to] ?? workOrder(to).label
    }

    static func workOrder(_ status: String) -> StatusStyle {
        workOrderStatus[status] ?? .init(label: status, symbol: "questionmark.circle", color: .gray)
    }

    static let invoiceState: [String: StatusStyle] = [
        "draft": .init(label: "Ciornă", symbol: "square.and.pencil", color: .gray),
        "issued": .init(label: "Emisă", symbol: "clock", color: .yellow),
        "partial": .init(label: "Parțial plătită", symbol: "circle.dashed", color: .yellow),
        "paid": .init(label: "Plătită", symbol: "checkmark.circle", color: .green),
        "overdue": .init(label: "Restantă", symbol: "exclamationmark.circle", color: .red),
        "cancelled": .init(label: "Stornată", symbol: "arrow.uturn.backward", color: .gray),
        "storno": .init(label: "Stornare", symbol: "arrow.uturn.backward", color: .gray),
    ]

    static func invoice(_ state: String) -> StatusStyle {
        invoiceState[state] ?? .init(label: state, symbol: "doc", color: .gray)
    }

    static let paymentMethods: [(key: String, label: String, symbol: String)] = [
        ("cash", "Numerar", "banknote"), ("card", "Card", "creditcard"), ("transfer", "Transfer bancar", "building.columns"),
    ]

    static func paymentMethod(_ key: String) -> String { paymentMethods.first { $0.key == key }?.label ?? key }

    /// The order the statuses are listed in filters.
    static let workOrderOrder = ["estimate", "approved", "in_progress", "waiting_parts", "ready", "delivered", "cancelled"]
}
