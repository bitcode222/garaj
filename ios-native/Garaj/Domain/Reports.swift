import Foundation

// Port of src/domain/reports.js.

enum Reports {
    struct Row: Hashable, Sendable {
        let month: String // a month ("2026-09") or, for revenueByDay, a day ("2026-09-01")
        var labor = 0, parts = 0, fees = 0, net = 0, count = 0
    }

    struct Summary: Hashable, Sendable {
        var net = 0, gross = 0, labor = 0, parts = 0, partsCost = 0, count = 0
        var hours = 0.0
        var avgTicket = 0
        var partsMargin = 0
        var partsMarginPct = 0.0
    }

    struct TopService: Hashable, Sendable {
        let key: String
        let name: String
        var count = 0
        var revenue = 0
    }

    struct StaffRow: Hashable, Sendable {
        let staffId: String
        var hours = 0.0
        var revenue = 0
    }

    struct Aging: Hashable, Sendable {
        var current = 0, d30 = 0, d60 = 0, d90 = 0, total = 0
    }

    /// Revenue counts every numbered invoice: a cancelled original and its storno net to zero,
    /// each in its own month, like the accounting ledger.
    static func isRevenue(_ i: Invoice) -> Bool { i.status != "draft" && i.number != nil }

    /// An invoice counted in the period's number of invoices (not a storno, not cancelled).
    private static func counts(_ i: Invoice) -> Bool { i.stornoOf == nil && i.status != "cancelled" }

    private static func inRange(_ i: Invoice, from: String, to: String) -> Bool {
        guard isRevenue(i), let d = i.issueDate else { return false }
        return d >= from && d <= to
    }

    /// Last `count` months ending with the month of `today`: ["2025-10", …, "2026-09"].
    static func monthRange(today: String, count: Int) -> [String] {
        let first = Dates.addMonths("\(Dates.monthKey(today))-01", -(count - 1))
        return (0..<count).map { Dates.monthKey(Dates.addMonths(first, $0)) }
    }

    static func revenueByMonth(_ invoices: [Invoice], months: [String]) -> [Row] {
        bucket(invoices, keys: months) { $0.issueDate.map(Dates.monthKey) }
    }

    /// Same as revenueByMonth, one row per day ("2026-09-01" …).
    static func revenueByDay(_ invoices: [Invoice], days: [String]) -> [Row] {
        bucket(invoices, keys: days) { $0.issueDate }
    }

    private static func bucket(_ invoices: [Invoice], keys: [String], key: (Invoice) -> String?) -> [Row] {
        let index = Dictionary(keys.enumerated().map { ($1, $0) }, uniquingKeysWith: { a, _ in a })
        var rows = keys.map { Row(month: $0) }
        for invoice in invoices where isRevenue(invoice) {
            guard let k = key(invoice), let i = index[k] else { continue }
            let t = invoice.totals ?? Totals()
            rows[i].labor += t.labor
            rows[i].parts += t.parts
            rows[i].fees += t.fees
            rows[i].net += t.net
            if counts(invoice) { rows[i].count += 1 }
        }
        return rows
    }

    static func summarize(_ invoices: [Invoice], from: String, to: String) -> Summary {
        var s = Summary()
        for invoice in invoices where inRange(invoice, from: from, to: to) {
            let t = invoice.totals ?? Totals()
            s.net += t.net
            s.gross += t.gross
            s.labor += t.labor
            s.parts += t.parts
            s.partsCost += t.cost
            s.hours += t.hours
            if counts(invoice) { s.count += 1 }
        }
        s.avgTicket = s.count > 0 ? Int(Money.jsRound(Double(s.net) / Double(s.count))) : 0
        s.partsMargin = s.parts - s.partsCost
        s.partsMarginPct = s.parts != 0 ? Double(s.partsMargin) / Double(s.parts) * 100 : 0
        return s
    }

