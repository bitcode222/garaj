import { MAX_OPEN_BOOKINGS, bookingMinutes, canCustomerCancel, customerPhone, customerStatus, openSlots, shopDay } from "../../src/domain/online-booking.js";
import { formatPlate, normalizePlate } from "../../src/domain/vehicle.js";

// Garaj on Cloudflare (docs/STOREFRONT.md): the public storefront at /service/, its API, and the shop's app behind a login.

const DAY_MS = 86_400_000;
const CUSTOMER_COOKIE = "garaj_customer";
const SHOP_COOKIE = "garaj_shop";
const CUSTOMER_DAYS = 30;
const SHOP_DAYS = 14;
const OTP_MINUTES = 5;
const OTP_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 30;
const DEMO_CODE = "123456";
const HOLDS_A_SLOT = "('requested','confirmed','in_shop')";
const SHOP_TAG = "shop";
const customerTag = (id) => `customer:${id}`;
const LIVE_LIMIT = { shop: 20, customer: 5 };
const DEV_SHOP_ORIGIN = "http://localhost:3000";

const DEMO_PROFILE = {
	shop: { name: "Garaj Auto Pro", phone: "+40722000111", address: "Str. Atelierului 12", city: "Cluj-Napoca" },
	hours: { open: "08:00", close: "18:00", days: [1, 2, 3, 4, 5, 6] },
	capacity: 3,
	services: [
		{ id: "demo-oil", name: "Schimb ulei și filtre", category: "Întreținere", minutes: 60, priceFrom: 18000 },
		{ id: "demo-brakes", name: "Plăcuțe de frână", category: "Frâne", minutes: 90, priceFrom: 22000 },
		{ id: "demo-check", name: "Diagnoză computerizată", category: "Diagnoză", minutes: 30, priceFrom: 12000 },
		{ id: "demo-itp", name: "Verificare înainte de ITP", category: "Întreținere", minutes: 60, priceFrom: 15000 },
		{ id: "demo-ac", name: "Încărcare climă", category: "Climatizare", minutes: 60, priceFrom: 25000 },
		{ id: "demo-tires", name: "Schimb anvelope", category: "Roți", minutes: 60, priceFrom: 16000 },
	],
};

class HttpError extends Error {
	constructor(status, code, message) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers } });
const nowISO = () => new Date().toISOString();
const later = (ms) => new Date(Date.now() + ms).toISOString();
const isLocal = (url) => ["localhost", "127.0.0.1"].includes(url.hostname);
const demoAllowed = (env, url) => env.AUTH_MODE === "demo" && isLocal(url);
const text = (value, max) => String(value ?? "").trim().slice(0, max);

async function sha256(value) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bookingRef() {
	const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
	return `G-${[...crypto.getRandomValues(new Uint8Array(6))].map((byte) => alphabet[byte % alphabet.length]).join("")}`;
}

function readCookie(request, name) {
	for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
		const [key, ...rest] = part.trim().split("=");
		if (key === name) return rest.join("=");
	}
	return null;
}

