import SwiftUI

/// One booking: status with its next move, the car and customer, when and who, what for,
/// the job it became, and its moves (edit, reschedule, cancel, delete).
struct AppointmentDetailView: View {
    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo
    @Environment(\.dismiss) private var dismiss
    let id: String

    @State private var editing: BookingForm.Target?
    @State private var cancelling: Appointment?
    @State private var openJob: String?
    @State private var confirmDelete = false
    @State private var editingOperation: OperationSheet.Target?
    @State private var pickingServices = false
    @State private var done = 0
    @State private var error: String?

    var body: some View {
        if let a = store.get(Appointment.self, id) {
            content(a)
        } else {
            ContentUnavailableView("Programarea nu mai există", systemImage: "calendar")
        }
    }

    private func content(_ a: Appointment) -> some View {
        let style = AppointmentRules.style(a.status)
        let customer = store.get(Customer.self, a.customerId)
        let vehicle = store.get(Vehicle.self, a.vehicleId)
        let staff = store.get(Staff.self, a.staffId)
        let bay = store.get(Bay.self, a.bayId)
        let ops: [String] = (a.operations?.isEmpty == false) ? a.operations!.compactMap { $0["name"]?.string } : a.serviceIds.compactMap { store.get(Service.self, $0)?.name }
        let late = Agenda.arrivalDelay(a, now: Dates.instant())
        return List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 12) {
                        Image(systemName: style.symbol).font(.title2).foregroundStyle(style.color)
                            .frame(width: 44, height: 44).background(style.color.opacity(0.15), in: .circle)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(style.label).font(.title3.weight(.semibold))
                            Text(late > 0 ? "întârzie \(late) min" : "\(Dates.display(Dates.dayOfInstant(a.start))) · \(Dates.timeOfInstant(a.start))–\(Dates.timeOfInstant(a.end))")
                                .font(.subheadline).foregroundStyle(late > 0 ? .orange : .secondary)
                        }
                    }
                    HStack(spacing: 8) {
                        if a.status == "scheduled" {
                            Button { act("Confirmată") { try store.setAppointmentStatus(a.id, to: "confirmed") } } label: {
                                Label("Confirmă", systemImage: "checkmark")
                            }
                            .buttonStyle(.primary)
                        }
                        if (a.status == "scheduled" || a.status == "confirmed") && a.workOrderId == nil {
                            Button { checkIn(a) } label: { Label("A sosit", systemImage: "car.fill") }
                                .buttonStyle(FillButtonStyle(kind: a.status == "confirmed" ? .primary : .secondary))
                        }
                    }
                }
                .padding(.vertical, 4)
            }

            Section {
                if let vehicle { LabeledContent("Mașina", value: "\(People.formatPlate(vehicle.plate)) · \(vehicle.title)") }
                if let customer {
                    LabeledContent("Client", value: customer.name)
                    if !customer.phone.isEmpty, let tel = People.telURL(customer.phone) {
                        Link(destination: tel) { Label(People.formatPhone(customer.phone), systemImage: "phone.fill") }
                    }
                }
                LabeledContent("Mecanic", value: staff?.name ?? "—")
                if let bay { LabeledContent("Rampă", value: bay.name) }
                if let n = a.number { LabeledContent("Număr", value: "#\(n)") }
            }

            OperationsSection(appointment: a, editable: a.workOrderId == nil && ["scheduled", "confirmed", "arrived"].contains(a.status),
                              editing: $editingOperation, picking: $pickingServices)

            if !a.notes.isEmpty || (!a.title.isEmpty && a.title != ops.joined(separator: ", ")) {
                Section {
                    if !a.title.isEmpty && a.title != ops.joined(separator: ", ") { Text(a.title) }
                    if !a.notes.isEmpty { Text(a.notes).font(.subheadline).foregroundStyle(.secondary) }
                } header: { CapsHeader("Note") }
            }

            if let job = store.get(WorkOrder.self, a.workOrderId) {
                Section("Lucrarea") {
                    NavigationLink { WorkOrderDetailView(id: job.id) } label: {
                        LabeledContent(String(localized: "Lucrarea #\(String(job.number))")) {
                            Text(Labels.workOrder(job.status).label).foregroundStyle(Labels.workOrder(job.status).color)
                        }
                    }
                }
            }

            Section {
                Menu {
                    AppointmentMenu(appointment: a, edit: { editing = .edit(a.id) }, cancel: { cancelling = a }, act: act, checkIn: checkIn)
                } label: {
                    Label("Toate acțiunile", systemImage: "ellipsis.circle")
                }
                if ["scheduled", "confirmed"].contains(a.status) {
                    Button { editing = .edit(a.id) } label: { Label("Mută sau editează", systemImage: "calendar.badge.clock") }
                }
                if a.workOrderId == nil {
                    Button("Șterge programarea", role: .destructive) { confirmDelete = true }
                }
            }
        }
        .listStyle(.insetGrouped)
        .band(150)
        .navigationTitle(Text(verbatim: a.number.map { "Programarea #\($0)" } ?? "Programare"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if ["scheduled", "confirmed", "arrived"].contains(a.status) {
                Button("Editează") { editing = .edit(a.id) }
            }
        }
        .navigationDestination(item: $openJob) { WorkOrderDetailView(id: $0) }
        .sheet(item: $editing) { BookingForm(target: $0) }
        .sheet(item: $cancelling) { CancelSheet(appointment: $0) }
        .sheet(item: $editingOperation) { OperationSheet(target: $0, appointmentId: a.id) }
        .sheet(isPresented: $pickingServices) {
            ServicePicker { picked in
                let rate = store.shop.laborRate
                store.setOperations(a.id, store.operations(of: a.id) + picked.map { Operations.fromService($0, laborRate: rate) })
            }
        }
        .confirmationDialog("Ștergi programarea?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Șterge", role: .destructive) {
                do { try store.deleteAppointment(a.id); dismiss() } catch { self.error = error.localizedDescription }
            }
        } message: { Text("Dacă doar nu mai vine, anuleaz-o: rămâne în istoric.") }
        .alert("Nu se poate", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(error ?? "") }
        .sensoryFeedback(.success, trigger: done)
    }

    private func act(_ message: String, _ change: () throws -> Appointment) {
        do {
            let before = try change()
            done += 1
            undo.show(message) { store.restore(before) }
        } catch { self.error = error.localizedDescription }
    }

    private func checkIn(_ a: Appointment) {
        do { openJob = try store.checkIn(a.id).id; done += 1 } catch { self.error = error.localizedDescription }
    }
}


