import SwiftUI

/// A booking's operations (look 2, round-2 board): each with its icon, time and price. Tap one to
/// change it, hold and drag to reorder, swipe to delete (with undo); add from the catalog or a free one.
struct OperationsSection: View {
    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo
    let appointment: Appointment
    let editable: Bool

    /// The sheets live on the page (a sheet on a list section does not always present).
    @Binding var editing: OperationSheet.Target?
    @Binding var picking: Bool
    @State private var changed = 0

    var body: some View {
        let ops = store.operations(of: appointment.id)
        let shop = store.shop
        let estimate = Operations.estimate(ops, vatPayer: shop.vatPayer, vatRate: shop.vatRate)
        let booked = Dates.minutesBetween(appointment.start, appointment.end)
        let services = Dictionary(store.all(Service.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        Section {
            ForEach(ops) { op in
                Button { if editable { editing = .edit(op) } } label: {
                    OperationRow(op: op, category: op.category ?? WorkKind.category(serviceId: op.serviceId, text: op.name, services: services),
                                 currency: store.currency, editable: editable)
                }
                .tint(.primary)
            }
            .onMove(perform: editable ? { from, to in
                var next = ops
                next.move(fromOffsets: from, toOffset: to)
                store.setOperations(appointment.id, next)
                changed += 1
            } : nil)
            .onDelete(perform: editable ? { offsets in
                var next = ops
                let removed = offsets.map { ops[$0].name }
                next.remove(atOffsets: offsets)
                store.setOperations(appointment.id, next)
                undo.show("Șters: \(removed.joined(separator: ", "))") { store.setOperations(appointment.id, ops) }
            } : nil)
            if editable {
                Menu {
                    Button { picking = true } label: { Label("Din catalog", systemImage: "list.bullet.rectangle") }
                    Button { editing = .new(store.newOperation()) } label: { Label("Operație liberă", systemImage: "square.and.pencil") }
                } label: {
                    Label("Adaugă o operație", systemImage: "plus.circle.fill")
                }
                .frame(minHeight: 44)
            }
            if !ops.isEmpty {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Total estimat").font(.headline)
                        Text(Operations.duration(estimate.minutes)).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(Money.format(estimate.gross, currency: store.currency)).font(.headline).monospacedDigit()
                        if shop.vatPayer { Text("cu TVA").font(.caption).foregroundStyle(.secondary) }
                    }
                }
                .accessibilityElement(children: .combine)
                if editable && estimate.minutes > 0 && estimate.minutes != booked {
                    Button {
                        try? store.fitToOperations(appointment.id)
                        changed += 1
                    } label: {
                        Label("Fă programarea de \(Operations.duration(max(15, estimate.minutes))) (acum \(Operations.duration(max(0, booked))))", systemImage: "clock.arrow.circlepath")
                            .font(.subheadline)
                    }
                }
            }
        } header: {
            HStack {
                CapsHeader("Operații · \(ops.count)")
                Spacer()
                if editable && ops.count > 1 {
                    Menu {
                        Button { sort(ops) { $0.price > $1.price } } label: { Label("După preț", systemImage: "banknote") }
                        Button { sort(ops) { $0.hours > $1.hours } } label: { Label("După durată", systemImage: "clock") }
                        Button { sort(ops) { $0.name.localizedCompare($1.name) == .orderedAscending } } label: { Label("După nume", systemImage: "textformat") }
                    } label: {
                        Label("Sortează", systemImage: "arrow.up.arrow.down").font(.footnote.weight(.semibold)).textCase(nil)
                    }
                }
            }
        } footer: {
            if editable && !ops.isEmpty {
                Text("Atinge o operație ca s-o schimbi. Ține apăsat și trage ca s-o muți. Glisează spre stânga ca s-o ștergi.")
            } else if !editable && appointment.workOrderId != nil {
                Text("Operațiile au trecut în lucrare; se schimbă acolo.")
            }
        }
        .sensoryFeedback(.selection, trigger: changed)
        #if DEBUG
        // Screenshots: `-GarajEditOperation YES` opens the first operation.
        .task { if UserDefaults.standard.bool(forKey: "GarajEditOperation"), let first = ops.first { editing = .edit(first) } }
        #endif
    }

    private func sort(_ ops: [Operation], by before: @escaping (Operation, Operation) -> Bool) {
        let sorted = ops.sorted(by: before)
        store.setOperations(appointment.id, sorted)
        undo.show("Operații sortate") { store.setOperations(appointment.id, ops) }
    }
}

