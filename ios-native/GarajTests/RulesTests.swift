import Foundation
import Testing
@testable import Garaj

/// Lines, the job's flow, plates, phones and messages: the Swift port against the JS answers.
struct RulesTests {
    struct LineFixtures: Decodable {
        struct Doc: Decodable { let vatPayer: Bool; let lines: [Line]; let totals: Totals; let net: [Int]; let gross: [Int] }
        let documents: [Doc]
    }

    struct RuleFixtures: Decodable {
        struct Move: Decodable { let from: String; let to: String; let can: Bool; let skipped: [String]; let backward: Bool }
        struct Plate: Decodable { let input: String; let output: String; let normalized: String }
        struct Phone: Decodable { let input: String; let normalized: String; let formatted: String }
        struct Greeting: Decodable { let customer: JSONValue; let output: String }
        struct Message: Decodable { let order: JSONValue; let customer: JSONValue?; let vehicle: JSONValue?; let estimate: String; let ready: String }
        let moves: [Move]
        let plates: [Plate]
        let phones: [Phone]
        let greetings: [Greeting]
        let messages: [Message]
        let settings: JSONObject
    }

    let lines: LineFixtures = try! loadFixture("lines")
    let rules: RuleFixtures = try! loadFixture("rules")

    @Test func lineAmountsAndTotals() {
        for (i, doc) in lines.documents.enumerated() {
            #expect(doc.lines.map(Lines.net) == doc.net, "net, document \(i)")
            #expect(doc.lines.map { Lines.gross($0, vatPayer: doc.vatPayer) } == doc.gross, "gross, document \(i)")
            #expect(Lines.totals(doc.lines, vatPayer: doc.vatPayer) == doc.totals, "totals, document \(i)")
        }
    }

    @Test func jobFlow() {
        for m in rules.moves {
            #expect(WorkOrderRules.canTransition(m.from, m.to) == m.can, "\(m.from) → \(m.to)")
            #expect(WorkOrderRules.skipped(m.from, m.to) == m.skipped, "skipped \(m.from) → \(m.to)")
            #expect(WorkOrderRules.isBackward(m.from, m.to) == m.backward, "backward \(m.from) → \(m.to)")
        }
    }

    @Test func platesAndPhones() {
        for p in rules.plates {
            #expect(People.formatPlate(p.input) == p.output, "formatPlate(\(p.input))")
            #expect(People.normalizePlate(p.input) == p.normalized)
        }
        for p in rules.phones {
            #expect(People.normalizePhone(p.input) == p.normalized, "normalizePhone(\(p.input))")
            #expect(People.formatPhone(p.input) == p.formatted, "formatPhone(\(p.input))")
        }
    }

    @Test func greetings() throws {
        for g in rules.greetings {
            let c = try g.customer.merged(over: Customer.defaults).decode(Customer.self)
            #expect(People.greetingName(c) == g.output)
        }
    }

    @Test func messages() throws {
        let settings = ShopSettings(rules.settings)
        for m in rules.messages {
            let order = try m.order.merged(over: WorkOrder.defaults).decode(WorkOrder.self)
            let customer = try m.customer.map { try $0.merged(over: Customer.defaults).decode(Customer.self) }
            let vehicle = try m.vehicle.map { try $0.merged(over: Vehicle.defaults).decode(Vehicle.self) }
            #expect(WorkOrderRules.estimateMessage(order: order, customer: customer, vehicle: vehicle, settings: settings) == m.estimate)
            #expect(WorkOrderRules.readyMessage(customer: customer, vehicle: vehicle, settings: settings) == m.ready)
        }
    }
}
