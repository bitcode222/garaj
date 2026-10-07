// Tone = the color of a meaning (status, category, due date). Class strings are
// written out in full so Tailwind can see them. Names follow the original
// calendar colors; "yellow" uses the amber palette for readable contrast.

export const TONE_NAMES = ["neutral", "blue", "purple", "orange", "yellow", "green", "red"];

export const TONES = {
	neutral: {
		chip: "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300",
		block: "border-zinc-200 bg-zinc-100/70 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:bg-zinc-800",
		solid: "bg-zinc-400 dark:bg-zinc-500",
		text: "text-zinc-600 dark:text-zinc-400",
		soft: "bg-zinc-50 dark:bg-zinc-900/60",
		border: "border-zinc-300 dark:border-zinc-600",
		bar: "bg-zinc-300 dark:bg-zinc-600",
		// Saturated gradient for hero cards: white text on it always reads (700 → 500 left to right).
		banner: "bg-linear-to-br from-zinc-700 via-zinc-600 to-zinc-500 text-white dark:from-zinc-900 dark:via-zinc-800 dark:to-zinc-700",
	},
	blue: {
		chip: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
		block: "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-200 dark:hover:bg-blue-950",
		solid: "bg-blue-500",
		text: "text-blue-700 dark:text-blue-300",
		// Selected navigation row: solid light-blue pill, no border.
		nav: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
		soft: "bg-blue-50/70 dark:bg-blue-950/30",
		border: "border-blue-300 dark:border-blue-700",
		bar: "bg-blue-500",
		banner: "bg-linear-to-br from-blue-700 via-blue-600 to-blue-500 text-white dark:from-blue-900 dark:via-blue-800 dark:to-blue-700",
	},
	purple: {
		chip: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300",
		block: "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-200 dark:hover:bg-violet-950",
		solid: "bg-violet-500",
		text: "text-violet-700 dark:text-violet-300",
		soft: "bg-violet-50/70 dark:bg-violet-950/30",
		border: "border-violet-300 dark:border-violet-700",
		bar: "bg-violet-500",
		banner: "bg-linear-to-br from-violet-700 via-violet-600 to-violet-500 text-white dark:from-violet-900 dark:via-violet-800 dark:to-violet-700",
	},
	orange: {
		chip: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/60 dark:text-orange-300",
		block: "border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/60 dark:text-orange-200 dark:hover:bg-orange-950",
		solid: "bg-orange-500",
		text: "text-orange-700 dark:text-orange-300",
		soft: "bg-orange-50/70 dark:bg-orange-950/30",
		border: "border-orange-300 dark:border-orange-700",
		bar: "bg-orange-500",
		banner: "bg-linear-to-br from-orange-700 via-orange-600 to-orange-500 text-white dark:from-orange-900 dark:via-orange-800 dark:to-orange-700",
	},
	yellow: {
		chip: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
		block: "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200 dark:hover:bg-amber-950",
		solid: "bg-amber-500",
		text: "text-amber-700 dark:text-amber-300",
		soft: "bg-amber-50/70 dark:bg-amber-950/30",
		border: "border-amber-300 dark:border-amber-700",
		bar: "bg-amber-500",
		banner: "bg-linear-to-br from-amber-700 via-amber-600 to-amber-500 text-white dark:from-amber-900 dark:via-amber-800 dark:to-amber-700",
	},
	green: {
		chip: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
		block: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 dark:hover:bg-emerald-950",
		solid: "bg-emerald-500",
		text: "text-emerald-700 dark:text-emerald-300",
		soft: "bg-emerald-50/70 dark:bg-emerald-950/30",
		border: "border-emerald-300 dark:border-emerald-700",
		bar: "bg-emerald-500",
		banner: "bg-linear-to-br from-emerald-700 via-emerald-600 to-emerald-500 text-white dark:from-emerald-900 dark:via-emerald-800 dark:to-emerald-700",
	},
	red: {
		chip: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300",
		block: "border-red-200 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200 dark:hover:bg-red-950",
		solid: "bg-red-500",
		text: "text-red-700 dark:text-red-300",
		soft: "bg-red-50/70 dark:bg-red-950/30",
		border: "border-red-300 dark:border-red-700",
		bar: "bg-red-500",
		banner: "bg-linear-to-br from-red-700 via-red-600 to-red-500 text-white dark:from-red-900 dark:via-red-800 dark:to-red-700",
	},
};

export const tone = (name) => TONES[name] ?? TONES.neutral;
