import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { collectedOn, monthToDate, stillToCollectToday, takingsToday } from "./analytics.js";

// Azi's money row (docs/DESIGN.md §4, Azi A).
const TODAY = "2026-11-18";
const pay = (date, amount, method = "cash", invoiceId = "x") => ({ date, amount, method, invoiceId });

describe("Azi: money taken today", () => {
	test("per method, largest first; unknown methods count as other", () => {
		const got = collectedOn([pay(TODAY, 1000, "cash"), pay(TODAY, 2500, "card"), pay(TODAY, 500, "cash"), pay(TODAY, 200, "voucher"), pay("2026-11-17", 9999)], TODAY);
		assert.equal(got.total, 4200);
		assert.equal(got.count, 4);
		assert.deepEqual(got.methods, [{ method: "card", amount: 2500 }, { method: "cash", amount: 1500 }, { method: "other", amount: 200 }]);
	});

	test("against the same weekday a week before; no change when that day took nothing", () => {
		const up = takingsToday([pay(TODAY, 1500), pay("2026-11-11", 1000)], TODAY);
		assert.equal(up.previous, 1000);
		assert.equal(up.change.direction, "up");
		assert.equal(Math.round(up.change.pct), 50);
		assert.equal(takingsToday([pay(TODAY, 1500)], TODAY).change, null);
		assert.equal(takingsToday([], TODAY).total, 0);
	});
});

describe("Azi: what can still come in today", () => {
	const settings = { invoicing: { vatPayer: false } };
	const line = (price) => ({ id: "l", kind: "labor", qty: 1, unitPrice: price, vatRate: 0 });
	const orders = [
		{ id: "ready-no-invoice", status: "ready", lines: [line(30000)] },
		{ id: "ready-draft", status: "ready", invoiceId: "draft", lines: [line(20000)] },
		{ id: "ready-billed", status: "ready", invoiceId: "billed", lines: [line(99999)] },
		{ id: "ready-paid", status: "ready", invoiceId: "paid", lines: [line(50000)] },
		{ id: "working", status: "in_progress", lines: [line(70000)] },
	];
	const invoices = [
		{ id: "draft", status: "draft", totals: { gross: 1 } },
		{ id: "billed", status: "issued", dueDate: TODAY, totals: { gross: 80000 } },
		{ id: "paid", status: "issued", dueDate: TODAY, totals: { gross: 50000 } },
		{ id: "due-today", status: "issued", dueDate: TODAY, totals: { gross: 40000 } },
		{ id: "due-later", status: "issued", dueDate: "2026-11-20", totals: { gross: 1000 } },
		{ id: "overdue", status: "issued", dueDate: "2026-11-01", totals: { gross: 1000 } },
		{ id: "draft-due", status: "draft", dueDate: TODAY, totals: { gross: 1000 } },
	];
	const paymentsByInvoice = new Map([
		["billed", [pay("2026-11-17", 30000)]],
		["paid", [pay("2026-11-17", 50000)]],
		["due-today", [pay("2026-11-17", 15000)]],
	]);

	test("ready cars: what is left on their invoice, or the job's total while not invoiced; paid ones left out", () => {
		const got = stillToCollectToday({ workOrders: orders, invoices, paymentsByInvoice, today: TODAY, settings });
		assert.deepEqual(got.cars, { count: 3, amount: 30000 + 20000 + 50000, ids: ["ready-no-invoice", "ready-draft", "ready-billed"] });
	});

	test("other invoices falling due today, not counted twice with their car", () => {
		const got = stillToCollectToday({ workOrders: orders, invoices, paymentsByInvoice, today: TODAY, settings });
		assert.deepEqual(got.invoices, { count: 1, amount: 25000, ids: ["due-today"] });
		assert.equal(got.total, 125000);
	});
});

describe("Azi: the month so far", () => {
	test("adds up day by day and compares with the month before up to the same day", () => {
		const got = monthToDate([pay("2026-11-01", 100), pay("2026-11-03", 200), pay(TODAY, 50), pay("2026-11-19", 999), pay("2026-10-02", 400), pay("2026-10-18", 100), pay("2026-10-31", 70), pay("2025-11-05", 5)], TODAY);
		assert.equal(got.points.length, 18);
		assert.deepEqual(got.points.slice(0, 4), [100, 100, 300, 300]);
		assert.equal(got.value, 350);
		assert.equal(got.days, 30);
		assert.equal(got.previousPoints.length, 31);
		assert.equal(got.previousToDate, 500);
		assert.equal(got.previousTotal, 570);
		assert.equal(got.change.direction, "down");
		assert.equal(Math.round(got.change.pct), -30);
	});

	test("a longer month compares up to the last day of a shorter one", () => {
		const got = monthToDate([pay("2026-02-28", 100), pay("2026-03-31", 300)], "2026-03-31");
		assert.equal(got.previousPoints.length, 28);
		assert.equal(got.previousToDate, 100);
		assert.equal(got.value, 300);
	});

	test("nothing collected yet: zero, and no change without a month before", () => {
		const got = monthToDate([], TODAY);
		assert.equal(got.value, 0);
		assert.equal(got.change, null);
	});
});
