import Foundation

// Port of logContact / clearContact and the catalog actions of src/lib/store/actions.js.

extension AppStore {
    /// A reminder was handled (contacted, or snoozed for `days`); it comes back after that if still due.
    func logContact(_ key: String, channel: String = "manual", days: Int = 7) {
        let today = Dates.today()
        save(Contact(id: key, key: key, channel: channel, date: today, snoozeUntil: Dates.addDays(today, days), createdAt: Dates.instant()))
    }

    func clearContact(_ key: String) { delete(Contact.self, key) }

    @discardableResult
    func saveService(_ input: Service) throws -> Service {
        let name = input.name.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty { throw DomainError(code: "invalid", message: "Completează denumirea operațiunii.") }
        var s = input
        s.name = name
        save(s, updatedAt: Dates.instant())
        return s
    }

    @discardableResult
    func savePart(_ input: Part) throws -> Part {
        let name = input.name.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty { throw DomainError(code: "invalid", message: "Completează denumirea piesei.") }
        var p = input
        p.name = name
        save(p, updatedAt: Dates.instant())
        return p
    }

    /// Documents keep copies of their lines, so catalog items can always go.
    func deleteService(_ id: String) { delete(Service.self, id) }
    func deletePart(_ id: String) { delete(Part.self, id) }

    /// Goods received: adds stock and optionally updates the purchase cost.
    func receiveStock(_ partId: String, qty: Double, cost: Int?) throws {
        guard var p = get(Part.self, partId) else { throw DomainError(code: "not_found", message: "Piesa nu mai există.") }
        if !(qty > 0) { throw DomainError(code: "invalid", message: "Introdu cantitatea recepționată.") }
        p.stock = Money.jsRound((p.stock + qty) * 1000) / 1000
        if let cost { p.cost = cost }
        save(p, updatedAt: Dates.instant())
    }

    func newService() -> Service {
        Service(id: Ids.uid(), name: "", category: "maintenance", hours: 1, price: 0, cost: 0, parts: [])
    }

    func newPart() -> Part {
        Part(id: Ids.uid(), code: "", name: "", brand: "", unit: "buc", cost: 0, price: 0, stock: 0, minStock: 0, location: "")
    }
}
