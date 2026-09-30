/** Romanian numbers to E.164: "0722 123 456" → "+40722123456". */
export function normalizePhone(raw) {
	if (!raw) return "";
	let s = String(raw).replace(/[^\d+]/g, "");
	if (s.startsWith("00")) s = `+${s.slice(2)}`;
	if (s.startsWith("+")) return s;
	if (s.startsWith("0") && s.length === 10) return `+4${s}`;
	if (s.startsWith("40") && s.length === 11) return `+${s}`;
	return s;
}

/** "+40722123456" → "0722 123 456"; anything else is returned as typed. */
export function formatPhone(raw) {
	const e164 = normalizePhone(raw);
	if (e164.startsWith("+40") && e164.length === 12) {
		const local = `0${e164.slice(3)}`;
		return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
	}
	return raw ?? "";
}

export const telHref = (phone) => `tel:${normalizePhone(phone)}`;

// "?&body=" is understood by both iOS Messages and Android.
export const smsHref = (phone, body) =>
	`sms:${normalizePhone(phone)}${body ? `?&body=${encodeURIComponent(body)}` : ""}`;

export const whatsappHref = (phone, text) =>
	`https://wa.me/${normalizePhone(phone).replace(/^\+/, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

/** Romanian CUI / CIF control digit (key 753217532). Accepts an optional "RO" prefix. */
export function isValidCUI(input) {
	const s = String(input ?? "")
		.toUpperCase()
		.replace(/\s/g, "")
		.replace(/^RO/, "");
	if (!/^\d{2,10}$/.test(s)) return false;
	const digits = s.split("").map(Number);
	const control = digits.pop();
	const key = [7, 5, 3, 2, 1, 7, 5, 3, 2];
	const padded = Array(9 - digits.length).fill(0).concat(digits);
	const sum = padded.reduce((acc, d, i) => acc + d * key[i], 0);
	const expected = ((sum * 10) % 11) % 10;
	return expected === control;
}

/** ISO 13616 mod-97 check; Romanian IBANs are 24 characters. */
export function isValidIBAN(input) {
	const s = String(input ?? "").toUpperCase().replace(/\s/g, "");
	if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
	if (s.startsWith("RO") && s.length !== 24) return false;
	let rem = 0;
	for (const ch of s.slice(4) + s.slice(0, 4)) {
		const value = ch >= "A" ? String(ch.charCodeAt(0) - 55) : ch;
		for (const d of value) rem = (rem * 10 + Number(d)) % 97;
	}
	return rem === 1;
}

export function formatIBAN(input) {
	return String(input ?? "")
		.toUpperCase()
		.replace(/\s/g, "")
		.replace(/(.{4})/g, "$1 ")
		.trim();
}

export function isValidEmail(input) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(input ?? "").trim());
}

export function joinAddress(entity) {
	return [entity?.address, entity?.city, entity?.county].filter(Boolean).join(", ");
}

export function initials(name) {
	const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
	if (!words.length) return "?";
	if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
	return (words[0][0] + words[1][0]).toUpperCase();
}

/** First name for friendly messages: "Andrei Popescu" → "Andrei"; companies keep their name. */
export function greetingName(customer) {
	if (!customer) return "";
	if (customer.type === "company") return customer.contactName || customer.name;
	return String(customer.name ?? "").trim().split(/\s+/)[0] ?? "";
}
