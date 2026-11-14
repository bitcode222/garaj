import { cn } from "@/lib/utils";
import { RECORD_KIND } from "@/lib/labels";
import { tone as toneOf } from "@/lib/tones";

/** Tinted chip — a coloured label for a category or a count (states are StateTags). */
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

/**
 * A stored status from a label map (src/lib/labels.js), drawn as its state: dot (with its icon) and name. Where the
 * record itself is at hand, a StateTag of its look (src/lib/record-state.js) says more ("Restantă de 3 zile").
 */
export function StatusBadge({ map, value, size, icon = true, className }) {
	const entry = map[value] ?? { label: value, tone: "neutral" };
	return <StateTag state={{ text: entry.label, detail: entry.hint, tone: entry.tone, icon: icon ? entry.icon : null }} size={size === "sm" ? "sm" : "md"} className={className} />;
}

// A state dot's size and its icon's (docs/RECORD-COLORS.md §5); a dot with no icon is a small plain one.
const DOT = { sm: "size-3.5", md: "size-[1.125rem]", lg: "size-[1.375rem]" };
const DOT_ICON = { sm: "size-2.5", md: "size-3", lg: "size-3.5" };

/**
 * A record's state: a filled dot in its signal's colour with the state's icon (`state` from src/lib/record-state.js,
 * or { text, tone, icon }). `ring` sets it off a tinted card. With `tip`, hovering or focusing it shows the text
 * (and the detail) in a bubble under it, drawn inside the card so a carousel's clipping cannot cut it; the text is
 * its accessible name either way.
 */
export function StateDot({ state, size = "md", ring = false, tip = false, className }) {
	const Icon = state.icon;
	const dot = (
		<span className={cn("inline-flex shrink-0 items-center justify-center rounded-full", Icon ? DOT[size] : "size-2", toneOf(state.tone).dot, ring && "ring-2 ring-card", !tip && className)} aria-hidden>
			{Icon && <Icon className={DOT_ICON[size]} strokeWidth={2.75} />}
		</span>
	);
	if (!tip) return dot;
	return (
		<span role="img" aria-label={state.text} className={cn("group/state relative inline-flex shrink-0", className)}>
			{dot}
			<span role="tooltip" className="pointer-events-none absolute top-full left-0 z-20 mt-1.5 hidden w-max max-w-56 rounded-md border bg-popover px-2 py-1 text-left text-xs leading-snug font-medium text-popover-foreground shadow-md group-hover/state:block">
				<span className={toneOf(state.tone).text}>{state.text}</span>
				{state.detail && <span className="mt-0.5 block font-normal text-muted-foreground">{state.detail}</span>}
			</span>
		</span>
	);
}

// A tag's dot and text sizes.
const TAG = { sm: ["sm", "text-xs"], md: ["md", "text-sm"], lg: ["lg", "text-sm"] };

/**
 * A record's state where there is room: its dot and its few words in the signal's colour, the detail on hover
 * (`title`). `compact`: the dot alone, with its text in a bubble on hover (StateDot's `tip`).
 */
export function StateTag({ state, size = "md", compact = false, ring = false, className }) {
	if (compact) return <StateDot state={state} size={TAG[size][0]} ring={ring} tip className={className} />;
	return (
		<span title={state.detail || undefined} className={cn("inline-flex max-w-full min-w-0 items-center gap-1.5 font-medium whitespace-nowrap", TAG[size][1], toneOf(state.tone).text, className)}>
			<StateDot state={state} size={TAG[size][0]} ring={ring} />
			<span className="truncate">{state.text}</span>
		</span>
	);
}

/** A record's kind: its icon in a tile of its colour, before the title of its page or sheet (docs/RECORD-COLORS.md §3). */
export function KindMark({ kind, size = "md", className }) {
	const meta = RECORD_KIND[kind];
	return <ToneIcon tone={meta.tone} icon={meta.icon} size={size} className={className} />;
}

/** The text colour of a record's kind, for its title. */
export const kindText = (kind) => toneOf(RECORD_KIND[kind].tone).text;

/**
 * A record's card (docs/DESIGN-SYSTEM.md, normal and small cards, owner 7 Nov 2026): white with a hairline; the kind's
 * colour is on its first line (VisitCard), not its fill. `kind` stays so a card can still be told by its record.
 */
export const kindCard = (kind) => (RECORD_KIND[kind] ? "bg-card text-card-foreground" : "");

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
