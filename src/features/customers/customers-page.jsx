"use client";

import { PhoneCustomers } from "@/features/phone/registry-lists";
import { PHONE } from "@/components/ds/nav-bar";
import { useMediaQuery } from "@/lib/hooks";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { EmptyState, Initials, Money } from "@/components/ds/data";
import { FilterChips, SearchInput } from "@/components/ds/inputs";
import { DataList, ListHeader, ListRow } from "@/components/ds/list";
import { Page, Toolbar } from "@/components/ds/page";
import { PageTitle, useViewSwitch } from "@/components/ds/blocks";
import { MakeTile } from "@/components/ds/car";
import { PEOPLE_LOOKS, PEOPLE_LOOK_KEY } from "@/features/common/people-look";
import { MakeLogo } from "@/components/ds/make-logo";
import { ListPageSkeleton } from "@/components/ds/skeletons";
import { ToneBadge } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/domain/customer";
import { fold, matchesTokens, queryTokens } from "@/domain/search";
import { fmtDate, plural } from "@/lib/format";
import { useOpenDetail } from "@/lib/detail-mode";
import { openSheet } from "@/lib/sheets";
import { useCollection, useIsReady, useToday } from "@/lib/store/hooks";
import { selectCustomerBalances, selectCustomersSorted, selectVehiclesByCustomer, selectWorkOrdersByCustomer } from "@/lib/store/selectors";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { SwipeRow } from "@/components/ds/swipe-row";
import { contactSwipeActions, whatsappSwipeAction } from "@/features/common/swipe-actions";

const FILTERS = [
	{ value: "all", label: "Toți" },
	{ value: "person", label: "Persoane fizice" },
	{ value: "company", label: "Firme", tone: "purple" },
	{ value: "debt", label: "Cu sold", tone: "red" },
];

export function CustomersPage() {
	const ready = useIsReady();
	const phone = useMediaQuery(PHONE); // a phone: the iPhone's list (docs/DESIGN.md "Telefon ca iPhone")
	const router = useRouter();
	const openDetail = useOpenDetail();
	const today = useToday();
	const customers = useCollection("customers");
	const vehicles = useCollection("vehicles");
	const workOrders = useCollection("workOrders");
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	const [filter, setFilter] = useState("all");
	const [look, lookSwitch] = useViewSwitch(PEOPLE_LOOK_KEY, PEOPLE_LOOKS);
	const [query, setQuery] = useState("");
	const deferred = useDeferredValue(query);

	useEffect(() => {
		router.prefetch("/customers/detail/");
	}, [router]);

	const rows = useMemo(() => {
		if (!today) return [];
		const byCustomer = selectVehiclesByCustomer(vehicles);
		const orders = selectWorkOrdersByCustomer(workOrders);
		const balances = selectCustomerBalances(invoices, payments, today);
		return selectCustomersSorted(customers).map((customer) => {
			const cars = byCustomer.get(customer.id) ?? [];
			const visits = orders.get(customer.id) ?? [];
			return {
				customer,
				cars,
				visits: visits.length,
				lastVisit: visits[0]?.createdAt ?? null,
				balance: balances.get(customer.id) ?? 0,
				hay: fold(`${customer.name} ${customer.phone} ${(customer.phone ?? "").replace(/\D/g, "")} ${customer.email} ${customer.cui} ${cars.map((c) => `${c.plate} ${c.plate.replace(/\s/g, "")}`).join(" ")}`),
			};
		});
	}, [customers, vehicles, workOrders, invoices, payments, today]);

	const counts = useMemo(
		() => ({
			all: rows.length,
			person: rows.filter((r) => r.customer.type !== "company").length,
			company: rows.filter((r) => r.customer.type === "company").length,
			debt: rows.filter((r) => r.balance > 0).length,
		}),
		[rows],
	);

	const visible = useMemo(() => {
		const tokens = queryTokens(deferred);
		return rows.filter((r) => {
			if (filter === "person" && r.customer.type === "company") return false;
			if (filter === "company" && r.customer.type !== "company") return false;
			if (filter === "debt" && r.balance <= 0) return false;
			return !tokens.length || matchesTokens(r.hay, tokens);
		});
	}, [rows, filter, deferred]);

	if (!ready || !today) return <ListPageSkeleton />;
	if (phone) return <PhoneCustomers />;

	return (
		<Page>
			<PageTitle title="Clienți" subtitle={plural(counts.all, "client", "clienți")} className="mb-6">
				{lookSwitch}
				<Button onClick={() => openSheet("customer")} className="max-md:hidden">
					<UserPlus /> Client nou
				</Button>
			</PageTitle>
			<Toolbar className="flex-col items-stretch md:flex-row md:items-center">
				<SearchInput value={query} onChange={setQuery} placeholder="Nume, telefon, CUI, nr. înmatriculare…" className="md:w-80" />
				<FilterChips value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))} />
			</Toolbar>
			{look === "gallery" ? (
				<CustomerCards rows={visible} onOpen={(id) => openDetail("customer", id)} />
			) : (
			<DataList
				items={visible}
				getKey={(r) => r.customer.id}
				empty={
					<EmptyState
						icon={Users}
						title={query ? "Niciun client găsit" : "Niciun client încă"}
						description={query ? "Încearcă numărul de telefon sau de înmatriculare." : "Clienții apar aici când îi adaugi sau primești o mașină."}
						action={<Button onClick={() => openSheet("customer")}>Adaugă client</Button>}
					/>
				}
				header={
					<ListHeader cols="md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_120px_120px]">
						<span>Client</span>
						<span>Telefon</span>
						<span>Mașini</span>
						<span>Ultima vizită</span>
						<span className="text-right">Sold</span>
					</ListHeader>
				}
				renderRow={({ customer, cars, lastVisit, balance, visits }, index) => (
					<SwipeRow leading={contactSwipeActions(customer.phone)} trailing={whatsappSwipeAction(customer.phone)} peek={index === 0}>
					<ListRow onClick={() => openDetail("customer", customer.id)} className="md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_120px_120px] md:gap-3">
						<div className="flex min-w-0 flex-1 items-center gap-3">
							<Initials name={customer.name} tone={customer.type === "company" ? "purple" : "blue"} />
							<div className="min-w-0 flex-1">
								<p className="truncate text-[15px] font-medium md:text-sm">{customer.name}</p>
								<p className="truncate text-xs text-muted-foreground md:hidden">
									{formatPhone(customer.phone) || "Fără telefon"} · {plural(visits, "vizită", "vizite")}
								</p>
								{customer.type === "company" && <p className="hidden text-xs text-muted-foreground md:block">{customer.cui}</p>}
							</div>
							{balance > 0 && <ToneBadge tone="red" size="sm" className="md:hidden">Sold</ToneBadge>}
						</div>
						<span className="hidden truncate text-sm text-muted-foreground md:block">{formatPhone(customer.phone) || "—"}</span>
						<span className="hidden min-w-0 items-center gap-1.5 md:flex">
							{cars.slice(0, 2).map((c) => (
								<span key={c.id} className="flex min-w-0 items-center gap-1.5 text-sm">
									<MakeLogo make={c.make} className="size-4" />
									<span className="truncate">{c.make}</span>
								</span>
							))}
							{cars.length > 2 && <span className="text-xs text-muted-foreground">+{cars.length - 2}</span>}
						</span>
						<span className="hidden text-sm text-muted-foreground md:block">{lastVisit ? fmtDate(lastVisit) : "—"}</span>
						<span className="hidden text-right md:block">{balance > 0 ? <Money value={balance} className={cn("text-sm font-semibold", tone("red").text)} /> : <span className="text-sm text-muted-foreground">—</span>}</span>
					</ListRow>
					</SwipeRow>
				)}
			/>
			)}
		</Page>
	);
}

