// User operations. Each one validates with the domain rules and throws a
// DomainError with a Romanian, user-facing message when something is not allowed.

import { appointmentProblem, findConflicts, setAppointmentStatus as nextAppointmentStatus } from "@/domain/appointment";
import { addDaysISO, dayOfInstant, todayISO } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import { uid } from "@/domain/ids";
import { stockDelta } from "@/domain/inventory";
import { buildStorno, issueInvoice, issueProblems, paymentProblem } from "@/domain/invoice";
import { formatPlate, normalizePlate, addReading } from "@/domain/vehicle";
import { defaultInspection, toInvoiceDraft, transition } from "@/domain/work-order";
import { mergeSettings } from "./defaults";
import { COLLECTIONS, atomic, commit, getState, replaceAllData, snapshotForBackup } from "./store";

const now = () => new Date().toISOString();
const round3 = (n) => Math.round(n * 1000) / 1000;
const values = (name) => Object.values(getState()[name]);

function mustGet(name, id, label) {
	const entity = getState()[name][id];
	if (!entity) throw new DomainError("not_found", `${label} nu mai există.`);
	return entity;
}

async function readCounters(tx) {
	const counters = (await tx.getMeta("counters")) ?? {};
	return { invoices: {}, workOrders: 1, ...counters };
}

// ── settings ─────────────────────────────────────────────────────────────────

export function updateSettings(patch) {
	commit({ settings: mergeSettings(patch, getState().settings) });
}

export async function setNextInvoiceNumber(series, next) {
	const n = Math.floor(Number(next));
	if (!(n >= 1)) throw new DomainError("counter", "Introdu un număr valid.");
	const max = values("invoices").reduce(
		(m, i) => (i.series === series && i.number != null ? Math.max(m, i.number) : m),
		0,
	);
	if (n <= max) throw new DomainError("counter", `Numărul trebuie să fie mai mare decât ultima factură emisă în seria ${series} (${max}).`);
	await atomic([], async (tx) => {
		const counters = await readCounters(tx);
		tx.setMeta("counters", { ...counters, invoices: { ...counters.invoices, [series]: n } });
	});
}

// ── customers & vehicles ─────────────────────────────────────────────────────

export function saveCustomer(input) {
	const name = String(input.name ?? "").trim();
	if (!name) throw new DomainError("invalid", "Completează numele clientului.");
	const existing = input.id ? getState().customers[input.id] : null;
	const t = now();
	const customer = {
		type: "person",
		phone: "",
		email: "",
		address: "",
		city: "",
		county: "",
		cui: "",
		regCom: "",
		notes: "",
		marketingConsent: false,
		...existing,
		...input,
		name,
		cui: String(input.cui ?? existing?.cui ?? "").toUpperCase().replace(/\s/g, ""),
		id: existing?.id ?? uid(),
		createdAt: existing?.createdAt ?? t,
		updatedAt: t,
	};
	commit({ customers: { put: [customer] } });
	return customer;
}

export function deleteCustomer(id) {
	if (values("invoices").some((i) => i.customerId === id && i.status !== "draft")) {
		throw new DomainError("in_use", "Clientul are facturi emise, deci nu poate fi șters (evidență fiscală).");
	}
	if (values("workOrders").some((o) => o.customerId === id)) {
		throw new DomainError("in_use", "Clientul are lucrări înregistrate. Păstrează-l în evidență.");
	}
	commit({
		customers: { del: [id] },
		vehicles: { del: values("vehicles").filter((v) => v.customerId === id).map((v) => v.id) },
		appointments: { del: values("appointments").filter((a) => a.customerId === id).map((a) => a.id) },
		invoices: { del: values("invoices").filter((i) => i.customerId === id && i.status === "draft").map((i) => i.id) },
	});
}

