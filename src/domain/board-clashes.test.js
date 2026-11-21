import { test } from "node:test";
import assert from "node:assert/strict";
import { boardClashes } from "./board-clashes.js";

const DAY = "2026-11-23"; // a Monday
const NEXT = "2026-11-24";
const at = (day, h, m = 0) => {
	const [y, mo, d] = day.split("-").map(Number);
	return new Date(y, mo - 1, d, h, m).toISOString();
};
const card = (key, h1, h2, { planned = true, kind = "booking", day = DAY, status, order = null } = {}) => ({ key, kind, planned, order, appointment: kind === "booking" ? { status: status ?? (planned ? "scheduled" : "arrived") } : null, start: at(day, h1), end: at(day, h2) });
const base = { day: DAY, from: 8 * 60, to: 18 * 60, now: at("2026-11-22", 12) };
const lane = (id, blocks, next = []) => ({ id, name: id, days: { [DAY]: blocks, [NEXT]: next } });
const types = (option) => option.fixes.map((f) => f.type);

test("cards that only touch don't clash", () => {
	assert.deepEqual(boardClashes({ ...base, lanes: [lane("a", [card("1", 9, 10), card("2", 10, 11)])] }), []);
});

test("several ways out, least disruptive first", () => {
	const [clash] = boardClashes({ ...base, lanes: [lane("a", [card("1", 9, 11), card("2", 10, 12)]), lane("b", [card("3", 9, 10)]), lane("c", [])] });
	assert.deepEqual(clash.shared, [[600, 660]]);
	const [first] = clash.options;
	assert.equal(first.block.key, "2");
	assert.deepEqual(types(first), ["row", "row", "later", "shorten", "day"]);
	assert.deepEqual(first.fixes[2], { type: "later", day: DAY, start: 660, end: 780 });
	assert.deepEqual(first.fixes[3], { type: "shorten", day: DAY, start: 660, end: 720, saved: 60 });
	assert.deepEqual(first.fixes[4], { type: "day", day: NEXT, start: 600, end: 720 });
});

test("either car can give way: the one still to come first", () => {
	const [clash] = boardClashes({ ...base, lanes: [lane("a", [card("1", 9, 11), card("2", 10, 12, { planned: false })]), lane("b", [])] });
	assert.deepEqual(clash.options.map((o) => o.block.key), ["1", "2"]);
	assert.ok(!types(clash.options[1]).includes("day")); // a car in the shop isn't sent to another day
});

test("logged work can change row only; a closed job can't give way", () => {
	const job = { status: "in_progress" };
	const [one] = boardClashes({ ...base, lanes: [lane("a", [card("1", 9, 11, { kind: "work", planned: false, order: job }), card("2", 10, 12, { kind: "work", planned: false, order: { status: "delivered" } })]), lane("b", [])] });
	assert.equal(one.options.length, 1);
	assert.deepEqual(types(one.options[0]), ["row"]);
});

test("nowhere free on the same hour: the nearest hour on another row", () => {
	const [clash] = boardClashes({ ...base, lanes: [lane("a", [card("1", 9, 11), card("2", 10, 12)]), lane("b", [card("3", 9, 13)])] });
	assert.deepEqual(clash.options[0].fixes.find((f) => f.type === "row_time"), { type: "row_time", laneId: "b", laneName: "b", day: DAY, start: 780, end: 900 });
});

test("a full day offers the next open day, skipping closed ones", () => {
	const hours = { days: [1, 3] }; // Monday and Wednesday
	const THIRD = "2026-11-25";
	const row = { id: "a", name: "a", days: { [DAY]: [card("1", 8, 18, { planned: false }), card("2", 10, 12)], [NEXT]: [], [THIRD]: [] } };
	const [clash] = boardClashes({ ...base, hours, lanes: [row] });
	const option = clash.options.find((o) => o.block.key === "2");
	assert.deepEqual(option.fixes.at(-1), { type: "day", day: THIRD, start: 600, end: 720 });
});

test("past days and overlaps already over are left alone; a fix is never in the past", () => {
	const blocks = [card("1", 9, 11), card("2", 10, 12)];
	assert.deepEqual(boardClashes({ ...base, now: at(NEXT, 9), lanes: [lane("a", blocks)] }), []);
	assert.deepEqual(boardClashes({ ...base, now: at(DAY, 11, 30), lanes: [lane("a", blocks)] }), []);
	const [clash] = boardClashes({ ...base, now: at(DAY, 10, 20), lanes: [lane("a", blocks)] });
	assert.ok(clash.options[0].fixes.filter((f) => f.start != null && f.day === DAY && f.type !== "shorten").every((f) => f.start >= 630));
});
