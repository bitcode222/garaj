import SwiftUI
import UniformTypeIdentifiers

/// Registru: the collections (look 3, docs/IOS-NATIVE.md §9). Each keeps its area color.
struct RegistryView: View {
    @Environment(AppStore.self) private var store
    #if DEBUG
    @State private var debugPage: String?
    #endif

    var body: some View {
        let due = Agenda.invoicesToCollect(store.all(Invoice.self), paymentsByInvoice: Dictionary(grouping: store.all(Payment.self), by: \.invoiceId),
                                           today: Dates.today(), vatPayer: store.shop.vatPayer)
        NavigationStack {
            List {
                Section {
                    NavigationLink { InvoicesView(embedded: true) } label: {
                        IconRowLabel(title: "Facturi", symbol: "doc.text.fill", color: Area.facturi,
                                     value: due.due > 0 ? Money.format(due.due, currency: store.currency, decimals: 0) : nil)
                    }
                    NavigationLink { ReportsView() } label: { IconRowLabel(title: "Rapoarte", symbol: "chart.bar.fill", color: Area.rapoarte) }
                } header: {
                    SectionHeader("Bani", subtitle: due.due > 0 ? "De încasat, pe facturi emise" : nil)
                }
                Section {
                    NavigationLink { CustomersView() } label: { IconRowLabel(title: "Clienți", symbol: "person.2.fill", color: Area.clienti, value: store.count(.customers).formatted()) }
                    NavigationLink { VehiclesView() } label: { IconRowLabel(title: "Mașini", symbol: "car.fill", color: Area.masini, value: store.count(.vehicles).formatted()) }
                    NavigationLink { RemindersView() } label: { IconRowLabel(title: "De contactat", symbol: "bell.fill", color: Area.contact, value: store.reminders().count.formatted()) }
                } header: {
                    SectionHeader("Oameni și mașini")
                }
                Section {
                    NavigationLink { CatalogView() } label: { IconRowLabel(title: "Catalog", symbol: "shippingbox.fill", color: Area.catalog) }
                    NavigationLink { SettingsView() } label: { IconRowLabel(title: "Setări", symbol: "gearshape.fill", color: Area.setari) }
                } header: {
                    SectionHeader("Atelier")
                }
            }
            .groupedBackground()
            .navigationTitle("Registru")
            #if DEBUG
            // Screenshots: `-GarajMore clienti|masini`, `-GarajOpenVehicle <id>`, `-GarajOpenCustomer <id>`.
            .navigationDestination(isPresented: Binding(get: { debugPage != nil }, set: { if !$0 { debugPage = nil } })) {
                switch debugPage {
                case "facturi": InvoicesView(embedded: true)
                case "clienti": CustomersView()
                case "masini": VehiclesView()
                case "contactat": RemindersView()
                case "catalog": CatalogView()
                case "rapoarte": ReportsView()
                case "setari": SettingsView()
                case "vehicle": VehicleDetailView(id: UserDefaults.standard.string(forKey: "GarajOpenVehicle") ?? "")
                case "customer": CustomerDetailView(id: UserDefaults.standard.string(forKey: "GarajOpenCustomer") ?? "")
                default: EmptyView()
                }
            }
            .task {
                let d = UserDefaults.standard
                debugPage = d.string(forKey: "GarajOpenVehicle") != nil ? "vehicle" : d.string(forKey: "GarajOpenCustomer") != nil ? "customer" : d.string(forKey: "GarajMore")
            }
            #endif
        }
    }
}

/// Setări → Date și backup: what is stored, backup out, backup in.
struct DataView: View {
    @Environment(AppStore.self) private var store
    @State private var importing = false
    @State private var pending: Data?
    @State private var error: String?
    @State private var confirmLegacy = false
    @State private var notice: String?

    private let counts: [(Collection, String)] = [
        (.customers, "Clienți"), (.vehicles, "Mașini"), (.appointments, "Programări"),
        (.workOrders, "Lucrări"), (.invoices, "Facturi"), (.payments, "Plăți"),
    ]

    var body: some View {
        List {
            Section {
                ForEach(counts, id: \.0) { collection, label in
                    LabeledContent(label, value: store.count(collection).formatted())
                }
            } header: {
                CapsHeader("Pe acest iPhone")
            } footer: {
                Text(store.origin)
            }
            Section {
                ShareLink(item: BackupFile { try await MainActor.run { try store.exportBackup() } },
                          preview: SharePreview("Backup Garaj", image: Image(systemName: "externaldrive"))) {
                    Label("Exportă backup", systemImage: "square.and.arrow.up")
                }
                Button {
                    importing = true
                } label: {
                    Label("Importă backup", systemImage: "square.and.arrow.down")
                }
            } footer: {
                Text("Backup-ul are același format ca în versiunea web, deci datele se mută între telefon și calculator.")
            }
            Section {
                Button {
                    confirmLegacy = true
                } label: {
                    Label("Mută din nou datele din aplicația veche", systemImage: "arrow.triangle.2.circlepath")
                }
            } footer: {
                Text("Datele aplicației de dinainte rămân pe telefon. Folosește asta doar dacă la prima pornire nu s-au mutat toate.")
            }
        }
        .groupedBackground()
        .confirmationDialog("Înlocuiești datele de acum cu cele din aplicația veche?", isPresented: $confirmLegacy, titleVisibility: .visible) {
            Button("Mută datele", role: .destructive) {
                Task {
                    do {
                        notice = try await store.moveLegacyDataAgain() ? "Datele au fost mutate." : "Nu s-au găsit date în aplicația veche."
                    } catch { self.error = error.localizedDescription }
                }
            }
        }
        .alert(notice ?? "", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            Button("OK", role: .cancel) {}
        }
        .navigationTitle("Date și backup")
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
            do {
                let url = try result.get()
                let access = url.startAccessingSecurityScopedResource()
                defer { if access { url.stopAccessingSecurityScopedResource() } }
                let data = try Data(contentsOf: url)
                _ = try Backup.decode(data) // check before asking
                pending = data
            } catch {
                self.error = error.localizedDescription
            }
        }
        .confirmationDialog("Înlocuiești toate datele de pe acest iPhone cu cele din backup?",
                            isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } }),
                            titleVisibility: .visible) {
            Button("Înlocuiește datele", role: .destructive) {
                guard let data = pending else { return }
                Task {
                    do { try await store.replaceAll(with: data) } catch { self.error = error.localizedDescription }
                }
            }
        } message: {
            Text("Datele de acum se pierd. Exportă un backup înainte, dacă vrei să le păstrezi.")
        }
        .alert("Backup-ul nu a putut fi importat", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(error ?? "")
        }
    }
}

/// The backup as a file for the share sheet ("garaj-backup-2026-11-15.json").
struct BackupFile: Transferable {
    let make: @Sendable () async throws -> Data

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: .json) { file in
            let url = URL.temporaryDirectory.appending(path: "garaj-backup-\(Dates.today()).json")
            try await file.make().write(to: url, options: .atomic)
            return SentTransferredFile(url)
        }
    }
}
