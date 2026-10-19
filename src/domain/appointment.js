import { DomainError } from "./errors.js";

export const APPOINTMENT_TRANSITIONS = {
	scheduled: ["confirmed", "arrived", "no_show", "cancelled"],
	confirmed: ["scheduled", "arrived", "no_show", "cancelled"],
	arrived: ["done"],
	done: [],
	no_show: ["scheduled"],
	cancelled: ["scheduled"],
};

/**
 * Moves offered by a one-tap status menu. "done" is set by finishing the work
 * order, and "arrived" is only a legal quick move because the UI routes it
 * through check-in (which opens the work order) instead of writing the status.
 */
export const quickAppointmentMoves = (status) => (APPOINTMENT_TRANSITIONS[status] ?? []).filter((to) => to !== "done");

export const isActiveAppointment = (a) => a.status !== "cancelled" && a.status !== "no_show";

/**
 * A booking's time can be changed while it is still ahead or the car is in the shop.
 * Finished, missed and cancelled bookings are history: they stay where they were.
 */
export const canReschedule = (appointment) => ["scheduled", "confirmed", "arrived"].includes(appointment.status);

export function canMoveAppointment(from, to) {
	return APPOINTMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/** One line of a booking's history ({ at, type, … }), appended. */
const logged = (appointment, entry) => [...(appointment.activity ?? []), entry];

export function setAppointmentStatus(appointment, to, { now = new Date().toISOString() } = {}) {
	if (appointment.status === to) return appointment;
	if (!canMoveAppointment(appointment.status, to)) {
		throw new DomainError("invalid_transition", "Programarea nu poate trece în această stare.");
	}
	// Back to "programat" (restored after a cancellation or a no-show) the old reason no longer applies.
	const reset = to === "scheduled" ? { cancelReason: null } : null;
	return { ...appointment, ...reset, status: to, activity: logged(appointment, { at: now, type: "status", from: appointment.status, to }), updatedAt: now };
}

/** Why a booking was called off: the customer, the shop, or something else (with a note). */
export const CANCEL_REASONS = ["client", "shop", "other"];

/**
 * Calls a booking off: cancelled, or a no-show. The reason is kept for the banner and the
 * history; a no-show before the booking's time is refused (that is a cancellation).
 */
export function callOffAppointment(appointment, { to, reason = null, note = "", now = new Date().toISOString() }) {
	if (to !== "cancelled" && to !== "no_show") throw new DomainError("invalid", "Alege anularea sau neprezentarea.");
	if (to === "no_show" && appointment.start > now) throw new DomainError("invalid", "Programarea nu a început încă: anuleaz-o în loc.");
	if (reason && !CANCEL_REASONS.includes(reason)) throw new DomainError("invalid", "Motiv necunoscut.");
	const moved = setAppointmentStatus(appointment, to, { now });
	const cancelReason = reason || note.trim() ? { code: reason, note: note.trim() } : null;
	return { ...moved, cancelReason, expectedAt: null, activity: logged(appointment, { at: now, type: "status", from: appointment.status, to, ...(cancelReason ? { reason: cancelReason } : null) }) };
}

/**
 * Moves a booking to a new time. A confirmed booking stays confirmed only when the customer
 * knows about the change; a cancelled or missed one is booked again. An announced delay or a
 * cancellation reason no longer applies.
 */
export function rescheduleAppointment(appointment, { start, end, customerKnows = false, now = new Date().toISOString() }) {
	if (appointment.status === "arrived") throw new DomainError("invalid_transition", "Mașina e deja în service.");
	if (appointment.status === "done") throw new DomainError("invalid_transition", "Vizita s-a încheiat.");
	if (!start || !end || !(start < end)) throw new DomainError("invalid", "Ora de sfârșit trebuie să fie după ora de început.");
	const status = appointment.status === "confirmed" && customerKnows ? "confirmed" : "scheduled";
	return {
		...appointment,
		start,
		end,
		status,
		expectedAt: null,
		cancelReason: null,
		activity: logged(appointment, { at: now, type: "rescheduled", from: { start: appointment.start, end: appointment.end }, to: { start, end }, customerKnows }),
		updatedAt: now,
	};
}

/** The customer called to say they will be late: the booking keeps its slot and gets the time they expect to arrive. */
export function announceDelay(appointment, { expectedAt, now = new Date().toISOString() }) {
	if (appointment.status !== "scheduled" && appointment.status !== "confirmed") throw new DomainError("invalid_transition", "Doar o programare care încă nu a sosit poate întârzia.");
	if (!expectedAt || !(expectedAt > appointment.start)) throw new DomainError("invalid", "Ora anunțată trebuie să fie după ora programării.");
	return { ...appointment, expectedAt, activity: logged(appointment, { at: now, type: "delay", expectedAt }), updatedAt: now };
}

/** An announced arrival that no longer fits in the booked slot (the booking should move too). */
export const delayOverruns = (appointment) => Boolean(appointment.expectedAt && appointment.expectedAt >= appointment.end);

/**
 * The status a booking had before its car was checked in, from its history ("programat" or
 * "confirmat"); "confirmat" for bookings checked in before the history existed. Used when the
 * job it became is deleted.
 */
export function statusBeforeCheckIn(appointment) {
	const entry = [...(appointment.activity ?? [])].reverse().find((item) => item.type === "checked_in");
	return entry && (entry.from === "scheduled" || entry.from === "confirmed") ? entry.from : "confirmed";
}

/**
 * Numbers for the bookings saved before bookings had numbers, oldest first, after the
 * highest number already given; and the counter's next value.
 */
export function numberAppointments(appointments, next = 1) {
	let counter = Math.max(next, ...appointments.map((a) => (a.number ?? 0) + 1));
	const when = (a) => a.createdAt ?? a.start ?? "";
	const numbered = appointments
		.filter((a) => a.number == null)
		.sort((a, b) => (when(a) < when(b) ? -1 : when(a) > when(b) ? 1 : a.id < b.id ? -1 : 1))
		.map((a) => ({ ...a, number: counter++ }));
	return { numbered, next: counter };
}

/** Both are ISO instants from toISOString(), so string comparison is chronological. */
export const overlaps = (a, b) => a.start < b.end && b.start < a.end;

/**
 * Same mechanic or same bay at the same time. These are warnings, not errors:
 * shops deliberately squeeze a 15-minute job next to a long one.
 */
export function findConflicts(appointment, candidates) {
	if (!isActiveAppointment(appointment)) return [];
	return candidates.filter(
		(other) =>
			other.id !== appointment.id &&
			isActiveAppointment(other) &&
			overlaps(appointment, other) &&
			((appointment.staffId && other.staffId === appointment.staffId) ||
				(appointment.bayId && other.bayId === appointment.bayId)),
	);
}

export function appointmentProblem({ start, end, customerId }) {
	if (!start || !end) return "Alege ora de început și de sfârșit.";
	if (!(start < end)) return "Ora de sfârșit trebuie să fie după ora de început.";
	if (!customerId) return "Alege clientul.";
	return null;
}
