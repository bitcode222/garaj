"use client";

import { useMemo, useState } from "react";
import { BarChart3, LayoutDashboard, Table2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ds/card";
import { Money } from "@/components/ds/data";
import { Segmented } from "@/components/ds/inputs";
import { Page } from "@/components/ds/page";
import { PageTitle, StatCard, useViewSwitch } from "@/components/ds/blocks";
import { AREA } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { HomeAnalytics } from "@/features/dashboard/home-analytics";
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
	const [look, lookSwitch] = useViewSwitch("garaj.rapoarte.look", [
		{ value: "charts", label: "Grafice", icon: BarChart3 },
		{ value: "panel", label: "Panou", icon: LayoutDashboard },
	]);
	const panel = look === "panel";

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
			<PageTitle title="Rapoarte" subtitle={`${fmtDate(range.from)} – ${fmtDate(range.to)} · valori fără TVA`} className="mb-6">
				{lookSwitch}
			</PageTitle>

			<div className="mb-6 flex flex-wrap items-center gap-2">
				<Segmented value={period} onValueChange={setPeriod} options={PERIODS} className="max-sm:w-full max-sm:[&>button]:flex-1 max-sm:[&>button]:px-1" aria-label="Perioadă" />
			</div>

			{/* "Grafice": the numbers in a row, the chart, then the lists two by two. "Panou": a dashboard, the chart large in
			    the corner and the numbers as tiles beside it (docs/DESIGN.md §4). */}
			<div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
				<StatCard className={cn(panel && "lg:order-2")} label="Venituri" value={formatMoney(summary.net, settings.currency, { decimals: 0 })} note={plural(summary.count, "factură", "facturi")} color={AREA.factura} />
				<StatCard className={cn(panel && "lg:order-3")} label="Bon mediu" value={formatMoney(summary.avgTicket, settings.currency, { decimals: 0 })} note="per factură" color={AREA.factura} />
				<StatCard className={cn(panel && "lg:order-4")} label="Marjă pe piese" value={`${fmtNumber(summary.partsMarginPct, 0)}%`} note={`adaos ${formatMoney(summary.partsMargin, settings.currency, { decimals: 0 })}`} color={AREA.catalog} />
				<StatCard className={cn(panel && "lg:order-5")} label="Manoperă facturată" value={fmtHours(Math.round(summary.hours))} note={formatMoney(summary.labor, settings.currency, { decimals: 0 })} color={AREA.lucrare} />
			<Card className={cn("col-span-2", panel ? "lg:order-1 lg:row-span-2" : "mt-3 lg:col-span-4")}>
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
			</div>

			<div className={cn("grid gap-6", panel ? "lg:grid-cols-4 [&>*]:lg:col-span-2" : "lg:grid-cols-2")}>
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
			{/* The home page's analytics, moved here with the redesign (docs/DESIGN.md §4). */}
			<section className="mt-10" aria-label="Activitate">
				<HomeAnalytics today={today} />
			</section>
		</Page>
	);
}
