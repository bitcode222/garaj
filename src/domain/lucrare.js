import { addDaysISO, dayOfInstant, diffDaysISO } from "./dates.js";
import { DomainError } from "./errors.js";
import { invoiceState, issueChecklist, sumPayments } from "./invoice.js";
import { computeTotals, lineGross } from "./lines.js";
import { reviewState } from "./review.js";
import { OPEN_STATUSES, transition } from "./work-order.js";

// The lucrare as the one item after the booking (docs/LUCRARE.md). It holds four chapters:
// deviz (what the client approved), lucru (the car in the shop), factura (the money) and
// recenzie (the follow-up). Everything here is worked out from the job, its invoices, their
// payments and its review; nothing new is stored except the fields named in LUCRARE.md §4:
//
//   job:     kind ("job" | "sale" | "warranty"), warrantyOf, receivedAt (null = deviz before
//            the car came; missing = an older job, received), approval { at, channel, lines },
//            billing { customerId, dueDate, notes }, stockTakenAt, status "declined"
//   line:    need ("required" | "recommended"), refused (true when the client said no)
//   invoice: workOrderIds (the lucrări it bills; workOrderId stays readable)

export const CHAPTERS = ["deviz", "lucru", "factura", "recenzie"];
export const LINE_NEEDS = ["required", "recommended"];
export const APPROVAL_CHANNELS = ["phone", "whatsapp", "sms", "counter"];
/** Days a closed lucrare whose review was not asked stays on Azi with "Cere recenzie". */
export const REVIEW_WINDOW_DAYS = 3;

export const lucrareKind = (order) => (order.kind === "sale" || order.kind === "warranty" ? order.kind : "job");
/** A sale (Vânzare) has no car and only the Factură chapter. */
export const chaptersOf = (order) => (lucrareKind(order) === "sale" ? ["factura"] : CHAPTERS);
/** False only for a deviz made before the car came; older lucrări have no field and count as received. */
export const isReceived = (order) => order.receivedAt !== null;
export const lineNeed = (line) => (line.need === "recommended" ? "recommended" : "required");
/** The lines that go on the invoice: everything the client did not refuse. */
export const billableLines = (order) => (order.lines ?? []).filter((line) => !line.refused);

// ── Invoices of a lucrare ───────────────────────────────────────────────────

/** The lucrări an invoice bills (several later, for a fleet's monthly invoice). */
export function invoiceOrderIds(invoice) {
	if (invoice.workOrderIds?.length) return invoice.workOrderIds;
	return invoice.workOrderId ? [invoice.workOrderId] : [];
}

/** A lucrare's invoices, oldest first (a storno's original stays listed; the credit note hangs off it). */
export function invoicesOfOrder(orderId, invoices = []) {
	return invoices
		.filter((invoice) => invoiceOrderIds(invoice).includes(orderId))
		.sort((a, b) => String(a.issuedAt ?? a.createdAt ?? "").localeCompare(String(b.issuedAt ?? b.createdAt ?? "")));
}

/** The one invoice that counts: issued, not cancelled, not a credit note. Drafts never count. */
export const liveInvoice = (invoices = []) => invoices.find((invoice) => invoice.status === "issued" && !invoice.stornoOf) ?? null;

// ── The deviz keeps what was approved ───────────────────────────────────────

const BILLED = ["kind", "refId", "description", "qty", "unit", "unitPrice", "discountPct", "vatRate"];
const billedPart = (line) => Object.fromEntries(BILLED.map((field) => [field, line[field] ?? null]));
const sameBilled = (a, b) => BILLED.every((field) => String(a[field] ?? "") === String(b[field] ?? ""));

function accept(line) {
	if (!line.refused) return line;
	const copy = { ...line };
	delete copy.refused;
	return copy;
}

/**
 * What changed since the client approved: lines added, and lines changed so they cost more.
 * A line that got cheaper or was removed needs nothing. `delta` is what the client is asked
 * to approve on top, in bani with VAT (when the shop pays VAT).
 */