const setCookie = (url, name, value, seconds) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${url.protocol === "https:" ? "; Secure" : ""}`;

async function hit(env, key, limit, seconds) {
	const window = Math.floor(Date.now() / (seconds * 1000));
	const row = await env.DB.prepare("INSERT INTO rate_limits (key, window, count) VALUES (?, ?, 1) ON CONFLICT (key, window) DO UPDATE SET count = count + 1 RETURNING count").bind(key, window).first();
	if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM rate_limits WHERE window < ?").bind(window - 2).run();
	if (row.count > limit) throw new HttpError(429, "rate_limited", "Prea multe încercări. Mai încearcă peste câteva minute.");
}

const clientIp = (request) => request.headers.get("CF-Connecting-IP") ?? "local";

async function body(request) {
	if (!(request.headers.get("Content-Type") ?? "").includes("application/json")) throw new HttpError(415, "bad_type", "Cerere invalidă.");
	const raw = await request.text();
	if (raw.length > 2_000_000) throw new HttpError(413, "too_large", "Cerere prea mare.");
	try {
		const parsed = JSON.parse(raw || "{}");
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
	} catch {
		// answered below
	}
	throw new HttpError(400, "bad_json", "Cerere invalidă.");
}

async function profile(env, url) {
	const row = await env.DB.prepare("SELECT data FROM shop_profile WHERE id = 1").first();
	if (row) return JSON.parse(row.data);
	if (demoAllowed(env, url)) return DEMO_PROFILE;
	throw new HttpError(503, "not_published", "Programările online nu sunt încă disponibile.");
}

async function busyBetween(env, from, to) {
	const [busy, held] = await env.DB.batch([
		env.DB.prepare("SELECT start, end FROM busy_blocks WHERE start < ? AND end > ?").bind(to, from),
		env.DB.prepare(`SELECT start, end FROM bookings WHERE status IN ${HOLDS_A_SLOT} AND start < ? AND end > ?`).bind(to, from),
	]);
	return [...busy.results, ...held.results];
}

const dayWindow = (day) => [new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS).toISOString(), new Date(Date.parse(`${day}T00:00:00Z`) + 2 * DAY_MS).toISOString()];

function chosenServices(shop, ids) {
	if (!Array.isArray(ids) || !ids.length || ids.length > 6) throw new HttpError(400, "services", "Alege cel puțin un serviciu.");
	const unique = [...new Set(ids.map(String))];
	const services = unique.map((id) => shop.services.find((service) => service.id === id));
	if (services.some((service) => !service)) throw new HttpError(409, "services_changed", "Lista de servicii s-a schimbat. Alege din nou.");
	return services;
}

async function customerFrom(request, env) {
	const token = readCookie(request, CUSTOMER_COOKIE);
	if (!token) return null;
	return env.DB.prepare("SELECT c.* FROM customer_sessions s JOIN customers c ON c.id = s.customer_id WHERE s.token_hash = ? AND s.expires_at > ?").bind(await sha256(token), nowISO()).first();
}

async function mustCustomer(request, env) {
	const customer = await customerFrom(request, env);
	if (!customer) throw new HttpError(401, "signed_out", "Intră în cont ca să continui.");
	return customer;
}

function publicBooking(row, now) {
	return {
		id: row.id,
		ref: row.ref,
		vehicle: JSON.parse(row.vehicle),
		services: JSON.parse(row.services),
		complaint: row.complaint,
		start: row.start,
		end: row.end,
		status: customerStatus(row, now),
		reason: row.reason,
		canCancel: canCustomerCancel(row, now),
	};
}

async function account(env, customer) {
	const now = nowISO();
	const [vehicles, bookings, visits] = await env.DB.batch([
		env.DB.prepare("SELECT id, plate, make, model, year FROM vehicles WHERE customer_id = ? AND deleted_at IS NULL ORDER BY created_at").bind(customer.id),
		env.DB.prepare("SELECT * FROM bookings WHERE customer_id = ? ORDER BY start DESC LIMIT 100").bind(customer.id),
		env.DB.prepare("SELECT id, day, plate, car, title, status, total, invoice FROM visits WHERE phone = ? ORDER BY day DESC LIMIT 100").bind(customer.phone),
	]);
	return { customer: { phone: customer.phone, name: customer.name, email: customer.email }, vehicles: vehicles.results, bookings: bookings.results.map((row) => publicBooking(row, now)), visits: visits.results };
}

// ── public API ───────────────────────────────────────────────────────────────

async function startLogin(request, env, url) {
	if (!demoAllowed(env, url)) throw new HttpError(503, "sms_off", "Autentificarea prin SMS nu este activă încă.");
	const phone = customerPhone((await body(request)).phone);
	if (!phone) throw new HttpError(400, "phone", "Scrie un număr de mobil din România.");
	await hit(env, `start:ip:${clientIp(request)}`, 20, 900);
	await hit(env, `start:phone:${phone}`, 5, 900);
	const previous = await env.DB.prepare("SELECT sent_at FROM otp_challenges WHERE phone = ?").bind(phone).first();
	const wait = previous ? OTP_RESEND_SECONDS - Math.floor((Date.now() - Date.parse(previous.sent_at)) / 1000) : 0;
	if (wait > 0) return json({ ok: true, resendIn: wait, demoCode: DEMO_CODE });
	await env.DB.prepare("INSERT INTO otp_challenges (phone, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?) ON CONFLICT (phone) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at").bind(phone, await sha256(`${phone}:${DEMO_CODE}`), later(OTP_MINUTES * 60_000), nowISO()).run();
	return json({ ok: true, resendIn: OTP_RESEND_SECONDS, demoCode: DEMO_CODE });
}

async function verifyLogin(request, env, url) {
	if (!demoAllowed(env, url)) throw new HttpError(503, "sms_off", "Autentificarea prin SMS nu este activă încă.");
	const input = await body(request);
	const phone = customerPhone(input.phone);
	if (!phone) throw new HttpError(400, "phone", "Scrie un număr de mobil din România.");
	await hit(env, `verify:ip:${clientIp(request)}`, 40, 900);
	const challenge = await env.DB.prepare("UPDATE otp_challenges SET attempts = attempts + 1 WHERE phone = ? AND expires_at > ? RETURNING code_hash, attempts").bind(phone, nowISO()).first();
	if (!challenge) throw new HttpError(400, "code_expired", "Codul a expirat. Cere altul.");
	if (challenge.attempts > OTP_ATTEMPTS) {
		await env.DB.prepare("DELETE FROM otp_challenges WHERE phone = ?").bind(phone).run();
		throw new HttpError(429, "too_many_codes", "Prea multe coduri greșite. Cere altul.");
	}
	if (challenge.code_hash !== (await sha256(`${phone}:${String(input.code ?? "").trim()}`))) throw new HttpError(400, "code_wrong", "Codul nu este corect.");
	const now = nowISO();
	await env.DB.prepare("INSERT INTO customers (id, phone, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (phone) DO NOTHING").bind(crypto.randomUUID(), phone, now, now).run();
	const customer = await env.DB.prepare("SELECT * FROM customers WHERE phone = ?").bind(phone).first();
	const token = randomToken();
	await env.DB.batch([
		env.DB.prepare("DELETE FROM otp_challenges WHERE phone = ?").bind(phone),
		env.DB.prepare("DELETE FROM customer_sessions WHERE expires_at < ?").bind(now),
		env.DB.prepare("INSERT INTO customer_sessions (token_hash, customer_id, expires_at) VALUES (?, ?, ?)").bind(await sha256(token), customer.id, later(CUSTOMER_DAYS * DAY_MS)),
	]);
	return json(await account(env, customer), 200, { "Set-Cookie": setCookie(url, CUSTOMER_COOKIE, token, CUSTOMER_DAYS * 86_400) });
}

// ── live updates ─────────────────────────────────────────────────────────────

/** Holds the open sockets. A message only says "look again"; the data still comes from the API, behind its login. */
export class LiveHub {
	constructor(state) {
		this.state = state;
		state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
	}

	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/connect") {
			const tag = url.searchParams.get("tag");
			const open = this.state.getWebSockets(tag);
			const limit = tag === SHOP_TAG ? LIVE_LIMIT.shop : LIVE_LIMIT.customer;
			for (const socket of open.slice(0, Math.max(0, open.length - limit + 1))) socket.close(4000, "replaced");
			const [client, server] = Object.values(new WebSocketPair());
			this.state.acceptWebSocket(server, [tag]);
			return new Response(null, { status: 101, webSocket: client });
		}
		const { tags } = await request.json();
		for (const tag of tags) {
			for (const socket of this.state.getWebSockets(tag)) {
				try {
					socket.send(JSON.stringify({ type: "bookings" }));
				} catch {
					// a dead socket is dropped by the runtime, and its client reconnects
				}
			}
		}
		return new Response(null, { status: 204 });
	}

	webSocketMessage() {}

	webSocketClose(socket, code) {
		try {
			socket.close(code === 1005 || code === 1006 ? 1000 : code);
		} catch {
			// already closed
		}
	}

	webSocketError() {}
}

const liveHub = (env) => env.LIVE.get(env.LIVE.idFromName("shop"));

/** A failed notice never fails the write: the 30-second sync and each reconnect still catch up. */
async function tell(env, tags) {
	try {
		await liveHub(env).fetch("https://live/notify", { method: "POST", body: JSON.stringify({ tags }) });
	} catch (error) {
		console.warn("[garaj] live notice", error);
	}
}

function openLive(request, env, url, tag) {
	if ((request.headers.get("Upgrade") ?? "").toLowerCase() !== "websocket") throw new HttpError(426, "upgrade", "Conexiune nepermisă.");
	const origin = request.headers.get("Origin");
	const isDevShop = tag === SHOP_TAG && demoAllowed(env, url) && origin === DEV_SHOP_ORIGIN;
	// Browsers don't apply the same-origin rule to sockets, so a foreign page must be refused here.
	if (origin !== url.origin && !isDevShop) throw new HttpError(403, "origin", "Cerere refuzată.");
	return liveHub(env).fetch(`https://live/connect?tag=${encodeURIComponent(tag)}`, { headers: { Upgrade: "websocket" } });
}

