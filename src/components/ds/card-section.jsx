"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { ToneDot } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

// A part that is planned, not real yet ("Programat", a draft): hatched, never a solid colour.
const HATCH = "repeating-linear-gradient(135deg, color-mix(in oklch, var(--muted-foreground) 60%, transparent) 0 2px, transparent 2px 5px)";

/** A group's or a part's mark: a tone dot, or an empty ring for what is only planned. */
export function PartMark({ tone: name, outline = false }) {
	return outline ? <span className="size-2 shrink-0 rounded-full border-[1.5px] border-muted-foreground" aria-hidden /> : <ToneDot tone={name} />;
}

/**
 * The cards form (docs/HOME-PAGE.md D3): a title column (name · count, ‹ › from `md` up; the
 * title links to the full page), then a carousel of cards grouped under small labels that stay
 * in view while their cards scroll. Phones swipe, a card at a time; ← → move between cards.
 *
 *   label        the section's name, also its accessible name
 *   count        the number after the name (or `countText`, e.g. "3 din 13" under a filter)
 *   href         the full page the title leads to
 *   aside        a line under the title (e.g. the amount still to collect)
 *   filter       { label, onClear }: the line under the section filters the cards; this is its way out
 *   groups       [{ key, label, mark, items }]; `renderCard(item, group)` returns a SectionCard
 *   empty        { text, action: { label, icon, onClick } }: nothing at all, a dashed card
 *   filteredOut  what to say when a filter leaves no card
 *   more         { text, href }: a last card leading to the rest
 *   reveal       a selector of a card to bring into view (sideways only) when it changes
 *   arrows       the ‹ › buttons' names: { back, forward }
 *   children     the line under the section (SectionLine)
 */
