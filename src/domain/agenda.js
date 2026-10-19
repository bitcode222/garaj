// What the home page asks to be done (docs/HOME-PAGE.md D6, D7): the bookings still to
// confirm, with the ones whose time passed with nothing recorded, and the invoices still
// to collect. Pure; the store's selectors call these.

import { addDaysISO, dayOfInstant, diffDaysISO } from "./dates.js";
import { invoiceFlow } from "./flow.js";
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
 * group per day, for AGENDA_DAYS days from today. `week` counts those days' bookings by status
 * (cancelled ones aside), for the progress line under them.
 *   { groups: [{ key: "past" | day, day, items }], total, week: { scheduled, confirmed, arrived, done, no_show } }
 */
export function bookingsToConfirm(appointments, { now, days = AGENDA_DAYS }) {
	const today = dayOfInstant(now);
	const last = addDaysISO(today, days - 1);
	const first = addDaysISO(today, -days);
	const week = { scheduled: 0, confirmed: 0, arrived: 0, done: 0, no_show: 0 };
	const past = [];
	const byDay = new Map();
	for (const appointment of appointments) {
		if (appointment.status === "cancelled") continue;
		const day = dayOfInstant(appointment.start);
		if (day >= today && day <= last && appointment.status in week) week[appointment.status] += 1;
		if (bookingPassed(appointment, now)) {
			if (day >= first) past.push(appointment);
			continue;
		}
		if (appointment.status !== "scheduled" || day < today || day > last) continue;
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
 */
export function invoicesToCollect(invoices, paymentsByInvoice, { today }) {
	const lists = new Map(COLLECT_ORDER.map((key) => [key, []]));
	for (const invoice of invoices) {
		const flow = invoiceFlow(invoice, { payments: paymentsByInvoice.get(invoice.id) ?? [], today });
		const list = lists.get(flow.state);
		if (!list) continue;
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
