"use client";

import { Page } from "@/components/ds/page";
import { Skeleton } from "@/components/ui/skeleton";
import { useCollection, useIsReady, useSettings, useToday } from "@/lib/store/hooks";
import { selectToCollect, selectToConfirm } from "@/lib/store/selectors";
import { useNowMinute } from "@/lib/hooks";
import { atMinute } from "@/features/calendar/utils";
import { DashboardCalendar } from "./dashboard-calendar";
import { HomeAnalytics } from "./home-analytics";
import { HomeHero } from "./home-hero";
import { ToCollect } from "./to-collect";
import { ToConfirm } from "./to-confirm";

/** A section in the cards form, loading: its title column, three cards and its line. */
function StripSkeleton() {
	return (
		<div className="space-y-2.5">
			<div className="flex flex-col gap-2.5 md:flex-row md:gap-4">
				<Skeleton className="h-4 w-40 md:w-44" />
				<div className="flex gap-2 overflow-hidden">
					{Array.from({ length: 3 }, (_, i) => (
						<Skeleton key={i} className="h-32 w-[min(72vw,14.5rem)] shrink-0 rounded-lg md:w-60" />
					))}
				</div>
			</div>
			<Skeleton className="h-2.5 w-full rounded-full" />
		</div>
	);
}

/** Loading state with the page's own geometry: the hero, the calendar, the three strips, the analytics grid. */
function HomeSkeleton() {
	return (
		<Page>
			<div className="space-y-14 md:space-y-20">
				<div className="flex flex-col items-center gap-5 pt-2 md:gap-6 md:pt-8">
					<Skeleton className="h-8 w-72 max-w-full rounded-full" />
					<Skeleton className="h-9 w-80 max-w-full" />
					<Skeleton className="h-[4.25rem] w-full max-w-3xl rounded-2xl" />
					<Skeleton className="h-9 w-80 max-w-full rounded-full" />
				</div>
				<Skeleton className="h-72 w-full rounded-xl" />
				<StripSkeleton />
				<StripSkeleton />
				<StripSkeleton />
				<div className="space-y-3">
					<Skeleton className="h-7 w-28" />
					<div className="grid gap-4 md:grid-cols-2">
						<Skeleton className="h-80 rounded-xl" />
						<Skeleton className="h-80 rounded-xl" />
					</div>
					<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
						{Array.from({ length: 4 }, (_, i) => (
							<Skeleton key={i} className="h-48 rounded-xl" />
						))}
					</div>
				</div>
			</div>
		</Page>
	);
}

/**
 * Azi, the home page (docs/HOME-PAGE.md), in the Cloudflare manner: the day and one big
 * search, the timeline, then what needs the shop, each in the cards form: the cars already in
 * service (linked to their places on the timeline), the bookings to confirm, the invoices to
 * collect, and last the analytics grid. Nothing date-bound is rendered before the store and the clock are known.
 */
export function DashboardPage() {
	const ready = useIsReady();
	const today = useToday();
	const settings = useSettings();
	const minute = useNowMinute();
	const appointments = useCollection("appointments");
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	const customers = useCollection("customers");
	const vehicles = useCollection("vehicles");
	const workOrders = useCollection("workOrders");
	const staff = useCollection("staff");

	if (!ready || !today || minute == null) return <HomeSkeleton />;

	const nowAt = atMinute(today, minute);
	const lookups = { vehicles, customers, staff, workOrders, settings, today, nowAt };

	return (
		<Page>
			<div className="space-y-14 md:space-y-20">
				<HomeHero settings={settings} today={today} minute={minute} />
				<DashboardCalendar today={today} />
				<ToConfirm data={selectToConfirm(appointments, nowAt)} lookups={lookups} today={today} />
				<ToCollect data={selectToCollect(invoices, payments, today)} lookups={lookups} today={today} />
				<HomeAnalytics today={today} />
			</div>
		</Page>
	);
}
