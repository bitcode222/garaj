// The log inside a job: every change to who has it, its time, its lines and its notes, as entries of `order.activity`
// (ids and facts, no words: the screens word them). Typing in one field within a few minutes is one entry, from the first
// value to the last, so autosave doesn't flood the log.

const MERGE_MS = 10 * 60_000;
const TEXT_FIELDS = ["complaint", "diagnosis", "notes", "mileage", "fuelLevel"];
const LINE_FIELDS = ["description", "qty", "unitPrice", "discountPct", "refused"];
const blank = (value) => value == null || value === "" || value === false;
const same = (a, b) => (blank(a) && blank(b)) || a === b;
const entryKey = (entry) => entry.id ?? entry.start;

function lineChanges(before = [], after = []) {
	const was = new Map(before.map((line) => [line.id, line]));
	const now = new Map(after.map((line) => [line.id, line]));
	const entries = [];
	for (const line of after) {
		const old = was.get(line.id);
		if (!old) {
			entries.push({ type: "line_added", lineId: line.id, name: line.description ?? "" });
			continue;
		}
		if (Boolean(old.done) !== Boolean(line.done)) entries.push({ type: "line_done", lineId: line.id, name: line.description ?? "", done: Boolean(line.done) });
		const fields = LINE_FIELDS.filter((field) => !same(old[field], line[field]));
		if (fields.length) entries.push({ type: "line_changed", lineId: line.id, name: line.description ?? "", fields, from: Object.fromEntries(fields.map((f) => [f, old[f] ?? null])), to: Object.fromEntries(fields.map((f) => [f, line[f] ?? null])) });
	}
	for (const line of before) if (!now.has(line.id)) entries.push({ type: "line_removed", lineId: line.id, name: line.description ?? "" });
	return entries;
}

function workChanges(before = [], after = []) {
	const was = new Map(before.map((entry) => [entryKey(entry), entry]));
	const entries = [];
	for (const entry of after) {
		const old = was.get(entryKey(entry)) ?? (entry.id ? null : undefined);
		if (!old) {
			entries.push({ type: "work_started", entryId: entry.id ?? null, start: entry.start });
			continue;
		}
		if (!old.end && entry.end && old.start === entry.start) entries.push({ type: "work_stopped", entryId: entry.id ?? null, start: entry.start, end: entry.end });
		else if (old.start !== entry.start || old.end !== entry.end) entries.push({ type: "work_moved", entryId: entry.id ?? null, from: { start: old.start, end: old.end ?? null }, to: { start: entry.start, end: entry.end ?? null } });
	}
	return entries;
}

/** What changed between two versions of a job, as log entries (without `at`). `names`: { staff, bays } by id. */
export function jobChanges(prev, next, { names = {} } = {}) {
	const entries = [];
	for (const [field, people] of [["staffId", names.staff], ["bayId", names.bays]]) {
		if (same(prev[field], next[field])) continue;
		entries.push({ type: "assigned", field, from: prev[field] ?? null, to: next[field] ?? null, fromName: people?.[prev[field]]?.name ?? null, toName: people?.[next[field]]?.name ?? null });
	}
	for (const field of TEXT_FIELDS) if (!same(prev[field], next[field])) entries.push({ type: "edited", field, from: prev[field] ?? null, to: next[field] ?? null });
	return [...entries, ...lineChanges(prev.lines, next.lines), ...workChanges(prev.timeLog, next.timeLog)];
}

// Only typing folds; a card moved on the board is a decision, and each one stays in the log.
const mergeKey = (entry) => (entry.type === "edited" ? `edited:${entry.field}` : entry.type === "line_changed" ? `line:${entry.lineId}` : null);

/** Adds entries to a job's log, folding one into the same recent change by the same person (back to where it began: gone). */
export function appendJobLog(order, entries, { now, by = null }) {
	if (!entries.length) return order;
	const activity = [...(order.activity ?? [])];
	for (const change of entries) {
		const entry = { at: now, ...(by ? { by } : null), ...change };
		const key = mergeKey(entry);
		const last = activity.at(-1);
		if (key && last && mergeKey(last) === key && (last.by ?? null) === (by ?? null) && Date.parse(now) - Date.parse(last.at) < MERGE_MS) {
			const from = entry.type === "line_changed" ? { ...entry.from, ...last.from } : last.from;
			const to = entry.type === "line_changed" ? { ...last.to, ...entry.to } : entry.to;
			const fields = entry.type === "line_changed" ? [...new Set([...last.fields, ...entry.fields])].filter((f) => !same(from[f], to[f])) : null;
			const undone = entry.type === "line_changed" ? !fields.length : same(from, to);
			activity.pop();
			if (!undone) activity.push({ ...last, ...entry, from, to, ...(fields ? { fields } : null) });
			continue;
		}
		activity.push(entry);
	}
	return { ...order, activity };
}

/** `next` with whatever changed since `prev` in its log. */
export function recordJobChanges(prev, next, { now, by = null, names = {} }) {
	return appendJobLog(next, jobChanges(prev, next, { names }), { now, by });
}

/**
 * The log to show, newest first. Jobs from before the log have only their stage dates: those stages are filled in, and a
 * job with nothing at all shows when it was opened.
 */
export function jobTimeline(order) {
	const entries = [...(order.activity ?? [])];
	const logged = new Set(entries.filter((entry) => entry.type === "status").map((entry) => entry.to));
	for (const [status, at] of Object.entries(order.dates ?? {})) if (at && !logged.has(status)) entries.push({ at, type: "status", to: status, derived: true });
	if (!entries.length && order.createdAt) entries.push({ at: order.createdAt, type: "created" });
	return entries.map((entry, index) => ({ entry, index })).sort((a, b) => Date.parse(b.entry.at) - Date.parse(a.entry.at) || b.index - a.index).map(({ entry }) => entry);
}
