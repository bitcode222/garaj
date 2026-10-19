"use client";

import { useEffect } from "react";
import { Check } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

// A hatched bar: the planned-not-done mark, for a step that was jumped over.
const HATCH = "repeating-linear-gradient(135deg, color-mix(in oklch, var(--foreground) 45%, transparent) 0 2px, transparent 2px 5px)";

/**
 * A visit record's state section (docs/VISIT-FLOW.md D7), in the look of the job's stepper:
 * the steps as bars with their labels, then one next-step line (the primary move and one
 * sentence of what happens), then every other move as a row of small buttons.
 *
 *   steps     [{ key, label, tone }] in order
 *   current   index of the step it is on; -1 with `off` (a side state, drawn as a banner)
 *   skipped   keys of steps jumped over: hatched, "sărit"
 *   pause     { label, tone } shown on the current step instead of its label ("Așteaptă piese")
 *   progress  0–1, a fill inside the current step's bar ("Parțial plătită")
 *   mark      { label, tone } under the current step's label ("Restantă de 5 zile")
 *   onStep    (key) → { label, onClick } | null: a step that can be clicked, and what it says
 *   help      one muted line under the steps ("Atinge o etapă…")
 *   off       { title, description, tone, icon, actions: [{ label, onClick, primary }] }
 *   notice    a node shown instead of the next step ("Programarea a trecut…")
 *   next      { label, hint, onClick, icon, disabled, reason }
 *   afterNext a node right under the next step (what blocks it, each with its fix)
 *   moves     [{ id, label, icon, onClick, disabled, reason, destructive }]
 *   panel     a node opened under the moves (reschedule, delay, a reason to give)
 *   onPanelClose  closes it; Esc does too, before the sheet around hears Esc
 *
 * A blocked move is never just greyed out: it stays a button, looks muted, and says why when
 * pressed (a toast), which works on a phone, where tooltips do not.
 */
export function FlowSteps({ label, steps, current, skipped = [], pause, progress, mark, onStep, help, off, notice, next, afterNext, moves = [], panel, onPanelClose, className }) {
	// An open panel is the innermost thing: Esc closes it first, the sheet stays.
	const panelOpen = Boolean(panel && onPanelClose);
	useEffect(() => {
		if (!panelOpen) return undefined;
		const onKey = (event) => {
			if (event.key !== "Escape") return;
			event.stopPropagation();
			event.preventDefault();
			onPanelClose();
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [panelOpen, onPanelClose]);

	return (
		<section aria-label={label} className={cn("space-y-4", className)}>
			{off ? <OffBanner {...off} /> : <Bars label={label} steps={steps} current={current} skipped={skipped} pause={pause} progress={progress} mark={mark} onStep={onStep} />}
			{!off && help && <p className="-mt-2 text-2xs text-muted-foreground">{help}</p>}
			{notice ?? (next && <NextLine next={next} />)}
			{afterNext}
			{moves.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{moves.map((move) => (
						<MoveButton key={move.id} move={move} />
					))}
				</div>
			)}
			{panel}
		</section>
	);
}

function Bars({ label, steps, current, skipped, pause, progress, mark, onStep }) {
	return (
		<ol className="flex items-start gap-3" aria-label={label}>
			{steps.map((step, i) => {
				const done = i < current;
				const active = i === current;
				const jumped = done && skipped.includes(step.key);
				const shown = active && pause ? pause : step;
				const action = !active && onStep ? onStep(step.key) : null;
				const Tag = action ? "button" : "div";
				return (
					<li key={step.key} className="flex min-w-0 flex-1 flex-col" aria-current={active ? "step" : undefined}>
						<Tag
							type={action ? "button" : undefined}
							onClick={action?.onClick}
							aria-label={action?.label}
							title={action?.label}
							// Same box for every step (padding balanced by negative margins): the hover pill is even, the bars stay aligned.
							className={cn(
								"-mx-1.5 -my-1.5 flex min-w-0 flex-col gap-1.5 rounded-lg px-1.5 py-1.5 text-left",
								action && "cursor-pointer transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
							)}
						>
							<span className={cn("relative h-1.5 overflow-hidden rounded-full", jumped ? "bg-muted" : done ? "bg-foreground/80" : active && progress == null ? tone(shown.tone).bar : "bg-muted")} style={jumped ? { backgroundImage: HATCH } : undefined}>
								{active && progress != null && <span className={cn("absolute inset-y-0 left-0 rounded-full", tone(shown.tone).bar)} style={{ width: `${Math.max(6, Math.round(progress * 100))}%` }} />}
							</span>
							<span className={cn("flex items-center gap-1 truncate text-2xs font-medium md:text-xs", active ? tone(shown.tone).text : jumped ? "text-muted-foreground" : done ? "text-foreground" : "text-muted-foreground")}>
								{done && !jumped && <Check className="size-3 shrink-0" aria-hidden />}
								<span className="truncate">{shown.label}</span>
								{jumped && <span className="shrink-0 font-normal opacity-80">· sărit</span>}
							</span>
							{active && mark && <span className={cn("-mt-1 truncate text-2xs font-medium", tone(mark.tone).text)}>{mark.label}</span>}
						</Tag>
					</li>
				);
			})}
		</ol>
	);
}

function NextLine({ next }) {
	const Icon = next.icon;
	return (
		<div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:gap-3">
			<Button className="max-md:h-11 sm:shrink-0" aria-disabled={next.disabled || undefined} onClick={next.disabled ? () => toast.info(next.reason) : next.onClick} variant={next.disabled ? "outline" : "default"}>
				{Icon && <Icon />}
				{next.label}
			</Button>
			<p className="text-xs text-muted-foreground sm:text-sm">{next.disabled ? next.reason : next.hint}</p>
		</div>
	);
}

function MoveButton({ move }) {
	const Icon = move.icon;
	return (
		<Button
			size="sm"
			variant="outline"
			aria-disabled={move.disabled || undefined}
			aria-label={move.disabled ? `${move.label}: ${move.reason}` : undefined}
			title={move.disabled ? move.reason : undefined}
			onClick={move.disabled ? () => toast.info(move.reason) : move.onClick}
			className={cn("max-md:h-11", move.disabled && "text-muted-foreground opacity-60 hover:opacity-80", !move.disabled && move.destructive && "text-destructive hover:text-destructive")}
		>
			{Icon && <Icon />}
			{move.label}
		</Button>
	);
}

function OffBanner({ title, description, tone: name = "neutral", icon: Icon, actions = [] }) {
	return (
		<div className={cn("flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center", tone(name).chip)}>
			<div className="flex min-w-0 flex-1 items-start gap-2">
				{Icon && <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />}
				<div className="min-w-0">
					<p className="text-sm font-semibold">{title}</p>
					{description && <p className="text-xs opacity-90">{description}</p>}
				</div>
			</div>
			{actions.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{actions.map((action) => (
						<Button key={action.label} size="sm" variant={action.primary ? "default" : "outline"} className="max-md:h-11" onClick={action.onClick}>
							{action.label}
						</Button>
					))}
				</div>
			)}
		</div>
	);
}
