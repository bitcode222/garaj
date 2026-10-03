import { toast as base } from "sonner";
import { haptics } from "./haptics";

/**
 * sonner's `toast` plus a matching Taptic cue: success, error and warning are
 * felt as well as seen. Everything else (info, promise, dismiss…) is unchanged.
 */
export const toast = Object.assign((...args) => base(...args), base, {
	success: (...args) => {
		haptics.success();
		return base.success(...args);
	},
	error: (...args) => {
		haptics.error();
		return base.error(...args);
	},
	warning: (...args) => {
		haptics.warning();
		return base.warning(...args);
	},
});