export function saveVehicle(input) {
	const plate = formatPlate(input.plate);
	if (!normalizePlate(plate)) throw new DomainError("invalid", "Completează numărul de înmatriculare.");
	if (!input.customerId) throw new DomainError("invalid", "Alege proprietarul mașinii.");
	const key = normalizePlate(plate);
	const duplicate = values("vehicles").find((v) => v.id !== input.id && normalizePlate(v.plate) === key);
	if (duplicate) throw new DomainError("duplicate", `Există deja o mașină cu numărul ${plate}.`);
	const existing = input.id ? getState().vehicles[input.id] : null;
	const t = now();
	const vehicle = {
		vin: "",
		make: "",
		model: "",
		engine: "",
		fuel: "",
		year: null,
		color: "",
		mileage: [],
		itpExpiry: null,
		rcaExpiry: null,
		serviceIntervalKm: null,
		serviceIntervalMonths: null,
		lastServiceDate: null,
		lastServiceKm: null,
		notes: "",
		...existing,
		...input,
		plate,
		vin: String(input.vin ?? existing?.vin ?? "").toUpperCase().replace(/\s/g, ""),
		id: existing?.id ?? uid(),
		createdAt: existing?.createdAt ?? t,
		updatedAt: t,
	};
	commit({ vehicles: { put: [vehicle] } });
	return vehicle;
}

export function recordMileage(vehicleId, km, { date = todayISO(), source = "manual" } = {}) {
	const vehicle = mustGet("vehicles", vehicleId, "Mașina");
	if (!(Number(km) > 0)) throw new DomainError("invalid", "Introdu kilometrajul.");
	const { vehicle: next, warning } = addReading(vehicle, { date, km, source });
	commit({ vehicles: { put: [{ ...next, updatedAt: now() }] } });
	return warning;
}

export function deleteVehicle(id) {
	if (values("invoices").some((i) => i.vehicleId === id && i.status !== "draft")) {
		throw new DomainError("in_use", "Mașina apare pe facturi emise și nu poate fi ștearsă.");
	}
	if (values("workOrders").some((o) => o.vehicleId === id)) {
		throw new DomainError("in_use", "Mașina are lucrări înregistrate.");
	}
	commit({
		vehicles: { del: [id] },
		appointments: { del: values("appointments").filter((a) => a.vehicleId === id).map((a) => a.id) },
	});
}

// ── team, bays, catalog ──────────────────────────────────────────────────────

function saveSimple(collection, input, label, defaults = {}) {
	const name = String(input.name ?? "").trim();
	if (!name) throw new DomainError("invalid", `Completează ${label}.`);
	const existing = input.id ? getState()[collection][input.id] : null;
	const t = now();
	const entity = {
		...defaults,
		...existing,
		...input,
		name,
		id: existing?.id ?? uid(),
		createdAt: existing?.createdAt ?? t,
		updatedAt: t,
	};
	commit({ [collection]: { put: [entity] } });
	return entity;
}

export const saveStaff = (input) =>
	saveSimple("staff", input, "numele", { role: "mechanic", color: "blue", phone: "", active: true, order: values("staff").length });
export const saveBay = (input) =>
	saveSimple("bays", input, "numele postului", { kind: "lift", active: true, order: values("bays").length });
export const saveService = (input) =>
	saveSimple("services", input, "denumirea operațiunii", { category: "maintenance", hours: 1, price: 0, parts: [] });
export const savePart = (input) =>
	saveSimple("parts", input, "denumirea piesei", { code: "", brand: "", unit: "buc", cost: 0, price: 0, stock: 0, minStock: 0, location: "" });

export function deleteCatalogItem(collection, id) {
	// Documents keep copies of their lines, so catalog items can always go.
	commit({ [collection]: { del: [id] } });
}

export function removeTeamMember(collection, id) {
	const used =
		values("workOrders").some((o) => o.staffId === id || o.bayId === id) ||
		values("appointments").some((a) => a.staffId === id || a.bayId === id);
	if (used) {
		const entity = getState()[collection][id];
		commit({ [collection]: { put: [{ ...entity, active: false, updatedAt: now() }] } });
		return "deactivated";
	}
	commit({ [collection]: { del: [id] } });
	return "deleted";
}

/** Goods received: adds stock and optionally updates the purchase cost. */
export function receiveStock(partId, qty, cost) {
	const part = mustGet("parts", partId, "Piesa");
	const amount = Number(qty);
	if (!(amount > 0)) throw new DomainError("invalid", "Introdu cantitatea recepționată.");
	commit({
		parts: {
			put: [{ ...part, stock: round3(part.stock + amount), cost: cost ?? part.cost, updatedAt: now() }],
		},
	});
}

// ── lines helpers (catalog → document lines) ─────────────────────────────────

