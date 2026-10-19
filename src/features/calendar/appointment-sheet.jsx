"use client";

import { useState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ds/confirm";
import { Field } from "@/components/ds/inputs";
import { Sheet } from "@/components/ds/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { findConflicts } from "@/domain/appointment";
import { combineDateTime, dayOfInstant, minutesBetween, pad2, todayISO } from "@/domain/dates";
import { fmtTime } from "@/lib/format";
import { createAppointment, deleteAppointment, resolveOperations, saveAppointment } from "@/lib/store/actions";
import { useCollection, useEntity, useSettings } from "@/lib/store/hooks";
import { selectActive, selectAppointmentsByDay } from "@/lib/store/selectors";
import { ServicesField } from "@/features/common/services-field";
import { CustomerPicker, VehiclePicker } from "@/features/pickers/entity-pickers";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

const DURATIONS = [30, 60, 90, 120, 180, 240, 480];
// "30 min", "1,5 h", "2 h"; a length off the half-hour grid (drawn on a calendar) is spelled out: "1 h 15 min".
const durationLabel = (m) => (m === 480 ? "Toată ziua (8 h)" : m < 60 ? `${m} min` : m % 30 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`.replace(".", ","));

function nextSlot(settings) {
	const now = new Date();
	const minutes = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30;
	const [openH] = settings.hours.open.split(":").map(Number);
	const [closeH] = settings.hours.close.split(":").map(Number);
	const clamped = Math.min(Math.max(minutes, openH * 60), (closeH - 1) * 60);
	return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

/** `start` (and `end`, when the interval was drawn on a calendar) and `staffId` prefill a new booking. */
export default function AppointmentSheet({ open, onOpenChange, id, start, end, staffId, vehicleId }) {
	const confirm = useConfirm();
	const settings = useSettings();
	const existing = useEntity("appointments", id);
	const services = useCollection("services");
	const vehicles = useCollection("vehicles");
	const staff = selectActive(useCollection("staff"));
	const bays = selectActive(useCollection("bays"));
	const byDay = selectAppointmentsByDay(useCollection("appointments"));

	const [form, setForm] = useState(() => {
		const base = existing ?? {};
		const startISO = base.start ?? start ?? null;
		const duration = base.start ? minutesBetween(base.start, base.end) : start && end ? minutesBetween(start, end) : settings.calendar.defaultDuration;
		return {
			customerId: base.customerId ?? vehicles[vehicleId]?.customerId ?? null,
			vehicleId: base.vehicleId ?? vehicleId ?? null,
			operations: resolveOperations(base),
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
	// An interval drawn on the calendar was chosen on purpose: the operations' hours do not replace it.
	const drawn = !existing && Boolean(start && end);
	const set = (patch) => setForm((f) => ({ ...f, ...patch }));

	const startISO = form.date && form.time ? combineDateTime(form.date, form.time) : null;
	const endISO = startISO ? new Date(new Date(startISO).getTime() + form.duration * 60000).toISOString() : null;
	const candidate = { id: existing?.id, status: existing?.status ?? "scheduled", start: startISO, end: endISO, staffId: form.staffId, bayId: form.bayId };
	const conflicts = startISO ? findConflicts(candidate, byDay.get(form.date) ?? []) : [];

	const onServices = (operations) => {
		const hours = operations.reduce((sum, op) => sum + (Number(op.hours) || 0), 0);
		const autoTitle = operations.map((op) => op.name).filter(Boolean).join(", ");
		const previousAuto = form.operations.map((op) => op.name).filter(Boolean).join(", ");
		set({
			operations,
			title: !form.title || form.title === previousAuto ? autoTitle : form.title,
			duration: hours && !drawn ? Math.max(30, Math.ceil((hours * 60) / 30) * 30) : form.duration,
		});
	};

	const submit = async (event) => {
		event.preventDefault();
		setTouched(true);
		if (!form.customerId) return;
		try {
			// A new booking gets its number from the counter (createAppointment); an edit keeps it.
			const save = existing ? saveAppointment : createAppointment;
			const { conflicts: found } = await save({
				...(existing ?? {}),
				customerId: form.customerId,
				vehicleId: form.vehicleId,
				serviceIds: form.operations.map((op) => op.serviceId).filter(Boolean),
				operations: form.operations,
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


	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
			title={existing ? `Editează programarea${existing.number != null ? ` #${existing.number}` : ""}` : "Programare nouă"}
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
			<form id="appointment-form" onSubmit={submit} className="grid gap-4" noValidate>
				<Field label="Client" required error={touched && !form.customerId ? "Alege clientul." : null}>
					<CustomerPicker value={form.customerId} onChange={(customerId) => set({ customerId, vehicleId: customerId === form.customerId ? form.vehicleId : null })} />
				</Field>
				<Field label="Mașină">
					<VehiclePicker value={form.vehicleId} customerId={form.customerId} onChange={(vid, v) => set({ vehicleId: vid, customerId: form.customerId ?? v.customerId })} />
				</Field>
				<Field label="Operațiuni">
					<ServicesField value={form.operations} onChange={onServices} />
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
					<div className={cn("flex items-start gap-2 rounded-lg border p-3 text-sm", tone("yellow").chip)}>
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