/// New or edited booking: client and car, day, start and length, mechanic and bay, operations, notes.
/// Overlaps with the same mechanic or bay are shown as you go (a warning, not a block).
struct BookingForm: View {
    enum Target: Identifiable, Hashable {
        case new
        case newAt(String, String?) // start instant, mechanic
        case edit(String)
        var id: String { switch self { case .new: "new"; case .newAt(let s, let staff): "at-\(s)-\(staff ?? "")"; case .edit(let id): id } }
    }

    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo
    @Environment(\.dismiss) private var dismiss
    let target: Target

    @State private var customerId: String?
    @State private var vehicleId: String?
    @State private var start = Date.now
    @State private var minutes = 60
    @State private var staffId: String?
    @State private var bayId: String?
    @State private var serviceIds: [String] = []
    @State private var title = ""
    @State private var notes = ""
    @State private var customerKnows = false
    @State private var loaded = false
    @State private var error: String?

    private var editingId: String? { if case .edit(let id) = target { id } else { nil } }

    private var input: AppStore.BookingInput {
        .init(customerId: customerId, vehicleId: vehicleId, start: Dates.instant(start), end: Dates.instant(start.addingTimeInterval(Double(minutes) * 60)),
              title: title, notes: notes, staffId: staffId, bayId: bayId, serviceIds: serviceIds)
    }

