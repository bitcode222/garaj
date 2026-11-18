import SwiftUI

/// Edits one line in a sheet: what it is, quantity, price, discount, VAT, mechanic.
struct LineEditor: View {
    /// Set when the sheet sits on a car's color (look 3).
    @Environment(\.coverMake) private var coverMake
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var line: Line
    @State private var qty: String
    @State private var price: String
    @State private var discount: String
    let isNew: Bool
    let onSave: (Line) -> Void

    init(line: Line, isNew: Bool, onSave: @escaping (Line) -> Void) {
        _line = State(initialValue: line)
        _qty = State(initialValue: JS.number(line.qty).replacingOccurrences(of: ".", with: ","))
        _price = State(initialValue: Money.toInput(line.unitPrice))
        _discount = State(initialValue: line.discountPct == 0 ? "" : JS.number(line.discountPct).replacingOccurrences(of: ".", with: ","))
        self.isNew = isNew
        self.onSave = onSave
    }

    private var parsed: Line? {
        guard let q = Money.parseQuantity(qty), let p = Money.parse(price) else { return nil }
        let d = discount.isEmpty ? 0 : (Money.parseQuantity(discount, decimals: 2) ?? -1)
        guard (0...100).contains(d) else { return nil }
        var next = line
        next.qty = q
        next.unitPrice = p
        next.discountPct = d
        return next
    }

    private var issues: [String] {
        guard let p = parsed else { return ["Verifică cantitatea, prețul și reducerea."] }
        return Lines.issues(p)
    }

    var body: some View {
        let shop = store.shop
        NavigationStack {
            Form {
                Group {
                Section {
                    Picker("Tip", selection: $line.kind) {
                        ForEach(Lines.kinds, id: \.self) { Text(Lines.kindLabel[$0] ?? $0).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    TextField("Descriere", text: $line.description, axis: .vertical)
                }
                Section {
                    HStack {
                        TextField("Cantitate", text: $qty).keyboardType(.decimalPad)
                        TextField("Unitate", text: $line.unit)
                            .multilineTextAlignment(.trailing)
                            .frame(maxWidth: 80)
                            .textInputAutocapitalization(.never)
                    }
                    LabeledContent("Preț unitar") {
                        TextField("0,00", text: $price)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                    }
                    LabeledContent("Reducere %") {
                        TextField("0", text: $discount)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                    }
                    if shop.vatPayer {
                        Picker("TVA", selection: $line.vatRate) {
                            ForEach(Array(Set([0, 5, 9, 11, shop.vatRate, line.vatRate])).sorted(by: >), id: \.self) {
                                Text("\(JS.number($0))%").tag($0)
                            }
                        }
                    }
                } footer: {
                    if let p = parsed {
                        Text("Valoare: \(Money.format(Lines.net(p), currency: shop.currency))\(shop.vatPayer ? " + TVA = \(Money.format(Lines.gross(p), currency: shop.currency))" : "")")
                    }
                }
                if line.kind == "labor" {
                    Section {
                        Picker("Mecanic", selection: $line.staffId) {
                            Text("Nimeni").tag(String?.none)
                            ForEach(store.all(Staff.self).filter(\.active).sorted { $0.order < $1.order }) { s in
                                Text(s.name).tag(Optional(s.id))
                            }
                        }
                    }
                }
                if !issues.isEmpty && parsed != nil || parsed == nil {
                    Section {
                        ForEach(issues, id: \.self) { Label($0, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red) }
                    }
                }
                }
                .coverRows(coverMake)
            }
            .scrollContentBackground(.hidden)
            .background(coverMake == nil ? Color.groupedBackground : Color.clear)
            .navigationTitle(isNew ? "Linie nouă" : "Linie")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isNew ? "Adaugă" : "Gata") {
                        if let p = parsed { onSave(p); dismiss() }
                    }
                    .disabled(!issues.isEmpty)
                }
            }
        }
        .presentationDetents([.large])
    }
}

/// Picks catalog services or parts and adds their lines.
struct AddLineSheet: View {
    enum Source: String, Identifiable { case service, part; var id: String { rawValue } }

    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let source: Source
    let onAdd: ([Line]) -> Void
    @State private var query = ""

    private func matches(_ text: String) -> Bool {
        let q = query.trimmingCharacters(in: .whitespaces)
        return q.isEmpty || text.range(of: q, options: [.caseInsensitive, .diacriticInsensitive]) != nil
    }

    var body: some View {
        let currency = store.currency
        NavigationStack {
            List {
                switch source {
                case .service:
                    let services = store.all(Service.self).filter { matches($0.name + " " + $0.category) }.sorted { $0.name < $1.name }
                    ForEach(services) { service in
                        Button {
                            onAdd(store.linesFromService(service.id))
                            dismiss()
                        } label: {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(service.name)
                                    Text("\(JS.number(service.hours).replacingOccurrences(of: ".", with: ",")) h · \(service.category)")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(Money.format(service.price != 0 ? service.price : Lines.laborPrice(hours: service.hours, rate: store.shop.laborRate), currency: currency))
                                    .font(.subheadline.monospacedDigit())
                            }
                        }
                        .tint(.primary)
                    }
                case .part:
                    let parts = store.all(Part.self).filter { matches("\($0.name) \($0.brand) \($0.code)") }.sorted { $0.name < $1.name }
                    ForEach(parts) { part in
                        Button {
                            if let line = store.lineFromPart(part.id) { onAdd([line]) }
                            dismiss()
                        } label: {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text([part.name, part.brand].filter { !$0.isEmpty }.joined(separator: " "))
                                    Text("\(part.code.isEmpty ? "" : "\(part.code) · ")În stoc: \(Money.formatQuantity(part.stock)) \(part.unit)")
                                        .font(.caption)
                                        .foregroundStyle(part.stock <= 0 ? .red : .secondary)
                                }
                                Spacer()
                                Text(Money.format(part.price, currency: currency)).font(.subheadline.monospacedDigit())
                            }
                        }
                        .tint(.primary)
                    }
                }
            }
            .groupedBackground()
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: source == .service ? "Caută manopera" : "Caută piesa")
            .navigationTitle(source == .service ? "Manoperă din catalog" : "Piesă din stoc")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } } }
        }
    }
}
