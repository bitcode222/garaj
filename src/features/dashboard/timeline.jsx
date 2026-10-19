"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Initials } from "@/components/ds/data";
import { canReschedule } from "@/domain/appointment";
import { addDaysISO, minutesBetween, parseISODate } from "@/domain/dates";
import { fmtHours } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { atMinute, hhmm, minuteOfDay, toMinutes } from "@/features/calendar/utils";
import { BLOCK_PX, HEAD_PX, ROW_PX, TimelineDay, TimelineWeekDay, weekHeight } from "./timeline-day";
import { DRAG_SLOP_PX, HOLD_MS, HOLD_SLOP_PX, drawSpan, edgeSpeed, shiftSpan, startAt, stretchSpan } from "./timeline-drag";
import { fmtLength, focusQuietly, stageClass, visitText } from "./visit-ui";
import {
	DAYS_AHEAD,
	DAYS_BACK,
	HOUR_MIN_PX,
	HOUR_TOUCH_PX,
	READING_POINT,
	WEEK_DAYS,
	WEEK_MIN_PX,
	buildTimeline,
	daysInView,
	indexAt,
	indexOfDay,
	locate,
	maxScroll,
	minuteWithin,
	scrollToKeep,
	scrollToShow,
	stepIndex,
	timelineHours,
	xOf,
} from "./timeline-geometry";

const NO_VISITS = [];
const DAY_COUNT = DAYS_BACK + DAYS_AHEAD + 1;
const WHEEL_IDLE_MS = 150; // a wheel gesture ends after this much silence
const SETTLE_MS = 140; // scrolling has stopped
const CHIP_PX = 44; // Săptămână: a booking's chip, two lines
const TOUCH_EDGE_PX = 22; // touch: holding this close to a booking's side stretches it instead of moving it
const CLICK_QUIET_MS = 350; // the click a browser fires after a drag is not a click

/** A visit's minutes of its day; one that runs past midnight ends with the day. */
function spanOf(visit) {
	const start = minuteOfDay(visit.start);
	const end = minuteOfDay(visit.end) || 24 * 60;
	return { start, end: end <= start ? 24 * 60 : end };
}

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
 * At the Zi zoom the timeline is edited in place (§12): pointing at free time shows
 * a line where a booking would begin; a press dragged from there draws the booking;
 * a booking is moved by its body and stretched by either edge. With a mouse the drag
 * starts after a few pixels; with a finger, after a press and hold (a swipe still
 * scrolls). The preview is drawn here, over the days, so it survives the days that
 * scroll out from under it. `onCreate({ start, end, staffId })` and
 * `onReschedule(appointment, { start, end, staffId })` do the saving.
 *
 * The scroll position never becomes React state: a passive listener reads it once
 * per frame and updates state only when the rendered days or the day in view
 * change. `onView({ day, from, to, todayVisible, settled })` tells the parent
 * what is in view, live while scrolling and once more when it stops. `ref`
 * exposes goTo({ day, minute, align, focusId, reveal }), goToNow() and
 * step(±1, days). The parent remounts it (key) to change the zoom, passing where
 * to open in `initial`.
 */
