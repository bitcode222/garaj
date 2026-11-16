import { test } from "node:test";
import assert from "node:assert/strict";
import { busyMinutes, freeGaps, mergeSpans } from "./day-summary.js";

const H = (h) => h * 60;

test("mergeSpans joins overlaps and clips to the opening hours", () => {
	assert.deepEqual(
		mergeSpans(
			[
				[H(9), H(11)],
				[H(7), H(8.5)],
				[H(10), H(12)],
				[H(17), H(19)],
			],
			H(8),
			H(18),
		),
		[
			[H(8), H(8.5)],
			[H(9), H(12)],
			[H(17), H(18)],
		],
	);
});

test("busyMinutes counts an overlap once", () => {
	assert.equal(
		busyMinutes(
			[
				[H(9), H(11)],
				[H(10), H(12)],
			],
			H(8),
			H(18),
		),
		180,
	);
	assert.equal(busyMinutes([], H(8), H(18)), 0);
});

test("freeGaps finds the holes of an hour or more", () => {
	const spans = [
		[H(8), H(10.5)],
		[H(11), H(12.5)],
		[H(13.5), H(16)],
	];
	assert.deepEqual(freeGaps(spans, H(8), H(18)), [
		[H(12.5), H(13.5)],
		[H(16), H(18)],
	]);
	assert.deepEqual(freeGaps([], H(8), H(18)), [[H(8), H(18)]]);
});

test("freeGaps starts at `from` (now, on today)", () => {
	const spans = [[H(9), H(10)]];
	assert.deepEqual(freeGaps(spans, H(8), H(18), { from: H(9.5) }), [[H(10), H(18)]]);
	assert.deepEqual(freeGaps(spans, H(8), H(18), { from: H(17.5) }), []);
});
