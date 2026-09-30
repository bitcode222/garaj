"use client";

import { useEffect, useRef, useState } from "react";
import { Initials } from "@/components/ds/data";
import { Plate } from "@/components/ds/plate";
import { ToneDot } from "@/components/ds/tone";
import { fmtTime } from "@/lib/format";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { HOUR_PX, PX_PER_MIN, SNAP_MIN, atMinute, hhmm, hourLabel, layoutEvents, minuteOfDay } from "./utils";

const snap = (minutes, step = SNAP_MIN) => Math.round(minutes / step) * step;

function useNowMinute() {
	const [now, setNow] = useState(null);
	useEffect(() => {
		const tick = () => {
			const d = new Date();
			setNow(d.getHours() * 60 + d.getMinutes());
		};
		tick();
		const timer = setInterval(tick, 60_000);
		return () => clearInterval(timer);
	}, []);
	return now;
}

/**
 * Day / week grid. Hour lines are a CSS background (no per-slot elements);
 * a click on empty space creates at that time; mouse drag moves, the bottom
 * edge resizes. Touch: tap to open (scrolling stays smooth).
 */
export function TimeGrid({ columns, eventsByColumn, bounds, toneOf, badge, lookups, onCreate, onOpen, onMove, minColumn = 120, overlap = "split" }) {
	const scrollerRef = useRef(null);
	const suppressClick = useRef(false);
	const [drag, setDrag] = useState(null);
	const now = useNowMinute();
	const height = (bounds.end - bounds.start) * PX_PER_MIN;
	const hours = [];
	for (let m = bounds.start; m < bounds.end; m += 60) hours.push(m);

	// Open at the current time (or the start of the day), once.
	useEffect(() => {
		const el = scrollerRef.current;
		if (!el) return;
		const target = now != null && now > bounds.start && now < bounds.end ? (now - bounds.start) * PX_PER_MIN - 80 : 0;
		el.scrollTop = Math.max(0, target);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [bounds.start, bounds.end]);

	const minuteAt = (clientY, rect) => bounds.start + (clientY - rect.top) / PX_PER_MIN;

	const beginDrag = (event, appointment, mode) => {
		if (event.pointerType !== "mouse" || event.button !== 0) return;
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		setDrag({
			id: appointment.id,
			mode,
			originY: event.clientY,
			start: minuteOfDay(appointment.start),
			end: minuteOfDay(appointment.end) || 24 * 60,
			column: columns.find((c) => eventsByColumn[c.key]?.some((e) => e.id === appointment.id))?.key,
			previewStart: null,
			previewEnd: null,
			previewColumn: null,
			moved: false,
			appointment,
		});
	};

	const moveDrag = (event) => {
		if (!drag) return;
		const dy = event.clientY - drag.originY;
		const delta = snap(dy / PX_PER_MIN);
		let previewColumn = drag.column;
		if (drag.mode === "move") {
			const under = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-col]");
			if (under) previewColumn = under.dataset.col;
		}
		const duration = drag.end - drag.start;
		const previewStart = drag.mode === "move" ? Math.min(Math.max(bounds.start, drag.start + delta), bounds.end - SNAP_MIN) : drag.start;
		const previewEnd = drag.mode === "move" ? previewStart + duration : Math.max(drag.start + SNAP_MIN, drag.end + delta);
		setDrag((d) => ({ ...d, previewStart, previewEnd, previewColumn, moved: d.moved || Math.abs(dy) >= 4 || previewColumn !== d.column }));
	};

	const endDrag = () => {
		if (!drag) return;
		const { moved, appointment, previewStart, previewEnd, previewColumn, column } = drag;
		setDrag(null);
		// A plain click falls through to the button's onClick; a drag must not also open it.
		if (!moved || previewStart == null) return;
		suppressClick.current = true;
		const target = columns.find((c) => c.key === (previewColumn ?? column));
		onMove(appointment, {
			start: atMinute(target.date, previewStart),
			end: atMinute(target.date, previewEnd),
			staffId: target.staffId,
		});
	};

	return (
		<div ref={scrollerRef} className="relative min-h-0 flex-1 overflow-auto overscroll-contain">
			<div className="grid min-w-full" style={{ gridTemplateColumns: `3.5rem repeat(${columns.length}, minmax(${minColumn}px, 1fr))` }}>
				{/* header */}
				<div className="sticky top-0 left-0 z-30 border-b bg-card" />
				{columns.map((column) => (
					<div key={column.key} className="sticky top-0 z-20 flex min-w-0 items-center justify-center gap-2 border-b border-l bg-card px-2 py-2">
						{column.header}
					</div>
				))}

				{/* hours gutter */}
				<div className="sticky left-0 z-10 bg-card" style={{ height }}>
					{hours.map((m, i) => (
						<div key={m} className="relative" style={{ height: HOUR_PX }}>
							<span className={cn("absolute right-2 text-2xs text-muted-foreground tabular-nums", i === 0 ? "top-0.5" : "-top-2")}>{hourLabel(m)}</span>
						</div>
					))}
				</div>

				{/* day columns */}
				{columns.map((column) => {
					const placed = layoutEvents(eventsByColumn[column.key] ?? []);
					const showNow = column.isToday && now != null && now >= bounds.start && now <= bounds.end;
					return (
						<div
							key={column.key}
							data-col={column.key}
							role="presentation"
							onClick={(e) => {
								if (e.target !== e.currentTarget) return;
								const rect = e.currentTarget.getBoundingClientRect();
								const minute = Math.floor(minuteAt(e.clientY, rect) / 30) * 30;
								onCreate({ start: atMinute(column.date, minute), staffId: column.staffId });
							}}
							className={cn("relative cursor-copy border-l", column.highlight && "bg-brand/[0.03]", column.muted && "bg-muted/40")}
							style={{
								height,
								backgroundImage:
									"linear-gradient(to bottom, var(--border) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklch, var(--border) 45%, transparent) 1px, transparent 1px)",
								backgroundSize: `100% ${HOUR_PX}px, 100% ${HOUR_PX / 2}px`,
							}}
						>
							{placed.map(({ event, lane, lanes }) => {
								const isDragged = drag?.id === event.id && drag.moved;
								// Dragged to another column: keep this node (it holds the pointer capture) but hide it.
								const ghost = isDragged && drag.previewColumn && drag.previewColumn !== column.key;
								const start = isDragged ? drag.previewStart : Math.max(minuteOfDay(event.start), bounds.start);
								const rawEnd = minuteOfDay(event.end) || 24 * 60;
								const end = isDragged ? drag.previewEnd : Math.min(rawEnd <= minuteOfDay(event.start) ? 24 * 60 : rawEnd, bounds.end);
								// split: equal lanes side by side (wide resource columns).
								// cascade: each overlapping event is indented and stays readable (narrow week columns).
								const left = overlap === "cascade" ? (lanes > 1 ? (lane * 100) / (lanes + 1) : 0) : (lane * 100) / lanes;
								const width = overlap === "cascade" ? (lanes > 1 ? Math.max(100 - left, 58) : 100) : 100 / lanes;
								return (
									<EventBlock
										key={event.id}
										appointment={event}
										top={(start - bounds.start) * PX_PER_MIN}
										height={Math.max(20, (end - start) * PX_PER_MIN - 2)}
										left={isDragged ? 0 : Math.min(left, 100 - width)}
										width={isDragged ? 100 : width}
										layer={overlap === "cascade" ? lane : 0}
										toneName={toneOf(event)}
										badge={badge}
										lookups={lookups}
										dragging={isDragged && !ghost}
										hidden={ghost}
										timeLabel={isDragged ? `${hhmm(start)}–${hhmm(end)}` : null}
										onPointerDown={(e) => beginDrag(e, event, "move")}
										onResizeDown={(e) => beginDrag(e, event, "resize")}
										onPointerMove={moveDrag}
										onPointerUp={endDrag}
										onOpen={() => {
											if (suppressClick.current) {
												suppressClick.current = false;
												return;
											}
											onOpen(event);
										}}
									/>
								);
							})}
							{drag?.moved && drag.previewColumn === column.key && !placed.some((p) => p.event.id === drag.id) && (
								<EventBlock
									appointment={drag.appointment}
									top={(drag.previewStart - bounds.start) * PX_PER_MIN}
									height={Math.max(20, (drag.previewEnd - drag.previewStart) * PX_PER_MIN - 2)}
									left={0}
									width={100}
									toneName={toneOf(drag.appointment)}
									badge={badge}
									lookups={lookups}
									dragging
								/>
							)}
							{showNow && (
								<div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-brand" style={{ top: (now - bounds.start) * PX_PER_MIN }}>
									<span className="absolute -top-[5px] -left-[5px] size-2 rounded-full bg-brand" />
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function EventBlock({ appointment: a, top, height, left, width, layer = 0, toneName, badge, lookups, dragging, hidden, timeLabel, onPointerDown, onResizeDown, onPointerMove, onPointerUp, onOpen }) {
	const vehicle = a.vehicleId ? lookups.vehicles[a.vehicleId] : null;
	const customer = lookups.customers[a.customerId];
	const mechanic = a.staffId ? lookups.staff[a.staffId] : null;
	const faded = a.status === "cancelled" || a.status === "no_show";
	const t = tone(toneName);
	return (
		<div
			className={cn("absolute z-10 p-px", dragging && "z-30", hidden && "opacity-0")}
			style={{ top, height, left: `${left}%`, width: `${width}%`, zIndex: dragging ? 30 : 10 + layer }}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
		>
			<button
				type="button"
				onPointerDown={onPointerDown}
				onClick={() => onOpen?.()}
				className={cn(
					"flex h-full w-full touch-manipulation flex-col overflow-hidden rounded-md border px-2 py-1 text-left text-xs select-none",
					badge === "dot" ? "border-border bg-card text-foreground shadow-xs hover:bg-accent" : t.block,
					layer > 0 && "shadow-sm ring-1 ring-card",
					faded && "line-through opacity-50",
					dragging && "cursor-grabbing opacity-90 shadow-lg ring-2 ring-brand/40",
					!dragging && "md:cursor-grab",
				)}
			>
				<span className="flex min-w-0 items-center gap-1.5">
					{badge === "dot" && <ToneDot tone={toneName} />}
					<span className="truncate font-semibold">{a.title || customer?.name || "Programare"}</span>
				</span>
				{height > 34 && (
					<span className="truncate tabular-nums opacity-80">
						{timeLabel ?? `${fmtTime(a.start)}–${fmtTime(a.end)}`}
						{customer ? ` · ${customer.name}` : ""}
					</span>
				)}
				{height > 64 && (
					<span className="mt-auto flex items-center gap-1.5 pt-1">
						{vehicle && <Plate value={vehicle.plate} size="sm" />}
						{mechanic && <Initials name={mechanic.name} tone={mechanic.color} size="sm" className="ml-auto size-5" />}
					</span>
				)}
			</button>
			{onResizeDown && (
				<span
					onPointerDown={onResizeDown}
					className="absolute inset-x-2 bottom-0 hidden h-2 cursor-ns-resize rounded-full md:block"
					aria-hidden
				/>
			)}
		</div>
	);
}
