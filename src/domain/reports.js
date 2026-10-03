import { addMonthsISO, diffDaysISO, monthKey } from "./dates.js";
import { invoiceBalance } from "./invoice.js";
import { lineNet } from "./lines.js";

// Revenue counts every numbered invoice: a cancelled original and its storno
// net to zero, each in its own month, like the accounting ledger.
export const isRevenue = (invoice) => invoice.status !== "draft" && invoice.number != null;

/** Last `count` months ending with the month of `today`: ["2025-10", …, "2026-09"]. */
export function monthRange(today, count) {
	const first = addMonthsISO(`${monthKey(today)}-01`, -(count - 1));
	return Array.from({ length: count }, (_, i) => monthKey(addMonthsISO(first, i)));
}

export function revenueByMonth(invoices, months) {
	const index = new Map(months.map((m, i) => [m, i]));
	const rows = months.map((month) => ({ month, labor: 0, parts: 0, fees: 0, net: 0, count: 0 }));
	for (const invoice of invoices) {
		if (!isRevenue(invoice)) continue;
		const i = index.get(monthKey(invoice.issueDate));
		if (i == null) continue;
		const row = rows[i];
		row.labor += invoice.totals.labor;
		row.parts += invoice.totals.parts;
		row.fees += invoice.totals.fees;
		row.net += invoice.totals.net;
		if (!invoice.stornoOf && invoice.status !== "cancelled") row.count += 1;
	}
	return rows;
}

/** Same as revenueByMonth, one row per day ("2026-09-01" …). */
export function revenueByDay(invoices, days) {
	const index = new Map(days.map((d, i) => [d, i]));
	const rows = days.map((day) => ({ month: day, labor: 0, parts: 0, fees: 0, net: 0, count: 0 }));
	for (const invoice of invoices) {
		if (!isRevenue(invoice)) continue;
		const i = index.get(invoice.issueDate);
		if (i == null) continue;
		const row = rows[i];
		row.labor += invoice.totals.labor;
		row.parts += invoice.totals.parts;
		row.fees += invoice.totals.fees;
		row.net += invoice.totals.net;
		if (!invoice.stornoOf && invoice.status !== "cancelled") row.count += 1;
	}
	return rows;
}

export function summarize(invoices, { from, to }) {
	const s = { net: 0, gross: 0, labor: 0, parts: 0, partsCost: 0, count: 0, hours: 0 };
	for (const invoice of invoices) {
		if (!isRevenue(invoice) || invoice.issueDate < from || invoice.issueDate > to) continue;
		s.net += invoice.totals.net;
		s.gross += invoice.totals.gross;
		s.labor += invoice.totals.labor;
		s.parts += invoice.totals.parts;
		s.partsCost += invoice.totals.cost;
		s.hours += invoice.totals.hours;
		if (!invoice.stornoOf && invoice.status !== "cancelled") s.count += 1;
	}
	s.avgTicket = s.count ? Math.round(s.net / s.count) : 0;
	s.partsMargin = s.parts - s.partsCost;
	s.partsMarginPct = s.parts ? (s.partsMargin / s.parts) * 100 : 0;
	return s;
}

export function topServices(invoices, { from, to, limit = 5 }) {
	const map = new Map();
	for (const invoice of invoices) {
		if (!isRevenue(invoice) || invoice.issueDate < from || invoice.issueDate > to) continue;
		for (const line of invoice.lines) {
			if (line.kind !== "labor") continue;
			const key = line.refId || line.description;
			const row = map.get(key) ?? { key, name: line.description, count: 0, revenue: 0 };
			row.revenue += lineNet(line);
			row.count += Math.sign(line.qty);
			map.set(key, row);
		}
	}
	return [...map.values()]
		.filter((r) => r.revenue > 0)
		.sort((a, b) => b.revenue - a.revenue)
		.slice(0, limit);
}

/** Billed labor hours and revenue per mechanic (from labor lines' staffId). */
export function staffProductivity(invoices, { from, to }) {
	const map = new Map();
	for (const invoice of invoices) {
		if (!isRevenue(invoice) || invoice.issueDate < from || invoice.issueDate > to) continue;
		for (const line of invoice.lines) {
			if (line.kind !== "labor" || !line.staffId) continue;
			const row = map.get(line.staffId) ?? { staffId: line.staffId, hours: 0, revenue: 0 };
			row.hours += Number(line.qty) || 0;
			row.revenue += lineNet(line);
			map.set(line.staffId, row);
		}
	}
	return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

export function paymentMix(payments, { from, to }) {
	const mix = { cash: 0, card: 0, transfer: 0 };
	for (const p of payments) {
		if (p.date < from || p.date > to) continue;
		mix[p.method] = (mix[p.method] ?? 0) + p.amount;
	}
	return mix;
}

/** Outstanding balances bucketed by days past due. */
export function receivablesAging(invoices, paymentsByInvoice, today) {
	const buckets = { current: 0, d30: 0, d60: 0, d90: 0, total: 0 };
	for (const invoice of invoices) {
		if (invoice.status !== "issued" || invoice.stornoOf) continue;
		const balance = invoiceBalance(invoice, paymentsByInvoice.get(invoice.id) ?? []);
		if (balance <= 0) continue;
		const late = invoice.dueDate ? diffDaysISO(invoice.dueDate, today) : 0;
		if (late <= 0) buckets.current += balance;
		else if (late <= 30) buckets.d30 += balance;
		else if (late <= 60) buckets.d60 += balance;
		else buckets.d90 += balance;
		buckets.total += balance;
	}
	return buckets;
}
