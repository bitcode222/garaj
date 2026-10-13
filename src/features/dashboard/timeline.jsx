"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Initials } from "@/components/ds/data";
import { addDaysISO, minutesBetween, parseISODate } from "@/domain/dates";
import { fmtHours } from "@/lib/format";
import { useMediaQuery } from "@/lib/hooks";
import { atMinute, minuteOfDay, toMinutes } from "@/features/calendar/utils";
import { AXIS_PX, DAY_LABEL_PX, ROW_PX, TimelineDay, TimelineWeekDay, weekHeight } from "./timeline-day";
import { focusQuietly } from "./visit-ui";
import {
	DAYS_AHEAD,
	DAYS_BACK,
	HOUR_MIN_PX,
	READING_POINT,
	WEEK_DAYS,
	WEEK_MIN_PX,
	buildTimeline,
	daysInView,
	indexOfDay,
	locate,
	maxScroll,
	scrollToKeep,
	scrollToShow,
	stepIndex,
	timelineHours,
} from "./timeline-geometry";

const NO_VISITS = [];
const DAY_COUNT = DAYS_BACK + DAYS_AHEAD + 1;
const WHEEL_IDLE_MS = 150; // a wheel gesture ends after this much silence
const SETTLE_MS = 140; // scrolling has stopped

const clockMinute = () => {
	const clock = new Date();
	return clock.getHours() * 60 + clock.getMinutes();
};

/**
 * The timeline (docs/DASHBOARD-CALENDAR.md): one strip of days, side by side, at
 * one of two zooms. Zi: each day from the first to the last shown hour, a row per
 * mechanic. Săptămână: a narrow column per day with its bookings as chips. It
 * scrolls sideways natively (trackpad, swipe, Shift + wheel); a mouse wheel moved
 * up or down over it scrolls through days too, unless the page was already
 * scrolling when the pointer got here. Only the days in view (plus a few spare)
 * are in the DOM.
 *
 * The scroll position never becomes React state: a passive listener reads it once
 * per frame and updates state only when the rendered days or the day in view
 * change. `onView({ day, from, to, todayVisible, settled })` tells the parent
 * what is in view, live while scrolling and once more when it stops. `ref`
 * exposes goTo({ day, minute, align, focusId, reveal }), goToNow() and
 * step(±1, days). The parent remounts it (key) to change the zoom, passing where
 * to open in `initial`.
 */
