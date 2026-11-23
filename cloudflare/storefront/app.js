// The public storefront (docs/STOREFRONT.md): a small hash-routed page over the Worker's API.

const ZONE = "Europe/Bucharest";
const DRAFT_KEY = "garaj.service.draft";
const DEMO_PHONE = "0722 000 111";
const STATUS = { requested: "Așteaptă confirmarea", confirmed: "Confirmată", in_shop: "În service", done: "Finalizată", declined: "Refuzată", cancelled: "Anulată", no_show: "Neprezentare", expired: "Expirată" };
const VISIT_STATUS = { estimate: "Deviz", approved: "Aprobată", in_progress: "În lucru", waiting_parts: "Așteaptă piese", ready: "Gata", delivered: "Predată", cancelled: "Anulată", declined: "Refuzată" };
const DAY_NAMES = ["duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"];

const app = document.getElementById("app");
const state = { profile: null, me: null, draft: readDraft(), tab: "bookings", slots: [], days: [] };

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const lei = (bani) => `${Math.round(bani / 100).toLocaleString("ro-RO")} lei`;
const fmt = (iso, options) => new Intl.DateTimeFormat("ro-RO", { timeZone: ZONE, ...options }).format(new Date(iso));
const time = (iso) => fmt(iso, { hour: "2-digit", minute: "2-digit" });
const longDay = (iso) => fmt(iso, { weekday: "long", day: "numeric", month: "long" });
const span = (minutes) => (minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`);
const phoneText = (phone) => (phone?.startsWith("+40") ? `0${phone.slice(3, 6)} ${phone.slice(6, 9)} ${phone.slice(9)}` : (phone ?? ""));
const carName = (car) => [car.make, car.model].filter(Boolean).join(" ") || "Mașină";

function readDraft() {
	try {
		return { serviceIds: [], start: null, end: null, day: null, vehicleId: null, complaint: "", key: null, ...JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "{}") };
	} catch {
		return { serviceIds: [], start: null, end: null, day: null, vehicleId: null, complaint: "", key: null };
	}
}
function saveDraft() {
	try {
		sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state.draft));
	} catch {
		// the draft simply lives until the page closes
	}
}
function clearDraft() {
	state.draft = { serviceIds: [], start: null, end: null, day: null, vehicleId: null, complaint: "", key: null };
	saveDraft();
}

class ApiError extends Error {
	constructor(status, code, message) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

async function api(path, { method = "GET", data } = {}) {
	let response;
	try {
		response = await fetch(`/api${path}`, { method, credentials: "same-origin", headers: data !== undefined ? { "Content-Type": "application/json" } : {}, body: data !== undefined ? JSON.stringify(data) : undefined });
	} catch {
		throw new ApiError(0, "offline", "Nu există conexiune. Verifică internetul și încearcă din nou.");
	}
	const payload = await response.json().catch(() => null);
	if (!response.ok) throw new ApiError(response.status, payload?.error ?? "server", payload?.message ?? "A apărut o eroare. Mai încearcă o dată.");
	return payload;
}

let toastTimer;
function toast(message) {
	const el = document.getElementById("toast");
	el.textContent = message;
	el.hidden = false;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => (el.hidden = true), 3800);
}

const serviceById = (id) => state.profile.services.find((service) => service.id === id);
const chosen = () => state.draft.serviceIds.map(serviceById).filter(Boolean);
const totalMinutes = () => Math.max(30, Math.ceil(chosen().reduce((sum, service) => sum + service.minutes, 0) / 30) * 30);
const priceFrom = () => chosen().reduce((sum, service) => sum + service.priceFrom, 0);

function hoursText(hours) {
	const days = [1, 2, 3, 4, 5, 6, 0].filter((day) => hours.days.includes(day));
	if (!days.length) return "Închis";
	const first = DAY_NAMES[days[0]];
	const last = DAY_NAMES[days.at(-1)];
	const label = days.length === 1 ? first : `${first} – ${last}`;
	return `${label.charAt(0).toUpperCase()}${label.slice(1)}, ${hours.open}–${hours.close}`;
}

function serviceCards(linked) {
	const body = (service) => `<b>${esc(service.name)}</b><span>${esc(service.category)} · ${span(service.minutes)}${service.priceFrom ? ` · de la ${lei(service.priceFrom)}` : ""}</span>`;
	return state.profile.services.map((service) => (linked ? `<a class="service" href="#/programare" data-pick="${esc(service.id)}">${body(service)}</a>` : `<button type="button" class="service" data-service="${esc(service.id)}" aria-pressed="${state.draft.serviceIds.includes(service.id)}">${body(service)}</button>`)).join("");
}

function renderHome() {
	const { shop, hours } = state.profile;
	const next = state.me?.bookings?.find((booking) => ["requested", "confirmed"].includes(booking.status));
	app.innerHTML = `
		<section class="hero">
			<div>
				<h1>Programează mașina în service, fără telefoane.</h1>
				<p>Alegi ce are nevoie mașina, vezi orele libere și trimiți cererea. ${esc(shop.name)} o confirmă cât mai repede.</p>
				<div class="row"><a class="btn" href="#/programare">Programează acum</a>${shop.phone ? `<a class="btn quiet" href="tel:${esc(shop.phone)}">Sună: ${esc(phoneText(shop.phone))}</a>` : ""}</div>
			</div>
			<div class="stack" aria-hidden="true">
				<div><span>Program</span><b>${esc(hours.open)}–${esc(hours.close)}</b></div>
				<div><span>Servicii disponibile</span><b>${state.profile.services.length}</b></div>
				<div><span>${next ? "Următoarea ta programare" : "Cerere de programare"}</span><b>${next ? esc(`${fmt(next.start, { day: "numeric", month: "short" })}, ${time(next.start)}`) : "În 2 minute"}</b></div>
			</div>
		</section>
		<section class="section" id="servicii"><h2>Servicii</h2><p class="muted">Prețurile sunt orientative. Costul final depinde de mașină și de piese.</p><div class="services">${serviceCards(true)}</div></section>
		<section class="section"><h2>Ne găsești aici</h2><div class="info">
			<p><b>Adresă</b>${esc([shop.address, shop.city].filter(Boolean).join(", ") || "Sună-ne pentru adresă")}</p>
			<p><b>Program</b>${esc(hoursText(hours))}</p>
			<p><b>Telefon</b>${shop.phone ? `<a href="tel:${esc(shop.phone)}">${esc(phoneText(shop.phone))}</a>` : "—"}</p>
		</div></section>`;
	app.querySelectorAll("[data-pick]").forEach((link) => link.addEventListener("click", () => {
		if (!state.draft.serviceIds.includes(link.dataset.pick)) state.draft.serviceIds.push(link.dataset.pick);
		state.draft.start = null;
		saveDraft();
	}));
}

const stepper = (step) => `<ol class="steps" aria-label="Pasul ${step} din 4">${[1, 2, 3, 4].map((n) => `<li class="${n <= step ? "on" : ""}"></li>`).join("")}</ol>`;

function renderBook() {
	const { draft } = state;
	if (!chosen().length) return renderServices();
	if (!draft.start) return renderTime();
	if (!state.me?.customer) return renderLogin();
	return renderConfirm();
}

function renderServices() {
	app.innerHTML = `<div class="flow">${stepper(1)}<h1>Ce are nevoie mașina?</h1><div class="services">${serviceCards(false)}</div>
		<div class="bar"><p id="pick-note"></p><button class="btn" id="next" type="button">Alege ora</button></div></div>`;
	const update = () => {
		const count = chosen().length;
		document.getElementById("next").disabled = !count;
		document.getElementById("pick-note").textContent = count ? `${count === 1 ? "1 serviciu" : `${count} servicii`} · ${span(totalMinutes())} · de la ${lei(priceFrom())}` : "Alege cel puțin un serviciu";
	};
	app.querySelectorAll("[data-service]").forEach((button) => button.addEventListener("click", () => {
		const id = button.dataset.service;
		const on = state.draft.serviceIds.includes(id);
		if (!on && state.draft.serviceIds.length >= 6) return toast("Poți alege cel mult 6 servicii.");
		state.draft.serviceIds = on ? state.draft.serviceIds.filter((other) => other !== id) : [...state.draft.serviceIds, id];
		state.draft.start = null;
		button.setAttribute("aria-pressed", String(!on));
		saveDraft();
		update();
	}));
	document.getElementById("next").addEventListener("click", () => {
		if (chosen().length) renderTime();
	});
	update();
}

function nextDays() {
	const open = state.profile.hours.days;
	const result = [];
	const today = fmt(new Date().toISOString(), { year: "numeric", month: "2-digit", day: "2-digit" }).split(".").reverse().join("-");
	const [year, month, date] = today.split("-").map(Number);
	for (let i = 0; i <= 45; i++) {
		const at = new Date(Date.UTC(year, month - 1, date + i, 12));
		result.push({ day: at.toISOString().slice(0, 10), weekday: new Intl.DateTimeFormat("ro-RO", { weekday: "short", timeZone: "UTC" }).format(at).replace(".", ""), date: at.getUTCDate(), month: new Intl.DateTimeFormat("ro-RO", { month: "short", timeZone: "UTC" }).format(at), open: open.includes(at.getUTCDay()) });
	}
	return result;
}

async function renderTime(message = "") {
	const days = nextDays();
	const { draft } = state;
	if (!draft.day || !days.some((day) => day.day === draft.day && day.open)) draft.day = days.find((day) => day.open)?.day ?? null;
	app.innerHTML = `<div class="flow">${stepper(2)}<h1>Când vii?</h1>${message ? `<p class="error" role="alert">${esc(message)}</p>` : ""}
		<p class="muted">${esc(chosen().map((service) => service.name).join(", "))} · aproximativ ${span(totalMinutes())}</p>
		<div class="days" role="group" aria-label="Alege ziua">${days.map((day) => `<button type="button" class="day" data-day="${day.day}" aria-pressed="${day.day === draft.day}" ${day.open ? "" : "disabled"} aria-label="${esc(`${day.weekday} ${day.date} ${day.month}`)}"><small>${esc(day.weekday)}</small><b>${day.date}</b><small>${esc(day.month)}</small></button>`).join("")}</div>
		<div id="slots" aria-live="polite"></div>
		<div class="bar"><button class="btn quiet small" id="back" type="button">Înapoi</button><button class="btn" id="next" type="button" disabled>Continuă</button></div></div>`;
	document.getElementById("back").addEventListener("click", renderServices);
	document.getElementById("next").addEventListener("click", () => {
		const slot = state.slots.find((candidate) => candidate.start === state.pending);
		if (!slot) return;
		state.draft.start = slot.start;
		state.draft.end = slot.end;
		saveDraft();
		renderBook();
	});
	app.querySelectorAll("[data-day]").forEach((button) => button.addEventListener("click", () => {
		state.draft.day = button.dataset.day;
		saveDraft();
		app.querySelectorAll("[data-day]").forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
		loadSlots();
	}));
	app.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: "center", block: "nearest" });
	loadSlots();
}

let slotsRun = 0;
async function loadSlots() {
	const run = ++slotsRun;
	const box = document.getElementById("slots");
	const next = document.getElementById("next");
	state.pending = null;
	next.disabled = true;
	box.innerHTML = `<p class="muted">Caut orele libere…</p>`;
	try {
		const { slots } = await api(`/slots?day=${state.draft.day}&services=${encodeURIComponent(state.draft.serviceIds.join(","))}`);
		if (run !== slotsRun) return;
		state.slots = slots;
		if (!slots.length) {
			box.innerHTML = `<div class="empty">Nicio oră liberă în această zi. Încearcă altă zi.</div>`;
			return;
		}
		box.innerHTML = `<div class="slots" role="group" aria-label="Alege ora">${slots.map((slot) => `<button type="button" class="slot" data-slot="${slot.start}" aria-pressed="false">${time(slot.start)}</button>`).join("")}</div>`;
		box.querySelectorAll("[data-slot]").forEach((button) => button.addEventListener("click", () => {
			state.pending = button.dataset.slot;
			box.querySelectorAll("[data-slot]").forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
			next.disabled = false;
		}));
	} catch (error) {
		if (run !== slotsRun) return;
		if (error.code === "services_changed") {
			clearDraft();
			await loadProfile();
			return renderServices();
		}
		box.innerHTML = `<div class="empty"><span>${esc(error.message)}</span><button class="btn quiet small" id="retry" type="button">Încearcă din nou</button></div>`;
		document.getElementById("retry").addEventListener("click", loadSlots);
	}
}

function loginForm(afterLogin, step = null) {
	const demo = state.profile.demoLogin;
	app.innerHTML = `<div class="flow">${step ? stepper(step) : ""}<h1>Intră cu telefonul</h1><p class="muted">Îți trimitem un cod prin SMS. Dacă e prima dată, îți facem automat un cont.</p>
		<p id="login-error" class="error" role="alert" hidden></p>
		<form class="form" id="phone-form" novalidate><label class="field"><span>Număr de mobil</span><input id="phone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="07xx xxx xxx" value="${demo ? DEMO_PHONE : ""}"></label><button class="btn">Trimite codul</button></form>
		<form class="form" id="code-form" hidden novalidate><label class="field"><span>Codul primit</span><input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label><button class="btn">Intră</button><button class="btn quiet small" id="change" type="button">Schimbă numărul</button></form></div>`;
	const showError = (message) => {
		const el = document.getElementById("login-error");
		el.textContent = message;
		el.hidden = !message;
	};
	let phone = "";
	document.getElementById("phone-form").addEventListener("submit", async (event) => {
		event.preventDefault();
		showError("");
		const button = event.currentTarget.querySelector("button");
		button.disabled = true;
		phone = document.getElementById("phone").value;
		try {
			const started = await api("/auth/start", { method: "POST", data: { phone } });
			document.getElementById("phone-form").hidden = true;
			document.getElementById("code-form").hidden = false;
			const code = document.getElementById("code");
			if (started.demoCode) code.value = started.demoCode;
			code.focus();
		} catch (error) {
			showError(error.message);
		} finally {
			button.disabled = false;
		}
	});
	document.getElementById("change").addEventListener("click", () => {
		document.getElementById("code-form").hidden = true;
		document.getElementById("phone-form").hidden = false;
		showError("");
	});
	document.getElementById("code-form").addEventListener("submit", async (event) => {
		event.preventDefault();
		showError("");
		const button = event.currentTarget.querySelector("button");
		button.disabled = true;
		try {
			state.me = await api("/auth/verify", { method: "POST", data: { phone, code: document.getElementById("code").value } });
			paintNav();
			afterLogin();
		} catch (error) {
			showError(error.message);
			button.disabled = false;
		}
	});
}

const renderLogin = () => loginForm(renderBook, 3);

function renderConfirm(message = "") {
	const { draft, me } = state;
	const needsName = !me.customer.name;
	if (draft.vehicleId && !me.vehicles.some((car) => car.id === draft.vehicleId)) draft.vehicleId = null;
	if (!draft.vehicleId && me.vehicles.length === 1) draft.vehicleId = me.vehicles[0].id;
	app.innerHTML = `<div class="flow">${stepper(4)}<h1>Verifică și trimite</h1>${message ? `<p class="error" role="alert">${esc(message)}</p>` : ""}
		<div class="summary"><div><span>Când</span><b>${esc(longDay(draft.start))}, ${time(draft.start)}</b></div><div><span>Servicii</span><b>${esc(chosen().map((service) => service.name).join(", "))}</b></div><div><span>Durată</span><b>${span(totalMinutes())}</b></div><div><span>Preț de la</span><b>${lei(priceFrom())}</b></div></div>
		<button class="btn quiet small" id="change-time" type="button">Schimbă ora</button>
		<form class="form" id="book" novalidate>
			${needsName ? `<label class="field"><span>Numele tău</span><input id="name" autocomplete="name" required maxlength="80"></label>` : ""}
			<div class="field"><span>Mașina</span>${me.vehicles.length ? `<div class="services">${me.vehicles.map((car) => `<button type="button" class="service" data-car="${esc(car.id)}" aria-pressed="${car.id === draft.vehicleId}"><b>${esc(car.plate)}</b><span>${esc(carName(car))}${car.year ? ` · ${car.year}` : ""}</span></button>`).join("")}</div>` : ""}</div>
			<details ${me.vehicles.length ? "" : "open"}><summary class="muted">Adaugă o mașină</summary><div class="form" style="margin-top:12px">${carFields()}<button class="btn quiet small" id="add-car" type="button">Salvează mașina</button></div></details>
			<label class="field"><span>Ce s-a întâmplat? (opțional)</span><textarea id="complaint" maxlength="500" placeholder="De exemplu: scârțâie frânele la rece">${esc(draft.complaint)}</textarea></label>
			${me.bookings?.length ? "" : `<label class="check"><input id="terms" type="checkbox"><span>Sunt de acord ca service-ul să-mi folosească numele, telefonul și datele mașinii pentru această programare.</span></label>`}
			<div class="bar"><p>Cererea devine programare după confirmarea service-ului.</p><button class="btn" id="send">Trimite cererea</button></div>
		</form></div>`;
	document.getElementById("change-time").addEventListener("click", () => {
		state.draft.start = null;
		saveDraft();
		renderTime();
	});
	document.getElementById("complaint").addEventListener("input", (event) => {
		state.draft.complaint = event.target.value;
		saveDraft();
	});
	app.querySelectorAll("[data-car]").forEach((button) => button.addEventListener("click", () => {
		state.draft.vehicleId = button.dataset.car;
		saveDraft();
		app.querySelectorAll("[data-car]").forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
	}));
	document.getElementById("add-car").addEventListener("click", async () => {
		try {
			const car = await api("/me/vehicles", { method: "POST", data: readCar() });
			state.me = await api("/me");
			state.draft.vehicleId = car.id;
			saveDraft();
			renderConfirm();
		} catch (error) {
			toast(error.message);
		}
	});
	document.getElementById("book").addEventListener("submit", submitBooking);
}

const carFields = () => `<label class="field"><span>Număr de înmatriculare</span><input id="plate" autocapitalize="characters" placeholder="CJ 12 ABC" maxlength="14"></label><div class="two"><label class="field"><span>Marcă</span><input id="make" placeholder="Dacia" maxlength="40"></label><label class="field"><span>Model</span><input id="model" placeholder="Duster" maxlength="40"></label></div><label class="field"><span>An (opțional)</span><input id="year" inputmode="numeric" maxlength="4"></label>`;
const readCar = () => ({ plate: document.getElementById("plate").value, make: document.getElementById("make").value, model: document.getElementById("model").value, year: document.getElementById("year").value || null });

async function submitBooking(event) {
	event.preventDefault();
	const { draft } = state;
	if (!draft.vehicleId) return renderConfirm("Alege sau adaugă mașina.");
	const name = document.getElementById("name")?.value;
	const termsBox = document.getElementById("terms");
	if (termsBox && !termsBox.checked) return toast("Bifează acordul ca să trimiți cererea.");
	draft.key ??= crypto.randomUUID();
	saveDraft();
	const send = document.getElementById("send");
	send.disabled = true;
	send.textContent = "Se trimite…";
	try {
		const booking = await api("/bookings", { method: "POST", data: { serviceIds: draft.serviceIds, vehicleId: draft.vehicleId, start: draft.start, complaint: draft.complaint, key: draft.key, name, terms: termsBox ? termsBox.checked : true } });
		clearDraft();
		state.me = await api("/me");
		renderDone(booking);
	} catch (error) {
		if (error.status === 401) {
			state.me = { customer: null };
			paintNav();
			return renderLogin();
		}
		if (error.code === "slot_gone") {
			draft.start = null;
			draft.key = null;
			saveDraft();
			return renderTime(error.message);
		}
		if (error.code === "services_changed") {
			clearDraft();
			await loadProfile();
			toast(error.message);
			return renderServices();
		}
		if (error.status !== 0) {
			draft.key = null;
			saveDraft();
		}
		renderConfirm(error.message);
	}
}

function renderDone(booking) {
	app.innerHTML = `<div class="flow done"><h1>Cererea a fost trimisă</h1><p class="ref">${esc(booking.ref)}</p><p class="muted">${esc(longDay(booking.start))}, ${time(booking.start)}. Devine programare după ce service-ul o confirmă, iar starea ei o vezi în cont.</p><div class="row" style="justify-content:center"><a class="btn" href="#/cont">Vezi programările</a><a class="btn quiet" href="#/">Acasă</a></div></div>`;
	app.focus();
}

function bookingItem(booking) {
	return `<article class="item"><div class="row between"><h3>${esc(longDay(booking.start))}, ${time(booking.start)}</h3><span class="pill ${esc(booking.status)}">${esc(STATUS[booking.status] ?? booking.status)}</span></div>
		<p>${esc(booking.services.map((service) => service.name).join(", "))}</p><p>${esc(booking.vehicle.plate ?? "")} ${esc(booking.vehicle.plate ? `· ${carName(booking.vehicle)}` : "")} · ${esc(booking.ref)}</p>
		${booking.canCancel ? `<div><button class="btn danger small" data-cancel="${esc(booking.id)}" type="button">Anulează</button></div>` : ""}</article>`;
}

function renderAccount() {
	if (!state.me?.customer) return loginForm(renderAccount);
	const { me, tab } = state;
	const upcoming = me.bookings.filter((booking) => ["requested", "confirmed", "in_shop"].includes(booking.status)).sort((a, b) => a.start.localeCompare(b.start));
	const past = me.bookings.filter((booking) => !upcoming.includes(booking));
	const tabs = [["bookings", "Programări"], ["cars", "Mașini"], ["history", "Istoric"], ["profile", "Profil"]];
	const views = {
		bookings: () => `${upcoming.length ? `<div class="list">${upcoming.map(bookingItem).join("")}</div>` : `<div class="empty"><span>Nu ai programări active.</span><a class="btn small" href="#/programare">Programează</a></div>`}${past.length ? `<h2 style="font-size:20px">Anterioare</h2><div class="list">${past.map(bookingItem).join("")}</div>` : ""}`,
		cars: () => `${me.vehicles.length ? `<div class="list">${me.vehicles.map((car) => `<article class="item"><div class="row between"><h3>${esc(car.plate)}</h3><button class="btn danger small" data-remove="${esc(car.id)}" type="button">Șterge</button></div><p>${esc(carName(car))}${car.year ? ` · ${car.year}` : ""}</p></article>`).join("")}</div>` : `<div class="empty">Nu ai adăugat nicio mașină.</div>`}<form class="form item" id="car-form" novalidate><h3>Adaugă o mașină</h3>${carFields()}<button class="btn quiet">Salvează mașina</button></form>`,
		history: () => (me.visits.length ? `<div class="list">${me.visits.map((visit) => `<article class="item"><div class="row between"><h3>${esc(visit.title || "Vizită în service")}</h3><span class="pill">${esc(VISIT_STATUS[visit.status] ?? visit.status)}</span></div><p>${esc(fmt(`${visit.day}T12:00:00Z`, { day: "numeric", month: "long", year: "numeric" }))} · ${esc(visit.plate)}${visit.car ? ` · ${esc(visit.car)}` : ""}</p>${visit.total != null || visit.invoice ? `<p>${visit.invoice ? `Factura ${esc(visit.invoice)}` : ""}${visit.invoice && visit.total != null ? " · " : ""}${visit.total != null ? lei(visit.total) : ""}</p>` : ""}</article>`).join("")}</div>` : `<div class="empty">Vizitele și facturile apar aici după ce service-ul alege să le împartă cu tine.</div>`),
		profile: () => `<form class="form item" id="profile-form" novalidate><label class="field"><span>Telefon</span><input value="${esc(phoneText(me.customer.phone))}" disabled></label><label class="field"><span>Nume</span><input id="profile-name" value="${esc(me.customer.name)}" autocomplete="name" maxlength="80"></label><label class="field"><span>E-mail (opțional)</span><input id="profile-email" type="email" value="${esc(me.customer.email)}" autocomplete="email" maxlength="120"></label><button class="btn quiet">Salvează</button></form><div class="row"><button class="btn quiet small" id="logout" type="button">Ieși din cont</button><button class="btn danger small" id="delete" type="button">Șterge contul</button></div><div id="delete-confirm"></div>`,
	};
	app.innerHTML = `<div class="account"><div><h1>${esc(me.customer.name || "Contul meu")}</h1><p class="muted">${esc(phoneText(me.customer.phone))}</p></div><div class="tabs" role="tablist">${tabs.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${tab === id}">${label}</button>`).join("")}</div><div class="list" role="tabpanel">${views[tab]()}</div></div>`;
	app.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
		state.tab = button.dataset.tab;
		renderAccount();
	}));
	const act = async (run, success) => {
		try {
			await run();
			state.me = await api("/me");
			paintNav();
			if (success) toast(success);
			renderAccount();
		} catch (error) {
			if (error.status === 401) {
				state.me = { customer: null };
				paintNav();
				return renderAccount();
			}
			toast(error.message);
		}
	};
	app.querySelectorAll("[data-cancel]").forEach((button) => button.addEventListener("click", () => {
		const row = button.parentElement;
		row.innerHTML = `<div class="row"><span>Anulezi programarea?</span><button class="btn danger small" id="yes" type="button">Da, anulează</button><button class="btn quiet small" id="no" type="button">Nu</button></div>`;
		row.querySelector("#no").addEventListener("click", renderAccount);
		row.querySelector("#yes").addEventListener("click", () => act(() => api(`/bookings/${button.dataset.cancel}/cancel`, { method: "POST", data: {} }), "Programarea a fost anulată."));
	}));
	app.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => act(() => api(`/me/vehicles/${button.dataset.remove}`, { method: "DELETE" }), "Mașina a fost ștearsă.")));
	document.getElementById("car-form")?.addEventListener("submit", (event) => {
		event.preventDefault();
		act(() => api("/me/vehicles", { method: "POST", data: readCar() }), "Mașina a fost salvată.");
	});
	document.getElementById("profile-form")?.addEventListener("submit", (event) => {
		event.preventDefault();
		act(() => api("/me", { method: "PATCH", data: { name: document.getElementById("profile-name").value, email: document.getElementById("profile-email").value } }), "Profilul a fost salvat.");
	});
	document.getElementById("logout")?.addEventListener("click", async () => {
		await api("/auth/logout", { method: "POST", data: {} }).catch(() => null);
		state.me = { customer: null };
		state.tab = "bookings";
		paintNav();
		location.hash = "#/";
	});
	document.getElementById("delete")?.addEventListener("click", () => {
		const box = document.getElementById("delete-confirm");
		box.innerHTML = `<div class="item"><p>Îți ștergem mașinile, istoricul și datele de contact, iar programările active se anulează. Nu se poate reveni.</p><div class="row"><button class="btn danger small" id="delete-yes" type="button">Șterge definitiv</button><button class="btn quiet small" id="delete-no" type="button">Renunță</button></div></div>`;
		document.getElementById("delete-no").addEventListener("click", () => (box.innerHTML = ""));
		document.getElementById("delete-yes").addEventListener("click", async () => {
			try {
				await api("/me", { method: "DELETE" });
				state.me = { customer: null };
				state.tab = "bookings";
				clearDraft();
				paintNav();
				toast("Contul a fost șters.");
				location.hash = "#/";
			} catch (error) {
				toast(error.message);
			}
		});
	});
}

