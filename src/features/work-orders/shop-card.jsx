"use client";

import { ArrowRight, Clock, TriangleAlert } from "lucide-react";
import { ContactActions } from "@/components/ds/contact";
import { Initials, Money } from "@/components/ds/data";
import { HeroCard, HeroChip } from "@/components/ds/hero-card";
import { PlateTag } from "@/components/ds/make-logo";
import { computeTotals } from "@/domain/lines";
import { formatPlate, vehicleName } from "@/domain/vehicle";
import { daysInStatus, isStale, minutesInShop } from "@/domain/work-order";
import { fmtDays, fmtDuration, fmtWorkOrder } from "@/lib/format";
import { WORK_ORDER_STATUS } from "@/lib/labels";

/**
 * A car in the shop, as a banner. Reading order is the order of importance:
 *   1. colour + status chip         what state is it in?  (readable from across the room)
 *   2. "late" chip · clock          does it need me now? how long has it been here?
 *   3. make / model, plate, owner   which car, and who is on it?
 *   4. why it is here               complaint, else what the status waits on
 *   5. open · call · total          what can I do, and what is it worth
 */
export function ShopCard({ order, vehicle, customer, mechanic, settings, today, now, onOpen }) {
	const meta = WORK_ORDER_STATUS[order.status];
	const late = isStale(order, today);
	const total = computeTotals(order.lines, { vatPayer: settings.invoicing.vatPayer }).gross;
	const call = order.status === "ready" && customer?.phone;

	return (
		<HeroCard tone={meta.tone} make={vehicle?.make} className="group flex min-h-48 flex-col transition-shadow hover:shadow-md">
			{/* The whole card opens the job; the buttons below sit above this layer. */}
			<button type="button" onClick={onOpen} className="absolute inset-0 z-0 rounded-2xl focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none" aria-label={`Deschide lucrarea ${fmtWorkOrder(order.number)}, ${vehicleName(vehicle)}`} />

			{/* 1-2. state and urgency on the left; how long it has been here on the right, like the timer on a banner */}
			<div className="pointer-events-none relative z-10 flex items-center gap-1.5">
				<HeroChip icon={meta.icon}>{meta.label}</HeroChip>
				{late && (
					<HeroChip icon={TriangleAlert} strong>
						{fmtDays(-daysInStatus(order, today))}
					</HeroChip>
				)}
				{now && (
					<HeroChip icon={Clock} className="ml-auto">
						{fmtDuration(minutesInShop(order, now))}
					</HeroChip>
				)}
			</div>

			{/* 3-4. which car (and who is on it), whose, and why it is here */}
			<div className="pointer-events-none relative z-10 mt-3 min-w-0">
				<div className="flex items-start gap-2">
					<h3 className="min-w-0 flex-1 truncate text-lg leading-7 font-semibold">{vehicleName(vehicle) || "Mașină"}</h3>
					{mechanic && <Initials name={mechanic.name} tone={mechanic.color} size="sm" className="mt-0.5 ring-2 ring-white/70" />}
				</div>
				<p className="mt-1 flex min-w-0 items-center gap-2 text-sm text-white/90">
					{vehicle && <PlateTag value={vehicle.plate} className="border-white/30 bg-white/15 text-white" />}
					<span className="truncate">{customer?.name}</span>
				</p>
				<p className="mt-1.5 line-clamp-2 text-sm text-white/80">{order.complaint || meta.hint}</p>
			</div>

			<div className="pointer-events-none relative z-10 mt-auto flex flex-wrap items-center gap-2 pt-4">
				<span className="pointer-events-none inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-semibold text-foreground shadow-xs transition-transform group-hover:translate-x-0.5 dark:bg-white/90 dark:text-zinc-900">
					Deschide <ArrowRight className="size-4" aria-hidden />
				</span>
				{call && (
					<ContactActions
						phone={customer.phone}
						labels={false}
						message={`Bună ziua! ${vehicleName(vehicle)} (${formatPlate(vehicle?.plate)}) este gata de ridicare. Program: ${settings.hours.open}–${settings.hours.close}. ${settings.shop.name}`}
						className="pointer-events-auto gap-1.5 [&_a]:size-9 [&_a]:border-white/30 [&_a]:bg-white/15 [&_a]:text-white [&_a]:hover:bg-white/25"
					/>
				)}
				<HeroChip className="pointer-events-none ml-auto">
					<Money value={total} decimals={0} />
				</HeroChip>
			</div>
		</HeroCard>
	);
}
