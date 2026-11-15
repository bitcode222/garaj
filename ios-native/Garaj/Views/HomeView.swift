import Charts
import SwiftUI

/// Azi (docs/HOME-PAGE.md; look A, docs/IOS-NATIVE.md §7): the greeting and the day, four shortcuts,
/// four numbers, then the cars in the shop, the bookings to confirm, the invoices to collect and the
/// analytics, as list rows with status capsules. Swipe a row for its next step; tap it to open it.
struct HomeView: View {
    enum Route: Hashable { case job(String), invoice(String), appointment(String) }

    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo
    @State private var path: [Route] = []
    @State private var query = ""
    @State private var searching = false
    @State private var creatingJob = false
    @State private var booking: BookingForm.Target?
    @State private var paying: Invoice?
    @State private var period = "7d"
    @State private var stage: String?
    @State private var done = 0
    @State private var error: String?

    var body: some View {
        NavigationStack(path: $path) {
            ScrollViewReader { proxy in
                List {
                    if query.isEmpty {
                        shortcuts
                        numbers(proxy)
                        inShop.id("shop")
                        toConfirm.id("confirm")
                        toCollect.id("collect")
                        analytics.id("analytics")
                    } else {
                        Section { SearchResults(query: query) { path.append($0) } }.bareRow()
                    }
                }
                .listStyle(.insetGrouped)
                .listSectionSpacing(20)
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
            .navigationTitle(greeting)
            .navigationSubtitle(dayLine)
            .searchable(text: $query, isPresented: $searching, prompt: "Mașină, client, lucrare, factură")
            .toolbar {
                Menu {
                    Button { booking = .new } label: { Label("Programare nouă", systemImage: "calendar.badge.plus") }
                    Button { creatingJob = true } label: { Label("Primire mașină", systemImage: "car.badge.gearshape") }
                    Button { path.append(.invoice(store.createInvoiceDraft().id)) } label: { Label("Factură nouă", systemImage: "doc.badge.plus") }
                } label: {
                    Label("Adaugă", systemImage: "plus")
                }
            }
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .job(let id): WorkOrderDetailView(id: id)
                case .invoice(let id): InvoiceDetailView(id: id)
                case .appointment(let id): AppointmentDetailView(id: id)
                }
            }
            .sheet(isPresented: $creatingJob) { NewWorkOrderSheet { path.append(.job($0)) } }
            .sheet(item: $booking) { BookingForm(target: $0) }
            .sheet(item: $paying) { PaymentSheet(invoice: $0) }
            .sensoryFeedback(.success, trigger: done)
            .alert("Nu se poate", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("OK", role: .cancel) {}
            } message: { Text(error ?? "") }
        }
    }

    // MARK: The day

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: .now)
        return hour >= 5 && hour < 11 ? "Bună dimineața" : hour >= 11 && hour < 18 ? "Bună ziua" : "Bună seara"
    }

    private var dayLine: String {
        let shop = store.shop
        let weekday = Calendar.current.component(.weekday, from: .now) // 1 = Sunday
        let openDays = store.settings["hours"]?["days"]?.array?.compactMap { $0.number.map(Int.init) } ?? [1, 2, 3, 4, 5, 6]
        let day = Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(Locale(identifier: "ro_RO"))).capitalizedFirst
        return "\(day) · \(openDays.contains(weekday - 1) ? "deschis \(shop.hoursOpen)–\(shop.hoursClose)" : "închis azi")"
    }

    private var shortcuts: some View {
        Section {
            HStack(spacing: 10) {
                QuickAction(title: "Programare", symbol: "calendar.badge.plus") { booking = .new }
                QuickAction(title: "Lucrare", symbol: "wrench.and.screwdriver") { creatingJob = true }
                QuickAction(title: "Factură", symbol: "doc.badge.plus") { path.append(.invoice(store.createInvoiceDraft().id)) }
                QuickAction(title: "Caută", symbol: "magnifyingglass") { searching = true }
            }
        }
        .bareRow()
    }

    private func numbers(_ proxy: ScrollViewProxy) -> some View {
        let today = Dates.today()
        let jobs = Agenda.jobsToShow(store.all(WorkOrder.self), vatPayer: store.shop.vatPayer)
        let inShop = jobs.reduce(0) { $0 + $1.items.count }
        let ready = jobs.first { $0.key == "ready" }?.items.count ?? 0
        let bookings = Agenda.bookingsToConfirm(store.all(Appointment.self), now: Dates.instant())
        let soon = bookings.groups.filter { $0.day == today || $0.day == Dates.addDays(today, 1) }.reduce(0) { $0 + $1.items.count }
        let collect = Agenda.invoicesToCollect(store.all(Invoice.self), paymentsByInvoice: Dictionary(grouping: store.all(Payment.self), by: \.invoiceId),
                                               today: today, vatPayer: store.shop.vatPayer)
        let overdue = collect.groups.first { $0.key == "overdue" }?.items.count ?? 0
        // This month so far against the same days of last month (net, like Rapoarte).
        let invoices = store.all(Invoice.self)
        let monthStart = "\(Dates.monthKey(today))-01"
        let lastStart = Dates.addMonths(monthStart, -1)
        let now = Reports.summarize(invoices, from: monthStart, to: today).net
        let before = Reports.summarize(invoices, from: lastStart, to: min(Dates.addMonths(today, -1), Dates.addDays(monthStart, -1))).net
        let ro = Locale(identifier: "ro_RO")
        let month = Dates.parseDate(monthStart)?.formatted(.dateTime.month(.wide).locale(ro)) ?? ""
        let lastMonth = Dates.parseDate(lastStart)?.formatted(.dateTime.month(.abbreviated).locale(ro)) ?? ""
        let change = before > 0 ? Int(Money.jsRound(Double(now - before) / Double(before) * 100)) : nil
        return Section {
            TileGrid {
                StatTile(label: "În service", value: "\(inShop)", detail: ready > 0 ? "\(ready) gata de predare" : "niciuna gata încă") { withAnimation { proxy.scrollTo("shop", anchor: .top) } }
                StatTile(label: "De confirmat", value: "\(bookings.total)", detail: soon > 0 ? "\(soon) azi și mâine" : "nimic urgent",
                         detailColor: soon > 0 ? .orange : nil) { withAnimation { proxy.scrollTo("confirm", anchor: .top) } }
                StatTile(label: "De încasat", value: Money.format(collect.due, currency: store.currency, decimals: 0),
                         detail: overdue > 0 ? "\(overdue) \(overdue == 1 ? "restantă" : "restante")" : "nimic restant",
                         detailColor: overdue > 0 ? .red : nil) { withAnimation { proxy.scrollTo("collect", anchor: .top) } }
                StatTile(label: "Venit în \(month)", value: Money.format(now, currency: store.currency, decimals: 0),
                         detail: change.map { "\($0 >= 0 ? "+" : "")\($0)% față de \(lastMonth)" } ?? "fără TVA",
                         detailColor: change.map { $0 >= 0 ? Color.green : Color.red }) { withAnimation { proxy.scrollTo("analytics", anchor: .top) } }
            }
        }
        .bareRow()
    }

    // MARK: Deja în service

    private var inShop: some View {
        let groups = Agenda.jobsToShow(store.all(WorkOrder.self), vatPayer: store.shop.vatPayer)
        let total = groups.reduce(0) { $0 + $1.items.count }
        let shown = groups.filter { stage == nil || $0.key == stage }
        let vehicles = byId(Vehicle.self), customers = byId(Customer.self), staff = byId(Staff.self)
        return Section {
            if total == 0 {
                Text("Nicio mașină în service acum.").foregroundStyle(.secondary)
            }
            ForEach(shown) { g in
                ForEach(g.items) { order in
                    let vehicle = vehicles[order.vehicleId ?? ""]
                    Button { path.append(.job(order.id)) } label: {
                        HomeRow(title: [vehicle?.title, vehicle.map { People.formatPlate($0.plate) }].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ").nonEmpty ?? "Fără mașină",
                                subtitle: [customers[order.customerId ?? ""]?.name, staff[order.staffId ?? ""]?.name].compactMap { $0 }.joined(separator: " · "),
                                pill: Labels.workOrder(order.status),
                                value: amount(Lines.totals(order.lines.filter { !$0.refused }, vatPayer: store.shop.vatPayer).gross))
                    }
                    .tint(.primary)
                    .swipeActions(edge: .leading) {
                        if let next = WorkOrderRules.next[order.status] {
                            Button { moveJob(order, to: next) } label: {
                                Label(Labels.workOrderAction(from: order.status, to: next), systemImage: Labels.workOrder(next).symbol)
                            }
                            .tint(Labels.workOrder(next).color)
                        }
                    }
                }
            }
        } header: {
            HStack {
                CapsHeader("Deja în service")
                Spacer()
                if total > 0 {
                    Menu {
                        Picker("Etapa", selection: $stage) {
                            Text("Toate · \(total)").tag(String?.none)
                            ForEach(groups) { g in Text("\(Labels.workOrder(g.key).label) · \(g.items.count)").tag(Optional(g.key)) }
                        }
                    } label: {
                        Label(stage.map { Labels.workOrder($0).label } ?? "Toate", systemImage: "line.3.horizontal.decrease")
                            .font(.footnote.weight(.semibold))
                            .textCase(nil)
                    }
                }
            }
        }
    }

    // MARK: De confirmat

    private var toConfirm: some View {
        let bookings = Agenda.bookingsToConfirm(store.all(Appointment.self), now: Dates.instant())
        let week = bookings.week
        let booked = week.values.reduce(0, +) - (week["no_show"] ?? 0)
        let vehicles = byId(Vehicle.self), customers = byId(Customer.self)
        return Section {
            if bookings.total == 0 {
                Text("Toate programările sunt confirmate.").foregroundStyle(.secondary)
            }
            ForEach(bookings.groups) { g in
                ForEach(g.items) { a in
                    let late = g.key == "past"
                    let customer = customers[a.customerId ?? ""]
                    let vehicle = vehicles[a.vehicleId ?? ""]
                    HStack(spacing: 12) {
                        Button { path.append(.appointment(a.id)) } label: {
                            HStack(spacing: 12) {
                                TimeColumn(time: Dates.timeOfInstant(a.start), detail: late ? "a trecut" : groupLabel(g).lowercased())
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(customer?.name ?? "Client necunoscut").lineLimit(1)
                                    Text([a.title, vehicle.map { People.formatPlate($0.plate) }].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                                        .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                                }
                                Spacer(minLength: 4)
                            }
                            .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                        if late {
                            Button("A sosit") { checkIn(a) }.fontWeight(.semibold).buttonStyle(.borderless)
                        } else {
                            Button("Confirmă") { act("Confirmată") { try store.setAppointmentStatus(a.id, to: "confirmed") } }
                                .fontWeight(.semibold).buttonStyle(.borderless)
                        }
                    }
                    .swipeActions(edge: .trailing) {
                        if late {
                            Button(role: .destructive) { act("Neprezentat") { try store.markNoShow(a.id) } } label: { Label("Neprezentat", systemImage: "person.slash") }
                        }
                        if let phone = customer?.phone, !phone.isEmpty, let url = People.telURL(phone) {
                            Link(destination: url) { Label("Sună", systemImage: "phone.fill") }.tint(.green)
                        }
                    }
                }
            }
        } header: {
            CapsHeader("De confirmat")
        } footer: {
            if booked > 0 { Text("\(booked - (week["scheduled"] ?? 0)) din \(booked) confirmate în următoarele 7 zile.") }
        }
    }

    private func groupLabel(_ g: Agenda.BookingGroup) -> String {
        guard let day = g.day else { return "Au trecut" }
        let today = Dates.today()
        if day == today { return "Azi" }
        if day == Dates.addDays(today, 1) { return "Mâine" }
        return Dates.parseDate(day)?.formatted(.dateTime.weekday(.abbreviated).day().locale(Locale(identifier: "ro_RO"))) ?? day
    }

    // MARK: Facturi de încasat

    private var toCollect: some View {
        let collect = Agenda.invoicesToCollect(store.all(Invoice.self), paymentsByInvoice: Dictionary(grouping: store.all(Payment.self), by: \.invoiceId),
                                               today: Dates.today(), vatPayer: store.shop.vatPayer)
        let customers = byId(Customer.self)
        return Section {
            if collect.total == 0 {
                Text("Toate facturile sunt încasate.").foregroundStyle(.secondary)
            }
            ForEach(collect.groups) { g in
                ForEach(g.items) { item in
                    let customer = customers[item.invoice.customerId ?? ""]
                    Button { path.append(.invoice(item.invoice.id)) } label: {
                        HomeRow(title: "\(item.invoice.number == nil ? "Ciornă" : item.invoice.label) · \(customer?.name ?? "Fără client")",
                                subtitle: when(item), pill: Labels.invoice(item.state),
                                value: Money.format(item.balance, currency: store.currency))
                    }
                    .tint(.primary)
                    .swipeActions(edge: .leading) {
                        if item.state != "draft" {
                            Button { paying = item.invoice } label: { Label("Încasează", systemImage: "banknote") }.tint(.green)
                        }
                    }
                    .swipeActions(edge: .trailing) {
                        if item.state != "draft", let phone = customer?.phone, !phone.isEmpty,
                           let url = People.whatsappURL(phone, text: InvoiceRules.message(item.invoice, balance: item.balance, settings: store.settings)) {
                            Link(destination: url) { Label("Memento", systemImage: "text.bubble") }.tint(.green)
                        }
                    }
                }
            }
        } header: {
            CapsHeader("De încasat")
        } footer: {
            if collect.due > 0 {
                Text("\(Money.format(collect.due, currency: store.currency)) de încasat\(collect.drafts > 0 ? " · \(Money.format(collect.drafts, currency: store.currency)) în ciorne" : ""). Glisează spre dreapta pentru a încasa.")
            }
        }
    }

    private func when(_ item: Agenda.CollectItem) -> String {
        if item.state == "draft" {
            let n = Dates.dayOfInstant(item.invoice.createdAt).map { Dates.diffDays($0, Dates.today()) } ?? 0
            return n <= 0 ? "ciornă de azi" : "ciornă de \(n == 1 ? "o zi" : "\(n) zile")"
        }
        if item.state == "overdue" { return "restantă de \(item.overdueDays == 1 ? "o zi" : "\(item.overdueDays) zile")" }
        guard let d = item.dueIn else { return Dates.display(item.invoice.issueDate) }
        return d == 0 ? "scadentă azi" : d == 1 ? "scadentă mâine" : "scadentă în \(d) zile"
    }

    // MARK: Analiză

    private var analytics: some View {
        let h = Analytics.home(payments: store.all(Payment.self), orders: store.all(WorkOrder.self), invoices: store.all(Invoice.self),
                               appointments: store.all(Appointment.self), today: Dates.today(), period: period)
        let c = store.currency
        return Section {
            VStack(spacing: 10) {
                Picker("Perioada", selection: $period) {
                    Text("7 zile").tag("7d")
                    Text("30 de zile").tag("30d")
                    Text("12 luni").tag("12m")
                }
                .pickerStyle(.segmented)
                MetricTile(title: "Încasări", metric: h.collected, window: h.window, big: true, scale: 100) { Money.format(Int($0), currency: c, decimals: 0) }
                MetricTile(title: "Mașini primite", metric: h.received, window: h.window, big: true) { String(Int($0)) }
                TileGrid {
                    MetricTile(title: "Bon mediu", metric: h.ticket, window: h.window, scale: 100) { Money.format(Int($0), currency: c, decimals: 0) }
                    MetricTile(title: "Prezență", metric: h.show, window: h.window) { "\(Int(Money.jsRound($0 * 100)))%" }
                    MetricTile(title: "Timp în service", metric: h.stay, window: h.window) { "\(JS.number(Money.jsRound($0 * 10) / 10).replacingOccurrences(of: ".", with: ",")) zile" }
                    MetricTile(title: "Ore facturate", metric: h.hours, window: h.window) { "\(Int(Money.jsRound($0))) h" }
                }
            }
        } header: {
            CapsHeader("Analiză")
        }
        .bareRow()
    }

    // MARK: Actions

    private func amount(_ gross: Int) -> String? { gross == 0 ? nil : Money.format(gross, currency: store.currency, decimals: 0) }

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

/// A list row of look A: title, a muted line, the status capsule, the amount on the right.
struct HomeRow: View {
    let title: String
    let subtitle: String
    let pill: StatusStyle
    var value: String?

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).lineLimit(1)
                if !subtitle.isEmpty { Text(subtitle).font(.subheadline).foregroundStyle(.secondary).lineLimit(1) }
                StatusPill(style: pill).padding(.top, 2)
            }
            Spacer(minLength: 8)
            if let value { Text(value).font(.body.weight(.semibold)).monospacedDigit().lineLimit(1) }
        }
        .padding(.vertical, 2)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }
}

extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
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
                StatusPill(style: style)
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 52)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}
