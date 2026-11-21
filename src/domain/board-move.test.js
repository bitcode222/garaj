import { test } from "node:test";
import assert from "node:assert/strict";
import { moveProblem } from "./board-move.js";

const at = (h, m = 0, d = 21) => new Date(2026, 10, d, h, m).toISOString();
const now = at(12);
const booking = (status, order = null) => ({ kind: "booking", planned: !["arrived", "done"].includes(status), appointment: { status }, order });
const work = (timeLog, entryId = "a", status = "in_progress") => ({ kind: "work", entryId, order: { status, timeLog } });

test("a booking still to come moves ahead, not into the past", () => {
	assert.equal(moveProblem(booking("confirmed"), { start: at(14), end: at(15), now }), null);
	assert.equal(moveProblem(booking("scheduled"), { start: at(9), end: at(10), now }), "past");
	assert.equal(moveProblem(booking("scheduled"), { start: at(11, 50), end: at(12, 50), now }), null);
});

test("a car in the shop can be corrected to an earlier time; a finished visit or closed job can't move", () => {
	assert.equal(moveProblem(booking("arrived", { status: "in_progress" }), { start: at(9), end: at(10), now }), null);
	assert.equal(moveProblem(booking("done"), { start: at(14), end: at(15), now }), "closed");
	assert.equal(moveProblem(booking("arrived", { status: "delivered" }), { start: at(14), end: at(15), now }), "closed");
});

test("logged work stays in the past, whole and off its own stretches", () => {
	const log = [{ id: "a", start: at(8), end: at(9) }, { id: "b", start: at(10), end: at(11) }];
	assert.equal(moveProblem(work(log), { start: at(9), end: at(10), now }), null);
	assert.equal(moveProblem(work(log), { start: at(12), end: at(13), now }), "future");
	assert.equal(moveProblem(work(log), { start: at(10, 30), end: at(11, 30), now }), "own_overlap");
	assert.equal(moveProblem(work([{ id: "a", start: at(8), end: null }]), { start: at(9), end: at(10), now }), "running");
	assert.equal(moveProblem(work([{ id: "a", start: at(23, 0, 20), end: at(1) }]), { start: at(9), end: at(10), now }), "split");
	assert.equal(moveProblem(work(log, "x"), { start: at(9), end: at(10), now }), "no_entry");
	assert.equal(moveProblem(work(log, "a", "cancelled"), { start: at(9), end: at(10), now }), "closed");
});
