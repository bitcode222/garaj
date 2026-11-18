import Foundation
import Testing
@testable import Garaj

/// Azi's rules (src/domain/agenda.js, analytics.js) against the JS answers, in Bucharest time.
struct HomeTests {
    struct Fixtures: Decodable {
        struct Group: Decodable { let key: String; let ids: [String] }
        struct Bookings: Decodable { let groups: [Group]; let total: Int; let week: [String: Int] }
        struct CItem: Decodable { let id: String; let balance: Int; let paid: Int; let overdueDays: Int; let dueIn: Int? }
        struct CGroup: Decodable { let key: String; let amount: Int; let items: [CItem] }
        struct Collect: Decodable { let groups: [CGroup]; let total: Int; let due: Int; let drafts: Int }
        struct Job: Decodable { let key: String; let ids: [String]; let amount: Int }
        struct Passed: Decodable { let id: String; let passed: Bool }
        struct Change: Decodable { let pct: Double; let points: Bool; let direction: String; let good: Bool? }
        struct Metric: Decodable { let value: Double?; let points: [Double?]; let empty: Bool; let change: Change? }
        struct Window: Decodable { let unit: String; let keys: [String]; let from: String; let to: String }
        struct Period: Decodable { let period: String; let window: Window; let collected, received, ticket, show, stay, hours: Metric }
        let today: String
        let now: String
        let appointments: [JSONValue]
        let workOrders: [JSONValue]
        let invoices: [JSONValue]
        let payments: [JSONValue]
        let bookings: Bookings
        let collect: Collect
        let jobs: [Job]
        let passed: [Passed]
        let analytics: [Period]
        struct Share: Decodable { let count: Int; let amount: Int; let ids: [String] }
        struct Takings: Decodable { let total: Int; let count: Int; let methods: [Analytics.MethodAmount]; let previous: Int; let change: Change? }
        struct Still: Decodable { let cars: Share; let invoices: Share; let total: Int }
        struct Month: Decodable { let value: Int; let points: [Int]; let days: Int; let previousPoints: [Int]; let previousToDate: Int; let previousTotal: Int; let change: Change? }
        struct Money: Decodable { let today: String; let takings: Takings; let still: Still; let month: Month }
        let money: [Money]
    }

    let f: Fixtures
    let appointments: [Appointment]
    let orders: [WorkOrder]
    let invoices: [Invoice]
    let payments: [Payment]

    init() throws {
        NSTimeZone.default = TimeZone(identifier: "Europe/Bucharest")!
        f = try loadFixture("home")
        appointments = try f.appointments.map { try $0.merged(over: Appointment.defaults).decode(Appointment.self) }
        orders = try f.workOrders.map { try $0.merged(over: WorkOrder.defaults).decode(WorkOrder.self) }
        invoices = try f.invoices.map { try $0.merged(over: Invoice.defaults).decode(Invoice.self) }
        payments = try f.payments.map { try $0.merged(over: Payment.defaults).decode(Payment.self) }
    }

    @Test func passedBookings() {
        for p in f.passed {
            let a = appointments.first { $0.id == p.id }!
            #expect(Agenda.bookingPassed(a, now: f.now) == p.passed, "\(p.id)")
        }
    }

    @Test func bookingsToConfirm() {
        let got = Agenda.bookingsToConfirm(appointments, now: f.now)
        #expect(got.groups.map(\.key) == f.bookings.groups.map(\.key))
        #expect(got.groups.map { $0.items.map(\.id) } == f.bookings.groups.map(\.ids))
        #expect(got.total == f.bookings.total)
        #expect(got.week == f.bookings.week)
    }

