import { addDaysISO, dayOfInstant, parseISODate } from "./dates.js";

// What overlaps on one lift or mechanic of the day board, and the quick ways out. Minutes of the day, no words: the
// board words them. Only what can still be acted on counts: a past day or an overlap already over is left alone.

const STEP = 15;
const MIN_LENGTH = 15;
const MIN_KEPT = 30; // a booking isn't shortened below this
const MAX_FIXES = 6;

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

const canShift = (block) => block.kind === "booking" && ["scheduled", "confirmed", "arrived"].includes(block.appointment?.status ?? "scheduled");
const isOpen = (block) => !["delivered", "cancelled"].includes(block.order?.status);

/** The free start closest to the booked one on this row, on one side of it; null when none fits. */
function nearestSlot(spans, mover, { from, to, earliest }, side) {
	const length = mover.end - mover.start;
	let best = null;
	for (let start = from; start + length <= to; start += STEP) {
		if (start < earliest || (side > 0 ? start <= mover.start : start >= mover.start) || !isFree(spans, start, start + length, mover.block.key)) continue;
		if (best == null || Math.abs(start - mover.start) < Math.abs(best - mover.start)) best = start;
	}
	return best;
}

/** The longest part of the card's own time nobody else is on (at least half an hour); null if it's all or nothing. */
function freePart(spans, mover) {
	const others = spans.filter((s) => s.block.key !== mover.block.key && s.end > mover.start && s.start < mover.end);
	let best = null;
	let at = mover.start;
	for (const s of [...others, { start: mover.end, end: mover.end }].sort((a, b) => a.start - b.start)) {
		if (s.start > at && (!best || s.start - at > best.end - best.start)) best = { start: at, end: s.start };
		at = Math.max(at, s.end);
	}
	return best && best.end - best.start >= MIN_KEPT ? best : null;
}

/** The first day after this one, open and on the board, with room: at the same hour if it can, else the earliest. */
function nextDay(lane, mover, { day, from, to, hours }) {
	const length = mover.end - mover.start;
	const open = hours?.days ?? [0, 1, 2, 3, 4, 5, 6];
	for (let i = 1; i <= 14; i++) {
		const next = addDaysISO(day, i);
		if (!lane.days[next]) return null;
		if (!open.includes(parseISODate(next).getDay())) continue;
		const spans = spansOf(lane.days[next], next);
		if (mover.start >= from && mover.end <= to && isFree(spans, mover.start, mover.end)) return { type: "day", day: next, start: mover.start, end: mover.end };
		for (let start = from; start + length <= to; start += STEP) if (isFree(spans, start, start + length)) return { type: "day", day: next, start, end: start + length };
	}
	return null;
}

/** The ways out for one card, least disruptive first: same time elsewhere, a little later or earlier, shorter, another day. */
function fixesFor(mover, lane, ctx) {
	const { lanes, day, from, to } = ctx;
	const others = lanes.filter((l) => l.id && l.id !== lane.id);
	const freeRows = others.filter((l) => isFree(spansOf(l.days[day], day), mover.start, mover.end));
	const fixes = freeRows.slice(0, 2).map((l) => ({ type: "row", laneId: l.id, laneName: l.name }));
	if (!canShift(mover.block)) return fixes;
	const spans = spansOf(lane.days[day], day);
	const length = mover.end - mover.start;
	const later = nearestSlot(spans, mover, ctx, 1);
	const earlier = nearestSlot(spans, mover, ctx, -1);
	if (later != null) fixes.push({ type: "later", day, start: later, end: later + length });
	if (earlier != null) fixes.push({ type: "earlier", day, start: earlier, end: earlier + length });
	const part = freePart(spans, mover);
	if (part && part.end > ctx.earliest) fixes.push({ type: "shorten", day, start: part.start, end: part.end, saved: length - (part.end - part.start) });
	if (!freeRows.length) {
		// No row is free at that hour: the nearest hour on another row.
		let best = null;
		for (const l of others) {
			const theirs = spansOf(l.days[day], day);
			for (let start = from; start + length <= to; start += STEP) {
				if (start < ctx.earliest || !isFree(theirs, start, start + length)) continue;
				if (!best || Math.abs(start - mover.start) < Math.abs(best.start - mover.start)) best = { type: "row_time", laneId: l.id, laneName: l.name, day, start, end: start + length };
			}
		}
		if (best) fixes.push(best);
	}
	if (mover.block.planned) {
		const tomorrow = nextDay(lane, mover, ctx);
		if (tomorrow) fixes.push(tomorrow);
	}
	return fixes.slice(0, MAX_FIXES);
}

/** Which cards can give way, best first: bookings still to come (the last one first), then cars in the shop, then logged work. */
function optionsFor(cluster, lane, ctx) {
	const rank = (s) => (s.block.kind === "booking" && s.block.planned ? 0 : s.block.kind === "booking" ? 1 : 2);
	return cluster
		.filter((s) => isOpen(s.block) && !(s.block.kind === "booking" && s.block.appointment?.status === "done"))
		.map((s, index) => ({ s, index }))
		.sort((a, b) => rank(a.s) - rank(b.s) || b.index - a.index)
		.map(({ s }) => ({ block: s.block, fixes: fixesFor(s, lane, ctx) }))
		.filter((option) => option.fixes.length);
}

/**
 * The overlaps of one day across the rows (`lanes`: { id, name, days: { [day]: blocks } }). Each has the cards in it, the
 * stretches they share, and `options`: for every card that can give way, its fixes (another free row, the nearest time
 * after or before, only the free part, the nearest time on another row, another day). The first option's first fix is
 * the one to recommend.
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
					const options = optionsFor(cluster, lane, { lanes, day, from, to, earliest, hours });
					clashes.push({
						key: `${day}:${lane.id}:${cluster[0].block.key}`,
						day,
						laneId: lane.id,
						laneName: lane.name,
						start: shared[0][0],
						end: shared.at(-1)[1],
						shared,
						blocks: cluster.map((s) => s.block),
						options,
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
