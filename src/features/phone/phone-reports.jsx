"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageTitle } from "@/components/ds/blocks";
import { IosHeader, IosSegmented } from "@/components/ds/ios";
import { Page } from "@/components/ds/page";
import { NavGroup } from "@/components/ds/nav-bar";
import { formatMoney } from "@/domain/money";
import { IOS_AREA, STATE, TONE_COLOR } from "@/lib/colors";
import { fmtDate, fmtHours, fmtNumber, plural } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/labels";
import { cn } from "@/lib/utils";

// Rapoarte on the phone, as the iPhone's (ios-native/Garaj/Views/ReportsView.swift; docs/DESIGN.md "Telefon ca iPhone"):
// the period, four tiles, the revenue chart (touch to read a month) and its table, the best-selling operations, the
// mechanics, payments by method and what is left to collect. The web's "Activitate" stays on the desktop.

const LABOR = "var(--brand)";
const PARTS = IOS_AREA.programari;

function Section({ caps, footer, children, className }) {
	return (
		<section className="space-y-1.5" aria-label={caps}>
			{caps && <IosHeader title={caps} className="px-4" />}
			<div className={cn("overflow-hidden rounded-[20px] bg-card", className)}>{children}</div>
			{footer && <p className="px-4 text-[13px] text-muted-foreground">{footer}</p>}
		</section>
	);
}

function Tile({ label, value, detail }) {
	return (
		<div className="flex min-w-0 flex-col rounded-[20px] bg-card px-4 py-3.5">
			<span className="truncate text-[15px] text-muted-foreground">{label}</span>
			<span className="truncate text-[22px] leading-7 font-bold tabular-nums">{value}</span>
			<span className="truncate text-[13px] text-muted-foreground">{detail}</span>
		</div>
	);
}

/** 12500 → "12,5k" */
const short = (lei) => (lei >= 1000 ? `${fmtNumber(Math.round(lei / 100) / 10, 1).replace(/,0$/, "")}k` : fmtNumber(Math.round(lei), 0));

