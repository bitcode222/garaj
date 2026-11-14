"use client";

import { Clock } from "lucide-react";
import { useLargeCards } from "@/components/ds/card-section";
import { Initials, Money } from "@/components/ds/data";
import { MakeLogo } from "@/components/ds/make-logo";
import { StateDot, StateTag, kindText } from "@/components/ds/tone";
import { computeTotals } from "@/domain/lines";
import { dayOfInstant, diffDaysISO } from "@/domain/dates";
import { formatPlate } from "@/domain/vehicle";
import { visitTiming } from "@/domain/visit";
import { fmtDate, fmtDays, fmtTime, fmtWorkOrder } from "@/lib/format";
import { RECORD_KIND } from "@/lib/labels";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { timingClass, timingText, visitText } from "./visit-ui";

/** "azi 14:00", "ieri 09:30", "9 oct. 16:00". */
export function whenText(today, instant) {
	const away = diffDaysISO(today, dayOfInstant(instant));
	return `${Math.abs(away) <= 1 ? fmtDays(away) : fmtDate(instant, "d MMM")} ${fmtTime(instant)}`;
}

/**
 * Everything a visit's card says, from the one place both the cars' strip and the
 * timeline read it: the car, what it is in for, whose it is, the job, the total, where
 * it is on the calendar and what the clock says. `lookups` is { vehicles, customers,
 * staff, settings, today, nowAt }.
 */
export function visitFacts(visit, { vehicles, customers, staff, settings, today, nowAt }) {
	const order = visit.order;
	const vehicle = vehicles[visit.vehicleId];
	const customer = customers[visit.customerId];
	const mechanicId = order?.staffId ?? visit.staffId;
	const mechanic = mechanicId ? staff[mechanicId] : null;
	const text = visitText(visit, vehicle, customer);
	return {
		name: text.name,
		subject: text.subject,
		vehicle,
		plate: vehicle?.plate ? formatPlate(vehicle.plate) : null,
		number: order ? fmtWorkOrder(order.number) : null,
		customer: customer?.name ?? null,
		mechanic,
		gross: order ? computeTotals(order.lines, { vatPayer: settings.invoicing.vatPayer }).gross : null,
		// Where the car is on the calendar: its booking, or (it came without one) the moment it was received.
		anchor: visit.appointment ? `${whenText(today, visit.start)}–${fmtTime(visit.end)}` : `primit ${whenText(today, visit.start)}`,
		timing: nowAt ? timingText(visitTiming(visit, nowAt)) : null,
	};
}

/**
 * The car's card, the same rows wherever it is (docs/DESIGN-SYSTEM.md, normal and small cards): a first line naming
 * the record's kind in its colour, with its state on the right in a normal card (the number in a small one), and a
 * divider under it; then the logo (or `icon` without a car), name over plate and number, what it is in for, the
 * customer and the clock; then, over the same divider, the mechanic, where it is on the calendar and the total. The
 * shell (size, border, click) belongs to the caller, and so do the actions: they sit over the last line's right end,
 * which `footPad` keeps clear, or, labelled, across the card's foot, for which `actions` keeps room. `extras`
 * (card-extras.js) are the short lines the owner picked under the customer: what it waits for, how long at its
 * stage, the promised time, what needs attention, what is paid. Every row is laid out in a container, so a narrow
 * calendar block drops the rows it cannot hold, one by one, and the tooltip keeps the rest.
 */
