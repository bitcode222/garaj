"use client";

import { useState } from "react";
import { PackagePlus, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ds/confirm";
import { Money } from "@/components/ds/data";
import { Field, MoneyInput, NumberInput } from "@/components/ds/inputs";
import { Sheet } from "@/components/ds/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { priceFromCost } from "@/domain/lines";
import { UNITS } from "@/lib/labels";
import { deleteCatalogItem, receiveStock, savePart } from "@/lib/store/actions";
import { useEntity, useSettings } from "@/lib/store/hooks";

const EMPTY = { code: "", name: "", brand: "", unit: "buc", cost: 0, price: 0, stock: 0, minStock: 0, location: "" };

export default function PartSheet({ open, onOpenChange, id, receive = false }) {
	const confirm = useConfirm();
	const settings = useSettings();
	const existing = useEntity("parts", id);
	const [form, setForm] = useState(() => ({ ...EMPTY, ...existing }));
	const [incoming, setIncoming] = useState(null);
	const [touched, setTouched] = useState(false);
	const set = (patch) => setForm((f) => ({ ...f, ...patch }));
	const margin = form.price > 0 ? ((form.price - form.cost) / form.price) * 100 : 0;

	const submit = (event) => {
		event.preventDefault();
		setTouched(true);
		if (!form.name.trim()) return;
		try {
			const saved = savePart(form);
			if (incoming) receiveStock(saved.id, incoming);
			toast.success(incoming ? `Recepție înregistrată: +${incoming} ${form.unit}` : existing ? "Piesă actualizată." : "Piesă adăugată.");
			onOpenChange(false);
		} catch (error) {
			toast.error(error.message);
		}
	};

	const remove = async () => {
		if (!(await confirm({ title: `Ștergi „${existing.name}”?`, description: "Documentele emise își păstrează liniile.", confirmLabel: "Șterge", destructive: true }))) return;
		deleteCatalogItem("parts", existing.id);
		toast.success("Piesă ștearsă.");
		onOpenChange(false);
	};

	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
			title={receive ? "Recepție marfă" : existing ? "Editează piesa" : "Piesă nouă"}
			footer={
				<>
					{existing && (
						<Button variant="ghost" size="icon" className="mr-auto text-destructive" onClick={remove} aria-label="Șterge piesa">
							<Trash2 />
						</Button>
					)}
					<Button variant="outline" className="max-md:h-11" onClick={() => onOpenChange(false)}>
						Renunță
					</Button>
					<Button type="submit" form="part-form" className="max-md:h-11">
						Salvează
					</Button>
				</>
			}
		>
			<form id="part-form" onSubmit={submit} className="grid gap-4" noValidate>
				{existing && (
					<div className="rounded-xl border bg-muted/40 p-3">
						<Field label={`Recepție: cantitate primită (stoc actual ${existing.stock} ${existing.unit})`}>
							{(fid) => (
								<div className="flex gap-2">
									<NumberInput id={fid} value={incoming} onValueChange={setIncoming} suffix={form.unit} autoFocus={receive} />
									<PackagePlus className="mt-3 size-5 shrink-0 text-muted-foreground md:mt-2" aria-hidden />
								</div>
							)}
						</Field>
					</div>
				)}
				<Field label="Denumire" required error={touched && !form.name.trim() ? "Completează denumirea." : null}>
					{(fid) => <Input id={fid} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="ex. Filtru ulei" />}
				</Field>
				<div className="grid grid-cols-2 gap-4">
					<Field label="Marcă">{(fid) => <Input id={fid} value={form.brand} onChange={(e) => set({ brand: e.target.value })} placeholder="Bosch" />}</Field>
					<Field label="Cod">{(fid) => <Input id={fid} value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} className="font-mono" />}</Field>
					<Field label="Unitate">
						{(fid) => (
							<Select value={form.unit} onValueChange={(unit) => set({ unit })}>
								<SelectTrigger id={fid} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{UNITS.filter((u) => u !== "h").map((u) => (
										<SelectItem key={u} value={u}>
											{u}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</Field>
					<Field label="Raft / locație">{(fid) => <Input id={fid} value={form.location} onChange={(e) => set({ location: e.target.value })} placeholder="A1" />}</Field>
					<Field label="Cost achiziție">{(fid) => <MoneyInput id={fid} value={form.cost} onValueChange={(cost) => set({ cost })} />}</Field>
					<Field
						label="Preț vânzare (fără TVA)"
						hint={
							<button type="button" className="underline underline-offset-2" onClick={() => set({ price: priceFromCost(form.cost, settings.partsMarkup) })}>
								Calculează cu adaos {settings.partsMarkup}%
							</button>
						}
					>
						{(fid) => <MoneyInput id={fid} value={form.price} onValueChange={(price) => set({ price })} />}
					</Field>
					{!existing && <Field label="Stoc inițial">{(fid) => <NumberInput id={fid} value={form.stock} onValueChange={(stock) => set({ stock: stock ?? 0 })} />}</Field>}
					<Field label="Stoc minim" hint="Sub el apare alertă">
						{(fid) => <NumberInput id={fid} value={form.minStock} onValueChange={(minStock) => set({ minStock: minStock ?? 0 })} />}
					</Field>
				</div>
				<div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2.5 text-sm">
					<span className="text-muted-foreground">Adaos pe unitate</span>
					<span className="font-medium">
						<Money value={form.price - form.cost} /> · {margin.toFixed(0)}% marjă
					</span>
				</div>
			</form>
		</Sheet>
	);
}
