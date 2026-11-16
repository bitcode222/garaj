"use client";

import { Plus } from "lucide-react";
import { addDaysISO, parseISODate } from "@/domain/dates";
import { fmtDate, fmtTime, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { cardFacts } from "./card-facts";
import { craftStyle, Watermark } from "./craft";
import { atMinute } from "./utils";

/** The Monday of `day`'s week. */
export function mondayOf(day) {
	const weekday = parseISODate(day).getDay();
	return addDaysISO(day, -((weekday + 6) % 7));
}

/**
 * "Albume" (the owner's pick E, 16 Nov 2026): the week as tall day cards side by side, each a stack of its bookings as
 * car-coloured cards in the order of the day; a quiet day stays quiet. Sunday shows only when it has bookings.
 */
export function AlbumWeek({ anchor, today, byDay, lookups, selectedId, onOpen, onCreate }) {
	const monday = mondayOf(anchor);
	const days = Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i)).filter((day, i) => i < 6 || byDay.get(day)?.length);
	return (
		<div className="min-h-0 flex-1 overflow-auto px-4 pt-2 pb-24 md:px-6">
			<div className="grid min-w-[900px] items-start gap-3" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
				{days.map((day) => {
					const list = [...(byDay.get(day) ?? [])].sort((a, b) => a.start.localeCompare(b.start));
					const isToday = day === today;
					return (
						<section key={day} aria-label={fmtDate(day, "EEEE, d MMMM")} className={cn("flex min-h-[420px] flex-col gap-2 rounded-[20px] bg-card p-3 shadow-[0_0_0_1px_var(--border)]", isToday && "shadow-[0_0_0_2px_var(--foreground)]")}>
							<header className="flex items-baseline gap-1.5 px-1 pt-0.5 pb-1.5">
								<span className={cn("text-[11px] font-semibold tracking-[0.1em] uppercase", isToday ? "text-[#ff3b30]" : "text-muted-foreground")}>{fmtDate(day, "EEE").replace(".", "")}</span>
								<b className={cn("ml-auto text-[30px] leading-none font-medium tracking-[-0.04em] tabular-nums", isToday && "text-[#ff3b30]")}>{Number(day.slice(8))}</b>
							</header>
							{list.map((a) => {
								const f = cardFacts(a, lookups);
								const pending = a.status === "scheduled";
								return (
									<button
										key={a.id}
										type="button"
										data-appt={a.id}
										onClick={() => onOpen(a)}
										aria-label={[`${fmtTime(a.start)}–${fmtTime(a.end)}`, f.name, f.subject, f.owner, pending ? "de confirmat" : null].filter(Boolean).join(" · ")}
										className={cn(
											"relative flex min-h-[92px] flex-col gap-px overflow-hidden rounded-[12px] px-3 py-2.5 text-left transition-transform hover:-translate-y-px",
											pending && "outline-[1.5px] -outline-offset-4 outline-white/70 outline-dashed",
											(a.status === "no_show" || a.status === "cancelled") && "line-through opacity-60",
											a.id === selectedId && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
										)}
										style={craftStyle(f.make)}
									>
										<Watermark make={f.make} size={64} />
										<span className="relative flex items-baseline gap-1.5">
											<span className="text-[15px] font-semibold tracking-tight tabular-nums">{fmtTime(a.start)}</span>
											<span className="text-[11.5px] tabular-nums opacity-70">– {fmtTime(a.end)}</span>
											{pending && <span aria-hidden className="ml-auto size-2 self-center rounded-full bg-[#ffb020] shadow-[0_0_0_2px_rgb(0_0_0/0.25)]" />}
										</span>
										<b className="relative truncate text-[13.5px] font-semibold tracking-tight">{f.name}</b>
										{f.subject && <span className="relative truncate text-[11.5px] opacity-80">{f.subject}</span>}
										{f.owner && <span className="relative truncate text-[11.5px] opacity-80">{f.owner}</span>}
									</button>
								);
							})}
							<footer className="mt-auto flex items-center justify-between border-t border-dashed pt-2 text-[11.5px] text-muted-foreground">
								<span>{list.length ? plural(list.length, "programare", "programări") : "liber"}</span>
								<button type="button" onClick={() => onCreate({ start: atMinute(day, 9 * 60) })} className="flex size-7 items-center justify-center rounded-[7px] hover:bg-accent" aria-label={`Programare nouă, ${fmtDate(day, "EEEE, d MMMM")}`}>
									<Plus className="size-3.5" aria-hidden />
								</button>
							</footer>
						</section>
					);
				})}
			</div>
		</div>
	);
}
