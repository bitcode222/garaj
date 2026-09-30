"use client";

import { useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { Boxes, Package, PackagePlus, Plus, Wrench } from "lucide-react";
import { EmptyState, Money, Stat } from "@/components/ds/data";
import { FilterChips, SearchInput, Segmented } from "@/components/ds/inputs";
import { DataList, ListHeader, ListRow } from "@/components/ds/list";
import { Page, PageHeader, Toolbar } from "@/components/ds/page";
import { ListPageSkeleton } from "@/components/ds/skeletons";
import { ToneBadge } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { stockLevel } from "@/domain/inventory";
import { fold, matchesTokens, queryTokens } from "@/domain/search";
import { fmtHours, plural } from "@/lib/format";
import { SERVICE_CATEGORIES, STOCK_STATUS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { useCollection, useIsReady } from "@/lib/store/hooks";
import { selectList, selectReserved } from "@/lib/store/selectors";

export function CatalogPage() {
	const ready = useIsReady();
	const params = useSearchParams();
	const [tab, setTab] = useState(params.get("tab") === "parts" ? "parts" : "services");
	const [query, setQuery] = useState("");
	const [stockFilter, setStockFilter] = useState("all");
	const deferred = useDeferredValue(query);
	const services = selectList(useCollection("services"));
	const parts = selectList(useCollection("parts"));
	const reserved = selectReserved(useCollection("workOrders"), useCollection("invoices"));

	const partRows = useMemo(
		() =>
			parts
				.map((part) => ({ part, level: stockLevel(part, reserved.get(part.id) ?? 0), hay: fold(`${part.name} ${part.brand} ${part.code} ${part.location}`) }))
				.sort((a, b) => a.part.name.localeCompare(b.part.name, "ro")),
		[parts, reserved],
	);

	if (!ready) return <ListPageSkeleton stats />;

	const tokens = queryTokens(deferred);
	const stockValue = parts.reduce((sum, p) => sum + Math.max(0, p.stock) * (p.cost ?? 0), 0);
	const low = partRows.filter((r) => r.level.status !== "ok").length;
	const stockCounts = { all: partRows.length, low: partRows.filter((r) => r.level.status === "low").length, out: partRows.filter((r) => r.level.status === "out").length };
	const visibleParts = partRows.filter((r) => (stockFilter === "all" || r.level.status === stockFilter) && (!tokens.length || matchesTokens(r.hay, tokens)));
	const groups = Object.entries(SERVICE_CATEGORIES)
		.map(([key, category]) => ({
			key,
			category,
			items: services.filter((s) => s.category === key && (!tokens.length || matchesTokens(fold(s.name), tokens))).sort((a, b) => a.name.localeCompare(b.name, "ro")),
		}))
		.filter((g) => g.items.length);

	return (
		<Page>
			<PageHeader
				title="Catalog"
				description="Operațiuni cu timp normat și piese pe stoc — se adaugă în devize cu un tap."
				actions={
					<Button onClick={() => openSheet(tab === "parts" ? "part" : "service")}>
						<Plus /> {tab === "parts" ? "Piesă nouă" : "Operațiune nouă"}
					</Button>
				}
			/>
			<div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
				<Stat label="Operațiuni" value={services.length} icon={Wrench} />
				<Stat label="Piese în catalog" value={parts.length} icon={Package} />
				<Stat label="Valoare stoc (cost)" value={<Money value={stockValue} decimals={0} />} icon={Boxes} />
				<Stat label="De comandat" value={low} hint="stoc redus sau epuizat" icon={PackagePlus} tone={low ? "yellow" : undefined} />
			</div>
			<Toolbar className="flex-col items-stretch md:flex-row md:items-center">
				<Segmented
					value={tab}
					onValueChange={setTab}
					options={[
						{ value: "services", label: "Operațiuni", icon: Wrench },
						{ value: "parts", label: "Piese și stoc", icon: Package },
					]}
					className="max-md:w-full max-md:[&>button]:flex-1"
				/>
				<SearchInput value={query} onChange={setQuery} placeholder={tab === "parts" ? "Denumire, marcă, cod, raft…" : "Caută operațiune…"} className="md:w-72" />
				{tab === "parts" && (
					<FilterChips
						value={stockFilter}
						onChange={setStockFilter}
						options={[
							{ value: "all", label: "Toate", count: stockCounts.all },
							{ value: "low", label: "Stoc redus", tone: "yellow", count: stockCounts.low },
							{ value: "out", label: "Epuizate", tone: "red", count: stockCounts.out },
						]}
					/>
				)}
			</Toolbar>

			{tab === "services" ? (
				groups.length ? (
					<div className="space-y-5">
						{groups.map(({ key, category, items }) => (
							<section key={key}>
								<h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
									<ToneBadge tone={category.tone} size="sm">
										{category.label}
									</ToneBadge>
									<span className="text-xs font-normal text-muted-foreground">{plural(items.length, "operațiune", "operațiuni")}</span>
								</h2>
								<ul className="divide-y overflow-hidden rounded-xl border bg-card">
									{items.map((s) => (
										<li key={s.id}>
											<ListRow onClick={() => openSheet("service", { id: s.id })}>
												<div className="min-w-0 flex-1">
													<p className="truncate text-sm font-medium">{s.name}</p>
													<p className="text-xs text-muted-foreground">
														{fmtHours(s.hours)}
														{s.parts?.length ? ` · ${plural(s.parts.length, "piesă", "piese")} în pachet` : ""}
													</p>
												</div>
												<Money value={s.price} className="text-sm font-semibold" />
											</ListRow>
										</li>
									))}
								</ul>
							</section>
						))}
					</div>
				) : (
					<EmptyState icon={Wrench} title="Nicio operațiune" description="Adaugă operațiunile pe care le faci des, cu timpul normat." action={<Button onClick={() => openSheet("service")}>Operațiune nouă</Button>} />
				)
			) : (
				<DataList
					items={visibleParts}
					getKey={(r) => r.part.id}
					empty={<EmptyState icon={Package} title="Nicio piesă" action={<Button onClick={() => openSheet("part")}>Piesă nouă</Button>} />}
					header={
						<ListHeader cols="md:grid-cols-[minmax(0,1.6fr)_70px_150px_110px_90px_96px]">
							<span>Piesă</span>
							<span>Raft</span>
							<span>Stoc</span>
							<span className="text-right">Preț</span>
							<span className="text-right">Marjă</span>
							<span />
						</ListHeader>
					}
					renderRow={({ part, level }) => {
						const margin = part.price ? Math.round(((part.price - part.cost) / part.price) * 100) : 0;
						return (
							<ListRow nested onClick={() => openSheet("part", { id: part.id })} className="md:grid md:grid-cols-[minmax(0,1.6fr)_70px_150px_110px_90px_96px] md:gap-3">
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">
										{part.name} <span className="font-normal text-muted-foreground">{part.brand}</span>
									</p>
									<p className="truncate font-mono text-xs text-muted-foreground">{part.code}</p>
								</div>
								<span className="hidden text-sm text-muted-foreground md:block">{part.location || "—"}</span>
								<span className="flex flex-col items-end gap-0.5 md:items-start">
									<ToneBadge tone={STOCK_STATUS[level.status].tone} size="sm">
										{level.available} {part.unit} disponibil
									</ToneBadge>
									{level.reserved > 0 && <span className="text-2xs text-muted-foreground">{level.reserved} rezervat în lucrări</span>}
								</span>
								<Money value={part.price} className="hidden text-right text-sm md:block" />
								<span className="hidden text-right text-sm text-muted-foreground tabular-nums md:block">{margin}%</span>
								<span className="hidden justify-end md:flex">
									<Button
										variant="ghost"
										size="sm"
										onClick={(e) => {
											e.stopPropagation();
											openSheet("part", { id: part.id, receive: true });
										}}
									>
										<PackagePlus /> Recepție
									</Button>
								</span>
							</ListRow>
						);
					}}
				/>
			)}
		</Page>
	);
}
