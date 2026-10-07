"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
	ArrowRight,
	BellRing,
	CalendarDays,
	CalendarPlus,
	CarFront,
	Clock,
	PackageSearch,
	Sparkles,
	Wallet,
	Wrench,
	Banknote,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ds/card";
import { Banner, EmptyState, Initials, Meter, Money, Stat } from "@/components/ds/data";
import { Page } from "@/components/ds/page";
import { ListPageSkeleton } from "@/components/ds/skeletons";
import { ToneBadge, ToneDot } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { minutesBetween } from "@/domain/dates";
import { stockLevel } from "@/domain/inventory";
import { formatPlate } from "@/domain/vehicle";
import { OPEN_STATUSES, byAttention } from "@/domain/work-order";
import { fmtDate, fmtTime, plural } from "@/lib/format";
import { REMINDER_TYPES, WORK_ORDER_STATUS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { tone } from "@/lib/tones";
import { useCollection, useIsReady, useSettings, useStoreValue, useToday } from "@/lib/store/hooks";
import {
	selectActive,
	selectAppointmentsByDay,
	selectInvoiceStates,
	selectReminders,
	selectReserved,
} from "@/lib/store/selectors";
import { AppointmentCard } from "@/features/calendar/appointment-card";
import { ShopCard } from "@/features/work-orders/shop-card";
import { useOpenDetail } from "@/lib/detail-mode";
import { useMinuteClock } from "@/lib/hooks";

// Cars shown before "show all": enough to cover everything late or waiting on us, without a wall of cards.
const SHOP_PREVIEW = 6;

function greeting() {
	const h = new Date().getHours();
	return h < 11 ? "Bună dimineața" : h < 18 ? "Bună ziua" : "Bună seara";
}

const REMINDER_TEXT = {
	itp: (r) => (r.days < 0 ? `ITP expirat de ${-r.days} zile` : `ITP expiră în ${r.days} zile`),
	rca: (r) => (r.days < 0 ? `RCA expirat de ${-r.days} zile` : `RCA expiră în ${r.days} zile`),
	service: () => "Revizie scadentă",
	unpaid: (r) => `Restanță de ${-r.days} zile`,
	pickup: (r) => `Gata de ${-r.days} zile, neridicată`,
	tomorrow: (r) => `Programat mâine la ${fmtTime(r.start)}`,
};

export function DashboardPage() {
	const ready = useIsReady();
	const today = useToday();
	const settings = useSettings();
	const demo = useStoreValue("demo");
	const appointments = useCollection("appointments");
	const workOrders = useCollection("workOrders");
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	const customers = useCollection("customers");
	const vehicles = useCollection("vehicles");
	const contacts = useCollection("contacts");
	const parts = useCollection("parts");
	const staffMap = useCollection("staff");
	const staff = selectActive(staffMap);
	const openDetail = useOpenDetail();
	const now = useMinuteClock();
	const [showAll, setShowAll] = useState(false);

	const reminders = selectReminders(today, vehicles, customers, invoices, payments, workOrders, appointments, contacts);

	const data = useMemo(() => {
		if (!today) return null;
		const todays = (selectAppointmentsByDay(appointments).get(today) ?? []).filter((a) => a.status !== "cancelled");
		const open = Object.values(workOrders).filter((o) => OPEN_STATUSES.includes(o.status));
		const byStatus = Object.fromEntries(OPEN_STATUSES.map((s) => [s, open.filter((o) => o.status === s)]));
		const shop = [...open].sort(byAttention(today));
		const states = selectInvoiceStates(invoices, payments, today);
		let outstanding = 0;
		let overdue = 0;
		let issuedToday = 0;
		for (const invoice of Object.values(invoices)) {
			const info = states.get(invoice.id);
			outstanding += info.balance;
			if (info.state === "overdue") overdue += 1;
			if (invoice.status !== "draft" && invoice.issueDate === today && !invoice.stornoOf) issuedToday += 1;
		}
		let collectedToday = 0;
		for (const p of Object.values(payments)) if (p.date === today) collectedToday += p.amount;
		const reserved = selectReserved(workOrders, invoices);
		const lowStock = Object.values(parts)
			.map((part) => ({ part, level: stockLevel(part, reserved.get(part.id) ?? 0) }))
			.filter((x) => x.level.status !== "ok")
			.sort((a, b) => a.level.available - b.level.available);
		const [openH, openM] = settings.hours.open.split(":").map(Number);
		const [closeH, closeM] = settings.hours.close.split(":").map(Number);
		const capacity = closeH * 60 + closeM - (openH * 60 + openM);
		const load = staff.map((s) => ({
			staff: s,
			minutes: todays.filter((a) => a.staffId === s.id && a.status !== "no_show").reduce((sum, a) => sum + minutesBetween(a.start, a.end), 0),
		}));
		const upcoming = todays.find((a) => ["scheduled", "confirmed"].includes(a.status) && a.start >= new Date().toISOString());
		return { todays, open, shop, byStatus, outstanding, overdue, issuedToday, collectedToday, lowStock, capacity, load, upcoming };
	}, [today, appointments, workOrders, invoices, payments, parts, staff, settings.hours]);

	if (!ready || !data) return <ListPageSkeleton stats rows={6} />;

	return (
		<Page width="wide">
			<header className="mb-6 flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="text-sm text-muted-foreground first-letter:uppercase">{fmtDate(today, "EEEE, d MMMM")}</p>
					<h1 className="text-[1.375rem] leading-7 font-semibold tracking-tight md:text-title">{greeting()}!</h1>
				</div>
				<div className="flex gap-2 max-md:w-full">
					<Button variant="outline" onClick={() => openSheet("appointment")} className="max-md:h-11 max-md:flex-1">
						<CalendarPlus /> Programare
					</Button>
					<Button onClick={() => openSheet("checkin")} className="max-md:h-11 max-md:flex-1">
						<Wrench /> Primire mașină
					</Button>
				</div>
			</header>

			{demo && (
				<Banner
					tone="yellow"
					icon={Sparkles}
					className="mb-6"
					title="Ești în modul demo"
					action={
						<Button asChild size="sm" variant="outline" className="bg-card">
							<Link href="/settings/#date">Începe cu datele tale</Link>
						</Button>
					}
				>
					Un service fictiv cu un an de istoric. Explorează liber — nimic nu pleacă din acest dispozitiv.
				</Banner>
			)}

			<div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
				<Stat
					label="În service acum"
					value={data.open.length}
					hint={plural(data.byStatus.ready.length, "mașină gata", "mașini gata")}
					icon={CarFront}
					tone="orange"
					href="/work-orders/"
				/>
				<Stat
					label="Programări azi"
					value={data.todays.length}
					hint={data.upcoming ? `Următoarea la ${fmtTime(data.upcoming.start)}` : "Nimic în așteptare"}
					icon={CalendarDays}
					tone="blue"
					href="/calendar/"
				/>
				<Stat label="Încasat azi" value={<Money value={data.collectedToday} decimals={0} />} hint={plural(data.issuedToday, "factură emisă", "facturi emise")} icon={Banknote} tone="green" href="/invoices/" />
				<Stat
					label="De încasat"
					value={<Money value={data.outstanding} decimals={0} />}
					hint={data.overdue ? plural(data.overdue, "restanță", "restanțe") : "Fără restanțe"}
					icon={Wallet}
					tone={data.overdue ? "red" : undefined}
					href="/invoices/"
				/>
			</div>

			<div className="grid gap-6 lg:grid-cols-3">
				<div className="min-w-0 space-y-6 lg:col-span-2">
					<Card>
						<CardHeader
							title="Programul de azi"
							icon={Clock}
							action={
								<Button asChild variant="ghost" size="sm">
									<Link href="/calendar/">
										Calendar <ArrowRight />
									</Link>
								</Button>
							}
						/>
						<CardContent className="pt-3">
							{data.todays.length ? (
								<ol className="space-y-2">
									{data.todays.map((a) => (
										<li key={a.id}>
											<AppointmentCard appointment={a} vehicle={vehicles[a.vehicleId]} customer={customers[a.customerId]} mechanic={staffMap[a.staffId]} dimPast />
										</li>
									))}
								</ol>
							) : (
								<EmptyState compact icon={CalendarDays} title="Nicio programare azi" action={<Button size="sm" onClick={() => openSheet("appointment")}>Adaugă programare</Button>} />
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader
							title="În service acum"
							icon={Wrench}
							action={
								<Button asChild variant="ghost" size="sm">
									<Link href="/work-orders/">
										Toate <ArrowRight />
									</Link>
								</Button>
							}
						/>
						<CardContent className="space-y-4 pt-3">
							<div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
								{OPEN_STATUSES.map((s) =>
									data.byStatus[s].length ? <span key={s} className={tone(WORK_ORDER_STATUS[s].tone).bar} style={{ flexGrow: data.byStatus[s].length }} /> : null,
								)}
							</div>
							<div className="flex flex-wrap gap-x-4 gap-y-1.5">
								{OPEN_STATUSES.map((s) => (
									<span key={s} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
										<ToneDot tone={WORK_ORDER_STATUS[s].tone} />
										{WORK_ORDER_STATUS[s].label}
										<span className="font-semibold text-foreground tabular-nums">{data.byStatus[s].length}</span>
									</span>
								))}
							</div>
							{/* Every car in the shop, most urgent first (see byAttention in the domain). */}
							<div className="grid gap-3 sm:grid-cols-2">
								{(showAll ? data.shop : data.shop.slice(0, SHOP_PREVIEW)).map((order) => (
									<ShopCard
										key={order.id}
										order={order}
										vehicle={vehicles[order.vehicleId]}
										customer={customers[order.customerId]}
										mechanic={staffMap[order.staffId]}
										settings={settings}
										today={today}
										now={now}
										onOpen={() => openDetail("work-order", order.id)}
									/>
								))}
							</div>
							{data.shop.length > SHOP_PREVIEW && (
								<Button variant="outline" className="w-full" onClick={() => setShowAll((v) => !v)}>
									{showAll ? "Arată doar cele urgente" : `Arată toate cele ${data.shop.length} lucrări`}
								</Button>
							)}
						</CardContent>
					</Card>
				</div>

				<div className="min-w-0 space-y-6">
					<Card>
						<CardHeader
							title="De contactat"
							icon={BellRing}
							description={plural(reminders.length, "client", "clienți")}
							action={
								<Button asChild variant="ghost" size="sm">
									<Link href="/reminders/">
										Toate <ArrowRight />
									</Link>
								</Button>
							}
						/>
						<CardContent className="pt-3">
							{reminders.length ? (
								<ul className="divide-y">
									{reminders.slice(0, 5).map((r) => {
										const meta = REMINDER_TYPES[r.type];
										const vehicle = vehicles[r.vehicleId];
										return (
											<li key={r.key}>
												<Link href="/reminders/" className="flex items-center gap-3 py-2.5">
													<ToneBadge tone={r.urgency === "expired" || r.urgency === "overdue" ? "red" : meta.tone} icon={meta.icon} size="sm">
														{meta.label}
													</ToneBadge>
													<div className="min-w-0 flex-1">
														<p className="truncate text-sm font-medium">{customers[r.customerId]?.name}</p>
														<p className="truncate text-xs text-muted-foreground">
															{REMINDER_TEXT[r.type](r)}
															{vehicle ? ` · ${formatPlate(vehicle.plate)}` : ""}
														</p>
													</div>
												</Link>
											</li>
										);
									})}
								</ul>
							) : (
								<p className="text-sm text-muted-foreground">Nimeni de contactat azi. 🎉</p>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader title="Încărcare azi" icon={Clock} description={`Program ${settings.hours.open}–${settings.hours.close}`} />
						<CardContent className="space-y-3 pt-3">
							{data.load.map(({ staff: s, minutes }) => {
								const pct = data.capacity ? minutes / data.capacity : 0;
								return (
									<div key={s.id} className="flex items-center gap-3">
										<Initials name={s.name} tone={s.color} size="sm" />
										<div className="min-w-0 flex-1">
											<div className="mb-1 flex justify-between text-xs">
												<span className="truncate font-medium">{s.name}</span>
												<span className="text-muted-foreground tabular-nums">{(minutes / 60).toLocaleString("ro-RO", { maximumFractionDigits: 1 })} h</span>
											</div>
											<Meter value={minutes} max={data.capacity} tone={pct > 1 ? "red" : pct > 0.8 ? "yellow" : "green"} label={s.name} />
										</div>
									</div>
								);
							})}
						</CardContent>
					</Card>

					<Card>
						<CardHeader
							title="Stoc de completat"
							icon={PackageSearch}
							action={
								<Button asChild variant="ghost" size="sm">
									<Link href="/catalog/?tab=parts">
										Stoc <ArrowRight />
									</Link>
								</Button>
							}
						/>
						<CardContent className="pt-3">
							{data.lowStock.length ? (
								<ul className="divide-y">
									{data.lowStock.slice(0, 5).map(({ part, level }) => (
										<li key={part.id} className="flex items-center justify-between gap-3 py-2">
											<span className="min-w-0 truncate text-sm">
												{part.name} <span className="text-muted-foreground">{part.brand}</span>
											</span>
											<ToneBadge tone={level.status === "out" ? "red" : "yellow"} size="sm">
												{level.available} {part.unit}
											</ToneBadge>
										</li>
									))}
								</ul>
							) : (
								<p className="text-sm text-muted-foreground">Stocul e în regulă.</p>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</Page>
	);
}
