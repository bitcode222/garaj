// What kind a record is and how it stands (docs/RECORD-COLORS.md §3–§4): the kind gives a record its
// colour, the signal gives its state dot. A signal is
//   { key, signal, text, detail }
// `signal`: "danger" (late, missed, overdue) · "warning" (waiting on someone, due) · "success" (agreed,
// ready, paid) · "active" (under way, nothing to flag) · "neutral" (not started or closed). `key` names the
// state (its icon is chosen by it); `text` is the few words beside the dot; `detail`, one sentence more.
// The first rule that matches wins; days are counted on "YYYY-MM-DD" strings, never milliseconds.

import { jobDeadline } from "./agenda.js";
import { dayOfInstant, diffDaysISO } from "./dates.js";
import { invoiceBalance, invoiceState } from "./invoice.js";
import { formatMoney } from "./money.js";
import { arrivalDelay } from "./visit.js";

/** "1 zi", "3 zile", "20 de zile". */
const days = (n) => (n === 1 ? "1 zi" : `${n} ${n % 100 >= 1 && n % 100 <= 19 ? "zile" : "de zile"}`);

/** "45 min", "2 h", "1 h 15 min". */
function length(minutes) {
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return hours ? `${hours} h${rest ? ` ${rest} min` : ""}` : `${rest} min`;
}

/** Whole days from an instant to today (0 when it is today, or missing). */
const daysSince = (instant, today) => (instant ? Math.max(0, diffDaysISO(dayOfInstant(instant), today)) : 0);

/** The stages a work order is a Deviz in; from "in_progress" on it is a Lucrare. */
export const ESTIMATE_KIND_STAGES = ["estimate", "approved"];

/**
 * Whether a work order is a Deviz ("estimate") or a Lucrare ("job"): by its stage. A cancelled one stays what it
 * was when it was cancelled: a Lucrare if it was ever started.
 */
export function orderKind(order) {
	if (ESTIMATE_KIND_STAGES.includes(order.status)) return "estimate";
	if (order.status === "cancelled") return order.dates?.in_progress ? "job" : "estimate";
	return "job";
}

/** A booking: its stored status, then the clock (missed, late). `now` is an ISO instant. */
export function appointmentSignal(appointment, { now, grace = 15 }) {
	const status = appointment.status;
	if (status === "cancelled") return { key: "cancelled", signal: "neutral", text: "Anulată", detail: "Programarea a fost anulată." };
	if (status === "no_show") return { key: "no_show", signal: "danger", text: "Neprezentat", detail: "Clientul nu a venit." };
	if (status === "done") return { key: "done", signal: "neutral", text: "Finalizată", detail: "Vizita s-a încheiat." };
	if (status === "arrived") return { key: "arrived", signal: "active", text: "Sosit", detail: "Mașina e în service." };
	const today = dayOfInstant(now);
	if (dayOfInstant(appointment.start) < today)
		return { key: "missed", signal: "danger", text: "Nu a sosit", detail: "Ziua a trecut și nu s-a notat nimic: a sosit sau nu s-a prezentat?" };
	const late = arrivalDelay(appointment, now, grace);
	if (late > 0) return { key: "late", signal: "danger", text: `Întârzie ${length(late)}`, detail: status === "confirmed" ? "Confirmată, dar mașina nu a sosit." : "Neconfirmată, iar mașina nu a sosit." };
	if (status === "scheduled") return { key: "to_confirm", signal: "warning", text: "De confirmat", detail: "Clientul nu a confirmat încă." };
	return { key: "confirmed", signal: "success", text: "Confirmată", detail: "Clientul a confirmat." };
}

/**
 * A work order, as a Deviz or as a Lucrare (orderKind): its stage, then the clock. `appointment` is its booking, if
 * any: its end day is the deadline (jobDeadline); a walk-in has none.
 */
export function orderSignal(order, { today, appointment = null }) {
	const kind = orderKind(order);
	const estimate = kind === "estimate";
	const status = order.status;
	if (status === "cancelled") return { key: "cancelled", signal: "neutral", text: estimate ? "Anulat" : "Anulată", detail: estimate ? "Devizul a fost anulat." : "Lucrarea a fost anulată." };
	if (status === "delivered") return { key: "delivered", signal: "neutral", text: "Predată", detail: "Mașina a fost predată clientului." };
	const deadline = jobDeadline(order, appointment);
	if (deadline && deadline < today) {
		const late = diffDaysISO(deadline, today);
		return { key: "overdue", signal: "danger", text: `${estimate ? "Întârziat" : "Întârziată"} cu ${days(late)}`, detail: `Termenul (sfârșitul programării) a trecut acum ${days(late)}.` };
	}
	const since = daysSince(order.dates?.[status] ?? order.createdAt, today);
	if (status === "estimate") return { key: "awaiting_approval", signal: "warning", text: "De aprobat", detail: since ? `Așteaptă aprobarea clientului de ${days(since)}.` : "Așteaptă aprobarea clientului." };
	if (status === "approved") return { key: "approved", signal: "success", text: "Aprobat", detail: "Clientul a aprobat devizul; lucrul poate începe." };
	if (status === "waiting_parts") {
		if (since >= 3) return { key: "parts_late", signal: "danger", text: `Piese de ${days(since)}`, detail: `Așteaptă piesele de ${days(since)}.` };
		return { key: "waiting_parts", signal: "warning", text: "Așteaptă piese", detail: since ? `Așteaptă piesele de ${days(since)}.` : "Așteaptă piesele de azi." };
	}
	if (status === "ready") {
		if (since >= 2) return { key: "not_collected", signal: "warning", text: `Neridicată de ${days(since)}`, detail: `Gata de ${days(since)}; clientul nu a ridicat-o.` };
		return { key: "ready", signal: "success", text: "Gata", detail: "Gata de predare." };
	}
	const inShop = daysSince(order.createdAt, today);
	return { key: "in_progress", signal: "active", text: "În lucru", detail: inShop ? `În service de ${days(inShop)}.` : "Primită azi." };
}

/** An invoice: what is paid and when it is due. `currency` writes the remainder in the detail. */
export function invoiceSignal(invoice, payments, { today, currency = "RON" }) {
	const state = invoiceState(invoice, payments, today);
	if (state === "draft") return { key: "draft", signal: "neutral", text: "Ciornă", detail: "Neemisă încă." };
	if (state === "cancelled") return { key: "stornoed", signal: "neutral", text: "Stornată", detail: "Anulată printr-o factură de stornare." };
	if (state === "storno") return { key: "storno", signal: "neutral", text: "Stornare", detail: "Anulează o factură emisă." };
	if (state === "paid") return { key: "paid", signal: "success", text: "Plătită", detail: "Încasată integral." };
	const rest = `Rest de plată ${formatMoney(invoiceBalance(invoice, payments), currency)}`;
	if (state === "overdue") {
		const late = diffDaysISO(invoice.dueDate, today);
		return { key: "overdue", signal: "danger", text: `Restantă de ${days(late)}`, detail: `${rest}; scadența a trecut acum ${days(late)}.` };
	}
	const due = invoice.dueDate ? diffDaysISO(today, invoice.dueDate) : null;
	const when = due == null ? null : due === 0 ? "Scadentă azi" : due === 1 ? "Scadentă mâine" : `Scadentă în ${days(due)}`;
	if (state === "partial") return { key: "partial", signal: "warning", text: "Parțial plătită", detail: when ? `${rest}; ${when.toLowerCase()}.` : `${rest}.` };
	return { key: "due", signal: "warning", text: when ?? "De plată", detail: when ? `${rest}.` : `${rest}; fără scadență.` };
}
