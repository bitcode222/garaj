import SwiftUI

/// Facturi: every invoice, newest first; what is still to collect at a glance.
struct InvoicesView: View {
    @Environment(AppStore.self) private var store
    @State private var query = ""
    @State private var filter = Filter.all
    @AppStorage("invoices.sort") private var sort = "new"
    @AppStorage("invoices.group") private var group = "month"
    @State private var path: [String] = []
    /// Inside Registru's stack instead of its own (Registru → Facturi).
    var embedded = false
    @State private var pushed: String?
    @State private var creating = false
    @State private var paying: Invoice?

    enum Filter: String, CaseIterable, Identifiable {
        case all = "Toate", due = "Neîncasate", overdue = "Restante", drafts = "Ciorne", paid = "Plătite"
        var id: String { rawValue }

        func keeps(_ state: String) -> Bool {
            switch self {
            case .all: true
            case .due: ["issued", "partial", "overdue"].contains(state)
            case .overdue: state == "overdue"
            case .drafts: state == "draft"
            case .paid: state == "paid"
            }
        }
    }

    struct Row: Identifiable {
        let invoice: Invoice
        let customer: Customer?
        let state: String
        let balance: Int
        let gross: Int
        var id: String { invoice.id }
    }

    /// Every invoice matching the search (the filter is applied after, so the chips can count).
    private var matching: [Row] {
        let customers = Dictionary(store.all(Customer.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let paidBy = Dictionary(grouping: store.all(Payment.self), by: \.invoiceId)
        let today = Dates.today()
        let q = query.trimmingCharacters(in: .whitespaces)
        return store.all(Invoice.self).compactMap { inv in
            let pays = paidBy[inv.id] ?? []
            let state = InvoiceRules.state(inv, payments: pays, today: today)
            let customer = customers[inv.customerId ?? ""]
            if !q.isEmpty, "\(inv.label) \(customer?.name ?? "")".range(of: q, options: [.caseInsensitive, .diacriticInsensitive]) == nil { return nil }
            let gross = store.totals(of: inv).gross
            return Row(invoice: inv, customer: customer, state: state, balance: gross - InvoiceRules.sumPayments(pays), gross: gross)
        }
        .sorted { a, b in
            // Drafts first, then by number (newest first).
            if (a.invoice.number == nil) != (b.invoice.number == nil) { return a.invoice.number == nil }
            return (a.invoice.number ?? 0, a.invoice.createdAt) > (b.invoice.number ?? 0, b.invoice.createdAt)
        }
    }

    private func sorted(_ rows: [Row]) -> [Row] {
        let ro = Locale(identifier: "ro")
        switch sort {
        case "old": return rows.reversed()
        case "amount": return rows.sorted { $0.gross > $1.gross }
        case "client": return rows.sorted { ($0.customer?.name ?? "").compare($1.customer?.name ?? "", locale: ro) == .orderedAscending }
        case "due": return rows.sorted { ($0.invoice.dueDate ?? "9999") < ($1.invoice.dueDate ?? "9999") }
        default: return rows
        }
    }

    private func grouped(_ rows: [Row]) -> [(title: String, rows: [Row])] {
        switch group {
        case "status":
            let order = ["overdue", "partial", "issued", "draft", "paid", "storno", "cancelled"]
            let by = Dictionary(grouping: rows, by: \.state)
            return (order + by.keys.filter { !order.contains($0) }.sorted()).compactMap { k in by[k].map { (Labels.invoice(k).label, $0) } }
        case "client":
            var keys: [String] = []
            for r in rows where !keys.contains(r.customer?.name ?? "Fără client") { keys.append(r.customer?.name ?? "Fără client") }
            let by = Dictionary(grouping: rows) { $0.customer?.name ?? "Fără client" }
            return keys.map { ($0, by[$0] ?? []) }
        case "none":
            return rows.isEmpty ? [] : [("Toate", rows)]
        default:
            return sort == "new" ? Self.byMonth(rows) : Self.byMonth(rows).map { ($0.title, sorted($0.rows)) }
        }
    }

    /// Drafts first, then one section per month of issue, newest first.
    static func byMonth(_ rows: [Row]) -> [(title: String, rows: [Row])] {
        let ro = Locale(identifier: "ro_RO")
        let thisYear = Dates.today().prefix(4)
        var out: [(title: String, rows: [Row])] = []
        let drafts = rows.filter { $0.invoice.number == nil }
        if !drafts.isEmpty { out.append(("Ciorne", drafts)) }
        let issued = rows.filter { $0.invoice.number != nil }
        var order: [String] = []
        let grouped = Dictionary(grouping: issued) { Dates.monthKey($0.invoice.issueDate ?? "") }
        for r in issued { let k = Dates.monthKey(r.invoice.issueDate ?? ""); if !order.contains(k) { order.append(k) } }
        order.sort(by: >)
        for k in order {
            let date = Dates.parseDate("\(k)-01")
            let title = date.map { k.hasPrefix(thisYear) ? $0.formatted(.dateTime.month(.wide).locale(ro)) : $0.formatted(.dateTime.month(.wide).year().locale(ro)) } ?? "Fără dată"
            out.append((title.capitalizedFirst, grouped[k] ?? []))
        }
        return out
    }

    var body: some View {
        if embedded {
            page.navigationDestination(item: $pushed) { InvoiceDetailView(id: $0) }
        } else {
            NavigationStack(path: $path) { page }
        }
    }

    private func open(_ id: String) { if embedded { pushed = id } else { path.append(id) } }

    @ViewBuilder private var page: some View {
            let all = matching
            let rows = all.filter { filter.keeps($0.state) }
            let dueRows = all.filter { Filter.due.keeps($0.state) }
            let due = dueRows.reduce(0) { $0 + $1.balance }
            let overdue = dueRows.filter { $0.state == "overdue" }.count
            let monthStart = "\(Dates.monthKey(Dates.today()))-01"
            let monthPayments = store.all(Payment.self).filter { $0.date >= monthStart }
            let month = Dates.parseDate(monthStart)?.formatted(.dateTime.month(.wide).locale(Locale(identifier: "ro_RO"))) ?? ""
            let groups = grouped(sorted(rows))
            List {
                Section {
                    TileGrid {
                        StatTile(label: "De încasat", value: Money.format(due, currency: store.currency, decimals: 0),
                                 detail: "\(dueRows.count) \(dueRows.count == 1 ? "factură" : "facturi")\(overdue > 0 ? ", \(overdue) \(overdue == 1 ? "restantă" : "restante")" : "")",
                                 detailColor: overdue > 0 ? .red : nil) { filter = .due }
                        StatTile(label: "Încasat în \(month)", value: Money.format(monthPayments.reduce(0) { $0 + $1.amount }, currency: store.currency, decimals: 0),
                                 detail: "\(monthPayments.count) \(monthPayments.count == 1 ? "plată" : "plăți")")
                    }
                }
                .bareRow()
                Section {
                    ChipRow {
                        ForEach(Filter.allCases) { f in
                            CountChip(title: f.rawValue, count: all.filter { f.keeps($0.state) }.count, on: filter == f) { filter = f }
                        }
                    }
                }
                .bareRow()
                ForEach(groups, id: \.title) { group in
                    Section {
                        ForEach(group.rows) { row in
                            NavigationLink(value: row.invoice.id) { InvoiceRow(row: row, currency: store.currency) }
                                .swipeActions(edge: .leading) {
                                    if ["issued", "partial", "overdue"].contains(row.state) {
                                        Button { paying = row.invoice } label: { Label("Încasează", systemImage: "banknote") }
                                            .tint(.green)
                                    }
                                }
                        }
                    } header: {
                        CapsHeader(group.title)
                    }
                }
            }
            .groupedBackground()
            .listStyle(.insetGrouped)
            .sensoryFeedback(.selection, trigger: filter)
            .overlay {
                if rows.isEmpty {
                    if query.isEmpty {
                        ContentUnavailableView {
                            Label(filter == .overdue ? "Nicio factură restantă" : "Nicio factură", systemImage: filter == .overdue ? "checkmark.seal" : "doc.text")
                        } description: {
                            Text(filter == .all ? "Facturile se fac din lucrări, cu butonul „Fă factura”, sau de aici." : filter == .overdue ? "Toți clienții au plătit la termen." : "Nimic aici acum.")
                        } actions: {
                            if filter == .all {
                                Button { creating = true } label: { Label("Factură nouă", systemImage: "doc.badge.plus") }.buttonStyle(FillButtonStyle(fill: false))
                            } else {
                                Button("Vezi toate facturile") { filter = .all }.buttonStyle(FillButtonStyle(kind: .secondary, fill: false))
                            }
                        }
                    } else {
                        ContentUnavailableView.search(text: query)
                    }
                }
            }
            .navigationTitle("Facturi")
            .navigationDestination(for: String.self) { InvoiceDetailView(id: $0) }
            .searchable(text: $query, prompt: "Număr sau client")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    SortGroupMenu(sorts: [("new", "Cele mai noi"), ("old", "Cele mai vechi"), ("amount", "Sumă"), ("client", "Client (A–Z)"), ("due", "Scadență")],
                                  sort: $sort,
                                  groups: [("month", "Lună"), ("status", "Stare"), ("client", "Client"), ("none", "Fără grupare")],
                                  group: $group)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { creating = true } label: { Label("Factură nouă", systemImage: "plus") }
                }
            }
            .sheet(item: $paying) { PaymentSheet(invoice: $0) }
            #if DEBUG
            // Screenshots: `-GarajOpenInvoice <number>` opens that invoice ("draft" = the newest draft).
            .task {
                guard let n = UserDefaults.standard.string(forKey: "GarajOpenInvoice") else { return }
                let all = store.all(Invoice.self)
                if let inv = n == "draft" ? all.first(where: { $0.status == "draft" }) : all.first(where: { $0.number.map(String.init) == n }) { open(inv.id) }
            }
            #endif
            .confirmationDialog("Factură nouă", isPresented: $creating, titleVisibility: .hidden) {
                Button("Factură fără lucrare") { open(store.createInvoiceDraft().id) }
            } message: {
                Text("Factura unei lucrări se face din lucrare (butonul „Factură”).")
            }
    }
}

