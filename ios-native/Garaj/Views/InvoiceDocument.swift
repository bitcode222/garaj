import SwiftUI
import UIKit

/// The invoice as paper (src/features/invoices/invoice-document.jsx): always light, A4 width.
/// Shown on the invoice page and rendered to PDF for sharing and printing.
struct InvoicePaper: View {
    let invoice: Invoice
    let snapshot: JSONValue
    let totals: Totals
    let currency: String

    private var seller: JSONValue { snapshot["seller"] ?? .null }
    private var buyer: JSONValue? { snapshot["buyer"].flatMap { $0 == .null ? nil : $0 } }
    private var vehicle: JSONValue? { snapshot["vehicle"].flatMap { $0 == .null ? nil : $0 } }
    private var vatPayer: Bool { seller["vatPayer"] != .bool(false) }
    private var draft: Bool { invoice.status == "draft" }

    private func s(_ v: JSONValue?, _ key: String) -> String { v?[key]?.string ?? "" }
    private func money(_ v: Int) -> String { Money.format(v, currency: currency) }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            header
            Divider()
            HStack(alignment: .top, spacing: 24) {
                party("Furnizor", name: s(seller, "name"), lines: [
                    [s(seller, "cui").isEmpty ? "" : "CUI \(s(seller, "cui"))", s(seller, "regCom")].filter { !$0.isEmpty }.joined(separator: " · "),
                    s(seller, "address"),
                    [s(seller, "phone"), s(seller, "email")].filter { !$0.isEmpty }.joined(separator: " · "),
                    vatPayer ? "" : "Neplătitor de TVA",
                ])
                party("Client", name: s(buyer, "name"), lines: [
                    s(buyer, "type") == "company" ? [s(buyer, "cui").isEmpty ? "" : "CUI \(s(buyer, "cui"))", s(buyer, "regCom")].filter { !$0.isEmpty }.joined(separator: " · ") : "",
                    s(buyer, "address"),
                    s(buyer, "phone"),
                ])
            }
            if let vehicle {
                HStack(spacing: 12) {
                    Text(People.formatPlate(s(vehicle, "plate"))).font(.subheadline.weight(.bold))
                    Text([s(vehicle, "make"), s(vehicle, "model")].filter { !$0.isEmpty }.joined(separator: " ")).font(.subheadline.weight(.medium))
                    if !s(vehicle, "vin").isEmpty { Text("VIN \(s(vehicle, "vin"))").font(.caption.monospaced()).foregroundStyle(.secondary) }
                    if let km = vehicle["mileage"]?.number { Text("\(Int(km).formatted(.number.locale(Locale(identifier: "ro_RO")))) km").font(.caption).foregroundStyle(.secondary) }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.black.opacity(0.05), in: .rect(cornerRadius: 8))
            }
            linesTable
            footer
        }
        .padding(32)
        .frame(width: 595, alignment: .topLeading)
        .background(.white)
        .overlay {
            if draft {
                Text("CIORNĂ")
                    .font(.system(size: 110, weight: .black))
                    .tracking(18)
                    .foregroundStyle(.black.opacity(0.04))
                    .rotationEffect(.degrees(-18))
                    .allowsHitTesting(false)
            }
        }
        .environment(\.colorScheme, .light)
        .foregroundStyle(.black)
    }

    private var header: some View {
        HStack(alignment: .top) {
            HStack(spacing: 10) {
                Text(String((s(seller, "brand").isEmpty ? s(seller, "name") : s(seller, "brand")).prefix(1)))
                    .font(.title3.bold()).foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(.black, in: .rect(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 2) {
                    Text(s(seller, "brand").isEmpty ? s(seller, "name") : s(seller, "brand")).font(.headline)
                    if !s(seller, "brand").isEmpty && s(seller, "brand") != s(seller, "name") {
                        Text(s(seller, "name")).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(invoice.stornoOf != nil ? "Factură de stornare" : "Factură").font(.title2.weight(.semibold))
                Text(draft ? "Seria \(invoice.series) · nr. la emitere" : invoice.label).font(.system(.subheadline, design: .monospaced).weight(.medium))
                Grid(alignment: .trailing, horizontalSpacing: 12, verticalSpacing: 2) {
                    GridRow {
                        Text("Data emiterii").foregroundStyle(.secondary)
                        Text(Dates.display(invoice.issueDate))
                    }
                    if let due = invoice.dueDate {
                        GridRow {
                            Text("Scadență").foregroundStyle(.secondary)
                            Text(Dates.display(due))
                        }
                    }
                }
                .font(.caption)
                .padding(.top, 4)
            }
        }
    }

    private func party(_ label: String, name: String, lines: [String]) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label.uppercased()).font(.caption2.weight(.medium)).tracking(1).foregroundStyle(.secondary)
            Text(name.isEmpty ? "—" : name).font(.subheadline.weight(.semibold))
            ForEach(lines.filter { !$0.isEmpty }, id: \.self) { Text($0).font(.caption).foregroundStyle(.secondary) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var linesTable: some View {
        VStack(spacing: 0) {
            HStack {
                Text("NR.").frame(width: 24, alignment: .leading)
                Text("DENUMIRE").frame(maxWidth: .infinity, alignment: .leading)
                Text("CANT.").frame(width: 70, alignment: .trailing)
                Text("PREȚ UNITAR").frame(width: 90, alignment: .trailing)
                if vatPayer { Text("TVA").frame(width: 36, alignment: .trailing) }
                Text("VALOARE").frame(width: 90, alignment: .trailing)
            }
            .font(.caption2.weight(.medium))
            .foregroundStyle(.secondary)
            .padding(.vertical, 6)
            Divider()
            ForEach(Array(invoice.lines.enumerated()), id: \.element.id) { index, line in
                HStack(alignment: .firstTextBaseline) {
                    Text("\(index + 1)").foregroundStyle(.secondary).frame(width: 24, alignment: .leading)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(line.description.isEmpty ? "—" : line.description).fontWeight(.medium)
                        if line.discountPct > 0 { Text("Discount \(JS.number(line.discountPct))%").font(.caption2).foregroundStyle(.secondary) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Text("\(Money.formatQuantity(line.qty)) \(line.unit)").frame(width: 70, alignment: .trailing)
                    Text(money(line.unitPrice)).frame(width: 90, alignment: .trailing)
                    if vatPayer { Text("\(JS.number(line.vatRate))%").foregroundStyle(.secondary).frame(width: 36, alignment: .trailing) }
                    Text(money(Lines.net(line))).fontWeight(.medium).frame(width: 90, alignment: .trailing)
                }
                .font(.caption)
                .monospacedDigit()
                .padding(.vertical, 6)
                Divider()
            }
            if invoice.lines.isEmpty {
                Text("Nicio linie încă.").font(.caption).foregroundStyle(.secondary).padding(.vertical, 20)
            }
        }
    }

    private var footer: some View {
        HStack(alignment: .top, spacing: 24) {
            VStack(alignment: .leading, spacing: 8) {
                if totals.labor != 0 || totals.parts != 0 {
                    Text("Din care manoperă \(money(totals.labor)) · piese \(money(totals.parts))")
                }
                if !s(seller, "iban").isEmpty {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("PLATĂ PRIN TRANSFER").font(.caption2.weight(.medium)).tracking(1)
                        Text(s(seller, "iban")).font(.caption.monospaced()).foregroundStyle(.black)
                        if !s(seller, "bank").isEmpty { Text(s(seller, "bank")) }
                    }
                }
                if !invoice.notes.isEmpty { Text(invoice.notes).foregroundStyle(.black) }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(spacing: 4) {
                if vatPayer {
                    row("Total fără TVA", money(totals.net))
                    ForEach(totals.byRate, id: \.rate) { row("TVA \(JS.number($0.rate))%", money($0.vat)) }
                }
                Divider().padding(.vertical, 2)
                HStack(alignment: .firstTextBaseline) {
                    Text("Total de plată").font(.subheadline.weight(.semibold))
                    Spacer()
                    Text(money(totals.gross)).font(.title3.weight(.semibold)).monospacedDigit()
                }
            }
            .frame(width: 220)
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value).monospacedDigit()
        }
        .font(.caption)
    }
}

enum InvoicePDF {
    /// One A4-wide PDF page as tall as the invoice (at least A4).
    @MainActor
    static func render(_ paper: InvoicePaper, name: String) throws -> URL {
        let url = URL.temporaryDirectory.appending(path: "\(name).pdf")
        let renderer = ImageRenderer(content: paper)
        var failure: Error?
        renderer.render { size, draw in
            var box = CGRect(x: 0, y: 0, width: 595, height: max(842, size.height))
            guard let consumer = CGDataConsumer(url: url as CFURL), let pdf = CGContext(consumer: consumer, mediaBox: &box, nil) else {
                failure = DomainError(code: "pdf", message: "PDF-ul nu a putut fi creat.")
                return
            }
            pdf.beginPDFPage(nil)
            pdf.setFillColor(UIColor.white.cgColor)
            pdf.fill(box)
            pdf.translateBy(x: 0, y: box.height - size.height) // top of the page
            draw(pdf)
            pdf.endPDFPage()
            pdf.closePDF()
        }
        if let failure { throw failure }
        return url
    }
}

/// The PDF as a file for the share sheet ("Factura GRJ 0815.pdf").
struct InvoicePDFFile: Transferable {
    let make: @Sendable () async throws -> URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: .pdf) { file in SentTransferredFile(try await file.make()) }
    }
}

extension Dates {
    /// "2026-11-15" → "15.11.2026", as on Romanian documents.
    static func display(_ iso: String?) -> String {
        guard let iso, iso.count == 10 else { return "—" }
        let p = iso.split(separator: "-")
        return p.count == 3 ? "\(p[2]).\(p[1]).\(p[0])" : iso
    }
}
