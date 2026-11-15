import Foundation

// Port of src/domain/dates.js. Date-only values are "YYYY-MM-DD" strings in
// local time; instants are ISO strings with milliseconds and "Z".

enum Dates {
    static var calendar: Calendar { Calendar(identifier: .gregorian) }

    static func isoDate(_ date: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    static func today(_ now: Date = .now) -> String { isoDate(now) }

    /// "2026-09-30" → Date at local midnight.
    static func parseDate(_ s: String) -> Date? {
        let p = s.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: p[0], month: p[1], day: p[2]))
    }

    static func addDays(_ s: String, _ days: Int) -> String {
        guard let d = parseDate(s), let r = calendar.date(byAdding: .day, value: days, to: d) else { return s }
        return isoDate(r)
    }

    private static let withFraction = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
    private static let withoutFraction = Date.ISO8601FormatStyle()

    static func parseInstant(_ s: String) -> Date? {
        (try? withFraction.parse(s)) ?? (try? withoutFraction.parse(s))
    }

    /// Like JS `toISOString()`: "2026-11-15T08:30:00.000Z".
    static func instant(_ date: Date = .now) -> String { withFraction.format(date) }

    /// Local calendar day of an ISO instant.
    static func dayOfInstant(_ s: String) -> String? { parseInstant(s).map(isoDate) }
}

extension Dates {
    /// Adds months, clamped to the end of the month (31 Jan + 1 month = 28/29 Feb).
    static func addMonths(_ s: String, _ months: Int) -> String {
        let p = s.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3, let first = calendar.date(from: DateComponents(year: p[0], month: p[1] + months, day: 1)),
              let range = calendar.range(of: .day, in: .month, for: first) else { return s }
        let c = calendar.dateComponents([.year, .month], from: first)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, min(p[2], range.count))
    }

    static func monthKey(_ s: String) -> String { String(s.prefix(7)) }

    /// Calendar days from `a` to `b` (b − a), immune to DST.
    static func diffDays(_ a: String, _ b: String) -> Int {
        let pa = a.split(separator: "-").compactMap { Int($0) }, pb = b.split(separator: "-").compactMap { Int($0) }
        guard pa.count == 3, pb.count == 3 else { return 0 }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        let da = utc.date(from: DateComponents(year: pa[0], month: pa[1], day: pa[2]))!
        let db = utc.date(from: DateComponents(year: pb[0], month: pb[1], day: pb[2]))!
        return Int(Money.jsRound(db.timeIntervalSince(da) / 86_400))
    }

    /// Minutes between two ISO instants (rounded).
    static func minutesBetween(_ a: String, _ b: String) -> Int {
        guard let da = parseInstant(a), let db = parseInstant(b) else { return 0 }
        return Int(Money.jsRound(db.timeIntervalSince(da) / 60))
    }

    /// ISO instant → "14:30" local.
    static func timeOfInstant(_ s: String) -> String {
        guard let d = parseInstant(s) else { return "" }
        let c = calendar.dateComponents([.hour, .minute], from: d)
        return String(format: "%02d:%02d", c.hour!, c.minute!)
    }
}
