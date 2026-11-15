import Foundation

// A booking's operations (src/lib/store/actions.js resolveOperations): stored in `operations`;
// older bookings only have `serviceIds`, which become operations from the catalog on first edit.

extension AppStore {
    /// The booking's operations, in their order.
    func operations(of appointmentId: String) -> [Operation] {
        guard let raw = collections[.appointments]?[appointmentId] else { return [] }
        if let ops = raw["operations"]?.array { return ops.compactMap(\.object).map(Operation.init) }
        let rate = shop.laborRate
        return (raw["serviceIds"]?.array ?? []).compactMap(\.string).compactMap { get(Service.self, $0) }
            .enumerated().map { i, s in Operations.fromService(s, laborRate: rate, id: "\(appointmentId)-\(i)") }
    }

    /// Replaces the booking's operations (order included). `serviceIds` follows, for older readers.
    /// A title that was only the operations' names follows them too.
    func setOperations(_ appointmentId: String, _ ops: [Operation]) {
        guard case .object(var raw)? = collections[.appointments]?[appointmentId] else { return }
        let before = operations(of: appointmentId)
        let oldAuto = before.map(\.name).joined(separator: ", ")
        if let title = raw["title"]?.string, title.isEmpty || title == oldAuto {
            raw["title"] = .string(ops.map(\.name).filter { !$0.isEmpty }.joined(separator: ", "))
        }
        raw["operations"] = .array(ops.map { .object($0.json) })
        raw["serviceIds"] = .array(ops.compactMap(\.serviceId).map(JSONValue.string))
        raw["updatedAt"] = .string(Dates.instant())
        put(.appointments, .object(raw))
    }

    /// The booking's length set to what its operations take (at least 15 minutes).
    func fitToOperations(_ appointmentId: String) throws {
        guard var a = get(Appointment.self, appointmentId), let start = Dates.parseInstant(a.start) else { return }
        let minutes = max(15, Operations.estimate(operations(of: appointmentId), vatPayer: shop.vatPayer, vatRate: shop.vatRate).minutes)
        a.end = Dates.instant(start.addingTimeInterval(Double(minutes) * 60))
        save(a, updatedAt: Dates.instant())
    }

    /// A blank operation for "Operație liberă": one hour at the labor rate.
    func newOperation() -> Operation {
        Operation(id: Ids.uid(), name: "", hours: 1, price: shop.laborRate)
    }
}
