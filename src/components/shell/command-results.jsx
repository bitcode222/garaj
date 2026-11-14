"use client";

import { useDeferredValue } from "react";
import { CalendarPlus, CarFront, FilePlus2, ReceiptText, UserPlus, Users, Wrench } from "lucide-react";
import { CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command";
import { PlateTag } from "@/components/ds/make-logo";
import { StatusBadge } from "@/components/ds/tone";
import { matchesTokens, queryTokens } from "@/domain/search";
import { WORK_ORDER_STATUS } from "@/lib/labels";
import { useCollection } from "@/lib/store/hooks";
import { selectSearchIndex } from "@/lib/store/selectors";
import { NAV } from "./nav";

const GROUPS = [
	{ type: "vehicle", heading: "Mașini", icon: CarFront, href: (id) => `/vehicles/detail/?id=${id}` },
	{ type: "customer", heading: "Clienți", icon: Users, href: (id) => `/customers/detail/?id=${id}` },
	{ type: "workOrder", heading: "Lucrări", icon: Wrench, href: (id) => `/work-orders/detail/?id=${id}` },
	{ type: "invoice", heading: "Facturi", icon: ReceiptText, href: (id) => `/invoices/detail/?id=${id}` },
];

const LIMIT = 6;

/** The search for a query: the matches per group (at most LIMIT each), read from the shop's data. */
export function useSearch(query) {
	const deferred = useDeferredValue(query);
	const index = selectSearchIndex(
		useCollection("customers"),
		useCollection("vehicles"),
		useCollection("workOrders"),
		useCollection("invoices"),
	);

	const tokens = queryTokens(deferred);
	const results = {};
	if (tokens.length) {
		for (const item of index) {
			const bucket = (results[item.type] ??= []);
			if (bucket.length < LIMIT && matchesTokens(item.hay, tokens)) bucket.push(item);
		}
	}
	return { deferred, tokens, results };
}

/**
 * The rows of the search, to sit inside a cmdk list: the matches when there is a query, else
 * the quick actions and the pages. Used by the search dialog and by the field on the home page.
 */
export function SearchResults({ search: { deferred, tokens, results }, onGo, onCreate }) {
	return (
		<>
			{tokens.length > 0 && <CommandEmpty>Nimic găsit pentru „{deferred}”.</CommandEmpty>}
			{GROUPS.map((group) =>
				results[group.type]?.length ? (
					<CommandGroup key={group.type} heading={group.heading}>
						{results[group.type].map((item) => (
							<CommandItem key={item.id} value={`${item.type}-${item.id}`} onSelect={() => onGo(group.href(item.id))} className="gap-3 py-2.5">
								{item.type === "vehicle" ? <PlateTag value={item.plate} /> : <group.icon />}
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
						<CommandItem value="new-appointment" onSelect={() => onCreate("appointment")}>
							<CalendarPlus /> Programare nouă
						</CommandItem>
						<CommandItem value="new-checkin" onSelect={() => onCreate("checkin")}>
							<Wrench /> Lucrare nouă (primire mașină)
						</CommandItem>
						<CommandItem value="new-invoice" onSelect={() => onCreate("invoice")}>
							<FilePlus2 /> Factură nouă
						</CommandItem>
						<CommandItem value="new-customer" onSelect={() => onCreate("customer")}>
							<UserPlus /> Client nou
						</CommandItem>
					</CommandGroup>
					<CommandSeparator />
					<CommandGroup heading="Mergi la">
						{NAV.map((item) => (
							<CommandItem key={item.href} value={`nav-${item.href}`} onSelect={() => onGo(item.href)}>
								<item.icon /> {item.label}
							</CommandItem>
						))}
					</CommandGroup>
				</>
			)}
		</>
	);
}
