// Keeps the shop's local data and the Cloudflare storefront in step (docs/STOREFRONT.md). It only runs where the Worker
// answers; on the dev server and the Mac's nginx the first request fails and nothing else happens.

import { dayOfInstant } from "@/domain/dates";
import { formatInvoiceNumber } from "@/domain/invoice";
import { HORIZON_DAYS, onlineStatusOf } from "@/domain/online-booking";
import { SERVICE_CATEGORIES } from "@/lib/labels";
import { applyOnlineCancellation, importOnlineBooking, markOnlineSynced } from "@/lib/store/actions";
import { getState, subscribe } from "@/lib/store/store";
import { toast } from "@/lib/toast";

const EVERY_MS = 30_000;
const LOCK = "garaj-online-sync";
const IS_DEV = process.env.NODE_ENV === "development";
const PING_MS = 25_000;
const SILENT_MS = 60_000;
const RETRY_MAX_MS = 30_000;
const CHANGE_DELAY_MS = 150;
let lastPublished = null;

async function shop(path, { method = "GET", data } = {}) {
	const response = await fetch(`/api/shop${path}`, { method, credentials: "same-origin", cache: "no-store", headers: data ? { "Content-Type": "application/json" } : {}, body: data ? JSON.stringify(data) : undefined });
	const isJson = (response.headers.get("Content-Type") ?? "").includes("application/json");
	return { ok: response.ok, status: response.status, isJson, data: isJson ? await response.json() : null };
}

const onlineAppointments = () => Object.values(getState().appointments).filter((appointment) => appointment.onlineBookingId);

async function pullBookings(bookings) {
	const items = [];
	for (const booking of bookings) {
		let appointment = Object.values(getState().appointments).find((a) => a.onlineBookingId === booking.id);
		if (!appointment && ["requested", "confirmed"].includes(booking.status)) {
			appointment = await importOnlineBooking(booking);
			toast.success(`Programare online: ${booking.vehicle?.plate ?? booking.ref}`);
		} else if (appointment && booking.status === "cancelled" && applyOnlineCancellation(appointment.id)) {
			toast.info(`Clientul a anulat programarea ${booking.ref}.`);
		}
		// The dev server is a second copy of the shop: it must not claim a booking, or the other copy would read it as deleted.
		items.push({ id: booking.id, version: booking.version, appointmentId: IS_DEV ? null : (appointment?.id ?? null) });
	}
	if (items.length) await shop("/ack", { method: "POST", data: { items } });
}

const onlineNow = (appointment) => ({ status: onlineStatusOf(appointment), start: appointment.start, end: appointment.end });

function isUnsent(appointment) {
	const synced = appointment.onlineSynced;
	if (synced?.status === "cancelled") return false;
	const next = onlineNow(appointment);
	return !synced || synced.status !== next.status || synced.start !== next.start || synced.end !== next.end;
}

async function pushChanges(open) {
	const { appointments } = getState();
	for (const { id } of IS_DEV ? [] : open.filter((row) => !appointments[row.appointmentId])) await shop(`/bookings/${id}`, { method: "POST", data: { status: "declined", reason: "Programarea a fost ștearsă de service." } });
	for (const appointment of onlineAppointments()) {
		if (!isUnsent(appointment)) continue;
		const next = onlineNow(appointment);
		const answer = await shop(`/bookings/${appointment.onlineBookingId}`, { method: "POST", data: next });
		if (answer.ok) markOnlineSynced(appointment.id, next);
		else if (answer.status === 409 && answer.data?.status === "cancelled" && applyOnlineCancellation(appointment.id)) toast.info("Clientul a anulat între timp programarea.");
	}
}

function publication() {
	const state = getState();
	const { settings } = state;
	const nowISO = new Date().toISOString();
	const until = new Date(Date.now() + (HORIZON_DAYS + 1) * 86_400_000).toISOString();
	const busy = Object.values(state.appointments)
		.filter((a) => !a.onlineBookingId && ["scheduled", "confirmed", "arrived"].includes(a.status) && a.end > nowISO && a.start < until)
		.sort((a, b) => a.start.localeCompare(b.start))
		.slice(0, 500)
		.map((a) => ({ start: a.start, end: a.end }));
	const services = Object.values(state.services)
		.filter((service) => service.public !== false)
		.sort((a, b) => a.name.localeCompare(b.name, "ro"))
		.map((service) => ({ id: service.id, name: service.name, category: SERVICE_CATEGORIES[service.category]?.label ?? "", minutes: Math.round((Number(service.hours) || 1) * 60), priceFrom: service.price ?? 0 }));
	const profile = { shop: { name: settings.shop.name, phone: settings.shop.phone, address: settings.shop.address, city: settings.shop.city }, hours: settings.hours, capacity: Object.keys(state.bays).length || 1, services };
	const visits = [];
	if (settings.storefront?.shareHistory) {
		// Only people who booked online, whose number is their login.
		const linked = new Set(onlineAppointments().map((a) => a.customerId));
		const invoices = Object.values(state.invoices);
		for (const order of Object.values(state.workOrders)) {
			const customer = state.customers[order.customerId];
			if (!linked.has(order.customerId) || !customer?.phone || ["cancelled", "declined"].includes(order.status) || visits.length >= 500) continue;
			const vehicle = state.vehicles[order.vehicleId];
			const invoice = invoices.find((candidate) => candidate.id === order.invoiceId && candidate.number != null && candidate.status !== "cancelled" && !candidate.stornoOf);
			visits.push({ id: order.id, phone: customer.phone, day: dayOfInstant(order.dates?.delivered ?? order.receivedAt ?? order.createdAt), plate: vehicle?.plate ?? "", car: [vehicle?.make, vehicle?.model].filter(Boolean).join(" "), title: order.title || "Vizită în service", status: order.status, total: invoice?.totals?.gross ?? null, invoice: invoice ? formatInvoiceNumber(invoice.series, invoice.number) : null });
		}
	}
	return { profile, busy, visits };
}

