"use client";

import { useConfirm } from "@/components/ds/confirm";
import { minutesBetween } from "@/domain/dates";
import { fmtDate, fmtTime } from "@/lib/format";
import { moveAppointment, saveAppointment } from "@/lib/store/actions";
import { useSettings } from "@/lib/store/hooks";
import { toast } from "@/lib/toast";

/**
 * Saves a booking that was dragged to a new time (and maybe onto another mechanic), the
 * same way in Programări and on the dashboard: the optional confirmation from the
 * calendar's settings, a toast that says where it went and warns about an overlap, and
 * one tap to put it back. `staffId` left out keeps the mechanic. Resolves to true when
 * the booking was changed.
 */
export function useReschedule() {
	const confirm = useConfirm();
	const { calendar } = useSettings();
	return async (appointment, { start, end, staffId }) => {
		const previous = { start: appointment.start, end: appointment.end, staffId: appointment.staffId };
		const nextStaff = staffId === undefined ? appointment.staffId : staffId;
		// Stretched: it starts or ends at another time, on the same day. Anything else is a move.
		const stretched = minutesBetween(start, end) !== minutesBetween(appointment.start, appointment.end);
		const where = `${fmtDate(start, "EEE d MMM")}, ${fmtTime(start)}–${fmtTime(end)}`;
		if (calendar.confirmDrop) {
			const ok = await confirm({
				title: stretched ? "Schimbi intervalul programării?" : "Muți programarea?",
				description: `${appointment.title}: ${fmtDate(appointment.start, "d MMM")} ${fmtTime(appointment.start)}–${fmtTime(appointment.end)} → ${fmtDate(start, "d MMM")} ${fmtTime(start)}–${fmtTime(end)}`,
				confirmLabel: stretched ? "Schimbă" : "Mută",
			});
			if (!ok) return false;
		}
		try {
			const { conflicts } = nextStaff !== appointment.staffId ? saveAppointment({ ...appointment, start, end, staffId: nextStaff }) : moveAppointment(appointment.id, start, end);
			toast.success(`${stretched ? "Interval nou" : "Mutată"}: ${where}`, {
				description: conflicts.length ? "Atenție: se suprapune cu altă programare." : undefined,
				action: { label: "Anulează", onClick: () => saveAppointment({ ...appointment, ...previous }) },
			});
			return true;
		} catch (error) {
			toast.error(error.message);
			return false;
		}
	};
}
