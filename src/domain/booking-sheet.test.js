import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { bookingWarnings, warningSection } from "./booking-warnings.js";
import { customerFacts } from "./customer.js";
import { relativeTo } from "./dates.js";
import { bookingNow } from "./flow.js";
import { operationsEstimate } from "./lines.js";
import { lastJob } from "./vehicle.js";

// The booking's sheet (docs/APPOINTMENT-SHEET.md): what its sections read from the domain.

// Local-time instants, so the tests do not depend on the machine's time zone.
const at = (day, hour, minute = 0) => new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`).toISOString();
const DAY = "2026-10-16";
const booking = (fields = {}) => ({ id: "a1", status: "scheduled", start: at(DAY, 14), end: at(DAY, 15), activity: [], customerId: "c1", ...fields });
const ids = (fixes) => fixes.map((f) => f.id);
const now = (appointment, time, { phone = true, order = null } = {}) => {
	const warnings = bookingWarnings(appointment, { now: time, order, customer: { id: "c1", phone: phone ? "0722123456" : "" } });
	return bookingNow(appointment, { now: time, order, warnings, phone });
};

describe("when, against now", () => {
	test("ahead, under way, past: the minutes from or since", () => {
		assert.deepEqual(relativeTo(at(DAY, 14), at(DAY, 15), at(DAY, 11, 30)), { kind: "ahead", minutes: 150 });
		assert.deepEqual(relativeTo(at(DAY, 14), at(DAY, 15), at(DAY, 14, 10)), { kind: "now", minutes: 10 });
		assert.deepEqual(relativeTo(at(DAY, 14), at(DAY, 15), at(DAY, 17)), { kind: "past", minutes: 120 });
	});
});

describe("the operations' estimate", () => {
	test("time in minutes and price with VAT in bani; an operation's own rate wins; no VAT for a non-payer", () => {
		const ops = [
			{ name: "Revizie", hours: 1, price: 10000 },
			{ name: "Geometrie", hours: 0.5, price: 5000 },
			{ name: "Taxă", hours: 0, price: 1000, vatRate: 0 },
		];
		assert.deepEqual(operationsEstimate(ops, { vatPayer: true, vatRate: 21 }), { minutes: 90, gross: 12100 + 6050 + 1000 });
		assert.deepEqual(operationsEstimate(ops, { vatPayer: false, vatRate: 21 }), { minutes: 90, gross: 16000 });
		assert.deepEqual(operationsEstimate([], {}), { minutes: 0, gross: 0 });
	});
});

describe("what the shop knows about the customer and the car", () => {
	test("visits are jobs handed over; the last is the latest handover; no-shows are counted", () => {
		const workOrders = [
			{ id: "j1", customerId: "c1", status: "delivered", dates: { delivered: "2026-08-12T15:00:00.000Z" }, createdAt: "2026-08-12T08:00:00.000Z" },
			{ id: "j2", customerId: "c1", status: "delivered", dates: {}, createdAt: "2026-09-01T08:00:00.000Z" },
			{ id: "j3", customerId: "c1", status: "in_progress", createdAt: "2026-10-15T08:00:00.000Z" },
			{ id: "j4", customerId: "c1", status: "cancelled", createdAt: "2026-10-01T08:00:00.000Z" },
			{ id: "j5", customerId: "c2", status: "delivered", dates: { delivered: "2026-10-10T15:00:00.000Z" }, createdAt: "2026-10-10T08:00:00.000Z" },
		];
		const appointments = [booking({ status: "no_show" }), booking({ id: "a2", status: "done" }), booking({ id: "a3", status: "no_show", customerId: "c2" })];
		assert.deepEqual(customerFacts("c1", { appointments, workOrders }), { visits: 2, lastVisit: "2026-09-01T08:00:00.000Z", noShows: 1 });
		assert.deepEqual(customerFacts("c9", { appointments, workOrders }), { visits: 0, lastVisit: null, noShows: 0 });
	});

	test("the car's last job: the latest one, cancelled ones and the booking's own job aside", () => {
		const workOrders = [
			{ id: "j1", vehicleId: "v1", status: "delivered", createdAt: "2026-08-12T08:00:00.000Z" },
			{ id: "j2", vehicleId: "v1", status: "cancelled", createdAt: "2026-09-12T08:00:00.000Z" },
			{ id: "j3", vehicleId: "v1", status: "in_progress", createdAt: "2026-10-12T08:00:00.000Z" },
			{ id: "j4", vehicleId: "v2", status: "delivered", createdAt: "2026-10-13T08:00:00.000Z" },
		];
		assert.equal(lastJob("v1", workOrders).id, "j3");
		assert.equal(lastJob("v1", workOrders, { except: "j3" }).id, "j1");
		assert.equal(lastJob("v9", workOrders), null);
	});
});

describe("each warning sits next to what it is about", () => {
	test("the time, the mechanic, the car; the rest is the Acum card's", () => {
		assert.equal(warningSection("overlap"), "time");
		assert.equal(warningSection("closed"), "time");
		assert.equal(warningSection("delayOverrun"), "time");
		assert.equal(warningSection("unassigned"), "staff");
		assert.equal(warningSection("documents"), "car");
		for (const kind of ["late", "missed", "unconfirmed", "noPhone", "pickup", "overrun"]) assert.equal(warningSection(kind), "now");
	});
});

describe("the Acum card", () => {
	test("booked days ahead: confirm first, then ask on WhatsApp or call; the car may still come", () => {
		const card = now(booking({ start: at("2026-10-20", 10), end: at("2026-10-20", 11) }), at(DAY, 9));
		assert.equal(card.key, "confirm");
		assert.equal(card.warning, null);
		assert.equal(card.primary.id, "confirm");
		assert.deepEqual(ids(card.others), ["remind", "call"]);
		assert.deepEqual(ids(card.quiet), ["checkin"]);
	});

	test("booked for tomorrow: the card stands for the unconfirmed warning; without a phone only Confirmă", () => {
		const tomorrow = booking({ start: at("2026-10-17", 10), end: at("2026-10-17", 11) });
		const card = now(tomorrow, at(DAY, 9));
		assert.equal(card.key, "confirm");
		assert.equal(card.warning.kind, "unconfirmed");
		assert.equal(card.primary.id, "confirm");
		assert.deepEqual(ids(now(tomorrow, at(DAY, 9), { phone: false }).others), []);
	});

	test("confirmed for another day: nothing to press, only quiet links", () => {
		const card = now(booking({ status: "confirmed", start: at("2026-10-20", 10), end: at("2026-10-20", 11) }), at(DAY, 9));
		assert.equal(card.key, "waiting");
		assert.equal(card.primary, null);
		assert.deepEqual(ids(card.quiet), ["unconfirm", "checkin"]);
	});

	test("confirmed for today, or its time just began: A sosit, and Sună", () => {
		const confirmed = now(booking({ status: "confirmed" }), at(DAY, 11));
		assert.equal(confirmed.key, "today");
		assert.equal(confirmed.primary.id, "checkin");
		assert.deepEqual(ids(confirmed.others), ["call"]);
		assert.deepEqual(ids(confirmed.quiet), ["unconfirm"]);
		// Within the grace minutes a booking not yet confirmed waits for the car too.
		assert.equal(now(booking(), at(DAY, 14, 5)).key, "today");
	});

	test("late: A sosit first, then Sună and the announced delays; never Neprezentat next to it", () => {
		const card = now(booking({ status: "confirmed" }), at(DAY, 14, 30));
		assert.equal(card.key, "late");
		assert.equal(card.warning.kind, "late");
		assert.equal(card.primary.id, "checkin");
		assert.deepEqual(ids(card.others), ["call", "delayBy", "delayBy"]);
	});

	test("passed with nothing recorded: A sosit, else Neprezentat or Reprogramează", () => {
		const card = now(booking(), at(DAY, 16));
		assert.equal(card.key, "missed");
		assert.equal(card.primary.id, "checkin");
		assert.deepEqual(ids(card.others), ["no_show", "reschedule"]);
	});

	test("in the shop, finished: the job carries on; nothing to press here", () => {
		assert.equal(now(booking({ status: "arrived" }), at(DAY, 14, 30)).key, "inShop");
		assert.equal(now(booking({ status: "confirmed" }), at(DAY, 11), { order: { id: "j1", status: "in_progress" } }).key, "inShop");
		const done = now(booking({ status: "done" }), at(DAY, 16));
		assert.equal(done.key, "done");
		assert.equal(done.primary, null);
	});

	test("called off: Reprogramează; Restabilește only while its time is still ahead", () => {
		const ahead = now(booking({ status: "cancelled" }), at(DAY, 9));
		assert.equal(ahead.key, "off");
		assert.equal(ahead.primary.id, "reschedule");
		assert.deepEqual(ids(ahead.others), ["restore"]);
		assert.deepEqual(ids(now(booking({ status: "no_show" }), at(DAY, 16)).others), []);
	});
});
