"use client";

import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Initials } from "@/components/ds/data";
import { canReschedule } from "@/domain/appointment";
import { dayOfInstant, parseISODate } from "@/domain/dates";
import { vehicleName } from "@/domain/vehicle";
import { fmtDate, fmtTime, plural } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { useMediaQuery, useNowMinute } from "@/lib/hooks";
import { APPOINTMENT_STATUS, BOOKING_MARK } from "@/lib/labels";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { DRAG_SLOP_PX, HOLD_MS, HOLD_SLOP_PX, drawSpan, edgeSpeed, shiftSpan, startAt, stretchSpan } from "@/features/dashboard/timeline-drag";
import { centerLeft, dayAtCenter, dayAtLeft, dayWindow, daysInView, indexAt, indexOfDay, keepScroll, leftOf, nearEdge, stepDay, visibleDays, widthAt } from "./calendar-geometry";
import { AlertSign, alertOutline, alertSummary } from "./booking-warnings";
import { MechanicLabel } from "./mechanic-card";
import { atMinute, dayCount, eventTone, hhmm, layoutEvents, minuteOfDay, toMinutes } from "./utils";

const AXIS_PX = 32; // the hours, across the top
const SUBROW_MIN = 56; // Zi: a mechanic's band, at least
const ROW_MIN = 76; // Săptămână: a day's row, at least
const SETTLE_MS = 160;
const CLICK_QUIET_MS = 350;
const TOUCH_EDGE_PX = 16; // touch: holding this close to a booking's start or end stretches it
const DAY = { start: 0, end: 24 * 60 };
const NO_EVENTS = [];
const SHADE = "color-mix(in oklch, var(--muted) 70%, transparent)";
const HATCH = "repeating-linear-gradient(135deg, color-mix(in oklch, var(--muted-foreground) 14%, transparent) 0 1px, transparent 1px 7px)";

function spanOf(appointment, day) {
	const start = minuteOfDay(appointment.start);
	const end = dayOfInstant(appointment.end) !== day ? 24 * 60 : minuteOfDay(appointment.end);
	return { start, end: Math.max(end, start + 15) };
}

const xOf = (minute, hourPx) => (minute / 60) * hourPx;

/** Hour lines across (and fainter half hours), closed hours shaded, a closed day hatched. */
function rowBackground(hourPx, openMin, closeMin, closedDay) {
	const half = hourPx / 2;
	const lines = [
		`repeating-linear-gradient(to right, var(--border) 0 1px, transparent 1px ${hourPx}px)`,
		`repeating-linear-gradient(to right, transparent 0 ${half}px, color-mix(in oklch, var(--border) 45%, transparent) ${half}px ${half + 1}px, transparent ${half + 1}px ${hourPx}px)`,
	];
	const shade = closedDay ? HATCH : `linear-gradient(to right, ${SHADE} 0 ${xOf(openMin, hourPx)}px, transparent ${xOf(openMin, hourPx)}px ${xOf(closeMin, hourPx)}px, ${SHADE} ${xOf(closeMin, hourPx)}px)`;
	return { backgroundImage: [...lines, shade].join(", ") };
}

/**
 * A booking lying along its day: its mark, the time and the car, then the customer when the row is
 * tall enough; the mark (booked, job, done) in the top-left corner, the mechanic's avatar in the bottom-left.
 */