export function linesFromService(serviceId, { staffId = null } = {}) {
	const s = getState();
	const service = s.services[serviceId];
	if (!service) return [];
	const vatRate = s.settings.invoicing.vatPayer ? s.settings.invoicing.vatRate : 0;
	const hours = Number(service.hours) || 1;
	const lines = [
		{
			id: uid(),
			kind: "labor",
			refId: service.id,
			description: service.name,
			qty: hours,
			unit: "h",
			unitPrice: service.price ? Math.round(service.price / hours) : s.settings.laborRate,
			discountPct: 0,
			vatRate,
			cost: 0,
			staffId,
		},
	];
	for (const { partId, qty } of service.parts ?? []) {
		const line = lineFromPart(partId, qty);
		if (line) lines.push(line);
	}
	return lines;
}

export function lineFromPart(partId, qty = 1) {
	const s = getState();
	const part = s.parts[partId];
	if (!part) return null;
	return {
		id: uid(),
		kind: "part",
		refId: part.id,
		description: [part.name, part.brand].filter(Boolean).join(" "),
		qty,
		unit: part.unit || "buc",
		unitPrice: part.price,
		discountPct: 0,
		vatRate: s.settings.invoicing.vatPayer ? s.settings.invoicing.vatRate : 0,
		cost: part.cost ?? 0,
		staffId: null,
	};
}

export function blankLine(kind = "labor") {
	const s = getState();
	return {
		id: uid(),
		kind,
		refId: null,
		description: "",
		qty: 1,
		unit: kind === "labor" ? "h" : "buc",
		unitPrice: kind === "labor" ? s.settings.laborRate : 0,
		discountPct: 0,
		vatRate: s.settings.invoicing.vatPayer ? s.settings.invoicing.vatRate : 0,
		cost: 0,
		staffId: null,
	};
}

// ── appointments ─────────────────────────────────────────────────────────────

function conflictsFor(appointment) {
	const day = dayOfInstant(appointment.start);
	const sameDay = values("appointments").filter((a) => dayOfInstant(a.start) === day);
	return findConflicts(appointment, sameDay);
}

export function saveAppointment(input) {
	const problem = appointmentProblem(input);
	if (problem) throw new DomainError("invalid", problem);
	const existing = input.id ? getState().appointments[input.id] : null;
	const t = now();
	const appointment = {
		title: "",
		notes: "",
		serviceIds: [],
		staffId: null,
		bayId: null,
		vehicleId: null,
		status: "scheduled",
		workOrderId: null,
		...existing,
		...input,
		id: existing?.id ?? uid(),
		createdAt: existing?.createdAt ?? t,
		updatedAt: t,
	};
	commit({ appointments: { put: [appointment] } });
	return { appointment, conflicts: conflictsFor(appointment) };
}

export function moveAppointment(id, start, end) {
	const appointment = mustGet("appointments", id, "Programarea");
	return saveAppointment({ ...appointment, start, end });
}

export function setAppointmentStatus(id, status) {
	const appointment = mustGet("appointments", id, "Programarea");
	const next = nextAppointmentStatus(appointment, status, { now: now() });
	commit({ appointments: { put: [next] } });
	return next;
}

export function deleteAppointment(id) {
	const appointment = mustGet("appointments", id, "Programarea");
	if (appointment.workOrderId) throw new DomainError("in_use", "Programarea are o lucrare deschisă. Anulează-o în loc să o ștergi.");
	commit({ appointments: { del: [id] } });
}

// ── work orders ──────────────────────────────────────────────────────────────

