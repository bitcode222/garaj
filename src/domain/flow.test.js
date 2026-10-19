import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { announceDelay, callOffAppointment, delayOverruns, numberAppointments, rescheduleAppointment, setAppointmentStatus, statusBeforeCheckIn } from "./appointment.js";
import { appointmentFlow, invoiceFlow, jobFlow, skippedSteps } from "./flow.js";
import { arrivalDelay, buildVisits, visitTiming } from "./visit.js";
import { canTransition, draftBehindOrder, skippedStages, transition } from "./work-order.js";
import { issueChecklist } from "./invoice.js";
import { dropLastRequest, latestNoteOn, logRequest, markReceived, newReview, noteCustomer, reviewMessage, reviewState } from "./review.js";

// Local-time instants, so the tests do not depend on the machine's time zone.
const at = (day, hour, minute = 0) => new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`).toISOString();
const DAY = "2026-10-16";
const booking = (fields = {}) => ({ id: "a1", status: "scheduled", start: at(DAY, 14), end: at(DAY, 15), activity: [], ...fields });
const ids = (flow) => flow.moves.map((m) => m.id);
const find = (flow, id) => flow.moves.find((m) => m.id === id);

describe("booking flow", () => {
	test("booked and ahead: confirm first; check-in skips the confirmation; no-show waits for its time", () => {
		const flow = appointmentFlow(booking(), { now: at(DAY, 11) });
		assert.equal(flow.next.id, "confirm");
		assert.equal(flow.current, 0);
		assert.deepEqual(ids(flow), ["confirm", "checkin", "reschedule", "delay", "no_show", "cancel"]);
		assert.equal(find(flow, "checkin").kind, "skip");
		assert.equal(find(flow, "no_show").allowed, false);
		assert.match(find(flow, "no_show").reason, /nu a început/);
		assert.equal(find(flow, "cancel").confirm, true);
	});

	test("confirmed: check-in is the next step; a booking on another day cannot announce a delay", () => {
		const flow = appointmentFlow(booking({ status: "confirmed", start: at("2026-10-17", 9), end: at("2026-10-17", 10) }), { now: at(DAY, 11) });
		assert.equal(flow.next.id, "checkin");
		assert.ok(ids(flow).includes("unconfirm"));
		assert.equal(find(flow, "delay").allowed, false);
	});

	test("its job already exists: check-in is refused with the reason", () => {
		const flow = appointmentFlow(booking({ status: "confirmed" }), { now: at(DAY, 11), order: { id: "j1" } });
		assert.equal(find(flow, "checkin").allowed, false);
		assert.equal(flow.next, null);
	});

	test("its time has passed and nothing happened: no next step, the screen asks; no delay to announce", () => {
		const flow = appointmentFlow(booking(), { now: at(DAY, 16) });
		assert.equal(flow.over, true);
		assert.equal(flow.next, null);
		assert.ok(!ids(flow).includes("delay"));
		assert.equal(find(flow, "no_show").allowed, true);
	});

	test("called off: reschedule is the way back; restoring the same time only while it is ahead", () => {
		const ahead = appointmentFlow(booking({ status: "cancelled" }), { now: at(DAY, 11) });
		assert.equal(ahead.off, "cancelled");
		assert.equal(ahead.next.id, "reschedule");
		assert.equal(find(ahead, "restore").allowed, true);
		const passed = appointmentFlow(booking({ status: "no_show" }), { now: at(DAY, 16) });
		assert.equal(find(passed, "restore").allowed, false);
	});

	test("in the shop it cannot be rescheduled; once done there is nothing to do", () => {
		const arrived = appointmentFlow(booking({ status: "arrived" }), { now: at(DAY, 14, 30) });
		assert.equal(find(arrived, "reschedule").allowed, false);
		assert.equal(arrived.next, null);
		assert.deepEqual(appointmentFlow(booking({ status: "done" }), { now: at(DAY, 18) }).moves, []);
	});
});

describe("booking changes", () => {
	test("every status change is in the history; restoring forgets the cancellation reason", () => {
		const confirmed = setAppointmentStatus(booking(), "confirmed", { now: "t1" });
		assert.deepEqual(confirmed.activity.at(-1), { at: "t1", type: "status", from: "scheduled", to: "confirmed" });
		const cancelled = callOffAppointment(confirmed, { to: "cancelled", reason: "client", note: " sună mâine ", now: "t2" });
		assert.equal(cancelled.status, "cancelled");
		assert.deepEqual(cancelled.cancelReason, { code: "client", note: "sună mâine" });
		assert.equal(cancelled.activity.length, 2);
		assert.deepEqual(setAppointmentStatus(cancelled, "scheduled", { now: "t3" }).cancelReason, null);
	});

	test("a no-show before the booking's time is refused (that is a cancellation)", () => {
		assert.throws(() => callOffAppointment(booking(), { to: "no_show", now: at(DAY, 11) }), /anuleaz/);
		assert.equal(callOffAppointment(booking(), { to: "no_show", now: at(DAY, 16) }).status, "no_show");
	});

	test("rescheduling: a confirmed booking stays confirmed only when the customer knows", () => {
		const confirmed = booking({ status: "confirmed", expectedAt: at(DAY, 14, 30) });
		const moved = { start: at("2026-10-17", 9), end: at("2026-10-17", 10) };
		const known = rescheduleAppointment(confirmed, { ...moved, customerKnows: true, now: "t" });
		assert.equal(known.status, "confirmed");
		assert.equal(known.expectedAt, null);
		assert.deepEqual(known.activity.at(-1), { at: "t", type: "rescheduled", from: { start: confirmed.start, end: confirmed.end }, to: moved, customerKnows: true });
		assert.equal(rescheduleAppointment(confirmed, { ...moved, now: "t" }).status, "scheduled");
		assert.equal(rescheduleAppointment(booking({ status: "cancelled" }), { ...moved, now: "t" }).status, "scheduled");
		assert.throws(() => rescheduleAppointment(booking({ status: "arrived" }), moved), /în service/);
		assert.throws(() => rescheduleAppointment(booking(), { start: moved.end, end: moved.start }), /după/);
	});

	test("an announced delay keeps the slot; it must be later than the booking; it can overrun the slot", () => {
		const late = announceDelay(booking(), { expectedAt: at(DAY, 14, 30), now: "t" });
		assert.equal(late.start, booking().start);
		assert.equal(late.expectedAt, at(DAY, 14, 30));
		assert.equal(delayOverruns(late), false);
		assert.equal(delayOverruns(announceDelay(booking(), { expectedAt: at(DAY, 15), now: "t" })), true);
		assert.throws(() => announceDelay(booking(), { expectedAt: at(DAY, 13) }), /după/);
		assert.throws(() => announceDelay(booking({ status: "arrived" }), { expectedAt: at(DAY, 15) }), /nu a sosit/);
	});

	test("a deleted job puts its booking back the way it was before check-in", () => {
		assert.equal(statusBeforeCheckIn(booking({ activity: [{ type: "checked_in", from: "scheduled" }] })), "scheduled");
		assert.equal(statusBeforeCheckIn(booking({ activity: [{ type: "checked_in", from: "confirmed" }] })), "confirmed");
		assert.equal(statusBeforeCheckIn(booking({ activity: [] })), "confirmed");
	});

	test("bookings saved before numbering get numbers, oldest first, after the highest one given", () => {
		const list = [
			{ id: "c", createdAt: "2026-10-03" },
			{ id: "a", createdAt: "2026-10-01" },
			{ id: "n", number: 7, createdAt: "2026-10-05" },
			{ id: "b", createdAt: "2026-10-02" },
		];
		const { numbered, next } = numberAppointments(list);
		assert.deepEqual(numbered.map((a) => [a.id, a.number]), [["a", 8], ["b", 9], ["c", 10]]);
		assert.equal(next, 11);
		assert.deepEqual(numberAppointments([], 5), { numbered: [], next: 5 });
	});
});

describe("announced delay on the calendar", () => {
	const appointments = { a1: booking({ status: "confirmed", expectedAt: at(DAY, 14, 40) }) };
	const visit = buildVisits(appointments, {}).byId.get("a1");

	test("before the announced time it says when the car comes, and nobody calls it late", () => {
		assert.deepEqual(visitTiming(visit, at(DAY, 14, 20)), { kind: "expected", minutes: 20, days: 0, at: at(DAY, 14, 40) });
		assert.equal(arrivalDelay(appointments.a1, at(DAY, 14, 50)), 0);
	});

	test("late is counted from the announced time", () => {
		assert.equal(arrivalDelay(appointments.a1, at(DAY, 15, 0)), 20);
		assert.deepEqual(visitTiming(visit, at(DAY, 15, 0)), { kind: "late", minutes: 20, days: 0 });
	});
});

describe("job flow", () => {
	const job = (status, fields = {}) => ({ status, dates: {}, activity: [], ...fields });

	test("an estimate: approve next; jumps further name what they skip and ask first", () => {
		const flow = jobFlow(job("estimate"));
		assert.equal(flow.next.to, "approved");
		assert.deepEqual(find(flow, "to:in_progress").skipped, ["approved"]);
		assert.equal(find(flow, "to:in_progress").confirm, true);
		assert.deepEqual(find(flow, "to:ready").skipped, ["approved", "in_progress"]);
		assert.equal(find(flow, "to:delivered").kind, "skip");
		assert.equal(find(flow, "cancel").allowed, true);
	});

	test("handing over without an issued invoice asks first; with one it does not", () => {
		assert.equal(find(jobFlow(job("ready")), "to:delivered").confirm, true);
		assert.equal(find(jobFlow(job("ready"), { invoice: { status: "issued" } }), "to:delivered").confirm, false);
		assert.equal(find(jobFlow(job("ready"), { invoice: { status: "draft" } }), "to:delivered").confirm, true);
	});

	test("a ready car can go back, but is not cancelled", () => {
		const flow = jobFlow(job("ready"));
		assert.deepEqual(flow.moves.filter((m) => m.kind === "back").map((m) => m.to), ["estimate", "approved", "in_progress"]);
		assert.equal(find(flow, "cancel").allowed, false);
		assert.match(find(flow, "cancel").reason, /predă/);
	});

	test("waiting for parts: the next step is 'parts arrived'; later steps are jumps", () => {
		const flow = jobFlow(job("waiting_parts"));
		assert.equal(flow.paused, true);
		assert.equal(flow.current, 2);
		assert.equal(flow.next.id, "resume");
		assert.equal(find(flow, "to:ready").kind, "skip");
		assert.equal(flow.moves.filter((m) => m.kind === "next").length, 1);
		assert.ok(ids(jobFlow(job("in_progress"))).includes("pause"));
	});

	test("delivered can be reopened; cancelled can be reactivated", () => {
		assert.deepEqual(ids(jobFlow(job("delivered"))), ["reopen"]);
		assert.equal(jobFlow(job("delivered")).next, null);
		const cancelled = jobFlow(job("cancelled"));
		assert.equal(cancelled.off, "cancelled");
		assert.equal(cancelled.next.id, "reactivate");
	});

	test("every move the flow offers is one the job can make", () => {
		for (const status of ["estimate", "approved", "in_progress", "waiting_parts", "ready", "delivered", "cancelled"]) {
			for (const m of jobFlow(job(status)).moves) if (m.to && m.allowed) assert.ok(canTransition(status, m.to), `${status} → ${m.to}`);
		}
	});

	test("steps passed over without a date of their own are the skipped ones", () => {
		assert.deepEqual(skippedSteps(job("ready", { dates: { estimate: "t", in_progress: "t", ready: "t" } })), ["approved"]);
		assert.deepEqual(skippedSteps(job("in_progress", { dates: { estimate: "t", approved: "t" } })), []);
	});
});

describe("job moves", () => {
	test("forward jumps, reopening and reactivating are allowed; history says what was skipped and why", () => {
		assert.ok(canTransition("approved", "delivered"));
		assert.ok(canTransition("delivered", "ready"));
		assert.ok(canTransition("cancelled", "estimate"));
		assert.ok(!canTransition("ready", "cancelled"));
		assert.deepEqual(skippedStages("estimate", "ready"), ["approved", "in_progress"]);
		assert.deepEqual(skippedStages("waiting_parts", "ready"), []);
		const jumped = transition({ status: "estimate", dates: {}, activity: [] }, "ready", { now: "t" });
		assert.deepEqual(jumped.activity.at(-1), { at: "t", type: "status", from: "estimate", to: "ready", skipped: ["approved", "in_progress"] });
		const reopened = transition({ status: "delivered", dates: {}, activity: [] }, "ready", { now: "t", reason: " a revenit " });
		assert.equal(reopened.activity.at(-1).reason, "a revenit");
	});
});

describe("invoice flow", () => {
	const lines = [{ kind: "labor", description: "Revizie", qty: 1, unit: "h", unitPrice: 20000, discountPct: 0, vatRate: 21 }];
	const customer = { id: "c1", type: "person", name: "Ion" };

	test("a draft: issuing is the next step, blocked with the first problem until it is solved", () => {
		const blockedFlow = invoiceFlow({ status: "draft", lines: [], issueDate: DAY }, { today: DAY, customer });
		assert.equal(blockedFlow.next.id, "issue");
		assert.equal(blockedFlow.next.allowed, false);
		assert.match(blockedFlow.next.reason, /linie/);
		assert.equal(find(blockedFlow, "issue_and_pay").allowed, false);
		const readyFlow = invoiceFlow({ status: "draft", lines, issueDate: DAY }, { today: DAY, customer });
		assert.equal(readyFlow.next.allowed, true);
		assert.equal(readyFlow.problems.length, 0);
	});

	const issued = { status: "issued", totals: { gross: 24200 }, issueDate: DAY, dueDate: "2026-10-20" };

	test("issued: record the payment; partly paid: the rest; paid: nothing left but storno", () => {
		const open = invoiceFlow(issued, { today: DAY });
		assert.equal(open.current, 1);
		assert.equal(open.next.id, "pay");
		assert.equal(open.balance, 24200);
		const partly = invoiceFlow(issued, { today: DAY, payments: [{ amount: 10000 }] });
		assert.equal(partly.state, "partial");
		assert.equal(partly.balance, 14200);
		const paid = invoiceFlow(issued, { today: DAY, payments: [{ amount: 24200 }] });
		assert.equal(paid.current, 2);
		assert.equal(paid.next, null);
		assert.deepEqual(ids(paid), ["storno", "storno_and_redo"]);
	});

	test("overdue: a reminder is offered and the days are counted from the due date", () => {
		const flow = invoiceFlow(issued, { today: "2026-10-25" });
		assert.equal(flow.state, "overdue");
		assert.equal(flow.overdueDays, 5);
		assert.ok(ids(flow).includes("remind"));
	});

	test("a cancelled invoice can be made again; a credit note has nothing left to do", () => {
		const cancelled = invoiceFlow({ ...issued, status: "cancelled" }, { today: DAY });
		assert.equal(cancelled.off, "cancelled");
		assert.equal(cancelled.next.id, "redo");
		const storno = invoiceFlow({ ...issued, stornoOf: "x" }, { today: DAY });
		assert.equal(storno.off, "storno");
		assert.deepEqual(storno.moves, []);
	});
});

describe("invoice drafts", () => {
	const settings = { invoicing: { vatPayer: true, vatRate: 21 } };
	const job = { lines: [{ id: "l1", kind: "labor", refId: null, description: "Revizie", qty: 1, unit: "h", unitPrice: 20000, discountPct: 0, vatRate: 21 }] };

	test("what blocks issuing comes with a code the screen turns into a fix", () => {
		const items = issueChecklist({ lines: [], issueDate: "2026-10-16", dueDate: "2026-10-10" }, { customer: { type: "company", name: "SRL" } });
		assert.deepEqual(items.map((item) => item.code), ["cui", "lines", "due_date"]);
		assert.deepEqual(issueChecklist({ lines: [] }, { customer: null }).map((item) => item.code), ["customer", "lines", "issue_date"]);
	});

	test("a draft falls behind its job when what would be billed changed; ids do not count", () => {
		const draft = { status: "draft", lines: [{ ...job.lines[0], id: "other" }] };
		assert.equal(draftBehindOrder(draft, job, { settings }), false);
		assert.equal(draftBehindOrder(draft, { lines: [{ ...job.lines[0], qty: 2 }] }, { settings }), true);
		assert.equal(draftBehindOrder(draft, { lines: [...job.lines, { ...job.lines[0], id: "l2", description: "Geometrie" }] }, { settings }), true);
		assert.equal(draftBehindOrder({ ...draft, status: "issued" }, { lines: [] }, { settings }), false);
		assert.equal(draftBehindOrder(draft, null, { settings }), false);
	});
});

describe("reviews", () => {
	const fresh = newReview({ id: "r1", workOrderId: "j1", customerId: "c1", now: "t0" });

	test("not asked, asked (each send logged, the last can be taken back), answered", () => {
		assert.equal(reviewState(null), "none");
		assert.equal(reviewState(fresh), "none");
		const asked = logRequest(logRequest(fresh, { channel: "whatsapp", now: "t1" }), { channel: "sms", now: "t2" });
		assert.equal(reviewState(asked), "requested");
		assert.deepEqual(asked.requests.map((r) => r.channel), ["whatsapp", "sms"]);
		assert.deepEqual(dropLastRequest(asked, { now: "t3" }).requests.map((r) => r.channel), ["whatsapp"]);
		const answered = markReceived(asked, { now: "t4" });
		assert.equal(reviewState(answered), "received");
		assert.equal(reviewState(markReceived(answered, { received: false, now: "t5" })), "requested");
		assert.throws(() => logRequest(fresh, { channel: "fax", now: "t" }), /Canal/);
		assert.throws(() => newReview({ id: "x", now: "t" }), /lucrare/);
	});

	test("the admin's note: 1 to 5 stars or none, only known tags, once each", () => {
		const noted = noteCustomer(fresh, { rating: 4, tags: ["punctual", "punctual", "nope"], note: "Plătește cash", now: "t1" });
		assert.equal(noted.rating, 4);
		assert.deepEqual(noted.tags, ["punctual"]);
		assert.equal(noteCustomer(noted, { rating: null, now: "t2" }).rating, null);
		assert.equal(noteCustomer(noted, { note: "alt text", now: "t2" }).rating, 4);
		assert.throws(() => noteCustomer(fresh, { rating: 6, now: "t" }), /1 și 5/);
		assert.throws(() => noteCustomer(fresh, { rating: 2.5, now: "t" }), /1 și 5/);
	});

	test("the latest note on a customer is the one most recently changed, with stars or text", () => {
		const reviews = {
			a: { id: "a", customerId: "c1", rating: 3, note: "", updatedAt: "2026-10-01" },
			b: { id: "b", customerId: "c1", rating: null, note: "  ", updatedAt: "2026-10-09" },
			c: { id: "c", customerId: "c1", rating: 5, note: "ok", updatedAt: "2026-10-05" },
			d: { id: "d", customerId: "c2", rating: 1, note: "", updatedAt: "2026-10-10" },
		};
		assert.equal(latestNoteOn(reviews, "c1").id, "c");
		assert.equal(latestNoteOn(reviews, "c3"), null);
	});

	test("the request message greets the customer, names the car and carries the link when there is one", () => {
		const settings = { shop: { name: "Garaj Test" }, reviews: { link: "https://g.page/r/x" } };
		const text = reviewMessage({ customer: { type: "person", name: "Ion Popescu" }, vehicle: { make: "Dacia", model: "Logan" }, settings });
		assert.match(text, /Garaj Test pentru Dacia Logan/);
		assert.match(text, /https:\/\/g\.page\/r\/x/);
		assert.doesNotMatch(reviewMessage({ customer: null, vehicle: null, settings: { shop: { name: "G" }, reviews: { link: "" } } }), /http/);
	});
});
