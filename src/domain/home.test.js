import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { AGENDA_DAYS, ESTIMATE_STAGES, JOB_STAGES, bookingPassed, bookingsToConfirm, dayMarks, invoicesToCollect, jobDeadline, jobsToShow } from "./agenda.js";
import { SPAN, clampWindow, middleOf, spanOf, windowAround } from "./timeframe.js";
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

		test("all: the week as a whole, every booking of its days (cancelled aside) in the same groups", () => {
		const list = [booking("late", TODAY, 9), booking("today", TODAY, 15), booking("confirmedToday", TODAY, 16, "confirmed"), booking("doneYesterday", "2026-10-16", 9, "done"), booking("tomorrow1", "2026-10-18", 9), booking("cancelled", "2026-10-19", 9, "cancelled")];
		const { groups, total, week } = bookingsToConfirm(list, { now: NOW, all: true });
		assert.deepEqual(
			groups.map((group) => [group.key, group.items.map((a) => a.id)]),
			[
				["past", ["late"]],
				[TODAY, ["today", "confirmedToday"]],
				["2026-10-18", ["tomorrow1"]],
			],
		);
		assert.equal(total, 4);
		assert.deepEqual(week, { scheduled: 3, confirmed: 1, arrived: 0, done: 0, no_show: 0 });
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

	test("a stretch of dates keeps the invoices created in it or falling due in it, whatever their state", () => {
		const invoices = [
			invoice("oldOverdue", { createdAt: at("2026-09-01", 9), dueDate: "2026-10-10" }),
			invoice("recent", { createdAt: at("2026-10-12", 9), dueDate: "2026-10-30" }),
			invoice("dueSoon", { createdAt: at("2026-09-15", 9), dueDate: "2026-10-20" }),
			invoice("noDates", { createdAt: null, issueDate: null, dueDate: "2026-11-30" }),
			invoice("todayDraft", { status: "draft", number: null, dueDate: null, createdAt: at(TODAY, 10) }),
			invoice("oldDraft", { status: "draft", number: null, dueDate: null, createdAt: at("2026-08-01", 10) }),
		];
		const ids = (from, to) => invoicesToCollect(invoices, new Map(), { today: TODAY, from, to }).groups.flatMap((group) => group.items.map((item) => item.invoice.id));
		// One with neither a creation nor an issue date is always kept.
		assert.deepEqual(ids(TODAY, TODAY), ["noDates", "todayDraft"]);
		assert.deepEqual(ids("2026-10-11", TODAY), ["recent", "noDates", "todayDraft"]);
		// The week ahead: nothing is created in it, but an invoice falls due in it.
		assert.deepEqual(ids("2026-10-18", "2026-10-24"), ["dueSoon", "noDates"]);
		assert.deepEqual(ids("2026-10-01", "2026-10-31"), ["oldOverdue", "dueSoon", "recent", "noDates", "todayDraft"]);
		// No dates: all of them (drafts oldest first).
		assert.deepEqual(ids(null, null), ["oldOverdue", "dueSoon", "recent", "noDates", "oldDraft", "todayDraft"]);
	});

	test("nothing to collect", () => {
		assert.deepEqual(invoicesToCollect([], new Map(), { today: TODAY }), { groups: [], total: 0, due: 0, drafts: 0 });
	});
});

