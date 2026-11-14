import Foundation
import Testing
@testable import Garaj

@MainActor
struct StoreTests {
    func fixture() throws -> Data {
        try Data(contentsOf: Bundle(for: FixtureBundle.self).url(forResource: "backup", withExtension: "json")!)
    }

    func makeStore() -> (AppStore, URL) {
        let url = URL.temporaryDirectory.appending(path: "garaj-test-\(UUID().uuidString).json")
        return (AppStore(persistence: Persistence(url: url)), url)
    }

    @Test func importsAWebBackup() async throws {
        let (store, _) = makeStore()
        try await store.replaceAll(with: fixture())
        #expect(store.all(WorkOrder.self).count == 4)
        #expect(store.all(Customer.self).count == 4)
        let order = try #require(store.all(WorkOrder.self).first)
        #expect(!order.lines.isEmpty)
    }

    @Test func roundTripKeepsEveryField() async throws {
        let (store, _) = makeStore()
        let data = try fixture()
        try await store.replaceAll(with: data)
        let original = try Backup.decode(data)
        let again = try Backup.decode(store.exportBackup())
        for name in Collection.allCases {
            let a = Set(original.collections[name] ?? [])
            let b = Set(again.collections[name] ?? [])
            #expect(a == b, "\(name.rawValue) changed in a round trip")
        }
        #expect(original.meta == again.meta)
    }

    @Test func savingATypedRecordKeepsUnknownFields() async throws {
        let (store, _) = makeStore()
        try await store.replaceAll(with: fixture())
        var order = try #require(store.all(WorkOrder.self).first)
        let before = try #require(store.collections[.workOrders]?[order.id]?.object)
        order.notes = "schimbat"
        store.save(order)
        let after = try #require(store.collections[.workOrders]?[order.id]?.object)
        #expect(after["notes"] == .string("schimbat"))
        for key in before.keys where key != "notes" { #expect(after[key] == before[key], "\(key) changed") }
    }

    @Test func persistsAndReloads() async throws {
        let (store, url) = makeStore()
        try await store.replaceAll(with: fixture())
        let reloaded = AppStore(persistence: Persistence(url: url))
        await reloaded.load()
        #expect(reloaded.phase == .ready)
        #expect(reloaded.count(.invoices) == store.count(.invoices))
    }

    @Test func rejectsWhatIsNotABackup() {
        #expect(throws: Backup.Failure.self) { try Backup.decode(Data("{}".utf8)) }
        #expect(throws: Backup.Failure.self) { try Backup.decode(Data("nope".utf8)) }
    }
}
