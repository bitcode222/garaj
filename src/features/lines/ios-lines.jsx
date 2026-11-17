"use client";

import { useState } from "react";
import { Banknote, Check, CircleCheck, Hammer, Package, Plus, Settings2, Trash2, Undo2, Wrench } from "lucide-react";
import { SwipeRow } from "@/components/ds/swipe-row";
import { IosIconSquare } from "@/components/ds/ios";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { computeTotals, lineNet } from "@/domain/lines";
import { formatMoney, formatQuantity } from "@/domain/money";
import { STATE, TONE_COLOR } from "@/lib/colors";
import { LINE_KINDS, SERVICE_CATEGORIES } from "@/lib/labels";
import { blankLine } from "@/lib/store/actions";
import { useCollection } from "@/lib/store/hooks";
import { cn } from "@/lib/utils";
import { CatalogPicker } from "./catalog-picker";
import { LineSheet } from "./lines-editor";

// A job's lines on a phone, as the iPhone app's (WorkOrderDetailView "Operații și piese", LineRow): each line with its
// symbol, what it is, kind · qty × price · mechanic, its value; a tap edits it; "Adaugă o operație sau o piesă" as a
// menu; the total under them. The rows sit inside the page's rounded card.

const BROWN = "#a2845e";

function LineIcon({ line, services }) {
	if (line.kind === "part") return <IosIconSquare icon={Package} color={BROWN} />;
	if (line.kind === "fee") return <IosIconSquare icon={Banknote} color={TONE_COLOR.neutral} />;
	const category = line.refId ? services[line.refId]?.category : null;
	return <IosIconSquare icon={Wrench} color={TONE_COLOR[SERVICE_CATEGORIES[category]?.tone] ?? "#ff9500"} />;
}

export function IosLines({ lines, onChange, staff = [], vatPayer = true, readOnly = false, defaultStaffId = null, currency = "RON", onToggleDone }) {
	const services = useCollection("services");
	const [editing, setEditing] = useState(null);
	const [picker, setPicker] = useState(false);
	const staffById = Object.fromEntries(staff.map((s) => [s.id, s]));
	const totals = computeTotals(lines.filter((l) => !l.refused), { vatPayer });
	const money = (v, decimals = 2) => formatMoney(v, currency, { decimals });
	const update = (id, patch) => onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
	const add = (kind) => {
		const line = { ...blankLine(kind), staffId: kind === "labor" ? defaultStaffId : null };
		onChange([...lines, line]);
		setEditing(line);
	};
	return (
		<>
			{lines.map((line) => {
				const person = line.staffId ? staffById[line.staffId] : null;
				const kind = LINE_KINDS[line.kind]?.label ?? "Linie";
				return (
					<li key={line.id}>
						<SwipeRow
							leading={!readOnly && onToggleDone ? [{ key: "done", label: line.done ? "Nu e gata" : "Gata", icon: line.done ? Undo2 : Check, tone: line.done ? "neutral" : "green", onSelect: () => onToggleDone(line) }] : []}
							trailing={!readOnly ? [{ key: "remove", label: "Șterge", icon: Trash2, tone: "red", onSelect: () => onChange(lines.filter((l) => l.id !== line.id)) }] : []}
						>
						<button type="button" disabled={readOnly} onClick={() => setEditing(line)} className="flex w-full items-center gap-3 bg-card px-4 py-2.5 text-left active:bg-foreground/[0.06] disabled:active:bg-card">
							<span className={cn("flex min-w-0 flex-1 items-center gap-3", line.done && "opacity-55")}>
								<LineIcon line={line} services={services} />
								<span className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span className={cn("text-[17px] leading-[22px]", line.refused && "line-through")}>{line.description || kind}</span>
									<span className="text-[12px] text-muted-foreground tabular-nums">
										{kind} · {formatQuantity(line.qty)} {line.unit} × {money(line.unitPrice)}
										{line.discountPct > 0 ? ` −${line.discountPct}%` : ""}
										{person ? ` · ${person.name}` : ""}
									</span>
									{line.refused && <span className="text-[12px]" style={{ color: STATE.late }}>Refuzată de client</span>}
								</span>
								<span className="shrink-0 text-[17px] font-semibold tabular-nums">{money(lineNet(line))}</span>
							</span>
							{line.done && <CircleCheck className="size-5 shrink-0" fill={STATE.ok} stroke="#fff" aria-label="Gata" />}
						</button>
						</SwipeRow>
					</li>
				);
			})}
			{!readOnly && (
				<li>
					<DropdownMenu>
						<DropdownMenuTrigger className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-[17px] text-brand">
							<span className="flex size-[22px] items-center justify-center rounded-full bg-brand text-white">
								<Plus className="size-4" strokeWidth={3} aria-hidden />
							</span>
							Adaugă o operație sau o piesă
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="w-64">
							<DropdownMenuItem onSelect={() => setPicker(true)}>
								<Wrench /> Manoperă din catalog
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => setPicker(true)}>
								<Package /> Piesă din stoc
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem onSelect={() => add("labor")}>
								<Hammer /> Manoperă liberă
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => add("part")}>
								<Settings2 /> Piesă liberă
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => add("fee")}>
								<Banknote /> Taxă
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</li>
			)}
			{lines.length > 0 && (
				<li className="flex items-baseline gap-3 px-4 py-3">
					<span className="flex min-w-0 flex-1 flex-col gap-0.5">
						<span className="text-[17px] font-semibold">{vatPayer ? "Total cu TVA" : "Total"}</span>
						<span className="text-[12px] text-muted-foreground">
							{[totals.labor ? `manoperă ${money(totals.labor, 0)}` : null, totals.parts + (totals.fees ?? 0) ? `piese ${money(totals.parts + (totals.fees ?? 0), 0)}` : null].filter(Boolean).join(" · ")}
						</span>
					</span>
					<span className="flex shrink-0 flex-col items-end gap-0.5">
						<span className="text-[17px] font-semibold tabular-nums">{money(totals.gross)}</span>
						{vatPayer && <span className="text-[12px] text-muted-foreground tabular-nums">{money(totals.net, 0)} + TVA {money(totals.gross - totals.net)}</span>}
					</span>
				</li>
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
						onChange(lines.filter((l) => l.id !== editing.id));
						setEditing(null);
					}}
				/>
			)}
			<CatalogPicker open={picker} onOpenChange={setPicker} onAdd={(added) => onChange([...lines, ...added])} staffId={defaultStaffId} />
		</>
	);
}
