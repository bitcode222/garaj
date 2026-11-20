"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { GripVertical, Plus } from "lucide-react";
import { MakeTile } from "@/components/ds/car";
import { SectionHeader } from "@/components/ds/blocks";
import { Segmented } from "@/components/ds/inputs";
import { InlineText } from "@/components/ds/inline-text";
import { fmtTime } from "@/lib/format";
import { formatPlate } from "@/domain/vehicle";
import { makeCover, makeInk } from "@/lib/colors";
import { openSheet } from "@/lib/sheets";
import { useLocalPreference } from "@/lib/hooks";
import { assignToLane, reorderTeam, saveBay, saveStaff } from "@/lib/store/actions";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { toMinutes } from "@/features/calendar/utils";
import { jobHeadline } from "@/features/work-orders/job-text";
import { LANE_KINDS, dayLanes, moveLane } from "./azi-data";

const BLOCK = "application/x-garaj-block";
const LANE = "application/x-garaj-lane";
const LABEL = 124; // px, the rows' names
const BY = [
	{ value: "bay", label: LANE_KINDS.bay.label },
	{ value: "staff", label: LANE_KINDS.staff.label },
];
// How many hours the lanes show at once; the rest is a sideways scroll (owner, 20 Nov 2026).
const SPANS = [
	{ value: "2", label: "2 h" },
	{ value: "4", label: "4 h" },
	{ value: "8", label: "8 h" },
	{ value: "all", label: "Toată ziua" },
];
// Who gets a lane in "Mecanici": the people who work on cars, not the front desk.
const ON_CARS = (person) => person.role !== "advisor";

const clock = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
const carName = (vehicle) => [vehicle?.make, vehicle?.model].filter(Boolean).join(" ");

/**
 * Azi's "Ziua în atelier" (owner, 20 Nov 2026): the day by lift or by mechanic. Rows are renamed in place, dragged by
 * their handle into a new order, and added at the bottom; a booking or a job is dragged onto another row to go to that
 * lift or mechanic (its time stays). The body pans with click and drag or a sideways scroll, and shows 2, 4 or 8 hours
 * at a time, or the whole day.
 */
export function DaySection({ bays, staff, appointments, workOrders, vehicles, settings, today, minute }) {
	const [by, setBy] = useLocalPreference("garaj.azi.lanes", "bay", ["bay", "staff"]);
	const [span, setSpan] = useLocalPreference("garaj.azi.span", "all", SPANS.map((s) => s.value));
	const kind = LANE_KINDS[by];
	const rows = by === "staff" ? Object.fromEntries(Object.entries(staff).filter(([, p]) => ON_CARS(p))) : bays;
	const lanes = dayLanes({ by, rows, appointments, workOrders, today, now: new Date().toISOString() });
	return (
		<section className="space-y-3" aria-label="Ziua în atelier">
			<SectionHeader title="Ziua în atelier" subtitle={`Ce e pe fiecare ${kind.one}; punctat, ce urmează din agendă`} href="/calendar/">
				<Segmented value={span} onValueChange={setSpan} options={SPANS} aria-label="Cât se vede" />
				<Segmented value={by} onValueChange={setBy} options={BY} aria-label="Rânduri" />
			</SectionHeader>
			<DayLanes by={by} lanes={lanes} vehicles={vehicles} settings={settings} minute={minute} span={span} />
		</section>
	);
}

