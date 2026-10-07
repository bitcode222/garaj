import { CarFront } from "lucide-react";
import { formatPlate } from "@/domain/vehicle";
import { LOGO_PATHS } from "@/lib/car-logo-paths";
import { cn } from "@/lib/utils";

// Spelling variants → key in LOGO_PATHS.
const ALIASES = {
	vw: "volkswagen",
	"mercedes-benz": "mercedes",
	"mercedes benz": "mercedes",
	benz: "mercedes",
	"citroën": "citroen",
	"škoda": "skoda",
	"rolls-royce": "rollsroyce",
	ds: "dsautomobiles",
	"ds automobiles": "dsautomobiles",
	"alfa romeo": "alfaromeo",
};

export function logoKey(make) {
	const key = String(make ?? "").trim().toLowerCase();
	const alias = ALIASES[key] ?? key.replace(/[\s-]/g, "");
	return LOGO_PATHS[alias] ? alias : null;
}

/** Brand mark before a make's name. Monochrome (follows the text colour); unknown makes get a monogram. */
export function MakeLogo({ make, className }) {
	const key = logoKey(make);
	if (key) {
		return (
			<svg viewBox="0 0 24 24" aria-hidden className={cn("size-5 shrink-0 fill-current", className)}>
				<path d={LOGO_PATHS[key]} />
			</svg>
		);
	}
	const letter = String(make ?? "").trim().charAt(0).toUpperCase();
	return letter ? (
		<span aria-hidden className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none font-semibold", className)}>
			{letter}
		</span>
	) : (
		<CarFront aria-hidden className={cn("size-5 shrink-0 text-muted-foreground", className)} />
	);
}

/** The brand mark as a big, faint backdrop (hero cards). A generic car when the make has no logo. */
export function MakeWatermark({ make, className }) {
	const key = logoKey(make);
	if (!key) return <CarFront aria-hidden strokeWidth={1.25} className={cn("pointer-events-none absolute text-white opacity-[0.14]", className)} />;
	return (
		<svg viewBox="0 0 24 24" aria-hidden className={cn("pointer-events-none absolute fill-white opacity-[0.14]", className)}>
			<path d={LOGO_PATHS[key]} />
		</svg>
	);
}

/** Logo + "Make Model" — the vehicle's primary label. */
export function VehicleLabel({ vehicle, className, nameClassName }) {
	if (!vehicle) return null;
	return (
		<span className={cn("flex min-w-0 items-center gap-2", className)}>
			<MakeLogo make={vehicle.make} className="text-foreground/80" />
			<span className={cn("truncate", nameClassName)}>{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Mașină"}</span>
		</span>
	);
}

/** The plate as quiet secondary text. The full graphic `Plate` is kept for the vehicle page and documents. */
export function PlateTag({ value, className }) {
	if (!value) return null;
	return (
		<span translate="no" className={cn("inline-flex h-5 shrink-0 items-center rounded border bg-background/60 px-1.5 font-mono text-[11px] leading-none font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase", className)}>
			{formatPlate(value)}
		</span>
	);
}

