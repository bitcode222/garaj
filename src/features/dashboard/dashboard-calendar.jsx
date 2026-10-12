"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarDays, CalendarPlus, CalendarSearch, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Card } from "@/components/ds/card";
import { EmptyState, Initials, Money } from "@/components/ds/data";
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
import { atMinute, minuteOfDay, navigate, toMinutes, viewRange, weekDays } from "@/features/calendar/utils";
import { Timeline } from "./timeline";
import { DAYS_AHEAD, DAYS_BACK } from "./timeline-geometry";
import { LIT, WeekStrip, hoverHandlers, stageClass } from "./visit-timeline";

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
 * Every car in the shop, as a carousel of cards: make logo, car and plate,
 * customer, mechanic, job number, time in and the total. It is the shop right
 * now, so it does not change with the day the timeline shows.
 * Phones swipe (snap per card); from md up the arrows scroll it. With a stage
 * filter on, the title says so and carries the way out, and the list (keyed by the
 * filter) restarts at its first card.
 */
function InShopStrip({ jobs, total, filter, onClearFilter, vehicles, customers, staff, settings, onOpen, hovered, onHover, selectedOrderId, targetFor, onReveal }) {
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
		cards.observe(el, { childList: true });
		el.addEventListener("scroll", measure, { passive: true });
		return () => {
			resize.disconnect();
			cards.disconnect();
			el.removeEventListener("scroll", measure);
			track.current = null;
		};
	}, []);
	if (!total) return null;

	const step = (direction) => {
		const el = track.current;
		const card = el?.firstElementChild;
		if (!el || !card) return;
		el.scrollBy({ left: direction * (card.offsetWidth + 12), behavior: "smooth" });
	};
	const stageLabel = filter ? VISIT_STAGE[filter].label : null;

	return (
		<section aria-label="Deja în service" className="flex flex-col gap-2.5 border-t px-4 pt-2.5 pb-4 md:flex-row md:items-start md:gap-4 md:px-5 md:pt-3 md:pb-5">
			<div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 md:w-44 md:flex-col md:items-start md:pt-1.5">
				<p className="text-2xs font-medium tracking-wider text-muted-foreground uppercase">Deja în service · {filter ? `${jobs.length} din ${total}` : total}</p>
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
				{jobs.length > 0 && (
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
			{jobs.length === 0 && <p className="flex-1 py-1.5 text-sm text-muted-foreground">Nicio mașină din service nu e în etapa „{stageLabel}”.</p>}
			{jobs.length > 0 && (
				<ul
					key={filter ?? "all"}
					ref={attach}
					className="no-scrollbar -mx-4 -my-1 flex min-w-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 py-1 md:mx-0 md:-mx-1 md:scroll-px-1 md:px-1 md:py-1"
				>
					{jobs.map((order) => {
						const vehicle = vehicles[order.vehicleId];
						const customer = customers[order.customerId];
						const mechanic = order.staffId ? staff[order.staffId] : null;
						const target = targetFor?.(order) ?? null;
						const name = vehicleName(vehicle) || `Lucrarea ${fmtWorkOrder(order.number)}`;
						const total = computeTotals(order.lines, { vatPayer: settings.invoicing.vatPayer }).gross;
						const since = order.dates?.in_progress ?? order.dates?.approved ?? order.createdAt;
						const label = [name, vehicle?.plate && formatPlate(vehicle.plate), customer?.name, VISIT_STAGE[order.status].label, fmtWorkOrder(order.number)]
							.filter(Boolean)
							.join(" · ");
						return (
							<li key={order.id} {...hoverHandlers(order.vehicleId, onHover)} className="group relative w-[min(72vw,14.5rem)] shrink-0 snap-start md:w-60">
								<button
									type="button"
									onClick={() => onOpen(order)}
									aria-label={label}
									className={cn(
										"flex h-full w-full flex-col gap-2 rounded-lg border p-2.5 text-left transition-[filter,opacity,box-shadow] hover:brightness-95 active:scale-[0.99]",
										stageClass(order.status),
										(order.id === selectedOrderId || (hovered && order.vehicleId === hovered)) && LIT,
									)}
								>
									<span className="flex items-center gap-2.5 pr-8">
										<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-card/70">
											<MakeLogo make={vehicle?.make} className="size-4.5" />
										</span>
										<span className="min-w-0 flex-1">
											<span className="block truncate text-xs font-semibold">{name}</span>
											<span className="flex items-center gap-1.5 text-2xs opacity-80">
												{vehicle?.plate && <span translate="no" className="font-mono tracking-wide uppercase">{formatPlate(vehicle.plate)}</span>}
												<span className="tabular-nums">{fmtWorkOrder(order.number)}</span>
											</span>
										</span>
									</span>
									<span className="truncate text-2xs font-medium">{customer?.name ?? "Client necunoscut"}</span>
									<span className="mt-auto flex items-center justify-between gap-2 border-t border-current/15 pt-2 text-2xs">
										<span className="flex min-w-0 items-center gap-1.5">
											{mechanic ? <Initials name={mechanic.name} tone={mechanic.color} size="sm" className="size-5" /> : null}
											<span className="truncate opacity-80">{mechanic?.name ?? "Fără mecanic"} · {fmtDate(since, "d MMM")}</span>
										</span>
										<span className="shrink-0 text-right font-semibold tabular-nums">
											<Money value={total} decimals={0} />
										</span>
									</span>
								</button>
								{target && (
									<button
										type="button"
										onClick={() => onReveal(order, target)}
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
			)}
		</section>
	);
}

const NONE = [];

/**
 * The dashboard's calendar (docs/DASHBOARD-CALENDAR.md). Zi is the continuous
 * timeline: days side by side, scrolled through, with the day in view written
 * between the ‹ › buttons. Săptămână is still the paged strip of day columns
 * (it becomes the timeline's second zoom in phase 3). Opens on Zi when something
 * is booked today, otherwise on Săptămână; decided once per day.
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
	const workDays = settings.hours.days;

	const suggested = defaultCalendarView(byDay.get(today));
	const [auto, setAuto] = useState({ day: today, view: suggested });
	const [choice, setChoice] = useState(null);
	// Săptămână: the week shown. Zi: where the timeline opens (it then keeps its own scroll position).
	const [picked, setPicked] = useState(null);
	// Zi: a booking to open the timeline on, when "Arată în calendar" comes from Săptămână.
	const [opening, setOpening] = useState(null);
	// Zi: what the timeline reports while it scrolls: the day in view (live), the day it settled on, and whether today is in view.
	const [seen, setSeen] = useState(null);
	const [stage, setStage] = useState(null);
	// Two states on purpose (D6): the car under the pointer or keyboard focus is transient;
	// the visit chosen with "Arată în calendar" stays until it is dismissed.
	const [hovered, setHovered] = useState(null);
	const [selected, setSelected] = useState(null); // { appointmentId, orderId }
	const timeline = useRef(null);
	const dateInput = useRef(null);
	// A new day (app left open overnight) starts fresh: default view, now, no filter, nothing selected.
	if (auto.day !== today) {
		setAuto({ day: today, view: suggested });
		setChoice(null);
		setPicked(null);
		setOpening(null);
		setSeen(null);
		setStage(null);
		setHovered(null);
		setSelected(null);
	}
	const view = choice ?? auto.view;
	const zi = view === "day";
	const opensOn = opening?.day ?? picked ?? today;
	// The label follows the scroll live; everything computed from the day waits until scrolling stops (D8).
	const labelDay = zi ? (seen?.day ?? opensOn) : (picked ?? today);
	const date = zi ? (seen?.settled ?? opensOn) : (picked ?? today);
	const range = viewRange(view, date);
	const onToday = zi ? (seen ? seen.todayVisible : opensOn === today) : today >= range.from && today <= range.to;

	const onView = useCallback(({ day, todayVisible, settled }) => {
		setSeen((prev) => {
			const next = { day, todayVisible, settled: settled ? day : (prev?.settled ?? day) };
			return prev && prev.day === next.day && prev.todayVisible === next.todayVisible && prev.settled === next.settled ? prev : next;
		});
	}, []);

	const model = useMemo(() => {
		const bookingsOf = (day) => visits.bookingsByDay.get(day) ?? NONE;
		const candidates = zi ? [date] : weekDays(date);
		// Week: Monday to Saturday, and Sunday only when the shop works, something is booked, or it is today.
		const days = zi ? candidates : candidates.filter((d, i) => i < 6 || d === today || bookingsOf(d).length > 0 || workDays.includes(0));
		const bookings = days.flatMap(bookingsOf);
		// The line counts what the section shows: every car in service, plus the bookings in view, each visit once.
		const inService = new Set(visits.inService);
		const counts = countStages([...visits.inService.map((visit) => visit.stage), ...bookings.filter((visit) => !inService.has(visit)).map((visit) => visit.stage)]);
		return {
			days,
			bookings,
			counts,
			// What the week strip still takes: bookings as appointments, and their stages.
			eventsByDay: new Map(days.map((d) => [d, bookingsOf(d).map((visit) => visit.appointment)])),
			stageOf: new Map(bookings.map((visit) => [visit.id, visit.stage])),
		};
	}, [zi, date, today, visits, workDays]);

	// Where to send the user when nothing is booked in view.
	const nextDay = useMemo(() => {
		let best = null;
		for (const [day, list] of byDay) if (day > range.to && (!best || day < best) && list.some(isActiveAppointment)) best = day;
		return best;
	}, [byDay, range.to]);

	// A selection is only as alive as its booking: deleted or cancelled, and it is gone without anyone clearing it.
	const selectedBooking = selected ? appointments[selected.appointmentId] : null;
	const selection = selectedBooking && selectedBooking.status !== "cancelled" ? selected : null;

	// Filter lifetime (D7): it stays while moving between days, and goes on a second tap, ✕, Esc,
	// a switch between Zi and Săptămână, and "Azi". Whatever changes the lists also drops the hover,
	// because no pointer-leave fires for an element that was removed from under the pointer.
	const applyStage = (next) => {
		setStage(next);
		setHovered(null);
	};
	const changeView = (next) => {
		if (next === view) return;
		// Săptămână takes over the week of the day in view; Zi opens on the week's day (or on today).
		if (next === "week") setPicked(date);
		setOpening(null);
		setSeen(null);
		setChoice(next);
		setStage(null);
		setHovered(null);
	};
	const step = (direction) => {
		setHovered(null);
		if (zi) timeline.current?.step(direction);
		else setPicked(navigate("week", date, direction));
	};
	const goToday = () => {
		setStage(null);
		setHovered(null);
		if (zi) timeline.current?.goToNow();
		else setPicked(null);
	};
	/** A day chosen in the date picker, or the next booking: the start of that day (or the given time). */
	const jumpTo = (day, minute) => {
		setHovered(null);
		if (zi) timeline.current?.goTo({ day, minute, align: 0 });
		else setPicked(day);
	};
	const pickDay = (day) => {
		setPicked(day);
		changeView("day");
	};

	// Card → calendar: travel to the booking and select it; the filter goes only if it would hide the booking.
	const reveal = (order, appointment) => {
		const target = visits.byId.get(appointment.id);
		if (stage && target?.stage !== stage) setStage(null);
		setHovered(null);
		setSelected({ appointmentId: appointment.id, orderId: order.id });
		const at = { day: dayOfInstant(appointment.start), minute: minuteOfDay(appointment.start), align: 0.5, focusId: appointment.id };
		if (zi) {
			timeline.current?.goTo(at);
		} else {
			setOpening(at);
			setSeen(null);
			setChoice("day");
		}
	};

	const onKeyDown = (event) => {
		if (event.key !== "Escape" || event.defaultPrevented) return;
		if (selection) setSelected(null);
		else if (stage) applyStage(null);
		else return;
		event.stopPropagation();
	};

	const isShown = (a) => !stage || model.stageOf.get(a.id) === stage;
	const shownBookings = stage ? model.bookings.filter((visit) => visit.stage === stage) : model.bookings;
	const shownCars = stage ? visits.inService.filter((visit) => visit.stage === stage) : visits.inService;

	const create = useCallback(({ start, staffId } = {}) => openSheet("appointment", { start, staffId }), []);
	const openBooking = useCallback(
		(booking) => {
			setHovered(null);
			openDetail("appointment", booking.id);
		},
		[openDetail],
	);
	// "Add" from an empty week books into it: this week takes the form's next free slot, another week its first day's opening hour.
	const createHere = () => create(onToday ? {} : { start: atMinute(model.days[0], toMinutes(settings.hours.open)) });

	const near = diffDaysISO(today, labelDay);
	const week = weekDays(date);
	// Zi: "marți, 13 oct. · azi". Săptămână: "12 – 18 oct. 2026", short enough for the same fixed width.
	const label = zi ? fmtDate(labelDay, "EEEE, d MMM") : `${fmtDate(week[0], week[0].slice(0, 7) === week[6].slice(0, 7) ? "d" : "d MMM")} – ${fmtDate(week[6], "d MMM yyyy")}`;
	const labelNote = zi && Math.abs(near) <= 1 ? fmtDays(near) : null;
	const summary = `${plural(model.bookings.length, "programare", "programări")} · ${visits.inService.length} în service`;
	// While a car is hovered or focused, say how many of its visits this view shows.
	const hoveredName = hovered ? vehicleName(vehicles[hovered]) || "Mașina" : null;
	const hoveredCount = hovered ? model.bookings.filter((visit) => visit.vehicleId === hovered).length : 0;
	const hoveredSummary = `${hoveredName} · ${hoveredCount ? plural(hoveredCount, "programare în afișaj", "programări în afișaj") : "nicio programare în afișaj"}`;
	const selectedLabel = selection
		? `${vehicleName(vehicles[selectedBooking.vehicleId]) || selectedBooking.title || "Programare"} · ${fmtDate(selectedBooking.start, "EEE, d MMM")} ${fmtTime(selectedBooking.start)}`
		: null;

	let body;
	if (zi) {
		body = (
			<div className="relative">
				<Timeline
					key={today}
					ref={timeline}
					today={today}
					settings={settings}
					visits={visits}
					staff={staff}
					customers={customers}
					filter={stage}
					hovered={hovered}
					selectedId={selection?.appointmentId}
					initial={opening ?? { day: picked ?? today }}
					onView={onView}
					onOpen={openBooking}
					onCreate={create}
					onHover={setHovered}
				/>
				{/* Nothing booked on the day in view: the timeline stays (free time can still be tapped) and offers the next booking. */}
				{model.bookings.length === 0 && nextDay && (
					<Button size="sm" variant="outline" className="absolute right-3 bottom-3 z-30 bg-card shadow-xs max-md:h-11" onClick={() => jumpTo(nextDay, minuteOfDay(byDay.get(nextDay).find(isActiveAppointment).start))}>
						Următoarea: {fmtDate(nextDay, "EEE, d MMM")} <ArrowRight />
					</Button>
				)}
			</div>
		);
	} else if (!model.bookings.length) {
		body = (
			<div className="border-t p-4 md:p-5">
				<EmptyState
					compact
					icon={CalendarDays}
					title="Nicio programare în această săptămână"
					action={
						<div className="flex flex-wrap justify-center gap-2">
							<Button size="sm" className="max-md:h-11" onClick={createHere}>
								<CalendarPlus /> Adaugă programare
							</Button>
							{nextDay && (
								<Button size="sm" variant="outline" className="max-md:h-11" onClick={() => jumpTo(nextDay)}>
									Următoarea: {fmtDate(nextDay, "EEE, d MMM")}
								</Button>
							)}
						</div>
					}
				/>
			</div>
		);
	} else if (!shownBookings.length) {
		body = (
			<div className="border-t p-4 md:p-5">
				<EmptyState
					compact
					title={`Nicio programare în etapa „${VISIT_STAGE[stage].label}”`}
					description={shownCars.length ? "Mașinile din această etapă sunt în lista „Deja în service” de mai sus." : "În săptămâna afișată nu e nimic în această etapă."}
					action={
						<Button size="sm" variant="outline" className="max-md:h-11" onClick={() => applyStage(null)}>
							Arată tot
						</Button>
					}
				/>
			</div>
		);
	} else {
		body = (
			<WeekStrip
				key={model.days[0]}
				days={model.days}
				today={today}
				eventsByDay={model.eventsByDay}
				stageOf={model.stageOf}
				isShown={isShown}
				filtered={Boolean(stage)}
				workDays={workDays}
				customers={customers}
				onOpen={openBooking}
				onPickDay={pickDay}
				hovered={hovered}
				onHover={setHovered}
				selectedId={selection?.appointmentId}
			/>
		);
	}

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
								value={labelDay}
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
					<p className="truncate text-xs text-muted-foreground">{hovered ? hoveredSummary : summary}</p>
				</div>
				<div className="flex items-center gap-2">
					{!onToday && (
						<Button variant="outline" size="sm" className="max-md:h-11" onClick={goToday}>
							Azi
						</Button>
					)}
					<Segmented value={view} onValueChange={changeView} options={VIEWS} className="max-md:h-11 max-md:flex-1 max-md:[&>button]:flex-1" aria-label="Vizualizare" />
					<Button asChild variant="ghost" size="sm" className="max-md:h-11">
						<Link href="/calendar/">
							Calendar <ArrowRight />
						</Link>
					</Button>
				</div>
			</header>
			{selection && (
				<div className="px-4 pb-2.5 md:px-5">
					<button
						type="button"
						onClick={() => setSelected(null)}
						aria-label={`Renunță la selecție: ${selectedLabel}`}
						className="inline-flex h-11 max-w-full items-center gap-1.5 rounded-md border border-brand/40 bg-brand/[0.06] px-2.5 text-xs font-medium transition-colors hover:bg-brand/10 md:h-7"
					>
						<CalendarSearch className="size-3.5 shrink-0" aria-hidden />
						<span className="truncate first-letter:uppercase">{selectedLabel}</span>
						<X className="size-3.5 shrink-0 opacity-70" aria-hidden />
					</button>
				</div>
			)}
			<InShopStrip
				jobs={shownCars.map((visit) => visit.order)}
				total={visits.inService.length}
				filter={stage}
				onClearFilter={() => applyStage(null)}
				vehicles={vehicles}
				customers={customers}
				staff={staffMap}
				settings={settings}
				hovered={hovered}
				onHover={setHovered}
				selectedOrderId={selection?.orderId}
				targetFor={(order) => visits.byOrder.get(order.id)?.appointment ?? appointmentForJob(order, appointments, today)}
				onReveal={reveal}
				onOpen={(order) => {
					setHovered(null);
					openDetail("work-order", order.id);
				}}
			/>
			<StageLine counts={model.counts} value={stage} onChange={applyStage} />
			{body}
		</Card>
	);
}
