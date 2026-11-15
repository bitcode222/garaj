import Charts
import SwiftUI

/// Azi (docs/HOME-PAGE.md): the day, a search over everything, then the cars in the shop,
/// the bookings to confirm, the invoices to collect, and the analytics. One tap acts where it
/// can (confirm, check in, collect, remind); everything else opens the record.
struct HomeView: View {
    enum Route: Hashable { case job(String), invoice(String), appointment(String) }

    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo
    @State private var path: [Route] = []
    @State private var query = ""
    @State private var creatingJob = false
    @State private var paying: Invoice?
    @State private var period = "7d"
    @State private var stage: String?
    @State private var done = 0
    @State private var error: String?

    var body: some View {
        NavigationStack(path: $path) {
            ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    if query.isEmpty {
                        hero
                        inShop
                        toConfirm.id("confirm")
                        toCollect.id("collect")
                        analytics.id("analytics")
                    } else {
                        SearchResults(query: query) { path.append($0) }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            #if DEBUG
            // Screenshots: `-GarajHomeSection collect` scrolls there.
            .task {
                if let id = UserDefaults.standard.string(forKey: "GarajHomeSection") {
                    try? await Task.sleep(for: .milliseconds(300))
                    proxy.scrollTo(id, anchor: .top)
                }
            }
            #endif
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Azi")
            .searchable(text: $query, prompt: "Mașină, client, lucrare, factură")
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .job(let id): WorkOrderDetailView(id: id)
                case .invoice(let id): InvoiceDetailView(id: id)
                case .appointment(let id): AppointmentDetailView(id: id)
                }
            }
            .sheet(isPresented: $creatingJob) { NewWorkOrderSheet { path.append(.job($0)) } }
            .sheet(item: $paying) { PaymentSheet(invoice: $0) }
            .sensoryFeedback(.success, trigger: done)
            .alert("Nu se poate", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("OK", role: .cancel) {}
            } message: { Text(error ?? "") }
        }
    }

    // MARK: The day

    private var hero: some View {
        let shop = store.shop
        let now = Date.now
        let hour = Calendar.current.component(.hour, from: now)
        let greeting = hour >= 5 && hour < 11 ? "Bună dimineața" : hour >= 11 && hour < 18 ? "Bună ziua" : "Bună seara"
        let weekday = Calendar.current.component(.weekday, from: now) // 1 = Sunday
        let openDays = store.settings["hours"]?["days"]?.array?.compactMap { $0.number.map(Int.init) } ?? [1, 2, 3, 4, 5, 6]
        let open = openDays.contains(weekday - 1)
        return VStack(alignment: .leading, spacing: 12) {
            Text("\(greeting) · \(now.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(Locale(identifier: "ro_RO")))) · \(open ? "deschis \(shop.hoursOpen)–\(shop.hoursClose)" : "închis azi")")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            HStack(spacing: 8) {
                Button { creatingJob = true } label: { Label("Primire mașină", systemImage: "car.badge.gearshape") }
                Button { path.append(.invoice(store.createInvoiceDraft().id)) } label: { Label("Factură", systemImage: "doc.badge.plus") }
            }
            .buttonStyle(.bordered)
            .buttonBorderShape(.capsule)
            .controlSize(.regular)
        }
    }

    // MARK: Deja în service

    private var inShop: some View {
        let groups = Agenda.jobsToShow(store.all(WorkOrder.self), vatPayer: store.shop.vatPayer)
        let total = groups.reduce(0) { $0 + $1.items.count }
        let shown = groups.filter { stage == nil || $0.key == stage }
        let vehicles = byId(Vehicle.self), customers = byId(Customer.self)
        return VStack(alignment: .leading, spacing: 10) {
            SectionTitle("Deja în service", count: total)
            if total == 0 {
                EmptyCard(text: "Nicio mașină în service acum.", symbol: "car")
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        Chip(title: "Toate", count: total, color: .accentColor, on: stage == nil) { stage = nil }
                        ForEach(groups) { g in
                            let style = Labels.workOrder(g.key)
                            Chip(title: style.label, count: g.items.count, color: style.color, on: stage == g.key) { stage = stage == g.key ? nil : g.key }
                        }
                    }
                }
                Carousel {
                    ForEach(shown) { g in
                        ForEach(g.items) { order in
                            JobCard(order: order, vehicle: vehicles[order.vehicleId ?? ""], customer: customers[order.customerId ?? ""],
                                    gross: Lines.totals(order.lines.filter { !$0.refused }, vatPayer: store.shop.vatPayer).gross, currency: store.currency,
                                    next: WorkOrderRules.next[order.status]) { to in moveJob(order, to: to) }
                                .onTapGesture { path.append(.job(order.id)) }
                        }
                    }
                }
            }
        }
    }

    // MARK: De confirmat

    private var toConfirm: some View {
        let now = Dates.instant()
        let bookings = Agenda.bookingsToConfirm(store.all(Appointment.self), now: now)
        let week = bookings.week
        let booked = week.values.reduce(0, +) - (week["no_show"] ?? 0)
        let vehicles = byId(Vehicle.self), customers = byId(Customer.self), staff = byId(Staff.self)
        return VStack(alignment: .leading, spacing: 10) {
            SectionTitle("De confirmat", count: bookings.total,
                         subtitle: booked > 0 ? "\(booked - (week["scheduled"] ?? 0)) din \(booked) confirmate în următoarele 7 zile" : nil)
            if bookings.total == 0 {
                EmptyCard(text: "Toate programările sunt confirmate.", symbol: "checkmark.circle")
            } else {
                Carousel {
                    ForEach(bookings.groups) { g in
                        ForEach(g.items) { a in
                            BookingCard(appointment: a, group: groupLabel(g), late: g.key == "past",
                                        vehicle: vehicles[a.vehicleId ?? ""], customer: customers[a.customerId ?? ""], staff: staff[a.staffId ?? ""],
                                        confirm: { act("Confirmată") { try store.setAppointmentStatus(a.id, to: "confirmed") } },
                                        arrived: { checkIn(a) },
                                        noShow: { act("Neprezentat") { try store.markNoShow(a.id) } })
                                .onTapGesture { path.append(.appointment(a.id)) }
                        }
                    }
                }
            }
        }
    }

    private func groupLabel(_ g: Agenda.BookingGroup) -> String {
        guard let day = g.day else { return "Au trecut" }
        let today = Dates.today()
        if day == today { return "Azi" }
        if day == Dates.addDays(today, 1) { return "Mâine" }
        return Dates.parseDate(day)?.formatted(.dateTime.weekday(.wide).day().locale(Locale(identifier: "ro_RO"))).capitalized ?? day
    }

    // MARK: Facturi de încasat

    private var toCollect: some View {
        let collect = Agenda.invoicesToCollect(store.all(Invoice.self), paymentsByInvoice: Dictionary(grouping: store.all(Payment.self), by: \.invoiceId),
                                               today: Dates.today(), vatPayer: store.shop.vatPayer)
        let customers = byId(Customer.self)
        return VStack(alignment: .leading, spacing: 10) {
            SectionTitle("De încasat", count: collect.total,
                         subtitle: collect.due > 0 ? "\(Money.format(collect.due, currency: store.currency)) de încasat\(collect.drafts > 0 ? " · \(Money.format(collect.drafts, currency: store.currency)) în ciorne" : "")" : nil)
            if collect.total == 0 {
                EmptyCard(text: "Toate facturile sunt încasate.", symbol: "checkmark.circle")
            } else {
                Carousel {
                    ForEach(collect.groups) { g in
                        ForEach(g.items) { item in
                            CollectCard(item: item, customer: customers[item.invoice.customerId ?? ""], currency: store.currency,
                                        message: InvoiceRules.message(item.invoice, balance: item.balance, settings: store.settings),
                                        pay: { paying = item.invoice })
                                .onTapGesture { path.append(.invoice(item.invoice.id)) }
                        }
                    }
                }
            }
        }
    }

    // MARK: Analiză

    private var analytics: some View {
        let h = Analytics.home(payments: store.all(Payment.self), orders: store.all(WorkOrder.self), invoices: store.all(Invoice.self),
                               appointments: store.all(Appointment.self), today: Dates.today(), period: period)
        let c = store.currency
        return VStack(alignment: .leading, spacing: 10) {
            SectionTitle("Analiză", count: nil)
            Picker("Perioada", selection: $period) {
                Text("7 zile").tag("7d")
                Text("30 de zile").tag("30d")
                Text("12 luni").tag("12m")
            }
            .pickerStyle(.segmented)
            MetricTile(title: "Încasări", metric: h.collected, window: h.window, big: true, scale: 100) { Money.format(Int($0), currency: c, decimals: 0) }
            MetricTile(title: "Mașini primite", metric: h.received, window: h.window, big: true) { String(Int($0)) }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                MetricTile(title: "Bon mediu", metric: h.ticket, window: h.window, scale: 100) { Money.format(Int($0), currency: c, decimals: 0) }
                MetricTile(title: "Prezență", metric: h.show, window: h.window) { "\(Int(Money.jsRound($0 * 100)))%" }
                MetricTile(title: "Timp în service", metric: h.stay, window: h.window) { "\(JS.number(Money.jsRound($0 * 10) / 10).replacingOccurrences(of: ".", with: ",")) zile" }
                MetricTile(title: "Ore facturate", metric: h.hours, window: h.window) { "\(Int(Money.jsRound($0))) h" }
            }
        }
    }

    // MARK: Actions

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

    private func moveJob(_ order: WorkOrder, to: String) {
        do {
            let previous = try store.setWorkOrderStatus(order.id, to: to)
            done += 1
            undo.show("#\(order.number): \(Labels.workOrder(to).label)") { try store.restore(previous) }
        } catch { self.error = error.localizedDescription }
    }
}

