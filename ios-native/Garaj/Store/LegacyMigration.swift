import Foundation
import WebKit

/// One-time move of the data from the previous (Capacitor / web view) app.
///
/// That app stored everything in IndexedDB "garaj" on the origin `capacitor://localhost`,
/// inside this same app container. A hidden web view opens that origin, reads every
/// collection and the meta store, and hands back a backup-format JSON. Nothing is
/// deleted, so the old data stays on the phone as a fallback.
@MainActor
enum LegacyMigration {
    static func run(timeout: Duration = .seconds(15)) async -> Data? {
        let runner = Runner()
        let timer = Task { @MainActor in
            try? await Task.sleep(for: timeout)
            runner.stop()
        }
        let data = await runner.read()
        timer.cancel()
        runner.stop()
        return data
    }

    private static let page = """
    <!doctype html><meta charset="utf-8"><script>
    const post = (m) => window.webkit.messageHandlers.garaj.postMessage(m);
    try {
      const req = indexedDB.open("garaj");
      let created = false;
      req.onupgradeneeded = () => { created = true; req.transaction.abort(); };
      req.onerror = () => post(created ? "none" : "error:" + req.error);
      req.onsuccess = () => {
        const db = req.result;
        const names = [...db.objectStoreNames];
        if (!names.includes("meta")) { post("none"); return; }
        const tx = db.transaction(names, "readonly");
        const collections = {}, meta = {};
        for (const name of names.filter((n) => n !== "meta")) {
          tx.objectStore(name).getAll().onsuccess = (e) => { collections[name] = e.target.result; };
        }
        const m = tx.objectStore("meta");
        m.getAllKeys().onsuccess = (k) => m.getAll().onsuccess = (v) => {
          k.target.result.forEach((key, i) => { meta[key] = v.target.result[i]; });
        };
        tx.oncomplete = () => {
          const total = Object.values(collections).reduce((n, list) => n + list.length, 0);
          if (!meta.settings && total === 0) { post("none"); return; }
          meta.settings ??= {};
          post(JSON.stringify({ app: "garaj", format: 1, collections, meta }));
        };
        tx.onerror = () => post("error:" + tx.error);
      };
    } catch (e) { post("error:" + e); }
    </script>
    """

    @MainActor
    private final class Runner: NSObject, WKScriptMessageHandler, WKURLSchemeHandler {
        private var webView: WKWebView?
        private var continuation: CheckedContinuation<Data?, Never>?

        func read() async -> Data? {
            await withCheckedContinuation { continuation in
                self.continuation = continuation
                let config = WKWebViewConfiguration()
                config.websiteDataStore = .default() // the same store the old app used
                config.setURLSchemeHandler(self, forURLScheme: "capacitor")
                config.userContentController.add(self, name: "garaj")
                let view = WKWebView(frame: .zero, configuration: config)
                webView = view
                view.load(URLRequest(url: URL(string: "capacitor://localhost/")!))
            }
        }

        func stop() {
            finish(nil)
            webView?.stopLoading()
            webView?.configuration.userContentController.removeScriptMessageHandler(forName: "garaj")
            webView = nil
        }

        private func finish(_ data: Data?) {
            continuation?.resume(returning: data)
            continuation = nil
        }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let text = message.body as? String, text.hasPrefix("{") else { finish(nil); return }
            finish(Data(text.utf8))
        }

        func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
            let body = Data(LegacyMigration.page.utf8)
            task.didReceive(HTTPURLResponse(url: task.request.url!, statusCode: 200, httpVersion: "HTTP/1.1",
                                            headerFields: ["Content-Type": "text/html; charset=utf-8"])!)
            task.didReceive(body)
            task.didFinish()
        }

        func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}
    }
}
