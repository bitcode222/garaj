// Geometry of the dashboard's continuous timeline (docs/DASHBOARD-CALENDAR.md §7):
// days side by side, each from the first to the last shown hour. Pure functions
// between a scroll position and a day and time, so they are unit-tested; relative
// imports with ".js" let `npm test` load this file without the bundler.

import { addDaysISO, diffDaysISO } from "../../domain/dates.js";

export const HOUR_MIN_PX = 72; // narrowest hour; below it a day scrolls inside itself (phones)
export const SLIM_PX = 48; // a closed day with nothing booked
export const DAYS_BACK = 180;
export const DAYS_AHEAD = 365;
export const READING_POINT = 0.3; // the day under this fraction of the grid is "the day in view"

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * The hours every day shows: shop hours, widened to whole hours that cover
 * bookings outside them, but never further than 06:00 to 22:00 (unless the shop
 * itself opens earlier or closes later). `spans` are [startMinute, endMinute].
 */
export function timelineHours({ open, close }, spans = []) {
	let start = Math.floor(open / 60) * 60;
	let end = Math.ceil(close / 60) * 60;
	const earliest = Math.min(start, 6 * 60);
	const latest = Math.max(end, 22 * 60);
	for (const [from, to] of spans) {
		start = Math.min(start, Math.max(earliest, Math.floor(from / 60) * 60));
		end = Math.max(end, Math.min(latest, Math.ceil(to / 60) * 60));
	}
	return { start, end: Math.max(end, start + 60) };
}

/**
 * Lays `count` days out from `from`. A slim day (closed, nothing booked) takes
 * SLIM_PX, every other day `dayWidth`. `offsets[i]` is where day i starts.
 */
export function buildTimeline({ from, count, dayWidth, isSlim }) {
	const days = new Array(count);
	const slim = new Uint8Array(count);
	const offsets = new Float64Array(count + 1);
	for (let i = 0; i < count; i++) {
		const day = addDaysISO(from, i);
		days[i] = day;
		slim[i] = isSlim(day) ? 1 : 0;
		offsets[i + 1] = offsets[i] + (slim[i] ? SLIM_PX : dayWidth);
	}
	return { from, days, slim, offsets, dayWidth, total: offsets[count] };
}

export const widthAt = (layout, index) => layout.offsets[index + 1] - layout.offsets[index];

/** Index of `day`, clamped into the laid-out range. */
export const indexOfDay = (layout, day) => clamp(diffDaysISO(layout.from, day), 0, layout.days.length - 1);

export const hasDay = (layout, day) => day >= layout.days[0] && day <= layout.days[layout.days.length - 1];

/** Index of the day that covers `x` (binary search over the offsets). */
export function indexAt(layout, x) {
	let low = 0;
	let high = layout.days.length - 1;
	while (low < high) {
		const middle = (low + high + 1) >> 1;
		if (layout.offsets[middle] <= x) low = middle;
		else high = middle - 1;
	}
	return low;
}

/** Where a time of a day is. A slim day has no hours: its middle. */
export function xOf(layout, hours, day, minute) {
	const index = indexOfDay(layout, day);
	const width = widthAt(layout, index);
	if (layout.slim[index]) return layout.offsets[index] + width / 2;
	return layout.offsets[index] + ((clamp(minute, hours.start, hours.end) - hours.start) / (hours.end - hours.start)) * width;
}

/** The day and minute at `x`. */
export function instantAt(layout, hours, x) {
	const index = indexAt(layout, x);
	const fraction = clamp((x - layout.offsets[index]) / widthAt(layout, index), 0, 1);
	return { index, day: layout.days[index], minute: Math.round(hours.start + fraction * (hours.end - hours.start)) };
}

/** Days in view, and the ones to render: those plus `spare` on each side. */
export function daysInView(layout, scrollLeft, viewport, spare = 1) {
	const firstVisible = indexAt(layout, scrollLeft);
	const lastVisible = indexAt(layout, scrollLeft + Math.max(viewport - 1, 0));
	return { firstVisible, lastVisible, first: Math.max(0, firstVisible - spare), last: Math.min(layout.days.length - 1, lastVisible + spare) };
}

/** Furthest the timeline scrolls. */
export const maxScroll = (layout, viewport) => Math.max(0, layout.total - viewport);

/**
 * Scroll position that shows a time of a day, with the time at `align` of the grid
 * (0.3 = the reading point, 0.5 = centred) but without leaving the day: a day that
 * fits the grid is shown whole, from its first hour.
 */
export function scrollToShow(layout, hours, day, minute, viewport, align = READING_POINT) {
	const index = indexOfDay(layout, day);
	const dayStart = layout.offsets[index];
	const room = Math.max(0, widthAt(layout, index) - viewport);
	return clamp(clamp(xOf(layout, hours, day, minute) - viewport * align, dayStart, dayStart + room), 0, maxScroll(layout, viewport));
}

/** Scroll position that keeps a time exactly under the reading point (resize, zoom, data change). */
export function scrollToKeep(layout, hours, day, minute, viewport) {
	return clamp(xOf(layout, hours, day, minute) - viewport * READING_POINT, 0, maxScroll(layout, viewport));
}

/** The day ‹ › lands on from `index`: `steps` days on, slim days not counted. */
export function stepIndex(layout, index, direction, steps = 1) {
	const last = layout.days.length - 1;
	let current = index;
	for (let taken = 0; taken < steps; taken++) {
		let next = current + direction;
		while (next > 0 && next < last && layout.slim[next]) next += direction;
		if (next < 0 || next > last) break;
		current = next;
	}
	return current;
}
