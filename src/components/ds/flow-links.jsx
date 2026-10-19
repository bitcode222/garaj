import { ArrowLeft, ArrowRight, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The flow strip (docs/VISIT-FLOW.md D1–D3): right under a visit record's title, the record
 * before it on the left and the step after it on the right, each under a small caption.
 *
 * A side is { label, badge?, meta?, onClick?, verb?, disabled?, reason?, fix?, done? }:
 *   onClick   the side is a link (a 44 px target); without it the side is information
 *             ("Fără programare", "Vizita e încheiată")
 *   verb      the next record does not exist yet and the link creates it: brand accent
 *   disabled  it cannot be used now; `reason` says why under it, `fix` ({ label, onClick })
 *             is the way out
 *   done      the visit ends here: a check instead of an arrow
 * Either side may be null (a booking has nothing before it).
 */
export function FlowLinks({ back, next, className }) {
	return (
		// Two halves side by side; on the narrowest phones (under 360 px) they stack.
		<nav aria-label="Pașii vizitei" className={cn("grid grid-cols-1 items-start gap-x-4 gap-y-2 border-y py-2 min-[360px]:grid-cols-2", className)}>
			<FlowSide side="back" caption="Pasul anterior" item={back} />
			<FlowSide side="next" caption="Pasul următor" item={next} />
		</nav>
	);
}

function FlowSide({ side, caption, item }) {
	if (!item) return <div aria-hidden />;
	const forward = side === "next";
	const Arrow = forward ? ArrowRight : ArrowLeft;
	const link = Boolean(item.onClick) && !item.disabled;
	const content = (
		<>
			{!forward && !item.done && (link || item.disabled) && <Arrow className="size-4 shrink-0 transition-transform group-hover:-translate-x-0.5" aria-hidden />}
			{item.done && <CircleCheck className="size-4 shrink-0" aria-hidden />}
			<span className="min-w-0 truncate">{item.label}</span>
			{item.badge}
			{forward && !item.done && (link || item.disabled) && <Arrow className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />}
		</>
	);
	return (
		<div className={cn("flex min-w-0 flex-col", forward ? "items-end text-right" : "items-start")}>
			<span className="text-2xs font-medium tracking-wider text-muted-foreground uppercase">{caption}</span>
			{link ? (
				<button
					type="button"
					onClick={item.onClick}
					className={cn(
						"group -mx-2 inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none md:min-h-9",
						item.verb ? "text-brand" : "text-foreground",
					)}
				>
					{content}
				</button>
			) : (
				<span className={cn("inline-flex min-h-11 max-w-full items-center gap-1.5 text-sm text-muted-foreground md:min-h-9", item.disabled && "opacity-70")} aria-disabled={item.disabled || undefined}>
					{content}
				</span>
			)}
			{item.meta && !item.reason && <span className="-mt-1.5 text-xs text-muted-foreground tabular-nums">{item.meta}</span>}
			{item.reason && (
				<span className="-mt-1 text-xs text-muted-foreground">
					{item.reason}
					{item.fix && (
						<>
							{" "}
							<button type="button" onClick={item.fix.onClick} className="inline-flex min-h-6 items-center font-medium text-foreground underline-offset-2 hover:underline">
								{item.fix.label}
							</button>
						</>
					)}
				</span>
			)}
		</div>
	);
}

/** A record's number in a flow label: monospace and tabular, as everywhere else. */
export const FlowNumber = ({ children }) => <span className="font-mono tabular-nums">{children}</span>;
