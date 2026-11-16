import { MakeLogo } from "@/components/ds/make-logo";
import { makeColor, makeCover, makeInk } from "@/lib/colors";

// The owner's "Agenda, lucrată" (16 Nov 2026, board https://claude.ai/artifact/QcYyQTxWy1eZ61cKtY7A4f, A + E): a booking
// is a card in its car's colour with depth, a soft glow of that colour under it, and the car's logo large as a watermark.

/** The card's colours: the car's colour falling into its deepened cover, its ink, and the glow. */
export function craftStyle(make) {
	const color = makeColor(make);
	const cover = makeCover(make);
	return {
		background: `linear-gradient(150deg, ${color} 0%, ${cover} 62%, color-mix(in srgb, ${cover} 80%, #000) 100%)`,
		color: makeInk(make),
		boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.18), 0 10px 22px -12px ${color}, 0 2px 4px -2px rgb(0 0 0 / 0.25)`,
	};
}

/** The car's logo, large and faint, bleeding off the card's corner. */
export function Watermark({ make, size = 60 }) {
	if (!make) return null;
	return (
		<span aria-hidden className="pointer-events-none absolute -right-3.5 -bottom-4 opacity-[0.16]" style={{ width: size, height: size }}>
			<MakeLogo make={make} className="text-current" style={{ width: size, height: size }} />
		</span>
	);
}
