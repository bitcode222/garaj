import { test } from "node:test";
import assert from "node:assert/strict";
import { dayLanes, dropMinute, isFoldedDay, moveLane, railAt, railOffsets, railX, rangeLanes, shopJobs, stackBlocks, todaysBookings } from "./azi-data.js";

const today = "2026-11-16";
const at = (hhmm) => new Date(`${today}T${hhmm}:00`).toISOString();

test("the shop's jobs: running first, then by stage; closed jobs left out", () => {
	const orders = {
		a: { id: "a", status: "ready", updatedAt: "3" },
		b: { id: "b", status: "approved", updatedAt: "2" },
		c: { id: "c", status: "in_progress", timeLog: [{ start: at("09:00"), end: null }], updatedAt: "1" },
		d: { id: "d", status: "delivered" },
		e: { id: "e", status: "in_progress", updatedAt: "4" },
	};
	assert.deepEqual(shopJobs(orders).map((o) => o.id), ["c", "e", "b", "a"]);
});

test("today's bookings, by start, without the called-off ones", () => {
	const list = todaysBookings(
		{ x: { id: "x", start: at("14:00"), status: "scheduled" }, y: { id: "y", start: at("09:00"), status: "arrived" }, z: { id: "z", start: at("10:00"), status: "cancelled" }, w: { id: "w", start: "2026-11-17T09:00:00.000Z", status: "scheduled" } },
		today,
	);
	assert.deepEqual(list.map((a) => a.id), ["y", "x"]);
});

test("the day's lanes: bookings on their lift, dashed until the car is in; logged work where the job is", () => {
	const lanes = dayLanes({
		bays: { l1: { id: "l1", name: "Elevator 1", order: 0 }, l2: { id: "l2", name: "Elevator 2", order: 1 } },
		appointments: {
			p: { id: "p", bayId: "l1", start: at("14:00"), end: at("16:00"), status: "confirmed" },
			q: { id: "q", bayId: "l2", start: at("09:00"), end: at("10:00"), status: "arrived", workOrderId: "j" },
		},
		workOrders: {
			j: { id: "j", bayId: "l2", timeLog: [{ id: "t1", start: at("09:10"), end: null }] },
			k: { id: "k", bayId: null, timeLog: [{ id: "t2", start: at("08:00"), end: at("09:00") }] },
		},
		today,
		now: at("12:00"),
	});
	assert.deepEqual(lanes.map((l) => l.name), ["Elevator 1", "Elevator 2", "Fără loc"]);
	assert.equal(lanes[0].blocks[0].planned, true);
	assert.equal(lanes[1].blocks.length, 1, "the job's clock is not drawn twice beside its booking");
	assert.equal(lanes[1].blocks[0].running, true);
	assert.equal(lanes[2].blocks[0].kind, "work");
});

test("the day by mechanic: a lane per mechanic, in their order; the job's mechanic places its work", () => {
	const lanes = dayLanes({
		by: "staff",
		rows: { m: { id: "m", name: "Mihai", order: 1 }, v: { id: "v", name: "Vlad", order: 0 }, x: { id: "x", name: "Plecat", active: false } },
		appointments: { p: { id: "p", staffId: "m", bayId: "l1", start: at("14:00"), end: at("15:00"), status: "scheduled" } },
		workOrders: { j: { id: "j", staffId: "v", timeLog: [{ id: "t", start: at("09:00"), end: at("10:00") }] }, k: { id: "k", staffId: null, timeLog: [{ id: "u", start: at("08:00"), end: at("08:30") }] } },
		today,
		now: at("12:00"),
	});
	assert.deepEqual(lanes.map((l) => l.name), ["Vlad", "Mihai", "Fără mecanic"]);
	assert.equal(lanes[0].blocks[0].order.id, "j");
	assert.equal(lanes[1].blocks[0].appointment.id, "p");
});

test("moving a lane: down lands after the target, up lands before it", () => {
	assert.deepEqual(moveLane(["a", "b", "c", "d"], "a", "c"), ["b", "c", "a", "d"]);
	assert.deepEqual(moveLane(["a", "b", "c", "d"], "d", "b"), ["a", "d", "b", "c"]);
	assert.deepEqual(moveLane(["a", "b"], "a", "a"), ["a", "b"]);
	assert.deepEqual(moveLane(["a", "b"], "z", "a"), ["a", "b"]);
});

