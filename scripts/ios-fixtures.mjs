// Golden fixtures for the native iPhone app (docs/IOS-NATIVE.md §2): runs the JS
// business rules on fixed inputs and writes the answers the Swift port must match.
//   npm run ios:fixtures
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

const OUT = new URL("../ios-native/GarajTests/Fixtures/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const write = (name, data) => writeFileSync(new URL(name, OUT), `${JSON.stringify(data, null, 1)}\n`);

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

// A small backup: the demo data, a few records per collection.
const demo = buildDemoData("2026-11-15");
const collections = Object.fromEntries(Object.entries(demo.collections).map(([k, v]) => [k, v.slice(0, 4)]));
write("backup.json", { app: "garaj", format: 1, exportedAt: "2026-11-15T10:00:00.000Z", collections, meta: demo.meta });
console.log("Fixtures written to ios-native/GarajTests/Fixtures/");
