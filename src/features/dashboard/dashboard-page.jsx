"use client";

import { Fragment, useState } from "react";
import { DayRuler } from "@/components/ds/day-ruler";
import { Segmented } from "@/components/ds/inputs";
import { Page } from "@/components/ds/page";
import { Skeleton } from "@/components/ui/skeleton";
import { useCollection, useIsReady, useSettings, useToday } from "@/lib/store/hooks";
import { selectDayMarks, selectEstimates, selectJobs, selectToCollect, selectWeekBookings } from "@/lib/store/selectors";
import { parseISODate } from "@/domain/dates";
import { SPAN, clampSpan, clampWindow, spanOf, windowAround } from "@/domain/timeframe";
import { plural } from "@/lib/format";
import { RECORD_KIND } from "@/lib/labels";
import { useLocalPreference, useNowMinute } from "@/lib/hooks";
import { atMinute } from "@/features/calendar/utils";
import { HomeAnalytics } from "./home-analytics";
import { HomeHero } from "./home-hero";
import { JobStrip } from "./job-strip";
import { ToCollect } from "./to-collect";
import { ToConfirm } from "./to-confirm";

/** A section in the cards form, loading: its title column with its half donut, its chips and three cards. */
function StripSkeleton() {
	return (
		<div className="flex flex-col gap-2 md:flex-row md:gap-4">
			<div className="flex shrink-0 items-center justify-between gap-4 md:w-44 md:flex-col md:items-stretch md:justify-between md:pt-1.5">
				<Skeleton className="h-5 w-36" />
				<Skeleton className="h-[4.5rem] w-36 rounded-t-full rounded-b-none md:h-[5.5rem] md:w-full" />
			</div>
			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<div className="flex gap-1.5 overflow-hidden py-1.5 md:py-0">
					{Array.from({ length: 4 }, (_, i) => (
						<Skeleton key={i} className="h-8 w-24 shrink-0 rounded-full md:h-7" />
					))}
				</div>
				<div className="flex gap-4 overflow-hidden">
					{Array.from({ length: 3 }, (_, i) => (
						<Skeleton key={i} className="h-52 w-[min(84vw,20rem)] shrink-0 rounded-lg md:w-80" />
					))}
				</div>
			</div>
		</div>
	);
}

/** Loading state with the page's own geometry: the hero, the four sections (Programări, Devize, Lucrări, Facturi), the analytics grid. */
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
				<StripSkeleton />
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

// The home's two views: the sections as they stack (the default), or one visit stage at a time as tabs.
const VIEWS = ["sections", "stages"];
const VIEW_OPTIONS = [
	{ value: "sections", label: "Secțiuni" },
	{ value: "stages", label: "Etape" },
];
const STAGES = ["appointment", "estimate", "job", "invoice"];
const STAGE_OPTIONS = STAGES.map((key) => ({ value: key, label: RECORD_KIND[key].label, icon: RECORD_KIND[key].icon }));

/**
 * What the ruler counts (docs/TIMEFRAME-RULER.md §4, §13): its stacks are monochrome; a hovered day's details name each
 * kind in its own colour (docs/RECORD-COLORS.md), the same colour with "!" for its deadline.
 */
const MARK_KINDS = [
	{ key: "booking", tone: RECORD_KIND.appointment.tone, label: "Programare", count: (n) => plural(n, "programare", "programări") },
	{ key: "estimate", due: "estimateDue", tone: RECORD_KIND.estimate.tone, label: "Deviz", count: (n) => plural(n, "deviz creat", "devize create"), dueCount: (n) => plural(n, "deviz de aprobat", "devize de aprobat") },
	{ key: "job", due: "jobDue", tone: RECORD_KIND.job.tone, label: "Lucrare", count: (n) => plural(n, "lucrare începută", "lucrări începute"), dueCount: (n) => plural(n, "lucrare de terminat", "lucrări de terminat") },
	{ key: "invoice", due: "invoiceDue", tone: RECORD_KIND.invoice.tone, label: "Factură", count: (n) => plural(n, "factură creată", "facturi create"), dueCount: (n) => plural(n, "factură scadentă", "facturi scadente") },
];

