"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { CarFront, Columns3, EllipsisVertical, List, Wrench } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, Initials, Money } from "@/components/ds/data";
import { FilterChips, SearchInput, Segmented } from "@/components/ds/inputs";
import { DataList, ListHeader, ListRow } from "@/components/ds/list";
import { Page, PageHeader, Toolbar } from "@/components/ds/page";
import { Plate } from "@/components/ds/plate";
import { ListPageSkeleton } from "@/components/ds/skeletons";
import { StatusBadge, ToneDot } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dayOfInstant, diffDaysISO } from "@/domain/dates";
import { computeTotals } from "@/domain/lines";
import { fold, matchesTokens, queryTokens } from "@/domain/search";
import { vehicleName } from "@/domain/vehicle";
import { OPEN_STATUSES, WO_TRANSITIONS, canTransition } from "@/domain/work-order";
import { fmtDate, fmtDays, fmtWorkOrder, plural } from "@/lib/format";
import { WORK_ORDER_ACTIONS, WORK_ORDER_STATUS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { tone } from "@/lib/tones";
import { setWorkOrderStatus } from "@/lib/store/actions";
import { useLocalPreference } from "@/lib/hooks";
import { useCollection, useIsReady, useSettings, useToday } from "@/lib/store/hooks";
import { selectWorkOrdersSorted } from "@/lib/store/selectors";
import { cn } from "@/lib/utils";

const VIEW_KEY = "garaj.workOrders.view";

const LIST_FILTERS = [
	{ value: "open", label: "Deschise", statuses: OPEN_STATUSES },
	{ value: "all", label: "Toate" },
	{ value: "delivered", label: "Predate", statuses: ["delivered"], tone: "neutral" },
	{ value: "cancelled", label: "Anulate", statuses: ["cancelled"], tone: "red" },
];

function moveTo(order, to) {
	try {
		setWorkOrderStatus(order.id, to);
		toast.success(`#${order.number} → ${WORK_ORDER_STATUS[to].label}`);
	} catch (error) {
		toast.error(error.message);
	}
}

export function WorkOrdersPage() {
	const ready = useIsReady();
	const router = useRouter();
	const today = useToday();
	const settings = useSettings();
	const workOrders = useCollection("workOrders");
	const customers = useCollection("customers");
	const vehicles = useCollection("vehicles");
	const staff = useCollection("staff");
	const [view, changeView] = useLocalPreference(VIEW_KEY, "board", ["board", "list"]);
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
		const statuses = view === "board" ? OPEN_STATUSES : LIST_FILTERS.find((f) => f.value === filter)?.statuses;
		return rows.filter((r) => (!statuses || statuses.includes(r.order.status)) && (!tokens.length || matchesTokens(r.hay, tokens)));
	}, [rows, view, filter, deferredQuery]);

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
				{view === "list" && <FilterChips value={filter} onChange={setFilter} options={LIST_FILTERS.map((f) => ({ ...f, count: counts[f.value] }))} />}
				<Segmented
					value={view}
					onValueChange={changeView}
					options={[
						{ value: "board", label: "Tablou", icon: Columns3 },
						{ value: "list", label: "Listă", icon: List },
					]}
					className="md:ml-auto"
				/>
			</Toolbar>

			{view === "board" ? (
				<Board rows={visible} today={today} />
			) : (
				<DataList
					items={visible}
					getKey={(r) => r.order.id}
					empty={<EmptyState icon={Wrench} title="Nicio lucrare pentru filtrul ales" description="Schimbă căutarea sau filtrul." />}
					header={
						<ListHeader cols="md:grid-cols-[88px_minmax(0,1.2fr)_minmax(0,1fr)_150px_120px_120px]">
							<span>Nr.</span>
							<span>Mașină</span>
							<span>Client</span>
							<span>Stare</span>
							<span>Deschisă</span>
							<span className="text-right">Total</span>
						</ListHeader>
					}
					renderRow={(row) => <OrderRow row={row} />}
				/>
			)}
		</Page>
	);
}

function OrderRow({ row }) {
	const { order, vehicle, customer, totals } = row;
	return (
		<ListRow href={`/work-orders/detail/?id=${order.id}`} className="md:grid md:grid-cols-[88px_minmax(0,1.2fr)_minmax(0,1fr)_150px_120px_120px] md:gap-3">
			<div className="min-w-0 flex-1 md:hidden">
				<div className="flex items-center justify-between gap-3">
					<div className="flex min-w-0 items-center gap-2">
						{vehicle && <Plate value={vehicle.plate} size="sm" />}
						<span className="truncate text-[15px] font-medium">{vehicleName(vehicle)}</span>
					</div>
					<Money value={totals.gross} className="text-sm font-semibold" />
				</div>
				<div className="mt-1 flex items-center justify-between gap-3">
					<span className="truncate text-xs text-muted-foreground">
						{fmtWorkOrder(order.number)} · {customer?.name} · {fmtDate(order.createdAt, "d MMM")}
					</span>
					<StatusBadge map={WORK_ORDER_STATUS} value={order.status} size="sm" />
				</div>
			</div>
			<span className="hidden font-mono text-[13px] font-medium md:block">{fmtWorkOrder(order.number)}</span>
			<span className="hidden min-w-0 items-center gap-2 md:flex">
				{vehicle && <Plate value={vehicle.plate} size="sm" />}
				<span className="truncate text-sm">{vehicleName(vehicle)}</span>
			</span>
			<span className="hidden truncate text-sm md:block">{customer?.name}</span>
			<span className="hidden md:block">
				<StatusBadge map={WORK_ORDER_STATUS} value={order.status} />
			</span>
			<span className="hidden text-sm text-muted-foreground md:block">{fmtDate(order.createdAt)}</span>
			<Money value={totals.gross} className="hidden text-right text-sm font-semibold md:block" />
		</ListRow>
	);
}

