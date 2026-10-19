"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight, Wrench } from "lucide-react";
import { Initials, Meter } from "@/components/ds/data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { mechanicSummary } from "@/domain/appointment-list";
import { vehicleName } from "@/domain/vehicle";
import { OPEN_STATUSES } from "@/domain/work-order";
import { fmtDate, fmtHours, fmtNumber, fmtWorkOrder, plural } from "@/lib/format";
import { WORK_ORDER_STATUS } from "@/lib/labels";
import { useOpenDetail } from "@/lib/detail-mode";
import { useCollection, useSettings, useToday } from "@/lib/store/hooks";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

/** What the card says: the mechanic's day (bookings, time, share of the open hours), their week, their open jobs. */
function MechanicSummary({ staffId, name, color, day, onClose }) {
	const settings = useSettings();
	const today = useToday();
	const openDetail = useOpenDetail();
	const appointments = Object.values(useCollection("appointments"));
	const workOrders = Object.values(useCollection("workOrders"));
	const vehicles = useCollection("vehicles");
	const summary = mechanicSummary(staffId, { appointments, workOrders, day, hours: settings.hours, openStatuses: OPEN_STATUSES });
	const dayName = day === today ? "azi" : fmtDate(day, "EEEE, d MMM");
	return (
		<div className="space-y-3 text-sm">
			<div className="flex items-center gap-2.5">
				<Initials name={name} tone={color} size="md" />
				<div className="min-w-0">
					<p className="truncate font-semibold">{name}</p>
					<p className="text-xs text-muted-foreground first-letter:uppercase">{dayName}</p>
				</div>
			</div>
			<div className="space-y-1.5">
				<p className="flex items-baseline justify-between gap-2">
					<span className="text-muted-foreground first-letter:uppercase">Programări {day === today ? "azi" : "în ziua aceasta"}</span>
					<span className="font-medium tabular-nums">{summary.day.count}</span>
				</p>
				{summary.day.open ? (
					<>
						<Meter value={Math.min(100, (summary.day.share ?? 0) * 100)} max={100} tone={summary.day.share > 1 ? "red" : summary.day.share > 0.85 ? "yellow" : color} label={`Încărcarea lui ${name}`} />
						<p className="text-xs text-muted-foreground tabular-nums">
							{fmtHours(Math.round((summary.day.minutes / 60) * 10) / 10)} programate · {fmtNumber((summary.day.share ?? 0) * 100, 0)}% din program
						</p>
					</>
				) : (
					<p className="text-xs text-muted-foreground">Service-ul e închis în ziua aceasta.</p>
				)}
				<p className="flex items-baseline justify-between gap-2">
					<span className="text-muted-foreground">În săptămâna aceasta</span>
					<span className="font-medium tabular-nums">{plural(summary.weekCount, "programare", "programări")}</span>
				</p>
			</div>
			<div className="space-y-1.5 border-t pt-2.5">
				<p className="flex items-baseline justify-between gap-2">
					<span className="text-muted-foreground">Lucrări deschise</span>
					<span className="font-medium tabular-nums">{summary.jobs.length}</span>
				</p>
				{summary.jobs.slice(0, 3).map((order) => (
					<button
						key={order.id}
						type="button"
						onClick={() => {
							onClose();
							openDetail("work-order", order.id);
						}}
						className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-accent"
					>
						<Wrench className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
						<span className="min-w-0 flex-1 truncate">{vehicleName(vehicles[order.vehicleId]) || fmtWorkOrder(order.number)}</span>
						<span className={cn("shrink-0", tone(WORK_ORDER_STATUS[order.status]?.tone ?? "neutral").text)}>{WORK_ORDER_STATUS[order.status]?.label}</span>
					</button>
				))}
				{summary.jobs.length > 3 && <p className="text-xs text-muted-foreground">+{summary.jobs.length - 3} încă</p>}
			</div>
			<Link href={`/appointments/?staff=${staffId}&period=week`} onClick={onClose} className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent">
				Programările lui săptămâna aceasta <ArrowRight className="size-3.5" aria-hidden />
			</Link>
		</div>
	);
}

/**
 * A mechanic's avatar and name over (or beside) their lane in Zi. With a mouse, resting on it
 * shows their card (their day, their week, their open jobs); a tap shows it too, since a phone
 * has no hover. "Nealocat" has no card.
 */
export function MechanicLabel({ column, day, className, labelClassName }) {
	const [open, setOpen] = useState(false);
	const timer = useRef(0);
	if (!column.staffId) {
		return (
			<span className={cn("flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground", className)}>
				<span className={cn("truncate", labelClassName)}>{column.label}</span>
			</span>
		);
	}
	// Opens almost at once (a pointer only passing over does not flash it); a short pause before it closes, so the pointer can move onto it.
	const hover = (next) => (event) => {
		if (event.pointerType !== "mouse") return;
		clearTimeout(timer.current);
		timer.current = setTimeout(() => setOpen(next), next ? 60 : 150);
	};
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					data-mechanic={column.staffId}
					onPointerEnter={hover(true)}
					onPointerLeave={hover(false)}
					aria-label={`${column.name}: programări și lucrări`}
					className={cn("flex min-w-0 items-center gap-1 rounded-md text-[10px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none", className)}
				>
					<Initials name={column.name} tone={column.color} size="sm" className="size-4 shrink-0 text-[8px]" />
					<span className={cn("truncate", labelClassName)}>{column.label}</span>
				</button>
			</PopoverTrigger>
			<PopoverContent side="bottom" align="start" className="w-72 p-3" data-mechanic-card={column.staffId} onPointerEnter={hover(true)} onPointerLeave={hover(false)} onOpenAutoFocus={(event) => event.preventDefault()}>
				<MechanicSummary staffId={column.staffId} name={column.name} color={column.color} day={day} onClose={() => setOpen(false)} />
			</PopoverContent>
		</Popover>
	);
}
