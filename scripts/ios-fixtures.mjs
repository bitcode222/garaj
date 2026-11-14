// Golden fixtures for the native iPhone app (docs/IOS-NATIVE.md §2): runs the JS
// business rules on fixed inputs and writes the answers the Swift port must match.
//   npm run ios:fixtures
import { register } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

register(new URL("./alias-loader.mjs", import.meta.url));
const money = await import("../src/domain/money.js");
const { buildDemoData } = await import("../src/lib/store/seed.js");

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

// A small backup: the demo data, a few records per collection.
const demo = buildDemoData("2026-11-15");
const collections = Object.fromEntries(Object.entries(demo.collections).map(([k, v]) => [k, v.slice(0, 4)]));
write("backup.json", { app: "garaj", format: 1, exportedAt: "2026-11-15T10:00:00.000Z", collections, meta: demo.meta });
console.log("Fixtures written to ios-native/GarajTests/Fixtures/");
