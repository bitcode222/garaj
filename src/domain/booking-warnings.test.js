import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { bookingAlert, bookingWarnings, freeSlot, freeStaff, jobWarnings } from "./booking-warnings.js";
import { combineDateTime } from "./dates.js";
import { confirmationMessage } from "./reminders.js";

// Monday 19 October 2026; the shop opens 08:00–18:00, Monday to Saturday.
const DAY = "2026-10-19";
const at = (time, day = DAY) => combineDateTime(day, time);
const HOURS = { open: "08:00", close: "18:00", days: [1, 2, 3, 4, 5, 6] };
const STAFF = [
	{ id: "m1", name: "Andrei", active: true },
	{ id: "m2", name: "Mihai", active: true },
	{ id: "m3", name: "Ionuț", active: true },
];
const BAYS = [
	{ id: "b1", active: true },
	{ id: "b2", active: true },
	{ id: "b3", active: true },
];
const booking = (id, from, to, fields = {}) => ({ id, status: "confirmed", start: at(from, fields.day), end: at(to, fields.day), staffId: "m1", bayId: "b1", customerId: "c1", vehicleId: "v1", title: "", ...fields });
const kinds = (list) => list.map((w) => w.kind);
const ctx = (fields = {}) => ({ now: at("09:00"), staff: STAFF, bays: BAYS, hours: HOURS, customer: { id: "c1", phone: "0722000000" }, ...fields });

