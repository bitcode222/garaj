import SwiftUI

/// Programări → Toate programările (docs/APPOINTMENTS-AND-NAV.md): four numbers, status chips,
/// period / mechanic / sort, search, rows by day; one-tap moves with undo.
struct AppointmentsView: View {
    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo
    @AppStorage("appointments.period") private var period = "upcoming"
    @AppStorage("appointments.sort") private var sort = "time"
    @State private var status = "all"
    @State private var staff = "all"
    @State private var query = ""
    @State private var path: [HomeView.Route] = []
    @State private var editing: BookingForm.Target?
    @State private var cancelling: Appointment?
    @State private var done = 0
    @State private var error: String?

    static let statusLabel = ["all": "Toate", "to-confirm": "De confirmat", "confirmed": "Confirmate", "arrived": "Sosite",
                              "done": "Finalizate", "no_show": "Neprezentate", "cancelled": "Anulate"]
    static let periodLabel = ["upcoming": "De azi înainte", "today": "Azi", "next7": "Următoarele 7 zile", "week": "Săptămâna asta",
                              "month": "Luna asta", "past": "Trecute", "all": "Toate"]

    var body: some View {
        NavigationStack(path: $path) {
            let lookups = AppointmentList.Lookups(customers: byId(Customer.self), vehicles: byId(Vehicle.self), services: byId(Service.self))
            let staffById = byId(Staff.self)
            let now = Dates.instant(), today = Dates.today()
            let result = AppointmentList.list(store.all(Appointment.self), status: status, period: period, staff: staff,
                                              tokens: Search.tokens(query), sort: sort, today: today, now: now, lookups: lookups)
            let groups = sort == "time" ? AppointmentList.groupByDay(result.rows) : [AppointmentList.DayGroup(day: "", items: result.rows, minutes: 0)]
            List {
                if query.isEmpty {
                    Section { StatsRow(status: $status, period: $period) }
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                    Section {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(AppointmentList.statusFilters, id: \.self) { key in
                                    FilterChip(title: Self.statusLabel[key] ?? key, count: result.counts[key] ?? 0, on: status == key) { status = key }
                                }
                            }
                            .padding(.horizontal, 16)
                        }
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                    }
                }
                ForEach(groups) { group in
                    Section {
                        ForEach(group.items) { a in
                            NavigationLink(value: HomeView.Route.appointment(a.id)) {
                                AppointmentRow(appointment: a, customer: lookups.customers[a.customerId ?? ""], vehicle: lookups.vehicles[a.vehicleId ?? ""],
                                               staff: staffById[a.staffId ?? ""], showDay: sort != "time")
                            }
                            .swipeActions(edge: .leading) { leadingActions(a) }
                            .swipeActions(edge: .trailing) { trailingActions(a) }
                            .contextMenu { AppointmentMenu(appointment: a, edit: { editing = .edit(a.id) }, cancel: { cancelling = a }, act: act, checkIn: checkIn) }
                        }
                    } header: {
                        if !group.day.isEmpty { DayHeader(day: group.day, minutes: group.minutes) }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .overlay {
                if result.rows.isEmpty {
                    if query.isEmpty {
                        ContentUnavailableView("Nicio programare", systemImage: "calendar", description: Text("Nimic pentru „\(Self.statusLabel[status] ?? "")” în „\(Self.periodLabel[period] ?? "")”."))
                    } else {
                        ContentUnavailableView.search(text: query)
                    }
                }
            }
            .navigationTitle("Programări")
            .searchable(text: $query, prompt: "Număr, client, telefon, mașină")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Perioada", selection: $period) {
                            ForEach(AppointmentList.periods, id: \.self) { Text(Self.periodLabel[$0] ?? $0).tag($0) }
                        }
                        Picker("Mecanic", selection: $staff) {
                            Text("Toți mecanicii").tag("all")
                            ForEach(store.all(Staff.self).filter(\.active).sorted { $0.order < $1.order }) { Text($0.name).tag($0.id) }
                            Text("Fără mecanic").tag("none")
                        }
                        Picker("Ordine", selection: $sort) {
                            Text("După oră").tag("time")
                            Text("Cele mai noi").tag("created")
                            Text("După client").tag("customer")
                        }
                    } label: {
                        Label("Filtre", systemImage: period == "upcoming" && staff == "all" && sort == "time" ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { editing = .new } label: { Label("Programare nouă", systemImage: "plus") }
                }
            }
            .navigationDestination(for: HomeView.Route.self) { route in
                switch route {
                case .job(let id): WorkOrderDetailView(id: id)
                case .invoice(let id): InvoiceDetailView(id: id)
                case .appointment(let id): AppointmentDetailView(id: id)
                }
            }
            .sheet(item: $editing) { BookingForm(target: $0) }
            .sheet(item: $cancelling) { CancelSheet(appointment: $0) }
            .sensoryFeedback(.success, trigger: done)
            #if DEBUG
            // Screenshots: `-GarajOpenAppointment <number>`, `-GarajNewBooking YES`.
            .task {
                let d = UserDefaults.standard
                if let n = d.string(forKey: "GarajOpenAppointment"), let a = store.all(Appointment.self).first(where: { $0.number.map(String.init) == n }) { path = [.appointment(a.id)] }
                if d.bool(forKey: "GarajNewBooking") { editing = .new }
            }
            #endif
            .alert("Nu se poate", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("OK", role: .cancel) {}
            } message: { Text(error ?? "") }
        }
    }

    @ViewBuilder private func leadingActions(_ a: Appointment) -> some View {
        if a.status == "scheduled" {
            Button { act("Confirmată") { try store.setAppointmentStatus(a.id, to: "confirmed") } } label: { Label("Confirmă", systemImage: "checkmark") }
                .tint(.green)
        }
        if (a.status == "scheduled" || a.status == "confirmed") && a.workOrderId == nil {
            Button { checkIn(a) } label: { Label("A sosit", systemImage: "car.fill") }.tint(.teal)
        }
    }

    @ViewBuilder private func trailingActions(_ a: Appointment) -> some View {
        if AppointmentRules.canMove(a.status, "cancelled") {
            Button { cancelling = a } label: { Label("Anulează", systemImage: "xmark") }.tint(.gray)
        }
        if AppointmentRules.canMove(a.status, "no_show") && a.start <= Dates.instant() {
            Button { act("Neprezentat") { try store.markNoShow(a.id) } } label: { Label("Neprezentat", systemImage: "person.slash") }.tint(.red)
        }
    }

    private func byId<T: Record>(_ type: T.Type) -> [String: T] {
        Dictionary(store.all(T.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    }

    private func act(_ message: String, _ change: () throws -> Appointment) {
        do {
            let before = try change()
            done += 1
            undo.show(message) { store.restore(before) }
        } catch { self.error = error.localizedDescription }
    }

    private func checkIn(_ a: Appointment) {
        do {
            let order = try store.checkIn(a.id)
            done += 1
            path.append(.job(order.id))
        } catch { self.error = error.localizedDescription }
    }
}

// MARK: - Pieces

/// The four numbers (D7); a tap filters.
private struct StatsRow: View {
    @Environment(AppStore.self) private var store
    @Binding var status: String
    @Binding var period: String

    var body: some View {
        let shop = store.shop
        let days = store.settings["hours"]?["days"]?.array?.compactMap { $0.number.map(Int.init) } ?? [1, 2, 3, 4, 5, 6]
        let s = AppointmentList.stats(store.all(Appointment.self), today: Dates.today(), now: Dates.instant(),
                                      staffCount: store.all(Staff.self).filter(\.active).count, open: shop.hoursOpen, close: shop.hoursClose, days: days)
        let next = store.get(Appointment.self, s.nextId)
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            Tile(title: "Azi", value: "\(s.todayCount)", detail: next.map { "următoarea la \(Dates.timeOfInstant($0.start))" } ?? "nimic de acum încolo") {
                status = "all"; period = "today"
            }
            Tile(title: "De confirmat", value: "\(s.toConfirm)", detail: "7 zile + întârziate", tint: s.toConfirm > 0 ? .orange : nil) { status = "to-confirm" }
            Tile(title: "Neprezentări", value: s.noShow.map { "\(Int(Money.jsRound($0 * 100)))%" } ?? "—", detail: "ultimele 30 de zile") {
                status = "no_show"; period = "past"
            }
            Tile(title: "Ocupare", value: s.share.map { "\(Int(Money.jsRound($0 * 100)))%" } ?? "—", detail: "săptămâna asta, \(s.booked / 60) h din \(s.capacity / 60) h") {
                status = "all"; period = "week"
            }
        }
    }

    private struct Tile: View {
        let title: String
        let value: String
        let detail: String
        var tint: Color?
        let action: () -> Void

        var body: some View {
            Button(action: action) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.subheadline).foregroundStyle(.secondary)
                    Text(value).font(.title2.weight(.semibold).monospacedDigit()).foregroundStyle(tint ?? .primary)
                    Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.8)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 14))
            }
            .buttonStyle(.plain)
        }
    }
}

