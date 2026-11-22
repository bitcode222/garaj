import { normalizePhone } from "./customer.js";

// The storefront's booking rules (docs/STOREFRONT.md). Pure, shared by the Cloudflare Worker and the shop's app.

export const SHOP_TIME_ZONE = "Europe/Bucharest";
export const LEAD_MINUTES = 120;
export const HORIZON_DAYS = 60;
export const STEP_MINUTES = 30;
export const MAX_OPEN_BOOKINGS = 3;
export const CANCEL_CONFIRMED_BEFORE_MINUTES = 120;
export const OPEN_ONLINE = ["requested", "confirmed"];

const MINUTE = 60_000;
const parts = new Map();

function zoneParts(ms, zone) {
	if (!parts.has(zone)) parts.set(zone, new Intl.DateTimeFormat("en-CA", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
	const found = Object.fromEntries(parts.get(zone).formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
	return { day: `${found.year}-${found.month}-${found.day}`, minute: Number(found.hour) * 60 + Number(found.minute), second: Number(found.second) };
}

const offsetAt = (ms, zone) => {
	const local = zoneParts(ms, zone);
	const [year, month, day] = local.day.split("-").map(Number);
	return Date.UTC(year, month - 1, day, Math.floor(local.minute / 60), local.minute % 60, local.second) - Math.floor(ms / 1000) * 1000;
};

/** The day it is in the shop's time zone at an instant. */
export const shopDay = (iso, zone = SHOP_TIME_ZONE) => zoneParts(Date.parse(iso), zone).day;

/** The instant of a wall-clock minute in the shop's time zone; null for a time skipped by the clock change. */
export function shopInstant(day, minute, zone = SHOP_TIME_ZONE) {
	const [year, month, date] = day.split("-").map(Number);
	const wall = Date.UTC(year, month - 1, date, Math.floor(minute / 60), minute % 60);
	let at = wall - offsetAt(wall, zone);
	at = wall - offsetAt(at, zone);
	const back = zoneParts(at, zone);
	return back.day === day && back.minute === minute ? new Date(at).toISOString() : null;
}

const toMinutes = (time) => {
	const [hour, minute] = String(time).split(":").map(Number);
	return hour * 60 + (minute || 0);
};
const weekday = (day) => {
	const [year, month, date] = day.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, date)).getUTCDay();
};
const addDays = (day, count) => {
	const [year, month, date] = day.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
};

/** How long the chosen services take, in whole half hours. */
export function bookingMinutes(services) {
	const minutes = services.reduce((sum, service) => sum + (Number(service.minutes) || 0), 0);
	return Math.max(STEP_MINUTES, Math.ceil(minutes / STEP_MINUTES) * STEP_MINUTES);
}

/** The most blocks running at one moment inside [start, end). */
export function peakLoad(blocks, start, end) {
	const edges = [];
	for (const block of blocks) {
		if (block.start >= end || block.end <= start) continue;
		edges.push([block.start < start ? start : block.start, 1], [block.end, -1]);
	}
	edges.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
	let load = 0;
	let peak = 0;
	for (const [, change] of edges) {
		load += change;
		peak = Math.max(peak, load);
	}
	return peak;
}

/** The times a job of `minutes` can start on `day`: inside opening hours, ahead of the notice, with a lift free throughout. */
export function openSlots({ day, hours, minutes, blocks = [], capacity = 1, now, zone = SHOP_TIME_ZONE }) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !hours?.days?.includes(weekday(day))) return [];
	const today = shopDay(now, zone);
	if (day < today || day > addDays(today, HORIZON_DAYS)) return [];
	const earliest = new Date(Date.parse(now) + LEAD_MINUTES * MINUTE).toISOString();
	const close = toMinutes(hours.close);
	const slots = [];
	for (let at = toMinutes(hours.open); at + minutes <= close; at += STEP_MINUTES) {
		const start = shopInstant(day, at, zone);
		const finish = shopInstant(day, at + minutes, zone);
		if (!start || !finish || start < earliest) continue;
		if (peakLoad(blocks, start, finish) < Math.max(1, capacity)) slots.push({ start, end: finish });
	}
	return slots;
}

/** A Romanian mobile number as +407XXXXXXXX, or null. */
export function customerPhone(raw) {
	const phone = normalizePhone(String(raw ?? ""));
	return /^\+407\d{8}$/.test(phone) ? phone : null;
}

/** Whether the customer can still cancel online; a confirmed visit too close to its start needs a phone call. */
export function canCustomerCancel(booking, now) {
	if (!OPEN_ONLINE.includes(booking.status) || booking.start <= now) return false;
	if (booking.status === "requested") return true;
	return Date.parse(booking.start) - Date.parse(now) >= CANCEL_CONFIRMED_BEFORE_MINUTES * MINUTE;
}

/** What the customer sees: a request nobody answered before its time has expired. */
export const customerStatus = (booking, now) => (booking.status === "requested" && booking.start <= now ? "expired" : booking.status);

/** A booking's state online, from the shop's own appointment. */
export function onlineStatusOf(appointment) {
	return { scheduled: "requested", confirmed: "confirmed", arrived: "in_shop", done: "done", cancelled: "declined", no_show: "no_show" }[appointment.status] ?? "requested";
}
