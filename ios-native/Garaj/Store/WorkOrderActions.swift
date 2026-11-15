import Foundation

// Port of the job actions in src/lib/store/actions.js (createWorkOrder, updateWorkOrder,
// setWorkOrderStatus, deleteWorkOrder, restoreWorkOrder) and the line helpers.

extension AppStore {
    var shop: ShopSettings { ShopSettings(settings) }

    private func mustGet<T: Record>(_ type: T.Type, _ id: String, _ label: String) throws -> T {
        guard let record = get(T.self, id) else { throw DomainError(code: "not_found", message: "\(label) nu mai există.") }
        return record
    }

    // MARK: Lines from the catalog

    /// Labor line for a catalog service, plus the service package's parts.
    func linesFromService(_ serviceId: String, staffId: String? = nil) -> [Line] {
        guard let service = get(Service.self, serviceId) else { return [] }
        let s = shop
        let hours = service.hours > 0 ? service.hours : 1
        let price = service.price != 0 ? service.price : Lines.laborPrice(hours: hours, rate: s.laborRate)
        var lines = [Line(id: Ids.uid(), kind: "labor", refId: service.id,
                          description: service.name.trimmingCharacters(in: .whitespaces).isEmpty ? "Manoperă" : service.name,
                          qty: hours, unit: "h", unitPrice: Int(Money.jsRound(Double(price) / hours)),
                          vatRate: s.lineVatRate, cost: Int(Money.jsRound(Double(service.cost) / hours)), staffId: staffId)]
        for item in service.parts {
            if let partId = item["partId"]?.string, let line = lineFromPart(partId, qty: item["qty"]?.number ?? 1) {
                lines.append(line)
            }
        }
        return lines
    }

    /// Lines of an (edited) operation from a booking: its labor line, plus the catalog package's parts (linesFromOperation).
    func linesFromOperation(_ op: JSONObject, staffId: String? = nil) -> [Line] {
        let s = shop
        let hours = (op["hours"]?.number ?? 0) > 0 ? op["hours"]!.number! : 1
        let price = op["price"]?.number ?? 0
        let cost = op["cost"]?.number ?? 0
        let vat: Double = !s.vatPayer ? 0 : (op["vatRate"]?.number ?? s.vatRate)
        let name = (op["name"]?.string ?? "").trimmingCharacters(in: .whitespaces)
        var lines = [Line(id: Ids.uid(), kind: "labor", refId: op["serviceId"]?.string, description: name.isEmpty ? "Manoperă" : name,
                          qty: hours, unit: "h", unitPrice: Int(Money.jsRound(price / hours)), vatRate: vat,
                          cost: Int(Money.jsRound(cost / hours)), staffId: staffId)]
        for item in get(Service.self, op["serviceId"]?.string)?.parts ?? [] {
            if let partId = item["partId"]?.string, let line = lineFromPart(partId, qty: item["qty"]?.number ?? 1) { lines.append(line) }
        }
        return lines
    }

    func lineFromPart(_ partId: String, qty: Double = 1) -> Line? {
        guard let part = get(Part.self, partId) else { return nil }
        return Line(id: Ids.uid(), kind: "part", refId: part.id,
                    description: [part.name, part.brand].filter { !$0.isEmpty }.joined(separator: " "),
                    qty: qty, unit: part.unit.isEmpty ? "buc" : part.unit, unitPrice: part.price,
                    vatRate: shop.lineVatRate, cost: part.cost)
    }

    func blankLine(_ kind: String = "labor") -> Line {
        Line(id: Ids.uid(), kind: kind, description: "", qty: 1, unit: kind == "labor" ? "h" : "buc",
             unitPrice: kind == "labor" ? shop.laborRate : 0, vatRate: shop.lineVatRate)
    }

    // MARK: Jobs

    /// Opens a job with the next number (meta.counters.workOrders) and logs the mileage on the car.
    @discardableResult
    func createWorkOrder(customerId: String?, vehicleId: String?, complaint: String = "", mileage: Int? = nil,
                         staffId: String? = nil, serviceIds: [String] = [], status: String = "estimate") throws -> (order: WorkOrder, warning: String?) {
        guard let customerId else { throw DomainError(code: "invalid", message: "Alege clientul.") }
        guard let vehicleId else { throw DomainError(code: "invalid", message: "Alege mașina.") }
        _ = try mustGet(Vehicle.self, vehicleId, "Mașina")
        let t = Dates.instant()
        var warning: String?
        if let km = mileage, km > 0 { warning = addMileageReading(vehicleId: vehicleId, km: km, source: "workOrder", at: t) }

        var counters = meta["counters"]?.object ?? [:]
        let number = Int(counters["workOrders"]?.number ?? 1)
        counters["workOrders"] = .number(Double(number + 1))
        setMeta("counters", .object(counters))

        let order = WorkOrder(
            id: Ids.uid(), number: number, status: status, customerId: customerId, vehicleId: vehicleId,
            appointmentId: nil, staffId: staffId, bayId: nil, mileage: (mileage ?? 0) > 0 ? mileage : nil, fuelLevel: nil,
            complaint: complaint.trimmingCharacters(in: .whitespacesAndNewlines), diagnosis: "",
            lines: serviceIds.flatMap { linesFromService($0, staffId: staffId) }, notes: "", invoiceId: nil,
            createdAt: t, updatedAt: t, dates: [status: .string(t)],
            activity: [.object(["at": .string(t), "type": .string("created")])],
            inspection: WorkOrderRules.defaultInspection())
        save(order)
        return (order, warning)
    }

