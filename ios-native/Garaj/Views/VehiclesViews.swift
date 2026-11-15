import SwiftUI

/// Mașini: every car with its ITP, RCA and service at a glance.
struct VehiclesView: View {
    @Environment(AppStore.self) private var store
    @State private var query = ""
    @State private var creating: Vehicle?

    var body: some View {
        let owners = Dictionary(store.all(Customer.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let tokens = Search.tokens(query)
        let vehicles = store.all(Vehicle.self)
            .filter { v in
                tokens.isEmpty || Search.matches(Search.fold([v.plate, People.normalizePlate(v.plate), v.title, v.vin, owners[v.customerId ?? ""]?.name ?? ""].joined(separator: " ")), tokens)
            }
            .sorted { $0.plate < $1.plate }
        List(vehicles) { v in
            NavigationLink { VehicleDetailView(id: v.id) } label: { VehicleRow(vehicle: v, owner: owners[v.customerId ?? ""]?.name) }
        }
        .overlay { if vehicles.isEmpty { query.isEmpty ? AnyView(ContentUnavailableView("Nicio mașină", systemImage: "car")) : AnyView(ContentUnavailableView.search(text: query)) } }
        .band(200)
        .navigationTitle("Mașini")
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Număr, marcă, VIN, proprietar")
        .toolbar { Button { creating = store.newVehicle(customerId: nil) } label: { Label("Mașină nouă", systemImage: "plus") } }
        .sheet(item: $creating) { VehicleForm(vehicle: $0, isNew: true) }
    }
}

struct VehicleRow: View {
    let vehicle: Vehicle
    var owner: String?

    var body: some View {
        let today = Dates.today()
        let itp = People.deadline(vehicle.itpExpiry, today: today)
        let rca = People.deadline(vehicle.rcaExpiry, today: today)
        let service = People.serviceDue(vehicle, today: today)
        let km = People.estimateKm(vehicle, today: today) ?? vehicle.mileage.last?.km
        HStack(spacing: 12) {
            MakeLogo(make: vehicle.make)
            VStack(alignment: .leading, spacing: 3) {
                Text(People.formatPlate(vehicle.plate)).font(.body.weight(.semibold)).tracking(0.4)
                Text([vehicle.title, owner].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                if let flag = Self.flag(itp: itp, rca: rca, service: service) {
                    StatusPill(style: flag).padding(.top, 2)
                }
            }
            Spacer(minLength: 4)
            if let km { Text("\(km.formatted(.number.locale(Locale(identifier: "ro_RO")))) km").foregroundStyle(.secondary).monospacedDigit() }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }

    /// The most urgent of ITP, RCA and service, as a capsule (expired first, then the nearest).
    static func flag(itp: People.Deadline, rca: People.Deadline, service: People.ServiceDue) -> StatusStyle? {
        let days = { (n: Int) in n == 1 ? "o zi" : "\(n) zile" }
        if itp.status == "expired" { return StatusStyle(label: "ITP expirat", symbol: "", color: .red) }
        if rca.status == "expired" { return StatusStyle(label: "RCA expirat", symbol: "", color: .red) }
        if service.status == "expired" || service.status == "overdue" { return StatusStyle(label: "Revizie depășită", symbol: "", color: .red) }
        var soon: [(Int, StatusStyle)] = []
        if itp.status == "soon", let d = itp.days { soon.append((d, StatusStyle(label: "ITP în \(days(d))", symbol: "", color: .orange))) }
        if rca.status == "soon", let d = rca.days { soon.append((d, StatusStyle(label: "RCA în \(days(d))", symbol: "", color: .purple))) }
        if service.status == "soon" {
            let label = service.kmLeft.map { "Revizie în ~\(max(0, $0).formatted(.number.locale(Locale(identifier: "ro_RO")))) km" } ?? "Revizie curând"
            soon.append((service.days ?? 999, StatusStyle(label: label, symbol: "", color: .blue)))
        }
        return soon.min { $0.0 < $1.0 }?.1
    }
}

struct VehicleDetailView: View {
    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo
    @Environment(\.dismiss) private var dismiss
    let id: String
    @State private var editing: Vehicle?
    @State private var reading = ""
    @State private var confirmDelete = false
    @State private var error: String?

    var body: some View {
        if let v = store.get(Vehicle.self, id) { content(v) } else { ContentUnavailableView("Mașina nu mai există", systemImage: "car") }
    }

    private func content(_ v: Vehicle) -> some View {
        let today = Dates.today()
        let owner = store.get(Customer.self, v.customerId)
        let service = People.serviceDue(v, today: today)
        let orders = store.all(WorkOrder.self).filter { $0.vehicleId == v.id }.sorted { $0.number > $1.number }
        let km = { (n: Int) in "\(n.formatted(.number.locale(Locale(identifier: "ro_RO")))) km" }
        return List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text(People.formatPlate(v.plate))
                        .font(.title.weight(.bold))
                        .padding(.horizontal, 12).padding(.vertical, 4)
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(.primary, lineWidth: 2))
                    Text([v.title, v.year.map(String.init), v.engine, Inventory.fuels.first { $0.key == v.fuel }?.label ?? v.fuel].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.subheadline).foregroundStyle(.secondary)
                    if !v.vin.isEmpty { Text("VIN \(v.vin)").font(.caption.monospaced()).foregroundStyle(.secondary).textSelection(.enabled) }
                }
                .padding(.vertical, 4)
                if let owner {
                    NavigationLink { CustomerDetailView(id: owner.id) } label: { LabeledContent("Proprietar", value: owner.name) }
                }
            }
            Section(header: CapsHeader("Termene")) {
                DeadlineRow(title: "ITP", date: v.itpExpiry, d: People.deadline(v.itpExpiry, today: today))
                DeadlineRow(title: "RCA", date: v.rcaExpiry, d: People.deadline(v.rcaExpiry, today: today))
                LabeledContent {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(service.status == "unknown" ? "fără date" : Dates.display(service.dueDate)).foregroundStyle(color(service.status))
                        if let left = service.kmLeft { Text(left < 0 ? "depășită cu \(km(-left))" : "încă ~\(km(left))").font(.caption).foregroundStyle(.secondary) }
                    }
                } label: { Text("Revizie") }
            }
            Section {
                ForEach(v.mileage.reversed(), id: \.self) { r in
                    LabeledContent(Dates.display(r.date)) { Text(km(r.km)).monospacedDigit() }
                }
                HStack {
                    TextField("Kilometraj de azi", text: $reading).keyboardType(.numberPad)
                    Button("Salvează") {
                        guard let n = Int(reading.filter(\.isNumber)) else { return }
                        do {
                            if let warning = try store.recordMileage(v.id, km: n) { undo.show(warning) }
                            reading = ""
                        } catch { self.error = error.localizedDescription }
                    }
                    .disabled(Int(reading.filter(\.isNumber)) == nil)
                }
            } header: { CapsHeader("Kilometraj") } footer: {
                if let est = People.estimateKm(v, today: today), let last = v.mileage.last, last.date != today { Text("Azi, estimat: ~\(km(est))") }
            }
            if !orders.isEmpty {
                Section(header: CapsHeader("Lucrări")) {
                    ForEach(orders) { o in
                        NavigationLink { WorkOrderDetailView(id: o.id) } label: {
                            LabeledContent {
                                Text(Labels.workOrder(o.status).label).foregroundStyle(Labels.workOrder(o.status).color)
                            } label: {
                                Text(verbatim: "#\(o.number) · \(Dates.display(Dates.dayOfInstant(o.createdAt)))")
                                Text(o.complaint).lineLimit(1)
                            }
                        }
                    }
                }
            }
            if !v.notes.isEmpty { Section(header: CapsHeader("Note")) { Text(v.notes) } }
            Section { Button("Șterge mașina", role: .destructive) { confirmDelete = true } }
        }
        .listStyle(.insetGrouped)
        .band(200)
        .navigationTitle(People.formatPlate(v.plate))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { Button("Editează") { editing = v } }
        .sheet(item: $editing) { VehicleForm(vehicle: $0, isNew: false) }
        .confirmationDialog("Ștergi mașina?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Șterge", role: .destructive) { do { try store.deleteVehicle(v.id); dismiss() } catch { self.error = error.localizedDescription } }
        } message: { Text("Se șterg și programările ei.") }
        .alert("Nu se poate", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK", role: .cancel) {} } message: { Text(error ?? "") }
    }

    private func color(_ status: String) -> Color { status == "expired" ? .red : status == "soon" ? .orange : status == "ok" ? .green : .secondary }
}

