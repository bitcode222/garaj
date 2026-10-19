import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { dayAtLeft, dayWindow, daysInView, daysPerView, keepScroll, leftOf, minuteAt, mondayOf, monthIndexOf, monthInView, monthWindow, monthsBetween, nearEdge, rowOfMonth, serviceBars, stepDay, weekWindow, weeksNearEdge, yOf } from "./calendar-geometry.js";

const at = (day, hour = 9) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00`).toISOString();
const TODAY = "2026-10-18"; // a Sunday
const sundaysSlim = (day) => new Date(`${day}T12:00:00`).getDay() === 0;

describe("days, sideways", () => {
	test("Săptămână fits 7 days, 3 on a phone, 2 on the narrowest; Zi one", () => {
		assert.deepEqual([daysPerView("week", 1200), daysPerView("week", 430), daysPerView("week", 340), daysPerView("day", 1200)], [7, 3, 2, 1]);
	});

	test("the window is centred on its anchor; slim days are narrow", () => {
		const layout = dayWindow({ anchor: TODAY, dayWidth: 100, isSlim: sundaysSlim, days: 10 });
		assert.equal(layout.days.length, 21);
		assert.equal(layout.days[10], TODAY);
		assert.equal(layout.offsets[11] - layout.offsets[10], 48); // the 18th is a Sunday
		assert.equal(leftOf(layout, "2026-10-19"), layout.offsets[11]);
	});

	test("near an end of the window it must move; moving keeps the same day at the same place", () => {
		const old = dayWindow({ anchor: TODAY, dayWidth: 100, isSlim: () => false, days: 60 });
		assert.equal(nearEdge(old, 100, 700), true);
		assert.equal(nearEdge(old, old.offsets[60], 700), false);
		const scrollLeft = old.offsets[5] + 30; // 30 px into the 6th day
		const next = dayWindow({ anchor: old.days[5], dayWidth: 100, isSlim: () => false, days: 60 });
		const kept = keepScroll(old, next, scrollLeft);
		assert.equal(kept, next.offsets[60] + 30);
		const narrower = dayWindow({ anchor: TODAY, dayWidth: 50, isSlim: () => false, days: 60 });
		assert.equal(keepScroll(old, narrower, scrollLeft), narrower.offsets[5] + 15);
	});

	test("the day at the left edge, the days in view, and the steps of ‹ ›", () => {
		const layout = dayWindow({ anchor: TODAY, dayWidth: 100, isSlim: sundaysSlim, days: 30 });
		const monday = leftOf(layout, "2026-10-19");
		assert.equal(dayAtLeft(layout, monday), "2026-10-19");
		assert.equal(dayAtLeft(layout, monday + 60), "2026-10-20"); // more than half of Monday is gone
		const view = daysInView(layout, monday, 648); // six days and the slim Sunday
		assert.deepEqual([layout.days[view.first], layout.days[view.last]], ["2026-10-19", "2026-10-25"]);
		assert.equal(stepDay(layout, "2026-10-17", "day", 1), "2026-10-19"); // over the slim Sunday
		assert.equal(stepDay(layout, "2026-10-19", "day", -1), "2026-10-17");
		assert.equal(stepDay(layout, "2026-10-21", "week", 1), "2026-10-28"); // seven days on, from the day at the left
		assert.equal(stepDay(layout, "2026-10-21", "week", -1), "2026-10-14");
		assert.equal(mondayOf(TODAY), "2026-10-12");
	});
});

describe("hours, up and down", () => {
	test("a minute's y, and the quarter of an hour at a y", () => {
		assert.equal(yOf(90, 64), 96);
		assert.equal(minuteAt(96, 64), 90);
		assert.equal(minuteAt(100, 64), 90);
		assert.equal(minuteAt(-5, 64), 0);
		assert.equal(minuteAt(64 * 30, 64), 24 * 60 - 15);
	});
});

describe("Lună, weeks down", () => {
	test("weeks start on Mondays; the title is the month most of the visible days belong to", () => {
		const window = weekWindow(TODAY, 10);
		assert.equal(window.mondays.length, 21);
		assert.equal(window.mondays[10], "2026-10-12");
		const row = rowOfMonth(window, "2026-11"); // 1 Nov is a Sunday: the week of 26 Oct
		assert.equal(window.mondays[row], "2026-10-26");
		assert.equal(monthInView(window, rowOfMonth(window, "2026-10") * 100, 100, 500), "2026-10");
		assert.equal(monthInView(window, row * 100 + 100, 100, 500), "2026-11");
		assert.equal(weeksNearEdge(window, 0, 100, 500, 3), true);
		assert.equal(weeksNearEdge(window, 1000, 100, 500, 3), false);
	});
});

describe("cars in service", () => {
	test("a bar from the day the job was opened to its delivery (or today), cut to the days shown, three lanes then +N", () => {
		const orders = [
			{ id: "a", status: "waiting_parts", createdAt: at("2026-10-10") },
			{ id: "b", status: "delivered", createdAt: at("2026-10-14"), dates: { delivered: at("2026-10-16") } },
			{ id: "c", status: "in_progress", createdAt: at("2026-10-15") },
			{ id: "d", status: "estimate", createdAt: at("2026-10-15") },
			{ id: "e", status: "ready", createdAt: at("2026-10-16") },
			{ id: "x", status: "cancelled", createdAt: at("2026-10-15") },
			{ id: "old", status: "delivered", createdAt: at("2026-09-01"), dates: { delivered: at("2026-09-02") } },
			{ id: "sameDay", status: "delivered", createdAt: at("2026-10-13", 9), dates: { delivered: at("2026-10-13", 17) } },
		];
		const { bars, more } = serviceBars(orders, { from: "2026-10-12", to: "2026-10-18", today: TODAY });
		const byId = Object.fromEntries(bars.map((bar) => [bar.order.id, bar]));
		assert.deepEqual([byId.a.from, byId.a.to, byId.a.open, byId.a.lane], ["2026-10-12", TODAY, true, 0]);
		assert.deepEqual([byId.b.from, byId.b.to, byId.b.open, byId.b.lane], ["2026-10-14", "2026-10-16", false, 1]);
		assert.equal(byId.c.lane, 2);
		assert.equal(byId.d, undefined); // no lane left on the 15th
		assert.equal(more.get("2026-10-15"), 1);
		assert.equal(more.get(TODAY), 2); // d and e
		assert.equal(byId.e, undefined); // b still holds lane 1 on the 16th
		assert.equal(more.get("2026-10-16"), 2);
		assert.equal(byId.x, undefined);
		assert.equal(byId.old, undefined);
		assert.equal(byId.sameDay, undefined); // one day in and out: its booking says it
	});
});

describe("Lună sideways, months across", () => {
	test("a window of months around the anchor's month; the index of a month; months between", () => {
		const window = monthWindow(TODAY, 3);
		assert.deepEqual(window.months, ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
		assert.equal(monthIndexOf(window, "2026-12-25"), 5);
		assert.equal(monthIndexOf(window, "2030-01"), 6); // clamped
		assert.equal(monthsBetween("2025-11", "2027-02"), 15);
	});
});

describe("Zi, three days and fewer as mechanics share a day", () => {
	test("the neighbours shrink by 30 % per mechanic from three on; six or more leave one day", async () => {
		const { sideShare, visibleDays, centerLeft, dayAtCenter } = await import("./calendar-geometry.js");
		assert.deepEqual([1, 2, 3, 4, 5, 6, 8].map((m) => Math.round(sideShare(m) * 10) / 10), [1, 1, 0.7, 0.4, 0.1, 0, 0]);
		assert.equal(visibleDays("day", 1200, 2), 3);
		assert.equal(Math.round(visibleDays("day", 1200, 3) * 10) / 10, 2.4);
		assert.equal(visibleDays("day", 1200, 6), 1);
		assert.equal(visibleDays("week", 1200, 6), 7);
		const layout = dayWindow({ anchor: TODAY, dayWidth: 100, isSlim: () => false, days: 10 });
		const left = centerLeft(layout, TODAY, 300);
		assert.equal(left, layout.offsets[10] + 50 - 150);
		assert.equal(dayAtCenter(layout, left, 300), TODAY);
	});
});
