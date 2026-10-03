"use client";

import { useRouter } from "next/navigation";
import { CalendarCheck, CarFront, UserRound, Wrench } from "lucide-react";
import { ContactActions } from "@/components/ds/contact";
import { DetailSheet } from "@/components/ds/detail-sheet";
import { KeyValue, KeyValueGrid, Money } from "@/components/ds/data";
import { PlateTag, VehicleLabel } from "@/components/ds/make-logo";
import { StatusMenu, useStatusChange } from "@/components/ds/status-menu";
import { StatusBadge, ToneBadge } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { findConflicts, quickAppointmentMoves } from "@/domain/appointment";
import { dayOfInstant, minutesBetween } from "@/domain/dates";
import { computeTotals } from "@/domain/lines";
import { deadline, lastReading } from "@/domain/vehicle";
import { fmtDate, fmtKm, fmtTime, fmtWorkOrder } from "@/lib/format";
import { APPOINTMENT_STATUS, DEADLINE_STATUS, WORK_ORDER_STATUS } from "@/lib/labels";
import { navigateFromSheet, openSheet } from "@/lib/sheets";
import { useCollection, useEntity, useSettings, useToday } from "@/lib/store/hooks";
import { selectAppointmentsByDay } from "@/lib/store/selectors";
import { APPOINTMENT_ACTIONS, quickMoveAppointment } from "./status";

const durationLabel = (m) => (m < 60 ? `${m} min` : `${(m / 60).toLocaleString("ro-RO", { maximumFractionDigits: 1 })} h`);

