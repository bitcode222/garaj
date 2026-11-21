"use client";

import { useCallback } from "react";
import { liquidGlass } from "@/lib/liquid-glass";
import { useLocalPreference, useMediaQuery } from "@/lib/hooks";
import { cn } from "@/lib/utils";

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
	// The phone's floating capsules, as the iPhone's: the tab bar, the nav row's buttons, the running job.
	capsule: { strength: 30, frost: 10, saturate: 1.8, tint: "color-mix(in srgb, var(--card) 70%, transparent)", solid: "var(--card)" },
	// Menus, the search window, the mini month: well frosted, so their rows stay crisp.
	// Buttons on a car's colour (the owner's pick C on the iPhone): clear glass with a white tint; the text keeps the ink.
	clear: { strength: 24, frost: 2, saturate: 1.8, tint: "rgb(255 255 255 / 0.2)", solid: "rgb(255 255 255 / 0.3)" },
	// Buttons on the page (filters, quick actions, an outlined card's buttons): a faint ink tint, lightly frosted.
	pill: { strength: 20, frost: 6, saturate: 1.8, tint: "color-mix(in srgb, var(--foreground) 7%, transparent)", solid: "var(--muted)" },
	// The chosen or main button on the page: dark glass in the light theme, light in the dark one.
	ink: { strength: 20, frost: 6, saturate: 1.6, tint: "color-mix(in srgb, var(--foreground) 82%, transparent)", solid: "var(--foreground)" },
	// The side nav's selected route: clear, so the row under it stays sharp; only its rim bends what it passes.
	nav: { strength: 14, bevel: 7, frost: 0, saturate: 1.5, tint: "color-mix(in srgb, var(--foreground) 7%, transparent)", solid: "color-mix(in srgb, var(--foreground) 10%, transparent)" },
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

/**
 * A button of liquid glass for the dashboard's filters: `active` is dark glass (ink), the rest the page's glass.
 * Without glass it keeps the plain look (primary when active, card otherwise).
 */
export function GlassPill({ active = false, className, ref, ...props }) {
	const glass = useGlass(active ? "ink" : "pill", { outer: ref });
	return (
		<button
			ref={glass}
			type="button"
			className={cn(
				"inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium [&.lg-pane]:border-transparent",
				active ? "bg-primary text-primary-foreground [&.lg-pane]:text-background" : "border bg-card",
				className,
			)}
			{...props}
		/>
	);
}

/** An element of liquid glass: `<Glass as="nav" preset="bar" media="(max-width: 767px)">`. */
export function Glass({ as: Tag = "div", preset, media, ref, ...props }) {
	const glass = useGlass(preset, { media, outer: ref });
	return <Tag ref={glass} {...props} />;
}
