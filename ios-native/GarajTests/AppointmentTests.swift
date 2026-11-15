import Foundation
import Testing
@testable import Garaj

/// Toate programările's rules (appointment-list.js, search.js, appointment.js) against the JS answers.
struct AppointmentListTests {
    struct Fixtures: Decodable {
        struct R: Decodable { let status, period, staff, query, sort: String; let ids: [String]; let counts: [String: Int] }
        struct G: Decodable { let day: String; let ids: [String]; let minutes: Int }
        struct S: Decodable { let todayCount: Int; let nextId: String?; let toConfirm: Int; let noShow: Double?; let booked: Int; let capacity: Int }
        struct C: Decodable { let id: String; let ids: [String] }
        struct F: Decodable { let input: String; let fold: String; let tokens: [String] }
        struct RR: Decodable { let from: String?; let to: String? }
        struct Rg: Decodable { let period: String; let today: String; let range: RR }
        struct H: Decodable { let open: String; let close: String; let days: [Int] }
        let today, now: String
        let appointments, customers, vehicles, services: [JSONValue]
        let staffCount: Int
        let hours: H
        let results: [R]
        let groups: [G]
        let stats: S
        let conflicts: [C]
        let folds: [F]
        let ranges: [Rg]
    }

    let f: Fixtures
    let appointments: [Appointment]
    let lookups: AppointmentList.Lookups

    init() throws {
        NSTimeZone.default = TimeZone(identifier: "Europe/Bucharest")!
        f = try loadFixture("appointments")
        appointments = try f.appointments.map { try $0.merged(over: Appointment.defaults).decode(Appointment.self) }
        func index<T: Record>(_ list: [JSONValue], _: T.Type) throws -> [String: T] {
            Dictionary(uniqueKeysWithValues: try list.map { try $0.merged(over: T.defaults).decode(T.self) }.map { ($0.id, $0) })
        }
        lookups = .init(customers: try index(f.customers, Customer.self), vehicles: try index(f.vehicles, Vehicle.self), services: try index(f.services, Service.self))
    }

    @Test func foldingAndTokens() {
        for c in f.folds {
            #expect(Search.fold(c.input) == c.fold)
            #expect(Search.tokens(c.input) == c.tokens)
        }
    }

    @Test func periodRanges() {
        for c in f.ranges {
            let r = AppointmentList.range(c.period, today: c.today)
            #expect(r.from == c.range.from && r.to == c.range.to, "\(c.period) \(c.today)")
        }
    }

    @Test func listsAndCounts() {
        for c in f.results {
            let got = AppointmentList.list(appointments, status: c.status, period: c.period, staff: c.staff, tokens: Search.tokens(c.query),
                                           sort: c.sort, today: f.today, now: f.now, lookups: lookups)
            #expect(got.rows.map(\.id) == c.ids, "\(c.status) \(c.period) \(c.staff) “\(c.query)” \(c.sort)")
            #expect(got.counts == c.counts, "counts \(c.status) \(c.period)")
        }
    }

    @Test func dayGroups() {
        let rows = AppointmentList.list(appointments, status: "all", period: "all", today: f.today, now: f.now, lookups: lookups).rows
        let got = AppointmentList.groupByDay(rows)
        #expect(got.map(\.day) == f.groups.map(\.day))
        #expect(got.map { $0.items.map(\.id) } == f.groups.map(\.ids))
        #expect(got.map(\.minutes) == f.groups.map(\.minutes))
    }

    @Test func stats() {
        let s = AppointmentList.stats(appointments, today: f.today, now: f.now, staffCount: f.staffCount, open: f.hours.open, close: f.hours.close, days: f.hours.days)
        #expect(s.todayCount == f.stats.todayCount && s.nextId == f.stats.nextId && s.toConfirm == f.stats.toConfirm)
        #expect(s.booked == f.stats.booked && s.capacity == f.stats.capacity)
        #expect(abs((s.noShow ?? -1) - (f.stats.noShow ?? -1)) < 1e-9)
    }

    @Test func conflicts() {
        for c in f.conflicts {
            let a = appointments.first { $0.id == c.id }!
            #expect(AppointmentRules.conflicts(a, among: appointments).map(\.id) == c.ids, "\(c.id)")
        }
    }
}

/// Booking actions on the demo backup.
@MainActor
struct AppointmentActionTests {
    func store() async throws -> AppStore {
        let url = URL.temporaryDirectory.appending(path: "garaj-test-\(UUID().uuidString).json")
        let store = AppStore(persistence: Persistence(url: url))
        try await store.replaceAll(with: Data(contentsOf: Bundle(for: FixtureBundle.self).url(forResource: "backup", withExtension: "json")!))
        return store
    }

    @Test func createNumbersAndEditsAndCancels() async throws {
        let s = try await store()
        let v = try #require(s.all(Vehicle.self).first)
        let start = Dates.instant(Date.now.addingTimeInterval(86_400)), end = Dates.instant(Date.now.addingTimeInterval(90_000))
        #expect(throws: DomainError.self) { try s.createAppointment(.init(customerId: nil, vehicleId: v.id, start: start, end: end)) }
        #expect(throws: DomainError.self) { try s.createAppointment(.init(customerId: v.customerId, vehicleId: v.id, start: end, end: start)) }
        let (a, _) = try s.createAppointment(.init(customerId: v.customerId, vehicleId: v.id, start: start, end: end, title: "Revizie"))
        let (b, _) = try s.createAppointment(.init(customerId: v.customerId, vehicleId: v.id, start: start, end: end))
        #expect(b.number == (a.number ?? 0) + 1)
        #expect(s.all(Appointment.self).allSatisfy { $0.number != nil })

        let later = Dates.instant(Date.now.addingTimeInterval(200_000)), laterEnd = Dates.instant(Date.now.addingTimeInterval(203_600))
        try s.setAppointmentStatus(a.id, to: "confirmed")
        try s.reschedule(a.id, start: later, end: laterEnd, customerKnows: false)
        #expect(s.get(Appointment.self, a.id)?.status == "scheduled")
        let before = try s.cancelAppointment(a.id, reason: "client")
        #expect(s.get(Appointment.self, a.id)?.status == "cancelled")
        #expect(s.collections[.appointments]?[a.id]?["cancelReason"]?["code"] == .string("client"))
        s.restore(before)
        #expect(s.get(Appointment.self, a.id)?.status == "scheduled")

        let order = try s.checkIn(a.id)
        #expect(throws: DomainError.self) { try s.deleteAppointment(a.id) }
        try s.deleteWorkOrder(order.id)
        #expect(s.get(Appointment.self, a.id)?.status == "scheduled") // back to before check-in
        try s.deleteAppointment(a.id)
    }
}
