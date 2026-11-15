import SwiftUI

/// One job: the car and client, its status with the next step, what the client asked for,
/// the lines with their totals, notes. Delivered and cancelled jobs are read-only (notes aside).
struct WorkOrderDetailView: View {
    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo
    @Environment(\.dismiss) private var dismiss
    let id: String

    @State private var editingLine: Line?
    @State private var adding: AddLineSheet.Source?
    @State private var confirmCancel = false
    @State private var confirmDelete = false
    @State private var moved = 0
    @State private var error: String?
    @State private var openInvoice: String?

    var body: some View {
        if let order = store.get(WorkOrder.self, id) {
            content(order)
        } else {
            ContentUnavailableView("Lucrarea nu mai există", systemImage: "wrench.and.screwdriver")
        }
    }

    private func content(_ order: WorkOrder) -> some View {
        let vehicle = store.get(Vehicle.self, order.vehicleId)
        let customer = store.get(Customer.self, order.customerId)
        let locked = WorkOrderRules.isLocked(order.status)
        let shop = store.shop
        let totals = Lines.totals(order.lines.filter { !$0.refused }, vatPayer: shop.vatPayer)

        return List {
            Section {
                StatusHeader(order: order) { to in
                    if to == "cancelled" { confirmCancel = true } else { move(order, to: to) }
                }
            }

            Section {
                if let vehicle {
                    LabeledContent("Mașina") {
                        VStack(alignment: .trailing) {
                            Text(People.formatPlate(vehicle.plate)).font(.body.weight(.semibold))
                            Text(vehicle.title).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                if let customer {
                    LabeledContent("Client", value: customer.name)
                    if !customer.phone.isEmpty {
                        ContactButtons(phone: customer.phone, message: order.status == "ready"
                            ? WorkOrderRules.readyMessage(customer: customer, vehicle: vehicle, settings: shop)
                            : WorkOrderRules.estimateMessage(order: order, customer: customer, vehicle: vehicle, settings: shop))
                    }
                }
                if let km = order.mileage {
                    LabeledContent("Kilometraj", value: "\(km.formatted(.number.locale(Locale(identifier: "ro_RO")))) km")
                }
            }

            Section("Ce reclamă clientul") {
                TextField("Ce spune clientul", text: binding(order, \.complaint), axis: .vertical)
                    .disabled(locked)
            }
            Section("Diagnostic") {
                TextField("Ce a găsit mecanicul", text: binding(order, \.diagnosis), axis: .vertical)
                    .disabled(locked)
            }

            Section {
                ForEach(order.lines) { line in
                    Button { if !locked { editingLine = line } } label: {
                        LineRow(line: line, currency: shop.currency, vatPayer: shop.vatPayer)
                    }
                    .tint(.primary)
                    .swipeActions {
                        if !locked {
                            Button(role: .destructive) { removeLine(order, line) } label: { Label("Șterge", systemImage: "trash") }
                        }
                    }
                }
                .onMove(perform: locked ? nil : { from, to in
                    var next = order
                    next.lines.move(fromOffsets: from, toOffset: to)
                    save(next)
                })
                if !locked {
                    Menu {
                        Button { adding = .service } label: { Label("Manoperă din catalog", systemImage: "wrench.and.screwdriver") }
                        Button { adding = .part } label: { Label("Piesă din stoc", systemImage: "shippingbox") }
                        Divider()
                        Button { editingLine = store.blankLine("labor") } label: { Label("Manoperă liberă", systemImage: "hammer") }
                        Button { editingLine = store.blankLine("part") } label: { Label("Piesă liberă", systemImage: "gearshape") }
                        Button { editingLine = store.blankLine("fee") } label: { Label("Taxă", systemImage: "banknote") }
                    } label: {
                        Label("Adaugă o linie", systemImage: "plus.circle.fill")
                    }
                    .frame(minHeight: 44)
                }
            } header: {
                Text("Linii")
            }

            if !order.lines.isEmpty {
                Section("Total") {
                    if totals.labor != 0 { LabeledContent("Manoperă", value: Money.format(totals.labor, currency: shop.currency)) }
                    if totals.parts != 0 { LabeledContent("Piese", value: Money.format(totals.parts, currency: shop.currency)) }
                    if totals.fees != 0 { LabeledContent("Taxe", value: Money.format(totals.fees, currency: shop.currency)) }
                    if shop.vatPayer {
                        LabeledContent("Fără TVA", value: Money.format(totals.net, currency: shop.currency))
                        ForEach(totals.byRate, id: \.rate) { group in
                            LabeledContent("TVA \(JS.number(group.rate))%", value: Money.format(group.vat, currency: shop.currency))
                        }
                    }
                    LabeledContent {
                        Text(Money.format(totals.gross, currency: shop.currency)).font(.headline.monospacedDigit())
                    } label: {
                        Text("De plată").font(.headline)
                    }
                }
            }

            Section("Factură") {
                if let invoice = store.get(Invoice.self, order.invoiceId) {
                    let state = store.invoiceState(invoice)
                    NavigationLink { InvoiceDetailView(id: invoice.id) } label: {
                        LabeledContent {
                            StatusPill(style: Labels.invoice(state))
                        } label: {
                            Text(verbatim: invoice.number == nil ? "Ciornă" : invoice.label)
                        }
                    }
                } else {
                    Button {
                        do { openInvoice = try store.invoiceForWorkOrder(order.id).id } catch { self.error = error.localizedDescription }
                    } label: {
                        Label("Fă factura", systemImage: "doc.badge.plus")
                    }
                    .disabled(order.lines.isEmpty)
                }
            }

            Section("Note") {
                TextField("Note interne", text: binding(order, \.notes, allowLocked: true), axis: .vertical)
            }

            if WorkOrderRules.canDelete(status: order.status, invoiceId: order.invoiceId) {
                Section {
                    Button("Șterge lucrarea", role: .destructive) { confirmDelete = true }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(Text(verbatim: "Lucrarea #\(order.number)"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !locked && !order.lines.isEmpty { EditButton() }
        }
        .navigationDestination(item: $openInvoice) { InvoiceDetailView(id: $0) }
        .sheet(item: $editingLine) { line in
            LineEditor(line: line, isNew: !order.lines.contains { $0.id == line.id }) { saved in
                var next = store.get(WorkOrder.self, id) ?? order
                if let i = next.lines.firstIndex(where: { $0.id == saved.id }) { next.lines[i] = saved } else { next.lines.append(saved) }
                save(next)
            }
        }
        .sheet(item: $adding) { source in
            AddLineSheet(source: source) { lines in
                var next = store.get(WorkOrder.self, id) ?? order
                next.lines.append(contentsOf: lines)
                save(next)
            }
        }
        .confirmationDialog("Anulezi lucrarea #\(order.number)?", isPresented: $confirmCancel, titleVisibility: .visible) {
            Button("Anulează lucrarea", role: .destructive) { move(order, to: "cancelled") }
        } message: {
            Text("O poți reactiva mai târziu.")
        }
        .confirmationDialog("Ștergi lucrarea #\(order.number)?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Șterge", role: .destructive) {
                do { try store.deleteWorkOrder(order.id); dismiss() } catch { self.error = error.localizedDescription }
            }
        } message: {
            Text("Nu se poate anula.")
        }
        .alert("Nu se poate", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(error ?? "") }
        .sensoryFeedback(.success, trigger: moved)
    }

    // MARK: Writes

    private func binding(_ order: WorkOrder, _ key: WritableKeyPath<WorkOrder, String>, allowLocked: Bool = false) -> Binding<String> {
        Binding {
            store.get(WorkOrder.self, id)?[keyPath: key] ?? order[keyPath: key]
        } set: { value in
            guard var next = store.get(WorkOrder.self, id) else { return }
            next[keyPath: key] = value
            save(next)
        }
    }

    private func save(_ order: WorkOrder) {
        do { try store.updateWorkOrder(order) } catch { self.error = error.localizedDescription }
    }

    private func removeLine(_ order: WorkOrder, _ line: Line) {
        var next = order
        next.lines.removeAll { $0.id == line.id }
        save(next)
        undo.show("Linie ștearsă") {
            guard var back = store.get(WorkOrder.self, id) else { return }
            back.lines = order.lines
            try store.updateWorkOrder(back)
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

/// The status, a big button for the next step and a menu with the other moves.
private struct StatusHeader: View {
    let order: WorkOrder
    let move: (String) -> Void

    var body: some View {
        let style = Labels.workOrder(order.status)
        let next = WorkOrderRules.next[order.status]
        let others = (WorkOrderRules.transitions[order.status] ?? []).filter { $0 != next }
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: style.symbol)
                    .font(.title2)
                    .foregroundStyle(style.color)
                    .frame(width: 44, height: 44)
                    .background(style.color.opacity(0.15), in: .circle)
                VStack(alignment: .leading, spacing: 2) {
                    Text(style.label).font(.title3.weight(.semibold))
                    Text(style.hint).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 8) {
                if let next {
                    Button { move(next) } label: {
                        Label(Labels.workOrderAction(from: order.status, to: next), systemImage: Labels.workOrder(next).symbol)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                }
                if !others.isEmpty {
                    Menu {
                        ForEach(others, id: \.self) { to in
                            Button(role: to == "cancelled" ? .destructive : nil) { move(to) } label: {
                                Label(Labels.workOrderAction(from: order.status, to: to), systemImage: Labels.workOrder(to).symbol)
                            }
                        }
                    } label: {
                        Label(next == nil ? "Schimbă starea" : "Altă stare", systemImage: "ellipsis")
                            .labelStyle(next == nil ? AnyLabelStyle(.titleAndIcon) : AnyLabelStyle(.iconOnly))
                            .frame(maxWidth: next == nil ? .infinity : nil, minHeight: 22)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .accessibilityLabel("Altă stare")
                }
            }
        }
        .padding(.vertical, 4)
    }
}

struct AnyLabelStyle: LabelStyle {
    private let make: (Configuration) -> AnyView
    init<S: LabelStyle>(_ style: S) { make = { AnyView(style.makeBody(configuration: $0)) } }
    func makeBody(configuration: Configuration) -> some View { make(configuration) }
}

/// Call, message, WhatsApp — with the estimate (or "ready") text prefilled.
private struct ContactButtons: View {
    let phone: String
    let message: String

    var body: some View {
        HStack(spacing: 8) {
            if let url = People.telURL(phone) {
                Link(destination: url) { Label("Sună", systemImage: "phone.fill").frame(maxWidth: .infinity) }
            }
            if let url = People.smsURL(phone, body: message) {
                Link(destination: url) { Label("SMS", systemImage: "message.fill").frame(maxWidth: .infinity) }
            }
            if let url = People.whatsappURL(phone, text: message) {
                Link(destination: url) { Label("WhatsApp", systemImage: "text.bubble.fill").frame(maxWidth: .infinity) }
            }
        }
        .buttonStyle(.bordered)
        .labelStyle(VerticalLabelStyle())
        .font(.caption.weight(.medium))
    }
}

struct VerticalLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        VStack(spacing: 4) {
            configuration.icon.font(.body)
            configuration.title
        }
        .frame(minHeight: 44)
    }
}

/// One line: what, how much × price, its value.
struct LineRow: View {
    let line: Line
    let currency: String
    let vatPayer: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(line.description.isEmpty ? (Lines.kindLabel[line.kind] ?? "Linie") : line.description)
                    .strikethrough(line.refused)
                Text("\(Lines.kindLabel[line.kind] ?? "") · \(Money.formatQuantity(line.qty)) \(line.unit) × \(Money.format(line.unitPrice, currency: currency))\(line.discountPct > 0 ? " −\(JS.number(line.discountPct))%" : "")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if line.refused {
                    Text("Refuzată de client").font(.caption).foregroundStyle(.red)
                }
            }
            Spacer()
            Text(Money.format(Lines.net(line), currency: currency))
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(line.refused ? .secondary : .primary)
        }
        .padding(.vertical, 2)
    }
}
