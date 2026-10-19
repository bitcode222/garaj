"use client";

import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Initials } from "@/components/ds/data";
import { MakeLogo } from "@/components/ds/make-logo";
import { canReschedule } from "@/domain/appointment";
import { dayOfInstant, parseISODate } from "@/domain/dates";
import { vehicleName } from "@/domain/vehicle";
import { fmtDate, fmtTime, plural } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { useLocalPreference, useMediaQuery, useNowMinute } from "@/lib/hooks";
import { APPOINTMENT_STATUS, BOOKING_MARK, WORK_ORDER_STATUS } from "@/lib/labels";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { DRAG_SLOP_PX, HOLD_MS, HOLD_SLOP_PX, drawSpan, edgeSpeed, shiftSpan, startAt, stretchSpan } from "@/features/dashboard/timeline-drag";
import {
	GUTTER_PX,
	HOUR_PX,
	HOUR_TOUCH_PX,
	centerLeft,
	dayAtCenter,
	dayAtLeft,
	dayWindow,
	daysInView,
	indexAt,
	indexOfDay,
	keepScroll,
	leftOf,
	nearEdge,
	serviceBars,
	stepDay,
	widthAt,
	visibleDays,
	yOf,
} from "./calendar-geometry";
import { AlertSign, alertOutline, alertSummary } from "./booking-warnings";
import { MechanicLabel } from "./mechanic-card";
import { atMinute, dayCount, eventTone, hhmm, layoutEvents, minuteOfDay, toMinutes } from "./utils";

const HEAD_PX = 54; // the day's name and number on one line (Notion's), and under them how many bookings it has
const STAFF_PX = 24; // Zi: the mechanics' names over their columns
const LANE_PX = 22; // a car in service
const SETTLE_MS = 160;
const CLICK_QUIET_MS = 350;
const TOUCH_EDGE_PX = 14; // touch: holding this close to a booking's top or bottom stretches it
const DAY = { start: 0, end: 24 * 60 }; // the drag maths work inside the whole day
const NO_EVENTS = [];
const SHADE = "color-mix(in oklch, var(--muted) 70%, transparent)";
const HATCH = "repeating-linear-gradient(135deg, color-mix(in oklch, var(--muted-foreground) 14%, transparent) 0 1px, transparent 1px 7px)";

/** A booking's minutes of its day; one that runs past midnight ends with the day. */
function spanOf(appointment, day) {
	const start = minuteOfDay(appointment.start);
	const end = dayOfInstant(appointment.end) !== day ? 24 * 60 : minuteOfDay(appointment.end);
	return { start, end: Math.max(end, start + 15) };
}

/** Hairline hours, as Notion's grid; a closed day faintly hatched. One background, no elements. */
function columnBackground(hourPx, openMin, closeMin, closedDay) {
	const lines = `repeating-linear-gradient(to bottom, color-mix(in oklch, var(--border) 70%, transparent) 0 1px, transparent 1px ${hourPx}px)`;
	return { backgroundImage: closedDay ? `${lines}, ${HATCH}` : lines };
}

/**
 * A booking on the grid: its mark and time, the car, the customer, then the plate, as its height
 * allows; the mark (booked, job, done) in the top-left corner, the mechanic's avatar in the bottom-left.
 */
const EventBlock = memo(function EventBlock({ appointment: a, mark = "booking", top, height, left, width, toneName, lookups, past, selected, alert, dragging, movable }) {
	const mechanic = a.staffId ? lookups.staff?.[a.staffId] : null;
	const Mark = BOOKING_MARK[mark].icon;
	const vehicle = lookups.vehicles[a.vehicleId];
	const customer = lookups.customers[a.customerId];
	const car = vehicleName(vehicle);
	const lines = Math.max(1, Math.floor((height - 6) / 15));
	const time = `${fmtTime(a.start)}–${fmtTime(a.end)}`;
	return (
		<button
			type="button"
			data-appt={a.id}
			data-match={lookups.match ? (lookups.match.has(a.id) ? "1" : "0") : undefined}
			aria-label={[time, car, customer?.name, a.title, mechanic?.name, APPOINTMENT_STATUS[a.status].label, BOOKING_MARK[mark].label, alertSummary(alert)].filter(Boolean).join(" · ")}
			data-mark={mark}
			className={cn(
				"absolute z-[5] flex flex-col overflow-hidden rounded-md border px-1.5 py-[3px] text-left text-2xs leading-[15px] transition-[box-shadow,opacity] select-none [-webkit-touch-callout:none]",
				tone(toneName).block,
				a.status === "scheduled" && "border-dashed",
				past && "opacity-60",
				lookups.match && !lookups.match.has(a.id) && "opacity-15 saturate-50",
				(a.status === "no_show" || a.status === "cancelled") && "line-through opacity-50",
				alertOutline(alert),
				selected && "z-[6] ring-2 ring-brand shadow-md shadow-brand/25",
				movable && "pointer-fine:cursor-grab",
				dragging && "opacity-30",
			)}
			style={{ top, height, left: `calc(${left}% + 2px)`, width: `calc(${width}% - 4px)` }}
		>
			{lines === 1 ? (
				// One line: the mark, the time and the car, the avatar at the end.
				<span className="flex min-w-0 items-center gap-1">
					<Mark aria-hidden className="size-3 shrink-0" />
					<span className="min-w-0 flex-1 truncate">
						<span className="tabular-nums opacity-80">{fmtTime(a.start)}</span> <span className="font-semibold">{car || customer?.name || a.title}</span>
					</span>
					<AlertSign alert={alert} />
					{mechanic && <Initials name={mechanic.name} tone={mechanic.color} size="sm" className="size-3.5 shrink-0 text-[7px]" />}
				</span>
			) : (
				<>
					<span className="flex min-w-0 items-center gap-1">
						<Mark aria-hidden className="size-3 shrink-0" />
						<span className="min-w-0 flex-1 truncate tabular-nums opacity-80">{time}</span>
						{/* What needs attention, at the end of the top line (the details on hover and in the sheet). */}
						<AlertSign alert={alert} />
					</span>
					<span className="flex min-w-0 items-center gap-1 text-xs font-semibold">
						{/* Two lines: the avatar starts the bottom one. */}
						{lines === 2 && mechanic && <Initials name={mechanic.name} tone={mechanic.color} size="sm" className="size-3.5 shrink-0 text-[7px]" />}
						{lines >= 3 && vehicle?.make && <MakeLogo make={vehicle.make} className="size-3 shrink-0" />}
						<span className="truncate">{car || customer?.name || a.title || "Programare"}</span>
					</span>
					{lines >= 4 && car && customer && <span className="truncate opacity-80">{customer.name}</span>}
					{lines >= 5 && vehicle?.plate && <span className="truncate font-mono tracking-wide uppercase opacity-70">{vehicle.plate}</span>}
					{/* Three lines or more: the avatar in the bottom-left corner. */}
					{lines >= 3 && mechanic && <Initials name={mechanic.name} tone={mechanic.color} size="sm" className="mt-auto size-3.5 shrink-0 text-[7px]" />}
				</>
			)}
			{movable && (
				<>
					<span data-edge="start" aria-hidden className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize pointer-coarse:hidden" />
					<span data-edge="end" aria-hidden className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize pointer-coarse:hidden" />
				</>
			)}
		</button>
	);
});

