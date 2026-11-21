"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, GripVertical, Plus } from "lucide-react";
import { SectionHeader } from "@/components/ds/blocks";
import { MakeTile } from "@/components/ds/car";
import { Segmented } from "@/components/ds/inputs";
import { Button } from "@/components/ui/button";
import { InlineText } from "@/components/ds/inline-text";
import { fmtDate, fmtTime } from "@/lib/format";
import { formatPlate } from "@/domain/vehicle";
import { makeCover, makeInk } from "@/lib/colors";
import { openSheet } from "@/lib/sheets";
import { useLocalPreference, useNowMinute } from "@/lib/hooks";
import { canReschedule } from "@/domain/appointment";
import { addDaysISO, dayOfInstant, diffDaysISO, parseISODate } from "@/domain/dates";
import { assignToLane, reorderTeam, saveBay, saveStaff, setWorkEntrySpan } from "@/lib/store/actions";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { atMinute, toMinutes } from "./utils";
import { useReschedule } from "./use-reschedule";
import { jobHeadline } from "@/features/work-orders/job-text";
import { LANE_KINDS, dropMinute, moveLane, rangeLanes } from "@/features/dashboard/azi-data";

const BLOCK = "application/x-garaj-block";
const LANE = "application/x-garaj-lane";
const LABEL = 124; // px, the rows' names
const SNAP = 15; // minutes: a stretched card's ends land on the quarter hour
// A row's height: cards that overlap in time stack in levels (azi-data stackBlocks), so the row grows instead of hiding one.
const CARD = 48;
const PAD = 8;
const GAP = 4;
const rowHeight = (levels) => PAD * 2 + levels * CARD + (levels - 1) * GAP;
const HOUR_MIN = 56; // px: one day in view never squeezes an hour narrower than this
const WEEK_DAY_MIN = 140; // px: a day in the week view
const REACH = 14; // days drawn on each side; the rail grows by as many when the scroll nears an end
const EDGE_PX = 56; // a card carried this close to the board's side scrolls it to the next days
const EDGE_STEP = 24; // px per drag event
const EDGE = 4; // days from an end of the rail at which it grows
const minuteOf = (iso) => {
	const d = new Date(iso);
	return d.getHours() * 60 + d.getMinutes();
};
const BY = [
	{ value: "bay", label: LANE_KINDS.bay.label },
	{ value: "staff", label: LANE_KINDS.staff.label },
];
const RANGES = [
	{ value: "day", label: "Zi" },
	{ value: "week", label: "Săptămână" },
];
const sentence = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const mondayOf = (iso) => addDaysISO(iso, -((parseISODate(iso).getDay() + 6) % 7));
// Who gets a lane in "Mecanici": the people who work on cars, not the front desk.
const ON_CARS = (person) => person.role !== "advisor";

const clock = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
const carName = (vehicle) => [vehicle?.make, vehicle?.model].filter(Boolean).join(" ");

/**
 * Agendă → Zi on a desktop (owner, 20 Nov 2026; first built as Azi's "Ziua în atelier"): one day by lift or by mechanic.
 * Rows are renamed in place, dragged by their handle into a new order, and added at the bottom; a booking or a job is
 * dragged onto another row to go to that lift or mechanic; a booking dragged along the hours or to another day is
 * rescheduled (owner, 21 Nov 2026; a car already in the shop or a job keeps its time). Either is stretched by its ends to a new start
 * or end (a job: the stretch of work logged). The days are one carousel (owner, 21 Nov 2026): click and drag or a sideways
 * scroll runs freely through them, ‹ › step a day or a week. `ref` takes the page's ‹ Azi › as the other views do (today,
 * step, goTo). With `section`, it is Azi's "Ziua în atelier", with its own ‹ Azi › and a Zi / Săptămână switch.
 */
