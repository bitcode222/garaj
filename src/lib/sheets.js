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
//
// Walking a visit's records (docs/VISIT-FLOW.md D4: booking → job → invoice →
// review) replaces the top sheet instead of stacking one, sliding the next record
// in from the side the arrow points to. Each walked sheet keeps the trail it came
// along, so Back (the sheet's button, the system Back) walks back the same way.

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

const makeKey = (type) => `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function openSheet(type, props = {}) {
	const entry = { type, props, open: true, key: makeKey(type) };
	const open = live();
	if (open.length >= MAX_DEPTH) retire([open[open.length - 1]]);
	stack = [...stack, entry];
	claimHistory();
	emit();
}

/**
 * Replaces the top sheet with another record of the same visit. `direction` is "forward"
 * (the next record: it comes in from the right) or "back" (from the left). Walking back to
 * the record just left returns along the trail instead of lengthening it.
 */
export function walkSheet(type, props = {}, direction = "forward", { trail: keepTrail = true } = {}) {
	const open = live();
	const top = open[open.length - 1];
	if (!top) {
		openSheet(type, props);
		return;
	}
	const trail = top.trail ?? [];
	const previous = trail[trail.length - 1];
	const returning = previous && previous.type === type && previous.props.id === props.id;
	const entry = {
		type,
		props,
		open: true,
		key: makeKey(type),
		enter: direction,
		// A form that becomes its record (check-in → job) is not a place to come back to.
		trail: !keepTrail ? trail : returning ? trail.slice(0, -1) : [...trail, { type: top.type, props: top.props }],
	};
	// One change: the record left and the record reached are never both missing (no flicker of the scrim).
	stack = [...stack.map((item) => (item.key === top.key ? { ...item, open: false, leave: direction } : item)), entry];
	emit();
	setTimeout(() => {
		const next = stack.filter((item) => item.open || item.key !== top.key);
		if (next.length !== stack.length) {
			stack = next;
			emit();
		}
	}, EXIT_MS);
}

/** Back along the trail of a walked sheet; false when the top sheet was not reached by walking. */
export function walkBack() {
	const open = live();
	const top = open[open.length - 1];
	const previous = top?.trail?.[top.trail.length - 1];
	if (!previous) return false;
	walkSheet(previous.type, previous.props, "back");
	return true;
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
		// The user went Back: our entry is gone. A walked sheet walks back along its trail; otherwise
		// the top sheet closes. If sheets remain, re-claim an entry.
		owned = false;
		const open = live();
		if (!open.length) return;
		if (walkBack()) {
			claimHistory();
			return;
		}
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
