import Foundation

/// What a Romanian registration certificate (certificat de înmatriculare, "talon") says, read from its text.
/// Empty strings and nil for what could not be read; the person checks every field before saving.
struct TalonData: Equatable, Sendable {
    var plate = ""
    var vin = ""
    var make = ""
    var model = ""
    var year: Int?
    var engine = ""
    var fuel = "" // a key of Inventory.fuels, or empty
    var color = ""
    var owner = ""
    var address = ""

    var isEmpty: Bool { plate.isEmpty && vin.isEmpty && make.isEmpty && model.isEmpty && owner.isEmpty }
}

/// Reads the talon's fields from recognised text lines (top to bottom). The certificate labels each field with
/// an EU code (A plate, B first registration, C.1/C.2 holder and owner, D.1 make, D.3 model, E VIN, P.1 engine
/// size, P.3 fuel, R colour); a value sits after its code on the same line or on the next one. The plate and the
/// VIN are also found by their shape anywhere, since text recognition often drops or garbles the small codes.
enum TalonParser {
    static func parse(_ rawLines: [String]) -> TalonData {
        let lines = rawLines.map(clean).filter { !$0.isEmpty }
        var out = TalonData()

        func field(_ code: String) -> String? {
            for (i, line) in lines.enumerated() {
                guard let rest = after(code: code, in: line) else { continue }
                if !rest.isEmpty { return rest }
                if i + 1 < lines.count, codeOf(lines[i + 1]) == nil { return lines[i + 1] }
            }
            return nil
        }

        out.plate = (field("A").flatMap(plate(in:)) ?? lines.lazy.compactMap(plate(in:)).first) ?? ""
        out.vin = (field("E").flatMap(vin(in:)) ?? lines.lazy.compactMap(vin(in:)).first) ?? ""
        out.make = field("D.1").map(makeName) ?? ""
        out.model = (field("D.3") ?? field("D.2")).map(title) ?? ""
        out.year = field("B").flatMap(year(in:))
        if let cc = field("P.1").flatMap({ Int($0.filter(\.isNumber).prefix(5)) }), cc >= 50, cc <= 20_000 { out.engine = "\(cc) cm³" }
        out.fuel = field("P.3").map(fuelKey) ?? ""
        out.color = field("R").map(title) ?? ""
        // C.2 is the owner, C.1 the holder; either is the client who brings the car.
        let surname = field("C.2.1") ?? field("C.1.1")
        let given = field("C.2.1") != nil ? field("C.2.2") : field("C.1.2")
        out.owner = [surname, given].compactMap { $0 }.map(title).joined(separator: " ")
        out.address = (field("C.2.3") ?? field("C.1.3")).map(title) ?? ""
        return out
    }

    // MARK: Codes

    /// The codes the parser reads, longest first so "C.2.1" wins over "C.2" and "C".
    private static let codes = ["C.2.1", "C.2.2", "C.2.3", "C.1.1", "C.1.2", "C.1.3", "D.1", "D.2", "D.3", "P.1", "P.3", "A", "B", "E", "R"]

