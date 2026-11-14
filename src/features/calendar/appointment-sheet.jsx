"use client";

import { useState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ds/confirm";
import { Money } from "@/components/ds/data";
import { Field } from "@/components/ds/inputs";
import { Overline } from "@/components/ds/page";
import { Sheet } from "@/components/ds/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { findConflicts } from "@/domain/appointment";
import { combineDateTime, dayOfInstant, minutesBetween, pad2, todayISO } from "@/domain/dates";
import { operationsEstimate } from "@/domain/lines";
import { fmtDate, fmtTime } from "@/lib/format";
import { createAppointment, deleteAppointment, resolveOperations, saveAppointment } from "@/lib/store/actions";
import { useCollection, useEntity, useSettings } from "@/lib/store/hooks";
import { selectActive, selectAppointmentsByDay } from "@/lib/store/selectors";
import { ServicesField } from "@/features/common/services-field";
import { fmtLength } from "@/features/dashboard/visit-ui";
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

/** A group of the form, in the order of the booking's sheet: an overline, then its fields. */
function Group({ title, first = false, children }) {
	return (
		<fieldset className={cn("grid min-w-0 gap-4", !first && "border-t pt-5")}>
			{title && <Overline>{title}</Overline>}
			{children}
		</fieldset>
	);
}

/**
 * The booking's form, in the order of its sheet (docs/APPOINTMENT-SHEET.md, A6): who comes, what is done,
 * when, who does it, notes; a summary of the whole booking in the footer.
 * `start` (and `end`, when the interval was drawn on a calendar) and `staffId` prefill a new booking.
 */
export default function AppointmentSheet({ open, onOpenChange, id, start, end, staffId, vehicleId }) {
	const confirm = useConfirm();
	const settings = useSettings();
	const existing = useEntity("appointments", id);
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
	const estimate = operationsEstimate(form.operations, { vatPayer: settings.invoicing.vatPayer, vatRate: settings.invoicing.vatRate });
	// The operations' time on the half-hour grid, as the form fills it in when they are picked.
	const fitted = estimate.minutes ? Math.max(30, Math.ceil(estimate.minutes / 30) * 30) : null;
	const mechanic = staff.find((person) => person.id === form.staffId);

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
						<Button variant="ghost" size="icon" className="text-destructive max-md:hidden" onClick={remove} aria-label="Șterge programarea">
							<Trash2 />
						</Button>
					)}
					{/* The booking in one line, as it will be saved. */}
					<p className="mr-auto self-center text-xs text-muted-foreground max-md:hidden">
						{startISO ? `${fmtDate(startISO, "EEE d MMM")}, ${form.time}–${fmtTime(endISO)}` : "Fără oră"} · {mechanic?.name ?? "fără mecanic"}
						{estimate.gross > 0 && (
							<>
								{" · ~ "}
								<Money value={estimate.gross} decimals={0} />
							</>
						)}
					</p>
					<Button variant="outline" className="max-md:h-11" onClick={() => onOpenChange(false)}>
						Renunță
					</Button>
					<Button type="submit" form="appointment-form" className="max-md:h-11">
						Salvează
					</Button>
				</>
			}
		>
			<form id="appointment-form" onSubmit={submit} className="grid gap-6" noValidate>
				<Group title="Cine vine" first>
					<Field label="Client" required error={touched && !form.customerId ? "Alege clientul." : null}>
						<CustomerPicker value={form.customerId} onChange={(customerId) => set({ customerId, vehicleId: customerId === form.customerId ? form.vehicleId : null })} />
					</Field>
					<Field label="Mașină">
						<VehiclePicker value={form.vehicleId} customerId={form.customerId} onChange={(vid, v) => set({ vehicleId: vid, customerId: form.customerId ?? v.customerId })} />
					</Field>
				</Group>

				<Group title="Ce se face">
					<Field label="Operațiuni">
						<ServicesField value={form.operations} onChange={onServices} />
					</Field>
					<Field label="Descriere (opțional)">{(fid) => <Input id={fid} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Se completează din operațiuni" />}</Field>
				</Group>

				<Group title="Când">
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
										{[...new Set([...DURATIONS, form.duration])]
											.sort((a, b) => a - b)
											.map((m) => (
												<SelectItem key={m} value={String(m)}>
													{durationLabel(m)}
												</SelectItem>
											))}
									</SelectContent>
								</Select>
							)}
						</Field>
					</div>
					{fitted && fitted !== form.duration && (
						<p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
							Operațiunile cer {fmtLength(estimate.minutes)}.
							<Button type="button" variant="outline" size="sm" className="max-md:h-11" onClick={() => set({ duration: fitted })}>
								Potrivește durata: {durationLabel(fitted)}
							</Button>
						</p>
					)}
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
				</Group>

				<Group title="Cine lucrează">
					<div className="grid gap-4 sm:grid-cols-2">
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
				</Group>

				<Group>
					<Field label="Notițe">{(fid) => <Textarea id={fid} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />}</Field>
				</Group>

				{existing && !existing.workOrderId && (
					<Button type="button" variant="ghost" className="text-destructive md:hidden" onClick={remove}>
						<Trash2 /> Șterge programarea
					</Button>
				)}
			</form>
		</Sheet>
	);
}
