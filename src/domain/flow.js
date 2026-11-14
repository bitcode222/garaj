import { dayOfInstant, diffDaysISO } from "./dates.js";
import { invoiceState, issueProblems, sumPayments } from "./invoice.js";
import { OPEN_STATUSES, canTransition, skippedStages } from "./work-order.js";

// Where a record of a visit is in its flow, and what can be done with it
// (docs/VISIT-FLOW.md, D7 and D8): its steps, the step it is on, the one move
// the screen offers first, and every other move that makes sense now. A move
// that makes sense but cannot be made yet comes with the sentence that says why
// (`reason`), so the screen never just greys a button out. The screens only
// draw what these functions say; the words for the moves are the UI's.
//
// A move: { id, kind, to?, allowed, reason?, confirm?, skipped? }
//   kind  next · back · skip · pause · resume · end · reopen · reactivate · action
//   to    the status it leads to, when it changes the status
//   confirm  asks once before it is made (the screen words the question)

const move = (id, kind, fields = {}) => ({ id, kind, allowed: true, reason: null, confirm: false, ...fields });
const blocked = (reason) => ({ allowed: false, reason });

// ── programare ──────────────────────────────────────────────────────────────

export const APPOINTMENT_STEPS = ["scheduled", "confirmed", "arrived", "done"];

/**
 * A booking's flow. `now` is an ISO instant; `order` the job it became, if any.
 * `over` is true when its time has passed and nothing was recorded: the screen asks
 * "a venit clientul?" instead of offering the next step.
 */
export function appointmentFlow(appointment, { now, order = null }) {
	const { status } = appointment;
	const ahead = status === "scheduled" || status === "confirmed";
	const off = status === "no_show" || status === "cancelled";
	const over = ahead && appointment.end < now;
	const started = appointment.start <= now;
	const today = dayOfInstant(appointment.start) === dayOfInstant(now);
	const moves = [];

	if (ahead) {
		if (status === "scheduled") moves.push(move("confirm", "next", { to: "confirmed" }));
		if (status === "confirmed") moves.push(move("unconfirm", "back", { to: "scheduled" }));
		// Check-in starts the job; from "programat" it skips the confirmation.
		moves.push(move("checkin", status === "confirmed" ? "next" : "skip", { to: "arrived", ...(order ? blocked("Lucrarea a fost deja începută.") : null) }));
		moves.push(move("reschedule", "action"));
		if (!over) moves.push(move("delay", "action", today ? null : blocked("Întârzierea se anunță în ziua programării.")));
		moves.push(move("no_show", "end", { to: "no_show", confirm: true, ...(started ? null : blocked("Programarea nu a început încă: anuleaz-o în loc.")) }));
		moves.push(move("cancel", "end", { to: "cancelled", confirm: true }));
	} else if (off) {
		moves.push(move("reschedule", "next"));
		moves.push(move("restore", "back", { to: "scheduled", ...(appointment.start > now ? null : blocked("Ora programării a trecut: reprogramează.")) }));
	} else if (status === "arrived") {
		moves.push(move("reschedule", "action", blocked("Mașina e deja în service.")));
	}

	const next = over ? null : (moves.find((m) => m.kind === "next" && m.allowed) ?? null);
	return { steps: APPOINTMENT_STEPS, current: APPOINTMENT_STEPS.indexOf(status), off: off ? status : null, over, next, moves };
}

/** The warnings a booking's Acum card stands for: their sentence is its sentence, their fixes its buttons. */
export const NOW_KINDS = ["missed", "late", "unconfirmed"];

/**
 * What a booking's Acum card says and offers (docs/APPOINTMENT-SHEET.md §3.3): the situation, the
 * warning it stands for (so it is not shown twice), the one primary button, the other buttons and the
 * quiet links, all as fixes ({ id, ...params }, docs/WARNINGS.md), so one place words and runs them.
 * `warnings` are bookingWarnings' for the same moment; `phone`: the customer has one.
 *   key  confirm · waiting · today · late · missed · inShop · done · off
 */
