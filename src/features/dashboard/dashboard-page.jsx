"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ExternalLink, MoreHorizontal, Phone } from "lucide-react";
import { GlassPill } from "@/components/ds/glass";
import { COVER_HEIGHT, COVER_WIDTH, CarCover, CoverButton, CoverIconButton } from "@/components/ds/car";
import { SectionHeader } from "@/components/ds/blocks";
import { Page } from "@/components/ds/page";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAccount } from "@/components/shell/account-menu";
import { plural } from "@/lib/format";
import { makeInk } from "@/lib/colors";
import { WORK_ORDER_STATUS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { useCollection, useIsReady, useSettings, useToday } from "@/lib/store/hooks";
import { selectAziMoney, selectToConfirm } from "@/lib/store/selectors";
import { useNowMinute } from "@/lib/hooks";
import { atMinute } from "@/features/calendar/utils";
import { primaryAction } from "@/features/work-orders/job-action";
import { jobHeadline, jobSummary } from "@/features/work-orders/job-text";
import { DayBoard } from "@/features/calendar/day-board";
import { JOB_FILTERS, shopJobs } from "./azi-data";
import { AziHeader } from "./azi-header";
import { MoneyRow } from "./money-row";
import { PhoneAzi } from "./phone-azi";
import { ToAccept } from "./to-accept";
import { PHONE } from "@/components/ds/nav-bar";
import { useMediaQuery } from "@/lib/hooks";

// Azi (docs/DESIGN.md §4): one page. The header of layered cards, the bookings still to accept, the cars in the shop as covers, the money (today,
// still to come today, the month so far), and last the day per lift.

const carName = (vehicle) => [vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || "Mașină";

function AziSkeleton() {
	return (
		<Page width="wide" className="space-y-7">
			<div className="flex gap-1 overflow-hidden">
				{Array.from({ length: 5 }, (_, i) => (
					<Skeleton key={i} className="h-[156px] min-w-[196px] flex-1 rounded-2xl" />
				))}
			</div>
			<div className="flex gap-3.5 overflow-hidden">
				{Array.from({ length: 4 }, (_, i) => (
					<Skeleton key={i} className="h-[280px] w-[238px] shrink-0 rounded-[14px]" />
				))}
			</div>
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{Array.from({ length: 4 }, (_, i) => (
					<Skeleton key={i} className="h-[86px] rounded-xl" />
				))}
			</div>
		</Page>
	);
}

/** A job as a cover: its car's colour, the next step, and "…" for the rest. */
function JobCover({ order, vehicle, customer, staffId }) {
	const router = useRouter();
	const action = primaryAction(order, { staffId });
	// A tap opens the job's sheet over Azi; the full page stays one step away in "…".
	const open = () => openSheet("work-order-view", { id: order.id });
	const openPage = () => router.push(`/work-orders/detail/?id=${order.id}`);
	const light = makeInk(vehicle?.make) !== "#ffffff";
	return (
		<CarCover
			make={vehicle?.make}
			car={carName(vehicle)}
			code={`LUC #${order.number}`}
			plate={vehicle?.plate}
			status={WORK_ORDER_STATUS[order.status]?.label}
			title={jobHeadline(order)}
			detail={jobSummary(order)}
			width={COVER_WIDTH}
			height={COVER_HEIGHT}
			onOpen={open}
			className="snap-start"
			action={
				action && (
					<CoverButton icon={action.icon} onClick={action.run}>
						{action.label}
					</CoverButton>
				)
			}
			menu={
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<CoverIconButton icon={MoreHorizontal} label="Mai multe" light={light} />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" data-sheet-menu>
						<DropdownMenuItem onSelect={openPage}>
							<ExternalLink /> Deschide lucrarea
						</DropdownMenuItem>
						{customer?.phone && (
							<DropdownMenuItem asChild>
								<a href={`tel:${customer.phone}`}>
									<Phone /> Sună: {customer.name}
								</a>
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			}
		/>
	);
}

/** Azi A's first section: the open jobs as covers, filtered by stage. */
function InShop({ jobs, vehicles, customers, staffId, filter, setFilter, sectionRef }) {
	const keep = JOB_FILTERS.find((f) => f.value === filter)?.keep ?? (() => true);
	const shown = jobs.filter(keep);
	const working = jobs.filter((o) => o.status === "in_progress").length;
	const ready = jobs.filter((o) => o.status === "ready").length;
	return (
		<section ref={sectionRef} className="scroll-mt-20 space-y-3" aria-label="În atelier">
			<SectionHeader title="În atelier" subtitle={`${plural(jobs.length, "mașină", "mașini")} · ${working} în lucru, ${ready} gata de predat`} href="/work-orders/">
				<div className="hidden gap-1.5 sm:flex" role="group" aria-label="Arată">
					{JOB_FILTERS.map((f) => {
						const count = jobs.filter(f.keep).length;
						if (f.value !== "all" && !count) return null;
						return (
							<GlassPill key={f.value} active={filter === f.value} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
								{f.label}
								{f.value !== "all" && <span className="tabular-nums opacity-60">{count}</span>}
							</GlassPill>
						);
					})}
				</div>
			</SectionHeader>
			{shown.length ? (
				<div className="no-scrollbar -mx-4 flex snap-x gap-3.5 overflow-x-auto scroll-px-4 px-4 pb-1 md:mx-0 md:scroll-px-0 md:px-0">
					{shown.map((order) => (
						<JobCover key={order.id} order={order} vehicle={vehicles[order.vehicleId]} customer={customers[order.customerId]} staffId={staffId} />
					))}
				</div>
			) : (
				<div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card px-6 py-10 text-center">
					<p className="text-[15px] font-semibold">Nicio mașină aici</p>
					<p className="text-sm text-muted-foreground">Când primești o mașină, apare aici în culoarea ei.</p>
					<GlassPill active onClick={() => openSheet("checkin")} className="mt-1 h-8 rounded-[8px] px-3 text-[13px]">
						Primește o mașină
					</GlassPill>
				</div>
			)}
		</section>
	);
}

/** Azi on tablet and desktop; a phone gets its own. */
export function DashboardPage() {
	const ready = useIsReady();
	const today = useToday();
	const minute = useNowMinute();
	const settings = useSettings();
	const workOrders = useCollection("workOrders");
	const vehicles = useCollection("vehicles");
	const customers = useCollection("customers");
	const appointments = useCollection("appointments");
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	const staff = useCollection("staff");
	const bays = useCollection("bays");
	const { member } = useAccount();
	const [shopFilter, setShopFilter] = useState("all");
	const shopRef = useRef(null);
	const phone = useMediaQuery(PHONE);
	if (!ready || !today || minute == null) return <AziSkeleton />;

	const now = atMinute(today, minute);
	// A phone is the iPhone's Azi (docs/DESIGN.md "Telefon ca iPhone").
	if (phone) return <PhoneAzi today={today} now={now} />;
	const currency = settings.currency;
	const jobs = shopJobs(workOrders);
	const toConfirm = selectToConfirm(appointments, now).groups;
	const aziMoney = selectAziMoney(payments, workOrders, invoices, settings, today);
	const showShop = (filter) => {
		setShopFilter(filter);
		shopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	return (
		<Page width="wide" className="azi-type space-y-7">
			<AziHeader
				{...aziMoney}
				today={today}
				shopName={settings.shop.name}
				toAccept={toConfirm.filter((group) => group.day).reduce((count, group) => count + group.items.length, 0)}
				currency={currency}
				jobs={jobs}
				onShowShop={() => showShop("all")}
				onShowReady={() => showShop("ready")}
			/>
			<ToAccept groups={toConfirm} today={today} vehicles={vehicles} customers={customers} staff={staff} bays={bays} />
			<InShop jobs={jobs} vehicles={vehicles} customers={customers} staffId={member?.id ?? null} filter={shopFilter} setFilter={setShopFilter} sectionRef={shopRef} />
			<DayBoard section initialDay={today} today={today} bays={bays} staff={staff} appointments={appointments} workOrders={workOrders} vehicles={vehicles} settings={settings} />
			<MoneyRow
				{...aziMoney}
				today={today}
				currency={currency}
				onShowReady={() => showShop("ready")}
			/>
		</Page>
	);
}
