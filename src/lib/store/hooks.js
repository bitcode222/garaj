"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { todayISO } from "@/domain/dates";
import { INITIAL_STATE, getState, subscribe } from "./store";

/** Subscribes to one top-level key; re-renders only when that key changes. */
export function useStoreValue(key) {
	return useSyncExternalStore(
		(listener) => subscribe(key, listener),
		() => getState()[key],
		() => INITIAL_STATE[key],
	);
}

export const useCollection = (name) => useStoreValue(name);
export const useSettings = () => useStoreValue("settings");
export const useStoreStatus = () => useStoreValue("status");
export const useIsReady = () => useStoreValue("status") === "ready";

export function useEntity(name, id) {
	const collection = useStoreValue(name);
	return id ? collection[id] : undefined;
}

/**
 * Local "today", refreshed when the app returns to the foreground or the date
 * changes. Null during server render, so nothing date-dependent is prerendered.
 */
export function useToday() {
	const [today, setToday] = useState(null);
	useEffect(() => {
		const update = () => setToday((prev) => (prev === todayISO() ? prev : todayISO()));
		update();
		const timer = setInterval(update, 60_000);
		document.addEventListener("visibilitychange", update);
		return () => {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", update);
		};
	}, []);
	return today;
}
