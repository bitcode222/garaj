"use client";

import { PhoneInvoices } from "@/features/phone/registry-lists";
import { PHONE } from "@/components/ds/nav-bar";
import { useMediaQuery } from "@/lib/hooks";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { FilePlus2, ReceiptText, Banknote, LayoutGrid, Rows3 } from "lucide-react";
import { Money, EmptyState } from "@/components/ds/data";
import { FilterChips, SearchInput } from "@/components/ds/inputs";
import { DataList, ListHeader, ListRow } from "@/components/ds/list";
import { Page, Toolbar } from "@/components/ds/page";
import { PageTitle, SectionHeader, StatCard, StatusDot, useViewSwitch } from "@/components/ds/blocks";
import { MakeTile } from "@/components/ds/car";
import { AREA, STATE, TONE_COLOR } from "@/lib/colors";
import { BANI_LOOK_KEY } from "./invoice-detail";
import { PlateTag } from "@/components/ds/make-logo";
import { ListPageSkeleton } from "@/components/ds/skeletons";
import { StateTag } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { monthKey } from "@/domain/dates";
import { formatInvoiceNumber } from "@/domain/invoice";
import { computeTotals } from "@/domain/lines";
import { formatMoney } from "@/domain/money";
import { fold, matchesTokens, queryTokens } from "@/domain/search";
import { fmtDate, fmtRelativeTo, plural } from "@/lib/format";
import { useOpenDetail } from "@/lib/detail-mode";
import { invoiceLook } from "@/lib/record-state";
import { createInvoiceDraft } from "@/lib/store/actions";
import { useCollection, useEntity, useIsReady, useSettings, useToday } from "@/lib/store/hooks";
import { selectInvoiceStates, selectInvoicesSorted, selectPaymentsByInvoice } from "@/lib/store/selectors";
import { SwipeRow } from "@/components/ds/swipe-row";
import { contactSwipeActions } from "@/features/common/swipe-actions";
import { openSheet } from "@/lib/sheets";

const FILTERS = [
	{ value: "all", label: "Toate" },
	{ value: "unpaid", label: "De încasat", tone: "yellow", states: ["issued", "partial", "overdue"] },
	{ value: "overdue", label: "Restante", tone: "red", states: ["overdue"] },
	{ value: "paid", label: "Plătite", tone: "green", states: ["paid"] },
	{ value: "draft", label: "Ciorne", tone: "neutral", states: ["draft"] },
	{ value: "cancelled", label: "Stornate", states: ["cancelled", "storno"] },
];

