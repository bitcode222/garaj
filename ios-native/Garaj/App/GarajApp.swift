import SwiftUI
import UserNotifications

@main
struct GarajApp: App {
    @State private var store = AppStore()
    @State private var undo = UndoCenter()
    @State private var online = OnlineBookings()
    @Environment(\.scenePhase) private var scenePhase

    init() {
        UNUserNotificationCenter.current().delegate = OnlineNotificationDelegate.shared
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .environment(undo)
                .environment(online)
                .environment(\.locale, Locale(identifier: "ro_RO"))
                .task {
                    await store.load()
                    online.start()
                }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { online.start() } else { online.stop() }
            if phase != .active { Task { await store.flush() } }
        }
    }
}
