import { Check } from "lucide-react";
import { canTransition, isBackwardMove } from "@/domain/work-order";
import { WORK_ORDER_STATUS } from "@/lib/labels";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

const STEPS = ["estimate", "approved", "in_progress", "ready", "delivered"];

/**
 * Where the job is in the flow. "Waiting for parts" shows as a paused "in progress".
 * With `onMove`, every step the job can legally move to is a button (the caller
 * asks for confirmation). `onHero`: drawn in white for use on a HeroCard.
 */
export function StatusStepper({ status, onMove, onHero = false, className }) {
	if (status === "cancelled") return null;
	const current = status === "waiting_parts" ? "in_progress" : status;
	const index = STEPS.indexOf(current);
	return (
		<ol className={cn("flex items-center gap-3", className)} aria-label="Etapele lucrării">
			{STEPS.map((step, i) => {
				const done = i < index || status === "delivered";
				const active = i === index && status !== "delivered";
				const meta = step === "in_progress" && status === "waiting_parts" ? WORK_ORDER_STATUS.waiting_parts : WORK_ORDER_STATUS[step];
				const target = onMove && !active && canTransition(status, step) ? step : null;
				const Tag = target ? "button" : "div";
				return (
					<li key={step} className="flex min-w-0 flex-1 flex-col" aria-current={active ? "step" : undefined}>
						<Tag
							type={target ? "button" : undefined}
							onClick={target ? () => onMove(target) : undefined}
							aria-label={target ? `${isBackwardMove(status, target) ? "Înapoi la" : "Mută în"} ${meta.label}` : undefined}
							title={target && isBackwardMove(status, target) ? `Înapoi la ${meta.label}` : undefined}
							// Same box for every step (padding balanced by negative margins), so the hover
							// pill has even padding on all sides and the bars stay aligned.
							className={cn(
								"-mx-1.5 -my-1.5 flex min-w-0 flex-col gap-1.5 rounded-lg px-1.5 py-1.5 text-left",
								target && (onHero ? "cursor-pointer transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none" : "cursor-pointer transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"),
							)}
						>
						<span className={cn("h-1.5 rounded-full", onHero ? (done ? "bg-white/70" : active ? "bg-white" : "bg-white/25") : done ? "bg-foreground/80" : active ? tone(meta.tone).bar : "bg-muted")} />
						<span
							className={cn(
								"flex items-center gap-1 truncate text-2xs font-medium md:text-xs",
								onHero ? (active ? "font-semibold text-white" : done ? "text-white/85" : "text-white/60") : active ? tone(meta.tone).text : done ? "text-foreground" : "text-muted-foreground",
							)}
						>
							{done && <Check className="size-3 shrink-0" aria-hidden />}
							{meta.label}
						</span>
						</Tag>
					</li>
				);
			})}
		</ol>
	);
}