    @Test func invoicesToCollect() {
        let got = Agenda.invoicesToCollect(invoices, paymentsByInvoice: Dictionary(grouping: payments, by: \.invoiceId), today: f.today, vatPayer: true)
        #expect(got.groups.map(\.key) == f.collect.groups.map(\.key))
        for (g, e) in zip(got.groups, f.collect.groups) {
            #expect(g.amount == e.amount, "\(g.key)")
            #expect(g.items.map(\.invoice.id) == e.items.map(\.id), "\(g.key) order")
            #expect(g.items.map(\.balance) == e.items.map(\.balance))
            #expect(g.items.map(\.overdueDays) == e.items.map(\.overdueDays))
            #expect(g.items.map(\.dueIn) == e.items.map(\.dueIn))
        }
        #expect(got.due == f.collect.due && got.drafts == f.collect.drafts && got.total == f.collect.total)
    }

    @Test func carsInTheShop() {
        let got = Agenda.jobsToShow(orders, vatPayer: true)
        #expect(got.map(\.key) == f.jobs.map(\.key))
        #expect(got.map { $0.items.map(\.id) } == f.jobs.map(\.ids))
        #expect(got.map(\.amount) == f.jobs.map(\.amount))
    }

    private func same(_ a: Double?, _ b: Double?) -> Bool {
        switch (a, b) {
        case (nil, nil): true
        case let (x?, y?): abs(x - y) < 1e-6 * max(1, abs(y))
        default: false
        }
    }

    private func check(_ got: Analytics.Metric, _ e: Fixtures.Metric, _ name: String) {
        #expect(same(got.value, e.value), "\(name) value \(String(describing: got.value)) vs \(String(describing: e.value))")
        #expect(got.points.count == e.points.count)
        #expect(zip(got.points, e.points).allSatisfy { same($0, $1) }, "\(name) points")
        #expect(got.empty == e.empty, "\(name) empty")
        #expect((got.change == nil) == (e.change == nil), "\(name) change")
        if let g = got.change, let c = e.change {
            #expect(same(g.pct, c.pct) && g.direction == c.direction && g.good == c.good && g.points == c.points, "\(name) change")
        }
    }

    @Test func analytics() {
        for p in f.analytics {
            let h = Analytics.home(payments: payments, orders: orders, invoices: invoices, appointments: appointments, today: f.today, period: p.period)
            #expect(h.window.keys == p.window.keys && h.window.from == p.window.from && h.window.to == p.window.to && h.window.unit == p.window.unit, "\(p.period) window")
            check(h.collected, p.collected, "\(p.period) collected")
            check(h.received, p.received, "\(p.period) received")
            check(h.ticket, p.ticket, "\(p.period) ticket")
            check(h.show, p.show, "\(p.period) show")
            check(h.stay, p.stay, "\(p.period) stay")
            check(h.hours, p.hours, "\(p.period) hours")
        }
    }

    @Test func aziMoney() {
        let byInvoice = Dictionary(grouping: payments, by: \.invoiceId)
        for m in f.money {
            let t = Analytics.takingsToday(payments, today: m.today)
            #expect(t.total == m.takings.total && t.count == m.takings.count && t.previous == m.takings.previous, "\(m.today) takings")
            #expect(t.methods == m.takings.methods, "\(m.today) methods")
            #expect((t.change == nil) == (m.takings.change == nil), "\(m.today) takings change")
            if let g = t.change, let c = m.takings.change { #expect(same(g.pct, c.pct) && g.direction == c.direction) }
            let s = Analytics.stillToCollectToday(orders: orders, invoices: invoices, paymentsByInvoice: byInvoice, today: m.today, vatPayer: true)
            #expect(s.cars.ids == m.still.cars.ids && s.cars.amount == m.still.cars.amount, "\(m.today) cars")
            #expect(s.invoices.ids == m.still.invoices.ids && s.invoices.amount == m.still.invoices.amount, "\(m.today) invoices")
            #expect(s.total == m.still.total)
            let mo = Analytics.monthToDate(payments, today: m.today)
            #expect(mo.points == m.month.points && mo.previousPoints == m.month.previousPoints && mo.days == m.month.days, "\(m.today) month")
            #expect(mo.previousToDate == m.month.previousToDate && mo.previousTotal == m.month.previousTotal)
            #expect((mo.change == nil) == (m.month.change == nil))
            if let g = mo.change, let c = m.month.change { #expect(same(g.pct, c.pct) && g.direction == c.direction) }
        }
    }
}
