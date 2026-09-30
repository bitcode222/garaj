// Date-only values (ITP expiry, invoice date) are "YYYY-MM-DD" strings in local
// time. They never go through toISOString(), which would shift them by the UTC
// offset (a date picked as 1 Oct in Bucharest would become 30 Sep).

export const pad2 = (n) => String(n).padStart(2, "0");

export function toISODate(date) {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayISO(now = new Date()) {
	return toISODate(now);
}

export function isISODate(s) {
	if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	const d = parseISODate(s);
	return toISODate(d) === s;
}

/** "2026-09-30" → Date at local midnight. */
export function parseISODate(s) {
	const [y, m, d] = s.split("-").map(Number);
	return new Date(y, m - 1, d);
}

export function addDaysISO(s, days) {
	const d = parseISODate(s);
	d.setDate(d.getDate() + days);
	return toISODate(d);
}

/** Adds months and clamps to the end of the month (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsISO(s, months) {
	const [y, m, d] = s.split("-").map(Number);
	const target = new Date(y, m - 1 + months, 1);
	const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
	target.setDate(Math.min(d, last));
	return toISODate(target);
}

/** Calendar days from `a` to `b` (b − a), immune to DST. */
export function diffDaysISO(a, b) {
	const [ay, am, ad] = a.split("-").map(Number);
	const [by, bm, bd] = b.split("-").map(Number);
	return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export const monthKey = (iso) => iso.slice(0, 7);

/** Local calendar day of an ISO instant ("2026-09-30T21:30:00.000Z" in RO → "2026-10-01"). */
export function dayOfInstant(instant) {
	return toISODate(new Date(instant));
}

/** Minutes between two ISO instants. */
export function minutesBetween(startISO, endISO) {
	return Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60_000);
}

/** "2026-09-30" + "14:30" (local) → ISO instant. */
export function combineDateTime(dateISO, time) {
	const d = parseISODate(dateISO);
	const [h, m] = String(time).split(":").map(Number);
	d.setHours(h || 0, m || 0, 0, 0);
	return d.toISOString();
}

/** ISO instant → "14:30" local. */
export function timeOfInstant(instant) {
	const d = new Date(instant);
	return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
