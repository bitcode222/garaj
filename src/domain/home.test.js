import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { AGENDA_DAYS, bookingPassed, bookingsToConfirm, invoicesToCollect } from "./agenda.js";
import { averageTicket, billedHours, change, collected, homeAnalytics, periodWindow, received, showRate, timeInService } from "./analytics.js";

// Local-time instants, so the tests do not depend on the machine's time zone.
const at = (day, hour, minute = 0) => new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`).toISOString();
const TODAY = "2026-10-17";
const NOW = at(TODAY, 11, 20);

describe("periods", () => {
	test("7 and 30 days end today; the period before has the same length and ends the day before it starts", () => {
		const week = periodWindow(TODAY, "7d");
		assert.equal(week.unit, "day");
		assert.deepEqual([week.from, week.to, week.keys.length], ["2026-10-11", TODAY, 7]);
		const before = periodWindow(TODAY, "7d", 1);
		assert.deepEqual([before.from, before.to], ["2026-10-04", "2026-10-10"]);
		const month = periodWindow(TODAY, "30d");
		assert.deepEqual([month.from, month.keys.length], ["2026-09-18", 30]);
	});

	test("12 months go per month, ending with this month; the year before ends the same day a year earlier", () => {
		const year = periodWindow(TODAY, "12m");
		assert.equal(year.unit, "month");
		assert.deepEqual([year.keys[0], year.keys[11], year.from, year.to], ["2025-11", "2026-10", "2025-11-01", TODAY]);
		const before = periodWindow(TODAY, "12m", 1);
		assert.deepEqual([before.keys[0], before.keys[11], before.to], ["2024-11", "2025-10", "2025-10-17"]);
	});
});

describe("metrics", () => {
	const week = periodWindow(TODAY, "7d");

	test("money collected by payment date; nothing in the window is empty, not zero-with-data", () => {
		const payments = [
			{ date: "2026-10-12", amount: 10_000 },
			{ date: "2026-10-12", amount: 5_000 },
			{ date: TODAY, amount: 2_500 },
			{ date: "2026-10-01", amount: 99_999 },
		];
		const result = collected(payments, week);
		assert.equal(result.value, 17_500);
		assert.deepEqual(result.points, [0, 15_000, 0, 0, 0, 0, 2_500]);
		assert.equal(result.empty, false);
		assert.equal(collected([], week).empty, true);
	});

	test("cars received are jobs opened, by their local day; months add up over a year", () => {
		const orders = [{ createdAt: at("2026-10-11", 8) }, { createdAt: at("2026-10-11", 17) }, { createdAt: at("2026-09-02", 9) }];
		assert.deepEqual(received(orders, week).points, [2, 0, 0, 0, 0, 0, 0]);
		const year = received(orders, periodWindow(TODAY, "12m"));
		assert.deepEqual(year.points.slice(-2), [1, 2]);
		assert.equal(year.value, 3);
	});

	const invoice = (issueDate, net, hours, fields = {}) => ({ status: "issued", number: 1, issueDate, totals: { net, hours }, ...fields });

	test("the average ticket counts real invoices, nets stornos out, ignores drafts", () => {
		const invoices = [
			invoice("2026-10-12", 40_000, 2),
			invoice("2026-10-13", 20_000, 1),
			invoice("2026-10-13", 30_000, 1, { status: "cancelled" }),
			invoice("2026-10-14", -30_000, -1, { stornoOf: "x" }),
			{ status: "draft", number: null, issueDate: "2026-10-14", totals: { net: 99_000, hours: 9 } },
		];
		const ticket = averageTicket(invoices, week);
		assert.equal(ticket.value, 30_000); // (40 000 + 20 000 + 30 000 − 30 000) / 2 tickets
		assert.equal(ticket.points[0], null);
		assert.equal(ticket.points[1], 40_000);
		assert.equal(billedHours(invoices, week).value, 3);
		assert.equal(averageTicket([], week).value, null);
	});

	test("show rate: arrived or done out of the decided bookings; undecided and cancelled ones do not count", () => {
		const booking = (day, status) => ({ start: at(day, 10), status });
		const list = [booking("2026-10-12", "done"), booking("2026-10-12", "no_show"), booking("2026-10-13", "arrived"), booking("2026-10-13", "scheduled"), booking("2026-10-14", "cancelled")];
		const rate = showRate(list, week);
		assert.equal(rate.value, 2 / 3);
		assert.deepEqual(rate.points.slice(0, 4), [null, 0.5, 1, null]);
		assert.equal(showRate([booking("2026-10-12", "scheduled")], week).empty, true);
	});

	test("time in service: the median days from opened to ready, by the day it became ready", () => {
		const job = (opened, ready) => ({ createdAt: opened, dates: { ready } });
		const jobs = [job(at("2026-10-10", 9), at("2026-10-12", 9)), job(at("2026-10-12", 9), at("2026-10-12", 21)), job(at("2026-10-12", 8), at("2026-10-13", 8)), { createdAt: at("2026-10-12", 8), dates: {} }];
		const stay = timeInService(jobs, week);
		assert.equal(stay.value, 1); // 2, 0.5 and 1 days
		assert.equal(stay.points[1], 1.25); // the median of 2 and 0.5
	});

	test("change: percent against the period before, points for rates, which way is good, nothing against an empty period", () => {
		assert.deepEqual(change(110, 100), { pct: 10, points: false, direction: "up", good: true });
		assert.equal(change(1, 2, { better: "down" }).good, true);
		const rate = change(0.9, 0.95, { points: true });
		assert.equal(Math.round(rate.pct), -5);
		assert.equal(rate.good, false);
		assert.equal(change(5, 0), null);
		assert.equal(change(null, 3), null);
		assert.equal(change(4, 4).direction, "flat");
	});

	test("homeAnalytics compares each number with the same-length period before it, and hides the change when either is empty", () => {
		const payments = [
			{ date: "2026-10-12", amount: 12_000 },
			{ date: "2026-10-05", amount: 10_000 },
		];
		const result = homeAnalytics({ payments, workOrders: [{ createdAt: at(TODAY, 9) }], invoices: [], appointments: [] }, { today: TODAY, period: "7d" });
		assert.equal(Math.round(result.collected.change.pct), 20);
		assert.equal(result.received.change, null); // nothing the week before
		assert.equal(result.ticket.empty, true);
		assert.equal(result.window.keys.length, 7);
	});
});

describe("bookings to confirm", () => {
	const booking = (id, day, hour, status = "scheduled", fields = {}) => ({ id, start: at(day, hour), end: at(day, hour + 1), status, ...fields });

	test("a booking has passed when it is a quarter of an hour late today or was never received on an earlier day", () => {
		assert.equal(bookingPassed(booking("a", TODAY, 11), NOW), true); // 80 min late
		assert.equal(bookingPassed(booking("b", TODAY, 11, "scheduled", { start: at(TODAY, 11, 10) }), NOW), false); // inside the grace
		assert.equal(bookingPassed(booking("c", "2026-10-15", 9, "confirmed"), NOW), true);
		assert.equal(bookingPassed(booking("d", "2026-10-15", 9, "arrived"), NOW), false);
		assert.equal(bookingPassed(booking("e", TODAY, 10, "scheduled", { expectedAt: at(TODAY, 12) }), NOW), false); // the customer said noon
	});

	test("past ones first (latest first, the last week only), then the unconfirmed ones per day for a week; confirmed ones are not asked again", () => {
		const list = [
			booking("late", TODAY, 9),
			booking("missed", "2026-10-15", 9, "confirmed"),
			booking("forgotten", "2026-10-01", 9),
			booking("today", TODAY, 15),
			booking("confirmedToday", TODAY, 16, "confirmed"),
			booking("tomorrow2", "2026-10-18", 14),
			booking("tomorrow1", "2026-10-18", 9),
			booking("lastDay", "2026-10-23", 9),
			booking("tooFar", "2026-10-24", 9),
			booking("cancelled", "2026-10-19", 9, "cancelled"),
		];
		const { groups, total, week } = bookingsToConfirm(list, { now: NOW });
		assert.deepEqual(
			groups.map((group) => [group.key, group.items.map((a) => a.id)]),
			[
				["past", ["late", "missed"]],
				[TODAY, ["today"]],
				["2026-10-18", ["tomorrow1", "tomorrow2"]],
				["2026-10-23", ["lastDay"]],
			],
		);
		assert.equal(total, 6);
		assert.deepEqual(week, { scheduled: 5, confirmed: 1, arrived: 0, done: 0, no_show: 0 }); // today's late one is still this week's
		assert.equal(AGENDA_DAYS, 7);
	});

	test("nothing to confirm is an empty list, not an error", () => {
		assert.deepEqual(bookingsToConfirm([], { now: NOW }), { groups: [], total: 0, week: { scheduled: 0, confirmed: 0, arrived: 0, done: 0, no_show: 0 } });
	});
});

describe("invoices to collect", () => {
	const invoice = (id, fields = {}) => ({ id, status: "issued", number: 1, issueDate: "2026-10-01", dueDate: "2026-10-20", createdAt: at("2026-10-01", 9), totals: { gross: 10_000 }, ...fields });

	test("overdue, part-paid, issued, then drafts; paid, cancelled and storno invoices are not there; amounts are what is left", () => {
		const invoices = [
			invoice("paid"),
			invoice("late1", { dueDate: "2026-10-10" }),
			invoice("late2", { dueDate: "2026-09-30" }),
			invoice("part"),
			invoice("soon", { dueDate: "2026-10-18" }),
			invoice("later", { dueDate: "2026-10-30" }),
			invoice("draft", { status: "draft", number: null, dueDate: null, totals: { gross: 4_000 } }),
			invoice("cancelled", { status: "cancelled" }),
			invoice("storno", { stornoOf: "cancelled", totals: { gross: -10_000 } }),
		];
		const payments = new Map([
			["paid", [{ amount: 10_000 }]],
			["part", [{ amount: 2_500 }]],
		]);
		const result = invoicesToCollect(invoices, payments, { today: TODAY });
		assert.deepEqual(
			result.groups.map((group) => [group.key, group.items.map((item) => item.invoice.id), group.amount]),
			[
				["overdue", ["late2", "late1"], 20_000],
				["partial", ["part"], 7_500],
				["issued", ["soon", "later"], 20_000],
				["draft", ["draft"], 4_000],
			],
		);
		assert.equal(result.total, 6);
		assert.equal(result.due, 47_500);
		assert.equal(result.drafts, 4_000);
		const late = result.groups[0].items[0];
		assert.equal(late.overdueDays, 17);
		assert.equal(late.dueIn, -17);
		assert.equal(result.groups[2].items[0].dueIn, 1);
	});

	test("nothing to collect", () => {
		assert.deepEqual(invoicesToCollect([], new Map(), { today: TODAY }), { groups: [], total: 0, due: 0, drafts: 0 });
	});
});