/** Opens a job (check-in). `mileage` is also logged on the vehicle. */
export async function createWorkOrder({
	customerId,
	vehicleId,
	complaint = "",
	mileage = null,
	fuelLevel = null,
	staffId = null,
	bayId = null,
	appointmentId = null,
	serviceIds = [],
	status = "estimate",
}) {
	const s = getState();
	if (!customerId) throw new DomainError("invalid", "Alege clientul.");
	if (!vehicleId) throw new DomainError("invalid", "Alege mașina.");
	const vehicle = mustGet("vehicles", vehicleId, "Mașina");
	const t = now();
	const lines = serviceIds.flatMap((id) => linesFromService(id, { staffId }));
	let warning = null;
	let nextVehicle = null;
	if (Number(mileage) > 0) {
		const result = addReading(vehicle, { date: todayISO(), km: mileage, source: "workOrder" });
		nextVehicle = { ...result.vehicle, updatedAt: t };
		warning = result.warning;
	}
	const appointment = appointmentId ? s.appointments[appointmentId] : null;

	const order = await atomic(["workOrders", "vehicles", "appointments"], async (tx) => {
		const counters = await readCounters(tx);
		const number = counters.workOrders ?? 1;
		tx.setMeta("counters", { ...counters, workOrders: number + 1 });
		const created = {
			id: uid(),
			number,
			status,
			customerId,
			vehicleId,
			appointmentId,
			staffId,
			bayId,
			mileage: Number(mileage) > 0 ? Math.round(Number(mileage)) : null,
			fuelLevel,
			complaint: complaint.trim(),
			diagnosis: "",
			lines,
			inspection: defaultInspection(),
			notes: "",
			invoiceId: null,
			dates: { estimate: t, ...(status !== "estimate" ? { [status]: t } : {}) },
			activity: [{ at: t, type: "created" }],
			createdAt: t,
			updatedAt: t,
		};
		tx.put("workOrders", created);
		if (nextVehicle) tx.put("vehicles", nextVehicle);
		if (appointment) {
			tx.put("appointments", { ...appointment, status: "arrived", workOrderId: created.id, updatedAt: t });
		}
		return created;
	});
	return { order, warning };
}

export function checkInAppointment(appointmentId, { mileage, fuelLevel, complaint } = {}) {
	const appointment = mustGet("appointments", appointmentId, "Programarea");
	if (appointment.workOrderId) throw new DomainError("exists", "Mașina are deja o lucrare deschisă din această programare.");
	if (!appointment.vehicleId) throw new DomainError("invalid", "Adaugă întâi mașina pe programare.");
	return createWorkOrder({
		customerId: appointment.customerId,
		vehicleId: appointment.vehicleId,
		complaint: complaint ?? appointment.title ?? "",
		mileage,
		fuelLevel,
		staffId: appointment.staffId,
		bayId: appointment.bayId,
		appointmentId,
		serviceIds: appointment.serviceIds ?? [],
	});
}

export function updateWorkOrder(id, patch) {
	const order = mustGet("workOrders", id, "Lucrarea");
	if (order.status === "delivered" || order.status === "cancelled") {
		const allowed = ["notes"];
		if (Object.keys(patch).some((k) => !allowed.includes(k))) {
			throw new DomainError("locked", "Lucrarea este închisă și nu mai poate fi modificată.");
		}
	}
	const next = { ...order, ...patch, updatedAt: now() };
	commit({ workOrders: { put: [next] } });
	return next;
}

export function setWorkOrderStatus(id, to) {
	const order = mustGet("workOrders", id, "Lucrarea");
	const next = transition(order, to, { now: now() });
	const changes = { workOrders: { put: [next] } };
	if (to === "delivered" && order.appointmentId) {
		const appointment = getState().appointments[order.appointmentId];
		if (appointment && appointment.status === "arrived") {
			changes.appointments = { put: [{ ...appointment, status: "done", updatedAt: now() }] };
		}
	}
	commit(changes);
	return next;
}

export function deleteWorkOrder(id) {
	const order = mustGet("workOrders", id, "Lucrarea");
	if (!["estimate", "cancelled"].includes(order.status) || order.invoiceId) {
		throw new DomainError("in_use", "Doar devizele neaprobate sau lucrările anulate, fără factură, pot fi șterse.");
	}
	const changes = { workOrders: { del: [id] } };
	if (order.appointmentId) {
		const appointment = getState().appointments[order.appointmentId];
		if (appointment) changes.appointments = { put: [{ ...appointment, status: "confirmed", workOrderId: null, updatedAt: now() }] };
	}
	commit(changes);
}

/** Returns the draft/issued invoice of a job, creating a draft when needed. */
export function invoiceForWorkOrder(id) {
	const s = getState();
	const order = mustGet("workOrders", id, "Lucrarea");
	const current = order.invoiceId ? s.invoices[order.invoiceId] : null;
	if (current && current.status !== "cancelled") return current;
	if (!order.lines.length) throw new DomainError("invalid", "Adaugă cel puțin o linie în lucrare înainte de factură.");
	const t = now();
	const draft = { ...toInvoiceDraft(order, { settings: s.settings, today: todayISO() }), createdAt: t, updatedAt: t };
	commit({
		invoices: { put: [draft] },
		workOrders: { put: [{ ...order, invoiceId: draft.id, updatedAt: t }] },
	});
	return draft;
}

