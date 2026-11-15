import Foundation
import Testing
@testable import Garaj

/// Clienți and Mașini rules (customer.js, vehicle.js) against the JS answers.
struct PeopleTests {
    struct Fixtures: Decodable {
        struct OK: Decodable { let input: String; let ok: Bool }
        struct IB: Decodable { let input: String; let ok: Bool; let formatted: String }
        struct In: Decodable { let input: String; let output: String }
        struct Vin: Decodable { let input: String; let issue: String? }
        struct DD: Decodable { let status: String; let days: Int? }
        struct D: Decodable { let date: String?; let d: DD }
        struct SD: Decodable { let status: String; let dueDate: String?; let days: Int?; let dueKm: Int?; let estKm: Int?; let kmLeft: Int? }
        struct V: Decodable { let vehicle: JSONValue; let service: SD; let est: Int?; let perDay: Double? }
        struct FF: Decodable { let visits: Int; let lastVisit: String?; let noShows: Int }
        struct F: Decodable { let id: String; let facts: FF }
        let today: String
        let cui: [OK]
        let iban: [IB]
        let email: [OK]
        let initials: [In]
        let vin: [Vin]
        let deadlines: [D]
        let vehicles: [V]
        let facts: [F]
        let appointments: [JSONValue]
        let workOrders: [JSONValue]
    }

    let f: Fixtures = try! loadFixture("people")

    @Test func checks() {
        for c in f.cui { #expect(People.isValidCUI(c.input) == c.ok, "CUI \(c.input)") }
        for c in f.iban {
            #expect(People.isValidIBAN(c.input) == c.ok, "IBAN \(c.input)")
            #expect(People.formatIBAN(c.input) == c.formatted)
        }
        for c in f.email { #expect(People.isValidEmail(c.input) == c.ok, "email \(c.input)") }
        for c in f.initials { #expect(People.initials(c.input) == c.output, "initials \(c.input)") }
        for c in f.vin { #expect(People.vinIssue(c.input) == c.issue, "VIN \(c.input)") }
    }

    @Test func deadlines() {
        for c in f.deadlines {
            let d = People.deadline(c.date, today: f.today)
            #expect(d.status == c.d.status && d.days == c.d.days, "\(String(describing: c.date))")
        }
    }

    @Test func serviceDueAndKm() throws {
        for c in f.vehicles {
            let v = try c.vehicle.merged(over: Vehicle.defaults).decode(Vehicle.self)
            let s = People.serviceDue(v, today: f.today)
            #expect(s.status == c.service.status && s.dueDate == c.service.dueDate && s.days == c.service.days, "\(v.plate) status")
            #expect(s.dueKm == c.service.dueKm && s.estKm == c.service.estKm && s.kmLeft == c.service.kmLeft, "\(v.plate) km")
            #expect(People.estimateKm(v, today: f.today) == c.est)
            #expect(People.kmPerDay(v.mileage) == c.perDay)
        }
    }

    @Test func customerFacts() throws {
        let apps = try f.appointments.map { try $0.merged(over: Appointment.defaults).decode(Appointment.self) }
        let orders = try f.workOrders.map { try $0.merged(over: WorkOrder.defaults).decode(WorkOrder.self) }
        for c in f.facts {
            let got = People.facts(c.id, appointments: apps, orders: orders)
            #expect(got.visits == c.facts.visits && got.lastVisit == c.facts.lastVisit && got.noShows == c.facts.noShows, "\(c.id)")
        }
    }
}
