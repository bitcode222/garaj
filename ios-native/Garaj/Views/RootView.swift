import SwiftUI

/// The tabs of look 3 (docs/IOS-NATIVE.md §9): Azi, Atelier, Agendă, Registru, and search on its own.
struct RootView: View {
    @Environment(AppStore.self) private var store
    @State private var tab = UserDefaults.standard.string(forKey: "GarajTab") ?? "azi" // debug: `-GarajTab registru`

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
                Tab("Azi", systemImage: "house", value: "azi") {
                    HomeView(selectedTab: $tab)
                }
                Tab("Atelier", systemImage: "wrench.and.screwdriver", value: "atelier") {
                    WorkOrdersView()
                }
                Tab("Agendă", systemImage: "calendar", value: "agenda") {
                    AppointmentsView()
                }
                Tab("Registru", systemImage: "square.grid.2x2", value: "registru") {
                    RegistryView()
                }
                .badge(store.reminders().count)
                Tab(value: "cauta", role: .search) {
                    SearchView()
                }
            }
            .safeAreaInset(edge: .bottom) {
                UndoToastView().padding(.bottom, 64) // above the tab bar
            }
            .preferredColorScheme(colorScheme)
        }
    }
}