export function Timeline({ ref, zoom, today, now, settings, visits, staff, customers, vehicles, filter, focus, initial, onView, onOpen, onCreate, onPickDay, onHover }) {
	const week = zoom === "week";
	const wide = useMediaQuery("(min-width: 768px)");
	const scroller = useRef(null);
	const [viewport, setViewport] = useState(0);
	const [view, setView] = useState(null); // { first, last, label }: day indices, set by the scroll listener
	const workDays = settings.hours.days;
	const open = toMinutes(settings.hours.open);
	const close = toMinutes(settings.hours.close);

	const attach = useCallback((el) => {
		scroller.current = el;
		if (!el) return undefined;
		const resize = new ResizeObserver(() => setViewport(el.clientWidth));
		resize.observe(el);
		return () => {
			resize.disconnect();
			scroller.current = null;
		};
	}, []);

	// Rows and hours are decided once for the whole range, so nothing changes height or width while scrolling:
	// a row per active mechanic (plus "Nealocat" when any booking needs it), the same hours every day.
	const { rows, rowKeyOf, hours } = useMemo(() => {
		const active = new Set(staff.map((s) => s.id));
		const single = staff.length <= 1;
		const keyOf = (visit) => (single ? "all" : active.has(visit.staffId) ? visit.staffId : "none");
		const spans = [];
		let unassigned = false;
		// Bookings and the walk-ins' pins: both need a row and must fit the shown hours.
		for (const list of visits.visitsByDay.values()) {
			for (const visit of list) {
				const from = minuteOfDay(visit.start);
				const to = minuteOfDay(visit.end) || 24 * 60;
				spans.push([from, to <= from ? 24 * 60 : to]);
				if (keyOf(visit) === "none") unassigned = true;
			}
		}
		const list = single ? [{ key: "all", staff: staff[0] ?? null, staffId: staff[0]?.id }] : staff.map((s) => ({ key: s.id, staff: s, staffId: s.id }));
		if (!single && unassigned) list.push({ key: "none", staff: null, staffId: null });
		return { rows: list, rowKeyOf: keyOf, hours: timelineHours({ open, close }, spans) };
	}, [visits, staff, open, close]);

	const hourCount = (hours.end - hours.start) / 60;
	const layout = useMemo(() => {
		if (!viewport) return null;
		return buildTimeline({
			from: addDaysISO(today, -DAYS_BACK),
			count: DAY_COUNT,
			// Zi: a day fills the grid, or scrolls inside itself when the grid is too narrow for its hours.
			// Săptămână: six days fill the grid, fewer on a phone.
			dayWidth: week ? Math.max(WEEK_MIN_PX, viewport / WEEK_DAYS) : Math.max(viewport, hourCount * HOUR_MIN_PX),
			// Slim: closed, and no booking or walk-in that day. Never today, and never because of the stage filter.
			isSlim: (day) => day !== today && !workDays.includes(parseISODate(day).getDay()) && !visits.visitsByDay.has(day),
		});
	}, [viewport, week, hourCount, today, workDays, visits]);

	// Where the view is: the day (and time) it is on, and the geometry it was read in. Kept across
	// resizes and data changes, so the same moment stays in the same place.
	const anchor = useRef(null);
	const positioned = useRef(false);
	// The geometry the scroll listener reads. A ref, set in the same layout effect that moves the scroll
	// position, because the scroll event that follows can arrive before effects re-subscribe: a listener
	// closed over the previous layout would read the new position with the old day widths.
	const geometry = useRef(null);
	const motion = useRef({ frame: 0, index: null }); // a glide in flight, and the day ‹ › is heading for
	const notify = useRef(onView);
	useEffect(() => {
		notify.current = onView;
	});

	useLayoutEffect(() => {
		const el = scroller.current;
		if (!el || !layout) return;
		geometry.current = { layout, hours, today, week };
		const width = el.clientWidth;
		if (!positioned.current) {
			positioned.current = true;
			const start = initial ?? { day: today };
			const minute = start.minute ?? (start.day === today ? clockMinute() : hours.start);
			// Săptămână opens with the day at the left edge; Zi with the time at the reading point.
			el.scrollLeft = scrollToShow(layout, hours, start.day, minute, width, start.align ?? (week ? 0 : READING_POINT));
			if (start.focusId) setTimeout(() => focusQuietly(el.querySelector(`[data-appt="${start.focusId}"]`)), 80);
		} else if (anchor.current) {
			const at = anchor.current;
			const moved = at.dayWidth !== layout.dayWidth || at.viewport !== width || at.offset !== layout.offsets[indexOfDay(layout, at.day)];
			if (moved) el.scrollLeft = week ? scrollToShow(layout, hours, at.day, hours.start, width, 0) : scrollToKeep(layout, hours, at.day, at.minute, width);
		}
		// `initial` and `today` only matter the first time; afterwards the anchor decides.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [layout, hours]);

	// One read of the scroll position per frame; state changes only when the rendered days or the day in view do.
	const ready = Boolean(layout);
	useEffect(() => {
		const el = scroller.current;
		if (!el || !ready) return undefined;
		let frame = 0;
		let timer = 0;
		let told = null;
		const read = () => {
			const { layout: lay, hours: shown, today: day, week: columns } = geometry.current;
			const width = el.clientWidth;
			const range = daysInView(lay, el.scrollLeft, width, columns ? 2 : 1);
			const at = locate(lay, shown, el.scrollLeft, width, columns);
			const todayIndex = indexOfDay(lay, day);
			return { lay, width, range, at, from: lay.days[at.from], to: lay.days[at.to], todayVisible: todayIndex >= range.firstVisible && todayIndex <= range.lastVisible };
		};
		const update = () => {
			frame = 0;
			const { lay, width, range, at, from, to, todayVisible } = read();
			anchor.current = { day: at.day, minute: at.minute, offset: lay.offsets[at.index], dayWidth: lay.dayWidth, viewport: width };
			setView((prev) => (prev && prev.first === range.first && prev.last === range.last && prev.label === at.index ? prev : { first: range.first, last: range.last, label: at.index }));
			if (!told || told.day !== at.day || told.from !== from || told.to !== to || told.todayVisible !== todayVisible) {
				told = { day: at.day, from, to, todayVisible };
				notify.current?.({ ...told, settled: false });
			}
		};
		const settle = () => {
			const { at, from, to, todayVisible } = read();
			notify.current?.({ day: at.day, from, to, todayVisible, settled: true });
		};
		const onScroll = () => {
			if (!frame) frame = requestAnimationFrame(update);
			clearTimeout(timer);
			timer = setTimeout(settle, SETTLE_MS);
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			el.removeEventListener("scroll", onScroll);
			cancelAnimationFrame(frame);
			clearTimeout(timer);
		};
	}, [ready]);

	const stopGlide = useCallback(() => {
		cancelAnimationFrame(motion.current.frame);
		motion.current = { frame: 0, index: null };
	}, []);

	/** Our own eased scroll (same duration and curve in every browser); any input from the user stops it where it is. */
	const glideTo = useCallback((left, done, index = null) => {
		const el = scroller.current;
		if (!el) return;
		cancelAnimationFrame(motion.current.frame);
		const width = el.clientWidth;
		let from = el.scrollLeft;
		if (Math.abs(left - from) < 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			el.scrollLeft = left;
			motion.current = { frame: 0, index: null };
			done?.();
			return;
		}
		// Far away: jump to one screen before the target and glide in from the side it lies on, never through weeks of days.
		if (Math.abs(left - from) > 3 * width) {
			from = left - Math.sign(left - from) * width;
			el.scrollLeft = from;
		}
		const distance = left - from;
		const duration = 350 + 300 * Math.min(1, Math.abs(distance) / (2 * width));
		const began = performance.now();
		const frame = (time) => {
			const t = Math.min(1, Math.max(0, (time - began) / duration));
			el.scrollLeft = from + distance * (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
			if (t < 1) {
				motion.current.frame = requestAnimationFrame(frame);
			} else {
				motion.current = { frame: 0, index: null };
				done?.();
			}
		};
		motion.current = { frame: requestAnimationFrame(frame), index };
	}, []);

	const api = useMemo(() => {
		/** Travel to a day (and time). `reveal` also brings the timeline itself into view on the page (phones). */
		const goTo = ({ day, minute, align = 0.5, focusId, reveal = false }) => {
			const el = scroller.current;
			if (!el || !layout) return;
			if (reveal) el.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
			glideTo(scrollToShow(layout, hours, day, minute ?? hours.start, el.clientWidth, align), () => {
				if (focusId) setTimeout(() => focusQuietly(el.querySelector(`[data-appt="${focusId}"]`)), 60);
			});
		};
		return {
			goTo,
			goToNow: () => goTo(week ? { day: today, align: 0 } : { day: today, minute: clockMinute(), align: READING_POINT }),
			/**
			 * ‹ › and the arrow keys: the start of the day `days` on. Zi counts open days (closed, empty ones are
			 * stepped over); Săptămână counts calendar days. Quick presses add up instead of restarting.
			 */
			step: (direction, days = 1) => {
				const el = scroller.current;
				if (!el || !layout) return;
				const from = motion.current.index ?? locate(layout, hours, el.scrollLeft, el.clientWidth, week).index;
				const index = week ? Math.min(Math.max(from + direction * days, 0), DAY_COUNT - 1) : stepIndex(layout, from, direction, days);
				glideTo(Math.min(layout.offsets[index], maxScroll(layout, el.clientWidth)), null, index);
			},
		};
	}, [layout, hours, today, week, glideTo]);
	useImperativeHandle(ref, () => api, [api]);

	// Wheel: sideways is the browser's own scrolling. Up or down over the timeline also moves through days,
	// but only for a gesture that started here: a page scroll already in flight is never taken over.
	const dayWidth = layout?.dayWidth ?? 0;
	useEffect(() => {
		const el = scroller.current;
		if (!el) return undefined;
		let last = -Infinity;
		let mine = false;
		let target = null;
		let frame = 0;
		const onAnyWheel = (event) => {
			if (event.timeStamp - last > WHEEL_IDLE_MS) mine = el.contains(event.target);
			last = event.timeStamp;
		};
		const ease = () => {
			frame = 0;
			if (target == null) return;
			const gap = target - el.scrollLeft;
			if (Math.abs(gap) < 1.5) {
				el.scrollLeft = target;
				target = null;
				return;
			}
			el.scrollLeft += Math.sign(gap) * Math.max(1, Math.abs(gap) * 0.22);
			frame = requestAnimationFrame(ease);
		};
		const onWheel = (event) => {
			if (!mine || event.ctrlKey || event.metaKey) return;
			stopGlide();
			if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
				target = null;
				return;
			}
			const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? el.clientWidth : 1;
			const delta = event.deltaY * unit;
			const limit = el.scrollWidth - el.clientWidth;
			// At either end of the range the page takes the wheel back.
			if ((delta < 0 && el.scrollLeft <= 0) || (delta > 0 && el.scrollLeft >= limit - 1)) return;
			event.preventDefault();
			if (Math.abs(delta) >= 50) {
				// A mouse-wheel notch: about a quarter of a day in Zi, a day or so in Săptămână, eased so it does not jump.
				target = Math.min(Math.max((target ?? el.scrollLeft) + delta * Math.max(1, dayWidth / 400), 0), limit);
				if (!frame) frame = requestAnimationFrame(ease);
			} else {
				// A trackpad: follow the fingers one to one.
				target = null;
				el.scrollLeft += delta;
			}
		};
		const onGrab = () => {
			target = null;
			stopGlide();
		};
		window.addEventListener("wheel", onAnyWheel, { capture: true, passive: true });
		el.addEventListener("wheel", onWheel, { passive: false });
		el.addEventListener("pointerdown", onGrab);
		el.addEventListener("touchstart", onGrab, { passive: true });
		return () => {
			window.removeEventListener("wheel", onAnyWheel, { capture: true });
			el.removeEventListener("wheel", onWheel);
			el.removeEventListener("pointerdown", onGrab);
			el.removeEventListener("touchstart", onGrab);
			cancelAnimationFrame(frame);
		};
	}, [dayWidth, stopGlide]);

	const onKeyDown = (event) => {
		if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
		if (event.key === "ArrowRight") api.step(1, event.shiftKey ? 7 : 1);
		else if (event.key === "ArrowLeft") api.step(-1, event.shiftKey ? 7 : 1);
		else if (event.key === "Home" || event.key === "t" || event.key === "T") api.goToNow();
		else return;
		event.preventDefault();
	};

	// Until the first scroll event: the day the timeline opens on, and enough neighbours to fill the grid.
	const startIndex = layout ? indexOfDay(layout, (initial ?? { day: today }).day) : 0;
	const shown = view ?? { first: Math.max(0, startIndex - (week ? WEEK_DAYS : 1)), last: Math.min(DAY_COUNT - 1, startIndex + (week ? WEEK_DAYS + 2 : 1)), label: startIndex };
	const indices = [];
	if (layout) for (let i = shown.first; i <= shown.last; i++) indices.push(i);
	const labelled = !week && (rows.length > 1 || rows[0].staff != null);
	const inView = layout ? (visits.bookingsByDay.get(layout.days[shown.label]) ?? NO_VISITS) : NO_VISITS;
	const nowAt = now == null ? null : atMinute(today, now);
	const headPx = wide ? 36 : 44;
	const chipPx = wide ? 28 : 44;
	const height = week ? weekHeight(headPx, chipPx) : DAY_LABEL_PX + AXIS_PX + rows.length * ROW_PX;

	return (
		<div className="flex border-t" onKeyDown={onKeyDown}>
			{labelled && (
				<div className="z-20 shrink-0 border-r bg-card md:w-44">
					<div className="border-b" style={{ height: DAY_LABEL_PX + AXIS_PX }} />
					{rows.map((row) => {
						const minutes = inView.reduce((sum, visit) => (rowKeyOf(visit) === row.key && visit.stage !== "no_show" ? sum + minutesBetween(visit.start, visit.end) : sum), 0);
						return (
							<div key={row.key} className="flex items-center gap-2 border-b px-2 last:border-b-0 md:px-3" style={{ height: ROW_PX }}>
								{row.staff ? (
									<Initials name={row.staff.name} tone={row.staff.color} size="sm" />
								) : (
									<span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed text-2xs text-muted-foreground" title="Nealocat">
										–
									</span>
								)}
								<span className="min-w-0 leading-tight max-md:hidden">
									<span className="block truncate text-xs font-semibold">{row.staff?.name ?? "Nealocat"}</span>
									<span className="block text-2xs text-muted-foreground tabular-nums">{fmtHours(minutes / 60)}</span>
								</span>
							</div>
						);
					})}
				</div>
			)}
			<div
				ref={attach}
				tabIndex={0}
				role="group"
				aria-label={`Programul pe ${week ? "săptămâni" : "zile"}. Săgețile stânga și dreapta schimbă ziua, cu Shift o săptămână, T duce la azi.`}
				data-timeline={zoom}
				// The scroll margins are for goTo's "bring the timeline into view": on a phone it must clear the fixed
				// top bar and tab bar, and leave room for the selected visit's line under it.
				className="no-scrollbar relative min-w-0 flex-1 scroll-mt-[calc(4.5rem+var(--safe-top))] scroll-mb-[calc(var(--tabbar-h)+var(--safe-bottom)+5.5rem)] overflow-x-auto overflow-y-hidden overscroll-x-contain outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset md:scroll-my-20"
			>
				<div className="relative" style={{ width: layout?.total ?? 0, height }}>
					{indices.map((i) => {
						const day = layout.days[i];
						const common = {
							day,
							left: layout.offsets[i],
							width: layout.offsets[i + 1] - layout.offsets[i],
							slim: Boolean(layout.slim[i]),
							isToday: day === today,
							isPast: day < today,
							closed: !workDays.includes(parseISODate(day).getDay()),
							visits: visits.visitsByDay.get(day) ?? NO_VISITS,
							// Only today's day reads the clock, so the minute tick re-renders one day.
							nowAt: day === today ? nowAt : null,
							filter,
							focus,
							customers,
							vehicles,
							onOpen,
							onHover,
						};
						return week ? (
							<TimelineWeekDay key={day} {...common} headPx={headPx} chipPx={chipPx} onPickDay={onPickDay} />
						) : (
							<TimelineDay key={day} {...common} rows={rows} rowKeyOf={rowKeyOf} hours={hours} now={day === today ? now : null} onCreate={onCreate} />
						);
					})}
				</div>
			</div>
		</div>
	);
}
