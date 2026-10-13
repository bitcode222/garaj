"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarSearch, CarFront, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Card } from "@/components/ds/card";
import { Initials, Money } from "@/components/ds/data";
import { Segmented } from "@/components/ds/inputs";
import { MakeLogo } from "@/components/ds/make-logo";
import { ToneDot } from "@/components/ds/tone";
import { computeTotals } from "@/domain/lines";
import { Button } from "@/components/ui/button";
import { isActiveAppointment } from "@/domain/appointment";
import { addDaysISO, dayOfInstant, diffDaysISO } from "@/domain/dates";
import { formatPlate, vehicleName } from "@/domain/vehicle";
import { VISIT_STAGES, appointmentForJob, countStages, defaultCalendarView } from "@/domain/visit";
import { fmtDate, fmtDays, fmtTime, fmtWorkOrder, plural } from "@/lib/format";
import { VISIT_STAGE } from "@/lib/labels";
import { useOpenDetail } from "@/lib/detail-mode";
import { openSheet } from "@/lib/sheets";
import { useCollection, useSettings } from "@/lib/store/hooks";
import { selectActive, selectAppointmentsByDay, selectVisits } from "@/lib/store/selectors";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { minuteOfDay } from "@/features/calendar/utils";
import { Timeline } from "./timeline";
import { DAYS_AHEAD, DAYS_BACK } from "./timeline-geometry";
import { NO_FOCUS, hoverHandlers, litAs, litClass, stageClass } from "./visit-ui";

const VIEWS = [
	{ value: "day", label: "Zi" },
	{ value: "week", label: "Săptămână" },
];

// "Programat" in the bar: hatched, the planned-not-yet-real mark, so it never reads as the solid neutral of "Predat".
const HATCH = "repeating-linear-gradient(135deg, color-mix(in oklch, var(--muted-foreground) 60%, transparent) 0 2px, transparent 2px 5px)";

function StageMark({ stage }) {
	const meta = VISIT_STAGE[stage];
	return meta.outline ? <span className="size-2 shrink-0 rounded-full border-[1.5px] border-muted-foreground" aria-hidden /> : <ToneDot tone={meta.tone} />;
}

/**
 * The status line: one bar split by stage and a legend with counts. It describes
 * exactly what the calendar below shows, and it is the filter: a tap on a colour
 * (bar or legend) keeps only that stage, a second tap on it clears the filter.
 */
function StageLine({ counts, value, onChange }) {
	const present = VISIT_STAGES.filter((s) => counts[s] > 0);
	// The chosen stage stays listed at 0, so the filter can always be seen and cleared.
	const listed = VISIT_STAGES.filter((s) => counts[s] > 0 || s === value);
	if (!listed.length) return null;
	const toggle = (s) => onChange(value === s ? null : s);
	return (
		<div className="space-y-1 px-4 pb-2 md:px-5">
			<div className="relative">
				<div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
					{present.map((s) => (
						<span
							key={s}
							className={cn("min-w-1.5 transition-opacity", !VISIT_STAGE[s].outline && tone(VISIT_STAGE[s].tone).bar, value && value !== s && "opacity-25")}
							style={{ flexGrow: counts[s], backgroundImage: VISIT_STAGE[s].outline ? HATCH : undefined }}
						/>
					))}
				</div>
				{/* Taller, invisible hit areas over the segments; the legend buttons are the accessible controls. */}
				<div className="absolute inset-x-0 -inset-y-2 flex" aria-hidden>
					{present.map((s) => (
						<button key={s} type="button" tabIndex={-1} className="min-w-1.5" style={{ flexGrow: counts[s] }} title={`${VISIT_STAGE[s].label}: ${counts[s]}`} onClick={() => toggle(s)} />
					))}
				</div>
			</div>
			<div role="group" aria-label="Arată o singură etapă" className="no-scrollbar -mx-4 flex items-center gap-0.5 overflow-x-auto px-2 md:-mx-2 md:flex-wrap md:px-0">
				{listed.map((s) => (
					<button
						key={s}
						type="button"
						aria-pressed={value === s}
						aria-label={`${VISIT_STAGE[s].label}: ${counts[s]}${value === s ? ". Apasă pentru a arăta tot." : ""}`}
						onClick={() => toggle(s)}
						className={cn(
							"inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-[background-color,opacity] hover:bg-accent/60 md:h-7",
							value === s && "bg-accent text-foreground",
							value && value !== s && "opacity-50",
						)}
					>
						<StageMark stage={s} />
						{VISIT_STAGE[s].label}
						<span className="font-semibold text-foreground tabular-nums">{counts[s]}</span>
						{/* The chosen chip carries its own way out, so it is in view wherever the row is scrolled. */}
						{value === s && <X className="size-3.5 opacity-70" aria-hidden />}
					</button>
				))}
			</div>
		</div>
	);
}

