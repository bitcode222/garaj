"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, Pause } from "lucide-react";
import { MakeTile } from "@/components/ds/car";
import { Glass } from "@/components/ds/glass";
import { useAccount } from "@/components/shell/account-menu";
import { runningEntry, runningJobs, steps, workedMs } from "@/domain/work-clock";
import { formatPlate } from "@/domain/vehicle";
import { setLineDone, stopWork } from "@/lib/store/actions";
import { useCollection } from "@/lib/store/hooks";
import { useMediaQuery } from "@/lib/hooks";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { clockText, jobHeadline, stepText } from "@/features/work-orders/job-text";

/** The time now, once a second while `on`. */
export function useTick(on) {
	const [now, setNow] = useState(() => new Date().toISOString());
	useEffect(() => {
		if (!on) return undefined;
		const timer = setInterval(() => setNow(new Date().toISOString()), 1000);
		return () => clearInterval(timer);
	}, [on]);
	return now;
}

/**
 * The running job (docs/DESIGN.md §1, rule 6): a dark bar floating at the bottom of every page, as the iPhone's bar above
 * its tabs. The car, the current step, the plate, the step count and the time; pause, tick the step off; tap to open
 * the job. The mechanic at this device sees their own job first.
 */
export function RunningJobBar() {
	const workOrders = useCollection("workOrders");
	const vehicles = useCollection("vehicles");
	const { member } = useAccount();
	const router = useRouter();
	const running = runningJobs(Object.values(workOrders));
	const order = running.find((o) => member && runningEntry(o).staffId === member.id) ?? running[0] ?? null;
	const now = useTick(Boolean(order));
	// On a phone it is the iPhone's capsule: light glass, dark text (dark glass on a desktop).
	const phone = useMediaQuery("(max-width: 767px)");
	if (!order) return null;
	const vehicle = vehicles[order.vehicleId];
	const { current } = steps(order);
	const step = stepText(order);
	const attempt = (fn) => (event) => {
		event.stopPropagation();
		try {
			fn();
		} catch (error) {
			toast.error(error.message);
		}
	};
	return (
		<>
			{/* Room under the page's last row, so the bar never covers it. */}
			<div aria-hidden className="h-20" />
			<Glass
				preset={phone ? "capsule" : "float"}
				data-print="hide"
				data-running-bar
				role="region"
				aria-label="Lucrarea pornită"
				className={cn(
					"fixed z-30 flex h-[52px] items-center gap-2.5 rounded-[14px] bg-zinc-900/95 pr-2 pl-1.5 text-white shadow-[0_12px_32px_rgb(0_0_0/0.28)] dark:bg-zinc-100/95 dark:text-zinc-900",
					"max-md:h-14 max-md:rounded-full max-md:border max-md:bg-card/90 max-md:pl-2 max-md:text-foreground max-md:shadow-[0_8px_30px_-12px_rgb(0_0_0/0.3)] max-md:dark:bg-card/90 max-md:dark:text-foreground",
					"inset-x-3 bottom-[calc(var(--tabbar-h)+var(--safe-bottom)+0.125rem)]",
					"md:inset-x-auto md:bottom-5 md:left-[calc(50%+2rem)] md:w-[460px] md:-translate-x-1/2 lg:left-[calc(50%+7.5rem)]",
				)}
			>
				<button type="button" onClick={() => router.push(`/work-orders/detail/?id=${order.id}`)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-current/40">
					<MakeTile make={vehicle?.make} size={40} />
					<span className="min-w-0 flex-1">
						<span className="block truncate text-[13.5px] font-semibold">{current?.description || jobHeadline(order)}</span>
						<span className="block truncate text-xs opacity-60">
							{[vehicle?.plate && formatPlate(vehicle.plate), step].filter(Boolean).join(" · ")}
							{" · "}
							<span className="tabular-nums">{clockText(workedMs(order, now))}</span>
						</span>
					</span>
				</button>
				<button type="button" onClick={attempt(() => stopWork(order.id))} aria-label="Pauză" className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-current/15">
					<Pause className="size-4 fill-current" aria-hidden />
				</button>
				{current && (
					<button type="button" onClick={attempt(() => setLineDone(order.id, current.id, true))} aria-label={`Gata: ${current.description || "pasul"}`} className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-current/15">
						<Check className="size-4" aria-hidden />
					</button>
				)}
			</Glass>
		</>
	);
}
