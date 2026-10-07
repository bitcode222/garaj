"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/** `?id=` of detail pages (static export cannot know ids at build time). */
export function useQueryId() {
	return useSearchParams().get("id");
}

const noopSubscribe = () => () => {};

/** False during server render and hydration, true after — without an effect + setState. */
export function useHydrated() {
	return useSyncExternalStore(
		noopSubscribe,
		() => true,
		() => false,
	);
}

const preferenceListeners = new Set();

/**
 * A per-device UI choice (calendar view, board vs list) kept in localStorage.
 * The server and the first client render use `fallback`, so hydration matches.
 */
export function useLocalPreference(key, fallback, allowed) {
	const value = useSyncExternalStore(
		(listener) => {
			preferenceListeners.add(listener);
			window.addEventListener("storage", listener);
			return () => {
				preferenceListeners.delete(listener);
				window.removeEventListener("storage", listener);
			};
		},
		() => {
			try {
				const stored = localStorage.getItem(key);
				return stored != null && (!allowed || allowed.includes(stored)) ? stored : fallback;
			} catch {
				return fallback;
			}
		},
		() => fallback,
	);
	const set = useCallback(
		(next) => {
			try {
				localStorage.setItem(key, next);
			} catch {
				// Private mode: the choice lasts for this page only.
			}
			preferenceListeners.forEach((listener) => listener());
		},
		[key],
	);
	return [value, set];
}

/**
 * Local editable copy of an entity with a debounced commit. External changes
 * (another tab) replace the copy only when there are no local edits pending.
 */
export function useDraft(source, commit, delay = 400) {
	const [draft, setDraft] = useState(source);
	const [base, setBase] = useState(source);
	const [dirty, setDirty] = useState(false);
	const latest = useRef({ draft: source, commit, timer: null, pending: false });

	if (source !== base) {
		setBase(source);
		if (!dirty) setDraft(source);
	}

	useEffect(() => {
		latest.current.commit = commit;
		if (!latest.current.pending) latest.current.draft = draft;
	});

	const flush = useCallback(() => {
		const state = latest.current;
		if (!state.pending) return;
		clearTimeout(state.timer);
		state.pending = false;
		setDirty(false);
		state.commit(state.draft);
	}, []);

	const update = useCallback(
		(patchOrFn) => {
			const state = latest.current;
			const next = typeof patchOrFn === "function" ? patchOrFn(state.draft) : { ...state.draft, ...patchOrFn };
			state.draft = next;
			state.pending = true;
			clearTimeout(state.timer);
			state.timer = setTimeout(flush, delay);
			setDraft(next);
			setDirty(true);
		},
		[delay, flush],
	);

	useEffect(() => flush, [flush]);

	return [draft, update, flush];
}

/** Prints the current page: native print sheet in the iOS app, browser dialog elsewhere. */
export async function printPage(name) {
	const previous = document.title;
	if (name) document.title = name;
	try {
		if (window.Capacitor?.isNativePlatform?.()) {
			const { registerPlugin } = await import("@capacitor/core");
			await registerPlugin("Printer").print({ name: name ?? previous });
		} else {
			window.print();
		}
	} finally {
		document.title = previous;
	}
}

/** Native share sheet when available; clipboard otherwise. Returns "shared" | "copied" | "failed". */
export async function shareText({ title, text }) {
	try {
		if (navigator.share) {
			await navigator.share({ title, text });
			return "shared";
		}
		await navigator.clipboard.writeText(text);
		return "copied";
	} catch (error) {
		if (error?.name === "AbortError") return "cancelled";
		try {
			await navigator.clipboard.writeText(text);
			return "copied";
		} catch {
			return "failed";
		}
	}
}
