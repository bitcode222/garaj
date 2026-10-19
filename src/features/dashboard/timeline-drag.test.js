import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { drawSpan, edgeSpeed, shiftSpan, snapTo, startAt, stretchSpan } from "./timeline-drag.js";

const hours = { start: 8 * 60, end: 18 * 60 };
const at = (hour, minute = 0) => hour * 60 + minute;

describe("timeline drags", () => {
	test("everything lands on a quarter of an hour", () => {
		assert.equal(snapTo(at(10, 7)), at(10));
		assert.equal(snapTo(at(10, 8)), at(10, 15));
		assert.equal(snapTo(at(10, 52)), at(10, 45));
	});

	test("a new booking starts on the grid, with room for a quarter of an hour before closing", () => {
		assert.equal(startAt(at(10, 20), hours), at(10, 15));
		assert.equal(startAt(at(7), hours), at(8));
		assert.equal(startAt(at(17, 58), hours), at(17, 45));
	});

	test("drawing a new booking: forwards, backwards, and never shorter than a quarter of an hour", () => {
		assert.deepEqual(drawSpan(at(10, 2), at(11, 40), hours), { start: at(10), end: at(11, 45) });
		// Pressed and barely moved.
		assert.deepEqual(drawSpan(at(10, 2), at(10, 4), hours), { start: at(10), end: at(10, 15) });
		// Backwards: it ends where the press began.
		assert.deepEqual(drawSpan(at(12), at(10, 28), hours), { start: at(10, 30), end: at(12) });
		// Past either end of the day it stops at the day's edge.
		assert.deepEqual(drawSpan(at(17), at(23), hours), { start: at(17), end: at(18) });
		assert.deepEqual(drawSpan(at(9), at(3), hours), { start: at(8), end: at(9) });
		// Pressed in the last minutes of the day.
		assert.deepEqual(drawSpan(at(17, 59), at(18, 30), hours), { start: at(17, 45), end: at(18) });
	});

	test("stretching by an edge moves that edge only, and keeps a quarter of an hour", () => {
		const span = { start: at(10), end: at(11) };
		assert.deepEqual(stretchSpan(span, "end", at(12, 22), hours), { start: at(10), end: at(12, 15) });
		assert.deepEqual(stretchSpan(span, "end", at(9), hours), { start: at(10), end: at(10, 15) });
		assert.deepEqual(stretchSpan(span, "start", at(9, 10), hours), { start: at(9, 15), end: at(11) });
		assert.deepEqual(stretchSpan(span, "start", at(13), hours), { start: at(10, 45), end: at(11) });
		// Not past the shown hours.
		assert.deepEqual(stretchSpan(span, "end", at(22), hours), { start: at(10), end: at(18) });
		assert.deepEqual(stretchSpan(span, "start", at(5), hours), { start: at(8), end: at(11) });
		// A start that is off the grid stays where it is while the end is stretched.
		assert.deepEqual(stretchSpan({ start: at(10, 10), end: at(11) }, "end", at(11, 31), hours), { start: at(10, 10), end: at(11, 30) });
	});

	test("moving keeps the length and stays inside the day", () => {
		const span = { start: at(10), end: at(11, 30) };
		assert.deepEqual(shiftSpan(span, at(13, 5), hours), { start: at(13), end: at(14, 30) });
		assert.deepEqual(shiftSpan(span, at(6), hours), { start: at(8), end: at(9, 30) });
		assert.deepEqual(shiftSpan(span, at(17, 40), hours), { start: at(16, 30), end: at(18) });
		// Longer than the day: it starts with the day.
		assert.deepEqual(shiftSpan({ start: at(7), end: at(19) }, at(12), hours), { start: at(8), end: at(20) });
	});

	test("the grid scrolls by itself only near its sides, faster the closer the pointer is", () => {
		assert.equal(edgeSpeed(400, 800), 0);
		assert.equal(edgeSpeed(56, 800), 0);
		assert.equal(edgeSpeed(0, 800), -14);
		assert.equal(edgeSpeed(-30, 800), -14);
		assert.equal(edgeSpeed(28, 800), -7);
		assert.equal(edgeSpeed(800, 800), 14);
		assert.equal(edgeSpeed(772, 800), 7);
	});
});
