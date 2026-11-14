// A record's state as it is drawn (docs/RECORD-COLORS.md): the domain's signal (src/domain/record-state.js) with
// its tone and the icon in its dot. "active" takes the kind's own colour; the others are the signal colours.

import { appointmentSignal, invoiceSignal, orderKind, orderSignal } from "@/domain/record-state";
import { RECORD_KIND, STATE_ICON } from "@/lib/labels";

const SIGNAL_TONE = { danger: "red", warning: "yellow", success: "green", neutral: "neutral" };

/** A signal of a record of `kind`, ready for StateDot / StateTag: { key, signal, text, detail, kind, tone, icon }. */
export function stateLook(kind, signal) {
	return { ...signal, kind, tone: signal.signal === "active" ? RECORD_KIND[kind].tone : SIGNAL_TONE[signal.signal], icon: STATE_ICON[signal.key] };
}

/** A booking's state. `now`: an ISO instant. */
export const bookingLook = (appointment, now) => stateLook("appointment", appointmentSignal(appointment, { now }));

/** A work order's state, as a Deviz or a Lucrare. `appointment`: its booking (the deadline), if any. */
export const orderLook = (order, { today, appointment = null }) => stateLook(orderKind(order), orderSignal(order, { today, appointment }));

/** An invoice's state. `payments`: its payments. */
export const invoiceLook = (invoice, payments, { today, currency }) => stateLook("invoice", invoiceSignal(invoice, payments, { today, currency }));

/** A booking where it stands for its visit (the calendar): its job's state once it became one, else its own. */
export const visitLook = (appointment, order, { now, today }) => (order ? orderLook(order, { today, appointment }) : bookingLook(appointment, now));

/** A work order's kind ("estimate" or "job"), for its colour. */
export { orderKind };
