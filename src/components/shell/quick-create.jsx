"use client";

import { useRouter } from "next/navigation";
import { CalendarPlus, CarFront, FilePlus2, UserPlus, Wrench } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { openSheet } from "@/lib/sheets";
import { createInvoiceDraft } from "@/lib/store/actions";

/** The global "+ Nou" menu. */
export function QuickCreate({ children, side = "bottom" }) {
	const router = useRouter();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
			<DropdownMenuContent side={side} align={side === "right" ? "start" : "end"} className="w-60 [&_[role=menuitem]]:py-2.5 md:[&_[role=menuitem]]:py-2">
				<DropdownMenuLabel className="text-xs text-muted-foreground">Creează</DropdownMenuLabel>
				<DropdownMenuItem onSelect={() => openSheet("checkin")}>
					<Wrench /> Primire mașină (lucrare)
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={() => openSheet("appointment")}>
					<CalendarPlus /> Programare
				</DropdownMenuItem>
				<DropdownMenuItem
					onSelect={() => {
						const draft = createInvoiceDraft();
						router.push(`/invoices/detail/?id=${draft.id}`);
					}}
				>
					<FilePlus2 /> Factură
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={() => openSheet("customer")}>
					<UserPlus /> Client
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={() => openSheet("vehicle")}>
					<CarFront /> Mașină
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
