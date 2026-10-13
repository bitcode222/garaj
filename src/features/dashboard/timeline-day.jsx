"use client";

import Link from "next/link";
import { memo } from "react";
import { CarFront, Clock } from "lucide-react";
import { vehicleName } from "@/domain/vehicle";
import { arrivalDelay } from "@/domain/visit";
import { fmtDate, fmtTime, plural } from "@/lib/format";
import { VISIT_STAGE } from "@/lib/labels";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { atMinute, hourLabel, layoutEvents, minuteOfDay } from "@/features/calendar/utils";
import { hoverHandlers, litAs, litClass, stageClass } from "./visit-ui";

// Zi
export const ROW_PX = 52; // every mechanic's row: a 44 px booking, 4 px above and below
export const DAY_LABEL_PX = 24; // the strip with the day's name
export const AXIS_PX = 28; // the strip with the hours
const BLOCK_PX = ROW_PX - 8;

// Săptămână
const MAX_PER_DAY = 5; // bookings listed per day before "+N încă"
/** A week column's height: the day's header, up to five bookings and the "+N încă" row. Fixed, so it never changes while scrolling. */
export const weekHeight = (headPx, chipPx) => headPx + 12 + (MAX_PER_DAY + 1) * (chipPx + 4);

const HOUR_LINES =
	"linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to right, color-mix(in oklch, var(--border) 45%, transparent) 1px, transparent 1px)";