/** Stacked columns, labor and parts (+ fees); touch a column to read it, touch it again to let go. */
function RevenueChart({ rows, daily, label, currency }) {
	const [selected, setSelected] = useState(null);
	const totals = rows.map((r) => Math.max(0, r.labor) + Math.max(0, r.parts + r.fees));
	const top = Math.max(...totals, 0) / 100;
	const step = top <= 0 ? 1 : [1, 2, 2.5, 5, 10].map((m) => m * 10 ** Math.floor(Math.log10(top / 3))).find((s) => s * 3 >= top) ?? 10 ** Math.ceil(Math.log10(top));
	const max = step * 3 || 1;
	const ticks = [3, 2, 1, 0].map((i) => i * step);
	const picked = rows.find((r) => r.month === selected);
	const every = daily ? 5 : rows.length > 12 ? 2 : 1;
	const shows = (i) => (daily ? i === 0 || (i + 1) % every === 1 : i % every === 0);

	return (
		<div className="px-4 pt-3 pb-4">
			<div className="h-[52px]">
				{picked ? (
					<>
						<p className="text-[12px] text-muted-foreground first-letter:uppercase">{label(picked.month, true)}</p>
						<p className="text-[17px] font-semibold tabular-nums">{formatMoney(picked.net, currency)}</p>
						<p className="text-[12px] text-muted-foreground">
							manoperă {formatMoney(picked.labor, currency, { decimals: 0 })} · piese {formatMoney(picked.parts + picked.fees, currency, { decimals: 0 })}
						</p>
					</>
				) : (
					<>
						<p className="text-[12px] text-muted-foreground">Total în perioadă</p>
						<p className="text-[17px] font-semibold tabular-nums">{formatMoney(rows.reduce((s, r) => s + r.net, 0), currency)}</p>
						<p className="text-[12px] text-muted-foreground">Atinge graficul pentru o {daily ? "zi" : "lună"}.</p>
					</>
				)}
			</div>
			<div className="mt-4 flex h-[196px] gap-1.5" role="img" aria-label={`Venituri pe ${daily ? "zile" : "luni"}`}>
				<div className="relative mb-5 w-8 text-[11px] text-muted-foreground tabular-nums">
					{ticks.map((t, i) => (
						<span key={t} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>
							{short(t)}
						</span>
					))}
				</div>
				<div className="relative flex-1">
					<div className="absolute inset-x-0 top-0 bottom-5 flex flex-col justify-between" aria-hidden>
						{ticks.map((t) => (
							<div key={t} className="h-px bg-border" />
						))}
					</div>
					<div className="absolute inset-0 flex">
						{rows.map((r, i) => {
							const labor = Math.max(0, r.labor) / 100 / max;
							const parts = Math.max(0, r.parts + r.fees) / 100 / max;
							const dim = selected && selected !== r.month;
							return (
								<button key={r.month} type="button" onClick={() => setSelected(selected === r.month ? null : r.month)} aria-label={`${label(r.month, true)}: ${formatMoney(r.net, currency)}`} className="flex min-w-0 flex-1 flex-col items-center outline-none">
									<div className={cn("flex w-full flex-1 flex-col justify-end px-[18%] transition-opacity", daily && "px-[8%]", dim && "opacity-35")}>
										<div className="w-full rounded-t-[2px]" style={{ height: `${parts * 100}%`, background: PARTS }} />
										<div className={cn("w-full", parts ? "" : "rounded-t-[2px]")} style={{ height: `${labor * 100}%`, background: LABOR }} />
									</div>
									<span className="h-5 pt-1 text-[11px] leading-none text-muted-foreground">{shows(i) ? label(r.month, false) : ""}</span>
								</button>
							);
						})}
					</div>
				</div>
			</div>
			<ul className="mt-2 flex gap-4 text-[12px] text-muted-foreground">
				{[
					["Manoperă", LABOR],
					["Piese și materiale", PARTS],
				].map(([name, color]) => (
					<li key={name} className="flex items-center gap-1.5">
						<span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
						{name}
					</li>
				))}
			</ul>
		</div>
	);
}

function BarRow({ label, hint, value, share, tint }) {
	return (
		<li className="space-y-1.5 px-4 py-2.5">
			<div className="flex items-baseline gap-3">
				<span className="line-clamp-2 flex-1 text-[17px]">{label}</span>
				<span className="text-[15px] font-medium tabular-nums">{value}</span>
			</div>
			<div className="flex items-center gap-2">
				<div className="h-1.5 flex-1">
					<div className="h-full min-w-1 rounded-full" style={{ width: `${Math.min(1, Math.max(0, share)) * 100}%`, background: tint }} />
				</div>
				<span className="text-[12px] text-muted-foreground tabular-nums">{hint}</span>
			</div>
		</li>
	);
}

/** The ring of the three methods (inner radius 62 %, small gaps). */
function Donut({ parts, total }) {
	const r = 40;
	const c = 2 * Math.PI * r;
	const gap = 2;
	const starts = parts.map((_, i) => parts.slice(0, i).reduce((sum, p) => sum + (p.value / total) * c, 0));
	return (
		<svg viewBox="0 0 96 96" className="size-24 shrink-0 -rotate-90" aria-hidden>
			{parts.map((p, i) => {
				if (p.value <= 0) return null;
				const len = (p.value / total) * c;
				const dash = Math.max(0, len - (len > gap * 2 ? gap : 0));
				return <circle key={p.key} cx="48" cy="48" r={r} fill="none" stroke={p.color} strokeWidth="15" strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-starts[i]} />;
			})}
		</svg>
	);
}

