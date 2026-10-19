"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarSearch, CarFront, ChevronLeft, ChevronRight, MessageCircle, Wrench, X } from "lucide-react";
import { Card } from "@/components/ds/card";
import { CardButton, CardSection, CornerButton, PartMark, SectionCard, SectionLine } from "@/components/ds/card-section";
import { Segmented } from "@/components/ds/inputs";
import { Button } from "@/components/ui/button";
import { isActiveAppointment } from "@/domain/appointment";
import { whatsappHref } from "@/domain/customer";
import { readyMessage } from "@/domain/work-order";
import { addDaysISO, dayOfInstant, diffDaysISO } from "@/domain/dates";
import { vehicleName } from "@/domain/vehicle";
import { VISIT_STAGES, arrivalDelay, countStages, defaultCalendarView, visitTiming } from "@/domain/visit";
import { fmtDate, fmtDays, fmtTime, fmtWorkOrder, plural } from "@/lib/format";
import { VISIT_STAGE } from "@/lib/labels";
import { useOpenDetail } from "@/lib/detail-mode";
import { openSheet } from "@/lib/sheets";
import { useCollection, useSettings } from "@/lib/store/hooks";
import { selectActive, selectAppointmentsByDay, selectVisits } from "@/lib/store/selectors";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { useNowMinute } from "@/lib/hooks";
import { useReschedule } from "@/features/calendar/use-reschedule";
import { atMinute, minuteOfDay } from "@/features/calendar/utils";
import { Timeline } from "./timeline";
import { DAYS_AHEAD, DAYS_BACK } from "./timeline-geometry";
import { NO_FOCUS, hoverHandlers, litAs, litClass, stageClass, timingClass, timingText, visitText } from "./visit-ui";
import { VisitCard, visitFacts, whenText } from "./visit-card";

const VIEWS = [
	{ value: "day", label: "Zi" },
	{ value: "week", label: "Săptămână" },
];

function StageMark({ stage }) {
	const meta = VISIT_STAGE[stage];
	return <PartMark tone={meta.tone} outline={meta.outline} />;
}

/**
 * The status line: one bar split by stage and a legend with counts. It describes
 * exactly what the cards and the calendar below show, and it is the filter: a tap on
 * a colour (bar or legend) keeps only that stage, a second tap on it clears the filter.
 */
function StageLine({ counts, value, onChange }) {
	// The chosen stage stays listed at 0, so the filter can always be seen and cleared.
	const parts = VISIT_STAGES.filter((s) => counts[s] > 0 || s === value).map((s) => ({ key: s, label: VISIT_STAGE[s].label, value: counts[s], tone: VISIT_STAGE[s].tone, outline: VISIT_STAGE[s].outline }));
	return <SectionLine parts={parts} value={value} onChange={onChange} label="Arată o singură etapă" />;
}

/**
 * Every car in the shop, always (it is the shop right now, whatever day the timeline
 * shows), in the cards form (docs/HOME-PAGE.md D3, D8): grouped by stage, in the status
 * line's order. A card says what the car's place on the calendar says, in the same words:
 * make and model, what it is in for, and what the clock says about it ("de 2 h în
 * service", "gata de 2 zile"). It also says where that place is (its booking, or the time
 * it was received when it came without one) and carries a button that travels there; a
 * finished car's card also tells its customer on WhatsApp. With a stage filter on, the
 * title says so and carries the way out. `children` is the status line.
 */
function InShopStrip({ groups, total, filter, onClearFilter, lookups, focus, onHover, onReveal, onOpen, children }) {
	const litCard = focus.origin ?? focus.selected;
	const stageLabel = filter ? VISIT_STAGE[filter].label : null;
	const shown = groups.reduce((sum, group) => sum + group.visits.length, 0);
	return (
		<CardSection
			label="Deja în service"
			count={total}
			countText={filter ? `${shown} din ${total}` : undefined}
			href="/work-orders/"
			filter={filter ? { label: stageLabel, onClear: onClearFilter } : null}
			groups={groups.map((group) => ({ key: group.stage, label: VISIT_STAGE[group.stage].label, mark: <StageMark stage={group.stage} />, items: group.visits }))}
			arrows={{ back: "Mașina anterioară", forward: "Mașina următoare" }}
			reveal={litCard ? `[data-visit="${litCard}"]` : null}
			empty={{ text: "Nicio mașină în service acum.", action: { label: "Primire mașină", icon: Wrench, onClick: () => openSheet("checkin") } }}
			filteredOut={`Nicio mașină din service nu e în etapa „${stageLabel}”.`}
			renderCard={(visit) => {
				const order = visit.order;
				const facts = visitFacts(visit, lookups);
				const label = [facts.name, facts.plate, facts.subject, facts.customer, facts.mechanic?.name, facts.timing?.text, facts.anchor, VISIT_STAGE[order.status].label, facts.number].filter(Boolean).join(" · ");
				const customer = lookups.customers[visit.customerId];
				// A finished car: its customer is told from the card, the old "Gata de predare" message.
				const phone = order.status === "ready" ? customer?.phone : null;
				return (
					<SectionCard
						key={visit.id}
						{...hoverHandlers(visit.id, onHover)}
						corner={
							<>
								{phone && (
									<CornerButton
										icon={MessageCircle}
										label={`Anunță pe WhatsApp că ${facts.name} e gata`}
										title="Anunță clientul că e gata"
										href={whatsappHref(phone, readyMessage({ customer, vehicle: lookups.vehicles[visit.vehicleId], settings: lookups.settings }))}
									/>
								)}
								<CornerButton quiet icon={CalendarSearch} label={`Arată în calendar: ${facts.name}, ${facts.anchor}`} title="Arată în calendar" onClick={() => onReveal(visit)} />
							</>
						}
					>
						<CardButton data-visit={visit.id} onClick={() => onOpen(visit)} aria-label={label} look={stageClass(order.status)} lit={litClass(litAs(visit, focus))}>
							<VisitCard facts={facts} topPad={phone ? "pr-[4.75rem]" : "pr-8"} />
						</CardButton>
					</SectionCard>
				);
			}}
		>
			{children}
		</CardSection>
	);
}

