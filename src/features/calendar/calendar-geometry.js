// Geometry of the calendar's endless scroll (docs/APPOINTMENTS-AND-NAV.md D12, D13, D15).
// Zi and Săptămână: days side by side in a window around an anchor day, scrolled sideways;
// the window moves around the day in view when either end comes near, so there is no end.
// Lună: weeks one under the other, the same way, scrolled up and down. Pure functions,
// unit-tested; relative imports with ".js" so `npm test` loads this without the bundler.

import { addDaysISO, dayOfInstant, diffDaysISO, parseISODate } from "../../domain/dates.js";
import { buildTimeline, indexAt, indexOfDay, widthAt } from "../dashboard/timeline-geometry.js";

export { indexAt, indexOfDay, widthAt };

export const WINDOW_DAYS = 548; // about 18 months each side of the anchor
export const WINDOW_WEEKS = 78; // the same for Lună
export const EDGE_DAYS = 45; // nearer than this to an end of the window, it is moved
export const EDGE_WEEKS = 8;
export const SNAP_MIN = 15;
export const HOUR_PX = 48; // desktop (Notion's density)
export const HOUR_TOUCH_PX = 64; // phone: a quarter of an hour is 16 px under the finger
export const GUTTER_PX = 56; // the hours column

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/** How many days Săptămână fits: 7, 3 on a phone, 2 on the narrowest ones. Zi: 1. */
export function daysPerView(view, viewport) {
	if (view === "day") return 1;
	if (viewport < 360) return 2;
	if (viewport < 640) return 3;
	return 7;
}

/** The days of the window around `anchor`; a closed day with nothing booked is slim (`isSlim`). */
export function dayWindow({ anchor, dayWidth, isSlim, days = WINDOW_DAYS }) {
	return buildTimeline({ from: addDaysISO(anchor, -days), count: 2 * days + 1, dayWidth, isSlim });
}

/** True when the view (from `scrollLeft`, `viewport` wide) is nearer than EDGE_DAYS to an end of the window. */
export function nearEdge(layout, scrollLeft, viewport, edge = EDGE_DAYS) {
	const first = indexAt(layout, scrollLeft);
	const last = indexAt(layout, scrollLeft + Math.max(viewport - 1, 0));
	return first < edge || last > layout.days.length - 1 - edge;
}

/**
 * Where to scroll in `next` so that what was at the left edge in `previous` stays there: the
 * same day, at the same fraction of it. Used when the window moves (and on a resize).
 */
export function keepScroll(previous, next, scrollLeft) {
	const index = indexAt(previous, scrollLeft);
	const fraction = clamp((scrollLeft - previous.offsets[index]) / widthAt(previous, index), 0, 1);
	const day = previous.days[index];
	if (day < next.days[0] || day > next.days.at(-1)) return null;
	const target = indexOfDay(next, day);
	return next.offsets[target] + fraction * widthAt(next, target);
}

/** The scroll position that puts `day` at the left edge (clamped to the window). */
export const leftOf = (layout, day) => layout.offsets[indexOfDay(layout, day)];

/** The day at the left edge (or the one mostly in view there), for the title and the ‹ › steps. */
export function dayAtLeft(layout, scrollLeft) {
	const index = indexAt(layout, scrollLeft + 1);
	// More than half of it scrolled away: the next one is the day "at the left".
	const past = (scrollLeft - layout.offsets[index]) / widthAt(layout, index);
	return layout.days[Math.min(past > 0.5 ? index + 1 : index, layout.days.length - 1)];
}

/** Monday of the week of `day`. */
export function mondayOf(day) {
	return addDaysISO(day, -((parseISODate(day).getDay() + 6) % 7));
}

/**
 * Where ‹ › go from the day at the left edge: Zi, the next or previous open day (slim days are
 * stepped over); Săptămână, seven days on or back (a week starts with whatever day is at the left,
 * today when Azi was pressed, as Notion's).
 */
export function stepDay(layout, day, view, direction) {
	if (view === "week") return addDaysISO(day, 7 * direction);
	let index = indexOfDay(layout, day) + direction;
	while (index > 0 && index < layout.days.length - 1 && layout.slim[index]) index += direction;
	return layout.days[clamp(index, 0, layout.days.length - 1)];
}

/** The days in view, from the left edge, as { first, last } indices (at least one). */
export function daysInView(layout, scrollLeft, viewport) {
	const first = indexAt(layout, scrollLeft + 1);
	const last = indexAt(layout, scrollLeft + Math.max(viewport - 2, 0));
	return { first, last: Math.max(first, last) };
}

// ── time of day (vertical) ─────────────────────────────────────────────────────

/** The y of a minute of the day. */
export const yOf = (minute, hourPx) => (minute / 60) * hourPx;

/** The minute at y, snapped to the quarter of an hour below it, inside the day. */
export function minuteAt(y, hourPx, step = SNAP_MIN) {
	const minute = (y / hourPx) * 60;
	return clamp(Math.floor(minute / step) * step, 0, 24 * 60 - step);
}

// ── Lună (weeks, vertical) ────────────────────────────────────────────────────

/** The weeks of the window around the week of `anchor`: their Mondays. */
export function weekWindow(anchor, weeks = WINDOW_WEEKS) {
	const first = addDaysISO(mondayOf(anchor), -7 * weeks);
	return { from: first, mondays: Array.from({ length: 2 * weeks + 1 }, (_, i) => addDaysISO(first, 7 * i)) };
}

