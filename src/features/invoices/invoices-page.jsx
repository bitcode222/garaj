"use client";

import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { FilePlus2, ReceiptText, TriangleAlert, Wallet, Banknote, FileText } from "lucide-react";
import { Money, Stat, EmptyState } from "@/components/ds/data";
import { FilterChips, SearchInput } from "@/components/ds/inputs";
import { DataList, ListHeader, ListRow } from "@/components/ds/list";
import { Page, PageHeader, Toolbar } from "@/components/ds/page";
import { Plate } from "@/components/ds/plate";
import { ListPageSkeleton } from "@/components/ds/skeletons";
import { StatusBadge } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { monthKey } from "@/domain/dates";
import { formatInvoiceNumber } from "@/domain/invoice";
import { computeTotals } from "@/domain/lines";
import { fold, matchesTokens, queryTokens } from "@/domain/search";
import { fmtDate, fmtRelativeTo, plural } from "@/lib/format";
import { INVOICE_STATE } from "@/lib/labels";
import { createInvoiceDraft } from "@/lib/store/actions";
import { useCollection, useIsReady, useSettings, useToday } from "@/lib/store/hooks";
import { selectInvoiceStates, selectInvoicesSorted } from "@/lib/store/selectors";

const FILTERS = [
	{ value: "all", label: "Toate" },
	{ value: "unpaid", label: "De încasat", tone: "blue", states: ["issued", "partial", "overdue"] },
	{ value: "overdue", label: "Restante", tone: "red", states: ["overdue"] },
	{ value: "paid", label: "Plătite", tone: "green", states: ["paid"] },
	{ value: "draft", label: "Ciorne", tone: "neutral", states: ["draft"] },
	{ value: "cancelled", label: "Stornate", states: ["cancelled", "storno"] },
];

export function InvoicesPage() {
	const ready = useIsReady();
	const router = useRouter();
	const today = useToday();
	const settings = useSettings();
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	const customers = useCollection("customers");
	const vehicles = useCollection("vehicles");
	const [filter, setFilter] = useState("all");
	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query);

	useEffect(() => {
		router.prefetch("/invoices/detail/");
	}, [router]);

	const rows = useMemo(() => {
		if (!today) return [];
		const states = selectInvoiceStates(invoices, payments, today);
		return selectInvoicesSorted(invoices).map((invoice) => {
			const info = states.get(invoice.id);
			const customerName = customers[invoice.customerId]?.name ?? invoice.snapshot?.buyer?.name ?? "Fără client";
			const plate = vehicles[invoice.vehicleId]?.plate ?? invoice.snapshot?.vehicle?.plate ?? null;
			const number = formatInvoiceNumber(invoice.series, invoice.number);
			const totals = invoice.totals ?? computeTotals(invoice.lines ?? [], { vatPayer: settings.invoicing.vatPayer });
			return { invoice, ...info, totals, customerName, plate, number, hay: fold(`${number} ${invoice.number ?? ""} ${customerName} ${plate ?? ""} ${(plate ?? "").replace(/\s/g, "")}`) };
		});
	}, [invoices, payments, customers, vehicles, today, settings.invoicing.vatPayer]);

	const stats = useMemo(() => {
		const month = today ? monthKey(today) : "";
		const s = { issuedMonth: 0, issuedCount: 0, collectedMonth: 0, outstanding: 0, overdue: 0, overdueCount: 0 };
		for (const row of rows) {
			const inv = row.invoice;
			if (inv.status !== "draft" && monthKey(inv.issueDate) === month) {
				s.issuedMonth += inv.totals.gross;
				if (!inv.stornoOf && inv.status !== "cancelled") s.issuedCount += 1;
			}
			s.outstanding += row.balance;
			if (row.state === "overdue") {
				s.overdue += row.balance;
				s.overdueCount += 1;
			}
		}
		for (const id in payments) if (monthKey(payments[id].date) === month) s.collectedMonth += payments[id].amount;
		return s;
	}, [rows, payments, today]);

	const counts = useMemo(() => {
		const c = {};
		for (const f of FILTERS) c[f.value] = f.states ? rows.filter((r) => f.states.includes(r.state)).length : rows.length;
		return c;
	}, [rows]);

	const visible = useMemo(() => {
		const active = FILTERS.find((f) => f.value === filter);
		const tokens = queryTokens(deferredQuery);
		return rows.filter((row) => (!active?.states || active.states.includes(row.state)) && (!tokens.length || matchesTokens(row.hay, tokens)));
	}, [rows, filter, deferredQuery]);

	if (!ready || !today) return <ListPageSkeleton stats />;

	const newInvoice = () => {
		const draft = createInvoiceDraft();
		router.push(`/invoices/detail/?id=${draft.id}`);
	};

	return (
		<Page>
			<PageHeader
				title="Facturi"
				description={`${plural(counts.all, "document", "documente")} · seria ${settings.invoicing.series}`}
				actions={
					<Button onClick={newInvoice} className="max-md:hidden">
						<FilePlus2 /> Factură nouă
					</Button>
				}
			/>

			<div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
				<Stat label="Facturat luna aceasta" value={<Money value={stats.issuedMonth} decimals={0} />} hint={plural(stats.issuedCount, "factură", "facturi")} icon={FileText} />
				<Stat label="Încasat luna aceasta" value={<Money value={stats.collectedMonth} decimals={0} />} icon={Banknote} tone="green" />
				<Stat label="De încasat" value={<Money value={stats.outstanding} decimals={0} />} icon={Wallet} tone="blue" />
				<Stat
					label="Restante"
					value={<Money value={stats.overdue} decimals={0} />}
					hint={plural(stats.overdueCount, "factură", "facturi")}
					icon={TriangleAlert}
					tone={stats.overdueCount ? "red" : undefined}
				/>
			</div>

			<Toolbar className="flex-col items-stretch md:flex-row md:items-center">
				<SearchInput value={query} onChange={setQuery} placeholder="Număr, client, nr. înmatriculare…" className="md:w-80" />
				<FilterChips value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))} />
			</Toolbar>

			<DataList
				items={visible}
				getKey={(row) => row.invoice.id}
				empty={
					<EmptyState
						icon={ReceiptText}
						title={query || filter !== "all" ? "Nicio factură pentru filtrul ales" : "Nicio factură încă"}
						description={query || filter !== "all" ? "Schimbă căutarea sau filtrul." : "Emite prima factură dintr-o lucrare sau de la zero."}
						action={
							!query && filter === "all" ? (
								<Button onClick={newInvoice}>
									<FilePlus2 /> Factură nouă
								</Button>
							) : null
						}
					/>
				}
				header={
					<ListHeader cols="md:grid-cols-[140px_minmax(0,1fr)_150px_130px_130px]">
						<span>Număr</span>
						<span>Client</span>
						<span>Stare</span>
						<span>Scadență</span>
						<span className="text-right">Total</span>
					</ListHeader>
				}
				renderRow={(row) => <InvoiceRow row={row} today={today} />}
			/>
		</Page>
	);
}