export function bookingNow(appointment, { now, order = null, warnings = [], phone = false }) {
	const flow = appointmentFlow(appointment, { now, order });
	const warning = (kind) => warnings.find((w) => w.kind === kind) ?? null;
	const result = (key, { from = null, primary = null, others = [], quiet = [] } = {}) => ({ key, warning: from, primary, others, quiet });
	const call = phone ? [{ id: "call" }] : [];

	if (flow.off) {
		const restore = flow.moves.find((m) => m.id === "restore");
		return result("off", { primary: { id: "reschedule" }, others: restore?.allowed ? [{ id: "restore" }] : [] });
	}
	if (appointment.status === "done") return result("done");
	if (appointment.status === "arrived" || order) return result("inShop");

	const missed = warning("missed");
	if (missed) return result("missed", { from: missed, primary: { id: "checkin" }, others: missed.fixes.filter((f) => f.id !== "checkin") });
	const late = warning("late");
	// Neprezentat is the sheet's last section, with Anulează: never next to "A sosit".
	if (late) return result("late", { from: late, primary: { id: "checkin" }, others: late.fixes.filter((f) => f.id !== "checkin" && f.id !== "no_show") });

	// Its time has begun (within the grace minutes): the car is expected any moment.
	if (appointment.start <= now) return result("today", { primary: { id: "checkin" }, others: call });
	if (appointment.status === "scheduled") {
		const unconfirmed = warning("unconfirmed");
		const fixes = unconfirmed ? unconfirmed.fixes : [{ id: "confirm" }, ...(phone ? [{ id: "remind" }, { id: "call" }] : [])];
		return result("confirm", { from: unconfirmed, primary: fixes[0], others: fixes.slice(1), quiet: [{ id: "checkin" }] });
	}
	if (dayOfInstant(appointment.start) === dayOfInstant(now)) return result("today", { primary: { id: "checkin" }, others: call, quiet: [{ id: "unconfirm" }] });
	// Confirmed for another day: nothing to do but wait; the car may still come early.
	return result("waiting", { quiet: [{ id: "unconfirm" }, { id: "checkin" }] });
}

// ── lucrare ─────────────────────────────────────────────────────────────────

export const JOB_STEPS = ["estimate", "approved", "in_progress", "ready", "delivered"];

/**
 * A job's flow. `invoice` is its invoice, if any. Every step of the stepper is a move:
 * back to an earlier one, the next one, or a jump past the next one (skip, which names
 * the steps it passes over). "Waiting for parts" is a pause on "in progress".
 */
export function jobFlow(order, { invoice = null } = {}) {
	const { status } = order;
	const paused = status === "waiting_parts";
	const current = JOB_STEPS.indexOf(paused ? "in_progress" : status);
	const open = OPEN_STATUSES.includes(status);
	const invoiced = Boolean(invoice && invoice.status === "issued" && !invoice.stornoOf);
	const moves = [];

	if (open) {
		JOB_STEPS.forEach((step, index) => {
			if (index === current) return;
			if (index < current) {
				moves.push(move(`to:${step}`, "back", { to: step }));
				return;
			}
			const skipped = skippedStages(status, step);
			const fields = { to: step, ...(skipped.length ? { skipped, confirm: true } : null) };
			// Handing over a car without an issued invoice is allowed (fleets billed monthly), after asking.
			if (step === "delivered" && !invoiced) fields.confirm = true;
			// While waiting for parts the way on is "parts arrived" (below); every later step is a jump.
			moves.push(move(`to:${step}`, index === current + 1 && !paused ? "next" : "skip", fields));
		});
		if (status === "in_progress") moves.push(move("pause", "pause", { to: "waiting_parts" }));
		// Parts arriving is the way on from a pause; it comes first.
		if (paused) moves.unshift(move("resume", "next", { to: "in_progress" }));
		moves.push(
			move("cancel", "end", {
				to: "cancelled",
				confirm: true,
				...(canTransition(status, "cancelled") ? null : blocked("Mașina e gata: predă-o sau întoarce-o în lucru.")),
			}),
		);
	} else if (status === "delivered") {
		moves.push(move("reopen", "reopen", { to: "ready", confirm: true }));
	} else if (status === "cancelled") {
		moves.push(move("reactivate", "reactivate", { to: "estimate" }));
	}

	// From a pause the next move is "parts arrived", not the step after.
	const next = paused ? moves[0] : (moves.find((m) => m.kind === "next") ?? (status === "cancelled" ? moves[0] : null));
	return { steps: JOB_STEPS, current, paused, off: status === "cancelled" ? "cancelled" : null, invoiced, next, moves };
}

/** Steps a job passed over (moved past without a date of their own): drawn hatched, "sărit". */
export function skippedSteps(order) {
	const current = JOB_STEPS.indexOf(order.status === "waiting_parts" ? "in_progress" : order.status);
	return JOB_STEPS.filter((step, index) => index < current && !order.dates?.[step]);
}

// ── factură ─────────────────────────────────────────────────────────────────

export const INVOICE_STEPS = ["draft", "issued", "paid"];

/**
 * An invoice's flow. `payments` are its payments, `today` a "YYYY-MM-DD", `customer` its
 * customer (what blocks issuing). `paid`, `total` and `balance` are in bani; `overdueDays`
 * counts from the due date.
 */
