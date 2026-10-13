// How a visit looks and lights up, shared by the cars' cards and the timeline
// (docs/DASHBOARD-CALENDAR.md, D5 and D6).

import { VISIT_STAGE } from "@/lib/labels";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

/** Block / chip / card look of a stage: tinted like every status, outlined while the car is only booked. */
export function stageClass(stage) {
	const meta = VISIT_STAGE[stage];
	if (meta.outline) return "border-dashed border-foreground/30 bg-card text-foreground hover:bg-accent/60";
	return cn(tone(meta.tone).block, stage === "delivered" && "opacity-60", stage === "no_show" && "line-through opacity-60");
}

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

/** A ring for this visit, a lighter one for the same car's other visits. Nothing else changes: no dimming (D11). */
export const litClass = (level) => (level === "this" ? "ring-2 ring-brand" : level === "car" ? "ring-1 ring-brand/50" : null);

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
