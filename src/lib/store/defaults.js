export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS = {
	currency: "RON",
	shop: {
		name: "Garajul meu",
		legalName: "",
		cui: "",
		regCom: "",
		address: "",
		city: "",
		county: "",
		phone: "",
		email: "",
		iban: "",
		bank: "",
		logo: null,
	},
	invoicing: {
		series: "GRJ",
		startNumber: 1,
		vatPayer: true,
		vatRate: 21,
		dueDays: 14,
		notes: "",
	},
	laborRate: 15000,
	partsMarkup: 35,
	hours: { open: "08:00", close: "18:00", days: [1, 2, 3, 4, 5, 6] },
	service: { intervalKm: 15000, intervalMonths: 12 },
	calendar: {
		view: "day",
		colorBy: "status",
		badge: "colored",
		agendaGroupBy: "date",
		confirmDrop: false,
		defaultDuration: 60,
	},
	appearance: { theme: "system" },
};

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);

/** Stored settings on top of defaults, so new keys appear after an update. */
export function mergeSettings(stored, base = DEFAULT_SETTINGS) {
	if (!isObject(stored)) return base;
	const out = { ...base };
	for (const [key, value] of Object.entries(stored)) {
		out[key] = isObject(value) && isObject(base[key]) ? mergeSettings(value, base[key]) : value;
	}
	return out;
}
