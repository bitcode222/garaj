"use client";

import { CalendarCheck, CalendarDays, Check, ChevronRight, ListFilter, Plus } from "lucide-react";
import { PageTitle } from "@/components/ds/blocks";
import { IosChip, IosChipRow, IosEmpty, IosPill, IosSearchField, IosSegmented, IosStat } from "@/components/ds/ios";
import { NavIcon } from "@/components/ds/nav-bar";
import { Page } from "@/components/ds/page";
import { SwipeRow } from "@/components/ds/swipe-row";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { bookingPassed } from "@/domain/agenda";
import { PERIODS, STATUS_FILTERS } from "@/domain/appointment-list";
import { addDaysISO, dayOfInstant, minutesBetween } from "@/domain/dates";
import { formatPlate, vehicleName } from "@/domain/vehicle";
import { STATE, TONE_COLOR } from "@/lib/colors";
import { fmtDate, fmtNumber, fmtTime } from "@/lib/format";
import { APPOINTMENT_STATUS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { cn } from "@/lib/utils";
import { contactSwipeActions } from "@/features/common/swipe-actions";

// Agendă · Listă on a phone, as the iPhone app's (ios-native/Garaj/Views/AppointmentsView.swift): the large title with
// the filters and "+", Listă · Calendar, the four numbers (a tap filters), a chip per state, then the bookings by day.

const STATUS_LABEL = { all: "Toate", "to-confirm": "De confirmat", confirmed: "Confirmate", arrived: "Sosite", done: "Finalizate", no_show: "Neprezentate", cancelled: "Anulate" };
const PERIOD_LABEL = { upcoming: "De azi înainte", today: "Azi", next7: "Următoarele 7 zile", week: "Săptămâna asta", month: "Luna asta", past: "Trecute", all: "Toate", custom: "Interval" };
const SORT_LABEL = { time: "După oră", created: "Cele mai noi", customer: "După client" };

/** "45 min", "2 h", "1 h 30 min" (DayHeader.duration). */
const duration = (m) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`);

/** "Azi · marți, 17 noiembrie", or the date alone. */
function dayTitle(day, today) {
	const name = day === today ? "Azi" : day === addDaysISO(today, 1) ? "Mâine" : day === addDaysISO(today, -1) ? "Ieri" : null;
	const date = fmtDate(day, "EEEE, d MMMM");
	return name ? `${name} · ${date}` : date;
}

export function PhoneAppointments({ result, groups, counts, stats, status, period, staffFilter, sort, staff, set, query, setQuery, today, now, customers, vehicles, staffMap, hasMore, sentinelRef, onOpen, onConfirm }) {
	const plain = period === "upcoming" && staffFilter === "all" && sort === "time";
	const pick = (title, key, options, value) => (
		<>
			<DropdownMenuLabel className="text-xs text-muted-foreground">{title}</DropdownMenuLabel>
			{options.map(([v, label]) => (
				<DropdownMenuItem key={v} onSelect={() => set({ [key]: v })}>
					<Check className={cn(value !== v && "opacity-0")} /> {label}
				</DropdownMenuItem>
			))}
		</>
	);
	const actions = (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<NavIcon label="Filtre">
						<ListFilter className={cn(!plain && "text-brand")} />
					</NavIcon>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-60">
					{pick("Perioada", "period", PERIODS.filter((p) => p !== "custom").map((p) => [p, PERIOD_LABEL[p]]), period)}
					<DropdownMenuSeparator />
					{pick("Mecanic", "staff", [["all", "Toți mecanicii"], ...staff.map((s) => [s.id, s.name]), ["none", "Fără mecanic"]], staffFilter)}
					<DropdownMenuSeparator />
					{pick("Ordine", "sort", Object.entries(SORT_LABEL), sort)}
				</DropdownMenuContent>
			</DropdownMenu>
			<NavIcon label="Programare nouă" onClick={() => openSheet("appointment")}>
				<Plus />
			</NavIcon>
		</>
	);
	const next = stats.today.next;
	return (
		<Page width="narrow" className="space-y-4">
			<PageTitle title="Agendă" actions={actions} />
			<IosSegmented
				label="Vedere"
				value="list"
				options={[
					{ value: "list", label: "Listă", href: "/appointments/" },
					{ value: "calendar", label: "Calendar", href: "/calendar/" },
				]}
			/>
			<IosSearchField value={query} onChange={setQuery} placeholder="Număr, client, telefon, mașină" />
			{!query && (
				<>
					<div className="grid grid-cols-2 gap-3 pt-1">
						<IosStat label="Azi" value={stats.today.count} detail={next ? `următoarea la ${fmtTime(next.start)}` : "nimic de acum încolo"} onClick={() => set({ status: "all", period: "today" })} />
						<IosStat label="De confirmat" value={stats.toConfirm} detail="7 zile + întârziate" detailColor={stats.toConfirm > 0 ? STATE.wait : undefined} onClick={() => set({ status: "to-confirm" })} />
						<IosStat label="Neprezentări" value={stats.noShow == null ? "—" : `${fmtNumber(stats.noShow * 100, 0)}%`} detail="ultimele 30 de zile" onClick={() => set({ status: "no_show", period: "past" })} />
						<IosStat
							label="Ocupare"
							value={stats.load.share == null ? "—" : `${fmtNumber(stats.load.share * 100, 0)}%`}
							detail={`săptămâna asta, ${Math.floor(stats.load.booked / 60)} h din ${Math.floor(stats.load.capacity / 60)} h`}
							onClick={() => set({ status: "all", period: "week" })}
						/>
					</div>
					<IosChipRow label="Stare">
						{STATUS_FILTERS.map((key) => (
							<IosChip key={key} title={STATUS_LABEL[key]} count={counts[key] ?? 0} on={status === key} onClick={() => set({ status: key })} />
						))}
					</IosChipRow>
				</>
			)}
			{result.rows.length === 0 ? (
				query ? (
					<IosEmpty title={`Niciun rezultat pentru „${query}”`} className="pt-8">Verifică ce ai scris sau încearcă altceva.</IosEmpty>
				) : (
					<IosEmpty icon={CalendarDays} title="Nicio programare" className="pt-8">
						Nimic pentru „{STATUS_LABEL[status]}” în „{PERIOD_LABEL[period]}”.
					</IosEmpty>
				)
			) : (
				groups.map((group) => (
					<section key={group.day ?? "all"} className="space-y-1.5 pt-2" aria-label={group.day ? fmtDate(group.day, "EEEE, d MMMM") : "Programări"}>
						{group.day && (
							<h2 className="flex justify-between px-4 text-[13px] text-muted-foreground uppercase">
								<span>{dayTitle(group.day, today)}</span>
								{group.minutes > 0 && <span className="tabular-nums">{duration(group.minutes)}</span>}
							</h2>
						)}
						<ul className="overflow-hidden rounded-[20px] bg-card">
							{group.items.map((a, i) => (
								<li key={a.id} className={cn(i > 0 && "border-t [border-image:linear-gradient(to_right,transparent_16px,var(--border)_16px)_1]")}>
									<PhoneRow appointment={a} now={now} customer={customers[a.customerId]} vehicle={vehicles[a.vehicleId]} mechanic={staffMap[a.staffId]} showDay={!group.day} onOpen={() => onOpen(a)} onConfirm={() => onConfirm(a)} />
								</li>
							))}
						</ul>
					</section>
				))
			)}
			{hasMore && <div ref={sentinelRef} className="h-10" aria-hidden />}
		</Page>
	);
}

/** AppointmentRow: the time and its length, the client, plate · what for, the state and the mechanic, the number. */
function PhoneRow({ appointment: a, now, customer, vehicle, mechanic, showDay, onOpen, onConfirm }) {
	const status = APPOINTMENT_STATUS[a.status];
	const length = Math.max(0, minutesBetween(a.start, a.end));
	const toConfirm = a.status === "scheduled" && !bookingPassed(a, now);
	const trailing = toConfirm ? [{ key: "confirm", label: "Confirmă", icon: CalendarCheck, tone: "green", onSelect: onConfirm }] : [];
	return (
		<SwipeRow leading={contactSwipeActions(customer?.phone)} trailing={trailing}>
			<button type="button" onClick={onOpen} className={cn("flex w-full items-start gap-3 bg-card px-4 py-3 text-left active:bg-foreground/[0.06]", a.status === "cancelled" && "opacity-60")}>
				<span className="flex w-12 shrink-0 flex-col gap-px">
					<span className="text-[15px] font-semibold tabular-nums">{fmtTime(a.start)}</span>
					<span className="truncate text-[12px] text-muted-foreground">{showDay ? fmtDate(dayOfInstant(a.start), "d MMM") : duration(length)}</span>
				</span>
				<span className="flex min-w-0 flex-1 flex-col gap-[3px]">
					<span className="truncate text-[17px] leading-[22px]">{customer?.name ?? "Client necunoscut"}</span>
					<span className="truncate text-[15px] text-muted-foreground">{[vehicle?.plate && formatPlate(vehicle.plate), a.title || vehicleName(vehicle)].filter(Boolean).join(" · ")}</span>
					<span className="flex items-center gap-1.5 pt-0.5">
						{status && <IosPill color={TONE_COLOR[status.tone]} className="h-5 rounded-full text-[12px] font-semibold">{status.label}</IosPill>}
						{mechanic && <span className="truncate text-[12px] text-muted-foreground">{mechanic.name}</span>}
					</span>
				</span>
				{a.number != null && <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">#{a.number}</span>}
				<ChevronRight className="size-[18px] shrink-0 self-center text-muted-foreground/60" strokeWidth={2.5} aria-hidden />
			</button>
		</SwipeRow>
	);
}
