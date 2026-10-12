import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { APPOINTMENT_TRANSITIONS, findConflicts, quickAppointmentMoves } from "./appointment.js";
import { isValidCUI, isValidIBAN, normalizePhone, smsHref, whatsappHref } from "./customer.js";
import { addMonthsISO, diffDaysISO, isISODate } from "./dates.js";
import { deadline, estimateKm } from "./vehicle.js";
import { reservedByPart, stockDelta, stockLevel } from "./inventory.js";
import { buildStorno, invoiceState, issueInvoice, issueProblems, paymentProblem } from "./invoice.js";
import { computeTotals, laborLineFromOperation, laborPrice, lineNet, operationFigures, operationVatRate, operationFromService } from "./lines.js";
import { divRound, formatMoney, parseMoney, parseQuantity, percentOf, toInputAmount } from "./money.js";
import { computeReminders } from "./reminders.js";
import { revenueByMonth } from "./reports.js";
import { fold, matchesTokens, queryTokens } from "./search.js";
import { addReading, formatPlate, serviceDue, vinIssue } from "./vehicle.js";
import { VISIT_STAGES, appointmentForJob, arrivalDelay, buildVisits, countStages, defaultCalendarView, jobsWithoutBooking, pickupWait, visitStage } from "./visit.js";
import { WO_NEXT, canTransition, isBackwardMove, transition } from "./work-order.js";

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
		assert.ok(canTransition("ready", "estimate"));
		assert.ok(canTransition("in_progress", "approved"));
		assert.ok(!canTransition("cancelled", "estimate"));
		assert.ok(isBackwardMove("ready", "estimate"));
		assert.ok(!isBackwardMove("in_progress", "waiting_parts"));
		assert.ok(!isBackwardMove("estimate", "approved"));
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

describe("labor price and invoice counts", () => {
	test("laborPrice rounds to whole bani and tolerates empty hours", () => {
		assert.equal(laborPrice(1.5, 15000), 22500);
		assert.equal(laborPrice("", 15000), 0);
	});

	test("a cancelled original is not counted as an invoice", () => {
		const base = { status: "issued", number: 1, issueDate: "2026-09-10", totals: { labor: 100, parts: 0, fees: 0, net: 100 } };
		const rows = revenueByMonth(
			[
				{ ...base, status: "cancelled" },
				{ ...base, number: 2, stornoOf: "x", totals: { labor: -100, parts: 0, fees: 0, net: -100 } },
			],
			["2026-09"],
		);
		assert.equal(rows[0].net, 0);
		assert.equal(rows[0].count, 0);
	});
});

describe("work order next step", () => {
	test("every suggested next step is a legal, forward move", () => {
		for (const [from, to] of Object.entries(WO_NEXT)) {
			assert.ok(canTransition(from, to), `${from} → ${to}`);
		}
		assert.equal(WO_NEXT.delivered, undefined);
		assert.equal(WO_NEXT.cancelled, undefined);
	});
});

test("operation: custom price and cost give margin, and the labor line totals match", () => {
	const op = operationFromService({ id: "s1", name: "Ulei", hours: 1.5, price: 30000 }, 20000);
	assert.deepEqual(op, { serviceId: "s1", name: "Ulei", hours: 1.5, price: 30000, cost: 0 });
	const custom = { ...op, name: "Ulei special", hours: 2, price: 45000, cost: 15000 };
	const f = operationFigures(custom, 21);
	assert.equal(f.net, 45000);
	assert.equal(f.gross, 54450);
	assert.equal(f.margin, 30000);
	assert.equal(f.marginPct, 66.7);
	const line = laborLineFromOperation(custom, { id: "l1", vatRate: 21 });
	assert.equal(line.description, "Ulei special");
	assert.equal(lineNet(line), 45000);
	const t = computeTotals([line]);
	assert.equal(t.laborCost, 15000);
	assert.equal(t.laborMargin, 30000);
});

test("operation VAT: own rate overrides the standard; none when not a VAT payer", () => {
	assert.equal(operationVatRate({}, { vatPayer: true, vatRate: 21 }), 21);
	assert.equal(operationVatRate({ vatRate: 11 }, { vatPayer: true, vatRate: 21 }), 11);
	assert.equal(operationVatRate({ vatRate: 0 }, { vatPayer: true, vatRate: 21 }), 0);
	assert.equal(operationVatRate({ vatRate: 11 }, { vatPayer: false, vatRate: 21 }), 0);
});