// ── invoices & payments ──────────────────────────────────────────────────────

export function createInvoiceDraft({ customerId = null, vehicleId = null } = {}) {
	const s = getState();
	const t = now();
	const today = todayISO();
	const draft = {
		id: uid(),
		status: "draft",
		series: s.settings.invoicing.series,
		number: null,
		issueDate: today,
		dueDate: addDaysISO(today, s.settings.invoicing.dueDays),
		customerId,
		vehicleId,
		workOrderId: null,
		mileage: null,
		lines: [],
		notes: "",
		activity: [],
		createdAt: t,
		updatedAt: t,
	};
	commit({ invoices: { put: [draft] } });
	return draft;
}

export function updateInvoiceDraft(id, patch) {
	const invoice = mustGet("invoices", id, "Factura");
	if (invoice.status !== "draft") throw new DomainError("locked", "Factura emisă nu se mai modifică. Poți emite o stornare.");
	const next = { ...invoice, ...patch, updatedAt: now() };
	commit({ invoices: { put: [next] } });
	return next;
}

export function deleteInvoiceDraft(id) {
	const invoice = mustGet("invoices", id, "Factura");
	if (invoice.status !== "draft") throw new DomainError("locked", "Doar ciornele pot fi șterse. Factura emisă se stornează.");
	const changes = { invoices: { del: [id] } };
	const order = invoice.workOrderId ? getState().workOrders[invoice.workOrderId] : null;
	if (order?.invoiceId === id) changes.workOrders = { put: [{ ...order, invoiceId: null, updatedAt: now() }] };
	commit(changes);
}

async function applyStock(tx, lines, sign) {
	for (const [partId, delta] of stockDelta(lines, sign)) {
		const part = await tx.get("parts", partId);
		if (part) tx.put("parts", { ...part, stock: round3(part.stock + delta), updatedAt: now() });
	}
}

/** Assigns the next number atomically, freezes the snapshot, consumes stock. */
export async function issueInvoiceDraft(id) {
	const s = getState();
	const draft = mustGet("invoices", id, "Factura");
	if (draft.status !== "draft") throw new DomainError("locked", "Factura este deja emisă.");
	const customer = s.customers[draft.customerId];
	const vehicle = draft.vehicleId ? s.vehicles[draft.vehicleId] : null;
	const problems = issueProblems(draft, { customer });
	if (problems.length) throw new DomainError("cannot_issue", problems[0]);

	return atomic(["invoices", "parts", "workOrders"], async (tx) => {
		const counters = await readCounters(tx);
		const series = draft.series || s.settings.invoicing.series;
		const number = counters.invoices[series] ?? s.settings.invoicing.startNumber ?? 1;
		const issued = issueInvoice({ ...draft, series }, { settings: s.settings, customer, vehicle, number, now: now() });
		tx.setMeta("counters", { ...counters, invoices: { ...counters.invoices, [series]: number + 1 } });
		tx.put("invoices", issued);
		await applyStock(tx, issued.lines, -1);
		if (issued.workOrderId) {
			const order = await tx.get("workOrders", issued.workOrderId);
			if (order) tx.put("workOrders", { ...order, invoiceId: issued.id, updatedAt: now() });
		}
		return issued;
	});
}

export async function stornoInvoiceById(id) {
	const s = getState();
	const original = mustGet("invoices", id, "Factura");
	const paid = values("payments").filter((p) => p.invoiceId === id);
	return atomic(["invoices", "parts", "workOrders", "payments"], async (tx) => {
		const counters = await readCounters(tx);
		const number = counters.invoices[original.series] ?? s.settings.invoicing.startNumber ?? 1;
		const storno = buildStorno(original, { number, today: todayISO(), now: now() });
		tx.setMeta("counters", { ...counters, invoices: { ...counters.invoices, [original.series]: number + 1 } });
		tx.put("invoices", storno);
		tx.put("invoices", {
			...original,
			status: "cancelled",
			stornoId: storno.id,
			activity: [...(original.activity ?? []), { at: now(), type: "cancelled" }],
			updatedAt: now(),
		});
		await applyStock(tx, original.lines, 1);
		if (original.workOrderId) {
			const order = await tx.get("workOrders", original.workOrderId);
			if (order?.invoiceId === original.id) tx.put("workOrders", { ...order, invoiceId: null, updatedAt: now() });
		}
		return { storno, refundDue: paid.reduce((sum, p) => sum + p.amount, 0) };
	});
}