function PaymentMix({ mix, currency }) {
	const parts = [
		{ key: "card", color: LABOR },
		{ key: "cash", color: PARTS },
		{ key: "transfer", color: IOS_AREA.facturi },
	].map((p) => ({ ...p, label: PAYMENT_METHODS[p.key]?.label ?? p.key, value: mix[p.key] ?? 0 }));
	const total = parts.reduce((s, p) => s + p.value, 0);
	if (total <= 0) return <p className="px-4 py-3 text-[17px] text-muted-foreground">Nicio plată în perioadă.</p>;
	return (
		<div className="flex items-center gap-4 px-4 py-3">
			<Donut parts={parts} total={total} />
			<ul className="flex-1 space-y-2">
				{parts.map((p) => (
					<li key={p.key} className="flex items-center gap-2">
						<span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
						<span className="flex-1 text-[17px]">{p.label}</span>
						<span className="text-right">
							<span className="block text-[15px] tabular-nums">{formatMoney(p.value, currency, { decimals: 0 })}</span>
							<span className="block text-[12px] text-muted-foreground tabular-nums">{Math.round((p.value / total) * 100)}%</span>
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}

/** "Pe luni" / "Pe zile": the rows newest first, a page pushed over Rapoarte. */
function RevenueTable({ open, onClose, rows, daily, label, currency }) {
	useEffect(() => {
		if (!open) return undefined;
		const onKey = (event) => event.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);
	if (!open || typeof document === "undefined") return null;
	return createPortal(
		<div role="dialog" aria-modal aria-label={daily ? "Pe zile" : "Pe luni"} className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-background pb-[calc(var(--safe-bottom)+2rem)]">
			<div className="sticky top-0 z-10 flex h-11 items-center gap-2 bg-background/85 px-4 backdrop-blur-xl" style={{ marginTop: "var(--safe-top)" }}>
				<NavGroup>
					<button type="button" onClick={onClose} aria-label="Înapoi" className="flex size-11 items-center justify-center rounded-full active:opacity-60">
						<ChevronLeft className="size-6" aria-hidden />
					</button>
				</NavGroup>
				<span className="pointer-events-none absolute inset-x-24 truncate text-center text-[17px] font-semibold">{daily ? "Pe zile" : "Pe luni"}</span>
			</div>
			<ul className="mx-4 mt-3 overflow-hidden rounded-[20px] bg-card [&>li+li]:border-t">
				{[...rows].reverse().map((r) => (
					<li key={r.month} className="space-y-1 px-4 py-2.5">
						<div className="flex items-baseline gap-3">
							<span className="flex-1 text-[17px] font-medium first-letter:uppercase">{label(r.month, true)}</span>
							<span className="text-[17px] font-semibold tabular-nums">{formatMoney(r.net, currency)}</span>
						</div>
						<div className="flex justify-between gap-3 text-[12px] text-muted-foreground tabular-nums">
							<span>Manoperă {formatMoney(r.labor, currency)}</span>
							<span>Piese și mat. {formatMoney(r.parts + r.fees, currency)}</span>
						</div>
					</li>
				))}
			</ul>
		</div>,
		document.body,
	);
}

/** `report`: what the web page computed (reports-page.jsx); `periods`, `period`, `onPeriod`: its period. */
export function PhoneReports({ report, periods, period, onPeriod, staff, currency }) {
	const [table, setTable] = useState(false);
	const { summary, rows, top, people, mix, aging, range } = report;
	const daily = period === "month";
	const label = (key, long) => (daily ? fmtDate(key, long ? "EEEE, d MMMM" : "d") : long ? fmtDate(`${key}-01`, "MMMM yyyy") : fmtDate(`${key}-01`, "MMM").charAt(0).toUpperCase());
	const money = (v) => formatMoney(v, currency, { decimals: 0 });
	const topMax = Math.max(...top.map((t) => t.revenue), 1);
	const peopleMax = Math.max(...people.map((p) => p.hours), 0);

	return (
		<Page width="narrow" className="space-y-6">
			<PageTitle title="Rapoarte" actions={null} />

			<div className="space-y-2">
				<IosSegmented options={periods} value={period} onChange={onPeriod} label="Perioadă" />
				<p className="px-4 text-[13px] text-muted-foreground">
					{fmtDate(range.from)} – {fmtDate(range.to)} · valori fără TVA
				</p>
			</div>

			<div className="grid grid-cols-2 gap-2.5">
				<Tile label="Venituri" value={money(summary.net)} detail={plural(summary.count, "factură", "facturi")} />
				<Tile label="Bon mediu" value={money(summary.avgTicket)} detail="per factură" />
				<Tile label="Marjă pe piese" value={`${fmtNumber(summary.partsMarginPct, 0)}%`} detail={`adaos ${money(summary.partsMargin)}`} />
				<Tile label="Manoperă facturată" value={fmtHours(Math.round(summary.hours))} detail={money(summary.labor)} />
			</div>

			<Section caps={daily ? "Venituri pe zile" : "Venituri pe luni"}>
				<RevenueChart rows={rows} daily={daily} label={label} currency={currency} />
				<button type="button" onClick={() => setTable(true)} className="flex min-h-11 w-full items-center border-t px-4 text-left text-[17px] active:bg-foreground/[0.06]">
					<span className="flex-1">{daily ? "Pe zile, în tabel" : "Pe luni, în tabel"}</span>
					<ChevronRight className="size-[18px] text-muted-foreground/60" strokeWidth={2.5} aria-hidden />
				</button>
			</Section>

			<Section caps="Cele mai vândute operațiuni" footer="După valoarea manoperei.">
				{top.length ? (
					<ul className="[&>li+li]:border-t">
						{top.map((t) => (
							<BarRow key={t.key} label={t.name} hint={`${t.count}×`} value={money(t.revenue)} share={t.revenue / topMax} tint={PARTS} />
						))}
					</ul>
				) : (
					<p className="px-4 py-3 text-[17px] text-muted-foreground">Nicio operațiune facturată în perioadă.</p>
				)}
			</Section>

			<Section caps="Mecanici" footer="Ore de manoperă facturate.">
				{people.length ? (
					<ul className="[&>li+li]:border-t">
						{people.map((p) => {
							const s = staff[p.staffId];
							return <BarRow key={p.staffId} label={s?.name ?? "—"} hint={money(p.revenue)} value={fmtHours(Math.round(p.hours * 10) / 10)} share={peopleMax > 0 ? p.hours / peopleMax : 0} tint={TONE_COLOR[s?.color] ?? STATE.off} />;
						})}
					</ul>
				) : (
					<p className="px-4 py-3 text-[17px] text-muted-foreground">Nicio manoperă alocată în perioadă.</p>
				)}
			</Section>

			<Section caps="Încasări pe metode">
				<PaymentMix mix={mix} currency={currency} />
			</Section>

			<Section caps="Creanțe la zi" footer={`Total de încasat: ${formatMoney(aging.total, currency)}.`}>
				<ul className="[&>li+li]:border-t">
					{[
						["În termen", STATE.ok, aging.current],
						["Restante 1–30 zile", STATE.wait, aging.d30],
						["Restante 31–60 zile", STATE.run, aging.d60],
						["Restante peste 60 zile", STATE.late, aging.d90],
					].map(([name, color, value]) => (
						<li key={name} className="flex min-h-11 items-center gap-2.5 px-4">
							<span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
							<span className="flex-1 text-[17px]">{name}</span>
							<span className={cn("text-[17px] tabular-nums", value > 0 ? "" : "text-muted-foreground")}>{formatMoney(value, currency)}</span>
						</li>
					))}
				</ul>
			</Section>

			<RevenueTable open={table} onClose={() => setTable(false)} rows={rows} daily={daily} label={label} currency={currency} />
		</Page>
	);
}
