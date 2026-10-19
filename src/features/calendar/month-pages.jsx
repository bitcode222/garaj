"use client";

import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { monthIndexOf, monthWindow } from "./calendar-geometry";
import { WeekRow } from "./month-strip";
import { atMinute, monthGrid, toMinutes } from "./utils";

const WEEKDAYS = ["Lun", "Mar", "Mie", "Joi", "Vin", "Sâm", "Dum"];
const HEAD_PX = 32;
const SETTLE_MS = 160;
const EDGE_MONTHS = 4;

/** One month as a page: its weekdays and its six weeks (the days of the months around it dimmed). */
const MonthPage = memo(function MonthPage({ month, left, width, height, today, byDay, openDays, colorBy, lookups, selectedId, onOpen, onPickDay, onCreateOn }) {
	const days = monthGrid(`${month}-01`);
	const rows = (height - HEAD_PX) / 6;
	return (
		<div data-month={month} className="absolute top-0 [scroll-snap-align:start]" style={{ left, width, height }}>
			<div className="grid grid-cols-7 border-b text-2xs font-medium text-muted-foreground" style={{ height: HEAD_PX }}>
				{WEEKDAYS.map((name) => (
					<span key={name} className="flex items-center px-2.5">
						{name}
					</span>
				))}
			</div>
			<div className="relative" style={{ height: height - HEAD_PX }}>
				{Array.from({ length: 6 }, (_, week) => (
					<WeekRow
						key={days[week * 7]}
						monday={days[week * 7]}
						top={week * rows}
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
						onCreateOn={onCreateOn}
					/>
				))}
			</div>
		</div>
	);
});

/**
 * Lună scrolled sideways (the calendar's "Stânga–dreapta" direction): months side by side, one
 * per screen, settling on a month. A wheel turned up or down moves a month too (nothing else
 * scrolls here). The window of months moves around the one in view near its ends, as the
 * other strips do. `ref` exposes goTo(day), step(±1) and today().
 */
