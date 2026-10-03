import { toast } from "sonner";
import { APPOINTMENT_STATUS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { saveAppointment, setAppointmentStatus } from "@/lib/store/actions";

/** Menu verbs for the one-tap status menu (target status → action label). */
export const APPOINTMENT_ACTIONS = {
	scheduled: "Reprogramează",
	confirmed: "Confirmă",
	arrived: "A sosit — primire",
	no_show: "Neprezentat",
	cancelled: "Anulează",
};

/**
 * One-tap status change with an undo toast. "arrived" goes through check-in,
 * which creates the work order and sets the status itself.
 */
export function quickMoveAppointment(appointment, to) {
	if (to === "arrived") {
		openSheet("checkin", { appointmentId: appointment.id });
		return;
	}
	try {
		setAppointmentStatus(appointment.id, to);
		toast.success(`${appointment.title || "Programare"} → ${APPOINTMENT_STATUS[to].label}`, {
			action: {
				label: "Anulează",
				onClick: () => {
					try {
						saveAppointment({ ...appointment });
					} catch (error) {
						toast.error(error.message);
					}
				},
			},
		});
	} catch (error) {
		toast.error(error.message);
	}
}
