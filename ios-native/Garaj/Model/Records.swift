import Foundation

/// The collections, exactly as the web app names them (src/lib/store/db.js COLLECTIONS).
enum Collection: String, CaseIterable, Codable, Sendable {
    case customers, vehicles, staff, bays, services, parts, appointments, workOrders, invoices, payments, contacts, reviews
}

/// A typed view of one stored JSON record. Missing keys are filled from `defaults`
/// before decoding; on save the typed fields are written over the stored JSON, so
/// fields the Swift model doesn't know are kept.
protocol Record: Codable, Identifiable, Hashable, Sendable where ID == String {
    static var collection: Collection { get }
    static var defaults: JSONObject { get }
}

// MARK: - People and cars

struct Customer: Record {
    static let collection = Collection.customers
    static let defaults: JSONObject = [
        "type": .string("individual"), "name": .string(""), "phone": .string(""), "email": .string(""),
        "address": .string(""), "city": .string(""), "county": .string(""), "cui": .string(""), "regCom": .string(""),
        "notes": .string(""), "contactName": .string(""), "marketingConsent": .bool(false), "createdAt": .string(""),
    ]
    var id: String
    var type: String
    var name: String
    var phone: String
    var email: String
    var address: String
    var city: String
    var county: String
    var cui: String
    var regCom: String
    var notes: String
    var contactName: String
    var marketingConsent: Bool
    var createdAt: String

    var isCompany: Bool { type == "company" }
}

struct Vehicle: Record {
    static let collection = Collection.vehicles
    static let defaults: JSONObject = [
        "customerId": .null, "plate": .string(""), "vin": .string(""), "make": .string(""), "model": .string(""),
        "engine": .string(""), "fuel": .string(""), "year": .null, "color": .string(""), "notes": .string(""), "createdAt": .string(""),
    ]
    var id: String
    var customerId: String?
    var plate: String
    var vin: String
    var make: String
    var model: String
    var engine: String
    var fuel: String
    var year: Int?
    var color: String
    var notes: String
    var createdAt: String

    var title: String { [make, model].filter { !$0.isEmpty }.joined(separator: " ") }
}

struct Staff: Record {
    static let collection = Collection.staff
    static let defaults: JSONObject = [
        "name": .string(""), "role": .string(""), "color": .string("blue"), "phone": .string(""),
        "active": .bool(true), "order": .number(0), "createdAt": .string(""),
    ]
    var id: String
    var name: String
    var role: String
    var color: String
    var phone: String
    var active: Bool
    var order: Double
    var createdAt: String
}

// MARK: - Lines, jobs, invoices

/// One line of a job or invoice (src/domain/lines.js). Money in bani.
struct Line: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var kind: String // labor · part · fee
    var refId: String?
    var description: String
    var qty: Double
    var unit: String
    var unitPrice: Int
    var discountPct: Double
    var vatRate: Double
    var cost: Int
    var staffId: String?

    /// Writes `null` for empty optionals, as the web does (Swift would leave the key out).
    func encode(to encoder: Encoder) throws {
        enum Key: String, CodingKey { case id, kind, refId, description, qty, unit, unitPrice, discountPct, vatRate, cost, staffId }
        var c = encoder.container(keyedBy: Key.self)
        try c.encode(id, forKey: .id)
        try c.encode(kind, forKey: .kind)
        try c.encode(refId, forKey: .refId)
        try c.encode(description, forKey: .description)
        try c.encode(qty, forKey: .qty)
        try c.encode(unit, forKey: .unit)
        try c.encode(unitPrice, forKey: .unitPrice)
        try c.encode(discountPct, forKey: .discountPct)
        try c.encode(vatRate, forKey: .vatRate)
        try c.encode(cost, forKey: .cost)
        try c.encode(staffId, forKey: .staffId)
    }
}

struct WorkOrder: Record {
    static let collection = Collection.workOrders
    static let defaults: JSONObject = [
        "number": .number(0), "status": .string("estimate"), "customerId": .null, "vehicleId": .null,
        "appointmentId": .null, "staffId": .null, "bayId": .null, "mileage": .null, "fuelLevel": .null,
        "complaint": .string(""), "diagnosis": .string(""), "lines": .array([]), "notes": .string(""),
        "invoiceId": .null, "createdAt": .string(""), "updatedAt": .string(""),
    ]
    var id: String
    var number: Int
    var status: String
    var customerId: String?
    var vehicleId: String?
    var appointmentId: String?
    var staffId: String?
    var bayId: String?
    var mileage: Int?
    var fuelLevel: Double?
    var complaint: String
    var diagnosis: String
    var lines: [Line]
    var notes: String
    var invoiceId: String?
    var createdAt: String
    var updatedAt: String
}

struct Invoice: Record {
    static let collection = Collection.invoices
    static let defaults: JSONObject = [
        "status": .string("draft"), "series": .string(""), "number": .null, "issueDate": .null, "dueDate": .null,
        "customerId": .null, "vehicleId": .null, "workOrderId": .null, "lines": .array([]), "notes": .string(""),
        "createdAt": .string(""), "stornoId": .null, "stornoOf": .null,
    ]
    var id: String
    var status: String
    var series: String
    var number: Int?
    var issueDate: String?
    var dueDate: String?
    var customerId: String?
    var vehicleId: String?
    var workOrderId: String?
    var lines: [Line]
    var notes: String
    var createdAt: String
    var stornoId: String?
    var stornoOf: String?
}
