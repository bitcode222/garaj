import { MakeWatermark } from "@/components/ds/make-logo";
import { tone as toneOf } from "@/lib/tones";
import { cn } from "@/lib/utils";

/**
 * A banner card: saturated gradient in the colour of the meaning (a work-order
 * status), the make's logo as a faint watermark on the right, white text on top.
 * Used for the cars in the shop (dashboard) and as the header of a work-order
 * sheet, so the same car looks the same in both places.
 */
export function HeroCard({ tone = "neutral", make, size = "md", className, children }) {
	return (
		<div className={cn("relative isolate overflow-hidden rounded-2xl shadow-sm", toneOf(tone).banner, size === "lg" ? "p-5" : "p-4", className)}>
			<MakeWatermark make={make} className={cn("-right-5 -bottom-6 -z-10", size === "lg" ? "size-52" : "size-40")} />
			{/* soft highlight, top-left, like the light falling on the photo in a banner */}
			<span aria-hidden className="pointer-events-none absolute -top-16 -left-10 -z-10 size-48 rounded-full bg-white/10 blur-2xl" />
			{children}
		</div>
	);
}

/** Small translucent pill that sits on a HeroCard. `strong` = solid white for the one thing that needs eyes (late). */
export function HeroChip({ icon: Icon, strong = false, className, children }) {
	return (
		<span
			className={cn(
				"inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap tabular-nums",
				strong ? "bg-white text-red-700 shadow-xs" : "bg-white/20 text-white",
				className,
			)}
		>
			{Icon && <Icon className="size-3.5" aria-hidden />}
			{children}
		</span>
	);
}