describe("jobs and estimates on the home page", () => {
	const SETTINGS = { invoicing: { vatPayer: false } };
	const job = (id, status, created, gross = 0) => ({ id, status, createdAt: at(created, 9), lines: gross ? [{ id: `${id}-l`, kind: "labor", qty: 1, unitPrice: gross, discountPct: 0, vatRate: 0 }] : [] });
	const orders = [
		job("waiting", "waiting_parts", "2026-10-07"),
		job("working", "in_progress", "2026-10-14", 10_000),
		job("ready", "ready", TODAY, 5_000),
		job("handedOld", "delivered", "2026-09-01"),
		job("handed1", "delivered", "2026-10-15"),
		job("handed2", "delivered", "2026-10-16"),
		job("estimate", "estimate", TODAY, 2_000),
		job("approved", "approved", "2026-10-12"),
		job("cancelled", "cancelled", TODAY),
	];
	const shape = (result) => result.groups.map((group) => [group.key, group.items.map((o) => o.id)]);

	test("Lucrări: under way, waiting for parts, finished, handed over (the latest first); estimates and cancelled jobs are not there", () => {
		const all = jobsToShow(orders, { today: TODAY, stages: JOB_STAGES, settings: SETTINGS });
		assert.deepEqual(shape(all), [
			["in_progress", ["working"]],
			["waiting_parts", ["waiting"]],
			["ready", ["ready"]],
			["delivered", ["handed2", "handed1", "handedOld"]],
		]);
		assert.equal(all.total, 6);
		assert.equal(all.amount, 15_000);
		assert.equal(all.groups[0].amount, 10_000);
	});

	test("a stretch of dates keeps the jobs created in it", () => {
		// 7 days, today counting: from 11 Oct on; the job waiting for parts since the 7th is left out.
		assert.deepEqual(shape(jobsToShow(orders, { from: "2026-10-11", to: TODAY, stages: JOB_STAGES, settings: SETTINGS })), [
			["in_progress", ["working"]],
			["ready", ["ready"]],
			["delivered", ["handed2", "handed1"]],
		]);
		assert.deepEqual(shape(jobsToShow(orders, { from: TODAY, to: TODAY, stages: JOB_STAGES, settings: SETTINGS })), [["ready", ["ready"]]]);
	});

	test("Devize: waiting for the customer, then approved and not started", () => {
		const estimates = jobsToShow(orders, { today: TODAY, stages: ESTIMATE_STAGES, settings: SETTINGS });
		assert.deepEqual(shape(estimates), [
			["estimate", ["estimate"]],
			["approved", ["approved"]],
		]);
		assert.equal(estimates.amount, 2_000);
	});
});

describe("the day ruler's window", () => {
	test("around a day: as many days before as after (one more after for an even length); its middle is that day", () => {
		assert.deepEqual(windowAround(TODAY, 7), { from: "2026-10-14", to: "2026-10-20" });
		assert.deepEqual(windowAround(TODAY, 1), { from: TODAY, to: TODAY });
		assert.deepEqual(windowAround(TODAY, 30), { from: "2026-10-03", to: "2026-11-01" });
		for (const days of [1, 2, 7, 30, 60]) {
			assert.equal(spanOf(windowAround(TODAY, days)), days);
			assert.equal(middleOf(windowAround(TODAY, days)), TODAY);
		}
	});

	test("kept to the rules: 1 to 60 days, two years back and one ahead, moved back in whole, never cut", () => {
		assert.equal(spanOf(clampWindow({ from: TODAY, to: "2027-06-01" }, TODAY)), SPAN.max);
		assert.deepEqual(clampWindow({ from: "2023-01-01", to: "2023-01-07" }, TODAY), { from: "2024-10-17", to: "2024-10-23" });
		assert.deepEqual(clampWindow({ from: "2027-10-14", to: "2027-10-20" }, TODAY), { from: "2027-10-11", to: "2027-10-17" });
		assert.deepEqual(clampWindow({ from: "2026-10-14", to: "2026-10-20" }, TODAY), { from: "2026-10-14", to: "2026-10-20" });
		// Across a daylight saving change (25 Oct 2026 in Romania): still whole days.
		assert.deepEqual(windowAround("2026-10-25", 3), { from: "2026-10-24", to: "2026-10-26" });
	});
});

