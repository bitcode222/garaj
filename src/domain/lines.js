import { divRound, percentOf } from "./money.js";

// A line is shared by work orders and invoices:
// { id, kind: "labor" | "part" | "fee", refId, description, qty, unit,
//   unitPrice (bani, net), discountPct, vatRate, cost (bani per unit, parts), staffId }

export const LINE_KINDS = ["labor", "part", "fee"];

/** Net amount of one line: qty × unit price − discount, rounded once. */
export function lineNet(line) {
	const qtyMilli = BigInt(Math.round((Number(line.qty) || 0) * 1000));
	const discount = Math.min(Math.max(Number(line.discountPct) || 0, 0), 100);
	const discountBp = BigInt(Math.round(discount * 100));
	const unit = BigInt(Math.round(Number(line.unitPrice) || 0));
	return Number(divRound(unit * qtyMilli * (10000n - discountBp), 10_000_000n));
}

/**
 * Document totals. VAT is computed per rate on the sum of net lines (EN 16931,
 * the model behind e-Factura), not per line, so it matches what ANAF recomputes.
 */
export function computeTotals(lines, { vatPayer = true } = {}) {
	const groups = new Map();
	let net = 0;
	let labor = 0;
	let parts = 0;
	let fees = 0;
	let cost = 0;
	let hours = 0;

	for (const line of lines ?? []) {
		const amount = lineNet(line);
		net += amount;
		if (line.kind === "labor") {
			labor += amount;
			hours += Number(line.qty) || 0;
		} else if (line.kind === "part") {
			parts += amount;
			if (line.cost) cost += Math.round((Number(line.qty) || 0) * line.cost);
		} else {
			fees += amount;
		}
		const rate = vatPayer ? Number(line.vatRate) || 0 : 0;
		groups.set(rate, (groups.get(rate) ?? 0) + amount);
	}

	const byRate = [...groups]
		.sort((a, b) => b[0] - a[0])
		.map(([rate, taxable]) => ({ rate, taxable, vat: percentOf(taxable, rate) }));
	const vat = byRate.reduce((sum, g) => sum + g.vat, 0);

	return {
		net,
		vat,
		gross: net + vat,
		byRate,
		labor,
		parts,
		fees,
		cost,
		partsMargin: parts - cost,
		hours: Math.round(hours * 100) / 100,
	};
}

/** Gross value of a single line, for display only (totals never sum these). */
export function lineGross(line, vatPayer = true) {
	const net = lineNet(line);
	return vatPayer ? net + percentOf(net, line.vatRate) : net;
}

export function lineIssues(line) {
	const issues = [];
	if (!String(line.description ?? "").trim()) issues.push("Descrierea lipsește.");
	if (!(Number(line.qty) > 0)) issues.push("Cantitatea trebuie să fie mai mare ca zero.");
	if (!(Number(line.unitPrice) >= 0)) issues.push("Prețul nu poate fi negativ.");
	return issues;
}

/** Suggested labor price (bani) for `hours` at an hourly `rate` (bani). */
export function laborPrice(hours, rate) {
	return Math.round((Number(hours) || 0) * rate);
}

/** Unit price from cost and markup, rounded to whole lei like a price list. */
export function priceFromCost(cost, markupPct) {
	const raw = Number(divRound(BigInt(cost) * BigInt(Math.round(10000 + markupPct * 100)), 10000n));
	return Math.max(100, Math.round(raw / 100) * 100);
}
