"use client";

import { formatInvoiceNumber } from "@/domain/invoice";
import { formatPlate, vehicleName } from "@/domain/vehicle";
import { useOpenDetail } from "@/lib/detail-mode";
import { RECENTS_SHOWN, useRecents } from "@/lib/recents";
import { useCollection } from "@/lib/store/hooks";

/** A recent record as two lines: what it is called, and what kind of record it is (with its car or customer). */
function describe({ kind, id }, data) {
	const { vehicles, customers, workOrders, invoices, appointments } = data;
	const join = (...parts) => parts.filter(Boolean).join(" · ");
	if (kind === "vehicle") {
		const vehicle = vehicles[id];
		return vehicle && { title: vehicleName(vehicle) || formatPlate(vehicle.plate), subtitle: join("Mașină", vehicle.plate && formatPlate(vehicle.plate)) };
	}
	if (kind === "customer") {
		const customer = customers[id];
		return customer && { title: customer.name, subtitle: "Client" };
	}
	if (kind === "work-order") {
		const order = workOrders[id];
		return order && { title: `Lucrarea #${order.number}`, subtitle: join("Lucrare", vehicleName(vehicles[order.vehicleId])) };
	}
	if (kind === "invoice") {
		const invoice = invoices[id];
		return invoice && { title: invoice.number == null ? "Factură ciornă" : `Factura ${formatInvoiceNumber(invoice.series, invoice.number)}`, subtitle: join("Factură", customers[invoice.customerId]?.name) };
	}
	if (kind === "appointment") {
		const appointment = appointments[id];
		return appointment && { title: appointment.number != null ? `Programare #${appointment.number}` : "Programare", subtitle: join("Programare", vehicleName(vehicles[appointment.vehicleId]) || customers[appointment.customerId]?.name) };
	}
	return null;
}

/**
 * The records opened last that still exist, at most five, each as { key, title, subtitle,
 * open }. Opening one goes where the record opens anyway (its sheet, or its page).
 */
export function useRecentRecords() {
	const openDetail = useOpenDetail();
	const data = {
		vehicles: useCollection("vehicles"),
		customers: useCollection("customers"),
		workOrders: useCollection("workOrders"),
		invoices: useCollection("invoices"),
		appointments: useCollection("appointments"),
	};
	const records = [];
	for (const item of useRecents()) {
		if (records.length >= RECENTS_SHOWN) break;
		const text = describe(item, data);
		if (text) records.push({ key: `${item.kind}:${item.id}`, ...text, open: () => openDetail(item.kind, item.id) });
	}
	return records;
}
