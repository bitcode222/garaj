import SwiftUI

/// Catalog: labor operations (norm hours, price) and parts (stock, cost, price, margin), with goods receipt.
struct CatalogView: View {
    @Environment(AppStore.self) private var store
    @AppStorage("catalog.tab") private var tab = "services"
    @AppStorage("catalog.sort") private var sort = "name"
    @State private var query = ""
    @State private var editingService: Service?
    @State private var editingPart: Part?
    @State private var receiving: Part?

    var body: some View {
        let tokens = Search.tokens(query)
        let currency = store.currency
        List {
            Section {
                Picker("Arată", selection: $tab) {
                    Text("Operații").tag("services")
                    Text("Piese").tag("parts")
                }
                .pickerStyle(.segmented)
                .onBand()
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
            if tab == "services" {
                let services = store.all(Service.self).filter { tokens.isEmpty || Search.matches(Search.fold("\($0.name) \(Inventory.categoryLabel($0.category))"), tokens) }
                let grouped = Dictionary(grouping: services, by: \.category)
                ForEach(Inventory.serviceCategories.map(\.key) + grouped.keys.filter { k in !Inventory.serviceCategories.contains { $0.key == k } }.sorted(), id: \.self) { key in
                    if let items = grouped[key], !items.isEmpty {
                        Section(header: CapsHeader(Inventory.categoryLabel(key))) {
                            ForEach(items.sorted { a, b in
                                sort == "price" ? a.price > b.price : sort == "time" ? a.hours > b.hours : a.name.localizedCompare(b.name) == .orderedAscending
                            }) { s in
                                Button { editingService = s } label: {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(s.name)
                                            Text("\(JS.number(s.hours).replacingOccurrences(of: ".", with: ",")) h\(s.parts.isEmpty ? "" : " · \(s.parts.count) piese incluse")").font(.caption).foregroundStyle(.secondary)
                                        }
                                        Spacer()
                                        Text(Money.format(s.price != 0 ? s.price : Lines.laborPrice(hours: s.hours, rate: store.shop.laborRate), currency: currency)).font(.subheadline.monospacedDigit())
                                    }
                                }
                                .tint(.primary)
                                .swipeActions { Button(role: .destructive) { store.deleteService(s.id) } label: { Label("Șterge", systemImage: "trash") } }
                            }
                        }
                    }
                }
            } else {
                let reserved = Inventory.reserved(orders: store.all(WorkOrder.self), invoices: Dictionary(store.all(Invoice.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a }))
                let parts = store.all(Part.self).filter { tokens.isEmpty || Search.matches(Search.fold("\($0.name) \($0.brand) \($0.code) \($0.location)"), tokens) }
                    .sorted { a, b in
                        switch sort {
                        case "price": return a.price > b.price
                        case "stock": return Inventory.level(a, reserved: reserved[a.id] ?? 0).available < Inventory.level(b, reserved: reserved[b.id] ?? 0).available
                        default: return a.name.localizedCompare(b.name) == .orderedAscending
                        }
                    }
                Section {
                    ForEach(parts) { p in
                        let level = Inventory.level(p, reserved: reserved[p.id] ?? 0)
                        Button { editingPart = p } label: {
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text([p.name, p.brand].filter { !$0.isEmpty }.joined(separator: " "))
                                    Text([p.code, p.location].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                                    Text("\(Money.formatQuantity(level.available)) \(p.unit) disponibil\(level.reserved > 0 ? " (+\(Money.formatQuantity(level.reserved)) rezervat)" : "")")
                                        .font(.caption.weight(.medium))
                                        .foregroundStyle(level.status == "out" ? .red : level.status == "low" ? .orange : .secondary)
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 2) {
                                    Text(Money.format(p.price, currency: currency)).font(.subheadline.monospacedDigit())
                                    if p.cost > 0 { Text("cost \(Money.format(p.cost, currency: currency))").font(.caption).foregroundStyle(.secondary) }
                                }
                            }
                        }
                        .tint(.primary)
                        .swipeActions(edge: .leading) { Button { receiving = p } label: { Label("Recepție", systemImage: "shippingbox.and.arrow.backward") }.tint(.green) }
                        .swipeActions { Button(role: .destructive) { store.deletePart(p.id) } label: { Label("Șterge", systemImage: "trash") } }
                    }
                } footer: { Text("Stocul scade la emiterea facturii; piesele de pe lucrările deschise sunt rezervate.") }
            }
        }
        .listStyle(.insetGrouped)
        .band(200)
        .navigationTitle("Catalog")
        .searchable(text: $query, prompt: tab == "services" ? "Caută o operație" : "Caută o piesă, cod, raft")
        .toolbar {
            SortGroupMenu(sorts: tab == "services" ? [("name", "Nume"), ("price", "Preț"), ("time", "Durată")] : [("name", "Nume"), ("price", "Preț"), ("stock", "Stoc (cel mai mic)")], sort: $sort)
            Button { if tab == "services" { editingService = store.newService() } else { editingPart = store.newPart() } } label: {
                Label(tab == "services" ? "Operație nouă" : "Piesă nouă", systemImage: "plus")
            }
        }
        .sheet(item: $editingService) { ServiceForm(service: $0) }
        .sheet(item: $editingPart) { PartForm(part: $0) }
        .sheet(item: $receiving) { ReceiveSheet(part: $0) }
    }
}