async function deleteAccount(env, customer, url) {
	const now = nowISO();
	await env.DB.batch([
		env.DB.prepare("UPDATE bookings SET status = 'cancelled', reason = 'client', version = version + 1, updated_at = ? WHERE customer_id = ? AND status IN ('requested','confirmed')").bind(now, customer.id),
		env.DB.prepare("UPDATE bookings SET vehicle = '{}', complaint = '' WHERE customer_id = ?").bind(customer.id),
		env.DB.prepare("DELETE FROM visits WHERE phone = ?").bind(customer.phone),
		env.DB.prepare("DELETE FROM vehicles WHERE customer_id = ?").bind(customer.id),
		env.DB.prepare("DELETE FROM customer_sessions WHERE customer_id = ?").bind(customer.id),
		env.DB.prepare("DELETE FROM otp_challenges WHERE phone = ?").bind(customer.phone),
		env.DB.prepare("UPDATE customers SET phone = 'deleted:' || id, name = '', email = '', updated_at = ? WHERE id = ?").bind(now, customer.id),
	]);
	await tell(env, [SHOP_TAG]);
	return json({ ok: true }, 200, { "Set-Cookie": setCookie(url, CUSTOMER_COOKIE, "", 0) });
}

async function addVehicle(request, env, customer) {
	const input = await body(request);
	const key = normalizePlate(input.plate);
	if (key.length < 4 || key.length > 10) throw new HttpError(400, "plate", "Scrie numărul de înmatriculare.");
	const year = input.year ? Number(input.year) : null;
	if (year !== null && (!Number.isInteger(year) || year < 1950 || year > new Date().getUTCFullYear() + 1)) throw new HttpError(400, "year", "Anul mașinii nu este corect.");
	const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM vehicles WHERE customer_id = ? AND deleted_at IS NULL").bind(customer.id).first();
	if (count.n >= 10) throw new HttpError(409, "too_many", "Poți avea cel mult 10 mașini în cont.");
	const existing = await env.DB.prepare("SELECT id, plate, make, model, year FROM vehicles WHERE customer_id = ? AND plate_key = ? AND deleted_at IS NULL").bind(customer.id, key).first();
	if (existing) return json(existing);
	const vehicle = { id: crypto.randomUUID(), plate: formatPlate(key), make: text(input.make, 40), model: text(input.model, 40), year };
	await env.DB.prepare("INSERT INTO vehicles (id, customer_id, plate, plate_key, make, model, year, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(vehicle.id, customer.id, vehicle.plate, key, vehicle.make, vehicle.model, year, nowISO()).run();
	return json(vehicle, 201);
}

async function createBooking(request, env, url, customer) {
	await hit(env, `book:${customer.id}`, 15, 3600);
	const input = await body(request);
	const key = text(input.key, 64);
	if (key.length < 8) throw new HttpError(400, "key", "Cerere invalidă.");
	const again = () => env.DB.prepare("SELECT * FROM bookings WHERE customer_id = ? AND idempotency_key = ?").bind(customer.id, key).first();
	const repeated = await again();
	if (repeated) return json(publicBooking(repeated, nowISO()));
	if (!customer.name) {
		const name = text(input.name, 80);
		if (name.length < 2) throw new HttpError(400, "name", "Scrie-ți numele.");
		await env.DB.prepare("UPDATE customers SET name = ?, updated_at = ? WHERE id = ?").bind(name, nowISO(), customer.id).run();
		customer = { ...customer, name };
	}
	if (input.terms !== true && !customer.terms_at) throw new HttpError(400, "terms", "Acceptă prelucrarea datelor ca să trimiți cererea.");
	const shop = await profile(env, url);
	const services = chosenServices(shop, input.serviceIds);
	const vehicle = await env.DB.prepare("SELECT id, plate, make, model, year FROM vehicles WHERE id = ? AND customer_id = ? AND deleted_at IS NULL").bind(String(input.vehicleId ?? ""), customer.id).first();
	if (!vehicle) throw new HttpError(400, "vehicle", "Alege mașina.");
	const start = String(input.start ?? "");
	if (Number.isNaN(Date.parse(start)) || new Date(start).toISOString() !== start) throw new HttpError(400, "start", "Alege o oră.");
	const now = nowISO();
	const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM bookings WHERE customer_id = ? AND status IN ('requested','confirmed') AND start > ?").bind(customer.id, now).first();
	if (open.n >= MAX_OPEN_BOOKINGS) throw new HttpError(409, "too_many_open", `Ai deja ${MAX_OPEN_BOOKINGS} programări active. Anulează una sau sună-ne.`);
	const minutes = bookingMinutes(services);
	const day = shopDay(start);
	const [from, to] = dayWindow(day);
	const blocks = await busyBetween(env, from, to);
	const slot = openSlots({ day, hours: shop.hours, minutes, blocks, capacity: shop.capacity, now }).find((candidate) => candidate.start === start);
	if (!slot) throw new HttpError(409, "slot_gone", "Ora aleasă tocmai s-a ocupat. Alege alta.");
	const clash = await env.DB.prepare(`SELECT 1 FROM bookings WHERE vehicle_id = ? AND status IN ${HOLDS_A_SLOT} AND start < ? AND end > ? LIMIT 1`).bind(vehicle.id, slot.end, slot.start).first();
	if (clash) throw new HttpError(409, "car_busy", "Mașina are deja o programare la această oră.");
	const seen = await env.DB.prepare(`SELECT COUNT(*) AS n FROM bookings WHERE status IN ${HOLDS_A_SLOT} AND start < ? AND end > ?`).bind(slot.end, slot.start).first();
	const id = crypto.randomUUID();
	const statements = [
		env.DB.prepare(`INSERT INTO bookings (id, ref, customer_id, vehicle_id, vehicle, services, complaint, start, end, idempotency_key, created_at, updated_at)
			SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM bookings WHERE status IN ${HOLDS_A_SLOT} AND start < ? AND end > ?) = ?`).bind(id, bookingRef(), customer.id, vehicle.id, JSON.stringify(vehicle), JSON.stringify(services.map(({ id: serviceId, name }) => ({ id: serviceId, name }))), text(input.complaint, 500), slot.start, slot.end, key, now, now, slot.end, slot.start, seen.n),
	];
	if (!customer.terms_at) statements.push(env.DB.prepare("UPDATE customers SET terms_at = ? WHERE id = ?").bind(now, customer.id));
	try {
		const [insert] = await env.DB.batch(statements);
		if (!insert.meta.changes) throw new HttpError(409, "slot_gone", "Ora aleasă tocmai s-a ocupat. Alege alta.");
	} catch (error) {
		const same = error instanceof HttpError ? null : await again();
		if (same) return json(publicBooking(same, nowISO()));
		throw error;
	}
	await tell(env, [SHOP_TAG, customerTag(customer.id)]);
	return json(publicBooking(await again(), now), 201);
}

async function cancelBooking(env, customer, id) {
	const booking = await env.DB.prepare("SELECT * FROM bookings WHERE id = ? AND customer_id = ?").bind(id, customer.id).first();
	if (!booking) throw new HttpError(404, "not_found", "Programarea nu mai există.");
	if (booking.status === "cancelled") return json(publicBooking(booking, nowISO()));
	const now = nowISO();
	if (!canCustomerCancel(booking, now)) throw new HttpError(409, "too_late", "Programarea nu mai poate fi anulată online. Sună-ne.");
	const changed = await env.DB.prepare("UPDATE bookings SET status = 'cancelled', reason = 'client', version = version + 1, updated_at = ? WHERE id = ? AND version = ?").bind(now, id, booking.version).run();
	if (!changed.meta.changes) throw new HttpError(409, "changed", "Programarea tocmai s-a schimbat. Reîncarcă pagina.");
	await tell(env, [SHOP_TAG, customerTag(customer.id)]);
	return json(publicBooking(await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first(), now));
}

async function publicApi(request, env, url, path) {
	const method = request.method;
	if (path === "/api/profile" && method === "GET") {
		const shop = await profile(env, url);
		return json({ shop: shop.shop, hours: shop.hours, services: shop.services, demoLogin: demoAllowed(env, url) });
	}
	if (path === "/api/slots" && method === "GET") {
		await hit(env, `slots:${clientIp(request)}`, 240, 60);
		const shop = await profile(env, url);
		const day = url.searchParams.get("day") ?? "";
		if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, "day", "Alege o zi.");
		const minutes = bookingMinutes(chosenServices(shop, (url.searchParams.get("services") ?? "").split(",").filter(Boolean)));
		const [from, to] = dayWindow(day);
		const slots = openSlots({ day, hours: shop.hours, minutes, blocks: await busyBetween(env, from, to), capacity: shop.capacity, now: nowISO() });
		return json({ day, minutes, slots });
	}
	if (path === "/api/auth/start" && method === "POST") return startLogin(request, env, url);
	if (path === "/api/auth/verify" && method === "POST") return verifyLogin(request, env, url);
	if (path === "/api/auth/logout" && method === "POST") {
		const token = readCookie(request, CUSTOMER_COOKIE);
		if (token) await env.DB.prepare("DELETE FROM customer_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
		return json({ ok: true }, 200, { "Set-Cookie": setCookie(url, CUSTOMER_COOKIE, "", 0) });
	}
	if (path === "/api/me" && method === "GET") {
		const customer = await customerFrom(request, env);
		return json(customer ? await account(env, customer) : { customer: null });
	}
	const customer = await mustCustomer(request, env);
	if (path === "/api/live" && method === "GET") return openLive(request, env, url, customerTag(customer.id));
	if (path === "/api/me" && method === "PATCH") {
		const input = await body(request);
		const name = text(input.name, 80);
		const email = text(input.email, 120);
		if (name.length < 2) throw new HttpError(400, "name", "Scrie-ți numele.");
		if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "email", "Adresa de e-mail nu este corectă.");
		await env.DB.prepare("UPDATE customers SET name = ?, email = ?, updated_at = ? WHERE id = ?").bind(name, email, nowISO(), customer.id).run();
		return json(await account(env, { ...customer, name, email }));
	}
	if (path === "/api/me" && method === "DELETE") return deleteAccount(env, customer, url);
	if (path === "/api/me/vehicles" && method === "POST") return addVehicle(request, env, customer);
	const car = path.match(/^\/api\/me\/vehicles\/([\w-]+)$/);
	if (car && method === "DELETE") {
		const busy = await env.DB.prepare("SELECT 1 FROM bookings WHERE vehicle_id = ? AND customer_id = ? AND status IN ('requested','confirmed','in_shop') AND end > ? LIMIT 1").bind(car[1], customer.id, nowISO()).first();
		if (busy) throw new HttpError(409, "in_use", "Mașina are o programare activă.");
		await env.DB.prepare("UPDATE vehicles SET deleted_at = ? WHERE id = ? AND customer_id = ?").bind(nowISO(), car[1], customer.id).run();
		return json({ ok: true });
	}
	if (path === "/api/bookings" && method === "POST") return createBooking(request, env, url, customer);
	const cancel = path.match(/^\/api\/bookings\/([\w-]+)\/cancel$/);
	if (cancel && method === "POST") return cancelBooking(env, customer, cancel[1]);
	throw new HttpError(404, "not_found", "Nu există.");
}

