// Taptic feedback through the native HapticsPlugin (AppDelegate.swift). Outside
// the iOS app every call is a silent no-op, so callers never need to check.
import { Capacitor, registerPlugin } from "@capacitor/core";

let plugin = null;

function native() {
	if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return null;
	plugin ??= registerPlugin("NativeHaptics");
	return plugin;
}

const fire = (method, options) => {
	try {
		native()?.[method]?.(options)?.catch?.(() => {});
	} catch {
		// feedback is a nicety, never an error
	}
};

export const haptics = {
	/** Light tap: tab change, menu pick, toggles. */
	selection: () => fire("selection"),
	/** Press feedback for primary actions. */
	tap: () => fire("impact", { style: "light" }),
	/** A threshold was crossed (swipe past the dismiss point). */
	thud: () => fire("impact", { style: "medium" }),
	/** Saved, issued, paid. */
	success: () => fire("notify", { type: "success" }),
	/** Destructive confirmation, or an irreversible step. */
	warning: () => fire("notify", { type: "warning" }),
	error: () => fire("notify", { type: "error" }),
};
