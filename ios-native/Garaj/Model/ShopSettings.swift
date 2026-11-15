import Foundation

/// The settings the phone reads (src/lib/store/defaults.js DEFAULT_SETTINGS), from meta.settings.
struct ShopSettings: Sendable {
    var currency = "RON"
    var shopName = "Garajul meu"
    var vatPayer = true
    var vatRate = 21.0
    var laborRate = 15_000
    var hoursOpen = "08:00"
    var hoursClose = "18:00"
    var series = "GRJ"
    var startNumber = 1
    var dueDays = 14
    var iban = ""

    init() {}

    init(_ json: JSONObject) {
        currency = json["currency"]?.string ?? currency
        shopName = json["shop"]?["name"]?.string ?? shopName
        if case .bool(let b)? = json["invoicing"]?["vatPayer"] { vatPayer = b }
        vatRate = json["invoicing"]?["vatRate"]?.number ?? vatRate
        laborRate = json["laborRate"]?.number.map { Int($0) } ?? laborRate
        hoursOpen = json["hours"]?["open"]?.string ?? hoursOpen
        hoursClose = json["hours"]?["close"]?.string ?? hoursClose
        series = json["invoicing"]?["series"]?.string ?? series
        startNumber = json["invoicing"]?["startNumber"]?.number.map { Int($0) } ?? startNumber
        dueDays = json["invoicing"]?["dueDays"]?.number.map { Int($0) } ?? dueDays
        iban = json["shop"]?["iban"]?.string ?? iban
    }

    /// The VAT rate new lines get (0 when the shop is not a VAT payer).
    var lineVatRate: Double { vatPayer ? vatRate : 0 }
}
