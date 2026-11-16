"use client";

import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Columns3, Rows3, Wrench } from "lucide-react";
import { MakeTile } from "@/components/ds/car";
import { PageTitle, SectionHeader, useViewSwitch } from "@/components/ds/blocks";
import { FilterChips, SearchInput } from "@/components/ds/inputs";
import { Page } from "@/components/ds/page";
import { Plate } from "@/components/ds/plate";
import { ListPageSkeleton } from "@/components/ds/skeletons";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/components/shell/account-menu";
import { computeTotals } from "@/domain/lines";
import { fold, matchesTokens, queryTokens } from "@/domain/search";
import { vehicleName } from "@/domain/vehicle";
import { isRunning } from "@/domain/work-clock";
import { OPEN_STATUSES, canTransition } from "@/domain/work-order";
import { fmtDate, formatMoney, plural } from "@/lib/format";
import { WORK_ORDER_STATUS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { useCollection, useIsReady, useSettings, useToday } from "@/lib/store/hooks";
import { selectWorkOrdersSorted } from "@/lib/store/selectors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { JobCard, JobStatus } from "./job-card";
import { moveWorkOrder } from "./status";

// Atelier (docs/DESIGN.md §4): two looks, switched at the top right and kept on this device.
// A, "Etape": cards grouped by stage; a job opens as its full page.
// B, "Tablă": a column per stage, drag a card to move it; a job opens in the panel on the right.
const LOOKS = [
	{ value: "stages", label: "Etape", icon: Rows3 },
	{ value: "board", label: "Tablă", icon: Columns3 },
];

const FILTERS = [
	{ value: "open", label: "Deschise", statuses: OPEN_STATUSES },
	{ value: "all", label: "Toate" },
	{ value: "delivered", label: "Predate", statuses: ["delivered"] },
	{ value: "cancelled", label: "Anulate", statuses: ["cancelled", "declined"] },
];

const STAGES = [
	{ key: "work", title: "În lucru", subtitle: "Pe elevatoare acum", statuses: ["in_progress"] },
	{ key: "wait", title: "Așteaptă", subtitle: "Piese, un mecanic liber", statuses: ["approved", "waiting_parts"] },
	{ key: "estimate", title: "Devize", subtitle: "Așteaptă răspunsul clientului", statuses: ["estimate"] },
	{ key: "ready", title: "De predat", subtitle: "Gata, clientul poate veni", statuses: ["ready"] },
];

const COLUMNS = ["estimate", "approved", "in_progress", "waiting_parts", "ready"];

export function WorkOrdersPage() {
	const ready = useIsReady();
	const router = useRouter();
	const today = useToday();
	const settings = useSettings();
	const workOrders = useCollection("workOrders");
	const customers = useCollection("customers");
	const vehicles = useCollection("vehicles");
	const { member } = useAccount();
	const [look, lookSwitch] = useViewSwitch("garaj.atelier.look", LOOKS);
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
				return {
					order,
					vehicle,
					customer,
					hay: fold(`${order.number} ${vehicle?.plate ?? ""} ${(vehicle?.plate ?? "").replace(/\s/g, "")} ${vehicleName(vehicle)} ${customer?.name ?? ""} ${order.complaint ?? ""}`),
				};
			}),
		[workOrders, vehicles, customers],
	);
	const tokens = queryTokens(deferredQuery);
	const found = tokens.length ? rows.filter((r) => matchesTokens(r.hay, tokens)) : rows;

	if (!ready || !today) return <ListPageSkeleton />;

	const open = rows.filter((r) => OPEN_STATUSES.includes(r.order.status));
	const running = open.filter((r) => isRunning(r.order)).length;
	const staffId = member?.id ?? null;
	// A: the full page. B: the panel on the right (on a phone, the page all the same).
	const openJob = (order) => {
		if (look === "board" && window.matchMedia("(min-width: 768px)").matches) openSheet("work-order-view", { id: order.id });
		else router.push(`/work-orders/detail/?id=${order.id}`);
	};
	const card = (r, small = false) => (
		<JobCard key={r.order.id} order={r.order} vehicle={r.vehicle} customer={r.customer} staffId={staffId} small={small} onOpen={() => openJob(r.order)} />
	);
	const counts = Object.fromEntries(FILTERS.map((f) => [f.value, f.statuses ? found.filter((r) => f.statuses.includes(r.order.status)).length : found.length]));
	const statuses = FILTERS.find((f) => f.value === filter)?.statuses;
	const shown = found.filter((r) => !statuses || statuses.includes(r.order.status));
	const foundOpen = found.filter((r) => OPEN_STATUSES.includes(r.order.status));

	return (
		<Page width="wide" className="space-y-6">
			<PageTitle title="Atelier" subtitle={`${plural(open.length, "lucrare deschisă", "lucrări deschise")} · ${open.filter((r) => r.order.status === "in_progress").length} în lucru${running ? `, ${running} cu cronometrul pornit` : ""}`}>
				{lookSwitch}
				<Button onClick={() => openSheet("checkin")}>
					<Wrench /> Primire mașină
				</Button>
			</PageTitle>
			<div className="flex flex-col gap-3 md:flex-row md:items-center">
				<SearchInput value={query} onChange={setQuery} placeholder="Nr. înmatriculare, client, #lucrare…" className="md:w-80" />
				{look === "stages" && <FilterChips value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))} />}
			</div>

			{look === "board" ? (
				<Board rows={foundOpen} card={card} />
			) : filter === "open" ? (
				foundOpen.length ? (
					STAGES.map((stage) => {
						const list = foundOpen.filter((r) => stage.statuses.includes(r.order.status));
						if (!list.length) return null;
						return (
							<section key={stage.key} className="space-y-3" aria-label={stage.title}>
								<SectionHeader title={stage.title} subtitle={`${plural(list.length, "mașină", "mașini")} · ${stage.subtitle}`} />
								<div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">{list.map((r) => card(r))}</div>
							</section>
						);
					})
				) : (
					<Empty query={query} />
				)
			) : shown.length ? (
				<ClosedList rows={shown} settings={settings} onOpen={openJob} />
			) : (
				<Empty query={query} />
			)}
		</Page>
	);
}

