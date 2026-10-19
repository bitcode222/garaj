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
