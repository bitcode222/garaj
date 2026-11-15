import SwiftUI

// Port of src/domain/reminders.js: who the shop should contact today, and what to say.
// Keys are stable per cycle (they hold the due date), so a contact or snooze hides a
// reminder until its snooze ends or a new cycle starts.

struct Reminder: Identifiable, Hashable {
    let key: String
    let type: String // itp · rca · service · unpaid · pickup · tomorrow
    let urgency: String // expired · overdue · soon · info
    let days: Int?
    let due: String?
    var kmLeft: Int?
    var amount: Int?
    let customerId: String?
    let vehicleId: String?
    var invoiceId: String?
    var workOrderId: String?
    var appointmentId: String?
    var start: String?
    var id: String { key }
}

enum Reminders {
    static let types: [(key: String, label: String, symbol: String, color: Color)] = [
        ("itp", "ITP", "checkmark.shield", .yellow), ("rca", "RCA", "shield", .purple), ("service", "Revizie", "wrench.and.screwdriver", .blue),
        ("unpaid", "Restanță", "doc.text", .red), ("pickup", "De ridicat", "key", .green), ("tomorrow", "Programare mâine", "calendar.badge.clock", .blue),
    ]

    static func style(_ type: String) -> (label: String, symbol: String, color: Color) {
        let t = types.first { $0.key == type }
        return (t?.label ?? type, t?.symbol ?? "bell", t?.color ?? .gray)
    }

    /// Marketing-style reminders need the customer's consent (GDPR); money and pickup notices are service messages.
    static let needsConsent: Set<String> = ["itp", "rca", "service"]

    private static let urgencyRank = ["expired": 0, "overdue": 0, "soon": 1, "info": 2]

    static func compute(today: String, vehicles: [Vehicle], customers: [String: Customer], invoices: [Invoice], paymentsByInvoice: [String: [Payment]],
                        orders: [WorkOrder], appointments: [Appointment], contacts: [String: Contact]) -> [Reminder] {
        var out: [Reminder] = []
        func push(_ r: Reminder) {
            if let c = contacts[r.key], c.snoozeUntil > today { return }
            out.append(r)
        }
        for v in vehicles {
            guard let customer = customers[v.customerId ?? ""] else { continue }
            for type in ["itp", "rca"] {
                let date = type == "itp" ? v.itpExpiry : v.rcaExpiry
                let d = People.deadline(date, today: today, soonDays: 30)
                if d.status == "soon" || (d.status == "expired" && (d.days ?? 0) >= -60) {
                    push(Reminder(key: "\(type):\(v.id):\(date ?? "")", type: type, urgency: d.status, days: d.days, due: date, customerId: customer.id, vehicleId: v.id))
                }
            }
            let s = People.serviceDue(v, today: today)
            if s.status == "soon" || (s.status == "expired" && (s.days ?? 0) >= -120) {
                push(Reminder(key: "service:\(v.id):\(v.lastServiceDate ?? "undefined")", type: "service", urgency: s.status, days: s.days, due: s.dueDate,
                              kmLeft: s.kmLeft, customerId: customer.id, vehicleId: v.id))
            }
        }
        for inv in invoices where inv.status == "issued" && inv.stornoOf == nil {
            let pays = paymentsByInvoice[inv.id] ?? []
            guard InvoiceRules.state(inv, payments: pays, today: today) == "overdue" else { continue }
            push(Reminder(key: "unpaid:\(inv.id)", type: "unpaid", urgency: "overdue", days: Dates.diffDays(today, inv.dueDate ?? today), due: inv.dueDate,
                          amount: InvoiceRules.balance(inv, pays), customerId: inv.customerId, vehicleId: inv.vehicleId, invoiceId: inv.id))
        }
        for o in orders where o.status == "ready" {
            guard let ready = o.dates["ready"]?.string, let since = Dates.dayOfInstant(ready) else { continue }
            let waiting = Dates.diffDays(since, today)
            if waiting < 1 { continue }
            push(Reminder(key: "pickup:\(o.id)", type: "pickup", urgency: waiting >= 3 ? "overdue" : "soon", days: -waiting, due: since,
                          customerId: o.customerId, vehicleId: o.vehicleId, workOrderId: o.id))
        }
        let tomorrow = Dates.addDays(today, 1)
        for a in appointments where a.status == "scheduled" && Dates.dayOfInstant(a.start) == tomorrow {
            push(Reminder(key: "tomorrow:\(a.id)", type: "tomorrow", urgency: "info", days: 1, due: tomorrow, customerId: a.customerId, vehicleId: a.vehicleId,
                          appointmentId: a.id, start: a.start))
        }
        // JS sort is stable: same urgency and days keep their order.
        return out.enumerated().sorted { x, y in
            let a = x.element, b = y.element
            let ua = urgencyRank[a.urgency] ?? 9, ub = urgencyRank[b.urgency] ?? 9
            if ua != ub { return ua < ub }
            if (a.days ?? 0) != (b.days ?? 0) { return (a.days ?? 0) < (b.days ?? 0) }
            return x.offset < y.offset
        }.map(\.element)
    }

    private static func fmtDate(_ iso: String?) -> String { iso.map { $0.split(separator: "-").reversed().joined(separator: ".") } ?? "" }

