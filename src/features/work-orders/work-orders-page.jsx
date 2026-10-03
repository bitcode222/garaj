"use client";

import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Wrench } from "lucide-react";
import { EmptyState, Money } from "@/components/ds/data";
import { FilterChips, SearchInput } from "@/components/ds/inputs";
import { DataList, ListHeader, ListRow } from "@/components/ds/list";
import { Page, PageHeader, Toolbar } from "@/components/ds/page";
import { PlateTag, VehicleLabel } from "@/components/ds/make-logo";
import { ListPageSkeleton } from "@/components/ds/skeletons";
import { StatusMenu } from "@/components/ds/status-menu";
import { Button } from "@/components/ui/button";
import { dayOfInstant, diffDaysISO } from "@/domain/dates";
import { computeTotals } from "@/domain/lines";
import { fold, matchesTokens, queryTokens } from "@/domain/search";
import { vehicleName } from "@/domain/vehicle";
import { OPEN_STATUSES, WO_TRANSITIONS } from "@/domain/work-order";
import { fmtDate, fmtDays, fmtWorkOrder, plural } from "@/lib/format";
import { WORK_ORDER_ACTIONS, WORK_ORDER_STATUS } from "@/lib/labels";
import { useOpenDetail } from "@/lib/detail-mode";
import { openSheet } from "@/lib/sheets";
import { useCollection, useIsReady, useSettings, useToday } from "@/lib/store/hooks";
import { selectWorkOrdersSorted } from "@/lib/store/selectors";
import { cn } from "@/lib/utils";
import { moveWorkOrder } from "./status";

const LIST_FILTERS = [
	{ value: "open", label: "Deschise", statuses: OPEN_STATUSES },
	{ value: "all", label: "Toate" },
	{ value: "delivered", label: "Predate", statuses: ["delivered"], tone: "neutral" },
	{ value: "cancelled", label: "Anulate", statuses: ["cancelled"], tone: "red" },
];

export function WorkOrdersPage() {
	const ready = useIsReady();
	const router = useRouter();
	const openDetail = useOpenDetail();
	const today = useToday();
	const settings = useSettings();
	const workOrders = useCollection("workOrders");
	const customers = useCollection("customers");
	const vehicles = useCollection("vehicles");
	const staff = useCollection("staff");
	const [filter, setFilter] = useState("open");
	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query);

	useEffect(() => {
		router.prefetch("/work-orders/detail/");
	}, [router]);

	const rows = useMemo(
		() =>
			selectWorkOrdersSorted(workOrders).map((order) => {
				const vehicle = vehicles[order.vehicleId];
				const customer = customers[order.customerId];
				const totals = computeTotals(order.lines, { vatPayer: settings.invoicing.vatPayer });
				return {
					order,
					vehicle,
					customer,
					totals,
					mechanic: order.staffId ? staff[order.staffId] : null,
					hay: fold(`${order.number} ${vehicle?.plate ?? ""} ${(vehicle?.plate ?? "").replace(/\s/g, "")} ${vehicleName(vehicle)} ${customer?.name ?? ""} ${order.complaint ?? ""}`),
				};
			}),
		[workOrders, vehicles, customers, staff, settings.invoicing.vatPayer],
	);

	const visible = useMemo(() => {
		const tokens = queryTokens(deferredQuery);
		const statuses = LIST_FILTERS.find((f) => f.value === filter)?.statuses;
		return rows.filter((r) => (!statuses || statuses.includes(r.order.status)) && (!tokens.length || matchesTokens(r.hay, tokens)));
	}, [rows, filter, deferredQuery]);

	if (!ready || !today) return <ListPageSkeleton />;

	const open = rows.filter((r) => OPEN_STATUSES.includes(r.order.status));
	const readyCount = open.filter((r) => r.order.status === "ready").length;
	const counts = Object.fromEntries(LIST_FILTERS.map((f) => [f.value, f.statuses ? rows.filter((r) => f.statuses.includes(r.order.status)).length : rows.length]));

	return (
		<Page width="wide">
			<PageHeader
				title="Lucrări"
				description={`${plural(open.length, "lucrare deschisă", "lucrări deschise")} · ${plural(readyCount, "mașină gata", "mașini gata")} de predare`}
				actions={
					<Button onClick={() => openSheet("checkin")} className="max-md:hidden">
						<Wrench /> Primire mașină
					</Button>
				}
			/>
			<Toolbar className="flex-col items-stretch md:flex-row md:items-center">
				<SearchInput value={query} onChange={setQuery} placeholder="Nr. înmatriculare, client, #lucrare…" className="md:w-80" />
				<FilterChips value={filter} onChange={setFilter} options={LIST_FILTERS.map((f) => ({ ...f, count: counts[f.value] }))} />
			</Toolbar>

			<DataList
				items={visible}
				getKey={(r) => r.order.id}
				empty={<EmptyState icon={Wrench} title="Nicio lucrare pentru filtrul ales" description="Schimbă căutarea sau filtrul." />}
				header={
					<ListHeader cols="md:grid-cols-[88px_minmax(0,1.2fr)_minmax(0,1fr)_170px_120px_120px]">
						<span>Nr.</span>
						<span>Mașină</span>
						<span>Client</span>
						<span>Stare</span>
						<span>Deschisă</span>
						<span className="text-right">Total</span>
					</ListHeader>
				}
				renderRow={(row) => <OrderRow row={row} today={today} onOpen={() => openDetail("work-order", row.order.id)} />}
			/>
		</Page>
	);
}

