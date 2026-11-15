import Foundation
import Testing
@testable import Garaj

/// The Swift port of src/domain/invoice.js against the JS answers.
struct InvoiceTests {
    struct Fixtures: Decodable {
        struct State: Decodable { let invoice: JSONValue; let payments: [JSONValue]; let state: String; let label: String }
        struct Problem: Decodable { let code: String; let text: String }
        struct Check: Decodable { let draft: JSONValue; let customer: JSONValue?; let problems: [Problem] }
        struct Issue: Decodable {
            let draft: JSONValue; let settings: JSONObject; let customer: JSONValue?; let vehicle: JSONValue?
            let number: Int; let issued: JSONValue; let storno: JSONValue
        }
        struct Pay: Decodable { let amount: Int; let problem: String? }
        struct Message: Decodable { let invoice: JSONValue; let balance: Int; let settings: JSONObject; let text: String }
        let today: String
        let states: [State]
        let checklists: [Check]
        let issues: [Issue]
        let payments: [Pay]
        let messages: [Message]
    }

    let f: Fixtures = try! loadFixture("invoices")

    func invoice(_ v: JSONValue) throws -> Invoice { try v.merged(over: Invoice.defaults).decode(Invoice.self) }
    func customer(_ v: JSONValue?) throws -> Customer? { try v.map { try $0.merged(over: Customer.defaults).decode(Customer.self) } }

    @Test func statesAndNumbers() throws {
        for s in f.states {
            let inv = try invoice(s.invoice)
            let pays = try s.payments.map { try $0.merged(over: Payment.defaults).decode(Payment.self) }
            #expect(InvoiceRules.state(inv, payments: pays, today: f.today) == s.state, "\(s.label)")
            #expect(inv.label == s.label)
        }
    }

    @Test func whatBlocksIssuing() throws {
        for c in f.checklists {
            let got = InvoiceRules.checklist(try invoice(c.draft), customer: try customer(c.customer))
            #expect(got.map(\.code) == c.problems.map(\.code))
            #expect(got.map(\.text) == c.problems.map(\.text))
        }
    }

    @Test func issuingAndStorno() throws {
        for i in f.issues {
            let draft = try invoice(i.draft)
            let expected = try invoice(i.issued)
            let got = try InvoiceRules.issue(draft, settings: i.settings, customer: try customer(i.customer),
                                             customerJSON: i.customer?.object, vehicleJSON: i.vehicle?.object,
                                             number: i.number, now: "2026-11-15T10:00:00.000Z")
            #expect(got.status == "issued")
            #expect(got.number == expected.number)
            #expect(got.lines == expected.lines)
            #expect(got.totals == expected.totals)
            #expect(got.snapshot == i.issued["snapshot"], "snapshot")
            #expect(got.issuedAt == expected.issuedAt)
            #expect(got.activity == expected.activity)

            let s = try InvoiceRules.storno(got, number: i.storno["number"]?.number.map { Int($0) } ?? 0, today: f.today, now: "2026-11-15T10:00:00.000Z")
            let es = try invoice(i.storno)
            #expect(s.totals == es.totals)
            #expect(s.notes == es.notes)
            #expect(s.lines.map(\.qty) == es.lines.map(\.qty))
            #expect(s.stornoOf == got.id)
            #expect(s.snapshot == got.snapshot)
            #expect(s.issueDate == es.issueDate && s.dueDate == es.dueDate)
        }
    }

    @Test func payments() throws {
        let inv = try invoice(f.issues[0].issued)
        let paid = [Payment(id: "p", invoiceId: inv.id, amount: 100, method: "cash", date: f.today, note: "", createdAt: "")]
        for p in f.payments {
            #expect(InvoiceRules.paymentProblem(p.amount, invoice: inv, payments: paid) == p.problem, "amount \(p.amount)")
        }
    }

    @Test func shareMessage() throws {
        for m in f.messages {
            #expect(InvoiceRules.message(try invoice(m.invoice), balance: m.balance, settings: m.settings) == m.text)
        }
    }
}

