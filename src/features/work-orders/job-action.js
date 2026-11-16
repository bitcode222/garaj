import { CircleCheck, KeyRound, Pause, Play, ThumbsUp } from "lucide-react";
import { isRunning } from "@/domain/work-clock";
import { WO_NEXT } from "@/domain/work-order";
import { setWorkOrderStatus, startWork, stopWork } from "@/lib/store/actions";
import { toast } from "@/lib/toast";

// A job's one main button (docs/DESIGN.md §1, rule 4), as the iPhone's JobAction.primary: in progress it pauses or
// continues the clock; a next step of "in progress" starts the clock; otherwise it moves the job one step on.

const LABELS = { approved: "Aprobă devizul", ready: "Marchează gata", delivered: "Predă mașina" };
const ICONS = { approved: ThumbsUp, ready: CircleCheck, delivered: KeyRound };

const attempt = (fn) => () => {
	try {
		fn();
	} catch (error) {
		toast.error(error.message);
	}
};

/** `{ label, icon, run }`, or null for a closed job. */
export function primaryAction(order, { staffId = null } = {}) {
	const start = attempt(() => startWork(order.id, { staffId }));
	if (order.status === "in_progress") {
		return isRunning(order) ? { label: "Pauză", icon: Pause, run: attempt(() => stopWork(order.id)) } : { label: "Continuă", icon: Play, run: start };
	}
	const next = WO_NEXT[order.status];
	if (!next) return null;
	if (next === "in_progress") return { label: order.status === "waiting_parts" ? "Reia lucrul" : "Începe lucrul", icon: Play, run: start };
	return { label: LABELS[next], icon: ICONS[next], run: attempt(() => setWorkOrderStatus(order.id, next)) };
}
