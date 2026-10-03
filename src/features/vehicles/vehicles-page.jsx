"use client";

import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { CarFront, Plus, Wrench } from "lucide-react";
import { EmptyState } from "@/components/ds/data";
import { MakeLogo } from "@/components/ds/make-logo";
import { FilterChips, SearchInput } from "@/components/ds/inputs";
import { DataList, ListHeader, ListRow } from "@/components/ds/list";
import { Page, PageHeader, Toolbar } from "@/components/ds/page";
import { PlateTag, VehicleLabel } from "@/components/ds/make-logo";
import { ListPageSkeleton } from "@/components/ds/skeletons";
import { ToneBadge } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { fold, matchesTokens, queryTokens } from "@/domain/search";
import { deadline, lastReading, normalizePlate, serviceDue, vehicleName } from "@/domain/vehicle";
import { OPEN_STATUSES } from "@/domain/work-order";
import { fmtKm, plural } from "@/lib/format";
import { DEADLINE_STATUS, FUELS } from "@/lib/labels";
import { useOpenDetail } from "@/lib/detail-mode";
import { openSheet } from "@/lib/sheets";
import { useCollection, useIsReady, useToday } from "@/lib/store/hooks";
import { SwipeRow } from "@/components/ds/swipe-row";
import { contactSwipeActions } from "@/features/common/swipe-actions";

const FILTERS = [
	{ value: "all", label: "Toate" },
	{ value: "shop", label: "În service", tone: "orange" },
	{ value: "itp", label: "ITP ≤ 30 zile", tone: "yellow" },
	{ value: "rca", label: "RCA ≤ 30 zile", tone: "purple" },
	{ value: "service", label: "Revizie scadentă", tone: "blue" },
];

function DeadlineChip({ label, info }) {
	if (info.status === "unknown") return <ToneBadge size="sm">{label} —</ToneBadge>;
	const text = info.days < 0 ? `${label} expirat` : info.days <= 30 ? `${label} ${info.days} z` : `${label} ok`;
	return (
		<ToneBadge tone={DEADLINE_STATUS[info.status].tone} size="sm">
			{text}
		</ToneBadge>
	);
}

export function VehiclesPage() {
	const ready = useIsReady();
	const router = useRouter();
	const openDetail = useOpenDetail();
	const today = useToday();
	const vehicles = useCollection("vehicles");
	const customers = useCollection("customers");
	const workOrders = useCollection("workOrders");
	const [filter, setFilter] = useState("all");
	const [query, setQuery] = useState("");
	const deferred = useDeferredValue(query);

	useEffect(() => {
		router.prefetch("/vehicles/detail/");
	}, [router]);

	const rows = useMemo(() => {
		if (!today) return [];
		const inShop = new Set(Object.values(workOrders).filter((o) => OPEN_STATUSES.includes(o.status)).map((o) => o.vehicleId));
		return Object.values(vehicles)
			.map((vehicle) => {
				const owner = customers[vehicle.customerId];
				return {
					vehicle,
					owner,
					inShop: inShop.has(vehicle.id),
					itp: deadline(vehicle.itpExpiry, today),
					rca: deadline(vehicle.rcaExpiry, today),
					service: serviceDue(vehicle, today),
					km: lastReading(vehicle)?.km ?? null,
					hay: fold(`${vehicle.plate} ${normalizePlate(vehicle.plate)} ${vehicle.vin} ${vehicleName(vehicle)} ${owner?.name ?? ""}`),
				};
			})
			.sort((a, b) => normalizePlate(a.vehicle.plate).localeCompare(normalizePlate(b.vehicle.plate)));
	}, [vehicles, customers, workOrders, today]);

	const matchers = {
		all: () => true,
		shop: (r) => r.inShop,
		itp: (r) => r.itp.status === "soon" || r.itp.status === "expired",
		rca: (r) => r.rca.status === "soon" || r.rca.status === "expired",
		service: (r) => r.service.status === "soon" || r.service.status === "expired",
	};
	const counts = Object.fromEntries(FILTERS.map((f) => [f.value, rows.filter(matchers[f.value]).length]));
	const tokens = queryTokens(deferred);
	const visible = rows.filter((r) => matchers[filter](r) && (!tokens.length || matchesTokens(r.hay, tokens)));

	if (!ready || !today) return <ListPageSkeleton />;

	return (
		<Page>
			<PageHeader
				title="Mașini"
				description={plural(rows.length, "mașină", "mașini")}
				actions={
					<Button onClick={() => openSheet("vehicle")} className="max-md:hidden">
						<Plus /> Mașină nouă
					</Button>
				}
			/>
			<Toolbar className="flex-col items-stretch md:flex-row md:items-center">
				<SearchInput value={query} onChange={setQuery} placeholder="Nr. înmatriculare, VIN, marcă, proprietar…" className="md:w-80" autoCapitalize="characters" />
				<FilterChips value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))} />
			</Toolbar>
			<DataList
				items={visible}
				getKey={(r) => r.vehicle.id}
				empty={<EmptyState icon={CarFront} title="Nicio mașină pentru filtrul ales" action={<Button onClick={() => openSheet("vehicle")}>Adaugă mașină</Button>} />}
				header={
					<ListHeader cols="md:grid-cols-[minmax(0,1.2fr)_120px_minmax(0,1fr)_110px_minmax(0,1fr)]">
						<span>Mașină</span>
						<span>Nr.</span>
						<span>Proprietar</span>
						<span className="text-right">Kilometraj</span>
						<span>Termene</span>
					</ListHeader>
				}
				renderRow={(r, index) => (
					<SwipeRow
						leading={contactSwipeActions(r.owner?.phone)}
						trailing={[{ key: "checkin", label: "Primire", icon: Wrench, tone: "orange", onSelect: () => openSheet("checkin", { vehicleId: r.vehicle.id }) }]}
						peek={index === 0}
					>
					<ListRow onClick={() => openDetail("vehicle", r.vehicle.id)} className="md:grid md:grid-cols-[minmax(0,1.2fr)_120px_minmax(0,1fr)_110px_minmax(0,1fr)] md:gap-3">
						<div className="flex min-w-0 flex-1 items-center gap-3">
							<MakeLogo make={r.vehicle.make} className="size-7 max-md:hidden" />
							<div className="min-w-0 flex-1">
								<p className="flex items-center gap-2 text-[15px] font-medium md:text-sm">
									<MakeLogo make={r.vehicle.make} className="md:hidden" />
									<span className="truncate">{vehicleName(r.vehicle) || "Mașină"}</span>
									{r.inShop && <ToneBadge tone="orange" size="sm">în service</ToneBadge>}
								</p>
								<p className="truncate text-xs text-muted-foreground">
									{[r.vehicle.year, r.vehicle.engine, FUELS[r.vehicle.fuel]].filter(Boolean).join(" · ")}
									<span className="md:hidden"> · {r.owner?.name}</span>
								</p>
							</div>
							<PlateTag value={r.vehicle.plate} className="md:hidden" />
						</div>
						<span className="hidden md:block">
							<PlateTag value={r.vehicle.plate} />
						</span>
						<span className="hidden truncate text-sm md:block">{r.owner?.name}</span>
						<span className="hidden text-right text-sm text-muted-foreground tabular-nums md:block">{fmtKm(r.km)}</span>
						<span className="hidden flex-wrap gap-1 md:flex">
							<DeadlineChip label="ITP" info={r.itp} />
							<DeadlineChip label="RCA" info={r.rca} />
						</span>
					</ListRow>
					</SwipeRow>
				)}
			/>
		</Page>
	);
}
