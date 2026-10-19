// Toate programările (docs/APPOINTMENTS-AND-NAV.md D6–D10): what the list shows, how it is
// searched, filtered, sorted and grouped, and its four numbers. Pure; the page calls these.

import { addDaysISO, dayOfInstant, minutesBetween, monthKey, parseISODate } from "./dates.js";
import { bookingsToConfirm } from "./agenda.js";
import { periodWindow, showRate } from "./analytics.js";
import { fold, matchesTokens } from "./search.js";
import { formatPlate, normalizePlate, vehicleName } from "./vehicle.js";

/**
 * The status chips. "to-confirm" is Azi's rule (agenda.js: unconfirmed in the next seven days,
 * plus the ones whose time passed with nothing recorded), so the chip, the sidebar's count and
 * Azi's section always agree; it carries its own window and ignores the period.
 */
export const STATUS_FILTERS = ["all", "to-confirm", "confirmed", "arrived", "done", "no_show", "cancelled"];

/** The periods; "custom" takes { from, to }. */
export const PERIODS = ["upcoming", "today", "next7", "week", "month", "past", "all", "custom"];

/** A period's days, both included; null on a side means open. Monday starts the week. */
export function periodRange(period, today, custom = {}) {
	if (period === "today") return { from: today, to: today };
	if (period === "next7") return { from: today, to: addDaysISO(today, 6) };
	if (period === "week") {
		const monday = addDaysISO(today, -((parseISODate(today).getDay() + 6) % 7));
		return { from: monday, to: addDaysISO(monday, 6) };
	}
	if (period === "month") {
		const first = `${monthKey(today)}-01`;
		const next = parseISODate(first);
		next.setMonth(next.getMonth() + 1, 0);
		return { from: first, to: `${monthKey(today)}-${String(next.getDate()).padStart(2, "0")}` };
	}
	if (period === "past") return { from: null, to: addDaysISO(today, -1) };
	if (period === "upcoming") return { from: today, to: null };
	if (period === "custom") return { from: custom.from || null, to: custom.to || null };
	return { from: null, to: null };
}

const inRange = (day, { from, to }) => (!from || day >= from) && (!to || day <= to);

/** Everything a booking can be found by: its number, customer and phone, plate (with or without spaces), car, operations, title and notes. */
export function appointmentHay(appointment, { customers, vehicles, services }) {
	const customer = customers[appointment.customerId];
	const vehicle = vehicles[appointment.vehicleId];
	const operations = appointment.operations?.length ? appointment.operations.map((op) => op.name) : (appointment.serviceIds ?? []).map((id) => services?.[id]?.name);
	return fold(
		[
			appointment.number != null ? `#${appointment.number} ${appointment.number}` : "",
			customer?.name,
			customer?.phone,
			customer?.phone?.replace(/\D/g, ""),
			vehicle?.plate && formatPlate(vehicle.plate),
			vehicle?.plate && normalizePlate(vehicle.plate),
			vehicleName(vehicle),
			...operations,
			appointment.title,
			appointment.notes,
		]
			.filter(Boolean)
			.join(" "),
	);
}

const byStart = (a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0);

/** The order of the list: by time (soonest first; latest first for past bookings), by creation (newest first), or by customer. */
export function sortAppointments(list, sort, { period, customers }) {
	const sorted = [...list];
	if (sort === "created") return sorted.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
	if (sort === "customer") return sorted.sort((a, b) => (customers[a.customerId]?.name ?? "").localeCompare(customers[b.customerId]?.name ?? "", "ro") || byStart(a, b));
	sorted.sort(byStart);
	return period === "past" ? sorted.reverse() : sorted;
}

/**
 * The list: `appointments` filtered by status, period, mechanic and the search tokens (already
 * folded, from search.js `queryTokens`), and sorted. `counts` has a number per status chip, for
 * the period and mechanic chosen (not the search).
 *   options: { status, period, custom, staff ("all" | id | "none"), tokens, sort, today, now, lookups }
 */
