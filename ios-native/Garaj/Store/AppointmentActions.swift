import Foundation

// Port of the booking moves in src/domain/appointment.js and src/lib/store/actions.js
// (setAppointmentStatus, callOffAppointmentById, checkInAppointment).

enum AppointmentRules {
    static let transitions: [String: [String]] = [
        "scheduled": ["confirmed", "arrived", "no_show", "cancelled"],
        "confirmed": ["scheduled", "arrived", "no_show", "cancelled"],
        "arrived": ["done"],
        "done": [],
        "no_show": ["scheduled"],
        "cancelled": ["scheduled"],
    ]

    static func canMove(_ from: String, _ to: String) -> Bool { transitions[from]?.contains(to) ?? false }
}

extension AppStore {
    /// Moves a booking (setAppointmentStatus); back to "programat" clears the cancel reason. Returns the booking before, for undo.
    @discardableResult
    func setAppointmentStatus(_ id: String, to: String) throws -> Appointment {
        guard let a = get(Appointment.self, id) else { throw DomainError(code: "not_found", message: "Programarea nu mai există.") }
        if a.status == to { return a }
        guard AppointmentRules.canMove(a.status, to) else { throw DomainError(code: "invalid_transition", message: "Programarea nu poate trece în această stare.") }
        let t = Dates.instant()
        var next = a
        next.activity.append(.object(["at": .string(t), "type": .string("status"), "from": .string(a.status), "to": .string(to)]))
        next.status = to
        save(next, updatedAt: t)
        if to == "scheduled", case .object(var raw)? = collections[.appointments]?[id] {
            raw["cancelReason"] = .null
            put(.appointments, .object(raw))
        }
        return a
    }

    /// The customer didn't come (callOffAppointment with "no_show"); refused before the booking's time.
    @discardableResult
    func markNoShow(_ id: String) throws -> Appointment {
        guard let a = get(Appointment.self, id) else { throw DomainError(code: "not_found", message: "Programarea nu mai există.") }
        let t = Dates.instant()
        if a.start > t { throw DomainError(code: "invalid", message: "Programarea nu a început încă: anuleaz-o în loc.") }
        guard AppointmentRules.canMove(a.status, "no_show") else { throw DomainError(code: "invalid_transition", message: "Programarea nu poate trece în această stare.") }
        var next = a
        next.activity.append(.object(["at": .string(t), "type": .string("status"), "from": .string(a.status), "to": .string("no_show")]))
        next.status = "no_show"
        next.expectedAt = nil
        save(next, updatedAt: t)
        return a
    }

    /// Puts a booking back as it was (undo of a move).
    func restore(_ appointment: Appointment) {
        save(appointment, updatedAt: Dates.instant())
    }

    /// The booked car arrived: opens its job (status Deviz) and the booking becomes "Sosit".
    @discardableResult
    func checkIn(_ appointmentId: String, mileage: Int? = nil, complaint: String? = nil, vehicleId: String? = nil) throws -> WorkOrder {
        guard var a = get(Appointment.self, appointmentId) else { throw DomainError(code: "not_found", message: "Programarea nu mai există.") }
        if a.workOrderId != nil { throw DomainError(code: "exists", message: "Mașina are deja o lucrare deschisă din această programare.") }
        guard let car = a.vehicleId ?? vehicleId else { throw DomainError(code: "invalid", message: "Alege mașina care a sosit.") }
        let raw = collections[.appointments]?[appointmentId]
        let operations = raw?["operations"]?.array?.compactMap(\.object)
        let serviceIds = operations == nil ? (raw?["serviceIds"]?.array?.compactMap(\.string) ?? []) : []
        var (order, _) = try createWorkOrder(customerId: a.customerId, vehicleId: car, complaint: complaint ?? a.title, mileage: mileage,
                                             staffId: a.staffId, serviceIds: serviceIds)
        if let operations { order.lines = operations.flatMap { linesFromOperation($0, staffId: a.staffId) } }
        order.appointmentId = a.id
        order.bayId = a.bayId
        save(order)
        let t = Dates.instant()
        a.activity.append(.object(["at": .string(t), "type": .string("checked_in"), "from": .string(a.status)]))
        a.vehicleId = a.vehicleId ?? car
        a.status = "arrived"
        a.workOrderId = order.id
        a.expectedAt = nil
        save(a, updatedAt: t)
        return order
    }
}
