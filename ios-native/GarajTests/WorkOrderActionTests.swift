import Foundation
import Testing
@testable import Garaj

/// The job actions (createWorkOrder, setWorkOrderStatus, …) on the demo backup.
@MainActor
struct WorkOrderActionTests {
    func store() async throws -> AppStore {
        let url = URL.temporaryDirectory.appending(path: "garaj-test-\(UUID().uuidString).json")
        let store = AppStore(persistence: Persistence(url: url))
        try await store.replaceAll(with: Data(contentsOf: Bundle(for: FixtureBundle.self).url(forResource: "backup", withExtension: "json")!))
        return store
    }

    @Test func createTakesTheNextNumberAndLogsMileage() async throws {
        let s = try await store()
        let vehicle = try #require(s.all(Vehicle.self).first)
        let before = Int(s.meta["counters"]?["workOrders"]?.number ?? 1)
        let (order, _) = try s.createWorkOrder(customerId: vehicle.customerId, vehicleId: vehicle.id, complaint: "  zgomot  ", mileage: 123_456)
        #expect(order.number == before)
        #expect(Int(s.meta["counters"]?["workOrders"]?.number ?? 0) == before + 1)
        #expect(order.complaint == "zgomot")
        #expect(order.inspection.count == 10)
        let log = s.collections[.vehicles]?[vehicle.id]?["mileage"]?.array ?? []
        #expect(log.contains { $0["km"]?.number == 123_456 })
    }

    @Test func statusMovesFollowTheFlowAndUndo() async throws {
        let s = try await store()
        let vehicle = try #require(s.all(Vehicle.self).first)
        let (order, _) = try s.createWorkOrder(customerId: vehicle.customerId, vehicleId: vehicle.id)
        let undo = try s.setWorkOrderStatus(order.id, to: "ready")
        let moved = try #require(s.get(WorkOrder.self, order.id))
        #expect(moved.status == "ready")
        #expect(moved.activity.last?["skipped"] == .array([.string("approved"), .string("in_progress")]))
        #expect(throws: DomainError.self) { try s.setWorkOrderStatus(order.id, to: "cancelled") }
        try s.restore(undo)
        #expect(s.get(WorkOrder.self, order.id)?.status == "estimate")
    }

    @Test func closedJobsOnlyTakeNotes() async throws {
        let s = try await store()
        let vehicle = try #require(s.all(Vehicle.self).first)
        let (order, _) = try s.createWorkOrder(customerId: vehicle.customerId, vehicleId: vehicle.id)
        try s.setWorkOrderStatus(order.id, to: "delivered")
        var closed = try #require(s.get(WorkOrder.self, order.id))
        closed.notes = "ok"
        try s.updateWorkOrder(closed)
        closed.complaint = "altceva"
        #expect(throws: DomainError.self) { try s.updateWorkOrder(closed) }
    }

    @Test func onlyEstimatesWithoutInvoiceAreDeleted() async throws {
        let s = try await store()
        let vehicle = try #require(s.all(Vehicle.self).first)
        let (order, _) = try s.createWorkOrder(customerId: vehicle.customerId, vehicleId: vehicle.id)
        try s.setWorkOrderStatus(order.id, to: "approved")
        #expect(throws: DomainError.self) { try s.deleteWorkOrder(order.id) }
        try s.setWorkOrderStatus(order.id, to: "cancelled")
        try s.deleteWorkOrder(order.id)
        #expect(s.get(WorkOrder.self, order.id) == nil)
    }

    @Test func linesKeepFieldsTheyDontKnow() throws {
        let json = #"{"id":"a","kind":"part","refId":null,"description":"x","qty":1,"unit":"buc","unitPrice":100,"discountPct":0,"vatRate":21,"cost":0,"staffId":null,"need":"required","refused":true}"#
        let line = try JSONDecoder().decode(Line.self, from: Data(json.utf8))
        #expect(line.refused)
        let back = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(line))
        #expect(back["need"] == .string("required"))
    }
}
