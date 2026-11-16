"use client";

import { ExternalLink, MoreHorizontal, Phone } from "lucide-react";
import { MakeTile } from "@/components/ds/car";
import { StatusDot } from "@/components/ds/blocks";
import { Plate } from "@/components/ds/plate";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { isRunning } from "@/domain/work-clock";
import { WO_TRANSITIONS } from "@/domain/work-order";
import { STATE, TONE_COLOR } from "@/lib/colors";
import { WORK_ORDER_ACTIONS, WORK_ORDER_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { primaryAction } from "./job-action";
import { jobHeadline, jobSummary } from "./job-text";
import { moveWorkOrder } from "./status";

const carName = (vehicle) => [vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || "Mașină";

/** A job's status as a dot: orange while its clock runs, else its status's colour. */
export function JobStatus({ order }) {
	const status = WORK_ORDER_STATUS[order.status];
	if (isRunning(order)) return <StatusDot color={STATE.run}>Rulează</StatusDot>;
	return status ? <StatusDot color={TONE_COLOR[status.tone]}>{status.label}</StatusDot> : null;
}

/** The "…" of a job: open it, call the client, move it to another stage. */
export function JobMenu({ order, customer, onOpen, children }) {
	const moves = (WO_TRANSITIONS[order.status] ?? []).filter((to) => WORK_ORDER_STATUS[to]);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56" data-sheet-menu>
				<DropdownMenuItem onSelect={onOpen}>
					<ExternalLink /> Deschide
				</DropdownMenuItem>
				{customer?.phone && (
					<DropdownMenuItem asChild>
						<a href={`tel:${customer.phone}`}>
							<Phone /> Sună: {customer.name}
						</a>
					</DropdownMenuItem>
				)}
				{moves.length > 0 && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuLabel className="text-xs text-muted-foreground">Mută în</DropdownMenuLabel>
						{moves.map((to) => {
							const Icon = WORK_ORDER_STATUS[to].icon;
							return (
								<DropdownMenuItem key={to} variant={to === "cancelled" ? "destructive" : undefined} onSelect={() => moveWorkOrder(order, to)}>
									<Icon /> {WORK_ORDER_ACTIONS[to] ?? WORK_ORDER_STATUS[to].label}
								</DropdownMenuItem>
							);
						})}
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * A job as a card (Atelier): the car's tile, the job and car, its status and plate, one line of what is going on,
 * then the next step and the round buttons. `small` keeps the head only (the board's columns).
 */
export function JobCard({ order, vehicle, customer, staffId, onOpen, small = false, selected = false, className, ...props }) {
	const action = small ? null : primaryAction(order, { staffId });
	return (
		<article
			className={cn("flex min-w-0 flex-col gap-2.5 rounded-xl border bg-card p-3 transition-shadow", selected && "ring-2 ring-primary", className)}
			{...props}
		>
			<button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
				<MakeTile make={vehicle?.make} size={small ? 40 : 52} />
				<span className="min-w-0 flex-1">
					<span className="block truncate text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
						#{order.number} · {carName(vehicle)}
					</span>
					<span className={cn("block truncate font-semibold", small ? "text-[13.5px]" : "text-[14.5px]")}>{jobHeadline(order)}</span>
					<span className="mt-0.5 flex min-w-0 items-center gap-2">
						{/* On the board the column already names the stage: only a running clock is said. */}
						{(!small || isRunning(order)) && <JobStatus order={order} />}
						{vehicle?.plate && <Plate value={vehicle.plate} size="sm" />}
					</span>
				</span>
			</button>
			{!small && (
				<>
					<p className="line-clamp-2 text-[12.5px] text-muted-foreground">{jobSummary(order)}</p>
					<div className="flex items-center gap-2">
						{action && (
							<Button size="sm" onClick={action.run}>
								<action.icon /> {action.label}
							</Button>
						)}
						<span className="flex-1" />
						{customer?.phone && (
							<Button asChild variant="outline" size="icon-sm" aria-label={`Sună: ${customer.name}`}>
								<a href={`tel:${customer.phone}`}>
									<Phone />
								</a>
							</Button>
						)}
						<JobMenu order={order} customer={customer} onOpen={onOpen}>
							<Button variant="outline" size="icon-sm" aria-label="Mai multe">
								<MoreHorizontal />
							</Button>
						</JobMenu>
					</div>
				</>
			)}
		</article>
	);
}
