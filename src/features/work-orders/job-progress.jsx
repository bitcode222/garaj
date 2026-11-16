"use client";

import { Check } from "lucide-react";
import { SectionHeader } from "@/components/ds/blocks";
import { isRunning, steps, workedMs } from "@/domain/work-clock";
import { setLineDone } from "@/lib/store/actions";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useTick } from "@/features/running/running-job";
import { clockText } from "./job-text";

// The running job on its own page (docs/DESIGN.md §1, rule 6): the clock line under the header, and the steps ticked
// off one by one (the same rules as the iPhone: src/domain/work-clock.js).

const WORKING = ["approved", "in_progress", "waiting_parts", "ready"];

/** "Rulează · 1:24:10 · 2 din 4 operații gata", on the car's colour. */
export function ClockLine({ order }) {
	const running = isRunning(order);
	const now = useTick(running);
	if (!WORKING.includes(order.status)) return null;
	const { total, done } = steps(order);
	const worked = workedMs(order, now);
	const state = running ? "Rulează" : worked ? "Oprit" : "Neînceput";
	return (
		<p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
			<span aria-hidden className={cn("size-2 rounded-full", running ? "bg-[#34c759] shadow-[0_0_0_4px_rgb(52_199_89/0.3)]" : "bg-current opacity-50")} />
			{state}
			{worked > 0 && (
				<>
					<span className="opacity-60">·</span>
					<span className="tabular-nums">{clockText(worked)}</span>
				</>
			)}
			{total > 0 && (
				<>
					<span className="opacity-60">·</span>
					<span className="font-normal opacity-75">
						{done} din {total} {total === 1 ? "operație gata" : "operații gata"}
					</span>
				</>
			)}
		</p>
	);
}

/** The job's operations as steps to tick off; the clock's bar ticks the current one. */
export function JobSteps({ order, locked }) {
	if (!WORKING.includes(order.status)) return null;
	const lines = (order.lines ?? []).filter((l) => !l.refused);
	const labor = lines.filter((l) => l.kind === "labor");
	const list = labor.length ? labor : lines;
	if (!list.length) return null;
	const { current, done, total } = steps(order);
	const toggle = (line) => {
		try {
			setLineDone(order.id, line.id, !line.done);
		} catch (error) {
			toast.error(error.message);
		}
	};
	return (
		<section className="space-y-3" aria-label="Operații">
			<SectionHeader title="Operații" subtitle={`${done} din ${total} gata · bifează ce ai terminat`} />
			<ul className="divide-y overflow-hidden rounded-xl border bg-card">
				{list.map((line) => {
					const now = current?.id === line.id;
					return (
						<li key={line.id}>
							<button type="button" disabled={locked} onClick={() => toggle(line)} aria-pressed={Boolean(line.done)} className={cn("flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left hover:bg-accent/40 disabled:cursor-default", line.done && "opacity-55")}>
								<span
									aria-hidden
									className={cn(
										"flex size-6 shrink-0 items-center justify-center rounded-full border-2",
										line.done ? "border-[#34c759] bg-[#34c759] text-white" : now ? "border-[#ed7a34] shadow-[inset_0_0_0_4px_var(--card),inset_0_0_0_12px_#ed7a34]" : "border-border",
									)}
								>
									{line.done && <Check className="size-3.5 stroke-3" />}
								</span>
								<span className="min-w-0 flex-1">
									<span className={cn("block truncate text-[13.5px]", line.done && "line-through", now && "font-semibold")}>{line.description || "Operație"}</span>
									{now && <span className="block text-xs text-muted-foreground">acum</span>}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
