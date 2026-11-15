import SwiftUI

// Port of src/domain/appointment-list.js (Toate programările, docs/APPOINTMENTS-AND-NAV.md D6–D10),
// src/domain/search.js, and the checks of src/domain/appointment.js.

enum Search {
    /// Lowercase without diacritics: "Ștefan Ionescu" → "stefan ionescu".
    static func fold(_ s: String) -> String {
        s.decomposedStringWithCanonicalMapping.unicodeScalars.filter { !(0x300...0x36F).contains($0.value) }.map(String.init).joined().lowercased()
    }

    static func tokens(_ query: String) -> [String] {
        fold(query).split(whereSeparator: { $0.isWhitespace || $0 == "," }).map(String.init)
    }

    static func matches(_ hay: String, _ tokens: [String]) -> Bool { tokens.allSatisfy { hay.contains($0) } }
}

enum AppointmentList {
    static let statusFilters = ["all", "to-confirm", "confirmed", "arrived", "done", "no_show", "cancelled"]
    static let periods = ["upcoming", "today", "next7", "week", "month", "past", "all"]

    struct Range: Equatable { let from: String?; let to: String? }

    /// A period's days, both included; nil means open. The week starts on Monday.
    static func range(_ period: String, today: String) -> Range {
        switch period {
        case "today": return Range(from: today, to: today)
        case "next7": return Range(from: today, to: Dates.addDays(today, 6))
        case "week":
            let weekday = Dates.calendar.component(.weekday, from: Dates.parseDate(today)!) // 1 = Sunday
            let monday = Dates.addDays(today, -((weekday - 1 + 6) % 7))
            return Range(from: monday, to: Dates.addDays(monday, 6))
        case "month":
            let first = "\(Dates.monthKey(today))-01"
            return Range(from: first, to: Dates.addDays(Dates.addMonths(first, 1), -1))
        case "past": return Range(from: nil, to: Dates.addDays(today, -1))
        case "upcoming": return Range(from: today, to: nil)
        default: return Range(from: nil, to: nil)
        }
    }

    static func inRange(_ day: String, _ r: Range) -> Bool { (r.from == nil || day >= r.from!) && (r.to == nil || day <= r.to!) }

    struct Lookups {
        let customers: [String: Customer]
        let vehicles: [String: Vehicle]
        let services: [String: Service]
    }

    /// Everything a booking is found by: number, customer and phone, plate, car, operations, title, notes.
    static func hay(_ a: Appointment, _ l: Lookups) -> String {
        let customer = l.customers[a.customerId ?? ""]
        let vehicle = l.vehicles[a.vehicleId ?? ""]
        let ops: [String] = (a.operations?.isEmpty == false)
            ? a.operations!.compactMap { $0["name"]?.string }
            : a.serviceIds.compactMap { l.services[$0]?.name }
        var parts: [String] = []
        if let n = a.number { parts.append("#\(n) \(n)") }
        parts += [customer?.name, customer?.phone, customer?.phone.filter(\.isNumber)].compactMap { $0 }
        if let v = vehicle, !v.plate.isEmpty { parts += [People.formatPlate(v.plate), People.normalizePlate(v.plate)] }
        parts.append(vehicle?.title ?? "")
        parts += ops
        parts += [a.title, a.notes]
        return Search.fold(parts.filter { !$0.isEmpty }.joined(separator: " "))
    }

    static func sort(_ list: [Appointment], by sort: String, period: String, customers: [String: Customer]) -> [Appointment] {
        switch sort {
        case "created": return list.sorted { $0.createdAt > $1.createdAt }
        case "customer":
            return list.sorted {
                let a = customers[$0.customerId ?? ""]?.name ?? "", b = customers[$1.customerId ?? ""]?.name ?? ""
                let c = a.compare(b, locale: Locale(identifier: "ro"))
                return c == .orderedSame ? $0.start < $1.start : c == .orderedAscending
            }
        default:
            let s = list.sorted { $0.start < $1.start }
            return period == "past" ? s.reversed() : s
        }
    }

    struct Result { let rows: [Appointment]; let counts: [String: Int] }

    /// The list filtered by status, period, mechanic ("all" | id | "none") and search tokens, sorted, with a count per status chip.
    static func list(_ appointments: [Appointment], status: String = "all", period: String = "upcoming", staff: String = "all",
                     tokens: [String] = [], sort: String = "time", today: String, now: String, lookups: Lookups) -> Result {
        let r = range(period, today: today)
        let toConfirm = Set(Agenda.bookingsToConfirm(appointments, now: now).groups.flatMap { $0.items.map(\.id) })
        var counts = Dictionary(uniqueKeysWithValues: statusFilters.map { ($0, 0) })
        var rows: [Appointment] = []
        for a in appointments {
            guard staff == "all" || (staff == "none" ? a.staffId == nil : a.staffId == staff) else { continue }
            let waiting = toConfirm.contains(a.id)
            if waiting { counts["to-confirm"]! += 1 }
            let inPeriod = inRange(Dates.dayOfInstant(a.start) ?? "", r)
            if inPeriod {
                if a.status != "cancelled" { counts["all"]! += 1 }
                if counts[a.status] != nil { counts[a.status]! += 1 }
            }
            let kept = status == "to-confirm" ? waiting : inPeriod && (status == "all" ? a.status != "cancelled" : a.status == status)
            guard kept else { continue }
            if !tokens.isEmpty && !Search.matches(hay(a, lookups), tokens) { continue }
            rows.append(a)
        }
        return Result(rows: self.sort(rows, by: sort, period: status == "to-confirm" ? "upcoming" : period, customers: lookups.customers), counts: counts)
    }

