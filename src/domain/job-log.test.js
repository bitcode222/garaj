import { test } from "node:test";
import assert from "node:assert/strict";
import { appendJobLog, jobChanges, jobTimeline, recordJobChanges } from "./job-log.js";

const T = "2026-11-21T10:00:00.000Z";
const later = (min) => new Date(Date.parse(T) + min * 60_000).toISOString();
const line = (id, extra = {}) => ({ id, description: `L${id}`, qty: 1, unitPrice: 100, discountPct: 0, ...extra });

test("who has the job is logged with the names of that moment", () => {
	const names = { bays: { a: { name: "Elevator 1" }, b: { name: "Elevator 2" } } };
	assert.deepEqual(jobChanges({ bayId: "a" }, { bayId: "b" }, { names }), [{ type: "assigned", field: "bayId", from: "a", to: "b", fromName: "Elevator 1", toName: "Elevator 2" }]);
});

test("lines: added, removed, changed and done are each logged", () => {
	const types = jobChanges({ lines: [line("1"), line("2"), line("3")] }, { lines: [line("1", { qty: 2 }), line("3", { done: true }), line("4")] }).map((e) => e.type);
	assert.deepEqual(types, ["line_changed", "line_done", "line_added", "line_removed"]);
});

test("logged work: moved, started and stopped", () => {
	const a = { id: "a", start: T, end: later(30) };
	const b = { id: "b", start: later(40), end: null };
	assert.equal(jobChanges({ timeLog: [a] }, { timeLog: [{ ...a, start: later(5) }] })[0].type, "work_moved");
	assert.equal(jobChanges({ timeLog: [a] }, { timeLog: [a, b] })[0].type, "work_started");
	assert.equal(jobChanges({ timeLog: [b] }, { timeLog: [{ ...b, end: later(50) }] })[0].type, "work_stopped");
});

test("typing folds into one entry from first to last value; typing it back removes it", () => {
	let order = { notes: "", activity: [] };
	for (const [notes, min] of [["a", 0], ["ab", 1], ["abc", 2]]) order = recordJobChanges(order, { ...order, notes }, { now: later(min) });
	assert.equal(order.activity.length, 1);
	assert.deepEqual([order.activity[0].from, order.activity[0].to], ["", "abc"]);
	order = recordJobChanges(order, { ...order, notes: "" }, { now: later(3) });
	assert.deepEqual(order.activity, []);
});

test("another person, or later on, is a new entry", () => {
	let order = appendJobLog({ activity: [] }, [{ type: "edited", field: "notes", from: "", to: "a" }], { now: T, by: "Ana" });
	order = appendJobLog(order, [{ type: "edited", field: "notes", from: "a", to: "b" }], { now: later(1), by: "Dan" });
	order = appendJobLog(order, [{ type: "edited", field: "notes", from: "b", to: "c" }], { now: later(30), by: "Dan" });
	assert.equal(order.activity.length, 3);
});

test("no change leaves the same job", () => {
	const order = { notes: "x", lines: [line("1")], timeLog: [], activity: [] };
	assert.equal(recordJobChanges(order, order, { now: T }), order);
});

test("the timeline is newest first and fills in stages from before the log", () => {
	const order = { createdAt: T, dates: { estimate: T, approved: later(5) }, activity: [{ at: later(5), type: "status", to: "approved" }, { at: later(9), type: "assigned", field: "bayId" }] };
	assert.deepEqual(jobTimeline(order).map((e) => e.to ?? e.type), ["assigned", "approved", "estimate"]);
	assert.deepEqual(jobTimeline({ createdAt: T }).map((e) => e.type), ["created"]);
});

test("each move of a card stays in the log, even a move back", () => {
	const move = (a, b) => ({ type: "booking_moved", from: { start: a, end: a }, to: { start: b, end: b } });
	let order = appendJobLog({ activity: [] }, [move(T, later(30))], { now: T });
	order = appendJobLog(order, [move(later(30), T)], { now: later(1) });
	assert.equal(order.activity.length, 2);
});