export function DayBoard({ ref, section = false, initialDay, today, bays, staff, appointments, workOrders, vehicles, settings, onView, onReschedule }) {
	const [by, setBy] = useLocalPreference("garaj.azi.lanes", "bay", ["bay", "staff"]);
	const [range, setRange] = useLocalPreference("garaj.azi.range", "day", ["day", "week"]);
	const perView = section && range === "week" ? 7 : 1;
	const [day, setDay] = useState(() => (perView === 7 ? mondayOf(initialDay) : initialDay));
	const minute = useNowMinute();
	const rail = useRef(null);
	const align = (d) => (perView === 7 ? mondayOf(d) : d);
	useImperativeHandle(ref, () => ({ today: () => rail.current?.go(align(today)), step: (dir) => rail.current?.step(dir * perView), goTo: (d) => rail.current?.go(align(d)) }));
	const notify = useRef(onView);
	useEffect(() => {
		notify.current = onView;
	});
	useEffect(() => {
		notify.current?.({ day, from: day, to: addDaysISO(day, perView - 1), month: day.slice(0, 7), settled: true });
	}, [day, perView]);
	const rows = useMemo(() => (by === "staff" ? Object.fromEntries(Object.entries(staff).filter(([, p]) => ON_CARS(p))) : bays), [by, staff, bays]);
	const inView = perView === 7 ? `${fmtDate(day, "d MMM")} – ${fmtDate(addDaysISO(day, 6), "d MMM")}` : sentence(fmtDate(day, "EEE, d MMM"));
	const controls = (
		<>
			{section && (
				<>
					<span className="flex">
						<Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => rail.current?.step(-perView)} aria-label={perView === 7 ? "Săptămâna anterioară" : "Ziua anterioară"}>
							<ChevronLeft />
						</Button>
						<Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => rail.current?.step(perView)} aria-label={perView === 7 ? "Săptămâna următoare" : "Ziua următoare"}>
							<ChevronRight />
						</Button>
					</span>
					<Button variant="outline" size="sm" className="h-8" onClick={() => rail.current?.go(align(today))}>
						Azi
					</Button>
					<Segmented value={range} onValueChange={setRange} options={RANGES} aria-label="Zi sau săptămână" />
				</>
			)}
			<Segmented value={by} onValueChange={setBy} options={BY} aria-label="Rânduri" />
		</>
	);
	const Wrap = section ? "section" : "div";
	return (
		<Wrap className={section ? "space-y-3" : "flex min-h-0 flex-1 flex-col gap-3 px-6 pb-4"} aria-label={section ? "Ziua în atelier" : undefined}>
			{section ? (
				<SectionHeader title="Ziua în atelier" subtitle={inView} href="/calendar/" className="flex-wrap">
					{controls}
				</SectionHeader>
			) : (
				<div className="flex items-center justify-end gap-2">{controls}</div>
			)}
			<DayLanes rail={rail} by={by} rows={rows} day={day} setDay={setDay} inView={inView} perView={perView} today={today} appointments={appointments} workOrders={workOrders} vehicles={vehicles} settings={settings} minute={minute} onReschedule={onReschedule} />
		</Wrap>
	);
}

