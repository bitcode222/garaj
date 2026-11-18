import Foundation

// A scanned talon (Scan/TalonParser.swift) becomes a car and its client. iPhone only: the web app has no scanner.

/// Who the car belongs to after the scan.
enum TalonClient: Hashable {
    case existing(String)
    /// A new client from the name on the talon.
    case new
}

/// What the app already knows about the talon's car, for the check screen to show before anything is saved.
struct TalonReview {
    /// The car this talon is about: the same VIN, else the same plate.
    var match: Vehicle?
    /// Another car already carries the talon's plate (the plate moved, or the VIN was misread).
    var plateTakenBy: Vehicle?
    /// Matched by plate, but the car on file has another VIN: maybe a different car with a moved plate.
    var vinDiffers: Bool
    /// Another car already has the talon's VIN (scanning onto a chosen car: it is probably that other car's talon).
    var vinTakenBy: Vehicle?
    /// The fields the talon would change on `match`, by their labels.
    var changes: [String]
    var currentOwner: Customer?
    /// Clients with the talon's name (ignoring case and diacritics); more than one when namesakes exist.
    var nameMatches: [Customer]
    /// A job on the car that is not handed over yet.
    var openJob: WorkOrder?
    /// The car's next booking still to come.
    var nextBooking: Appointment?
}

extension AppStore {
    /// `vehicleId`: the talon is scanned onto this car (from its page), so it is the match whatever was read.
    func talonReview(_ t: TalonData, for vehicleId: String? = nil) -> TalonReview {
        let plate = People.normalizePlate(t.plate)
        let vin = t.vin.uppercased()
        let cars = all(Vehicle.self)
        let byVin = vin.count == 17 ? cars.first { $0.vin.uppercased() == vin } : nil
        let byPlate = plate.isEmpty ? nil : cars.first { People.normalizePlate($0.plate) == plate }
        let chosen = vehicleId.flatMap { get(Vehicle.self, $0) }
        let match = chosen ?? byVin ?? byPlate
        var changes: [String] = []
        if let m = match {
            let differs = { (new: String, old: String) in !new.isEmpty && Search.fold(new) != Search.fold(old) }
            if !plate.isEmpty && People.normalizePlate(m.plate) != plate { changes.append("Nr. înmatriculare") }
            if differs(t.vin, m.vin) { changes.append("VIN") }
            if differs(t.make, m.make) { changes.append("Marcă") }
            if differs(t.model, m.model) { changes.append("Model") }
            if let y = t.year, y != m.year { changes.append("An") }
            if differs(t.engine, m.engine) { changes.append("Motor") }
            if !t.fuel.isEmpty && t.fuel != m.fuel { changes.append("Combustibil") }
            if differs(t.color, m.color) { changes.append("Culoare") }
        }
        let shopStages = Set(Agenda.shopStages)
        let now = Dates.instant()
        return TalonReview(
            match: match,
            plateTakenBy: byPlate.flatMap { $0.id == match?.id ? nil : $0 },
            vinDiffers: (chosen != nil || byVin == nil) && vin.count == 17 && !(match?.vin.isEmpty ?? true) && match?.vin.uppercased() != vin,
            vinTakenBy: byVin.flatMap { $0.id == match?.id ? nil : $0 },
            changes: changes,
            currentOwner: get(Customer.self, match?.customerId),
            nameMatches: customersNamed(t.owner),
            openJob: match.flatMap { m in all(WorkOrder.self).filter { $0.vehicleId == m.id && shopStages.contains($0.status) }.max { $0.number < $1.number } },
            nextBooking: match.flatMap { m in
                all(Appointment.self).filter { $0.vehicleId == m.id && $0.start >= now && ["scheduled", "confirmed"].contains($0.status) }.min { $0.start < $1.start }
            })
    }

    /// Clients with this name, ignoring case, diacritics and extra spaces.
    func customersNamed(_ name: String) -> [Customer] {
        let key = Search.fold(name).split(separator: " ").joined(separator: " ")
        guard !key.isEmpty else { return [] }
        return all(Customer.self).filter { Search.fold($0.name).split(separator: " ").joined(separator: " ") == key }
    }

    /// Saves what was read: the client (the chosen one, or a new one from the talon's name) and the car (the
    /// matching one updated with every field that was read, else a new one). Checks everything before writing.
    @discardableResult
    func saveTalon(_ t: TalonData, client: TalonClient, into vehicleId: String? = nil) throws -> Vehicle {
        let review = talonReview(t, for: vehicleId)
        let existing = review.match
        let plate = People.formatPlate(t.plate.isEmpty ? existing?.plate ?? "" : t.plate)
        if People.normalizePlate(plate).isEmpty { throw DomainError(code: "invalid", message: "Completează numărul de înmatriculare.") }
        if let other = all(Vehicle.self).first(where: { $0.id != existing?.id && People.normalizePlate($0.plate) == People.normalizePlate(plate) }) {
            throw DomainError(code: "duplicate", message: "Numărul \(plate) e deja pe altă mașină (\(other.title.nonEmpty ?? "fără model")). Verifică numărul sau VIN-ul.")
        }
        if let other = review.vinTakenBy {
            throw DomainError(code: "duplicate", message: "VIN-ul \(t.vin) e deja pe mașina \(People.formatPlate(other.plate)) (\(other.title.nonEmpty ?? "fără model")). Talonul pare al acelei mașini.")
        }
        let ownerId: String
        switch client {
        case .existing(let id):
            guard var c = get(Customer.self, id) else { throw DomainError(code: "not_found", message: "Clientul ales nu mai există.") }
            if c.address.isEmpty, !t.address.isEmpty, Search.fold(c.name) == Search.fold(t.owner) {
                c.address = t.address
                try saveCustomer(c)
            }
            ownerId = id
        case .new:
            let name = t.owner.trimmingCharacters(in: .whitespaces)
            if name.isEmpty { throw DomainError(code: "invalid", message: "Completează numele clientului.") }
            var c = newCustomer()
            c.name = name
            c.address = t.address
            c.type = name.range(of: #"\b(SRL|SA|PFA|II|IF|SNC|SCS)\b"#, options: [.regularExpression, .caseInsensitive]) != nil ? "company" : "person"
            ownerId = try saveCustomer(c).id
        }
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
