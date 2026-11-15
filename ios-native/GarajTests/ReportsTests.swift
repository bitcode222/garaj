import Foundation
import Testing
@testable import Garaj

/// Rapoarte's rules (src/domain/reports.js) against the JS answers.
struct ReportsTests {
    struct Fixtures: Decodable {
        struct MonthRange: Decodable { let count: Int; let months: [String] }
        struct Row: Decodable { let month: String; let labor, parts, fees, net, count: Int }
        struct Summary: Decodable {
            let net, gross, labor, parts, partsCost, count, avgTicket, partsMargin: Int
            let hours, partsMarginPct: Double
        }
        struct Top: Decodable { let key, name: String; let count, revenue: Int }
        struct Staff: Decodable { let staffId: String; let hours: Double; let revenue: Int }
        struct Period: Decodable { let period, from, to: String; let summary: Summary; let top: [Top]; let staff: [Staff]; let mix: [String: Int] }
        struct Aging: Decodable { let current, d30, d60, d90, total: Int }
        let today: String
        let invoices: [JSONValue]
        let payments: [JSONValue]
        let monthRanges: [MonthRange]
        let byMonth: [Row]
        let byDay: [Row]
        let periods: [Period]
        let aging: Aging
    }

    let f: Fixtures
    let invoices: [Invoice]
    let payments: [Payment]

    init() throws {
        NSTimeZone.default = TimeZone(identifier: "Europe/Bucharest")!
        f = try loadFixture("reports")
        invoices = try f.invoices.map { try $0.merged(over: Invoice.defaults).decode(Invoice.self) }
        payments = try f.payments.map { try $0.merged(over: Payment.defaults).decode(Payment.self) }
    }

    private func same(_ rows: [Reports.Row], _ expected: [Fixtures.Row]) {
        #expect(rows.count == expected.count)
        for (a, b) in zip(rows, expected) {
            #expect(a.month == b.month && a.labor == b.labor && a.parts == b.parts && a.fees == b.fees && a.net == b.net && a.count == b.count, "\(b.month)")
        }
    }

    @Test func monthRanges() {
        for r in f.monthRanges { #expect(Reports.monthRange(today: f.today, count: r.count) == r.months) }
    }

    @Test func revenueRows() {
        same(Reports.revenueByMonth(invoices, months: Reports.monthRange(today: f.today, count: 12)), f.byMonth)
        same(Reports.revenueByDay(invoices, days: f.byDay.map(\.month)), f.byDay)
        #expect(f.byMonth.contains { $0.net != 0 })
    }

    @Test func periods() {
        for p in f.periods {
            let r = Reports.periodRange(p.period, today: f.today)
            #expect(r.from == p.from && r.to == p.to, "\(p.period)")
            let s = Reports.summarize(invoices, from: p.from, to: p.to), e = p.summary
            #expect(s.net == e.net && s.gross == e.gross && s.labor == e.labor && s.parts == e.parts && s.partsCost == e.partsCost, "\(p.period)")
            #expect(s.count == e.count && s.avgTicket == e.avgTicket && s.partsMargin == e.partsMargin, "\(p.period)")
            #expect(abs(s.hours - e.hours) < 1e-9 && abs(s.partsMarginPct - e.partsMarginPct) < 1e-9, "\(p.period)")

            let top = Reports.topServices(invoices, from: p.from, to: p.to, limit: 6)
            #expect(top.map(\.key) == p.top.map(\.key), "\(p.period)")
            #expect(top.map(\.name) == p.top.map(\.name) && top.map(\.count) == p.top.map(\.count) && top.map(\.revenue) == p.top.map(\.revenue))

            let staff = Reports.staffProductivity(invoices, from: p.from, to: p.to)
            #expect(staff.map(\.staffId) == p.staff.map(\.staffId) && staff.map(\.revenue) == p.staff.map(\.revenue), "\(p.period)")
            for (a, b) in zip(staff, p.staff) { #expect(abs(a.hours - b.hours) < 1e-9) }

            #expect(Reports.paymentMix(payments, from: p.from, to: p.to) == p.mix, "\(p.period)")
        }
    }

    @Test func aging() {
        let a = Reports.receivablesAging(invoices, paymentsByInvoice: Dictionary(grouping: payments, by: \.invoiceId), today: f.today)
        #expect(a.current == f.aging.current && a.d30 == f.aging.d30 && a.d60 == f.aging.d60 && a.d90 == f.aging.d90 && a.total == f.aging.total)
    }
}
