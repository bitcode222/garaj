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

extension AppStore {
    /// What a booking form edits.
    struct BookingInput {
        var customerId: String?
        var vehicleId: String?
        var start: String
        var end: String
        var title = ""
        var notes = ""
        var staffId: String?
        var bayId: String?
        var serviceIds: [String] = []
    }

    private func conflicts(of a: Appointment) -> [Appointment] {
        let day = Dates.dayOfInstant(a.start)
        return AppointmentRules.conflicts(a, among: all(Appointment.self).filter { Dates.dayOfInstant($0.start) == day })
    }

    /// A new booking with the next number; bookings saved before numbering get theirs first, oldest first.
    @discardableResult
    func createAppointment(_ input: BookingInput) throws -> (appointment: Appointment, conflicts: [Appointment]) {
        if let p = AppointmentRules.problem(start: input.start, end: input.end, customerId: input.customerId) { throw DomainError(code: "invalid", message: p) }
        var counters = meta["counters"]?.object ?? [:]
        var number: Int
        if let n = counters["appointments"]?.number { number = Int(n) } else {
            let existing = all(Appointment.self)
            number = max(1, (existing.compactMap(\.number).max() ?? 0) + 1)
            let when = { (a: Appointment) in a.createdAt.isEmpty ? a.start : a.createdAt }
            for var old in existing.filter({ $0.number == nil }).sorted(by: { when($0) == when($1) ? $0.id < $1.id : when($0) < when($1) }) {
                old.number = number
                number += 1
                save(old)
            }
        }
        counters["appointments"] = .number(Double(number + 1))
        setMeta("counters", .object(counters))
        let t = Dates.instant()
        var a = Appointment(id: Ids.uid(), start: input.start, end: input.end, customerId: input.customerId, vehicleId: input.vehicleId,
                            title: input.title, status: "scheduled", workOrderId: nil, staffId: input.staffId, bayId: input.bayId,
                            activity: [.object(["at": .string(t), "type": .string("created")])], expectedAt: nil, notes: input.notes,
                            serviceIds: input.serviceIds, createdAt: t)
        a.number = number
        save(a, updatedAt: t)
        return (a, conflicts(of: a))
    }

    /// Saves an edited booking. Returns it as it was before (undo) and what it now overlaps.
    @discardableResult
    func saveAppointment(_ id: String, _ input: BookingInput) throws -> (previous: Appointment, conflicts: [Appointment]) {
        guard let before = get(Appointment.self, id) else { throw DomainError(code: "not_found", message: "Programarea nu mai există.") }
        if let p = AppointmentRules.problem(start: input.start, end: input.end, customerId: input.customerId) { throw DomainError(code: "invalid", message: p) }
        var a = before
        a.customerId = input.customerId; a.vehicleId = input.vehicleId; a.start = input.start; a.end = input.end
        a.title = input.title; a.notes = input.notes; a.staffId = input.staffId; a.bayId = input.bayId
        if a.serviceIds != input.serviceIds { a.serviceIds = input.serviceIds }
        save(a, updatedAt: Dates.instant())
        return (before, conflicts(of: a))
    }

    /// A new time (rescheduleAppointment): confirmed stays confirmed only if the customer knows; a cancelled or missed one is booked again.
    @discardableResult
    func reschedule(_ id: String, start: String, end: String, customerKnows: Bool = false) throws -> Appointment {
        guard let before = get(Appointment.self, id) else { throw DomainError(code: "not_found", message: "Programarea nu mai există.") }
        if before.status == "arrived" { throw DomainError(code: "invalid_transition", message: "Mașina e deja în service.") }
        if before.status == "done" { throw DomainError(code: "invalid_transition", message: "Vizita s-a încheiat.") }
        if !(start < end) { throw DomainError(code: "invalid", message: "Ora de sfârșit trebuie să fie după ora de început.") }
        let t = Dates.instant()
        var a = before
        a.status = before.status == "confirmed" && customerKnows ? "confirmed" : "scheduled"
        a.activity.append(.object(["at": .string(t), "type": .string("rescheduled"),
                                   "from": .object(["start": .string(before.start), "end": .string(before.end)]),
                                   "to": .object(["start": .string(start), "end": .string(end)]), "customerKnows": .bool(customerKnows)]))
        a.start = start; a.end = end; a.expectedAt = nil; a.cancelReason = .null
        save(a, updatedAt: t)
        return before
    }

    /// Calls a booking off with a reason (callOffAppointment, "cancelled").
    @discardableResult
    func cancelAppointment(_ id: String, reason: String?, note: String = "") throws -> Appointment {
        guard let before = get(Appointment.self, id) else { throw DomainError(code: "not_found", message: "Programarea nu mai există.") }
        guard AppointmentRules.canMove(before.status, "cancelled") else { throw DomainError(code: "invalid_transition", message: "Programarea nu poate trece în această stare.") }
        let t = Dates.instant()
        let why = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let reasonJSON: JSONValue = reason != nil || !why.isEmpty ? .object(["code": reason.map(JSONValue.string) ?? .null, "note": .string(why)]) : .null
        var a = before
        var entry: JSONObject = ["at": .string(t), "type": .string("status"), "from": .string(before.status), "to": .string("cancelled")]
        if reasonJSON != .null { entry["reason"] = reasonJSON }
        a.activity.append(.object(entry))
        a.status = "cancelled"; a.cancelReason = reasonJSON; a.expectedAt = nil
        save(a, updatedAt: t)
        return before
    }

    func deleteAppointment(_ id: String) throws {
        guard let a = get(Appointment.self, id) else { throw DomainError(code: "not_found", message: "Programarea nu mai există.") }
        if a.workOrderId != nil { throw DomainError(code: "in_use", message: "Programarea are o lucrare deschisă. Anulează-o în loc să o ștergi.") }
        delete(Appointment.self, id)
    }
}
