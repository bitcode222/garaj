// Demo shop: a Bucharest garage with 12 months of history, generated relative
// to "today" so the demo always looks current. Deterministic (seeded PRNG), so
// every install tells the same story. Loaded with a dynamic import on first run.

import { addDaysISO, combineDateTime, diffDaysISO, parseISODate } from "@/domain/dates";
import { uid } from "@/domain/ids";
import { buildStorno, issueInvoice } from "@/domain/invoice";
import { priceFromCost } from "@/domain/lines";
import { defaultInspection } from "@/domain/work-order";
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from "./defaults";

function mulberry32(seed) {
	let a = seed;
	return () => {
		a += 0x6d2b79f5;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const LABOR_RATE = 18000;
const MARKUP = 35;

const SETTINGS = {
	...DEFAULT_SETTINGS,
	shop: {
		name: "Garaj Auto Pro",
		legalName: "Garaj Auto Pro SRL",
		cui: "RO12345674",
		regCom: "J40/1234/2019",
		address: "Str. Mecanicilor 12",
		city: "București",
		county: "Sector 3",
		phone: "0722 555 010",
		email: "programari@garaj-demo.ro",
		iban: "RO49AAAA1B31007593840000",
		bank: "Banca Exemplu",
		logo: null,
	},
	invoicing: { ...DEFAULT_SETTINGS.invoicing, series: "GRJ", vatPayer: true, vatRate: 21, dueDays: 14 },
	laborRate: LABOR_RATE,
	partsMarkup: MARKUP,
};

const STAFF = [
	["Andrei Popescu", "mechanic", "blue"],
	["Mihai Ionescu", "mechanic", "green"],
	["Ionuț Dumitru", "electrician", "purple"],
	["Cristian Stan", "mechanic", "orange"],
];

const BAYS = [
	["Elevator 1", "lift"],
	["Elevator 2", "lift"],
	["Elevator 3", "lift"],
	["Geometrie", "alignment"],
];

// key, code, name, brand, unit, cost (lei), stock, min, shelf
const PARTS = [
	["oil5w30", "CAS-EDGE-5W30", "Ulei motor 5W-30", "Castrol", "l", 42, 38, 20, "A1"],
	["oil5w40", "MOB-1-5W40", "Ulei motor 5W-40", "Mobil", "l", 38, 24, 15, "A1"],
	["oilfilter", "MANN-W712", "Filtru ulei", "Mann-Filter", "buc", 28, 14, 6, "A2"],
	["airfilter", "MANN-C2774", "Filtru aer", "Mann-Filter", "buc", 45, 9, 4, "A2"],
	["cabinfilter", "BOSCH-1987", "Filtru polen cu carbon activ", "Bosch", "buc", 55, 7, 4, "A2"],
	["fuelfilter", "MANN-WK820", "Filtru combustibil", "Mann-Filter", "buc", 78, 3, 3, "A3"],
	["padsfront", "ATE-13046", "Plăcuțe frână față", "ATE", "set", 165, 6, 3, "B1"],
	["padsrear", "TRW-GDB1550", "Plăcuțe frână spate", "TRW", "set", 130, 4, 2, "B1"],
	["discsfront", "BREMBO-09A", "Discuri frână față", "Brembo", "set", 390, 2, 2, "B2"],
	["brakefluid", "ATE-DOT4", "Lichid frână DOT 4", "ATE", "l", 45, 12, 4, "A4"],
	["coolant", "VAL-G12", "Antigel G12+ concentrat", "Valvoline", "l", 32, 16, 6, "A4"],
	["timingkit", "GATES-K015", "Kit distribuție cu pompă de apă", "Gates", "set", 820, 2, 1, "C1"],
	["accbelt", "CONTI-6PK", "Curea accesorii", "Contitech", "buc", 95, 4, 2, "C1"],
	["battery74", "VARTA-E11", "Acumulator 74 Ah 680 A", "Varta", "buc", 520, 3, 2, "D1"],
	["sparkplug", "NGK-BKR6", "Bujie", "NGK", "buc", 32, 20, 8, "A3"],
	["glowplug", "BERU-GE", "Bujie incandescentă", "Beru", "buc", 68, 0, 4, "A3"],
	["shockfront", "SACHS-315", "Amortizor față", "Sachs", "buc", 340, 2, 2, "C2"],
	["clutchkit", "LUK-624", "Kit ambreiaj", "LuK", "set", 980, 1, 1, "C3"],
	["h7", "PHIL-H7", "Bec H7", "Philips", "buc", 22, 18, 6, "D2"],
	["wipers", "BOSCH-AERO", "Ștergătoare (set)", "Bosch", "set", 110, 5, 3, "D2"],
	["refrigerant", "R1234YF", "Freon R1234yf", "Honeywell", "100 g", 90, 12, 5, "D3"],
	["acclean", "LM-KLIMA", "Spumă igienizare AC", "Liqui Moly", "buc", 48, 6, 3, "D3"],
	["tierod", "LEMF-TR", "Cap de bară", "Lemförder", "buc", 88, 3, 2, "C2"],
	["stabilizer", "MEYLE-BL", "Bieletă antiruliu", "Meyle", "buc", 62, 4, 2, "C2"],
	["wheelbearing", "SKF-VKBA", "Kit rulment roată", "SKF", "buc", 210, 2, 1, "C2"],
	["exhaustclamp", "WALK-CL", "Colier evacuare", "Walker", "buc", 25, 10, 4, "C4"],
	["dpfclean", "LM-DPF", "Soluție curățare DPF", "Liqui Moly", "buc", 120, 2, 2, "D3"],
	["washer", "WASH-5L", "Lichid parbriz −20 °C, 5 L", "Prestone", "buc", 28, 9, 4, "D4"],
];

// key, name, category, hours, parts [[key, qty]], weight
const SERVICES = [
	["oil", "Schimb ulei și filtru", "maintenance", 0.6, [["oil5w30", 4.5], ["oilfilter", 1]], 18],
	["revision", "Revizie completă (ulei și filtre)", "maintenance", 1.5, [["oil5w30", 4.5], ["oilfilter", 1], ["airfilter", 1], ["cabinfilter", 1]], 14],
	["padsF", "Înlocuire plăcuțe frână față", "brakes", 1, [["padsfront", 1]], 8],
	["padsR", "Înlocuire plăcuțe frână spate", "brakes", 1, [["padsrear", 1]], 5],
	["discsF", "Înlocuire discuri și plăcuțe față", "brakes", 1.6, [["discsfront", 1], ["padsfront", 1]], 4],
	["brakefluid", "Înlocuire lichid de frână", "brakes", 0.7, [["brakefluid", 1]], 3],
	["timing", "Înlocuire kit distribuție și pompă apă", "engine", 4, [["timingkit", 1], ["coolant", 3], ["accbelt", 1]], 2],
	["spark", "Înlocuire bujii", "engine", 0.6, [["sparkplug", 4]], 3],
	["diag", "Diagnoză computerizată", "diagnostics", 0.5, [], 9],
	["battery", "Înlocuire acumulator", "electrical", 0.3, [["battery74", 1]], 3],
	["bulb", "Înlocuire bec far", "electrical", 0.3, [["h7", 1]], 3],
	["alignment", "Geometrie roți", "tires", 0.8, [], 5],
	["balance", "Echilibrare roți (4 buc.)", "tires", 0.5, [], 3],
	["tireswap", "Schimb anvelope sezonier (4 buc.)", "tires", 0.6, [], 4],
	["acrecharge", "Încărcare freon AC", "ac", 0.7, [["refrigerant", 5]], 3],
	["acclean", "Igienizare instalație AC", "ac", 0.5, [["acclean", 1], ["cabinfilter", 1]], 2],
	["shocks", "Înlocuire amortizoare față", "suspension", 2, [["shockfront", 2]], 2],
	["tierods", "Înlocuire capete de bară", "suspension", 1, [["tierod", 2]], 2],
	["links", "Înlocuire biellete antiruliu", "suspension", 0.8, [["stabilizer", 2]], 3],
	["bearing", "Înlocuire rulment roată", "suspension", 1.5, [["wheelbearing", 1]], 1],
	["clutch", "Înlocuire kit ambreiaj", "transmission", 5, [["clutchkit", 1]], 1],
	["preitp", "Verificare pre-ITP", "inspection", 0.5, [], 4],
	["exhaust", "Reparație sistem de evacuare", "exhaust", 1.2, [["exhaustclamp", 2]], 1],
	["dpf", "Curățare filtru de particule (DPF)", "engine", 1.5, [["dpfclean", 1]], 1],
];

const MODELS = [
	["Dacia", "Logan", "1.0 SCe", "petrol", "UU1"],
	["Dacia", "Sandero", "0.9 TCe", "petrol", "UU1"],
	["Dacia", "Duster", "1.5 dCi", "diesel", "UU1"],
	["Dacia", "Spring", "Electric", "electric", "UU1"],
	["Volkswagen", "Golf", "1.6 TDI", "diesel", "WVW"],
	["Volkswagen", "Passat", "2.0 TDI", "diesel", "WVW"],
	["Volkswagen", "Polo", "1.0 TSI", "petrol", "WVW"],
	["Skoda", "Octavia", "1.6 TDI", "diesel", "TMB"],
	["Skoda", "Fabia", "1.0 TSI", "petrol", "TMB"],
	["Skoda", "Superb", "2.0 TDI", "diesel", "TMB"],
	["Renault", "Megane", "1.5 dCi", "diesel", "VF1"],
	["Renault", "Clio", "0.9 TCe", "petrol", "VF1"],
	["Ford", "Focus", "1.0 EcoBoost", "petrol", "WF0"],
	["Ford", "Kuga", "2.0 TDCi", "diesel", "WF0"],
	["Opel", "Astra", "1.6 CDTI", "diesel", "W0L"],
	["Opel", "Corsa", "1.2", "petrol", "W0L"],
	["Toyota", "Corolla", "1.8 Hybrid", "hybrid", "SB1"],
	["Toyota", "RAV4", "2.5 Hybrid", "hybrid", "JTM"],
	["Toyota", "Yaris", "1.5 Hybrid", "hybrid", "VNK"],
	["BMW", "Seria 3", "320d", "diesel", "WBA"],
	["BMW", "X3", "xDrive20d", "diesel", "WBA"],
	["Audi", "A4", "2.0 TDI", "diesel", "WAU"],
	["Audi", "A6", "3.0 TDI", "diesel", "WAU"],
	["Mercedes-Benz", "C 220", "2.2 CDI", "diesel", "WDD"],
	["Mercedes-Benz", "Sprinter", "2.1 CDI", "diesel", "WDB"],
	["Hyundai", "Tucson", "1.6 T-GDi", "petrol", "TMA"],
	["Kia", "Sportage", "1.6 CRDi", "diesel", "U5Y"],
	["Kia", "Ceed", "1.4", "petrol", "U5Y"],
	["Peugeot", "308", "1.5 BlueHDi", "diesel", "VF3"],
	["Nissan", "Qashqai", "1.3 DIG-T", "petrol", "SJN"],
];

const FIRST = ["Andrei", "Alexandru", "Mihai", "Ion", "Gheorghe", "Florin", "Marius", "Adrian", "Cristian", "Radu", "Bogdan", "Ștefan", "Vlad", "Dan", "Sorin", "Lucian", "Ionuț", "Cătălin", "Maria", "Elena", "Ioana", "Ana", "Andreea", "Cristina", "Gabriela", "Mihaela", "Alina", "Roxana", "Raluca", "Diana", "Irina", "Simona"];
const LAST = ["Popescu", "Ionescu", "Popa", "Dumitru", "Stan", "Stoica", "Gheorghe", "Matei", "Ciobanu", "Rusu", "Munteanu", "Marin", "Tudor", "Dinu", "Florea", "Barbu", "Neagu", "Toma", "Nistor", "Moldovan", "Sandu", "Lazăr", "Enache", "Radu", "Vasile", "Mocanu", "Ilie", "Dobre"];
const COMPANIES = [
	["Trans Logistic SRL", "Str. Depozitelor 4", "Popești-Leordeni", "Ilfov"],
	["Construct Plus SRL", "Bd. Theodor Pallady 51", "București", "Sector 3"],
	["Farmacia Sănătatea SRL", "Str. Lizeanu 8", "București", "Sector 2"],
	["Rapid Curier SRL", "Șos. Fundeni 170", "București", "Sector 2"],
	["Brutăria Bunica SRL", "Str. Baba Novac 21", "București", "Sector 3"],
	["Instal Pro Service SRL", "Str. Industriilor 90", "Chiajna", "Ilfov"],
	["Media Vision SRL", "Calea Victoriei 120", "București", "Sector 1"],
];
const STREETS = ["Str. Lalelelor", "Bd. Unirii", "Str. Fizicienilor", "Calea Dudești", "Str. Nerva Traian", "Bd. Camil Ressu", "Str. Liviu Rebreanu", "Aleea Barajul Argeș", "Str. Baba Novac", "Bd. Decebal"];
const LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ";
const VIN_CHARS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";
const COMPLAINTS = [
	"Zgomot la frânare pe față",
	"Martor motor aprins",
	"Revizia anuală",
	"Vibrații în volan la 100 km/h",
	"Aerul condiționat nu răcește",
	"Mașina trage în dreapta",
	"Pornește greu dimineața",
	"Pregătire pentru ITP",
	"Scârțâit la denivelări",
	"Schimb anvelope de sezon",
];

/** Valid CUI with the 753217532 control key for a given base number. */
function cuiFor(base) {
	const digits = String(base).split("").map(Number);
	const key = [7, 5, 3, 2, 1, 7, 5, 3, 2];
	const padded = Array(9 - digits.length).fill(0).concat(digits);
	const sum = padded.reduce((acc, d, i) => acc + d * key[i], 0);
	return `RO${base}${((sum * 10) % 11) % 10}`;
}

export function buildDemoData(today) {
	const rnd = mulberry32(20260930);
	const int = (min, max) => min + Math.floor(rnd() * (max - min + 1));
	const pick = (list) => list[Math.floor(rnd() * list.length)];
	const chance = (p) => rnd() < p;
	const pickWeighted = (list, weightOf) => {
		const total = list.reduce((s, x) => s + weightOf(x), 0);
		let r = rnd() * total;
		for (const x of list) {
			r -= weightOf(x);
			if (r <= 0) return x;
		}
		return list[list.length - 1];
	};
	const at = (day, hour, minute = 0) => combineDateTime(day, `${hour}:${minute}`);
	const start = addDaysISO(today, -365);
	const createdAt = at(start, 9);

	const staff = STAFF.map(([name, role, color], i) => ({ id: uid(), name, role, color, phone: "", active: true, order: i, createdAt }));
	const bays = BAYS.map(([name, kind], i) => ({ id: uid(), name, kind, active: true, order: i, createdAt }));

	const partByKey = {};
	const parts = PARTS.map(([key, code, name, brand, unit, costLei, stock, minStock, location]) => {
		const cost = costLei * 100;
		const part = { id: uid(), code, name, brand, unit, cost, price: priceFromCost(cost, MARKUP), stock, minStock, location, createdAt };
		partByKey[key] = part;
		return part;
	});

	const serviceByKey = {};
	const services = SERVICES.map(([key, name, category, hours, pkg, weight]) => {
		const service = {
			id: uid(),
			name,
			category,
			hours,
			price: Math.round(hours * LABOR_RATE),
			parts: pkg.map(([partKey, qty]) => ({ partId: partByKey[partKey].id, qty })),
			createdAt,
		};
		serviceByKey[key] = { ...service, key, weight };
		return service;
	});

	// ── customers & vehicles ──
	const customers = [];
	const vehicles = [];
	const vehicleMeta = new Map();
	const phone = () => `07${int(2, 8)}${int(0, 9)} ${int(100, 999)} ${int(100, 999)}`;
	const plate = () => {
		const county = chance(0.72) ? "B" : pick(["IF", "IF", "PH", "AG", "CT", "BV", "CJ", "DB", "GR"]);
		const digits = county === "B" ? int(10, 999) : int(10, 99);
		return `${county}${String(digits).padStart(2, "0")}${pick(LETTERS)}${pick(LETTERS)}${pick(LETTERS)}`;
	};
	const addVehicle = (customer) => {
		const [make, model, engine, fuel, wmi] = pick(MODELS);
		let vin = wmi;
		while (vin.length < 17) vin += pick(VIN_CHARS);
		const year = int(2009, 2024);
		const perDay = int(18, 85);
		const baseKm = Math.max(3000, (2026 - year) * int(9000, 19000) - perDay * 365);
		const vehicle = {
			id: uid(),
			customerId: customer.id,
			plate: plate(),
			vin,
			make,
			model,
			engine,
			fuel,
			year,
			color: pick(["Alb", "Negru", "Gri", "Argintiu", "Albastru", "Roșu"]),
			mileage: [],
			itpExpiry: addDaysISO(today, int(-35, 420)),
			rcaExpiry: addDaysISO(today, int(-15, 360)),
			serviceIntervalKm: fuel === "electric" ? 30000 : pick([10000, 15000, 15000, 20000]),
			serviceIntervalMonths: 12,
			lastServiceDate: null,
			lastServiceKm: null,
			notes: "",
			createdAt,
		};
		vehicles.push(vehicle);
		vehicleMeta.set(vehicle.id, { baseKm, perDay });
		return vehicle;
	};

	for (let i = 0; i < 46; i++) {
		const name = `${pick(FIRST)} ${pick(LAST)}`;
		const customer = {
			id: uid(),
			type: "person",
			name,
			phone: phone(),
			email: chance(0.5) ? `${name.split(" ")[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}.${int(10, 99)}@exemplu.ro` : "",
			address: `${pick(STREETS)} ${int(1, 140)}`,
			city: "București",
			county: `Sector ${int(1, 6)}`,
			cui: "",
			regCom: "",
			notes: "",
			marketingConsent: chance(0.8),
			createdAt,
		};
		customers.push(customer);
		addVehicle(customer);
		if (chance(0.22)) addVehicle(customer);
	}
	COMPANIES.forEach(([name, address, city, county], i) => {
		const customer = {
			id: uid(),
			type: "company",
			name,
			contactName: `${pick(FIRST)} ${pick(LAST)}`,
			phone: phone(),
			email: `office@${name.split(" ")[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}-demo.ro`,
			address,
			city,
			county,
			cui: cuiFor(31000000 + i * 1379 + 11),
			regCom: `J40/${int(1000, 20000)}/${int(2008, 2022)}`,
			notes: i === 0 ? "Flotă — facturare lunară, plată prin OP la 30 de zile." : "",
			marketingConsent: true,
			createdAt,
		};
		customers.push(customer);
		for (let k = 0, n = int(2, 4); k < n; k++) addVehicle(customer);
	});
	const customerById = new Map(customers.map((c) => [c.id, c]));
	// Fleet customers come more often.
	const vehicleWeight = (v) => (customerById.get(v.customerId).type === "company" ? 1.5 : 1);

	// ── work orders, invoices, payments, appointments ──
	const workOrders = [];
	const toInvoice = [];
	const payments = [];
	const appointments = [];
	const serviceList = Object.values(serviceByKey);
	const mechanics = staff;

	const seasonWeight = (service, day) => {
		const month = parseISODate(day).getMonth() + 1;
		if (service.key === "tireswap") return [3, 4, 10, 11].includes(month) ? 22 : 0.5;
		if (service.category === "ac") return [5, 6, 7, 8].includes(month) ? service.weight * 3 : service.weight * 0.3;
		return service.weight;
	};

	const kmOn = (vehicle, day) => {
		const meta = vehicleMeta.get(vehicle.id);
		return Math.round(meta.baseKm + meta.perDay * diffDaysISO(start, day) + int(-150, 150));
	};

	const linesFor = (chosen, staffId) => {
		const lines = [];
		for (const service of chosen) {
			lines.push({
				id: uid(),
				kind: "labor",
				refId: service.id,
				description: service.name,
				qty: service.hours,
				unit: "h",
				unitPrice: LABOR_RATE,
				discountPct: 0,
				vatRate: 21,
				cost: 0,
				staffId,
			});
			for (const { partId, qty } of service.parts) {
				const part = parts.find((p) => p.id === partId);
				lines.push({
					id: uid(),
					kind: "part",
					refId: part.id,
					description: `${part.name} ${part.brand}`,
					qty,
					unit: part.unit,
					unitPrice: part.price,
					discountPct: 0,
					vatRate: 21,
					cost: part.cost,
					staffId: null,
				});
			}
		}
		if (chance(0.35)) {
			lines.push({ id: uid(), kind: "fee", refId: null, description: "Materiale consumabile", qty: 1, unit: "buc", unitPrice: 2500, discountPct: 0, vatRate: 21, cost: 0, staffId: null });
		}
		return lines;
	};

	const chooseServices = (day) => {
		const chosen = [pickWeighted(serviceList, (s) => seasonWeight(s, day))];
		if (chance(0.3)) {
			const extra = pickWeighted(serviceList, (s) => seasonWeight(s, day));
			if (!chosen.includes(extra)) chosen.push(extra);
		}
		return chosen;
	};

	const recordVisit = (vehicle, day, km, chosen) => {
		vehicle.mileage.push({ date: day, km, source: "workOrder" });
		if (chosen.some((s) => s.key === "oil" || s.key === "revision")) {
			vehicle.lastServiceDate = day;
			vehicle.lastServiceKm = km;
		}
	};

	// History: every working day of the past year.
	for (let offset = 365; offset >= 1; offset--) {
		const day = addDaysISO(today, -offset);
		const weekday = parseISODate(day).getDay();
		if (weekday === 0) continue;
		const count = weekday === 6 ? int(1, 2) : int(2, 4);
		for (let n = 0; n < count; n++) {
			const vehicle = pickWeighted(vehicles, vehicleWeight);
			const customer = customerById.get(vehicle.customerId);
			const chosen = chooseServices(day);
			const mechanic = pick(mechanics);
			const km = kmOn(vehicle, day);
			const hours = chosen.reduce((s, x) => s + x.hours, 0);
			const created = at(day, int(8, 11), pick([0, 15, 30, 45]));
			const deliveredDay = hours > 3.5 && offset > 1 ? addDaysISO(day, 1) : day;
			const cancelled = chance(0.03);
			const order = {
				id: uid(),
				number: 0,
				status: cancelled ? "cancelled" : "delivered",
				customerId: customer.id,
				vehicleId: vehicle.id,
				appointmentId: null,
				staffId: mechanic.id,
				bayId: pick(bays).id,
				mileage: km,
				fuelLevel: pick([1, 2, 2, 3, 4]),
				complaint: chosen[0].key === "diag" ? pick(COMPLAINTS) : chosen.map((s) => s.name).join(", "),
				diagnosis: "",
				lines: linesFor(chosen, mechanic.id),
				inspection: defaultInspection(),
				notes: "",
				invoiceId: null,
				dates: cancelled
					? { estimate: created, cancelled: at(day, 12) }
					: { estimate: created, approved: created, in_progress: at(day, 11), ready: at(deliveredDay, 15), delivered: at(deliveredDay, int(16, 18)) },
				activity: [],
				createdAt: created,
				updatedAt: created,
			};
			workOrders.push(order);
			if (!cancelled) recordVisit(vehicle, day, km, chosen);

			if (offset <= 30) {
				const apptStart = at(day, int(8, 10), pick([0, 30]));
				const appointment = {
					id: uid(),
					start: apptStart,
					end: new Date(new Date(apptStart).getTime() + Math.max(1, Math.ceil(hours)) * 3_600_000).toISOString(),
					customerId: customer.id,
					vehicleId: vehicle.id,
					title: chosen.map((s) => s.name).join(", "),
					serviceIds: chosen.map((s) => s.id),
					notes: "",
					staffId: mechanic.id,
					bayId: order.bayId,
					status: cancelled ? "cancelled" : "done",
					workOrderId: cancelled ? null : order.id,
					createdAt: at(addDaysISO(day, -int(1, 7)), 12),
				};
				appointments.push(appointment);
				order.appointmentId = appointment.id;
			}

			if (!cancelled) {
				toInvoice.push({ order, day: deliveredDay, customer, vehicle });
			}
		}
	}

	// No-shows and cancellations in the last month.
	for (let i = 0; i < 5; i++) {
		const day = addDaysISO(today, -int(2, 28));
		if (parseISODate(day).getDay() === 0) continue;
		const vehicle = pick(vehicles);
		const service = pick(serviceList);
		const apptStart = at(day, int(8, 16), pick([0, 30]));
		appointments.push({
			id: uid(),
			start: apptStart,
			end: new Date(new Date(apptStart).getTime() + 3_600_000).toISOString(),
			customerId: vehicle.customerId,
			vehicleId: vehicle.id,
			title: service.name,
			serviceIds: [service.id],
			notes: "",
			staffId: pick(mechanics).id,
			bayId: pick(bays).id,
			status: i < 3 ? "no_show" : "cancelled",
			workOrderId: null,
			createdAt: at(addDaysISO(day, -3), 12),
		});
	}

	// Number work orders chronologically (the shop existed before the demo year).
	workOrders.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
	workOrders.forEach((o, i) => {
		o.number = 1001 + i;
	});

	// Issue invoices chronologically.
	const issued = [];
	toInvoice.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.order.number - b.order.number));
	toInvoice.forEach(({ order, day, customer, vehicle }, i) => {
		const draft = {
			id: uid(),
			status: "draft",
			series: "GRJ",
			number: null,
			issueDate: day,
			dueDate: addDaysISO(day, customer.type === "company" ? 30 : 14),
			customerId: customer.id,
			vehicleId: vehicle.id,
			workOrderId: order.id,
			mileage: order.mileage,
			lines: order.lines.map((l) => ({ ...l, id: uid() })),
			notes: "",
			activity: [],
			createdAt: at(day, 16),
		};
		const invoice = issueInvoice(draft, { settings: SETTINGS, customer, vehicle, number: i + 1, now: at(day, 16, 30) });
		order.invoiceId = invoice.id;
		issued.push(invoice);

		const age = diffDaysISO(day, today);
		const total = invoice.totals.gross;
		if (customer.type === "company") {
			const payDay = addDaysISO(day, int(5, 34));
			if (payDay < today && (age > 60 || chance(0.9))) {
				payments.push({ id: uid(), invoiceId: invoice.id, amount: total, method: "transfer", date: payDay, note: "OP", createdAt: at(payDay, 10) });
			}
		} else if (age > 20 || chance(0.9)) {
			payments.push({ id: uid(), invoiceId: invoice.id, amount: total, method: chance(0.68) ? "card" : "cash", date: day, note: "", createdAt: at(day, 17) });
		} else if (chance(0.5)) {
			const part = Math.round(total * 0.4);
			payments.push({ id: uid(), invoiceId: invoice.id, amount: part, method: "cash", date: day, note: "Avans", createdAt: at(day, 17) });
		}
	});

	// Two credit notes (storno) in the history.
	let nextInvoice = issued.length + 1;
	for (const index of [Math.floor(issued.length * 0.3), Math.floor(issued.length * 0.72)]) {
		const original = issued[index];
		const day = addDaysISO(original.issueDate, 2);
		const storno = buildStorno(original, { number: nextInvoice++, today: day, now: at(day, 10) });
		original.status = "cancelled";
		original.stornoId = storno.id;
		issued.push(storno);
		for (let p = payments.length - 1; p >= 0; p--) if (payments[p].invoiceId === original.id) payments.splice(p, 1);
		const order = workOrders.find((o) => o.id === original.workOrderId);
		if (order) order.invoiceId = null;
	}

	// ── today: jobs in the shop and bookings ──
	const openPlan = [
		["ready", -3],
		["ready", -1],
		["ready", 0],
		["in_progress", 0],
		["in_progress", 0],
		["in_progress", -1],
		["in_progress", 0],
		["waiting_parts", -2],
		["waiting_parts", -1],
		["approved", 0],
		["approved", -1],
		["estimate", 0],
		["estimate", 0],
	];
	const busy = new Set();
	const freeVehicle = () => {
		for (let tries = 0; tries < 50; tries++) {
			const v = pickWeighted(vehicles, vehicleWeight);
			if (!busy.has(v.id)) {
				busy.add(v.id);
				return v;
			}
		}
		return vehicles[0];
	};
	let nextOrder = workOrders.length + 1001;
	let hourSlot = 8;
	openPlan.forEach(([status, dayOffset], i) => {
		const day = addDaysISO(today, dayOffset);
		const vehicle = freeVehicle();
		const customer = customerById.get(vehicle.customerId);
		const chosen = chooseServices(day);
		const mechanic = mechanics[i % mechanics.length];
		const km = kmOn(vehicle, day);
		const created = at(day, 8 + (i % 4), pick([0, 15, 30]));
		const flow = ["estimate", "approved", "in_progress", "waiting_parts", "ready"];
		const reached = flow.slice(0, flow.indexOf(status) + 1);
		const dates = Object.fromEntries(reached.map((s, k) => [s, at(day, 8 + (i % 4) + k, 30)]));
		const inspection = defaultInspection().map((item) =>
			status === "estimate" ? item : { ...item, status: chance(0.75) ? "ok" : chance(0.6) ? "attention" : "urgent" },
		);
		const order = {
			id: uid(),
			number: nextOrder++,
			status,
			customerId: customer.id,
			vehicleId: vehicle.id,
			appointmentId: null,
			staffId: mechanic.id,
			bayId: bays[i % 3].id,
			mileage: km,
			fuelLevel: pick([1, 2, 3]),
			complaint: pick(COMPLAINTS),
			diagnosis: status === "estimate" ? "" : "Verificat pe elevator, confirmat defectul.",
			lines: linesFor(chosen, mechanic.id),
			inspection,
			notes: status === "waiting_parts" ? "Piesa comandată, livrare estimată mâine." : "",
			invoiceId: null,
			dates,
			activity: [],
			createdAt: created,
			updatedAt: created,
		};
		workOrders.push(order);
		recordVisit(vehicle, day, km, []);

		if (dayOffset === 0) {
			const apptStart = at(today, hourSlot, 0);
			hourSlot += 1;
			const appointment = {
				id: uid(),
				start: apptStart,
				end: new Date(new Date(apptStart).getTime() + 2 * 3_600_000).toISOString(),
				customerId: customer.id,
				vehicleId: vehicle.id,
				title: chosen.map((s) => s.name).join(", "),
				serviceIds: chosen.map((s) => s.id),
				notes: "",
				staffId: mechanic.id,
				bayId: order.bayId,
				status: "arrived",
				workOrderId: order.id,
				createdAt: at(addDaysISO(today, -3), 12),
			};
			appointments.push(appointment);
			order.appointmentId = appointment.id;
		}
	});

	// Upcoming bookings: today (after the arrivals) and the next three weeks.
	for (let offset = 0; offset <= 21; offset++) {
		const day = addDaysISO(today, offset);
		const weekday = parseISODate(day).getDay();
		if (weekday === 0) continue;
		const count = offset === 0 ? 4 : weekday === 6 ? int(1, 2) : int(3, 5);
		const hours = offset === 0 ? [13, 14, 15, 16] : [8, 9, 10, 11, 13, 14, 15, 16];
		for (let n = 0; n < count; n++) {
			const vehicle = offset === 0 ? freeVehicle() : pickWeighted(vehicles, vehicleWeight);
			const service = pickWeighted(serviceList, (s) => seasonWeight(s, day));
			const hour = offset === 0 ? hours[n] : pick(hours);
			const apptStart = at(day, hour, pick([0, 30]));
			appointments.push({
				id: uid(),
				start: apptStart,
				end: new Date(new Date(apptStart).getTime() + Math.max(1, Math.ceil(service.hours)) * 3_600_000).toISOString(),
				customerId: vehicle.customerId,
				vehicleId: vehicle.id,
				title: service.name,
				serviceIds: [service.id],
				notes: chance(0.2) ? "Clientul așteaptă în service." : "",
				staffId: mechanics[n % mechanics.length].id,
				bayId: bays[n % bays.length].id,
				status: offset <= 1 ? (chance(0.5) ? "confirmed" : "scheduled") : chance(0.3) ? "confirmed" : "scheduled",
				workOrderId: null,
				createdAt: at(addDaysISO(today, -int(1, 10)), 12),
			});
		}
	}

	// A few documents coming up for renewal soon so the retention list is alive.
	vehicles.slice(0, 5).forEach((v, i) => {
		v.itpExpiry = addDaysISO(today, [-12, 3, 9, 18, 27][i]);
	});
	vehicles.slice(5, 9).forEach((v, i) => {
		v.rcaExpiry = addDaysISO(today, [-4, 2, 12, 25][i]);
	});
	for (const v of vehicles) v.mileage.sort((a, b) => (a.date < b.date ? -1 : 1));

	const nextWorkOrder = nextOrder;
	const counters = { invoices: { GRJ: nextInvoice }, workOrders: nextWorkOrder };

	return {
		collections: {
			customers,
			vehicles,
			staff,
			bays,
			services,
			parts,
			appointments,
			workOrders,
			invoices: issued,
			payments,
			contacts: [],
		},
		meta: { settings: SETTINGS, counters, demo: true, schema: SCHEMA_VERSION },
	};
}

/** Empty shop with the default catalog skeleton (used by "start fresh"). */
export function buildEmptyData(settings) {
	const createdAt = new Date().toISOString();
	return {
		collections: {
			customers: [],
			vehicles: [],
			staff: [{ id: uid(), name: "Mecanic 1", role: "mechanic", color: "blue", phone: "", active: true, order: 0, createdAt }],
			bays: [{ id: uid(), name: "Elevator 1", kind: "lift", active: true, order: 0, createdAt }],
			services: [],
			parts: [],
			appointments: [],
			workOrders: [],
			invoices: [],
			payments: [],
			contacts: [],
		},
		meta: {
			settings: { ...DEFAULT_SETTINGS, ...settings },
			counters: { invoices: {}, workOrders: 1 },
			demo: false,
			schema: SCHEMA_VERSION,
		},
	};
}