describe("deadlines and the ruler's bullets", () => {
	const SETTINGS = { invoicing: { vatPayer: false } };
	const appointments = [
		{ id: "a1", status: "arrived", start: at(TODAY, 9), end: at("2026-10-20", 17), workOrderId: "j1" },
		{ id: "a2", status: "confirmed", start: at("2026-10-19", 9), end: at("2026-10-19", 10) },
		{ id: "a3", status: "cancelled", start: at("2026-10-19", 11), end: at("2026-10-19", 12) },
		{ id: "a4", status: "arrived", start: at(TODAY, 8), end: at(TODAY, 9) },
	];
	const workOrders = [
		{ id: "j1", status: "in_progress", appointmentId: "a1", createdAt: at("2026-10-07", 9), lines: [] },
		{ id: "j2", status: "estimate", appointmentId: "a4", createdAt: at(TODAY, 8), lines: [] },
		{ id: "j3", status: "ready", appointmentId: null, createdAt: at("2026-10-16", 9), lines: [] },
		{ id: "j4", status: "cancelled", createdAt: at(TODAY, 9), lines: [] },
	];
	const invoices = [
		{ id: "f1", status: "issued", number: 1, issueDate: "2026-10-15", dueDate: "2026-10-22", createdAt: at("2026-10-15", 9), totals: { gross: 10_000 } },
		{ id: "f2", status: "issued", number: 2, issueDate: "2026-10-01", dueDate: "2026-10-22", createdAt: at("2026-10-01", 9), totals: { gross: 10_000 } },
	];
	const byId = Object.fromEntries(appointments.map((a) => [a.id, a]));

	test("a job's deadline is the end of its booking while it is not finished; a walk-in or a finished job has none", () => {
		assert.equal(jobDeadline(workOrders[0], byId.a1), "2026-10-20");
		assert.equal(jobDeadline(workOrders[1], byId.a4), TODAY);
		assert.equal(jobDeadline(workOrders[2], null), null);
		assert.equal(jobDeadline({ ...workOrders[0], status: "ready" }, byId.a1), null);
	});

	test("a job created before the dates still shows when its deadline is in them", () => {
		const result = jobsToShow(workOrders, { from: "2026-10-18", to: "2026-10-24", stages: JOB_STAGES, settings: SETTINGS, appointments: byId });
		assert.deepEqual(result.groups.map((g) => [g.key, g.items.map((o) => o.id)]), [["in_progress", ["j1"]]]);
	});

	test("bullets: one count per kind and day; deadlines as their own kinds; cancelled and paid records draw nothing", () => {
		const marks = dayMarks({ appointments, workOrders, invoices, paymentsByInvoice: new Map([["f2", [{ amount: 10_000 }]]]), today: TODAY });
		assert.deepEqual(marks.get(TODAY), { booking: 2, estimate: 1, estimateDue: 1 });
		assert.deepEqual(marks.get("2026-10-19"), { booking: 1 });
		assert.deepEqual(marks.get("2026-10-07"), { job: 1 });
		assert.deepEqual(marks.get("2026-10-20"), { jobDue: 1 });
		assert.deepEqual(marks.get("2026-10-16"), { job: 1 });
		assert.deepEqual(marks.get("2026-10-15"), { invoice: 1 });
		assert.deepEqual(marks.get("2026-10-22"), { invoiceDue: 1 });
		assert.equal(marks.get("2026-10-01"), undefined);
	});

	test("bookings over a stretch of dates in the past: what passed unrecorded is 'past', the rest by day", () => {
		const list = [
			{ id: "b1", status: "scheduled", start: at("2026-10-12", 9), end: at("2026-10-12", 10) },
			{ id: "b2", status: "done", start: at("2026-10-13", 9), end: at("2026-10-13", 10) },
			{ id: "b3", status: "no_show", start: at("2026-10-14", 9), end: at("2026-10-14", 10) },
			{ id: "b4", status: "scheduled", start: at("2026-10-02", 9), end: at("2026-10-02", 10) },
		];
		const { groups, week } = bookingsToConfirm(list, { now: NOW, all: true, from: "2026-10-10", to: "2026-10-16" });
		assert.deepEqual(groups.map((g) => [g.key, g.items.map((a) => a.id)]), [
			["past", ["b1"]],
			["2026-10-13", ["b2"]],
			["2026-10-14", ["b3"]],
		]);
		assert.deepEqual(week, { scheduled: 1, confirmed: 0, arrived: 0, done: 1, no_show: 1 });
	});
});
