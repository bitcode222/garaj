"use client";

import { useMemo, useState } from "react";
import {
	CalendarPlus,
	CalendarRange,
	ChevronLeft,
	ChevronRight,
	Columns3,
	Filter,
	Grid2X2,
	Grid3X3,
	Rows3,
	Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ds/confirm";
import { Initials } from "@/components/ds/data";
import { Segmented } from "@/components/ds/inputs";
import { ToneBadge, ToneDot } from "@/components/ds/tone";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dayOfInstant, minutesBetween, parseISODate } from "@/domain/dates";
import { fmtDate, fmtTime, plural } from "@/lib/format";
import { APPOINTMENT_STATUS } from "@/lib/labels";
import { useOpenDetail } from "@/lib/detail-mode";
import { openSheet } from "@/lib/sheets";
import { moveAppointment, saveAppointment, updateSettings } from "@/lib/store/actions";
import { useLocalPreference } from "@/lib/hooks";
import { useCollection, useIsReady, useSettings, useToday } from "@/lib/store/hooks";
import { selectActive, selectAppointmentsByDay } from "@/lib/store/selectors";
import { cn } from "@/lib/utils";
import { TimeGrid } from "./time-grid";
import { AgendaView, MonthView, YearView } from "./views";
import { eventTone, navigate, rangeLabel, timeBounds, viewRange, weekDays } from "./utils";

const VIEWS = [
	{ value: "agenda", label: "Agendă", icon: CalendarRange },
	{ value: "day", label: "Zi", icon: Rows3 },
	{ value: "week", label: "Săptămână", icon: Columns3 },
	{ value: "month", label: "Lună", icon: Grid3X3 },
	{ value: "year", label: "An", icon: Grid2X2 },
];
const VIEW_KEY = "garaj.calendar.view";

/** The original "Today" button: month strip over the day number. */
function TodayTile({ today, onClick }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex size-12 shrink-0 md:size-14 flex-col overflow-hidden rounded-lg border bg-card text-center transition-transform active:scale-95"
			aria-label="Mergi la azi"
		>
			<span className="bg-primary py-1 text-2xs font-semibold tracking-wide text-primary-foreground uppercase">{fmtDate(today, "MMM").replace(".", "")}</span>
			<span className="flex flex-1 items-center justify-center text-lg font-bold tabular-nums">{Number(today.slice(8))}</span>
		</button>
	);
}

