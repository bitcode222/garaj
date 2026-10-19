"use client";

import { useEffect, useRef, useState } from "react";
import { GripHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocalPreference } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const MARGIN = 8;
const MIN = { width: 248, height: 268 };
const MAX = { width: 560, height: 560 };
const DEFAULT = { right: 16, bottom: 16, width: 272, height: 300 };

function parse(text) {
	try {
		const box = JSON.parse(text);
		return ["right", "bottom", "width", "height"].every((k) => Number.isFinite(box?.[k])) ? box : DEFAULT;
	} catch {
		return DEFAULT;
	}
}

const clampTo = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high));

/** The box kept inside an area of `area` px: its size within the limits, its corner never off the edges. */
function fit(box, area) {
	const width = clampTo(box.width, MIN.width, Math.min(MAX.width, area.width - 2 * MARGIN));
	const height = clampTo(box.height, MIN.height, Math.min(MAX.height, area.height - 2 * MARGIN));
	return { width, height, right: clampTo(box.right, MARGIN, area.width - width - MARGIN), bottom: clampTo(box.bottom, MARGIN, area.height - height - MARGIN) };
}

/**
 * The mini calendar floating over the calendar (desktop): moved by its top bar, resized by its
 * corner, closed by ✕ (the header brings it back). It keeps to the bottom-right of the calendar
 * by default and is remembered where it was left, always kept inside the calendar's area (a
 * narrower window or the sidebar opening moves it in). `area`: the element it floats over.
 */
export function FloatingMonth({ area, onClose, children }) {
	const [stored, setStored] = useLocalPreference("garaj.calendar.mini", JSON.stringify(DEFAULT));
	const [size, setSize] = useState(null); // the area's size
	const [live, setLive] = useState(null); // the box while it is moved or resized (saved on release)
	const [kind, setKind] = useState(null); // "move" · "resize", while one goes on
	const gesture = useRef(null);

	useEffect(() => {
		const el = area.current;
		if (!el) return;
		const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	}, [area]);

	if (!size) return null;
	const box = fit(live ?? parse(stored), size);

	const begin = (which, event) => {
		if (event.button !== 0 || event.target.closest("button")) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		gesture.current = { kind: which, x: event.clientX, y: event.clientY, box, last: box };
		setKind(which);
		setLive(box);
	};
	const move = (event) => {
		const g = gesture.current;
		if (!g) return;
		const dx = event.clientX - g.x;
		const dy = event.clientY - g.y;
		// Moving: the corner it keeps to follows the pointer. Resizing by the bottom-right corner: the top-left stays put.
		const next = g.kind === "move" ? { ...g.box, right: g.box.right - dx, bottom: g.box.bottom - dy } : { width: g.box.width + dx, height: g.box.height + dy, right: g.box.right - dx, bottom: g.box.bottom - dy };
		if (g.kind === "resize") {
			const width = clampTo(next.width, MIN.width, MAX.width);
			const height = clampTo(next.height, MIN.height, MAX.height);
			next.right = g.box.right - (width - g.box.width);
			next.bottom = g.box.bottom - (height - g.box.height);
			next.width = width;
			next.height = height;
		}
		g.last = fit(next, size);
		setLive(g.last);
	};
	const startMove = (event) => begin("move", event);
	const startResize = (event) => begin("resize", event);
	const end = () => {
		const g = gesture.current;
		if (!g) return;
		gesture.current = null;
		setStored(JSON.stringify(g.last));
		setKind(null);
		setLive(null);
	};

	return (
		<div
			data-floating-month
			className={cn("absolute z-40 flex flex-col overflow-hidden rounded-xl border bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-sm", kind && "select-none")}
			style={{ right: box.right, bottom: box.bottom, width: box.width, height: box.height }}
		>
			{/* The bar it is moved by. */}
			<div
				onPointerDown={startMove}
				onPointerMove={move}
				onPointerUp={end}
				onPointerCancel={end}
				className={cn("flex h-8 shrink-0 touch-none items-center gap-1.5 border-b pr-1 pl-2.5 text-2xs font-medium text-muted-foreground", kind === "move" ? "cursor-grabbing" : "cursor-grab")}
				title="Trage ca să muți minicalendarul"
			>
				<GripHorizontal className="size-3.5" aria-hidden />
				<span className="flex-1">Minicalendar</span>
				<Button variant="ghost" size="icon-sm" className="size-6" onClick={onClose} aria-label="Închide minicalendarul" title="Închide minicalendarul">
					<X className="size-3.5" />
				</Button>
			</div>
			<div className="min-h-0 flex-1 p-2.5">{children}</div>
			{/* The corner it is resized by. */}
			<div
				onPointerDown={startResize}
				onPointerMove={move}
				onPointerUp={end}
				onPointerCancel={end}
				aria-hidden
				title="Trage ca să redimensionezi"
				className="absolute right-0 bottom-0 size-4 cursor-nwse-resize touch-none"
			>
				<svg viewBox="0 0 10 10" className="absolute right-1 bottom-1 size-2.5 text-muted-foreground/70">
					<path d="M9 3 3 9M9 6 6 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
				</svg>
			</div>
		</div>
	);
}
