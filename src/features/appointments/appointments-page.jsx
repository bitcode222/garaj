"use client";

import { useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { ArrowDownUp, CalendarCheck, CalendarClock, CalendarPlus, CalendarRange, CarFront, Gauge, UserRound, UserX, X } from "lucide-react";
import { EmptyState, Initials, Stat } from "@/components/ds/data";
import { FilterChips, SearchInput } from "@/components/ds/inputs";
import { useProgressive } from "@/components/ds/list";
import { MakeLogo, PlateTag } from "@/components/ds/make-logo";
import { Page, PageHeader, Toolbar } from "@/components/ds/page";
import { ListPageSkeleton } from "@/components/ds/skeletons";
import { StatusMenu } from "@/components/ds/status-menu";
import { SwipeRow } from "@/components/ds/swipe-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { bookingPassed } from "@/domain/agenda";
import { quickAppointmentMoves } from "@/domain/appointment";
import { PERIODS, STATUS_FILTERS, appointmentStats, groupByDay, listAppointments } from "@/domain/appointment-list";
import { addDaysISO, dayOfInstant, parseISODate } from "@/domain/dates";
import { queryTokens } from "@/domain/search";
import { formatPlate, vehicleName } from "@/domain/vehicle";
import { visitStage, visitTiming } from "@/domain/visit";
import { fmtDate, fmtHours, fmtNumber, fmtTime, fmtWorkOrder, plural } from "@/lib/format";
import { useNowMinute } from "@/lib/hooks";
import { APPOINTMENT_STATUS } from "@/lib/labels";
import { useOpenDetail } from "@/lib/detail-mode";
import { openSheet } from "@/lib/sheets";
import { callOffAppointmentById, restoreAppointment, setAppointmentStatus } from "@/lib/store/actions";
import { useCollection, useIsReady, useSettings, useToday } from "@/lib/store/hooks";
import { selectActive } from "@/lib/store/selectors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { contactSwipeActions } from "@/features/common/swipe-actions";
import { APPOINTMENT_ACTIONS, quickMoveAppointment } from "@/features/calendar/status";
import { atMinute } from "@/features/calendar/utils";
import { timingClass, timingText } from "@/features/dashboard/visit-ui";
import { ProgramariSwitch } from "./programari-switch";

const STATUS_LABEL = { all: "Toate", "to-confirm": "De confirmat", confirmed: "Confirmate", arrived: "Sosite", done: "Finalizate", no_show: "Neprezentate", cancelled: "Anulate" };
const STATUS_TONE = { "to-confirm": "yellow", confirmed: APPOINTMENT_STATUS.confirmed.tone, arrived: APPOINTMENT_STATUS.arrived.tone, done: APPOINTMENT_STATUS.done.tone, no_show: APPOINTMENT_STATUS.no_show.tone, cancelled: "neutral" };
const PERIOD_LABEL = { upcoming: "Viitoare", today: "Azi", next7: "Următoarele 7 zile", week: "Săptămâna aceasta", month: "Luna aceasta", past: "Trecute", all: "Toate datele", custom: "Interval" };
const SORT_LABEL = { time: "După oră", created: "După creare", customer: "După client" };
const SORTS = Object.keys(SORT_LABEL);

/** The columns from lg: # · when · car · customer · operations · mechanic · status · what to do. */
const COLS = "lg:grid-cols-[3.5rem_9.5rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_2rem_9rem_8.5rem]";

/** A booking as the calendar's visits are (with its job's stage), so "what the clock says" reads as everywhere else. */
const asVisit = (a, order) => ({ kind: "booking", appointment: a, order, stage: visitStage(a, order), start: a.start, end: a.end, day: dayOfInstant(a.start) });

function undoTo(previous) {
	return {
		label: "Anulează",
		onClick: () => {
			try {
				restoreAppointment(previous);
			} catch (error) {
				toast.error(error.message);
			}
		},
	};
}

/** Writes the filters into the address without a navigation (useSearchParams follows the history API). */
function writeParams(next) {
	const params = new URLSearchParams(window.location.search);
	for (const [key, value] of Object.entries(next)) {
		if (value == null || value === "" || value === DEFAULTS[key]) params.delete(key);
		else params.set(key, value);
	}
	const query = params.toString();
	window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}
const DEFAULTS = { status: "all", period: "upcoming", staff: "all", sort: "time", q: "", from: "", to: "" };

function Picker({ icon: Icon, label, value, options, onChange, disabled, hint }) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" className="max-md:h-11" disabled={disabled} title={hint} aria-label={`${label}: ${options.find((o) => o.value === value)?.label}`}>
					<Icon /> <span className="max-w-40 truncate">{options.find((o) => o.value === value)?.label}</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				<DropdownMenuLabel className="text-xs text-muted-foreground">{label}</DropdownMenuLabel>
				<DropdownMenuRadioGroup value={value} onValueChange={onChange}>
					{options.map((option) => (
						<DropdownMenuRadioItem key={option.value} value={option.value}>
							{option.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * Toate programările (docs/APPOINTMENTS-AND-NAV.md D6–D10): every booking in one list, with four
 * numbers on top (each one a filter), search, status chips with counts, period, mechanic and sort,
 * rows grouped under sticky day headers, and what can be done in one tap. The filters live in the
 * address, so Azi and the sidebar link straight into "De confirmat".
 */
export function AppointmentsPage() {
	const ready = useIsReady();
	const today = useToday();
	const minute = useNowMinute();
	const settings = useSettings();
	const openDetail = useOpenDetail();
	const params = useSearchParams();
	const appointmentsMap = useCollection("appointments");
	const customers = useCollection("customers");
	const vehicles = useCollection("vehicles");
	const services = useCollection("services");
	const workOrders = useCollection("workOrders");
	const staffMap = useCollection("staff");
	const staff = selectActive(staffMap);
	const read = (key, allowed) => {
		const value = params.get(key);
		return value != null && (!allowed || allowed.includes(value)) ? value : DEFAULTS[key];
	};
	const status = read("status", STATUS_FILTERS);
	const period = read("period", PERIODS);
	const staffFilter = read("staff");
	const sort = read("sort", SORTS);
	const customFrom = read("from");
	const customTo = read("to");
	const custom = { from: customFrom, to: customTo };
	const [query, setQuery] = useState(() => params.get("q") ?? "");
	const deferred = useDeferredValue(query);

	const now = today && minute != null ? atMinute(today, minute) : null;
	const appointments = Object.values(appointmentsMap);
	// One array per change of what it depends on: the progressive list starts over on a new one.
	const result = useMemo(
		() =>
			now
				? listAppointments(Object.values(appointmentsMap), {
						status,
						period,
						custom: { from: customFrom, to: customTo },
						staff: staffFilter,
						tokens: queryTokens(deferred),
						sort,
						today,
						now,
						lookups: { customers, vehicles, services },
					})
				: { rows: [], counts: {} },
		[appointmentsMap, status, period, customFrom, customTo, staffFilter, deferred, sort, today, now, customers, vehicles, services],
	);
	const { visible, hasMore, sentinelRef } = useProgressive(result.rows, 60);

	if (!ready || !now) return <ListPageSkeleton stats rows={8} />;

	const stats = appointmentStats(appointments, { today, now, staff, hours: settings.hours });
	const set = (next) => writeParams(next);
	const filtered = status !== "all" || period !== "upcoming" || staffFilter !== "all" || deferred;
	const groups = sort === "time" ? groupByDay(visible) : [{ day: null, items: visible, minutes: 0 }];
	const staffOptions = [{ value: "all", label: "Toți mecanicii" }, ...staff.map((s) => ({ value: s.id, label: s.name })), { value: "none", label: "Nealocat" }];

	const confirm = (a) => {
		try {
			setAppointmentStatus(a.id, "confirmed");
			toast.success(`${a.number != null ? `Programarea #${a.number}` : "Programarea"}: confirmată`, { action: undoTo(a) });
		} catch (error) {
			toast.error(error.message);
		}
	};
	const noShow = (a) => {
		try {
			const { previous } = callOffAppointmentById(a.id, { to: "no_show" });
			toast.success(`${a.number != null ? `Programarea #${a.number}` : "Programarea"}: marcată neprezentat`, { action: undoTo(previous) });
		} catch (error) {
			toast.error(error.message);
		}
	};

	return (
		<Page>
			<PageHeader
				title="Programări"
				description={plural(result.counts.all ?? 0, "programare", "programări") + ` · ${PERIOD_LABEL[period].toLowerCase()}`}
				actions={
					<>
						<ProgramariSwitch current="/appointments/" className="max-sm:w-full" />
						<Button onClick={() => openSheet("appointment")} className="max-md:hidden">
							<CalendarPlus /> Programare nouă
						</Button>
					</>
				}
			/>

			<div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
				<Stat label="Azi" value={stats.today.count} hint={stats.today.next ? `Următoarea la ${fmtTime(stats.today.next.start)}` : "Nimic în așteptare"} icon={CalendarClock} tone="blue" href="/appointments/?period=today" />
				<Stat label="De confirmat" value={stats.toConfirm} hint="în următoarele 7 zile" icon={CalendarCheck} tone={stats.toConfirm ? "yellow" : undefined} href="/appointments/?status=to-confirm" />
				<Stat label="Neprezentări" value={stats.noShow == null ? "–" : `${fmtNumber(stats.noShow * 100, 0)}%`} hint="din programări, 30 de zile" icon={UserX} tone={stats.noShow > 0.1 ? "red" : undefined} href="/appointments/?status=no_show&period=past" />
				<Stat
					label="Încărcare săptămâna aceasta"
					value={stats.load.share == null ? "–" : `${fmtNumber(stats.load.share * 100, 0)}%`}
					hint={`${fmtHours(Math.round(stats.load.booked / 60))} din ${fmtHours(Math.round(stats.load.capacity / 60))}`}
					icon={Gauge}
					tone={stats.load.share > 0.9 ? "red" : stats.load.share > 0.75 ? "yellow" : undefined}
					href="/appointments/?period=week"
				/>
			</div>

			<Toolbar className="flex-col items-stretch md:flex-row md:items-center">
				<SearchInput
					value={query}
					onChange={(value) => {
						setQuery(value);
						set({ q: value });
					}}
					placeholder="Client, mașină, telefon, #nr, operație…"
					className="md:w-80"
				/>
				<div className="flex flex-wrap items-center gap-2">
					<Picker
						icon={CalendarRange}
						label="Perioada"
						value={status === "to-confirm" ? "next7" : period}
						options={PERIODS.map((value) => ({ value, label: PERIOD_LABEL[value] }))}
						onChange={(value) => set({ period: value })}
						disabled={status === "to-confirm"}
						hint={status === "to-confirm" ? "„De confirmat” are perioada lui: următoarele 7 zile și cele trecute fără răspuns" : undefined}
					/>
					{staff.length > 1 && <Picker icon={UserRound} label="Mecanic" value={staffFilter} options={staffOptions} onChange={(value) => set({ staff: value })} />}
					<Picker icon={ArrowDownUp} label="Sortare" value={sort} options={SORTS.map((value) => ({ value, label: SORT_LABEL[value] }))} onChange={(value) => set({ sort: value })} />
					{filtered && (
						<Button
							variant="ghost"
							className="max-md:h-11"
							onClick={() => {
								setQuery("");
								set({ ...DEFAULTS });
							}}
						>
							<X /> Șterge filtrele
						</Button>
					)}
				</div>
			</Toolbar>
			{period === "custom" && status !== "to-confirm" && (
				<div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
					<span className="text-muted-foreground">De la</span>
					<Input type="date" value={custom.from} max={custom.to || undefined} onChange={(event) => set({ from: event.target.value })} className="w-auto" aria-label="De la data" />
					<span className="text-muted-foreground">până la</span>
					<Input type="date" value={custom.to} min={custom.from || undefined} onChange={(event) => set({ to: event.target.value })} className="w-auto" aria-label="Până la data" />
				</div>
			)}
			<FilterChips className="mb-4" value={status} onChange={(value) => set({ status: value })} options={STATUS_FILTERS.map((value) => ({ value, label: STATUS_LABEL[value], tone: STATUS_TONE[value], count: result.counts[value] ?? 0 }))} />

			{result.rows.length === 0 ? (
				<EmptyState
					icon={CalendarClock}
					title={filtered ? "Nicio programare pentru filtrele alese" : "Nicio programare viitoare"}
					description={filtered ? "Schimbă căutarea, perioada sau starea." : "Programează o mașină, sau trage pe calendar un interval liber."}
					action={
						filtered ? (
							<Button
								variant="outline"
								onClick={() => {
									setQuery("");
									set({ ...DEFAULTS });
								}}
							>
								<X /> Șterge filtrele
							</Button>
						) : (
							<Button onClick={() => openSheet("appointment")}>
								<CalendarPlus /> Programare nouă
							</Button>
						)
					}
				/>
			) : (
				<div className="overflow-clip rounded-xl border bg-card">
					<div role="row" className={cn("hidden border-b bg-muted/40 px-4 py-2 text-2xs font-medium tracking-wider text-muted-foreground uppercase lg:grid lg:gap-3", COLS)}>
						<span>#</span>
						<span>Când</span>
						<span>Mașină</span>
						<span>Client</span>
						<span>Operații</span>
						<span aria-label="Mecanic" />
						<span>Stare</span>
						<span />
					</div>
					{groups.map((group) => (
						<section key={group.day ?? "all"} aria-label={group.day ? fmtDate(group.day, "EEEE, d MMMM") : "Programări"}>
							{group.day && (
								<h2 className="sticky top-[calc(3.5rem+var(--safe-top))] z-10 flex flex-wrap items-baseline gap-x-2 border-b bg-card/95 px-4 py-2 text-xs backdrop-blur md:top-0">
									<span className="font-semibold tracking-wider uppercase">{dayName(group.day, today)}</span>
									<span className="text-muted-foreground first-letter:uppercase">{fmtDate(group.day, "EEEE, d MMMM")}</span>
									<span className="text-muted-foreground">
										· {plural(group.items.length, "programare", "programări")}
										{group.minutes ? ` · ${fmtHours(group.minutes / 60)}` : ""}
										{!settings.hours.days.includes(parseISODate(group.day).getDay()) ? " · închis" : ""}
									</span>
								</h2>
							)}
							<ul className="divide-y">
								{group.items.map((a) => (
									<Row
										key={a.id}
										appointment={a}
										now={now}
										customer={customers[a.customerId]}
										vehicle={vehicles[a.vehicleId]}
										mechanic={staffMap[a.staffId]}
										order={a.workOrderId ? workOrders[a.workOrderId] : null}
										operations={(a.operations?.length ? a.operations.map((op) => op.name) : (a.serviceIds ?? []).map((id) => services[id]?.name)).filter(Boolean)}
										showDay={!group.day}
										onOpen={() => openDetail("appointment", a.id)}
										onOrder={(id) => openDetail("work-order", id)}
										onConfirm={() => confirm(a)}
										onNoShow={() => noShow(a)}
									/>
								))}
							</ul>
						</section>
					))}
					{hasMore && <div ref={sentinelRef} className="h-10" aria-hidden />}
				</div>
			)}
		</Page>
	);
}

/** "Azi", "Mâine", "Ieri", or nothing (the date beside it says it). */
function dayName(day, today) {
	if (day === today) return "Azi";
	if (day === addDaysISO(today, 1)) return "Mâine";
	if (day === addDaysISO(today, -1)) return "Ieri";
	return fmtDate(day, "EEE");
}

function Row({ appointment: a, now, customer, vehicle, mechanic, order, operations, showDay, onOpen, onOrder, onConfirm, onNoShow }) {
	const visit = asVisit(a, order);
	const timing = visit.stage ? timingText(visitTiming(visit, now)) : null;
	const passed = bookingPassed(a, now);
	const toConfirm = a.status === "scheduled" && !passed;
	const car = vehicleName(vehicle);
	const when = `${showDay ? `${fmtDate(a.start, "d MMM")} · ` : ""}${fmtTime(a.start)}–${fmtTime(a.end)}`;
	const action = order ? (
		<Button size="sm" variant="ghost" className="max-md:h-11" onClick={() => onOrder(order.id)}>
			Lucrarea {fmtWorkOrder(order.number)}
		</Button>
	) : passed ? (
		<span className="flex gap-1">
			<Button size="sm" variant="outline" className="max-md:h-11" onClick={() => openSheet("checkin", { appointmentId: a.id })} aria-label={`A sosit: ${car || "programarea"}. Deschide primirea.`}>
				<CarFront /> A sosit
			</Button>
			<Button size="icon" variant="ghost" className="size-11 md:size-8" onClick={onNoShow} aria-label={`Neprezentat: ${car || "programarea"}`} title="Neprezentat">
				<UserX />
			</Button>
		</span>
	) : toConfirm ? (
		<Button size="sm" variant="outline" className="max-md:h-11" onClick={onConfirm} aria-label={`Confirmă: ${car || "programarea"}, ${when}`}>
			<CalendarCheck /> Confirmă
		</Button>
	) : null;
	const status = (
		<StatusMenu
			map={APPOINTMENT_STATUS}
			value={a.status}
			moves={quickAppointmentMoves(a.status)}
			onMove={(to) => quickMoveAppointment(a, to)}
			subject={a.number != null ? `Programarea #${a.number}` : "Programarea"}
			actions={APPOINTMENT_ACTIONS}
			destructive={["cancelled", "no_show"]}
			size="sm"
		/>
	);
	const trailing = toConfirm ? [{ key: "confirm", label: "Confirmă", icon: CalendarCheck, tone: "purple", onSelect: onConfirm }] : [];
	return (
		<li data-row-appointment={a.id}>
			<SwipeRow leading={contactSwipeActions(customer?.phone)} trailing={trailing}>
				{/* The row opens the booking; its buttons do their own thing. */}
				<div
					role="button"
					tabIndex={0}
					onClick={(event) => !event.target.closest("button, a, [role=menuitem]") && onOpen()}
					onKeyDown={(event) => event.target === event.currentTarget && (event.key === "Enter" || event.key === " ") && (event.preventDefault(), onOpen())}
					aria-label={[a.number != null ? `Programarea #${a.number}` : "Programare", when, car, customer?.name, APPOINTMENT_STATUS[a.status].label, timing?.text].filter(Boolean).join(" · ")}
					className={cn("grid cursor-pointer gap-x-3 gap-y-1 px-4 py-3 text-sm transition-colors outline-none hover:bg-accent/40 focus-visible:bg-accent/60 lg:items-center", COLS, a.status === "cancelled" && "opacity-60")}
				>
					{/* phone and tablet: two lines and the status */}
					<div className="flex min-w-0 items-start gap-3 lg:hidden">
						<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
							<MakeLogo make={vehicle?.make} className="size-4" />
						</span>
						<span className="min-w-0 flex-1">
							<span className="flex items-baseline justify-between gap-2">
								<span className="truncate font-medium">
									<span className="tabular-nums">{when}</span> · {car || customer?.name || "Programare"}
								</span>
								{status}
							</span>
							<span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
								{a.number != null && <span className="shrink-0 font-mono tabular-nums">#{a.number}</span>}
								{vehicle?.plate && <span className="shrink-0 font-mono whitespace-nowrap">{formatPlate(vehicle.plate)}</span>}
								<span className="truncate">{[customer?.name, operations.join(", ")].filter(Boolean).join(" · ")}</span>
							</span>
							{(timing || action) && (
								<span className="mt-1.5 flex items-center justify-between gap-2">
									<span className={cn("text-xs", timingClass(timing?.mark))}>{timing?.text}</span>
									{action}
								</span>
							)}
						</span>
					</div>
					{/* desktop columns */}
					<span className="hidden font-mono text-xs text-muted-foreground tabular-nums lg:block">{a.number != null ? `#${a.number}` : "—"}</span>
					<span className="hidden min-w-0 lg:block">
						<span className="block font-medium tabular-nums">{when}</span>
						{timing && <span className={cn("block truncate text-xs", timingClass(timing.mark))}>{timing.text}</span>}
					</span>
					<span className="hidden min-w-0 items-center gap-2.5 lg:flex">
						<MakeLogo make={vehicle?.make} className="size-4" />
						<span className="min-w-0">
							<span className="block truncate font-medium">{car || "—"}</span>
							{vehicle?.plate && <PlateTag value={vehicle.plate} className="mt-0.5" />}
						</span>
					</span>
					<span className="hidden min-w-0 lg:block">
						<span className="block truncate">{customer?.name ?? "—"}</span>
						{customer?.phone && <span className="block truncate text-xs text-muted-foreground tabular-nums">{customer.phone}</span>}
					</span>
					<span className="hidden min-w-0 truncate text-muted-foreground lg:block" title={operations.join(", ")}>
						{operations.join(", ") || a.title || "—"}
					</span>
					<span className="hidden lg:block" title={mechanic?.name ?? "Nealocat"}>
						{mechanic ? <Initials name={mechanic.name} tone={mechanic.color} size="sm" /> : <span className="text-muted-foreground">–</span>}
					</span>
					<span className="hidden lg:block">{status}</span>
					<span className="hidden justify-end lg:flex">{action}</span>
				</div>
			</SwipeRow>
		</li>
	);
}

