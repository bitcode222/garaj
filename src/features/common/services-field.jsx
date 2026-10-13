"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, RotateCcw, X } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Money } from "@/components/ds/data";
import { Field, MoneyInput, NumberInput } from "@/components/ds/inputs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uid } from "@/domain/ids";
import { laborPrice, operationFigures, operationVatRate, operationFromService } from "@/domain/lines";
import { fmtHours } from "@/lib/format";
import { SERVICE_CATEGORIES } from "@/lib/labels";
import { tone } from "@/lib/tones";
import { saveService } from "@/lib/store/actions";
import { toast } from "@/lib/toast";
import { useCollection, useSettings } from "@/lib/store/hooks";
import { selectList } from "@/lib/store/selectors";
import { cn } from "@/lib/utils";

/**
 * Operations of a job: chips from the catalog, each tappable to override its title, time, price and cost
 * (defaults come from the catalog), plus a searchable picker. `value` is a list of operations.
 */
export function ServicesField({ value = [], onChange }) {
	const services = useCollection("services");
	const list = selectList(services);
	const settings = useSettings();
	const [open, setOpen] = useState(false);
	const [editing, setEditing] = useState(null);
	const [query, setQuery] = useState("");
	const [declined, setDeclined] = useState(() => new Set());
	const ref = useRef(null);

	// Stays open for several picks; only a tap outside closes it.
	useEffect(() => {
		if (!open) return;
		const close = (e) => {
			if (!ref.current?.contains(e.target)) setOpen(false);
		};
		// Capture phase: the sheet may stop propagation of its own pointer events.
		const events = ["pointerdown", "mousedown", "touchstart"];
		events.forEach((name) => document.addEventListener(name, close, true));
		return () => events.forEach((name) => document.removeEventListener(name, close, true));
	}, [open]);
	const groups = Object.entries(SERVICE_CATEGORIES)
		.map(([key, category]) => ({ key, category, items: list.filter((s) => s.category === key && true) }))
		.filter((g) => g.items.length);

	return (
		<div ref={ref} className="flex flex-col items-start gap-2">
			{value.length > 0 && (
				<ul className="flex w-full flex-col gap-2">
					{value.map((op) => {
						const category = services[op.serviceId]?.category;
						const expanded = editing === op.id;
						const vatRate = operationVatRate(op, settings.invoicing);
						const figures = operationFigures(op, vatRate);
						const patch = (changes) => onChange(value.map((o) => (o.id === op.id ? { ...o, ...changes } : o)));
						return (
							<li key={op.id} className={cn("overflow-hidden rounded-lg border", tone(SERVICE_CATEGORIES[category]?.tone).chip)}>
								<div className="flex items-center">
									<button
										type="button"
										onClick={() => setEditing(expanded ? null : op.id)}
										aria-expanded={expanded}
										className="flex min-h-11 min-w-0 flex-1 items-center gap-2 py-1 pr-1 pl-3 text-left text-sm"
									>
										<span className="min-w-0 flex-1">
											<span className="block truncate font-medium">{op.name || "Operațiune"}</span>
											<span className="block text-xs opacity-80">
												{fmtHours(op.hours)} · <Money value={figures.gross} />
												{vatRate > 0 && (
													<>
														{" "}
														(<Money value={figures.net} /> fără TVA)
													</>
												)}
											</span>
										</span>
										<ChevronDown className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-180")} aria-hidden />
									</button>
									<button
										type="button"
										onClick={() => {
											onChange(value.filter((o) => o.id !== op.id));
											if (expanded) setEditing(null);
										}}
										className="flex size-11 shrink-0 items-center justify-center opacity-70 hover:opacity-100"
										aria-label={`Scoate ${op.name}`}
									>
										<X className="size-4" />
									</button>
								</div>
								{expanded && (
									<div className="grid gap-3 border-t bg-card p-3 pb-5 text-card-foreground">
										<Field label="Denumire">{(id) => <Input id={id} autoFocus={!op.name} placeholder="ex. Diagnoză specială" value={op.name} onChange={(e) => patch({ name: e.target.value })} />}</Field>
										<div className="grid grid-cols-2 gap-3">
											<Field label="Timp">
												{(id) => <NumberInput id={id} decimals={2} suffix="h" value={op.hours} onValueChange={(hours) => patch({ hours })} />}
											</Field>
											<Field label="Preț fără TVA">{(id) => <MoneyInput id={id} value={op.price} onValueChange={(price) => patch({ price })} />}</Field>
										</div>
										<div className="grid grid-cols-2 gap-3">
											{settings.invoicing.vatPayer && (
												<Field label="Cota TVA">
													{(id) => <NumberInput id={id} decimals={2} suffix="%" value={vatRate} onValueChange={(v) => patch({ vatRate: v ?? 0 })} />}
												</Field>
											)}
											<Field label="Cost intern" hint="Nu apare pe deviz">
												{(id) => <MoneyInput id={id} value={op.cost} onValueChange={(cost) => patch({ cost })} />}
											</Field>
										</div>
										<dl className="grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-2.5 text-center text-xs">
											<div>
												<dt className="text-muted-foreground">{vatRate ? "Cu TVA" : "Total"}</dt>
												<dd className="mt-0.5 text-sm font-medium"><Money value={figures.gross} /></dd>
											</div>
											<div>
												<dt className="text-muted-foreground">Marjă</dt>
												<dd className="mt-0.5 text-sm font-medium"><Money value={figures.margin} /></dd>
											</div>
											<div>
												<dt className="text-muted-foreground">Marjă %</dt>
												<dd className="mt-0.5 text-sm font-medium">{figures.marginPct}%</dd>
											</div>
										</dl>
										{!op.serviceId && !declined.has(op.id) && (
											<div className="grid gap-2 border-t pt-3">
												<p className="text-sm">Vrei să adaugi această operațiune nouă în catalog, ca să o găsești data viitoare?</p>
												<div className="flex justify-end gap-2">
													<Button type="button" variant="outline" className="max-md:h-11" onClick={() => setDeclined((d) => new Set(d).add(op.id))}>
														Nu acum
													</Button>
													<Button
														type="button"
														className="max-md:h-11"
														onClick={() => {
															try {
																const service = saveService({ name: op.name, hours: Number(op.hours) || 1, price: op.price, cost: op.cost });
																patch({ serviceId: service.id, name: service.name });
																toast.success("Adăugată în catalog.");
															} catch (error) {
																toast.error(error.message);
															}
														}}
													>
														Adaugă în catalog
													</Button>
												</div>
											</div>
										)}
										{services[op.serviceId] && (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="justify-self-start max-md:h-11"
												onClick={() => patch({ ...operationFromService(services[op.serviceId], settings.laborRate), vatRate: undefined })}
											>
												<RotateCcw /> Revino la valorile din catalog
											</Button>
										)}
									</div>
								)}
							</li>
						);
					})}
				</ul>
			)}
			{!open && (
				<Button type="button" variant="outline" size="sm" className="h-8 border-dashed" onClick={() => setOpen(true)}>
					<Plus /> Operațiune
				</Button>
			)}
			{open && (
				<Command className="w-full rounded-lg border">
					<div className="flex items-center border-b *:data-[slot=command-input-wrapper]:flex-1 *:data-[slot=command-input-wrapper]:border-b-0">
						<CommandInput placeholder="Caută operațiune…" autoFocus value={query} onValueChange={setQuery} />
						<Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 rounded-none" onClick={() => setOpen(false)} aria-label="Închide">
							<X />
						</Button>
					</div>
					<CommandList className="max-h-72">
						<CommandGroup>
							<CommandItem
								value="__operatiune-noua"
								forceMount
								onSelect={() => {
									const op = { id: uid(), serviceId: null, name: query.trim(), hours: 1, price: laborPrice(1, settings.laborRate), cost: 0 };
									onChange([...value, op]);
									setEditing(op.id);
									setQuery("");
									setOpen(false);
								}}
								className="min-h-11 font-medium"
							>
								<Plus />
								<span className="flex-1">{query.trim() ? `Operațiune nouă: „${query.trim()}”` : "Operațiune nouă (nu e în catalog)"}</span>
							</CommandItem>
						</CommandGroup>
						<CommandEmpty>Nicio operațiune în catalog.</CommandEmpty>
						{groups.map((group) => (
							<CommandGroup key={group.key} heading={group.category.label}>
								{group.items.map((service) => (
									<CommandItem
										key={service.id}
										value={`${service.name} ${group.category.label}`}
										onSelect={() => onChange([...value, { id: uid(), ...operationFromService(service, settings.laborRate) }])}
										className="py-2"
									>
										<span className="flex-1">{service.name}</span>
										<span className="text-xs text-muted-foreground">{fmtHours(service.hours)}</span>
									</CommandItem>
								))}
							</CommandGroup>
						))}
					</CommandList>
				</Command>
			)}
		</div>
	);
}
