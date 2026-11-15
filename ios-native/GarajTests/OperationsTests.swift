import Foundation
import Testing
@testable import Garaj

/// Booking / job operations (src/domain/lines.js) against the JS answers.
struct OperationsTests {
    struct Fixtures: Decodable {
        struct Op: Decodable { let serviceId: String?; let name: String; let hours: Double; let price: Int; let cost: Int }
        struct Fig: Decodable { let id: String; let rate: Double; let net, vat, gross, cost, margin: Int; let marginPct: Double }
        struct Rate: Decodable { let id: String; let vatPayer: Bool; let rate: Double }
        struct Est: Decodable { let vatPayer: Bool; let minutes: Int; let gross: Int }
        let laborRate: Int
        let services: [JSONValue]
        let fromService: [Op]
        let ops: [JSONValue]
        let figures: [Fig]
        let vatRates: [Rate]
        let estimate: [Est]
    }

    let f: Fixtures
    init() throws { f = try loadFixture("operations") }

    @Test func fromCatalog() throws {
        for (raw, want) in zip(f.services, f.fromService) {
            let s = try raw.merged(over: Service.defaults).decode(Service.self)
            let op = Operations.fromService(s, laborRate: f.laborRate)
            #expect(op.serviceId == want.serviceId && op.name == want.name && op.hours == want.hours && op.price == want.price && op.cost == want.cost, "\(want.name)")
        }
    }

    @Test func figuresRatesEstimate() {
        let ops = f.ops.compactMap(\.object).map(Operation.init)
        let byId = Dictionary(uniqueKeysWithValues: ops.map { ($0.id, $0) })
        for w in f.figures {
            let g = Operations.figures(byId[w.id]!, vatRate: w.rate)
            #expect(g.net == w.net && g.vat == w.vat && g.gross == w.gross && g.cost == w.cost && g.margin == w.margin && g.marginPct == w.marginPct, "\(w.id) \(w.rate)")
        }
        for w in f.vatRates { #expect(Operations.vatRate(byId[w.id]!, vatPayer: w.vatPayer, shopRate: 21) == w.rate, "\(w.id)") }
        for w in f.estimate {
            let e = Operations.estimate(ops, vatPayer: w.vatPayer, vatRate: 21)
            #expect(e.minutes == w.minutes && e.gross == w.gross)
        }
    }

    @Test func roundTripKeepsUnknownFields() {
        var o: JSONObject = ["id": .string("a"), "name": .string("X"), "hours": .number(1), "price": .number(100), "cost": .number(0), "webOnly": .string("keep")]
        o["serviceId"] = .null
        let back = Operation(o).json
        #expect(back["webOnly"] == .string("keep") && back["qty"] == nil && back["name"] == .string("X"))
    }
}