function Empty({ query }) {
	return (
		<div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card px-6 py-12 text-center">
			<Wrench className="size-6 text-muted-foreground" aria-hidden />
			<p className="text-[15px] font-semibold">{query ? "Nicio lucrare găsită" : "Nicio lucrare aici"}</p>
			<p className="text-sm text-muted-foreground">{query ? "Caută după număr, client sau numărul lucrării." : "Când primești o mașină, lucrarea ei apare aici."}</p>
			{!query && (
				<Button className="mt-1" onClick={() => openSheet("checkin")}>
					Primește o mașină
				</Button>
			)}
		</div>
	);
}

/** B: a column per stage; drag a card into another column to move the job (only where the rules allow). */
function Board({ rows, card }) {
	const [over, setOver] = useState(null);
	const drop = (to, id) => {
		setOver(null);
		const row = rows.find((r) => r.order.id === id);
		if (!row || row.order.status === to) return;
		if (!canTransition(row.order.status, to)) {
			toast.error(`Lucrarea #${row.order.number} nu poate trece din „${WORK_ORDER_STATUS[row.order.status].label}” în „${WORK_ORDER_STATUS[to].label}”.`);
			return;
		}
		moveWorkOrder(row.order, to);
	};
	return (
		<div className="no-scrollbar -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
			<div className="grid min-w-[1000px] grid-cols-5 items-start gap-3">
				{COLUMNS.map((status) => {
					const list = rows.filter((r) => r.order.status === status);
					const look = WORK_ORDER_STATUS[status];
					return (
						<section
							key={status}
							aria-label={look.label}
							onDragOver={(event) => {
								event.preventDefault();
								setOver(status);
							}}
							onDragLeave={() => setOver((current) => (current === status ? null : current))}
							onDrop={(event) => drop(status, event.dataTransfer.getData("text/plain"))}
							className={cn("flex min-h-40 flex-col gap-2.5 rounded-xl p-1.5 transition-colors", over === status && "bg-accent")}
						>
							<h2 className="flex items-center gap-2 px-1.5 pt-1 text-[13px] font-semibold">
								{look.label}
								<span className="font-normal text-muted-foreground tabular-nums">{list.length}</span>
							</h2>
							{list.map((r) => (
								<div
									key={r.order.id}
									draggable
									onDragStart={(event) => {
										event.dataTransfer.setData("text/plain", r.order.id);
										event.dataTransfer.effectAllowed = "move";
									}}
									className="cursor-grab active:cursor-grabbing"
								>
									{card(r, true)}
								</div>
							))}
							{!list.length && <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">Trage o lucrare aici</p>}
						</section>
					);
				})}
			</div>
		</div>
	);
}

/** Handed-over and cancelled jobs: a plain table, newest first. */
function ClosedList({ rows, settings, onOpen }) {
	return (
		<div className="overflow-hidden rounded-xl border bg-card">
			<div className="hidden grid-cols-[80px_minmax(0,1.4fr)_minmax(0,1fr)_140px_110px_120px] gap-3 border-b bg-muted px-4 py-2 text-[11px] font-semibold tracking-[0.03em] text-muted-foreground uppercase md:grid">
				<span>Nr.</span>
				<span>Mașina</span>
				<span>Client</span>
				<span>Stare</span>
				<span>Deschisă</span>
				<span className="text-right">Total</span>
			</div>
			<ul className="divide-y">
				{rows.slice(0, 200).map(({ order, vehicle, customer }) => (
					<li key={order.id}>
						<button type="button" onClick={() => onOpen(order)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left text-[13.5px] hover:bg-accent/50 md:grid-cols-[80px_minmax(0,1.4fr)_minmax(0,1fr)_140px_110px_120px]">
							<span className="hidden font-medium tabular-nums md:block">#{order.number}</span>
							<span className="flex min-w-0 items-center gap-2.5">
								<MakeTile make={vehicle?.make} size={28} />
								<span className="truncate">{vehicleName(vehicle) || "Mașină"}</span>
								{vehicle?.plate && <Plate value={vehicle.plate} size="sm" className="max-md:hidden" />}
							</span>
							<span className="hidden truncate md:block">{customer?.name}</span>
							<span className="hidden md:block">
								<JobStatus order={order} />
							</span>
							<span className="hidden text-muted-foreground md:block">{fmtDate(order.createdAt, "d MMM yyyy")}</span>
							<span className="text-right font-medium tabular-nums">{formatMoney(computeTotals(order.lines, { vatPayer: settings.invoicing.vatPayer }).gross, settings.currency)}</span>
						</button>
					</li>
				))}
			</ul>
			{rows.length > 200 && <p className="border-t px-4 py-2.5 text-center text-xs text-muted-foreground">Primele 200 din {rows.length}. Caută ca să le găsești pe celelalte.</p>}
		</div>
	);
}
