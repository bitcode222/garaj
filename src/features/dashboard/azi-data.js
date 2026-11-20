// What Azi shows (docs/DESIGN.md §4, Azi A and B), worked out from the collections. Pure: no store, no React.

import { dayOfInstant } from "../../domain/dates.js";
import { isRunning, runningEntry } from "../../domain/work-clock.js";
import { OPEN_STATUSES } from "../../domain/work-order.js";

// The cars in the shop, the ones being worked on first, then what waits, then what is ready.
const RANK = { in_progress: 0, approved: 1, waiting_parts: 2, estimate: 3, ready: 4 };

/** The open jobs, in the order of the shop floor: running first, then by stage, the most recently touched first. */
export function shopJobs(workOrders) {
	return Object.values(workOrders)
		.filter((o) => OPEN_STATUSES.includes(o.status))
		.sort((a, b) => Number(isRunning(b)) - Number(isRunning(a)) || RANK[a.status] - RANK[b.status] || String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
}

/** Azi's chips over the covers: which stages each one keeps. */
export const JOB_FILTERS = [
	{ value: "all", label: "Toate", keep: () => true },
	{ value: "work", label: "În lucru", keep: (o) => o.status === "in_progress" },
	{ value: "wait", label: "Așteaptă", keep: (o) => ["estimate", "approved", "waiting_parts"].includes(o.status) },
	{ value: "ready", label: "Gata", keep: (o) => o.status === "ready" },
];

/** Today's bookings, not called off, by their start. */
export function todaysBookings(appointments, today) {
	return Object.values(appointments)
		.filter((a) => a.status !== "cancelled" && a.start && dayOfInstant(a.start) === today)
		.sort((a, b) => a.start.localeCompare(b.start));
}

/** Milliseconds each mechanic worked today (the time logs, clipped to today; a running entry counts to `now`). */
export function hoursToday(workOrders, today, now) {
	const dayStart = new Date(`${today}T00:00:00`).getTime();
	const dayEnd = dayStart + 86_400_000;
	const byStaff = new Map();
	for (const order of Object.values(workOrders)) {
		for (const entry of order.timeLog ?? []) {
			const from = Math.max(Date.parse(entry.start), dayStart);
			const to = Math.min(Date.parse(entry.end ?? now), dayEnd, Date.parse(now));
			if (to <= from) continue;
			byStaff.set(entry.staffId ?? null, (byStaff.get(entry.staffId ?? null) ?? 0) + (to - from));
		}
	}
	const total = [...byStaff.values()].reduce((n, ms) => n + ms, 0);
	return { total, byStaff: [...byStaff.entries()].sort((a, b) => b[1] - a[1]) };
}

/** "9 h 40", "35 min". */
export function hoursText(ms) {
	const minutes = Math.round(ms / 60000);
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (!h) return `${m} min`;
	return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/** What the day's lanes can be: a lane per lift, or a lane per mechanic (owner, 20 Nov 2026). */
export const LANE_KINDS = {
	bay: { field: "bayId", collection: "bays", label: "Elevatoare", one: "elevator", loose: "Fără loc", newName: "Elevator nou" },
	staff: { field: "staffId", collection: "staff", label: "Mecanici", one: "mecanic", loose: "Fără mecanic", newName: "Mecanic nou" },
};

/**
 * Azi B: the day as lanes, one per lift (`by: "bay"`, the default) or per mechanic (`by: "staff"`). A booking is a
 * block from its start to its end, dashed while the car is not in yet; work logged on a job (a running clock included)
 * is a block where the job sits, unless its booking is already drawn. What has no lift (no mechanic) goes in a lane of
 * its own, last. `rows` are the bays or the staff, ordered by `order`.
 */
export function dayLanes({ by = "bay", rows, bays, appointments, workOrders, today, now }) {
	const kind = LANE_KINDS[by];
	const lanes = Object.values(rows ?? bays ?? {})
		.filter((r) => r.active !== false)
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name)))
		.map((row) => ({ id: row.id, name: row.name, blocks: [] }));
	const loose = { id: null, name: kind.loose, blocks: [] };
	const laneOf = (id) => lanes.find((lane) => lane.id === id) ?? loose;
	const drawn = new Set();
	for (const booking of todaysBookings(appointments, today)) {
		if (booking.status === "no_show") continue;
		const order = booking.workOrderId ? workOrders[booking.workOrderId] : null;
		if (order) drawn.add(order.id);
		laneOf(booking[kind.field]).blocks.push({
			key: booking.id,
			kind: "booking",
			appointment: booking,
			order,
			start: booking.start,
			end: booking.end ?? booking.start,
			planned: !["arrived", "done"].includes(booking.status),
			running: Boolean(order && isRunning(order)),
		});
	}
	const dayStart = `${today}T00:00:00`;
	for (const order of Object.values(workOrders)) {
		if (drawn.has(order.id)) continue;
		for (const entry of order.timeLog ?? []) {
			const end = entry.end ?? now;
			if (dayOfInstant(end) !== today && dayOfInstant(entry.start) !== today) continue;
			const start = dayOfInstant(entry.start) === today ? entry.start : new Date(dayStart).toISOString();
			laneOf(order[kind.field]).blocks.push({ key: entry.id ?? `${order.id}-${entry.start}`, kind: "work", order, start, end, planned: false, running: runningEntry(order) === entry });
		}
	}
	return loose.blocks.length ? [...lanes, loose] : lanes;
}

/** The lane ids after dragging `from` onto `to`'s place (the rest keep their order). */
export function moveLane(ids, from, to) {
	const list = ids.filter((id) => id !== from);
	const at = list.indexOf(to);
	if (from === to || at < 0 || !ids.includes(from)) return ids;
	list.splice(ids.indexOf(from) < ids.indexOf(to) ? at + 1 : at, 0, from);
	return list;
}
