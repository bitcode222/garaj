import Foundation

// Port of src/domain/work-order.js (the flow of a job).
// estimate → approved → in_progress ⇄ waiting_parts → ready → delivered (docs/VISIT-FLOW.md §6.2)

enum WorkOrderRules {
    static let flow = ["estimate", "approved", "in_progress", "waiting_parts", "ready", "delivered"]

    static let transitions: [String: [String]] = [
        "estimate": ["approved", "in_progress", "ready", "delivered", "cancelled", "declined"],
        "approved": ["in_progress", "ready", "delivered", "estimate", "cancelled"],
        "in_progress": ["waiting_parts", "ready", "delivered", "approved", "estimate", "cancelled"],
        "waiting_parts": ["in_progress", "ready", "delivered", "approved", "estimate", "cancelled"],
        "ready": ["delivered", "in_progress", "approved", "estimate"],
        "delivered": ["ready"],
        "cancelled": ["estimate"],
        "declined": ["estimate"],
    ]

    private static let rank = ["estimate": 0, "approved": 1, "in_progress": 2, "waiting_parts": 2, "ready": 3, "delivered": 4]

    /// The one-tap "next step" (swipe action); closed jobs have none.
    static let next = ["estimate": "approved", "approved": "in_progress", "in_progress": "ready", "waiting_parts": "in_progress", "ready": "delivered"]

    static let openStatuses: Set<String> = ["estimate", "approved", "in_progress", "waiting_parts", "ready"]

    static func isOpen(_ status: String) -> Bool { openStatuses.contains(status) }

    /// Only notes can change on a delivered or cancelled job (actions.js updateWorkOrder).
    static func isLocked(_ status: String) -> Bool { status == "delivered" || status == "cancelled" }

    static func canTransition(_ from: String, _ to: String) -> Bool { transitions[from]?.contains(to) ?? false }

    /// True when `to` is an earlier stage than `from` (in progress ⇄ waiting for parts is sideways).
    static func isBackward(_ from: String, _ to: String) -> Bool {
        (rank[to] ?? .max) < (rank[from] ?? .min)
    }

    /// The main stages a forward jump passes over ("waiting for parts" is a pause, never skipped).
    static func skipped(_ from: String, _ to: String) -> [String] {
        let main = ["estimate", "approved", "in_progress", "ready", "delivered"]
        guard let start = main.firstIndex(of: from == "waiting_parts" ? "in_progress" : from),
              let end = main.firstIndex(of: to), end > start + 1 else { return [] }
        return Array(main[(start + 1)..<end])
    }

    /// Only jobs not yet approved (or cancelled), without an invoice, can be deleted.
    static func canDelete(status: String, invoiceId: String?) -> Bool {
        (status == "estimate" || status == "cancelled") && invoiceId == nil
    }

    static let inspectionItems: [(key: String, label: String)] = [
        ("brakes", "Frâne"), ("tires", "Anvelope"), ("lights", "Lumini și semnalizare"),
        ("fluids", "Lichide (ulei, antigel, frână)"), ("wipers", "Ștergătoare"), ("battery", "Baterie"),
        ("suspension", "Suspensie și direcție"), ("exhaust", "Evacuare"), ("belts", "Curele"), ("filters", "Filtre"),
    ]

    static func defaultInspection() -> [JSONValue] {
        inspectionItems.map { .object(["key": .string($0.key), "status": .null, "note": .string("")]) }
    }

    /// Plain-text estimate for WhatsApp / SMS approval (estimateMessage).
    static func estimateMessage(order: WorkOrder, customer: Customer?, vehicle: Vehicle?, settings: ShopSettings) -> String {
        let totals = Lines.totals(order.lines, vatPayer: settings.vatPayer)
        var lines = order.lines.prefix(12).map { "• \($0.description) — \(JS.number($0.qty)) \($0.unit)" }.joined(separator: "\n")
        if order.lines.count > 12 { lines += "\n• … încă \(order.lines.count - 12) poziții" }
        let labels = Dictionary(uniqueKeysWithValues: inspectionItems.map { ($0.key, $0.label) })
        let findings = order.inspection.compactMap { item -> String? in
            guard let status = item["status"]?.string, status == "attention" || status == "urgent" else { return nil }
            let key = item["key"]?.string ?? ""
            let note = item["note"]?.string ?? ""
            return "\(labels[key] ?? key) (\(status == "urgent" ? "urgent" : "de urmărit"))\(note.isEmpty ? "" : ": \(note)")"
        }
        let greeting = customer.map { ", \(People.greetingName($0))" } ?? ""
        let plate = vehicle.map { People.formatPlate($0.plate) } ?? ""
        return [
            "Bună ziua\(greeting)!",
            "Deviz pentru \(vehicle?.title ?? "") \(plate) (lucrarea \(order.number)):",
            lines,
            "Total: \(Money.format(totals.gross, currency: settings.currency))\(settings.vatPayer ? " cu TVA" : "").",
            findings.isEmpty ? nil : "La verificare am mai găsit: \(findings.joined(separator: "; ")).",
            "Confirmați să începem lucrarea? Mulțumim!",
            settings.shopName,
        ].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: "\n")
    }

    /// "The car is ready" for WhatsApp / SMS (readyMessage).
    static func readyMessage(customer: Customer?, vehicle: Vehicle?, settings: ShopSettings) -> String {
        let car = [vehicle?.title, vehicle.map { $0.plate.isEmpty ? nil : "(\(People.formatPlate($0.plate)))" } ?? nil]
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
        let greeting = customer.map { ", \(People.greetingName($0))" } ?? ""
        return ["Bună ziua\(greeting)! \(car.isEmpty ? "Mașina" : car) este gata de ridicare.",
                "Program: \(settings.hoursOpen)–\(settings.hoursClose).", settings.shopName].joined(separator: " ")
    }
}

/// JavaScript's number → string, for messages that must read the same as the web's.
enum JS {
    static func number(_ x: Double) -> String {
        if x.rounded() == x, abs(x) < 1e15 { return String(Int(x)) }
        return String(x)
    }
}
