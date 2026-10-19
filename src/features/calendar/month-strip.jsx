"use client";

import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Initials } from "@/components/ds/data";
import { addDaysISO, parseISODate } from "@/domain/dates";
import { vehicleName } from "@/domain/vehicle";
import { fmtDate, fmtTime } from "@/lib/format";
import { APPOINTMENT_STATUS } from "@/lib/labels";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { monthInView, rowOfMonth, weekIndexOf, weekWindow, weeksNearEdge } from "./calendar-geometry";
import { atMinute, eventTone, toMinutes } from "./utils";

const WEEKDAYS = ["Lun", "Mar", "Mie", "Joi", "Vin", "Sâm", "Dum"];
const HEAD_PX = 32;
const CHIP_PX = 20;
const SETTLE_MS = 160;
const NO_EVENTS = [];

/** One week: seven days, each with its first bookings as chips and "+N" for the rest. Memoised. */
export const WeekRow = memo(function WeekRow({ monday, top, height, month, today, byDay, openDays, colorBy, lookups, selectedId, onOpen, onPickDay, onCreateOn }) {
	const fits = Math.max(1, Math.floor((height - 30) / CHIP_PX));
	return (
		<div className="absolute inset-x-0 grid grid-cols-7 border-b" style={{ top, height }}>
			{Array.from({ length: 7 }, (_, d) => {
				const day = addDaysISO(monday, d);
				const list = byDay.get(day) ?? NO_EVENTS;
				const first = day.endsWith("-01");
				const away = day.slice(0, 7) !== month;
				const closed = !openDays.includes(parseISODate(day).getDay());
				const shown = list.length > fits ? list.slice(0, fits - 1) : list;
				return (
					<div
						key={day}
						data-day={day}
						role="presentation"
						onClick={(event) => event.target === event.currentTarget && onCreateOn(day)}
						className={cn("relative flex min-w-0 cursor-copy flex-col gap-0.5 border-l p-1 first:border-l-0", closed && "bg-muted/40", away && "bg-muted/20")}
					>
						<button
							type="button"
							onClick={() => onPickDay(day)}
							aria-label={`${fmtDate(day, "EEEE, d MMMM")}: ${list.length} programări. Deschide ziua.`}
							className={cn("self-start rounded-md px-1.5 text-xs leading-6 tabular-nums transition-colors hover:bg-accent", away ? "text-muted-foreground/70" : "text-foreground", first && "font-semibold", day === today && "bg-brand font-semibold text-brand-foreground hover:bg-brand")}
						>
							{first ? fmtDate(day, "d MMM") : Number(day.slice(8))}
						</button>
						{shown.map((a) => {
							const car = vehicleName(lookups.vehicles[a.vehicleId]) || lookups.customers[a.customerId]?.name || a.title;
							return (
								<button
									key={a.id}
									type="button"
									data-appt={a.id}
									onClick={() => onOpen(a)}
									title={`${fmtTime(a.start)}–${fmtTime(a.end)} · ${car}`}
									aria-label={`${fmtTime(a.start)}–${fmtTime(a.end)} · ${car} · ${APPOINTMENT_STATUS[a.status].label}`}
									className={cn(
										"flex h-[18px] min-w-0 shrink-0 items-center gap-1 rounded border px-1 text-left text-2xs leading-none",
										tone(eventTone(a, colorBy, lookups)).block,
										a.status === "scheduled" && "border-dashed",
										(a.status === "no_show" || a.status === "cancelled") && "line-through opacity-50",
										a.id === selectedId && "ring-2 ring-brand",
										away && "opacity-70",
									)}
								>
									{lookups.staff?.[a.staffId] && <Initials name={lookups.staff[a.staffId].name} tone={lookups.staff[a.staffId].color} size="sm" className="size-3 shrink-0 text-[6px]" />}
									<span className="shrink-0 tabular-nums opacity-80">{fmtTime(a.start)}</span>
									<span className="truncate font-medium">{car}</span>
								</button>
							);
						})}
						{list.length > shown.length && (
							<button type="button" onClick={() => onPickDay(day)} className="self-start rounded px-1 text-2xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
								+{list.length - shown.length} încă
							</button>
						)}
					</div>
				);
			})}
		</div>
	);
});

/**
 * Lună (docs/APPOINTMENTS-AND-NAV.md D12): weeks one under the other without end, settling on a
 * week's edge. The month most of the visible days belong to is the title; the other months'
 * days are dimmed; the first of a month says its month. A day's number opens it in Zi, an
 * empty spot books on it at the opening hour. `ref` exposes goTo(day), step(±1) and today().
 */
