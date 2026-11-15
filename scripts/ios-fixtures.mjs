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

// A small backup: the demo data, a few records per collection.
const demo = buildDemoData("2026-11-15");
const collections = Object.fromEntries(Object.entries(demo.collections).map(([k, v]) => [k, v.slice(0, 4)]));
write("backup.json", { app: "garaj", format: 1, exportedAt: "2026-11-15T10:00:00.000Z", collections, meta: demo.meta });
console.log("Fixtures written to ios-native/GarajTests/Fixtures/");