/**
 * Every car in the shop, always (it is the shop right now, whatever day the
 * timeline shows): a carousel of cards grouped by stage, in the status line's
 * order, each group under a label that stays in view while its cards scroll.
 * A card says where the car is on the calendar and carries a button that travels
 * there. Phones swipe (snap per card); from md up the arrows scroll it. With a
 * stage filter on, the title says so and carries the way out.
 */
function InShopStrip({ groups, total, filter, onClearFilter, vehicles, customers, staff, settings, today, focus, onHover, targetFor, onReveal, onOpen }) {
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

	// A visit selected from the calendar brings its card into view (sideways only; hovering never moves anything).
	const litCard = focus.origin ?? focus.selected;
	useEffect(() => {
		const el = track.current;
		const card = litCard && el?.querySelector(`[data-visit="${litCard}"]`);
		if (!el || !card) return;
		const box = el.getBoundingClientRect();
		const rect = card.getBoundingClientRect();
		if (rect.left >= box.left + 8 && rect.right <= box.right - 8) return;
		el.scrollTo({ left: el.scrollLeft + rect.left - box.left - 24, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
	}, [litCard]);

	if (!total) return null;

	const step = (direction) => {
		const el = track.current;
		const card = el?.querySelector("[data-visit]");
		if (!el || !card) return;
		el.scrollBy({ left: direction * (card.offsetWidth + 8), behavior: "smooth" });
	};
	const stageLabel = filter ? VISIT_STAGE[filter].label : null;
	const shown = groups.reduce((sum, group) => sum + group.visits.length, 0);
	const when = (start) => {
		const away = diffDaysISO(today, dayOfInstant(start));
		return `${Math.abs(away) <= 1 ? fmtDays(away) : fmtDate(start, "d MMM")} ${fmtTime(start)}`;
	};

	return (
		<section aria-label="Deja în service" className="flex flex-col gap-2.5 border-t px-4 pt-2.5 pb-4 md:flex-row md:items-start md:gap-4 md:px-5 md:pt-3 md:pb-5">
			<div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 md:w-44 md:flex-col md:items-start md:pt-1.5">
				<p className="text-2xs font-medium tracking-wider text-muted-foreground uppercase">Deja în service · {filter ? `${shown} din ${total}` : total}</p>
				{filter && (
					<button
						type="button"
						onClick={onClearFilter}
						aria-label={`Filtru activ: doar ${stageLabel}. Arată toate mașinile.`}
						className="inline-flex h-11 max-w-full items-center gap-1 rounded-md border bg-accent px-2 text-xs font-medium transition-colors hover:bg-accent/70 md:h-7"
					>
						<span className="truncate">Doar: {stageLabel}</span>
						<X className="size-3.5 shrink-0 opacity-70" aria-hidden />
					</button>
				)}
				{shown > 0 && (
					<div className="hidden gap-1.5 md:flex">
						<Button variant="outline" size="icon" className="size-7" onClick={() => step(-1)} disabled={edge.start} aria-label="Mașina anterioară">
							<ChevronLeft />
						</Button>
						<Button variant="outline" size="icon" className="size-7" onClick={() => step(1)} disabled={edge.end} aria-label="Mașina următoare">
							<ChevronRight />
						</Button>
					</div>
				)}
			</div>
			{shown === 0 && <p className="flex-1 py-1.5 text-sm text-muted-foreground">Nicio mașină din service nu e în etapa „{stageLabel}”.</p>}
			{shown > 0 && (
				<ul
					key={filter ?? "all"}
					ref={attach}
					className="no-scrollbar -mx-4 -my-1 flex min-w-0 flex-1 snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 py-1 md:mx-0 md:-mx-1 md:scroll-px-1 md:px-1 md:py-1"
				>
					{groups.map((group) => (
						<li key={group.stage} data-stage={group.stage} className="shrink-0">
							{/* Sticky inside its group: the label stays at the left edge while this stage's cards scroll past. */}
							<p className="sticky left-0 mb-1.5 flex w-max items-center gap-1.5 text-2xs font-medium text-muted-foreground">
								<StageMark stage={group.stage} />
								{VISIT_STAGE[group.stage].label}
								<span className="font-semibold text-foreground tabular-nums">{group.visits.length}</span>
							</p>
							<ul className="flex gap-2">
								{group.visits.map((visit) => {
									const order = visit.order;
									const vehicle = vehicles[order.vehicleId];
									const customer = customers[order.customerId];
									const mechanic = order.staffId ? staff[order.staffId] : null;
									const target = targetFor(visit);
									const name = vehicleName(vehicle) || `Lucrarea ${fmtWorkOrder(order.number)}`;
									const gross = computeTotals(order.lines, { vatPayer: settings.invoicing.vatPayer }).gross;
									// Where the car is on the calendar: its own booking, another booking of the same car, or nowhere.
									const anchor = visit.appointment ? when(visit.appointment.start) : target ? `altă programare: ${fmtDate(target.start, "d MMM")}` : "fără programare";
									const label = [name, vehicle?.plate && formatPlate(vehicle.plate), customer?.name, mechanic?.name, anchor, VISIT_STAGE[order.status].label, fmtWorkOrder(order.number)]
										.filter(Boolean)
										.join(" · ");
									return (
										<li key={visit.id} {...hoverHandlers(visit.id, onHover)} className="group relative w-[min(72vw,14.5rem)] shrink-0 snap-start md:w-60">
											<button
												type="button"
												data-visit={visit.id}
												onClick={() => onOpen(visit)}
												aria-label={label}
												className={cn(
													"flex h-full w-full flex-col gap-2 rounded-lg border p-2.5 text-left transition-[filter,box-shadow] hover:brightness-95 active:scale-[0.99]",
													stageClass(order.status),
													litClass(litAs(visit, focus)),
												)}
											>
												<span className="flex items-center gap-2.5 pr-8">
													<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-card/70">
														<MakeLogo make={vehicle?.make} className="size-4.5" />
													</span>
													<span className="min-w-0 flex-1">
														<span className="block truncate text-xs font-semibold">{name}</span>
														<span className="flex items-center gap-1.5 text-2xs opacity-80">
															{vehicle?.plate && (
																<span translate="no" className="font-mono tracking-wide uppercase">
																	{formatPlate(vehicle.plate)}
																</span>
															)}
															<span className="tabular-nums">{fmtWorkOrder(order.number)}</span>
														</span>
													</span>
												</span>
												<span className="truncate text-2xs font-medium">{customer?.name ?? "Client necunoscut"}</span>
												<span className="mt-auto flex items-center justify-between gap-2 border-t border-current/15 pt-2 text-2xs">
													<span className="flex min-w-0 items-center gap-1.5">
														{mechanic ? <Initials name={mechanic.name} tone={mechanic.color} size="sm" className="size-5" /> : null}
														<span className="truncate opacity-80">{anchor}</span>
													</span>
													<span className="shrink-0 text-right font-semibold tabular-nums">
														<Money value={gross} decimals={0} />
													</span>
												</span>
											</button>
											{target && (
												<button
													type="button"
													onClick={() => onReveal(visit, target)}
													aria-label={`Arată programarea în calendar: ${target.title || "Programare"}, ${fmtDate(target.start, "d MMM")} ${fmtTime(target.start)}`}
													title="Arată în calendar"
													className="absolute top-2 right-2 z-10 flex size-8 items-center justify-center rounded-md border bg-card text-foreground shadow-xs opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100 hover:bg-accent"
												>
													<CalendarSearch className="size-4" aria-hidden />
												</button>
											)}
										</li>
									);
								})}
							</ul>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

const NONE = [];

/**
 * The dashboard's calendar (docs/DASHBOARD-CALENDAR.md): the cars in service, the
 * status line that is also the filter, and one timeline of days that is scrolled
 * through at two zooms, Zi and Săptămână. The day or range in view is written
 * between the ‹ › buttons. Opens on Zi when something is booked today, otherwise
 * on Săptămână; decided once per day.
 */
export function DashboardCalendar({ today }) {
	const settings = useSettings();
	const openDetail = useOpenDetail();
	const appointments = useCollection("appointments");
	const workOrders = useCollection("workOrders");
	const customers = useCollection("customers");
	const vehicles = useCollection("vehicles");
	const staffMap = useCollection("staff");
	const staff = selectActive(staffMap);
	const byDay = selectAppointmentsByDay(appointments);
	const visits = selectVisits(appointments, workOrders);

	const suggested = defaultCalendarView(byDay.get(today));
	const [auto, setAuto] = useState({ day: today, view: suggested });
	const [choice, setChoice] = useState(null);
	// Where the timeline opens after a zoom change (the timeline is remounted for it); null = on today.
	const [opening, setOpening] = useState(null);
	// What the timeline reports while it scrolls: the day it is on and the whole days in view (live),
	// the days it settled on, and whether today is in view.
	const [seen, setSeen] = useState(null);
	const [stage, setStage] = useState(null);
	// Two states on purpose (D6): the visit under the pointer or keyboard focus is transient;
	// the visit that was opened or travelled to stays until it is dismissed.
	const [hovered, setHovered] = useState(null);
	const [selected, setSelected] = useState(null); // { id, origin, travelled }: visit ids
	const timeline = useRef(null);
	const dateInput = useRef(null);
	// A new day (app left open overnight) starts fresh: default zoom, now, no filter, nothing selected.
	if (auto.day !== today) {
		setAuto({ day: today, view: suggested });
		setChoice(null);
		setOpening(null);
		setSeen(null);
		setStage(null);
		setHovered(null);
		setSelected(null);
	}
	const zoom = choice ?? auto.view;
	const zi = zoom === "day";
	const opensOn = opening?.day ?? today;
	// The date follows the scroll live; everything counted from the days in view waits until scrolling stops (D8).
	const from = seen?.from ?? opensOn;
	const to = seen?.to ?? opensOn;
	const settledFrom = seen?.settledFrom ?? opensOn;
	const settledTo = seen?.settledTo ?? opensOn;
	const onToday = seen ? seen.todayVisible : opensOn === today;

	const onView = useCallback((view) => {
		setSeen((prev) => {
			const next = {
				day: view.day,
				from: view.from,
				to: view.to,
				todayVisible: view.todayVisible,
				settledFrom: view.settled ? view.from : (prev?.settledFrom ?? view.from),
				settledTo: view.settled ? view.to : (prev?.settledTo ?? view.to),
			};
			return prev && Object.keys(next).every((key) => prev[key] === next[key]) ? prev : next;
		});
	}, []);

	const model = useMemo(() => {
		const bookings = [];
		for (let day = settledFrom; day <= settledTo; day = addDaysISO(day, 1)) bookings.push(...(visits.bookingsByDay.get(day) ?? NONE));
		// The line counts what the section shows: every car in service, plus the bookings in view, each visit once.
		const inService = new Set(visits.inService);
		const counts = countStages([...visits.inService.map((visit) => visit.stage), ...bookings.filter((visit) => !inService.has(visit)).map((visit) => visit.stage)]);
		return { bookings, counts };
	}, [settledFrom, settledTo, visits]);

	// Where to send the user when nothing is booked in view.
	const nextDay = useMemo(() => {
		let best = null;
		for (const [day, list] of byDay) if (day > settledTo && (!best || day < best) && list.some(isActiveAppointment)) best = day;
		return best;
	}, [byDay, settledTo]);

	// A selection is only as alive as its visit: deleted or cancelled, and it is gone without anyone clearing it.
	const selectedVisit = selected ? visits.byId.get(selected.id) : null;
	const selection = selectedVisit?.appointment ? selected : null;
	const hoveredCar = hovered ? (visits.byId.get(hovered)?.vehicleId ?? null) : null;
	const selectedCar = selection ? selectedVisit.vehicleId : null;
	const selectedId = selection?.id ?? null;
	const origin = selection?.origin ?? null;
	const arrived = selection?.travelled ? selection.id : null;
	// What is lit, as one object for the memoised days and cards. The React Compiler keeps its identity
	// until one of these changes (a manual useMemo here makes it skip the whole component).
	const focus = hovered || selectedId ? { hovered, hoveredCar, selected: selectedId, selectedCar, origin, arrived } : NO_FOCUS;

	// Filter lifetime (D7): it stays while moving between days, and goes on a second tap, ✕, Esc,
	// a switch between Zi and Săptămână, and "Azi". Whatever changes the lists also drops the hover,
	// because no pointer-leave fires for an element that was removed from under the pointer.
	const applyStage = (next) => {
		setStage(next);
		setHovered(null);
	};
	/**
	 * Zoom. The day in view stays in view: zooming in goes to today when today is among the days shown,
	 * otherwise to the first of them (or to `day`, when a day's header was tapped); zooming out puts the
	 * day in view at the left edge.
	 */
	const changeZoom = (next, day = null) => {
		if (next === zoom) return;
		const todayShown = today >= from && today <= to;
		setOpening({ day: day ?? (next === "day" && todayShown ? today : from) });
		setSeen(null);
		setChoice(next);
		setStage(null);
		setHovered(null);
	};
	const step = (direction) => {
		setHovered(null);
		timeline.current?.step(direction, zi ? 1 : 7);
	};
	const goToday = () => {
		setStage(null);
		setHovered(null);
		timeline.current?.goToNow();
	};
	/** A day chosen in the date picker, or the next booking: that day from its first hour (or at the given time). */
	const jumpTo = (day, minute) => {
		setHovered(null);
		timeline.current?.goTo({ day, minute, align: 0 });
	};

	// Card → calendar: travel to the booking and select it, at the current zoom; the filter goes only if it would hide the booking.
	const reveal = (card, appointment) => {
		const target = visits.byId.get(appointment.id);
		if (!target) return;
		if (stage && target.stage !== stage) setStage(null);
		setHovered(null);
		setSelected({ id: target.id, origin: card.id, travelled: true });
		timeline.current?.goTo({ day: target.day, minute: minuteOfDay(target.start), align: 0.5, focusId: target.id, reveal: true });
	};

	const onKeyDown = (event) => {
		if (event.key !== "Escape" || event.defaultPrevented) return;
		if (selection) setSelected(null);
		else if (stage) applyStage(null);
		else return;
		event.stopPropagation();
	};

	const shownBookings = stage ? model.bookings.filter((visit) => visit.stage === stage) : model.bookings;
	const groups = useMemo(() => {
		const byStage = new Map();
		for (const visit of visits.inService) {
			if (stage && visit.stage !== stage) continue;
			const list = byStage.get(visit.stage);
			if (list) list.push(visit);
			else byStage.set(visit.stage, [visit]);
		}
		return [...byStage].map(([key, list]) => ({ stage: key, visits: list }));
	}, [visits, stage]);

	const create = useCallback(({ start, staffId } = {}) => openSheet("appointment", { start, staffId }), []);
	// Opening a booking also selects it: when the sheet closes, the booking and its car's card are still lit.
	const openBooking = useCallback(
		(visit) => {
			setHovered(null);
			setSelected({ id: visit.id, origin: null, travelled: false });
			openDetail("appointment", visit.id);
		},
		[openDetail],
	);

	const near = diffDaysISO(today, from);
	// Zi: "marți, 13 oct. · azi". Săptămână: the whole days in view, "13 – 18 oct. 2026".
	const label = from === to ? fmtDate(from, "EEEE, d MMM") : `${fmtDate(from, from.slice(0, 7) === to.slice(0, 7) ? "d" : "d MMM")} – ${fmtDate(to, "d MMM yyyy")}`;
	const labelNote = from === to && Math.abs(near) <= 1 ? fmtDays(near) : null;
	const summary = `${plural(model.bookings.length, "programare", "programări")} · ${visits.inService.length} în service`;
	// While a visit is hovered or focused, say how many of its car's bookings this view shows.
	const hoveredCount = hoveredCar ? model.bookings.filter((visit) => visit.vehicleId === hoveredCar).length : 0;
	const hoveredSummary = hovered
		? `${vehicleName(vehicles[hoveredCar]) || "Mașina"} · ${hoveredCount ? plural(hoveredCount, "programare în afișaj", "programări în afișaj") : "nicio programare în afișaj"}`
		: null;

	const picked = selection ? selectedVisit.appointment : null;
	const pickedAway = picked ? diffDaysISO(today, selectedVisit.day) : 0;
	const pickedWhen = picked ? `${Math.abs(pickedAway) <= 1 ? fmtDays(pickedAway) : fmtDate(picked.start, "EEE, d MMM")} ${fmtTime(picked.start)}` : null;
	const pickedName = picked ? vehicleName(vehicles[selectedVisit.vehicleId]) || picked.title || "Programare" : null;
	const canCheckIn = picked && ["scheduled", "confirmed"].includes(picked.status) && picked.vehicleId;

	return (
		<Card className="mb-6 overflow-hidden" onKeyDown={onKeyDown}>
			<header className="flex flex-col gap-3 p-4 pb-3 md:p-5 md:pb-3 lg:flex-row lg:items-center lg:justify-between">
				<h2 className="sr-only">Programul</h2>
				<div className="flex min-w-0 flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-3">
					{/* The day or range in view sits between the arrows, at a fixed width, so the arrows never move (R2). */}
					<div className="flex min-w-0 items-center gap-1.5">
						<Button variant="outline" size="icon" className="size-11 shrink-0 md:size-8" onClick={() => step(-1)} aria-label={zi ? "Ziua anterioară" : "Săptămâna anterioară"}>
							<ChevronLeft />
						</Button>
						<div className="relative min-w-0 flex-1 md:w-52 md:flex-none">
							<button
								type="button"
								onClick={() => {
									const input = dateInput.current;
									if (input?.showPicker) input.showPicker();
									else input?.focus();
								}}
								aria-label={`Alege data. Afișat: ${label}${labelNote ? `, ${labelNote}` : ""}`}
								className="flex h-11 w-full items-center justify-center gap-1.5 rounded-md px-2 text-sm transition-colors hover:bg-accent md:h-8"
							>
								<span aria-live="polite" className="truncate font-semibold first-letter:uppercase">
									{label}
								</span>
								{labelNote && <span className="shrink-0 text-muted-foreground">· {labelNote}</span>}
							</button>
							{/* The native date picker, opened by the label; invisible, anchored under it. */}
							<input
								ref={dateInput}
								type="date"
								tabIndex={-1}
								aria-hidden
								value={from}
								min={addDaysISO(today, -DAYS_BACK)}
								max={addDaysISO(today, DAYS_AHEAD)}
								onChange={(event) => event.target.value && jumpTo(event.target.value)}
								className="pointer-events-none absolute inset-x-0 bottom-0 h-0 w-full opacity-0"
							/>
						</div>
						<Button variant="outline" size="icon" className="size-11 shrink-0 md:size-8" onClick={() => step(1)} aria-label={zi ? "Ziua următoare" : "Săptămâna următoare"}>
							<ChevronRight />
						</Button>
					</div>
					<p className="truncate text-xs text-muted-foreground">{hoveredSummary ?? summary}</p>
				</div>
				<div className="flex items-center gap-2">
					{!onToday && (
						<Button variant="outline" size="sm" className="max-md:h-11" onClick={goToday}>
							Azi
						</Button>
					)}
					<Segmented value={zoom} onValueChange={(next) => changeZoom(next)} options={VIEWS} className="max-md:h-11 max-md:flex-1 max-md:[&>button]:flex-1" aria-label="Vizualizare" />
					<Button asChild variant="ghost" size="sm" className="max-md:h-11">
						<Link href="/calendar/">
							Calendar <ArrowRight />
						</Link>
					</Button>
				</div>
			</header>
			<InShopStrip
				groups={groups}
				total={visits.inService.length}
				filter={stage}
				onClearFilter={() => applyStage(null)}
				vehicles={vehicles}
				customers={customers}
				staff={staffMap}
				settings={settings}
				today={today}
				focus={focus}
				onHover={setHovered}
				targetFor={(visit) => visit.appointment ?? appointmentForJob(visit.order, appointments, today)}
				onReveal={reveal}
				onOpen={(visit) => {
					setHovered(null);
					openDetail("work-order", visit.order.id);
				}}
			/>
			<StageLine counts={model.counts} value={stage} onChange={applyStage} />
			<div className="relative">
				<Timeline
					key={`${today}:${zoom}`}
					ref={timeline}
					zoom={zoom}
					today={today}
					settings={settings}
					visits={visits}
					staff={staff}
					customers={customers}
					filter={stage}
					focus={focus}
					initial={opening}
					onView={onView}
					onOpen={openBooking}
					onCreate={create}
					onPickDay={(day) => changeZoom("day", day)}
					onHover={setHovered}
				/>
				{/* Nothing to show in view: the timeline stays (free time can still be tapped) and says why, or offers the next booking. */}
				{stage && shownBookings.length === 0 && model.bookings.length > 0 && (
					<p className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-md border bg-card px-2.5 py-1 text-xs text-muted-foreground shadow-xs">
						Nicio programare în etapa „{VISIT_STAGE[stage].label}” aici
					</p>
				)}
				{model.bookings.length === 0 && nextDay && (
					<Button size="sm" variant="outline" className="absolute right-3 bottom-3 z-30 bg-card shadow-xs max-md:h-11" onClick={() => jumpTo(nextDay, minuteOfDay(byDay.get(nextDay).find(isActiveAppointment).start))}>
						Următoarea: {fmtDate(nextDay, "EEE, d MMM")} <ArrowRight />
					</Button>
				)}
			</div>
			{/* The selected visit, docked under the timeline so nothing above it moves: what it is, and what can be done with it. */}
			{selection && (
				<div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-2.5 md:px-5">
					<p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
						<CalendarSearch className="size-3.5 shrink-0 text-brand" aria-hidden />
						<span className="truncate">
							<span className="font-semibold">{pickedName}</span> · {pickedWhen} · {VISIT_STAGE[selectedVisit.stage].label}
						</span>
					</p>
					<div className="flex items-center gap-1.5">
						{canCheckIn && (
							<Button size="sm" className="max-md:h-11" onClick={() => openSheet("checkin", { appointmentId: picked.id })}>
								<CarFront /> Primire
							</Button>
						)}
						<Button size="sm" variant="outline" className="max-md:h-11" onClick={() => openDetail("appointment", picked.id)}>
							Deschide
						</Button>
						{selectedVisit.order && (
							<Button size="sm" variant="outline" className="max-md:h-11" onClick={() => openDetail("work-order", selectedVisit.order.id)}>
								Lucrarea {fmtWorkOrder(selectedVisit.order.number)}
							</Button>
						)}
						<Button size="icon" variant="ghost" className="size-11 md:size-8" onClick={() => setSelected(null)} aria-label={`Renunță la selecție: ${pickedName}, ${pickedWhen}`}>
							<X />
						</Button>
					</div>
				</div>
			)}
		</Card>
	);
}
