import Foundation

// Port of src/domain/invoice.js and the invoice helpers of src/domain/work-order.js.
// Stored status: draft · issued · cancelled (only through storno). The status people see
// (paid · partial · overdue) comes from payments and dates.

enum InvoiceRules {
    static func formatNumber(series: String, number: Int?) -> String {
        guard let number else { return "Ciornă" }
        let digits = String(number)
        return "\(series) \(String(repeating: "0", count: max(0, 4 - digits.count)))\(digits)"
    }

    static func sumPayments(_ payments: [Payment]) -> Int { payments.reduce(0) { $0 + $1.amount } }

    static func balance(_ invoice: Invoice, _ payments: [Payment]) -> Int {
        (invoice.totals?.gross ?? 0) - sumPayments(payments)
    }

    /// draft · issued · partial · paid · overdue · cancelled · storno
    static func state(_ invoice: Invoice, payments: [Payment], today: String) -> String {
        if invoice.status == "draft" { return "draft" }
        if invoice.status == "cancelled" { return "cancelled" }
        if invoice.stornoOf != nil { return "storno" }
        let paid = sumPayments(payments)
        if paid >= (invoice.totals?.gross ?? 0) { return "paid" }
        if let due = invoice.dueDate, due < today { return "overdue" }
        return paid > 0 ? "partial" : "issued"
    }

    static func joinAddress(_ o: JSONObject?) -> String {
        ["address", "city", "county"].compactMap { o?[$0]?.string }.filter { !$0.isEmpty }.joined(separator: ", ")
    }

    /// Seller, buyer and car frozen on the invoice when it is issued.
    static func snapshot(settings: JSONObject, customer: JSONObject?, vehicle: JSONObject?, mileage: JSONValue?) -> JSONValue {
        let shop = settings["shop"]?.object ?? [:]
        let s = { (k: String) in shop[k]?.string ?? "" }
        let seller: JSONObject = [
            "name": .string(s("legalName").isEmpty ? s("name") : s("legalName")), "brand": .string(s("name")),
            "cui": .string(s("cui")), "regCom": .string(s("regCom")), "address": .string(joinAddress(shop)),
            "phone": .string(s("phone")), "email": .string(s("email")), "iban": .string(s("iban")), "bank": .string(s("bank")),
            "logo": shop["logo"] ?? .null, "vatPayer": settings["invoicing"]?["vatPayer"] ?? .bool(true),
        ]
        var buyer = JSONValue.null
        if let c = customer {
            buyer = .object([
                "type": c["type"] ?? .null, "name": c["name"] ?? .null,
                "cui": c["cui"] ?? .string(""), "regCom": c["regCom"] ?? .string(""), "address": .string(joinAddress(c)),
                "phone": c["phone"] ?? .string(""), "email": c["email"] ?? .string(""),
            ])
        }
        var car = JSONValue.null
        if let v = vehicle {
            car = .object(["plate": v["plate"] ?? .null, "make": v["make"] ?? .null, "model": v["model"] ?? .null,
                           "vin": v["vin"] ?? .string(""), "mileage": mileage ?? .null])
        }
        return .object(["seller": .object(seller), "buyer": buyer, "vehicle": car])
    }

    struct Problem: Hashable { let code: String; let text: String }

    /// What blocks a draft from getting a number (issueChecklist).
    static func checklist(_ draft: Invoice, customer: Customer?) -> [Problem] {
        var items: [Problem] = []
        if customer == nil { items.append(.init(code: "customer", text: "Alege clientul facturii.")) }
        if let c = customer, c.isCompany, c.cui.isEmpty { items.append(.init(code: "cui", text: "Clientul persoană juridică nu are CUI.")) }
        if draft.lines.isEmpty { items.append(.init(code: "lines", text: "Adaugă cel puțin o linie.")) }
        for line in draft.lines {
            if let first = Lines.issues(line).first {
                items.append(.init(code: "line", text: "Linia „\(line.description.isEmpty ? "fără descriere" : line.description)”: \(first)"))
                break
            }
        }
        if (draft.issueDate ?? "").isEmpty { items.append(.init(code: "issue_date", text: "Alege data emiterii.")) }
        if let due = draft.dueDate, let issue = draft.issueDate, !due.isEmpty, !issue.isEmpty, due < issue {
            items.append(.init(code: "due_date", text: "Scadența nu poate fi înainte de data emiterii."))
        }
        return items
    }

