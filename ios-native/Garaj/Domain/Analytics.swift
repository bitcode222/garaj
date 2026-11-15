import Foundation

// Port of src/domain/analytics.js (docs/HOME-PAGE.md D9): six numbers over a period, a point
// per day (per month over a year), and the change against the period before. Money in bani.

enum Analytics {
    static let periods = ["7d", "30d", "12m"]

    struct Window: Equatable { let unit: String; let keys: [String]; let from: String; let to: String }

    static func window(today: String, period: String, back: Int = 0) -> Window {
        if period == "12m" {
            let to = back > 0 ? Dates.addMonths(today, -12 * back) : today
            let first = Dates.addMonths("\(Dates.monthKey(to))-01", -11)
            let keys = (0..<12).map { Dates.monthKey(Dates.addMonths(first, $0)) }
            return Window(unit: "month", keys: keys, from: first, to: to)
        }
        let length = period == "30d" ? 30 : 7
        let to = Dates.addDays(today, -length * back)
        let keys = (0..<length).map { Dates.addDays(to, $0 - length + 1) }
        return Window(unit: "day", keys: keys, from: keys[0], to: to)
    }

    private static func buckets<T>(_ items: [T], _ w: Window, day: (T) -> String?) -> [[T]] {
        let index = Dictionary(uniqueKeysWithValues: w.keys.enumerated().map { ($1, $0) })
        var out = Array(repeating: [T](), count: w.keys.count)
        for item in items {
            guard let d = day(item), d >= w.from, d <= w.to, let i = index[w.unit == "month" ? Dates.monthKey(d) : d] else { continue }
            out[i].append(item)
        }
        return out
    }

    /// value for the whole window (nil when it cannot be told), a point per bucket, empty = "Fără date".
    struct Metric: Equatable {
        var value: Double?
        var points: [Double?]
        var empty: Bool
        var change: Change? = nil
    }

    struct Change: Equatable { let pct: Double; let points: Bool; let direction: String; let good: Bool? }

    static func collected(_ payments: [Payment], _ w: Window) -> Metric {
        let b = buckets(payments, w) { $0.date }
        let points = b.map { Double($0.reduce(0) { $0 + $1.amount }) }
        return Metric(value: points.reduce(0, +), points: points, empty: b.allSatisfy(\.isEmpty))
    }

    static func received(_ orders: [WorkOrder], _ w: Window) -> Metric {
        let b = buckets(orders, w) { $0.createdAt.isEmpty ? nil : Dates.dayOfInstant($0.createdAt) }
        let points = b.map { Double($0.count) }
        return Metric(value: points.reduce(0, +), points: points, empty: points.allSatisfy { $0 == 0 })
    }

    private static func isRevenue(_ i: Invoice) -> Bool { i.status != "draft" && i.number != nil }
    private static func isTicket(_ i: Invoice) -> Bool { i.stornoOf == nil && i.status != "cancelled" }

    static func averageTicket(_ invoices: [Invoice], _ w: Window) -> Metric {
        let b = buckets(invoices.filter(isRevenue), w) { $0.issueDate }
        func avg(_ list: [Invoice]) -> Double? {
            let tickets = list.filter(isTicket).count
            guard tickets > 0 else { return nil }
            return Money.jsRound(Double(list.reduce(0) { $0 + ($1.totals?.net ?? 0) }) / Double(tickets))
        }
        return Metric(value: avg(b.flatMap { $0 }), points: b.map(avg), empty: b.allSatisfy(\.isEmpty))
    }

    static func billedHours(_ invoices: [Invoice], _ w: Window) -> Metric {
        let b = buckets(invoices.filter(isRevenue), w) { $0.issueDate }
        let points = b.map { $0.reduce(0.0) { $0 + ($1.totals?.hours ?? 0) } }
        return Metric(value: points.reduce(0, +), points: points, empty: b.allSatisfy(\.isEmpty))
    }

    static func showRate(_ appointments: [Appointment], _ w: Window) -> Metric {
        let showed: Set<String> = ["arrived", "done"]
        let decided = appointments.filter { showed.contains($0.status) || $0.status == "no_show" }
        let b = buckets(decided, w) { Dates.dayOfInstant($0.start) }
        func rate(_ l: [Appointment]) -> Double? { l.isEmpty ? nil : Double(l.filter { showed.contains($0.status) }.count) / Double(l.count) }
        return Metric(value: rate(b.flatMap { $0 }), points: b.map(rate), empty: b.allSatisfy(\.isEmpty))
    }

    static func timeInService(_ orders: [WorkOrder], _ w: Window) -> Metric {
        let finished = orders.filter { o in
            guard let ready = o.dates["ready"]?.string, !o.createdAt.isEmpty else { return false }
            return ready >= o.createdAt
        }
        let b = buckets(finished, w) { Dates.dayOfInstant($0.dates["ready"]!.string!) }
        func days(_ l: [WorkOrder]) -> Double? {
            let v = l.compactMap { o -> Double? in
                guard let r = Dates.parseInstant(o.dates["ready"]!.string!), let c = Dates.parseInstant(o.createdAt) else { return nil }
                return r.timeIntervalSince(c) / 86_400
            }.sorted()
            guard !v.isEmpty else { return nil }
            let m = v.count / 2
            return v.count % 2 == 1 ? v[m] : (v[m - 1] + v[m]) / 2
        }
        return Metric(value: days(b.flatMap { $0 }), points: b.map(days), empty: b.allSatisfy(\.isEmpty))
    }

    static func change(_ current: Double?, _ previous: Double?, better: String = "up", points: Bool = false) -> Change? {
        guard let current, let previous, points || previous != 0 else { return nil }
        let pct = points ? (current - previous) * 100 : (current - previous) / abs(previous) * 100
        let direction = abs(pct) < 0.05 ? "flat" : pct > 0 ? "up" : "down"
        return Change(pct: pct, points: points, direction: direction, good: direction == "flat" ? nil : (direction == "up") == (better == "up"))
    }

    struct Home: Equatable {
        let window: Window
        let collected, received, ticket, show, stay, hours: Metric
    }

    static func home(payments: [Payment], orders: [WorkOrder], invoices: [Invoice], appointments: [Appointment], today: String, period: String) -> Home {
        let now = window(today: today, period: period), before = window(today: today, period: period, back: 1)
        func metric(_ measure: (Window) -> Metric, better: String = "up", points: Bool = false) -> Metric {
            var m = measure(now)
            let then = measure(before)
            m.change = m.empty || then.empty ? nil : change(m.value, then.value, better: better, points: points)
            return m
        }
        return Home(window: now,
                    collected: metric { collected(payments, $0) },
                    received: metric { received(orders, $0) },
                    ticket: metric { averageTicket(invoices, $0) },
                    show: metric({ showRate(appointments, $0) }, points: true),
                    stay: metric({ timeInService(orders, $0) }, better: "down"),
                    hours: metric { billedHours(invoices, $0) })
    }
}
