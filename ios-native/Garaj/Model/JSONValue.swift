import Foundation

/// Any JSON value. The store keeps every record as a JSON object, so fields the
/// Swift models don't know yet (added later by the web app) survive a round trip.
enum JSONValue: Codable, Hashable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let n):
            // Whole numbers go out without ".0", like JSON.stringify.
            if n.rounded() == n, abs(n) < 9_007_199_254_740_992 { try c.encode(Int64(n)) } else { try c.encode(n) }
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    var object: [String: JSONValue]? { if case .object(let o) = self { o } else { nil } }
    var array: [JSONValue]? { if case .array(let a) = self { a } else { nil } }
    var string: String? { if case .string(let s) = self { s } else { nil } }
    var number: Double? { if case .number(let n) = self { n } else { nil } }

    subscript(key: String) -> JSONValue? { object?[key] }
}

typealias JSONObject = [String: JSONValue]

extension JSONValue {
    /// From Foundation's parser output (much faster than Codable for a large file).
    init(foundation any: Any) {
        switch any {
        case is NSNull: self = .null
        case let n as NSNumber:
            self = CFGetTypeID(n) == CFBooleanGetTypeID() ? .bool(n.boolValue) : .number(n.doubleValue)
        case let s as String: self = .string(s)
        case let a as [Any]: self = .array(a.map(JSONValue.init(foundation:)))
        case let o as [String: Any]: self = .object(o.mapValues(JSONValue.init(foundation:)))
        default: self = .null
        }
    }

    static func parse(_ data: Data) throws -> JSONValue {
        JSONValue(foundation: try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]))
    }

    /// Decodes a typed value from this JSON (via Data; fast enough for a few thousand records).
    func decode<T: Decodable>(_ type: T.Type) throws -> T {
        try JSONDecoder().decode(T.self, from: JSONEncoder().encode(self))
    }

    /// Encodes a typed value into JSON.
    static func from<T: Encodable>(_ value: T) throws -> JSONValue {
        try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value))
    }

    /// `self` with `defaults` filled in where keys are missing (like the web's mergeSettings).
    func merged(over defaults: JSONObject) -> JSONValue {
        guard case .object(var o) = self else { return self }
        for (k, v) in defaults {
            if let existing = o[k] {
                if case .object(let sub) = v, case .object = existing { o[k] = existing.merged(over: sub) }
            } else {
                o[k] = v
            }
        }
        return .object(o)
    }
}