/** "întârzie 25 min", "întârzie 1 h 10 min". */
export const fmtDelay = (minutes) => `întârzie ${minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`}`;

/** Minutes a booked car is late right now (0 for everything else, and when `nowAt` is not given). */
const lateBy = (visit, nowAt) => (nowAt && visit.appointment ? arrivalDelay(visit.appointment, nowAt) : 0);

const isWalkIn = (visit) => visit.kind === "walkin";

/** What a booking, or a walk-in's pin, is: for the tooltip and for screen readers. */
function describe(visit, customer, vehicle, late) {
	if (isWalkIn(visit)) return [vehicleName(vehicle) || "Mașină", customer?.name, `primit ${fmtTime(visit.start)}`, "fără programare", VISIT_STAGE[visit.stage].label].filter(Boolean).join(" · ");
	return [`${fmtTime(visit.start)}–${fmtTime(visit.end)}`, visit.appointment.title, customer?.name, VISIT_STAGE[visit.stage].label, late ? fmtDelay(late) : null].filter(Boolean).join(" · ");
}

const titleOf = (visit, customer, vehicle) => (isWalkIn(visit) ? vehicleName(vehicle) || customer?.name || "Mașină" : visit.appointment.title || customer?.name || "Programare");

const LATE = tone("yellow").text;

/** A closed day with nothing booked: just a marker, at either zoom. */
function SlimDay({ day, left, width }) {
	return (
		<div
			data-day={day}
			title={`${fmtDate(day, "EEEE, d MMMM")} · închis`}
			className="absolute inset-y-0 flex flex-col items-center gap-0.5 border-l bg-muted/40 pt-1 text-muted-foreground"
			style={{ left, width }}
		>
			<span className="text-2xs font-medium capitalize">{fmtDate(day, "EEE").slice(0, 2)}</span>
			<span className="text-xs font-semibold tabular-nums">{Number(day.slice(8))}</span>
			<span className="mt-3 rotate-180 text-2xs [writing-mode:vertical-rl]">închis</span>
		</div>
	);
}

/**
 * One day of the timeline at the Zi zoom (docs/DASHBOARD-CALENDAR.md): its name,
 * its hours, a row per mechanic with the bookings placed by the hour, and on today
 * a line at "now" with the elapsed part shaded. Placed absolutely by the scroller,
 * which renders only the days in view; memoised, so scrolling re-renders nothing
 * that did not change.
 */
export const TimelineDay = memo(function TimelineDay({ day, left, width, slim, isToday, isPast, closed, visits, rows, rowKeyOf, hours, now, nowAt, filter, focus, customers, vehicles, onOpen, onCreate, onHover }) {
	if (slim) return <SlimDay day={day} left={left} width={width} />;

	const span = hours.end - hours.start;
	const hourCount = span / 60;
	const fraction = (minute) => (Math.min(Math.max(minute, hours.start), hours.end) - hours.start) / span;
	const pct = (minute) => `${fraction(minute) * 100}%`;
	const marks = [];
	for (let m = hours.start; m < hours.end; m += 60) marks.push(m);
	const nowIn = now != null && now >= hours.start && now <= hours.end;

	return (
		<div data-day={day} className={cn("absolute inset-y-0 border-l", isToday && "bg-brand/[0.03]")} style={{ left, width }}>
			<div className="border-b" style={{ height: DAY_LABEL_PX }}>
				{/* Sticky: the name stays at the grid's left edge for as long as any part of the day is in view. */}
				<span className="sticky left-0 inline-flex h-full items-center gap-1.5 px-2 text-xs whitespace-nowrap">
					<span className={cn("font-semibold first-letter:uppercase", isPast && "text-muted-foreground")}>{fmtDate(day, "EEEE, d MMM")}</span>
					{isToday && <span className="rounded bg-primary px-1 text-2xs leading-4 font-semibold text-primary-foreground">azi</span>}
					{closed && <span className="text-2xs text-muted-foreground">închis</span>}
				</span>
			</div>
			<div className="relative border-b" style={{ height: AXIS_PX }}>
				{marks.map((m) => (
					<span key={m} className="absolute top-1.5 pl-1.5 text-2xs text-muted-foreground tabular-nums" style={{ left: pct(m) }}>
						{hourLabel(m)}
					</span>
				))}
				{nowIn && <span className="absolute -bottom-1 z-10 size-2 -translate-x-1/2 rounded-full bg-brand" style={{ left: pct(now) }} aria-hidden />}
			</div>

			{rows.map((row) => {
				const placed = layoutEvents(visits.filter((visit) => rowKeyOf(visit) === row.key && (!filter || visit.stage === filter)));
				// Every row is one lane high, so nothing changes height while scrolling. Two overlapping bookings
				// share the lane at half height (one line each); a third and beyond are "+N".
				const extra = placed.filter((p) => p.lane >= 2);
				return (
					<div
						key={row.key}
						role="presentation"
						onClick={(event) => {
							if (event.target !== event.currentTarget) return;
							const rect = event.currentTarget.getBoundingClientRect();
							const minute = hours.start + ((event.clientX - rect.left) / rect.width) * span;
							onCreate({ start: atMinute(day, Math.floor(minute / 30) * 30), staffId: row.staffId });
						}}
						className={cn("relative cursor-copy border-b last:border-b-0", isPast && "bg-muted/30", closed && "bg-muted/40")}
						style={{
							height: ROW_PX,
							backgroundImage: HOUR_LINES,
							backgroundSize: `${100 / hourCount}% 100%, ${50 / hourCount}% 100%`,
							backgroundPosition: "-1px 0",
						}}
					>
						{nowIn && <div className="pointer-events-none absolute inset-y-0 left-0 bg-muted/40" style={{ width: pct(now) }} aria-hidden />}
						{placed.map(({ event: visit, lane, lanes }) => {
							if (lane >= 2) return null;
							const shared = lanes > 1;
							const walkIn = isWalkIn(visit);
							const customer = customers[visit.customerId];
							const vehicle = vehicles[visit.vehicleId];
							const late = lateBy(visit, nowAt);
							const label = describe(visit, customer, vehicle, late);
							const lit = litAs(visit, focus);
							const start = Math.max(minuteOfDay(visit.start), hours.start);
							const rawEnd = minuteOfDay(visit.end) || 24 * 60;
							const end = Math.min(rawEnd <= minuteOfDay(visit.start) ? 24 * 60 : rawEnd, hours.end);
							return (
								<button
									key={visit.id}
									type="button"
									data-appt={visit.id}
									data-kind={visit.kind}
									onClick={() => onOpen(visit)}
									title={label}
									aria-label={label}
									{...hoverHandlers(visit.id, onHover)}
									className={cn(
										"absolute z-[5] flex min-w-7 overflow-hidden border text-left select-none transition-[box-shadow]",
										// A walk-in is a pin at its check-in time: a pill with a car, never mistaken for a booked slot.
										walkIn ? "items-center justify-center rounded-full" : shared ? "items-center rounded-md px-1.5 text-2xs leading-none" : "flex-col justify-center rounded-md px-2 text-xs",
										stageClass(visit.stage),
										lit && cn("z-[6]", litClass(lit)),
										visit.id === focus.arrived && "animate-visit-arrive",
									)}
									style={{
										left: `calc(${pct(start)} + 1px)`,
										width: `calc(${((end - start) / span) * 100}% - 2px)`,
										top: shared ? 4 + lane * (BLOCK_PX / 2 + 1) : 4,
										height: shared ? BLOCK_PX / 2 - 1 : BLOCK_PX,
									}}
								>
									{walkIn ? (
										<CarFront className="size-3.5 shrink-0" aria-hidden />
									) : shared ? (
										<span className="flex min-w-0 items-center gap-1">
											{late > 0 && <Clock className={cn("size-3 shrink-0", LATE)} aria-hidden />}
											<span className="truncate">
												<span className="tabular-nums opacity-80">{fmtTime(visit.start)}</span> <span className="font-semibold">{titleOf(visit, customer, vehicle)}</span>
											</span>
										</span>
									) : (
										<>
											<span className="truncate font-semibold">{titleOf(visit, customer, vehicle)}</span>
											{late > 0 ? (
												<span className={cn("flex min-w-0 items-center gap-1 font-medium", LATE)}>
													<Clock className="size-3 shrink-0" aria-hidden />
													<span className="truncate">{fmtDelay(late)}</span>
												</span>
											) : (
												<span className="truncate tabular-nums opacity-80">
													{fmtTime(visit.start)}–{fmtTime(visit.end)}
													{customer ? ` · ${customer.name}` : ""}
												</span>
											)}
										</>
									)}
								</button>
							);
						})}
						{extra.length > 0 && (
							<Link
								href="/calendar/"
								title={`Încă ${extra.length} suprapuse aici. Vezi ziua în Programări.`}
								className="absolute top-1/2 z-[7] flex h-5 -translate-y-1/2 items-center rounded-full border bg-card px-1.5 text-2xs font-semibold shadow-xs"
								style={{ left: `calc(${pct(minuteOfDay(extra[0].event.start))} + 4px)` }}
							>
								+{extra.length}
							</Link>
						)}
						{nowIn && <div className="pointer-events-none absolute inset-y-0 z-10 border-l-2 border-brand" style={{ left: pct(now) }} aria-hidden />}
					</div>
				);
			})}
		</div>
	);
});

/**
 * One day of the timeline at the Săptămână zoom: a column with the day's header
 * (it opens that day in Zi) and its bookings as chips in time order, five at most,
 * then "+N încă". The selected booking is always among the five.
 */
export const TimelineWeekDay = memo(function TimelineWeekDay({ day, left, width, slim, isToday, isPast, closed, visits, headPx, chipPx, nowAt, filter, focus, customers, vehicles, onOpen, onPickDay, onHover }) {
	if (slim) return <SlimDay day={day} left={left} width={width} />;

	const list = filter ? visits.filter((visit) => visit.stage === filter) : visits;
	const shown = list.slice(0, MAX_PER_DAY);
	const selectedAt = list.findIndex((visit) => visit.id === focus.selected);
	if (selectedAt >= MAX_PER_DAY) shown[MAX_PER_DAY - 1] = list[selectedAt];
	const more = list.length - shown.length;
	const booked = list.filter((visit) => !isWalkIn(visit)).length;

	return (
		<div data-day={day} className={cn("absolute inset-y-0 flex flex-col border-l", isToday ? "bg-brand/[0.04]" : closed && "bg-muted/40")} style={{ left, width }}>
			<button
				type="button"
				onClick={() => onPickDay(day)}
				aria-label={`${fmtDate(day, "EEEE, d MMMM")}: ${plural(booked, "programare", "programări")}. Deschide ziua.`}
				className="flex shrink-0 items-center justify-center gap-1.5 border-b text-xs transition-colors hover:bg-accent/50"
				style={{ height: headPx }}
			>
				<span className={cn("font-medium capitalize", isPast ? "text-muted-foreground/70" : "text-muted-foreground")}>{fmtDate(day, "EEE")}</span>
				<span className={cn("flex size-6 items-center justify-center rounded-full font-semibold tabular-nums", isToday && "bg-primary text-primary-foreground")}>{Number(day.slice(8))}</span>
				{booked > 0 && <span className="text-2xs text-muted-foreground tabular-nums">· {booked}</span>}
			</button>
			<ul className="flex min-h-0 flex-1 flex-col gap-1 p-1.5">
				{shown.map((visit) => {
					const customer = customers[visit.customerId];
					const vehicle = vehicles[visit.vehicleId];
					const late = lateBy(visit, nowAt);
					const label = describe(visit, customer, vehicle, late);
					const lit = litAs(visit, focus);
					return (
						<li key={visit.id}>
							<button
								type="button"
								data-appt={visit.id}
								data-kind={visit.kind}
								onClick={() => onOpen(visit)}
								title={label}
								aria-label={label}
								{...hoverHandlers(visit.id, onHover)}
								className={cn(
									"flex w-full min-w-0 flex-col justify-center rounded-md border px-1.5 text-left text-xs transition-[box-shadow] md:flex-row md:items-center md:justify-start md:gap-1.5",
									stageClass(visit.stage),
									litClass(lit),
									visit.id === focus.arrived && "animate-visit-arrive",
								)}
								style={{ height: chipPx }}
							>
								<span className="flex shrink-0 items-center gap-1 tabular-nums opacity-80">
									{isWalkIn(visit) && <CarFront className="size-3.5" aria-hidden />}
									{late > 0 && <Clock className={cn("size-3", LATE)} aria-hidden />}
									{fmtTime(visit.start)}
								</span>
								<span className="w-full min-w-0 truncate font-medium md:w-auto">{titleOf(visit, customer, vehicle)}</span>
							</button>
						</li>
					);
				})}
				{more > 0 && (
					<li>
						<button
							type="button"
							onClick={() => onPickDay(day)}
							className="flex w-full items-center rounded-md px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
							style={{ height: chipPx }}
						>
							+{more} încă
						</button>
					</li>
				)}
				{list.length === 0 && <li className="flex flex-1 items-center justify-center text-2xs text-muted-foreground">{filter ? "–" : closed ? "Închis" : "Liber"}</li>}
			</ul>
		</div>
	);
});
