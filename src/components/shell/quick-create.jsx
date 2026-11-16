"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarPlus, CarFront, FilePlus2, UserPlus, Wrench } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AREA } from "@/lib/colors";
import { useLocalPreference } from "@/lib/hooks";
import { openSheet } from "@/lib/sheets";
import { createInvoiceDraft } from "@/lib/store/actions";
import { REST_LOOK_KEY, REST_VALUES } from "@/features/common/rest-look";

// What "Nou" makes, each in its area's colour (docs/DESIGN.md §1, rule 2).
const ITEMS = [
	{ key: "appointment", label: "Programare", hint: "Când vine o mașină", icon: CalendarPlus, color: AREA.programare },
	{ key: "checkin", label: "Recepție", hint: "A sosit o mașină", icon: Wrench, color: AREA.lucrare },
	{ key: "invoice", label: "Factură", hint: "Fără lucrare", icon: FilePlus2, color: AREA.factura },
	{ key: "customer", label: "Client", hint: "Cu sau fără mașină", icon: UserPlus, color: AREA.clienti },
	{ key: "vehicle", label: "Mașină", hint: "Pentru un client", icon: CarFront, color: AREA.masini },
];

function Tile({ item, large }) {
	return (
		<span className="flex w-full flex-col gap-3 text-left">
			<span className="flex size-8 items-center justify-center rounded-[8px]" style={{ background: `color-mix(in srgb, ${item.color} 14%, transparent)`, color: item.color }}>
				<item.icon className="size-4" aria-hidden />
			</span>
			<span>
				<span className={large ? "block text-[14.5px] font-semibold" : "block text-[13.5px] font-semibold"}>{item.label}</span>
				<span className="block text-xs text-muted-foreground">{item.hint}</span>
			</span>
		</span>
	);
}

/**
 * The global "Nou" (docs/DESIGN.md §4): with "Listă", tiles in a menu under its button; with "File", a centred sheet
 * with the same tiles (the switch of Catalog and Setări).
 */
export function QuickCreate({ children, side = "bottom" }) {
	const router = useRouter();
	const [look] = useLocalPreference(REST_LOOK_KEY, REST_VALUES[0], REST_VALUES);
	const [open, setOpen] = useState(false);
	const create = (key) => {
		setOpen(false);
		if (key === "invoice") {
			const draft = createInvoiceDraft();
			router.push(`/invoices/detail/?id=${draft.id}`);
		} else {
			openSheet(key);
		}
	};
	if (look === "tabs") {
		return (
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogTrigger asChild>{children}</DialogTrigger>
				<DialogContent className="gap-5 rounded-2xl sm:max-w-xl">
					<div>
						<DialogTitle className="text-lg font-semibold">Ce adaugi?</DialogTitle>
						<DialogDescription className="text-[13px]">Alege ce faci; se deschide formularul lui.</DialogDescription>
					</div>
					<div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
						{ITEMS.map((item) => (
							<button key={item.key} type="button" onClick={() => create(item.key)} className="rounded-xl border bg-card p-3.5 transition-colors hover:bg-accent/50">
								<Tile item={item} large />
							</button>
						))}
					</div>
				</DialogContent>
			</Dialog>
		);
	}
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
			<DropdownMenuContent side={side} align={side === "right" ? "start" : "end"} className="w-[22rem] p-2">
				<DropdownMenuLabel className="text-xs text-muted-foreground">Nou</DropdownMenuLabel>
				<div className="grid grid-cols-2 gap-1.5">
					{ITEMS.map((item) => (
						<DropdownMenuItem key={item.key} onSelect={() => create(item.key)} className="items-start rounded-xl border bg-card p-3 focus:bg-accent/60">
							<Tile item={item} />
						</DropdownMenuItem>
					))}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