// ── the shop ─────────────────────────────────────────────────────────────────

async function isShop(request, env, url) {
	if (!env.SHOP_PASSWORD) return isLocal(url);
	const token = readCookie(request, SHOP_COOKIE);
	if (!token) return false;
	return Boolean(await env.DB.prepare("SELECT 1 FROM shop_sessions WHERE token_hash = ? AND expires_at > ?").bind(await sha256(token), nowISO()).first());
}

async function publish(env, input) {
	const { profile: next, busy = [], visits = [] } = input;
	if (!next?.shop?.name || !Array.isArray(next.services) || next.services.length > 300 || !Array.isArray(next.hours?.days)) throw new HttpError(400, "profile", "Date incomplete.");
	if (!Array.isArray(busy) || busy.length > 500 || !Array.isArray(visits) || visits.length > 500) throw new HttpError(413, "too_many", "Prea multe rânduri.");
	const clean = {
		shop: { name: text(next.shop.name, 120), phone: text(next.shop.phone, 30), address: text(next.shop.address, 160), city: text(next.shop.city, 80) },
		hours: { open: text(next.hours.open, 5), close: text(next.hours.close, 5), days: next.hours.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) },
		capacity: Math.max(1, Math.min(50, Number(next.capacity) || 1)),
		services: next.services.map((service) => ({ id: text(service.id, 64), name: text(service.name, 120), category: text(service.category, 60), minutes: Math.max(15, Math.min(1440, Math.round(Number(service.minutes) || 60))), priceFrom: Math.max(0, Math.round(Number(service.priceFrom) || 0)) })).filter((service) => service.id && service.name),
	};
	const statements = [
		env.DB.prepare("INSERT INTO shop_profile (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at").bind(JSON.stringify(clean), nowISO()),
		env.DB.prepare("DELETE FROM busy_blocks"),
		env.DB.prepare("DELETE FROM visits"),
	];
	for (const block of busy) {
		if (Number.isNaN(Date.parse(block.start)) || Number.isNaN(Date.parse(block.end)) || block.start >= block.end) continue;
		statements.push(env.DB.prepare("INSERT INTO busy_blocks (start, end) VALUES (?, ?)").bind(block.start, block.end));
	}
	for (const visit of visits) {
		const phone = customerPhone(visit.phone);
		if (!phone || !visit.id) continue;
		statements.push(env.DB.prepare("INSERT OR REPLACE INTO visits (id, phone, day, plate, car, title, status, total, invoice) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM customers WHERE phone = ?)").bind(text(visit.id, 64), phone, text(visit.day, 10), text(visit.plate, 20), text(visit.car, 80), text(visit.title, 160), text(visit.status, 30), Number.isInteger(visit.total) ? visit.total : null, visit.invoice ? text(visit.invoice, 40) : null, phone));
	}
	await env.DB.batch(statements);
	return json({ ok: true });
}

