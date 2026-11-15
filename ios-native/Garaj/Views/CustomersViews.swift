import SwiftUI

/// Clienți: everyone, searchable by name, phone, plate or CUI.
struct CustomersView: View {
    @Environment(AppStore.self) private var store
    @State private var query = ""
    @State private var creating: Customer?

    var body: some View {
        let vehiclesByOwner = Dictionary(grouping: store.all(Vehicle.self), by: { $0.customerId ?? "" })
        let visits = Dictionary(grouping: store.all(WorkOrder.self).filter { $0.status != "cancelled" }, by: { $0.customerId ?? "" }).mapValues(\.count)
        let overdue = overdueByCustomer
        let tokens = Search.tokens(query)
        let customers = store.all(Customer.self)
            .filter { c in
                tokens.isEmpty || Search.matches(Search.fold(([c.name, c.phone, c.phone.filter(\.isNumber), c.cui, c.email, c.contactName]
                    + (vehiclesByOwner[c.id] ?? []).flatMap { [$0.plate, People.normalizePlate($0.plate), $0.title] }).joined(separator: " ")), tokens)
            }
            .sorted { $0.name.compare($1.name, locale: Locale(identifier: "ro")) == .orderedAscending }
        List(customers) { c in
            NavigationLink { CustomerDetailView(id: c.id) } label: {
                let cars = vehiclesByOwner[c.id] ?? []
                HStack(spacing: 12) {
                    Avatar(text: People.initials(c.name), company: c.isCompany, tint: Avatar.tint(for: c.id))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(c.name).lineLimit(1)
                        Text([c.isCompany && !c.cui.isEmpty ? "CUI \(c.cui)" : People.formatPhone(c.phone),
                              cars.count == 1 ? cars[0].title.nonEmpty ?? People.formatPlate(cars[0].plate) : cars.count > 1 ? "\(cars.count) mașini" : ""]
                            .filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer(minLength: 4)
                    if let debt = overdue[c.id], debt > 0 {
                        VStack(alignment: .trailing, spacing: 1) {
                            Text(Money.format(debt, currency: store.currency, decimals: 0)).font(.body.weight(.semibold)).monospacedDigit().foregroundStyle(.red)
                            Text("restanță").font(.caption).foregroundStyle(.secondary)
                        }
                    } else {
                        let n = visits[c.id] ?? 0
                        Text(n == 1 ? "1 vizită" : "\(n) vizite").foregroundStyle(.secondary).monospacedDigit()
                    }
                }
            }
        }
        .overlay { if customers.isEmpty { query.isEmpty ? AnyView(ContentUnavailableView("Niciun client", systemImage: "person.2")) : AnyView(ContentUnavailableView.search(text: query)) } }
        .band(200)
        .navigationTitle("Clienți")
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Nume, telefon, număr, CUI")
        .toolbar { Button { creating = store.newCustomer() } label: { Label("Client nou", systemImage: "plus") } }
        .sheet(item: $creating) { CustomerForm(customer: $0, isNew: true) }
    }

    /// What each client owes on invoices past their due date.
    private var overdueByCustomer: [String: Int] {
        let today = Dates.today()
        let pays = Dictionary(grouping: store.all(Payment.self), by: \.invoiceId)
        var out: [String: Int] = [:]
        for inv in store.all(Invoice.self) where InvoiceRules.state(inv, payments: pays[inv.id] ?? [], today: today) == "overdue" {
            out[inv.customerId ?? "", default: 0] += InvoiceRules.balance(inv, pays[inv.id] ?? [])
        }
        return out
    }
}

/// Initials on a tinted circle (a square for a company), in a color that stays the same per client.
struct Avatar: View {
    let text: String
    var company = false
    var tint: Color = .accentColor
    var body: some View {
        Text(text)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(tint)
            .frame(width: 38, height: 38)
            .background(tint.opacity(0.15), in: company ? AnyShape(.rect(cornerRadius: 10)) : AnyShape(.circle))
            .accessibilityHidden(true)
    }

