import Foundation

// Port of updateSettings, setNextInvoiceNumber, saveStaff / saveBay and removeTeamMember
// of src/lib/store/actions.js.

extension AppStore {
    /// A setting at a path ("invoicing", "vatRate"), read from meta.settings.
    func setting(_ path: [String]) -> JSONValue? {
        var v: JSONValue? = .object(settings)
        for key in path { v = v?[key] }
        return v
    }

    /// Writes one setting (updateSettings with a one-key patch); the rest of meta.settings is kept.
    func setSetting(_ path: [String], _ value: JSONValue) {
        func put(_ obj: JSONObject, _ path: ArraySlice<String>) -> JSONObject {
            var obj = obj
            guard let key = path.first else { return obj }
            obj[key] = path.count == 1 ? value : .object(put(obj[key]?.object ?? [:], path.dropFirst()))
            return obj
        }
        setMeta("settings", .object(put(settings, path[...])))
    }

    /// The number the next invoice of `series` gets.
    func nextInvoiceNumber(series: String) -> Int {
        meta["counters"]?["invoices"]?[series]?.number.map { Int($0) } ?? shop.startNumber
    }

    /// Moves a series' counter; only upwards of the last issued number (numbers are never reused).
    func setNextInvoiceNumber(series: String, next: Int) throws {
        if next < 1 { throw DomainError(code: "counter", message: "Introdu un număr valid.") }
        let max = all(Invoice.self).reduce(0) { m, i in i.series == series && i.number != nil ? Swift.max(m, i.number!) : m }
        if next <= max { throw DomainError(code: "counter", message: "Numărul trebuie să fie mai mare decât ultima factură emisă în seria \(series) (\(max)).") }
        var counters = meta["counters"]?.object ?? [:]
        if counters["workOrders"] == nil { counters["workOrders"] = .number(1) }
        var bySeries = counters["invoices"]?.object ?? [:]
        bySeries[series] = .number(Double(next))
        counters["invoices"] = .object(bySeries)
        setMeta("counters", .object(counters))
    }

    func newStaff() -> Staff {
        Staff(id: Ids.uid(), name: "", role: "mechanic", color: "blue", phone: "", active: true, order: Double(count(.staff)), createdAt: Dates.instant())
    }

    func newBay() -> Bay { Bay(id: Ids.uid(), name: "", kind: "lift", active: true, order: Double(count(.bays))) }

    @discardableResult
    func saveStaff(_ input: Staff) throws -> Staff {
        var s = input
        s.name = input.name.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.name.isEmpty { throw DomainError(code: "invalid", message: "Completează numele.") }
        save(s, updatedAt: Dates.instant())
        return s
    }

    @discardableResult
    func saveBay(_ input: Bay) throws -> Bay {
        var b = input
        b.name = input.name.trimmingCharacters(in: .whitespacesAndNewlines)
        if b.name.isEmpty { throw DomainError(code: "invalid", message: "Completează numele postului.") }
        let isNew = get(Bay.self, b.id) == nil
        save(b, updatedAt: Dates.instant())
        if isNew, case .object(var raw)? = collections[.bays]?[b.id], raw["createdAt"] == nil {
            raw["createdAt"] = .string(Dates.instant())
            put(.bays, .object(raw))
        }
        return b
    }

    enum Removal { case deleted, deactivated }

    /// A mechanic or bay with history (jobs, bookings) is deactivated, otherwise deleted.
    @discardableResult
    func removeTeamMember(_ collection: Collection, _ id: String) -> Removal {
        let used = all(WorkOrder.self).contains { $0.staffId == id || $0.bayId == id }
            || all(Appointment.self).contains { $0.staffId == id || $0.bayId == id }
        if used, case .object(var raw)? = collections[collection]?[id] {
            raw["active"] = .bool(false)
            raw["updatedAt"] = .string(Dates.instant())
            put(collection, .object(raw))
            return .deactivated
        }
        if collection == .bays { delete(Bay.self, id) } else { delete(Staff.self, id) }
        return .deleted
    }
}