function feedItem(row) {
	const vehicle = JSON.parse(row.vehicle);
	return { id: row.id, ref: row.ref, status: row.status, start: row.start, version: row.version, updatedAt: row.updated_at, plate: vehicle.plate ?? "", car: [vehicle.make, vehicle.model].filter(Boolean).join(" "), customer: row.customer_name, services: JSON.parse(row.services).map((service) => service.name) };
}

/** Read-only view for a second device: unlike the inbox it acknowledges nothing, so the web app still imports every booking. */
async function shopFeed(env, url) {
	const since = url.searchParams.get("since");
	const now = nowISO();
	const columns = "b.id, b.ref, b.status, b.start, b.version, b.updated_at, b.vehicle, b.services, c.name AS customer_name";
	const [changed, open] = await env.DB.batch([
		env.DB.prepare(`SELECT ${columns} FROM bookings b JOIN customers c ON c.id = b.customer_id WHERE ? IS NOT NULL AND b.updated_at >= ? ORDER BY b.updated_at LIMIT 100`).bind(since, since),
		env.DB.prepare(`SELECT ${columns} FROM bookings b JOIN customers c ON c.id = b.customer_id WHERE b.status IN ('requested','confirmed') AND b.end > ? ORDER BY b.start LIMIT 100`).bind(now),
	]);
	return json({ changed: changed.results.map(feedItem), open: open.results.map(feedItem), cursor: changed.results.at(-1)?.updated_at ?? since ?? now });
}

