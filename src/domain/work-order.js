import { addDaysISO } from "./dates.js";
import { DomainError } from "./errors.js";
import { uid } from "./ids.js";
import { computeTotals } from "./lines.js";
import { formatMoney } from "./money.js";
import { greetingName } from "./customer.js";
import { formatPlate, vehicleName } from "./vehicle.js";

// estimate → approved → in_progress ⇄ waiting_parts → ready → delivered
// Small jobs may skip approval (estimate → in_progress); ready → in_progress is rework.
export const WO_FLOW = ["estimate", "approved", "in_progress", "waiting_parts", "ready", "delivered"];

export const WO_TRANSITIONS = {
	estimate: ["approved", "in_progress", "cancelled"],
	approved: ["in_progress", "estimate", "cancelled"],
	in_progress: ["waiting_parts", "ready", "cancelled"],
	waiting_parts: ["in_progress", "cancelled"],
	ready: ["delivered", "in_progress"],
	delivered: [],
	cancelled: [],
};

export const OPEN_STATUSES = ["estimate", "approved", "in_progress", "waiting_parts", "ready"];

export const isOpen = (order) => OPEN_STATUSES.includes(order.status);

export function canTransition(from, to) {
	return WO_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transition(order, to, { now = new Date().toISOString() } = {}) {
	if (!canTransition(order.status, to)) {
		throw new DomainError("invalid_transition", "Lucrarea nu poate trece în această stare.");
	}
	return {
		...order,
		status: to,
		dates: { ...order.dates, [to]: now },
		activity: [...(order.activity ?? []), { at: now, type: "status", from: order.status, to }],
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

/** A draft invoice prefilled from the work order; the snapshot is taken at issue time. */
export function toInvoiceDraft(order, { settings, today }) {
	const { vatPayer, vatRate, series, dueDays } = settings.invoicing;
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
		lines: order.lines.map((line) => ({
			...line,
			id: uid(),
			vatRate: vatPayer ? (line.vatRate ?? vatRate) : 0,
		})),
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