/**
 * One day of the strip: its hours (a background), a column per mechanic in Zi, and its
 * bookings laid out in lanes. Memoised: scrolling re-renders nothing that did not change.
 * `data-day`, `data-col` and `data-appt` are what the strip's pointer handling looks for.
 */
const DayColumn = memo(function DayColumn({ day, left, width, slim, closed, events, columns, keyOf, hourPx, openMin, closeMin, colorBy, lookups, selectedId, dragId, now, editable, dim, zebra, onOpen, onCreateAt }) {
	if (slim) {
		return (
			<div data-day={day} data-slim className="absolute inset-y-0 border-l-2 border-foreground/15" style={{ left, width, ...columnBackground(hourPx, openMin, closeMin, true) }} title={`${fmtDate(day, "EEEE, d MMMM")} · închis`} />
		);
	}
	const colWidth = 100 / columns.length;
	return (
		<div data-day={day} data-dim={dim || undefined} className={cn("absolute inset-y-0 border-l-2 border-foreground/15 transition-opacity duration-300", dim && "opacity-45", zebra && "bg-foreground/[0.035]")} style={{ left, width, ...columnBackground(hourPx, openMin, closeMin, closed) }}>
			{columns.map((column, c) => {
				const list = events.filter((a) => keyOf(a) === column.key);
				const placed = layoutEvents(list);
				return (
					<div
						key={column.key}
						data-col={column.key}
						role="presentation"
						onClick={(event) => {
							if (event.target !== event.currentTarget) return;
							const rect = event.currentTarget.getBoundingClientRect();
							onCreateAt(day, ((event.clientY - rect.top) / hourPx) * 60, column.staffId);
						}}
						className={cn("absolute inset-y-0 cursor-copy", c > 0 && "border-l border-dashed border-border/70", columns.length > 1 && tone(column.color).soft)}
						style={{ left: `${c * colWidth}%`, width: `${colWidth}%` }}
					>
						{placed.map(({ event: a, lane, lanes }) => {
							const span = spanOf(a, day);
							const top = yOf(span.start, hourPx) + 1;
							const height = Math.max(yOf(span.end, hourPx) - yOf(span.start, hourPx) - 2, 16);
							return (
								<EventBlock
									key={a.id}
									appointment={a}
									mark={lookups.marks?.get(a.id)}
									top={top}
									height={height}
									left={(lane / lanes) * 100}
									width={100 / lanes}
									toneName={eventTone(a, colorBy, lookups)}
									lookups={lookups}
									past={now != null && a.end < now}
									selected={a.id === selectedId}
									alert={lookups.alerts?.get(a.id) ?? null}
									dragging={a.id === dragId}
									movable={editable && canReschedule(a)}
									onOpen={onOpen}
								/>
							);
						})}
					</div>
				);
			})}
		</div>
	);
});

/** The line at now: faint across every day, bold across today, and its time in a brand pill in the gutter (Notion's). */
function NowLine({ layout, today, hourPx, gutter, totalWidth }) {
	const minute = useNowMinute();
	if (minute == null) return null;
	const y = yOf(minute, hourPx);
	const index = layout.days[0] <= today && today <= layout.days.at(-1) ? indexOfDay(layout, today) : -1;
	return (
		<>
			<div aria-hidden className="pointer-events-none absolute z-[7] h-px bg-brand/35" style={{ top: y, left: gutter, width: totalWidth }} />
			{index >= 0 && !layout.slim[index] && (
				<div aria-hidden className="pointer-events-none absolute z-[8] h-0.5 -translate-y-1/2 bg-brand" style={{ top: y, left: gutter + layout.offsets[index], width: widthAt(layout, index) }}>
					<span className="absolute -top-[3px] -left-1 size-2 rounded-full bg-brand" />
				</div>
			)}
		</>
	);
}

function NowPill({ hourPx }) {
	const minute = useNowMinute();
	if (minute == null) return null;
	return (
		<span aria-hidden className="absolute right-1 z-[9] -translate-y-1/2 rounded-md bg-brand px-1 text-2xs leading-4 font-semibold text-brand-foreground tabular-nums" style={{ top: yOf(minute, hourPx) }}>
			{hhmm(minute)}
		</span>
	);
}

/**
 * Zi and Săptămână (docs/APPOINTMENTS-AND-NAV.md D12–D17): one strip of days without end,
 * scrolled sideways (settling on a day's edge) and through the 24 hours up and down. Only
 * the days in view, and one screen of them on each side, are in the page; the window of laid
 * out days moves around the day in view when an end comes near, invisibly. The headers and
 * the hours stick; a row of cars in service sits under the headers; now is a brand line.
 * Bookings are created, moved and stretched in place (mouse after 4 px, touch after a hold).
 *
 * The scroll position never becomes React state: one read per frame, state only when the
 * days to render change. `ref` exposes goTo(day), step(±1) and today().
 */
