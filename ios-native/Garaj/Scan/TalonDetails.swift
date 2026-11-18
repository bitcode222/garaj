import SwiftUI

// After the talon is read: check what was read, see what the app already knows about the car, pick the client,
// then choose what comes next. Nothing is saved until a "Ce urmează" choice; Renunță leaves everything as it was.

/// What opens once the car is saved.
enum TalonNext: Hashable {
    case car, estimate, job, booking
    case openJob(String)
    case openBooking(String)
}

struct TalonDetailsScreen: View {
    @Environment(AppStore.self) private var store
    @Binding var data: TalonData
    let page: UIImage?
    let retake: () -> Void
    let cancel: () -> Void
    let done: (String, TalonNext) -> Void

    @State private var client: TalonClient?
    @State private var otherClient: String?
    @State private var ask: Ask?
    @State private var confirmCancel = false
    @State private var error: String?

    private enum Ask: Identifiable {
        case job(TalonNext, WorkOrder)
        case booking(Appointment)
        var id: String { switch self { case .job(_, let o): "job-\(o.id)"; case .booking(let a): "booking-\(a.id)" } }
    }

    var body: some View {
        let review = store.talonReview(data)
        NavigationStack {
            ScrollViewReader { proxy in
            Form {
                if data.isEmpty { unreadable }
                status(review)
                if let page {
                    Section {
                        Image(uiImage: page).resizable().scaledToFit().frame(maxHeight: 170).frame(maxWidth: .infinity)
                            .clipShape(.rect(cornerRadius: 8))
                    }
                    .listRowBackground(Color.clear)
                }
                carFields(review)
                clientSection(review)
                nextSection(review).id("next")
            }
            #if DEBUG
            // Screenshots: `-GarajScanBottom 1` shows the client and "Ce urmează".
            .task {
                if UserDefaults.standard.string(forKey: "GarajScanBottom") != nil {
                    try? await Task.sleep(for: .milliseconds(600))
                    proxy.scrollTo("next", anchor: .bottom)
                }
            }
            #endif
            }
            .navigationTitle("Ce am citit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Renunță") { confirmCancel = true } }
                ToolbarItem(placement: .primaryAction) { Button("Refă poza", systemImage: "camera", action: retake) }
            }
            .onAppear { if client == nil { client = defaultClient(review) } }
            #if DEBUG
            // Screenshots: `-GarajScanNext car|estimate|job|booking` picks that next step on its own.
            .task {
                guard let n = UserDefaults.standard.string(forKey: "GarajScanNext") else { return }
                try? await Task.sleep(for: .seconds(1))
                act(["estimate": .estimate, "job": .job, "booking": .booking][n] ?? .car, store.talonReview(data))
            }
            #endif
            .onChange(of: otherClient) { _, id in if let id { client = .existing(id) } }
            .confirmationDialog("Renunți la scanare?", isPresented: $confirmCancel, titleVisibility: .visible) {
                Button("Renunță, nu salva nimic", role: .destructive, action: cancel)
            } message: { Text("Mașina, clientul și poza nu se salvează.") }
            .confirmationDialog(askTitle, isPresented: Binding(get: { ask != nil }, set: { if !$0 { ask = nil } }), titleVisibility: .visible, presenting: ask) { a in
                switch a {
                case .job(let next, let o):
                    Button("Deschide lucrarea #" + String(o.number)) { save(.openJob(o.id)) }
                    Button(next == .estimate ? "Fă un deviz nou" : "Fă o lucrare nouă") { save(next) }
                case .booking(let b):
                    Button("Deschide programarea") { save(.openBooking(b.id)) }
                    Button("Fă altă programare") { save(.booking) }
                }
                Button("Înapoi", role: .cancel) {}
            }
            .alert("Nu se poate salva", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("OK", role: .cancel) {}
            } message: { Text(error ?? "") }
        }
    }

    // MARK: Sections

    private var unreadable: some View {
        Section {
            Label("N-am putut citi talonul", systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange).font(.headline)
            Text("Poza e neclară, e prea departe sau nu e un talon. Refă poza cu talonul întreg în cadru și lumină bună, sau completează câmpurile de mână.")
                .font(.subheadline).foregroundStyle(.secondary)
            Button("Refă poza", systemImage: "camera", action: retake)
        }
    }

    @ViewBuilder private func status(_ r: TalonReview) -> some View {
        Section {
            if let m = r.match {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Image(systemName: "checkmark.seal.fill").foregroundStyle(.green).font(.title3)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Mașina e deja în registru").font(.headline)
                        Text([People.formatPlate(m.plate), m.title.nonEmpty, r.currentOwner?.name].compactMap { $0 }.joined(separator: " · "))
                            .font(.subheadline).foregroundStyle(.secondary)
                        Text(r.changes.isEmpty ? "Talonul nu aduce nimic nou." : "Se actualizează: \(r.changes.joined(separator: ", ")).")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Image(systemName: "car.badge.plus").foregroundStyle(.blue).font(.title3)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Mașină nouă").font(.headline)
                        Text("Nu există în registru nicio mașină cu acest număr sau VIN.").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            }
            if let other = r.plateTakenBy {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red)
                    Text("Numărul \(People.formatPlate(other.plate)) e pe altă mașină (\(other.title.nonEmpty ?? "fără model")\(other.vin.isEmpty ? "" : ", VIN \(other.vin)")). Verifică numărul și VIN-ul: nu pot exista două mașini cu același număr.")
                        .font(.subheadline)
                }
            }
            if r.vinDiffers, let m = r.match {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    Text("VIN-ul de pe talon (\(data.vin)) diferă de cel din registru (\(m.vin)). Dacă e altă mașină cu același număr, nu o actualiza: schimbă întâi numărul mașinii vechi. Dacă VIN-ul din registru era greșit, continuă.")
                        .font(.subheadline)
                }
            }
            if let o = r.openJob {
                Label("Are lucrarea #" + String(o.number) + " deschisă · " + Labels.workOrder(o.status).label.lowercased(), systemImage: "wrench.and.screwdriver")
                    .font(.subheadline)
            }
            if let b = r.nextBooking {
                Label("Programată \(Dates.display(Dates.dayOfInstant(b.start))), \(Dates.timeOfInstant(b.start))", systemImage: "calendar")
                    .font(.subheadline)
            }
        }
    }

    private func carFields(_ r: TalonReview) -> some View {
        Section("Mașina") {
            field("Nr. înmatriculare", text: $data.plate, caps: true)
            field("VIN", text: $data.vin, caps: true)
            field("Marcă", text: $data.make)
            field("Model", text: $data.model)
            LabeledContent("An") {
                TextField("An", value: $data.year, format: .number.grouping(.never))
                    .keyboardType(.numberPad).multilineTextAlignment(.trailing)
            }
            field("Motor", text: $data.engine)
            Picker("Combustibil", selection: $data.fuel) {
                Text("—").tag("")
                ForEach(Inventory.fuels, id: \.key) { Text($0.label).tag($0.key) }
            }
            field("Culoare", text: $data.color)
        }
    }

    @ViewBuilder private func clientSection(_ r: TalonReview) -> some View {
        let options = clientOptions(r)
        Section {
            field("Nume pe talon", text: $data.owner)
            field("Adresă", text: $data.address)
            Picker("Client", selection: $client) {
                ForEach(options, id: \.tag) { o in
                    VStack(alignment: .leading) {
                        Text(o.title)
                        if let d = o.detail { Text(d).font(.caption).foregroundStyle(.secondary) }
                    }
                    .tag(Optional(o.tag))
                }
            }
            .pickerStyle(.inline)
            NavigationLink {
                SearchPicker(title: "Client", items: store.all(Customer.self).sorted { $0.name.localizedCompare($1.name) == .orderedAscending },
                             text: { $0.name }, detail: { People.formatPhone($0.phone) }, selection: $otherClient)
            } label: { Label("Alt client din registru", systemImage: "person.crop.circle.badge.questionmark") }
        } header: {
            Text("Clientul")
        } footer: {
            Text(clientNote(r))
        }
    }

    private func nextSection(_ r: TalonReview) -> some View {
        let unchanged = r.match != nil && r.changes.isEmpty && client == r.currentOwner.map { .existing($0.id) }
        return Section {
            nextRow(r.match == nil ? "Adaugă mașina" : unchanged ? "Deschide mașina" : "Actualizează mașina",
                    detail: "Doar mașina și clientul", symbol: "car.fill", next: .car, review: r)
            nextRow("Deviz nou", detail: "Pentru o constatare și o ofertă", symbol: "doc.text.magnifyingglass", next: .estimate, review: r)
            nextRow("Lucrare nouă", detail: "Mașina intră în lucru acum", symbol: "car.badge.gearshape", next: .job, review: r)
            nextRow("Programare nouă", detail: "Pentru altă zi", symbol: "calendar.badge.plus", next: .booking, review: r)
        } header: {
            Text("Ce urmează")
        } footer: {
            Text("Mașina și clientul se salvează, apoi se deschide ce alegi. Poza talonului rămâne pe mașină, doar pe acest telefon.")
        }
    }

    private func nextRow(_ title: String, detail: String, symbol: String, next: TalonNext, review: TalonReview) -> some View {
        Button { act(next, review) } label: {
            HStack(spacing: 14) {
                Image(systemName: symbol).font(.title3).frame(width: 30).foregroundStyle(Color("AccentColor"))
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).foregroundStyle(.primary).font(.body.weight(.medium))
                    Text(detail).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
            }
            .frame(minHeight: 44)
        }
        .tint(.primary) // the row reads like a list row; only its icon takes the accent
    }

    // MARK: Logic

    private struct Option { let tag: TalonClient; let title: String; let detail: String? }

    /// The car's owner today, the clients with the talon's name, the client picked from the list, a new client.
    private func clientOptions(_ r: TalonReview) -> [Option] {
        var out: [Option] = []
        var seen = Set<String>()
        if let o = r.currentOwner {
            out.append(Option(tag: .existing(o.id), title: o.name, detail: "Proprietarul de acum, din registru"))
            seen.insert(o.id)
        }
        for c in r.nameMatches where !seen.contains(c.id) {
            let cars = store.all(Vehicle.self).filter { $0.customerId == c.id }.count
            out.append(Option(tag: .existing(c.id), title: c.name,
                              detail: ["Client existent", c.phone.isEmpty ? nil : People.formatPhone(c.phone), cars > 0 ? "\(cars) \(cars == 1 ? "mașină" : "mașini")" : nil]
                                .compactMap { $0 }.joined(separator: " · ")))
            seen.insert(c.id)
        }
        if let id = otherClient, !seen.contains(id), let c = store.get(Customer.self, id) {
            out.append(Option(tag: .existing(id), title: c.name, detail: "Ales din registru"))
        }
        if !data.owner.trimmingCharacters(in: .whitespaces).isEmpty {
            out.append(Option(tag: .new, title: "Client nou: \(data.owner)", detail: data.address.nonEmpty))
        }
        return out
    }

    /// The car's owner when it is known; else the only client with the talon's name; else a new client.
    /// Two or more namesakes: nothing is picked, so the person chooses.
    private func defaultClient(_ r: TalonReview) -> TalonClient? {
        if let o = r.currentOwner { return .existing(o.id) }
        if r.nameMatches.count == 1, let c = r.nameMatches.first { return .existing(c.id) }
        if r.nameMatches.isEmpty, !data.owner.isEmpty { return .new }
        return nil
    }

    private func clientNote(_ r: TalonReview) -> String {
        var notes: [String] = []
        if let owner = r.currentOwner, !data.owner.isEmpty, Search.fold(owner.name) != Search.fold(data.owner) {
            notes.append("Pe talon e alt nume decât proprietarul din registru. Dacă mașina a fost vândută, alege clientul nou; lucrările și facturile vechi rămân la fostul proprietar.")
        }
        if r.nameMatches.count > 1 { notes.append("Sunt \(r.nameMatches.count) clienți cu acest nume: alege-l pe cel corect după telefon.") }
        if TalonParser.isLeasing(data.otherName) {
            notes.append("Pe talon apare și \(data.otherName), firma de leasing. Clientul e cel care aduce mașina.")
        } else if !data.otherName.isEmpty {
            notes.append("Pe talon apare și \(data.otherName).")
        }
        if client == nil { notes.append("Alege clientul.") }
        return notes.joined(separator: " ")
    }

    private var askTitle: String {
        switch ask {
        case .job(_, let o): "Mașina are deja lucrarea #\(o.number) deschisă"
        case .booking(let b): "Mașina e deja programată \(Dates.display(Dates.dayOfInstant(b.start))), \(Dates.timeOfInstant(b.start))"
        case nil: ""
        }
    }

    private func act(_ next: TalonNext, _ r: TalonReview) {
        if (next == .estimate || next == .job), let o = r.openJob { ask = .job(next, o); return }
        if next == .booking, let b = r.nextBooking { ask = .booking(b); return }
        save(next)
    }

    private func save(_ next: TalonNext) {
        guard let client else { error = "Alege clientul căruia îi aparține mașina."; return }
        do { done(try store.saveTalon(data, client: client).id, next) } catch { self.error = error.localizedDescription }
    }

    private func field(_ label: String, text: Binding<String>, caps: Bool = false) -> some View {
        LabeledContent(label) {
            TextField(label, text: text)
                .multilineTextAlignment(.trailing)
                .textInputAutocapitalization(caps ? .characters : .words)
                .autocorrectionDisabled()
        }
    }
}

