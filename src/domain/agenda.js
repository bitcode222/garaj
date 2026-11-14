// What the home page asks to be done (docs/HOME-PAGE.md D6, D7): the bookings still to
// confirm, with the ones whose time passed with nothing recorded, and the invoices still
// to collect. Pure; the store's selectors call these.

import { addDaysISO, dayOfInstant, diffDaysISO } from "./dates.js";
import { invoiceFlow } from "./flow.js";
import { orderTotals } from "./work-order.js";
import { arrivalDelay } from "./visit.js";

/** How far ahead "De confirmat" looks (today included), and how far back "Au trecut" does. */
export const AGENDA_DAYS = 7;

/**
 * A booking whose time passed with nothing recorded: booked for today and not here a quarter
 * of an hour on (or after the time the customer announced), or booked for an earlier day and
 * never received.
 */
export function bookingPassed(appointment, now) {
	if (appointment.status !== "scheduled" && appointment.status !== "confirmed") return false;
	const day = dayOfInstant(appointment.start);
	const today = dayOfInstant(now);
	return day < today || (day === today && arrivalDelay(appointment, now) > 0);
}

const byStart = (a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0);

/**
 * The bookings that wait for the shop, as groups: "past" first (time passed, nothing recorded,
 * the last AGENDA_DAYS days, the latest first), then the unconfirmed ones still to come, one
 * group per day, for AGENDA_DAYS days from today. `all` lists every booking of those days instead
 * (confirmed, arrived, done and no-show ones too), so the week is whole. `from`–`to` (inclusive
 * "YYYY-MM-DD") replace the days from today with any stretch of dates, past or future: its passed
 * unrecorded bookings form "past", the others are grouped by day. `week` counts those days' bookings
 * by status (cancelled ones aside), for the line under them.
 *   { groups: [{ key: "past" | day, day, items }], total, week: { scheduled, confirmed, arrived, done, no_show } }
 */
export function bookingsToConfirm(appointments, { now, days = AGENDA_DAYS, all = false, from = null, to = null }) {
	const today = dayOfInstant(now);
	const ranged = from != null && to != null;
	const last = ranged ? to : addDaysISO(today, days - 1);
	const first = ranged ? from : addDaysISO(today, -days);
	const lower = ranged ? from : today;
	const week = { scheduled: 0, confirmed: 0, arrived: 0, done: 0, no_show: 0 };
	const past = [];
	const byDay = new Map();
	for (const appointment of appointments) {
		if (appointment.status === "cancelled") continue;
		const day = dayOfInstant(appointment.start);
		if (day >= lower && day <= last && appointment.status in week) week[appointment.status] += 1;
		if (bookingPassed(appointment, now)) {
			if (day >= first && day <= last) past.push(appointment);
			continue;
		}
		if ((!all && appointment.status !== "scheduled") || day < lower || day > last) continue;
		const list = byDay.get(day);
		if (list) list.push(appointment);
		else byDay.set(day, [appointment]);
	}
	const groups = [];
	if (past.length) groups.push({ key: "past", day: null, items: past.sort(byStart).reverse() });
	for (const day of [...byDay.keys()].sort()) groups.push({ key: day, day, items: byDay.get(day).sort(byStart) });
	return { groups, total: groups.reduce((n, group) => n + group.items.length, 0), week };
}

/** The order of "Facturi": what is late first, what is not even issued last. */
export const COLLECT_ORDER = ["overdue", "partial", "issued", "draft"];

const SORT = {
	overdue: (a, b) => b.overdueDays - a.overdueDays,
	partial: (a, b) => (a.invoice.dueDate ?? "9") < (b.invoice.dueDate ?? "9") ? -1 : 1,
	issued: (a, b) => (a.invoice.dueDate ?? "9") < (b.invoice.dueDate ?? "9") ? -1 : 1,
	draft: (a, b) => (a.invoice.createdAt < b.invoice.createdAt ? -1 : 1),
};

/**
 * Every invoice not collected yet, grouped in COLLECT_ORDER (paid, cancelled and storno ones
 * are not). An item: { invoice, state, total, paid, balance, overdueDays, dueIn }; a draft's
 * balance is its total (nothing was asked yet), `dueIn` is days to the due date (negative
 * when past). `due` is what was asked and not paid (drafts aside); `drafts` what is not asked yet.
 * `from`–`to` (inclusive "YYYY-MM-DD"): only the invoices created in those dates (the day of
 * `createdAt`, else the issue date; one with neither is kept) or falling due in them.
 */
