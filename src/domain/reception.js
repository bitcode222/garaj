import { DomainError } from "./errors.js";

// Receiving the car (owner, 20 Nov 2026; sheets board round 4, flow "R1 Pas cu pas"): when the car arrives the desk
// walks around it once and writes down how it came in. Kept on the job:
//   mileage, fuelLevel (0–4, FUEL_LEVELS), complaint      — as before, at the top of the job
//   reception: {
//     lights: [key],            warning lights on at start (WARNING_LIGHTS); [] with lightsChecked = none on
//     lightsChecked: bool,
//     damage: [{ id, zone, kind, note }]   marks on the body (DAMAGE_ZONES × DAMAGE_KINDS); [] with bodyChecked = none
//     bodyChecked: bool,
//     items: "",                what the client left in the car
//     confirmedBy: "", confirmedAt: null | ISO   the client saw it and agreed
//     doneAt: null | ISO        the walk-around was saved
//   }

export const WARNING_LIGHTS = [
	{ key: "engine", label: "Motor" },
	{ key: "oil", label: "Ulei" },
	{ key: "battery", label: "Baterie" },
	{ key: "abs", label: "ABS" },
	{ key: "airbag", label: "Airbag" },
	{ key: "brake", label: "Frână" },
	{ key: "temperature", label: "Temperatură" },
	{ key: "tpms", label: "Presiune roți" },
	{ key: "service", label: "Service" },
];

// The body seen from above, front at the top; each zone has its place on the drawing (x, y in a 140 × 260 box).
export const DAMAGE_ZONES = [
	{ key: "front", label: "Bara față", x: 70, y: 18 },
	{ key: "hood", label: "Capotă", x: 70, y: 62 },
	{ key: "front_left", label: "Aripă față stânga", x: 18, y: 66 },
	{ key: "front_right", label: "Aripă față dreapta", x: 122, y: 66 },
	{ key: "windshield", label: "Parbriz", x: 70, y: 96 },
	{ key: "door_front_left", label: "Ușă față stânga", x: 16, y: 118 },
	{ key: "door_front_right", label: "Ușă față dreapta", x: 124, y: 118 },
	{ key: "roof", label: "Plafon", x: 70, y: 140 },
	{ key: "door_rear_left", label: "Ușă spate stânga", x: 16, y: 160 },
	{ key: "door_rear_right", label: "Ușă spate dreapta", x: 124, y: 160 },
	{ key: "rear_left", label: "Aripă spate stânga", x: 18, y: 204 },
	{ key: "rear_right", label: "Aripă spate dreapta", x: 122, y: 204 },
	{ key: "trunk", label: "Portbagaj", x: 70, y: 210 },
	{ key: "rear", label: "Bara spate", x: 70, y: 244 },
	{ key: "wheels", label: "Jante", x: 70, y: 176 },
];

export const DAMAGE_KINDS = [
	{ key: "scratch", label: "Zgârietură" },
	{ key: "dent", label: "Lovitură" },
	{ key: "crack", label: "Fisură" },
	{ key: "missing", label: "Lipsă" },
];

const LIGHT_KEYS = new Set(WARNING_LIGHTS.map((l) => l.key));
const ZONE_KEYS = new Set(DAMAGE_ZONES.map((z) => z.key));
const KIND_KEYS = new Set(DAMAGE_KINDS.map((k) => k.key));

/** A job's reception, with every field present (an old job has none). */
export function emptyReception() {
	return { lights: [], lightsChecked: false, damage: [], bodyChecked: false, items: "", confirmedBy: "", confirmedAt: null, doneAt: null };
}

export const receptionOf = (order) => ({ ...emptyReception(), ...(order?.reception ?? {}) });

/**
 * What the walk-around has so far, step by step (dashboard, lights, body, the problem, the client's word), for the
 * sheet's one-line summary and the flow's dots. `done` is true once it was saved.
 */
export function receptionSummary(order) {
	const r = receptionOf(order);
	const steps = {
		dashboard: order?.mileage != null && order?.fuelLevel != null,
		lights: r.lightsChecked || r.lights.length > 0,
		body: r.bodyChecked || r.damage.length > 0,
		problem: Boolean(String(order?.complaint ?? "").trim()),
		confirmed: Boolean(r.confirmedAt),
	};
	return {
		steps,
		filled: Object.values(steps).filter(Boolean).length,
		of: Object.keys(steps).length,
		lights: r.lights.length,
		marks: r.damage.length,
		items: Boolean(r.items.trim()),
		done: Boolean(r.doneAt),
	};
}

/**
 * The job after the walk-around is saved. Unknown lights, zones and kinds are dropped; the mileage must be a whole
 * number of km ≥ 0; `confirmed` stamps the client's word with the time (and clears it when false).
 */
export function saveReception(order, input, now) {
	const { mileage, fuelLevel, complaint } = input;
	if (mileage != null && (!Number.isInteger(mileage) || mileage < 0)) throw new DomainError("mileage", "Kilometrajul trebuie să fie un număr întreg de km.");
	if (fuelLevel != null && (!Number.isInteger(fuelLevel) || fuelLevel < 0 || fuelLevel > 4)) throw new DomainError("fuel", "Nivelul de combustibil nu e valid.");
	const before = receptionOf(order);
	const lights = [...new Set((input.lights ?? before.lights).filter((k) => LIGHT_KEYS.has(k)))];
	const damage = (input.damage ?? before.damage)
		.filter((d) => ZONE_KEYS.has(d.zone) && KIND_KEYS.has(d.kind))
		.map((d) => ({ id: String(d.id), zone: d.zone, kind: d.kind, note: String(d.note ?? "").trim() }));
	const confirmed = input.confirmed ?? Boolean(before.confirmedAt);
	return {
		...order,
		mileage: mileage === undefined ? (order.mileage ?? null) : mileage,
		fuelLevel: fuelLevel === undefined ? (order.fuelLevel ?? null) : fuelLevel,
		complaint: complaint === undefined ? (order.complaint ?? "") : String(complaint).trim(),
		reception: {
			lights,
			lightsChecked: Boolean(input.lightsChecked ?? before.lightsChecked) || lights.length > 0,
			damage,
			bodyChecked: Boolean(input.bodyChecked ?? before.bodyChecked) || damage.length > 0,
			items: String(input.items ?? before.items).trim(),
			confirmedBy: confirmed ? String(input.confirmedBy ?? before.confirmedBy).trim() : "",
			confirmedAt: confirmed ? (before.confirmedAt ?? now) : null,
			doneAt: now,
		},
		updatedAt: now,
	};
}
