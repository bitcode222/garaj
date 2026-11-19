"use client";

import { CarLine } from "@/components/ds/car";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarPlus, ChevronRight, FilePlus2, ListFilter, Minus, MoreHorizontal, Wrench } from "lucide-react";
import { MakeLogo } from "@/components/ds/make-logo";
import { PageTitle } from "@/components/ds/blocks";
import { IosCaps, IosPill, IosSegmented, IosStat } from "@/components/ds/ios";
import { Page } from "@/components/ds/page";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { addDaysISO, addMonthsISO, dayOfInstant, diffDaysISO } from "@/domain/dates";
import { formatInvoiceNumber } from "@/domain/invoice";
import { computeTotals } from "@/domain/lines";
import { summarize } from "@/domain/reports";
import { formatPlate, vehicleName } from "@/domain/vehicle";
import { STATE, TONE_COLOR, makeColor, makeCover, makeInk } from "@/lib/colors";
import { fmtDate, fmtHours, fmtNumber, fmtTime, formatMoney } from "@/lib/format";
import { INVOICE_STATE, WORK_ORDER_STATUS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { useOpenDetail } from "@/lib/detail-mode";
import { createInvoiceDraft, setAppointmentStatus } from "@/lib/store/actions";
import { useCollection, useSettings } from "@/lib/store/hooks";
import { selectHomeAnalytics, selectToCollect, selectToConfirm } from "@/lib/store/selectors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { AreaChart } from "@/features/reports/charts";
import { JobMenu } from "@/features/work-orders/job-card";
import { primaryAction } from "@/features/work-orders/job-action";
import { jobHeadline } from "@/features/work-orders/job-text";
import { shopJobs } from "./azi-data";

// Azi on a phone, as the iPhone app's (ios-native/Garaj/Views/HomeView.swift): the greeting and the day, the cars in
// the shop as covers in their colour (one at a time, sideways, "1 / 13"), three shortcuts, four numbers, the bookings
// to confirm, the invoices to collect, and Analiză.

const ORDER = ["in_progress", "approved", "waiting_parts", "estimate", "ready"];
const statusOf = (key) => ({ label: WORK_ORDER_STATUS[key]?.label ?? key, color: TONE_COLOR[WORK_ORDER_STATUS[key]?.tone ?? "neutral"] });

function greeting(hour) {
	return hour >= 5 && hour < 11 ? "Bună dimineața" : hour >= 11 && hour < 18 ? "Bună ziua" : "Bună seara";
}

export function PhoneAzi({ today, now }) {
	const router = useRouter();
	const settings = useSettings();
	const workOrders = useCollection("workOrders");
	const appointments = useCollection("appointments");
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	const vehicles = useCollection("vehicles");
	const customers = useCollection("customers");
	const staff = useCollection("staff");
	const [stage, setStage] = useState(null);
	const money = (minor, decimals = 0) => formatMoney(minor, settings.currency, { decimals });
	const gross = (order) => computeTotals((order.lines ?? []).filter((l) => !l.refused), { vatPayer: settings.invoicing.vatPayer }).gross;

	const jobs = shopJobs(workOrders);
	const ready = jobs.filter((o) => o.status === "ready").length;
	const shown = jobs.filter((o) => !stage || o.status === stage);
	const confirm = selectToConfirm(appointments, now);
	const soon = confirm.groups.filter((g) => g.day === today || g.day === addDaysISO(today, 1)).reduce((n, g) => n + g.items.length, 0);
	const collect = selectToCollect(invoices, payments, today);
	const overdue = collect.groups.find((g) => g.key === "overdue")?.items.length ?? 0;
	// This month so far against the same days of last month (net, as Rapoarte).
	const monthStart = `${today.slice(0, 7)}-01`;
	const lastStart = addMonthsISO(monthStart, -1);
	const list = Object.values(invoices);
	const thisMonth = summarize(list, { from: monthStart, to: today }).net;
	const lastEnd = [addMonthsISO(today, -1), addDaysISO(monthStart, -1)].sort()[0];
	const before = summarize(list, { from: lastStart, to: lastEnd }).net;
	const change = before > 0 ? Math.round(((thisMonth - before) / before) * 100) : null;
	const openDays = settings.hours.days;
	const weekday = new Date(`${today}T12:00:00`).getDay();
	const dayLine = `${fmtDate(today, "EEEE, d MMMM")} · ${openDays.includes(weekday) ? `deschis ${settings.hours.open}–${settings.hours.close}` : "închis azi"}`;
	const newInvoice = () => router.push(`/invoices/detail/?id=${createInvoiceDraft().id}`);
	const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

	return (
		<Page width="narrow" className="space-y-5">
			<PageTitle title={greeting(new Date(now).getHours())} subtitle={<span className="first-letter:uppercase">{dayLine}</span>} />

			<section id="azi-shop" aria-label="În atelier" className="scroll-mt-16 space-y-3.5">
				<div className="flex items-end gap-3 px-1">
					<Link href="/work-orders/" className="min-w-0 flex-1">
						<span className="flex items-center gap-1 text-[20px] leading-[25px] font-bold">
							În atelier <ChevronRight className="size-5 text-muted-foreground" strokeWidth={3} aria-hidden />
						</span>
						{jobs.length > 0 && <span className="block text-[15px] text-muted-foreground">{jobs.length} {jobs.length === 1 ? "mașină" : "mașini"} · {ready > 0 ? `${ready} gata de predare` : "niciuna gata încă"}</span>}
					</Link>
					{jobs.length > 0 && (
						<DropdownMenu>
							<DropdownMenuTrigger className="flex h-9 items-center gap-1.5 px-1 text-[13px] font-semibold">
								<ListFilter className="size-4" aria-hidden /> {stage ? statusOf(stage).label : "Toate"}
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-56">
								<DropdownMenuItem onSelect={() => setStage(null)}>Toate · {jobs.length}</DropdownMenuItem>
								{ORDER.filter((key) => jobs.some((o) => o.status === key)).map((key) => (
									<DropdownMenuItem key={key} onSelect={() => setStage(key)}>
										{statusOf(key).label} · {jobs.filter((o) => o.status === key).length}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
				{jobs.length === 0 ? (
					<p className="rounded-[20px] bg-card px-4 py-3.5 text-[17px] text-muted-foreground">Nicio mașină în service acum.</p>
				) : (
					<Covers
						orders={shown}
						render={(order) => {
							const vehicle = vehicles[order.vehicleId];
							const customer = customers[order.customerId];
							const amount = gross(order);
							return (
								<CoverCard
									key={order.id}
									order={order}
									vehicle={vehicle}
									customer={customer}
									eyebrow={customer?.name || (vehicle ? "Fără client" : "Fără mașină")}
									detail={[staff[order.staffId]?.name, amount ? money(amount) : null].filter(Boolean).join(" · ")}
									onOpen={() => openSheet("work-order-view", { id: order.id })}
								/>
							);
						}}
					/>
				)}
			</section>

			<div className="grid grid-cols-3 gap-2.5">
				<QuickAction icon={CalendarPlus} title="Programare" onClick={() => openSheet("appointment")} />
				<QuickAction icon={Wrench} title="Lucrare" onClick={() => openSheet("checkin")} />
				<QuickAction icon={FilePlus2} title="Factură" onClick={newInvoice} />
			</div>

			<div className="grid grid-cols-2 gap-3">
				<IosStat label="În service" value={jobs.length} detail={ready > 0 ? `${ready} gata de predare` : "niciuna gata încă"} onClick={() => go("azi-shop")} />
				<IosStat label="De confirmat" value={confirm.total} detail={soon > 0 ? `${soon} azi și mâine` : "nimic urgent"} detailColor={soon > 0 ? STATE.wait : undefined} onClick={() => go("azi-confirm")} />
				<IosStat label="De încasat" value={money(collect.due)} detail={overdue > 0 ? `${overdue} ${overdue === 1 ? "restantă" : "restante"}` : "nimic restant"} detailColor={overdue > 0 ? STATE.late : undefined} onClick={() => go("azi-collect")} />
				<IosStat
					label={`Venit în ${fmtDate(monthStart, "MMMM")}`}
					value={money(thisMonth)}
					detail={change == null ? "fără TVA" : `${change >= 0 ? "+" : ""}${change}% față de ${fmtDate(lastStart, "MMM").replace(".", "")}`}
					detailColor={change == null ? undefined : change >= 0 ? STATE.ok : STATE.late}
					onClick={() => go("azi-analytics")}
				/>
			</div>

			<ToConfirm id="azi-confirm" confirm={confirm} today={today} customers={customers} vehicles={vehicles} />
			<ToCollect id="azi-collect" collect={collect} today={today} customers={customers} money={money} />
			<Analytics id="azi-analytics" today={today} settings={settings} />
		</Page>
	);
}

/** The covers in a row that snaps one at a time, with "1 / 13" and its bar under them. */
function Covers({ orders, render }) {
	const row = useRef(null);
	const [index, setIndex] = useState(0);
	const onScroll = () => {
		const el = row.current;
		if (!el) return;
		setIndex(Math.min(orders.length - 1, Math.max(0, Math.round(el.scrollLeft / (300 + 14)))));
	};
	const knob = Math.max(14, 110 / Math.max(1, orders.length));
	return (
		<div className="space-y-3.5">
			<div ref={row} onScroll={onScroll} className="-mx-4 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-5 [scrollbar-width:none]" style={{ scrollPaddingInline: 20 }}>
				{orders.map(render)}
			</div>
			{orders.length > 1 && (
				<div className="flex items-center justify-center gap-2.5" aria-label={`Mașina ${index + 1} din ${orders.length}`}>
					<span className="relative h-1 w-[110px] rounded-full bg-foreground/10">
						<span className="absolute top-0 h-1 rounded-full bg-foreground transition-[left] duration-200" style={{ width: knob, left: ((110 - knob) * index) / Math.max(1, orders.length - 1) }} />
					</span>
					<span className="text-[13px] text-muted-foreground tabular-nums">
						{index + 1} / {orders.length}
					</span>
				</div>
			)}
		</div>
	);
}

/** CoverCard (Covers.swift): 300 × 380 in the car's cover colour, the art with the logo, plate and state, the words, the next step. */
function CoverCard({ order, vehicle, customer, eyebrow, detail, onOpen }) {
	const make = vehicle?.make;
	const ink = makeInk(make);
	const status = statusOf(order.status);
	const action = primaryAction(order);
	const light = ink !== "#ffffff"; // a yellow make: dark ink, so the "…" darkens instead
	return (
		<article className="flex h-[380px] w-[300px] shrink-0 snap-start flex-col rounded-[34px] p-4" style={{ background: makeCover(make), color: ink }}>
			<button type="button" onClick={onOpen} className="flex flex-col gap-1 text-left outline-none">
				<span className="relative mb-2.5 flex h-[184px] items-center justify-center rounded-[24px]" style={{ background: `radial-gradient(circle at 100% 0, ${makeColor(make)} 4%, color-mix(in srgb, ${makeCover(make)} 75%, #000) 100%)` }}>
					<MakeLogo make={make} className="-translate-y-3.5 text-current" style={{ width: 76, height: 76 }} />
					<span translate="no" className="absolute top-3 left-3 rounded-full bg-black/30 px-[9px] py-1 text-[12px] font-semibold tracking-[0.04em] text-white tabular-nums">LUC #{order.number}</span>
					<span className="absolute top-3 right-3 rounded-full bg-black/30 px-[9px] py-1 text-[12px] font-semibold text-white">{status.label}</span>
					<CarLine car={vehicleName(vehicle)} plate={vehicle?.plate} className="absolute right-3 bottom-3 left-3 text-[15px]" />
				</span>
				<span className="truncate text-[13px] font-medium tracking-[0.03em] uppercase opacity-70">{eyebrow}</span>
				<span className="line-clamp-2 text-[20px] leading-[25px] font-semibold">{jobHeadline(order)}</span>
				<span className="truncate text-[15px] opacity-70">{detail}</span>
			</button>
			<span className="flex-1" />
			<div className="flex items-center gap-2.5">
				<button type="button" onClick={action ? action.run : onOpen} className="flex h-[50px] min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-white px-5 text-[17px] font-semibold text-black active:opacity-80">
					{action ? <action.icon className="size-5 shrink-0" aria-hidden /> : <ArrowUpRight className="size-5 shrink-0" aria-hidden />}
					<span className="truncate">{action ? action.label : "Deschide"}</span>
				</button>
				<JobMenu order={order} customer={customer} onOpen={onOpen}>
					<button type="button" aria-label="Mai multe" className={cn("flex size-[50px] shrink-0 items-center justify-center rounded-full", light ? "bg-black/20" : "bg-white/20")}>
						<MoreHorizontal className="size-5" aria-hidden />
					</button>
				</JobMenu>
			</div>
		</article>
	);
}

/** QuickAction: the symbol on a light orange square, its name under it. */
function QuickAction({ icon: Icon, title, onClick }) {
	return (
		<button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 rounded-[12px] bg-card py-3 active:opacity-70">
			<span className="flex size-10 items-center justify-center rounded-[12px] bg-brand/12 text-brand">
				<Icon className="size-[18px]" aria-hidden />
			</span>
			<span className="text-[12px] font-medium">{title}</span>
		</button>
	);
}

/** "Azi", "Mâine", "lun. 23", or "Au trecut". */
function groupLabel(group, today) {
	if (!group.day) return "Au trecut";
	if (group.day === today) return "Azi";
	if (group.day === addDaysISO(today, 1)) return "Mâine";
	return fmtDate(group.day, "EEE d").replace(".", "");
}

function ToConfirm({ id, confirm, today, customers, vehicles }) {
	const openDetail = useOpenDetail(); // a booking opens its sheet, as everywhere
	const week = confirm.week;
	const booked = Object.values(week).reduce((n, v) => n + v, 0) - (week.no_show ?? 0);
	const doConfirm = (a) => {
		try {
			setAppointmentStatus(a.id, "confirmed");
			toast.success("Confirmată");
		} catch (error) {
			toast.error(error.message);
		}
	};
	return (
		<section id={id} aria-label="De confirmat" className="scroll-mt-16 space-y-1.5 pt-2">
			<IosCaps>De confirmat</IosCaps>
			<ul className="overflow-hidden rounded-[20px] bg-card">
				{confirm.total === 0 && <li className="px-4 py-3.5 text-[17px] text-muted-foreground">Toate programările sunt confirmate.</li>}
				{confirm.groups.flatMap((g) =>
					g.items.map((a) => {
						const late = g.key === "past";
						const customer = customers[a.customerId];
						const vehicle = vehicles[a.vehicleId];
						return (
							<li key={a.id} className="flex items-center gap-3 px-4 py-2.5 [&+li]:border-t">
								<button type="button" onClick={() => openDetail("appointment", a.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
									<span className="flex w-12 shrink-0 flex-col gap-px">
										<span className="text-[15px] font-semibold tabular-nums">{fmtTime(a.start)}</span>
										<span className="truncate text-[12px] text-muted-foreground">{late ? "a trecut" : groupLabel(g, today).toLowerCase()}</span>
									</span>
									<span className="flex min-w-0 flex-col gap-[3px]">
										<span className="truncate text-[17px] leading-[22px]">{customer?.name ?? "Client necunoscut"}</span>
										<span className="truncate text-[15px] text-muted-foreground">{[a.title, vehicle?.plate && formatPlate(vehicle.plate)].filter(Boolean).join(" · ")}</span>
									</span>
								</button>
								<button type="button" onClick={() => (late ? openSheet("checkin", { appointmentId: a.id }) : doConfirm(a))} className="shrink-0 text-[17px] font-semibold text-brand active:opacity-60">
									{late ? "A sosit" : "Confirmă"}
								</button>
							</li>
						);
					}),
				)}
			</ul>
			{booked > 0 && <p className="px-4 text-[13px] text-muted-foreground">{booked - (week.scheduled ?? 0)} din {booked} confirmate în următoarele 7 zile.</p>}
		</section>
	);
}

function ToCollect({ id, collect, today, customers, money }) {
	const when = (item) => {
		if (item.state === "draft") {
			const n = item.invoice.createdAt ? diffDaysISO(dayOfInstant(item.invoice.createdAt), today) : 0;
			return n <= 0 ? "ciornă de azi" : `ciornă de ${n === 1 ? "o zi" : `${n} zile`}`;
		}
		if (item.state === "overdue") return `restantă de ${item.overdueDays === 1 ? "o zi" : `${item.overdueDays} zile`}`;
		if (item.dueIn == null) return fmtDate(item.invoice.issueDate, "d MMM yyyy");
		return item.dueIn === 0 ? "scadentă azi" : item.dueIn === 1 ? "scadentă mâine" : `scadentă în ${item.dueIn} zile`;
	};
	return (
		<section id={id} aria-label="De încasat" className="scroll-mt-16 space-y-1.5 pt-2">
			<IosCaps>De încasat</IosCaps>
			<ul className="overflow-hidden rounded-[20px] bg-card">
				{collect.total === 0 && <li className="px-4 py-3.5 text-[17px] text-muted-foreground">Toate facturile sunt încasate.</li>}
				{collect.groups.flatMap((g) =>
					g.items.map((item) => {
						const state = INVOICE_STATE[item.state];
						return (
							<li key={item.invoice.id} className="[&+li]:border-t">
								<Link href={`/invoices/detail/?id=${item.invoice.id}`} className="flex items-center gap-3 px-4 py-2.5 active:bg-foreground/[0.06]">
									<span className="flex min-w-0 flex-1 flex-col gap-[3px]">
										<span className="truncate text-[17px] leading-[22px]">
											{item.invoice.number == null ? "Ciornă" : formatInvoiceNumber(item.invoice.series, item.invoice.number)} · {customers[item.invoice.customerId]?.name ?? "Fără client"}
										</span>
										<span className="flex items-center gap-1.5">
											{state && <IosPill color={TONE_COLOR[state.tone]} className="h-5 rounded-full text-[12px] font-semibold">{state.label}</IosPill>}
											<span className="truncate text-[15px] text-muted-foreground">{when(item)}</span>
										</span>
									</span>
									<span className="shrink-0 text-[17px] font-semibold tabular-nums">{money(item.balance, 2)}</span>
								</Link>
							</li>
						);
					}),
				)}
			</ul>
			{collect.due > 0 && (
				<p className="px-4 text-[13px] text-muted-foreground">
					{money(collect.due, 2)} de încasat{collect.drafts > 0 ? ` · ${money(collect.drafts, 2)} în ciorne` : ""}.
				</p>
			)}
		</section>
	);
}

const compact = new Intl.NumberFormat("ro-RO", { notation: "compact", maximumFractionDigits: 1 });

/** Analiză: 7 zile · 30 de zile · 12 luni, two large tiles and four small ones, each with its line (MetricTile). */
function Analytics({ id, today, settings }) {
	const [period, setPeriod] = useState("7d");
	const data = selectHomeAnalytics(useCollection("payments"), useCollection("workOrders"), useCollection("invoices"), useCollection("appointments"), today, period);
	const { keys, unit } = data.window;
	const formatKey = (key, long) => (unit === "month" ? fmtDate(`${key}-01`, long ? "MMMM yyyy" : "MMM") : fmtDate(key, long ? "EEEE, d MMMM" : "d MMM"));
	const money = (value) => formatMoney(value, settings.currency, { decimals: 0 });
	const tile = (title, metric, format, big = false, integer = false) => (
		<div className={cn("flex min-w-0 flex-col gap-1.5 rounded-[18px] bg-card p-3.5")}>
			<span className="text-[15px] text-muted-foreground">{title}</span>
			<span className="flex items-baseline gap-1.5">
				<span className={cn("truncate font-semibold tabular-nums", big ? "text-[22px]" : "text-[17px]")}>{metric.empty || metric.value == null ? "—" : format(metric.value)}</span>
				<Change change={metric.change} />
			</span>
			{metric.empty ? (
				<span className="flex items-center justify-center text-[12px] text-muted-foreground/70" style={{ height: big ? 90 : 36 }}>
					Fără date
				</span>
			) : (
				<AreaChart points={metric.points} keys={keys} format={format} formatAxis={(v) => compact.format(big && title === "Încasări" ? v / 100 : v)} formatKey={formatKey} label={title} height={big ? 90 : 36} bare={!big} integer={integer} />
			)}
		</div>
	);
	return (
		<section id={id} aria-label="Analiză" className="scroll-mt-16 space-y-2.5 pt-2">
			<IosCaps>Analiză</IosCaps>
			<IosSegmented
				label="Perioada"
				value={period}
				onChange={setPeriod}
				options={[
					{ value: "7d", label: "7 zile" },
					{ value: "30d", label: "30 de zile" },
					{ value: "12m", label: "12 luni" },
				]}
			/>
			{tile("Încasări", data.collected, money, true)}
			{tile("Mașini primite", data.received, (v) => fmtNumber(v, 0), true, true)}
			<div className="grid grid-cols-2 gap-2.5">
				{tile("Bon mediu", data.ticket, money)}
				{tile("Prezență", data.show, (v) => `${fmtNumber(v * 100, 0)}%`)}
				{tile("Timp în service", data.stay, (v) => `${fmtNumber(v, 1)} zile`)}
				{tile("Ore facturate", data.hours, (v) => fmtHours(Math.round(v)))}
			</div>
		</section>
	);
}

/** ChangeBadge: ↗ / ↘ and how much, green when it went the good way. */
function Change({ change }) {
	if (!change) return null;
	const Icon = change.direction === "up" ? ArrowUpRight : change.direction === "down" ? ArrowDownRight : Minus;
	const amount = change.points ? `${fmtNumber(Math.abs(change.pct), 0)} pp` : `${fmtNumber(Math.abs(change.pct), 0)}%`;
	const color = change.good == null ? undefined : change.good ? STATE.ok : STATE.late;
	return (
		<span className="inline-flex items-center text-[12px] font-semibold tabular-nums" style={{ color: color ?? "var(--muted-foreground)" }}>
			<Icon className="size-3.5" aria-hidden />
			{change.direction === "flat" ? "0%" : amount}
		</span>
	);
}
