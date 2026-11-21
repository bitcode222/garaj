"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { fmtDate, formatMoney, plural } from "@/lib/format";
import { addDaysISO, addMonthsISO, monthKey } from "@/domain/dates";
import { AREA, STATE } from "@/lib/colors";
import { PAYMENT_METHODS } from "@/lib/labels";

// Azi A, the money row (docs/DESIGN.md §4): what came in today and how, what can still come in today, and the month so
// far against the month before. The numbers come from src/domain/analytics.js; this file only draws them.

// Payment methods are categories, not states or areas: shades of ink, the largest darkest.
const METHOD_SHADE = { card: "var(--foreground)", cash: "color-mix(in srgb, var(--foreground) 55%, var(--card))", transfer: "color-mix(in srgb, var(--foreground) 30%, var(--card))", other: "color-mix(in srgb, var(--foreground) 15%, var(--card))" };
// "miercurea trecută": the weekday with its article.
const LAST = { luni: "lunea", marți: "marțea", miercuri: "miercurea", joi: "joia", vineri: "vinerea", sâmbătă: "sâmbăta", duminică: "duminica" };
const methodLabel = (method) => (method === "transfer" ? "Transfer" : (PAYMENT_METHODS[method]?.label ?? "Altele"));

function Change({ change, against }) {
	if (!change || change.direction === "flat") return <span className="text-xs text-muted-foreground">{against ? `la fel ca ${against}` : " "}</span>;
	const pct = `${Math.abs(change.pct).toLocaleString("ro-RO", { maximumFractionDigits: 0 })}%`;
	return (
		<span className="text-xs font-medium" style={{ color: change.good ? STATE.ok : STATE.late }}>
			{change.direction === "up" ? "↗" : "↘"} {pct} <span className="font-normal text-muted-foreground">față de {against}</span>
		</span>
	);
}

function Card({ label, children, className = "" }) {
	return (
		<div className={`flex min-w-0 flex-col gap-1 rounded-xl border bg-card px-4 py-3.5 ${className}`}>
			<span className="text-xs text-muted-foreground">{label}</span>
			{children}
		</div>
	);
}

const Big = ({ children }) => <span className="azi-figure text-[24px] leading-tight font-semibold tracking-tight tabular-nums">{children}</span>;

function Takings({ takings, today, currency }) {
	const day = fmtDate(addDaysISO(today, -7), "EEEE");
	const weekday = `${LAST[day] ?? day} trecută`;
	return (
		<Card label="Încasat azi">
			<Big>{formatMoney(takings.total, currency, { decimals: 0 })}</Big>
			{/* Nothing in yet: the day is not over, so no red "−100%"; just what that day took. */}
			{takings.total > 0 ? (
				<Change change={takings.change} against={weekday} />
			) : (
				<span className="text-xs text-muted-foreground">{takings.previous > 0 ? `${weekday[0].toUpperCase()}${weekday.slice(1)}: ${formatMoney(takings.previous, currency, { decimals: 0 })}` : "\u00a0"}</span>
			)}
			{takings.total > 0 ? (
				<>
					<div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={takings.methods.map((m) => `${methodLabel(m.method)} ${formatMoney(m.amount, currency, { decimals: 0 })}`).join(", ")}>
						{takings.methods.map((m) => (
							<span key={m.method} style={{ width: `${(m.amount / takings.total) * 100}%`, background: METHOD_SHADE[m.method] }} />
						))}
					</div>
					<div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
						{takings.methods.map((m) => (
							<span key={m.method} className="inline-flex items-center gap-1.5">
								<span className="size-2 rounded-full" style={{ background: METHOD_SHADE[m.method] }} aria-hidden />
								{methodLabel(m.method)} <span className="font-medium text-foreground tabular-nums">{formatMoney(m.amount, currency, { decimals: 0 })}</span>
							</span>
						))}
					</div>
				</>
			) : (
				<span className="mt-2 text-xs text-muted-foreground">Nicio plată încă azi.</span>
			)}
		</Card>
	);
}

function StillToday({ still, currency, onShowReady }) {
	const { cars, invoices } = still;
	return (
		<Card label="Mai poate intra azi">
			<Big>{formatMoney(still.total, currency, { decimals: 0 })}</Big>
			{still.total > 0 ? (
				<div className="mt-1.5 flex flex-col divide-y rounded-lg border">
					{cars.count > 0 && (
						<button type="button" onClick={onShowReady} className="flex min-h-11 items-center gap-2 px-3 text-left text-[13px] hover:bg-accent/50">
							<span className="size-2 rounded-full" style={{ background: STATE.ok }} aria-hidden />
							<span className="min-w-0 flex-1 truncate">{plural(cars.count, "mașină gata", "mașini gata")}</span>
							<span className="font-medium tabular-nums">{formatMoney(cars.amount, currency, { decimals: 0 })}</span>
							<ChevronRight className="size-4 text-muted-foreground" aria-hidden />
						</button>
					)}
					{invoices.count > 0 && (
						<Link href="/invoices/" className="flex min-h-11 items-center gap-2 px-3 text-[13px] hover:bg-accent/50">
							<span className="size-2 rounded-full" style={{ background: STATE.wait }} aria-hidden />
							<span className="min-w-0 flex-1 truncate">{plural(invoices.count, "factură scadentă", "facturi scadente")}</span>
							<span className="font-medium tabular-nums">{formatMoney(invoices.amount, currency, { decimals: 0 })}</span>
							<ChevronRight className="size-4 text-muted-foreground" aria-hidden />
						</Link>
					)}
				</div>
			) : (
				<span className="mt-1 text-xs text-muted-foreground">Nicio mașină gata și nicio factură scadentă azi.</span>
			)}
		</Card>
	);
}

