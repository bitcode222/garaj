// Tone = the color of a meaning: a record's kind (docs/RECORD-COLORS.md), a state, a category, a due date. Class strings are
// written out in full so Tailwind can see them. Names follow the original
// calendar colors; "yellow" uses the amber palette for readable contrast.

export const TONE_NAMES = ["neutral", "blue", "teal", "purple", "orange", "yellow", "green", "red", "pink"];

export const TONES = {
	neutral: {
		// A state dot (docs/RECORD-COLORS.md): the fill and its icon's colour (dark on amber, where white fails contrast).
		dot: "bg-zinc-500 text-white",
		chip: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-300",
		vivid: "border-zinc-700/45 bg-zinc-500 text-white hover:bg-zinc-600 dark:bg-zinc-600 dark:hover:bg-zinc-500",
		// A calendar block (docs/DESIGN-SYSTEM.md, very small cards): white, outlined in the colour; its time in `text`.
		line: "border-zinc-400 bg-card text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-800/40 dark:border-zinc-500",
		block: "border-zinc-300 bg-zinc-100/70 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:bg-zinc-800",
		solid: "bg-zinc-400 dark:bg-zinc-500",
		// A chart's mark in SVG (the half donut, ds/half-donut.jsx): the solid colour as a fill.
		fill: "fill-zinc-400 dark:fill-zinc-500",
		text: "text-zinc-600 dark:text-zinc-400",
		soft: "bg-zinc-50 dark:bg-zinc-900/60",
		// The calendar's mechanic lanes: stronger than soft, so a row reads at a glance.
		lane: "bg-zinc-100/60 dark:bg-zinc-800/50",
		border: "border-zinc-400 dark:border-zinc-500",
		bar: "bg-zinc-300 dark:bg-zinc-600",
	},
	blue: {
		// A state dot (docs/RECORD-COLORS.md): the fill and its icon's colour (dark on amber, where white fails contrast).
		dot: "bg-blue-600 text-white dark:bg-blue-500",
		chip: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
		vivid: "border-blue-800/55 bg-blue-600 text-white hover:bg-blue-700 dark:hover:bg-blue-500",
		// A calendar block (docs/DESIGN-SYSTEM.md, very small cards): white, outlined in the colour; its time in `text`.
		line: "border-blue-500 bg-card text-foreground hover:bg-blue-50/60 dark:hover:bg-blue-950/40 dark:border-blue-400",
		block: "border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/60 dark:text-blue-200 dark:hover:bg-blue-950",
		solid: "bg-blue-500",
		fill: "fill-blue-500",
		text: "text-blue-700 dark:text-blue-300",
		// Selected navigation row: solid light-blue pill, no border.
		nav: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
		soft: "bg-blue-50/70 dark:bg-blue-950/30",
		lane: "bg-blue-100/60 dark:bg-blue-900/40",
		border: "border-blue-400 dark:border-blue-600",
		bar: "bg-blue-500",
	},
	// Programări's colour (docs/RECORD-COLORS.md): no status uses it.
	teal: {
		dot: "bg-teal-600 text-white dark:bg-teal-500",
		chip: "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
		vivid: "border-teal-800/55 bg-teal-600 text-white hover:bg-teal-700 dark:hover:bg-teal-500",
		// A calendar block (docs/DESIGN-SYSTEM.md, very small cards): white, outlined in the colour; its time in `text`.
		line: "border-teal-500 bg-card text-foreground hover:bg-teal-50/60 dark:hover:bg-teal-950/40 dark:border-teal-400",
		block: "border-teal-300 bg-teal-50 text-teal-800 hover:bg-teal-100 dark:border-teal-700 dark:bg-teal-950/60 dark:text-teal-200 dark:hover:bg-teal-950",
		solid: "bg-teal-500",
		fill: "fill-teal-500",
		text: "text-teal-700 dark:text-teal-300",
		soft: "bg-teal-50/70 dark:bg-teal-950/30",
		lane: "bg-teal-100/60 dark:bg-teal-900/40",
		border: "border-teal-400 dark:border-teal-600",
		bar: "bg-teal-500",
	},
	purple: {
		// A state dot (docs/RECORD-COLORS.md): the fill and its icon's colour (dark on amber, where white fails contrast).
		dot: "bg-violet-600 text-white dark:bg-violet-500",
		chip: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
		vivid: "border-violet-800/55 bg-violet-600 text-white hover:bg-violet-700 dark:hover:bg-violet-500",
		// A calendar block (docs/DESIGN-SYSTEM.md, very small cards): white, outlined in the colour; its time in `text`.
		line: "border-violet-500 bg-card text-foreground hover:bg-violet-50/60 dark:hover:bg-violet-950/40 dark:border-violet-400",
		block: "border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950/60 dark:text-violet-200 dark:hover:bg-violet-950",
		solid: "bg-violet-500",
		fill: "fill-violet-500",
		text: "text-violet-700 dark:text-violet-300",
		soft: "bg-violet-50/70 dark:bg-violet-950/30",
		lane: "bg-violet-100/60 dark:bg-violet-900/40",
		border: "border-violet-400 dark:border-violet-600",
		bar: "bg-violet-500",
	},
	orange: {
		// A state dot (docs/RECORD-COLORS.md): the fill and its icon's colour (dark on amber, where white fails contrast).
		dot: "bg-orange-500 text-white",
		chip: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
		vivid: "border-orange-800/55 bg-orange-600 text-white hover:bg-orange-700 dark:hover:bg-orange-500",
		// A calendar block (docs/DESIGN-SYSTEM.md, very small cards): white, outlined in the colour; its time in `text`.
		line: "border-orange-500 bg-card text-foreground hover:bg-orange-50/60 dark:hover:bg-orange-950/40 dark:border-orange-400",
		block: "border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-950/60 dark:text-orange-200 dark:hover:bg-orange-950",
		solid: "bg-orange-500",
		fill: "fill-orange-500",
		text: "text-orange-700 dark:text-orange-300",
		soft: "bg-orange-50/70 dark:bg-orange-950/30",
		lane: "bg-orange-100/60 dark:bg-orange-900/40",
		border: "border-orange-400 dark:border-orange-600",
		bar: "bg-orange-500",
	},
	yellow: {
		// A state dot (docs/RECORD-COLORS.md): the fill and its icon's colour (dark on amber, where white fails contrast).
		dot: "bg-amber-400 text-amber-950",
		chip: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
		vivid: "border-amber-600/75 bg-amber-400 text-amber-950 hover:bg-amber-500",
		// A calendar block (docs/DESIGN-SYSTEM.md, very small cards): white, outlined in the colour; its time in `text`.
		line: "border-amber-500 bg-card text-foreground hover:bg-amber-50/60 dark:hover:bg-amber-950/40 dark:border-amber-400",
		block: "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200 dark:hover:bg-amber-950",
		solid: "bg-amber-500",
		fill: "fill-amber-500",
		text: "text-amber-700 dark:text-amber-300",
		soft: "bg-amber-50/70 dark:bg-amber-950/30",
		lane: "bg-amber-100/60 dark:bg-amber-900/40",
		border: "border-amber-400 dark:border-amber-600",
		bar: "bg-amber-500",
		outline: "outline-amber-500",
	},
	green: {
		// A state dot (docs/RECORD-COLORS.md): the fill and its icon's colour (dark on amber, where white fails contrast).
		dot: "bg-emerald-600 text-white dark:bg-emerald-500",
		chip: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
		vivid: "border-emerald-800/55 bg-emerald-600 text-white hover:bg-emerald-700 dark:hover:bg-emerald-500",
		// A calendar block (docs/DESIGN-SYSTEM.md, very small cards): white, outlined in the colour; its time in `text`.
		line: "border-emerald-500 bg-card text-foreground hover:bg-emerald-50/60 dark:hover:bg-emerald-950/40 dark:border-emerald-400",
		block: "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200 dark:hover:bg-emerald-950",
		solid: "bg-emerald-500",
		fill: "fill-emerald-500",
		text: "text-emerald-700 dark:text-emerald-300",
		soft: "bg-emerald-50/70 dark:bg-emerald-950/30",
		lane: "bg-emerald-100/60 dark:bg-emerald-900/40",
		border: "border-emerald-400 dark:border-emerald-600",
		bar: "bg-emerald-500",
	},
	red: {
		// A state dot (docs/RECORD-COLORS.md): the fill and its icon's colour (dark on amber, where white fails contrast).
		dot: "bg-red-600 text-white dark:bg-red-500",
		chip: "border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/60 dark:text-red-300",
		vivid: "border-red-800/55 bg-red-600 text-white hover:bg-red-700 dark:hover:bg-red-500",
		// A calendar block (docs/DESIGN-SYSTEM.md, very small cards): white, outlined in the colour; its time in `text`.
		line: "border-red-500 bg-card text-foreground hover:bg-red-50/60 dark:hover:bg-red-950/40 dark:border-red-400",
		block: "border-red-300 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-700 dark:bg-red-950/60 dark:text-red-200 dark:hover:bg-red-950",
		solid: "bg-red-500",
		fill: "fill-red-500",
		text: "text-red-700 dark:text-red-300",
		soft: "bg-red-50/70 dark:bg-red-950/30",
		lane: "bg-red-100/60 dark:bg-red-900/40",
		border: "border-red-400 dark:border-red-600",
		bar: "bg-red-500",
		outline: "outline-red-500",
	},
	// Recenzie's colour (docs/VISIT-BAR.md B5): no state uses it, and it is far from the other kinds' four.
	pink: {
		dot: "bg-pink-600 text-white dark:bg-pink-500",
		chip: "border-pink-300 bg-pink-50 text-pink-700 dark:border-pink-700 dark:bg-pink-950/60 dark:text-pink-300",
		vivid: "border-pink-800/55 bg-pink-600 text-white hover:bg-pink-700 dark:hover:bg-pink-500",
		line: "border-pink-500 bg-card text-foreground hover:bg-pink-50/60 dark:hover:bg-pink-950/40 dark:border-pink-400",
		block: "border-pink-300 bg-pink-50 text-pink-800 hover:bg-pink-100 dark:border-pink-700 dark:bg-pink-950/60 dark:text-pink-200 dark:hover:bg-pink-950",
		solid: "bg-pink-500",
		fill: "fill-pink-500",
		text: "text-pink-700 dark:text-pink-300",
		soft: "bg-pink-50/70 dark:bg-pink-950/30",
		lane: "bg-pink-100/60 dark:bg-pink-900/40",
		border: "border-pink-400 dark:border-pink-600",
		bar: "bg-pink-500",
	},
};

export const tone = (name) => TONES[name] ?? TONES.neutral;
