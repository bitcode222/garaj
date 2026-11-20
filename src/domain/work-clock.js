import { DomainError } from "./errors.js";
import { uid } from "./ids.js";
import { canTransition, isOpen, transition } from "./work-order.js";

// The running job (docs/IOS-NATIVE.md §9, look 3 part 4): a job keeps a time log of who worked on
// it and when, `timeLog: [{ id, staffId, start, end }]` (instants; `end` null while running), and
// its lines can be ticked off as done (`line.done`). A mechanic works on one job at a time:
// starting another stops theirs.

/** The open entry of a job's time log, or null. */
export const runningEntry = (order) => (order.timeLog ?? []).find((e) => !e.end) ?? null;

export const isRunning = (order) => runningEntry(order) != null;

/** Milliseconds worked on a job; a running entry counts up to `now`. */
export function workedMs(order, now) {
	return (order.timeLog ?? []).reduce((sum, e) => sum + Math.max(0, Date.parse(e.end ?? now) - Date.parse(e.start)), 0);
}

/**
 * A stretch of logged work with new ends (dragged on the Agendă's day). `end` null keeps a running entry running; the
 * start must come before the end (and before `now` while running), and the entry must not overlap the job's others.
 */
export function setEntrySpan(order, entryId, { start, end }, { now }) {
	const entry = (order.timeLog ?? []).find((e) => e.id === entryId);
	if (!entry) throw new DomainError("not_found", "Intervalul de lucru nu mai există.");
	const nextEnd = entry.end ? end : null;
	if (!start || Number.isNaN(Date.parse(start))) throw new DomainError("invalid", "Ora de început nu e validă.");
	if (Date.parse(start) >= Date.parse(nextEnd ?? now)) throw new DomainError("invalid", "Începutul trebuie să fie înaintea sfârșitului.");
	if (Date.parse(start) > Date.parse(now)) throw new DomainError("invalid", "Lucrul nu poate începe în viitor.");
	const clash = order.timeLog.some((e) => e.id !== entryId && Date.parse(e.start) < Date.parse(nextEnd ?? now) && Date.parse(start) < Date.parse(e.end ?? now));
	if (clash) throw new DomainError("overlap", "Se suprapune cu alt interval lucrat la aceeași lucrare.");
	return { ...order, timeLog: order.timeLog.map((e) => (e.id === entryId ? { ...e, start, end: nextEnd } : e)), updatedAt: now };
}

/** Stops a job's clock at `now`; a job that is not running comes back unchanged. */
export function stopClock(order, { now }) {
	if (!isRunning(order)) return order;
	return { ...order, timeLog: order.timeLog.map((e) => (e.end ? e : { ...e, end: now })), updatedAt: now };
}

/**
 * Starts work on a job: moves it to "in progress" when it is elsewhere, opens a time entry for
 * the mechanic, and stops the same mechanic's other running job. Returns `{ order, stopped }`,
 * `stopped` being the other jobs as they are after their clock stopped.
 */
export function startWork(order, { staffId = null, now, orders = [], id = uid() }) {
	if (!isOpen(order)) throw new DomainError("job_closed", "Lucrarea e închisă. Redeschide-o ca să lucrezi la ea.");
	if (isRunning(order)) return { order, stopped: [] };
	let next = order;
	if (order.status !== "in_progress") {
		if (!canTransition(order.status, "in_progress")) throw new DomainError("invalid_transition", "Lucrarea nu poate trece în lucru.");
		next = transition(order, "in_progress", { now });
	}
	next = { ...next, timeLog: [...(next.timeLog ?? []), { id, staffId, start: now, end: null }], updatedAt: now };
	const stopped = orders
		.filter((o) => o.id !== order.id && isRunning(o) && (runningEntry(o).staffId ?? null) === staffId)
		.map((o) => stopClock(o, { now }));
	return { order: next, stopped };
}

/** The steps of a job: its labor lines (all lines when it has none), refused ones left out. */
export function steps(order) {
	const lines = (order.lines ?? []).filter((l) => !l.refused);
	const labor = lines.filter((l) => l.kind === "labor");
	const list = labor.length ? labor : lines;
	return { total: list.length, done: list.filter((l) => l.done).length, current: list.find((l) => !l.done) ?? null };
}

/** Ticks a line off as done, or back. */
export function setLineDone(order, lineId, done, { now }) {
	if (!(order.lines ?? []).some((l) => l.id === lineId)) throw new DomainError("line_not_found", "Linia nu mai există.");
	return { ...order, lines: order.lines.map((l) => (l.id === lineId ? { ...l, done: Boolean(done) } : l)), updatedAt: now };
}

/** The jobs whose clock runs, the most recently started first. */
export function runningJobs(orders) {
	return orders
		.filter((o) => isOpen(o) && isRunning(o))
		.sort((a, b) => runningEntry(b).start.localeCompare(runningEntry(a).start));
}
