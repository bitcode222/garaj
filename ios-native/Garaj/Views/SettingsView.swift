import PhotosUI
import SwiftUI

/// Setări (src/features/settings/settings-page.jsx): the shop profile, invoicing, rates, reviews link,
/// opening hours, team, bays, appearance and data. Every change is saved at once.
struct SettingsView: View {
    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo
    @State private var editingStaff: Staff?
    @State private var editingBay: Bay?
    @State private var logoItem: PhotosPickerItem?
    @State private var nextNumber = ""
    @State private var error: String?

    private static let days: [(Int, String)] = [(1, "Lu"), (2, "Ma"), (3, "Mi"), (4, "Jo"), (5, "Vi"), (6, "Sâ"), (0, "Du")]

    var body: some View {
        let shop = store.shop
        let cui = store.setting(["shop", "cui"])?.string ?? ""
        let iban = store.setting(["shop", "iban"])?.string ?? ""
        let email = store.setting(["shop", "email"])?.string ?? ""
        let counter = store.nextInvoiceNumber(series: shop.series)
        let staff = store.all(Staff.self).sorted { $0.order < $1.order }
        let bays = store.all(Bay.self).sorted { $0.order < $1.order }

        Form {
            Section {
                HStack(spacing: 14) {
                    PhotosPicker(selection: $logoItem, matching: .images) {
                        Group {
                            if let image = Self.logoImage(store.setting(["shop", "logo"])?.string) {
                                Image(uiImage: image).resizable().scaledToFit()
                            } else {
                                Image(systemName: "photo.badge.plus").font(.title2).foregroundStyle(.secondary)
                            }
                        }
                        .frame(width: 60, height: 60)
                        .background(Color(.tertiarySystemFill), in: .rect(cornerRadius: 12))
                        .clipShape(.rect(cornerRadius: 12))
                    }
                    .accessibilityLabel("Alege logo")
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Logo")
                        Text("Apare în colțul facturii.").font(.caption).foregroundStyle(.secondary)
                        if store.setting(["shop", "logo"])?.string != nil {
                            Button("Elimină", role: .destructive) { store.setSetting(["shop", "logo"], .null) }
                                .font(.caption).buttonStyle(.borderless)
                        }
                    }
                }
                field("Nume comercial", ["shop", "name"], fallback: "Garajul meu")
                field("Denumire firmă", ["shop", "legalName"], prompt: "Service Exemplu SRL")
                field("CUI", ["shop", "cui"], caps: .characters, plain: true, warning: !cui.isEmpty && !People.isValidCUI(cui) ? "Nu trece verificarea cifrei de control." : nil)
                field("Nr. Reg. Comerțului", ["shop", "regCom"], caps: .characters, plain: true)
                field("Adresă", ["shop", "address"])
                field("Localitate", ["shop", "city"])
                field("Județ / sector", ["shop", "county"])
                field("Telefon", ["shop", "phone"], keyboard: .phonePad, plain: true)
                field("Email", ["shop", "email"], keyboard: .emailAddress, caps: .never, plain: true, warning: !email.isEmpty && !People.isValidEmail(email) ? "Adresa nu pare corectă." : nil)
                field("IBAN", ["shop", "iban"], caps: .characters, plain: true, warning: !iban.isEmpty && !People.isValidIBAN(iban) ? "IBAN-ul nu trece verificarea." : nil)
                field("Banca", ["shop", "bank"])
            } header: { CapsHeader("Service") } footer: { Text("Apare pe facturi, devize și mesaje.") }

            Section {
                LabeledContent("Serie facturi") {
                    TextField("GRJ", text: Binding(get: { shop.series }, set: { v in
                        store.setSetting(["invoicing", "series"], .string(String(v.uppercased().filter { !$0.isWhitespace }.prefix(8))))
                    }))
                    .multilineTextAlignment(.trailing).textInputAutocapitalization(.characters).autocorrectionDisabled().fontDesign(.monospaced)
                }
                LabeledContent("Următorul număr") {
                    HStack {
                        TextField(String(counter), text: $nextNumber).keyboardType(.numberPad).multilineTextAlignment(.trailing)
                        if let n = Int(nextNumber), n != counter {
                            Button("Aplică") {
                                do {
                                    try store.setNextInvoiceNumber(series: shop.series, next: n)
                                    nextNumber = ""
                                    undo.show("Următoarea factură: \(InvoiceRules.formatNumber(series: shop.series, number: n))")
                                } catch { self.error = error.localizedDescription }
                            }
                            .buttonStyle(.borderless).fontWeight(.semibold)
                        }
                    }
                }
                Toggle(isOn: Binding(get: { shop.vatPayer }, set: { store.setSetting(["invoicing", "vatPayer"], .bool($0)) })) {
                    Text("Plătitor de TVA")
                    Text("Dezactivat: facturile au mențiunea „Neplătitor de TVA”.")
                }
                if shop.vatPayer {
                    NumberField(label: "Cota TVA standard", suffix: "%", value: shop.vatRate, decimals: 2) { store.setSetting(["invoicing", "vatRate"], .number($0)) }
                }
                Stepper(value: Binding(get: { shop.dueDays }, set: { store.setSetting(["invoicing", "dueDays"], .number(Double($0))) }), in: 0...365) {
                    LabeledContent("Termen de plată", value: shop.dueDays == 1 ? "1 zi" : "\(shop.dueDays) zile")
                }
                TextField("Mențiuni implicite (ex. Garanție manoperă 3 luni.)", text: text(["invoicing", "notes"]), axis: .vertical).lineLimit(2...5)
            } header: { CapsHeader("Facturare") } footer: { Text("Numărul merge numai în sus: numerele nu se refolosesc.") }

            Section(header: CapsHeader("Tarife")) {
                MoneyField(label: "Manoperă pe oră, fără TVA", value: shop.laborRate, currency: store.currency) { store.setSetting(["laborRate"], .number(Double($0))) }
                NumberField(label: "Adaos piese", suffix: "%", value: store.setting(["partsMarkup"])?.number ?? 35, decimals: 1) { store.setSetting(["partsMarkup"], .number($0)) }
            }

            Section {
                TextField("https://g.page/r/…", text: Binding(get: { store.setting(["reviews", "link"])?.string ?? "" }, set: { store.setSetting(["reviews", "link"], .string($0.trimmingCharacters(in: .whitespaces))) }))
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            } header: { CapsHeader("Linkul pentru recenzii") } footer: { Text("Ex. pagina service-ului pe Google. Apare în mesajul trimis clientului la finalul vizitei.") }

            Section {
                DatePicker("Deschidere", selection: time(["hours", "open"], fallback: "08:00"), displayedComponents: .hourAndMinute)
                DatePicker("Închidere", selection: time(["hours", "close"], fallback: "18:00"), displayedComponents: .hourAndMinute)
                let on = Set((store.setting(["hours", "days"])?.array ?? [1, 2, 3, 4, 5, 6].map { .number($0) }).compactMap { $0.number.map { Int($0) } })
                HStack(spacing: 6) {
                    ForEach(Self.days, id: \.0) { day, label in
                        let selected = on.contains(day)
                        Button {
                            let next = selected ? on.subtracting([day]) : on.union([day])
                            store.setSetting(["hours", "days"], .array(Self.days.map(\.0).filter(next.contains).map { .number(Double($0)) }))
                        } label: {
                            Text(label).font(.subheadline.weight(.medium)).frame(maxWidth: .infinity, minHeight: 36)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(selected ? Color.white : Color.secondary)
                        .background(selected ? Color.accentColor : Color(.tertiarySystemFill), in: .rect(cornerRadius: 8))
                        .accessibilityAddTraits(selected ? .isSelected : [])
                    }
                }
                .sensoryFeedback(.selection, trigger: on)
            } header: { CapsHeader("Program") } footer: { Text("Calendarul arată aceste ore și zile.") }

            Section {
                ForEach(staff) { s in
                    Button { editingStaff = s } label: {
                        HStack(spacing: 12) {
                            Text(People.initials(s.name)).font(.caption.weight(.semibold)).foregroundStyle(.white)
                                .frame(width: 30, height: 30).background(Tone.color(s.color), in: .circle)
                            Text(s.name)
                            Spacer()
                            Text(Self.staffRoles.first { $0.key == s.role }?.label ?? s.role).foregroundStyle(.secondary)
                            if !s.active { Text("inactiv").font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    .tint(.primary)
                }
                .onMove { from, to in
                    var list = staff
                    list.move(fromOffsets: from, toOffset: to)
                    for (i, var member) in list.enumerated() where member.order != Double(i) { member.order = Double(i); store.save(member) }
                }
                Button { editingStaff = store.newStaff() } label: { Label("Adaugă membru", systemImage: "plus") }
            } header: { CapsHeader("Echipă") } footer: { Text("Mecanicii apar ca coloane în calendar, în ordinea de aici: ține apăsat și trage ca s-o schimbi.") }

            Section(header: CapsHeader("Posturi de lucru")) {
                ForEach(bays) { b in
                    Button { editingBay = b } label: {
                        HStack {
                            Text(b.name)
                            Spacer()
                            Text(Self.bayKinds.first { $0.key == b.kind }?.label ?? b.kind).foregroundStyle(.secondary)
                            if !b.active { Text("inactiv").font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    .tint(.primary)
                }
                .onMove { from, to in
                    var list = bays
                    list.move(fromOffsets: from, toOffset: to)
                    for (i, var bay) in list.enumerated() where bay.order != Double(i) { bay.order = Double(i); store.save(bay) }
                }
                Button { editingBay = store.newBay() } label: { Label("Adaugă post", systemImage: "plus") }
            }

            Section(header: CapsHeader("Aspect")) {
                Picker("Temă", selection: Binding(get: { store.setting(["appearance", "theme"])?.string ?? "system" }, set: { store.setSetting(["appearance", "theme"], .string($0)) })) {
                    Text("Automat").tag("system")
                    Text("Luminos").tag("light")
                    Text("Întunecat").tag("dark")
                }
                .pickerStyle(.segmented)
            }

            Section {
                NavigationLink { DataView() } label: { Label("Date și backup", systemImage: "externaldrive") }
            } footer: {
                Text("Totul stă pe acest iPhone, fără cont. Fă un backup săptămânal.\n\nGaraj \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "")")
            }
        }
        .band(180)
        .navigationTitle("Setări")
        .scrollDismissesKeyboard(.interactively)
        .sheet(item: $editingStaff) { StaffForm(staff: $0) }
        .sheet(item: $editingBay) { BayForm(bay: $0) }
        .onChange(of: logoItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let url = Self.logoDataURL(data) {
                    store.setSetting(["shop", "logo"], .string(url))
                } else {
                    error = "Format de imagine nesuportat."
                }
                logoItem = nil
            }
        }
        .alert("Nu se poate", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK", role: .cancel) {} } message: { Text(error ?? "") }
    }

    // MARK: Fields

    private func text(_ path: [String], fallback: String = "") -> Binding<String> {
        Binding(get: { store.setting(path)?.string ?? fallback }, set: { store.setSetting(path, .string($0)) })
    }

    @ViewBuilder
    private func field(_ label: String, _ path: [String], fallback: String = "", prompt: String? = nil, keyboard: UIKeyboardType = .default,
                       caps: TextInputAutocapitalization = .sentences, plain: Bool = false, warning: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            LabeledContent(label) {
                TextField(prompt ?? label, text: text(path, fallback: fallback))
                    .multilineTextAlignment(.trailing)
                    .keyboardType(keyboard)
                    .textInputAutocapitalization(caps)
                    .autocorrectionDisabled(plain)
            }
            if let warning { Label(warning, systemImage: "exclamationmark.triangle.fill").font(.caption).foregroundStyle(.orange) }
        }
    }

    /// "08:00" in the settings ↔ a Date for the time picker.
    private func time(_ path: [String], fallback: String) -> Binding<Date> {
        Binding(get: {
            let parts = (store.setting(path)?.string ?? fallback).split(separator: ":").compactMap { Int($0) }
            return Calendar.current.date(bySettingHour: parts.first ?? 8, minute: parts.count > 1 ? parts[1] : 0, second: 0, of: .now) ?? .now
        }, set: { d in
            let c = Calendar.current.dateComponents([.hour, .minute], from: d)
            store.setSetting(path, .string(String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)))
        })
    }

    // MARK: Logo (a ≤256 px PNG data URL in the settings, like the web)

    static func logoDataURL(_ data: Data) -> String? {
        guard let image = UIImage(data: data) else { return nil }
        let scale = min(1, 256 / max(image.size.width, image.size.height))
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let png = UIGraphicsImageRenderer(size: size, format: format).pngData { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        return "data:image/png;base64,\(png.base64EncodedString())"
    }

    static func logoImage(_ dataURL: String?) -> UIImage? {
        guard let dataURL, let comma = dataURL.firstIndex(of: ","), let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...])) else { return nil }
        return UIImage(data: data)
    }

    // src/lib/labels.js STAFF_ROLES, BAY_KINDS, CALENDAR_COLORS
    static let staffRoles: [(key: String, label: String)] = [("mechanic", "Mecanic"), ("electrician", "Electrician"), ("bodywork", "Tinichigiu"), ("painter", "Vopsitor"), ("advisor", "Consilier service")]
    static let bayKinds: [(key: String, label: String)] = [("lift", "Elevator"), ("alignment", "Geometrie"), ("diagnostics", "Diagnoză"), ("bodywork", "Caroserie"), ("other", "Alt post")]
    static let calendarColors = ["blue", "green", "red", "yellow", "purple", "orange"]
}

/// A decimal setting typed as text ("21" or "9,5"); saved while typing when it parses.
private struct NumberField: View {
    let label: String
    let suffix: String
    let value: Double
    let decimals: Int
    let commit: (Double) -> Void
    @State private var text = ""

    var body: some View {
        LabeledContent(label) {
            HStack(spacing: 4) {
                TextField("0", text: $text).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                Text(suffix).foregroundStyle(.secondary)
            }
        }
        .onAppear { text = JS.number(value).replacingOccurrences(of: ".", with: ",") }
        .onChange(of: text) { _, t in if let v = Money.parseQuantity(t, decimals: decimals), v >= 0 { commit(v) } }
    }
}

/// A money setting in bani, typed in lei.
private struct MoneyField: View {
    let label: String
    let value: Int
    let currency: String
    let commit: (Int) -> Void
    @State private var text = ""

    var body: some View {
        LabeledContent(label) {
            HStack(spacing: 4) {
                TextField("0,00", text: $text).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                Text(currency == "RON" ? "lei" : currency).foregroundStyle(.secondary)
            }
        }
        .onAppear { text = Money.toInput(value) }
        .onChange(of: text) { _, t in if let v = Money.parse(t), v >= 0 { commit(v) } }
    }
}

private struct StaffForm: View {
    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo
    @Environment(\.dismiss) private var dismiss
    @State var staff: Staff
    @State private var error: String?

    var body: some View {
        let existing = store.get(Staff.self, staff.id) != nil
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 12) {
                        Text(People.initials(staff.name.isEmpty ? "?" : staff.name)).font(.headline).foregroundStyle(.white)
                            .frame(width: 44, height: 44).background(Tone.color(staff.color), in: .circle)
                        TextField("Nume", text: $staff.name).textContentType(.name)
                    }
                    Picker("Rol", selection: $staff.role) {
                        ForEach(SettingsView.staffRoles, id: \.key) { Text($0.label).tag($0.key) }
                    }
                    TextField("Telefon", text: $staff.phone).keyboardType(.phonePad)
                }
                Section(header: CapsHeader("Culoare în calendar")) {
                    HStack {
                        ForEach(SettingsView.calendarColors, id: \.self) { c in
                            Button { staff.color = c } label: {
                                Circle().fill(Tone.color(c)).frame(width: 32, height: 32)
                                    .overlay { if staff.color == c { Image(systemName: "checkmark").font(.caption.weight(.bold)).foregroundStyle(.white) } }
                                    .frame(maxWidth: .infinity, minHeight: 44)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(c)
                            .accessibilityAddTraits(staff.color == c ? .isSelected : [])
                        }
                    }
                    .sensoryFeedback(.selection, trigger: staff.color)
                }
                Section {
                    Toggle("Activ", isOn: $staff.active)
                } footer: { Text("Activ: apare în calendar și la alocare.") }
                if existing {
                    Section {
                        Button("Șterge", role: .destructive) {
                            let before = store.get(Staff.self, staff.id)!
                            let result = store.removeTeamMember(.staff, staff.id)
                            undo.show(result == .deleted ? "Șters" : "Are istoric, așa că a fost dezactivat") { store.save(before) }
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(existing ? "Membru în echipă" : "Membru nou")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvează") {
                        do { try store.saveStaff(staff); dismiss() } catch { self.error = error.localizedDescription }
                    }
                    .disabled(staff.name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .alert("Nu se poate", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK", role: .cancel) {} } message: { Text(error ?? "") }
        }
    }
}

private struct BayForm: View {
    @Environment(AppStore.self) private var store
    @Environment(UndoCenter.self) private var undo
    @Environment(\.dismiss) private var dismiss
    @State var bay: Bay
    @State private var error: String?

    var body: some View {
        let existing = store.get(Bay.self, bay.id) != nil
        NavigationStack {
            Form {
                Section {
                    TextField("Nume (ex. Elevator 1)", text: $bay.name)
                    Picker("Tip", selection: $bay.kind) {
                        ForEach(SettingsView.bayKinds, id: \.key) { Text($0.label).tag($0.key) }
                    }
                    Toggle("Activ", isOn: $bay.active)
                }
                if existing {
                    Section {
                        Button("Șterge", role: .destructive) {
                            let before = store.get(Bay.self, bay.id)!
                            let result = store.removeTeamMember(.bays, bay.id)
                            undo.show(result == .deleted ? "Șters" : "Are istoric, așa că a fost dezactivat") { store.save(before) }
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(existing ? "Post de lucru" : "Post nou")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvează") {
                        do { try store.saveBay(bay); dismiss() } catch { self.error = error.localizedDescription }
                    }
                    .disabled(bay.name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .alert("Nu se poate", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK", role: .cancel) {} } message: { Text(error ?? "") }
        }
        .presentationDetents([.medium, .large])
    }
}