export function MonthStrip({ ref, today, settings, byDay, lookups, colorBy, selectedId, initialDay, onView, onOpen, onPickDay, onCreate }) {
	const scroller = useRef(null);
	const [height, setHeight] = useState(0);
	const [anchor, setAnchor] = useState(initialDay);
	const [view, setView] = useState(null); // { first, last, month }
	const openDays = settings.hours.days;
	const openMin = toMinutes(settings.hours.open);
	const rows = height ? Math.max(96, Math.floor((height - HEAD_PX) / 5)) : 120;
	const window_ = useMemo(() => weekWindow(anchor), [anchor]);
	const geometry = useRef(null);
	const positioned = useRef(false);
	const pending = useRef(null);
	const motion = useRef(0);
	const notify = useRef(onView);
	useEffect(() => {
		notify.current = onView;
	});

	const attach = useCallback((el) => {
		scroller.current = el;
		if (!el) return undefined;
		const resize = new ResizeObserver(() => setHeight(el.clientHeight));
		resize.observe(el);
		return () => {
			resize.disconnect();
			scroller.current = null;
		};
	}, []);

	const withoutSnap = (el, run) => {
		el.style.scrollSnapType = "none";
		run();
		requestAnimationFrame(() => requestAnimationFrame(() => (el.style.scrollSnapType = "")));
	};

	// Keep the week at the top in place across a moved window or a new row height.
	useLayoutEffect(() => {
		const el = scroller.current;
		if (!el || !height) return;
		const previous = geometry.current;
		geometry.current = { window: window_, rows };
		if (!positioned.current) {
			positioned.current = true;
			withoutSnap(el, () => (el.scrollTop = rowOfMonth(window_, initialDay.slice(0, 7)) * rows));
			return;
		}
		if (pending.current) {
			const target = pending.current;
			pending.current = null;
			withoutSnap(el, () => (el.scrollTop = weekIndexOf(window_, target) * rows));
			return;
		}
		if (previous && (previous.window !== window_ || previous.rows !== rows)) {
			const index = Math.floor(el.scrollTop / previous.rows);
			const into = (el.scrollTop - index * previous.rows) / previous.rows;
			const monday = previous.window.mondays[Math.min(index, previous.window.mondays.length - 1)];
			withoutSnap(el, () => (el.scrollTop = (weekIndexOf(window_, monday) + into) * rows));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [window_, rows, height]);

	useEffect(() => {
		const el = scroller.current;
		if (!el || !height) return undefined;
		let frame = 0;
		let timer = 0;
		const read = () => {
			const { window: w, rows: r } = geometry.current;
			const top = Math.max(0, el.scrollTop);
			const first = Math.floor(top / r);
			const last = Math.min(w.mondays.length - 1, Math.floor((top + el.clientHeight - HEAD_PX - 1) / r));
			return { w, r, first, last, month: monthInView(w, top, r, el.clientHeight - HEAD_PX) };
		};
		const update = () => {
			frame = 0;
			const { w, first, last, month } = read();
			setView((prev) => (prev && prev.first === first && prev.last === last && prev.month === month ? prev : { first, last, month }));
			notify.current?.({ month, day: `${month}-01`, from: w.mondays[first], to: addDaysISO(w.mondays[last], 6), settled: false });
		};
		const settle = () => {
			const { w, r, first, last, month } = read();
			notify.current?.({ month, day: `${month}-01`, from: w.mondays[first], to: addDaysISO(w.mondays[last], 6), settled: true });
			if (!motion.current && weeksNearEdge(w, el.scrollTop, r, el.clientHeight)) setAnchor(w.mondays[first]);
		};
		const onScroll = () => {
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
	}, [height, window_, rows]);

	const glideTo = useCallback((top) => {
		const el = scroller.current;
		if (!el) return;
		cancelAnimationFrame(motion.current);
		let from = el.scrollTop;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || Math.abs(top - from) < 1) {
			withoutSnap(el, () => (el.scrollTop = top));
			return;
		}
		el.style.scrollSnapType = "none";
		if (Math.abs(top - from) > 3 * el.clientHeight) {
			from = top - Math.sign(top - from) * el.clientHeight;
			el.scrollTop = from;
		}
		const began = performance.now();
		const duration = 380;
		const tick = (time) => {
			const t = Math.min(1, (time - began) / duration);
			el.scrollTop = from + (top - from) * (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
			if (t < 1) motion.current = requestAnimationFrame(tick);
			else {
				motion.current = 0;
				requestAnimationFrame(() => (el.style.scrollSnapType = ""));
			}
		};
		motion.current = requestAnimationFrame(tick);
	}, []);

	const shownMonth = view?.month ?? initialDay.slice(0, 7);
	useImperativeHandle(
		ref,
		() => {
			const goTo = (day) => {
				const index = weekIndexOf(window_, day);
				// Near the ends of the window (or past them): the window moves there first.
				if (index < 8 || index > window_.mondays.length - 9) {
					pending.current = day;
					setAnchor(day);
					return;
				}
				glideTo(index * rows);
			};
			return {
				goTo: (day) => goTo(`${day.slice(0, 7)}-01`),
				step: (direction) => {
					const next = parseISODate(`${shownMonth}-01`);
					next.setMonth(next.getMonth() + direction);
					goTo(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`);
				},
				today: () => goTo(`${today.slice(0, 7)}-01`),
			};
		},
		[window_, rows, shownMonth, today, glideTo],
	);

	const month = shownMonth;
	const first = Math.max(0, (view?.first ?? rowOfMonth(window_, initialDay.slice(0, 7))) - 3);
	const last = Math.min(window_.mondays.length - 1, (view?.last ?? first + 6) + 3);
	const createOn = useCallback((day) => onCreate({ start: atMinute(day, openMin) }), [onCreate, openMin]);
	const weeks = [];
	for (let i = first; i <= last; i++) weeks.push(i);

	return (
		<div ref={attach} role="group" aria-label="Calendar pe luni. Derulează în sus și în jos pentru alte săptămâni." data-calendar="month" className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
			<div className="sticky top-0 z-10 grid grid-cols-7 border-b bg-background/95 text-2xs font-medium text-muted-foreground backdrop-blur" style={{ height: HEAD_PX }}>
				{WEEKDAYS.map((name) => (
					<span key={name} className="flex items-center px-2.5">
						{name}
					</span>
				))}
			</div>
			<div className="relative" style={{ height: window_.mondays.length * rows }}>
				{weeks.map((i) => (
					<WeekRow
						key={window_.mondays[i]}
						monday={window_.mondays[i]}
						top={i * rows}
						height={rows}
						month={month}
						today={today}
						byDay={byDay}
						openDays={openDays}
						colorBy={colorBy}
						lookups={lookups}
						selectedId={selectedId}
						onOpen={onOpen}
						onPickDay={onPickDay}
						onCreateOn={createOn}
					/>
				))}
			</div>
		</div>
	);
}
