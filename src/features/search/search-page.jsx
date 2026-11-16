"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ReceiptText, Search, Users, Wrench } from "lucide-react";
import { MakeTile } from "@/components/ds/car";
import { PageTitle, SectionHeader } from "@/components/ds/blocks";
import { Page } from "@/components/ds/page";
import { Plate } from "@/components/ds/plate";
import { ListPageSkeleton } from "@/components/ds/skeletons";
import { GROUPS, useSearch } from "@/components/shell/command-results";
import { vehicleName } from "@/domain/vehicle";
import { AREA, TONE_COLOR } from "@/lib/colors";
import { plural } from "@/lib/format";
import { WORK_ORDER_STATUS } from "@/lib/labels";
import { useCollection, useIsReady } from "@/lib/store/hooks";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/ds/blocks";

// Caută as a page (docs/DESIGN.md §4, "File"): one big field and every match, grouped. ⌘K stays the quick window; its
// "Vezi toate rezultatele" comes here.
const ICONS = { customer: Users, workOrder: Wrench, invoice: ReceiptText };
const COLORS = { customer: AREA.clienti, workOrder: AREA.lucrare, invoice: AREA.factura };

export function SearchPage() {
	const ready = useIsReady();
	const params = useSearchParams();
	const router = useRouter();
	const [query, setQuery] = useState(params.get("q") ?? "");
	const [only, setOnly] = useState("all");
	const vehicles = useCollection("vehicles");
	const workOrders = useCollection("workOrders");
	const search = useSearch(query, 60);
	if (!ready) return <ListPageSkeleton />;

	const change = (text) => {
		setQuery(text);
		router.replace(text ? `/search/?q=${encodeURIComponent(text)}` : "/search/", { scroll: false });
	};
	const counts = Object.fromEntries(GROUPS.map((group) => [group.type, search.results[group.type]?.length ?? 0]));
	const total = Object.values(counts).reduce((n, count) => n + count, 0);
	const shown = GROUPS.filter((group) => counts[group.type] && (only === "all" || only === group.type));

	return (
		<Page width="wide" className="space-y-6">
			<PageTitle title="Caută" subtitle="După număr de înmatriculare, VIN, nume, telefon sau număr de document" />
			<label className="flex h-14 items-center gap-3 rounded-2xl border bg-card px-4 focus-within:ring-2 focus-within:ring-ring">
				<Search className="size-5 text-muted-foreground" aria-hidden />
				<input
					autoFocus
					value={query}
					onChange={(event) => change(event.target.value)}
					placeholder="ex. B 123 ABC, Popescu, 0722…"
					className="min-w-0 flex-1 bg-transparent text-[20px] outline-none placeholder:text-muted-foreground/70"
					aria-label="Caută"
				/>
				{search.tokens.length > 0 && <span className="shrink-0 text-sm text-muted-foreground">{plural(total, "rezultat", "rezultate")}</span>}
			</label>
			{search.tokens.length > 0 && (
				<div className="flex flex-wrap gap-1.5" role="group" aria-label="Arată">
					{[{ type: "all", heading: "Tot" }, ...GROUPS].map((group) => {
						const count = group.type === "all" ? total : counts[group.type];
						if (group.type !== "all" && !count) return null;
						return (
							<button key={group.type} type="button" aria-pressed={only === group.type} onClick={() => setOnly(group.type)} className={cn("inline-flex h-7 items-center gap-1 rounded-[7px] border px-2.5 text-xs font-medium", only === group.type ? "border-transparent bg-primary text-primary-foreground" : "bg-card")}>
								{group.heading}
								<span className="tabular-nums opacity-60">{count}</span>
							</button>
						);
					})}
				</div>
			)}
			{!search.tokens.length ? (
				<p className="rounded-xl border border-dashed bg-card px-6 py-10 text-center text-sm text-muted-foreground">Scrie ce cauți. Merge și cu o parte din număr sau din nume.</p>
			) : !total ? (
				<p className="rounded-xl border border-dashed bg-card px-6 py-10 text-center text-sm text-muted-foreground">Nimic găsit pentru „{search.deferred}”.</p>
			) : (
				shown.map((group) => (
					<section key={group.type} className="space-y-3" aria-label={group.heading}>
						<SectionHeader title={group.heading} subtitle={plural(counts[group.type], "rezultat", "rezultate")} />
						{group.type === "vehicle" ? (
							<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
								{search.results.vehicle.map((item) => {
									const vehicle = vehicles[item.id];
									return (
										<Link key={item.id} href={group.href(item.id)} className="flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3 hover:bg-accent/40">
											<MakeTile make={vehicle?.make} size={44} />
											<span className="min-w-0">
												<span className="block truncate text-[14px] font-semibold">{vehicleName(vehicle) || "Mașină"}</span>
												<span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
													<Plate value={item.plate} size="sm" />
													<span className="truncate">{item.subtitle.split(" · ").slice(1).join(" · ")}</span>
												</span>
											</span>
										</Link>
									);
								})}
							</div>
						) : (
							<ul className="divide-y overflow-hidden rounded-xl border bg-card">
								{search.results[group.type].map((item) => {
									const Icon = ICONS[item.type];
									const order = item.type === "workOrder" ? workOrders[item.id] : null;
									const make = order ? vehicles[order.vehicleId]?.make : null;
									return (
										<li key={item.id}>
											<Link href={group.href(item.id)} className="flex min-h-12 items-center gap-3 px-3.5 py-2 hover:bg-accent/40">
												{make ? (
													<MakeTile make={make} size={32} />
												) : (
													<span className="flex size-8 shrink-0 items-center justify-center rounded-[8px]" style={{ background: `color-mix(in srgb, ${COLORS[item.type]} 14%, transparent)`, color: COLORS[item.type] }}>
														<Icon className="size-4" aria-hidden />
													</span>
												)}
												<span className="min-w-0 flex-1">
													<span className="block truncate text-[13.5px] font-medium">{item.title}</span>
													{item.subtitle && <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>}
												</span>
												{item.status && WORK_ORDER_STATUS[item.status] && <StatusDot color={TONE_COLOR[WORK_ORDER_STATUS[item.status].tone]}>{WORK_ORDER_STATUS[item.status].label}</StatusDot>}
											</Link>
										</li>
									);
								})}
							</ul>
						)}
					</section>
				))
			)}
		</Page>
	);
}