export function Timeline({ ref, zoom, today, now, settings, visits, staff, customers, vehicles, filter, focus, initial, onView, onOpen, onCreate, onReschedule, onPickDay, onHover }) {
	const week = zoom === "week";
	const wide = useMediaQuery("(min-width: 768px)");
	const scroller = useRef(null);
	const [viewport, setViewport] = useState(0);
	const [view, setView] = useState(null); // { first, last, label }: day indices, set by the scroll listener
	const [drag, setDrag] = useState(null); // what a drag would do, as it is drawn: { kind, id, day, rowKey, start, end, stage, name }
	const [slot, setSlot] = useState(null); // free time under the mouse: { day, rowKey, minute }
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
			// Zi: a day fills the grid, or scrolls inside itself when the grid is too narrow for its hours
			// (a phone, where an hour is wider so a booking can be read and its edges held).
			// Săptămână: six days fill the grid, fewer on a phone.
			dayWidth: week ? Math.max(WEEK_MIN_PX, viewport / WEEK_DAYS) : Math.max(viewport, hourCount * (wide ? HOUR_MIN_PX : HOUR_TOUCH_PX)),
			// Slim: closed, and no booking or walk-in that day. Never today, and never because of the stage filter.
			isSlim: (day) => day !== today && !workDays.includes(parseISODate(day).getDay()) && !visits.visitsByDay.has(day),
		});
	}, [viewport, week, wide, hourCount, today, workDays, visits]);

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
			// The line under the mouse belongs to where the mouse was: the days have moved on.
			setSlot(null);
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

	// ── Editing in place (Zi): draw a booking on free time, move one, stretch one by an edge ──
	// A gesture lives in a ref from the press to the release; only its preview is state. It starts
	// "pending": a mouse turns it into a drag by moving, a finger by holding still (moving first is a scroll).
	const gesture = useRef(null);
	const quietClick = useRef(false);
	const creep = useRef({ frame: 0, speed: 0 }); // the grid scrolling by itself under a drag near its side
	const live = useRef(null); // this render's handlers, for the hold timer and the creep loop

	/** Where the pointer is on the strip: the x in its own coordinates, the day there, the mechanic's row. */
	const pointAt = (clientX, clientY) => {
		const el = scroller.current;
		const box = el.getBoundingClientRect();
		const x = clientX - box.left + el.scrollLeft;
		const row = rows[Math.min(Math.max(Math.floor((clientY - box.top - HEAD_PX) / ROW_PX), 0), rows.length - 1)];
		return { x, index: indexAt(layout, x), row };
	};

	/** What the gesture would do with the pointer where it is now. */
	const previewOf = (g) => {
		const { x, index, row } = pointAt(g.last.x, g.last.y);
		const home = indexOfDay(layout, g.day);
		// A new booking, and a stretched one, stay on their day and their mechanic.
		if (g.kind === "create") return { ...g.look, day: g.day, rowKey: g.rowKey, ...drawSpan(g.anchor, minuteWithin(layout, hours, home, x), hours) };
		if (g.kind !== "move") return { ...g.look, day: g.day, rowKey: g.rowKey, ...stretchSpan(g.span, g.kind, minuteWithin(layout, hours, home, x), hours) };
		// A moved one follows the pointer to another day or mechanic; over a closed day it waits on the last open one.
		const target = layout.slim[index] ? indexOfDay(layout, g.preview?.day ?? g.day) : index;
		return { ...g.look, day: layout.days[target], rowKey: row.key, ...shiftSpan(g.span, minuteWithin(layout, hours, target, x) - g.grab, hours) };
	};

	const show = (g) => {
		const next = previewOf(g);
		const prev = g.preview;
		if (prev && prev.day === next.day && prev.rowKey === next.rowKey && prev.start === next.start && prev.end === next.end) return;
		if (prev) {
			g.moved = true;
			if (g.touch) haptics.selection();
		}
		g.preview = next;
		setDrag(next);
	};

	/** The pending gesture becomes a drag: the pointer is ours until it is released. */
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
		if (!g?.active || !el || !creep.current.speed) {
			creep.current.frame = 0;
			return;
		}
		let left = el.scrollLeft + creep.current.speed;
		if (g.kind !== "move") {
			// A drawn or stretched booking stays on its day, so the grid goes no further than that day's ends.
			const home = indexOfDay(layout, g.day);
			if (creep.current.speed > 0) left = Math.min(left, Math.max(layout.offsets[home + 1] - el.clientWidth, el.scrollLeft));
			else left = Math.max(left, Math.min(layout.offsets[home], el.scrollLeft));
		}
		el.scrollLeft = left;
		show(g);
		creep.current.frame = requestAnimationFrame(() => live.current?.creepOn());
	};

	/** `released` is false when the drag is given up with the pointer still down (Esc): its click, whenever it comes, is not a click. */
	const finish = (save, released = true) => {
		const g = gesture.current;
		if (!g) return;
		gesture.current = null;
		clearTimeout(g.timer);
		cancelAnimationFrame(creep.current.frame);
		creep.current = { frame: 0, speed: 0 };
		if (!g.active) return; // a click or a tap: the row or the booking handles it itself
		try {
			scroller.current?.releasePointerCapture(g.pointerId);
		} catch {
			// already released
		}
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
		const row = rows.find((candidate) => candidate.key === at.rowKey);
		if (g.kind === "create") {
			haptics.tap();
			// Held and let go without drawing: a booking from there, as long as usual.
			onCreate({ start: atMinute(at.day, at.start), ...(g.moved ? { end: atMinute(at.day, at.end) } : null), staffId: row?.staffId });
			return;
		}
		const sameRow = at.rowKey === g.rowKey;
		// The booking as it is now: one that was deleted or cancelled while it was held is left alone.
		const appointment = visits.byId.get(g.visit.id)?.appointment;
		if (!appointment || !g.moved || (at.day === g.day && at.start === g.span.start && at.end === g.span.end && sameRow)) return;
		haptics.tap();
		// The mechanic changes only when the booking was dropped on another mechanic's row.
		onReschedule(appointment, { start: atMinute(at.day, at.start), end: atMinute(at.day, at.end), ...(sameRow || at.rowKey === "all" ? null : { staffId: row?.staffId ?? null }) });
	};

	useEffect(() => {
		live.current = { lift, creepOn, finish };
	});

	const onPointerDown = (event) => {
		if (!layout || gesture.current?.active || (event.pointerType === "mouse" && event.button !== 0)) return;
		// A press whose release never reached us (it ended outside the window) is forgotten here.
		clearTimeout(gesture.current?.timer);
		gesture.current = null;
		const touch = event.pointerType !== "mouse";
		const press = { pointerId: event.pointerId, touch, from: { x: event.clientX, y: event.clientY }, last: { x: event.clientX, y: event.clientY }, active: false, moved: false, preview: null, timer: 0 };
		const block = event.target.closest("[data-appt]");
		const dayEl = event.target.closest("[data-day]");
		if (!dayEl) return;
		const { x } = pointAt(event.clientX, event.clientY);
		const home = indexOfDay(layout, dayEl.dataset.day);
		let g;
		if (block) {
			const visit = visits.byId.get(block.dataset.appt);
			if (!onReschedule || visit?.kind !== "booking" || !canReschedule(visit.appointment)) return;
			// Which part was taken: with a mouse the grips at its sides; under a finger, the side it is nearest to, on a booking wide enough to have sides.
			const box = block.getBoundingClientRect();
			const side = box.width < 3 * TOUCH_EDGE_PX ? null : event.clientX >= box.right - TOUCH_EDGE_PX ? "end" : event.clientX <= box.left + TOUCH_EDGE_PX ? "start" : null;
			const kind = (touch ? side : event.target.closest("[data-edge]")?.dataset.edge) ?? "move";
			const span = spanOf(visit);
			const look = { kind, id: visit.id, home: visit.day, stage: visit.stage, name: visitText(visit, vehicles[visit.vehicleId], customers[visit.customerId]).name };
			g = { ...press, kind, visit, look, day: visit.day, rowKey: rowKeyOf(visit), span, grab: minuteWithin(layout, hours, home, x) - span.start };
		} else if (onCreate && event.target.matches("[data-row]")) {
			g = { ...press, kind: "create", look: { kind: "create", id: null, home: dayEl.dataset.day }, day: dayEl.dataset.day, rowKey: event.target.dataset.row, anchor: minuteWithin(layout, hours, home, x) };
		} else return;
		gesture.current = g;
		if (touch) g.timer = setTimeout(() => live.current?.lift(), HOLD_MS);
	};

	const onPointerMove = (event) => {
		const g = gesture.current;
		if (!g) {
			// Nothing pressed: with a mouse over free time, the line where a booking would begin.
			if (event.pointerType !== "mouse" || event.buttons || !layout || !onCreate || !event.target.matches("[data-row]")) {
				setSlot(null);
				return;
			}
			const day = event.target.closest("[data-day]").dataset.day;
			const rowKey = event.target.dataset.row;
			const minute = startAt(minuteWithin(layout, hours, indexOfDay(layout, day), pointAt(event.clientX, event.clientY).x), hours);
			setSlot((prev) => (prev && prev.day === day && prev.rowKey === rowKey && prev.minute === minute ? prev : { day, rowKey, minute }));
			return;
		}
		if (event.pointerId !== g.pointerId) return;
		g.last = { x: event.clientX, y: event.clientY };
		const travelled = Math.hypot(event.clientX - g.from.x, event.clientY - g.from.y);
		if (!g.active) {
			if (g.touch) {
				// The finger moved before the hold was up: it is scrolling.
				if (travelled > HOLD_SLOP_PX) finish(false);
			} else if (travelled > DRAG_SLOP_PX) {
				lift();
			}
			return;
		}
		show(g);
		// Near a side of the grid, and heading for it, the days come to the pointer.
		const box = scroller.current.getBoundingClientRect();
		const speed = edgeSpeed(event.clientX - box.left, box.width);
		const heading = event.clientX - g.from.x;
		creep.current.speed = (speed < 0 && heading < -DRAG_SLOP_PX) || (speed > 0 && heading > DRAG_SLOP_PX) ? speed : 0;
		if (creep.current.speed && !creep.current.frame) creep.current.frame = requestAnimationFrame(() => live.current?.creepOn());
	};

	const onPointerEnd = (event) => {
		// A finger is captured by what it first touched; when the scroller takes the capture over, that element
		// reports losing it. Only the scroller losing it ends the drag.
		if (event.type === "lostpointercapture" && event.target !== event.currentTarget) return;
		if (gesture.current && event.pointerId === gesture.current.pointerId) finish(event.type === "pointerup");
	};

	// Once something is held, the finger drags it instead of scrolling the days (or the page).
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

	// Esc puts a dragged booking back, before it means anything else on the page.
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

	// Săptămână has nothing to drag.
	const edits = week
		? null
		: {
				onPointerDown,
				onPointerMove,
				onPointerUp: onPointerEnd,
				onPointerCancel: onPointerEnd,
				onLostPointerCapture: onPointerEnd,
				onPointerLeave: () => setSlot(null),
				// A drag never ends in a click on whatever is under the pointer when it is released.
				onClickCapture: (event) => {
					setSlot(null);
					if (!quietClick.current) return;
					quietClick.current = false;
					event.stopPropagation();
					event.preventDefault();
				},
				// A long press must not open the system menu instead of lifting the booking.
				onContextMenu: (event) => gesture.current && event.preventDefault(),
			};

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
	// The day a drag began on stays in the page however far the drag travels: a finger's moves are
	// delivered to the element it first touched, and they stop coming if that element is removed.
	const homeIndex = drag && layout ? indexOfDay(layout, drag.home) : -1;
	if (homeIndex >= 0 && (homeIndex < shown.first || homeIndex > shown.last)) indices.push(homeIndex);
	const labelled = !week && (rows.length > 1 || rows[0].staff != null);
	const inView = layout ? (visits.bookingsByDay.get(layout.days[shown.label]) ?? NO_VISITS) : NO_VISITS;
	const nowAt = now == null ? null : atMinute(today, now);
	const headPx = wide ? 36 : 44;
	const height = week ? weekHeight(headPx, CHIP_PX) : HEAD_PX + rows.length * ROW_PX;
	const rowTop = (key) => HEAD_PX + Math.max(0, rows.findIndex((row) => row.key === key)) * ROW_PX;
	const canEdit = !week && Boolean(onReschedule);

	return (
		<div className="flex border-t" onKeyDown={onKeyDown}>
			{labelled && (
				<div className="z-20 shrink-0 border-r bg-card md:w-44">
					<div className="border-b" style={{ height: HEAD_PX }} />
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
				{...edits}
				// The scroll margins are for goTo's "bring the timeline into view": on a phone it must clear the fixed
				// top bar and tab bar, and leave room for the selected visit's line under it.
				className="no-scrollbar relative min-w-0 flex-1 scroll-mt-[calc(4.5rem+var(--safe-top))] scroll-mb-[calc(var(--tabbar-h)+var(--safe-bottom)+7rem)] overflow-x-auto overflow-y-hidden overscroll-x-contain outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset md:scroll-my-20"
			>
				<div className={cn("relative select-none", drag && (drag.kind === "move" ? "cursor-grabbing" : drag.kind === "create" ? "cursor-copy" : "cursor-ew-resize"))} style={{ width: layout?.total ?? 0, height }}>
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
							// What the clock says about a booking ("în 2 zile", "de 1 zi în service") is written on every day.
							nowAt,
							filter,
							focus,
							customers,
							vehicles,
							onOpen,
							onHover,
						};
						return week ? (
							<TimelineWeekDay key={day} {...common} headPx={headPx} chipPx={CHIP_PX} onPickDay={onPickDay} />
						) : (
							<TimelineDay key={day} {...common} rows={rows} rowKeyOf={rowKeyOf} hours={hours} now={day === today ? now : null} dragId={drag?.id ?? null} canDrag={canEdit} onCreate={onCreate} />
						);
					})}
					{slot && !drag && layout && (
						// Where a booking would begin if free time were pressed here.
						<div aria-hidden data-start-line={hhmm(slot.minute)} className="pointer-events-none absolute z-[8]" style={{ left: xOf(layout, hours, slot.day, slot.minute), top: rowTop(slot.rowKey), height: ROW_PX }}>
							<span className="absolute inset-y-1 left-0 w-0.5 -translate-x-1/2 rounded-full bg-foreground" />
							<span className="absolute top-1 left-1.5 rounded bg-foreground px-1 text-2xs leading-4 font-semibold whitespace-nowrap text-background tabular-nums">{hhmm(slot.minute)}</span>
						</div>
					)}
					{drag && layout && <DragPreview drag={drag} left={xOf(layout, hours, drag.day, drag.start)} right={xOf(layout, hours, drag.day, drag.end)} top={rowTop(drag.rowKey)} />}
				</div>
			</div>
		</div>
	);
}

