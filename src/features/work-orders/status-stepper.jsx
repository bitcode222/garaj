import { Check } from "lucide-react";
import { WORK_ORDER_STATUS } from "@/lib/labels";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

const STEPS = ["estimate", "approved", "in_progress", "ready", "delivered"];

/** Where the job is in the flow. "Waiting for parts" shows as a paused "in progress". */
export function StatusStepper({ status, className }) {
	if (status === "cancelled") return null;
	const current = status === "waiting_parts" ? "in_progress" : status;
	const index = STEPS.indexOf(current);
	return (
		<ol className={cn("flex items-center gap-1.5", className)} aria-label="Etapele lucrării">
			{STEPS.map((step, i) => {
				const done = i < index || status === "delivered";
				const active = i === index && status !== "delivered";
				const meta = step === "in_progress" && status === "waiting_parts" ? WORK_ORDER_STATUS.waiting_parts : WORK_ORDER_STATUS[step];
				return (
					<li key={step} className="flex min-w-0 flex-1 flex-col gap-1.5" aria-current={active ? "step" : undefined}>
						<span className={cn("h-1.5 rounded-full", done ? "bg-foreground/80" : active ? tone(meta.tone).bar : "bg-muted")} />
						<span
							className={cn(
								"flex items-center gap-1 truncate text-2xs font-medium md:text-xs",
								active ? tone(meta.tone).text : done ? "text-foreground" : "text-muted-foreground",
							)}
						>
							{done && <Check className="size-3 shrink-0" aria-hidden />}
							{meta.label}
						</span>
					</li>
				);
			})}
		</ol>
	);
}