async function shopApi(request, env, url, path) {
	if (!(await isShop(request, env, url))) throw new HttpError(401, "shop_signed_out", "Intră în contul service-ului.");
	const method = request.method;
	if (path === "/api/shop/live" && method === "GET") return openLive(request, env, url, SHOP_TAG);
	if (path === "/api/shop/feed" && method === "GET") return shopFeed(env, url);
	if (path === "/api/shop/inbox" && method === "GET") {
		const [changed, open] = await env.DB.batch([
			env.DB.prepare("SELECT b.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email FROM bookings b JOIN customers c ON c.id = b.customer_id WHERE b.shop_version < b.version ORDER BY b.created_at LIMIT 100"),
			env.DB.prepare("SELECT id, appointment_id FROM bookings WHERE appointment_id IS NOT NULL AND status IN ('requested','confirmed') LIMIT 500"),
		]);
		return json({
			bookings: changed.results.map((row) => ({ id: row.id, ref: row.ref, version: row.version, status: row.status, reason: row.reason, start: row.start, end: row.end, complaint: row.complaint, appointmentId: row.appointment_id, vehicle: JSON.parse(row.vehicle), services: JSON.parse(row.services), customer: { name: row.customer_name, phone: row.customer_phone, email: row.customer_email } })),
			open: open.results.map((row) => ({ id: row.id, appointmentId: row.appointment_id })),
		});
	}
	if (path === "/api/shop/ack" && method === "POST") {
		const { items } = await body(request);
		if (!Array.isArray(items) || items.length > 100) throw new HttpError(400, "items", "Cerere invalidă.");
		if (items.length) await env.DB.batch(items.map((item) => env.DB.prepare("UPDATE bookings SET shop_version = MAX(shop_version, ?), appointment_id = COALESCE(?, appointment_id) WHERE id = ?").bind(Number(item.version) || 0, item.appointmentId ?? null, String(item.id))));
		return json({ ok: true });
	}
	if (path === "/api/shop/publish" && method === "PUT") return publish(env, await body(request));
	const one = path.match(/^\/api\/shop\/bookings\/([\w-]+)$/);
	if (one && method === "POST") {
		const input = await body(request);
		if (!["requested", "confirmed", "in_shop", "done", "declined", "no_show"].includes(input.status)) throw new HttpError(400, "status", "Stare necunoscută.");
		const booking = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(one[1]).first();
		if (!booking) throw new HttpError(404, "not_found", "Programarea nu mai există.");
		if (booking.status === "cancelled") return json({ status: "cancelled", version: booking.version }, 409);
		const start = input.start && !Number.isNaN(Date.parse(input.start)) ? input.start : booking.start;
		const end = input.end && !Number.isNaN(Date.parse(input.end)) ? input.end : booking.end;
		if (start >= end) throw new HttpError(400, "times", "Ore invalide.");
		const changed = await env.DB.prepare("UPDATE bookings SET status = ?, start = ?, end = ?, reason = ?, version = version + 1, shop_version = CASE WHEN shop_version = version THEN version + 1 ELSE shop_version END, updated_at = ? WHERE id = ? AND status != 'cancelled' RETURNING status, version").bind(input.status, start, end, input.reason ? text(input.reason, 200) : null, nowISO(), booking.id).first();
		if (!changed) return json({ status: "cancelled" }, 409);
		await tell(env, [SHOP_TAG, customerTag(booking.customer_id)]);
		return json(changed);
	}
	throw new HttpError(404, "not_found", "Nu există.");
}

