// Short vibrations where the browser supports them (Android); elsewhere every call is a
// silent no-op, so callers never need to check. The iPhone app is native (ios-native/).
const vibrate = (pattern) => {
	try {
		if (typeof navigator !== "undefined") navigator.vibrate?.(pattern);
	} catch {
		// feedback is a nicety, never an error
	}
};

export const haptics = {
	/** Light tap: tab change, menu pick, toggles. */
	selection: () => vibrate(5),
	/** Press feedback for primary actions. */
	tap: () => vibrate(8),
	/** A threshold was crossed (swipe past the dismiss point). */
	thud: () => vibrate(15),
	/** Saved, issued, paid. */
	success: () => vibrate([10, 40, 10]),
	/** Destructive confirmation, or an irreversible step. */
	warning: () => vibrate([20, 60, 20]),
	error: () => vibrate([30, 50, 30, 50, 30]),
};
