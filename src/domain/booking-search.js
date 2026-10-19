// Finding bookings and jobs from the calendar's search (docs/APPOINTMENTS-AND-NAV.md, search):
// each record gets one text it is found by, built once; a query is cut into words and every
// word must be in that text. Case, diacritics and spacing do not matter, so "ionut" finds
// "Ionuț", "b123abc" finds "B 123 ABC" and "0722123456" finds "0722 123 456".

/** Lower case, without diacritics, single spaces. */
export function normalize(text) {
	return String(text ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

const compact = (text) => String(text ?? "").replace(/[\s.-]/g, "");

/**
 * The text a booking (or a job without one: pass `order` only) is found by: the car (make, model,
 * plate, VIN), the customer (name, phone), what it is for (title, operations, services, the
 * complaint), the mechanic, its number and its job's ("#128", "#1873").
 */
export function searchText({ appointment = null, order = null, customer = null, vehicle = null, mechanic = null, serviceNames = [] }) {
	const plate = vehicle?.plate ?? "";
	const phone = customer?.phone ?? "";
	return normalize(
		[
			vehicle?.make,
			vehicle?.model,
			plate,
			compact(plate),
			vehicle?.vin,
			customer?.name,
			phone,
			phone.replace(/\D/g, ""),
			appointment?.title,
			...(appointment?.operations ?? []).map((op) => op.name),
			...serviceNames,
			order?.complaint,
			mechanic?.name,
			appointment?.number != null ? `#${appointment.number}` : null,
			order?.number != null ? `#${order.number}` : null,
		]
			.filter(Boolean)
			.join(" · "),
	);
}

/** The query's words, each to be found; null while the query is too short to search (fewer than two letters or digits). */
export function searchWords(query) {
	const text = normalize(query);
	if (text.replace(/[^a-z0-9]/g, "").length < 2) return null;
	return text.split(" ").filter(Boolean);
}

/** Every word is in the text. */
export const matchesWords = (text, words) => words.every((word) => text.includes(word));
