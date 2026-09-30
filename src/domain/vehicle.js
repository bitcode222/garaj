import { addMonthsISO, diffDaysISO } from "./dates.js";

/** Search key for a plate: "b-123 abc" → "B123ABC". */
export function normalizePlate(input) {
	return String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Romanian plate display: "B123ABC" → "B 123 ABC", "CJ12XYZ" → "CJ 12 XYZ". */
export function formatPlate(input) {
	const n = normalizePlate(input);
	const m =
		n.match(/^(B)(\d{2,3})([A-Z]{3})$/) ??
		n.match(/^([A-Z]{2})(\d{2})([A-Z]{3})$/) ??
		n.match(/^([A-Z]{1,2})(\d{3,6})$/);
	if (m) return m.slice(1).join(" ");
	return String(input ?? "").toUpperCase().trim().replace(/\s+/g, " ");
}

/** Soft VIN validation: returns a message, or null when the VIN looks right (or is empty). */
export function vinIssue(input) {
	const v = String(input ?? "").toUpperCase().replace(/\s/g, "");
	if (!v) return null;
	if (v.length !== 17) return `VIN-ul are ${v.length} caractere (trebuie 17).`;
	if (/[IOQ]/.test(v)) return "VIN-ul nu conține literele I, O sau Q.";
	if (!/^[A-Z0-9]{17}$/.test(v)) return "VIN-ul conține caractere nepermise.";
	return null;
}

export function lastReading(vehicle) {
	const log = vehicle?.mileage ?? [];
	return log.length ? log[log.length - 1] : null;
}

/**
 * Adds an odometer reading, keeping the log sorted by date.
 * A reading lower than the previous one is allowed (replaced cluster, typo
 * fixed later) but reported back as a warning.
 */
export function addReading(vehicle, { date, km, source = "manual" }) {
	const reading = { date, km: Math.round(Number(km)), source };
	const log = [...(vehicle.mileage ?? []), reading].sort((a, b) =>
		a.date === b.date ? 0 : a.date < b.date ? -1 : 1,
	);
	const index = log.indexOf(reading);
	const previous = index > 0 ? log[index - 1] : null;
	const warning =
		previous && reading.km < previous.km
			? `Kilometrajul (${reading.km.toLocaleString("ro-RO")} km) e mai mic decât citirea din ${previous.date} (${previous.km.toLocaleString("ro-RO")} km).`
			: null;
	return { vehicle: { ...vehicle, mileage: log }, warning };
}

const DEFAULT_KM_PER_DAY = 40; // ≈ 15 000 km / year

/** Average km per day over the log; null when there isn't at least a month of data. */
export function kmPerDay(log) {
	if (!log || log.length < 2) return null;
	const first = log[0];
	const last = log[log.length - 1];
	const days = diffDaysISO(first.date, last.date);
	if (days < 30 || last.km <= first.km) return null;
	return (last.km - first.km) / days;
}

export function estimateKm(vehicle, today) {
	const last = lastReading(vehicle);
	if (!last) return null;
	const perDay = kmPerDay(vehicle.mileage) ?? DEFAULT_KM_PER_DAY;
	return Math.round(last.km + perDay * Math.max(0, diffDaysISO(last.date, today)));
}

/** Status of a deadline: ok · soon (≤ soonDays) · expired · unknown. */
export function deadline(dateISO, today, soonDays = 30) {
	if (!dateISO) return { status: "unknown", days: null };
	const days = diffDaysISO(today, dateISO);
	return { status: days < 0 ? "expired" : days <= soonDays ? "soon" : "ok", days };
}

const RANK = { unknown: -1, ok: 0, soon: 1, expired: 2 };

/**
 * Next service is due at last service + interval (months) or + interval (km),
 * whichever comes first. Km is estimated from the driving pattern.
 */
export function serviceDue(vehicle, today, defaults = { km: 15000, months: 12 }) {
	if (!vehicle?.lastServiceDate) return { status: "unknown" };
	const intervalKm = vehicle.serviceIntervalKm || defaults.km;
	const intervalMonths = vehicle.serviceIntervalMonths || defaults.months;
	const dueDate = addMonthsISO(vehicle.lastServiceDate, intervalMonths);
	const byDate = deadline(dueDate, today, 30);
	const dueKm = vehicle.lastServiceKm != null ? vehicle.lastServiceKm + intervalKm : null;
	const estKm = estimateKm(vehicle, today);
	const kmLeft = dueKm != null && estKm != null ? dueKm - estKm : null;
	const byKm = kmLeft == null ? "unknown" : kmLeft < 0 ? "expired" : kmLeft <= 1500 ? "soon" : "ok";
	const status = RANK[byKm] > RANK[byDate.status] ? byKm : byDate.status;
	return { status, dueDate, days: byDate.days, dueKm, estKm, kmLeft };
}

export function vehicleName(vehicle) {
	if (!vehicle) return "";
	return [vehicle.make, vehicle.model].filter(Boolean).join(" ");
}
