// Derived data, memoized on the identity of its inputs. Collections are
// replaced (never mutated) on change, so a selector recomputes only when one
// of its inputs actually changed — and every component shares the result.

import { dayOfInstant } from "@/domain/dates";
import { invoiceBalance, invoiceState, sumPayments } from "@/domain/invoice";
import { reservedByPart } from "@/domain/inventory";
import { computeReminders } from "@/domain/reminders";
import { fold } from "@/domain/search";
import { formatPlate, normalizePlate, vehicleName } from "@/domain/vehicle";
import { formatInvoiceNumber } from "@/domain/invoice";

function memo(fn) {
	let lastArgs = null;
	let lastResult;
	return (...args) => {
		if (lastArgs && args.length === lastArgs.length && args.every((a, i) => a === lastArgs[i])) {
			return lastResult;
		}
		lastResult = fn(...args);
		lastArgs = args;
		return lastResult;
	};
}

/** One cached result per input object (collections are immutable snapshots). */
function memoWeak(fn) {
	const cache = new WeakMap();
	return (input) => {
		let result = cache.get(input);
		if (result === undefined) {
			result = fn(input);
			cache.set(input, result);
		}
		return result;
	};
}

function groupBy(list, keyOf) {
	const map = new Map();
	for (const item of list) {
		const key = keyOf(item);
		if (key == null) continue;
		const bucket = map.get(key);
		if (bucket) bucket.push(item);
		else map.set(key, [item]);
	}
	return map;
}

const byCreatedDesc = (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

export const selectList = memoWeak((collection) => Object.values(collection));

export const selectCustomersMap = memoWeak((customers) => new Map(Object.entries(customers)));

export const selectCustomersSorted = memoWeak((customers) =>
	Object.values(customers).sort((a, b) => a.name.localeCompare(b.name, "ro")),
);

export const selectVehiclesByCustomer = memoWeak((vehicles) => groupBy(Object.values(vehicles), (v) => v.customerId));

export const selectPaymentsByInvoice = memoWeak((payments) => {
	const map = groupBy(Object.values(payments), (p) => p.invoiceId);
	for (const list of map.values()) list.sort((a, b) => (a.date < b.date ? -1 : 1));
	return map;
});

export const selectInvoicesSorted = memoWeak((invoices) =>
	Object.values(invoices).sort((a, b) => {
		if (a.status === "draft" && b.status !== "draft") return -1;
		if (b.status === "draft" && a.status !== "draft") return 1;
		if (a.issueDate !== b.issueDate) return a.issueDate < b.issueDate ? 1 : -1;
		return (b.number ?? 0) - (a.number ?? 0);
	}),
);

export const selectInvoicesByCustomer = memoWeak((invoices) =>
	groupBy(selectInvoicesSorted(invoices), (i) => i.customerId),
);

export const selectInvoicesByVehicle = memoWeak((invoices) => groupBy(selectInvoicesSorted(invoices), (i) => i.vehicleId));

/** Map invoiceId → { state, paid, balance } for a given day. */
export const selectInvoiceStates = memo((invoices, payments, today) => {
	const byInvoice = selectPaymentsByInvoice(payments);
	const map = new Map();
	for (const invoice of Object.values(invoices)) {
		const list = byInvoice.get(invoice.id) ?? [];
		const paid = sumPayments(list);
		map.set(invoice.id, {
			state: invoiceState(invoice, list, today),
			paid,
			balance: invoice.status === "issued" && !invoice.stornoOf ? invoiceBalance(invoice, list) : 0,
		});
	}
	return map;
});

export const selectCustomerBalances = memo((invoices, payments, today) => {
	const states = selectInvoiceStates(invoices, payments, today);
	const map = new Map();
	for (const invoice of Object.values(invoices)) {
		const balance = states.get(invoice.id)?.balance ?? 0;
		if (balance > 0) map.set(invoice.customerId, (map.get(invoice.customerId) ?? 0) + balance);
	}
	return map;
});

export const selectWorkOrdersSorted = memoWeak((workOrders) => Object.values(workOrders).sort(byCreatedDesc));

export const selectWorkOrdersByVehicle = memoWeak((workOrders) =>
	groupBy(selectWorkOrdersSorted(workOrders), (o) => o.vehicleId),
);

export const selectWorkOrdersByCustomer = memoWeak((workOrders) =>
	groupBy(selectWorkOrdersSorted(workOrders), (o) => o.customerId),
);

export const selectAppointmentsSorted = memoWeak((appointments) =>
	Object.values(appointments).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0)),
);

