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
