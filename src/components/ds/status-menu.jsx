"use client";

import { ChevronDown } from "lucide-react";
import { useConfirm } from "@/components/ds/confirm";
import { StatusBadge, ToneDot } from "@/components/ds/tone";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Every status change asks first. Returns `request(to)`; `onMove(to)` runs only
 * after the admin confirms. `subject` names the record ("#1877", "Verificare ITP").
 */
export function useStatusChange({ map, value, subject, onMove, actions = {}, destructive = [] }) {
	const confirm = useConfirm();
	return async (to) => {
		const target = map[to]?.label ?? to;
		const ok = await confirm({
			title: `Schimbi starea în „${target}”?`,
			description: `${subject ? `${subject}: ` : ""}${map[value]?.label ?? value} → ${target}`,
			confirmLabel: actions[to] ?? target,
			destructive: destructive.includes(to),
		});
		if (ok) onMove(to);
	};
}

/**
 * A status badge that is also the quickest way to change it: tap the badge, pick
 * the next state. `moves` are the legal target statuses (from the domain
 * transition tables), so an illegal state is never offered. With no moves it is
 * a plain badge. Safe inside a link or a clickable row: its events do not bubble.
 *
 * `actions` overrides item labels (verbs: "Confirmă"); `destructive` lists the
 * targets drawn in red.
 */
export function StatusMenu({ map, value, moves = [], onMove, subject, actions = {}, destructive = [], size, icon, label = "Schimbă starea", className }) {
	const request = useStatusChange({ map, value, subject, onMove, actions, destructive });
	if (!moves.length) return <StatusBadge map={map} value={value} size={size} icon={icon} className={className} />;
	return (
		<span
			className="inline-flex"
			onClick={(event) => {
				event.preventDefault();
				event.stopPropagation();
			}}
		>
			<DropdownMenu>
				<DropdownMenuTrigger
					aria-label={`${label}: ${map[value]?.label ?? value}`}
					// Visual badge stays compact; the invisible ::before grows the touch target to ~44 px.
					className={cn("relative inline-flex cursor-pointer items-center gap-0.5 rounded-md outline-none before:absolute before:-inset-x-1 before:-inset-y-3 focus-visible:ring-2 focus-visible:ring-ring active:scale-95", className)}
				>
					<StatusBadge map={map} value={value} size={size} icon={icon} />
					<ChevronDown className="-ml-0.5 size-3 text-muted-foreground" aria-hidden />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="min-w-44">
					<DropdownMenuLabel className="text-xs text-muted-foreground">Mută în…</DropdownMenuLabel>
					{moves.map((to) => (
						<DropdownMenuItem key={to} variant={destructive.includes(to) ? "destructive" : "default"} className="max-md:min-h-11" onSelect={() => request(to)}>
							<ToneDot tone={map[to]?.tone} /> {actions[to] ?? map[to]?.label ?? to}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</span>
	);
}
