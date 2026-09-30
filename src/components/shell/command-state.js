"use client";

import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());

export function openCommandMenu() {
	open = true;
	emit();
}

export function setCommandMenuOpen(value) {
	open = value;
	emit();
}

export function useCommandMenuOpen() {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => open,
		() => false,
	);
}
