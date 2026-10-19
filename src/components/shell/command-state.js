"use client";

import { useSyncExternalStore } from "react";

// The search (⌘K): open or not, and what to start with. Every opening is a new `session`,
// so the search can tell it was opened again and take `seed` as its query (the home page's
// big field opens it with what was typed there).
let state = { open: false, session: 0, seed: "" };
const listeners = new Set();
const set = (next) => {
	state = { ...state, ...next };
	listeners.forEach((listener) => listener());
};

/** Opens the search; `text` (when it is text: it is also used as a click handler) is its query. */
export function openCommandMenu(text) {
	set({ open: true, session: state.session + 1, seed: typeof text === "string" ? text : "" });
}

export function setCommandMenuOpen(value) {
	if (value && !state.open) openCommandMenu();
	else set({ open: value });
}

const subscribe = (listener) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

/** { open, session, seed } */
export function useCommandMenu() {
	return useSyncExternalStore(subscribe, () => state, () => SERVER);
}
const SERVER = { open: false, session: 0, seed: "" };

export function useCommandMenuOpen() {
	return useCommandMenu().open;
}
