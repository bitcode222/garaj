import Charts
import SwiftUI

/// Rapoarte (src/features/reports/reports-page.jsx): revenue by day or month, the period's numbers,
/// best-selling operations, mechanics, payments by method, what is left to collect. Values without VAT.
struct ReportsView: View {
    @Environment(AppStore.self) private var store
    @AppStorage("reports.period") private var period = "12m"

    var body: some View {
        let today = Dates.today()
        let invoices = store.all(Invoice.self)
        let payments = store.all(Payment.self)
        let range = Reports.periodRange(period, today: today)
        let rows = Reports.rows(invoices, period: period, today: today)
        let summary = Reports.summarize(invoices, from: range.from, to: range.to)
        let top = Reports.topServices(invoices, from: range.from, to: range.to, limit: 6)
        let people = Reports.staffProductivity(invoices, from: range.from, to: range.to)
        let mix = Reports.paymentMix(payments, from: range.from, to: range.to)
        let aging = Reports.receivablesAging(invoices, paymentsByInvoice: Dictionary(grouping: payments, by: \.invoiceId), today: today)
        let staff = Dictionary(store.all(Staff.self).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let currency = store.currency
        let money = { (v: Int) in Money.format(v, currency: currency, decimals: 0) }

        List {
            Section {
                Picker("Perioadă", selection: $period) {
                    ForEach(Reports.periods, id: \.key) { Text($0.label).tag($0.key) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            } footer: {
                Text("\(Self.date(range.from)) – \(Self.date(range.to)) · valori fără TVA")
            }

            Section {
                Grid(horizontalSpacing: 10, verticalSpacing: 10) {
                    GridRow {
                        StatTile(label: "Venituri", value: money(summary.net), detail: summary.count == 1 ? "1 factură" : "\(summary.count) facturi")
                        StatTile(label: "Bon mediu", value: money(summary.avgTicket), detail: "per factură")
                    }
                    GridRow {
                        StatTile(label: "Marjă pe piese", value: "\(Int(Money.jsRound(summary.partsMarginPct)))%", detail: "adaos \(money(summary.partsMargin))")
                        StatTile(label: "Manoperă facturată", value: Self.hours(Money.jsRound(summary.hours)), detail: money(summary.labor))
                    }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }

            Section {
                RevenueChart(rows: rows, daily: period == "month", currency: currency)
                NavigationLink {
                    RevenueTable(rows: rows, daily: period == "month", currency: currency)
                } label: {
                    Text(period == "month" ? "Pe zile, în tabel" : "Pe luni, în tabel")
                }
            } header: {
                CapsHeader(period == "month" ? "Venituri pe zile" : "Venituri pe luni")
            }

            Section {
                if top.isEmpty {
                    Text("Nicio operațiune facturată în perioadă.").foregroundStyle(.secondary)
                } else {
                    let max = top.map(\.revenue).max() ?? 1
                    ForEach(top, id: \.key) { t in
                        BarRow(label: t.name, hint: "\(t.count)×", value: money(t.revenue), share: Double(t.revenue) / Double(max), tint: .blue)
                    }
                }
            } header: { CapsHeader("Cele mai vândute operațiuni") } footer: { Text("După valoarea manoperei.") }

            Section {
                if people.isEmpty {
                    Text("Nicio manoperă alocată în perioadă.").foregroundStyle(.secondary)
                } else {
                    let max = people.map(\.hours).max() ?? 1
                    ForEach(people, id: \.staffId) { p in
                        let s = staff[p.staffId]
                        BarRow(label: s?.name ?? "—", hint: money(p.revenue), value: Self.hours(Money.jsRound(p.hours * 10) / 10),
                               share: max > 0 ? p.hours / max : 0, tint: Tone.color(s?.color ?? "gray"))
                    }
                }
            } header: { CapsHeader("Mecanici") } footer: { Text("Ore de manoperă facturate.") }

            Section(header: CapsHeader("Încasări pe metode")) {
                PaymentMixView(mix: mix, currency: currency)
            }

            Section {
                AgingRow(label: "În termen", color: .green, value: aging.current, currency: currency)
                AgingRow(label: "Restante 1–30 zile", color: .yellow, value: aging.d30, currency: currency)
                AgingRow(label: "Restante 31–60 zile", color: .orange, value: aging.d60, currency: currency)
                AgingRow(label: "Restante peste 60 zile", color: .red, value: aging.d90, currency: currency)
            } header: {
                CapsHeader("Creanțe la zi")
            } footer: {
                Text("Total de încasat: \(Money.format(aging.total, currency: currency)).")
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Rapoarte")
        .sensoryFeedback(.selection, trigger: period)
    }

    static func date(_ iso: String, _ style: Date.FormatStyle = .dateTime.day().month(.abbreviated).year()) -> String {
        Dates.parseDate(iso)?.formatted(style.locale(Locale(identifier: "ro_RO"))) ?? iso
    }

    static func hours(_ h: Double) -> String { "\(JS.number(h).replacingOccurrences(of: ".", with: ",")) h" }
}

/// Stacked columns, labor and parts (+ fees); touch and slide to read a day or month.
private struct RevenueChart: View {
    let rows: [Reports.Row]
    let daily: Bool
    let currency: String
    @State private var selected: String?

    private struct Bar: Identifiable {
        let id: String
        let key: String
        let series: String
        let value: Double
    }

    var body: some View {
        let bars = rows.flatMap { r in
            [Bar(id: r.month + "l", key: r.month, series: "Manoperă", value: Double(r.labor) / 100),
             Bar(id: r.month + "p", key: r.month, series: "Piese și materiale", value: Double(r.parts + r.fees) / 100)]
        }
        let picked = rows.first { $0.month == selected }
        VStack(alignment: .leading, spacing: 8) {
            Group {
                if let picked {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(label(picked.month, long: true)).font(.caption).foregroundStyle(.secondary)
                        Text(Money.format(picked.net, currency: currency)).font(.headline.monospacedDigit())
                        Text("manoperă \(Money.format(picked.labor, currency: currency, decimals: 0)) · piese \(Money.format(picked.parts + picked.fees, currency: currency, decimals: 0))")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                } else {
                    let total = rows.reduce(0) { $0 + $1.net }
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Total în perioadă").font(.caption).foregroundStyle(.secondary)
                        Text(Money.format(total, currency: currency)).font(.headline.monospacedDigit())
                        Text("Atinge graficul pentru o \(daily ? "zi" : "lună").").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .frame(height: 52, alignment: .topLeading)

            Chart(bars) { b in
                BarMark(x: .value(daily ? "Zi" : "Lună", b.key), y: .value("Lei", b.value))
                    .foregroundStyle(by: .value("Tip", b.series))
                    .opacity(selected == nil || selected == b.key ? 1 : 0.35)
                    .cornerRadius(2)
            }
            .chartForegroundStyleScale(["Manoperă": Color.accentColor, "Piese și materiale": Color.blue])
            .chartXSelection(value: $selected)
            .chartXAxis {
                AxisMarks(values: axisKeys) { value in
                    AxisValueLabel { if let k = value.as(String.self) { Text(label(k, long: false)) } }
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading) { value in
                    AxisGridLine()
                    AxisValueLabel { if let v = value.as(Double.self) { Text(Self.short(v)) } }
                }
            }
            .chartLegend(position: .bottom, alignment: .leading)
            .frame(height: 220)
            .accessibilityLabel("Venituri pe \(daily ? "zile" : "luni")")
        }
        .padding(.vertical, 6)
        .sensoryFeedback(.selection, trigger: selected)
    }

    /// Every label fits: all months for up to 12, otherwise every few.
    private var axisKeys: [String] {
        let step = daily ? 5 : rows.count > 12 ? 2 : 1
        return rows.enumerated().filter { daily ? ($0.offset + 1) % step == 1 || $0.offset == 0 : $0.offset % step == 0 }.map(\.element.month)
    }

    private func label(_ key: String, long: Bool) -> String {
        let ro = Locale(identifier: "ro_RO")
        if daily {
            guard let d = Dates.parseDate(key) else { return key }
            return long ? d.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(ro)).capitalizedFirst : d.formatted(.dateTime.day().locale(ro))
        }
        guard let d = Dates.parseDate("\(key)-01") else { return key }
        return long ? d.formatted(.dateTime.month(.wide).year().locale(ro)).capitalizedFirst : d.formatted(.dateTime.month(.narrow).locale(ro)).uppercased()
    }

    /// 12500 → "12,5k"
    static func short(_ v: Double) -> String {
        v >= 1000 ? "\(JS.number(Money.jsRound(v / 100) / 10).replacingOccurrences(of: ".", with: ","))k" : JS.number(Money.jsRound(v))
    }
}

private struct RevenueTable: View {
    @Environment(AppStore.self) private var store
    let rows: [Reports.Row]
    let daily: Bool
    let currency: String

    var body: some View {
        List {
            ForEach(rows.reversed(), id: \.month) { r in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(title(r.month)).font(.body.weight(.medium))
                        Spacer()
                        Text(Money.format(r.net, currency: currency)).font(.body.weight(.semibold).monospacedDigit())
                    }
                    HStack {
                        Text("Manoperă \(Money.format(r.labor, currency: currency))")
                        Spacer()
                        Text("Piese și mat. \(Money.format(r.parts + r.fees, currency: currency))")
                    }
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .navigationTitle(daily ? "Pe zile" : "Pe luni")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func title(_ key: String) -> String {
        let ro = Locale(identifier: "ro_RO")
        if daily { return ReportsView.date(key, .dateTime.weekday(.wide).day().month(.wide)).capitalizedFirst }
        return Dates.parseDate("\(key)-01")?.formatted(.dateTime.month(.wide).year().locale(ro)).capitalizedFirst ?? key
    }
}

private struct BarRow: View {
    let label: String
    let hint: String
    let value: String
    let share: Double
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(label).lineLimit(2)
                Spacer()
                Text(value).font(.subheadline.weight(.medium).monospacedDigit())
            }
            HStack(spacing: 8) {
                GeometryReader { g in
                    Capsule().fill(tint.gradient).frame(width: max(4, g.size.width * min(1, max(0, share))))
                }
                .frame(height: 6)
                Text(hint).font(.caption.monospacedDigit()).foregroundStyle(.secondary).fixedSize()
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}

private struct PaymentMixView: View {
    let mix: [String: Int]
    let currency: String

    var body: some View {
        let parts: [(key: String, label: String, color: Color)] = [("card", "Card", .accentColor), ("cash", "Numerar", .blue), ("transfer", "Transfer", .purple)]
        let labels = Dictionary(Labels.paymentMethods.map { ($0.key, $0.label) }, uniquingKeysWith: { a, _ in a })
        let total = parts.reduce(0) { $0 + (mix[$1.key] ?? 0) }
        if total <= 0 {
            Text("Nicio plată în perioadă.").foregroundStyle(.secondary)
        } else {
            HStack(spacing: 16) {
                Chart(parts, id: \.key) { p in
                    SectorMark(angle: .value("Suma", mix[p.key] ?? 0), innerRadius: .ratio(0.62), angularInset: 1.5)
                        .foregroundStyle(p.color)
                        .cornerRadius(3)
                }
                .frame(width: 96, height: 96)
                .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(parts, id: \.key) { p in
                        let v = mix[p.key] ?? 0
                        HStack {
                            Circle().fill(p.color).frame(width: 8, height: 8)
                            Text(labels[p.key] ?? p.label)
                            Spacer()
                            VStack(alignment: .trailing, spacing: 0) {
                                Text(Money.format(v, currency: currency, decimals: 0)).font(.subheadline.monospacedDigit())
                                Text("\(Int(Money.jsRound(Double(v) / Double(total) * 100)))%").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            .padding(.vertical, 4)
        }
    }
}

private struct AgingRow: View {
    let label: String
    let color: Color
    let value: Int
    let currency: String

    var body: some View {
        HStack {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(label)
            Spacer()
            Text(Money.format(value, currency: currency)).monospacedDigit().foregroundStyle(value > 0 ? .primary : .secondary)
        }
        .accessibilityElement(children: .combine)
    }
}

extension String {
    /// "luni, 3 noiembrie" → "Luni, 3 noiembrie"
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}