private struct DeadlineRow: View {
    let title: String
    let date: String?
    let d: People.Deadline

    var body: some View {
        LabeledContent {
            VStack(alignment: .trailing, spacing: 2) {
                Text(date.map { Dates.display($0) } ?? "necompletat").foregroundStyle(d.status == "expired" ? .red : d.status == "soon" ? .orange : d.status == "ok" ? .primary : .secondary)
                if let days = d.days {
                    Text(days < 0 ? "expirat de \(-days) zile" : days == 0 ? "expiră azi" : "în \(days) zile").font(.caption).foregroundStyle(.secondary)
                }
            }
        } label: {
            Label(title, systemImage: d.status == "expired" ? "exclamationmark.triangle.fill" : d.status == "soon" ? "clock.badge.exclamationmark" : "checkmark.seal")
                .foregroundStyle(d.status == "expired" ? .red : d.status == "soon" ? .orange : .primary)
        }
    }
}

/// New or edited car: plate (unique), owner, make/model, VIN (checked as you type), deadlines, service interval.
struct VehicleForm: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var vehicle: Vehicle
    let isNew: Bool
    @State private var year = ""
    @State private var lastKm = ""
    @State private var error: String?

    var body: some View {
        let vin = People.vinIssue(vehicle.vin)
        let duplicate = store.all(Vehicle.self).contains { $0.id != vehicle.id && !vehicle.plate.isEmpty && People.normalizePlate($0.plate) == People.normalizePlate(vehicle.plate) }
        NavigationStack {
            Form {
                Section {
                    TextField("Număr de înmatriculare", text: $vehicle.plate).textInputAutocapitalization(.characters).font(.title3.weight(.semibold))
                    NavigationLink {
                        SearchPicker(title: "Proprietar", items: store.all(Customer.self).sorted { $0.name < $1.name }, text: { $0.name }, detail: { People.formatPhone($0.phone) }, selection: $vehicle.customerId)
                    } label: { LabeledContent("Proprietar", value: store.get(Customer.self, vehicle.customerId)?.name ?? "Alege") }
                } footer: { if duplicate { Text("Există deja o mașină cu acest număr.").foregroundStyle(.red) } }
                Section {
                    TextField("Marcă", text: $vehicle.make)
                    TextField("Model", text: $vehicle.model)
                    TextField("An", text: $year).keyboardType(.numberPad)
                    TextField("Motor", text: $vehicle.engine)
                    Picker("Combustibil", selection: $vehicle.fuel) {
                        Text("—").tag("")
                        ForEach(Inventory.fuels, id: \.key) { Text($0.label).tag($0.key) }
                        if !vehicle.fuel.isEmpty && !Inventory.fuels.contains(where: { $0.key == vehicle.fuel }) { Text(vehicle.fuel).tag(vehicle.fuel) }
                    }
                    TextField("VIN", text: $vehicle.vin).textInputAutocapitalization(.characters).font(.body.monospaced())
                } footer: { if let vin { Text(vin).foregroundStyle(.orange) } }
                Section(header: CapsHeader("Termene")) {
                    OptionalDate(title: "ITP expiră", value: $vehicle.itpExpiry)
                    OptionalDate(title: "RCA expiră", value: $vehicle.rcaExpiry)
                    OptionalDate(title: "Ultima revizie", value: $vehicle.lastServiceDate)
                    TextField("Km la ultima revizie", text: $lastKm).keyboardType(.numberPad)
                }
                Section { TextField("Note", text: $vehicle.notes, axis: .vertical) }
            }
            .navigationTitle(isNew ? "Mașină nouă" : "Mașină")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                year = vehicle.year.map(String.init) ?? ""
                lastKm = vehicle.lastServiceKm.map(String.init) ?? ""
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvează") {
                        var v = vehicle
                        v.year = Int(year.filter(\.isNumber))
                        v.lastServiceKm = Int(lastKm.filter(\.isNumber))
                        do { try store.saveVehicle(v); dismiss() } catch { self.error = error.localizedDescription }
                    }
                    .disabled(People.normalizePlate(vehicle.plate).isEmpty || vehicle.customerId == nil || duplicate)
                }
            }
            .alert("Nu se poate", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK", role: .cancel) {} } message: { Text(error ?? "") }
        }
    }
}

/// A date that may be empty ("YYYY-MM-DD" or nil).
private struct OptionalDate: View {
    let title: String
    @Binding var value: String?

    var body: some View {
        if let v = value, let date = Dates.parseDate(v) {
            HStack {
                DatePicker(title, selection: Binding(get: { date }, set: { value = Dates.isoDate($0) }), displayedComponents: .date)
                Button { value = nil } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Golește \(title)")
            }
        } else {
            Button { value = Dates.today() } label: { LabeledContent(title, value: "Adaugă") }
                .tint(.primary)
        }
    }
}