function paintNav() {
	document.getElementById("nav-account").textContent = state.me?.customer ? "Contul meu" : "Intră";
	syncLive();
}

// ── live updates: the socket only says "look again"; the account is re-read from the API ──

const live = { socket: null, ping: null, retry: null, retryMs: 1000, refreshing: false, again: false };

function changeNotice(before, after) {
	if (before.status !== after.status) {
		if (after.status === "confirmed") return `Programarea ${after.ref} a fost confirmată.`;
		if (after.status === "declined") return `Programarea ${after.ref} a fost refuzată.`;
		if (after.status === "in_shop") return "Mașina ta a ajuns în service.";
		if (after.status === "done") return "Vizita ta în service s-a încheiat.";
	}
	if (before.start !== after.start) return `Programarea ${after.ref} s-a mutat pe ${longDay(after.start)}, ${time(after.start)}.`;
	return null;
}

/** Repaints only where nothing is being typed or confirmed. */
function repaintLive() {
	const hash = location.hash || "#/";
	const isHome = !hash.startsWith("#/programare") && !hash.startsWith("#/cont");
	if (isHome) renderHome();
	else if (hash.startsWith("#/cont") && state.tab === "bookings" && !app.querySelector("#yes, #delete-yes")) {
		const top = scrollY;
		renderAccount();
		scrollTo(0, top);
	}
}

