import Foundation

// Port of the invoice and payment actions in src/lib/store/actions.js.

extension AppStore {
    func payments(of invoiceId: String) -> [Payment] {
        all(Payment.self).filter { $0.invoiceId == invoiceId }.sorted { $0.createdAt < $1.createdAt }
    }

    func invoiceState(_ invoice: Invoice) -> String {
        InvoiceRules.state(invoice, payments: payments(of: invoice.id), today: Dates.today())
    }

    /// Totals of any invoice: frozen when issued, live for a draft.
    func totals(of invoice: Invoice) -> Totals {
        invoice.totals ?? Lines.totals(invoice.lines, vatPayer: shop.vatPayer)
    }

    // MARK: Drafts

    /// The job's draft or issued invoice, making a draft when there is none (invoiceForWorkOrder).
    @discardableResult
    func invoiceForWorkOrder(_ id: String) throws -> Invoice {
        guard var order = get(WorkOrder.self, id) else { throw DomainError(code: "not_found", message: "Lucrarea nu mai există.") }
        if let current = get(Invoice.self, order.invoiceId), current.status != "cancelled" { return current }
        guard !order.lines.isEmpty else { throw DomainError(code: "invalid", message: "Adaugă cel puțin o linie în lucrare înainte de factură.") }
        let t = Dates.instant()
        let s = shop
        let today = Dates.today()
        var draft = newDraft(customerId: order.customerId, vehicleId: order.vehicleId, at: t, today: today)
        draft.workOrderId = order.id
        draft.mileage = order.mileage
        draft.lines = InvoiceRules.linesFromOrder(order, settings: s)
        save(draft)
        order.invoiceId = draft.id
        save(order, updatedAt: t)
        return draft
    }

    private func newDraft(customerId: String?, vehicleId: String?, at t: String, today: String) -> Invoice {
        let s = shop
        var draft = Invoice(id: Ids.uid(), status: "draft", series: s.series, number: nil, issueDate: today,
                            dueDate: Dates.addDays(today, s.dueDays), customerId: customerId, vehicleId: vehicleId,
                            workOrderId: nil, lines: [], notes: "", createdAt: t, stornoId: nil, stornoOf: nil)
        draft.activity = []
        return draft
    }

    @discardableResult
    func createInvoiceDraft(customerId: String? = nil, vehicleId: String? = nil) -> Invoice {
        let draft = newDraft(customerId: customerId, vehicleId: vehicleId, at: Dates.instant(), today: Dates.today())
        save(draft, updatedAt: draft.createdAt)
        return draft
    }

    func updateInvoiceDraft(_ draft: Invoice) throws {
        guard let stored = get(Invoice.self, draft.id) else { throw DomainError(code: "not_found", message: "Factura nu mai există.") }
        guard stored.status == "draft" else { throw DomainError(code: "locked", message: "Factura emisă nu se mai modifică. Poți emite o stornare.") }
        save(draft, updatedAt: Dates.instant())
    }

    func deleteInvoiceDraft(_ id: String) throws {
        guard let invoice = get(Invoice.self, id) else { throw DomainError(code: "not_found", message: "Factura nu mai există.") }
        guard invoice.status == "draft" else { throw DomainError(code: "locked", message: "Doar ciornele pot fi șterse. Factura emisă se stornează.") }
        if var order = get(WorkOrder.self, invoice.workOrderId), order.invoiceId == id {
            order.invoiceId = nil
            save(order, updatedAt: Dates.instant())
        }
        delete(Invoice.self, id)
    }

    /// A draft whose job changed takes the job's lines again.
    func refreshDraftFromOrder(_ id: String) throws {
        guard var draft = get(Invoice.self, id) else { throw DomainError(code: "not_found", message: "Factura nu mai există.") }
        guard let order = get(WorkOrder.self, draft.workOrderId) else { throw DomainError(code: "not_found", message: "Lucrarea nu mai există.") }
        draft.lines = InvoiceRules.linesFromOrder(order, settings: shop)
        try updateInvoiceDraft(draft)
    }

    // MARK: Numbers and stock

    /// The next number of a series (meta.counters.invoices[series]), and moves the counter on.
    private func takeInvoiceNumber(series: String) -> Int {
        var counters = meta["counters"]?.object ?? [:]
        var bySeries = counters["invoices"]?.object ?? [:]
        let number = bySeries[series]?.number.map { Int($0) } ?? shop.startNumber
        bySeries[series] = .number(Double(number + 1))
        counters["invoices"] = .object(bySeries)
        setMeta("counters", .object(counters))
        return number
    }

    /// Stock goes out when an invoice is issued (sign −1) and back with its storno (+1).
    private func applyStock(_ lines: [Line], sign: Double, at t: String) {
        var delta: [String: Double] = [:]
        for line in lines where line.kind == "part" {
            guard let ref = line.refId else { continue }
            delta[ref, default: 0] += sign * abs(line.qty)
        }
        for (partId, change) in delta {
            guard var raw = collections[.parts]?[partId]?.object else { continue }
            let stock = raw["stock"]?.number ?? 0
            raw["stock"] = .number(Money.jsRound((stock + change) * 1000) / 1000)
            raw["updatedAt"] = .string(t)
            put(.parts, .object(raw))
        }
    }