    /// The text after `code` when the line starts with it, else nil. Single letters need a separator after
    /// them ("A.", "E:") or a value of the right shape, so "AUDI" or "BENZINA" never read as codes A and B.
    private static func after(code: String, in line: String) -> String? {
        let parts = code.split(separator: ".").map(String.init)
        let pattern: String
        if parts.count == 1 {
            pattern = "^\(parts[0])\\s*[.:)]\\s*(.*)$|^\(parts[0])\\s+(.*)$"
        } else {
            pattern = "^" + parts.joined(separator: "\\s*[.,]?\\s*") + "(?![0-9])\\s*[.:)]?\\s*(.*)$"
        }
        guard let re = try? NSRegularExpression(pattern: pattern),
              let m = re.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)) else { return nil }
        for g in 1..<m.numberOfRanges {
            if let r = Range(m.range(at: g), in: line) {
                let value = String(line[r]).trimmingCharacters(in: .whitespaces)
                // A bare letter followed by words: only when the value has the shape the code expects.
                if parts.count == 1, g == 2 {
                    switch code {
                    case "A": return plate(in: value) != nil ? value : nil
                    case "E": return vin(in: value) != nil ? value : nil
                    case "B": return year(in: value) != nil ? value : nil
                    case "R": return !value.isEmpty && value.allSatisfy({ $0.isLetter || $0 == " " || $0 == "-" }) ? value : nil
                    default: return nil
                    }
                }
                return value
            }
        }
        return nil
    }

    private static func codeOf(_ line: String) -> String? { codes.first { after(code: $0, in: line) != nil } }

    // MARK: Values

    private static let counties = ["AB", "AR", "AG", "BC", "BH", "BN", "BT", "BV", "BR", "BZ", "CS", "CL", "CJ", "CT", "CV", "DB", "DJ", "GL",
                                   "GR", "GJ", "HR", "HD", "IL", "IS", "IF", "MM", "MH", "MS", "NT", "OT", "PH", "SM", "SJ", "SB", "SV", "TR",
                                   "TM", "TL", "VS", "VL", "VN"]

    /// "B 123 ABC", "CJ 12 XYZ" (spaces optional); Bucharest takes two or three digits, a county two.
    static func plate(in text: String) -> String? {
        let t = text.uppercased()
        let pattern = "(?<![A-Z0-9])(B\\s?\\d{2,3}|(?:\(counties.joined(separator: "|")))\\s?\\d{2})\\s?([A-Z]{3})(?![A-Z0-9])"
        guard let re = try? NSRegularExpression(pattern: pattern),
              let m = re.firstMatch(in: t, range: NSRange(t.startIndex..., in: t)),
              let a = Range(m.range(at: 1), in: t), let b = Range(m.range(at: 2), in: t) else { return nil }
        let head = t[a].filter { !$0.isWhitespace }
        let letters = head.prefix { $0.isLetter }, digits = head.drop { $0.isLetter }
        return "\(letters) \(digits) \(t[b])"
    }

    /// 17 characters without I, O or Q. Recognition reads 0 as O and 1 as I, so those are put back first.
    static func vin(in text: String) -> String? {
        let fix = { (t: Substring) in String(t.map { $0 == "O" || $0 == "Q" ? "0" : $0 == "I" ? "1" : $0 }) }
        let ok = { (v: String) in v.count == 17 && v.allSatisfy { $0.isNumber || ($0.isLetter && $0.isASCII) }
            && v.contains(where: \.isNumber) && v.filter(\.isLetter).count >= 2 }
        let upper = text.uppercased()
        // A whole word first (the usual case), then the line without its label and spaces (when split in two).
        if let word = upper.split(whereSeparator: { !$0.isLetter && !$0.isNumber }).map(fix).first(where: ok) { return word }
        let unlabelled = upper.replacingOccurrences(of: "VIN", with: " ").filter { $0.isLetter || $0.isNumber }
        let fixed = fix(Substring(unlabelled))
        guard let re = try? NSRegularExpression(pattern: "[A-HJ-NPR-Z0-9]{17}"),
              let m = re.firstMatch(in: fixed, range: NSRange(fixed.startIndex..., in: fixed)),
              let r = Range(m.range, in: fixed) else { return nil }
        let v = String(fixed[r])
        return ok(v) ? v : nil
    }

    /// The year of a "12.03.2015" date.
    static func year(in text: String) -> Int? {
        guard let re = try? NSRegularExpression(pattern: "\\d{1,2}\\s*[./-]\\s*\\d{1,2}\\s*[./-]\\s*((?:19|20)\\d{2})"),
              let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let r = Range(m.range(at: 1), in: text), let y = Int(text[r]) else { return nil }
        return y
    }

    private static func fuelKey(_ text: String) -> String {
        let t = text.uppercased()
        if t.contains("HIBRID") || t.contains("HYBRID") { return "hybrid" }
        if t.contains("ELECTR") { return "electric" }
        if t.contains("GPL") || t.contains("LPG") { return "lpg" }
        if t.contains("MOTORIN") || t.contains("DIESEL") { return "diesel" }
        if t.contains("BENZ") || t.contains("PETROL") { return "petrol" }
        return ""
    }

    /// The make as the app writes it: known short names stay in capitals (BMW), the rest in title case.
    private static func makeName(_ text: String) -> String {
        let t = text.trimmingCharacters(in: .whitespaces)
        let upper = ["BMW", "VW", "MG", "DS", "KIA", "MAN", "GMC"]
        if upper.contains(t.uppercased()) { return t.uppercased() == "VW" ? "Volkswagen" : t.uppercased() }
        if t.uppercased().hasPrefix("MERCEDES") { return "Mercedes-Benz" }
        return title(t)
    }

    /// Company forms and engine badges that stay in capitals.
    private static let acronyms: Set<String> = ["SRL", "SA", "SC", "PFA", "II", "IF", "SNC", "SCS", "RA", "TDI", "TSI", "TFSI", "GTI", "DCI",
                                                "HDI", "CDI", "CRDI", "AMG", "RS", "GT", "SUV"]

    /// "POPESCU ION" → "Popescu Ion"; keeps company forms (SRL), engine badges (TDI) and tokens with digits (A4).
    static func title(_ text: String) -> String {
        text.split(separator: " ").map { word -> String in
            let w = String(word)
            if w.contains(where: \.isNumber) || acronyms.contains(w.uppercased().trimmingCharacters(in: .punctuationCharacters)) {
                return w.uppercased()
            }
            return w.lowercased().split(separator: "-").map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: "-")
        }.joined(separator: " ")
    }

    /// Cyrillic letters text recognition sometimes returns for their Latin twins (В for B, А for A…).
    private static let lookalikes: [Character: Character] = ["А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P",
                                                            "С": "C", "Т": "T", "Х": "X", "У": "Y", "а": "a", "е": "e", "о": "o", "р": "p",
                                                            "с": "c", "х": "x"]

    private static func clean(_ line: String) -> String {
        String(line.map { lookalikes[$0] ?? $0 }).replacingOccurrences(of: "\u{00A0}", with: " ")
            .split(whereSeparator: \.isWhitespace).joined(separator: " ")
            .trimmingCharacters(in: .whitespaces)
    }
}
