import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingMinutes, canCustomerCancel, customerPhone, customerStatus, onlineStatusOf, openSlots, peakLoad, shopDay, shopInstant } from "./online-booking.js";

const hours = { open: "08:00", close: "12:00", days: [1, 2, 3, 4, 5, 6] };
const NOW = "2026-11-22T06:00:00.000Z"; // Sunday, 08:00 in Bucharest

test("wall-clock times follow Bucharest across both clock changes", () => {
	assert.equal(shopInstant("2026-11-23", 8 * 60), "2026-11-23T06:00:00.000Z");
	assert.equal(shopInstant("2026-07-01", 8 * 60), "2026-07-01T05:00:00.000Z");
	assert.equal(shopInstant("2027-03-28", 3 * 60 + 30), null);
	assert.equal(shopDay("2026-11-22T22:30:00.000Z"), "2026-11-23");
});

test("a closed day, a past day and a day past the horizon have no slots", () => {
	assert.deepEqual(openSlots({ day: "2026-11-22", hours, minutes: 60, now: NOW }), []);
	assert.deepEqual(openSlots({ day: "2026-11-21", hours, minutes: 60, now: NOW }), []);
	assert.deepEqual(openSlots({ day: "2027-03-01", hours, minutes: 60, now: NOW }), []);
	assert.deepEqual(openSlots({ day: "nonsense", hours, minutes: 60, now: NOW }), []);
});

test("a job must end by closing time", () => {
	const slots = openSlots({ day: "2026-11-23", hours, minutes: 120, now: NOW });
	assert.equal(slots.at(-1).end, shopInstant("2026-11-23", 12 * 60));
	assert.equal(slots.length, 5);
});

test("today keeps two hours of notice", () => {
	const monday = "2026-11-23T07:10:00.000Z"; // 09:10
	assert.equal(openSlots({ day: "2026-11-23", hours, minutes: 30, now: monday })[0].start, shopInstant("2026-11-23", 11 * 60 + 30));
});

test("a slot needs a lift free for the whole job", () => {
	const block = { start: shopInstant("2026-11-23", 9 * 60), end: shopInstant("2026-11-23", 10 * 60) };
	const starts = (capacity) => openSlots({ day: "2026-11-23", hours, minutes: 60, blocks: [block], capacity, now: NOW }).map((slot) => slot.start);
	assert.ok(!starts(1).includes(shopInstant("2026-11-23", 8 * 60 + 30)));
	assert.ok(starts(1).includes(shopInstant("2026-11-23", 8 * 60)));
	assert.ok(starts(2).includes(shopInstant("2026-11-23", 9 * 60)));
});

test("back-to-back blocks do not count as running together", () => {
	const blocks = [{ start: "2026-11-23T08:00:00.000Z", end: "2026-11-23T09:00:00.000Z" }, { start: "2026-11-23T09:00:00.000Z", end: "2026-11-23T10:00:00.000Z" }];
	assert.equal(peakLoad(blocks, "2026-11-23T08:00:00.000Z", "2026-11-23T10:00:00.000Z"), 1);
});

test("the duration rounds up to half hours", () => {
	assert.equal(bookingMinutes([{ minutes: 45 }, { minutes: 20 }]), 90);
	assert.equal(bookingMinutes([]), 30);
});

test("only Romanian mobile numbers can sign in", () => {
	assert.equal(customerPhone("0722 123 456"), "+40722123456");
	assert.equal(customerPhone("0212345678"), null);
	assert.equal(customerPhone("abc"), null);
});

test("a confirmed visit can be cancelled online only with two hours' notice", () => {
	const booking = { status: "confirmed", start: "2026-11-23T10:00:00.000Z" };
	assert.equal(canCustomerCancel(booking, "2026-11-23T07:59:00.000Z"), true);
	assert.equal(canCustomerCancel(booking, "2026-11-23T08:01:00.000Z"), false);
	assert.equal(canCustomerCancel({ ...booking, status: "requested" }, "2026-11-23T09:59:00.000Z"), true);
	assert.equal(canCustomerCancel({ ...booking, status: "in_shop" }, "2026-11-22T08:00:00.000Z"), false);
});

test("an unanswered request expires at its time, and shop states map online", () => {
	assert.equal(customerStatus({ status: "requested", start: "2026-11-22T05:00:00.000Z" }, NOW), "expired");
	assert.equal(customerStatus({ status: "confirmed", start: "2026-11-22T05:00:00.000Z" }, NOW), "confirmed");
	assert.equal(onlineStatusOf({ status: "scheduled" }), "requested");
	assert.equal(onlineStatusOf({ status: "cancelled" }), "declined");
});