    struct DayGroup: Identifiable { let day: String; var items: [Appointment]; var minutes: Int; var id: String { day } }

    /// Rows grouped by local day, in the order given, with their booked minutes (cancelled and no-shows aside).
    static func groupByDay(_ rows: [Appointment]) -> [DayGroup] {
        var groups: [DayGroup] = []
        for a in rows {
            let day = Dates.dayOfInstant(a.start) ?? ""
            if groups.last?.day != day { groups.append(DayGroup(day: day, items: [], minutes: 0)) }
            groups[groups.count - 1].items.append(a)
            if a.isActive { groups[groups.count - 1].minutes += Dates.minutesBetween(a.start, a.end) }
        }
        return groups
    }

    struct Stats: Equatable {
        let todayCount: Int
        let nextId: String?
        let toConfirm: Int
        let noShow: Double?
        let booked: Int
        let capacity: Int
        var share: Double? { capacity > 0 ? Double(booked) / Double(capacity) : nil }
    }

    /// The four numbers on top: today (and the next one to come), to confirm, no-shows over 30 days, this week's load.
    static func stats(_ appointments: [Appointment], today: String, now: String, staffCount: Int, open: String, close: String, days: [Int]) -> Stats {
        let todays = appointments.filter { $0.status != "cancelled" && Dates.dayOfInstant($0.start) == today }.sorted { $0.start < $1.start }
        let next = todays.first { ($0.status == "scheduled" || $0.status == "confirmed") && $0.start > now }
        let rate = Analytics.showRate(appointments, Analytics.window(today: today, period: "30d")).value
        let week = range("week", today: today)
        let booked = appointments.filter { $0.isActive && inRange(Dates.dayOfInstant($0.start) ?? "", week) }.reduce(0) { $0 + Dates.minutesBetween($1.start, $1.end) }
        let mins = { (t: String) -> Int in let p = t.split(separator: ":").compactMap { Int($0) }; return p.count == 2 ? p[0] * 60 + p[1] : 0 }
        let openDays = (0..<7).filter { i in
            let d = Dates.parseDate(Dates.addDays(week.from!, i))!
            return days.contains(Dates.calendar.component(.weekday, from: d) - 1)
        }.count
        let capacity = max(0, mins(close) - mins(open)) * openDays * max(staffCount, 1)
        return Stats(todayCount: todays.count, nextId: next?.id, toConfirm: Agenda.bookingsToConfirm(appointments, now: now).total,
                     noShow: rate.map { 1 - $0 }, booked: booked, capacity: capacity)
    }
}

extension AppointmentRules {
    static func overlaps(_ a: Appointment, _ b: Appointment) -> Bool { a.start < b.end && b.start < a.end }

    /// Same mechanic or bay at the same time: a warning, not an error.
    static func conflicts(_ a: Appointment, among candidates: [Appointment]) -> [Appointment] {
        guard a.isActive else { return [] }
        return candidates.filter { o in
            o.id != a.id && o.isActive && overlaps(a, o) && ((a.staffId != nil && o.staffId == a.staffId) || (a.bayId != nil && o.bayId == a.bayId))
        }
    }

    static func problem(start: String?, end: String?, customerId: String?) -> String? {
        guard let start, let end, !start.isEmpty, !end.isEmpty else { return "Alege ora de început și de sfârșit." }
        if !(start < end) { return "Ora de sfârșit trebuie să fie după ora de început." }
        if customerId == nil { return "Alege clientul." }
        return nil
    }

    static let cancelReasons: [(key: String, label: String)] = [("client", "Clientul a anulat"), ("shop", "Service-ul a anulat"), ("other", "Alt motiv")]

    static let status: [String: StatusStyle] = [
        "scheduled": .init(label: "Programat", symbol: "calendar.badge.clock", color: .yellow),
        "confirmed": .init(label: "Confirmat", symbol: "calendar.badge.checkmark", color: .green),
        "arrived": .init(label: "Sosit", symbol: "car.fill", color: .teal),
        "done": .init(label: "Finalizat", symbol: "checkmark.circle", color: .gray),
        "no_show": .init(label: "Neprezentat", symbol: "person.slash", color: .red),
        "cancelled": .init(label: "Anulat", symbol: "xmark.circle", color: .gray),
    ]

    static func style(_ s: String) -> StatusStyle { status[s] ?? .init(label: s, symbol: "calendar", color: .gray) }
}