test("stackBlocks: overlapping cards on one row go on separate levels, the gaps are reused", () => {
	const at = (h, m = 0) => new Date(2026, 10, 20, h, m).toISOString();
	const blocks = [
		{ key: "c", start: at(11), end: at(13) },
		{ key: "a", start: at(9), end: at(11) },
		{ key: "b", start: at(10), end: at(12) },
		{ key: "d", start: at(12), end: at(12) }, // no length: still a quarter hour wide
		{ key: "e", start: at(12, 10), end: at(14) },
	];
	assert.equal(stackBlocks(blocks), 3);
	const level = Object.fromEntries(blocks.map((b) => [b.key, b.level]));
	assert.deepEqual(level, { a: 0, b: 1, c: 0, d: 1, e: 2 });
	assert.equal(stackBlocks([]), 1);
});

test("rangeLanes: one row per lift across the days, blocks by day, levels of the busiest day, no lift last", () => {
	const at = (d, h) => new Date(2026, 10, d, h).toISOString();
	const booking = (id, d, h, bayId) => ({ id, bayId, status: "confirmed", start: at(d, h), end: at(d, h + 2) });
	const appointments = { a: booking("a", 21, 9, "b1"), b: booking("b", 22, 9, "b1"), c: booking("c", 22, 10, "b1"), d: booking("d", 22, 9, null) };
	const bays = { b1: { id: "b1", name: "Elevator 1", order: 0 }, b2: { id: "b2", name: "Elevator 2", order: 1 } };
	const lanes = rangeLanes({ days: ["2026-11-21", "2026-11-22"], rows: bays, appointments, workOrders: {}, now: at(22, 12) });
	assert.deepEqual(lanes.map((l) => l.id), ["b1", "b2", null]);
	assert.deepEqual(lanes[0].days["2026-11-21"].map((b) => b.key), ["a"]);
	assert.equal(lanes[0].days["2026-11-22"].length, 2);
	assert.equal(lanes[0].levels, 2);
});

test("dropMinute: snaps to the quarter hour and keeps the whole card inside the opening hours", () => {
	const day = { width: 1000, from: 480, to: 1080, minutes: 120 };
	assert.equal(dropMinute({ ...day, px: 504 }), 780); // 12:58 → 13:00
	assert.equal(dropMinute({ ...day, px: -40 }), 480);
	assert.equal(dropMinute({ ...day, px: 990 }), 960); // ends at closing time
	assert.equal(dropMinute({ ...day, px: 500, minutes: 900 }), 480); // longer than the day: from the opening
});

test("a closed day folds, unless it is today, holds a card or was opened by hand", () => {
	const week = { openDays: [1, 2, 3, 4, 5], today: "2026-11-23", busy: new Set(), unfolded: new Set() };
	assert.equal(isFoldedDay("2026-11-21", week), true); // Saturday
	assert.equal(isFoldedDay("2026-11-23", week), false); // Monday, open
	assert.equal(isFoldedDay("2026-11-22", { ...week, today: "2026-11-22" }), false);
	assert.equal(isFoldedDay("2026-11-22", { ...week, busy: new Set(["2026-11-22"]) }), false);
	assert.equal(isFoldedDay("2026-11-22", { ...week, unfolded: new Set(["2026-11-22"]) }), false);
	assert.equal(isFoldedDay("2026-11-22", { ...week, openDays: [] }), false); // no working days set: nothing folds
});

test("the rail: a place survives days of different widths, and stays inside the rail", () => {
	const offsets = railOffsets([100, 30, 30, 100]);
	assert.deepEqual(offsets, [0, 100, 130, 160, 260]);
	assert.equal(railAt(offsets, 50), 0.5);
	assert.equal(railAt(offsets, 115), 1.5);
	assert.equal(railAt(offsets, 160), 3);
	assert.equal(railAt(offsets, -5), 0);
	assert.equal(railAt(offsets, 999), 4);
	assert.equal(railX(offsets, 1.5), 115);
	assert.equal(railX(offsets, 3.5), 210);
	assert.equal(railX(offsets, 9), 260);
	assert.equal(railX(railOffsets([200, 30, 30, 200]), 0.5), 100); // the same place after a resize
});
