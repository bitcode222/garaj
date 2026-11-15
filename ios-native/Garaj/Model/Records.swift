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
        "mileage": .array([]), "itpExpiry": .null, "rcaExpiry": .null, "serviceIntervalKm": .null, "serviceIntervalMonths": .null,
        "lastServiceDate": .null, "lastServiceKm": .null,
    ]
    struct Reading: Codable, Hashable, Sendable {
        var date: String
        var km: Int
        var source: String?

        init(date: String, km: Int, source: String?) { self.date = date; self.km = km; self.source = source }

        /// A km typed with a fraction somewhere still reads (rounded) instead of dropping the car.
        init(from decoder: Decoder) throws {
            enum K: String, CodingKey { case date, km, source }
            let c = try decoder.container(keyedBy: K.self)
            date = (try? c.decode(String.self, forKey: .date)) ?? ""
            km = Int(Money.jsRound((try? c.decode(Double.self, forKey: .km)) ?? 0))
            source = try? c.decodeIfPresent(String.self, forKey: .source)
        }
    }
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
    var mileage: [Reading]
    var itpExpiry: String?
    var rcaExpiry: String?
    var serviceIntervalKm: Int?
    var serviceIntervalMonths: Int?
    var lastServiceDate: String?
    var lastServiceKm: Int?

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
/// Fields this model doesn't know (e.g. `need`, `refused` from docs/LUCRARE.md) are kept in `extra`.
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
    var extra: JSONObject = [:]

    private enum Key: String, CodingKey, CaseIterable {
        case id, kind, refId, description, qty, unit, unitPrice, discountPct, vatRate, cost, staffId
    }

    init(id: String, kind: String, refId: String? = nil, description: String, qty: Double, unit: String,
         unitPrice: Int, discountPct: Double = 0, vatRate: Double, cost: Int = 0, staffId: String? = nil) {
        self.id = id; self.kind = kind; self.refId = refId; self.description = description; self.qty = qty
        self.unit = unit; self.unitPrice = unitPrice; self.discountPct = discountPct; self.vatRate = vatRate
        self.cost = cost; self.staffId = staffId
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        id = try c.decode(String.self, forKey: .id)
        kind = try c.decodeIfPresent(String.self, forKey: .kind) ?? "labor"
        refId = try c.decodeIfPresent(String.self, forKey: .refId)
        description = try c.decodeIfPresent(String.self, forKey: .description) ?? ""
        qty = try c.decodeIfPresent(Double.self, forKey: .qty) ?? 0
        unit = try c.decodeIfPresent(String.self, forKey: .unit) ?? ""
        unitPrice = Int(try c.decodeIfPresent(Double.self, forKey: .unitPrice) ?? 0)
        discountPct = try c.decodeIfPresent(Double.self, forKey: .discountPct) ?? 0
        vatRate = try c.decodeIfPresent(Double.self, forKey: .vatRate) ?? 0
        cost = Int(try c.decodeIfPresent(Double.self, forKey: .cost) ?? 0)
        staffId = try c.decodeIfPresent(String.self, forKey: .staffId)
        let all = try decoder.singleValueContainer().decode(JSONObject.self)
        let known = Set(Key.allCases.map(\.rawValue))
        extra = all.filter { !known.contains($0.key) }
    }

    /// Writes `null` for empty optionals, as the web does, and the unknown fields back.
    func encode(to encoder: Encoder) throws {
        var all = extra
        all["id"] = .string(id)
        all["kind"] = .string(kind)
        all["refId"] = refId.map(JSONValue.string) ?? .null
        all["description"] = .string(description)
        all["qty"] = .number(qty)
        all["unit"] = .string(unit)
        all["unitPrice"] = .number(Double(unitPrice))
        all["discountPct"] = .number(discountPct)
        all["vatRate"] = .number(vatRate)
        all["cost"] = .number(Double(cost))
        all["staffId"] = staffId.map(JSONValue.string) ?? .null
        var c = encoder.singleValueContainer()
        try c.encode(all)
    }

    /// The client said no to this line at approval (docs/LUCRARE.md); it is never billed.
    var refused: Bool { extra["refused"] == .bool(true) }
}