export function MonthPages({ ref, today, settings, byDay, lookups, colorBy, selectedId, initialDay, onView, onOpen, onPickDay, onCreate }) {
	const scroller = useRef(null);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const [anchor, setAnchor] = useState(initialDay.slice(0, 7));
	const [index, setIndex] = useState(null); // the page in view
	const window_ = useMemo(() => monthWindow(anchor), [anchor]);
	const openDays = settings.hours.days;
	const openMin = toMinutes(settings.hours.open);
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
		const resize = new ResizeObserver(() => setSize((prev) => (prev.width === el.clientWidth && prev.height === el.clientHeight ? prev : { width: el.clientWidth, height: el.clientHeight })));
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

	useLayoutEffect(() => {
		const el = scroller.current;
		if (!el || !size.width) return;
		const previous = geometry.current;
		geometry.current = { window: window_, width: size.width };
		if (!positioned.current) {
			positioned.current = true;
			withoutSnap(el, () => (el.scrollLeft = monthIndexOf(window_, initialDay) * size.width));
			return;
		}
		if (pending.current) {
			const month = pending.current;
			pending.current = null;
			withoutSnap(el, () => (el.scrollLeft = monthIndexOf(window_, month) * size.width));
			return;
		}
		if (previous && (previous.window !== window_ || previous.width !== size.width)) {
			const at = Math.round(el.scrollLeft / previous.width);
			const month = previous.window.months[Math.min(at, previous.window.months.length - 1)];
			withoutSnap(el, () => (el.scrollLeft = monthIndexOf(window_, month) * size.width));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [window_, size.width]);

	useEffect(() => {
		const el = scroller.current;
		if (!el || !size.width) return undefined;
		let frame = 0;
		let timer = 0;
		const read = () => {
			const { window: w, width } = geometry.current;
			const at = Math.min(Math.max(Math.round(el.scrollLeft / width), 0), w.months.length - 1);
			const month = w.months[at];
			return { w, at, month, from: `${month}-01`, to: monthGrid(`${month}-01`).filter((day) => day.startsWith(month)).at(-1) };
		};
		const update = () => {
			frame = 0;
			const { at, month, from, to } = read();
			setIndex((prev) => (prev === at ? prev : at));
			notify.current?.({ month, day: from, from, to, settled: false });
		};
		const settle = () => {
			const { w, at, month, from, to } = read();
			notify.current?.({ month, day: from, from, to, settled: true });
			if (!motion.current && (at < EDGE_MONTHS || at > w.months.length - 1 - EDGE_MONTHS)) setAnchor(month);
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
	}, [size.width, window_]);

	const glideTo = useCallback((left) => {
		const el = scroller.current;
		if (!el) return;
		cancelAnimationFrame(motion.current);
		const from = el.scrollLeft;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || Math.abs(left - from) < 1) {
			withoutSnap(el, () => (el.scrollLeft = left));
			return;
		}
		el.style.scrollSnapType = "none";
		const start = Math.abs(left - from) > 2 * el.clientWidth ? left - Math.sign(left - from) * el.clientWidth : from;
		el.scrollLeft = start;
		const began = performance.now();
		const tick = (time) => {
			const t = Math.min(1, (time - began) / 360);
			el.scrollLeft = start + (left - start) * (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
			if (t < 1) motion.current = requestAnimationFrame(tick);
			else {
				motion.current = 0;
				requestAnimationFrame(() => (el.style.scrollSnapType = ""));
			}
		};
		motion.current = requestAnimationFrame(tick);
	}, []);

	const goToMonth = (month) => {
		const at = monthIndexOf(window_, month);
		if (at < EDGE_MONTHS || at > window_.months.length - 1 - EDGE_MONTHS) {
			pending.current = month.slice(0, 7);
			setAnchor(month.slice(0, 7));
			return;
		}
		glideTo(at * size.width);
	};
	const current = window_.months[index ?? monthIndexOf(window_, initialDay)];

	// The wheel turned up or down moves a month: one per gesture (a trackpad sends many small deltas).
	const wheel = useRef({ sum: 0, at: 0 });
	const live = useRef(null); // this render's glide, for the wheel handler
	useEffect(() => {
		const el = scroller.current;
		if (!el) return undefined;
		const onWheel = (event) => {
			if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || event.ctrlKey || event.metaKey) return;
			event.preventDefault();
			const w = wheel.current;
			w.sum += event.deltaY;
			if (Math.abs(w.sum) < 40 || event.timeStamp - w.at < 350) return;
			w.at = event.timeStamp;
			const width = el.clientWidth;
			const at = Math.round(el.scrollLeft / width) + Math.sign(w.sum);
			w.sum = 0;
			live.current?.glide(at * width);
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, []);
	useEffect(() => {
		live.current = { glide: glideTo };
	});

	useImperativeHandle(
		ref,
		() => ({
			goTo: (day) => goToMonth(day.slice(0, 7)),
			step: (direction) => {
				const [y, m] = current.split("-").map(Number);
				const next = new Date(y, m - 1 + direction, 1);
				goToMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
			},
			today: () => goToMonth(today.slice(0, 7)),
		}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[window_, size.width, current, today, glideTo],
	);

	const createOn = useCallback((day) => onCreate({ start: atMinute(day, openMin) }), [onCreate, openMin]);
	const at = index ?? monthIndexOf(window_, initialDay);
	const pages = [];
	for (let i = Math.max(0, at - 1); i <= Math.min(window_.months.length - 1, at + 1); i++) pages.push(i);

	return (
		<div ref={attach} role="group" aria-label="Calendar pe luni, de la stânga la dreapta. Derulează în lateral (sau cu rotița) pentru altă lună." data-calendar="month" data-direction="horizontal" className="no-scrollbar relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-contain [scroll-snap-type:x_mandatory]">
			{size.width > 0 && (
				<div className="relative" style={{ width: window_.months.length * size.width, height: size.height }}>
					{pages.map((i) => (
						<MonthPage
							key={window_.months[i]}
							month={window_.months[i]}
							left={i * size.width}
							width={size.width}
							height={size.height}
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
			)}
		</div>
	);
}
