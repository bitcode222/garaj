import Foundation
import Observation

/// The whole app's data, local-first. Every record is kept as the JSON the web app
/// writes (so backups move freely between phone and desktop); typed views are
/// decoded on demand and cached until their collection changes.
@MainActor
@Observable
final class AppStore {
    enum Phase: Equatable { case loading, ready, failed(String) }

    private(set) var phase: Phase = .loading
    /// collection → id → record JSON
    private(set) var collections: [Collection: [String: JSONValue]] = [:]
    /// settings, counters, demo, schema
    private(set) var meta: JSONObject = [:]
    /// Where the data came from on this launch (shown in Setări → Date).
    private(set) var origin: String = ""

    @ObservationIgnored private var cache: [Collection: Any] = [:]
    @ObservationIgnored private let persistence: Persistence

    init(persistence: Persistence = Persistence()) {
        self.persistence = persistence
    }

    // MARK: Loading

    func load() async {
        do {
            if let data = try await persistence.read() {
                try apply(Backup.decode(data))
                origin = "Pe acest iPhone"
            } else if let legacy = await LegacyMigration.run() {
                try apply(Backup.decode(legacy))
                origin = "Mutate din versiunea anterioară a aplicației"
                try await persistence.write(Backup.encode(collections: collections, meta: meta))
            } else {
                apply(Backup.Snapshot(collections: [:], meta: [:]))
                origin = "Început gol"
            }
            phase = .ready
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    private func apply(_ snapshot: Backup.Snapshot) {
        var out: [Collection: [String: JSONValue]] = [:]
        for name in Collection.allCases {
            var byId: [String: JSONValue] = [:]
            for record in snapshot.collections[name] ?? [] {
                if let id = record["id"]?.string { byId[id] = record }
            }
            out[name] = byId
        }
        collections = out
        meta = snapshot.meta
        cache.removeAll()
    }

    // MARK: Reading

    func all<T: Record>(_ type: T.Type) -> [T] {
        let raw = collections[T.collection] ?? [:] // observed
        if let hit = cache[T.collection] as? [T] { return hit }
        let decoded = raw.values.compactMap { try? $0.merged(over: T.defaults).decode(T.self) }
        cache[T.collection] = decoded
        return decoded
    }

    func get<T: Record>(_ type: T.Type, _ id: String?) -> T? {
        guard let id, let raw = collections[T.collection]?[id] else { return nil }
        return try? raw.merged(over: T.defaults).decode(T.self)
    }

    func count(_ collection: Collection) -> Int { collections[collection]?.count ?? 0 }

    var settings: JSONObject { meta["settings"]?.object ?? [:] }
    var currency: String { settings["currency"]?.string ?? "RON" }

    // MARK: Writing

    /// Saves a typed record over its stored JSON (unknown fields are kept).
    func save<T: Record>(_ record: T) {
        guard case .object(let typed) = (try? JSONValue.from(record)) ?? .null else { return }
        var stored = collections[T.collection]?[record.id]?.object ?? [:]
        stored.merge(typed) { _, new in new }
        // An optional set to nil is left out by Swift's encoder; store it as null, like the web.
        for key in T.defaults.keys where typed[key] == nil { stored[key] = .null }
        collections[T.collection, default: [:]][record.id] = .object(stored)
        cache[T.collection] = nil
        scheduleSave()
    }

    /// Replaces everything (backup import).
    func replaceAll(with data: Data) async throws {
        let snapshot = try Backup.decode(data)
        apply(snapshot)
        origin = "Importate dintr-un backup"
        try await persistence.write(Backup.encode(collections: collections, meta: meta))
    }

    /// Reads the previous app's data again (Setări → Date), replacing what is here.
    /// Returns false when there is nothing to move.
    func moveLegacyDataAgain() async throws -> Bool {
        guard let legacy = await LegacyMigration.run() else { return false }
        try await replaceAll(with: legacy)
        origin = "Mutate din versiunea anterioară a aplicației"
        return true
    }

    func exportBackup() throws -> Data {
        try Backup.encode(collections: collections, meta: meta, exportedAt: Dates.instant())
    }

    // MARK: Persisting

    @ObservationIgnored private var saveTask: Task<Void, Never>?

    /// Writes 250 ms after the last change (like the web app), in one atomic file write.
    private func scheduleSave() {
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            await self?.flush()
        }
    }

    /// Writes now (called when the app goes to the background).
    func flush() async {
        saveTask?.cancel()
        saveTask = nil
        guard phase == .ready, let data = try? Backup.encode(collections: collections, meta: meta) else { return }
        try? await persistence.write(data)
    }
}