// ── the door to the shop's app ───────────────────────────────────────────────

const safeNext = (value) => (value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/");
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const loginPage = (next, message = "", status = 200) => new Response(`<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Intră · Garaj</title><style>:root{color-scheme:light dark;--b:#f7f7f8;--f:#18181b;--s:#6e6e76;--l:#e5e5ea;--c:#fff}@media(prefers-color-scheme:dark){:root{--b:#0f0f11;--f:#f4f4f5;--s:#9a9aa3;--l:#2a2a30;--c:#18181b}}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:16px;background:var(--b);color:var(--f);font:15px/1.5 system-ui,sans-serif}form{display:grid;gap:12px;width:min(100%,340px);padding:24px;border:1px solid var(--l);border-radius:16px;background:var(--c)}h1{margin:0;font-size:22px}p{margin:0;color:var(--s)}.e{color:#d92d20}input,button{min-height:44px;border-radius:10px;font:inherit;font-size:16px}input{padding:0 12px;border:1px solid var(--l);background:transparent;color:inherit}button{border:0;background:var(--f);color:var(--b);font-weight:700;cursor:pointer}</style></head><body><form method="post" action="/shop-login"><h1>Garaj</h1><p>Intră în aplicația service-ului.</p>${message ? `<p class="e" role="alert">${escapeHtml(message)}</p>` : ""}<input type="hidden" name="next" value="${escapeHtml(next)}"><label for="p">Parolă</label><input id="p" name="password" type="password" autocomplete="current-password" required autofocus><button>Intră</button></form></body></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff" } });

async function shopLogin(request, env, url) {
	if (request.method === "GET") {
		if (!env.SHOP_PASSWORD && !isLocal(url)) return loginPage("/", "Parola service-ului nu este setată.", 503);
		return loginPage(safeNext(url.searchParams.get("next")));
	}
	if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
	const form = await request.formData();
	const next = safeNext(String(form.get("next") ?? "/"));
	if (!env.SHOP_PASSWORD) return loginPage(next, "Parola service-ului nu este setată.", 503);
	try {
		await hit(env, `shop:${clientIp(request)}`, 10, 900);
	} catch {
		return loginPage(next, "Prea multe încercări. Mai încearcă peste 15 minute.", 429);
	}
	if ((await sha256(String(form.get("password") ?? ""))) !== (await sha256(env.SHOP_PASSWORD))) return loginPage(next, "Parola nu este corectă.", 401);
	const token = randomToken();
	await env.DB.batch([env.DB.prepare("DELETE FROM shop_sessions WHERE expires_at < ?").bind(nowISO()), env.DB.prepare("INSERT INTO shop_sessions (token_hash, expires_at) VALUES (?, ?)").bind(await sha256(token), later(SHOP_DAYS * DAY_MS))]);
	return new Response(null, { status: 303, headers: { Location: next, "Set-Cookie": setCookie(url, SHOP_COOKIE, token, SHOP_DAYS * 86_400), "Cache-Control": "no-store" } });
}

async function shopAsset(request, env) {
	const response = await env.ASSETS.fetch(request);
	const out = new Response(response.body, response);
	out.headers.set("Cache-Control", "private, no-store");
	out.headers.set("X-Robots-Tag", "noindex");
	return out;
}

const worker = {
	async fetch(request, env) {
		const url = new URL(request.url);
		const path = url.pathname;
		try {
			if (path.startsWith("/api/")) {
				const origin = request.headers.get("Origin");
				// In local demo mode the Next dev server on :3000 proxies the shop's API here.
				const devShop = path.startsWith("/api/shop/") && demoAllowed(env, url) && origin === DEV_SHOP_ORIGIN;
				if (!["GET", "HEAD"].includes(request.method) && origin && origin !== url.origin && !devShop) throw new HttpError(403, "origin", "Cerere refuzată.");
				return path.startsWith("/api/shop/") ? await shopApi(request, env, url, path) : await publicApi(request, env, url, path);
			}
			if (path === "/shop-login") {
				const origin = request.headers.get("Origin");
				if (request.method === "POST" && origin && origin !== url.origin) return new Response("Forbidden", { status: 403 });
				return await shopLogin(request, env, url);
			}
			if (path === "/service" || path.startsWith("/service/")) return env.ASSETS.fetch(request);
			if (await isShop(request, env, url)) return await shopAsset(request, env);
			if (path === "/") return Response.redirect(`${url.origin}/service/`, 302);
			return Response.redirect(`${url.origin}/shop-login?next=${encodeURIComponent(path + url.search)}`, 302);
		} catch (error) {
			if (error instanceof HttpError) return json({ error: error.code, message: error.message }, error.status);
			console.error("[garaj]", error);
			return json({ error: "server", message: "A apărut o eroare. Mai încearcă o dată." }, 500);
		}
	},
};

export default worker;