export function DayStrip({ ref, view, today, settings, byDay, allByDay, columns, keyOf, orders, showService, lookups, colorBy, selectedId, initialDay, onView, onOpen, onOpenOrder, onCreate, onReschedule, onPickDay }) {
	const touch = useMediaQuery("(pointer: coarse)");
	const scroller = useRef(null);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const [anchor, setAnchor] = useState(initialDay);
	const [range, setRange] = useState(null); // { first, last }: the day indices to render
	const [drag, setDrag] = useState(null); // what a drag would do: { kind, id, day, col, start, end, home }
	const [slot, setSlot] = useState(null); // free time under the mouse: { day, col, minute }
	const [focusDay, setFocusDay] = useState(initialDay); // Zi: the day in the middle, at full strength (its neighbours fade)
	const hourPx = touch ? HOUR_TOUCH_PX : HOUR_PX;
	const gutter = size.width && size.width < 640 ? 48 : GUTTER_PX;
	const openMin = toMinutes(settings.hours.open);
	const closeMin = toMinutes(settings.hours.close);
	const openDays = settings.hours.days;
	const zi = view === "day";
	// Zi: the middle day whole and a share of each neighbour, less with every mechanic more (calendar-geometry.js sideShare).
	const perView = visibleDays(view, size.width, zi ? columns.length : 1);

	const attach = useCallback((el) => {
		scroller.current = el;
		if (!el) return undefined;
		const resize = new ResizeObserver(() => setSize((prev) => (prev.width === el.clientWidth && prev.height === el.clientHeight ? prev : { width: el.clientWidth, height: el.clientHeight })));
		resize.observe(el);
		return () => {
			resize.disconnect();
			scroller.current = null;
		};
	}, []);

	// The days laid out: a window around the anchor; a closed day with nothing booked is slim (never today, never because of a filter).
	const layout = useMemo(() => {
		if (!size.width) return null;
		const dayWidth = Math.max(80, (size.width - gutter) / perView);
		// Săptămână keeps seven equal columns (Notion's); only Zi narrows a closed day with nothing booked.
		return dayWindow({ anchor, dayWidth, isSlim: (day) => view === "day" && day !== today && !openDays.includes(parseISODate(day).getDay()) && !allByDay.has(day) });
	}, [size.width, gutter, perView, anchor, today, openDays, allByDay, view]);

	const geometry = useRef(null);
	// A gesture lives in a ref from the press to the release; only its preview is state.
	const gesture = useRef(null);
	const quietClick = useRef(false);
	const creep = useRef({ frame: 0, x: 0, y: 0 });
	const live = useRef(null); // this render's handlers, for the hold timer and the creep loop
	const pending = useRef(null); // a jump to land on once the window has moved: { day, minute }
	const positioned = useRef(false);
	const motion = useRef({ frame: 0, target: null }); // our glide in flight
	const notify = useRef(onView);
	useEffect(() => {
		notify.current = onView;
	});

	// A week starts with the day asked for (today, when Azi is pressed), as Notion's: no jump back to Monday.
	const startDay = (day) => day;
	const withoutSnap = (el, run) => {
		el.style.scrollSnapType = "none";
		run();
		requestAnimationFrame(() => requestAnimationFrame(() => (el.style.scrollSnapType = "")));
	};

	// Where the view is, kept across a moved window, a resize and data that changes a slim day.
	useLayoutEffect(() => {
		const el = scroller.current;
		if (!el || !layout) return;
		const previous = geometry.current?.layout;
		geometry.current = { layout };
		if (!positioned.current) {
			positioned.current = true;
			withoutSnap(el, () => {
				el.scrollLeft = zi ? centerLeft(layout, initialDay, el.clientWidth - gutter) : leftOf(layout, startDay(initialDay));
				// Today opens at now (an hour and a half above it), any other day at the opening hour.
				const clock = new Date();
				const minute = initialDay === today ? clock.getHours() * 60 + clock.getMinutes() - 90 : openMin - 30;
				el.scrollTop = Math.max(0, yOf(minute, hourPx));
			});
			return;
		}
		if (pending.current) {
			const { day } = pending.current;
			pending.current = null;
			withoutSnap(el, () => (el.scrollLeft = zi ? centerLeft(layout, day, el.clientWidth - gutter) : leftOf(layout, day)));
			return;
		}
		if (previous && previous !== layout) {
			const kept = keepScroll(previous, layout, el.scrollLeft);
			if (kept != null) withoutSnap(el, () => (el.scrollLeft = kept));
		}
		// `initialDay` and `today` only matter the first time; later the scroll position decides.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [layout]);

	// One read of the scroll position per frame; state only when the days to render change.
	const ready = Boolean(layout);
	useEffect(() => {
		const el = scroller.current;
		if (!el || !ready) return undefined;
		let frame = 0;
		let timer = 0;
		const read = () => {
			const lay = geometry.current.layout;
			const width = el.clientWidth - (el.clientWidth < 640 ? 48 : GUTTER_PX);
			const seen = daysInView(lay, el.scrollLeft, width);
			return { lay, seen, day: zi ? dayAtCenter(lay, el.scrollLeft, width) : dayAtLeft(lay, el.scrollLeft) };
		};
		const update = () => {
			frame = 0;
			const { lay, seen, day } = read();
			const spare = Math.max(1, seen.last - seen.first + 1);
			const first = Math.max(0, seen.first - spare);
			const last = Math.min(lay.days.length - 1, seen.last + spare);
			setRange((prev) => (prev && prev.first === first && prev.last === last ? prev : { first, last }));
			if (zi) setFocusDay((prev) => (prev === day ? prev : day));
			notify.current?.({ day, from: lay.days[seen.first], to: lay.days[seen.last], settled: false });
		};
		const settle = () => {
			const { lay, seen, day } = read();
			notify.current?.({ day, from: lay.days[seen.first], to: lay.days[seen.last], settled: true });
			// Near an end of the window: move it around the day in view (never during a glide or a drag).
			if (!motion.current.frame && !gesture.current?.active && nearEdge(lay, el.scrollLeft, el.clientWidth)) setAnchor(day);
		};
		const onScroll = () => {
			setSlot(null);
			if (!frame) frame = requestAnimationFrame(update);
			clearTimeout(timer);
			timer = setTimeout(settle, SETTLE_MS);
		};
		update();
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			el.removeEventListener("scroll", onScroll);
			cancelAnimationFrame(frame);
			clearTimeout(timer);
		};
	}, [ready, layout, zi]);

	/** Our own eased scroll (the house curve), with snapping off while it runs; any input from the user stops it. */
	const glideTo = useCallback((left, top = null) => {
		const el = scroller.current;
		if (!el) return;
		cancelAnimationFrame(motion.current.frame);
		const from = { x: el.scrollLeft, y: el.scrollTop };
		const to = { x: left, y: top ?? from.y };
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || (Math.abs(to.x - from.x) < 1 && Math.abs(to.y - from.y) < 1)) {
			withoutSnap(el, () => {
				el.scrollLeft = to.x;
				el.scrollTop = to.y;
			});
			return;
		}
		el.style.scrollSnapType = "none";
		const width = el.clientWidth;
		// Far away: jump to a screen before the target and glide in from its side, never through weeks of days.
		if (Math.abs(to.x - from.x) > 3 * width) {
			from.x = to.x - Math.sign(to.x - from.x) * width;
			el.scrollLeft = from.x;
		}
		const duration = 320 + 260 * Math.min(1, Math.abs(to.x - from.x) / (2 * width));
		const began = performance.now();
		const tick = (time) => {
			const t = Math.min(1, Math.max(0, (time - began) / duration));
			const k = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
			el.scrollLeft = from.x + (to.x - from.x) * k;
			el.scrollTop = from.y + (to.y - from.y) * k;
			if (t < 1) motion.current.frame = requestAnimationFrame(tick);
			else {
				motion.current = { frame: 0, target: null };
				requestAnimationFrame(() => (el.style.scrollSnapType = ""));
			}
		};
		motion.current = { frame: requestAnimationFrame(tick), target: left };
	}, []);

	useEffect(() => {
		const el = scroller.current;
		if (!el) return undefined;
		const stop = () => {
			if (!motion.current.frame) return;
			cancelAnimationFrame(motion.current.frame);
			motion.current = { frame: 0, target: null };
			el.style.scrollSnapType = "";
		};
		el.addEventListener("wheel", stop, { passive: true });
		el.addEventListener("pointerdown", stop);
		el.addEventListener("touchstart", stop, { passive: true });
		return () => {
			el.removeEventListener("wheel", stop);
			el.removeEventListener("pointerdown", stop);
			el.removeEventListener("touchstart", stop);
		};
	}, []);

	const api = useMemo(() => {
		const goTo = (day, { minute = null } = {}) => {
			const el = scroller.current;
			if (!el || !layout) return;
			const target = startDay(day);
			const top = minute == null ? null : Math.max(0, yOf(minute - 90, hourPx));
			// Outside the window (or near its ends): the window moves there first, and the view lands on it.
			if (target < layout.days[45] || target > layout.days.at(-46)) {
				pending.current = { day: target };
				setAnchor(target);
				if (top != null) el.scrollTop = top;
				return;
			}
			glideTo(zi ? centerLeft(layout, target, el.clientWidth - gutter) : leftOf(layout, target), top);
		};
		return {
			goTo,
			step: (direction) => {
				const el = scroller.current;
				if (!el || !layout) return;
				// Quick presses add up: the next step starts from where the glide is heading.
				const at = motion.current.target ?? el.scrollLeft;
				const from = zi ? dayAtCenter(layout, at, el.clientWidth - gutter) : dayAtLeft(layout, at);
				goTo(stepDay(layout, from, view, direction));
			},
			today: () => {
				const clock = new Date();
				goTo(today, { minute: clock.getHours() * 60 + clock.getMinutes() });
			},
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [layout, view, today, hourPx, glideTo, perView, zi, gutter]);
	useImperativeHandle(ref, () => api, [api]);

	// ── editing in place: draw a booking on free time, move one, stretch one by its top or bottom ──
	// The row of cars in service is one thin lane, as Notion's all-day row; its label opens it to all lanes (kept on the device).
	const [serviceOpen, setServiceOpen] = useLocalPreference("garaj.calendar.serviceOpen", "closed", ["open", "closed"]);
	const opened = serviceOpen === "open";
	const lanes = opened ? (touch ? 2 : 3) : 1;
	const serviceH = lanes * LANE_PX + 16; // the lanes, and a strip for "+N" under them (never over a car's name)
	const staffHeader = zi && columns.length > 1; // Zi: a column per mechanic, named under the day
	const headerPx = HEAD_PX + (staffHeader ? STAFF_PX : 0) + (showService ? serviceH : 0);

	/** Where the pointer is: x in the days' coordinates, y in the hours', the day and the mechanic's column there. */
	const pointAt = (clientX, clientY) => {
		const el = scroller.current;
		const box = el.getBoundingClientRect();
		const x = clientX - box.left + el.scrollLeft - gutter;
		const y = clientY - box.top + el.scrollTop - headerPx;
		const index = indexAt(layout, Math.max(0, x));
		const fraction = Math.min(Math.max((x - layout.offsets[index]) / widthAt(layout, index), 0), 0.999);
		return { x, y, index, column: columns[Math.floor(fraction * columns.length)] };
	};
	const minuteAtY = (y) => Math.min(Math.max((y / hourPx) * 60, 0), 24 * 60);

	const previewOf = (g) => {
		const { y, index, column } = pointAt(g.last.x, g.last.y);
		const minute = minuteAtY(y);
		if (g.kind === "create") return { ...g.look, day: g.day, col: g.col, ...drawSpan(g.anchor, minute, DAY) };
		if (g.kind !== "move") return { ...g.look, day: g.day, col: g.col, ...stretchSpan(g.span, g.kind, minute, DAY) };
		// A moved booking follows the pointer to another day (or mechanic, in Zi); over a closed day it waits on the last one.
		const day = layout.slim[index] ? (g.preview?.day ?? g.day) : layout.days[index];
		return { ...g.look, day, col: staffHeader ? column.key : g.col, ...shiftSpan(g.span, minute - g.grab, DAY) };
	};

	const show = (g) => {
		const next = previewOf(g);
		const prev = g.preview;
		if (prev && prev.day === next.day && prev.col === next.col && prev.start === next.start && prev.end === next.end) return;
		if (prev) {
			g.moved = true;
			if (g.touch) haptics.selection();
		}
		g.preview = next;
		setDrag(next);
	};

	const lift = () => {
		const g = gesture.current;
		if (!g || g.active || !layout) return;
		g.active = true;
		clearTimeout(g.timer);
		try {
			scroller.current?.setPointerCapture(g.pointerId);
		} catch {
			// the pointer is already gone; its release ends the gesture
		}
		quietClick.current = true;
		if (g.touch) haptics.thud();
		setSlot(null);
		show(g);
	};

	const creepOn = () => {
		const g = gesture.current;
		const el = scroller.current;
		if (!g?.active || !el || (!creep.current.x && !creep.current.y)) {
			creep.current.frame = 0;
			return;
		}
		el.style.scrollSnapType = "none";
		let left = el.scrollLeft + creep.current.x;
		if (g.kind !== "move") {
			// A drawn or stretched booking stays on its day: the strip goes no further than that day's sides.
			const home = indexOfDay(layout, g.day);
			left = Math.min(Math.max(left, Math.min(layout.offsets[home], el.scrollLeft)), Math.max(layout.offsets[home + 1] - (el.clientWidth - gutter), el.scrollLeft));
		}
		el.scrollLeft = left;
		el.scrollTop += creep.current.y;
		show(g);
		creep.current.frame = requestAnimationFrame(() => live.current?.creepOn());
	};

	const finish = (save, released = true) => {
		const g = gesture.current;
		if (!g) return;
		gesture.current = null;
		clearTimeout(g.timer);
		cancelAnimationFrame(creep.current.frame);
		creep.current = { frame: 0, x: 0, y: 0 };
		if (!g.active) return; // a click or a tap: the column or the booking handles it itself
		try {
			scroller.current?.releasePointerCapture(g.pointerId);
		} catch {
			// already released
		}
		if (scroller.current) scroller.current.style.scrollSnapType = "";
		setDrag(null);
		const unquiet = () => {
			window.removeEventListener("pointerup", unquiet, true);
			window.removeEventListener("pointercancel", unquiet, true);
			setTimeout(() => (quietClick.current = false), CLICK_QUIET_MS);
		};
		if (released) unquiet();
		else {
			window.addEventListener("pointerup", unquiet, true);
			window.addEventListener("pointercancel", unquiet, true);
		}
		const at = g.preview;
		if (!save || !at) return;
		const column = columns.find((c) => c.key === at.col);
		if (g.kind === "create") {
			haptics.tap();
			onCreate({ start: atMinute(at.day, at.start), ...(g.moved ? { end: atMinute(at.day, at.end) } : null), staffId: column?.staffId });
			return;
		}
		// The booking as it is now: one deleted or cancelled while it was held is left alone.
		const appointment = byDay.get(g.day)?.find((a) => a.id === g.id) ?? null;
		const sameCol = at.col === g.col;
		if (!appointment || !g.moved || (at.day === g.day && at.start === g.span.start && at.end === g.span.end && sameCol)) return;
		haptics.tap();
		// The mechanic changes only when the booking was dropped in another mechanic's column (Zi).
		onReschedule(appointment, { start: atMinute(at.day, at.start), end: atMinute(at.day, at.end), ...(sameCol || !staffHeader ? null : { staffId: column?.staffId ?? null }) });
	};

	useEffect(() => {
		live.current = { lift, creepOn, finish };
	});

	const onPointerDown = (event) => {
		if (!layout || gesture.current?.active || (event.pointerType === "mouse" && event.button !== 0)) return;
		clearTimeout(gesture.current?.timer);
		gesture.current = null;
		const touchPointer = event.pointerType !== "mouse";
		const press = { pointerId: event.pointerId, touch: touchPointer, from: { x: event.clientX, y: event.clientY }, last: { x: event.clientX, y: event.clientY }, active: false, moved: false, preview: null, timer: 0 };
		const block = event.target.closest("[data-appt]");
		const columnEl = event.target.closest("[data-col]");
		const dayEl = event.target.closest("[data-day]");
		if (!dayEl || !columnEl) return;
		const day = dayEl.dataset.day;
		const { y } = pointAt(event.clientX, event.clientY);
		let g;
		if (block) {
			const appointment = byDay.get(day)?.find((a) => a.id === block.dataset.appt);
			if (!onReschedule || !appointment || !canReschedule(appointment)) return;
			const box = block.getBoundingClientRect();
			const side = box.height < 3 * TOUCH_EDGE_PX ? null : event.clientY <= box.top + TOUCH_EDGE_PX ? "start" : event.clientY >= box.bottom - TOUCH_EDGE_PX ? "end" : null;
			const kind = (touchPointer ? side : event.target.closest("[data-edge]")?.dataset.edge) ?? "move";
			const span = spanOf(appointment, day);
			g = { ...press, kind, id: appointment.id, day, col: columnEl.dataset.col, span, grab: minuteAtY(y) - span.start, look: { kind, id: appointment.id, home: day, toneName: eventTone(appointment, colorBy, lookups), name: vehicleName(lookups.vehicles[appointment.vehicleId]) || lookups.customers[appointment.customerId]?.name || appointment.title } };
		} else if (onCreate && event.target === columnEl) {
			g = { ...press, kind: "create", day, col: columnEl.dataset.col, anchor: minuteAtY(y), look: { kind: "create", id: null, home: day } };
		} else return;
		gesture.current = g;
		if (touchPointer) g.timer = setTimeout(() => live.current?.lift(), HOLD_MS);
	};

	const onPointerMove = (event) => {
		const g = gesture.current;
		if (!g) {
			// Nothing pressed: with a mouse over free time, the line where a booking would begin.
			const columnEl = event.pointerType === "mouse" && !event.buttons && onCreate ? event.target.closest("[data-col]") : null;
			if (!columnEl || event.target !== columnEl || !layout) {
				setSlot(null);
				return;
			}
			const day = columnEl.closest("[data-day]").dataset.day;
			const minute = startAt(minuteAtY(pointAt(event.clientX, event.clientY).y), DAY);
			const col = columnEl.dataset.col;
			setSlot((prev) => (prev && prev.day === day && prev.col === col && prev.minute === minute ? prev : { day, col, minute }));
			return;
		}
		if (event.pointerId !== g.pointerId) return;
		g.last = { x: event.clientX, y: event.clientY };
		const travelled = Math.hypot(event.clientX - g.from.x, event.clientY - g.from.y);
		if (!g.active) {
			if (g.touch) {
				if (travelled > HOLD_SLOP_PX) finish(false); // the finger moved before the hold was up: it is scrolling
			} else if (travelled > DRAG_SLOP_PX) lift();
			return;
		}
		show(g);
		// Near a side of the strip (or its top or bottom), heading for it: the days (or hours) come to the pointer.
		const box = scroller.current.getBoundingClientRect();
		const sx = edgeSpeed(event.clientX - box.left - gutter, box.width - gutter);
		const sy = edgeSpeed(event.clientY - box.top - headerPx, box.height - headerPx, 48, 12);
		creep.current.x = (sx < 0 && event.clientX < g.from.x) || (sx > 0 && event.clientX > g.from.x) ? sx : 0;
		creep.current.y = sy;
		if ((creep.current.x || creep.current.y) && !creep.current.frame) creep.current.frame = requestAnimationFrame(() => live.current?.creepOn());
	};

	const onPointerEnd = (event) => {
		if (event.type === "lostpointercapture" && event.target !== event.currentTarget) return;
		if (gesture.current && event.pointerId === gesture.current.pointerId) finish(event.type === "pointerup");
	};

	// Once something is held, the finger drags it instead of scrolling.
	useEffect(() => {
		const el = scroller.current;
		if (!el) return undefined;
		const hold = (event) => {
			if (gesture.current?.active) event.preventDefault();
		};
		el.addEventListener("touchmove", hold, { passive: false });
		return () => {
			el.removeEventListener("touchmove", hold);
			clearTimeout(gesture.current?.timer);
			cancelAnimationFrame(creep.current.frame);
		};
	}, []);

	// Esc puts a dragged booking back, before it means anything else.
	const dragging = Boolean(drag);
	useEffect(() => {
		if (!dragging) return undefined;
		const onKey = (event) => {
			if (event.key !== "Escape") return;
			event.stopPropagation();
			event.preventDefault();
			live.current?.finish(false, false);
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [dragging]);

	const createAt = useCallback((day, minute, staffId) => onCreate?.({ start: atMinute(day, startAt(minute, DAY)), staffId }), [onCreate]);
	const openBlock = (event) => {
		const block = event.target.closest("[data-appt]");
		if (!block) return;
		const day = block.closest("[data-day]")?.dataset.day;
		const appointment = byDay.get(day)?.find((a) => a.id === block.dataset.appt);
		if (appointment) onOpen(appointment);
	};

	// What to render: the days around the view, and the day a drag began on (a finger's moves go to what it first touched).
	const span = Math.ceil(perView);
	const shown = range ?? (layout ? { first: Math.max(0, indexOfDay(layout, startDay(initialDay)) - span), last: Math.min(layout.days.length - 1, indexOfDay(layout, startDay(initialDay)) + 2 * span) } : null);
	const indices = [];
	if (layout && shown) for (let i = shown.first; i <= shown.last; i++) indices.push(i);
	const homeIndex = drag && layout ? indexOfDay(layout, drag.home) : -1;
	if (homeIndex >= 0 && shown && (homeIndex < shown.first || homeIndex > shown.last)) indices.push(homeIndex);
	const totalWidth = layout?.total ?? 0;
	const bodyHeight = 24 * hourPx;
	const nowAt = new Date().toISOString();
	const bars = showService && layout && shown ? serviceBars(orders, { from: layout.days[shown.first], to: layout.days[shown.last], today, lanes }) : null;
	const colOffset = (key) => (100 / columns.length) * Math.max(0, columns.findIndex((c) => c.key === key));

	return (
		<div
			ref={attach}
			role="group"
			aria-label={`Calendar, ${zi ? "pe zile" : "pe săptămâni"}. Derulează în lateral pentru alte zile.`}
			data-calendar={view}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerEnd}
			onPointerCancel={onPointerEnd}
			onLostPointerCapture={onPointerEnd}
			onPointerLeave={() => setSlot(null)}
			onClickCapture={(event) => {
				setSlot(null);
				if (quietClick.current) {
					quietClick.current = false;
					event.stopPropagation();
					event.preventDefault();
					return;
				}
				openBlock(event);
			}}
			onContextMenu={(event) => gesture.current && event.preventDefault()}
			className="no-scrollbar relative min-h-0 flex-1 overflow-auto overscroll-contain outline-none"
			style={{ scrollPaddingLeft: gutter }}
		>
			{layout && (
				<div className={cn("relative select-none", drag && (drag.kind === "move" ? "cursor-grabbing" : drag.kind === "create" ? "cursor-copy" : "cursor-ns-resize"))} style={{ width: gutter + totalWidth, height: headerPx + bodyHeight }}>
					{/* The headers, as Notion's: one line per day, and the row of cars in service as its "All-day" row. They stick to the top. */}
					<div className={cn("sticky top-0 z-30 bg-background", !showService && "border-b")} style={{ height: headerPx, width: gutter + totalWidth }}>
						<div className="flex" style={{ height: HEAD_PX }}>
							<div className="sticky left-0 z-10 flex shrink-0 items-end justify-between bg-background pr-1.5 pb-1.5 pl-1 text-2xs text-muted-foreground" style={{ width: gutter }}>
								<button type="button" onClick={() => onCreate?.({})} aria-label="Programare nouă" title="Programare nouă" className="flex size-6 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground">
									<Plus className="size-3.5" aria-hidden />
								</button>
								<span className="uppercase" title="Fusul orar">
									{Intl.DateTimeFormat("ro-RO", { timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? ""}
								</span>
							</div>
							<div className="relative flex-1">
								{indices.map((i) => {
									const day = layout.days[i];
									const width = widthAt(layout, i);
									if (layout.slim[i]) {
										return (
											<div key={day} className="absolute bottom-1.5 flex justify-center overflow-hidden text-xs text-muted-foreground tabular-nums" style={{ left: layout.offsets[i], width }} title={`${fmtDate(day, "EEEE, d MMMM")} · închis`}>
												{Number(day.slice(8))}
											</div>
										);
									}
									const isToday = day === today;
									const count = byDay.get(day)?.length ?? 0;
									// While searching: how many of the day's bookings were found ("2 din 5").
									const hits = lookups.match ? (byDay.get(day) ?? []).filter((a) => lookups.match.has(a.id)).length : null;
									return (
										<button
											key={day}
											type="button"
											onClick={() => onPickDay?.(day)}
											className={cn("absolute top-0 flex items-end justify-center gap-1.5 border-l-2 border-foreground/15 pb-2 transition-[color,opacity] duration-300 hover:text-foreground", zi && !drag && day !== focusDay && "opacity-45")}
											style={{ left: layout.offsets[i], width, height: HEAD_PX }}
											aria-label={`${fmtDate(day, "EEEE, d MMMM")}, ${plural(count, "programare", "programări")}${zi ? "" : ". Deschide ziua."}`}
										>
											{/* Centred, but never out of sight: a day only partly in view (Zi's neighbours) keeps its name at the visible edge. */}
											<span className="sticky flex flex-col items-center gap-0.5" style={{ left: gutter + 8, right: 8 }}>
												<span className="flex items-end gap-1.5">
													<span className={cn("text-sm capitalize", isToday ? "text-foreground" : "text-muted-foreground")}>{fmtDate(day, "EEE").replace(".", "")}</span>
													<span className={cn("flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-sm tabular-nums", isToday ? "bg-brand font-semibold text-brand-foreground" : "text-muted-foreground")}>{Number(day.slice(8))}</span>
												</span>
												{/* How many bookings the day has (as shown: the filters apply). */}
												<span data-day-count={count} data-day-hits={hits ?? undefined} className={cn("text-2xs whitespace-nowrap text-muted-foreground tabular-nums", hits != null ? (hits ? "font-semibold text-brand" : "opacity-60") : !count && "opacity-60")}>
													{hits != null ? (hits ? `${hits} din ${count}` : "—") : dayCount(count, width - 16)}
												</span>
											</span>
											{/* A bracket under the name, as wide as the day: the mechanics' columns under it belong to it. */}
											<span aria-hidden className={cn("absolute inset-x-1.5 bottom-0 h-0.5 rounded-full", isToday ? "bg-brand" : "bg-foreground/25")} />
										</button>
									);
								})}
							</div>
						</div>
						{staffHeader && (
							<div className="flex" style={{ height: STAFF_PX }}>
								<div className="sticky left-0 z-10 shrink-0 bg-background" style={{ width: gutter }} />
								<div className="relative flex-1">
									{indices.map((i) =>
										layout.slim[i] ? null : (
											<div key={layout.days[i]} className={cn("absolute top-0 flex border-l-2 border-foreground/15 transition-opacity duration-300", zi && !drag && layout.days[i] !== focusDay && "opacity-45")} style={{ left: layout.offsets[i], width: widthAt(layout, i), height: STAFF_PX }}>
												{/* The day's date at the left of its mechanics' lanes, kept in sight while the day is partly in view. */}
												<span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-[1] flex w-full items-center">
													<span className={cn("sticky rounded bg-background/85 px-1 text-[10px] leading-4 font-semibold capitalize tabular-nums shadow-xs", layout.days[i] === today ? "text-brand" : "text-foreground/80")} style={{ left: gutter + 4 }}>
														{fmtDate(layout.days[i], "EEE").replace(".", "")} {Number(layout.days[i].slice(8))}
													</span>
												</span>
												{columns.map((column) => (
													// The mechanic's colour, over the column it tints; the name opens the mechanic's card.
													<span key={column.key} className={cn("flex min-w-0 flex-1 items-center justify-center border-b-2 px-1", tone(column.color).soft, tone(column.color).border)}>
														<MechanicLabel column={column} day={layout.days[i]} className="max-w-full px-1 py-0.5" />
													</span>
												))}
											</div>
										),
									)}
								</div>
							</div>
						)}
						{/* Cars in service (D15), in the row Notion keeps for all-day events: a bar over the days each one stays. */}
						{showService && (
							<div className="flex border-y" style={{ height: serviceH }}>
								<button
									type="button"
									onClick={() => setServiceOpen(opened ? "closed" : "open")}
									aria-expanded={opened}
									aria-label={opened ? "Mașini în service: arată un singur rând" : "Mașini în service: arată toate"}
									title={opened ? "Arată un singur rând" : "Arată toate mașinile în service"}
									className="sticky left-0 z-10 flex shrink-0 items-start justify-end gap-px bg-background pt-1.5 pr-1 text-right text-[10px] leading-tight tracking-tight whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
									style={{ width: gutter }}
								>
									<span>În service</span>
									<ChevronDown className={cn("mt-px size-2.5 shrink-0 transition-transform", opened && "rotate-180")} aria-hidden />
								</button>
								<div className="relative flex-1">
									{indices.map((i) => (
										<span key={layout.days[i]} aria-hidden className="absolute inset-y-0 border-l-2 border-foreground/15" style={{ left: layout.offsets[i] }} />
									))}
									{bars?.bars.map((bar) => {
										const from = indexOfDay(layout, bar.from);
										const to = indexOfDay(layout, bar.to);
										const stage = WORK_ORDER_STATUS[bar.order.status];
										const car = vehicleName(lookups.vehicles[bar.order.vehicleId]) || `Lucrarea #${bar.order.number}`;
										return (
											<button
												key={bar.order.id}
												type="button"
												data-service={bar.order.id}
												onClick={() => onOpenOrder(bar.order)}
												title={`${car} · ${stage?.label ?? ""}`}
												aria-label={`${car}, în service: ${stage?.label ?? ""}. Deschide lucrarea #${bar.order.number}.`}
												className={cn("absolute flex items-center rounded border text-2xs leading-none", tone(stage?.tone ?? "neutral").block, !bar.open && "opacity-60", lookups.matchOrders && !lookups.matchOrders.has(bar.order.id) && "opacity-15")}
												style={{ left: layout.offsets[from] + 2, width: Math.max(layout.offsets[to + 1] - layout.offsets[from] - 4, 18), top: 4 + bar.lane * LANE_PX, height: LANE_PX - 4 }}
											>
												{/* Sticky inside the bar: a stay that began days ago still says what it is at the left edge. */}
												<span className="sticky max-w-full truncate px-1.5" style={{ left: gutter }}>
													<span className="font-medium">{car}</span> <span className="opacity-75">· {stage?.label}</span>
												</span>
											</button>
										);
									})}
									{bars &&
										[...bars.more].map(([day, count]) =>
											day >= layout.days[0] && day <= layout.days.at(-1) ? (
												<span key={day} className="pointer-events-none absolute bottom-0.5 z-[2] flex justify-end pr-1" style={{ left: layout.offsets[indexOfDay(layout, day)], width: widthAt(layout, indexOfDay(layout, day)) }}>
													<span className="rounded bg-muted px-1 text-[10px] leading-3 font-medium text-muted-foreground shadow-xs" title={`Încă ${count} în service`}>
														+{count}
													</span>
												</span>
											) : null,
										)}
								</div>
							</div>
						)}
					</div>

					{/* The hours stick to the left; the now pill rides on them. */}
					<div className="sticky left-0 z-20 bg-background" style={{ width: gutter, height: bodyHeight }}>
						{Array.from({ length: 23 }, (_, h) => (
							<span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums" style={{ top: (h + 1) * hourPx }}>
								{gutter < 56 ? String(h + 1).padStart(2, "0") : `${String(h + 1).padStart(2, "0")}:00`}
							</span>
						))}
						<NowPill hourPx={hourPx} />
					</div>

					<div className="absolute" style={{ top: headerPx, left: gutter, width: totalWidth, height: bodyHeight }}>
						{indices.map((i) => {
							const day = layout.days[i];
							const list = byDay.get(day) ?? NO_EVENTS;
							const dragHere = drag && list.some((a) => a.id === drag.id) ? drag.id : null;
							const selectedHere = selectedId && list.some((a) => a.id === selectedId) ? selectedId : null;
							return (
								<div key={day} style={{ position: "absolute", left: layout.offsets[i], width: widthAt(layout, i), top: 0, height: bodyHeight }}>
									<DayColumn
										day={day}
										left={0}
										width={widthAt(layout, i)}
										slim={Boolean(layout.slim[i])}
										closed={!openDays.includes(parseISODate(day).getDay())}
										events={list}
										columns={columns}
										keyOf={keyOf}
										hourPx={hourPx}
										openMin={openMin}
										closeMin={closeMin}
										colorBy={colorBy}
										lookups={lookups}
										selectedId={selectedHere}
										dragId={dragHere}
										dim={zi && !drag && day !== focusDay}
										zebra={!zi && i % 2 === 1}
										now={day <= today ? nowAt.slice(0, 16) : null}
										editable={Boolean(onReschedule)}
										onOpen={onOpen}
										onCreateAt={createAt}
									/>
								</div>
							);
						})}
						{slot && !drag && (
							// Where a booking would begin if free time were pressed here.
							<div aria-hidden data-start-line={hhmm(slot.minute)} className="pointer-events-none absolute z-[8] transition-[left,top] duration-200 ease-out motion-reduce:transition-none" style={{ top: yOf(slot.minute, hourPx), left: layout.offsets[indexOfDay(layout, slot.day)] + (widthAt(layout, indexOfDay(layout, slot.day)) * colOffset(slot.col)) / 100, width: widthAt(layout, indexOfDay(layout, slot.day)) / columns.length }}>
								<span className="absolute inset-x-1 h-0.5 -translate-y-1/2 rounded-full bg-foreground" />
								<span className="absolute top-1 left-1 rounded bg-foreground px-1 text-2xs leading-4 font-semibold text-background tabular-nums">{hhmm(slot.minute)}</span>
							</div>
						)}
						{drag && <DragPreview drag={drag} left={layout.offsets[indexOfDay(layout, drag.day)] + (widthAt(layout, indexOfDay(layout, drag.day)) * colOffset(drag.col)) / 100} width={widthAt(layout, indexOfDay(layout, drag.day)) / columns.length} hourPx={hourPx} />}
					</div>
					<div className="absolute inset-x-0" style={{ top: headerPx }}>
						<NowLine layout={layout} today={today} hourPx={hourPx} gutter={gutter} totalWidth={totalWidth} />
					</div>
				</div>
			)}
		</div>
	);
}

/** What a drag would do: a new booking as a dashed slot, a moved or stretched one as itself; its times ride above it. */
function DragPreview({ drag, left, width, hourPx }) {
	const fresh = drag.kind === "create";
	const top = yOf(drag.start, hourPx);
	const height = Math.max(yOf(drag.end, hourPx) - top, 14);
	const range = `${hhmm(drag.start)}–${hhmm(drag.end % (24 * 60) === 0 && drag.end ? 24 * 60 : drag.end)}`;
	const minutes = drag.end - drag.start;
	return (
		<div aria-hidden data-drag={drag.kind} data-range={range} className="pointer-events-none absolute z-[9]" style={{ left: left + 2, width: Math.max(width - 4, 12), top, height }}>
			<div className={cn("flex h-full flex-col overflow-hidden rounded-md px-1.5 py-[3px] text-2xs leading-[15px] shadow-lg", fresh ? "border-2 border-dashed border-brand bg-[color-mix(in_oklch,var(--brand)_14%,var(--card))]" : cn("border ring-2 ring-brand", tone(drag.toneName).block))}>
				<span className="truncate font-semibold">{fresh ? "Programare nouă" : drag.name}</span>
			</div>
			<span className="absolute -top-5 left-0 rounded bg-foreground px-1 text-2xs leading-4 font-semibold whitespace-nowrap text-background tabular-nums">
				{range} · {minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}` : `${minutes} min`}
			</span>
		</div>
	);
}
