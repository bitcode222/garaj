import SwiftUI

/// Mașini: every car with its ITP, RCA and service at a glance.
struct VehiclesView: View {
    @Environment(AppStore.self) private var store
    @State private var query = ""
    @State private var creating: Vehicle?
    @State private var editing: Vehicle?
    @AppStorage("vehicles.sort") private var sort = "plate"
    @AppStorage("vehicles.group") private var group = "none"

    var body: some View {
        let owners = Dictionary(store.all(Customer.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let today = Dates.today()
        let tokens = Search.tokens(query)
        let vehicles = store.all(Vehicle.self)
            .filter { v in
                tokens.isEmpty || Search.matches(Search.fold([v.plate, People.normalizePlate(v.plate), v.title, v.vin, owners[v.customerId ?? ""]?.name ?? ""].joined(separator: " ")), tokens)
            }
            .sorted { a, b in
                switch sort {
                case "make": return a.title.localizedCompare(b.title) == .orderedAscending
                case "km": return (People.estimateKm(a, today: today) ?? 0) > (People.estimateKm(b, today: today) ?? 0)
                case "itp": return (a.itpExpiry ?? "9999") < (b.itpExpiry ?? "9999")
                default: return a.plate < b.plate
                }
            }
        let sections: [(title: String, make: String?, rows: [Vehicle])] = {
            switch group {
            case "make":
                let by = Dictionary(grouping: vehicles) { $0.make.isEmpty ? "Fără marcă" : $0.make }
                return by.keys.sorted().map { ($0, $0, by[$0]!) }
            case "owner":
                let by = Dictionary(grouping: vehicles) { owners[$0.customerId ?? ""]?.name ?? "Fără proprietar" }
                return by.keys.sorted { $0.localizedCompare($1) == .orderedAscending }.map { ($0, nil, by[$0]!) }
            default:
                return vehicles.isEmpty ? [] : [("", nil, vehicles)]
            }
        }()
        List { ForEach(sections, id: \.title) { section in
            Section {
                ForEach(section.rows) { v in
                    NavigationLink { VehicleDetailView(id: v.id) } label: { VehicleRow(vehicle: v, owner: owners[v.customerId ?? ""]?.name) }
                        .swipeActions(edge: .trailing) {
                            Button { editing = v } label: { Label("Editează", systemImage: "pencil") }.tint(.gray)
                        }
                        .contextMenu { Button { editing = v } label: { Label("Editează", systemImage: "pencil") } }
                }
            } header: {
                if !section.title.isEmpty {
                    HStack(spacing: 8) {
                        if let make = section.make { MakeLogo(make: make, size: 20) }
                        CapsHeader("\(section.title) · \(section.rows.count)")
                    }
                }
            }
        } }
        .groupedBackground()
        .overlay { if vehicles.isEmpty { query.isEmpty ? AnyView(ContentUnavailableView {
            Label("Nicio mașină", systemImage: "car")
        } description: {
            Text("Mașinile se adaugă la programare sau la primire. O poți adăuga și de aici.")
        } actions: {
            Button { creating = store.newVehicle(customerId: nil) } label: { Label("Mașină nouă", systemImage: "plus") }.buttonStyle(FillButtonStyle(fill: false))
        }) : AnyView(ContentUnavailableView.search(text: query)) } }
        .navigationTitle("Mașini")
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Număr, marcă, VIN, proprietar")
        .toolbar {
            SortGroupMenu(sorts: [("plate", "Număr"), ("make", "Marcă și model"), ("km", "Kilometri"), ("itp", "ITP cel mai apropiat")], sort: $sort,
                          groups: [("none", "Fără grupare"), ("make", "Marcă"), ("owner", "Proprietar")], group: $group)
            Button { creating = store.newVehicle(customerId: nil) } label: { Label("Mașină nouă", systemImage: "plus") }
        }
        .sheet(item: $creating) { VehicleForm(vehicle: $0, isNew: true) }
        .sheet(item: $editing) { VehicleForm(vehicle: $0, isNew: false) }
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
    @State private var showTalon: UIImage?
    /// Scanning onto this car: its talon, or another document.
    @State private var scan: ScanMode?
    /// What to open once the talon is in: a new deviz for the car, or its open job.
    @State private var afterScan: TalonNext?
    @State private var openedJob: String?
    @State private var docs: [CarDocument] = []
    @State private var talon: UIImage?
    @State private var removing: CarDocument?

    var body: some View {
        Group {
            if let v = store.get(Vehicle.self, id) { content(v) } else { ContentUnavailableView("Mașina nu mai există", systemImage: "car") }
        }
        .fullScreenCover(item: Binding(get: { scan.map(ScanTarget.init) }, set: { scan = $0?.mode }), onDismiss: { reload(); runAfterScan() }) { t in
            TalonScanFlow(mode: t.mode, startImage: debugScanImage) { afterScan = $0 }
        }
        .sheet(isPresented: Binding(get: { afterScan == .estimate && scan == nil }, set: { if !$0 { afterScan = nil } })) {
            let car = store.get(Vehicle.self, id)
            NewWorkOrderSheet(status: "estimate", customerId: car?.customerId, vehicleId: id) { openedJob = $0 }
        }
        .navigationDestination(item: $openedJob) { WorkOrderDetailView(id: $0) }
        .confirmationDialog("Ștergi documentul?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible, presenting: removing) { d in
            Button("Șterge \(d.title)", role: .destructive) { CarDocuments.delete(id, d); reload() }
        } message: { _ in Text("Poza se șterge de pe telefon.") }
        .task {
            reload()
            #if DEBUG
            // Screenshots: `-GarajScanCar talon|document` with `-GarajScanImage <path>` scans onto this car.
            switch UserDefaults.standard.string(forKey: "GarajScanCar") {
            case "talon": scan = .talon(id)
            case "document": scan = .document(id)
            default: break
            }
            #endif
        }
        .sheet(item: Binding(get: { showTalon.map(TalonPicture.init) }, set: { showTalon = $0?.image })) { t in
            NavigationStack {
                ScrollView([.horizontal, .vertical]) { Image(uiImage: t.image).resizable().scaledToFit().containerRelativeFrame(.horizontal) }
                    .navigationTitle("Talon")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Închide") { showTalon = nil } }
                        ToolbarItem(placement: .primaryAction) {
                            ShareLink(item: Image(uiImage: t.image), preview: SharePreview("Talon", image: Image(uiImage: t.image)))
                        }
                    }
            }
        }
    }

    private struct TalonPicture: Identifiable { let image: UIImage; var id: ObjectIdentifier { ObjectIdentifier(image) } }
    private func docRow(_ image: UIImage, title: String, detail: String, open: @escaping () -> Void) -> some View {
        Button(action: open) {
            HStack(spacing: 14) {
                Image(uiImage: image).resizable().scaledToFill().frame(width: 56, height: 40).clipShape(.rect(cornerRadius: 6))
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).foregroundStyle(.primary)
                    Text(detail).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
            }
        }
    }

    private struct ScanTarget: Identifiable { let mode: ScanMode; var id: String { "\(mode)" } }

    /// The documents live in files, not in the store: read again after a scan or a delete.
    private func reload() {
        talon = TalonFiles.image(id)
        docs = CarDocuments.list(id)
    }

    /// The talon is in: open a new deviz, or the car's open job, as chosen in the scanner.
    private func runAfterScan() {
        switch afterScan {
        case .openJob(let job): openedJob = job; afterScan = nil
        case .estimate: break // the deviz sheet opens on its own once the scanner is gone
        default: afterScan = nil
        }
    }

    private var debugScanImage: UIImage? {
        #if DEBUG
        UserDefaults.standard.string(forKey: "GarajScanImage").flatMap { UIImage(contentsOfFile: $0) }
        #else
        nil
        #endif
    }

    private func content(_ v: Vehicle) -> some View {
        let today = Dates.today()
        let owner = store.get(Customer.self, v.customerId)
        let service = People.serviceDue(v, today: today)
        let orders = store.all(WorkOrder.self).filter { $0.vehicleId == v.id }.sorted { $0.number > $1.number }
        let km = { (n: Int) in "\(n.formatted(.number.locale(Locale(identifier: "ro_RO")))) km" }
        let ink = Make.ink(v.make)
        let services = Dictionary(store.all(Service.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let spent = orders.filter { $0.status == "delivered" }.reduce(0) { $0 + Lines.totals($1.lines.filter { !$0.refused }, vatPayer: store.shop.vatPayer).gross }
        return List {
            // The cover (look 3): the make's logo on its color, the plate, what car it is, the owner.
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Spacer()
                        MakeArt(make: v.make, size: 110)
                        Spacer()
                    }
                    .padding(.vertical, 18)
                    HStack(spacing: 10) {
                        Text(v.title.nonEmpty ?? "Mașină").font(.largeTitle.weight(.bold)).lineLimit(2).minimumScaleFactor(0.7)
                        if !v.plate.isEmpty { PlateBadge(plate: v.plate) }
                    }
                    Text([v.year.map(String.init), v.engine, Inventory.fuels.first { $0.key == v.fuel }?.label.lowercased() ?? v.fuel,
                          v.mileage.last.map { km($0.km) }].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.subheadline).opacity(0.8)
                    if !v.vin.isEmpty { Text("VIN \(v.vin)").font(.caption.monospaced()).opacity(0.7).textSelection(.enabled) }
                    if let owner {
                        NavigationLink { CustomerDetailView(id: owner.id) } label: {
                            Label(owner.name, systemImage: "person.fill")
                        }
                        .buttonStyle(.onColor)
                        .padding(.top, 8)
                    }
                }
                .foregroundStyle(ink)
                .padding(.horizontal, 20)
                .padding(.bottom, 8)
            }
            .bareRow()
            // The car's papers (owner): its talon, which also fills in the car, and any other document kept on it.
            Section {
                if let talon {
                    docRow(talon, title: "Talon", detail: "Certificatul de înmatriculare") { showTalon = talon }
                }
                ForEach(docs) { d in
                    if let image = CarDocuments.image(v.id, d) {
                        docRow(image, title: d.title, detail: "Scanat \(Dates.display(d.date))") { showTalon = image }
                            .swipeActions { Button("Șterge", role: .destructive) { removing = d } }
                    }
                }
                Button { scan = .talon(v.id) } label: {
                    Label(talon == nil ? "Scanează talonul" : "Scanează din nou talonul", systemImage: "doc.viewfinder")
                }
                Button { scan = .document(v.id) } label: {
                    Label("Scanează un document", systemImage: "doc.badge.plus")
                }
            } header: {
                CapsHeader("Documente")
            } footer: {
                Text("Talonul completează datele mașinii. Documentele (ITP, RCA, facturi) rămân pe mașină, doar pe acest telefon.")
            }
            if !orders.isEmpty {
                Section {
                    ScrollView(.horizontal) {
                        LazyHStack(spacing: 12) {
                            ForEach(orders) { o in
                                let first = o.lines.first { $0.kind == "labor" } ?? o.lines.first
                                let kind = WorkKind.style(WorkKind.category(serviceId: first?.refId, text: first?.description ?? o.complaint, services: services))
                                NavigationLink { WorkOrderDetailView(id: o.id) } label: {
                                    VStack(alignment: .leading) {
                                        Image(systemName: kind.symbol).font(.title2)
                                        Spacer()
                                        Text(JobText.headline(o)).font(.subheadline.weight(.semibold)).lineLimit(2).multilineTextAlignment(.leading)
                                        Text("\(Dates.display(Dates.dayOfInstant(o.createdAt))) · \(Labels.workOrder(o.status).label.lowercased())")
                                            .font(.caption).opacity(0.75).lineLimit(1)
                                    }
                                    .foregroundStyle(ink)
                                    .padding(12)
                                    .frame(width: 150, height: 150, alignment: .leading)
                                    .background(Make.cover(v.make).mix(with: kind.color, by: 0.25), in: .rect(cornerRadius: 24))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .contentMargins(.horizontal, 20, for: .scrollContent)
                    .scrollIndicators(.hidden)
                    .bareRow()
                } header: {
                    SectionHeader("Istoric", subtitle: "\(orders.count) \(orders.count == 1 ? "lucrare" : "lucrări")\(spent > 0 ? " · \(Money.format(spent, currency: store.currency, decimals: 0)) predate" : "")")
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
            if !v.notes.isEmpty { Section(header: CapsHeader("Note")) { Text(v.notes) } }
            Section { Button("Șterge mașina", role: .destructive) { confirmDelete = true } }
        }
        .listStyle(.insetGrouped)
        .cover(Make.cover(v.make), height: 560)
        .navigationTitle(People.formatPlate(v.plate))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button("Scanează talonul", systemImage: "doc.viewfinder") { scan = .talon(v.id) }
                    Button("Scanează un document", systemImage: "doc.badge.plus") { scan = .document(v.id) }
                } label: { Label("Scanează", systemImage: "doc.viewfinder") }
            }
            ToolbarSpacer(.fixed, placement: .primaryAction)
            ToolbarItem(placement: .primaryAction) { Button("Editează") { editing = v } }
        }
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
            .groupedBackground()
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
