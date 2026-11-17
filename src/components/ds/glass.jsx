"use client";

import { useCallback } from "react";
import { liquidGlass } from "@/lib/liquid-glass";
import { useLocalPreference, useMediaQuery } from "@/lib/hooks";

/** The device's choice (Setări › Aspect): liquid glass on the floating surfaces, or the plain ones. */
export const GLASS_KEY = "garaj.glass";
export const GLASS_VALUES = ["on", "off"];

// How each kind of surface is glassed (docs/LIQUID-GLASS.md, docs/DESIGN.md §3). The tints are the theme's own colours
// mixed with transparency, so light and dark follow; "solid" is the pane when the system asks for less transparency.
const PRESETS = {
	// The phone's top bar, tab bar and action bar: frosted enough to read over anything, a gentle rim.
	bar: { strength: 18, bevel: 12, frost: 12, saturate: 1.8, tint: "color-mix(in srgb, var(--card) 72%, transparent)", solid: "var(--card)" },
	// The running job's capsule: dark glass in the light theme, light in the dark one (its text keeps its colour).
	float: { strength: 36, frost: 8, saturate: 1.6, tint: "color-mix(in srgb, var(--foreground) 72%, transparent)", solid: "var(--foreground)" },
	// Menus, the search window, the mini month: well frosted, so their rows stay crisp.
	menu: { strength: 28, frost: 18, saturate: 1.8, tint: "color-mix(in srgb, var(--popover) 78%, transparent)", solid: "var(--popover)" },
};

/** Hands the element to the component's own ref too (a function or an object). */
function assign(ref, value) {
	if (typeof ref === "function") ref(value);
	else if (ref) ref.current = value;
}

/**
 * A ref that turns its element into liquid glass while it is mounted (React 19 callback ref with cleanup), and back
 * when glass is switched off or `media` stops matching. Pass the component's own `ref` as `outer` to keep it working.
 * Anything the browser cannot do falls back to the element's own look (src/lib/liquid-glass.js).
 */
export function useGlass(preset, { media, outer } = {}) {
	const [pref] = useLocalPreference(GLASS_KEY, "on", GLASS_VALUES);
	const matches = useMediaQuery(media ?? "all");
	const on = pref === "on" && matches;
	return useCallback(
		(el) => {
			assign(outer, el);
			const off = on && el ? liquidGlass(el, PRESETS[preset]) : null;
			return () => {
				off?.();
				assign(outer, null);
			};
		},
		[on, preset, outer],
	);
}

/** An element of liquid glass: `<Glass as="nav" preset="bar" media="(max-width: 767px)">`. */
export function Glass({ as: Tag = "div", preset, media, ref, ...props }) {
	const glass = useGlass(preset, { media, outer: ref });
	return <Tag ref={glass} {...props} />;
}
