"use client";

import { cn } from "@/lib/utils";
import { tone as toneOf } from "@/lib/tones";

// The visit bar (docs/VISIT-BAR.md, the sheet look the owner picked on 7 Nov 2026): every record of a visit in one row,
// each in its kind's colour, a ring for how far it got and a line under it. It only draws; what a tap does is the
// caller's (features/flow/visit-links.jsx), from the domain's visitBar().

const GAP = 6; // of the ring's 100, between two arcs

/**
 * A record's progress as a small full donut, one arc per step (`arcs` from visitBar: done · now · ahead · skipped ·
 * off), its kind's icon in the hollow. Done arcs take the kind's colour, the step it is on the kind's colour too, or
 * `nowTone`'s when its state asks for attention (amber, red); steps ahead are grey, a step passed over is faint, a
 * cancelled record is red all round. `exists` false: a dashed ring, the record not made yet.
 */
export function StatusRing({ arcs, kindTone, nowTone = null, exists = true, icon: Icon, size = 20, className }) {
	const r = 15.5;
	const n = arcs.length;
	const gap = n > 1 ? GAP : 0;
	const len = (100 - n * gap) / n;
	const colour = (arc) => {
		if (arc === "off") return "text-destructive";
		if (arc === "ahead") return "text-border";
		if (arc === "now" && nowTone) return toneOf(nowTone).text;
		return cn(toneOf(kindTone).text, arc === "skipped" && "opacity-35");
	};
	return (
		<span className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }} aria-hidden>
			<svg viewBox="0 0 36 36" className="absolute inset-0 size-full -rotate-90">
				{exists ? (
					arcs.map((arc, i) => (
						<circle
							key={i}
							cx="18"
							cy="18"
							r={r}
							fill="none"
							stroke="currentColor"
							strokeWidth="4"
							pathLength="100"
							strokeDasharray={`${len} ${100 - len}`}
							strokeDashoffset={-(i * (len + gap) + gap / 2)}
							className={colour(arc)}
						/>
					))
				) : (
					<circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeWidth="3" pathLength="100" strokeDasharray="5 5" className={cn(toneOf(kindTone).text, "opacity-60")} />
				)}
			</svg>
			{Icon && <Icon className={cn("relative", toneOf(kindTone).text)} style={{ width: size * 0.45, height: size * 0.45 }} strokeWidth={2.5} />}
		</span>
	);
}

/**
 * The bar. `sections`: [{ key, label, icon, tone, exists, current, arcs, nowTone, title, disabled, faint }], in the
 * visit's order; `onTap(section)`. The record open is `current`: its name semibold, its line thicker. A record not made
 * yet has a dashed line (faint when it cannot be made yet). Where five names do not fit (a phone), only the current
 * one keeps its name; the others keep icon, ring and line, and their name in `title` and for screen readers.
 */
export function VisitBar({ sections, onTap, busy = null, className }) {
	return (
		<nav aria-label="Vizita" className={cn("@container", className)}>
			<ol className="flex gap-1.5">
				{sections.map((s) => (
					<li key={s.key} className={cn("min-w-0 flex-1", !s.current && "@max-[34rem]:flex-[0_0_auto]")}>
						<button
							type="button"
							onClick={() => onTap?.(s)}
							disabled={busy === s.key}
							aria-current={s.current ? "page" : undefined}
							aria-disabled={s.disabled || undefined}
							aria-label={s.title}
							title={s.title}
							className={cn(
								"group flex min-h-11 w-full min-w-0 flex-col justify-center gap-1.5 rounded-md px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
								s.disabled ? "cursor-default" : !s.current && "hover:bg-accent/60",
								s.faint && "opacity-55",
								busy === s.key && "animate-pulse",
							)}
						>
							<span className={cn("flex min-w-0 items-center gap-1.5 text-sm", toneOf(s.tone).text, s.current ? "font-semibold" : "font-medium")}>
								<StatusRing arcs={s.arcs} kindTone={s.tone} nowTone={s.nowTone} exists={s.exists} icon={s.icon} />
								<span className={cn("truncate", !s.current && "@max-[34rem]:sr-only")}>{s.label}</span>
							</span>
							<span
								aria-hidden
								className={cn(
									"block w-full rounded-full",
									s.exists ? cn(toneOf(s.tone).solid, s.current ? "h-[3px]" : "h-0.5") : cn("h-0 border-t-2 border-dashed", toneOf(s.tone).border),
								)}
							/>
						</button>
					</li>
				))}
			</ol>
		</nav>
	);
}
