// In-memory, local-first store. Reads are synchronous (components subscribe per
// collection through useSyncExternalStore); writes update memory first, then
// persist to IndexedDB in one batched transaction per microtask.

import { todayISO } from "@/domain/dates";
import * as db from "./db";
import { COLLECTIONS } from "./db";
import { DEFAULT_SETTINGS, SCHEMA_VERSION, mergeSettings } from "./defaults";

export { COLLECTIONS };

const EMPTY = Object.freeze({});

export const INITIAL_STATE = Object.freeze({
	status: "idle", // idle · loading · ready · error
	persistence: "idb", // idb · memory
	demo: false,
	settings: DEFAULT_SETTINGS,
	counters: { invoices: {}, workOrders: 0 },
	...Object.fromEntries(COLLECTIONS.map((name) => [name, EMPTY])),
});

let state = INITIAL_STATE;
const listeners = new Map();

export const getState = () => state;

export function subscribe(key, listener) {
	let set = listeners.get(key);
	if (!set) listeners.set(key, (set = new Set()));
	set.add(listener);
	return () => set.delete(listener);
}

function notify(keys) {
	for (const key of keys) listeners.get(key)?.forEach((listener) => listener());
}

function setFlags(patch) {
	state = { ...state, ...patch };
	notify(Object.keys(patch));
}

const toMap = (list) => Object.fromEntries((list ?? []).map((e) => [e.id, e]));

// ── commits ──────────────────────────────────────────────────────────────────

/**
 * changes: { [collection]: { put?: entity[], del?: id[] }, settings?, counters?, demo? }
 */
export function commit(changes, { persist = true } = {}) {
	const next = { ...state };
	const touched = [];
	for (const [key, value] of Object.entries(changes)) {
		if (key === "settings" || key === "counters" || key === "demo") {
			next[key] = value;
		} else {
			const collection = { ...state[key] };
			for (const entity of value.put ?? []) collection[entity.id] = entity;
			for (const id of value.del ?? []) delete collection[id];
			next[key] = collection;
		}
		touched.push(key);
	}
	state = next;
	if (persist) queuePersist(changes);
	notify(touched);
}

let queue = null;
let flushTimer = null;
const FLUSH_DELAY = 250;

// Typing in an editor produces one write per pause, not per keystroke. When
// the app is backgrounded (iOS may suspend it any time after), write at once.
if (typeof window !== "undefined") {
	const flushNow = () => {
		if (document.visibilityState === "hidden") flush();
	};
	document.addEventListener("visibilitychange", flushNow);
	window.addEventListener("pagehide", () => flush());
}

function queuePersist(changes) {
	if (state.persistence !== "idb") return;
	queue ??= { stores: new Map(), meta: new Map() };
	for (const [key, value] of Object.entries(changes)) {
		// Counters are only ever written inside atomic transactions.
		if (key === "counters") continue;
		if (key === "settings" || key === "demo") {
			queue.meta.set(key, value);
			continue;
		}
		let entries = queue.stores.get(key);
		if (!entries) queue.stores.set(key, (entries = new Map()));
		for (const entity of value.put ?? []) entries.set(entity.id, entity);
		for (const id of value.del ?? []) entries.set(id, null);
	}
	clearTimeout(flushTimer);
	flushTimer = setTimeout(flush, FLUSH_DELAY);
}

export async function flush() {
	clearTimeout(flushTimer);
	flushTimer = null;
	const batch = queue;
	queue = null;
	if (!batch) return;
	try {
		await db.writeBatch(batch);
		broadcast([...batch.stores.keys()], [...batch.meta.keys()]);
	} catch (error) {
		console.error("[garaj] save failed", error);
		setFlags({ saveError: String(error?.message ?? error) });
	}
}

/**
 * Runs `work(access)` atomically (IDB transaction, or memory when IDB is off),
 * then mirrors every write into memory. Used for numbers and stock.
 */