private struct FilterChip: View {
    let title: String
    let count: Int
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(title)
                Text("\(count)").monospacedDigit().foregroundStyle(on ? .white.opacity(0.85) : .secondary)
            }
            .font(.subheadline.weight(.medium))
            .padding(.horizontal, 12)
            .frame(minHeight: 36)
            .foregroundStyle(on ? .white : .primary)
            .background(on ? Color.accentColor : Color(.secondarySystemGroupedBackground), in: .capsule)
        }
        .buttonStyle(.plain)
        .frame(minHeight: 44)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

private struct DayHeader: View {
    let day: String
    let minutes: Int

    var body: some View {
        let today = Dates.today()
        let name = day == today ? "Azi" : day == Dates.addDays(today, 1) ? "Mâine" : day == Dates.addDays(today, -1) ? "Ieri" : nil
        let date = Dates.parseDate(day)?.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(Locale(identifier: "ro_RO"))) ?? day
        HStack {
            Text(name.map { "\($0) · \(date)" } ?? date.capitalized)
            Spacer()
            if minutes > 0 { Text(Self.duration(minutes)).monospacedDigit() }
        }
    }

    static func duration(_ m: Int) -> String {
        m < 60 ? "\(m) min" : m % 60 == 0 ? "\(m / 60) h" : "\(m / 60) h \(m % 60) min"
    }
}

