"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CalendarClock, ExternalLink, GalleryHorizontal, MoreHorizontal, Phone } from "lucide-react";
import { GlassPill } from "@/components/ds/glass";
import { COVER_HEIGHT, COVER_WIDTH, CarCover, CoverButton, CoverIconButton, MakeTile } from "@/components/ds/car";
import { PageTitle, SectionHeader, StatCard, StatusDot, useViewSwitch } from "@/components/ds/blocks";
import { Page } from "@/components/ds/page";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAccount } from "@/components/shell/account-menu";
import { fmtDate, fmtTime, formatMoney, plural } from "@/lib/format";
import { dayOfInstant } from "@/domain/dates";
import { formatPlate } from "@/domain/vehicle";
import { AREA, STATE, TONE_COLOR, makeInk } from "@/lib/colors";
import { APPOINTMENT_STATUS, WORK_ORDER_STATUS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { useCollection, useIsReady, useSettings, useToday } from "@/lib/store/hooks";
import { selectAziMoney, selectToCollect, selectToConfirm } from "@/lib/store/selectors";
import { useNowMinute } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { atMinute } from "@/features/calendar/utils";
import { primaryAction } from "@/features/work-orders/job-action";
import { jobHeadline, jobSummary } from "@/features/work-orders/job-text";
import { JOB_FILTERS, hoursText, hoursToday, shopJobs, todaysBookings } from "./azi-data";
import { MoneyRow } from "./money-row";
import { PhoneAzi } from "./phone-azi";
import { ToAccept } from "./to-accept";
import { PHONE } from "@/components/ds/nav-bar";
import { useMediaQuery } from "@/lib/hooks";

// Azi (docs/DESIGN.md §4): the owner kept two looks, switched at the top right and remembered on this device.
// A, "Coperți": the bookings still to accept and the cars in the shop as covers, then the money (today, still to come
// today, the month so far) and the day per lift.
// B, "Ziua": the numbers, the day as a timeline per lift, then what waits for a call and the money.
const LOOKS = [
	{ value: "covers", label: "Coperți", icon: GalleryHorizontal },
	{ value: "day", label: "Ziua", icon: CalendarClock },
];

const carName = (vehicle) => [vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || "Mașină";

function AziSkeleton() {
	return (
		<Page width="wide" className="space-y-7">
			<div className="space-y-2">
				<Skeleton className="h-8 w-32" />
				<Skeleton className="h-4 w-56" />
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

/** The day's four numbers. */
function Numbers({ collect, jobs, bookings, hours, staff, currency }) {
	const due = collect.groups.filter((g) => g.key !== "draft").flatMap((g) => g.items);
	const late = collect.groups.find((g) => g.key === "overdue")?.items.length ?? 0;
	const working = jobs.filter((o) => o.status === "in_progress").length;
	const arrived = bookings.filter((a) => a.status === "arrived").length;
	const who = hours.byStaff
		.filter(([id, ms]) => staff[id]?.name && ms >= 60_000)
		.slice(0, 2)
		.map(([id, ms]) => `${staff[id].name.split(" ")[0]} ${hoursText(ms)}`)
		.join(" · ");
	return (
		<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
			<StatCard label="De încasat" value={formatMoney(collect.due, currency, { decimals: 0 })} note={late ? `${plural(late, "factură restantă", "facturi restante")}` : plural(due.length, "factură", "facturi")} color={late ? STATE.late : AREA.factura} />
			<StatCard label="Lucrări deschise" value={jobs.length} note={`${working} în lucru acum`} color={AREA.lucrare} />
			<StatCard label="Programări azi" value={bookings.length} note={arrived ? `${plural(arrived, "sosită", "sosite")}` : "nicio mașină sosită"} color={AREA.programare} />
			<StatCard label="Ore lucrate azi" value={hoursText(hours.total)} note={who || "niciun cronometru azi"} color={AREA.rapoarte} />
		</div>
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

function Row({ children, onClick, label }) {
	return (
		<li>
			<button type="button" onClick={onClick} aria-label={label} className="flex min-h-[52px] w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-accent/50">
				{children}
			</button>
		</li>
	);
}

function BookingRows({ bookings, vehicles, customers, empty, today }) {
	if (!bookings.length) return <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>;
	return (
		<ul className="divide-y overflow-hidden rounded-xl border bg-card">
			{bookings.map((a) => {
				const vehicle = vehicles[a.vehicleId];
				const status = APPOINTMENT_STATUS[a.status];
				return (
					<Row key={a.id} onClick={() => openSheet("appointment-view", { id: a.id })} label={`Programarea de la ${fmtTime(a.start)}`}>
						<span className="w-11 shrink-0 text-[13px] font-semibold tabular-nums">
							{fmtTime(a.start)}
							{today && dayOfInstant(a.start) !== today && <span className="block text-[11px] font-normal text-muted-foreground">{fmtDate(a.start, "d MMM")}</span>}
						</span>
						<MakeTile make={vehicle?.make} size={32} />
						<span className="min-w-0 flex-1">
							<span className="block truncate text-[13.5px] font-medium">{[carName(vehicle), a.title].filter(Boolean).join(" · ")}</span>
							<span className="block truncate text-xs text-muted-foreground">{[customers[a.customerId]?.name, vehicle?.plate && formatPlate(vehicle.plate)].filter(Boolean).join(" · ")}</span>
						</span>
						{status && <StatusDot color={TONE_COLOR[status.tone]}>{status.label}</StatusDot>}
					</Row>
				);
			})}
		</ul>
	);
}

function MoneyRows({ collect, vehicles, customers, currency }) {
	const router = useRouter();
	const items = collect.groups.filter((g) => g.key !== "draft").flatMap((g) => g.items).slice(0, 5);
	if (!items.length) return <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">Nimic de încasat. Toate facturile sunt plătite.</p>;
	return (
		<ul className="divide-y overflow-hidden rounded-xl border bg-card">
			{items.map(({ invoice, balance, overdueDays, dueIn }) => {
				const vehicle = vehicles[invoice.vehicleId];
				const late = overdueDays > 0;
				return (
					<Row key={invoice.id} onClick={() => router.push(`/invoices/detail/?id=${invoice.id}`)} label={`Factura ${invoice.number ?? ""}`}>
						<MakeTile make={vehicle?.make} size={32} />
						<span className="min-w-0 flex-1">
							<span className="block truncate text-[13.5px] font-medium">{customers[invoice.customerId]?.name ?? "Client"}</span>
							<span className={cn("block truncate text-xs", late ? "text-[#ff3b30]" : "text-muted-foreground")}>
								{late ? `întârziată ${plural(overdueDays, "zi", "zile")}` : dueIn === 0 ? "scadentă azi" : dueIn != null ? `scadentă ${fmtDate(invoice.dueDate, "d MMM")}` : "de încasat"}
							</span>
						</span>
						<span className="text-[13.5px] font-semibold tabular-nums">{formatMoney(balance, currency)}</span>
					</Row>
				);
			})}
		</ul>
	);
}

/** Azi B: the lifts as lanes across the opening hours, the cars as blocks tinted with their colour. */
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
	const [look, lookSwitch] = useViewSwitch("garaj.azi.look", LOOKS);
	const [shopFilter, setShopFilter] = useState("all");
	const shopRef = useRef(null);
	const phone = useMediaQuery(PHONE);
	if (!ready || !today || minute == null) return <AziSkeleton />;

	const now = atMinute(today, minute);
	// A phone is the iPhone's Azi (docs/DESIGN.md "Telefon ca iPhone").
	if (phone) return <PhoneAzi today={today} now={now} />;
	const currency = settings.currency;
	const jobs = shopJobs(workOrders);
	const bookings = todaysBookings(appointments, today);
	const collect = selectToCollect(invoices, payments, today);
	const hours = hoursToday(workOrders, today, new Date().toISOString());
	const numbers = <Numbers collect={collect} jobs={jobs} bookings={bookings} hours={hours} staff={staff} currency={currency} />;
	const money = (
		<section className="space-y-3" aria-label="De încasat">
			<SectionHeader title="De încasat" subtitle={`${formatMoney(collect.due, currency)} · ${plural(collect.groups.filter((g) => g.key !== "draft").reduce((n, g) => n + g.items.length, 0), "factură", "facturi")}`} href="/invoices/" />
			<MoneyRows collect={collect} vehicles={vehicles} customers={customers} currency={currency} />
		</section>
	);

	return (
		<Page width="wide" className="space-y-7">
			<PageTitle title="Azi" subtitle={`${fmtDate(today, "EEEE, d MMMM")} · ${settings.shop.name}`}>
				{lookSwitch}
			</PageTitle>
			{look === "covers" ? (
				<>
					<ToAccept groups={selectToConfirm(appointments, now).groups} today={today} vehicles={vehicles} customers={customers} staff={staff} bays={bays} />
					<InShop jobs={jobs} vehicles={vehicles} customers={customers} staffId={member?.id ?? null} filter={shopFilter} setFilter={setShopFilter} sectionRef={shopRef} />
					<MoneyRow
						{...selectAziMoney(payments, workOrders, invoices, settings, today)}
						today={today}
						currency={currency}
						onShowReady={() => {
							setShopFilter("ready");
							shopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
						}}
					/>
				</>
			) : (
				<>
					{numbers}
					<div className="grid gap-7 lg:grid-cols-2">
						<section className="space-y-3" aria-label="De confirmat">
							{(() => {
								const waiting = selectToConfirm(appointments, now).groups.filter((g) => g.key !== "past").flatMap((g) => g.items).slice(0, 5);
								return (
									<>
										<SectionHeader title="De confirmat" subtitle={plural(waiting.length, "programare", "programări")} href="/appointments/" />
										<BookingRows bookings={waiting} vehicles={vehicles} customers={customers} today={today} empty="Toate programările sunt confirmate." />
									</>
								);
							})()}
						</section>
						{money}
					</div>
				</>
			)}
		</Page>
	);
}
