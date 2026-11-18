import SwiftUI

/// One invoice. A draft is edited here (client, dates, lines, notes) and issued; an issued one
/// shows the document, takes payments, is shared as PDF, and can be stornoed.
struct InvoiceDetailView: View {
    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo
    @Environment(\.dismiss) private var dismiss
    let id: String

    @State private var paying: Invoice?
    @State private var editingLine: Line?
    @State private var adding: AddLineSheet.Source?
    @State private var confirmStorno = false
    @State private var confirmDelete = false
    @State private var showDocument = false
    @State private var done = 0
    @State private var error: String?
    @State private var notice: String?

    var body: some View {
        if let invoice = store.get(Invoice.self, id) {
            content(invoice)
        } else {
            ContentUnavailableView("Factura nu mai există", systemImage: "doc.text")
        }
    }

    private func paper(_ invoice: Invoice) -> InvoicePaper {
        let snapshot = invoice.snapshot ?? InvoiceRules.snapshot(
            settings: store.settings,
            customer: store.collections[.customers]?[invoice.customerId ?? ""]?.object,
            vehicle: store.collections[.vehicles]?[invoice.vehicleId ?? ""]?.object,
            mileage: invoice.mileage.map { .number(Double($0)) })
        return InvoicePaper(invoice: invoice, snapshot: snapshot, totals: store.totals(of: invoice), currency: store.currency)
    }

