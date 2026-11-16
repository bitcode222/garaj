import { BOOKING_MARK } from "@/lib/labels";
import { TONE_COLOR } from "@/lib/colors";
import { cn } from "@/lib/utils";

/**
 * What a booking's block on the calendar starts with: its state as a small dot (docs/DESIGN.md §1, rule 3), the job's
 * once it became one, else the booking's own (`state`, from the page's lookups); before the clock is known, its mark's
 * icon. `small`: the month's 18 px chips. The words are in the block's aria-label.
 */
export function BlockMark({ state, mark = "booking", small = false }) {
	if (state) return <span aria-hidden className={cn("shrink-0 rounded-full ring-1 ring-card", small ? "size-1.5" : "size-[7px]")} style={{ background: TONE_COLOR[state.tone] ?? TONE_COLOR.neutral }} />;
	const Mark = BOOKING_MARK[mark].icon;
	return <Mark aria-hidden className={cn("shrink-0", small ? "size-2.5" : "size-3")} />;
}
