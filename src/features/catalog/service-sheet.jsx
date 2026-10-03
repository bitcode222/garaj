"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ds/confirm";
import { Money } from "@/components/ds/data";
import { Field, MoneyInput, NumberInput } from "@/components/ds/inputs";
import { Sheet } from "@/components/ds/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { laborPrice } from "@/domain/lines";
import { SERVICE_CATEGORIES } from "@/lib/labels";
import { deleteCatalogItem, saveService } from "@/lib/store/actions";
import { useCollection, useEntity, useSettings } from "@/lib/store/hooks";
import { selectList } from "@/lib/store/selectors";

const EMPTY = { name: "", category: "maintenance", hours: 1, price: null, parts: [] };

export default function ServiceSheet({ open, onOpenChange, id }) {
	const confirm = useConfirm();
	const settings = useSettings();
	const existing = useEntity("services", id);
	const parts = useCollection("parts");
	const partList = selectList(parts);
	const [form, setForm] = useState(() => ({ ...EMPTY, ...existing }));
	const [touched, setTouched] = useState(false);
	const set = (patch) => setForm((f) => ({ ...f, ...patch }));
	const suggested = laborPrice(form.hours, settings.laborRate);
	const packageValue = form.parts.reduce((sum, p) => sum + (parts[p.partId]?.price ?? 0) * p.qty, 0);

	const submit = (event) => {
		event.preventDefault();
		setTouched(true);
		if (!form.name.trim()) return;
		try {
			saveService({ ...form, price: form.price ?? suggested });
			toast.success(existing ? "Operațiune actualizată." : "Operațiune adăugată.");
			onOpenChange(false);
		} catch (error) {
			toast.error(error.message);
		}
	};

	const remove = async () => {
		if (!(await confirm({ title: `Ștergi „${existing.name}”?`, description: "Lucrările și facturile existente nu se schimbă.", confirmLabel: "Șterge", destructive: true }))) return;
		deleteCatalogItem("services", existing.id);
		toast.success("Operațiune ștearsă.");
		onOpenChange(false);
	};

	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
			title={existing ? "Editează operațiunea" : "Operațiune nouă"}
			footer={
				<>
					{existing && (
						<Button variant="ghost" size="icon" className="mr-auto text-destructive" onClick={remove} aria-label="Șterge operațiunea">
							<Trash2 />
						</Button>
					)}
					<Button variant="outline" className="max-md:h-11" onClick={() => onOpenChange(false)}>
						Renunță
					</Button>
					<Button type="submit" form="service-form" className="max-md:h-11">
						Salvează
					</Button>
				</>
			}
		>
			<form id="service-form" onSubmit={submit} className="grid gap-4" noValidate>
				<Field label="Denumire" required error={touched && !form.name.trim() ? "Completează denumirea." : null}>
					{(fid) => <Input id={fid} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="ex. Schimb ulei și filtru" />}
				</Field>
				<Field label="Categorie">
					{(fid) => (
						<Select value={form.category} onValueChange={(category) => set({ category })}>
							<SelectTrigger id={fid} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{Object.entries(SERVICE_CATEGORIES).map(([value, c]) => (
									<SelectItem key={value} value={value}>
										{c.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</Field>
				<div className="grid grid-cols-2 gap-4">
					<Field label="Timp normat" hint="Ore de manoperă">
						{(fid) => <NumberInput id={fid} decimals={2} suffix="h" value={form.hours} onValueChange={(hours) => set({ hours: hours ?? 0 })} />}
					</Field>
					<Field label="Preț manoperă (fără TVA)" hint={`Tarif orar: ${(settings.laborRate / 100).toLocaleString("ro-RO")} lei/h`}>
						{(fid) => <MoneyInput id={fid} value={form.price ?? suggested} onValueChange={(price) => set({ price })} />}
					</Field>
				</div>
				<Field label="Piese incluse (pachet)" hint="Se adaugă automat în deviz odată cu operațiunea">
					<div className="space-y-2">
						{form.parts.map((p, i) => (
							<div key={`${p.partId}-${i}`} className="flex items-center gap-2">
								<span className="min-w-0 flex-1 truncate text-sm">{parts[p.partId]?.name ?? "Piesă ștearsă"}</span>
								<div className="w-24">
									<NumberInput
										value={p.qty}
										onValueChange={(qty) => set({ parts: form.parts.map((x, j) => (j === i ? { ...x, qty: qty ?? 0 } : x)) })}
										aria-label="Cantitate"
									/>
								</div>
								<Button type="button" variant="ghost" size="icon" onClick={() => set({ parts: form.parts.filter((_, j) => j !== i) })} aria-label="Scoate piesa">
									<X />
								</Button>
							</div>
						))}
						<Select value="" onValueChange={(partId) => set({ parts: [...form.parts, { partId, qty: 1 }] })}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Adaugă piesă în pachet…" />
							</SelectTrigger>
							<SelectContent>
								{partList.map((p) => (
									<SelectItem key={p.id} value={p.id}>
										{p.name} · {p.brand}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</Field>
				<div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2.5 text-sm">
					<span className="text-muted-foreground">Total pachet (fără TVA)</span>
					<Money value={(form.price ?? suggested) + packageValue} className="font-semibold" />
				</div>
			</form>
		</Sheet>
	);
}
