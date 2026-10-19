"use client";

import { useEffect, useSyncExternalStore } from "react";

// The sidebar's "Recente" (docs/APPOINTMENTS-AND-NAV.md D3): the records opened last, kept on
// this device only. Twice as many are kept as shown, so a deleted one leaves no gap.
const KEY = "garaj.recents";
export const RECENTS_SHOWN = 5;
const listeners = new Set();

function stored() {
	try {
		return localStorage.getItem(KEY) ?? "[]";
	} catch {
		return "[]";
	}
}

function parse(text) {
	try {
		const list = JSON.parse(text);
		return Array.isArray(list) ? list.filter((item) => item && typeof item.kind === "string" && typeof item.id === "string") : [];
	} catch {
		return [];
	}
}

/** Puts a record first among the recent ones. `kind`: vehicle · customer · work-order · invoice · appointment. */
export function remember(kind, id) {
	if (!kind || !id) return;
	const list = parse(stored());
	if (list[0]?.kind === kind && list[0]?.id === id) return;
	const next = [{ kind, id }, ...list.filter((item) => !(item.kind === kind && item.id === id))].slice(0, RECENTS_SHOWN * 2);
	try {
		localStorage.setItem(KEY, JSON.stringify(next));
	} catch {
		// private mode: nothing is remembered
	}
	listeners.forEach((listener) => listener());
}

const subscribe = (listener) => {
	listeners.add(listener);
	window.addEventListener("storage", listener);
	return () => {
		listeners.delete(listener);
		window.removeEventListener("storage", listener);
	};
};

/** The recent records, latest first: [{ kind, id }] (not yet checked against the store). */
export function useRecents() {
	return parse(useSyncExternalStore(subscribe, stored, () => "[]"));
}

/** A record being shown remembers itself. */
export function useRemember(kind, id) {
	useEffect(() => {
		remember(kind, id);
	}, [kind, id]);
}
