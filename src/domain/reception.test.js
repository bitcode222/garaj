import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyReception, receptionOf, receptionSummary, saveReception } from "./reception.js";

const NOW = "2026-11-20T09:00:00.000Z";
const LATER = "2026-11-20T09:30:00.000Z";
const job = (extra = {}) => ({ id: "j1", mileage: null, fuelLevel: null, complaint: "", updatedAt: "x", ...extra });

describe("reception", () => {
	it("an old job reads as an empty reception", () => {
		assert.deepEqual(receptionOf(job()), emptyReception());
		const s = receptionSummary(job());
		assert.deepEqual([s.filled, s.of, s.done, s.lights, s.marks, s.items], [0, 5, false, 0, 0, false]);
	});

	it("counts each step once it has something", () => {
		const order = job({ mileage: 148200, fuelLevel: 1, complaint: "Martor motor", reception: { lights: ["engine"], damage: [], bodyChecked: true, items: "Roată", confirmedAt: NOW } });
		const s = receptionSummary(order);
		assert.deepEqual(s.steps, { dashboard: true, lights: true, body: true, problem: true, confirmed: true });
		assert.deepEqual([s.filled, s.lights, s.marks, s.items], [5, 1, 0, true]);
		assert.equal(receptionSummary(job({ mileage: 10 })).steps.dashboard, false, "the dashboard needs the fuel too");
	});

	it("saves the walk-around, dropping what it does not know", () => {
		const saved = saveReception(job(), {
			mileage: 148200,
			fuelLevel: 2,
			complaint: "  trage greu  ",
			lights: ["engine", "engine", "laser"],
			damage: [{ id: "d1", zone: "front_right", kind: "scratch", note: " veche " }, { id: "d2", zone: "moon", kind: "dent" }],
			items: " Scaun copil ",
			confirmed: true,
			confirmedBy: "Vlad",
		}, NOW);
		assert.deepEqual([saved.mileage, saved.fuelLevel, saved.complaint, saved.updatedAt], [148200, 2, "trage greu", NOW]);
		assert.deepEqual(saved.reception, {
			lights: ["engine"],
			lightsChecked: true,
			damage: [{ id: "d1", zone: "front_right", kind: "scratch", note: "veche" }],
			bodyChecked: true,
			items: "Scaun copil",
			confirmedBy: "Vlad",
			confirmedAt: NOW,
			doneAt: NOW,
		});
	});

	it("keeps the first confirmation time, and clears it when taken back", () => {
		const once = saveReception(job(), { confirmed: true, confirmedBy: "Vlad" }, NOW);
		const again = saveReception(once, { confirmed: true }, LATER);
		assert.deepEqual([again.reception.confirmedAt, again.reception.confirmedBy, again.reception.doneAt], [NOW, "Vlad", LATER]);
		const back = saveReception(again, { confirmed: false }, LATER);
		assert.deepEqual([back.reception.confirmedAt, back.reception.confirmedBy], [null, ""]);
	});

	it("an empty check counts: no lights on, no marks", () => {
		const saved = saveReception(job(), { lightsChecked: true, bodyChecked: true }, NOW);
		assert.deepEqual([saved.reception.lightsChecked, saved.reception.bodyChecked], [true, true]);
		assert.deepEqual(receptionSummary(saved).steps, { dashboard: false, lights: true, body: true, problem: false, confirmed: false });
	});

	it("refuses a mileage or fuel level that cannot be", () => {
		assert.throws(() => saveReception(job(), { mileage: -1 }, NOW), /Kilometrajul/);
		assert.throws(() => saveReception(job(), { mileage: 12.5 }, NOW), /Kilometrajul/);
		assert.throws(() => saveReception(job(), { fuelLevel: 5 }, NOW), /combustibil/);
		assert.equal(saveReception(job({ mileage: 9 }), {}, NOW).mileage, 9, "left out, the old value stays");
	});
});