export function supplement(order, { vatPayer = true } = {}) {
	const approved = order.approval?.lines;
	if (!approved || !OPEN_STATUSES.includes(order.status)) return { pending: false, lines: [], delta: 0 };
	const lines = [];
	let delta = 0;
	for (const line of billableLines(order)) {
		const before = approved[line.id];
		if (!before) {
			lines.push({ id: line.id, change: "added" });
			delta += lineGross(line, vatPayer);
		} else if (!sameBilled(before, line)) {
			const more = lineGross(line, vatPayer) - lineGross(before, vatPayer);
			if (more > 0) {
				lines.push({ id: line.id, change: "raised" });
				delta += more;
			}
		}
	}
	return { pending: lines.length > 0, lines, delta };
}

function approve(order, { refused = [], channel, now }, type) {
	if (!APPROVAL_CHANNELS.includes(channel)) throw new DomainError("invalid", "Alege cum a aprobat clientul.");
	if (!OPEN_STATUSES.includes(order.status)) throw new DomainError("closed", "Lucrarea e închisă: devizul nu se mai aprobă.");
	if (!order.lines?.length) throw new DomainError("empty", "Adaugă o operațiune ca să aprobi devizul.");
	const no = new Set(refused);
	const lines = order.lines.map((line) => (no.has(line.id) ? { ...line, refused: true } : accept(line)));
	const accepted = lines.filter((line) => !line.refused);
	if (!accepted.length) throw new DomainError("empty", "Clientul n-a aprobat nicio linie: marchează devizul ca refuzat.");
	const approval = { at: now, channel, lines: Object.fromEntries(accepted.map((line) => [line.id, billedPart(line)])) };
	const note = { channel, ...(no.size ? { refused: [...no] } : null) };
	let next = { ...order, lines, approval, updatedAt: now };
	if (order.status === "estimate") {
		next = transition(next, "approved", { now });
		const activity = [...next.activity];
		activity[activity.length - 1] = { ...activity[activity.length - 1], ...note };
		return { ...next, activity };
	}
	return { ...next, activity: [...(order.activity ?? []), { at: now, type, ...note }] };
}

/**
 * The client said yes (pick 3: line by line). `refused` are the ids of the lines they said no
 * to; they stay on the lucrare, greyed, and never go on the invoice. `channel` is how they
 * said it (APPROVAL_CHANNELS). A deviz moves on to "approved"; a later approval only
 * records what was approved (see supplement).
 */
export const approveEstimate = (order, options) => approve(order, options, "approved");

/** The client approved what was added after the first yes (or refused some of it). */
export function approveSupplement(order, options) {
	if (!order.approval) throw new DomainError("invalid", "Devizul nu a fost aprobat încă.");
	return approve(order, options, "supplement_approved");
}

/** The client said no to the whole deviz (pick 14): its own end, lines kept for the next visit. */
export function declineEstimate(order, { reason = "", now }) {
	return transition(order, "declined", { now, reason });
}

/** The deviz went to the client (WhatsApp, SMS, PDF): counted for "fără răspuns de N zile". */
export function markEstimateSent(order, { channel, now }) {
	return { ...order, activity: [...(order.activity ?? []), { at: now, type: "estimate_sent", channel }], updatedAt: now };
}

const lastSent = (order) => [...(order.activity ?? [])].reverse().find((entry) => entry.type === "estimate_sent")?.at ?? null;

/** Lines the client refused on this car's earlier lucrări, newest first, one per description: suggested at its next visit. */
export function refusedSuggestions(vehicleId, orders = []) {
	const seen = new Set();
	const out = [];
	const mine = orders.filter((order) => order.vehicleId === vehicleId).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
	for (const order of mine) {
		const refused = order.status === "declined" ? (order.lines ?? []) : (order.lines ?? []).filter((line) => line.refused);
		for (const line of refused) {
			const key = String(line.description ?? "").trim().toLowerCase();
			if (!key || seen.has(key)) continue;
			seen.add(key);
			out.push({ line, orderId: order.id, number: order.number, at: order.createdAt ?? null });
		}
	}
	return out;
}

// ── The invoice the lucrare would make (pick 4: no draft) ──────────────────

/** Buyer, due date and mentions set in the Factură chapter before issuing (pick 27). */
export function setBilling(order, patch, { now }) {
	const allowed = Object.fromEntries(Object.entries(patch).filter(([key]) => ["customerId", "dueDate", "notes"].includes(key)));
	return { ...order, billing: { ...order.billing, ...allowed }, updatedAt: now };
}

/**
 * The invoice as the Factură chapter shows it before it has a number: the billable lines,
 * the buyer (the client unless changed), the due date and mentions. Issuing it
 * (issueInvoice) freezes the snapshot and takes the number.
 */