/** "Galerie": each client as a card, with their cars as tiles. */
function CustomerCards({ rows, onOpen }) {
	if (!rows.length) return <EmptyState icon={Users} title="Niciun client găsit" description="Încearcă numărul de telefon sau de înmatriculare." />;
	return (
		<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{rows.slice(0, 120).map(({ customer, cars, lastVisit, balance, visits }) => (
				<button key={customer.id} type="button" onClick={() => onOpen(customer.id)} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-3.5 text-left transition-colors hover:bg-accent/40">
					<span className="flex min-w-0 items-center gap-3">
						<Initials name={customer.name} tone={customer.type === "company" ? "purple" : "blue"} className="size-11 text-sm" />
						<span className="min-w-0">
							<span className="block truncate text-[14.5px] font-semibold">{customer.name}</span>
							<span className="block truncate text-xs text-muted-foreground">{formatPhone(customer.phone) || "Fără telefon"}</span>
						</span>
					</span>
					<span className="flex min-w-0 items-center gap-2 text-[12.5px]">
						{cars.length ? (
							<>
								<span className="flex -space-x-1.5">
									{cars.slice(0, 3).map((c) => (
										<MakeTile key={c.id} make={c.make} size={24} className="ring-2 ring-card" />
									))}
								</span>
								<span className="min-w-0 truncate">{cars.map((c) => [c.make, c.model].filter(Boolean).join(" ")).join(", ")}</span>
							</>
						) : (
							<span className="text-muted-foreground">Nicio mașină</span>
						)}
					</span>
					<span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
						<span className="truncate">
							{plural(visits, "vizită", "vizite")}
							{lastVisit ? ` · ${fmtDate(lastVisit, "d MMM yyyy")}` : ""}
						</span>
						{balance > 0 && (
							<span className="shrink-0 font-semibold text-[#ff3b30] tabular-nums">
								<Money value={balance} decimals={0} />
							</span>
						)}
					</span>
				</button>
			))}
			{rows.length > 120 && <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3 xl:col-span-4">Primii 120 din {rows.length}. Caută ca să-i găsești pe ceilalți.</p>}
		</div>
	);
}