/**
 * Azi, the home page (docs/HOME-PAGE.md), in the Cloudflare manner: the day, one big search and
 * the day ruler, then the sections in the cards form for the ruler's dates, in the order of a
 * visit: Programări, Devize, Lucrări, Facturi; and last the analytics grid. Nothing date-bound is rendered before the store and the clock are known.
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
	// The sections' dates, chosen on the day ruler under the search (docs/TIMEFRAME-RULER.md). Its length is
	// remembered on this device; its place is not: until it is moved it is centred on today, and follows
	// today past midnight. Moved, it stays where it was put.
	const [storedSpan, setStoredSpan] = useLocalPreference("garaj.home.span", String(SPAN.initial));
	const span = clampSpan(Number(storedSpan));
	const [moved, setMoved] = useState(null);
	// The view (the sections, or the visit stages as tabs) and the stage shown in it, both kept on this device.
	const [view, setView] = useLocalPreference("garaj.home.view", "sections", VIEWS);
	const [stage, setStage] = useLocalPreference("garaj.home.stage", STAGES[0], STAGES);

	if (!ready || !today || minute == null) return <HomeSkeleton />;

	const nowAt = atMinute(today, minute);
	const lookups = { vehicles, customers, staff, workOrders, appointments, settings, today, nowAt };
	const range = moved ?? windowAround(today, span);
	// A day picked on the ruler (or its undoing) is a look at one day, not a length to keep.
	const choose = (next, { remember = true } = {}) => {
		const kept = clampWindow(next, today);
		setMoved(kept);
		if (remember && spanOf(kept) !== span) setStoredSpan(String(spanOf(kept)));
	};
	const openDays = settings.hours?.days;
	const ruler = (
		<DayRuler
			from={range.from}
			to={range.to}
			today={today}
			marks={selectDayMarks(appointments, workOrders, invoices, payments, today)}
			kinds={MARK_KINDS}
			isClosed={openDays ? (day) => !openDays.includes(parseISODate(day).getDay()) : undefined}
			onChange={choose}
			onReset={() => setMoved(null)}
			atDefault={!moved}
		/>
	);

	return (
		<Page>
			<div className="space-y-14 md:space-y-20">
								<HomeHero settings={settings} today={today} minute={minute} />
				{/* The dates of the sections below (docs/TIMEFRAME-RULER.md): its own section, left-aligned like them. */}
				<div className="space-y-4">
					<section aria-label="Interval">{ruler}</section>
					<div className="flex justify-end">
						<Segmented value={view} onValueChange={setView} options={VIEW_OPTIONS} aria-label="Cum se arată secțiunile" />
					</div>
				</div>
				{/* Each stage's section, for the same dates: the booking, the estimate, the job, the invoice (the order of a visit). */}
				{(() => {
					const sections = {
						appointment: () => <ToConfirm data={selectWeekBookings(appointments, nowAt, range.from, range.to)} lookups={lookups} today={today} range={range} />,
						estimate: () => <JobStrip kind="estimates" data={selectEstimates(workOrders, appointments, range.from, range.to, settings)} lookups={lookups} today={today} range={range} />,
						job: () => <JobStrip kind="jobs" data={selectJobs(workOrders, appointments, range.from, range.to, settings)} lookups={lookups} today={today} range={range} />,
						invoice: () => <ToCollect data={selectToCollect(invoices, payments, today, range.from, range.to)} lookups={lookups} today={today} range={range} />,
					};
					return view === "sections" ? (
						STAGES.map((key) => <Fragment key={key}>{sections[key]()}</Fragment>)
					) : (
						<div className="space-y-6">
							<Segmented value={stage} onValueChange={setStage} options={STAGE_OPTIONS} aria-label="Etapa vizitei" />
							{sections[stage]()}
						</div>
					);
				})()}
				<HomeAnalytics today={today} />
			</div>
		</Page>
	);
}
