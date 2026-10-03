"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Field, NumberInput } from "@/components/ds/inputs";
import { Plate } from "@/components/ds/plate";
import { Sheet } from "@/components/ds/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { todayISO } from "@/domain/dates";
import { lastReading, normalizePlate, vinIssue } from "@/domain/vehicle";
import { fmtKm } from "@/lib/format";
import { FUELS } from "@/lib/labels";
import { recordMileage, saveVehicle } from "@/lib/store/actions";
import { useEntity } from "@/lib/store/hooks";
import { CustomerPicker } from "@/features/pickers/entity-pickers";
import { navigateFromSheet } from "@/lib/sheets";

const EMPTY = {
	plate: "",
	vin: "",
	make: "",
	model: "",
	engine: "",
	fuel: "",
	year: null,
	color: "",
	itpExpiry: "",
	rcaExpiry: "",
	serviceIntervalKm: null,
	serviceIntervalMonths: null,
	lastServiceDate: "",
	lastServiceKm: null,
	notes: "",
};

export default function VehicleSheet({ open, onOpenChange, id, customerId, navigate = true }) {
	const router = useRouter();
	const existing = useEntity("vehicles", id);
	const [form, setForm] = useState(() => ({ ...EMPTY, customerId: customerId ?? null, ...existing }));
	const [km, setKm] = useState(null);
	const [touched, setTouched] = useState(false);
	const set = (patch) => setForm((f) => ({ ...f, ...patch }));
	const last = lastReading(existing);
	const vinWarning = vinIssue(form.vin);
	const errors = {
		plate: !normalizePlate(form.plate) ? "Completează numărul de înmatriculare." : null,
		customerId: !form.customerId ? "Alege proprietarul." : null,
	};

	const submit = (event) => {
		event.preventDefault();
		setTouched(true);
		if (Object.values(errors).some(Boolean)) return;
		try {
			const saved = saveVehicle({
				...form,
				itpExpiry: form.itpExpiry || null,
				rcaExpiry: form.rcaExpiry || null,
				lastServiceDate: form.lastServiceDate || null,
			});
			if (km) {
				const warning = recordMileage(saved.id, km, { date: todayISO() });
				if (warning) toast.warning(warning);
			}
			toast.success(existing ? "Mașină actualizată." : "Mașină adăugată.");
			if (!existing && navigate) navigateFromSheet(router, `/vehicles/detail/?id=${saved.id}`);
			else onOpenChange(false);
		} catch (error) {
			toast.error(error.message);
		}
	};

	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
			title={existing ? "Editează mașina" : "Mașină nouă"}
			size="lg"
			footer={
				<>
					<Button variant="outline" className="max-md:h-11" onClick={() => onOpenChange(false)}>
						Renunță
					</Button>
					<Button type="submit" form="vehicle-form" className="max-md:h-11">
						Salvează
					</Button>
				</>
			}
		>
			<form id="vehicle-form" onSubmit={submit} className="grid gap-4" noValidate>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field label="Număr de înmatriculare" required error={touched && errors.plate}>
						{(fid) => (
							<Input
								id={fid}
								value={form.plate}
								onChange={(e) => set({ plate: e.target.value.toUpperCase() })}
								autoCapitalize="characters"
								autoComplete="off"
								className="font-mono uppercase"
								placeholder="B 123 ABC"
							/>
						)}
					</Field>
					<div className="flex items-end pb-1 max-sm:hidden">{normalizePlate(form.plate) && <Plate value={form.plate} size="lg" />}</div>
				</div>
				<Field label="Proprietar" required error={touched && errors.customerId}>
					<CustomerPicker value={form.customerId} onChange={(cid) => set({ customerId: cid })} invalid={touched && Boolean(errors.customerId)} />
				</Field>
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
					<Field label="Marcă">{(fid) => <Input id={fid} value={form.make} onChange={(e) => set({ make: e.target.value })} placeholder="Dacia" />}</Field>
					<Field label="Model">{(fid) => <Input id={fid} value={form.model} onChange={(e) => set({ model: e.target.value })} placeholder="Logan" />}</Field>
					<Field label="Motorizare">{(fid) => <Input id={fid} value={form.engine ?? ""} onChange={(e) => set({ engine: e.target.value })} placeholder="1.5 dCi" />}</Field>
					<Field label="Combustibil">
						{(fid) => (
							<Select value={form.fuel || "none"} onValueChange={(fuel) => set({ fuel: fuel === "none" ? "" : fuel })}>
								<SelectTrigger id={fid} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">—</SelectItem>
									{Object.entries(FUELS).map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</Field>
					<Field label="An fabricație">
						{(fid) => <NumberInput id={fid} decimals={0} value={form.year} onValueChange={(year) => set({ year })} placeholder="2018" />}
					</Field>
					<Field label="Culoare">{(fid) => <Input id={fid} value={form.color ?? ""} onChange={(e) => set({ color: e.target.value })} />}</Field>
				</div>
				<Field label="Serie șasiu (VIN)" hint={vinWarning ?? "17 caractere, fără I, O, Q"}>
					{(fid) => (
						<Input
							id={fid}
							value={form.vin}
							onChange={(e) => set({ vin: e.target.value.toUpperCase() })}
							className="font-mono uppercase"
							autoCapitalize="characters"
							maxLength={17}
							aria-invalid={Boolean(vinWarning) || undefined}
						/>
					)}
				</Field>
				<Field label="Kilometraj actual" hint={last ? `Ultima citire: ${fmtKm(last.km)} (${last.date})` : "Se adaugă în istoricul de kilometraj"}>
					{(fid) => <NumberInput id={fid} decimals={0} suffix="km" value={km} onValueChange={setKm} />}
				</Field>
				<div className="grid grid-cols-2 gap-4">
					<Field label="ITP valabil până la">{(fid) => <Input id={fid} type="date" value={form.itpExpiry ?? ""} onChange={(e) => set({ itpExpiry: e.target.value })} />}</Field>
					<Field label="RCA valabil până la">{(fid) => <Input id={fid} type="date" value={form.rcaExpiry ?? ""} onChange={(e) => set({ rcaExpiry: e.target.value })} />}</Field>
					<Field label="Ultima revizie">{(fid) => <Input id={fid} type="date" value={form.lastServiceDate ?? ""} onChange={(e) => set({ lastServiceDate: e.target.value })} />}</Field>
					<Field label="Km la ultima revizie">
						{(fid) => <NumberInput id={fid} decimals={0} suffix="km" value={form.lastServiceKm} onValueChange={(lastServiceKm) => set({ lastServiceKm })} />}
					</Field>
					<Field label="Interval revizie (km)">
						{(fid) => <NumberInput id={fid} decimals={0} suffix="km" value={form.serviceIntervalKm} onValueChange={(serviceIntervalKm) => set({ serviceIntervalKm })} placeholder="15000" />}
					</Field>
					<Field label="Interval revizie (luni)">
						{(fid) => <NumberInput id={fid} decimals={0} value={form.serviceIntervalMonths} onValueChange={(serviceIntervalMonths) => set({ serviceIntervalMonths })} placeholder="12" />}
					</Field>
				</div>
				<Field label="Notițe">{(fid) => <Textarea id={fid} value={form.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />}</Field>
			</form>
		</Sheet>
	);
}