const NONE = [];

/**
 * The dashboard's calendar (docs/DASHBOARD-CALENDAR.md): the cars in service, the
 * status line that is also the filter, and one timeline of days that is scrolled
 * through at two zooms, Zi and Săptămână. The day or range in view is written
 * between the ‹ › buttons. Opens on Zi when something is booked today, otherwise
 * on Săptămână; decided once per day. At the Zi zoom the timeline is edited in
 * place: a booking is drawn on free time, moved, or stretched by an edge (§12).
 */
export function DashboardCalendar({ today }) {
	const settings = useSettings();
	const openDetail = useOpenDetail();
	const reschedule = useReschedule();
	const appointments = useCollection("appointments");
	const workOrders = useCollection("workOrders");
	const customers = useCollection("customers");
	const vehicles = useCollection("vehicles");
	const staffMap = useCollection("staff");
	const staff = selectActive(staffMap);
	const byDay = selectAppointmentsByDay(appointments);
	const visits = selectVisits(appointments, workOrders);
	const now = useNowMinute();
	const nowAt = now == null ? null : atMinute(today, now);

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
	let nextDay = null;
	for (const [day, list] of byDay) if (day > settledTo && (!nextDay || day < nextDay) && list.some(isActiveAppointment)) nextDay = day;

	// A selection is only as alive as its visit: a booking deleted or cancelled, a walk-in's job closed, and it is gone without anyone clearing it.
	const selectedVisit = selected ? (visits.byId.get(selected.id) ?? null) : null;
	const selection = selectedVisit ? selected : null;
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

	// Card → calendar: travel to the car's place on the timeline (its booking, or the pin where it was received) and
	// select it, at the current zoom. A card is only shown when its stage passes the filter, so its place is too.
	const reveal = (visit) => {
		setHovered(null);
		setSelected({ id: visit.id, origin: null, travelled: true });
		timeline.current?.goTo({ day: visit.day, minute: minuteOfDay(visit.start), align: 0.5, focusId: visit.id, reveal: true });
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

	// Free time tapped (start only: the usual length) or drawn across (start and end).
	const create = useCallback(({ start, end, staffId } = {}) => openSheet("appointment", { start, end, staffId }), []);
	// A booking dropped at another time or on another mechanic: saved, and left selected so it is easy to find again.
	const moveBooking = async (appointment, change) => {
		setHovered(null);
		if (await reschedule(appointment, change)) setSelected({ id: appointment.id, origin: null, travelled: false });
	};
	// Opening a booking (or a walk-in's pin, which opens its job) also selects it: when the sheet closes,
	// it and its car's card are still lit.
	// (No manual useCallback: the React Compiler keeps its identity.)
	const openVisit = (visit) => {
		setHovered(null);
		setSelected({ id: visit.id, origin: null, travelled: false });
		if (visit.appointment) openDetail("appointment", visit.appointment.id);
		else openDetail("work-order", visit.order.id);
	};

	const near = diffDaysISO(today, from);
	// Zi: "marți, 13 oct. · azi". Săptămână: the whole days in view, "13 – 18 oct. 2026".
	const label = from === to ? fmtDate(from, "EEEE, d MMM") : `${fmtDate(from, from.slice(0, 7) === to.slice(0, 7) ? "d" : "d MMM")} – ${fmtDate(to, "d MMM yyyy")}`;
	const labelNote = from === to && Math.abs(near) <= 1 ? fmtDays(near) : null;
	// Only what is still current: a booking that was delivered or was a no-show is history, not a programare to do.
	const current = model.bookings.filter((visit) => visit.stage !== "delivered" && visit.stage !== "no_show").length;
	const summary = plural(current, "programare", "programări");
	// Booked for today, more than a quarter of an hour ago, and still not here.
	const lateToday = nowAt ? (visits.bookingsByDay.get(today) ?? NONE).filter((visit) => arrivalDelay(visit.appointment, nowAt) > 0).length : 0;
	// While a visit is hovered or focused, say how many of its car's bookings this view shows.
	const hoveredCount = hoveredCar ? model.bookings.filter((visit) => visit.vehicleId === hoveredCar).length : 0;
	const hoveredSummary = hovered
		? `${vehicleName(vehicles[hoveredCar]) || "Mașina"} · ${hoveredCount ? plural(hoveredCount, "programare în afișaj", "programări în afișaj") : "nicio programare în afișaj"}`
		: null;

	// The selected visit, for the line under the timeline: a booking, or a walk-in (no booking, only its job).
	const picked = selection ? selectedVisit.appointment : null;
	const pickedWhen = selection ? (picked ? `${whenText(today, selectedVisit.start)}–${fmtTime(selectedVisit.end)}` : `primit ${whenText(today, selectedVisit.start)}`) : null;
	const pickedText = selection ? visitText(selectedVisit, vehicles[selectedVisit.vehicleId], customers[selectedVisit.customerId]) : null;
	const pickedName = pickedText?.name ?? null;
	const pickedTiming = selection && nowAt ? timingText(visitTiming(selectedVisit, nowAt)) : null;
	const canCheckIn = picked && ["scheduled", "confirmed"].includes(picked.status) && picked.vehicleId;

	return (
		// One block for the keyboard (Esc clears the selection, then the filter): the timeline in its card, then the cars in service.
		<div className="space-y-6" onKeyDown={onKeyDown}>
			<Card className="overflow-hidden">
				<header className="flex flex-col gap-3 px-4 pt-3 pb-3 md:px-5 lg:flex-row lg:items-center lg:justify-between">
					<h2 className="sr-only">Programul</h2>
					<div className="flex min-w-0 flex-col items-center gap-1 md:items-stretch">
						{/* The day or range in view sits between the arrows, at a fixed width, so the arrows never move (R2). */}
						<div className="flex min-w-0 items-start gap-1.5">
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
									className="flex min-h-11 w-full flex-col items-center justify-center rounded-md px-2 py-1 transition-colors hover:bg-accent md:min-h-8 md:py-0"
								>
									<span className="flex items-center justify-center gap-1.5 text-sm">
										<span aria-live="polite" className="truncate font-semibold first-letter:uppercase">
											{label}
										</span>
										{labelNote && <span className="shrink-0 text-muted-foreground">· {labelNote}</span>}
									</span>
									<span className="truncate text-center text-xs text-muted-foreground">
										{hoveredSummary ?? summary}
										{!hoveredSummary && lateToday > 0 && <span className={cn("font-medium", tone("yellow").text)}> · {lateToday === 1 ? "o mașină întârzie" : `${lateToday} mașini întârzie`}</span>}
									</span>
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
				<div className="relative">
					<Timeline
						key={`${today}:${zoom}`}
						ref={timeline}
						zoom={zoom}
						today={today}
						now={now}
						settings={settings}
						visits={visits}
						staff={staff}
						customers={customers}
						vehicles={vehicles}
						filter={stage}
						focus={focus}
						initial={opening}
						onView={onView}
						onOpen={openVisit}
						onCreate={create}
						onReschedule={moveBooking}
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
						{/* On a phone the line has the full width, above its buttons. What it is in for comes last: it is the first to be cut. */}
						<p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs max-md:basis-full">
							<CalendarSearch className="size-3.5 shrink-0 text-brand" aria-hidden />
							<span className="truncate">
								<span className="font-semibold">{pickedName}</span> · {pickedWhen} · {VISIT_STAGE[selectedVisit.stage].label}
								{pickedTiming && <span className={timingClass(pickedTiming.mark)}> · {pickedTiming.text}</span>}
								{pickedText.subject ? ` · ${pickedText.subject}` : ""}
							</span>
						</p>
						<div className="flex items-center gap-1.5">
							{canCheckIn && (
								<Button size="sm" className="max-md:h-11" onClick={() => openSheet("checkin", { appointmentId: picked.id })}>
									<CarFront /> Primire
								</Button>
							)}
							{picked && (
								<Button size="sm" variant="outline" className="max-md:h-11" onClick={() => openDetail("appointment", picked.id)}>
									Deschide
								</Button>
							)}
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
			<InShopStrip
				groups={groups}
				total={visits.inService.length}
				filter={stage}
				onClearFilter={() => applyStage(null)}
				lookups={{ vehicles, customers, staff: staffMap, settings, today, nowAt }}
				focus={focus}
				onHover={setHovered}
				onReveal={reveal}
				onOpen={(visit) => {
					setHovered(null);
					openDetail("work-order", visit.order.id);
				}}
			>
				<StageLine counts={model.counts} value={stage} onChange={applyStage} />
			</InShopStrip>
		</div>
	);
}