    private func content(_ invoice: Invoice) -> some View {
        let state = store.invoiceState(invoice)
        let style = Labels.invoice(state)
        let payments = store.payments(of: invoice.id)
        let totals = store.totals(of: invoice)
        let balance = totals.gross - InvoiceRules.sumPayments(payments)
        let customer = store.get(Customer.self, invoice.customerId)
        let isDraft = invoice.status == "draft"
        let problems = isDraft ? InvoiceRules.checklist(invoice, customer: customer) : []
        let currency = store.currency
        let order = store.get(WorkOrder.self, invoice.workOrderId)

        return List {
            if !isDraft {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Button { showDocument = true } label: {
                            GeometryReader { g in
                                paper(invoice)
                                    .frame(width: 595)
                                    .scaleEffect(g.size.width / 595, anchor: .topLeading)
                            }
                            .frame(height: 390)
                            .clipShape(.rect(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color(.separator), lineWidth: 0.5))
                            .shadow(color: .black.opacity(0.08), radius: 12, y: 4)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Factura \(invoice.label), atinge pentru toată pagina")
                    }
                } header: {
                    HStack {
                        StatusPill(style: style)
                        Spacer()
                        Text(["partial", "overdue"].contains(state) ? "rest \(Money.format(balance, currency: currency))" : Money.format(totals.gross, currency: currency))
                            .font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(.primary)
                    }
                    .textCase(nil)
                }
                .bareRow()
                .listRowInsets(EdgeInsets(top: 0, leading: 20, bottom: 0, trailing: 20))

                Section {
                    VStack(spacing: 10) {
                        if ["issued", "partial", "overdue"].contains(state) {
                            Button { paying = invoice } label: {
                                Label("Încasează \(Money.format(balance, currency: currency))", systemImage: "banknote")
                            }
                            .buttonStyle(.primary)
                        }
                        if let phone = customer?.phone, !phone.isEmpty, invoice.stornoOf == nil,
                           let url = People.whatsappURL(phone, text: InvoiceRules.message(invoice, balance: balance, settings: store.settings)) {
                            Link(destination: url) { Label("Trimite pe WhatsApp", systemImage: "text.bubble") }
                                .buttonStyle(.secondary)
                        }
                    }
                }
                .bareRow()
                .listRowInsets(EdgeInsets(top: 0, leading: 20, bottom: 0, trailing: 20))
            }

            if isDraft {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 12) {
                        Image(systemName: style.symbol)
                            .font(.title2)
                            .foregroundStyle(style.color)
                            .frame(width: 44, height: 44)
                            .background(style.color.opacity(0.15), in: .circle)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(style.label).font(.title3.weight(.semibold))
                            Text(Money.format(totals.gross, currency: currency) + (["partial", "overdue"].contains(state) ? " · rest \(Money.format(balance, currency: currency))" : ""))
                                .font(.subheadline.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                    }
                    if isDraft {
                        Button { issue(invoice) } label: {
                            Label("Emite factura", systemImage: "checkmark.seal")
                        }
                        .buttonStyle(.primary)
                        .disabled(!problems.isEmpty)
                        Menu {
                            ForEach(Labels.paymentMethods, id: \.key) { m in
                                Button { issueAndPay(invoice, method: m.key) } label: { Label(m.label, systemImage: m.symbol) }
                            }
                        } label: {
                            Label("Emite și încasează integral", systemImage: "banknote")
                        }
                        .buttonStyle(.secondary)
                        .disabled(!problems.isEmpty)
                    } else if ["issued", "partial", "overdue"].contains(state) {
                        Button { paying = invoice } label: {
                            Label("Încasează", systemImage: "banknote")
                        }
                        .buttonStyle(.primary)
                    }
                }
                .padding(.vertical, 4)
                ForEach(problems, id: \.self) { p in
                    Label(p.text, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange).font(.subheadline)
                }
            }
            }

            if isDraft {
                draftSections(invoice, customer: customer, order: order)
            } else {
                Section {
                    if let customer { LabeledContent("Client", value: customer.name) }
                    LabeledContent("Data emiterii", value: Dates.display(invoice.issueDate))
                    if let due = invoice.dueDate { LabeledContent("Scadență", value: Dates.display(due)) }
                    if let other = store.get(Invoice.self, invoice.stornoOf ?? invoice.stornoId) {
                        NavigationLink(value: other.id) {
                            LabeledContent(invoice.stornoOf != nil ? "Stornează" : "Stornată prin", value: other.label)
                        }
                    }
                } header: { CapsHeader("Detalii") }
                if invoice.stornoOf == nil && invoice.status != "draft" {
                    Section {
                        ForEach(payments) { p in
                            LabeledContent {
                                Text(Money.format(p.amount, currency: currency)).monospacedDigit()
                            } label: {
                                Text(Labels.paymentMethod(p.method))
                                Text(Dates.display(p.date) + (p.note.isEmpty ? "" : " · \(p.note)"))
                            }
                            .swipeActions {
                                Button(role: .destructive) {
                                    store.deletePayment(p.id)
                                    undo.show("Plată ștearsă") { store.restorePayment(p) }
                                } label: { Label("Șterge", systemImage: "trash") }
                            }
                        }
                        if payments.isEmpty {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Nicio plată încă")
                                if let due = invoice.dueDate {
                                    let days = Dates.diffDays(Dates.today(), due)
                                    Text("Scadentă pe \(Dates.display(due))\(days > 0 ? ", peste \(days == 1 ? "o zi" : "\(days) zile")" : days == 0 ? ", azi" : "")")
                                        .font(.subheadline).foregroundStyle(.secondary)
                                }
                            }
                        }
                    } header: { CapsHeader("Plăți") }
                }
            }

            if let order {
                Section {
                    NavigationLink { WorkOrderDetailView(id: order.id) } label: {
                        Label("Lucrarea #\(String(order.number))", systemImage: "wrench.and.screwdriver")
                    }
                }
            }

            Section {
                if isDraft {
                    Button("Șterge ciorna", role: .destructive) { confirmDelete = true }
                } else if invoice.status == "issued" && invoice.stornoOf == nil {
                    Button("Stornează factura", role: .destructive) { confirmStorno = true }
                } else if invoice.status == "cancelled" {
                    Button("Reface factura") {
                        do { let redo = try store.redoInvoice(invoice.id); notice = "Ciorna nouă e gata."; _ = redo } catch { self.error = error.localizedDescription }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .groupedBackground()
        .navigationTitle(Text(verbatim: isDraft ? "Ciornă" : invoice.label))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !isDraft {
                Menu {
                    Button { showDocument = true } label: { Label("Vezi factura", systemImage: "doc.richtext") }
                    ShareLink(item: pdfFile(invoice), preview: SharePreview(invoice.label, image: Image(systemName: "doc.text"))) {
                        Label("Trimite PDF-ul", systemImage: "square.and.arrow.up")
                    }
                    if let phone = customer?.phone, !phone.isEmpty, invoice.stornoOf == nil,
                       let url = People.smsURL(phone, body: InvoiceRules.message(invoice, balance: balance, settings: store.settings)) {
                        Link(destination: url) { Label("Trimite prin SMS", systemImage: "message") }
                    }
                } label: {
                    Text("PDF")
                }
            }
        }
        .sheet(item: $paying) { PaymentSheet(invoice: $0) }
        .sheet(isPresented: $showDocument) { DocumentSheet(paper: paper(invoice), pdf: pdfFile(invoice), title: invoice.label) }
        .sheet(item: $editingLine) { line in
            LineEditor(line: line, isNew: !invoice.lines.contains { $0.id == line.id }) { saved in
                change { draft in
                    if let i = draft.lines.firstIndex(where: { $0.id == saved.id }) { draft.lines[i] = saved } else { draft.lines.append(saved) }
                }
            }
        }
        .sheet(item: $adding) { source in
            AddLineSheet(source: source) { lines in change { $0.lines.append(contentsOf: lines) } }
        }
        .confirmationDialog("Stornezi factura \(invoice.label)?", isPresented: $confirmStorno, titleVisibility: .visible) {
            Button("Stornează", role: .destructive) { storno(invoice) }
        } message: {
            Text("Se emite o factură de stornare cu număr nou, iar piesele revin în stoc. Nu se poate anula.")
        }
        .confirmationDialog("Ștergi ciorna?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Șterge", role: .destructive) {
                do { try store.deleteInvoiceDraft(invoice.id); dismiss() } catch { self.error = error.localizedDescription }
            }
        }
        .alert("Nu se poate", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(error ?? "") }
        .alert(notice ?? "", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            Button("OK", role: .cancel) {}
        }
        .sensoryFeedback(.success, trigger: done)
        #if DEBUG
        .task { if UserDefaults.standard.bool(forKey: "GarajShowDocument") { showDocument = true } }
        #endif
    }

    @ViewBuilder
    private func draftSections(_ invoice: Invoice, customer: Customer?, order: WorkOrder?) -> some View {
        let currency = store.currency
        Section {
            NavigationLink {
                SearchPicker(title: "Client", items: store.all(Customer.self).sorted { $0.name.localizedCompare($1.name) == .orderedAscending },
                             text: { $0.name }, detail: { People.formatPhone($0.phone) },
                             selection: Binding(get: { invoice.customerId }, set: { id in change { $0.customerId = id } }))
            } label: {
                LabeledContent("Client", value: customer?.name ?? "Alege")
            }
            DatePicker("Data emiterii", selection: dateBinding(\.issueDate), displayedComponents: .date)
            DatePicker("Scadență", selection: dateBinding(\.dueDate), displayedComponents: .date)
        }
        if InvoiceRules.draftBehind(invoice, order: order, settings: store.shop) {
            Section {
                Button {
                    do { try store.refreshDraftFromOrder(invoice.id) } catch { self.error = error.localizedDescription }
                } label: {
                    Label("Lucrarea s-a schimbat: ia din nou liniile", systemImage: "arrow.triangle.2.circlepath")
                }
            }
        }
        Section("Linii") {
            ForEach(invoice.lines) { line in
                Button { editingLine = line } label: { LineRow(line: line, currency: currency, vatPayer: store.shop.vatPayer) }
                    .tint(.primary)
                    .swipeActions {
                        Button(role: .destructive) { change { $0.lines.removeAll { $0.id == line.id } } } label: { Label("Șterge", systemImage: "trash") }
                    }
            }
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
        let totals = store.totals(of: invoice)
        if !invoice.lines.isEmpty {
            Section("Total") {
                if store.shop.vatPayer {
                    LabeledContent("Fără TVA", value: Money.format(totals.net, currency: currency))
                    ForEach(totals.byRate, id: \.rate) { LabeledContent("TVA \(JS.number($0.rate))%", value: Money.format($0.vat, currency: currency)) }
                }
                LabeledContent {
                    Text(Money.format(totals.gross, currency: currency)).font(.headline.monospacedDigit())
                } label: { Text("Total de plată").font(.headline) }
            }
        }
        Section("Mențiuni pe factură") {
            TextField("Mențiuni", text: Binding(get: { invoice.notes }, set: { v in change { $0.notes = v } }), axis: .vertical)
            Button { showDocument = true } label: { Label("Previzualizează", systemImage: "doc.richtext") }
        }
    }

    // MARK: Writes

    private func change(_ edit: (inout Invoice) -> Void) {
        guard var draft = store.get(Invoice.self, id) else { return }
        edit(&draft)
        do { try store.updateInvoiceDraft(draft) } catch { self.error = error.localizedDescription }
    }

    private func dateBinding(_ key: WritableKeyPath<Invoice, String?>) -> Binding<Date> {
        Binding {
            Dates.parseDate(store.get(Invoice.self, id)?[keyPath: key] ?? "") ?? .now
        } set: { date in
            change { $0[keyPath: key] = Dates.isoDate(date) }
        }
    }

    private func issue(_ invoice: Invoice) {
        do {
            let issued = try store.issueInvoiceDraft(invoice.id)
            done += 1
            undo.show("Emisă: \(issued.label)")
        } catch { self.error = error.localizedDescription }
    }

    private func issueAndPay(_ invoice: Invoice, method: String) {
        do {
            let issued = try store.issueAndPay(invoice.id, method: method)
            done += 1
            undo.show("Emisă și încasată: \(issued.label)")
        } catch { self.error = error.localizedDescription }
    }

    private func storno(_ invoice: Invoice) {
        do {
            let (storno, refund) = try store.stornoInvoice(invoice.id)
            done += 1
            notice = refund > 0
                ? "Stornare emisă: \(storno.label). Clientul a plătit deja \(Money.format(refund, currency: store.currency)); dă-i banii înapoi."
                : "Stornare emisă: \(storno.label)."
        } catch { self.error = error.localizedDescription }
    }

    private func pdfFile(_ invoice: Invoice) -> InvoicePDFFile {
        let paper = paper(invoice)
        let name = invoice.number == nil ? "Ciorna factura" : "Factura \(invoice.label)"
        return InvoicePDFFile { try await MainActor.run { try InvoicePDF.render(paper, name: name) } }
    }
}

/// The document full screen, zoomable to fit, with share.
private struct DocumentSheet: View {
    @Environment(\.dismiss) private var dismiss
    let paper: InvoicePaper
    let pdf: InvoicePDFFile
    let title: String

    var body: some View {
        NavigationStack {
            GeometryReader { geo in
                ScrollView {
                    let scale = min(1, (geo.size.width - 16) / 595)
                    paper
                        .fixedSize(horizontal: false, vertical: true)
                        .clipShape(.rect(cornerRadius: 8))
                        .shadow(color: .black.opacity(0.2), radius: 8, y: 2)
                        .scaleEffect(scale, anchor: .top)
                        .frame(width: 595 * scale)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }
            }
            .background(Color(.secondarySystemBackground))
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Închide") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    ShareLink(item: pdf, preview: SharePreview(title, image: Image(systemName: "doc.text"))) {
                        Label("Trimite", systemImage: "square.and.arrow.up")
                    }
                }
            }
        }
    }
}
