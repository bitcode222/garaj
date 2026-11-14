import Foundation

// Port of src/domain/money.js. Money is always an integer number of bani
// (1 leu = 100 bani); fractions round once, half away from zero.

enum Money {
    /// JS `Math.round`: halves go up (towards +∞), so -2.5 → -2.
    static func jsRound(_ x: Double) -> Double { (x + 0.5).rounded(.down) }

    /// Integer division rounded half away from zero. `den` must be > 0.
    static func divRound(_ num: Int, _ den: Int) -> Int {
        let q = num / den
        let r = num % den
        if r == 0 { return q }
        if abs(r) * 2 < den { return q }
        return num < 0 ? q - 1 : q + 1
    }

    /// `amount` (bani) × `ratePct` % (up to 2 decimals), rounded.
    static func percentOf(_ amount: Int, _ ratePct: Double) -> Int {
        let bp = Int(jsRound(ratePct * 100))
        return divRound(amount * bp, 10_000)
    }

    /// Parses user input into bani. Accepts "1.234,56", "1234.56", "1 234,56", "12,5 lei".
    /// A single "." followed by exactly three digits is a thousands separator (RO habit).
    static func parse(_ input: String) -> Int? {
        var s = input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        for word in ["lei", "ron", "eur", "€"] { s = s.replacingOccurrences(of: word, with: "") }
        s = String(s.unicodeScalars.filter { !(CharacterSet.whitespacesAndNewlines.contains($0) || $0 == "\u{00A0}" || $0 == "\u{202F}" || $0 == "'") })
        if s.isEmpty { return nil }
        var negative = false
        if s.hasPrefix("-") { negative = true; s.removeFirst() }
        guard !s.isEmpty, s.allSatisfy({ $0.isASCII && ($0.isNumber || $0 == "." || $0 == ",") }) else { return nil }

        let lastDot = s.lastIndex(of: ".")
        let lastComma = s.lastIndex(of: ",")
        var intPart = s
        var fracPart = ""

        if let dot = lastDot, let comma = lastComma {
            let dec = max(dot, comma)
            intPart = s[..<dec].filter { $0 != "." && $0 != "," }
            fracPart = String(s[s.index(after: dec)...])
        } else if lastDot != nil || lastComma != nil {
            let sep: Character = lastDot != nil ? "." : ","
            let parts = s.split(separator: sep, omittingEmptySubsequences: false).map(String.init)
            let thousands = parts.count > 2 || (sep == "." && parts.count == 2 && parts[1].count == 3)
            if thousands {
                guard parts.dropFirst().allSatisfy({ $0.count == 3 }) else { return nil }
                intPart = parts.joined()
            } else {
                intPart = parts[0]
                fracPart = parts[1]
            }
        }

        guard intPart.allSatisfy(\.isNumber), fracPart.allSatisfy(\.isNumber) else { return nil }
        if intPart.isEmpty && fracPart.isEmpty { return nil }

        let frac = Array((fracPart + "000").prefix(3))
        guard let whole = intPart.isEmpty ? 0 : Int(intPart), whole <= 90_071_992_547_409 else { return nil }
        var minor = whole * 100 + Int(String(frac[0...1]))!
        if Int(String(frac[2]))! >= 5 { minor += 1 }
        return negative && minor != 0 ? -minor : minor
    }

    /// Parses a quantity ("1,5", "0.25") to a number with at most `decimals` places.
    static func parseQuantity(_ input: String, decimals: Int = 3) -> Double? {
        let s = input.trimmingCharacters(in: .whitespacesAndNewlines)
            .filter { !$0.isWhitespace }
            .replacingOccurrences(of: ",", with: ".", options: [], range: nil)
        guard !s.isEmpty, s != "-", s != ".", s != "-.", s.wholeMatch(of: /-?\d*\.?\d*/) != nil else { return nil }
        var t = s
        if t.hasSuffix(".") { t += "0" }
        if t.hasPrefix("-.") { t = "-0" + t.dropFirst() } else if t.hasPrefix(".") { t = "0" + t }
        guard let n = Double(t), n.isFinite else { return nil }
        let f = pow(10, Double(decimals))
        return jsRound(n * f) / f
    }

    private static func formatter(_ decimals: Int) -> NumberFormatter {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "ro_RO")
        f.numberStyle = .decimal
        f.minimumFractionDigits = decimals
        f.maximumFractionDigits = decimals
        f.roundingMode = .halfUp
        return f
    }

    /// 123456 → "1.234,56"
    static func formatAmount(_ minor: Int?, decimals: Int = 2) -> String {
        guard let minor else { return "—" }
        return formatter(decimals).string(from: NSNumber(value: Double(minor) / 100)) ?? "—"
    }

    /// 123456 → "1.234,56 lei"
    static func format(_ minor: Int?, currency: String = "RON", decimals: Int = 2, sign: Bool = false) -> String {
        guard let minor else { return "—" }
        let suffix = ["RON": "lei", "EUR": "€"][currency] ?? currency
        return "\(sign && minor > 0 ? "+" : "")\(formatAmount(minor, decimals: decimals)) \(suffix)"
    }

    /// Value for an input field: 123456 → "1234,56" (no grouping, easy to edit).
    static func toInput(_ minor: Int?) -> String {
        guard let minor else { return "" }
        let a = abs(minor)
        let s = "\(a / 100),\(String(format: "%02d", a % 100))"
        return minor < 0 ? "-\(s)" : s
    }

    static func formatQuantity(_ qty: Double?) -> String {
        guard let qty else { return "—" }
        let f = NumberFormatter()
        f.locale = Locale(identifier: "ro_RO")
        f.numberStyle = .decimal
        f.maximumFractionDigits = 3
        f.roundingMode = .halfUp
        return f.string(from: NSNumber(value: qty)) ?? "—"
    }
}
