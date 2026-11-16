import SwiftUI

// Look 3 "Coperți" (round-3 board, picked 16 Nov 2026, docs/IOS-NATIVE.md §9): color comes from the
// content. The car's make colors its cards and pages, each area of the app keeps one color, and the
// kind of work has its icon and color.

/// The areas of the app and their colors, always the same (the tiles and icons of Registru).
enum Area {
    static let programari = Color(hue: 0.57, saturation: 0.72, brightness: 0.86)
    static let lucrari = Color(hue: 0.06, saturation: 0.78, brightness: 0.93)
    static let facturi = Color(hue: 0.72, saturation: 0.55, brightness: 0.82)
    static let clienti = Color(hue: 0.12, saturation: 0.85, brightness: 0.85)
    static let masini = Color(hue: 0.44, saturation: 0.70, brightness: 0.70)
    static let stoc = Color(hue: 0.93, saturation: 0.60, brightness: 0.86)
    static let catalog = Color(hue: 0.52, saturation: 0.75, brightness: 0.72)
    static let rapoarte = Color(hue: 0.38, saturation: 0.62, brightness: 0.68)
    static let contact = Color.red
    static let setari = Color.gray
}

// MARK: - Car makes

enum Make {
    /// Spelling variants → logo key (src/components/ds/make-logo.jsx ALIASES).
    private static let aliases = ["vw": "volkswagen", "mercedes-benz": "mercedes", "mercedes benz": "mercedes", "benz": "mercedes",
                                  "citroën": "citroen", "škoda": "skoda", "rolls-royce": "rollsroyce", "ds": "dsautomobiles",
                                  "ds automobiles": "dsautomobiles", "alfa romeo": "alfaromeo"]
    static let colors: [String: Color] = [
        "volkswagen": Color(red: 0.11, green: 0.24, blue: 0.55), "skoda": Color(red: 0.18, green: 0.49, blue: 0.31),
        "dacia": Color(red: 0.35, green: 0.38, blue: 0.31), "bmw": Color(red: 0.11, green: 0.41, blue: 0.83),
        "ford": Color(red: 0.12, green: 0.29, blue: 0.63), "toyota": Color(red: 0.83, green: 0.13, blue: 0.16),
        "audi": Color(white: 0.17), "renault": Color(red: 0.91, green: 0.71, blue: 0), "mercedes": Color(white: 0.29),
        "opel": Color(red: 0.93, green: 0.73, blue: 0.0), "peugeot": Color(red: 0.13, green: 0.20, blue: 0.40),
        "hyundai": Color(red: 0.0, green: 0.17, blue: 0.37), "kia": Color(red: 0.02, green: 0.08, blue: 0.16),
        "nissan": Color(red: 0.76, green: 0.05, blue: 0.20), "volvo": Color(red: 0.0, green: 0.20, blue: 0.40),
        "fiat": Color(red: 0.62, green: 0.07, blue: 0.13), "seat": Color(red: 0.56, green: 0.24, blue: 0.16),
        "honda": Color(red: 0.80, green: 0.05, blue: 0.10), "mazda": Color(red: 0.06, green: 0.06, blue: 0.10),
        "citroen": Color(red: 0.55, green: 0.10, blue: 0.10), "tesla": Color(red: 0.80, green: 0.0, blue: 0.0),
    ]
    private static let known: Set<String> = ["audi", "bmw", "chevrolet", "citroen", "dacia", "dsautomobiles", "fiat", "ford", "honda", "hyundai",
                                             "iveco", "jeep", "kia", "lada", "man", "mazda", "mini", "mitsubishi", "nissan", "opel", "peugeot",
                                             "renault", "seat", "skoda", "smart", "subaru", "suzuki", "tata", "tesla", "toyota", "volkswagen",
                                             "volvo", "mercedes"]

    static func key(_ make: String) -> String? {
        let k = make.trimmingCharacters(in: .whitespaces).lowercased()
        let alias = aliases[k] ?? k.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "-", with: "")
        return known.contains(alias) ? alias : nil
    }
}

/// The make's logo in white on a circle of the brand's color; a monogram for makes without a logo.
struct MakeLogo: View {
    let make: String
    var size: CGFloat = 36

    var body: some View {
        let key = Make.key(make)
        ZStack {
            Circle().fill(key.flatMap { Make.colors[$0] } ?? Color(.systemGray))
            if let key {
                Image("Makes/\(key)").resizable().renderingMode(.template).scaledToFit()
                    .foregroundStyle(key == "renault" || key == "opel" ? Color.black : Color.white)
                    .frame(width: size * 0.56, height: size * 0.56)
            } else {
                Text(make.prefix(1).uppercased()).font(.system(size: size * 0.42, weight: .bold)).foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .accessibilityLabel(make.isEmpty ? "Mașină" : make)
    }
}

// MARK: - Kind of work

/// What a job or booking is mostly about, for its colored icon (the catalog's categories).
enum WorkKind {
    static func style(_ category: String) -> (symbol: String, color: Color) {
        switch category {
        case "tires": ("circle.dashed.inset.filled", .blue)
        case "brakes": ("exclamationmark.brakesignal", .red)
        case "maintenance": ("oilcan.fill", .orange)
        case "engine": ("engine.combustion.fill", .brown)
        case "diagnostics": ("waveform.path.ecg", .purple)
        case "electrical": ("minus.plus.batteryblock.fill", .green)
        case "ac": ("snowflake", .cyan)
        case "suspension": ("arrow.up.and.down.circle.fill", .indigo)
        case "transmission": ("gearshape.2.fill", .teal)
        case "inspection": ("checkmark.seal.fill", .mint)
        case "exhaust": ("smoke.fill", .gray)
        case "bodywork": ("paintbrush.fill", .pink)
        default: ("wrench.and.screwdriver.fill", .gray)
        }
    }

    /// The category of a piece of work: the catalog operation it came from, else words in its text.
    static func category(serviceId: String?, text: String, services: [String: Service]) -> String {
        if let id = serviceId, let s = services[id] { return s.category }
        let t = text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "ro"))
        let rules: [(String, [String])] = [
            ("tires", ["anvelop", "roti", "roata", "echilibr", "vulcaniz", "jant"]), ("brakes", ["fran", "placut", "disc"]),
            ("maintenance", ["ulei", "revizie", "filtr"]), ("diagnostics", ["diagnoz", "verificare pre", "computer"]),
            ("electrical", ["baterie", "acumulator", "electric", "alternator", "bec"]), ("ac", ["clima", "a/c", "freon"]),
            ("engine", ["distributie", "motor", "injector", "bujii"]), ("transmission", ["ambreiaj", "cutie", "transmisie"]),
            ("suspension", ["amortizor", "suspensie", "bieleta", "geometrie", "pivot"]), ("inspection", ["itp"]),
            ("exhaust", ["evacuare", "toba", "catalizator"]), ("bodywork", ["caroserie", "vopsit", "tinichigerie"]),
        ]
        return rules.first { $0.1.contains { t.contains($0) } }?.0 ?? "general"
    }
}

/// The kind of work as a white symbol on a colored rounded square (Settings style).
struct WorkIcon: View {
    let category: String
    var size: CGFloat = 30
    var body: some View {
        let s = WorkKind.style(category)
        IconSquare(symbol: s.symbol, color: s.color).scaleEffect(size / 30).frame(width: size, height: size)
    }
}
