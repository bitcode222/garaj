// The stretch of dates the home page's sections show, chosen on the day ruler (docs/TIMEFRAME-RULER.md).
// A window is { from, to }: inclusive "YYYY-MM-DD" days, moved with addDaysISO (never milliseconds,
// so daylight saving changes nothing).

import { addDaysISO, diffDaysISO } from "./dates.js";

/** How long a window can be, in days, and how long it is until the user changes it. */
export const SPAN = { min: 1, max: 60, initial: 7 };

/** How far from today a window can go, in days. */
export const BOUNDS = { back: 730, ahead: 365 };

/** Its length in days (both ends counting). */
export const spanOf = ({ from, to }) => diffDaysISO(from, to) + 1;

/** The window of `days` days around `center`: as many days before as after (one more after for an even length). */
export function windowAround(center, days) {
	const from = addDaysISO(center, -Math.floor((days - 1) / 2));
	return { from, to: addDaysISO(from, days - 1) };
}

/** Its middle day (for an even length, the earlier of the two): what windowAround was centred on. */
export const middleOf = (window) => addDaysISO(window.from, Math.floor((spanOf(window) - 1) / 2));

/** A length kept within SPAN. */
export const clampSpan = (days) => Math.min(SPAN.max, Math.max(SPAN.min, Math.round(Number(days) || SPAN.initial)));

/**
 * A window kept to the rules: its length within SPAN (shortened from its end), and inside BOUNDS around
 * `today`, moved back in whole (never cut) when it went past either end.
 */
export function clampWindow({ from, to }, today) {
	const days = clampSpan(diffDaysISO(from, to) + 1);
	const min = addDaysISO(today, -BOUNDS.back);
	const max = addDaysISO(today, BOUNDS.ahead);
	let start = from < min ? min : from;
	let end = addDaysISO(start, days - 1);
	if (end > max) {
		end = max;
		start = addDaysISO(end, -(days - 1));
	}
	return { from: start, to: end };
}