export function VisitCard({ facts, footPad = "", gap = "gap-2", extras = [], actions = false }) {
	const { vehicle, icon: Icon, kind, name, plate, number, subject, customer, mechanic, anchor, timing, gross, state } = facts;
	// In a large card (the sections on Azi) the same rows are a step bigger, and the state is a tag on the first line.
	const large = useLargeCards();
	const small = large ? "text-xs" : "text-2xs";
	const meta = kind ? RECORD_KIND[kind] : null;
	const KindIcon = meta?.icon;
	return (
		<span className={cn("flex h-full w-full min-w-0 flex-col", gap)}>
			{meta && (
				<span className={cn("flex min-w-0 items-center justify-between gap-2 border-b border-current/15", large ? "min-h-6 pb-2" : "pb-1.5", small)}>
					<span className={cn("flex min-w-0 items-center gap-1.5 font-semibold", kindText(kind))}>
						<KindIcon className={large ? "size-4" : "size-3.5"} aria-hidden />
						<span className="truncate">{meta.label}</span>
					</span>
					{large && state ? <StateTag state={state} size="sm" className="min-w-0" /> : number ? <span className={cn("shrink-0 font-medium tabular-nums", kindText(kind))}>{number}</span> : null}
				</span>
			)}
			<span className="flex min-w-0 items-center gap-2">
				<span className={cn("relative flex shrink-0 items-center justify-center rounded-md bg-muted @max-[9rem]:hidden", large ? "size-9" : "size-7")}>
					{Icon && !vehicle ? <Icon className={large ? "size-5" : "size-4"} aria-hidden /> : <MakeLogo make={vehicle?.make} className={large ? "size-5" : "size-4"} />}
					{/* A small card keeps the record's state as a dot on the tile's corner, its words on hover. */}
					{state && !(large && meta) && <StateDot state={state} size="sm" ring tip className="absolute -right-1.5 -bottom-1.5" />}
				</span>
				<span className="min-w-0 flex-1">
					<span className={cn("block truncate font-semibold", large ? "text-sm" : "text-xs")}>{name}</span>
					<span className={cn("flex min-w-0 items-center gap-1.5 text-muted-foreground", small)}>
						{plate && (
							<span translate="no" className="truncate font-mono tracking-wide uppercase">
								{plate}
							</span>
						)}
						{number && (large || !meta) && <span className="shrink-0 tabular-nums">{number}</span>}
					</span>
				</span>
			</span>
			<span className={cn("truncate font-medium @max-[7rem]:hidden", small)}>{subject || " "}</span>
			<span className={cn("flex items-center justify-between gap-2", small, timingClass(timing?.mark))}>
				<span className="truncate text-muted-foreground">{customer ?? "Client necunoscut"}</span>
				{timing && (
					<span className={cn("flex min-w-0 shrink-0 items-center gap-1", timingClass(timing.mark))}>
						{timing.mark && <Clock className="size-3 shrink-0" aria-hidden />}
						<span className="truncate">{timing.text}</span>
					</span>
				)}
			</span>
			{extras.length > 0 && (
				<span className={cn("flex min-w-0 flex-col gap-1", small)}>
					{extras.map((x) => (
						<span key={x.key} className={cn("flex min-w-0 items-center gap-1.5", x.tone === "danger" ? cn("font-medium", tone("red").text) : x.tone === "wait" ? "font-medium" : "text-muted-foreground", x.tone === "warning" && cn("font-medium", tone("yellow").text))}>
							{x.bar != null ? (
								<span aria-hidden className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
									<span className={cn("block h-full rounded-full", tone("green").solid)} style={{ width: `${x.bar}%` }} />
								</span>
							) : (
								<x.icon aria-hidden className={cn("size-3.5 shrink-0", x.tone === "wait" && tone("yellow").text)} />
							)}
							<span className="truncate">{x.text}</span>
						</span>
					))}
				</span>
			)}
			<span className={cn("mt-auto flex items-center justify-between gap-2 border-t border-current/15 pt-1.5", (large || footPad) && "min-h-10", small, footPad)}>
				<span className="flex min-w-0 items-center gap-1.5">
					{mechanic ? <Initials name={mechanic.name} tone={mechanic.color} size="sm" className="size-4.5" /> : null}
					<span className="truncate text-muted-foreground">{anchor}</span>
				</span>
				{gross != null && (
					<span className="shrink-0 text-right font-semibold tabular-nums">
						<Money value={gross} decimals={0} />
					</span>
				)}
			</span>
			{/* Room for the labelled actions SectionCard lays over the card's foot. */}
			{actions && <span aria-hidden className="h-9 shrink-0 pointer-coarse:h-11" />}
		</span>
	);
}
