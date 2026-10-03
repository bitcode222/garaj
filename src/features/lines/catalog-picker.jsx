"use client";

import { useDeferredValue, useState } from "react";
import { Check, Package, Plus, Wrench } from "lucide-react";
import { toast } from "@/lib/toast";
import { Money } from "@/components/ds/data";
import { SearchInput } from "@/components/ds/inputs";
import { Sheet } from "@/components/ds/sheet";
import { ToneBadge } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { stockLevel } from "@/domain/inventory";
import { fold, matchesTokens, queryTokens } from "@/domain/search";
import { fmtHours } from "@/lib/format";
import { SERVICE_CATEGORIES, STOCK_STATUS } from "@/lib/labels";
import { lineFromPart, linesFromService } from "@/lib/store/actions";
import { useCollection } from "@/lib/store/hooks";
import { selectList, selectReserved } from "@/lib/store/selectors";
import { cn } from "@/lib/utils";

/** Pick labor operations (with their parts package) and parts from the catalog. Stays open for several picks. */
export function CatalogPicker({ open, onOpenChange, onAdd, staffId = null }) {
	const [query, setQuery] = useState("");
	const [added, setAdded] = useState(0);
	const deferred = useDeferredValue(query);
	const services = selectList(useCollection("services"));
	const parts = selectList(useCollection("parts"));
	const reserved = selectReserved(useCollection("workOrders"), useCollection("invoices"));
	const tokens = queryTokens(deferred);
	const serviceMatches = services.filter((s) => !tokens.length || matchesTokens(fold(`${s.name} ${SERVICE_CATEGORIES[s.category]?.label ?? ""}`), tokens)).slice(0, 40);
	const partMatches = parts.filter((p) => !tokens.length || matchesTokens(fold(`${p.name} ${p.brand} ${p.code}`), tokens)).slice(0, 40);

	const add = (lines, label) => {
		if (!lines.length) return;
		onAdd(lines);
		setAdded((n) => n + 1);
		toast.success(`Adăugat: ${label}`, { duration: 1500 });
	};

	return (
		<Sheet
			open={open}
			onOpenChange={(value) => {
				if (!value) {
					setQuery("");
					setAdded(0);
				}
				onOpenChange(value);
			}}
			title="Adaugă din catalog"
			description="Operațiunile aduc și piesele din pachet. Poți adăuga mai multe."
			footer={
				<Button onClick={() => onOpenChange(false)} className="max-md:h-11">
					<Check /> Gata{added ? ` (${added})` : ""}
				</Button>
			}
		>
			<SearchInput value={query} onChange={setQuery} placeholder="Caută operațiune sau piesă…" className="sticky top-0 z-10 mb-3 bg-card pb-1" />
			<p className="mt-2 mb-1.5 text-2xs font-medium tracking-wider text-muted-foreground uppercase">Operațiuni</p>
			<ul className="divide-y rounded-xl border">
				{serviceMatches.map((service) => (
					<li key={service.id}>
						<button
							type="button"
							onClick={() => add(linesFromService(service.id, { staffId }), service.name)}
							className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/60"
						>
							<Wrench className="size-4 shrink-0 text-muted-foreground" aria-hidden />
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-medium">{service.name}</span>
								<span className="block text-xs text-muted-foreground">
									{fmtHours(service.hours)}
									{service.parts?.length ? ` · ${service.parts.length} piese în pachet` : ""}
								</span>
							</span>
							<Money value={service.price} className="text-sm" />
							<Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
						</button>
					</li>
				))}
				{!serviceMatches.length && <li className="px-3 py-4 text-sm text-muted-foreground">Nicio operațiune.</li>}
			</ul>
			<p className="mt-5 mb-1.5 text-2xs font-medium tracking-wider text-muted-foreground uppercase">Piese</p>
			<ul className="divide-y rounded-xl border">
				{partMatches.map((part) => {
					const level = stockLevel(part, reserved.get(part.id) ?? 0);
					return (
						<li key={part.id}>
							<button
								type="button"
								onClick={() => add([lineFromPart(part.id, 1)].filter(Boolean), part.name)}
								className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/60"
							>
								<Package className="size-4 shrink-0 text-muted-foreground" aria-hidden />
								<span className="min-w-0 flex-1">
									<span className="block truncate text-sm font-medium">
										{part.name} <span className="font-normal text-muted-foreground">{part.brand}</span>
									</span>
									<span className={cn("block text-xs text-muted-foreground")}>
										{part.code} · disponibil {level.available} {part.unit}
									</span>
								</span>
								{level.status !== "ok" && <ToneBadge tone={STOCK_STATUS[level.status].tone} size="sm">{STOCK_STATUS[level.status].label}</ToneBadge>}
								<Money value={part.price} className="text-sm" />
								<Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
							</button>
						</li>
					);
				})}
				{!partMatches.length && <li className="px-3 py-4 text-sm text-muted-foreground">Nicio piesă.</li>}
			</ul>
		</Sheet>
	);
}
