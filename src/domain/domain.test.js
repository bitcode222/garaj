import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { APPOINTMENT_TRANSITIONS, findConflicts, quickAppointmentMoves } from "./appointment.js";
import { isValidCUI, isValidIBAN, normalizePhone, smsHref, whatsappHref } from "./customer.js";
import { addMonthsISO, diffDaysISO, isISODate } from "./dates.js";
import { deadline, estimateKm } from "./vehicle.js";
import { reservedByPart, stockDelta, stockLevel } from "./inventory.js";
import { buildStorno, invoiceState, issueInvoice, issueProblems, paymentProblem } from "./invoice.js";
import { computeTotals, lineNet } from "./lines.js";
import { divRound, formatMoney, parseMoney, parseQuantity, percentOf, toInputAmount } from "./money.js";
import { computeReminders } from "./reminders.js";
import { revenueByMonth } from "./reports.js";
import { fold, matchesTokens, queryTokens } from "./search.js";
import { addReading, formatPlate, serviceDue, vinIssue } from "./vehicle.js";
import { canTransition, transition } from "./work-order.js";

const settings = {
	currency: "RON",
	shop: { name: "Garaj Test", legalName: "Garaj Test SRL", cui: "RO14399840", iban: "RO49AAAA1B31007593840000" },
	invoicing: { series: "GRJ", vatPayer: true, vatRate: 21, dueDays: 14 },
	hours: { open: "08:00", close: "18:00" },
};

describe("money", () => {
	test("parses Romanian and English formats", () => {
		assert.equal(parseMoney("1.234,56"), 123456);
		assert.equal(parseMoney("1234.56"), 123456);
		assert.equal(parseMoney("1 234,5 lei"), 123450);
		assert.equal(parseMoney("1.234"), 123400);
		assert.equal(parseMoney("12,345"), 1235);
		assert.equal(parseMoney("0,5"), 50);
		assert.equal(parseMoney(",5"), 50);
		assert.equal(parseMoney("-12,30"), -1230);
		assert.equal(parseMoney("1,234.56"), 123456);
		assert.equal(parseMoney("-0"), 0);
		assert.equal(parseMoney("abc"), null);
		assert.equal(parseMoney(""), null);
		assert.equal(parseMoney("1.23.4"), null);
	});

	test("formats with ro-RO grouping", () => {
		assert.equal(formatMoney(123456), "1.234,56 lei");
		assert.equal(formatMoney(-500), "-5,00 lei");
		assert.equal(formatMoney(150000, "RON", { decimals: 0 }), "1.500 lei");
		assert.equal(toInputAmount(123456), "1234,56");
		assert.equal(toInputAmount(-5), "-0,05");
	});

	test("rounds half away from zero, symmetric for negatives", () => {
		assert.equal(divRound(25n, 10n), 3n);
		assert.equal(divRound(-25n, 10n), -3n);
		assert.equal(divRound(24n, 10n), 2n);
		assert.equal(percentOf(1000, 21), 210);
		assert.equal(percentOf(-1000, 21), -210);
	});

	test("parses quantities", () => {
		assert.equal(parseQuantity("1,5"), 1.5);
		assert.equal(parseQuantity("0.333333"), 0.333);
		assert.equal(parseQuantity("x"), null);
	});
});

describe("lines and totals", () => {
	test("0.1 + 0.2 style drift cannot happen", () => {
		const lines = Array.from({ length: 10 }, () => ({ kind: "fee", qty: 1, unitPrice: 10, vatRate: 21 }));
		assert.equal(computeTotals(lines).net, 100);
	});

	test("one rounding per line with decimal quantity and discount", () => {
		// 1.5 h × 137,50 lei − 10 % = 185,625 → 185,63
		assert.equal(lineNet({ qty: 1.5, unitPrice: 13750, discountPct: 10 }), 18563);
	});

	test("VAT per rate on the net sum", () => {
		const t = computeTotals([
			{ kind: "labor", qty: 1, unitPrice: 33333, vatRate: 21 },
			{ kind: "part", qty: 3, unitPrice: 3333, vatRate: 21, cost: 2000 },
			{ kind: "fee", qty: 1, unitPrice: 1000, vatRate: 11 },
		]);
		assert.equal(t.net, 33333 + 9999 + 1000);
		assert.deepEqual(
			t.byRate.map((g) => [g.rate, g.taxable, g.vat]),
			[
				[21, 43332, 9100],
				[11, 1000, 110],
			],
		);
		assert.equal(t.gross, t.net + 9210);
		assert.equal(t.partsMargin, 9999 - 6000);
		assert.equal(t.hours, 1);
	});

	test("non-VAT payer has no VAT", () => {
		const t = computeTotals([{ kind: "labor", qty: 2, unitPrice: 15000, vatRate: 21 }], { vatPayer: false });
		assert.equal(t.vat, 0);
		assert.equal(t.gross, 30000);
	});
});

