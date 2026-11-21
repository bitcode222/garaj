import { Geist_Mono, Inter, Manrope } from "next/font/google";
import { AppShell } from "@/components/shell/app-shell";
import { Providers } from "@/components/shell/providers";
import "./globals.css";

// latin-ext carries ă, ș, ț.
const inter = Inter({
	variable: "--font-inter",
	subsets: ["latin", "latin-ext"],
	display: "swap",
});

// Azi's type (the owner's pick, 21 Nov 2026).
const manrope = Manrope({
	variable: "--font-manrope",
	subsets: ["latin", "latin-ext"],
	display: "swap",
	preload: false,
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
		{ media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
		{ media: "(prefers-color-scheme: dark)", color: "#0f0f11" },
	],
};

// <body suppressHydrationWarning>: browser extensions (e.g. ColorZilla's cz-shortcut-listen)
// add attributes to <body> before React hydrates, which is harmless.
export default function RootLayout({ children }) {
	return (
		<html lang="ro" suppressHydrationWarning>
			<body suppressHydrationWarning className={`${inter.variable} ${manrope.variable} ${geistMono.variable} font-sans antialiased`}>
				{/* Before anything is painted: the sidebar folded or not (app-shell.jsx), one choice for every page. */}
				<script
					dangerouslySetInnerHTML={{
						__html: `try{if(localStorage.getItem("garaj.sidebar")==="rail")document.documentElement.dataset.sidebar="rail"}catch(e){}`,
					}}
				/>
				<Providers>
					<AppShell>{children}</AppShell>
				</Providers>
			</body>
		</html>
	);
}
