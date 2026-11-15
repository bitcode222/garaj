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

// MARK: - Checks and facts (customer.js, vehicle.js)

extension People {
    /// Romanian CUI / CIF control digit (key 753217532); an optional "RO" prefix is fine.
    static func isValidCUI(_ input: String) -> Bool {
        var s = input.uppercased().filter { !$0.isWhitespace }
        if s.hasPrefix("RO") { s.removeFirst(2) }
        guard (2...10).contains(s.count), s.allSatisfy({ $0.isASCII && $0.isNumber }) else { return false }
        var digits = s.compactMap { Int(String($0)) }
        let control = digits.removeLast()
        let key = [7, 5, 3, 2, 1, 7, 5, 3, 2]
        let padded = Array(repeating: 0, count: 9 - digits.count) + digits
        let sum = zip(padded, key).reduce(0) { $0 + $1.0 * $1.1 }
        return (sum * 10) % 11 % 10 == control
    }

    /// ISO 13616 mod-97; Romanian IBANs have 24 characters.
    static func isValidIBAN(_ input: String) -> Bool {
        let s = input.uppercased().filter { !$0.isWhitespace }
        guard s.wholeMatch(of: /[A-Z]{2}\d{2}[A-Z0-9]{10,30}/) != nil else { return false }
        if s.hasPrefix("RO") && s.count != 24 { return false }
        var rem = 0
        for ch in s.dropFirst(4) + s.prefix(4) {
            let value = ch.isLetter ? String(Int(ch.asciiValue!) - 55) : String(ch)
            for d in value { rem = (rem * 10 + Int(String(d))!) % 97 }
        }
        return rem == 1
    }

    static func formatIBAN(_ input: String) -> String {
        let s = Array(input.uppercased().filter { !$0.isWhitespace })
        return stride(from: 0, to: s.count, by: 4).map { String(s[$0..<min($0 + 4, s.count)]) }.joined(separator: " ")
    }

    static func isValidEmail(_ input: String) -> Bool {
        input.trimmingCharacters(in: .whitespaces).wholeMatch(of: /[^\s@]+@[^\s@]+\.[^\s@]+/) != nil
    }

    static func initials(_ name: String) -> String {
        let words = name.split(whereSeparator: \.isWhitespace)
        guard let first = words.first else { return "?" }
        if words.count == 1 { return String(first.prefix(2)).uppercased() }
        return (String(first.prefix(1)) + String(words[1].prefix(1))).uppercased()
    }

    struct Facts: Equatable { let visits: Int; let lastVisit: String?; let noShows: Int }

    /// Visits (jobs handed over), the last one, and missed bookings.
    static func facts(_ customerId: String, appointments: [Appointment], orders: [WorkOrder]) -> Facts {
        var visits = 0
        var last: String?
        for o in orders where o.customerId == customerId && o.status == "delivered" {
            visits += 1
            let at = o.dates["delivered"]?.string ?? o.createdAt
            if !at.isEmpty, last == nil || at > last! { last = at }
        }
        return Facts(visits: visits, lastVisit: last, noShows: appointments.filter { $0.customerId == customerId && $0.status == "no_show" }.count)
    }

    /// Soft VIN check: a message, or nil when it looks right (or is empty).
    static func vinIssue(_ input: String) -> String? {
        let v = input.uppercased().filter { !$0.isWhitespace }
        if v.isEmpty { return nil }
        if v.count != 17 { return "VIN-ul are \(v.count) caractere (trebuie 17)." }
        if v.contains(where: { "IOQ".contains($0) }) { return "VIN-ul nu conține literele I, O sau Q." }
        if !v.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) }) { return "VIN-ul conține caractere nepermise." }
        return nil
    }

    /// Average km per day over the log; nil without at least a month of data.
    static func kmPerDay(_ log: [Vehicle.Reading]) -> Double? {
        guard log.count >= 2, let first = log.first, let last = log.last else { return nil }
        let days = Dates.diffDays(first.date, last.date)
        guard days >= 30, last.km > first.km else { return nil }
        return Double(last.km - first.km) / Double(days)
    }

    static func estimateKm(_ v: Vehicle, today: String) -> Int? {
        guard let last = v.mileage.last else { return nil }
        let perDay = kmPerDay(v.mileage) ?? 40
        return Int(Money.jsRound(Double(last.km) + perDay * Double(max(0, Dates.diffDays(last.date, today)))))
    }

    struct Deadline: Equatable { let status: String; let days: Int? }

    /// ok · soon (≤ soonDays) · expired · unknown.
    static func deadline(_ date: String?, today: String, soonDays: Int = 30) -> Deadline {
        guard let date, !date.isEmpty else { return Deadline(status: "unknown", days: nil) }
        let days = Dates.diffDays(today, date)
        return Deadline(status: days < 0 ? "expired" : days <= soonDays ? "soon" : "ok", days: days)
    }

    struct ServiceDue: Equatable { let status: String; var dueDate: String? = nil; var days: Int? = nil; var dueKm: Int? = nil; var estKm: Int? = nil; var kmLeft: Int? = nil }

    /// Next service: last service + interval (months) or + interval (km), whichever comes first.
    static func serviceDue(_ v: Vehicle, today: String, defaultKm: Int = 15_000, defaultMonths: Int = 12) -> ServiceDue {
        guard let lastDate = v.lastServiceDate, !lastDate.isEmpty else { return ServiceDue(status: "unknown") }
        let intervalKm = (v.serviceIntervalKm ?? 0) != 0 ? v.serviceIntervalKm! : defaultKm
        let intervalMonths = (v.serviceIntervalMonths ?? 0) != 0 ? v.serviceIntervalMonths! : defaultMonths
        let dueDate = Dates.addMonths(lastDate, intervalMonths)
        let byDate = deadline(dueDate, today: today, soonDays: 30)
        let dueKm = v.lastServiceKm.map { $0 + intervalKm }
        let est = estimateKm(v, today: today)
        let kmLeft = dueKm != nil && est != nil ? dueKm! - est! : nil
        let byKm = kmLeft == nil ? "unknown" : kmLeft! < 0 ? "expired" : kmLeft! <= 1500 ? "soon" : "ok"
        let rank = ["unknown": -1, "ok": 0, "soon": 1, "expired": 2]
        return ServiceDue(status: rank[byKm]! > rank[byDate.status]! ? byKm : byDate.status, dueDate: dueDate, days: byDate.days, dueKm: dueKm, estKm: est, kmLeft: kmLeft)
    }
}
