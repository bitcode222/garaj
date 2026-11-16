// Golden fixtures for the native iPhone app (docs/IOS-NATIVE.md §2): runs the JS
// business rules on fixed inputs and writes the answers the Swift port must match.
//   npm run ios:fixtures
// Day boundaries depend on the time zone: pin it, and the Swift tests pin the same one.
process.env.TZ = "Europe/Bucharest";
import { register } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

register(new URL("./alias-loader.mjs", import.meta.url));
const money = await import("../src/domain/money.js");
const { buildDemoData } = await import("../src/lib/store/seed.js");
const lines = await import("../src/domain/lines.js");
const wo = await import("../src/domain/work-order.js");
const customer = await import("../src/domain/customer.js");
const vehicle = await import("../src/domain/vehicle.js");
const { DEFAULT_SETTINGS } = await import("../src/lib/store/defaults.js");
const invoice = await import("../src/domain/invoice.js");
const agenda = await import("../src/domain/agenda.js");
const analytics = await import("../src/domain/analytics.js");
const alist = await import("../src/domain/appointment-list.js");
const appt = await import("../src/domain/appointment.js");
const search = await import("../src/domain/search.js");
const reminders = await import("../src/domain/reminders.js");
const inventory = await import("../src/domain/inventory.js");
const clock = await import("../src/domain/work-clock.js");

