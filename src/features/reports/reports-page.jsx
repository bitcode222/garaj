"use client";

import { useMemo, useState } from "react";
import { BarChart3, Clock, Percent, ReceiptText, Table2, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ds/card";
import { Money, Stat } from "@/components/ds/data";
import { Segmented } from "@/components/ds/inputs";
import { Page, PageHeader } from "@/components/ds/page";
import { ListPageSkeleton } from "@/components/ds/skeletons";
import { ToneBadge } from "@/components/ds/tone";
import { addDaysISO, diffDaysISO, monthKey } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { monthRange, paymentMix, receivablesAging, revenueByDay, revenueByMonth, staffProductivity, summarize, topServices } from "@/domain/reports";
import { fmtDate, fmtHours, fmtNumber, plural } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/labels";
import { useCollection, useIsReady, useSettings, useToday } from "@/lib/store/hooks";
import { selectList, selectPaymentsByInvoice } from "@/lib/store/selectors";
import { BarList, MixBar, StackedColumns } from "./charts";

const PERIODS = [
	{ value: "month", label: "Luna aceasta" },
	{ value: "3m", label: "3 luni" },
	{ value: "12m", label: "12 luni" },
	{ value: "year", label: "Anul curent" },
];

function periodRange(period, today) {
	if (period === "month") return { from: `${monthKey(today)}-01`, to: today };
	if (period === "year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
	const months = monthRange(today, period === "3m" ? 3 : 12);
	return { from: `${months[0]}-01`, to: today };
}

const SERIES = [
	{ key: "labor", label: "Manoperă", color: "var(--viz-1)", value: (r) => r.labor },
	{ key: "parts", label: "Piese și materiale", color: "var(--viz-2)", value: (r) => r.parts + r.fees },
];

export function ReportsPage() {
	const ready = useIsReady();
	const today = useToday();
	const settings = useSettings();
	const invoicesMap = useCollection("invoices");
	const paymentsMap = useCollection("payments");
	const staff = useCollection("staff");
	const [period, setPeriod] = useState("12m");
	const [table, setTable] = useState(false);

	const report = useMemo(() => {
		if (!today) return null;
		const invoices = selectList(invoicesMap);
		const payments = selectList(paymentsMap);
		const range = periodRange(period, today);
		let rows;
		if (period === "month") {
			const days = Array.from({ length: diffDaysISO(range.from, range.to) + 1 }, (_, i) => addDaysISO(range.from, i));
			rows = revenueByDay(invoices, days);
		} else {
			const count = period === "3m" ? 3 : period === "12m" ? 12 : Number(today.slice(5, 7));
			rows = revenueByMonth(invoices, monthRange(today, count));
		}
		return {
			range,
			rows,
			summary: summarize(invoices, range),
			top: topServices(invoices, { ...range, limit: 6 }),
			people: staffProductivity(invoices, range),
			mix: paymentMix(payments, range),
			aging: receivablesAging(invoices, selectPaymentsByInvoice(paymentsMap), today),
		};
	}, [invoicesMap, paymentsMap, today, period]);

	if (!ready || !report) return <ListPageSkeleton stats rows={4} />;

	const { summary, rows, top, people, mix, aging, range } = report;
	const daily = period === "month";
	const label = (key, long) => (daily ? fmtDate(key, long ? "EEEE, d MMMM" : "d") : fmtDate(`${key}-01`, long ? "MMMM yyyy" : "MMM"));

	return (
		<Page width="wide">
			<PageHeader title="Rapoarte" description={`${fmtDate(range.from)} – ${fmtDate(range.to)} · valori fără TVA`} />

			<div className="mb-6 flex flex-wrap items-center gap-2">
				<Segmented value={period} onValueChange={setPeriod} options={PERIODS} className="max-sm:w-full max-sm:[&>button]:flex-1 max-sm:[&>button]:px-1" aria-label="Perioadă" />
			</div>

			<div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
				<Stat label="Venituri" value={<Money value={summary.net} decimals={0} />} hint={plural(summary.count, "factură", "facturi")} icon={ReceiptText} />
				<Stat label="Bon mediu" value={<Money value={summary.avgTicket} decimals={0} />} hint="per factură" icon={Wallet} />
				<Stat label="Marjă pe piese" value={`${fmtNumber(summary.partsMarginPct, 0)}%`} hint={<>adaos {formatMoney(summary.partsMargin, settings.currency, { decimals: 0 })}</>} icon={Percent} />
				<Stat label="Manoperă facturată" value={fmtHours(Math.round(summary.hours))} hint={<>{formatMoney(summary.labor, settings.currency, { decimals: 0 })}</>} icon={Clock} />
			</div>

			<Card className="mb-6">
				<CardHeader
					title={daily ? "Venituri pe zile" : "Venituri pe luni"}
					icon={BarChart3}
					description="Manoperă și piese, fără TVA"
					action={
						<Segmented
							value={table ? "table" : "chart"}
							onValueChange={(v) => setTable(v === "table")}
							options={[
								{ value: "chart", label: "Grafic", icon: BarChart3 },
								{ value: "table", label: "Tabel", icon: Table2 },
							]}
							collapse
						/>
					}
				/>
				<CardContent>
					{table ? (
						<div className="max-h-96 overflow-auto rounded-lg border">
							<table className="w-full text-sm">
								<thead className="sticky top-0 bg-muted text-2xs tracking-wider text-muted-foreground uppercase">
									<tr>
										<th className="px-3 py-2 text-left font-medium">{daily ? "Zi" : "Lună"}</th>
										<th className="px-3 py-2 text-right font-medium">Manoperă</th>
										<th className="px-3 py-2 text-right font-medium">Piese și mat.</th>
										<th className="px-3 py-2 text-right font-medium">Total</th>
									</tr>
								</thead>
								<tbody>
									{rows.map((row) => (
										<tr key={row.month} className="border-t">
											<td className="px-3 py-2 first-letter:uppercase">{label(row.month, true)}</td>
											<td className="px-3 py-2 text-right"><Money value={row.labor} /></td>
											<td className="px-3 py-2 text-right"><Money value={row.parts + row.fees} /></td>
											<td className="px-3 py-2 text-right font-medium"><Money value={row.net} /></td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<StackedColumns rows={rows} series={SERIES} formatLabel={label} currency={settings.currency} />
					)}
				</CardContent>
			</Card>

			<div className="grid gap-6 lg:grid-cols-2">
				<Card>
					<CardHeader title="Cele mai vândute operațiuni" description="După valoarea manoperei" />
					<CardContent>
						{top.length ? (
							<BarList
								items={top.map((t) => ({ key: t.key, label: t.name, value: t.revenue, hint: `${t.count}×` }))}
								format={(v) => formatMoney(v, settings.currency, { decimals: 0 })}
							/>
						) : (
							<p className="text-sm text-muted-foreground">Nicio operațiune facturată în perioadă.</p>
						)}
					</CardContent>
				</Card>
				<Card>
					<CardHeader title="Mecanici" description="Ore de manoperă facturate" />
					<CardContent>
						{people.length ? (
							<BarList
								items={people.map((p) => ({ key: p.staffId, label: staff[p.staffId]?.name ?? "—", value: p.hours, hint: formatMoney(p.revenue, settings.currency, { decimals: 0 }) }))}
								format={(v) => fmtHours(Math.round(v * 10) / 10)}
							/>
						) : (
							<p className="text-sm text-muted-foreground">Nicio manoperă alocată în perioadă.</p>
						)}
					</CardContent>
				</Card>
				<Card>
					<CardHeader title="Încasări pe metode" description="Plăți înregistrate în perioadă" />
					<CardContent>
						<MixBar
							currency={settings.currency}
							parts={[
								{ key: "card", label: PAYMENT_METHODS.card.label, value: mix.card, color: "var(--viz-1)" },
								{ key: "cash", label: PAYMENT_METHODS.cash.label, value: mix.cash, color: "var(--viz-2)" },
								{ key: "transfer", label: PAYMENT_METHODS.transfer.label, value: mix.transfer, color: "var(--viz-3)" },
							]}
						/>
					</CardContent>
				</Card>
				<Card>
					<CardHeader title="Creanțe la zi" description={`Total de încasat: ${formatMoney(aging.total, settings.currency)}`} />
					<CardContent>
						<table className="w-full text-sm">
							<tbody>
								{[
									{ key: "current", label: "În termen", tone: "green", value: aging.current },
									{ key: "d30", label: "Restante 1–30 zile", tone: "yellow", value: aging.d30 },
									{ key: "d60", label: "Restante 31–60 zile", tone: "orange", value: aging.d60 },
									{ key: "d90", label: "Restante peste 60 zile", tone: "red", value: aging.d90 },
								].map((row) => (
									<tr key={row.key} className="border-b last:border-0">
										<td className="py-2.5">
											<ToneBadge tone={row.tone} size="sm">
												{row.label}
											</ToneBadge>
										</td>
										<td className="py-2.5 text-right font-medium">
											<Money value={row.value} />
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</CardContent>
				</Card>
			</div>
		</Page>
	);
}
