"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, ChartArea, Ellipsis, Minus, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PERIODS } from "@/domain/analytics";
import { formatMoney } from "@/domain/money";
import { fmtDate, fmtHours, fmtNumber } from "@/lib/format";
import { useCollection, useSettings } from "@/lib/store/hooks";
import { selectHomeAnalytics } from "@/lib/store/selectors";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { AreaChart, NoData } from "@/features/reports/charts";

const PERIOD_LABEL = { "7d": "Ultimele 7 zile", "30d": "Ultimele 30 de zile", "12m": "Ultimele 12 luni" };
const PERIOD_KEY = "garaj.homePeriod";

function storedPeriod() {
	try {
		const value = localStorage.getItem(PERIOD_KEY);
		return PERIODS.includes(value) ? value : "7d";
	} catch {
		return "7d";
	}
}

const compact = new Intl.NumberFormat("ro-RO", { notation: "compact", maximumFractionDigits: 1 });

/** "1,5 zile", "1 zi", "18 h" under a day. */
const fmtStay = (days) => (days < 1 ? `${Math.round(days * 24)} h` : `${fmtNumber(days, days < 10 ? 1 : 0)} ${days === 1 ? "zi" : "zile"}`);

/** The change against the period before: ↗ / ↘ and how much, green when it went the good way. */
function Change({ change }) {
	if (!change) return null;
	const Icon = change.direction === "up" ? ArrowUpRight : change.direction === "down" ? ArrowDownRight : Minus;
	const amount = change.points ? `${fmtNumber(Math.abs(change.pct), 0)} pp` : `${fmtNumber(Math.abs(change.pct), 1)}%`;
	const color = change.good == null ? "text-muted-foreground" : tone(change.good ? "green" : "red").text;
	const said = change.direction === "flat" ? "la fel ca în perioada anterioară" : `${change.direction === "up" ? "în creștere" : "în scădere"} cu ${amount}${change.points ? " (puncte procentuale)" : ""} față de perioada anterioară`;
	return (
		<span className={cn("inline-flex items-center gap-0.5 text-sm font-medium tabular-nums", color)} title={said}>
			<Icon className="size-4" aria-hidden />
			{change.direction === "flat" ? "0%" : amount}
			<span className="sr-only">, {said}</span>
		</span>
	);
}

/**
 * One number of Analiză (the Cloudflare card): its name, its value with the change, then its
 * chart (large: an area chart with axes; small: a sparkline), or "Fără date". "···" switches
 * to the numbers as a table (the data-viz rule) and leads to Rapoarte.
 */
function MetricCard({ title, metric, format, formatAxis, keys, formatKey, large = false, integer = false }) {
	const [table, setTable] = useState(false);
	const height = large ? 200 : 96;
	return (
		<section aria-label={title} data-metric={title} className="flex min-w-0 flex-col rounded-xl border bg-card p-4 md:p-5">
			<div className="flex items-start justify-between gap-2">
				<h3 className="text-sm text-muted-foreground">{title}</h3>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="-mt-1.5 -mr-2 size-11 text-muted-foreground md:size-8" aria-label={`Opțiuni: ${title}`}>
							<Ellipsis />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onSelect={() => setTable(!table)} disabled={metric.empty}>
							{table ? <ChartArea /> : <Table2 />} {table ? "Grafic" : "Tabel"}
						</DropdownMenuItem>
						<DropdownMenuItem asChild>
							<Link href="/reports/">
								<ArrowRight /> Deschide în Rapoarte
							</Link>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<p className="mt-0.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
				<span className={cn("font-semibold tracking-tight tabular-nums", large ? "text-3xl" : "text-2xl")}>{metric.value == null ? "–" : format(metric.value)}</span>
				<Change change={metric.change} />
			</p>
			<div className="mt-auto pt-4">
				{metric.empty ? (
					<NoData height={height} />
				) : table ? (
					<div className="overflow-auto rounded-lg border" style={{ maxHeight: height + 40 }}>
						<table className="w-full text-xs">
							<tbody>
								{[...keys].reverse().map((key, i) => {
									const value = metric.points[keys.length - 1 - i];
									return (
										<tr key={key} className="border-b last:border-0">
											<td className="px-2.5 py-1.5 text-muted-foreground first-letter:uppercase">{formatKey(key, true)}</td>
											<td className="px-2.5 py-1.5 text-right font-medium tabular-nums">{value == null ? "–" : format(value)}</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				) : (
					<AreaChart points={metric.points} keys={keys} format={format} formatAxis={formatAxis} formatKey={formatKey} label={`${title}, pe ${keys.length} ${keys.length === 12 ? "luni" : "zile"}`} height={height} bare={!large} integer={integer} />
				)}
			</div>
		</section>
	);
}

/**
 * "Analiză" on Azi (docs/HOME-PAGE.md D9), Cloudflare's grid: a period (remembered on this
 * device), two large cards (Încasări, Mașini primite) and four small ones (Bon mediu, Prezență,
 * Timp în service, Ore facturate), each against the period before. The numbers come from
 * src/domain/analytics.js; money is net of VAT where it is revenue, as in Rapoarte.
 */
export function HomeAnalytics({ today }) {
	const settings = useSettings();
	const [period, setPeriod] = useState(storedPeriod);
	const data = selectHomeAnalytics(useCollection("payments"), useCollection("workOrders"), useCollection("invoices"), useCollection("appointments"), today, period);
	const currency = settings.currency;
	const { keys, unit } = data.window;
	const formatKey = (key, long) => (unit === "month" ? fmtDate(`${key}-01`, long ? "MMMM yyyy" : "MMM") : fmtDate(key, long ? "EEEE, d MMMM" : "d MMM"));
	const money = (value) => formatMoney(value, currency, { decimals: 0 });
	const moneyAxis = (value) => compact.format(value / 100);
	const count = (value) => fmtNumber(value, 0);
	const choose = (next) => {
		setPeriod(next);
		try {
			localStorage.setItem(PERIOD_KEY, next);
		} catch {
			// remembered for this visit only
		}
	};
	const common = { keys, formatKey };

	return (
		<section aria-label="Analiză" className="space-y-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 className="text-lg font-semibold">Analiză</h2>
				<div className="flex items-center gap-1">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" className="max-md:h-11" aria-label={`Perioada: ${PERIOD_LABEL[period]}`}>
								<CalendarDays /> {PERIOD_LABEL[period]}
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuRadioGroup value={period} onValueChange={choose}>
								{PERIODS.map((value) => (
									<DropdownMenuRadioItem key={value} value={value}>
										{PERIOD_LABEL[value]}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>
					<Button asChild variant="ghost" className="max-md:h-11">
						<Link href="/reports/">
							Rapoarte <ArrowRight />
						</Link>
					</Button>
				</div>
			</div>
			<div className="grid gap-4 md:grid-cols-2">
				<MetricCard large title="Încasări" metric={data.collected} format={money} formatAxis={moneyAxis} {...common} />
				<MetricCard large integer title="Mașini primite" metric={data.received} format={count} {...common} />
			</div>
			<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
				<MetricCard title="Bon mediu" metric={data.ticket} format={money} {...common} />
				<MetricCard title="Prezență la programări" metric={data.show} format={(value) => `${fmtNumber(value * 100, 0)}%`} {...common} />
				<MetricCard title="Timp în service" metric={data.stay} format={fmtStay} {...common} />
				<MetricCard title="Ore facturate" metric={data.hours} format={(value) => fmtHours(value)} {...common} />
			</div>
		</section>
	);
}