    /// The issued invoice: number, VAT rates fixed, totals, snapshot. Throws what blocks it.
    static func issue(_ draft: Invoice, settings: JSONObject, customer: Customer?, customerJSON: JSONObject?, vehicleJSON: JSONObject?,
                      number: Int, now: String) throws -> Invoice {
        if let first = checklist(draft, customer: customer).first { throw DomainError(code: "cannot_issue", message: first.text) }
        let vatPayer = ShopSettings(settings).vatPayer
        var out = draft
        out.lines = draft.lines.map { var l = $0; l.vatRate = vatPayer ? l.vatRate : 0; return l }
        let totals = Lines.totals(out.lines, vatPayer: vatPayer)
        if totals.gross <= 0 { throw DomainError(code: "cannot_issue", message: "Totalul facturii trebuie să fie pozitiv.") }
        out.status = "issued"
        if out.series.isEmpty { out.series = settings["invoicing"]?["series"]?.string ?? "" }
        out.number = number
        out.totals = totals
        out.snapshot = snapshot(settings: settings, customer: customerJSON, vehicle: vehicleJSON, mileage: draft.mileage.map { .number(Double($0)) })
        out.issuedAt = now
        out.activity.append(.object(["at": .string(now), "type": .string("issued")]))
        return out
    }

    /// The credit note: the original's lines with negative quantities; the pair nets to zero.
    static func storno(_ original: Invoice, number: Int, today: String, now: String) throws -> Invoice {
        if original.status == "draft" { throw DomainError(code: "cannot_storno", message: "Ciornele se șterg, nu se stornează.") }
        if original.status == "cancelled" { throw DomainError(code: "cannot_storno", message: "Factura este deja stornată.") }
        if original.stornoOf != nil { throw DomainError(code: "cannot_storno", message: "O factură de stornare nu poate fi stornată.") }
        let lines = original.lines.map { var l = $0; l.id = Ids.uid(); l.qty = -l.qty; return l }
        let vatPayer = original.snapshot?["seller"]?["vatPayer"] != .bool(false)
        let label = formatNumber(series: original.series, number: original.number)
        var out = Invoice(id: Ids.uid(), status: "issued", series: original.series, number: number, issueDate: today, dueDate: today,
                          customerId: original.customerId, vehicleId: original.vehicleId, workOrderId: nil, lines: lines,
                          notes: "Stornare integrală a facturii \(label) din \(original.issueDate ?? "").", createdAt: now,
                          stornoId: nil, stornoOf: original.id)
        out.mileage = original.mileage
        out.totals = Lines.totals(lines, vatPayer: vatPayer)
        out.snapshot = original.snapshot
        out.issuedAt = now
        out.activity = [.object(["at": .string(now), "type": .string("issued")])]
        return out
    }

    /// A user-facing problem, or nil when the payment can be recorded.
    static func paymentProblem(_ amount: Int, invoice: Invoice, payments: [Payment], currency: String = "RON") -> String? {
        if invoice.status != "issued" || invoice.stornoOf != nil { return "Pe această factură nu se pot înregistra plăți." }
        if amount <= 0 { return "Introdu o sumă mai mare ca zero." }
        let rest = balance(invoice, payments)
        if rest <= 0 { return "Factura este deja achitată integral." }
        if amount > rest { return "Suma depășește restul de plată (\(Money.format(rest, currency: currency)))." }
        return nil
    }

    /// Reminder / share text for an invoice (invoiceMessage).
    static func message(_ invoice: Invoice, balance: Int, settings: JSONObject) -> String {
        let shop = settings["shop"]?.object ?? [:]
        let currency = settings["currency"]?.string ?? "RON"
        let gross = invoice.totals?.gross ?? 0
        let iban = shop["iban"]?.string ?? ""
        let bank = shop["bank"]?.string ?? ""
        let pay = iban.isEmpty ? "" : "Plată prin transfer: \(iban)\(bank.isEmpty ? "" : " (\(bank))")."
        return [
            "Bună ziua!",
            "Vă transmitem factura \(formatNumber(series: invoice.series, number: invoice.number)) din \(invoice.issueDate ?? ""), în valoare de \(Money.format(gross, currency: currency)).",
            balance > 0 && balance < gross ? "Rest de plată: \(Money.format(balance, currency: currency))." : "",
            invoice.dueDate.map { "Scadență: \($0)." } ?? "",
            pay,
            "Mulțumim, \(shop["name"]?.string ?? "")",
        ].filter { !$0.isEmpty }.joined(separator: "\n")
    }

    // MARK: From a job

    /// The job's lines as they go on its invoice: new ids, the shop's VAT rate; refused lines never.
    static func linesFromOrder(_ order: WorkOrder, settings: ShopSettings) -> [Line] {
        order.lines.filter { !$0.refused }.map { var l = $0; l.id = Ids.uid(); l.vatRate = settings.vatPayer ? l.vatRate : 0; return l }
    }

    private static func lineKey(_ l: Line) -> String {
        [l.kind, l.refId ?? "", l.description, JS.number(l.qty), l.unit, String(l.unitPrice), JS.number(l.discountPct), JS.number(l.vatRate)].joined(separator: "|")
    }

    /// True when a draft no longer bills what its job would (the job changed after the draft was made).
    static func draftBehind(_ draft: Invoice, order: WorkOrder?, settings: ShopSettings) -> Bool {
        guard let order, draft.status == "draft" else { return false }
        return linesFromOrder(order, settings: settings).map(lineKey).sorted() != draft.lines.map(lineKey).sorted()
    }
}
