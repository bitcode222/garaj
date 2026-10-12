"use client";

import Link from "next/link";
import { memo } from "react";
import { fmtDate, fmtTime } from "@/lib/format";
import { VISIT_STAGE } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { atMinute, hourLabel, layoutEvents, minuteOfDay } from "@/features/calendar/utils";
import { LIT, hoverHandlers, stageClass } from "./visit-timeline";

export const ROW_PX = 52; // every mechanic's row: a 44 px booking, 4 px above and below
const BLOCK_PX = ROW_PX - 8;
export const DAY_LABEL_PX = 24; // the strip with the day's name
export const AXIS_PX = 28; // the strip with the hours

const HOUR_LINES =
	"linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to right, color-mix(in oklch, var(--border) 45%, transparent) 1px, transparent 1px)";

const describe = (visit, customer) =>
	[`${fmtTime(visit.start)}–${fmtTime(visit.end)}`, visit.appointment.title, customer?.name, VISIT_STAGE[visit.stage].label].filter(Boolean).join(" · ");

/**
 * One day of the continuous timeline (docs/DASHBOARD-CALENDAR.md): its name, its
 * hours, a row per mechanic with the bookings placed by the hour, and on today a
 * line at "now" with the elapsed part shaded. Placed absolutely by the scroller,
 * which renders only the days in view; memoised, so scrolling re-renders nothing
 * that did not change. A slim day (closed, nothing booked) is just a marker.
 */
export const TimelineDay = memo(function TimelineDay({
	day,
	left,
	width,
	slim,
	isToday,
	isPast,
	closed,
	visits,
	rows,
	rowKeyOf,
	hours,
	now,
	filter,
	hovered,
	selectedId,
	customers,
	onOpen,
	onCreate,
	onHover,
}) {
	if (slim) {
		return (
			<div
				data-day={day}
				title={`${fmtDate(day, "EEEE, d MMMM")} · închis`}
				className="absolute inset-y-0 flex flex-col items-center gap-0.5 border-l bg-muted/40 pt-1 text-muted-foreground"
				style={{ left, width }}
			>
				<span className="text-2xs font-medium capitalize">{fmtDate(day, "EEEEEE")}</span>
				<span className="text-xs font-semibold tabular-nums">{Number(day.slice(8))}</span>
				<span className="mt-3 rotate-180 text-2xs [writing-mode:vertical-rl]">închis</span>
			</div>
		);
	}

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
							const customer = customers[visit.customerId];
							const label = describe(visit, customer);
							const start = Math.max(minuteOfDay(visit.start), hours.start);
							const rawEnd = minuteOfDay(visit.end) || 24 * 60;
							const end = Math.min(rawEnd <= minuteOfDay(visit.start) ? 24 * 60 : rawEnd, hours.end);
							return (
								<button
									key={visit.id}
									type="button"
									data-appt={visit.id}
									onClick={() => onOpen(visit)}
									title={label}
									aria-label={label}
									{...hoverHandlers(visit.vehicleId, onHover)}
									className={cn(
										"absolute z-[5] flex min-w-7 overflow-hidden rounded-md border text-left select-none transition-[box-shadow]",
										shared ? "items-center px-1.5 text-2xs leading-none" : "flex-col justify-center px-2 text-xs",
										stageClass(visit.stage),
										(visit.id === selectedId || (hovered && visit.vehicleId === hovered)) && cn("z-[6]", LIT),
									)}
									style={{
										left: `calc(${pct(start)} + 1px)`,
										width: `calc(${((end - start) / span) * 100}% - 2px)`,
										top: shared ? 4 + lane * (BLOCK_PX / 2 + 1) : 4,
										height: shared ? BLOCK_PX / 2 - 1 : BLOCK_PX,
									}}
								>
									{shared ? (
										<span className="truncate">
											<span className="tabular-nums opacity-80">{fmtTime(visit.start)}</span>{" "}
											<span className="font-semibold">{visit.appointment.title || customer?.name || "Programare"}</span>
										</span>
									) : (
										<>
											<span className="truncate font-semibold">{visit.appointment.title || customer?.name || "Programare"}</span>
											<span className="truncate tabular-nums opacity-80">
												{fmtTime(visit.start)}–{fmtTime(visit.end)}
												{customer ? ` · ${customer.name}` : ""}
											</span>
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
