import SwiftUI

/// The tabs of look 3 (docs/IOS-NATIVE.md §9): Azi, Atelier, Agendă, Registru, and the talon scanner on its own (§10).
struct RootView: View {
    @Environment(AppStore.self) private var store
    @State private var tab = UserDefaults.standard.string(forKey: "GarajTab") ?? "azi" // debug: `-GarajTab registru`
    /// Scanează is a tab that opens the scanner over the tab you were on, instead of switching to a page.
    @State private var scanning = false

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
            TabView(selection: Binding(get: { tab }, set: { if $0 == "scan" { scanning = true } else { tab = $0 } })) {
                Tab("Azi", systemImage: "house", value: "azi") {
                    HomeView(selectedTab: $tab).tint(Color("AccentColor"))
                }
                Tab("Atelier", systemImage: "wrench.and.screwdriver", value: "atelier") {
                    WorkOrdersView().tint(Color("AccentColor"))
                }
                Tab("Agendă", systemImage: "calendar", value: "agenda") {
                    AppointmentsView().tint(Color("AccentColor"))
                }
                Tab("Registru", systemImage: "square.grid.2x2", value: "registru") {
                    RegistryView().tint(Color("AccentColor"))
                }
                .badge(store.reminders().count)
                // The round button beside the tabs scans a talon (owner, 18 Nov 2026). It took search's place, since
                // the bar holds four tabs and one round button; searching stays at the top of Azi (the same results).
                Tab("Scanează", systemImage: "doc.viewfinder", value: "scan", role: .search) {
                    Color.clear // never shown: choosing the tab opens the scanner over the current tab
                }
            }
            // The selected tab in the bar reads white, in light and dark (owner); each screen keeps the orange accent.
            .tint(.white)
            .modifier(RunningJobAccessory())
            .fullScreenCover(isPresented: $scanning) { TalonScanFlow(startImage: debugScanImage) }
            #if DEBUG
            // Screenshots: `-GarajScan 1` opens the scanner; `-GarajScanImage <path>` starts it from that picture.
            .task {
                let d = UserDefaults.standard
                if d.string(forKey: "GarajScan") != nil || d.string(forKey: "GarajScanImage") != nil { scanning = true }
            }
            #endif
            .safeAreaInset(edge: .bottom) {
                UndoToastView().padding(.bottom, 64) // above the tab bar
            }
            .preferredColorScheme(colorScheme)
        }
    }

    private var debugScanImage: UIImage? {
        #if DEBUG
        UserDefaults.standard.string(forKey: "GarajScanImage").flatMap { UIImage(contentsOfFile: $0) }
        #else
        nil
        #endif
    }
}