describe("dates", () => {
	test("month arithmetic clamps", () => {
		assert.equal(addMonthsISO("2026-01-31", 1), "2026-02-28");
		assert.equal(addMonthsISO("2028-01-31", 1), "2028-02-29");
		assert.equal(addMonthsISO("2026-09-30", -12), "2025-09-30");
	});
	test("day difference ignores DST", () => {
		assert.equal(diffDaysISO("2026-03-28", "2026-03-30"), 2);
		assert.equal(diffDaysISO("2026-10-24", "2026-10-26"), 2);
		assert.equal(diffDaysISO("2026-10-01", "2026-09-30"), -1);
	});
	test("validates ISO dates", () => {
		assert.ok(isISODate("2026-02-28"));
		assert.ok(!isISODate("2026-02-30"));
		assert.ok(!isISODate("30.09.2026"));
	});
});

describe("customers", () => {
	test("CUI control digit", () => {
		assert.ok(isValidCUI("14399840"));
		assert.ok(isValidCUI("RO 14399840"));
		assert.ok(!isValidCUI("14399841"));
		assert.ok(!isValidCUI("abc"));
	});
	test("IBAN mod 97", () => {
		assert.ok(isValidIBAN("RO49 AAAA 1B31 0075 9384 0000"));
		assert.ok(!isValidIBAN("RO49AAAA1B31007593840001"));
	});
	test("phones become E.164 for links", () => {
		assert.equal(normalizePhone("0722 123 456"), "+40722123456");
		assert.equal(normalizePhone("0040722123456"), "+40722123456");
		assert.equal(normalizePhone("+40 722-123-456"), "+40722123456");
		assert.equal(whatsappHref("0722123456", "Salut"), "https://wa.me/40722123456?text=Salut");
		assert.equal(smsHref("0722123456", "a b"), "sms:+40722123456?&body=a%20b");
	});
});

describe("vehicles", () => {
	test("plates", () => {
		assert.equal(formatPlate("b123abc"), "B 123 ABC");
		assert.equal(formatPlate("B-12-XYZ"), "B 12 XYZ");
		assert.equal(formatPlate("cj 07 ttt"), "CJ 07 TTT");
		assert.equal(formatPlate("if123456"), "IF 123456");
	});
	test("VIN", () => {
		assert.equal(vinIssue(""), null);
		assert.equal(vinIssue("WVWZZZ1KZ6W000001"), null);
		assert.match(vinIssue("WVWZZZ1KZ6W00000"), /16 caractere/);
		assert.match(vinIssue("WVWZZZ1KZ6W00000O"), /I, O sau Q/);
	});
	test("lower mileage is allowed with a warning", () => {
		const v = { mileage: [{ date: "2026-01-10", km: 120000 }] };
		const { vehicle, warning } = addReading(v, { date: "2026-09-01", km: 119000 });
		assert.equal(vehicle.mileage.length, 2);
		assert.match(warning, /mai mic/);
		assert.equal(addReading(v, { date: "2026-09-01", km: 125000 }).warning, null);
	});
	test("service due by km before date", () => {
		const v = {
			lastServiceDate: "2026-03-01",
			lastServiceKm: 100000,
			serviceIntervalKm: 10000,
			serviceIntervalMonths: 12,
			mileage: [
				{ date: "2026-03-01", km: 100000 },
				{ date: "2026-09-01", km: 109500 },
			],
		};
		const due = serviceDue(v, "2026-09-30");
		assert.equal(due.status, "expired");
		assert.ok(due.kmLeft < 0);
	});
});