async function refreshLive() {
	if (!state.me?.customer) return;
	if (live.refreshing) {
		live.again = true;
		return;
	}
	live.refreshing = true;
	try {
		const before = new Map((state.me.bookings ?? []).map((booking) => [booking.id, booking]));
		const me = await api("/me");
		if (!state.me?.customer) return;
		state.me = me;
		paintNav();
		if (!me.customer) return route();
		const notices = (me.bookings ?? []).flatMap((booking) => (before.has(booking.id) ? (changeNotice(before.get(booking.id), booking) ?? []) : []));
		repaintLive();
		if (notices.length) toast(notices.join(" "));
	} catch {
		// the next notice or reconnect tries again
	} finally {
		live.refreshing = false;
		if (live.again) {
			live.again = false;
			refreshLive();
		}
	}
}

function connectLive() {
	if (live.socket || live.retry || !state.me?.customer) return;
	const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/live`);
	let heardAt = Date.now();
	live.socket = socket;
	socket.onopen = () => {
		live.retryMs = 1000;
		refreshLive();
		live.ping = setInterval(() => {
			if (Date.now() - heardAt > 60_000) socket.close();
			else if (socket.readyState === WebSocket.OPEN) socket.send("ping");
		}, 25_000);
	};
	socket.onmessage = (event) => {
		heardAt = Date.now();
		if (event.data !== "pong") refreshLive();
	};
	socket.onclose = () => {
		clearInterval(live.ping);
		if (live.socket === socket) live.socket = null;
		if (!state.me?.customer) return;
		live.retry = setTimeout(() => {
			live.retry = null;
			connectLive();
		}, live.retryMs);
		live.retryMs = Math.min(live.retryMs * 2, 30_000);
	};
}

function syncLive() {
	if (state.me?.customer) return connectLive();
	clearTimeout(live.retry);
	live.retry = null;
	live.socket?.close();
}

// Phones suspend sockets in the background, so coming back always catches up.
addEventListener("focus", refreshLive);
document.addEventListener("visibilitychange", () => {
	if (document.hidden) return;
	connectLive();
	refreshLive();
});

async function loadProfile() {
	state.profile = await api("/profile");
	const { shop, demoLogin, hours } = state.profile;
	document.getElementById("brand").textContent = shop.name;
	document.title = `${shop.name} · Programare online`;
	document.getElementById("demo").hidden = !demoLogin;
	document.getElementById("foot").textContent = `${shop.name}${shop.city ? ` · ${shop.city}` : ""} · ${hoursText(hours)}`;
	state.draft.serviceIds = state.draft.serviceIds.filter((id) => serviceById(id));
}

function route() {
	if (!state.profile) return;
	const hash = location.hash || "#/";
	if (hash.startsWith("#/programare")) renderBook();
	else if (hash.startsWith("#/cont")) renderAccount();
	else renderHome();
	scrollTo(0, 0);
}

(async function start() {
	try {
		const [, me] = await Promise.all([loadProfile(), api("/me").catch(() => ({ customer: null }))]);
		state.me = me;
		paintNav();
		addEventListener("hashchange", route);
		route();
	} catch (error) {
		app.innerHTML = `<div class="empty"><span>${esc(error.message)}</span><button class="btn quiet small" type="button" id="reload">Încearcă din nou</button></div>`;
		document.getElementById("reload").addEventListener("click", () => location.reload());
	}
})();