function OrderRow({ row, today, onOpen }) {
	const { order, vehicle, customer, totals } = row;
	const age = diffDaysISO(dayOfInstant(order.dates?.[order.status] ?? order.createdAt), today);
	const stale = (order.status === "ready" && age >= 2) || (order.status === "waiting_parts" && age >= 3);
	const status = (
		<StatusMenu
			map={WORK_ORDER_STATUS}
			value={order.status}
			moves={WO_TRANSITIONS[order.status]}
			onMove={(to) => moveWorkOrder(order, to)}
			subject={fmtWorkOrder(order.number)}
			actions={WORK_ORDER_ACTIONS}
			destructive={["cancelled"]}
			size="sm"
		/>
	);
	return (
		<ListRow onClick={onOpen} nested className="md:grid md:grid-cols-[88px_minmax(0,1.2fr)_minmax(0,1fr)_170px_120px_120px] md:gap-3">
			<div className="min-w-0 flex-1 md:hidden">
				<div className="flex items-center justify-between gap-3">
					<VehicleLabel vehicle={vehicle} nameClassName="text-[15px] font-medium" />
					<Money value={totals.gross} className="text-sm font-semibold" />
				</div>
				<div className="mt-1 flex items-center justify-between gap-3">
					<span className={cn("flex min-w-0 items-center gap-1.5 truncate text-xs", stale ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
						{vehicle && <PlateTag value={vehicle.plate} />}
						{fmtWorkOrder(order.number)} · {customer?.name} · {stale ? (age === 0 ? "azi" : fmtDays(-age)) : fmtDate(order.createdAt, "d MMM")}
					</span>
					{status}
				</div>
			</div>
			<span className="hidden font-mono text-[13px] font-medium md:block">{fmtWorkOrder(order.number)}</span>
			<span className="hidden min-w-0 items-center gap-2 md:flex">
				<VehicleLabel vehicle={vehicle} nameClassName="text-sm" />
				{vehicle && <PlateTag value={vehicle.plate} />}
			</span>
			<span className="hidden truncate text-sm md:block">{customer?.name}</span>
			<span className="hidden md:block">{status}</span>
			<span className={cn("hidden text-sm md:block", stale ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
				{stale ? (age === 0 ? "azi" : fmtDays(-age)) : fmtDate(order.createdAt)}
			</span>
			<Money value={totals.gross} className="hidden text-right text-sm font-semibold md:block" />
		</ListRow>
	);
}