    var body: some View {
        let customers = store.all(Customer.self).sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        let vehicles = store.all(Vehicle.self)
        let mine = vehicles.filter { $0.customerId == customerId }
        let problem = AppointmentRules.problem(start: input.start, end: input.end, customerId: customerId)
        let draft = Appointment(id: editingId ?? "draft", start: input.start, end: input.end, customerId: customerId, vehicleId: vehicleId, title: title,
                                status: "scheduled", workOrderId: nil, staffId: staffId, bayId: bayId, activity: [], expectedAt: nil, notes: notes,
                                serviceIds: serviceIds, createdAt: "")
        let clashes = AppointmentRules.conflicts(draft, among: store.all(Appointment.self))
        let original = editingId.flatMap { store.get(Appointment.self, $0) }
        let moved = original.map { $0.start != input.start || $0.end != input.end } ?? false
        NavigationStack {
            Form {
                Section {
                    NavigationLink {
                        SearchPicker(title: "Client", items: customers, text: { $0.name }, detail: { People.formatPhone($0.phone) }, selection: $customerId)
                    } label: { LabeledContent("Client", value: store.get(Customer.self, customerId)?.name ?? "Alege") }
                    NavigationLink {
                        SearchPicker(title: "Mașina", items: customerId == nil ? vehicles : mine, text: { People.formatPlate($0.plate) }, detail: { $0.title }, selection: $vehicleId)
                    } label: { LabeledContent("Mașina", value: store.get(Vehicle.self, vehicleId).map { People.formatPlate($0.plate) } ?? "Opțional") }
                }
                Section {
                    DatePicker("Începe", selection: $start, displayedComponents: [.date, .hourAndMinute])
                    Picker("Durata", selection: $minutes) {
                        ForEach([15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480], id: \.self) { m in
                            Text(m < 60 ? "\(m) min" : m % 60 == 0 ? "\(m / 60) h" : "\(m / 60) h \(m % 60) min").tag(m)
                        }
                        if ![15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480].contains(minutes) { Text("\(minutes) min").tag(minutes) }
                    }
                    LabeledContent("Se termină", value: Dates.timeOfInstant(input.end))
                    if moved && original?.status == "confirmed" {
                        Toggle("Clientul știe de noua oră", isOn: $customerKnows)
                    }
                } footer: {
                    if moved && original?.status == "confirmed" && !customerKnows { Text("Mutată fără să știe clientul, programarea redevine neconfirmată.") }
                }
                Section {
                    Picker("Mecanic", selection: $staffId) {
                        Text("Nimeni").tag(String?.none)
                        ForEach(store.all(Staff.self).filter(\.active).sorted { $0.order < $1.order }) { Text($0.name).tag(Optional($0.id)) }
                    }
                    Picker("Rampă", selection: $bayId) {
                        Text("Oricare").tag(String?.none)
                        ForEach(store.all(Bay.self).filter(\.active).sorted { $0.order < $1.order }) { Text($0.name).tag(Optional($0.id)) }
                    }
                } footer: {
                    if !clashes.isEmpty {
                        Label("Se suprapune cu \(clashes.count == 1 ? "o programare" : "\(clashes.count) programări") (\(clashes.map { "\(Dates.timeOfInstant($0.start))–\(Dates.timeOfInstant($0.end))" }.joined(separator: ", "))) pe același mecanic sau rampă.",
                              systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                    }
                }
                Section("Ce are de făcut") {
                    TextField("Pe scurt (ex. Revizie, zgomot la frânare)", text: $title)
                    ForEach(serviceIds, id: \.self) { Text(store.get(Service.self, $0)?.name ?? "") }
                        .onDelete { serviceIds.remove(atOffsets: $0) }
                    NavigationLink {
                        SearchPicker(title: "Operație", items: store.all(Service.self).sorted { $0.name < $1.name }, text: { $0.name }, detail: { $0.category },
                                     selection: Binding(get: { nil }, set: { id in
                                         guard let id else { return }
                                         serviceIds.append(id)
                                         // The length follows the operations while it was not set by hand.
                                         let hours = serviceIds.compactMap { store.get(Service.self, $0)?.hours }.reduce(0, +)
                                         if hours > 0 { minutes = max(15, Int(Money.jsRound(hours * 4)) * 15) }
                                     }))
                    } label: { Label("Adaugă din catalog", systemImage: "plus.circle.fill") }
                    TextField("Note", text: $notes, axis: .vertical)
                }
            }
            .navigationTitle(editingId == nil ? "Programare nouă" : "Programare")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editingId == nil ? "Programează" : "Salvează") { save(moved: moved) }.disabled(problem != nil)
                }
            }
            .onChange(of: customerId) { _, new in
                if let v = store.get(Vehicle.self, vehicleId), v.customerId != new { vehicleId = nil }
                if vehicleId == nil, mine.count == 1 { vehicleId = mine.first?.id }
            }
            .onChange(of: vehicleId) { _, new in
                if customerId == nil, let owner = store.get(Vehicle.self, new)?.customerId { customerId = owner }
            }
            .task { load() }
            .alert("Nu se poate", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("OK", role: .cancel) {}
            } message: { Text(error ?? "") }
        }
    }

    private func load() {
        guard !loaded else { return }
        loaded = true
        switch target {
        case .new:
            start = nextOpenSlot()
            minutes = Int(store.settings["calendar"]?["defaultDuration"]?.number ?? 60)
        case .newAt(let s, let staff):
            start = Dates.parseInstant(s) ?? .now
            staffId = staff
            minutes = Int(store.settings["calendar"]?["defaultDuration"]?.number ?? 60)
        case .edit(let id):
            guard let a = store.get(Appointment.self, id) else { return }
            customerId = a.customerId; vehicleId = a.vehicleId; staffId = a.staffId; bayId = a.bayId
            start = Dates.parseInstant(a.start) ?? .now
            minutes = max(15, Dates.minutesBetween(a.start, a.end))
            serviceIds = a.serviceIds; title = a.title; notes = a.notes
        }
    }

    /// The next round half hour at least 30 minutes ahead, inside the shop's hours (else the next open day's opening).
    private func nextOpenSlot() -> Date {
        let cal = Calendar.current
        let shop = store.shop
        let days = store.settings["hours"]?["days"]?.array?.compactMap { $0.number.map(Int.init) } ?? [1, 2, 3, 4, 5, 6]
        let hm = { (t: String) -> (Int, Int) in let p = t.split(separator: ":").compactMap { Int($0) }; return p.count == 2 ? (p[0], p[1]) : (8, 0) }
        let (oh, om) = hm(shop.hoursOpen), (ch, cm) = hm(shop.hoursClose)
        var t = Date.now.addingTimeInterval(30 * 60)
        let m = cal.component(.minute, from: t)
        t = cal.date(bySetting: .second, value: 0, of: t) ?? t
        t = cal.date(byAdding: .minute, value: (m % 30 == 0 ? 0 : 30 - m % 30), to: t) ?? t
        for _ in 0..<14 {
            let day = cal.startOfDay(for: t)
            let open = cal.date(bySettingHour: oh, minute: om, second: 0, of: day)!
            let close = cal.date(bySettingHour: ch, minute: cm, second: 0, of: day)!
            if days.contains(cal.component(.weekday, from: day) - 1) {
                if t < open { return open }
                if t.addingTimeInterval(30 * 60) <= close { return t }
            }
            t = cal.date(byAdding: .day, value: 1, to: day)!
        }
        return t
    }

    private func save(moved: Bool) {
        do {
            if let id = editingId {
                let before = store.get(Appointment.self, id)
                if moved { try store.reschedule(id, start: input.start, end: input.end, customerKnows: customerKnows) }
                try store.saveAppointment(id, input)
                if let before { undo.show("Programare salvată") { store.restore(before) } }
            } else {
                let (a, clashes) = try store.createAppointment(input)
                undo.show(clashes.isEmpty ? "Programarea #\(a.number ?? 0) e făcută" : "Făcută, dar se suprapune cu \(clashes.count)") { try store.deleteAppointment(a.id) }
            }
            dismiss()
        } catch { self.error = error.localizedDescription }
    }
}
