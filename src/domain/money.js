// Money is always an integer number of minor units (bani: 1 leu = 100 bani).
// Arithmetic that can produce fractions goes through BigInt and rounds once,
// half away from zero, so totals never drift.

/** BigInt division rounded half away from zero. `den` must be > 0. */
export function divRound(num, den) {
	const q = num / den;
	const r = num % den;
	if (r === 0n) return q;
	const twice = (r < 0n ? -r : r) * 2n;
	if (twice < den) return q;
	return num < 0n ? q - 1n : q + 1n;
}

/** `amount` (bani) × `ratePct` % (up to 2 decimals), rounded. */
export function percentOf(amount, ratePct) {
	const bp = BigInt(Math.round((Number(ratePct) || 0) * 100));
	return Number(divRound(BigInt(Math.round(amount)) * bp, 10000n));
}

/**
 * Parses user input into bani. Accepts "1.234,56", "1234.56", "1 234,56", "12,5 lei".
 * A single "." followed by exactly three digits is a thousands separator (RO habit).
 * Returns null when the input is not a number.
 */
export function parseMoney(input) {
	if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : null;
	let s = String(input ?? "")
		.trim()
		.toLowerCase()
		.replace(/lei|ron|eur|€/g, "")
		.replace(/[\s  ']/g, "");
	if (!s) return null;
	let negative = false;
	if (s.startsWith("-")) {
		negative = true;
		s = s.slice(1);
	}
	if (!/^[\d.,]+$/.test(s)) return null;

	const lastDot = s.lastIndexOf(".");
	const lastComma = s.lastIndexOf(",");
	let intPart = s;
	let fracPart = "";

	if (lastDot >= 0 && lastComma >= 0) {
		const dec = Math.max(lastDot, lastComma);
		intPart = s.slice(0, dec).replace(/[.,]/g, "");
		fracPart = s.slice(dec + 1);
	} else if (lastDot >= 0 || lastComma >= 0) {
		const sep = lastDot >= 0 ? "." : ",";
		const parts = s.split(sep);
		const thousands =
			parts.length > 2 || (sep === "." && parts.length === 2 && parts[1].length === 3);
		if (thousands) {
			if (!parts.slice(1).every((p) => p.length === 3)) return null;
			intPart = parts.join("");
		} else {
			[intPart, fracPart] = parts;
		}
	}

	if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;
	if (intPart === "" && fracPart === "") return null;

	const frac = (fracPart + "000").slice(0, 3);
	let minor = Number(intPart || "0") * 100 + Number(frac.slice(0, 2));
	if (Number(frac[2]) >= 5) minor += 1;
	if (!Number.isSafeInteger(minor)) return null;
	return negative && minor ? -minor : minor;
}

/** Parses a quantity ("1,5", "0.25") to a number with at most `decimals` places. */
export function parseQuantity(input, decimals = 3) {
	if (typeof input === "number") return Number.isFinite(input) ? input : null;
	const s = String(input ?? "").trim().replace(/\s/g, "").replace(",", ".");
	if (!/^-?\d*\.?\d*$/.test(s) || s === "" || s === "-" || s === ".") return null;
	const n = Number(s);
	if (!Number.isFinite(n)) return null;
	const f = 10 ** decimals;
	return Math.round(n * f) / f;
}

const formatters = new Map();

function numberFormat(decimals) {
	let f = formatters.get(decimals);
	if (!f) {
		f = new Intl.NumberFormat("ro-RO", {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals,
		});
		formatters.set(decimals, f);
	}
	return f;
}

/** 123456 → "1.234,56" */
export function formatAmount(minor, decimals = 2) {
	if (minor == null || Number.isNaN(minor)) return "—";
	return numberFormat(decimals).format(minor / 100);
}

const SUFFIX = { RON: "lei", EUR: "€" };

/** 123456 → "1.234,56 lei" */
export function formatMoney(minor, currency = "RON", { decimals = 2, sign = false } = {}) {
	if (minor == null || Number.isNaN(minor)) return "—";
	const prefix = sign && minor > 0 ? "+" : "";
	return `${prefix}${formatAmount(minor, decimals)} ${SUFFIX[currency] ?? currency}`;
}

/** Value for an input field: 123456 → "1234,56" (no grouping, easy to edit). */
export function toInputAmount(minor) {
	if (minor == null) return "";
	const negative = minor < 0;
	const abs = Math.abs(minor);
	const s = `${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
	return negative ? `-${s}` : s;
}

export function formatQuantity(qty) {
	if (qty == null) return "—";
	return new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 3 }).format(qty);
}