struct AppointmentRow: View {
    let appointment: Appointment
    let customer: Customer?
    let vehicle: Vehicle?
    let staff: Staff?
    var showDay = false

    var body: some View {
        let style = AppointmentRules.style(appointment.status)
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .trailing, spacing: 2) {
                if showDay { Text(Dates.display(Dates.dayOfInstant(appointment.start))).font(.caption2).foregroundStyle(.secondary) }
                Text(Dates.timeOfInstant(appointment.start)).font(.subheadline.weight(.semibold).monospacedDigit())
                Text(Dates.timeOfInstant(appointment.end)).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
            .frame(minWidth: 48, alignment: .trailing)
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline) {
                    Text(vehicle.map { People.formatPlate($0.plate) } ?? "Mașină nealeasă").font(.headline)
                    Spacer()
                    if let n = appointment.number { Text(verbatim: "#\(n)").font(.caption.monospacedDigit()).foregroundStyle(.secondary) }
                }
                Text([customer?.name, vehicle?.title].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                if !appointment.title.isEmpty { Text(appointment.title).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                HStack {
                    Label(style.label, systemImage: style.symbol).labelStyle(StatusLabelStyle()).font(.caption.weight(.medium)).foregroundStyle(style.color)
                    if let staff { Text("· \(staff.name)").font(.caption).foregroundStyle(.secondary) }
                }
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}

/// Every move a booking can make, for long press and the detail page.
struct AppointmentMenu: View {
    @Environment(AppStore.self) private var store
    let appointment: Appointment
    let edit: () -> Void
    let cancel: () -> Void
    let act: (String, () throws -> Appointment) -> Void
    let checkIn: (Appointment) -> Void

    var body: some View {
        let a = appointment
        if a.status == "scheduled" {
            Button { act("Confirmată") { try store.setAppointmentStatus(a.id, to: "confirmed") } } label: { Label("Confirmă", systemImage: "checkmark") }
        }
        if a.status == "confirmed" {
            Button { act("Neconfirmată") { try store.setAppointmentStatus(a.id, to: "scheduled") } } label: { Label("Marchează neconfirmată", systemImage: "arrow.uturn.backward") }
        }
        if (a.status == "scheduled" || a.status == "confirmed") && a.workOrderId == nil {
            Button { checkIn(a) } label: { Label("A sosit (deschide lucrarea)", systemImage: "car.fill") }
        }
        if a.status == "no_show" || a.status == "cancelled" {
            Button { act("Reprogramată") { try store.setAppointmentStatus(a.id, to: "scheduled") } } label: { Label("Programează din nou", systemImage: "arrow.counterclockwise") }
        }
        if ["scheduled", "confirmed", "arrived"].contains(a.status) {
            Button(action: edit) { Label("Editează", systemImage: "pencil") }
        }
        if AppointmentRules.canMove(a.status, "no_show") && a.start <= Dates.instant() {
            Button(role: .destructive) { act("Neprezentat") { try store.markNoShow(a.id) } } label: { Label("Neprezentat", systemImage: "person.slash") }
        }
        if AppointmentRules.canMove(a.status, "cancelled") {
            Button(role: .destructive, action: cancel) { Label("Anulează", systemImage: "xmark") }
        }
    }
}

/// Why it is called off: the customer, the shop, something else (with a note).
struct CancelSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo
    @Environment(\.dismiss) private var dismiss
    let appointment: Appointment
    @State private var reason = "client"
    @State private var note = ""

    var body: some View {
        NavigationStack {
            Form {
                Picker("Motiv", selection: $reason) {
                    ForEach(AppointmentRules.cancelReasons, id: \.key) { Text($0.label).tag($0.key) }
                }
                .pickerStyle(.inline)
                .labelsHidden()
                TextField("Notă (opțional)", text: $note, axis: .vertical)
            }
            .navigationTitle("Anulezi programarea?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Anulează programarea", role: .destructive) {
                        if let before = try? store.cancelAppointment(appointment.id, reason: reason, note: note) {
                            undo.show("Programare anulată") { store.restore(before) }
                        }
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }
}
