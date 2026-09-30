import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

/// Serves a Next.js static export (trailingSlash: true).
/// Capacitor's default router answers every extension-less path with the root
/// index.html, which breaks reloads of deep routes like `/invoices/detail/`.
struct StaticExportRouter: Router {
    var basePath: String = ""

    func route(for path: String) -> String {
        if !URL(fileURLWithPath: path).pathExtension.isEmpty {
            return basePath + path
        }
        let trimmed = path.hasSuffix("/") ? String(path.dropLast()) : path
        if !trimmed.isEmpty {
            let candidate = basePath + trimmed + "/index.html"
            if FileManager.default.fileExists(atPath: candidate) {
                return candidate
            }
        }
        return basePath + "/index.html"
    }
}

/// Bridge view controller used by Main.storyboard.
class MainViewController: CAPBridgeViewController {
    override func router() -> Router {
        return StaticExportRouter()
    }

    override func capacitorDidLoad() {
        // Edge swipe goes back through the web history (Next.js client navigation).
        webView?.allowsBackForwardNavigationGestures = true
        bridge?.registerPluginInstance(PrinterPlugin())
    }
}

/// `window.print()` is a no-op inside WKWebView; this exposes the native print
/// sheet (AirPrint, Save to Files, share as PDF) to JavaScript as `Printer.print()`.
@objc(PrinterPlugin)
public class PrinterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PrinterPlugin"
    public let jsName = "Printer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "print", returnType: CAPPluginReturnPromise)
    ]

    @objc func print(_ call: CAPPluginCall) {
        let jobName = call.getString("name") ?? "Garaj"
        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView else {
                call.reject("Web view unavailable")
                return
            }
            let info = UIPrintInfo(dictionary: nil)
            info.outputType = .general
            info.jobName = jobName

            let controller = UIPrintInteractionController.shared
            controller.printInfo = info
            controller.printFormatter = webView.viewPrintFormatter()

            let completion: UIPrintInteractionController.CompletionHandler = { _, completed, error in
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve(["completed": completed])
                }
            }
            if UIDevice.current.userInterfaceIdiom == .pad {
                let anchor = CGRect(x: webView.bounds.midX, y: webView.bounds.minY + 80, width: 1, height: 1)
                controller.present(from: anchor, in: webView, animated: true, completionHandler: completion)
            } else {
                controller.present(animated: true, completionHandler: completion)
            }
        }
    }
}
