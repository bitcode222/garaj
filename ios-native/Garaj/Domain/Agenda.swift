import Foundation

// Port of src/domain/agenda.js (docs/HOME-PAGE.md D6, D7) and the bits of visit.js and
// appointment.js the home page needs.

enum Agenda {
    /// How far ahead "De confirmat" looks (today included), and how far back "Au trecut" does.
    static let days = 7

    /// Minutes a booked car is overdue today (visit.js arrivalDelay); 0 otherwise.
    static func arrivalDelay(_ a: Appointment, now: String, grace: Int = 15) -> Int {
        guard a.status == "scheduled" || a.status == "confirmed" else { return 0 }
        guard Dates.dayOfInstant(a.start) == Dates.dayOfInstant(now) else { return 0 }
        let from = (a.expectedAt.map { $0 > a.start } ?? false) ? a.expectedAt! : a.start
        guard let f = Dates.parseInstant(from), let n = Dates.parseInstant(now) else { return 0 }
        let late = Int((n.timeIntervalSince(f) / 60).rounded(.down))
        return late > grace ? late : 0
    }

    /// Time passed with nothing recorded: today and late, or an earlier day and never received.
    static func bookingPassed(_ a: Appointment, now: String) -> Bool {
        guard a.status == "scheduled" || a.status == "confirmed", let day = Dates.dayOfInstant(a.start), let today = Dates.dayOfInstant(now) else { return false }
        return day < today || (day == today && arrivalDelay(a, now: now) > 0)
    }

    struct BookingGroup: Identifiable { let key: String; let day: String?; let items: [Appointment]; var id: String { key } }
    struct Bookings { let groups: [BookingGroup]; let total: Int; let week: [String: Int] }

    /// "past" first (latest first), then the unconfirmed ones still to come, one group per day.
    static func bookingsToConfirm(_ appointments: [Appointment], now: String, days: Int = Agenda.days) -> Bookings {
        let today = Dates.dayOfInstant(now) ?? Dates.today()
        let last = Dates.addDays(today, days - 1)
        let first = Dates.addDays(today, -days)
        var week = ["scheduled": 0, "confirmed": 0, "arrived": 0, "done": 0, "no_show": 0]
        var past: [Appointment] = []
        var byDay: [String: [Appointment]] = [:]
        for a in appointments where a.status != "cancelled" {
            guard let day = Dates.dayOfInstant(a.start) else { continue }
            if day >= today && day <= last && week[a.status] != nil { week[a.status]! += 1 }
            if bookingPassed(a, now: now) {
                if day >= first && day <= last { past.append(a) }
                continue
            }
            if a.status != "scheduled" || day < today || day > last { continue }
            byDay[day, default: []].append(a)
        }
        var groups: [BookingGroup] = []
        if !past.isEmpty { groups.append(.init(key: "past", day: nil, items: past.sorted { $0.start > $1.start })) }
        for day in byDay.keys.sorted() { groups.append(.init(key: day, day: day, items: byDay[day]!.sorted { $0.start < $1.start })) }
        return Bookings(groups: groups, total: groups.reduce(0) { $0 + $1.items.count }, week: week)
    }

    static let collectOrder = ["overdue", "partial", "issued", "draft"]

    struct CollectItem: Identifiable {
        let invoice: Invoice
        let state: String
        let total: Int
        let paid: Int
        let balance: Int
        let overdueDays: Int
        let dueIn: Int?
        var id: String { invoice.id }
    }

    struct CollectGroup: Identifiable { let key: String; let items: [CollectItem]; let amount: Int; var id: String { key } }
    struct Collect { let groups: [CollectGroup]; let total: Int; let due: Int; let drafts: Int }

    /// Every invoice not collected yet, in collectOrder (paid, cancelled and storno ones are not).
    static func invoicesToCollect(_ invoices: [Invoice], paymentsByInvoice: [String: [Payment]], today: String, vatPayer: Bool) -> Collect {
        var lists: [String: [CollectItem]] = Dictionary(uniqueKeysWithValues: collectOrder.map { ($0, []) })
        for inv in invoices {
            let pays = paymentsByInvoice[inv.id] ?? []
            let state = InvoiceRules.state(inv, payments: pays, today: today)
            guard lists[state] != nil else { continue }
            let total = inv.totals?.gross ?? 0
            let draft = state == "draft"
            let paid = draft ? 0 : InvoiceRules.sumPayments(pays)
            let balance = draft ? total : max(0, total - paid)
            let overdue = state == "overdue" && inv.dueDate != nil ? max(0, Dates.diffDays(inv.dueDate!, today)) : 0
            lists[state]!.append(CollectItem(invoice: inv, state: state, total: total, paid: paid, balance: balance, overdueDays: overdue,
                                             dueIn: !draft && inv.dueDate != nil ? Dates.diffDays(today, inv.dueDate!) : nil))
        }
        let groups = collectOrder.compactMap { key -> CollectGroup? in
            guard var items = lists[key], !items.isEmpty else { return nil }
            switch key {
            case "overdue": items.sort { $0.overdueDays > $1.overdueDays }
            case "draft": items.sort { $0.invoice.createdAt < $1.invoice.createdAt }
            default: items.sort { ($0.invoice.dueDate ?? "9") < ($1.invoice.dueDate ?? "9") }
            }
            return CollectGroup(key: key, items: items, amount: items.reduce(0) { $0 + $1.balance })
        }
        let amount = { (k: String) in groups.first { $0.key == k }?.amount ?? 0 }
        return Collect(groups: groups, total: groups.reduce(0) { $0 + $1.items.count },
                       due: amount("overdue") + amount("partial") + amount("issued"), drafts: amount("draft"))
    }

    /// The stages of the cars in the shop, in order (Devize, then Lucrări without the handed-over ones).
    static let shopStages = ["estimate", "approved", "in_progress", "waiting_parts", "ready"]

    struct JobGroup: Identifiable { let key: String; let items: [WorkOrder]; let amount: Int; var id: String { key } }

    /// The jobs in `stages`, grouped in that order, longest waiting first; `amount` with VAT (jobsToShow).
    static func jobsToShow(_ orders: [WorkOrder], stages: [String] = shopStages, vatPayer: Bool) -> [JobGroup] {
        let grouped = Dictionary(grouping: orders.filter { stages.contains($0.status) }, by: \.status)
        return stages.compactMap { key in
            guard var items = grouped[key], !items.isEmpty else { return nil }
            items.sort { $0.createdAt < $1.createdAt }
            if key == "delivered" { items.reverse() }
            return JobGroup(key: key, items: items, amount: items.reduce(0) { $0 + Lines.totals($1.lines, vatPayer: vatPayer).gross })
        }
    }
}