/** Kanban by status. Desktop: drag between columns. Phone: snap-scrolling columns + "Mută în…" menu. */
function Board({ rows, today }) {
	const [dragging, setDragging] = useState(null);
	const [over, setOver] = useState(null);
	const byStatus = Object.fromEntries(OPEN_STATUSES.map((s) => [s, []]));
	for (const row of rows) byStatus[row.order.status]?.push(row);

	return (
		<div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:snap-none md:grid-cols-5 md:overflow-visible md:px-0 no-scrollbar">
			{OPEN_STATUSES.map((status) => {
				const meta = WORK_ORDER_STATUS[status];
				const list = byStatus[status];
				const sum = list.reduce((s, r) => s + r.totals.gross, 0);
				const droppable = dragging && canTransition(dragging.status, status);
				return (
					<section
						key={status}
						aria-label={meta.label}
						onDragOver={(e) => {
							if (!droppable) return;
							e.preventDefault();
							setOver(status);
						}}
						onDragLeave={() => setOver((s) => (s === status ? null : s))}
						onDrop={(e) => {
							e.preventDefault();
							if (droppable) moveTo(dragging, status);
							setDragging(null);
							setOver(null);
						}}
						className={cn(
							"flex w-[82vw] max-w-[340px] shrink-0 snap-start flex-col rounded-xl border bg-muted/40 transition-colors md:w-auto md:max-w-none",
							droppable && "border-dashed",
							over === status && tone(meta.tone).soft,
						)}
					>
						<header className="flex items-center gap-2 px-3 pt-3 pb-2">
							<ToneDot tone={meta.tone} />
							<h2 className="text-sm font-semibold">{meta.label}</h2>
							<span className="rounded-full bg-background px-1.5 text-2xs leading-5 font-semibold tabular-nums">{list.length}</span>
							<Money value={sum} decimals={0} className="ml-auto text-xs text-muted-foreground" />
						</header>
						<ul className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
							{list.map((row) => (
								<li
									key={row.order.id}
									draggable
									onDragStart={(e) => {
										e.dataTransfer.effectAllowed = "move";
										setDragging(row.order);
									}}
									onDragEnd={() => {
										setDragging(null);
										setOver(null);
									}}
									className={cn(dragging?.id === row.order.id && "opacity-50")}
								>
									<BoardCard row={row} today={today} />
								</li>
							))}
							{!list.length && <li className="flex flex-1 items-center justify-center py-6 text-xs text-muted-foreground">Nimic aici</li>}
						</ul>
					</section>
				);
			})}
		</div>
	);
}

function BoardCard({ row, today }) {
	const { order, vehicle, customer, totals, mechanic } = row;
	const age = diffDaysISO(dayOfInstant(order.dates?.[order.status] ?? order.createdAt), today);
	const stale = (order.status === "ready" && age >= 2) || (order.status === "waiting_parts" && age >= 3);
	return (
		<div className="group relative rounded-lg border bg-card p-3 shadow-xs transition-shadow hover:shadow-sm">
			<Link href={`/work-orders/detail/?id=${order.id}`} prefetch={false} className="absolute inset-0 rounded-lg" aria-label={`Lucrarea ${order.number}`} />
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					{vehicle ? <Plate value={vehicle.plate} size="sm" /> : <CarFront className="size-4 text-muted-foreground" />}
					<p className="mt-1.5 truncate text-sm font-medium">{vehicleName(vehicle) || "Mașină"}</p>
					<p className="truncate text-xs text-muted-foreground">{customer?.name}</p>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon-sm" className="relative z-10 -mt-1 -mr-1 shrink-0" aria-label="Mută în…">
							<EllipsisVertical />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel className="text-xs text-muted-foreground">Mută în…</DropdownMenuLabel>
						{WO_TRANSITIONS[order.status].map((to) => (
							<DropdownMenuItem key={to} variant={to === "cancelled" ? "destructive" : "default"} onSelect={() => moveTo(order, to)}>
								<ToneDot tone={WORK_ORDER_STATUS[to].tone} /> {WORK_ORDER_ACTIONS[to] ?? WORK_ORDER_STATUS[to].label}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			{order.complaint && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{order.complaint}</p>}
			<div className="mt-3 flex items-center gap-2">
				{mechanic && <Initials name={mechanic.name} tone={mechanic.color} size="sm" />}
				<span className={cn("text-xs", stale ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
					{fmtWorkOrder(order.number)} · {age === 0 ? "azi" : fmtDays(-age)}
				</span>
				<Money value={totals.gross} decimals={0} className="ml-auto text-sm font-semibold" />
			</div>
		</div>
	);
}