    static func tint(for id: String) -> Color {
        let palette: [Color] = [.blue, .purple, .orange, .green, .pink, .teal, .indigo, .brown]
        return palette[Int(id.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0x7fffffff }) % palette.count]
    }
}

struct CustomerDetailView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let id: String
    @State private var editing: Customer?
    @State private var addingCar: Vehicle?
    @State private var confirmDelete = false
    @State private var error: String?

    var body: some View {
        if let c = store.get(Customer.self, id) { content(c) } else { ContentUnavailableView("Clientul nu mai există", systemImage: "person") }
    }

    private func content(_ c: Customer) -> some View {
        let vehicles = store.all(Vehicle.self).filter { $0.customerId == c.id }.sorted { $0.plate < $1.plate }
        let orders = store.all(WorkOrder.self).filter { $0.customerId == c.id }.sorted { $0.number > $1.number }
        let invoices = store.all(Invoice.self).filter { $0.customerId == c.id && $0.status != "draft" }
        let paidBy = Dictionary(grouping: store.all(Payment.self), by: \.invoiceId)
        let balance = invoices.filter { $0.status == "issued" && $0.stornoOf == nil }.reduce(0) { $0 + max(0, InvoiceRules.balance($1, paidBy[$1.id] ?? [])) }
        let facts = People.facts(c.id, appointments: store.all(Appointment.self), orders: store.all(WorkOrder.self))
        let currency = store.currency
        return List {
            Section {
                HStack(spacing: 14) {
                    Avatar(text: People.initials(c.name), company: c.isCompany).scaleEffect(1.3).frame(width: 52, height: 52)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.name).font(.title3.weight(.semibold))
                        Text(c.isCompany ? "Persoană juridică\(c.cui.isEmpty ? "" : " · CUI \(c.cui)")" : "Persoană fizică").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                if !c.phone.isEmpty {
                    HStack(spacing: 8) {
                        if let u = People.telURL(c.phone) { Link(destination: u) { Label("Sună", systemImage: "phone.fill").frame(maxWidth: .infinity) } }
                        if let u = People.smsURL(c.phone, body: "") { Link(destination: u) { Label("SMS", systemImage: "message.fill").frame(maxWidth: .infinity) } }
                        if let u = People.whatsappURL(c.phone, text: "") { Link(destination: u) { Label("WhatsApp", systemImage: "text.bubble.fill").frame(maxWidth: .infinity) } }
                    }
                    .buttonStyle(.secondarySmall)
                    .labelStyle(VerticalLabelStyle())
                    .font(.caption.weight(.medium))
                }
            }
            Section {
                LabeledContent("Vizite", value: "\(facts.visits)")
                if let last = facts.lastVisit { LabeledContent("Ultima vizită", value: Dates.display(Dates.dayOfInstant(last))) }
                if facts.noShows > 0 { LabeledContent("Neprezentări") { Text("\(facts.noShows)").foregroundStyle(.red) } }
                LabeledContent("De încasat") { Text(Money.format(balance, currency: currency)).foregroundStyle(balance > 0 ? .orange : .secondary).monospacedDigit() }
            }
            Section(header: CapsHeader("Contact")) {
                if !c.phone.isEmpty { LabeledContent("Telefon", value: People.formatPhone(c.phone)) }
                if !c.email.isEmpty { LabeledContent("Email", value: c.email) }
                if c.isCompany && !c.contactName.isEmpty { LabeledContent("Persoană de contact", value: c.contactName) }
                let address = InvoiceRules.joinAddress(store.collections[.customers]?[c.id]?.object)
                if !address.isEmpty { LabeledContent("Adresă", value: address) }
                LabeledContent("Acord marketing", value: c.marketingConsent ? "Da" : "Nu")
            }
            Section {
                ForEach(vehicles) { v in
                    NavigationLink { VehicleDetailView(id: v.id) } label: { VehicleRow(vehicle: v) }
                }
                Button { addingCar = store.newVehicle(customerId: c.id) } label: { Label("Adaugă o mașină", systemImage: "plus.circle.fill") }
            } header: { CapsHeader("Mașini") }
            if !orders.isEmpty {
                Section(header: CapsHeader("Lucrări")) {
                    ForEach(orders.prefix(20)) { o in
                        NavigationLink { WorkOrderDetailView(id: o.id) } label: {
                            LabeledContent {
                                Text(Labels.workOrder(o.status).label).foregroundStyle(Labels.workOrder(o.status).color)
                            } label: {
                                Text(verbatim: "#\(o.number) · \(store.get(Vehicle.self, o.vehicleId).map { People.formatPlate($0.plate) } ?? "")")
                                Text(o.complaint).lineLimit(1)
                            }
                        }
                    }
                }
            }
            if !c.notes.isEmpty { Section(header: CapsHeader("Note")) { Text(c.notes) } }
            Section { Button("Șterge clientul", role: .destructive) { confirmDelete = true } }
        }
        .listStyle(.insetGrouped)
        .band(200)
        .navigationTitle(c.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { Button("Editează") { editing = c } }
        .sheet(item: $editing) { CustomerForm(customer: $0, isNew: false) }
        .sheet(item: $addingCar) { VehicleForm(vehicle: $0, isNew: true) }
        .confirmationDialog("Ștergi clientul?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Șterge", role: .destructive) { do { try store.deleteCustomer(c.id); dismiss() } catch { self.error = error.localizedDescription } }
        } message: { Text("Se șterg și mașinile, programările și ciornele lui.") }
        .alert("Nu se poate", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK", role: .cancel) {} } message: { Text(error ?? "") }
    }
}