// MARK: - Pieces

private struct SectionTitle: View {
    let title: String
    let count: Int?
    var subtitle: String?

    init(_ title: String, count: Int?, subtitle: String? = nil) {
        self.title = title
        self.count = count
        self.subtitle = subtitle
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(title).font(.title3.weight(.semibold))
                if let count { Text("\(count)").font(.title3).foregroundStyle(.secondary).monospacedDigit() }
            }
            if let subtitle { Text(subtitle).font(.subheadline).foregroundStyle(.secondary) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// Cards in a row that snap one by one, a finger swipes them.
private struct Carousel<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(alignment: .top, spacing: 10) { content }
                .scrollTargetLayout()
        }
        .scrollTargetBehavior(.viewAligned)
        .scrollClipDisabled()
    }
}

private struct Chip: View {
    let title: String
    let count: Int
    let color: Color
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(title)
                Text("\(count)").foregroundStyle(on ? .white.opacity(0.85) : .secondary).monospacedDigit()
            }
            .font(.subheadline.weight(.medium))
            .padding(.horizontal, 12)
            .frame(minHeight: 36)
            .foregroundStyle(on ? .white : .primary)
            .background(on ? color : Color(.secondarySystemGroupedBackground), in: .capsule)
        }
        .buttonStyle(.plain)
        .frame(minHeight: 44)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

