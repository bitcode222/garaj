import Foundation
import Testing
@testable import Garaj

/// The calendar's geometry against src/features/calendar/utils.js, in Bucharest time (DST days included).
struct CalendarTests {
    struct Fixtures: Decodable {
        struct E: Decodable { let id: String?; let start: String; let end: String }
        struct P: Decodable { let id: String; let lane: Int; let lanes: Int }
        struct L: Decodable { let events: [E]; let placed: [P] }
        struct BB: Decodable { let start: Int; let end: Int }
        struct B: Decodable { let events: [E]; let bounds: BB }
        struct W: Decodable { let day: String; let week: [String]; let month: [String] }
        struct M: Decodable { let day: String; let m: Int; let at: String; let back: Int }
        let layouts: [L]
        let bounds: [B]
        let weeks: [W]
        let minutes: [M]
        let open: String
        let close: String
    }

    let f: Fixtures

    init() throws {
        NSTimeZone.default = TimeZone(identifier: "Europe/Bucharest")!
        f = try loadFixture("calendar")
    }

    @Test func sideBySide() {
        for l in f.layouts {
            let got = CalendarGeometry.layout(l.events.map { ($0.id!, $0.start, $0.end) })
            #expect(got.map { [$0.id, "\($0.lane)", "\($0.lanes)"] } == l.placed.map { [$0.id, "\($0.lane)", "\($0.lanes)"] })
        }
    }

    @Test func visibleHours() {
        for b in f.bounds {
            let got = CalendarGeometry.timeBounds(open: f.open, close: f.close, events: b.events.map { ($0.start, $0.end) })
            #expect(got.start == b.bounds.start && got.end == b.bounds.end)
        }
    }

    @Test func weeksAndMonths() {
        for w in f.weeks {
            #expect(CalendarGeometry.weekDays(w.day) == w.week, "\(w.day)")
            #expect(CalendarGeometry.monthGrid(w.day) == w.month, "\(w.day)")
        }
    }

    @Test func minutesAndInstants() {
        for m in f.minutes {
            #expect(CalendarGeometry.atMinute(m.day, m.m) == m.at, "\(m.day) +\(m.m)")
            #expect(CalendarGeometry.minuteOfDay(m.at) == m.back)
        }
    }

    @Test func snapping() {
        #expect(CalendarGeometry.snap(7) == 0)
        #expect(CalendarGeometry.snap(8) == 15)
        #expect(CalendarGeometry.snap(-8) == -15)
        #expect(CalendarGeometry.snap(52.5) == 60)
    }
}
