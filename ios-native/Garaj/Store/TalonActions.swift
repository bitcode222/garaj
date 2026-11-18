import Foundation

// A scanned talon (Scan/TalonParser.swift) becomes a car and its owner. iPhone only: the web app has no scanner.

extension AppStore {
    /// The car the talon is about: same plate, else same VIN.
    func vehicleMatching(_ t: TalonData) -> Vehicle? {
        let plate = People.normalizePlate(t.plate)
        let vin = t.vin.uppercased()
        return all(Vehicle.self).first { !plate.isEmpty && People.normalizePlate($0.plate) == plate }
            ?? all(Vehicle.self).first { vin.count == 17 && $0.vin.uppercased() == vin }
    }

    /// A client with the same name, ignoring case and diacritics.
    func customerMatching(name: String) -> Customer? {
        let key = Search.fold(name).split(separator: " ").joined(separator: " ")
        guard !key.isEmpty else { return nil }
        return all(Customer.self).first { Search.fold($0.name).split(separator: " ").joined(separator: " ") == key }
    }

    /// Saves what was read: the owner (an existing client by name, else a new one) and the car (the matching one
    /// updated with every field that was read, else a new one). Checks the plate before writing anything.
    @discardableResult
    func saveTalon(_ t: TalonData) throws -> Vehicle {
        let existing = vehicleMatching(t)
        let plate = People.formatPlate(t.plate.isEmpty ? existing?.plate ?? "" : t.plate)
        if People.normalizePlate(plate).isEmpty { throw DomainError(code: "invalid", message: "Completează numărul de înmatriculare.") }
        if all(Vehicle.self).contains(where: { $0.id != existing?.id && People.normalizePlate($0.plate) == People.normalizePlate(plate) }) {
            throw DomainError(code: "duplicate", message: "Există deja o mașină cu numărul \(plate).")
        }
        let name = t.owner.trimmingCharacters(in: .whitespaces)
        var ownerId = existing?.customerId
        if !name.isEmpty {
            if let found = customerMatching(name: name) {
                ownerId = found.id
                if found.address.isEmpty, !t.address.isEmpty {
                    var c = found
                    c.address = t.address
                    try saveCustomer(c)
                }
            } else {
                var c = newCustomer()
                c.name = name
                c.address = t.address
                c.type = name.range(of: #"\b(SRL|SA|PFA|II|IF|SNC|SCS)\b"#, options: [.regularExpression, .caseInsensitive]) != nil ? "company" : "person"
                ownerId = try saveCustomer(c).id
            }
        }
        guard let ownerId else { throw DomainError(code: "invalid", message: "Completează proprietarul mașinii.") }
        var v = existing ?? newVehicle(customerId: ownerId)
        v.customerId = ownerId
        v.plate = plate
        if !t.vin.isEmpty { v.vin = t.vin }
        if !t.make.isEmpty { v.make = t.make }
        if !t.model.isEmpty { v.model = t.model }
        if let y = t.year { v.year = y }
        if !t.engine.isEmpty { v.engine = t.engine }
        if !t.fuel.isEmpty { v.fuel = t.fuel }
        if !t.color.isEmpty { v.color = t.color }
        return try saveVehicle(v)
    }
}