    static func topServices(_ invoices: [Invoice], from: String, to: String, limit: Int = 5) -> [TopService] {
        var order: [String] = []
        var map: [String: TopService] = [:]
        for invoice in invoices where inRange(invoice, from: from, to: to) {
            for line in invoice.lines where line.kind == "labor" {
                let key = line.refId.flatMap { $0.isEmpty ? nil : $0 } ?? line.description
                if map[key] == nil { order.append(key); map[key] = TopService(key: key, name: line.description) }
                map[key]!.revenue += Lines.net(line)
                map[key]!.count += line.qty > 0 ? 1 : line.qty < 0 ? -1 : 0
            }
        }
        return stableSorted(order.compactMap { map[$0] }.filter { $0.revenue > 0 }) { $0.revenue > $1.revenue }
            .prefix(limit).map { $0 }
    }

    /// Billed labor hours and revenue per mechanic (from labor lines' staffId).
    static func staffProductivity(_ invoices: [Invoice], from: String, to: String) -> [StaffRow] {
        var order: [String] = []
        var map: [String: StaffRow] = [:]
        for invoice in invoices where inRange(invoice, from: from, to: to) {
            for line in invoice.lines where line.kind == "labor" {
                guard let staffId = line.staffId, !staffId.isEmpty else { continue }
                if map[staffId] == nil { order.append(staffId); map[staffId] = StaffRow(staffId: staffId) }
                map[staffId]!.hours += line.qty
                map[staffId]!.revenue += Lines.net(line)
            }
        }
        return stableSorted(order.compactMap { map[$0] }) { $0.revenue > $1.revenue }
    }

    /// Payments in the period by method (cash, card, transfer, and any other method seen).
    static func paymentMix(_ payments: [Payment], from: String, to: String) -> [String: Int] {
        var mix = ["cash": 0, "card": 0, "transfer": 0]
        for p in payments where p.date >= from && p.date <= to { mix[p.method, default: 0] += p.amount }
        return mix
    }

    /// Outstanding balances bucketed by days past due.
    static func receivablesAging(_ invoices: [Invoice], paymentsByInvoice: [String: [Payment]], today: String) -> Aging {
        var b = Aging()
        for invoice in invoices where invoice.status == "issued" && invoice.stornoOf == nil {
            let balance = InvoiceRules.balance(invoice, paymentsByInvoice[invoice.id] ?? [])
            if balance <= 0 { continue }
            let late = invoice.dueDate.map { Dates.diffDays($0, today) } ?? 0
            if late <= 0 { b.current += balance } else if late <= 30 { b.d30 += balance } else if late <= 60 { b.d60 += balance } else { b.d90 += balance }
            b.total += balance
        }
        return b
    }

    /// Array.prototype.sort is stable; Swift's sort is not guaranteed to be.
    private static func stableSorted<T>(_ items: [T], by before: (T, T) -> Bool) -> [T] {
        items.enumerated().sorted { a, b in
            before(a.element, b.element) ? true : before(b.element, a.element) ? false : a.offset < b.offset
        }.map(\.element)
    }

    // MARK: The Rapoarte page (src/features/reports/reports-page.jsx)

    static let periods: [(key: String, label: String)] = [("month", "Luna aceasta"), ("3m", "3 luni"), ("12m", "12 luni"), ("year", "Anul curent")]

    static func periodRange(_ period: String, today: String) -> (from: String, to: String) {
        switch period {
        case "month": return ("\(Dates.monthKey(today))-01", today)
        case "year": return ("\(today.prefix(4))-01-01", today)
        default: return ("\(monthRange(today: today, count: period == "3m" ? 3 : 12)[0])-01", today)
        }
    }

    /// The chart's rows: one per day this month, else one per month.
    static func rows(_ invoices: [Invoice], period: String, today: String) -> [Row] {
        if period == "month" {
            let r = periodRange(period, today: today)
            return revenueByDay(invoices, days: (0...Dates.diffDays(r.from, r.to)).map { Dates.addDays(r.from, $0) })
        }
        let count = period == "3m" ? 3 : period == "12m" ? 12 : Int(today.dropFirst(5).prefix(2)) ?? 12
        return revenueByMonth(invoices, months: monthRange(today: today, count: count))
    }
}
