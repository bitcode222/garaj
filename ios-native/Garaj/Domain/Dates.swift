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
