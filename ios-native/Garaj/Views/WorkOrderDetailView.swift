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

        let services = Dictionary(store.all(Service.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let staff = Dictionary(store.all(Staff.self).map { ($0.id, $0.name) }, uniquingKeysWith: { a, _ in a })
        let next = WorkOrderRules.next[order.status]
        let others = (WorkOrderRules.transitions[order.status] ?? []).filter { $0 != next }

        return List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .center) {
                        if let vehicle { MakeLogo(make: vehicle.make, size: 34); PlateBadge(plate: vehicle.plate) } else { Text("Fără mașină").foregroundStyle(.secondary) }
                        Spacer()
                        StatusPill(style: Labels.workOrder(order.status))
                    }
                    Text(vehicle?.title.nonEmpty ?? "Mașină").font(.title3.weight(.bold)).padding(.top, 6)
                    let facts = [vehicle?.year.map(String.init), vehicle.flatMap { v in Inventory.fuels.first { $0.key == v.fuel }?.label.lowercased() },
                                 order.mileage.map { "\($0.formatted(.number.locale(Locale(identifier: "ro_RO")))) km" }].compactMap { $0 }
                    if !facts.isEmpty { Text(facts.joined(separator: " · ")).font(.subheadline).foregroundStyle(.secondary) }
                    if let customer {
                        Text([customer.name, customer.phone].filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.subheadline.weight(.semibold)).foregroundStyle(Color.accentColor)
                    }
                }
                .padding(.vertical, 6)
                if let customer, !customer.phone.isEmpty {
                    ContactButtons(phone: customer.phone, message: order.status == "ready"
                        ? WorkOrderRules.readyMessage(customer: customer, vehicle: vehicle, settings: shop)
                        : WorkOrderRules.estimateMessage(order: order, customer: customer, vehicle: vehicle, settings: shop))
                }
            }

            if next != nil || !others.isEmpty {
                Section {
                    HStack(spacing: 8) {
                        if let next {
                            Button { move(order, to: next) } label: {
                                Text(Labels.workOrderAction(from: order.status, to: next))
                            }
                            .buttonStyle(.primary)
                        }
                        if !others.isEmpty {
                            Menu {
                                ForEach(others, id: \.self) { to in
                                    Button(role: to == "cancelled" ? .destructive : nil) {
                                        if to == "cancelled" { confirmCancel = true } else { move(order, to: to) }
                                    } label: {
                                        Label(Labels.workOrderAction(from: order.status, to: to), systemImage: Labels.workOrder(to).symbol)
                                    }
                                }
                            } label: {
                                Label(next == nil ? "Schimbă starea" : "Altă stare", systemImage: "ellipsis")
                                    .labelStyle(next == nil ? AnyLabelStyle(.titleAndIcon) : AnyLabelStyle(.iconOnly))
                            }
                            .buttonStyle(FillButtonStyle(kind: .secondary, fill: next == nil))
                            .accessibilityLabel("Altă stare")
                        }
                    }
                } footer: {
                    Text(Labels.workOrder(order.status).hint)
                }
                .bareRow()
            }

            Section {
                TextField("Ce spune clientul", text: binding(order, \.complaint), axis: .vertical)
                    .disabled(locked)
                TextField("Diagnoză: ce a găsit mecanicul", text: binding(order, \.diagnosis), axis: .vertical)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .disabled(locked)
            } header: { CapsHeader("Reclamație") }

            Section {
                ForEach(order.lines) { line in
                    Button { if !locked { editingLine = line } } label: {
                        LineRow(line: line, currency: shop.currency, vatPayer: shop.vatPayer, staff: staff[line.staffId ?? ""], services: services)
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
                        Label("Adaugă o operație sau o piesă", systemImage: "plus.circle.fill")
                    }
                    .frame(minHeight: 44)
                }
                if !order.lines.isEmpty {
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(shop.vatPayer ? "Total cu TVA" : "Total").font(.headline)
                            Text([totals.labor != 0 ? "manoperă \(Money.format(totals.labor, currency: shop.currency, decimals: 0))" : nil,
                                  totals.parts + totals.fees != 0 ? "piese \(Money.format(totals.parts + totals.fees, currency: shop.currency, decimals: 0))" : nil]
                                .compactMap { $0 }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(Money.format(totals.gross, currency: shop.currency)).font(.headline).monospacedDigit()
                            if shop.vatPayer {
                                Text("\(Money.format(totals.net, currency: shop.currency, decimals: 0)) + TVA \(Money.format(totals.gross - totals.net, currency: shop.currency))")
                                    .font(.caption).foregroundStyle(.secondary).monospacedDigit()
                            }
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
            } header: {
                CapsHeader("Operații și piese")
            }

            Section {
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
            } header: { CapsHeader("Factură") }

            Section {
                TextField("Note interne", text: binding(order, \.notes, allowLocked: true), axis: .vertical)
            } header: { CapsHeader("Note") }

            if WorkOrderRules.canDelete(status: order.status, invoiceId: order.invoiceId) {
                Section {
                    Button("Șterge lucrarea", role: .destructive) { confirmDelete = true }
                }
            }
        }
        .listStyle(.insetGrouped)
        .band(150)
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
        .buttonStyle(.secondarySmall)
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
    var staff: String? = nil
    /// When given, labor lines show the icon of their kind of work.
    var services: [String: Service]? = nil

    var body: some View {
        HStack(alignment: services == nil ? .firstTextBaseline : .center, spacing: 12) {
            if let services {
                if line.kind == "labor" {
                    WorkIcon(category: WorkKind.category(serviceId: line.refId, text: line.description, services: services))
                } else {
                    IconSquare(symbol: line.kind == "part" ? "shippingbox.fill" : "banknote.fill", color: line.kind == "part" ? .brown : .gray)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(line.description.isEmpty ? (Lines.kindLabel[line.kind] ?? "Linie") : line.description)
                    .strikethrough(line.refused)
                Text("\(Lines.kindLabel[line.kind] ?? "") · \(Money.formatQuantity(line.qty)) \(line.unit) × \(Money.format(line.unitPrice, currency: currency))\(line.discountPct > 0 ? " −\(JS.number(line.discountPct))%" : "")\(staff.map { " · \($0)" } ?? "")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if line.refused {
                    Text("Refuzată de client").font(.caption).foregroundStyle(.red)
                }
            }
            Spacer()
            Text(Money.format(Lines.net(line), currency: currency))
                .font(.body.weight(.semibold).monospacedDigit())
                .foregroundStyle(line.refused ? .secondary : .primary)
        }
        .padding(.vertical, 2)
    }
}
