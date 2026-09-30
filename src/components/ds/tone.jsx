import { cn } from "@/lib/utils";
import { tone as toneOf } from "@/lib/tones";

/** Tinted chip — the calendar's colored badge, used for every status. */
export function ToneBadge({ tone = "neutral", icon: Icon, size = "default", className, children }) {
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center gap-1 rounded-md border font-medium whitespace-nowrap",
				size === "sm" ? "h-5 px-1.5 text-2xs" : "h-6 px-2 text-xs",
				toneOf(tone).chip,
				className,
			)}
		>
			{Icon && <Icon className={size === "sm" ? "size-3" : "size-3.5"} aria-hidden />}
			{children}
		</span>
	);
}

/** Status from a label map (src/lib/labels.js): tone + icon + label in one. */
export function StatusBadge({ map, value, size, icon = true, className }) {
	const entry = map[value] ?? { label: value, tone: "neutral" };
	return (
		<ToneBadge tone={entry.tone} icon={icon ? entry.icon : undefined} size={size} className={className}>
			{entry.label}
		</ToneBadge>
	);
}

export function ToneDot({ tone = "neutral", pulse = false, className }) {
	return (
		<span className={cn("relative inline-flex size-2 shrink-0", className)} aria-hidden>
			{pulse && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", toneOf(tone).solid)} />}
			<span className={cn("relative inline-flex size-full rounded-full", toneOf(tone).solid)} />
		</span>
	);
}

/** Colored icon tile used in list rows and stats. */
export function ToneIcon({ tone = "neutral", icon: Icon, size = "md", className }) {
	return (
		<span
			className={cn(
				"flex shrink-0 items-center justify-center rounded-lg border",
				size === "sm" ? "size-7" : size === "lg" ? "size-11 rounded-xl" : "size-9",
				toneOf(tone).chip,
				className,
			)}
			aria-hidden
		>
			{Icon && <Icon className={size === "lg" ? "size-5" : "size-4"} />}
		</span>
	);
}
