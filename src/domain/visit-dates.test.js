import { test } from "node:test";
import assert from "node:assert/strict";
import { dateDelta, editableJobDates, setJobDates, visitDates } from "./visit-dates.js";

const at = (hour, day = 20) => new Date(Date.UTC(2026, 10, day, hour)).toISOString();
const NOW = at(18, 21);
const job = (extra = {}) => ({ id: "w", status: "in_progress", receivedAt: at(9), createdAt: at(8), dates: {}, activity: [], ...extra });
const booking = { start: at(8), end: at(12) };

test("the promise starts from the end of the booking, and a job's own promise wins", () => {
	assert.equal(visitDates({ appointment: booking, order: job() }).promised, booking.end);
	assert.equal(visitDates({ appointment: booking, order: job({ promisedAt: at(15) }) }).promised, at(15));
});

test("a deviz before the car came has no arrival; an older job counts from when it was opened", () => {
	assert.equal(visitDates({ order: job({ receivedAt: null }) }).arrived, null);
	assert.equal(visitDates({ order: job({ receivedAt: undefined }) }).arrived, at(8));
});

test("a job sent back to work no longer shows its old ready date", () => {
	assert.equal(visitDates({ order: job({ dates: { ready: at(11) } }) }).ready, null);
	assert.equal(visitDates({ order: job({ status: "ready", dates: { ready: at(11) } }) }).ready, at(11));
});

test("only what happened can be corrected, and nothing on a cancelled job", () => {
	assert.deepEqual(editableJobDates(job()), ["arrived", "promised"]);
	assert.deepEqual(editableJobDates(job({ status: "delivered", dates: { ready: at(11), delivered: at(13) } })), ["arrived", "promised", "ready", "delivered"]);
	assert.deepEqual(editableJobDates(job({ status: "cancelled" })), []);
	assert.throws(() => setJobDates(job(), { ready: at(11) }, { now: NOW }), /nu se poate modifica/);
});

test("corrections are written to the job and logged", () => {
	const next = setJobDates(job({ status: "delivered", dates: { ready: at(11), delivered: at(13) } }), { arrived: at(10), delivered: at(14) }, { now: NOW, by: "Ana" });
	assert.equal(next.receivedAt, at(10));
	assert.equal(next.dates.delivered, at(14));
	assert.deepEqual(next.activity.map((entry) => [entry.type, entry.field, entry.by]), [["date_changed", "arrived", "Ana"], ["date_changed", "delivered", "Ana"]]);
});

test("the same date is not a change", () => {
	const order = job();
	assert.equal(setJobDates(order, { arrived: at(9) }, { now: NOW }), order);
});

test("what happened cannot be in the future or out of order", () => {
	assert.throws(() => setJobDates(job(), { arrived: at(19, 21) }, { now: NOW }), /viitor/);
	const done = job({ status: "delivered", dates: { ready: at(11), delivered: at(13) } });
	assert.throws(() => setJobDates(done, { ready: at(8) }, { now: NOW }), /înainte să intre/);
	assert.throws(() => setJobDates(done, { delivered: at(10) }, { now: NOW }), /înainte să fie gata/);
	assert.throws(() => setJobDates(job(), { promised: at(8) }, { now: NOW }), /Termenul/);
});

test("a car that came after the booking's end can still have its arrival corrected", () => {
	const late = job({ receivedAt: at(14) });
	assert.equal(setJobDates(late, { arrived: at(13) }, { now: NOW, appointment: booking }).receivedAt, at(13));
});

test("a promise may be in the future", () => {
	assert.equal(setJobDates(job(), { promised: at(9, 25) }, { now: NOW }).promisedAt, at(9, 25));
});

test("within 15 minutes is on time; beyond it, late or early", () => {
	assert.deepEqual(dateDelta(at(9), at(9)), { kind: "on_time", minutes: 0 });
	assert.deepEqual(dateDelta(at(10), at(9)), { kind: "late", minutes: 60 });
	assert.deepEqual(dateDelta(at(8), at(9)), { kind: "early", minutes: 60 });
	assert.equal(dateDelta(null, at(9)), null);
});