export function invoiceFlow(invoice, { payments = [], today, customer = null }) {
	const state = invoiceState(invoice, payments, today);
	const moves = [];
	const facts = { state, problems: [], paid: 0, total: invoice.totals?.gross ?? 0, balance: 0, overdueDays: 0 };

	if (state === "draft") {
		const problems = issueProblems(invoice, { customer });
		const ready = problems.length ? blocked(problems[0]) : null;
		moves.push(move("issue", "next", { to: "issued", confirm: true, ...ready }));
		moves.push(move("issue_and_pay", "skip", { to: "paid", confirm: true, ...ready }));
		moves.push(move("delete", "end", { confirm: true }));
		return { steps: INVOICE_STEPS, current: 0, off: null, next: moves[0], moves, ...facts, problems };
	}

	if (state === "cancelled" || state === "storno") {
		// The cancelled original can be made again as a new draft; the credit note itself has nothing left to do.
		if (state === "cancelled") moves.push(move("redo", "next"));
		return { steps: INVOICE_STEPS, current: -1, off: state, next: moves[0] ?? null, moves, ...facts };
	}

	const paid = sumPayments(payments);
	const balance = Math.max(0, facts.total - paid);
	const overdueDays = state === "overdue" && invoice.dueDate ? Math.max(0, diffDaysISO(invoice.dueDate, today)) : 0;
	if (balance > 0) moves.push(move("pay", "next", { to: "paid" }));
	if (state === "overdue") moves.push(move("remind", "action"));
	moves.push(move("storno", "end", { confirm: true }));
	moves.push(move("storno_and_redo", "end", { confirm: true }));
	return { steps: INVOICE_STEPS, current: state === "paid" ? 2 : 1, off: null, next: moves.find((m) => m.kind === "next") ?? null, moves, ...facts, paid, balance, overdueDays };
}

// ── the visit bar ───────────────────────────────────────────────────────────

/** The records of a visit, in order: the sections of the bar every record's sheet opens with (docs/VISIT-BAR.md). */
export const VISIT_SECTIONS = ["appointment", "estimate", "job", "invoice", "review"];
const ESTIMATE_STEPS = ["estimate", "approved"];
const WORK_STEPS = ["in_progress", "ready", "delivered"];
/** A review's steps (reviewState): not asked, asked, answered. */
export const REVIEW_STEPS = ["none", "requested", "received"];

// One arc per step: done · now · ahead · skipped (passed over without a date of its own) · off (cancelled, no-show).
const arcs = (steps, current, { complete = false, skipped = [] } = {}) =>
	steps.map((step, index) => (skipped.includes(step) ? "skipped" : complete || index < current ? "done" : index === current ? "now" : "ahead"));
const offArcs = (steps) => steps.map(() => "off");

const walk = { kind: "walk", allowed: true };
const here = { kind: "here", allowed: true };
const create = (action, fields = {}) => ({ kind: "create", action, allowed: true, ...fields });
const cannot = (reason, fix = null) => ({ kind: "create", action: null, allowed: false, reason, fix });
const none = (reason) => ({ kind: "none", allowed: false, reason });

/** Why a booking cannot start a job any more, and its fix; null when it can. */
function bookingBlock(appointment) {
	if (appointment.status === "cancelled") return cannot("Programarea e anulată.", "reschedule");
	if (appointment.status === "no_show") return cannot("Clientul nu s-a prezentat.", "reschedule");
	if (appointment.status === "done") return none("Vizita s-a încheiat.");
	return null;
}

/**
 * The visit bar: for each record of a visit, whether it exists, its ring's arcs, whether it is the record open
 * (`from`: "appointment" · "work-order" · "invoice" · "review"), and what a tap on it does. A tap walks to a record
 * that exists; creates one that does not, with what exists today (`action`: checkin, start, invoice, review;
 * `status` for a check-in); or says why it cannot be made yet (`reason`) with its fix (`fix`: reschedule,
 * reactivate, lines, checkin). `here`: the same work order seen at its other stage. `payments` are the invoice's.
 *   { sections: [{ key, exists, current, record, id, arcs, off, paused, tap }], current }
 */