function InvoiceRow({ row, today }) {
	const { invoice, state, balance, totals, customerName, plate, number } = row;
	const draft = invoice.status === "draft";
	return (
		<ListRow href={`/invoices/detail/?id=${invoice.id}`} className="md:grid md:grid-cols-[140px_minmax(0,1fr)_150px_130px_130px] md:gap-3">
			{/* phone */}
			<div className="min-w-0 flex-1 md:hidden">
				<div className="flex items-baseline justify-between gap-3">
					<p className="truncate text-[15px] font-medium">{customerName}</p>
					<Money value={totals.gross} className="text-[15px] font-semibold" />
				</div>
				<div className="mt-1 flex items-center justify-between gap-3">
					<p className="truncate text-xs text-muted-foreground">
						<span className="font-mono">{draft ? "Ciornă" : number}</span> · {fmtDate(invoice.issueDate, "d MMM")}
						{balance > 0 && balance < totals.gross ? ` · rest ${Math.round(balance / 100)} lei` : ""}
					</p>
					<StatusBadge map={INVOICE_STATE} value={state} size="sm" />
				</div>
			</div>
			{/* desktop */}
			<div className="hidden min-w-0 md:block">
				<p className="font-mono text-[13px] font-medium">{draft ? "Ciornă" : number}</p>
				<p className="text-xs text-muted-foreground">{fmtDate(invoice.issueDate)}</p>
			</div>
			<div className="hidden min-w-0 items-center gap-2.5 md:flex">
				<span className="truncate text-sm font-medium">{customerName}</span>
				{plate && <Plate value={plate} size="sm" />}
			</div>
			<div className="hidden md:block">
				<StatusBadge map={INVOICE_STATE} value={state} />
			</div>
			<div className="hidden text-sm text-muted-foreground md:block">
				{state === "paid" || state === "cancelled" || state === "storno" || draft ? "—" : fmtRelativeTo(invoice.dueDate, today)}
			</div>
			<div className="hidden text-right md:block">
				<Money value={totals.gross} className="text-sm font-semibold" />
				{balance > 0 && balance < totals.gross && (
					<p className="text-xs text-muted-foreground">
						rest <Money value={balance} />
					</p>
				)}
			</div>
		</ListRow>
	);
}
