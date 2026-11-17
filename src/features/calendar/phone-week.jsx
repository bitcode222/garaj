"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDaysISO } from "@/domain/dates";
import { TONE_COLOR } from "@/lib/colors";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { mondayOf } from "./album-week";

// The top of the phone's calendar, as the iPhone app's CalendarDayView (ios-native/Garaj/Views/CalendarDayView.swift):
// the month with ‹ › for the weeks, the week as a row of days (the day in view filled, today orange, a dot where there
// are bookings), and the mechanics as the columns' legend.

const LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

export function PhoneWeek({ day, today, busy, onPick, onWeek }) {
	const monday = mondayOf(day);
	const days = Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i));
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center px-4">
				<b className="flex-1 text-[17px] font-semibold first-letter:uppercase">{fmtDate(day, "MMMM yyyy")}</b>
				<button type="button" onClick={() => onWeek(-1)} aria-label="Săptămâna dinainte" className="flex h-8 w-11 items-center justify-center text-brand active:opacity-60">
					<ChevronLeft className="size-[22px]" strokeWidth={2.5} aria-hidden />
				</button>
				<button type="button" onClick={() => onWeek(1)} aria-label="Săptămâna următoare" className="flex h-8 w-11 items-center justify-center text-brand active:opacity-60">
					<ChevronRight className="size-[22px]" strokeWidth={2.5} aria-hidden />
				</button>
			</div>
			<div className="flex px-2">
				{days.map((d, i) => {
					const selected = d === day;
					const isToday = d === today;
					const count = busy.get(d)?.length ?? 0;
					return (
						<button key={d} type="button" onClick={() => onPick(d)} aria-pressed={selected} aria-label={`${fmtDate(d, "EEEE, d MMMM")}, ${count} programări`} className="flex min-h-11 flex-1 flex-col items-center gap-1">
							<span className="text-[11px] font-medium text-muted-foreground">{LETTERS[i]}</span>
							<span
								className={cn(
									"flex size-9 items-center justify-center rounded-full text-[17px] tabular-nums",
									(selected || isToday) && "font-semibold",
									selected ? (isToday ? "bg-brand text-white" : "bg-foreground text-background") : isToday ? "text-brand" : "text-foreground",
								)}
							>
								{Number(d.slice(8))}
							</span>
							<span className={cn("size-[5px] rounded-full", count ? "bg-muted-foreground" : "bg-transparent")} />
						</button>
					);
				})}
			</div>
		</div>
	);
}

/** ColumnHeaders: each mechanic's initial on a circle of their colour and first name, over their column. */
export function PhoneMechanics({ columns, gutter = 48 }) {
	return (
		<div className="flex border-y bg-card/80 py-1.5" style={{ paddingLeft: gutter }}>
			{columns.map((c) => (
				<span key={c.key} className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
					<span className="flex size-[22px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: TONE_COLOR[c.color] ?? TONE_COLOR.neutral }}>
						{c.name.slice(0, 1)}
					</span>
					<span className="truncate text-[12px] font-medium">{c.name.split(" ")[0]}</span>
				</span>
			))}
		</div>
	);
}
