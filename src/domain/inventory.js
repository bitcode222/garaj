import { isOpen } from "./work-order.js";

// Stock is consumed when an invoice is issued and restored by its storno.
// Part lines on open work orders (not yet invoiced) are "reserved".

export function reservedByPart(workOrders, invoicesById) {
	const reserved = new Map();
	for (const order of workOrders) {
		if (!isOpen(order)) continue;
		const invoice = order.invoiceId ? invoicesById.get(order.invoiceId) : null;
		if (invoice && invoice.status !== "draft") continue;
		for (const line of order.lines) {
			if (line.kind !== "part" || !line.refId) continue;
			reserved.set(line.refId, (reserved.get(line.refId) ?? 0) + (Number(line.qty) || 0));
		}
	}
	return reserved;
}

/** Map partId → signed quantity change for issuing (−) or cancelling (+) a document. */
export function stockDelta(lines, sign) {
	const delta = new Map();
	for (const line of lines) {
		if (line.kind !== "part" || !line.refId) continue;
		delta.set(line.refId, (delta.get(line.refId) ?? 0) + sign * Math.abs(Number(line.qty) || 0));
	}
	return delta;
}

export function stockLevel(part, reserved = 0) {
	const available = Math.round((part.stock - reserved) * 1000) / 1000;
	let status = "ok";
	if (part.stock <= 0 || available <= 0) status = "out";
	else if (available <= (part.minStock ?? 0)) status = "low";
	return { available, reserved, status };
}