/** Map local day ("2026-09-30") → appointments sorted by start. */
export const selectAppointmentsByDay = memoWeak((appointments) =>
	groupBy(selectAppointmentsSorted(appointments), (a) => dayOfInstant(a.start)),
);

export const selectActive = memoWeak((collection) =>
	Object.values(collection)
		.filter((x) => x.active !== false)
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "ro")),
);

export const selectReserved = memo((workOrders, invoices) =>
	reservedByPart(Object.values(workOrders), new Map(Object.entries(invoices))),
);

export const selectContactsByKey = memoWeak((contacts) => new Map(Object.values(contacts).map((c) => [c.key, c])));

export const selectReminders = memo(
	(today, vehicles, customers, invoices, payments, workOrders, appointments, contacts) =>
		today
			? computeReminders({
					today,
					vehicles: Object.values(vehicles),
					customersById: selectCustomersMap(customers),
					invoices: Object.values(invoices),
					paymentsByInvoice: selectPaymentsByInvoice(payments),
					workOrders: Object.values(workOrders),
					appointments: Object.values(appointments),
					contactsByKey: selectContactsByKey(contacts),
				})
			: [],
);

/** Flat search index: plates, VINs, names, phones, document numbers. */
export const selectSearchIndex = memo((customers, vehicles, workOrders, invoices) => {
	const items = [];
	for (const c of Object.values(customers)) {
		items.push({
			type: "customer",
			id: c.id,
			title: c.name,
			subtitle: [c.phone, c.cui].filter(Boolean).join(" · "),
			hay: fold(`${c.name} ${c.phone ?? ""} ${(c.phone ?? "").replace(/\D/g, "")} ${c.cui ?? ""} ${c.email ?? ""}`),
		});
	}
	for (const v of Object.values(vehicles)) {
		const owner = customers[v.customerId];
		items.push({
			type: "vehicle",
			id: v.id,
			title: formatPlate(v.plate),
			subtitle: [vehicleName(v), owner?.name].filter(Boolean).join(" · "),
			plate: v.plate,
			hay: fold(`${v.plate} ${normalizePlate(v.plate)} ${v.vin ?? ""} ${vehicleName(v)} ${owner?.name ?? ""}`),
		});
	}
	for (const o of Object.values(workOrders)) {
		const v = vehicles[o.vehicleId];
		items.push({
			type: "workOrder",
			id: o.id,
			title: `Lucrarea ${o.number}`,
			subtitle: [v ? formatPlate(v.plate) : null, customers[o.customerId]?.name].filter(Boolean).join(" · "),
			status: o.status,
			hay: fold(`${o.number} ${v?.plate ?? ""} ${v ? normalizePlate(v.plate) : ""} ${customers[o.customerId]?.name ?? ""}`),
		});
	}
	for (const i of Object.values(invoices)) {
		const number = formatInvoiceNumber(i.series, i.number);
		items.push({
			type: "invoice",
			id: i.id,
			title: i.number == null ? "Factură ciornă" : `Factura ${number}`,
			subtitle: customers[i.customerId]?.name ?? i.snapshot?.buyer?.name ?? "",
			hay: fold(`${number} ${i.number ?? ""} ${customers[i.customerId]?.name ?? i.snapshot?.buyer?.name ?? ""}`),
		});
	}
	return items;
});
