import { isActiveAppointment } from "./appointment.js";
import { dayOfInstant, diffDaysISO } from "./dates.js";
import { OPEN_STATUSES } from "./work-order.js";

// A visit is one car's trip through the shop as the dashboard calendar shows it:
// booked → the job's own stages → delivered. One vocabulary for the calendar and
// its status line, so "În lucru" on the timeline is the same "În lucru" as on the board.
export const VISIT_STAGES = ["scheduled", "estimate", "approved", "in_progress", "waiting_parts", "ready", "delivered", "no_show"];

/**
 * Stage of a booked visit, or null when it is not shown (cancelled booking, or a
 * car that arrived and whose job was then cancelled). `order` is the job the
 * booking was checked in as, if any.
 */
export function visitStage(appointment, order = null) {
	if (appointment.status === "cancelled") return null;
	if (appointment.status === "no_show") return "no_show";
	if (order) {
		if (OPEN_STATUSES.includes(order.status)) return order.status;
		return order.status === "delivered" ? "delivered" : null;
	}
	if (appointment.status === "done") return "delivered";
	// Arrived, but the job is gone (old data): the car is in the shop, stage unknown.
	if (appointment.status === "arrived") return "in_progress";
	return "scheduled";
}

/** The dashboard calendar opens on the day when something is booked for it, otherwise on the week. */
export function defaultCalendarView(appointmentsToday) {
	return (appointmentsToday ?? []).some(isActiveAppointment) ? "day" : "week";
}

/** How many visits are in each stage (every stage present, zero when empty). */
export function countStages(stages) {
	const counts = Object.fromEntries(VISIT_STAGES.map((s) => [s, 0]));
	for (const s of stages) if (s in counts) counts[s] += 1;
	return counts;
}

const byStart = (a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0);

/** How long a walk-in is drawn on the calendar, in minutes (it has no planned slot). */
export const WALKIN_SLOT_MIN = 30;

/**
 * Every visit the dashboard calendar deals with, built once from the bookings and the jobs.
 * A visit is a booking (with the job it became, if any) or a walk-in: an open job nobody booked.
 *   { id, kind: "booking" | "walkin", appointment, order, stage, start, end, day, vehicleId, customerId, staffId }
 * `id` is the booking's id, or the job's for a walk-in. A booking and a job are one visit
 * when either names the other. Hidden bookings (see visitStage) have no visit, so an
 * open job behind one counts as a walk-in and the car is never lost.
 *
 * A walk-in has no planned slot: it sits on the calendar at its check-in time, and its
 * `end` is nominal (WALKIN_SLOT_MIN later), only so it can be placed next to bookings.
 * `bookingsByDay` is what was booked (counts, booked hours); `visitsByDay` adds the
 * walk-ins checked in that day, so every car in service has a place on the calendar.
 */
export function buildVisits(appointments, workOrders) {
	const orders = Object.values(workOrders);
	const orderOfBooking = new Map();
	for (const order of orders) if (order.appointmentId) orderOfBooking.set(order.appointmentId, order);

	const byId = new Map();
	const byOrder = new Map();
	const byVehicle = new Map();
	const bookingsByDay = new Map();
	const visitsByDay = new Map();
	const add = (visit) => {
		byId.set(visit.id, visit);
		const sameDay = visitsByDay.get(visit.day);
		if (sameDay) sameDay.push(visit);
		else visitsByDay.set(visit.day, [visit]);
		if (visit.order) byOrder.set(visit.order.id, visit);
		if (visit.vehicleId) {
			const sameCar = byVehicle.get(visit.vehicleId);
			if (sameCar) sameCar.push(visit);
			else byVehicle.set(visit.vehicleId, [visit]);
		}
	};

	for (const appointment of Object.values(appointments)) {
		const order = (appointment.workOrderId && workOrders[appointment.workOrderId]) || orderOfBooking.get(appointment.id) || null;
		const stage = visitStage(appointment, order);
		if (!stage) continue;
		const visit = {
			id: appointment.id,
			kind: "booking",
			appointment,
			order,
			stage,
			start: appointment.start,
			end: appointment.end,
			day: dayOfInstant(appointment.start),
			vehicleId: appointment.vehicleId ?? order?.vehicleId ?? null,
			customerId: appointment.customerId ?? order?.customerId ?? null,
			staffId: appointment.staffId ?? null,
		};
		add(visit);
		const sameDay = bookingsByDay.get(visit.day);
		if (sameDay) sameDay.push(visit);
		else bookingsByDay.set(visit.day, [visit]);
	}
	for (const order of orders) {
		if (!OPEN_STATUSES.includes(order.status) || byOrder.has(order.id)) continue;
		add({
			id: order.id,
			kind: "walkin",
			appointment: null,
			order,
			stage: order.status,
			start: order.createdAt,
			end: new Date(new Date(order.createdAt).getTime() + WALKIN_SLOT_MIN * 60_000).toISOString(),
			day: dayOfInstant(order.createdAt),
			vehicleId: order.vehicleId ?? null,
			customerId: order.customerId ?? null,
			staffId: order.staffId ?? null,
		});
	}

	for (const list of bookingsByDay.values()) list.sort(byStart);
	for (const list of visitsByDay.values()) list.sort(byStart);
	// The shop right now: every open job once, in pipeline order, longest in the shop first.
	const inService = [...byOrder.values()]
		.filter((visit) => OPEN_STATUSES.includes(visit.order.status))
		.sort((a, b) => OPEN_STATUSES.indexOf(a.order.status) - OPEN_STATUSES.indexOf(b.order.status) || (a.order.createdAt < b.order.createdAt ? -1 : 1));
	return { byId, byOrder, byVehicle, bookingsByDay, visitsByDay, inService };
}

/** Minutes a booked car is overdue today: not arrived more than `grace` minutes after its start. 0 otherwise. */
export function arrivalDelay(appointment, now, grace = 15) {
	if (appointment.status !== "scheduled" && appointment.status !== "confirmed") return 0;
	if (dayOfInstant(appointment.start) !== dayOfInstant(now)) return 0;
	const late = Math.floor((new Date(now).getTime() - new Date(appointment.start).getTime()) / 60_000);
	return late > grace ? late : 0;
}

/** Whole days a finished car has waited to be picked up (the same count the reminders use). 0 when not ready. */
export function pickupWait(order, today) {
	if (order.status !== "ready" || !order.dates?.ready) return 0;
	return Math.max(0, diffDaysISO(dayOfInstant(order.dates.ready), today));
}
