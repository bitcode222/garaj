import { addDaysISO } from "./dates.js";
import { DomainError } from "./errors.js";
import { uid } from "./ids.js";
import { computeTotals } from "./lines.js";
import { formatMoney } from "./money.js";
import { greetingName } from "./customer.js";
import { formatPlate, vehicleName } from "./vehicle.js";

// estimate → approved → in_progress ⇄ waiting_parts → ready → delivered
// docs/VISIT-FLOW.md §6.2. An open job can jump forward to any later stage (the steps in
// between are recorded as skipped), and step back to any earlier one (a job marked "ready"
// too early goes back to "in progress", a wrongly approved one back to the estimate).
// A delivered job can be reopened (it comes back as "ready"), a cancelled one reactivated
// (as an estimate); a ready car is not cancelled, it is delivered or sent back to work.
export const WO_FLOW = ["estimate", "approved", "in_progress", "waiting_parts", "ready", "delivered"];

export const WO_TRANSITIONS = {
	estimate: ["approved", "in_progress", "ready", "delivered", "cancelled"],
	approved: ["in_progress", "ready", "delivered", "estimate", "cancelled"],
	in_progress: ["waiting_parts", "ready", "delivered", "approved", "estimate", "cancelled"],
	waiting_parts: ["in_progress", "ready", "delivered", "approved", "estimate", "cancelled"],
	ready: ["delivered", "in_progress", "approved", "estimate"],
	delivered: ["ready"],
	cancelled: ["estimate"],
};

const WO_RANK = { estimate: 0, approved: 1, in_progress: 2, waiting_parts: 2, ready: 3, delivered: 4 };

/** True when `to` is an earlier stage than `from` ("in progress" ⇄ "waiting for parts" is sideways, not back). */
export const isBackwardMove = (from, to) => (WO_RANK[to] ?? Infinity) < (WO_RANK[from] ?? -Infinity);

/** The one-tap "next step" of a job (swipe action); closed jobs have none. */
export const WO_NEXT = {
	estimate: "approved",
	approved: "in_progress",
	in_progress: "ready",
	waiting_parts: "in_progress",
	ready: "delivered",
};

export const OPEN_STATUSES = ["estimate", "approved", "in_progress", "waiting_parts", "ready"];

export const isOpen = (order) => OPEN_STATUSES.includes(order.status);

export function canTransition(from, to) {
	return WO_TRANSITIONS[from]?.includes(to) ?? false;
}

/** The main stages a forward jump from `from` to `to` passes over ("waiting for parts" is a pause, never skipped). */
export function skippedStages(from, to) {
	const main = ["estimate", "approved", "in_progress", "ready", "delivered"];
	const start = main.indexOf(from === "waiting_parts" ? "in_progress" : from);
	const end = main.indexOf(to);
	return start >= 0 && end > start + 1 ? main.slice(start + 1, end) : [];
}

/** Moves a job to `to`. `reason` (reopening, cancelling) goes into the history with the move. */
export function transition(order, to, { now = new Date().toISOString(), reason = "" } = {}) {
	if (!canTransition(order.status, to)) {
		throw new DomainError("invalid_transition", "Lucrarea nu poate trece în această stare.");
	}
	const skipped = skippedStages(order.status, to);
	const entry = { at: now, type: "status", from: order.status, to, ...(skipped.length ? { skipped } : null), ...(reason.trim() ? { reason: reason.trim() } : null) };
	return {
		...order,
		status: to,
		dates: { ...order.dates, [to]: now },
		activity: [...(order.activity ?? []), entry],
		updatedAt: now,
	};
}

export const INSPECTION_ITEMS = [
	{ key: "brakes", label: "Frâne" },
	{ key: "tires", label: "Anvelope" },
	{ key: "lights", label: "Lumini și semnalizare" },
	{ key: "fluids", label: "Lichide (ulei, antigel, frână)" },
	{ key: "wipers", label: "Ștergătoare" },
	{ key: "battery", label: "Baterie" },
	{ key: "suspension", label: "Suspensie și direcție" },
	{ key: "exhaust", label: "Evacuare" },
	{ key: "belts", label: "Curele" },
	{ key: "filters", label: "Filtre" },
];

export const defaultInspection = () =>
	INSPECTION_ITEMS.map(({ key }) => ({ key, status: null, note: "" }));

