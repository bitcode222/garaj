import { addDaysISO, diffDaysISO, dayOfInstant, timeOfInstant } from "./dates.js";
import { greetingName } from "./customer.js";
import { formatInvoiceNumber, invoiceBalance, invoiceState } from "./invoice.js";
import { formatMoney } from "./money.js";
import { deadline, formatPlate, serviceDue, vehicleName } from "./vehicle.js";

// Retention engine: who should the shop contact today, and what to say.
// Keys are stable per cycle (they include the due date), so "contacted" or
// "snoozed" hides a reminder until its snooze ends or a new cycle starts.

export const REMINDER_TYPES = ["itp", "rca", "service", "unpaid", "pickup", "tomorrow"];

const URGENCY = { expired: 0, overdue: 0, soon: 1, info: 2 };

export function computeReminders({
	today,
	vehicles,
	customersById,
	invoices,
	paymentsByInvoice,
	workOrders,
	appointments,
	contactsByKey,
}) {
	const out = [];
	const push = (reminder) => {
		const contact = contactsByKey.get(reminder.key);
		if (contact && contact.snoozeUntil > today) return;
		out.push(reminder);
	};

	for (const vehicle of vehicles) {
		const customer = customersById.get(vehicle.customerId);
		if (!customer) continue;
		for (const type of ["itp", "rca"]) {
			const date = type === "itp" ? vehicle.itpExpiry : vehicle.rcaExpiry;
			const d = deadline(date, today, 30);
			// Expired more than 60 days ago usually means the owner went elsewhere.
			if (d.status === "soon" || (d.status === "expired" && d.days >= -60)) {
				push({
					key: `${type}:${vehicle.id}:${date}`,
					type,
					urgency: d.status,
					days: d.days,
					due: date,
					customerId: customer.id,
					vehicleId: vehicle.id,
				});
			}
		}
		const service = serviceDue(vehicle, today);
		if (service.status === "soon" || (service.status === "expired" && (service.days ?? 0) >= -120)) {
			push({
				key: `service:${vehicle.id}:${vehicle.lastServiceDate}`,
				type: "service",
				urgency: service.status,
				days: service.days,
				due: service.dueDate,
				kmLeft: service.kmLeft,
				customerId: customer.id,
				vehicleId: vehicle.id,
			});
		}
	}

	for (const invoice of invoices) {
		if (invoice.status !== "issued" || invoice.stornoOf) continue;
		const payments = paymentsByInvoice.get(invoice.id) ?? [];
		if (invoiceState(invoice, payments, today) !== "overdue") continue;
		push({
			key: `unpaid:${invoice.id}`,
			type: "unpaid",
			urgency: "overdue",
			days: diffDaysISO(today, invoice.dueDate),
			due: invoice.dueDate,
			amount: invoiceBalance(invoice, payments),
			customerId: invoice.customerId,
			vehicleId: invoice.vehicleId,
			invoiceId: invoice.id,
		});
	}

	for (const order of workOrders) {
		if (order.status !== "ready" || !order.dates?.ready) continue;
		const readySince = dayOfInstant(order.dates.ready);
		const waiting = diffDaysISO(readySince, today);
		if (waiting < 1) continue;
		push({
			key: `pickup:${order.id}`,
			type: "pickup",
			urgency: waiting >= 3 ? "overdue" : "soon",
			days: -waiting,
			due: readySince,
			customerId: order.customerId,
			vehicleId: order.vehicleId,
			workOrderId: order.id,
		});
	}

	const tomorrow = addDaysISO(today, 1);
	for (const appointment of appointments) {
		if (appointment.status !== "scheduled") continue;
		if (dayOfInstant(appointment.start) !== tomorrow) continue;
		push({
			key: `tomorrow:${appointment.id}`,
			type: "tomorrow",
			urgency: "info",
			days: 1,
			due: tomorrow,
			customerId: appointment.customerId,
			vehicleId: appointment.vehicleId,
			appointmentId: appointment.id,
			start: appointment.start,
		});
	}

	return out.sort((a, b) => URGENCY[a.urgency] - URGENCY[b.urgency] || (a.days ?? 0) - (b.days ?? 0));
}

const fmtDate = (iso) => (iso ? iso.split("-").reverse().join(".") : "");

/** Ready-to-send text for WhatsApp / SMS. */
export function reminderMessage(reminder, { customer, vehicle, invoice, settings }) {
	const hello = `Bună ziua${customer ? `, ${greetingName(customer)}` : ""}!`;
	const car = vehicle ? `${vehicleName(vehicle)} (${formatPlate(vehicle.plate)})` : "mașina dvs.";
	const shop = settings.shop.name;
	const phone = settings.shop.phone ? ` ${settings.shop.phone}` : "";
	switch (reminder.type) {
		case "itp":
			return `${hello} ITP-ul pentru ${car} ${reminder.days < 0 ? "a expirat" : "expiră"} pe ${fmtDate(reminder.due)}. Vă putem face verificarea pre-ITP la ${shop}. Ce zi vă convine?${phone}`;
		case "rca":
			return `${hello} Asigurarea RCA pentru ${car} ${reminder.days < 0 ? "a expirat" : "expiră"} pe ${fmtDate(reminder.due)}. Vă reamintim ca să nu rămâneți fără acoperire. ${shop}${phone}`;
		case "service":
			return `${hello} Revizia pentru ${car} este ${reminder.urgency === "expired" ? "depășită" : "aproape"}${reminder.kmLeft != null ? ` (aprox. ${Math.max(0, reminder.kmLeft).toLocaleString("ro-RO")} km rămași)` : ""}. Vă programăm la ${shop}? Răspundeți cu o zi care vă convine.${phone}`;
		case "unpaid":
			return `${hello} Factura ${invoice ? formatInvoiceNumber(invoice.series, invoice.number) : ""} are un rest de plată de ${formatMoney(reminder.amount, settings.currency)}, scadent pe ${fmtDate(reminder.due)}.${settings.shop.iban ? ` IBAN: ${settings.shop.iban}.` : ""} Mulțumim! ${shop}`;
		case "pickup":
			return `${hello} ${car} este gata și vă așteaptă la ${shop}. Program: ${settings.hours.open}–${settings.hours.close}.${phone}`;
		case "tomorrow":
			return `${hello} Vă reamintim programarea de mâine, ${fmtDate(reminder.due)}, ora ${timeOfInstant(reminder.start)}, pentru ${car}. Confirmați, vă rugăm? ${shop}`;
		default:
			return hello;
	}
}
