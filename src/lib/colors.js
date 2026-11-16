// The colours of the design language (docs/DESIGN.md §1): the car's make, the app's areas, a record's state.
// One table for the web; the iPhone app keeps the same values in ios-native/Garaj/Views/Look.swift.

import { logoKey } from "@/components/ds/make-logo";

/** Each area keeps one colour: its icon, its "Nou" tile, its kind label. Never a page background. */
export const AREA = {
	azi: "#18181b",
	programare: "#0fa5a0",
	deviz: "#8b5cf6",
	lucrare: "#ed7a34",
	factura: "#3b82f6",
	clienti: "#d9a321",
	masini: "#36b385",
	catalog: "#2ea6b8",
	rapoarte: "#42ad60",
	contact: "#ff3b30",
	setari: "#8e8e93",
};

/** A record's state as a dot with words: done, waiting, late, closed, running now. */
export const STATE = {
	ok: "#16a34a",
	wait: "#d97706",
	late: "#ff3b30",
	off: "#8e8e93",
	run: "#ed7a34",
};

/** The brand colour of each make (the phone's table). */
export const MAKE_COLORS = {
	volkswagen: "#1c3d8c",
	skoda: "#2e7d4f",
	dacia: "#59614f",
	bmw: "#1c69d4",
	ford: "#1f4aa1",
	toyota: "#d42129",
	audi: "#2b2b2b",
	renault: "#e8b500",
	mercedes: "#4a4a4a",
	opel: "#edba00",
	peugeot: "#213366",
	hyundai: "#002b5e",
	kia: "#051429",
	nissan: "#c20d33",
	volvo: "#003366",
	fiat: "#9e1221",
	seat: "#8f3d29",
	honda: "#cc0d1a",
	mazda: "#0f0f1a",
	citroen: "#8c1a1a",
	tesla: "#cc0000",
};

const NEUTRAL = "#5c616b";
// Yellow makes stay light, with black text on them.
const LIGHT = new Set(["renault", "opel"]);

/** The make's own colour; a neutral grey for makes without one. */
export function makeColor(make) {
	return MAKE_COLORS[logoKey(make)] ?? NEUTRAL;
}

/** The cover: the make's colour deepened so white text reads on it (yellow makes barely). */
export function makeCover(make) {
	return `color-mix(in srgb, ${makeColor(make)} ${LIGHT.has(logoKey(make)) ? 92 : 68}%, #000)`;
}

/** Text and icons on the cover. */
export function makeInk(make) {
	return LIGHT.has(logoKey(make)) ? "#111111" : "#ffffff";
}

/** A light tint of the make for calendar and timeline blocks, with `makeColor` as their edge. */
export function makeTint(make, amount = 12) {
	return `color-mix(in srgb, ${makeColor(make)} ${amount}%, var(--card))`;
}

/** The old tones (src/lib/labels.js) as the new dots: a status's tone → its colour. */
export const TONE_COLOR = {
	green: STATE.ok,
	yellow: STATE.wait,
	red: STATE.late,
	neutral: STATE.off,
	orange: STATE.run,
	teal: AREA.programare,
	purple: AREA.deviz,
	blue: AREA.factura,
	pink: "#e26a8d",
};
