"use client";

import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { EmptyState, Initials, Money } from "@/components/ds/data";
import { FilterChips, SearchInput } from "@/components/ds/inputs";
import { DataList, ListHeader, ListRow } from "@/components/ds/list";
import { Page, PageHeader, Toolbar } from "@/components/ds/page";
import { Plate } from "@/components/ds/plate";
import { ListPageSkeleton } from "@/components/ds/skeletons";
import { ToneBadge } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/domain/customer";
import { fold, matchesTokens, queryTokens } from "@/domain/search";
import { fmtDate, plural } from "@/lib/format";
import { openSheet } from "@/lib/sheets";
import { useCollection, useIsReady, useToday } from "@/lib/store/hooks";
import { selectCustomerBalances, selectCustomersSorted, selectVehiclesByCustomer, selectWorkOrdersByCustomer } from "@/lib/store/selectors";

const FILTERS = [
	{ value: "all", label: "Toți" },
	{ value: "person", label: "Persoane fizice" },
	{ value: "company", label: "Firme", tone: "purple" },
	{ value: "debt", label: "Cu sold", tone: "red" },
];

export function CustomersPage() {
	const ready = useIsReady();
	const router = useRouter();
	const today = useToday();
	const customers = useCollection("customers");
	const vehicles = useCollection("vehicles");
	const workOrders = useCollection("workOrders");
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	const [filter, setFilter] = useState("all");
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

	return (
		<Page>
			<PageHeader
				title="Clienți"
				description={plural(counts.all, "client", "clienți")}
				actions={
					<Button onClick={() => openSheet("customer")} className="max-md:hidden">
						<UserPlus /> Client nou
					</Button>
				}
			/>
			<Toolbar className="flex-col items-stretch md:flex-row md:items-center">
				<SearchInput value={query} onChange={setQuery} placeholder="Nume, telefon, CUI, nr. înmatriculare…" className="md:w-80" />
				<FilterChips value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))} />
			</Toolbar>
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
				renderRow={({ customer, cars, lastVisit, balance, visits }) => (
					<ListRow href={`/customers/detail/?id=${customer.id}`} className="md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_120px_120px] md:gap-3">
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
								<Plate key={c.id} value={c.plate} size="sm" />
							))}
							{cars.length > 2 && <span className="text-xs text-muted-foreground">+{cars.length - 2}</span>}
						</span>
						<span className="hidden text-sm text-muted-foreground md:block">{lastVisit ? fmtDate(lastVisit) : "—"}</span>
						<span className="hidden text-right md:block">{balance > 0 ? <Money value={balance} className="text-sm font-semibold text-red-600 dark:text-red-400" /> : <span className="text-sm text-muted-foreground">—</span>}</span>
					</ListRow>
				)}
			/>
		</Page>
	);
}