const RowEvent = memo(function RowEvent({ appointment: a, mark = "booking", left, width, top, height, toneName, lookups, past, selected, alert, dragging, movable }) {
	const mechanic = a.staffId ? lookups.staff?.[a.staffId] : null;
	const vehicle = lookups.vehicles[a.vehicleId];
	const customer = lookups.customers[a.customerId];
	const car = vehicleName(vehicle) || customer?.name || a.title || "Programare";
	const time = `${fmtTime(a.start)}–${fmtTime(a.end)}`;
	const Mark = BOOKING_MARK[mark].icon;
	const avatar = mechanic && <Initials name={mechanic.name} tone={mechanic.color} size="sm" className="size-4 shrink-0 text-[8px]" />;
	const second = customer && vehicleName(vehicle) ? customer.name : null;
	// Tall enough for the avatar on a row of its own at the bottom; otherwise it starts the bottom line.
	const roomy = height >= 64;
	return (
		<button
			type="button"
			data-appt={a.id}
			data-match={lookups.match ? (lookups.match.has(a.id) ? "1" : "0") : undefined}
			aria-label={[time, vehicleName(vehicle), customer?.name, a.title, mechanic?.name, APPOINTMENT_STATUS[a.status].label, BOOKING_MARK[mark].label, alertSummary(alert)].filter(Boolean).join(" · ")}
			data-mark={mark}
			className={cn(
				"absolute z-[5] flex flex-col overflow-hidden rounded-md border px-1.5 text-left text-2xs leading-[15px] transition-[box-shadow,opacity] select-none [-webkit-touch-callout:none]",
				height >= 56 ? "justify-start gap-0.5 py-1.5" : "justify-center",
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
			style={{ left: left + 1, width: Math.max(width - 2, 14), top, height }}
		>
			<span className="flex min-w-0 items-center gap-1">
				<Mark aria-hidden className="size-3 shrink-0" />
				<span className="min-w-0 flex-1 truncate">
					{width >= 70 && <span className="tabular-nums opacity-80">{fmtTime(a.start)} </span>}
					<span className="font-semibold">{car}</span>
				</span>
				<AlertSign alert={alert} />
				{/* One line: the avatar at its end. */}
				{height < 38 && avatar}
			</span>
			{height >= 38 && (second || (!roomy && avatar)) && (
				<span className="flex min-w-0 items-center gap-1">
					{!roomy && avatar}
					{second && <span className="truncate opacity-80">{second}</span>}
				</span>
			)}
			{height >= 80 && vehicle?.plate && <span className="truncate font-mono tracking-wide uppercase opacity-70">{vehicle.plate}</span>}
			{roomy && avatar && <span className="mt-auto flex">{avatar}</span>}
			{movable && (
				<>
					<span data-edge="start" aria-hidden className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize pointer-coarse:hidden" />
					<span data-edge="end" aria-hidden className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize pointer-coarse:hidden" />
				</>
			)}
		</button>
	);
});

/** One day as a row: its name stuck to the left, its hours across, a band per mechanic in Zi, its bookings in lanes. */
const DayRow = memo(function DayRow({ day, top, height, slim, closed, isToday, events, columns, keyOf, hourPx, label, dateWidth, openMin, closeMin, colorBy, lookups, selectedId, dragId, now, editable, centered, dim, zebra, onCreateAt, onPickDay }) {
	const width = 24 * hourPx;
	if (slim) {
		return (
			<div data-day={day} data-slim className="absolute flex border-b-2 border-foreground/15" style={{ top, height, width: label + width }} title={`${fmtDate(day, "EEEE, d MMMM")} · închis`}>
				<div className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r bg-background px-2 text-xs text-muted-foreground" style={{ width: label }}>
					<span className="capitalize">{fmtDate(day, "EEE")}</span>
					<span className="font-semibold tabular-nums">{Number(day.slice(8))}</span>
				</div>
				<div style={{ width, ...rowBackground(hourPx, openMin, closeMin, true) }} />
			</div>
		);
	}
	const band = 100 / columns.length;
	// How many bookings the day has, under its name (as shown: the filters apply).
	const count = events.length;
	// While searching: how many of the day's bookings were found ("2 din 5").
	const hits = lookups.match ? events.filter((a) => lookups.match.has(a.id)).length : null;
	const countText = (room, letter) => (hits != null ? (hits ? `${hits} din ${count}` : "—") : dayCount(count, room, letter));
	const countClass = hits != null ? (hits ? "font-semibold text-brand" : "opacity-60") : !count && "opacity-60";
	const counted = plural(count, "programare", "programări");
	return (
		<div data-day={day} data-dim={dim || undefined} className={cn("absolute flex border-b-2 border-foreground/15 transition-opacity duration-300", dim && "opacity-45", zebra && "bg-foreground/[0.035]")} style={{ top, height, width: label + width }}>
			<div className={cn("sticky left-0 z-10 flex shrink-0 border-r bg-background", columns.length > 1 ? "flex-row" : "flex-col")} style={{ width: label }}>
				{columns.length > 1 ? (
					<>
						{/* The day's date, in its own column on the left, as tall as the day and centred in it. */}
						<button
							type="button"
							onClick={() => onPickDay?.(day)}
							aria-label={`${fmtDate(day, "EEEE, d MMMM")}, ${counted}. Deschide ziua.`}
							className="flex shrink-0 flex-col items-center justify-center gap-1 border-r text-center transition-colors hover:bg-accent/50"
							style={{ width: dateWidth }}
						>
							<span className={cn("text-xs capitalize", isToday ? "text-foreground" : "text-muted-foreground")}>{fmtDate(day, "EEE").replace(".", "")}</span>
							<span className={cn("flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-base font-semibold tabular-nums", isToday && "bg-brand text-brand-foreground")}>{Number(day.slice(8))}</span>
							{(!closed || count > 0) && (
								<span data-day-count={count} className={cn("text-[10px] leading-3 whitespace-nowrap text-muted-foreground tabular-nums", countClass)}>
									{countText(dateWidth - 4, 4.6)}
								</span>
							)}
							{closed && <span className="text-[10px] text-muted-foreground">închis</span>}
						</button>
						{/* A band per mechanic: its name beside its band, in its colour, so a booking can fill the band. */}
						<div className="flex min-w-0 flex-1 flex-col">
							{columns.map((column, c) => (
								<div key={column.key} className={cn("relative flex min-h-0 flex-1 flex-col justify-center overflow-hidden pr-1.5 pl-2.5", c > 0 && "border-t border-dashed border-border/70", tone(column.color).soft)}>
									<span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", tone(column.color).solid)} />
									<MechanicLabel column={column} day={day} className="self-start" />
								</div>
							))}
						</div>
					</>
				) : (
					<button
						type="button"
						onClick={() => onPickDay?.(day)}
						aria-label={`${fmtDate(day, "EEEE, d MMMM")}, ${counted}. Deschide ziua.`}
						className="flex h-full flex-col items-start justify-center gap-0.5 px-2 text-left transition-colors hover:bg-accent/50"
					>
						<span className="flex items-center gap-1.5">
							<span className={cn("text-xs capitalize", isToday ? "text-foreground" : "text-muted-foreground")}>{fmtDate(day, "EEE")}</span>
							<span className={cn("flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-sm font-semibold tabular-nums", isToday && "bg-brand text-brand-foreground")}>{Number(day.slice(8))}</span>
						</span>
						{(!closed || count > 0) && (
							<span data-day-count={count} className={cn("text-2xs whitespace-nowrap text-muted-foreground tabular-nums", countClass)}>
								{countText(label - 16)}
							</span>
						)}
						{closed && <span className="text-2xs text-muted-foreground">închis</span>}
						{!closed && day.endsWith("-01") && <span className="text-2xs font-medium text-muted-foreground capitalize">{fmtDate(day, "MMMM")}</span>}
					</button>
				)}
			</div>
			<div className="relative" style={{ width, ...rowBackground(hourPx, openMin, closeMin, closed) }}>
				{columns.map((column, c) => {
					const placed = layoutEvents(events.filter((a) => keyOf(a) === column.key));
					const bandPx = height / columns.length;
					return (
						<div
							key={column.key}
							data-col={column.key}
							role="presentation"
							onClick={(event) => {
								if (event.target !== event.currentTarget) return;
								const rect = event.currentTarget.getBoundingClientRect();
								onCreateAt(day, ((event.clientX - rect.left) / hourPx) * 60, column.staffId);
							}}
							className={cn("absolute inset-x-0 cursor-copy", c > 0 && "border-t border-dashed border-border/70", columns.length > 1 && tone(column.color).soft)}
							style={{ top: `${c * band}%`, height: `${band}%` }}
						>
							{placed.map(({ event: a, lane, lanes }) => {
								const span = spanOf(a, day);
								// Zi: a booking fills its mechanic's band (its name is in the label column). Săptămână: a bar of at most 60 px, in the middle of its lane.
								const named = 0;
								const laneH = (bandPx - 8) / lanes;
								const barH = centered ? Math.max(laneH - 2, 14) : Math.max(Math.min(laneH - 2, 60), 14);
								return (
									<RowEvent
										key={a.id}
										appointment={a}
										mark={lookups.marks?.get(a.id)}
										left={xOf(span.start, hourPx)}
										width={xOf(span.end, hourPx) - xOf(span.start, hourPx)}
										top={4 + named + lane * laneH + (laneH - barH) / 2}
										height={barH}
										toneName={eventTone(a, colorBy, lookups)}
										lookups={lookups}
										past={now != null && a.end < now}
										selected={a.id === selectedId}
										alert={lookups.alerts?.get(a.id) ?? null}
										dragging={a.id === dragId}
										movable={editable && canReschedule(a)}
									/>
								);
							})}
						</div>
					);
				})}
			</div>
		</div>
	);
});

/** Now, standing: faint over every day, bold over today, its time in a brand pill on the hours. */
function NowLine({ layout, today, hourPx, label, totalHeight }) {
	const minute = useNowMinute();
	if (minute == null) return null;
	const x = label + xOf(minute, hourPx);
	const index = layout.days[0] <= today && today <= layout.days.at(-1) ? indexOfDay(layout, today) : -1;
	return (
		<>
			<div aria-hidden className="pointer-events-none absolute z-[7] w-px bg-brand/35" style={{ left: x, top: AXIS_PX, height: totalHeight }} />
			{index >= 0 && !layout.slim[index] && (
				<div aria-hidden className="pointer-events-none absolute z-[8] w-0.5 -translate-x-1/2 bg-brand" style={{ left: x, top: AXIS_PX + layout.offsets[index], height: widthAt(layout, index) }}>
					<span className="absolute -top-1 -left-[3px] size-2 rounded-full bg-brand" />
				</div>
			)}
		</>
	);
}

function NowPill({ hourPx, label }) {
	const minute = useNowMinute();
	if (minute == null) return null;
	return (
		<span aria-hidden className="absolute bottom-1 z-[9] -translate-x-1/2 rounded-md bg-brand px-1 text-2xs leading-4 font-semibold text-brand-foreground tabular-nums" style={{ left: label + xOf(minute, hourPx) }}>
			{hhmm(minute)}
		</span>
	);
}

/**
 * Zi and Săptămână scrolled up and down (the calendar's "Sus–jos" direction): days one under the
 * other without end, settling on a day's edge, the hours across (the shop's open hours fill the
 * width; the closed ones are a sideways scroll away). The same window, re-anchoring, editing in
 * place and API as DayStrip, turned: a booking is drawn, moved and stretched along its row.
 */
export function DayRows({ ref, view, today, settings, byDay, allByDay, columns, keyOf, lookups, colorBy, selectedId, initialDay, onView, onOpen, onCreate, onReschedule, onPickDay }) {
	const touch = useMediaQuery("(pointer: coarse)");
	const scroller = useRef(null);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const [anchor, setAnchor] = useState(initialDay);
	const [range, setRange] = useState(null);
	const [drag, setDrag] = useState(null);
	const [slot, setSlot] = useState(null);
	const [focusDay, setFocusDay] = useState(initialDay); // Zi: the day in the middle, at full strength (the others fade)
	const openMin = toMinutes(settings.hours.open);
	const closeMin = toMinutes(settings.hours.close);
	const openDays = settings.hours.days;
	const narrow = size.width && size.width < 640;
	// With a band per mechanic the label column holds the day's date and, beside it, the mechanics' names.
	const banded = view === "day" && columns.length > 1;
	const dateWidth = narrow ? 44 : 56;
	const label = banded ? (narrow ? 108 : 144) : narrow ? 60 : 92;
	// The open hours fill the width; never narrower than a quarter of an hour can be held.
	const hourPx = size.width ? Math.max(touch ? 64 : 48, (size.width - label) / Math.max(1, Math.ceil((closeMin - openMin) / 60))) : 64;
	const zi = view === "day";
	// Zi: the middle day whole and a share of the ones above and under, less with every mechanic more.
	const perView = zi ? visibleDays("day", 0, columns.length) : 7;
	const rowPx = size.height ? Math.max(zi ? columns.length * SUBROW_MIN : ROW_MIN, Math.floor((size.height - AXIS_PX) / perView)) : ROW_MIN;

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

	const layout = useMemo(() => {
		if (!size.height) return null;
		return dayWindow({ anchor, dayWidth: rowPx, isSlim: (day) => day !== today && !openDays.includes(parseISODate(day).getDay()) && !allByDay.has(day) });
	}, [size.height, rowPx, anchor, today, openDays, allByDay]);

	const geometry = useRef(null);
	const gesture = useRef(null);
	const quietClick = useRef(false);
	const creep = useRef({ frame: 0, x: 0, y: 0 });
	const live = useRef(null);
	const pending = useRef(null);
	const positioned = useRef(false);
	const motion = useRef({ frame: 0, target: null });
	const notify = useRef(onView);
	useEffect(() => {
		notify.current = onView;
	});

	// A week starts with the day asked for (today, when Azi is pressed), as in the sideways strip.
	const startDay = (day) => day;
	const withoutSnap = (el, run) => {
		el.style.scrollSnapType = "none";
		run();
		requestAnimationFrame(() => requestAnimationFrame(() => (el.style.scrollSnapType = "")));
	};

	useLayoutEffect(() => {
		const el = scroller.current;
		if (!el || !layout) return;
		const previous = geometry.current?.layout;
		geometry.current = { layout };
		if (!positioned.current) {
			positioned.current = true;
			withoutSnap(el, () => {
				el.scrollTop = zi ? centerLeft(layout, initialDay, el.clientHeight - AXIS_PX) : leftOf(layout, startDay(initialDay));
				const clock = new Date();
				const minute = initialDay === today ? clock.getHours() * 60 + clock.getMinutes() - 120 : openMin;
				// A little before the hour, so its label is not under the corner.
				el.scrollLeft = Math.max(0, xOf(Math.min(minute, openMin), hourPx) - 28);
			});
			return;
		}
		if (pending.current) {
			const { day } = pending.current;
			pending.current = null;
			withoutSnap(el, () => (el.scrollTop = zi ? centerLeft(layout, day, el.clientHeight - AXIS_PX) : leftOf(layout, day)));
			return;
		}
		if (previous && previous !== layout) {
			const kept = keepScroll(previous, layout, el.scrollTop);
			if (kept != null) withoutSnap(el, () => (el.scrollTop = kept));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [layout]);

	const ready = Boolean(layout);
	useEffect(() => {
		const el = scroller.current;
		if (!el || !ready) return undefined;
		let frame = 0;
		let timer = 0;
		const read = () => {
			const lay = geometry.current.layout;
			const seen = daysInView(lay, el.scrollTop, el.clientHeight - AXIS_PX);
			return { lay, seen, day: zi ? dayAtCenter(lay, el.scrollTop, el.clientHeight - AXIS_PX) : dayAtLeft(lay, el.scrollTop) };
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
			if (!motion.current.frame && !gesture.current?.active && nearEdge(lay, el.scrollTop, el.clientHeight)) setAnchor(day);
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

	const glideTo = useCallback((top, left = null) => {
		const el = scroller.current;
		if (!el) return;
		cancelAnimationFrame(motion.current.frame);
		const from = { x: el.scrollLeft, y: el.scrollTop };
		const to = { x: left ?? from.x, y: top };
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || (Math.abs(to.x - from.x) < 1 && Math.abs(to.y - from.y) < 1)) {
			withoutSnap(el, () => {
				el.scrollLeft = to.x;
				el.scrollTop = to.y;
			});
			return;
		}
		el.style.scrollSnapType = "none";
		const height = el.clientHeight;
		if (Math.abs(to.y - from.y) > 3 * height) {
			from.y = to.y - Math.sign(to.y - from.y) * height;
			el.scrollTop = from.y;
		}
		const duration = 320 + 260 * Math.min(1, Math.abs(to.y - from.y) / (2 * height));
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
		motion.current = { frame: requestAnimationFrame(tick), target: top };
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

	useImperativeHandle(
		ref,
		() => {
			const goTo = (day, { minute = null } = {}) => {
				const el = scroller.current;
				if (!el || !layout) return;
				const target = startDay(day);
				const left = minute == null ? null : Math.max(0, xOf(minute - 120, hourPx));
				if (target < layout.days[45] || target > layout.days.at(-46)) {
					pending.current = { day: target };
					setAnchor(target);
					if (left != null) el.scrollLeft = left;
					return;
				}
				glideTo(zi ? centerLeft(layout, target, el.clientHeight - AXIS_PX) : leftOf(layout, target), left);
			};
			return {
				goTo,
				step: (direction) => {
					const el = scroller.current;
					if (!el || !layout) return;
					const at = motion.current.target ?? el.scrollTop;
					const from = zi ? dayAtCenter(layout, at, el.clientHeight - AXIS_PX) : dayAtLeft(layout, at);
					goTo(stepDay(layout, from, view, direction));
				},
				today: () => {
					const clock = new Date();
					goTo(today, { minute: clock.getHours() * 60 + clock.getMinutes() });
				},
			};
		},
		[layout, view, today, hourPx, glideTo, zi],
	);

	// ── editing in place, along the rows ──
	const pointAt = (clientX, clientY) => {
		const el = scroller.current;
		const box = el.getBoundingClientRect();
		const x = clientX - box.left + el.scrollLeft - label;
		const y = clientY - box.top + el.scrollTop - AXIS_PX;
		const index = indexAt(layout, Math.max(0, y));
		const fraction = Math.min(Math.max((y - layout.offsets[index]) / widthAt(layout, index), 0), 0.999);
		return { x, y, index, column: columns[Math.floor(fraction * columns.length)] };
	};
	const minuteAtX = (x) => Math.min(Math.max((x / hourPx) * 60, 0), 24 * 60);

	const previewOf = (g) => {
		const { x, index, column } = pointAt(g.last.x, g.last.y);
		const minute = minuteAtX(x);
		if (g.kind === "create") return { ...g.look, day: g.day, col: g.col, ...drawSpan(g.anchor, minute, DAY) };
		if (g.kind !== "move") return { ...g.look, day: g.day, col: g.col, ...stretchSpan(g.span, g.kind, minute, DAY) };
		const day = layout.slim[index] ? (g.preview?.day ?? g.day) : layout.days[index];
		return { ...g.look, day, col: zi && columns.length > 1 ? column.key : g.col, ...shiftSpan(g.span, minute - g.grab, DAY) };
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
			// the pointer is already gone
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
		let top = el.scrollTop + creep.current.y;
		if (g.kind !== "move") {
			const home = indexOfDay(layout, g.day);
			top = Math.min(Math.max(top, Math.min(layout.offsets[home], el.scrollTop)), Math.max(layout.offsets[home + 1] - (el.clientHeight - AXIS_PX), el.scrollTop));
		}
		el.scrollTop = top;
		el.scrollLeft += creep.current.x;
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
		if (!g.active) return;
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
		const appointment = byDay.get(g.day)?.find((a) => a.id === g.id) ?? null;
		const sameCol = at.col === g.col;
		if (!appointment || !g.moved || (at.day === g.day && at.start === g.span.start && at.end === g.span.end && sameCol)) return;
		haptics.tap();
		// The mechanic changes only when the booking was dropped in another mechanic's band (Zi).
		onReschedule(appointment, { start: atMinute(at.day, at.start), end: atMinute(at.day, at.end), ...(sameCol || !(zi && columns.length > 1) ? null : { staffId: column?.staffId ?? null }) });
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
		const { x } = pointAt(event.clientX, event.clientY);
		let g;
		if (block) {
			const appointment = byDay.get(day)?.find((a) => a.id === block.dataset.appt);
			if (!onReschedule || !appointment || !canReschedule(appointment)) return;
			const box = block.getBoundingClientRect();
			const side = box.width < 3 * TOUCH_EDGE_PX ? null : event.clientX <= box.left + TOUCH_EDGE_PX ? "start" : event.clientX >= box.right - TOUCH_EDGE_PX ? "end" : null;
			const kind = (touchPointer ? side : event.target.closest("[data-edge]")?.dataset.edge) ?? "move";
			const span = spanOf(appointment, day);
			g = { ...press, kind, id: appointment.id, day, col: columnEl.dataset.col, span, grab: minuteAtX(x) - span.start, look: { kind, id: appointment.id, home: day, toneName: eventTone(appointment, colorBy, lookups), name: vehicleName(lookups.vehicles[appointment.vehicleId]) || lookups.customers[appointment.customerId]?.name || appointment.title } };
		} else if (onCreate && event.target === columnEl) {
			g = { ...press, kind: "create", day, col: columnEl.dataset.col, anchor: minuteAtX(x), look: { kind: "create", id: null, home: day } };
		} else return;
		gesture.current = g;
		if (touchPointer) g.timer = setTimeout(() => live.current?.lift(), HOLD_MS);
	};

	const onPointerMove = (event) => {
		const g = gesture.current;
		if (!g) {
			const columnEl = event.pointerType === "mouse" && !event.buttons && onCreate ? event.target.closest("[data-col]") : null;
			if (!columnEl || event.target !== columnEl || !layout) {
				setSlot(null);
				return;
			}
			const day = columnEl.closest("[data-day]").dataset.day;
			const minute = startAt(minuteAtX(pointAt(event.clientX, event.clientY).x), DAY);
			const col = columnEl.dataset.col;
			setSlot((prev) => (prev && prev.day === day && prev.col === col && prev.minute === minute ? prev : { day, col, minute }));
			return;
		}
		if (event.pointerId !== g.pointerId) return;
		g.last = { x: event.clientX, y: event.clientY };
		const travelled = Math.hypot(event.clientX - g.from.x, event.clientY - g.from.y);
		if (!g.active) {
			if (g.touch) {
				if (travelled > HOLD_SLOP_PX) finish(false);
			} else if (travelled > DRAG_SLOP_PX) lift();
			return;
		}
		show(g);
		const box = scroller.current.getBoundingClientRect();
		const sy = edgeSpeed(event.clientY - box.top - AXIS_PX, box.height - AXIS_PX);
		const sx = edgeSpeed(event.clientX - box.left - label, box.width - label, 48, 12);
		creep.current.y = (sy < 0 && event.clientY < g.from.y) || (sy > 0 && event.clientY > g.from.y) ? sy : 0;
		creep.current.x = sx;
		if ((creep.current.x || creep.current.y) && !creep.current.frame) creep.current.frame = requestAnimationFrame(() => live.current?.creepOn());
	};

	const onPointerEnd = (event) => {
		if (event.type === "lostpointercapture" && event.target !== event.currentTarget) return;
		if (gesture.current && event.pointerId === gesture.current.pointerId) finish(event.type === "pointerup");
	};

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

	const span = Math.ceil(perView);
	const shown = range ?? (layout ? { first: Math.max(0, indexOfDay(layout, startDay(initialDay)) - span), last: Math.min(layout.days.length - 1, indexOfDay(layout, startDay(initialDay)) + 2 * span) } : null);
	const indices = [];
	if (layout && shown) for (let i = shown.first; i <= shown.last; i++) indices.push(i);
	const homeIndex = drag && layout ? indexOfDay(layout, drag.home) : -1;
	if (homeIndex >= 0 && shown && (homeIndex < shown.first || homeIndex > shown.last)) indices.push(homeIndex);
	const timeWidth = 24 * hourPx;
	const totalHeight = layout?.total ?? 0;
	const nowAt = new Date().toISOString().slice(0, 16);
	const bandOf = (key) => Math.max(0, columns.findIndex((c) => c.key === key));
	const zone = Intl.DateTimeFormat("ro-RO", { timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? "";

	return (
		<div
			ref={attach}
			role="group"
			aria-label={`Calendar, ${view === "day" ? "pe zile" : "pe săptămâni"}, de sus în jos. Derulează în sus și în jos pentru alte zile.`}
			data-calendar={view}
			data-direction="vertical"
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
			style={{ scrollPaddingTop: AXIS_PX }}
		>
			{layout && (
				<div className={cn("relative select-none", drag && (drag.kind === "move" ? "cursor-grabbing" : drag.kind === "create" ? "cursor-copy" : "cursor-ew-resize"))} style={{ width: label + timeWidth, height: AXIS_PX + totalHeight }}>
					{/* The hours across the top: they stick; the corner sticks to the left too. */}
					<div className="sticky top-0 z-30 flex border-b bg-background/95 backdrop-blur" style={{ height: AXIS_PX, width: label + timeWidth }}>
						<div className="sticky left-0 z-10 flex shrink-0 items-center justify-center border-r bg-background/95 text-2xs text-muted-foreground uppercase backdrop-blur" style={{ width: label }} title="Fusul orar">
							{zone}
						</div>
						<div className="relative" style={{ width: timeWidth }}>
							{Array.from({ length: 23 }, (_, h) => (
								<span key={h} className="absolute top-2 -translate-x-1/2 text-[10px] text-muted-foreground tabular-nums" style={{ left: (h + 1) * hourPx }}>
									{String(h + 1).padStart(2, "0")}:00
								</span>
							))}
						</div>
						<NowPill hourPx={hourPx} label={label} />
					</div>
					{indices.map((i) => {
						const day = layout.days[i];
						const list = byDay.get(day) ?? NO_EVENTS;
						return (
							<DayRow
								key={day}
								day={day}
								top={AXIS_PX + layout.offsets[i]}
								height={widthAt(layout, i)}
								slim={Boolean(layout.slim[i])}
								closed={!openDays.includes(parseISODate(day).getDay())}
								isToday={day === today}
								dim={zi && !drag && day !== focusDay}
								zebra={!zi && i % 2 === 1}
								events={list}
								columns={columns}
								keyOf={keyOf}
								hourPx={hourPx}
								label={label}
								dateWidth={dateWidth}
								openMin={openMin}
								closeMin={closeMin}
								colorBy={colorBy}
								lookups={lookups}
								selectedId={selectedId && list.some((a) => a.id === selectedId) ? selectedId : null}
								dragId={drag && list.some((a) => a.id === drag.id) ? drag.id : null}
								now={day <= today ? nowAt : null}
								editable={Boolean(onReschedule)}
								centered={zi}
								onCreateAt={createAt}
								onPickDay={view === "day" ? null : onPickDay}
							/>
						);
					})}
					{slot && !drag && (
						<div aria-hidden data-start-line={hhmm(slot.minute)} className="pointer-events-none absolute z-[8] transition-[left,top] duration-200 ease-out motion-reduce:transition-none" style={{ left: label + xOf(slot.minute, hourPx), top: AXIS_PX + layout.offsets[indexOfDay(layout, slot.day)] + (widthAt(layout, indexOfDay(layout, slot.day)) * bandOf(slot.col)) / columns.length, height: widthAt(layout, indexOfDay(layout, slot.day)) / columns.length }}>
							<span className="absolute inset-y-1 left-0 w-0.5 -translate-x-1/2 rounded-full bg-foreground" />
							<span className="absolute top-1 left-1.5 rounded bg-foreground px-1 text-2xs leading-4 font-semibold text-background tabular-nums">{hhmm(slot.minute)}</span>
						</div>
					)}
					{drag && <RowDragPreview drag={drag} left={label + xOf(drag.start, hourPx)} right={label + xOf(drag.end, hourPx)} top={AXIS_PX + layout.offsets[indexOfDay(layout, drag.day)] + (widthAt(layout, indexOfDay(layout, drag.day)) * bandOf(drag.col)) / columns.length} height={widthAt(layout, indexOfDay(layout, drag.day)) / columns.length} />}
					<NowLine layout={layout} today={today} hourPx={hourPx} label={label} totalHeight={totalHeight} />
				</div>
			)}
		</div>
	);
}

function RowDragPreview({ drag, left, right, top, height }) {
	const fresh = drag.kind === "create";
	const range = `${hhmm(drag.start)}–${hhmm(drag.end)}`;
	const minutes = drag.end - drag.start;
	return (
		<div aria-hidden data-drag={drag.kind} data-range={range} className="pointer-events-none absolute z-[9]" style={{ left: left + 1, width: Math.max(right - left - 2, 12), top: top + 6, height: Math.max(height - 12, 16) }}>
			<div className={cn("flex h-full items-center overflow-hidden rounded-md px-1.5 text-2xs shadow-lg", fresh ? "border-2 border-dashed border-brand bg-[color-mix(in_oklch,var(--brand)_14%,var(--card))]" : cn("border ring-2 ring-brand", tone(drag.toneName).block))}>
				<span className="truncate font-semibold">{fresh ? "Programare nouă" : drag.name}</span>
			</div>
			<span className="absolute -top-5 left-0 rounded bg-foreground px-1 text-2xs leading-4 font-semibold whitespace-nowrap text-background tabular-nums">
				{range} · {minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}` : `${minutes} min`}
			</span>
		</div>
	);
}