export function invoicesToCollect(invoices, paymentsByInvoice, { today, from = null, to = null }) {
	const lists = new Map(COLLECT_ORDER.map((key) => [key, []]));
	for (const invoice of invoices) {
		const flow = invoiceFlow(invoice, { payments: paymentsByInvoice.get(invoice.id) ?? [], today });
		const list = lists.get(flow.state);
		if (!list) continue;
		// A stretch of dates keeps what was created in it, or falls due in it (the ruler's "!" bullets).
		if (from != null && to != null) {
			const created = invoice.createdAt ? dayOfInstant(invoice.createdAt) : invoice.issueDate;
			const due = flow.state !== "draft" ? invoice.dueDate : null;
			const inRange = (day) => Boolean(day) && day >= from && day <= to;
			if (created && !inRange(created) && !inRange(due)) continue;
		}
		const draft = flow.state === "draft";
		list.push({
			invoice,
			state: flow.state,
			total: flow.total,
			paid: flow.paid,
			balance: draft ? flow.total : flow.balance,
			overdueDays: flow.overdueDays,
			dueIn: !draft && invoice.dueDate ? diffDaysISO(today, invoice.dueDate) : null,
		});
	}
	const groups = COLLECT_ORDER.filter((key) => lists.get(key).length).map((key) => {
		const items = lists.get(key).sort(SORT[key]);
		return { key, items, amount: items.reduce((n, item) => n + item.balance, 0) };
	});
	const amountOf = (key) => groups.find((group) => group.key === key)?.amount ?? 0;
	return {
		groups,
		total: groups.reduce((n, group) => n + group.items.length, 0),
		due: amountOf("overdue") + amountOf("partial") + amountOf("issued"),
		drafts: amountOf("draft"),
	};
}

/** The home page's "Devize": the estimates waiting for the customer, then the approved ones not started yet. */
export const ESTIMATE_STAGES = ["estimate", "approved"];
/** The home page's "Lucrări": the jobs under way, waiting for parts, finished, then handed over. */
export const JOB_STAGES = ["in_progress", "waiting_parts", "ready", "delivered"];

/** The stages a job can still run late in: not finished yet. */
export const DUE_STAGES = ["estimate", "approved", "in_progress", "waiting_parts"];

/** A job's deadline: the day its booking ends, while it is not finished (a walk-in has none). null otherwise. */
export function jobDeadline(order, appointment) {
	return DUE_STAGES.includes(order.status) && appointment?.end ? dayOfInstant(appointment.end) : null;
}

/**
 * The jobs in the given `stages`, grouped in that order, for the home page's Devize and Lucrări.
 * `from`–`to` (inclusive "YYYY-MM-DD") keeps the jobs created in those dates, or whose deadline is in
 * them (`appointments` by id, for the deadline). Open jobs come longest-waiting first; handed-over
 * ones, the latest first. A group's `amount` is its jobs' total with VAT (bani), `amount` sums them.
 *   { groups: [{ key, items: [order], amount }], total, amount }
 */
export function jobsToShow(workOrders, { from = null, to = null, stages, settings, appointments = {} }) {
	const ranged = from != null && to != null;
	const inRange = (day) => Boolean(day) && day >= from && day <= to;
	const lists = new Map(stages.map((key) => [key, []]));
	for (const order of workOrders) {
		const list = lists.get(order.status);
		if (!list) continue;
		if (ranged && order.createdAt && !inRange(dayOfInstant(order.createdAt)) && !inRange(jobDeadline(order, appointments[order.appointmentId]))) continue;
		list.push(order);
	}
	const groups = stages
		.filter((key) => lists.get(key).length)
		.map((key) => {
			const items = lists.get(key).sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
			if (key === "delivered") items.reverse();
			return { key, items, amount: items.reduce((sum, order) => sum + orderTotals(order, settings).gross, 0) };
		});
	return { groups, total: groups.reduce((n, group) => n + group.items.length, 0), amount: groups.reduce((n, group) => n + group.amount, 0) };
}

/** What the ruler's bullets stand for, in their order (docs/TIMEFRAME-RULER.md §4); each may also be due ("!"). */
export const MARK_KINDS = ["booking", "estimate", "job", "invoice"];

/**
 * The ruler's bullets: for each day, how many of each kind fall on it. `booking`: a booking (cancelled
 * ones aside); `estimate`, `job`: a record of Devize or Lucrări created; `invoice`: an invoice not
 * collected yet created; and the deadlines: `estimateDue`, `jobDue` (the booking ends, the job is not
 * finished), `invoiceDue` (due, not paid). The same records the sections show for those days.
 *   Map("YYYY-MM-DD" → { booking?, estimate?, job?, invoice?, estimateDue?, jobDue?, invoiceDue? })
 */
export function dayMarks({ appointments = [], workOrders = [], invoices = [], paymentsByInvoice = new Map(), today }) {
	const marks = new Map();
	const add = (day, kind) => {
		if (!day) return;
		let mark = marks.get(day);
		if (!mark) marks.set(day, (mark = {}));
		mark[kind] = (mark[kind] ?? 0) + 1;
	};
	const byId = new Map(appointments.map((appointment) => [appointment.id, appointment]));
	for (const appointment of appointments) if (appointment.status !== "cancelled") add(dayOfInstant(appointment.start), "booking");
	for (const order of workOrders) {
		const estimate = ESTIMATE_STAGES.includes(order.status);
		if (!estimate && !JOB_STAGES.includes(order.status)) continue;
		if (order.createdAt) add(dayOfInstant(order.createdAt), estimate ? "estimate" : "job");
		add(jobDeadline(order, byId.get(order.appointmentId)), estimate ? "estimateDue" : "jobDue");
	}
	for (const invoice of invoices) {
		const flow = invoiceFlow(invoice, { payments: paymentsByInvoice.get(invoice.id) ?? [], today });
		if (!COLLECT_ORDER.includes(flow.state)) continue;
		add(invoice.createdAt ? dayOfInstant(invoice.createdAt) : invoice.issueDate, "invoice");
		if (flow.state !== "draft") add(invoice.dueDate, "invoiceDue");
	}
	return marks;
}