private struct ServiceForm: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var service: Service
    @State private var hours = ""
    @State private var price = ""
    @State private var error: String?

    var body: some View {
        let h = Money.parseQuantity(hours, decimals: 2) ?? 0
        let suggested = Lines.laborPrice(hours: h, rate: store.shop.laborRate)
        NavigationStack {
            Form {
                Section {
                    TextField("Denumire", text: $service.name)
                    Picker("Categorie", selection: $service.category) {
                        ForEach(Inventory.serviceCategories, id: \.key) { Text($0.label).tag($0.key) }
                    }
                }
                Section {
                    LabeledContent("Timp normat (ore)") { TextField("1", text: $hours).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                    LabeledContent("Preț fără TVA") { TextField(Money.toInput(suggested), text: $price).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                } footer: { Text("Gol = \(Money.format(suggested, currency: store.currency)) (\(JS.number(h)) h × tariful de \(Money.format(store.shop.laborRate, currency: store.currency))/h).") }
            }
            .navigationTitle(store.get(Service.self, service.id) == nil ? "Operație nouă" : "Operație")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { hours = JS.number(service.hours).replacingOccurrences(of: ".", with: ","); price = service.price == 0 ? "" : Money.toInput(service.price) }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvează") {
                        var s = service
                        s.hours = h > 0 ? h : 1
                        s.price = price.isEmpty ? 0 : (Money.parse(price) ?? 0)
                        do { try store.saveService(s); dismiss() } catch { self.error = error.localizedDescription }
                    }
                    .disabled(service.name.trimmingCharacters(in: .whitespaces).isEmpty || (!price.isEmpty && Money.parse(price) == nil))
                }
            }
            .alert("Nu se poate", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK", role: .cancel) {} } message: { Text(error ?? "") }
        }
    }
}

private struct PartForm: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var part: Part
    @State private var cost = ""
    @State private var price = ""
    @State private var stock = ""
    @State private var minStock = ""
    @State private var error: String?

    var body: some View {
        let markup = store.settings["partsMarkup"]?.number ?? 35
        let c = Money.parse(cost)
        let p = Money.parse(price)
        NavigationStack {
            Form {
                Section {
                    TextField("Denumire", text: $part.name)
                    TextField("Marcă", text: $part.brand)
                    TextField("Cod", text: $part.code).textInputAutocapitalization(.characters)
                    TextField("Unitate (buc, l, set)", text: $part.unit).textInputAutocapitalization(.never)
                }
                Section {
                    LabeledContent("Cost de achiziție") { TextField("0,00", text: $cost).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                    LabeledContent("Preț de vânzare") { TextField("0,00", text: $price).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                    if let c, c > 0 {
                        Button("Preț din cost + \(JS.number(markup))% adaos") { price = Money.toInput(Inventory.priceFromCost(c, markupPct: markup)) }
                    }
                } footer: {
                    if let c, let p, c > 0, p > 0 { Text("Marjă \(Money.format(p - c, currency: store.currency)) (\(Int(Money.jsRound(Double(p - c) / Double(p) * 100)))%)") }
                }
                Section {
                    LabeledContent("În stoc") { TextField("0", text: $stock).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                    LabeledContent("Stoc minim") { TextField("0", text: $minStock).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                    TextField("Raft / locație", text: $part.location)
                }
            }
            .navigationTitle(store.get(Part.self, part.id) == nil ? "Piesă nouă" : "Piesă")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                cost = part.cost == 0 ? "" : Money.toInput(part.cost); price = part.price == 0 ? "" : Money.toInput(part.price)
                stock = Money.formatQuantity(part.stock); minStock = Money.formatQuantity(part.minStock)
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvează") {
                        var x = part
                        x.cost = c ?? 0; x.price = p ?? 0
                        x.stock = Money.parseQuantity(stock.replacingOccurrences(of: ".", with: "")) ?? 0
                        x.minStock = Money.parseQuantity(minStock.replacingOccurrences(of: ".", with: "")) ?? 0
                        do { try store.savePart(x); dismiss() } catch { self.error = error.localizedDescription }
                    }
                    .disabled(part.name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .alert("Nu se poate", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK", role: .cancel) {} } message: { Text(error ?? "") }
        }
    }
}

/// Goods received: how many, and the new purchase cost if it changed.
private struct ReceiveSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo
    @Environment(\.dismiss) private var dismiss
    let part: Part
    @State private var qty = ""
    @State private var cost = ""

    var body: some View {
        let q = Money.parseQuantity(qty) ?? 0
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Cantitate (\(part.unit))") { TextField("0", text: $qty).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                    LabeledContent("Cost nou (opțional)") { TextField(Money.toInput(part.cost), text: $cost).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                } header: { CapsHeader([part.name, part.brand].filter { !$0.isEmpty }.joined(separator: " ")) } footer: {
                    Text("În stoc acum: \(Money.formatQuantity(part.stock)) \(part.unit)\(q > 0 ? " → \(Money.formatQuantity(part.stock + q))" : "")")
                }
            }
            .navigationTitle("Recepție")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Recepționează") {
                        let before = part
                        if (try? store.receiveStock(part.id, qty: q, cost: cost.isEmpty ? nil : Money.parse(cost))) != nil {
                            undo.show("+\(Money.formatQuantity(q)) \(part.unit) \(part.name)") { store.save(before) }
                        }
                        dismiss()
                    }
                    .disabled(q <= 0)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
