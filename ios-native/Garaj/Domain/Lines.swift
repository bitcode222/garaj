import Foundation

// Port of src/domain/lines.js. A line is shared by jobs and invoices; money in bani.

struct Totals: Codable, Hashable, Sendable {
    struct Rate: Codable, Hashable, Sendable {
        let rate: Double
        let taxable: Int
        let vat: Int
    }

    var net = 0
    var vat = 0
    var gross = 0
    var byRate: [Rate] = []
    var labor = 0
    var parts = 0
    var fees = 0
    var cost = 0
    var partsMargin = 0
    var laborCost = 0
    var laborMargin = 0
    var hours = 0.0

    init() {}

    /// Older invoices may lack some figures; they read as zero instead of failing.
    init(from decoder: Decoder) throws {
        enum K: String, CodingKey { case net, vat, gross, byRate, labor, parts, fees, cost, partsMargin, laborCost, laborMargin, hours }
        let c = try decoder.container(keyedBy: K.self)
        func int(_ k: K) -> Int { Int((try? c.decodeIfPresent(Double.self, forKey: k)) ?? 0) }
        net = int(.net); vat = int(.vat); gross = int(.gross)
        byRate = (try? c.decodeIfPresent([Rate].self, forKey: .byRate)) ?? []
        labor = int(.labor); parts = int(.parts); fees = int(.fees); cost = int(.cost)
        partsMargin = int(.partsMargin); laborCost = int(.laborCost); laborMargin = int(.laborMargin)
        hours = (try? c.decodeIfPresent(Double.self, forKey: .hours)) ?? 0
    }
}

enum Lines {
    static let kinds = ["labor", "part", "fee"]

    /// Net amount of one line: qty × unit price − discount, rounded once.
    static func net(_ line: Line) -> Int {
        let qtyMilli = Int(Money.jsRound(line.qty * 1000))
        let discount = min(max(line.discountPct, 0), 100)
        let discountBp = Int(Money.jsRound(discount * 100))
        // unit × qtyMilli × (10000 − bp) can pass Int64 for huge values; Decimal keeps it exact.
        let product = Decimal(line.unitPrice) * Decimal(qtyMilli) * Decimal(10_000 - discountBp)
        return divRound(product, 10_000_000)
    }

    private static func divRound(_ num: Decimal, _ den: Int) -> Int {
        var q = num / Decimal(den)
        var rounded = Decimal()
        NSDecimalRound(&rounded, &q, 0, .plain) // .plain = half away from zero
        return NSDecimalNumber(decimal: rounded).intValue
    }

    /// Document totals. VAT per rate on the sum of net lines (EN 16931 / e-Factura), not per line.
    static func totals(_ lines: [Line], vatPayer: Bool = true) -> Totals {
        var groups: [Double: Int] = [:]
        var t = Totals()
        var hours = 0.0
        for line in lines {
            let amount = net(line)
            t.net += amount
            switch line.kind {
            case "labor":
                t.labor += amount
                hours += line.qty
                if line.cost != 0 { t.laborCost += Int(Money.jsRound(line.qty * Double(line.cost))) }
            case "part":
                t.parts += amount
                if line.cost != 0 { t.cost += Int(Money.jsRound(line.qty * Double(line.cost))) }
            default:
                t.fees += amount
            }
            let rate = vatPayer ? line.vatRate : 0
            groups[rate, default: 0] += amount
        }
        t.byRate = groups.sorted { $0.key > $1.key }.map { Totals.Rate(rate: $0.key, taxable: $0.value, vat: Money.percentOf($0.value, $0.key)) }
        t.vat = t.byRate.reduce(0) { $0 + $1.vat }
        t.gross = t.net + t.vat
        t.partsMargin = t.parts - t.cost
        t.laborMargin = t.labor - t.laborCost
        t.hours = Money.jsRound(hours * 100) / 100
        return t
    }

    /// Gross value of one line, for display only (totals never sum these).
    static func gross(_ line: Line, vatPayer: Bool = true) -> Int {
        let n = net(line)
        return vatPayer ? n + Money.percentOf(n, line.vatRate) : n
    }

    static func issues(_ line: Line) -> [String] {
        var out: [String] = []
        if line.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { out.append("Descrierea lipsește.") }
        if !(line.qty > 0) { out.append("Cantitatea trebuie să fie mai mare ca zero.") }
        if !(line.unitPrice >= 0) { out.append("Prețul nu poate fi negativ.") }
        return out
    }

    /// Suggested labor price (bani) for `hours` at an hourly `rate` (bani).
    static func laborPrice(hours: Double, rate: Int) -> Int { Int(Money.jsRound(hours * Double(rate))) }

    static let kindLabel = ["labor": "Manoperă", "part": "Piesă", "fee": "Taxă"]
}
