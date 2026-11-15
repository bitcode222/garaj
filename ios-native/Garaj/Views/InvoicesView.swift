import SwiftUI

/// Facturi: every invoice, newest first; what is still to collect at a glance.
struct InvoicesView: View {
    @Environment(AppStore.self) private var store
    @State private var query = ""
    @State private var filter = Filter.all
    @State private var path: [String] = []
    @State private var creating = false
    @State private var paying: Invoice?

    enum Filter: String, CaseIterable, Identifiable {
        case all = "Toate", due = "De încasat", drafts = "Ciorne", paid = "Plătite"
        var id: String { rawValue }

        func keeps(_ state: String) -> Bool {
            switch self {
            case .all: true
            case .due: ["issued", "partial", "overdue"].contains(state)
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

    private var rows: [Row] {
        let customers = Dictionary(store.all(Customer.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let paidBy = Dictionary(grouping: store.all(Payment.self), by: \.invoiceId)
        let today = Dates.today()
        let q = query.trimmingCharacters(in: .whitespaces)
        return store.all(Invoice.self).compactMap { inv in
            let pays = paidBy[inv.id] ?? []
            let state = InvoiceRules.state(inv, payments: pays, today: today)
            guard filter.keeps(state) else { return nil }
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

    var body: some View {
        NavigationStack(path: $path) {
            let rows = rows
            let due = rows.filter { ["issued", "partial", "overdue"].contains($0.state) }.reduce(0) { $0 + $1.balance }
            List {
                Section {
                    Picker("Arată", selection: $filter) {
                        ForEach(Filter.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
                if filter == .due && due > 0 {
                    Section {
                        LabeledContent("De încasat") {
                            Text(Money.format(due, currency: store.currency)).font(.headline.monospacedDigit())
                        }
                    }
                }
                Section {
                    ForEach(rows) { row in
                        NavigationLink(value: row.invoice.id) { InvoiceRow(row: row, currency: store.currency) }
                            .swipeActions(edge: .leading) {
                                if ["issued", "partial", "overdue"].contains(row.state) {
                                    Button { paying = row.invoice } label: { Label("Încasează", systemImage: "banknote") }
                                        .tint(.green)
                                }
                            }
                    }
                }
            }
            .overlay {
                if rows.isEmpty {
                    if query.isEmpty {
                        ContentUnavailableView("Nicio factură", systemImage: "doc.text", description: Text(filter == .all ? "Facturile se fac din lucrări sau cu +." : "Nimic aici acum."))
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
                    Button { creating = true } label: { Label("Factură nouă", systemImage: "plus") }
                }
            }
            .sheet(item: $paying) { PaymentSheet(invoice: $0) }
            #if DEBUG
            // Screenshots: `-GarajOpenInvoice <number>` opens that invoice ("draft" = the newest draft).
            .task {
                guard let n = UserDefaults.standard.string(forKey: "GarajOpenInvoice") else { return }
                let all = store.all(Invoice.self)
                if let inv = n == "draft" ? all.first(where: { $0.status == "draft" }) : all.first(where: { $0.number.map(String.init) == n }) { path = [inv.id] }
            }
            #endif
            .confirmationDialog("Factură nouă", isPresented: $creating, titleVisibility: .hidden) {
                Button("Factură fără lucrare") { path.append(store.createInvoiceDraft().id) }
            } message: {
                Text("Factura unei lucrări se face din lucrare (butonul „Factură”).")
            }
        }
    }
}

private struct InvoiceRow: View {
    let row: InvoicesView.Row
    let currency: String

    var body: some View {
        let style = Labels.invoice(row.state)
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(verbatim: row.invoice.label).font(.headline.monospacedDigit())
                Spacer()
                Text(Money.format(row.gross, currency: currency)).font(.subheadline.monospacedDigit())
            }
            HStack(alignment: .firstTextBaseline) {
                Text(row.customer?.name ?? "Fără client").font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                Spacer()
                Text(Dates.display(row.invoice.issueDate)).font(.caption).foregroundStyle(.secondary)
            }
            HStack {
                Label(style.label, systemImage: style.symbol)
                    .labelStyle(StatusLabelStyle())
                    .font(.caption.weight(.medium))
                    .foregroundStyle(style.color)
                Spacer()
                if row.state == "partial" || row.state == "overdue" {
                    Text("Rest \(Money.format(row.balance, currency: currency))").font(.caption.monospacedDigit()).foregroundStyle(style.color)
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
