import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { isRunning, runningJobs, setLineDone, startWork, steps, stopClock, workedMs } from "./work-clock.js";

const job = (over = {}) => ({ id: "w1", number: 1, status: "approved", lines: [], dates: {}, activity: [], timeLog: [], ...over });
const T0 = "2026-11-16T08:00:00.000Z";
const T1 = "2026-11-16T09:30:00.000Z";

describe("work clock", () => {
	test("starting an approved job puts it in progress and opens an entry", () => {
		const { order, stopped } = startWork(job(), { staffId: "m1", now: T0, id: "e1" });
		assert.equal(order.status, "in_progress");
		assert.deepEqual(order.timeLog, [{ id: "e1", staffId: "m1", start: T0, end: null }]);
		assert.equal(order.activity.at(-1).to, "in_progress");
		assert.deepEqual(stopped, []);
		assert.ok(isRunning(order));
	});

	test("starting a running job changes nothing", () => {
		const running = job({ status: "in_progress", timeLog: [{ id: "e1", staffId: "m1", start: T0, end: null }] });
		assert.equal(startWork(running, { staffId: "m1", now: T1 }).order, running);
	});

	test("a mechanic works on one job: starting another stops theirs, not others'", () => {
		const mine = job({ id: "a", status: "in_progress", timeLog: [{ id: "e1", staffId: "m1", start: T0, end: null }] });
		const theirs = job({ id: "b", status: "in_progress", timeLog: [{ id: "e2", staffId: "m2", start: T0, end: null }] });
		const { stopped } = startWork(job({ id: "c" }), { staffId: "m1", now: T1, orders: [mine, theirs], id: "e3" });
		assert.deepEqual(stopped.map((o) => o.id), ["a"]);
		assert.equal(stopped[0].timeLog[0].end, T1);
	});

	test("closed jobs can't be started", () => {
		assert.throws(() => startWork(job({ status: "delivered" }), { now: T0 }), { code: "job_closed" });
		assert.throws(() => startWork(job({ status: "cancelled" }), { now: T0 }), { code: "job_closed" });
	});

	test("time worked adds closed entries and the running one up to now", () => {
		const o = job({ timeLog: [{ id: "a", start: T0, end: "2026-11-16T08:30:00.000Z" }, { id: "b", start: "2026-11-16T09:00:00.000Z", end: null }] });
		assert.equal(workedMs(o, T1), 60 * 60 * 1000);
		assert.equal(stopClock(o, { now: T1 }).timeLog[1].end, T1);
		assert.equal(stopClock(job(), { now: T1 }).timeLog.length, 0);
	});

	test("steps are the labor lines, refused ones left out; ticking moves the current one", () => {
		const lines = [
			{ id: "l1", kind: "labor", description: "Ulei" },
			{ id: "p1", kind: "part", description: "Filtru" },
			{ id: "l2", kind: "labor", description: "Plăcuțe", refused: true },
			{ id: "l3", kind: "labor", description: "Discuri" },
		];
		let o = job({ lines });
		assert.deepEqual({ ...steps(o), current: steps(o).current.id }, { total: 2, done: 0, current: "l1" });
		o = setLineDone(o, "l1", true, { now: T0 });
		assert.equal(steps(o).done, 1);
		assert.equal(steps(o).current.id, "l3");
		assert.throws(() => setLineDone(o, "zz", true, { now: T0 }), { code: "line_not_found" });
		assert.deepEqual(steps(job({ lines: [{ id: "p", kind: "part" }] })).total, 1);
	});

	test("running jobs: open ones with a clock, latest started first", () => {
		const a = job({ id: "a", status: "in_progress", timeLog: [{ start: T0, end: null }] });
		const b = job({ id: "b", status: "in_progress", timeLog: [{ start: T1, end: null }] });
		const c = job({ id: "c", status: "delivered", timeLog: [{ start: T1, end: null }] });
		assert.deepEqual(runningJobs([a, b, c, job()]).map((o) => o.id), ["b", "a"]);
	});
});