export function invoicePreview(order, { settings, today }) {
	const { series, dueDays, vatPayer, vatRate } = settings.invoicing;
	const billing = order.billing ?? {};
	return {
		status: "draft",
		series,
		number: null,
		issueDate: today,
		dueDate: billing.dueDate ?? addDaysISO(today, dueDays),
		customerId: billing.customerId ?? order.customerId ?? null,
		vehicleId: order.vehicleId ?? null,
		workOrderId: order.id,
		workOrderIds: [order.id],
		mileage: order.mileage ?? null,
		lines: billableLines(order).map((line) => ({ ...line, vatRate: vatPayer ? (line.vatRate ?? vatRate) : 0 })),
		notes: billing.notes ?? "",
		activity: [],
	};
}

/** Ids of billable lines whose VAT differs from the shop's current rate (the rate changed since the deviz). */
export function vatMismatch(order, settings) {
	const { vatPayer, vatRate } = settings.invoicing;
	if (!vatPayer) return [];
	return billableLines(order)
		.filter((line) => line.vatRate != null && Number(line.vatRate) !== Number(vatRate))
		.map((line) => line.id);
}

/** What blocks Emite on a lucrare: the invoice's own checklist, plus the lucrare's state. */
export function issueChecklistFor(order, { customer, settings, today, invoices = [] }) {
	const items = issueChecklist(invoicePreview(order, { settings, today }), { customer });
	if (order.status === "cancelled") items.unshift({ code: "cancelled", text: "Lucrarea e anulată: reactiveaz-o ca s-o facturezi." });
	if (liveInvoice(invoicesOfOrder(order.id, invoices))) items.unshift({ code: "invoiced", text: "Lucrarea are deja o factură emisă." });
	const extra = supplement(order, { vatPayer: settings.invoicing.vatPayer });
	if (extra.pending) items.push({ code: "supplement", text: "Clientul n-a aprobat încă suplimentarul: aprobă-l sau scoate liniile." });
	return items;
}

// ── Stock (pick 28: at handover or invoice, whichever is first) ─────────────

/**
 * What an event does to the stock of a lucrare's parts: "take", "return" or null.
 * Events: issue · deliver · storno · cancel · delete. `stockTakenAt` on the lucrare says
 * the parts already left. After handover they left with the car, so a storno keeps them out.
 */
export function stockAction(event, order) {
	const taken = Boolean(order.stockTakenAt);
	if (event === "issue" || event === "deliver") return taken ? null : "take";
	if (event === "storno" || event === "cancel" || event === "delete") return taken && order.status !== "delivered" ? "return" : null;
	return null;
}

// ── Arrival, returns, reopening, warranty ──────────────────────────────────

/**
 * What check-in does (pick 1, 9). `order` is the lucrare the programare points to
 * (its workOrderId or returnOf). create: a new lucrare · receive: the car arrives for a deviz
 * made before (reactivate: it had been refused) · return: a second programare of an open
 * lucrare · open: the car is already here, go to it.
 */
export function checkInPlan({ appointment = null, order = null } = {}) {
	if (!order || order.status === "delivered" || order.status === "cancelled") return { mode: "create" };
	if (order.status === "declined") return { mode: "receive", orderId: order.id, reactivate: true };
	if (!isReceived(order)) return { mode: "receive", orderId: order.id };
	if (appointment?.returnOf === order.id) return { mode: "return", orderId: order.id };
	return { mode: "open", orderId: order.id };
}

/** The car arrived for a deviz made before: km, fuel and complaint go on the same lucrare. */
export function receiveCar(order, { mileage = null, fuelLevel = null, complaint = "", now }) {
	if (isReceived(order)) throw new DomainError("received", "Mașina a fost deja primită.");
	return {
		...order,
		receivedAt: now,
		mileage: mileage ?? order.mileage ?? null,
		fuelLevel: fuelLevel ?? order.fuelLevel ?? null,
		complaint: String(complaint ?? "").trim() || (order.complaint ?? ""),
		activity: [...(order.activity ?? []), { at: now, type: "received" }],
		updatedAt: now,
	};
}

/**
 * Reopening a delivered lucrare (pick 10) is for the same day and only while it has no live
 * invoice; otherwise the answer is a warranty lucrare. Returns null when allowed, else why.
 */
