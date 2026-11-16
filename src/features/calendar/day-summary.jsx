"use client";

import { Plus } from "lucide-react";
import { Initials, Meter } from "@/components/ds/data";
import { StatusDot } from "@/components/ds/blocks";
import { Button } from "@/components/ui/button";
import { busyMinutes, freeGaps } from "@/domain/day-summary";
import { parseISODate } from "@/domain/dates";
import { AREA, STATE } from "@/lib/colors";
import { fmtDate, fmtTime, plural } from "@/lib/format";
import { useNowMinute } from "@/lib/hooks";
import { cardFacts, firstName } from "./card-facts";
import { atMinute, hhmm, minuteOfDay, toMinutes } from "./utils";

const OFF = new Set(["cancelled", "no_show"]);

/**
 * "Ziua pe scurt" (Agendă · Zi, the owner's pick C, 16 Nov 2026), beside the day's one wide line: how many bookings,
 * which still wait to be confirmed, where there is free time (per mechanic, from now on today) and how full each
 * mechanic is. A free span books a new appointment there; a booking to confirm opens it.
 */
export function DaySummary({ day, today, list, staff, hours, lookups, onOpen, onCreate }) {
	const nowMinute = useNowMinute();
	const open = toMinutes(hours.open);
	const close = toMinutes(hours.close);
	const shopDay = hours.days.includes(parseISODate(day).getDay());
	const live = (list ?? []).filter((a) => !OFF.has(a.status)).sort((a, b) => a.start.localeCompare(b.start));
	const spanOf = (a) => [minuteOfDay(a.start), minuteOfDay(a.end) || 24 * 60];
	const from = day === today && nowMinute != null ? nowMinute : open;
	const past = day < today;
	const pending = live.filter((a) => a.status === "scheduled");
	const dayLength = Math.max(1, close - open);

	// Free time, per mechanic shown (or for the shop, with no mechanics): the first hour or more of each.
	const people = staff.length ? staff : [{ id: null, name: "Atelier", color: "neutral" }];
	const loads = people.map((person) => {
		const own = live.filter((a) => (person.id ? a.staffId === person.id : true)).map(spanOf);
		return {
			person,
			busy: busyMinutes(own, open, close),
			gap: past ? null : (freeGaps(own, open, close, { from })[0] ?? null),
		};
	});
	const gaps = loads.filter((l) => l.gap);
	const firstFree = gaps.length ? Math.min(...gaps.map((l) => l.gap[0])) : open;
	const book = (start, staffId) =>
		onCreate({
			start: atMinute(day, Math.ceil(start / 15) * 15),
			...(staffId ? { staffId } : null),
		});

	return (
		<aside aria-label="Ziua pe scurt" className="flex w-[268px] shrink-0 flex-col gap-3 self-start rounded-[18px] bg-card p-4 shadow-[0_0_0_1px_var(--border)]">
			<div>
				<b className="block text-[15px] font-semibold tracking-tight">Ziua pe scurt</b>
				<span className="text-[12.5px] text-muted-foreground first-letter:uppercase">{fmtDate(day, "EEEE, d MMMM")}</span>
			</div>
			<div className="flex flex-col gap-2">
				<StatusDot color={AREA.programare}>{live.length ? plural(live.length, "programare", "programări") : "Nicio programare"}</StatusDot>
				{!shopDay && <StatusDot color={STATE.off}>Atelierul e închis</StatusDot>}
				{pending.slice(0, 3).map((a) => (
					<button key={a.id} type="button" onClick={() => onOpen(a)} className="-mx-1 rounded-md px-1 text-left hover:bg-accent">
						<StatusDot color={STATE.wait} className="max-w-full">
							<span className="truncate">
								De confirmat · {cardFacts(a, lookups).name}, {fmtTime(a.start)}
							</span>
						</StatusDot>
					</button>
				))}
				{pending.length > 3 && <StatusDot color={STATE.wait}>Încă {plural(pending.length - 3, "de confirmat", "de confirmat")}</StatusDot>}
				{shopDay &&
					!past &&
					(gaps.length ? (
						gaps.map(({ person, gap }) => (
							<button key={person.id ?? "shop"} type="button" onClick={() => book(gap[0], person.id)} className="-mx-1 rounded-md px-1 text-left hover:bg-accent" title="Programează aici">
								<StatusDot color={STATE.ok} className="max-w-full">
									<span className="truncate">
										{gap[0] === open && gap[1] === close ? "Liber toată ziua" : gap[1] === close ? `Liber după ${hhmm(gap[0])}` : `Liber ${hhmm(gap[0])} – ${hhmm(gap[1])}`}
										{staff.length > 0 && ` · ${firstName(person.name)}`}
									</span>
								</StatusDot>
							</button>
						))
					) : (
						<StatusDot color={STATE.late}>Nicio oră liberă {day === today ? "de acum" : "în ziua asta"}</StatusDot>
					))}
			</div>
			{staff.length > 0 && (
				<>
					<div className="h-px bg-border" />
					<b className="text-[13px] font-semibold">Încărcare</b>
					<div className="flex flex-col gap-2.5">
						{loads.map(({ person, busy }) => (
							<div key={person.id} className="flex items-center gap-2 text-[12.5px]">
								<Initials name={person.name} tone={person.color} size="sm" />
								<span className="w-16 truncate">{firstName(person.name)}</span>
								<Meter value={busy} max={dayLength} tone={person.color} className="flex-1" label={`${firstName(person.name)}: ${Math.round((busy / dayLength) * 100)}%`} />
								<span className="w-10 text-right text-muted-foreground tabular-nums">{Math.round((busy / 60) * 10) / 10} h</span>
							</div>
						))}
					</div>
				</>
			)}
			<Button size="sm" className="mt-1 self-start" onClick={() => book(past ? open : firstFree)}>
				<Plus />
				Programare nouă
			</Button>
		</aside>
	);
}