describe("visit stage (dashboard calendar)", () => {
	test("a booking shows its job's stage once the car is checked in", () => {
		assert.equal(visitStage({ status: "scheduled" }), "scheduled");
		assert.equal(visitStage({ status: "confirmed" }), "scheduled");
		assert.equal(visitStage({ status: "arrived" }, { status: "estimate" }), "estimate");
		assert.equal(visitStage({ status: "arrived" }, { status: "waiting_parts" }), "waiting_parts");
		assert.equal(visitStage({ status: "arrived" }, { status: "ready" }), "ready");
		assert.equal(visitStage({ status: "done" }, { status: "delivered" }), "delivered");
		assert.equal(visitStage({ status: "done" }), "delivered");
		assert.equal(visitStage({ status: "no_show" }), "no_show");
	});

	test("cancelled bookings and cancelled jobs are not shown; a missing job still counts as in the shop", () => {
		assert.equal(visitStage({ status: "cancelled" }), null);
		assert.equal(visitStage({ status: "arrived" }, { status: "cancelled" }), null);
		assert.equal(visitStage({ status: "arrived" }), "in_progress");
	});

	test("opens on the day only when something active is booked for it", () => {
		assert.equal(defaultCalendarView([{ status: "confirmed" }]), "day");
		assert.equal(defaultCalendarView([{ status: "done" }]), "day");
		assert.equal(defaultCalendarView([{ status: "cancelled" }, { status: "no_show" }]), "week");
		assert.equal(defaultCalendarView([]), "week");
		assert.equal(defaultCalendarView(undefined), "week");
	});

	test("jobs without a shown booking: open only, in pipeline order, oldest first", () => {
		const orders = [
			{ id: "a", status: "ready", createdAt: "2026-10-01T08:00:00.000Z" },
			{ id: "b", status: "estimate", createdAt: "2026-10-03T08:00:00.000Z" },
			{ id: "c", status: "estimate", createdAt: "2026-10-02T08:00:00.000Z" },
			{ id: "d", status: "delivered", createdAt: "2026-10-01T08:00:00.000Z" },
			{ id: "e", status: "in_progress", createdAt: "2026-10-01T08:00:00.000Z" },
		];
		assert.deepEqual(jobsWithoutBooking(orders, new Set(["e"])).map((o) => o.id), ["c", "b", "a"]);
	});

	test("counts cover every stage", () => {
		const counts = countStages(["estimate", "estimate", "ready", "scheduled"]);
		assert.deepEqual(Object.keys(counts), VISIT_STAGES);
		assert.equal(counts.estimate, 2);
		assert.equal(counts.ready, 1);
		assert.equal(counts.delivered, 0);
	});
});

describe("card → calendar target", () => {
	const at = (id, start, extra = {}) => ({ id, start, status: "scheduled", vehicleId: "car1", ...extra });
	test("prefers the booking the job was checked in from, then any booking that names it", () => {
		const appts = { a: at("a", "2026-10-20T09:00:00.000Z"), b: at("b", "2026-10-14T09:00:00.000Z", { workOrderId: "job1" }) };
		assert.equal(appointmentForJob({ id: "job1", vehicleId: "car1", appointmentId: "a" }, appts, "2026-10-13").id, "a");
		assert.equal(appointmentForJob({ id: "job1", vehicleId: "car1" }, appts, "2026-10-13").id, "b");
	});
	test("otherwise the same car's booking nearest to today; cancelled ones are ignored; none for another car", () => {
		const appts = {
			far: at("far", "2026-10-30T09:00:00.000Z"),
			near: at("near", "2026-10-15T09:00:00.000Z"),
			gone: at("gone", "2026-10-13T10:00:00.000Z", { status: "cancelled" }),
			other: at("other", "2026-10-13T11:00:00.000Z", { vehicleId: "car2" }),
		};
		assert.equal(appointmentForJob({ id: "j", vehicleId: "car1" }, appts, "2026-10-13").id, "near");
		assert.equal(appointmentForJob({ id: "j", vehicleId: "car9" }, appts, "2026-10-13"), null);
		assert.equal(appointmentForJob({ id: "j" }, appts, "2026-10-13"), null);
	});
});