    /// Ready-to-send text for WhatsApp / SMS (reminderMessage).
    static func message(_ r: Reminder, customer: Customer?, vehicle: Vehicle?, invoice: Invoice?, settings: JSONObject) -> String {
        let hello = "Bună ziua\(customer.map { ", \(People.greetingName($0))" } ?? "")!"
        let car = vehicle.map { "\($0.title) (\(People.formatPlate($0.plate)))" } ?? "mașina dvs."
        let shop = settings["shop"]?["name"]?.string ?? ""
        let shopPhone = settings["shop"]?["phone"]?.string ?? ""
        let phone = shopPhone.isEmpty ? "" : " \(shopPhone)"
        let iban = settings["shop"]?["iban"]?.string ?? ""
        switch r.type {
        case "itp":
            return "\(hello) ITP-ul pentru \(car) \((r.days ?? 0) < 0 ? "a expirat" : "expiră") pe \(fmtDate(r.due)). Vă putem face verificarea pre-ITP la \(shop). Ce zi vă convine?\(phone)"
        case "rca":
            return "\(hello) Asigurarea RCA pentru \(car) \((r.days ?? 0) < 0 ? "a expirat" : "expiră") pe \(fmtDate(r.due)). Vă reamintim ca să nu rămâneți fără acoperire. \(shop)\(phone)"
        case "service":
            let km = r.kmLeft.map { " (aprox. \(max(0, $0).formatted(.number.locale(Locale(identifier: "ro_RO")))) km rămași)" } ?? ""
            return "\(hello) Revizia pentru \(car) este \(r.urgency == "expired" ? "depășită" : "aproape")\(km). Vă programăm la \(shop)? Răspundeți cu o zi care vă convine.\(phone)"
        case "unpaid":
            return "\(hello) Factura \(invoice?.label ?? "") are un rest de plată de \(Money.format(r.amount, currency: settings["currency"]?.string ?? "RON")), scadent pe \(fmtDate(r.due)).\(iban.isEmpty ? "" : " IBAN: \(iban).") Mulțumim! \(shop)"
        case "pickup":
            return "\(hello) \(car) este gata și vă așteaptă la \(shop). Program: \(settings["hours"]?["open"]?.string ?? "")–\(settings["hours"]?["close"]?.string ?? "").\(phone)"
        case "tomorrow":
            return "\(hello) Vă reamintim programarea de mâine, \(fmtDate(r.due)), ora \(Dates.timeOfInstant(r.start ?? "")), pentru \(car). Confirmați, vă rugăm? \(shop)"
        default:
            return hello
        }
    }

    /// What the row says under the customer (reminders-page.jsx detail).
    static func detail(_ r: Reminder, currency: String) -> String {
        switch r.type {
        case "itp", "rca":
            let d = r.days ?? 0
            return d < 0 ? "a expirat pe \(fmtDate(r.due)) (acum \(-d) zile)" : "expiră pe \(fmtDate(r.due)) (în \(d) \(d == 1 ? "zi" : "zile"))"
        case "service":
            if let km = r.kmLeft, km < 1500 { return "aprox. \(max(0, km).formatted(.number.locale(Locale(identifier: "ro_RO")))) km rămași" }
            return "scadentă pe \(fmtDate(r.due))"
        case "unpaid": return "\(Money.format(r.amount, currency: currency)) · scadentă acum \(-(r.days ?? 0)) zile"
        case "pickup": return "gata de \(-(r.days ?? 0)) \(-(r.days ?? 0) == 1 ? "zi" : "zile"), încă neridicată"
        case "tomorrow": return "mâine la \(Dates.timeOfInstant(r.start ?? ""))"
        default: return ""
        }
    }
}

// MARK: - Stock (inventory.js) and prices (lines.js priceFromCost)

enum Inventory {
    /// Parts on open jobs not yet invoiced are "reserved".
    static func reserved(orders: [WorkOrder], invoices: [String: Invoice]) -> [String: Double] {
        var out: [String: Double] = [:]
        for o in orders where WorkOrderRules.isOpen(o.status) {
            if let inv = invoices[o.invoiceId ?? ""], inv.status != "draft" { continue }
            for l in o.lines where l.kind == "part" { if let ref = l.refId { out[ref, default: 0] += l.qty } }
        }
        return out
    }

    struct Level: Equatable { let available: Double; let reserved: Double; let status: String }

    static func level(_ p: Part, reserved: Double = 0) -> Level {
        let available = Money.jsRound((p.stock - reserved) * 1000) / 1000
        var status = "ok"
        if p.stock <= 0 || available <= 0 { status = "out" } else if available <= p.minStock { status = "low" }
        return Level(available: available, reserved: reserved, status: status)
    }

    /// Unit price from cost and markup, rounded to whole lei like a price list.
    static func priceFromCost(_ cost: Int, markupPct: Double) -> Int {
        let raw = Money.divRound(cost * Int(Money.jsRound(10_000 + markupPct * 100)), 10_000)
        return max(100, Int(Money.jsRound(Double(raw) / 100)) * 100)
    }

    static let serviceCategories: [(key: String, label: String)] = [
        ("maintenance", "Întreținere"), ("brakes", "Frâne"), ("engine", "Motor"), ("diagnostics", "Diagnoză"), ("electrical", "Electrică"),
        ("tires", "Roți"), ("ac", "Climatizare"), ("suspension", "Suspensie"), ("transmission", "Transmisie"), ("inspection", "ITP"),
        ("exhaust", "Evacuare"), ("bodywork", "Caroserie"),
    ]
    static func categoryLabel(_ key: String) -> String { serviceCategories.first { $0.key == key }?.label ?? key }

    static let fuels: [(key: String, label: String)] = [("petrol", "Benzină"), ("diesel", "Diesel"), ("hybrid", "Hibrid"), ("electric", "Electric"), ("lpg", "GPL")]
}