export async function atomic(names, work) {
	const writes = { stores: new Map(), meta: new Map() };
	const record = (name, id, entity) => {
		let entries = writes.stores.get(name);
		if (!entries) writes.stores.set(name, (entries = new Map()));
		entries.set(id, entity);
	};

	let result;
	if (state.persistence === "idb") {
		result = await db.atomic(names, (tx) =>
			work({
				get: (name, id) => tx.get(name, id),
				getMeta: (key) => tx.getMeta(key),
				put: (name, entity) => {
					tx.put(name, entity);
					record(name, entity.id, entity);
				},
				del: (name, id) => {
					tx.del(name, id);
					record(name, id, null);
				},
				setMeta: (key, value) => {
					tx.setMeta(key, value);
					writes.meta.set(key, value);
				},
			}),
		);
	} else {
		result = await work({
			get: async (name, id) => state[name][id],
			getMeta: async (key) => state[key],
			put: (name, entity) => record(name, entity.id, entity),
			del: (name, id) => record(name, id, null),
			setMeta: (key, value) => writes.meta.set(key, value),
		});
	}

	const changes = {};
	for (const [name, entries] of writes.stores) {
		const put = [];
		const del = [];
		for (const [id, entity] of entries) (entity ? put : del).push(entity ?? id);
		changes[name] = { put, del };
	}
	for (const [key, value] of writes.meta) changes[key] = value;
	commit(changes, { persist: false });
	broadcast([...writes.stores.keys()], [...writes.meta.keys()]);
	return result;
}

// ── tabs ─────────────────────────────────────────────────────────────────────

let channel = null;

function broadcast(stores, meta) {
	if (!stores.length && !meta.length) return;
	channel?.postMessage({ type: "changed", stores, meta });
}

async function reloadFromDisk(stores, metaKeys) {
	const { collections, meta } = await db.readStores(stores, metaKeys.length > 0);
	const changes = {};
	for (const name of stores) {
		const map = toMap(collections[name]);
		// Keep local edits that are still waiting to be flushed.
		for (const [id, entity] of queue?.stores.get(name) ?? []) {
			if (entity) map[id] = entity;
			else delete map[id];
		}
		state = { ...state, [name]: map };
		changes[name] = true;
	}
	if (metaKeys.includes("settings")) state = { ...state, settings: mergeSettings(meta.settings) };
	if (metaKeys.includes("counters")) state = { ...state, counters: meta.counters ?? INITIAL_STATE.counters };
	if (metaKeys.includes("demo")) state = { ...state, demo: Boolean(meta.demo) };
	notify([...Object.keys(changes), ...metaKeys]);
}

// ── lifecycle ────────────────────────────────────────────────────────────────

function applySnapshot({ collections, meta }, persistence) {
	state = {
		...state,
		status: "ready",
		persistence,
		demo: Boolean(meta.demo),
		settings: mergeSettings(meta.settings),
		counters: meta.counters ?? INITIAL_STATE.counters,
		...Object.fromEntries(COLLECTIONS.map((name) => [name, toMap(collections[name])])),
	};
	notify(Object.keys(state));
}

async function buildDemo() {
	const { buildDemoData } = await import("./seed");
	return buildDemoData(todayISO());
}

let initPromise = null;

/** Loads data once per page load. First run seeds the demo shop. */
export function initStore() {
	initPromise ??= (async () => {
		setFlags({ status: "loading" });
		try {
			let snapshot = await db.readStores();
			if (!snapshot.meta.schema) {
				snapshot = await buildDemo();
				await db.replaceAll(snapshot);
			}
			applySnapshot(snapshot, "idb");
			if (typeof BroadcastChannel !== "undefined") {
				channel = new BroadcastChannel("garaj");
				channel.onmessage = (event) => {
					if (event.data?.type === "changed") reloadFromDisk(event.data.stores, event.data.meta);
					if (event.data?.type === "replaced") window.location.reload();
				};
			}
			db.requestPersistence();
		} catch (error) {
			console.warn("[garaj] IndexedDB unavailable, running in memory", error);
			applySnapshot(await buildDemo(), "memory");
		}
	})();
	return initPromise;
}

/** Replaces all data (restore, reset). Other tabs reload. */
export async function replaceAllData(snapshot) {
	const full = {
		collections: snapshot.collections,
		meta: { ...snapshot.meta, schema: SCHEMA_VERSION },
	};
	if (state.persistence === "idb") await db.replaceAll(full);
	applySnapshot(full, state.persistence);
	channel?.postMessage({ type: "replaced" });
}

export function snapshotForBackup() {
	return {
		collections: Object.fromEntries(COLLECTIONS.map((name) => [name, Object.values(state[name])])),
		meta: { settings: state.settings, counters: state.counters, demo: state.demo, schema: SCHEMA_VERSION },
	};
}
