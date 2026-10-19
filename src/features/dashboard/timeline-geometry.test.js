import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
	SLIM_PX,
	buildTimeline,
	daysInView,
	hasDay,
	indexAt,
	indexOfDay,
	instantAt,
	locate,
	minuteWithin,
	scrollToKeep,
	scrollToShow,
	stepIndex,
	timelineHours,
	wholeDaysInView,
	xOf,
} from "./timeline-geometry.js";

// Mon 12 Oct 2026 … Sun 25 Oct 2026; Sundays (18th, 25th) are closed with nothing booked.
const sundays = new Set(["2026-10-18", "2026-10-25"]);
const layout = buildTimeline({ from: "2026-10-12", count: 14, dayWidth: 1000, isSlim: (day) => sundays.has(day) });
const hours = { start: 8 * 60, end: 18 * 60 };

describe("timeline geometry", () => {
	test("days sit side by side; a slim day takes its narrow width", () => {
		assert.equal(layout.days[0], "2026-10-12");
		assert.equal(layout.days[13], "2026-10-25");
		assert.equal(layout.offsets[6], 6000);
		assert.equal(layout.offsets[7], 6000 + SLIM_PX);
		assert.equal(layout.total, 12 * 1000 + 2 * SLIM_PX);
	});

	test("the day at a scroll position, on both sides of every edge", () => {
		assert.equal(indexAt(layout, 0), 0);
		assert.equal(indexAt(layout, 999.9), 0);
		assert.equal(indexAt(layout, 1000), 1);
		assert.equal(indexAt(layout, 6000 + SLIM_PX - 1), 6);
		assert.equal(indexAt(layout, 6000 + SLIM_PX), 7);
		assert.equal(indexAt(layout, -50), 0);
		assert.equal(indexAt(layout, 1e9), 13);
	});

	test("a time maps to a position and back", () => {
		assert.equal(xOf(layout, hours, "2026-10-13", 13 * 60), 1500);
		assert.deepEqual(instantAt(layout, hours, 1500), { index: 1, day: "2026-10-13", minute: 13 * 60 });
		// Outside the shown hours a time is pinned to the day's edge.
		assert.equal(xOf(layout, hours, "2026-10-13", 6 * 60), 1000);
		assert.equal(xOf(layout, hours, "2026-10-13", 23 * 60), 2000);
		// A slim day has no hours: its middle.
		assert.equal(xOf(layout, hours, "2026-10-18", 12 * 60), 6000 + SLIM_PX / 2);
	});

	test("a drag that stays on its day reads the minute inside that day, pinned at its edges", () => {
		assert.equal(minuteWithin(layout, hours, 1, 1500), 13 * 60);
		assert.equal(minuteWithin(layout, hours, 1, 1125), 9 * 60 + 15);
		// The pointer has left the day: its first or last shown minute.
		assert.equal(minuteWithin(layout, hours, 1, 400), 8 * 60);
		assert.equal(minuteWithin(layout, hours, 1, 5200), 18 * 60);
	});

	test("days outside the range are clamped, and reported as outside", () => {
		assert.equal(indexOfDay(layout, "2026-01-01"), 0);
		assert.equal(indexOfDay(layout, "2027-01-01"), 13);
		assert.equal(hasDay(layout, "2026-10-11"), false);
		assert.equal(hasDay(layout, "2026-10-25"), true);
	});

	test("only the days in view, plus one on each side, are rendered", () => {
		assert.deepEqual(daysInView(layout, 1000, 1000), { firstVisible: 1, lastVisible: 1, first: 0, last: 2 });
		assert.deepEqual(daysInView(layout, 1500, 1000), { firstVisible: 1, lastVisible: 2, first: 0, last: 3 });
		assert.deepEqual(daysInView(layout, 0, 400), { firstVisible: 0, lastVisible: 0, first: 0, last: 1 });
		// Slim days let more days into view.
		assert.deepEqual(daysInView(layout, 5500, 1000), { firstVisible: 5, lastVisible: 7, first: 4, last: 8 });
	});

	test("showing a time never leaves its day: a day that fits the grid is shown whole", () => {
		// Desktop: the day is as wide as the grid, so any time of it shows the day from its first hour.
		assert.equal(scrollToShow(layout, hours, "2026-10-13", 16 * 60, 1000), 1000);
		// Phone: the grid is narrower than the day, so the time sits at the reading point…
		assert.equal(scrollToShow(layout, hours, "2026-10-13", 13 * 60, 400), 1500 - 120);
		// …but early and late times stop at the day's own edges.
		assert.equal(scrollToShow(layout, hours, "2026-10-13", 8 * 60, 400), 1000);
		assert.equal(scrollToShow(layout, hours, "2026-10-13", 18 * 60, 400), 1600);
		// Centred, for "Arată în calendar".
		assert.equal(scrollToShow(layout, hours, "2026-10-13", 13 * 60, 400, 0.5), 1300);
	});

	test("a day narrower than the grid (Săptămână) is placed whole: at the left edge, or centred", () => {
		const week = buildTimeline({ from: "2026-10-12", count: 14, dayWidth: 160, isSlim: (day) => sundays.has(day) });
		// Tuesday at the left edge, whatever the time.
		assert.equal(scrollToShow(week, hours, "2026-10-13", 9 * 60, 960, 0), 160);
		assert.equal(scrollToShow(week, hours, "2026-10-13", 17 * 60, 960, 0), 160);
		// Thursday centred: its 160 px in the middle of 960.
		assert.equal(scrollToShow(week, hours, "2026-10-15", 9 * 60, 960, 0.5), 480 - 400);
		// Never before the first day.
		assert.equal(scrollToShow(week, hours, "2026-10-12", 9 * 60, 960, 0.5), 0);
	});

	test("the days completely in view; none when a day is wider than the grid", () => {
		const week = buildTimeline({ from: "2026-10-12", count: 14, dayWidth: 160, isSlim: (day) => sundays.has(day) });
		assert.deepEqual(wholeDaysInView(week, 0, 960), { first: 0, last: 5 });
		assert.deepEqual(wholeDaysInView(week, 160, 960), { first: 1, last: 6 });
		// Scrolled a little further: Monday and Tuesday are cut on the left, the slim Sunday still fits on the right.
		assert.deepEqual(wholeDaysInView(week, 200, 960), { first: 2, last: 6 });
		assert.deepEqual(wholeDaysInView(layout, 1000, 1000), { first: 1, last: 1 });
		assert.equal(wholeDaysInView(layout, 1500, 1000), null);
		assert.equal(wholeDaysInView(layout, 1000, 400), null);
	});

	test("the day the view is on: under the reading point in Zi, the first whole day in Săptămână", () => {
		// Zi, a day as wide as the grid, aligned: that day, and it alone is whole.
		assert.deepEqual(locate(layout, hours, 1000, 1000, false), { index: 1, day: "2026-10-13", minute: 11 * 60, from: 1, to: 1 });
		// Zi, half way between two days: the day under the reading point; no day is whole.
		assert.deepEqual(locate(layout, hours, 1500, 1000, false), { index: 1, day: "2026-10-13", minute: 16 * 60, from: 1, to: 1 });
		assert.equal(locate(layout, hours, 1800, 1000, false).day, "2026-10-14");
		// Săptămână: the first whole day, and the range of whole days.
		const week = buildTimeline({ from: "2026-10-12", count: 14, dayWidth: 160, isSlim: (day) => sundays.has(day) });
		assert.deepEqual(locate(week, hours, 160, 960, true), { index: 1, day: "2026-10-13", minute: 8 * 60, from: 1, to: 6 });
		assert.equal(locate(week, hours, 200, 960, true).day, "2026-10-14");
	});

	test("after a resize the same time stays under the reading point", () => {
		const narrow = buildTimeline({ from: "2026-10-12", count: 14, dayWidth: 720, isSlim: (day) => sundays.has(day) });
		const before = instantAt(layout, hours, 2300 + 1000 * 0.3);
		const left = scrollToKeep(narrow, hours, before.day, before.minute, 400);
		const after = instantAt(narrow, hours, left + 400 * 0.3);
		assert.equal(after.day, before.day);
		assert.equal(after.minute, before.minute);
	});

	test("‹ › step over slim days and stop at the ends", () => {
		assert.equal(stepIndex(layout, 5, 1), 7);
		assert.equal(layout.days[stepIndex(layout, 5, 1)], "2026-10-19");
		assert.equal(layout.days[stepIndex(layout, 7, -1)], "2026-10-17");
		assert.equal(layout.days[stepIndex(layout, 1, 1, 7)], "2026-10-21");
		assert.equal(stepIndex(layout, 0, -1), 0);
		assert.equal(stepIndex(layout, 12, 1), 13);
	});

	test("shown hours: shop hours, widened for bookings outside them, capped at 06:00 to 22:00", () => {
		const shop = { open: 8 * 60, close: 18 * 60 };
		assert.deepEqual(timelineHours(shop), { start: 480, end: 1080 });
		assert.deepEqual(timelineHours(shop, [[7 * 60 + 30, 9 * 60]]), { start: 420, end: 1080 });
		assert.deepEqual(timelineHours(shop, [[17 * 60, 19 * 60 + 15]]), { start: 480, end: 1200 });
		assert.deepEqual(timelineHours(shop, [[2 * 60, 23 * 60 + 30]]), { start: 360, end: 1320 });
		// A shop that itself opens before 06:00 keeps its own hours.
		assert.deepEqual(timelineHours({ open: 5 * 60, close: 23 * 60 }, [[3 * 60, 4 * 60]]), { start: 300, end: 1380 });
	});
});