private struct InvoiceRow: View {
    let row: InvoicesView.Row
    let currency: String

    var body: some View {
        let ro = Locale(identifier: "ro_RO")
        let short = { (d: String?) in d.flatMap(Dates.parseDate)?.formatted(.dateTime.day().month(.abbreviated).locale(ro)) ?? "" }
        let detail: String = {
            switch row.state {
            case "draft": return "ciornă din \(short(Dates.dayOfInstant(row.invoice.createdAt)))"
            case "paid", "cancelled", "storno": return short(row.invoice.issueDate)
            default: return [short(row.invoice.issueDate), row.invoice.dueDate.map { "scadentă \(short($0))" }].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
            }
        }()
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: "\(row.invoice.number == nil ? "Ciornă" : row.invoice.label) · \(row.customer?.name ?? "Fără client")").lineLimit(1)
                Text(detail).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                StatusPill(style: Labels.invoice(row.state)).padding(.top, 2)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(Money.format(row.gross, currency: currency)).font(.body.weight(.semibold)).monospacedDigit()
                if row.state == "partial" || row.state == "overdue" {
                    Text("rest \(Money.format(row.balance, currency: currency))").font(.caption).monospacedDigit().foregroundStyle(Labels.invoice(row.state).color)
                }
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}

/// Record a payment: the rest by default, method, date, note.
struct PaymentSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo
    @Environment(\.dismiss) private var dismiss
    let invoice: Invoice

    @State private var amount = ""
    @State private var method = "cash"
    @State private var date = Date.now
    @State private var note = ""
    @State private var done = 0

    var body: some View {
        let rest = InvoiceRules.balance(invoice, store.payments(of: invoice.id))
        let parsed = Money.parse(amount)
        let problem = parsed.map { InvoiceRules.paymentProblem($0, invoice: invoice, payments: store.payments(of: invoice.id), currency: store.currency) } ?? "Introdu suma."
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Suma") {
                        TextField("0,00", text: $amount).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    }
                    Picker("Metoda", selection: $method) {
                        ForEach(Labels.paymentMethods, id: \.key) { Label($0.label, systemImage: $0.symbol).tag($0.key) }
                    }
                    DatePicker("Data", selection: $date, displayedComponents: .date)
                    TextField("Notă", text: $note)
                } header: {
                    Text("\(invoice.label) · rest \(Money.format(rest, currency: store.currency))")
                } footer: {
                    if let problem, !amount.isEmpty { Text(problem).foregroundStyle(.red) }
                }
            }
            .groupedBackground()
            .navigationTitle("Încasare")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Încasează") {
                        guard let value = parsed,
                              let payment = try? store.recordPayment(invoice.id, amount: value, method: method, date: Dates.isoDate(date), note: note) else { return }
                        done += 1
                        undo.show("Încasat \(Money.format(value, currency: store.currency))") { store.deletePayment(payment.id) }
                        dismiss()
                    }
                    .disabled(problem != nil)
                }
            }
            .onAppear { amount = Money.toInput(max(rest, 0)) }
            .sensoryFeedback(.success, trigger: done)
        }
        .presentationDetents([.medium, .large])
    }
}