function DayLanes({ by, lanes, vehicles, settings, minute, span }) {
	const kind = LANE_KINDS[by];
	const scroller = useRef(null);
	const pan = useRef(null);
	const [over, setOver] = useState(null); // the lane a card or a row is dragged over
	const [fresh, setFresh] = useState(null); // a row just added: its name opens as a field
	const from = Math.floor(toMinutes(settings.hours?.open ?? "08:00") / 60) * 60;
	const to = Math.ceil(toMinutes(settings.hours?.close ?? "18:00") / 60) * 60;
	const total = Math.max(60, to - from);
	const visible = span === "all" ? total : Math.min(total, Number(span) * 60);
	const at = (iso) => {
		const d = new Date(iso);
		return Math.min(100, Math.max(0, ((d.getHours() * 60 + d.getMinutes() - from) / total) * 100));
	};
	const hours = [];
	for (let m = from; m <= to; m += 60) hours.push(m);
	const now = ((minute - from) / total) * 100;
	const named = lanes.filter((lane) => lane.id);

	// A new window starts on now (or the opening hour), so the hours that matter are in view.
	useLayoutEffect(() => {
		const el = scroller.current;
		if (!el) return;
		const track = el.scrollWidth - LABEL;
		const left = Math.min(Math.max(now, 0), 100) / 100;
		el.scrollLeft = Math.max(0, track * left - (el.clientWidth - LABEL) / 3);
		showRange();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [span]);

	// The hours in view, in the top-left corner (owner, 20 Nov 2026): follows the scroll and the window's width.
	const [range, setRange] = useState(null);
	function showRange() {
		const el = scroller.current;
		if (!el) return;
		const track = el.scrollWidth - LABEL;
		const start = from + (el.scrollLeft / track) * total;
		const end = Math.min(to, start + ((el.clientWidth - LABEL) / track) * total);
		const round = (m) => Math.round(m / 5) * 5;
		setRange([round(start), round(end)]);
	}
	useLayoutEffect(() => {
		const el = scroller.current;
		if (!el) return undefined;
		const observer = new ResizeObserver(showRange);
		observer.observe(el);
		return () => observer.disconnect();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [from, to]);

	const save = by === "staff" ? saveStaff : saveBay;
	const rename = (lane, name) => {
		setFresh(null);
		try {
			save({ id: lane.id, name });
		} catch (error) {
			toast.error(error.message);
		}
	};
	const add = () => {
		try {
			const row = save({ name: kind.newName });
			setFresh(row.id);
		} catch (error) {
			toast.error(error.message);
		}
	};

	const dropOn = (lane) => (event) => {
		event.preventDefault();
		setOver(null);
		const laneId = event.dataTransfer.getData(LANE);
		if (laneId) {
			if (lane.id && laneId !== lane.id) reorderTeam(kind.collection, moveLane(named.map((l) => l.id), laneId, lane.id));
			return;
		}
		const raw = event.dataTransfer.getData(BLOCK);
		if (!raw) return;
		const block = JSON.parse(raw);
		if (block.laneId === lane.id) return;
		try {
			assignToLane({ appointmentId: block.appointmentId, workOrderId: block.workOrderId }, kind.field, lane.id);
			toast.success(lane.id ? `Mutat la ${lane.name}.` : `Scos de pe ${kind.one}.`);
		} catch (error) {
			toast.error(error.message);
		}
	};
	const dragOver = (lane) => (event) => {
		const types = event.dataTransfer.types;
		if (!types.includes(BLOCK) && !(types.includes(LANE) && lane.id)) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
		if (over !== (lane.id ?? "loose")) setOver(lane.id ?? "loose");
	};

	// Click and drag on the empty body pans it sideways (a mouse; touch and trackpads scroll on their own).
	const onPointerDown = (event) => {
		if (event.pointerType !== "mouse" || event.button !== 0 || event.target.closest("button, input, a, [draggable='true']")) return;
		pan.current = { x: event.clientX, left: scroller.current.scrollLeft, id: event.pointerId };
	};
	const onPointerMove = (event) => {
		const p = pan.current;
		if (!p || p.id !== event.pointerId) return;
		if (!p.moved && Math.abs(event.clientX - p.x) < 4) return;
		if (!p.moved) {
			p.moved = true;
			scroller.current.setPointerCapture(event.pointerId);
		}
		scroller.current.scrollLeft = p.left - (event.clientX - p.x);
	};
	const endPan = () => {
		pan.current = null;
	};

	return (
		<div
			ref={scroller}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={endPan}
			onScroll={showRange}
			onPointerCancel={endPan}
			className="overflow-x-auto overscroll-x-contain rounded-xl border bg-card select-none [scrollbar-width:thin]"
		>
			<div
				className={cn("grid grid-cols-[124px_minmax(0,1fr)]", span === "all" && "min-w-[720px]", "cursor-grab active:cursor-grabbing")}
				style={{ width: `calc(${LABEL}px + (100% - ${LABEL}px) * ${total / visible})` }}
			>
				<div className="sticky left-0 z-20 flex items-center bg-card px-3.5 text-[11px] font-medium text-muted-foreground tabular-nums" aria-live="polite">
					{range && `${clock(range[0])}–${clock(range[1])}`}
				</div>
				<div className="relative h-8 border-l">
					{hours.map((m) => (
						<span key={m} className="absolute top-2 -translate-x-1/2 text-[11px] text-muted-foreground tabular-nums first:translate-x-0" style={{ left: `${((m - from) / total) * 100}%` }}>
							{`${Math.floor(m / 60)}:00`}
						</span>
					))}
				</div>
				{lanes.map((lane) => {
					const key = lane.id ?? "loose";
					return (
						<div key={key} className="contents">
							<div
								onDragOver={dragOver(lane)}
								onDragLeave={() => setOver((current) => (current === key ? null : current))}
								onDrop={dropOn(lane)}
								className={cn("sticky left-0 z-20 flex h-16 cursor-default items-center gap-0.5 border-t bg-card pr-2 pl-1 text-[13px] font-medium", over === key && "bg-accent")}
							>
								{lane.id ? (
									<>
										<span
											draggable
											onDragStart={(event) => {
												event.dataTransfer.setData(LANE, lane.id);
												event.dataTransfer.effectAllowed = "move";
											}}
											aria-label={`Mută rândul ${lane.name}`}
											title="Trage ca să schimbi ordinea"
											className="flex h-8 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
										>
											<GripVertical className="size-4" aria-hidden />
										</span>
										<InlineText value={lane.name} label={`Numele (${kind.one})`} autoEdit={fresh === lane.id} onSave={(name) => rename(lane, name)} className="min-w-0 text-[13px]" />
									</>
								) : (
									<span className="truncate pl-1.5 text-muted-foreground">{lane.name}</span>
								)}
							</div>
							<div
								onDragOver={dragOver(lane)}
								onDragLeave={() => setOver((current) => (current === key ? null : current))}
								onDrop={dropOn(lane)}
								className={cn("relative h-16 border-t border-l transition-colors", over === key && "bg-accent/60")}
								style={{ backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent calc(${(60 / total) * 100}% - 1px), var(--border) calc(${(60 / total) * 100}% - 1px), var(--border) ${(60 / total) * 100}%)` }}
							>
								{lane.blocks.map((block) => (
									<Block key={block.key} block={block} lane={lane} vehicle={vehicles[block.order?.vehicleId ?? block.appointment?.vehicleId]} left={at(block.start)} right={at(block.end)} />
								))}
								{now >= 0 && now <= 100 && <span aria-hidden className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-[#ff3b30]" style={{ left: `${now}%` }} />}
							</div>
						</div>
					);
				})}
				<div className="sticky left-0 z-20 border-t bg-card p-1.5">
					<button type="button" onClick={add} className="flex h-9 w-full items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
						<Plus className="size-4" aria-hidden /> {by === "staff" ? "Mecanic" : "Elevator"}
					</button>
				</div>
				<div className="border-t border-l" />
			</div>
		</div>
	);
}

function Block({ block, lane, vehicle, left, right }) {
	const width = Math.max(4, right - left);
	const title = block.appointment ? [carName(vehicle), block.appointment.title].filter(Boolean).join(" · ") : jobHeadline(block.order);
	const open = () => (block.order ? openSheet("work-order-view", { id: block.order.id }) : openSheet("appointment-view", { id: block.appointment.id }));
	return (
		<button
			type="button"
			draggable
			onDragStart={(event) => {
				event.dataTransfer.setData(BLOCK, JSON.stringify({ appointmentId: block.appointment?.id ?? null, workOrderId: block.appointment ? null : block.order?.id, laneId: lane.id }));
				event.dataTransfer.effectAllowed = "move";
			}}
			onClick={open}
			title="Trage pe alt rând ca să o muți"
			className={cn("absolute top-2 bottom-2 flex min-w-0 cursor-pointer items-center gap-2 overflow-hidden rounded-[7px] px-2 text-left text-xs active:cursor-grabbing", block.planned && "border border-dashed border-foreground/25")}
			style={{
				left: `calc(${left}% + 2px)`,
				width: `calc(${width}% - 4px)`,
				// Planned: one grey dashed outline for every car; on the lift: the car's cover, as the atelier's cards.
				...(block.planned ? {} : { background: makeCover(vehicle?.make), color: makeInk(vehicle?.make) }),
			}}
		>
			<MakeTile make={vehicle?.make} size={22} reverse={!block.planned} />
			<span className="min-w-0">
				<span className="block truncate font-semibold">{title}</span>
				<span className={cn("block truncate", block.planned ? "text-muted-foreground" : "opacity-75")}>
					{[vehicle?.plate && formatPlate(vehicle.plate), block.running ? "în lucru acum" : `${fmtTime(block.start)}–${fmtTime(block.end)}`].filter(Boolean).join(" · ")}
				</span>
			</span>
		</button>
	);
}
