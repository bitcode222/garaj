import Foundation

/// The backup format shared with the web app (src/lib/store/actions.js exportBackup / importBackup):
/// `{ app: "garaj", format: 1, exportedAt, collections: { name: [record] }, meta: { settings, counters, demo, schema } }`.
/// The phone's own data file uses the same format.
enum Backup {
    struct Snapshot {
        var collections: [Collection: [JSONValue]]
        var meta: JSONObject
    }

    enum Failure: LocalizedError {
        case invalidJSON, notGaraj, damaged(String)
        var errorDescription: String? {
            switch self {
            case .invalidJSON: "Fișierul nu este un backup Garaj valid (JSON invalid)."
            case .notGaraj: "Fișierul nu este un backup Garaj."
            case .damaged(let name): "Backup deteriorat: colecția „\(name)” are înregistrări invalide."
            }
        }
    }

    /// Same checks as the web's importBackup.
    static func decode(_ data: Data) throws -> Snapshot {
        guard let root = try? JSONValue.parse(data) else { throw Failure.invalidJSON }
        guard root["app"]?.string == "garaj", let collections = root["collections"]?.object,
              let meta = root["meta"]?.object, meta["settings"]?.object != nil else { throw Failure.notGaraj }
        var out: [Collection: [JSONValue]] = [:]
        for name in Collection.allCases {
            guard let value = collections[name.rawValue] else { out[name] = []; continue }
            guard let list = value.array, list.allSatisfy({ $0["id"]?.string != nil }) else { throw Failure.damaged(name.rawValue) }
            out[name] = list
        }
        return Snapshot(collections: out, meta: meta)
    }

    static func encode(collections: [Collection: [String: JSONValue]], meta: JSONObject, exportedAt: String? = nil) throws -> Data {
        var cols: JSONObject = [:]
        for name in Collection.allCases {
            let records = (collections[name] ?? [:]).values.sorted { ($0["id"]?.string ?? "") < ($1["id"]?.string ?? "") }
            cols[name.rawValue] = .array(records)
        }
        var root: JSONObject = ["app": .string("garaj"), "format": .number(1), "collections": .object(cols), "meta": .object(meta)]
        if let exportedAt { root["exportedAt"] = .string(exportedAt) }
        return try JSONEncoder().encode(JSONValue.object(root))
    }
}

/// The data file: Application Support/garaj.json, written atomically.
actor Persistence {
    let url: URL

    init(url: URL? = nil) {
        self.url = url ?? URL.applicationSupportDirectory.appending(path: "garaj.json")
    }

    func read() throws -> Data? {
        guard FileManager.default.fileExists(atPath: url.path()) else { return nil }
        return try Data(contentsOf: url)
    }

    func write(_ data: Data) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