describe("booking warnings", () => {
	test("nothing for cancelled, no-show and finished bookings", () => {
		for (const status of ["cancelled", "no_show", "done"]) assert.deepEqual(bookingWarnings(booking("a", "07:00", "08:00", { status }), ctx()), []);
	});

	test("a booking whose time passed with nothing recorded is missed, however old", () => {
		const old = booking("a", "10:00", "11:00", { day: "2026-10-01" });
		const [w] = bookingWarnings(old, ctx());
		assert.equal(w.kind, "missed");
		assert.equal(w.severity, "danger");
		assert.deepEqual(w.fixes.map((f) => f.id), ["checkin", "no_show", "reschedule"]);
	});

	test("late after the grace, from the booked or the announced time; call only with a phone", () => {
		const a = booking("a", "08:30", "10:00");
		assert.deepEqual(kinds(bookingWarnings(a, ctx({ now: at("08:40") }))), []); // inside the grace
		const late = bookingWarnings(a, ctx({ now: at("09:00") }))[0];
		assert.equal(late.kind, "late");
		assert.equal(late.minutes, 30);
		assert.equal(late.announced, false);
		assert.deepEqual(late.fixes.map((f) => f.id), ["call", "checkin", "delayBy", "delayBy", "no_show"]);
		const announced = bookingWarnings({ ...a, expectedAt: at("08:45") }, ctx({ now: at("09:10") }))[0];
		assert.equal(announced.kind, "late");
		assert.equal(announced.minutes, 25);
		assert.equal(announced.since, at("08:45"));
		const noPhone = bookingWarnings(a, ctx({ now: at("09:00"), customer: { id: "c1" } }));
		assert.deepEqual(kinds(noPhone), ["late", "noPhone"]);
		assert.ok(!noPhone[0].fixes.some((f) => f.id === "call"));
	});

	test("an announced arrival at or after the end asks to move the booking there", () => {
		const a = booking("a", "10:00", "11:00", { expectedAt: at("11:30") });
		const [w] = bookingWarnings(a, ctx());
		assert.equal(w.kind, "delayOverrun");
		assert.deepEqual(w.fixes, [{ id: "moveTo", start: at("11:30"), end: at("12:30") }]);
	});

	test("an overlap names each other booking and why, with a free slot, a free mechanic and a free elevator", () => {
		const a = booking("a", "10:00", "11:00");
		const b = booking("b", "10:30", "11:30", { staffId: "m1", bayId: "b2" });
		const c = booking("c", "09:00", "10:15", { staffId: "m2", bayId: "b1" });
		const sameDay = [a, b, c];
		const [w] = bookingWarnings(a, ctx({ sameDay }));
		assert.equal(w.kind, "overlap");
		assert.deepEqual(
			w.with.map((x) => [x.id, x.reason]),
			[
				["c", "bay"],
				["b", "staff"],
			],
		);
		// Andrei is busy until 11:30 and elevator 1 until 10:15: the first free hour for both is 11:30.
		assert.deepEqual(w.fixes[0], { id: "moveTo", start: at("11:30"), end: at("12:30") });
		assert.deepEqual(w.fixes[1], { id: "assign", staffId: "m3" }); // Mihai is on c
		assert.deepEqual(w.fixes[2], { id: "bay", bayId: "b3" }); // b2 is on b
		assert.equal(w.fixes.at(-1).id, "open");
	});

	test("an overlap with a car already in moves the booking still to come", () => {
		const inShop = booking("a", "09:00", "11:00", { status: "arrived" });
		const next = booking("b", "10:00", "11:00", { bayId: "b2" });
		const [w] = bookingWarnings(inShop, ctx({ now: at("09:30"), sameDay: [inShop, next] }));
		assert.equal(w.kind, "overlap");
		assert.deepEqual(w.fixes[0], { id: "moveOther", appointmentId: "b", start: at("11:00"), end: at("12:00") });
	});

	test("two cars already in on one elevator: another elevator, free for that time", () => {
		const one = booking("a", "09:00", "12:00", { status: "arrived", staffId: "m1" });
		const two = booking("b", "10:00", "13:00", { status: "arrived", staffId: "m2" });
		const [w] = bookingWarnings(one, ctx({ now: at("10:30"), sameDay: [one, two] }));
		assert.deepEqual(w.with.map((x) => x.reason), ["bay"]);
		assert.deepEqual(w.fixes.map((f) => f.id), ["bay", "open"]);
		assert.equal(w.fixes[0].bayId, "b2");
	});

	test("overlaps that are over, or with cancelled bookings, say nothing", () => {
		const a = booking("a", "10:00", "11:00");
		const cancelled = booking("b", "10:00", "11:00", { status: "cancelled" });
		assert.deepEqual(kinds(bookingWarnings(a, ctx({ sameDay: [a, cancelled] }))), []);
	});

	test("without a mechanic, or with an inactive one, it suggests the free ones; a shop without mechanics is not warned", () => {
		const a = booking("a", "10:00", "11:00", { staffId: null });
		const busy = booking("b", "10:00", "12:00", { staffId: "m2", bayId: "b2" });
		const [w] = bookingWarnings(a, ctx({ sameDay: [a, busy] }));
		assert.equal(w.kind, "unassigned");
		assert.deepEqual(w.fixes, [{ id: "assign", staffId: "m1" }, { id: "assign", staffId: "m3" }, { id: "edit" }]);
		assert.equal(bookingWarnings({ ...a, staffId: "gone" }, ctx())[0].inactiveId, "gone");
		assert.deepEqual(kinds(bookingWarnings(a, ctx({ staff: [] }))), []);
	});

	test("not confirmed: warned today (before it starts) and tomorrow, not later", () => {
		const today = booking("a", "15:00", "16:00", { status: "scheduled" });
		const tomorrow = booking("b", "09:00", "10:00", { status: "scheduled", day: "2026-10-20" });
		const later = booking("c", "09:00", "10:00", { status: "scheduled", day: "2026-10-21" });
		assert.deepEqual(bookingWarnings(today, ctx())[0], { kind: "unconfirmed", severity: "warning", start: today.start, when: "today", fixes: [{ id: "confirm" }, { id: "remind" }, { id: "call" }] });
		assert.equal(bookingWarnings(tomorrow, ctx())[0].when, "tomorrow");
		assert.deepEqual(kinds(bookingWarnings(later, ctx())), []);
	});

	test("outside the hours or on a closed day, with the first free slot in the hours", () => {
		const early = booking("a", "07:00", "08:00", { status: "confirmed" });
		const [w] = bookingWarnings(early, ctx({ now: at("06:00") }));
		assert.equal(w.kind, "closed");
		assert.equal(w.closedDay, false);
		assert.deepEqual(w.fixes[0], { id: "moveTo", start: at("08:00"), end: at("09:00") });
		const sunday = booking("b", "10:00", "11:00", { day: "2026-10-18" });
		const taken = booking("c", "08:00", "09:00", { day: "2026-10-19" });
		const [s] = bookingWarnings(sunday, ctx({ now: at("07:00", "2026-10-17"), bookingsOn: (d) => (d === "2026-10-19" ? [taken] : []) }));
		assert.equal(s.kind, "closed");
		assert.equal(s.closedDay, true);
		assert.deepEqual(s.fixes[0], { id: "moveTo", start: at("10:00"), end: at("11:00") }); // the same hour, the next open day
	});

	test("ITP or RCA expired, or expiring within 30 days of the visit", () => {
		const a = booking("a", "10:00", "11:00");
		const vehicle = { id: "v1", itpExpiry: "2026-09-01", rcaExpiry: "2026-11-10" };
		const docs = bookingWarnings(a, ctx({ vehicle })).find((w) => w.kind === "documents");
		assert.deepEqual(docs.docs, [
			{ doc: "itp", date: "2026-09-01", expired: true },
			{ doc: "rca", date: "2026-11-10", expired: false },
		]);
		assert.equal(docs.severity, "info");
		assert.equal(bookingWarnings(a, ctx({ vehicle: { itpExpiry: "2027-06-01" } })).length, 0);
	});

	test("danger first, then warning, then info", () => {
		const a = booking("a", "08:30", "10:00", { status: "scheduled", staffId: null });
		const list = bookingWarnings(a, ctx({ now: at("09:00"), customer: { id: "c1" }, vehicle: { itpExpiry: "2026-09-01" } }));
		assert.deepEqual(kinds(list), ["late", "unassigned", "documents", "noPhone"]);
	});

	test("the cards' summary has no fixes and no info", () => {
		const a = booking("a", "08:30", "10:00", { status: "scheduled", staffId: null });
		const alert = bookingAlert(a, ctx({ now: at("09:00"), customer: { id: "c1" }, vehicle: { itpExpiry: "2026-09-01" } }));
		assert.equal(alert.severity, "danger");
		assert.deepEqual(kinds(alert.list), ["late", "unassigned"]);
		assert.ok(alert.list.every((w) => w.fixes.length === 0));
		assert.equal(bookingAlert(booking("b", "12:00", "13:00"), ctx()), null);
	});
});

