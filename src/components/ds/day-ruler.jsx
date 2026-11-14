"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Segmented } from "@/components/ds/inputs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addDaysISO, addMonthsISO, diffDaysISO, parseISODate } from "@/domain/dates";
import { BOUNDS, SPAN, windowAround } from "@/domain/timeframe";
import { fmtDate, plural } from "@/lib/format";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

// The day ruler (docs/TIMEFRAME-RULER.md, §11 for its look): a tape of days drawn as thin bars, what falls in each
// hour of the shop's day; the selected stretch is bright between its two handles, its dates in a pill over it. Everything is drawn from a view: the day index at the strip's left edge
// (`start`, fractional, days from today), a day's width (`dw`, px) and the strip's own width (`width`,
// px: the whole room, the ruler in its centre and the days around it filling the rest). Dragging, resizing and
// zooming only change the view and the selection while the pointer moves; the dates are handed to
// `onChange` when it settles.

const PREVIEW = 1; // the fewest faint days shown before and after the selection
const MAX_DW = 48; // a day is never wider than this (narrower when a long ruler must fit)
const ROOM = 22; // px a held selection handle stays inside the strip's ends
const EDGE = 26; // a handle held this close to the strip's edge keeps adding days
const TAP = 4; // px of movement before a press is a drag
const GLIDE = 240; // ms
const TIP = 2500; // ms a tapped day's details stay on a touch screen
// px: the pill over it (the dates, the count, ×); the room the handles rise over the cells; the day cells; the line under them
const WEEKDAYS = ["Lun", "Mar", "Mie", "Joi", "Vin", "Sâm", "Dum"];
const H = { pill: 40, over: 10, bars: 48, bottom: 16 };
// The divider between two days, standing on the line: 1 px wide for all; where a week starts (Monday) taller and darker,
// where a month starts more so. Height tells them apart (px).
// `tone` outside the selection, `selected` around its days (the primary colour, as the selection is everywhere).
const DIVIDER = {
	day: { height: 20, tone: "bg-foreground/28", selected: "bg-primary/60" },
	week: { height: 24, tone: "bg-foreground/45", selected: "bg-primary/80" },
	month: { height: 28, tone: "bg-foreground/60", selected: "bg-primary" },
};
// px an event takes in its day's stack (with the 1 px gap over it): 4, smaller when the busiest day would not fit, 2 at least
const UNIT = { most: 4, least: 2 };
// The lengths under the strip: a day, a week, a month (30 days), around the middle of the selection.
const LENGTHS = [
	{ value: 1, label: "Zi" },
	{ value: 7, label: "Săptămână" },
	{ value: 30, label: "Lună" },
];

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOut = (t) => 1 - (1 - t) ** 3;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** The days either side of a selection of `span` days: as many as fill `room` px with days no wider than MAX_DW, PREVIEW at least. */
const aroundOf = (span, room) => Math.max(PREVIEW, Math.ceil((room / MAX_DW - span) / 2));

/** What a day's cell says under its line (`i` 0 is today): "Azi", a dot, the day's number, or the month on the 1st with its number. */
function dayLabel(i, iso, date, dw, nearEnd) {
	const day = date.getDate();
	// Today always keeps its number: "6 azi" where there is room, the number alone where there is not.
	if (i === 0) return dw >= 32 ? `${day} azi` : String(day);
	// Two digits take about 14 px: a narrower day shows every Nth number, which keeps the shown ones apart.
	const every = Math.max(1, Math.ceil(16 / dw));
	if (day === 1 && !nearEnd) return dw >= 26 ? `1 ${fmtDate(iso, "MMM")}` : dw >= 8 ? "1" : fmtDate(iso, "MMM");
	return day % every === 0 || every === 1 ? String(day) : null;
}

/** The view that shows the selection a…b (day indices) in the centre of the whole room (the strip is full width), the days around it filling the rest. */
function fitView(a, b, room) {
	const span = b - a + 1;
	const n = aroundOf(span, room);
	const dw = room / (span + 2 * n);
	return { start: a - n, dw, width: room };
}

/** Days added while a handle is held at its limit: one every 110 ms, faster the longer it is held. */
function heldExtra(g, held, now) {
	if (held && g.edgeSince == null) g.edgeSince = now;
	if (!held) g.edgeSince = null;
	return g.edgeSince == null ? 0 : Math.floor(((now - g.edgeSince) / 110) * (1 + (now - g.edgeSince) / 1500));
}

/** A date's index: days from today. */
const a0Of = (day, today) => diffDaysISO(today, day);

