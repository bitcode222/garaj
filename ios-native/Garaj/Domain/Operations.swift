import Foundation

// Port of the operation rules of src/domain/lines.js (operationFromService, operationFigures,
// operationVatRate, operationsEstimate). An operation is a piece of work on a booking or a job form:
// { id, serviceId?, name, hours, price (net, bani), cost, vatRate? }. The phone may add `qty`, `unit`
// and `category`; the web keeps what it does not know.

struct Operation: Identifiable, Hashable, Sendable {
    var id: String
    var serviceId: String?
    var name: String
    var hours: Double
    var price: Int
    var cost: Int
    var vatRate: Double?
    var qty: Double = 1
    var unit: String = "buc"
    var category: String?
    /// Fields written by the web that the phone does not edit.
    var extra: JSONObject = [:]

    init(id: String, serviceId: String? = nil, name: String, hours: Double, price: Int, cost: Int = 0, vatRate: Double? = nil,
         qty: Double = 1, unit: String = "buc", category: String? = nil) {
        self.id = id; self.serviceId = serviceId; self.name = name; self.hours = hours; self.price = price; self.cost = cost
        self.vatRate = vatRate; self.qty = qty; self.unit = unit; self.category = category
    }

    init(_ o: JSONObject) {
        id = o["id"]?.string ?? Ids.uid()
        serviceId = o["serviceId"]?.string
        name = o["name"]?.string ?? ""
        hours = o["hours"]?.number ?? 0
        price = Int(Money.jsRound(o["price"]?.number ?? 0))
        cost = Int(Money.jsRound(o["cost"]?.number ?? 0))
        vatRate = o["vatRate"]?.number
        qty = o["qty"]?.number ?? 1
        unit = o["unit"]?.string ?? "buc"
        category = o["category"]?.string
        let known: Set = ["id", "serviceId", "name", "hours", "price", "cost", "vatRate", "qty", "unit", "category"]
        extra = o.filter { !known.contains($0.key) }
    }

    var json: JSONObject {
        var o = extra
        o["id"] = .string(id)
        o["serviceId"] = serviceId.map(JSONValue.string) ?? .null
        o["name"] = .string(name)
        o["hours"] = .number(hours)
        o["price"] = .number(Double(price))
        o["cost"] = .number(Double(cost))
        if let vatRate { o["vatRate"] = .number(vatRate) } else { o["vatRate"] = nil }
        if qty != 1 || o["qty"] != nil { o["qty"] = .number(qty) }
        if unit != "buc" || o["unit"] != nil { o["unit"] = .string(unit) }
        if let category { o["category"] = .string(category) }
        return o
    }
}

enum Operations {
    /// Starting point of an operation picked from the catalog: all of it can be overridden per job.
    static func fromService(_ s: Service, laborRate: Int, id: String = Ids.uid()) -> Operation {
        let hours = s.hours > 0 ? s.hours : 1
        return Operation(id: id, serviceId: s.id, name: s.name, hours: hours,
                         price: s.price != 0 ? s.price : Lines.laborPrice(hours: hours, rate: laborRate), cost: s.cost, category: s.category)
    }

    struct Figures: Equatable { let net: Int; let vat: Int; let gross: Int; let cost: Int; let margin: Int; let marginPct: Double }

    /// Net / gross price and margin of one operation (bani). `vatRate` is 0 when not a VAT payer.
    static func figures(_ op: Operation, vatRate: Double) -> Figures {
        let net = max(op.price, 0), cost = max(op.cost, 0)
        let vat = Money.percentOf(net, vatRate)
        let margin = net - cost
        return Figures(net: net, vat: vat, gross: net + vat, cost: cost, margin: margin,
                       marginPct: net != 0 ? Money.jsRound(Double(margin) / Double(net) * 1000) / 10 : 0)
    }

    /// VAT rate (%) of an operation: its own override, else the shop's standard; 0 when not a VAT payer.
    static func vatRate(_ op: Operation, vatPayer: Bool, shopRate: Double) -> Double {
        vatPayer ? (op.vatRate ?? shopRate) : 0
    }

    /// What a booking's operations add up to: their time in minutes and their price with VAT in bani.
    static func estimate(_ ops: [Operation], vatPayer: Bool, vatRate: Double) -> (minutes: Int, gross: Int) {
        ops.reduce((0, 0)) { acc, op in
            (acc.0 + Int(Money.jsRound(op.hours * 60)), acc.1 + figures(op, vatRate: Self.vatRate(op, vatPayer: vatPayer, shopRate: vatRate)).gross)
        }
    }

    /// "1 h 30 min", "45 min".
    static func duration(_ minutes: Int) -> String {
        minutes < 60 ? "\(minutes) min" : minutes % 60 == 0 ? "\(minutes / 60) h" : "\(minutes / 60) h \(minutes % 60) min"
    }
}
