"use client";

import { useEffect, useRef } from "react";
import { parseISODate } from "@/domain/dates";
import { fmtDate, fmtTime, plural } from "@/lib/format";
import { VISIT_STAGE } from "@/lib/labels";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

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
