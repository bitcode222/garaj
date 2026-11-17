"use client";

import { PhoneCatalog } from "@/features/phone/registry-lists";
import { PHONE } from "@/components/ds/nav-bar";
import { useMediaQuery } from "@/lib/hooks";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { Package, PackagePlus, Plus, Wrench } from "lucide-react";
import { EmptyState, Money } from "@/components/ds/data";
import { FilterChips, SearchInput, Segmented } from "@/components/ds/inputs";
import { DataList, ListHeader, ListRow } from "@/components/ds/list";
import { Page, Toolbar } from "@/components/ds/page";
import { PageTitle, SectionHeader, StatCard, StatusDot, useViewSwitch } from "@/components/ds/blocks";
import { AREA, STATE, TONE_COLOR } from "@/lib/colors";
import { formatMoney } from "@/domain/money";
import { cn } from "@/lib/utils";
import { REST_LOOKS, REST_LOOK_KEY } from "@/features/common/rest-look";
import { ListPageSkeleton } from "@/components/ds/skeletons";
import { ToneBadge } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { stockLevel } from "@/domain/inventory";
import { fold, matchesTokens, queryTokens } from "@/domain/search";
import { fmtHours, plural } from "@/lib/format";
import { SERVICE_CATEGORIES, STOCK_STATUS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { useCollection, useIsReady, useSettings } from "@/lib/store/hooks";
import { selectList, selectReserved } from "@/lib/store/selectors";

export function CatalogPage() {
	const ready = useIsReady();
	const phone = useMediaQuery(PHONE); // a phone: the iPhone's list (docs/DESIGN.md "Telefon ca iPhone")
	const params = useSearchParams();
	const [tab, setTab] = useState(params.get("tab") === "parts" ? "parts" : "services");
	const [query, setQuery] = useState("");
	const [stockFilter, setStockFilter] = useState("all");
	const [look, lookSwitch] = useViewSwitch(REST_LOOK_KEY, REST_LOOKS);
	const { currency } = useSettings();
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
	if (phone) return <PhoneCatalog />;

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
			<PageTitle title="Catalog" subtitle="Operațiuni cu timp normat și piese pe stoc — se adaugă în devize cu un tap." className="mb-6">
				{lookSwitch}
				<Button onClick={() => openSheet(tab === "parts" ? "part" : "service")}>
					<Plus /> {tab === "parts" ? "Piesă nouă" : "Operațiune nouă"}
				</Button>
			</PageTitle>
			<div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
				<StatCard label="Operațiuni" value={services.length} note="cu timp normat" color={AREA.lucrare} />
				<StatCard label="Piese în catalog" value={parts.length} note="pe stoc" color={AREA.catalog} />
				<StatCard label="Valoare stoc (cost)" value={formatMoney(stockValue, currency, { decimals: 0 })} note="la prețul de achiziție" color={AREA.catalog} />
				<StatCard label="De comandat" value={low} note="stoc redus sau epuizat" color={low ? STATE.wait : STATE.ok} />
			</div>
			{look === "tabs" ? (
				<CatalogTabs
					tab={tab}
					setTab={setTab}
					query={query}
					setQuery={setQuery}
					stockFilter={stockFilter}
					setStockFilter={setStockFilter}
					stockCounts={stockCounts}
					services={services}
					groups={groups}
					parts={visibleParts}
					partsCount={parts.length}
					currency={currency}
				/>
			) : (
			<>
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
			</>
			)}
		</Page>
	);
}

/** "File": the catalog's parts as tabs on the left, the items as cards. */
function CatalogTabs({ tab, setTab, query, setQuery, stockFilter, setStockFilter, stockCounts, services, groups, parts, partsCount, currency }) {
	const nav = [
		{ key: "services", label: "Operațiuni", count: services.length, on: tab === "services", go: () => setTab("services") },
		{ key: "parts", label: "Piese și stoc", count: partsCount, on: tab === "parts" && stockFilter === "all", go: () => (setTab("parts"), setStockFilter("all")) },
		{ key: "low", label: "Stoc redus", count: stockCounts.low, on: tab === "parts" && stockFilter === "low", go: () => (setTab("parts"), setStockFilter("low")), sub: true },
		{ key: "out", label: "Epuizate", count: stockCounts.out, on: tab === "parts" && stockFilter === "out", go: () => (setTab("parts"), setStockFilter("out")), sub: true },
	];
	return (
		<div className="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
			<nav aria-label="Catalog" className="flex gap-1 overflow-x-auto md:flex-col">
				{nav.map((item) => (
					<button
						key={item.key}
						type="button"
						onClick={item.go}
						aria-current={item.on ? "page" : undefined}
						className={cn("flex h-8 shrink-0 items-center gap-2 rounded-[7px] px-2.5 text-left text-[13.5px] pointer-coarse:h-10", item.sub && "md:pl-6", item.on ? "bg-card font-medium shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}
					>
						<span className="flex-1">{item.label}</span>
						<span className="text-xs tabular-nums opacity-70">{item.count}</span>
					</button>
				))}
			</nav>
			<div className="min-w-0 space-y-4">
				<SearchInput value={query} onChange={setQuery} placeholder={tab === "parts" ? "Denumire, marcă, cod, raft…" : "Caută operațiune…"} className="md:w-80" />
				{tab === "services" ? (
					groups.map(({ key, category, items }) => (
						<section key={key} className="space-y-2.5">
							<SectionHeader title={category.label} subtitle={plural(items.length, "operațiune", "operațiuni")} />
							<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
								{items.map((s) => (
									<button key={s.id} type="button" onClick={() => openSheet("service", { id: s.id })} className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-3.5 text-left hover:bg-accent/40">
										<span className="text-[14px] leading-snug font-semibold">{s.name}</span>
										<span className="flex items-center justify-between text-[13px]">
											<span className="text-muted-foreground">
												{fmtHours(s.hours)}
												{s.parts?.length ? ` · ${plural(s.parts.length, "piesă", "piese")}` : ""}
											</span>
											<span className="font-semibold tabular-nums">{formatMoney(s.price, currency)}</span>
										</span>
									</button>
								))}
							</div>
						</section>
					))
				) : parts.length ? (
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{parts.map(({ part, level }) => (
							<button key={part.id} type="button" onClick={() => openSheet("part", { id: part.id })} className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-3.5 text-left hover:bg-accent/40">
								<span className="flex items-center gap-2.5">
									<span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-white" style={{ background: AREA.catalog }}>
										<Package className="size-4" aria-hidden />
									</span>
									<span className="min-w-0">
										<span className="block truncate text-[14px] font-semibold">{part.name}</span>
										<span className="block truncate font-mono text-xs text-muted-foreground">{[part.brand, part.code].filter(Boolean).join(" · ")}</span>
									</span>
								</span>
								<span className="flex items-center justify-between gap-2 text-[13px]">
									<StatusDot color={TONE_COLOR[STOCK_STATUS[level.status].tone]}>
										{level.available} {part.unit} · {STOCK_STATUS[level.status].label}
									</StatusDot>
									<span className="font-semibold tabular-nums">{formatMoney(part.price, currency)}</span>
								</span>
							</button>
						))}
					</div>
				) : (
					<EmptyState icon={Package} title="Nicio piesă" action={<Button onClick={() => openSheet("part")}>Piesă nouă</Button>} />
				)}
			</div>
		</div>
	);
}
