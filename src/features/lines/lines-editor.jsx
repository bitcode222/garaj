"use client";

import { useState } from "react";
import { BookOpen, EllipsisVertical, Package, Plus, Receipt, Trash2, Wrench } from "lucide-react";
import { Initials, Money } from "@/components/ds/data";
import { Field, MoneyInput, NumberInput } from "@/components/ds/inputs";
import { Sheet } from "@/components/ds/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { lineNet } from "@/domain/lines";
import { formatMoney, formatQuantity } from "@/domain/money";
import { LINE_KINDS, UNITS } from "@/lib/labels";
import { blankLine } from "@/lib/store/actions";
import { cn } from "@/lib/utils";
import { CatalogPicker } from "./catalog-picker";

const KIND_ICON = { labor: Wrench, part: Package, fee: Receipt };

function LineSheet({ line, open, onOpenChange, onSave, onRemove, staff, vatPayer }) {
	const [form, setForm] = useState(line);
	const set = (patch) => setForm((f) => ({ ...f, ...patch }));
	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
			title={LINE_KINDS[form.kind]?.label ?? "Linie"}
			footer={
				<>
					<Button variant="outline" className="text-destructive max-md:h-11" onClick={onRemove}>
						<Trash2 /> Șterge
					</Button>
					<Button className="max-md:h-11" onClick={() => onSave(form)}>
						Salvează
					</Button>
				</>
			}
		>
			<div className="grid gap-4">
				<Field label="Descriere" required>
					{(id) => <Input id={id} value={form.description} onChange={(e) => set({ description: e.target.value })} />}
				</Field>
				<div className="grid grid-cols-2 gap-3">
					<Field label="Cantitate">{(id) => <NumberInput id={id} value={form.qty} onValueChange={(qty) => set({ qty: qty ?? 0 })} />}</Field>
					<Field label="Unitate">
						{(id) => (
							<Select value={form.unit} onValueChange={(unit) => set({ unit })}>
								<SelectTrigger id={id} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{UNITS.map((u) => (
										<SelectItem key={u} value={u}>
											{u}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</Field>
					<Field label="Preț unitar (fără TVA)">{(id) => <MoneyInput id={id} value={form.unitPrice} onValueChange={(unitPrice) => set({ unitPrice })} />}</Field>
					<Field label="Discount">{(id) => <NumberInput id={id} decimals={2} suffix="%" value={form.discountPct} onValueChange={(d) => set({ discountPct: Math.min(100, Math.max(0, d ?? 0)) })} />}</Field>
					{vatPayer && (
						<Field label="Cota TVA">{(id) => <NumberInput id={id} decimals={2} suffix="%" value={form.vatRate} onValueChange={(v) => set({ vatRate: v ?? 0 })} />}</Field>
					)}
					{form.kind === "part" && (
						<Field label="Cost achiziție / unitate" hint="Pentru marja pe piese">
							{(id) => <MoneyInput id={id} value={form.cost} onValueChange={(cost) => set({ cost })} />}
						</Field>
					)}
				</div>
				{form.kind === "labor" && staff?.length > 0 && (
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
				)}
				<div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2.5 text-sm">
					<span className="text-muted-foreground">Valoare linie (fără TVA)</span>
					<Money value={lineNet(form)} className="font-semibold" />
				</div>
			</div>
		</Sheet>
	);
}

/**
 * Line items of an estimate / work order / invoice.
 * Desktop: inline inputs. Phone: compact rows, tap to edit in a sheet.
 */
export function LinesEditor({ lines, onChange, staff = [], vatPayer = true, readOnly = false, defaultStaffId = null }) {
	const [editing, setEditing] = useState(null);
	const [picker, setPicker] = useState(false);
	const staffById = Object.fromEntries(staff.map((s) => [s.id, s]));

	const update = (id, patch) => onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
	const remove = (id) => onChange(lines.filter((l) => l.id !== id));
	const append = (newLines) => onChange([...lines, ...newLines]);
	const addBlank = (kind) => {
		const line = { ...blankLine(kind), staffId: kind === "labor" ? defaultStaffId : null };
		append([line]);
		if (window.matchMedia("(max-width: 767px)").matches) setEditing(line);
	};

	return (
		<div>
			{lines.length > 0 && (
				<div className="overflow-hidden rounded-xl border">
					<div className="hidden grid-cols-[20px_minmax(0,1fr)_84px_104px_64px_104px_32px] items-center gap-2 border-b bg-muted/50 px-3 py-2 text-2xs font-medium tracking-wider text-muted-foreground uppercase md:grid">
						<span />
						<span>Descriere</span>
						<span className="text-right">Cant.</span>
						<span className="text-right">Preț unitar</span>
						<span className="text-right">Disc.</span>
						<span className="text-right">Valoare</span>
						<span />
					</div>
					<ul className="divide-y">
						{lines.map((line) => {
							const Icon = KIND_ICON[line.kind] ?? Receipt;
							const person = line.staffId ? staffById[line.staffId] : null;
							return (
								<li key={line.id}>
									{/* phone */}
									<button
										type="button"
										disabled={readOnly}
										onClick={() => setEditing(line)}
										className="flex w-full items-center gap-3 px-3 py-3 text-left md:hidden"
									>
										<Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
										<span className="min-w-0 flex-1">
											<span className={cn("block text-sm font-medium", !line.description && "text-muted-foreground italic")}>
												{line.description || "Fără descriere"}
											</span>
											<span className="block text-xs text-muted-foreground tabular-nums">
												{formatQuantity(line.qty)} {line.unit} × {formatMoney(line.unitPrice)}
												{line.discountPct ? ` · −${line.discountPct}%` : ""}
												{person ? ` · ${person.name}` : ""}
											</span>
										</span>
										<Money value={lineNet(line)} className="text-sm font-medium" />
									</button>
									{/* desktop */}
									<div className="hidden grid-cols-[20px_minmax(0,1fr)_84px_104px_64px_104px_32px] items-center gap-2 px-3 py-2 md:grid">
										<Icon className="size-4 text-muted-foreground" aria-label={LINE_KINDS[line.kind]?.label} />
										<div className="flex min-w-0 items-center gap-2">
											<Input
												value={line.description}
												readOnly={readOnly}
												placeholder="Descriere"
												onChange={(e) => update(line.id, { description: e.target.value })}
												className="h-8 border-transparent bg-transparent px-1.5 shadow-none hover:border-input focus-visible:border-ring"
											/>
											{person && <Initials name={person.name} tone={person.color} size="sm" />}
										</div>
										<NumberInput
											value={line.qty}
											readOnly={readOnly}
											onValueChange={(qty) => update(line.id, { qty: qty ?? 0 })}
											className="h-8 px-1.5 text-right"
											aria-label="Cantitate"
										/>
										<MoneyInput
											value={line.unitPrice}
											readOnly={readOnly}
											onValueChange={(unitPrice) => update(line.id, { unitPrice })}
											className="h-8 pl-1.5"
											aria-label="Preț unitar"
										/>
										<NumberInput
											value={line.discountPct}
											decimals={2}
											readOnly={readOnly}
											onValueChange={(d) => update(line.id, { discountPct: Math.min(100, Math.max(0, d ?? 0)) })}
											className="h-8 px-1.5 text-right"
											aria-label="Discount %"
										/>
										<Money value={lineNet(line)} className="text-right text-sm font-medium" />
										{!readOnly && (
											<Button variant="ghost" size="icon-sm" onClick={() => setEditing(line)} aria-label="Mai multe">
												<EllipsisVertical />
											</Button>
										)}
									</div>
								</li>
							);
						})}
					</ul>
				</div>
			)}

			{!readOnly && (
				<div className="mt-3 flex flex-wrap gap-2">
					<Button variant="outline" onClick={() => setPicker(true)} className="max-md:h-11 max-md:w-full">
						<BookOpen /> Din catalog
					</Button>
					<Button variant="ghost" onClick={() => addBlank("labor")} className="max-md:h-10 max-md:flex-1">
						<Plus /> Manoperă
					</Button>
					<Button variant="ghost" onClick={() => addBlank("part")} className="max-md:h-10 max-md:flex-1">
						<Plus /> Piesă
					</Button>
					<Button variant="ghost" onClick={() => addBlank("fee")} className="max-md:h-10 max-md:flex-1">
						<Plus /> Altele
					</Button>
				</div>
			)}

			{editing && (
				<LineSheet
					key={editing.id}
					line={lines.find((l) => l.id === editing.id) ?? editing}
					open
					staff={staff}
					vatPayer={vatPayer}
					onOpenChange={(open) => !open && setEditing(null)}
					onSave={(form) => {
						update(form.id, form);
						setEditing(null);
					}}
					onRemove={() => {
						remove(editing.id);
						setEditing(null);
					}}
				/>
			)}
			<CatalogPicker open={picker} onOpenChange={setPicker} onAdd={append} staffId={defaultStaffId} />
		</div>
	);
}
