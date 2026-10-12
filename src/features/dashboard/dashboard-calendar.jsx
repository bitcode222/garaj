"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Card } from "@/components/ds/card";
import { EmptyState } from "@/components/ds/data";
import { Segmented } from "@/components/ds/inputs";
import { MakeLogo } from "@/components/ds/make-logo";
import { ToneDot } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { isActiveAppointment } from "@/domain/appointment";
import { formatPlate, vehicleName } from "@/domain/vehicle";
import { VISIT_STAGES, countStages, defaultCalendarView, jobsWithoutBooking, visitStage } from "@/domain/visit";
import { fmtDate, fmtWorkOrder, plural } from "@/lib/format";
import { VISIT_STAGE } from "@/lib/labels";
import { useOpenDetail } from "@/lib/detail-mode";
import { openSheet } from "@/lib/sheets";
import { useCollection, useSettings } from "@/lib/store/hooks";
import { selectActive, selectAppointmentsByDay } from "@/lib/store/selectors";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { atMinute, navigate, rangeLabel, timeBounds, toMinutes, viewRange, weekDays } from "@/features/calendar/utils";
import { DayTimeline, WeekStrip, stageClass } from "./visit-timeline";

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

/** Open jobs no shown booking stands for (walk-ins, cars from earlier days): the calendar's "all-day" row. */
function InShopStrip({ jobs, vehicles, onOpen }) {
	if (!jobs.length) return null;
	return (
		<div className="flex flex-col gap-1.5 border-t px-4 py-2.5 md:flex-row md:items-start md:gap-3 md:px-5">
			<p className="shrink-0 text-2xs font-medium tracking-wider text-muted-foreground uppercase md:pt-1.5">Deja în service · {jobs.length}</p>
			<ul className="no-scrollbar -mx-4 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
				{jobs.map((order) => {
					const vehicle = vehicles[order.vehicleId];
					const name = vehicleName(vehicle) || `Lucrarea ${fmtWorkOrder(order.number)}`;
					const label = [name, vehicle?.plate && formatPlate(vehicle.plate), VISIT_STAGE[order.status].label, fmtWorkOrder(order.number)].filter(Boolean).join(" · ");
					return (
						<li key={order.id} className="shrink-0">
							<button
								type="button"
								onClick={() => onOpen(order)}
								title={label}
								aria-label={label}
								className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-md border px-2 text-xs md:min-h-7", stageClass(order.status))}
							>
								{vehicle && <MakeLogo make={vehicle.make} className="size-3.5" />}
								<span className="font-medium">{name}</span>
								{vehicle?.plate && <span className="tabular-nums opacity-70">{formatPlate(vehicle.plate)}</span>}
							</button>
						</li>
					);
				})}
			</ul>
		</div>
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
	const staff = selectActive(useCollection("staff"));
	const byDay = selectAppointmentsByDay(appointments);

	const suggested = defaultCalendarView(byDay.get(today));
	const [auto, setAuto] = useState({ day: today, view: suggested });
	const [choice, setChoice] = useState(null);
	const [picked, setPicked] = useState(null);
	const [stage, setStage] = useState(null);
	// A new day (app left open overnight) starts fresh: default view, today, no filter.
	if (auto.day !== today) {
		setAuto({ day: today, view: suggested });
		setChoice(null);
		setPicked(null);
		setStage(null);
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

	const isShown = (a) => !stage || model.stageOf.get(a.id) === stage;
	const shownBookings = stage ? model.bookings.filter(isShown) : model.bookings;
	const shownJobs = stage ? model.inShop.filter((o) => o.status === stage) : model.inShop;

	const create = ({ start, staffId } = {}) => openSheet("appointment", { start, staffId });
	const open = (a) => openDetail("appointment", a.id);
	const pickDay = (day) => {
		setPicked(day);
		setChoice("day");
	};
	// "Add" from an empty range books into it: today takes the form's next free slot, another day its opening hour.
	const anchor = onToday ? today : model.days[0];
	const createHere = () => create(anchor === today ? {} : { start: atMinute(anchor, toMinutes(settings.hours.open)) });

	const title = view === "day" ? (date === today ? "Programul de azi" : fmtDate(date, "EEEE, d MMMM")) : onToday ? "Săptămâna aceasta" : rangeLabel("week", date);
	const summary = [plural(model.bookings.length, "programare", "programări"), model.inShop.length ? `${model.inShop.length} deja în service` : null].filter(Boolean).join(" · ");
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
								<Button size="sm" variant="outline" className="max-md:h-11" onClick={() => setPicked(nextDay)}>
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
						<Button size="sm" variant="outline" className="max-md:h-11" onClick={() => setStage(null)}>
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
			/>
		);
	}

	return (
		<Card className="mb-6 overflow-hidden">
			<header className="flex flex-col gap-3 p-4 pb-3 md:p-5 md:pb-3 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex min-w-0 items-center gap-2">
					<Button variant="outline" size="icon" className="size-11 shrink-0 md:size-8" onClick={() => setPicked(navigate(view, date, "prev"))} aria-label={view === "day" ? "Ziua anterioară" : "Săptămâna anterioară"}>
						<ChevronLeft />
					</Button>
					<Button variant="outline" size="icon" className="size-11 shrink-0 md:size-8" onClick={() => setPicked(navigate(view, date, "next"))} aria-label={view === "day" ? "Ziua următoare" : "Săptămâna următoare"}>
						<ChevronRight />
					</Button>
					<div className="min-w-0 pl-1">
						<h2 className="truncate text-heading first-letter:uppercase">{title}</h2>
						<p className="truncate text-xs text-muted-foreground">{view === "week" && onToday ? `${rangeLabel("week", date)} · ${summary}` : summary}</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{!onToday && (
						<Button variant="outline" size="sm" className="max-md:h-11" onClick={() => setPicked(null)}>
							Azi
						</Button>
					)}
					<Segmented value={view} onValueChange={setChoice} options={VIEWS} className="max-md:h-11 max-md:flex-1 max-md:[&>button]:flex-1" aria-label="Vizualizare" />
					<Button asChild variant="ghost" size="sm" className="max-md:h-11">
						<Link href="/calendar/">
							Calendar <ArrowRight />
						</Link>
					</Button>
				</div>
			</header>
			<StageLine counts={model.counts} value={stage} onChange={setStage} />
			<InShopStrip jobs={shownJobs} vehicles={vehicles} onOpen={(order) => openDetail("work-order", order.id)} />
			{body}
		</Card>
	);
}
