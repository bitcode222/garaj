// Thin IndexedDB layer: one object store per collection (keyPath "id") and a
// "meta" store for settings, counters and flags (out-of-line keys).

export const COLLECTIONS = [
	"customers",
	"vehicles",
	"staff",
	"bays",
	"services",
	"parts",
	"appointments",
	"workOrders",
	"invoices",
	"payments",
	"contacts",
];

const DB_NAME = "garaj";
const DB_VERSION = 1;

let dbPromise = null;

const request = (req) =>
	new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});

const done = (tx) =>
	new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
	});

const hasAllStores = (db) => [...COLLECTIONS, "meta"].every((name) => db.objectStoreNames.contains(name));

/**
 * The browser may already hold a NEWER "garaj" database than this build knows
 * (a later version of the app, run from the same origin). Opening with a lower
 * version throws VersionError, so open whatever version exists and use it when
 * it has every store we need. Never deletes or downgrades anything.
 */
function openExisting() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME);
		req.onsuccess = () => {
			const db = req.result;
			if (!hasAllStores(db)) {
				db.close();
				reject(new Error(`A different "${DB_NAME}" database (version ${db.version}) exists in this browser. Clear this site's data to use the app.`));
				return;
			}
			db.onversionchange = () => db.close();
			resolve(db);
		};
		req.onerror = () => reject(req.error);
	});
}

export function openDB() {
	if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
	dbPromise ??= new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			for (const name of COLLECTIONS) {
				if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
			}
			if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
		};
		req.onsuccess = () => {
			const db = req.result;
			db.onversionchange = () => db.close();
			resolve(db);
		};
		req.onerror = (event) => {
			if (req.error?.name === "VersionError") {
				event.preventDefault(); // handled below, not an unhandled error
				openExisting().then(resolve, reject);
				return;
			}
			reject(req.error);
		};
		req.onblocked = () => reject(new Error("IndexedDB blocked by another tab"));
	}).catch((error) => {
		dbPromise = null;
		throw error;
	});
	return dbPromise;
}

/** Reads the given collections (arrays) and every meta entry in one transaction. */
export async function readStores(names = COLLECTIONS, withMeta = true) {
	const db = await openDB();
	const tx = db.transaction(withMeta ? [...names, "meta"] : names, "readonly");
	const collections = {};
	const pending = names.map(async (name) => {
		collections[name] = await request(tx.objectStore(name).getAll());
	});
	let meta = {};
	if (withMeta) {
		pending.push(
			(async () => {
				const store = tx.objectStore("meta");
				const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
				meta = Object.fromEntries(keys.map((k, i) => [k, values[i]]));
			})(),
		);
	}
	await Promise.all(pending);
	return { collections, meta };
}

/** batch: { stores: Map<name, Map<id, entity | null>>, meta: Map<key, value> }; null deletes. */
export async function writeBatch(batch) {
	const names = [...batch.stores.keys()];
	if (batch.meta.size) names.push("meta");
	if (!names.length) return;
	const db = await openDB();
	const tx = db.transaction(names, "readwrite");
	for (const [name, entries] of batch.stores) {
		const store = tx.objectStore(name);
		for (const [id, entity] of entries) {
			if (entity === null) store.delete(id);
			else store.put(entity);
		}
	}
	if (batch.meta.size) {
		const store = tx.objectStore("meta");
		for (const [key, value] of batch.meta) store.put(value, key);
	}
	await done(tx);
}

/** Replaces everything (restore, reset, first-run seed). */
export async function replaceAll({ collections, meta }) {
	const db = await openDB();
	const tx = db.transaction([...COLLECTIONS, "meta"], "readwrite");
	for (const name of COLLECTIONS) {
		const store = tx.objectStore(name);
		store.clear();
		for (const entity of collections[name] ?? []) store.put(entity);
	}
	const metaStore = tx.objectStore("meta");
	metaStore.clear();
	for (const [key, value] of Object.entries(meta)) metaStore.put(value, key);
	await done(tx);
}

/**
 * Runs `work(access)` inside one readwrite transaction over `names` + meta.
 * Reads see the latest committed data from every tab, so counters read and
 * incremented here are atomic (IndexedDB serializes overlapping transactions).
 */
export async function atomic(names, work) {
	const db = await openDB();
	const tx = db.transaction([...new Set([...names, "meta"])], "readwrite");
	const access = {
		get: (name, id) => request(tx.objectStore(name).get(id)),
		getMeta: (key) => request(tx.objectStore("meta").get(key)),
		put: (name, entity) => tx.objectStore(name).put(entity),
		del: (name, id) => tx.objectStore(name).delete(id),
		setMeta: (key, value) => tx.objectStore("meta").put(value, key),
	};
	const completion = done(tx);
	let result;
	try {
		result = await work(access);
	} catch (error) {
		try {
			tx.abort();
		} catch {
			// already finished
		}
		completion.catch(() => {});
		throw error;
	}
	await completion;
	return result;
}

export async function requestPersistence() {
	try {
		if (navigator.storage?.persisted && !(await navigator.storage.persisted())) {
			await navigator.storage.persist?.();
		}
	} catch {
		// best effort only
	}
}
