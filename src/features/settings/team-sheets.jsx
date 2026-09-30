"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Initials } from "@/components/ds/data";
import { Field } from "@/components/ds/inputs";
import { Sheet } from "@/components/ds/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { BAY_KINDS, CALENDAR_COLORS, STAFF_ROLES } from "@/lib/labels";
import { tone } from "@/lib/tones";
import { removeTeamMember, saveBay, saveStaff } from "@/lib/store/actions";
import { useEntity } from "@/lib/store/hooks";
import { cn } from "@/lib/utils";

function ActiveSwitch({ checked, onChange, label }) {
	return (
		<label className="flex items-center justify-between gap-4 rounded-lg border p-3">
			<span className="text-sm font-medium">{label}</span>
			<Switch checked={checked} onCheckedChange={onChange} />
		</label>
	);
}

function RemoveButton({ collection, id, onDone }) {
	return (
		<Button
			variant="ghost"
			className="mr-auto text-destructive"
			onClick={() => {
				const result = removeTeamMember(collection, id);
				toast.success(result === "deleted" ? "Șters." : "Are istoric, așa că a fost dezactivat.");
				onDone();
			}}
		>
			Șterge
		</Button>
	);
}

export function StaffSheet({ open, onOpenChange, id }) {
	const existing = useEntity("staff", id);
	const [form, setForm] = useState(() => ({ name: "", role: "mechanic", color: "blue", phone: "", active: true, ...existing }));
	const set = (patch) => setForm((f) => ({ ...f, ...patch }));
	const submit = (event) => {
		event.preventDefault();
		try {
			saveStaff(form);
			toast.success("Salvat.");
			onOpenChange(false);
		} catch (error) {
			toast.error(error.message);
		}
	};
	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
			title={existing ? "Editează membru" : "Membru nou în echipă"}
			footer={
				<>
					{existing && <RemoveButton collection="staff" id={existing.id} onDone={() => onOpenChange(false)} />}
					<Button variant="outline" className="max-md:h-11" onClick={() => onOpenChange(false)}>
						Renunță
					</Button>
					<Button type="submit" form="staff-form" className="max-md:h-11">
						Salvează
					</Button>
				</>
			}
		>
			<form id="staff-form" onSubmit={submit} className="grid gap-4">
				<div className="flex items-center gap-3">
					<Initials name={form.name || "?"} tone={form.color} size="lg" />
					<Field label="Nume" required className="flex-1">
						{(fid) => <Input id={fid} value={form.name} onChange={(e) => set({ name: e.target.value })} />}
					</Field>
				</div>
				<div className="grid grid-cols-2 gap-4">
					<Field label="Rol">
						{(fid) => (
							<Select value={form.role} onValueChange={(role) => set({ role })}>
								<SelectTrigger id={fid} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(STAFF_ROLES).map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</Field>
					<Field label="Telefon">{(fid) => <Input id={fid} type="tel" inputMode="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />}</Field>
				</div>
				<Field label="Culoare în calendar">
					<div className="flex gap-2">
						{CALENDAR_COLORS.map((c) => (
							<button
								key={c}
								type="button"
								onClick={() => set({ color: c })}
								className={cn("size-9 rounded-full ring-offset-2 ring-offset-card transition", tone(c).solid, form.color === c && "ring-2 ring-foreground")}
								aria-label={c}
								aria-pressed={form.color === c}
							/>
						))}
					</div>
				</Field>
				<ActiveSwitch label="Activ (apare în calendar și la alocare)" checked={form.active !== false} onChange={(active) => set({ active })} />
			</form>
		</Sheet>
	);
}

export function BaySheet({ open, onOpenChange, id }) {
	const existing = useEntity("bays", id);
	const [form, setForm] = useState(() => ({ name: "", kind: "lift", active: true, ...existing }));
	const set = (patch) => setForm((f) => ({ ...f, ...patch }));
	const submit = (event) => {
		event.preventDefault();
		try {
			saveBay(form);
			toast.success("Salvat.");
			onOpenChange(false);
		} catch (error) {
			toast.error(error.message);
		}
	};
	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
			title={existing ? "Editează postul" : "Post de lucru nou"}
			footer={
				<>
					{existing && <RemoveButton collection="bays" id={existing.id} onDone={() => onOpenChange(false)} />}
					<Button variant="outline" className="max-md:h-11" onClick={() => onOpenChange(false)}>
						Renunță
					</Button>
					<Button type="submit" form="bay-form" className="max-md:h-11">
						Salvează
					</Button>
				</>
			}
		>
			<form id="bay-form" onSubmit={submit} className="grid gap-4">
				<Field label="Nume" required>
					{(fid) => <Input id={fid} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Elevator 1" />}
				</Field>
				<Field label="Tip">
					{(fid) => (
						<Select value={form.kind} onValueChange={(kind) => set({ kind })}>
							<SelectTrigger id={fid} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{Object.entries(BAY_KINDS).map(([value, label]) => (
									<SelectItem key={value} value={value}>
										{label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</Field>
				<ActiveSwitch label="Activ" checked={form.active !== false} onChange={(active) => set({ active })} />
			</form>
		</Sheet>
	);
}
