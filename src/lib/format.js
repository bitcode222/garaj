import { diffDaysISO, pad2, parseISODate } from "@/domain/dates";

export { formatMoney, formatAmount, formatQuantity } from "@/domain/money";
export { formatPlate } from "@/domain/vehicle";
export { formatPhone } from "@/domain/customer";
export { formatInvoiceNumber } from "@/domain/invoice";

const toDate = (value) => {
	if (value instanceof Date) return value;
	if (typeof value === "string" && value.length === 10) return parseISODate(value);
	return new Date(value);
};

// Native Intl instead of a date library: zero bytes shipped, formatters cached.
const formatters = new Map();
function intl(options) {
	const key = JSON.stringify(options);
	let formatter = formatters.get(key);
	if (!formatter) formatters.set(key, (formatter = new Intl.DateTimeFormat("ro-RO", options)));
	return formatter;
}

const TOKENS = /EEEE|EEE|MMMM|MMM|MM|dd|d|yyyy|yy|HH|mm/g;

function formatDate(date, pattern) {
	return pattern.replace(TOKENS, (token) => {
		switch (token) {
			case "d":
				return String(date.getDate());
			case "dd":
				return pad2(date.getDate());
			case "MM":
				return pad2(date.getMonth() + 1);
			case "MMM":
				return intl({ month: "short" }).format(date);
			case "MMMM":
				return intl({ month: "long" }).format(date);
			case "yy":
				return pad2(date.getFullYear() % 100);
			case "yyyy":
				return String(date.getFullYear());
			case "EEE":
				return intl({ weekday: "short" }).format(date);
			case "EEEE":
				return intl({ weekday: "long" }).format(date);
			case "HH":
				return pad2(date.getHours());
			default:
				return pad2(date.getMinutes());
		}
	});
}

/** "30 sept. 2026" (dates and instants). Tokens: d dd MM MMM MMMM yy yyyy EEE EEEE HH mm. */
export function fmtDate(value, pattern = "d MMM yyyy") {
	if (!value) return "—";
	return formatDate(toDate(value), pattern);
}

/** "30.09.2026" — documents. */
export const fmtDateDoc = (value) => (value ? formatDate(toDate(value), "dd.MM.yyyy") : "—");

/** "14:30" */
export const fmtTime = (value) => (value ? formatDate(toDate(value), "HH:mm") : "");

/** "mar., 30 sept." */
export const fmtDay = (value) => fmtDate(value, "EEE, d MMM");

/** azi · mâine · ieri · în 5 zile · acum 3 zile */
export function fmtDays(days) {
	if (days == null) return "";
	if (days === 0) return "azi";
	if (days === 1) return "mâine";
	if (days === -1) return "ieri";
	const n = Math.abs(days);
	const unit = n === 1 ? "zi" : n < 20 ? "zile" : "de zile";
	return days > 0 ? `în ${n} ${unit}` : `acum ${n} ${unit}`;
}

export const fmtRelativeTo = (dateISO, today) => (dateISO && today ? fmtDays(diffDaysISO(today, dateISO)) : "");

const kmFormat = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 });
export const fmtKm = (km) => (km == null ? "—" : `${kmFormat.format(km)} km`);

const hoursFormat = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 });
export const fmtHours = (h) => `${hoursFormat.format(h ?? 0)} h`;

export const fmtNumber = (n, digits = 0) =>
	new Intl.NumberFormat("ro-RO", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n ?? 0);

export const fmtWorkOrder = (number) => `#${number}`;

/** "1 mașină", "2 mașini", "20 de mașini" — Romanian plural rules. */
export function plural(n, one, few, many = `de ${few}`) {
	if (n === 1) return `1 ${one}`;
	const mod = n % 100;
	return `${n.toLocaleString("ro-RO")} ${n === 0 || (mod >= 1 && mod <= 19) ? few : many}`;
}
