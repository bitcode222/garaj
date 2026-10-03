import { toast } from "sonner";
import { WORK_ORDER_STATUS } from "@/lib/labels";
import { setWorkOrderStatus } from "@/lib/store/actions";
import { fmtWorkOrder } from "@/lib/format";

/** Status change used by the list rows and the overlay (the caller has already confirmed). */
export function moveWorkOrder(order, to) {
	try {
		setWorkOrderStatus(order.id, to);
		toast.success(`${fmtWorkOrder(order.number)} → ${WORK_ORDER_STATUS[to].label}`);
	} catch (error) {
		toast.error(error.message);
	}
}
