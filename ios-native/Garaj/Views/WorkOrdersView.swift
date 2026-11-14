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

    private var rows: [WorkOrderRow.Model] {
        let customers = Dictionary(store.all(Customer.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let vehicles = Dictionary(store.all(Vehicle.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let q = query.trimmingCharacters(in: .whitespaces).folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
        let vatPayer = store.shop.vatPayer
        return store.all(WorkOrder.self)
            .filter { status == nil || $0.status == status }
            .map { WorkOrderRow.Model(order: $0, customer: customers[$0.customerId ?? ""], vehicle: vehicles[$0.vehicleId ?? ""], vatPayer: vatPayer) }
            .filter { q.isEmpty || $0.searchText.contains(q) || $0.plateKey.contains(People.normalizePlate(q)) && !People.normalizePlate(q).isEmpty }
            .sorted { $0.order.number > $1.order.number }
    }

    var body: some View {
        NavigationStack(path: $path) {
            let rows = rows
            List(rows) { row in
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
            .listStyle(.plain)
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
            .searchable(text: $query, prompt: "Număr, client, mașină")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Status", selection: $status) {
                            Text("Toate").tag(String?.none)
                            ForEach(Labels.workOrderOrder, id: \.self) { key in
                                let style = Labels.workOrder(key)
                                Label(style.label, systemImage: style.symbol).tag(Optional(key))
                            }
                        }
                    } label: {
                        Label("Filtru", systemImage: status == nil ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
                    }
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
        let style = Labels.workOrder(model.order.status)
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(model.vehicle.map { People.formatPlate($0.plate) } ?? "Fără mașină")
                    .font(.headline)
                Spacer()
                Text(verbatim: "#\(model.order.number)")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            Text([model.vehicle?.title, model.customer?.name].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            HStack(alignment: .firstTextBaseline) {
                Label(style.label, systemImage: style.symbol)
                    .labelStyle(StatusLabelStyle())
                    .font(.caption.weight(.medium))
                    .foregroundStyle(style.color)
                Spacer()
                if !model.order.lines.isEmpty {
                    Text(Money.format(model.gross, currency: currency))
                        .font(.subheadline.monospacedDigit())
                }
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