function DayLanes({ rail, by, rows, day, setDay, inView, perView, today, appointments, workOrders, vehicles, settings, minute, onReschedule }) {
	const kind = LANE_KINDS[by];
	const scroller = useRef(null);
	const pan = useRef(null);
	const place = useRef({ pos: 0, aim: null, jump: null, shift: 0, growing: false, week: perView === 7 });
	const [span, setSpan] = useState(() => ({ first: addDaysISO(day, -REACH), count: REACH * 2 + 7 }));
	const [between, setBetween] = useState(0); // a neighbour day partly in view: -1 before, 1 after
	const carried = useRef(null); // the card being dragged: { block, offset, minutes, movable }
	const [ghost, setGhost] = useState(null); // where a carried booking would land: { lane, day, start }
	const ownReschedule = useReschedule();
	const reschedule = onReschedule ?? ownReschedule;
	const [over, setOver] = useState(null); // the lane a card or a row is dragged over
	const [fresh, setFresh] = useState(null); // a row just added: its name opens as a field
	const from = Math.floor(toMinutes(settings.hours?.open ?? "08:00") / 60) * 60;
	const to = Math.ceil(toMinutes(settings.hours?.close ?? "18:00") / 60) * 60;
	const total = Math.max(60, to - from);
	const week = perView === 7;
	const tick = week ? 240 : 60; // an hour mark every so many minutes
	const hours = [];
	for (let m = from; m <= to; m += tick) hours.push(m);
	const nowAt = minute != null ? ((minute - from) / total) * 100 : -1;
	const days = useMemo(() => Array.from({ length: span.count }, (_, i) => addDaysISO(span.first, i)), [span]);
	const nowISO = atMinute(today, minute ?? 0);
	const lanes = useMemo(() => rangeLanes({ days, by, rows, appointments, workOrders, now: nowISO }), [days, by, rows, appointments, workOrders, nowISO]);
	const named = lanes.filter((lane) => lane.id);
	const cellWidth = `${100 / span.count}%`;
	// A row is as tall as the days in view need, so a busy day elsewhere doesn't leave it half empty.
	const inViewDays = Array.from({ length: perView + Math.abs(between) }, (_, i) => addDaysISO(day, i + Math.min(between, 0)));
	const levelsOf = (lane) => Math.max(1, ...inViewDays.flatMap((d) => (lane.days[d] ?? []).map((block) => block.level + 1)));

	const dayWidth = () => scroller.current?.querySelector("[data-day]")?.getBoundingClientRect().width || 1;
	const indexOf = (d) => diffDaysISO(span.first, d);
	const glide = (left) => {
		const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		scroller.current.scrollTo({ left, behavior: still ? "auto" : "smooth" });
	};
	const jump = (target) => {
		const p = place.current;
		p.aim = null;
		const i = indexOf(target);
		if (i < 0 || i > span.count - perView) {
			p.jump = target;
			setSpan({ first: addDaysISO(target, -REACH), count: REACH * 2 + 7 });
			return;
		}
		scroller.current.scrollLeft = i * dayWidth();
		p.pos = i;
	};
	const go = (target) => {
		const p = place.current;
		const i = indexOf(target);
		if (i < 0 || i > span.count - perView) return jump(target);
		p.aim = target;
		glide(i * dayWidth());
	};
	useImperativeHandle(rail, () => ({ go, step: (n) => go(addDaysISO(place.current.aim ?? day, n)) }));

	// The week starts on its Monday; back to one day, today if it was in that week.
	useLayoutEffect(() => {
		const p = place.current;
		const wasWeek = p.week;
		p.week = week;
		const inThatWeek = wasWeek && diffDaysISO(day, today) >= 0 && diffDaysISO(day, today) < 7;
		// The rail is only redrawn when the target is off it (a layout step, before paint).
		jump(week ? mondayOf(day) : inThatWeek ? today : day);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [week]);

	// After the rail grew: stay on the same days, and carry on with a pan or a glide under way.
	useLayoutEffect(() => {
		const el = scroller.current;
		const p = place.current;
		if (!el) return;
		const width = dayWidth();
		if (p.jump) {
			const i = indexOf(p.jump);
			el.scrollLeft = i * width;
			p.pos = i;
			p.jump = null;
		} else if (p.shift) {
			const delta = p.shift * width;
			el.scrollLeft += delta;
			if (pan.current) pan.current.left += delta;
			p.shift = 0;
			if (p.aim) glide(indexOf(p.aim) * width);
		}
		p.growing = false;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [span]);

	// A new window width keeps the same place among the days.
	useLayoutEffect(() => {
		const el = scroller.current;
		if (!el) return undefined;
		let seen = el.clientWidth;
		const observer = new ResizeObserver(() => {
			// Rows growing with the days in view change the height only: leave a scroll under way alone.
			if (el.clientWidth === seen) return;
			seen = el.clientWidth;
			if (place.current.aim) return;
			el.scrollLeft = place.current.pos * dayWidth();
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const onScroll = () => {
		const el = scroller.current;
		const p = place.current;
		const width = dayWidth();
		const pos = el.scrollLeft / width;
		p.pos = pos;
		if (p.aim && Math.abs(el.scrollLeft - indexOf(p.aim) * width) < 1) p.aim = null;
		const nearest = Math.round(pos);
		const current = addDaysISO(span.first, nearest);
		if (current !== day) setDay(current);
		const side = Math.abs(pos - nearest) < 0.01 ? 0 : Math.sign(pos - nearest);
		if (side !== between) setBetween(side);
		if (p.growing) return;
		if (pos < EDGE) {
			p.growing = true;
			p.shift = REACH;
			setSpan({ first: addDaysISO(span.first, -REACH), count: span.count + REACH });
		} else if (pos > span.count - perView - EDGE) {
			p.growing = true;
			setSpan({ first: span.first, count: span.count + REACH });
		}
	};

	const save = by === "staff" ? saveStaff : saveBay;
	const rename = (lane, name) => {
		setFresh(null);
		try {
			save({ id: lane.id, name });
		} catch (error) {
			toast.error(error.message);
		}
	};
	const add = () => {
		try {
			const row = save({ name: kind.newName });
			setFresh(row.id);
		} catch (error) {
			toast.error(error.message);
		}
	};

	// A card stretched by an end: a booking takes the new hours (the calendar's own confirm and undo), a job the new ends
	// of the work it logged.
	const stretch = (block, on, startMin, endMin) => {
		const start = atMinute(on, startMin);
		const end = atMinute(on, endMin);
		if (block.kind === "booking") {
			reschedule(block.appointment, { start, end });
			return;
		}
		const entry = block.order.timeLog.find((e) => e.id === block.entryId);
		const previous = { start: entry.start, end: entry.end };
		try {
			setWorkEntrySpan(block.order.id, block.entryId, { start, end });
			toast.success(`Lucrat: ${fmtTime(start)}–${entry.end ? fmtTime(end) : "acum"}`, { action: { label: "Anulează", onClick: () => setWorkEntrySpan(block.order.id, block.entryId, previous) } });
		} catch (error) {
			toast.error(error.message);
		}
	};

	const spotAt = (event, lane) => {
		const c = carried.current;
		const cell = event.target.closest?.("[data-track]");
		if (!c?.movable || !cell) return null;
		const box = cell.getBoundingClientRect();
		const start = dropMinute({ px: event.clientX - c.offset - box.left, width: box.width, from, to, minutes: c.minutes });
		return { lane: lane.id ?? "loose", day: cell.dataset.date, start, minutes: c.minutes };
	};
	const endCarry = () => {
		carried.current = null;
		setGhost(null);
		setOver(null);
	};
	const carry = (next) => {
		carried.current = next;
		place.current.aim = null;
	};

	const dropOn = (lane) => (event) => {
		event.preventDefault();
		setOver(null);
		const laneId = event.dataTransfer.getData(LANE);
		if (laneId) {
			if (lane.id && laneId !== lane.id) reorderTeam(kind.collection, moveLane(named.map((l) => l.id), laneId, lane.id));
			return;
		}
		const raw = event.dataTransfer.getData(BLOCK);
		if (!raw) return;
		const block = JSON.parse(raw);
		const spot = carried.current?.movable ? spotAt(event, lane) : null;
		const minutes = carried.current?.minutes;
		endCarry();
		const appointment = spot && appointments[block.appointmentId];
		if (appointment) {
			const start = atMinute(spot.day, spot.start);
			const sameTime = Date.parse(start) === Date.parse(appointment.start);
			if (!sameTime) {
				const end = new Date(Date.parse(start) + minutes * 60000).toISOString();
				const ids = { appointmentId: block.appointmentId, workOrderId: null };
				const row = block.laneId === lane.id ? null : { name: lane.id ? lane.name : kind.loose, apply: () => assignToLane(ids, kind.field, lane.id), undo: () => assignToLane(ids, kind.field, block.laneId) };
				reschedule(appointment, { start, end }, row);
				return;
			}
		}
		if (block.laneId === lane.id) return;
		try {
			assignToLane({ appointmentId: block.appointmentId, workOrderId: block.workOrderId }, kind.field, lane.id);
			toast.success(lane.id ? `Mutat la ${lane.name}.` : `Scos de pe ${kind.one}.`);
		} catch (error) {
			toast.error(error.message);
		}
	};
	const dragOver = (lane) => (event) => {
		const types = event.dataTransfer.types;
		if (!types.includes(BLOCK) && !(types.includes(LANE) && lane.id)) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
		if (over !== (lane.id ?? "loose")) setOver(lane.id ?? "loose");
		if (!types.includes(BLOCK)) return;
		const spot = spotAt(event, lane);
		if (spot?.lane !== ghost?.lane || spot?.day !== ghost?.day || spot?.start !== ghost?.start) setGhost(spot);
		// At the board's sides the carried card takes the days along, to reach another day.
		const el = scroller.current;
		const box = el.getBoundingClientRect();
		if (event.clientX > box.right - EDGE_PX) el.scrollLeft += EDGE_STEP;
		else if (event.clientX < box.left + LABEL + EDGE_PX && event.clientX > box.left + LABEL) el.scrollLeft -= EDGE_STEP;
	};

	// Click and drag on the empty body pans it sideways (a mouse; touch and trackpads scroll on their own).
	const onPointerDown = (event) => {
		place.current.aim = null;
		if (event.pointerType !== "mouse" || event.button !== 0 || event.target.closest("button, input, a, [draggable='true']")) return;
		pan.current = { x: event.clientX, left: scroller.current.scrollLeft, id: event.pointerId };
		// Held from the press: rows change height with the days in view, and the pointer mustn't fall off the board.
		scroller.current.setPointerCapture(event.pointerId);
	};
	const onPointerMove = (event) => {
		const p = pan.current;
		if (!p || p.id !== event.pointerId) return;
		if (!p.moved && Math.abs(event.clientX - p.x) < 4) return;
		p.moved = true;
		scroller.current.scrollLeft = p.left - (event.clientX - p.x);
	};
	const endPan = () => {
		pan.current = null;
	};

	return (
		<div
			ref={scroller}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={endPan}
			onScroll={onScroll}
			onWheel={() => (place.current.aim = null)}
			onDragLeave={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) setGhost(null);
			}}
			onPointerCancel={endPan}
			className="overflow-x-auto overscroll-x-contain rounded-xl border bg-card select-none [scrollbar-width:thin]"
		>
			<div
				className="grid cursor-grab grid-cols-[124px_minmax(0,1fr)] active:cursor-grabbing"
				style={{ width: `calc(${LABEL}px + (100% - ${LABEL}px) * ${span.count / perView})`, minWidth: LABEL + span.count * (week ? WEEK_DAY_MIN : (total / 60) * HOUR_MIN) }}
			>
				<div className="sticky left-0 z-20 flex items-center bg-card px-3.5 text-[11px] font-medium text-muted-foreground tabular-nums" aria-live="polite">
					{inView}
				</div>
				<div className="flex">
					{days.map((d) => (
						<div key={d} data-day className={cn("relative h-12 shrink-0 border-l", d === today && "bg-accent/40")} style={{ width: cellWidth }}>
							<span className={cn("sticky left-[132px] inline-block px-1.5 pt-1 text-[11.5px] font-semibold", d !== today && "text-muted-foreground")}>{sentence(fmtDate(d, "EEE, d MMM"))}</span>
							{hours.map((m, i) => (
								<span key={m} className={cn("absolute bottom-1 text-[11px] text-muted-foreground tabular-nums", i === 0 ? "pl-1.5" : m === to ? "-translate-x-full pr-1.5" : "-translate-x-1/2")} style={{ left: `${((m - from) / total) * 100}%` }}>
									{`${Math.floor(m / 60)}:00`}
								</span>
							))}
						</div>
					))}
				</div>
				{lanes.map((lane) => {
					const key = lane.id ?? "loose";
					return (
						<div key={key} className="contents">
							<div
								onDragOver={dragOver(lane)}
								onDragLeave={() => setOver((current) => (current === key ? null : current))}
								onDrop={dropOn(lane)}
								className={cn("sticky left-0 z-20 flex min-h-16 cursor-default items-center gap-0.5 border-t bg-card pr-2 pl-1 text-[13px] font-medium", over === key && "bg-accent")}
							>
								{lane.id ? (
									<>
										<span
											draggable
											onDragStart={(event) => {
												event.dataTransfer.setData(LANE, lane.id);
												event.dataTransfer.effectAllowed = "move";
											}}
											aria-label={`Mută rândul ${lane.name}`}
											title="Trage ca să schimbi ordinea"
											className="flex h-8 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
										>
											<GripVertical className="size-4" aria-hidden />
										</span>
										<InlineText value={lane.name} label={`Numele (${kind.one})`} autoEdit={fresh === lane.id} onSave={(name) => rename(lane, name)} className="min-w-0 text-[13px]" />
									</>
								) : (
									<span className="truncate pl-1.5 text-muted-foreground">{lane.name}</span>
								)}
							</div>
							<div
								onDragOver={dragOver(lane)}
								onDragLeave={() => setOver((current) => (current === key ? null : current))}
								onDrop={dropOn(lane)}
								className={cn("flex border-t transition-[height,background-color] duration-200 motion-reduce:transition-none", over === key && "bg-accent/60")}
								style={{ height: rowHeight(levelsOf(lane)) }}
							>
								{days.map((d) => (
									<div
										key={d}
										data-track
										data-date={d}
										className="relative h-full shrink-0 overflow-clip border-l"
										style={{ width: cellWidth, backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent calc(${(tick / total) * 100}% - 1px), var(--border) calc(${(tick / total) * 100}% - 1px), var(--border) ${(tick / total) * 100}%)` }}
									>
										{(lane.days[d] ?? []).map((block) => (
											<Block key={block.key} block={block} lane={lane} day={d} compact={week} vehicle={vehicles[block.order?.vehicleId ?? block.appointment?.vehicleId]} from={from} to={to} total={total} onStretch={stretch} onCarry={carry} onCarryEnd={endCarry} />
										))}
										{ghost?.lane === key && ghost.day === d && (
											<span
												aria-hidden
												className="pointer-events-none absolute z-30 flex items-center overflow-visible rounded-[7px] border-2 border-ring bg-accent/70 px-1.5 text-[11px] font-semibold whitespace-nowrap tabular-nums"
												style={{ top: PAD, height: CARD, left: `calc(${((ghost.start - from) / total) * 100}% + 2px)`, width: `calc(${(Math.min(ghost.minutes, to - ghost.start) / total) * 100}% - 4px)` }}
											>
												{`${clock(ghost.start)}–${clock(ghost.start + ghost.minutes)}`}
											</span>
										)}
										{d === today && nowAt >= 0 && nowAt <= 100 && <span aria-hidden className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-[#ff3b30]" style={{ left: `${nowAt}%` }} />}
									</div>
								))}
							</div>
						</div>
					);
				})}
				<div className="sticky left-0 z-20 border-t bg-card p-1.5">
					<button type="button" onClick={add} className="flex h-9 w-full items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
						<Plus className="size-4" aria-hidden /> {by === "staff" ? "Mecanic" : "Elevator"}
					</button>
				</div>
				<div className="border-t" />
			</div>
		</div>
	);
}

function Block({ block, lane, day, compact, vehicle, from, to, total, onStretch, onCarry, onCarryEnd }) {
	const [lifted, setLifted] = useState(false); // being carried: its place stays, faded
	const [draft, setDraft] = useState(null); // { start, end } in minutes while an end is dragged
	const grab = useRef(null);
	const quiet = useRef(false); // the click that ends a stretch does not open the card
	const closed = block.order && ["delivered", "cancelled"].includes(block.order.status);
	// A stretch of work over midnight is drawn to the day's edge on each day, and isn't stretched from here.
	const entry = block.kind === "work" ? block.order.timeLog?.find((e) => e.id === block.entryId) : null;
	const startsHere = !entry || dayOfInstant(entry.start) === day;
	const endsHere = dayOfInstant(block.end) === day;
	const canStart = block.kind === "booking" ? canReschedule(block.appointment) : Boolean(block.entryId) && !closed && startsHere && endsHere;
	const canEnd = canStart && !(block.kind === "work" && block.running);
	const startMin = draft?.start ?? (startsHere ? minuteOf(block.start) : from);
	const endMin = draft?.end ?? (endsHere ? Math.max(minuteOf(block.end), startMin + 1) : to);
	const pct = (m) => Math.min(100, Math.max(0, ((m - from) / total) * 100));
	const left = pct(startMin);
	const width = Math.max(4, pct(endMin) - left);
	const title = block.appointment ? [carName(vehicle), block.appointment.title].filter(Boolean).join(" · ") : jobHeadline(block.order);
	const when = draft ? `${clock(draft.start)}–${clock(draft.end)}` : block.running ? "în lucru acum" : `${fmtTime(block.start)}–${fmtTime(block.end)}`;
	const detail = [vehicle?.plate && formatPlate(vehicle.plate), when].filter(Boolean).join(" · ");
	const open = () => {
		if (quiet.current) return;
		if (block.order) openSheet("work-order-view", { id: block.order.id });
		else openSheet("appointment-view", { id: block.appointment.id });
	};

	const down = (edge) => (event) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		const track = event.currentTarget.closest("[data-track]").clientWidth;
		grab.current = { edge, x: event.clientX, start: minuteOf(block.start), end: Math.max(minuteOf(block.end), minuteOf(block.start) + SNAP), track };
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const move = (event) => {
		const g = grab.current;
		if (!g) return;
		const delta = Math.round((((event.clientX - g.x) / g.track) * total) / SNAP) * SNAP;
		if (g.edge === "start") setDraft({ start: Math.min(Math.max(from, g.start + delta), g.end - SNAP), end: g.end });
		else setDraft({ start: g.start, end: Math.max(Math.min(to, g.end + delta), g.start + SNAP) });
	};
	const up = () => {
		const g = grab.current;
		grab.current = null;
		if (!g) return;
		quiet.current = true;
		setTimeout(() => (quiet.current = false), 0);
		const next = draft;
		setDraft(null);
		if (next && (next.start !== g.start || next.end !== g.end)) onStretch(block, day, next.start, next.end);
	};
	const handle = (edge) => (
		<span
			aria-hidden
			onPointerDown={down(edge)}
			onPointerMove={move}
			onPointerUp={up}
			onPointerCancel={up}
			onClick={(event) => event.stopPropagation()}
			className={cn("absolute inset-y-0 z-10 w-2 cursor-ew-resize after:absolute after:inset-y-2 after:w-0.5 after:rounded-full after:bg-current after:opacity-0 hover:after:opacity-40", edge === "start" ? "left-0 after:left-0.5" : "right-0 after:right-0.5")}
		/>
	);

	return (
		<button
			type="button"
			draggable={!draft}
			onDragStart={(event) => {
				if (grab.current) return event.preventDefault();
				event.dataTransfer.setData(BLOCK, JSON.stringify({ appointmentId: block.appointment?.id ?? null, workOrderId: block.appointment ? null : block.order?.id, laneId: lane.id }));
				event.dataTransfer.effectAllowed = "move";
				const minutes = Math.max(SNAP, Math.round((Date.parse(block.end) - Date.parse(block.start)) / 60000));
				onCarry({ block, offset: event.clientX - event.currentTarget.getBoundingClientRect().left, minutes, movable: block.kind === "booking" && block.planned && canStart });
				requestAnimationFrame(() => setLifted(true));
			}}
			onDragEnd={() => {
				setLifted(false);
				onCarryEnd();
			}}
			onClick={open}
			aria-label={`${title}, ${detail}`}
			title={compact ? `${title}, ${detail}` : canStart ? block.kind === "booking" && block.planned ? "Trage ca să o reprogramezi; trage de capete ca să schimbi ora" : "Trage pe alt rând ca să o muți; trage de capete ca să schimbi ora" : "Trage pe alt rând ca să o muți"}
			className={cn("@container absolute flex min-w-0 cursor-pointer items-center overflow-clip rounded-[7px] text-left text-xs active:cursor-grabbing", compact ? "px-0.5" : "px-2", block.planned && "border border-dashed border-foreground/25", draft && "z-20 ring-2 ring-ring", lifted && "opacity-40")}
			style={{
				top: PAD + (block.level ?? 0) * (CARD + GAP),
				height: CARD,
				left: `calc(${left}% + 2px)`,
				width: `calc(${width}% - 4px)`,
				// Planned: one grey dashed outline for every car; on the lift: the car's cover, as the atelier's cards.
				...(block.planned ? {} : { background: makeCover(vehicle?.make), color: makeInk(vehicle?.make) }),
			}}
		>
			{canStart && handle("start")}
			{/* Sticky past the rows' names: a card half under them still shows its car. A narrow card shows the logo only. */}
			<span className="sticky left-[132px] flex w-fit max-w-[min(100%,16rem)] min-w-0 items-center gap-2 @max-[76px]:mx-auto">
				<span className="shrink-0 @max-[18px]:hidden">
					<MakeTile make={vehicle?.make} size={compact ? 18 : 22} reverse={!block.planned} />
				</span>
				<span className="min-w-0 @max-[76px]:hidden">
					<span className="block truncate font-semibold">{title}</span>
					<span className={cn("block truncate tabular-nums", block.planned ? "text-muted-foreground" : "opacity-75")}>
						{detail}
					</span>
				</span>
			</span>
			{canEnd && handle("end")}
		</button>
	);
}