describe("work orders", () => {
	test("state machine", () => {
		assert.ok(canTransition("estimate", "in_progress"));
		assert.ok(canTransition("ready", "in_progress"));
		assert.ok(!canTransition("delivered", "in_progress"));
		const o = transition({ status: "estimate", dates: {}, activity: [] }, "approved", { now: "t" });
		assert.equal(o.status, "approved");
		assert.equal(o.dates.approved, "t");
		assert.throws(() => transition(o, "delivered"));
	});
});

describe("invoices", () => {
	const customer = { id: "c1", type: "person", name: "Ion Popescu" };
	const draft = {
		id: "i1",
		status: "draft",
		series: "GRJ",
		issueDate: "2026-09-01",
		dueDate: "2026-09-15",
		customerId: "c1",
		lines: [
			{ id: "l1", kind: "labor", description: "Revizie", qty: 2, unit: "h", unitPrice: 15000, vatRate: 21 },
			{ id: "l2", kind: "part", refId: "p1", description: "Filtru", qty: 1, unit: "buc", unitPrice: 5000, vatRate: 21 },
		],
	};

	test("blocks incomplete drafts", () => {
		assert.deepEqual(issueProblems({ ...draft, lines: [] }, { customer }), ["Adaugă cel puțin o linie."]);
		assert.match(issueProblems(draft, { customer: { type: "company", name: "X" } })[0], /CUI/);
		assert.match(issueProblems({ ...draft, dueDate: "2026-08-01" }, { customer })[0], /Scadența/);
	});

	test("issue freezes a snapshot and totals", () => {
		const issued = issueInvoice(draft, { settings, customer, number: 7, now: "t" });
		assert.equal(issued.status, "issued");
		assert.equal(issued.number, 7);
		assert.equal(issued.totals.gross, 42350);
		assert.equal(issued.snapshot.buyer.name, "Ion Popescu");
		assert.equal(issued.snapshot.seller.cui, "RO14399840");
	});

	test("storno negates exactly and cannot be chained", () => {
		const issued = issueInvoice(draft, { settings, customer, number: 7 });
		const storno = buildStorno(issued, { number: 8, today: "2026-09-20" });
		assert.equal(storno.totals.gross, -issued.totals.gross);
		assert.equal(storno.totals.vat, -issued.totals.vat);
		assert.throws(() => buildStorno(storno, { number: 9, today: "2026-09-20" }), /stornare/);
		assert.throws(() => buildStorno({ ...issued, status: "cancelled" }, { number: 9, today: "x" }));
		assert.throws(() => buildStorno(draft, { number: 9, today: "x" }), /Ciornele/);
	});

	test("derived state and payments", () => {
		const issued = issueInvoice(draft, { settings, customer, number: 1 });
		assert.equal(invoiceState(issued, [], "2026-09-10"), "issued");
		assert.equal(invoiceState(issued, [{ amount: 100 }], "2026-09-10"), "partial");
		assert.equal(invoiceState(issued, [{ amount: 100 }], "2026-09-16"), "overdue");
		assert.equal(invoiceState(issued, [{ amount: 42350 }], "2026-09-16"), "paid");
		assert.match(paymentProblem(50000, { invoice: issued, payments: [] }), /depășește/);
		assert.match(paymentProblem(0, { invoice: issued, payments: [] }), /mai mare ca zero/);
		assert.equal(paymentProblem(42350, { invoice: issued, payments: [] }), null);
		assert.match(paymentProblem(1, { invoice: issued, payments: [{ amount: 42350 }] }), /achitată/);
	});

	test("storno pair nets to zero in revenue", () => {
		const issued = issueInvoice(draft, { settings, customer, number: 1 });
		const storno = buildStorno(issued, { number: 2, today: "2026-10-02" });
		const rows = revenueByMonth([{ ...issued, status: "cancelled" }, storno], ["2026-09", "2026-10"]);
		assert.equal(rows[0].net + rows[1].net, 0);
	});
});

