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

/** Open jobs that no shown booking stands for (walk-ins, cars left from earlier days), oldest stage first. */
export function jobsWithoutBooking(orders, shownOrderIds) {
	return orders
		.filter((o) => OPEN_STATUSES.includes(o.status) && !shownOrderIds.has(o.id))
		.sort((a, b) => OPEN_STATUSES.indexOf(a.status) - OPEN_STATUSES.indexOf(b.status) || (a.createdAt < b.createdAt ? -1 : 1));
}

/** How many visits are in each stage (every stage present, zero when empty). */
export function countStages(stages) {
	const counts = Object.fromEntries(VISIT_STAGES.map((s) => [s, 0]));
	for (const s of stages) if (s in counts) counts[s] += 1;
	return counts;
}

/**
 * The booking a job's card points to: the one it was checked in from, else any
 * booking that names the job, else the same car's booking nearest to `today`
 * (a car can have several). Null when the car has nothing booked.
 */
export function appointmentForJob(order, appointments, today) {
	const live = Object.values(appointments).filter((a) => a.status !== "cancelled");
	const linked = live.find((a) => a.id === order.appointmentId) ?? live.find((a) => a.workOrderId === order.id);
	if (linked) return linked;
	if (!order.vehicleId) return null;
	const distance = (a) => Math.abs(diffDaysISO(today, dayOfInstant(a.start)));
	return live
		.filter((a) => a.vehicleId === order.vehicleId)
		.reduce((best, a) => (best && distance(best) <= distance(a) ? best : a), null);
}