export function reopenProblem(order, { live = null, today }) {
	if (order.status !== "delivered") return "Se redeschid doar lucrările predate.";
	if (live) return "Are factură emisă: stornează și refă, sau deschide o lucrare de garanție.";
	const day = order.dates?.delivered ? dayOfInstant(order.dates.delivered) : null;
	if (day !== today) return "A fost predată în altă zi: deschide o lucrare de garanție.";
	return null;
}

/** The fields that make a new lucrare the warranty of `original` (it starts at 0 lei). */
export function warrantyFields(original) {
	return {
		kind: "warranty",
		warrantyOf: original.id,
		customerId: original.customerId,
		vehicleId: original.vehicleId,
		complaint: `Garanție la lucrarea #${original.number}`,
	};
}

// ── Chapters, phase and next step ──────────────────────────────────────────

// phase → [next step, other move]. The screens turn the keys into words and icons.
const MOVES = {
	estimate_empty: ["add_lines", null],
	estimate_to_send: ["send_estimate", "approve"],
	estimate_sent: ["approve", "send_estimate"],
	supplement: ["approve_supplement", "call"],
	to_start: ["start", "send_estimate"],
	in_progress: ["ready", "wait_parts"],
	waiting_parts: ["resume", null],
	to_invoice: ["issue", "issue_and_pay"],
	to_collect: ["collect", "deliver"],
	overdue: ["collect", "remind"],
	to_deliver: ["deliver", "notify"],
	delivered_unpaid: ["collect", "remind"],
	delivered_uninvoiced: ["issue", null],
	review: ["ask_review", "note_customer"],
	closed: [null, null],
	refused: [null, "reactivate"],
	cancelled: ["reactivate", null],
};

const SECTION = {
	estimate_empty: "devize",
	estimate_to_send: "devize",
	estimate_sent: "devize",
	supplement: "in_lucru",
	to_start: "in_lucru",
	in_progress: "in_lucru",
	waiting_parts: "in_lucru",
	to_invoice: "de_incasat",
	to_collect: "de_incasat",
	overdue: "de_incasat",
	to_deliver: "de_incasat",
	delivered_unpaid: "de_incasat",
	delivered_uninvoiced: "de_incasat",
	review: "de_incasat",
};

const CURRENT = {
	estimate_empty: "deviz",
	estimate_to_send: "deviz",
	estimate_sent: "deviz",
	supplement: "deviz",
	refused: "deviz",
	to_start: "lucru",
	in_progress: "lucru",
	waiting_parts: "lucru",
	to_invoice: "factura",
	to_collect: "factura",
	overdue: "factura",
	to_deliver: "factura",
	delivered_unpaid: "factura",
	delivered_uninvoiced: "factura",
	review: "recenzie",
};

/** The day a lucrare closed: handed over (or sold) and nothing left to pay. */
function closedOn(order, { paidList, kind }) {
	const days = [];
	if (kind !== "sale" && order.dates?.delivered) days.push(dayOfInstant(order.dates.delivered));
	for (const payment of paidList) if (payment.date) days.push(payment.date);
	return days.sort().at(-1) ?? null;
}

/**
 * Everything the screens need about a lucrare, in one place: its phase (LUCRARE.md §3.2),
 * the chapter the next step belongs to, each chapter's state, the next step and one more
 * move, the Azi section (null: not on Azi), the money and the facts the header and card
 * show. `invoices`, `payments` may be the whole collections; `today` is "YYYY-MM-DD".
 */
