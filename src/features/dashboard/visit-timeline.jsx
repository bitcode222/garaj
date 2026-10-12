"use client";

import { Fragment, useEffect, useRef } from "react";
import { Initials } from "@/components/ds/data";
import { minutesBetween, parseISODate } from "@/domain/dates";
import { fmtDate, fmtHours, fmtTime, plural } from "@/lib/format";
import { VISIT_STAGE } from "@/lib/labels";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { useNowMinute } from "@/features/calendar/time-grid";
import { atMinute, hourLabel, layoutEvents, minuteOfDay } from "@/features/calendar/utils";

const HOUR_MIN_PX = 72; // narrowest hour before the timeline scrolls sideways
const LANE_PX = 48; // one row of blocks: a 44 px target plus the gap
const MAX_PER_DAY = 5; // week: bookings listed per day before "+N încă"

/** Block / chip look of a stage: tinted like every status, outlined while the car is only booked. */
export function stageClass(stage) {
	const meta = VISIT_STAGE[stage];
	if (meta.outline) return "border-dashed border-foreground/30 bg-card text-foreground hover:bg-accent/60";
	return cn(tone(meta.tone).block, stage === "delivered" && "opacity-60", stage === "no_show" && "line-through opacity-60");
}

/**
 * Hovering (mouse) or keyboard-focusing an item lights up everything for its car,
 * across the calendar and the cards. It is transient: touch never sets it, and a
 * mouse click's focus does not count (only `:focus-visible`), so nothing sticks.
 * What stays lit after "Arată în calendar" is the selection, a separate state.
 */
export function hoverHandlers(vehicleId, onHover) {
	const car = vehicleId ?? null;
	return {
		onPointerEnter: (e) => e.pointerType === "mouse" && onHover?.(car),
		onPointerLeave: (e) => e.pointerType === "mouse" && onHover?.(null),
		onFocus: (e) => e.target.matches(":focus-visible") && onHover?.(car),
		onBlur: () => onHover?.(null),
	};
}

/** Ring of a lit item: the selected booking, or anything of the hovered car. */
export const LIT = "ring-2 ring-brand";

const describe = (a, customer, stage) =>
	[`${fmtTime(a.start)}–${fmtTime(a.end)}`, a.title, customer?.name, VISIT_STAGE[stage].label].filter(Boolean).join(" · ");

/**
 * One day, time running left to right: a row per mechanic, blocks placed by the
 * hour, a line at "now". Tap a block to open it, tap free time to book there.
 * Read-only on purpose (moving and resizing live in the calendar). On a phone the
 * timeline scrolls sideways inside the card and opens at the current time.
 */