describe("appointments", () => {
	test("conflicts only for same mechanic or bay", () => {
		const a = { id: "a", status: "scheduled", start: "2026-09-30T08:00:00.000Z", end: "2026-09-30T09:00:00.000Z", staffId: "m1", bayId: "b1" };
		const others = [
			{ id: "b", status: "scheduled", start: "2026-09-30T08:30:00.000Z", end: "2026-09-30T09:30:00.000Z", staffId: "m1", bayId: "b2" },
			{ id: "c", status: "scheduled", start: "2026-09-30T08:30:00.000Z", end: "2026-09-30T09:30:00.000Z", staffId: "m2", bayId: "b3" },
			{ id: "d", status: "cancelled", start: "2026-09-30T08:00:00.000Z", end: "2026-09-30T09:00:00.000Z", staffId: "m1", bayId: "b1" },
			{ id: "e", status: "scheduled", start: "2026-09-30T09:00:00.000Z", end: "2026-09-30T10:00:00.000Z", staffId: "m1", bayId: "b1" },
		];
		assert.deepEqual(findConflicts(a, others).map((x) => x.id), ["b"]);
	});
});

describe("vehicle dates without a known today", () => {
	test("estimateKm and deadline degrade instead of throwing", () => {
		const vehicle = { mileage: [{ date: "2026-01-01", km: 1000 }, { date: "2026-06-01", km: 5000 }] };
		assert.equal(estimateKm(vehicle, null), 5000);
		assert.deepEqual(deadline("2026-12-01", null), { status: "unknown", days: null });
	});
});

describe("appointment quick status moves", () => {
	test("only legal moves, never done", () => {
		for (const status of Object.keys(APPOINTMENT_TRANSITIONS)) {
			const moves = quickAppointmentMoves(status);
			assert.ok(moves.every((to) => APPOINTMENT_TRANSITIONS[status].includes(to)));
			assert.ok(!moves.includes("done"));
		}
		assert.deepEqual(quickAppointmentMoves("scheduled"), ["confirmed", "arrived", "no_show", "cancelled"]);
		assert.deepEqual(quickAppointmentMoves("cancelled"), ["scheduled"]);
		assert.deepEqual(quickAppointmentMoves("arrived"), []);
	});
});

describe("inventory", () => {
	test("reserved excludes invoiced and closed orders", () => {
		const orders = [
			{ status: "in_progress", lines: [{ kind: "part", refId: "p1", qty: 2 }] },
			{ status: "ready", invoiceId: "inv", lines: [{ kind: "part", refId: "p1", qty: 5 }] },
			{ status: "delivered", lines: [{ kind: "part", refId: "p1", qty: 9 }] },
		];
		const reserved = reservedByPart(orders, new Map([["inv", { status: "issued" }]]));
		assert.equal(reserved.get("p1"), 2);
		assert.deepEqual([...stockDelta([{ kind: "part", refId: "p1", qty: -2 }], 1)], [["p1", 2]]);
		assert.equal(stockLevel({ stock: 5, minStock: 3 }, 2).status, "low");
		assert.equal(stockLevel({ stock: 2, minStock: 0 }, 2).status, "out");
	});
});

describe("reminders", () => {
	test("ITP soon shows until snoozed", () => {
		const base = {
			today: "2026-09-30",
			vehicles: [{ id: "v1", customerId: "c1", itpExpiry: "2026-10-10", plate: "B123ABC" }],
			customersById: new Map([["c1", { id: "c1", name: "Ion" }]]),
			invoices: [],
			paymentsByInvoice: new Map(),
			workOrders: [],
			appointments: [],
		};
		const shown = computeReminders({ ...base, contactsByKey: new Map() });
		assert.equal(shown.length, 1);
		assert.equal(shown[0].type, "itp");
		const hidden = computeReminders({
			...base,
			contactsByKey: new Map([[shown[0].key, { snoozeUntil: "2026-10-07" }]]),
		});
		assert.equal(hidden.length, 0);
	});
});

describe("search", () => {
	test("diacritics and plates", () => {
		const hay = fold("Ștefan Ionescu B 123 ABC B123ABC");
		assert.ok(matchesTokens(hay, queryTokens("stefan b123")));
		assert.ok(!matchesTokens(hay, queryTokens("maria")));
	});
});