export function InvoicesPage() {
	const ready = useIsReady();
	const phone = useMediaQuery(PHONE); // a phone: the iPhone's list (docs/DESIGN.md "Telefon ca iPhone")
	const router = useRouter();
	const openDetail = useOpenDetail();
	const today = useToday();
	const settings = useSettings();
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	const customers = useCollection("customers");
	const vehicles = useCollection("vehicles");
	const [filter, setFilter] = useState("all");
	const [look, lookSwitch] = useViewSwitch(BANI_LOOK_KEY, [
		{ value: "table", label: "Tabel", icon: Rows3 },
		{ value: "cards", label: "Plăci", icon: LayoutGrid },
	]);
	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query);

	useEffect(() => {
		router.prefetch("/invoices/detail/");
	}, [router]);

	const rows = useMemo(() => {
		if (!today) return [];
		const states = selectInvoiceStates(invoices, payments, today);
		const byInvoice = selectPaymentsByInvoice(payments);
		return selectInvoicesSorted(invoices).map((invoice) => {
			const info = states.get(invoice.id);
			const customerName = customers[invoice.customerId]?.name ?? invoice.snapshot?.buyer?.name ?? "Fără client";
			const plate = vehicles[invoice.vehicleId]?.plate ?? invoice.snapshot?.vehicle?.plate ?? null;
			const number = formatInvoiceNumber(invoice.series, invoice.number);
			const totals = invoice.totals ?? computeTotals(invoice.lines ?? [], { vatPayer: settings.invoicing.vatPayer });
			// Its state as its dot says it (docs/RECORD-COLORS.md): "Restantă de 3 zile", "Scadentă mâine".
			const look = invoiceLook(invoice, byInvoice.get(invoice.id) ?? [], { today, currency: settings.currency });
			return { invoice, ...info, look, totals, customerName, plate, number, hay: fold(`${number} ${invoice.number ?? ""} ${customerName} ${plate ?? ""} ${(plate ?? "").replace(/\s/g, "")}`) };
		});
	}, [invoices, payments, customers, vehicles, today, settings.invoicing.vatPayer, settings.currency]);

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

	// What the search keeps, whatever the filter (the cards group by state themselves).
	const found = useMemo(() => {
		const tokens = queryTokens(deferredQuery);
		return tokens.length ? rows.filter((row) => matchesTokens(row.hay, tokens)) : rows;
	}, [rows, deferredQuery]);

	const visible = useMemo(() => {
		const active = FILTERS.find((f) => f.value === filter);
		const tokens = queryTokens(deferredQuery);
		return rows.filter((row) => (!active?.states || active.states.includes(row.state)) && (!tokens.length || matchesTokens(row.hay, tokens)));
	}, [rows, filter, deferredQuery]);

	if (!ready || !today) return <ListPageSkeleton stats />;
	if (phone) return <PhoneInvoices />;

	const newInvoice = () => {
		const draft = createInvoiceDraft();
		router.push(`/invoices/detail/?id=${draft.id}`);
	};

	return (
		<Page>
			<PageTitle title="Facturi" subtitle={`${plural(counts.all, "document", "documente")} · seria ${settings.invoicing.series}`} className="mb-6">
				{lookSwitch}
				<Button onClick={newInvoice} className="max-md:hidden">
					<FilePlus2 /> Factură nouă
				</Button>
			</PageTitle>

			<div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
				<StatCard label="Facturat luna aceasta" value={formatMoney(stats.issuedMonth, settings.currency, { decimals: 0 })} note={plural(stats.issuedCount, "factură", "facturi")} color={AREA.factura} />
				<StatCard label="Încasat luna aceasta" value={formatMoney(stats.collectedMonth, settings.currency, { decimals: 0 })} note="plăți primite" color={STATE.ok} />
				<StatCard label="De încasat" value={formatMoney(stats.outstanding, settings.currency, { decimals: 0 })} note={plural(counts.unpaid, "factură", "facturi")} color={STATE.wait} />
				<StatCard label="Restante" value={formatMoney(stats.overdue, settings.currency, { decimals: 0 })} note={plural(stats.overdueCount, "factură", "facturi")} color={stats.overdueCount ? STATE.late : STATE.off} />
			</div>

			<Toolbar className="flex-col items-stretch md:flex-row md:items-center">
				<SearchInput value={query} onChange={setQuery} placeholder="Număr, client, nr. înmatriculare…" className="md:w-80" />
				{look === "table" && <FilterChips value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))} />}
			</Toolbar>

			{look === "cards" ? (
				<InvoiceCards rows={found} onOpen={(row) => openDetail("invoice", row.invoice.id)} currency={settings.currency} vehicles={vehicles} />
			) : (

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
					<ListHeader cols="md:grid-cols-[140px_minmax(0,1fr)_200px_110px_130px]">
						<span>Număr</span>
						<span>Client</span>
						<span>Stare</span>
						<span>Scadență</span>
						<span className="text-right">Total</span>
					</ListHeader>
				}
				renderRow={(row, index) => <InvoiceRow row={row} first={index === 0} today={today} onOpen={() => openDetail("invoice", row.invoice.id)} />}
			/>
			)}
		</Page>
	);
}