export function visitBar({ appointment = null, order = null, invoice = null, review = null, payments = [], today, from }) {
	const started = Boolean(order && (order.status === "cancelled" ? order.dates?.in_progress : !ESTIMATE_STEPS.includes(order.status)));
	const currentKey = from === "work-order" ? (started ? "job" : "estimate") : from;
	const stage = order ? JOB_STEPS.indexOf(order.status === "waiting_parts" ? "in_progress" : order.status) : -1;
	const skipped = order && order.status !== "cancelled" ? skippedSteps(order) : [];
	const block = appointment ? bookingBlock(appointment) : null;
	// What starts a job from the booking: check-in, opening it at `status`.
	const checkin = (status) => (appointment ? (block ?? create("checkin", { status })) : none("Fără lucrare."));
	const startFirst = (reason) => (appointment && !block ? cannot(reason, "checkin") : none(reason));

	const appointmentSection = appointment
		? {
				record: "appointment",
				id: appointment.id,
				exists: true,
				off: appointment.status === "cancelled" || appointment.status === "no_show",
				arcs:
					appointment.status === "cancelled" || appointment.status === "no_show"
						? offArcs(APPOINTMENT_STEPS)
						: arcs(APPOINTMENT_STEPS, APPOINTMENT_STEPS.indexOf(appointment.status), { complete: appointment.status === "done" }),
				tap: walk,
			}
		: { record: null, exists: false, arcs: APPOINTMENT_STEPS.map(() => "ahead"), tap: none("Fără programare.") };

	let estimate;
	let job;
	if (order) {
		const cancelled = order.status === "cancelled";
		estimate = {
			record: "work-order",
			id: order.id,
			exists: true,
			off: cancelled && !started,
			arcs: cancelled && !started ? offArcs(ESTIMATE_STEPS) : started ? arcs(ESTIMATE_STEPS, ESTIMATE_STEPS.length, { skipped }) : arcs(ESTIMATE_STEPS, stage),
			tap: started ? here : walk,
		};
		if (started) {
			job = {
				record: "work-order",
				id: order.id,
				exists: true,
				off: cancelled,
				paused: order.status === "waiting_parts",
				arcs: cancelled ? offArcs(WORK_STEPS) : arcs(WORK_STEPS, stage - ESTIMATE_STEPS.length, { complete: order.status === "delivered" }),
				tap: walk,
			};
		} else {
			// Starting the work is the stepper's move; from a Deviz not approved it passes over "Aprobat" (asked once).
			job = { record: null, exists: false, arcs: WORK_STEPS.map(() => "ahead"), tap: cancelled ? cannot("Devizul e anulat.", "reactivate") : create("start", { skips: order.status === "estimate" }) };
		}
	} else {
		estimate = { record: null, exists: false, arcs: ESTIMATE_STEPS.map(() => "ahead"), tap: checkin("estimate") };
		job = { record: null, exists: false, arcs: WORK_STEPS.map(() => "ahead"), tap: checkin("in_progress") };
	}

	let invoiceSection;
	if (invoice) {
		const state = invoiceState(invoice, payments, today);
		const off = state === "cancelled" || state === "storno";
		const index = { draft: 0, issued: 1, overdue: 1, partial: 2, paid: 2 }[state] ?? 0;
		invoiceSection = { record: "invoice", id: invoice.id, exists: true, off, arcs: off ? offArcs(INVOICE_STEPS) : arcs(INVOICE_STEPS, index, { complete: state === "paid" }), tap: walk };
	} else {
		let tap;
		if (!order) tap = startFirst("Începe întâi lucrarea.");
		else if (order.status === "cancelled") tap = cannot("Lucrarea e anulată.", "reactivate");
		else if (!order.lines?.length) tap = cannot("Adaugă o operațiune ca să facturezi.", "lines");
		else tap = create("invoice");
		invoiceSection = { record: null, exists: false, arcs: INVOICE_STEPS.map(() => "ahead"), tap };
	}

	let reviewSection;
	if (review || (from === "review" && order)) {
		const state = review ? (review.receivedAt ? "received" : review.requests?.length ? "requested" : "none") : "none";
		reviewSection = { record: "review", id: order?.id ?? review.workOrderId, exists: Boolean(review), off: false, arcs: arcs(REVIEW_STEPS, REVIEW_STEPS.indexOf(state), { complete: state === "received" }), tap: walk };
	} else {
		// The review sheet opens empty and is saved on its first change.
		reviewSection = { record: null, exists: false, arcs: REVIEW_STEPS.map(() => "ahead"), tap: order ? create("review") : startFirst("Recenzia se cere după lucrare.") };
	}

	const byKey = { appointment: appointmentSection, estimate, job, invoice: invoiceSection, review: reviewSection };
	const sections = VISIT_SECTIONS.map((key) => {
		const section = { key, off: false, paused: false, ...byKey[key] };
		const current = key === currentKey;
		// The record open is where you are: a tap on it does nothing.
		return { ...section, current, tap: current ? { kind: "none", allowed: false, reason: null } : section.tap };
	});
	return { sections, current: VISIT_SECTIONS.indexOf(currentKey) };
}
