"use client";

import { useState } from "react";
import { Clock, UserRound } from "lucide-react";
import { ContactActions } from "@/components/ds/contact";
import { DetailSheet } from "@/components/ds/detail-sheet";
import { InlineText } from "@/components/ds/inline-text";
import { KeyValue, KeyValueGrid } from "@/components/ds/data";
import { PlateTag, VehicleLabel } from "@/components/ds/make-logo";
import { ToneBadge } from "@/components/ds/tone";
import { findConflicts } from "@/domain/appointment";
import { dayOfInstant, minutesBetween } from "@/domain/dates";
import { deadline, lastReading } from "@/domain/vehicle";
import { fmtDate, fmtKm, fmtTime } from "@/lib/format";
import { DEADLINE_STATUS } from "@/lib/labels";
import { useRemember } from "@/lib/recents";
import { openSheet } from "@/lib/sheets";
import { saveAppointment } from "@/lib/store/actions";
import { useCollection, useEntity, useSettings, useToday } from "@/lib/store/hooks";
import { selectAppointmentsByDay } from "@/lib/store/selectors";
import { toast } from "@/lib/toast";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { AppointmentLinks } from "@/features/flow/visit-links";
import { CustomerNote } from "@/features/reviews/customer-note";
import { AppointmentHistory, AppointmentState } from "./appointment-state";

const durationLabel = (m) => (m < 60 ? `${m} min` : `${(m / 60).toLocaleString("ro-RO", { maximumFractionDigits: 1 })} h`);

/** The booking's own words when it has none: its operations, or just "Programare". */
const autoTitle = (a) => (a.operations ?? []).map((op) => op.name).filter(Boolean).join(", ") || "Programare";

/**
 * The booking (docs/VISIT-FLOW.md §4): "Programare #128" with its description edited in
 * place, the flow strip (the job it became, or the way to start it), its state section,
 * then who, what and when, and its history. Everything else is edited in its form.
 */
export default function AppointmentView({ open, onOpenChange, id }) {
	const settings = useSettings();
	const today = useToday();
	const a = useEntity("appointments", id);
	useRemember("appointment", a?.id);
	const customer = useEntity("customers", a?.customerId);
	const vehicle = useEntity("vehicles", a?.vehicleId);
	const mechanic = useEntity("staff", a?.staffId);
	const bay = useEntity("bays", a?.bayId);
	const workOrders = useCollection("workOrders");
	const order = a ? ((a.workOrderId && workOrders[a.workOrderId]) || Object.values(workOrders).find((o) => o.appointmentId === a.id) || null) : null;
	const services = useCollection("services");
	// A panel of the state section (reschedule, delay, a reason), also opened from the strip's "Reprogramează".
	const [panel, setPanel] = useState(null);
	const last = vehicle ? lastReading(vehicle) : null;
	const itp = vehicle && today ? deadline(vehicle.itpExpiry, today) : null;
	const rca = vehicle && today ? deadline(vehicle.rcaExpiry, today) : null;
	// Only the appointment's own day, and only while it is shown.
	const byDay = selectAppointmentsByDay(useCollection("appointments"));
	const conflicts = a && open ? findConflicts(a, byDay.get(dayOfInstant(a.start)) ?? []) : [];
	const serviceNames = a?.operations ? a.operations.map((op) => op.name).filter(Boolean) : a?.serviceIds?.map((sid) => services[sid]?.name).filter(Boolean);

	const rename = (text) => {
		try {
			saveAppointment({ ...a, title: text || autoTitle(a) });
		} catch (error) {
			toast.error(error.message);
		}
	};

	return (
		<DetailSheet
			open={open}
			onOpenChange={onOpenChange}
			entity={a}
			missing="Programarea a fost ștearsă."
			title={a?.number != null ? `Programare #${a.number}` : "Programare"}
			description={a ? <InlineText value={a.title} placeholder={autoTitle(a)} label="Descrierea programării" onSave={rename} /> : undefined}
			onEdit={() => openSheet("appointment", { id: a.id })}
		>
			{a && (
				<div className="space-y-6">
					<AppointmentLinks appointment={a} onReschedule={() => setPanel("reschedule")} />
					<AppointmentState appointment={a} order={order} panel={panel} onPanel={setPanel} />

					<div className="space-y-4">
						<p className="flex items-center gap-1.5 text-sm">
							<Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
							<span className="font-medium first-letter:uppercase">{fmtDate(a.start, "EEEE, d MMMM")}</span>
							<span className="text-muted-foreground tabular-nums">
								· {fmtTime(a.start)}–{fmtTime(a.end)} ({durationLabel(minutesBetween(a.start, a.end))})
							</span>
						</p>
						{conflicts.length > 0 && <p className={cn("rounded-lg border p-3 text-sm", tone("yellow").chip)}>Se suprapune cu altă programare (același mecanic sau elevator).</p>}
						<div className="grid gap-2 sm:grid-cols-2">
							{customer && (
								<button type="button" onClick={() => openSheet("customer-view", { id: customer.id })} className="flex min-h-14 items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent/50">
									<UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
									<span className="min-w-0">
										<span className="block text-xs text-muted-foreground">Client</span>
										<span className="block truncate text-sm font-medium">{customer.name}</span>
										{(customer.phone || customer.email) && <span className="block truncate text-xs text-muted-foreground">{[customer.phone, customer.email].filter(Boolean).join(" · ")}</span>}
										<CustomerNote customerId={customer.id} className="mt-0.5" />
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
											{itp && vehicle.itpExpiry && (
												<ToneBadge tone={DEADLINE_STATUS[itp.status].tone} size="sm">
													ITP {fmtDate(vehicle.itpExpiry, "dd.MM.yy")}
												</ToneBadge>
											)}
											{rca && vehicle.rcaExpiry && (
												<ToneBadge tone={DEADLINE_STATUS[rca.status].tone} size="sm">
													RCA {fmtDate(vehicle.rcaExpiry, "dd.MM.yy")}
												</ToneBadge>
											)}
										</span>
									</span>
								</button>
							)}
						</div>
						<KeyValueGrid className="sm:grid-cols-2">
							<KeyValue label="Servicii" className="col-span-2 [&_dd]:whitespace-normal">
								{serviceNames?.length ? serviceNames.join(", ") : null}
							</KeyValue>
							<KeyValue label="Mecanic">{mechanic?.name}</KeyValue>
							<KeyValue label="Elevator">{bay?.name}</KeyValue>
						</KeyValueGrid>
						{a.notes && <p className="rounded-lg bg-muted p-3 text-sm whitespace-pre-line">{a.notes}</p>}
						{customer?.phone && (
							<ContactActions phone={customer.phone} message={`Bună ziua! Vă reamintim programarea din ${fmtDate(a.start, "dd.MM.yyyy")}, ora ${fmtTime(a.start)}. ${settings.shop.name}`} />
						)}
					</div>

					<AppointmentHistory appointment={a} />
				</div>
			)}
		</DetailSheet>
	);
}