describe("visits index", () => {
	// Local-time instants, so the test does not depend on the machine's time zone.
	const local = (day, hour, minute = 0) => new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`).toISOString();
	const appointments = {
		booked: { id: "booked", status: "confirmed", start: local("2026-10-13", 14), end: local("2026-10-13", 15), vehicleId: "car1", customerId: "c1", staffId: "m1" },
		early: { id: "early", status: "arrived", start: local("2026-10-13", 9), end: local("2026-10-13", 11), vehicleId: "car2", workOrderId: "job2", staffId: "m2" },
		named: { id: "named", status: "arrived", start: local("2026-10-12", 9), end: local("2026-10-12", 10), vehicleId: "car3" },
		gone: { id: "gone", status: "cancelled", start: local("2026-10-13", 10), end: local("2026-10-13", 11), vehicleId: "car4", workOrderId: "job4" },
		old: { id: "old", status: "done", start: local("2026-10-01", 9), end: local("2026-10-01", 10), vehicleId: "car2", workOrderId: "job0" },
	};
	const workOrders = {
		job0: { id: "job0", status: "delivered", vehicleId: "car2", createdAt: local("2026-10-01", 9) },
		job2: { id: "job2", status: "ready", vehicleId: "car2", appointmentId: "early", createdAt: local("2026-10-13", 9) },
		job3: { id: "job3", status: "in_progress", vehicleId: "car3", appointmentId: "named", createdAt: local("2026-10-12", 9) },
		job4: { id: "job4", status: "estimate", vehicleId: "car4", staffId: "m1", createdAt: local("2026-10-13", 10) },
		job5: { id: "job5", status: "estimate", vehicleId: "car5", createdAt: local("2026-10-11", 16) },
	};
	const visits = buildVisits(appointments, workOrders);

	test("a booking and its job are one visit, whichever side names the other", () => {
		assert.equal(visits.byId.get("early").order.id, "job2");
		assert.equal(visits.byId.get("early").stage, "ready");
		assert.equal(visits.byOrder.get("job3").id, "named");
		assert.equal(visits.byOrder.get("job3").stage, "in_progress");
		assert.equal(visits.byId.get("booked").stage, "scheduled");
		assert.equal(visits.byId.get("booked").order, null);
	});

	test("open jobs nobody booked are walk-ins; a cancelled booking does not hide its open job", () => {
		assert.equal(visits.byId.get("job5").kind, "walkin");
		assert.equal(visits.byId.get("job5").day, "2026-10-11");
		assert.equal(visits.byId.has("gone"), false);
		assert.equal(visits.byOrder.get("job4").kind, "walkin");
		assert.equal(visits.byOrder.get("job4").staffId, "m1");
	});

	test("bookings are grouped by local day in time order; walk-ins are not calendar blocks", () => {
		assert.deepEqual(visits.bookingsByDay.get("2026-10-13").map((v) => v.id), ["early", "booked"]);
		assert.deepEqual(visits.bookingsByDay.get("2026-10-12").map((v) => v.id), ["named"]);
		assert.equal(visits.bookingsByDay.has("2026-10-11"), false);
	});

	test("in service: every open job once, pipeline order, longest in the shop first", () => {
		assert.deepEqual(visits.inService.map((v) => v.order.id), ["job5", "job4", "job3", "job2"]);
	});

	test("visits of one car are found together (this job, and its other bookings)", () => {
		assert.deepEqual(visits.byVehicle.get("car2").map((v) => v.id).sort(), ["early", "old"]);
	});

	test("late arrival: only today, only not yet arrived, only past the grace", () => {
		const now = local("2026-10-13", 14, 40);
		assert.equal(arrivalDelay(appointments.booked, now), 40);
		assert.equal(arrivalDelay(appointments.booked, local("2026-10-13", 14, 10)), 0);
		assert.equal(arrivalDelay(appointments.early, now), 0);
		assert.equal(arrivalDelay({ ...appointments.booked, start: local("2026-10-12", 14) }, now), 0);
	});

	test("waiting for pickup counts whole days since the car became ready", () => {
		const ready = { status: "ready", dates: { ready: local("2026-10-11", 15) } };
		assert.equal(pickupWait(ready, "2026-10-13"), 2);
		assert.equal(pickupWait(ready, "2026-10-11"), 0);
		assert.equal(pickupWait({ status: "in_progress", dates: {} }, "2026-10-13"), 0);
		assert.equal(pickupWait({ status: "ready" }, "2026-10-13"), 0);
	});
});
