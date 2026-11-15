import Foundation

// Port of saveCustomer, deleteCustomer, saveVehicle, recordMileage, deleteVehicle (src/lib/store/actions.js).

extension AppStore {
    @discardableResult
    func saveCustomer(_ input: Customer) throws -> Customer {
        let name = input.name.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty { throw DomainError(code: "invalid", message: "Completează numele clientului.") }
        let t = Dates.instant()
        var c = input
        c.name = name
        c.cui = c.cui.uppercased().filter { !$0.isWhitespace }
        if get(Customer.self, c.id) == nil { c.createdAt = t }
        save(c, updatedAt: t)
        return c
    }

    func newCustomer() -> Customer {
        Customer(id: Ids.uid(), type: "person", name: "", phone: "", email: "", address: "", city: "", county: "", cui: "", regCom: "",
                 notes: "", contactName: "", marketingConsent: false, createdAt: "")
    }

    /// Not with issued invoices or jobs; their cars, bookings and draft invoices go with them.
    func deleteCustomer(_ id: String) throws {
        if all(Invoice.self).contains(where: { $0.customerId == id && $0.status != "draft" }) {
            throw DomainError(code: "in_use", message: "Clientul are facturi emise, deci nu poate fi șters (evidență fiscală).")
        }
        if all(WorkOrder.self).contains(where: { $0.customerId == id }) {
            throw DomainError(code: "in_use", message: "Clientul are lucrări înregistrate. Păstrează-l în evidență.")
        }
        for v in all(Vehicle.self) where v.customerId == id { delete(Vehicle.self, v.id) }
        for a in all(Appointment.self) where a.customerId == id { delete(Appointment.self, a.id) }
        for i in all(Invoice.self) where i.customerId == id && i.status == "draft" { delete(Invoice.self, i.id) }
        delete(Customer.self, id)
    }

    func newVehicle(customerId: String?) -> Vehicle {
        Vehicle(id: Ids.uid(), customerId: customerId, plate: "", vin: "", make: "", model: "", engine: "", fuel: "", year: nil, color: "",
                notes: "", createdAt: "", mileage: [], itpExpiry: nil, rcaExpiry: nil, serviceIntervalKm: nil, serviceIntervalMonths: nil,
                lastServiceDate: nil, lastServiceKm: nil)
    }

    /// The plate is formatted and must be unique; the owner is required.
    @discardableResult
    func saveVehicle(_ input: Vehicle) throws -> Vehicle {
        let plate = People.formatPlate(input.plate)
        let key = People.normalizePlate(plate)
        if key.isEmpty { throw DomainError(code: "invalid", message: "Completează numărul de înmatriculare.") }
        if input.customerId == nil { throw DomainError(code: "invalid", message: "Alege proprietarul mașinii.") }
        if all(Vehicle.self).contains(where: { $0.id != input.id && People.normalizePlate($0.plate) == key }) {
            throw DomainError(code: "duplicate", message: "Există deja o mașină cu numărul \(plate).")
        }
        let t = Dates.instant()
        var v = input
        v.plate = plate
        v.vin = v.vin.uppercased().filter { !$0.isWhitespace }
        if get(Vehicle.self, v.id) == nil { v.createdAt = t }
        save(v, updatedAt: t)
        return v
    }

    /// A manual odometer reading; returns a warning when it is lower than the one before.
    @discardableResult
    func recordMileage(_ vehicleId: String, km: Int) throws -> String? {
        guard get(Vehicle.self, vehicleId) != nil else { throw DomainError(code: "not_found", message: "Mașina nu mai există.") }
        if km <= 0 { throw DomainError(code: "invalid", message: "Introdu kilometrajul.") }
        return addMileageReading(vehicleId: vehicleId, km: km, source: "manual", at: Dates.instant())
    }

    func deleteVehicle(_ id: String) throws {
        if all(Invoice.self).contains(where: { $0.vehicleId == id && $0.status != "draft" }) {
            throw DomainError(code: "in_use", message: "Mașina apare pe facturi emise și nu poate fi ștearsă.")
        }
        if all(WorkOrder.self).contains(where: { $0.vehicleId == id }) {
            throw DomainError(code: "in_use", message: "Mașina are lucrări înregistrate.")
        }
        for a in all(Appointment.self) where a.vehicleId == id { delete(Appointment.self, a.id) }
        delete(Vehicle.self, id)
    }
}
