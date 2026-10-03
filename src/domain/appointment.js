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

export function canMoveAppointment(from, to) {
	return APPOINTMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function setAppointmentStatus(appointment, to, { now = new Date().toISOString() } = {}) {
	if (appointment.status === to) return appointment;
	if (!canMoveAppointment(appointment.status, to)) {
		throw new DomainError("invalid_transition", "Programarea nu poate trece în această stare.");
	}
	return { ...appointment, status: to, updatedAt: now };
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
