import { addDaysISO, dayOfInstant, parseISODate } from "./dates.js";

// What overlaps on one lift or mechanic of the day board, and the quick ways out. Minutes of the day, no words: the
// board words them. Only what can still be acted on counts: a past day or an overlap already over is left alone.

const STEP = 15;
const MIN_LENGTH = 15;

const minuteOf = (instant) => {
	const d = new Date(instant);
	return d.getHours() * 60 + d.getMinutes();
};

/** A block's stretch on `day`, in minutes (one running over midnight is cut at the day's edge). */
function spanOn(block, day) {
	const start = dayOfInstant(block.start) === day ? minuteOf(block.start) : 0;
	const end = dayOfInstant(block.end) === day ? minuteOf(block.end) : 24 * 60;
	return { block, start, end: Math.max(end, start + MIN_LENGTH) };
}

const spansOf = (blocks, day) => (blocks ?? []).map((block) => spanOn(block, day)).sort((a, b) => a.start - b.start || a.end - b.end);
const isFree = (spans, start, end, except) => spans.every((s) => s.block.key === except || s.end <= start || s.start >= end);
const movable = (block) => block.kind === "booking" && block.planned;

/** Where two or more cards run at once, merged: [[start, end], …]. */
function sharedSpans(cluster) {
	const shared = [];
	for (let i = 0; i < cluster.length; i++) {
		for (let j = i + 1; j < cluster.length; j++) {
			const start = Math.max(cluster[i].start, cluster[j].start);
			const end = Math.min(cluster[i].end, cluster[j].end);
			if (start < end) shared.push([start, end]);
		}
	}
	shared.sort((a, b) => a[0] - b[0]);
	const merged = [];
	for (const [start, end] of shared) {
		const last = merged.at(-1);
		if (last && start <= last[1]) last[1] = Math.max(last[1], end);
		else merged.push([start, end]);
	}
	return merged;
}

/** The free start nearest to the booked one, on the same row and day; null when none fits. */
function nearestSlot(spans, mover, { from, to, earliest }) {
	const length = mover.end - mover.start;
	let best = null;
	for (let start = from; start + length <= to; start += STEP) {
		if (start < earliest || start === mover.start || !isFree(spans, start, start + length, mover.block.key)) continue;
		const distance = Math.abs(start - mover.start);
		if (best == null || distance < Math.abs(best - mover.start) || (distance === Math.abs(best - mover.start) && start > best)) best = start;
	}
	return best;
}

function fixesFor(mover, lane, { lanes, day, from, to, earliest, hours }) {
	const length = mover.end - mover.start;
	const fixes = [];
	const other = lanes.find((l) => l.id && l.id !== lane.id && isFree(spansOf(l.days[day], day), mover.start, mover.end));
	if (other) fixes.push({ type: "row", laneId: other.id, laneName: other.name });
	const slot = nearestSlot(spansOf(lane.days[day], day), mover, { from, to, earliest });
	if (slot != null) fixes.push({ type: "time", day, start: slot, end: slot + length });
	else {
		// The day is full: the first free start on the next open day that is on the board.
		const open = hours?.days ?? [0, 1, 2, 3, 4, 5, 6];
		for (let i = 1; i <= 14; i++) {
			const next = addDaysISO(day, i);
			if (!lane.days[next]) break;
			if (!open.includes(parseISODate(next).getDay())) continue;
			const spans = spansOf(lane.days[next], next);
			let found = null;
			for (let start = from; found == null && start + length <= to; start += STEP) if (isFree(spans, start, start + length)) found = start;
			if (found != null) {
				fixes.push({ type: "day", day: next, start: found, end: found + length });
				break;
			}
		}
	}
	return fixes;
}

/**
 * The overlaps of one day across the rows (`lanes`: { id, name, days: { [day]: blocks } }). Each has the cards in it, the
 * stretches they share, the booking best moved (the last one still to come; none if every car is already in) and its
 * `fixes`: another free row at the same time, the nearest free time on this row or, if the day is full, the next open day.
 */
export function boardClashes({ lanes, day, from, to, now, hours }) {
	const today = dayOfInstant(now);
	if (day < today) return [];
	const nowMinute = day === today ? minuteOf(now) : -1;
	const earliest = day === today ? Math.ceil(nowMinute / STEP) * STEP : from;
	const clashes = [];
	for (const lane of lanes) {
		if (!lane.id) continue; // cards with no lift aren't competing for one
		const spans = spansOf(lane.days[day], day);
		let cluster = [];
		let until = -1;
		const close = () => {
			if (cluster.length > 1) {
				const shared = sharedSpans(cluster);
				if (shared.at(-1)[1] > nowMinute) {
					const mover = cluster.filter((s) => movable(s.block)).at(-1) ?? null;
					clashes.push({
						key: `${day}:${lane.id}:${cluster[0].block.key}`,
						day,
						laneId: lane.id,
						laneName: lane.name,
						start: shared[0][0],
						end: shared.at(-1)[1],
						shared,
						blocks: cluster.map((s) => s.block),
						mover: mover?.block ?? null,
						fixes: mover ? fixesFor(mover, lane, { lanes, day, from, to, earliest, hours }) : [],
					});
				}
			}
			cluster = [];
			until = -1;
		};
		for (const span of spans) {
			if (span.start >= until) close();
			cluster.push(span);
			until = Math.max(until, span.end);
		}
		close();
	}
	return clashes.sort((a, b) => a.start - b.start);
}
