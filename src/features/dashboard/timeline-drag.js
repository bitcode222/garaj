// What a drag on the dashboard's timeline means in minutes (docs/DASHBOARD-CALENDAR.md §12):
// drawing a new booking, stretching one by an edge, moving one whole. Pure functions over
// minutes of a day, so they are unit-tested; the pointer handling is in timeline.jsx.

export const SNAP_MIN = 15; // every drag lands on a quarter of an hour
export const HOLD_MS = 380; // touch: press and hold this long to pick something up (the same as Programări)
export const HOLD_SLOP_PX = 8; // touch: moving further than this while holding is a scroll
export const DRAG_SLOP_PX = 4; // mouse: moving further than this with the button down is a drag
export const EDGE_ZONE_PX = 56; // dragging this close to the grid's side scrolls it
export const EDGE_MAX_PX = 14; // per frame, at the very edge

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const snapTo = (minute, step = SNAP_MIN) => Math.round(minute / step) * step;

/** Where a new booking starts when free time is pointed at: on the grid, with room for one step before the day ends. */
export const startAt = (minute, hours, step = SNAP_MIN) => clamp(snapTo(minute, step), hours.start, hours.end - step);

/**
 * A new booking drawn from where the press began (`anchor`, the line that was shown there)
 * to where the pointer is, in either direction: at least one step long, inside the shown hours.
 */
export function drawSpan(anchor, pointer, hours, step = SNAP_MIN) {
	const from = startAt(anchor, hours, step);
	const to = clamp(snapTo(pointer, step), hours.start, hours.end);
	if (to < from) return { start: to, end: from };
	return { start: from, end: Math.max(to, from + step) };
}

/**
 * A booking stretched by one edge ("start" or "end"): that edge follows the pointer, the
 * other stays where it is. Never shorter than one step, never outside the shown hours.
 */
export function stretchSpan(span, edge, pointer, hours, step = SNAP_MIN) {
	const at = clamp(snapTo(pointer, step), hours.start, hours.end);
	if (edge === "start") return { start: Math.min(at, span.end - step), end: span.end };
	return { start: span.start, end: Math.max(at, span.start + step) };
}

/**
 * A booking moved whole: it starts at `start` (snapped), keeps its length, and stays
 * inside the shown hours. One longer than the day starts with the day.
 */
export function shiftSpan(span, start, hours, step = SNAP_MIN) {
	const length = span.end - span.start;
	const from = clamp(snapTo(start, step), hours.start, Math.max(hours.start, hours.end - length));
	return { start: from, end: from + length };
}

/**
 * How fast the grid scrolls by itself while something is dragged `x` px from its left
 * edge: nothing in the middle, up to `max` px per frame at either side.
 */
export function edgeSpeed(x, width, zone = EDGE_ZONE_PX, max = EDGE_MAX_PX) {
	if (x < zone) return -Math.round(max * (1 - Math.max(x, 0) / zone));
	if (x > width - zone) return Math.round(max * (1 - Math.max(width - x, 0) / zone));
	return 0;
}