export function CalendarPage() {
	const ready = useIsReady();
	const today = useToday();
	const confirm = useConfirm();
	const openDetail = useOpenDetail();
	const settings = useSettings();
	const prefs = settings.calendar;
	const appointments = useCollection("appointments");
	const staffMap = useCollection("staff");
	const customers = useCollection("customers");
	const vehicles = useCollection("vehicles");
	const services = useCollection("services");
	const staff = selectActive(staffMap);
	const [view, setView] = useLocalPreference(VIEW_KEY, "day", VIEWS.map((v) => v.value));
	const [picked, setPicked] = useState(null);
	const date = picked ?? today;
	const setDate = setPicked;
	const changeView = setView;
	const [staffFilter, setStaffFilter] = useState("all");
	const [hiddenStatuses, setHiddenStatuses] = useState(() => new Set(["cancelled"]));

	const lookups = { staff: staffMap, customers, vehicles, services };
	const toneOf = (a) => eventTone(a, prefs.colorBy, lookups);
	const setPref = (patch) => updateSettings({ calendar: { ...prefs, ...patch } });

	const byDayAll = selectAppointmentsByDay(appointments);
	const byDay = useMemo(() => {
		const map = new Map();
		for (const [day, list] of byDayAll) {
			const kept = list.filter((a) => !hiddenStatuses.has(a.status) && (staffFilter === "all" || a.staffId === staffFilter));
			if (kept.length) map.set(day, kept);
		}
		return map;
	}, [byDayAll, hiddenStatuses, staffFilter]);

	if (!ready || !date || !today) {
		return (
			<div className="flex h-[calc(100dvh-3.5rem-var(--safe-top)-var(--tabbar-h)-var(--safe-bottom))] flex-col gap-3 p-4 md:h-dvh md:p-6">
				<Skeleton className="h-16 w-full rounded-xl" />
				<Skeleton className="w-full flex-1 rounded-xl" />
			</div>
		);
	}

	const range = viewRange(view === "agenda" ? "month" : view, date);
	const inRange = [];
	for (const [day, list] of byDay) if (day >= range.from && day <= range.to) inRange.push(...list);
	inRange.sort((a, b) => (a.start < b.start ? -1 : 1));
	const countRange = view === "agenda" ? viewRange("agenda", date) : range;
	const count = inRange.filter((a) => {
		const d = dayOfInstant(a.start);
		return d >= countRange.from && d <= countRange.to;
	}).length;

	const create = ({ start, staffId } = {}) => openSheet("appointment", { start, staffId });
	const open = (a) => openDetail("appointment", a.id);

	const move = async (a, { start, end, staffId }) => {
		const previous = { start: a.start, end: a.end, staffId: a.staffId };
		const nextStaff = staffId === undefined ? a.staffId : staffId;
		if (prefs.confirmDrop) {
			const ok = await confirm({
				title: "Muți programarea?",
				description: `${a.title}: ${fmtDate(a.start, "d MMM")} ${fmtTime(a.start)} → ${fmtDate(start, "d MMM")} ${fmtTime(start)}`,
				confirmLabel: "Mută",
			});
			if (!ok) return;
		}
		try {
			const { conflicts } = nextStaff !== a.staffId ? saveAppointment({ ...a, start, end, staffId: nextStaff }) : moveAppointment(a.id, start, end);
			toast.success(`Mutată: ${fmtDate(start, "EEE d MMM")}, ${fmtTime(start)}–${fmtTime(end)}`, {
				description: conflicts.length ? "Atenție: se suprapune cu altă programare." : undefined,
				action: { label: "Anulează", onClick: () => saveAppointment({ ...a, ...previous }) },
			});
		} catch (error) {
			toast.error(error.message);
		}
	};

	let body;
	if (view === "day" || view === "week") {
		const days = view === "day" ? [date] : weekDays(date).filter((d, i) => i < 6 || (byDay.get(d)?.length ?? 0) > 0 || settings.hours.days.includes(0));
		const visibleEvents = days.flatMap((d) => byDay.get(d) ?? []);
		const bounds = timeBounds(settings, visibleEvents);
		let columns;
		const eventsByColumn = {};
		if (view === "day" && staffFilter === "all" && staff.length > 1) {
			const dayEvents = byDay.get(date) ?? [];
			columns = staff.map((s) => {
				const list = dayEvents.filter((a) => a.staffId === s.id);
				eventsByColumn[s.id] = list;
				const minutes = list.reduce((sum, a) => sum + minutesBetween(a.start, a.end), 0);
				return {
					key: s.id,
					date,
					staffId: s.id,
					isToday: date === today,
					header: (
						<span className="flex min-w-0 items-center gap-2">
							<Initials name={s.name} tone={s.color} size="sm" />
							<span className="min-w-0 text-left leading-tight">
								<span className="block truncate text-xs font-semibold">{s.name}</span>
								<span className="block text-2xs text-muted-foreground tabular-nums">{(minutes / 60).toLocaleString("ro-RO", { maximumFractionDigits: 1 })} h</span>
							</span>
						</span>
					),
				};
			});
			const unassigned = dayEvents.filter((a) => !a.staffId || !staffMap[a.staffId]?.active);
			if (unassigned.length) {
				eventsByColumn.none = unassigned;
				columns.push({ key: "none", date, staffId: null, isToday: date === today, muted: true, header: <span className="text-xs font-semibold text-muted-foreground">Nealocat</span> });
			}
		} else {
			columns = days.map((d) => {
				eventsByColumn[d] = byDay.get(d) ?? [];
				const isToday = d === today;
				return {
					key: d,
					date: d,
					staffId: staffFilter === "all" ? undefined : staffFilter,
					isToday,
					highlight: view === "week" && isToday,
					muted: !settings.hours.days.includes(parseISODate(d).getDay()),
					header: (
						<button type="button" onClick={() => { setDate(d); changeView("day"); }} className="flex items-center gap-1.5 text-xs">
							<span className="font-medium text-muted-foreground capitalize">{fmtDate(d, "EEE")}</span>
							<span className={cn("flex size-6 items-center justify-center rounded-full font-semibold tabular-nums", isToday && "bg-primary text-primary-foreground")}>
								{Number(d.slice(8))}
							</span>
						</button>
					),
				};
			});
		}
		body = (
			<TimeGrid
				key={`${view}-${date}-${staffFilter}`}
				columns={columns}
				eventsByColumn={eventsByColumn}
				bounds={bounds}
				toneOf={toneOf}
				badge={prefs.badge}
				lookups={lookups}
				onCreate={create}
				onOpen={open}
				onMove={move}
				minColumn={view === "week" ? 112 : 150}
				overlap={view === "week" ? "cascade" : "split"}
			/>
		);
	} else if (view === "month") {
		body = <MonthView date={date} today={today} byDay={byDay} toneOf={toneOf} badge={prefs.badge} onOpen={open} onPickDay={(d) => { setDate(d); changeView("day"); }} />;
	} else if (view === "year") {
		body = (
			<YearView
				date={date}
				today={today}
				byDay={byDay}
				onPickDay={(d) => {
					setDate(d);
					changeView("day");
				}}
				onPickMonth={(d) => {
					setDate(d);
					changeView("month");
				}}
			/>
		);
	} else {
		body = <AgendaView events={inRange} groupBy={prefs.agendaGroupBy} lookups={lookups} toneOf={toneOf} badge={prefs.badge} />;
	}

	const hiddenCount = hiddenStatuses.size;

	return (
		<div className="flex h-[calc(100dvh-3.5rem-var(--safe-top)-var(--tabbar-h)-var(--safe-bottom))] flex-col px-3 pt-3 pb-3 md:h-dvh md:px-6 md:pt-6 md:pb-6">
			<h1 className="sr-only">Programări</h1>
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
				<header className="flex flex-col gap-3 border-b p-3 md:p-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-center gap-3">
						<TodayTile today={today} onClick={() => setDate(today)} />
						<div className="min-w-0 space-y-1">
							<div className="flex items-center gap-2">
								<span className="text-lg font-semibold capitalize">{fmtDate(date, view === "year" ? "yyyy" : "MMMM yyyy")}</span>
								<ToneBadge tone="neutral" size="sm" className="rounded-full">
									{plural(count, "programare", "programări")}
								</ToneBadge>
							</div>
							<div className="flex items-center gap-1.5">
								<Button variant="outline" size="icon" className="size-11 md:size-7" onClick={() => setDate(navigate(view, date, "prev"))} aria-label="Înapoi">
									<ChevronLeft />
								</Button>
								<span className="min-w-0 truncate text-sm text-muted-foreground first-letter:uppercase">{rangeLabel(view === "agenda" ? "month" : view, date)}</span>
								<Button variant="outline" size="icon" className="size-11 md:size-7" onClick={() => setDate(navigate(view, date, "next"))} aria-label="Înainte">
									<ChevronRight />
								</Button>
							</div>
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Segmented value={view} onValueChange={changeView} options={VIEWS} collapse className="max-sm:flex-1 max-sm:justify-between" aria-label="Vizualizare" />
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" className="relative max-sm:px-2.5" aria-label="Filtre">
									<Filter />
									<span className="max-w-28 truncate max-sm:hidden">{staffFilter === "all" ? "Toți mecanicii" : staffMap[staffFilter]?.name}</span>
									{(hiddenCount > 1 || staffFilter !== "all") && <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-brand" />}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-60">
								{staff.length > 1 && (
									<>
										<DropdownMenuLabel className="text-xs text-muted-foreground">Mecanic</DropdownMenuLabel>
										<DropdownMenuRadioGroup value={staffFilter} onValueChange={setStaffFilter}>
											<DropdownMenuRadioItem value="all" onSelect={(e) => e.preventDefault()}>
												Toți mecanicii
											</DropdownMenuRadioItem>
											{staff.map((s) => (
												<DropdownMenuRadioItem key={s.id} value={s.id} onSelect={(e) => e.preventDefault()}>
													<Initials name={s.name} tone={s.color} size="sm" className="size-5" /> {s.name}
												</DropdownMenuRadioItem>
											))}
										</DropdownMenuRadioGroup>
										<DropdownMenuSeparator />
									</>
								)}
								<DropdownMenuLabel className="text-xs text-muted-foreground">Stare</DropdownMenuLabel>
								{Object.entries(APPOINTMENT_STATUS).map(([status, meta]) => (
									<DropdownMenuCheckboxItem
										key={status}
										checked={!hiddenStatuses.has(status)}
										onSelect={(e) => e.preventDefault()}
										onCheckedChange={(checked) =>
											setHiddenStatuses((prev) => {
												const next = new Set(prev);
												if (checked) next.delete(status);
												else next.add(status);
												return next;
											})
										}
									>
										<ToneDot tone={meta.tone} /> {meta.label}
									</DropdownMenuCheckboxItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" size="icon" aria-label="Setări calendar">
									<Settings2 />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-60">
								<DropdownMenuLabel className="text-xs text-muted-foreground">Colorează după</DropdownMenuLabel>
								<DropdownMenuRadioGroup value={prefs.colorBy} onValueChange={(colorBy) => setPref({ colorBy })}>
									<DropdownMenuRadioItem value="status">Stare</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="mechanic">Mecanic</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="service">Tip operațiune</DropdownMenuRadioItem>
								</DropdownMenuRadioGroup>
								<DropdownMenuSeparator />
								<DropdownMenuLabel className="text-xs text-muted-foreground">Stil</DropdownMenuLabel>
								<DropdownMenuRadioGroup value={prefs.badge} onValueChange={(badge) => setPref({ badge })}>
									<DropdownMenuRadioItem value="colored">Colorat</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="dot">Cu punct</DropdownMenuRadioItem>
								</DropdownMenuRadioGroup>
								<DropdownMenuSeparator />
								<DropdownMenuLabel className="text-xs text-muted-foreground">Agendă grupată după</DropdownMenuLabel>
								<DropdownMenuRadioGroup value={prefs.agendaGroupBy} onValueChange={(agendaGroupBy) => setPref({ agendaGroupBy })}>
									<DropdownMenuRadioItem value="date">Zi</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="mechanic">Mecanic</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="status">Stare</DropdownMenuRadioItem>
								</DropdownMenuRadioGroup>
								<DropdownMenuSeparator />
								<DropdownMenuCheckboxItem checked={prefs.confirmDrop} onSelect={(e) => e.preventDefault()} onCheckedChange={(confirmDrop) => setPref({ confirmDrop })}>
									Confirmă la mutare
								</DropdownMenuCheckboxItem>
							</DropdownMenuContent>
						</DropdownMenu>
						<Button onClick={() => create()} className="max-md:hidden">
							<CalendarPlus /> Programare nouă
						</Button>
					</div>
				</header>
				{body}
			</div>
		</div>
	);
}
