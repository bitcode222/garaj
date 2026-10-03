"use client";

import { useRouter } from "next/navigation";
import { CalendarPlus, Shield, ShieldCheck, Wrench } from "lucide-react";
import { DetailSheet } from "@/components/ds/detail-sheet";
import { KeyValue, KeyValueGrid, Money } from "@/components/ds/data";
import { MakeLogo, PlateTag } from "@/components/ds/make-logo";
import { StatusBadge, ToneBadge } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { computeTotals } from "@/domain/lines";
import { deadline, lastReading, serviceDue, vehicleName } from "@/domain/vehicle";
import { fmtDate, fmtKm, fmtRelativeTo, fmtWorkOrder } from "@/lib/format";
import { DEADLINE_STATUS, FUELS, WORK_ORDER_STATUS } from "@/lib/labels";
import { detailHref } from "@/lib/detail-mode";
import { navigateFromSheet, openSheet } from "@/lib/sheets";
import { useCollection, useEntity, useSettings, useToday } from "@/lib/store/hooks";
import { selectWorkOrdersByVehicle } from "@/lib/store/selectors";

function Deadline({ icon: Icon, title, info, date, today }) {
	const meta = DEADLINE_STATUS[info.status];
	return (
		<div className="min-w-0 rounded-md border p-3">
			<div className="flex items-center justify-between gap-2">
				<span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
					<Icon className="size-3.5" aria-hidden /> {title}
				</span>
				<ToneBadge tone={meta.tone} size="sm">
					{meta.label}
				</ToneBadge>
			</div>
			<p className="mt-1.5 text-base font-semibold tabular-nums">{date ? fmtDate(date) : "—"}</p>
			<p className="truncate text-xs text-muted-foreground">{date && today ? fmtRelativeTo(date, today) : "Necompletat"}</p>
		</div>
	);
}

/** Vehicle overlay: deadlines, owner, current job and recent history. Mileage chart and reminders live on the full page. */
export default function VehicleView({ open, onOpenChange, id }) {
	const router = useRouter();
	const today = useToday();
	const settings = useSettings();
	const vehicle = useEntity("vehicles", id);
	const owner = useEntity("customers", vehicle?.customerId);
	const workOrders = useCollection("workOrders");
	const orders = vehicle ? (selectWorkOrdersByVehicle(workOrders).get(vehicle.id) ?? []) : [];
	const inShop = orders.find((o) => !["delivered", "cancelled"].includes(o.status));
	const last = vehicle ? lastReading(vehicle) : null;
	const itp = vehicle && today ? deadline(vehicle.itpExpiry, today) : { status: "unknown" };
	const rca = vehicle && today ? deadline(vehicle.rcaExpiry, today) : { status: "unknown" };
	const service = vehicle && today ? serviceDue(vehicle, today) : { status: "unknown" };
	const serviceMeta = DEADLINE_STATUS[service.status];

	return (
		<DetailSheet
			open={open}
			onOpenChange={onOpenChange}
			entity={vehicle}
			missing="Mașina a fost ștearsă."
			title={vehicle ? vehicleName(vehicle) || "Mașină" : "Mașină"}
			description={vehicle ? [vehicle.year, vehicle.engine, FUELS[vehicle.fuel], vehicle.color].filter(Boolean).join(" · ") || undefined : undefined}
			fullPage={vehicle && detailHref("vehicle", vehicle.id)}
			onEdit={() => openSheet("vehicle", { id: vehicle.id })}
			footer={
				vehicle && (
					<>
						<Button variant="outline" className="max-md:h-11" onClick={() => openSheet("appointment", { vehicleId: vehicle.id })}>
							<CalendarPlus /> Programează
						</Button>
						{!inShop && (
							<Button className="max-md:h-11" onClick={() => openSheet("checkin", { vehicleId: vehicle.id })}>
								<Wrench /> Primire
							</Button>
						)}
					</>
				)
			}
		>
			{vehicle && (
				<div className="space-y-5">
					<div className="flex flex-wrap items-center gap-2">
						<MakeLogo make={vehicle.make} className="size-8" />
						<PlateTag value={vehicle.plate} />
						{inShop && (
							<button type="button" onClick={() => navigateFromSheet(router, `/work-orders/detail/?id=${inShop.id}`)}>
								<ToneBadge tone="orange" icon={Wrench}>
									În service · {fmtWorkOrder(inShop.number)}
								</ToneBadge>
							</button>
						)}
					</div>

					<div className="grid grid-cols-2 gap-3">
						<Deadline icon={ShieldCheck} title="ITP" info={itp} date={vehicle.itpExpiry} today={today} />
						<Deadline icon={Shield} title="RCA" info={rca} date={vehicle.rcaExpiry} today={today} />
					</div>
					<div className="flex items-center justify-between gap-2 rounded-md border p-3">
						<span className="flex items-center gap-1.5 text-sm font-medium">
							<Wrench className="size-4 text-muted-foreground" aria-hidden /> Revizie
						</span>
						<ToneBadge tone={serviceMeta.tone} size="sm">
							{serviceMeta.label}
						</ToneBadge>
					</div>

					<KeyValueGrid className="sm:grid-cols-2">
						<KeyValue label="Proprietar">
							{owner && (
								<button type="button" className="hover:underline" onClick={() => openSheet("customer-view", { id: owner.id })}>
									{owner.name}
								</button>
							)}
						</KeyValue>
						<KeyValue label="Kilometraj">{last ? `${fmtKm(last.km)} · ${fmtDate(last.date)}` : null}</KeyValue>
						<KeyValue label="VIN" mono>
							{vehicle.vin}
						</KeyValue>
						<KeyValue label="Ultima revizie">{vehicle.lastServiceDate ? `${fmtDate(vehicle.lastServiceDate)} · ${fmtKm(vehicle.lastServiceKm)}` : null}</KeyValue>
					</KeyValueGrid>
					{vehicle.notes && <p className="rounded-lg bg-muted p-3 text-sm whitespace-pre-line">{vehicle.notes}</p>}

					<section className="space-y-2">
						<h3 className="text-sm font-semibold">Istoric service ({orders.length})</h3>
						{orders.length ? (
							<ul className="divide-y rounded-md border">
								{orders.slice(0, 5).map((o) => (
									<li key={o.id}>
										<button type="button" onClick={() => navigateFromSheet(router, `/work-orders/detail/?id=${o.id}`)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/50">
											<span className="w-12 shrink-0 font-mono text-xs font-medium">{fmtWorkOrder(o.number)}</span>
											<span className="min-w-0 flex-1">
												<span className="block truncate text-sm">{o.complaint || o.lines[0]?.description || "Lucrare"}</span>
												<span className="block truncate text-xs text-muted-foreground">{fmtDate(o.createdAt)}</span>
											</span>
											<StatusBadge map={WORK_ORDER_STATUS} value={o.status} size="sm" />
											<Money value={computeTotals(o.lines, { vatPayer: settings.invoicing.vatPayer }).gross} decimals={0} className="w-20 text-right text-sm max-sm:hidden" />
										</button>
									</li>
								))}
							</ul>
						) : (
							<p className="text-sm text-muted-foreground">Nicio lucrare încă.</p>
						)}
					</section>
				</div>
			)}
		</DetailSheet>
	);
}
