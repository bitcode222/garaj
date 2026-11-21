import { canReschedule } from "./appointment.js";
import { dayOfInstant } from "./dates.js";

const GRACE_MS = 15 * 60_000; // a booking dropped on the quarter hour just gone is still "now"
const isClosed = (order) => order?.status === "delivered" || order?.status === "cancelled";

/**
 * Why a card of the day board can't take the times `start`–`end` (instants), or null if it can. A booking still to come
 * can't go into the past; a car already in the shop can be corrected either way. Logged work is what really happened: it
 * stays in the past, whole, off the job's other stretches, and a stretch still running is stopped first.
 */
export function moveProblem(block, { start, end, now }) {
	if (isClosed(block.order)) return "closed";
	if (block.kind === "booking") {
		if (!canReschedule(block.appointment)) return "closed";
		if (block.planned && Date.parse(start) + GRACE_MS <= Date.parse(now)) return "past";
		return null;
	}
	const entry = block.order?.timeLog?.find((e) => e.id === block.entryId);
	if (!entry) return "no_entry";
	if (!entry.end) return "running";
	if (dayOfInstant(entry.start) !== dayOfInstant(entry.end)) return "split";
	if (Date.parse(end) > Date.parse(now)) return "future";
	const clash = block.order.timeLog.some((e) => e.id !== entry.id && Date.parse(e.start) < Date.parse(end) && Date.parse(start) < Date.parse(e.end ?? now));
	return clash ? "own_overlap" : null;
}
