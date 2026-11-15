import SwiftUI

/// The app's tabs, as on the web's phone tab bar (src/components/shell/nav.js TABS).
struct RootView: View {
    @Environment(AppStore.self) private var store
    @State private var tab = UserDefaults.standard.string(forKey: "GarajTab") ?? "azi" // debug: `-GarajTab facturi`

    /// Setări → Aspect (settings.appearance.theme).
    private var colorScheme: ColorScheme? {
        switch store.settings["appearance"]?["theme"]?.string {
        case "light": .light
        case "dark": .dark
        default: nil
        }
    }

    var body: some View {
        switch store.phase {
        case .loading:
            ProgressView("Se încarcă datele…")
        case .failed(let message):
            ContentUnavailableView("Datele nu s-au putut încărca", systemImage: "exclamationmark.triangle", description: Text(message))
        case .ready:
            TabView(selection: $tab) {
                Tab("Azi", systemImage: "sun.max", value: "azi") {
                    HomeView()
                }
                Tab("Programări", systemImage: "calendar", value: "programari") {
                    AppointmentsView()
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
                .badge(store.reminders().count)
            }
            .safeAreaInset(edge: .bottom) {
                UndoToastView().padding(.bottom, 64) // above the tab bar
            }
            .preferredColorScheme(colorScheme)
        }
    }
}