/** The view at the zoom and width of `base`, centred on day `i`. */
const centredOn = (i, base) => ({ start: i + 0.5 - base.width / 2 / base.dw, dw: base.dw, width: base.width });

/** A day's records: how many, and how many of them fall due. */
function dayCount(mark) {
	let all = 0;
	let due = 0;
	for (const [kind, n] of Object.entries(mark ?? {})) {
		all += n;
		if (kind.endsWith("Due")) due += n;
	}
	return { all, due };
}

/** px an event takes in a stack: one scale for the whole tape, so the busiest day anywhere still fits its cell. */
function unitOf(marks) {
	let busiest = 1;
	for (const mark of marks?.values() ?? []) busiest = Math.max(busiest, dayCount(mark).all);
	return clamp(Math.floor((H.bars + 1) / busiest), UNIT.least, UNIT.most);
}

/** An event's colour in its stack: the primary colour inside the selection, faint outside (the hovered day a little less); a deadline amber. */
function unitTone(inside, lit, due) {
	if (due) return cn(tone("yellow").solid, !inside && "opacity-40");
	return inside ? "bg-primary" : lit ? "bg-foreground/45" : "bg-foreground/25";
}

/** A round icon button in the pill; 44 px to a finger. */
function PillButton({ icon: Icon, label, onClick, disabled = false }) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-label={label}
			title={label}
			className="relative flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted-foreground pointer-coarse:after:absolute pointer-coarse:after:-inset-2"
		>
			<Icon className="size-3.5" aria-hidden />
		</button>
	);
}

/**
 * The timeframe's calendar, opened from the pill: one month at a time, where a start and an end are picked
 * in the same grid. The days from start to end are in the primary colour, the two ends stronger. `pending`: a start
 * already picked, waiting for its end. `min`/`max` bound what can be picked.
 */
