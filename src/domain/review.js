import { DomainError } from "./errors.js";
import { greetingName } from "./customer.js";
import { vehicleName } from "./vehicle.js";

// The review of a visit (docs/VISIT-FLOW.md §6.4): one per job. Two things live in it:
// the request sent to the customer (each send is logged; the app only opens WhatsApp or
// SMS, so it cannot know a message really left), and the admin's own note on the
// customer (stars, a few tags, a text), internal, shown later where it helps.
//
//   { id, workOrderId, customerId, vehicleId, invoiceId, requests: [{ at, channel }],
//     receivedAt, rating (1–5 or null), tags: [], note, createdAt, updatedAt }

export const REVIEW_CHANNELS = ["whatsapp", "sms", "copy"];
export const REVIEW_TAGS = ["punctual", "pays_on_time", "demanding", "recommends"];

/** none: not asked yet · requested: a message was sent · received: the customer answered. */
export function reviewState(review) {
	if (!review) return "none";
	if (review.receivedAt) return "received";
	return review.requests?.length ? "requested" : "none";
}

export function newReview({ id, workOrderId, customerId = null, vehicleId = null, invoiceId = null, now }) {
	if (!workOrderId) throw new DomainError("invalid", "Recenzia se cere pentru o lucrare.");
	return { id, workOrderId, customerId, vehicleId, invoiceId, requests: [], receivedAt: null, rating: null, tags: [], note: "", createdAt: now, updatedAt: now };
}

/** A request was sent (or copied to be sent) on `channel`. */
export function logRequest(review, { channel, now }) {
	if (!REVIEW_CHANNELS.includes(channel)) throw new DomainError("invalid", "Canal necunoscut.");
	return { ...review, requests: [...(review.requests ?? []), { at: now, channel }], updatedAt: now };
}

/** "N-am trimis": the last logged request did not really go out. */
export function dropLastRequest(review, { now }) {
	return { ...review, requests: (review.requests ?? []).slice(0, -1), updatedAt: now };
}

/** The customer answered (or, `received: false`, that was a mistake). */
export function markReceived(review, { received = true, now }) {
	return { ...review, receivedAt: received ? now : null, updatedAt: now };
}

/** The admin's note on the customer: 1–5 stars (null clears them), tags from REVIEW_TAGS, a text. */
export function noteCustomer(review, { rating = review.rating, tags = review.tags, note = review.note, now }) {
	if (rating != null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) throw new DomainError("invalid", "Nota este între 1 și 5 stele.");
	const known = (tags ?? []).filter((tag) => REVIEW_TAGS.includes(tag));
	return { ...review, rating: rating ?? null, tags: [...new Set(known)], note: String(note ?? ""), updatedAt: now };
}

/** The message asking for a review, with the link when the shop has one. */
export function reviewMessage({ customer, vehicle, settings, link = settings.reviews?.link }) {
	const name = vehicleName(vehicle);
	return [
		`Bună ziua${customer ? `, ${greetingName(customer)}` : ""}!`,
		`Vă mulțumim că ați ales ${settings.shop.name}${name ? ` pentru ${name}` : ""}.`,
		link ? `Ne-ar ajuta mult o părere de-a dumneavoastră: ${link}` : "Ne-ar ajuta mult să ne spuneți cum a fost.",
		"Mulțumim!",
	].join("\n");
}

/** The latest review the admin wrote about a customer (most recently changed with a rating or a note). */
export function latestNoteOn(reviews, customerId) {
	return (
		Object.values(reviews ?? {})
			.filter((review) => review.customerId === customerId && (review.rating || review.note?.trim()))
			.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0] ?? null
	);
}
