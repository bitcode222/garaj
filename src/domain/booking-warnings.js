import { findConflicts, isActiveAppointment, overlaps } from "./appointment.js";
import { addDaysISO, combineDateTime, dayOfInstant, diffDaysISO, minutesBetween, pad2, parseISODate, timeOfInstant } from "./dates.js";
import { deadline } from "./vehicle.js";
import { arrivalDelay } from "./visit.js";

// What needs attention on a booking and on the job it became (docs/WARNINGS.md): each
// warning says exactly what (its facts) and how to fix it (its fixes, as ids with their
// parameters). No words here: the screens word them. Most urgent first.
//
//   { kind, severity: "danger" | "warning" | "info", ...facts, fixes: [{ id, ...params }] }

/** Minutes past the booked (or announced) time before a car that has not come counts as late. */
export const LATE_GRACE_MIN = 15;
const STEP = 15;

const SEVERITY = { danger: 0, warning: 1, info: 2 };
export const WARNING_KINDS = ["missed", "late", "overlap", "delayOverrun", "unassigned", "unconfirmed", "closed", "pickup", "parts", "estimate", "overrun", "documents", "noPhone"];
const CONTACT_KINDS = ["missed", "late", "unconfirmed"];

const addMinutes = (instant, minutes) => new Date(new Date(instant).getTime() + minutes * 60_000).toISOString();
const toMinutes = (hhmm) => {
	const [h, m] = String(hhmm).split(":").map(Number);
	return (h || 0) * 60 + (m || 0);
};
const hhmm = (minutes) => `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
const minuteOf = (instant) => toMinutes(timeOfInstant(instant));
const isAhead = (a) => a.status === "scheduled" || a.status === "confirmed";
const byStart = (a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
const isOpenDay = (day, hours) => (hours?.days ?? [0, 1, 2, 3, 4, 5, 6]).includes(parseISODate(day).getDay());

/** The first instant from `now` on a whole `step` of minutes (a quarter of an hour by default). */
const roundUp = (now, step = STEP) => {
	const d = new Date(now);
	d.setSeconds(0, 0);
	d.setMinutes(Math.ceil(d.getMinutes() / step) * step);
	return d.toISOString();
};

/**
 * The free slot of the booking's length on `day` (its own by default) closest to its current time
 * (the smallest change; a tie goes to the later one): from the later of now (rounded up to 15 min)
 * and the opening, in 15-minute steps, ending by the closing, clear of the same mechanic's and the
 * same elevator's bookings in `candidates`. null when none (or the day is closed or past).
 */
export function freeSlot(appointment, candidates, { now, hours, day = dayOfInstant(appointment.start) }) {
	const today = dayOfInstant(now);
	if (day < today || !isOpenDay(day, hours)) return null;
	const length = minutesBetween(appointment.start, appointment.end);
	const open = toMinutes(hours?.open ?? "00:00");
	const close = toMinutes(hours?.close ?? "24:00");
	const from = day === today ? Math.max(open, Math.ceil(minuteOf(now) / STEP) * STEP) : open;
	const wanted = minuteOf(appointment.start);
	const starts = [];
	for (let m = from; m + length <= close; m += STEP) starts.push(m);
	starts.sort((x, y) => Math.abs(x - wanted) - Math.abs(y - wanted) || y - x);
	for (const m of starts) {
		const start = combineDateTime(day, hhmm(m));
		if (start === appointment.start) continue;
		const end = addMinutes(start, length);
		if (findConflicts({ ...appointment, status: "scheduled", start, end }, candidates).length === 0) return { start, end };
	}
	return null;
}

/** Active people (or elevators) with nothing active overlapping the booking, least booked that day first. */
function freeOf(field, appointment, candidates, list, limit) {
	const busy = (id) => candidates.some((o) => o.id !== appointment.id && isActiveAppointment(o) && o[field] === id && overlaps(o, appointment));
	const load = (id) => candidates.filter((o) => o[field] === id && isActiveAppointment(o)).length;
	return list
		.filter((item) => item.active !== false && item.id !== appointment[field] && !busy(item.id))
		.sort((a, b) => load(a.id) - load(b.id))
		.slice(0, limit)
		.map((item) => item.id);
}

/** Mechanics free for the whole booking (ids), least booked that day first. */
export const freeStaff = (appointment, candidates, staff, limit = 2) => freeOf("staffId", appointment, candidates, staff, limit);
/** Elevators free for the whole booking (ids). */
export const freeBays = (appointment, candidates, bays, limit = 1) => freeOf("bayId", appointment, candidates, bays, limit);

const lastReason = (order, to) => [...(order.activity ?? [])].reverse().find((entry) => entry.type === "status" && entry.to === to)?.reason ?? "";
const sorted = (list) => list.sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity] || WARNING_KINDS.indexOf(a.kind) - WARNING_KINDS.indexOf(b.kind));
const brief = (o) => ({ id: o.id, start: o.start, end: o.end, title: o.title ?? "", vehicleId: o.vehicleId ?? null, customerId: o.customerId ?? null, staffId: o.staffId ?? null, bayId: o.bayId ?? null, status: o.status });

/**
 * A job's warnings: ready but not picked up (1 day+), waiting for parts (2 days+), an estimate
 * not approved (1 day+), and, today, a job that ran past its booking (with the mechanic's next
 * booking). `appointment` is the booking it came from, if any; `sameDay` that day's bookings.
 */
export function jobWarnings(order, { now, appointment = null, sameDay = [] } = {}) {
	const out = [];
	const today = dayOfInstant(now);
	const daysSince = (instant) => (instant ? Math.max(0, diffDaysISO(dayOfInstant(instant), today)) : 0);
	if (order.status === "ready") {
		const days = daysSince(order.dates?.ready);
		if (days >= 1) out.push({ kind: "pickup", severity: "warning", days, fixes: [{ id: "notifyReady" }, { id: "openJob" }] });
	}
	if (order.status === "waiting_parts") {
		const days = daysSince(order.dates?.waiting_parts);
		if (days >= 2) out.push({ kind: "parts", severity: "warning", days, what: lastReason(order, "waiting_parts"), fixes: [{ id: "partsArrived" }, { id: "openJob" }] });
	}
	if (order.status === "estimate") {
		const days = daysSince(order.dates?.estimate ?? order.createdAt);
		if (days >= 1) out.push({ kind: "estimate", severity: "warning", days, fixes: [{ id: "approve" }, ...(order.lines?.length ? [{ id: "sendEstimate" }] : []), { id: "openJob" }] });
	}
	if (appointment && ["estimate", "approved", "in_progress"].includes(order.status) && dayOfInstant(appointment.start) === today && appointment.end < now) {
		const minutes = minutesBetween(appointment.end, now);
		if (minutes >= LATE_GRACE_MIN) {
			const next = appointment.staffId ? sameDay.filter((o) => o.id !== appointment.id && o.staffId === appointment.staffId && isAhead(o) && o.start >= appointment.end).sort(byStart)[0] : null;
			const from = roundUp(now);
			out.push({
				kind: "overrun",
				severity: "warning",
				minutes,
				end: appointment.end,
				next: next ? brief(next) : null,
				fixes: [{ id: "extend", end: addMinutes(from, 30) }, { id: "extend", end: addMinutes(from, 60) }, ...(order.status === "in_progress" ? [{ id: "ready" }] : [])],
			});
		}
	}
	return sorted(out);
}

/**
 * Everything that needs attention on a booking, most urgent first (docs/WARNINGS.md).
 *   now       ISO instant
 *   order     the job it became, if any
 *   sameDay   every booking of its day (the calendar's filters do not apply)
 *   bookingsOn(day)  bookings of another day (for a free slot when its own day is closed)
 *   staff     the active mechanics · bays: the active elevators
 *   customer, vehicle, hours ({ open, close, days })
 *   light     the cards' summary: no fix search, no info-level warnings
 */
export function bookingWarnings(appointment, ctx) {
	const { now, order = null, sameDay = [], bookingsOn = null, staff = [], bays = [], customer = null, vehicle = null, hours = null, light = false } = ctx;
	const a = appointment;
	if (a.status === "cancelled" || a.status === "no_show" || a.status === "done") return [];
	const out = [];
	const add = (kind, severity, facts, fixes) => out.push({ kind, severity, ...facts, fixes: light ? [] : fixes });
	const ahead = isAhead(a);
	const past = a.end < now;
	const today = dayOfInstant(now);
	const day = dayOfInstant(a.start);
	const length = minutesBetween(a.start, a.end);
	const phone = Boolean(customer?.phone);
	const announced = Boolean(a.expectedAt && a.expectedAt > a.start);

	// Its time is over and nothing was recorded: the loose end, however old.
	if (ahead && past) add("missed", "danger", { day, start: a.start, end: a.end }, [{ id: "checkin" }, { id: "no_show" }, { id: "reschedule" }]);

	if (ahead && !past) {
		const late = arrivalDelay(a, now, LATE_GRACE_MIN);
		if (late > 0) {
			add("late", "danger", { minutes: late, since: announced ? a.expectedAt : a.start, announced }, [
				...(phone ? [{ id: "call" }] : []),
				{ id: "checkin" },
				{ id: "delayBy", minutes: 15, expectedAt: roundUp(addMinutes(now, 15), 5) },
				{ id: "delayBy", minutes: 30, expectedAt: roundUp(addMinutes(now, 30), 5) },
				{ id: "no_show" },
			]);
		}
		if (announced && a.expectedAt > now && a.expectedAt >= a.end) add("delayOverrun", "warning", { expectedAt: a.expectedAt, end: a.end }, [{ id: "moveTo", start: a.expectedAt, end: addMinutes(a.expectedAt, length) }]);
	}

	// Overlaps still to come: same mechanic or same elevator.
	if ((ahead && !past) || a.status === "arrived") {
		const conflicts = findConflicts(a, sameDay)
			.filter((o) => o.end > now && o.status !== "done")
			.sort(byStart);
		if (conflicts.length) {
			const withList = conflicts.map((o) => {
				const staffToo = Boolean(a.staffId && o.staffId === a.staffId);
				const bayToo = Boolean(a.bayId && o.bayId === a.bayId);
				return { ...brief(o), reason: staffToo && bayToo ? "both" : staffToo ? "staff" : "bay" };
			});
			const fixes = [];
			if (!light) {
				if (ahead) {
					const slot = freeSlot(a, sameDay, { now, hours });
					if (slot) fixes.push({ id: "moveTo", ...slot });
				} else {
					// The car is already in: the booking still to come is the one that moves.
					const other = conflicts.find(isAhead);
					const slot = other ? freeSlot(other, sameDay, { now, hours }) : null;
					if (slot) fixes.push({ id: "moveOther", appointmentId: other.id, ...slot });
				}
				// Or the same time with someone else, or on another elevator (also for a car already in).
				if (withList.some((w) => w.reason !== "bay")) for (const staffId of freeStaff(a, sameDay, staff, 1)) fixes.push({ id: "assign", staffId });
				if (withList.some((w) => w.reason !== "staff")) for (const bayId of freeBays(a, sameDay, bays, 1)) fixes.push({ id: "bay", bayId });
				fixes.push({ id: "open", appointmentId: conflicts[0].id });
			}
			add("overlap", "warning", { with: withList }, fixes);
		}
	}

	if (ahead && !past && staff.length > 0 && !staff.some((s) => s.id === a.staffId)) {
		add("unassigned", "warning", { inactiveId: a.staffId ?? null }, light ? [] : [...freeStaff({ ...a, staffId: null }, sameDay, staff, 2).map((staffId) => ({ id: "assign", staffId })), { id: "edit" }]);
	}

	if (a.status === "scheduled" && a.start > now && (day === today || day === addDaysISO(today, 1))) {
		add("unconfirmed", "warning", { start: a.start, when: day === today ? "today" : "tomorrow" }, [{ id: "confirm" }, ...(phone ? [{ id: "remind" }, { id: "call" }] : [])]);
	}

	if (ahead && !past && hours) {
		const closedDay = !isOpenDay(day, hours);
		const outside = !closedDay && (minuteOf(a.start) < toMinutes(hours.open) || dayOfInstant(a.end) !== day || minuteOf(a.end) > toMinutes(hours.close));
		if (closedDay || outside) {
			let slot = null;
			if (!light) {
				for (let i = 0; i < 14 && !slot; i++) {
					const d = addDaysISO(day, i);
					slot = freeSlot(a, d === day ? sameDay : (bookingsOn?.(d) ?? []), { now, hours, day: d });
				}
			}
			add("closed", "warning", { closedDay, open: hours.open, close: hours.close }, slot ? [{ id: "moveTo", ...slot }, { id: "reschedule" }] : [{ id: "reschedule" }]);
		}
	}

	if (order) out.push(...jobWarnings(order, { now, appointment: a, sameDay }).map((w) => (light ? { ...w, fixes: [] } : w)));

	if (!light && ((ahead && !past) || a.status === "arrived") && vehicle) {
		const visitDay = day < today ? today : day;
		const docs = [
			["itp", vehicle.itpExpiry],
			["rca", vehicle.rcaExpiry],
		]
			.filter(([, date]) => date && deadline(date, visitDay).status !== "ok" && deadline(date, visitDay).status !== "unknown")
			.map(([doc, date]) => ({ doc, date, expired: date < today }));
		if (docs.length) add("documents", "info", { docs }, [{ id: "openVehicle" }]);
	}

	if (!light && customer && !phone && out.some((w) => CONTACT_KINDS.includes(w.kind))) add("noPhone", "info", {}, [{ id: "editCustomer" }]);

	return sorted(out);
}

/** The cards' summary: the most severe level and the warnings (without fixes); null when nothing is off. */
export function bookingAlert(appointment, ctx) {
	const list = bookingWarnings(appointment, { ...ctx, light: true });
	return list.length ? { severity: list[0].severity, list } : null;
}
