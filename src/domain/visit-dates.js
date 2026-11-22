import { DomainError } from "./errors.js";
import { appendJobLog } from "./job-log.js";

// A visit's dates, in the order they happen: booked, arrived, promised, ready, delivered. The booking keeps its own
// slot; the job keeps what really happened (`receivedAt`, `dates.ready`, `dates.delivered`) and what the client was
// promised (`promisedAt`, which starts from the end of the booking).

const FINISHED = ["ready", "delivered"];
const NO_DATES = ["cancelled", "declined"];
const JOB_FIELDS = ["arrived", "promised", "ready", "delivered"];
const ON_TIME_MINUTES = 15;

/** Everything known about when a visit happens. A job sent back to work no longer counts its old "ready". */
export function visitDates({ appointment = null, order = null }) {
	const arrived = !order || order.receivedAt === null ? null : (order.receivedAt ?? order.createdAt ?? null);
	return {
		booked: appointment ? { start: appointment.start, end: appointment.end } : null,
		arrived,
		promised: order?.promisedAt ?? appointment?.end ?? null,
		ready: FINISHED.includes(order?.status) ? (order.dates?.ready ?? null) : null,
		delivered: order?.status === "delivered" ? (order.dates?.delivered ?? null) : null,
	};
}

/** Which of a job's dates can be corrected: the promise always, the others once they happened. */
export function editableJobDates(order, appointment = null) {
	if (!order || NO_DATES.includes(order.status)) return [];
	const dates = visitDates({ order, appointment });
	return JOB_FIELDS.filter((field) => field === "promised" || dates[field]);
}

/** How a real moment compares with the planned one: on time within 15 minutes, otherwise late or early by `minutes`. */
export function dateDelta(actual, planned) {
	if (!actual || !planned) return null;
	const minutes = Math.round((Date.parse(actual) - Date.parse(planned)) / 60_000);
	if (Math.abs(minutes) <= ON_TIME_MINUTES) return { kind: "on_time", minutes: 0 };
	return { kind: minutes > 0 ? "late" : "early", minutes: Math.abs(minutes) };
}

const before = (a, b) => Boolean(a && b) && Date.parse(a) > Date.parse(b);

/** Corrects a job's dates. What happened cannot be in the future or out of order; each change goes in the job's log. */
export function setJobDates(order, patch, { now, by = null, appointment = null }) {
	const editable = editableJobDates(order, appointment);
	for (const [field, at] of Object.entries(patch)) {
		if (!editable.includes(field)) throw new DomainError("locked", "Această dată nu se poate modifica.");
		if (!at || Number.isNaN(Date.parse(at))) throw new DomainError("invalid", "Alege o dată și o oră.");
	}
	const was = visitDates({ order, appointment });
	const dates = { ...was, ...patch };
	for (const field of ["arrived", "ready", "delivered"]) {
		if (patch[field] && Date.parse(patch[field]) > Date.parse(now)) throw new DomainError("invalid", "O dată care s-a întâmplat nu poate fi în viitor.");
	}
	// Only what this edit touches is checked: a late arrival past the booking's end must not block fixing another date.
	const touches = (...fields) => fields.some((field) => field in patch);
	if (touches("arrived", "ready") && before(dates.arrived, dates.ready)) throw new DomainError("invalid", "Mașina nu poate fi gata înainte să intre.");
	if (touches("ready", "delivered") && before(dates.ready, dates.delivered)) throw new DomainError("invalid", "Mașina nu poate fi predată înainte să fie gata.");
	if (touches("arrived", "delivered") && before(dates.arrived, dates.delivered)) throw new DomainError("invalid", "Mașina nu poate fi predată înainte să intre.");
	if (touches("promised") && before(dates.arrived, dates.promised)) throw new DomainError("invalid", "Termenul nu poate fi înainte de intrarea mașinii.");

	const changed = Object.keys(patch).filter((field) => Date.parse(patch[field]) !== Date.parse(was[field] ?? ""));
	if (!changed.length) return order;
	const next = {
		...order,
		...(changed.includes("arrived") ? { receivedAt: patch.arrived } : null),
		...(changed.includes("promised") ? { promisedAt: patch.promised } : null),
		dates: {
			...order.dates,
			...(changed.includes("ready") ? { ready: patch.ready } : null),
			...(changed.includes("delivered") ? { delivered: patch.delivered } : null),
		},
		updatedAt: now,
	};
	return appendJobLog(next, changed.map((field) => ({ type: "date_changed", field, from: was[field] ?? null, to: patch[field] })), { now, by });
}
