"use client";

import { useState } from "react";
import { ArrowLeftRight, CalendarClock, Check, ChevronDown, CirclePlus, Clock, Pencil, Play, Square, Trash2, Undo2, Wrench } from "lucide-react";
import { Timeline } from "@/components/ds/data";
import { Button } from "@/components/ui/button";
import { jobTimeline } from "@/domain/job-log";
import { fmtDate, fmtTime, formatMoney, plural } from "@/lib/format";
import { WORK_ORDER_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";

const FIELD = { complaint: "Ce spune clientul", diagnosis: "Diagnostic", notes: "Note interne", mileage: "Kilometraj", fuelLevel: "Combustibil" };
const DATE_FIELD = { arrived: "Data intrării", promised: "Termenul", ready: "Data de gata", delivered: "Data predării" };
const LINE_FIELD = { description: "denumire", qty: "cantitate", unitPrice: "preț", discountPct: "reducere", refused: "refuz" };
const stageName = (status) => (status === "estimate" ? "Deviz deschis" : (WORK_ORDER_STATUS[status]?.label ?? status));
const when = (span) => `${fmtDate(span.start, "d MMM")} ${fmtTime(span.start)}–${span.end ? fmtTime(span.end) : "acum"}`;
const shortText = (value) => {
	if (value == null || value === "") return "gol";
	const text = String(value);
	return text.length > 42 ? `${text.slice(0, 42)}…` : text;
};
const lineValue = (field, value, currency) => (field === "unitPrice" ? formatMoney(value ?? 0, currency) : field === "discountPct" ? `${value ?? 0}%` : field === "refused" ? (value ? "da" : "nu") : shortText(value));

function describe(entry, currency) {
	switch (entry.type) {
		case "created":
			return { title: "Lucrare deschisă", icon: Wrench };
		case "status":
			return { title: stageName(entry.to), icon: WORK_ORDER_STATUS[entry.to]?.icon, tone: WORK_ORDER_STATUS[entry.to]?.tone, content: entry.reason || undefined };
		case "undone":
			return { title: `Anulat: înapoi la ${stageName(entry.to)}`, icon: Undo2 };
		case "received":
			return { title: "Mașina a fost primită", icon: Check };
		case "estimate_sent":
			return { title: "Deviz trimis clientului", icon: Check };
		case "booking_moved":
			return { title: "Programare mutată", icon: CalendarClock, content: `${when(entry.from)} → ${when(entry.to)}` };
		case "date_changed":
			return { title: `${DATE_FIELD[entry.field] ?? "Data"} modificat${entry.field === "promised" ? "" : "ă"}`, icon: CalendarClock, content: `${entry.from ? fmtDate(entry.from, "d MMM, HH:mm") : "fără"} → ${fmtDate(entry.to, "d MMM, HH:mm")}` };
		case "assigned":
			return { title: entry.field === "bayId" ? "Elevator schimbat" : "Mecanic schimbat", icon: ArrowLeftRight, content: `${entry.fromName ?? "fără"} → ${entry.toName ?? "fără"}` };
		case "work_moved":
			return { title: "Timp lucrat modificat", icon: Clock, content: `${when(entry.from)} → ${when(entry.to)}` };
		case "work_started":
			return { title: "Lucru pornit", icon: Play, content: fmtTime(entry.start) };
		case "work_stopped":
			return { title: "Lucru oprit", icon: Square, content: `${fmtTime(entry.start)}–${fmtTime(entry.end)}` };
		case "edited":
			return { title: `${FIELD[entry.field] ?? entry.field} modificat`, icon: Pencil, content: `${shortText(entry.from)} → ${shortText(entry.to)}` };
		case "line_added":
			return { title: "Linie adăugată", icon: CirclePlus, content: entry.name };
		case "line_removed":
			return { title: "Linie ștearsă", icon: Trash2, content: entry.name };
		case "line_done":
			return { title: entry.done ? "Linie terminată" : "Linie redeschisă", icon: Check, content: entry.name };
		case "line_changed":
			return { title: "Linie modificată", icon: Pencil, content: `${entry.name}: ${entry.fields.map((f) => `${LINE_FIELD[f] ?? f} ${lineValue(f, entry.from[f], currency)} → ${lineValue(f, entry.to[f], currency)}`).join(", ")}` };
		default:
			return { title: "Modificare", icon: Pencil };
	}
}

/** Everything that happened to a job, newest first (src/domain/job-log.js): who, when, from what to what. */
export function JobHistory({ order, currency, limit = 6 }) {
	const [all, setAll] = useState(false);
	const list = jobTimeline(order).map((entry, index) => {
		const { title, icon, tone, content } = describe(entry, currency);
		return { id: `${entry.at}-${index}`, title, icon, tone, content, meta: [fmtDate(entry.at, "d MMM, HH:mm"), entry.by].filter(Boolean).join(" · ") };
	});
	const hidden = all ? 0 : Math.max(0, list.length - limit);
	return (
		<div className="space-y-2">
			<Timeline items={hidden ? list.slice(0, limit) : list} />
			{hidden > 0 && (
				<Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground max-md:h-11" onClick={() => setAll(true)}>
					Arată tot ({list.length})
				</Button>
			)}
		</div>
	);
}

/** The history folded into one row at the end of a job's sheet: when it opened and how much happened, the list on a tap. */
export function JobHistoryRow({ order, currency }) {
	const [open, setOpen] = useState(false);
	const count = jobTimeline(order).length;
	return (
		<section data-group aria-label="Istoric" className="overflow-hidden rounded-[14px] bg-card">
			<button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-14 w-full items-center gap-3 px-(--sheet-inset) py-2 text-left hover:bg-foreground/[0.04]">
				<span className="min-w-0 flex-1">
					<span className="block text-[16px] font-semibold">Istoric</span>
					<span className="block truncate text-[13px] text-muted-foreground">
						Deschisă {fmtDate(order.createdAt, "d MMM, HH:mm")} · {plural(count, "eveniment", "evenimente")}
					</span>
				</span>
				<ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
			</button>
			{open && (
				<div className="border-t px-(--sheet-inset) py-3">
					<JobHistory order={order} currency={currency} />
				</div>
			)}
		</section>
	);
}
