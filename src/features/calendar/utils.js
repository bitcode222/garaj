import { addDaysISO, addMonthsISO, parseISODate, pad2, toISODate } from "@/domain/dates";
import { fmtDate } from "@/lib/format";
import { APPOINTMENT_STATUS, SERVICE_CATEGORIES } from "@/lib/labels";

export const HOUR_PX = 72;
export const PX_PER_MIN = HOUR_PX / 60;
export const SNAP_MIN = 15;

/** Monday-first week containing `dateISO`. */
export function weekDays(dateISO) {
	const d = parseISODate(dateISO);
	const offset = (d.getDay() + 6) % 7;
	const monday = addDaysISO(dateISO, -offset);
	return Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i));
}

/** 6 × 7 Monday-first grid around the month of `dateISO`. */
export function monthGrid(dateISO) {
	const first = `${dateISO.slice(0, 7)}-01`;
	const start = weekDays(first)[0];
	return Array.from({ length: 42 }, (_, i) => addDaysISO(start, i));
}

export function navigate(view, dateISO, direction) {
	const step = direction === "next" ? 1 : -1;
	switch (view) {
		case "day":
			return addDaysISO(dateISO, step);
		case "week":
			return addDaysISO(dateISO, 7 * step);
		case "year":
			return addMonthsISO(dateISO, 12 * step);
		default:
			return addMonthsISO(dateISO, step);
	}
}

/** Inclusive ISO-date range shown by a view. */
export function viewRange(view, dateISO) {
	if (view === "day") return { from: dateISO, to: dateISO };
	if (view === "week") {
		const days = weekDays(dateISO);
		return { from: days[0], to: days[6] };
	}
	if (view === "year") return { from: `${dateISO.slice(0, 4)}-01-01`, to: `${dateISO.slice(0, 4)}-12-31` };
	const grid = view === "month" ? monthGrid(dateISO) : null;
	if (grid) return { from: grid[0], to: grid[41] };
	const first = `${dateISO.slice(0, 7)}-01`;
	return { from: first, to: addDaysISO(addMonthsISO(first, 1), -1) };
}

export function rangeLabel(view, dateISO) {
	if (view === "day") return fmtDate(dateISO, "EEEE, d MMMM yyyy");
	if (view === "week") {
		const days = weekDays(dateISO);
		return `${fmtDate(days[0], "d MMM")} – ${fmtDate(days[6], "d MMM yyyy")}`;
	}
	if (view === "year") return dateISO.slice(0, 4);
	return fmtDate(dateISO, "MMMM yyyy");
}

/** Local minutes since midnight of an ISO instant. */
export function minuteOfDay(instant) {
	const d = new Date(instant);
	return d.getHours() * 60 + d.getMinutes();
}

export function toMinutes(hhmm) {
	const [h, m] = hhmm.split(":").map(Number);
	return h * 60 + (m || 0);
}

/** ISO instant for `dateISO` at `minutes` after local midnight. */
export function atMinute(dateISO, minutes) {
	const d = parseISODate(dateISO);
	d.setHours(0, minutes, 0, 0);
	return d.toISOString();
}

/** Visible hours: working hours, stretched to include any event outside them. */
export function timeBounds(settings, events) {
	let start = Math.floor(toMinutes(settings.hours.open) / 60) * 60;
	let end = Math.ceil(toMinutes(settings.hours.close) / 60) * 60;
	for (const e of events) {
		start = Math.min(start, Math.floor(minuteOfDay(e.start) / 60) * 60);
		const endMin = toISODate(new Date(e.end)) !== toISODate(new Date(e.start)) ? 24 * 60 : minuteOfDay(e.end);
		end = Math.max(end, Math.ceil(endMin / 60) * 60);
	}
	return { start: Math.max(0, start), end: Math.min(24 * 60, Math.max(end, start + 60)) };
}

/**
 * Side-by-side layout for overlapping events: each event gets a lane and the
 * number of lanes in its overlap cluster.
 */
export function layoutEvents(events) {
	const sorted = [...events].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.end > b.end ? -1 : 1));
	const placed = [];
	let cluster = [];
	let clusterEnd = "";
	let laneEnds = [];
	const closeCluster = () => {
		const lanes = laneEnds.length;
		for (const item of cluster) item.lanes = lanes;
		cluster = [];
		laneEnds = [];
	};
	for (const event of sorted) {
		if (cluster.length && event.start >= clusterEnd) closeCluster();
		let lane = laneEnds.findIndex((end) => end <= event.start);
		if (lane === -1) {
			lane = laneEnds.length;
			laneEnds.push(event.end);
		} else {
			laneEnds[lane] = event.end;
		}
		const item = { event, lane, lanes: 1 };
		cluster.push(item);
		placed.push(item);
		clusterEnd = cluster.length === 1 ? event.end : event.end > clusterEnd ? event.end : clusterEnd;
	}
	closeCluster();
	return placed;
}

export function eventTone(appointment, colorBy, { staff, services }) {
	if (colorBy === "mechanic") return staff[appointment.staffId]?.color ?? "neutral";
	if (colorBy === "service") return SERVICE_CATEGORIES[services[appointment.serviceIds?.[0]]?.category]?.tone ?? "neutral";
	return APPOINTMENT_STATUS[appointment.status]?.tone ?? "blue";
}

export const hourLabel = (minutes) => `${pad2(Math.floor(minutes / 60))}:00`;
export const hhmm = (minutes) => `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
