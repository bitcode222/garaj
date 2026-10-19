"use client";

import { useEffect, useRef, useState } from "react";
import { Money } from "@/components/ds/data";
import { formatMoney } from "@/domain/money";
import { cn } from "@/lib/utils";

const compact = new Intl.NumberFormat("ro-RO", { notation: "compact", maximumFractionDigits: 1 });

function useWidth() {
	const ref = useRef(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
		observer.observe(el);
		return () => observer.disconnect();
	}, []);
	return [ref, width];
}

/** Clean axis maximum: 1, 2, 2.5 or 5 × 10^n above the data maximum. */
function niceMax(value) {
	if (value <= 0) return 1;
	const exp = 10 ** Math.floor(Math.log10(value));
	for (const step of [1, 2, 2.5, 5, 10]) if (step * exp >= value) return step * exp;
	return 10 * exp;
}

/** Column path with a 4px rounded data-end (top) and a square baseline. */
function columnPath(x, y, w, h, r = 4) {
	if (h <= 0) return "";
	const rr = Math.min(r, h, w / 2);
	return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/**
 * Stacked columns (two series). Legend always visible; the latest and the
 * highest total are labeled; hover/focus shows every series for that column.
 */
export function StackedColumns({ rows, series, formatLabel, height = 240, currency = "RON" }) {
	const [ref, width] = useWidth();
	const [active, setActive] = useState(null);
	const axisW = 44;
	const plotH = height - 28;
	const plotW = Math.max(0, width - axisW);
	const totals = rows.map((row) => series.reduce((sum, s) => sum + Math.max(0, s.value(row)), 0));
	const max = niceMax(Math.max(...totals, 0) / 100) * 100;
	const band = rows.length ? plotW / rows.length : 0;
	const barW = Math.max(4, Math.min(24, band * 0.6));
	const padTop = 18; // room for the top tick and the cap labels
	const y = (v) => plotH - (v / max) * (plotH - padTop);
	const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
	const peak = totals.indexOf(Math.max(...totals));
	const last = rows.length - 1;
	const labelEvery = Math.max(1, Math.ceil(30 / Math.max(band, 1)));

	return (
		<div className="viz">
			<ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
				{series.map((s) => (
					<li key={s.key} className="flex items-center gap-1.5">
						<span className="size-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
						{s.label}
					</li>
				))}
			</ul>
			<div ref={ref} className="relative w-full" style={{ height }}>
				{width > 0 && (
					<svg width={width} height={height} role="img" aria-label="Venituri pe perioade">
						{ticks.map((t) => (
							<g key={t}>
								<line x1={axisW} x2={width} y1={y(t) + 0.5} y2={y(t) + 0.5} stroke="var(--viz-grid)" strokeWidth="1" />
								<text x={axisW - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
									{compact.format(t / 100)}
								</text>
							</g>
						))}
						{rows.map((row, i) => {
							const x = axisW + i * band + (band - barW) / 2;
							let base = 0;
							const segments = series.map((s) => {
								const v = Math.max(0, s.value(row));
								const seg = { key: s.key, color: s.color, from: base, to: base + v };
								base += v;
								return seg;
							});
							const topIndex = segments.findLastIndex((seg) => seg.to > seg.from);
							return (
								<g key={row.month} opacity={active == null || active === i ? 1 : 0.55}>
									{segments.map((seg, k) => {
										if (seg.to <= seg.from) return null;
										const gapTop = k === topIndex ? 0 : 1;
										const gapBottom = k === 0 ? 0 : 1;
										const top = y(seg.to) + gapTop;
										const h = y(seg.from) - gapBottom - top;
										return k === topIndex ? (
											<path key={seg.key} d={columnPath(x, top, barW, h)} fill={seg.color} />
										) : (
											<rect key={seg.key} x={x} y={top} width={barW} height={Math.max(0, h)} fill={seg.color} />
										);
									})}
									{(i === last || i === peak) && totals[i] > 0 && (
										<text x={x + barW / 2} y={y(totals[i]) - 6} textAnchor="middle" className="fill-foreground text-[10px] font-medium">
											{compact.format(totals[i] / 100)}
										</text>
									)}
									{i % labelEvery === 0 && (
										<text x={x + barW / 2} y={plotH + 16} textAnchor="middle" className="fill-muted-foreground text-[10px]">
											{formatLabel(row.month)}
										</text>
									)}
									<rect
										x={axisW + i * band}
										y={0}
										width={band}
										height={plotH}
										fill="transparent"
										tabIndex={0}
										aria-label={`${formatLabel(row.month, true)}: ${formatMoney(totals[i], currency)}`}
										onPointerEnter={() => setActive(i)}
										onPointerLeave={() => setActive(null)}
										onFocus={() => setActive(i)}
										onBlur={() => setActive(null)}
										className="outline-none"
									/>
								</g>
							);
						})}
					</svg>
				)}
				{active != null && width > 0 && (
					<div
						className="pointer-events-none absolute top-0 z-10 w-44 rounded-lg border bg-popover p-2.5 text-xs shadow-lg"
						style={{ left: Math.min(Math.max(0, axisW + active * band + band / 2 - 88), width - 176) }}
					>
						<p className="font-semibold text-foreground">
							<Money value={totals[active]} currency={currency} />
						</p>
						<p className="mb-1.5 text-muted-foreground">{formatLabel(rows[active].month, true)}</p>
						{series.map((s) => (
							<p key={s.key} className="flex items-center justify-between gap-2">
								<span className="flex items-center gap-1.5 text-muted-foreground">
									<span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
									{s.label}
								</span>
								<Money value={s.value(rows[active])} currency={currency} className="font-medium" />
							</p>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

/** Horizontal bars, one series, value at the tip (values never hide behind hover). */
export function BarList({ items, format, className }) {
	const max = Math.max(...items.map((i) => i.value), 0) || 1;
	return (
		<ul className={cn("viz space-y-3", className)}>
			{items.map((item) => (
				<li key={item.key} className="group">
					<div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
						<span className="min-w-0 truncate">{item.label}</span>
						<span className="shrink-0 font-medium tabular-nums">{format(item.value)}</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="h-2.5 flex-1">
							<div
								className="h-full rounded-r-[4px] transition-[width,opacity] duration-500 group-hover:opacity-80"
								style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, background: "var(--viz-1)" }}
							/>
						</div>
						{item.hint && <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">{item.hint}</span>}
					</div>
				</li>
			))}
		</ul>
	);
}

/** Part-to-whole in one bar (≤ 3 slots), 2px surface gaps, legend with values. */
export function MixBar({ parts, currency = "RON" }) {
	const total = parts.reduce((s, p) => s + p.value, 0);
	const visible = parts.filter((p) => p.value > 0);
	return (
		<div className="viz space-y-3">
			<div className="flex h-3 gap-0.5 overflow-hidden rounded-[4px]" role="img" aria-label="Încasări pe metode de plată">
				{visible.map((p) => (
					<div key={p.key} style={{ width: `${(p.value / (total || 1)) * 100}%`, background: p.color }} title={`${p.label}: ${formatMoney(p.value, currency)}`} />
				))}
			</div>
			<ul className="space-y-1.5 text-sm">
				{parts.map((p) => (
					<li key={p.key} className="flex items-center gap-2">
						<span className="size-2.5 rounded-[3px]" style={{ background: p.color }} aria-hidden />
						<span className="flex-1 text-muted-foreground">{p.label}</span>
						<Money value={p.value} currency={currency} decimals={0} className="font-medium" />
						<span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{total ? Math.round((p.value / total) * 100) : 0}%</span>
					</li>
				))}
			</ul>
		</div>
	);
}

/**
 * A clean gridline step for four steps over `max`: 1, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 × 10^n, so the
 * axis reads 0 · 1,5 K · 3 K · 4,5 K · 6 K, never 1,3 K. `integer`: whole steps only (counts).
 */
function niceStep(max, integer = false) {
	const raw = Math.max(max, integer ? 1 : Number.EPSILON) / 4;
	const exp = 10 ** Math.floor(Math.log10(raw));
	for (const factor of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
		const step = factor * exp;
		if (step >= raw && (!integer || Number.isInteger(step))) return step;
	}
	return 10 * exp;
}

/** The line through the points, broken where there is no value (null). */
function linePaths(points, x, y) {
	const runs = [];
	let run = [];
	points.forEach((value, i) => {
		if (value == null) {
			if (run.length) runs.push(run);
			run = [];
		} else run.push([x(i), y(value)]);
	});
	if (run.length) runs.push(run);
	return runs;
}

/**
 * An area chart in the Cloudflare manner (docs/HOME-PAGE.md D9): one series, a 2 px line over a
 * faint fill, hairline gridlines with their values on the right. `bare` drops the grid and the
 * axes (the small cards' sparkline). Hover or focus on a point shows its day and value; the
 * latest point carries a marker. Points are numbers or null (no data that day: a gap).
 *   keys         one per point; `formatKey(key, long)` names it
 *   format       a value as text (axis, tooltip); `formatAxis` for the axis when shorter
 *   integer      the values are counts: whole gridlines only
 */
export function AreaChart({ points, keys, format, formatAxis = format, formatKey, label, height = 200, bare = false, integer = false }) {
	const [ref, width] = useWidth();
	const [active, setActive] = useState(null);
	const axisW = bare ? 0 : 44;
	const padTop = bare ? 8 : 10;
	const padBottom = bare ? 2 : 22;
	const plotW = Math.max(0, width - axisW);
	const plotH = height - padTop - padBottom;
	const values = points.filter((v) => v != null);
	const step = niceStep(Math.max(...values, 0), integer);
	const max = 4 * step;
	const band = points.length > 1 ? plotW / (points.length - 1) : 0;
	const x = (i) => (points.length > 1 ? i * band : plotW / 2);
	const y = (v) => padTop + plotH - (Math.max(0, v) / max) * plotH;
	const runs = linePaths(points, x, y);
	const ticks = [0, 1, 2, 3, 4].map((k) => k * step);
	const last = points.findLastIndex((v) => v != null);
	const labelAt = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);
	const id = `area-${label.replace(/\W+/g, "-")}`;

	return (
		<div ref={ref} className="viz relative w-full" style={{ height }}>
			{width > 0 && (
				<svg width={width} height={height} role="img" aria-label={label} className="overflow-visible">
					<defs>
						<linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
							<stop offset="0%" stopColor="var(--viz-1)" stopOpacity="0.18" />
							<stop offset="100%" stopColor="var(--viz-1)" stopOpacity="0" />
						</linearGradient>
					</defs>
					{!bare &&
						ticks.map((t) => (
							<g key={t}>
								<line x1={0} x2={plotW} y1={y(t) + 0.5} y2={y(t) + 0.5} stroke="var(--viz-grid)" strokeWidth="1" />
								<text x={plotW + 8} y={y(t)} dy="0.32em" className="fill-muted-foreground text-[10px] tabular-nums">
									{formatAxis(t)}
								</text>
							</g>
						))}
					{runs.map((run) => (
						<g key={run[0][0]}>
							<path d={`M${run[0][0]},${padTop + plotH}${run.map(([px, py]) => `L${px},${py}`).join("")}L${run.at(-1)[0]},${padTop + plotH}Z`} fill={`url(#${id})`} />
							<path d={run.map(([px, py], k) => `${k ? "L" : "M"}${px},${py}`).join("")} fill="none" stroke="var(--viz-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
						</g>
					))}
					{!bare &&
						points.map((_, i) =>
							labelAt.has(i) ? (
								<text key={keys[i]} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} className="fill-muted-foreground text-[10px]">
									{formatKey(keys[i])}
								</text>
							) : null,
						)}
					{active != null && <line x1={x(active)} x2={x(active)} y1={padTop} y2={padTop + plotH} stroke="var(--viz-grid)" strokeWidth="1" />}
					{[active ?? last].map((i) =>
						i >= 0 && points[i] != null ? <circle key="marker" cx={x(i)} cy={y(points[i])} r="4" fill="var(--viz-1)" stroke="var(--card)" strokeWidth="2" /> : null,
					)}
					{/* One band per point, for the pointer and the keyboard. */}
					{points.map((value, i) => (
						<rect
							key={keys[i]}
							x={Math.max(0, x(i) - band / 2)}
							y={0}
							width={points.length > 1 ? band : plotW}
							height={height}
							fill="transparent"
							tabIndex={bare ? -1 : 0}
							aria-label={`${formatKey(keys[i], true)}: ${value == null ? "fără date" : format(value)}`}
							onPointerEnter={() => setActive(i)}
							onPointerLeave={() => setActive(null)}
							onFocus={() => setActive(i)}
							onBlur={() => setActive(null)}
							className="outline-none"
						/>
					))}
				</svg>
			)}
			{active != null && width > 0 && (
				<div className="pointer-events-none absolute -top-2 z-10 w-36 -translate-y-full rounded-lg border bg-popover p-2 text-xs shadow-lg" style={{ left: Math.min(Math.max(0, x(active) - 72), width - 144) }}>
					<p className="font-semibold text-foreground tabular-nums">{points[active] == null ? "Fără date" : format(points[active])}</p>
					<p className="text-muted-foreground first-letter:uppercase">{formatKey(keys[active], true)}</p>
				</div>
			)}
		</div>
	);
}

/** No data: a faint wave behind a "Fără date" pill, never an empty box (Cloudflare's "No data"). */
export function NoData({ height = 120 }) {
	return (
		<div className="relative flex w-full items-center justify-center" style={{ height }}>
			<svg viewBox="0 0 200 60" preserveAspectRatio="none" className="absolute inset-0 h-full w-full text-muted-foreground/25" aria-hidden>
				<path d="M0,38 C20,30 30,44 50,36 S80,20 95,32 S120,48 140,30 S175,24 200,34" fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
			</svg>
			<span className="relative rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">Fără date</span>
		</div>
	);
}