struct WorkOrder: Record {
    static let collection = Collection.workOrders
    static let defaults: JSONObject = [
        "number": .number(0), "status": .string("estimate"), "customerId": .null, "vehicleId": .null,
        "appointmentId": .null, "staffId": .null, "bayId": .null, "mileage": .null, "fuelLevel": .null,
        "complaint": .string(""), "diagnosis": .string(""), "lines": .array([]), "notes": .string(""),
        "invoiceId": .null, "createdAt": .string(""), "updatedAt": .string(""),
        "dates": .object([:]), "activity": .array([]), "inspection": .array([]),
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
    var dates: JSONObject
    var activity: [JSONValue]
    var inspection: [JSONValue]
}

struct Invoice: Record {
    static let collection = Collection.invoices
    static let defaults: JSONObject = [
        "status": .string("draft"), "series": .string(""), "number": .null, "issueDate": .null, "dueDate": .null,
        "customerId": .null, "vehicleId": .null, "workOrderId": .null, "lines": .array([]), "notes": .string(""),
        "createdAt": .string(""), "stornoId": .null, "stornoOf": .null, "mileage": .null, "activity": .array([]),
    ]
    // totals, snapshot, issuedAt: only on issued invoices, so they are left out of the defaults (a draft never gets them as null).
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
    var mileage: Int? = nil
    /// Frozen when issued; drafts compute theirs.
    var totals: Totals? = nil
    /// Seller, buyer and car as they were when issued.
    var snapshot: JSONValue? = nil
    var issuedAt: String? = nil
    var activity: [JSONValue] = []

    var label: String { InvoiceRules.formatNumber(series: series, number: number) }
}

struct Payment: Record {
    static let collection = Collection.payments
    static let defaults: JSONObject = ["invoiceId": .string(""), "amount": .number(0), "method": .string("cash"), "date": .string(""), "note": .string(""), "createdAt": .string("")]
    var id: String
    var invoiceId: String
    var amount: Int
    var method: String
    var date: String
    var note: String
    var createdAt: String
}

// MARK: - Catalog and bookings

struct Service: Record {
    static let collection = Collection.services
    static let defaults: JSONObject = ["name": .string(""), "category": .string(""), "hours": .number(1), "price": .number(0), "cost": .number(0), "parts": .array([])]
    var id: String
    var name: String
    var category: String
    var hours: Double
    var price: Int
    var cost: Int
    var parts: [JSONValue]
}

struct Part: Record {
    static let collection = Collection.parts
    static let defaults: JSONObject = [
        "code": .string(""), "name": .string(""), "brand": .string(""), "unit": .string("buc"),
        "cost": .number(0), "price": .number(0), "stock": .number(0), "minStock": .number(0), "location": .string(""),
    ]
    var id: String
    var code: String
    var name: String
    var brand: String
    var unit: String
    var cost: Int
    var price: Int
    var stock: Double
    var minStock: Double
    var location: String
}

struct Appointment: Record {
    static let collection = Collection.appointments
    static let defaults: JSONObject = [
        "start": .string(""), "end": .string(""), "customerId": .null, "vehicleId": .null, "title": .string(""),
        "status": .string("scheduled"), "workOrderId": .null, "staffId": .null, "bayId": .null, "activity": .array([]),
        "expectedAt": .null, "notes": .string(""), "serviceIds": .array([]), "createdAt": .string(""),
    ]
    // `operations` (edited services, newer bookings) is only there when the web wrote it.
    var id: String
    var start: String
    var end: String
    var customerId: String?
    var vehicleId: String?
    var title: String
    var status: String
    var workOrderId: String?
    var staffId: String?
    var bayId: String?
    var activity: [JSONValue]
    var expectedAt: String?
    var notes: String
    var serviceIds: [String]
    var createdAt: String
    var number: Int? = nil
    var operations: [JSONValue]? = nil
    var cancelReason: JSONValue? = nil

    var isActive: Bool { status != "cancelled" && status != "no_show" }
}

struct Bay: Record {
    static let collection = Collection.bays
    static let defaults: JSONObject = ["name": .string(""), "kind": .string(""), "active": .bool(true), "order": .number(0)]
    var id: String
    var name: String
    var kind: String
    var active: Bool
    var order: Double
}