/** ok / attention / urgent counts; attention + urgent are upsell candidates. */
export function inspectionSummary(items = []) {
	const summary = { ok: 0, attention: 0, urgent: 0, pending: 0 };
	for (const item of items) summary[item.status ?? "pending"] += 1;
	return summary;
}

export function orderTotals(order, settings) {
	return computeTotals(order.lines, { vatPayer: settings.invoicing.vatPayer });
}

/** The job's lines as they go on its invoice (new ids; the VAT rate the shop charges). */
export function invoiceLinesFromOrder(order, { settings }) {
	const { vatPayer, vatRate } = settings.invoicing;
	return order.lines.map((line) => ({ ...line, id: uid(), vatRate: vatPayer ? (line.vatRate ?? vatRate) : 0 }));
}

const LINE_FIELDS = ["kind", "refId", "description", "qty", "unit", "unitPrice", "discountPct", "vatRate"];
const lineKey = (line) => LINE_FIELDS.map((field) => String(line[field] ?? "")).join("|");

/**
 * True when a draft's lines are no longer what its job would put on an invoice (the job was
 * changed after the draft was made). Ids and order do not count; what is billed does.
 */
export function draftBehindOrder(draft, order, { settings }) {
	if (!order || draft.status !== "draft") return false;
	const fresh = invoiceLinesFromOrder(order, { settings }).map(lineKey).sort();
	const current = (draft.lines ?? []).map(lineKey).sort();
	return fresh.length !== current.length || fresh.some((key, index) => key !== current[index]);
}

/** A draft invoice prefilled from the work order; the snapshot is taken at issue time. */
export function toInvoiceDraft(order, { settings, today }) {
	const { series, dueDays } = settings.invoicing;
	return {
		id: uid(),
		status: "draft",
		series,
		number: null,
		issueDate: today,
		dueDate: addDaysISO(today, dueDays),
		customerId: order.customerId,
		vehicleId: order.vehicleId,
		workOrderId: order.id,
		mileage: order.mileage ?? null,
		lines: invoiceLinesFromOrder(order, { settings }),
		notes: "",
		activity: [],
	};
}

/** Plain-text estimate for WhatsApp / SMS approval. */
export function estimateMessage({ order, customer, vehicle, settings }) {
	const totals = orderTotals(order, settings);
	const currency = settings.currency;
	const lines = order.lines
		.slice(0, 12)
		.map((l) => `• ${l.description} — ${l.qty} ${l.unit}`)
		.join("\n");
	const more = order.lines.length > 12 ? `\n• … încă ${order.lines.length - 12} poziții` : "";
	const labels = Object.fromEntries(INSPECTION_ITEMS.map((i) => [i.key, i.label]));
	const findings = (order.inspection ?? [])
		.filter((i) => i.status === "attention" || i.status === "urgent")
		.map((i) => `${labels[i.key] ?? i.key} (${i.status === "urgent" ? "urgent" : "de urmărit"})${i.note ? `: ${i.note}` : ""}`);
	return [
		`Bună ziua${customer ? `, ${greetingName(customer)}` : ""}!`,
		`Deviz pentru ${vehicleName(vehicle)} ${vehicle ? formatPlate(vehicle.plate) : ""} (lucrarea ${order.number}):`,
		lines + more,
		`Total: ${formatMoney(totals.gross, currency)}${settings.invoicing.vatPayer ? " cu TVA" : ""}.`,
		findings.length ? `La verificare am mai găsit: ${findings.join("; ")}.` : null,
		"Confirmați să începem lucrarea? Mulțumim!",
		settings.shop.name,
	]
		.filter(Boolean)
		.join("\n");
}

/** "The car is ready" for WhatsApp / SMS: the car, its plate, when it can be picked up. */
export function readyMessage({ customer, vehicle, settings }) {
	const car = [vehicleName(vehicle), vehicle?.plate ? `(${formatPlate(vehicle.plate)})` : null].filter(Boolean).join(" ") || "Mașina";
	return [`Bună ziua${customer ? `, ${greetingName(customer)}` : ""}! ${car} este gata de ridicare.`, `Program: ${settings.hours.open}–${settings.hours.close}.`, settings.shop.name].join(" ");
}