export function CardSection({ label, count, countText, href, aside, filter, groups, renderCard, empty, filteredOut, more, reveal, arrows, className, children }) {
	const track = useRef(null);
	const [edge, setEdge] = useState({ start: true, end: true });
	// The arrows follow everything that changes what can be scrolled: the scroll itself, cards added or removed, the width.
	const attach = useCallback((el) => {
		track.current = el;
		if (!el) return undefined;
		const measure = () => setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
		const resize = new ResizeObserver(measure);
		resize.observe(el);
		const cards = new MutationObserver(measure);
		cards.observe(el, { childList: true, subtree: true });
		el.addEventListener("scroll", measure, { passive: true });
		return () => {
			resize.disconnect();
			cards.disconnect();
			el.removeEventListener("scroll", measure);
			track.current = null;
		};
	}, []);

	useEffect(() => {
		const el = track.current;
		const card = reveal && el?.querySelector(reveal);
		if (!el || !card) return;
		const box = el.getBoundingClientRect();
		const rect = card.getBoundingClientRect();
		if (rect.left >= box.left + 8 && rect.right <= box.right - 8) return;
		el.scrollTo({ left: el.scrollLeft + rect.left - box.left - 24, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
	}, [reveal]);

	const step = (direction) => {
		const el = track.current;
		const card = el?.querySelector("[data-card]");
		if (!el || !card) return;
		el.scrollBy({ left: direction * (card.offsetWidth + 8), behavior: "smooth" });
	};

	// ← → from a card to the next one; the carousel follows the focus.
	const onKeyDown = (event) => {
		if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
		const cards = [...(track.current?.querySelectorAll("[data-card] > [data-card-main]") ?? [])];
		const at = cards.findIndex((card) => card.contains(document.activeElement));
		const next = cards[at + (event.key === "ArrowRight" ? 1 : -1)];
		if (at < 0 || !next) return;
		event.preventDefault();
		next.focus({ preventScroll: true });
		next.scrollIntoView({ block: "nearest", inline: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
	};

	const shown = groups.reduce((sum, group) => sum + group.items.length, 0);
	const total = count ?? shown;
	const Title = href ? Link : "span";

	return (
		<section aria-label={label} className={cn("space-y-2.5", className)}>
			<div className="flex flex-col gap-2.5 md:flex-row md:items-start md:gap-4">
				<div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 md:w-44 md:flex-col md:items-start md:pt-1.5">
					<Title
						{...(href ? { href } : null)}
						data-section-title
						className={cn("inline-flex items-center gap-0.5 text-2xs font-medium tracking-wider text-muted-foreground uppercase", href && "-mx-1 min-h-11 rounded px-1 transition-colors hover:text-foreground md:min-h-0")}
					>
						{label} · {countText ?? total}
						{href && <ChevronRight className="size-3.5" aria-hidden />}
					</Title>
					{aside && <div className="text-sm">{aside}</div>}
					{filter && (
						<button
							type="button"
							onClick={filter.onClear}
							aria-label={`Filtru activ: doar ${filter.label}. Arată tot.`}
							className="inline-flex h-11 max-w-full items-center gap-1 rounded-md border bg-accent px-2 text-xs font-medium transition-colors hover:bg-accent/70 md:h-7"
						>
							<span className="truncate">Doar: {filter.label}</span>
							<X className="size-3.5 shrink-0 opacity-70" aria-hidden />
						</button>
					)}
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
				{total === 0 && empty && <EmptyCard {...empty} />}
				{total > 0 && shown === 0 && <p className="flex-1 py-1.5 text-sm text-muted-foreground">{filteredOut}</p>}
				{shown > 0 && (
					<ul
						key={filter?.label ?? "all"}
						ref={attach}
						onKeyDown={onKeyDown}
						className="no-scrollbar -mx-4 -my-1 flex min-w-0 flex-1 snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 py-1 md:mx-0 md:-mx-1 md:scroll-px-1 md:px-1 md:py-1"
					>
						{groups.map((group) =>
							group.items.length ? (
								<li key={group.key} data-group={group.key} className="shrink-0">
									{/* Sticky inside its group: the label stays at the left edge while this group's cards scroll past. */}
									<p className="sticky left-0 mb-1.5 flex w-max items-center gap-1.5 text-2xs font-medium text-muted-foreground">
										{group.mark}
										{group.label}
										<span className="font-semibold text-foreground tabular-nums">{group.items.length}</span>
									</p>
									<ul className="flex gap-2">{group.items.map((item) => renderCard(item, group))}</ul>
								</li>
							) : null,
						)}
						{more && (
							<li className="flex shrink-0 snap-start items-end">
								<Link href={more.href} className="flex h-[calc(100%-1.375rem)] min-h-24 w-40 items-center justify-center rounded-lg border border-dashed px-3 text-center text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
									{more.text}
								</Link>
							</li>
						)}
					</ul>
				)}
			</div>
			{children}
		</section>
	);
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
function EmptyCard({ text, action }) {
	const Icon = action?.icon;
	return (
		<div className="flex min-h-24 flex-1 flex-col items-start justify-center gap-1 rounded-lg border border-dashed bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 md:max-w-xl">
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
 * One card of a CardSection: the standard size (15 rem, 72 vw on a phone), snapping on a
 * phone. `corner` holds up to two CornerButtons over its top right; the card's own button
 * (the record it opens) carries `data-card-main`.
 */
export function SectionCard({ corner, className, children, ...props }) {
	return (
		<li data-card className={cn("group relative @container w-[min(72vw,14.5rem)] shrink-0 snap-start md:w-60", className)} {...props}>
			{children}
			{corner && <div className="absolute top-2 right-2 z-10 flex gap-1.5 pointer-coarse:gap-3">{corner}</div>}
		</li>
	);
}

/** The card's own button: the whole card, tinted by its group (`look`), opening its record. */
export function CardButton({ look, lit, className, children, ...props }) {
	return (
		<button type="button" data-card-main className={cn("flex h-full w-full rounded-lg border p-2.5 text-left transition-[filter,box-shadow] hover:brightness-95 active:scale-[0.99]", look, lit, className)} {...props}>
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

/**
 * The line under a section: one bar split into parts and a legend with their values. With
 * `onChange` it is the section's filter (D4): a tap on a part keeps only its cards, a second
 * tap clears it. Without, it is a picture and nothing in it can be pressed.
 *   parts   [{ key, label, value (sizes the bar), display (the legend's number), tone, outline }]
 *   label   the legend's accessible name
 */
export function SectionLine({ parts, value = null, onChange, label, note, className }) {
	const present = parts.filter((part) => part.value > 0);
	if (!parts.length) return null;
	const toggle = (key) => onChange(value === key ? null : key);
	const bar = (
		<div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
			{present.map((part) => (
				<span
					key={part.key}
					className={cn("min-w-1.5 transition-opacity", !part.outline && tone(part.tone).bar, value && value !== part.key && "opacity-25")}
					style={{ flexGrow: part.value, backgroundImage: part.outline ? HATCH : undefined }}
				/>
			))}
		</div>
	);
	if (!onChange)
		return (
			<div className={cn("space-y-1", className)}>
				{bar}
				<ul aria-label={label} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-0.5 text-xs text-muted-foreground">
					{parts.map((part) => (
						<li key={part.key} className="inline-flex h-7 items-center gap-1.5">
							<PartMark tone={part.tone} outline={part.outline} />
							{part.label}
							<span className="font-semibold text-foreground tabular-nums">{part.display ?? part.value}</span>
						</li>
					))}
					{note && <li className="ml-auto inline-flex h-7 items-center">{note}</li>}
				</ul>
			</div>
		);
	return (
		<div className={cn("space-y-1", className)}>
			<div className="relative">
				{bar}
				{/* Taller, invisible hit areas over the parts; the legend buttons are the accessible controls. */}
				<div className="absolute inset-x-0 -inset-y-2 flex" aria-hidden>
					{present.map((part) => (
						<button key={part.key} type="button" tabIndex={-1} className="min-w-1.5" style={{ flexGrow: part.value }} title={`${part.label}: ${part.display ?? part.value}`} onClick={() => toggle(part.key)} />
					))}
				</div>
			</div>
			<div role="group" aria-label={label} className="no-scrollbar -mx-4 flex items-center gap-0.5 overflow-x-auto px-2 md:-mx-2 md:flex-wrap md:px-0">
				{parts.map((part) => (
					<button
						key={part.key}
						type="button"
						aria-pressed={value === part.key}
						aria-label={`${part.label}: ${part.display ?? part.value}${value === part.key ? ". Apasă pentru a arăta tot." : ""}`}
						onClick={() => toggle(part.key)}
						className={cn(
							"inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-[background-color,opacity] hover:bg-accent/60 md:h-7",
							value === part.key && "bg-accent text-foreground",
							value && value !== part.key && "opacity-50",
						)}
					>
						<PartMark tone={part.tone} outline={part.outline} />
						{part.label}
						<span className="font-semibold text-foreground tabular-nums">{part.display ?? part.value}</span>
						{/* The chosen chip carries its own way out, so it is in view wherever the row is scrolled. */}
						{value === part.key && <X className="size-3.5 opacity-70" aria-hidden />}
					</button>
				))}
				{note && <span className="ml-auto px-2 text-xs text-muted-foreground">{note}</span>}
			</div>
		</div>
	);
}
