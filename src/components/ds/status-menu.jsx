"use client";

import { ChevronDown, Undo2 } from "lucide-react";
import { useRef, useState } from "react";
import { useConfirm } from "@/components/ds/confirm";
import { StatusBadge, ToneDot } from "@/components/ds/tone";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Every status change asks first. Returns `request(to)`; `onMove(to)` runs only
 * after the admin confirms. `subject` names the record ("#1877", "Verificare ITP").
 */
export function useStatusChange({ map, value, subject, onMove, actions = {}, destructive = [], isBackward }) {
	const confirm = useConfirm();
	return async (to) => {
		const target = map[to]?.label ?? to;
		const back = isBackward?.(value, to);
		const ok = await confirm({
			title: back ? `Revii la „${target}”?` : `Schimbi starea în „${target}”?`,
			description: `${subject ? `${subject}: ` : ""}${map[value]?.label ?? value} → ${target}`,
			confirmLabel: back ? `Înapoi la ${target}` : (actions[to] ?? target),
			destructive: destructive.includes(to),
		});
		if (ok) onMove(to);
	};
}

/**
 * The items of a status menu, in three groups: forward moves, "Înapoi la…"
 * (earlier stages, undo icon) and destructive ones (red). Used by StatusMenu and
 * by detail-page menus so they always look the same.
 */
export function StatusMoveItems({ map, value, moves, onPick, actions = {}, destructive = [], isBackward }) {
	const back = moves.filter((to) => !destructive.includes(to) && isBackward?.(value, to));
	const forward = moves.filter((to) => !destructive.includes(to) && !back.includes(to));
	const danger = moves.filter((to) => destructive.includes(to));
	const item = (to, label, extra) => (
		<DropdownMenuItem key={to} variant={destructive.includes(to) ? "destructive" : "default"} className="max-md:min-h-11" onSelect={() => onPick(to)}>
			{extra ?? <ToneDot tone={map[to]?.tone} />} {label}
		</DropdownMenuItem>
	);
	return (
		<>
			{forward.length > 0 && <DropdownMenuLabel className="text-xs text-muted-foreground">Mută în…</DropdownMenuLabel>}
			{forward.map((to) => item(to, actions[to] ?? map[to]?.label ?? to))}
			{back.length > 0 && (
				<>
					{forward.length > 0 && <DropdownMenuSeparator />}
					<DropdownMenuLabel className="text-xs text-muted-foreground">Înapoi la…</DropdownMenuLabel>
					{back.map((to) => item(to, map[to]?.label ?? to, <Undo2 className="size-3.5 text-muted-foreground" aria-hidden />))}
				</>
			)}
			{danger.length > 0 && (
				<>
					<DropdownMenuSeparator />
					{danger.map((to) => item(to, actions[to] ?? map[to]?.label ?? to))}
				</>
			)}
		</>
	);
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
export function StatusMenu({ map, value, moves = [], onMove, subject, actions = {}, destructive = [], isBackward, size, icon, label = "Schimbă starea", className }) {
	const request = useStatusChange({ map, value, subject, onMove, actions, destructive, isBackward });
	const [open, setOpen] = useState(false);
	const touchDown = useRef(false);
	if (!moves.length) return <StatusBadge map={map} value={value} size={size} icon={icon} className={className} />;
	return (
		<span
			className="inline-flex"
			onClick={(event) => {
				event.preventDefault();
				event.stopPropagation();
			}}
		>
			<DropdownMenu open={open} onOpenChange={setOpen}>
				<DropdownMenuTrigger
					aria-label={`${label}: ${map[value]?.label ?? value}`}
					// Radix opens on pointerdown for every pointer type, which would pop the menu
					// when a swipe (SwipeRow) or a scroll starts on the badge. Touch opens on tap instead.
					onPointerDown={(event) => {
						touchDown.current = event.pointerType !== "mouse";
						if (touchDown.current) event.preventDefault();
					}}
					onClick={(event) => {
						// detail 0 = not from a pointer (assistive technology): treat as a tap too.
						if (touchDown.current || event.detail === 0) setOpen((value) => !value);
						touchDown.current = false;
					}}
					// Visual badge stays compact; the invisible ::before grows the touch target to ~44 px.
					className={cn("relative inline-flex cursor-pointer items-center gap-0.5 rounded-md outline-none before:absolute before:-inset-x-1 before:-inset-y-3 focus-visible:ring-2 focus-visible:ring-ring active:scale-95", className)}
				>
					<StatusBadge map={map} value={value} size={size} icon={icon} />
					<ChevronDown className="-ml-0.5 size-3 text-muted-foreground" aria-hidden />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="min-w-44">
					<StatusMoveItems map={map} value={value} moves={moves} onPick={request} actions={actions} destructive={destructive} isBackward={isBackward} />
				</DropdownMenuContent>
			</DropdownMenu>
		</span>
	);
}
