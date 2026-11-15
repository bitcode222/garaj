import SwiftUI

/// Lucrări: every job, newest first; search, status filter, swipe to the next step, new job.
struct WorkOrdersView: View {
    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo
    @State private var query = ""
    @State private var status: String?
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
            let rows = all.filter { status == nil || $0.order.status == status }
            let openRows = rows.filter { Self.open.contains($0.order.status) }
            let closedRows = rows.filter { !Self.open.contains($0.order.status) }
            let openNet = openRows.reduce(0) { $0 + Lines.totals($1.order.lines.filter { !$0.refused }, vatPayer: store.shop.vatPayer).net }
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
                if !openRows.isEmpty {
                    Section {
                        ForEach(openRows) { rowView($0) }
                    } header: {
                        CapsHeader("Deschise · \(openRows.count)")
                    } footer: {
                        if openNet != 0 { Text("Total deschis: \(Money.format(openNet, currency: store.currency, decimals: 0)) fără TVA") }
                    }
                }
                if !closedRows.isEmpty {
                    Section {
                        ForEach(closedRows) { rowView($0) }
                    } header: {
                        CapsHeader("Predate și anulate · \(closedRows.count)")
                    }
                }
            }
            .listStyle(.insetGrouped)
            .band(250)
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
            .navigationTitle("Lucrări")
            .navigationDestination(for: String.self) { id in
                WorkOrderDetailView(id: id)
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Caută număr, client, mașină")
            .toolbar {
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

    private func rowView(_ row: WorkOrderRow.Model) -> some View {
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
