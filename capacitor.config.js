// Capacitor config. `CAP_SERVER_URL=http://<mac-ip>:3000` enables live reload on a device.
const serverUrl = process.env.CAP_SERVER_URL;

/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: "com.albertoparos.garaj",
  appName: "Garaj",
  webDir: "out",
  ios: {
    contentInset: "never",
    scheme: "Garaj",
    limitsNavigationsToAppBoundDomains: false,
    allowsLinkPreview: false,
  },
  plugins: {
    StatusBar: { overlaysWebView: true },
  },
  ...(serverUrl ? { server: { url: serverUrl, cleartext: true } } : {}),
};

module.exports = config;
