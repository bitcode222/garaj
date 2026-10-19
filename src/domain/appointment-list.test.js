import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { appointmentHay, appointmentStats, groupByDay, listAppointments, periodRange, sortAppointments } from "./appointment-list.js";
import { queryTokens } from "./search.js";

// Local-time instants, so the tests do not depend on the machine's time zone.
const at = (day, hour, minute = 0) => new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`).toISOString();
const TODAY = "2026-10-18"; // a Sunday
const NOW = at(TODAY, 11, 20);
const lookups = {
	customers: { c1: { name: "Ioana Vasile", phone: "0722 123 456" }, c2: { name: "Ștefan Ionescu", phone: "0733000111" } },
	vehicles: { v1: { plate: "B264EAL", make: "Dacia", model: "Spring" }, v2: { plate: "IF74ZXX", make: "Audi", model: "A4" } },
	services: { s1: { name: "Revizie" } },
};
const booking = (id, day, hour, status = "scheduled", fields = {}) => ({ id, start: at(day, hour), end: at(day, hour + 1), status, customerId: "c1", vehicleId: "v1", staffId: "m1", createdAt: at("2026-10-01", 9), ...fields });

describe("periods", () => {
	test("today, the next seven days, this week (from Monday), this month, past and upcoming", () => {
		assert.deepEqual(periodRange("today", TODAY), { from: TODAY, to: TODAY });
		assert.deepEqual(periodRange("next7", TODAY), { from: TODAY, to: "2026-10-24" });
		assert.deepEqual(periodRange("week", TODAY), { from: "2026-10-12", to: "2026-10-18" });
		assert.deepEqual(periodRange("week", "2026-10-19"), { from: "2026-10-19", to: "2026-10-25" });
		assert.deepEqual(periodRange("month", TODAY), { from: "2026-10-01", to: "2026-10-31" });
		assert.deepEqual(periodRange("month", "2026-02-10"), { from: "2026-02-01", to: "2026-02-28" });
		assert.deepEqual(periodRange("past", TODAY), { from: null, to: "2026-10-17" });
		assert.deepEqual(periodRange("upcoming", TODAY), { from: TODAY, to: null });
		assert.deepEqual(periodRange("custom", TODAY, { from: "2026-10-01" }), { from: "2026-10-01", to: null });
		assert.deepEqual(periodRange("all", TODAY), { from: null, to: null });
	});
});

describe("search", () => {
	test("by number, customer without diacritics, phone digits, plate with or without spaces, car and operation", () => {
		const hay = appointmentHay(booking("a", TODAY, 9, "scheduled", { number: 143, serviceIds: ["s1"], customerId: "c2" }), lookups);
		for (const query of ["#143", "stefan", "0733000111", "B 264 EAL", "b264eal", "dacia spring", "revizie"]) assert.ok(queryTokens(query).every((token) => hay.includes(token)), query);
	});
});

describe("the list", () => {
	const list = [
		booking("past", "2026-10-15", 9, "done"),
		booking("missed", "2026-10-16", 9, "scheduled"),
		booking("today", TODAY, 15, "scheduled"),
		booking("confirmed", "2026-10-19", 9, "confirmed", { staffId: "m2" }),
		booking("far", "2026-11-20", 9, "scheduled"),
		booking("cancelled", "2026-10-20", 9, "cancelled"),
		booking("unassigned", "2026-10-21", 9, "scheduled", { staffId: null, customerId: "c2", vehicleId: "v2" }),
	];
	const run = (options) => listAppointments(list, { today: TODAY, now: NOW, lookups, ...options });

	test("upcoming by default, soonest first, cancelled ones only under their chip", () => {
		const { rows, counts } = run({});
		assert.deepEqual(rows.map((a) => a.id), ["today", "confirmed", "unassigned", "far"]);
		assert.equal(counts.all, 4);
		assert.equal(counts.cancelled, 1);
		assert.deepEqual(run({ status: "cancelled" }).rows.map((a) => a.id), ["cancelled"]);
	});

	test("'De confirmat' is Azi's rule, whatever the period: the next week's unconfirmed ones and the ones that passed unanswered", () => {
		const { rows, counts } = run({ status: "to-confirm", period: "today" });
		assert.deepEqual(rows.map((a) => a.id), ["missed", "today", "unassigned"]);
		assert.equal(counts["to-confirm"], 3);
	});

	test("past ones latest first; a mechanic, or nobody; the search narrows, the counts do not follow it", () => {
		assert.deepEqual(run({ period: "past" }).rows.map((a) => a.id), ["missed", "past"]);
		assert.deepEqual(run({ staff: "m2" }).rows.map((a) => a.id), ["confirmed"]);
		assert.deepEqual(run({ staff: "none" }).rows.map((a) => a.id), ["unassigned"]);
		const searched = run({ tokens: queryTokens("audi") });
		assert.deepEqual(searched.rows.map((a) => a.id), ["unassigned"]);
		assert.equal(searched.counts.all, 4);
	});

	test("sorted by creation or by customer when asked", () => {
		const rows = [booking("a", TODAY, 9, "scheduled", { createdAt: "1" }), booking("b", TODAY, 10, "scheduled", { createdAt: "2", customerId: "c2" })];
		assert.deepEqual(sortAppointments(rows, "created", { customers: lookups.customers }).map((a) => a.id), ["b", "a"]);
		assert.deepEqual(sortAppointments(rows, "customer", { customers: lookups.customers }).map((a) => a.id), ["a", "b"]);
	});

	test("grouped by day, each day with its booked time (cancelled and no-shows aside)", () => {
		const groups = groupByDay([booking("a", TODAY, 9), booking("b", TODAY, 11, "no_show"), booking("c", "2026-10-19", 9)]);
		assert.deepEqual(groups.map((g) => [g.day, g.items.length, g.minutes]), [[TODAY, 2, 60], ["2026-10-19", 1, 60]]);
	});
});

describe("the four numbers", () => {
	test("today and the next one, to confirm, no-shows in 30 days, this week's load against open hours", () => {
		const list = [
			booking("early", TODAY, 9, "arrived"),
			booking("next", TODAY, 13, "confirmed"),
			booking("later", TODAY, 16, "scheduled"),
			booking("noShow", "2026-10-14", 9, "no_show"),
			booking("done", "2026-10-13", 9, "done"),
			booking("old", "2026-08-01", 9, "no_show"),
		];
		const stats = appointmentStats(list, { today: TODAY, now: NOW, staff: [{ id: "m1" }, { id: "m2" }], hours: { open: "08:00", close: "18:00", days: [1, 2, 3, 4, 5, 6] } });
		assert.equal(stats.today.count, 3);
		assert.equal(stats.today.next.id, "next");
		assert.equal(stats.toConfirm, 1);
		assert.equal(Math.round(stats.noShow * 100), 33); // 1 no-show out of 3 decided (today's arrival counts)
		assert.equal(stats.load.booked, 4 * 60); // 12–18 Oct: three today and one on the 13th, the no-show aside
		assert.equal(stats.load.capacity, 10 * 60 * 6 * 2);
	});
});

describe("a mechanic at a glance", () => {
	test("the day's bookings and time against the open hours, the week's count, the open jobs latest first", async () => {
		const { mechanicSummary } = await import("./appointment-list.js");
		const list = [
			booking("a", "2026-10-19", 9, "confirmed", { staffId: "m1" }),
			booking("b", "2026-10-19", 11, "scheduled", { staffId: "m1", end: at("2026-10-19", 13) }),
			booking("c", "2026-10-19", 14, "cancelled", { staffId: "m1" }),
			booking("d", "2026-10-21", 9, "done", { staffId: "m1" }),
			booking("e", "2026-10-19", 9, "confirmed", { staffId: "m2" }),
			booking("f", "2026-10-26", 9, "confirmed", { staffId: "m1" }),
		];
		const orders = [
			{ id: "j1", staffId: "m1", status: "in_progress", createdAt: "2026-10-10" },
			{ id: "j2", staffId: "m1", status: "delivered", createdAt: "2026-10-11" },
			{ id: "j3", staffId: "m1", status: "ready", createdAt: "2026-10-12" },
		];
		const summary = mechanicSummary("m1", { appointments: list, workOrders: orders, day: "2026-10-19", hours: { open: "08:00", close: "18:00", days: [1, 2, 3, 4, 5, 6] }, openStatuses: ["estimate", "approved", "in_progress", "waiting_parts", "ready"] });
		assert.deepEqual(summary.day, { count: 2, minutes: 180, share: 0.3, open: true });
		assert.equal(summary.weekCount, 3); // a, b, d (19–25 Oct)
		assert.deepEqual(summary.jobs.map((o) => o.id), ["j3", "j1"]);
		const sunday = mechanicSummary("m1", { appointments: list, workOrders: orders, day: TODAY, hours: { open: "08:00", close: "18:00", days: [1, 2, 3, 4, 5, 6] }, openStatuses: [] });
		assert.deepEqual(sunday.day, { count: 0, minutes: 0, share: null, open: false });
	});
});
