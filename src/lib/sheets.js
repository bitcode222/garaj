"use client";

import { useSyncExternalStore } from "react";

// One global create/edit sheet at a time, openable from anywhere:
//   openSheet("customer", { id })   ·   openSheet("appointment", { start })
// The shell mounts the matching (lazy-loaded) component.

let current = null;
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());

export function openSheet(type, props = {}) {
	current = { type, props, open: true, key: `${type}-${Date.now()}` };
	emit();
}

export function closeSheet() {
	if (!current) return;
	const closing = { ...current, open: false };
	current = closing;
	emit();
	// Keep it mounted for the exit animation.
	setTimeout(() => {
		if (current === closing) {
			current = null;
			emit();
		}
	}, 320);
}

export function useSheet() {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => current,
		() => null,
	);
}