export const weekIndexOf = (window, day) => clamp(Math.floor(diffDaysISO(window.from, day) / 7), 0, window.mondays.length - 1);

/**
 * The month that is the title while weeks scroll by: the month most of the visible days belong
 * to ("YYYY-MM"). `rows` is the row height, `height` the viewport's.
 */
export function monthInView(window, scrollTop, rows, height) {
	const first = clamp(Math.floor(scrollTop / rows), 0, window.mondays.length - 1);
	const last = clamp(Math.floor((scrollTop + height - 1) / rows), 0, window.mondays.length - 1);
	const tally = new Map();
	for (let week = first; week <= last; week++) {
		// A row only partly in view counts for the part that is.
		const top = Math.max(week * rows, scrollTop);
		const bottom = Math.min((week + 1) * rows, scrollTop + height);
		const share = Math.max(0, bottom - top) / rows;
		for (let d = 0; d < 7; d++) {
			const month = addDaysISO(window.mondays[week], d).slice(0, 7);
			tally.set(month, (tally.get(month) ?? 0) + share);
		}
	}
	let best = null;
	for (const [month, count] of tally) if (!best || count > best.count) best = { month, count };
	return best?.month ?? window.mondays[first].slice(0, 7);
}

/** True when the weeks in view are nearer than EDGE_WEEKS to an end of the window. */
export function weeksNearEdge(window, scrollTop, rows, height, edge = EDGE_WEEKS) {
	const first = Math.floor(scrollTop / rows);
	const last = Math.floor((scrollTop + height - 1) / rows);
	return first < edge || last > window.mondays.length - 1 - edge;
}

/** The week row that holds the first of a month ("YYYY-MM"): where Lună goes for that month. */
export const rowOfMonth = (window, month) => weekIndexOf(window, `${month}-01`);

// ── cars in service (the row under the day headers, D15) ──────────────────────

/**
 * Every job that stays for days (or is still open) as a bar over the days the car stays: from the day it was opened to the day it was
 * delivered (or today, while it is open), cut to the days shown, on up to `lanes` lanes (a bar
 * takes the first lane free for all its days). A job that finds no lane counts in `more` for
 * each of its days. Cancelled jobs and jobs that end before `from` are left out.
 *   → { bars: [{ order, lane, from, to, open }], more: Map(day → count) }
 */
export function serviceBars(orders, { from, to, today, lanes = 3 }) {
	const spans = [];
	for (const order of orders) {
		if (order.status === "cancelled" || !order.createdAt) continue;
		const start = dayOfInstant(order.createdAt);
		const open = order.status !== "delivered";
		const end = open ? today : order.dates?.delivered ? dayOfInstant(order.dates.delivered) : start;
		// A delivered job that stayed one day is its booking already: only stays of days, or cars still here, get a bar.
		if (end < from || start > to || end < start || (!open && end === start)) continue;
		spans.push({ order, from: start < from ? from : start, to: end > to ? to : end, open });
	}
	spans.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : b.to.localeCompare(a.to)));
	const freeFrom = new Array(lanes).fill(null); // the last day each lane is taken
	const bars = [];
	const more = new Map();
	for (const span of spans) {
		const lane = freeFrom.findIndex((last) => last == null || last < span.from);
		if (lane >= 0) {
			freeFrom[lane] = span.to;
			bars.push({ ...span, lane });
		} else {
			for (let day = span.from; day <= span.to; day = addDaysISO(day, 1)) more.set(day, (more.get(day) ?? 0) + 1);
		}
	}
	return { bars, more };
}

// ── Lună sideways (months side by side, one per screen) ─────────────────────────

export const WINDOW_MONTHS = 24;

/** Months between two "YYYY-MM" (b − a). */
export const monthsBetween = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

/** The months of the window around the month of `anchor` ("YYYY-MM-DD" or "YYYY-MM"). */
export function monthWindow(anchor, months = WINDOW_MONTHS) {
	const [y, m] = anchor.slice(0, 7).split("-").map(Number);
	const keys = Array.from({ length: 2 * months + 1 }, (_, i) => {
		const date = new Date(y, m - 1 - months + i, 1);
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
	});
	return { from: keys[0], months: keys };
}

export const monthIndexOf = (window, month) => clamp(monthsBetween(window.from, month.slice(0, 7)), 0, window.months.length - 1);

// ── Zi: three days, fewer as more mechanics share a day ─────────────────────────

/**
 * How much of each day beside the middle one Zi shows: all of it (three days) with up to two
 * mechanics, then 30 % less for each mechanic more (70 %, 40 %, 10 %), none from six on (one day).
 */
export const sideShare = (mechanics) => clamp(1 - 0.3 * (Math.max(mechanics, 1) - 2), 0, 1);

/** Days across the screen: Zi one full day in the middle and a share of each neighbour; Săptămână daysPerView. */
export function visibleDays(view, viewport, mechanics = 1) {
	return view === "day" ? 1 + 2 * sideShare(mechanics) : daysPerView(view, viewport);
}

/** The scroll position that puts `day` in the middle of a viewport `viewport` wide (Zi). */
export function centerLeft(layout, day, viewport) {
	const index = indexOfDay(layout, day);
	return layout.offsets[index] + widthAt(layout, index) / 2 - viewport / 2;
}

/** The day in the middle of the view (Zi). */
export const dayAtCenter = (layout, scrollLeft, viewport) => layout.days[indexAt(layout, Math.max(0, scrollLeft + viewport / 2))];
