"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { HalfDonut } from "@/components/ds/half-donut";
import { FilterChips } from "@/components/ds/inputs";
import { ToneDot, kindText } from "@/components/ds/tone";
import { RECORD_KIND } from "@/lib/labels";
import { tone as toneOf } from "@/lib/tones";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Whether the cards of a section are the large size (CardSection's `large`); the cards read it where they are drawn.
const LargeCards = createContext(false);
export const useLargeCards = () => useContext(LargeCards);
/** Draws the cards inside it at the large size, outside a CardSection (the design page). */
export const LargeCardsProvider = LargeCards.Provider;

/**
 * The carousel (Embla, docs/DESIGN-SYSTEM.md Cards form): the cards are its slides, dragged freely (momentum, no
 * snapping back to a card), by mouse, finger or pen; ‹ › and ← → step a card at a time.
 */
const CAROUSEL = { align: "start", dragFree: true, containScroll: "trimSnaps", slides: "[data-card], [data-more]" };

/**
 * Moves the carousel `px` sideways (negative: towards its end), gliding and never past its ends. False when it cannot move.
 * `fromHere`: from where it is now (a card measured on screen), not from where a glide already under way will stop (a
 * wheel's notches add up).
 */
function moveBy(api, px, fromHere = false) {
	const engine = api.internalEngine();
	const from = engine.target.get();
	const to = engine.limit.constrain((fromHere ? engine.location.get() : from) + px);
	if (Math.abs(to - from) < 0.5) return false;
	engine.scrollBody.useBaseFriction().useBaseDuration();
	engine.scrollTo.distance(to - from, false);
	return true;
}

/** The vertical wheel turns a carousel sideways while it has room to move; at either end the page scrolls on. */
function wheelTurns(api) {
	const onWheel = (event) => {
		// A sideways swipe is the wheel plugin's.
		if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
		if (moveBy(api, -event.deltaY * (event.deltaMode === 1 ? 16 : 1))) event.preventDefault();
	};
	const root = api.rootNode();
	root.addEventListener("wheel", onWheel, { passive: false });
	return () => root.removeEventListener("wheel", onWheel);
}

/** A part's mark: a tone dot, or an empty ring for what is only planned. */
export function PartMark({ tone: name, outline = false }) {
	return outline ? <span className="size-2 shrink-0 rounded-full border-[1.5px] border-muted-foreground" aria-hidden /> : <ToneDot tone={name} />;
}

/**
 * The cards form (docs/HOME-PAGE.md D3): a title column (name · count, ‹ › from `md` up, the title links to the
 * full page, and the section's parts as a half donut), then the section's filter chips over a carousel of cards.
 * The carousel is Embla's, dragged freely (mouse, finger, pen: it carries on and stops anywhere); ‹ › step a card,
 * ← → move between cards.
 *
 *   label        the section's name, also its accessible name
 *   kind         the records' kind (docs/RECORD-COLORS.md): the title is written in its colour
 *   count        the number after the name (or `countText`, e.g. "3 din 13" under a filter)
 *   href         the full page the title leads to
 *   aside        a line under the title (e.g. the amount still to collect)
 *   groups       [{ key, label, items }]; `renderCard(item, group)` returns a SectionCard
 *   empty        { text, action: { label, icon, onClick } }: nothing at all, a dashed card
 *   filteredOut  what to say when a filter leaves no card
 *   more         { text, href }: a last card leading to the rest
 *   reveal       a selector of a card to bring into view (sideways only) when it changes
 *   arrows       the ‹ › buttons' names: { back, forward }
 *   parts        { parts, value, onChange, label, unit, total }: what the section is made of, as chips over the cards
 *                (Toate, then each part with its number) and as a half donut in the title column (HalfDonut); a tap
 *                on either keeps one part's cards. A part: { key, label, tone, outline, value, count, display },
 *                `value` what it measures (a count, an amount), `count` its records (when the value is an amount),
 *                `display` its value as text; `total` the whole as text, `unit` what the whole counts
 *   filter       { label, onClear }: the filter in force (its label names what the carousel holds)
 *   large        the larger cards (for the sections that are the day's work)
 *   gestures     the wheel moves the carousel too: a sideways trackpad swipe (Embla's wheel plugin), and up and down
 *                turn it sideways while it has room (then the page scrolls on)
 *   children     what comes under the section
 */
export function CardSection({ label, kind, count, countText, href, aside, filter, groups, renderCard, empty, filteredOut, more, reveal, arrows, parts, large = false, gestures = false, className, children }) {
	const track = useRef(null);
	const [edge, setEdge] = useState({ start: true, end: true });
	// The part under the pointer, on a chip or an arc: the half donut names it.
	const [pointed, setPointed] = useState(null);
	const [emblaRef, embla] = useEmblaCarousel(CAROUSEL, gestures ? [WheelGesturesPlugin()] : []);
	// The carousel's api for the track's observer, which outlives a render.
	const api = useRef(null);
	// What the carousel holds, named by its filter. Once it has changed, every new set of cards is
	// revealed (docs/DESIGN-SYSTEM.md, Cards form): the cards rise in one after another, so the change
	// is seen. Never on the first load.
	const holds = filter?.label ?? "all";
	const [seen, setSeen] = useState({ holds, reveal: false });
	if (seen.holds !== holds) setSeen({ holds, reveal: true });
	const revealing = seen.reveal;
	const attach = useCallback((el) => {
		track.current = el;
		if (!el) return undefined;
		// The track's end padding is its last card's margin: the carousel measures the gap after its end from the last slide.
		const markEnd = () => {
			const slides = el.querySelectorAll("[data-card], [data-more]");
			const pad = getComputedStyle(el).paddingRight;
			slides.forEach((slide, i) => (slide.style.marginRight = i === slides.length - 1 ? pad : ""));
		};
		markEnd();
		// The order the cards come in when revealed; the far ones wait no longer than the eighth.
		let index = 0;
		for (const card of el.querySelectorAll("[data-card]")) card.style.setProperty("--i", String(Math.min(index++, 8)));
		const cards = new MutationObserver((records) => {
			// A card added or removed inside a group: the carousel only watches its own children, so it is told.
			const slid = records.some((record) => [...record.addedNodes, ...record.removedNodes].some((node) => node.nodeType === 1 && node.matches("[data-card], [data-more], [data-group]")));
			if (!slid) return;
			markEnd();
			api.current?.reInit();
		});
		cards.observe(el, { childList: true, subtree: true });
		return () => {
			cards.disconnect();
			track.current = null;
		};
	}, []);

	// The arrows follow the carousel: every move, and every time it is measured again.
	useEffect(() => {
		api.current = embla ?? null;
		if (!embla) return undefined;
		const follow = () => {
			const fits = embla.scrollSnapList().length <= 1;
			const progress = embla.scrollProgress();
			const start = fits || progress <= 0.002;
			const end = fits || progress >= 0.998;
			setEdge((previous) => (previous.start === start && previous.end === end ? previous : { start, end }));
		};
		follow();
		embla.on("scroll", follow).on("reInit", follow).on("resize", follow).on("settle", follow);
		const undo = gestures ? wheelTurns(embla) : null;
		return () => {
			embla.off("scroll", follow).off("reInit", follow).off("resize", follow).off("settle", follow);
			undo?.();
			if (api.current === embla) api.current = null;
		};
	}, [embla, gestures]);

	useEffect(() => {
		const el = track.current;
		const card = reveal && el?.querySelector(reveal);
		if (!embla || !el || !card) return;
		const box = embla.rootNode().getBoundingClientRect();
		const rect = card.getBoundingClientRect();
		if (rect.left >= box.left + 8 && rect.right <= box.right - 8) return;
		const index = embla.slideNodes().indexOf(card.closest("[data-card], [data-more]"));
		if (index >= 0) embla.scrollTo(index, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
	}, [embla, reveal]);

	const step = (direction) => (direction < 0 ? embla?.scrollPrev() : embla?.scrollNext());

	// ← → from a card to the next one; the carousel moves just enough to show it whole (Embla follows Tab, not these keys).
	const onKeyDown = (event) => {
		if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
		const cards = [...(track.current?.querySelectorAll("[data-card] > [data-card-main]") ?? [])];
		const at = cards.findIndex((card) => card.contains(document.activeElement));
		const next = cards[at + (event.key === "ArrowRight" ? 1 : -1)];
		if (at < 0 || !next) return;
		event.preventDefault();
		next.focus({ preventScroll: true });
		if (!embla) return;
		const view = embla.rootNode().getBoundingClientRect();
		const inset = parseFloat(getComputedStyle(embla.containerNode()).paddingLeft) || 0;
		const rect = next.getBoundingClientRect();
		if (rect.right > view.right - inset) moveBy(embla, view.right - inset - rect.right, true);
		else if (rect.left < view.left + inset) moveBy(embla, view.left + inset - rect.left, true);
	};

	const shown = groups.reduce((sum, group) => sum + group.items.length, 0);
	const total = count ?? shown;
	const Title = href ? Link : "span";
	const split = parts && total > 0 ? parts : null;

	return (
		<LargeCards.Provider value={large}>
			<section aria-label={label} className={cn("space-y-2.5", className)}>
				<div className="flex flex-col gap-2 md:flex-row md:items-stretch md:gap-4">
					<div className="flex shrink-0 items-center justify-between gap-4 md:w-44 md:flex-col md:items-stretch md:justify-start md:gap-3 md:pt-1.5">
						<div className="flex min-w-0 flex-col items-start gap-1.5">
							<Title
								{...(href ? { href } : null)}
								data-section-title
								className={cn("inline-flex items-center gap-0.5 text-lg font-medium", kind ? kindText(kind) : "text-muted-foreground", href && "-mx-1 min-h-11 rounded px-1 transition-colors hover:text-foreground md:min-h-0")}
							>
								{/* One run of text, so the name and the count wrap together. */}
								<span>
									{label} ·{" "}
									<span key={holds} className="whitespace-nowrap tabular-nums">
										{countText ?? total}
									</span>
								</span>
								{href && <ChevronRight className="size-3.5" aria-hidden />}
							</Title>
							{aside && <div className="text-sm">{aside}</div>}
							{shown > 0 && (
								<div className="hidden gap-1.5 md:flex">
									<Button variant="outline" size="icon" className="size-7" onClick={() => step(-1)} disabled={edge.start} aria-label={arrows?.back ?? `${label}: înapoi`}>
										<ChevronLeft />
									</Button>
									<Button variant="outline" size="icon" className="size-7" onClick={() => step(1)} disabled={edge.end} aria-label={arrows?.forward ?? `${label}: înainte`}>
										<ChevronRight />
									</Button>
								</div>
							)}
						</div>
						{split && <HalfDonut {...split} pointed={pointed} onPoint={setPointed} className="w-36 shrink-0 md:mt-auto md:w-full" />}
					</div>
					<div className="flex min-w-0 flex-1 flex-col gap-2">
						{split && <PartChips {...split} onPoint={setPointed} />}
						{total === 0 && empty && <EmptyCard {...empty} />}
						{total > 0 && shown === 0 && <EmptyCard key={holds} revealing={revealing} text={filteredOut ?? "Nimic de arătat."} action={filter ? { label: "Arată tot", onClick: filter.onClear } : undefined} />}
						{shown > 0 && (
							// The viewport clips and takes the drag; the track inside is what moves. The gutter is the track's
							// padding, so the first card starts in line with the page and they all slide to the screen's edge.
							<div key={holds} ref={emblaRef} className="relative -mx-4 -my-1 min-w-0 overflow-hidden py-1 md:-mx-1">
								<ul ref={attach} data-reveal={revealing || undefined} onKeyDown={onKeyDown} className="relative flex touch-pan-y gap-4 px-4 select-none md:px-1">
									{groups.map((group) =>
										group.items.length ? (
											<li key={group.key} data-group={group.key} className="shrink-0">
												<ul className="flex gap-3">{group.items.map((item) => renderCard(item, group))}</ul>
											</li>
										) : null,
									)}
									{more && (
										<li data-more className="flex shrink-0">
											<Link href={more.href} className={cn("flex min-h-24 items-center justify-center rounded-lg border border-dashed px-3 text-center text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground", large ? "w-52" : "w-40")}>
												{more.text}
											</Link>
										</li>
									)}
								</ul>
							</div>
						)}
					</div>
				</div>
				{children}
			</section>
		</LargeCards.Provider>
	);
}

// Toate's value among the chips: no part kept.
const ALL = "all";

/**
 * A section's filter, over its cards: its parts as FilterChips, Toate first (the whole), then each part with its mark
 * and its number (or amount). A second tap on the kept one, or Toate, clears it. A part with nothing in it is left out,
 * unless it is the one kept. Pointing at a chip names its part in the half donut (`onPoint`).
 */
function PartChips({ parts, value = null, onChange, onPoint, label, total }) {
	const options = [
		{ value: ALL, label: "Toate", count: total ?? parts.reduce((sum, part) => sum + part.value, 0) },
		...parts.filter((part) => (part.count ?? part.value) > 0 || part.key === value).map((part) => ({ value: part.key, label: part.label, tone: part.tone, outline: part.outline, count: part.display ?? part.value })),
	];
	return <FilterChips label={label} value={value ?? ALL} options={options} onChange={(next) => onChange(next === ALL || next === value ? null : next)} onPoint={(key) => onPoint(key === ALL ? null : key)} />;
}

/** At most `max` items over all the groups, in order; `hidden` is how many were left out (for the "+N" card). */
export function capGroups(groups, max) {
	let room = max;
	const kept = [];
	for (const group of groups) {
		const items = group.items.slice(0, Math.max(0, room));
		room -= items.length;
		kept.push({ ...group, items });
	}
	const total = groups.reduce((sum, group) => sum + group.items.length, 0);
	return { groups: kept, hidden: Math.max(0, total - max) };
}

/** Nothing in a section: a dashed card that says so and offers the one thing to do (Cloudflare's "Add a domain"). */
function EmptyCard({ text, action, revealing = false }) {
	const Icon = action?.icon;
	return (
		<div data-reveal-empty={revealing || undefined} className="flex min-h-24 flex-1 flex-col items-start justify-center gap-1 rounded-lg border border-dashed bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 md:max-w-xl">
			<p className="text-sm text-muted-foreground">{text}</p>
			{action && (
				<Button variant="ghost" size="sm" className="-mx-2 max-md:h-11 sm:mx-0" onClick={action.onClick}>
					{Icon && <Icon />} {action.label}
				</Button>
			)}
		</div>
	);
}

/**
 * One card of a CardSection (one of the carousel's slides): the standard size (15 rem, 72 vw on a phone). `corner` holds up to two CornerButtons over its top right; the card's own button
 * (the record it opens) carries `data-card-main`.
 */
export function SectionCard({ corner, actions, behind, reserve = 0, className, children, ...props }) {
	const large = useLargeCards();
	// The stack: the section keeps room for as many records as its cards can have behind them, so their tops line up.
	const pad = reserve * STACK_STEP;
	return (
		<li data-card className={cn("group relative @container shrink-0", large ? "w-[min(84vw,20rem)] md:w-80" : "w-[min(72vw,14.5rem)] md:w-60", className)} style={pad ? { paddingTop: pad } : undefined} {...props}>
			{behind?.map((record, i) => {
				const away = behind.length - i;
				return <StackTab key={record.key} kind={record.key} skipped={record.skipped} style={{ top: pad - away * STACK_STEP, left: away * 7, right: away * 7 }} />;
			})}
			{children}
			{/* The actions at the bottom right, over the last line's end (VisitCard keeps it clear with `footPad`). */}
			{corner && <div className={cn("absolute z-10 flex gap-1.5 pointer-coarse:gap-3", large ? "right-3.5 bottom-3.5" : "right-2.5 bottom-2.5")}>{corner}</div>}
			{/* The next step and one more move, labelled, across the card's foot (VisitCard keeps the room: `actions`). */}
			{actions && <div className={cn("absolute z-10 flex gap-1.5", large ? "inset-x-3.5 bottom-3.5" : "inset-x-2.5 bottom-2.5")}>{actions}</div>}
		</li>
	);
}

const STACK_STEP = 14; // px each record behind a card shows of itself

/**
 * A record of the visit that came before the card's own, behind it (the owner's pick, 7 Nov 2026): its edge in its kind's
 * colour, its name and a tick; dashed and faint when the step was passed over (a job opened straight in progress).
 */
function StackTab({ kind, skipped, style }) {
	const meta = RECORD_KIND[kind];
	return (
		<span aria-hidden style={style} className={cn("pointer-events-none absolute flex h-10 justify-end gap-1 overflow-hidden rounded-t-lg border border-b-0 bg-card px-2 pt-[3px] text-[10px] leading-3 font-semibold", kindText(kind), skipped && "opacity-60")}>
			<span className={cn("absolute inset-x-0 top-0", skipped ? cn("h-0 border-t-2 border-dashed", toneOf(meta.tone).border) : cn("h-0.5", toneOf(meta.tone).solid))} />
			{!skipped && <Check className="size-2.5 shrink-0" strokeWidth={3} />}
			{meta.label}
			{skipped && " · sărit"}
		</span>
	);
}

/**
 * One of a card's two labelled actions (the owner's pick, 7 Nov 2026): the next step (`primary`, filled) or one more
 * move. 36 px to the eye, 44 on a touch screen. `href`: a message or a call instead of a button.
 */
export function CardAction({ icon: Icon, label, title, onClick, href, primary = false, className }) {
	const look = cn(
		"flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold whitespace-nowrap shadow-xs transition-colors pointer-coarse:h-11",
		primary ? "border-transparent bg-primary text-primary-foreground hover:bg-primary/90" : "bg-card text-foreground hover:bg-accent",
		className,
	);
	const body = (
		<>
			{Icon && <Icon className="size-4 shrink-0" aria-hidden />}
			<span className="truncate">{label}</span>
		</>
	);
	if (href)
		return (
			<a href={href} {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : null)} onClick={onClick} aria-label={title} title={title ?? label} className={look}>
				{body}
			</a>
		);
	return (
		<button type="button" onClick={onClick} aria-label={title} title={title ?? label} className={look}>
			{body}
		</button>
	);
}

/** The card's own button: the whole card, tinted in its record's kind colour (`look`, kindCard), opening its record. */
export function CardButton({ look, lit, className, children, ...props }) {
	const large = useLargeCards();
	return (
		<button type="button" data-card-main className={cn("relative z-[1] flex h-full w-full rounded-lg border text-left transition-[filter,box-shadow] hover:brightness-95 active:scale-[0.99]", large ? "min-h-52 p-3.5" : "p-2.5", look, lit, className)} {...props}>
			{children}
		</button>
	);
}

/**
 * A one-tap action over a card's corner. 32 px to the eye, 44 px to a finger (its hit area
 * reaches past it). `quiet` ones show on hover or focus with a mouse, always on touch.
 */
export function CornerButton({ icon: Icon, label, title, onClick, href, quiet = false, className }) {
	const look = cn(
		"relative flex size-8 items-center justify-center rounded-md border bg-card text-foreground shadow-xs transition-[opacity,background-color] after:absolute after:-inset-1.5 hover:bg-accent",
		quiet && "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100",
		className,
	);
	const icon = <Icon className="size-4" aria-hidden />;
	if (href)
		return (
			// A web link (WhatsApp) opens beside the app; tel: and sms: go straight to the phone.
			<a href={href} {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : null)} onClick={onClick} aria-label={label} title={title ?? label} className={look}>
				{icon}
			</a>
		);
	return (
		<button type="button" onClick={onClick} aria-label={label} title={title ?? label} className={look}>
			{icon}
		</button>
	);
}
