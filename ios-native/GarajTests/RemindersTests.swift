import Foundation
import Testing
@testable import Garaj

/// De contactat and Catalog rules (reminders.js, inventory.js, priceFromCost) against the JS answers.
struct RemindersTests {
    struct Fixtures: Decodable {
        struct R: Decodable {
            let key, type, urgency: String; let days: Int?; let due: String?; let kmLeft: Int?; let amount: Int?
            let customerId, vehicleId, invoiceId, workOrderId, appointmentId, start: String?; let message: String
        }
        struct L: Decodable { let available: Double; let reserved: Double; let status: String }
        struct P: Decodable { let part: JSONValue; let level: L; let reserved: Double }
        struct Pr: Decodable { let cost: Int; let markup: Double; let price: Int }
        let today: String
        let settings: JSONObject
        let contacts: [JSONValue]
        let vehicles, customers, invoices, payments, workOrders, appointments: [JSONValue]
        let all: [R]
        let snoozed: [String]
        let parts: [P]
        let prices: [Pr]
    }

    let f: Fixtures

    init() throws {
        NSTimeZone.default = TimeZone(identifier: "Europe/Bucharest")!
        f = try loadFixture("reminders")
    }

    func decode<T: Record>(_ list: [JSONValue], _: T.Type) throws -> [T] { try list.map { try $0.merged(over: T.defaults).decode(T.self) } }

    func compute(contacts: [Contact]) throws -> [Reminder] {
        let customers = try decode(f.customers, Customer.self)
        return Reminders.compute(today: f.today, vehicles: try decode(f.vehicles, Vehicle.self),
                                 customers: Dictionary(uniqueKeysWithValues: customers.map { ($0.id, $0) }),
                                 invoices: try decode(f.invoices, Invoice.self),
                                 paymentsByInvoice: Dictionary(grouping: try decode(f.payments, Payment.self), by: \.invoiceId),
                                 orders: try decode(f.workOrders, WorkOrder.self), appointments: try decode(f.appointments, Appointment.self),
                                 contacts: Dictionary(uniqueKeysWithValues: contacts.map { ($0.key, $0) }))
    }

    @Test func remindersAndMessages() throws {
        let got = try compute(contacts: [])
        #expect(got.map(\.key) == f.all.map(\.key))
        let customers = Dictionary(uniqueKeysWithValues: try decode(f.customers, Customer.self).map { ($0.id, $0) })
        let vehicles = Dictionary(uniqueKeysWithValues: try decode(f.vehicles, Vehicle.self).map { ($0.id, $0) })
        let invoices = Dictionary(uniqueKeysWithValues: try decode(f.invoices, Invoice.self).map { ($0.id, $0) })
        for (g, e) in zip(got, f.all) {
            #expect(g.type == e.type && g.urgency == e.urgency && g.days == e.days && g.due == e.due && g.kmLeft == e.kmLeft && g.amount == e.amount, "\(e.key)")
            let text = Reminders.message(g, customer: customers[g.customerId ?? ""], vehicle: vehicles[g.vehicleId ?? ""], invoice: invoices[g.invoiceId ?? ""], settings: f.settings)
            #expect(text == e.message, "\(e.key)")
        }
    }

    @Test func snoozedOnesWait() throws {
        let contacts = try decode(f.contacts, Contact.self)
        #expect(try compute(contacts: contacts).map(\.key) == f.snoozed)
    }

    @Test func stockAndPrices() throws {
        let orders = try decode(f.workOrders, WorkOrder.self)
        let invoices = Dictionary(uniqueKeysWithValues: try decode(f.invoices, Invoice.self).map { ($0.id, $0) })
        let reserved = Inventory.reserved(orders: orders, invoices: invoices)
        for p in f.parts {
            let part = try p.part.merged(over: Part.defaults).decode(Part.self)
            #expect((reserved[part.id] ?? 0) == p.reserved, "\(part.name) reserved")
            let l = Inventory.level(part, reserved: p.reserved)
            #expect(l.available == p.level.available && l.status == p.level.status, "\(part.name)")
        }
        for c in f.prices { #expect(Inventory.priceFromCost(c.cost, markupPct: c.markup) == c.price, "\(c.cost) +\(c.markup)%") }
    }
}
