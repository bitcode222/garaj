import SwiftUI

/// Lucrare nouă: client, car, what's wrong, km, mechanic. Opens as a Deviz.
struct NewWorkOrderSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo
    @Environment(\.dismiss) private var dismiss
    let onCreated: (String) -> Void

    @State private var customerId: String?
    @State private var vehicleId: String?
    @State private var complaint = ""
    @State private var mileage = ""
    @State private var staffId: String?
    @State private var serviceIds: [String] = []
    @State private var error: String?

    var body: some View {
        let customers = store.all(Customer.self).sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        let vehicles = store.all(Vehicle.self)
        let mine = vehicles.filter { $0.customerId == customerId }
        NavigationStack {
            Form {
                Section {
                    NavigationLink {
                        SearchPicker(title: "Client", items: customers, text: { $0.name }, detail: { People.formatPhone($0.phone) }, selection: $customerId)
                    } label: {
                        LabeledContent("Client", value: store.get(Customer.self, customerId)?.name ?? "Alege")
                    }
                    NavigationLink {
                        SearchPicker(title: "Mașina", items: customerId == nil ? vehicles : mine,
                                     text: { People.formatPlate($0.plate) }, detail: { $0.title }, selection: $vehicleId)
                    } label: {
                        LabeledContent("Mașina", value: store.get(Vehicle.self, vehicleId).map { People.formatPlate($0.plate) } ?? "Alege")
                    }
                }
                Section {
                    TextField("Ce reclamă clientul", text: $complaint, axis: .vertical)
                    LabeledContent("Kilometraj") {
                        TextField("km", text: $mileage).keyboardType(.numberPad).multilineTextAlignment(.trailing)
                    }
                    Picker("Mecanic", selection: $staffId) {
                        Text("Nimeni").tag(String?.none)
                        ForEach(store.all(Staff.self).filter(\.active).sorted { $0.order < $1.order }) { Text($0.name).tag(Optional($0.id)) }
                    }
                }
                Section("Operații") {
                    ForEach(serviceIds, id: \.self) { sid in
                        Text(store.get(Service.self, sid)?.name ?? "")
                    }
                    .onDelete { serviceIds.remove(atOffsets: $0) }
                    NavigationLink {
                        SearchPicker(title: "Operație", items: store.all(Service.self).sorted { $0.name < $1.name },
                                     text: { $0.name }, detail: { $0.category }, selection: Binding(get: { nil }, set: { if let id = $0 { serviceIds.append(id) } }))
                    } label: {
                        Label("Adaugă din catalog", systemImage: "plus.circle.fill")
                    }
                }
            }
            .onChange(of: customerId) { _, new in
                if let v = store.get(Vehicle.self, vehicleId), v.customerId != new { vehicleId = nil }
                if vehicleId == nil, mine.count == 1 { vehicleId = mine.first?.id }
            }
            .onChange(of: vehicleId) { _, new in
                if let owner = store.get(Vehicle.self, new)?.customerId, customerId == nil { customerId = owner }
            }
            .navigationTitle("Lucrare nouă")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Deschide") { create() }.disabled(customerId == nil || vehicleId == nil)
                }
            }
            .alert("Nu se poate", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("OK", role: .cancel) {}
            } message: { Text(error ?? "") }
        }
    }

    private func create() {
        do {
            let km = Int(mileage.filter(\.isNumber))
            let (order, warning) = try store.createWorkOrder(customerId: customerId, vehicleId: vehicleId, complaint: complaint,
                                                             mileage: km, staffId: staffId, serviceIds: serviceIds)
            if let warning { undo.show(warning) }
            dismiss()
            onCreated(order.id)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// A searchable list that picks one item and goes back.
struct SearchPicker<Item: Identifiable>: View where Item.ID == String {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let items: [Item]
    let text: (Item) -> String
    let detail: (Item) -> String
    @Binding var selection: String?
    @State private var query = ""

    var body: some View {
        let shown = query.isEmpty ? items : items.filter {
            (text($0) + " " + detail($0)).range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) != nil
                || People.normalizePlate(text($0)).contains(People.normalizePlate(query))
        }
        List(shown) { item in
            Button {
                selection = item.id
                dismiss()
            } label: {
                HStack {
                    VStack(alignment: .leading) {
                        Text(text(item))
                        if !detail(item).isEmpty { Text(detail(item)).font(.caption).foregroundStyle(.secondary) }
                    }
                    Spacer()
                    if selection == item.id { Image(systemName: "checkmark").foregroundStyle(.tint) }
                }
            }
            .tint(.primary)
        }
        .overlay { if shown.isEmpty { ContentUnavailableView.search(text: query) } }
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always))
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
