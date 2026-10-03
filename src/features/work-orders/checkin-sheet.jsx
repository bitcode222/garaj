"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "@/lib/toast";
import { Field, NumberInput, Segmented } from "@/components/ds/inputs";
import { Sheet } from "@/components/ds/sheet";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { lastReading } from "@/domain/vehicle";
import { fmtKm } from "@/lib/format";
import { FUEL_LEVELS } from "@/lib/labels";
import { checkInAppointment, createWorkOrder } from "@/lib/store/actions";
import { useCollection, useEntity } from "@/lib/store/hooks";
import { selectActive } from "@/lib/store/selectors";
import { ServicesField } from "@/features/common/services-field";
import { CustomerPicker, VehiclePicker } from "@/features/pickers/entity-pickers";
import { navigateFromSheet } from "@/lib/sheets";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

/** "Primire mașină": the 30-second check-in that opens a work order. */
export default function CheckInSheet({ open, onOpenChange, appointmentId, vehicleId }) {
	const router = useRouter();
	const appointment = useEntity("appointments", appointmentId);
	const vehicles = useCollection("vehicles");
	const staff = selectActive(useCollection("staff"));
	const bays = selectActive(useCollection("bays"));
	const [form, setForm] = useState(() => ({
		vehicleId: appointment?.vehicleId ?? vehicleId ?? null,
		customerId: appointment?.customerId ?? vehicles[vehicleId]?.customerId ?? null,
		complaint: appointment?.title ?? "",
		mileage: null,
		fuelLevel: 2,
		serviceIds: appointment?.serviceIds ?? [],
		staffId: appointment?.staffId ?? null,
		bayId: appointment?.bayId ?? null,
		status: "estimate",
	}));
	const [touched, setTouched] = useState(false);
	const [saving, setSaving] = useState(false);
	const set = (patch) => setForm((f) => ({ ...f, ...patch }));
	const vehicle = form.vehicleId ? vehicles[form.vehicleId] : null;
	const last = lastReading(vehicle);
	const lowKm = form.mileage && last && form.mileage < last.km;

	const submit = async (event) => {
		event.preventDefault();
		setTouched(true);
		if (!form.vehicleId || !form.customerId) return;
		setSaving(true);
		try {
			const payload = { ...form, fuelLevel: form.fuelLevel };
			const { order, warning } = appointment
				? await checkInAppointment(appointment.id, payload)
				: await createWorkOrder(payload);
			if (warning) toast.warning(warning);
			toast.success(`Lucrarea #${order.number} a fost deschisă.`);
			navigateFromSheet(router, `/work-orders/detail/?id=${order.id}`);
		} catch (error) {
			toast.error(error.message);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
			title="Primire mașină"
			description={appointment ? `Din programarea: ${appointment.title || "fără titlu"}` : "Deschide o lucrare nouă"}
			footer={
				<>
					<Button variant="outline" className="max-md:h-11" onClick={() => onOpenChange(false)}>
						Renunță
					</Button>
					<Button type="submit" form="checkin-form" disabled={saving} className="max-md:h-11">
						Deschide lucrarea
					</Button>
				</>
			}
		>
			<form id="checkin-form" onSubmit={submit} className="grid gap-4" noValidate>
				<Field label="Mașină" required error={touched && !form.vehicleId ? "Alege sau adaugă mașina." : null}>
					<VehiclePicker
						value={form.vehicleId}
						customerId={form.customerId}
						onChange={(id, v) => set({ vehicleId: id, customerId: v.customerId })}
						invalid={touched && !form.vehicleId}
					/>
				</Field>
				<Field label="Client" required error={touched && !form.customerId ? "Alege clientul." : null}>
					<CustomerPicker value={form.customerId} onChange={(customerId) => set({ customerId })} />
				</Field>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field label="Kilometraj la primire" hint={last ? `Ultima citire: ${fmtKm(last.km)}` : undefined}>
						{(id) => <NumberInput id={id} decimals={0} suffix="km" value={form.mileage} onValueChange={(mileage) => set({ mileage })} />}
					</Field>
					<Field label="Combustibil">
						<Segmented
							value={String(form.fuelLevel)}
							onValueChange={(v) => set({ fuelLevel: Number(v) })}
							options={FUEL_LEVELS.map((label, i) => ({ value: String(i), label: i === 0 ? "R" : label }))}
							className="h-11 w-full md:h-9 [&>button]:flex-1 [&>button]:px-1"
						/>
					</Field>
				</div>
				{lowKm && (
					<p className={cn("flex items-start gap-2 rounded-lg border p-2.5 text-xs", tone("yellow").chip)}>
						<TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
						Kilometrajul este mai mic decât ultima citire ({fmtKm(last.km)}). Verifică sau continuă dacă ceasul a fost înlocuit.
					</p>
				)}
				<Field label="Ce reclamă clientul">
					{(id) => <Textarea id={id} value={form.complaint} onChange={(e) => set({ complaint: e.target.value })} placeholder="ex. zgomot la frânare pe față" />}
				</Field>
				<Field label="Operațiuni estimate" hint="Aduc manopera și piesele din catalog în deviz">
					<ServicesField value={form.serviceIds} onChange={(serviceIds) => set({ serviceIds })} />
				</Field>
				<div className="grid grid-cols-2 gap-4">
					<Field label="Mecanic">
						{(id) => (
							<Select value={form.staffId ?? "none"} onValueChange={(v) => set({ staffId: v === "none" ? null : v })}>
								<SelectTrigger id={id} className="w-full">
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
					<Field label="Post de lucru">
						{(id) => (
							<Select value={form.bayId ?? "none"} onValueChange={(v) => set({ bayId: v === "none" ? null : v })}>
								<SelectTrigger id={id} className="w-full">
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
				<Field label="Pornește ca">
					<Segmented
						value={form.status}
						onValueChange={(status) => set({ status })}
						options={[
							{ value: "estimate", label: "Deviz" },
							{ value: "approved", label: "Aprobat" },
							{ value: "in_progress", label: "În lucru" },
						]}
						className="h-11 w-full md:h-9 [&>button]:flex-1"
					/>
				</Field>
			</form>
		</Sheet>
	);
}