private struct EmptyCard: View {
    let text: String
    let symbol: String
    var body: some View {
        Label(text, systemImage: symbol)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16))
    }
}

/// The card frame shared by every carousel: a tinted edge for its group, 260 pt wide.
private struct Card<Content: View>: View {
    let tint: Color
    var outlined = false
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) { content }
            .padding(14)
            .frame(width: 260, alignment: .topLeading)
            .frame(minHeight: 150, alignment: .topLeading)
            .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 18))
            .overlay(alignment: .leading) {
                UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: 18).fill(tint).frame(width: 4)
            }
            .overlay {
                if outlined { RoundedRectangle(cornerRadius: 18).strokeBorder(tint.opacity(0.6), style: StrokeStyle(lineWidth: 1, dash: [4, 3])) }
            }
            .contentShape(.rect(cornerRadius: 18))
    }
}

private struct JobCard: View {
    let order: WorkOrder
    let vehicle: Vehicle?
    let customer: Customer?
    let gross: Int
    let currency: String
    let next: String?
    let move: (String) -> Void

    var body: some View {
        let style = Labels.workOrder(order.status)
        Card(tint: style.color) {
            Label(style.label, systemImage: style.symbol).labelStyle(StatusLabelStyle()).font(.caption.weight(.semibold)).foregroundStyle(style.color)
            Text(vehicle.map { People.formatPlate($0.plate) } ?? "Fără mașină").font(.headline)
            Text([vehicle?.title, customer?.name].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
            if !order.complaint.isEmpty { Text(order.complaint).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
            Spacer(minLength: 0)
            Divider()
            HStack {
                Text(verbatim: "#\(order.number) · \(since(order.createdAt))").font(.caption).foregroundStyle(.secondary)
                Spacer()
                if gross != 0 { Text(Money.format(gross, currency: currency, decimals: 0)).font(.subheadline.weight(.semibold).monospacedDigit()) }
            }
            if let next {
                Button { move(next) } label: {
                    Label(Labels.workOrderAction(from: order.status, to: next), systemImage: Labels.workOrder(next).symbol)
                        .font(.subheadline.weight(.medium)).frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(Labels.workOrder(next).color)
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func since(_ instant: String) -> String {
        guard let day = Dates.dayOfInstant(instant) else { return "" }
        let n = Dates.diffDays(day, Dates.today())
        return n <= 0 ? "de azi" : n == 1 ? "de ieri" : "de \(n) zile"
    }
}

private struct BookingCard: View {
    let appointment: Appointment
    let group: String
    let late: Bool
    let vehicle: Vehicle?
    let customer: Customer?
    let staff: Staff?
    let confirm: () -> Void
    let arrived: () -> Void
    let noShow: () -> Void

    var body: some View {
        let tint: Color = late ? .orange : .teal
        Card(tint: tint, outlined: appointment.status == "scheduled") {
            HStack {
                Text(group).font(.caption.weight(.semibold)).foregroundStyle(tint)
                Spacer()
                Text("\(late ? "\(Dates.display(Dates.dayOfInstant(appointment.start))) " : "")\(Dates.timeOfInstant(appointment.start))")
                    .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
            Text(vehicle.map { People.formatPlate($0.plate) } ?? "Mașină nealeasă").font(.headline)
            Text([vehicle?.title, customer?.name].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
            if !appointment.title.isEmpty { Text(appointment.title).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
            Spacer(minLength: 0)
            if let staff { Text(staff.name).font(.caption).foregroundStyle(.secondary) }
            HStack(spacing: 8) {
                if late {
                    Button(action: arrived) { Label("A sosit", systemImage: "car.fill").frame(maxWidth: .infinity) }
                        .buttonStyle(.borderedProminent)
                    Button(action: noShow) { Label("Neprezentat", systemImage: "person.slash").labelStyle(.iconOnly).frame(minWidth: 28) }
                        .buttonStyle(.bordered).tint(.red)
                        .accessibilityLabel("Neprezentat")
                } else {
                    Button(action: confirm) { Label("Confirmă", systemImage: "checkmark").frame(maxWidth: .infinity) }
                        .buttonStyle(.borderedProminent)
                    if let phone = customer?.phone, !phone.isEmpty, let url = People.telURL(phone) {
                        Link(destination: url) { Label("Sună", systemImage: "phone.fill").labelStyle(.iconOnly).frame(minWidth: 28) }
                            .buttonStyle(.bordered)
                            .accessibilityLabel("Sună")
                    }
                }
            }
            .font(.subheadline.weight(.medium))
        }
    }
}

private struct CollectCard: View {
    let item: Agenda.CollectItem
    let customer: Customer?
    let currency: String
    let message: String
    let pay: () -> Void

    var body: some View {
        let style = Labels.invoice(item.state)
        let inv = item.invoice
        Card(tint: style.color, outlined: item.state == "draft") {
            Label(style.label, systemImage: style.symbol).labelStyle(StatusLabelStyle()).font(.caption.weight(.semibold)).foregroundStyle(style.color)
            Text(customer?.name ?? "Fără client").font(.headline).lineLimit(1)
            Text(verbatim: inv.label).font(.subheadline.monospacedDigit()).foregroundStyle(.secondary)
            Text(when).font(.caption).foregroundStyle(item.state == "overdue" ? .red : .secondary)
            Spacer(minLength: 0)
            Divider()
            HStack(alignment: .firstTextBaseline) {
                Text(item.state == "draft" ? "total" : "rest").font(.caption).foregroundStyle(.secondary)
                Text(Money.format(item.balance, currency: currency)).font(.headline.monospacedDigit())
                Spacer()
                if item.paid > 0 { Text("din \(Money.format(item.total, currency: currency, decimals: 0))").font(.caption).foregroundStyle(.secondary) }
            }
            if item.state != "draft" {
                HStack(spacing: 8) {
                    Button(action: pay) { Label("Încasează", systemImage: "banknote").frame(maxWidth: .infinity) }
                        .buttonStyle(.borderedProminent).tint(.green)
                    if let phone = customer?.phone, !phone.isEmpty, let url = People.whatsappURL(phone, text: message) {
                        Link(destination: url) { Label("Memento", systemImage: "text.bubble").labelStyle(.iconOnly).frame(minWidth: 28) }
                            .buttonStyle(.bordered)
                            .accessibilityLabel("Trimite un memento pe WhatsApp")
                    }
                }
                .font(.subheadline.weight(.medium))
            }
        }
    }

    private var when: String {
        if item.state == "draft" {
            let n = Dates.dayOfInstant(item.invoice.createdAt).map { Dates.diffDays($0, Dates.today()) } ?? 0
            return n <= 0 ? "ciornă de azi" : "ciornă de \(n == 1 ? "o zi" : "\(n) zile")"
        }
        if item.state == "overdue" { return "restantă de \(item.overdueDays == 1 ? "o zi" : "\(item.overdueDays) zile")" }
        guard let d = item.dueIn else { return "" }
        return d == 0 ? "scadentă azi" : d == 1 ? "scadentă mâine" : "scadentă în \(d) zile"
    }
}

/// One number with its change and a small chart of its points.
private struct MetricTile: View {
    let title: String
    let metric: Analytics.Metric
    let window: Analytics.Window
    var big = false
    /// Money is in bani; the chart's axis reads in lei.
    var scale: Double = 1
    let format: (Double) -> String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.subheadline).foregroundStyle(.secondary)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(metric.empty || metric.value == nil ? "—" : format(metric.value!))
                    .font(big ? .title2.weight(.semibold) : .headline)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let c = metric.change { ChangeBadge(change: c) }
            }
            if metric.empty {
                Text("Fără date").font(.caption).foregroundStyle(.tertiary).frame(height: big ? 90 : 36, alignment: .center).frame(maxWidth: .infinity)
            } else {
                Chart(Array(metric.points.enumerated()), id: \.offset) { i, value in
                    if let value {
                        AreaMark(x: .value("Zi", i), y: .value(title, value / scale))
                            .foregroundStyle(.linearGradient(colors: [Color.accentColor.opacity(0.35), Color.accentColor.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                            .interpolationMethod(.monotone)
                        LineMark(x: .value("Zi", i), y: .value(title, value / scale))
                            .foregroundStyle(Color.accentColor)
                            .interpolationMethod(.monotone)
                    }
                }
                .chartXAxis(.hidden)
                .chartYAxis(big ? .automatic : .hidden)
                .frame(height: big ? 90 : 36)
                .accessibilityHidden(true)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 18))
        .accessibilityElement(children: .combine)
    }
}

private struct ChangeBadge: View {
    let change: Analytics.Change

    var body: some View {
        let color: Color = change.good == nil ? .secondary : change.good! ? .green : .red
        let symbol = change.direction == "up" ? "arrow.up.right" : change.direction == "down" ? "arrow.down.right" : "arrow.right"
        let text = change.points ? "\(JS.number(Money.jsRound(abs(change.pct) * 10) / 10)) pp" : "\(JS.number(Money.jsRound(abs(change.pct) * 10) / 10))%"
        Label(text.replacingOccurrences(of: ".", with: ","), systemImage: symbol)
            .labelStyle(StatusLabelStyle())
            .font(.caption.weight(.semibold))
            .foregroundStyle(color)
            .accessibilityLabel("\(change.direction == "up" ? "Crește" : change.direction == "down" ? "Scade" : "La fel") cu \(text) față de perioada dinainte")
    }
}

/// What matches the search: cars, clients, jobs, invoices.
private struct SearchResults: View {
    @Environment(AppStore.self) private var store
    let query: String
    let open: (HomeView.Route) -> Void

    var body: some View {
        let q = query.trimmingCharacters(in: .whitespaces)
        let plate = People.normalizePlate(q)
        let match = { (s: String) in s.range(of: q, options: [.caseInsensitive, .diacriticInsensitive]) != nil }
        let vehicles = store.all(Vehicle.self).filter { (!plate.isEmpty && People.normalizePlate($0.plate).contains(plate)) || match($0.title) || match($0.vin) }
        let vehicleIds = Set(vehicles.map(\.id))
        let customers = store.all(Customer.self).filter { match($0.name) || (!q.filter(\.isNumber).isEmpty && People.normalizePhone($0.phone).contains(q.filter(\.isNumber))) }
        let customerIds = Set(customers.map(\.id))
        let jobs = store.all(WorkOrder.self)
            .filter { String($0.number) == q || vehicleIds.contains($0.vehicleId ?? "") || customerIds.contains($0.customerId ?? "") }
            .sorted { $0.number > $1.number }.prefix(15)
        let invoices = store.all(Invoice.self)
            .filter { match($0.label) || customerIds.contains($0.customerId ?? "") }
            .sorted { ($0.number ?? .max) > ($1.number ?? .max) }.prefix(15)
        let byVehicle = Dictionary(store.all(Vehicle.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let byCustomer = Dictionary(store.all(Customer.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })

        VStack(alignment: .leading, spacing: 20) {
            if jobs.isEmpty && invoices.isEmpty {
                ContentUnavailableView.search(text: query)
            }
            if !jobs.isEmpty {
                ResultGroup(title: "Lucrări") {
                    ForEach(Array(jobs)) { o in
                        ResultRow(title: "\(byVehicle[o.vehicleId ?? ""].map { People.formatPlate($0.plate) } ?? "—") · #\(o.number)",
                                  detail: byCustomer[o.customerId ?? ""]?.name ?? "", style: Labels.workOrder(o.status)) { open(.job(o.id)) }
                    }
                }
            }
            if !invoices.isEmpty {
                ResultGroup(title: "Facturi") {
                    ForEach(Array(invoices)) { i in
                        ResultRow(title: i.label, detail: byCustomer[i.customerId ?? ""]?.name ?? "", style: Labels.invoice(store.invoiceState(i))) { open(.invoice(i.id)) }
                    }
                }
            }
        }
        .padding(.top, 8)
    }
}

private struct ResultGroup<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).font(.footnote.weight(.semibold)).foregroundStyle(.secondary).textCase(.uppercase).padding(.bottom, 6)
            VStack(spacing: 0) { content }
                .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 14))
        }
    }
}

private struct ResultRow: View {
    let title: String
    let detail: String
    let style: StatusStyle
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: title).font(.body)
                    Text(detail).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Label(style.label, systemImage: style.symbol).labelStyle(StatusLabelStyle()).font(.caption).foregroundStyle(style.color)
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 52)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}
