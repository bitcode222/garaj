import SwiftUI

@main
struct GarajApp: App {
    @State private var store = AppStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .environment(\.locale, Locale(identifier: "ro_RO"))
                .task { await store.load() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { Task { await store.flush() } }
        }
    }
}
