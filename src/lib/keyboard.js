"use client";

import { useEffect } from "react";

const KEYBOARD_MIN = 100; // px; smaller gaps are the URL bar or rubber-banding, not a keyboard

/**
 * Publishes the on-screen keyboard as CSS variables on <html>:
 *   --kb   height covered by the keyboard (0px when closed)
 *   --vvh  height of the visible area above it
 * The web view is not resized by iOS, so fixed bottom surfaces (sheets, action
 * sheets) lift themselves with `bottom: var(--kb)` and cap their height with
 * `--vvh`, which keeps the footer buttons visible while typing.
 */
export function useKeyboardInset() {
	useEffect(() => {
		const viewport = window.visualViewport;
		if (!viewport) return;
		const root = document.documentElement;
		let frame = 0;
		const update = () => {
			frame = 0;
			const covered = Math.round(window.innerHeight - viewport.height - viewport.offsetTop);
			const keyboard = covered > KEYBOARD_MIN ? covered : 0;
			root.style.setProperty("--kb", `${keyboard}px`);
			root.style.setProperty("--vvh", keyboard ? `${Math.round(viewport.height)}px` : "100dvh");
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};
		viewport.addEventListener("resize", schedule);
		viewport.addEventListener("scroll", schedule);
		update();
		return () => {
			viewport.removeEventListener("resize", schedule);
			viewport.removeEventListener("scroll", schedule);
			cancelAnimationFrame(frame);
			root.style.removeProperty("--kb");
			root.style.removeProperty("--vvh");
		};
	}, []);
}
