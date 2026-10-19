"use client";

import { Clock } from "lucide-react";
import { Initials, Money } from "@/components/ds/data";
import { MakeLogo } from "@/components/ds/make-logo";
import { computeTotals } from "@/domain/lines";
import { dayOfInstant, diffDaysISO } from "@/domain/dates";
import { formatPlate } from "@/domain/vehicle";
import { visitTiming } from "@/domain/visit";
import { fmtDate, fmtDays, fmtTime, fmtWorkOrder } from "@/lib/format";
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
 * The car's card, the same rows wherever it is: logo (or `icon` without a car), name over plate and number,
 * what it is in for, the customer and the clock, then the mechanic, where it is on the
 * calendar and the total. The shell (size, border, click) belongs to the caller. Every
 * row is laid out in a container, so a narrow calendar block drops the rows it cannot
 * hold, one by one, and the tooltip keeps the rest.
 */
export function VisitCard({ facts, topPad = "", gap = "gap-2" }) {
	const { vehicle, icon: Icon, name, plate, number, subject, customer, mechanic, anchor, timing, gross } = facts;
	return (
		<span className={cn("flex h-full min-w-0 flex-col", gap)}>
			<span className={cn("flex min-w-0 items-center gap-2", topPad)}>
				<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-card/70 @max-[9rem]:hidden">
					{Icon && !vehicle ? <Icon className="size-4" aria-hidden /> : <MakeLogo make={vehicle?.make} className="size-4" />}
				</span>
				<span className="min-w-0 flex-1">
					<span className="block truncate text-xs font-semibold">{name}</span>
					<span className="flex min-w-0 items-center gap-1.5 text-2xs opacity-80">
						{plate && (
							<span translate="no" className="truncate font-mono tracking-wide uppercase">
								{plate}
							</span>
						)}
						{number && <span className="shrink-0 tabular-nums">{number}</span>}
					</span>
				</span>
			</span>
			<span className="truncate text-2xs font-medium @max-[7rem]:hidden">{subject || " "}</span>
			<span className={cn("flex items-center justify-between gap-2 text-2xs", timingClass(timing?.mark))}>
				<span className="truncate opacity-80">{customer ?? "Client necunoscut"}</span>
				{timing && (
					<span className={cn("flex min-w-0 shrink-0 items-center gap-1", timingClass(timing.mark))}>
						{timing.mark && <Clock className="size-3 shrink-0" aria-hidden />}
						<span className="truncate">{timing.text}</span>
					</span>
				)}
			</span>
			<span className="mt-auto flex items-center justify-between gap-2 border-t border-current/15 pt-1.5 text-2xs">
				<span className="flex min-w-0 items-center gap-1.5">
					{mechanic ? <Initials name={mechanic.name} tone={mechanic.color} size="sm" className="size-4.5" /> : null}
					<span className="truncate opacity-80">{anchor}</span>
				</span>
				{gross != null && (
					<span className="shrink-0 text-right font-semibold tabular-nums">
						<Money value={gross} decimals={0} />
					</span>
				)}
			</span>
		</span>
	);
}