describe("job warnings", () => {
	const order = (status, fields = {}) => ({ id: "o1", status, lines: [{ id: "l" }], dates: {}, activity: [], createdAt: at("08:00", "2026-10-15"), ...fields });

	test("ready for a day or more, waiting for parts for two, an estimate not approved for one", () => {
		assert.deepEqual(jobWarnings(order("ready", { dates: { ready: at("16:00") } }), { now: at("17:00") }), []);
		assert.equal(jobWarnings(order("ready", { dates: { ready: at("16:00", "2026-10-17") } }), { now: at("09:00") })[0].days, 2);
		assert.deepEqual(jobWarnings(order("waiting_parts", { dates: { waiting_parts: at("10:00", "2026-10-18") } }), { now: at("09:00") }), []);
		const parts = jobWarnings(order("waiting_parts", { dates: { waiting_parts: at("10:00", "2026-10-16") }, activity: [{ type: "status", to: "waiting_parts", reason: "plăcuțe" }] }), { now: at("09:00") })[0];
		assert.deepEqual([parts.kind, parts.days, parts.what], ["parts", 3, "plăcuțe"]);
		const estimate = jobWarnings(order("estimate"), { now: at("09:00") })[0];
		assert.deepEqual([estimate.kind, estimate.days], ["estimate", 4]);
		assert.deepEqual(estimate.fixes.map((f) => f.id), ["approve", "sendEstimate", "openJob"]);
	});

	test("today, a job past its booking: by how much, the mechanic's next booking, until when to extend", () => {
		const appointment = booking("a", "09:00", "10:00", { status: "arrived" });
		const next = booking("b", "11:00", "12:00");
		const [w] = jobWarnings(order("in_progress"), { now: at("10:40"), appointment, sameDay: [appointment, next] });
		assert.equal(w.kind, "overrun");
		assert.equal(w.minutes, 40);
		assert.equal(w.next.id, "b");
		assert.deepEqual(w.fixes, [{ id: "extend", end: at("11:15") }, { id: "extend", end: at("11:45") }, { id: "ready" }]);
		assert.deepEqual(jobWarnings(order("in_progress"), { now: at("10:10"), appointment, sameDay: [] }), []); // inside the grace
	});
});

describe("asking for a confirmation", () => {
	test("says when (today, tomorrow, a date), the time, the car and the shop", () => {
		const settings = { shop: { name: "Garaj Auto" } };
		const vehicle = { make: "Dacia", model: "Logan", plate: "B123ABC" };
		const today = confirmationMessage({ appointment: booking("a", "15:00", "16:00"), customer: { name: "Ion Popescu" }, vehicle, settings, today: DAY });
		assert.match(today, /programarea de azi, ora 15:00, pentru Dacia Logan \(B 123 ABC\)\. Confirmați, vă rugăm\? Garaj Auto$/);
		assert.match(confirmationMessage({ appointment: booking("a", "09:00", "10:00", { day: "2026-10-20" }), settings, today: DAY }), /^Bună ziua! .*de mâine, ora 09:00, pentru mașina dvs\./);
		assert.match(confirmationMessage({ appointment: booking("a", "09:00", "10:00", { day: "2026-10-23" }), settings, today: DAY }), /din 23\.10\.2026/);
	});
});

describe("free slots and people", () => {
	test("the free slot closest to the booked time, the later one on a tie", () => {
		const a = booking("a", "12:00", "13:00");
		const block = booking("b", "11:30", "13:30");
		// 10:30 and 13:30 are both 90 min away: the later one wins.
		assert.deepEqual(freeSlot(a, [a, block], { now: at("07:00"), hours: HOURS }), { start: at("13:30"), end: at("14:30") });
	});

	test("a free slot respects the hours, now, both the mechanic and the elevator, and closed days", () => {
		const a = booking("a", "10:00", "11:00");
		const until17 = booking("b", "08:00", "17:30");
		assert.equal(freeSlot(a, [a, until17], { now: at("07:00"), hours: HOURS }), null); // only 17:30–18:30 would be left, past closing
		assert.deepEqual(freeSlot(a, [a], { now: at("12:07"), hours: HOURS }), { start: at("12:15"), end: at("13:15") });
		assert.equal(freeSlot(booking("s", "10:00", "11:00", { day: "2026-10-18" }), [], { now: at("07:00", "2026-10-18"), hours: HOURS }), null);
	});

	test("free mechanics: active, not the current one, least booked first", () => {
		const a = booking("a", "10:00", "11:00");
		const m2Morning = booking("b", "08:00", "09:00", { staffId: "m2" });
		assert.deepEqual(freeStaff(a, [a, m2Morning], [...STAFF, { id: "m4", active: false }], 3), ["m3", "m2"]);
	});
});