function RangeCalendar({ from, to, pending, min, max, onPick }) {
	const [month, setMonth] = useState(from.slice(0, 7));
	const first = `${month}-01`;
	const offset = (parseISODate(first).getDay() + 6) % 7; // weeks start on Monday
	const grid = Array.from({ length: 42 }, (_, i) => addDaysISO(first, i - offset));
	const shown = pending ? [pending, pending] : [from, to];
	const [lo, hi] = shown[0] <= shown[1] ? shown : [shown[1], shown[0]];
	const step = (months) => setMonth((m) => addMonthsISO(`${m}-01`, months).slice(0, 7));
	return (
		<div className="w-72">
			<div className="mb-2 flex items-center justify-between">
				<span className="pl-1 text-sm font-semibold first-letter:uppercase">{fmtDate(first, "MMMM yyyy")}</span>
				<span className="flex">
					<PillButton icon={ChevronLeft} label="Luna anterioară" onClick={() => step(-1)} />
					<PillButton icon={ChevronRight} label="Luna următoare" onClick={() => step(1)} />
				</span>
			</div>
			<div role="grid" aria-label={`Alege perioada, ${fmtDate(first, "MMMM yyyy")}`} className="grid grid-cols-7 text-center text-xs">
				{WEEKDAYS.map((name) => (
					<span key={name} className="pb-1 text-2xs font-medium text-muted-foreground" aria-hidden>
						{name}
					</span>
				))}
				{grid.map((day) => {
					const inside = day >= lo && day <= hi;
					const end = day === lo || day === hi;
					const off = day < min || day > max;
					return (
						<button
							key={day}
							type="button"
							disabled={off}
							onClick={() => onPick(day)}
							aria-label={fmtDate(day, "EEEE, d MMMM yyyy")}
							aria-pressed={inside}
							className={cn(
								"flex h-8 items-center justify-center tabular-nums transition-colors",
								inside && !end && "bg-primary/15 text-foreground",
								inside && day === lo && lo !== hi && "rounded-l-md",
								inside && day === hi && lo !== hi && "rounded-r-md",
								!inside && !off && "rounded-md hover:bg-accent",
								day.slice(0, 7) !== month ? "text-muted-foreground/60" : "text-foreground",
								off && "opacity-35",
							)}
						>
							<span className={cn("flex size-7 items-center justify-center rounded-full", end && "bg-primary font-semibold text-primary-foreground")}>{Number(day.slice(8))}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

/** One kind's bullet: a dot, or for a deadline a larger one with "!". The day's details use it. */
function Bullet({ kind, due, size, className, style }) {
	return (
		<span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-full leading-none font-bold text-white", tone(kind.tone).bar, className)} style={{ width: size, height: size, fontSize: size - 3, ...style }}>
			{due && size >= 9 ? "!" : ""}
		</span>
	);
}

/**
 * `from`, `to`: the selected dates ("YYYY-MM-DD", inclusive). `today`. `marks`: Map day → { kind: count }: each day's
 * records, stacked in its cell, and counted in its details. `kinds`: [{ key, due, tone, label, count(n), dueCount(n) }].
 * `isClosed(day)`. `onChange({ from, to }, { remember })` when it settles (`remember: false` for a picked day and
 * its undoing: not a length to keep); `onReset()` back to the default, from the pill's ×
 * (hidden while `atDefault`). `title`: the section's name over it.
 */
export function DayRuler({ from, to, today, marks, kinds, isClosed, onChange, onReset, atDefault, title = "Interval", className }) {
	const wrap = useRef(null);
	const track = useRef(null);
	const [room, setRoom] = useState(0); // px the strip may take
	const [live, setLive] = useState(null); // { a, b, view, band? } while a gesture runs
	const [glide, setGlide] = useState(null); // the view while it glides to where it settles
		const [tip, setTip] = useState(null); // { i, touch } the day whose details show
	const [calendarOpen, setCalendarOpen] = useState(false); // the timeframe's calendar, opened from the pill
	const [pending, setPending] = useState(null); // its start, picked and waiting for its end
	// A day picked by a click: { i, before: { a, b }, wasDefault, view }. It is the selection while the selection is
	// that one day; the view keeps the zoom it was picked at, centred on it, and a click on it again restores `before`.
	const [pick, setPick] = useState(null);
	const gesture = useRef(null);
	const frame = useRef(0);
	const tipTimer = useRef(0);

	const idx = (day) => diffDaysISO(today, day);
	const dayAt = (i) => addDaysISO(today, i);
	const a0 = idx(from);
	const b0 = idx(to);
	const span0 = b0 - a0 + 1;
	const fit = room ? fitView(a0, b0, room) : null;
		const picked = pick && a0Of(from, today) === pick.i && a0Of(to, today) === pick.i ? pick : null;
	const view = live?.view ?? glide ?? picked?.view ?? fit;
	const a = live?.a ?? a0;
	const b = live?.b ?? b0;
	const min = -BOUNDS.back;
	const max = BOUNDS.ahead;

	useLayoutEffect(() => {
		const el = wrap.current;
		if (!el) return undefined;
		const measure = () => {
			setRoom(el.clientWidth);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	useEffect(
		() => () => {
			cancelAnimationFrame(frame.current);
			clearTimeout(tipTimer.current);
		},
		[],
	);

		/** Glide the view from `fromView` to `target` (the fit of a…b unless given; no glide with reduced motion). */
	const glideTo = (fromView, a, b, target = fitView(a, b, room)) => {
		cancelAnimationFrame(frame.current);
		if (!fromView || reducedMotion()) {
			setGlide(null);
			return;
		}
		// Shown at once from where it starts: otherwise the render that hands over the new dates (before the first frame)
		// would flash the target.
		setGlide(fromView);
		const t0 = performance.now();
		const step = (now) => {
			const t = Math.min(1, (now - t0) / GLIDE);
			const k = easeOut(t);
			const at = (key) => fromView[key] + (target[key] - fromView[key]) * k;
			setGlide({ start: at("start"), dw: at("dw"), width: at("width") });
			if (t < 1) frame.current = requestAnimationFrame(step);
			else setGlide(null);
		};
		frame.current = requestAnimationFrame(step);
	};

		/**
	 * Hands a selection to the page (kept to the rules) and glides there from where the view is now. `target`: the
	 * view to glide to (a picked day's); `remember: false` for a picked day, so its one day is not remembered as the length.
	 */
	const commit = (na, nb, fromView, { target, remember = true } = {}) => {
		const len = clamp(nb - na + 1, SPAN.min, SPAN.max);
		const s = clamp(na, min, max - len + 1);
		const e = s + len - 1;
		glideTo(fromView, s, e, target ?? fitView(s, e, room));
		if (s !== a0 || e !== b0) onChange({ from: dayAt(s), to: dayAt(e) }, { remember });
	};

	/** Settles on a…b: while a day is picked and it stays one day, it moves the picked day (same zoom, centred); otherwise as usual. */
	const settle = (na, nb, fromView) => {
		if (picked && na === nb) {
			const i = clamp(na, min, max);
			const target = centredOn(i, picked.view);
			setPick({ ...picked, i, view: target });
			commit(i, i, fromView, { target, remember: false });
			return;
		}
		if (pick) setPick(null);
		commit(na, nb, fromView);
	};

	/** A click on day i: it becomes the selection, centred at the same zoom; a click on the picked day brings back what was before. */
	const pickDay = (i) => {
		if (picked && picked.i === i) {
			setPick(null);
			const { a: pa, b: pb } = picked.before;
			glideTo(view, pa, pb);
			if (picked.wasDefault) onReset?.();
			else onChange({ from: dayAt(pa), to: dayAt(pb) }, { remember: false });
			return;
		}
		const base = picked?.view ?? view;
		const target = centredOn(i, base);
		setPick({ i, before: picked?.before ?? { a: a0, b: b0 }, wasDefault: picked ? picked.wasDefault : Boolean(atDefault), view: target });
		commit(i, i, view, { target, remember: false });
	};

	// ── pointer: drag the ruler (pan), drag a handle (resize), tap a day, hover a day ────────────────

	// Checks for the view first: the compiler's memo would otherwise read view.dw during the first render, before there is one.
	const dayUnder = (clientX) => {
		if (!view) return 0;
		const rect = track.current.getBoundingClientRect();
		return Math.floor(view.start + (clientX - rect.left) / view.dw);
	};

	const onPointerDown = (event) => {
		if (!view || (event.pointerType === "mouse" && event.button !== 0)) return;
		cancelAnimationFrame(frame.current);
		setTip(null);
		const hit = event.target.closest?.("[data-handle]")?.dataset.handle ?? null;
		const rect = track.current.getBoundingClientRect();
		const bandX0 = (a - view.start) * view.dw;
		const bandX1 = (b + 1 - view.start) * view.dw;
		// Handles close together (thin days) overlap: the one whose bar is nearest the pointer is taken.
		const bars = { start: bandX0, end: bandX1 };
		const px = event.clientX - rect.left;
		const handle = hit && Object.keys(bars).reduce((best, key) => (Math.abs(bars[key] - px) < Math.abs(bars[best] - px) ? key : best), hit);
		// A selection handle opens the strip to all the room it has, so there is somewhere to drag it to.
		const base = { a, b, view: handle ? { ...view, width: room } : view, band: [bandX0, bandX1] };
		gesture.current = { role: handle ?? "pan", id: event.pointerId, x0: event.clientX, lastX: event.clientX, lastT: event.timeStamp, v: 0, moved: false, rect, base, edgeSince: null, touch: event.pointerType !== "mouse" };
						// A handle's effects (the strip opening, a picked day let go) wait until it moves: a finger's tap near a
		// handle is often given to it by the browser (touch adjustment), and must stay a tap on the day.
		if (handle) event.currentTarget.setPointerCapture(event.pointerId);
	};

	/** Whether a held handle is at the strip's edge, where holding it keeps adding days. */
	const atLimit = (g, x) => (g.role === "end" ? x > g.base.view.width - EDGE : x < EDGE);

	/** A handle's live selection: that end follows the pointer a day at a time; held at the strip's edge, it keeps adding days and zooms out. */
	const resizeAt = (g, x, now) => {
		const { base } = g;
		const width = base.view.width;
		const dw0 = base.view.dw;
		const end = g.role === "end";
		const fixed = end ? (base.a - base.view.start) * dw0 : (base.b + 1 - base.view.start) * dw0;
		const extra = heldExtra(g, atLimit(g, x), now);
		const reach = end ? Math.min(x, width - EDGE) - fixed : fixed - Math.max(x, EDGE);
		const days = clamp(Math.round(reach / dw0) + extra, SPAN.min, SPAN.max);
		const space = end ? width - ROOM - fixed : fixed - ROOM;
		const dw = Math.min(dw0, Math.max(2, space / days));
		// The view carries the width the strip is shown at, so letting go glides on from exactly what was on screen.
		if (end) {
			const nb = Math.min(base.a + days - 1, max);
			const s = base.a - fixed / dw;
			return { a: base.a, b: nb, view: { start: s, dw, width } };
		}
		const na = Math.max(base.b - days + 1, min);
		const s = base.b + 1 - fixed / dw;
		return { a: na, b: base.b, view: { start: s, dw, width } };
	};

	const onPointerMove = (event) => {
		const g = gesture.current;
		if (!g) {
			// No gesture: a mouse hovering a day shows its details (not over the strip's ends, where no day is drawn).
			if (event.pointerType === "mouse" && view) {
				const i = dayUnder(event.clientX);
				setTip((current) => (current?.i === i ? current : { i, touch: false }));
			}
			return;
		}
		if (event.pointerId !== g.id) return;
		const dx = event.clientX - g.x0;
		if (!g.moved && Math.abs(dx) < TAP) return;
				if (!g.moved) {
			g.moved = true;
			if (g.role === "pan") event.currentTarget.setPointerCapture(event.pointerId);
			else if (pick) setPick(null);
		}
		const dt = Math.max(1, event.timeStamp - g.lastT);
		g.v = 0.8 * ((event.clientX - g.lastX) / dt) + 0.2 * g.v;
		g.lastX = event.clientX;
		g.lastT = event.timeStamp;
		if (g.role === "pan") {
			const { base } = g;
			let shift = -dx / base.view.dw;
			// Past the bounds it resists, then settles back inside.
			const lo = min - base.a;
			const hi = max - base.b;
			if (shift < lo) shift = lo + (shift - lo) * 0.3;
			if (shift > hi) shift = hi + (shift - hi) * 0.3;
			const whole = clamp(Math.round(shift), lo, hi);
			setLive({ a: base.a + whole, b: base.b + whole, view: { ...base.view, start: base.view.start + shift }, band: base.band });
			return;
		}
		const x = event.clientX - g.rect.left;
		g.x = x;
		const liveAt = (at) => resizeAt(g, at, performance.now());
		setLive(liveAt(x));
		// Held at its limit without moving, it should still grow: keep a frame loop going while it is there.
		if (atLimit(g, x) && !g.loop) {
			const tick = () => {
				if (gesture.current !== g || !atLimit(g, g.x)) {
					g.loop = false;
					return;
				}
				setLive(liveAt(g.x));
				frame.current = requestAnimationFrame(tick);
			};
			g.loop = true;
			frame.current = requestAnimationFrame(tick);
		}
	};

	const end = (event, cancelled) => {
		const g = gesture.current;
		if (!g || event.pointerId !== g.id) return;
		gesture.current = null;
		cancelAnimationFrame(frame.current);
		const shown = live?.view ?? view;
		setLive(null);
		if (cancelled) {
			glideTo(shown, g.base.a, g.base.b);
			return;
		}
				if (!g.moved) {
			// A click on a handle is nothing; a finger's tap on one is a tap on the day under it (see onPointerDown).
			if (g.role !== "pan" && !g.touch) return;
						// A tap on a day picks it (a tap on the picked day gives back what was before); on a touch screen its
			// details show for a moment.
			const i = dayUnder(event.clientX);
			pickDay(i);
			if (g.touch) {
				setTip({ i, touch: true });
				clearTimeout(tipTimer.current);
				tipTimer.current = setTimeout(() => setTip(null), TIP);
			}
			return;
		}
		if (g.role === "pan") {
			// A flick carries on a little.
			const thrown = reducedMotion() ? 0 : g.v * 180;
			const shift = Math.round(-(event.clientX - g.x0 + thrown) / g.base.view.dw);
						settle(g.base.a + shift, g.base.b + shift, shown);
			return;
		}
		commit(live?.a ?? g.base.a, live?.b ?? g.base.b, shown);
	};

	// ── wheel: a sideways swipe moves it, a pinch (⌃ wheel) resizes it; up/down is the page's ───────

	const wheelState = useRef(null);
	const wheelRef = useRef(null);
	const liveRef = useRef(null);
	useLayoutEffect(() => {
		wheelRef.current = { view, a0, b0, span0, room, settle, min, max };
		liveRef.current = live;
	});
	useEffect(() => {
		const el = track.current;
		if (!el) return undefined;
		const onWheel = (event) => {
			const current = wheelRef.current;
			if (!current.view) return;
			const pinch = event.ctrlKey;
			if (!pinch && Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
			event.preventDefault();
			cancelAnimationFrame(frame.current);
			setTip(null);
			let w = wheelState.current;
			if (!w) w = wheelState.current = { a: current.a0, b: current.b0, view: current.view, px: 0, zoom: 0 };
			if (pinch) {
				w.zoom += event.deltaY;
				const len = clamp(Math.round(current.span0 * Math.exp(w.zoom / 120)), SPAN.min, SPAN.max);
				const mid = current.a0 + Math.floor((current.span0 - 1) / 2);
				const na = mid - Math.floor((len - 1) / 2);
				setLive({ a: na, b: na + len - 1, view: fitView(na, na + len - 1, current.room) });
			} else {
				w.px += event.deltaX;
				const shift = clamp(w.px / w.view.dw, current.min - w.a, current.max - w.b);
				const whole = Math.round(shift);
				const band = [(w.a - w.view.start) * w.view.dw, (w.b + 1 - w.view.start) * w.view.dw];
				setLive({ a: w.a + whole, b: w.b + whole, view: { ...w.view, start: w.view.start + shift }, band });
			}
			clearTimeout(w.timer);
			// It settles 150 ms after the last step: on whole days, like a drag.
			w.timer = setTimeout(() => {
				wheelState.current = null;
				const shown = liveRef.current;
				setLive(null);
								if (shown) wheelRef.current.settle(shown.a, shown.b, shown.view);
			}, 150);
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, []);

	// ── keys ───────────────────────────────────────────────────────────────────────────────────────

	const onKeyDown = (event) => {
		if (!view) return;
				const by = (n) => settle(a0 + n, b0 + n, view);
		// Longer or shorter is no longer one picked day.
		const resize = (na, nb) => {
			if (pick) setPick(null);
			commit(na, nb, view);
		};
		const keys = {
			ArrowLeft: () => by(event.shiftKey ? -span0 : -1),
			ArrowRight: () => by(event.shiftKey ? span0 : 1),
			PageUp: () => by(-30),
			PageDown: () => by(30),
			ArrowUp: () => resize(a0, b0 + 1),
			ArrowDown: () => resize(a0, Math.max(a0, b0 - 1)),
			"+": () => resize(a0, b0 + 1),
			"=": () => resize(a0, b0 + 1),
			"-": () => resize(a0, Math.max(a0, b0 - 1)),
			Home: () => {
				const w = windowAround(today, span0);
				settle(idx(w.from), idx(w.to), view);
			},
		};
		keys.t = keys.Home;
		keys.T = keys.Home;
		const run = keys[event.key];
		if (!run) return;
		event.preventDefault();
		run();
	};
	/** Zi · Săptămână · Lună under the strip: that many days, around the middle of the selection. */
	const lengthTo = (len) => {
		if (!view || len === span0) return;
		if (pick) setPick(null);
		const mid = a0 + Math.floor((span0 - 1) / 2);
		const na = mid - Math.floor((len - 1) / 2);
		commit(na, na + len - 1, view);
	};
	/** The calendar's clicks: the first day is the start, the second the end (either order); the timeframe is set then, and the calendar closes. */
	const pickRange = (iso) => {
		if (!view) return;
		if (!pending) {
			setPending(iso);
			return;
		}
		const i = idx(pending);
		const j = idx(iso);
		setPending(null);
		setCalendarOpen(false);
		if (pick) setPick(null);
		commit(Math.min(i, j), Math.max(i, j), view);
	};
	const onHandleKey = (which) => (event) => {
		if (!view || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
		event.preventDefault();
		event.stopPropagation();
		if (pick) setPick(null);
		const n = event.key === "ArrowLeft" ? -1 : 1;
		if (which === "start") commit(Math.min(a0 + n, b0), b0, view);
		else commit(a0, Math.max(b0 + n, a0), view);
	};

	// ── drawing ────────────────────────────────────────────────────────────────────────────────────

	const span = b - a + 1;
	const label = (i, pattern) => fmtDate(dayAt(i), pattern);
	const strip = H.over + H.bars + H.bottom; // the track's height
	let events = 0;
	for (let i = a; i <= b; i++) events += dayCount(marks?.get(dayAt(i))).all;

	let body = null;
	let pill = null;
	let details = null;
	if (view) {
		const { start, dw, width } = view;
		const first = Math.floor(start) - 1;
		const last = Math.ceil(start + width / dw) + 1;
		const band = live?.band ?? [(a - start) * dw, (b + 1 - start) * dw];
		const unit = unitOf(marks);
		const fits = Math.floor((H.bars + 1) / unit); // the most events a stack shows
		const stackWidth = clamp(Math.round(dw * 0.5), 3, 18);
		const days = [];
		for (let i = first; i <= last; i++) {
			const iso = dayAt(i);
			const x = (i - start) * dw;
			const date = parseISODate(iso);
			const inside = i >= a && i <= b;
			const bounds = i >= a && i <= b + 1; // this day's divider is a side of a selected day
			const lit = tip?.i === i;
			const { all, due } = dayCount(marks?.get(iso));
			const shown = Math.min(all, fits);
			const divider = DIVIDER[date.getDate() === 1 ? "month" : date.getDay() === 1 ? "week" : "day"];
			// A label wider than a thin day would be cut by the strip's ends: none that close to them.
			const nearEnd = Math.min(x + dw / 2, width - (x + dw / 2)) < 12;
			days.push(
				<div key={iso} className="absolute" style={{ left: x, width: dw, top: 0, height: strip }}>
					{/* The hovered day, softly lit in its cell. */}
					{lit && <div className="absolute inset-x-px rounded-sm bg-foreground/5" style={{ top: H.over, height: H.bars }} />}
					{/* The divider at the day's start, centred on it and standing on the line: one height for a day, taller for a week, more for a month. */}
					<div className={cn("absolute w-px", bounds ? divider.selected : divider.tone)} style={{ left: -0.5, top: H.over + H.bars - divider.height, height: divider.height }} />
					{/* Its records, stacked from the line up in the middle of the cell, one block each; the deadlines on top, amber. */}
					{shown > 0 && (
						<div className="absolute flex flex-col-reverse gap-px" style={{ left: (dw - stackWidth) / 2, width: stackWidth, top: H.over, height: H.bars }}>
							{Array.from({ length: shown }, (_, k) => (
								<span key={k} className={cn("shrink-0 rounded-[1px]", unitTone(inside, lit, k >= shown - Math.min(due, shown)))} style={{ height: unit - 1 }} />
							))}
						</div>
					)}
					{/* Under the line: each day's number, today's as "Azi" (a dot when it is too narrow), the 1st with its month. Narrow days
					    show every Nth number, so the numbers that are shown never touch. */}
					<div className={cn("absolute inset-x-0 flex justify-center text-2xs leading-none whitespace-nowrap", i === 0 ? "font-semibold text-brand" : "text-muted-foreground/70")} style={{ top: H.over + H.bars + 4 }}>
						{dayLabel(i, iso, date, dw, nearEnd)}
					</div>
				</div>,
			);
		}
		body = (
			<>
				{/* The tape, the whole width of the strip: the selected days bright between the two handles, the rest faint. */}
				{days}
				{/* The handles: a thin line at each end of the selection, rising over the bars, nothing joining them; 44 px to a finger. */}
				{[
					["start", band[0], "Începutul perioadei", a],
					["end", band[1], "Sfârșitul perioadei", b],
				].map(([which, x, name, i]) => (
					<div
						key={which}
						data-handle={which}
						role="slider"
						tabIndex={0}
						aria-label={name}
						aria-valuemin={min}
						aria-valuemax={max}
						aria-valuenow={i}
						aria-valuetext={fmtDate(dayAt(i), "EEEE, d MMMM yyyy")}
						onKeyDown={onHandleKey(which)}
						className="group/handle absolute w-8 cursor-ew-resize touch-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:w-11"
						// Its grab area lies mostly outside the selection (the line is at 80 % of it for the start, 20 % for the
						// end), so a short selection, a single picked day, stays free to click inside.
						style={{ left: x, top: 0, height: strip, transform: `translateX(${which === "start" ? -80 : -20}%)` }}
					>
						<span className="absolute inset-y-0 w-[1.5px] -translate-x-1/2 rounded-full bg-foreground/85 transition-colors group-hover/handle:bg-foreground group-focus-visible/handle:bg-foreground group-active/handle:bg-foreground" style={{ left: which === "start" ? "80%" : "20%" }}>
							<span className="absolute top-0 left-1/2 h-2.5 w-[5px] -translate-x-1/2 rounded-full bg-foreground opacity-0 transition-opacity group-hover/handle:opacity-100 group-focus-visible/handle:opacity-100 group-active/handle:opacity-100 pointer-coarse:opacity-100" />
						</span>
					</div>
				))}
			</>
		);

		// Over the selection, following it: its dates, how much is in them, zoom and the way back to today.
		pill = (
			<div className="relative" style={{ height: H.pill, width }}>
				<div
					className={cn("absolute top-0 left-0 flex h-8 items-center gap-0.5 rounded-full border bg-card py-0.5 pl-1.5 text-xs whitespace-nowrap shadow-xs", atDefault ? "pr-3" : "pr-0.5")}
					// Centred over the selection, kept inside the strip (the percentages are the pill's own width).
					style={{ translate: `clamp(0px, calc(${Math.round((band[0] + band[1]) / 2)}px - 50%), calc(${Math.round(width)}px - 100%))` }}
				>
					{/* Its dates, one button: the timeframe from start to end, and a chevron to open the calendar that picks both. */}
					<Popover
						open={calendarOpen}
						onOpenChange={(next) => {
							setCalendarOpen(next);
							if (!next) setPending(null);
						}}
					>
						<PopoverTrigger asChild>
							<button type="button" aria-label={`Perioada ${span === 1 ? label(a, "d MMM") : `${label(a, "d MMM")} – ${label(b, "d MMM")}`}, alege din calendar`} className="flex items-center gap-1 rounded-full px-2 py-1 font-medium tabular-nums transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
							{span === 1 ? label(a, "d MMM") : `${label(a, "d MMM")} – ${label(b, "d MMM")}`}
							<ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
						</button>
						</PopoverTrigger>
						<PopoverContent align="center" className="w-auto p-3">
							<RangeCalendar from={dayAt(a)} to={dayAt(b)} pending={pending} min={dayAt(min)} max={dayAt(max)} onPick={pickRange} />
						</PopoverContent>
					</Popover>
					{!atDefault && (
						<span className="ml-1">
							<PillButton icon={X} label="Înapoi la azi" onClick={() => onReset?.()} />
						</span>
					)}
				</div>
			</div>
		);

		// The hovered (or tapped) day's details, under the ruler: what each kind of record it holds, counted.
		if (tip && !live) {
			const iso = dayAt(tip.i);
			const mark = marks?.get(iso);
			const lines = mark
				? kinds.flatMap((k) => [
						k.due && mark[k.due] ? { key: k.due, kind: k, due: true, text: k.dueCount(mark[k.due]) } : null,
						mark[k.key] ? { key: k.key, kind: k, due: false, text: k.count(mark[k.key]) } : null,
					]).filter(Boolean)
				: [];
			const tags = [tip.i === 0 ? "azi" : null, isClosed?.(iso) ? "închis" : null].filter(Boolean).join(" · ");
			details = (
				<div role="tooltip" className="pointer-events-none absolute z-20 w-max max-w-64 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg" style={{ top: H.pill + strip + 6, left: clamp((tip.i + 0.5 - start) * dw - 110, 0, Math.max(0, width - 220)) }}>
					<p className="font-medium first-letter:uppercase">
						{fmtDate(iso, "EEEE, d MMMM")}
						{tags && <span className="font-normal text-muted-foreground"> · {tags}</span>}
					</p>
					{lines.length ? (
						<ul className="mt-1.5 space-y-1">
							{lines.map((line) => (
								<li key={line.key} className="flex items-center gap-2">
									<Bullet kind={line.kind} due={line.due} size={line.due ? 12 : 8} className={line.due ? "" : "mx-0.5"} />
									<span>{line.text}</span>
								</li>
							))}
						</ul>
					) : (
						<p className="mt-1 text-muted-foreground">Nimic în această zi.</p>
					)}
				</div>
			);
		}
	}

	return (
		<div className={cn("w-full space-y-3", className)}>
			<h2 className="text-lg font-medium text-muted-foreground">{title}</h2>
			<div ref={wrap} className="relative w-full">
				{pill ?? <div style={{ height: H.pill }} />}
				<div
					ref={track}
					role="slider"
					tabIndex={0}
					aria-label={`${title}: perioada secțiunilor de mai jos`}
					aria-valuemin={min}
					aria-valuemax={max}
					aria-valuenow={a0}
					aria-valuetext={`${fmtDate(from, "d MMM")} – ${fmtDate(to, "d MMM yyyy")}, ${plural(span0, "zi", "zile")}`}
					onKeyDown={onKeyDown}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={(event) => end(event, false)}
					onPointerCancel={(event) => end(event, true)}
					onPointerLeave={(event) => event.pointerType === "mouse" && !gesture.current && setTip(null)}
					onLostPointerCapture={(event) => gesture.current && end(event, false)}
					className="relative max-w-full cursor-grab touch-pan-y overflow-hidden rounded-lg outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
					style={{ height: strip, width: view?.width ?? "100%" }}
				>
					{body}
				</div>
				{details}
			</div>
			{/* At its bottom right, the lengths: a day, a week, a month, around the middle of the selection. */}
			<div className="flex items-center justify-between gap-3" style={{ width: view?.width }}>
				<span className="pl-1 text-xs text-muted-foreground tabular-nums">{plural(events, "eveniment", "evenimente")}</span>
				<Segmented aria-label="Lungimea perioadei" value={LENGTHS.some((option) => option.value === span0) ? span0 : null} onValueChange={lengthTo} options={LENGTHS} className="max-md:h-11" />
			</div>
		</div>
	);
}