/** Read-only appointment overlay: status first (one tap), then who/what/when. Editing is one tap away. */
export default function AppointmentView({ open, onOpenChange, id }) {
	const router = useRouter();
	const settings = useSettings();
	const today = useToday();
	const a = useEntity("appointments", id);
	const customer = useEntity("customers", a?.customerId);
	const vehicle = useEntity("vehicles", a?.vehicleId);
	const mechanic = useEntity("staff", a?.staffId);
	const bay = useEntity("bays", a?.bayId);
	const order = useEntity("workOrders", a?.workOrderId);
	const last = vehicle ? lastReading(vehicle) : null;
	const itp = vehicle && today ? deadline(vehicle.itpExpiry, today) : null;
	const rca = vehicle && today ? deadline(vehicle.rcaExpiry, today) : null;
	const services = useCollection("services");
	// Only the appointment's own day, and only while it is shown.
	const byDay = selectAppointmentsByDay(useCollection("appointments"));
	const conflicts = a && open ? findConflicts(a, byDay.get(dayOfInstant(a.start)) ?? []) : [];

	const change = useStatusChange({
		map: APPOINTMENT_STATUS,
		value: a?.status,
		subject: a?.title || "Programare",
		onMove: (to) => quickMoveAppointment(a, to),
		actions: APPOINTMENT_ACTIONS,
		destructive: ["cancelled", "no_show"],
	});
	const canCheckIn = a && ["scheduled", "confirmed"].includes(a.status);
	const serviceNames = a?.serviceIds?.map((sid) => services[sid]?.name).filter(Boolean);

	return (
		<DetailSheet
			open={open}
			onOpenChange={onOpenChange}
			entity={a}
			missing="Programarea a fost ștearsă."
			title={a?.title || "Programare"}
			description={a ? `${fmtDate(a.start, "EEEE, d MMMM")} · ${fmtTime(a.start)}–${fmtTime(a.end)} (${durationLabel(minutesBetween(a.start, a.end))})` : undefined}
			onEdit={() => openSheet("appointment", { id: a.id })}
		>
			{a && (
				<div className="space-y-5">
					<div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-3">
						<StatusMenu
							map={APPOINTMENT_STATUS}
							value={a.status}
							moves={quickAppointmentMoves(a.status)}
							onMove={(to) => quickMoveAppointment(a, to)}
							subject={a.title || "Programare"}
							actions={APPOINTMENT_ACTIONS}
							destructive={["cancelled", "no_show"]}
						/>
						<div className="ml-auto flex flex-wrap gap-2">
							{a.status === "scheduled" && (
								<Button size="sm" variant="outline" className="max-md:h-11" onClick={() => change("confirmed")}>
									<CalendarCheck /> Confirmă
								</Button>
							)}
							{a.workOrderId ? (
								<Button size="sm" className="max-md:h-11" onClick={() => navigateFromSheet(router, `/work-orders/detail/?id=${a.workOrderId}`)}>
									<Wrench /> Deschide lucrarea
								</Button>
							) : (
								canCheckIn && (
									<Button size="sm" className="max-md:h-11" onClick={() => openSheet("checkin", { appointmentId: a.id })}>
										<CarFront /> A sosit — primire
									</Button>
								)
							)}
						</div>
					</div>

					{conflicts.length > 0 && (
						<p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">Se suprapune cu altă programare (același mecanic sau elevator).</p>
					)}

					<div className="grid gap-2 sm:grid-cols-2">
						{customer && (
							<button type="button" onClick={() => openSheet("customer-view", { id: customer.id })} className="flex min-h-14 items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent/50">
								<UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
								<span className="min-w-0">
									<span className="block text-xs text-muted-foreground">Client</span>
									<span className="block truncate text-sm font-medium">{customer.name}</span>
									{(customer.phone || customer.email) && <span className="block truncate text-xs text-muted-foreground">{[customer.phone, customer.email].filter(Boolean).join(" · ")}</span>}
								</span>
							</button>
						)}
						{vehicle && (
							<button type="button" onClick={() => openSheet("vehicle-view", { id: vehicle.id })} className="flex min-h-14 items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent/50">
								<span className="flex min-w-0 flex-col gap-1">
									<VehicleLabel vehicle={vehicle} nameClassName="text-sm font-medium" />
									<PlateTag value={vehicle.plate} className="self-start" />
									<span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
										{last && <span>{fmtKm(last.km)}</span>}
										{itp && vehicle.itpExpiry && <ToneBadge tone={DEADLINE_STATUS[itp.status].tone} size="sm">ITP {fmtDate(vehicle.itpExpiry, "dd.MM.yy")}</ToneBadge>}
										{rca && vehicle.rcaExpiry && <ToneBadge tone={DEADLINE_STATUS[rca.status].tone} size="sm">RCA {fmtDate(vehicle.rcaExpiry, "dd.MM.yy")}</ToneBadge>}
									</span>
								</span>
							</button>
						)}
					</div>

					{order && (
						<button type="button" onClick={() => openSheet("work-order-view", { id: order.id })} className="flex min-h-14 w-full items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent/50">
							<Wrench className="size-4 shrink-0 text-muted-foreground" aria-hidden />
							<span className="min-w-0 flex-1">
								<span className="block text-xs text-muted-foreground">Lucrare</span>
								<span className="block truncate font-mono text-sm font-medium">{fmtWorkOrder(order.number)}</span>
							</span>
							<StatusBadge map={WORK_ORDER_STATUS} value={order.status} size="sm" />
							<Money value={computeTotals(order.lines, { vatPayer: settings.invoicing.vatPayer }).gross} decimals={0} className="text-sm font-semibold" />
						</button>
					)}

					<KeyValueGrid className="sm:grid-cols-2">
						<KeyValue label="Servicii" className="col-span-2 [&_dd]:whitespace-normal">
							{serviceNames?.length ? serviceNames.join(", ") : null}
						</KeyValue>
						<KeyValue label="Mecanic">{mechanic?.name}</KeyValue>
						<KeyValue label="Elevator">{bay?.name}</KeyValue>
						<KeyValue label="Creată">{fmtDate(a.createdAt, "d MMM yyyy, HH:mm")}</KeyValue>
						<KeyValue label="Modificată">{fmtDate(a.updatedAt, "d MMM yyyy, HH:mm")}</KeyValue>
					</KeyValueGrid>

					{a.notes && <p className="rounded-lg bg-muted p-3 text-sm whitespace-pre-line">{a.notes}</p>}

					{customer?.phone && (
						<ContactActions
							phone={customer.phone}
							message={`Bună ziua! Vă reamintim programarea din ${fmtDate(a.start, "dd.MM.yyyy")}, ora ${fmtTime(a.start)}. ${settings.shop.name}`}
						/>
					)}
				</div>
			)}
		</DetailSheet>
	);
}
