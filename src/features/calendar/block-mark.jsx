import { StateDot } from "@/components/ds/tone";
import { BOOKING_MARK } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * What a booking's block on the calendar starts with: its state's dot (docs/RECORD-COLORS.md), the job's once it
 * became one, else the booking's own (`state`, from the page's lookups); before the clock is known, its mark's icon.
 * `small`: the month's 18 px chips. The words are in the block's aria-label.
 */
export function BlockMark({ state, mark = "booking", small = false }) {
	if (state) return <StateDot state={state} size="sm" className={cn("ring-1 ring-card", small && "size-3 [&>svg]:size-2")} />;
	const Mark = BOOKING_MARK[mark].icon;
	return <Mark aria-hidden className={cn("shrink-0", small ? "size-2.5" : "size-3")} />;
}
