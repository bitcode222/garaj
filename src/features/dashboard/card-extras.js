// What a card on Azi says besides its rows (the owner's picks, 7 Nov 2026; docs/DESIGN-SYSTEM.md, Card stages): what
// the record waits for, how long it has been at its stage, the time the car was promised for, what needs attention,
// and how much of its invoice is paid. Also the records of the visit that came before it, stacked behind the card.
// Words only: the money comes from the domain (invoiceFlow), the warnings from bookingWarnings.

import { Clock, Flag, Hourglass, TriangleAlert } from "lucide-react";
import { bookingAlert } from "@/domain/booking-warnings";
import { dayOfInstant, diffDaysISO } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { fmtDate, fmtTime, plural } from "@/lib/format";
import { APPOINTMENT_STATUS, INVOICE_STATE, WORK_ORDER_STATUS } from "@/lib/labels";
import { selectActive } from "@/lib/store/selectors";
import { warningWords } from "@/features/calendar/booking-warnings";
import { firstName } from "@/features/calendar/card-facts";

/** "5 min", "3 h", "2 zile": the time from one instant to another, as said in passing. */
export function sinceWords(from, to) {
	const minutes = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60000));
	if (minutes < 60) return `${Math.max(1, minutes)} min`;
	if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h`;
	return plural(Math.floor(minutes / (24 * 60)), "zi", "zile");
}

const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** The first warning a card's other rows do not already say (`said`: the kinds its state and clock cover). */
function attention(alert, said) {
	const warning = alert?.list?.find((w) => w.severity !== "info" && !said.includes(w.kind));
	return warning ? { key: "alert", icon: TriangleAlert, text: capital(warningWords(warning)), tone: warning.severity === "danger" ? "danger" : "warning" } : null;
}

/** "Promisă azi la 17:00 · mai sunt 2 h": when the job was promised for (its booking's end). */
function promise(end, { now, today }) {
	const away = diffDaysISO(today, dayOfInstant(end));
	const when = away === 0 ? "azi" : away === 1 ? "mâine" : away === -1 ? "ieri" : fmtDate(end, "d MMM");
	const text = `Promisă ${when} la ${fmtTime(end)}`;
	if (end < now) return { key: "promise", icon: Flag, text: `${text} · a trecut`, tone: "danger" };
	if (away === 0 && Date.parse(end) - Date.parse(now) <= 3 * 3600000) return { key: "promise", icon: Flag, text: `${text} · mai sunt ${sinceWords(now, end)}`, tone: "warning" };
	return { key: "promise", icon: Flag, text };
}

/** "537 lei din 915 lei", with the share paid for its bar. `paid`, `total` in bani. */
function paidLine(paid, total, currency) {
	return { key: "paid", bar: total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0, text: `${formatMoney(paid, currency, { decimals: 0 })} din ${formatMoney(total, currency, { decimals: 0 })}` };
}

/** Each booking's warnings, against every booking of its day, as the calendar finds them (light: no fixes). */
export function alertsFor({ appointments, staff, settings, now }) {
	const byDay = new Map();
	for (const a of Object.values(appointments ?? {})) {
		if (a.status === "cancelled") continue;
		const day = dayOfInstant(a.start);
		if (!byDay.has(day)) byDay.set(day, []);
		byDay.get(day).push(a);
	}
	const active = selectActive(staff ?? {});
	return (appointment, order = null) =>
		appointment && now ? bookingAlert(appointment, { now, order, sameDay: byDay.get(dayOfInstant(appointment.start)) ?? [], staff: active, hours: settings?.hours ?? null }) : null;
}

/** When a booking last changed status (its check-in counts), else when it was made. */
function lastChange(appointment) {
	const list = appointment.activity ?? [];
	for (let i = list.length - 1; i >= 0; i -= 1) if (list[i].type === "status" || list[i].type === "checked_in") return list[i].at;
	return appointment.createdAt ?? null;
}

const BOOKING_WAITS = { scheduled: "Așteaptă confirmarea clientului", confirmed: "Așteaptă mașina", arrived: "Mașina e în service", done: "Vizita s-a încheiat", no_show: "Clientul nu s-a prezentat" };

/** A booking card's extra lines. `past`: its time passed with nothing recorded. */
export function bookingExtras(appointment, { now, past = false, alert = null }) {
	const out = [{ key: "waits", icon: Hourglass, text: past ? "Mașina n-a venit" : BOOKING_WAITS[appointment.status], tone: "wait" }];
	const since = lastChange(appointment);
	if (since && now) out.push({ key: "since", icon: Clock, text: `${APPOINTMENT_STATUS[appointment.status].label} de ${sinceWords(since, now)}` });
	const warning = attention(alert, ["unconfirmed", "late", "missed"]);
	if (warning) out.push(warning);
	return out.filter((x) => x.text);
}

/** A Deviz's or a Lucrare's extra lines. `invoice` is its live invoice with its flow ({ state, paid, total }), if issued. */
export function orderExtras(order, { now, today, appointment = null, mechanic = null, alert = null, invoice = null, currency }) {
	const waits = {
		estimate: "Așteaptă aprobarea clientului",
		approved: "Aprobat: se poate începe lucrul",
		in_progress: mechanic ? `${firstName(mechanic.name)} lucrează la ea` : "În lucru, fără mecanic",
		waiting_parts: "Așteaptă piesele",
		ready: "Așteaptă să fie ridicată",
		delivered: invoice ? null : "Predată, încă nefacturată",
	}[order.status];
	const out = [];
	if (waits) out.push({ key: "waits", icon: Hourglass, text: waits, tone: "wait" });
	const since = order.dates?.[order.status] ?? order.createdAt;
	if (since && now && WORK_ORDER_STATUS[order.status]) out.push({ key: "since", icon: Clock, text: `${WORK_ORDER_STATUS[order.status].label} de ${sinceWords(since, now)}` });
	if (appointment?.end && now && today && ["estimate", "approved", "in_progress", "waiting_parts"].includes(order.status)) out.push(promise(appointment.end, { now, today }));
	const warning = attention(alert, ["estimate", "parts", "unconfirmed", "late", "missed"]);
	if (warning) out.push(warning);
	if (invoice && invoice.state !== "draft") out.push(paidLine(invoice.paid, invoice.total, currency));
	return out;
}

const INVOICE_WAITS = { draft: "Așteaptă să fie emisă", issued: "Așteaptă plata", overdue: "Plata a întârziat", partial: "Așteaptă restul plății" };

/** An invoice card's extra lines, from its item in invoicesToCollect ({ invoice, state, paid, total }). */
export function invoiceExtras({ invoice, state, paid, total }, { now, today, currency }) {
	const out = [{ key: "waits", icon: Hourglass, text: INVOICE_WAITS[state], tone: state === "overdue" ? "danger" : "wait" }];
	if (state === "draft") {
		if (invoice.createdAt && now) out.push({ key: "since", icon: Clock, text: `${INVOICE_STATE.draft.label} de ${sinceWords(invoice.createdAt, now)}` });
	} else if (invoice.issueDate && today) {
		const days = diffDaysISO(invoice.issueDate, today);
		out.push({ key: "since", icon: Clock, text: days < 1 ? "Emisă azi" : `Emisă de ${plural(days, "zi", "zile")}` });
		out.push(paidLine(paid, total, currency));
	}
	return out.filter((x) => x.text);
}

/**
 * The records of the visit that came before the card's own, oldest first, for the stack behind it: the booking,
 * the Deviz (passed over when the job opened straight in progress), the Lucrare.
 *   [{ key: "appointment" | "estimate" | "job", skipped }]
 */
export function behindOf(kind, { appointment = null, order = null }) {
	if (kind === "appointment" || !order) return [];
	const out = appointment ? [{ key: "appointment", skipped: false }] : [];
	if (kind === "estimate") return out;
	out.push({ key: "estimate", skipped: !order.dates?.estimate && !order.dates?.approved });
	const started = order.status === "cancelled" ? Boolean(order.dates?.in_progress) : !["estimate", "approved"].includes(order.status);
	if (kind === "invoice" && started) out.push({ key: "job", skipped: false });
	return out;
}
