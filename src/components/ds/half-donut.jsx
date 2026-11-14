"use client";

import { useId } from "react";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

// The drawing, in its own units (it scales to its width): a half ring standing on its centre, with room over it for a
// part pointed at to move out.
const W = 200;
const R = 96;
const THICK = 20;
const LIFT = 4;
const CX = W / 2;
const CY = R + LIFT;
// Between two parts, 2 units at the middle of the ring (docs/DESIGN-SYSTEM.md §4, the surface gap).
const GAP = 2 / (R - THICK / 2);
// The smallest part's share of the half turn, so one in a hundred still shows.
const MIN = 0.07;

/** A point of the ring: `angle` from its left end (0) over the top to its right end (π). */
const at = (radius, angle) => [CX - radius * Math.cos(angle), CY - radius * Math.sin(angle)];

/** The ring from angle `a` to `b`, between the radii `inner` and `outer`. */
function sector(a, b, inner = R - THICK, outer = R) {
	const [x0, y0] = at(outer, a);
	const [x1, y1] = at(outer, b);
	const [x2, y2] = at(inner, b);
	const [x3, y3] = at(inner, a);
	return `M${x0} ${y0}A${outer} ${outer} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${inner} ${inner} 0 0 0 ${x3} ${y3}Z`;
}

/** The parts with something in them, in order, each with its angles: its share of the half turn, the smallest made visible. Green parts lead. */
function arcs(parts) {
	const shown = parts.filter((part) => part.value > 0).sort((a, b) => (b.tone === "green") - (a.tone === "green"));
	const sum = shown.reduce((total, part) => total + part.value, 0);
	if (!sum) return [];
	const raw = shown.map((part) => Math.max(MIN, (part.value / sum) * Math.PI));
	const scale = Math.PI / raw.reduce((total, angle) => total + angle, 0);
	let from = 0;
	return shown.map((part, index) => {
		const a = from;
		from += raw[index] * scale;
		// The gap is cut from the inside edges only: the ring's two ends stay flush with its base.
		return { part, a: index ? a + GAP / 2 : a, b: index < shown.length - 1 ? from - GAP / 2 : from, mid: (a + from) / 2 };
	});
}

/**
 * A section's parts as a half donut (docs/DESIGN-SYSTEM.md, Cards form): an arc per part in its state's colour
 * (hatched: only planned), from the left (green parts first, then in the chips' order), as big as its share of the whole (the smallest still
 * shows). In its hollow, the whole (`total`, or the sum of the values, over `unit`) or the part pointed at or kept:
 * its number over its name, in its colour. A tap on a part does what its chip does (`value`, `onChange`): only its
 * cards are kept and the others fade; a second tap clears it. The chips are the way there by keyboard, so the
 * arcs are not tab stops; the drawing's name says every part.
 *   parts    [{ key, label, tone, outline, value, display }]: `value` is what its arc measures (a count, an amount)
 *   pointed  the part under the pointer, shared with the chips (`onPoint`)
 */
export function HalfDonut({ parts, value = null, onChange, pointed = null, onPoint, total, unit, label, className }) {
	const hatch = `hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
	const drawn = arcs(parts);
	const shown = parts.find((part) => part.key === (pointed ?? value) && part.value > 0) ?? null;
	const said = parts
		.filter((part) => part.value > 0)
		.map((part) => `${part.label} ${part.display ?? part.value}`)
		.join(", ");
	return (
		<div className={cn("relative", className)}>
			<svg viewBox={`0 0 ${W} ${CY}`} role="img" aria-label={`${label}: ${said}`} className="block w-full overflow-visible">
				<defs>
					<pattern id={hatch} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
						<rect width="5" height="5" className="fill-muted" />
						<rect width="2" height="5" className="fill-muted-foreground/60" />
					</pattern>
				</defs>
				{!drawn.length && <path d={sector(0, Math.PI)} className="fill-muted" />}
				{drawn.map(({ part, a, b, mid }) => {
					const lifted = pointed === part.key;
					// Once a part is kept or pointed at, the rest step back.
					const faded = (value != null || pointed != null) && part.key !== value && part.key !== pointed;
					return (
						<g
							key={part.key}
							onClick={onChange ? () => onChange(value === part.key ? null : part.key) : undefined}
							onPointerEnter={onPoint ? () => onPoint(part.key) : undefined}
							onPointerLeave={onPoint ? () => onPoint(null) : undefined}
							className={cn("transition-[opacity,transform] duration-200 ease-out", onChange && "cursor-pointer", faded && "opacity-30")}
							style={lifted ? { transform: `translate(${-LIFT * Math.cos(mid)}px, ${-LIFT * Math.sin(mid)}px)` } : undefined}
						>
							<path d={sector(a, b)} className={part.outline ? undefined : tone(part.tone).fill} fill={part.outline ? `url(#${hatch})` : undefined} />
							{/* A finger's reach past the arc, inwards and out. */}
							<path d={sector(a, b, R - THICK - 12, R + LIFT)} fill="transparent" />
						</g>
					);
				})}
			</svg>
			<p aria-hidden className="pointer-events-none absolute inset-x-[16%] bottom-0 flex flex-col items-center text-center leading-none">
				<span className={cn("max-w-full truncate text-base font-semibold tabular-nums md:text-xl", shown ? tone(shown.tone).text : "text-foreground")}>
					{shown ? (shown.display ?? shown.value) : (total ?? parts.reduce((sum, part) => sum + part.value, 0))}
				</span>
				<span className="mt-1 max-w-full truncate text-2xs text-muted-foreground md:text-xs">{shown ? shown.label : unit}</span>
			</p>
		</div>
	);
}
