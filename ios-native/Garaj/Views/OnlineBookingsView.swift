import SwiftUI

/// Setări → Programări online: the link to the storefront and the requests on it.
struct OnlineBookingsView: View {
    @Environment(OnlineBookings.self) private var online
    @State private var address = ""
    @State private var password = ""
    @State private var isConnecting = false

    private var statusText: (String, Color) {
        switch online.link {
        case .off: ("Neconectat", .secondary)
        case .connecting: ("Se conectează…", .secondary)
        case .live: ("Conectat, în timp real", .green)
        case .needsPassword: ("Introdu parola service-ului", .orange)
        case .failed(let message): (message, .red)
        }
    }

    var body: some View {
        Form {
            Section {
                LabeledContent("Stare") {
                    Text(statusText.0).foregroundStyle(statusText.1).multilineTextAlignment(.trailing)
                }
                TextField("https://service.exemplu.ro", text: $address)
                    .keyboardType(.URL)
                    .textContentType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("Parola service-ului", text: $password)
                    .textContentType(.password)
                Button(isConnecting ? "Se conectează…" : "Conectează") {
                    isConnecting = true
                    Task {
                        await online.connect(to: address, password: password)
                        password = ""
                        isConnecting = false
                    }
                }
                .disabled(isConnecting || address.trimmingCharacters(in: .whitespaces).isEmpty)
            } header: {
                CapsHeader("Conexiune")
            } footer: {
                Text("Primești notificări cât timp aplicația este deschisă. Confirmarea se face din aplicația web.")
            }

            Section(header: CapsHeader("Cereri active")) {
                if online.items.isEmpty {
                    Text("Nicio cerere activă.").foregroundStyle(.secondary)
                }
                ForEach(online.items) { item in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(item.customer.isEmpty ? item.ref : item.customer).font(.headline)
                            Spacer()
                            Text(item.status == "requested" ? "De confirmat" : "Confirmată")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(item.status == "requested" ? .orange : .green)
                        }
                        Text(OnlineBookings.when(item.start)).font(.subheadline)
                        Text([item.plate, item.car].filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.subheadline).foregroundStyle(.secondary)
                        if !item.services.isEmpty {
                            Text(item.services.joined(separator: ", ")).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
        .navigationTitle("Programări online")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { address = online.serverURL }
    }
}