export function DayTimeline({ date, today, staff, events, stageOf, isShown, bounds, customers, onOpen, onCreate, hovered, onHover, selectedId }) {
	const scroller = useRef(null);
	const now = useNowMinute();
	const span = bounds.end - bounds.start;
	const hours = span / 60;
	const fraction = (minute) => (Math.min(Math.max(minute, bounds.start), bounds.end) - bounds.start) / span;
	const pct = (minute) => `${fraction(minute) * 100}%`;
	const marks = [];
	for (let m = bounds.start; m < bounds.end; m += 60) marks.push(m);

	const rows =
		staff.length > 1
			? staff.map((s) => ({ key: s.id, staff: s, staffId: s.id, events: events.filter((a) => a.staffId === s.id) }))
			: [{ key: "all", staff: staff[0] ?? null, staffId: staff[0]?.id, events }];
	if (staff.length > 1) {
		const active = new Set(staff.map((s) => s.id));
		const unassigned = events.filter((a) => !active.has(a.staffId));
		if (unassigned.length) rows.push({ key: "none", staff: null, staffId: null, events: unassigned });
	}
	const labelled = rows.length > 1 || rows[0].staff != null;
	const isToday = date === today;
	const nowIn = isToday && now != null && now >= bounds.start && now <= bounds.end;

	// Open at the current time (today) or at the first booking; once per day shown,
	// so the user's own scrolling is never undone.
	useEffect(() => {
		const el = scroller.current;
		const track = el?.querySelector("[data-track]");
		if (!el || !track) return;
		const clock = new Date();
		const minute = isToday ? clock.getHours() * 60 + clock.getMinutes() : events.length ? minuteOfDay(events[0].start) : bounds.start;
		const labels = track.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
		el.scrollLeft = Math.max(0, fraction(minute) * track.offsetWidth - (el.clientWidth - labels) * 0.3);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [date]);

	return (
		<div ref={scroller} className="overflow-x-auto overscroll-x-contain border-t">
			<div className="grid min-w-full" style={{ gridTemplateColumns: `${labelled ? "auto " : ""}minmax(${hours * HOUR_MIN_PX}px, 1fr)` }}>
				{labelled && <div className="sticky left-0 z-20 border-r border-b bg-card" />}
				<div data-track className="relative h-7 border-b">
					{marks.map((m) => (
						<span key={m} className="absolute top-1.5 pl-1.5 text-2xs text-muted-foreground tabular-nums" style={{ left: pct(m) }}>
							{hourLabel(m)}
						</span>
					))}
					{nowIn && <span className="absolute -bottom-1 z-10 size-2 -translate-x-1/2 rounded-full bg-brand" style={{ left: pct(now) }} aria-hidden />}
				</div>

				{rows.map((row, index) => {
					const placed = layoutEvents(row.events.filter(isShown));
					const lanes = Math.max(1, ...placed.map((p) => p.lanes));
					const minutes = row.events.reduce((sum, a) => (stageOf.get(a.id) === "no_show" ? sum : sum + minutesBetween(a.start, a.end)), 0);
					const last = index === rows.length - 1;
					return (
						<Fragment key={row.key}>
							{labelled && (
								<div className={cn("sticky left-0 z-20 flex items-center gap-2 border-r bg-card px-2 md:w-44 md:px-3", !last && "border-b")}>
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
							)}
							<div
								role="presentation"
								onClick={(e) => {
									if (e.target !== e.currentTarget) return;
									const rect = e.currentTarget.getBoundingClientRect();
									const minute = bounds.start + ((e.clientX - rect.left) / rect.width) * span;
									onCreate({ start: atMinute(date, Math.floor(minute / 30) * 30), staffId: row.staffId });
								}}
								className={cn("relative cursor-copy", !last && "border-b", date < today && "bg-muted/30")}
								style={{
									height: lanes * LANE_PX + 4,
									backgroundImage:
										"linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to right, color-mix(in oklch, var(--border) 45%, transparent) 1px, transparent 1px)",
									backgroundSize: `${100 / hours}% 100%, ${50 / hours}% 100%`,
									backgroundPosition: "-1px 0",
								}}
							>
								{nowIn && <div className="pointer-events-none absolute inset-y-0 left-0 bg-muted/40" style={{ width: pct(now) }} aria-hidden />}
								{placed.map(({ event: a, lane }) => {
									const customer = customers[a.customerId];
									const label = describe(a, customer, stageOf.get(a.id));
									const start = Math.max(minuteOfDay(a.start), bounds.start);
									const rawEnd = minuteOfDay(a.end) || 24 * 60;
									const end = Math.min(rawEnd <= minuteOfDay(a.start) ? 24 * 60 : rawEnd, bounds.end);
									return (
										<button
											key={a.id}
											type="button"
											onClick={() => onOpen(a)}
											title={label}
											aria-label={label}
											data-appt={a.id}
											{...hoverHandlers(a.vehicleId, onHover)}
											className={cn(
												"absolute z-[5] flex min-w-7 flex-col justify-center overflow-hidden rounded-md border px-2 text-left text-xs select-none transition-[opacity,box-shadow]",
												stageClass(stageOf.get(a.id)),
												(a.id === selectedId || (hovered && a.vehicleId === hovered)) && cn("z-[6]", LIT),
											)}
											style={{
												left: `calc(${pct(start)} + 1px)`,
												width: `calc(${((end - start) / span) * 100}% - 2px)`,
												top: 4 + lane * LANE_PX,
												height: LANE_PX - 4,
											}}
										>
											<span className="truncate font-semibold">{a.title || customer?.name || "Programare"}</span>
											<span className="truncate tabular-nums opacity-80">
												{fmtTime(a.start)}–{fmtTime(a.end)}
												{customer ? ` · ${customer.name}` : ""}
											</span>
										</button>
									);
								})}
								{nowIn && <div className="pointer-events-none absolute inset-y-0 z-10 border-l-2 border-brand" style={{ left: pct(now) }} aria-hidden />}
							</div>
						</Fragment>
					);
				})}
			</div>
		</div>
	);
}

/**
 * One week, a column per day: today marked, bookings as chips in time order.
 * The day header (and "+N încă") opens that day. Scrolls sideways on a phone and
 * opens with today at the left edge.
 */
export function WeekStrip({ days, today, eventsByDay, stageOf, isShown, filtered, workDays, customers, onOpen, onPickDay, hovered, onHover, selectedId }) {
	const scroller = useRef(null);
	const first = days[0];
	useEffect(() => {
		const el = scroller.current;
		const column = el?.querySelector("[data-today]");
		if (!el || !column) return;
		el.scrollLeft = Math.max(0, column.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft - 12);
	}, [first]);

	return (
		<div ref={scroller} className="overflow-x-auto overscroll-x-contain border-t">
			<div className="grid min-w-full" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(8.5rem, 1fr))` }}>
				{days.map((day) => {
					const list = (eventsByDay.get(day) ?? []).filter(isShown);
					const isToday = day === today;
					const closed = !workDays.includes(parseISODate(day).getDay());
					return (
						<div
							key={day}
							data-today={isToday ? "" : undefined}
							className={cn("flex min-w-0 flex-col border-l first:border-l-0", isToday ? "bg-brand/[0.04]" : closed && "bg-muted/40")}
						>
							<button
								type="button"
								onClick={() => onPickDay(day)}
								aria-label={`${fmtDate(day, "EEEE, d MMMM")}: ${plural(list.length, "programare", "programări")}`}
								className="flex h-11 shrink-0 items-center justify-center gap-1.5 border-b text-xs transition-colors hover:bg-accent/50 md:h-9"
							>
								<span className="font-medium text-muted-foreground capitalize">{fmtDate(day, "EEE")}</span>
								<span className={cn("flex size-6 items-center justify-center rounded-full font-semibold tabular-nums", isToday && "bg-primary text-primary-foreground")}>
									{Number(day.slice(8))}
								</span>
								{list.length > 0 && <span className="text-2xs text-muted-foreground tabular-nums">· {list.length}</span>}
							</button>
							<ul className="flex min-h-28 flex-1 flex-col gap-1 p-1.5">
								{list.slice(0, MAX_PER_DAY).map((a) => {
									const customer = customers[a.customerId];
									const label = describe(a, customer, stageOf.get(a.id));
									return (
										<li key={a.id}>
											<button
												type="button"
												onClick={() => onOpen(a)}
												title={label}
												aria-label={label}
												data-appt={a.id}
												{...hoverHandlers(a.vehicleId, onHover)}
												className={cn(
													"flex min-h-11 w-full min-w-0 flex-col justify-center rounded-md border px-1.5 text-left text-xs transition-[opacity,box-shadow] md:min-h-7 md:flex-row md:items-center md:justify-start md:gap-1.5",
													stageClass(stageOf.get(a.id)),
													(a.id === selectedId || (hovered && a.vehicleId === hovered)) && LIT,
												)}
											>
												<span className="shrink-0 tabular-nums opacity-80">{fmtTime(a.start)}</span>
												<span className="w-full min-w-0 truncate font-medium md:w-auto">{a.title || customer?.name || "Programare"}</span>
											</button>
										</li>
									);
								})}
								{list.length > MAX_PER_DAY && (
									<li>
										<button
											type="button"
											onClick={() => onPickDay(day)}
											className="flex min-h-11 w-full items-center rounded-md px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground md:min-h-6"
										>
											+{list.length - MAX_PER_DAY} încă
										</button>
									</li>
								)}
								{list.length === 0 && (
									<li className="flex flex-1 items-center justify-center text-2xs text-muted-foreground">{filtered ? "–" : closed ? "Închis" : "Liber"}</li>
								)}
							</ul>
						</div>
					);
				})}
			</div>
		</div>
	);
}
