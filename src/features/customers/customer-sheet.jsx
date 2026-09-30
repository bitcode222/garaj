"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Field, Segmented } from "@/components/ds/inputs";
import { Sheet } from "@/components/ds/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { isValidCUI, isValidEmail, normalizePhone } from "@/domain/customer";
import { CUSTOMER_TYPES } from "@/lib/labels";
import { saveCustomer } from "@/lib/store/actions";
import { useEntity } from "@/lib/store/hooks";

const EMPTY = { type: "person", name: "", phone: "", email: "", cui: "", regCom: "", contactName: "", address: "", city: "", county: "", notes: "", marketingConsent: true };

export default function CustomerSheet({ open, onOpenChange, id, navigate = true }) {
	const router = useRouter();
	const existing = useEntity("customers", id);
	const [form, setForm] = useState(() => ({ ...EMPTY, ...existing }));
	const [touched, setTouched] = useState(false);
	const set = (patch) => setForm((f) => ({ ...f, ...patch }));
	const company = form.type === "company";

	const errors = {
		name: !form.name.trim() ? "Completează numele." : null,
		phone: form.phone && normalizePhone(form.phone).replace(/\D/g, "").length < 9 ? "Numărul pare incomplet." : null,
		email: form.email && !isValidEmail(form.email) ? "Adresa de email nu pare validă." : null,
	};
	const cuiWarning = company && form.cui && !isValidCUI(form.cui) ? "CUI-ul nu trece verificarea cifrei de control." : null;

	const submit = (event) => {
		event.preventDefault();
		setTouched(true);
		if (Object.values(errors).some(Boolean)) return;
		try {
			const saved = saveCustomer(form);
			toast.success(existing ? "Client actualizat." : "Client adăugat.");
			onOpenChange(false);
			if (!existing && navigate) router.push(`/customers/detail/?id=${saved.id}`);
		} catch (error) {
			toast.error(error.message);
		}
	};

	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
			title={existing ? "Editează clientul" : "Client nou"}
			footer={
				<>
					<Button variant="outline" className="max-md:h-11" onClick={() => onOpenChange(false)}>
						Renunță
					</Button>
					<Button type="submit" form="customer-form" className="max-md:h-11">
						Salvează
					</Button>
				</>
			}
		>
			<form id="customer-form" onSubmit={submit} className="grid gap-4" noValidate>
				<Segmented
					value={form.type}
					onValueChange={(type) => set({ type })}
					options={Object.entries(CUSTOMER_TYPES).map(([value, label]) => ({ value, label }))}
					className="h-11 w-full md:h-10 [&>button]:flex-1"
				/>
				<Field label={company ? "Denumire firmă" : "Nume și prenume"} required error={touched && errors.name}>
					{(fid) => <Input id={fid} value={form.name} onChange={(e) => set({ name: e.target.value })} autoComplete="off" />}
				</Field>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field label="Telefon" error={touched && errors.phone} hint="Pentru apel, SMS și WhatsApp">
						{(fid) => <Input id={fid} type="tel" inputMode="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="07xx xxx xxx" />}
					</Field>
					<Field label="Email" error={touched && errors.email}>
						{(fid) => <Input id={fid} type="email" inputMode="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />}
					</Field>
				</div>
				{company && (
					<div className="grid gap-4 sm:grid-cols-2">
						<Field label="CUI" hint={cuiWarning ?? "Necesar pentru factură (e-Factura)"}>
							{(fid) => <Input id={fid} value={form.cui} onChange={(e) => set({ cui: e.target.value.toUpperCase() })} placeholder="RO12345678" aria-invalid={Boolean(cuiWarning) || undefined} />}
						</Field>
						<Field label="Nr. Reg. Comerțului">{(fid) => <Input id={fid} value={form.regCom} onChange={(e) => set({ regCom: e.target.value })} placeholder="J40/123/2020" />}</Field>
						<Field label="Persoană de contact" className="sm:col-span-2">
							{(fid) => <Input id={fid} value={form.contactName ?? ""} onChange={(e) => set({ contactName: e.target.value })} />}
						</Field>
					</div>
				)}
				<Field label="Adresă">{(fid) => <Input id={fid} value={form.address} onChange={(e) => set({ address: e.target.value })} />}</Field>
				<div className="grid grid-cols-2 gap-4">
					<Field label="Localitate">{(fid) => <Input id={fid} value={form.city} onChange={(e) => set({ city: e.target.value })} />}</Field>
					<Field label="Județ / sector">{(fid) => <Input id={fid} value={form.county} onChange={(e) => set({ county: e.target.value })} />}</Field>
				</div>
				<Field label="Notițe">{(fid) => <Textarea id={fid} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />}</Field>
				<label className="flex items-start justify-between gap-4 rounded-lg border p-3">
					<span>
						<span className="block text-sm font-medium">Acceptă reamintiri</span>
						<span className="block text-xs text-muted-foreground">ITP, RCA, revizie — prin SMS sau WhatsApp (GDPR)</span>
					</span>
					<Switch checked={Boolean(form.marketingConsent)} onCheckedChange={(marketingConsent) => set({ marketingConsent })} />
				</label>
			</form>
		</Sheet>
	);
}
