"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarDays, CalendarPlus, CalendarSearch, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Card } from "@/components/ds/card";
import { EmptyState, Initials, Money } from "@/components/ds/data";
import { Segmented } from "@/components/ds/inputs";
import { MakeLogo } from "@/components/ds/make-logo";
import { ToneDot } from "@/components/ds/tone";
import { computeTotals } from "@/domain/lines";
import { Button } from "@/components/ui/button";
import { isActiveAppointment } from "@/domain/appointment";
import { dayOfInstant } from "@/domain/dates";
import { formatPlate, vehicleName } from "@/domain/vehicle";
import { VISIT_STAGES, appointmentForJob, countStages, defaultCalendarView, jobsWithoutBooking, visitStage } from "@/domain/visit";
import { fmtDate, fmtTime, fmtWorkOrder, plural } from "@/lib/format";
import { VISIT_STAGE } from "@/lib/labels";
import { useOpenDetail } from "@/lib/detail-mode";
import { openSheet } from "@/lib/sheets";
import { useCollection, useSettings } from "@/lib/store/hooks";
import { selectActive, selectAppointmentsByDay } from "@/lib/store/selectors";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { atMinute, navigate, rangeLabel, timeBounds, toMinutes, viewRange, weekDays } from "@/features/calendar/utils";
import { DayTimeline, LIT, WeekStrip, hoverHandlers, stageClass } from "./visit-timeline";

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
 * Cars in the shop that no shown booking stands for, as a carousel of cards: make
 * logo, car and plate, customer, mechanic, job number, time in and the total.
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

