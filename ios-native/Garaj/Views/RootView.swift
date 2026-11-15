import SwiftUI

/// The app's tabs, as on the web's phone tab bar (src/components/shell/nav.js TABS).
struct RootView: View {
    @Environment(AppStore.self) private var store
    /// Opens on Lucrări while Azi is not native yet (phase 3).
    @State private var tab = UserDefaults.standard.string(forKey: "GarajTab") ?? "lucrari" // debug: `-GarajTab facturi`

    var body: some View {
        switch store.phase {
        case .loading:
            ProgressView("Se încarcă datele…")
        case .failed(let message):
            ContentUnavailableView("Datele nu s-au putut încărca", systemImage: "exclamationmark.triangle", description: Text(message))
        case .ready:
            TabView(selection: $tab) {
                Tab("Azi", systemImage: "sun.max", value: "azi") {
                    ComingSoon(title: "Azi", phase: "etapa 3")
                }
                Tab("Programări", systemImage: "calendar", value: "programari") {
                    ComingSoon(title: "Programări", phase: "etapa 4")
                }
                Tab("Lucrări", systemImage: "wrench.and.screwdriver", value: "lucrari") {
                    WorkOrdersView()
                }
                Tab("Facturi", systemImage: "doc.text", value: "facturi") {
                    InvoicesView()
                }
                Tab("Mai mult", systemImage: "square.grid.2x2", value: "mai-mult") {
                    MoreView()
                }
            }
            .safeAreaInset(edge: .bottom) {
                UndoToastView().padding(.bottom, 64) // above the tab bar
            }
        }
    }
}

/// A screen that is not rebuilt natively yet (docs/IOS-NATIVE.md §5).
struct ComingSoon: View {
    let title: String
    let phase: String

    var body: some View {
        NavigationStack {
            ContentUnavailableView {
                Label("În lucru", systemImage: "hammer")
            } description: {
                Text("„\(title)” vine în aplicația nativă în \(phase). Până atunci, folosește versiunea web.")
            }
            .navigationTitle(title)
        }
    }
}
