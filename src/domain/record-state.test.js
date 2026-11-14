import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { appointmentSignal, invoiceSignal, orderKind, orderSignal } from "./record-state.js";

// Local-time instants, so the tests do not depend on the machine's time zone.
const at = (day, hour, minute = 0) => new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`).toISOString();
const TODAY = "2026-11-02";
const NOW = at(TODAY, 11, 20);
const pick = ({ key, signal, text }) => ({ key, signal, text });

describe("a work order's kind", () => {
	test("a Deviz while estimate or approved, a Lucrare from in_progress on", () => {
		for (const status of ["estimate", "approved"]) assert.equal(orderKind({ status }), "estimate");
		for (const status of ["in_progress", "waiting_parts", "ready", "delivered"]) assert.equal(orderKind({ status }), "job");
	});

	test("a cancelled one stays what it was: a Lucrare only if it was ever started", () => {
		assert.equal(orderKind({ status: "cancelled", dates: { estimate: at("2026-10-30", 9) } }), "estimate");
		assert.equal(orderKind({ status: "cancelled", dates: { in_progress: at("2026-10-30", 9) } }), "job");
	});
});

describe("a booking's state", () => {
	const booking = (status, day = TODAY, hour = 14, extra = {}) => ({ status, start: at(day, hour), end: at(day, hour + 1), ...extra });

	test("its stored status first: cancelled, no-show, done, arrived", () => {
		assert.deepEqual(pick(appointmentSignal(booking("cancelled"), { now: NOW })), { key: "cancelled", signal: "neutral", text: "Anulată" });
		assert.deepEqual(pick(appointmentSignal(booking("no_show"), { now: NOW })), { key: "no_show", signal: "danger", text: "Neprezentat" });
		assert.deepEqual(pick(appointmentSignal(booking("done", "2026-10-30"), { now: NOW })), { key: "done", signal: "neutral", text: "Finalizată" });
		assert.deepEqual(pick(appointmentSignal(booking("arrived", TODAY, 9), { now: NOW })), { key: "arrived", signal: "active", text: "Sosit" });
	});

	test("to confirm, confirmed: amber, green", () => {
		assert.deepEqual(pick(appointmentSignal(booking("scheduled"), { now: NOW })), { key: "to_confirm", signal: "warning", text: "De confirmat" });
		assert.deepEqual(pick(appointmentSignal(booking("confirmed", "2026-11-05"), { now: NOW })), { key: "confirmed", signal: "success", text: "Confirmată" });
	});

	test("a day that passed with nothing recorded is missed, whatever it was", () => {
		for (const status of ["scheduled", "confirmed"]) assert.deepEqual(pick(appointmentSignal(booking(status, "2026-11-01"), { now: NOW })), { key: "missed", signal: "danger", text: "Nu a sosit" });
	});

	test("late today after 15 minutes of grace; inside them, still as it was", () => {
		assert.deepEqual(pick(appointmentSignal(booking("confirmed", TODAY, 10), { now: NOW })), { key: "late", signal: "danger", text: "Întârzie 1 h 20 min" });
		assert.equal(appointmentSignal({ status: "confirmed", start: at(TODAY, 11, 10), end: at(TODAY, 12) }, { now: NOW }).key, "confirmed");
	});

	test("a customer who called is late only from the time they gave", () => {
		const called = booking("confirmed", TODAY, 10, { expectedAt: at(TODAY, 12) });
		assert.equal(appointmentSignal(called, { now: NOW }).key, "confirmed");
		assert.deepEqual(pick(appointmentSignal(called, { now: at(TODAY, 12, 30) })), { key: "late", signal: "danger", text: "Întârzie 30 min" });
	});
});

describe("a work order's state", () => {
	const order = (status, extra = {}) => ({ status, createdAt: at("2026-10-30", 9), dates: { [status]: at("2026-10-31", 9) }, ...extra });
	const ends = (day) => ({ end: at(day, 17) });

	test("a Deviz: to approve (amber), approved (green), cancelled (grey)", () => {
		assert.deepEqual(pick(orderSignal(order("estimate"), { today: TODAY })), { key: "awaiting_approval", signal: "warning", text: "De aprobat" });
		assert.match(orderSignal(order("estimate"), { today: TODAY }).detail, /de 2 zile/);
		assert.deepEqual(pick(orderSignal(order("approved"), { today: TODAY })), { key: "approved", signal: "success", text: "Aprobat" });
		assert.deepEqual(pick(orderSignal(order("cancelled"), { today: TODAY })), { key: "cancelled", signal: "neutral", text: "Anulat" });
	});

	test("a Lucrare: in progress in its own colour, ready green, delivered and cancelled grey", () => {
		assert.deepEqual(pick(orderSignal(order("in_progress"), { today: TODAY })), { key: "in_progress", signal: "active", text: "În lucru" });
		assert.deepEqual(pick(orderSignal(order("ready", { dates: { ready: at(TODAY, 9) } }), { today: TODAY })), { key: "ready", signal: "success", text: "Gata" });
		assert.deepEqual(pick(orderSignal(order("delivered"), { today: TODAY })), { key: "delivered", signal: "neutral", text: "Predată" });
		assert.deepEqual(pick(orderSignal(order("cancelled", { dates: { in_progress: at("2026-10-30", 9) } }), { today: TODAY })), { key: "cancelled", signal: "neutral", text: "Anulată" });
	});

	test("past the end of its booking it is late, as a Deviz or as a Lucrare; a walk-in never is", () => {
		assert.deepEqual(pick(orderSignal(order("estimate"), { today: TODAY, appointment: ends("2026-11-01") })), { key: "overdue", signal: "danger", text: "Întârziat cu 1 zi" });
		assert.deepEqual(pick(orderSignal(order("in_progress"), { today: TODAY, appointment: ends("2026-10-30") })), { key: "overdue", signal: "danger", text: "Întârziată cu 3 zile" });
		assert.equal(orderSignal(order("in_progress"), { today: TODAY, appointment: ends(TODAY) }).key, "in_progress");
		assert.equal(orderSignal(order("in_progress"), { today: TODAY }).key, "in_progress");
		// Finished work has no deadline left.
		assert.equal(orderSignal(order("ready", { dates: { ready: at(TODAY, 9) } }), { today: TODAY, appointment: ends("2026-10-30") }).key, "ready");
	});

	test("parts waited for from 3 days are red; a car not collected from 2 days is amber", () => {
		assert.equal(orderSignal(order("waiting_parts", { dates: { waiting_parts: at("2026-11-01", 9) } }), { today: TODAY }).key, "waiting_parts");
		assert.deepEqual(pick(orderSignal(order("waiting_parts", { dates: { waiting_parts: at("2026-10-30", 9) } }), { today: TODAY })), { key: "parts_late", signal: "danger", text: "Piese de 3 zile" });
		assert.equal(orderSignal(order("ready", { dates: { ready: at("2026-11-01", 9) } }), { today: TODAY }).key, "ready");
		assert.deepEqual(pick(orderSignal(order("ready", { dates: { ready: at("2026-10-31", 9) } }), { today: TODAY })), { key: "not_collected", signal: "warning", text: "Neridicată de 2 zile" });
	});
});

describe("an invoice's state", () => {
	const invoice = (extra = {}) => ({ status: "issued", totals: { gross: 100_000 }, dueDate: "2026-11-10", ...extra });
	const paid = (amount) => [{ amount }];
	const at2 = { today: TODAY };

	test("draft, credit note and the invoice it cancels are grey; paid is green", () => {
		assert.deepEqual(pick(invoiceSignal(invoice({ status: "draft" }), [], at2)), { key: "draft", signal: "neutral", text: "Ciornă" });
		assert.deepEqual(pick(invoiceSignal(invoice({ status: "cancelled" }), [], at2)), { key: "stornoed", signal: "neutral", text: "Stornată" });
		assert.deepEqual(pick(invoiceSignal(invoice({ stornoOf: "x", totals: { gross: -100_000 } }), [], at2)), { key: "storno", signal: "neutral", text: "Stornare" });
		assert.deepEqual(pick(invoiceSignal(invoice(), paid(100_000), at2)), { key: "paid", signal: "success", text: "Plătită" });
	});

	test("past its due date it is overdue by whole days, partly paid or not, with the remainder in the detail", () => {
		assert.deepEqual(pick(invoiceSignal(invoice({ dueDate: "2026-11-01" }), [], at2)), { key: "overdue", signal: "danger", text: "Restantă de 1 zi" });
		const partly = invoiceSignal(invoice({ dueDate: "2026-10-13" }), paid(40_000), at2);
		assert.deepEqual(pick(partly), { key: "overdue", signal: "danger", text: "Restantă de 20 de zile" });
		assert.match(partly.detail, /^Rest de plată 600,00 lei/);
	});

	test("before it: due today, tomorrow, in N days, or simply to pay; partly paid says so", () => {
		assert.equal(invoiceSignal(invoice({ dueDate: TODAY }), [], at2).text, "Scadentă azi");
		assert.equal(invoiceSignal(invoice({ dueDate: "2026-11-03" }), [], at2).text, "Scadentă mâine");
		assert.deepEqual(pick(invoiceSignal(invoice(), [], at2)), { key: "due", signal: "warning", text: "Scadentă în 8 zile" });
		assert.equal(invoiceSignal(invoice({ dueDate: null }), [], at2).text, "De plată");
		assert.deepEqual(pick(invoiceSignal(invoice(), paid(30_000), at2)), { key: "partial", signal: "warning", text: "Parțial plătită" });
	});
});