/**
 * The dashboard's calendar: today as a timeline or the week as a strip, coloured
 * by visit stage. Opens on the day when something is booked for it, otherwise on
 * the week; the choice is re-made each new day and never while the user looks at it.
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

	const suggested = defaultCalendarView(byDay.get(today));
	const [auto, setAuto] = useState({ day: today, view: suggested });
	const [choice, setChoice] = useState(null);
	const [picked, setPicked] = useState(null);
	const [stage, setStage] = useState(null);
	// Two states on purpose (docs/DASHBOARD-CALENDAR.md, D6): the car under the pointer or keyboard
	// focus is transient; the visit chosen with "Arată în calendar" stays until it is dismissed.
	const [hovered, setHovered] = useState(null);
	const [selected, setSelected] = useState(null); // { appointmentId, orderId }
	// Booking to bring into view after "Arată în calendar": scrolled to once the day it is on has rendered.
	const pendingReveal = useRef(null);
	const [revealTick, setRevealTick] = useState(0);
	// A new day (app left open overnight) starts fresh: default view, today, no filter.
	if (auto.day !== today) {
		setAuto({ day: today, view: suggested });
		setChoice(null);
		setPicked(null);
		setStage(null);
		setHovered(null);
		setSelected(null);
	}
	const view = choice ?? auto.view;
	const date = picked ?? today;
	const range = viewRange(view, date);
	const onToday = today >= range.from && today <= range.to;
	const workDays = settings.hours.days;

	const model = useMemo(() => {
		const stageOf = new Map();
		const eventsByDay = new Map();
		const candidates = view === "day" ? [date] : weekDays(date);
		for (const day of candidates) {
			const list = [];
			for (const a of byDay.get(day) ?? []) {
				const s = visitStage(a, a.workOrderId ? workOrders[a.workOrderId] : null);
				if (!s) continue;
				stageOf.set(a.id, s);
				list.push(a);
			}
			eventsByDay.set(day, list);
		}
		// Week: Monday to Saturday, and Sunday only when the shop works, something is booked, or it is today.
		const days = view === "day" ? candidates : candidates.filter((d, i) => i < 6 || d === today || eventsByDay.get(d).length > 0 || workDays.includes(0));
		const bookings = days.flatMap((d) => eventsByDay.get(d));
		const shownOrders = new Set(bookings.map((a) => a.workOrderId).filter(Boolean));
		const inShop = onToday ? jobsWithoutBooking(Object.values(workOrders), shownOrders) : [];
		const counts = countStages([...bookings.map((a) => stageOf.get(a.id)), ...inShop.map((o) => o.status)]);
		return { stageOf, eventsByDay, days, bookings, inShop, counts };
	}, [view, date, today, onToday, byDay, workOrders, workDays]);

	// Where to send the user when the shown range is empty.
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
		setChoice(next);
		setStage(null);
		setHovered(null);
	};
	const goTo = (day) => {
		setPicked(day);
		setHovered(null);
	};
	const goToday = () => {
		setPicked(null);
		setStage(null);
		setHovered(null);
	};

	// Card → calendar: the booking's day in the day view, selected; the filter goes only if it would hide the booking.
	const reveal = (order, appointment) => {
		if (stage && visitStage(appointment, appointment.workOrderId ? workOrders[appointment.workOrderId] : null) !== stage) setStage(null);
		setPicked(dayOfInstant(appointment.start));
		setChoice("day");
		setHovered(null);
		setSelected({ appointmentId: appointment.id, orderId: order.id });
		pendingReveal.current = appointment.id;
		setRevealTick((n) => n + 1);
	};
	useEffect(() => {
		const id = pendingReveal.current;
		if (!id) return;
		pendingReveal.current = null;
		const block = document.querySelector(`[data-appt="${id}"]`);
		block?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
		// Focus follows the travel: Enter opens the booking, Esc drops the selection, wherever the click came from.
		block?.focus({ preventScroll: true });
	}, [revealTick, date, view]);

	const onKeyDown = (event) => {
		if (event.key !== "Escape" || event.defaultPrevented) return;
		if (selection) setSelected(null);
		else if (stage) applyStage(null);
		else return;
		event.stopPropagation();
	};

	const isShown = (a) => !stage || model.stageOf.get(a.id) === stage;
	const shownBookings = stage ? model.bookings.filter(isShown) : model.bookings;
	const shownJobs = stage ? model.inShop.filter((o) => o.status === stage) : model.inShop;

	const create = ({ start, staffId } = {}) => openSheet("appointment", { start, staffId });
	const open = (a) => {
		setHovered(null);
		openDetail("appointment", a.id);
	};
	const pickDay = (day) => {
		setPicked(day);
		changeView("day");
	};
	// "Add" from an empty range books into it: today takes the form's next free slot, another day its opening hour.
	const anchor = onToday ? today : model.days[0];
	const createHere = () => create(anchor === today ? {} : { start: atMinute(anchor, toMinutes(settings.hours.open)) });

	const title = view === "day" ? (date === today ? "Programul de azi" : fmtDate(date, "EEEE, d MMMM")) : onToday ? "Săptămâna aceasta" : rangeLabel("week", date);
	const summary = [plural(model.bookings.length, "programare", "programări"), model.inShop.length ? `${model.inShop.length} deja în service` : null].filter(Boolean).join(" · ");
	// While a car is hovered or focused, say how many of its visits this view shows.
	const hoveredName = hovered ? vehicleName(vehicles[hovered]) || "Mașina" : null;
	const hoveredCount = hovered ? model.bookings.filter((a) => a.vehicleId === hovered).length : 0;
	const hoveredSummary = `${hoveredName} · ${hoveredCount ? plural(hoveredCount, "programare în afișaj", "programări în afișaj") : "nicio programare în afișaj"}`;
	const selectedLabel = selection
		? `${vehicleName(vehicles[selectedBooking.vehicleId]) || selectedBooking.title || "Programare"} · ${fmtDate(selectedBooking.start, "EEE, d MMM")} ${fmtTime(selectedBooking.start)}`
		: null;
	const emptyTitle = view === "week" ? "Nicio programare în această săptămână" : date === today ? "Nicio programare azi" : "Nicio programare în această zi";

	let body;
	if (!model.bookings.length) {
		body = (
			<div className="border-t p-4 md:p-5">
				<EmptyState
					compact
					icon={CalendarDays}
					title={emptyTitle}
					action={
						<div className="flex flex-wrap justify-center gap-2">
							<Button size="sm" className="max-md:h-11" onClick={createHere}>
								<CalendarPlus /> Adaugă programare
							</Button>
							{nextDay && (
								<Button size="sm" variant="outline" className="max-md:h-11" onClick={() => goTo(nextDay)}>
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
					description={shownJobs.length ? "Mașinile din această etapă sunt în lista „Deja în service” de mai sus." : "În intervalul afișat nu e nimic în această etapă."}
					action={
						<Button size="sm" variant="outline" className="max-md:h-11" onClick={() => applyStage(null)}>
							Arată tot
						</Button>
					}
				/>
			</div>
		);
	} else if (view === "day") {
		body = (
			<DayTimeline
				key={date}
				date={date}
				today={today}
				staff={staff}
				events={model.bookings}
				stageOf={model.stageOf}
				isShown={isShown}
				bounds={timeBounds(settings, model.bookings)}
				customers={customers}
				onOpen={open}
				onCreate={create}
				hovered={hovered}
				onHover={setHovered}
				selectedId={selection?.appointmentId}
			/>
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
				onOpen={open}
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
				<div className="flex min-w-0 items-center gap-2">
					<Button variant="outline" size="icon" className="size-11 shrink-0 md:size-8" onClick={() => goTo(navigate(view, date, "prev"))} aria-label={view === "day" ? "Ziua anterioară" : "Săptămâna anterioară"}>
						<ChevronLeft />
					</Button>
					<Button variant="outline" size="icon" className="size-11 shrink-0 md:size-8" onClick={() => goTo(navigate(view, date, "next"))} aria-label={view === "day" ? "Ziua următoare" : "Săptămâna următoare"}>
						<ChevronRight />
					</Button>
					<div className="min-w-0 pl-1">
						<h2 className="truncate text-heading first-letter:uppercase">{title}</h2>
						<p className="truncate text-xs text-muted-foreground">
							{hovered ? hoveredSummary : view === "week" && onToday ? `${rangeLabel("week", date)} · ${summary}` : summary}
						</p>
					</div>
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
				jobs={shownJobs}
				total={model.inShop.length}
				filter={stage}
				onClearFilter={() => applyStage(null)}
				vehicles={vehicles}
				customers={customers}
				staff={staffMap}
				settings={settings}
				hovered={hovered}
				onHover={setHovered}
				selectedOrderId={selection?.orderId}
				targetFor={(order) => appointmentForJob(order, appointments, today)}
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