function InvoiceRow({ row, first, today, onOpen }) {
	const { invoice, state, look, balance, totals, customerName, plate, number } = row;
	const draft = invoice.status === "draft";
	const { currency } = useSettings();
	const customer = useEntity("customers", invoice.customerId);
	const vehicle = useEntity("vehicles", invoice.vehicleId);
	const owes = balance > 0 && invoice.status === "issued" && !invoice.stornoOf;
	const trailing = owes ? [{ key: "pay", label: "Încasează", icon: Banknote, tone: "green", onSelect: () => openSheet("payment", { invoiceId: invoice.id }) }] : [];
	return (
		<SwipeRow leading={contactSwipeActions(customer?.phone)} trailing={trailing} peek={first}>
		<ListRow onClick={onOpen} className="md:grid md:grid-cols-[140px_minmax(0,1fr)_200px_110px_130px] md:gap-3">
			{/* phone */}
			<div className="min-w-0 flex-1 md:hidden">
				<div className="flex items-baseline justify-between gap-3">
					<p className="truncate text-[15px] font-medium">{customerName}</p>
					<Money value={totals.gross} className="text-[15px] font-semibold" />
				</div>
				<div className="mt-1 flex items-center justify-between gap-3">
					<p className="truncate text-xs text-muted-foreground">
						<span className="font-mono">{draft ? "Ciornă" : number}</span> · {fmtDate(invoice.issueDate, "d MMM")}
						{balance > 0 && balance < totals.gross ? ` · rest ${formatMoney(balance, currency, { decimals: 0 })}` : ""}
					</p>
					<StateTag state={look} size="sm" />
				</div>
			</div>
			{/* desktop */}
			<div className="hidden min-w-0 md:block">
				<p className="font-mono text-[13px] font-medium">{draft ? "Ciornă" : number}</p>
				<p className="text-xs text-muted-foreground">{fmtDate(invoice.issueDate)}</p>
			</div>
			<div className="hidden min-w-0 items-center gap-2.5 md:flex">
				<MakeTile make={vehicle?.make} size={28} />
				<span className="truncate text-sm font-medium">{customerName}</span>
				{plate && <PlateTag value={plate} />}
			</div>
			<div className="hidden md:block">
				<StateTag state={look} />
			</div>
			<div className="hidden text-sm text-muted-foreground md:block">
				{/* The date itself: how far it is, the state beside it already says. */}
				{state === "paid" || state === "cancelled" || state === "storno" || draft || !invoice.dueDate ? "—" : fmtDate(invoice.dueDate, "d MMM yyyy")}
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
		</SwipeRow>
	);
}

const CARD_GROUPS = [
	{ key: "due", title: "De încasat", states: ["overdue", "partial", "issued"] },
	{ key: "draft", title: "Ciorne", subtitle: "Facturi încă neemise", states: ["draft"] },
	{ key: "paid", title: "Plătite recent", states: ["paid"], limit: 12 },
	{ key: "cancelled", title: "Stornate", states: ["cancelled", "storno"], limit: 8 },
];

/** "Plăci": each invoice as a card with its amount first, in groups: to collect, drafts, paid, cancelled. */
function InvoiceCards({ rows, onOpen, currency, vehicles }) {
	const groups = CARD_GROUPS.map((group) => {
		const all = rows.filter((row) => group.states.includes(row.state));
		return { ...group, all, list: group.limit ? all.slice(0, group.limit) : all };
	}).filter((group) => group.all.length);
	if (!groups.length) return <EmptyState icon={ReceiptText} title="Nicio factură găsită" description="Schimbă căutarea." />;
	return (
		<div className="space-y-7">
			{groups.map((group) => {
				const amount = group.all.reduce((n, row) => n + (group.key === "due" || group.key === "draft" ? row.balance || row.totals.gross : row.totals.gross), 0);
				return (
					<section key={group.key} className="space-y-3" aria-label={group.title}>
						<SectionHeader title={group.title} subtitle={`${formatMoney(amount, currency)} · ${plural(group.all.length, "factură", "facturi")}${group.subtitle ? ` · ${group.subtitle}` : ""}`} />
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
							{group.list.map((row) => {
								const vehicle = vehicles[row.invoice.vehicleId];
								const owed = group.key === "due" ? row.balance : row.totals.gross;
								return (
									<button key={row.invoice.id} type="button" onClick={() => onOpen(row)} className="flex min-w-0 flex-col gap-2.5 rounded-xl border bg-card p-3.5 text-left transition-colors hover:bg-accent/40">
										<span className="flex min-w-0 items-center gap-2.5">
											<MakeTile make={vehicle?.make} size={36} />
											<span className="min-w-0">
												<span className="block truncate text-[14px] font-semibold">{row.customerName}</span>
												<span className="block truncate text-xs text-muted-foreground">
													{row.invoice.status === "draft" ? "Ciornă" : row.number}
													{vehicle ? ` · ${[vehicle.make, vehicle.model].filter(Boolean).join(" ")}` : ""}
												</span>
											</span>
										</span>
										<span className="text-[20px] leading-tight font-semibold tracking-tight tabular-nums">{formatMoney(owed, currency)}</span>
										<span className="flex items-center justify-between gap-2">
											<StatusDot color={TONE_COLOR[row.look.tone] ?? STATE.off}>{row.look.text}</StatusDot>
											<span className="truncate text-xs text-muted-foreground">{fmtDate(row.invoice.issueDate, "d MMM")}</span>
										</span>
									</button>
								);
							})}
						</div>
						{group.all.length > group.list.length && <p className="text-xs text-muted-foreground">Și încă {group.all.length - group.list.length}; în „Tabel” le vezi pe toate.</p>}
					</section>
				);
			})}
		</div>
	);
}