/** The month so far, added up day by day, over the month before (dashed). Hover or focus shows a day's totals. */
function MonthChart({ month, today, currency }) {
	const [at, setAt] = useState(null);
	const W = 560;
	const H = 132;
	const days = Math.max(month.days, month.previousPoints.length);
	const top = Math.max(month.value, month.previousTotal, 1) * 1.08;
	const x = (i) => (i / Math.max(1, days - 1)) * W;
	const y = (v) => H - (v / top) * H;
	const path = (points) => points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
	const now = month.points.length - 1;
	const first = `${monthKey(today)}-01`;
	const previousFirst = addMonthsISO(first, -1);
	const pick = (event) => {
		const box = event.currentTarget.getBoundingClientRect();
		const i = Math.round(((event.clientX - box.left) / box.width) * (days - 1));
		setAt(Math.max(0, Math.min(days - 1, i)));
	};
	const shown = at ?? now;
	const day = (start, i) => fmtDate(addDaysISO(start, i), "d MMM");
	return (
		<div className="relative mt-2">
			<svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[132px] w-full overflow-visible" onPointerMove={pick} onPointerLeave={() => setAt(null)} aria-hidden>
				{[0.25, 0.5, 0.75, 1].map((t) => (
					<line key={t} x1="0" x2={W} y1={y((top / 1.08) * t)} y2={y((top / 1.08) * t)} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
				))}
				<path d={path(month.previousPoints)} fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" opacity="0.7" />
				<path d={`${path(month.points)}L${x(now)},${H}L0,${H}Z`} fill={AREA.rapoarte} opacity="0.1" />
				<path d={path(month.points)} fill="none" stroke={AREA.rapoarte} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
				<line x1={x(shown)} x2={x(shown)} y1="0" y2={H} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
			</svg>
			{/* The dots are HTML so they stay round on a stretched chart. */}
			{shown <= now && <span className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card" style={{ left: `${(x(shown) / W) * 100}%`, top: `${(y(month.points[shown]) / H) * 100}%`, background: AREA.rapoarte }} />}
			<div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground tabular-nums">
				<span>1 {fmtDate(today, "MMM")}</span>
				<span className="text-foreground">
					{shown <= now ? `${day(first, shown)}: ${formatMoney(month.points[shown], currency, { decimals: 0 })}` : day(first, shown)}
					{month.previousPoints[shown] != null && <span className="text-muted-foreground"> · {day(previousFirst, shown)}: {formatMoney(month.previousPoints[shown], currency, { decimals: 0 })}</span>}
				</span>
				<span>{days}</span>
			</div>
		</div>
	);
}

function Month({ month, today, currency }) {
	const name = fmtDate(today, "MMMM");
	const previousName = fmtDate(addMonthsISO(`${monthKey(today)}-01`, -1), "MMMM");
	return (
		<Card label={`${name.charAt(0).toUpperCase()}${name.slice(1)} până azi`} className="md:col-span-2">
			<div className="flex flex-wrap items-baseline justify-between gap-x-4">
				<Big>{formatMoney(month.value, currency, { decimals: 0 })}</Big>
				<Change change={month.change} against={`${formatMoney(month.previousToDate, currency, { decimals: 0 })} la aceeași zi din ${previousName}`} />
			</div>
			<MonthChart month={month} today={today} currency={currency} />
			<div className="flex gap-3 text-xs text-muted-foreground">
				<span className="inline-flex items-center gap-1.5">
					<span className="h-0.5 w-3 rounded" style={{ background: AREA.rapoarte }} aria-hidden /> {name}
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span className="h-0 w-3 border-t border-dashed border-muted-foreground" aria-hidden /> {previousName}, întreagă: {formatMoney(month.previousTotal, currency, { decimals: 0 })}
				</span>
			</div>
		</Card>
	);
}

export function MoneyRow({ takings, still, month, today, currency, onShowReady }) {
	return (
		<section aria-label="Bani" className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
			<Takings takings={takings} today={today} currency={currency} />
			<StillToday still={still} currency={currency} onShowReady={onShowReady} />
			<Month month={month} today={today} currency={currency} />
		</section>
	);
}