/// New or edited customer, with the checks as you type (CUI, email).
struct CustomerForm: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var customer: Customer
    let isNew: Bool
    var onSaved: ((Customer) -> Void)?
    @State private var error: String?

    var body: some View {
        let cuiBad = customer.isCompany && !customer.cui.isEmpty && !People.isValidCUI(customer.cui)
        let emailBad = !customer.email.isEmpty && !People.isValidEmail(customer.email)
        NavigationStack {
            Form {
                Section {
                    Picker("Tip", selection: $customer.type) {
                        Text("Persoană fizică").tag("person")
                        Text("Firmă").tag("company")
                    }
                    .pickerStyle(.segmented)
                    TextField(customer.isCompany ? "Denumire firmă" : "Nume și prenume", text: $customer.name)
                        .textContentType(customer.isCompany ? .organizationName : .name)
                    if customer.isCompany { TextField("Persoană de contact", text: $customer.contactName) }
                }
                Section {
                    TextField("Telefon", text: $customer.phone).keyboardType(.phonePad).textContentType(.telephoneNumber)
                    TextField("Email", text: $customer.email).keyboardType(.emailAddress).textContentType(.emailAddress).textInputAutocapitalization(.never)
                } footer: { if emailBad { Text("Emailul nu pare corect.").foregroundStyle(.orange) } }
                if customer.isCompany {
                    Section {
                        TextField("CUI", text: $customer.cui).textInputAutocapitalization(.characters)
                        TextField("Nr. Registrul Comerțului", text: $customer.regCom).textInputAutocapitalization(.characters)
                    } footer: { if cuiBad { Text("CUI-ul nu trece verificarea cifrei de control.").foregroundStyle(.orange) } }
                }
                Section(header: CapsHeader("Adresă")) {
                    TextField("Stradă, număr", text: $customer.address).textContentType(.fullStreetAddress)
                    TextField("Oraș", text: $customer.city).textContentType(.addressCity)
                    TextField("Județ", text: $customer.county).textContentType(.addressState)
                }
                Section {
                    Toggle("Acord pentru mesaje de marketing", isOn: $customer.marketingConsent)
                    TextField("Note", text: $customer.notes, axis: .vertical)
                }
            }
            .navigationTitle(isNew ? "Client nou" : "Client")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvează") {
                        do { let saved = try store.saveCustomer(customer); onSaved?(saved); dismiss() } catch { self.error = error.localizedDescription }
                    }
                    .disabled(customer.name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .alert("Nu se poate", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK", role: .cancel) {} } message: { Text(error ?? "") }
        }
    }
}
