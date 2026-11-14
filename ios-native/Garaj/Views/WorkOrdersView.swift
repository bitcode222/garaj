import SwiftUI

/// Lucrări: every job, newest first, searchable and filterable by status.
/// Read-only in phase 0; editing arrives in phase 1 (docs/IOS-NATIVE.md).
struct WorkOrdersView: View {
    @Environment(AppStore.self) private var store
    @State private var query = ""
    @State private var status: String?

    private var rows: [WorkOrderRow.Model] {
        let customers = Dictionary(uniqueKeysWithValues: store.all(Customer.self).map { ($0.id, $0) })
        let vehicles = Dictionary(uniqueKeysWithValues: store.all(Vehicle.self).map { ($0.id, $0) })
        let q = query.trimmingCharacters(in: .whitespaces).folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
        return store.all(WorkOrder.self)
            .filter { status == nil || $0.status == status }
            .map { WorkOrderRow.Model(order: $0, customer: customers[$0.customerId ?? ""], vehicle: vehicles[$0.vehicleId ?? ""]) }
            .filter { q.isEmpty || $0.searchText.contains(q) }
            .sorted { $0.order.number > $1.order.number }
    }

    var body: some View {
        NavigationStack {
            let rows = rows
            List(rows) { row in
                NavigationLink(value: row.order.id) {
                    WorkOrderRow(model: row)
                }
            }
            .listStyle(.plain)
            .overlay {
                if rows.isEmpty {
                    if query.isEmpty && status == nil {
                        ContentUnavailableView("Nicio lucrare", systemImage: "wrench.and.screwdriver", description: Text("Lucrările apar aici după check-in."))
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
            }
        }
    }
}

struct WorkOrderRow: View {
    struct Model: Identifiable {
        let order: WorkOrder
        let customer: Customer?
        let vehicle: Vehicle?
        var id: String { order.id }
        var searchText: String {
            ["\(order.number)", customer?.name, vehicle?.plate, vehicle?.title, order.complaint]
                .compactMap { $0 }.joined(separator: " ")
                .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
        }
    }

    let model: Model

    var body: some View {
        let style = Labels.workOrder(model.order.status)
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(model.vehicle?.plate ?? "Fără mașină")
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
            Label(style.label, systemImage: style.symbol)
                .font(.caption.weight(.medium))
                .foregroundStyle(style.color)
        }
        .padding(.vertical, 2)
    }
}

/// Phase 0: what the job is, read-only.
struct WorkOrderDetailView: View {
    @Environment(AppStore.self) private var store
    let id: String

    var body: some View {
        if let order = store.get(WorkOrder.self, id) {
            let vehicle = store.get(Vehicle.self, order.vehicleId)
            let customer = store.get(Customer.self, order.customerId)
            let style = Labels.workOrder(order.status)
            List {
                Section {
                    LabeledContent("Status") { Label(style.label, systemImage: style.symbol).foregroundStyle(style.color) }
                    if let vehicle { LabeledContent("Mașină", value: "\(vehicle.plate) · \(vehicle.title)") }
                    if let customer { LabeledContent("Client", value: customer.name) }
                    if let km = order.mileage { LabeledContent("Kilometraj", value: "\(km.formatted()) km") }
                }
                if !order.complaint.isEmpty {
                    Section("Ce reclamă clientul") { Text(order.complaint) }
                }
                Section("Linii") {
                    ForEach(order.lines) { line in
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading) {
                                Text(line.description)
                                Text("\(Money.formatQuantity(line.qty)) \(line.unit) × \(Money.format(line.unitPrice, currency: store.currency))")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle(Text(verbatim: "Lucrarea #\(order.number)"))
            .navigationBarTitleDisplayMode(.inline)
        } else {
            ContentUnavailableView("Lucrarea nu mai există", systemImage: "wrench.and.screwdriver")
        }
    }
}
