import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
	approveEstimate,
	approveSupplement,
	billableLines,
	chaptersOf,
	checkInPlan,
	declineEstimate,
	invoiceOrderIds,
	invoicePreview,
	invoicesOfOrder,
	issueChecklistFor,
	liveInvoice,
	lucrareState,
	markEstimateSent,
	receiveCar,
	refusedSuggestions,
	reopenProblem,
	setBilling,
	stockAction,
	supplement,
	vatMismatch,
	warrantyFields,
} from "./lucrare.js";
import { canTransition, invoiceLinesFromOrder } from "./work-order.js";

// Local-time instants, so the tests do not depend on the machine's time zone.
const at = (day, hour, minute = 0) => new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`).toISOString();
const DAY = "2026-11-08";
const NOW = at(DAY, 10);
const settings = { invoicing: { series: "GRJ", dueDays: 0, vatPayer: true, vatRate: 21 } };

// Prices in bani, net. 420 + 380 lei net; discs 520 lei recommended.
const line = (id, unitPrice, fields = {}) => ({ id, kind: "labor", refId: null, description: id, qty: 1, unit: "buc", unitPrice, discountPct: 0, vatRate: 21, ...fields });
const LINES = [line("oil", 42000), line("pads", 38000), line("discs", 52000, { need: "recommended" })];
const job = (fields = {}) => ({ id: "j1", number: 1857, status: "estimate", customerId: "c1", vehicleId: "v1", lines: LINES, activity: [], dates: { estimate: NOW }, ...fields });
const invoice = (fields = {}) => ({ id: "i1", status: "issued", series: "GRJ", number: 412, workOrderId: "j1", issuedAt: at(DAY, 15), dueDate: DAY, totals: { gross: 96800 }, ...fields });
const state = (order, more = {}) => lucrareState({ order, today: DAY, settings, ...more });

describe("lucrare: approval is kept (picks 2, 3)", () => {
	test("line by line: refused lines stay, greyed, and never go on the invoice", () => {
		const approved = approveEstimate(job(), { refused: ["discs"], channel: "phone", now: NOW });
		assert.equal(approved.status, "approved");
		assert.deepEqual(billableLines(approved).map((l) => l.id), ["oil", "pads"]);
		assert.equal(approved.lines.find((l) => l.id === "discs").refused, true);
		assert.deepEqual(Object.keys(approved.approval.lines), ["oil", "pads"]);
		assert.equal(approved.approval.channel, "phone");
		const entry = approved.activity.at(-1);
		assert.equal(entry.type, "status");
		assert.equal(entry.channel, "phone");
		assert.deepEqual(entry.refused, ["discs"]);
		assert.deepEqual(invoiceLinesFromOrder(approved, { settings }).map((l) => l.description), ["oil", "pads"]);
	});

	test("approving needs a channel, at least one line, and an open lucrare", () => {
		assert.throws(() => approveEstimate(job(), { channel: "fax", now: NOW }), /cum a aprobat/);
		assert.throws(() => approveEstimate(job({ lines: [] }), { channel: "phone", now: NOW }), /Adaugă o operațiune/);
		assert.throws(() => approveEstimate(job(), { refused: ["oil", "pads", "discs"], channel: "phone", now: NOW }), /refuzat/);
		assert.throws(() => approveEstimate(job({ status: "delivered" }), { channel: "phone", now: NOW }), /închisă/);
	});

	test("added, or changed to cost more, after approval: a supplement; cheaper or removed: nothing", () => {
		const approved = approveEstimate(job(), { refused: ["discs"], channel: "whatsapp", now: NOW });
		assert.equal(supplement(approved).pending, false);

		const bulb = { ...approved, status: "in_progress", lines: [...approved.lines, line("bulb", 3719)] };
		const extra = supplement(bulb);
		assert.equal(extra.pending, true);
		assert.deepEqual(extra.lines, [{ id: "bulb", change: "added" }]);
		assert.equal(extra.delta, 4500); // 37,19 lei + 21 % VAT

		const raised = { ...approved, lines: approved.lines.map((l) => (l.id === "pads" ? { ...l, unitPrice: 40000 } : l)) };
		assert.deepEqual(supplement(raised).lines, [{ id: "pads", change: "raised" }]);
		assert.equal(supplement(raised).delta, 2420);

		const cheaper = { ...approved, lines: approved.lines.filter((l) => l.id !== "oil").map((l) => (l.id === "pads" ? { ...l, unitPrice: 30000 } : l)) };
		assert.equal(supplement(cheaper).pending, false);

		// The client's refused line, edited, is still refused: not a supplement.
		const refusedEdit = { ...approved, lines: approved.lines.map((l) => (l.id === "discs" ? { ...l, unitPrice: 60000 } : l)) };
		assert.equal(supplement(refusedEdit).pending, false);
	});

	test("approving the supplement records it without moving the job; refusing part of it greys that part", () => {
		const approved = approveEstimate(job(), { channel: "phone", now: NOW });
		const working = { ...approved, status: "in_progress", lines: [...approved.lines, line("bulb", 3719), line("wiper", 5000)] };
		const later = at(DAY, 12);
		const done = approveSupplement(working, { refused: ["wiper"], channel: "sms", now: later });
		assert.equal(done.status, "in_progress");
		assert.equal(supplement(done).pending, false);
		assert.equal(done.lines.find((l) => l.id === "wiper").refused, true);
		assert.deepEqual(done.activity.at(-1), { at: later, type: "supplement_approved", channel: "sms", refused: ["wiper"] });
		assert.throws(() => approveSupplement(job({ status: "in_progress" }), { channel: "phone", now: NOW }), /nu a fost aprobat/);
	});

	test("a refused line can be accepted on a second approval", () => {
		const once = approveEstimate(job(), { refused: ["discs"], channel: "phone", now: NOW });
		const twice = approveSupplement(once, { refused: [], channel: "phone", now: NOW });
		assert.equal(twice.lines.find((l) => l.id === "discs").refused, undefined);
		assert.ok(twice.approval.lines.discs);
	});

	test("the client refuses the whole deviz: Refuzată, reactivated as a deviz; its lines are suggested next visit", () => {
		const refused = declineEstimate(job(), { reason: "Prea scump", now: NOW });
		assert.equal(refused.status, "declined");
		assert.equal(refused.activity.at(-1).reason, "Prea scump");
		assert.ok(canTransition("declined", "estimate"));
		assert.ok(!canTransition("approved", "declined"));
		const partly = { ...approveEstimate(job({ id: "j0", createdAt: at("2026-10-01", 9) }), { refused: ["discs"], channel: "phone", now: NOW }) };
		const suggestions = refusedSuggestions("v1", [partly, { ...refused, createdAt: NOW }, job({ id: "x", vehicleId: "v2" })]);
		assert.deepEqual(suggestions.map((s) => [s.line.id, s.orderId]), [["oil", "j1"], ["pads", "j1"], ["discs", "j1"]]);
	});
});

describe("lucrare: phase, chapters, next step and Azi section", () => {
	test("a deviz: no lines, to send, sent", () => {
		let s = state(job({ lines: [] }));
		assert.equal(s.phase, "estimate_empty");
		assert.equal(s.next, "add_lines");
		assert.equal(s.section, "devize");
		s = state(job());
		assert.equal(s.phase, "estimate_to_send");
		assert.deepEqual([s.next, s.other], ["send_estimate", "approve"]);
		assert.equal(s.current, "deviz");
		assert.deepEqual(s.chapters.map((c) => c.state), ["now", "ahead", "ahead", "ahead"]);
		s = state(markEstimateSent(job(), { channel: "whatsapp", now: NOW }));
		assert.equal(s.phase, "estimate_sent");
		assert.equal(s.sentAt, NOW);
		assert.deepEqual([s.next, s.other], ["approve", "send_estimate"]);
		assert.equal(s.chapters[0].status, "sent");
	});

	test("in the shop: to start, in progress, waiting for parts; a pending supplement goes first", () => {
		const approved = approveEstimate(job(), { refused: ["discs"], channel: "phone", now: NOW });
		let s = state(approved);
		assert.equal(s.phase, "to_start");
		assert.equal(s.current, "lucru");
		assert.deepEqual(s.chapters.map((c) => [c.key, c.state]), [["deviz", "done"], ["lucru", "now"], ["factura", "ahead"], ["recenzie", "ahead"]]);
		s = state({ ...approved, status: "in_progress" });
		assert.deepEqual([s.phase, s.next, s.other, s.section], ["in_progress", "ready", "wait_parts", "in_lucru"]);
		s = state({ ...approved, status: "waiting_parts" });
		assert.deepEqual([s.phase, s.next], ["waiting_parts", "resume"]);
		s = state({ ...approved, status: "in_progress", lines: [...approved.lines, line("bulb", 3719)] });
		assert.equal(s.phase, "supplement");
		assert.equal(s.current, "deviz");
		assert.equal(s.chapters[0].status, "supplement");
		assert.equal(s.chapters[1].state, "now");
		assert.equal(s.section, "in_lucru");
	});

	test("jumping straight to work skips the deviz; an older job approved before this change counts as approved", () => {
		assert.equal(state(job({ status: "in_progress" })).chapters[0].state, "skipped");
		assert.equal(state(job({ status: "in_progress", dates: { approved: NOW } })).chapters[0].state, "done");
	});

	test("ready: invoice first or hand over first (pick 12), until handed over and paid (pick 13)", () => {
		const ready = approveEstimate(job(), { refused: ["discs"], channel: "phone", now: NOW });
		const r = { ...ready, status: "ready" };
		let s = state(r);
		assert.deepEqual([s.phase, s.next, s.other, s.current, s.section], ["to_invoice", "issue", "issue_and_pay", "factura", "de_incasat"]);
		assert.equal(s.money.total, 96800);
		assert.deepEqual(s.chapters.map((c) => c.state), ["done", "done", "now", "ahead"]);

		const inv = invoice();
		s = state(r, { invoices: [inv], payments: [{ invoiceId: "i1", amount: 40000, date: DAY }] });
		assert.deepEqual([s.phase, s.next, s.other], ["to_collect", "collect", "deliver"]);
		assert.deepEqual(s.money, { total: 96800, paid: 40000, due: 56800, invoiced: true });
		assert.equal(s.chapters[2].status, "partial");

		s = state(r, { invoices: [inv], payments: [{ invoiceId: "i1", amount: 96800, date: DAY }] });
		assert.deepEqual([s.phase, s.next, s.current], ["to_deliver", "deliver", "factura"]);
		assert.equal(s.chapters[2].state, "done");

		const out = { ...r, status: "delivered", dates: { ...r.dates, delivered: at(DAY, 17) } };
		s = state(out);
		assert.deepEqual([s.phase, s.next, s.onAzi], ["delivered_uninvoiced", "issue", true]);
		s = state(out, { invoices: [inv], payments: [{ invoiceId: "i1", amount: 40000, date: DAY }] });
		assert.deepEqual([s.phase, s.next, s.other], ["delivered_unpaid", "collect", "remind"]);
		s = state(out, { invoices: [{ ...inv, dueDate: "2026-11-01" }], payments: [] });
		assert.deepEqual([s.phase, s.other], ["overdue", "remind"]);
	});

	test("closed: Cere recenzie for 3 days (pick 29), then off Azi; asked: closed at once", () => {
		const out = { ...job({ status: "delivered", dates: { delivered: at(DAY, 17) } }), approval: { at: NOW, channel: "phone", lines: {} } };
		const paid = { invoices: [invoice()], payments: [{ invoiceId: "i1", amount: 96800, date: DAY }] };
		let s = state(out, paid);
		assert.deepEqual([s.phase, s.next, s.other, s.current, s.section], ["review", "ask_review", "note_customer", "recenzie", "de_incasat"]);
		assert.equal(s.closedOn, DAY);
		s = lucrareState({ order: out, ...paid, today: "2026-11-12", settings });
		assert.deepEqual([s.phase, s.onAzi, s.current], ["closed", false, null]);
		s = state(out, { ...paid, review: { requests: [{ at: NOW, channel: "whatsapp" }] } });
		assert.equal(s.phase, "closed");
		assert.equal(s.chapters[3].state, "done");
	});

	test("the closing day is the later of handover and the last payment", () => {
		const out = job({ status: "delivered", dates: { delivered: at("2026-11-01", 17) } });
		const s = lucrareState({ order: out, invoices: [invoice({ dueDate: "2026-11-30" })], payments: [{ invoiceId: "i1", amount: 999999, date: "2026-11-07" }], today: DAY, settings });
		assert.equal(s.closedOn, "2026-11-07");
		assert.equal(s.phase, "review");
	});

	test("refused and cancelled leave Azi; a refused deviz with an unpaid diagnosis fee stays in De încasat", () => {
		let s = state(job({ status: "declined" }));
		assert.deepEqual([s.phase, s.onAzi, s.other, s.current], ["refused", false, "reactivate", "deviz"]);
		assert.deepEqual(s.chapters.map((c) => c.state), ["off", "off", "off", "off"]);
		s = state(job({ status: "declined" }), { invoices: [invoice({ totals: { gross: 12100 }, dueDate: "2026-11-20" })] });
		assert.deepEqual([s.phase, s.section], ["delivered_unpaid", "de_incasat"]);
		assert.equal(s.chapters[2].state, "now");
		s = state(job({ status: "cancelled" }));
		assert.deepEqual([s.phase, s.next, s.onAzi], ["cancelled", "reactivate", false]);
	});

	test("a warranty at 0 lei closes when handed over; it needs no invoice", () => {
		const free = job({ kind: "warranty", warrantyOf: "j0", status: "delivered", lines: [line("check", 0)], dates: { delivered: at(DAY, 9) } });
		const s = state(free);
		assert.equal(s.phase, "review");
		assert.equal(s.chapters[2].status, "nothing");
		assert.equal(state(job({ kind: "warranty", status: "ready", lines: [] })).phase, "to_deliver");
	});

	test("a Vânzare has only the Factură chapter and no handover (pick 7)", () => {
		const sale = job({ kind: "sale", vehicleId: null, status: "ready" });
		assert.deepEqual(chaptersOf(sale), ["factura"]);
		let s = state(sale);
		assert.deepEqual([s.phase, s.current, s.chapters.length], ["to_invoice", "factura", 1]);
		assert.equal(state({ ...sale, lines: [] }).next, "add_lines");
		s = state(sale, { invoices: [invoice()], payments: [] });
		assert.deepEqual([s.phase, s.other], ["delivered_unpaid", "remind"]);
		s = state(sale, { invoices: [invoice()], payments: [{ invoiceId: "i1", amount: 96800, date: DAY }] });
		assert.equal(s.phase, "closed");
	});

	test("storno and re-issue: the chapter lists both; only the live one counts", () => {
		const r = job({ status: "ready" });
		const old = invoice({ id: "i0", status: "cancelled", number: 410, issuedAt: at(DAY, 11) });
		const fresh = invoice({ id: "i2", number: 415, issuedAt: at(DAY, 12), workOrderId: null, workOrderIds: ["j1"] });
		const credit = invoice({ id: "s1", stornoOf: "i0", workOrderId: null, number: 411 });
		const s = state(r, { invoices: [fresh, credit, old], payments: [] });
		assert.deepEqual(s.invoices.map((i) => i.id), ["i0", "i2"]);
		assert.equal(s.invoice.id, "i2");
		assert.equal(liveInvoice([old, credit]), null);
	});
});

describe("lucrare: invoice preview and checklist (picks 4, 6, 27)", () => {
	test("invoices name their lucrări; the old single id still reads", () => {
		assert.deepEqual(invoiceOrderIds({ workOrderIds: ["a", "b"], workOrderId: "a" }), ["a", "b"]);
		assert.deepEqual(invoiceOrderIds({ workOrderId: "a" }), ["a"]);
		assert.deepEqual(invoiceOrderIds({}), []);
		assert.deepEqual(invoicesOfOrder("b", [{ id: "x", workOrderIds: ["a", "b"] }, { id: "y", workOrderId: "c" }]).map((i) => i.id), ["x"]);
	});

	test("the preview is the billable lines, the buyer (the client unless changed), due date and mentions", () => {
		const approved = approveEstimate(job(), { refused: ["discs"], channel: "phone", now: NOW });
		let p = invoicePreview(approved, { settings, today: DAY });
		assert.deepEqual(p.lines.map((l) => l.id), ["oil", "pads"]);
		assert.deepEqual([p.customerId, p.dueDate, p.notes, p.number], ["c1", DAY, "", null]);
		assert.deepEqual(p.workOrderIds, ["j1"]);
		const billed = setBilling(approved, { customerId: "fleet", dueDate: "2026-11-30", notes: "Comanda 12", status: "x" }, { now: NOW });
		assert.deepEqual(billed.billing, { customerId: "fleet", dueDate: "2026-11-30", notes: "Comanda 12" });
		p = invoicePreview(billed, { settings, today: DAY });
		assert.deepEqual([p.customerId, p.dueDate, p.notes], ["fleet", "2026-11-30", "Comanda 12"]);
	});

	test("Emite is blocked by a pending supplement, an issued invoice, or a cancelled lucrare", () => {
		const approved = approveEstimate(job(), { channel: "phone", now: NOW });
		const customer = { type: "person", name: "Ion" };
		assert.deepEqual(issueChecklistFor({ ...approved, status: "ready" }, { customer, settings, today: DAY }), []);
		const extra = { ...approved, status: "ready", lines: [...approved.lines, line("bulb", 3719)] };
		assert.deepEqual(issueChecklistFor(extra, { customer, settings, today: DAY }).map((i) => i.code), ["supplement"]);
		assert.deepEqual(issueChecklistFor({ ...approved, status: "ready" }, { customer, settings, today: DAY, invoices: [invoice()] }).map((i) => i.code), ["invoiced"]);
		assert.deepEqual(issueChecklistFor({ ...approved, status: "cancelled" }, { customer: null, settings, today: DAY }).map((i) => i.code), ["cancelled", "customer"]);
	});

	test("a line whose VAT differs from the shop's current rate is pointed out, not changed", () => {
		const old = job({ lines: [line("a", 100, { vatRate: 19 }), line("b", 100), line("c", 100, { refused: true, vatRate: 19 })] });
		assert.deepEqual(vatMismatch(old, settings), ["a"]);
		assert.equal(invoicePreview(old, { settings, today: DAY }).lines[0].vatRate, 19);
		assert.deepEqual(vatMismatch(old, { invoicing: { ...settings.invoicing, vatPayer: false } }), []);
	});
});

describe("lucrare: stock, arrival, reopening, warranty", () => {
	test("stock leaves at the first of handover or issue, once; a storno before handover puts it back (pick 28)", () => {
		const open = job({ status: "ready" });
		assert.equal(stockAction("issue", open), "take");
		assert.equal(stockAction("deliver", open), "take");
		const taken = { ...open, stockTakenAt: NOW };
		assert.equal(stockAction("issue", taken), null);
		assert.equal(stockAction("deliver", taken), null);
		assert.equal(stockAction("storno", taken), "return");
		assert.equal(stockAction("storno", { ...taken, status: "delivered" }), null);
		assert.equal(stockAction("storno", open), null);
		assert.equal(stockAction("cancel", taken), "return");
	});

	test("check-in finds the lucrare: create, receive, return or open (picks 1, 9)", () => {
		assert.deepEqual(checkInPlan({}), { mode: "create" });
		assert.deepEqual(checkInPlan({ order: job({ receivedAt: null }) }), { mode: "receive", orderId: "j1" });
		assert.deepEqual(checkInPlan({ order: job({ status: "declined", receivedAt: null }) }), { mode: "receive", orderId: "j1", reactivate: true });
		assert.deepEqual(checkInPlan({ order: job({ status: "in_progress" }) }), { mode: "open", orderId: "j1" });
		assert.deepEqual(checkInPlan({ appointment: { returnOf: "j1" }, order: job({ status: "waiting_parts" }) }), { mode: "return", orderId: "j1" });
		assert.deepEqual(checkInPlan({ order: job({ status: "delivered" }) }), { mode: "create" });
		assert.deepEqual(checkInPlan({ order: job({ status: "cancelled" }) }), { mode: "create" });
	});

	test("receiving the car fills km, fuel and complaint once; older lucrări count as received", () => {
		const early = job({ receivedAt: null, complaint: "Zgomot la frânare" });
		assert.equal(state(early).received, false);
		const here = receiveCar(early, { mileage: 148200, fuelLevel: "1/2", complaint: "  ", now: NOW });
		assert.deepEqual([here.receivedAt, here.mileage, here.fuelLevel, here.complaint], [NOW, 148200, "1/2", "Zgomot la frânare"]);
		assert.equal(here.activity.at(-1).type, "received");
		assert.throws(() => receiveCar(here, { now: NOW }), /deja primită/);
		assert.equal(state(job()).received, true);
	});

	test("reopen only the same day and without a live invoice; otherwise a warranty lucrare (pick 10)", () => {
		const out = job({ status: "delivered", dates: { delivered: at(DAY, 9) } });
		assert.equal(reopenProblem(out, { today: DAY }), null);
		assert.match(reopenProblem(out, { today: "2026-11-09" }), /garanție/);
		assert.match(reopenProblem(out, { today: DAY, live: invoice() }), /stornează/);
		assert.match(reopenProblem(job({ status: "ready" }), { today: DAY }), /predate/);
		assert.deepEqual(warrantyFields(job()), { kind: "warranty", warrantyOf: "j1", customerId: "c1", vehicleId: "v1", complaint: "Garanție la lucrarea #1857" });
	});
});
