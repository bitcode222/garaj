"use client";

import { useSyncExternalStore } from "react";

// Global sheets, openable from anywhere:
//   openSheet("customer", { id })   ·   openSheet("appointment-view", { id })
// The shell mounts the matching (lazy-loaded) components.
//
// Sheets form a small stack (max 2): a detail sheet can open its edit form on
// top and closing the form returns to the detail. The whole stack owns ONE
// history entry, so the iOS swipe-back / browser Back closes the top sheet
// instead of leaving the page.

const MAX_DEPTH = 2;
const EXIT_MS = 320; // sheet slide-out (280 ms) + a frame

let stack = [];
let owned = false; // our history entry is on top of the history stack
let skipPop = 0; // popstates caused by our own history.back()
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());
const live = () => stack.filter((entry) => entry.open);

function claimHistory() {
	if (owned || typeof window === "undefined") return;
	window.history.pushState({ ...window.history.state, __sheet: true }, "");
	owned = true;
}

function releaseHistory({ back }) {
	if (!owned) return;
	owned = false;
	if (back && window.history.state?.__sheet) {
		skipPop += 1;
		window.history.back();
	}
}

function retire(entries) {
	const keys = new Set(entries.map((entry) => entry.key));
	stack = stack.map((entry) => (keys.has(entry.key) ? { ...entry, open: false } : entry));
	emit();
	// Keep them mounted for the exit animation.
	setTimeout(() => {
		const next = stack.filter((entry) => entry.open || !keys.has(entry.key));
		if (next.length !== stack.length) {
			stack = next;
			emit();
		}
	}, EXIT_MS);
}

export function openSheet(type, props = {}) {
	const entry = { type, props, open: true, key: `${type}-${Date.now()}-${stack.length}` };
	const open = live();
	if (open.length >= MAX_DEPTH) retire([open[open.length - 1]]);
	stack = [...stack, entry];
	claimHistory();
	emit();
}

/** Closes the top sheet (the user's Esc / scrim / ✕). */
export function closeSheet() {
	const open = live();
	if (!open.length) return;
	retire([open[open.length - 1]]);
	if (open.length === 1) releaseHistory({ back: true });
}

/** Closes every sheet at once, no history change (used right before navigating). */
export function closeAllSheets() {
	const open = live();
	if (!open.length) return;
	retire(open);
	releaseHistory({ back: false });
}

/**
 * Leave the current page from inside a sheet. The sheet's history entry is
 * reused (replace) so Back returns to the page the sheet was opened on.
 */
export function navigateFromSheet(router, href) {
	const reuse = owned;
	closeAllSheets();
	if (reuse) router.replace(href);
	else router.push(href);
}

if (typeof window !== "undefined") {
	window.addEventListener("popstate", () => {
		if (skipPop > 0) {
			skipPop -= 1;
			return;
		}
		if (!owned) return;
		// The user went Back: our entry is gone. Close the top sheet; if more remain, re-claim an entry.
		owned = false;
		const open = live();
		if (!open.length) return;
		retire([open[open.length - 1]]);
		if (open.length > 1) claimHistory();
	});
}

export function useSheets() {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => stack,
		() => [],
	);
}