async function publish() {
	// The demo's invented shop never goes on a public page.
	if (getState().demo) return;
	const data = publication();
	const text = JSON.stringify(data);
	if (text === lastPublished) return;
	const answer = await shop("/publish", { method: "PUT", data });
	if (answer.ok) lastPublished = text;
}

async function syncOnce() {
	const inbox = await shop("/inbox");
	if (!inbox.ok || !inbox.isJson) return { reachable: false, keep: inbox.status === 503 || inbox.status >= 500 };
	await pullBookings(inbox.data.bookings);
	await pushChanges(inbox.data.open);
	await publish();
	return { reachable: true, keep: true };
}

const liveUrl = () => (IS_DEV ? "ws://localhost:8787/api/shop/live" : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/shop/live`);

/** Starts the sync once the store is loaded; returns a stop function. */
export function startOnlineSync() {
	let timer = null;
	let stopped = false;
	let busy = false;
	let again = false;
	let reachable = false;
	let socket = null;
	let pingTimer = null;
	let retryTimer = null;
	let changeTimer = null;
	let retryMs = 1000;

	function connect() {
		if (stopped || socket || !reachable || retryTimer) return;
		const live = new WebSocket(liveUrl());
		let heardAt = Date.now();
		socket = live;
		live.onopen = () => {
			retryMs = 1000;
			// Anything that happened while the socket was down.
			run({ live: true });
			pingTimer = setInterval(() => {
				if (Date.now() - heardAt > SILENT_MS) live.close();
				else if (live.readyState === WebSocket.OPEN) live.send("ping");
			}, PING_MS);
		};
		live.onmessage = (event) => {
			heardAt = Date.now();
			if (event.data !== "pong") run({ live: true });
		};
		live.onclose = () => {
			clearInterval(pingTimer);
			if (socket === live) socket = null;
			if (stopped) return;
			retryTimer = setTimeout(() => {
				retryTimer = null;
				run({ live: true });
			}, retryMs);
			retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
		};
	}

	const round = async () => {
		const answer = await syncOnce();
		reachable = answer.reachable;
		return answer.keep;
	};

	async function run({ live = false } = {}) {
		if (stopped || (document.hidden && !live)) return;
		if (busy) {
			again = true;
			return;
		}
		busy = true;
		let keep = true;
		try {
			keep = navigator.locks ? await navigator.locks.request(LOCK, { ifAvailable: true }, (lock) => (lock ? round() : true)) : await round();
		} catch (error) {
			// A failed round (no connection) is tried again on the next one; nothing was acknowledged.
			reachable = false;
			console.warn("[garaj] online sync", error);
		} finally {
			busy = false;
		}
		if (!keep) return stop();
		connect();
		if (again) {
			again = false;
			run({ live: true });
		}
	}

	const onVisible = () => run();
	const unsubscribe = subscribe("appointments", () => {
		// The shop's decision goes out at once, so the customer sees it live.
		if (!reachable || !onlineAppointments().some(isUnsent)) return;
		clearTimeout(changeTimer);
		changeTimer = setTimeout(() => run({ live: true }), CHANGE_DELAY_MS);
	});
	function stop() {
		stopped = true;
		clearInterval(timer);
		clearInterval(pingTimer);
		clearTimeout(retryTimer);
		clearTimeout(changeTimer);
		unsubscribe();
		socket?.close();
		document.removeEventListener("visibilitychange", onVisible);
		window.removeEventListener("focus", onVisible);
	}
	timer = setInterval(() => run(), EVERY_MS);
	document.addEventListener("visibilitychange", onVisible);
	window.addEventListener("focus", onVisible);
	run();
	return stop;
}