    // MARK: Issue, storno, pay

    /// Gives the draft its number, freezes the snapshot and takes the parts out of stock.
    @discardableResult
    func issueInvoiceDraft(_ id: String) throws -> Invoice {
        guard let draft = get(Invoice.self, id) else { throw DomainError(code: "not_found", message: "Factura nu mai există.") }
        guard draft.status == "draft" else { throw DomainError(code: "locked", message: "Factura este deja emisă.") }
        let customer = get(Customer.self, draft.customerId)
        if let first = InvoiceRules.checklist(draft, customer: customer).first { throw DomainError(code: "cannot_issue", message: first.text) }
        let t = Dates.instant()
        var withSeries = draft
        if withSeries.series.isEmpty { withSeries.series = shop.series }
        // Checked before the number is taken, so a refusal never burns a number.
        let preview = Lines.totals(withSeries.lines.map { var l = $0; l.vatRate = shop.vatPayer ? l.vatRate : 0; return l }, vatPayer: shop.vatPayer)
        guard preview.gross > 0 else { throw DomainError(code: "cannot_issue", message: "Totalul facturii trebuie să fie pozitiv.") }
        let number = takeInvoiceNumber(series: withSeries.series)
        let issued = try InvoiceRules.issue(withSeries, settings: settings, customer: customer,
                                            customerJSON: collections[.customers]?[draft.customerId ?? ""]?.object,
                                            vehicleJSON: collections[.vehicles]?[draft.vehicleId ?? ""]?.object, number: number, now: t)
        save(issued, updatedAt: t)
        applyStock(issued.lines, sign: -1, at: t)
        if var order = get(WorkOrder.self, issued.workOrderId) {
            order.invoiceId = issued.id
            save(order, updatedAt: t)
        }
        return issued
    }

    /// The storno and what was already paid on the original (to give back).
    @discardableResult
    func stornoInvoice(_ id: String) throws -> (storno: Invoice, refundDue: Int) {
        guard var original = get(Invoice.self, id) else { throw DomainError(code: "not_found", message: "Factura nu mai există.") }
        let t = Dates.instant()
        _ = try InvoiceRules.storno(original, number: 0, today: Dates.today(), now: t) // refuses before a number is taken
        let number = takeInvoiceNumber(series: original.series)
        let storno = try InvoiceRules.storno(original, number: number, today: Dates.today(), now: t)
        save(storno, updatedAt: t)
        original.status = "cancelled"
        original.stornoId = storno.id
        original.activity.append(.object(["at": .string(t), "type": .string("cancelled")]))
        save(original, updatedAt: t)
        applyStock(original.lines, sign: 1, at: t)
        if var order = get(WorkOrder.self, original.workOrderId), order.invoiceId == original.id {
            order.invoiceId = nil
            save(order, updatedAt: t)
        }
        return (storno, InvoiceRules.sumPayments(payments(of: id)))
    }

    @discardableResult
    func recordPayment(_ invoiceId: String, amount: Int, method: String = "cash", date: String = Dates.today(), note: String = "") throws -> Payment {
        guard let invoice = get(Invoice.self, invoiceId) else { throw DomainError(code: "not_found", message: "Factura nu mai există.") }
        if let problem = InvoiceRules.paymentProblem(amount, invoice: invoice, payments: payments(of: invoiceId), currency: currency) {
            throw DomainError(code: "payment", message: problem)
        }
        let payment = Payment(id: Ids.uid(), invoiceId: invoiceId, amount: amount, method: method, date: date,
                              note: note.trimmingCharacters(in: .whitespacesAndNewlines), createdAt: Dates.instant())
        save(payment)
        return payment
    }

    func deletePayment(_ id: String) { delete(Payment.self, id) }

    /// Puts a deleted payment back (undo).
    func restorePayment(_ payment: Payment) { save(payment) }

    /// Issues and records it paid in full (a counter sale). If the payment fails, the invoice stays issued.
    @discardableResult
    func issueAndPay(_ id: String, method: String = "cash") throws -> Invoice {
        let issued = try issueInvoiceDraft(id)
        try recordPayment(issued.id, amount: issued.totals?.gross ?? 0, method: method)
        return issued
    }

    /// A new draft for a cancelled invoice: from its job when it has one, else a copy of its lines.
    @discardableResult
    func redoInvoice(_ id: String) throws -> Invoice {
        guard let original = get(Invoice.self, id) else { throw DomainError(code: "not_found", message: "Factura nu mai există.") }
        guard original.status == "cancelled" else { throw DomainError(code: "invalid", message: "Doar o factură stornată se reface.") }
        if let orderId = original.workOrderId, get(WorkOrder.self, orderId) != nil { return try invoiceForWorkOrder(orderId) }
        var draft = createInvoiceDraft(customerId: original.customerId, vehicleId: original.vehicleId)
        draft.lines = original.lines.map { var l = $0; l.id = Ids.uid(); return l }
        draft.mileage = original.mileage
        try updateInvoiceDraft(draft)
        return draft
    }
}