    /// Edits a job; a delivered or cancelled one only takes notes.
    func updateWorkOrder(_ order: WorkOrder) throws {
        guard let stored = get(WorkOrder.self, order.id) else { throw DomainError(code: "not_found", message: "Lucrarea nu mai există.") }
        if WorkOrderRules.isLocked(stored.status) {
            var onlyNotes = stored
            onlyNotes.notes = order.notes
            guard onlyNotes == order else { throw DomainError(code: "locked", message: "Lucrarea este închisă și nu mai poate fi modificată.") }
        }
        var next = order
        next.updatedAt = Dates.instant()
        save(next)
    }

    /// What a status change replaced, for its undo.
    struct StatusUndo { let order: WorkOrder; let appointment: Appointment? }

    /// Moves a job. The booking follows: done when the car is handed over, back in the shop when reopened.
    @discardableResult
    func setWorkOrderStatus(_ id: String, to: String, reason: String = "") throws -> StatusUndo {
        let order = try mustGet(WorkOrder.self, id, "Lucrarea")
        guard WorkOrderRules.canTransition(order.status, to) else {
            throw DomainError(code: "invalid_transition", message: "Lucrarea nu poate trece în această stare.")
        }
        let t = Dates.instant()
        var entry: JSONObject = ["at": .string(t), "type": .string("status"), "from": .string(order.status), "to": .string(to)]
        let skipped = WorkOrderRules.skipped(order.status, to)
        if !skipped.isEmpty { entry["skipped"] = .array(skipped.map(JSONValue.string)) }
        let why = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        if !why.isEmpty { entry["reason"] = .string(why) }
        var next = order
        next.status = to
        next.dates[to] = .string(t)
        next.activity.append(.object(entry))
        next.updatedAt = t

        let appointment = get(Appointment.self, order.appointmentId)
        if var a = appointment {
            var follow: String?
            if to == "delivered" && a.status == "arrived" { follow = "done" }
            if order.status == "delivered" && to != "delivered" && a.status == "done" { follow = "arrived" }
            if let follow {
                a.activity.append(.object(["at": .string(t), "type": .string("status"), "from": .string(a.status), "to": .string(follow)]))
                a.status = follow
                save(a, updatedAt: t)
            }
        }
        save(next)
        return StatusUndo(order: order, appointment: appointment)
    }

    /// Puts a job (and its booking) back as they were: the undo of a status change.
    func restore(_ undo: StatusUndo) throws {
        guard get(WorkOrder.self, undo.order.id) != nil else { throw DomainError(code: "not_found", message: "Lucrarea nu mai există.") }
        let t = Dates.instant()
        var order = undo.order
        order.updatedAt = t
        save(order)
        if let a = undo.appointment, get(Appointment.self, a.id) != nil { save(a, updatedAt: t) }
    }

    /// Only an unapproved estimate or a cancelled job, without an invoice; its booking goes back to before check-in.
    func deleteWorkOrder(_ id: String) throws {
        let order = try mustGet(WorkOrder.self, id, "Lucrarea")
        guard WorkOrderRules.canDelete(status: order.status, invoiceId: order.invoiceId) else {
            throw DomainError(code: "in_use", message: "Doar devizele neaprobate sau lucrările anulate, fără factură, pot fi șterse.")
        }
        if var a = get(Appointment.self, order.appointmentId) {
            let t = Dates.instant()
            let checkIn = a.activity.last { $0["type"]?.string == "checked_in" }
            let from = checkIn?["from"]?.string
            let status = from == "scheduled" || from == "confirmed" ? from! : "confirmed"
            a.activity.append(.object(["at": .string(t), "type": .string("status"), "from": .string(a.status), "to": .string(status)]))
            a.status = status
            a.workOrderId = nil
            save(a, updatedAt: t)
        }
        delete(WorkOrder.self, id)
    }

    // MARK: Cars

    /// Adds a mileage reading to the car's log (vehicle.js addReading); returns a warning when it goes down.
    @discardableResult
    func addMileageReading(vehicleId: String, km: Int, source: String, at t: String) -> String? {
        guard var raw = collections[.vehicles]?[vehicleId]?.object else { return nil }
        let date = Dates.today()
        var log = raw["mileage"]?.array ?? []
        let reading = JSONValue.object(["date": .string(date), "km": .number(Double(km)), "source": .string(source)])
        // Stable insert after every reading of the same or an earlier day (JS sort is stable).
        let index = log.firstIndex { ($0["date"]?.string ?? "") > date } ?? log.count
        log.insert(reading, at: index)
        var warning: String?
        if index > 0, let prevKm = log[index - 1]["km"]?.number, Double(km) < prevKm {
            let f = { (n: Double) in n.formatted(.number.locale(Locale(identifier: "ro_RO"))) }
            warning = "Kilometrajul (\(f(Double(km))) km) e mai mic decât citirea din \(log[index - 1]["date"]?.string ?? "") (\(f(prevKm)) km)."
        }
        raw["mileage"] = .array(log)
        raw["updatedAt"] = .string(t)
        put(.vehicles, .object(raw))
        return warning
    }
}