/// The saved car, with what was chosen next opened over it: a new deviz or job, a booking, or the existing ones.
struct TalonDoneScreen: View {
    @Environment(AppStore.self) private var store
    let vehicleId: String
    let next: TalonNext
    let close: () -> Void

    @State private var path: [String] = []
    @State private var newJob: String?
    @State private var booking: BookingForm.Target?
    @State private var started = false

    var body: some View {
        NavigationStack(path: $path) {
            VehicleDetailView(id: vehicleId)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Gata", action: close) } }
                .navigationDestination(for: String.self) { WorkOrderDetailView(id: $0) }
        }
        .sheet(item: Binding(get: { newJob.map(JobStatus.init) }, set: { newJob = $0?.status })) { s in
            let car = store.get(Vehicle.self, vehicleId)
            NewWorkOrderSheet(status: s.status, customerId: car?.customerId, vehicleId: vehicleId) { id in path.append(id) }
        }
        .sheet(item: $booking) { BookingForm(target: $0) }
        .task {
            guard !started else { return }
            started = true
            try? await Task.sleep(for: .milliseconds(350)) // after the push settles
            let car = store.get(Vehicle.self, vehicleId)
            switch next {
            case .car: break
            case .estimate: newJob = "estimate"
            case .job: newJob = "in_progress"
            case .booking: if let c = car?.customerId { booking = .newFor(c, vehicleId) }
            case .openJob(let id): path.append(id)
            case .openBooking(let id): booking = .edit(id)
            }
        }
    }

    private struct JobStatus: Identifiable { let status: String; var id: String { status } }
}