private struct OperationRow: View {
    let op: Operation
    let category: String
    let currency: String
    let editable: Bool

    var body: some View {
        HStack(spacing: 12) {
            WorkIcon(category: category)
            VStack(alignment: .leading, spacing: 2) {
                Text(op.name.isEmpty ? "Operație fără nume" : op.name).lineLimit(2)
                Text([Operations.duration(Int(Money.jsRound(op.hours * 60))), op.qty != 1 ? "\(Money.formatQuantity(op.qty)) \(op.unit)" : nil]
                    .compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            Text(op.price == 0 ? "gratuit" : Money.format(op.price, currency: currency, decimals: op.price % 100 == 0 ? 0 : 2))
                .font(op.price == 0 ? .body : .body.weight(.semibold))
                .foregroundStyle(op.price == 0 ? .secondary : .primary)
                .monospacedDigit()
            if editable { Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary) }
        }
        .padding(.vertical, 2)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityHint(editable ? "Atinge ca s-o editezi" : "")
    }
}

/// Edit one operation: its kind, name, time, quantity and price (with the price from the labor rate).
struct OperationSheet: View {
    /// Set when the sheet sits on a car's color (look 3).
    @Environment(\.coverMake) private var coverMake
    enum Target: Identifiable {
        case new(Operation), edit(Operation)
        var id: String { switch self { case .new(let o), .edit(let o): o.id } }
        var op: Operation { switch self { case .new(let o), .edit(let o): o } }
    }

    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo
    @Environment(\.dismiss) private var dismiss
    let target: Target
    let appointmentId: String

    @State private var op = Operation(id: "", name: "", hours: 1, price: 0)
    @State private var price = ""
    @FocusState private var focus: Bool

    var body: some View {
        let rate = store.shop.laborRate
        let suggested = Lines.laborPrice(hours: op.hours, rate: rate)
        let parsed = price.isEmpty ? 0 : Money.parse(price)
        let isNew = if case .new = target { true } else { false }
        let parts = store.get(Service.self, op.serviceId)?.parts.compactMap(\.object) ?? []
        NavigationStack {
            Form {
                Group {
                Section {
                    ScrollViewReader { proxy in
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 14) {
                            ForEach(Inventory.serviceCategories, id: \.key) { c in
                                let on = (op.category ?? "") == c.key
                                Button { op.category = c.key } label: {
                                    VStack(spacing: 6) {
                                        WorkIcon(category: c.key, size: 40)
                                            .padding(3)
                                            .overlay(Circle().strokeBorder(on ? WorkKind.style(c.key).color : .clear, lineWidth: 2.5).padding(-2))
                                        Text(c.label).font(.caption2.weight(on ? .semibold : .regular)).foregroundStyle(on ? .primary : .secondary)
                                    }
                                    .frame(minWidth: 56)
                                }
                                .buttonStyle(.plain)
                                .accessibilityAddTraits(on ? .isSelected : [])
                                .id(c.key)
                            }
                        }
                        .padding(.vertical, 6)
                    }
                    .task { try? await Task.sleep(for: .milliseconds(150)); if let c = op.category { withAnimation { proxy.scrollTo(c, anchor: .center) } } }
                    }
                    .sensoryFeedback(.selection, trigger: op.category)
                    TextField("Denumire (ex. Schimb anvelope)", text: $op.name, axis: .vertical)
                } header: { CapsHeader("Ce se face") }

                Section {
                    Stepper(value: $op.hours, in: 0.25...24, step: 0.25) {
                        LabeledContent("Durată", value: Operations.duration(Int(Money.jsRound(op.hours * 60))))
                    }
                    Stepper(value: $op.qty, in: 1...99, step: 1) {
                        LabeledContent("Cantitate") {
                            Menu {
                                Picker("Unitate", selection: $op.unit) { ForEach(["buc", "set", "roți", "l", "ore"], id: \.self) { Text($0).tag($0) } }
                            } label: {
                                Text("\(Money.formatQuantity(op.qty)) \(op.unit)").monospacedDigit()
                            }
                        }
                    }
                    LabeledContent("Preț fără TVA") {
                        TextField(Money.toInput(suggested), text: $price)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .focused($focus)
                    }
                } header: {
                    CapsHeader("Timp și preț")
                } footer: {
                    Button("Preț după tarif: \(Money.format(suggested, currency: store.currency)) (\(Operations.duration(Int(Money.jsRound(op.hours * 60)))) × \(Money.format(rate, currency: store.currency, decimals: 0))/h)") {
                        price = Money.toInput(suggested)
                    }
                    .font(.footnote)
                }

                if !parts.isEmpty {
                    Section {
                        ForEach(parts.indices, id: \.self) { i in
                            if let part = store.get(Part.self, parts[i]["partId"]?.string) {
                                let qty = parts[i]["qty"]?.number ?? 1
                                LabeledContent {
                                    Text(Money.format(Int(Money.jsRound(Double(part.price) * qty)), currency: store.currency)).monospacedDigit()
                                } label: {
                                    Text([part.name, part.brand].filter { !$0.isEmpty }.joined(separator: " "))
                                    Text("\(Money.formatQuantity(qty)) \(part.unit) × \(Money.format(part.price, currency: store.currency))")
                                }
                            }
                        }
                    } header: { CapsHeader("Piese incluse") } footer: { Text("Vin din catalog și intră în lucrare la sosire.") }
                }

                if !isNew {
                    Section {
                        Button("Șterge operația", role: .destructive) {
                            let before = store.operations(of: appointmentId)
                            store.setOperations(appointmentId, before.filter { $0.id != op.id })
                            undo.show("Operație ștearsă") { store.setOperations(appointmentId, before) }
                            dismiss()
                        }
                    }
                }
                }
                .coverRows(coverMake)
            }
            .scrollContentBackground(.hidden)
            .background(coverMake == nil ? Color.groupedBackground : Color.clear)
            .navigationTitle(isNew ? "Operație nouă" : "Operație")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvează") {
                        var saved = op
                        saved.name = op.name.trimmingCharacters(in: .whitespacesAndNewlines)
                        saved.price = parsed ?? suggested
                        var ops = store.operations(of: appointmentId)
                        if let i = ops.firstIndex(where: { $0.id == saved.id }) { ops[i] = saved } else { ops.append(saved) }
                        store.setOperations(appointmentId, ops)
                        dismiss()
                    }
                    .disabled(op.name.trimmingCharacters(in: .whitespaces).isEmpty || parsed == nil)
                }
                ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Gata") { focus = false } }
            }
            .onAppear {
                op = target.op
                if op.category == nil, let s = store.get(Service.self, op.serviceId) { op.category = s.category }
                price = op.price == 0 && isNew ? "" : Money.toInput(op.price)
            }
        }
        .presentationDetents([.large])
    }
}