/**
 * What a drag would do, drawn over the days: a new booking as a dashed slot behind the
 * line that marks where it begins (the line that was under the mouse before the press),
 * a moved or stretched one as itself. The times ride above it, so they can be read
 * however narrow it is and are not under the finger.
 */
function DragPreview({ drag, left, right, top }) {
	const fresh = drag.kind === "create";
	const range = `${hhmm(drag.start)}–${hhmm(drag.end)}`;
	return (
		<div aria-hidden data-drag={drag.kind} data-range={range} className="pointer-events-none absolute z-[9]" style={{ left: left + 1, width: Math.max(right - left - 2, 6), top: top + 4, height: BLOCK_PX }}>
			<div
				className={cn(
					"flex h-full flex-col justify-center overflow-hidden rounded-md text-xs leading-[1.125rem] shadow-lg",
					fresh ? "border-2 border-dashed border-brand bg-[color-mix(in_oklch,var(--brand)_14%,var(--card))] px-2.5" : cn("border px-2 ring-2 ring-brand", stageClass(drag.stage)),
				)}
			>
				<span className="truncate font-semibold">{fresh ? "Programare nouă" : drag.name}</span>
				<span className="truncate tabular-nums opacity-80">{range}</span>
			</div>
			{fresh && <span data-begins className="absolute inset-y-0 -left-px w-0.5 -translate-x-1/2 rounded-full bg-foreground" />}
			<span className="absolute -top-5 left-0 rounded bg-foreground px-1 text-2xs leading-4 font-semibold whitespace-nowrap text-background tabular-nums">
				{range} · {fmtLength(drag.end - drag.start)}
			</span>
		</div>
	);
}