const OUT = new URL("../ios-native/GarajTests/Fixtures/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const write = (name, data, { compact = false } = {}) => writeFileSync(new URL(name, OUT), `${JSON.stringify(data, null, compact ? 0 : 1)}\n`);

const moneyInputs = [
	"0", "1", "12", "12,5", "12.5", "12,50 lei", "1.234,56", "1,234.56", "1 234,56", "1.234", "1.234.567", "1,234,567",
	"1234.5678", "0,005", "0,004", "0,015", "-12,34", "-0", ",5", ".5", "5.", "abc", "", "  ", "12,3,4", "1.23.4", "€ 99", "99 ron",
	"1'234,50", "1 234,50", "1 234,50", "12.34.56", "007", "9.99", "1.000,", "100 EUR",
];
const percent = [[10000, 21], [12345, 19], [99, 21], [-12345, 21], [15, 50], [5, 10], [-5, 10], [73950, 21], [100, 9.5], [1, 33.33]];
const divs = [[5, 2], [-5, 2], [7, 3], [-7, 3], [1, 2], [-1, 2], [10, 4], [-10, 4], [0, 3]];
const amounts = [0, 1, 99, 100, 123456, -123456, 100000000, 5, -5, 1999999];
const quantities = ["1", "1,5", "0.25", "1,23456", "-2", ".5", "5.", "-.5", "", "-", "abc", "1.2.3", "0,0005", "0,0015"];

write("money.json", {
	parse: moneyInputs.map((input) => ({ input, output: money.parseMoney(input) })),
	percentOf: percent.map(([amount, rate]) => ({ amount, rate, output: money.percentOf(amount, rate) })),
	divRound: divs.map(([num, den]) => ({ num, den, output: Number(money.divRound(BigInt(num), BigInt(den))) })),
	format: amounts.map((minor) => ({ minor, output: money.formatMoney(minor), signed: money.formatMoney(minor, "RON", { sign: true }), input: money.toInputAmount(minor) })),
	parseQuantity: quantities.map((input) => ({ input, output: money.parseQuantity(input) })),
	formatQuantity: [0, 1, 1.5, 0.125, 1234.5, 2.0005].map((qty) => ({ qty, output: money.formatQuantity(qty) })),
});

// Lines and totals: demo jobs plus edge cases (discounts, odd quantities, mixed VAT, a shop that is not a VAT payer).
const demoAll = buildDemoData("2026-11-15");
const L = (kind, qty, unitPrice, extra = {}) => ({ id: "x", kind, refId: null, description: "d", qty, unit: "buc", unitPrice, discountPct: 0, vatRate: 21, cost: 0, staffId: null, ...extra });
const docs = [
	...demoAll.collections.workOrders.slice(0, 60).map((o) => o.lines),
	[L("labor", 0.333, 15000, { discountPct: 12.5 }), L("part", 3, 1999, { cost: 1500 }), L("fee", 1, 2500, { vatRate: 9 })],
	[L("part", 0.001, 1), L("part", 1234.567, 99999, { discountPct: 100 }), L("labor", 2.5, 18000, { cost: 9000, vatRate: 0 })],
	[L("labor", 1, 12345, { discountPct: 33.33 }), L("labor", 1, 12345, { discountPct: 66.67 })],
	[],
];
write("lines.json", {
	documents: docs.flatMap((ls) => [true, false].map((vatPayer) => ({ vatPayer, lines: ls, totals: lines.computeTotals(ls, { vatPayer }), net: ls.map(lines.lineNet), gross: ls.map((l) => lines.lineGross(l, vatPayer)) }))),
});

// The job's flow, plates, phones and the estimate message.
const statuses = [...wo.WO_FLOW, "cancelled", "declined"];
const settings = { ...DEFAULT_SETTINGS, shop: { ...DEFAULT_SETTINGS.shop, name: "Service Test" } };
const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
const customers = byId(demoAll.collections.customers);
const vehicles = byId(demoAll.collections.vehicles);
const jobs = demoAll.collections.workOrders.filter((o) => o.lines.length).slice(0, 8);
jobs[0] = { ...jobs[0], inspection: [{ key: "brakes", status: "urgent", note: "plăcuțe 2 mm" }, { key: "tires", status: "attention", note: "" }] };
write("rules.json", {
	moves: statuses.flatMap((from) => statuses.map((to) => ({ from, to, can: wo.canTransition(from, to), skipped: wo.skippedStages(from, to), backward: wo.isBackwardMove(from, to) }))),
	plates: ["b123abc", "B-12-XYZ", "cj 12 xyz", "IF74ZXX", "B 999", "CT123456", "  xyz  12 ", "ABC"].map((input) => ({ input, output: vehicle.formatPlate(input), normalized: vehicle.normalizePlate(input) })),
	phones: ["0722 123 456", "+40722123456", "0040 722 123 456", "40722123456", "722123456", "021-123.45.67", ""].map((input) => ({ input, normalized: customer.normalizePhone(input), formatted: customer.formatPhone(input) })),
	greetings: demoAll.collections.customers.slice(0, 12).map((c) => ({ customer: c, output: customer.greetingName(c) })),
	messages: jobs.map((order) => ({
		order,
		customer: customers[order.customerId] ?? null,
		vehicle: vehicles[order.vehicleId] ?? null,
		estimate: wo.estimateMessage({ order, customer: customers[order.customerId], vehicle: vehicles[order.vehicleId], settings }),
		ready: wo.readyMessage({ customer: customers[order.customerId], vehicle: vehicles[order.vehicleId], settings }),
	})),
	settings,
});

// Invoices: displayed state, what blocks issuing, issuing, storno, payments, the share message.
{
	const today = "2026-11-15";
	const payments = demoAll.collections.payments;
	const byInvoice = (id) => payments.filter((p) => p.invoiceId === id);
	const all = demoAll.collections.invoices;
	const sample = [...all.slice(0, 30), ...all.filter((i) => i.stornoOf || i.status === "cancelled").slice(0, 6), ...all.slice(-30)];
	const shop = { ...DEFAULT_SETTINGS.shop, name: "Service Test", legalName: "Service Test SRL", cui: "RO123", regCom: "J40/1/2020", address: "Str. Lungă 1", city: "București", iban: "RO49AAAA1B31007593840000", bank: "Banca Test" };
	const settingsVat = { ...DEFAULT_SETTINGS, shop };
	const settingsNoVat = { ...settingsVat, invoicing: { ...settingsVat.invoicing, vatPayer: false } };
	const now = "2026-11-15T10:00:00.000Z";
	const drafts = demoAll.collections.workOrders.filter((o) => o.lines.length).slice(0, 6).map((o, i) => ({
		id: `draft${i}`, status: "draft", series: "GRJ", number: null, issueDate: today, dueDate: "2026-11-29",
		customerId: o.customerId, vehicleId: o.vehicleId, workOrderId: o.id, mileage: o.mileage ?? null,
		lines: o.lines, notes: "", activity: [], createdAt: now, updatedAt: now,
	}));
	const issues = drafts.flatMap((d, i) => [settingsVat, settingsNoVat].map((settings) => {
		const customer = customers[d.customerId];
		const issued = invoice.issueInvoice(d, { settings, customer, vehicle: vehicles[d.vehicleId], number: 100 + i, now });
		const storno = invoice.buildStorno(issued, { number: 200 + i, today, now });
		return { draft: d, settings, customer, vehicle: vehicles[d.vehicleId], number: 100 + i, issued, storno };
	}));
	const company = { ...demoAll.collections.customers[0], type: "company", cui: "" };
	const blank = { id: "b", status: "draft", series: "GRJ", lines: [], issueDate: "", dueDate: "2026-01-01" };
	const badLine = { ...blank, issueDate: "2026-02-01", lines: [{ id: "l", kind: "part", description: "", qty: 0, unit: "buc", unitPrice: 100, discountPct: 0, vatRate: 21, cost: 0 }] };
	const issuedOne = issues[0].issued;
	write("invoices.json", {
		today,
		states: sample.map((inv) => ({ invoice: inv, payments: byInvoice(inv.id), state: invoice.invoiceState(inv, byInvoice(inv.id), today), label: invoice.formatInvoiceNumber(inv.series, inv.number) })),
		checklists: [
			{ draft: blank, customer: null },
			{ draft: blank, customer: company },
			{ draft: badLine, customer: demoAll.collections.customers[1] },
			{ draft: drafts[0], customer: customers[drafts[0].customerId] },
		].map((c) => ({ ...c, problems: invoice.issueChecklist(c.draft, { customer: c.customer }) })),
		issues,
		payments: [0, -5, 1, 100, issuedOne.totals.gross, issuedOne.totals.gross + 1].map((amount) => ({ amount, problem: invoice.paymentProblem(amount, { invoice: issuedOne, payments: [{ amount: 100 }] }) })),
		messages: [0, 100, issuedOne.totals.gross].map((paid) => ({ invoice: issuedOne, balance: issuedOne.totals.gross - paid, settings: settingsVat, text: invoice.invoiceMessage({ invoice: issuedOne, balance: issuedOne.totals.gross - paid, settings: settingsVat }) })),
	});
}

// Azi: bookings to confirm, invoices to collect, the cars in the shop, the analytics (docs/HOME-PAGE.md).
{
	const today = "2026-11-15";
	const now = new Date("2026-11-15T11:20:00").toISOString();
	const c = demoAll.collections;
	const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]).filter(([, v]) => v !== undefined));
	const local = (day, h, m = 0) => new Date(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`).toISOString();
	const extra = (id, day, h, status, more = {}) => ({ id, start: local(day, h), end: local(day, h + 1), customerId: c.customers[0].id, vehicleId: c.vehicles[0].id, title: "x", serviceIds: [], status, workOrderId: null, activity: [], ...more });
	const appointments = [
		...c.appointments,
		extra("late-today", today, 10, "scheduled"),
		extra("late-but-announced", today, 10, "confirmed", { expectedAt: local(today, 11, 30) }),
		extra("grace", today, 11, "scheduled"),
		extra("missed-yesterday", "2026-11-14", 9, "confirmed"),
		extra("missed-long-ago", "2026-11-01", 9, "scheduled"),
		extra("cancelled-today", today, 16, "cancelled"),
	];
	// Only what the rules read (lines only where an amount is computed from them), to keep the file small.
	const open = new Set(["estimate", "approved", "in_progress", "waiting_parts", "ready"]);
	const workOrders = c.workOrders.map((o) => ({ ...pick(o, ["id", "number", "status", "createdAt", "dates", "appointmentId"]), lines: open.has(o.status) ? o.lines : [] }));
	const invoices = c.invoices.map((i) => ({ ...pick(i, ["id", "status", "series", "number", "issueDate", "dueDate", "createdAt", "stornoOf"]), totals: i.totals && pick(i.totals, ["net", "vat", "gross", "hours"]), lines: i.status === "draft" ? i.lines : [] }));
	const payments = c.payments;
	const byInvoice = new Map();
	for (const p of payments) byInvoice.set(p.invoiceId, [...(byInvoice.get(p.invoiceId) ?? []), p]);
	const settings = DEFAULT_SETTINGS;
	const booked = agenda.bookingsToConfirm(appointments, { now });
	const collect = agenda.invoicesToCollect(invoices, byInvoice, { today });
	const jobs = agenda.jobsToShow(workOrders, { stages: ["estimate", "approved", "in_progress", "waiting_parts", "ready"], settings });
	write("home.json", {
		today, now, appointments, workOrders, invoices, payments,
		bookings: { groups: booked.groups.map((g) => ({ key: g.key, ids: g.items.map((a) => a.id) })), total: booked.total, week: booked.week },
		collect: { groups: collect.groups.map((g) => ({ key: g.key, amount: g.amount, items: g.items.map((i) => ({ id: i.invoice.id, balance: i.balance, paid: i.paid, overdueDays: i.overdueDays, dueIn: i.dueIn })) })), total: collect.total, due: collect.due, drafts: collect.drafts },
		jobs: jobs.groups.map((g) => ({ key: g.key, ids: g.items.map((o) => o.id), amount: g.amount })),
		passed: appointments.map((a) => ({ id: a.id, passed: agenda.bookingPassed(a, now) })),
		analytics: analytics.PERIODS.map((period) => {
			const h = analytics.homeAnalytics({ payments, workOrders, invoices, appointments }, { today, period });
			const m = (x) => ({ value: x.value, points: x.points, empty: x.empty, change: x.change });
			return { period, window: h.window, collected: m(h.collected), received: m(h.received), ticket: m(h.ticket), show: m(h.show), stay: m(h.stay), hours: m(h.hours) };
		}),
	}, { compact: true });
}

// Toate programările: list, counts, groups, stats, conflicts, search folding.
{
	const today = "2026-11-15";
	const now = new Date("2026-11-15T11:20:00").toISOString();
	const c = demoAll.collections;
	const appointments = c.appointments.map((a, i) => (i % 9 === 0 ? { ...a, number: undefined } : a)).map((a) => JSON.parse(JSON.stringify(a)));
	const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
	const customers = c.customers.map((x) => pick(x, ["id", "type", "name", "phone"]));
	const vehicles = c.vehicles.map((x) => pick(x, ["id", "plate", "make", "model"]));
	const services = c.services.map((x) => pick(x, ["id", "name", "hours", "price"]));
	const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
	const lookups = { customers: byId(customers), vehicles: byId(vehicles), services: byId(services) };
	const staff = c.staff[0].id;
	const queries = ["", "dacia", "B 1", "ștefan", "#1", "07", "revizie ulei"];
	const cases = [];
	for (const status of alist.STATUS_FILTERS)
		for (const period of ["upcoming", "today", "next7", "week", "month", "past", "all"]) cases.push({ status, period, staff: "all", query: "", sort: "time" });
	for (const query of queries) cases.push({ status: "all", period: "all", staff: "all", query, sort: "time" });
	for (const sort of ["time", "created", "customer"]) cases.push({ status: "all", period: "past", staff, query: "", sort }, { status: "all", period: "upcoming", staff: "none", query: "", sort });
	const results = cases.map((k) => {
		const r = alist.listAppointments(appointments, { ...k, tokens: search.queryTokens(k.query), today, now, lookups });
		return { ...k, ids: r.rows.map((a) => a.id), counts: r.counts };
	});
	const all = alist.listAppointments(appointments, { status: "all", period: "all", today, now, lookups }).rows;
	const groups = alist.groupByDay(all).map((g) => ({ day: g.day, ids: g.items.map((a) => a.id), minutes: g.minutes }));
	const hours = DEFAULT_SETTINGS.hours;
	const stats = alist.appointmentStats(appointments, { today, now, staff: c.staff, hours });
	const conflicts = appointments.slice(0, 40).map((a) => ({ id: a.id, ids: appt.findConflicts(a, appointments).map((o) => o.id) }));
	write("appointments.json", {
		today, now, appointments, customers, vehicles, services, staffCount: c.staff.length, hours,
		results, groups, stats: { todayCount: stats.today.count, nextId: stats.today.next?.id ?? null, toConfirm: stats.toConfirm, noShow: stats.noShow, booked: stats.load.booked, capacity: stats.load.capacity },
		conflicts,
		folds: ["Ștefan Ionescu", "ȘȚĂÂÎ șțăâî", "Brutăria Bunica SRL", "B 123, abc"].map((input) => ({ input, fold: search.fold(input), tokens: search.queryTokens(input) })),
		ranges: ["upcoming", "today", "next7", "week", "month", "past", "all"].flatMap((period) => ["2026-11-15", "2026-11-16", "2026-02-28", "2026-12-31"].map((t) => ({ period, today: t, range: alist.periodRange(period, t) }))),
	}, { compact: true });
}

// The calendar's geometry (src/features/calendar/utils.js); the module imports app paths, so through the alias loader.
{
	const cal = await import("../src/features/calendar/utils.js");
	const c = demoAll.collections;
	const byDayStaff = new Map();
	for (const a of c.appointments) {
		if (a.status === "cancelled") continue;
		const key = `${new Date(a.start).toDateString()}|${a.staffId}`;
		byDayStaff.set(key, [...(byDayStaff.get(key) ?? []), a]);
	}
	const overlapping = [
		{ id: "a", start: "2026-11-16T08:00:00.000Z", end: "2026-11-16T10:00:00.000Z" },
		{ id: "b", start: "2026-11-16T08:30:00.000Z", end: "2026-11-16T09:00:00.000Z" },
		{ id: "c", start: "2026-11-16T09:00:00.000Z", end: "2026-11-16T11:00:00.000Z" },
		{ id: "d", start: "2026-11-16T08:00:00.000Z", end: "2026-11-16T08:30:00.000Z" },
		{ id: "e", start: "2026-11-16T11:00:00.000Z", end: "2026-11-16T12:00:00.000Z" },
	];
	const groups = [...byDayStaff.values(), overlapping];
	write("calendar.json", {
		layouts: groups.map((events) => ({ events: events.map((e) => ({ id: e.id, start: e.start, end: e.end })), placed: cal.layoutEvents(events).map((p) => ({ id: p.event.id, lane: p.lane, lanes: p.lanes })) })),
		bounds: groups.slice(0, 20).map((events) => ({ events: events.map((e) => ({ start: e.start, end: e.end })), bounds: cal.timeBounds(DEFAULT_SETTINGS, events) })),
		weeks: ["2026-11-15", "2026-11-16", "2026-03-29", "2026-10-25", "2026-12-31", "2027-01-01"].map((day) => ({ day, week: cal.weekDays(day), month: cal.monthGrid(day) })),
		minutes: ["2026-03-29", "2026-10-25", "2026-11-16"].flatMap((day) => [0, 120, 180, 210, 240, 480, 1439].map((m) => ({ day, m, at: cal.atMinute(day, m), back: cal.minuteOfDay(cal.atMinute(day, m)) }))),
		open: DEFAULT_SETTINGS.hours.open, close: DEFAULT_SETTINGS.hours.close,
	}, { compact: true });
}

// Clienți and Mașini: checks, deadlines, the service estimate, a customer's facts.
{
	const today = "2026-11-15";
	const c = demoAll.collections;
	const vehicles = c.vehicles;
	write("people.json", {
		today,
		cui: ["RO18547290", "18547290", "RO 18547290", "18547291", "1", "12345678901", "RO310041489", "14399840", "abc", ""].map((input) => ({ input, ok: customer.isValidCUI(input) })),
		iban: ["RO49AAAA1B31007593840000", "RO49 AAAA 1B31 0075 9384 0000", "RO49AAAA1B31007593840001", "DE89370400440532013000", "RO49AAAA1B3100759384000", "x"].map((input) => ({ input, ok: customer.isValidIBAN(input), formatted: customer.formatIBAN(input) })),
		email: ["a@b.ro", "a@b", " a@b.co ", "a b@c.ro", ""].map((input) => ({ input, ok: customer.isValidEmail(input) })),
		initials: ["Andrei Popescu", "Ion", "  ", "Brutăria Bunica SRL", "ștefan"].map((input) => ({ input, output: customer.initials(input) })),
		vin: ["", "WAU68YKK4RMZP7XRW", "WAU68YKK4RMZP7XR", "WAU68YKK4RMZP7XRI", "WAU68YKK4RMZP7XR-", "wau68ykk4rmzp7xrw"].map((input) => ({ input, issue: vehicle.vinIssue(input) })),
		deadlines: ["2026-11-15", "2026-11-14", "2026-12-15", "2026-12-16", null].map((date) => ({ date, d: vehicle.deadline(date, today) })),
		vehicles: vehicles.map((v) => ({ vehicle: v, service: vehicle.serviceDue(v, today), est: vehicle.estimateKm(v, today), perDay: vehicle.kmPerDay(v.mileage) })),
		facts: c.customers.map((x) => ({ id: x.id, facts: customer.customerFacts(x.id, { appointments: c.appointments, workOrders: c.workOrders }) })),
		appointments: c.appointments.map((a) => ({ id: a.id, customerId: a.customerId, status: a.status, start: a.start, end: a.end })),
		workOrders: c.workOrders.map((o) => ({ id: o.id, customerId: o.customerId, status: o.status, createdAt: o.createdAt, dates: o.dates })),
	}, { compact: true });
}

// De contactat and Catalog: reminders and their messages, stock levels, prices from cost.
{
	const today = "2026-11-15";
	const c = demoAll.collections;
	const byId = (list) => new Map(list.map((x) => [x.id, x]));
	const paymentsByInvoice = new Map();
	for (const p of c.payments) paymentsByInvoice.set(p.invoiceId, [...(paymentsByInvoice.get(p.invoiceId) ?? []), p]);
	const all = reminders.computeReminders({ today, vehicles: c.vehicles, customersById: byId(c.customers), invoices: c.invoices, paymentsByInvoice, workOrders: c.workOrders, appointments: c.appointments, contactsByKey: new Map() });
	// Snooze a few: one until tomorrow (hidden), one that ended today (shown again).
	const contacts = [
		{ id: all[0].key, key: all[0].key, channel: "whatsapp", date: "2026-11-10", snoozeUntil: "2026-11-16", createdAt: "x" },
		{ id: all[1].key, key: all[1].key, channel: "snooze", date: "2026-11-08", snoozeUntil: "2026-11-15", createdAt: "x" },
	];
	const snoozed = reminders.computeReminders({ today, vehicles: c.vehicles, customersById: byId(c.customers), invoices: c.invoices, paymentsByInvoice, workOrders: c.workOrders, appointments: c.appointments, contactsByKey: new Map(contacts.map((x) => [x.key, x])) });
	const settings = { ...DEFAULT_SETTINGS, shop: { ...DEFAULT_SETTINGS.shop, name: "Service Test", phone: "0722 000 111", iban: "RO49AAAA1B31007593840000" } };
	const customers = byId(c.customers), vehicles = byId(c.vehicles), invoices = byId(c.invoices);
	const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
	const reserved = inventory.reservedByPart(c.workOrders, invoices);
	write("reminders.json", {
		today, settings, contacts,
		vehicles: c.vehicles, customers: c.customers,
		invoices: c.invoices.filter((i) => i.status === "issued" && !i.stornoOf).map((i) => ({ ...pick(i, ["id", "status", "series", "number", "issueDate", "dueDate", "customerId", "vehicleId", "createdAt"]), totals: pick(i.totals, ["gross"]) })),
		payments: c.payments.map((x) => pick(x, ["id", "invoiceId", "amount"])),
		workOrders: c.workOrders.filter((o) => o.status !== "delivered" && o.status !== "cancelled").map((o) => ({ ...pick(o, ["id", "number", "status", "customerId", "vehicleId", "dates", "createdAt", "invoiceId"]), lines: o.lines.filter((l) => l.kind === "part") })),
		appointments: c.appointments.filter((a) => a.status === "scheduled").map((a) => pick(a, ["id", "status", "start", "end", "customerId", "vehicleId"])),
		all: all.map((r) => ({ ...r, message: reminders.reminderMessage(r, { customer: customers.get(r.customerId), vehicle: vehicles.get(r.vehicleId), invoice: invoices.get(r.invoiceId), settings }) })),
		snoozed: snoozed.map((r) => r.key),
		parts: c.parts.map((p) => ({ part: p, level: inventory.stockLevel(p, reserved.get(p.id) ?? 0), reserved: reserved.get(p.id) ?? 0 })),
		prices: [[4200, 35], [100, 0], [12345, 27.5], [1, 35], [99999, 100], [0, 50]].map(([cost, markup]) => ({ cost, markup, price: lines.priceFromCost(cost, markup) })),
	}, { compact: true });
}

// Rapoarte: revenue by month/day, summary, top operations, mechanics, payment mix, aging.
{
	const reports = await import("../src/domain/reports.js");
	const today = "2026-11-15";
	const c = demoAll.collections;
	const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]).filter(([, v]) => v !== undefined));
	const invoices = c.invoices.map((i) => ({
		...pick(i, ["id", "status", "series", "number", "issueDate", "dueDate", "stornoOf", "totals"]),
		lines: i.lines.filter((l) => l.kind === "labor").map((l) => pick(l, ["id", "kind", "refId", "description", "qty", "unitPrice", "discountPct", "vatRate", "cost", "staffId"])),
	}));
	const payments = c.payments.map((p) => pick(p, ["id", "invoiceId", "amount", "method", "date"]));
	const byInvoice = new Map();
	for (const p of payments) byInvoice.set(p.invoiceId, [...(byInvoice.get(p.invoiceId) ?? []), p]);
	const range = (period) => {
		if (period === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
		if (period === "year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
		return { from: `${reports.monthRange(today, period === "3m" ? 3 : 12)[0]}-01`, to: today };
	};
	const days = Array.from({ length: 15 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
	write("reports.json", {
		today,
		invoices,
		payments,
		monthRanges: [1, 3, 12, 25].map((count) => ({ count, months: reports.monthRange(today, count) })),
		byMonth: reports.revenueByMonth(invoices, reports.monthRange(today, 12)),
		byDay: reports.revenueByDay(invoices, days),
		periods: ["month", "3m", "12m", "year"].map((period) => {
			const r = range(period);
			return { period, ...r, summary: reports.summarize(invoices, r), top: reports.topServices(invoices, { ...r, limit: 6 }), staff: reports.staffProductivity(invoices, r), mix: reports.paymentMix(payments, r) };
		}),
		aging: reports.receivablesAging(invoices, byInvoice, today),
	}, { compact: true });
}

// Operations on a booking or job form (lines.js): from the catalog, figures, VAT rate, estimate.
{
	const services = [...demoAll.collections.services.slice(0, 12), { id: "free", name: "Gratuit", hours: 0, price: 0, cost: 0 }, { id: "odd", name: "Ciudat", hours: 0.33, price: 0, cost: 1234 }];
	const ops = [
		...services.map((sv, i) => ({ id: `op${i}`, ...lines.operationFromService(sv, 18000) })),
		{ id: "x1", name: "Liberă", hours: 1.25, price: 22550, cost: 9000 },
		{ id: "x2", name: "TVA redus", hours: 0.5, price: 10001, cost: 0, vatRate: 9 },
		{ id: "x3", name: "Fără TVA", hours: 2, price: 33333, cost: 50000, vatRate: 0 },
		{ id: "x4", name: "Negativ", hours: 1, price: -500, cost: -10 },
	];
	write("operations.json", {
		laborRate: 18000,
		services,
		fromService: services.map((sv) => lines.operationFromService(sv, 18000)),
		ops,
		figures: ops.flatMap((op) => [21, 9, 0].map((rate) => ({ id: op.id, rate, ...lines.operationFigures(op, rate) }))),
		vatRates: ops.flatMap((op) => [true, false].map((vatPayer) => ({ id: op.id, vatPayer, rate: lines.operationVatRate(op, { vatPayer, vatRate: 21 }) }))),
		estimate: [true, false].map((vatPayer) => ({ vatPayer, ...lines.operationsEstimate(ops, { vatPayer, vatRate: 21 }) })),
	});
}

// The running job (work-clock.js): time worked, steps, starting work, running jobs.
{
	const T = (h, m = 0) => `2026-11-16T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
	const base = demoAll.collections.workOrders.filter((o) => o.lines.length).slice(0, 6);
	const jobs = base.map((o, i) => ({
		...o,
		status: ["estimate", "approved", "in_progress", "waiting_parts", "ready", "in_progress"][i],
		lines: o.lines.map((l, j) => ({ ...l, ...(j % 2 === 0 && i % 2 === 0 ? { done: true } : null), ...(j === 1 && i === 3 ? { refused: true } : null) })),
		timeLog: i === 2 ? [{ id: "t1", staffId: "m1", start: T(7), end: T(8, 15) }, { id: "t2", staffId: "m1", start: T(9), end: null }]
			: i === 5 ? [{ id: "t3", staffId: "m2", start: T(8, 30), end: null }] : [],
	}));
	const now = T(10, 5);
	write("work-clock.json", {
		now,
		jobs,
		worked: jobs.map((o) => ({ id: o.id, ms: clock.workedMs(o, now) })),
		steps: jobs.map((o) => { const s = clock.steps(o); return { id: o.id, total: s.total, done: s.done, current: s.current?.id ?? null }; }),
		starts: jobs.flatMap((o) => ["m1", "m2", null].map((staffId) => {
			try {
				const r = clock.startWork(o, { staffId, now, orders: jobs, id: "new" });
				return { id: o.id, staffId, status: r.order.status, timeLog: r.order.timeLog, stopped: r.stopped.map((x) => ({ id: x.id, timeLog: x.timeLog })) };
			} catch (e) { return { id: o.id, staffId, error: e.code }; }
		})).concat([{ ...(() => { try { clock.startWork({ ...jobs[0], status: "delivered" }, { now }); return {}; } catch (e) { return { error: e.code }; } })(), id: "closed", staffId: null }]),
		running: clock.runningJobs(jobs).map((o) => o.id),
	});
}

// A small backup: the demo data, a few records per collection.
const demo = buildDemoData("2026-11-15");
const collections = Object.fromEntries(Object.entries(demo.collections).map(([k, v]) => [k, v.slice(0, 4)]));
write("backup.json", { app: "garaj", format: 1, exportedAt: "2026-11-15T10:00:00.000Z", collections, meta: demo.meta });
console.log("Fixtures written to ios-native/GarajTests/Fixtures/");