/// The catalog's operations by category, searchable; tap to add (more than one at a time).
struct ServicePicker: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let onDone: ([Service]) -> Void
    @State private var query = ""
    @State private var picked: [Service] = []

    var body: some View {
        let tokens = Search.tokens(query)
        let services = store.all(Service.self).filter { tokens.isEmpty || Search.matches(Search.fold($0.name), tokens) }
        let grouped = Dictionary(grouping: services, by: \.category)
        let rate = store.shop.laborRate
        NavigationStack {
            List {
                ForEach(Inventory.serviceCategories.map(\.key).filter { grouped[$0] != nil } + grouped.keys.filter { k in !Inventory.serviceCategories.contains { $0.key == k } }.sorted(), id: \.self) { key in
                    Section {
                        ForEach(grouped[key]!.sorted { $0.name < $1.name }) { s in
                            let count = picked.filter { $0.id == s.id }.count
                            Button { picked.append(s) } label: {
                                HStack(spacing: 12) {
                                    WorkIcon(category: s.category)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(s.name)
                                        Text("\(Operations.duration(Int(Money.jsRound(s.hours * 60))))\(s.parts.isEmpty ? "" : " · \(s.parts.count) piese")")
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Text(Money.format(s.price != 0 ? s.price : Lines.laborPrice(hours: s.hours, rate: rate), currency: store.currency, decimals: 0))
                                        .monospacedDigit().foregroundStyle(.secondary)
                                    if count > 0 {
                                        Image(systemName: "\(min(count, 50)).circle.fill").foregroundStyle(Color.accentColor).font(.title3)
                                    }
                                }
                            }
                            .tint(.primary)
                        }
                    } header: { CapsHeader(Inventory.categoryLabel(key)) }
                }
            }
            .groupedBackground()
            .sensoryFeedback(.selection, trigger: picked.count)
            .overlay { if services.isEmpty { ContentUnavailableView.search(text: query) } }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Caută o operație")
            .navigationTitle("Din catalog")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(picked.isEmpty ? "Gata" : "Adaugă \(picked.count)") { onDone(picked); dismiss() }.disabled(picked.isEmpty)
                }
            }
        }
    }
}
