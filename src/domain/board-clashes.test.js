import { test } from "node:test";
import assert from "node:assert/strict";
import { boardClashes } from "./board-clashes.js";

const DAY = "2026-11-23"; // a Monday
const NEXT = "2026-11-24";
const at = (day, h, m = 0) => {
	const [y, mo, d] = day.split("-").map(Number);
	return new Date(y, mo - 1, d, h, m).toISOString();
};
const card = (key, h1, h2, { planned = true, kind = "booking", day = DAY } = {}) => ({ key, kind, planned, start: at(day, h1), end: at(day, h2) });
const base = { day: DAY, from: 8 * 60, to: 18 * 60, now: at("2026-11-22", 12) };
const lane = (id, blocks, next = []) => ({ id, name: id, days: { [DAY]: blocks, [NEXT]: next } });

test("cards that only touch don't clash", () => {
	assert.deepEqual(boardClashes({ ...base, lanes: [lane("a", [card("1", 9, 10), card("2", 10, 11)])] }), []);
});

test("a clash moves the last booking: to a free row, or the nearest free time", () => {
	const [clash] = boardClashes({ ...base, lanes: [lane("a", [card("1", 9, 11), card("2", 10, 12)]), lane("b", [card("3", 9, 10)])] });
	assert.deepEqual(clash.shared, [[600, 660]]);
	assert.equal(clash.mover.key, "2");
	assert.deepEqual(clash.fixes, [
		{ type: "row", laneId: "b", laneName: "b" },
		{ type: "time", day: DAY, start: 660, end: 780 },
	]);
});

test("a car already in the shop stays; with none to move there are no fixes", () => {
	const inShop = { planned: false };
	const [one] = boardClashes({ ...base, lanes: [lane("a", [card("1", 9, 11), card("2", 10, 12, inShop)])] });
	assert.equal(one.mover.key, "1");
	const [none] = boardClashes({ ...base, lanes: [lane("a", [card("1", 9, 11, inShop), card("2", 10, 12, inShop)])] });
	assert.equal(none.mover, null);
	assert.deepEqual(none.fixes, []);
});

test("a full day offers the next open day", () => {
	const full = [card("1", 8, 18, { planned: false }), card("2", 10, 12)];
	const [clash] = boardClashes({ ...base, lanes: [lane("a", full, [card("3", 8, 9, { day: NEXT })])] });
	assert.deepEqual(clash.fixes, [{ type: "day", day: NEXT, start: 540, end: 660 }]);
});

test("past days and overlaps already over are left alone; a fix is never in the past", () => {
	const blocks = [card("1", 9, 11), card("2", 10, 12)];
	assert.deepEqual(boardClashes({ ...base, now: at(NEXT, 9), lanes: [lane("a", blocks)] }), []);
	assert.deepEqual(boardClashes({ ...base, now: at(DAY, 11, 30), lanes: [lane("a", blocks)] }), []);
	const [clash] = boardClashes({ ...base, now: at(DAY, 10, 20), lanes: [lane("a", blocks)] });
	assert.deepEqual(clash.fixes, [{ type: "time", day: DAY, start: 660, end: 780 }]);
});
