import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/shell/app-shell";
import { Providers } from "@/components/shell/providers";
import "./globals.css";

// latin-ext carries ă, ș, ț.
const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin", "latin-ext"],
	display: "swap",
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin", "latin-ext"],
	display: "swap",
	preload: false,
});

export const metadata = {
	title: { default: "Garaj", template: "%s · Garaj" },
	description: "Programări, lucrări, facturi și clienți — tot service-ul auto într-un singur loc.",
	applicationName: "Garaj",
	appleWebApp: { capable: true, title: "Garaj", statusBarStyle: "default" },
	formatDetection: { telephone: false, email: false, address: false },
};

export const viewport = {
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
	// An installed app, not a page: no pinch-zoom or zoom-out, which also keeps a
	// stray overflowing element from shrinking the whole UI.
	minimumScale: 1,
	maximumScale: 1,
	userScalable: false,
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#fafafa" },
		{ media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
	],
};

export default function RootLayout({ children }) {
	return (
		<html lang="ro" suppressHydrationWarning>
			<body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
				<Providers>
					<AppShell>{children}</AppShell>
				</Providers>
			</body>
		</html>
	);
}