/// The invoice actions on the demo backup: numbers, stock, the job's link.
@MainActor
struct InvoiceActionTests {
    func store() async throws -> AppStore {
        let url = URL.temporaryDirectory.appending(path: "garaj-test-\(UUID().uuidString).json")
        let store = AppStore(persistence: Persistence(url: url))
        try await store.replaceAll(with: Data(contentsOf: Bundle(for: FixtureBundle.self).url(forResource: "backup", withExtension: "json")!))
        return store
    }

    @Test func fromJobToPaidAndStorno() async throws {
        let s = try await store()
        let vehicle = try #require(s.all(Vehicle.self).first)
        let (order, _) = try s.createWorkOrder(customerId: vehicle.customerId, vehicleId: vehicle.id)
        var withLine = order
        let part = try #require(s.all(Part.self).first)
        withLine.lines = [try #require(s.lineFromPart(part.id, qty: 2)), s.blankLine("labor")]
        withLine.lines[1].description = "Manoperă"
        try s.updateWorkOrder(withLine)

        let draft = try s.invoiceForWorkOrder(order.id)
        #expect(s.get(WorkOrder.self, order.id)?.invoiceId == draft.id)
        #expect(try s.invoiceForWorkOrder(order.id).id == draft.id) // the same draft again

        let series = s.shop.series
        let next = Int(s.meta["counters"]?["invoices"]?[series]?.number ?? Double(s.shop.startNumber))
        let issued = try s.issueInvoiceDraft(draft.id)
        #expect(issued.number == next)
        #expect(Int(s.meta["counters"]?["invoices"]?[series]?.number ?? 0) == next + 1)
        #expect(s.get(Part.self, part.id)?.stock == part.stock - 2)
        #expect(s.invoiceState(issued) == "issued")

        let gross = try #require(issued.totals?.gross)
        #expect(throws: DomainError.self) { try s.recordPayment(issued.id, amount: gross + 1) }
        try s.recordPayment(issued.id, amount: 100)
        #expect(s.invoiceState(issued) == "partial")
        try s.recordPayment(issued.id, amount: gross - 100, method: "card")
        #expect(s.invoiceState(issued) == "paid")

        let (storno, refund) = try s.stornoInvoice(issued.id)
        #expect(refund == gross)
        #expect(storno.totals?.gross == -gross)
        #expect(s.get(Invoice.self, issued.id)?.status == "cancelled")
        #expect(s.get(Part.self, part.id)?.stock == part.stock)
        #expect(s.get(WorkOrder.self, order.id)?.invoiceId == nil)
        #expect(throws: DomainError.self) { try s.stornoInvoice(issued.id) }

        let redo = try s.redoInvoice(issued.id)
        #expect(redo.status == "draft")
        #expect(s.get(WorkOrder.self, order.id)?.invoiceId == redo.id)
    }

    @Test func theDocumentRendersAsPDF() async throws {
        let s = try await store()
        let issued = try #require(s.all(Invoice.self).first { $0.status == "issued" && $0.snapshot != nil })
        let paper = InvoicePaper(invoice: issued, snapshot: issued.snapshot!, totals: s.totals(of: issued), currency: s.currency)
        let url = try InvoicePDF.render(paper, name: "test-\(UUID().uuidString)")
        let data = try Data(contentsOf: url)
        #expect(data.prefix(4) == Data("%PDF".utf8))
        #expect(data.count > 5_000)
    }

    @Test func aDraftThatCannotBeIssuedKeepsTheNumber() async throws {
        let s = try await store()
        let draft = s.createInvoiceDraft()
        let before = s.meta["counters"]
        #expect(throws: DomainError.self) { try s.issueInvoiceDraft(draft.id) }
        #expect(s.meta["counters"] == before)
        try s.deleteInvoiceDraft(draft.id)
        #expect(s.get(Invoice.self, draft.id) == nil)
    }
}
