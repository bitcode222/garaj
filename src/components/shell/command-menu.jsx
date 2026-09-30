"use client";

import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";
import { CalendarPlus, CarFront, FilePlus2, ReceiptText, UserPlus, Users, Wrench } from "lucide-react";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import { Plate } from "@/components/ds/plate";
import { StatusBadge } from "@/components/ds/tone";
import { matchesTokens, queryTokens } from "@/domain/search";
import { WORK_ORDER_STATUS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { createInvoiceDraft } from "@/lib/store/actions";
import { useCollection } from "@/lib/store/hooks";
import { selectSearchIndex } from "@/lib/store/selectors";
import { NAV } from "./nav";
import { setCommandMenuOpen, useCommandMenuOpen } from "./command-state";

const GROUPS = [
	{ type: "vehicle", heading: "Mașini", icon: CarFront, href: (id) => `/vehicles/detail/?id=${id}` },
	{ type: "customer", heading: "Clienți", icon: Users, href: (id) => `/customers/detail/?id=${id}` },
	{ type: "workOrder", heading: "Lucrări", icon: Wrench, href: (id) => `/work-orders/detail/?id=${id}` },
	{ type: "invoice", heading: "Facturi", icon: ReceiptText, href: (id) => `/invoices/detail/?id=${id}` },
];

const LIMIT = 6;

/** ⌘K: plates, VINs, names, phones and document numbers, plus quick actions. */
export function CommandMenu() {
	const open = useCommandMenuOpen();
	const router = useRouter();
	const [query, setQuery] = useState("");
	const deferred = useDeferredValue(query);
	const index = selectSearchIndex(
		useCollection("customers"),
		useCollection("vehicles"),
		useCollection("workOrders"),
		useCollection("invoices"),
	);

	useEffect(() => {
		const onKey = (event) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				setCommandMenuOpen(true);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const tokens = queryTokens(deferred);
	const results = {};
	if (tokens.length) {
		for (const item of index) {
			const bucket = (results[item.type] ??= []);
			if (bucket.length < LIMIT && matchesTokens(item.hay, tokens)) bucket.push(item);
		}
	}

	const close = () => {
		setCommandMenuOpen(false);
		setQuery("");
	};
	const go = (href) => {
		close();
		router.push(href);
	};
	const create = (type) => {
		close();
		if (type === "invoice") {
			const draft = createInvoiceDraft();
			router.push(`/invoices/detail/?id=${draft.id}`);
		} else {
			openSheet(type);
		}
	};

	return (
		<CommandDialog
			open={open}
			onOpenChange={(value) => (value ? setCommandMenuOpen(true) : close())}
			title="Caută"
			description="Caută după număr de înmatriculare, VIN, nume, telefon sau număr de document."
			className="top-[calc(1rem+var(--safe-top))] translate-y-0 sm:top-[12vh] sm:max-w-xl"
			shouldFilter={false}
		>
			<CommandInput value={query} onValueChange={setQuery} placeholder="Nr. înmatriculare, client, telefon, factură…" />
			<CommandList className="max-h-[min(60vh,440px)]">
				{tokens.length > 0 && <CommandEmpty>Nimic găsit pentru „{deferred}”.</CommandEmpty>}
				{GROUPS.map((group) =>
					results[group.type]?.length ? (
						<CommandGroup key={group.type} heading={group.heading}>
							{results[group.type].map((item) => (
								<CommandItem key={item.id} value={`${item.type}-${item.id}`} onSelect={() => go(group.href(item.id))} className="gap-3 py-2.5">
									{item.type === "vehicle" ? <Plate value={item.plate} size="sm" /> : <group.icon />}
									<span className="min-w-0 flex-1">
										<span className="block truncate font-medium">{item.type === "vehicle" ? item.subtitle : item.title}</span>
										{item.type !== "vehicle" && item.subtitle && <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>}
									</span>
									{item.status && <StatusBadge map={WORK_ORDER_STATUS} value={item.status} size="sm" icon={false} />}
								</CommandItem>
							))}
						</CommandGroup>
					) : null,
				)}
				{!tokens.length && (
					<>
						<CommandGroup heading="Creează">
							<CommandItem value="new-appointment" onSelect={() => create("appointment")}>
								<CalendarPlus /> Programare nouă
							</CommandItem>
							<CommandItem value="new-checkin" onSelect={() => create("checkin")}>
								<Wrench /> Lucrare nouă (primire mașină)
							</CommandItem>
							<CommandItem value="new-invoice" onSelect={() => create("invoice")}>
								<FilePlus2 /> Factură nouă
							</CommandItem>
							<CommandItem value="new-customer" onSelect={() => create("customer")}>
								<UserPlus /> Client nou
							</CommandItem>
						</CommandGroup>
						<CommandSeparator />
						<CommandGroup heading="Mergi la">
							{NAV.map((item) => (
								<CommandItem key={item.href} value={`nav-${item.href}`} onSelect={() => go(item.href)}>
									<item.icon /> {item.label}
								</CommandItem>
							))}
						</CommandGroup>
					</>
				)}
			</CommandList>
		</CommandDialog>
	);
}