export function listAppointments(appointments, { status = "all", period = "upcoming", custom, staff = "all", tokens = [], sort = "time", today, now, lookups }) {
	const range = periodRange(period, today, custom);
	const toConfirm = new Set(bookingsToConfirm(appointments, { now }).groups.flatMap((group) => group.items.map((a) => a.id)));
	const counts = Object.fromEntries(STATUS_FILTERS.map((key) => [key, 0]));
	const ofStaff = (a) => staff === "all" || (staff === "none" ? !a.staffId : a.staffId === staff);
	const rows = [];
	for (const appointment of appointments) {
		if (!ofStaff(appointment)) continue;
		const waiting = toConfirm.has(appointment.id);
		if (waiting) counts["to-confirm"] += 1;
		const inPeriod = inRange(dayOfInstant(appointment.start), range);
		if (inPeriod) {
			counts.all += appointment.status === "cancelled" ? 0 : 1;
			if (appointment.status in counts) counts[appointment.status] += 1;
		}
		// "Toate" leaves the cancelled ones out (they have their own chip); "De confirmat" has its own window.
		const kept = status === "to-confirm" ? waiting : inPeriod && (status === "all" ? appointment.status !== "cancelled" : appointment.status === status);
		if (!kept) continue;
		if (tokens.length && !matchesTokens(appointmentHay(appointment, lookups), tokens)) continue;
		rows.push(appointment);
	}
	return { rows: sortAppointments(rows, sort, { period: status === "to-confirm" ? "upcoming" : period, customers: lookups.customers }), counts };
}

/** Rows grouped by their local day, in the order given; each group with its booked minutes (cancelled and no-shows aside). */
export function groupByDay(rows) {
	const groups = [];
	for (const appointment of rows) {
		const day = dayOfInstant(appointment.start);
		let group = groups.at(-1);
		if (!group || group.day !== day) {
			group = { day, items: [], minutes: 0 };
			groups.push(group);
		}
		group.items.push(appointment);
		if (appointment.status !== "cancelled" && appointment.status !== "no_show") group.minutes += minutesBetween(appointment.start, appointment.end);
	}
	return groups;
}

/**
 * The four numbers on top (D7):
 *   today      today's bookings (cancelled aside) and the next one still to come
 *   toConfirm  Azi's "De confirmat"
 *   noShow     no-shows out of the decided bookings of the last 30 days (null with none decided)
 *   load       this week's booked minutes against the mechanics' open minutes (Monday to Sunday)
 * `staff` is the active mechanics; `hours` the shop's { open, close, days }.
 */
export function appointmentStats(appointments, { today, now, staff, hours }) {
	const todays = appointments.filter((a) => a.status !== "cancelled" && dayOfInstant(a.start) === today).sort(byStart);
	const next = todays.find((a) => (a.status === "scheduled" || a.status === "confirmed") && a.start > now) ?? null;
	const rate = showRate(appointments, periodWindow(today, "30d")).value;
	const week = periodRange("week", today);
	let booked = 0;
	for (const a of appointments) {
		if (a.status === "cancelled" || a.status === "no_show" || !inRange(dayOfInstant(a.start), week)) continue;
		booked += minutesBetween(a.start, a.end);
	}
	const [openH, openM] = hours.open.split(":").map(Number);
	const [closeH, closeM] = hours.close.split(":").map(Number);
	let openDays = 0;
	for (let i = 0; i < 7; i++) if (hours.days.includes(parseISODate(addDaysISO(week.from, i)).getDay())) openDays += 1;
	const capacity = Math.max(0, closeH * 60 + closeM - (openH * 60 + openM)) * openDays * Math.max(staff.length, 1);
	return {
		today: { count: todays.length, next },
		toConfirm: bookingsToConfirm(appointments, { now }).total,
		noShow: rate == null ? null : 1 - rate,
		load: { booked, capacity, share: capacity ? booked / capacity : null },
	};
}

/**
 * A mechanic at a glance (the card shown on their avatar in the calendar): on `day`, their
 * bookings (cancelled and no-shows aside), the time booked and its share of the open hours;
 * the week of `day` (Monday to Sunday); and the open jobs they are on, latest first.
 * `hours` is the shop's { open, close, days }.
 */
export function mechanicSummary(staffId, { appointments, workOrders, day, hours, openStatuses }) {
	const counts = (a) => a.staffId === staffId && a.status !== "cancelled" && a.status !== "no_show";
	const ofDay = appointments.filter((a) => counts(a) && dayOfInstant(a.start) === day);
	const minutes = ofDay.reduce((sum, a) => sum + minutesBetween(a.start, a.end), 0);
	const [openH, openM] = hours.open.split(":").map(Number);
	const [closeH, closeM] = hours.close.split(":").map(Number);
	const open = hours.days.includes(parseISODate(day).getDay()) ? Math.max(0, closeH * 60 + closeM - (openH * 60 + openM)) : 0;
	const week = periodRange("week", day);
	const weekCount = appointments.filter((a) => counts(a) && inRange(dayOfInstant(a.start), week)).length;
	const jobs = workOrders.filter((o) => o.staffId === staffId && openStatuses.includes(o.status)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
	return { day: { count: ofDay.length, minutes, share: open ? minutes / open : null, open: open > 0 }, weekCount, jobs };
}