export function recordPayment(invoiceId, { amount, method = "cash", date = todayISO(), note = "" }) {
	const s = getState();
	const invoice = mustGet("invoices", invoiceId, "Factura");
	const payments = values("payments").filter((p) => p.invoiceId === invoiceId);
	const problem = paymentProblem(amount, { invoice, payments, currency: s.settings.currency });
	if (problem) throw new DomainError("payment", problem);
	const t = now();
	const payment = { id: uid(), invoiceId, amount, method, date, note: note.trim(), createdAt: t };
	commit({ payments: { put: [payment] } });
	return payment;
}

export function deletePayment(id) {
	commit({ payments: { del: [id] } });
}

// ── reminders ────────────────────────────────────────────────────────────────

/** Marks a reminder handled; it comes back after `days` if still relevant. */
export function logContact(key, { channel = "manual", days = 7 } = {}) {
	const today = todayISO();
	commit({
		contacts: {
			put: [{ id: key, key, channel, date: today, snoozeUntil: addDaysISO(today, days), createdAt: now() }],
		},
	});
}

export function clearContact(key) {
	commit({ contacts: { del: [key] } });
}

// ── data ─────────────────────────────────────────────────────────────────────

export function exportBackup() {
	return JSON.stringify({ app: "garaj", format: 1, exportedAt: now(), ...snapshotForBackup() });
}

export async function importBackup(text) {
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		throw new DomainError("backup", "Fișierul nu este un backup Garaj valid (JSON invalid).");
	}
	if (data?.app !== "garaj" || !data.collections || !data.meta?.settings) {
		throw new DomainError("backup", "Fișierul nu este un backup Garaj.");
	}
	for (const name of COLLECTIONS) {
		const list = data.collections[name] ?? [];
		if (!Array.isArray(list) || list.some((e) => !e || typeof e.id !== "string")) {
			throw new DomainError("backup", `Backup deteriorat: colecția „${name}” are înregistrări invalide.`);
		}
		data.collections[name] = list;
	}
	await replaceAllData({ collections: data.collections, meta: data.meta });
}

export async function resetToDemo() {
	const { buildDemoData } = await import("./seed");
	await replaceAllData(buildDemoData(todayISO()));
}

export async function startFresh() {
	const { buildEmptyData } = await import("./seed");
	const { shop, invoicing, laborRate, partsMarkup, hours, currency } = getState().settings;
	const keep = getState().demo ? {} : { shop, invoicing, laborRate, partsMarkup, hours, currency };
	await replaceAllData(buildEmptyData(keep));
}

/** Developer tool: clones existing invoices into series "TST" to test large lists. */
export async function addStressInvoices(count = 5000) {
	const s = getState();
	const source = values("invoices").filter((i) => i.status === "issued" && !i.stornoOf);
	if (!source.length) throw new DomainError("invalid", "Nu există facturi de copiat.");
	const t = now();
	const today = todayISO();
	const invoices = [];
	const payments = [];
	const start = s.counters.invoices.TST ?? 1;
	for (let i = 0; i < count; i++) {
		const base = source[i % source.length];
		const issueDate = addDaysISO(today, -(i % 365));
		const invoice = { ...base, id: uid(), series: "TST", number: start + i, issueDate, dueDate: addDaysISO(issueDate, 14), workOrderId: null, createdAt: t, updatedAt: t };
		invoices.push(invoice);
		if (i % 7) payments.push({ id: uid(), invoiceId: invoice.id, amount: invoice.totals.gross, method: "card", date: issueDate, note: "", createdAt: t });
	}
	await atomic(["invoices", "payments"], async (tx) => {
		const counters = await readCounters(tx);
		tx.setMeta("counters", { ...counters, invoices: { ...counters.invoices, TST: start + count } });
		for (const invoice of invoices) tx.put("invoices", invoice);
		for (const payment of payments) tx.put("payments", payment);
	});
	return count;
}

