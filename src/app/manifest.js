export const dynamic = "force-static";

export default function manifest() {
	return {
		name: "Garaj — service auto",
		short_name: "Garaj",
		description: "Programări, lucrări, facturi și clienți pentru service-ul auto.",
		start_url: "/",
		display: "standalone",
		orientation: "any",
		background_color: "#fafafa",
		theme_color: "#ea580c",
		lang: "ro",
		icons: [
			{ src: "/icon-192.png", sizes: "192x192", type: "image/png" },
			{ src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
		],
	};
}
