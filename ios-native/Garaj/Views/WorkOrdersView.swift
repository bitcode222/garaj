import SwiftUI

/// Atelier: every job, newest first; open jobs as cards (look 3); search, status filter, swipe to the next step, new job.
struct WorkOrdersView: View {
    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo
    @State private var query = ""
    @State private var status: String?
    @AppStorage("jobs.sort") private var sort = "new"
    @AppStorage("jobs.group") private var group = "open"
    @State private var creating = false
    @State private var path: [String] = []
    @State private var moved = 0
    @State private var error: String?

    private static let open: Set<String> = ["estimate", "approved", "in_progress", "waiting_parts", "ready"]

    /// Every job matching the search (the status filter is applied after, so the chips can count).
    private var matching: [WorkOrderRow.Model] {
        let customers = Dictionary(store.all(Customer.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let vehicles = Dictionary(store.all(Vehicle.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let q = query.trimmingCharacters(in: .whitespaces).folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
        let vatPayer = store.shop.vatPayer
        return store.all(WorkOrder.self)
            .map { WorkOrderRow.Model(order: $0, customer: customers[$0.customerId ?? ""], vehicle: vehicles[$0.vehicleId ?? ""], vatPayer: vatPayer) }
            .filter { q.isEmpty || $0.searchText.contains(q) || $0.plateKey.contains(People.normalizePlate(q)) && !People.normalizePlate(q).isEmpty }
            .sorted { $0.order.number > $1.order.number }
    }

    var body: some View {
        NavigationStack(path: $path) {
            let all = matching
            let counts = Dictionary(grouping: all, by: \.order.status).mapValues(\.count)
            let rows = sorted(all.filter { status == nil || $0.order.status == status })
            let sections = grouped(rows)
            List {
                Section {
                    ChipRow {
                        CountChip(title: "Toate", count: all.count, on: status == nil) { status = nil }
                        ForEach(Labels.workOrderOrder.filter { (counts[$0] ?? 0) > 0 }, id: \.self) { key in
                            CountChip(title: Labels.workOrder(key).label, count: counts[key] ?? 0, on: status == key) { status = status == key ? nil : key }
                        }
                    }
                }
                .bareRow()
                ForEach(sections, id: \.title) { section in
                    let net = section.rows.reduce(0) { $0 + Lines.totals($1.order.lines.filter { !$0.refused }, vatPayer: store.shop.vatPayer).net }
                    Section {
                        ForEach(section.rows) { rowView($0) }
                    } header: {
                        CapsHeader("\(section.title) · \(section.rows.count)")
                    } footer: {
                        if net != 0 && section.rows.contains(where: { Self.open.contains($0.order.status) }) {
                            Text("Total: \(Money.format(net, currency: store.currency, decimals: 0)) fără TVA")
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .sensoryFeedback(.selection, trigger: status)
            .overlay {
                if rows.isEmpty {
                    if query.isEmpty && status == nil {
                        ContentUnavailableView("Nicio lucrare", systemImage: "wrench.and.screwdriver", description: Text("Apasă + ca să deschizi o lucrare."))
                    } else {
                        ContentUnavailableView.search(text: query)
                    }
                }
            }
            .navigationTitle("Atelier")
            .navigationDestination(for: String.self) { id in
                WorkOrderDetailView(id: id)
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Caută număr, client, mașină")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    SortGroupMenu(sorts: [("new", "Cele mai noi"), ("old", "Cele mai vechi"), ("client", "Client (A–Z)"), ("value", "Valoare"), ("car", "Mașină (A–Z)")],
                                  sort: $sort,
                                  groups: [("open", "Deschise / închise"), ("status", "Stare"), ("mechanic", "Mecanic"), ("none", "Fără grupare")],
                                  group: $group)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { creating = true } label: { Label("Lucrare nouă", systemImage: "plus") }
                }
            }
            .sheet(isPresented: $creating) {
                NewWorkOrderSheet { id in path.append(id) }
            }
            .sensoryFeedback(.success, trigger: moved)
            #if DEBUG
            // Screenshots: `-GarajOpenWorkOrder <number>` opens that job, `-GarajNewWorkOrder YES` the new-job sheet.
            .task {
                let d = UserDefaults.standard
                if let n = d.string(forKey: "GarajOpenWorkOrder"), let o = store.all(WorkOrder.self).first(where: { "\($0.number)" == n }) { path = [o.id] }
                if d.bool(forKey: "GarajNewWorkOrder") { creating = true }
            }
            #endif
            .alert("Nu se poate", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("OK", role: .cancel) {}
            } message: { Text(error ?? "") }
        }
    }

    private func sorted(_ rows: [WorkOrderRow.Model]) -> [WorkOrderRow.Model] {
        let ro = Locale(identifier: "ro")
        switch sort {
        case "old": return rows.sorted { $0.order.number < $1.order.number }
        case "client": return rows.sorted { ($0.customer?.name ?? "").compare($1.customer?.name ?? "", locale: ro) == .orderedAscending }
        case "value": return rows.sorted { $0.gross > $1.gross }
        case "car": return rows.sorted { ($0.vehicle?.title ?? "").compare($1.vehicle?.title ?? "", locale: ro) == .orderedAscending }
        default: return rows.sorted { $0.order.number > $1.order.number }
        }
    }

    /// The list's sections for the chosen grouping, each keeping the sort order.
    private func grouped(_ rows: [WorkOrderRow.Model]) -> [(title: String, rows: [WorkOrderRow.Model])] {
        func split(_ keys: [String], _ key: (WorkOrderRow.Model) -> String, _ title: (String) -> String) -> [(title: String, rows: [WorkOrderRow.Model])] {
            let by = Dictionary(grouping: rows, by: key)
            return keys.compactMap { k in by[k].map { (title(k), $0) } }
        }
        switch group {
        case "status":
            return split(Labels.workOrderOrder, { $0.order.status }, { Labels.workOrder($0).label })
        case "mechanic":
            let staff = Dictionary(store.all(Staff.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
            let keys = store.all(Staff.self).sorted { $0.order < $1.order }.map(\.id) + [""]
            return split(keys, { staff[$0.order.staffId ?? ""] == nil ? "" : $0.order.staffId! }, { staff[$0]?.name ?? "Fără mecanic" })
        case "none":
            return rows.isEmpty ? [] : [("Toate", rows)]
        default:
            return split(["open", "closed"], { Self.open.contains($0.order.status) ? "open" : "closed" }, { $0 == "open" ? "Deschise" : "Predate și anulate" })
        }
    }

    @ViewBuilder private func rowView(_ row: WorkOrderRow.Model) -> some View {
        if Self.open.contains(row.order.status) { card(row) } else { plainRow(row) }
    }

    /// An open job as a card (look 3): what it is, a summary, the next step as the main button.
    private func card(_ row: WorkOrderRow.Model) -> some View {
        let order = row.order
        let staff = store.get(Staff.self, order.staffId)?.name
        let phone = row.customer?.phone ?? ""
        return JobCard(make: row.vehicle?.make ?? "",
                       eyebrow: [row.vehicle?.title.nonEmpty, row.vehicle.map { People.formatPlate($0.plate) }].compactMap { $0 }.joined(separator: " · ").nonEmpty ?? "Fără mașină",
                       title: JobText.headline(order),
                       status: Labels.workOrder(order.status),
                       meta: [row.customer?.name.nonEmpty, order.lines.isEmpty ? nil : Money.format(row.gross, currency: store.currency, decimals: 0)].compactMap { $0 }.joined(separator: " · "),
                       summary: [staff, JobText.summary(order)].compactMap { $0 }.joined(separator: ": "),
                       next: WorkOrderRules.next[order.status].map { to in (Labels.workOrderAction(from: order.status, to: to), Labels.workOrder(to).symbol, { move(order, to: to) }) },
                       phone: phone.isEmpty ? nil : People.telURL(phone),
                       open: { path.append(order.id) }) {
            Section {
                ForEach(WorkOrderRules.transitions[order.status] ?? [], id: \.self) { to in
                    Button(role: to == "cancelled" ? .destructive : nil) { move(order, to: to) } label: {
                        Label(Labels.workOrderAction(from: order.status, to: to), systemImage: Labels.workOrder(to).symbol)
                    }
                }
            }
            if !phone.isEmpty, let url = People.whatsappURL(phone, text: "") {
                Section { Link(destination: url) { Label("Scrie pe WhatsApp", systemImage: "text.bubble") } }
            }
            Section {
                Button { path.append(order.id) } label: { Label("Deschide lucrarea #\(order.number)", systemImage: "arrow.up.right") }
            }
        }
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
        .swipeActions(edge: .leading) {
            if let next = WorkOrderRules.next[order.status] {
                Button { move(order, to: next) } label: {
                    Label(Labels.workOrderAction(from: order.status, to: next), systemImage: Labels.workOrder(next).symbol)
                }
                .tint(Labels.workOrder(next).color)
            }
        }
    }

    private func plainRow(_ row: WorkOrderRow.Model) -> some View {
        NavigationLink(value: row.order.id) {
            WorkOrderRow(model: row, currency: store.currency)
        }
        .swipeActions(edge: .leading) {
            if let next = WorkOrderRules.next[row.order.status] {
                Button { move(row.order, to: next) } label: {
                    Label(Labels.workOrderAction(from: row.order.status, to: next), systemImage: Labels.workOrder(next).symbol)
                }
                .tint(Labels.workOrder(next).color)
            }
        }
        .contextMenu {
            ForEach(WorkOrderRules.transitions[row.order.status] ?? [], id: \.self) { to in
                Button(role: to == "cancelled" ? .destructive : nil) { move(row.order, to: to) } label: {
                    Label(Labels.workOrderAction(from: row.order.status, to: to), systemImage: Labels.workOrder(to).symbol)
                }
            }
        }
    }

    private func move(_ order: WorkOrder, to: String) {
        do {
            let previous = try store.setWorkOrderStatus(order.id, to: to)
            moved += 1
            undo.show("#\(order.number): \(Labels.workOrder(to).label)") { try store.restore(previous) }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct WorkOrderRow: View {
    struct Model: Identifiable {
        let order: WorkOrder
        let customer: Customer?
        let vehicle: Vehicle?
        let vatPayer: Bool
        var id: String { order.id }
        var gross: Int { Lines.totals(order.lines.filter { !$0.refused }, vatPayer: vatPayer).gross }
        var plateKey: String { People.normalizePlate(vehicle?.plate ?? "") }
        var searchText: String {
            ["\(order.number)", customer?.name, vehicle?.plate, vehicle?.title, order.complaint]
                .compactMap { $0 }.joined(separator: " ")
                .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
        }
    }

    let model: Model
    let currency: String

    var body: some View {
        HStack(spacing: 12) {
            MakeLogo(make: model.vehicle?.make ?? "")
            VStack(alignment: .leading, spacing: 3) {
                Text(model.vehicle?.title.nonEmpty ?? "Fără mașină").lineLimit(1)
                Text([model.vehicle.map { People.formatPlate($0.plate) }, model.customer?.name].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                StatusPill(style: Labels.workOrder(model.order.status)).padding(.top, 2)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                if !model.order.lines.isEmpty {
                    Text(Money.format(model.gross, currency: currency, decimals: 0)).font(.body.weight(.semibold)).monospacedDigit()
                }
                Text(verbatim: "#\(model.order.number)").font(.caption).monospacedDigit().foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}

/// Icon and text close together, for status labels in rows.
struct StatusLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 4) {
            configuration.icon
            configuration.title
        }
    }
}
