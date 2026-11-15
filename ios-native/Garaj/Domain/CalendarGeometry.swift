import Foundation

// Port of src/features/calendar/utils.js: the calendar's days, visible hours, side-by-side
// layout of overlapping bookings, and minutes ↔ instants (local time, DST-safe).

enum CalendarGeometry {
    static let snapMinutes = 15

    /// Monday-first week containing `day`.
    static func weekDays(_ day: String) -> [String] {
        let weekday = Dates.calendar.component(.weekday, from: Dates.parseDate(day)!) // 1 = Sunday
        let monday = Dates.addDays(day, -((weekday - 1 + 6) % 7))
        return (0..<7).map { Dates.addDays(monday, $0) }
    }

    /// 6 × 7 Monday-first grid around the month of `day`.
    static func monthGrid(_ day: String) -> [String] {
        let start = weekDays("\(Dates.monthKey(day))-01")[0]
        return (0..<42).map { Dates.addDays(start, $0) }
    }

    /// Local minutes since midnight of an ISO instant.
    static func minuteOfDay(_ instant: String) -> Int {
        guard let d = Dates.parseInstant(instant) else { return 0 }
        let c = Dates.calendar.dateComponents([.hour, .minute], from: d)
        return c.hour! * 60 + c.minute!
    }

    static func toMinutes(_ hhmm: String) -> Int {
        let p = hhmm.split(separator: ":").compactMap { Int($0) }
        return (p.first ?? 0) * 60 + (p.count > 1 ? p[1] : 0)
    }

    /// The instant for `day` at `minutes` after local midnight (JS setHours(0, minutes)).
    static func atMinute(_ day: String, _ minutes: Int) -> String {
        let midnight = Dates.parseDate(day)!
        var c = Dates.calendar.dateComponents([.year, .month, .day], from: midnight)
        c.hour = 0
        c.minute = minutes
        return Dates.instant(Dates.calendar.date(from: c)!)
    }

    /// Visible hours: opening hours, stretched to include any booking outside them.
    static func timeBounds(open: String, close: String, events: [(start: String, end: String)]) -> (start: Int, end: Int) {
        var start = toMinutes(open) / 60 * 60
        var end = Int((Double(toMinutes(close)) / 60).rounded(.up)) * 60
        for e in events {
            start = min(start, minuteOfDay(e.start) / 60 * 60)
            let endMin = Dates.dayOfInstant(e.end) != Dates.dayOfInstant(e.start) ? 24 * 60 : minuteOfDay(e.end)
            end = max(end, Int((Double(endMin) / 60).rounded(.up)) * 60)
        }
        return (max(0, start), min(24 * 60, max(end, start + 60)))
    }

    struct Placed: Equatable { let id: String; let lane: Int; let lanes: Int }

    /// Side-by-side layout: each booking gets a lane and the number of lanes in its overlap cluster.
    static func layout(_ events: [(id: String, start: String, end: String)]) -> [Placed] {
        let sorted = events.sorted { a, b in a.start == b.start ? a.end > b.end : a.start < b.start }
        var placed: [(id: String, lane: Int)] = []
        var lanesOf: [Int] = []
        var cluster: [Int] = [] // indexes into placed
        var clusterEnd = ""
        var laneEnds: [String] = []
        func close() {
            for i in cluster { lanesOf[i] = laneEnds.count }
            cluster = []
            laneEnds = []
        }
        for e in sorted {
            if !cluster.isEmpty && e.start >= clusterEnd { close() }
            var lane = laneEnds.firstIndex { $0 <= e.start } ?? -1
            if lane == -1 { lane = laneEnds.count; laneEnds.append(e.end) } else { laneEnds[lane] = e.end }
            placed.append((e.id, lane))
            lanesOf.append(1)
            cluster.append(placed.count - 1)
            clusterEnd = cluster.count == 1 ? e.end : max(clusterEnd, e.end)
        }
        close()
        return placed.enumerated().map { Placed(id: $1.id, lane: $1.lane, lanes: lanesOf[$0]) }
    }

    /// A minute rounded to the snap step.
    static func snap(_ minutes: Double, step: Int = snapMinutes) -> Int { Int((minutes / Double(step)).rounded()) * step }
}
