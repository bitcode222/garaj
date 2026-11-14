import Foundation

// Port of the parts of src/domain/customer.js and src/domain/vehicle.js the phone uses.

enum People {
    /// Romanian numbers to E.164: "0722 123 456" → "+40722123456".
    static func normalizePhone(_ raw: String) -> String {
        var s = raw.filter { $0.isASCII && ($0.isNumber || $0 == "+") }
        if s.hasPrefix("00") { s = "+" + s.dropFirst(2) }
        if s.hasPrefix("+") { return s }
        if s.hasPrefix("0") && s.count == 10 { return "+4" + s }
        if s.hasPrefix("40") && s.count == 11 { return "+" + s }
        return s
    }

    /// "+40722123456" → "0722 123 456"; anything else as typed.
    static func formatPhone(_ raw: String) -> String {
        let e164 = normalizePhone(raw)
        guard e164.hasPrefix("+40"), e164.count == 12 else { return raw }
        let local = Array("0" + e164.dropFirst(3))
        return "\(String(local[0..<4])) \(String(local[4..<7])) \(String(local[7...]))"
    }

    static func telURL(_ phone: String) -> URL? { URL(string: "tel:\(normalizePhone(phone))") }

    static func whatsappURL(_ phone: String, text: String) -> URL? {
        let digits = normalizePhone(phone).filter(\.isNumber)
        var c = URLComponents(string: "https://wa.me/\(digits)")
        c?.queryItems = [URLQueryItem(name: "text", value: text)]
        return c?.url
    }

    static func smsURL(_ phone: String, body: String) -> URL? {
        let encoded = body.addingPercentEncoding(withAllowedCharacters: People.uriComponent) ?? ""
        return URL(string: "sms:\(normalizePhone(phone))?&body=\(encoded)")
    }

    /// What JS `encodeURIComponent` leaves as is.
    static let uriComponent = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()")

    static func greetingName(_ customer: Customer) -> String {
        if customer.isCompany { return customer.contactName.isEmpty ? customer.name : customer.contactName }
        return customer.name.trimmingCharacters(in: .whitespaces).split(whereSeparator: \.isWhitespace).first.map(String.init) ?? ""
    }

    /// Search key for a plate: "b-123 abc" → "B123ABC".
    static func normalizePlate(_ input: String) -> String {
        input.uppercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) }
    }

    /// Romanian plate display: "B123ABC" → "B 123 ABC", "CJ12XYZ" → "CJ 12 XYZ".
    static func formatPlate(_ input: String) -> String {
        let n = normalizePlate(input)
        let patterns = [/^(B)(\d{2,3})([A-Z]{3})$/, /^([A-Z]{2})(\d{2})([A-Z]{3})$/]
        for p in patterns {
            if let m = n.wholeMatch(of: p) { return "\(m.1) \(m.2) \(m.3)" }
        }
        if let m = n.wholeMatch(of: /^([A-Z]{1,2})(\d{3,6})$/) { return "\(m.1) \(m.2)" }
        return input.uppercased().trimmingCharacters(in: .whitespaces)
            .split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }
}
