// The home page's analytics (docs/HOME-PAGE.md D9): a few numbers over a period, each
// with one point per day (per month over a year) for its chart, and its change against
// the period before, of the same length. Money is in bani; nothing here formats.

import { addDaysISO, addMonthsISO, dayOfInstant, monthKey } from "./dates.js";
import { isRevenue } from "./reports.js";

export const PERIODS = ["7d", "30d", "12m"];

const DAY_MS = 86_400_000;

/**
 * The buckets of a period that ends today: days for "7d" and "30d", months for "12m".
 * `back` = 1 is the period before it, the same length.
 *   { unit: "day" | "month", keys: ["2026-10-11", …] or ["2025-11", …], from, to }
 * `from` and `to` are "YYYY-MM-DD", both included.
 */
export function periodWindow(today, period, back = 0) {
	if (period === "12m") {
		const to = back ? addMonthsISO(today, -12 * back) : today;
		const first = addMonthsISO(`${monthKey(to)}-01`, -11);
		const keys = Array.from({ length: 12 }, (_, i) => monthKey(addMonthsISO(first, i)));
		return { unit: "month", keys, from: first, to };
	}
	const length = period === "30d" ? 30 : 7;
	const to = addDaysISO(today, -length * back);
	const keys = Array.from({ length }, (_, i) => addDaysISO(to, i - length + 1));
	return { unit: "day", keys, from: keys[0], to };
}

/** For each bucket of the window, the items whose day (`dayOf`, a "YYYY-MM-DD" or null) falls in it. */
function bucketed(items, window, dayOf) {
	const index = new Map(window.keys.map((key, i) => [key, i]));
	const buckets = window.keys.map(() => []);
	for (const item of items) {
		const day = dayOf(item);
		if (!day || day < window.from || day > window.to) continue;
		const i = index.get(window.unit === "month" ? monthKey(day) : day);
		if (i != null) buckets[i].push(item);
	}
	return buckets;
}

const sum = (list, valueOf) => list.reduce((total, item) => total + valueOf(item), 0);

function median(values) {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Every metric is { value, points, empty }: `value` for the whole window (null when it cannot
 * be told, e.g. an average of nothing), `points` one per bucket (null where there is nothing),
 * `empty` when the window has no data at all ("Fără date").
 */

/** Money collected (payments, by their date). */
export function collected(payments, window) {
	const buckets = bucketed(payments, window, (p) => p.date);
	const points = buckets.map((list) => sum(list, (p) => p.amount));
	return { value: sum(points, (v) => v), points, empty: buckets.every((list) => !list.length) };
}

/** Cars received: jobs opened, by the day they were opened. */
export function received(workOrders, window) {
	const buckets = bucketed(workOrders, window, (o) => (o.createdAt ? dayOfInstant(o.createdAt) : null));
	const points = buckets.map((list) => list.length);
	return { value: sum(points, (v) => v), points, empty: points.every((v) => !v) };
}

// Revenue as in Rapoarte: every numbered invoice counts (a storno nets its original out);
// only real invoices count as tickets.
const isTicket = (invoice) => !invoice.stornoOf && invoice.status !== "cancelled";

/** The average invoice, net of VAT. */
export function averageTicket(invoices, window) {
	const buckets = bucketed(invoices.filter(isRevenue), window, (i) => i.issueDate);
	const average = (list) => {
		const tickets = list.filter(isTicket).length;
		return tickets ? Math.round(sum(list, (i) => i.totals.net) / tickets) : null;
	};
	return { value: average(buckets.flat()), points: buckets.map(average), empty: buckets.every((list) => !list.length) };
}

/** Labour hours billed on invoices. */
export function billedHours(invoices, window) {
	const buckets = bucketed(invoices.filter(isRevenue), window, (i) => i.issueDate);
	const points = buckets.map((list) => sum(list, (i) => i.totals.hours ?? 0));
	return { value: sum(points, (v) => v), points, empty: buckets.every((list) => !list.length) };
}

const SHOWED = new Set(["arrived", "done"]);

/**
 * How many booked customers came, out of the bookings that were decided (arrived, done or
 * no-show), as a fraction. Undecided and cancelled bookings do not count either way.
 */
export function showRate(appointments, window) {
	const decided = appointments.filter((a) => SHOWED.has(a.status) || a.status === "no_show");
	const buckets = bucketed(decided, window, (a) => dayOfInstant(a.start));
	const rate = (list) => (list.length ? list.filter((a) => SHOWED.has(a.status)).length / list.length : null);
	return { value: rate(buckets.flat()), points: buckets.map(rate), empty: buckets.every((list) => !list.length) };
}

/** How long a car stays: the median days from the job being opened to it being ready, by the day it became ready. */
export function timeInService(workOrders, window) {
	const finished = workOrders.filter((o) => o.dates?.ready && o.createdAt && o.dates.ready >= o.createdAt);
	const buckets = bucketed(finished, window, (o) => dayOfInstant(o.dates.ready));
	const days = (list) => median(list.map((o) => (new Date(o.dates.ready) - new Date(o.createdAt)) / DAY_MS));
	return { value: days(buckets.flat()), points: buckets.map(days), empty: buckets.every((list) => !list.length) };
}

/**
 * The change from the previous period: `pct` in percent (or, with `points`, the difference in
 * percentage points, for rates), its direction, and whether that is good (`better`: "up" or
 * "down"). null when there is nothing to compare with, so no "+∞%".
 */
export function change(current, previous, { better = "up", points = false } = {}) {
	if (current == null || previous == null || (!points && previous === 0)) return null;
	const pct = points ? (current - previous) * 100 : ((current - previous) / Math.abs(previous)) * 100;
	const direction = Math.abs(pct) < 0.05 ? "flat" : pct > 0 ? "up" : "down";
	return { pct, points, direction, good: direction === "flat" ? null : (direction === "up") === (better === "up") };
}

/**
 * The home page's six numbers for a period ending today, each with its change against the
 * period before. `data` holds arrays: payments, workOrders, invoices, appointments.
 */
export function homeAnalytics({ payments, workOrders, invoices, appointments }, { today, period }) {
	const current = periodWindow(today, period);
	const before = periodWindow(today, period, 1);
	const metric = (measure, options) => {
		const now = measure(current);
		const then = measure(before);
		return { ...now, change: now.empty || then.empty ? null : change(now.value, then.value, options) };
	};
	return {
		window: current,
		collected: metric((w) => collected(payments, w)),
		received: metric((w) => received(workOrders, w)),
		ticket: metric((w) => averageTicket(invoices, w)),
		show: metric((w) => showRate(appointments, w), { points: true }),
		stay: metric((w) => timeInService(workOrders, w), { better: "down" }),
		hours: metric((w) => billedHours(invoices, w)),
	};
}
