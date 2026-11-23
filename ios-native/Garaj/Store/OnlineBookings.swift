import Foundation
import Observation
import UserNotifications

/// Shows banners while the app is on screen too.
final class OnlineNotificationDelegate: NSObject, UNUserNotificationCenterDelegate, Sendable {
    static let shared = OnlineNotificationDelegate()

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list, .sound])
    }
}

/// Follows the storefront (docs/STOREFRONT.md) while the app is open: a socket says "look again", the feed says what
/// changed. It only reads, so it never takes a booking away from the shop's web app, which remains the one that imports them.
@MainActor @Observable
final class OnlineBookings {
    struct Item: Codable, Identifiable, Equatable, Sendable {
        let id: String
        let ref: String
        let status: String
        let start: String
        let version: Int
        let updatedAt: String
        let plate: String
        let car: String
        let customer: String
        let services: [String]
    }

    enum Link: Equatable {
        case off, connecting, live, needsPassword
        case failed(String)
    }

    private struct Feed: Decodable, Sendable {
        let changed: [Item]
        let open: [Item]
        let cursor: String
    }

    private enum LinkError: Error { case signedOut, server }

    private static let urlKey = "GarajServerURL"
    private static let cursorKey = "GarajOnlineCursor"
    private static let seenKey = "GarajOnlineSeen"

    private(set) var items: [Item] = []
    private(set) var link: Link = .off
    private(set) var serverURL = UserDefaults.standard.string(forKey: OnlineBookings.urlKey) ?? ""

    private let session = URLSession(configuration: .default)
    private var loop: Task<Void, Never>?
    private var socket: URLSessionWebSocketTask?
    private var askedForAlerts = false

    var waitingCount: Int { items.filter { $0.status == "requested" }.count }

    private var base: URL? {
        let text = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: text), ["http", "https"].contains(url.scheme ?? ""), url.host != nil else { return nil }
        return url
    }

    func start() {
        guard loop == nil, base != nil else { return }
        link = .connecting
        loop = Task { [weak self] in await self?.run() }
    }

    func stop() {
        loop?.cancel()
        loop = nil
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
    }

    func connect(to address: String, password: String) async {
        stop()
        let clean = address.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if clean != serverURL {
            serverURL = clean
            items = []
            UserDefaults.standard.set(clean, forKey: Self.urlKey)
            UserDefaults.standard.removeObject(forKey: Self.cursorKey)
            UserDefaults.standard.removeObject(forKey: Self.seenKey)
        }
        guard base != nil else {
            link = clean.isEmpty ? .off : .failed("Adresa nu este corectă.")
            return
        }
        if !password.isEmpty, !(await signIn(password)) {
            link = .failed("Nu m-am putut conecta. Verifică parola.")
            return
        }
        start()
    }

    private func signIn(_ password: String) async -> Bool {
        guard let base else { return false }
        var request = URLRequest(url: base.appending(path: "shop-login"))
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        let encoded = password.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
        request.httpBody = Data("password=\(encoded)&next=%2F".utf8)
        guard let (_, response) = try? await session.data(for: request), let http = response as? HTTPURLResponse else { return false }
        return http.statusCode < 400
    }

    private func run() async {
        var delay: UInt64 = 1
        while !Task.isCancelled {
            do {
                try await listen { delay = 1 }
            } catch LinkError.signedOut {
                link = .needsPassword
                loop = nil
                return
            } catch {
                if Task.isCancelled { return }
                link = .failed("Serverul nu răspunde. Reîncerc…")
            }
            try? await Task.sleep(for: .seconds(delay))
            delay = min(delay * 2, 30)
        }
    }

    private func listen(onLive: () -> Void) async throws {
        guard let base else { throw LinkError.server }
        var parts = URLComponents(url: base.appending(path: "api/shop/live"), resolvingAgainstBaseURL: false)
        parts?.scheme = base.scheme == "https" ? "wss" : "ws"
        guard let address = parts?.url else { throw LinkError.server }
        try await refresh() // tells a signed-out shop apart from a dead socket
        var request = URLRequest(url: address)
        request.setValue(base.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")), forHTTPHeaderField: "Origin")
        for (name, value) in HTTPCookie.requestHeaderFields(with: HTTPCookieStorage.shared.cookies(for: base) ?? []) {
            request.setValue(value, forHTTPHeaderField: name)
        }
        let task = session.webSocketTask(with: request)
        socket = task
        task.resume()
        let keepAlive = Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(25))
                try? await task.send(.string("ping"))
            }
        }
        defer {
            keepAlive.cancel()
            task.cancel(with: .goingAway, reason: nil)
        }
        try await task.send(.string("ping"))
        try await refresh() // whatever happened before the socket opened
        link = .live
        onLive()
        await askForAlerts()
        while !Task.isCancelled {
            let message = try await task.receive()
            if case .string("pong") = message { continue }
            try await refresh()
        }
    }

    private func refresh() async throws {
        guard let base else { throw LinkError.server }
        let cursor = UserDefaults.standard.string(forKey: Self.cursorKey)
        var parts = URLComponents(url: base.appending(path: "api/shop/feed"), resolvingAgainstBaseURL: false)
        if let cursor { parts?.queryItems = [URLQueryItem(name: "since", value: cursor)] }
        guard let url = parts?.url else { throw LinkError.server }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw LinkError.server }
        if http.statusCode == 401 { throw LinkError.signedOut }
        guard http.statusCode == 200 else { throw LinkError.server }
        let feed = try JSONDecoder().decode(Feed.self, from: data)
        items = feed.open

        // The cursor is inclusive so two changes in the same millisecond are never lost; `seen` stops a repeat.
        let seen = Set(UserDefaults.standard.stringArray(forKey: Self.seenKey) ?? [])
        if cursor != nil {
            for item in feed.changed where !seen.contains(Self.key(item)) { notify(item) }
        }
        UserDefaults.standard.set(feed.cursor, forKey: Self.cursorKey)
        UserDefaults.standard.set(feed.changed.filter { $0.updatedAt == feed.cursor }.map(Self.key), forKey: Self.seenKey)
    }

    private static func key(_ item: Item) -> String { "\(item.id):\(item.version)" }

    private func askForAlerts() async {
        guard !askedForAlerts else { return }
        askedForAlerts = true
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
    }

    private func notify(_ item: Item) {
        let content = UNMutableNotificationContent()
        switch (item.status, item.version) {
        case ("requested", 1): content.title = "Programare online nouă"
        case ("cancelled", _): content.title = "Clientul a anulat programarea"
        default: return
        }
        let who = [item.customer, item.plate].filter { !$0.isEmpty }.joined(separator: " · ")
        content.body = [who, Self.when(item.start)].filter { !$0.isEmpty }.joined(separator: "\n")
        content.sound = .default
        let request = UNNotificationRequest(identifier: Self.key(item), content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    static func when(_ iso: String) -> String {
        guard let date = try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(iso) else { return "" }
        let style = Date.FormatStyle(locale: Locale(identifier: "ro_RO"), timeZone: TimeZone(identifier: "Europe/Bucharest") ?? .current)
            .weekday(.wide).day().month(.wide).hour().minute()
        return date.formatted(style)
    }
}
