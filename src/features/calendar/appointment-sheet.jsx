"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarCheck, CarFront, CircleX, Trash2, TriangleAlert, UserX, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ds/confirm";
import { ContactActions } from "@/components/ds/contact";
import { Field } from "@/components/ds/inputs";
import { Sheet } from "@/components/ds/sheet";
import { StatusBadge } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { findConflicts } from "@/domain/appointment";
import { combineDateTime, dayOfInstant, pad2, todayISO } from "@/domain/dates";
import { fmtTime } from "@/lib/format";
import { APPOINTMENT_STATUS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { deleteAppointment, saveAppointment, setAppointmentStatus } from "@/lib/store/actions";
import { useCollection, useEntity, useSettings } from "@/lib/store/hooks";
import { selectActive, selectAppointmentsByDay } from "@/lib/store/selectors";
import { ServicesField } from "@/features/common/services-field";
import { CustomerPicker, VehiclePicker } from "@/features/pickers/entity-pickers";

const DURATIONS = [30, 60, 90, 120, 180, 240, 480];
const durationLabel = (m) => (m === 480 ? "Toată ziua (8 h)" : m < 60 ? `${m} min` : `${m / 60} h`.replace(".", ","));

function nextSlot(settings) {
	const now = new Date();
	const minutes = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30;
	const [openH] = settings.hours.open.split(":").map(Number);
	const [closeH] = settings.hours.close.split(":").map(Number);
	const clamped = Math.min(Math.max(minutes, openH * 60), (closeH - 1) * 60);
	return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

export default function AppointmentSheet({ open, onOpenChange, id, start, staffId, vehicleId }) {
	const router = useRouter();
	const confirm = useConfirm();
	const settings = useSettings();
	const existing = useEntity("appointments", id);
	const services = useCollection("services");
	const vehicles = useCollection("vehicles");
	const customers = useCollection("customers");
	const staff = selectActive(useCollection("staff"));
	const bays = selectActive(useCollection("bays"));
	const byDay = selectAppointmentsByDay(useCollection("appointments"));

	const [form, setForm] = useState(() => {
		const base = existing ?? {};
		const startISO = base.start ?? start ?? null;
		const duration = base.start ? Math.round((new Date(base.end) - new Date(base.start)) / 60000) : settings.calendar.defaultDuration;
		return {
			customerId: base.customerId ?? vehicles[vehicleId]?.customerId ?? null,
			vehicleId: base.vehicleId ?? vehicleId ?? null,
			serviceIds: base.serviceIds ?? [],
			title: base.title ?? "",
			notes: base.notes ?? "",
			date: startISO ? dayOfInstant(startISO) : todayISO(),
			time: startISO ? fmtTime(startISO) : nextSlot(settings),
			duration,
			staffId: base.staffId ?? staffId ?? null,
			bayId: base.bayId ?? null,
		};
	});
	const [touched, setTouched] = useState(false);
	const set = (patch) => setForm((f) => ({ ...f, ...patch }));

	const startISO = form.date && form.time ? combineDateTime(form.date, form.time) : null;
	const endISO = startISO ? new Date(new Date(startISO).getTime() + form.duration * 60000).toISOString() : null;
	const candidate = { id: existing?.id, status: existing?.status ?? "scheduled", start: startISO, end: endISO, staffId: form.staffId, bayId: form.bayId };
	const conflicts = startISO ? findConflicts(candidate, byDay.get(form.date) ?? []) : [];
	const customer = form.customerId ? customers[form.customerId] : null;

	const onServices = (serviceIds) => {
		const hours = serviceIds.reduce((sum, sid) => sum + (Number(services[sid]?.hours) || 0), 0);
		const autoTitle = serviceIds.map((sid) => services[sid]?.name).filter(Boolean).join(", ");
		const previousAuto = form.serviceIds.map((sid) => services[sid]?.name).filter(Boolean).join(", ");
		set({
			serviceIds,
			title: !form.title || form.title === previousAuto ? autoTitle : form.title,
			duration: hours ? Math.max(30, Math.ceil((hours * 60) / 30) * 30) : form.duration,
		});
	};

	const submit = (event) => {
		event.preventDefault();
		setTouched(true);
		if (!form.customerId) return;
		try {
			const { conflicts: found } = saveAppointment({
				...(existing ?? {}),
				customerId: form.customerId,
				vehicleId: form.vehicleId,
				serviceIds: form.serviceIds,
				title: form.title.trim() || "Programare",
				notes: form.notes,
				start: startISO,
				end: endISO,
				staffId: form.staffId,
				bayId: form.bayId,
			});
			toast.success(existing ? "Programare actualizată." : "Programare adăugată.", {
				description: found.length ? `Atenție: se suprapune cu ${found.length} ${found.length === 1 ? "altă programare" : "alte programări"}.` : undefined,
			});
			onOpenChange(false);
		} catch (error) {
			toast.error(error.message);
		}
	};

	const status = async (to) => {
		try {
			setAppointmentStatus(existing.id, to);
			toast.success(`Programare: ${APPOINTMENT_STATUS[to].label.toLowerCase()}.`);
			onOpenChange(false);
		} catch (error) {
			toast.error(error.message);
		}
	};

	const remove = async () => {
		if (!(await confirm({ title: "Ștergi programarea?", confirmLabel: "Șterge", destructive: true }))) return;
		try {
			deleteAppointment(existing.id);
			toast.success("Programarea a fost ștearsă.");
			onOpenChange(false);
		} catch (error) {
			toast.error(error.message);
		}
	};

	const canCheckIn = existing && ["scheduled", "confirmed"].includes(existing.status);

	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
			title={existing ? "Programare" : "Programare nouă"}
			description={existing ? undefined : "Rezervă un interval pentru client și mașină"}
			footer={
				<>
					{existing && !existing.workOrderId && (
						<Button variant="ghost" size="icon" className="mr-auto text-destructive max-md:hidden" onClick={remove} aria-label="Șterge programarea">
							<Trash2 />
						</Button>
					)}
					<Button variant="outline" className="max-md:h-11" onClick={() => onOpenChange(false)}>
						Renunță
					</Button>
					<Button type="submit" form="appointment-form" className="max-md:h-11">
						Salvează
					</Button>
				</>
			}
		>
			{existing && (
				<div className="mb-5 space-y-3 rounded-xl border bg-muted/40 p-3">
					<div className="flex items-center justify-between gap-2">
						<StatusBadge map={APPOINTMENT_STATUS} value={existing.status} />
						{existing.workOrderId ? (
							<Button
								size="sm"
								onClick={() => {
									onOpenChange(false);
									router.push(`/work-orders/detail/?id=${existing.workOrderId}`);
								}}
							>
								<Wrench /> Deschide lucrarea
							</Button>
						) : canCheckIn ? (
							<Button
								size="sm"
								onClick={() => {
									onOpenChange(false);
									setTimeout(() => openSheet("checkin", { appointmentId: existing.id }), 330);
								}}
							>
								<CarFront /> A sosit — primire
							</Button>
						) : null}
					</div>
					{canCheckIn && (
						<div className="flex flex-wrap gap-2">
							{existing.status === "scheduled" && (
								<Button size="sm" variant="outline" onClick={() => status("confirmed")}>
									<CalendarCheck /> Confirmă
								</Button>
							)}
							<Button size="sm" variant="outline" onClick={() => status("no_show")}>
								<UserX /> Neprezentat
							</Button>
							<Button size="sm" variant="outline" onClick={() => status("cancelled")}>
								<CircleX /> Anulează
							</Button>
						</div>
					)}
					{["no_show", "cancelled"].includes(existing.status) && (
						<Button size="sm" variant="outline" onClick={() => status("scheduled")}>
							Reprogramează
						</Button>
					)}
					{customer?.phone && <ContactActions phone={customer.phone} message={`Bună ziua! Vă reamintim programarea din ${form.date.split("-").reverse().join(".")}, ora ${form.time}. ${settings.shop.name}`} />}
				</div>
			)}

			<form id="appointment-form" onSubmit={submit} className="grid gap-4" noValidate>
				<Field label="Client" required error={touched && !form.customerId ? "Alege clientul." : null}>
					<CustomerPicker value={form.customerId} onChange={(customerId) => set({ customerId, vehicleId: customerId === form.customerId ? form.vehicleId : null })} />
				</Field>
				<Field label="Mașină">
					<VehiclePicker value={form.vehicleId} customerId={form.customerId} onChange={(vid, v) => set({ vehicleId: vid, customerId: form.customerId ?? v.customerId })} />
				</Field>
				<Field label="Operațiuni">
					<ServicesField value={form.serviceIds} onChange={onServices} />
				</Field>
				<Field label="Titlu">{(fid) => <Input id={fid} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="ex. Revizie + geometrie" />}</Field>
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
					<Field label="Data">{(fid) => <Input id={fid} type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />}</Field>
					<Field label="Ora">{(fid) => <Input id={fid} type="time" step={900} value={form.time} onChange={(e) => set({ time: e.target.value })} />}</Field>
					<Field label="Durată" className="col-span-2 sm:col-span-1">
						{(fid) => (
							<Select value={String(form.duration)} onValueChange={(v) => set({ duration: Number(v) })}>
								<SelectTrigger id={fid} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{[...new Set([...DURATIONS, form.duration])].sort((a, b) => a - b).map((m) => (
										<SelectItem key={m} value={String(m)}>
											{durationLabel(m)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</Field>
				</div>
				<div className="grid grid-cols-2 gap-4">
					<Field label="Mecanic">
						{(fid) => (
							<Select value={form.staffId ?? "none"} onValueChange={(v) => set({ staffId: v === "none" ? null : v })}>
								<SelectTrigger id={fid} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">Nealocat</SelectItem>
									{staff.map((s) => (
										<SelectItem key={s.id} value={s.id}>
											{s.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</Field>
					<Field label="Post">
						{(fid) => (
							<Select value={form.bayId ?? "none"} onValueChange={(v) => set({ bayId: v === "none" ? null : v })}>
								<SelectTrigger id={fid} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">Nealocat</SelectItem>
									{bays.map((b) => (
										<SelectItem key={b.id} value={b.id}>
											{b.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</Field>
				</div>
				{conflicts.length > 0 && (
					<div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
						<TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
						<div>
							<p className="font-medium">Suprapunere</p>
							<ul className="mt-0.5 text-xs">
								{conflicts.map((c) => (
									<li key={c.id}>
										{fmtTime(c.start)}–{fmtTime(c.end)} · {c.title}
										{c.staffId === form.staffId ? " · același mecanic" : " · același post"}
									</li>
								))}
							</ul>
						</div>
					</div>
				)}
				<Field label="Notițe">{(fid) => <Textarea id={fid} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />}</Field>
				{existing && !existing.workOrderId && (
					<Button type="button" variant="ghost" className="text-destructive md:hidden" onClick={remove}>
						<Trash2 /> Șterge programarea
					</Button>
				)}
			</form>
		</Sheet>
	);
}
