// How a visit reads, looks and lights up, shared by the cars' cards and the timeline
// (docs/DASHBOARD-CALENDAR.md, D5, D6 and §12). A card and its place on the calendar
// say the same things in the same words, so they are recognised as one.

import { vehicleName } from "@/domain/vehicle";
import { visitSubject } from "@/domain/visit";
import { fmtDays, fmtTime, fmtWorkOrder, plural } from "@/lib/format";
import { VISIT_STAGE } from "@/lib/labels";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

/** Block / chip / card look of a stage: tinted like every status, outlined while the car is only booked. */
export function stageClass(stage) {
	const meta = VISIT_STAGE[stage];
	if (meta.outline) return "border-dashed border-foreground/30 bg-card text-foreground hover:bg-accent/60";
	return cn(tone(meta.tone).block, stage === "delivered" && "opacity-60", stage === "no_show" && "line-through opacity-60");
}

/**
 * The two lines a visit is known by everywhere: the car (make and model), and what it is
 * in for (with whose car it is, when the car itself is named).
 */
export function visitText(visit, vehicle, customer) {
	const car = vehicleName(vehicle);
	const subject = visitSubject(visit);
	return {
		name: car || customer?.name || (visit.order ? `Lucrarea ${fmtWorkOrder(visit.order.number)}` : "Programare"),
		subject,
		detail: [subject, car ? customer?.name : null].filter(Boolean).join(" · "),
	};
}

/** An exact length: "45 min", "2 h", "1 h 15 min". */
export function fmtLength(minutes) {
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return hours ? `${hours} h${rest ? ` ${rest} min` : ""}` : `${rest} min`;
}

/** A length as it is said in passing: exact up to three hours, then whole hours, then days. */
const fmtAbout = (minutes, days = 0) => (days >= 1 ? plural(days, "zi", "zile") : minutes < 180 ? fmtLength(minutes) : `${Math.floor(minutes / 60)} h`);

/** "întârzie 25 min", "întârzie 1 h 10 min". */
export const fmtDelay = (minutes) => `întârzie ${fmtLength(minutes)}`;

/**
 * What the clock says about a visit, in words (the rule is visitTiming, in the domain).
 * `mark` is set when someone should look at it: "late" for a car that is not here,
 * "wait" for a finished car nobody has picked up for a day or more.
 */
export function timingText(timing) {
	if (!timing) return null;
	const { kind, minutes, days } = timing;
	if (kind === "until") return { text: days >= 1 ? fmtDays(days) : minutes < 1 ? "acum" : `în ${fmtAbout(minutes)}`, mark: null };
	// The customer called: they come later, and are not late until then (a calm line, no mark).
	if (kind === "expected") return { text: `vine la ${fmtTime(timing.at)}`, mark: null };
	if (kind === "due") return { text: "acum", mark: null };
	if (kind === "late") return { text: fmtDelay(minutes), mark: "late" };
	if (kind === "missed") return { text: "nu a sosit", mark: "late" };
	if (kind === "waiting") return { text: minutes < 5 ? "gata acum" : `gata de ${fmtAbout(minutes, days)}`, mark: days >= 1 ? "wait" : null };
	return { text: minutes < 5 ? "abia primită" : `de ${fmtAbout(minutes, days)} în service`, mark: null };
}

/** How a marked timing is written: amber for a car that is not here, heavier for one that waits. */
export const timingClass = (mark) => (mark === "late" ? cn("font-medium", tone("yellow").text) : mark === "wait" ? "font-semibold" : "opacity-80");

/** Nothing hovered, nothing selected. */
export const NO_FOCUS = { hovered: null, hoveredCar: null, selected: null, selectedCar: null, origin: null, arrived: null };

/**
 * How a visit is lit by the current focus: "this" when it is the hovered or selected
 * visit (or the card "Arată în calendar" was pressed on), "car" when it is another
 * visit of the same car, else null. The link is the visit, not the car, so a car's
 * older bookings are never mistaken for the job in the shop.
 */
export function litAs(visit, focus) {
	if (visit.id === focus.hovered || visit.id === focus.selected || visit.id === focus.origin) return "this";
	if (visit.vehicleId && (visit.vehicleId === focus.hoveredCar || visit.vehicleId === focus.selectedCar)) return "car";
	return null;
}

/**
 * A ring and a lift for this visit (the same on its card and on the calendar), a lighter
 * ring for the same car's other visits. Nothing else changes: no dimming (D11).
 */
export const litClass = (level) => (level === "this" ? "ring-2 ring-brand shadow-md shadow-brand/30" : level === "car" ? "ring-1 ring-brand/50" : null);

/**
 * Hovering (mouse) or keyboard-focusing an item lights its visit. Transient: touch
 * never sets it, a mouse click's focus does not count (only `:focus-visible`), and
 * neither does focus that the timeline moved itself (focusQuietly), so nothing
 * sticks. What stays lit is the selection, a separate state.
 */
export function hoverHandlers(visitId, onHover) {
	return {
		onPointerEnter: (event) => event.pointerType === "mouse" && onHover?.(visitId),
		onPointerLeave: (event) => event.pointerType === "mouse" && onHover?.(null),
		onFocus: (event) => !("quiet" in event.target.dataset) && event.target.matches(":focus-visible") && onHover?.(visitId),
		onBlur: () => onHover?.(null),
	};
}

/**
 * Moves keyboard focus to an item the user travelled to (so Enter opens it and Esc
 * clears the selection) without that focus counting as a hover.
 */
export function focusQuietly(node) {
	if (!node) return;
	node.dataset.quiet = "";
	node.focus({ preventScroll: true });
	delete node.dataset.quiet;
}