export function lucrareState({ order, invoices = [], payments = [], review = null, today, settings }) {
	const kind = lucrareKind(order);
	const vatPayer = settings?.invoicing?.vatPayer ?? true;
	const mine = invoicesOfOrder(order.id, invoices);
	const live = liveInvoice(mine);
	const paidList = live ? payments.filter((payment) => payment.invoiceId === live.id) : [];
	const lines = billableLines(order);
	const total = live ? live.totals.gross : computeTotals(lines, { vatPayer }).gross;
	const paid = sumPayments(paidList);
	const due = Math.max(0, total - paid);
	const invoice = live ? invoiceState(live, paidList, today) : null;
	const delivered = order.status === "delivered";
	const extra = supplement(order, { vatPayer });
	const asked = reviewState(review);
	const sentAt = lastSent(order);

	const settled = () => {
		const day = closedOn(order, { paidList, kind });
		const fresh = day != null && diffDaysISO(day, today) <= REVIEW_WINDOW_DAYS;
		return { phase: kind !== "sale" && asked === "none" && fresh ? "review" : "closed", day };
	};
	const money = () => {
		if (!live) {
			if (total === 0 && kind !== "sale") return delivered ? settled() : { phase: "to_deliver" };
			return { phase: delivered ? "delivered_uninvoiced" : "to_invoice" };
		}
		if (invoice === "paid") return kind === "sale" || delivered ? settled() : { phase: "to_deliver" };
		if (invoice === "overdue") return { phase: "overdue" };
		return { phase: delivered || kind === "sale" ? "delivered_unpaid" : "to_collect" };
	};

	let result;
	if (order.status === "cancelled") result = { phase: "cancelled" };
	// A refused deviz can still owe a diagnosis fee (pick 14): that keeps it in De încasat.
	else if (order.status === "declined") result = live && invoice !== "paid" ? { phase: invoice === "overdue" ? "overdue" : "delivered_unpaid" } : { phase: "refused" };
	else if (kind === "sale") result = money();
	else if (order.status === "estimate") result = { phase: !lines.length ? "estimate_empty" : sentAt ? "estimate_sent" : "estimate_to_send" };
	else if (extra.pending) result = { phase: "supplement" };
	else if (order.status === "approved") result = { phase: "to_start" };
	else if (order.status === "in_progress") result = { phase: "in_progress" };
	else if (order.status === "waiting_parts") result = { phase: "waiting_parts" };
	else result = money();

	const { phase } = result;
	let [next, other] = MOVES[phase];
	if (phase === "to_invoice" && !lines.length) [next, other] = ["add_lines", null];
	if (kind === "sale" && other === "deliver") other = "remind";

	const chapter = (key) => chapterState(key, { order, phase, live, invoice, total, asked, extra, delivered });
	return {
		phase,
		kind,
		current: CURRENT[phase] && chaptersOf(order).includes(CURRENT[phase]) ? CURRENT[phase] : null,
		chapters: chaptersOf(order).map((key) => ({ key, ...chapter(key) })),
		next,
		other,
		section: SECTION[phase] ?? null,
		onAzi: Boolean(SECTION[phase]),
		money: { total, paid, due, invoiced: Boolean(live) },
		invoice: live ? { id: live.id, state: invoice } : null,
		invoices: mine,
		supplement: extra,
		received: isReceived(order),
		delivered,
		review: asked,
		sentAt,
		closedOn: result.day ?? null,
	};
}

const PAST_ESTIMATE = ["approved", "in_progress", "waiting_parts", "ready", "delivered"];

/** One chapter's state (done · now · ahead · skipped · off) and its status inside. */
function chapterState(key, { order, phase, live, invoice, total, asked, extra, delivered }) {
	const status = order.status;
	const off = status === "cancelled" || (status === "declined" && key !== "deviz" && !(key === "factura" && live));
	if (off) return { state: "off", status: status === "cancelled" ? "cancelled" : null };

	if (key === "deviz") {
		if (status === "declined") return { state: "off", status: "refused" };
		if (status === "estimate") return { state: "now", status: phase === "estimate_empty" ? "empty" : phase === "estimate_sent" ? "sent" : "to_send" };
		if (extra.pending) return { state: "now", status: "supplement" };
		return order.approval || order.dates?.approved ? { state: "done", status: "approved" } : { state: "skipped", status: null };
	}
	if (key === "lucru") {
		if (status === "estimate") return { state: "ahead", status: null };
		if (status === "approved") return { state: "now", status: "to_start" };
		if (status === "in_progress" || status === "waiting_parts") return { state: "now", status };
		return { state: "done", status: delivered ? "delivered" : "ready" };
	}
	if (key === "factura") {
		if (live) return { state: invoice === "paid" ? "done" : "now", status: invoice };
		const billingTime = lucrareKind(order) === "sale" || status === "ready" || delivered;
		if (!billingTime) return { state: "ahead", status: null };
		return total === 0 ? { state: "done", status: "nothing" } : { state: "now", status: "to_issue" };
	}
	// recenzie
	if (asked !== "none") return { state: "done", status: asked };
	return phase === "review" || phase === "closed" ? { state: "now", status: "none" } : { state: "ahead", status: null };
}
